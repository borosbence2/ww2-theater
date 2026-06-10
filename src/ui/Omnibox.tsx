// Omnibox search (Phase 0.3, units added in Phase 1). One field over cities
// and the unit index; battles join in Phase 2. Selecting a result sets the
// store selection (deep-linkable) and flies the camera; selecting a unit
// outside the current date's track jumps the timeline into its lifespan.

import { useEffect, useRef, useState } from 'react';
import { foldText, loadCities, searchCities, type City } from '../data/cities';
import {
  loadUnitIndex,
  loadUnitTracks,
  positionOn,
  searchUnits,
  type UnitIndexEntry,
} from '../data/units';
import { loadBattles, searchBattles, type Battle } from '../data/battles';
import { dateToNum } from '../time/dates';
import { getMap } from '../map/mapRef';
import { useStore } from '../store';

type Result =
  | { kind: 'city'; city: City }
  | { kind: 'unit'; unit: UnitIndexEntry }
  | { kind: 'battle'; battle: Battle };

const labelOf = (r: Result) =>
  r.kind === 'city' ? r.city.name : r.kind === 'unit' ? r.unit.label : r.battle.name;

export function Omnibox() {
  const setSelection = useStore((s) => s.setSelection);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    Promise.all([loadCities(), loadUnitIndex(), loadBattles()]).then(([cities, units, battles]) => {
      if (!alive) return;
      // Rank across kinds: prefix matches first; on ties cities, then units,
      // then battles (typing "Stalingrad" finds the city above the Front HQ
      // above the battle).
      const q = foldText(query.trim());
      const prefix = (name: string) => (foldText(name).startsWith(q) ? 0 : 1);
      const kindRank = { city: 0, unit: 1, battle: 2 } as const;
      const hits: Result[] = [
        ...searchUnits(units, query, 5).map((unit) => ({ kind: 'unit' as const, unit })),
        ...searchCities(cities, query, 4).map((city) => ({ kind: 'city' as const, city })),
        ...searchBattles(battles, query, 4).map((battle) => ({ kind: 'battle' as const, battle })),
      ].sort((a, b) => prefix(labelOf(a)) - prefix(labelOf(b)) || kindRank[a.kind] - kindRank[b.kind]);
      setResults(hits);
      setActive(0);
      setOpen(hits.length > 0);
    });
    return () => {
      alive = false;
    };
  }, [query]);

  // Close the dropdown on any click outside the box.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  const select = async (r: Result) => {
    setOpen(false);
    const map = getMap();
    if (r.kind === 'city') {
      setSelection({ kind: 'city', id: r.city.name });
      setQuery(r.city.name);
      map?.flyTo({ center: [r.city.lng, r.city.lat], zoom: Math.max(map.getZoom(), 5.5) });
      return;
    }
    if (r.kind === 'battle') {
      setSelection({ kind: 'battle', id: r.battle.id });
      setQuery(r.battle.name);
      // Jump the timeline into the battle if we're outside it.
      const { date, setDate } = useStore.getState();
      const d = dateToNum(date);
      if (d < r.battle.startNum || d > r.battle.endNum) setDate(r.battle.start);
      map?.flyTo({ center: [r.battle.lon, r.battle.lat], zoom: Math.max(map.getZoom(), 5.5) });
      return;
    }
    setSelection({ kind: 'unit', id: r.unit.id });
    setQuery(r.unit.label);
    if (!r.unit.hasPositions) return;
    const track = (await loadUnitTracks()).find((t) => t.id === r.unit.id);
    if (!track) return;
    const { date, setDate } = useStore.getState();
    let when = date;
    if (!positionOn(track, date, dateToNum(date))) {
      // Jump the timeline to the unit's first mapped day.
      when = track.keyframes[0].date;
      setDate(when);
    }
    const at = positionOn(track, when, dateToNum(when));
    if (at) map?.flyTo({ center: at, zoom: Math.max(map.getZoom(), 6.3) });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      void select(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="omnibox" ref={boxRef}>
      <input
        type="search"
        placeholder="Search units & cities…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(results.length > 0)}
        onKeyDown={onKeyDown}
        aria-label="Search"
      />
      {open && (
        <ul className="omnibox-results">
          {results.map((r, i) => {
            const key =
              r.kind === 'city'
                ? `c|${r.city.name}|${r.city.lng}`
                : r.kind === 'unit'
                  ? `u|${r.unit.id}`
                  : `b|${r.battle.id}`;
            return (
              <li
                key={key}
                className={i === active ? 'active' : undefined}
                onMouseEnter={() => setActive(i)}
                // mousedown, not click: fires before the input's blur
                onMouseDown={(e) => {
                  e.preventDefault();
                  void select(r);
                }}
              >
                {r.kind === 'city' ? (
                  <>
                    <span>{r.city.name}</span>
                    <span className="omnibox-meta">
                      {r.city.capital ? 'capital · ' : ''}
                      {r.city.country}
                    </span>
                  </>
                ) : r.kind === 'unit' ? (
                  <>
                    <span>
                      <span className={`unit-chip side-${r.unit.side}`}>{r.unit.echelon}</span>
                      {r.unit.label}
                    </span>
                    <span className="omnibox-meta">
                      {r.unit.country}
                      {r.unit.hasPositions ? '' : ' · not mapped yet'}
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      <span className="unit-chip battle-chip">battle</span>
                      {r.battle.name}
                    </span>
                    <span className="omnibox-meta">{r.battle.start.slice(0, 4)}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
