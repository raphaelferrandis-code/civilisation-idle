"use strict";
// Moteur d'automatisation du Temple (Phase 2, 2026-07-15) — un moteur de
// production passif : le tick joue osselets/Icare aux CADRANS du joueur.
//  - joue au tick, crédite la Faveur, débite l'or (headless, silencieux) ;
//  - cooldown par jeu (une partie par intervalle), plancher d'or = réserve ;
//  - ne joue pas si désactivé/verrouillé ni offline (isNotifyPaused) ;
//  - Icare headless : gain ssi cible < crashPoint (strict), sinon cagnotte ;
//  - réglages ÉTERNELS (survivent au Grand Reset), hydratation bornée.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, defaultState, invalidateRenderCache, resetTemporaryRunState, buildGrandResetState, setNotifyPaused } from "../state.js";
import { tickTempleAutomation, resolveIcarusHeadless, setTempleAuto, unlockTempleAuto, templeAutoUnlockCost, templeAutoThroughput } from "../actions.js";
import { tick } from "../actions/tick.js";
import { rates } from "../mechanics.js";
import { toNum, D } from "../num.js";
import { AUGURY_FAVEUR, ICARUS_POT_FEED, AUTO_AUGURY_INTERVAL_MS, AUTO_ICARUS_INTERVAL_MS, AUTO_ICARUS_TARGET_MIN, AUTO_ICARUS_TARGET_MAX, AUTO_TEMPLE_GOLD_FLOOR_MAX_S } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.gold = D(1e12);       // de quoi miser sans jamais toucher le plancher
  state.bestEraIndex = 4;     // débloque osselets (>=2) ET Icare (>=3)
  state.faveur = 0;
  state.wingLevel = 0;        // edge Icare = ICARUS_EDGE (0.18) plein
  state.icarusFreeFlights = 0; // pas de vol offert → l'or est débité
  // Débloqués mais ÉTEINTS : chaque test active ce qu'il exerce.
  state.templeAuto = {
    osselets: { unlocked: true, on: false, rite: "classique", goldFloorS: 0, lastAt: 0 },
    icarus: { unlocked: true, on: false, target: 2, stakeId: "plume", goldFloorS: 0, lastAt: 0 }
  };
  invalidateRenderCache("all");
});

afterEach(() => {
  setNotifyPaused(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Automatisation — osselets (auto-lancé)", () => {
  it("joue au tick, crédite la Faveur, débite l'or, tamponne lastAt", () => {
    state.templeAuto.osselets.on = true;
    vi.spyOn(Math, "random").mockReturnValue(0.01); // Vénus classique → +20 faveur
    const goldBefore = toNum(state.gold);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(AUGURY_FAVEUR.venus);
    expect(toNum(state.gold)).toBeLessThan(goldBefore); // mise en or dépensée
    expect(state.templeAuto.osselets.lastAt).toBe(FIXED_NOW);
  });

  it("respecte le cooldown : une partie par intervalle", () => {
    state.templeAuto.osselets.on = true;
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    tickTempleAutomation();
    expect(state.faveur).toBe(AUGURY_FAVEUR.venus);
    vi.advanceTimersByTime(3000); // < AUTO_AUGURY_INTERVAL_MS (8 s)
    tickTempleAutomation();
    expect(state.faveur).toBe(AUGURY_FAVEUR.venus); // PAS rejoué
    vi.advanceTimersByTime(AUTO_AUGURY_INTERVAL_MS); // cooldown écoulé
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(AUGURY_FAVEUR.venus * 2); // rejoué
  });

  it("ne joue pas si désactivé, ni si verrouillé", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    tickTempleAutomation(); // on:false
    expect(state.faveur).toBe(0);
    state.templeAuto.osselets.on = true;
    state.templeAuto.osselets.unlocked = false; // débloqué NON
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(0);
  });

  it("plancher d'or : joue au-dessus de la réserve, se met en veille en dessous", () => {
    state.templeAuto.osselets.on = true;
    state.templeAuto.osselets.goldFloorS = 120;
    const floor = D(rates().gold).mul(120); // réserve = 120 s de prod d'or
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    // SOUS le plancher → veille (0.5×floor < floor ; 0 si floor=0)
    state.gold = floor.mul(0.5);
    tickTempleAutomation();
    expect(state.faveur).toBe(0);
    // AU-DESSUS → joue (2×floor + marge > floor)
    state.gold = floor.mul(2).add(1e6);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(AUGURY_FAVEUR.venus);
  });

  it("offline (isNotifyPaused) : ne joue pas — évite le spam et le crédit en masse", () => {
    state.templeAuto.osselets.on = true;
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    setNotifyPaused(true);
    tickTempleAutomation();
    expect(state.faveur).toBe(0);
    setNotifyPaused(false);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(AUGURY_FAVEUR.venus);
  });
});

