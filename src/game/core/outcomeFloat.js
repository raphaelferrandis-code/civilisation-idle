// Petit bus pour les textes flottants de résultat (issue d'un choix aléatoire
// de crise, à la manière du « +N » des achats). Même pattern que choiceDialog.js.
let showOutcomeFloat = null;

export function registerOutcomeFloats(handler) {
  showOutcomeFloat = typeof handler === "function" ? handler : null;
  return () => {
    if (showOutcomeFloat === handler) showOutcomeFloat = null;
  };
}

export function pushOutcomeFloat(outcome) {
  if (showOutcomeFloat && outcome && outcome.label) showOutcomeFloat(outcome);
}
