# Milestones

Living progress log. Strategic-overview-first: a genuinely usable app exists by
the end of M3.

## M0 — Skeleton ✅
- [x] Vite + React + TypeScript project
- [x] MapLibre map centered on the European theater (keyless basemap)
- [x] Date state + timeline slider (1939-09-01 → 1945-09-02)
- [x] Play / pause / step controls with adjustable speed (days per second)
- [x] Viewport + date synced to the URL (shareable deep links)

## M1 — Temporal borders ✅
- [x] ETL (`data/pipeline/build-borders.mjs`): CShapes 2.0 global GeoJSON →
      windowed to 1938–1946, exact `start`/`end` validity as `YYYYMMDD` ints,
      per-country color, reduced coordinate precision (`public/data/borders/`)
- [x] Render country borders (fill + outline + labels) via MapLibre
- [x] Validity-interval filtering by date as a MapLibre filter expression
      (`start <= date < end`), updated on scrub/playback — `src/layers/borders.ts`
- [x] Verified change points: Danzig gone after Sept 1939, Baltic states absorbed
      1940, Germany → GDR/GFR in 1945
- Known limitation: CShapes is **de jure** sovereignty, so wartime occupation of
  Poland/Austria/Czechoslovakia isn't shown — that's the job of the M2 control layer.
- Future: exact event-dating already supported by the data; swap basemap to a
  period style; geometry simplification for size (M6).

## M2 — Territorial control (headline) ✅
- [x] ETL (`data/pipeline/build-control.mjs`): Stanford monthly shapefiles →
      reproject (Europe Albers/ED50 → WGS84) → drop tiny islands →
      topology-aware simplify → quantize → per-month **TopoJSON** by side
      (`public/data/control/`, 88 months Feb 1938–May 1945, ~3.5 MB total)
- [x] Built control fills by side (Axis / Axis-occupied / Allied / Neutral) from
      the Stanford data — `src/layers/control.ts`. **Currently disabled**: the
      source is *administrative occupation*, not the operational front, so it
      conflicts with the accurate front line (e.g. it placed the 1942 line ~700 km
      west of Stalingrad and was static 1941–43). To be reworked into
      front-consistent fills.

