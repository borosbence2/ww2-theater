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

## Phase 4.2 + 4.3 — Drill-down showcase + commanders ✅ (Phase 4 complete)
- [x] 4.2 **Tier-2 drill-down**: 13th Guards' three rifle regiments authored
      (34th/39th/42nd Guards Rifle Regiments — central landing stage,
      Mamayev slopes, Pavlov's House sector). Sub-division echelons
      (brigade/regiment/battalion, NATO marks X/III/II) render **only while
      their parent or themselves is selected**, from z≈7 — progressive
      disclosure, the map never soups. Tracks carry `parentIds`; the units
      layer gets a focus setter driven by the selection.
- [x] 4.3 **Commanders** (`commanders[]` in the schema, validated by the
      ETL): authored for all 16 curated formations with succession intervals
      (Reichenau→Paulus, Bock→Weichs, Wietersheim→Hube,
      Kolpakchi→Lopatin→Chuikov, Timoshenko→Gordov→Yeryomenko, …) and
      biography links. Unit panel shows the list with the in-command-on-
      this-date entry highlighted.
- Verified: 36/36 smoke checks (drill-down click-through 13th Guards →
  42nd GRR with Pavlov's House keyframe; Paulus/Rodimtsev in panels).

## Eastern Front simulation v1 (SCALE_PLAN S1+S3, EASTERN_SIM_PLAN) ✅
Barbarossa → Berlin with the whole front populated: every Soviet rifle/
guards/cavalry division of every sector-assigned front at a daily derived
position, both sides' armies arrayed along the line, curated Stalingrad
tracks overriding seamlessly.
- [x] **Boevoi sostav ingestion** (`fetch-bs.mjs` + `import-bs.mjs`): all 48
      monthly "Боевой состав Советской Армии" pages (teatrskazka
      transcription via Wayback `id_` snapshots — live site blocks curl, the
      narod mirror is a JS shell), cp1251, rule-based parsing with
      right-to-left type propagation ("54 и 59 гв., 243 сд"), corps-paren
      unwrapping, skip-type poisoning (bare numbers left of skipped brigade
      groups must not inherit a stale division type). **17,317
      division-month assignments**, 361 OOB-discovered unit skeletons
      (recovering most of the ru-only divisions Wikidata import dropped).
      Gotcha for posterity: never NFD-fold Russian — й decomposes.
- [x] **OOB subordination**: monthly parents applied to 725 units (armies →
      fronts, divisions → armies), curated parents win; chains visible in
      every unit panel.
- [x] **Sector tables** (`data/curated/sectors/eastern.json`): 11 keyframes
      1941-07 → 1945-04, N→S front/army entries with boundary anchor points
      projected onto the daily line by the ETL (anchors survive front
      movement; null anchors split evenly). German armies scaffolded
      (2,4,8(II),9,11,16,17,18, Pz 1–3, 6(II)); Panzergruppe 4 lifecycle
      extended back to 1941.
- [x] **Derivation engine** (`build-units.mjs`): per month, front span →
      army slices (roster order) → division fractions; emits **721 derived
      units** as fraction keyframes (`derived/eastern.json`). The client
      resolves fractions against the daily interpolated front, so derived
      units ride the moving line; big fraction jumps hold-then-jump.
      Curated positions always win; derived skips validation (front-
      consistent by construction).
- [x] **Honest rendering**: hollow dashed icons for derived positions,
      panel disclaimer naming both inputs, search/People labels show
      "derived" instead of "not mapped".
- Totals: **1,362 units** (36 curated tracks, 721 derived, rest scaffolds).
- Verified: 40/40 smoke checks; Kursk screenshot shows both sides arrayed
  along the bulge.
- Known v1 limits (see EASTERN_SIM_PLAN): army order within fronts =
  source listing order, sectors coarse at 11 keyframes, tank/mech corps +
  brigades not yet parsed, single identity per division number (formation
  ordinals later).

## Eastern Front simulation v2 — German divisional OOB (SCALE_PLAN S2) ✅
- [x] **Source pivot**: Niehorster's corps OOBs turned out to be GIF
      organization charts (not parseable); **Lexikon der Wehrmacht** division
      pages carry machine-readable monthly *Unterstellung* tables
      (Datum | Armeekorps | Armee | Heeresgruppe | Ort) for the whole war —
      a better source than key-date snapshots.
- [x] `fetch-ldw.mjs`: harvested the family master lists (Infanterie-,
      Panzer-, Gebirgs-, Kavallerie-, Grenadier-Divisionen, schnelle
      Truppen, Sicherungs), cached 144 division content frames (gitignored;
      polite one-time crawl). `import-ldw.mjs`: year headings are
      `<big><big>1941</big></big>` paragraphs *between* tables; army cell
      found by content scan (robust to rowspan shifts); 6./8. Armee
      incarnation switching by date. **107 divisions, 2,854 assignment
      events** → `oob/de-monthly.json`.
- [x] `build-units.mjs`: German division parents from events (curated win);
      monthly army rosters; divisions subdivide their army's sector span —
      **803 derived units** total (+82 German divisions placed).
- Verified: 43/43 smoke checks; Kursk-eve at division zoom shows hollow
  German divisions west of the line facing Soviet divisions east of it.
- Post-verification fix (user-spotted): the derived-position offset used
  the left-of-travel normal, putting both sides on the wrong bank —
  `(-dy, dx)` on a N→S line points east/Soviet; Axis must offset the
  other way (right of travel = west, same convention as the front tint
  bands). One sign flip in `pointAt` (`src/layers/units.ts`).
- Remaining: ~66 harvest misses + 34 identity gaps (Wikidata lacks some
  numbered IDs) on the worklist; Waffen-SS family lists; Armeeabteilungen
  mapped to null (off-front) for now.

## Eastern Front simulation v2.1 — Soviet armored formations ✅
- [x] Boevoi sostav **armored column** parsed (`parseArmor`): tank/mech
      CORPS (тк/мк, guards variants) + 1941 tank divisions (тд), with the
      same right-to-left propagation and skip-poisoning. +1,094 assignments
      (18,411 total), 147 new corps/division skeletons; 1,519 units, **960
      derived** (+157). Corps render at the corps zoom band with XXX marks.
- [x] Gotcha for posterity: JS `` is ASCII-only — `сап` never matches
      after Cyrillic; use `$` anchors or substrings.
- Remaining: rifle corps (ск) as intermediate echelon, brigades, separate
  armies' rosters (front=null), formation ordinals.

## Eastern Front simulation v3 — COMPLETE ✅
The Eastern Front is finished against the definition of done in
EASTERN_SIM_PLAN.md. 1,739 units, 1,167 at daily derived positions.
- [x] **Rifle/cavalry corps echelon** (ск/кк): parsed with their member
      divisions, giving full front→army→corps→division chains. Corps occupy
      sector frontage weighted by member count; loose divisions get one slot.
      22,022 SU assignments; 261 corps, 119 armies, 1,324 divisions, 31 fronts.
- [x] **German identity gaps closed**: Lexikon pages our Wikidata import
      lacked now *create* the unit (139 divisions parsed, was 107);
      Armeeabteilungen Hollidt→6.Armee(II) and Kempf→8.Armee mapped to their
      lineages, others scaffolded.
- [x] **Waffen-SS divisions**: SS master lists crawled + the six name-only
      early-SS pages (LSSAH/Das Reich/Totenkopf/Polizei/Wiking/Nord) seeded
      and identity-mapped to 1.–6. SS; SS classes keyed separately from Heer.
- [x] **Axis-allied armies**: Romanian 3rd/4th, Hungarian 2nd, Italian 8th
      scaffolded and placed on the Don flank at Stalingrad (where Uranus and
      Little Saturn broke through).
- [x] **Sectors densified** 11→16 keyframes (added Dec 41 Moscow, Sep 42 full
      Don flank, Sep 43 Dnieper, Apr 44 spring, Dec 44).
- [x] Search ranking: divisions now outrank corps for bare-number queries
      ("13th Guards" → the division).
- Verified: 50/50 smoke checks.
- Out of scope (documented): Finland/Arctic (front polyline doesn't reach),
  brigades, Courland pocket sectors, formation ordinals.
- [x] **Fix: path/follow for derived units** (was a regression — the controls
      were gated on curated `positions`, so the OOB armies/divisions, which
      have none, couldn't be followed). UnitPanel shows the controls when a
      unit is derived; follow uses the derived-aware `getUnitPositionOn`; path
      mode draws the monthly sector route (`getDerivedRoute`, dashed across
      front-reassignment gaps). 54/54 smoke checks.

## Front-line accuracy pass (city-side worklist) ✅
Drove the front's own validation loop (every city checked against the drawn
line every day) down from **1,502 → 1,355 wrong city-days** (~10%), targeting
the biggest errors, all geometry-verified (no kinks, no net regressions):
- **Fast-advance gaps filled with keyframes** the linear interpolation lagged
  through: 1944-08-19 (lull before Jassy-Kishinev — fixed Chisinau, the single
  worst at 205 km × 17 d), 1941-10-07 (Typhoon: Orel/Bryansk), 1943-07-30
  (Kursk salient restored before Rumyantsev — fixed Belgorod 30 d), 1943-12-08
  (Dnieper line held — fixed Cherkassy 37 d).
- **Salient/coast geometry fixed**: 1941-10-15 southern tail now bulges along
  the Azov coast (Mariupol/Taganrog) instead of cutting straight to Perekop;
  the 1944 Rovno-Lutsk salient bulged west (fixed Rovno's 48-day error);
  Konotop nudged east in the Kiev-pocket keyframes.
- Front grew 66 → 70 main keyframes. Downstream re-verified: derived
  side-check still 99.9%, curated unit worklist unchanged, 54/54 smoke.
- Inherent limits (not chased): deep narrow panzer thrusts a single schematic
  line can't show without a spike (Daugavpils, 26 Jun 1941, 300 km dash);
  thinly-covered theatres (Yugoslavia, Hungary, Caucasus E-W segment). The
  worklist remains the tracking mechanism for further densification.

## Pocket placement + territorial tide fill ✅
Two long-standing gaps closed.
- [x] **Pocket placement** (`garrison` on pocket features → `build-units.mjs`):
      units trapped in a Kessel now sit **inside the ring**, not stranded on
      the receded main line. Garrison armies/divisions expand to their OOB
      descendants per month and are placed by golden-angle spread inside the
      (moving, shrinking) ring as ABSOLUTE keyframes; the derived format gained
      `[start, lon, lat]` keyframes alongside `[start, fraction]`, resolved by
      the client (`derivedPlacementOn`). Garrisoned: Courland (16./18. Armee —
      these had *vanished* since they left the sector table), Crimea (17.
      Armee), Stalingrad (6. Armee), Demyansk, Korsun, Budapest. 118 pocket
      placements; derived side-check holds at 99.8%.
- [x] **Territorial tide fill** (`src/layers/controlFill.ts`) — the deferred
      M2/M3.5 "shade the controlled area" feature, finally shipped. Each day
      the Axis-controlled land is filled between the interpolated front (east)
      and a fixed rear boundary, **closed along authored Baltic/Black Sea
      coasts** so the seas and neutral Sweden/Turkey are never painted — no
      polygon-clipping library, just nearest-point coast walking. Registered as
      a toggleable layer (bottom of the stack). Honest scope: single Axis fill
      (unfilled = Soviet/neutral); best 1941–44 coast-to-coast; the southern
      closure switches from the Black Sea coast to the rear boundary once the
      front goes inland (1945) to avoid enclosing liberated Romania.
- [x] **Pocket holes/islands in the fill** (`pocketRingsOn` → MultiPolygon):
      Axis pockets behind Soviet lines render as red **islands** (the
      Stalingrad cauldron sits isolated east of the main line; Demyansk,
      Korsun, Crimea, Courland likewise); Soviet pockets/sieges behind Axis
      lines (Leningrad, Oranienbaum, Sevastopol, Odessa) are **holes** punched
      in the Axis area — the strategic fill now matches the pocket placements.
- Verified: 56/56 smoke; tides screenshotted 1942→1945 (fill recedes with the
  front; Stalingrad island + Leningrad hole confirmed); Courland/Demyansk
  garrisons inside their rings.
- v1 remainder: no per-day land clipping (the rear boundary is fixed, so
  deep-1945 shading is schematic).

## Reconciliation registry + Wikidata commanders ✅
Two data-foundation items.
- [x] **Reconciliation registry** (SCALE_PLAN §4, `data/curated/units/registry/{de,su}.json`):
      a curated `merge` map folds duplicate unit records into a canonical id
      (the dupe's names become search aliases, every OOB/parent reference is
      redirected, then it's dropped) — `build-units.mjs` applies it. Seeded with
      11 verified German curated↔scaffold dupes (the Stalingrad divisions vs
      their Wikidata scaffolds), removing real search clutter; 1739→1728 units.
      `incarnations` documents formation ordinals (6. Armee / 6. Armee (II),
      8. Armee / A.Abt. Kempf as the worked examples). Key finding, recorded:
      bulk formation-splitting is NOT auto-applied — heuristics over-predict
      (Guards ≠ line number; the active-army gap flags 271/626 SU divisions,
      mostly refit not reformation), so it needs an authoritative reformation
      source; the mechanism is in place for when that lands.
- [x] **Wikidata commanders** (`fetch-commanders.mjs` → `oob/commanders.json`):
      P598 "commander of" with date qualifiers for all 941 unit QIDs → 631
      commander records across 368 units, attached by `build-units` to units
      without curated successions (curated win). Undated terms render "dates
      unknown". E.g. 12. SS now shows Witt/Meyer/Kraas; Wiking shows Gille.
- Verified: 57/57 smoke (incl. registry dedup search-alias + commanders on a
  derived division); side-check 99.8%.

## Armoured brigades — the 1941-42 armour gap ✅
Before the tank corps/armies formed, the Red Army's operational armour was the
independent tank brigade — previously skipped, so early-war Soviet armour was
absent from the map. Now parsed from the boevoi sostav armoured column.
- [x] `import-bs.mjs`: `parseArmor` refactored to extract tank/mech CORPS with
      their members, plus independent armour; tank (тбр), mechanized (мбр) and
      motor-rifle (мсбр) BRIGADES are real units now (echelon `brigade`).
      Infantry brigades (сбр/лыжбр/морская) stay out of scope — rifle divisions
      cover infantry. 27,314 SU assignments (was 22k); +~1,090 skeletons.
- [x] 398 brigades; e.g. **1st Guards Tank Brigade** (Katukov) searchable and
      derived. Brigades flow through the existing corps/sector derivation.
- [x] Render: new `brigade` echelon tier (X mark) at z≥6.8 — always-on like
      divisions, distinct from the focus-gated regiment/battalion `sub` tier
      (now z≥7.0). Side-check 99.7% (1,560 derived units).
- Verified: 59/59 smoke; tank brigades shown alongside divisions on the Moscow
  front, Nov 1941.

## Echelon zoom ladder — declutter by zoom ✅
With the whole order of battle on the map, zooming out stacked every echelon
at once. Each tier now renders in a zoom WINDOW [min,max): senior formations
appear zoomed out and drop off as you zoom into their children, so the map
shows ~one-to-two echelons at a time.
- [x] `src/layers/units.ts`: `ECH_GROUP` split army-groups/fronts into a `top`
      tier (was lumped with armies); `ZOOM_WINDOW` per tier — top 3–4.8,
      army 4.2–6.2, corps 5.3–7.2, division 6.2+, brigade 6.9+, sub
      (regiment/battalion, focus-gated) 7.2+. `addEchelonLayer` takes min+max.
- [x] Low-zoom icon size bumped so the top tier is legible at z≈3.5.
- Reads: z3.5 fronts/army groups only → z5 armies → z6.4 corps+divisions →
      z7+ brigades, regiments on selection. Default view (z4) sits in the
      front+army overlap, so both sides show at normal zoom; the German side
      only thins at deep zoom-out.
- Known gap (flagged): German **army groups** (Nord/Mitte/Süd/A/B/…) aren't
  created as units yet, so the very-zoomed-out German top tier is sparse
  (only the curated Heeresgruppe B, 1942–43). Soviet fronts populate it.
  Next step: parse the LdW Unterstellung Heeresgruppe column → army-group
  units + derived top-tier positions.
- Verified: 59/59 smoke; screenshotted z3.7→z7.2.

## German army groups + echelon depth separation ✅
Completes the zoom ladder's top tier and declutters high zoom.
- [x] **German army groups** from the Lexikon Unterstellung *Heeresgruppe*
      column (`import-ldw.mjs` now captures it: division events are
      [date, army, HGr]). 11 army groups (Nord/Mitte/Süd/A/B/Don/
      Nord-+Südukraine/Kurland/Weichsel/Ostmark); `build-units` votes each
      army's dominant HGr per month → army→army-group parents (17 armies),
      and derives the AG position as the average of its armies' sector
      fractions (top tier, deep rear). The zoomed-out view is now symmetric
      (German army groups west, Soviet fronts east) instead of Soviet-only.
- [x] **Echelon depth separation** (`ECH_DEPTH` in `src/layers/units.ts`,
      mirrored in the ETL side-check): each echelon sits at its own rearward
      offset from the line — divisions 0.12°, brigades 0.20°, corps 0.36°,
      army HQ 0.62°, front/army-group 1.25°. At high zoom the echelons read
      as staff-map depth layers instead of one overlapping row.
- Side-check 99.6% across 1,569 derived units; 60→61 smoke checks (HGr B is
  now a derived army group, not an unmapped scaffold).
- Remaining: German army-group lifecycle dates are coarse (one open interval);
  HGr renames (e.g. Süd→A/B, Süd→Nordukraine) are modelled as distinct groups,
  not a temporal rename chain.

## UI redesign — situation-room theme ✅
A cohesive visual pass over the whole interface (CSS-only + one TimeBar tweak;
no functional change, 61/61 smoke).
- [x] Design system in `src/index.css`: one token set for layered glass
      surfaces, hairlines, a warm brass accent (gold), vivid side colours
      (Axis amber-red / Soviet steel-blue), and a shared radius/shadow/easing
      scale. Stronger backdrop blur + soft drop shadows give panels depth.
- [x] Timebar: filled brass progress slider (custom thumb, `--pct` from
      TimeBar), gradient play button, lifted buttons.
- [x] Omnibox: taller field with a search glyph and focus glow ring; result
      rows with accent hover.
- [x] Detail panel: sectioned with divider headers, side-tinted holder badge,
      gradient side chips, brass underline links, custom scrollbar.
- [x] Layer panel: uppercase header, hover rows, crisper legend swatches;
      MapLibre nav control restyled to match the glass theme.
- All class hooks preserved, so the smoke suite and selectors are unchanged.

## Colourful map — two-sided tide + tinted unit icons ✅
The map now reads as a contested theatre at a glance: red Axis territory meets
blue Soviet territory along the daily front, with side-coloured unit symbols on
top. CSS-only theme stayed; this is the map/data layer (61/61 smoke, lint clean).
- [x] **Two-sided territorial fill** (`src/layers/controlFill.ts`): a fixed
      Soviet-blue "theatre mask" base (the contestable European-USSR / eastern-
      Europe landmass, Black Sea cut out as a hole so open water is never
      painted) underlies the red Axis polygon closed between the daily front and
      the fixed rear boundary. Red shows the Axis tide; blue shows through
      everywhere else, including Soviet pocket holes — so red meets blue *at the
      line* instead of red-on-blank. Two fill layers (`control-fill-soviet`,
      `control-fill-axis`) filtered by a `side` property off one source.
- [x] **Redesigned unit icons** (`makeIcon` in `src/layers/units.ts`):
      side-tinted gradient fills (Axis warm-red, Soviet steel-blue), a soft drop
      shadow, ink-coloured branch glyphs (infantry cross / cavalry slash /
      armour ellipse), and a white-haloed echelon mark; rendered at pixelRatio
      2.6 for crisp edges. Formations now read by colour over the tide.
- [x] Legend updated (`registry.ts`): the tide layer shows both
      Axis-controlled / Soviet-controlled swatches.
- Honest scope unchanged: the fill is schematic (fixed rear boundary, authored
  coastlines, no per-day polygon clipping); best 1941–44 when the front runs
  coast-to-coast, with a straight rear closure once the south goes inland (1945).

## Command tree — which divisions sit under which army ✅
The zoom ladder kept the map uncluttered but hid subordination: army symbols
live in z[4.2,6.2] and divisions appear at z6.2, so once you zoom in to inspect
divisions the parent army has already dropped off screen. Selecting a unit now
draws its whole formation around it.
- [x] **Temporal parent timelines** in the unit data (`build-units.mjs` emits
      `parents: [fromNum, toNum|null, unitId]` on derived units *and* tracks;
      `parentOnDate` in `src/data/units.ts` resolves the parent active on a day).
      1,529 / 1,569 derived units carry it; armies carry their army-group chain.
- [x] **Command-tree overlay** (`src/layers/units.ts`): selecting any unit climbs
      to its army (`anchorOf`), then gathers that army's ancestors (army group /
      front) and every corps/division under it (`computeFamily`, descent stops
      at division/brigade). The family is force-rendered by an always-on
      `units-family` symbol layer (brass labels) so the parent army stays on
      screen at any zoom, while the normal windowed tiers exclude family members
      to avoid double-drawing.
- [x] **Leader lines** (`unit-links` source, halo + brass line layers beneath the
      symbols): each family unit links to its parent, so the army HQ fans out to
      its corps and divisions — read the tree to see what's under what. Verified
      at Stalingrad (z8): 62nd Army's divisions fan from its HQ; selecting a lone
      division climbs the chain to its army.
- Legend gained a "Command link (select a unit → its army & divisions)" entry.
  61/61 smoke, lint clean. Existing regiment drill-down (sub-tier focus gating)
  is unchanged.

## Formation templates — ORBAT + establishment (TO&E) in the panel ✅
Selecting a unit now shows its structure as an org-chart, with APP-6 mini-icons:
the **actual** order of battle where we have it, and the **doctrinal template**
(establishment / TO&E / shtat) otherwise — so an army shows its real corps and
divisions, and a division shows what it was built from even when we host no
sub-unit data.
- [x] **Template library** (`src/data/templates.ts`): hand-authored TO&Es keyed
      by side + echelon + type + era, matched by date (`matchTemplate`). Covers
      German infantry (Type 1939 / 1944), Panzer (1941 / 1943-44),
      panzergrenadier; Soviet rifle (1941 04/400, late-41 04/300, 1943 04/550),
      cavalry, tank corps, mechanized corps, tank & mechanized brigades. Each is
      a small tree of {echelon, branch, count, children} with a short note.
- [x] **Actual ORBAT resolver** (`loadOrbat` in `src/data/units.ts`): reuses the
      temporal parent timelines now in the unit data to build a unit's real
      subtree on a date (army → corps → divisions; division → regiments) without
      fetching every child's detail file. Descent stops at division/regiment so
      it stays readable; node-budget capped.
- [x] **SVG glyphs** (`src/ui/UnitGlyph.tsx`): side-tinted APP-6 frame + branch
      symbol (infantry/armour/artillery/recon/AT/AA/engineer/signals/cavalry/HQ)
      + echelon size mark — crisp at any size, distinct from the canvas map icons.
- [x] **Panel org-chart** (`src/ui/UnitPanel.tsx`): an "Order of battle on this
      date" tree (clickable rows → select on map, tagged mapped/derived) and an
      "Establishment — template" tree with ×N badges. Verified: 305.
      Infanterie-Division → Type-1939 template; 6. Armee → real corps/divisions;
      13th Guards → both (its real regiments + the rifle-division shtat).
- 62/62 smoke (regiment drill-down now clicks the ORBAT row; added a
  template-present check), lint clean.
- **Full-depth templates + collapsible tree:** the establishment templates now
  go all the way down — regiment → battalion → company → platoon → squad/crew —
  built from reusable building blocks (rifle/grenadier/panzergrenadier/tank/
  artillery battalions composed once and shared across divisions). Counts are
  representative badges ("Rifle Company ×3", one expandable child), so a whole
  division's TO&E stays a few hundred nodes, not thousands. `TemplateRow` is
  collapsible (`UnitGlyph` gained platoon `•••` / squad `•` / team `Ø` / battery
  marks): expanded to the top level by default, deeper echelons drill down on
  click. Verified to squad level for German (Schützengruppe ×4) and Soviet
  (Rifle Squad ×4).

## Commanders + army info for the higher formations ✅
The QID-keyed commander fetch only reached units that already carried a Wikidata
QID — i.e. mostly divisions. Fronts, armies, and army groups are text-derived
scaffolds with **no QID**, so they had no commanders at all (the user noticed
the gap at Soviet front level). Filled by resolving them to Wikidata *by label*.
- [x] **`fetch-commanders-ext.mjs`**: for every front / army / army group lacking
      a QID, search Wikidata by label and verify the candidate against its claims
      before accepting — country (USSR vs Germany, rejecting modern Russia and
      other nations), era (rejecting WWI homonyms like the 1914 8th Army), type
      (so "4. Armee" ≠ "4. Panzerarmee", "5th Army" ≠ "5th Tank/Guards Army"),
      and ordinal/front-name. Then pulls commanders (P598), the English
      description, and the Wikipedia article. Output `commanders-ext.json` keyed
      by unit id. **151 / 161 formations resolved** (94%); spot-checked correct
      (Heeresgruppe Süd → Manstein/Rundstedt; 1st Ukrainian Front → Vatutin; 5th
      Shock Army → Berzarin).
- [x] **`build-units` merge** (priority: curated → dated QID-keyed → label-ext):
      ext fills only units still missing data, so dated successions (6. Armee's
      Paulus, 62nd Army's Chuikov) are never overwritten. ext also backfills the
      unit's `links.wikidata` + `links['wikipedia.en']` and a description note —
      "more about the army" on the panel.
- Coverage now: Soviet fronts 0→27/31, Soviet armies 0→82/91, German army groups
  1→8/11, German armies →19/28. Commander tenure dates are often absent on
  Wikidata (shown "dates unknown") — honest; names + archive links are the win.
  Remaining gap: Soviet corps/brigades (no QID, not yet resolved). 62/62 smoke,
  lint clean.

## Richer unit cards — Wikipedia descriptions + corps commanders ✅
Made the cards genuinely informative, and pushed commander/QID resolution down
to corps.
- [x] **Corps resolution**: `fetch-commanders-ext.mjs` now also resolves Soviet
      corps (rifle/tank/mechanized/cavalry) with stricter type matching (so
      "29th Rifle Corps" ≠ "29th Tank/Guards Corps"; corps without a numeric
      ordinal are skipped to avoid German roman-numeral mismatches). 268 / 422
      higher formations resolved; Soviet corps commanders 0 → 72/256, with QIDs +
      Wikipedia links for ~117.
- [x] **Wikipedia descriptions** (`fetch-descriptions.mjs`): a lead-paragraph
      summary for every unit carrying a Wikipedia link — **992 units**, divisions
      through fronts — from the REST summary endpoint (resumable cache, CC BY-SA
      attributed via the unit's Wikipedia link). Attached as `summary`,
      rendered atop the card in an accented panel (`UnitPanel` + `unit-summary`).
- [x] **More external links**: ext-resolved formations now expose Wikidata +
      Wikipedia in the card's External archives.
- Coverage: 1,007 units carry a Wikipedia link; 992 have a description. Honest
  by design — undated commanders read "dates unknown", all leaders in a span are
  listed, and the provenance note stays at the foot of the card. 62/62 smoke,
  lint clean.

## Dated German commanders, Soviet brigades, quantitative templates ✅
Three enrichments + a forward plan, on the "honest, detailed cards" direction.
- [x] **Dated German commanders** (`fetch-commanders-ldw.mjs`): parses the
      "Oberbefehlshaber:" section of each Lexikon der Wehrmacht army / army-group
      page into dated successions (German dates → ISO; keyword endpoints like
      "Aufstellung"/"Kapitulation"/"Umbenennung" stay null — honestly partial).
      30 formations, 299 records, 87% with ≥1 date, each linked to its LdW
      Personenregister bio. Attached above Wikidata for German units (priority:
      curated → LdW-dated → QID → label-ext); the panel now renders partial
      spans ("until 19 December 1941"). Turns the German side from names-only
      into real tenures (e.g. 4. Armee: Kluge → Kübler → Heinrici …).
- [x] **Soviet brigades** (resolver extended to `brigade`, with a resume cache so
      it only fetches new units): 17 of 398 resolved with QID + Wikipedia link,
      6 with commanders. Low by design — most plain-numbered tank brigades have
      no Wikidata item, and strict country/type/ordinal verification skips rather
      than guess, so **no wrong data** is attached. The famous (Guards) brigades
      that exist resolved correctly.
- [x] **Quantitative templates** (`templates.ts`): nominal *establishment*
      strength + key equipment for all 13 TO&E templates (men, MGs, mortars,
      AT/field guns, tanks, horses…), merged in `matchTemplate`, rendered as an
      "Establishment ≈ N personnel (nominal)" line + equipment chips above the
      org chart. Labelled nominal (paper TO&E, not a strength return).
- [x] **Forward plan**: REWRITE_PLAN Phase 5b — equipment data model (shared
      equipment catalog + per-unit nominal/actual layers) and an **imagery
      performance strategy** (Wikimedia Commons thumbnail URLs at display width,
      lazy-load via IntersectionObserver, ETL-cached manifest, license gating,
      APP-6 glyph fallback) — captured for the requested detail-tab expansion.
- 62/62 smoke, lint clean, build clean. (Reminder learned + recorded: restart
  the dev server after build-units — its `rmSync` of public/data makes Vite
  serve the SPA fallback for recreated files until restart.)

## Situation-room counter redesign + map declutter ✅
Per `IMPLEMENTATION.md` (the unit-system spec hand-off): a unit's echelon now
reads three ways at once and the basemap/front/tide step back so the counters
are the loudest marks on screen.
- [x] **Per-echelon counter footprint** (`makeIcon` in `src/layers/units.ts`):
      `ECH_TIER` scales the frame, deepens fill/stroke with rank (`mixHex`), and
      adds a soft coloured glow for senior HQs (army, front/army-group). The
      old fixed 52×46 canvas is gone — size is computed from the tier.
- [x] **Echelon badge chip**: the NATO mark moved into a dark rounded monospace
      chip above the frame (replacing the white-haloed text), with a top bevel
      highlight on the frame. Branch coverage extended to `mechanized`,
      `artillery`, `antitank`, `recon` (→ cavalry slash) and `hq` (empty frame).
- [x] **Icon cache keyed by tier + mark** (`iconId`): front/army-group share one
      `top` image, but battalion (II) and regiment (III) stay distinct within the
      `sub` tier — the spec's group-only key would have collapsed them.
- [x] **Label declutter** (`addEchelonLayer`): top/army/corps always labelled;
      division/brigade/sub labels gate behind z6.8 (`step` on zoom wrapping the
      ech test — zoom must be the top-level input), lighter halo, collisions hide
      juniors.
- [x] **Quieter front + tide**: the front line is now a thin crisp core (1.6→3.2
      px) over a wide low-opacity glow (`front.ts`, replacing the bright white
      casing); the tide fills drop to 0.10/0.11 opacity and desaturate toward
      grey (`controlFill.ts`) so they read as territory, not ink.
- [x] **Muted basemap** (`muteBasemap` in `MapView.tsx`): drops POI/transport
      clutter, lightens labels, and quiets roads + admin boundaries after style
      load (defensive per-layer — positron's layer set may shift).
- [x] **Hover glow + tooltip** (`setupUnitInteractions`): a side-coloured glow
      circle behind the hovered counter, lit via `feature-state` (source gains
      `promoteId: 'id'`), plus a situation-room `Popup` showing name · echelon ·
      type · nominal establishment strength (from `matchTemplate`). *Note:*
      MapLibre 5 forbids `feature-state` in layout props, so the hover "lift" is
      the paint-driven glow circle, not an `icon-size` bump as the spec sketched.
- 62/62 smoke, lint clean, build clean.

### Counter geometry ported to the exact spec board ✅
Pulled the actual Claude Design bundle (`Unit System Spec.dc.html` + its
`Counter.dc.html` primitive) and reconciled `makeIcon` to it pixel-for-pixel,
beyond the condensed `IMPLEMENTATION.md`:
- [x] **Authoritative ladder** (`LADDER`): explicit per-echelon `w/h/t/fw/bf/bh`
      (regiment 40×25 → front 93×51), replacing the scale-multiplier guess.
- [x] **Intensity fill** (`PAL` + `mixHex`): fill = `tl→td` by `t`; gradient
      `gtop=mix(fill,#fff,.5)` → `gbot=mix(fill,td,.18)`; stroke = `mix(line,ink,t/2)`.
- [x] **Inset branch glyphs** drawn in the central 68%×60% (matching the SVG
      primitive's geometry exactly), all eight branches.
- [x] **Selected state** baked into the icon: brass ring + brass glow + gold
      badge; a `-s` icon variant is pre-generated per combo and chosen for the
      focused unit in `collectionFor`.
- [x] **Command-focus dimming** (states §03 / hover B): non-formation counters
      drop to 0.4 icon / 0.32 text opacity via a `dim` feature property when a
      unit is selected.
- [x] **Tooltip** reformatted to the board's `name` + `XXXX · ARMOUR · ~N est.`
- Verified live (deep-link to su-gd-rd-13 @ 1942-09-15): badge chips, size
      ladder, brass selected ring, leader-line tree, dim, hover glow + tooltip
      all render. 62/62 smoke, lint clean, build clean.

## Eastern Front leftovers — Courland, formation ordinals, AGN-in-pocket ✅
The documented out-of-scope items from EASTERN_SIM_PLAN, picked up (all but the
Finland/Arctic front, which has no sector). 65/65 smoke, build + lint clean.
- [x] **Courland pocket — both sides.** A generic `besiegers` field on a pocket
      feature (passed through `build-fronts.mjs`): the blockading Soviet armies
      (1st Shock, 10th Guards, 22nd, 42nd) are pinned ~15 km outside the ring on
      its land-facing arc (bearing = ring centre → nearest main-line point), so
      they read as sealing the Kessel and stay within the side-check's pocket
      tolerance. The German garrison (16./18. Armee + OOB) already rode inside
      the ring; this completes the picture.
- [x] **Army-group-in-pocket fix** (`build-units.mjs`): an encircled army's
      stale main-line midpoint no longer feeds the army-group average, and a
      group with **all** armies encircled (Heeresgruppe Nord/Kurland) is now
      placed inside the pocket with them instead of averaged onto the distant
      East-Prussian line (where it was landing at fraction ≈ 0.01, wrong-side).
- [x] **Formation ordinals surfaced** (SCALE_PLAN §4): the registry's
      `incarnations` are attached to unit detail (`formations`) and rendered as a
      **Formations** panel section — full ordered history, the current unit
      highlighted, separately-modelled siblings clickable (6. Armee 1st/2nd),
      annotation-only re-formations for the rest (16. Panzer-Division, 2nd Shock
      Army: "destroyed → re-formed"). Registry seeded in `registry/{de,su}.json`;
      append-only and crowdsourcable.
- [x] **Side-check honesty**: 99.7% of 29,198 derived unit-months on the correct
      side (102 / 53 units). The residual is the model-inherent class (mobile
      corps in deep ops, the Caucasus E-W segment, northern-extreme formations) —
      not keyframe-gap artefacts, so densification was assessed and declined
      rather than authoring speculative sector data.

## Unit detail panel — situation-room redesign ✅
Recreated the design bundle's `Unit Detail.dc.html` (§8) in the React panel,
reorganising the same data into scannable sections with the numbers promoted.
65/65 smoke, build + lint clean.
- [x] **Widened 384px** (`index.css`) with a **sticky identity header**
      (`DetailPanel.tsx` hands units to `UnitPanel`, which owns header + close):
      the APP-6 counter glyph (`UnitGlyph` size 58) + period name + echelon/
      branch/country chips + a side-tinted status line, pinned while the body
      scrolls.
- [x] **Key-stats band** (`StatTile`): establishment, lead equipment, raised
      year, and end/fate promoted out of prose into monospace tiles — each
      guarded so a missing datum gets no tile.
- [x] **Chain-of-command spine**: walks parents upward (`loadAncestors`, cycle-
      guarded) into a vertical thread on a brass rail with compact counter
      glyphs, the selected unit highlighted — not a one-line parent.
- [x] **Archive chips + sources footer**: external links became hover-lit chips;
      citations/period-name recede into a hairline footer.
- Deferred (§8e, the only genuinely new data): commander portraits (Wikidata
  P18) and insignia (P41) — needs an image-fetch ETL; the panel degrades
  gracefully without them.

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
