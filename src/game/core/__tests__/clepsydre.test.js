import { describe, it, expect, beforeEach } from "vitest";
import { state, setState, hydrateState, defaultState, GR_PERSISTENT_FIELDS } from "../state.js";
import { applyOfflineProgress, spendStoredTime, clepsydreRefusal, clepsydreCapSeconds, idleCapSeconds } from "../main.js";
import { CLEPSYDRE_HARD_MAX_SECONDS, CLEPSYDRE_MIN_POUR_SECONDS } from "../balance.js";
import { BRAISIERS_DURATION_MS } from "../../data/myths.js";
import { D } from "../num.js";

// LA CLEPSYDRE (C7). Le temps d'absence reçu AU-DESSUS du plafond n'est plus
// jeté : il attend que le joueur le verse. Ce qui se teste ici, c'est le
// contrat économique — on ne crée pas de temps, on ne le rend pas deux fois, et
// on refuse de verser quand le versement mentirait sur ce qu'il produit.

beforeEach(() => {
  setState(hydrateState({}));
  // Une cité qui produit : sans bâtiments, tous les deltas seraient nuls et les
  // tests passeraient pour de mauvaises raisons.
  state.buildings = { ...state.buildings, foragers: 20 };
  state.instability = 0.1; // évite qu'un tick n'ouvre une crise (cf. templeAutomation.test.js)
});

describe("remplissage : le débordement du plafond n'est plus jeté", () => {
  it("verse dans la clepsydre EXACTEMENT ce qui dépasse le plafond", () => {
    const cap = idleCapSeconds();
    state.lastTick = Date.now() - (cap + 1800) * 1000;
    applyOfflineProgress(cap + 1800);
    expect(state.storedSeconds).toBeCloseTo(1800, 0);
  });

  it("ne verse rien quand l'absence tient sous le plafond", () => {
    applyOfflineProgress(60);
    expect(state.storedSeconds).toBe(0);
  });

  it("borne le remplissage à la contenance (une absence de 10 jours ne remplit pas 10 jours)", () => {
    applyOfflineProgress(10 * 86400);
    expect(state.storedSeconds).toBeLessThanOrEqual(clepsydreCapSeconds());
    expect(state.storedSeconds).toBe(clepsydreCapSeconds());
  });

  it("cumule d'une absence à l'autre, toujours sous la contenance", () => {
    const cap = idleCapSeconds();
    applyOfflineProgress(cap + 600);
    const first = state.storedSeconds;
    expect(first).toBeCloseTo(600, 0);
    applyOfflineProgress(cap + 600);
    expect(state.storedSeconds).toBeCloseTo(Math.min(clepsydreCapSeconds(), first + 600), 0);
  });
});

describe("versement : le temps rendu est le temps dépensé", () => {
  it("produit des ressources et débite la réserve d'autant", () => {
    state.storedSeconds = 3600;
    const foodBefore = D(state.food);
    const res = spendStoredTime();
    expect(res.ok).toBe(true);
    expect(res.spent).toBe(3600);
    expect(state.storedSeconds).toBe(0);
    expect(D(state.food).gt(foodBefore)).toBe(true);
  });

  it("un versement partiel ne consomme que ce qui est demandé", () => {
    state.storedSeconds = 3600;
    spendStoredTime(1200);
    expect(state.storedSeconds).toBe(2400);
  });

  it("fait vieillir la cité comme une absence (l'Usure monte avec la production)", () => {
    state.storedSeconds = 7200;
    const wearBefore = state.timeWear || 0;
    spendStoredTime();
    expect(state.timeWear).toBeGreaterThan(wearBefore);
  });

  it("ne rend jamais plus que ce qu'elle contient", () => {
    state.storedSeconds = 300;
    const res = spendStoredTime(99999);
    expect(res.spent).toBe(300);
    expect(state.storedSeconds).toBe(0);
  });

  it("ne touche pas lastTick : aucun temps réel ne s'est écoulé", () => {
    state.storedSeconds = 3600;
    const frozen = Date.now() - 4321;
    state.lastTick = frozen;
    spendStoredTime();
    expect(state.lastTick).toBe(frozen);
  });
});

describe("refus : le versement ne doit jamais mentir sur ce qu'il produit", () => {
  it("refuse une clepsydre trop vide pour être lisible", () => {
    state.storedSeconds = CLEPSYDRE_MIN_POUR_SECONDS - 1;
    expect(clepsydreRefusal()).toBe("empty");
    expect(spendStoredTime()).toEqual({ ok: false, reason: "empty" });
  });

  it("refuse pendant une Bénédiction : son multiplicateur s'étalerait sur tout le temps versé", () => {
    state.storedSeconds = 3600;
    state.blessingUntil = Date.now() + 60_000;
    expect(clepsydreRefusal()).toBe("bonus");
    expect(spendStoredTime().reason).toBe("bonus");
    expect(state.storedSeconds).toBe(3600); // rien débité sur un refus
  });

  it("refuse pendant la fenêtre des Braisiers de Prométhée (même piège que la Bénédiction)", () => {
    state.storedSeconds = 3600;
    state.prometheeBraisiers = true;
    state.cycleStartedAt = Date.now() - 1000; // dans la fenêtre
    expect(clepsydreRefusal()).toBe("bonus");
    // Fenêtre passée : le versement redevient permis.
    state.cycleStartedAt = Date.now() - BRAISIERS_DURATION_MS - 1000;
    expect(clepsydreRefusal()).toBe(null);
  });

  it("refuse quand la crise terminale est annoncée", () => {
    state.storedSeconds = 3600;
    state.crisisLimitAnnounced = true;
    expect(clepsydreRefusal()).toBe("busy");
    expect(state.storedSeconds).toBe(3600);
  });
});

describe("persistance", () => {
  it("survit au Grand Reset : c'est du temps déjà vécu, pas une ressource de partie", () => {
    expect(GR_PERSISTENT_FIELDS).toContain("storedSeconds");
  });

  it("une save trafiquée ne donne pas un versement aberrant", () => {
    const s = hydrateState({ storedSeconds: 1e12 });
    expect(s.storedSeconds).toBe(CLEPSYDRE_HARD_MAX_SECONDS);
    expect(hydrateState({ storedSeconds: -50 }).storedSeconds).toBe(0);
    expect(hydrateState({ storedSeconds: "trois heures" }).storedSeconds)
      .toBe(defaultState().storedSeconds);
  });
});
