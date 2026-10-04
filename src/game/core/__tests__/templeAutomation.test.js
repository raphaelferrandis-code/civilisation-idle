"use strict";
// Moteur d'automatisation de la Maison — le tick joue les tables aux CADRANS du
// joueur, et relève la caisse. Lot 1 des gains « vrai casino » (2026-10-04,
// docs/PLAN-GAINS-CASINO.md) : cotes fixes, mise libre.
//  - la MISE d'une auto est une PART DE LA LIMITE HAUTE de la table (cadran
//    min / ¼ / ½ / max, cf. autoStake) : elle grandit avec l'ère record ;
//  - toutes les mises en FAVEUR, plancher de Faveur = réserve à ne pas entamer
//    (curseur borné par autoFloorMax(), 24 h de recettes) ;
//  - l'auto joue À PERTE en espérance (avantage de la maison, plus aucun jeu
//    au-dessus de 100 %) — le débit estimé l'assume : NÉGATIF à toute mise ;
//  - Icare joue d'abord les vols OFFERTS, à LEUR montant, même sous le plancher ;
//  - caisse : auto-relève quand elle frôle SON plafond (trunkCap, 30 min de
//    recettes) — ne crée rien ;
//  - cooldown par jeu (une partie par intervalle), quota par jeu hors ligne ;
//  - ne joue pas si désactivé/verrouillé ni en pause sans simulation ;
//  - le remboursement du lot 1 (migration 4 → 5) est annoncé au premier tick en ligne ;
//  - réglages ÉTERNELS (survivent au Grand Reset), hydratation bornée.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  state, setState, hydrateState, defaultState, defaultTempleAuto, invalidateRenderCache,
  resetTemporaryRunState, buildGrandResetState, setNotifyPaused, setOfflineSim
} from "../state.js";
import {
  tickTempleAutomation, resetOfflineTempleQuota, resolveIcarusHeadless, setTempleAuto, unlockTempleAuto,
  templeAutoUnlockCost, templeAutoThroughput, autoFloorMax, auguryPaytable, icarusEffectiveEdge,
  scratchRtpRef, trunkCap, trunkValue, recettesPerHour, tableLimits, autoStake,
  promoteRank
} from "../actions.js";
import { tick } from "../actions/tick.js";
import { toNum } from "../num.js";
import {
  ICARUS_EDGE, TEMPLE_POT_RECYCLE, AUGURY_RTP,
  AUTO_AUGURY_INTERVAL_MS, AUTO_ICARUS_INTERVAL_MS, AUTO_SCRATCH_INTERVAL_MS, AUTO_BLACKJACK_INTERVAL_MS,
  AUTO_ICARUS_TARGET_MIN, AUTO_ICARUS_TARGET_MAX, AUTO_TEMPO_MULT, AUTO_STAKE_STEPS,
  AUTO_TEMPLE_FAVEUR_FLOOR_MAX, AUTO_TEMPLE_FAVEUR_FLOOR_DEFAULT,
  BLACKJACK_RTP_AUTO, BLACKJACK_RTP_REF, OFFLINE_MAX_TEMPLE_PLAYS_PER_GAME
} from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const FAVEUR_START = 500;
const STEPS = Object.keys(AUTO_STAKE_STEPS); // min, quart, moitie, max
const JEUX = ["osselets", "icarus", "gratteux", "vingtetun"];

// payRound sous un Math.random FIGÉ à r : la partie entière, +1 si r tombe sous la
// fraction (en vrai E[payRound(x)] = x ; ici, un seul tirage connu).
const payAt = (x, r) => Math.floor(x) + (r < x - Math.floor(x) ? 1 : 0);

// Les tirages pilotés (Math.random figé) :
//  - 0,08 : le TRIPLE du rite ancestral (après Vénus 7,1 %, avant 19 %), et aussi
//    celui du rite interdit — un gain sans effet de bord (ni vol offert, ni carré) ;
//  - 0,01 : le Coup de VÉNUS (il offre un vol à la mise du jet). Le tirage du carré
//    de six (< 10 %) tombe aussi, mais sur une cagnotte VIDE il ne rafle rien. Côté
//    Icare, C = 0,97 / 0,01 = 97 : toute cible passe ;
//  - 0,5 : aux osselets, un jet CREUX (perdu) ; chez Icare, C = 0,97 / 0,5 = 1,94.
const R_TRIPLE = 0.08;
const R_VENUS = 0.01;
const R_MOITIE = 0.5;

const multDe = (tier, rite = "classique") => auguryPaytable("prayForRain", rite).mult[tier];
const tripleNet = (mise) => payAt(mise * multDe("triple"), R_TRIPLE) - mise;

// Le registre de la Chronique compte chaque partie et sa mise : c'est là qu'on lit
// la mise réellement posée par l'auto.
const registre = (jeu) => state.chronicleStats.games[jeu];

// Allume une auto (beforeEach les laisse toutes débloquées mais ÉTEINTES).
const allumer = (game, patch = {}) => Object.assign(state.templeAuto[game], { on: true }, patch);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = 4;       // osselets et tickets (>= 2), Icare et 21 (>= 3) ; limite haute 65
  state.faveur = FAVEUR_START;  // toutes les mises sont en FAVEUR
  state.templeArtifacts = {};
  state.icarusFreeFlights = []; // pas de vol offert → la Faveur est débitée
  state.icarusPotFaveur = 0;    // cagnotte vide : aucun carré de six ne rafle
  state.maisonRefund = 0;
  state.trunkFaveur = 0;        // caisse vide à FIXED_NOW
  state.trunkAt = FIXED_NOW;
  // Débloqués mais ÉTEINTS, plancher à 0, cadran au minimum : chaque test allume ce
  // qu'il exerce.
  const auto = defaultTempleAuto();
  for (const g of Object.values(auto)) g.unlocked = true;
  for (const jeu of JEUX) auto[jeu].faveurFloor = 0;
  state.templeAuto = auto;
  invalidateRenderCache("all");
});

