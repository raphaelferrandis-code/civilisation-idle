// Décision de crédit d'un intervalle de « tick » (M16/M17 de l'audit 2026-07-21).
// Isolé de main.js pour être testable sans importer toute la boucle de jeu.
//
// Trois régimes :
//  - onglet CACHÉ → 'skip' : on ne crédite rien ici. La boucle laisse lastWall
//    (et donc lastTick) FIGÉ au masquage ; le retour d'onglet (visibilitychange,
//    ou le premier tick visible) crédite toute l'absence d'un coup. Sans ça, les
//    ticks throttlés en arrière-plan (~1/min) créditaient 1 s chacun et l'auto-save
//    rafraîchissait lastTick → quasi tout le temps caché était perdu (M16).
//  - écart mural ANORMAL alors que l'onglet est VISIBLE (veille système, gel
//    d'onglet, gros jank) → 'offline' : on route l'écart réel vers la progression
//    hors-ligne au lieu de le clamper à 1 s — sinon une nuit de veille ne créditait
//    qu'une seule seconde (M17).
//  - sinon → 'live' : temps de jeu normal, borné à 1 s.
//
// Seuil aligné sur le plancher d'applyOfflineProgress (elapsed <= 10 → no-op) pour
// que le régime 'offline' crédite toujours réellement.
export const OFFLINE_CATCHUP_MIN_SEC = 10;

export function decideTickCredit(wallGapSec, hidden, threshold = OFFLINE_CATCHUP_MIN_SEC) {
  if (hidden) return { mode: "skip", seconds: 0 };
  if (wallGapSec > threshold) return { mode: "offline", seconds: wallGapSec };
  return { mode: "live", seconds: Math.min(1, Math.max(0, wallGapSec)) };
}
