// LE TERRAIN — les invariants qui ne doivent jamais bouger.
//
// Le champ est DÉRIVÉ (mapSeed + plan), jamais stocké : ces gardes verrouillent
// ce que le rendu suppose de lui — l'unité, le zéro au bord de l'eau, la
// platitude des socles, et l'inverse itératif de la projection.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CM } from '../../layout.js';
import { TERRAIN, terrainZ, cellLevelU, reliefUnit, terrainKey, terrainMaxPx } from '../isoTerrain.js';
import { worldToScreen, screenToWorld } from '../projection.js';

// Layout synthétique MINIMAL mais complet pour le champ : un cœur, une graine,
// des compteurs — et selon le test, un fleuve ou des emprises. Le vrai layout
// en a mille fois plus ; le champ ne lit que ça.
const makeLayout = (extra = {}) => ({
  mapSeed: 424242,
  plan: { core: { x: 50, y: 50 } },
  cx: 50, cy: 50,
  counts: { eraIndex: 0, urbanTier: 0 },
  tiles: [],
  river: { present: false },
  ...extra,
});

// ⚠ La mémo des socles (module isoTerrain) est clée sur layoutRecomputeAt : un
// compteur qui REVIENT sur une valeur déjà vue lui ferait servir les socles d'un
// AUTRE layout. En jeu c'est un timestamp qui ne recule jamais ; ici, pareil.
let seq = 1_000_000;
let saved;
beforeEach(() => {
  saved = {
    layout: CM.layout, at: CM.layoutRecomputeAt, cam: { ...CM.cam },
    cw: CM.cw, ch: CM.ch, amp: TERRAIN.amp, preview: CM.previewWonder,
  };
  CM.layout = makeLayout();
  CM.layoutRecomputeAt = ++seq;
  CM.previewWonder = null;
  CM.cam = { x: 50 * 32, y: 50 * 32, zoom: 1 };
  CM.cw = 800; CM.ch = 600;
  TERRAIN.amp = 1;
});
afterEach(() => {
  CM.layout = saved.layout; CM.layoutRecomputeAt = saved.at;
  CM.cam = saved.cam; CM.cw = saved.cw; CM.ch = saved.ch;
  TERRAIN.amp = saved.amp; CM.previewWonder = saved.preview;
});

describe('terrain — le champ', () => {
  it('rend des ENTIERS de U = T/4, partout (la couture inter-losanges en dépend)', () => {
    const U = reliefUnit();
    expect(U).toBe(CM.TILE / 4);
    for (let gy = 20; gy < 80; gy += 3) {
      for (let gx = 20; gx < 80; gx += 3) {
        const h = terrainZ(gx * CM.TILE + 7, gy * CM.TILE + 19);
        expect(h % U, `cellule ${gx},${gy}`).toBe(0);
      }
    }
  });

  it('est DÉTERMINISTE pour une graine, et change avec elle', () => {
    const a1 = cellLevelU(70, 30), b1 = cellLevelU(30, 72);
    CM.layout = makeLayout(); CM.layoutRecomputeAt = ++seq;   // re-mémo, même graine
    expect(cellLevelU(70, 30)).toBe(a1);
    expect(cellLevelU(30, 72)).toBe(b1);
    // Deux graines ne peuvent pas rendre le même champ partout : on échantillonne.
    let same = 0, n = 0;
    CM.layout = makeLayout({ mapSeed: 424242 }); CM.layoutRecomputeAt = ++seq;
    const ref = [];
    for (let g = 20; g < 80; g += 2) ref.push(cellLevelU(g, 100 - g));
    CM.layout = makeLayout({ mapSeed: 99 }); CM.layoutRecomputeAt = ++seq;
    for (let g = 20; g < 80; g += 2) { if (cellLevelU(g, 100 - g) === ref[n]) same += 1; n += 1; }
    expect(same).toBeLessThan(n);
  });

  it('est NUL au bord de l eau : tout l appareil du fleuve vit à z = 0', () => {
    CM.layout = makeLayout({ river: { present: true, riverYAt: () => 50 } });
    CM.layoutRecomputeAt = ++seq;
    for (let gx = 20; gx < 80; gx += 2) {
      // Dans la bande riverPad autour de l'axe : zéro strict.
      expect(terrainZ(gx * CM.TILE, 50 * CM.TILE)).toBe(0);
      expect(terrainZ(gx * CM.TILE, (50 + TERRAIN.riverPad - 0.5) * CM.TILE)).toBe(0);
      expect(terrainZ(gx * CM.TILE, (50 - TERRAIN.riverPad + 0.5) * CM.TILE)).toBe(0);
    }
  });

  it('coupé (amp 0), il rend 0 partout — le plat historique au bit près', () => {
    TERRAIN.amp = 0;
    for (let g = 0; g < 120; g += 7) expect(terrainZ(g * 32 + 3, (120 - g) * 32 + 11)).toBe(0);
    expect(terrainKey()).toBe('');
    expect(terrainMaxPx()).toBe(0);
  });

  it('la clé porte tous les réglages qui changent le dessin', () => {
    const k0 = terrainKey();
    for (const knob of ['amp', 'valley', 'bench', 'coteau', 'hills', 'hillCut', 'cityK', 'big', 'det', 'riverPad']) {
      const was = TERRAIN[knob];
      TERRAIN[knob] = was + 1;
      expect(terrainKey(), knob).not.toBe(k0);
      TERRAIN[knob] = was;
    }
    expect(terrainKey()).toBe(k0);
  });
});

