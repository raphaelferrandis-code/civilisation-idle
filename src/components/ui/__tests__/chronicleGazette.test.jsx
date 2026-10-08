import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour
// le rendu SSR du test, il lit simplement l'état courant.
vi.mock("../../../hooks/useGameState.js", async () => {
  const { state } = await import("../../../game/core/state.js");
  return { useGameState: (selector) => selector(state), shallowEqual: Object.is };
});
// Les figures dans la cité (paroles/figures.js ; la vraie se teste avec la rue,
// map/__tests__/parolesFigures.test.js).
const H = vi.hoisted(() => ({ present: new Set() }));
vi.mock("../../../game/map/paroles/figures.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, findFigure: (key) => (H.present.has(key) ? { key } : null) };
});

import ChronicleTicker from "../ChronicleTicker.jsx";
import { state, setState, defaultState, renderCache } from "../../../game/core/state.js";
import { getNotifEnabled, setNotifEnabled } from "../../../game/core/main.js";
import { CHRONICLE_VISIBLE_MS } from "../../../game/core/chronicleEvaluator.js";

// LA GAZETTE DE LA CITÉ (Raph, 2026-10-08) : la dernière dépêche, entière, au support de
// son ère, sous le cadre de la ville ; elle reste jusqu'au clic. Le nom d'une figure de la
// Chronique qui vit dans la cité (dans le titre, le texte ou la signature) est un bouton qui
// la fait retrouver sur la carte, sans refermer l'article.

const NOW = 1_800_000_000_000;
let before;
beforeEach(() => {
  before = getNotifEnabled();
  setNotifEnabled(true);
  setState(defaultState());
  renderCache.tickNow = NOW;
  H.present = new Set();
});
afterEach(() => { setNotifEnabled(before); });

const dispatch = (articleId, o = {}) => {
  state.chronicleEntries = [{ id: "d1", articleId, date: "An 3", publishedAt: NOW - 5_000, isNew: true, ...o }];
};
const render = () => renderToString(<ChronicleTicker />).replace(/<!-- -->/g, "");
const NAME = (n) => new RegExp(`<button type="button" class="gazette-name"[^>]*>${n}</button>`);

describe("la gazette : l'article entier, jusqu'au clic", () => {
  it("l'article s'affiche entier : support de l'ère, date, prix, titre, texte et signature", () => {
    dispatch("p3_gold_statues");
    const html = render();
    expect(html).toMatch(/class="chronicle-ticker chronicle-gazette is-oral"/);
    expect(html).toMatch(/Tradition Orale/);
    expect(html).toMatch(/An 3/);
    expect(html).toMatch(/Prix : Gratuit/);
    expect(html).toMatch(/STATUES D(?:&#x27;|')OR À CHAQUE COIN DE RUE/);   // (le rendu serveur échappe l'apostrophe)
    expect(html).toMatch(/ressemblent surtout aux notables/);
    expect(html).toMatch(/Khael, juge autoproclamé/);
  });

  it("chaque ère a son support : le manuscrit au Bourg marchand", () => {
    state.population = 2e13;
    dispatch("p3_gold_statues");
    const html = render();
    expect(html).toMatch(/chronicle-gazette is-parchment/);
    expect(html).toMatch(/Manuscrit/);
  });

  it("elle reste tant qu'on ne l'a pas refermée, même longtemps après sa parution ; lue, elle s'efface", () => {
    dispatch("p3_gold_statues", { publishedAt: NOW - 10 * CHRONICLE_VISIBLE_MS });
    expect(render()).toMatch(/chronicle-gazette/);
    state.chronicleEntries[0].isNew = false;
    expect(render()).toBe("");
  });

  it("ni les dépêches d'anciens saves, ni quand les notifications du fil sont coupées", () => {
    dispatch("p3_gold_statues", { publishedAt: 0 });
    expect(render()).toBe("");
    dispatch("p3_gold_statues");
    setNotifEnabled(false);
    expect(render()).toBe("");
  });
});

describe("la gazette : le nom d'une figure mène à elle", () => {
  it("Khael est dans la cité : son nom, dans la signature, est un bouton ; le reste de la signature reste un texte", () => {
    dispatch("p3_gold_statues");
    H.present.add("khael");
    const html = render();
    expect(html).toMatch(NAME("Khael"));
    expect(html).toMatch(/<\/button>, juge autoproclamé/);
  });

  it("dans le texte aussi : « Khael trouve cela pratique. »", () => {
    dispatch("p5_gold_speed");
    H.present.add("khael");
    expect(render()).toMatch(new RegExp(`${NAME("Khael").source} trouve cela pratique`));
  });

  it("une figure absente, un habitant ordinaire : leur nom reste un texte", () => {
    dispatch("p3_gold_statues");
    expect(render()).not.toMatch(/gazette-name/);
    state.chronicleEntries = [{ id: "d2", title: "Dépêche du jour", text: "Garin et Claudette rentrent le grain.", author: "Garin, forgeron", date: "An 3", publishedAt: NOW - 5_000, isNew: true }];
    H.present.add("claude");
    const html = render();
    expect(html).toMatch(/Claudette rentrent le grain/);
    expect(html).not.toMatch(/gazette-name/);
  });

  it("plusieurs figures dans un même article : chacune son bouton", () => {
    state.chronicleEntries = [{ id: "d3", title: "Le procès", text: "Khael convoque Aldric au tribunal.", author: "Raphaël, essayiste", date: "An 3", publishedAt: NOW - 5_000, isNew: true }];
    H.present = new Set(["khael", "aldric", "raphael"]);
    const html = render();
    for (const n of ["Khael", "Aldric", "Raphaël"]) expect(html).toMatch(NAME(n));
  });
});
