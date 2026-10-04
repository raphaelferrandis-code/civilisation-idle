"use strict";
// L'ARBRE D'ARTEFACTS de la Maison (Phase 4) — cinq lignées en ÉCHELLE (osselets,
// Icare, tickets, vingt-et-un, trésor) : des refontes de RISQUE (profils, pas des
// sticks de stats) qui SURVIVENT au Grand Reset. Lot 1 des gains « vrai casino »
// (2026-10-04, docs/PLAN-GAINS-CASINO.md) : plus AUCUN rang n'achète des chances —
// dés pipés, dé d'ivoire, ailes cirées, planches du graveur, Coffres, le double et
// la refente ont quitté l'arbre (remboursés : cf. maisonTable.test.js). On couvre :
//   • persistance : defaultState {} · hydrate assaini · GR éternel · effondrement ;
//   • achat : buyTempleArtifact (débit + flag, refus double/insuffisant/mauvais id) ;
//   • cotes FIXES : aucun artefact ne touche aux chances ni à l'avantage de la maison ;
//   • effets : osselet du noyé (recycle clampé), plumes (consolation prélevée sur
//     la cella), ailes solaires (plafond du multiplicateur relevé) ;
//   • échelle : buyArtifactNode (rang N verrouillé tant que N-1 non acquis) +
//     artifactTree (descripteur UI), sans plus aucun nœud de chance.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  state, setState, hydrateState, invalidateRenderCache,
  resetTemporaryRunState, buildGrandResetState, CURRENT_SAVE_VERSION
} from "../state.js";
import {
  auguryTierOdds, auguryRiteOdds, auguryPaytable, AUGURY_RITES, castAugury,
  resolveIcarusHeadless, icarusEffectiveEdge, icarusEffectiveCap, icarusMultiplierAt,
  scratchRtpRef,
  hasTempleArtifact, buyTempleArtifact, buyArtifactNode, artifactTree, unlockTempleAuto
} from "../actions.js";
import {
  ICARUS_CAP, ICARUS_CAP_SOLAR, ICARUS_EDGE, PLUMES_CONSOLATION_MULT,
  NOYE_POT_MULT, TEMPLE_POT_RECYCLE, TEMPLE_POT_RECYCLE_CAP, AUGURY_RTP,
  ARTIFACT_NOYE_COST, ARTIFACT_PLUMES_COST, ARTIFACT_SOUFFLE_COST,
  STYLET_COST_BASE, STYLET_MAX_LEVEL, TEMPLE_ARTIFACT_IDS
} from "../balance.js";
import { potRecycle } from "../actions/templePot.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const MISE = 10;
// Les achats de CHANCES retirés au lot 1 (niveaux et artefacts confondus).
const GONE = ["dice", "ivoire", "wing", "graveur", "coffre", "double", "refente"];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE)); // bestEraIndex 5 → les cinq lignées ouvertes (Ères II et III)
  state.faveur = 100000;    // de quoi acheter tous les rangs ET miser aux jeux (monnaie fermée)
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Persistance ──────────────────────────────────────────────────────────────
describe("Artefacts — persistance", () => {
  it("defaultState : carte vide", () => {
    expect(hydrateState({}).templeArtifacts).toEqual({});
  });

  it("hydrate : n'accepte que les ids connus, valeurs re-typées en booléen", () => {
    // Save au format COURANT : l'ivoire n'y est plus qu'un id inconnu, il tombe comme
    // un id inventé, sans rien rendre (le remboursement est l'affaire de la seule
    // migration 4 → 5).
    const s = hydrateState({
      saveVersion: CURRENT_SAVE_VERSION,
      templeArtifacts: { ivoire: true, noye: "yes", plumes: 0, bogus: true }
    });
    expect(s.templeArtifacts).toEqual({ noye: true }); // plumes:0 faux → tombé, ivoire/bogus inconnus → tombés
    expect(s.maisonRefund).toBe(0);
    // 15 artefacts sur 5 lignées (lot 1, 2026-10-04) — la liste est le filtre
    // d'hydratation.
    expect(TEMPLE_ARTIFACT_IDS).toEqual([
      "noye", "echelle", "interdit",
      "plumes", "souffle", "solaires", "serres", "colombier",
      "coin", "relance",
      "voix", "mesure",
      "char", "corne", "oeil"
    ]);
  });

  it("SURVIVENT au Grand Reset (augment éternel), la Faveur se re-gagne", () => {
    state.templeArtifacts = { noye: true, solaires: true };
    state.faveur = 500;
    const fresh = buildGrandResetState(2);
    expect(fresh.templeArtifacts).toEqual({ noye: true, solaires: true }); // GR_PERSISTENT_FIELDS
    expect(fresh.faveur).toBe(0); // le carburant se re-gagne à chaque cycle
  });

  it("SURVIVENT à l'effondrement (non éphémères)", () => {
    state.templeArtifacts = { noye: true };
    resetTemporaryRunState(state);
    expect(state.templeArtifacts).toEqual({ noye: true });
  });
});

