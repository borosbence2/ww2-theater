// Unit ETL (Phase 1): curated unit files -> search index + map tracks + per-
// unit detail files. Validates hard contracts (schema, referential integrity,
// position ordering) and runs the UNIT-vs-FRONT side check: every positioned
// unit, every day, must sit on its own side of the interpolated front.
// Pockets override (an encircled Axis unit inside an Axis pocket is valid);
// mismatches within the contested-zone tolerance are listed as info, beyond
// it they are the curation worklist — same philosophy as the city loop in
// build-fronts.mjs.
//
// Input : data/curated/units/{country}/*.json, data/curated/units/sources.json
//         data/curated/units/imported-divisions.json (optional scaffolds)
//         public/data/front/eastern-keyframes.json  (run build-fronts first)
// Output: public/data/units/index.json
//         public/data/units/tracks/eastern.json
//         public/data/units/detail/{00..15}.json  (sharded by id hash — one
//         file per unit does not scale past ~1k units: git noise, request
//         storms, and Vite's public-file cache silently drops the overflow)
//
// Run: node data/pipeline/build-units.mjs

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { OPEN_END, addDays, dateNum, diffDays } from './lib/dates.mjs';
import { axisPolygon, inRing, kmFromFront } from './lib/geometry.mjs';
import { coordsFor } from './lib/interpolate.mjs';

const UNITS_DIR = 'data/curated/units';
const FRONT = 'public/data/front/eastern-keyframes.json';
const OUT_DIR = 'public/data/units';

const ECHELONS = ['army-group', 'front', 'army', 'corps', 'division', 'brigade', 'regiment', 'battalion'];
const TYPES = ['infantry', 'armoured', 'motorized', 'cavalry', 'artillery', 'hq'];
const CONFIDENCES = ['documented', 'inferred', 'approximate'];
const MOVES = ['march', 'rail', 'sea', 'air', 'gap'];
const AXIS_COUNTRIES = new Set(['DE', 'RO', 'HU', 'IT', 'FI']);
/** km/day plausibility caps per arrival move type. */
const SPEED_LIMIT = { march: 60, rail: 800, sea: 500, air: 2000, gap: Infinity };
/** Contested-zone tolerance (km): fronts are schematic. */
const TOL_LINE = 25;
const TOL_POCKET = 30;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const errors = [];
const warnings = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const warn = (id, msg) => warnings.push(`${id}: ${msg}`);

// ---------------------------------------------------------------------------
// Load + validate curated files

const sourcesReg = JSON.parse(readFileSync(join(UNITS_DIR, 'sources.json'), 'utf8')).sources;

const units = new Map();
for (const dir of readdirSync(UNITS_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const file of readdirSync(join(UNITS_DIR, dir.name))) {
    if (!file.endsWith('.json')) continue;
    const u = JSON.parse(readFileSync(join(UNITS_DIR, dir.name, file), 'utf8'));
    if (`${u.id}.json` !== file) err(file, `id "${u.id}" does not match filename`);
    if (units.has(u.id)) err(u.id, 'duplicate id');
    units.set(u.id, u);
  }
}

// Imported scaffolds (import-divisions.mjs): identity-only, curated files win.
let importedCount = 0;
try {
  const imported = JSON.parse(readFileSync(join(UNITS_DIR, 'imported-divisions.json'), 'utf8'));
  for (const u of imported.units) {
    if (units.has(u.id)) continue;
    // Defensive: a same-day inception/dissolution would violate the interval
    // contract; treat it as an open end.
    for (const e of u.existence ?? []) {
      if (e.to && e.to <= e.from) delete e.to;
    }
    units.set(u.id, u);
    importedCount++;
  }
} catch {
  console.log('No imported-divisions.json — building from curated files only.');
}