### Front line — authored connected line, interpolated ✅
Approaches tried and rejected: Stanford admin boundary (mispositioned, static);
deriving the front from city points via Voronoi (disconnected, wrong — points
can't make a clean line). **A connected, clean front must be an authored
continuous line**; data anchors/validates it but can't generate it.
- [x] **Curated keyframes** (`data/curated/eastern-front.json`): 23 detailed N→S
      front contours at ~monthly key dates, placed to keep Axis-held cities west /
      Soviet-held east (cross-checked vs `city-control.json`). Captures salients
      (Belorussian balcony, Stalingrad/Caucasus bulge, Kursk salient). Schematic.
- [x] ETL (`data/pipeline/build-fronts.mjs`): resample each keyframe to 120
      evenly-spaced points → `public/data/front/eastern-keyframes.json`.
- [x] `src/layers/front.ts` interpolates between bracketing keyframes by **real
      day count** → always one connected line that glides. Verified: Stalingrad/
      Caucasus (~45.7°E, lat 43) Nov 1942, recedes, Oder/Berlin by Apr 1945.
- `city-control.json` (68 cities, capture/liberation dates) kept as the
  correctness reference + future source for battle markers / colored control dots.
- Next: add encirclement **pockets** (Kiev, Stalingrad, Korsun, Courland) as
  separate features; **Wikidata battle markers**; Western/Italian fronts.

## M3 — Cities ✅
- [x] ETL (`data/pipeline/build-cities.mjs`): Natural Earth populated places →
      Europe-filtered GeoJSON with capital flag, population, scalerank, plus
      WWII-era name overrides (Stalingrad, Leningrad, Königsberg, Danzig,
      Breslau, …) — `public/data/cities/cities.geojson` (1004 cities, 61 capitals)
- [x] Render dots + labels (`src/layers/cities.ts`): capitals emphasized
      (red dot, ring, larger label); dot radius scales with zoom × importance;
      labels collision-managed via `symbol-sort-key` for zoom-dependent density
- [x] Fixed country-label repetition: the borders ETL now emits one label
      anchor per country (centroid of largest polygon); country names fade as
      cities take over on zoom-in
- Future: period-filter cities (founding/rename dates) beyond the name overrides.

## M3.5 — Front v2: pockets, daily fidelity, authoring ✅
The single-polyline front could not represent encirclements; city capture
timestamps existed but nothing enforced them. This milestone makes "day by day"
real: multi-feature fronts, a validation loop driven by documented dates, and
tooling to author keyframes fast.
- [x] **Multi-feature schema** (`data/curated/eastern-front.json` v2): a list of
      independent features, each with its own keyframe track and lifespan
      (`from <= date < to`; `to` = surrender date). `kind: front` (open N→S
      polyline) | `pocket` (closed ring, `encircled: axis|soviet`) | `siege`
      (closed ring, the city inside holds). Topology changes (a pocket pinching
      off) are modeled as feature birth/death — historically encirclements close
      in days, so no morphing hacks needed.
- [x] First authored features: **Kiev pocket** (Sep 1941, Soviet), **Stalingrad
      pocket** (3 keyframes — Kessel → Operation Ring → surrender), **Courland**,
      **Budapest**, **Festung Breslau** (Axis), **Siege of Leningrad** (dashed).
- [x] ETL v2 (`build-fronts.mjs`): per-feature resampling (120 pts open / 64 pts
      rings), rings forced CCW and cyclically rotated to align with the previous
      keyframe (no "swirl" while interpolating).
- [x] **City-side validation loop**: the ETL closes the interpolated front into
      an Axis polygon for *every day* of the war and checks all 68 cities in
      `city-control.json` sit on their documented side (pockets override).
      Mismatch runs print as a worklist: city, dates, drawn vs documented,
      distance. Already drove fixes: Moscow/Tula bend (Dec 1941), line east of
      Stalingrad city, Vistula hugged east of Warsaw, front pinned on the
      Vistula until 1945-01-12. **Remaining worklist ~51 cities / ~4.6k
      city-days** — mostly real salients the keyframes don't capture yet (Rzhev,
      Orel, Voronezh, Novgorod); each run says where to densify.
- [x] Renderer v2 (`front.ts`): per-feature interpolation; pocket fills colored
      by encircled side + outline; dashed siege rings; soft **side tint bands**
      along the main front (Axis red west / Soviet blue east via line-offset).
- [x] **City control dots** (`controlDots.ts`): every curated city gets a halo
      colored by its holder, flipping on exact documented capture/liberation
      dates (daily-accurate even between keyframes); changes within the last 3
      days get a highlight ring so captures read during playback.
- [x] **Keyframe editor** (`?edit` URL switch): click to trace waypoints on the
      map, drag to adjust, bracketing keyframes ghosted (purple = previous,
      green = next), control dots as guides; copies paste-ready keyframe JSON.
      Turns authoring a keyframe from coordinate-guessing into minutes of
      tracing against the US Army semimonthly atlas plates.
- [x] Main front now ends at VE Day (`to: 1945-05-08`) instead of holding forever.
- Deferred: **full territorial tide fill** — closing the front against a bbox
  paints neutral Sweden/Turkey; doing it right needs land-polygon clipping
  (part of the M2 control rework). The side tint bands carry the meaning until
  then. Also future: collapse animations for pockets (e.g. the Jan 1943 split
  of the Stalingrad pocket), Demyansk/Korsun/Königsberg features, densified
  keyframes for Barbarossa/Uranus/Bagration at near-daily resolution.

## M4 — Railways & roads
- [ ] ETL: Morillas-Torné 1940 railways
- [ ] Roads as modern-OSM approximation (clearly labeled)
- [ ] Layer toggles + legend

## M5 — Divisions / order of battle (hardest)
- [ ] Extract Niehorster OOB + Wikidata battles
- [ ] Unit markers (NATO symbology) per date via deck.gl
- [ ] Revisit data strategy — daily division geodata likely needs some authoring

## M6 — Polish
- [ ] Layer toggles, legend, basemap switch (modern ↔ historical raster)
- [ ] Timeline with major-battle bookmarks
- [ ] PMTiles performance pass
- [ ] Mobile + cross-browser
- [ ] Deploy (static host / GitHub Pages)
