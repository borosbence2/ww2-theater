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
import { dateToNum } from '../time/dates';
import { getMap } from '../map/mapRef';
import { useStore } from '../store';

type Result =
  | { kind: 'city'; city: City }
  | { kind: 'unit'; unit: UnitIndexEntry };

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
    Promise.all([loadCities(), loadUnitIndex()]).then(([cities, units]) => {
      if (!alive) return;
      // Rank across kinds: prefix matches first; cities win ties (typing
      // "Stalingrad" should find the city above the Stalingrad Front HQ).
      const q = foldText(query.trim());
      const prefix = (name: string) => (foldText(name).startsWith(q) ? 0 : 1);
      const hits: Result[] = [
        ...searchUnits(units, query, 5).map((unit) => ({ kind: 'unit' as const, unit })),
        ...searchCities(cities, query, 5).map((city) => ({ kind: 'city' as const, city })),
      ].sort((a, b) => {
        const sa = prefix(a.kind === 'city' ? a.city.name : a.unit.label);
        const sb = prefix(b.kind === 'city' ? b.city.name : b.unit.label);
        return sa - sb || (a.kind === 'city' ? 0 : 1) - (b.kind === 'city' ? 0 : 1);
      });
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
            const key = r.kind === 'city' ? `c|${r.city.name}|${r.city.lng}` : `u|${r.unit.id}`;
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
                ) : (
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
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
