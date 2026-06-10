// State for the dev keyframe editor: the waypoints of the keyframe being
// traced. Kept in its own small store so the editor stays fully separate from
// the app store (it only ever ships dev-side).

import { create } from 'zustand';

export type Waypoint = [number, number];

interface EditState {
  /** Waypoints of the keyframe being authored, in click order. */
  points: Waypoint[];
  addPoint: (p: Waypoint) => void;
  movePoint: (index: number, p: Waypoint) => void;
  undo: () => void;
  clear: () => void;
}

export const useEditStore = create<EditState>((set) => ({
  points: [],
  addPoint: (p) => set((s) => ({ points: [...s.points, p] })),
  movePoint: (index, p) =>
    set((s) => ({ points: s.points.map((q, i) => (i === index ? p : q)) })),
  undo: () => set((s) => ({ points: s.points.slice(0, -1) })),
  clear: () => set({ points: [] }),
}));
