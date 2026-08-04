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
import {
  HOUSE_UNIT, houseFitTune, houseScaleK,
  TILE_REF, HOUSE_LOT_WF, ENGINE_UNIT_F, WONDER_PPT, COSMIC_TOWER_H,
} from '../spriteScale.js';

const SRC = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('houseScaleK — la formule unique', () => {
  it('densité constante hors clamp : k = (w/spanX)/HOUSE_UNIT', () => {
    // Lot carré 1×1 iso @z=1 : w = 2·T·0.78 = 49.92 → k ≈ 1.1345
    const w = 2 * TILE_REF * HOUSE_LOT_WF;
    expect(houseScaleK(1, w, 30)).toBeCloseTo(w / HOUSE_UNIT, 10);
    // Lot 1×2 : w = 3·T·0.78 → unit = w/1 → k ≈ 1.70 (l'anomalie documentée §1.2)
    const w12 = 3 * TILE_REF * HOUSE_LOT_WF;
    expect(houseScaleK(1, w12, 20)).toBeCloseTo(w12 / HOUSE_UNIT, 10);
  });

  it('le clamp au lot MORD : une encre trop large est ramenée à w·(1+margin)', () => {
    const w = 2 * TILE_REF * HOUSE_LOT_WF;      // 49.92
    const inkW = 60;                            // encre plus large que le lot
    const k = houseScaleK(1, w, inkW);
    expect(inkW * k).toBeCloseTo(w * (1 + houseFitTune.margin), 10);
    // Et la preuve que la garde mord : sans clamp le même sprite déborderait.
    expect(inkW * (w / HOUSE_UNIT)).toBeGreaterThan(w * (1 + houseFitTune.margin));
  });

  it('cas réels du corpus (bbox mesurées 2026-08-03/04)', () => {
    const w12 = 3 * TILE_REF * HOUSE_LOT_WF;
    // tower de BASE 1×2, encre 52 px → clampée (52·1.702 > 74.88·1.08)…
    expect(houseScaleK(1, w12, 52)).toBeCloseTo((w12 * 1.08) / 52, 10);
    // …et la tour COSMIQUE régénérée en B1 (encre ≤47 px, faite pour tuer le
    // clamp) passe juste SOUS le seuil : densité pleine.
    expect(houseScaleK(1, w12, 47)).toBeCloseTo(w12 / HOUSE_UNIT, 10);
    // hut 1×1, encre 35 px → PAS clampé
    const w11 = 2 * TILE_REF * HOUSE_LOT_WF;
    expect(houseScaleK(1, w11, 35)).toBeCloseTo(w11 / HOUSE_UNIT, 10);
  });
});

describe('constantes de référence — verrouillées sur les sites vifs', () => {
  it('HOUSE_LOT_WF suit isoRenderer (boîte-lot des habitations)', () => {
    expect(SRC('iso/isoRenderer.js')).toContain(
      `wpx = (spanX + spanY) * T * z * ISO_X * ${HOUSE_LOT_WF}`);
  });
  it('ENGINE_UNIT_F suit isoRenderer (boîte des scènes moteur)', () => {
    expect(SRC('iso/isoRenderer.js')).toContain(
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