describe('terrain — les socles', () => {
  it('une emprise de bâtiment est PLATE, ancre sud comprise', () => {
    // Loin du cœur (le relief y vit) : emprise 3×2 en pleine colline.
    CM.layout = makeLayout({ tiles: [{ gx: 72, gy: 28, spanX: 3, spanY: 2 }] });
    CM.layoutRecomputeAt = ++seq;
    const T = CM.TILE;
    const hRef = terrainZ((72 + 1.5) * T, (28 + 1) * T);   // centre
    // Les 4 coins de l'emprise (dont l'ANCRE SUD des sprites, pile sur le bord),
    // et des points intérieurs : tous au niveau du centre.
    for (const [wx, wy] of [
      [72 * T, 28 * T], [(72 + 3) * T, 28 * T], [72 * T, (28 + 2) * T],
      [(72 + 3) * T, (28 + 2) * T],                        // ⚠ l'ancre sud
      [(72 + 0.3) * T, (28 + 1.7) * T], [(72 + 2.9) * T, (28 + 0.1) * T],
    ]) {
      expect(terrainZ(wx, wy), `point ${wx / T},${wy / T}`).toBe(hRef);
    }
  });

  it('les champs cultivés ÉPOUSENT le terrain (pas de socle)', () => {
    const bare = cellLevelU(72, 28);
    CM.layout = makeLayout({ tiles: [{ gx: 70, gy: 26, spanX: 6, spanY: 6, buildingId: 'wheat_field' }] });
    CM.layoutRecomputeAt = ++seq;
    expect(cellLevelU(72, 28)).toBe(bare);
  });

  it('un parvis de merveille est UN niveau (groupe de cellules)', () => {
    const wonderGround = new Set();
    for (let gy = 30; gy < 34; gy += 1) for (let gx = 66; gx < 70; gx += 1) wonderGround.add(gx + ',' + gy);
    CM.layout = makeLayout({ wonderGround });
    CM.layoutRecomputeAt = ++seq;
    const ref = cellLevelU(66, 30);
    for (let gy = 30; gy < 34; gy += 1) for (let gx = 66; gx < 70; gx += 1) {
      expect(cellLevelU(gx, gy), `cellule ${gx},${gy}`).toBe(ref);
    }
  });
});

describe('terrain — le bombé des îles', () => {
  it('LISSE (jamais un multiple de U), borné à isle·U, nul au rivage', () => {
    // Île elliptique au milieu du fleuve : le champ y est 0 (bande riverPad),
    // seul le dôme s'exprime — c'est le « légèrement bombé, sans marches ».
    CM.layout = makeLayout({
      river: {
        present: true, riverYAt: () => 50,
        islands: [{ x: 50, y: 50, rx: 5, ry: 3, tx: 1, ty: 0 }],
      },
    });
    CM.layoutRecomputeAt = ++seq;
    const U = reliefUnit();
    const center = terrainZ(50 * CM.TILE, 50 * CM.TILE);
    expect(center).toBeGreaterThan(0);
    expect(center).toBeLessThanOrEqual(TERRAIN.isle * U + 1e-9);
    expect(Math.abs(center % U)).toBeGreaterThan(1e-6);   // PAS quantifié : un galbe
    // Rivage (bord de l'ellipse) : le dôme s'annule, la ligne d'eau ne bouge pas.
    expect(terrainZ((50 + 5) * CM.TILE, 50 * CM.TILE)).toBeCloseTo(0, 6);
    // SANS MARCHES : d'une cellule à sa voisine, jamais un cran plein — le seuil
    // des contremarches (U − ε) garantit alors qu'aucune face n'est dessinée.
    for (let gx = 45; gx < 55; gx += 1) {
      const a = terrainZ(gx * CM.TILE, 50 * CM.TILE);
      const b = terrainZ((gx + 1) * CM.TILE, 50 * CM.TILE);
      expect(Math.abs(a - b), `cellules ${gx}/${gx + 1}`).toBeLessThan(U - 0.01);
    }
  });
});

