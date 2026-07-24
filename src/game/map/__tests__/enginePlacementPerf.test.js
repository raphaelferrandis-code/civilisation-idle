// Placement des moteurs : les optimisations de coût ne doivent RIEN déplacer.
//
// Contexte (2026-07-24) : le passage à « halle + ateliers » multiplie par ~4 le
// nombre d'instances à poser. Le placement à FROID (slots vides = 1er layout d'un
// cycle) est alors devenu 74 % du layout. Deux optimisations ont suivi :
//
//   1. Cache de géométrie par pool — hypot/atan2/imul calculés une fois par
//      cellule au lieu d'une fois par cellule ET PAR INSTANCE.
//   2. Élargissement géométrique du top-K au lieu du repli `Infinity`, qui
//      basculait engineCandidates sur un argsort COMPLET (mesuré : 127 replis
//      = 1949 ms des 2318 ms du placement en fin de partie).
//
// Toutes deux sont censées être STRICTEMENT iso-résultat : elles changent le
// chemin, jamais la ville. Ce fichier le prouve, parce qu'une optimisation de
// placement qui déplace un bâtiment est un bug invisible — rien dans le jeu ne
// lèverait, la ville serait juste « différente d'avant » sans que personne ne
// sache pourquoi.
//
// ⚠ PORTÉE RÉELLE DE CES GARDES, vérifiée en les cassant exprès :
//   - un poids de zone faux (knowledge 2 → 2.05) est ATTRAPÉ ;
//   - une RÉASSOCIATION des additions (oublier que « outside » place son terme de
//     latitude avant le terme angulaire) ne l'est PAS : l'écart est au dernier
//     bit du flottant et ne renverse aucune égalité sur cet état.
// L'ordre des additions est donc préservé PAR CONSTRUCTION dans layout.js
// (drapeau gyFirst), pas parce que ce fichier le surveillerait. Ne pas « ranger »
// cette expression en se fiant au vert d'ici.
import { describe, it, expect, afterEach } from 'vitest';
import { computeCityLayout } from '../layout.js';
import { defaultState } from '../../core/state.js';
import { D } from '../../core/num.js';

// Ville dense : assez d'instances pour saturer les pools et déclencher les
// replis d'élargissement, assez petite pour un test rapide.
function denseCity(perType) {
  const s = defaultState();
  s.cycles = 1;
  s.mapSeed = 0x51a7c0de;          // seed fixe → ville reproductible
  s.population = D('1e14');
  s.infrastructure = D('1e10');
  s.knowledge = D('1e10');
  for (const k of Object.keys(s.buildings)) s.buildings[k] = perType;
  return s;
}

// Empreinte de placement : type + cellule + emprise, dans l'ordre de pose.
const placement = (L) => L.tiles
  .filter((t) => t.type === 'engine')
  .map((t) => `${t.buildingId}@${t.gx},${t.gy}x${t.spanX || t.size}`)
  .join('|');

const layoutOf = (perType) => placement(computeCityLayout(denseCity(perType)));

afterEach(() => {
  delete globalThis.__engineGeoCache;
  delete globalThis.__engineTopK;
});

describe('placement moteur — les optimisations ne déplacent rien', () => {
  it('le cache de géométrie pose exactement la ville du calcul cellule par cellule', () => {
    globalThis.__engineGeoCache = false;      // chemin de référence, sans cache
    const reference = layoutOf(40);
    delete globalThis.__engineGeoCache;
    const fast = layoutOf(40);

    expect(reference.length).toBeGreaterThan(0);
    expect(fast).toBe(reference);
  });

  it('l\'élargissement du top-K pose la même ville que le top-K large', () => {
    // __engineTopK = 8 force PRESQUE TOUTES les instances dans le repli : c'est
    // le seul moyen d'exercer vraiment l'élargissement (avec le top-K par défaut
    // il ne se déclenche que sur les pools saturés de fin de partie).
    const large = layoutOf(40);
    globalThis.__engineTopK = 8;
    const widened = layoutOf(40);

    expect(large.length).toBeGreaterThan(0);
    expect(widened).toBe(large);
  });

  it('CONTRÔLE NÉGATIF : l\'empreinte réagit bien à un déplacement', () => {
    // Si cette empreinte ne bougeait pas quand la ville change, les deux gardes
    // ci-dessus ne prouveraient rien. Une graine différente = une autre rivière,
    // donc d'autres cellules libres, donc un autre placement.
    const a = layoutOf(40);
    const s = denseCity(40);
    s.mapSeed = 0x0badf00d;
    const b = placement(computeCityLayout(s));
    expect(b).not.toBe(a);
  });
});
