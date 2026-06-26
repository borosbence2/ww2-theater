# WWII European Theater — Day by Day

An interactive web map that visualizes the **European theater of WWII (1939–1945)
day by day**. Set or scrub a date and watch the situation change; pan and zoom
anywhere in Europe. The goal is a strategic overview first — frontlines, borders,
and cities — then the fighting formations themselves: **searchable divisions on
the map**, drill-down to lower echelons where the record supports it, and every
individual soldier *findable* through his unit plus federated external archives.
The full target design and phased roadmap live in [REWRITE_PLAN.md](./REWRITE_PLAN.md).

> **Status: the Eastern Front is simulated, Barbarossa → Berlin.** The moving
> multi-feature front (main line, pockets, sieges, daily city control) is now
> populated by **2,202 military units**: the curated Stalingrad showcase
> (6. Armee's order of battle down to 13th Guards' regiments, commander
> successions, documented position tracks), plus **~1,770 units at daily
> sector-derived positions** — every Soviet rifle/guards/cavalry division from
> the monthly *Boevoi sostav* lists and **321 German divisions** from Lexikon der
> Wehrmacht *Unterstellung* tables, plus Soviet tank/mech corps and brigades
> from the armored-forces column, distributed along authored army sectors and
> riding the interpolated front (hollow icons = derived, solid = documented).
> Everything is searchable (units by alias/transliteration, cities, 445
> Wikidata battles), clickable (OOB chains, drill-down, path/follow mode), and
> deep-linkable; the **People panel** fans a name out to 11 national archives
> and resolves the found unit back onto the map.
>
> **Unit cards are detailed and honest.** Selecting a unit draws its **command
> tree** on the map (leader lines from the army HQ down to its corps/divisions)
> and shows, in the panel: a Wikipedia **description** (995 units), **commander
> successions** (596 units — Wikidata for Soviet fronts/armies/corps, *dated*
> Lexikon der Wehrmacht successions for German formations; undated tenures read
> "dates unknown"), the **actual order of battle** on the date where we have it,
> and the **doctrinal establishment template** (TO&E) otherwise — drillable down
> to squad/crew, with nominal strength + key equipment.
>
> A toggleable two-sided **territorial tide** shades the theatre — red
> Axis-held west of the front, blue Soviet-held east — meeting at the daily
> line; encircled formations sit inside their pocket rings. Validation loops
> check every city and every curated unit against the front for every day of
> the war. See [MILESTONES.md](./MILESTONES.md) for details,
> [SCALE_PLAN.md](./SCALE_PLAN.md) for where this is headed.

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

# City-control display density (optional) — adds Natural Earth places (pop>=50k)
# as `derived` control dots whose timeline is sampled from the built front, then
# re-runs build-fronts to copy them out. Needs ne_10m_populated_places.geojson.
node data/pipeline/densify-control.mjs && node data/pipeline/build-fronts.mjs

# Division scaffolds (Phase 3) — Wikidata division items for DE + SU
# (fetch both SPARQL results into data/raw/wikidata-divisions-{de,su}.json,
#  same endpoint/UA as the battles query; see import-divisions.mjs header)
node data/pipeline/import-divisions.mjs

# Minor-Axis divisions (Don/Stalingrad flank: Romanian/Hungarian/Italian) —
# generates committed scaffolds + OOB events consumed by build-units.
node data/pipeline/build-minor-axis.mjs

# Finnish / Arctic theatre (build-finnish.mjs) — Finnish + German-mountain OOB
# scaffolds; placed on the separate finnish-front/arctic-front lines by build-units.
node data/pipeline/build-finnish.mjs

# Units (Phase 1) — curated order of battle + positions (Stalingrad pilot),
# merged with the imported scaffolds (curated files win).
# Validates every positioned unit against the front, daily (run fronts first).
node data/pipeline/build-units.mjs

# Commander + description enrichment (two-pass: build-units must run once first
# so these scripts can read index.json + the detail shards, then run it again to
# attach). All write committed intermediates under data/curated/units/oob/.
node data/pipeline/fetch-commanders.mjs      # Wikidata P598, by the QIDs units carry
node data/pipeline/fetch-commanders-ext.mjs  # QID-less fronts/armies/corps/brigades, by label (resumable)
node data/pipeline/fetch-commanders-ldw.mjs  # dated German Oberbefehlshaber from Lexikon der Wehrmacht
node data/pipeline/fetch-descriptions.mjs    # Wikipedia lead-paragraph summary per linked unit (resumable)
node data/pipeline/fetch-images.mjs          # Wikidata P18 -> Commons thumbnail + license, per unit (resumable)
node data/pipeline/build-units.mjs           # re-run to attach commanders/descriptions/images

# Battles (Phase 2) — Wikidata battles/sieges/operations, 1938-45, with coords
curl -G "https://query.wikidata.org/sparql" \
  --data-urlencode "format=json" \
  --data-urlencode 'query=SELECT DISTINCT ?item ?itemLabel ?coord ?start ?end ?article WHERE { VALUES ?cls { wd:Q178561 wd:Q188055 wd:Q645883 } ?item wdt:P31/wdt:P279* ?cls; wdt:P625 ?coord; wdt:P580 ?start. FILTER(YEAR(?start) >= 1938 && YEAR(?start) <= 1945) OPTIONAL { ?item wdt:P582 ?end } OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }' \
  -H "Accept: application/sparql-results+json" \
  -o data/raw/wikidata-ww2-battles.json
