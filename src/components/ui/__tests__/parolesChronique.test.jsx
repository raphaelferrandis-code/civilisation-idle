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

  it("relit aussi ce qu'un signe leur a fait penser de toi (lot 4)", () => {
    state.paroles = {
      ...defaultParoles(),
      toi: [{ id: "s-x92-lumiere", at: 300, band: 9, a: "Ilya", b: null, fa: true, fb: false, kid: null, nom: null, n: {} }],
    };
    state.chronicleEntries = [];
    const html = renderToString(createElement(ParolesChronique));
    expect(html).toContain("C’est toi, avec ta lumière.");
    expect(html).toContain("Ilya");
  });

  it("relit un échange avec toi (lot 6) : sa réplique, ta réponse ou ton silence, la sienne", () => {
    state.paroles = {
      ...defaultParoles(),
      toi: [
        { id: "m10-souvenir", at: 900, band: 9, a: "Ilya", b: null, fa: true, fb: false, kid: null, nom: null, n: {}, talk: { key: "oui", ri: 0 } },
        { id: "m3-qui", at: 400, band: 2, a: "Garin", b: null, fa: false, fb: false, kid: null, nom: null, n: {}, talk: { key: "silence", ri: 0 } },
      ],
    };
    state.chronicleEntries = [];
    // (Le rendu serveur sépare les morceaux de texte voisins par des commentaires.)
    const html = renderToString(createElement(ParolesChronique)).replace(/<!-- -->/g, "");
    // La ligne visible : sa première réplique, son prénom et « Toi » ; l'échange entier est
    // dans l'infobulle (talkTranscript, testé dans parolesMots.test.js).
    expect(html).toContain("Tu recommences tout, chaque fois.");
    expect(html).toContain("Ilya · Toi");
    expect(html).toContain("Qui a parlé ? Il n’y a personne.");
    expect(html).toContain("Garin · Toi");
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
