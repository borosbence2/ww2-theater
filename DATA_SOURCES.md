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
| [Wikidata](https://query.wikidata.org/) WWII battles — **in use (Phase 2)** | Event points (coords + start/end dates) | SPARQL / CC0 | 445 battles/sieges/operations in the European theater (`build-battles.mjs`): P31/P279* in {battle, siege, military operation}, started 1938–45, with coords. Note: the P607-conflict route is a dead end (yields ships/cemeteries, not battles). Markers shown while ongoing; linked to panels with Wikipedia/Wikidata. |
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
| **Boevoi sostav Sovetskoi Armii** (Боевой состав Советской Армии) — **in use (Eastern sim)** | **Monthly**, every Soviet formation's front/army assignment, 1941-06 → 1945-05 | Official GenStaff reference (1963–90); [teatrskazka transcription](http://www.teatrskazka.com/Raznoe/BoevojSostavSA/BoevojSostavSA.html) fetched via Wayback `id_` snapshots | Parsed by `import-bs.mjs`: 17.3k division-month assignments drive OOB chains and sector-derived daily positions. Soviet official work (public); transcription credited. |
| [Wikidata](https://www.wikidata.org/) — **in use (Phases 2–3)** | Units (QIDs, lifecycle, native names) + battles (coords + dates) | CC0 | 949 division identity scaffolds imported (`import-divisions.mjs`: P31/P279* division tree for DE/SU, WW2-window filtered, deduped vs curated). Known gaps: no-English-label items skipped, some famous formations absent from the division class tree, subordination not yet extracted. |
| [Wikidata](https://www.wikidata.org/) commanders — **in use (Phase 4.3 + ext)** | Unit commanders (P598 "commander of") + descriptions + Wikipedia links | CC0 | Two passes: `fetch-commanders.mjs` keyed by the QIDs units already carry (mostly divisions); `fetch-commanders-ext.mjs` resolves the higher formations that have **no** QID — Soviet fronts/armies/corps and German armies/army groups — by label search, verified against claims (country, type, era, ordinal) to reject wrong-nation/wrong-era homonyms. Lifts front/army commander coverage from ~0 to ~90% on both sides and adds Wikidata/Wikipedia links. Commander tenure dates are often absent on Wikidata (rendered "dates unknown"); curated and QID-dated successions always win. |
| [Wikipedia](https://en.wikipedia.org/api/rest_v1/) summaries — **in use** | One-paragraph unit descriptions | REST summary endpoint / CC BY-SA 3.0 | `fetch-descriptions.mjs` pulls the lead-paragraph extract for every unit carrying a Wikipedia link (divisions through fronts), keyed by unit id → shown atop the card as `summary`. Attributed via the unit's Wikipedia link; resumable cache so re-runs only fetch new/changed titles. |
| [Lexikon der Wehrmacht](https://www.lexikon-der-wehrmacht.de/) — **in use (Eastern sim v2)** | Per-division monthly *Unterstellung* tables (corps/army/army group/area), whole war | Website, cited | Parsed by `import-ldw.mjs` (144 cached pages → 107 divisions, 2,854 army-assignment events): German divisional OOB chains + sector-derived positions. Also external-link target on unit pages. |
| [Lexikon der Wehrmacht](https://www.lexikon-der-wehrmacht.de/) commanders — **in use** | Dated *Oberbefehlshaber* successions for German armies + army groups | Website, cited | `fetch-commanders-ldw.mjs` parses the "Oberbefehlshaber:" section of each army / army-group content page into dated tenures (German dates → ISO; keyword endpoints like "Aufstellung"/"Kapitulation" stay null). The dated German source the Wikidata path lacks; attached first (above Wikidata) for German formations, with a per-commander link to the LdW Personenregister. |
| Jentz *Panzertruppen*, divisional histories | Strength returns at dates | Books | Source for `strength` records (Phase 5.1, `oob/strength.json`); cite per record in `sources.json`. Seeded pilots (6. Armee, 16. Panzer, 13th Guards). |
| [Wikimedia Commons](https://commons.wikimedia.org/) images — **in use (Phase 5b)** | Unit insignia/photographs | Commons file / **free licenses only (CC / public domain)** | `fetch-images.mjs` resolves each unit's Wikidata **P18** to a Commons **thumbnail url** + license + author (cached in `oob/images.json`, resumable). **License-gated**: non-free images are skipped; license + author stored for attribution. The panel `<img>` points at the Wikimedia CDN thumbnail (never bundled/self-hosted), lazy-loaded. 234 units covered. |

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
