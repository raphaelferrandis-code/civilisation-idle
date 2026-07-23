let showChoiceDialog = null;

export function registerChoiceDialog(handler) {
  showChoiceDialog = typeof handler === "function" ? handler : null;
  return () => {
    if (showChoiceDialog === handler) showChoiceDialog = null;
  };
}

// Réponse de repli quand AUCUNE interface n'est branchée (headless, tests, ou
// page de dev désynchronisée). Elle vaut toujours la première option — mais elle
// est désormais SIGNÉE `uiUnavailable`, et c'est tout l'enjeu : sans marque, un
// dialogue jamais affiché rendait « Annuler » / « Garder ma partie », donc un
// geste irréversible se soldait par un silence total, sans fenêtre ni erreur.
// L'appelant qui distingue les deux (cf. « Réinitialiser la partie ») peut
// prendre un chemin de secours ; celui qui ne lit que `.value` est inchangé.
export function requestChoiceDialog(dialog) {
  if (!showChoiceDialog) {
    const first = dialog.options[0];
    console.error(
      "Aucune interface de choix n'est branchee : reponse par defaut « " +
      String(first?.label ?? first?.value ?? "?") + " ». Dialogue ignore :",
      dialog.title || dialog
    );
    return Promise.resolve({ ...first, uiUnavailable: true });
  }
  return showChoiceDialog(dialog);
}
