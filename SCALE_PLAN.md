# Scale plan — every unit that fought

How to get from the Stalingrad pilot (989 units, 36 position tracks) to
**every formation of the war** without the project dying of hand-authoring.
Companion to [REWRITE_PLAN.md](./REWRITE_PLAN.md); supersedes its Phase 3
sequencing where they differ.

## 0. What "all units" means, in numbers

| Echelon | Europe (all combatants, 1939–45) | Global | Strategy |
|---|---|---|---|
| Army groups / fronts | ~60 | ~80 | Full coverage, curated |
| Field armies | ~180 | ~250 | Full coverage, curated sectors |
| Corps | ~900 | ~1,200 | Full coverage, OOB-imported, positions derived |
| Divisions | ~2,500–3,000 distinct formations (USSR ~1,000 incl. re-formations, Germany ~450, Italy ~80, France ~100, US ~90, UK/CW ~80, minor Axis ~120, …) | ~4,500 | Full coverage, OOB-imported, positions derived + curated showcases |
| Brigades / regiments | ~25,000–40,000 | ~60,000 | Identity scaffolds auto-derived from parents; positions only via drill-down showcases |
| Battalions and below | hundreds of thousands | — | Showcase-only, forever |

Working target: **~5,000 division-and-above units globally, ~3,000 of them
positioned daily**, plus ~30k sub-division identity scaffolds. People remain
federated link-out (see REWRITE_PLAN 1.6) — no change at any scale.

## 1. The honest bottleneck analysis

Measured on the current implementation (2026-06):

| Concern | Today (989 units / 36 tracks) | At 5k positioned | At 30k positioned | Verdict |
|---|---|---|---|---|
| Scrub tick: interpolate + rebuild GeoJSON | <1 ms | ~4 ms (measured 3.4 @ 3k, 5.5 @ 10k) | 31 ms + setData parse | **Fine to ~10k** with object reuse + viewport cull; beyond needs GPU path |
| Search index (eager JSON) | 256 KB raw | ~1.3 MB (~250 KB gz), lazy — OK | ~8 MB — not OK | Shard at >5k units |
| Detail shards | 16 × ~50 KB | 64 shards | 256 shards / 2-level | Mechanical, fine |
| Tracks file | 27 KB | ~3 MB war-wide | — | Shard per theater × year |
| ETL validation loop | seconds | ~4M point tests, <1 min | — | Fine; derived positions skip it (front-consistent by construction) |
| **Hand-authoring positions** | ~190 keyframes ≈ 1 focused day | 3,000 units × 20 kf = **years** | impossible | **This is the wall. Everything below is designed around it.** |

Conclusion: the current *runtime* approach survives almost unchanged to ~10k
positioned units. The current *authoring* approach does not survive past a
few hundred. The plan therefore changes how positions come to exist, not how
they render.

## 2. The unlock: OOB-first, positions derived from sectors

The pivotal realization: **for most units, most days, the position IS
determined by two things we can get cheaply** — (a) the front line we already
draw, and (b) which army/corps the unit belonged to that month. Armies hold
contiguous sectors of the front; divisions sit on their corps' slice of it.

So instead of authoring 3,000 division tracks:

1. **Author army sectors** (cheap): per front keyframe date, each field army
   on the line gets a boundary expressed as a *fraction along the front
   polyline* (`{date, army, from: 0.42, to: 0.55}`). ~15–25 armies per side
   per front, boundaries move slowly, and the US Army atlas / Lage Ost maps
   literally draw them. Authoring cost: comparable to the front keyframes
   themselves — already proven tractable.
2. **Import OOB assignments** (tabular, exists!): which corps in which army,
   which division in which corps, monthly. Sources in §3.
3. **ETL derives positions**: divisions of a corps distribute evenly along
   the corps' sub-slice of the army sector, snapped to the interpolated
   front of that day, offset slightly to the owning side. Corps HQ at slice
   center; army HQ behind sector midpoint. Reserve formations (flagged as
   such in the OOB sources) sit at a rear offset or stay list-only.
4. **Curated keyframes always override** derivation (the Stalingrad showcase
   stays hand-authored; any unit can be promoted by giving it positions).