afterEach(() => {
  setNotifyPaused(false);
  setOfflineSim(false);
  resetOfflineTempleQuota();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Automatisation — osselets (auto-lancé, mise en Faveur)", () => {
  it("joue au tick à la mise du cadran, débite la mise, crédite le gain — l'or ne bouge pas", () => {
    allumer("osselets", { stakeStep: "quart" });
    const mise = autoStake("quart"); // 16 : le quart de la limite de l'Ère IV
    const goldBefore = toNum(state.gold);
    const misé = registre("osselets").wagered;
    vi.spyOn(Math, "random").mockReturnValue(R_TRIPLE);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(FAVEUR_START + tripleNet(mise));
    expect(registre("osselets").wagered).toBe(misé + mise);
    expect(toNum(state.gold)).toBeCloseTo(goldBefore, 0); // la mise n'est jamais en or
    expect(state.templeAuto.osselets.lastAt).toBe(FIXED_NOW);
  });

  it("le cadran de mise : min, ¼, ½, max de la limite haute — qui grandit avec la ville", () => {
    allumer("osselets");
    const joue = (stakeStep) => {
      state.templeAuto.osselets.stakeStep = stakeStep;
      state.templeAuto.osselets.lastAt = 0;
      const avant = state.faveur;
      tickTempleAutomation();
      return avant - state.faveur;
    };
    vi.spyOn(Math, "random").mockReturnValue(R_MOITIE); // jet creux : la mise part, rien ne revient
    expect(tableLimits().max).toBe(65); // Ère IV
    expect(STEPS.map(joue)).toEqual([1, 16, 32, 65]);
    state.bestEraIndex = 10; // la ville a grandi : limite haute 560
    state.faveur = 5000;
    expect(joue("max")).toBe(560);
    expect(joue("quart")).toBe(140);
    Math.random.mockRestore();
  });

  it("respecte le cooldown : une partie par intervalle", () => {
    allumer("osselets", { stakeStep: "quart" });
    const net = tripleNet(autoStake("quart"));
    vi.spyOn(Math, "random").mockReturnValue(R_TRIPLE);
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
    vi.spyOn(Math, "random").mockReturnValue(R_TRIPLE);
    tickTempleAutomation(); // on:false
    expect(state.faveur).toBe(FAVEUR_START);
    allumer("osselets", { unlocked: false }); // débloqué NON
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(FAVEUR_START);
  });

  it("plancher de FAVEUR : joue au-dessus de la réserve, veille en dessous", () => {
    allumer("osselets", { stakeStep: "quart", faveurFloor: 100 });
    const mise = autoStake("quart");
    vi.spyOn(Math, "random").mockReturnValue(R_TRIPLE);
    // SOUS le plancher APRÈS mise → veille, et le cooldown n'est pas brûlé.
    state.faveur = 100 + mise - 1;
    tickTempleAutomation();
    expect(state.faveur).toBe(100 + mise - 1);
    expect(state.templeAuto.osselets.lastAt).toBe(0);
    // Pile au plancher après mise → joue.
    state.faveur = 100 + mise;
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(100 + mise + tripleNet(mise));
  });

  it("un rite gaté sans son artefact retombe sur le rite ancestral", () => {
    // Le rite interdit exige l'artefact : sans lui (save trafiquée), l'auto joue le
    // classique plutôt que de se bloquer. Le même tirage tombe en Triple dans les
    // deux rites, mais le Triple interdit paie ×3,12 et l'ancestral ×2,05.
    allumer("osselets", { stakeStep: "quart", rite: "interdit" });
    const mise = autoStake("quart");
    vi.spyOn(Math, "random").mockReturnValue(R_TRIPLE);
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START + tripleNet(mise));
    state.templeArtifacts = { interdit: true };
    state.templeAuto.osselets.lastAt = 0;
    const avant = state.faveur;
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(avant - mise + payAt(mise * multDe("triple", "interdit"), R_TRIPLE));
  });

  it("notifications en pause SANS simulation : ne joue pas", () => {
    // Deux drapeaux distincts depuis C12 : `notifyPaused` seul signifie « pas de
    // bruit visuel », pas « on rejoue du temps ». Sans simulation en cours, la
    // mécanique reste donc à l'arrêt.
    allumer("osselets", { stakeStep: "quart" });
    vi.spyOn(Math, "random").mockReturnValue(R_TRIPLE);
    setNotifyPaused(true);
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START);
    setNotifyPaused(false);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(FAVEUR_START + tripleNet(autoStake("quart")));
  });
});

describe("Automatisation — pendant l'absence (C12)", () => {
  // La promesse : les cadrans PAYÉS servent la nuit. Le garde-fou : un quota de
  // parties PAR JEU, pour qu'une longue absence ne rejoue pas des milliers de coups.
  // Le tirage est un Triple (gain sans vol offert ni carré de six) : ces tests
  // mesurent la CADENCE et le QUOTA, pas l'économie du jackpot (couverte à part).
  const jouerLongtemps = (ticks) => {
    vi.spyOn(Math, "random").mockReturnValue(R_TRIPLE);
    for (let i = 0; i < ticks; i += 1) {
      vi.advanceTimersByTime(AUTO_AUGURY_INTERVAL_MS);
      tickTempleAutomation();
    }
    Math.random.mockRestore();
  };
  const absence = () => {
    setNotifyPaused(true);
    setOfflineSim(true);
    resetOfflineTempleQuota();
  };

  it("JOUE pendant la simulation, là où l'ancien code s'arrêtait net", () => {
    allumer("osselets", { stakeStep: "quart" });
    absence();
    vi.spyOn(Math, "random").mockReturnValue(R_TRIPLE);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(FAVEUR_START + tripleNet(autoStake("quart")));
  });

  it("LE GARDE-FOU : le quota par jeu borne le nombre de parties rejouées", () => {
    allumer("osselets", { stakeStep: "quart" });
    absence();
    // Trois fois plus de ticks que le quota : le gain doit s'arrêter au quota.
    jouerLongtemps(OFFLINE_MAX_TEMPLE_PLAYS_PER_GAME * 3);
    expect(state.faveur).toBe(FAVEUR_START + tripleNet(autoStake("quart")) * OFFLINE_MAX_TEMPLE_PLAYS_PER_GAME);
  });

  it("le quota est PAR JEU : un jeu épuisé n'affame pas les autres", () => {
    // Un plafond global serait entièrement consommé par le premier jeu de la
    // liste, et les autres cadrans, payés eux aussi, ne tourneraient jamais.
    allumer("osselets", { stakeStep: "quart" });
    absence();
    jouerLongtemps(OFFLINE_MAX_TEMPLE_PLAYS_PER_GAME * 2);
    const apresOsselets = state.faveur;
    // Icare démarre avec son propre quota intact.
    allumer("icarus");
    vi.spyOn(Math, "random").mockReturnValue(R_TRIPLE);
    vi.advanceTimersByTime(AUTO_AUGURY_INTERVAL_MS * 10);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).not.toBe(apresOsselets);
  });

  it("la CHAÎNE COMPLÈTE passe : tick() atteint bien l'automatisation en simulation", () => {
    // Les tests ci-dessus appellent tickTempleAutomation directement. Celui-ci
    // vérifie que la simulation hors ligne, qui appelle tick(), y arrive
    // vraiment : sans ça, toute la fiche serait branchée dans le vide.
    allumer("osselets", { stakeStep: "quart", lastAt: 0 });
    state.instability = 0.1;   // basse : sinon le tick part en crise et court-circuite
    absence();
    const avant = state.faveur;
    vi.spyOn(Math, "random").mockReturnValue(R_VENUS);
    tick(1);
    Math.random.mockRestore();
    expect(state.faveur).toBeGreaterThan(avant);
  });

  it("le quota repart à zéro d'une absence à l'autre", () => {
    allumer("osselets", { stakeStep: "quart" });
    absence();
    jouerLongtemps(OFFLINE_MAX_TEMPLE_PLAYS_PER_GAME * 2);
    const apres = state.faveur;
    resetOfflineTempleQuota();          // nouvelle absence
    jouerLongtemps(1);
    expect(state.faveur).toBeGreaterThan(apres);
  });
});

