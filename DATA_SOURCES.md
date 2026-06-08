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
| [Stanford Spatial History Project](https://web.stanford.edu/group/spatialhistory/) — WWII territorial changes | **Monthly** (Apr 1938–Nov 1944) | Shapefile / academic, non-commercial | **Primary frontline source.** Original download via web.archive.org. Interpolate monthly → daily. |
| ArcGIS "European Borders World War II" (1938, 1942) items | Year snapshots | Shapefile | Cross-check / fallback. |

## Borders (sovereign / de jure)

| Source | Granularity | Format / License | Notes |
|---|---|---|---|
| [CShapes 2.0](https://icr.ethz.ch/data/cshapes/) (ETH ICR) — **in use (M1)** | Exact change dates, 1886–2019 | GeoJSON / academic, non-commercial | Country borders with precise dates; tiles cleanly at any date. Global file windowed to 1938–1946 by `data/pipeline/build-borders.mjs`. De jure sovereignty — distinct from military frontlines. |
| [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps) | Annual snapshots (incl. 1938, 1945) | GeoJSON / **GPL-3.0** | Period borders + `places.geojson` cities. Copyleft — note for distribution. |

## Cities

| Source | Granularity | Format / License | Notes |
|---|---|---|---|
| [GeoNames](https://www.geonames.org/) | Modern + population | CC BY 4.0 | Base city list + populations. |
| Natural Earth populated places | Modern | Public domain | Lightweight fallback. |
| `historical-basemaps` `places.geojson` | `inhabitedSince`/`Until` | GPL-3.0 | Period filtering of settlements. |

## Railways & roads

| Source | Granularity | Format / License | Notes |
|---|---|---|---|
| Historical GIS of European Railways (Morillas-Torné et al., 1830–2010) | Snapshots incl. **1940** | GIS / academic | Rail mattered more than roads in WWII logistics. |
| [OpenStreetMap](https://www.openstreetmap.org/) (modern) | n/a | ODbL | Roads as a clearly-labeled modern approximation. |
| [David Rumsey Map Collection](https://www.davidrumsey.com/) | n/a | Mixed | Georeferenced WWII-era raster basemaps for realism. |

## Divisions / order of battle (M5 — hardest)

| Source | Granularity | Format / License | Notes |
|---|---|---|---|
| [Niehorster](http://niehorster.org/) | Unit org & OOB | HTML + PDF / CC | Canonical and comprehensive, but **not geodata** — needs extraction + georeferencing. |
| [Wikidata](https://www.wikidata.org/) battles | Event points (coords + dates) | CC0 | Battle markers / timeline bookmarks. |

## Basemap

| Source | License | Notes |
|---|---|---|
| [OpenFreeMap](https://openfreemap.org/) `positron` | Open (OSM-derived, ODbL data) | Current keyless vector basemap. Swappable. |