describe("Automatisation — Icare (autopush, résolution headless)", () => {
  it("gain si cible < crashPoint ; perte + cagnotte sinon", () => {
    // u=0.5, edge=0.18 → crashPoint = 0.82/0.5 = 1.64.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const goldBefore = toNum(state.gold);
    // GAIN : cible 1.2 < 1.64. Plume 30 s → round(30 × 1.2 × 0.15) = 5.
    const win = resolveIcarusHeadless("plume", 1.2);
    expect(win.type).toBe("cashout");
    expect(win.m).toBe(1.2);
    expect(win.faveur).toBe(5);
    expect(state.faveur).toBe(5);
    expect(toNum(state.gold)).toBeLessThan(goldBefore);
    // PERTE : cible 3 >= 1.64 → crash, la cagnotte s'épaissit.
    const potBefore = state.icarusPotFaveur || 0;
    const loss = resolveIcarusHeadless("plume", 3);
    Math.random.mockRestore();
    expect(loss.type).toBe("crash");
    expect(state.faveur).toBe(5); // pas de gain sur une perte
    expect(state.icarusPotFaveur).toBeCloseTo(potBefore + 30 * ICARUS_POT_FEED, 6); // 30 × 0.6 = 18
  });

  it("le tick joue Icare au multiplicateur cible", () => {
    state.templeAuto.icarus.on = true;
    state.templeAuto.icarus.target = 1.2;
    vi.spyOn(Math, "random").mockReturnValue(0.5); // crashPoint 1.64 > 1.2 → gain
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(5);
    expect(state.templeAuto.icarus.lastAt).toBe(FIXED_NOW);
  });

  it("ne résout pas par-dessus une résolution impayable (retourne null)", () => {
    state.gold = D(0); // et pas de vol offert
    const res = resolveIcarusHeadless("plume", 1.2);
    expect(res).toBeNull();
    expect(state.faveur).toBe(0);
  });

  it("respecte le cooldown Icare (12 s)", () => {
    state.templeAuto.icarus.on = true;
    state.templeAuto.icarus.target = 1.2;
    vi.spyOn(Math, "random").mockReturnValue(0.5); // crashPoint 1.64 > 1.2 → gain (5)
    tickTempleAutomation();
    expect(state.faveur).toBe(5);
    vi.advanceTimersByTime(6000); // < AUTO_ICARUS_INTERVAL_MS (12 s)
    tickTempleAutomation();
    expect(state.faveur).toBe(5); // PAS rejoué
    vi.advanceTimersByTime(AUTO_ICARUS_INTERVAL_MS);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(10); // rejoué
  });

  it("vol OFFERT (plume) : joue SANS débit d'or, décrémente le compteur", () => {
    state.gold = D(0);            // aucun or…
    state.icarusFreeFlights = 1;  // …mais un vol offert
    vi.spyOn(Math, "random").mockReturnValue(0.5); // crashPoint 1.64 > 1.2 → gain
    const res = resolveIcarusHeadless("plume", 1.2);
    Math.random.mockRestore();
    expect(res.type).toBe("cashout");
    expect(res.freeFlight).toBe(true);
    expect(res.faveur).toBe(5);
    expect(state.faveur).toBe(5);
    expect(toNum(state.gold)).toBe(0);       // or intact
    expect(state.icarusFreeFlights).toBe(0); // vol consommé
  });

  it("l'auto joue un vol offert MÊME sous le plancher d'or (coût nul)", () => {
    state.templeAuto.icarus.on = true;
    state.templeAuto.icarus.goldFloorS = 120;
    state.templeAuto.icarus.target = 1.2;
    state.gold = D(0);           // très en dessous du plancher
    state.icarusFreeFlights = 1; // mais vol offert
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(5);            // a joué malgré l'or nul
    expect(state.icarusFreeFlights).toBe(0);
  });

  it("l'auto NE rafle PAS la cagnotte ni le jalon GR VII (réservés au manuel)", () => {
    state.icarusPotFaveur = 1000;
    state.icarusJackpots = 0;
    vi.spyOn(Math, "random").mockReturnValue(0.01); // u=0.01 → crashPoint 82 > 10 → gain à ×10
    const res = resolveIcarusHeadless("plume", 10);
    Math.random.mockRestore();
    expect(res.type).toBe("cashout");
    expect(res.m).toBe(10);
    expect(res.faveur).toBe(45);              // 30×10×0.15, payout de base SEUL
    expect(res.jackpotFaveur).toBeNull();     // pas de rafle
    expect(state.icarusPotFaveur).toBe(1000); // cagnotte INTACTE
    expect(state.icarusJackpots).toBe(0);     // jalon NON décroché
    expect(state.faveur).toBe(45);            // pas de +1000
  });

  it("osselets ET Icare peuvent jouer dans le MÊME tick", () => {
    state.templeAuto.osselets.on = true;
    state.templeAuto.icarus.on = true;
    state.templeAuto.icarus.target = 1.2;
    vi.spyOn(Math, "random").mockReturnValue(0.01); // osselets Vénus (+20) ; Icare ×1.2 (+5)
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(AUGURY_FAVEUR.venus + 5); // 25 : les DEUX jeux ont crédité
    expect(state.templeAuto.osselets.lastAt).toBe(FIXED_NOW);
    expect(state.templeAuto.icarus.lastAt).toBe(FIXED_NOW);
  });
});

