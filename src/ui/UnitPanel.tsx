// Unit detail view (Phase 1), rendered inside the DetailPanel. Shows the
// period-correct name for the current date, lifecycle, the chain of command
// at the date (clickable), children, position coverage with confidence,
// external archive links, and source citations.

import { useEffect, useState } from 'react';
import {
  loadOrbat,
  loadUnitDetail,
  type OrbatIndex,
  type OrbatNode,
  type UnitDetail,
} from '../data/units';
import { matchTemplate, type TemplateNode } from '../data/templates';
import { dateToNum, formatLong } from '../time/dates';
import { useStore } from '../store';
import { UnitGlyph } from './UnitGlyph';

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

const branchOf = (type: string): string => (type === 'hq' ? 'hq' : type);

interface OrbatItem {
  node: OrbatNode;
  children: OrbatItem[];
}

// Build the actual ORBAT subtree under a unit on a date. Descent stops at
// division level (and never expands regiments/battalions) so an army shows its
// corps and divisions, and a division shows its regiments, without exploding.
const STOP = new Set(['division', 'brigade', 'regiment', 'battalion', 'company']);
function buildOrbat(
  idx: OrbatIndex,
  rootId: string,
  d: number,
  depth: number,
  budget: { n: number },
): OrbatItem[] {
  if (depth > 4 || budget.n >= 180) return [];
  const out: OrbatItem[] = [];
  for (const node of idx.childrenOn(rootId, d)) {
    if (budget.n >= 180) break;
    budget.n++;
    const children = STOP.has(node.echelon) ? [] : buildOrbat(idx, node.id, d, depth + 1, budget);
    out.push({ node, children });
  }
  return out;
}

function OrbatRows({ items, onSelect }: { items: OrbatItem[]; onSelect: (id: string) => void }) {
  return (
    <ul className="orbat-tree">
      {items.map((it) => (
        <li key={it.node.id}>
          <button className="orbat-row" onClick={() => onSelect(it.node.id)} title={it.node.label}>
            <UnitGlyph side={it.node.side} echelon={it.node.echelon} branch={branchOf(it.node.type)} />
            <span className="orbat-label">{it.node.label}</span>
            {(it.node.hasPositions || it.node.hasDerived) && (
              <span className="orbat-tag">{it.node.hasPositions ? 'mapped' : 'derived'}</span>
            )}
          </button>
          {it.children.length > 0 && <OrbatRows items={it.children} onSelect={onSelect} />}
        </li>
      ))}
    </ul>
  );
}

/** Actual order of battle under the selected unit on the date. */
function OrbatSection({ id, d, onSelect }: { id: string; d: number; onSelect: (id: string) => void }) {
  const [idx, setIdx] = useState<OrbatIndex | null>(null);
  useEffect(() => {
    let alive = true;
    loadOrbat().then((o) => alive && setIdx(o));
    return () => {
      alive = false;
    };
  }, []);
  if (!idx) return null;
  const budget = { n: 0 };
  const items = buildOrbat(idx, id, d, 0, budget);
  if (!items.length) return null;
  return (
    <section className="detail-history">
      <h3>Order of battle on this date</h3>
      <OrbatRows items={items} onSelect={onSelect} />
      {budget.n >= 180 && <p className="detail-note">…tree truncated.</p>}
    </section>
  );
}

function TemplateRows({ nodes, side }: { nodes: TemplateNode[]; side: 'axis' | 'soviet' }) {
  return (
    <ul className="orbat-tree">
      {nodes.map((n, i) => (
        <li key={`${n.label}-${i}`}>
          <div className="orbat-row static">
            <UnitGlyph side={side} echelon={n.ech} branch={n.branch} />
            <span className="orbat-label">{n.label}</span>
            {n.count && n.count > 1 && <span className="orbat-count">×{n.count}</span>}
          </div>
          {n.children && n.children.length > 0 && <TemplateRows nodes={n.children} side={side} />}
        </li>
      ))}
    </ul>
  );
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
  const template = matchTemplate(unit.side, unit.echelon, unit.type, date);
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
              // Wikidata commanders may be undated; only dated spans can be "active".
              const active = c.from ? dateToNum(c.from) <= d && (!c.to || d < dateToNum(c.to)) : false;
              return (
                <li key={`${c.name}|${c.from ?? '?'}`} className={active ? 'commander-active' : undefined}>
                  {c.link ? (
                    <a href={c.link} target="_blank" rel="noreferrer">
                      {c.name}
                    </a>
                  ) : (
                    c.name
                  )}{' '}
                  <span className="omnibox-meta">
                    {c.from ? `${formatLong(c.from)} — ${c.to ? formatLong(c.to) : 'open'}` : 'dates unknown'}
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

      <OrbatSection id={id} d={d} onSelect={(uid) => setSelection({ kind: 'unit', id: uid })} />

      {template && (
        <section className="detail-history">
          <h3>Establishment — template</h3>
          <p className="detail-note orbat-template-name">
            {template.name}
            <span className="orbat-template-tag">standard TO&amp;E</span>
          </p>
          <TemplateRows nodes={template.components} side={unit.side} />
          {template.note && <p className="detail-note">{template.note}</p>}
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
