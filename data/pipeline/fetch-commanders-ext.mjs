// Enrich higher formations that carry no Wikidata QID — Soviet fronts + armies,
// German armies + army groups (text-derived scaffolds): resolve the QID by
// label search verified against Wikidata claims (country + type), then pull
// commanders (P598 "commander of"), the English description, and the Wikipedia
// article. Keyed by *unit id*, into a committed intermediate:
//   data/curated/units/oob/commanders-ext.json
// build-units.mjs attaches commanders + links/description to units without them.
//
// Run: node data/pipeline/fetch-commanders-ext.mjs   (after build-units once,
// to have index.json). Set SAMPLE=N to resolve only the first N (for testing).

import { readFileSync, writeFileSync } from 'node:fs';

const INDEX = 'public/data/units/index.json';
const OUT = 'data/curated/units/oob/commanders-ext.json';
const UA = 'ww2-theater-etl/0.1 (borosbence10@gmail.com)';
const WBSEARCH = 'https://www.wikidata.org/w/api.php';
const SPARQL = 'https://query.wikidata.org/sparql';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ordinal = (label) => (label.match(/^(\d+)(?:st|nd|rd|th)?/) ?? [])[1] ?? null;
// Geographic / role word that must also match for fronts (so "1st Belorussian"
// doesn't resolve to "1st Ukrainian").
const frontWord = (label) => (label.match(/\b(Belorussian|Ukrainian|Baltic|Karelian|Leningrad|Volkhov|Bryansk|Voronezh|Don|Stalingrad|Steppe|Kalinin|Western|Southwestern|Southern|Northern|Northwestern|Central|Reserve|Caucasus|Transcaucasus|Crimean|Far Eastern|Trans-Baikal)\b/) ?? [])[1] ?? null;

const USSR = 'Q15180'; // Soviet Union (P17 country) — the gold signal
const GERMANY = ['Q183', 'Q7318', 'Q1206012']; // Germany, Nazi Germany, German Reich
// Positive nationality signals (label/description/sitelink) when P17 is absent.
const SOVIET_SIG = /soviet|red army|rkka|\bussr\b/i;
const GERMAN_SIG = /german|wehrmacht|\bheer\b|nazi|heeresgruppe/i;
// Reject earlier-era homonyms (the WWI 8th Army, an Imperial 1st Army, …).
const WWI = /world war i\b|first world war|1914|1918|imperial|franco-prussian|napoleon/i;
const WWII = /world war ii|second world war|wehrmacht|soviet|red army|nazi|193\d|194\d/i;

async function wbsearch(term, lang) {
  const url = `${WBSEARCH}?action=wbsearchentities&search=${encodeURIComponent(term)}&language=${lang}&format=json&limit=10`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    return (await res.json()).search ?? [];
  } catch {
    return [];
  }
}

/** The unit's specialisation must match the candidate's, so "4. Armee" never
 *  resolves to "4. Panzerarmee" nor "5th Army" to "5th Tank/Guards Army". */
function typeOk(label, hay) {
  const need = (re) => re.test(hay);
  if (/tank|panzer/i.test(label) && !need(/tank|panzer/i)) return false;
  if (/guards/i.test(label) && !need(/guard/i)) return false;
  if (/shock/i.test(label) && !need(/shock|udarn/i)) return false;
  // A plain army must not grab a specialised one.
  const plain = /\barm(y|ee)\b/i.test(label) && !/tank|panzer|guard|shock|air|cavalry/i.test(label);
  if (plain && /tank|panzer|guard|shock|air army|cavalry/i.test(hay)) return false;
  return true;
}

function nationOk(side, hay, article, country) {
  if (side === 'soviet') {
    const ours = country.includes(USSR) || SOVIET_SIG.test(hay) || /soviet union/i.test(article);
    const other = country.some((c) => c && c !== USSR);
    return ours && !(other && !country.includes(USSR));
  }
  const ours = country.some((c) => GERMANY.includes(c)) || GERMAN_SIG.test(hay) || /wehrmacht|germany/i.test(article);
  const other = country.some((c) => c && !GERMANY.includes(c));
  return ours && !(other && !country.some((c) => GERMANY.includes(c)));
}

async function wbget(ids) {
  const url = `${WBSEARCH}?action=wbgetentities&ids=${ids.join('|')}&props=labels|descriptions|claims|sitelinks&languages=en&format=json`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    return (await res.json()).entities ?? {};
  } catch {
    return {};
  }
}

const claimIds = (e, p) => (e.claims?.[p] ?? []).map((s) => s.mainsnak?.datavalue?.value?.id).filter(Boolean);

/** Resolve a formation to {qid, description, wikipedia} via label search,
 *  verified against Wikidata claims (country + type + ordinal). */
