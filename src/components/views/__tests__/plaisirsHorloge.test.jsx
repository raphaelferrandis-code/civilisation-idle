import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { readFileSync } from "fs";
import { resolve } from "path";

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour
// le rendu SSR du test, il lit l'état courant. Les sélecteurs sont gardés pour
// vérifier À QUOI le menu s'abonne.
const selecteurs = [];
vi.mock("../../../hooks/useGameState.js", async () => {
  const { state } = await import("../../../game/core/state.js");
  return {
    useGameState: (selector) => { selecteurs.push(selector); return selector(state); },
    shallowEqual: Object.is
  };
});

// La bourse a sa propre horloge (le tick) : elle se re-rend seule, pas le menu.
// On la met de côté pour ne juger que les abonnements du menu.
vi.mock("../plaisirs/OffrandesBloc.jsx", () => ({ default: () => null }));

import PlaisirsMenu from "../plaisirs/PlaisirsMenu.jsx";
import { state, setState, defaultState, renderCache } from "../../../game/core/state.js";

// BUG-114 (audit du 05/10) : des valeurs dérivées du temps ne se rafraîchissaient
// pas. Le menu ne s'abonnait qu'à `bjBarreJusqua`, qui ne bouge pas quand le
// bannissement du videur EXPIRE ; et sept tables prenaient l'instabilité pour
// horloge 1 Hz, alors qu'elle se fige en crise terminale ou une fois convergée.

const NOW = 1_800_000_000_000;
const noop = () => {};

beforeEach(() => {
  setState(defaultState());
  renderCache.tickNow = NOW;
  selecteurs.length = 0;
});

describe("horloges des Plaisirs (BUG-114)", () => {
  it("le menu se re-rend quand le bannissement du videur expire", () => {
    state.bjBarreJusqua = NOW + 90_000; // 1 min 30 encore
    renderToString(
      <PlaisirsMenu bake={null} band={0} survol={null} selection={null} plein={null}
        onHover={noop} onPick={noop} onBack={noop} onRoue={noop} />
    );
    const avant = selecteurs.map((f) => f(state));
    renderCache.tickNow = NOW + 120_000; // le tick suivant l'expiration
    const apres = selecteurs.map((f) => f(state));
    // Rien n'a changé dans l'état : au moins un abonnement doit pourtant bouger.
    expect(apres.some((v, i) => !Object.is(v, avant[i]))).toBe(true);
  });

  it("aucune table ne prend plus l'instabilité pour horloge", () => {
    const fichiers = [
      "src/components/views/plaisirs/OffrandesBloc.jsx",
      "src/components/ui/AuguryStage.jsx",
      "src/components/ui/BlackjackStage.jsx",
      "src/components/ui/IcarusStage.jsx",
      "src/components/ui/RoueStage.jsx",
      "src/components/ui/ScratchStage.jsx",
      "src/components/ui/SlotsStage.jsx"
    ];
    for (const f of fichiers) {
      const src = readFileSync(resolve(__dirname, "../../../..", f), "utf8");
      expect(src, f).not.toMatch(/useGameState\(\(s\)\s*=>\s*s\.instability\)/);
      expect(src, f).toMatch(/useGameState\(\(\)\s*=>\s*renderCache\.tickNow\)/);
    }
  });
});
