// INVARIANT : un bâtiment se tient toujours sur du sol de ville.
//
// Régression 2026-07-24 signalée par Raph sur sa sauvegarde (« certains bâtiments
// n'ont plus de sols », capture d'Ossmor) : des bâtiments à colonnes plantés dans
// l'herbe, au milieu des sapins.
//
// Cause : le sol urbain (`urbanSet`) venait d'`organicLimit`, un rayon dérivé des
// COMPTEURS (cityReachBase ← houses + engineHomes + enginePressure), alors que les
// positions des bâtiments sont RELUES depuis `s.cityMapSlots` d'un recompute à
// l'autre. Réduire `engineHomes` — ce que j'ai fait pour la perf de la grille —
// rétrécit le rayon, mais les bâtiments POSÉS quand la ville était plus large ne
// bougent pas. Les deux dérivent, et la ville laisse des bâtiments derrière elle.
//
// ⚠ Ce défaut est INVISIBLE à un recompute à froid : c'est pour ça qu'il a échappé
// à toutes mes reproductions (6 tuiles concernées à froid, 239 avec des slots
// conservés). Le 2e test rejoue donc explicitement la DIVERGENCE, et vérifie
// d'abord qu'elle a bien lieu — sans quoi il ne prouverait rien.
import { describe, it, expect, afterEach } from 'vitest';
import { computeCityLayout } from '../layout.js';
import { defaultState } from '../../core/state.js';
import { D } from '../../core/num.js';

function city(perType) {
  const s = defaultState();
  s.cycles = 1;
  s.mapSeed = 0x51a7c0de;
  s.population = D('1e18');
  s.infrastructure = D('1e12');
  s.knowledge = D('1e12');
  for (const k of Object.keys(s.buildings)) s.buildings[k] = perType;
  return s;
}

// Tuiles dont une cellule d'emprise n'est PAS du sol de ville. Les cellules de
// fleuve sont exclues : le ponton d'un port et la roue d'un moulin mordent l'eau
// par construction, et l'eau n'est pas du sol.
function homeless(L) {
  const out = [];
  for (const t of L.tiles) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) {
      for (let ay = 0; ay < sy; ay += 1) {
        const k = (t.gx + ax) + ',' + (t.gy + ay);
        if (L.river && L.river.cells && L.river.cells.has(k)) continue;
        if (!L.urbanSet.has(k)) { out.push((t.buildingId || t.variant) + '@' + k); ax = sx; break; }
      }
    }
  }
  return out;
}

afterEach(() => { delete globalThis.__engineHomesK; });

// Deux layouts denses complets à froid frôlent le testTimeout vitest par défaut
// (5 s) quand la suite entière sature les cœurs → échec en timeout SEULEMENT en
// suite complète. Garde d'INVARIANT, pas de performance : marge explicite.
const SLOW = 20000;

describe('sol urbain — aucun bâtiment planté dans l\'herbe', () => {
  it('couvre chaque emprise à la génération normale', () => {
    const L = computeCityLayout(city(60));
    expect(L.tiles.length).toBeGreaterThan(100);
    expect(homeless(L)).toEqual([]);
  }, SLOW);

  it('couvre encore quand le rayon urbain SE RÉTRÉCIT sous des positions figées', () => {
    const s = city(60);

    // 1. Ville posée avec un rayon LARGE. Les slots partent dans s.cityMapSlots.
    globalThis.__engineHomesK = 2.2;
    const large = computeCityLayout(s);
    const solLarge = large.urbanSet.size;

    // 2. Même état, slots CONSERVÉS, rayon revenu à sa valeur normale.
    delete globalThis.__engineHomesK;
    const reduit = computeCityLayout(s);

    // Le scénario doit VRAIMENT faire diverger le sol, sinon le test est vide.
    expect(reduit.urbanSet.size, 'le rayon urbain n\'a pas bougé : scénario vide')
      .toBeLessThan(solLarge);
    expect(Object.keys(s.cityMapSlots).length, 'aucun slot persisté : scénario vide')
      .toBeGreaterThan(0);

    expect(homeless(reduit)).toEqual([]);
  }, SLOW);

  it('le sol s\'arrête tout de même : il ne recouvre pas la carte', () => {
    // Garde-fou opposé — si l'emprise + pourtour pavait tout, la campagne, la
    // forêt et la frange d'herbe disparaîtraient. La ville doit rester une île.
    const L = computeCityLayout(city(60));
    const N = L.gridN;
    expect(L.urbanSet.size).toBeLessThan(N * N * 0.85);
  }, SLOW);
});
