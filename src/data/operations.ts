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
  // --- 1939-40: the war before Barbarossa -----------------------------------
  {
    id: 'fall-weiss',
    name: 'Invasion of Poland',
    side: 'axis',
    from: '1939-09-01',
    to: '1939-09-28',
    // Concentric thrusts: Pomerania cuts the Corridor, Silesia drives on Łódź/
    // Warsaw, East Prussia presses south, the south wing swings up from Kraków.
    arrows: [
      [
        [16.6, 53.4],
        [17.8, 53.5],
        [18.8, 53.4],
      ],
      [
        [18.4, 51.5],
        [19.6, 51.9],
        [20.8, 52.2],
      ],
      [
        [21.2, 53.7],
        [21.3, 53.0],
        [21.1, 52.45],
      ],
      [
        [19.9, 50.0],
        [21.4, 50.3],
        [22.5, 51.0],
      ],
    ],
    labelAt: [17.6, 50.5],
  },
  {
    id: 'soviet-poland-1939',
    name: 'Soviet invasion of Poland',
    side: 'soviet',
    from: '1939-09-17',
    to: '1939-09-29',
    // The Red Army crosses the eastern border (17 Sep) onto Wilno, Brześć, Lwów.
    arrows: [
      [
        [27.2, 54.6],
        [25.2, 54.5],
        [23.7, 53.9],
      ],
      [
        [26.6, 52.4],
        [24.8, 52.2],
        [23.6, 52.1],
      ],
      [
        [26.6, 49.9],
        [25.0, 49.85],
        [24.0, 49.84],
      ],
    ],
    labelAt: [27.6, 53.1],
  },
  {
    id: 'winter-war',
    name: 'Winter War',
    side: 'soviet',
    from: '1939-11-30',
    to: '1940-03-13',
    // The Karelian Isthmus drive on Viipuri, Ladoga Karelia, and the failed
    // thrusts toward Suomussalmi and Salla in the central/northern wilderness.
    arrows: [
      [
        [30.2, 60.15],
        [29.4, 60.45],
        [28.2, 60.7],
      ],
      [
        [31.9, 61.4],
        [31.0, 61.9],
        [30.4, 62.3],
      ],
      [
        [30.6, 64.9],
        [29.6, 64.9],
        [28.9, 64.9],
      ],
      [
        [30.2, 66.9],
        [29.0, 66.85],
        [28.5, 66.83],
      ],
    ],
    labelAt: [31.8, 63.4],
  },
  {
    id: 'baltic-occupation',
    name: 'Occupation of the Baltic states',
    side: 'soviet',
    from: '1940-06-15',
    to: '1940-08-06',
    // Soviet armies move into Estonia, Latvia and Lithuania (annexed Aug 1940).
    arrows: [
      [
        [28.8, 58.6],
        [26.5, 58.9],
        [24.9, 59.4],
      ],
      [
        [28.2, 56.6],
        [26.0, 56.85],
        [24.2, 56.95],
      ],
      [
        [26.6, 54.9],
        [25.0, 54.95],
        [23.95, 54.9],
      ],
    ],
    labelAt: [28.2, 57.7],
  },
  {
    id: 'bessarabia-1940',
    name: 'Bessarabia & N. Bukovina',
    side: 'soviet',
    from: '1940-06-28',
    to: '1940-07-04',
    // The ultimatum to Romania: the USSR takes Bessarabia and northern Bukovina.
    arrows: [
      [
        [29.6, 47.6],
        [28.6, 47.2],
        [27.6, 47.0],
      ],
      [
        [27.6, 48.7],
        [26.6, 48.45],
        [25.95, 48.3],
      ],
    ],
    labelAt: [30.1, 47.9],
  },
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
