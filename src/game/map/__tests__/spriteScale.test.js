// Gardes du module d'échelle du grain (spriteScale.js — lot G0 de
// docs/PLAN-EGALISATION-GRAIN.md).
//
// 1) houseScaleK est LA formule (importée par pixelHouseGeom) : on la teste sur
//    des cas où la garde MORD — un clamp attendu qui ne clampe pas doit casser.
// 2) Les constantes de RÉFÉRENCE (recopies déclaratives des densités encore
//    éparpillées) sont verrouillées sur leurs SITES VIFS par lecture du source :
//    si isoRenderer/renderBuildings/layout changent une densité sans mettre à
//    jour spriteScale.js (ou l'inverse), ce test casse — c'est son seul rôle,
//    il disparaîtra au lot G1 quand les sites importeront le module.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  HOUSE_UNIT, houseFitTune, houseScaleK, grainTune, GRAIN_FIX,
  TILE_REF, HOUSE_LOT_WF, ENGINE_UNIT_F, WONDER_PPT, COSMIC_TOWER_H,
  PALIER_SPANSUM, palierHFrac,
} from '../spriteScale.js';
import { ANIM_BANDS } from '../cityEngineSprites.js';

const SRC = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('houseScaleK — la formule unique', () => {
  it('densité constante hors clamp, et INDÉPENDANTE de la forme du lot (G1)', () => {
    // Lot carré 1×1 iso @z=1 : w = 2·T·0.78 = 49.92 → k ≈ 1.1345
    const w = 2 * TILE_REF * HOUSE_LOT_WF;
    expect(houseScaleK(1, w, 30, 1)).toBeCloseTo(w / HOUSE_UNIT, 10);
    // Lot 1×2 iso : w = 3·T·0.78, unité honnête 2w/3 → MÊME densité que le
    // carré (l'anomalie ×1,5 du §1.2 est corrigée).
    const w12 = 3 * TILE_REF * HOUSE_LOT_WF;
    expect(houseScaleK(1, w12, 20, 2)).toBeCloseTo(w / HOUSE_UNIT, 10);
    // Legacy top-down (spanY omis = spanX) : unité historique w/spanX intacte.
    expect(houseScaleK(1, w12, 20)).toBeCloseTo(w12 / HOUSE_UNIT, 10);
  });

  it('GRAIN_FIX s applique par clé EXACTE, borné [0.8, 1.25], et se coupe', () => {
    const w = 2 * TILE_REF * HOUSE_LOT_WF;
    const base = w / HOUSE_UNIT;
    // townhouse : +10 % (valeur d audit).
    expect(houseScaleK(1, w, 30, 1, 'townhouse')).toBeCloseTo(base * GRAIN_FIX.townhouse, 10);
    // Clé inconnue et skin cosmique : PAS de compensation héritée de la base.
    expect(houseScaleK(1, w, 30, 1, 'hut')).toBeCloseTo(base, 10);
    expect(houseScaleK(2, 2 * w, 60, 2, 'tower-cosmic-7')).toBeCloseTo(base, 10);
    // Garde CASSÉE exprès : un fix délirant est borné à 1.25…
    GRAIN_FIX.__test__ = 3.0;
    expect(houseScaleK(1, w, 30, 1, '__test__')).toBeCloseTo(base * 1.25, 10);
    delete GRAIN_FIX.__test__;
    // …et couper grainTune neutralise tout.
    grainTune.on = false;
    expect(houseScaleK(1, w, 30, 1, 'townhouse')).toBeCloseTo(base, 10);
    grainTune.on = true;
  });

  it('le clamp au lot MORD : une encre trop large est ramenée à w·(1+margin)', () => {
    const w = 2 * TILE_REF * HOUSE_LOT_WF;      // 49.92
    const inkW = 60;                            // encre plus large que le lot
    const k = houseScaleK(1, w, inkW, 1);
    expect(inkW * k).toBeCloseTo(w * (1 + houseFitTune.margin), 10);
    // Et la preuve que la garde mord : sans clamp le même sprite déborderait.
    expect(inkW * (w / HOUSE_UNIT)).toBeGreaterThan(w * (1 + houseFitTune.margin));
    // Le clamp passe APRÈS le fix : fix ×1.25 sur encre large → même plafond.
    GRAIN_FIX.__test__ = 1.25;
    expect(inkW * houseScaleK(1, w, inkW, 1, '__test__')).toBeCloseTo(w * (1 + houseFitTune.margin), 10);
    delete GRAIN_FIX.__test__;
  });

  it('cas réels du corpus (bbox mesurées 2026-08-03/04)', () => {
    const w12 = 3 * TILE_REF * HOUSE_LOT_WF;
    const w11 = 2 * TILE_REF * HOUSE_LOT_WF;
    // tower de BASE 1×2 iso, encre 52, fix 1.1 : 52·1.135·1.1 ≈ 64.9 < 80.87 →
    // n'est PLUS clampée depuis l'unité honnête (elle l'était à ×1.70).
    expect(houseScaleK(1, w12, 52, 2, 'tower'))
      .toBeCloseTo((w11 / HOUSE_UNIT) * GRAIN_FIX.tower, 10);
    // hut 1×1, encre 35 px → PAS clampé, pas de fix.
    expect(houseScaleK(1, w11, 35, 1, 'hut')).toBeCloseTo(w11 / HOUSE_UNIT, 10);
  });
});

