"use strict";
// Chancellerie (onglet Régulation, 2026-07-13) — mécaniques des 4 piliers :
//  - Clémence des augures : chaque revers consécutif compte un CRAN qui ALLÈGE
//    la prochaine offrande (rabais de mise, monnaie fermée 2026-07-16), remise
//    à zéro au gain ; historique capé.
//  - Registre des édits : chaque acte dépose une entrée factuelle (cap, reset
//    par cycle) et un marqueur d'annales.
//  - Intendance : consignes « si Rupture > X % → édit », mêmes coûts/fatigue
//    que le joueur, cooldown par consigne, slots gatés par la progression.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, resetTemporaryRunState } from "../state.js";
import { runCrisisAction, setStewardClause, tickSteward, stewardSlotCount, castAugury, doubleAugury, auguryStake, auguryRebate, auguryPaytable, auguryTierOdds } from "../actions.js";
import { clemencyCrans, regulationContext } from "../mechanics.js";
import { REGULATION_ACTIONS } from "../../data/regulationActions.js";
import { annalsWindow, resetAnnals } from "../annals.js";
import { toNum } from "../num.js";
import {
  GAMBLE_HISTORY_LEN, REGUL_LEDGER_MAX, STEWARD_COOLDOWN_MS,
  AUGURY_STAKES, AUGURY_RTP_CAP,
  TEMPLE_POT_RECYCLE,
  AUGURY_CLEMENCY_LADDER,
  DICE_BOOST_MAX_LEVEL,
  AUGURY_REF_DICE_LEVEL
} from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  // Les coûts d'édit s'ancrent sur la PRODUCTION (≈25-28 s de vivres ≈ 150 k) :
  // le stock de la fixture (80 k) ne couvre aucun édit — on regonfle pour que
  // les tests exercent l'exécution, pas la disette.
  state.food = 1e9;
  state.gold = 1e12;
  state.faveur = 1000; // les osselets misent la FAVEUR (monnaie fermée 2026-07-16)
  resetAnnals();
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Force l'issue du prochain pari (via castAugury classique). Zones pour
// prayForRain, odds RÉDUITES (base 0.55 × GAMBLE_ODDS_SCALE 0.5 ≈ 0.28) :
// r≈0.5 → jet CREUX (0), r≈0.99 → le CHIEN (2, compte double), r≈0.01 → Vénus.
function rollGamble(id, randomValue) {
  vi.spyOn(Math, "random").mockReturnValue(randomValue);
  castAugury(id, "classique", { render: false });
  Math.random.mockRestore();
}
describe("Clémence des augures (pitié sur série noire) — rabais de mise", () => {
  it("un cran par revers consécutif : la mise DESCEND l'échelle, remise à zéro au gain", () => {
    // ÉCHELLE ENTIÈRE (2026-07-17) : la mise du cran est LUE dans
    // AUGURY_CLEMENCY_LADDER — l'ancien −10 %/cran arrondissait en no-op exacts.
    expect(clemencyCrans("prayForRain")).toBe(0);
    expect(auguryRebate("prayForRain")).toBe(0);
    rollGamble("prayForRain", 0.5); // jet creux
    rollGamble("prayForRain", 0.5); // jet creux
    expect(state.gambleHistory.prayForRain).toEqual([0, 0]);
    expect(clemencyCrans("prayForRain")).toBe(2);
    // La mise effective est allégée, la mise pleine reste la référence.
    const st = auguryStake("prayForRain", "classique");
    expect(st.base).toBe(AUGURY_STAKES.classique);
    expect(st.stake).toBe(AUGURY_CLEMENCY_LADDER.classique[2]);
    expect(st.rebate).toBeCloseTo(1 - AUGURY_CLEMENCY_LADDER.classique[2] / AUGURY_STAKES.classique, 10);
    rollGamble("prayForRain", 0.01); // Vénus → gagné, remet à zéro
    expect(state.gambleHistory.prayForRain).toEqual([0, 0, 1]);
    expect(auguryRebate("prayForRain")).toBe(0);
  });

  it("le Chien compte DOUBLE dans la Clémence (pitié des dieux)", () => {
    rollGamble("prayForRain", 0.99); // le Chien
    expect(state.gambleHistory.prayForRain).toEqual([2]);
    expect(clemencyCrans("prayForRain")).toBe(2); // 2 crans d'un coup
  });

  it("l'échelle plafonne au PLANCHER (la moitié de la mise pleine) et l'historique reste capé", () => {
    for (let i = 0; i < GAMBLE_HISTORY_LEN + 3; i++) rollGamble("prayForRain", 0.999);
    expect(state.gambleHistory.prayForRain).toHaveLength(GAMBLE_HISTORY_LEN);
    const ladder = AUGURY_CLEMENCY_LADDER.classique;
    const floorStake = ladder[ladder.length - 1];
    expect(floorStake).toBe(AUGURY_STAKES.classique / 2); // le plancher EST la moitié
    const st = auguryStake("prayForRain", "classique");
    expect(st.stake).toBe(floorStake);
  });

  it("la Clémence ne touche PLUS les odds : pEff identique avec ou sans crans", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const sansCrans = castAugury("prayForRain", "classique", { render: false });
    const avecCrans = castAugury("prayForRain", "classique", { render: false }); // 1 cran
    Math.random.mockRestore();
    expect(clemencyCrans("prayForRain")).toBeGreaterThan(0);
    expect(avecCrans.pEff).toBeCloseTo(sansCrans.pEff, 12);
  });

  it("un pari NE touche PAS la Rupture (jeux découplés)", () => {
    const before = state.instability;
    rollGamble("prayForRain", 0.5); // creux
    expect(state.instability).toBeCloseTo(before, 10);
    rollGamble("prayForRain", 0.99); // Chien
    expect(state.instability).toBeCloseTo(before, 10);
    // Les paris n'écrivent plus dans le registre des édits (économie à part).
    expect((state.regulLedger || []).some((e) => e.kind === "gambleLoss")).toBe(false);
  });
});

