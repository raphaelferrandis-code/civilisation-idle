import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";

// ── FUMÉE DES ÉCRANS : chaque vue et chaque dialogue se charge et se rend ──────
// Audit du 05/10 (TEST-4). La couverture comptait 81 fichiers de src/components
// jamais chargés par la suite, dont CityView, PlaisirsView et OptionsDialog : un
// import qui casse au chargement, ou un rendu qui lève sur un état tardif, donnait
// un écran blanc en prod sans qu'aucun test ne le voie. Ici chaque écran est
// IMPORTÉ (une casse au chargement fait tomber le fichier entier, nommément) puis
// rendu en SSR sur quatre parties : neuve, milieu de partie, crise ouverte et très
// tard (1e320, ère 40, onze Grands Reset). Le rendu serveur n'exécute aucun effet :
// c'est le premier rendu, celui qui donnait l'écran blanc.

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour le
// rendu SSR du test, il lit simplement l'état courant (même mock que fallChoice).
vi.mock("../../hooks/useGameState.js", async () => {
  const { state } = await import("../../game/core/state.js");
  return { useGameState: (selector) => (selector ? selector(state) : state), shallowEqual: Object.is };
});

import * as st from "../../game/core/state.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "../../game/core/__tests__/fixtures.js";

// Import IMMÉDIAT (eager) : le coût de chargement tombe dans la phase d'import du
// fichier, pas dans le chrono de chaque test.
const ECRANS = {
  ...import.meta.glob("../views/*.jsx", { eager: true }),
  ...import.meta.glob("../dialogs/*.jsx", { eager: true }),
};

const PARTIES = {
  neuve: () => st.setState(st.defaultState()),
  milieu: () => st.setState(st.hydrateState(MID_GAME_FIXTURE)),
  crise: () => {
    st.setState(st.hydrateState(MID_GAME_FIXTURE));
    st.state.instability = 1;
    st.state.crisisLimitAnnounced = true;
    st.state.crisisOpenedAt = FIXED_NOW;
  },
  tardive: () => st.setState(st.hydrateState({
    ...MID_GAME_FIXTURE, population: "1e320", food: "1e330", gold: "1e330", knowledge: "1e330",
    infrastructure: "1e310", ruins: "1e200", bestEraIndex: 40, cycles: 400, grandResetCount: 11,
  })),
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterAll(() => {
  vi.useRealTimers();
  st.setState(st.defaultState());
});

const nom = (chemin) => chemin.split("/").slice(-2).join("/");
const composants = Object.entries(ECRANS)
  .filter(([, mod]) => typeof mod.default === "function")
  .map(([chemin, mod]) => [nom(chemin), mod.default]);

it("trouve les vues et les dialogues (le glob n'est pas vide)", () => {
  // Garde contre un test qui passerait à vide après un déplacement de dossier.
  const noms = composants.map(([n]) => n);
  expect(noms).toEqual(expect.arrayContaining([
    "views/CityView.jsx", "views/PlaisirsView.jsx", "views/PrestigeView.jsx", "dialogs/OptionsDialog.jsx",
  ]));
  expect(noms.length).toBeGreaterThanOrEqual(15);
});

// Props propres à un écran. Les autres reçoivent celles d'un dialogue ouvert.
const PROPS = {
  // Sans `dialog`, la fenêtre de choix ne rend rien : on lui en donne un complet
  // (options structurées, puces d'effets, sélection multiple).
  "dialogs/ChoiceDialog.jsx": {
    dialog: {
      title: "Titre", body: "Première ligne\n\nTroisième ligne", inscription: "Inscription", footnote: "Note",
      multiSelectOptions: [{ id: "a", label: "A", bonus: "+1", malus: "-1" }, { id: "b", label: "B", disabled: true }],
      defaultSelectedIds: ["a"],
      options: [
        { label: "Simple", value: "no" },
        { label: "Structurée", value: "yes", headline: "Gain", delta: { kind: "good", label: "+5 %" }, badge: "★", lastWill: true,
          effects: [{ label: "Effet", kind: "bad", tip: "Infobulle" }], rowLabelNow: "Maintenant", rowLabelNext: "Ensuite", minSelected: 1, detail: "Détail" },
      ],
    },
    onChoose: () => {},
  },
};
// Rendu VIDE légitime sous Node : la ligne de plein écran n'existe qu'avec le pont
// de l'.exe (window.civWindow, preload.cjs).
const VIDE_PERMIS = new Set(["dialogs/FullscreenOption.jsx"]);

describe.each(composants)("%s", (nomEcran, Composant) => {
  it.each(Object.keys(PARTIES))("se rend sur une partie %s", (partie) => {
    PARTIES[partie]();
    st.invalidateRenderCache("all");
    const props = PROPS[nomEcran] || { isOpen: true, open: true, onClose: () => {} };
    const html = renderToString(createElement(Composant, props));
    if (!VIDE_PERMIS.has(nomEcran)) expect(html.length).toBeGreaterThan(0);
  });
});
