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
import { groupedEquipment, EQUIP_CLASS_LABEL } from '../data/equipment';
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

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th" … */
const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};

/** Tiny inline trend line of personnel strength over the curated returns. */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const W = 150;
  const H = 32;
  const pad = 4;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const xy = points.map((v, i) => {
    const x = pad + (i / (points.length - 1)) * (W - 2 * pad);
    const y = pad + (1 - (v - min) / range) * (H - 2 * pad);
    return [x, y] as const;
  });
  return (
    <svg className="strength-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <polyline
        points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2} fill="var(--accent)" />
      ))}
    </svg>
  );
}

/** A scannable stat tile (establishment, armour, raised, fate). */
function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

interface ChainNode {
  id: string;
  label: string;
  echelon: string;
  side: 'axis' | 'soviet';
  branch: string;
}

/** Walk the chain of command upward from a unit on a date (immediate parent ->
 *  …-> top), so the panel can draw the full command spine, not one level. */
async function loadAncestors(start: UnitDetail, d: number): Promise<ChainNode[]> {
  const out: ChainNode[] = [];
  const seen = new Set([start.id]); // guard against cycles / a parent repeated up the chain
  let cur = start;
  for (let i = 0; i < 6; i++) {
    const p = activeOn(cur.parents, d);
    if (!p || seen.has(p.unit)) break;
    seen.add(p.unit);
    let pu: UnitDetail;
    try {
      pu = await loadUnitDetail(p.unit);
    } catch {
      break;
    }
    out.unshift({ id: pu.id, label: p.label, echelon: pu.echelon, side: pu.side, branch: pu.type });
    cur = pu;
  }
  return out;
}

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

