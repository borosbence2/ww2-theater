// Omnibox search (Phase 0.3). Searches cities for now; Phase 2 extends the
// same box to units and battles via the prebuilt index. Selecting a result
// sets the store selection (deep-linkable) and flies the camera there.

import { useEffect, useRef, useState } from 'react';
import { loadCities, searchCities, type City } from '../data/cities';
import { getMap } from '../map/mapRef';
import { useStore } from '../store';

export function Omnibox() {
  const setSelection = useStore((s) => s.setSelection);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<City[]>([]);
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
    loadCities().then((cities) => {
      if (!alive) return;
      const hits = searchCities(cities, query);
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

  const select = (city: City) => {
    setSelection({ kind: 'city', id: city.name });
    setQuery(city.name);
    setOpen(false);
    const map = getMap();
    map?.flyTo({ center: [city.lng, city.lat], zoom: Math.max(map.getZoom(), 5.5) });
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
      select(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="omnibox" ref={boxRef}>
      <input
        type="search"
        placeholder="Search cities…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(results.length > 0)}
        onKeyDown={onKeyDown}
        aria-label="Search"
      />
      {open && (
        <ul className="omnibox-results">
          {results.map((city, i) => (
            <li
              key={`${city.name}|${city.lng}`}
              className={i === active ? 'active' : undefined}
              onMouseEnter={() => setActive(i)}
              // mousedown, not click: fires before the input's blur
              onMouseDown={(e) => {
                e.preventDefault();
                select(city);
              }}
            >
              <span>{city.name}</span>
              <span className="omnibox-meta">
                {city.capital ? 'capital · ' : ''}
                {city.country}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
