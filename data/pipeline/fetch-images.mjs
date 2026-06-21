// Unit imagery manifest (Phase 5b). For every unit that carries a Wikidata QID,
// fetch its image (P18), resolve a Wikimedia Commons THUMBNAIL url at a small
// fixed width, and record the license + author for attribution. We never bundle
// or self-host images — the panel <img> points straight at the Commons CDN
// thumbnail, lazy-loaded. Free licenses only (CC / public domain).
//
// Two-pass, like the commander/description enrichment: run build-units once so
// the detail shards carry links.wikidata, run this, then build-units again to
// attach. Resumable — re-runs only fetch QIDs not already in the manifest
// (set FORCE=1 to refetch all).
//
// Output: data/curated/units/oob/images.json   (committed)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DETAIL_DIR = 'public/data/units/detail';
const OUT = 'data/curated/units/oob/images.json';
const THUMB_W = 240; // small responsive thumbnail width
const UA = 'ww2-theater-etl/0.1 (Eastern Front atlas; unit image manifest)';
const FORCE = process.env.FORCE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET JSON with a UA, retrying on rate-limit / transient failures (no origin=*
 *  — that flags anonymous CORS and gets throttled hard from a script). */
async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) return await r.json();
      if (r.status === 429 || r.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error('unreachable');
}

// --- collect id -> QID from the built detail shards ---
const qidOf = new Map();
for (let i = 0; i < 16; i++) {
  const f = join(DETAIL_DIR, `${String(i).padStart(2, '0')}.json`);
  if (!existsSync(f)) continue;
  const shard = JSON.parse(readFileSync(f, 'utf8'));
  for (const [id, u] of Object.entries(shard)) {
    const q = u.links?.wikidata;
    if (q && /^Q\d+$/.test(q)) qidOf.set(id, q);
  }
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).images ?? {} : {};
const images = { ...prev };

// Which ids still need a lookup (skip ones already resolved, unless FORCE).
const todo = [...qidOf].filter(([id]) => FORCE || !(id in prev));
console.log(`${qidOf.size} units with a QID; ${todo.length} to look up (${Object.keys(prev).length} cached).`);

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const stripHtml = (s) => (s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
const freeLicense = (lic) => /cc[ -]|public domain|pd[ -]|no restrictions|cc0/i.test(lic ?? '') && !/fair use|non-free/i.test(lic ?? '');

// --- pass 1: QID -> P18 filename (Wikidata wbgetentities, 50 ids/call) ---
const fileOf = new Map(); // id -> Commons filename
let p18 = 0;
for (const batch of chunk(todo, 50)) {
  const ids = batch.map(([, q]) => q).join('|');
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims&format=json`;
  try {
    const j = await getJson(url);
    for (const [id, q] of batch) {
      const claim = j.entities?.[q]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (claim) {
        fileOf.set(id, claim);
        p18++;
      } else {
        images[id] = null; // no image — remember so we don't re-query
      }
    }
  } catch (e) {
    console.warn('wbgetentities batch failed:', e.message);
  }
  await sleep(800);
}
console.log(`P18 images for ${p18} units; resolving Commons thumbnails…`);

// --- pass 2: filename -> thumbnail url + license/author (Commons imageinfo) ---
const entries = [...fileOf]; // [id, filename]
let kept = 0;
let nonfree = 0;
for (const batch of chunk(entries, 40)) {
  const titles = batch.map(([, f]) => `File:${f}`).join('|');
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
    `&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${THUMB_W}`;
  try {
    const j = await getJson(url);
    const pages = Object.values(j.query?.pages ?? {});
    const byTitle = new Map(pages.map((p) => [p.title, p]));
    for (const [id, f] of batch) {
      const page = byTitle.get(`File:${f}`);
      const ii = page?.imageinfo?.[0];
      if (!ii?.thumburl) {
        images[id] = null;
        continue;
      }
      const meta = ii.extmetadata ?? {};
      const license = stripHtml(meta.LicenseShortName?.value) || 'unknown';
      if (!freeLicense(license)) {
        images[id] = null;
        nonfree++;
        continue;
      }
      images[id] = {
        file: f,
        thumb: ii.thumburl,
        w: ii.thumbwidth ?? THUMB_W,
        h: ii.thumbheight ?? null,
        license,
        artist: stripHtml(meta.Artist?.value) || null,
      };
      kept++;
    }
  } catch (e) {
    console.warn('imageinfo batch failed:', e.message);
  }
  await sleep(800);
}

const out = {
  note:
    'Unit image manifest (Phase 5b) — Wikidata P18 -> Commons thumbnail url + license, keyed by unit id. ' +
    'Free licenses only (CC / public domain); license + author stored for attribution. The panel <img> points ' +
    'at the Commons CDN thumbnail (never bundled), lazy-loaded. Generated by fetch-images.mjs; null = checked, no free image.',
  images,
};
writeFileSync(OUT, JSON.stringify(out, null, 1));
const have = Object.values(images).filter(Boolean).length;
console.log(`Wrote ${OUT}: ${have} units with a free Commons image (+${kept} new, ${nonfree} skipped non-free).`);
