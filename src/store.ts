// Global app state (Zustand). Holds the current date, playback state, and the
// map viewport. Initialized from the URL so deep links restore date + position.

import { create } from 'zustand';
import { DEFAULT_DATE, TIMELINE_END, addDays, clampDate, diffDays } from './time/dates';
import { readUrl } from './time/url';

export interface Viewport {
  lng: number;
  lat: number;
  zoom: number;
}

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

  setDate: (iso: string) => void;
  stepDays: (n: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  setViewport: (viewport: Viewport) => void;
}

const url = readUrl();

export const useStore = create<AppState>((set, get) => ({
  date: url.date ?? DEFAULT_DATE,
  playing: false,
  speed: SPEEDS[1],
  viewport: { ...DEFAULT_VIEWPORT, ...url.viewport },

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
}));