New confidence tier: `derived` — rendered visibly distinct (hollow/dashed
icon frame), honest in the panel ("position derived from front sector +
order of battle; not individually documented"). Validation loop skips
derived positions (consistent by construction) — only curated tracks are
checked, so ETL time stays flat.

This converts the impossible task (3,000 tracks) into three tractable ones:
front lines (existing roadmap), sector tables (~few hundred rows per
theater), OOB ingestion (parsing, not authoring).

## 3. OOB sources — parsing, not authoring

| Source | Covers | Form | Plan |
|---|---|---|---|
| **Boevoi sostav Sovetskoi Armii** (Боевой состав Советской Армии) | Every Soviet formation's army/front assignment, **monthly, 1941-06 → 1945-05** | Official staff lists; full text transcriptions online (teatrskazka et al.) | The single highest-value dataset in the project. Parser → temporal `parents` for ~1,000 Soviet divisions + corps + armies. License: Soviet official document (public); transcription source to be credited and verified. |
| Schematische Kriegsgliederung / Lage Ost (OKH) | German OOB at ~monthly dates | Scans + partial transcriptions; Niehorster covers key dates in HTML | Parse Niehorster's structured pages for key dates (permission/courtesy note), interpolate assignments between snapshots, flag gaps. |
| Tessin, *Verbände und Truppen* | Canonical German unit lineages (formations, renames, destruction) | Books; partially mirrored on unit-history sites | Reference for the reconciliation registry (§4), not bulk-parsed initially. |
| Stanton (US), Joslen (UK) | US/UK division & brigade lineages + assignments | Books with rigid tabular structure | Phase S4; US/UK OOB is small enough to semi-manually tabulate. |
| Wikidata (already in use) | Identity, links, some lifecycle | SPARQL | Keep as the cross-reference spine; multi-language label pass recovers the 602 currently-dropped ru-only items. |

ETL shape: each source gets an importer to a common intermediate
(`data/curated/oob/{source}-{period}.json`, reviewed and committed), and
`build-units.mjs` merges intermediates by precedence: curated file > OOB
intermediate > Wikidata scaffold.

## 4. Identity at scale: the reconciliation registry

Soviet divisions were destroyed and re-formed under the same number (2nd/3rd
formations); German divisions renamed and rebuilt. One registry file per
country (`data/curated/registry/{cc}.json`) maps
`(number, type, formation-ordinal) → unit id ↔ Wikidata QID ↔ source keys`
(boevoi sostav line names, Niehorster page anchors). Importers MUST resolve
through the registry; unresolvable names land in a worklist file, not in the
dataset. This is what keeps three sources from creating three copies of the
38th Rifle Division — and it is append-only, reviewable, and crowdsourcable.

## 5. Runtime architecture at target scale

Budgets (commit to these; CI perf smoke enforces the first two):

- Scrub tick ≤ 16 ms with the largest theater loaded (~3k positioned).
- Initial page payload unchanged (<1.5 MB gz); nothing new loads eagerly.
- Any single lazy fetch ≤ ~250 KB gz.

Changes, in the order they become necessary:

1. **Tracks sharding** (at Western-front landing): `tracks/{theater}-{year}.json`;
   the layer loads shards intersecting the current date ±1 year, evicts others.
   Derived positions are not shipped as tracks at all — the client derives
   them from (front keyframes + sector table + OOB intervals), all of which
   it already loads or are tiny. Shipped tracks remain *curated-only* (small
   forever).
2. **Search sharding** (at >5k units): replace one index.json with a string
   table + 2-char-prefix postings shards (`search/{ab}.json`), or serialized
   minisearch shards; omnibox fetches ≤2 shards per keystroke, LRU-cached.
   Person/unit aliases keep working (transliterations live in the postings).
3. **Render path** (at >10k simultaneously positioned, i.e. global single-map):
   object-reuse + typed-array interpolation + viewport cull first (cheap,
   measured headroom to ~10k); only if a global all-theater view is really
   wanted, switch the units layer to deck.gl ScatterplotLayer/IconLayer with
   GPU interpolation between keyframe buffers. Decision gate, not default.
4. **OOB snapshots**: per-theater monthly subordination trees
   (`oob/{theater}/{yyyy-mm}.json`) for the panel's children/chain queries at
   scale (the per-unit детail files stop embedding full children lists once
   children number in hundreds — fetch the snapshot instead).
5. **Detail shards**: bump shard count with `ceil(N/64)` granularity (256 at
   ~16k units); same hash scheme, no client redesign.

## 6. Quality at scale

- Validation tiers: curated tracks → full daily side-check (as today);
  derived positions → spot-check sampler (random 1% daily, plus every
  curated-vs-derived disagreement > 50 km reported as a sector worklist);
  OOB intermediates → referential checks against the registry + "unit
  assigned to two armies on the same day" detector.
- Every importer emits a **worklist file** (`reports/`, gitignored) instead
  of guessing: unparsed lines, unresolved names, date conflicts. Curation
  effort goes where the reports point — same discipline that worked for the
  front (city loop) and units (side check).
- CI: ETL runs on every PR; hard errors fail the build; worklist deltas are
  posted as the PR summary. This is the prerequisite for…
- **Contributions** (the Project '44 lesson): once S1–S3 prove the formats,
  open curated files + registry to PRs with CONTRIBUTING.md (sources
  required, validation must pass, schematic-honesty rules). The in-app
  editor's copy-paste JSON already matches the file format.

## 7. Phases

| Phase | Scope | Exit criterion |
|---|---|---|
| **S0 — guardrails** ◐ | Perf budgets in CI (synthetic 10k-unit scrub smoke ≤16 ms, payload caps); tracks/search shard formats specified; `derived` confidence tier in schema + renderer | Budgets enforced; pilot unaffected. *Done: derived tier (schema/ETL/hollow icons). Open: CI perf smoke, search sharding spec.* |
| **S1 — Soviet OOB** ✅ | Boevoi sostav parser → monthly parents for every Soviet formation 1941–45; registry (su); multi-lang Wikidata label pass | *Shipped (Eastern sim v1): 48 months, 17,317 assignments, 725 units with chains. Tank/mech corps + 1941 tank divisions parsed (v2.1). Open: rifle corps echelon, brigades, formation-ordinal registry, ru-label Wikidata pass.* |
| **S2 — German OOB** ✅ | ~~Niehorster key-date parser~~ → **Lexikon der Wehrmacht Unterstellung tables** (Niehorster's corps OOBs are GIF charts — unparseable); registry (de) | *Shipped (Eastern sim v2): 107 divisions, 2,854 events, monthly. Open: ~100 missing/unmatched pages, Waffen-SS lists, Armeeabteilungen, Tessin reconciliation.* |
| **S3 — derived positions, Eastern Front** ✅ | Army sector tables (boundary anchors projected onto daily front); division derivation in ETL + hollow-icon rendering; reserves handling | *Shipped (Eastern sim v1+v2): 11 sector keyframes, 803 derived units riding the line; reserves list-only. Open: sector refinement vs situation maps, army-order-within-front accuracy.* |
| **S4 — the West** | Western/Italian front lines (existing workstream) + US/UK/French/Italian OOB (Stanton/Joslen tabulation) + sectors | D-Day scrubbable with real divisional frontage |
| **S5 — contributions** | CONTRIBUTING.md, PR validation CI, editor→file round-trip docs, worklist → GitHub issue templates | First external PR merged with zero maintainer geometry work |
| **S6 — sub-division scaffolds** | Auto-derive regiment/brigade identity from parent (numbering tables per army); drill-down clusters derived around parent position | Selecting any division shows its organic regiments (identity + approximate cluster), curated ones precise |
| **S7 — global decision gate** | Pacific/CBI theaters: new fronts + OOB sources (Japan ~170 divisions), render-path decision (deck.gl) if a global view is wanted | Explicit go/no-go with measured budgets |

Sequencing rationale: S1 before S2 because the Soviet source is the most
complete and most structured (monthly!), and Soviet units are the biggest
gap (602 dropped for labels today). S3 only needs S1+existing front — the
payoff (a fully populated Eastern Front map) arrives without touching the
West. Everything stays shippable at each phase.

## 8. Risks

| Risk | Mitigation |
|---|---|
| OOB transcription licensing/permission (Niehorster, teatrskazka) | Ask first; parse structure not prose; cite per record; registry keeps provenance; worst case: tabulate from primary scans (slower, still no geometry authoring) |
| Derived positions over-claim precision | `derived` tier rendered hollow + panel disclaimer; sector tables cite the situation maps they trace |
| Registry mistakes silently merge distinct formations | Append-only registry with required source keys; CI duplicate detector; Wikidata QID anchoring |
| Contributor quality variance | Validation loop is the gatekeeper; schematic-honesty rules in CONTRIBUTING; showcase-quality bar only for curated tracks, not scaffolds |
| Scope seduction (battalions, ships, air) | Hard rule from REWRITE_PLAN stands: sub-division = showcase-only; naval/air units are a separate decision gate, not scope creep |
