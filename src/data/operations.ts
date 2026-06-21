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
];
