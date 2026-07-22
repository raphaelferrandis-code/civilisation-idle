import { describe, it, expect, beforeEach } from "vitest";
import { state, setState, hydrateState, resetTemporaryRunState, buildingById, BUY_QUEUE_MAX } from "../state.js";
import {
  toggleBuyQueue, clearBuyQueue, resolveBuyQueue, queuePositionOf, canQueue, pinAmountFor
} from "../actions/buyQueue.js";
import { MAX_BATCH_AMOUNT } from "../balance.js";
import { D } from "../num.js";

// FILE D'ACHATS (C8). Ce qui se teste ici, c'est la promesse : « il achète dès
// que c'est finançable, DANS L'ORDRE CHOISI ». Donc l'ordre strict, le refus
// d'entamer l'arbre permanent, et le fait qu'une file ne survive pas à la cité
// pour laquelle elle a été écrite.

// Cité avancée : ressources ET pics de cycle hauts. Les seconds ne sont pas
// décoratifs — c'est l'« apparition économique » (isUnlocked) qui décide de ce
// qui est visible, donc de ce qui est épinglable.
const RICHE = () => {
  state.cycles = 50;
  state.food = D("1e12"); state.gold = D("1e12");
  state.knowledge = D("1e12"); state.infrastructure = D("1e12");
  state.cyclePeaks = {
    food: D("1e12"), gold: D("1e12"), knowledge: D("1e12"),
    infrastructure: D("1e12"), population: D("1e12")
  };
};

beforeEach(() => {
  setState(hydrateState({}));
  state.instability = 0.1;
});

describe("épingler", () => {
  it("épingle, renvoie le rang, et dépingle au second appel", () => {
    expect(toggleBuyQueue("foragers")).toEqual({ queued: true });
    expect(queuePositionOf("foragers")).toBe(1);
    expect(toggleBuyQueue("foragers")).toEqual({ queued: false });
    expect(queuePositionOf("foragers")).toBe(0);
  });

  it("fige la quantité AU MOMENT de l'épingle (le mode de la boutique peut changer après)", () => {
    state.buyAmount = 10;
    toggleBuyQueue("foragers");
    state.buyAmount = 1;
    expect(state.buyQueue[0].amount).toBe(10);
  });

  it("refuse au-delà de la limite, et le DIT (sinon le clic se lit comme un bouton cassé)", () => {
    // canQueue exige un bâtiment DÉBLOQUÉ : sans cité avancée, la liste
    // éligible tient en une entrée et le test ne prouverait rien.
    state.cycles = 50;
    RICHE();
    const ids = Object.keys(state.buildings).filter((id) => canQueue(buildingById[id]));
    expect(ids.length, "pas assez de bâtiments épinglables").toBeGreaterThan(BUY_QUEUE_MAX);
    for (let i = 0; i < BUY_QUEUE_MAX; i++) toggleBuyQueue(ids[i]);
    expect(state.buyQueue.length).toBe(BUY_QUEUE_MAX);
    expect(toggleBuyQueue(ids[BUY_QUEUE_MAX])).toEqual({ queued: false, full: true });
    expect(state.buyQueue.length).toBe(BUY_QUEUE_MAX);
  });

  it("n'épingle jamais ce qui coûte des Ruines : la file ne ponctionne pas l'arbre permanent", () => {
    const ruineux = Object.values(buildingById).find((b) => b.extraCost && b.extraCost.ruins);
    expect(ruineux, "aucun bâtiment à coût en Ruines trouvé — le test ne prouve rien").toBeTruthy();
    expect(canQueue(ruineux)).toBe(false);
    expect(toggleBuyQueue(ruineux.id)).toEqual({ queued: false });
    expect(state.buyQueue.length).toBe(0);
  });

  it("borne la quantité épinglée au lot maximum", () => {
    state.buyAmount = "max";
    RICHE();
    expect(pinAmountFor(buildingById.foragers)).toBeLessThanOrEqual(MAX_BATCH_AMOUNT);
  });
});

