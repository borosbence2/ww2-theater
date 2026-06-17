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
  if (!dir.isDirectory() || dir.name === 'oob' || dir.name === 'registry') continue;
  for (const file of readdirSync(join(UNITS_DIR, dir.name))) {
    if (!file.endsWith('.json')) continue;
    const u = JSON.parse(readFileSync(join(UNITS_DIR, dir.name, file), 'utf8'));
    if (`${u.id}.json` !== file) err(file, `id "${u.id}" does not match filename`);
    if (units.has(u.id)) err(u.id, 'duplicate id');
    units.set(u.id, u);
  }
}

// OOB skeletons (import-bs.mjs): fronts/armies/divisions discovered in the
// monthly Boevoi sostav listings. Loaded before the Wikidata scaffolds so the
// better (Russian-sourced) identity wins on id collisions.
let oob = null;
try {
  oob = JSON.parse(readFileSync(join(UNITS_DIR, 'oob', 'su-monthly.json'), 'utf8'));
  for (const u of oob.units) {
    if (!units.has(u.id)) units.set(u.id, u);
  }
} catch {
  console.log('No oob/su-monthly.json — skipping OOB merge and derivation.');
}

// German OOB (import-ldw.mjs): per-division army-assignment events.
let deOob = null;
try {
  deOob = JSON.parse(readFileSync(join(UNITS_DIR, 'oob', 'de-monthly.json'), 'utf8'));
  for (const u of deOob.created ?? []) {
    if (!units.has(u.id)) units.set(u.id, u);
  }
  for (const { id, name } of deOob.armeeabteilungen ?? []) {
    if (units.has(id)) continue;
    units.set(id, {
      id,
      country: 'DE',
      branch: 'heer',
      echelon: 'army',
      type: 'hq',
      short: name.replace('Armeeabteilung', 'A.Abt.'),
      names: [{ from: '1939-09-01', name, aliases: [name.replace('Armeeabteilung', 'Army Detachment')] }],
      existence: [{ from: '1939-09-01' }],
      parents: [],
      positions: [],
      links: {},
      notes: 'Army-level detachment (Armeeabteilung) discovered in Lexikon der Wehrmacht Unterstellung tables; no authored sector yet (subordination only). Lifecycle dates coarse.',
    });
  }
  for (const { id, n } of deOob.armies) {
    if (units.has(id)) continue;
    units.set(id, {
      id,
      country: 'DE',
      branch: 'heer',
      echelon: 'army',
      type: 'hq',
      short: `${n}. Armee`,
      names: [{ from: '1939-09-01', name: `${n}. Armee`, aliases: [`${n}th Army`, `AOK ${n}`] }],
      existence: [{ from: '1939-09-01' }],
      parents: [],
      positions: [],
      links: {},
      notes: 'OOB scaffold discovered in Lexikon der Wehrmacht Unterstellung tables.',
    });
  }
  for (const { id, name, en } of deOob.armyGroups ?? []) {
    if (units.has(id)) continue; // de-h-hgr-b is curated
    units.set(id, {
      id,
      country: 'DE',
      branch: 'heer',
      echelon: 'army-group',
      type: 'hq',
      short: name.replace('Heeresgruppe', 'HGr'),
      names: [{ from: '1939-09-01', name, aliases: [en] }],
      existence: [{ from: '1939-09-01' }],
      parents: [],
      positions: [],
      links: {},
      notes: 'Army group from Lexikon der Wehrmacht Unterstellung tables; position derived from its armies. Lifecycle dates coarse.',
    });
  }
} catch {
  console.log('No oob/de-monthly.json — German divisions stay scaffold-only.');
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

// ---------------------------------------------------------------------------
// Reconciliation registry (SCALE_PLAN §4): fold curated `merge` duplicates
// into their canonical id (names → aliases) and redirect every reference, so
// search/derivation see one unit. Validate `incarnations` (formation ordinals).
const redirect = new Map(); // dupe id -> canonical id
const formationsOf = new Map(); // unit id -> { designation, list } (formation ordinals)
for (const cc of ['de', 'su', 'ro', 'hu', 'it']) {
  let reg;
  try {
    reg = JSON.parse(readFileSync(join(UNITS_DIR, 'registry', `${cc}.json`), 'utf8'));
  } catch {
    continue;
  }
  for (const [canonical, dupes] of Object.entries(reg.merge ?? {})) {
    const canon = units.get(canonical);
    if (!canon) {
      warn('registry', `merge canonical "${canonical}" not found`);
      continue;
    }
    const names = canon.names[canon.names.length - 1];
    for (const dupeId of dupes) {
      redirect.set(dupeId, canonical);
      const dupe = units.get(dupeId);
      if (dupe) {
        names.aliases = [
          ...new Set([
            ...(names.aliases ?? []),
            ...dupe.names.flatMap((n) => [n.name, ...(n.aliases ?? [])]),
          ]),
        ];
        units.delete(dupeId);
      }
    }
  }
  for (const [desig, incs] of Object.entries(reg.incarnations ?? {})) {
    // Full ordered formation history; entries without an `id` are re-formations
    // not separately modelled (annotation only). `fate` ends a formation; `note`
    // describes its origin.
    const list = incs.map((inc, i) => {
      if (inc.from && !ISO.test(inc.from)) err('registry', `incarnation "${desig}" bad from ${inc.from}`);
      if (inc.to && !ISO.test(inc.to)) err('registry', `incarnation "${desig}" bad to ${inc.to}`);
      return {
        ordinal: inc.ordinal ?? i + 1,
        from: inc.from ?? null,
        to: inc.to ?? null,
        fate: inc.fate ?? null,
        note: inc.note ?? null,
        id: inc.id ?? null,
      };
    });
    const anchored = incs.filter((inc) => inc.id);
    if (!anchored.length) warn('registry', `incarnation "${desig}" has no entry with an id — orphaned`);
    // Attach the shared history to every separately-modelled incarnation; mark
    // which entry IS this unit so the panel can highlight it.
    for (const inc of anchored) {
      if (!units.has(inc.id)) {
        err('registry', `incarnation "${desig}" → missing unit ${inc.id}`);
        continue;
      }
      formationsOf.set(inc.id, {
        designation: desig,
        list: list.map((e) => ({ ...e, self: e.id === inc.id })),
      });
    }
  }
}
const canon = (id) => redirect.get(id) ?? id;
if (redirect.size) {
  // Redirect references: curated parents, and the OOB structures consumed below.
  for (const u of units.values()) {
    for (const p of u.parents ?? []) p.unit = canon(p.unit);
  }
  if (oob) {
    for (const m of oob.months) {
      for (const e of m.entries) {
        if (e.army) e.army = canon(e.army);
        e.divisions = e.divisions.map(canon);
        e.armor = (e.armor ?? []).map(canon);
        for (const c of e.corps ?? []) {
          c.unit = canon(c.unit);
          c.divisions = c.divisions.map(canon);
        }
      }
    }
  }
  if (deOob) {
    for (const div of deOob.divisions) {
      div.id = canon(div.id);
      for (const ev of div.events) ev[1] = ev[1] && canon(ev[1]);
    }
  }
  console.log(`Registry: folded ${redirect.size} duplicate unit(s) into canonical ids`);
}

// Temporal parents from the monthly OOB: each month's assignment holds until
// the next month's listing. Curated parents always win (units that came from
// the per-country directories with hand-authored subordination keep it).
const MONTH_END = '1945-05-11';
const monthlyRosters = []; // [{date, nextDate, entries}] for the derivation step
if (oob) {
  const curatedParentIds = new Set(
    [...units.values()].filter((u) => !u.imported && (u.parents ?? []).length).map((u) => u.id),
  );
  const timeline = new Map(); // unit -> [{from, to, parent}]
  const months = oob.months.filter((m) => m.entries.length);
  for (let i = 0; i < months.length; i++) {
    const from = months[i].date;
    const to = months[i + 1]?.date ?? MONTH_END;
    monthlyRosters.push({ date: from, nextDate: to, entries: months[i].entries });
    const seen = new Set();
    for (const e of months[i].entries) {
      const put = (child, parent) => {
        if (!parent || !child || child === parent || seen.has(child)) return;
        seen.add(child); // first listing wins within a month
        if (!timeline.has(child)) timeline.set(child, []);
        timeline.get(child).push({ from, to, parent });
      };
      if (e.army && e.front) put(e.army, e.front);
      for (const d of e.divisions) put(d, e.army ?? e.front);
      for (const d of e.armor ?? []) put(d, e.army ?? e.front);
      for (const c of e.corps ?? []) {
        put(c.unit, e.army ?? e.front);
        for (const d of c.divisions) put(d, c.unit);
      }
    }
  }
  let applied = 0;
  for (const [id, list] of timeline) {
    const u = units.get(id);
    if (!u || curatedParentIds.has(id)) continue;
    const merged = [];
    for (const iv of list) {
      const last = merged[merged.length - 1];
      if (last && last.parent === iv.parent && last.to === iv.from) last.to = iv.to;
      else merged.push({ ...iv });
    }
    u.parents = merged.map((iv) => ({ from: iv.from, to: iv.to, unit: iv.parent }));
    applied++;
  }
  console.log(`OOB: subordination applied to ${applied} units over ${monthlyRosters.length} months`);
}

// German division parents + monthly rosters from assignment events.
const deRoster = new Map(); // month date -> Map(armyId -> [{id, num}])
const deArmyHgr = new Map(); // month date -> Map(armyId -> dominant hgr id)
const hgrVotes = new Map(); // `${month}|${army}` -> Map(hgr -> count)
if (deOob && monthlyRosters.length) {
  const curatedParentIds = new Set(
    [...units.values()].filter((u) => !u.imported && (u.parents ?? []).length).map((u) => u.id),
  );
  let applied = 0;
  for (const div of deOob.divisions) {
    const u = units.get(div.id);
    if (!u) continue;
    // Parents: each event holds until the next; null army = gap.
    if (!curatedParentIds.has(div.id)) {
      const parents = [];
      for (let i = 0; i < div.events.length; i++) {
        const [from, army] = div.events[i];
        if (!army || !units.has(army)) continue;
        const to = div.events[i + 1]?.[0] ?? MONTH_END;
        const last = parents[parents.length - 1];
        if (last && last.unit === army && last.to === from) last.to = to;
        else parents.push({ from, to, unit: army });
      }
      if (parents.length) {
        u.parents = parents;
        applied++;
      }
    }
    // Roster: latest event at or before each month-grid date.
    const num = Number((div.label.match(/^(\d+)/) ?? [])[1] ?? 0);
    for (const month of monthlyRosters) {
      const md = dateNum(month.date);
      let current = null;
      let curHgr = null;
      for (const [date, army, hgr] of div.events) {
        if (dateNum(date) <= md) {
          current = army;
          curHgr = hgr;
        } else break;
      }
      if (!current) continue;
      if (!deRoster.has(month.date)) deRoster.set(month.date, new Map());
      const byArmy = deRoster.get(month.date);
      if (!byArmy.has(current)) byArmy.set(current, []);
      byArmy.get(current).push({ id: div.id, num });
      // Vote this army's army-group for the month (dominant among its divisions).
      if (curHgr) {
        const key = `${month.date}|${current}`;
        const v = hgrVotes.get(key) ?? new Map();
        v.set(curHgr, (v.get(curHgr) ?? 0) + 1);
        hgrVotes.set(key, v);
      }
    }
  }
  for (const byArmy of deRoster.values()) {
    for (const list of byArmy.values()) list.sort((a, b) => a.num - b.num);
  }

  // Resolve dominant army-group per (month, army), then set army -> army-group
  // parents (merge consecutive) for armies without curated parents.
  const armyHgrSeq = new Map(); // armyId -> [{date, hgr}]
  for (const [key, v] of hgrVotes) {
    const [date, army] = key.split('|');
    let best = null;
    let bestN = 0;
    for (const [hgr, n] of v) if (n > bestN) ((bestN = n), (best = hgr));
    if (!deArmyHgr.has(date)) deArmyHgr.set(date, new Map());
    deArmyHgr.get(date).set(army, best);
    if (!armyHgrSeq.has(army)) armyHgrSeq.set(army, []);
    armyHgrSeq.get(army).push({ date, hgr: best });
  }
  let agParents = 0;
  for (const [army, seq] of armyHgrSeq) {
    const u = units.get(army);
    if (!u || curatedParentIds.has(army)) continue;
    seq.sort((a, b) => (a.date < b.date ? -1 : 1));
    const parents = [];
    for (const { date, hgr } of seq) {
      if (!units.has(hgr)) continue;
      const last = parents[parents.length - 1];
      if (last && last.unit === hgr) last.to = MONTH_END;
      else {
        if (last) last.to = date;
        parents.push({ from: date, to: MONTH_END, unit: hgr });
      }
    }
    if (parents.length) {
      u.parents = parents;
      agParents++;
    }
  }
  console.log(
    `German OOB: parents for ${applied} divisions, rosters over ${deRoster.size} months, ` +
      `${agParents} armies -> army groups`,
  );
}

for (const u of units.values()) {
  const id = u.id;
  if (!u.names?.length || !u.existence?.length) {
    err(id, `missing names/existence (echelon=${u.echelon}, keys=${Object.keys(u).join(',')})`);
    continue;
  }
  if (!ECHELONS.includes(u.echelon)) err(id, `bad echelon "${u.echelon}"`);
  if (!TYPES.includes(u.type)) err(id, `bad type "${u.type}"`);
  if (!u.short) err(id, 'missing short label');
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

// Lexikon der Wehrmacht commanders (fetch-commanders-ldw.mjs, keyed by unit id):
// dated Oberbefehlshaber successions for German armies + army groups. Highest
// auto priority (after curated) because these carry real tenure dates; some
// endpoints are keywords ("Aufstellung"/"Umbenennung") and stay null.
try {
  const ldw = JSON.parse(readFileSync(join(UNITS_DIR, 'oob', 'commanders-ldw.json'), 'utf8')).units;
  let n = 0;
  for (const u of units.values()) {
    const e = ldw[u.id];
    if (!e?.commanders?.length || u.commanders?.length) continue;
    u.commanders = e.commanders.map((c) => ({
      from: c.from ?? null,
      to: c.to ?? null,
      name: c.name,
      link: c.link ?? undefined,
      source: 'lexikon-der-wehrmacht',
    }));
    u.links = u.links ?? {};
    if (!u.links['lexikon-der-wehrmacht'] && e.page) u.links['lexikon-der-wehrmacht'] = e.page;
    n++;
  }
  console.log(`Commanders(LdW): dated successions for ${n} German formations`);
} catch {
  console.log('No commanders-ldw.json — German formations fall back to Wikidata.');
}

// Wikidata commanders (fetch-commanders.mjs, keyed by QID): attach to units
// that have none authored. Curated commander successions always win. These may
// be undated (Wikidata often lacks term qualifiers), so they bypass the ISO
// validation above and the client renders "dates unknown" for null spans.
let commandersAttached = 0;
try {
  const wd = JSON.parse(readFileSync(join(UNITS_DIR, 'oob', 'commanders.json'), 'utf8')).commanders;
  for (const u of units.values()) {
    if (u.commanders?.length) continue;
    const qid = u.links?.wikidata?.replace(/^.*\//, '');
    const list = qid && wd[qid];
    if (!list?.length) continue;
    u.commanders = list.map((c) => ({ from: c.from ?? null, to: c.to ?? null, name: c.name, link: c.link ?? undefined, source: 'wikidata' }));
    commandersAttached++;
  }
  console.log(`Commanders: attached Wikidata successions to ${commandersAttached} units`);
} catch {
  console.log('No commanders.json — units keep only curated commanders.');
}

// Higher formations resolved to Wikidata by label (fetch-commanders-ext.mjs,
// keyed by unit id): Soviet fronts/armies and German armies/army groups that
// carry no QID. Fills the QID, Wikipedia link, a description note, and
// commanders for units that still lack them — so it never overrides the dated
// QID-keyed successions or curated data above.
try {
  const ext = JSON.parse(readFileSync(join(UNITS_DIR, 'oob', 'commanders-ext.json'), 'utf8')).units;
  let extCmd = 0;
  let extInfo = 0;
  for (const u of units.values()) {
    const e = ext[u.id];
    if (!e) continue;
    u.links = u.links ?? {};
    if (!u.links.wikidata && e.qid) {
      u.links.wikidata = e.qid;
      extInfo++;
    }
    if (!u.links['wikipedia.en'] && e.wikipedia) u.links['wikipedia.en'] = e.wikipedia;
    if (!u.notes && e.description) u.notes = e.description[0].toUpperCase() + e.description.slice(1) + '.';
    if (!u.commanders?.length && e.commanders?.length) {
      u.commanders = e.commanders.map((c) => ({
        from: c.from ?? null,
        to: c.to ?? null,
        name: c.name,
        link: c.link ?? undefined,
        source: 'wikidata',
      }));
      extCmd++;
    }
  }
  console.log(`Commanders(ext): Wikidata commanders for ${extCmd} formations, QID/links for ${extInfo}`);
} catch {
  console.log('No commanders-ext.json — higher formations keep only curated commanders.');
}

// Wikipedia descriptions (fetch-descriptions.mjs, keyed by unit id): a short
// historical summary shown atop the card. Attached to any unit that has one.
try {
  const desc = JSON.parse(readFileSync(join(UNITS_DIR, 'oob', 'descriptions.json'), 'utf8')).descriptions;
  let n = 0;
  for (const u of units.values()) {
    const d = desc[u.id];
    if (d?.summary) {
      u.summary = d.summary;
      n++;
    }
  }
  console.log(`Descriptions: attached Wikipedia summaries to ${n} units`);
} catch {
  console.log('No descriptions.json — units have no Wikipedia summary.');
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
// Sector-derived positions (SCALE_PLAN S3). For every month: project sector
// boundary anchors onto that month's interpolated front line -> fraction
// spans; fronts' spans subdivide among their armies (roster order), army
// slices among their divisions. Output is FRACTION keyframes — the client
// resolves them against the daily front geometry, so derived units ride the
// moving line instead of lagging at monthly anchors.

const derived = new Map(); // unit id -> [{startNum, date, f}]
let sectors = null;
try {
  sectors = JSON.parse(readFileSync('data/curated/sectors/eastern.json', 'utf8'));
} catch {
  console.log('No sectors/eastern.json — skipping derivation.');
}

if (sectors && monthlyRosters.length) {
  const sKfs = sectors.keyframes;

  const fractionOf = (line, pt) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < line.length; i++) {
      const dx = (line[i][0] - pt[0]) * Math.cos((pt[1] * Math.PI) / 180);
      const dy = line[i][1] - pt[1];
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = i;
      }
    }
    return best / (line.length - 1);
  };

  /** Entry spans for one sector keyframe projected on `line` (monotonic). */
  function spansAt(kf, side, line) {
    const entries = kf[side] ?? [];
    const bounds = entries.map((e) => (e.to ? fractionOf(line, e.to) : null));
    // Even-split null runs between fixed bounds; clamp monotonic.
    let prev = 0;
    for (let i = 0; i < bounds.length; i++) {
      if (bounds[i] !== null) {
        bounds[i] = Math.max(bounds[i], prev + 0.005);
        prev = bounds[i];
        continue;
      }
      let j = i;
      while (j < bounds.length && bounds[j] === null) j++;
      const next = j < bounds.length ? Math.max(bounds[j], prev + 0.005) : 1;
      const run = j - i + (j < bounds.length ? 1 : 0);
      const step = (next - prev) / (run || 1);
      for (let k = i; k < j; k++) bounds[k] = prev + step * (k - i + 1);
      prev = bounds[j - 1];
      i = j - 1;
    }
    const spans = new Map();
    let f0 = 0;
    entries.forEach((e, i) => {
      spans.set(e.unit, [f0, Math.min(bounds[i] ?? 1, 1)]);
      f0 = bounds[i] ?? 1;
    });
    return spans;
  }

  const isCuratedActive = (u, dNum) => {
    if (!u?.positions?.length) return false;
    return dNum >= dateNum(u.positions[0].date) && dNum < u._trackTo;
  };
  const existsAt = (u, dNum) =>
    u && dNum >= u._existFrom && dNum < u._existTo;

  // Pocket placement (pre-pass): units trapped in a Kessel ride the pocket
  // ring, not the main line. For each garrison pocket × roster month, expand
  // the garrison to its OOB descendants and place each inside the ring (golden-
  // angle spread), as ABSOLUTE keyframes. These take precedence over the
  // main-line sector derivation for those unit-months.
  const inPocket = new Set(); // `${id}|${date}` to skip on the main line
  const pocketAbs = []; // { id, date, dNum, at:[lon,lat] }
  for (const pk of pockets) {
    if (!pk.garrison?.length && !pk.besiegers?.length) continue;
    for (const month of monthlyRosters) {
      const dNum = dateNum(month.date);
      if (dNum < pk.fromNum || dNum >= pk.toNum) continue;
      const ring = coordsFor(pk, month.date);
      if (!ring || ring.length < 3) continue;
      let cx = 0;
      let cy = 0;
      for (const [x, y] of ring) {
        cx += x;
        cy += y;
      }
      cx /= ring.length;
      cy /= ring.length;
      let r = 0;
      for (const [x, y] of ring) r = Math.max(r, Math.hypot(x - cx, y - cy));

      // Garrison + OOB descendants active this month (fixpoint over parents),
      // spread inside the ring (golden angle).
      if (pk.garrison?.length) {
        const garr = new Set(pk.garrison);
        for (let pass = 0, changed = true; changed && pass < 6; pass++) {
          changed = false;
          for (const u of units.values()) {
            if (garr.has(u.id)) continue;
            const p = (u.parents ?? []).find(
              (p) => dateNum(p.from) <= dNum && (!p.to || dNum < dateNum(p.to)),
            );
            if (p && garr.has(p.unit)) {
              garr.add(u.id);
              changed = true;
            }
          }
        }
        const list = [...garr].filter((id) => {
          const u = units.get(id);
          return existsAt(u, dNum) && !isCuratedActive(u, dNum);
        });
        list.forEach((id, i) => {
          const ang = i * 2.399963229; // golden angle, even fill
          const rad = 0.55 * r * Math.sqrt((i + 0.5) / list.length);
          inPocket.add(`${id}|${month.date}`);
          pocketAbs.push({
            id,
            date: month.date,
            dNum,
            at: [Number((cx + rad * Math.cos(ang)).toFixed(4)), Number((cy + rad * Math.sin(ang)).toFixed(4))],
          });
        });
      }

      // Besiegers: the blockading formations hug the ring just OUTSIDE its
      // land-facing arc (bearing = ring centre -> nearest main-line point), each
      // pinned ~15 km beyond a ring vertex so they read as sealing the pocket
      // and stay within the side-check's pocket tolerance (not "wrong side").
      // Entries are ids or {id, from?, to?} (default window = the pocket's).
      if (pk.besiegers?.length) {
        const line = coordsFor(main, month.date);
        let bearing = Math.PI; // fallback: face west (toward the continent)
        if (line) {
          let best = Infinity;
          let bx = cx;
          let by = cy;
          for (const [x, y] of line) {
            const dd = (x - cx) ** 2 + (y - cy) ** 2;
            if (dd < best) {
              best = dd;
              bx = x;
              by = y;
            }
          }
          bearing = Math.atan2(by - cy, bx - cx);
        }
        const angDiff = (a) => {
          const d = Math.abs(a - bearing);
          return d > Math.PI ? 2 * Math.PI - d : d;
        };
        const verts = ring
          .map(([x, y]) => ({ x, y, ang: Math.atan2(y - cy, x - cx) }))
          .sort((p, q) => angDiff(p.ang) - angDiff(q.ang)); // land-facing first
        const OFF = 0.16; // ~15 km outward from the ring edge
        const bz = pk.besiegers
          .map((b) => (typeof b === 'string' ? { id: b } : b))
          .filter((b) => {
            const u = units.get(b.id);
            if (!u || !existsAt(u, dNum) || isCuratedActive(u, dNum)) return false;
            if (b.from && dNum < dateNum(b.from)) return false;
            if (b.to && dNum >= dateNum(b.to)) return false;
            return true;
          });
        bz.forEach((b, i) => {
          const v = verts[Math.min(i, verts.length - 1)];
          const len = Math.hypot(v.x - cx, v.y - cy) || 1;
          inPocket.add(`${b.id}|${month.date}`);
          pocketAbs.push({
            id: b.id,
            date: month.date,
            dNum,
            at: [
              Number((v.x + ((v.x - cx) / len) * OFF).toFixed(4)),
              Number((v.y + ((v.y - cy) / len) * OFF).toFixed(4)),
            ],
          });
        });
      }
    }
  }

  // Lookup: an in-pocket unit's absolute position this month, so a fully
  // encircled army group can be placed with its armies instead of averaged onto
  // the distant main line.
  const pocketPosOf = new Map();
  for (const p of pocketAbs) pocketPosOf.set(`${p.id}|${p.date}`, p.at);

  const push = (id, date, f) => {
    const u = units.get(id);
    const dNum = dateNum(date);
    if (!existsAt(u, dNum) || isCuratedActive(u, dNum)) return;
    if (inPocket.has(`${id}|${date}`)) return; // placed in a pocket instead
    if (!derived.has(id)) derived.set(id, []);
    derived.get(id).push({ startNum: dNum, date, f: Number(f.toFixed(4)) });
  };

  for (const month of monthlyRosters) {
    const line = coordsFor(main, month.date);
    if (!line) continue;
    // Bracketing sector keyframes; per-unit time-lerped spans.
    let k0 = sKfs[0];
    let k1 = sKfs[sKfs.length - 1];
    for (let i = 0; i < sKfs.length; i++) {
      if (dateNum(sKfs[i].date) <= dateNum(month.date)) k0 = sKfs[i];
      if (dateNum(sKfs[i].date) > dateNum(month.date)) {
        k1 = sKfs[i];
        break;
      }
    }
    const span0 = { su: spansAt(k0, 'su', line), de: spansAt(k0, 'de', line) };
    const span1 = { su: spansAt(k1, 'su', line), de: spansAt(k1, 'de', line) };
    const tSpan = Math.max(0, Math.min(1,
      diffDays(k0.date, month.date) / Math.max(1, diffDays(k0.date, k1.date)),
    ));
    const spanFor = (side, id) => {
      const a = span0[side].get(id);
      const b = span1[side].get(id);
      if (a && b) return [a[0] + (b[0] - a[0]) * tSpan, a[1] + (b[1] - a[1]) * tSpan];
      return tSpan < 0.5 ? (a ?? b) : (b ?? a);
    };

    // German armies: sector midpoints; their divisions (Lexikon Unterstellung
    // rosters) subdivide the army span like Soviet divisions do army slices.
    const monthHgr = deArmyHgr.get(month.date);
    const deSeen = new Set();
    const armyFrac = new Map(); // armyId -> midpoint fraction (for army-group avg)
    const hgrPocketPos = new Map(); // hgrId -> [[lon,lat]] for its encircled armies
    for (const e of [...(k0.de ?? []), ...(k1.de ?? [])]) {
      if (deSeen.has(e.unit)) continue;
      deSeen.add(e.unit);
      // Encircled army (placed inside the ring by the pocket pre-pass): its stale
      // main-line midpoint must NOT feed the army-group average. Note its pocket
      // position so a fully-encircled group follows its armies in.
      if (inPocket.has(`${e.unit}|${month.date}`)) {
        const hgr = monthHgr?.get(e.unit);
        const pos = pocketPosOf.get(`${e.unit}|${month.date}`);
        if (hgr && pos) {
          if (!hgrPocketPos.has(hgr)) hgrPocketPos.set(hgr, []);
          hgrPocketPos.get(hgr).push(pos);
        }
        continue;
      }
      const span = spanFor('de', e.unit);
      if (!span) continue;
      const mid = (span[0] + span[1]) / 2;
      armyFrac.set(e.unit, mid);
      push(e.unit, month.date, mid);
      const divs = deRoster.get(month.date)?.get(e.unit) ?? [];
      divs.forEach((d, j) =>
        push(d.id, month.date, span[0] + ((span[1] - span[0]) * (j + 0.5)) / divs.length),
      );
    }
    // German army groups: on-line armies -> average of their sector fractions; a
    // group with ALL armies encircled (Heeresgruppe Kurland) is placed inside the
    // pocket with them rather than averaged onto the distant main line.
    const hgrMembers = new Map(); // hgrId -> [fraction]
    if (monthHgr) {
      for (const [army, frac] of armyFrac) {
        const hgr = monthHgr.get(army);
        if (!hgr) continue;
        if (!hgrMembers.has(hgr)) hgrMembers.set(hgr, []);
        hgrMembers.get(hgr).push(frac);
      }
      for (const [hgr, fracs] of hgrMembers) {
        push(hgr, month.date, fracs.reduce((s, f) => s + f, 0) / fracs.length);
      }
    }
    for (const [hgr, positions] of hgrPocketPos) {
      if (hgrMembers.has(hgr)) continue; // some armies still on the line: placed above
      const hu = units.get(hgr);
      const dNum = dateNum(month.date);
      if (!existsAt(hu, dNum) || isCuratedActive(hu, dNum)) continue;
      const ax = positions.reduce((s, p) => s + p[0], 0) / positions.length;
      const ay = positions.reduce((s, p) => s + p[1], 0) / positions.length;
      inPocket.add(`${hgr}|${month.date}`);
      pocketAbs.push({ id: hgr, date: month.date, dNum, at: [Number(ax.toFixed(4)), Number(ay.toFixed(4))] });
    }

    // Soviet: front span -> armies (roster order) -> divisions.
    const byFront = new Map();
    for (const e of month.entries) {
      if (!e.front) continue;
      if (!byFront.has(e.front)) byFront.set(e.front, []);
      byFront.get(e.front).push(e);
    }
    for (const [frontId, entries] of byFront) {
      const span = spanFor('su', frontId);
      if (!span) continue; // reserve / off-line front: list-only
      push(frontId, month.date, (span[0] + span[1]) / 2);
      const groups = entries.filter(
        (e) => e.divisions.length + (e.armor?.length ?? 0) + (e.corps?.length ?? 0) > 0,
      );
      const A = groups.length;
      if (!A) continue;
      const width = span[1] - span[0];
      groups.forEach((g, a) => {
        const a0 = span[0] + (width * a) / A;
        const a1 = span[0] + (width * (a + 1)) / A;
        if (g.army) push(g.army, month.date, (a0 + a1) / 2);

        // Weighted sub-slices: a corps occupies frontage proportional to its
        // member count; loose divisions/armor get one slot each. The corps
        // marker sits at its slice center, members spread inside it.
        const seen = new Set();
        const fresh = (d) => !seen.has(d) && seen.add(d);
        const slots = [];
        for (const c of g.corps ?? []) {
          if (!fresh(c.unit)) continue;
          const members = c.divisions.filter(fresh);
          slots.push({ weight: Math.max(1, members.length), corps: c.unit, members });
        }
        for (const d of [...g.divisions, ...(g.armor ?? [])]) {
          if (fresh(d)) slots.push({ weight: 1, unit: d });
        }
        const totalW = slots.reduce((s, x) => s + x.weight, 0);
        if (!totalW) return;
        let cursor = a0;
        const armyWidth = a1 - a0;
        for (const slot of slots) {
          const w = (armyWidth * slot.weight) / totalW;
          if (slot.unit) {
            push(slot.unit, month.date, cursor + w / 2);
          } else {
            push(slot.corps, month.date, cursor + w / 2);
            slot.members.forEach((d, j) =>
              push(d, month.date, cursor + (w * (j + 0.5)) / slot.members.length),
            );
          }
          cursor += w;
        }
      });
    }
  }
  // Add pocket placements (absolute keyframes) — precedence over main line.
  let pocketPlaced = 0;
  for (const p of pocketAbs) {
    const u = units.get(p.id);
    if (!existsAt(u, p.dNum) || isCuratedActive(u, p.dNum)) continue;
    if (!derived.has(p.id)) derived.set(p.id, []);
    derived.get(p.id).push({ startNum: p.dNum, date: p.date, at: p.at });
    pocketPlaced++;
  }
  console.log(`Derived fraction tracks for ${derived.size} units (${pocketPlaced} pocket placements)`);

  // Validation: do derived positions land on their unit's own side of the
  // front? This is the project's quality engine (city-control, curated units)
  // now applied to the 1k+ derived units. Reported, not fatal — the schematic
  // N->S sector model is weakest where the line runs E-W (Caucasus 1942) or
  // hugs a pocket. Replicates the client's pointAt so it checks the actually
  // rendered location, not just the fraction.
  // Mirror src/layers/units.ts ECH_GROUP + ECH_DEPTH so the check validates
  // the actually-rendered position (per-echelon rear depth).
  const echGroup = (e) =>
    ['front', 'army-group'].includes(e) ? 'top'
      : e === 'army' ? 'army'
      : e === 'corps' ? 'corps'
      : e === 'brigade' ? 'brigade'
      : e === 'division' ? 'division'
      : 'sub';
  const DEPTH = { division: 0.12, brigade: 0.2, sub: 0.12, corps: 0.36, army: 0.62, top: 1.25 };
  const pointAt = (line, f, side, ech) => {
    const i = Math.max(0, Math.min(line.length - 1, Math.round(f * (line.length - 1))));
    const a = line[Math.max(0, i - 2)];
    const b = line[Math.min(line.length - 1, i + 2)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const off = (DEPTH[ech] ?? 0.3) * (side === 'axis' ? -1 : 1);
    return [line[i][0] + (-dy / len) * off, line[i][1] + (dx / len) * off];
  };
  const TOL = 30; // km past the line before a wrong side counts (sector slop)
  let checked = 0;
  let wrong = 0;
  const wrongByUnit = new Map();
  for (const [id, kfs] of derived) {
    const u = units.get(id);
    const ech = echGroup(u.echelon);
    for (const kfv of kfs) {
      const line = coordsFor(main, kfv.date);
      if (!line) continue;
      // Pocket placements are absolute; main-line placements resolve a fraction.
      const [lon, lat] = kfv.at ? kfv.at : pointAt(line, kfv.f, u.side, ech);
      let drawn = null;
      for (const pf of pockets) {
        const ring = coordsFor(pf, kfv.date);
        if (ring && inRing(ring, lon, lat)) {
          drawn = pf.encircled;
          break;
        }
      }
      if (!drawn) drawn = inRing(axisPolygon(line), lon, lat) ? 'axis' : 'soviet';
      checked++;
      if (drawn !== u.side && kmFromFront(line, lon, lat) > TOL) {
        wrong++;
        wrongByUnit.set(id, (wrongByUnit.get(id) ?? 0) + 1);
      }
    }
  }
  const pct = checked ? ((100 * (checked - wrong)) / checked).toFixed(1) : '100';
  console.log(
    `Derived side-check: ${pct}% of ${checked} unit-months on the correct side ` +
      `(${wrong} wrong across ${wrongByUnit.size} units).`,
  );
  for (const [id, n] of [...wrongByUnit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ✗ ${id}: ${n} months wrong-side`);
  }
  // Regression guard: a healthy schematic model sits ~99.9%; the residual is
  // mobile formations in deep operations + the Caucasus E-W segment. A gross
  // drop means a real bug (e.g. the axis/soviet offset sign flip) — fail hard.
  const FLOOR = 95;
  if (checked && Number(pct) < FLOOR) {
    console.error(`✗ Derived side-check ${pct}% below ${FLOOR}% floor — placement regression.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Emit artifacts

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(join(OUT_DIR, 'tracks'), { recursive: true });
mkdirSync(join(OUT_DIR, 'detail'), { recursive: true });
mkdirSync(join(OUT_DIR, 'derived'), { recursive: true });

// Derived file: per unit, segments of monthly keyframes (a >40-day gap, or a
// switch between main-line and pocket placement, starts a new segment; each
// segment renders ~35 days past its last keyframe). A keyframe is
// [startNum, fraction] (resolve on the daily front line) or
// [startNum, lon, lat] (absolute, inside a pocket ring).
{
  const out = [];
  for (const [id, kfs] of derived) {
    const u = units.get(id);
    kfs.sort((a, b) => a.startNum - b.startNum);
    const segs = [];
    let cur = null;
    for (const kf of kfs) {
      const abs = Boolean(kf.at);
      if (!cur || diffDays(cur.lastDate, kf.date) > 40 || cur.abs !== abs) {
        cur = { kfs: [], lastDate: kf.date, abs };
        segs.push(cur);
      }
      cur.kfs.push(abs ? [kf.startNum, kf.at[0], kf.at[1]] : [kf.startNum, kf.f]);
      cur.lastDate = kf.date;
    }
    out.push({
      id,
      short: u.short,
      side: u.side,
      echelon: u.echelon,
      type: u.type,
      segs: segs.map((s) => ({ end: dateNum(addDays(s.lastDate, 35)), kfs: s.kfs })),
      // Temporal parent timeline [fromNum, toNum|null, unitId] so the map can
      // resolve each unit's parent on a given date and draw command links
      // (which division sits under which army). Omitted when no parents.
      ...((u.parents ?? []).length
        ? { parents: u.parents.map((p) => [dateNum(p.from), p.to ? dateNum(p.to) : null, p.unit]) }
        : {}),
    });
  }
  writeFileSync(
    join(OUT_DIR, 'derived', 'eastern.json'),
    JSON.stringify({ units: out.sort((a, b) => a.id.localeCompare(b.id)) }),
  );
  console.log(`Wrote ${out.length} derived units -> ${OUT_DIR}/derived/eastern.json`);
}

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
    hasDerived: derived.has(u.id),
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
    // Temporal parent timeline (see derived emit) for date-accurate command links.
    parents: (u.parents ?? []).map((p) => [dateNum(p.from), p.to ? dateNum(p.to) : null, p.unit]),
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
    derived: derived.has(u.id),
    links: u.links ?? {},
    sources: usedSources.map((s) => ({ id: s, ...(sourcesReg[s] ?? {}) })),
    notes: u.notes ?? null,
    summary: u.summary ?? null,
    formations: formationsOf.get(u.id) ?? null,
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
