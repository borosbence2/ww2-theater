// Battles ETL (Phase 2): Wikidata battles/sieges/operations -> dated battle
// markers. Raw input is a SPARQL result fetched into data/raw/ (gitignored);
// re-fetch with the curl in the README. Items: P31/P279* in {battle, siege,
// military operation}, started 1938-1945, with coordinates.
//
// Input : data/raw/wikidata-ww2-battles.json
// Output: public/data/battles/battles.json
//
// Run: node data/pipeline/build-battles.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { addDays, dateNum } from './lib/dates.mjs';

const IN = 'data/raw/wikidata-ww2-battles.json';
const OUT_DIR = 'public/data/battles';
const OUT = `${OUT_DIR}/battles.json`;

// European theater bbox (generous: includes Finland, Caucasus approaches,
// the Mediterranean coast).
const LON = [-12, 55];
const LAT = [29, 72];
const WINDOW = [dateNum('1938-01-01'), dateNum('1945-09-02')];
/** Days a marker lingers (faded) after the battle ends, so captures read. */
const LINGER_DAYS = 3;

const raw = JSON.parse(readFileSync(IN, 'utf8'));

const battles = new Map();
let droppedGeo = 0;
let droppedDate = 0;
let droppedLabel = 0;

for (const row of raw.results.bindings) {
  const qid = row.item.value.split('/').pop();
  const name = row.itemLabel?.value ?? qid;
  if (/^Q\d+$/.test(name)) {
    droppedLabel++;
    continue; // no English label
  }
  const m = row.coord.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
  if (!m) continue;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  if (lon < LON[0] || lon > LON[1] || lat < LAT[0] || lat > LAT[1]) {
    droppedGeo++;
    continue;
  }
  const start = row.start.value.slice(0, 10);
  let end = row.end?.value.slice(0, 10) ?? start;
  if (dateNum(end) < dateNum(start)) end = start;
  if (dateNum(start) < WINDOW[0] || dateNum(start) > WINDOW[1]) {
    droppedDate++;
    continue;
  }

  const existing = battles.get(qid);
  const wiki = row.article?.value ?? existing?.wiki ?? null;
  battles.set(qid, {
    id: qid,
    name,
    lon: Number(lon.toFixed(3)),
    lat: Number(lat.toFixed(3)),
    start,
    end,
    startNum: dateNum(start),
    endNum: dateNum(end),
    lingerNum: dateNum(addDays(end, LINGER_DAYS)),
    wiki,
  });
}

const out = [...battles.values()].sort((a, b) => a.startNum - b.startNum || a.id.localeCompare(b.id));
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify({ source: 'Wikidata (CC0)', battles: out }));
console.log(
  `Wrote ${out.length} battles -> ${OUT} ` +
    `(dropped: ${droppedGeo} outside theater, ${droppedDate} outside window, ${droppedLabel} unlabeled)`,
);
