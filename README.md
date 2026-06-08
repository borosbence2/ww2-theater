# WWII European Theater — Day by Day

An interactive web map that visualizes the **European theater of WWII (1939–1945)
day by day**. Set or scrub a date and watch the situation change; pan and zoom
anywhere in Europe. The goal is a strategic overview first — frontlines, borders,
and cities — with operational detail (divisions, railways, roads) layered in over
time.

> **Status: M1 — temporal borders.** Map shell + date/time machine (slider,
> play/pause) with shareable deep-link URLs, plus **country borders that change
> as you scrub the date** (CShapes 2.0, exact-dated). See
> [MILESTONES.md](./MILESTONES.md) for the roadmap.

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
step. To rebuild the borders layer from source:

```bash
curl -o data/raw/CShapes-2.0.geojson https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson
node data/pipeline/build-borders.mjs
```

Raw downloads live in `data/raw/` (gitignored).

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
| M2 | Frontlines + territorial control (the headline feature) |
| M3 | Cities (population-styled, capitals, labels) |
| M4 | Railways (1940) + roads (approximate) |
| M5 | Divisions / order of battle (hardest; data-scarce) |
| M6 | Polish: legend, layer toggles, battle bookmarks, perf, mobile |