describe("Registre des édits & annales", () => {
  it("chaque acte dépose une entrée factuelle + un marqueur d'annales", () => {
    runCrisisAction("rationing", { render: false });
    const entry = state.regulLedger[state.regulLedger.length - 1];
    expect(entry.id).toBe("rationing");
    expect(entry.kind).toBe("soothe");
    expect(entry.foyer).toBe("scarcity");
    expect(entry.delta).toBeGreaterThan(0);
    expect(entry.by).toBeNull();
    const { marks } = annalsWindow();
    expect(marks.some((m) => m.kind === "soothe" && m.id === "rationing")).toBe(true);
  });

  it("est capé à REGUL_LEDGER_MAX", () => {
    for (let i = 0; i < REGUL_LEDGER_MAX + 10; i++) {
      state.food = 1e9; // les coûts escaladent : on regonfle pour payer chaque édit
      runCrisisAction("rationing", { render: false });
    }
    expect(state.regulLedger).toHaveLength(REGUL_LEDGER_MAX);
  });

  it("reset par cycle : registre et jets effacés, consignes CONSERVÉES, Faveur et tronc SURVIVENT", () => {
    runCrisisAction("rationing", { render: false });
    rollGamble("prayForRain", 0.99);
    state.faveur = 42; // gagnée au tronc et aux jeux : c'est une monnaie méta
    state.trunkFaveur = 12.5;
    setStewardClause(0, { actionId: "rationing", threshold: 0.65, enabled: true });
    resetTemporaryRunState(state);
    expect(state.regulLedger).toEqual([]);
    expect(state.gambleHistory).toEqual({});
    expect(state.faveur).toBe(42); // la Faveur survit à l'effondrement
    expect(state.trunkFaveur).toBe(12.5); // le tronc aussi (même statut méta)
    expect(state.stewardClauses[0]).toMatchObject({ actionId: "rationing", enabled: true });
    expect(annalsWindow().marks).toEqual([]);
  });

  it("hydratation : entrées re-typées, seuils ramenés aux crans, jets 0/1/2", () => {
    const s = hydrateState({
      regulLedger: [{ id: "rationing", kind: "soothe", delta: 0.2 }, { pas: "de champ id" }, "junk"],
      gambleHistory: { prayForRain: [1, 0, 2, "x"], "bad id!": [1] },
      stewardClauses: [{ threshold: 0.9, actionId: "rationing", enabled: true, lastAt: 123 }],
      faveur: 77,
      trunkFaveur: 12.5,
      trunkAt: 123456
    });
    expect(s.regulLedger).toHaveLength(1);
    expect(s.regulLedger[0].id).toBe("rationing");
    expect(s.gambleHistory.prayForRain).toEqual([1, 0, 2, 1]); // 2 = le Chien (légitime), 'x' → 1
    expect(s.gambleHistory["bad id!"]).toBeUndefined();
    expect(s.stewardClauses[0].threshold).toBe(0.65); // 0.9 hors crans → défaut
    expect(s.stewardClauses[0].enabled).toBe(true);
    expect(s.faveur).toBe(77);
    expect(s.trunkFaveur).toBe(12.5);
    expect(s.trunkAt).toBe(123456);
  });
});

