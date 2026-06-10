// Layer toggles + legend (Phase 0.2). One row per registered layer with a
// visibility checkbox; expanding a row shows its legend swatches. Collapsible
// so it stays out of the way of the map.

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

  return (
    <div className="layer-panel">
      <button className="layer-panel-header" onClick={() => setOpen(!open)}>
        Layers {open ? '▾' : '▸'}
      </button>
      {open && (
        <ul className="layer-list">
          {LAYERS.map((def) => (
            <li key={def.id}>
              <label className="layer-row">
                <input
                  type="checkbox"
                  checked={!hiddenLayers.includes(def.id)}
                  onChange={() => toggleLayer(def.id)}
                />
                {def.label}
              </label>
              {!hiddenLayers.includes(def.id) && (
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
          ))}
        </ul>
      )}
    </div>
  );
}
