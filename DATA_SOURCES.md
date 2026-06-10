# Data sources

Tracking every external dataset, its time granularity, and its license. **Check
the license before any public deployment** — the mix below includes academic
non-commercial and copyleft (GPL-3.0) terms.

> Key reality: no free dataset provides *daily* WWII frontlines or division
> positions. The best frontline source is **monthly**; the app derives any given
> day by interpolating between sparse keyframes and filtering validity-interval
> features. Treat interpolated days as approximate, not sourced truth.

## Frontlines & territorial control

| Source | Granularity | Format / License | Notes |
|---|---|---|---|
| **Curated front features** (`data/curated/eastern-front.json`) — **in use (front)** | ~26 main-line dates + 6 pockets/sieges (interpolated daily) | Hand-authored polylines/rings | **Front source.** Independent features, each with its own keyframe track and lifespan: the connected N→S main line, plus encirclement pockets and sieges as closed rings (Kiev, Stalingrad, Courland, Budapest, Breslau, Leningrad). Resampled + interpolated by `build-fronts.mjs` / `front.ts`; trace new keyframes in-app with `?edit`. Schematic, not survey-traced. Eastern Front only so far. |
| **Settlement-control table** (`data/curated/city-control.json`) | 68 cities, capture/liberation dates | Hand-authored JSON | The daily-accuracy backbone: drives the in-app city control dots (holders flip on exact documented dates) and the ETL **validation loop** — every day of the war, every city is checked against the drawn front and mismatches print as the keyframe worklist. *Note:* deriving the line directly from these points via Voronoi was tried and rejected — too disconnected. |
| [Wikidata](https://query.wikidata.org/) WWII battles | Event points (coords + dates) | SPARQL / CC0 | Planned: battle markers (the famous battles as dated points). |
| [Stanford Spatial History Project](https://web.stanford.edu/group/spatialhistory/) — European Borders WWII | **Monthly** (Feb 1938–May 1945) | Shapefile (Europe Albers / ED50) / academic, non-commercial | Built into per-month control TopoJSON (`build-control.mjs`) but **currently disabled in the app**: it tracks *administrative occupation*, not the operational front (placed the 1942 line ~700 km west of Stalingrad; static 1941–43), so it conflicted with the curated front. Kept for a future front-consistent fill rework. [Internet Archive snapshot](http://web.archive.org/web/20130521002915/http://www.stanford.edu/group/spatialhistory/Publications/HolocaustGeographies/EuropeanBorders_WWII.zip). |
| [US Army *Atlas of the World Battle Fronts*](https://en.wikisource.org/wiki/Atlas_of_the_World_Battle_Fronts_in_Semimonthly_Phases_to_August_15_1945) | Semi-monthly (Jul 1943–Aug 1945) | Map plates (images) | Authoritative operational fronts, but raster — a **reference** for refining/densifying the curated keyframes, not importable geometry. |
| ArcGIS "European Borders World War II" (1938, 1942) items | Year snapshots | Shapefile | Cross-check / fallback. |
| [federicodassereto/European-WWII-visualization](https://github.com/federicodassereto/European-World-War-II-Events-visualuzation) | Monthly (1938–1945) | TopoJSON / no license | **Rejected:** full-war coverage with clean Axis/Allied/Neutral status, but geometry is in lost pixel/projection space (drawn via `d3.geoPath()` with no projection) → not georeferenceable. |

## Borders (sovereign / de jure)

| Source | Granularity | Format / License | Notes |
|---|---|---|---|
| [CShapes 2.0](https://icr.ethz.ch/data/cshapes/) (ETH ICR) — **in use (M1)** | Exact change dates, 1886–2019 | GeoJSON / academic, non-commercial | Country borders with precise dates; tiles cleanly at any date. Global file windowed to 1938–1946 by `data/pipeline/build-borders.mjs`. De jure sovereignty — distinct from military frontlines. |
| [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps) | Annual snapshots (incl. 1938, 1945) | GeoJSON / **GPL-3.0** | Period borders + `places.geojson` cities. Copyleft — note for distribution. |

## Cities

| Source | Granularity | Format / License | Notes |
|---|---|---|---|
| [Natural Earth populated places](https://github.com/nvkelso/natural-earth-vector) (`ne_10m`) — **in use (M3)** | Modern + population | GeoJSON / Public domain | Europe-filtered with capital flag, `POP_MAX`, `SCALERANK` (zoom density) by `data/pipeline/build-cities.mjs`. WWII-era name overrides applied (Stalingrad, Leningrad, Königsberg, Danzig, Breslau, …). |
| [GeoNames](https://www.geonames.org/) | Modern + population | CC BY 4.0 | Alternative with richer population data. |
| `historical-basemaps` `places.geojson` | `inhabitedSince`/`Until` | GPL-3.0 | Option for period-filtering settlements (founding/rename). |

## Railways & roads

| Source | Granularity | Format / License | Notes |
|---|---|---|---|
| Historical GIS of European Railways (Morillas-Torné et al., 1830–2010) | Snapshots incl. **1940** | GIS / academic | Rail mattered more than roads in WWII logistics. |
| [OpenStreetMap](https://www.openstreetmap.org/) (modern) | n/a | ODbL | Roads as a clearly-labeled modern approximation. |
| [David Rumsey Map Collection](https://www.davidrumsey.com/) | n/a | Mixed | Georeferenced WWII-era raster basemaps for realism. |

## Divisions / order of battle (REWRITE_PLAN Phases 1–3 — hardest)

| Source | Granularity | Format / License | Notes |
|---|---|---|---|
| [Niehorster](http://niehorster.org/) | Unit org & OOB | HTML + PDF / CC | Canonical and comprehensive, but **not geodata** — needs extraction + georeferencing. Primary scaffold source for unit identity/subordination (Phase 3 importer). |
| [Pamyat Naroda](https://pamyat-naroda.ru/) (Память народа) | Unit combat paths, often daily; scanned operational documents/maps | Web archive / Russian MoD | The richest Eastern-Front source: per-unit combat journals and daily situation maps. Reference for authoring Soviet (and mirrored German) position keyframes; also the person-search archive for Soviet records. |
| [Wikidata](https://www.wikidata.org/) | Units (QIDs, commanders, lifecycle) + battles (coords + dates) | CC0 | Cross-reference IDs on unit records; battle markers (Phase 2); commander stubs (Phase 4). |
| Lexikon der Wehrmacht / Feldgrau / TracesOfWar unit pages | Per-unit histories | Web / mixed | External-link targets on unit detail pages; reference for German unit lifecycles. |
| Jentz *Panzertruppen*, divisional histories | Strength returns at dates | Books | Source for `strength` records (Phase 5); cite per record in `sources.json`. |

## People (Phase 4 — federated link-out, never hosted)

| Archive | Covers | Access | Notes |
|---|---|---|---|
| [Pamyat Naroda](https://pamyat-naroda.ru/heroes/) | Soviet personnel, awards, route of service | Name-query URL | Names the soldier's unit → unit lookup in-app. |
| [OBD Memorial](https://obd-memorial.ru/) | Soviet fallen & missing | Name-query URL | |
| [NARA AAD — WWII Army Enlistment](https://aad.archives.gov/aad/) | ~9M US enlistment records | Name-query URL | Public domain. |
| [ABMC](https://www.abmc.gov/database-search) | US burials/memorials abroad | Name-query URL | |
| [CWGC](https://www.cwgc.org/find-records/find-war-dead/) | Commonwealth war dead | Name-query URL | |
| [Volksbund Gräbersuche](https://www.volksbund.de/erinnern-gedenken/graebersuche-online) | German war graves | Name-query URL | |
| [TracesOfWar persons](https://www.tracesofwar.com/persons/) | Mixed, biographical | Name-query URL | |
| Fold3 / Ancestry | US + mixed service records | Name-query URL (**paywalled** — label as such) | |

## Basemap

| Source | License | Notes |
|---|---|---|
| [OpenFreeMap](https://openfreemap.org/) `positron` | Open (OSM-derived, ODbL data) | Current keyless vector basemap. Swappable. |
