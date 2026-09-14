// LES TRANCHES DE SOL SUIVENT LE COÛT MESURÉ — garde du 2026-09-14.
// Chez Raph (mégapole, zoom 0,5) : deux tranches de 837 px à 65-80 ms, budget
// affiché 8 ms. Le nombre de tranches était fixé d'avance par une estimation
// fausse d'un facteur 4. Ces tests verrouillent l'auto-correction : dès la
// deuxième tranche, le coût retombe dans le budget, sans estimation exacte.
import { describe, it, expect } from 'vitest';
import { firstStripH, nextStripH, STRIP_BUDGET_MS, STRIP_MIN_PX, STRIP_FIRST_MAX_PX } from '../iso/solStrips.js';

describe('nextStripH — la hauteur suit le coût', () => {
  it('une tranche 4× trop chère → la suivante fait un quart', () => {
    expect(nextStripH(32, 800, 8, 5000)).toBe(200);
  });
  it('une tranche bon marché grandit, mais jamais plus du double', () => {
    expect(nextStripH(1, 100, 8, 5000)).toBe(200);     // 8/(1/100) = 800 → plafonné à 200
    expect(nextStripH(0, 100, 8, 5000)).toBe(200);     // gratuite : ×2 aussi
  });
  it('bornes : jamais sous le minimum, jamais au-delà du reste', () => {
    expect(nextStripH(400, 100, 8, 5000)).toBe(STRIP_MIN_PX);
    expect(nextStripH(4, 100, 8, 37)).toBe(37);
    expect(nextStripH(4, 100, 8, 0)).toBe(0);
  });
});

describe('firstStripH — la première tranche part de l estimation', () => {
  it('un plein estimé à 640 ms se découpe en 80 tranches de 8 ms', () => {
    expect(firstStripH(640, 1600, 8)).toBe(20);
  });
  it('sans estimation, la première tranche reste plafonnée ; jamais plus de 200 tranches', () => {
    expect(firstStripH(0, 1600, 8)).toBe(STRIP_FIRST_MAX_PX);
    expect(firstStripH(1e9, 1600, 8)).toBe(STRIP_MIN_PX);
  });
  it('une estimation 4× trop basse ne peut plus produire une première tranche géante', () => {
    // Raph, plancher 0,25 : est ≈ 40 ms pour un vrai coût de 160 → l'ancien
    // découpage donnait 168-189 px (53-55 ms). Plafond : 64 px.
    expect(firstStripH(40, 1674, 8)).toBeLessThanOrEqual(STRIP_FIRST_MAX_PX);
  });
});

// Un sol simulé : coût = fixe + proportionnel à la hauteur (la vraie forme des
// passes : clip et fond à prix fixe, cellules au prorata). L'estimation de
// départ est FAUSSE d'un facteur 4 (celle de Raph). Toutes les tranches après
// la première doivent tenir dans ~1,5 budget, et la couverture doit être totale.
describe('un plein en tranches converge malgré une estimation fausse', () => {
  it('estimation ÷4 : dès la 2e tranche, coût ≤ 1,5 × budget', () => {
    const fullH = 1674, fixed = 0.8, perPx = 0.09;       // vrai coût : ~150 ms
    const est = 150 / 4;
    const cost = (h) => fixed + perPx * h;
    let y = 0, h = firstStripH(est, fullH, STRIP_BUDGET_MS);
    const costs = [];
    let n = 0;
    while (y < fullH && n < 500) {
      const h1 = Math.min(h, fullH - y);
      const c = cost(h1);
      costs.push(c);
      y += h1; n += 1;
      h = nextStripH(c, h1, STRIP_BUDGET_MS, fullH - y);
    }
    expect(y).toBe(fullH);
    // Le plafond de la première tranche absorbe l'estimation fausse, l'adaptation
    // tient les suivantes : AUCUNE tranche ne dépasse 1,5 budget.
    for (const c of costs) expect(c).toBeLessThanOrEqual(STRIP_BUDGET_MS * 1.5);
    expect(n).toBeLessThan(60);                          // et ça ne dégénère pas en poussière
  });
});
