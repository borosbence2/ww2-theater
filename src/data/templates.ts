// Doctrinal establishment templates (TO&E / shtat). When a formation's actual
// internal units aren't ingested (true below division), the unit panel shows the
// standard structure for its nation, type, and era instead — a "template" — now
// all the way down to squad / crew. Matched by side + echelon + type + date.
//
// Counts are representative badges, not enumerations: "Rifle Company ×3" with a
// single expandable child means "three of these, each built like this". The
// panel renders the tree collapsed below the top level, so the full depth is
// drill-down-on-click rather than hundreds of rows.
//
// These are schematic teaching templates, not exact strength returns.
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
  /** Echelon for the NATO size mark (regiment III … platoon •••, squad •). */
  ech: string;
  branch: Branch;
  label: string;
  /** How many of this component (×N badge). Default 1. */
  count?: number;
  children?: TemplateNode[];
}

export interface FormationTemplate {
  side: 'axis' | 'soviet';
  echelon: string;
  types: string[];
  from: string;
  to: string;
  name: string;
  note?: string;
  components: TemplateNode[];
}

interface Opt {
  count?: number;
  children?: TemplateNode[];
}
const n = (ech: string, branch: Branch, label: string, opt: Opt = {}): TemplateNode => ({
  ech,
  branch,
  label,
  ...opt,
});
/** Same node with a ×count badge (fresh object). */
const x = (count: number, node: TemplateNode): TemplateNode => ({ ...node, count });

// --- Reusable building blocks (down to squad / crew) -----------------------

// German rifle battalion (Type 1939): three rifle companies + a heavy company.
const deRifleBn1939 = (): TemplateNode =>
  n('battalion', 'infantry', 'Schützen-Bataillon', {
    children: [
      x(
        3,
        n('company', 'infantry', 'Schützen-Kompanie', {
          children: [
            x(
              3,
              n('platoon', 'infantry', 'Schützenzug', {
                children: [
                  x(4, n('squad', 'infantry', 'Schützengruppe · 1 le.MG')),
                  n('team', 'infantry', 'le. Granatwerfer-Trupp (5 cm)'),
                ],
              }),
            ),
            n('squad', 'infantry', 'Kompanietrupp'),
          ],
        }),
      ),
      n('company', 'infantry', 'MG-Kompanie (schwere)', {
        children: [x(2, n('platoon', 'infantry', 'sMG-Zug')), n('platoon', 'artillery', 'Granatwerfer-Zug (8 cm)')],
      }),
    ],
  });

// German grenadier battalion (Type 1944): two fewer rifle companies' worth of
// teeth, but the heavy company gains the regiment's old guns.
const deGrenadierBn1944 = (): TemplateNode =>
  n('battalion', 'infantry', 'Grenadier-Bataillon', {
    children: [
      x(
        3,
        n('company', 'infantry', 'Grenadier-Kompanie', {
          children: [
            x(
              3,
              n('platoon', 'infantry', 'Zug', {
                children: [x(4, n('squad', 'infantry', 'Gruppe · 1-2 MG42'))],
              }),
            ),
          ],
        }),
      ),
      n('company', 'infantry', 'schwere Kompanie', {
        children: [x(2, n('platoon', 'infantry', 'sMG-Zug')), n('platoon', 'artillery', 'Granatwerfer-Zug (8 cm)')],
      }),
    ],
  });

const dePzGrenBn = (): TemplateNode =>
  n('battalion', 'motorized', 'Panzergrenadier-Bataillon', {
    children: [
      x(
        3,
        n('company', 'motorized', 'Panzergrenadier-Kompanie', {
          children: [
            x(
              3,
              n('platoon', 'motorized', 'Zug', {
                children: [x(4, n('squad', 'motorized', 'Gruppe (SPW/Lkw) · 2 MG'))],
              }),
            ),
          ],
        }),
      ),
      n('company', 'motorized', 'schwere Kompanie (Geschütze/Granatwerfer)'),
    ],
  });

const dePanzerBn = (): TemplateNode =>
  n('battalion', 'armoured', 'Panzer-Abteilung', {
    children: [
      x(
        4,
        n('company', 'armoured', 'Panzer-Kompanie', {
          children: [
            x(
              4,
              n('platoon', 'armoured', 'Panzer-Zug', {
                children: [x(5, n('team', 'armoured', 'Panzer (Besatzung)'))],
              }),
            ),
          ],
        }),
      ),
    ],
  });

// German artillery battalion (Abteilung): three batteries of two gun platoons.
const deArtyBn = (): TemplateNode =>
  n('battalion', 'artillery', 'Abteilung', {
    children: [
      x(
        3,
        n('battery', 'artillery', 'Batterie', {
          children: [x(2, n('platoon', 'artillery', 'Zug', { children: [x(2, n('team', 'artillery', 'Geschütz'))] }))],
        }),
      ),
    ],
  });

