import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour
// le rendu SSR du test, il lit simplement l'état courant.
vi.mock("../../../hooks/useGameState.js", async () => {
  const { state } = await import("../../../game/core/state.js");
  return { useGameState: (selector) => selector(state), shallowEqual: Object.is };
});

// La plaque de fait divers lit la réplique ouverte dans fdPick : pilotée ici.
const fd = vi.hoisted(() => ({ sheet: null }));
vi.mock("../../../game/map/faitsDivers/fdPick.js", async (importOriginal) => ({
  ...(await importOriginal()),
  fdOpened: () => fd.sheet,
}));

import ChronicleTicker, { ChronicleAnnounce } from "../ChronicleTicker.jsx";
import FaitDiversCard from "../FaitDiversCard.jsx";
import FirstStepsPanel from "../FirstStepsPanel.jsx";
import BuyToolbar from "../BuyToolbar.jsx";
import Topbar from "../Topbar.jsx";
import { state, setState, defaultState, renderCache } from "../../../game/core/state.js";
import { getNotifEnabled, setNotifEnabled } from "../../../game/core/main.js";

// Accessibilité résiduelle (audit du 2026-10-05, BUG-118) : une région aria-live
// montée DÉJÀ remplie n'est jamais annoncée — les lecteurs d'écran ne lisent que
// les mutations d'une région présente. La dépêche et la réplique de fait divers
// passent donc par une région sr-only pérenne ; le mode d'achat actif se dit par
// aria-pressed ; les cases de la barre du haut s'atteignent au clavier.

const NOW = 1_800_000_000_000;
let notifAvant;
beforeEach(() => {
  notifAvant = getNotifEnabled();
  setNotifEnabled(true);
  setState(defaultState());
  renderCache.tickNow = NOW;
  fd.sheet = null;
});
afterEach(() => { setNotifEnabled(notifAvant); });

const html = (el) => renderToString(el).replace(/<!-- -->/g, "");

describe("annonces vocales — régions pérennes", () => {
  it("la dépêche fraîche s'écrit dans la région sr-only de la Cité, plus dans le bandeau", () => {
    state.chronicleEntries = [{ id: "d1", title: "Le grain rentre", text: "…", date: "An 3", publishedAt: NOW - 5_000, isNew: true }];
    const annonce = html(<ChronicleAnnounce />);
    expect(annonce).toMatch(/role="status"/);
    expect(annonce).toMatch(/aria-live="polite"/);
    expect(annonce).toMatch(/Le grain rentre/);
    // Le bandeau ne porte plus d'aria-live (il est monté déjà rempli).
    expect(html(<ChronicleTicker />)).not.toMatch(/aria-live/);
  });

  it("hors fenêtre (ou fil coupé), la région reste montée mais vide", () => {
    state.chronicleEntries = [{ id: "d0", title: "Vieille dépêche", text: "…", date: "An 1", publishedAt: NOW - 10 * 60_000 }];
    const vide = html(<ChronicleAnnounce />);
    expect(vide).toMatch(/aria-live="polite"/);
    expect(vide).not.toMatch(/Vieille dépêche/);
    state.chronicleEntries[0].publishedAt = NOW - 1_000;
    setNotifEnabled(false);
    expect(html(<ChronicleAnnounce />)).not.toMatch(/Vieille dépêche/);
  });

  it("sans fait divers ouvert, la région de la réplique existe déjà (vide)", () => {
    const out = html(<FaitDiversCard />);
    expect(out).toMatch(/class="sr-only"[^>]*aria-live="polite"/);
    expect(out).not.toMatch(/fait-card/);
  });
});

describe("clavier et lecteur d'écran", () => {
  it("le mode d'achat actif est annoncé (aria-pressed)", () => {
    state.buyAmount = 10;
    const out = html(<BuyToolbar />);
    expect(out).toMatch(/aria-pressed="true"[^>]*>×10</);
    expect((out.match(/aria-pressed="false"/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it("les cases de la barre du haut et leur valeur entrent dans l'ordre de tabulation", () => {
    const out = html(<Topbar />);
    // Rayonnement + Nourriture (toujours là) + Habitants, et les deux valeurs.
    expect((out.match(/class="resource-card-unified[^"]*"[^>]*tabindex="0"/g) || []).length).toBeGreaterThanOrEqual(3);
    expect((out.match(/class="resource-value"[^>]*tabindex="0"/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("plus de `title` natif : la plume du fait divers et la poignée des premiers pas passent par la bulle maison", () => {
    fd.sheet = { who: "La boulangère", line: "Du pain pour tous !", isNew: true };
    const plaque = html(<FaitDiversCard />);
    expect(plaque).toMatch(/class="fc-ink"[^>]*aria-describedby="help-bubble"/);
    expect(plaque).not.toMatch(/\stitle="/);
    const pas = html(<FirstStepsPanel />);
    expect(pas).toMatch(/class="first-steps-head"[^>]*aria-describedby="help-bubble"/);
    expect(pas).not.toMatch(/\stitle="/);
  });
});
