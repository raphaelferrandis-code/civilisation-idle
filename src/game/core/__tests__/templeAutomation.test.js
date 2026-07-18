"use strict";
// Moteur d'automatisation du Temple — le tick joue osselets/Icare aux CADRANS
// du joueur, et relève le tronc des offrandes. Monnaie fermée (2026-07-16) :
//  - osselets : mise en FAVEUR, plancher de Faveur = réserve ; l'auto joue à
//    PERTE en espérance (edge maison) — le débit estimé l'assume (négatif) ;
//  - Icare : mise en OR, plancher d'or (inchangé) ;
//  - tronc : auto-relève quand il frôle le plafond (ne crée rien) ;
//  - cooldown par jeu (une partie par intervalle) ;
//  - ne joue pas si désactivé/verrouillé ni offline (isNotifyPaused) ;
//  - réglages ÉTERNELS (survivent au Grand Reset), hydratation bornée.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, defaultState, invalidateRenderCache, resetTemporaryRunState, buildGrandResetState, setNotifyPaused } from "../state.js";
import { tickTempleAutomation, resolveIcarusHeadless, setTempleAuto, unlockTempleAuto, templeAutoUnlockCost, templeAutoThroughput, auguryPaytable, icarusEffectiveEdge } from "../actions.js";
import { tick } from "../actions/tick.js";
import { toNum } from "../num.js";
import {
  ICARUS_EDGE, TEMPLE_POT_RECYCLE, ICARUS_STAKES, AUTO_AUGURY_INTERVAL_MS, AUTO_ICARUS_INTERVAL_MS,
  AUTO_ICARUS_TARGET_MIN, AUTO_ICARUS_TARGET_MAX,
  AUTO_TEMPLE_FAVEUR_FLOOR_MAX, AUTO_BLACKJACK_INTERVAL_MS,
  AUGURY_STAKES, TRUNK_RATE_PER_S, TRUNK_CAP,
  BLACKJACK_STAKES, BLACKJACK_RTP_AUTO, BLACKJACK_RTP_REF
} from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const FAVEUR_START = 500;
const ICARUS_STAKE_OF = (id) => ICARUS_STAKES.find((s) => s.id === id).faveur;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = 4;     // débloque osselets (>=2) ET Icare (>=3)
  state.faveur = FAVEUR_START; // toutes les mises sont en FAVEUR (monnaie fermée)
  state.wingLevel = 0;        // edge Icare = ICARUS_EDGE (0.18) plein
  state.diceLevel = 0;
  state.icarusFreeFlights = []; // pas de vol offert → la Faveur est débitée
  state.trunkFaveur = 0;
  state.trunkAt = FIXED_NOW;
  // Débloqués mais ÉTEINTS : chaque test active ce qu'il exerce.
  state.templeAuto = {
    tronc: { unlocked: true, on: false },
    osselets: { unlocked: true, on: false, rite: "classique", faveurFloor: 0, lastAt: 0 },
    icarus: { unlocked: true, on: false, target: 2, stakeId: "plume", faveurFloor: 0, lastAt: 0 }
  };
  invalidateRenderCache("all");
});

afterEach(() => {
  setNotifyPaused(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Gain NET d'un jet Vénus au rite classique (gain paytable − mise pleine).
const venusNet = () => {
  const pay = auguryPaytable("prayForRain", "classique");
  return pay.gains.venus - AUGURY_STAKES.classique;
};

describe("Automatisation — osselets (auto-lancé, mise en Faveur)", () => {
  it("joue au tick, débite la mise, crédite le gain — l'or ne bouge PLUS", () => {
    state.templeAuto.osselets.on = true;
    const net = venusNet();
    const goldBefore = toNum(state.gold);
    vi.spyOn(Math, "random").mockReturnValue(0.01); // Vénus classique
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(FAVEUR_START + net);
    expect(toNum(state.gold)).toBeCloseTo(goldBefore, 0); // plus de mise en or
    expect(state.templeAuto.osselets.lastAt).toBe(FIXED_NOW);
  });

  it("respecte le cooldown : une partie par intervalle", () => {
    state.templeAuto.osselets.on = true;
    const net = venusNet();
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START + net);
    vi.advanceTimersByTime(3000); // < AUTO_AUGURY_INTERVAL_MS (8 s)
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START + net); // PAS rejoué
    vi.advanceTimersByTime(AUTO_AUGURY_INTERVAL_MS); // cooldown écoulé
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(FAVEUR_START + net * 2); // rejoué
  });

  it("ne joue pas si désactivé, ni si verrouillé", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    tickTempleAutomation(); // on:false
    expect(state.faveur).toBe(FAVEUR_START);
    state.templeAuto.osselets.on = true;
    state.templeAuto.osselets.unlocked = false; // débloqué NON
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(FAVEUR_START);
  });

  it("plancher de FAVEUR : joue au-dessus de la réserve, veille en dessous", () => {
    state.templeAuto.osselets.on = true;
    state.templeAuto.osselets.faveurFloor = 100;
    const stake = AUGURY_STAKES.classique;
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    // SOUS le plancher APRÈS mise → veille.
    state.faveur = 100 + stake - 1;
    tickTempleAutomation();
    expect(state.faveur).toBe(100 + stake - 1);
    // AU-DESSUS → joue.
    state.faveur = 100 + stake;
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(100 + stake + venusNet());
  });

  it("offline (isNotifyPaused) : ne joue pas — évite le spam et le crédit en masse", () => {
    state.templeAuto.osselets.on = true;
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    setNotifyPaused(true);
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START);
    setNotifyPaused(false);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(FAVEUR_START + venusNet());
  });
});

