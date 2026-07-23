import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerChoiceDialog, requestChoiceDialog } from '../choiceDialog.js';

const WIPE_DIALOG = {
  title: "Dernière confirmation",
  options: [
    { label: "Garder ma partie", value: "no" },
    { label: "Tout effacer", value: "yes" }
  ]
};

afterEach(() => {
  registerChoiceDialog(null);
  vi.restoreAllMocks();
});

describe("requestChoiceDialog sans interface branchée", () => {
  it("signe sa réponse de repli, pour qu'un dialogue jamais affiché ne passe pas pour un refus du joueur", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const answer = await requestChoiceDialog(WIPE_DIALOG);
    // La valeur reste la 1re option (les appelants qui ne lisent que .value sont
    // inchangés), mais uiUnavailable permet de distinguer « personne n'a répondu »
    // de « le joueur a cliqué Garder ma partie » — toute la différence entre un
    // bouton Réinitialiser qui se rabat sur un confirm() et un qui ne fait rien.
    expect(answer.value).toBe("no");
    expect(answer.uiUnavailable).toBe(true);
  });

  it("crie dans la console au lieu d'échouer en silence", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await requestChoiceDialog(WIPE_DIALOG);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("requestChoiceDialog avec interface branchée", () => {
  it("délègue au gestionnaire et ne marque rien", async () => {
    registerChoiceDialog((dialog) => Promise.resolve(dialog.options[1]));
    const answer = await requestChoiceDialog(WIPE_DIALOG);
    expect(answer.value).toBe("yes");
    expect(answer.uiUnavailable).toBeUndefined();
  });

  it("redevient indisponible après désinscription", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const unregister = registerChoiceDialog((dialog) => Promise.resolve(dialog.options[1]));
    unregister();
    const answer = await requestChoiceDialog(WIPE_DIALOG);
    expect(answer.uiUnavailable).toBe(true);
  });
});
