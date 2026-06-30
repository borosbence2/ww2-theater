// Equipment catalog (Phase 5b). The key weapons and vehicles of the Eastern
// Front, authored once and referenced by id from the establishment templates
// (templates.ts `equipmentRefs`). Each entry carries a one-line spec and a
// Wikipedia link so the unit panel can show *what a formation fielded* with real
// detail. Curated, not exhaustive.

export type EquipClass = 'tank' | 'spg' | 'recon' | 'artillery' | 'at' | 'aa' | 'infantry' | 'transport';

export interface EquipEntry {
  name: string;
  cls: EquipClass;
  nation: 'DE' | 'SU' | 'IT' | 'HU' | 'RO' | 'FI' | 'GB' | 'GR' | 'YU' | 'BG';
  spec: string;
  wiki: string;
}

const W = (t: string) => `https://en.wikipedia.org/wiki/${t}`;

export const EQUIPMENT: Record<string, EquipEntry> = {
  // --- German ---
  'pz-ii': { name: 'Panzer II', cls: 'tank', nation: 'DE', spec: 'Light tank · 2 cm KwK 30', wiki: W('Panzer_II') },
  'pz-iii': { name: 'Panzer III', cls: 'tank', nation: 'DE', spec: 'Medium tank · 5 cm KwK', wiki: W('Panzer_III') },
  'pz-iv': { name: 'Panzer IV', cls: 'tank', nation: 'DE', spec: 'Medium tank · 7.5 cm KwK', wiki: W('Panzer_IV') },
  panther: { name: 'Panther (Pz V)', cls: 'tank', nation: 'DE', spec: 'Medium tank · 7.5 cm KwK 42 L/70', wiki: W('Panther_tank') },
  tiger: { name: 'Tiger I (Pz VI)', cls: 'tank', nation: 'DE', spec: 'Heavy tank · 8.8 cm KwK 36', wiki: W('Tiger_I') },
  'stug-iii': { name: 'StuG III', cls: 'spg', nation: 'DE', spec: 'Assault gun · 7.5 cm StuK', wiki: W('Sturmgesch%C3%BCtz_III') },
  marder: { name: 'Marder', cls: 'spg', nation: 'DE', spec: 'Tank destroyer · 7.5/7.62 cm', wiki: W('Marder_III') },
  'sdkfz-251': { name: 'Sd.Kfz. 251', cls: 'transport', nation: 'DE', spec: 'Armoured half-track', wiki: W('Sd.Kfz._251') },
  'sdkfz-222': { name: 'Sd.Kfz. 222', cls: 'recon', nation: 'DE', spec: 'Light armoured car · 2 cm', wiki: W('Leichter_Panzersp%C3%A4hwagen') },
  'pak-36': { name: '3.7 cm PaK 36', cls: 'at', nation: 'DE', spec: 'Anti-tank gun', wiki: W('Pak_36') },
  'pak-40': { name: '7.5 cm PaK 40', cls: 'at', nation: 'DE', spec: 'Anti-tank gun', wiki: W('Pak_40') },
  'flak-88': { name: '8.8 cm Flak', cls: 'aa', nation: 'DE', spec: 'Heavy AA / anti-tank', wiki: W('8.8_cm_Flak_18/36/37/41') },
  'lefh-18': { name: '10.5 cm leFH 18', cls: 'artillery', nation: 'DE', spec: 'Light field howitzer', wiki: W('10.5_cm_leFH_18') },
  'sfh-18': { name: '15 cm sFH 18', cls: 'artillery', nation: 'DE', spec: 'Heavy field howitzer', wiki: W('15_cm_sFH_18') },
  mg34: { name: 'MG 34', cls: 'infantry', nation: 'DE', spec: 'General-purpose machine gun', wiki: W('MG_34') },
  mg42: { name: 'MG 42', cls: 'infantry', nation: 'DE', spec: 'General-purpose machine gun', wiki: W('MG_42') },
  kar98k: { name: 'Karabiner 98k', cls: 'infantry', nation: 'DE', spec: 'Bolt-action rifle', wiki: W('Karabiner_98k') },
  'gw-34': { name: '8 cm GrW 34', cls: 'infantry', nation: 'DE', spec: 'Medium mortar', wiki: W('8_cm_Granatwerfer_34') },
  // --- Soviet ---
  't-34': { name: 'T-34', cls: 'tank', nation: 'SU', spec: 'Medium tank · 76/85 mm', wiki: W('T-34') },
  't-70': { name: 'T-70', cls: 'tank', nation: 'SU', spec: 'Light tank · 45 mm', wiki: W('T-70') },
  'kv-1': { name: 'KV-1', cls: 'tank', nation: 'SU', spec: 'Heavy tank · 76 mm', wiki: W('Kliment_Voroshilov_tank') },
  'ba-64': { name: 'BA-64', cls: 'recon', nation: 'SU', spec: 'Light armoured car', wiki: W('BA-64') },
  'zis-3': { name: '76 mm ZiS-3', cls: 'artillery', nation: 'SU', spec: 'Divisional gun (dual AT/field)', wiki: W('76_mm_divisional_gun_M1942_(ZiS-3)') },
  '45mm-m37': { name: '45 mm M1937', cls: 'at', nation: 'SU', spec: 'Anti-tank gun', wiki: W('45_mm_anti-tank_gun_M1937_(53-K)') },
  'm-30': { name: '122 mm M-30', cls: 'artillery', nation: 'SU', spec: 'Howitzer', wiki: W('122_mm_howitzer_M1938_(M-30)') },
  'ml-20': { name: '152 mm ML-20', cls: 'artillery', nation: 'SU', spec: 'Gun-howitzer', wiki: W('152_mm_howitzer-gun_M1937_(ML-20)') },
  '82-bm-37': { name: '82 mm BM-37', cls: 'infantry', nation: 'SU', spec: 'Medium mortar', wiki: W('82-BM-37') },
  '120-pm-38': { name: '120 mm PM-38', cls: 'infantry', nation: 'SU', spec: 'Heavy mortar', wiki: W('120-PM-38_mortar') },
  ppsh: { name: 'PPSh-41', cls: 'infantry', nation: 'SU', spec: 'Submachine gun', wiki: W('PPSh-41') },
  mosin: { name: 'Mosin–Nagant', cls: 'infantry', nation: 'SU', spec: 'Bolt-action rifle', wiki: W('Mosin%E2%80%93Nagant') },
  'dp-28': { name: 'DP-27', cls: 'infantry', nation: 'SU', spec: 'Light machine gun', wiki: W('Degtyaryov_machine_gun') },
  ptrd: { name: 'PTRD-41', cls: 'at', nation: 'SU', spec: 'Anti-tank rifle', wiki: W('PTRD-41') },
  // --- Italian (Regio Esercito) ---
  carcano: { name: 'Carcano M91', cls: 'infantry', nation: 'IT', spec: 'Bolt-action rifle · 6.5 mm', wiki: W('Carcano') },
  'breda-30': { name: 'Breda 30', cls: 'infantry', nation: 'IT', spec: 'Light machine gun', wiki: W('Breda_30') },
  'beretta-38': { name: 'Beretta M38', cls: 'infantry', nation: 'IT', spec: 'Submachine gun', wiki: W('Beretta_Model_38') },
  'mortaio-81': { name: 'Mortaio 81/14', cls: 'infantry', nation: 'IT', spec: '81 mm mortar', wiki: W('Mortaio_da_81/14_Modello_35') },
  'm13-40': { name: 'M13/40', cls: 'tank', nation: 'IT', spec: 'Medium tank · 47 mm', wiki: W('Fiat_M13/40') },
  'l3-35': { name: 'L3/35', cls: 'tank', nation: 'IT', spec: 'Tankette · 2× MG', wiki: W('L3/35') },
  'semovente-75-18': { name: 'Semovente 75/18', cls: 'spg', nation: 'IT', spec: 'Assault gun · 75 mm', wiki: W('Semovente_da_75/18') },
  'cannone-47-32': { name: 'Cannone 47/32', cls: 'at', nation: 'IT', spec: 'Anti-tank / infantry gun', wiki: W('Cannone_da_47/32') },
  'obice-75-18': { name: 'Obice 75/18', cls: 'artillery', nation: 'IT', spec: 'Pack howitzer', wiki: W('Obice_da_75/18_modello_34') },
  'obice-100-17': { name: 'Obice 100/17', cls: 'artillery', nation: 'IT', spec: 'Field howitzer', wiki: W('Obice_da_100/17') },
  // --- Hungarian (Honvédség) ---
  'hu-mannlicher': { name: '35M Mannlicher', cls: 'infantry', nation: 'HU', spec: 'Bolt-action rifle · 8 mm', wiki: W('Mannlicher_M1895') },
  'hu-schwarzlose': { name: 'Schwarzlose MG', cls: 'infantry', nation: 'HU', spec: 'Heavy machine gun', wiki: W('Schwarzlose_machine_gun') },
  turan: { name: 'Turán', cls: 'tank', nation: 'HU', spec: 'Medium tank · 40/75 mm', wiki: W('Tur%C3%A1n_(tank)') },
  toldi: { name: 'Toldi', cls: 'tank', nation: 'HU', spec: 'Light tank · 20 mm', wiki: W('Toldi_(tank)') },
  nimrod: { name: 'Nimród', cls: 'aa', nation: 'HU', spec: 'SP AA / anti-tank · 40 mm', wiki: W('40M_Nimr%C3%B3d') },
  zrinyi: { name: 'Zrínyi', cls: 'spg', nation: 'HU', spec: 'Assault howitzer · 105 mm', wiki: W('43M_Zr%C3%ADnyi') },
  // --- Romanian (Armata Română) ---
  'ro-vz24': { name: 'md. 1924 (vz. 24)', cls: 'infantry', nation: 'RO', spec: 'Mauser rifle · 7.92 mm', wiki: W('Vz._24') },
  'zb-30': { name: 'ZB vz. 30', cls: 'infantry', nation: 'RO', spec: 'Light machine gun', wiki: W('ZB_vz._30') },
  'r-2-tank': { name: 'R-2', cls: 'tank', nation: 'RO', spec: 'Light tank (LT vz. 35)', wiki: W('LT_vz._35') },
  'tacam-r2': { name: 'TACAM R-2', cls: 'spg', nation: 'RO', spec: 'Tank destroyer · 76 mm', wiki: W('TACAM_R-2') },
  'bofors-37': { name: 'Bofors 37 mm', cls: 'at', nation: 'RO', spec: 'Anti-tank gun', wiki: W('Bofors_37_mm') },
  'skoda-100': { name: 'Škoda 100 mm', cls: 'artillery', nation: 'RO', spec: 'Mountain/field howitzer', wiki: W('%C5%A0koda_100_mm_Model_1914') },
  // --- Finnish (Maavoimat) ---
  'fi-m39': { name: 'Rifle M/39', cls: 'infantry', nation: 'FI', spec: 'Finnish Mosin–Nagant', wiki: W('Mosin%E2%80%93Nagant') },
  suomi: { name: 'Suomi KP/-31', cls: 'infantry', nation: 'FI', spec: 'Submachine gun', wiki: W('Suomi_KP/-31') },
  'lahti-saloranta': { name: 'Lahti-Saloranta M/26', cls: 'infantry', nation: 'FI', spec: 'Light machine gun', wiki: W('Lahti-Saloranta_M/26') },
  'lahti-l39': { name: 'Lahti L-39', cls: 'at', nation: 'FI', spec: '20 mm anti-tank rifle', wiki: W('Lahti_L-39') },
  // --- British / Commonwealth ---
  'lee-enfield': { name: 'Lee–Enfield', cls: 'infantry', nation: 'GB', spec: 'Bolt-action rifle · .303', wiki: W('Lee%E2%80%93Enfield') },
  bren: { name: 'Bren', cls: 'infantry', nation: 'GB', spec: 'Light machine gun', wiki: W('Bren_light_machine_gun') },
  sten: { name: 'Sten', cls: 'infantry', nation: 'GB', spec: 'Submachine gun', wiki: W('STEN') },
  'qf-2pdr': { name: 'QF 2-pounder', cls: 'at', nation: 'GB', spec: 'Anti-tank gun', wiki: W('Ordnance_QF_2-pounder') },
  'qf-25pdr': { name: 'QF 25-pounder', cls: 'artillery', nation: 'GB', spec: 'Field gun-howitzer', wiki: W('Ordnance_QF_25-pounder') },
  // --- Greek / Yugoslav / Bulgarian ---
  'gr-ms': { name: 'Mannlicher–Schönauer', cls: 'infantry', nation: 'GR', spec: 'Bolt-action rifle · 6.5 mm', wiki: W('Mannlicher%E2%80%93Sch%C3%B6nauer') },
  'hotchkiss-mg': { name: 'Hotchkiss M1914', cls: 'infantry', nation: 'GR', spec: 'Heavy machine gun', wiki: W('Hotchkiss_M1914_machine_gun') },
  'yu-m24': { name: 'M1924 Mauser', cls: 'infantry', nation: 'YU', spec: 'Bolt-action rifle · 7.92 mm', wiki: W('Zastava_M24') },
  'zb-26': { name: 'ZB vz. 26', cls: 'infantry', nation: 'YU', spec: 'Light machine gun', wiki: W('ZB_vz._26') },
  'bg-m95': { name: 'Mannlicher M95', cls: 'infantry', nation: 'BG', spec: 'Bolt-action rifle', wiki: W('Mannlicher_M1895') },
};

export const EQUIP_CLASS_LABEL: Record<EquipClass, string> = {
  tank: 'Armour',
  spg: 'Assault guns / TD',
  recon: 'Reconnaissance',
  artillery: 'Artillery',
  at: 'Anti-tank',
  aa: 'Anti-aircraft',
  infantry: 'Infantry weapons',
  transport: 'Transport',
};

const CLASS_ORDER: EquipClass[] = ['tank', 'spg', 'recon', 'artillery', 'at', 'aa', 'infantry', 'transport'];

/** Resolve a formation's `equipmentRefs` into catalog entries grouped by class. */
export function groupedEquipment(refs: string[] | undefined): { cls: EquipClass; items: (EquipEntry & { id: string })[] }[] {
  if (!refs?.length) return [];
  const byClass = new Map<EquipClass, (EquipEntry & { id: string })[]>();
  for (const id of refs) {
    const e = EQUIPMENT[id];
    if (!e) continue;
    if (!byClass.has(e.cls)) byClass.set(e.cls, []);
    byClass.get(e.cls)!.push({ ...e, id });
  }
  return CLASS_ORDER.filter((c) => byClass.has(c)).map((cls) => ({ cls, items: byClass.get(cls)! }));
}
