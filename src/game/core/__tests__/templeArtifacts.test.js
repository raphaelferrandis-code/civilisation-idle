"use strict";
// L'ARBRE D'ARTEFACTS du Temple (Phase 4) — DEUX lignées en ÉCHELLE (osselets /
// Icare) : des refontes de RISQUE (profils, pas des sticks de stats) qui
// SURVIVENT au Grand Reset. On couvre ici :
//   • persistance : defaultState {} · hydrate assaini · GR éternel · effondrement ;
//   • achat : buyTempleArtifact (débit + flag, refus double/insuffisant/mauvais id) ;
//   • effets DÉCOUPLÉS : dé d'ivoire (variance à taux de victoire ÉGAL),
//     osselet du noyé (cagnotte ×2), plumes (consolation au crash), ailes
//     solaires (plafond du multiplicateur relevé) ;
//   • échelle : buyArtifactNode (rang N verrouillé tant que N-1 non acquis) +
//     artifactTree (descripteur UI).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  state, setState, hydrateState, invalidateRenderCache,
  resetTemporaryRunState, buildGrandResetState
} from "../state.js";
import {
  auguryTierOdds, castAugury,
  resolveIcarusHeadless, icarusEffectiveCap, icarusMultiplierAt,
  hasTempleArtifact, buyTempleArtifact, buyArtifactNode, artifactTree
} from "../actions.js";
import {
  ICARUS_CAP, ICARUS_CAP_SOLAR, ICARUS_STAKES, PLUMES_CONSOLATION_MULT,
  NOYE_POT_MULT, IVORY_DOG_CUT, IVORY_VENUS_BONUS,
  TEMPLE_POT_RECYCLE, TEMPLE_POT_RECYCLE_CAP,
  ARTIFACT_IVOIRE_COST, ARTIFACT_NOYE_COST,
  AUGURY_TIER_SHARES, AUGURY_HOLLOW_SHARE, TEMPLE_ARTIFACT_IDS
} from "../balance.js";
import { potRecycle } from "../actions/templePot.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE)); // bestEraIndex 5 → osselets (Ère II) + Icare (Ère III) débloqués
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
    const s = hydrateState({ templeArtifacts: { ivoire: true, noye: "yes", plumes: 0, bogus: true } });
    expect(s.templeArtifacts).toEqual({ ivoire: true, noye: true }); // plumes:0 faux → tombé, bogus inconnu → tombé
    // 18 artefacts sur 5 lignées (2026-07-17, trésor compris) — la liste est le
    // filtre d'hydratation.
    expect(TEMPLE_ARTIFACT_IDS).toEqual([
      "ivoire", "noye", "echelle", "interdit",
      "plumes", "souffle", "solaires", "serres", "colombier",
      "coin", "relance",
      "voix", "mesure", "double", "refente",
      "char", "corne", "oeil"
    ]);
  });

  it("SURVIVENT au Grand Reset (augment éternel), la Faveur se re-gagne", () => {
    state.templeArtifacts = { ivoire: true, solaires: true };
    state.faveur = 500;
    const fresh = buildGrandResetState(2);
    expect(fresh.templeArtifacts).toEqual({ ivoire: true, solaires: true }); // GR_PERSISTENT_FIELDS
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
    expect(hasTempleArtifact("ivoire")).toBe(false);
    expect(buyTempleArtifact("ivoire")).toBe(true);
    expect(hasTempleArtifact("ivoire")).toBe(true);
    expect(state.faveur).toBe(f0 - ARTIFACT_IVOIRE_COST);
  });

  it("refuse un second achat du même artefact", () => {
    buyTempleArtifact("ivoire");
    const f1 = state.faveur;
    expect(buyTempleArtifact("ivoire")).toBe(false);
    expect(state.faveur).toBe(f1); // pas de double débit
  });

  it("refuse sans assez de Faveur", () => {
    state.faveur = ARTIFACT_NOYE_COST - 1;
    expect(buyTempleArtifact("noye")).toBe(false);
    expect(hasTempleArtifact("noye")).toBe(false);
  });

  it("refuse un id qui n'est pas un artefact (niveau / automation / inconnu)", () => {
    expect(buyTempleArtifact("dice")).toBe(false);        // kind 'level'
    expect(buyTempleArtifact("autoOsselets")).toBe(false); // kind 'automation'
    expect(buyTempleArtifact("bogus")).toBe(false);
  });
});