describe("Automatisation — tronc des offrandes (auto-relève)", () => {
  it("relève quand le tronc frôle le plafond, pas avant ; suspendable", () => {
    state.templeAuto.tronc.on = true;
    // Loin du plafond : rien.
    vi.setSystemTime(FIXED_NOW + 5 * 60_000);
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START);
    // Quasi plein : relève automatique.
    vi.setSystemTime(FIXED_NOW + (TRUNK_CAP + 10) * 60_000);
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START + TRUNK_CAP);
    // Suspendue : le tronc plafonne sans relève.
    state.templeAuto.tronc.on = false;
    vi.setSystemTime(FIXED_NOW + (TRUNK_CAP * 3) * 60_000);
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START + TRUNK_CAP);
  });
});

// Gain NET d'un vol Icare gagné (payout − mise) à la cible donnée.
const icarusNet = (stakeId, target) => {
  const mise = ICARUS_STAKE_OF(stakeId);
  return Math.round(mise * (Math.floor(target * 100) / 100)) - mise;
};

describe("Automatisation — Icare (autopush, résolution headless, mise en Faveur)", () => {
  it("gain si cible < crashPoint ; perte + cagnotte sinon", () => {
    // u=0.5, edge=0.18 → crashPoint = 0.82/0.5 = 1.64.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const mise = ICARUS_STAKE_OF("plume");
    // GAIN : cible 1.2 < 1.64 → payout round(mise × 1.2).
    const win = resolveIcarusHeadless("plume", 1.2);
    expect(win.type).toBe("cashout");
    expect(win.m).toBe(1.2);
    expect(win.faveur).toBe(Math.round(mise * 1.2));
    expect(state.faveur).toBe(FAVEUR_START - mise + win.faveur);
    // PERTE : cible 3 >= 1.64 → crash, la cagnotte s'épaissit SUR L'EDGE.
    const favAfterWin = state.faveur;
    const potBefore = state.icarusPotFaveur || 0;
    const loss = resolveIcarusHeadless("plume", 3);
    Math.random.mockRestore();
    expect(loss.type).toBe("crash");
    expect(state.faveur).toBe(favAfterWin - mise); // la mise brûle, rien ne revient
    expect(state.icarusPotFaveur).toBeCloseTo(potBefore + mise * TEMPLE_POT_RECYCLE * ICARUS_EDGE, 6);
  });

  it("le tick joue Icare au multiplicateur cible", () => {
    state.templeAuto.icarus.on = true;
    state.templeAuto.icarus.target = 1.2;
    vi.spyOn(Math, "random").mockReturnValue(0.5); // crashPoint 1.64 > 1.2 → gain
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(FAVEUR_START + icarusNet("plume", 1.2));
    expect(state.templeAuto.icarus.lastAt).toBe(FIXED_NOW);
  });

  it("ne résout pas par-dessus une résolution impayable (retourne null)", () => {
    state.faveur = ICARUS_STAKE_OF("plume") - 1; // et pas de vol offert
    const res = resolveIcarusHeadless("plume", 1.2);
    expect(res).toBeNull();
    expect(state.faveur).toBe(ICARUS_STAKE_OF("plume") - 1);
  });

  it("respecte le cooldown Icare (12 s)", () => {
    state.templeAuto.icarus.on = true;
    state.templeAuto.icarus.target = 1.2;
    const net = icarusNet("plume", 1.2);
    vi.spyOn(Math, "random").mockReturnValue(0.5); // crashPoint 1.64 > 1.2 → gain
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START + net);
    vi.advanceTimersByTime(6000); // < AUTO_ICARUS_INTERVAL_MS (12 s)
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START + net); // PAS rejoué
    vi.advanceTimersByTime(AUTO_ICARUS_INTERVAL_MS);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(FAVEUR_START + net * 2); // rejoué
  });

  it("vol OFFERT (plume) : joue SANS débit de Faveur, consomme le billet", () => {
    state.faveur = 0;                     // aucune Faveur…
    state.icarusFreeFlights = ["plume"];  // …mais un vol offert
    vi.spyOn(Math, "random").mockReturnValue(0.5); // crashPoint 1.64 > 1.2 → gain
    const res = resolveIcarusHeadless("plume", 1.2);
    Math.random.mockRestore();
    expect(res.type).toBe("cashout");
    expect(res.freeFlight).toBe(true);
    expect(res.faveur).toBe(Math.round(ICARUS_STAKE_OF("plume") * 1.2));
    expect(state.faveur).toBe(res.faveur); // aucune mise débitée
    expect(state.icarusFreeFlights).toEqual([]); // vol consommé
  });

  it("l'auto joue un vol offert MÊME sous le plancher de Faveur (coût nul)", () => {
    state.templeAuto.icarus.on = true;
    state.templeAuto.icarus.faveurFloor = 120;
    state.templeAuto.icarus.target = 1.2;
    state.faveur = 0;                    // très en dessous du plancher
    state.icarusFreeFlights = ["plume"]; // mais vol offert
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(Math.round(ICARUS_STAKE_OF("plume") * 1.2)); // a joué malgré la Faveur nulle
    expect(state.icarusFreeFlights).toEqual([]);
  });

  it("l'auto NE rafle PAS la cagnotte ni le jalon GR VII (réservés au manuel)", () => {
    state.icarusPotFaveur = 1000;
    state.icarusJackpots = 0;
    const mise = ICARUS_STAKE_OF("plume");
    vi.spyOn(Math, "random").mockReturnValue(0.01); // u=0.01 → crashPoint 82 > 10 → gain à ×10
    const res = resolveIcarusHeadless("plume", 10);
    Math.random.mockRestore();
    expect(res.type).toBe("cashout");
    expect(res.m).toBe(10);
    expect(res.faveur).toBe(mise * 10);   // payout de base SEUL
    expect(res.jackpotFaveur).toBeNull(); // pas de rafle
    // Cagnotte NON RAFLÉE : l'auto n'en emporte pas un centime. Elle y verse en
    // revanche sa part d'edge, comme toute résolution (le gros coup se joue à la
    // main ; nourrir la cella, non).
    expect(state.icarusPotFaveur).toBeCloseTo(1000 + mise * TEMPLE_POT_RECYCLE * ICARUS_EDGE, 6);
    expect(state.icarusJackpots).toBe(0);  // jalon NON décroché
    expect(state.faveur).toBe(FAVEUR_START - mise + res.faveur); // pas de +1000
  });

  it("osselets ET Icare peuvent jouer dans le MÊME tick (le Vénus OFFRE le vol)", () => {
    state.templeAuto.osselets.on = true;
    state.templeAuto.icarus.on = true;
    state.templeAuto.icarus.target = 1.2;
    const net = venusNet();
    vi.spyOn(Math, "random").mockReturnValue(0.01); // osselets Vénus ; Icare ×1.2
    tickTempleAutomation();
    Math.random.mockRestore();
    // Le Coup de Vénus des osselets stocke un vol OFFERT que l'auto-Icare joue
    // dans la foulée : la mise Plume n'est PAS débitée, seul le payout tombe.
    const icarusPayout = Math.round(ICARUS_STAKE_OF("plume") * 1.2);
    expect(state.faveur).toBe(FAVEUR_START + net + icarusPayout);
    expect(state.icarusFreeFlights).toEqual([]); // le vol offert a été consommé
    expect(state.templeAuto.osselets.lastAt).toBe(FIXED_NOW);
    expect(state.templeAuto.icarus.lastAt).toBe(FIXED_NOW);
  });
});

