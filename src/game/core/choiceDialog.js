let showChoiceDialog = null;
// Interface ANNONCÉE mais pas encore branchée (expectChoiceDialog, main.jsx) : les
// demandes qui arrivent dans cet intervalle attendent l'interface au lieu de
// recevoir la réponse par défaut (audit 2026-10-05, BUG-4).
let choiceUiExpected = false;
let earlyRequests = [];

// Le navigateur montera l'interface : main.jsx le déclare avant le premier rendu.
// Sans cette annonce (tests, headless), rien ne change — réponse par défaut
// immédiate, sinon une demande sans interface attendrait pour toujours.
export function expectChoiceDialog(on = true) {
  choiceUiExpected = Boolean(on);
  if (!choiceUiExpected) {
    const pending = earlyRequests;
    earlyRequests = [];
    for (const request of pending) request.resolve(defaultChoice(request.dialog));
  }
}

export function registerChoiceDialog(handler) {
  showChoiceDialog = typeof handler === "function" ? handler : null;
  if (showChoiceDialog) {
    choiceUiExpected = false;
    // Demandes arrivées AVANT le branchement (la reprise du choix de Ruines
    // actives au démarrage) : servies maintenant, UNE À LA FOIS — l'interface
    // ne tient qu'une fenêtre, une seconde remplacerait la première sans
    // jamais rendre sa réponse.
    const pending = earlyRequests;
    earlyRequests = [];
    pending.reduce(
      (previous, request) => previous.then(() => requestChoiceDialog(request.dialog).then(request.resolve, request.reject)),
      Promise.resolve()
    );
  }
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
function defaultChoice(dialog) {
  const first = dialog.options[0];
  console.error(
    "Aucune interface de choix n'est branchee : reponse par defaut « " +
    String(first?.label ?? first?.value ?? "?") + " ». Dialogue ignore :",
    dialog.title || dialog
  );
  return { ...first, uiUnavailable: true };
}

export function requestChoiceDialog(dialog) {
  if (!showChoiceDialog) {
    if (choiceUiExpected) {
      return new Promise((resolve, reject) => { earlyRequests.push({ dialog, resolve, reject }); });
    }
    return Promise.resolve(defaultChoice(dialog));
  }
  return showChoiceDialog(dialog);
}
