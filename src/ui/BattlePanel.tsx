// Battle detail view (Phase 2), rendered inside the DetailPanel. Wikidata-
// derived: name, dates, status relative to the current date, external links.

import { useEffect, useState } from 'react';
import { loadBattles, type Battle } from '../data/battles';
import { dateToNum, formatLong } from '../time/dates';
import { useStore } from '../store';

export function BattlePanel({ id }: { id: string }) {
  const date = useStore((s) => s.date);
  const setDate = useStore((s) => s.setDate);

  const [battle, setBattle] = useState<Battle | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setBattle(undefined);
    loadBattles().then((battles) => {
      if (alive) setBattle(battles.find((b) => b.id === id) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (battle === undefined) return <p className="detail-note">Loading…</p>;
  if (battle === null) return <p className="detail-note">Unknown battle “{id}”.</p>;

  const d = dateToNum(date);
  const status =
    d < battle.startNum ? 'has not begun' : d > battle.endNum ? 'is over' : 'is ongoing';
  const oneDay = battle.start === battle.end;

  return (
    <div className="unit-panel">
      <h2>{battle.name}</h2>
      <p className="detail-meta">
        {oneDay ? formatLong(battle.start) : `${formatLong(battle.start)} — ${formatLong(battle.end)}`}
      </p>
      <p className="detail-note">
        This battle {status} on {formatLong(date)}.{' '}
        {d < battle.startNum || d > battle.endNum ? (
          <button className="date-link" onClick={() => setDate(battle.start)}>
            Jump to {formatLong(battle.start)}
          </button>
        ) : null}
      </p>
      <section className="detail-history">
        <h3>External</h3>
        <ul>
          {battle.wiki && (
            <li>
              <a href={battle.wiki} target="_blank" rel="noreferrer">
                Wikipedia
              </a>
            </li>
          )}
          <li>
            <a href={`https://www.wikidata.org/wiki/${battle.id}`} target="_blank" rel="noreferrer">
              Wikidata ({battle.id})
            </a>
          </li>
        </ul>
      </section>
      <p className="detail-note">
        Dates and location from Wikidata (CC0); linked units arrive in a later phase.
      </p>
    </div>
  );
}
