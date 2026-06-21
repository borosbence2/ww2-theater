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
import { loadUnitIndex } from '../data/units';
import { getPocketFeature, loadFrontFeatures, type FrontFeature } from '../layers/front';
import { formatLong, dateToNum } from '../time/dates';
import { useStore } from '../store';
import { UnitPanel } from './UnitPanel';
import { BattlePanel } from './BattlePanel';

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

/** Pocket / siege detail (Phase 5.2): the formations trapped inside and the
 *  ones besieging it — joins the front feature's garrison/besiegers to units. */
function PocketDetail({ id }: { id: string }) {
  const date = useStore((s) => s.date);
  const setSelection = useStore((s) => s.setSelection);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [f, setF] = useState<FrontFeature | null>(null);

  useEffect(() => {
    let alive = true;
    loadUnitIndex().then((units) => {
      if (alive) setLabels(new Map(units.map((u) => [u.id, u.label])));
    });
    loadFrontFeatures().then(() => {
      if (alive) setF(getPocketFeature(id) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (!f) return <p className="detail-note">Loading…</p>;
  const enc = f.encircled ?? 'axis';
  const d = dateToNum(date);
  const active = d >= f.fromNum && d < f.toNum;
  const besiegerIds = (f.besiegers ?? []).map((b) => (typeof b === 'string' ? b : b.id));
  const link = (uid: string) => (
    <li key={uid}>
      <button className="date-link" onClick={() => setSelection({ kind: 'unit', id: uid })}>
        {labels.get(uid) ?? uid}
      </button>
    </li>
  );

  return (
    <>
      <h2>{f.label ?? id}</h2>
      <p className={`detail-holder side-${enc}`}>
        {SIDE_LABEL[enc]} encircled
        {f.from && ` · ${formatLong(f.from)}`}
        {f.to ? ` – ${formatLong(f.to)}` : ''}
      </p>
      {!active && <p className="detail-note">Not active on {formatLong(date)}.</p>}
      {f.garrison && f.garrison.length > 0 && (
        <section className="detail-history">
          <h3>Trapped in the pocket</h3>
          <ul>{f.garrison.map(link)}</ul>
        </section>
      )}
      {besiegerIds.length > 0 && (
        <section className="detail-history">
          <h3>Besieging formations</h3>
          <ul>{besiegerIds.map(link)}</ul>
        </section>
      )}
      <p className="detail-note">
        Trapped formations are placed inside the ring; besiegers hug its outer
        edge. Click any to inspect it.
      </p>
    </>
  );
}

export function DetailPanel() {
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);

  if (!selection) return null;

  // Units own their (sticky) header + close button inside UnitPanel.
  if (selection.kind === 'unit') {
    return (
      <aside className="detail-panel unit-detail">
        <UnitPanel id={selection.id} onClose={() => setSelection(null)} />
      </aside>
    );
  }

  return (
    <aside className="detail-panel">
      <button className="detail-close" title="Close" onClick={() => setSelection(null)}>
        ×
      </button>
      {selection.kind === 'city' ? (
        <CityDetail name={selection.id} />
      ) : selection.kind === 'pocket' ? (
        <PocketDetail id={selection.id} />
      ) : (
        <BattlePanel id={selection.id} />
      )}
    </aside>
  );
}