describe("Automatisation — câblage au tick", () => {
  it("le VRAI tick() appelle le moteur (osselets débloqué+activé → Faveur créditée)", () => {
    // Prouve le branchement tick.js → tickTempleAutomation (le moteur unitaire
    // pourrait marcher sans être appelé par la boucle). Tout jet crédite ≥1
    // Faveur (consolation sur perte, davantage sur gain) → pas besoin de forcer
    // l'issue. Instability basse pour ne pas court-circuiter le tick (crise).
    state.templeAuto.osselets.on = true;
    state.templeAuto.osselets.unlocked = true;
    state.templeAuto.osselets.lastAt = 0;
    state.instability = 0.1;
    const favBefore = state.faveur;
    tick(1);
    expect(state.faveur).toBeGreaterThan(favBefore);
    expect(state.templeAuto.osselets.lastAt).toBeGreaterThan(0); // le hook a bien joué
  });
});

describe("Automatisation — persistance des réglages", () => {
  it("les réglages SURVIVENT au Grand Reset (éternels), la Faveur se re-gagne", () => {
    state.templeAuto.osselets.unlocked = true;
    state.templeAuto.osselets.on = true;
    state.templeAuto.icarus.target = 4;
    state.faveur = 300;
    const fresh = buildGrandResetState(2);
    expect(fresh.templeAuto.osselets.unlocked).toBe(true);
    expect(fresh.templeAuto.osselets.on).toBe(true);
    expect(fresh.templeAuto.icarus.target).toBe(4);
    expect(fresh.faveur).toBe(0); // carburant re-gagné
  });

  it("les réglages SURVIVENT à l'effondrement (hors resetTemporaryRunState)", () => {
    state.templeAuto.osselets.unlocked = true;
    state.templeAuto.osselets.on = true;
    state.templeAuto.icarus.target = 4;
    resetTemporaryRunState(state);
    expect(state.templeAuto.osselets.unlocked).toBe(true);
    expect(state.templeAuto.osselets.on).toBe(true);
    expect(state.templeAuto.icarus.target).toBe(4);
  });

  it("hydratation : défaut = tout verrouillé/éteint, cible bornée", () => {
    const def = hydrateState({});
    expect(def.templeAuto.osselets.unlocked).toBe(false);
    expect(def.templeAuto.icarus.unlocked).toBe(false);
    expect(def.templeAuto.icarus.on).toBe(false);

    const s = hydrateState({
      templeAuto: { osselets: { on: true }, icarus: { target: 999, on: true, unlocked: true, stakeId: "aile" } }
    });
    expect(s.templeAuto.icarus.target).toBe(AUTO_ICARUS_TARGET_MAX); // 999 borné à 10
    // Borne BASSE aussi : une cible sous le min est remontée.
    expect(hydrateState({ templeAuto: { icarus: { target: 0.5 } } }).templeAuto.icarus.target).toBe(AUTO_ICARUS_TARGET_MIN);
    expect(s.templeAuto.icarus.stakeId).toBe("aile");
    expect(s.templeAuto.icarus.on).toBe(true);
    expect(s.templeAuto.osselets.on).toBe(true);
    expect(s.templeAuto.osselets.rite).toBe("classique"); // défaut préservé
  });
});