describe("résolution : dans l'ordre, une entrée par tick", () => {
  it("achète la tête quand elle est finançable et la retire", () => {
    RICHE();
    state.buyAmount = 1;
    toggleBuyQueue("foragers");
    const avant = state.buildings.foragers;
    expect(resolveBuyQueue()).toBe(true);
    expect(state.buildings.foragers).toBe(avant + 1);
    expect(state.buyQueue.length).toBe(0);
  });

  it("n'achète QUE la tête : une cible bon marché placée derrière ne se sert pas avant", () => {
    // Tête impayable, seconde entrée payable : rien ne doit être acheté.
    state.cycles = 50;
    RICHE();
    state.buyAmount = 300;
    toggleBuyQueue("granaries_city");
    state.buyAmount = 1;
    toggleBuyQueue("foragers");
    expect(state.buyQueue.length).toBe(2);
    state.food = D(20); // de quoi payer 1 cueilleur, jamais 300 greniers
    const avant = { ...state.buildings };
    expect(resolveBuyQueue()).toBe(false);
    expect(state.buildings.foragers).toBe(avant.foragers);
    expect(state.buyQueue.length).toBe(2);
  });

  it("épargne sans rien dépenser tant que la tête n'est pas payable", () => {
    state.buyAmount = 100;
    toggleBuyQueue("foragers");
    state.food = D(5);
    resolveBuyQueue();
    expect(D(state.food).eq(5)).toBe(true);
  });

  it("retire une cible périmée au lieu de bloquer la file derrière elle", () => {
    RICHE();
    // Un bâtiment verrouillé par le nombre de cycles : la file ne peut pas
    // l'acheter, mais elle ne doit pas rester coincée dessus.
    const verrou = Object.values(buildingById).find((b) => b.unlockCycles > 0);
    expect(verrou, "aucun bâtiment verrouillé par cycle — le test ne prouve rien").toBeTruthy();
    state.cycles = 0; // sous unlockCycles : la cible est hors d'atteinte
    state.buyQueue = [{ id: verrou.id, amount: 1 }];
    expect(resolveBuyQueue()).toBe(true);
    expect(state.buyQueue.length).toBe(0);
  });

  it("ne fait rien sur une file vide", () => {
    expect(resolveBuyQueue()).toBe(false);
  });
});

describe("gardes", () => {
  it("ne bâtit pas pendant la montée de Sisyphe : le rocher retomberait sans que le joueur touche à rien", () => {
    RICHE();
    state.buyAmount = 1;
    toggleBuyQueue("foragers");
    state.activeMythId = "mythe_de_sisyphe";
    state.sisypheCran = 3;
    const avant = state.buildings.foragers;
    expect(resolveBuyQueue()).toBe(false);
    expect(state.buildings.foragers).toBe(avant);
    expect(state.sisypheCran).toBe(3); // le rocher n'a pas bougé
    // Au pied de la pente, on construit librement : la file peut travailler.
    state.sisypheCran = 0;
    expect(resolveBuyQueue()).toBe(true);
  });
});

describe("persistance", () => {
  it("ne survit pas à un effondrement : les bâtiments visés viennent d'être détruits", () => {
    toggleBuyQueue("foragers");
    resetTemporaryRunState(state);
    expect(state.buyQueue).toEqual([]);
  });

  it("une file trafiquée n'achète pas autre chose que ce qui s'affiche", () => {
    const s = hydrateState({
      buyQueue: [
        { id: "batiment_inexistant", amount: 5 },
        { id: "foragers", amount: 99999 },
        { id: "foragers", amount: 3 },        // doublon
        null,
        { id: "granaries_city", amount: -4 }
      ]
    });
    expect(s.buyQueue.map((e) => e.id)).toEqual(["foragers", "granaries_city"]);
    expect(s.buyQueue[0].amount).toBe(MAX_BATCH_AMOUNT);
    expect(s.buyQueue[1].amount).toBe(1);
  });

  it("tronque une file trop longue au lieu de la refuser en bloc", () => {
    const ids = Object.keys(state.buildings).slice(0, BUY_QUEUE_MAX + 3);
    const s = hydrateState({ buyQueue: ids.map((id) => ({ id, amount: 1 })) });
    expect(s.buyQueue.length).toBe(BUY_QUEUE_MAX);
  });

  it("vider la file la vide vraiment", () => {
    state.cycles = 50;
    RICHE();
    toggleBuyQueue("foragers");
    toggleBuyQueue("granaries_city");
    clearBuyQueue();
    expect(state.buyQueue).toEqual([]);
  });
});
