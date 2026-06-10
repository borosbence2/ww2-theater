// Pure helpers for reading/writing app state to the URL query string.
// Kept free of any store import so it can be used during store initialization.

import { clampDate, isValidDate } from './dates';
import type { Viewport } from '../store';

export interface UrlState {
  date?: string;
  viewport?: Partial<Viewport>;
}

/** Parse the current URL query string into partial app state. */
export function readUrl(): UrlState {
  const p = new URLSearchParams(window.location.search);
  const out: UrlState = {};

  const date = p.get('date');
  if (isValidDate(date)) out.date = clampDate(date);

  const lng = Number(p.get('lng'));
  const lat = Number(p.get('lat'));
  const zoom = Number(p.get('z'));
  const vp: Partial<Viewport> = {};
  if (Number.isFinite(lng)) vp.lng = lng;
  if (Number.isFinite(lat)) vp.lat = lat;
  if (Number.isFinite(zoom)) vp.zoom = zoom;
  if (Object.keys(vp).length) out.viewport = vp;

  return out;
}

/** Serialize app state into the URL via history.replaceState (no navigation). */
export function writeUrl(date: string, viewport: Viewport): void {
  const p = new URLSearchParams();
  p.set('date', date);
  // Preserve the dev keyframe-editor switch across rewrites.
  if (new URLSearchParams(window.location.search).has('edit')) p.set('edit', '1');
  p.set('z', viewport.zoom.toFixed(2));
  p.set('lat', viewport.lat.toFixed(4));
  p.set('lng', viewport.lng.toFixed(4));
  window.history.replaceState(null, '', `?${p.toString()}`);
}
