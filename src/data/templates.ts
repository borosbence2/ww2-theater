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
  | 'mountain'
  | 'airborne'
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

export interface EquipItem {
  name: string;
  count: number;
}

export interface FormationTemplate {
  side: 'axis' | 'soviet';
  /** Nation (id prefix: ro/hu/it/fi/bg/yu/gr/gb…). Omitted = the side default
   *  (German for axis, Soviet for soviet), used as the fallback when no
   *  nation-specific template matches. */
  nation?: string;
  /** Optional sub-variant gate: a regex (as a string) the unit id must match for
   *  this template to apply (e.g. 'guards', '-ss-', 'ja[e]?ger'). A variant
   *  template is preferred over the generic one of the same nation/side. */
  idMatch?: string;
  echelon: string;
  types: string[];
  from: string;
  to: string;
  name: string;
  note?: string;
  components: TemplateNode[];
  /** Nominal establishment strength (personnel), TO&E — not an actual return. */
  strength?: number;
  /** Key authorised weapons/vehicles (nominal counts), for the quantitative view. */
  equipment?: EquipItem[];
  /** Equipment-catalog ids (equipment.ts) of the notable weapons/vehicles this
   *  formation fielded — resolved to specs + links in the panel. */
  equipmentRefs?: string[];
}

// Nominal establishment strength + key equipment per template, keyed by name.
// TO&E "paper" figures (Niehorster / Soviet shtaty / Glantz & House) — what the
// formation was *meant* to field, not a strength return on any given day.
const ESTABLISHMENT: Record<string, { strength?: number; equipment?: EquipItem[]; equipmentRefs?: string[] }> = {
  'Infantry Division (Type 1939)': {
    strength: 17734,
    equipment: [
      { name: 'Rifles & carbines', count: 12609 },
      { name: 'Light MG (MG 34)', count: 378 },
      { name: 'Heavy MG', count: 138 },
      { name: '8 cm mortars', count: 54 },
      { name: '3.7 cm PaK', count: 75 },
      { name: '10.5 cm leFH', count: 36 },
      { name: '15 cm sFH', count: 12 },
      { name: 'Horses', count: 4842 },
    ],
  },
  'Infantry Division (Type 1944)': {
    strength: 12769,
    equipment: [
      { name: 'Rifles & carbines', count: 9069 },
      { name: 'MG 42', count: 566 },
      { name: '8 cm mortars', count: 48 },
      { name: '7.5 cm PaK', count: 21 },
      { name: '10.5 cm leFH', count: 36 },
      { name: '15 cm sFH', count: 12 },
    ],
  },
  'Panzer-Division (1941)': {
    strength: 16932,
    equipment: [
      { name: 'Tanks (Pz II/III/IV)', count: 196 },
      { name: 'Armoured cars', count: 90 },
      { name: '3.7/5 cm PaK', count: 51 },
      { name: '10.5 cm leFH', count: 24 },
    ],
  },
  'Panzer-Division (1943/44)': {
    strength: 14727,
    equipment: [
      { name: 'Tanks (Pz IV/Panther)', count: 160 },
      { name: 'StuG / Panzerjäger', count: 21 },
      { name: 'Field howitzers', count: 42 },
      { name: 'Flak (2 cm/8.8 cm)', count: 63 },
    ],
  },
  'Panzergrenadier-/Motorized Division': {
    strength: 14000,
    equipment: [
      { name: 'Tanks / StuG', count: 48 },
      { name: 'Armoured cars', count: 25 },
      { name: 'Field howitzers', count: 36 },
    ],
  },
  'Rifle Division (shtat 04/400, 1941)': {
    strength: 14483,
    equipment: [
      { name: 'Rifles & carbines', count: 10420 },
      { name: 'Light & heavy MG', count: 558 },
      { name: 'Mortars (50/82/120 mm)', count: 150 },
      { name: '45 mm AT guns', count: 54 },
      { name: '76 mm guns', count: 34 },
      { name: '122/152 mm howitzers', count: 44 },
      { name: 'Horses', count: 3039 },
    ],
  },
  'Rifle Division (shtat 04/300, late 1941)': {
    strength: 11626,
    equipment: [
      { name: 'Rifles & carbines', count: 8341 },
      { name: 'Mortars', count: 78 },
      { name: '45 mm AT guns', count: 18 },
      { name: '76 mm guns', count: 28 },
      { name: '122 mm howitzers', count: 8 },
    ],
  },
  'Rifle Division (shtat 04/550, 1943)': {
    strength: 9380,
    equipment: [
      { name: 'Rifles & carbines', count: 6330 },
      { name: 'SMG (PPSh)', count: 2010 },
      { name: 'Mortars', count: 136 },
      { name: '45 mm AT guns', count: 48 },
      { name: '76 mm guns', count: 44 },
      { name: '122 mm howitzers', count: 12 },
    ],
  },
  'Cavalry Division': {
    strength: 9240,
    equipment: [
      { name: 'Horses', count: 8000 },
      { name: 'Mortars', count: 64 },
      { name: '76 mm guns', count: 8 },
    ],
  },
  'Tank Corps (1942)': {
    strength: 7800,
    equipment: [
      { name: 'Tanks (T-34/T-70)', count: 168 },
      { name: 'Guns & mortars', count: 52 },
      { name: 'Armoured cars', count: 8 },
    ],
  },
  'Mechanized Corps (1942)': {
    strength: 13559,
    equipment: [
      { name: 'Tanks', count: 175 },
      { name: 'Guns & mortars', count: 100 },
    ],
  },
  'Tank Brigade (1942)': {
    strength: 1107,
    equipment: [
      { name: 'Tanks (T-34/T-70)', count: 53 },
      { name: 'AT rifles', count: 12 },
    ],
  },
  'Mechanized / Motor Rifle Brigade': {
    strength: 3500,
    equipment: [
      { name: 'Tanks (mech bde)', count: 39 },
      { name: 'Guns & mortars', count: 36 },
    ],
  },
  // Minor powers — nominal establishment (paper) strengths.
  'Romanian Infantry Division': { strength: 17500 },
  'Romanian Cavalry Division': { strength: 6500 },
  'Hungarian Infantry Division (honvéd)': { strength: 13000 },
  'Hungarian Cavalry Division (huszár)': { strength: 6000 },
  'Hungarian Armoured Division (páncéloshadosztály)': { strength: 12000 },
  'Italian Infantry Division (binary)': { strength: 13000 },
  'Italian Armoured Division': { strength: 8600 },
  'Italian Motorized Division': { strength: 10500 },
  'Finnish Infantry Division': { strength: 14200 },
  'Finnish Cavalry Brigade': { strength: 3500 },
  'Bulgarian Infantry Division': { strength: 15000 },
  'Royal Yugoslav Infantry Division': { strength: 26000 },
  'Partisan Division (NOVJ)': { strength: 4000 },
  'Greek Infantry Division': { strength: 18000 },
  'British/Commonwealth Infantry Division': { strength: 18347 },
  'Gebirgs-Division (mountain)': { strength: 13000 },
  'Italian Alpine Division': { strength: 14000 },
  'Romanian Mountain Division (vânători de munte)': { strength: 12000 },
  'Soviet Mountain Rifle Division': { strength: 9000 },
  'Guards Rifle Division': { strength: 10500 },
  'SS-Panzer-Division': { strength: 19000 },
  'SS-Panzergrenadier-Division': { strength: 15000 },
  'Jäger-Division (light)': { strength: 12700 },
  'Hungarian Light Division (könnyű hadosztály)': { strength: 10000 },
  'Fallschirmjäger-Division': { strength: 16000 },
  'Airborne / Guards Airborne Division': { strength: 10000 },
  'Alpine Division "Julia"': { strength: 16000 },
  'Alpine Division "Tridentina"': { strength: 16000 },
  'Alpine Division "Cuneense"': { strength: 15000 },
  '1st SS-Panzer-Division "Leibstandarte"': { strength: 21000 },
  '2nd SS-Panzer-Division "Das Reich"': { strength: 21000 },
  '3rd SS-Panzer-Division "Totenkopf"': { strength: 21000 },
  '5th SS-Panzer-Division "Wiking"': { strength: 19000 },
  '12th SS-Panzer-Division "Hitlerjugend"': { strength: 20000 },
  'Fallschirm-Panzer-Division "Hermann Göring"': { strength: 18000 },
};

