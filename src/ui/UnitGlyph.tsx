// Small APP-6-style unit glyph for the order-of-battle / template org-chart in
// the detail panel: a side-tinted frame with the branch symbol inside and the
// echelon size mark above. SVG (crisp at any size), separate from the canvas
// icons the map layer generates.

const COLOR = { axis: '#cf4b34', soviet: '#3f86d4' } as const;
const FILL = { axis: '#f6dcd4', soviet: '#d7e6f7' } as const;
const INK = { axis: '#9c3322', soviet: '#2c5e93' } as const;

const ECH_MARK: Record<string, string> = {
  company: 'I',
  battalion: 'II',
  regiment: 'III',
  brigade: 'X',
  division: 'XX',
  corps: 'XXX',
  army: 'XXXX',
  front: 'XXXXX',
  'army-group': 'XXXXX',
};

export interface GlyphProps {
  side: 'axis' | 'soviet';
  echelon: string;
  branch: string;
  /** Rendered width in px (height scales). Default 30. */
  size?: number;
}

export function UnitGlyph({ side, echelon, branch, size = 30 }: GlyphProps) {
  const color = COLOR[side];
  const ink = INK[side];
  const mark = ECH_MARK[echelon] ?? '';
  const stroke = { stroke: ink, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const };

  return (
    <svg
      className="orbat-glyph"
      width={size}
      height={(size * 40) / 52}
      viewBox="0 0 52 40"
      role="img"
      aria-label={`${echelon} ${branch}`}
    >
      {branch === 'hq' && <line x1={6} y1={14} x2={6} y2={5} stroke={color} strokeWidth={2} />}
      <rect x={6} y={14} width={40} height={22} rx={2} fill={FILL[side]} stroke={color} strokeWidth={2} />

      {(branch === 'infantry' || branch === 'motorized' || branch === 'mechanized') && (
        <>
          <line x1={8} y1={16} x2={44} y2={34} {...stroke} />
          <line x1={44} y1={16} x2={8} y2={34} {...stroke} />
        </>
      )}
      {(branch === 'armoured' || branch === 'mechanized') && (
        <ellipse cx={26} cy={25} rx={12} ry={6} {...stroke} />
      )}
      {branch === 'motorized' && <ellipse cx={26} cy={25} rx={8} ry={4} {...stroke} />}
      {branch === 'artillery' && <circle cx={26} cy={25} r={4.5} fill={ink} />}
      {branch === 'antitank' && <polyline points="12,32 26,16 40,32" {...stroke} />}
      {branch === 'antiair' && <path d="M14,31 A13,13 0 0 1 38,31" {...stroke} />}
      {(branch === 'recon' || branch === 'cavalry') && <line x1={10} y1={33} x2={42} y2={17} {...stroke} />}
      {branch === 'engineer' && <polyline points="14,33 14,20 38,20 38,33" {...stroke} />}
      {branch === 'signals' && <polyline points="12,32 22,18 30,32 40,18" {...stroke} />}
      {branch === 'support' && <line x1={16} y1={25} x2={36} y2={25} {...stroke} />}

      {mark && (
        <text x={26} y={11} textAnchor="middle" fontSize={9} fontWeight={800} fill={color}>
          {mark}
        </text>
      )}
    </svg>
  );
}