// ── Dé d'ivoire : variance à taux de victoire ÉGAL ───────────────────────────
describe("Artefact — dé d'ivoire (variance découplée)", () => {
  it("coupe le Chien de moitié et gonfle Vénus, SANS toucher le taux de victoire", () => {
    const p = 0.4;
    const base = auguryTierOdds(p, 1); // spread 1, sans artefact
    state.templeArtifacts = { ivoire: true };
    const ivory = auguryTierOdds(p, 1);

    // Vénus : part 0.15 → 0.15 + 0.10 = 0.25 de la masse gagnante.
    expect(base.venus).toBeCloseTo(p * AUGURY_TIER_SHARES.venus, 10);
    expect(ivory.venus).toBeCloseTo(p * (AUGURY_TIER_SHARES.venus + IVORY_VENUS_BONUS), 10);
    // Chien : part de la masse PERDANTE (1-p) — dogShare 0.4 → 0.4 - 0.20 = 0.20 (moitié).
    expect(base.dog).toBeCloseTo((1 - p) * (1 - AUGURY_HOLLOW_SHARE), 10);
    expect(ivory.dog).toBeCloseTo((1 - p) * ((1 - AUGURY_HOLLOW_SHARE) - IVORY_DOG_CUT), 10);
    expect(ivory.dog).toBeCloseTo(base.dog / 2, 10); // exactement moitié (0.4 → 0.2)

    // INVARIANT : le taux de victoire (masse gagnante) est intact.
    const winBase = base.venus + base.triple + base.pair;
    const winIvory = ivory.venus + ivory.triple + ivory.pair;
    expect(winIvory).toBeCloseTo(p, 10);
    expect(winIvory).toBeCloseTo(winBase, 10);
    // …et la masse perdante aussi (le creux absorbe ce que le Chien lâche).
    expect(ivory.hollow + ivory.dog).toBeCloseTo(1 - p, 10);
    expect(ivory.hollow).toBeGreaterThan(base.hollow);
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
    castAugury("prayForRain", "classique");
    const potPlain = state.icarusPotFaveur;
    expect(potPlain).toBeGreaterThan(0);

    state.templeArtifacts = { noye: true };
    state.gambleHistory = {}; // sans rabais Clémence : mise pleine pour la parité
    state.icarusPotFaveur = 0;
    castAugury("prayForRain", "classique");
    // Le ratio suit le recycle clampé (0.85 / 0.6), PAS NOYE_POT_MULT (×2) : c'est
    // le clamp qui mord, et c'est lui qui rend l'imprimante impossible.
    expect(state.icarusPotFaveur).toBeCloseTo(potPlain * (TEMPLE_POT_RECYCLE_CAP / TEMPLE_POT_RECYCLE), 6);
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
    vi.spyOn(Math, "random").mockReturnValue(0.9); // crashPoint ~1 → cible 2 brûle (crash)
    const mise = ICARUS_STAKES.find((s) => s.id === "plume").faveur;

    const f0 = state.faveur;
    const plain = resolveIcarusHeadless("plume", 2);
    expect(plain.type).toBe("crash");
    expect(plain.refundFaveur).toBe(0);
    expect(state.faveur).toBe(f0 - mise); // la mise brûle, aucun retour sans plumes

    state.templeArtifacts = { plumes: true };
    state.icarusPotFaveur = 500; // une cella garnie finance le filet
    const f1 = state.faveur;
    const potBefore = state.icarusPotFaveur;
    const withNet = resolveIcarusHeadless("plume", 2);
    expect(withNet.type).toBe("crash");
    const expected = Math.round(mise * PLUMES_CONSOLATION_MULT);
    expect(withNet.refundFaveur).toBe(expected);
    expect(state.faveur).toBe(f1 - mise + expected);
    // ⚠ 2026-07-17 : la consolation SORT de la cella, elle n'est plus créée. Avant,
    // elle mintait round(mise × 0.5) à CHAQUE crash hors de tout paiement, et
    // P(crash) → 1 quand la cible monte : c'était le poste le plus lourd de toute
    // l'imprimante (+51 pts de RTP à ×50, devant la cagnotte elle-même).
    expect(state.icarusPotFaveur).toBeCloseTo(potBefore - expected + mise * potRecycle() * (1 - (1 - 0.18)), 6);
  });

  it("une cella VIDE ne rend rien : le filet est financé par les revers passés", () => {
    // Contrepartie assumée du changement de contrat (l'artefact est vendu 380
    // Faveur) — son texte le dit désormais explicitement.
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    state.templeArtifacts = { plumes: true };
    state.icarusPotFaveur = 0;
    const f0 = state.faveur;
    const out = resolveIcarusHeadless("plume", 2);
    expect(out.type).toBe("crash");
    expect(out.refundFaveur).toBe(0);
    expect(state.faveur).toBe(f0 - ICARUS_STAKES.find((s) => s.id === "plume").faveur);
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
  it("verrouille l'ivoire tant que les dés pipés ne sont pas acquis", () => {
    expect(state.diceLevel || 0).toBe(0);
    expect(buyArtifactNode("ivoire")).toBe(false); // rang 2 verrouillé
    expect(hasTempleArtifact("ivoire")).toBe(false);

    expect(buyArtifactNode("dice")).toBe(true);  // rang 1 (niveau) → buyFaveurItem
    expect(state.diceLevel).toBe(1);
    expect(buyArtifactNode("ivoire")).toBe(true); // débloqué → buyTempleArtifact
    expect(hasTempleArtifact("ivoire")).toBe(true);
  });

  it("route chaque kind : niveau → boutique, artefact → flag, automation → capstone", () => {
    // Chaîne complète osselets (2026-07-17, 6 rangs) : dice(level) → ivoire(art) →
    // noye(art) → echelle(art) → interdit(art) → autoOsselets(auto).
    expect(buyArtifactNode("noye")).toBe(false);        // encore verrouillé (ivoire manquant)
    buyArtifactNode("dice");
    buyArtifactNode("ivoire");
    expect(buyArtifactNode("noye")).toBe(true);
    expect(hasTempleArtifact("noye")).toBe(true);
    expect(buyArtifactNode("autoOsselets")).toBe(false); // capstone verrouillé : 2 rangs manquent
    expect(buyArtifactNode("echelle")).toBe(true);
    expect(buyArtifactNode("interdit")).toBe(true);
    expect(buyArtifactNode("autoOsselets")).toBe(true); // capstone → unlockTempleAuto
    expect(state.templeAuto.osselets.unlocked).toBe(true);
  });

  it("descripteur artifactTree : verrous, coûts et raisons", () => {
    const tree = artifactTree();
    // Les 5 lignées (2026-07-17) — gratteux (Ère II), vingt-et-un (Ère III) et
    // le trésor (Ère III) apparaissent dès leur ère atteinte (fixture : Ère III).
    expect(tree.map((l) => l.id)).toEqual(["osselets", "icarus", "gratteux", "vingtetun", "tresor"]);

    const oss = tree[0];
    expect(oss.eraOk).toBe(true); // Ère II ouverte (fixture)
    const [dice, ivoire, noye] = oss.nodes;
    const auto = oss.nodes[oss.nodes.length - 1]; // le capstone est TOUJOURS le dernier rang
    expect(dice.unlocked).toBe(true);            // rang 1 : garde d'ère seule
    expect(dice.kind).toBe("level");
    expect(ivoire.unlocked).toBe(false);         // rang 2 verrouillé au départ
    expect(ivoire.lockedReason).toBe("prereq");
    expect(ivoire.cost).toBe(ARTIFACT_IVOIRE_COST);
    expect(noye.cost).toBe(ARTIFACT_NOYE_COST);
    expect(auto.kind).toBe("automation");

    // Après avoir gravi dice+ivoire, le noyé se déverrouille et devient achetable.
    buyArtifactNode("dice");
    buyArtifactNode("ivoire");
    const t2 = artifactTree()[0].nodes;
    expect(t2[1].owned).toBe(true);              // ivoire acquis
    expect(t2[1].lockedReason).toBe("owned");
    expect(t2[2].unlocked).toBe(true);           // noyé déverrouillé
    expect(t2[2].buyable).toBe(true);
  });

  it("post-GR : une ère non ré-atteinte re-verrouille TOUTE la voie, malgré les rangs persistés", () => {
    // Après un Grand Reset, artefacts + niveaux persistent (éternels) mais l'ère
    // retombe. On simule une lignée « déjà gravie » avec bestEra sous l'ère requise.
    setState(hydrateState({ ...MID_GAME_FIXTURE, bestEraIndex: 0, cyclePeaks: { eraIndex: 0 } }));
    state.faveur = 100000;
    state.diceLevel = 3;                         // persisté
    state.templeArtifacts = { ivoire: true };    // persisté
    invalidateRenderCache("all");

    const oss = artifactTree()[0];
    expect(oss.eraOk).toBe(false);
    // Aucun rang n'est déverrouillé tant que l'Ère II n'est pas re-atteinte…
    expect(oss.nodes.every((n) => !n.unlocked)).toBe(true);
    // …et l'achat refuse à la source (descripteur ET moteur alignés).
    expect(buyArtifactNode("dice")).toBe(false);   // niveau (pas d'ère)
    expect(buyArtifactNode("noye")).toBe(false);   // artefact, même si l'ivoire persiste
    expect(buyArtifactNode("autoOsselets")).toBe(false); // capstone
    expect(hasTempleArtifact("noye")).toBe(false);
  });

  it("verrou de Faveur : achetable seulement si on peut payer", () => {
    buyArtifactNode("dice"); // ouvre l'ivoire
    state.faveur = ARTIFACT_IVOIRE_COST - 1;
    const ivoire = artifactTree()[0].nodes[1];
    expect(ivoire.unlocked).toBe(true);
    expect(ivoire.canAfford).toBe(false);
    expect(ivoire.buyable).toBe(false);
    expect(ivoire.lockedReason).toBe("faveur");
    expect(buyArtifactNode("ivoire")).toBe(false); // le débit refuse aussi
  });
});