describe("Table des augures — monnaie fermée (mise ET gain en Faveur)", () => {
  it("mise en Faveur (AUGURY_STAKES), l'or ne bouge plus, gain de la paytable", () => {
    expect(auguryStake("prayForRain", "classique").base).toBe(AUGURY_STAKES.classique);
    expect(auguryStake("prayForRain", "prudent").base).toBe(AUGURY_STAKES.prudent);
    expect(auguryStake("prayForRain", "grand").base).toBe(AUGURY_STAKES.grand);

    const goldBefore = toNum(state.gold);
    const pay = auguryPaytable("prayForRain", "classique");
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const venus = castAugury("prayForRain", "classique", { render: false });
    Math.random.mockRestore();
    expect(venus.tier).toBe("venus");
    expect(venus.stake).toBe(AUGURY_STAKES.classique);
    expect(venus.faveurGain).toBe(pay.gains.venus);
    expect(venus.faveurGain).toBeGreaterThan(venus.stake); // gagner paie toujours plus que la mise
    expect(state.faveur).toBe(1000 - AUGURY_STAKES.classique + pay.gains.venus);
    expect(venus.freeFlight).toBe(true);
    expect(state.icarusFreeFlights).toEqual(["plume"]); // le Vénus des osselets donne une Plume
    expect(new Set(venus.bones).size).toBe(4);
    expect(toNum(state.gold)).toBeCloseTo(goldBefore, 0); // plus de mise en or
  });

  it("les trois rites frôlent le MÊME RTP de référence (au win rate max), mises étagées", () => {
    for (const rite of ["prudent", "classique", "grand"]) {
      const pay = auguryPaytable("prayForRain", rite);
      expect(pay.rtpRef).toBeLessThan(AUGURY_RTP_CAP);          // jamais au-dessus du cap
      expect(pay.rtpRef).toBeGreaterThan(AUGURY_RTP_CAP - 0.03); // et tout près dessous
      // Le RTP EFFECTIF suit le win rate courant : cap × pEff/pRef environ.
      expect(pay.rtp).toBeCloseTo(pay.rtpRef * (pay.pEff / pay.pRef), 6);
    }
    // L'échelle des mises porte l'échelle des gains (Vénus grand > classique > prudent).
    const venusOf = (r) => auguryPaytable("prayForRain", r).gains.venus;
    expect(venusOf("grand")).toBeGreaterThan(venusOf("classique"));
    expect(venusOf("classique")).toBeGreaterThan(venusOf("prudent"));
  });

  it("perdre ne rend RIEN ; la cagnotte est nourrie sur l'EDGE, à chaque jet", () => {
    expect(state.icarusPotFaveur).toBe(0);
    const stake = AUGURY_STAKES.classique;
    const pay = auguryPaytable("prayForRain", "classique");
    const feed = stake * TEMPLE_POT_RECYCLE * (1 - pay.rtp);
    vi.spyOn(Math, "random").mockReturnValue(0.5); // creux
    const hollow = castAugury("prayForRain", "classique", { render: false });
    Math.random.mockRestore();
    expect(hollow.faveurGain).toBe(0); // plus de consolation en monnaie fermée
    expect(state.faveur).toBe(1000 - stake);
    expect(state.icarusPotFaveur).toBeCloseTo(feed, 6);

    // Le versement ne dépend PLUS du tier : le Chien ne nourrit plus double. C'est
    // le prix assumé de l'invariant (l'espérance devient exacte et déterministe,
    // donc rtp_total = base + recycle × (1 − base) < 1 se prouve en une ligne).
    state.gambleHistory = {}; // repartir sans rabais (mise pleine pour l'assertion)
    vi.spyOn(Math, "random").mockReturnValue(0.99); // Chien
    const dog = castAugury("prayForRain", "classique", { render: false });
    Math.random.mockRestore();
    expect(dog.faveurGain).toBe(0);
    expect(state.icarusPotFaveur).toBeCloseTo(2 * feed, 6);
  });

  it("INVARIANT : un GAIN nourrit la cagnotte autant qu'une perte (espérance exacte)", () => {
    // Contrôle négatif du point précédent : si le versement dépendait de l'issue,
    // l'invariant ne serait plus démontrable et le bench devrait le mesurer.
    const stake = AUGURY_STAKES.classique;
    const pay = auguryPaytable("prayForRain", "classique");
    const feed = stake * TEMPLE_POT_RECYCLE * (1 - pay.rtp);
    vi.spyOn(Math, "random").mockReturnValue(0.01); // Vénus (gain)
    castAugury("prayForRain", "classique", { render: false });
    Math.random.mockRestore();
    expect(state.icarusPotFaveur).toBeCloseTo(feed, 6);
  });

  it("defer : la mise part à l'envol, rien d'autre avant apply() (anti-spoiler UI)", () => {
    const pay = auguryPaytable("prayForRain", "classique");
    vi.spyOn(Math, "random").mockReturnValue(0.01); // Vénus
    const res = castAugury("prayForRain", "classique", { render: false, defer: true });
    Math.random.mockRestore();
    // La mise est payée à l'envol, mais AUCUN gain tant qu'apply() dort.
    expect(state.faveur).toBe(1000 - AUGURY_STAKES.classique);
    expect(state.icarusFreeFlights).toEqual([]);
    expect(state.gambleHistory.prayForRain).toBeUndefined();
    expect(res.faveurGain).toBe(0);
    // À la révélation : tout s'applique d'un coup, une seule fois (idempotent).
    res.apply();
    expect(res.faveurGain).toBe(pay.gains.venus);
    expect(state.faveur).toBe(1000 - AUGURY_STAKES.classique + pay.gains.venus);
    expect(state.icarusFreeFlights).toEqual(["plume"]);
    expect(state.gambleHistory.prayForRain).toEqual([1]);
    const after = state.faveur;
    res.apply(); // flush après révélation : sans effet
    expect(state.faveur).toBe(after);
    expect(state.gambleHistory.prayForRain).toEqual([1]);
  });

  it("le rabais Clémence allège la mise ET sert les gains au prorata EXACT (payRound)", () => {
    rollGamble("prayForRain", 0.5); // creux → 1 cran
    rollGamble("prayForRain", 0.5); // creux → 2 crans
    const pay = auguryPaytable("prayForRain", "classique");
    const st = auguryStake("prayForRain", "classique");
    expect(st.stake).toBeLessThan(st.base);
    const faveurBefore = state.faveur;
    vi.spyOn(Math, "random").mockReturnValue(0.01); // Vénus (et pilote payRound + le vol au prorata)
    const res = castAugury("prayForRain", "classique", { render: false });
    Math.random.mockRestore();
    expect(res.stake).toBe(st.stake);
    // payRound (E[x] = x, plus de biais de round vers le haut — c'était l'imprimante
    // A13 à dés 10) : avec le mock à 0.01, floor(x) + (0.01 < frac ? 1 : 0).
    const exact = pay.gains.venus * st.stake / st.base;
    const attendu = Math.floor(exact) + (0.01 < exact - Math.floor(exact) ? 1 : 0);
    expect(res.faveurGain).toBe(attendu);
    // Le vol de Vénus suit AUSSI la mise (probabilité stake/base ; mock 0.01 < ratio → accordé).
    expect(res.freeFlight).toBe(true);
    expect(state.faveur).toBe(faveurBefore - st.stake + res.faveurGain);
  });

  it("quitte ou double : gagné double la Faveur, perdu la reprend (historique intact)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const win = castAugury("prayForRain", "classique", { render: false });
    Math.random.mockRestore();
    const faveurAfterWin = state.faveur;
    expect(state.gambleHistory.prayForRain).toEqual([1]);

    vi.spyOn(Math, "random").mockReturnValue(0.2); // < AUGURY_DOUBLE_P → gagné
    const dbl = doubleAugury("prayForRain", win.faveurGain, { render: false });
    Math.random.mockRestore();
    expect(dbl.win).toBe(true);
    expect(state.faveur).toBe(faveurAfterWin + win.faveurGain);
    expect(state.gambleHistory.prayForRain).toEqual([1]); // le double n'est pas un jet de table
  });

  it("quitte ou double perdu : la Faveur gagnée est reprise", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const win = castAugury("prayForRain", "classique", { render: false });
    Math.random.mockRestore();
    const faveurAfterWin = state.faveur;

    vi.spyOn(Math, "random").mockReturnValue(0.9); // ≥ AUGURY_DOUBLE_P → perdu
    const dbl = doubleAugury("prayForRain", win.faveurGain, { render: false });
    Math.random.mockRestore();
    expect(dbl.win).toBe(false);
    expect(state.faveur).toBe(faveurAfterWin - win.faveurGain);
  });
});

