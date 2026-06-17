# Unit System — Implementation Guide

Companion to **`Unit System Spec.dc.html`** (the visual board). This file is the
hand-off for Claude Code: concrete, drop-in changes against the real source in
`src/layers/units.ts`, `src/index.css`, and `src/map/MapView.tsx`.

Everything below is reconciled to the code as it actually exists today — real
tokens, real branch set, real layer ids. Where something is **new** (a branch
symbol the canvas doesn't draw yet, a size tier that doesn't exist yet) it is
called out so nothing silently breaks.

---

## 0. What changes, in one breath

Today every counter is the **same 52×46 canvas**; echelon only swaps the mark
text drawn above the frame. The redesign makes a unit's **level** legible three
ways at once:

1. **Size** — the canvas/frame scales per echelon tier.
2. **Badge** — the echelon mark moves into a dark monospace chip above the frame
   (replacing the white-haloed text).
3. **Intensity** — fill saturation and stroke darkness deepen with rank.

Plus: lighter junior counters, a single soft shadow (no double outline), a glow
tier for senior HQs, and map-declutter passes for labels / front-line / basemap.

---

## 1. Tokens (already correct — no new colours)

These already exist in `units.ts` and are kept verbatim. The redesign **derives**
everything from them; it does not introduce new hues.

```ts
const SIDE_COLOR = { axis: '#d6543d', soviet: '#4d8fd6' } as const; // frame stroke
const SIDE_FILL  = { axis: '#f4d3ca', soviet: '#cfe1f5' } as const; // gradient bottom
const SIDE_INK   = { axis: '#9c3322', soviet: '#2c5e93' } as const; // branch symbol
```

Brass selection/leader-line colour `#f1c552` (LINKS_ID paint) is also kept.

---

## 2. Echelon → visual tier

New constant. `EchGroup` already exists (`top | army | corps | division | brigade | sub`).

```ts
// Footprint scale + intensity (0 junior → 1 senior) + glow flag, per tier.
type EchTier = { scale: number; t: number; glow: boolean };
const ECH_TIER: Record<EchGroup, EchTier> = {
  sub:      { scale: 0.82, t: 0.06, glow: false }, // regiment / battalion
  brigade:  { scale: 0.90, t: 0.20, glow: false },
  division: { scale: 1.00, t: 0.42, glow: false },
  corps:    { scale: 1.16, t: 0.66, glow: false },
  army:     { scale: 1.34, t: 0.85, glow: true  },
  top:      { scale: 1.54, t: 1.00, glow: true  }, // front / army-group
};

// tiny hex-mix helper (add near the top of units.ts)
function mixHex(a: string, b: string, t: number): string {
  const h = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const x = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const A = h(a), B = h(b);
  return '#' + A.map((v, i) => x(v + (B[i] - v) * t)).join('');
}
```

---

## 3. `makeIcon()` — full replacement

The signature gains an `ech: EchGroup`. The canvas is sized from the tier so each
echelon gets its own footprint, the mark is drawn as a chip, and senior tiers get
a glow. Branch coverage is extended (see the `// NEW` lines).