// Notable equipment a formation fielded, as equipment-catalog ids (equipment.ts).
// Resolved to specs + Wikipedia links in the panel's Equipment section.
const EQUIP_REFS: Record<string, string[]> = {
  'Infantry Division (Type 1939)': ['kar98k', 'mg34', 'gw-34', 'pak-36', 'lefh-18', 'sfh-18'],
  'Infantry Division (Type 1944)': ['kar98k', 'mg42', 'gw-34', 'pak-40', 'lefh-18', 'sfh-18'],
  'Panzer-Division (1941)': ['pz-ii', 'pz-iii', 'pz-iv', 'sdkfz-251', 'sdkfz-222', 'pak-36', 'lefh-18', 'flak-88'],
  'Panzer-Division (1943/44)': ['pz-iv', 'panther', 'stug-iii', 'sdkfz-251', 'lefh-18', 'pak-40', 'flak-88'],
  'Panzergrenadier-/Motorized Division': ['pz-iv', 'stug-iii', 'sdkfz-251', 'sdkfz-222', 'lefh-18', 'pak-40'],
  'Rifle Division (shtat 04/400, 1941)': ['mosin', 'dp-28', '82-bm-37', '120-pm-38', '45mm-m37', 'zis-3', 'm-30', 'ml-20', 'ptrd'],
  'Rifle Division (shtat 04/300, late 1941)': ['mosin', 'dp-28', '82-bm-37', '45mm-m37', 'zis-3', 'm-30'],
  'Rifle Division (shtat 04/550, 1943)': ['mosin', 'ppsh', 'dp-28', '82-bm-37', '120-pm-38', '45mm-m37', 'zis-3', 'm-30', 'ptrd'],
  'Cavalry Division': ['mosin', 'ppsh', '82-bm-37', 'zis-3'],
  'Tank Corps (1942)': ['t-34', 't-70', 'ba-64', 'zis-3'],
  'Mechanized Corps (1942)': ['t-34', 't-70', 'zis-3', 'ppsh'],
  'Tank Brigade (1942)': ['t-34', 't-70', 'ptrd'],
  'Mechanized / Motor Rifle Brigade': ['t-34', 'ppsh', 'zis-3', 'ptrd'],
};

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

// --- Minor-power rifle battalions (native terminology) ----------------------
const roInfBn = (): TemplateNode =>
  n('battalion', 'infantry', 'Batalion de infanterie', {
    children: [
      x(3, n('company', 'infantry', 'Companie de infanterie', {
        children: [x(3, n('platoon', 'infantry', 'Pluton', { children: [x(3, n('squad', 'infantry', 'Grupă · 1 ZB-30'))] }))],
      })),
      n('company', 'infantry', 'Companie de mitraliere'),
    ],
  });
const huInfBn = (): TemplateNode =>
  n('battalion', 'infantry', 'Zászlóalj', {
    children: [
      x(3, n('company', 'infantry', 'Század', {
        children: [x(3, n('platoon', 'infantry', 'Szakasz', { children: [x(3, n('squad', 'infantry', 'Raj · 1 golyószóró'))] }))],
      })),
      n('company', 'infantry', 'Géppuskás század'),
    ],
  });
const itInfBn = (): TemplateNode =>
  n('battalion', 'infantry', 'Battaglione', {
    children: [
      x(3, n('company', 'infantry', 'Compagnia', {
        children: [x(3, n('platoon', 'infantry', 'Plotone', { children: [x(2, n('squad', 'infantry', 'Squadra · 1 Breda 30'))] }))],
      })),
      n('company', 'infantry', 'Compagnia mitraglieri'),
    ],
  });
const fiInfBn = (): TemplateNode =>
  n('battalion', 'infantry', 'Pataljoona', {
    children: [
      x(3, n('company', 'infantry', 'Komppania', {
        children: [x(3, n('platoon', 'infantry', 'Joukkue', { children: [x(4, n('squad', 'infantry', 'Ryhmä · 1 pikakivääri'))] }))],
      })),
      n('company', 'infantry', 'Konekiväärikomppania'),
    ],
  });
