// Minor-Axis divisional scaffolds (Romanian, Hungarian, Italian) for the Don /
// Stalingrad flank, summer 1942 -> destruction in the Uranus/Little Saturn
// counteroffensives, early 1943. Until now only the minor-Axis ARMIES were on
// the map (3./4. Romanian, 8. Italian, 2. Hungarian); their constituent
// divisions were absent, so the Don flank looked empty below army level.
//
// Each division deploys under its army (all under Heeresgruppe B in 1942), in
// the same `events: [[date, army, hgr]]` shape as the German Lexikon OOB, so
// build-units gives them parents + a roster slot and places them inside their
// army's sector slice exactly like a German division. Representative — the major
// formations of each army, not an exhaustive order of battle.
//
// Output: data/curated/units/oob/minor-axis.json   (committed, reviewable)

import { writeFileSync } from 'node:fs';

const HGR = 'de-h-hgr-b';
const FROM = '1942-07-01';
const TO = '1943-03-01';

const NATION = { ro: 'Romanian', hu: 'Hungarian', it: 'Italian' };
const COUNTRY = { ro: 'RO', hu: 'HU', it: 'IT' };

// [id-stem, English name, short label, type, army-id]
const DIV = [
  // 3rd Romanian Army — north-west of Stalingrad, on the Don (broken by Uranus)
  ['ro-1st-cavalry-division', '1st Romanian Cavalry Division', '1 Cav', 'cavalry', 'ro-armee-3'],
  ['ro-7th-cavalry-division', '7th Romanian Cavalry Division', '7 Cav', 'cavalry', 'ro-armee-3'],
  ['ro-5th-infantry-division', '5th Romanian Infantry Division', '5 Inf', 'infantry', 'ro-armee-3'],
  ['ro-6th-infantry-division', '6th Romanian Infantry Division', '6 Inf', 'infantry', 'ro-armee-3'],
  ['ro-9th-infantry-division', '9th Romanian Infantry Division', '9 Inf', 'infantry', 'ro-armee-3'],
  ['ro-13th-infantry-division', '13th Romanian Infantry Division', '13 Inf', 'infantry', 'ro-armee-3'],
  ['ro-14th-infantry-division', '14th Romanian Infantry Division', '14 Inf', 'infantry', 'ro-armee-3'],
  ['ro-15th-infantry-division', '15th Romanian Infantry Division', '15 Inf', 'infantry', 'ro-armee-3'],
  // 4th Romanian Army — south of Stalingrad (broken by Uranus)
  ['ro-1st-infantry-division', '1st Romanian Infantry Division', '1 Inf', 'infantry', 'ro-armee-4'],
  ['ro-2nd-infantry-division', '2nd Romanian Infantry Division', '2 Inf', 'infantry', 'ro-armee-4'],
  ['ro-4th-infantry-division', '4th Romanian Infantry Division', '4 Inf', 'infantry', 'ro-armee-4'],
  ['ro-18th-infantry-division', '18th Romanian Infantry Division', '18 Inf', 'infantry', 'ro-armee-4'],
  ['ro-20th-infantry-division', '20th Romanian Infantry Division', '20 Inf', 'infantry', 'ro-armee-4'],
  ['ro-5th-cavalry-division', '5th Romanian Cavalry Division', '5 Cav', 'cavalry', 'ro-armee-4'],
  ['ro-8th-cavalry-division', '8th Romanian Cavalry Division', '8 Cav', 'cavalry', 'ro-armee-4'],
  // 8th Italian Army (ARMIR) — on the Don (broken by Little Saturn)
  ['it-pasubio-division', 'Pasubio Division', 'Pasubio', 'infantry', 'it-armee-8'],
  ['it-torino-division', 'Torino Division', 'Torino', 'infantry', 'it-armee-8'],
  ['it-sforzesca-division', 'Sforzesca Division', 'Sforzesca', 'infantry', 'it-armee-8'],
  ['it-ravenna-division', 'Ravenna Division', 'Ravenna', 'infantry', 'it-armee-8'],
  ['it-cosseria-division', 'Cosseria Division', 'Cosseria', 'infantry', 'it-armee-8'],
  ['it-3rd-celere-division', '3rd Celere Division "PADA"', '3 Celere', 'motorized', 'it-armee-8'],
  ['it-tridentina-division', 'Tridentina Alpine Division', 'Tridentina', 'infantry', 'it-armee-8'],
  ['it-julia-division', 'Julia Alpine Division', 'Julia', 'infantry', 'it-armee-8'],
  ['it-cuneense-division', 'Cuneense Alpine Division', 'Cuneense', 'infantry', 'it-armee-8'],
  // 2nd Hungarian Army — on the Don around Voronezh (broken in Jan 1943)
  ['hu-1st-armored-division', '1st Hungarian Armoured Division', '1 Arm', 'armoured', 'hu-armee-2'],
  ['hu-6th-light-division', '6th Hungarian Light Division', '6 Lt', 'infantry', 'hu-armee-2'],
  ['hu-7th-light-division', '7th Hungarian Light Division', '7 Lt', 'infantry', 'hu-armee-2'],
  ['hu-9th-light-division', '9th Hungarian Light Division', '9 Lt', 'infantry', 'hu-armee-2'],
  ['hu-12th-light-division', '12th Hungarian Light Division', '12 Lt', 'infantry', 'hu-armee-2'],
  ['hu-13th-light-division', '13th Hungarian Light Division', '13 Lt', 'infantry', 'hu-armee-2'],
  ['hu-20th-light-division', '20th Hungarian Light Division', '20 Lt', 'infantry', 'hu-armee-2'],
  ['hu-23rd-light-division', '23rd Hungarian Light Division', '23 Lt', 'infantry', 'hu-armee-2'],
];

const units = [];
const divisions = [];
for (const [id, name, short, type, army] of DIV) {
  const cc = id.slice(0, 2);
  units.push({
    id,
    country: COUNTRY[cc],
    branch: NATION[cc],
    echelon: 'division',
    type,
    short,
    names: [{ from: FROM, name, aliases: [] }],
    existence: [{ from: FROM, to: TO }],
    parents: [],
    positions: [],
    links: {},
    imported: true,
  });
  divisions.push({ id, label: name, events: [[FROM, army, HGR]] });
}

const out = {
  note:
    'Minor-Axis (Romanian/Hungarian/Italian) divisional scaffolds for the Don / ' +
    'Stalingrad flank, summer 1942 -> early 1943. Generated by build-minor-axis.mjs. ' +
    'Representative major formations, deployed under their army (Heeresgruppe B); ' +
    'build-units places them in the army sector slice like German divisions.',
  units,
  divisions,
};
writeFileSync('data/curated/units/oob/minor-axis.json', JSON.stringify(out, null, 1));
console.log(`Wrote ${units.length} minor-Axis divisions -> data/curated/units/oob/minor-axis.json`);
