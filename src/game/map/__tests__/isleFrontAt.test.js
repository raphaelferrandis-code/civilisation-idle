// Audit du 2026-10-05, BUG-93 — le bord avant de l'îlot de l'Aiguille, colonne par
// colonne, servait à redessiner le bateau qui passe DEVANT l'île (la base de l'île est
// peinte après la flotte). Échantillonné en 96 points pour une fenêtre de ±6 px, il
// rendait −Infinity sur ~5 % des colonnes (le bateau n'était pas redessiné : la base
// mangeait sa coque, un clignotement) et souvent le bord arrière ailleurs.
// On compare la résolution exacte à un échantillonnage très fin du même contour.
import { describe, it, expect } from "vitest";
import { isleFrontAt } from "../iso/isoWonder.js";

// La même définition, brute : le plus grand x + y du contour sur les colonnes X ± 6.
function dense(M, X, N = 16000) {
  let best = -Infinity;
  for (let k = 0; k < N; k += 1) {
    const a = (k / N) * 2 * Math.PI;
    const u = M.RX * 1.08 * Math.cos(a), v = M.RY * 1.1 * Math.sin(a);
    const x = u * M.tx - v * M.ty, y = u * M.ty + v * M.tx;
    if (Math.abs(x - y - X) <= 6 && x + y > best) best = x + y;
  }
  return best;
}

const T = 32;
const SHAPES = [
  { RX: 7.6 * T / 2, RY: 2.4 * T / 2, tx: 0.8, ty: -0.6 },      // l'île mesurée par l'audit
  { RX: 6 * T / 2, RY: 3 * T / 2, tx: 1, ty: 0 },
  { RX: 8 * T / 2, RY: 2 * T / 2, tx: 0.6, ty: 0.8 },
];

describe("BUG-93 — le bord avant de l'îlot, à chaque colonne", () => {
  it("aucun trou dans l'île et la même valeur que le contour échantillonné finement", () => {
    for (const M of SHAPES) {
      const front = isleFrontAt(M);
      let holes = 0, cols = 0;
      for (let X = -300; X <= 300; X += 4) {
        const ref = dense(M, X), f = front(X);
        if (ref === -Infinity) { expect(f, "hors de l'île, X=" + X).toBe(-Infinity); continue; }
        cols += 1;
        if (f === -Infinity) holes += 1;
        else expect(Math.abs(f - ref), "X=" + X).toBeLessThan(0.5);
      }
      expect(cols).toBeGreaterThan(25);
      expect(holes).toBe(0);
    }
  });
});
