// Aircraft catalog (air forces). The key combat aircraft of the Eastern Front,
// authored once and referenced by id from the air-unit files (`aircraft` field).
// Each entry carries the HOI4-style stats the unit panel shows — role, speed,
// operational range, combat radius (drives the range ring), service ceiling,
// a one-line armament summary, intro year, and a Wikipedia link. Curated, not
// exhaustive. Mirrors the pattern of ./equipment.

export type AircraftRole =
  | 'fighter'
  | 'heavy-fighter'
  | 'dive-bomber'
  | 'ground-attack'
  | 'bomber'
  | 'night-fighter'
  | 'recon'
  | 'transport';

export interface AircraftEntry {
  name: string;
  role: AircraftRole;
  nation: 'DE' | 'SU' | 'US' | 'GB';
  /** Max speed, km/h. */
  speed: number;
  /** Operational range, km (one-way ferry/operational figure). */
  range: number;
  /** Combat radius, km — what the range ring draws (curated; ~range/2 adjusted
   *  for combat load, reserves, and time-on-station). */
  radius: number;
  /** Service ceiling, m. */
  ceiling?: number;
  /** One-line armament summary. */
  armament: string;
  /** Service-introduction year (of the variant modelled here). */
  intro: number;
  wiki: string;
}

const W = (t: string) => `https://en.wikipedia.org/wiki/${t}`;

