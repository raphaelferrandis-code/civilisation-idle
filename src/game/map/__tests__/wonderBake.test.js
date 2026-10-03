// LES MERVEILLES CUITES PAR LE CODE (docs/PLAN-MERVEILLES.md, 2026-10-02).
//
// Les six recettes de wonderBake.js, leurs lieux (wonderPlace.js) et la matière
// de l'ère (wonderKits.js) sont purs : on les cuit ici en Node, à tous les rangs
// et dans les ères où chaque merveille peut se dresser, et on vérifie ce qu'un
// œil ne verrait qu'au hasard d'une partie — une recette qui casse dans une ère
// rare, un marqueur de nuit oublié dans l'image, un objet sans position.
import { describe, it, expect } from 'vitest';
import * as WB from '../iso/wonderBake.js';
import { wonderKitForBand } from '../iso/wonderKits.js';
import { placePlan, gardenPlan, bakePlaceGround, bakeDecor } from '../iso/wonderPlace.js';
import { cmWonderSpriteDims, CM_WONDERS } from '../layout.js';

const T = 32, PPT = 34;
const RECIPE = {
  dynasty1: 'bakeMausoleum', pop1m: 'bakeColumn', era_kingdom: 'bakePalace',
  era_empire: 'bakeCathedral', era_mega: 'bakeNeedle', era_singularity: 'bakeEye',
};
const BANDS = [0, 3, 5, 6, 9];
const PROPS = new Set(['flame', 'statue', 'flag', 'glow', 'beam', 'beacon', 'halo', 'brazier', 'gaslamp', 'ledlamp', 'jet']);
const dims = (id, t) => {
  const d = cmWonderSpriteDims(id, t);
  return { B: (d.nw / (2 * PPT)) * T, H: (d.nh / PPT) * T };
};
const bake = (id, t, band, winter = false) => {
  const { B, H } = dims(id, t);
  return WB[RECIPE[id]](wonderKitForBand(band, winter), t, B, H);
};
const opaque = (R) => { let n = 0; for (let i = 3; i < R.data.length; i += 4) if (R.data[i]) n += 1; return n; };
const hash = (R) => { let h = 2166136261; for (let i = 0; i < R.data.length; i += 1) h = Math.imul(h ^ R.data[i], 16777619); return h >>> 0; };

describe('les six recettes', () => {
  it('chaque merveille cuit à chaque rang dans chaque ère, sans marqueur de nuit resté dans l image', () => {
    for (const w of CM_WONDERS) {
      expect(RECIPE[w.id], w.id).toBeTruthy();
      for (let t = 1; t <= 5; t += 1) {
        for (const band of BANDS) {
          const out = bake(w.id, t, band);
          const tag = `${w.id} rang ${t} bande ${band}`;
          expect(opaque(out.R), tag).toBeGreaterThan(200);
          let marks = 0;
          for (let i = 3; i < out.R.data.length; i += 4) if (out.R.data[i] === 253 || out.R.data[i] === 254) marks += 1;
          expect(marks, `${tag} : alpha 253/254 restants`).toBe(0);
          for (const p of out.props) {
            expect(PROPS.has(p.prop), `${tag} : objet inconnu ${p.prop}`).toBe(true);
            const pos = p.rx != null ? [p.rx, p.ry] : [p.x, p.y, p.h];
            expect(pos.every(Number.isFinite), `${tag} : ${p.prop} sans position`).toBe(true);
          }
        }
      }
    }
  });

  it('une cuisson est déterministe (même merveille, même image)', () => {
    for (const id of Object.keys(RECIPE)) expect(hash(bake(id, 5, 4).R), id).toBe(hash(bake(id, 5, 4).R));
  });

  it('chaque merveille grandit d un rang à l autre', () => {
    for (const id of Object.keys(RECIPE)) {
      expect(opaque(bake(id, 5, 4).R), id).toBeGreaterThan(opaque(bake(id, 1, 4).R));
    }
  });

  it('la matière change avec l ère : brique (fonte), béton (néon), lumière (cosmiques)', () => {
    const k = (b) => wonderKitForBand(b);
    expect([4, 5, 6, 7].map((b) => k(b).wall)).toEqual(['ashlar', 'brick', 'panel', 'tech']);
    expect(hash(bake('era_kingdom', 3, 4).R)).not.toBe(hash(bake('era_kingdom', 3, 5).R));
    // Les trois âges cosmiques ne partagent plus la même pierre.
    expect(k(7).pal.stone[2]).not.toBe(k(9).pal.stone[2]);
  });

  it('la nuit allume vitres et vitraux ; l hiver pose la neige', () => {
    const pal = bake('era_kingdom', 5, 4);
    expect(pal.N, 'palais : calque de nuit').toBeTruthy();
    expect(opaque(pal.N)).toBeGreaterThan(50);
    expect(bake('era_empire', 5, 4).N, 'cathédrale : vitraux').toBeTruthy();
    expect(hash(bake('era_kingdom', 5, 4, true).R)).not.toBe(hash(pal.R));
  });

  it('les âges modernes portent leur balise, les âges cosmiques leur halo', () => {
    const kinds = (b) => bake('dynasty1', 5, b).props.map((p) => p.prop);
    expect(kinds(4)).not.toContain('beacon');
    expect(kinds(6)).toContain('beacon');
    expect(kinds(9)).toContain('halo');
  });
});

