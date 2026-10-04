"use strict";
// Chancellerie (onglet Régulation, 2026-07-13) — mécaniques des piliers :
//  - Table des osselets (Maison des Plaisirs). Lot 1 des gains « vrai casino »
//    (2026-10-04, docs/PLAN-GAINS-CASINO.md) : la mise est LIBRE, en Faveur, entre
//    les limites de la table (1 → 15 min de recettes) ; les COTES sont fixes pour
//    toujours. Chaque rite est un PARI (une chance de gagner `p` et des paiements)
//    normalisé à 97 %, vol offert de Vénus compris. Disparus : la Clémence (rabais
//    de mise sur série noire), les dés pipés, le dé d'ivoire, la bascule.
//  - Registre des édits : chaque acte dépose une entrée factuelle (cap, reset
//    par cycle) et un marqueur d'annales.
//  - Intendance : consignes « si Rupture > X % → édit », mêmes coûts/fatigue
//    que le joueur, cooldown par consigne, slots gatés par la progression.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, resetTemporaryRunState } from "../state.js";
import {
  runCrisisAction, setStewardClause, tickSteward, stewardSlotCount,
  castAugury, doubleAugury, auguryPaytable, auguryRiteOdds, auguryTierOdds, auguryTierBones,
  AUGURY_RITES, tableLimits
} from "../actions.js";
import { regulationContext } from "../mechanics.js";
import { potRecycle } from "../actions/templePot.js";
import { REGULATION_ACTIONS } from "../../data/regulationActions.js";
import { ARTIFACT_NODES } from "../../data/artifacts.js";
import { annalsWindow, resetAnnals } from "../annals.js";
import { toNum } from "../num.js";
import {
  GAMBLE_HISTORY_LEN, REGUL_LEDGER_MAX, STEWARD_COOLDOWN_MS,
  AUGURY_RTP, AUGURY_RITE_BETS,
  TEMPLE_POT_RECYCLE, ICARUS_RTP
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

// La mise de référence des tests : bien dans les limites de la table (la fixture
// est à l'ère record 5, limite haute 95).
const STAKE = 10;

// payRound(x) = floor(x), +1 si le tirage u tombe sous la partie fractionnaire
// (E[payRound(x)] = x). Sert à prévoir un gain quand on pilote Math.random.
const payRoundAt = (x, u) => Math.floor(x) + (u < x - Math.floor(x) ? 1 : 0);

// Pilote Math.random : les valeurs de `seq` dans l'ordre, puis `rest` pour tout le
// reste. Ordre des tirages d'un jet : l'issue, puis (Vénus seulement) le carré de
// six, puis les os (cosmétiques), puis l'arrondi payRound d'un gain.
function withRandom(seq, rest, fn) {
  const queue = [...seq];
  const spy = vi.spyOn(Math, "random").mockImplementation(() => (queue.length ? queue.shift() : rest));
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

// Force l'issue du prochain jet au rite ancestral, à la mise STAKE. Zones du rite
// ancestral (p = 0,475, spread 1) : r < 0,07125 → Vénus, < 0,19 → Triple,
// < 0,475 → Paire, < 0,79 → jet CREUX, au-delà → le CHIEN. Valeur constante : à
// r = 0,01 le Vénus tombe AUSSI en carré de six (0,01 < AUGURY_JACKPOT_SHARE).
function rollGamble(id, randomValue, stake = STAKE) {
  vi.spyOn(Math, "random").mockReturnValue(randomValue);
  const res = castAugury(id, "classique", { stake, render: false });
  Math.random.mockRestore();
  return res;
}

describe("Les jets de la table — historique, Rupture, plus de Clémence", () => {
  it("l'historique note 1 (gagné), 0 (creux), 2 (le Chien) et reste capé", () => {
    rollGamble("prayForRain", 0.3);  // Paire → gagné
    rollGamble("prayForRain", 0.5);  // jet creux
    rollGamble("prayForRain", 0.99); // le Chien
    expect(state.gambleHistory.prayForRain).toEqual([1, 0, 2]);
    for (let i = 0; i < GAMBLE_HISTORY_LEN + 3; i++) rollGamble("prayForRain", 0.5);
    expect(state.gambleHistory.prayForRain).toHaveLength(GAMBLE_HISTORY_LEN);
    expect(state.gambleHistory.prayForRain.every((v) => v === 0)).toBe(true);
  });

  it("une série noire ne change plus rien : la mise posée est jouée, à la même chance", () => {
    // La Clémence (rabais de mise sur revers consécutifs) a disparu avec la mise
    // libre : un rabais sur une mise que le joueur choisit n'a plus de sens.
    const ref = auguryPaytable("prayForRain", "classique");
    for (let i = 0; i < GAMBLE_HISTORY_LEN; i++) rollGamble("prayForRain", 0.99); // que des Chiens
    expect(state.gambleHistory.prayForRain).toEqual(new Array(GAMBLE_HISTORY_LEN).fill(2));
    expect(auguryPaytable("prayForRain", "classique")).toEqual(ref);
    const faveurAvant = state.faveur;
    const res = rollGamble("prayForRain", 0.5);
    expect(res.stake).toBe(STAKE); // aucun rabais
    expect(res.p).toBe(auguryRiteOdds("classique"));
    expect(state.faveur).toBe(faveurAvant - STAKE);
  });

  it("un pari NE touche PAS la Rupture (jeux découplés)", () => {
    const before = state.instability;
    expect(rollGamble("prayForRain", 0.5)).not.toBeNull(); // creux (le jet a bien eu lieu)
    expect(state.instability).toBeCloseTo(before, 10);
    expect(rollGamble("prayForRain", 0.99)).not.toBeNull(); // Chien
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

  it("reset par cycle : registre et jets effacés, consignes CONSERVÉES, Faveur et caisse SURVIVENT", () => {
    runCrisisAction("rationing", { render: false });
    expect(rollGamble("prayForRain", 0.99)).not.toBeNull();
    expect(state.gambleHistory.prayForRain).toEqual([2]);
    state.faveur = 42; // gagnée à la caisse et aux jeux : c'est une monnaie méta
    state.trunkFaveur = 12.5;
    setStewardClause(0, { actionId: "rationing", threshold: 0.65, enabled: true });
    resetTemporaryRunState(state);
    expect(state.regulLedger).toEqual([]);
    expect(state.gambleHistory).toEqual({});
    expect(state.faveur).toBe(42); // la Faveur survit à l'effondrement
    expect(state.trunkFaveur).toBe(12.5); // la caisse aussi (même statut méta)
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

describe("Table des osselets — mise libre en Faveur, cotes fixes", () => {
  it("mise en Faveur, l'or ne bouge plus ; Vénus paie mise × mult et offre un vol AU MONTANT de la mise", () => {
    const goldBefore = toNum(state.gold);
    const pay = auguryPaytable("prayForRain", "classique");
    // 0,01 : Vénus ; 0,5 : pas de carré de six (≥ AUGURY_JACKPOT_SHARE) ; 0,5 ensuite
    // pour les os et l'arrondi du gain.
    const venus = withRandom([0.01, 0.5], 0.5, () => castAugury("prayForRain", "classique", { stake: 12, render: false }));
    expect(venus.tier).toBe("venus");
    expect(venus.win).toBe(true);
    expect(venus.jackpot).toBe(false);
    expect(venus.stake).toBe(12);
    expect(venus.mult).toBeCloseTo(pay.mult.venus, 12);
    expect(venus.faveurGain).toBe(payRoundAt(12 * pay.mult.venus, 0.5));
    expect(venus.faveurGain).toBeGreaterThan(venus.stake); // gagner paie toujours plus que la mise
    expect(state.faveur).toBe(1000 - 12 + venus.faveurGain);
    // Le vol d'Icare offert se joue à la mise du jet qui l'a gagné.
    expect(venus.freeFlight).toBe(true);
    expect(state.icarusFreeFlights).toEqual([12]);
    // Vénus s'affiche en TRIPLE SIX : le 4e dé n'est jamais un six (ce serait le carré).
    expect(venus.bones.filter((v) => v === 6)).toHaveLength(3);
    expect(toNum(state.gold)).toBeCloseTo(goldBefore, 0); // plus de mise en or

    // File pleine : le vol est perdu (la table rend alors un peu moins), le gain reste servi.
    state.icarusFreeFlights = [5, 5, 5, 5, 5];
    const faveurAvant = state.faveur;
    const plein = withRandom([0.01, 0.5], 0.5, () => castAugury("prayForRain", "classique", { stake: 12, render: false }));
    expect(plein.freeFlight).toBe(false);
    expect(state.icarusFreeFlights).toEqual([5, 5, 5, 5, 5]);
    expect(state.faveur).toBe(faveurAvant - 12 + plein.faveurGain);
  });

  // LE CARRÉ DE SIX. Le point à garder verrouillé n'est pas qu'il paie, c'est
  // qu'il ne CRÉE RIEN : tout ce qu'il verse sort de la cagnotte, au centime.
  // Minter ce jackpot casserait l'invariant du temple
  // (rtp_total = rtp_base + recycle × (1 − rtp_base) < 1, cf. templePot.js).
  it("le carré de six rafle la cagnotte au prorata de la mise, sans jamais créer de Faveur", () => {
    state.icarusPotFaveur = 400;
    const faveurAvant = state.faveur;
    const potAvant = state.icarusPotFaveur;
    const pay = auguryPaytable("prayForRain", "classique");
    const { max } = tableLimits();

    const res = rollGamble("prayForRain", 0.01, 20); // Vénus, et sous le seuil du carré

    expect(res.tier).toBe("venus");        // le carré n'est PAS une 6e issue
    expect(res.jackpot).toBe(true);
    expect(res.bones).toEqual([6, 6, 6, 6]);
    // Au PRORATA de la mise, la limite haute de la table servant de référence.
    expect(res.jackpotGain).toBe(Math.round(potAvant * 20 / max));
    expect(res.jackpotGain).toBeGreaterThan(0);

    // Conservation. ⚠ Le pot bouge DEUX fois dans le même apply() : la rafle le
    // vide, puis feedPot(stake, rtp) y reverse l'edge de CE jet. Comparer
    // bêtement potAvant − potAprès à jackpotGain donne un écart qui ressemble à
    // de la Faveur créée, et n'en est pas. On modélise donc les deux mouvements.
    const feed = res.stake * potRecycle() * (1 - pay.rtp);
    expect(state.icarusPotFaveur).toBeCloseTo(potAvant - res.jackpotGain + feed, 6);
    // Côté joueur : la mise sort, le paiement de table et la rafle entrent.
    expect(state.faveur).toBe(faveurAvant - res.stake + res.faveurGain + res.jackpotGain);
    expect(res.jackpotGain).toBeLessThanOrEqual(potAvant);

    // À la LIMITE HAUTE, le carré emporte la cella entière (il n'y reste que
    // l'edge de ce jet-ci) — et jamais plus que ce qu'elle contenait.
    const potPlein = state.icarusPotFaveur;
    const tapis = rollGamble("prayForRain", 0.01, max);
    expect(tapis.jackpotGain).toBe(Math.floor(potPlein));
    expect(state.icarusPotFaveur).toBeCloseTo(potPlein - tapis.jackpotGain + max * potRecycle() * (1 - pay.rtp), 6);
    expect(state.icarusPotFaveur).toBeGreaterThanOrEqual(0);
  });

  // Les dés affichés sont de l'HABILLAGE (l'issue est tirée avant), mais un
  // habillage qui se CONTREDIT trahit la table : une « paire haute » qui sort un
  // brelan, ou un « triple » en 6-6-6 que le joueur lira Vénus alors qu'il est
  // payé moins. Rien dans le rendu ne rattraperait ça — d'où ce contrôle.
  it("les dés illustrent leur tier sans jamais le contredire", () => {
    const compte = (bones) => {
      const n = new Map();
      for (const v of bones) n.set(v, (n.get(v) || 0) + 1);
      return [...n.entries()].sort((a, b) => b[1] - a[1]); // [face, occurrences]
    };
    for (let i = 0; i < 400; i += 1) {
      for (const tier of ["venus", "triple", "pair", "hollow", "dog"]) {
        const bones = auguryTierBones(tier);
        expect(bones).toHaveLength(4);
        for (const v of bones) expect(v).toBeGreaterThanOrEqual(1);
        for (const v of bones) expect(v).toBeLessThanOrEqual(6);
        const c = compte(bones);
        if (tier === "venus") {
          expect(c[0]).toEqual([6, 3]);       // le triple six
          expect(c[1][0]).not.toBe(6);        // jamais un carré
        } else if (tier === "dog") {
          expect(bones).toEqual([1, 1, 1, 1]);
        } else if (tier === "triple") {
          expect(c[0][1]).toBe(3);            // bien un brelan
          expect(c[0][0]).not.toBe(6);        // et JAMAIS 6-6-6 : ce serait Vénus
          expect(c[0][0]).toBeGreaterThan(1); // brelan d'as = le Chien, pas ça
        } else if (tier === "pair") {
          expect(c.map(([, k]) => k)).toEqual([2, 1, 1]); // paire nette, pas brelan
          expect(c[0][0]).toBeGreaterThan(1);             // et une paire HAUTE
        } else {
          expect(c.map(([, k]) => k)).toEqual([2, 1, 1]);
          expect(c[0][0]).toBe(1);            // creux = la paire d'AS
        }
      }
    }
  });

  it("perdre ne rend RIEN ; la cagnotte est nourrie sur l'EDGE, à chaque jet, au prorata de la mise", () => {
    expect(state.icarusPotFaveur).toBe(0);
    const pay = auguryPaytable("prayForRain", "classique");
    const feed = STAKE * TEMPLE_POT_RECYCLE * (1 - pay.rtp);
    const hollow = rollGamble("prayForRain", 0.5); // creux
    expect(hollow.win).toBe(false);
    expect(hollow.faveurGain).toBe(0); // pas de consolation en monnaie fermée
    expect(state.faveur).toBe(1000 - STAKE);
    expect(state.icarusPotFaveur).toBeCloseTo(feed, 6);

    // Le versement ne dépend PAS du tier : le Chien ne nourrit pas double. C'est
    // le prix assumé de l'invariant (l'espérance devient exacte et déterministe,
    // donc rtp_total = base + recycle × (1 − base) < 1 se prouve en une ligne).
    const dog = rollGamble("prayForRain", 0.99); // Chien
    expect(dog.faveurGain).toBe(0);
    expect(state.icarusPotFaveur).toBeCloseTo(2 * feed, 6);

    // Il dépend de la MISE : quatre fois la mise, quatre fois le versement.
    rollGamble("prayForRain", 0.5, 4 * STAKE);
    expect(state.icarusPotFaveur).toBeCloseTo(6 * feed, 6);
  });

  it("INVARIANT : un GAIN nourrit la cagnotte autant qu'une perte (espérance exacte)", () => {
    // Contrôle négatif du point précédent : si le versement dépendait de l'issue,
    // l'invariant ne serait plus démontrable et le banc devrait le mesurer.
    const pay = auguryPaytable("prayForRain", "classique");
    const feed = STAKE * TEMPLE_POT_RECYCLE * (1 - pay.rtp);
    const res = withRandom([0.01, 0.5], 0.5, () => castAugury("prayForRain", "classique", { stake: STAKE, render: false }));
    expect(res.tier).toBe("venus"); // un gain, sans carré
    expect(state.icarusPotFaveur).toBeCloseTo(feed, 6);
  });

  it("defer : la mise part à l'envol, rien d'autre avant apply() (anti-spoiler UI)", () => {
    const pay = auguryPaytable("prayForRain", "classique");
    const res = withRandom([0.01, 0.5], 0.5, () => {
      const r = castAugury("prayForRain", "classique", { stake: STAKE, render: false, defer: true });
      // La mise est payée à l'envol, mais AUCUN gain tant qu'apply() dort.
      expect(state.faveur).toBe(1000 - STAKE);
      expect(state.icarusFreeFlights).toEqual([]);
      expect(state.gambleHistory.prayForRain).toBeUndefined();
      expect(state.icarusPotFaveur).toBe(0);
      expect(r.faveurGain).toBe(0);
      // À la révélation : tout s'applique d'un coup (l'arrondi du gain tire ici).
      r.apply();
      return r;
    });
    const gain = payRoundAt(STAKE * pay.mult.venus, 0.5);
    expect(res.faveurGain).toBe(gain);
    expect(state.faveur).toBe(1000 - STAKE + gain);
    expect(state.icarusFreeFlights).toEqual([STAKE]);
    expect(state.gambleHistory.prayForRain).toEqual([1]);
    const after = state.faveur;
    res.apply(); // flush après révélation : sans effet (une seule fois, idempotent)
    expect(state.faveur).toBe(after);
    expect(state.gambleHistory.prayForRain).toEqual([1]);
    expect(state.icarusFreeFlights).toEqual([STAKE]); // pas de second vol
  });

  it("le gain est servi au prorata EXACT de la mise (payRound, sans biais d'arrondi)", () => {
    // payRound (E[x] = x, plus de biais de round vers le haut — c'était l'imprimante
    // A13) : floor(mise × mult), +1 si le tirage tombe sous la partie fractionnaire.
    const pay = auguryPaytable("prayForRain", "classique");
    for (const stake of [1, 7, 30]) {
      for (const u of [0.01, 0.99]) {
        state.faveur = 1000;
        // 0,3 : une Paire (zone [0,19 ; 0,475[ du rite ancestral), puis u pour les os et l'arrondi.
        const res = withRandom([0.3], u, () => castAugury("prayForRain", "classique", { stake, render: false }));
        expect(res.tier).toBe("pair");
        expect(res.stake).toBe(stake);
        expect(res.faveurGain).toBe(payRoundAt(stake * pay.mult.pair, u));
        expect(state.faveur).toBe(1000 - stake + res.faveurGain);
      }
    }
  });

  it("quitte ou double : gagné double la Faveur, perdu la reprend (historique intact)", () => {
    const win = rollGamble("prayForRain", 0.01);
    expect(win.win).toBe(true);
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
    const win = rollGamble("prayForRain", 0.01);
    const faveurAfterWin = state.faveur;

    vi.spyOn(Math, "random").mockReturnValue(0.9); // ≥ AUGURY_DOUBLE_P → perdu
    const dbl = doubleAugury("prayForRain", win.faveurGain, { render: false });
    Math.random.mockRestore();
    expect(dbl.win).toBe(false);
    expect(state.faveur).toBe(faveurAfterWin - win.faveurGain);
  });
});

describe("La mise libre — limites de la table", () => {
  it("sous la limite basse (1), le jet est REFUSÉ sans muter l'état", () => {
    expect(tableLimits().min).toBe(1);
    for (const stake of [0, 0.5, -3, NaN, null, undefined, "beaucoup"]) {
      expect(castAugury("prayForRain", "classique", { stake, render: false })).toBeNull();
    }
    expect(castAugury("prayForRain", "classique", { render: false })).toBeNull(); // pas de mise du tout
    expect(state.faveur).toBe(1000);
    expect((state.gambleHistory || {}).prayForRain).toBeUndefined();
    expect(state.icarusPotFaveur).toBe(0);
    // Une mise fractionnaire est ramenée à l'entier (la Faveur reste entière).
    const res = rollGamble("prayForRain", 0.5, 7.9);
    expect(res.stake).toBe(7);
    expect(state.faveur).toBe(1000 - 7);
  });

  it("au-dessus de la limite haute, la mise est PLAFONNÉE — le vol de Vénus aussi", () => {
    state.bestEraIndex = 2; // Ère II (la Maison ouvre) : 15 min de recettes = 30 Faveur
    expect(tableLimits()).toEqual({ min: 1, max: 30, base: 30 });
    const pay = auguryPaytable("prayForRain", "classique");
    const res = withRandom([0.01, 0.5], 0.5, () => castAugury("prayForRain", "classique", { stake: 500, render: false }));
    expect(res.stake).toBe(30);
    expect(res.faveurGain).toBe(payRoundAt(30 * pay.mult.venus, 0.5));
    expect(state.faveur).toBe(1000 - 30 + res.faveurGain);
    expect(state.icarusFreeFlights).toEqual([30]);

    // La garde de solde lit la mise PLAFONNÉE : « tapis » avec juste la limite en poche.
    state.faveur = 30;
    const tapis = rollGamble("prayForRain", 0.5, 10_000);
    expect(tapis).not.toBeNull();
    expect(tapis.stake).toBe(30);
    expect(state.faveur).toBe(0);
  });

  it("Faveur insuffisante : castAugury refuse sans muter l'état", () => {
    state.faveur = STAKE - 1;
    const res = castAugury("prayForRain", "classique", { stake: STAKE, render: false });
    expect(res).toBeNull();
    expect(state.faveur).toBe(STAKE - 1);
    expect((state.gambleHistory || {}).prayForRain).toBeUndefined();
  });
});

describe("Les rites sont des paris — cotes fixes, 97 % chacun", () => {
  it("chaque rite rend EXACTEMENT 97 % (vol offert de Vénus compris), aucun ne dépasse 100 %", () => {
    for (const rite of Object.keys(AUGURY_RITES)) {
      const pay = auguryPaytable("prayForRain", rite);
      const o = pay.odds;
      // Recalculé ici, issue par issue : Faveur versée + valeur du vol offert.
      const total = o.venus * pay.mult.venus + o.triple * pay.mult.triple + o.pair * pay.mult.pair
        + o.venus * ICARUS_RTP;
      expect(total, rite).toBeCloseTo(AUGURY_RTP, 12);
      expect(pay.rtp, rite).toBeCloseTo(AUGURY_RTP, 12);
      expect(pay.rtp, rite).toBeLessThan(1); // plus de bascule : aucune imprimante
      // La frontière gagne/perd est la chance du rite.
      expect(pay.p, rite).toBe(AUGURY_RITE_BETS[rite].p);
      expect(o.venus + o.triple + o.pair, rite).toBeCloseTo(pay.p, 12);
      expect(o.venus + o.triple + o.pair + o.hollow + o.dog, rite).toBeCloseTo(1, 12);
      // Gagner paie toujours plus que la mise, Vénus > Triple > Paire.
      expect(pay.mult.pair, rite).toBeGreaterThan(1);
      expect(pay.mult.triple, rite).toBeGreaterThan(pay.mult.pair);
      expect(pay.mult.venus, rite).toBeGreaterThan(pay.mult.triple);
    }
  });

  it("la table du plan : chances, paiements et écart-type de chaque rite", () => {
    // docs/PLAN-GAINS-CASINO.md — le rite ne fixe plus le prix, il fixe le RISQUE.
    const PLAN = {
      prudent: { p: 0.62, venus: 2.11, triple: 1.58, pair: 1.37, sd: 0.74 },
      classique: { p: 0.475, venus: 3.08, triple: 2.05, pair: 1.54, sd: 1.02 },
      grand: { p: 0.32, venus: 4.62, triple: 2.77, pair: 1.85, sd: 1.45 },
      interdit: { p: 0.18, venus: 9.37, triple: 3.12, pair: 1.95, sd: 2.41 }
    };
    // Écart-type du paiement, en mises (Faveur seule, vol non compté).
    const sdOf = (pay) => {
      const o = pay.odds;
      const m = pay.mult;
      const mean = o.venus * m.venus + o.triple * m.triple + o.pair * m.pair;
      const m2 = o.venus * m.venus ** 2 + o.triple * m.triple ** 2 + o.pair * m.pair ** 2;
      return Math.sqrt(m2 - mean * mean);
    };
    let prev = null;
    for (const [rite, attendu] of Object.entries(PLAN)) {
      const pay = auguryPaytable("prayForRain", rite);
      expect(pay.p, rite).toBe(attendu.p);
      expect(pay.mult.venus, rite).toBeCloseTo(attendu.venus, 2);
      expect(pay.mult.triple, rite).toBeCloseTo(attendu.triple, 2);
      expect(pay.mult.pair, rite).toBeCloseTo(attendu.pair, 2);
      expect(sdOf(pay), rite).toBeCloseTo(attendu.sd, 2);
      if (prev) {
        // Du prudent à l'interdit : moins de chances, plus gros Vénus, plus de risque.
        expect(pay.p, rite).toBeLessThan(prev.p);
        expect(pay.mult.venus, rite).toBeGreaterThan(prev.mult.venus);
        expect(sdOf(pay), rite).toBeGreaterThan(sdOf(prev));
      }
      prev = pay;
    }
  });

  it("les cotes sont FIXES : aucun artefact ne touche la table", () => {
    const avant = Object.fromEntries(Object.keys(AUGURY_RITES).map((r) => [r, auguryPaytable("prayForRain", r)]));
    // Tous les artefacts de l'arbre à la fois (noyé, échelle, rite interdit, reliques…).
    state.templeArtifacts = Object.fromEntries(
      Object.values(ARTIFACT_NODES).filter((n) => n.kind === "artifact").map((n) => [n.id, true])
    );
    for (const r of Object.keys(AUGURY_RITES)) {
      expect(auguryPaytable("prayForRain", r), r).toEqual(avant[r]);
    }
  });
});

describe("Fusion des osselets (2026-07-15) — un seul jeu, le rite pilote le risque", () => {
  it("il n'existe plus qu'UNE table d'osselets", () => {
    expect(REGULATION_ACTIONS.filter((a) => a.kind === "gamble")).toHaveLength(1);
    expect(REGULATION_ACTIONS.find((a) => a.kind === "gamble").id).toBe("prayForRain");
  });

  it("le spread déforme la variance sans toucher la frontière gagne/perd", () => {
    const p = 0.4;
    const calm = auguryTierOdds(p, 0.55); // prudent
    const base = auguryTierOdds(p, 1);    // ancestral (répartition historique)
    const wild = auguryTierOdds(p, 1.7);  // grand
    // Gros sacrifice = plus de Vénus (jackpot) ET plus de Chiens (revers lourd).
    expect(wild.venus).toBeGreaterThan(base.venus);
    expect(base.venus).toBeGreaterThan(calm.venus);
    expect(wild.dog).toBeGreaterThan(base.dog);
    expect(base.dog).toBeGreaterThan(calm.dog);
    // La masse gagnante (p) et perdante (1 − p) restent INCHANGÉES : le spread ne
    // change pas les CHANCES, seulement la forme du risque.
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

  it("le rite est BIEN threadé dans castAugury : à r=0.6, ancestral→creux mais Grand sacrifice→Chien", () => {
    // Ancestral (p 0,475, spread 1) : Chien dès r ≥ 0,79 → CREUX. Grand sacrifice
    // (p 0,32, spread 1,7, part du Chien 0,68) : Chien dès r ≥ 0,5376 → CHIEN.
    // Verrouille le passage de p ET de spread par castAugury→drawTier : avec le
    // spread perdu (drawTier(p, 1)), le grand tomberait en creux jusqu'à 0,728 ;
    // avec la chance de l'ancestral, jusqu'à 0,643 — la CI le verrait.
    vi.spyOn(Math, "random").mockReturnValue(0.6);
    const classique = castAugury("prayForRain", "classique", { stake: STAKE, render: false });
    const grand = castAugury("prayForRain", "grand", { stake: STAKE, render: false });
    Math.random.mockRestore();
    expect(classique.tier).toBe("hollow");
    expect(grand.tier).toBe("dog");
    expect(grand.p).toBe(AUGURY_RITE_BETS.grand.p);
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
