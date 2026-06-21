# Rewrite plan — from frontline viewer to unit-centric atlas

> **Status 2026-06-11:** Phases 0–4 shipped (see MILESTONES.md); Phase 3's
> breadth strategy superseded and largely delivered by
> [SCALE_PLAN.md](./SCALE_PLAN.md) S1–S3 (Eastern Front simulation).
> Open: Phase 5 (strength, pocket↔unit links, sector segmentation),
> Phase 6 (perf/deploy/contributions), Western/Italian fronts, the `?edit`
> unit-authoring mode.

Target: an app where the WWII frontlines move day by day **and** the fighting
formations are on the map — searchable, clickable, drillable down to whatever
echelon the historical record supports, with every individual soldier *findable*
through his unit and external archives.

This document has two parts:

1. **Part 1 — Target architecture**: the full design as if built fresh ("the
   rewrite"). The data model is the real rewrite; most rendering/ETL
   infrastructure survives.
2. **Part 2 — Incremental steps**: how to get there in shippable phases without
   ever breaking the working app.

Honesty principle that shapes everything below: positional data quality falls
off a cliff below division level, and individuals were never positionally
tracked. So the design is **progressive disclosure** — division coverage as the
war-wide goal, lower echelons where digitized, individuals always via
*unit linkage + federated external search*, never hosted records. Every mapped
fact carries provenance and confidence, and the UI renders uncertainty
honestly (documented vs. interpolated vs. approximate).

---

## Part 1 — Target architecture

### 1.1 Product scope tiers

| Tier | What | Coverage goal | Data strategy |
|---|---|---|---|
| 0 | Frontlines, borders, cities, day by day | War-wide (Eastern done, West/Italy/Africa to come) | Exists today (curated keyframes + validation loop) |
| 1 | **Divisions+** on the map (army groups → divisions), search, detail panel | War-wide for major combatants, densest where fronts are authored | Curated temporal records; scaffolded from Niehorster/Wikidata; positions authored per campaign |
| 2 | Drill-down below division (regiment/battalion/company) | Showcase campaigns only (e.g. Stalingrad, Normandy) | Curated where war diaries are digitized; UI degrades gracefully |
| 3 | **People**: name search, person → unit → unit path on the map | "Everyone findable" via external archives | Federated link-out (Pamyat Naroda, NARA, CWGC, Volksbund, …) — never hosted |
| 4 | Equipment/strength per unit ("vehicles") | Major formations at key dates | TO&E / strength returns as dated records in the unit panel — **not** map objects |

### 1.2 The core rewrite: a temporal unit graph

Everything new hangs off one data model. Design requirements learned from the
front schema (which got this right): validity intervals `[from, to)`,
keyframes + interpolation, feature birth/death instead of morphing hacks,
ETL-time validation against documented facts.

#### Entities

- **Unit** — the central entity. A military formation with temporal identity,
  subordination, positions, strength, and external links.
- **Battle/Event** — dated point/area events (Wikidata-sourced), linked to units.
- **Person** *(minimal, optional)* — a small curated set of notable individuals
  attached to units; the general population is reached via federated search,
  not records.
- **Source** — provenance registry; every positional keyframe and factual claim
  cites a source ID.

#### Unit identity

Stable, human-readable IDs:
`{country}-{branch}-{echelon-code}-{designation}[-{incarnation}]`

- `de-h-pz-div-2` — German Heer, 2. Panzer-Division
- `su-rkka-rifle-div-13g` — Soviet 13th Guards Rifle Division
- `de-h-army-6` / `de-h-army-6-2` — 6. Armee; reformed incarnation after
  Stalingrad gets `-2` (destruction → reformation is **two incarnations of one
  unit page**, linked, not one record with a gap)
- Wikidata QIDs stored as cross-references, not as primary keys (coverage is
  incomplete and QIDs are not human-debuggable in curated JSON).

#### Unit record schema (curated)

One file per unit under `data/curated/units/{country}/…json`, git-friendly and
hand-editable, validated by the ETL:

```jsonc
{
  "id": "de-h-pz-div-2",
  "country": "DE",
  "branch": "heer",                  // heer | waffen-ss | luftwaffe-field | rkka | guards | us-army | ...
  "echelon": "division",             // army-group | army | corps | division | brigade | regiment | battalion | company
  "type": "armoured",                // infantry | armoured | motorized | cavalry | mountain | airborne | artillery | ...
  "names": [                         // temporal: formations renamed/upgraded constantly
    { "from": "1935-10-15", "name": "2. Panzer-Division",
      "aliases": ["2nd Panzer Division", "2 PzDiv"] }
  ],
  "existence": [                     // lifecycle intervals; destroyed→reformed = separate incarnation file
    { "from": "1935-10-15", "to": "1945-05-08", "end": "surrendered" }
  ],
  "parents": [                       // temporal subordination — the OOB tree is interval-valued
    { "from": "1941-06-22", "to": "1941-10-05", "unit": "de-h-pz-gr-39" },
    { "from": "1941-10-05", "to": "1942-01-15", "unit": "de-h-pz-army-3" }
  ],
  "positions": [                     // dated keyframes, interpolated like the front
    { "date": "1941-06-22", "at": [22.5, 53.1],
      "source": "niehorster-barbarossa", "confidence": "documented" },
    { "date": "1941-06-28", "at": [26.9, 53.9], "move": "march" },
    { "date": "1941-09-30", "at": [33.1, 53.3], "move": "rail",
      "confidence": "approximate" }
    // move: march | rail | sea | air | gap  — "gap" renders as a dashed jump,
    // never a glide (a division railed across Europe must not be shown
    // sliding through Poland)
  ],
  "strength": [                      // Tier 4: dated equipment/personnel records → unit panel, not map
    { "date": "1941-06-22", "personnel": 14000, "afv": 182,
      "source": "jentz-panzertruppen" }
  ],
  "engagements": [ { "battle": "q-battle-of-minsk-1941", "role": "encircling" } ],
  "links": {
    "wikidata": "Q586405",
    "wikipedia.en": "https://en.wikipedia.org/wiki/2nd_Panzer_Division_(Wehrmacht)",
    "niehorster": "http://niehorster.org/011_germany/41-oob/army.html",
    "lexikon-der-wehrmacht": "…"
  }
}
```

Companion files:

- `data/curated/units/sources.json` — source registry (`id`, citation, URL,
  license note, granularity).
- `data/curated/units/schema.md` — field reference + authoring conventions
  (the contract the ETL validates).

#### Position semantics & confidence

- A division position is a **point** (HQ/center-of-mass abstraction) plus an
  optional `sector` polyline (its slice of the front) when known. Point first;
  sectors are a later refinement.
- `confidence: documented | inferred | approximate` — drives rendering
  (solid / normal / faded+dotted) and is preserved through interpolation:
  any interpolated day between keyframes ≥ N days apart is at best `inferred`.
- Units must be *somewhere* plausible or *nowhere*: no positions ⇒ the unit is
  searchable and has a detail page but simply doesn't appear on the map
  ("no mapped positions yet — sources below"). This makes breadth-first
  scaffolding (Phase 3) shippable before position curation.

### 1.3 Built artifacts (ETL output → `public/data/units/`)

The static-site constraint stands: everything precomputed, no backend.

| Artifact | Contents | Loading |
|---|---|---|
| `index.json` | Search payload for **all** units: id, labels+aliases, country, echelon, type, lifespan, hasPositions flag | Lazy on first search/unit-layer enable (~1–3 MB gz for tens of thousands of units) |
| `tracks/{theater}.json` | Resampled position tracks bundled per theater, split per year if large | Lazy per viewport/era |
| `unit/{id}.json` | Full detail: names, parent chain intervals, strength, engagements, links, children-with-positions list | On selection only |
| `oob/{date-bucket}.json` | Subordination tree snapshots (monthly buckets; exact intervals inside) for the detail panel's "chain of command at this date" | On selection |

### 1.4 ETL: `build-units.mjs` + shared pipeline library

Extract the proven machinery from `build-fronts.mjs` into
`data/pipeline/lib/` (date math, resampling, interpolation, the
front-side polygon closure) so fronts and units share one implementation.

`build-units.mjs` responsibilities:

1. **Schema validation** — every curated file against the schema; hard errors.
2. **Referential integrity** — parents exist, parent intervals overlap child
   existence, no cycles, incarnation links resolve.
3. **The unit validation loop** (the headline, mirroring the city-control
   loop): for **every day** of the war, every positioned unit must lie on its
   own side of the interpolated front (pockets override, exactly like cities —
   6. Armee inside the Stalingrad pocket ring is *valid* east of the line).
   Mismatches print as a curation worklist: unit, dates, distance, nearest
   keyframes. This is what keeps hundreds of hand-authored tracks honest.
4. **Plausibility warnings** (non-fatal): movement speed between keyframes
   exceeding `move`-type bounds (infantry ~40 km/day forced, rail ~600),
   children far from their parent, track gaps > 30 days.
5. **Emit** the artifacts in 1.3 + the search index.

### 1.5 Frontend architecture

**Kept as-is**: Vite/React/TS, MapLibre, Zustand store + URL sync, the time
machine, borders/cities/front layers, the ETL-then-static pattern.

**Restructured**:

- **Layer registry** — `src/layers/` grows from 5 hardcoded layers to a
  registry with per-layer: id, label, legend entries, lazy data loader,
  date-update hook, toggle state (persisted to URL: `?layers=front,units,...`).
  Pulled forward from old M6 because layer count is about to double.
- **App shell** — from "map + bottom time bar" to "map + bottom time bar +
  **collapsible right panel** + **omnibox**". The panel hosts unit/battle/city
  detail; the omnibox hosts unified search. Map stays full-bleed; panel
  overlays.
- **Selection state** — store gains `selection: {kind: 'unit'|'city'|'battle', id} | null`,
  `trackedUnitId` (path display), synced to URL (`?unit=de-h-pz-div-2&track=1`)
  so any unit view is a shareable deep link, consistent with the existing
  philosophy.

**New components**:

- `src/layers/units.ts` — symbol layer. Echelon ↔ zoom laddering so the map
  never soups: army groups ≲ z4.5 < armies < z5.5 < corps < z6.5 ≤ divisions;
  below-division only when a parent is selected (drill-down, Tier 2). Marker =
  simplified APP-6-style icon (frame color by side, fill symbol by type,
  echelon ticks above) rendered to an SDF/sprite sheet at build time. Within
  MapLibre symbol-layer budget for low thousands of simultaneous points;
  deck.gl remains a contingency, not a dependency.
- `src/ui/UnitPanel.tsx` — name (period-correct at current date), echelon/type,
  lifecycle, **chain of command at the current date** (clickable parents),
  children (clickable where positioned), strength table, engagements,
  external links, source citations, confidence notice.
- `src/ui/Omnibox.tsx` — one search field over the prebuilt index
  (minisearch/FlexSearch, diacritic-folded, alias-aware: "6th Panzer",
  "6. Panzer-Division", "Раус" should all hit). Result click: jump date into
  the unit's lifespan if needed → fly to its position → select.
  A "People" tab switches to the federated person search (1.6).
- **Unit path mode** — selected unit's full track drawn as a polyline with
  date ticks and move-type styling (dashed for `rail`/`gap`); "follow" pins
  the camera during playback. This is the emotional payoff feature: *watch
  your grandfather's division walk to Stalingrad and back*.
- **Editor extension** — `?edit` gains a unit mode: pick unit + date, click to
  place, ghost previous/next keyframes (same UX as front tracing), paste-ready
  JSON. Curation throughput is the project bottleneck; this tool is why it
  scales.

### 1.6 People: federated, not hosted

A `PersonSearch` panel that fans a name out as **prebuilt query links** to
external archives — zero records hosted, zero privacy surface, zero backend:

| Archive | Covers | Query |
|---|---|---|
| Pamyat Naroda | Soviet records, awards, unit docs | `pamyat-naroda.ru/heroes/?last_name=…` |
| OBD Memorial | Soviet fallen | name query URL |
| NARA AAD | US Army enlistment (~9M) | name query URL |
| ABMC | US burials/memorials | name query URL |
| CWGC | Commonwealth war dead | `cwgc.org/find-records/…?Surname=…` |
| Volksbund Gräbersuche | German war graves | name query URL |
| TracesOfWar, Fold3*, Ancestry* | Mixed (* = paywalled, labeled) | name query URLs |

Plus the **"find their unit" wizard**, which is the part only this app can do:
country → unit search → unit page → *path on the map*. The pitch "everyone who
fought is findable" is delivered as: find the person in an archive (their
service record names the unit) → find the unit here → see where they were,
every day. Optional later: tiny curated `people/` set (e.g. notable
commanders) rendered on unit pages; photos only via stable external/Wikimedia
links, never rehosted (licensing).