for (const u of units.values()) {
  const id = u.id;
  if (!ECHELONS.includes(u.echelon)) err(id, `bad echelon "${u.echelon}"`);
  if (!TYPES.includes(u.type)) err(id, `bad type "${u.type}"`);
  if (!u.short) err(id, 'missing short label');
  if (!u.names?.length) err(id, 'missing names');
  if (!u.existence?.length) err(id, 'missing existence');
  for (const n of u.names ?? []) if (!ISO.test(n.from) || !n.name) err(id, `bad names entry ${JSON.stringify(n)}`);
  for (const e of u.existence ?? []) {
    if (!ISO.test(e.from) || (e.to && !ISO.test(e.to))) err(id, `bad existence entry ${JSON.stringify(e)}`);
    if (e.to && dateNum(e.to) <= dateNum(e.from)) err(id, `existence to <= from`);
  }
  u.side = u.side ?? (AXIS_COUNTRIES.has(u.country) ? 'axis' : u.country === 'SU' ? 'soviet' : null);
  if (!u.side) err(id, `cannot derive side for country "${u.country}"`);

  for (const p of u.parents ?? []) {
    if (!units.has(p.unit)) err(id, `unknown parent "${p.unit}"`);
    else if (p.unit === id) err(id, 'unit is its own parent');
    if (!ISO.test(p.from) || (p.to && !ISO.test(p.to))) err(id, `bad parent interval ${JSON.stringify(p)}`);
  }

  for (const c of u.commanders ?? []) {
    if (!c.name || !ISO.test(c.from) || (c.to && !ISO.test(c.to))) {
      err(id, `bad commander entry ${JSON.stringify(c)}`);
    }
  }

  const existFrom = dateNum(u.existence[0].from);
  const existTo = u.existence[u.existence.length - 1].to
    ? dateNum(u.existence[u.existence.length - 1].to)
    : OPEN_END;
  u._existFrom = existFrom;
  u._existTo = existTo;
  u._trackTo = u.positionsTo ? Math.min(dateNum(u.positionsTo), existTo) : existTo;
  if (u.positionsTo && !ISO.test(u.positionsTo)) err(id, 'bad positionsTo');

  let prev = null;
  for (const pos of u.positions ?? []) {
    if (!ISO.test(pos.date)) err(id, `bad position date "${pos.date}"`);
    const [lon, lat] = pos.at ?? [];
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -25 || lon > 65 || lat < 30 || lat > 75) {
      err(id, `position ${pos.date} out of bounds: ${JSON.stringify(pos.at)}`);
    }
    if (pos.confidence && !CONFIDENCES.includes(pos.confidence)) err(id, `bad confidence at ${pos.date}`);
    if (pos.move && !MOVES.includes(pos.move)) err(id, `bad move at ${pos.date}`);
    if (pos.source && !sourcesReg[pos.source]) warn(id, `unknown source "${pos.source}" at ${pos.date}`);
    if (!pos.source) warn(id, `uncited position at ${pos.date}`);
    const d = dateNum(pos.date);
    if (d < existFrom || d >= u._existTo) err(id, `position ${pos.date} outside existence`);
    if (prev) {
      if (d <= prev.d) err(id, `positions not strictly ascending at ${pos.date}`);
      const km = kmFromFront([prev.at, prev.at], lon, lat); // point-to-point via degenerate segment
      const days = Math.max(1, diffDays(prev.date, pos.date));
      const limit = SPEED_LIMIT[pos.move ?? 'march'];
      if (km / days > limit) {
        warn(id, `${(km / days).toFixed(0)} km/day ${prev.date} -> ${pos.date} exceeds ${pos.move ?? 'march'} limit ${limit}`);
      }
    }
    prev = { d, at: pos.at, date: pos.date };
  }
}

