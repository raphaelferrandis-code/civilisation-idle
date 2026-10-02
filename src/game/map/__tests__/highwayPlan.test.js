// L'AUTOROUTE DE L'ARTÈRE (lot 2 de docs/PLAN-ETAGES.md) — le plan pur.
// Ce que le rendu suppose : au sol près du fleuve et au-delà de la place centrale,
// un tablier plein entre deux rampes, un échangeur figé sur une rue transversale,
// des pelouses qui ne mordent ni l'eau ni les sites de la ville.
import { describe, it, expect } from 'vitest';
import { HIGHWAY, arteryBanks, bankProfile, deckZAt, interchangeLawns, crossGaps, planHighway, bankRibbon, loopRibbons } from '../procedural/highwayPlan.js';

// Grille synthétique : fleuve sur les rangées 48-52, artère colonnes 40-41 de 0 à 99,
// rues transversales toutes les 5 rangées (0, 5, 10, …) sur toute la largeur.
const N = 100, AX = 40;
const wet = (x, y) => y >= 48 && y <= 52;
const road = (x, y) => !wet(x, y) && ((x === AX || x === AX + 1) || (y % 5 === 0));
const city = (x, y) => y >= 8 && y <= 92;

describe('arteryBanks — les deux rives', () => {
  it('trouve les deux rives et s\'arrête à la lisière', () => {
    const b = arteryBanks({ N, ax: AX, isWet: wet, isRoad: road, inCity: city });
    expect(b.map((q) => q.sign).sort()).toEqual([-1, 1]);
    const north = b.find((q) => q.sign === -1), south = b.find((q) => q.sign === 1);
    expect(north.y0).toBe(47); expect(south.y0).toBe(53);
    // la ville finit en y 8 (nord) et 92 (sud) : la rive s'arrête là
    expect(north.y0 - north.len + 1).toBe(8);
    expect(south.y0 + south.len - 1).toBe(92);
  });
  it('pas de fleuve, pas d\'autoroute', () => {
    expect(arteryBanks({ N, ax: AX, isWet: () => false, isRoad: road })).toEqual([]);
  });
});

describe('bankProfile — le profil', () => {
  const bank = { sign: 1, y0: 53, len: 40 };
  it('au sol près de l\'eau, puis rampe, plein, redescente', () => {
    const p = bankProfile(bank, []);
    expect(p.s0).toBe(HIGHWAY.farStart);
    expect(deckZAt(0, p)).toBe(0);
    expect(deckZAt(p.s0 + p.ramp + 1, p)).toBe(HIGHWAY.deck);
    expect(deckZAt(p.s1 + p.ramp + 1, p)).toBe(0);
  });
  it('la place centrale repousse la rampe au-delà d\'elle', () => {
    const p = bankProfile(bank, [60, 61, 62, 63, 64]);
    expect(p.s0).toBe(64 - 53 + 1 + HIGHWAY.coreGap);
    // aucune rangée de la place sous une hauteur non nulle
    for (const y of [60, 61, 62, 63, 64]) expect(deckZAt(y - 53 + 0.5, p)).toBe(0);
  });
  it('une rive courte raccourcit ses rampes, une trop courte renonce', () => {
    const short = bankProfile({ sign: 1, y0: 53, len: 30 }, []);
    expect(short).not.toBeNull();
    expect(short.ramp).toBeLessThan(HIGHWAY.ramp);
    expect(short.ramp).toBeGreaterThanOrEqual(HIGHWAY.minRamp);
    expect(bankProfile({ sign: 1, y0: 53, len: 15 }, [])).toBeNull();
  });
  it('la hauteur ne dépasse jamais le tablier et ne saute pas', () => {
    const p = bankProfile(bank, []);
    let prev = 0;
    for (let s = 0; s <= bank.len; s += 0.25) {
      const z = deckZAt(s, p);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(HIGHWAY.deck);
      expect(Math.abs(z - prev)).toBeLessThan(0.15);
      prev = z;
    }
  });
});

describe('l\'échangeur', () => {
  it('crossGaps : la rue s\'arrête avant l\'artère → les cases à paver', () => {
    const isR = (x, y) => (x === AX || x === AX + 1) || (y === 20 && (x <= AX - 3 || x >= AX + 3));
    expect(crossGaps(AX, 20, isR)).toEqual([[AX - 1, 20], [AX - 2, 20], [AX + 2, 20]]);
    expect(crossGaps(AX, 21, isR)).toBeNull();
  });
  it('les pelouses sont côté lisière, de part et d\'autre du tablier', () => {
    const cells = interchangeLawns(AX, 70, 1);
    expect(cells).toHaveLength(2 * HIGHWAY.lawn * HIGHWAY.lawn);
    for (const [x, y] of cells) {
      expect(y).toBeGreaterThan(70);
      expect(x < AX || x > AX + 1).toBe(true);
    }
  });
  it('planHighway : figé, déterministe, pelouses jamais sur un site réservé', () => {
    const reserved = new Set(['36,74', '37,74']);
    const args = { N, ax: AX, cx: 50, cy: 50, band: 6, isWet: wet, isRoad: road, inCity: city, coreRows: [], hard: (x, y) => wet(x, y) || reserved.has(x + ',' + y) };
    const a = planHighway(args), b = planHighway(args);
    expect(a).toEqual(b);
    expect(a.interchange).not.toBeNull();
    for (const k of a.lawn) expect(reserved.has(k)).toBe(false);
    // le choix figé est relu tel quel
    const fixed = planHighway({ ...args, fix: { sign: a.interchange.sign, dy: a.interchange.yc - 50 } });
    expect(fixed.interchange).toEqual(a.interchange);
  });
  it('avant la bande 6 : rien', () => {
    expect(planHighway({ N, ax: AX, cx: 50, cy: 50, band: 5, isWet: wet, isRoad: road })).toBeNull();
  });
});

describe('les rubans', () => {
  const H = planHighway({ N, ax: AX, cx: 50, cy: 50, band: 6, isWet: wet, isRoad: road, inCity: city, coreRows: [] });
  it('le tablier suit l\'axe de l\'artère, rangé vers +y', () => {
    for (const b of H.banks) {
      const r = bankRibbon(H, b);
      for (const p of r.pts) expect(p.x).toBe(AX + 1);
      for (let i = 1; i < r.pts.length; i += 1) expect(r.pts[i].y).toBeGreaterThan(r.pts[i - 1].y);
    }
  });
  it('les boucles partent du tablier en hauteur et finissent au sol', () => {
    const loops = loopRibbons(H);
    expect(loops).toHaveLength(2);
    for (const r of loops) {
      expect(r.pts[0].z).toBe(H.deck);
      expect(r.pts[r.pts.length - 1].z).toBe(0);
      // elles restent côté lisière de la rue transversale
      const ystreet = H.interchange.yc + 0.5;
      for (const p of r.pts.slice(2)) expect((p.y - ystreet) * H.interchange.sign).toBeGreaterThan(-0.05);
    }
  });
});
