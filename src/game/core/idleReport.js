// Bus du RAPPORT DE REPRISE (B11). Même patron que outcomeFloat.js et
// choiceDialog.js : le moteur publie, la vue consomme.
//
// Pourquoi un bus de module et PAS un champ de `state` : ce rapport ne survit
// pas au rechargement et n'a aucune raison de partir dans l'export JSON. Le
// mettre dans l'état imposerait une entrée dans defaultState, un normalizer dans
// hydrateState, et une place dans la sauvegarde — trois obligations pour une
// donnée qui vit dix secondes.
let showIdleReport = null;
// File d'attente de UN : le rapport est publié par startGameLoop AVANT que la
// vue Cité — seul point de montage du panneau — ne soit forcément montée
// (activeView est persistée : revenir d'absence sur l'onglet Régulation jetait
// le rapport, la seule explication du solde qui a bougé). Le dernier rapport
// non consommé attend l'enregistrement du prochain handler.
let pendingReport = null;

export function registerIdleReport(handler) {
  showIdleReport = typeof handler === "function" ? handler : null;
  if (showIdleReport && pendingReport) {
    const report = pendingReport;
    pendingReport = null;
    showIdleReport(report);
  }
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
//   deltas       [{ key, label, amount }] variations de ressources, déjà filtrées
//   idle         [{ label }] ce qui n'a PAS tourné, pour que l'écart avec
//                l'attente ne soit pas lu comme un bug
export function publishIdleReport(report) {
  if (!report) return;
  if (showIdleReport) showIdleReport(report);
  else pendingReport = report;
}
