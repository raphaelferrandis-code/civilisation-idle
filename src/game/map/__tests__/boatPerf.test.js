// LES CUISSONS DE BATEAUX NE SE REFONT PLUS POUR RIEN (audit du 05/10, PERF-14).
//
// Un bateau se cuit à chaque nouveau cap et chaque nouvelle pose (10 à 38 ms pour un
// marchand). Trois économies, chacune À L'IMAGE PRÈS — c'est ce que ces tests tiennent :
//   · un modèle `seedless` (drague, sentinelles, plaisance cosmique) ne lit pas la
//     graine : sa cuisson sert à tous les bateaux du modèle ;
//   · une pose déclarée immobile (`still`) l'est vraiment : la barque à voile latine
//     ne rame pas, la pirogue à quai a rentré ses pagaies ;
//   · le budget de cuisson se compte en millisecondes, partagé par la flotte, les
//     amarres et le métro, et laisse toujours passer la première cuisson d'une frame.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BOAT_MODELS } from '../iso/boatKits.js';
import { bakeBoat, dirTheta } from '../iso/boatBake.js';
import { VEHICLE_BAKE, vehicleBakeOpen, vehicleBakeTimed } from '../iso/vehicleBakeBudget.js';

const bytes = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
// Tout ce que boatKit garde d'une cuisson : image, reflet, ancres, équipage.
const sig = (b) => [bytes(b.img.data).toString('base64'), bytes(b.refl.data).toString('base64'),
  JSON.stringify([b.img.ox, b.img.oy, b.img.w, b.img.h, b.refl.ox, b.refl.oy, b.anchors,
    (b.crew || []).map((c) => [c.X, c.Y, c.pose, c.phi, c.id, c.x0, c.y0, c.w, c.h, bytes(c.mask).toString('base64')])])].join('|');

describe('bateaux : une cuisson partagée quand le dessin est le même', () => {
  it('les modèles sans graine donnent la même image quelle que soit la graine', () => {
    const seedless = Object.keys(BOAT_MODELS).filter((id) => BOAT_MODELS[id].seedless);
    // La drague (fonte), et à chaque âge cosmique sentinelle, esquif et voile.
    expect(seedless.sort()).toEqual(['drague', 'esquif-7', 'esquif-8', 'esquif-9', 'sentinelle-7', 'sentinelle-8', 'sentinelle-9', 'voile-7', 'voile-8', 'voile-9']);
    for (const id of ['drague', 'sentinelle-7', 'esquif-9', 'voile-8']) {
      const M = BOAT_MODELS[id];
      for (const [dir, state] of [[3, 'cruise'], [21, 'dock']]) {
        const a = sig(bakeBoat(M, dirTheta(dir), { variant: M.variant(1), state, k: 0.7 }));
        for (const seed of [977, 6421]) {
          expect(sig(bakeBoat(M, dirTheta(dir), { variant: M.variant(seed), state, k: 0.7 })), `${id} cap ${dir} graine ${seed}`).toBe(a);
        }
      }
    }
  });

  it('une pose immobile (`still`) est la même image que toutes les poses de son état', () => {
    const cases = [['barque-latine', ['cruise', 'salute', 'dock']], ['pirogue', ['dock']], ['pirogue-peche', ['dock']]];
    for (const [id, states] of cases) {
      const M = BOAT_MODELS[id];
      for (const state of states) {
        expect(M.anim.still, `${id} ${state}`).toContain(state);
        const still = sig(bakeBoat(M, dirTheta(9), { variant: M.variant(5), state, k: 1.2 }));
        for (let f = 0; f < M.anim.frames; f += 1) {
          const k = (f / M.anim.frames) * Math.PI * 2;
          expect(sig(bakeBoat(M, dirTheta(9), { variant: M.variant(5), state, k })), `${id} ${state} pose ${f}`).toBe(still);
        }
      }
    }
  });
});

describe('budget de cuisson des véhicules, en millisecondes', () => {
  afterEach(() => vi.restoreAllMocks());
  it('la première cuisson passe toujours, les suivantes tant que la frame reste sous le budget', () => {
    let t = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    const bake = (ms) => vehicleBakeTimed(() => { t += ms; return true; });
    // Frame 1 : un marchand de 12 ms passe, puis plus rien.
    expect(vehicleBakeOpen(1)).toBe(true);
    bake(12);
    expect(vehicleBakeOpen(1)).toBe(false);
    // Frame 2 : des voitures d'1 ms passent jusqu'au budget.
    let n = 0;
    while (vehicleBakeOpen(2) && n < 50) { bake(1); n += 1; }
    expect(n).toBe(VEHICLE_BAKE.ms);
    // Une horloge de frame figée (capture) repart à neuf après une demi-seconde.
    expect(vehicleBakeOpen(2)).toBe(false);
    t += 600;
    expect(vehicleBakeOpen(2)).toBe(true);
  });
});