### 1.7 Explicit non-goals (this architecture, static phase)

- No backend, accounts, or crowdsourced submissions — but the curated-JSON +
  validation-loop design is exactly what a future contribution workflow (PRs
  against `data/curated/`) would need, so nothing forecloses it.
- No war-wide sub-division coverage promise; no platoon tier as a design
  target (showcase-only where reconstructions exist).
- No individual-vehicle map objects; equipment lives in the unit panel.
- No person records beyond optional notable-figure stubs.

### 1.8 Risks

| Risk | Mitigation |
|---|---|
| Curation labor dominates (hundreds of units × keyframes) | Editor tooling first-class; validation worklists prioritize; scaffold-without-positions makes partial coverage shippable; campaign-by-campaign scope |
| Licensing mix (academic non-commercial, GPL sources already tracked) | Per-source license field in `sources.json`; check before public deploy (existing DATA_SOURCES.md discipline) |
| Western/Italian/African fronts don't exist yet, blocking western units | Front authoring is an independent parallel workstream (Phase 3); eastern showcase first |
| Index/track payload growth | Lazy loading per artifact (1.3); per-theater/year splits; PMTiles pass stays on the roadmap |
| German/Soviet naming ambiguity breaks search | Alias arrays + transliteration variants in the index from day one |

---

