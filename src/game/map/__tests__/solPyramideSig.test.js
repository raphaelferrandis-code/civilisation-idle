// L'INVALIDATION PARTIELLE — garde du lot 3 de PLAN-SOL-PYRAMIDE.
// Au recompute du plan, une tuile ne se recuit que si SES cellules ont changé.
// Ce que ces tests verrouillent : la signature d'une tuile est stable, elle
// change quand une cellule de la tuile change (route, urbain, bâti, cour), elle
// change aussi pour une cellule dans la marge de deux cellules (les franges et
// les faces lisent le voisinage), et elle ne bouge PAS pour une cellule loin.
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../layout.js';
import { tileSig, revealTouched } from '../iso/solPyramideFrame.js';
import { groundContentSig, groundKeySuffix } from '../iso/isoGroundBake.js';
import { MEADOW } from '../iso/isoMeadow.js';
import { ensureQuayGate } from '../quaysAndRiot.js';
import { BEACH } from '../iso/isoGroundTiles.js';

const savedPv = CM.previewWonder, savedReveal = CM.engineHomeReveal;
afterEach(() => { CM.previewWonder = savedPv; CM.engineHomeReveal = savedReveal; });

// Un plan minimal : les seuls champs que la signature lit.
function planVide() {
  return {
    roadSet: new Set(), roadMap: new Map(), urbanSet: new Set(), meadow: new Set(),
    wonderGround: new Set(), river: { present: false, cells: new Set() }, tiles: [], gridN: 200,
  };
}
const S = 256, z = 1;
// Tuile (0,0) à z 1 : cellules gx 0..12, gy −4..8 (+2 de marge) ; tuile (10,10) : gx ~120..132, gy ~36..48.
const A = [0, 0], B = [10, 10];
const sig = (L, t) => tileSig(L, z, t[0], t[1], S);

describe('tileSig — stable, locale, avec sa marge', () => {
  it('le même plan donne la même signature, deux plans vides aussi', () => {
    const L = planVide();
    expect(sig(L, A)).toBe(sig(L, A));
    expect(sig(planVide(), A)).toBe(sig(L, A));
  });
  it('une route ajoutée dans la tuile change SA signature, pas celle d une tuile lointaine', () => {
    const L0 = planVide(), L1 = planVide();
    L1.roadSet.add('5,2'); L1.roadMap.set('5,2', { rank: 'main', mask: 5 });
    expect(sig(L1, A)).not.toBe(sig(L0, A));
    expect(sig(L1, B)).toBe(sig(L0, B));
  });
  it('le masque de connexion d une route compte (le tracé en dépend)', () => {
    const L0 = planVide(), L1 = planVide();
    L0.roadSet.add('5,2'); L0.roadMap.set('5,2', { rank: 'main', mask: 5 });
    L1.roadSet.add('5,2'); L1.roadMap.set('5,2', { rank: 'main', mask: 7 });
    expect(sig(L1, A)).not.toBe(sig(L0, A));
  });
  it('un bâti ou une cellule urbaine change la signature de sa tuile', () => {
    const L0 = planVide(), L1 = planVide(), L2 = planVide();
    L1.tiles.push({ gx: 6, gy: 1, size: 1 });
    L2.urbanSet.add('6,1');
    expect(sig(L1, A)).not.toBe(sig(L0, A));
    expect(sig(L2, A)).not.toBe(sig(L0, A));
    expect(sig(L1, B)).toBe(sig(L0, B));
  });
  it('une cellule dans la marge de deux cellules compte, au-delà non', () => {
    const L0 = planVide(), Lm = planVide(), Lf = planVide();
    // Tuile A couvre gx 0..12 (+2) : gx 14 est dans la marge, gx 30 est loin.
    Lm.roadSet.add('14,2'); Lm.roadMap.set('14,2', { rank: 'main', mask: 1 });
    Lf.roadSet.add('30,2'); Lf.roadMap.set('30,2', { rank: 'main', mask: 1 });
    expect(sig(Lm, A)).not.toBe(sig(L0, A));
    expect(sig(Lf, A)).toBe(sig(L0, A));
  });
});

