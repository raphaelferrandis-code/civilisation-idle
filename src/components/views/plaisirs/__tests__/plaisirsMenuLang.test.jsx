import { describe, it, expect, afterEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour
// le rendu SSR du test, il lit simplement l'état courant.
vi.mock("../../../../hooks/useGameState.js", async () => {
  const { state } = await import("../../../../game/core/state.js");
  return { useGameState: (selector) => selector(state), shallowEqual: Object.is };
});

import PlaisirsMenu from "../PlaisirsMenu.jsx";
import { PLAISIRS_SPOTS, SPOT_VERBES, spotNom, spotVerbe } from "../anchors.js";
import { setLang } from "../../../../game/core/i18n.js";
import { state, setState, defaultState } from "../../../../game/core/state.js";

// LE MENU DE LA MAISON DANS LA LANGUE DU JOUEUR (audit du 05/10, I18N-5) : les noms
// des onze lieux, leurs verbes, « Bientôt » et l'aria du menu restaient en français
// dans la version anglaise — la navigation entière d'une vue.

// L'apostrophe sort échappée (« Le vol d&#x27;Icare ») : on la rend, sinon la
// recherche du nom français ne trouverait jamais ce lieu-là.
const clean = (html) => html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const menu = () => clean(renderToString(
  <PlaisirsMenu bake={null} band={1} survol={null} selection={null} plein={null}
    onHover={() => {}} onPick={() => {}} onBack={() => {}} onRoue={() => {}} />
));

afterEach(() => setLang("fr"));

describe("lieux de la Maison des Plaisirs — bilingues", () => {
  it("chaque lieu et chaque verbe a son français et son anglais", () => {
    for (const sp of PLAISIRS_SPOTS) {
      expect(sp.label?.fr, `${sp.id} : nom fr`).toBeTruthy();
      expect(sp.label?.en, `${sp.id} : nom en`).toBeTruthy();
    }
    for (const [id, v] of Object.entries(SPOT_VERBES)) {
      expect(v?.fr, `${id} : verbe fr`).toBeTruthy();
      expect(v?.en, `${id} : verbe en`).toBeTruthy();
    }
  });

  it("spotNom et spotVerbe suivent la langue", () => {
    const des = PLAISIRS_SPOTS.find((s) => s.id === "des");
    expect(spotNom(des)).toBe("Les osselets");
    expect(spotVerbe(des)).toBe("Jeter");
    expect(spotVerbe({ id: "inconnu" })).toBe("Ouvrir");
    setLang("en");
    expect(spotNom(des)).toBe("Knucklebones");
    expect(spotVerbe(des)).toBe("Cast");
    expect(spotVerbe({ id: "inconnu" })).toBe("Open");
    expect(spotNom(null)).toBe("");
  });

  it("le menu rendu en anglais ne montre plus les noms français", () => {
    setState(defaultState());
    state.faveur = 0;
    setLang("en");
    const html = menu();
    expect(html).toContain("The rooms of the House of Pleasures");
    expect(html).toContain("Knucklebones");
    expect(html).not.toContain("[object Object]");
    for (const sp of PLAISIRS_SPOTS) expect(html, `« ${sp.label.fr} » en anglais`).not.toContain(sp.label.fr);
    expect(html).not.toContain("Les lieux de la Maison des Plaisirs");
  });

  it("le menu rendu en français garde ses noms", () => {
    setState(defaultState());
    const html = menu();
    expect(html).toContain("Les lieux de la Maison des Plaisirs");
    expect(html).toContain("Les osselets");
  });
});