## Part 2 — Incremental steps

Each phase leaves the app shippable. Old M4 (railways/roads) is deprioritized
below all of this; old M5 is superseded by Phases 1–5; old M6 items are pulled
into Phase 0 (toggles/legend) and Phase 6 (perf/mobile/deploy).

### Phase 0 — Foundations refactor (no new data; app looks ~the same, plus toggles & city search)

- [ ] 0.1 Extract shared ETL lib (`data/pipeline/lib/`): date math, resampling,
      keyframe interpolation, front-closure polygon + side test (from
      `build-fronts.mjs`). Fronts ETL re-built on it; outputs byte-identical.
- [ ] 0.2 Layer registry in `src/layers/` + layer toggle UI + legend;
      `?layers=` URL param.
- [ ] 0.3 App shell: collapsible right panel + omnibox component. First
      searchable corpus: **cities** (data already loaded) — immediate user value
      and proves the search UX.
- [ ] 0.4 Store: `selection` + URL sync (`?city=`, later `?unit=`).
- **Exit:** layer toggles work, clicking/searching a city opens a panel with
  its control history (data already in `city-control.json`).

### Phase 1 — Unit model + Stalingrad showcase (the vertical slice)

Pilot scope: **Stalingrad campaign, 1942-06-28 → 1943-02-02** — bounded,
superbly documented, already has the pocket feature, maximal drama.
German 6. Armee + 4. Panzerarmee (corps + ~20 divisions), Soviet 62nd/64th
Armies + the Operation Uranus fronts at army level (divisions for 62nd Army).

