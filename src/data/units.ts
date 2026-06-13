// Shared unit data: search index, map tracks, and per-unit detail files built
// by data/pipeline/build-units.mjs. Fetched once and cached, same pattern as
// ./cities.

import { dateToNum, diffDays } from '../time/dates';
import { foldText } from './cities';

const BASE = import.meta.env.BASE_URL;

export interface UnitIndexEntry {
  id: string;
  label: string;
  aliases: string[];
  country: string;
  side: 'axis' | 'soviet';
  echelon: string;
  type: string;
  from: string;
  to: string | null;
  hasPositions: boolean;
  /** Daily position derivable from front sector + monthly OOB. */
  hasDerived: boolean;
}

export interface UnitTrackKeyframe {
  date: string;
  start: number;
  at: [number, number];
  confidence: 'documented' | 'inferred' | 'approximate';
  move: 'march' | 'rail' | 'sea' | 'air' | 'gap';
}

export interface UnitTrack {
  id: string;
  short: string;
  side: 'axis' | 'soviet';
  echelon: string;
  type: string;
  /** Parent unit ids — sub-division units render only when one is in focus. */
  parentIds: string[];
  /** YYYYMMDD: first day the track no longer renders. */
  trackTo: number;
  keyframes: UnitTrackKeyframe[];
}

export interface UnitDetail {
  id: string;
  country: string;
  side: 'axis' | 'soviet';
  branch: string;
  echelon: string;
  type: string;
  short: string;
  names: { from: string; name: string; aliases?: string[] }[];
  existence: { from: string; to?: string; end?: string }[];
  parents: { from: string; to: string | null; unit: string; label: string }[];
  children: { from: string; to: string | null; unit: string; label: string }[];
  commanders: { from: string; to: string | null; name: string; link?: string }[];
  positions: { date: string; at: [number, number]; label?: string; source?: string; confidence: string }[];
  positionsTo: string | null;
  derived: boolean;
  links: Record<string, string>;
  sources: { id: string; citation?: string; url?: string }[];
  notes: string | null;
}

/** Keyframe: [startNum, fraction] on the main line, or [startNum, lon, lat]
 *  absolute (a unit placed inside a pocket ring). */
export type DerivedKf = [number, number] | [number, number, number];

export interface DerivedSeg {
  /** YYYYMMDD after which the segment stops rendering. */
  end: number;
  /** Keyframes, ascending. All in one segment share a kind (length 2 vs 3). */
  kfs: DerivedKf[];
}

export interface DerivedUnit {
  id: string;
  short: string;
  side: 'axis' | 'soviet';
  echelon: string;
  type: string;
  segs: DerivedSeg[];
}

let indexPromise: Promise<UnitIndexEntry[]> | null = null;
let tracksPromise: Promise<UnitTrack[]> | null = null;
let derivedPromise: Promise<DerivedUnit[]> | null = null;
const shardCache = new Map<string, Promise<Record<string, UnitDetail>>>();

/** djb2 % 16 — mirrored by data/pipeline/build-units.mjs (keep in sync). */
function shardOf(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  return (h % 16).toString().padStart(2, '0');
}

export function loadUnitIndex(): Promise<UnitIndexEntry[]> {
  if (!indexPromise) {
    indexPromise = fetch(`${BASE}data/units/index.json`)
      .then((r) => r.json())
      .then((d) => d.units);
  }
  return indexPromise;
}

export function loadUnitTracks(): Promise<UnitTrack[]> {
  if (!tracksPromise) {
    tracksPromise = fetch(`${BASE}data/units/tracks/eastern.json`)
      .then((r) => r.json())
      .then((d) => d.units);
  }
  return tracksPromise;
}

export function loadDerivedUnits(): Promise<DerivedUnit[]> {
  if (!derivedPromise) {
    derivedPromise = fetch(`${BASE}data/units/derived/eastern.json`)
      .then((r) => (r.ok ? r.json() : { units: [] }))
      .then((d) => d.units);
  }
  return derivedPromise;
}

/**
 * Derived placement of a unit on a date, or null when outside every segment:
 *   { frac } — a fraction along the main front line (resolve with the line), or
 *   { at }   — an absolute [lon, lat] (the unit is inside a pocket ring).
 * Values lerp between monthly keyframes; a large fraction jump (front
 * re-assignment) holds-and-jumps like a rail move.
 */
