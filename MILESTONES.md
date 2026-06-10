# Milestones

Living progress log. Strategic-overview-first: a genuinely usable app exists by
the end of M3.

> **Direction change (June 2026):** the project is now a unit-centric atlas —
> divisions on the map, searchable, with people reachable via unit linkage to
> external archives. [REWRITE_PLAN.md](./REWRITE_PLAN.md) holds the target
> architecture and Phases 0–6, which supersede M4–M6 below (M4 railways is
> deprioritized; M5 is absorbed into Phases 1–5; M6 split into Phases 0 and 6).
> Progress on the phases is logged here, after M3.5.

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

## Phase 0 — Foundations refactor (REWRITE_PLAN) ✅
Groundwork for units: shared pipeline code, a layer registry with user-facing
toggles + legend, a search/selection UI shell, and selection deep links —
no new historical data.
- [x] 0.1 Shared ETL lib (`data/pipeline/lib/`): date math (`dates.mjs`),
      resampling/ring alignment + point-vs-front geometry (`geometry.mjs`),
      keyframe interpolation (`interpolate.mjs`). `build-fronts.mjs` rebuilt on
      it; output verified byte-identical.
- [x] 0.2 Layer registry (`src/layers/registry.ts`): each layer declares id,
      label, legend swatches, and its MapLibre layer ids; visibility toggles in
      the store, persisted to the URL as `?layers=` (omitted when default).
      Toggle + legend panel (`src/ui/LayerPanel.tsx`), collapsible, top-left.
- [x] 0.3 App shell: omnibox city search (`src/ui/Omnibox.tsx`, diacritic-folded
      substring match over the Natural Earth set, ranked by importance) and a
      collapsible right-hand detail panel (`src/ui/DetailPanel.tsx`). City
      detail: country, capital badge, population, and — for curated cities —
      the holder on the current date plus the full documented capture/
      liberation history (clickable dates that jump the timeline).
- [x] 0.4 Selection state in the store (`selection`), synced to the URL
      (`?city=Stalingrad`) for shareable deep links; city dots clickable on the
      map; search/URL selection flies the camera to the city.
- Notes: city data now loads once through `src/data/cities.ts` (shared by the
  layer, the omnibox, and the panel); the map instance is exposed via
  `src/map/mapRef.ts` so UI components can fly the camera. These are the same
  seams Phase 1 unit search/selection will use.
- Verified end-to-end with a headless-Chrome smoke script
  (`scripts/smoke-ui.mjs`, Playwright via `NODE_PATH`): search → select →
  history-date jump → layer toggle → deep-link round-trips, plus screenshots.
- Bug found by the smoke test and fixed: `Number(null) === 0`, so `readUrl()`
  read absent `z/lat/lng` params as a (0,0,z0) viewport — every clean visit
  (no query string) started over the Gulf of Guinea instead of Europe.

## Phase 1 — Temporal unit model + Stalingrad showcase (REWRITE_PLAN) ✅ (v1)
The vertical slice through the whole unit architecture: schema → curated data
→ ETL with validation → map symbols → search → detail panel. Scrub Jun 1942 →
Feb 1943 and watch 6. Armee advance into the Kessel and die; every formation
is clickable and deep-linkable.
- [x] 1.1 **Schema + sources**: `data/curated/units/schema.md` (temporal
      names/existence/parents/positions, `[from, to)` intervals, confidence +
      `move` semantics — rail/gap segments hold-then-jump, never glide) and
      `sources.json` (position keyframes cite source ids).
- [x] 1.3 **Pilot dataset, 37 units** (`data/curated/units/{de,su}/`):
      Heeresgruppe B → 6. Armee + 4. Panzerarmee → 5 corps (incl. IV. AK's
      documented mid-battle parent switch from 4. PzA to 6. Armee) → 16
      German divisions; Soviet side: 3 fronts (scaffolds), 62nd/64th Armies,
      5th Tank Army + 51st Army (the Uranus pincers), and six 62nd Army
      divisions in the city (13th/37th/39th Guards, 95th, 284th, 308th).
      33 units have position tracks (~190 keyframes); scaffolds are
      searchable with an honest "not mapped yet" page.