- [ ] 1.1 Write `schema.md` + JSON Schema; decide ID conventions (1.2 above).
- [ ] 1.2 `build-units.mjs` v1: validation (schema, referential, **unit-vs-front
      daily side check**), emit `index.json` + tracks + `unit/{id}.json`.
- [ ] 1.3 Author the pilot dataset (identity + subordination from Niehorster;
      positions: ~6–10 keyframes per division traced in the editor against the
      US Army atlas plates + unit histories).
- [ ] 1.4 `src/layers/units.ts`: markers, echelon-zoom ladder, date filtering,
      confidence styling; build-time sprite generation.
- [ ] 1.5 Unit panel v1: identity, lifecycle, parent chain at date, links,
      sources.
- [ ] 1.6 Editor unit mode (place/drag unit keyframes, ghosting, JSON export).
- **Exit:** scrub Jul 1942 → Feb 1943 and watch 6. Armee advance, get
  encircled inside the existing pocket ring, and die; click any division for
  its story. The validation loop passes daily for every pilot unit.

### Phase 2 — Search & follow (units become first-class citizens)

- [ ] 2.1 Prebuilt minisearch index over units + cities (+ aliases,
      transliterations); omnibox unified results with kind badges.
- [ ] 2.2 Select-from-search behavior: clamp/jump date into lifespan → fly →
      select (deep-linkable).
- [ ] 2.3 **Unit path mode** + follow-during-playback.
- [ ] 2.4 Battle markers from Wikidata (dated points, linked units), searchable.
- **Exit:** type "13th Guards" → jump to Stalingrad, follow it through the war
  segment, open Rodimtsev's division page, click through to Pamyat Naroda.