// Soviet rifle battalion: three rifle companies + MG + mortar companies.
const suRifleBn = (): TemplateNode =>
  n('battalion', 'infantry', 'Rifle Battalion', {
    children: [
      x(
        3,
        n('company', 'infantry', 'Rifle Company', {
          children: [
            x(
              3,
              n('platoon', 'infantry', 'Rifle Platoon', {
                children: [x(4, n('squad', 'infantry', 'Rifle Squad · 11 men'))],
              }),
            ),
            n('platoon', 'infantry', 'Machine-Gun Platoon (Maxim)'),
          ],
        }),
      ),
      n('company', 'infantry', 'Machine-Gun Company'),
      n('company', 'artillery', 'Mortar Company (82 mm)'),
    ],
  });

const suTankBn = (): TemplateNode =>
  n('battalion', 'armoured', 'Tank Battalion', {
    children: [
      x(
        3,
        n('company', 'armoured', 'Tank Company', {
          children: [
            x(3, n('platoon', 'armoured', 'Tank Platoon', { children: [x(3, n('team', 'armoured', 'Tank & crew'))] })),
          ],
        }),
      ),
    ],
  });

const suMotorRifleBn = (): TemplateNode =>
  n('battalion', 'motorized', 'Motor Rifle Battalion', {
    children: [
      x(
        3,
        n('company', 'motorized', 'Motor Rifle Company', {
          children: [x(3, n('platoon', 'motorized', 'Platoon', { children: [x(4, n('squad', 'motorized', 'Squad'))] }))],
        }),
      ),
      n('company', 'infantry', 'Machine-Gun Company'),
    ],
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
      x(
        3,
        n('regiment', 'infantry', 'Infanterie-Regiment', {
          children: [
            x(3, deRifleBn1939()),
            n('company', 'artillery', 'Infanteriegeschütz-Kompanie (13.)'),
            n('company', 'antitank', 'Panzerabwehr-Kompanie (14.)'),
          ],
        }),
      ),
      n('regiment', 'artillery', 'Artillerie-Regiment', { children: [x(4, deArtyBn())] }),
      n('battalion', 'recon', 'Aufklärungs-Abteilung', {
        children: [n('squad', 'cavalry', 'Reiter-Schwadron'), n('squad', 'recon', 'Radfahr-Schwadron')],
      }),
      n('battalion', 'antitank', 'Panzerjäger-Abteilung', { children: [x(3, n('company', 'antitank', 'Kompanie'))] }),
      n('battalion', 'engineer', 'Pionier-Bataillon', { children: [x(3, n('company', 'engineer', 'Kompanie'))] }),
      n('battalion', 'signals', 'Nachrichten-Abteilung'),
      n('battalion', 'support', 'Divisions-Nachschub (services)'),
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
      x(
        3,
        n('regiment', 'infantry', 'Grenadier-Regiment', {
          children: [
            x(2, deGrenadierBn1944()),
            n('company', 'artillery', 'Infanteriegeschütz-Kompanie'),
            n('company', 'antitank', 'Panzerjäger-Kompanie'),
          ],
        }),
      ),
      n('regiment', 'artillery', 'Artillerie-Regiment', { children: [x(4, deArtyBn())] }),
      n('battalion', 'recon', 'Füsilier-Bataillon', { children: [x(3, n('company', 'infantry', 'Kompanie'))] }),
      n('battalion', 'antitank', 'Panzerjäger-Abteilung'),
      n('battalion', 'engineer', 'Pionier-Bataillon'),
      n('battalion', 'signals', 'Nachrichten-Abteilung'),
      n('battalion', 'support', 'Feldersatz-Bataillon'),
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
      n('regiment', 'armoured', 'Panzer-Regiment', { children: [x(2, dePanzerBn())] }),
      n('brigade', 'motorized', 'Schützen-Brigade', {
        children: [x(2, n('regiment', 'motorized', 'Schützen-Regiment', { children: [x(2, dePzGrenBn())] }))],
      }),
      n('battalion', 'recon', 'Kradschützen-Bataillon', { children: [x(3, n('company', 'recon', 'Kompanie'))] }),
      n('regiment', 'artillery', 'Artillerie-Regiment', { children: [x(3, deArtyBn())] }),
      n('battalion', 'antitank', 'Panzerjäger-Abteilung'),
      n('battalion', 'recon', 'Aufklärungs-Abteilung'),
      n('battalion', 'engineer', 'Pionier-Bataillon'),
      n('battalion', 'signals', 'Nachrichten-Abteilung'),
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
      n('regiment', 'armoured', 'Panzer-Regiment', { children: [x(2, dePanzerBn())] }),
      x(
        2,
        n('regiment', 'motorized', 'Panzergrenadier-Regiment', { children: [x(2, dePzGrenBn())] }),
      ),
      n('regiment', 'artillery', 'Panzer-Artillerie-Regiment', { children: [x(3, deArtyBn())] }),
      n('battalion', 'recon', 'Panzer-Aufklärungs-Abteilung', { children: [x(4, n('company', 'recon', 'Kompanie'))] }),
      n('battalion', 'antitank', 'Panzerjäger-Abteilung'),
      n('battalion', 'antiair', 'Heeres-Flak-Abteilung'),
      n('battalion', 'engineer', 'Panzer-Pionier-Bataillon'),
      n('battalion', 'signals', 'Panzer-Nachrichten-Abteilung'),
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
      x(2, n('regiment', 'motorized', 'Panzergrenadier-Regiment', { children: [x(3, dePzGrenBn())] })),
      n('battalion', 'armoured', 'Panzer-Abteilung', { children: dePanzerBn().children }),
      n('regiment', 'artillery', 'Artillerie-Regiment', { children: [x(3, deArtyBn())] }),
      n('battalion', 'recon', 'Aufklärungs-Abteilung'),
      n('battalion', 'antitank', 'Panzerjäger-Abteilung'),
      n('battalion', 'engineer', 'Pionier-Bataillon'),
      n('battalion', 'signals', 'Nachrichten-Abteilung'),
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
      x(
        3,
        n('regiment', 'infantry', 'Rifle Regiment', {
          children: [
            x(3, suRifleBn()),
            n('battery', 'artillery', 'Regimental Gun Battery'),
            n('battery', 'antitank', 'Anti-Tank Battery'),
          ],
        }),
      ),
      n('regiment', 'artillery', 'Artillery Regiment', { children: [x(2, n('battalion', 'artillery', 'Battalion'))] }),
      n('regiment', 'artillery', 'Howitzer Regiment', { children: [x(2, n('battalion', 'artillery', 'Battalion'))] }),
      n('battalion', 'antitank', 'Anti-Tank Battalion'),
      n('battalion', 'antiair', 'Anti-Aircraft Battalion'),
      n('battalion', 'recon', 'Reconnaissance Battalion'),
      n('battalion', 'engineer', 'Sapper Battalion'),
      n('battalion', 'signals', 'Signal Battalion'),
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
      x(3, n('regiment', 'infantry', 'Rifle Regiment', { children: [x(3, suRifleBn())] })),
      n('regiment', 'artillery', 'Artillery Regiment', { children: [x(2, n('battalion', 'artillery', 'Battalion'))] }),
      n('battalion', 'antitank', 'Anti-Tank Battalion'),
      n('company', 'recon', 'Reconnaissance Company'),
      n('battalion', 'engineer', 'Sapper Battalion'),
      n('battalion', 'signals', 'Signal Battalion'),
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
      x(3, n('regiment', 'infantry', 'Rifle Regiment', { children: [x(3, suRifleBn())] })),
      n('regiment', 'artillery', 'Artillery Regiment', { children: [x(3, n('battalion', 'artillery', 'Battalion'))] }),
      n('battalion', 'antitank', 'Anti-Tank Battalion'),
      n('company', 'recon', 'Reconnaissance Company'),
      n('battalion', 'engineer', 'Sapper Battalion'),
      n('battalion', 'signals', 'Signal Battalion'),
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
      x(
        3,
        n('regiment', 'cavalry', 'Cavalry Regiment', {
          children: [
            x(4, n('squad', 'cavalry', 'Sabre Squadron', { children: [x(4, n('platoon', 'cavalry', 'Platoon'))] })),
            n('squad', 'infantry', 'Machine-Gun Squadron'),
          ],
        }),
      ),
      n('regiment', 'armoured', 'Tank Regiment', { children: [suTankBn()] }),
      n('battalion', 'artillery', 'Horse Artillery Battalion'),
      n('battalion', 'antiair', 'Anti-Aircraft Battalion'),
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
      x(
        3,
        n('brigade', 'armoured', 'Tank Brigade', {
          children: [x(2, suTankBn()), suMotorRifleBn()],
        }),
      ),
      n('brigade', 'motorized', 'Motor Rifle Brigade', { children: [x(3, suMotorRifleBn())] }),
      n('battalion', 'recon', 'Reconnaissance Battalion'),
      x(2, n('regiment', 'artillery', 'Mortar / SP Artillery Regiment')),
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
      x(
        3,
        n('brigade', 'mechanized', 'Mechanized Brigade', {
          children: [x(3, suMotorRifleBn()), suTankBn()],
        }),
      ),
      n('brigade', 'armoured', 'Tank Brigade', { children: [x(2, suTankBn()), suMotorRifleBn()] }),
      x(2, n('regiment', 'artillery', 'Artillery / Mortar Regiment')),
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
      x(2, suTankBn()),
      suMotorRifleBn(),
      n('company', 'antiair', 'Anti-Aircraft Company'),
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
      x(3, suMotorRifleBn()),
      n('battalion', 'armoured', 'Tank Regiment', { children: suTankBn().children }),
      n('battalion', 'artillery', 'Artillery Battalion'),
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
