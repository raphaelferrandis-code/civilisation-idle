// Petit bus pour les textes flottants de résultat (issue d'un choix aléatoire
// de crise, à la manière du « +N » des achats). Même pattern que choiceDialog.js.
let showOutcomeFloat = null;

export function registerOutcomeFloats(handler) {
  showOutcomeFloat = typeof handler === "function" ? handler : null;
  return () => {
    if (showOutcomeFloat === handler) showOutcomeFloat = null;
  };
}

// Contrat d'un toast :
//   label    (requis)  texte affiché ; sans lui l'appel est IGNORÉ en silence
//   kind     'gain' | 'cost' | 'info' — pilote la couleur, et la fusion se fait
//            sur le couple (label, kind) : un gain et un coût de même intitulé
//            ne se confondent pas
//   view     facultatif : rend le toast CLIQUABLE et ouvre cette vue
//   priority facultatif (défaut 0) : départage la sortie de file quand la pile
//            est pleine, pour qu'un jalon passe devant une aubaine
export function pushOutcomeFloat(outcome) {
  if (showOutcomeFloat && outcome && outcome.label) showOutcomeFloat(outcome);
}
