// Doctrinal establishment templates (TO&E / shtat). When a formation's actual
// internal units aren't ingested (true for most divisions), the unit panel
// shows the standard structure for its nation, type, and era instead — a
// "template". Matched by side + echelon + type + date; the closest era wins.
//
// These are schematic teaching templates, not exact strength returns: the aim
// is "what a 1942 German infantry division was built from", not every company.
// Sources: Niehorster (German/Soviet OOB), Soviet shtaty (штаты), Glantz.

export type Branch =
  | 'hq'
  | 'infantry'
  | 'motorized'
  | 'mechanized'
  | 'armoured'
  | 'artillery'
  | 'antitank'
  | 'antiair'
  | 'recon'
  | 'cavalry'
  | 'engineer'
  | 'signals'
  | 'support';

export interface TemplateNode {
  /** Echelon for the NATO size mark (regiment III, battalion II, …). */
  ech: string;
  branch: Branch;
  label: string;
  /** How many of this component (×N badge). Default 1. */
  count?: number;
  children?: TemplateNode[];
}

export interface FormationTemplate {
  side: 'axis' | 'soviet';
  /** Echelon this template describes (division, brigade, corps). */
  echelon: string;
  /** unit.type values it applies to. */
  types: string[];
  /** Inclusive date window [from, to] as YYYY-MM-DD. */
  from: string;
  to: string;
  /** Display name, e.g. "Infantry Division (Type 1939)". */
  name: string;
  note?: string;
  components: TemplateNode[];
}

const bn = (branch: Branch, label: string, count = 1): TemplateNode => ({
  ech: 'battalion',
  branch,
  label,
  count,
});
const coy = (branch: Branch, label: string, count = 1): TemplateNode => ({
  ech: 'company',
  branch,
  label,
  count,
});

