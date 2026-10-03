// LA SALLE DES PLAISIRS PEINTE PAR LE CODE (refonte du 2026-10-02, phase 2 —
// docs/PLAN-MAISON-DES-PLAISIRS.md § ⭐).
//
// Ce qu'un œil ne vérifierait qu'au hasard d'une partie : chaque âge cuit sa salle,
// chaque table a son ancre ET ses pixels (le clic tombe au pixel), aucun marqueur de
// nuit ne reste dans l'image, et les figurants sont posés sur la terrasse.
import { describe, it, expect } from 'vitest';
import { bakeSalle, SALLE, SALLE_CONTENT, SALLE_TABLES } from '../iso/plaisirsSalle.js';
import { wonderKitForBand } from '../iso/wonderKits.js';

const ALL = { des: true, tickets: true, cartes: true, icare: true, boutique: true, scene: true };

describe('la salle des Plaisirs', () => {
  it('chaque âge cuit sa salle, opaque, avec son calque de nuit', () => {
    for (let b = 0; b <= 9; b += 1) {
      const out = bakeSalle(wonderKitForBand(b), ALL);
      expect(out.R.w).toBe(SALLE.w);
      expect(out.R.h).toBe(SALLE.h);
      for (let i = 3; i < out.R.data.length; i += 4) {
        if (out.R.data[i] !== 255) throw new Error(`bande ${b} : alpha ${out.R.data[i]} dans la salle`);
      }
      expect(out.N, `bande ${b} : nuit`).toBeTruthy();
      expect(out.figures.length, `bande ${b} : figurants`).toBeGreaterThan(5);
    }
  });
  it('chaque table a son ancre dans la zone toujours visible, et ses pixels', () => {
    for (const b of [0, 4, 6, 9]) {
      const out = bakeSalle(wonderKitForBand(b), ALL);
      for (const t of SALLE_TABLES) {
        const s = out.spots[t.id];
        expect(s, `bande ${b} : ${t.id}`).toBeTruthy();
        // Ancre en pixels du cadre → art : elle doit tomber dans la CONTENT.
        const X = s.x + SALLE.ox, Y = s.y + SALLE.oy;
        expect(X, `${t.id} x`).toBeGreaterThanOrEqual(SALLE_CONTENT.x0);
        expect(X, `${t.id} x`).toBeLessThanOrEqual(SALLE_CONTENT.x1);
        expect(Y, `${t.id} y`).toBeGreaterThanOrEqual(SALLE_CONTENT.y0);
        expect(Y, `${t.id} y`).toBeLessThanOrEqual(SALLE_CONTENT.y1);
        let n = 0;
        for (let k = 0; k < out.ids.length; k += 1) if (out.ids[k] === s.n) n += 1;
        expect(n, `bande ${b} : pixels de ${t.id}`).toBeGreaterThan(60);
      }
    }
  });
  it('les figurants sont sur la terrasse (pas dans l eau)', () => {
    const out = bakeSalle(wonderKitForBand(4), ALL);
    for (const f of out.figures) expect(Math.hypot(f.x, f.y), `figurant ${f.x},${f.y}`).toBeLessThan(150);
  });
  it('un jeu fermé ne pose pas ses joueurs', () => {
    const a = bakeSalle(wonderKitForBand(0), { des: true, scene: true });
    const b = bakeSalle(wonderKitForBand(0), ALL);
    expect(b.figures.length).toBeGreaterThan(a.figures.length);
  });
});
