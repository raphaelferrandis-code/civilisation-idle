// ── GRÂCE DE LA TOUTE PREMIÈRE PARTIE ─────────────────────────────────────────
// Décision de Raph, 2026-09-28 : les premières minutes de la toute première
// partie se jouent sous un ciel dégagé et en plein jour.
//
// Pourquoi : la météo et le jour/nuit suivent l'HORLOGE MURALE (weatherMode.js,
// cycle de 24 min ; cityMapRuntime.js, cycle de 9 min), sans aucun lien avec le
// début de la partie. Mesuré : un nouveau joueur a ~43 % de chances de voir une
// averse dans ses 5 premières minutes, et ~45 % d'ouvrir le jeu hors du plein
// jour (crépuscule, nuit ou aube). Sa toute première image était alors sombre et
// grise — un campement de tentes sous la pluie.
//
// Module-FEUILLE (aucun import) : la carte lui passe l'état, les tests aussi.

// Durée de la grâce, en secondes de jeu ACTIF à vie (chronicleStats.
// lifetimePlaySec : onglet visible, rattrapage hors-ligne exclu). Dix minutes
// couvrent l'arrivée, les premiers achats et la première crise (~5 min 30 pour
// un joueur qui achète tout) ; le campement de tentes, lui, dure bien plus.
export const FIRST_GAME_GRACE_SEC = 600;

// La grâce vaut pour la TOUTE PREMIÈRE partie seulement : ni effondrement, ni
// Grand Reset derrière soi. `onboarding.collapsed` survit au Grand Reset (il
// est dans GR_PERSISTENT_FIELDS), `cycles` non : les deux ensemble couvrent tout.
// Le temps joué prend le plus grand des deux compteurs : une save antérieure au
// registre de la Chronique charge lifetimePlaySec à 0 alors que playTimeSec,
// lui, a déjà compté — elle ne doit pas regagner dix minutes de beau temps.
export function firstGameGraceActive(s) {
  if (!s) return false;
  if ((s.cycles || 0) > 0 || (s.grandResetCount || 0) > 0) return false;
  if (s.onboarding && s.onboarding.collapsed) return false;
  const lifetime = (s.chronicleStats && s.chronicleStats.lifetimePlaySec) || 0;
  const played = Math.max(lifetime, s.playTimeSec || 0);
  return played < FIRST_GAME_GRACE_SEC;
}

// VERROU DE GRÂCE pour un signal (le ciel, le jour). Il TIENT le signal à sa
// valeur calme tant que la grâce dure, puis ne le RELÂCHE qu'au premier instant
// où la valeur réelle est déjà calme d'elle-même : sans cette attente, une
// averse en cours ou une nuit tomberait d'un bloc à la dixième minute. Une fois
// relâché, il ne reprend plus jamais la main.
// Un joueur qui n'est pas dans sa première partie est relâché dès le premier
// appel : un vétéran ne perd jamais une averse ni une nuit.
//   hold(graceActive, realIsCalm) → true tant qu'il faut forcer le calme.
export function makeGraceLatch() {
  let held = null; // null : jamais appelé ; true : tenu ; false : relâché
  return function hold(graceActive, realIsCalm) {
    if (held === false) return false;
    if (graceActive) { held = true; return true; }
    if (held === null || realIsCalm) { held = false; return false; }
    return true;
  };
}
