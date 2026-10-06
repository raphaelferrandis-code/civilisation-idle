// ÂGE D'OR : UN DÉPART A UN PRIX (audit 2026-10-05, BUG-70, décision de Raph :
// a ET b). Refuser ou vexer le marchand ne coûtait rien : une caravane neuve se
// rouvrait au clic suivant, et la patience cachée n'avait aucun enjeu. Désormais :
// 60 s d'attente après un marchand vexé, 20 s après un refus poli, et la caravane
// qui suit un marchand vexé ouvre plus cher (une seule).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { state, setState, hydrateState, setGamePaused, setCollapseInProgress, invalidateRenderCache, resetTemporaryRunState } from "../state.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { negotiateOrDeal } from "../actions/myths.js";
import { rates } from "../mechanics.js";
import { D } from "../num.js";
import {
  OR_CARAVAN_WAIT_VEXED_MS, OR_CARAVAN_WAIT_REFUSED_MS, OR_DEAL_VEXED_SURCHARGE,
  OR_DEAL_LOT_SECONDS, OR_DEAL_ASK_MARKUP
} from "../../data/myths.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

let dialogs = 0;
// Répond par les MARQUES `deal` des options, dans l'ordre donné.
function answers(...deals) {
  registerChoiceDialog((d) => {
    dialogs += 1;
    const deal = deals.shift() || "refuse";
    return Promise.resolve(d.options.find((o) => o.deal === deal));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  setState(hydrateState({ ...MID_GAME_FIXTURE, activeMythId: "mythe_age_or", gold: 1e9, orDealsClosed: 0 }));
  invalidateRenderCache("all");
  setGamePaused(false);
  setCollapseInProgress(false);
  dialogs = 0;
});

afterEach(() => {
  registerChoiceDialog(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Prix de départ d'une caravane ordinaire (même calcul que negotiateOrDeal).
const baseAsk = () => D(rates().gold).max(0).mul(OR_DEAL_LOT_SECONDS).mul(OR_DEAL_ASK_MARKUP).max(40).round();

describe("BUG-70 — la caravane suivante se fait attendre", () => {
  it("refus poli : 20 s sans caravane, sans surcoût", async () => {
    answers("refuse");
    await negotiateOrDeal();
    expect(dialogs).toBe(1);
    expect(state.orNextCaravanAt).toBe(FIXED_NOW + OR_CARAVAN_WAIT_REFUSED_MS);
    expect(state.orMerchantVexed).toBe(false);

    answers("refuse");
    vi.setSystemTime(FIXED_NOW + OR_CARAVAN_WAIT_REFUSED_MS - 1000);
    await negotiateOrDeal();
    expect(dialogs).toBe(1); // pas encore là
    vi.setSystemTime(FIXED_NOW + OR_CARAVAN_WAIT_REFUSED_MS);
    await negotiateOrDeal();
    expect(dialogs).toBe(2);
  });

  it("marchand vexé : 60 s d'attente, puis UNE caravane plus chère", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // patience minimale : 2 marchandages
    answers("haggle", "haggle", "haggle");
    await negotiateOrDeal();
    expect(state.orNextCaravanAt).toBe(FIXED_NOW + OR_CARAVAN_WAIT_VEXED_MS);
    expect(state.orMerchantVexed).toBe(true);
    expect(dialogs).toBe(3); // trois tours de la même négociation
    dialogs = 0;

    answers("refuse");
    vi.setSystemTime(FIXED_NOW + OR_CARAVAN_WAIT_VEXED_MS - 1000);
    await negotiateOrDeal();
    expect(dialogs).toBe(0);

    // La caravane suivante ouvre à +25 % : on l'accepte au prix de départ.
    vi.setSystemTime(FIXED_NOW + OR_CARAVAN_WAIT_VEXED_MS);
    invalidateRenderCache("all");
    const surcharged = baseAsk().mul(OR_DEAL_VEXED_SURCHARGE).round();
    answers("accept");
    let gold = D(state.gold);
    await negotiateOrDeal();
    expect(dialogs).toBe(1);
    expect(gold.sub(state.gold).eq(surcharged)).toBe(true);
    expect(state.orMerchantVexed).toBe(false);
    expect(state.orDealsClosed).toBe(1);

    // Un marché conclu : la suivante vient aussitôt, au prix ordinaire.
    invalidateRenderCache("all");
    const plain = baseAsk();
    answers("accept");
    gold = D(state.gold);
    await negotiateOrDeal();
    expect(dialogs).toBe(2);
    expect(gold.sub(state.gold).eq(plain)).toBe(true);
  });

  it("l'attente et le surcoût survivent au rechargement (pas de relance par F5), pas au cycle", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    answers("haggle", "haggle", "haggle");
    await negotiateOrDeal();
    const s = hydrateState(JSON.parse(JSON.stringify(state)));
    expect(s.orNextCaravanAt).toBe(FIXED_NOW + OR_CARAVAN_WAIT_VEXED_MS);
    expect(s.orMerchantVexed).toBe(true);
    resetTemporaryRunState(s);
    expect(s.orNextCaravanAt).toBe(0);
    expect(s.orMerchantVexed).toBe(false);
  });
});