describe("Paytable de référence — paiements FIXES, anti-imprimante (monnaie fermée)", () => {
  afterEach(() => { state.diceLevel = 0; state.templeArtifacts = {}; });

  it("les dés pipés ne changent PAS les gains ; borné < 1 jusqu'au niveau d'ancrage, la bascule au-delà", () => {
    for (const rite of ["prudent", "classique", "grand"]) {
      for (const ivory of [false, true]) {
        state.templeArtifacts = ivory ? { ivoire: true } : {};
        state.diceLevel = 0;
        const base = auguryPaytable("prayForRain", rite);
        let prevRtp = 0;
        let rtpAtRef = 0;
        for (let dice = 0; dice <= DICE_BOOST_MAX_LEVEL; dice++) {
          state.diceLevel = dice;
          const pay = auguryPaytable("prayForRain", rite);
          // LE CONTRAT (arbitrage Raph) : le win rate monte, le paiement ne bouge pas.
          expect(pay.gains).toEqual(base.gains);
          expect(pay.rtpRef).toBeLessThan(AUGURY_RTP_CAP);      // jamais imprimante au point d'ANCRAGE
          // Sous l'ancrage (dés ≤ AUGURY_REF_DICE_LEVEL), rtp ≤ rtpRef < 1. AU-DELÀ
          // (la bascule, 2026-07-17), rtp dépasse 1 LINÉAIREMENT : c'est le débit
          // volontaire de l'imprimante, borné par le banc (A14), pas par la table.
          if (dice <= AUGURY_REF_DICE_LEVEL) expect(pay.rtp).toBeLessThan(1);
          expect(pay.rtp).toBeGreaterThanOrEqual(prevRtp);      // le RTP effectif MONTE avec les dés
          prevRtp = pay.rtp;
          if (dice === AUGURY_REF_DICE_LEVEL) rtpAtRef = pay.rtp;
          for (const tier of ["venus", "triple", "pair"]) {
            expect(pay.gains[tier]).toBeGreaterThan(pay.stake); // gagner paie toujours plus que la mise
          }
        }
        // Au niveau d'ANCRAGE, le win rate rejoint la référence : RTP effectif =
        // RTP de référence, qui frôle le cap (déviation d'arrondi ≤ 3 pts).
        expect(rtpAtRef).toBeCloseTo(auguryPaytable("prayForRain", rite).rtpRef, 12);
        expect(rtpAtRef).toBeGreaterThan(AUGURY_RTP_CAP - 0.03);
        // Et au niveau MAX, la bascule est bien passée (l'imprimante existe).
        expect(prevRtp).toBeGreaterThan(1);
      }
    }
  });

  it("l'ivoire recalcule la table (artefact de refonte) sans dépasser le cap", () => {
    state.diceLevel = 0;
    const plain = auguryPaytable("prayForRain", "classique");
    state.templeArtifacts = { ivoire: true };
    const ivory = auguryPaytable("prayForRain", "classique");
    expect(ivory.gains).not.toEqual(plain.gains); // la table change (les parts bougent, la normalisation compense)
    expect(ivory.rtpRef).toBeLessThan(AUGURY_RTP_CAP);
    expect(ivory.rtp).toBeLessThan(1);
  });
});