describe('terrain — l inverse de la projection', () => {
  it('screenToWorld retrouve un point LEVÉ — exact hors escarpement, borné dessus', () => {
    // ⚠ LE CONTRAT N'EST PAS « l'inverse retrouve LE point » : au droit d'un
    // escarpement, deux sols (le bord haut visible, la bande cachée derrière la
    // face) se projettent aux MÊMES pixels — l'inverse en rend un, et l'écart à
    // l'autre vaut la marche locale. Le contrat testable : exact PRESQUE
    // partout, jamais pire que le plus grand escarpement du champ.
    // ⚠ GARDE ROBUSTE AU RÉGLAGE : un seuil global (« 85 % de points exacts »)
    // casse dès qu'on accentue le champ — plus de massifs = plus de bandes
    // d'escarpement, où l'inexactitude est GÉOMÉTRIQUEMENT légitime. La bonne
    // formulation : EXACT PARTOUT en terrain localement plat (les 4 cellules
    // voisines au même niveau), borné par la marche du champ ailleurs.
    const U = reliefUnit();
    let liftedSeen = 0, flatN = 0, flatBad = 0, worst = 0;
    for (let gy = 25; gy < 75; gy += 2) {
      for (let gx = 25; gx < 75; gx += 2) {
        const wx = gx * CM.TILE + 9, wy = gy * CM.TILE + 21;
        if (terrainZ(wx, wy) > 0) liftedSeen += 1;
        const p = worldToScreen(wx, wy);
        const q = screenToWorld(p.x, p.y);
        const err = Math.max(Math.abs(q.x - wx), Math.abs(q.y - wy));
        if (err > worst) worst = err;
        const lv = cellLevelU(gx, gy);
        let flat = cellLevelU(gx + 1, gy) === lv && cellLevelU(gx - 1, gy) === lv
          && cellLevelU(gx, gy + 1) === lv && cellLevelU(gx, gy - 1) === lv;
        // …et HORS DE L'OMBRE d'une falaise : un escarpement jusqu'à ~6 cellules
        // au NORD-OUEST (la diagonale écran) projette sur les mêmes pixels que ce
        // point — deux sols sous le même curseur, l'inexactitude y est légitime.
        // Bande à ±1 : la diagonale d'un point quelconque de la cellule traverse
        // aussi les cellules décalées d'un cran de part et d'autre.
        for (let kk = 1; flat && kk <= 7; kk += 1) {
          if (cellLevelU(gx - kk, gy - kk) > lv
            || cellLevelU(gx - kk - 1, gy - kk) > lv
            || cellLevelU(gx - kk, gy - kk - 1) > lv) flat = false;
        }
        if (flat) { flatN += 1; if (err > 1e-9) flatBad += 1; }
      }
    }
    expect(liftedSeen).toBeGreaterThan(50);              // le test couvre bien du relief
    expect(flatN).toBeGreaterThan(60);                   // et assez de plat hors ombre
    expect(flatBad).toBe(0);                             // exact PARTOUT hors escarpement
    // Jamais pire que le plafond d'une marche du champ (massif entier).
    expect(worst).toBeLessThanOrEqual((TERRAIN.valley + TERRAIN.hills * 1.2) * U);
  });

  it('terrain coupé : inverse EXACT du plan, au bit près', () => {
    TERRAIN.amp = 0;
    const p = worldToScreen(1234.5, 987.25);
    const q = screenToWorld(p.x, p.y);
    expect(q.x).toBe(1234.5);
    expect(q.y).toBe(987.25);
  });
});
