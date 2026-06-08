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
- [x] Render control fills by side (Axis / Axis-occupied / Allied / Neutral),
      decoded client-side, beneath the political outlines/labels — `src/layers/control.ts`
- [x] Load the month covering the current date; swap on month-boundary crossing,
      cached (nearest-keyframe). M1 political fill hidden in favor of control.
- [x] Verified the tide: Axis-controlled area rises 1939→1941, falls 1944→1945.
- **Limitations (documented):** source tracks *administrative/territorial* control,
  not the fluid operational front — the East is ~static 1941–43 (no Stalingrad
  salient); late-war boundaries approximate; a few source errors (Italy pre-Sept-1943
  corrected). Monthly keyframes only (no daily interpolation yet).
- Future: daily interpolation between keyframes; a distinct front-line stroke
  (dissolve Axis vs Allied control, draw the shared boundary).

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