// ── Achat direct (buyTempleArtifact) ─────────────────────────────────────────
describe("Artefacts — achat", () => {
  it("débite la Faveur et pose le flag", () => {
    const f0 = state.faveur;
    expect(hasTempleArtifact("noye")).toBe(false);
    expect(buyTempleArtifact("noye")).toBe(true);
    expect(hasTempleArtifact("noye")).toBe(true);
    expect(state.faveur).toBe(f0 - ARTIFACT_NOYE_COST);
  });

  it("refuse un second achat du même artefact", () => {
    buyTempleArtifact("noye");
    const f1 = state.faveur;
    expect(buyTempleArtifact("noye")).toBe(false);
    expect(state.faveur).toBe(f1); // pas de double débit
  });

  it("refuse sans assez de Faveur", () => {
    state.faveur = ARTIFACT_PLUMES_COST - 1;
    expect(buyTempleArtifact("plumes")).toBe(false);
    expect(hasTempleArtifact("plumes")).toBe(false);
    expect(state.faveur).toBe(ARTIFACT_PLUMES_COST - 1);
  });

  it("refuse un id qui n'est pas un artefact (niveau / automation / inconnu / retiré au lot 1)", () => {
    const f0 = state.faveur;
    expect(buyTempleArtifact("stylet")).toBe(false);       // kind 'level'
    expect(buyTempleArtifact("autoOsselets")).toBe(false); // kind 'automation'
    expect(buyTempleArtifact("bogus")).toBe(false);
    for (const id of GONE) expect(buyTempleArtifact(id)).toBe(false);
    expect(state.faveur).toBe(f0);
    expect(state.templeArtifacts).toEqual({});
  });
});

// ── Les cotes ne s'achètent plus ─────────────────────────────────────────────
describe("Artefacts — cotes fixes (lot 1)", () => {
  it("TOUS les artefacts possédés : chances, paytables, edge d'Icare et tickets inchangés", () => {
    // « Plus aucun achat ne touche aux chances ni à l'avantage de la maison. » Les
    // artefacts restants changent un PROFIL (cagnotte, filet, plafond, rite de plus),
    // jamais une cote : on les prend tous, rien ne bouge.
    const rites = Object.keys(AUGURY_RITES);
    const snapshot = () => ({
      odds: rites.map((r) => auguryTierOdds(auguryRiteOdds(r), AUGURY_RITES[r].spread)),
      pays: rites.map((r) => auguryPaytable("prayForRain", r)),
      edge: icarusEffectiveEdge(),
      scratch: scratchRtpRef()
    });
    const before = snapshot();
    state.templeArtifacts = Object.fromEntries(TEMPLE_ARTIFACT_IDS.map((id) => [id, true]));
    expect(snapshot()).toEqual(before);
    for (const pay of before.pays) expect(pay.rtp).toBeCloseTo(AUGURY_RTP, 12); // 97 % à chaque rite
    expect(before.edge).toBe(ICARUS_EDGE); // 3 %, ailes ou pas
  });
});

