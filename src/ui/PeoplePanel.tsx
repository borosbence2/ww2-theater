// People search (Phase 4.1). "Everyone who fought is findable" — delivered
// honestly: we host no personal records. A name fans out as prefilled query
// links to the national archives (their service record names the unit), and
// the find-their-unit wizard resolves that unit here, where its daily path
// lives. Deep-linkable via ?person=Name.

import { useEffect, useState } from 'react';
import { loadUnitIndex, searchUnits, type UnitIndexEntry } from '../data/units';
import { selectUnit } from './actions';
import { useStore } from '../store';

type Side = 'all' | 'soviet' | 'german' | 'us' | 'commonwealth';

interface Archive {
  name: string;
  covers: string;
  sides: Side[];
  url: (q: string) => string;
  paywalled?: boolean;
}

const ARCHIVES: Archive[] = [
  {
    name: 'Pamyat Naroda',
    covers: 'Soviet personnel, awards, route of service',
    sides: ['soviet'],
    url: (q) => `https://pamyat-naroda.ru/heroes/?last_name=${encodeURIComponent(q)}`,
  },
  {
    name: 'OBD Memorial',
    covers: 'Soviet fallen and missing',
    sides: ['soviet'],
    url: (q) => `https://obd-memorial.ru/html/fond.htm?last_name=${encodeURIComponent(q)}`,
  },
  {
    name: 'Podvig Naroda',
    covers: 'Soviet award citations',
    sides: ['soviet'],
    url: () => 'http://podvignaroda.ru/',
  },
  {
    name: 'Volksbund Gräbersuche',
    covers: 'German war graves',
    sides: ['german'],
    url: (q) => `https://www.volksbund.de/erinnern-gedenken/graebersuche-online?tx_igverlustsuche_pi2%5Bnachname%5D=${encodeURIComponent(q)}`,
  },
  {
    name: 'NARA AAD — WWII Army Enlistment',
    covers: '~9M US enlistment records',
    sides: ['us'],
    url: () => 'https://aad.archives.gov/aad/series-description.jsp?s=3360',
  },
  {
    name: 'ABMC',
    covers: 'US burials and memorials abroad',
    sides: ['us'],
    url: (q) => `https://www.abmc.gov/database-search?combine=${encodeURIComponent(q)}`,
  },
  {
    name: 'CWGC',
    covers: 'Commonwealth war dead',
    sides: ['commonwealth'],
    url: (q) =>
      `https://www.cwgc.org/find-records/find-war-dead/search-results/?Surname=${encodeURIComponent(q)}&War=2`,
  },
  {
    name: 'TracesOfWar persons',
    covers: 'Mixed, biographical',
    sides: ['all'],
    url: (q) => `https://www.tracesofwar.com/persons/?q=${encodeURIComponent(q)}`,
  },
  {
    name: 'Find A Grave',
    covers: 'Graves worldwide',
    sides: ['all'],
    url: (q) => `https://www.findagrave.com/memorial/search?lastname=${encodeURIComponent(q)}`,
  },
  {
    name: 'Fold3',
    covers: 'US + mixed service records',
    sides: ['all'],
    url: (q) => `https://www.fold3.com/search?keywords=${encodeURIComponent(q)}`,
    paywalled: true,
  },
  {
    name: 'Ancestry',
    covers: 'Genealogy + service records',
    sides: ['all'],
    url: (q) => `https://www.ancestry.com/search/?name=_${encodeURIComponent(q)}`,
    paywalled: true,
  },
];

const SIDES: { id: Side; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'soviet', label: 'Soviet' },
  { id: 'german', label: 'German' },
  { id: 'us', label: 'US' },
  { id: 'commonwealth', label: 'Commonwealth' },
];

export function PeoplePanel() {
  const open = useStore((s) => s.peopleOpen);
  const setOpen = useStore((s) => s.setPeopleOpen);
  const personQuery = useStore((s) => s.personQuery);
  const setPersonQuery = useStore((s) => s.setPersonQuery);

  const [side, setSide] = useState<Side>('all');
  const [unitQuery, setUnitQuery] = useState('');
  const [unitHits, setUnitHits] = useState<UnitIndexEntry[]>([]);

  useEffect(() => {
    let alive = true;
    if (unitQuery.trim().length < 2) {
      setUnitHits([]);
      return;
    }
    loadUnitIndex().then((index) => {
      if (alive) setUnitHits(searchUnits(index, unitQuery, 6));
    });
    return () => {
      alive = false;
    };
  }, [unitQuery]);

  if (!open) return null;

  const q = personQuery.trim();
  const archives = ARCHIVES.filter((a) => side === 'all' || a.sides.includes(side) || a.sides.includes('all'));

  return (
    <aside className="detail-panel people-panel">
      <button className="detail-close" title="Close" onClick={() => setOpen(false)}>
        ×
      </button>
      <h2>Find a person</h2>
      <p className="detail-note">
        No personal records are stored here. Search the archives — a service
        record names the unit, and the unit's daily path lives on this map.
      </p>

      <input
        className="people-input"
        type="search"
        placeholder="Family name (e.g. Ivanov, Müller)…"
        value={personQuery}
        onChange={(e) => setPersonQuery(e.target.value)}
        aria-label="Person name"
      />

      <div className="people-sides">
        {SIDES.map((s) => (
          <button
            key={s.id}
            className={side === s.id ? 'active' : undefined}
            onClick={() => setSide(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <section className="detail-history">
        <h3>Archives{q ? ` — search "${q}"` : ''}</h3>
        <ul className="people-archives">
          {archives.map((a) => (
            <li key={a.name}>
              <a href={a.url(q)} target="_blank" rel="noreferrer">
                {a.name}
              </a>
              {a.paywalled && <span className="unit-chip paywall-chip">paywall</span>}
              <span className="omnibox-meta">{a.covers}</span>
            </li>
          ))}
        </ul>
        {!q && <p className="detail-note">Enter a name to prefill the archive searches.</p>}
      </section>

      <section className="detail-history">
        <h3>Found their unit? Look it up here</h3>
        <input
          className="people-input"
          type="search"
          placeholder="Unit name (e.g. 305th Infantry Division)…"
          value={unitQuery}
          onChange={(e) => setUnitQuery(e.target.value)}
          aria-label="Unit name"
        />
        {unitHits.length > 0 && (
          <ul>
            {unitHits.map((u) => (
              <li key={u.id}>
                <button
                  className="date-link"
                  onClick={() => {
                    setOpen(false);
                    void selectUnit(u);
                  }}
                >
                  {u.label}
                </button>{' '}
                <span className="omnibox-meta">
                  {u.country}
                  {u.hasPositions ? ' · mapped' : u.hasDerived ? ' · derived' : ' · not mapped yet'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
