// Shared ETL keyframe interpolation: the same date-bracketed linear morph the
// client uses (src/layers/front.ts), for build-time validation loops.

import { dateNum, diffDays } from './dates.mjs';

/** Interpolated coords of a keyframed feature on `iso`, or null when inactive.
 *  A feature is `{fromNum, toNum, keyframes: [{date, start, coords}]}` and is
 *  active while fromNum <= d < toNum (`to` is the first day it is gone). */
export function coordsFor(f, iso) {
  const d = dateNum(iso);
  if (d < f.fromNum || d >= f.toNum) return null;
  const kfs = f.keyframes;
  if (d <= kfs[0].start) return kfs[0].coords;
  const last = kfs[kfs.length - 1];
  if (d >= last.start) return last.coords;
  let k0 = kfs[0];
  let k1 = kfs[1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (d >= kfs[i].start && d < kfs[i + 1].start) {
      k0 = kfs[i];
      k1 = kfs[i + 1];
      break;
    }
  }
  const span = diffDays(k0.date, k1.date);
  const t = span > 0 ? diffDays(k0.date, iso) / span : 0;
  return k0.coords.map(([x, y], i) => {
    const [qx, qy] = k1.coords[i];
    return [x + (qx - x) * t, y + (qy - y) * t];
  });
}