// ── Osselet du noyé : booste le RECYCLE de l'edge (clampé) ────────────────────
describe("Artefact — osselet du noyé (cagnotte engraissée)", () => {
  it("multiplie le RECYCLE, et le clamp garde l'invariant sous 1", () => {
    // ⚠ SÉMANTIQUE CHANGÉE le 2026-07-17 : il multipliait la part de la MISE versée
    // (ce qui faisait imprimer la table à 133,4 %) ; il multiplie désormais la part
    // de l'EDGE reversée, et TEMPLE_POT_RECYCLE_CAP la borne sous 1.
    vi.spyOn(Math, "random").mockReturnValue(0.99); // r=0.99 → Le Chien (perte lourde)

    state.icarusPotFaveur = 0;
    castAugury("prayForRain", "classique", { stake: MISE });
    const potPlain = state.icarusPotFaveur;
    // Versement = mise × recycle × (1 − rtp) : 10 × 0,6 × 0,03 = 0,18.
    expect(potPlain).toBeCloseTo(MISE * TEMPLE_POT_RECYCLE * (1 - AUGURY_RTP), 9);

    state.templeArtifacts = { noye: true };
    state.icarusPotFaveur = 0;
    castAugury("prayForRain", "classique", { stake: MISE });
    // Le ratio suit le recycle clampé (0.85 / 0.6), PAS NOYE_POT_MULT (×2) : c'est
    // le clamp qui mord, et c'est lui qui rend l'imprimante impossible.
    expect(state.icarusPotFaveur).toBeCloseTo(potPlain * (TEMPLE_POT_RECYCLE_CAP / TEMPLE_POT_RECYCLE), 9);
    expect(potRecycle()).toBe(TEMPLE_POT_RECYCLE_CAP);
    expect(potRecycle()).toBeLessThan(1); // A10 : le seul point de défaillance
  });

  it("contrôle négatif : même à ×2, le recycle ne peut pas atteindre 1", () => {
    // TEMPLE_POT_RECYCLE × NOYE_POT_MULT = 1.2 > 1 : sans le clamp, la table
    // imprimerait. C'est LA ligne qui protège tout le temple.
    expect(TEMPLE_POT_RECYCLE * NOYE_POT_MULT).toBeGreaterThan(1);
    state.templeArtifacts = { noye: true };
    expect(potRecycle()).toBeLessThan(1);
  });
});

// ── Plumes de secours : filet PRÉLEVÉ SUR LA CELLA ───────────────────────────
describe("Artefact — plumes de secours (filet au crash)", () => {
  it("prélève la consolation SUR la cagnotte, et 0 sans l'artefact", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9); // C = 0,97/0,9 ≈ 1,08 → la cible ×2 brûle

    const f0 = state.faveur;
    const plain = resolveIcarusHeadless(MISE, 2);
    expect(plain.type).toBe("crash");
    expect(plain.refundFaveur).toBe(0);
    expect(state.faveur).toBe(f0 - MISE); // la mise brûle, aucun retour sans plumes

    state.templeArtifacts = { plumes: true };
    state.icarusPotFaveur = 500; // une cella garnie finance le filet
    const f1 = state.faveur;
    const potBefore = state.icarusPotFaveur;
    const withNet = resolveIcarusHeadless(MISE, 2);
    expect(withNet.type).toBe("crash");
    const expected = Math.round(MISE * PLUMES_CONSOLATION_MULT);
    expect(withNet.refundFaveur).toBe(expected);
    expect(state.faveur).toBe(f1 - MISE + expected);
    // ⚠ 2026-07-17 : la consolation SORT de la cella, elle n'est plus créée. Avant,
    // elle mintait round(mise × 0.5) à CHAQUE crash hors de tout paiement, et
    // P(crash) → 1 quand la cible monte : c'était le poste le plus lourd de toute
    // l'imprimante (+51 pts de RTP à ×50, devant la cagnotte elle-même). Puis le vol
    // verse sa part d'edge (3 %, fixe).
    expect(state.icarusPotFaveur).toBeCloseTo(potBefore - expected + MISE * potRecycle() * icarusEffectiveEdge(), 9);
  });

  it("une cella VIDE ne rend rien : le filet est financé par les revers passés", () => {
    // Contrepartie assumée du changement de contrat (l'artefact est vendu 380
    // Faveur) — son texte le dit désormais explicitement.
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    state.templeArtifacts = { plumes: true };
    state.icarusPotFaveur = 0;
    const f0 = state.faveur;
    const out = resolveIcarusHeadless(MISE, 2);
    expect(out.type).toBe("crash");
    expect(out.refundFaveur).toBe(0);
    expect(state.faveur).toBe(f0 - MISE);
  });
});

