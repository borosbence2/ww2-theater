# WWII European Theater — Day by Day

An interactive web map that visualizes the **European theater of WWII (1939–1945)
day by day**. Set or scrub a date and watch the situation change; pan and zoom
anywhere in Europe. The goal is a strategic overview first — frontlines, borders,
and cities — then the fighting formations themselves: **searchable divisions on
the map**, drill-down to lower echelons where the record supports it, and every
individual soldier *findable* through his unit plus federated external archives.
The full target design and phased roadmap live in [REWRITE_PLAN.md](./REWRITE_PLAN.md).

> **Status: front v2 — pockets, sieges, daily city control.** Map shell +
> date/time machine (slider, play/pause) with shareable deep-link URLs;
> **country borders** that change with the date (CShapes 2.0); a **multi-feature
> front**: the connected main line (interpolated between ~26 authored keyframes,
> Barbarossa to Berlin) plus **encirclement pockets and sieges** as independent
> dated features (Kiev, Stalingrad, Courland, Budapest, Breslau, Leningrad),
> with side tint bands (Axis west / Soviet east); **city control dots** that
> flip on exact documented capture/liberation dates; and **cities** with
> capitals emphasized, WWII-era names (Natural Earth). The fronts ETL
> cross-checks the drawn front against the settlement-control timeline for
> every day of the war, and a built-in **keyframe editor** (`?edit`) makes
> densifying toward daily resolution fast. The Stanford control-fill layer
> remains disabled (administrative ≠ operational front). See
> [MILESTONES.md](./MILESTONES.md) for the roadmap and data caveats.

## Stack

- **Vite + React + TypeScript**
- **MapLibre GL JS** — vector basemap, smooth zoom/pan (keyless
  [OpenFreeMap](https://openfreemap.org) `positron` style; swappable)
- **Zustand** — small global store (date, playback, viewport), synced to the URL
- Designed to ship as a **static site** — all historical data is precomputed by an
  offline ETL pipeline, so no backend is required.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```

## Regenerating data

Processed layers in `public/data/` are committed, so the app runs without any ETL
step. To rebuild from source:

```bash
# Borders (M1) — CShapes 2.0
curl -o data/raw/CShapes-2.0.geojson https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson
node data/pipeline/build-borders.mjs

# Front (main line + pockets/sieges) — authored features
# (edit data/curated/eastern-front.json, or trace in-app with ?edit and paste)
# Also validates every city in city-control.json against the front, daily.
node data/pipeline/build-fronts.mjs

# Division scaffolds (Phase 3) — Wikidata division items for DE + SU
# (fetch both SPARQL results into data/raw/wikidata-divisions-{de,su}.json,
#  same endpoint/UA as the battles query; see import-divisions.mjs header)
node data/pipeline/import-divisions.mjs

# Units (Phase 1) — curated order of battle + positions (Stalingrad pilot),
# merged with the imported scaffolds (curated files win).
# Validates every positioned unit against the front, daily (run fronts first).
node data/pipeline/build-units.mjs

# Battles (Phase 2) — Wikidata battles/sieges/operations, 1938-45, with coords
curl -G "https://query.wikidata.org/sparql" \
  --data-urlencode "format=json" \
  --data-urlencode 'query=SELECT DISTINCT ?item ?itemLabel ?coord ?start ?end ?article WHERE { VALUES ?cls { wd:Q178561 wd:Q188055 wd:Q645883 } ?item wdt:P31/wdt:P279* ?cls; wdt:P625 ?coord; wdt:P580 ?start. FILTER(YEAR(?start) >= 1938 && YEAR(?start) <= 1945) OPTIONAL { ?item wdt:P582 ?end } OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }' \
  -H "Accept: application/sparql-results+json" \
  -o data/raw/wikidata-ww2-battles.json
node data/pipeline/build-battles.mjs

# Cities (M3) — Natural Earth populated places
curl -o data/raw/ne_10m_populated_places.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson
node data/pipeline/build-cities.mjs

# Control fills (currently disabled in the app) — Stanford European Borders WWII
# (Internet Archive snapshot), unzip to data/raw/stanford_ww2/..., then:
node data/pipeline/build-control.mjs
```

Raw downloads live in `data/raw/` (gitignored). The control ETL uses dev-only
deps (`shapefile`, `proj4`, `topojson-server`, `topojson-simplify`).

## Deep links

App state lives in the URL query string, so any view is shareable:

```
/?date=1943-07-05&z=5.2&lat=49.8&lng=33.1
```

## The data challenge (read this)

The hard part of this project is **not** rendering — it is data. There is no free,
clean, *daily* dataset of WWII frontlines or division positions. The best open
frontline source is **monthly**; sovereign borders are exact-dated but differ from
military frontlines; division-level positions barely exist as open geodata.

So "day to day" is **computed** from validity-interval features plus interpolation
between sparse keyframes — not literally sourced per day. See
[DATA_SOURCES.md](./DATA_SOURCES.md) for the source list, granularity, and licenses.

## Roadmap

| Milestone | Scope |
|---|---|
| **M0** ✅ | Map shell, date slider, play/pause, URL deep-links |
| **M1** ✅ | Temporal country borders (change with the date) — CShapes 2.0 |
| **M2** ✅ | Territorial control by side, monthly (Axis tide) — Stanford |
| **M3** ✅ | Cities (capitals, population-styled, WWII names) — Natural Earth |
| **M3.5** ✅ | Front v2: pockets/sieges, daily city control, validation loop, keyframe editor |
| **Phase 0** ✅ | Foundations refactor: shared ETL lib, layer registry + toggles + legend, search + detail panel (cities), selection deep links |
| **Phase 1** ✅ | Temporal unit model + Stalingrad showcase: 37 units (6. Armee OOB + Uranus pincers), unit-vs-front validation loop, map symbols with echelon-zoom ladder, unit search/panel/deep links |
| **Phase 2** ✅ | Unit path/follow mode (`?track=1`), 445 Wikidata battle markers shown while ongoing, battle search/panel/deep links |
| **Phase 3.1** ✅ | 949 division scaffolds imported from Wikidata — every German/Soviet division searchable with an honest "not mapped yet" page (986 units total) |
| Phase 3 (rest) | Campaign position passes (Barbarossa → Kursk → Bagration → Berlin); Western/Italian fronts; importer pass 2 (ru labels, missing famous units, corps/armies, subordination) |
| **Phase 4** ✅ | People panel (federated archive search + find-their-unit wizard, `?person=`), Tier-2 drill-down (13th Guards' regiments, selection-gated), commander successions on all curated formations |
| **Eastern sim v1+v2** ✅ | SCALE_PLAN S1–S3: Boevoi sostav monthly OOB (17.3k assignments) + Lexikon der Wehrmacht Unterstellung tables (107 German divisions, 2.9k events), authored army sectors, 803 units at daily sector-derived positions (hollow icons) riding the front from Barbarossa to Berlin |
| Phase 5 | Strength/equipment records, pocket↔unit links, front sector segmentation |
| Phase 6 | Perf (PMTiles), mobile, public deploy; community-contribution decision gate |

Old M4 (railways/roads) is deprioritized below the unit work; old M5/M6 are
superseded by the phases above. Details: [REWRITE_PLAN.md](./REWRITE_PLAN.md).
Scaling to *every* formation of the war (OOB-first ingestion, sector-derived
positions, perf budgets): [SCALE_PLAN.md](./SCALE_PLAN.md).
