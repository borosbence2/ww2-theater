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
const TYPES = ['infantry', 'armoured', 'motorized', 'mechanized', 'cavalry', 'recon', 'artillery', 'antitank', 'airborne', 'mountain', 'hq'];
// Air-formation roles (units flagged `air:true`): map symbol + panel grouping.
const AIR_TYPES = [
  'fighter', 'heavy-fighter', 'dive-bomber', 'ground-attack',
  'bomber', 'night-fighter', 'recon', 'transport', 'air-hq',
];
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

// Minor-Axis divisions (Romanian/Hungarian/Italian Don flank, build-minor-axis.mjs):
// scaffold units + OOB events fed through the same German divisional pipeline, so
// they get parents + a roster slot and place inside their army's sector slice.
try {
  const ma = JSON.parse(readFileSync(join(UNITS_DIR, 'oob', 'minor-axis.json'), 'utf8'));
  for (const u of ma.units) if (!units.has(u.id)) units.set(u.id, u);
  if (deOob) deOob.divisions.push(...ma.divisions);
  else deOob = { divisions: ma.divisions, armies: [], armyGroups: [] };
  console.log(`Loaded ${ma.units.length} minor-Axis divisions`);
} catch {
  console.log('No oob/minor-axis.json — minor-Axis divisions stay army-only.');
}