async function resolve(label, echelon, side) {
  const lang = side === 'soviet' ? 'en' : 'de';
  const terms =
    side === 'soviet'
      ? echelon === 'front'
        ? [label, `${label} (Soviet Union)`]
        : [`${label} (Soviet Union)`, label]
      : [label, `${label} (Wehrmacht)`];
  const wantOrd = ordinal(label);
  const wantFront = echelon === 'front' ? frontWord(label) : null;

  const candIds = [];
  const seen = new Set();
  for (const term of terms) {
    for (const c of await wbsearch(term, lang)) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        candIds.push(c.id);
      }
    }
    await sleep(200);
    if (candIds.length >= 16) break;
  }
  if (!candIds.length) return null;

  const ents = await wbget(candIds);
  for (const id of candIds) {
    const e = ents[id];
    if (!e) continue;
    const lab = e.labels?.en?.value ?? e.labels?.de?.value ?? '';
    const desc = e.descriptions?.en?.value ?? e.descriptions?.de?.value ?? '';
    const article = e.sitelinks?.enwiki?.title ?? '';
    const hay = `${lab} ${desc} ${article}`;
    if (/disambiguation/i.test(desc)) continue;
    if (WWI.test(hay) && !WWII.test(hay)) continue; // earlier-era homonym
    if (wantOrd && ordinal(lab) && ordinal(lab) !== wantOrd) continue;
    if (wantFront && !new RegExp(wantFront, 'i').test(hay)) continue;
    if (!typeOk(label, hay)) continue;
    if (!nationOk(side, hay, article, claimIds(e, 'P17'))) continue;
    return {
      qid: id,
      description: desc,
      wikipedia: article ? `https://en.wikipedia.org/wiki/${encodeURIComponent(article.replace(/ /g, '_'))}` : null,
    };
  }
  return null;
}

/** Batch-fetch commanders (P598 inverse, with date qualifiers) for QIDs. */
async function fetchDetails(qids) {
  const out = {}; // qid -> { commanders: [...] }
  const BATCH = 60;
  for (let i = 0; i < qids.length; i += BATCH) {
    const values = qids.slice(i, i + BATCH).map((q) => `wd:${q}`).join(' ');
    const query = `SELECT ?unit ?p ?pLabel ?start ?end ?pArticle WHERE {
      VALUES ?unit { ${values} }
      ?p wdt:P598 ?unit.
      OPTIONAL { ?p p:P598 ?st. ?st ps:P598 ?unit. OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end } }
      OPTIONAL { ?pArticle schema:about ?p; schema:isPartOf <https://en.wikipedia.org/> }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`;
    let data;
    for (let a = 0; ; a++) {
      try {
        const res = await fetch(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' },
        });
        if (!res.ok) throw new Error(`SPARQL ${res.status}`);
        data = await res.json();
        break;
      } catch (e) {
        if (a >= 2) {
          console.error('  sparql batch failed:', e.message);
          data = { results: { bindings: [] } };
          break;
        }
        await sleep(3000);
      }
    }
    for (const b of data.results.bindings) {
      const qid = b.unit.value.replace(/^.*\//, '');
      const rec = (out[qid] = out[qid] ?? { commanders: [] });
      const name = b.pLabel?.value;
      if (name && !/^Q\d+$/.test(name)) {
        const c = {
          name,
          from: b.start?.value?.slice(0, 10) ?? null,
          to: b.end?.value?.slice(0, 10) ?? null,
          link: b.pArticle?.value ?? null,
        };
        if (!rec.commanders.some((x) => x.name === c.name && x.from === c.from)) rec.commanders.push(c);
      }
    }
    await sleep(800);
  }
  return out;
}

// --- main ------------------------------------------------------------------
const index = JSON.parse(readFileSync(INDEX, 'utf8')).units;
// Higher formations that lack a QID: Soviet fronts + armies, German armies +
// army groups. (Divisions/corps already carry QIDs from the importers.)
const ECHS = new Set(['front', 'army', 'army-group']);
let targets = index.filter((u) => ECHS.has(u.echelon));
if (process.env.SAMPLE) targets = targets.slice(0, Number(process.env.SAMPLE));
console.log(`Resolving ${targets.length} higher formations on Wikidata…`);

const resolved = {}; // unitId -> { qid, description, wikipedia }
let hit = 0;
for (const u of targets) {
  const r = await resolve(u.label, u.echelon, u.side);
  if (r) {
    resolved[u.id] = r;
    hit++;
    console.log(`  ✓ ${u.id}  ${u.label}  ->  ${r.qid}  (${r.description})`);
  } else {
    console.log(`  ✗ ${u.id}  ${u.label}  -> no match`);
  }
  await sleep(300);
}
console.log(`Resolved ${hit}/${targets.length}.`);

const qids = [...new Set(Object.values(resolved).map((r) => r.qid))];
const details = await fetchDetails(qids);

const unitsOut = {};
let cmdTotal = 0;
for (const [id, r] of Object.entries(resolved)) {
  const d = details[r.qid] ?? { commanders: [] };
  d.commanders.sort((a, b) => ((a.from ?? '9999') < (b.from ?? '9999') ? -1 : 1));
  unitsOut[id] = { qid: r.qid, description: r.description, wikipedia: r.wikipedia, commanders: d.commanders };
  cmdTotal += d.commanders.length;
}
writeFileSync(
  OUT,
  JSON.stringify(
    {
      note: 'Higher Soviet formations resolved to Wikidata by label; commanders (P598), description, and Wikipedia article. Keyed by unit id. Attached by build-units.',
      source: 'Wikidata (CC0)',
      units: unitsOut,
    },
    null,
    1,
  ),
);
console.log(`Wrote ${Object.keys(unitsOut).length} units / ${cmdTotal} commander records -> ${OUT}`);