const bgInfBn = (): TemplateNode =>
  n('battalion', 'infantry', 'Дружина', {
    children: [
      x(3, n('company', 'infantry', 'Рота', {
        children: [x(3, n('platoon', 'infantry', 'Взвод', { children: [x(3, n('squad', 'infantry', 'Отделение'))] }))],
      })),
      n('company', 'infantry', 'Картечна рота'),
    ],
  });
// --- Allied minor powers ----------------------------------------------------
const yuRoyalBn = (): TemplateNode =>
  n('battalion', 'infantry', 'Bataljon', {
    children: [
      x(3, n('company', 'infantry', 'Četa', {
        children: [x(3, n('platoon', 'infantry', 'Vod', { children: [x(3, n('squad', 'infantry', 'Odeljenje'))] }))],
      })),
      n('company', 'infantry', 'Mitraljeska četa'),
    ],
  });
const yuPartisanBde = (): TemplateNode =>
  n('brigade', 'infantry', 'Brigada', {
    children: [
      x(4, n('battalion', 'infantry', 'Bataljon', {
        children: [x(3, n('company', 'infantry', 'Četa', { children: [x(3, n('platoon', 'infantry', 'Vod'))] }))],
      })),
    ],
  });
const grBn = (): TemplateNode =>
  n('battalion', 'infantry', 'Τάγμα', {
    children: [
      x(3, n('company', 'infantry', 'Λόχος', {
        children: [x(3, n('platoon', 'infantry', 'Διμοιρία', { children: [x(3, n('squad', 'infantry', 'Ομάδα'))] }))],
      })),
      n('company', 'infantry', 'Λόχος Πολυβόλων'),
    ],
  });
const gbBn = (): TemplateNode =>
  n('battalion', 'infantry', 'Infantry Battalion', {
    children: [
      x(4, n('company', 'infantry', 'Rifle Company', {
        children: [x(3, n('platoon', 'infantry', 'Platoon', { children: [x(3, n('squad', 'infantry', 'Section · 1 Bren'))] }))],
      })),
      n('company', 'infantry', 'Support Company'),
    ],
  });
// --- Mountain troops (Gebirgsjäger / Alpini / vânători de munte / горнострелки) ---
const deGebJgBn = (): TemplateNode =>
  n('battalion', 'mountain', 'Gebirgsjäger-Bataillon', {
    children: [
      x(3, n('company', 'mountain', 'Gebirgsjäger-Kompanie', {
        children: [x(3, n('platoon', 'mountain', 'Zug', { children: [x(3, n('squad', 'mountain', 'Gruppe · 1 le.MG'))] }))],
      })),
      n('company', 'infantry', 'MG-Kompanie (schwere)'),
    ],
  });
const itAlpBn = (): TemplateNode =>
  n('battalion', 'mountain', 'Battaglione Alpini', {
    children: [
      x(3, n('company', 'mountain', 'Compagnia Alpini', {
        children: [x(3, n('platoon', 'mountain', 'Plotone', { children: [x(2, n('squad', 'mountain', 'Squadra'))] }))],
      })),
      n('company', 'infantry', 'Compagnia armi (mortai)'),
    ],
  });
const roVmBn = (): TemplateNode =>
  n('battalion', 'mountain', 'Batalion de vânători de munte', {
    children: [
      x(3, n('company', 'mountain', 'Companie de vânători de munte', {
        children: [x(3, n('platoon', 'mountain', 'Pluton', { children: [x(3, n('squad', 'mountain', 'Grupă'))] }))],
      })),
    ],
  });
const suMtnBn = (): TemplateNode =>
  n('battalion', 'mountain', 'Mountain Rifle Battalion', {
    children: [
      x(3, n('company', 'mountain', 'Mountain Rifle Company', {
        children: [x(3, n('platoon', 'mountain', 'Platoon', { children: [x(3, n('squad', 'mountain', 'Squad'))] }))],
      })),
    ],
  });
// --- Sub-variant building blocks (Guards / Waffen-SS / Jäger / airborne) -----
const suGdRifleBn = (): TemplateNode =>
  n('battalion', 'infantry', 'Guards Rifle Battalion', {
    children: [
      x(3, n('company', 'infantry', 'Guards Rifle Company', {
        children: [
          x(3, n('platoon', 'infantry', 'Rifle Platoon', { children: [x(4, n('squad', 'infantry', 'Rifle Squad'))] })),
          n('platoon', 'infantry', 'SMG Platoon (PPSh)'),
        ],
      })),
      n('company', 'infantry', 'Machine-Gun Company'),
      n('company', 'artillery', 'Mortar Company (82 mm)'),
    ],
  });
const ssPzGrenBn = (): TemplateNode =>
  n('battalion', 'motorized', 'SS-Panzergrenadier-Bataillon', {
    children: [
      x(3, n('company', 'motorized', 'SS-Panzergrenadier-Kompanie', {
        children: [x(3, n('platoon', 'motorized', 'Zug', { children: [x(4, n('squad', 'motorized', 'Gruppe (SPW) · 2 MG'))] }))],
      })),
      n('company', 'motorized', 'schwere Kompanie'),
    ],
  });
const deFJBn = (): TemplateNode =>
  n('battalion', 'airborne', 'Fallschirmjäger-Bataillon', {
    children: [
      x(3, n('company', 'airborne', 'Fallschirmjäger-Kompanie', {
        children: [x(3, n('platoon', 'airborne', 'Zug', { children: [x(3, n('squad', 'airborne', 'Gruppe · 2 MG42'))] }))],
      })),
      n('company', 'airborne', 'schwere Kompanie'),
    ],
  });
const suAbnBn = (): TemplateNode =>
  n('battalion', 'airborne', 'Airborne Battalion', {
    children: [
      x(3, n('company', 'airborne', 'Airborne Company', {
        children: [x(3, n('platoon', 'airborne', 'Platoon', { children: [x(3, n('squad', 'airborne', 'Squad'))] }))],
      })),
      n('company', 'infantry', 'Machine-Gun Company'),
    ],
  });
// A named Alpini battalion (battalions carry their home-valley/town name).
const alpBn = (name: string): TemplateNode =>
  n('battalion', 'mountain', `Btg. Alpini "${name}"`, { children: itAlpBn().children });
const alpRgt = (num: string, bns: string[]): TemplateNode =>
  n('regiment', 'mountain', `${num} Reggimento Alpini`, { children: bns.map(alpBn) });