describe("Fusion des osselets (2026-07-15) — un seul jeu, la mise pilote la variance", () => {
  it("il n'existe plus qu'UNE table d'osselets", () => {
    expect(REGULATION_ACTIONS.filter((a) => a.kind === "gamble")).toHaveLength(1);
    expect(REGULATION_ACTIONS.find((a) => a.kind === "gamble").id).toBe("prayForRain");
  });

  it("la mise déforme la variance sans toucher la frontière gagne/perd", () => {
    const p = 0.4;
    const calm = auguryTierOdds(p, 0.55); // prudent
    const base = auguryTierOdds(p, 1);    // classique (répartition historique)
    const wild = auguryTierOdds(p, 1.7);  // grand
    // Gros sacrifice = plus de Vénus (jackpot) ET plus de Chiens (revers lourd).
    expect(wild.venus).toBeGreaterThan(base.venus);
    expect(base.venus).toBeGreaterThan(calm.venus);
    expect(wild.dog).toBeGreaterThan(base.dog);
    expect(base.dog).toBeGreaterThan(calm.dog);
    // La masse gagnante (pEff) et perdante (1-pEff) restent INCHANGÉES : la mise
    // ne change pas les ODDS, seulement la forme du risque.
    for (const o of [calm, base, wild]) {
      expect(o.venus + o.triple + o.pair).toBeCloseTo(p, 10);
      expect(o.hollow + o.dog).toBeCloseTo(1 - p, 10);
    }
  });

  it("classique (spread=1) = répartition historique exacte (rétro-compatible)", () => {
    const p = 0.35;
    const o = auguryTierOdds(p, 1);
    expect(o.venus).toBeCloseTo(p * 0.15, 12);
    expect(o.triple).toBeCloseTo(p * 0.25, 12);
    expect(o.hollow).toBeCloseTo((1 - p) * 0.6, 12);
    expect(o.dog).toBeCloseTo((1 - p) * 0.4, 12);
  });

  it("la mise est BIEN threadée dans castAugury : à r=0.6, classique→creux mais Grand Sacrifice→Chien", () => {
    // pEff = 0.55 × GAMBLE_ODDS_SCALE(0.5) = 0.275, sans clémence. À r=0.6 :
    //  classique (spread 1) : Chien dès r≥0.71 → CREUX ; grand (spread 1.7,
    //  dogShare 0.68) : Chien dès r≥0.507 → CHIEN. Verrouille le passage de
    //  rite.spread par castAugury→drawTier (sinon la fusion serait neutralisable
    //  — drawTier(pEff, 1) — sans casser la CI).
    vi.spyOn(Math, "random").mockReturnValue(0.6);
    state.gambleHistory = {};
    const classique = castAugury("prayForRain", "classique", { render: false });
    state.gambleHistory = {}; // repartir sans clémence pour le 2e jet
    const grand = castAugury("prayForRain", "grand", { render: false });
    Math.random.mockRestore();
    expect(classique.tier).toBe("hollow");
    expect(grand.tier).toBe("dog");
  });

  it("Faveur insuffisante : castAugury refuse sans muter l'état", () => {
    state.faveur = AUGURY_STAKES.classique - 1;
    const res = castAugury("prayForRain", "classique", { render: false });
    expect(res).toBeNull();
    expect(state.faveur).toBe(AUGURY_STAKES.classique - 1);
    expect((state.gambleHistory || {}).prayForRain).toBeUndefined();
  });
});