- [x] 1.2 **ETL** (`data/pipeline/build-units.mjs`, on the shared lib):
      schema/referential validation, movement-speed plausibility, and the
      **unit-vs-front side check** — every positioned unit, every day, must
      sit on its own side of the interpolated front (pocket rings override;
      ≤25 km of the line / ≤30 km of a ring counts as contested, not wrong).
      Emits `public/data/units/`: search index, per-theater tracks, 37 unit
      detail files (with resolved parent/children labels + citations).
- [x] **The loop already drove a front fix**: the Nov 20–22 mismatch cluster
      (every Kessel unit "soviet-side" before the pocket existed) exposed that
      the line should hold at the city until the ring closes — added the
      `1942-11-22` main-front keyframe ("flanks pierced, line still holds").
      Worklist went from 227 unit-days/24 units to **105/11**, all of it the
      two known schematic gaps, kept deliberately as the live worklist:
      the August Don-bend pause and the **Rynok corridor** (16. Pz is pinned
      to its documented Volga position so the missing salient stays visible),
      plus two single Uranus-corridor days.
- [x] 1.4 **Units layer** (`src/layers/units.ts`): staff-map symbols generated
      on canvas (side-colored frame, cross/ellipse branch marks, XX/XXX/XXXX
      echelon ticks), echelon↔zoom ladder (armies always, corps z≥5.4,
      divisions z≥6.2), date interpolation with hold-then-jump, approximate
      segments slightly transparent. Clickable; registered with toggles/legend.
- [x] 1.5 **Search + panel + deep links**: omnibox searches units (aliases,
      transliterations; cities win ranking ties — found by the smoke test
      when "Stalingrad" returned the Front HQ above the city), selecting jumps
      the timeline into the unit's lifespan and flies to it; `?unit=` URLs;
      unit panel shows period name, lifecycle + fate, chain of command at the
      date, full subordination intervals, subordinate units, labeled position
      keyframes (clickable dates), external archives, citations.
- Verified: 20/20 smoke checks (`scripts/smoke-ui.mjs`) including OOB
  navigation (6. Armee → Heeresgruppe B) and Soviet alias search.
- Remaining for Phase 1 polish: editor unit-authoring mode (`?edit`),
  Romanian armies + LVII. Panzerkorps (Winter Storm spearhead), pre-1942
  positions for the armies, front densification for the worklist clusters.

## Phase 2 — Follow the unit; battle markers (REWRITE_PLAN) ✅ (core)
- [x] 2.3 **Unit path mode** (`src/layers/unitPath.ts`): "Show path" on any
      mapped unit draws its full route — per-segment lines (dashed for
      rail/gap jumps), a solid "traveled so far" overlay split at the current
      date's interpolated position, keyframe dots with dates on zoom.
      Persisted as `?track=1` (deep-linkable). "Follow" pins the camera to
      the unit while scrubbing/playing (`map.easeTo` per date change).
      Both modes clear when the selection leaves the unit.
- [x] 2.4 **Battle markers** (`data/pipeline/build-battles.mjs` +
      `src/layers/battles.ts`): Wikidata SPARQL (battles/sieges/military
      operations, P31/P279* trees, started 1938–45, with coordinates; the
      P607-conflict route was a dead end — that set is ships/cemeteries).
      445 battles in the European theater after bbox/date/label filtering.
      Crossed-swords canvas icon; markers appear while ongoing (MapLibre
      filter over `YYYYMMDD` ints, cheap during playback) and linger faded
      3 days after the end. Clickable → battle panel (dates, status on the
      current date, Wikipedia/Wikidata links); searchable in the omnibox
      (selecting jumps the timeline into the battle); `?battle=QID` deep
      links. Raw SPARQL result cached in `data/raw/` (gitignored).
- [x] 2.1/2.2 were effectively delivered in Phase 1 (client-side index
      search; select→jump→fly); revisit a prebuilt minisearch index only
      when the unit count makes the simple scorer slow.
- Verified: 26/26 smoke checks incl. path toggle URL round-trip and Kursk
  search jumping the timeline to 5 July 1943.