describe("Automatisation — réglages (setter), déblocage & débit estimé", () => {
  it("setTempleAuto écrit et BORNE les réglages", () => {
    setTempleAuto("osselets", { on: true, rite: "grand" });
    expect(state.templeAuto.osselets.on).toBe(true);
    expect(state.templeAuto.osselets.rite).toBe("grand");
    setTempleAuto("osselets", { rite: "n_importe_quoi" }); // rite invalide → ignoré
    expect(state.templeAuto.osselets.rite).toBe("grand");
    setTempleAuto("icarus", { target: 999, stakeId: "hecatombe" });
    expect(state.templeAuto.icarus.target).toBe(AUTO_ICARUS_TARGET_MAX); // borné à 10
    expect(state.templeAuto.icarus.stakeId).toBe("hecatombe");
    setTempleAuto("icarus", { target: 0.1, stakeId: "bidon" }); // sous le min + stake invalide
    expect(state.templeAuto.icarus.target).toBe(AUTO_ICARUS_TARGET_MIN); // remonté à 1.2
    expect(state.templeAuto.icarus.stakeId).toBe("hecatombe"); // inchangé (invalide ignoré)
    setTempleAuto("osselets", { goldFloorS: -50 });
    expect(state.templeAuto.osselets.goldFloorS).toBe(0); // planché à 0
    setTempleAuto("osselets", { goldFloorS: 999 });
    expect(state.templeAuto.osselets.goldFloorS).toBe(AUTO_TEMPLE_GOLD_FLOOR_MAX_S); // plafonné à 600
    setTempleAuto("osselets", { goldFloorS: 150.7 });
    expect(state.templeAuto.osselets.goldFloorS).toBe(151); // arrondi à l'entier
  });

  it("unlockTempleAuto : refuse sans Faveur, débloque+active en payant, pas de double débit", () => {
    state.templeAuto.osselets.unlocked = false; // partir verrouillé (beforeEach débloque)
    state.templeAuto.osselets.on = false;
    const cost = templeAutoUnlockCost("osselets");
    state.faveur = cost - 1;
    expect(unlockTempleAuto("osselets")).toBe(false);
    expect(state.templeAuto.osselets.unlocked).toBe(false);
    state.faveur = cost + 100;
    expect(unlockTempleAuto("osselets")).toBe(true);
    expect(state.templeAuto.osselets.unlocked).toBe(true);
    expect(state.templeAuto.osselets.on).toBe(true);   // activé d'emblée
    expect(state.faveur).toBe(100);                    // débité du coût
    expect(unlockTempleAuto("osselets")).toBe(false);  // déjà débloqué → pas de double débit
    expect(state.faveur).toBe(100);
  });

  it("templeAutoThroughput : PARITÉ chiffrée avec le payout réel", () => {
    state.diceLevel = 0;
    state.wingLevel = 0;
    setTempleAuto("osselets", { on: true, rite: "classique" });
    setTempleAuto("icarus", { on: true, stakeId: "plume", target: 2 });
    // pEff = 0.55×0.5 = 0.275 ; classique (costMult 1, spread 1) → 2.885 ✦/partie × 7.5/min.
    expect(templeAutoThroughput("osselets")).toBeCloseTo(21.6375, 4);
    setTempleAuto("osselets", { rite: "grand" });   // ×2 payouts, spread 1.7
    expect(templeAutoThroughput("osselets")).toBeCloseTo(44.548125, 4);
    setTempleAuto("osselets", { rite: "prudent" });
    expect(templeAutoThroughput("osselets")).toBeLessThan(21.6375); // prudent < classique
    // Icare plume target 2 : pWin 0.41 × round(30×2×0.15)=9 → 3.69 × 5/min.
    expect(templeAutoThroughput("icarus")).toBeCloseTo(18.45, 4);
    setTempleAuto("icarus", { stakeId: "hecatombe" });              // 300 s = ×10 les secondes
    expect(templeAutoThroughput("icarus")).toBeCloseTo(184.5, 3);
    expect(templeAutoThroughput("bidon")).toBe(0);                  // jeu invalide → 0
  });

  it("débit = 0 à l'ARRÊT, et = 0 avant l'ère jouable (production réelle nulle)", () => {
    setTempleAuto("osselets", { on: true, rite: "classique" });
    expect(templeAutoThroughput("osselets")).toBeGreaterThan(0);
    setTempleAuto("osselets", { on: false });
    expect(templeAutoThroughput("osselets")).toBe(0);              // à l'arrêt → 0
    // Icare activé mais avant l'Ère III → le moteur rend 0, le badge doit suivre.
    setTempleAuto("icarus", { on: true });
    state.bestEraIndex = 4;
    expect(templeAutoThroughput("icarus")).toBeGreaterThan(0);
    state.bestEraIndex = 2;                                        // Ère II : Icare pas jouable
    expect(templeAutoThroughput("icarus")).toBe(0);
  });

  it("setter/unlock : jeu invalide = no-op, templeAuto null reconstruit", () => {
    expect(() => setTempleAuto("foo", { on: true })).not.toThrow();
    expect(unlockTempleAuto("bidon")).toBe(false);
    state.templeAuto = null;
    setTempleAuto("osselets", { on: true });                      // reconstruit defaultTempleAuto
    expect(state.templeAuto.osselets.on).toBe(true);
  });

  it("unlockTempleAuto Icare : coût 350, REFUSÉ avant l'Ère III", () => {
    state.templeAuto.icarus.unlocked = false;
    state.templeAuto.icarus.on = false;
    const cost = templeAutoUnlockCost("icarus");
    expect(cost).toBe(350);
    state.faveur = cost + 300;
    state.bestEraIndex = 2;                                        // Icare pas encore jouable
    expect(unlockTempleAuto("icarus")).toBe(false);
    expect(state.templeAuto.icarus.unlocked).toBe(false);
    state.bestEraIndex = 4;                                        // Ère IV → jouable
    expect(unlockTempleAuto("icarus")).toBe(true);
    expect(state.templeAuto.icarus.unlocked).toBe(true);
    expect(state.templeAuto.icarus.on).toBe(true);
    expect(state.faveur).toBe(300);
  });

  it("defaultState fournit un templeAuto COMPLET (pas null) — panneau visible en partie fraîche", () => {
    const d = defaultState();
    expect(d.templeAuto).not.toBeNull();
    expect(d.templeAuto.osselets.unlocked).toBe(false);
    expect(d.templeAuto.icarus.stakeId).toBe("plume");
  });
});
