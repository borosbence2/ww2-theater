// Equipment catalog (Phase 5b). The key weapons and vehicles of the Eastern
// Front, authored once and referenced by id from the establishment templates
// (templates.ts `equipmentRefs`). Each entry carries a one-line spec and a
// Wikipedia link so the unit panel can show *what a formation fielded* with real
// detail. Curated, not exhaustive.

export type EquipClass = 'tank' | 'spg' | 'recon' | 'artillery' | 'at' | 'aa' | 'infantry' | 'transport';

export interface EquipEntry {
  name: string;
  cls: EquipClass;
  nation: 'DE' | 'SU';
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
