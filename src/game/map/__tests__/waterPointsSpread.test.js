// INVARIANT : les points d'eau sont SEMÉS, et ils ne touchent plus l'eau.
//
// Refonte 2026-08-05 demandée par Raph : l'aqueduc était une conduite linéaire
// posée LE LONG DE LA BERGE, prise d'eau au bord — « ça n'est pas logique à côté
// d'une rivière d'en avoir, et le rendu n'est pas bon de toute façon ». Il devient
// une poignée de points d'eau (puits, bassins, pompes) répartis dans la ville.
//
// Ces gardes visent les DEUX défauts d'origine, pas la mécanique du bâtiment
// (inchangée : nom, coût, effets). Elles passent par computeCityLayout, donc par
// le placement RÉELLEMENT consommé par le rendu — pas par une réimplémentation.
import { describe, it, expect } from 'vitest';
import { computeCityLayout } from '../layout.js';
import { defaultState } from '../../core/state.js';
import { D } from '../../core/num.js';

function city(aqueducs) {
  const s = defaultState();
  s.cycles = 1;
  s.mapSeed = 0x51a7c0de;
  s.population = D('1e18');
  s.infrastructure = D('1e12');
  s.knowledge = D('1e12');
  for (const k of Object.keys(s.buildings)) s.buildings[k] = 40;
  s.buildings.aqueducts = aqueducs;
  return s;
}

const waterPoints = (L) => L.tiles.filter((t) => t.buildingId === 'aqueducts');

// Écart le plus court entre deux points, en cellules. `Infinity` s'il y en a
// moins de deux — les appelants vérifient le compte séparément, pour qu'un
// layout vide ne fasse jamais passer une garde d'écartement par accident.
function ecartMin(points) {
  let d = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      d = Math.min(d, Math.hypot(points[i].gx - points[j].gx, points[i].gy - points[j].gy));
    }
  }
  return d;
}

// Layouts denses complets à froid : frôlent le testTimeout vitest par défaut.
const SLOW = 20000;

describe('points d\'eau — semés dans la ville, jamais au bord de l\'eau', () => {
  it('deux points d\'eau ne se touchent jamais, même en diagonale', () => {
    const L = computeCityLayout(city(60));
    const pts = waterPoints(L);
    // Sans plusieurs points, la garde d'écartement passerait à vide.
    expect(pts.length, 'moins de deux points : scénario vide').toBeGreaterThan(1);

    // PLANCHER DE CONCEPTION, volontairement plus bas que CM_WATER_POINT_GAP :
    // c'est « jamais collés » qu'on verrouille, pas la valeur réglée. Régler
    // l'écart de 5 à 4 ne doit pas rougir ; un retour à des puits jointifs, si.
    expect(ecartMin(pts), 'des points d\'eau collés').toBeGreaterThan(2);
  }, SLOW);

  it('la mesure d\'écartement sait rougir', () => {
    // CONTRÔLE NÉGATIF. Sans lui, la garde ci-dessus ne prouve rien : une mesure
    // qui rendrait toujours Infinity la ferait passer sur n'importe quelle ville.
    // On lui donne le défaut EXACT observé avant correction (deux points à une
    // cellule d'écart) et on vérifie qu'elle le voit.
    expect(ecartMin([{ gx: 60, gy: 66 }, { gx: 61, gy: 66 }])).toBe(1);
    expect(ecartMin([{ gx: 10, gy: 10 }])).toBe(Infinity);
  });

  it('aucun point d\'eau dans le fleuve ni sur la berge', () => {
    // C'EST LA RÉGRESSION À CRAINDRE : l'aqueduc s'y posait EXPRÈS (sa prise
    // d'eau devait toucher le bord), et tout le rendu avait des exceptions pour
    // le laisser mordre la berge. Un point d'eau est un objet de rue.
    const L = computeCityLayout(city(60));
    expect(L.river && L.river.present, 'pas de fleuve : scénario vide').toBe(true);

    const pts = waterPoints(L);
    expect(pts.length).toBeGreaterThan(1);
    for (const t of pts) {
      const k = t.gx + ',' + t.gy;
      expect(L.river.cells.has(k), `point d'eau @${k} : dans le fleuve`).toBe(false);
      expect(L.river.banks.has(k), `point d'eau @${k} : sur la berge`).toBe(false);
      expect(t.waterEnd, `point d'eau @${k} : garde une prise d'eau`).toBeUndefined();
    }
  }, SLOW);

  it('chacun tient sur UNE cellule, quel que soit l\'investissement', () => {
    // La conduite s'étirait sur 3 à 10 cellules avec le niveau. Le compteur ne
    // doit plus piloter que le NOMBRE.
    for (const n of [1, 60, 300]) {
      const pts = waterPoints(computeCityLayout(city(n)));
      expect(pts.length, `${n} achats : aucun point posé`).toBeGreaterThan(0);
      for (const t of pts) {
        expect(t.spanX || t.size || 1, `${n} achats : emprise en X`).toBe(1);
        expect(t.spanY || t.size || 1, `${n} achats : emprise en Y`).toBe(1);
      }
    }
  }, SLOW);
});