> **2026-06 update:** Phase 3's breadth strategy is superseded by
> [SCALE_PLAN.md](./SCALE_PLAN.md) (OOB-first ingestion + sector-derived
> positions), which scales to every formation of the war without hand-
> authoring thousands of tracks. 3.1 (scaffold importer) shipped as designed.

### Phase 3 — Breadth: every division *findable*, positions per campaign

Two parallel workstreams from here on: **(a)** unit data, **(b)** new theater
fronts (prereq for placing western units).

- [ ] 3.1 Scaffold importer (`data/pipeline/import-oob.mjs`): generate
      skeleton unit files (identity, lifecycle, subordination, links — **no
      positions**) for all German + Soviet divisions/corps/armies from
      Niehorster page structure + Wikidata, manually reviewed in batches.
      Searchability ≠ mapped: pages say "not yet mapped" with sources.
- [ ] 3.2 Campaign position passes in priority order, each a small Phase-1:
      Barbarossa/Moscow 1941 → Kursk 1943 → Bagration 1944 → Berlin 1945.
      The unit-vs-front worklist drives densification exactly like the city
      worklist does today.
- [ ] 3.3 Western/Italian front lines (own keyframe sets, reusing everything),
      then US/UK/Commonwealth unit scaffolds + Normandy position pass.
- **Exit:** every German and Soviet division returns a search result with an
  honest page; multiple campaigns have moving divisions; the West exists.

### Phase 4 — People (Tier 3) + drill-down (Tier 2)

- [ ] 4.1 PersonSearch panel: federated archive links (1.6 table) + the
      "find their unit" wizard. Pure frontend; ships fast, huge headline value.
