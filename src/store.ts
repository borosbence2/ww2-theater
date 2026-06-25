// Global app state (Zustand). Holds the current date, playback state, the map
// viewport, layer visibility, and the current selection. Initialized from the
// URL so deep links restore date + position + layers + selection.

import { create } from 'zustand';
import { DEFAULT_DATE, TIMELINE_END, addDays, clampDate, diffDays } from './time/dates';
import { readUrl } from './time/url';
import { DEFAULT_HIDDEN_LAYERS } from './layers/registry';

export interface Viewport {
  lng: number;
  lat: number;
  zoom: number;
}

/** What is selected in the UI (detail panel + deep link). */
export type Selection = { kind: 'city' | 'unit' | 'battle' | 'pocket' | 'airfield'; id: string };

/** Default view: centered on central Europe, whole-theater zoom. */
const DEFAULT_VIEWPORT: Viewport = { lng: 15, lat: 50, zoom: 4 };

/** Playback speeds offered in the UI, in simulated days per real second. */
export const SPEEDS = [1, 7, 30, 90] as const;

interface AppState {
  date: string;
  playing: boolean;
  /** Simulated days advanced per real second while playing. */
  speed: number;
  viewport: Viewport;
  /** Registry ids of layers the user switched off (default: none). */
  hiddenLayers: string[];
  selection: Selection | null;
  /** Show the selected unit's full route (Phase 2 path mode). */
  trackPath: boolean;
  /** Pin the camera to the selected unit while the date changes. */
  follow: boolean;
  /** People panel (Phase 4): open state + the searched name (?person=). */
  peopleOpen: boolean;
  personQuery: string;

  setDate: (iso: string) => void;
  stepDays: (n: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  setViewport: (viewport: Viewport) => void;
  toggleLayer: (id: string) => void;
  setSelection: (selection: Selection | null) => void;
  setTrackPath: (trackPath: boolean) => void;
  setFollow: (follow: boolean) => void;
  setPeopleOpen: (peopleOpen: boolean) => void;
  setPersonQuery: (personQuery: string) => void;
}

const url = readUrl();

export const useStore = create<AppState>((set, get) => ({
  date: url.date ?? DEFAULT_DATE,
  playing: false,
  speed: SPEEDS[1],
  viewport: { ...DEFAULT_VIEWPORT, ...url.viewport },
  // A clean visit (no `layers=` in the URL) starts with the opt-in overlays hidden.
  hiddenLayers: url.hiddenLayers ?? DEFAULT_HIDDEN_LAYERS,
  selection: url.selection ?? null,
  trackPath: (url.trackPath ?? false) && url.selection?.kind === 'unit',
  follow: false,
  peopleOpen: url.personQuery !== undefined,
  personQuery: url.personQuery ?? '',

  setDate: (iso) => set({ date: clampDate(iso) }),

  stepDays: (n) => {
    const next = clampDate(addDays(get().date, n));
    // Stop playback when we hit the end of the timeline.
    const atEnd = diffDays(next, TIMELINE_END) === 0;
    set(atEnd ? { date: next, playing: false } : { date: next });
  },

  setPlaying: (playing) => set({ playing }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (speed) => set({ speed }),
  setViewport: (viewport) => set({ viewport }),

  toggleLayer: (id) =>
    set((s) => ({
      hiddenLayers: s.hiddenLayers.includes(id)
        ? s.hiddenLayers.filter((x) => x !== id)
        : [...s.hiddenLayers, id],
    })),

  setSelection: (selection) =>
    set((s) => {
      // Path/follow are per-unit modes; switching away from the unit clears them.
      const sameUnit =
        selection?.kind === 'unit' && s.selection?.kind === 'unit' && selection.id === s.selection.id;
      return sameUnit ? { selection } : { selection, trackPath: false, follow: false };
    }),

  setTrackPath: (trackPath) => set({ trackPath }),
  setFollow: (follow) => set({ follow }),
  setPeopleOpen: (peopleOpen) => set({ peopleOpen }),
  setPersonQuery: (personQuery) => set({ personQuery }),
}));