// LA RÉVÉLATION PER-ACHAT : une maison-moteur pré-posée n'a d'allée de seuil
// qu'une fois révélée, et un achat ne recalcule pas le plan. C'est donc la
// signature de la tuile qui doit voir la maison apparaître — sinon la tuile reste
// fraîche et la maison n'a jamais son seuil — sans rien remuer au loin, sinon
// chaque achat recuirait la carte entière.
describe('tileSig — la maison-moteur qu un achat révèle', () => {
  const planMaison = (type = 'enginehome') => {
    const L = planVide();
    L.tiles.push({ gx: 6, gy: 1, spanX: 1, spanY: 1, type, revealIdx: 3 });
    return L;
  };
  it('la maison révélée change la signature de SA tuile, pas celle d une tuile lointaine', () => {
    const L = planMaison();
    CM.engineHomeReveal = 3;                  // index 3 pas encore atteint : masquée
    const cacheeA = sig(L, A), cacheeB = sig(L, B);
    CM.engineHomeReveal = 4;                  // un achat de plus : révélée
    expect(sig(L, A)).not.toBe(cacheeA);
    expect(sig(L, B)).toBe(cacheeB);
  });
  it('un achat qui révèle une AUTRE maison ne touche pas cette tuile', () => {
    const L = planMaison();
    CM.engineHomeReveal = 5;
    const a = sig(L, A);
    CM.engineHomeReveal = 9;                  // la maison 3 est visible des deux côtés
    expect(sig(L, A)).toBe(a);
  });
  it('une habitation ordinaire ignore le compteur', () => {
    const L = planMaison('house');
    CM.engineHomeReveal = 0;
    const a = sig(L, A);
    CM.engineHomeReveal = 10;
    expect(sig(L, A)).toBe(a);
  });
  // La frame ne re-juge que les tuiles que revealTouched désigne : elles doivent
  // être EXACTEMENT celles dont la signature change. Une de moins, et une maison
  // apparaît sans son seuil ; une de plus, et l'achat recuit pour rien.
  it('revealTouched désigne exactement les tuiles dont la signature change', () => {
    const L = planMaison();
    const tuiles = [];
    for (let ty = -3; ty <= 3; ty += 1) for (let tx = -3; tx <= 3; tx += 1) tuiles.push({ z, tx, ty, S });
    const touchees = new Set(revealTouched(L, 3, 4, tuiles));
    expect(touchees.size).toBeGreaterThan(0);
    expect(touchees.size).toBeLessThan(tuiles.length);
    for (const e of tuiles) {
      CM.engineHomeReveal = 3;
      const avant = tileSig(L, z, e.tx, e.ty, S);
      CM.engineHomeReveal = 4;
      expect(touchees.has(e)).toBe(tileSig(L, z, e.tx, e.ty, S) !== avant);
    }
  });
  it('un compteur qui bouge sans faire changer aucune maison ne touche rien', () => {
    expect(revealTouched(planMaison(), 5, 9, [{ z, tx: A[0], ty: A[1], S }])).toEqual([]);
  });
});

// LA PORTE DE FRAÎCHEUR (audit du 2026-10-05, BUG-60). groundContentSig décide si
// la frame re-juge les tuiles : même empreinte, aucune n'est re-jugée. Elle ne
// comptait que des TAILLES d'ensembles — un bâtiment posé sans route nouvelle
// passait inaperçu, et sa tuile n'avait ni allée de seuil ni cour.
describe('groundContentSig — une empreinte du contenu, pas des tailles', () => {
  const plan = () => {
    const L = planVide();
    for (const k of ['4,1', '5,1', '6,1', '6,2']) L.urbanSet.add(k);
    L.roadSet.add('5,2'); L.roadMap.set('5,2', { rank: 'main', mask: 5 });
    L.tiles.push({ gx: 4, gy: 1, size: 1, type: 'house' });
    return L;
  };
  it('mêmes tailles, une emprise de plus : signatures différentes', () => {
    const L0 = plan(), L1 = plan();
    L1.tiles.push({ gx: 6, gy: 1, size: 1, type: 'scribes', buildingId: 'scribes' });
    expect(L1.urbanSet.size).toBe(L0.urbanSet.size);
    expect(L1.roadSet.size).toBe(L0.roadSet.size);
    expect(groundContentSig(L1)).not.toBe(groundContentSig(L0));
  });
  it('une emprise qui se DÉPLACE, un masque ou une matière de route qui change : signatures différentes', () => {
    const L0 = plan(), Lm = plan(), Lr = plan(), Lp = plan(), Lu = plan();
    Lm.tiles[0].gx = 6;
    Lr.roadMap.get('5,2').mask = 7;
    Lp.roadMap.get('5,2').pave = 2;
    Lu.urbanSet.delete('6,2'); Lu.urbanSet.add('7,2');
    const s0 = groundContentSig(L0);
    for (const L of [Lm, Lr, Lp, Lu]) expect(groundContentSig(L)).not.toBe(s0);
  });
  it('même contenu, bâti dans un autre ordre (un recompute sans effet) : même signature', () => {
    const L0 = plan(), L1 = planVide();
    for (const k of ['6,2', '6,1', '5,1', '4,1']) L1.urbanSet.add(k);
    L1.roadMap.set('5,2', { rank: 'main', mask: 5 }); L1.roadSet.add('5,2');
    L1.tiles.push({ gx: 4, gy: 1, size: 1, type: 'house' });
    expect(L1).not.toBe(L0);
    expect(groundContentSig(L1)).toBe(groundContentSig(L0));
  });
});