// A named (Waffen-SS / elite) panzergrenadier regiment.
const ssPzGrenRgt = (label: string): TemplateNode =>
  n('regiment', 'motorized', label, { children: [x(3, ssPzGrenBn())] });
// Common elite-panzer divisional tail (artillery + the divisional battalions).
const elitePzTail = (prefix: string): TemplateNode[] => [
  n('regiment', 'artillery', `${prefix}-Artillerie-Regiment`, { children: [x(3, deArtyBn())] }),
  n('battalion', 'recon', `${prefix}-Aufklärungs-Abteilung`),
  n('battalion', 'antitank', `${prefix}-Panzerjäger-Abteilung`),
  n('battalion', 'antiair', `${prefix}-Flak-Abteilung`),
  n('battalion', 'engineer', `${prefix}-Pionier-Bataillon`),
];

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
  // --- Romania (Armata Română) -------------------------------------------
  {
    side: 'axis', nation: 'ro', echelon: 'division', types: ['infantry'], from: '1941-01-01', to: '1945-12-31',
    name: 'Romanian Infantry Division',
    note: 'Three infantry regiments (some "Dorobanți" territorial) and two artillery regiments — French-pattern.',
    components: [
      x(3, n('regiment', 'infantry', 'Regiment de Infanterie', {
        children: [x(3, roInfBn()), n('company', 'artillery', 'Companie de artilerie'), n('company', 'antitank', 'Companie anticar')],
      })),
      x(2, n('regiment', 'artillery', 'Regiment de Artilerie', { children: [x(3, n('battalion', 'artillery', 'Divizion'))] })),
      n('battalion', 'recon', 'Escadron de cercetare'),
      n('battalion', 'antitank', 'Divizion anticar'),
      n('battalion', 'engineer', 'Batalion de pionieri'),
      n('battalion', 'signals', 'Companie de transmisiuni'),
    ],
  },
  {
    side: 'axis', nation: 'ro', echelon: 'division', types: ['cavalry'], from: '1941-01-01', to: '1945-12-31',
    name: 'Romanian Cavalry Division',
    note: 'Roșiori (line) and Călărași (territorial) cavalry regiments with horse artillery.',
    components: [
      x(3, n('regiment', 'cavalry', 'Regiment de Roșiori / Călărași', {
        children: [x(4, n('squad', 'cavalry', 'Escadron', { children: [x(3, n('platoon', 'cavalry', 'Pluton'))] }))],
      })),
      n('regiment', 'artillery', 'Regiment de Artilerie Călăreață', { children: [x(2, n('battalion', 'artillery', 'Divizion'))] }),
      n('battalion', 'recon', 'Escadron blindat (care de luptă)'),
      n('battalion', 'antitank', 'Divizion anticar'),
    ],
  },
  // --- Hungary (Honvédség) ------------------------------------------------
  {
    side: 'axis', nation: 'hu', echelon: 'division', types: ['infantry'], from: '1941-01-01', to: '1945-12-31',
    name: 'Hungarian Infantry Division (honvéd)',
    note: 'Honvéd division: three infantry regiments (two in the early "light divisions") around an artillery regiment.',
    components: [
      x(3, n('regiment', 'infantry', 'Gyalogezred', {
        children: [x(3, huInfBn()), n('company', 'artillery', 'Ágyús üteg'), n('company', 'antitank', 'Páncéltörő század')],
      })),
      n('regiment', 'artillery', 'Tüzérezred', { children: [x(3, n('battalion', 'artillery', 'Osztály'))] }),
      n('battalion', 'recon', 'Felderítő-zászlóalj'),
      n('battalion', 'antitank', 'Páncéltörő-osztály'),
      n('battalion', 'engineer', 'Utászzászlóalj'),
      n('battalion', 'signals', 'Híradó-század'),
    ],
  },
  {
    side: 'axis', nation: 'hu', echelon: 'division', types: ['cavalry'], from: '1941-01-01', to: '1945-12-31',
    name: 'Hungarian Cavalry Division (huszár)',
    components: [
      x(3, n('regiment', 'cavalry', 'Huszárezred', { children: [x(4, n('squad', 'cavalry', 'Lovasszázad'))] })),
      n('battalion', 'armoured', 'Harckocsi-zászlóalj'),
      n('regiment', 'artillery', 'Lovastüzér-osztály'),
      n('battalion', 'recon', 'Kerékpáros-zászlóalj'),
    ],
  },
  {
    side: 'axis', nation: 'hu', echelon: 'division', types: ['armoured'], from: '1941-01-01', to: '1945-12-31',
    name: 'Hungarian Armoured Division (páncéloshadosztály)',
    components: [
      n('regiment', 'armoured', 'Harckocsiezred', { children: [x(2, n('battalion', 'armoured', 'Harckocsizászlóalj'))] }),
      x(2, n('regiment', 'motorized', 'Gépkocsizó lövészezred', { children: [x(3, huInfBn())] })),
      n('regiment', 'artillery', 'Gépvontatású tüzérezred', { children: [x(3, n('battalion', 'artillery', 'Osztály'))] }),
      n('battalion', 'recon', 'Felderítő-zászlóalj'),
      n('battalion', 'antiair', 'Légvédelmi gépágyús osztály'),
    ],
  },
  // --- Italy (Regio Esercito) --------------------------------------------
  {
    side: 'axis', nation: 'it', echelon: 'division', types: ['infantry'], from: '1940-01-01', to: '1945-12-31',
    name: 'Italian Infantry Division (binary)',
    note: 'The 1938 "binary" division — only TWO infantry regiments, plus an attached Blackshirt (CC.NN.) legion.',
    components: [
      x(2, n('regiment', 'infantry', 'Reggimento di Fanteria', {
        children: [x(3, itInfBn()), n('company', 'artillery', 'Compagnia cannoni (65/17)'), n('company', 'antitank', 'Compagnia controcarri (47/32)')],
      })),
      n('regiment', 'artillery', 'Reggimento di Artiglieria', { children: [x(3, n('battalion', 'artillery', 'Gruppo'))] }),
      n('regiment', 'infantry', 'Legione CC.NN. (Camicie Nere)', { children: [x(2, n('battalion', 'infantry', 'Battaglione CC.NN.'))] }),
      n('battalion', 'infantry', 'Battaglione mortai (81)'),
      n('battalion', 'engineer', 'Battaglione genio'),
    ],
  },
  {
    side: 'axis', nation: 'it', echelon: 'division', types: ['armoured'], from: '1940-01-01', to: '1945-12-31',
    name: 'Italian Armoured Division',
    components: [
      n('regiment', 'armoured', 'Reggimento Fanteria Carrista', { children: [x(3, n('battalion', 'armoured', 'Battaglione carri'))] }),
      n('regiment', 'motorized', 'Reggimento Bersaglieri', { children: [x(3, n('battalion', 'motorized', 'Battaglione bersaglieri'))] }),
      n('regiment', 'artillery', 'Reggimento Artiglieria', { children: [x(3, n('battalion', 'artillery', 'Gruppo'))] }),
      n('battalion', 'recon', 'Gruppo esplorante (autoblindo)'),
    ],
  },
  {
    side: 'axis', nation: 'it', echelon: 'division', types: ['motorized'], from: '1940-01-01', to: '1945-12-31',
    name: 'Italian Motorized Division',
    components: [
      x(2, n('regiment', 'infantry', 'Reggimento di Fanteria (autotrasportabile)', { children: [x(3, itInfBn())] })),
      n('regiment', 'infantry', 'Reggimento Bersaglieri'),
      n('regiment', 'artillery', 'Reggimento di Artiglieria', { children: [x(3, n('battalion', 'artillery', 'Gruppo'))] }),
      n('battalion', 'engineer', 'Battaglione genio'),
    ],
  },
  // --- Finland (Maavoimat) -----------------------------------------------
  {
    side: 'axis', nation: 'fi', echelon: 'division', types: ['infantry'], from: '1941-01-01', to: '1945-12-31',
    name: 'Finnish Infantry Division',
    note: 'Three infantry regiments (JR) and a field artillery regiment.',
    components: [
      x(3, n('regiment', 'infantry', 'Jalkaväkirykmentti (JR)', { children: [x(3, fiInfBn())] })),
      n('regiment', 'artillery', 'Kenttätykistörykmentti', { children: [x(3, n('battalion', 'artillery', 'Patteristo'))] }),
      n('battalion', 'recon', 'Erillinen pataljoona (jääkäri)'),
      n('battalion', 'antitank', 'Panssarintorjuntakomppania'),
      n('battalion', 'engineer', 'Pioneeripataljoona'),
    ],
  },
  {
    side: 'axis', nation: 'fi', echelon: 'brigade', types: ['cavalry'], from: '1941-01-01', to: '1945-12-31',
    name: 'Finnish Cavalry Brigade',
    components: [
      x(2, n('regiment', 'cavalry', 'Ratsuväkirykmentti', { children: [x(4, n('squad', 'cavalry', 'Eskadroona'))] })),
      n('battalion', 'artillery', 'Ratsastava patteristo'),
    ],
  },
  // --- Bulgaria -----------------------------------------------------------
  {
    side: 'soviet', nation: 'bg', echelon: 'division', types: ['infantry'], from: '1941-01-01', to: '1945-12-31',
    name: 'Bulgarian Infantry Division',
    note: 'Three infantry regiments and an artillery regiment.',
    components: [
      x(3, n('regiment', 'infantry', 'Пехотен полк', { children: [x(3, bgInfBn())] })),
      n('regiment', 'artillery', 'Артилерийски полк', { children: [x(3, n('battalion', 'artillery', 'Дивизион'))] }),
      n('battalion', 'recon', 'Разузнавателен отряд'),
      n('battalion', 'engineer', 'Пионерна дружина'),
    ],
  },
  // --- Yugoslavia ---------------------------------------------------------
  {
    side: 'soviet', nation: 'yu', echelon: 'division', types: ['infantry'], from: '1941-01-01', to: '1941-12-31',
    name: 'Royal Yugoslav Infantry Division',
    note: 'Large French-pattern division: three infantry regiments and an artillery regiment.',
    components: [
      x(3, n('regiment', 'infantry', 'Pešadijski puk', { children: [x(3, yuRoyalBn())] })),
      n('regiment', 'artillery', 'Artiljerijski puk', { children: [x(2, n('battalion', 'artillery', 'Divizion'))] }),
      n('battalion', 'cavalry', 'Konjički eskadron'),
      n('battalion', 'engineer', 'Pionirski bataljon'),
    ],
  },
  {
    side: 'soviet', nation: 'yu', echelon: 'division', types: ['infantry'], from: '1942-01-01', to: '1945-12-31',
    name: 'Partisan Division (NOVJ)',
    note: 'The NOVJ division was brigade-based — three or four assault/proletarian brigades, not regiments.',
    components: [
      x(4, yuPartisanBde()),
      n('battalion', 'artillery', 'Artiljerijski divizion'),
      n('battalion', 'engineer', 'Inženjerijski bataljon'),
    ],
  },
  // --- Greece -------------------------------------------------------------
  {
    side: 'soviet', nation: 'gr', echelon: 'division', types: ['infantry'], from: '1940-01-01', to: '1941-12-31',
    name: 'Greek Infantry Division',
    note: 'Three infantry regiments (with Evzone battalions) and an artillery regiment.',
    components: [
      x(3, n('regiment', 'infantry', 'Σύνταγμα Πεζικού', { children: [x(3, grBn())] })),
      n('regiment', 'artillery', 'Σύνταγμα Πυροβολικού', { children: [x(2, n('battalion', 'artillery', 'Μοίρα'))] }),
      n('battalion', 'recon', 'Απόσπασμα Αναγνωρίσεως'),
      n('battalion', 'engineer', 'Τάγμα Μηχανικού'),
    ],
  },
  // --- Britain / Commonwealth --------------------------------------------
  {
    side: 'soviet', nation: 'gb', echelon: 'division', types: ['infantry'], from: '1939-01-01', to: '1945-12-31',
    name: 'British/Commonwealth Infantry Division',
    note: 'Brigade-based: three infantry brigades of three battalions, with three field regiments Royal Artillery.',
    components: [
      x(3, n('brigade', 'infantry', 'Infantry Brigade', { children: [x(3, gbBn())] })),
      x(3, n('regiment', 'artillery', 'Field Regiment RA', { children: [x(2, n('battalion', 'artillery', 'Battery group'))] })),
      n('regiment', 'recon', 'Reconnaissance Regiment'),
      n('regiment', 'antitank', 'Anti-Tank Regiment RA'),
      n('battalion', 'engineer', 'Royal Engineers'),
    ],
  },
  // --- Mountain divisions (sub-variant: mountain troops) ------------------
  {
    side: 'axis', echelon: 'division', types: ['mountain'], from: '1940-01-01', to: '1945-12-31',
    name: 'Gebirgs-Division (mountain)',
    note: 'German mountain division: two Gebirgsjäger regiments and a pack-artillery regiment.',
    components: [
      x(2, n('regiment', 'mountain', 'Gebirgsjäger-Regiment', { children: [x(3, deGebJgBn())] })),
      n('regiment', 'artillery', 'Gebirgs-Artillerie-Regiment', { children: [x(3, n('battalion', 'artillery', 'Gebirgs-Artillerie-Abteilung'))] }),
      n('battalion', 'recon', 'Gebirgs-Aufklärungs-Abteilung'),
      n('battalion', 'antitank', 'Panzerjäger-Abteilung'),
      n('battalion', 'engineer', 'Gebirgs-Pionier-Bataillon'),
      n('battalion', 'signals', 'Gebirgs-Nachrichten-Abteilung'),
    ],
  },
  {
    side: 'axis', nation: 'it', echelon: 'division', types: ['mountain'], from: '1940-01-01', to: '1943-12-31',
    name: 'Italian Alpine Division',
    note: 'Two Alpini regiments — battalions bear their home-valley names (e.g. Tolmezzo, Edolo, Ceva) — with a pack (someggiata) artillery regiment.',
    components: [
      x(2, n('regiment', 'mountain', 'Reggimento Alpini', { children: [x(3, itAlpBn())] })),
      n('regiment', 'artillery', 'Reggimento Artiglieria Alpina', { children: [x(3, n('battalion', 'artillery', 'Gruppo someggiato'))] }),
      n('battalion', 'engineer', 'Battaglione genio alpino'),
    ],
  },
  {
    side: 'axis', nation: 'ro', echelon: 'division', types: ['mountain'], from: '1941-01-01', to: '1945-12-31',
    name: 'Romanian Mountain Division (vânători de munte)',
    note: 'Mountain-hunter groups, each of several battalions, with mountain (pack) artillery.',
    components: [
      x(2, n('brigade', 'mountain', 'Grup de Vânători de Munte', { children: [x(3, roVmBn())] })),
      n('regiment', 'artillery', 'Regiment de Artilerie de Munte', { children: [x(2, n('battalion', 'artillery', 'Divizion de munte'))] }),
      n('battalion', 'recon', 'Escadron de cercetare'),
      n('battalion', 'engineer', 'Companie de pionieri'),
    ],
  },
  {
    side: 'soviet', echelon: 'division', types: ['mountain'], from: '1941-01-01', to: '1945-12-31',
    name: 'Soviet Mountain Rifle Division',
    note: 'Four small mountain rifle regiments with pack artillery — for the Caucasus and Crimea.',
    components: [
      x(4, n('regiment', 'mountain', 'Mountain Rifle Regiment', { children: [x(3, suMtnBn())] })),
      n('regiment', 'artillery', 'Mountain Artillery Regiment', { children: [x(2, n('battalion', 'artillery', 'Pack Artillery Battalion'))] }),
      n('company', 'recon', 'Reconnaissance Company'),
      n('battalion', 'engineer', 'Sapper Battalion'),
    ],
  },
  // --- Sub-variants gated by unit id --------------------------------------
  {
    side: 'soviet', idMatch: 'guards', echelon: 'division', types: ['infantry'], from: '1942-01-01', to: '1945-12-31',
    name: 'Guards Rifle Division',
    note: 'Uprated establishment: more submachine guns and artillery than a line rifle division.',
    components: [
      x(3, n('regiment', 'infantry', 'Guards Rifle Regiment', { children: [x(3, suGdRifleBn())] })),
      n('regiment', 'artillery', 'Guards Artillery Regiment', { children: [x(3, n('battalion', 'artillery', 'Battalion'))] }),
      n('battalion', 'antitank', 'Anti-Tank Battalion'),
      n('battalion', 'recon', 'Reconnaissance Company'),
      n('battalion', 'engineer', 'Sapper Battalion'),
      n('battalion', 'signals', 'Signal Battalion'),
    ],
  },
  {
    side: 'axis', idMatch: '-ss-', echelon: 'division', types: ['armoured'], from: '1942-01-01', to: '1945-12-31',
    name: 'SS-Panzer-Division',
    note: 'Waffen-SS armoured division — the elite ones were oversized, with two strong panzergrenadier regiments.',
    components: [
      n('regiment', 'armoured', 'SS-Panzer-Regiment', { children: [x(2, dePanzerBn())] }),
      x(2, n('regiment', 'motorized', 'SS-Panzergrenadier-Regiment', { children: [x(3, ssPzGrenBn())] })),
      n('regiment', 'artillery', 'SS-Panzer-Artillerie-Regiment', { children: [x(3, deArtyBn())] }),
      n('battalion', 'recon', 'SS-Panzer-Aufklärungs-Abteilung'),
      n('battalion', 'antitank', 'SS-Panzerjäger-Abteilung'),
      n('battalion', 'antiair', 'SS-Flak-Abteilung'),
      n('battalion', 'engineer', 'SS-Pionier-Bataillon'),
    ],
  },
  {
    side: 'axis', idMatch: '-ss-', echelon: 'division', types: ['motorized', 'mechanized'], from: '1942-01-01', to: '1945-12-31',
    name: 'SS-Panzergrenadier-Division',
    components: [
      x(2, n('regiment', 'motorized', 'SS-Panzergrenadier-Regiment', { children: [x(3, ssPzGrenBn())] })),
      n('battalion', 'armoured', 'SS-Panzer-Abteilung', { children: dePanzerBn().children }),
      n('regiment', 'artillery', 'SS-Artillerie-Regiment', { children: [x(3, deArtyBn())] }),
      n('battalion', 'recon', 'SS-Aufklärungs-Abteilung'),
      n('battalion', 'antitank', 'SS-Panzerjäger-Abteilung'),
      n('battalion', 'engineer', 'SS-Pionier-Bataillon'),
    ],
  },
  {
    side: 'axis', idMatch: 'ja[e]?ger', echelon: 'division', types: ['infantry'], from: '1942-01-01', to: '1945-12-31',
    name: 'Jäger-Division (light)',
    note: 'Light infantry division: two Jäger regiments instead of three, for forest, mountain and anti-partisan work.',
    components: [
      x(2, n('regiment', 'infantry', 'Jäger-Regiment', { children: [x(3, deGrenadierBn1944())] })),
      n('regiment', 'artillery', 'Artillerie-Regiment', { children: [x(3, deArtyBn())] }),
      n('battalion', 'recon', 'Aufklärungs-Abteilung'),
      n('battalion', 'antitank', 'Panzerjäger-Abteilung'),
      n('battalion', 'engineer', 'Pionier-Bataillon'),
    ],
  },
  {
    side: 'axis', nation: 'hu', idMatch: 'light', echelon: 'division', types: ['infantry'], from: '1941-01-01', to: '1943-12-31',
    name: 'Hungarian Light Division (könnyű hadosztály)',
    note: 'Early-war binary division: only two infantry regiments.',
    components: [
      x(2, n('regiment', 'infantry', 'Gyalogezred', { children: [x(3, huInfBn())] })),
      n('regiment', 'artillery', 'Tüzérezred', { children: [x(2, n('battalion', 'artillery', 'Osztály'))] }),
      n('battalion', 'recon', 'Felderítő-zászlóalj'),
      n('battalion', 'engineer', 'Utászzászlóalj'),
    ],
  },
  // --- Airborne divisions (type-gated TO&E) ------------------------------
  {
    side: 'axis', echelon: 'division', types: ['airborne'], from: '1940-01-01', to: '1945-12-31',
    name: 'Fallschirmjäger-Division',
    note: 'German parachute division: three Fallschirmjäger regiments (Luftwaffe).',
    components: [
      x(3, n('regiment', 'airborne', 'Fallschirmjäger-Regiment', { children: [x(3, deFJBn())] })),
      n('regiment', 'artillery', 'Fallschirm-Artillerie-Regiment', { children: [x(3, deArtyBn())] }),
      n('battalion', 'antitank', 'Fallschirm-Panzerjäger-Abteilung'),
      n('battalion', 'engineer', 'Fallschirm-Pionier-Bataillon'),
    ],
  },
  {
    side: 'soviet', echelon: 'division', types: ['airborne'], from: '1941-01-01', to: '1945-12-31',
    name: 'Airborne / Guards Airborne Division',
    note: 'Soviet airborne division — three airborne regiments; mostly committed as elite guards rifle.',
    components: [
      x(3, n('regiment', 'airborne', 'Airborne Regiment', { children: [x(3, suAbnBn())] })),
      n('regiment', 'artillery', 'Artillery Regiment', { children: [x(2, n('battalion', 'artillery', 'Battalion'))] }),
      n('battalion', 'antitank', 'Anti-Tank Battalion'),
      n('battalion', 'engineer', 'Sapper Battalion'),
    ],
  },
  // --- The three Alpine divisions of the Don (ARMIR), with named battalions ---
  {
    side: 'axis', nation: 'it', idMatch: 'julia', echelon: 'division', types: ['mountain'], from: '1940-01-01', to: '1943-12-31',
    name: 'Alpine Division "Julia"',
    note: 'The 8th and 9th Alpini, lost on the Don in January 1943. Battalions named for their home valleys.',
    components: [
      alpRgt('8°', ['Tolmezzo', 'Gemona', 'Cividale']),
      alpRgt('9°', ['Vicenza', "L'Aquila", 'Val Cismon']),
      n('regiment', 'artillery', '3° Reggimento Artiglieria Alpina', { children: [n('battalion', 'artillery', 'Gr. "Conegliano"'), n('battalion', 'artillery', 'Gr. "Udine"'), n('battalion', 'artillery', 'Gr. "Val Piave"')] }),
      n('battalion', 'engineer', 'Battaglione genio alpino'),
    ],
  },
  {
    side: 'axis', nation: 'it', idMatch: 'tridentina', echelon: 'division', types: ['mountain'], from: '1940-01-01', to: '1943-12-31',
    name: 'Alpine Division "Tridentina"',
    note: 'The 5th and 6th Alpini — "Tridentina avanti!" — which led the breakout from the Don, January 1943.',
    components: [
      alpRgt('5°', ['Morbegno', 'Tirano', 'Edolo']),
      alpRgt('6°', ['Vestone', 'Verona', 'Val Chiese']),
      n('regiment', 'artillery', '2° Reggimento Artiglieria Alpina', { children: [n('battalion', 'artillery', 'Gr. "Bergamo"'), n('battalion', 'artillery', 'Gr. "Vicenza"'), n('battalion', 'artillery', 'Gr. "Val Camonica"')] }),
      n('battalion', 'engineer', 'Battaglione genio alpino'),
    ],
  },
  {
    side: 'axis', nation: 'it', idMatch: 'cuneense', echelon: 'division', types: ['mountain'], from: '1940-01-01', to: '1943-12-31',
    name: 'Alpine Division "Cuneense"',
    note: 'The 1st and 2nd Alpini, destroyed on the Don retreat, January 1943.',
    components: [
      alpRgt('1°', ['Ceva', 'Pieve di Teco', 'Mondovì']),
      alpRgt('2°', ['Borgo San Dalmazzo', 'Dronero', 'Saluzzo']),
      n('regiment', 'artillery', '4° Reggimento Artiglieria Alpina', { children: [n('battalion', 'artillery', 'Gr. "Pinerolo"'), n('battalion', 'artillery', 'Gr. "Mondovì"'), n('battalion', 'artillery', 'Gr. "Val Po"')] }),
      n('battalion', 'engineer', 'Battaglione genio alpino'),
    ],
  },
  // --- Bespoke trees for the famous Waffen-SS / elite panzer divisions ----
  {
    side: 'axis', idMatch: '1st-ss-panzer', echelon: 'division', types: ['armoured'], from: '1942-01-01', to: '1945-12-31',
    name: '1st SS-Panzer-Division "Leibstandarte"',
    note: "Hitler's bodyguard — the first Waffen-SS division (LSSAH).",
    components: [
      n('regiment', 'armoured', 'SS-Panzer-Regiment 1', { children: [x(2, dePanzerBn())] }),
      ssPzGrenRgt('1. SS-Panzergrenadier-Regiment LSSAH'),
      ssPzGrenRgt('2. SS-Panzergrenadier-Regiment LSSAH'),
      ...elitePzTail('SS'),
    ],
  },
  {
    side: 'axis', idMatch: '2nd-ss-panzer', echelon: 'division', types: ['armoured'], from: '1942-01-01', to: '1945-12-31',
    name: '2nd SS-Panzer-Division "Das Reich"',
    components: [
      n('regiment', 'armoured', 'SS-Panzer-Regiment 2', { children: [x(2, dePanzerBn())] }),
      ssPzGrenRgt('SS-Panzergrenadier-Regiment "Deutschland"'),
      ssPzGrenRgt('SS-Panzergrenadier-Regiment "Der Führer"'),
      ...elitePzTail('SS'),
    ],
  },
  {
    side: 'axis', idMatch: '3rd-ss-panzer', echelon: 'division', types: ['armoured'], from: '1942-01-01', to: '1945-12-31',
    name: '3rd SS-Panzer-Division "Totenkopf"',
    components: [
      n('regiment', 'armoured', 'SS-Panzer-Regiment 3', { children: [x(2, dePanzerBn())] }),
      ssPzGrenRgt('SS-Panzergrenadier-Regiment "Thule"'),
      ssPzGrenRgt('SS-Panzergrenadier-Regiment "Theodor Eicke"'),
      ...elitePzTail('SS'),
    ],
  },
  {
    side: 'axis', idMatch: '5th-ss-panzer', echelon: 'division', types: ['armoured'], from: '1942-01-01', to: '1945-12-31',
    name: '5th SS-Panzer-Division "Wiking"',
    note: 'The volunteer division — Germanic regiments; "Nordland" left in 1943 to form the 11th SS.',
    components: [
      n('regiment', 'armoured', 'SS-Panzer-Regiment 5', { children: [x(2, dePanzerBn())] }),
      ssPzGrenRgt('SS-Panzergrenadier-Regiment "Germania"'),
      ssPzGrenRgt('SS-Panzergrenadier-Regiment "Westland"'),
      ssPzGrenRgt('SS-Panzergrenadier-Regiment "Nordland" (to 1943)'),
      ...elitePzTail('SS'),
    ],
  },
  {
    side: 'axis', idMatch: '12th-ss-panzer', echelon: 'division', types: ['armoured'], from: '1943-01-01', to: '1945-12-31',
    name: '12th SS-Panzer-Division "Hitlerjugend"',
    components: [
      n('regiment', 'armoured', 'SS-Panzer-Regiment 12', { children: [x(2, dePanzerBn())] }),
      ssPzGrenRgt('25. SS-Panzergrenadier-Regiment'),
      ssPzGrenRgt('26. SS-Panzergrenadier-Regiment'),
      ...elitePzTail('SS'),
    ],
  },
  {
    side: 'axis', idMatch: 'hermann-goring', echelon: 'division', types: ['armoured'], from: '1942-01-01', to: '1945-12-31',
    name: 'Fallschirm-Panzer-Division "Hermann Göring"',
    note: "Göring's elite Luftwaffe armoured division.",
    components: [
      n('regiment', 'armoured', 'Panzer-Regiment HG', { children: [x(2, dePanzerBn())] }),
      x(2, n('regiment', 'motorized', 'Panzergrenadier-Regiment HG', { children: [x(3, dePzGrenBn())] })),
      n('regiment', 'artillery', 'Panzer-Artillerie-Regiment HG', { children: [x(3, deArtyBn())] }),
      n('battalion', 'recon', 'Panzer-Aufklärungs-Abteilung HG'),
      n('battalion', 'antiair', 'Flak-Regiment HG'),
      n('battalion', 'engineer', 'Pionier-Bataillon HG'),
    ],
  },
];