// Collapsible template row: expanded down to the top level by default, deeper
// echelons (company → platoon → squad) drill down on click.
function TemplateRow({ node, side, depth }: { node: TemplateNode; side: 'axis' | 'soviet'; depth: number }) {
  const kids = node.children ?? [];
  const hasKids = kids.length > 0;
  const [open, setOpen] = useState(depth < 1);
  return (
    <li>
      <div
        className={`orbat-row static${hasKids ? ' has-kids' : ''}`}
        onClick={hasKids ? () => setOpen((o) => !o) : undefined}
      >
        <span className="orbat-toggle">{hasKids ? (open ? '▾' : '▸') : ''}</span>
        <UnitGlyph side={side} echelon={node.ech} branch={node.branch} />
        <span className="orbat-label">{node.label}</span>
        {node.count && node.count > 1 && <span className="orbat-count">×{node.count}</span>}
      </div>
      {hasKids && open && (
        <ul className="orbat-tree">
          {kids.map((c, i) => (
            <TemplateRow key={`${c.label}-${i}`} node={c} side={side} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TemplateRows({ nodes, side }: { nodes: TemplateNode[]; side: 'axis' | 'soviet' }) {
  return (
    <ul className="orbat-tree">
      {nodes.map((node, i) => (
        <TemplateRow key={`${node.label}-${i}`} node={node} side={side} depth={0} />
      ))}
    </ul>
  );
}

export function UnitPanel({ id, onClose }: { id: string; onClose?: () => void }) {
  const date = useStore((s) => s.date);
  const setDate = useStore((s) => s.setDate);
  const setSelection = useStore((s) => s.setSelection);
  const trackPath = useStore((s) => s.trackPath);
  const setTrackPath = useStore((s) => s.setTrackPath);
  const follow = useStore((s) => s.follow);
  const setFollow = useStore((s) => s.setFollow);

  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [ancestors, setAncestors] = useState<ChainNode[]>([]);

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

  // Chain-of-command spine: walk parents upward (date-dependent).
  useEffect(() => {
    let alive = true;
    setAncestors([]);
    if (!unit) return;
    loadAncestors(unit, dateToNum(date)).then((a) => alive && setAncestors(a));
    return () => {
      alive = false;
    };
  }, [unit, date]);

  if (missing) return <p className="detail-note">Unknown unit “{id}”.</p>;
  if (!unit) return <p className="detail-note">Loading…</p>;

  const d = dateToNum(date);
  const name = [...unit.names].reverse().find((n) => dateToNum(n.from) <= d) ?? unit.names[0];
  const life = unit.existence[0];
  const lifeEnd = unit.existence[unit.existence.length - 1];
  const exists = activeOn(unit.existence, d) !== undefined;
  const template = matchTemplate(unit.side, unit.echelon, unit.type, date);
  const firstMapped = unit.positions[0]?.date;
  const docCount = unit.positions.filter((p) => p.confidence === 'documented').length;

  const jump = (iso: string) => setDate(iso);

  // Key-stats band: numbers promoted out of prose. Each tile is guarded — a
  // datum that doesn't exist gets no tile (never fabricated).
  const selfFate = unit.formations?.list.find((f) => f.self)?.fate ?? lifeEnd.end ?? null;
  const leadEquip = template?.equipment?.[0];
  const stats: { value: string; label: string }[] = [];
  if (template?.strength) stats.push({ value: template.strength.toLocaleString(), label: 'Establishment' });
  if (leadEquip) stats.push({ value: leadEquip.count.toLocaleString(), label: leadEquip.name });
  stats.push({ value: life.from.slice(0, 4), label: 'Raised' });
  if (lifeEnd.to) stats.push({ value: lifeEnd.to.slice(0, 4), label: selfFate ? 'Fate' : 'Last active' });

  // Command spine: ancestors (loaded async) + this unit at the bottom.
  const spine: (ChainNode & { self?: boolean })[] = [
    ...ancestors,
    { id: unit.id, label: name.name, echelon: unit.echelon, side: unit.side, branch: unit.type, self: true },
  ];

  return (
    <div className="unit-panel">
      <header className={`unit-head side-${unit.side}`}>
        {onClose && (
          <button className="detail-close" title="Close" onClick={onClose}>
            ×
          </button>
        )}
        <div className="unit-head-id">
          <UnitGlyph side={unit.side} echelon={unit.echelon} branch={unit.type} size={58} />
          <div className="unit-head-text">
            <h2>{name.name}</h2>
            <div className="unit-head-chips">
              <span className={`unit-chip side-${unit.side}`}>{unit.echelon}</span>
              <span className="unit-head-sub">
                {unit.type !== 'hq' && `${unit.type} · `}
                {unit.country}
              </span>
            </div>
          </div>
        </div>
        <div className="unit-head-status">
          <span className={`side-dot side-${unit.side}`} />
          {exists ? 'Active' : 'Not active'} · {formatLong(life.from)} —{' '}
          {lifeEnd.to ? formatLong(lifeEnd.to) : 'war end'}
          {lifeEnd.end && <span className="unit-end"> · {lifeEnd.end}</span>}
        </div>
      </header>

      <div className="unit-body">
        {unit.summary && (
          <p className="unit-summary">
            {unit.summary}
            {unit.links?.['wikipedia.en'] && (
              <>
                {' '}
                <a href={unit.links['wikipedia.en']} target="_blank" rel="noreferrer">
                  Wikipedia ↗
                </a>
              </>
            )}
          </p>
        )}

        {stats.length > 0 && (
          <div className="stat-grid">
            {stats.map((s) => (
              <StatTile key={s.label} value={s.value} label={s.label} />
            ))}
          </div>
        )}
        {selfFate && <p className="stat-fate">{selfFate}</p>}

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

      {unit.formations && unit.formations.list.length > 1 && (
        <section className="detail-history">
          <h3>Formations — {unit.formations.designation}</h3>
          <ul>
            {unit.formations.list.map((f) => {
              const span = f.from
                ? `${formatLong(f.from)} — ${f.to ? formatLong(f.to) : 'war end'}`
                : f.to
                  ? `until ${formatLong(f.to)}`
                  : 'dates unknown';
              const name = `${ordinal(f.ordinal)} formation`;
              return (
                <li key={`${f.ordinal}|${f.id ?? 'x'}`} className={f.self ? 'commander-active' : undefined}>
                  {f.id && !f.self ? (
                    <button className="date-link" onClick={() => setSelection({ kind: 'unit', id: f.id! })}>
                      {name}
                    </button>
                  ) : (
                    name
                  )}{' '}
                  <span className="omnibox-meta">
                    {span}
                    {f.fate && ` · ${f.fate}`}
                    {f.note && ` · ${f.note}`}
                    {f.self && ' · this unit'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {unit.commanders.length > 0 && (
        <section className="detail-history">
          <h3>Commanders</h3>
          <ul>
            {unit.commanders.map((c) => {
              // Wikidata commanders may be undated; only dated spans can be "active".
              const active = c.from ? dateToNum(c.from) <= d && (!c.to || d < dateToNum(c.to)) : false;
              // Tenures may have one endpoint as a keyword (Aufstellung/Kapitulation)
              // and so be partially dated — show what we have, honestly.
              const span = c.from
                ? `${formatLong(c.from)} — ${c.to ? formatLong(c.to) : 'open'}`
                : c.to
                  ? `until ${formatLong(c.to)}`
                  : 'dates unknown';
              return (
                <li key={`${c.name}|${c.from ?? '?'}|${c.to ?? '?'}`} className={active ? 'commander-active' : undefined}>
                  {c.link ? (
                    <a href={c.link} target="_blank" rel="noreferrer">
                      {c.name}
                    </a>
                  ) : (
                    c.name
                  )}{' '}
                  <span className="omnibox-meta">
                    {span}
                    {active && ' · in command'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {spine.length > 1 && (
        <section className="detail-history">
          <h3>Chain of command · {formatLong(date)}</h3>
          <div className="chain-spine">
            {spine.map((u, i) => (
              <button
                key={`${u.id}-${i}`}
                className={`chain-row${u.self ? ' chain-self' : ''} side-${u.side}`}
                onClick={() => !u.self && setSelection({ kind: 'unit', id: u.id })}
                disabled={u.self}
                title={u.label}
              >
                <span className="chain-glyph">
                  <UnitGlyph side={u.side} echelon={u.echelon} branch={u.branch} size={30} />
                </span>
                <span className="chain-text">
                  <span className="chain-label">{u.label}</span>
                  <span className="chain-ech">
                    {u.echelon}
                    {u.self && ' · this unit'}
                  </span>
                </span>
                {u.self && <span className="chain-marker">◂</span>}
              </button>
            ))}
          </div>
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
          {template.strength && (
            <p className="detail-note">
              Establishment ≈ <strong>{template.strength.toLocaleString()}</strong> personnel (nominal)
            </p>
          )}
          {template.equipment && template.equipment.length > 0 && (
            <div className="equip-chips">
              {template.equipment.map((e) => (
                <span className="equip-chip" key={e.name}>
                  <b>{e.count.toLocaleString()}</b> {e.name}
                </span>
              ))}
            </div>
          )}
          <TemplateRows nodes={template.components} side={unit.side} />
          {template.note && <p className="detail-note">{template.note}</p>}
        </section>
      )}

      {template?.equipmentRefs && template.equipmentRefs.length > 0 && (
        <section className="detail-history">
          <h3>Equipment</h3>
          {groupedEquipment(template.equipmentRefs).map(({ cls, items }) => (
            <div className="equip-group" key={cls}>
              <div className="equip-group-label">{EQUIP_CLASS_LABEL[cls]}</div>
              <ul>
                {items.map((e) => (
                  <li key={e.id}>
                    <a href={e.wiki} target="_blank" rel="noreferrer">
                      {e.name}
                    </a>
                    <span className="omnibox-meta"> · {e.spec}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {unit.strength && unit.strength.length > 0 && (
        <section className="detail-history">
          <h3>Strength returns</h3>
          {template?.strength && (
            <p className="detail-note">
              vs. nominal establishment ≈ <strong>{template.strength.toLocaleString()}</strong> personnel
            </p>
          )}
          <Sparkline points={unit.strength.filter((r) => r.personnel != null).map((r) => r.personnel!)} />
          <ul>
            {unit.strength.map((r) => (
              <li key={r.date} className="strength-row">
                <button className="date-link" onClick={() => jump(r.date)}>
                  {formatLong(r.date)}
                </button>
                {r.personnel != null && (
                  <span>
                    {' — '}
                    <strong>{r.personnel.toLocaleString()}</strong> men
                  </span>
                )}
                {r.equipment?.map((e) => (
                  <span className="equip-chip" key={e.name}>
                    <b>{e.count.toLocaleString()}</b> {e.name}
                  </span>
                ))}
                {r.note && <span className="omnibox-meta"> · {r.note}</span>}
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
          <div className="archive-chips">
            {Object.entries(unit.links).map(([key, url]) => (
              <a
                className="archive-chip"
                key={key}
                href={key === 'wikidata' ? `https://www.wikidata.org/wiki/${url}` : url}
                target="_blank"
                rel="noreferrer"
              >
                {LINK_LABELS[key] ?? key} <span className="archive-arr">↗</span>
              </a>
            ))}
          </div>
        </section>
      )}

        <div className="unit-foot">
          {unit.sources.length > 0 && (
            <p>Sources: {unit.sources.map((s) => s.citation ?? s.id).join(' · ')}</p>
          )}
          {unit.notes && <p>{unit.notes}</p>}
          <p>Period name on this date: {name.name}</p>
        </div>
      </div>
    </div>
  );
}