export const AIRCRAFT: Record<string, AircraftEntry> = {
  // --- Luftwaffe ---
  'bf-109f': {
    name: 'Bf 109 F', role: 'fighter', nation: 'DE', speed: 615, range: 850, radius: 420,
    ceiling: 12000, armament: '1×15 mm MG 151 + 2×7.92 mm MG 17', intro: 1941, wiki: W('Messerschmitt_Bf_109'),
  },
  'bf-109g': {
    name: 'Bf 109 G', role: 'fighter', nation: 'DE', speed: 640, range: 850, radius: 430,
    ceiling: 12000, armament: '1×20/30 mm cannon + 2×13 mm MG 131', intro: 1942, wiki: W('Messerschmitt_Bf_109'),
  },
  'fw-190a': {
    name: 'Fw 190 A', role: 'fighter', nation: 'DE', speed: 656, range: 800, radius: 400,
    ceiling: 11400, armament: '4×20 mm cannon + 2×13 mm MG', intro: 1941, wiki: W('Focke-Wulf_Fw_190'),
  },
  'bf-110': {
    name: 'Bf 110', role: 'heavy-fighter', nation: 'DE', speed: 560, range: 1300, radius: 600,
    ceiling: 10500, armament: '2×20 mm + 4×7.92 mm forward, 1× rear MG', intro: 1939, wiki: W('Messerschmitt_Bf_110'),
  },
  'ju-87d': {
    name: 'Ju 87 D Stuka', role: 'dive-bomber', nation: 'DE', speed: 410, range: 1165, radius: 320,
    ceiling: 7300, armament: '2×7.92 mm + ~1,800 kg bombs', intro: 1941, wiki: W('Junkers_Ju_87'),
  },
  'ju-87g': {
    name: 'Ju 87 G', role: 'ground-attack', nation: 'DE', speed: 375, range: 1000, radius: 300,
    ceiling: 7300, armament: '2×37 mm BK 3,7 anti-tank cannon', intro: 1943, wiki: W('Junkers_Ju_87'),
  },
  'hs-129': {
    name: 'Hs 129', role: 'ground-attack', nation: 'DE', speed: 407, range: 690, radius: 250,
    ceiling: 9000, armament: '1×30 mm (up to 75 mm) + 2×20 mm', intro: 1942, wiki: W('Henschel_Hs_129'),
  },
  'he-111h': {
    name: 'He 111 H', role: 'bomber', nation: 'DE', speed: 440, range: 2300, radius: 900,
    ceiling: 6500, armament: '~2,000 kg bombs + defensive MG', intro: 1940, wiki: W('Heinkel_He_111'),
  },
  'ju-88a': {
    name: 'Ju 88 A', role: 'bomber', nation: 'DE', speed: 510, range: 2430, radius: 950,
    ceiling: 9000, armament: '~2,500 kg bombs + defensive MG', intro: 1939, wiki: W('Junkers_Ju_88'),
  },
  'ju-52': {
    name: 'Ju 52', role: 'transport', nation: 'DE', speed: 265, range: 1000, radius: 450,
    ceiling: 5500, armament: 'Transport — ~18 troops / 2,300 kg cargo', intro: 1932, wiki: W('Junkers_Ju_52'),
  },
  'fw-189': {
    name: 'Fw 189 Uhu', role: 'recon', nation: 'DE', speed: 350, range: 670, radius: 300,
    ceiling: 7300, armament: 'Recon — 4×7.92 mm MG', intro: 1940, wiki: W('Focke-Wulf_Fw_189'),
  },

  // --- Soviet VVS ---
  'il-2': {
    name: 'Il-2 Shturmovik', role: 'ground-attack', nation: 'SU', speed: 414, range: 720, radius: 300,
    ceiling: 5500, armament: '2×23 mm VYa + 2×7.62 mm + rockets/bombs', intro: 1941, wiki: W('Ilyushin_Il-2'),
  },
  'pe-2': {
    name: 'Pe-2', role: 'bomber', nation: 'SU', speed: 580, range: 1160, radius: 500,
    ceiling: 8800, armament: '~1,000 kg bombs + 4× MG', intro: 1941, wiki: W('Petlyakov_Pe-2'),
  },
  'il-4': {
    name: 'Il-4', role: 'bomber', nation: 'SU', speed: 430, range: 3800, radius: 1100,
    ceiling: 8900, armament: '~2,500 kg bombs + 3× MG', intro: 1940, wiki: W('Ilyushin_Il-4'),
  },
  'lagg-3': {
    name: 'LaGG-3', role: 'fighter', nation: 'SU', speed: 575, range: 1100, radius: 380,
    ceiling: 9700, armament: '1×20 mm ShVAK + 1×12.7 mm', intro: 1941, wiki: W('Lavochkin-Gorbunov-Gudkov_LaGG-3'),
  },
  'la-5': {
    name: 'La-5', role: 'fighter', nation: 'SU', speed: 630, range: 1000, radius: 400,
    ceiling: 11000, armament: '2×20 mm ShVAK cannon', intro: 1942, wiki: W('Lavochkin_La-5'),
  },
  'yak-1': {
    name: 'Yak-1', role: 'fighter', nation: 'SU', speed: 592, range: 700, radius: 320,
    ceiling: 10000, armament: '1×20 mm ShVAK + 2×7.62 mm', intro: 1941, wiki: W('Yakovlev_Yak-1'),
  },
  'yak-9': {
    name: 'Yak-9', role: 'fighter', nation: 'SU', speed: 591, range: 1360, radius: 450,
    ceiling: 11100, armament: '1×20 mm + 1–2×12.7 mm', intro: 1942, wiki: W('Yakovlev_Yak-9'),
  },
  'mig-3': {
    name: 'MiG-3', role: 'fighter', nation: 'SU', speed: 640, range: 820, radius: 350,
    ceiling: 12000, armament: '1×12.7 mm + 2×7.62 mm', intro: 1941, wiki: W('Mikoyan-Gurevich_MiG-3'),
  },
  'po-2': {
    name: 'Po-2 (U-2)', role: 'night-fighter', nation: 'SU', speed: 152, range: 630, radius: 200,
    ceiling: 3000, armament: 'Night harassment — ~300 kg light bombs', intro: 1929, wiki: W('Polikarpov_Po-2'),
  },
  'p-39': {
    name: 'P-39 Airacobra', role: 'fighter', nation: 'US', speed: 605, range: 840, radius: 400,
    ceiling: 10700, armament: '1×37 mm + 2×12.7 mm + 4×7.62 mm', intro: 1942, wiki: W('Bell_P-39_Airacobra'),
  },
};

export const ROLE_LABEL: Record<AircraftRole, string> = {
  fighter: 'Fighters',
  'heavy-fighter': 'Heavy fighters',
  'dive-bomber': 'Dive bombers',
  'ground-attack': 'Ground attack',
  bomber: 'Bombers',
  'night-fighter': 'Night / harassment',
  recon: 'Reconnaissance',
  transport: 'Transport',
};

const ROLE_ORDER: AircraftRole[] = [
  'fighter', 'heavy-fighter', 'ground-attack', 'dive-bomber',
  'bomber', 'night-fighter', 'recon', 'transport',
];

/** Resolve an air unit's aircraft ids into catalog entries grouped by role. */
export function groupedAircraft(
  refs: string[] | undefined,
): { role: AircraftRole; items: (AircraftEntry & { id: string })[] }[] {
  if (!refs?.length) return [];
  const byRole = new Map<AircraftRole, (AircraftEntry & { id: string })[]>();
  for (const id of refs) {
    const a = AIRCRAFT[id];
    if (!a) continue;
    if (!byRole.has(a.role)) byRole.set(a.role, []);
    byRole.get(a.role)!.push({ ...a, id });
  }
  return ROLE_ORDER.filter((r) => byRole.has(r)).map((role) => ({ role, items: byRole.get(role)! }));
}
