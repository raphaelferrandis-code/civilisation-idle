// LE CACHE DE TEXELS DE LA LISIÈRE NE GARDE PAS DE CLÉS MORTES (audit 2026-10-05,
// MEM-7). Sa clé porte (gx, gy) ABSOLUS : quand la grille grandit, la ville se
// translate d'une case et toutes les clés se périment. Elles s'empilaient jusqu'au
// plafond de 20 000 entrées (~49 Mo à 2,5 Ko l'une), puis le cache se vidait d'un coup.
// On compte les entrées après plusieurs recalculs : un changement de repère (`world`)
// vide le cache, une nouvelle cuisson dans le même repère le relit.
import { describe, it, expect } from 'vitest';
import { makeLisiere, lisiereCacheSize } from '../isoLisiere.js';

// Un plan à trois matières, translaté de `d` cases (la grille qui grandit).
const plan = (d) => (gx, gy) => {
  const x = gx - d, y = gy - d;
  const b = Math.sin(x / 5.3) + Math.cos(y / 4.1) + Math.sin((x + y) / 9.7);
  return b > 0.6 ? 'urban' : b > 0.2 ? 'dirt' : 'grass';
};
// Une cuisson : toutes les cellules de bord de la fenêtre.
function bake(world, d) {
  const kindAt = plan(d), lis = makeLisiere(kindAt, () => false, undefined, world);
  let n = 0;
  for (let gy = d; gy < d + 28; gy += 1) for (let gx = d; gx < d + 28; gx += 1) {
    if (lis.runs(gx, gy, kindAt(gx, gy), 0, 0, 32)) n += 1;
  }
  return n;
}

describe('lisière — mémoire du cache de texels (MEM-7)', () => {
  it('la grille qui grandit vide le cache ; une cuisson du même repère le relit', () => {
    const n = bake('92:7', 0);
    expect(n).toBeGreaterThan(30);
    const size = lisiereCacheSize();
    expect(size).toBeGreaterThanOrEqual(n);
    // Une autre cuisson (une autre tuile de la pyramide, le même plan) : rien de neuf.
    bake('92:7', 0);
    expect(lisiereCacheSize()).toBe(size);
    // Cinq croissances de grille : à chaque fois la ville se translate d'une case.
    for (let k = 1; k <= 5; k += 1) bake((92 + 2 * k) + ':7', k);
    // Seul le dernier repère reste (même plan translaté : autant d'entrées) ; avant,
    // les clés des six repères s'empilaient.
    expect(lisiereCacheSize()).toBe(size);
    // Une nouvelle partie (autre graine) : idem.
    bake('104:8', 5);
    expect(lisiereCacheSize()).toBe(size);
  });
});
