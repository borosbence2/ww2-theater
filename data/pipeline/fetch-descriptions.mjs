// Fetch a short historical description for every unit that has a Wikipedia
// article (links['wikipedia.en']), from the Wikipedia REST summary endpoint, into
//   data/curated/units/oob/descriptions.json   (keyed by unit id)
// build-units.mjs attaches it as `summary` (rendered prominently on the card).
// CC BY-SA 3.0 — attributed via the existing Wikipedia link on the unit card.
//
// Run: node data/pipeline/fetch-descriptions.mjs   (after build-units once, so
// the higher formations already carry their resolved Wikipedia links).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DETAIL = 'public/data/units/detail';
const OUT = 'data/curated/units/oob/descriptions.json';
const UA = 'ww2-theater-etl/0.1 (borosbence10@gmail.com)';
const REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const MAX = 700; // cap a description to a couple of sentences
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resume across runs: keep already-fetched descriptions.
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).descriptions ?? {} : {};

// Collect unit id -> Wikipedia article title from the built detail shards.
const titles = new Map();
for (const f of readdirSync(DETAIL)) {
  const recs = JSON.parse(readFileSync(join(DETAIL, f), 'utf8'));
  for (const id in recs) {
    const url = recs[id].links?.['wikipedia.en'];
    if (!url) continue;
    const title = decodeURIComponent(url.replace(/^.*\/wiki\//, ''));
    if (title) titles.set(id, title);
  }
}
const ids = [...titles.keys()];
console.log(`Fetching descriptions for ${ids.length} units with a Wikipedia article…`);

function trim(extract) {
  if (!extract) return null;
  let s = extract.replace(/\s+/g, ' ').trim();
  if (s.length <= MAX) return s;
  // Cut at the last sentence boundary within the cap.
  const cut = s.slice(0, MAX);
  const dot = cut.lastIndexOf('. ');
  return (dot > 200 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '')) + ' …';
}

const out = {};
let fetched = 0;
let reused = 0;
let done = 0;
for (const id of ids) {
  const title = titles.get(id);
  if (prev[id]?.title === title && prev[id]?.summary) {
    out[id] = prev[id];
    reused++;
  } else {
    let summary = null;
    for (let a = 0; a < 3; a++) {
      try {
        const res = await fetch(REST + encodeURIComponent(title.replace(/ /g, '_')), {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
        });
        if (res.ok) {
          const j = await res.json();
          if (j.type !== 'disambiguation') summary = trim(j.extract);
          break;
        }
        if (res.status === 404) break;
      } catch {
        await sleep(1500);
      }
    }
    if (summary) out[id] = { title, summary };
    fetched++;
    await sleep(120);
  }
  if (++done % 200 === 0) console.log(`  ${done}/${ids.length} (fetched ${fetched}, reused ${reused})`);
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      note: 'Short unit descriptions from the English Wikipedia REST summary endpoint, keyed by unit id. Attached by build-units as `summary`.',
      source: 'Wikipedia (CC BY-SA 3.0)',
      descriptions: out,
    },
    null,
    1,
  ),
);
console.log(`Wrote ${Object.keys(out).length} descriptions (${fetched} fetched, ${reused} reused) -> ${OUT}`);
