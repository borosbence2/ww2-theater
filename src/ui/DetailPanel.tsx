// Right-hand detail panel (Phase 0.3/0.4). Renders the current selection:
// cities (country, capital badge, population, curated control history with
// timeline-jumping dates) and units (Phase 1, see UnitPanel).

import { useEffect, useState } from 'react';
import {
  holderOn,
  loadCities,
  loadCityControl,
  type City,
  type ControlCity,
} from '../data/cities';
import { loadUnitDetail } from '../data/units';
import { formatLong } from '../time/dates';
import { useStore } from '../store';
import { UnitPanel } from './UnitPanel';

const SIDE_LABEL = { axis: 'Axis', soviet: 'Soviet' } as const;

function CityDetail({ name }: { name: string }) {
  const date = useStore((s) => s.date);
  const setDate = useStore((s) => s.setDate);

  const [city, setCity] = useState<City | null>(null);
  const [control, setControl] = useState<ControlCity | null>(null);

  useEffect(() => {
    let alive = true;
    setCity(null);
    setControl(null);
    loadCities().then((cities) => {
      if (alive) setCity(cities.find((c) => c.name === name) ?? null);
    });
    loadCityControl().then((cities) => {
      if (alive) setControl(cities.find((c) => c.name === name) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [name]);

  const holder = control ? holderOn(control, date) : null;

  return (
    <>
      <h2>{name}</h2>
      {city && (
        <p className="detail-meta">
          {city.country}
          {city.capital && ' · capital'}
          {city.pop > 0 && ` · pop. ${new Intl.NumberFormat('en').format(city.pop)} (modern)`}
        </p>
      )}

      {holder && (
        <p className={`detail-holder side-${holder}`}>
          {SIDE_LABEL[holder]}-held on {formatLong(date)}
        </p>
      )}

      {control && (
        <section className="detail-history">
          <h3>Documented control</h3>
          <ul>
            <li>
              <span className={`side-dot side-${control.init}`} />
              {SIDE_LABEL[control.init]} at Barbarossa (22 June 1941)
            </li>
            {control.changes.map((c) => (
              <li key={c.date}>
                <span className={`side-dot side-${c.side}`} />
                {SIDE_LABEL[c.side]} from{' '}
                <button className="date-link" onClick={() => setDate(c.date)}>
                  {formatLong(c.date)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!control && city && (
        <p className="detail-note">
          No curated control timeline for this city yet — it is not part of the
          68-city validation set.
        </p>
      )}
    </>
  );
}

function UnitTitle({ id }: { id: string }) {
  const [label, setLabel] = useState(id);
  useEffect(() => {
    let alive = true;
    loadUnitDetail(id)
      .then((u) => alive && setLabel(u.names[u.names.length - 1].name))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id]);
  return <h2>{label}</h2>;
}

export function DetailPanel() {
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);

  if (!selection) return null;

  return (
    <aside className="detail-panel">
      <button className="detail-close" title="Close" onClick={() => setSelection(null)}>
        ×
      </button>
      {selection.kind === 'city' ? (
        <CityDetail name={selection.id} />
      ) : (
        <>
          <UnitTitle id={selection.id} />
          <UnitPanel id={selection.id} />
        </>
      )}
    </aside>
  );
}