describe("Automatisation — câblage au tick", () => {
  it("le VRAI tick() appelle le moteur (osselets débloqué+activé → la Faveur bouge)", () => {
    // Prouve le branchement tick.js → tickTempleAutomation (le moteur unitaire
    // pourrait marcher sans être appelé par la boucle). En monnaie fermée, tout
    // jet FAIT BOUGER la Faveur : gain (paytable > mise) ou perte (mise), jamais
    // neutre. Instability basse pour ne pas court-circuiter le tick (crise).
    state.templeAuto.osselets.on = true;
    state.templeAuto.osselets.unlocked = true;
    state.templeAuto.osselets.lastAt = 0;
    state.instability = 0.1;
    const favBefore = state.faveur;
    tick(1);
    expect(state.faveur).not.toBe(favBefore);
    expect(state.templeAuto.osselets.lastAt).toBeGreaterThan(0); // le hook a bien joué
  });
});

describe("Automatisation — persistance des réglages", () => {
  it("les réglages SURVIVENT au Grand Reset (éternels), la Faveur se re-gagne", () => {
    state.templeAuto.tronc.unlocked = true;
    state.templeAuto.osselets.unlocked = true;
    state.templeAuto.osselets.on = true;
    state.templeAuto.icarus.target = 4;
    state.faveur = 300;
    const fresh = buildGrandResetState(2);
    expect(fresh.templeAuto.tronc.unlocked).toBe(true);
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

  it("hydratation : défaut = tout verrouillé/éteint, cible et plancher bornés", () => {
    const def = hydrateState({});
    expect(def.templeAuto.tronc.unlocked).toBe(false);
    expect(def.templeAuto.osselets.unlocked).toBe(false);
    expect(def.templeAuto.icarus.unlocked).toBe(false);
    expect(def.templeAuto.icarus.on).toBe(false);

    const s = hydrateState({
      templeAuto: { osselets: { on: true, faveurFloor: 99999 }, icarus: { target: 999, on: true, unlocked: true, stakeId: "aile" } }
    });
    expect(s.templeAuto.icarus.target).toBe(AUTO_ICARUS_TARGET_MAX); // 999 borné à 10
    // Borne BASSE aussi : une cible sous le min est remontée.
    expect(hydrateState({ templeAuto: { icarus: { target: 0.5 } } }).templeAuto.icarus.target).toBe(AUTO_ICARUS_TARGET_MIN);
    expect(s.templeAuto.osselets.faveurFloor).toBe(AUTO_TEMPLE_FAVEUR_FLOOR_MAX); // borné
    expect(s.templeAuto.icarus.stakeId).toBe("aile");
    expect(s.templeAuto.icarus.on).toBe(true);
    expect(s.templeAuto.osselets.on).toBe(true);
    expect(s.templeAuto.osselets.rite).toBe("classique"); // défaut préservé
    // Migration douce d'une save d'avant la monnaie fermée : goldFloorS
    // (osselets comme Icare) abandonné, plancher de Faveur au défaut.
    const old = hydrateState({ templeAuto: { osselets: { unlocked: true, goldFloorS: 300 }, icarus: { unlocked: true, goldFloorS: 200 } } });
    expect(old.templeAuto.osselets.unlocked).toBe(true);
    expect(old.templeAuto.osselets.faveurFloor).toBeGreaterThanOrEqual(0);
    expect(old.templeAuto.osselets.goldFloorS).toBeUndefined();
    expect(old.templeAuto.icarus.faveurFloor).toBeGreaterThanOrEqual(0);
    expect(old.templeAuto.icarus.goldFloorS).toBeUndefined();
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
    setTempleAuto("osselets", { faveurFloor: -50 });
    expect(state.templeAuto.osselets.faveurFloor).toBe(0); // planché à 0
    setTempleAuto("osselets", { faveurFloor: 99999 });
    expect(state.templeAuto.osselets.faveurFloor).toBe(AUTO_TEMPLE_FAVEUR_FLOOR_MAX); // plafonné
    setTempleAuto("osselets", { faveurFloor: 150.7 });
    expect(state.templeAuto.osselets.faveurFloor).toBe(151); // arrondi à l'entier
    setTempleAuto("icarus", { faveurFloor: 99999 });
    expect(state.templeAuto.icarus.faveurFloor).toBe(AUTO_TEMPLE_FAVEUR_FLOOR_MAX); // Icare aussi en Faveur
    setTempleAuto("tronc", { on: true });
    expect(state.templeAuto.tronc.on).toBe(true);
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

  it("templeAutoThroughput osselets : NÉGATIF (edge maison), parité avec la paytable", () => {
    state.diceLevel = 0;
    setTempleAuto("osselets", { on: true, rite: "classique" });
    const perMin = 60000 / AUTO_AUGURY_INTERVAL_MS; // 7.5 parties/min
    for (const rite of ["prudent", "classique", "grand"]) {
      setTempleAuto("osselets", { rite });
      const pay = auguryPaytable("prayForRain", rite);
      const expected = (pay.rtp * pay.stake - pay.stake) * perMin;
      expect(templeAutoThroughput("osselets")).toBeCloseTo(expected, 9);
      expect(templeAutoThroughput("osselets")).toBeLessThan(0); // l'auto-jeu consomme
    }
    // Le grand rite brûle plus vite que le prudent (mise plus grosse, même RTP).
    setTempleAuto("osselets", { rite: "grand" });
    const grand = templeAutoThroughput("osselets");
    setTempleAuto("osselets", { rite: "prudent" });
    expect(grand).toBeLessThan(templeAutoThroughput("osselets"));
  });

  it("templeAutoThroughput Icare (NÉGATIF, edge maison) et tronc : parités chiffrées", () => {
    setTempleAuto("icarus", { on: true, stakeId: "plume", target: 2 });
    const perMin = 60000 / AUTO_ICARUS_INTERVAL_MS; // 5 vols/min
    const ev = (id, T) => {
      const mise = ICARUS_STAKE_OF(id);
      const pWin = Math.min(1, (1 - icarusEffectiveEdge()) / T);
      return (pWin * Math.round(mise * T) - mise) * perMin;
    };
    expect(templeAutoThroughput("icarus")).toBeCloseTo(ev("plume", 2), 9);
    expect(templeAutoThroughput("icarus")).toBeLessThan(0); // l'auto-jeu consomme
    setTempleAuto("icarus", { stakeId: "hecatombe" });
    expect(templeAutoThroughput("icarus")).toBeCloseTo(ev("hecatombe", 2), 9);
    setTempleAuto("tronc", { on: true });
    expect(templeAutoThroughput("tronc")).toBeCloseTo(TRUNK_RATE_PER_S * 60, 9);
    expect(templeAutoThroughput("bidon")).toBe(0);                  // jeu invalide → 0
  });

  // Le badge du vingt-et-un auto lisait BLACKJACK_RTP_REF (le jeu PARFAIT, > 1)
  // alors que l'auto joue la base seule, sous 1 : il annonçait un gain là où la
  // table consomme. Ce test épingle le SIGNE, la vraie régression.
  it("templeAutoThroughput vingt-et-un : NÉGATIF (l'auto joue la base, jamais le double ni la refente)", () => {
    state.templeAuto.vingtetun = { unlocked: true, on: true, stakeId: "legere", tempo: "mesure", faveurFloor: 0, stakePow: 0, lastAt: 0 };
    const perMin = 60000 / AUTO_BLACKJACK_INTERVAL_MS;
    for (const stake of BLACKJACK_STAKES) {
      setTempleAuto("vingtetun", { stakeId: stake.id });
      const expected = (BLACKJACK_RTP_AUTO - 1) * stake.faveur * perMin;
      expect(templeAutoThroughput("vingtetun")).toBeCloseTo(expected, 9);
      expect(templeAutoThroughput("vingtetun")).toBeLessThan(0); // l'auto-jeu consomme
    }
    // La royale brûle plus vite que la légère (mise plus grosse, même RTP).
    setTempleAuto("vingtetun", { stakeId: "royale" });
    const royale = templeAutoThroughput("vingtetun");
    setTempleAuto("vingtetun", { stakeId: "legere" });
    expect(royale).toBeLessThan(templeAutoThroughput("vingtetun"));
    // Les deux constantes ne doivent JAMAIS être confondues : REF majore le jeu
    // parfait (> 1, ce que feedPot doit lire), AUTO mesure la base seule (< 1).
    expect(BLACKJACK_RTP_AUTO).toBeLessThan(1);
    expect(BLACKJACK_RTP_REF).toBeGreaterThan(BLACKJACK_RTP_AUTO);
  });

  it("débit = 0 à l'ARRÊT, et = 0 avant l'ère jouable (production réelle nulle)", () => {
    setTempleAuto("osselets", { on: true, rite: "classique" });
    expect(templeAutoThroughput("osselets")).not.toBe(0);
    setTempleAuto("osselets", { on: false });
    expect(templeAutoThroughput("osselets")).toBe(0);              // à l'arrêt → 0
    // Icare activé mais avant l'Ère III → le moteur rend 0, le badge doit suivre.
    setTempleAuto("icarus", { on: true });
    state.bestEraIndex = 4;
    expect(templeAutoThroughput("icarus")).toBeLessThan(0);        // joue (à perte, honnête)
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
    expect(d.templeAuto.tronc.unlocked).toBe(false);
    expect(d.templeAuto.osselets.unlocked).toBe(false);
    expect(d.templeAuto.icarus.stakeId).toBe("plume");
  });
});
