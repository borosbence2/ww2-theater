// Unit detail view (Phase 1), rendered inside the DetailPanel. Shows the
// period-correct name for the current date, lifecycle, the chain of command
// at the date (clickable), children, position coverage with confidence,
// external archive links, and source citations.

import { useEffect, useState } from 'react';
import { loadUnitDetail, type UnitDetail } from '../data/units';
import { dateToNum, formatLong } from '../time/dates';
import { useStore } from '../store';

const LINK_LABELS: Record<string, string> = {
  'wikipedia.en': 'Wikipedia',
  wikidata: 'Wikidata',
  niehorster: 'Niehorster OOB',
  'pamyat-naroda': 'Pamyat Naroda',
  'lexikon-der-wehrmacht': 'Lexikon der Wehrmacht',
};

/** Interval entry active on the date (from <= d < to/open). */
function activeOn<T extends { from: string; to?: string | null }>(list: T[], d: number): T | undefined {
  return list.find((x) => dateToNum(x.from) <= d && (!x.to || d < dateToNum(x.to)));
}

export function UnitPanel({ id }: { id: string }) {
  const date = useStore((s) => s.date);
  const setDate = useStore((s) => s.setDate);
  const setSelection = useStore((s) => s.setSelection);
  const trackPath = useStore((s) => s.trackPath);
  const setTrackPath = useStore((s) => s.setTrackPath);
  const follow = useStore((s) => s.follow);
  const setFollow = useStore((s) => s.setFollow);

  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    setUnit(null);
    setMissing(false);
    loadUnitDetail(id)
      .then((u) => alive && setUnit(u))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [id]);

  if (missing) return <p className="detail-note">Unknown unit “{id}”.</p>;
  if (!unit) return <p className="detail-note">Loading…</p>;

  const d = dateToNum(date);
  const name = [...unit.names].reverse().find((n) => dateToNum(n.from) <= d) ?? unit.names[0];
  const life = unit.existence[0];
  const lifeEnd = unit.existence[unit.existence.length - 1];
  const exists = activeOn(unit.existence, d) !== undefined;
  const parentNow = activeOn(unit.parents, d);
  const childrenNow = unit.children.filter((c) => dateToNum(c.from) <= d && (!c.to || d < dateToNum(c.to)));
  const firstMapped = unit.positions[0]?.date;
  const docCount = unit.positions.filter((p) => p.confidence === 'documented').length;

  const jump = (iso: string) => setDate(iso);

  return (
    <div className="unit-panel">
      <p className="detail-meta">
        <span className={`unit-chip side-${unit.side}`}>{unit.echelon}</span>
        {unit.type !== 'hq' && `${unit.type} · `}
        {unit.country} · {unit.branch}
      </p>

      <p className="detail-meta">
        {formatLong(life.from)} — {lifeEnd.to ? formatLong(lifeEnd.to) : 'war end'}
        {lifeEnd.end && <span className="unit-end"> · {lifeEnd.end}</span>}
      </p>

      {(unit.positions.length > 0 || unit.derived) && (
        <div className="unit-controls">
          <label>
            <input
              type="checkbox"
              checked={trackPath}
              onChange={(e) => setTrackPath(e.target.checked)}
            />
            Show path
          </label>
          <label>
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            Follow
          </label>
        </div>
      )}

      {!exists && (
        <p className="detail-note">
          Not active on {formatLong(date)}.{' '}
          <button className="date-link" onClick={() => jump(firstMapped ?? life.from)}>
            Jump to {formatLong(firstMapped ?? life.from)}
          </button>
        </p>
      )}

      {unit.commanders.length > 0 && (
        <section className="detail-history">
          <h3>Commanders</h3>
          <ul>
            {unit.commanders.map((c) => {
              const active = dateToNum(c.from) <= d && (!c.to || d < dateToNum(c.to));
              return (
                <li key={`${c.name}|${c.from}`} className={active ? 'commander-active' : undefined}>
                  {c.link ? (
                    <a href={c.link} target="_blank" rel="noreferrer">
                      {c.name}
                    </a>
                  ) : (
                    c.name
                  )}{' '}
                  <span className="omnibox-meta">
                    {formatLong(c.from)} — {c.to ? formatLong(c.to) : 'open'}
                    {active && ' · in command'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {parentNow && (
        <section className="detail-history">
          <h3>Chain of command on {formatLong(date)}</h3>
          <ul>
            <li>
              <button className="date-link" onClick={() => setSelection({ kind: 'unit', id: parentNow.unit })}>
                {parentNow.label}
              </button>
            </li>
          </ul>
        </section>
      )}

      {unit.parents.length > 0 && (
        <section className="detail-history">
          <h3>Subordination</h3>
          <ul>
            {unit.parents.map((p) => (
              <li key={`${p.unit}|${p.from}`}>
                <button className="date-link" onClick={() => setSelection({ kind: 'unit', id: p.unit })}>
                  {p.label}
                </button>
                &nbsp;
                <button className="date-link muted" onClick={() => jump(p.from)}>
                  {formatLong(p.from)}
                </button>
                {' — '}
                {p.to ? (
                  <button className="date-link muted" onClick={() => jump(p.to!)}>
                    {formatLong(p.to)}
                  </button>
                ) : (
                  'open'
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {childrenNow.length > 0 && (
        <section className="detail-history">
          <h3>Subordinate units on this date</h3>
          <ul>
            {childrenNow.map((c) => (
              <li key={c.unit}>
                <button className="date-link" onClick={() => setSelection({ kind: 'unit', id: c.unit })}>
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="detail-history">
        <h3>Mapped positions</h3>
        {unit.positions.length ? (
          <>
            <p className="detail-note">
              {unit.positions.length} keyframes, {formatLong(unit.positions[0].date)} —{' '}
              {formatLong(unit.positions[unit.positions.length - 1].date)} ({docCount} documented, rest
              approximate; interpolated between keyframes).
            </p>
            <ul>
              {unit.positions
                .filter((p) => p.label)
                .map((p) => (
                  <li key={p.date}>
                    <button className="date-link" onClick={() => jump(p.date)}>
                      {formatLong(p.date)}
                    </button>{' '}
                    {p.label}
                  </li>
                ))}
            </ul>
          </>
        ) : unit.derived ? (
          <p className="detail-note">
            Position <strong>derived daily</strong> from the front line, authored
            army sectors, and the order of battle (Боевой состав Советской Армии /
            Lexikon der Wehrmacht Unterstellung) — not individually documented.
            Shown hollow on the map.
          </p>
        ) : (
          <p className="detail-note">
            Not mapped yet — identity and subordination only. Sources below tell the story.
          </p>
        )}
      </section>

      {Object.keys(unit.links).length > 0 && (
        <section className="detail-history">
          <h3>External archives</h3>
          <ul>
            {Object.entries(unit.links).map(([key, url]) => (
              <li key={key}>
                {key === 'wikidata' ? (
                  <a href={`https://www.wikidata.org/wiki/${url}`} target="_blank" rel="noreferrer">
                    Wikidata
                  </a>
                ) : (
                  <a href={url} target="_blank" rel="noreferrer">
                    {LINK_LABELS[key] ?? key}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {unit.sources.length > 0 && (
        <p className="detail-note">Sources: {unit.sources.map((s) => s.citation ?? s.id).join(' · ')}</p>
      )}
      {unit.notes && <p className="detail-note">{unit.notes}</p>}
      <p className="detail-note">Period name on this date: {name.name}</p>
    </div>
  );
}
