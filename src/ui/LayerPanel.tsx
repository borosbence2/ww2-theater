// Layer toggles + legend (Phase 0.2). One row per registered layer with a
// visibility checkbox; each row's legend swatches are tucked behind a per-row
// chevron so the open panel stays a compact checklist. The whole panel is
// collapsible too, so it stays out of the way of the map.

import { useState } from 'react';
import { LAYERS, type LegendItem } from '../layers/registry';
import { useStore } from '../store';

function Swatch({ item }: { item: LegendItem }) {
  return <span className={`legend-swatch legend-${item.shape}`} style={{ '--swatch': item.color } as React.CSSProperties} />;
}

export function LayerPanel() {
  const hiddenLayers = useStore((s) => s.hiddenLayers);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="layer-panel">
      <button className="layer-panel-header" onClick={() => setOpen(!open)} aria-expanded={open}>
        Layers
        <span className={`caret${open ? ' open' : ''}`} aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul className="layer-list">
          {LAYERS.map((def) => {
            const isExpanded = expanded.has(def.id);
            return (
              <li key={def.id}>
                <div className="layer-row">
                  <label className="layer-row-label">
                    <input
                      type="checkbox"
                      checked={!hiddenLayers.includes(def.id)}
                      onChange={() => toggleLayer(def.id)}
                    />
                    {def.label}
                  </label>
                  <button
                    className={`layer-legend-toggle${isExpanded ? ' open' : ''}`}
                    onClick={() => toggleExpand(def.id)}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Hide' : 'Show'} legend for ${def.label}`}
                  >
                    ▾
                  </button>
                </div>
                {isExpanded && (
                  <ul className="legend">
                    {def.legend.map((item) => (
                      <li key={item.label}>
                        <Swatch item={item} />
                        {item.label}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
