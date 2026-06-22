# Eastern Front full simulation — increment plan

> **Status 2026-06-11: COMPLETE (v1 + v2 + v3).** The Eastern Front is
> considered finished against the definition of done below. **2,136 units;
> 1,569 at daily sector-derived positions** (incl. tank/mech corps + brigades);
> full front→army→corps→division chains both sides; 16 sector keyframes
> Barbarossa→Berlin. Since enriched with commanders (Wikidata + dated Lexikon
> der Wehrmacht), Wikipedia descriptions, on-select command tree, and doctrinal
> TO&E templates; and the documented leftovers picked up — Courland pocket
> (garrison + Soviet blockaders), formation ordinals (the incarnation registry
> surfaced in the panel), and the army-group-in-pocket placement fix. See
> MILESTONES.md.

## Definition of done (Eastern Front)

Met:
1. **Both sides, all echelons.** Soviet fronts/armies/rifle+cavalry+tank+mech
   corps/divisions from the monthly *Boevoi sostav* (22,022 assignments);
   German armies + 139 divisions (incl. Waffen-SS) from Lexikon der Wehrmacht
   *Unterstellung* tables (3,357 events); Romanian 3rd/4th, Hungarian 2nd,
   Italian 8th armies on the Don flank.
2. **Every day populated** Jun 1941 → May 1945: scrub to any date and both
   sides' formations stand along the interpolated front at sector-derived
   positions (hollow = derived, solid = curated Stalingrad showcase).
3. **Real chains of command** at every date (division ← corps ← army ←
   front/army-group), navigable in the panel, sourced not hand-typed.
4. **Honest provenance**: derived positions visibly distinct + disclaimed;
   curated tracks override; validation loop still green for curated units.
5. **Derived positions validated**: the side-check (the project's quality
   engine) now covers derived units too — **99.7% of 29,198 unit-months land
   on the correct side of the front**. A 95% floor in `build-units.mjs` fails
   the build on a placement regression (the class of bug the axis/soviet
   offset sign-flip was). The residual 0.3% (102 unit-months, 53 units) is
   inherent to the schematic N→S sector model: mobile formations (cavalry/
   mechanized/tank corps) in deep breakthrough operations that are genuinely
   ahead of or behind the line, plus 51st Army on the Caucasus E-W segment and
   the northern-extreme formations near Leningrad/the Baltic — not chased with
   hacks (densifying keyframes does not fix model-inherent misses).
6. Verified: 65/65 smoke checks.

Deliberately out of scope (documented, not gaps):
- **Crimean Front** (Jan–May 1942, Kerch) — a brief peninsula case, deferred.

Since addressed (were out of scope):
- **Finland / the Arctic front** — *done.* Separate `finnish-front`/`arctic-front`
  lines + a dedicated Finnish derivation pass (`sectors/finnish.json`,
  `build-finnish.mjs`) place the Finnish armies/divisions, the German 20th
  Mountain Army, and the Karelian-front Soviet armies. See MILESTONES.

Since addressed (were out of scope):
- **Caucasus front** — *done.* The Transcaucasian Front is assigned to the
  southern Caucasus segment (Terek → Black Sea) for the 1942 campaign, placing
  all 58 of its units. North Caucasus Front split out alongside it.
- **Minor-Axis divisions** — *done.* 32 Romanian/Hungarian/Italian division
  scaffolds (`build-minor-axis.mjs`) deploy under their Don-flank armies, so the
  flank is populated below army level.
- **Reserve / transient HQs** — *done.* Reserve Front, Northern Front,
  Heeresgruppe Don now placed; EF formations resting in a null-army gap ride a
  rear reserve area.
- **Sub-division drill-down** — *done.* Selecting a division shows its doctrinal
  organic regiments clustered around it (SCALE_PLAN S6).
- **Courland pocket sectors** (Oct 1944+) — *done.* 16./18. Armee + their OOB
  ride inside the ring (garrison pre-pass), the Soviet blockaders (1st Shock,
  10th Guards, 22nd, 42nd) hug its land-facing outer arc (`besiegers`), and
  Heeresgruppe Nord/Kurland now follows its encircled armies into the pocket
  instead of being averaged onto the distant main line.
- **Formation ordinals** — *surfaced.* The reconciliation registry's
  `incarnations` (SCALE_PLAN §4) is now attached to unit detail and shown in the
  panel (e.g. 6. Armee, 16. Panzer-Division, 2nd Shock Army: destroyed →
  re-formed). Append-only/crowdsourcable; seeded with documented cases.