node data/pipeline/build-battles.mjs

# Air forces (Luftwaffe / VVS) — curated airfields + air units. Airfields are a
# curated catalog (data/curated/airfields/eastern.json); run build-airfields to
# copy them to public + a point GeoJSON and to referential-check every air unit's
# `base`. Air units are ordinary curated unit files flagged `"air": true` (in
# data/curated/units/{de,su}/), so build-units picks them up and resolves their
# keyframe `base` -> airfield coords. Aircraft models live in src/data/aircraft.ts
# (referenced by id), and the air layer draws combat-radius range rings from them.
node data/pipeline/build-airfields.mjs   # before build-units (base referential check)
# (build-units, above, then renders air discs via the separate "Air forces" layer)
#
# Air scaffolds (theater-wide breadth) — Wikidata Luftwaffe + Soviet VVS flying
# formations -> identity-only `air:true` skeletons (searchable, "not mapped yet"),
# the air analogue of import-divisions. Fetch both SPARQL results, then import;
# build-units (above) merges them (curated air files win):
#   DE: ?item wdt:P241 wd:Q2564009 (Luftwaffe) ; wdt:P31/wdt:P279* wd:Q176799
#   SU: ?item wdt:P17 wd:Q15180 (USSR) ; wdt:P31/wdt:P279* wd:Q176799 ; class ~ aviation
# (same endpoint/UA as the battles query; -> data/raw/wikidata-air-{de,su}.json)
node data/pipeline/import-air.mjs
# Operational air commands (Soviet air armies + German Luftflotten) are placed on
# the map by build-units from data/curated/units/oob/air.json, which assigns each
# to a ground anchor (Front / army group); they render as hollow "derived" discs
# in the rear behind that anchor. Per-Geschwader/regiment scaffolds stay searchable
# until individually curated. (No extra command — build-units reads air.json.)

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
| **Eastern Front sim** ✅ | SCALE_PLAN S1–S3, *complete*: Boevoi sostav (22k assignments, full front→army→corps→division chains) + Lexikon der Wehrmacht (German divisions incl. Waffen-SS) + Romanian/Hungarian/Italian armies; 2,136 units, 1,569 at daily sector-derived positions (hollow icons), Barbarossa→Berlin. See EASTERN_SIM_PLAN.md for the definition of done. |
| **Detail cards** ✅ | Two-sided territorial tide; on-select **command tree** (leader lines army→corps→divisions); rich unit cards — Wikipedia descriptions, commander successions (Wikidata + dated Lexikon der Wehrmacht), actual ORBAT, doctrinal TO&E templates drillable to squad with nominal strength/equipment |
| **Phase 5** (in progress) | Establishment strength/equipment on templates ✅, actual strength-at-date ✅, equipment catalog ✅, unit imagery (Commons thumbnails, lazy-load) ✅, pocket↔unit links ✅, front graphics ✅ — FEBA line with forward-edge teeth, dynamic advance arrows (computed from front movement), encirclement pincers on pockets, and 10 curated operation arrows spanning the war (Barbarossa → Berlin) |
| **Air forces** ✅ | Luftwaffe + Soviet VVS as a distinct layer: circular disc counters (role silhouettes), clickable curated airfields, aircraft-model catalog on the card, and HOI4-style combat-radius **range rings** (per-selection + an all-ranges toggle). Deep Stalingrad air-war pilot (LF 4 / VIII. Fliegerkorps + the airlift vs 8th/16th Air Armies, down to Gruppe/regiment). Theater backbone: 336 Wikidata Luftwaffe/VVS scaffolds (searchable), with every Eastern-Front air command (Soviet air armies 1–17 + German Luftflotten) placed behind its front/army group as a hollow derived disc, each carrying representative aircraft (→ combat-radius range rings) and a doctrinal aviation-division drill-down on selection. Air-battle showcases (`oob/air-battles.json`) add real named formations — Kursk (2 VA), Bagration (1 VA), Leningrad (13 VA), Berlin (16 VA) — clickable with their own aircraft. |
| **1939–40 prelude** ✅ | The war before Barbarossa, on the same front/pocket/operations engine: the **Invasion of Poland** (Wehrmacht and Red Army fronts converging on the Molotov–Ribbentrop line, with the Bzura, Warsaw, Modlin and Lwów pockets/sieges), the **Winter War** (the Karelian-Isthmus front collapsing to the Moscow Peace line, plus the Suomussalmi/Raate and Lemetti *mottis*), and the 1940 **Soviet annexations** (Baltic states; Bessarabia & N. Bukovina) as labelled operation arrows over the de-jure border changes. City-control timelines back-filled to 1 Sep 1939 (Polish captures, the Viipuri and Bessarabia cessions) |
| Phase 6 | Perf (PMTiles), mobile, public deploy; community-contribution decision gate |

Old M4 (railways/roads) is deprioritized below the unit work; old M5/M6 are
superseded by the phases above. Details: [REWRITE_PLAN.md](./REWRITE_PLAN.md).
Scaling to *every* formation of the war (OOB-first ingestion, sector-derived
positions, perf budgets): [SCALE_PLAN.md](./SCALE_PLAN.md).
