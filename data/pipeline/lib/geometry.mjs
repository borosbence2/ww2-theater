// Shared ETL geometry: polyline/ring resampling for keyframe correspondence,
// and point-vs-front side tests used by the validation loops (cities today,
// unit positions in Phase 1+).

/** Round coordinate pairs to 3 decimals (~100 m) for output size. */
export const round3 = (pts) => pts.map(([x, y]) => [Number(x.toFixed(3)), Number(y.toFixed(3))]);

/** Resample an open polyline to n evenly-spaced points (by planar arc length). */
export function resampleOpen(pts, n) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(len);
    total += len;
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const target = total * (k / (n - 1));
    let acc = 0;
    let i = 0;
    while (i < seg.length && acc + seg[i] < target) acc += seg[i++];
    if (i >= seg.length) {
      out.push([...pts[pts.length - 1]]);
      continue;
    }
    const f = seg[i] === 0 ? 0 : (target - acc) / seg[i];
    const a = pts[i];
    const b = pts[i + 1];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return round3(out);
}

/** Signed area (shoelace); positive = counter-clockwise in lon/lat. */
export function signedArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** Resample a closed ring to n evenly-spaced points, forced counter-clockwise.
 *  Input is authored open (no duplicate closing point); output is too. */
export function resampleRing(pts, n) {
  let ring = pts;
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx === lx && fy === ly) ring = ring.slice(0, -1);
  if (signedArea(ring) < 0) ring = [...ring].reverse();

  const seg = [];
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(len);
    total += len;
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const target = total * (k / n);
    let acc = 0;
    let i = 0;
    while (i < seg.length - 1 && acc + seg[i] < target) acc += seg[i++];
    const f = seg[i] === 0 ? 0 : (target - acc) / seg[i];
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return round3(out);
}

/** Cyclically rotate `ring` to minimize total squared distance to `prev`
 *  (otherwise interpolated rings visibly "swirl"). */
export function alignRing(prev, ring) {
  const n = ring.length;
  let best = 0;
  let bestCost = Infinity;
  for (let shift = 0; shift < n; shift++) {
    let cost = 0;
    for (let i = 0; i < n; i++) {
      const [px, py] = prev[i];
      const [qx, qy] = ring[(i + shift) % n];
      cost += (qx - px) ** 2 + (qy - py) ** 2;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = shift;
    }
  }
  return ring.map((_, i) => ring[(i + best) % n]);
}

/** Distance from a point to the front polyline in ~km (local flat approx). */
export function kmFromFront(coords, lon, lat) {
  const kx = 111 * Math.cos((lat * Math.PI) / 180); // km per deg lon at this lat
  const ky = 111;
  let bestD2 = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const [ax, ay] = coords[i];
    const [bx, by] = coords[i + 1];
    const abx = (bx - ax) * kx;
    const aby = (by - ay) * ky;
    const apx = (lon - ax) * kx;
    const apy = (lat - ay) * ky;
    const len2 = abx * abx + aby * aby;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2));
    const dx = apx - abx * t;
    const dy = apy - aby * t;
    bestD2 = Math.min(bestD2, dx * dx + dy * dy);
  }
  return Math.sqrt(bestD2);
}

/** Close the N->S front against a generous western box -> Axis-side polygon.
 *  Robust for points far from the line (a nearest-segment cross test is not). */
export function axisPolygon(line) {
  const lats = line.map((c) => c[1]);
  const yMin = Math.min(...lats) - 2;
  const yMax = Math.max(...lats) + 2;
  const xMin = 0; // far west of the whole theater

  return [
    ...line,
    [line[line.length - 1][0], yMin],
    [xMin, yMin],
    [xMin, yMax],
    [line[0][0], yMax],
  ];
}

/** Ray-cast point-in-ring (ring is open, no duplicate closing point). */
export function inRing(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
