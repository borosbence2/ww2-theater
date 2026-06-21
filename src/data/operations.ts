// Curated major operations (Phase 5.4). A small, hand-authored set of the
// signature offensives, each one or more big sweeping arrows shown only during
// its date window. Coordinates are approximate axes of advance (control points,
// lng/lat) — editorial, not a survey; the dynamic advance arrows handle the
// day-to-day front movement, these name and shape the set-piece operations.

export interface Operation {
  id: string;
  name: string;
  side: 'axis' | 'soviet';
  /** Inclusive window [from, to] (ISO) the arrows are shown. */
  from: string;
  to: string;
  /** Each arrow is a list of control points (lng, lat) along its axis. */
  arrows: [number, number][][];
  /** Where to anchor the operation label (defaults to the first arrow's base). */
  labelAt?: [number, number];
}

export const OPERATIONS: Operation[] = [
  {
    id: 'barbarossa',
    name: 'Operation Barbarossa',
    side: 'axis',
    from: '1941-06-22',
    to: '1941-08-05',
    // Three army groups: North toward Pskov, Centre toward Smolensk, South toward Kiev.
    arrows: [
      [
        [22.3, 55.0],
        [25.5, 55.9],
        [28.3, 57.8],
      ],
      [
        [23.2, 52.5],
        [27.6, 53.9],
        [32.0, 54.8],
      ],
      [
        [23.6, 50.6],
        [26.8, 50.4],
        [30.0, 50.4],
      ],
    ],
    labelAt: [21.6, 56.2],
  },
  {
    id: 'typhoon',
    name: 'Operation Typhoon',
    side: 'axis',
    from: '1941-09-30',
    to: '1941-12-05',
    // The drive on Moscow — Vyazma in the centre, the Tula thrust in the south.
    arrows: [
      [
        [32.0, 54.8],
        [34.3, 55.2],
        [36.8, 55.6],
      ],
      [
        [33.5, 53.0],
        [36.0, 53.7],
        [37.8, 54.3],
      ],
    ],
    labelAt: [33.0, 56.4],
  },
  {
    id: 'moscow-counter',
    name: 'Moscow counter-offensive',
    side: 'soviet',
    from: '1941-12-05',
    to: '1942-01-10',
    // The winter throw-back of Army Group Centre, north and south of Moscow.
    arrows: [
      [
        [37.2, 56.4],
        [35.4, 56.3],
        [33.8, 56.0],
      ],
      [
        [37.7, 54.2],
        [36.0, 54.0],
        [34.3, 53.7],
      ],
    ],
    labelAt: [38.2, 56.8],
  },
  {
    id: 'fall-blau',
    name: 'Case Blue',
    side: 'axis',
    from: '1942-06-28',
    to: '1942-09-10',
    // The 1942 summer offensive: one prong to Stalingrad, one into the Caucasus.
    arrows: [
      [
        [36.4, 50.6],
        [39.2, 51.4],
        [44.2, 48.8],
      ],
      [
        [39.6, 47.4],
        [41.2, 45.0],
        [44.6, 43.4],
      ],
    ],
    labelAt: [37.6, 49.3],
  },
  {
    id: 'uranus',
    name: 'Operation Uranus',
    side: 'soviet',
    from: '1942-11-19',
    to: '1942-12-05',
    // Twin pincers from the Don bridgeheads and south of Stalingrad onto Kalach.
    arrows: [
      [
        [42.3, 49.5],
        [42.9, 49.05],
        [43.5, 48.75],
      ],
      [
        [44.7, 48.0],
        [44.05, 48.35],
        [43.6, 48.7],
      ],
    ],
    labelAt: [42.4, 49.9],
  },
  {
    id: 'zitadelle',
    name: 'Operation Citadel',
    side: 'axis',
    from: '1943-07-05',
    to: '1943-07-16',
    // German pincers against the Kursk salient (Orel north, Belgorod south).
    arrows: [
      [
        [36.0, 52.9],
        [36.05, 52.4],
        [36.15, 52.0],
      ],
      [
        [36.55, 50.7],
        [36.35, 51.1],
        [36.2, 51.45],
      ],
    ],
    labelAt: [37.4, 51.7],
  },
  {
    id: 'bagration',
    name: 'Operation Bagration',
    side: 'soviet',
    from: '1944-06-23',
    to: '1944-07-18',
    // Vitebsk + Mogilev thrusts onto Minsk, then the drive west toward the Vistula.
    arrows: [
      [
        [30.2, 55.1],
        [28.6, 54.4],
        [27.6, 54.0],
      ],
      [
        [30.3, 53.9],
        [28.9, 53.85],
        [27.7, 53.9],
      ],
      [
        [27.6, 53.95],
        [25.0, 53.7],
        [23.3, 53.0],
      ],
    ],
    labelAt: [30.4, 55.3],
  },
  {
    id: 'lvov-sandomierz',
    name: 'Lvov–Sandomierz',
    side: 'soviet',
    from: '1944-07-13',
    to: '1944-08-29',
    // The southern half of the summer 1944 offensive, into Galicia to the Vistula.
    arrows: [
      [
        [25.8, 49.9],
        [23.6, 50.1],
        [21.7, 50.7],
      ],
    ],
    labelAt: [26.2, 49.6],
  },
  {
    id: 'vistula-oder',
    name: 'Vistula–Oder',
    side: 'soviet',
    from: '1945-01-12',
    to: '1945-02-03',
    // From the Vistula bridgeheads across Poland to the Oder.
    arrows: [
      [
        [21.0, 52.1],
        [17.5, 52.3],
        [14.8, 52.5],
      ],
      [
        [21.7, 50.7],
        [18.3, 51.0],
        [15.5, 51.3],
      ],
    ],
    labelAt: [19.0, 53.1],
  },
  {
    id: 'berlin',
    name: 'Battle of Berlin',
    side: 'soviet',
    from: '1945-04-16',
    to: '1945-05-02',
    // The final converging pincers from the Oder onto Berlin.
    arrows: [
      [
        [14.6, 52.85],
        [13.9, 52.75],
        [13.45, 52.56],
      ],
      [
        [14.7, 51.95],
        [13.8, 52.2],
        [13.4, 52.45],
      ],
    ],
    labelAt: [15.1, 53.0],
  },
];