- [ ] 4.2 Drill-down: child units below division render when their parent is
      selected; author regiments/battalions for **one** showcase
      (Stalingrad city fight: 13th Guards' regiments, or Normandy beaches)
      to prove the tier — and set expectations for it (rare by design).
- [ ] 4.3 Optional curated notable-people stubs on unit pages (commanders
      first — they're already in Wikidata).
- **Exit:** the original vision demo: search a surname → archive hit names the
  unit → unit's daily path on the map → its parent corps/army → the front it
  stood on. "Findable" delivered honestly.

### Phase 5 — Equipment & enrichment (Tier 4)

- [x] 5.0 Commanders + descriptions enrichment (done June 2026): Wikidata P598
      by QID + by-label for QID-less higher formations; **Lexikon der Wehrmacht
      dated Oberbefehlshaber** successions for German armies/army groups;
      Wikipedia lead-paragraph `summary` on every linked card. (`fetch-commanders*.mjs`,
      `fetch-descriptions.mjs`.)
- [x] 5.1 `strength` records for pilot formations — **done (v1)**. Nominal
      *establishment* strength + key equipment live on the doctrinal templates;
      now **actual dated strength returns** (`data/curated/units/oob/strength.json`,
      keyed by unit id) attach to the detail and render as a **"Strength returns"**
      panel section: a personnel **sparkline** + dated rows (personnel + key
      equipment + note), shown against the nominal establishment, cited. Seeded
      with pilots (6. Armee 250k→91k at Stalingrad, 16. Panzer tank strength,
      13th Guards across the Volga). Append-only/crowdsourcable.
- [x] 5.2 Pocket/siege ↔ unit links — **done.** Pocket fills are clickable
      (`?pocket=` deep-link too); the panel lists the **trapped garrison** and the
      **besieging formations** (both clickable through to the unit), the encircled
      side, and the pocket dates — joining the front feature's `garrison`/
      `besiegers` to the units.
- [ ] 5.3 Unit insignia/photos via external/Wikimedia links (license-gated).
- [x] 5.4 **Front graphics** (reworked 2026-06-21) — **done.** The first cut —
      per-division *frontage bands* — read as one muddy stripe (no visible
      per-division separation) duplicating the tide, so it was **retired** in
      favour of a proper staff-map vocabulary:
      - [x] **FEBA front line** — bold smoothed line + a light casing so it reads
            over the two-sided tide, with **forward-edge teeth** (a sawtooth
            sprite repeated along the line, `symbol-placement:'line'`) fading in
            at z ≥ 5 so the strategic view stays a clean line.
      - [x] **Dynamic advance arrows** — computed from how the front moved over
            ~10 days (`advanceArrows`): at each sparse sample, the perpendicular
            shift vs the local front normal; if it clears a threshold, a bold
            arrow points the way it moved, red where the Axis gained, blue where
            the Soviets did. Sized by distance, capped (strongest ~22), opacity
            faded out past z 8 so offensives read at the operational scale
            without cluttering the tactical view. Verified on Barbarossa (red,
            east) and Bagration (blue, west).
      - [x] **Encirclement arrows** on active pockets (`encircleArrows`): six
            pincers ring each active pocket, pointing inward, coloured by the
            besieging side (the opposite of who's trapped) and scaled to the ring
            — kept visible at high zoom (a pocket is a local event). Verified on
            the Stalingrad pocket (Soviet pincers on the trapped 6. Armee).
      - [x] **Curated operation arrows** — a hand-authored set of **10 signature
            offensives spanning the war** (`src/data/operations.ts`): Barbarossa,
            Typhoon, the Moscow counter-offensive, Case Blue, Uranus, Citadel,
            Bagration, Lvov–Sandomierz, Vistula–Oder, Berlin. Each axis of advance
            (control points) is Catmull-Rom-smoothed into a big tapered arrow
            polygon, shown only in its date window, named on the map, on their
            **own legend toggle**. The dynamic advance arrows suppress themselves
            inside an active operation's box so the editorial arrow isn't doubled
            by the automatic one.

### Phase 5b — Detail-tab depth: equipment & imagery (planned)

Goal (user-requested): a much richer detail tab — the equipment a unit fielded,
and photographs — without wrecking the static-site performance budget.

- [x] **Equipment data model — done (v1).** A shared **equipment catalog**
      (`src/data/equipment.ts`: id, name, class, nation, one-line spec, Wikipedia
      link) of the key EF weapons/vehicles; establishment templates reference
      catalog ids (`equipmentRefs`, merged in `matchTemplate`) so Panzer IV /
      T-34 are authored once and reused. The *actual* tier is Phase 5.1 strength
      returns; the *nominal* tier is the template establishment — both labelled.
      (Commons image id deferred to the imagery item.)
- [x] **Equipment panel — done.** An "Equipment" section under the establishment
      template, grouped by class (armour, assault guns, AT, artillery, AA,
      infantry weapons…), each row = name + spec + Wikipedia link.
- [x] **Imagery — done (unit images).** `fetch-images.mjs` resolves every unit's
      Wikidata **P18** to a **Commons thumbnail url** + license/author, cached in
      a committed manifest (`oob/images.json`, resumable, two-pass) — **234 units
      with a free image** (CC / public domain only; non-free skipped). The panel
      renders the thumbnail at the top of the card, **lazy-loaded**
      (`loading="lazy"`), attributed (author · license · Commons link), pointing
      straight at the Wikimedia CDN — zero image bytes in our bundle. Fallback:
      the APP-6 `UnitGlyph` carries identity when there's no image. (Next:
      per-equipment images via the same manifest; commander portraits.)
- [ ] **Risks**: Commons file renames/deletions (pin by file + periodic ETL
      re-resolve); license drift (store license per image, exclude non-free);
      payload creep (manifests are tiny text; images are CDN-served on demand).

### Phase 6 — Scale & ship (old M6)

- [ ] PMTiles/perf pass (now sized against real unit payloads), mobile,
      cross-browser, public deploy with the licensing audit.
- [ ] Decision gate (separate, explicit): community contributions — PRs
      against `data/curated/` with CI running the validation loops would be
      the Project-'44-style scaling path; revisit only once Phases 1–4 prove
      the model.

### Sequencing rationale

- Phase 0 is pure de-risking: everything later assumes the registry, panel,
  and shared ETL lib; doing it first means no later phase touches old code.
- Phase 1 is deliberately a **narrow vertical slice** through every layer of
  the architecture (schema → ETL → validation → rendering → panel → editor).
  If the model is wrong anywhere, it's wrong over 20 units, not 2,000.
- Search (Phase 2) precedes breadth (Phase 3) because scaffolded-but-unmapped
  units are only valuable if findable.
- People (Phase 4) needs nothing from Phases 3b/5 — it could even be pulled
  earlier; it's sequenced after breadth so name→unit lookups usually *hit*.
- The validation-loop pattern (city control → front, units → front) is the
  project's quality engine; every phase extends it rather than adding
  unverified data.