export const TEMPLATES: FormationTemplate[] = [
  // --- German -------------------------------------------------------------
  {
    side: 'axis',
    echelon: 'division',
    types: ['infantry'],
    from: '1939-09-01',
    to: '1943-12-31',
    name: 'Infantry Division (Type 1939)',
    note: 'The pre-war "first wave" establishment: nine infantry battalions in three regiments.',
    components: [
      {
        ech: 'regiment',
        branch: 'infantry',
        label: 'Infanterie-Regiment',
        count: 3,
        children: [bn('infantry', 'Bataillon', 3)],
      },
      {
        ech: 'regiment',
        branch: 'artillery',
        label: 'Artillerie-Regiment',
        children: [bn('artillery', 'Abteilung (le./s.)', 4)],
      },
      bn('recon', 'Aufklärungs-Abteilung'),
      bn('antitank', 'Panzerjäger-Abteilung'),
      bn('engineer', 'Pionier-Bataillon'),
      bn('signals', 'Nachrichten-Abteilung'),
      bn('support', 'Divisions-Nachschub (services)'),
    ],
  },
  {
    side: 'axis',
    echelon: 'division',
    types: ['infantry'],
    from: '1944-01-01',
    to: '1945-12-31',
    name: 'Infantry Division (Type 1944)',
    note: 'Slimmed late-war establishment: six grenadier battalions; a Füsilier battalion as recon.',
    components: [
      {
        ech: 'regiment',
        branch: 'infantry',
        label: 'Grenadier-Regiment',
        count: 3,
        children: [bn('infantry', 'Bataillon', 2)],
      },
      {
        ech: 'regiment',
        branch: 'artillery',
        label: 'Artillerie-Regiment',
        children: [bn('artillery', 'Abteilung', 4)],
      },
      bn('recon', 'Füsilier-Bataillon'),
      bn('antitank', 'Panzerjäger-Abteilung'),
      bn('engineer', 'Pionier-Bataillon'),
      bn('signals', 'Nachrichten-Abteilung'),
      bn('support', 'Feldersatz-Bataillon'),
    ],
  },
  {
    side: 'axis',
    echelon: 'division',
    types: ['armoured'],
    from: '1940-01-01',
    to: '1942-12-31',
    name: 'Panzer-Division (1941)',
    note: 'Barbarossa establishment: one tank regiment, a two-regiment rifle brigade.',
    components: [
      {
        ech: 'regiment',
        branch: 'armoured',
        label: 'Panzer-Regiment',
        children: [bn('armoured', 'Panzer-Abteilung', 2)],
      },
      {
        ech: 'brigade',
        branch: 'motorized',
        label: 'Schützen-Brigade',
        children: [{ ech: 'regiment', branch: 'motorized', label: 'Schützen-Regiment', count: 2 }],
      },
      bn('recon', 'Kradschützen-Bataillon'),
      {
        ech: 'regiment',
        branch: 'artillery',
        label: 'Artillerie-Regiment',
        children: [bn('artillery', 'Abteilung', 3)],
      },
      bn('antitank', 'Panzerjäger-Abteilung'),
      bn('recon', 'Aufklärungs-Abteilung'),
      bn('engineer', 'Pionier-Bataillon'),
      bn('signals', 'Nachrichten-Abteilung'),
    ],
  },
  {
    side: 'axis',
    echelon: 'division',
    types: ['armoured'],
    from: '1943-01-01',
    to: '1945-12-31',
    name: 'Panzer-Division (1943/44)',
    note: 'Two panzergrenadier regiments around one tank regiment, with organic Flak.',
    components: [
      {
        ech: 'regiment',
        branch: 'armoured',
        label: 'Panzer-Regiment',
        children: [bn('armoured', 'Panzer-Abteilung', 2)],
      },
      {
        ech: 'regiment',
        branch: 'motorized',
        label: 'Panzergrenadier-Regiment',
        count: 2,
        children: [bn('motorized', 'Bataillon', 2)],
      },
      {
        ech: 'regiment',
        branch: 'artillery',
        label: 'Panzer-Artillerie-Regiment',
        children: [bn('artillery', 'Abteilung', 3)],
      },
      bn('recon', 'Panzer-Aufklärungs-Abteilung'),
      bn('antitank', 'Panzerjäger-Abteilung'),
      bn('antiair', 'Heeres-Flak-Abteilung'),
      bn('engineer', 'Panzer-Pionier-Bataillon'),
      bn('signals', 'Panzer-Nachrichten-Abteilung'),
    ],
  },
  {
    side: 'axis',
    echelon: 'division',
    types: ['motorized'],
    from: '1940-01-01',
    to: '1945-12-31',
    name: 'Panzergrenadier-/Motorized Division',
    components: [
      {
        ech: 'regiment',
        branch: 'motorized',
        label: 'Panzergrenadier-Regiment',
        count: 2,
        children: [bn('motorized', 'Bataillon', 3)],
      },
      bn('armoured', 'Panzer-Abteilung'),
      {
        ech: 'regiment',
        branch: 'artillery',
        label: 'Artillerie-Regiment',
        children: [bn('artillery', 'Abteilung', 3)],
      },
      bn('recon', 'Aufklärungs-Abteilung'),
      bn('antitank', 'Panzerjäger-Abteilung'),
      bn('engineer', 'Pionier-Bataillon'),
      bn('signals', 'Nachrichten-Abteilung'),
    ],
  },
  // --- Soviet -------------------------------------------------------------
  {
    side: 'soviet',
    echelon: 'division',
    types: ['infantry'],
    from: '1939-09-01',
    to: '1941-07-28',
    name: 'Rifle Division (shtat 04/400, 1941)',
    note: 'Pre-war establishment: three rifle regiments and two artillery regiments.',
    components: [
      {
        ech: 'regiment',
        branch: 'infantry',
        label: 'Rifle Regiment',
        count: 3,
        children: [bn('infantry', 'Rifle Battalion', 3)],
      },
      { ech: 'regiment', branch: 'artillery', label: 'Artillery Regiment' },
      { ech: 'regiment', branch: 'artillery', label: 'Howitzer Regiment' },
      bn('antitank', 'Anti-Tank Battalion'),
      bn('antiair', 'Anti-Aircraft Battalion'),
      bn('recon', 'Reconnaissance Battalion'),
      bn('engineer', 'Sapper Battalion'),
      bn('signals', 'Signal Battalion'),
    ],
  },
  {
    side: 'soviet',
    echelon: 'division',
    types: ['infantry'],
    from: '1941-07-29',
    to: '1942-12-31',
    name: 'Rifle Division (shtat 04/300, late 1941)',
    note: 'Cut down after the summer catastrophe: one artillery regiment, recon reduced to a company.',
    components: [
      {
        ech: 'regiment',
        branch: 'infantry',
        label: 'Rifle Regiment',
        count: 3,
        children: [bn('infantry', 'Rifle Battalion', 3)],
      },
      { ech: 'regiment', branch: 'artillery', label: 'Artillery Regiment' },
      bn('antitank', 'Anti-Tank Battalion'),
      coy('recon', 'Reconnaissance Company'),
      bn('engineer', 'Sapper Battalion'),
      bn('signals', 'Signal Battalion'),
    ],
  },
  {
    side: 'soviet',
    echelon: 'division',
    types: ['infantry'],
    from: '1943-01-01',
    to: '1945-12-31',
    name: 'Rifle Division (shtat 04/550, 1943)',
    note: 'The standard mid/late-war division; Guards divisions followed an uprated version.',
    components: [
      {
        ech: 'regiment',
        branch: 'infantry',
        label: 'Rifle Regiment',
        count: 3,
        children: [bn('infantry', 'Rifle Battalion', 3)],
      },
      { ech: 'regiment', branch: 'artillery', label: 'Artillery Regiment' },
      bn('antitank', 'Anti-Tank Battalion'),
      coy('recon', 'Reconnaissance Company'),
      bn('engineer', 'Sapper Battalion'),
      bn('signals', 'Signal Battalion'),
    ],
  },
  {
    side: 'soviet',
    echelon: 'division',
    types: ['cavalry'],
    from: '1941-01-01',
    to: '1945-12-31',
    name: 'Cavalry Division',
    components: [
      { ech: 'regiment', branch: 'cavalry', label: 'Cavalry Regiment', count: 3 },
      { ech: 'regiment', branch: 'armoured', label: 'Tank Regiment' },
      bn('artillery', 'Horse Artillery Battalion'),
      bn('antiair', 'Anti-Aircraft Battalion'),
    ],
  },
  {
    side: 'soviet',
    echelon: 'corps',
    types: ['armoured'],
    from: '1942-03-01',
    to: '1945-12-31',
    name: 'Tank Corps (1942)',
    note: 'A division-sized strike formation: three tank brigades and a motor rifle brigade.',
    components: [
      { ech: 'brigade', branch: 'armoured', label: 'Tank Brigade', count: 3 },
      { ech: 'brigade', branch: 'motorized', label: 'Motor Rifle Brigade' },
      bn('recon', 'Reconnaissance Battalion'),
      { ech: 'regiment', branch: 'artillery', label: 'Mortar / SP Artillery Regiment', count: 2 },
    ],
  },
  {
    side: 'soviet',
    echelon: 'corps',
    types: ['motorized', 'mechanized'],
    from: '1942-09-01',
    to: '1945-12-31',
    name: 'Mechanized Corps (1942)',
    components: [
      { ech: 'brigade', branch: 'mechanized', label: 'Mechanized Brigade', count: 3 },
      { ech: 'brigade', branch: 'armoured', label: 'Tank Brigade' },
      { ech: 'regiment', branch: 'artillery', label: 'Artillery / Mortar Regiment', count: 2 },
    ],
  },
  {
    side: 'soviet',
    echelon: 'brigade',
    types: ['armoured'],
    from: '1942-01-01',
    to: '1945-12-31',
    name: 'Tank Brigade (1942)',
    components: [
      bn('armoured', 'Tank Battalion', 2),
      bn('motorized', 'Motor Rifle Battalion'),
      coy('antiair', 'Anti-Aircraft Company'),
    ],
  },
  {
    side: 'soviet',
    echelon: 'brigade',
    types: ['motorized', 'mechanized'],
    from: '1942-01-01',
    to: '1945-12-31',
    name: 'Mechanized / Motor Rifle Brigade',
    components: [
      bn('motorized', 'Motor Rifle Battalion', 3),
      bn('armoured', 'Tank Regiment'),
      bn('artillery', 'Artillery Battalion'),
    ],
  },
];

/** Best-matching template for a unit, or null. Type match beats wildcard; among
 *  date-valid candidates the latest `from` wins (closest preceding era). */
export function matchTemplate(
  side: 'axis' | 'soviet',
  echelon: string,
  type: string,
  dateISO: string,
): FormationTemplate | null {
  const inWindow = TEMPLATES.filter(
    (t) =>
      t.side === side &&
      t.echelon === echelon &&
      (t.types.includes(type) || t.types.includes('*')) &&
      dateISO >= t.from &&
      dateISO <= t.to,
  );
  if (inWindow.length) {
    return inWindow.sort((a, b) => b.from.localeCompare(a.from))[0];
  }
  // No date-valid template: fall back to the nearest era for this type so a
  // unit selected outside the curated windows still shows a sensible structure.
  const anyEra = TEMPLATES.filter(
    (t) => t.side === side && t.echelon === echelon && (t.types.includes(type) || t.types.includes('*')),
  );
  return anyEra.sort((a, b) => b.from.localeCompare(a.from))[0] ?? null;
}