// Children: reverse of parents.
const childrenOf = new Map();
for (const u of units.values()) {
  for (const p of u.parents ?? []) {
    if (!childrenOf.has(p.unit)) childrenOf.set(p.unit, []);
    childrenOf.get(p.unit).push({ from: p.from, to: p.to ?? null, unit: u.id });
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} hard error(s):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Position interpolation with hold-then-jump for non-march segments
// (mirrored by src/layers/units.ts — keep in sync)

function positionOn(u, iso) {
  const kfs = u.positions;
  const d = dateNum(iso);
  if (!kfs.length || d < dateNum(kfs[0].date) || d >= u._trackTo) return null;
  if (d >= dateNum(kfs[kfs.length - 1].date)) return kfs[kfs.length - 1].at;
  let i = 0;
  while (i < kfs.length - 1 && dateNum(kfs[i + 1].date) <= d) i++;
  const k0 = kfs[i];
  const k1 = kfs[i + 1];
  if ((k1.move ?? 'march') !== 'march') return k0.at; // hold, jump on k1.date
  const span = diffDays(k0.date, k1.date);
  const t = span > 0 ? diffDays(k0.date, iso) / span : 0;
  return [k0.at[0] + (k1.at[0] - k0.at[0]) * t, k0.at[1] + (k1.at[1] - k0.at[1]) * t];
}

// ---------------------------------------------------------------------------
// Side validation against the interpolated front

const front = JSON.parse(readFileSync(FRONT, 'utf8'));
const main = front.features.find((f) => f.kind === 'front');
const pockets = front.features.filter((f) => f.closed);
const VAL_START = main.keyframes[0].date;
const VAL_END = main.to ?? main.keyframes[main.keyframes.length - 1].date;

const positioned = [...units.values()].filter((u) => u.positions?.length);
console.log(`Validating ${positioned.length} positioned units vs front, ${VAL_START} -> ${VAL_END} ...`);

const runs = new Map(); // unit -> merged mismatch runs
let contestedDays = 0;
let mismatchDays = 0;
const totalDays = diffDays(VAL_START, VAL_END);

for (let n = 0; n <= totalDays; n++) {
  const iso = addDays(VAL_START, n);
  const line = coordsFor(main, iso);
  if (!line) continue;
  const lats = line.map((c) => c[1]);
  const latMin = Math.min(...lats) - 0.5;
  const latMax = Math.max(...lats) + 0.5;
  const axisPoly = axisPolygon(line);
  const activePockets = pockets
    .map((f) => ({ f, ring: coordsFor(f, iso) }))
    .filter((p) => p.ring && p.ring.length > 2);

  for (const u of positioned) {
    const at = positionOn(u, iso);
    if (!at) continue;
    const [lon, lat] = at;
    if (lat < latMin || lat > latMax) continue;

    let drawn = null;
    let tol = TOL_LINE;
    for (const { f, ring } of activePockets) {
      if (inRing(ring, lon, lat)) {
        drawn = { side: f.encircled, km: kmFromFront([...ring, ring[0]], lon, lat) };
        tol = TOL_POCKET;
        break;
      }
    }
    if (!drawn) drawn = { side: inRing(axisPoly, lon, lat) ? 'axis' : 'soviet', km: kmFromFront(line, lon, lat) };
    if (drawn.side === u.side) continue;

    // A unit just outside a pocket ring is contested-by-the-ring, not wrong by
    // its (large) distance to the distant main line.
    let nearestRingKm = Infinity;
    for (const { ring } of activePockets) {
      nearestRingKm = Math.min(nearestRingKm, kmFromFront([...ring, ring[0]], lon, lat));
    }
    if (drawn.km <= tol || nearestRingKm <= TOL_POCKET) {
      contestedDays++;
      continue;
    }
    mismatchDays++;
    let list = runs.get(u.id);
    if (!list) runs.set(u.id, (list = []));
    const last = list[list.length - 1];
    if (last && last.to === addDays(iso, -1) && last.got === drawn.side) {
      last.to = iso;
      last.maxKm = Math.max(last.maxKm, drawn.km);
    } else {
      list.push({ from: iso, to: iso, got: drawn.side, expected: u.side, maxKm: drawn.km });
    }
  }
}

for (const w of warnings) console.log(`  ⚠ ${w}`);
if (!runs.size) {
  console.log(`All units on their documented side every day (${contestedDays} contested unit-days within tolerance). ✔`);
} else {
  console.log(`Unit-vs-front worklist (${contestedDays} contested unit-days within tolerance not listed):`);
  for (const [id, list] of [...runs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const r of list) {
      const days = diffDays(r.from, r.to) + 1;
      console.log(
        `  ✗ ${id}: drawn ${r.got}, unit is ${r.expected} — ${r.from}..${r.to} (${days}d, ≤${r.maxKm.toFixed(0)} km)`,
      );
    }
  }
  console.log(`${runs.size} unit(s), ${mismatchDays} unit-days beyond tolerance. Densify front keyframes or fix unit tracks.`);
}

// ---------------------------------------------------------------------------
// Emit artifacts

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(join(OUT_DIR, 'tracks'), { recursive: true });
mkdirSync(join(OUT_DIR, 'detail'), { recursive: true });

/** djb2 % 16 — mirrored by src/data/units.ts (keep in sync). */
const SHARDS = 16;
function shardOf(id) {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  return (h % SHARDS).toString().padStart(2, '0');
}

const latestName = (u) => u.names[u.names.length - 1].name;
const labelOf = (id) => (units.has(id) ? latestName(units.get(id)) : id);

const index = [...units.values()]
  .map((u) => ({
    id: u.id,
    label: latestName(u),
    aliases: u.names.flatMap((n) => [n.name, ...(n.aliases ?? [])]).filter((a) => a !== latestName(u)),
    country: u.country,
    side: u.side,
    echelon: u.echelon,
    type: u.type,
    from: u.existence[0].from,
    to: u.existence[u.existence.length - 1].to ?? null,
    hasPositions: Boolean(u.positions?.length),
  }))
  .sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify({ units: index }));

