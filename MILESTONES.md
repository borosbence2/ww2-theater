# Milestones

Living progress log. Strategic-overview-first: a genuinely usable app exists by
the end of M3.

## M0 — Skeleton ✅
- [x] Vite + React + TypeScript project
- [x] MapLibre map centered on the European theater (keyless basemap)
- [x] Date state + timeline slider (1939-09-01 → 1945-09-02)
- [x] Play / pause / step controls with adjustable speed (days per second)
- [x] Viewport + date synced to the URL (shareable deep links)

## M1 — Temporal borders
- [ ] ETL: ingest CShapes 2.0 + `historical-basemaps` → normalized GeoJSON with
      `start`/`end` validity dates
- [ ] Render period-correct country borders that change as the date moves
- [ ] Validity-interval filtering keyed on the current date
- [ ] Verify against known dates (Sept 1939 Poland partition, mid-1940 France)

## M2 — Frontlines & territorial control (headline)
- [ ] ETL: ingest Stanford Spatial History monthly territorial-control polygons
- [ ] Render Axis / Allied / neutral control fills + the front line
- [ ] v1: snap to nearest monthly keyframe; v1.1: daily vertex interpolation
- [ ] Spot-check vs reference maps (Stalingrad ~Nov 1942, Bulge ~Dec 1944, Berlin ~Apr 1945)

## M3 — Cities
- [ ] ETL: GeoNames + `historical-basemaps` places, period-filtered
- [ ] Population-styled markers, capitals, zoom-dependent label density

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