// Finnish + Arctic theatre (build-finnish.mjs): scaffold units + roster events,
// fed through the German divisional pipeline (parents + roster). They DON'T
// place on the main front — a dedicated pass below routes them onto the Finnish /
// Arctic front lines via sectors/finnish.json.
const finUnitIds = new Set();
const finFrontOf = new Map(); // unit id -> front feature id (which line its fraction is on)
// Per-unit-month detached-front tag `${id}|${date}` -> front feature id. Unlike
// finFrontOf (whole unit), this is per keyframe, so a unit that rides a detached
// line for one stint and the main line later (e.g. the Crimean Front's armies,
// destroyed at Kerch in May 1942 then reformed on the main front) gets each
// SEGMENT resolved against the right line.
const finFrontAt = new Map();
try {
  const fin = JSON.parse(readFileSync(join(UNITS_DIR, 'oob', 'finnish.json'), 'utf8'));
  for (const u of fin.units) {
    if (!units.has(u.id)) units.set(u.id, u);
    finUnitIds.add(u.id);
  }
  for (const d of fin.divisions) finUnitIds.add(d.id);
  if (deOob) deOob.divisions.push(...fin.divisions);
  else deOob = { divisions: fin.divisions, armies: [], armyGroups: [] };
  console.log(`Loaded ${fin.units.length} Finnish/Arctic units`);
} catch {
  console.log('No oob/finnish.json — Finnish theatre stays empty.');
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

// Air scaffolds (import-air.mjs): Wikidata Luftwaffe/VVS flying formations,
// identity-only, air:true. Curated air files win on id; import-air already
// deduped against curated names/QIDs.
let importedAirCount = 0;
try {
  const air = JSON.parse(readFileSync(join(UNITS_DIR, 'imported-air.json'), 'utf8'));
  for (const u of air.units) {
    if (units.has(u.id)) continue;
    for (const e of u.existence ?? []) if (e.to && e.to <= e.from) delete e.to;
    u._scaffold = true; // searchable-only; an air-battle showcase may promote it
    units.set(u.id, u);
    importedAirCount++;
  }
  console.log(`Loaded ${importedAirCount} air scaffolds`);
} catch {
  console.log('No imported-air.json — air scaffolds skipped.');
}

// Air-command assignments (oob/air.json): give each assigned air command (Soviet
// air army / German Luftflotte) a parent chain to its ground anchor (Front /
// army group). The rear placement itself happens in the derivation pass below,
// which reads the same `airAssign` map.
let airAssign = null;
try {
  airAssign = JSON.parse(readFileSync(join(UNITS_DIR, 'oob', 'air.json'), 'utf8')).assignments;
  let n = 0;
  for (const [id, spans] of Object.entries(airAssign)) {
    const u = units.get(id);
    if (!u) {
      warn('air', `assignment references unknown air unit "${id}"`);
      continue;
    }
    for (const a of spans) if (!units.has(a.anchor)) err('air', `${id}: unknown anchor "${a.anchor}"`);
    if (!(u.parents ?? []).length) {
      u.parents = spans.map((a) => ({ from: a.from, to: a.to ?? null, unit: a.anchor }));
      n++;
    }
  }
  console.log(`Air assignments: parent chains for ${n} air commands`);
} catch {
  console.log('No oob/air.json — air commands stay scaffold-only.');
}

// Air-battle showcases (oob/air-battles.json): per battle, create the army's key
// formations as air units parented to it. They get no curated positions here —
// the derivation pass below clusters them around the army's battle-month
// position. A formation listed in several battles is created once (existence +
// positionsTo widened to span them). Curated files win on id.
let airBattles = null;
try {
  airBattles = JSON.parse(readFileSync(join(UNITS_DIR, 'oob', 'air-battles.json'), 'utf8')).battles;
  let created = 0;
  for (const battle of airBattles) {
    const country = battle.country ?? 'SU';
    for (const bu of battle.units) {
      if (units.has(bu.id)) {
        const u = units.get(bu.id);
        if (u._scaffold) {
          // Promote a searchable-only Wikidata scaffold to a placed showcase
          // formation: attach this battle's aircraft / parent / summary so it
          // gets a range ring + a command chain (and the placement pass below
          // puts it on the map for the battle window).
          if (bu.aircraft && !u.aircraft?.length) u.aircraft = bu.aircraft.map((id) => ({ id }));
          if (bu.summary && !u.summary) u.summary = bu.summary;
          if (bu.commander && !u.commanders?.length) {
            u.commanders = [{ from: battle.from, name: bu.commander.name, link: bu.commander.link }];
          }
          if (bu.parent && !(u.parents ?? []).some((p) => p.unit === bu.parent && p.from === battle.from)) {
            (u.parents ??= []).push({ from: battle.from, to: bu.parentTo ?? null, unit: bu.parent });
          }
          if (!u.positionsTo || u.positionsTo < battle.to) u.positionsTo = battle.to;
          delete u._scaffold;
          u._airBattle = true; // now placed like a showcase unit
          created++;
          continue;
        }
        if (!u._airBattle) continue; // a curated file wins
        if (!u.positionsTo || u.positionsTo < battle.to) u.positionsTo = battle.to;
        continue;
      }
      if (!units.has(bu.parent)) err('air-battles', `${bu.id}: unknown parent "${bu.parent}"`);
      units.set(bu.id, {
        id: bu.id,
        country,
        branch: country === 'SU' ? 'vvs' : 'luftwaffe',
        echelon: bu.echelon,
        type: bu.type,
        air: true,
        short: bu.short,
        names: [{ from: battle.from, name: bu.name, aliases: bu.aliases ?? [] }],
        existence: [{ from: bu.from ?? battle.from }],
        positionsTo: battle.to,
        parents: [{ from: battle.from, to: bu.parentTo ?? null, unit: bu.parent }],
        positions: [],
        commanders: bu.commander ? [{ from: battle.from, name: bu.commander.name, link: bu.commander.link }] : [],
        aircraft: (bu.aircraft ?? []).map((id) => ({ id })),
        links: {},
        summary: bu.summary ?? null,
        notes: `${battle.name}: air-battle showcase formation (representative key OOB; approximate placement).`,
        _airBattle: true,
      });
      created++;
    }
  }
  console.log(`Air battles: created ${created} showcase formations across ${airBattles.length} battles`);
} catch {
  console.log('No oob/air-battles.json — no battle showcases.');
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

// Air forces: resolve each air unit's keyframe `base` (airfield id) to coords +
// label from the curated airfield catalog, and default the move to 'air' (a wing
// relocating between fields holds, then jumps — it doesn't glide). Runs before
// position validation so the resolved `at` is bounds-checked like any other.
const airfields = new Map();
try {
  for (const a of JSON.parse(readFileSync('data/curated/airfields/eastern.json', 'utf8')).airfields ?? []) {
    airfields.set(a.id, a);
  }
} catch {
  console.log('No airfields/eastern.json — air-unit bases must use explicit coords.');
}
for (const u of units.values()) {
  if (!u.air) continue;
  for (const a of u.aircraft ?? []) if (!a.id) err(u.id, `aircraft entry missing id: ${JSON.stringify(a)}`);
  for (const pos of u.positions ?? []) {
    if (pos.base) {
      const a = airfields.get(pos.base);
      if (!a) err(u.id, `position ${pos.date} references unknown airfield "${pos.base}"`);
      else {
        pos.at = pos.at ?? [a.lon, a.lat];
        pos.label = pos.label ?? a.name;
      }
    }
    if (!pos.move) pos.move = 'air';
  }
}

for (const u of units.values()) {
  const id = u.id;
  // Normalize special-arm types from the id (the roster/import predates these
  // ground types, so airborne divisions arrived as 'infantry' and mechanized
  // corps/brigades as 'motorized').
  if (!u.air) {
    if (/airborne/.test(id)) u.type = 'airborne';
    else if (/mechanized-(corps|brigade|division)/.test(id)) u.type = 'mechanized';
    // Mountain troops: Gebirgs / mountain-rifle divisions (but NOT mountain
    // cavalry, which stays cavalry) and the Italian Alpine divisions.
    else if (/mountain-(rifle-)?division$/.test(id) || /^it-(julia|tridentina|cuneense|pusteria|taurinense)-division$/.test(id)) u.type = 'mountain';
  }
  if (!u.names?.length || !u.existence?.length) {
    err(id, `missing names/existence (echelon=${u.echelon}, keys=${Object.keys(u).join(',')})`);
    continue;
  }
  if (!ECHELONS.includes(u.echelon)) err(id, `bad echelon "${u.echelon}"`);
  if (!TYPES.includes(u.type) && !(u.air && AIR_TYPES.includes(u.type))) err(id, `bad type "${u.type}"`);
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

// Extend effective existence to cover sourced OOB rosters (Boevoi sostav /
// Lexikon Unterstellung). If a roster lists a unit active in a month beyond its
// recorded lifespan — often a 1st-formation existence carried on a multi-
// formation unit (e.g. 109th Rifle Division, rostered to 1945 but recorded as
// ending Jul 1942) — trust the roster, or the unit silently drops off the map.
// (The detail panel still shows the recorded existence; this only widens the
// internal placement bounds.)
{
  const span = new Map(); // canonical id -> { min: num, maxISO: string }
  const note = (id, iso) => {
    const cid = canon(id);
    const dn = dateNum(iso);
    const s = span.get(cid);
    if (!s) span.set(cid, { min: dn, maxISO: iso });
    else {
      if (dn < s.min) s.min = dn;
      if (dn > dateNum(s.maxISO)) s.maxISO = iso;
    }
  };
  if (oob) {
    for (const m of oob.months) {
      for (const e of m.entries) {
        if (e.front) note(e.front, m.date);
        if (e.army) note(e.army, m.date);
        for (const d of e.divisions ?? []) note(d, m.date);
        for (const d of e.armor ?? []) note(d, m.date);
        for (const c of e.corps ?? []) {
          note(c.unit, m.date);
          for (const d of c.divisions ?? []) note(d, m.date);
        }
      }
    }
  }
  if (deOob) {
    for (const div of deOob.divisions) {
      for (const [date, army] of div.events) if (army) note(div.id, date);
    }
  }
  let extended = 0;
  for (const [id, s] of span) {
    const u = units.get(id);
    if (!u) continue;
    if (s.min < u._existFrom) {
      u._existFrom = s.min;
      extended++;
    }
    const after = dateNum(addDays(s.maxISO, 32)); // first day after the last roster month
    if (after > u._existTo) {
      const wasTrack = u._trackTo === u._existTo;
      u._existTo = after;
      if (wasTrack) u._trackTo = after;
      extended++;
    }
  }
  if (extended) console.log(`Extended existence bounds for ${extended} units to cover OOB rosters`);
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

// Phase 5.1: dated actual strength returns (personnel + key equipment), keyed by
// unit id; shown in the panel against the doctrinal nominal establishment.
const strengthOf = new Map();
try {
  const sr = JSON.parse(readFileSync(join(UNITS_DIR, 'oob', 'strength.json'), 'utf8')).records;
  for (const [id, recs] of Object.entries(sr)) {
    const cid = canon(id);
    if (!units.has(cid)) {
      warn('strength', `unknown unit "${id}"`);
      continue;
    }
    for (const r of recs) {
      if (!ISO.test(r.date)) err('strength', `bad date "${r.date}" for ${id}`);
      if (r.source && !sourcesReg[r.source]) warn('strength', `unknown source "${r.source}" for ${id}`);
    }
    strengthOf.set(cid, [...recs].sort((a, b) => a.date.localeCompare(b.date)));
  }
  console.log(`Strength returns for ${strengthOf.size} units`);
} catch {
  console.log('No strength.json — units show only nominal establishment.');
}

// Phase 5b: unit imagery manifest (fetch-images.mjs) — Wikidata P18 -> Commons
// thumbnail + license, keyed by unit id; shown (lazy, attributed) in the panel.
const imageOf = new Map();
try {
  const im = JSON.parse(readFileSync(join(UNITS_DIR, 'oob', 'images.json'), 'utf8')).images;
  for (const [id, rec] of Object.entries(im)) if (rec) imageOf.set(canon(id), rec);
  console.log(`Images for ${imageOf.size} units`);
} catch {
  console.log('No images.json — units show no imagery.');
}

// Phase C (precedence model): curated sparse waypoints. A few dated points lift a
// unit off its derived anchor within their span (a spearhead leading the line, a
// unit held in a rear strongpoint). Attached to the derived unit; the client
// resolver prefers them over the derived anchor.
const waypointsOf = new Map();
try {
  const wp = JSON.parse(readFileSync(join(UNITS_DIR, 'oob', 'waypoints.json'), 'utf8')).records;
  for (const [id, recs] of Object.entries(wp)) {
    const cid = canon(id);
    if (!units.has(cid)) {
      warn('waypoints', `unknown unit "${id}"`);
      continue;
    }
    for (const r of recs) {
      if (!ISO.test(r.date)) err('waypoints', `bad date "${r.date}" for ${id}`);
      if (typeof r.lng !== 'number' || typeof r.lat !== 'number') err('waypoints', `bad coords for ${id} @ ${r.date}`);
      if (r.source && !sourcesReg[r.source]) warn('waypoints', `unknown source "${r.source}" for ${id}`);
    }
    waypointsOf.set(cid, [...recs].sort((a, b) => a.date.localeCompare(b.date)));
  }
  console.log(`Waypoints for ${waypointsOf.size} units`);
} catch {
  console.log('No waypoints.json — derived anchors only.');
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
// Air units are based behind their own lines but range freely over the front, so
// the unit-vs-front side check doesn't apply — validate ground units only.
const positionedGround = positioned.filter((u) => !u.air);
console.log(`Validating ${positionedGround.length} positioned units vs front, ${VAL_START} -> ${VAL_END} ...`);

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

  for (const u of positionedGround) {
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
// Posture per derived unit-month (`${id}|${date}` -> kind): encircled | reserve
// | refit. Absent = front. Surfaced in the panel so a unit off the line is
// explained (Phase B of the precedence model).
const postureAt = new Map();

// Mirror src/layers/units.ts ECH_GROUP + ECH_DEPTH so we can bake a sector
// fraction to the exact rendered point (per-echelon rear depth). Used by both
// the side-check and the derived emit (fraction -> absolute monthly anchor).
const echGroup = (e) =>
  ['front', 'army-group'].includes(e)
    ? 'top'
    : e === 'army'
      ? 'army'
      : e === 'corps'
        ? 'corps'
        : e === 'brigade'
          ? 'brigade'
          : e === 'division'
            ? 'division'
            : 'sub';
const DERIVED_DEPTH = { division: 0.12, brigade: 0.2, sub: 0.12, corps: 0.36, army: 0.62, top: 1.25 };
const fracToPoint = (line, f, side, ech) => {
  const i = Math.max(0, Math.min(line.length - 1, Math.round(f * (line.length - 1))));
  const a = line[Math.max(0, i - 2)];
  const b = line[Math.min(line.length - 1, i + 2)];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const off = (DERIVED_DEPTH[ech] ?? 0.3) * (side === 'axis' ? -1 : 1);
  return [line[i][0] + (-dy / len) * off, line[i][1] + (dx / len) * off];
};

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
    // Place the garrison across the WHOLE pocket window: its endpoints plus any
    // monthly-roster snapshots inside it. Iterating only month-firsts left short
    // pockets whose window holds no 1st-of-month (Bobruisk 27-30 Jun, Minsk
    // 3-11 Jul, Halbe) empty, so the trapped units rode the line out instead.
    const placeDates = new Set([pk.from]);
    for (const m of monthlyRosters) {
      const dn = dateNum(m.date);
      if (dn >= pk.fromNum && dn < pk.toNum) placeDates.add(m.date);
    }
    const lastDay = addDays(pk.to, -1);
    if (dateNum(lastDay) >= pk.fromNum) placeDates.add(lastDay);
    for (const date of [...placeDates].sort()) {
      const dNum = dateNum(date);
      const ring = coordsFor(pk, date);
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
          inPocket.add(`${id}|${date}`);
          postureAt.set(`${id}|${date}`, 'encircled');
          pocketAbs.push({
            id,
            date,
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
        const line = coordsFor(main, date);
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
          inPocket.add(`${b.id}|${date}`);
          pocketAbs.push({
            id: b.id,
            date,
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

  // --- Reserve placement (pre-pass): EF-theater formations with no front sector
  // this month ride a rear "reserve" area (front centre, deep in own rear)
  // instead of vanishing. Soviet: the Reserve Front (Stavka RVGK). German: EF
  // divisions resting in a null-army (OKH reserve) gap *between* Eastern-Front
  // deployments. Non-EF fronts (West/Italy/Balkans/Karelia) and Luftwaffe/naval
  // formations are deliberately NOT placed — they were not on the Eastern Front.
  const secDeArmies = new Set();
  const secSuFronts = new Set();
  for (const k of sKfs) {
    for (const e of k.de ?? []) secDeArmies.add(e.unit);
    for (const e of k.su ?? []) secSuFronts.add(e.unit);
  }
  const RESERVE_SU_FRONTS = new Set(['su-front-reserve']);
  const deDivById = new Map((deOob?.divisions ?? []).map((d) => [d.id, d]));
  const deEF = new Set(); // German divisions that ever sit under an EF sector army
  for (const div of deDivById.values()) {
    if ((div.events ?? []).some(([, army]) => army && secDeArmies.has(army))) deEF.add(div.id);
  }
  const RESERVE_DEPTH = 2.6; // degrees behind the line — operational reserve depth
  const reserveAt = (line, side, i, n) => {
    const idx = Math.round(0.5 * (line.length - 1)); // front centre
    const a = line[Math.max(0, idx - 2)];
    const b = line[Math.min(line.length - 1, idx + 2)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const dir = side === 'axis' ? -1 : 1; // axis rear = west, soviet rear = east
    const cx = line[idx][0] + (-dy / len) * RESERVE_DEPTH * dir;
    const cy = line[idx][1] + (dx / len) * RESERVE_DEPTH * dir;
    const ang = i * 2.399963229; // golden-angle spread
    const rad = 1.7 * Math.sqrt((i + 0.5) / Math.max(1, n));
    return [Number((cx + rad * Math.cos(ang)).toFixed(4)), Number((cy + rad * Math.sin(ang)).toFixed(4))];
  };
  const inReserve = new Set(); // `${id}|${date}`
  const reserveAbs = [];
  for (const month of monthlyRosters) {
    const dNum = dateNum(month.date);
    const line = coordsFor(main, month.date);
    if (!line) continue;
    const placeReserve = (ids, side, posture) => {
      const uniq = [...new Set(ids)].filter((id) => {
        const u = units.get(id);
        return u && existsAt(u, dNum) && !isCuratedActive(u, dNum) && !inPocket.has(`${id}|${month.date}`);
      });
      uniq.forEach((id, i) => {
        inReserve.add(`${id}|${month.date}`);
        postureAt.set(`${id}|${month.date}`, posture);
        reserveAbs.push({ id, date: month.date, dNum, at: reserveAt(line, side, i, uniq.length) });
      });
    };
    // Soviet: the Reserve Front HQ itself + every formation under it this month.
    const su = [];
    const reserveFrontsSeen = new Set();
    for (const e of month.entries) {
      if (!RESERVE_SU_FRONTS.has(e.front)) continue;
      if (!reserveFrontsSeen.has(e.front)) {
        reserveFrontsSeen.add(e.front);
        su.push(e.front); // the front HQ marker
      }
      if (e.army) su.push(e.army);
      for (const c of e.corps ?? []) {
        su.push(c.unit);
        for (const d of c.divisions) su.push(d);
      }
      for (const d of e.divisions) su.push(d);
      for (const d of e.armor ?? []) su.push(d);
    }
    placeReserve(su, 'soviet', 'reserve');
    // German: EF divisions currently in a null-army gap whose last real army was
    // an Eastern-Front army (resting/refitting, not transferred to another front).
    const de = [];
    for (const id of deEF) {
      const div = deDivById.get(id);
      let cur = null;
      let prevReal = null;
      for (const [date, army] of div.events ?? []) {
        if (dateNum(date) <= dNum) {
          cur = army;
          if (army) prevReal = army;
        } else break;
      }
      if (!cur && prevReal && secDeArmies.has(prevReal)) de.push(id);
    }
    placeReserve(de, 'axis', 'refit');
  }

  const push = (id, date, f) => {
    const u = units.get(id);
    const dNum = dateNum(date);
    if (!existsAt(u, dNum) || isCuratedActive(u, dNum)) return;
    if (inPocket.has(`${id}|${date}`) || inReserve.has(`${id}|${date}`)) return; // placed elsewhere
    if (!derived.has(id)) derived.set(id, []);
    derived.get(id).push({ startNum: dNum, date, f: Number(f.toFixed(4)) });
  };
  // Place a top HQ (front / army group) at the CENTROID of its armies' actual
  // points — absolute, so it sits among its forces instead of being flung across
  // a salient by the deep top-echelon perpendicular offset a sector fraction
  // would apply at render.
  const pushHqAt = (id, date, pts) => {
    const u = units.get(id);
    const dNum = dateNum(date);
    if (!pts.length || !existsAt(u, dNum) || isCuratedActive(u, dNum)) return;
    if (inPocket.has(`${id}|${date}`) || inReserve.has(`${id}|${date}`)) return;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (!derived.has(id)) derived.set(id, []);
    derived.get(id).push({ startNum: dNum, date, at: [Number(cx.toFixed(4)), Number(cy.toFixed(4))] });
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
    for (const e of [...(k0.de ?? []), ...(k1.de ?? [])]) {
      if (deSeen.has(e.unit)) continue;
      deSeen.add(e.unit);
      // Encircled army: placed inside the ring by the pocket pre-pass; its stale
      // main-line midpoint must NOT feed the army-group average (the hgr block
      // below picks up its pocket position from the army -> hgr vote map).
      if (inPocket.has(`${e.unit}|${month.date}`)) continue;
      const span = spanFor('de', e.unit);
      if (!span) continue;
      const mid = (span[0] + span[1]) / 2;
      armyFrac.set(e.unit, mid);
      push(e.unit, month.date, mid);
      // Cluster the army's divisions at its sector centre; the client fans them
      // into a compact group (no long even row strung across the whole sector).
      const divs = deRoster.get(month.date)?.get(e.unit) ?? [];
      divs.forEach((d) => push(d.id, month.date, mid));
    }
    // German army groups: place each at the average position of EVERY army it
    // commands this month (from the division hgr votes), wherever that army is —
    // on the line (sector fraction) or encircled in a pocket. A group whose
    // armies are entirely pocketed (e.g. Heeresgruppe Don over Stalingrad)
    // follows them into the ring instead of vanishing; transient/renamed groups
    // (Don, Nordukraine) get a position as long as they command a placed army.
    if (monthHgr) {
      // Each army group at the centroid of EVERY army it commands this month,
      // wherever that army actually is: on the line (sector fraction -> point),
      // encircled (pocket pre-pass), or curated. A group whose armies are all
      // pocketed (Heeresgruppe Don over Stalingrad) follows them into the ring.
      const hgrPts = new Map();
      for (const [army, hgr] of monthHgr) {
        if (!hgr) continue;
        let pt = null;
        if (armyFrac.has(army)) pt = fracToPoint(line, armyFrac.get(army), 'axis', 'army');
        else if (inPocket.has(`${army}|${month.date}`)) pt = pocketPosOf.get(`${army}|${month.date}`);
        else {
          const au = units.get(army);
          if (au) pt = positionOn(au, month.date);
        }
        if (pt) {
          if (!hgrPts.has(hgr)) hgrPts.set(hgr, []);
          hgrPts.get(hgr).push(pt);
        }
      }
      for (const [hgr, pts] of hgrPts) pushHqAt(hgr, month.date, pts);
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
      const groups = entries.filter(
        (e) => e.divisions.length + (e.armor?.length ?? 0) + (e.corps?.length ?? 0) > 0,
      );
      const A = groups.length;
      const width = span[1] - span[0];
      const armyPts = [];
      groups.forEach((g, a) => {
        const center = span[0] + (width * (a + 0.5)) / A; // the army's sector centre
        if (g.army) push(g.army, month.date, center);
        armyPts.push(fracToPoint(line, center, 'soviet', 'army'));
        // Cluster the army's corps + divisions at its centre; the client fans them
        // into a compact group instead of an even row across the whole sector.
        const seen = new Set();
        const fresh = (d) => !seen.has(d) && seen.add(d);
        for (const c of g.corps ?? []) {
          if (!fresh(c.unit)) continue;
          push(c.unit, month.date, center);
          for (const d of c.divisions) if (fresh(d)) push(d, month.date, center);
        }
        for (const d of [...g.divisions, ...(g.armor ?? [])]) if (fresh(d)) push(d, month.date, center);
      });
      // Front HQ at the centroid of its armies (among its forces); fall back to
      // the sector centre when it has no placed armies this month.
      if (armyPts.length) pushHqAt(frontId, month.date, armyPts);
      else push(frontId, month.date, (span[0] + span[1]) / 2);
    }
  }

  // --- Finnish + Arctic theatre ---------------------------------------------
  // The Finnish-theatre units (fi-* + de-h-armee-20, and the Karelian-front
  // Soviet armies already in the OOB) sit on SEPARATE front lines, so they're
  // placed here against finnish-front / arctic-front (sectors/finnish.json),
  // reusing the same span + cluster machinery. The lines are authored N->S with
  // the Axis side on the right, so the standard perpendicular offset holds.
  // Detached fronts (off the main line): the Finnish/Arctic theatre and the 1942
  // Crimean Front (Kerch). Each file contributes `fronts` keyed by a front-feature
  // id; merge them so a unit rides whichever detached line its sector names.
  let finSectors = null;
  for (const file of ['finnish.json', 'crimea.json']) {
    try {
      const fronts = JSON.parse(readFileSync(`data/curated/sectors/${file}`, 'utf8')).fronts;
      finSectors = { ...(finSectors ?? {}), ...fronts };
    } catch {
      /* optional file */
    }
  }
  if (finSectors) {
    const sovietDivsOf = (month, armyId) => {
      const out = [];
      for (const e of month.entries) {
        if (e.army !== armyId) continue;
        for (const d of e.divisions ?? []) out.push(d);
        for (const d of e.armor ?? []) out.push(d);
        for (const c of e.corps ?? []) {
          out.push(c.unit);
          for (const d of c.divisions) out.push(d);
        }
      }
      return out;
    };
    for (const [frontId, sec] of Object.entries(finSectors)) {
      const feat = front.features.find((f) => f.id === frontId);
      if (!feat) continue;
      const sk = sec.keyframes;
      const tops = sec.top ?? {};
      for (const month of monthlyRosters) {
        const d = dateNum(month.date);
        const line = coordsFor(feat, month.date);
        if (!line) continue;
        let k0 = sk[0];
        let k1 = sk[sk.length - 1];
        for (let i = 0; i < sk.length; i++) {
          if (dateNum(sk[i].date) <= d) k0 = sk[i];
          if (dateNum(sk[i].date) > d) {
            k1 = sk[i];
            break;
          }
        }
        const dsp = diffDays(k0.date, k1.date);
        const t = dsp > 0 ? Math.max(0, Math.min(1, diffDays(k0.date, month.date) / dsp)) : 0;
        for (const sideKey of Object.keys(k0)) {
          if (sideKey === 'date') continue;
          const offSide = sideKey === 'su' ? 'soviet' : 'axis';
          const s0 = spansAt(k0, sideKey, line);
          const s1 = spansAt(k1, sideKey, line);
          const armyPts = [];
          for (const e of k0[sideKey]) {
            const a = s0.get(e.unit);
            const b = s1.get(e.unit);
            const span = a && b ? [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] : (a ?? b);
            if (!span) continue;
            const center = (span[0] + span[1]) / 2;
            push(e.unit, month.date, center);
            finFrontOf.set(e.unit, frontId);
            finFrontAt.set(`${e.unit}|${month.date}`, frontId);
            armyPts.push(fracToPoint(line, center, offSide, 'army'));
            // Cluster the anchored army's whole subtree at its sector centre: on
            // the axis side that is corps + their divisions (recurse one level
            // through the roster), on the Soviet side sovietDivsOf already does.
            const axisSubtree = (armyId) => {
              const out = [];
              for (const c of deRoster.get(month.date)?.get(armyId) ?? []) {
                out.push(c.id);
                for (const d of deRoster.get(month.date)?.get(c.id) ?? []) out.push(d.id);
              }
              return out;
            };
            const divs = offSide === 'axis' ? axisSubtree(e.unit) : sovietDivsOf(month, e.unit);
            for (const did of divs) {
              push(did, month.date, center);
              finFrontOf.set(did, frontId);
              finFrontAt.set(`${did}|${month.date}`, frontId);
            }
          }
          if (tops[sideKey] && armyPts.length) {
            pushHqAt(tops[sideKey], month.date, armyPts);
            finFrontOf.set(tops[sideKey], frontId);
            finFrontAt.set(`${tops[sideKey]}|${month.date}`, frontId);
          }
        }
      }
    }
  }

  // Merge pocket/reserve placements (absolute keyframes) into `derived` HERE,
  // BEFORE the air commands below — an air command anchored to a Front that is
  // placed as a pocket besieger (e.g. the North Caucasus Front sealing the Kuban
  // bridgehead) or to a Reserve Front has no main-line sector slot, so without
  // these its anchor has no position that month and the air command (e.g. the
  // 4th Air Army over the Kuban) silently drops out. Pocket precedence over the
  // main line; reserve for EF formations with no sector this month.
  let pocketPlaced = 0;
  for (const p of pocketAbs) {
    const u = units.get(p.id);
    if (!existsAt(u, p.dNum) || isCuratedActive(u, p.dNum)) continue;
    if (!derived.has(p.id)) derived.set(p.id, []);
    derived.get(p.id).push({ startNum: p.dNum, date: p.date, at: p.at });
    pocketPlaced++;
  }
  let reservePlaced = 0;
  for (const p of reserveAbs) {
    const u = units.get(p.id);
    if (!existsAt(u, p.dNum) || isCuratedActive(u, p.dNum)) continue;
    if (inPocket.has(`${p.id}|${p.date}`)) continue;
    if (!derived.has(p.id)) derived.set(p.id, []);
    derived.get(p.id).push({ startNum: p.dNum, date: p.date, at: p.at });
    reservePlaced++;
  }

  // --- Air commands: rear placement behind their ground anchor -------------
  // Each assigned air command (oob/air.json) is placed each roster month as an
  // ABSOLUTE keyframe offset into its own rear from its anchor's (Front /
  // army-group HQ) monthly position — air sits behind the line, not on it.
  if (airAssign) {
    const jitter = (s) => {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      return ((h >>> 0) % 1000) / 1000 - 0.5;
    };
    const REAR = 1.7; // degrees behind the anchor (deeper rear than the HQ itself)
    let airPlaced = 0;
    for (const [id, spans] of Object.entries(airAssign)) {
      const u = units.get(id);
      if (!u) continue;
      const jx = jitter(id + 'x');
      const jy = jitter(id + 'y');
      for (const month of monthlyRosters) {
        const dNum = dateNum(month.date);
        const span = spans.find((a) => dateNum(a.from) <= dNum && (!a.to || dNum < dateNum(a.to)));
        if (!span) continue;
        if (!existsAt(u, dNum) || isCuratedActive(u, dNum)) continue;
        // Anchor monthly position: derived HQ (front / army group) or curated track.
        let at = derived.get(span.anchor)?.find((k) => k.date === month.date && k.at)?.at;
        if (!at) {
          const au = units.get(span.anchor);
          if (au?.positions?.length) at = positionOn(au, month.date);
        }
        if (!at) continue;
        const dir = u.side === 'axis' ? -1 : 1; // axis rear = west, soviet rear = east
        const pt = [Number((at[0] + dir * REAR + jx * 0.6).toFixed(4)), Number((at[1] + jy * 0.7).toFixed(4))];
        if (!derived.has(id)) derived.set(id, []);
        derived.get(id).push({ startNum: dNum, date: month.date, at: pt });
        airPlaced++;
      }
    }
    console.log(`Air commands: ${airPlaced} rear placements behind fronts/army groups`);
  }

  // --- Air-battle showcases: cluster each battle's formations around their air
  // army's monthly position (golden-angle), for the battle window only.
  if (airBattles) {
    let battlePlaced = 0;
    for (const battle of airBattles) {
      const fromN = dateNum(battle.from);
      const toN = dateNum(battle.to);
      const akfs = derived.get(battle.army);
      if (!akfs) continue;
      // Place at the battle start + each roster month-first inside the window (so
      // a battle shorter than a month still renders from its opening day), using
      // the army's latest month-anchor at or before each placement date.
      const dates = [
        battle.from,
        ...monthlyRosters.map((m) => m.date).filter((d) => dateNum(d) > fromN && dateNum(d) < toN),
      ];
      for (const date of dates) {
        const dNum = dateNum(date);
        let army = null;
        for (const k of akfs) if (k.at && k.startNum <= dNum) army = k.at;
        if (!army) continue;
        battle.units.forEach((bu, i) => {
          const u = units.get(bu.id);
          if (!u || !existsAt(u, dNum) || isCuratedActive(u, dNum)) return;
          const ang = i * 2.399963229; // golden angle
          const rad = 0.2 + 0.06 * (i % 3);
          const at = [
            Number((army[0] + rad * Math.cos(ang)).toFixed(4)),
            Number((army[1] + rad * Math.sin(ang) * 0.7).toFixed(4)),
          ];
          if (!derived.has(bu.id)) derived.set(bu.id, []);
          derived.get(bu.id).push({ startNum: dNum, date, at });
          battlePlaced++;
        });
      }
    }
    console.log(`Air battles: ${battlePlaced} formation placements clustered around their army`);
  }

  console.log(
    `Derived fraction tracks for ${derived.size} units (${pocketPlaced} pocket, ${reservePlaced} reserve placements)`,
  );

  // Validation: do derived positions land on their unit's own side of the
  // front? This is the project's quality engine (city-control, curated units)
  // now applied to the 1k+ derived units. Reported, not fatal — the schematic
  // N->S sector model is weakest where the line runs E-W (Caucasus 1942) or
  // hugs a pocket. Replicates the client's pointAt so it checks the actually
  // rendered location, not just the fraction.
  // echGroup + fracToPoint (hoisted to module scope) mirror the client's
  // ECH_GROUP + ECH_DEPTH so the check validates the actually-rendered position.
  const TOL = 30; // km past the line before a wrong side counts (sector slop)
  // Reserve placements are schematic rear positions (deep in own territory by
  // construction), not line-derived — exempt from the line side-check.
  const reserveDays = new Set(reserveAbs.map((p) => `${p.id}|${p.date}`));
  // Nudge a wrong-side point to the nearest spot in `side`'s own territory:
  // search perpendicular to the line (both directions) at increasing distance
  // until the axis polygon agrees. Fixes the bend / E-W / loop cases a simple
  // sign-flip can't. Returns null if no nearby correct-side spot is found.
  const nudgeToSide = (line, lon, lat, side, axisPoly) => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < line.length; i++) {
      const dd = (line[i][0] - lon) ** 2 + (line[i][1] - lat) ** 2;
      if (dd < bd) {
        bd = dd;
        bi = i;
      }
    }
    const a = line[Math.max(0, bi - 2)];
    const b = line[Math.min(line.length - 1, bi + 2)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / L;
    const ny = (b[0] - a[0]) / L;
    for (const dist of [0.14, 0.3, 0.5, 0.8, 1.2, 1.8]) {
      for (const s of [1, -1]) {
        const px = line[bi][0] + nx * dist * s;
        const py = line[bi][1] + ny * dist * s;
        if ((inRing(axisPoly, px, py) ? 'axis' : 'soviet') === side) return [px, py];
      }
    }
    return null;
  };
  let checked = 0;
  let wrong = 0;
  let clamped = 0;
  const wrongByUnit = new Map();
  for (const [id, kfs] of derived) {
    const u = units.get(id);
    if (finUnitIds.has(id)) continue; // Finnish theatre sits on a separate line
    if (u.air) continue; // air commands are placed in their own rear by design
    const ech = echGroup(u.echelon);
    for (const kfv of kfs) {
      if (reserveDays.has(`${id}|${kfv.date}`)) continue;
      if (finFrontAt.has(`${id}|${kfv.date}`)) continue; // on a detached line this month
      const line = coordsFor(main, kfv.date);
      if (!line) continue;
      const axisPoly = axisPolygon(line);
      let [lon, lat] = kfv.at ? kfv.at : fracToPoint(line, kfv.f, u.side, ech);
      let inPocketRing = false;
      let drawn = null;
      for (const pf of pockets) {
        const ring = coordsFor(pf, kfv.date);
        if (ring && inRing(ring, lon, lat)) {
          drawn = pf.encircled;
          inPocketRing = true;
          break;
        }
      }
      if (!drawn) drawn = inRing(axisPoly, lon, lat) ? 'axis' : 'soviet';
      // SIDE-CLAMP: a derived unit on the wrong side of the line (sharp bend,
      // E-W segment, loop, or an HQ centroid) — nudge it into its own territory
      // and bake the corrected point absolute. Pockets are intentional, skip.
      if (drawn !== u.side && !inPocketRing) {
        const fix = nudgeToSide(line, lon, lat, u.side, axisPoly);
        if (fix) {
          kfv.at = [Number(fix[0].toFixed(4)), Number(fix[1].toFixed(4))];
          delete kfv.f;
          lon = fix[0];
          lat = fix[1];
          drawn = u.side;
          clamped++;
        }
      }
      checked++;
      if (drawn !== u.side && kmFromFront(line, lon, lat) > TOL) {
        wrong++;
        wrongByUnit.set(id, (wrongByUnit.get(id) ?? 0) + 1);
      }
    }
  }
  if (clamped) console.log(`Side-clamp: corrected ${clamped} wrong-side unit-months to their own side.`);
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
      // Front (sector) units emit a FRACTION keyframe resolved against the daily
      // line by the client, so they ride the moving front instead of lagging at
      // a stale monthly anchor (the lesson from the baked-anchor detachment).
      // Pocket / reserve placements stay absolute.
      const abs = Boolean(kf.at);
      // Which line this keyframe's fraction resolves against (detached theatre);
      // a change starts a new segment so each rides the correct line.
      const kfFront = finFrontAt.get(`${id}|${kf.date}`) ?? null;
      if (!cur || diffDays(cur.lastDate, kf.date) > 40 || cur.abs !== abs || cur.front !== kfFront) {
        cur = { kfs: [], lastDate: kf.date, abs, front: kfFront };
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
      ...(u.air ? { air: true, aircraft: u.aircraft ?? [] } : {}),
      // A segment renders ~35 days past its last keyframe (to bridge to the next
      // monthly keyframe), but never past the unit's recorded existence — so a
      // destroyed/withdrawn formation stops instead of lingering on the line —
      // and never past the START of the next segment, so a line (fraction)
      // segment can't stay active *through* an adjacent pocket segment and make
      // the client (which takes the first active segment) draw an encircled unit
      // back out on the moving line.
      segs: segs.map((s, i) => ({
        end: Math.min(
          dateNum(addDays(s.lastDate, 35)),
          u._existTo,
          i + 1 < segs.length ? segs[i + 1].kfs[0][0] : Infinity,
        ),
        // Which front line this segment's fractions resolve against (detached
        // theatre: Finnish/Arctic/Kerch); absent = the main front.
        ...(s.front ? { front: s.front } : {}),
        kfs: s.kfs,
      })),
      // Curated sparse waypoints (Phase C): override the derived anchor within
      // their span. [startNum, lon, lat], ascending.
      ...(waypointsOf.has(id)
        ? { wp: waypointsOf.get(id).map((r) => [dateNum(r.date), r.lng, r.lat]) }
        : {}),
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

// Posture timeline for a derived unit: compress its monthly postures into spans
// [{from, kind}] (encircled | reserve | refit | front). Null when the unit was
// always on the front (or isn't derived) — nothing extra to explain.
function posturesFor(id) {
  const kfs = derived.get(id);
  if (!kfs) return null;
  const spans = [];
  for (const kf of [...kfs].sort((a, b) => a.startNum - b.startNum)) {
    const kind = postureAt.get(`${id}|${kf.date}`) ?? 'front';
    if (spans.length && spans[spans.length - 1].kind === kind) continue;
    spans.push({ from: kf.date, kind });
  }
  return spans.some((s) => s.kind !== 'front') ? spans : null;
}

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
    ...(u.air ? { air: true } : {}),
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
    // Air units carry their aircraft inline so the air layer can size the range
    // ring (combat radius) per date without fetching the detail shard.
    ...(u.air ? { air: true, aircraft: u.aircraft ?? [] } : {}),
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
  const strengthRecs = strengthOf.get(u.id) ?? null;
  const usedSources = [
    ...new Set(
      [
        ...(u.positions ?? []).map((p) => p.source),
        ...(strengthRecs ?? []).map((r) => r.source),
        ...(waypointsOf.get(u.id) ?? []).map((r) => r.source),
      ].filter(Boolean),
    ),
  ];
  const waypoints = waypointsOf.has(u.id)
    ? waypointsOf.get(u.id).map((r) => ({ date: r.date, note: r.note ?? null, source: r.source ?? null }))
    : null;
  // Air units: a basing history (airfield spans) baked from the keyframes that
  // reference a field, each span open until the next based keyframe.
  const basedKfs = u.air ? (u.positions ?? []).filter((p) => p.base) : [];
  const bases = u.air
    ? basedKfs.map((p, i) => ({
        from: p.date,
        to: basedKfs[i + 1]?.date ?? null,
        airfield: p.base,
        label: p.label ?? null,
      }))
    : undefined;
  const detail = {
    id: u.id,
    country: u.country,
    side: u.side,
    branch: u.branch,
    echelon: u.echelon,
    type: u.type,
    short: u.short,
    ...(u.air ? { air: true, aircraft: u.aircraft ?? [], bases } : {}),
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
    strength: strengthRecs,
    image: imageOf.get(u.id) ?? null,
    postures: posturesFor(u.id),
    waypoints,
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