const tracks = positioned
  .map((u) => ({
    id: u.id,
    short: u.short,
    side: u.side,
    echelon: u.echelon,
    type: u.type,
    // Sub-division units render only when a related unit is selected.
    parentIds: [...new Set((u.parents ?? []).map((p) => p.unit))],
    trackTo: u._trackTo,
    keyframes: u.positions.map((p) => ({
      date: p.date,
      start: dateNum(p.date),
      at: p.at,
      confidence: p.confidence ?? 'approximate',
      move: p.move ?? 'march',
    })),
  }))
  .sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(join(OUT_DIR, 'tracks', 'eastern.json'), JSON.stringify({ units: tracks }));

const shards = new Map();
for (const u of units.values()) {
  const usedSources = [...new Set((u.positions ?? []).map((p) => p.source).filter(Boolean))];
  const detail = {
    id: u.id,
    country: u.country,
    side: u.side,
    branch: u.branch,
    echelon: u.echelon,
    type: u.type,
    short: u.short,
    names: u.names,
    existence: u.existence,
    parents: (u.parents ?? []).map((p) => ({ ...p, to: p.to ?? null, label: labelOf(p.unit) })),
    children: (childrenOf.get(u.id) ?? []).map((c) => ({ ...c, label: labelOf(c.unit) })),
    commanders: (u.commanders ?? []).map((c) => ({ ...c, to: c.to ?? null })),
    positions: (u.positions ?? []).map((p) => ({ ...p, confidence: p.confidence ?? 'approximate' })),
    positionsTo: u.positionsTo ?? null,
    links: u.links ?? {},
    sources: usedSources.map((s) => ({ id: s, ...(sourcesReg[s] ?? {}) })),
    notes: u.notes ?? null,
  };
  const shard = shardOf(u.id);
  if (!shards.has(shard)) shards.set(shard, {});
  shards.get(shard)[u.id] = detail;
}
for (const [shard, records] of shards) {
  writeFileSync(join(OUT_DIR, 'detail', `${shard}.json`), JSON.stringify(records));
}

console.log(
  `Wrote ${index.length} units (${tracks.length} with tracks, ${importedCount} imported scaffolds) ` +
    `-> ${OUT_DIR}/ (index, tracks/eastern, ${shards.size} detail shards)`,
);