```ts
function makeIcon(
  side: 'axis' | 'soviet',
  type: string,
  mark: string,
  ech: EchGroup,
  hollow = false,
): ImageData {
  const PR = 2.6;
  const tier = ECH_TIER[ech] ?? ECH_TIER.division;

  // Base division frame is 40×25; scale it by the tier.
  const w = Math.round(40 * tier.scale);
  const h = Math.round(25 * tier.scale);
  const badgeH = Math.round(11 * (0.85 + tier.scale * 0.18)); // chip height
  const pad = tier.glow ? 9 : 6;                              // glow headroom
  const topPad = pad + badgeH + 3;                            // room for the chip

  const W = w + pad * 2;
  const H = h + topPad + pad;
  const x = pad;
  const y = topPad;

  const canvas = document.createElement('canvas');
  canvas.width = W * PR;
  canvas.height = H * PR;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(PR, PR);

  const stroke = mixHex(SIDE_COLOR[side], SIDE_INK[side], tier.t * 0.5);
  const ink = SIDE_INK[side];
  const fillBottom = mixHex(SIDE_FILL[side], SIDE_INK[side], tier.t * 0.32); // deepen with rank

  // --- body: white→tinted gradient, soft single shadow (+ glow for senior) ---
  ctx.save();
  ctx.shadowColor = tier.glow ? `${side === 'axis' ? 'rgba(214,84,61,' : 'rgba(77,143,214,'}0.45)` : 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = tier.glow ? 8 : 4;
  ctx.shadowOffsetY = tier.glow ? 0 : 1.5;
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  if (hollow) {
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, side === 'axis' ? 'rgba(214,84,61,0.28)' : 'rgba(77,143,214,0.28)');
  } else {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, fillBottom);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // top bevel highlight
  if (!hollow) {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 1);
    ctx.lineTo(x + w - 2, y + 1);
    ctx.stroke();
  }

  // frame
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.2 * (0.9 + tier.scale * 0.18);
  if (hollow) ctx.setLineDash([4, 3]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // --- branch symbol (ink) ---
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 1.8 * (0.9 + tier.scale * 0.15);
  ctx.lineCap = 'round';
  const cx = x + w / 2, cy = y + h / 2;
  const cross = () => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke(); };
  const oval = (rx: number, ry: number) => { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); };

  if (type === 'infantry' || type === 'motorized') cross();
  if (type === 'armoured' || type === 'motorized') oval(type === 'motorized' ? 8 : 11, type === 'motorized' ? 4.5 : 6.5);
  if (type === 'cavalry' || type === 'recon') { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y); ctx.stroke(); }
  // NEW branches (the current makeIcon doesn't draw these — add only if your data uses them):
  if (type === 'mechanized') { cross(); oval(11, 6.5); }                         // NEW
  if (type === 'artillery') { ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fill(); } // NEW
  if (type === 'antitank') { ctx.beginPath(); ctx.moveTo(x + 4, y + h - 3); ctx.lineTo(cx, y + 4); ctx.lineTo(x + w - 4, y + h - 3); ctx.stroke(); } // NEW
  // type === 'hq' → empty frame (no symbol)

  // --- echelon badge: dark rounded chip above the frame, monospace mark ---
  ctx.font = `800 ${Math.round(9 + tier.scale * 2.2)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(mark).width;
  const chipW = tw + 10;
  const chipX = cx - chipW / 2;
  const chipY = y - badgeH - 3;
  ctx.fillStyle = hollow ? 'rgba(13,19,29,0.82)' : '#0d131d';
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(chipX, chipY, chipW, badgeH, 3); ctx.fill(); }
  else ctx.fillRect(chipX, chipY, chipW, badgeH);
  ctx.strokeStyle = side === 'axis' ? 'rgba(214,84,61,0.55)' : 'rgba(77,143,214,0.55)';
  ctx.lineWidth = 1;
  if (hollow) ctx.setLineDash([3, 2]);
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(chipX, chipY, chipW, badgeH, 3); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.fillStyle = side === 'axis' ? '#ef9a80' : '#8ab7ef';
  ctx.fillText(mark, cx, chipY + badgeH / 2 + 0.5);

  return ctx.getImageData(0, 0, W * PR, H * PR);
}
```

Because canvas dimensions now vary per echelon, **drop the global `W`/`H`
constants** that the old `makeIcon` opened with — they're computed inside now.

---

## 4. Icon id + registration carry the echelon

`iconId` and the combo set must include the echelon group so each tier caches its
own image. The mark alone isn't enough (e.g. you want a `division` vs a
`brigade` to differ in size even though both could share a mark in edge data).

```ts
function iconId(side: string, type: string, ech: EchGroup, hollow = false): string {
  return `u-${side}-${type}-${ech}${hollow ? '-d' : ''}`;
}
```

In `collectionFor`, the two `icon:` assignments become:

```ts
icon: iconId(t.side, t.type, ECH_GROUP(t.echelon)),                 // curated
icon: iconId(du.side, du.type, ECH_GROUP(du.echelon), true),        // derived
```

In `addUnitsLayer`, the combo set + registration:

```ts
const combos = new Set([
  ...tracks.map((t) => `${t.side}|${t.type}|${ECH_GROUP(t.echelon)}|0`),
  ...derivedUnits.map((u) => `${u.side}|${u.type}|${ECH_GROUP(u.echelon)}|1`),
]);
for (const combo of combos) {
  const [side, type, ech, hollow] = combo.split('|') as ['axis' | 'soviet', string, EchGroup, string];
  const mark = /* look up by echelon */ markFor(side, type, ech); // see note
  const id = iconId(side, type, ech, hollow === '1');
  if (!map.hasImage(id)) {
    map.addImage(id, makeIcon(side, type, mark, ech, hollow === '1'), { pixelRatio: 2.6 });
  }
}
```

> **Mark note:** the combo dropped the raw echelon string, but you still need the
> `XX/XXX/...` text. Easiest: keep the per-unit echelon in the combo too
> (`...|${t.echelon}|...`) and read `ECH_MARK[echelon]` in the loop, deriving
> `ECH_GROUP(echelon)` for the tier. The grouping only matters for size; the mark
> still wants the precise echelon string.

Since the icons now have **different pixel sizes**, leave the layers' existing
`icon-size` zoom interpolation as-is — MapLibre scales each image about its own
centre, so the tier footprints are preserved and still grow/shrink with zoom.
`icon-anchor` stays default (center).

---

## 5. Map declutter

### 5a. Labels colliding (`addEchelonLayer` + `FAMILY_ID` layout)

Show labels for senior tiers always; gate division/brigade labels behind zoom so
they only appear once you're in close. Lighter weight, tighter halo.

```ts
'text-field': ['case',
  ['in', ['get', 'ech'], ['literal', ['top', 'army', 'corps']]], ['get', 'short'],
  ['step', ['zoom'], '', 6.8, ['get', 'short']],
],
'text-size': 9.5,
'text-optional': true,            // already set — keep
'text-allow-overlap': false,      // let collisions hide juniors
```
```ts
// paint
'text-halo-width': 0.9,           // was 1.1 — lighter
```

Senior formations already win collisions via `symbol-sort-key` — keep it.

### 5b. Front line + tide too loud (`src/layers/front.ts`)

Not in `units.ts`. In the front/tide fill + line layers:
- **Tide fills:** `fill-opacity` down to **0.08–0.12**, and desaturate the fill
  colours (toward grey) so they read as territory, not as ink.
- **Front line:** thin to ~**1.6px**, and instead of one hard bright stroke use a
  wide low-opacity glow line *under* a thin crisp line (two line layers). Keep
  both **below** the unit symbol layers so counters always sit on top.

### 5c. Basemap competing (`src/map/MapView.tsx`)

Mute the base so counters are the brightest thing on screen:
- Thin city-label density (raise the label layers' `minzoom`, or drop minor
  places) and desaturate road/boundary colours.
- Lower land/sea contrast. If using a vector style, override the relevant layer
  paints after `map.on('load')`; if raster, a `raster-saturation: -0.4` /
  `raster-brightness-min` nudge works.

---

## 6. Hover & focus

**Command-focus (Spec option B) already exists** — that's your `FAMILY_ID`
layer + `updateUnitsFocus`. Two additions complete the spec:

### 6a. Hover lift + glow (Spec option A — recommended default)

MapLibre symbols can't "lift" in 3D, but feature-state gives the read:

```ts
// once, after layers added:
let hovered: string | number | null = null;
for (const id of UNITS_HIT_LAYER_IDS) {
  map.on('mousemove', id, (e) => {
    const f = e.features?.[0]; if (!f) return;
    if (hovered !== null) map.setFeatureState({ source: SOURCE_ID, id: hovered }, { hover: false });
    hovered = f.id ?? null;
    if (hovered !== null) map.setFeatureState({ source: SOURCE_ID, id: hovered }, { hover: true });
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', id, () => {
    if (hovered !== null) map.setFeatureState({ source: SOURCE_ID, id: hovered }, { hover: false });
    hovered = null;
    map.getCanvas().style.cursor = '';
  });
}
```
> Requires features to carry a stable numeric/string `id` (set `promoteId: 'id'`
> on the GeoJSON source, or assign `feature.id`). Then drive size in each layer:
```ts
'icon-size': ['*',
  ['interpolate', ['linear'], ['zoom'], 3, 0.82, 6, 0.9, 8, 1.05],
  ['case', ['boolean', ['feature-state', 'hover'], false], 1.08, 1.0],
],
```

### 6b. Tooltip (name · echelon · strength)

A lightweight MapLibre `Popup` on the same `mousemove`, styled to match the
situation-room panel (dark `#0d131d`, 1px light border, monospace meta line) —
exactly the chip in option A of the board.

---

## 7. Reconciliation notes / honesty checklist

- **Branch symbols:** `infantry`, `motorized`, `armoured`, `cavalry` exist today.
  `mechanized`, `artillery`, `antitank`, `hq` in the spec board are **new** — the
  `// NEW` lines in §3 add them; ship only the ones your data actually uses.
- **`hq`** renders as an empty frame (standard APP-6). The board uses it for
  army/corps HQ counters.
- **Size tiers** are new; if any layout/anchor code assumed a fixed 52×46 icon,
  re-check it (none in `units.ts` does — anchors are center).
- **`recon`** is mapped to the cavalry symbol (single diagonal) as a sensible
  default; split it out if you want a distinct mark.
