// Bus du RAPPORT DE REPRISE (B11). Même patron que outcomeFloat.js et
// choiceDialog.js : le moteur publie, la vue consomme.
//
// Pourquoi un bus de module et PAS un champ de `state` : ce rapport ne survit
// pas au rechargement et n'a aucune raison de partir dans l'export JSON. Le
// mettre dans l'état imposerait une entrée dans defaultState, un normalizer dans
// hydrateState, et une place dans la sauvegarde — trois obligations pour une
// donnée qui vit dix secondes.
let showIdleReport = null;
// Le rapport EN COURS, gardé ici jusqu'à ce que le joueur le ferme. Il est publié
// par startGameLoop AVANT que la vue Cité — seul point de montage du panneau — ne
// soit forcément montée (activeView est persistée : revenir d'absence sur l'onglet
// Régulation jetait le rapport, la seule explication du solde qui a bougé). Et une
// fois remis, la vue Cité peut encore se démonter avant sa fermeture (changement
// d'onglet) : son panneau le retrouve au remontage au lieu de le perdre (audit
// 2026-10-05, BUG-31).
let pendingReport = null;

export function registerIdleReport(handler) {
  showIdleReport = typeof handler === "function" ? handler : null;
  if (showIdleReport && pendingReport) showIdleReport(pendingReport);
  return () => {
    if (showIdleReport === handler) showIdleReport = null;
  };
}

// Le rapport porte des CHAÎNES déjà formatées côté moteur (les montants sont des
// Decimal qui dépassent le float) et des nombres simples pour les durées.
//   awaySec      absence réelle, plafond NON appliqué
//   creditedSec  ce qui a effectivement été crédité (= min(réserve, absence))
//   capSec       la réserve du moment, pour dire ce qui a été perdu au-dessus
//   farm         true si la vraie boucle a été rejouée (effondrements possibles)
//   collapses    nombre de chutes rejouées
//   ruinsGained  chaîne Decimal
//   myths        { crowned: [noms], broken: nom|null } pactes honorés / brisés
//   deltas       [{ key, label, amount }] variations de ressources, déjà filtrées
//   idle         [{ label }] ce qui n'a PAS tourné, pour que l'écart avec
//                l'attente ne soit pas lu comme un bug
// La dernière absence, pour la rue (paroles/listen.js : « pendant des jours, personne
// n'a posé une pierre »). Comme le rapport, elle ne survit pas au rechargement.
let absence = null;
export const lastAbsence = () => absence;

export function publishIdleReport(report) {
  if (!report) return;
  if (Number.isFinite(report.awaySec)) absence = { sec: report.awaySec, at: Date.now() };
  // Remis D'ABORD : un panneau qui lève ne laisse pas un rapport fantôme rejoué à
  // chaque remontage.
  if (showIdleReport) showIdleReport(report);
  pendingReport = report;
}

// Le joueur a fermé le rapport : il ne revient plus au remontage de la vue Cité.
// Un rapport plus récent, publié entre-temps, n'est pas effacé par la fermeture
// d'un ancien.
export function dismissIdleReport(report) {
  if (!report || pendingReport === report) pendingReport = null;
}
