// Airfield detail view, rendered inside the DetailPanel. Shows the field, its
// historical note, and the air formations based there on the current date —
// resolved from the air units' (airfield-snapped) position keyframes. Clickable
// through to each unit. Deep-linkable via ?airfield=<id>.

import { useEffect, useState } from 'react';
import { loadAirfields, type Airfield } from '../data/airfields';
import { dateToNum, loadUnitTracks, positionOn, type UnitTrack } from '../data/units';
import { formatLong } from '../time/dates';
import { useStore } from '../store';
import { UnitGlyph } from './UnitGlyph';

/** Air units whose current position sits on this field (~5 km) on the date. */
function residentsOn(tracks: UnitTrack[], af: Airfield, dateISO: string): UnitTrack[] {
  const d = dateToNum(dateISO);
  return tracks.filter((t) => {
    if (!t.air) return false;
    const at = positionOn(t, dateISO, d);
    return !!at && Math.hypot(at[0] - af.lon, at[1] - af.lat) < 0.05;
  });
}

export function AirfieldPanel({ id }: { id: string }) {
  const date = useStore((s) => s.date);
  const setSelection = useStore((s) => s.setSelection);
  const [af, setAf] = useState<Airfield | null>(null);
  const [missing, setMissing] = useState(false);
  const [tracks, setTracks] = useState<UnitTrack[]>([]);

  useEffect(() => {
    let alive = true;
    setAf(null);
    setMissing(false);
    loadAirfields()
      .then((list) => {
        if (!alive) return;
        const found = list.find((a) => a.id === id);
        if (found) setAf(found);
        else setMissing(true);
      })
      .catch(() => alive && setMissing(true));
    loadUnitTracks().then((t) => alive && setTracks(t.filter((x) => x.air)));
    return () => {
      alive = false;
    };
  }, [id]);

  if (missing) return <p className="detail-note">Unknown airfield “{id}”.</p>;
  if (!af) return <p className="detail-note">Loading…</p>;

  const residents = residentsOn(tracks, af, date);

  return (
    <>
      <h2>{af.name}</h2>
      <p className="detail-meta">
        <span className="unit-chip airfield-chip">airfield</span>
        {af.country}
      </p>

      {af.notes && <p className="unit-summary">{af.notes}</p>}

      <section className="detail-history">
        <h3>Based here on {formatLong(date)}</h3>
        {residents.length ? (
          <ul className="orbat-tree">
            {residents.map((t) => (
              <li key={t.id}>
                <button
                  className="orbat-row"
                  onClick={() => setSelection({ kind: 'unit', id: t.id })}
                  title={t.short}
                >
                  <UnitGlyph side={t.side} echelon={t.echelon} branch={t.type} />
                  <span className="orbat-label">{t.short}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="detail-note">No curated air formations based here on this date.</p>
        )}
      </section>

      <p className="detail-note">
        Curated airfield. Air units snap to it where the record names a base; click any
        formation above to inspect it, or scrub the date to see who moves in and out.
      </p>
    </>
  );
}
