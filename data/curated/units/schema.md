# Curated unit files — authoring contract

One JSON file per unit (one *incarnation* of a formation) under
`data/curated/units/{country}/{id}.json`. Validated and built by
`data/pipeline/build-units.mjs` (run `build-fronts.mjs` first — the side
check needs the built front keyframes).

## Identity

- `id` — `{country}-{branch}-{kind}-{designation}[-{n}]`, lowercase, stable,
  matches the filename. A formation destroyed and later reformed is a **new
  incarnation**: a second file with `-2`, cross-linked via `notes`.
- `country` — ISO-ish uppercase (`DE`, `SU`, `RO`, …). Side is derived
  (DE/RO/HU/IT → axis, SU → soviet); override with explicit `side` if needed.
- `branch` — `heer | waffen-ss | luftwaffe-field | rkka | …` (free-ish, lowercase).
- `echelon` — `army-group | front | army | corps | division | brigade |
  regiment | battalion`.
- `type` — `infantry | armoured | motorized | cavalry | artillery | hq`
  (map symbol; Jäger/rifle/guards-rifle count as `infantry`, field armies as `hq`).
- `short` — map label, a few characters (`6. Armee`, `16. Pz`, `13 Gv`).

## Temporal fields (all intervals are `from <= date < to`; `to` omitted = open)

- `names[]` — `{from, name, aliases[]}`. Renames append entries. Aliases should
  include English forms and transliterations — they feed the search index.
- `existence[]` — `{from, to?, end?}`. `end` is a short reason
  (`destroyed (Stalingrad)`, `redesignated 8th Guards Army`).
- `parents[]` — `{from, to?, unit}` temporal subordination. Must reference an
  existing unit id; intervals should fall inside both units' existence.
- `positions[]` — dated keyframes `{date, at: [lon, lat], label?, source?,
  confidence?, move?}`:
  - `confidence`: `documented | inferred | approximate` (default `approximate`).
  - `move` describes the segment *arriving* at this keyframe:
    `march` (interpolated) | `rail | sea | air | gap` (hold previous position,
    then jump — a division railed across Europe must not glide).
  - Positions are HQ/center-of-mass abstractions. The renderer holds the last
    keyframe until `positionsTo` (default: existence end) and hides the unit
    outside that window.
- `positionsTo` — optional ISO date: stop rendering/validating positions here
  even though the unit lives on (use when coverage ends, e.g. pilot scope).
- `commanders[]` — `{from, to?, name, link?}` (link = biography URL). Shown in
  the unit panel with the active commander highlighted for the current date.

## Sub-division units (Tier 2 drill-down)

Echelons below division (`brigade | regiment | battalion`) are progressive
disclosure: they render on the map only while their parent (or the unit
itself) is the current selection, from zoom ~7. Author them only for
showcase fights where the record supports it — war-wide coverage is
explicitly not a goal.

## Other

- `links` — external references: `wikipedia.en`, `wikidata`, `niehorster`,
  `pamyat-naroda`, `lexikon-der-wehrmacht`, … (URL values, `wikidata` = QID).
- `notes` — free text; mention coverage limits and sister incarnations.
- Every position should cite a `source` id from `../sources.json`; uncited
  positions are allowed but reported.

## Validation (ETL)

Hard errors: schema/enum violations, id↔filename mismatch, unknown parent,
non-ascending positions, positions outside existence.
Worklist (non-fatal): unit on the wrong side of the interpolated front for a
day (pockets override — an encircled Axis unit inside an Axis pocket is
valid); mismatches within the contested-zone tolerance (25 km of the line,
30 km inside pockets — fronts are schematic) are listed as info, beyond it as
the worklist. Movement faster than the `move` type allows (march > ~60 km/day,
rail > ~800 km/day) is warned.

## Pilot caveats (Stalingrad showcase, 2026-06)

Lifecycle dates are coarse (month precision) for several formations;
divisional corps assignments are held constant over the pilot window;
Romanian/Italian/Hungarian armies and the Winter Storm relief salient are not
yet authored — the unit-vs-front worklist is expected to flag the latter once
LVII. Panzerkorps is added.
