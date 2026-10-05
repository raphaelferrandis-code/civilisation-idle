// FILETS D'ERREUR DE L'INTERFACE (audit 2026-10-05, BUG-18).
// Sous React 19, une erreur de rendu non rattrapée démonte toute la racine :
// écran blanc, ET le nettoyage de l'effet d'App arrête le tick, l'autosave et la
// sauvegarde de fermeture. La frontière garde App monté ; ces tests verrouillent
// son contrat (pas de DOM ici : les méthodes de la classe sont appelées telles
// que React les appelle, et le repli est rendu en SSR).
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("../../../game/core/state.js", async (importOriginal) => ({
  ...(await importOriginal()),
  save: vi.fn()
}));

import ViewErrorBoundary from "../ViewErrorBoundary.jsx";
import { save } from "../../../game/core/state.js";
import { isChunkLoadError, reloadOnceForChunkError } from "../../../game/core/crashGuard.js";

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ViewErrorBoundary", () => {
  it("passe en repli sur une erreur et se réarme quand la vue change", () => {
    const error = new TypeError("x is undefined");
    expect(ViewErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
    // Même onglet : le repli reste.
    expect(ViewErrorBoundary.getDerivedStateFromProps({ resetKey: "city" }, { error, resetKey: "city" })).toBeNull();
    // Autre onglet : la frontière repart à neuf.
    expect(ViewErrorBoundary.getDerivedStateFromProps({ resetKey: "history" }, { error, resetKey: "city" }))
      .toEqual({ error: null, resetKey: "history" });
  });

  it("sauve la partie dès l'erreur et prévient l'appelant (dialogues)", () => {
    const onError = vi.fn();
    const boundary = new ViewErrorBoundary({ resetKey: "a", onError });
    const error = new Error("rendu cassé");
    boundary.componentDidCatch(error);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("affiche « Retour à la Cité » et « Recharger » à la place de la vue, sans emporter le reste", () => {
    const boundary = new ViewErrorBoundary({ resetKey: "city", onHome: () => {} });
    boundary.state = { error: new Error("boum"), resetKey: "city" };
    const html = renderToString(boundary.render());
    expect(html).toMatch(/Retour à la Cité|Back to the City/);
    expect(html).toMatch(/Recharger|Reload/);
    expect(html).toContain('role="alert"');
  });

  it("repli muet pour les dialogues, enfants rendus tant que tout va bien", () => {
    const quiet = new ViewErrorBoundary({ resetKey: "k", onError: () => {}, children: "contenu" });
    expect(quiet.render()).toBe("contenu");
    quiet.state = { error: new Error("x"), resetKey: "k" };
    expect(quiet.render()).toBeNull();
  });

  it("morceau introuvable (redéploiement) : un rechargement, pas de repli", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    vi.stubGlobal("sessionStorage", memoryStorage());
    const onError = vi.fn();
    const boundary = new ViewErrorBoundary({ resetKey: "a", onError });
    boundary.componentDidCatch(new TypeError("Failed to fetch dynamically imported module: app://localhost/assets/CityView-3f2a.js"));
    expect(save).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    // Le même échec juste après le rechargement : plus de boucle, le repli prend la main.
    boundary.componentDidCatch(new TypeError("Failed to fetch dynamically imported module: app://localhost/assets/CityView-3f2a.js"));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("crashGuard", () => {
  it("reconnaît un échec de chargement de morceau dans les trois moteurs, et rien d'autre", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/a.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it("un seul rechargement par fenêtre de 5 min, et aucun sans drapeau possible", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const t0 = 1_800_000_000_000;
    expect(reloadOnceForChunkError({ storage, now: t0, reload })).toBe(true);
    expect(reloadOnceForChunkError({ storage, now: t0 + 60_000, reload })).toBe(false);
    expect(reloadOnceForChunkError({ storage, now: t0 + 6 * 60_000, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
    // Stockage refusé (navigation privée stricte) : sans drapeau, on ne risque pas la boucle.
    const locked = { getItem: () => { throw new Error("refusé"); }, setItem: () => { throw new Error("refusé"); } };
    expect(reloadOnceForChunkError({ storage: locked, now: t0, reload })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
