// Omnibox search (Phase 0.3, units added in Phase 1). One field over cities
// and the unit index; battles join in Phase 2. Selecting a result sets the
// store selection (deep-linkable) and flies the camera; selecting a unit
// outside the current date's track jumps the timeline into its lifespan.

import { useEffect, useRef, useState } from 'react';
import { foldText, loadCities, searchCities, type City } from '../data/cities';
import { loadUnitIndex, searchUnits, type UnitIndexEntry } from '../data/units';
import { loadBattles, searchBattles, type Battle } from '../data/battles';
import { selectBattle, selectCity, selectUnit } from './actions';

type Result =
  | { kind: 'city'; city: City }
  | { kind: 'unit'; unit: UnitIndexEntry }
  | { kind: 'battle'; battle: Battle };

const labelOf = (r: Result) =>
  r.kind === 'city' ? r.city.name : r.kind === 'unit' ? r.unit.label : r.battle.name;

export function Omnibox() {
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
    setQuery(labelOf(r));
    if (r.kind === 'city') selectCity(r.city);
    else if (r.kind === 'battle') selectBattle(r.battle);
    else await selectUnit(r.unit);
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