describe("Automatisation — la caisse (auto-relève)", () => {
  it("relève quand la caisse frôle SON plafond (trunkCap), pas avant ; suspendable", () => {
    allumer("tronc");
    const cap = trunkCap();                       // 30 min de recettes : 131 à l'Ère IV
    const parSeconde = recettesPerHour() / 3600;
    const seuil = cap - Math.max(1, cap * 0.02);  // « frôle » = à 2 % du plafond
    const quand = (valeur) => FIXED_NOW + Math.ceil((valeur / parSeconde) * 1000);
    // Loin du plafond : rien.
    vi.setSystemTime(FIXED_NOW + 5 * 60_000);
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START);
    // Juste sous le seuil : toujours rien.
    vi.setSystemTime(quand(seuil - 1));
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START);
    // Passé le seuil, AVANT d'être pleine : relève (la caisse ne plafonne jamais).
    vi.setSystemTime(quand(cap - 1));
    const contenu = trunkValue(Date.now());
    expect(contenu).toBeGreaterThanOrEqual(seuil);
    expect(contenu).toBeLessThan(cap);
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START + Math.floor(contenu));
    expect(trunkValue(Date.now())).toBeLessThan(1); // la fraction reste dedans
    // Suspendue : la caisse plafonne sans relève.
    const apres = state.faveur;
    state.templeAuto.tronc.on = false;
    vi.setSystemTime(FIXED_NOW + 3 * 3_600_000);
    tickTempleAutomation();
    expect(state.faveur).toBe(apres);
    expect(trunkValue(Date.now())).toBe(cap);
  });

  it("le plafond suit l'ère record : la relève attend le plafond de la ville d'aujourd'hui", () => {
    allumer("tronc");
    state.trunkFaveur = trunkCap(); // pleine au plafond de l'Ère IV (131)
    const capIV = trunkCap();
    state.bestEraIndex = 10;        // la ville a grandi : 30 min de recettes valent plus
    expect(trunkCap()).toBeGreaterThan(capIV);
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START); // 131 n'est plus « presque plein »
    state.trunkFaveur = trunkCap();
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START + trunkCap());
  });
});

