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
// conservés). Le 2e test rejoue donc le RÉTRÉCISSEMENT du rayon sous des slots
// conservés. (Son pendant sans la mémoire des rues, où le sol rétrécissait
// vraiment, est parti avec l'interrupteur de la mémoire — audit 2026-10-05, MORT-4 :
// la mémoire couvre désormais toutes les bandes.)
import { describe, it, expect, afterEach } from 'vitest';
import { computeCityLayout } from '../layout.js';
import { cityState as city } from '../../../test/city.js';

// Tuiles dont une cellule d'emprise n'est PAS du sol de ville. Les cellules de
// fleuve sont exclues : le ponton d'un port et la roue d'un moulin mordent l'eau
// par construction, et l'eau n'est pas du sol.
// ⚠ SAUF LE TERROIR (docs/PLAN-TERROIR.md, 2026-10-03) : champs et moulins de
// rangée (`rural`) sont de la CAMPAGNE — le pavé sous eux faisait du champ un tapis
// posé sur une dalle. Leur invariant est l'inverse, gardé plus bas.
function homeless(L) {
  const out = [];
  for (const t of L.tiles) {
    if (t.rural) continue;
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

// Deux layouts denses complets à froid frôlaient le délai par défaut de vitest
// (5 s) quand la suite entière sature les cœurs. Garde d'INVARIANT, pas de
// performance : le délai global de vite.config.js (relevé pour la CI) suffit
// (audit 2026-10-05, TEST-14).

describe('sol urbain — aucun bâtiment planté dans l\'herbe', () => {
  it('couvre chaque emprise à la génération normale', () => {
    const L = computeCityLayout(city(60));
    expect(L.tiles.length).toBeGreaterThan(100);
    expect(homeless(L)).toEqual([]);
  });

  it('couvre encore, mémoire des rues allumée, quand le rayon se rétrécit', () => {
    const s = city(60);
    globalThis.__engineHomesK = 2.2;
    computeCityLayout(s);
    delete globalThis.__engineHomesK;
    const reduit = computeCityLayout(s);
    expect(Object.keys(s.cityMapSlots).length).toBeGreaterThan(0);
    expect(s.cityRoads, 'mémoire des rues jamais écrite : scénario vide').toBeTruthy();
    expect(homeless(reduit)).toEqual([]);
  });

  it('le sol s\'arrête tout de même : il ne recouvre pas la carte', () => {
    // Garde-fou opposé — si l'emprise + pourtour pavait tout, la campagne, la
    // forêt et la frange d'herbe disparaîtraient. La ville doit rester une île.
    const L = computeCityLayout(city(60));
    const N = L.gridN;
    expect(L.urbanSet.size).toBeLessThan(N * N * 0.85);
  });
});
