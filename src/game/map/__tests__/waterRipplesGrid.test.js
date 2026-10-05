// LES REMOUS : la grille de pieux rend le MÊME champ que la boucle complète (audit du
// 05/10, PERF-13). rippleField range ses pieux en cases pour ne tester que ceux à
// portée de chaque pixel (30 à 70 ms → 3 à 10 ms par cuisson au pied des Plaisirs) ;
// le port, l'îlot et les bateaux passent par la même fonction, donc le moindre pixel
// d'écart se verrait partout. La référence ci-dessous est la boucle d'origine, telle
// quelle (tous les pieux pour chaque pixel).
import { describe, it, expect } from 'vitest';
import { rippleField, polyGap } from '../iso/waterRipples.js';
import { h32 } from '../iso/isoPixelPaint.js';

const REACH = 8, WAKE = 13;
function referenceField(contact) {
  const posts = contact.posts || [], decks = contact.decks || [];
  if (!posts.length && !decks.length) return null;
  const fl = contact.flow || null, seed = contact.seed | 0, keep = contact.keep || null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y, m) => { x0 = Math.min(x0, x - m); x1 = Math.max(x1, x + m); y0 = Math.min(y0, y - m); y1 = Math.max(y1, y + m); };
  for (const [x, y, r] of posts) grow(x, y, r + Math.max(REACH, fl ? WAKE : 0) + 1);
  for (const d of decks) for (const [x, y] of d) grow(x, y, REACH + 1);
  const X0 = Math.floor(x0 - y1), X1 = Math.ceil(x1 - y0), Y0 = Math.floor((x0 + y0) / 2), Y1 = Math.ceil((x1 + y1) / 2);
  const w = X1 - X0 + 1, h = Y1 - Y0 + 1;
  const at = [], gap = [], along = [], cross = [], n1 = [], n2 = [], kind = [];
  const lace = (u, salt) => {
    const i = Math.floor(u), f = u - i, s = f * f * (3 - 2 * f);
    return ((h32(i, seed, salt) % 1000) * (1 - s) + (h32(i + 1, seed, salt) % 1000) * s) / 1000;
  };
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const X = X0 + i + 0.5, Y = Y0 + j + 0.5, x = Y + X / 2, y = Y - X / 2;
      let g = Infinity, gx = 0, gy = 0, gr = 0;
      for (const [px, py, r] of posts) {
        const d = Math.hypot(x - px, y - py) - r;
        if (d < g) { g = d; gx = px; gy = py; gr = r; }
      }
      let onDeck = false;
      for (const d of decks) {
        const dg = polyGap(x, y, d);
        if (dg < g) { g = dg; onDeck = true; }
      }
      if (g < -0.2) continue;
      let al = -1, cr = 0;
      if (fl && !onDeck && posts.length) {
        const dx = x - gx, dy = y - gy;
        al = dx * fl[0] + dy * fl[1]; cr = -dx * fl[1] + dy * fl[0];
        if (!(al > gr && al < WAKE && Math.abs(cr) < 0.7 + al * 0.16)) al = -1;
      }
      if (g > REACH + 0.6 && al < 0) continue;
      if (keep && !keep(x, y)) continue;
      const u = onDeck ? (x + y) * 0.45 : Math.atan2(y - gy, x - gx) * 3.2 + gx * 0.7;
      at.push(j * w + i); gap.push(g); along.push(al); cross.push(cr);
      n1.push(lace(u, 11)); n2.push(lace(u * 1.7 + 5, 23)); kind.push(onDeck ? 1 : 0);
    }
  }
  if (!at.length) return null;
  return {
    ox: X0, oy: Y0, w, h, seed,
    at: Int32Array.from(at), gap: Float32Array.from(gap), along: Float32Array.from(along), cross: Float32Array.from(cross),
    n1: Float32Array.from(n1), n2: Float32Array.from(n2), kind: Uint8Array.from(kind),
    ph: (h32(seed, 7) % 1000) / 1000,
  };
}

// Pseudo-hasard reproductible.
const rnd = (a, b) => (h32(a, b, 991) % 100000) / 100000;

describe('rippleField : la grille de pieux ne change rien', () => {
  it('pieux serrés, rayons variés, avec et sans courant, avec un ponton et une découpe', () => {
    const cases = [];
    for (let c = 0; c < 6; c += 1) {
      const posts = [];
      const n = 10 + Math.floor(rnd(c, 1) * 50);
      for (let k = 0; k < n; k += 1) {
        // Un débarcadère : des pieux en arc, quelques doublons exacts (ex aequo).
        const a = rnd(c, k * 3) * Math.PI, R = 40 + rnd(c, k * 3 + 1) * 30;
        const r = c % 2 ? 0.5 : 0.3 + rnd(c, k * 3 + 2) * 1.6;
        posts.push([R * Math.cos(a) + c * 7, R * Math.sin(a) - c * 5, r]);
        if (k % 9 === 4) posts.push([posts[posts.length - 1][0], posts[posts.length - 1][1], r]);
      }
      const flows = [null, [0.8, 0.6], [0.45, -0.3]];      // la dernière n'est PAS unitaire
      const fl = flows[c % 3];
      const decks = c >= 3 ? [[[0, 0], [24, 0], [24, 10], [0, 10]]] : [];
      const keep = c === 2 ? (x, y) => x - y > -30 : null;
      cases.push({ posts, flow: fl, decks, seed: 77 + c, keep });
    }
    for (const contact of cases) {
      const a = rippleField(contact), b = referenceField(contact);
      expect(a && a.at.length).toBeGreaterThan(0);
      for (const k of ['ox', 'oy', 'w', 'h', 'seed', 'ph']) expect(a[k]).toBe(b[k]);
      for (const k of ['at', 'gap', 'along', 'cross', 'n1', 'n2', 'kind']) expect(Array.from(a[k])).toEqual(Array.from(b[k]));
    }
  });
});
