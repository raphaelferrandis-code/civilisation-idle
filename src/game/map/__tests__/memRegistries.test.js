// LES REGISTRES DE LA FLOTTE NE GROSSISSENT PLUS SANS FIN (audit du 05/10, MEM-9).
//
// Un bateau ne revient jamais : chaque naissance prend un id neuf (ctl.nextId). Or
//   · les porteurs du ponton étaient gardés par « id du bateau : rang », sans retrait —
//     deux entrées par escale, ~330 par heure de port visible, pour toujours ;
//   · un bateau qui ne meurt pas (bac, navette, drague) retenait l'id de chaque bateau
//     salué — des milliers d'entrées après une longue partie.
// Ce que ces tests tiennent : les registres restent bornés quand la flotte se renouvelle,
// sans rien oublier de ce qui vit encore (le porteur suivi garde son objet, un bateau
// toujours sur le fleuve n'est jamais salué deux fois).
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../layout.js';
import { porterOf, portersSize } from '../iso/boatBerths.js';
import { updateRiverFleet, makeFleetCtl, ribbonLength } from '../riverFleet.js';

afterEach(() => { CM.ships = []; });

describe('porteurs du ponton', () => {
  it("partent avec leur bateau ; ceux d'un bateau à quai gardent leur objet", () => {
    const q = (seed, k) => ({ seed, k, dir: 0, walking: true, carry: false, dist: 0, berthId: 'b', charType: 0 });
    const keep = { id: 1 };
    CM.ships = [keep];
    const p0 = porterOf(q(1, 0)), p1 = porterOf(q(1, 1));
    // 500 escales : à chaque fois un marchand neuf, seul à quai avec le premier.
    for (let id = 2; id < 502; id += 1) {
      CM.ships = [keep, { id }];
      porterOf(q(id, 0)); porterOf(q(id, 1));
      expect(portersSize()).toBeLessThanOrEqual(64 + 2);
    }
    expect(porterOf(q(1, 0))).toBe(p0);
    expect(porterOf(q(1, 1))).toBe(p1);
  });
});

describe('saluts des bateaux', () => {
  // Un fleuve droit de 60 tuiles (cf. riverNav.test.js).
  const SM = Array.from({ length: 61 }, (_, i) => ({ x: i, y: 10, hw: 3 }));
  const L = ribbonLength(SM);
  const E = { samples: SM, gates: [], obstacles: [], sizeOf: () => ({ len: 1.8, beam: 0.55 }) };
  const boat = (o) => ({ kind: 'trade', dir: 1, t: 0.5, speed: 0, lane: 0.4, phase: 0, fade: 1, state: 'cruise', stateT: 0, done: true, lastDock: -1, ...o });

  it("le bac oublie les bateaux partis, jamais ceux qui sont encore là", () => {
    const ctl = makeFleetCtl();
    ctl.birth = { trade: 1e9, fisher: 1e9 };
    const A = boat({ id: 1, dir: 1, t: 0.5 });
    const stay = boat({ id: 2, dir: -1, t: 0.5 + 0.5 / L });
    const ships = [A, stay];
    updateRiverFleet(ships, ctl, { trade: 0, fisher: 0 }, 0.1, E);
    expect(A._saluted[2]).toBe(1);
    // 300 bateaux croisent A puis quittent le fleuve ; celui qui reste est ramené à
    // côté de A à chaque fois (la navigation les fait dériver).
    for (let id = 3; id < 303; id += 1) {
      const B = boat({ id, dir: -1, t: A.t });
      ships.push(B);
      stay.t = A.t + 0.5 / L; stay.lat = -A.lat;
      A.salute = 0; stay.salute = 0;
      updateRiverFleet(ships, ctl, { trade: 0, fisher: 0 }, 0.1, E);
      expect(B.salute, `bateau ${id}`).toBeGreaterThan(0);
      ships.splice(ships.indexOf(B), 1);
      // Celui qui est resté n'est jamais salué une seconde fois.
      expect(stay.salute).toBe(0);
    }
    expect(Object.keys(A._saluted).length).toBeLessThanOrEqual(33);
    expect(A._saluted[2]).toBe(1);
  });
});
