// Pure helpers for reading/writing app state to the URL query string.
// Kept free of any store import so it can be used during store initialization.

import { clampDate, isValidDate } from './dates';
import { ALL_LAYER_IDS } from '../layers/registry';
import type { Selection, Viewport } from '../store';

export interface UrlState {
  date?: string;
  viewport?: Partial<Viewport>;
  /** Registry ids hidden by the user (derived from the visible `layers=` list). */
  hiddenLayers?: string[];
  selection?: Selection;
  /** `?track=1`: show the selected unit's route. */
  trackPath?: boolean;
}

/** Parse the current URL query string into partial app state. */
export function readUrl(): UrlState {
  const p = new URLSearchParams(window.location.search);
  const out: UrlState = {};

  const date = p.get('date');
  if (isValidDate(date)) out.date = clampDate(date);

  // NOT Number(p.get(...)): Number(null) is 0, which would read absent params
  // as a (0,0,z0) viewport and start every clean visit in the Gulf of Guinea.
  const num = (v: string | null) => (v === null || v.trim() === '' ? NaN : Number(v));
  const lng = num(p.get('lng'));
  const lat = num(p.get('lat'));
  const zoom = num(p.get('z'));
  const vp: Partial<Viewport> = {};
  if (Number.isFinite(lng)) vp.lng = lng;
  if (Number.isFinite(lat)) vp.lat = lat;
  if (Number.isFinite(zoom)) vp.zoom = zoom;
  if (Object.keys(vp).length) out.viewport = vp;

  // `layers=` lists the VISIBLE layers ("none" = all off); absent = all on.
  const layers = p.get('layers');
  if (layers !== null) {
    const visible = layers === 'none' ? [] : layers.split(',');
    out.hiddenLayers = ALL_LAYER_IDS.filter((id) => !visible.includes(id));
  }

  const unit = p.get('unit');
  const city = p.get('city');
  const battle = p.get('battle');
  if (unit) out.selection = { kind: 'unit', id: unit };
  else if (battle) out.selection = { kind: 'battle', id: battle };
  else if (city) out.selection = { kind: 'city', id: city };
  if (p.get('track') === '1') out.trackPath = true;

  return out;
}

/** Serialize app state into the URL via history.replaceState (no navigation). */
export function writeUrl(
  date: string,
  viewport: Viewport,
  hiddenLayers: string[],
  selection: Selection | null,
  trackPath = false,
): void {
  const p = new URLSearchParams();
  p.set('date', date);
  // Preserve the dev keyframe-editor switch across rewrites.
  if (new URLSearchParams(window.location.search).has('edit')) p.set('edit', '1');
  p.set('z', viewport.zoom.toFixed(2));
  p.set('lat', viewport.lat.toFixed(4));
  p.set('lng', viewport.lng.toFixed(4));
  if (hiddenLayers.length) {
    const visible = ALL_LAYER_IDS.filter((id) => !hiddenLayers.includes(id));
    p.set('layers', visible.length ? visible.join(',') : 'none');
  }
  if (selection?.kind === 'city') p.set('city', selection.id);
  if (selection?.kind === 'unit') {
    p.set('unit', selection.id);
    if (trackPath) p.set('track', '1');
  }
  if (selection?.kind === 'battle') p.set('battle', selection.id);
  window.history.replaceState(null, '', `?${p.toString()}`);
}
