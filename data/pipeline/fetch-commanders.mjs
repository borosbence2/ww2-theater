// Fetch unit commanders from Wikidata (P598 "commander of") for every unit
// that carries a QID, with date qualifiers, into a committed intermediate
// keyed by QID:  data/curated/units/oob/commanders.json
// build-units.mjs attaches these to units lacking curated commanders.
//
// Run: node data/pipeline/fetch-commanders.mjs   (after build-units once, to
// have the QID list in the detail shards)

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DETAIL = 'public/data/units/detail';
const OUT = 'data/curated/units/oob/commanders.json';
const UA = 'ww2-theater-etl/0.1 (borosbence10@gmail.com)';
const ENDPOINT = 'https://query.wikidata.org/sparql';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Collect QIDs from the built detail shards.
const qids = new Set();
for (const f of readdirSync(DETAIL)) {
  const recs = JSON.parse(readFileSync(join(DETAIL, f), 'utf8'));
  for (const id in recs) {
    const q = recs[id].links?.wikidata;
    if (q) qids.add(q.replace(/^.*\//, ''));
  }
}
const all = [...qids];
console.log(`Querying commanders for ${all.length} unit QIDs…`);

const byQid = {}; // qid -> [{ name, from, to, link }]
const BATCH = 140;

async function runBatch(batch) {
  const values = batch.map((q) => `wd:${q}`).join(' ');
  const query = `SELECT ?unit ?personLabel ?start ?end ?article WHERE {
    VALUES ?unit { ${values} }
    ?person wdt:P598 ?unit.
    OPTIONAL { ?person p:P598 ?st. ?st ps:P598 ?unit. OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end } }
    OPTIONAL { ?article schema:about ?person; schema:isPartOf <https://en.wikipedia.org/> }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`;
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`SPARQL ${res.status}`);
  const data = await res.json();
  for (const b of data.results.bindings) {
    const qid = b.unit.value.replace(/^.*\//, '');
    const name = b.personLabel?.value;
    if (!name || /^Q\d+$/.test(name)) continue; // no English label
    const rec = {
      name,
      from: b.start?.value?.slice(0, 10) ?? null,
      to: b.end?.value?.slice(0, 10) ?? null,
      link: b.article?.value ?? null,
    };
    const list = (byQid[qid] = byQid[qid] ?? []);
    if (!list.some((c) => c.name === rec.name && c.from === rec.from)) list.push(rec);
  }
}

let done = 0;
for (let i = 0; i < all.length; i += BATCH) {
  const batch = all.slice(i, i + BATCH);
  for (let attempt = 0; ; attempt++) {
    try {
      await runBatch(batch);
      break;
    } catch (e) {
      if (attempt >= 2) {
        console.error(`  batch ${i} failed: ${e.message}`);
        break;
      }
      await sleep(3000);
    }
  }
  done += batch.length;
  console.log(`  ${done}/${all.length}`);
  await sleep(800);
}

// Sort each unit's commanders by start date (undated last), cap noise.
for (const qid in byQid) {
  byQid[qid].sort((a, b) => (a.from ?? '9999') < (b.from ?? '9999') ? -1 : 1);
}
const count = Object.values(byQid).reduce((n, l) => n + l.length, 0);
writeFileSync(OUT, JSON.stringify({ note: 'Unit commanders from Wikidata P598 (commander of), keyed by unit QID. Attached by build-units to units without curated commanders.', source: 'Wikidata (CC0)', commanders: byQid }, null, 1));
console.log(`Wrote ${Object.keys(byQid).length} units / ${count} commander records -> ${OUT}`);
