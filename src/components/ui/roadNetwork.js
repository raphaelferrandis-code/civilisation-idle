import { state } from '../../game/core/state.js';
import { currentEraIndex } from '../../game/core/mechanics.js';
import { tr } from '../../game/core/i18n.js';

/* État du réseau routier, lu par l'encart Voirie. Vit hors du composant : le
   lint interdit d'exporter autre chose que des composants depuis un .jsx
   (fast refresh), et les tests ont besoin de la donnée sans rendre l'encart.

   - `pct` / `bonus` : couverture des bâtiments achetables DESSERVABLES (le
     bonus se joue là-dessus, sinon le plein +10 % serait hors d'atteinte) ;
   - `doors` : le compte BRUT écrit par la carte (portes sur rue / total, cœurs
     d'îlots murés compris) — la vérité qu'un « 100 % » ne doit pas cacher. */
export function roadNetworkInfo() {
  const cov = state.roadCoverage;
  const c = (typeof cov === "number" && cov > 0) ? Math.min(1, cov) : 0;
  const d = state.roadDoors;
  const doors = (d && d.total > 0) ? d : null;
  const ei = currentEraIndex();
  const rank = ei >= 30
    ? { fr: "Boulevards", en: "Boulevards" }
    : ei >= 20 ? { fr: "Avenues", en: "Avenues" }
      : ei >= 10 ? { fr: "Routes", en: "Roads" }
        : { fr: "Sentiers", en: "Paths" };
  return { pct: Math.round(c * 100), bonus: Math.round(c * 100) / 10, rank: tr(rank), doors };
}