export function derivedPlacementOn(
  unit: DerivedUnit,
  dateISO: string,
  d: number,
): { frac: number } | { at: [number, number] } | null {
  for (const seg of unit.segs) {
    if (d < seg.kfs[0][0] || d > seg.end) continue;
    const kfs = seg.kfs;
    let i = 0;
    while (i < kfs.length - 1 && kfs[i + 1][0] <= d) i++;
    const k0 = kfs[i];
    const k1 = kfs[Math.min(i + 1, kfs.length - 1)];
    const span = k1[0] > k0[0] ? diffDays(numToDate(k0[0]), numToDate(k1[0])) : 0;
    const t = span > 0 ? Math.max(0, Math.min(1, diffDays(numToDate(k0[0]), dateISO) / span)) : 0;
    if (k0.length === 3) {
      const lon = k0[1] + ((k1[1] ?? k0[1]) - k0[1]) * t;
      const lat = k0[2] + ((k1[2] ?? k0[2]) - k0[2]) * t;
      return { at: [lon, lat] };
    }
    const f0 = k0[1];
    const f1 = k1[1];
    if (k1[0] <= k0[0] || Math.abs(f1 - f0) > 0.12) return { frac: f0 }; // hold
    return { frac: f0 + (f1 - f0) * t };
  }
  return null;
}

function numToDate(n: number): string {
  const s = String(n);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export function loadUnitDetail(id: string): Promise<UnitDetail> {
  const shard = shardOf(id);
  let p = shardCache.get(shard);
  if (!p) {
    p = fetch(`${BASE}data/units/detail/${shard}.json`).then((r) => {
      if (!r.ok) throw new Error(`missing detail shard ${shard}`);
      return r.json();
    });
    shardCache.set(shard, p);
  }
  return p.then((records) => {
    const detail = records[id];
    if (!detail) throw new Error(`unknown unit ${id}`);
    return detail;
  });
}

/** Prefix matches first, then substring, over label + aliases. */
export function searchUnits(index: UnitIndexEntry[], query: string, limit = 6): UnitIndexEntry[] {
  const q = foldText(query.trim());
  if (q.length < 2) return [];
  const scored: { u: UnitIndexEntry; score: number }[] = [];
  for (const u of index) {
    let best = -1;
    for (const name of [u.label, ...u.aliases]) {
      const n = foldText(name);
      const s = n.startsWith(q) ? 0 : n.includes(q) ? 1 : -1;
      if (s >= 0 && (best === -1 || s < best)) best = s;
    }
    if (best >= 0) scored.push({ u, score: best });
  }
  // Echelon seniority breaks ties so armies surface above divisions.
  // Divisions outrank corps: a bare number ("13th Guards") most often means
  // the division. Armies/fronts still win (a search for "6. Armee" wants it).
  const rank: Record<string, number> = { 'army-group': 0, front: 0, army: 1, division: 2, corps: 3 };
  scored.sort((a, b) => a.score - b.score || (rank[a.u.echelon] ?? 4) - (rank[b.u.echelon] ?? 4));
  return scored.slice(0, limit).map((s) => s.u);
}

/**
 * Position of a track on a date, or null when outside its window.
 * Non-march segments hold the previous keyframe and jump on arrival (a unit
 * moved by rail must not glide). Mirrors positionOn in build-units.mjs.
 */
export function positionOn(track: UnitTrack, dateISO: string, d: number): [number, number] | null {
  const kfs = track.keyframes;
  if (!kfs.length || d < kfs[0].start || d >= track.trackTo) return null;
  const last = kfs[kfs.length - 1];
  if (d >= last.start) return last.at;
  let i = 0;
  while (i < kfs.length - 1 && kfs[i + 1].start <= d) i++;
  const k0 = kfs[i];
  const k1 = kfs[i + 1];
  if (k1.move !== 'march') return k0.at;
  const span = diffDays(k0.date, k1.date);
  const t = span > 0 ? diffDays(k0.date, dateISO) / span : 0;
  return [k0.at[0] + (k1.at[0] - k0.at[0]) * t, k0.at[1] + (k1.at[1] - k0.at[1]) * t];
}

/** Confidence of the segment containing the date (k0's, per schema). */
export function confidenceOn(track: UnitTrack, d: number): string {
  const kfs = track.keyframes;
  let i = 0;
  while (i < kfs.length - 1 && kfs[i + 1].start <= d) i++;
  return kfs[i].confidence;
}

export { dateToNum };
