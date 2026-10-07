import { describe, it, expect, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";

import { state } from "../../../game/core/state.js";
import { defaultParoles } from "../../../game/core/parolesState.js";
import ParolesChronique from "../ParolesChronique.jsx";

// CE QU'ON DIT DE TOI dans la Chronique (docs/PLAN-ECOUTER-PARLER.md, lot 2).

afterEach(() => {
  state.paroles = defaultParoles();
  state.chronicleEntries = [];
});

describe("le panneau « Ce qu'on dit de toi »", () => {
  it("n'existe pas tant que le joueur n'a rien entendu sur lui", () => {
    state.paroles = defaultParoles();
    expect(renderToString(createElement(ParolesChronique))).toBe("");
  });

  it("relit ce qui a été dit, avec les vrais prénoms et le nom d'alors ; en tête, le nom d'aujourd'hui", () => {
    state.paroles = {
      ...defaultParoles(),
      toi: [{ id: "t3-nom-bougie", at: 7200, band: 5, a: "Talia", b: null, fa: true, fb: false, kid: null, nom: "p6_gold_logo", n: { conjoint: "Garin" } }],
    };
    state.chronicleEntries = [{ id: "x", articleId: "p7_tension_cult" }];
    const html = renderToString(createElement(ParolesChronique));
    expect(html).toContain("Garin laisse une bougie à la fenêtre pour la Main");
    expect(html).toContain("Talia");
    // Le nom que la gazette de ce cycle donne, en tête.
    expect(html).toContain("le Créateur");
  });

  it("sans article qui le nomme dans ce cycle, ils ne t'appellent pas", () => {
    state.paroles = {
      ...defaultParoles(),
      toi: [{ id: "t3-ruines-tuiles", at: 60, band: 2, a: "Oda", b: null, fa: true, fb: false, kid: null, nom: null, n: {} }],
    };
    state.chronicleEntries = [];
    const html = renderToString(createElement(ParolesChronique));
    expect(html).toContain("mon père a trouvé des tuiles");
    expect(html).not.toContain("appelle");
  });
});