- **Position accuracy** is schematic (army order = source listing order,
  16 sector keyframes); the design goal is "the right units in the right
  sector on the right day", not survey-grade placement.

Original v1/v2 notes follow.

Goal: scrub Barbarossa → Berlin and see the **whole Eastern Front populated**:
every Soviet division at a daily position derived from its front sector and
the monthly order of battle, both sides' armies arrayed along the line, the
Stalingrad curated showcase overriding seamlessly. Implements SCALE_PLAN
S0+S1+S3 (S2, German divisional OOB, is the explicit next step).

## Source decision (probed 2026-06-11)

- **Soviet OOB**: *Boevoi sostav Sovetskoi Armii* monthly pages
  (teatrskazka.com transcription) fetched via **Wayback Machine** snapshots
  (the live site 404s to curl; narod mirror is a JS shell; archive.org serves
  clean static HTML, cp1251). Format verified parseable: front sections,
  army rows ("61 армия"), unit lists with right-to-left type propagation
  ("54 и 59 гв., 243 сд" = 54 Gv + 59 Gv + 243rd rifle divisions) and corps
  parentheses ("7 гв. ск (5 гв. сд, 112 сбр)").
- **German OOB**: Niehorster reachable (key-date snapshots, many small pages
  per army). Deferred to the next increment; this one renders German
  *armies* on authored sectors (scaffolds created here) and keeps German
  divisions as searchable scaffolds + the curated Stalingrad set.

## Pipeline (new pieces)

1. `data/pipeline/fetch-bs.mjs` — fetch ~47 monthly pages 1941-06 → 1945-05
   into `data/raw/bs/` (gitignored), Wayback, throttled, cached.
2. `data/pipeline/import-bs.mjs` — parse fronts → armies → rifle/guards/
   cavalry divisions (v1 scope; tank/mech corps and brigades later) →
   `data/curated/oob/su-monthly.json` (committed, reviewable): monthly
   assignment snapshots + auto-created identity skeletons for units that
   don't match the existing index (this also recovers the ~600 ru-only
   divisions the Wikidata importer dropped). Matching is rule-based:
   (number, guards-flag, type) parsed from both the Russian abbreviation and
   our English labels — no fuzzy matching; unresolved lines go to a report.
3. `data/curated/sectors/eastern.json` — authored sector keyframes at ~10
   key dates: N→S ordered front (Soviet) / army (German) entries with
   **boundary anchor points** (coarse lon/lat near the historical boundary).
   The ETL converts anchors to fractions along the daily front polyline
   (anchor points survive front movement; latitudes alone would break on
   the east-west Caucasus line).
4. `build-units.mjs` additions: merge OOB parents (curated parents win),
   compute per-division **fraction keyframes** (army slice of front sector ÷
   divisions in listed order, interpolated between months; `gap` when the
   unit changes front), emit `public/data/units/derived/eastern.json`.
   Derived positions are validated by construction (on the line), so the
   daily side-check loop stays curated-only.
5. Client: the units layer derives daily coordinates from (fraction ⨯ the
   already-loaded front geometry) + a side-perpendicular offset; **hollow
   dashed icons** mark the new `derived` confidence tier; the unit panel
   explains the derivation instead of "not mapped".

## Honesty rules

Derived ≠ documented: hollow icons, panel disclaimer naming the two inputs
(front keyframes + monthly OOB), army-within-front and division-within-army
ordering follows the source listing order (≈ but not exactly N→S). Reserve
fronts/armies (Stavka reserve, military districts) get no sector → list-only,
exactly like unmapped scaffolds.

## Exit criteria

- Pick any day 1941–45: Soviet rifle/guards/cavalry divisions of every
  sector-assigned front render along the line; German armies render on
  their sectors; Stalingrad curated tracks still override.
- A previously-unfindable ru-only division (e.g. from the 602 dropped) is
  searchable and shows its monthly chain of command.
- Smoke suite extended and green; scrub stays smooth (budget ≤16 ms).

## Out of scope (next increments)

German divisional OOB (Niehorster parse), tank/mech corps + brigades,
sector refinement from situation maps, formation-ordinal disambiguation
(2nd/3rd formations share one identity in v1 — documented limitation).