- Remaining Phase 2 polish: unit↔battle links (P710 participants),
  battle-bookmark ticks on the timeline slider.

## Phase 3.1 — Division scaffolds: every division findable ✅ (importer v1)
- [x] **Importer** (`data/pipeline/import-divisions.mjs`): Wikidata division
      items for Nazi Germany + USSR (P31/P279* division tree, per-country
      P17) → **949 identity scaffolds** (428 German, 521 Soviet) in one
      reviewable file (`data/curated/units/imported-divisions.json`):
      readable slug ids, type/branch derived from names (Waffen-SS,
      Luftwaffe-field detection), native-language aliases, coarse lifecycle
      (P571/P576; Wikidata "unknown value" genid URIs guarded), WW2-window
      filter (drops 50 post-war Soviet divisions), QID/alias dedupe against
      curated files (curated always wins; 9 skipped).
- [x] **ETL merge** (`build-units.mjs`): scaffolds join the index and detail
      output (positions empty → searchable, honest "not mapped yet" +
      auto-imported notice in the panel). **986 units total.**
- [x] **Sharded detail files**: per-unit files do not scale past ~1k units —
      Vite's dev public-file cache silently served only the first ~42 and
      fell back to index.html for the rest (found by the smoke test). Details
      now ship as 16 hash-bucketed shards (~45 KB each), kinder to git and
      static hosts too; `loadUnitDetail` resolves via the mirrored hash.
- [x] MapLibre resource-error filter: missing OpenFreeMap glyph-range 404s no
      longer pollute the console (real errors still log).
- Verified: 28/28 smoke checks (incl. imported-division search → honest
  scaffold page).
- Known importer gaps (next pass): 602 items skipped for having no English
  label (mostly Soviet — add ru-label fallback); some famous formations are
  missing from Wikidata's division class tree (e.g. Leibstandarte,
  Großdeutschland — add by-QID include list); corps/armies not yet imported;
  subordination (P749/P361) not yet extracted.

## Phase 4.1 — People: federated archive search + find-their-unit ✅
"Everyone who fought is findable", delivered honestly: no personal records
hosted, ever.
- [x] **People panel** (`src/ui/PeoplePanel.tsx`, People button by the
      omnibox): a name fans out as prefilled query links to 11 archives —
      Pamyat Naroda, OBD Memorial, Podvig Naroda (Soviet), Volksbund
      (German), NARA AAD, ABMC (US), CWGC (Commonwealth), TracesOfWar,
      Find A Grave, Fold3/Ancestry (labeled as paywalled) — filterable by
      side. Where an archive's query format is unstable we link its search
      page instead of guessing parameters.
- [x] **Find-their-unit wizard**: the archive record names the unit; typing
      it here resolves against all 986 units (aliases included — "305th
      Infantry" finds 305. Infanterie-Division) and selecting flies to its
      mapped position / opens its page. This closes the loop the plan
      promised: person → archive → unit → daily path on the map.
- [x] `?person=Name` deep links (panel open + query restored).
- [x] Shared select-and-go actions extracted from the omnibox
      (`src/ui/actions.ts`) — used by both search surfaces.
- Verified: 31/31 smoke checks.
- Future (Phase 4 rest): sub-division drill-down showcase; curated
  notable-commander stubs on unit pages.

## M4 — Railways & roads (deprioritized — see REWRITE_PLAN.md)
- [ ] ETL: Morillas-Torné 1940 railways
- [ ] Roads as modern-OSM approximation (clearly labeled)
- [ ] Layer toggles + legend

## M5 — Divisions / order of battle (superseded by REWRITE_PLAN Phases 1–5)
- [ ] Extract Niehorster OOB + Wikidata battles
- [ ] Unit markers (NATO symbology) per date via deck.gl
- [ ] Revisit data strategy — daily division geodata likely needs some authoring

## M6 — Polish (split into REWRITE_PLAN Phases 0 and 6)
- [x] Layer toggles + legend (done in Phase 0)
- [ ] Basemap switch (modern ↔ historical raster)
- [ ] Timeline with major-battle bookmarks
- [ ] PMTiles performance pass
- [ ] Mobile + cross-browser
- [ ] Deploy (static host / GitHub Pages)