describe("Automatisation — Icare (autopush, résolution headless, mise en Faveur)", () => {
  it("gain si cible < crashPoint ; perte + cagnotte sinon", () => {
    // u = 0,5, edge 0,03 → crashPoint = 0,97 / 0,5 = 1,94.
    vi.spyOn(Math, "random").mockReturnValue(R_MOITIE);
    const mise = 20;
    // GAIN : cible 1,2 < 1,94 → payout payRound(mise × 1,2).
    const win = resolveIcarusHeadless(mise, 1.2);
    expect(win.type).toBe("cashout");
    expect(win.m).toBe(1.2);
    expect(win.stakeFaveur).toBe(mise);
    expect(win.freeFlight).toBe(false);
    expect(win.faveur).toBe(payAt(mise * 1.2, R_MOITIE));
    expect(state.faveur).toBe(FAVEUR_START - mise + win.faveur);
    // PERTE : cible 3 >= 1,94 → crash, la cagnotte s'épaissit SUR L'EDGE.
    const favAfterWin = state.faveur;
    const potBefore = state.icarusPotFaveur || 0;
    const loss = resolveIcarusHeadless(mise, 3);
    Math.random.mockRestore();
    expect(loss.type).toBe("crash");
    expect(loss.crashPoint).toBeCloseTo((1 - ICARUS_EDGE) / R_MOITIE, 12);
    expect(state.faveur).toBe(favAfterWin - mise); // la mise brûle, rien ne revient
    expect(state.icarusPotFaveur).toBeCloseTo(potBefore + mise * TEMPLE_POT_RECYCLE * ICARUS_EDGE, 9);
  });

  it("mise libre : plafonnée à la limite haute, refusée sous 1 ou impayable", () => {
    vi.spyOn(Math, "random").mockReturnValue(R_MOITIE);
    const max = tableLimits().max;
    const res = resolveIcarusHeadless(1e6, 1.2);
    expect(res.stakeFaveur).toBe(max);
    expect(state.faveur).toBe(FAVEUR_START - max + res.faveur);
    const f = state.faveur;
    expect(resolveIcarusHeadless(0, 1.2)).toBeNull();
    expect(resolveIcarusHeadless(0.5, 1.2)).toBeNull();
    expect(state.faveur).toBe(f); // refusé : rien de débité
    state.faveur = 19; // impayable, et pas de vol offert
    expect(resolveIcarusHeadless(20, 1.2)).toBeNull();
    Math.random.mockRestore();
    expect(state.faveur).toBe(19);
  });

  it("le tick joue Icare au multiplicateur cible, à la mise du cadran", () => {
    allumer("icarus", { target: 1.2, stakeStep: "moitie" });
    const mise = autoStake("moitie"); // 32
    const misé = registre("icarus").wagered;
    vi.spyOn(Math, "random").mockReturnValue(R_MOITIE); // crashPoint 1,94 > 1,2 → gain
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(FAVEUR_START - mise + payAt(mise * 1.2, R_MOITIE));
    expect(registre("icarus").wagered).toBe(misé + mise);
    expect(state.templeAuto.icarus.lastAt).toBe(FIXED_NOW);
  });

  it("respecte le cooldown Icare (12 s)", () => {
    allumer("icarus", { target: 1.2, stakeStep: "moitie" });
    const mise = autoStake("moitie");
    const net = payAt(mise * 1.2, R_MOITIE) - mise;
    vi.spyOn(Math, "random").mockReturnValue(R_MOITIE); // crashPoint 1,94 > 1,2 → gain
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

  it("vol OFFERT : joue SANS débit, à SON montant, et consomme le billet", () => {
    state.faveur = 0;               // aucune Faveur…
    state.icarusFreeFlights = [12]; // …mais un vol offert de 12
    const misé = registre("icarus").wagered;
    vi.spyOn(Math, "random").mockReturnValue(R_MOITIE); // crashPoint 1,94 > 1,2 → gain
    const res = resolveIcarusHeadless(65, 1.2, { free: true }); // la mise passée est ignorée
    expect(res.type).toBe("cashout");
    expect(res.freeFlight).toBe(true);
    expect(res.stakeFaveur).toBe(12);
    expect(res.faveur).toBe(payAt(12 * 1.2, R_MOITIE));
    expect(state.faveur).toBe(res.faveur); // aucune mise débitée
    expect(state.icarusFreeFlights).toEqual([]); // vol consommé
    expect(registre("icarus").wagered).toBe(misé); // la Maison a payé la mise
    // File vide : pas de vol offert à jouer.
    expect(resolveIcarusHeadless(65, 1.2, { free: true })).toBeNull();
    // Un billet au-dessus de la limite courante est re-borné (save trafiquée).
    state.icarusFreeFlights = [100000];
    const gros = resolveIcarusHeadless(1, 1.2, { free: true });
    Math.random.mockRestore();
    expect(gros.stakeFaveur).toBe(tableLimits().max);
  });

  it("l'auto joue un vol offert MÊME sous le plancher (coût nul), puis se rendort", () => {
    allumer("icarus", { faveurFloor: 120, target: 1.2, stakeStep: "max" });
    state.faveur = 0;               // très en dessous du plancher
    state.icarusFreeFlights = [12]; // mais un vol offert
    vi.spyOn(Math, "random").mockReturnValue(R_MOITIE);
    tickTempleAutomation();
    // A joué le billet, à SON montant (pas au cadran max).
    expect(state.faveur).toBe(payAt(12 * 1.2, R_MOITIE));
    expect(state.icarusFreeFlights).toEqual([]);
    // Plus de billet : sous le plancher, l'auto veille.
    vi.advanceTimersByTime(AUTO_ICARUS_INTERVAL_MS);
    const apres = state.faveur;
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.faveur).toBe(apres);
  });

  it("l'auto NE rafle PAS la cagnotte ni le jalon GR VII (réservés au manuel)", () => {
    state.icarusPotFaveur = 1000;
    state.icarusJackpots = 0;
    const mise = tableLimits().max; // à la main, la mise max raflerait TOUT
    vi.spyOn(Math, "random").mockReturnValue(R_VENUS); // crashPoint 97 > 10 → gain à ×10
    const res = resolveIcarusHeadless(mise, 10);
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

  it("osselets ET Icare dans le MÊME tick : le Vénus OFFRE le vol, joué à SA mise", () => {
    allumer("osselets", { stakeStep: "quart" });               // 16
    allumer("icarus", { target: 1.2, stakeStep: "max" });      // 65 : jamais débité ici
    const mise = autoStake("quart");
    const misé = registre("icarus").wagered;
    vi.spyOn(Math, "random").mockReturnValue(R_VENUS); // osselets Vénus ; Icare C = 97
    tickTempleAutomation();
    Math.random.mockRestore();
    // Le Coup de Vénus stocke un vol OFFERT de 16 (la mise du jet) que l'auto-Icare
    // joue dans la foulée : la mise du cadran d'Icare n'est PAS débitée.
    const venus = payAt(mise * multDe("venus"), R_VENUS);
    const icare = payAt(mise * 1.2, R_VENUS);
    expect(state.faveur).toBe(FAVEUR_START - mise + venus + icare);
    expect(state.icarusFreeFlights).toEqual([]);   // le vol offert a été consommé
    expect(registre("icarus").plays).toBeGreaterThan(0);
    expect(registre("icarus").wagered).toBe(misé); // et la Maison en a payé la mise
    expect(state.templeAuto.osselets.lastAt).toBe(FIXED_NOW);
    expect(state.templeAuto.icarus.lastAt).toBe(FIXED_NOW);
  });
});

describe("Automatisation — gratteux et vingt-et-un (le cadran de mise)", () => {
  it("misent eux aussi la part de la limite choisie", () => {
    allumer("gratteux", { stakeStep: "max" });
    const ticket = registre("scratch").wagered;
    vi.spyOn(Math, "random").mockReturnValue(R_MOITIE); // ticket blanc (74 % des tirages)
    tickTempleAutomation();
    expect(state.faveur).toBe(FAVEUR_START - tableLimits().max);
    expect(registre("scratch").wagered).toBe(ticket + tableLimits().max);
    state.templeAuto.gratteux.on = false;
    allumer("vingtetun", { stakeStep: "quart" });
    const main = registre("blackjack").wagered;
    tickTempleAutomation();
    Math.random.mockRestore();
    // La stratégie de base peut doubler : la mise posée vaut le quart ou deux quarts.
    const mise = autoStake("quart");
    expect([mise, 2 * mise]).toContain(registre("blackjack").wagered - main);
    expect(state.templeAuto.vingtetun.lastAt).toBe(FIXED_NOW);
  });
});

describe("Automatisation — câblage au tick", () => {
  it("le VRAI tick() appelle le moteur (osselets débloqué+activé → une partie jouée)", () => {
    // Prouve le branchement tick.js → tickTempleAutomation (le moteur unitaire
    // pourrait marcher sans être appelé par la boucle). À la mise du quart (16),
    // aucun jet ne laisse la Faveur inchangée : le plus petit gain (une paire,
    // ×1,54) rend plus que la mise, une perte la garde. Instability basse pour ne
    // pas court-circuiter le tick (crise).
    allumer("osselets", { stakeStep: "quart", lastAt: 0 });
    state.instability = 0.1;
    const parties = registre("osselets").plays;
    const favBefore = state.faveur;
    tick(1);
    expect(registre("osselets").plays).toBe(parties + 1);
    expect(state.faveur).not.toBe(favBefore);
    expect(state.templeAuto.osselets.lastAt).toBeGreaterThan(0); // le hook a bien joué
  });
});

describe("Automatisation — l'annonce du remboursement (lot 1)", () => {
  // La migration 4 → 5 rend la Faveur des achats supprimés (dés pipés, ailes cirées,
  // planches, Coffres…) pendant load(), avant que l'état n'existe : elle ne peut ni
  // chroniquer ni afficher. Elle pose state.maisonRefund, que le PREMIER tick en
  // ligne annonce puis remet à zéro — une seule annonce, aucun second crédit.
  it("le premier tick en ligne chronique le remboursement et remet maisonRefund à 0, une fois", () => {
    state.maisonRefund = 500;
    state.history = [];
    state.templeAuto = null; // même sans la moindre automatisation
    tickTempleAutomation();
    expect(state.maisonRefund).toBe(0);
    expect(state.history.length).toBe(1);
    expect(state.history[0]).toContain("change ses règles");
    expect(state.history[0]).toContain("rend 500 faveur");
    expect(state.faveur).toBe(FAVEUR_START); // annoncée, pas re-créditée (la migration l'a versée)
    tickTempleAutomation();
    expect(state.history.length).toBe(1);    // pas de seconde annonce
  });

  it("pendant l'absence, l'annonce attend le retour en ligne", () => {
    state.maisonRefund = 500;
    state.history = [];
    setNotifyPaused(true);
    setOfflineSim(true);
    resetOfflineTempleQuota();
    tickTempleAutomation();                  // simulation : la Chronique hors ligne est jetée
    expect(state.maisonRefund).toBe(500);
    expect(state.history).toEqual([]);
    setOfflineSim(false);                    // pause seule : rien ne tourne
    tickTempleAutomation();
    expect(state.maisonRefund).toBe(500);
    setNotifyPaused(false);                  // de retour
    tickTempleAutomation();
    expect(state.maisonRefund).toBe(0);
    expect(state.history.length).toBe(1);
  });

  it("rien à rendre : aucune ligne", () => {
    state.history = [];
    tickTempleAutomation();
    expect(state.history).toEqual([]);
  });
});

describe("Automatisation — persistance des réglages", () => {
  it("les réglages SURVIVENT au Grand Reset (éternels), la Faveur se re-gagne", () => {
    allumer("osselets", { stakeStep: "moitie" });
    state.templeAuto.icarus.target = 4;
    state.templeAuto.gratteux.tempo = "fervent";
    state.faveur = 300;
    expect(autoStake("moitie")).toBe(32); // Ère IV : la moitié de 65
    const fresh = buildGrandResetState(2);
    expect(fresh.templeAuto.tronc.unlocked).toBe(true);
    expect(fresh.templeAuto.osselets.unlocked).toBe(true);
    expect(fresh.templeAuto.osselets.on).toBe(true);
    expect(fresh.templeAuto.osselets.stakeStep).toBe("moitie");
    expect(fresh.templeAuto.icarus.target).toBe(4);
    expect(fresh.templeAuto.gratteux.tempo).toBe("fervent");
    expect(fresh.faveur).toBe(0); // carburant re-gagné
    // Le cadran est une PART : l'ère record retombe, la mise réelle avec elle.
    setState(fresh);
    expect(autoStake(state.templeAuto.osselets.stakeStep)).toBe(15); // la moitié de 30
  });

  it("les réglages SURVIVENT à l'effondrement (hors resetTemporaryRunState)", () => {
    allumer("osselets", { stakeStep: "max" });
    state.templeAuto.icarus.target = 4;
    resetTemporaryRunState(state);
    expect(state.templeAuto.osselets.unlocked).toBe(true);
    expect(state.templeAuto.osselets.on).toBe(true);
    expect(state.templeAuto.osselets.stakeStep).toBe("max");
    expect(state.templeAuto.icarus.target).toBe(4);
  });

  it("hydratation : défaut = tout verrouillé/éteint au cadran min, cible bornée, plancher assaini", () => {
    const def = hydrateState({});
    for (const g of [...JEUX, "tronc"]) {
      expect(def.templeAuto[g].unlocked).toBe(false);
      expect(def.templeAuto[g].on).toBe(false);
    }
    for (const jeu of JEUX) expect(def.templeAuto[jeu].stakeStep).toBe("min");

    const s = hydrateState({
      templeAuto: { osselets: { on: true, faveurFloor: 99999 }, icarus: { target: 999, on: true, unlocked: true, stakeStep: "moitie" } }
    });
    expect(s.templeAuto.icarus.target).toBe(AUTO_ICARUS_TARGET_MAX); // 999 borné à 10
    // Borne BASSE aussi : une cible sous le min est remontée.
    expect(hydrateState({ templeAuto: { icarus: { target: 0.5 } } }).templeAuto.icarus.target).toBe(AUTO_ICARUS_TARGET_MIN);
    expect(s.templeAuto.icarus.stakeStep).toBe("moitie");
    expect(s.templeAuto.icarus.on).toBe(true);
    expect(s.templeAuto.osselets.on).toBe(true);
    expect(s.templeAuto.osselets.rite).toBe("classique"); // défaut préservé
    // Le plancher n'a qu'une borne LARGE à l'hydratation (le curseur, lui, borne par
    // autoFloorMax() à l'écriture) ; un négatif remonte à 0, un illisible au défaut.
    expect(s.templeAuto.osselets.faveurFloor).toBe(99999);
    expect(hydrateState({ templeAuto: { osselets: { faveurFloor: -5 } } }).templeAuto.osselets.faveurFloor).toBe(0);
    expect(hydrateState({ templeAuto: { gratteux: { faveurFloor: "abc" } } }).templeAuto.gratteux.faveurFloor)
      .toBe(AUTO_TEMPLE_FAVEUR_FLOOR_DEFAULT);
    // Migration douce d'une save d'avant la monnaie fermée : goldFloorS
    // (osselets comme Icare) abandonné, plancher de Faveur au défaut.
    const old = hydrateState({ templeAuto: { osselets: { unlocked: true, goldFloorS: 300 }, icarus: { unlocked: true, goldFloorS: 200 } } });
    expect(old.templeAuto.osselets.unlocked).toBe(true);
    expect(old.templeAuto.osselets.faveurFloor).toBeGreaterThanOrEqual(0);
    expect(old.templeAuto.osselets.goldFloorS).toBeUndefined();
    expect(old.templeAuto.icarus.faveurFloor).toBeGreaterThanOrEqual(0);
    expect(old.templeAuto.icarus.goldFloorS).toBeUndefined();
  });

  it("hydratation d'une save d'avant le lot 1 : { stakeId, stakePow } → stakeStep 'min'", () => {
    // Les mises fixes (ids) et les crans des Coffres ont disparu : la mise repart à
    // la plus petite part de la limite, le reste des réglages payés est gardé.
    const old = hydrateState({
      templeAuto: {
        osselets: { unlocked: true, on: true, rite: "grand", stakeId: "grand", stakePow: 2 },
        icarus: { unlocked: true, on: true, target: 4, stakeId: "aile", stakePow: 1 },
        gratteux: { unlocked: true, tempo: "fervent", stakeId: "or", stakePow: 3 },
        vingtetun: { unlocked: true, stakeId: "royale", stakePow: 0 }
      }
    });
    for (const jeu of JEUX) {
      expect(old.templeAuto[jeu].stakeStep).toBe("min");
      expect(old.templeAuto[jeu].stakeId).toBeUndefined();
      expect(old.templeAuto[jeu].stakePow).toBeUndefined();
      expect(old.templeAuto[jeu].unlocked).toBe(true);
    }
    expect(old.templeAuto.osselets.rite).toBe("grand");
    expect(old.templeAuto.icarus.target).toBe(4);
    expect(old.templeAuto.gratteux.tempo).toBe("fervent");
    // Un cadran inconnu retombe aussi au minimum.
    expect(hydrateState({ templeAuto: { gratteux: { stakeStep: "tout" } } }).templeAuto.gratteux.stakeStep).toBe("min");
  });
});

describe("Automatisation — réglages (setter), déblocage & débit estimé", () => {
  it("setTempleAuto écrit et BORNE les réglages (rite, cible, cadran de mise, tempo, plancher)", () => {
    setTempleAuto("osselets", { on: true, rite: "grand" });
    expect(state.templeAuto.osselets.on).toBe(true);
    expect(state.templeAuto.osselets.rite).toBe("grand");
    setTempleAuto("osselets", { rite: "n_importe_quoi" }); // rite invalide → ignoré
    expect(state.templeAuto.osselets.rite).toBe("grand");
    setTempleAuto("icarus", { target: 999, stakeStep: "max" });
    expect(state.templeAuto.icarus.target).toBe(AUTO_ICARUS_TARGET_MAX); // borné à 10
    expect(state.templeAuto.icarus.stakeStep).toBe("max");
    setTempleAuto("icarus", { target: 0.1, stakeStep: "bidon" }); // sous le min + cadran invalide
    expect(state.templeAuto.icarus.target).toBe(AUTO_ICARUS_TARGET_MIN); // remonté à 1,2
    expect(state.templeAuto.icarus.stakeStep).toBe("max"); // inchangé (invalide ignoré)
    // Les anciens cadrans (mise par id, crans des Coffres) ne s'écrivent plus.
    setTempleAuto("icarus", { stakeId: "hecatombe", stakePow: 2 });
    expect(state.templeAuto.icarus.stakeId).toBeUndefined();
    expect(state.templeAuto.icarus.stakePow).toBeUndefined();
    expect(state.templeAuto.icarus.stakeStep).toBe("max");
    setTempleAuto("gratteux", { stakeStep: "quart", tempo: "fervent" });
    expect(state.templeAuto.gratteux.stakeStep).toBe("quart");
    expect(state.templeAuto.gratteux.tempo).toBe("fervent");
    setTempleAuto("gratteux", { tempo: "frenetique" }); // tempo invalide → ignoré
    expect(state.templeAuto.gratteux.tempo).toBe("fervent");
    setTempleAuto("osselets", { faveurFloor: -50 });
    expect(state.templeAuto.osselets.faveurFloor).toBe(0); // planché à 0
    setTempleAuto("osselets", { faveurFloor: 150.7 });
    expect(state.templeAuto.osselets.faveurFloor).toBe(151); // arrondi à l'entier
    setTempleAuto("osselets", { faveurFloor: 1e12 });
    expect(state.templeAuto.osselets.faveurFloor).toBe(autoFloorMax()); // plafonné
    setTempleAuto("icarus", { faveurFloor: 1e12 });
    expect(state.templeAuto.icarus.faveurFloor).toBe(autoFloorMax()); // Icare aussi en Faveur
    // La caisse n'a ni mise ni plancher.
    setTempleAuto("tronc", { on: true, stakeStep: "max", faveurFloor: 50 });
    expect(state.templeAuto.tronc.on).toBe(true);
    expect(state.templeAuto.tronc.stakeStep).toBeUndefined();
    expect(state.templeAuto.tronc.faveurFloor).toBeUndefined();
  });

  it("le plancher est borné par autoFloorMax() : 24 h de recettes, jamais sous l'ancien plafond", () => {
    const attendu = () => Math.max(AUTO_TEMPLE_FAVEUR_FLOOR_MAX, Math.round(recettesPerHour() * 24));
    expect(autoFloorMax()).toBe(attendu()); // 6 280 à l'Ère IV
    setTempleAuto("osselets", { faveurFloor: 1e12 });
    expect(state.templeAuto.osselets.faveurFloor).toBe(attendu());
    // La Maison grandit avec la ville : la réserve peut suivre.
    state.bestEraIndex = 20;
    expect(autoFloorMax()).toBe(attendu()); // ~1,5 M
    expect(autoFloorMax()).toBeGreaterThan(1_000_000);
    setTempleAuto("osselets", { faveurFloor: 1_000_000 }); // sous la borne : pris tel quel
    expect(state.templeAuto.osselets.faveurFloor).toBe(1_000_000);
    setTempleAuto("osselets", { faveurFloor: 1e12 });
    expect(state.templeAuto.osselets.faveurFloor).toBe(autoFloorMax());
    // Jamais sous l'ancien plafond fixe, même au tout début.
    state.bestEraIndex = 0;
    expect(autoFloorMax()).toBeGreaterThanOrEqual(AUTO_TEMPLE_FAVEUR_FLOOR_MAX);
  });

  it("unlockTempleAuto : la sébile du tronc s'achète (refus sans Faveur, débit unique) ; les autos des jeux ne se vendent plus", () => {
    state.templeAuto.tronc.unlocked = false;
    state.templeAuto.tronc.on = false;
    const cost = templeAutoUnlockCost("tronc");
    state.faveur = cost - 1;
    expect(unlockTempleAuto("tronc")).toBe(false);
    expect(state.templeAuto.tronc.unlocked).toBe(false);
    state.faveur = cost + 100;
    expect(unlockTempleAuto("tronc")).toBe(true);
    expect(state.templeAuto.tronc).toMatchObject({ unlocked: true, on: true }); // activée d'emblée
    expect(state.faveur).toBe(100);                    // débité du coût
    expect(unlockTempleAuto("tronc")).toBe(false);     // déjà débloquée → pas de double débit
    expect(state.faveur).toBe(100);
    // Lot 2 : les automatisations des quatre jeux sont des CADEAUX DE RANG.
    for (const jeu of JEUX) {
      state.templeAuto[jeu].unlocked = false;
      expect(unlockTempleAuto(jeu)).toBe(false);
      expect(state.templeAuto[jeu].unlocked).toBe(false);
    }
    expect(state.faveur).toBe(100);
  });

  it("GARDE-FOU du lot 1 : débit NÉGATIF à toute mise, toute ère, tout rite, toute cible", () => {
    // Plus aucun jeu au-dessus de 100 % : l'auto-jeu consomme toujours (sans
    // artefact). Seule la caisse rapporte.
    state.templeArtifacts = { interdit: true }; // le 4e rite aussi
    for (const jeu of JEUX) setTempleAuto(jeu, { on: true });
    for (const era of [3, 4, 10, 20, 34]) {
      state.bestEraIndex = era;
      for (const stakeStep of STEPS) {
        for (const jeu of JEUX) setTempleAuto(jeu, { stakeStep });
        for (const rite of ["prudent", "classique", "grand", "interdit"]) {
          setTempleAuto("osselets", { rite });
          expect(templeAutoThroughput("osselets")).toBeLessThan(0);
        }
        for (const target of [AUTO_ICARUS_TARGET_MIN, 1.5, 2, 3.7, 5, AUTO_ICARUS_TARGET_MAX]) {
          setTempleAuto("icarus", { target });
          expect(templeAutoThroughput("icarus")).toBeLessThan(0);
        }
        expect(templeAutoThroughput("gratteux")).toBeLessThan(0);
        expect(templeAutoThroughput("vingtetun")).toBeLessThan(0);
      }
    }
  });

  it("débit osselets = (RTP − 1) × mise × jets/min : le rite n'y change rien (97 % chacun), la mise si", () => {
    const perMin = 60000 / AUTO_AUGURY_INTERVAL_MS; // 7,5 jets/min au tempo mesuré
    setTempleAuto("osselets", { on: true });
    for (const stakeStep of STEPS) {
      setTempleAuto("osselets", { stakeStep });
      for (const rite of ["prudent", "classique", "grand"]) {
        setTempleAuto("osselets", { rite });
        const pay = auguryPaytable("prayForRain", rite);
        expect(pay.rtp).toBeCloseTo(AUGURY_RTP, 12);
        expect(templeAutoThroughput("osselets")).toBeCloseTo((pay.rtp - 1) * autoStake(stakeStep) * perMin, 9);
      }
    }
    // Le cadran max brûle plus vite que le min (mise plus grosse, même RTP).
    setTempleAuto("osselets", { stakeStep: "max" });
    const max = templeAutoThroughput("osselets");
    setTempleAuto("osselets", { stakeStep: "min" });
    expect(max).toBeLessThan(templeAutoThroughput("osselets"));
    // Le tempo entre dans la cadence : fervent = deux fois plus de jets.
    const mesure = templeAutoThroughput("osselets");
    setTempleAuto("osselets", { tempo: "fervent" });
    expect(templeAutoThroughput("osselets")).toBeCloseTo(mesure / AUTO_TEMPO_MULT.fervent, 9);
  });

  it("débit Icare = (pGain × mise × cible − mise) × vols/min : −3 % de la mise par vol", () => {
    const perMin = 60000 / AUTO_ICARUS_INTERVAL_MS; // 5 vols/min
    const ev = (mise, T) => {
      const pWin = Math.min(1, (1 - icarusEffectiveEdge()) / T);
      return (pWin * mise * (Math.floor(T * 100) / 100) - mise) * perMin;
    };
    expect(icarusEffectiveEdge()).toBe(ICARUS_EDGE); // fixe : plus d'ailes cirées
    setTempleAuto("icarus", { on: true });
    for (const stakeStep of STEPS) {
      for (const target of [1.2, 2, 10]) {
        setTempleAuto("icarus", { stakeStep, target });
        expect(templeAutoThroughput("icarus")).toBeCloseTo(ev(autoStake(stakeStep), target), 9);
      }
    }
    // À une cible ronde, un vol vaut −3 % de la mise, quelle que soit la cible.
    setTempleAuto("icarus", { stakeStep: "max", target: 2 });
    expect(templeAutoThroughput("icarus")).toBeCloseTo(-ICARUS_EDGE * tableLimits().max * perMin, 9);
  });

  // Le badge du vingt-et-un auto a déjà lu BLACKJACK_RTP_REF (le jeu PARFAIT) au
  // lieu du chemin de l'auto : il annonçait un gain là où la table consomme. Le
  // test épingle la constante lue ET le signe.
  it("débit gratteux et vingt-et-un : (RTP − 1) × mise × parties/min, NÉGATIF", () => {
    const perMinG = 60000 / AUTO_SCRATCH_INTERVAL_MS;
    const perMinV = 60000 / AUTO_BLACKJACK_INTERVAL_MS;
    setTempleAuto("gratteux", { on: true });
    setTempleAuto("vingtetun", { on: true });
    for (const stakeStep of STEPS) {
      setTempleAuto("gratteux", { stakeStep });
      setTempleAuto("vingtetun", { stakeStep });
      expect(templeAutoThroughput("gratteux")).toBeCloseTo((scratchRtpRef() - 1) * autoStake(stakeStep) * perMinG, 9);
      expect(templeAutoThroughput("vingtetun")).toBeCloseTo((BLACKJACK_RTP_AUTO - 1) * autoStake(stakeStep) * perMinV, 9);
    }
    // La loterie de la Maison rend 75 % : le pari le plus cher.
    expect(scratchRtpRef()).toBeCloseTo(0.75, 3);
    // Les deux RTP du 21 ne se confondent pas : REF majore le jeu parfait (double +
    // refente, ce que lit feedPot), AUTO mesure la base avec le double. Depuis le
    // lot 1, les deux restent sous 1.
    expect(BLACKJACK_RTP_AUTO).toBeLessThan(BLACKJACK_RTP_REF);
    expect(BLACKJACK_RTP_REF).toBeLessThan(1);
  });

  it("débit de la caisse : les recettes par minute, qui suivent l'ère record", () => {
    setTempleAuto("tronc", { on: true });
    expect(templeAutoThroughput("tronc")).toBeCloseTo(recettesPerHour() / 60, 9);
    const ereIV = templeAutoThroughput("tronc");
    state.bestEraIndex = 10;
    expect(templeAutoThroughput("tronc")).toBeCloseTo(recettesPerHour() / 60, 9);
    expect(templeAutoThroughput("tronc")).toBeGreaterThan(ereIV);
    expect(templeAutoThroughput("bidon")).toBe(0); // jeu invalide → 0
  });

  it("débit = 0 à l'ARRÊT, et = 0 avant l'ère jouable (production réelle nulle)", () => {
    for (const g of [...JEUX, "tronc"]) setTempleAuto(g, { on: true });
    expect(templeAutoThroughput("osselets")).toBeLessThan(0);
    setTempleAuto("osselets", { on: false });
    expect(templeAutoThroughput("osselets")).toBe(0);              // à l'arrêt → 0
    setTempleAuto("osselets", { on: true });
    // Icare et le 21 activés mais avant l'Ère III → le moteur rend 0, le badge suit.
    expect(templeAutoThroughput("icarus")).toBeLessThan(0);        // joue (à perte, honnête)
    expect(templeAutoThroughput("vingtetun")).toBeLessThan(0);
    state.bestEraIndex = 2;                                        // Ère II : ni Icare ni le 21
    expect(templeAutoThroughput("icarus")).toBe(0);
    expect(templeAutoThroughput("vingtetun")).toBe(0);
    expect(templeAutoThroughput("gratteux")).toBeLessThan(0);      // les tickets, si
    expect(templeAutoThroughput("tronc")).toBeGreaterThan(0);
    state.bestEraIndex = 1;                                        // la Maison n'ouvre pas encore
    for (const g of [...JEUX, "tronc"]) expect(templeAutoThroughput(g)).toBe(0);
  });

  it("setter/unlock : jeu invalide = no-op, templeAuto null reconstruit", () => {
    expect(() => setTempleAuto("foo", { on: true })).not.toThrow();
    expect(unlockTempleAuto("bidon")).toBe(false);
    state.templeAuto = null;
    setTempleAuto("osselets", { on: true });                      // reconstruit defaultTempleAuto
    expect(state.templeAuto.osselets.on).toBe(true);
    expect(state.templeAuto.osselets.stakeStep).toBe("min");
  });

  it("les automatisations viennent du RANG : Familier offre osselets et Icare, à l'arrêt, sans débit", () => {
    for (const jeu of JEUX) { state.templeAuto[jeu].unlocked = false; state.templeAuto[jeu].on = false; }
    state.faveur = 10000;
    expect(unlockTempleAuto("icarus")).toBe(false);    // plus à vendre
    state.maisonReputation = 0.5;                      // le seuil de Familier
    expect(promoteRank()).toBe(1);
    expect(state.maisonRank).toBe(1);
    expect(state.templeAuto.osselets).toMatchObject({ unlocked: true, on: false });
    expect(state.templeAuto.icarus).toMatchObject({ unlocked: true, on: false });
    expect(state.templeAuto.gratteux.unlocked).toBe(false); // celles-ci : au rang Notable
    expect(state.templeAuto.vingtetun.unlocked).toBe(false);
    expect(state.faveur).toBe(10000);
  });

  it("defaultState fournit un templeAuto COMPLET (pas null) — panneau visible en partie fraîche", () => {
    const d = defaultState();
    expect(d.templeAuto).not.toBeNull();
    expect(d.templeAuto.tronc.unlocked).toBe(false);
    for (const jeu of JEUX) {
      expect(d.templeAuto[jeu].unlocked).toBe(false);
      expect(d.templeAuto[jeu].stakeStep).toBe("min"); // la plus petite part de la limite
      expect("stakeId" in d.templeAuto[jeu]).toBe(false);
    }
    expect(d.maisonRefund).toBe(0); // rien à annoncer en partie fraîche
  });
});