describe('constantes de référence — verrouillées sur les sites vifs', () => {
  it('HOUSE_LOT_WF suit isoRenderer (boîte-lot des habitations)', () => {
    expect(SRC('iso/isoRenderer.js')).toContain(
      `wpx = (spanX + spanY) * T * z * ISO_X * ${HOUSE_LOT_WF}`);
  });
  // ⚠ LA BOÎTE DES SCÈNES MOTEUR A DÉMÉNAGÉ le 2026-08-23 : isoRenderer →
  // isoEngineScene.js. Cette garde lit du TEXTE de source, pas un symbole — aucun
  // balayage de noms d'export ne peut la voir partir. Ce sont les tests qui l'ont
  // rattrapée. Si le site vif redéménage, c'est ce chemin-là qu'il faut suivre.
  it('ENGINE_UNIT_F suit isoEngineScene (boîte des scènes moteur)', () => {
    expect(SRC('iso/isoEngineScene.js')).toContain(
      `unit = T * z * ISO_X * ${ENGINE_UNIT_F}`);
  });
  it('WONDER_PPT suit renderBuildings (merveilles)', () => {
    expect(SRC('renderBuildings.js')).toContain(`PPT = ${WONDER_PPT}`);
  });
  it('TILE_REF suit layout (CM.TILE)', () => {
    expect(SRC('layout.js')).toMatch(new RegExp(`TILE:\\s*${TILE_REF}[,\\s]`));
  });
  it('COSMIC_TOWER_H suit cityEngineSprites (tours cosmiques moteur)', () => {
    expect(SRC('cityEngineSprites.js')).toContain(`__cosmicTowerH) || ${COSMIC_TOWER_H}`);
  });
});

// ── PALIERS DE HALLE : le manifeste doit correspondre à ce qui est sur le disque ──
// `PALIER_SPANSUM` est déclaré « la seule liste qui fasse foi » : le rendu s'en
// sert pour décider quoi charger. Une clé sans PNG fait donc une requête à vide,
// et un PNG dont la géométrie a bougé depuis sa déclaration désaligne le blit
// SANS que rien ne le signale — un sprite de palier ne se voit qu'à l'empreinte 3.
describe('paliers de halle — le manifeste tient au disque', () => {
  const BUILDINGS = path.join(__dirname, '..', '..', '..', '..', 'public', 'pixelart', 'agents', 'buildings');

  it('chaque clé du manifeste a son PNG', () => {
    const absents = Object.keys(PALIER_SPANSUM)
      .filter((k) => !fs.existsSync(path.join(BUILDINGS, `${k}.png`)));
    expect(absents, `paliers déclarés sans art : ${absents.join(', ')}`).toEqual([]);
    expect(Object.keys(PALIER_SPANSUM).length).toBeGreaterThan(50);
  });

  // Le stade 0 du Culte des ancêtres est la seule scène à paliers en DEUX
  // couches : le cercle (prop) et sa flamme (bande animée), dessinés dans le
  // MÊME rectangle par deux fonctions différentes (blitProp et blitAnim), qui
  // recalculent chacune leurs fractions de leur côté. Elles ne coïncident que si
  // les deux sprites partagent calibrage, hauteur de calibrage et RATIO de
  // canvas. Que l'un des trois bouge — une bande régénérée sur un autre format,
  // un PALIER_HFRAC posé sur une seule des deux clés — et la flamme part se
  // poser à côté de son foyer, en silence.
  it('le cercle et sa flamme partagent calibrage, hFrac et ratio', () => {
    const CERCLE = 'ancestralcult-back-grand', FEU = 'ancestralcult-fire-grand';
    expect(PALIER_SPANSUM[CERCLE]).toBe(PALIER_SPANSUM[FEU]);
    expect(palierHFrac(CERCLE)).toBe(palierHFrac(FEU));

    const bande = ANIM_BANDS[FEU];
    expect(bande, `${FEU} absente d'ANIM_BANDS`).toBeTruthy();
    const png = PNG.sync.read(fs.readFileSync(path.join(BUILDINGS, `${FEU}.png`)));
    // La bande est bien 7 frames de fw×fh — sinon blitAnim découpe à côté.
    expect(png.width).toBe(bande.fw * bande.frames);
    expect(png.height).toBe(bande.fh);

    const cercle = PNG.sync.read(fs.readFileSync(path.join(BUILDINGS, `${CERCLE}.png`)));
    expect(cercle.width / cercle.height).toBeCloseTo(bande.fw / bande.fh, 10);
  });

  // Un palier n'existe que pour rendre le grain COMPARABLE à celui d'un atelier.
  // Le stade 0 étiré valait 1,26 px écran par px source ; le palier doit revenir
  // dans la bande des autres halles (0,605 au calibrage nominal).
  it('le palier du cercle ramène le grain dans la bande des halles', () => {
    const png = PNG.sync.read(fs.readFileSync(path.join(BUILDINGS, 'ancestralcult-back-grand.png')));
    const dens = (PALIER_SPANSUM['ancestralcult-back-grand'] * TILE_REF * ENGINE_UNIT_F
      * palierHFrac('ancestralcult-back-grand')) / png.height;
    expect(dens).toBeGreaterThan(0.55);
    expect(dens).toBeLessThan(0.70);
    // … contre le 96×80 servi dans la même boîte, deux fois trop gros.
    const petit = PNG.sync.read(fs.readFileSync(path.join(BUILDINGS, 'ancestralcult-back.png')));
    expect((6 * TILE_REF * ENGINE_UNIT_F * 0.73) / petit.height).toBeGreaterThan(dens * 1.9);
  });
});
