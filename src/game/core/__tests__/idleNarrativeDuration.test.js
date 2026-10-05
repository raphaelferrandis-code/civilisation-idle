// Récit de reprise (audit 2026-10-05, BUG-52) : « Quelques heures à peine
// d'absence » tombait dès 61 s — une fenêtre .exe masquée deux minutes écrivait
// dans la Chronique et au rapport que la cité était restée seule des heures. Et un
// aller-retour d'onglet de 15 s écrivait déjà un récit d'absence.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { durationPhrase } from "../../data/idleNarrative.js";
import { state, setState, hydrateState } from "../state.js";
import { applyOfflineProgress } from "../main.js";
import { getLang, setLang } from "../i18n.js";
import { FIXED_NOW } from "./fixtures.js";

let langBefore;
beforeEach(() => {
  langBefore = getLang();
  setLang("fr");
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterEach(() => {
  setLang(langBefore);
  vi.useRealTimers();
});

describe("durationPhrase — paliers sous l'heure", () => {
  it("une à dix minutes ne sont pas « quelques heures »", () => {
    expect(durationPhrase(75)).toBe("Quelques minutes");
    expect(durationPhrase(599)).toBe("Quelques minutes");
    expect(durationPhrase(600)).toBe("Moins d'une heure");
    expect(durationPhrase(3599)).toBe("Moins d'une heure");
  });

  it("les heures gardent leurs tournures", () => {
    expect(durationPhrase(3600)).toBe("Quelques heures à peine");
    expect(durationPhrase(8 * 3600)).toBe("Une demi-journée");
    expect(durationPhrase(20 * 3600)).toBe("Près d'un jour");
    expect(durationPhrase(48 * 3600)).toBe("Plusieurs jours");
  });
});

describe("applyOfflineProgress — pas de récit pour un aller-retour d'onglet", () => {
  it("15 s : aucune ligne « d'absence » dans la Chronique", () => {
    setState(hydrateState({}));
    state.history = [];
    state.lastTick = Date.now() - 15_000;
    applyOfflineProgress(15);
    expect((state.history || []).some((l) => /d'absence/.test(l))).toBe(false);
  });

  it("deux minutes : le récit s'écrit, en minutes", () => {
    setState(hydrateState({}));
    state.history = [];
    state.lastTick = Date.now() - 120_000;
    applyOfflineProgress(120);
    const line = (state.history || []).find((l) => /d'absence/.test(l));
    expect(line).toMatch(/Quelques minutes d'absence/);
  });
});
