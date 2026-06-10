// Panel for the dev keyframe editor (?edit). Shows the keyframe JSON for the
// traced waypoints at the current date, ready to paste into
// data/curated/eastern-front.json (then re-run build-fronts.mjs).

import { useState } from 'react';
import { useStore } from '../store';
import { useEditStore } from './editStore';

/** Curated waypoints keep 2 decimals (~1 km) — hand-authored precision. */
function toJson(date: string, points: [number, number][]): string {
  const waypoints = points
    .map(([x, y]) => `[${x.toFixed(2)},${y.toFixed(2)}]`)
    .join(',');
  return `{ "date": "${date}", "label": "",\n  "waypoints": [${waypoints}] }`;
}

export function EditPanel() {
  const date = useStore((s) => s.date);
  const points = useEditStore((s) => s.points);
  const undo = useEditStore((s) => s.undo);
  const clear = useEditStore((s) => s.clear);
  const [copied, setCopied] = useState(false);

  const json = toJson(date, points);

  const copy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="edit-panel">
      <h2>Keyframe editor</h2>
      <p>
        Click the map to add waypoints (N→S for fronts), drag to adjust.
        Dashed lines: keyframes before (purple) / after (green) this date.
        Paste the JSON into <code>data/curated/eastern-front.json</code> and
        re-run <code>build-fronts.mjs</code>.
      </p>
      <div className="edit-actions">
        <button onClick={undo} disabled={!points.length}>Undo</button>
        <button onClick={clear} disabled={!points.length}>Clear</button>
        <button onClick={copy} disabled={!points.length}>
          {copied ? 'Copied ✓' : 'Copy JSON'}
        </button>
        <span className="edit-count">{points.length} pts</span>
      </div>
      <textarea readOnly value={json} rows={6} spellCheck={false} />
    </div>
  );
}