// ── Ailes solaires : plafond du multiplicateur relevé ─────────────────────────
describe("Artefact — ailes solaires (plafond ×2)", () => {
  it("relève le plafond effectif partout (courbe comprise)", () => {
    expect(icarusEffectiveCap()).toBe(ICARUS_CAP);
    expect(icarusMultiplierAt(1e9)).toBeCloseTo(ICARUS_CAP, 6); // sature au plafond de base

    state.templeArtifacts = { solaires: true };
    expect(icarusEffectiveCap()).toBe(ICARUS_CAP_SOLAR);
    expect(icarusMultiplierAt(1e9)).toBeCloseTo(ICARUS_CAP_SOLAR, 6); // sature au plafond relevé
  });
});

// ── L'échelle : buyArtifactNode + artifactTree ───────────────────────────────
describe("Arbre — échelle (rang N exige N-1)", () => {
  it("ne propose plus aucun nœud de chance : premiers rangs noyé / colombier / stylet / voix / char", () => {
    const tree = artifactTree();
    expect(tree.map((l) => l.id)).toEqual(["osselets", "icarus", "gratteux", "vingtetun", "tresor"]);
    expect(tree.map((l) => l.nodes[0].id)).toEqual(["noye", "colombier", "stylet", "voix", "char"]);
    expect(tree.map((l) => l.nodes.map((n) => n.id))).toEqual([
      ["noye", "echelle", "interdit", "autoOsselets"],
      ["colombier", "plumes", "souffle", "solaires", "serres", "autoIcare"],
      ["stylet", "coin", "relance", "autoGratteux"],
      ["voix", "mesure", "autoVingtEtUn"],
      ["char", "corne", "oeil"]
    ]);
    // Le seul rang à NIVEAUX qui reste est le stylet : un augment de geste, zéro math.
    const nodes = tree.flatMap((l) => l.nodes);
    expect(nodes.filter((n) => n.kind === "level").map((n) => n.id)).toEqual(["stylet"]);
    // Chaque artefact de l'arbre passe le filtre d'hydratation (sinon un achat
    // s'évaporerait au rechargement), et le filtre ne garde rien d'autre.
    expect(nodes.filter((n) => n.kind === "artifact").map((n) => n.id).sort())
      .toEqual([...TEMPLE_ARTIFACT_IDS].sort());
    // Les achats de chances n'ont plus ni nœud, ni achat possible par l'arbre.
    const f0 = state.faveur;
    for (const id of GONE) {
      expect(nodes.map((n) => n.id)).not.toContain(id);
      expect(buyArtifactNode(id)).toBe(false);
    }
    expect(state.faveur).toBe(f0);
  });

  it("les cadeaux de rang ne s'achètent pas, et l'échelle d'achat les saute", () => {
    // Lot 2 : l'échelle de Vénus, le rite interdit et les automatisations des jeux sont
    // offerts par le rang de la Maison (MAISON_RANKS), plus vendus.
    const f0 = state.faveur;
    for (const id of ["echelle", "interdit", "autoOsselets", "colombier", "solaires", "serres", "autoIcare", "coin", "autoGratteux", "mesure", "autoVingtEtUn"]) {
      expect(buyArtifactNode(id)).toBe(false);
    }
    expect(buyTempleArtifact("colombier")).toBe(false); // la boutique non plus
    expect(hasTempleArtifact("echelle")).toBe(false);
    expect(state.faveur).toBe(f0);

    // Icare : le colombier offert, le premier ACHAT est les plumes, puis le souffle.
    expect(buyArtifactNode("souffle")).toBe(false);
    expect(buyArtifactNode("plumes")).toBe(true);
    expect(buyArtifactNode("souffle")).toBe(true);
    // Tickets : la relance suit le stylet (le coin, entre les deux, est un cadeau).
    expect(buyArtifactNode("relance")).toBe(false);
    expect(buyArtifactNode("stylet")).toBe(true);
    expect(buyArtifactNode("relance")).toBe(true);
  });

  it("route chaque kind : niveau → boutique, artefact → flag ; plus d'automatisation à vendre", () => {
    expect(buyArtifactNode("noye")).toBe(true);
    expect(hasTempleArtifact("noye")).toBe(true);
    const f0 = state.faveur;
    expect(buyArtifactNode("stylet")).toBe(true);
    expect(state.styletLevel).toBe(1);
    expect(state.faveur).toBe(f0 - STYLET_COST_BASE);
    // Les automatisations des jeux sont des cadeaux de rang : ni l'arbre ni le
    // déblocage direct ne les vendent.
    expect(buyArtifactNode("autoOsselets")).toBe(false);
    expect(unlockTempleAuto("osselets")).toBe(false);
    expect(state.templeAuto.osselets.unlocked).toBe(false);
  });

  it("descripteur artifactTree : achats, cadeaux de rang, coûts et raisons", () => {
    const tree = artifactTree();
    const oss = tree[0];
    expect(oss.eraOk).toBe(true); // Ère II ouverte (fixture)
    const [noye, echelle, interdit, auto] = oss.nodes;
    expect(noye).toMatchObject({ kind: "artifact", unlocked: true, cost: ARTIFACT_NOYE_COST, buyable: true });
    expect(noye.gift).toBeUndefined();
    // Les cadeaux : ni prix ni achat, le titre qui les offre.
    expect(echelle).toMatchObject({ gift: 2, cost: null, buyable: false, unlocked: false, lockedReason: "gift" });
    expect(echelle.giftLabel.fr).toBe("Notable");
    expect(interdit).toMatchObject({ gift: 3, lockedReason: "gift" });
    expect(auto).toMatchObject({ kind: "automation", gift: 1, lockedReason: "gift" });
    expect(auto.giftLabel.fr).toBe("Familier");

    // Le rang à niveaux : niveau courant, plafond, coût du prochain niveau.
    expect(tree[2].nodes[0]).toMatchObject({
      id: "stylet", kind: "level", level: 0, maxLevel: STYLET_MAX_LEVEL, cost: STYLET_COST_BASE, unlocked: true
    });

    // Un cadeau reçu passe « acquis ».
    state.templeArtifacts = { ...state.templeArtifacts, echelle: true };
    const e2 = artifactTree()[0].nodes[1];
    expect(e2).toMatchObject({ owned: true, lockedReason: "owned" });
  });

  it("post-GR : une ère non ré-atteinte re-verrouille TOUTE la voie, malgré les rangs persistés", () => {
    // Après un Grand Reset, artefacts + niveaux persistent (éternels) mais l'ère
    // retombe. On simule des lignées « déjà gravies » avec bestEra sous l'ère requise.
    setState(hydrateState({ ...MID_GAME_FIXTURE, bestEraIndex: 0, cyclePeaks: { eraIndex: 0 } }));
    state.faveur = 100000;
    state.styletLevel = 1;                        // persisté
    state.templeArtifacts = { noye: true };       // persisté
    invalidateRenderCache("all");

    for (const lin of artifactTree()) {
      expect(lin.eraOk).toBe(false);
      // Aucun rang n'est déverrouillé tant que l'ère n'est pas re-atteinte…
      expect(lin.nodes.every((n) => !n.unlocked)).toBe(true);
    }
    // …et l'achat refuse à la source (descripteur ET moteur alignés).
    expect(buyArtifactNode("echelle")).toBe(false);      // artefact, même si le noyé persiste
    expect(buyArtifactNode("stylet")).toBe(false);       // niveau : le rang 1 a aussi sa garde d'ère
    expect(buyArtifactNode("autoOsselets")).toBe(false); // capstone
    expect(hasTempleArtifact("echelle")).toBe(false);
    expect(state.styletLevel).toBe(1);
    expect(state.faveur).toBe(100000);
  });

  it("verrou de Faveur : achetable seulement si on peut payer", () => {
    buyArtifactNode("plumes"); // ouvre le second souffle
    state.faveur = ARTIFACT_SOUFFLE_COST - 1;
    const souffle = artifactTree()[1].nodes.find((n) => n.id === "souffle");
    expect(souffle.unlocked).toBe(true);
    expect(souffle.canAfford).toBe(false);
    expect(souffle.buyable).toBe(false);
    expect(souffle.lockedReason).toBe("faveur");
    expect(buyArtifactNode("souffle")).toBe(false); // le débit refuse aussi
    expect(state.faveur).toBe(ARTIFACT_SOUFFLE_COST - 1);
  });
});