// CE QUI DÉPEND DE PLUS LOIN QUE LA MARGE (audit du 2026-10-05, BUG-100). Les prés
// suivent la distance au fleuve jusqu'à MEADOW.water = 6 cellules, la grève une bande
// mesurée sur plusieurs samples : leurs causes sortent des deux cellules de marge.
describe('tileSig — prés près du fleuve et grève', () => {
  it('un fleuve à 4 cellules HORS de la boîte change la signature (herbe grasse), à 16 non', () => {
    expect(MEADOW.on).toBe(true);
    const fleuve = (cells) => { const L = planVide(); L.river = { present: true, cells: new Set(cells) }; return L; };
    // Tuile A : boîte gx −2..14 (marge comprise) — gx 18 est à 4 cellules du bord, gx 30 à 16.
    const L0 = fleuve(['60,60']), Lp = fleuve(['60,60', '18,2']), Ll = fleuve(['60,60', '30,2']);
    expect(sig(Lp, A)).not.toBe(sig(L0, A));
    expect(sig(Ll, A)).toBe(sig(L0, A));
  });
  it('une cellule de grève dans la tuile change sa signature, même sans aucune autre différence', () => {
    // Un fleuve minimal, assez pour que le masque du quai existe (beachZone le lit).
    const mk = () => {
      const L = planVide();
      const samples = [];
      for (let i = 0; i < 12; i += 1) samples.push({ x: -10 + i * 3, y: 20, hw: 2 });
      L.river = { present: true, samples, cells: new Set() };
      return L;
    };
    const saved = { layout: CM.layout, at: CM.layoutRecomputeAt, gate: CM.quayGate, banks: CM.quayBankCells };
    try {
      const L0 = mk(), L1 = mk();
      CM.layoutRecomputeAt = 4242;
      // La grève de chaque plan, posée dans sa mémoïsation (même clé que beachZone) :
      // L1 porte une cellule de sable de plus, dans la tuile A.
      for (const [L, cells] of [[L0, ['3,3']], [L1, ['3,3', '6,2']]]) {
        CM.layout = L; CM.quayGate = null; ensureQuayGate();
        const g = CM.quayGate;
        expect(g).toBeTruthy();
        L._beachZone = { key: g.key + ':' + BEACH.depth + ':' + BEACH.ramp, cells: new Set(cells) };
      }
      CM.layout = L0; CM.quayGate = null; ensureQuayGate();
      const s0 = sig(L0, A);
      CM.layout = L1; CM.quayGate = null; ensureQuayGate();
      expect(sig(L1, A)).not.toBe(s0);
    } finally {
      CM.layout = saved.layout; CM.layoutRecomputeAt = saved.at; CM.quayGate = saved.gate; CM.quayBankCells = saved.banks;
    }
  });
  it('la neige de grève (__beach.snow) entre dans le suffixe : la bascule recuit le sol', () => {
    const L = { counts: { eraBand: 3 } }, avant = BEACH.snow;
    try {
      BEACH.snow = false; const a = groundKeySuffix(L);
      BEACH.snow = true; const b = groundKeySuffix(L);
      expect(b).not.toBe(a);
    } finally { BEACH.snow = avant; }
  });
});
