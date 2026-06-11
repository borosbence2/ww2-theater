// Fetch the monthly Boevoi sostav Sovetskoi Armii transcription pages
// (teatrskazka.com) via the Wayback Machine into data/raw/bs/ (gitignored).
// The live site rejects non-browser clients; archive.org serves clean static
// HTML (cp1251). Throttled and cached: existing files are skipped, so re-runs
// only fetch gaps.
//
// Run: node data/pipeline/fetch-bs.mjs

import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';

const OUT_DIR = 'data/raw/bs';
mkdirSync(OUT_DIR, { recursive: true });

const dates = ['19410622'];
for (let y = 1941; y <= 1945; y++) {
  for (let m = 1; m <= 12; m++) {
    if (y === 1941 && m < 7) continue;
    if (y === 1945 && m > 5) continue;
    dates.push(`${y}${String(m).padStart(2, '0')}01`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0;
let cached = 0;
const misses = [];
for (const d of dates) {
  const out = `${OUT_DIR}/${d}.html`;
  if (existsSync(out) && statSync(out).size > 20_000) {
    cached++;
    continue;
  }
  const url = `https://web.archive.org/web/2023id_/http://www.teatrskazka.com/Raznoe/BoevojSostavSA/${d.slice(0, 4)}/${d}.html`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.ok && buf.length > 20_000) {
      writeFileSync(out, buf);
      ok++;
      console.log(`  ${d}: ${(buf.length / 1024).toFixed(0)} KB`);
    } else {
      misses.push(`${d} (${res.status}, ${buf.length} B)`);
    }
  } catch (e) {
    misses.push(`${d} (${e.message})`);
  }
  await sleep(1500);
}

console.log(`Fetched ${ok}, cached ${cached}, missing ${misses.length}`);
if (misses.length) console.log('Missing: ' + misses.join(', '));