describe("Intendance", () => {
  it("le slot 1 est constitué à l'Ère IV, le slot 2 attend un mythe", () => {
    expect(stewardSlotCount(regulationContext())).toBe(1);
    setStewardClause(1, { actionId: "rationing", enabled: true });
    expect((state.stewardClauses || []).length).toBeLessThanOrEqual(1); // slot 2 refusé
  });

  it("intervient au seuil, signe le registre, puis respecte son cooldown", () => {
    setStewardClause(0, { actionId: "rationing", threshold: 0.65, enabled: true });
    state.instability = 0.7;
    tickSteward();
    const entries = state.regulLedger.filter((e) => e.by);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "rationing", kind: "soothe" });
    expect(typeof entries[0].by).toBe("string");

    // Rappel immédiat : cooldown → aucune nouvelle intervention.
    state.instability = 0.9;
    tickSteward();
    expect(state.regulLedger.filter((e) => e.by)).toHaveLength(1);

    // Après le cooldown, elle repart.
    vi.setSystemTime(FIXED_NOW + STEWARD_COOLDOWN_MS + 1000);
    state.food = 1e9;
    tickSteward();
    expect(state.regulLedger.filter((e) => e.by)).toHaveLength(2);
  });

  it("reste en veille sous le seuil, fatiguée, ou sans de quoi payer", () => {
    setStewardClause(0, { actionId: "rationing", threshold: 0.65, enabled: true });

    state.instability = 0.5; // sous le seuil
    tickSteward();
    expect(state.regulLedger.filter((e) => e.by)).toHaveLength(0);

    state.instability = 0.8;
    state.regulFatigue = 0.8; // administration épuisée
    tickSteward();
    expect(state.regulLedger.filter((e) => e.by)).toHaveLength(0);

    state.regulFatigue = 0;
    state.food = 0; // Rationner coûte des vivres : impayable
    invalidateRenderCache("all");
    tickSteward();
    expect(state.regulLedger.filter((e) => e.by)).toHaveLength(0);
  });

  it("une consigne sans édit choisi ne peut pas être armée", () => {
    setStewardClause(0, { enabled: true });
    expect(state.stewardClauses[0].enabled).toBe(false);
    setStewardClause(0, { actionId: "rationing" });
    setStewardClause(0, { enabled: true });
    expect(state.stewardClauses[0].enabled).toBe(true);
    setStewardClause(0, { actionId: null });
    expect(state.stewardClauses[0].enabled).toBe(false);
  });
});