describe("le cœur animé de l'Œil", () => {
  it('rangs III à V : la sphère et ses anneaux tournent, image par image', () => {
    for (let t = 3; t <= 5; t += 1) {
      const out = bake('era_singularity', t, 4);
      expect(out.core, `rang ${t}`).toBeTruthy();
      const K = wonderKitForBand(4);
      const a = WB.bakeEyeCore(K, out.core, 0, 32), b = WB.bakeEyeCore(K, out.core, 8, 32);
      expect(opaque(a.R)).toBeGreaterThan(100);
      expect(hash(a.R), `rang ${t} : l'image 8 doit différer de l'image 0`).not.toBe(hash(b.R));
      expect(a.N, 'l iris luit la nuit').toBeTruthy();
    }
  });
});

describe('le lieu de chaque merveille', () => {
  it('chaque lieu se cuit, son décor aussi, à chaque rang', () => {
    const K = wonderKitForBand(4);
    for (const id of Object.keys(RECIPE)) {
      if (id === 'era_mega') continue;
      for (let t = 1; t <= 5; t += 1) {
        const { B } = dims(id, t);
        const half = (Math.ceil(B / T / 2 + 1.5) + 0.5) * T;
        const plan = placePlan(id, t, K, B, half);
        expect(opaque(bakePlaceGround(plan, half)), `${id} rang ${t}`).toBeGreaterThan(1000);
        for (const d of plan.decor) expect(opaque(bakeDecor(d.kind, K, d.s)), `${id} : ${d.kind}`).toBeGreaterThan(5);
        for (const p of plan.props) expect(PROPS.has(p.prop), `${id} : ${p.prop}`).toBe(true);
      }
    }
  });

  it('le jardin de l anneau laisse le lieu intact et se plante d arbres', () => {
    const K = wonderKitForBand(4);
    const g = gardenPlan(K, 112, 240);
    expect(g.col(0, 0)).toBeNull();
    expect(g.col(100, -100)).toBeNull();
    expect(g.col(180, 0)).toBeTruthy();
    expect(g.decor.length).toBeGreaterThan(4);
  });
});

describe("l'îlot de l'Aiguille", () => {
  const il = { rx: 7.6, ry: 2.4, tx: 0.8, ty: -0.6 };
  it('chaque rang cuit sa base, son reflet et ses objets, et monte plus haut que le précédent', async () => {
    const { isleModel, bakeIsleBase, islePlan, bakeIsleTall } = await import('../iso/wonderIsle.js');
    let prevTop = -1;
    for (let t = 1; t <= 5; t += 1) {
      for (const band of [3, 5, 9]) {
        const K = wonderKitForBand(band);
        const base = bakeIsleBase(K, t, il);
        expect(opaque(base.R), `rang ${t} bande ${band}`).toBeGreaterThan(5000);
        expect(opaque(base.Rr), 'le reflet ne garde que le mur et les rochers').toBeLessThan(opaque(base.R));
        const plan = islePlan(K, t, il);
        for (const q of plan.talls) expect(opaque(bakeIsleTall(q.kind, K, t).R), q.kind).toBeGreaterThan(20);
        for (const p of plan.props) expect(PROPS.has(p.prop), p.prop).toBe(true);
      }
      const top = isleModel(t, il).top;
      expect(top, `rang ${t}`).toBeGreaterThan(prevTop);
      prevTop = top;
    }
  });

  it("l'Aiguille se pose sur l'esplanade (opts.lift)", () => {
    const { B, H } = dims('era_mega', 5);
    const flat = bake('era_mega', 5, 4), lifted = WB.bakeNeedle(wonderKitForBand(4), 5, B, H, { lift: 78 });
    // Même cadre, monté de la hauteur de l'esplanade.
    expect(lifted.R.oy).toBe(flat.R.oy - 78);
  });
});