/** Best-matching template for a unit, or null. A nation-specific template (e.g.
 *  Romanian, Hungarian, Italian) is preferred; failing that, the side default
 *  (German for axis, Soviet for soviet — templates with no `nation`) is used, so
 *  minor-power divisions show their own order of battle, not a German/Soviet one.
 *  Type match beats wildcard; among date-valid candidates the latest `from` wins. */
export function matchTemplate(
  nation: string,
  id: string,
  side: 'axis' | 'soviet',
  echelon: string,
  type: string,
  dateISO: string,
): FormationTemplate | null {
  const withEstablishment = (t: FormationTemplate | undefined): FormationTemplate | null =>
    t ? { ...t, ...ESTABLISHMENT[t.name], equipmentRefs: EQUIP_REFS[t.name] } : null;
  const echType = (t: FormationTemplate): boolean =>
    t.echelon === echelon && (t.types.includes(type) || t.types.includes('*'));
  const idOk = (t: FormationTemplate): boolean => !t.idMatch || new RegExp(t.idMatch).test(id);
  // Within a pool, prefer a date-valid, id-matching sub-variant over the generic;
  // fall back to nearest era if nothing is date-valid.
  const pick = (pool: FormationTemplate[]): FormationTemplate | null => {
    const usable = pool.filter((t) => echType(t) && idOk(t));
    if (!usable.length) return null;
    const inWindow = usable.filter((t) => dateISO >= t.from && dateISO <= t.to);
    const set = inWindow.length ? inWindow : usable; // else nearest era
    const variants = set.filter((t) => t.idMatch);
    // Prefer the most specific id-variant (longest idMatch — a per-division
    // template beats a per-branch one like '-ss-'); then the latest era.
    const chosen = (variants.length ? variants : set).sort((a, b) => {
      const spec = (b.idMatch?.length ?? 0) - (a.idMatch?.length ?? 0);
      return spec !== 0 ? spec : b.from.localeCompare(a.from);
    })[0];
    return withEstablishment(chosen);
  };
  // 1) nation-specific (matched by nation, regardless of the axis/soviet side).
  const nat = pick(TEMPLATES.filter((t) => t.nation === nation));
  if (nat) return nat;
  // 2) side default: the un-tagged German (axis) / Soviet (soviet) templates.
  return pick(TEMPLATES.filter((t) => !t.nation && t.side === side));
}
