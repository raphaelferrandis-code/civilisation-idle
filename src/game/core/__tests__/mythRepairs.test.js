"use strict";
// Réparations du §2 de docs/REFONTE-MYTHES.md — garde-fous du chantier « refonte
// des Mythes ». Chacun de ces tests barre un blocage CONSTATÉ, pas une hypothèse :
//   §2.1  les Braisiers de Prométhée étaient effacés par leur propre effondrement ;
//   §2.2  Antée exigeait plus de Ruines actives qu'il n'en existe de sélectionnables,
//         ce qui verrouillait le Ragnarok et donc la fin du jeu ;
//   §2.3  le latch des paliers de crise fuyait de la boucle hors-ligne vers le
//         cycle en ligne suivant, qui se retrouvait sans aucune crise narrative.
// Le test de CLASSE de §2.1 (« resetTemporaryRunState n'efface aucun champ
// persistant ») vit dans grandReset.test.js, à côté de l'invariant qu'il prolonge.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import * as stateModule from "../state.js";
const { state, setState, hydrateState, migrate, CURRENT_SAVE_VERSION } = stateModule;
import { applyOfflineProgress } from "../main.js";
import { ACTIVE_RUIN_DEFINITIONS, ANTEE_MIN_ACTIVE_RUINS } from "../../data/activeRuins.js";
import { CRISIS_EVENTS } from "../../data/world.js";
import { upgrades } from "../../data/upgrades.js";
import { CRISIS_RESOLVE_RUIN_CAP } from "../balance.js";
import { MYTH_TICK_HANDLERS } from "../actions/mythTicks.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { tick } from "../actions/tick.js";
import { icareClimb, icareDescend, atlasEpauler, sisyphePousser, babelDeclareTongue, babelToggleAutoTongue, ragnarokOffrir, ragnarokOfferingCost } from "../actions/myths.js";
import { openCrisisEvent, autoResolveCrisisEvent } from "../actions/crisis.js";
import { ICARE_CLIMB_RUPTURE, ICARE_CLIMB_PROD_MULT, ATLAS_SHOULDER_CD_MS, ATLAS_COUNT_THRESHOLD, SISYPHE_CRANS, SISYPHE_MONTEES_TARGET, SISYPHE_STEP_BASE, BABEL_TOWER_TARGET, BABEL_COMMON_TONGUE_MULT, RAGNAROK_ARK_TARGET, RAGNAROK_ARK_COOLDOWN_MS, RAGNAROK_WINTER_AT_MS, RAGNAROK_WINTER_PROD_MULT, RAGNAROK_WOLF_AT_MS, RAGNAROK_FIRE_AT_MS } from "../../data/myths.js";
import { buyBuilding } from "../actions/building.js";
import { buildingCostAt, ruinGain } from "../mechanics.js";
import { buildings } from "../../data/buildings.js";
const { buildingById } = stateModule;
import { rates } from "../mechanics/production/rates.js";
import { BRAISIERS_DURATION_MS, BRAISIERS_FOOD_MULT } from "../../data/myths.js";
import { toNum, D } from "../num.js";
import { activateMyth } from "../actions/myths.js";
import { MYTHS, RAGNAROK_ID } from "../../data/myths.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

describe("§2.1 — Braisiers de Prométhée : migration des saves existantes", () => {
  // La suppression de la ligne fautive ne suffit PAS : tout joueur capable
  // d'atteindre Antée a déjà complété Prométhée, donc a déjà perdu le drapeau, et
  // il ne peut pas le regagner (activateMyth refuse un Mythe déjà complété).
  it("re-dérive prometheeBraisiers d'un save où le Mythe est complété", () => {
    const migrated = migrate({
      saveVersion: 3,
      mythsCompleted: { mythe_de_promethee: true },
      prometheeBraisiers: false
    });
    expect(migrated.prometheeBraisiers).toBe(true);
    expect(migrated.saveVersion).toBe(CURRENT_SAVE_VERSION);
  });

  it("n'accorde rien à un save où Prométhée n'est pas complété", () => {
    const migrated = migrate({ saveVersion: 3, mythsCompleted: { mythe_d_enee: true } });
    expect(Boolean(migrated.prometheeBraisiers)).toBe(false);
  });

  it("s'applique sur le VRAI chemin de chargement (hydrateState appelle migrate)", () => {
    // C'est la séquence exécutée au démarrage du jeu : le save brut entre dans
    // hydrateState, qui migre puis normalise. On la teste telle quelle plutôt que
    // de pré-migrer à la main, sinon on testerait un chemin qui n'existe pas.
    const hydrated = hydrateState({
      saveVersion: 3,
      mythsCompleted: { mythe_de_promethee: true },
      prometheeBraisiers: false
    });
    expect(hydrated.prometheeBraisiers).toBe(true);
    expect(hydrated.mythsCompleted.mythe_de_promethee).toBe(true);
  });

  it("un save déjà à jour n'est pas re-migré (la migration est idempotente)", () => {
    const once = hydrateState({ saveVersion: 3, mythsCompleted: { mythe_de_promethee: true } });
    const twice = hydrateState({ ...once, saveVersion: once.saveVersion });
    expect(twice.prometheeBraisiers).toBe(true);
    expect(twice.saveVersion).toBe(CURRENT_SAVE_VERSION);
  });
});

describe("§2.1 — les Braisiers produisent réellement leur effet", () => {
  // La plomberie réparée ne prouve rien tant que l'effet lui-même n'est pas
  // observé : le ×2 Nourriture de rates.js était du code MORT depuis toujours.
  const foodRateWith = (overrides) => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, ...overrides }));
    // rates() est mémoïsé par frame (renderCache._frameRatesVer) : sans invalidation,
    // la seconde mesure relirait la première et le ratio vaudrait 1 par construction.
    stateModule.invalidateRenderCache("all");
    return toNum(rates().food);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("double la Nourriture pendant la fenêtre d'ouverture de cycle", () => {
    const sans = foodRateWith({ prometheeBraisiers: false, cycleStartedAt: FIXED_NOW });
    const avec = foodRateWith({ prometheeBraisiers: true, cycleStartedAt: FIXED_NOW });
    expect(sans).toBeGreaterThan(0);
    expect(avec / sans).toBeCloseTo(BRAISIERS_FOOD_MULT, 6);
  });

  it("le MYTHE actif ne donne plus aucun bonus de Nourriture (retiré : trop facile)", () => {
    // Le ×3 finançait lui-même la course aux 1000 habitants. La contrainte est
    // désormais nue : sous le Mythe, la production de Nourriture est identique à
    // celle d'un cycle normal — seul l'HÉRITAGE (Braisiers) la multiplie encore.
    const sans = foodRateWith({ activeMythId: null, cycleStartedAt: FIXED_NOW });
    const avec = foodRateWith({ activeMythId: "mythe_de_promethee", cycleStartedAt: FIXED_NOW });
    expect(avec).toBeCloseTo(sans, 6);
  });

  it("s'éteint passé BRAISIERS_DURATION_MS", () => {
    const apres = FIXED_NOW - BRAISIERS_DURATION_MS - 1000;
    const sans = foodRateWith({ prometheeBraisiers: false, cycleStartedAt: apres });
    const avec = foodRateWith({ prometheeBraisiers: true, cycleStartedAt: apres });
    expect(avec / sans).toBeCloseTo(1, 6);
  });
});

describe("Cadmos — seuils absolus assumés, mais pas de rafale de modales", () => {
  // DÉCISION DE DESIGN (Raph, 2026-07-18) : les seuils restent ABSOLUS. Un joueur
  // qui a farmé doit pouvoir balayer un vieux défi en une seconde — c'est la
  // récompense de la progression, pas un oubli d'échelle.
  // Ce qui n'était PAS voulu, en revanche : franchir dix paliers d'un coup ouvrait
  // dix modales BLOQUANTES à la file, dont sept APRÈS que le Mythe soit gagné.
  const cadmosState = (overrides = {}) => {
    setState(hydrateState({
      ...MID_GAME_FIXTURE,
      activeMythId: "mythe_de_cadmos",
      cadmosChronicle: [],
      cadmosTriggeredMilestones: {},
      cadmosPromptPending: false,
      ...overrides
    }));
    stateModule.invalidateRenderCache("all");
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    registerChoiceDialog((d) => d.options?.[0] || {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("une cité qui a farmé franchit les paliers immédiatement (c'est le but)", () => {
    cadmosState({ population: 1e9, infrastructure: 1e9 });
    MYTH_TICK_HANDLERS.mythe_de_cadmos(state);
    expect(Object.keys(state.cadmosTriggeredMilestones)).toHaveLength(1);
  });

  it("cesse de réclamer un nom une fois l'objectif atteint", () => {
    // La garde qui compte : sans elle, une cité géante enchaînait les dix modales
    // jusqu'à épuisement des paliers, bien après avoir gagné.
    cadmosState({ population: 1e9, infrastructure: 1e9 });
    // Posé directement sur l'état plutôt que via l'hydratation : on teste LA GARDE,
    // pas le normaliseur de chronique. Et promptCadmosAgeName étant asynchrone, la
    // modale du test précédent peut encore mordre sur cet état — on repart net.
    state.cadmosChronicle = [{ orientation: "food" }, { orientation: "gold" }, { orientation: "stability" }];
    state.cadmosTriggeredMilestones = {};
    state.cadmosPromptPending = false;
    for (let i = 0; i < 12; i++) MYTH_TICK_HANDLERS.mythe_de_cadmos(state);
    expect(Object.keys(state.cadmosTriggeredMilestones)).toHaveLength(0);
  });

  it("ne réclame jamais deux noms dans le même tick", () => {
    // La modale fige le jeu : on n'en empile jamais deux, même sur une cité qui
    // franchit tout d'un coup.
    cadmosState({ population: 1e9, infrastructure: 1e9 });
    MYTH_TICK_HANDLERS.mythe_de_cadmos(state);
    const apresUnTick = Object.keys(state.cadmosTriggeredMilestones).length;
    expect(apresUnTick).toBe(1);
  });
});

describe("Validation vivante — un Mythe se sacre à la complétion, sans effondrement", () => {
  // Décision Raph 2026-07-19 : les drapeaux de réussite flippaient déjà en direct
  // pendant le cycle, mais le trophée attendait l'effondrement. Désormais le sacre
  // tombe au tick où l'objectif est atteint, et la contrainte est levée — pour
  // TOUS les Mythes (l'exception liftOnComplete du Chaos a disparu avec sa
  // refonte 2026-07-20 : son héritage n'exige plus un cycle entier resté Chaos).
  const mythState = (overrides = {}) => {
    setState(hydrateState({
      ...MID_GAME_FIXTURE,
      crisisThresholds: { _25: true, _50: true, _75: true },
      mythsCompleted: {},
      ...overrides
    }));
    stateModule.invalidateRenderCache("all");
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    registerChoiceDialog((d) => d.options?.[0] || {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("Prométhée : atteindre 1000 habitants sacre le Mythe au tick même", () => {
    mythState({
      activeMythId: "mythe_de_promethee",
      population: 1500, instability: 0.3,
      prometheePopReached: false, prometheeFailed: false
    });
    tick(1);
    expect(state.mythsCompleted.mythe_de_promethee).toBe(true);
    expect(state.prometheeBraisiers).toBe(true);      // l'héritage est accordé
    expect(state.activeMythId).toBeNull();            // la contrainte est levée
  });

  it("un Mythe raté ne se sacre jamais, même objectif atteint ensuite", () => {
    // La course du feu est perdue à 80 % de Rupture : atteindre 1000 après coup
    // ne doit rien donner (onCollapse exige popReached && !failed).
    mythState({
      activeMythId: "mythe_de_promethee",
      population: 1500, instability: 0.3,
      prometheePopReached: false, prometheeFailed: true
    });
    tick(1);
    expect(state.mythsCompleted.mythe_de_promethee).toBeUndefined();
    expect(state.activeMythId).toBe("mythe_de_promethee");
  });

  it("le Chaos se sacre en vivant et sa contrainte se lève comme les autres", () => {
    mythState({ activeMythId: "mythe_du_chaos", chaosReached: true, instability: 0.3 });
    tick(1);
    expect(state.mythsCompleted.mythe_du_chaos).toBe(true);
    expect(state.chaosHeritage).toBe(true);                 // héritage accordé
    expect(state.activeMythId).toBeNull();                  // et le pacte se retire
  });

  it("ne sacre pas deux fois : un Mythe déjà complété reste silencieux", () => {
    mythState({
      activeMythId: "mythe_du_chaos", chaosReached: true, instability: 0.3,
      mythsCompleted: { mythe_du_chaos: true }
    });
    const avant = JSON.stringify(state.mythsCompleted);
    tick(1);
    expect(JSON.stringify(state.mythsCompleted)).toBe(avant);
  });
});

describe("Chaos — « Né du néant » (héritage refondu)", () => {
  // Refonte 2026-07-20 : l'ancienne « banque » (Ruines du cycle Chaos ajoutées au
  // total effectif du multiplicateur global) était indétectable à vie (~12-40
  // ruines noyées dans des milliers). Le nouvel héritage est un facteur de la
  // MOISSON elle-même : toutes les récoltes de Ruines ×1.25, pour toujours.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("l'héritage multiplie la moisson de Ruines par 1.25", () => {
    // bestEraIndex 0 : le bonus PLAT d'ère (additif après le floor) est nul. Et
    // des pics de cité ÉLEVÉS : sur une petite moisson (~5), le floor déformait
    // le ratio (7/5 = 1.4) — en grand, l'arrondi devient négligeable.
    const gainAvec = (chaosHeritage) => {
      setState(hydrateState({
        ...MID_GAME_FIXTURE, chaosHeritage, bestEraIndex: 0,
        cyclePeaks: { population: 1e9, knowledge: 1e6, infrastructure: 1e5, eraIndex: 5 },
        crisisThresholds: { _25: true, _50: true, _75: true }
      }));
      stateModule.invalidateRenderCache("all");
      return toNum(ruinGain(true));
    };
    const sans = gainAvec(false);
    const avec = gainAvec(true);
    expect(sans).toBeGreaterThan(0);
    expect(avec / sans).toBeCloseTo(1.25, 1);
  });

  it("renommage : un save d'avant la refonte (chaosRuinsDouble) garde son héritage", () => {
    const loaded = hydrateState({ ...MID_GAME_FIXTURE, chaosRuinsDouble: true });
    expect(loaded.chaosHeritage).toBe(true);
    const frais = hydrateState({ ...MID_GAME_FIXTURE });
    expect(frais.chaosHeritage).toBe(false);
  });
});

describe("Icare — le vol par paliers", () => {
  // Refonte 2026-07-19 : les ×100/×30/×15 SUBIS ont disparu. Le joueur MONTE
  // lui-même (prod ×2 par altitude, +15 % de Rupture immédiate, Rupture accélérée)
  // et le défi est une cible absolue : altitude 5. L'héritage (l'Aile) garde le
  // même verbe en cycle normal, SANS plafond.
  const volState = (overrides = {}) => {
    setState(hydrateState({
      ...MID_GAME_FIXTURE,
      crisisThresholds: { _25: true, _50: true, _75: true },
      mythsCompleted: {},
      ...overrides
    }));
    stateModule.invalidateRenderCache("all");
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    registerChoiceDialog((d) => d.options?.[0] || {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("MONTER : +1 altitude, +15 % de Rupture immédiate", () => {
    volState({ activeMythId: "mythe_d_icare", icareAltitude: 0, instability: 0.2 });
    icareClimb();
    expect(state.icareAltitude).toBe(1);
    expect(state.instability).toBeCloseTo(0.2 + ICARE_CLIMB_RUPTURE, 10);
  });

  it("sans Mythe ni héritage, MONTER est inerte", () => {
    volState({ activeMythId: null, icareHeritage: false, icareAltitude: 0, instability: 0.2 });
    icareClimb();
    expect(state.icareAltitude).toBe(0);
    expect(state.instability).toBeCloseTo(0.2, 10);
  });

  it("chaque altitude double réellement la production", () => {
    // L'infrastructure prend le multiplicateur global ENTIER (pas la racine) :
    // c'est la ressource témoin.
    const infraAt = (alt) => {
      volState({ icareHeritage: true, icareAltitude: alt, activeMythId: null });
      return toNum(rates().infrastructure);
    };
    const base = infraAt(0);
    expect(base).toBeGreaterThan(0);
    expect(infraAt(3) / base).toBeCloseTo(Math.pow(ICARE_CLIMB_PROD_MULT, 3), 4);
  });

  it("la 5e montée sacre le Mythe au tick même, et l'Aile reprend le cadran sans couture", () => {
    volState({ activeMythId: "mythe_d_icare", icareAltitude: 4, icareHeritage: false, instability: 0.2 });
    icareClimb();                 // altitude 5
    tick(1);                      // validation vivante
    expect(state.mythsCompleted.mythe_d_icare).toBe(true);
    expect(state.activeMythId).toBeNull();       // contrainte levée…
    expect(state.icareHeritage).toBe(true);      // …l'Aile est accordée…
    expect(state.icareAltitude).toBe(5);         // …et l'altitude reste ENTRE SES MAINS
  });

  it("redescendre est gratuit et borné à zéro", () => {
    volState({ icareHeritage: true, icareAltitude: 2, activeMythId: null, instability: 0.4 });
    icareDescend();
    expect(state.icareAltitude).toBe(1);
    expect(state.instability).toBeCloseTo(0.4, 10); // pas de remboursement
    icareDescend();
    icareDescend();
    expect(state.icareAltitude).toBe(0);
  });

  it("« Cire fondante » : l'Aile monte TOUTE SEULE au seuil, une fois par franchissement", () => {
    // Sans le latch, la montée (+15 % immédiat) re-déclencherait la condition au
    // tick suivant : spirale de mort en trois secondes.
    volState({
      icareHeritage: true, activeRuinIds: ["icare"], activeMythId: null,
      icareAltitude: 0, instability: 0.65
    });
    tick(1);
    expect(state.icareAltitude).toBe(1);
    state.instability = 0.75;   // toujours au-dessus du seuil : latché, pas de re-montée
    tick(1);
    expect(state.icareAltitude).toBe(1);
    state.instability = 0.3;    // redescend sous le seuil : le latch s'ouvre
    tick(1);
    state.instability = 0.7;    // nouveau franchissement : une montée de plus
    tick(1);
    expect(state.icareAltitude).toBe(2);
  });
});

describe("Atlas — le poids du ciel", () => {
  // Refonte 2026-07-19 : l'endurance passive (45 min, Usure ×4) a disparu. Le
  // Fardeau monte, ÉPAULER le fait redescendre (cooldown), écrasé à 100 % = échec.
  // Objectif : épauler 12 fois. L'héritage (l'Épaule) : « Atlas prend le coup » —
  // un choix DE PLUS dans les gestions de crise, qui la fait passer sans effet,
  // une fois par cycle (la Légitimité a disparu avec la refonte).
  const atlasState = (overrides = {}) => {
    setState(hydrateState({
      ...MID_GAME_FIXTURE,
      crisisThresholds: { _25: true, _50: true, _75: true },
      mythsCompleted: {},
      ...overrides
    }));
    stateModule.invalidateRenderCache("all");
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    registerChoiceDialog((d) => d.options?.[0] || {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("le Fardeau monte sans arrêt pendant le Mythe", () => {
    atlasState({ activeMythId: "mythe_d_atlas", atlasFardeau: 0 });
    tick(5);
    expect(state.atlasFardeau).toBeGreaterThan(0);
    expect(state.atlasFardeau).toBeLessThan(100);
  });

  it("ÉPAULER fait redescendre le Fardeau, compte, et respecte le cooldown", () => {
    atlasState({ activeMythId: "mythe_d_atlas", atlasFardeau: 80, atlasEpaules: 0 });
    atlasEpauler();
    expect(state.atlasEpaules).toBe(1);
    expect(state.atlasFardeau).toBeLessThan(80);
    const apres1 = state.atlasFardeau;
    atlasEpauler();                       // encore en cooldown : inerte
    expect(state.atlasEpaules).toBe(1);
    expect(state.atlasFardeau).toBe(apres1);
    vi.setSystemTime(FIXED_NOW + ATLAS_SHOULDER_CD_MS + 1);
    state.atlasFardeau = 85;              // re-dans la zone rouge
    atlasEpauler();                       // cooldown écoulé : compte
    expect(state.atlasEpaules).toBe(2);
  });

  it("épauler un ciel LÉGER soulage mais ne compte pas — et gaspille la récup", () => {
    // La règle anti-spam (retour Raph) : sous le seuil, cliquer n'est pas neutre,
    // c'est une ERREUR — le geste consomme le cooldown sans faire avancer l'objectif.
    // C'est ce qui fait du clic une décision (chevaucher la zone rouge) et non un
    // métronome (cliquer dès que possible).
    atlasState({ activeMythId: "mythe_d_atlas", atlasFardeau: ATLAS_COUNT_THRESHOLD - 20, atlasEpaules: 0 });
    atlasEpauler();
    expect(state.atlasEpaules).toBe(0);                             // ne compte pas
    expect(state.atlasFardeau).toBeLessThan(ATLAS_COUNT_THRESHOLD - 20); // mais soulage
    expect(state.atlasShoulderCdEnd).toBeGreaterThan(FIXED_NOW);    // et coûte la récup
  });

  it("écrasé si le Fardeau atteint 100 % : échec, et onCollapse refuse", () => {
    atlasState({ activeMythId: "mythe_d_atlas", atlasFardeau: 99, atlasEpaules: 12 });
    tick(5);
    expect(state.atlasCrushed).toBe(true);
    expect(state.mythsCompleted.mythe_d_atlas).toBeUndefined(); // même à 12 épaulées
  });

  it("la 12e épaulée sacre le Mythe au tick même, et l'Épaule reprend la main", () => {
    atlasState({ activeMythId: "mythe_d_atlas", atlasFardeau: 75, atlasEpaules: 11, icareHeritage: false });
    atlasEpauler();                       // 12e — en zone rouge, donc elle compte
    expect(state.mythsCompleted.mythe_d_atlas).toBe(true);
    expect(state.activeMythId).toBeNull();     // contrainte levée
    expect(state.atlasHeritage).toBe(true);    // l'Épaule accordée
  });

  it("hors Mythe, ÉPAULER est inerte — même avec l'héritage", () => {
    // L'héritage ne passe plus par ce bouton : « Atlas prend le coup » vit dans
    // le dialogue de crise. Le verbe ÉPAULER redevient un verbe de Mythe.
    atlasState({ activeMythId: null, atlasHeritage: true, atlasFardeau: 0 });
    atlasEpauler();
    expect(state.atlasShoulderCdEnd || 0).toBe(0); // pas même la récup consommée
  });

  it("héritage : « Atlas prend le coup » fait passer la crise sans AUCUN effet", async () => {
    // Le choix est ajouté au dialogue de crise. Le sélectionner : aucun apply()
    // ne tourne, le coup du cycle est consommé, et la crise ne compte pas comme
    // stabilisée (pas de Moisson de crise gratuite).
    let applied = 0;
    const crise = () => ({
      id: "crise_test", title: "Crise d'essai",
      options: [{ label: "Subir", stance: "stabiliser", apply: () => { applied += 1; return null; } }]
    });
    registerChoiceDialog((d) => d.options.find((o) => o.atlasSkip) || d.options[0]);
    atlasState({ activeMythId: null, atlasHeritage: true });
    const moissonAvant = state.cycleCrisesResolved || 0;
    await openCrisisEvent(crise());
    expect(applied).toBe(0);
    expect(state.atlasSkipUsed).toBe(true);
    expect(state.cycleCrisesResolved || 0).toBe(moissonAvant);

    // Deuxième crise du même cycle : l'option a DISPARU, la crise s'applique.
    let vues = null;
    registerChoiceDialog((d) => { vues = d.options; return d.options[0]; });
    await openCrisisEvent(crise());
    expect(vues.some((o) => o.atlasSkip)).toBe(false);
    expect(applied).toBe(1);
  });

  it("sans l'héritage, l'option n'est jamais proposée", async () => {
    let vues = null;
    registerChoiceDialog((d) => { vues = d.options; return d.options[0]; });
    atlasState({ activeMythId: null, atlasHeritage: false });
    await openCrisisEvent({
      id: "crise_test", title: "Crise d'essai",
      options: [{ label: "Subir", apply: () => null }]
    });
    expect(vues.some((o) => o.atlasSkip)).toBe(false);
  });
});

describe("Sisyphe — la Montée", () => {
  // Refonte 2026-07-20 : l'inflation passive (+3 %/achat, cible 180 bâtiments) a
  // disparu. Le rocher se hisse par crans PAYÉS dans une matière au choix (chaque
  // usage double son prix) ; bâtir pendant la montée lâche le rocher ; le premier
  // sommet retombe toujours — seul le second scelle le Mythe, en direct.
  const sisypheState = (overrides = {}) => {
    setState(hydrateState({
      ...MID_GAME_FIXTURE,
      activeMythId: "mythe_de_sisyphe",
      crisisThresholds: { _25: true, _50: true, _75: true },
      mythsCompleted: {},
      ...overrides
    }));
    stateModule.invalidateRenderCache("all");
  };
  // Une montée complète en 2-2-2 : coûte 3× la base de chaque matière
  // (1×+2×), soit 15 000 Nourriture + 3 000 Savoir + 360 Infrastructure.
  const monteeComplete = () => {
    sisyphePousser("food"); sisyphePousser("food");
    sisyphePousser("knowledge"); sisyphePousser("knowledge");
    sisyphePousser("infrastructure"); sisyphePousser("infrastructure");
  };

  it("POUSSER paie le cran choisi, et chaque matière ré-employée double son prix", () => {
    sisypheState();
    const foodAvant = toNum(state.food);
    sisyphePousser("food");
    expect(state.sisypheCran).toBe(1);
    expect(toNum(state.food)).toBeCloseTo(foodAvant - SISYPHE_STEP_BASE.food, 5);
    sisyphePousser("food");                       // 2e usage : prix ×2
    expect(state.sisypheCran).toBe(2);
    expect(toNum(state.food)).toBeCloseTo(foodAvant - 3 * SISYPHE_STEP_BASE.food, 5);
  });

  it("sans les moyens, POUSSER est inerte — pas de cran gratuit", () => {
    sisypheState({ infrastructure: 10 });         // < base (120)
    sisyphePousser("infrastructure");
    expect(state.sisypheCran).toBe(0);
  });

  it("bâtir pendant la montée lâche le rocher ; au pied, bâtir est libre", () => {
    sisypheState();
    sisyphePousser("food");
    expect(state.sisypheCran).toBe(1);
    buyBuilding("foragers", 1);
    expect(state.sisypheCran).toBe(0);            // le rocher dévale au pied
    expect(state.sisypheUsages.food).toBe(0);     // prix de base restaurés
    expect(state.sisypheMult || 1).toBe(1);       // et PLUS d'inflation du Mythe
    buyBuilding("foragers", 1);                   // au pied : aucun effet sur le rocher
    expect(state.sisypheCran).toBe(0);
    expect(state.sisypheMontees || 0).toBe(0);
  });

  it("le premier sommet retombe TOUJOURS ; le second scelle le Mythe en direct", () => {
    sisypheState();
    monteeComplete();
    expect(state.sisypheMontees).toBe(1);
    expect(state.sisypheCran).toBe(0);            // retombé, prix de base
    expect(state.sisypheUsages.food).toBe(0);
    expect(state.mythsCompleted.mythe_de_sisyphe).toBeUndefined(); // pas encore
    monteeComplete();
    expect(state.sisypheMontees).toBe(SISYPHE_MONTEES_TARGET);
    expect(state.mythsCompleted.mythe_de_sisyphe).toBe(true);      // sacré au geste même
    expect(state.activeMythId).toBeNull();
    expect(state.sisypheHeritage).toBe(true);
  });

  it(`la colline fait bien ${SISYPHE_CRANS} crans (garde anti-dérive des constantes)`, () => {
    // Le test de sommet ci-dessus encode une montée de 6 POUSSER : si SISYPHE_CRANS
    // change, monteeComplete() ne boucle plus la montée et ce garde le dit clairement.
    expect(SISYPHE_CRANS).toBe(6);
  });
});

describe("Babel — la tour lisible + la Langue commune", () => {
  // Refonte 2026-07-20 : la contrainte reste (verrou de catégorie, Rupture ×2,
  // concentration ×1.05^N), mais l'objectif « multiplicateur ×30 » devient sa
  // traduction directe : 70 bâtiments de la catégorie, sacrés EN DIRECT. Et
  // l'héritage d'adjacence (invisible, placement procédural) devient la Langue
  // commune : une catégorie déclarée 1×/cycle produit +20 %.
  const latched = { _25: true, _50: true, _75: true };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    registerChoiceDialog((d) => d.options?.[0] || {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it(`la tour se sacre EN DIRECT au ${BABEL_TOWER_TARGET}e bâtiment de la catégorie`, () => {
    const catFor = buildingById["foragers"].category;
    setState(hydrateState({
      ...MID_GAME_FIXTURE, activeMythId: "mythe_de_babel", babelCategory: catFor,
      mythsCompleted: {}, buildings: { foragers: BABEL_TOWER_TARGET - 1 },
      crisisThresholds: latched
    }));
    stateModule.invalidateRenderCache("all");
    expect(state.babelCategory).toBe(catFor); // canari : la catégorie a survécu à l'hydratation
    tick(1);
    expect(state.mythsCompleted.mythe_de_babel).toBeUndefined(); // 69 : pas encore
    state.buildings = { ...state.buildings, foragers: BABEL_TOWER_TARGET };
    tick(1);
    expect(state.mythsCompleted.mythe_de_babel).toBe(true);      // sacré au tick même
    expect(state.activeMythId).toBeNull();
    expect(state.babelHeritage).toBe(true);
  });

  it("le verrou tient : pendant le Mythe, bâtir hors catégorie est refusé", () => {
    const catFor = buildingById["foragers"].category;
    const riche = { food: 1e12, gold: 1e12, knowledge: 1e12, infrastructure: 1e12 };
    // Contrôle anti-faux-positif : sans le Mythe, le même achat passe.
    setState(hydrateState({ ...MID_GAME_FIXTURE, ...riche, activeMythId: null, crisisThresholds: latched }));
    stateModule.invalidateRenderCache("all");
    const autre = buildings.find((b) => b.category !== catFor && (state.buildings[b.id] || 0) > 0);
    expect(buyBuilding(autre.id, 1)).toBe(true);
    // Avec le Mythe verrouillé sur la catégorie de foragers : refusé — et la
    // catégorie choisie, elle, passe.
    setState(hydrateState({ ...MID_GAME_FIXTURE, ...riche, activeMythId: "mythe_de_babel", babelCategory: catFor, crisisThresholds: latched }));
    stateModule.invalidateRenderCache("all");
    expect(buyBuilding(autre.id, 1)).toBe(false);
    expect(buyBuilding("foragers", 1)).toBe(true);
  });

  it("héritage : la Langue commune donne +20 % à la catégorie déclarée, 1×/cycle", () => {
    // Un parc d'UNE seule catégorie (infra) : le ratio doit être exactement ×1.2
    // (l'infra n'a aucun terme additif hors bâtiments dans rates, contrairement
    // au Savoir et sa théocratie).
    const bInfra = buildings.find((b) => b.category === "infra");
    setState(hydrateState({
      ...MID_GAME_FIXTURE, activeMythId: null, babelHeritage: true,
      buildings: { [bInfra.id]: 10 }, crisisThresholds: latched
    }));
    stateModule.invalidateRenderCache("all");
    const avant = toNum(rates().infrastructure);
    babelDeclareTongue("infra");
    stateModule.invalidateRenderCache("all");
    expect(toNum(rates().infrastructure) / avant).toBeCloseTo(BABEL_COMMON_TONGUE_MULT, 2);
    babelDeclareTongue("city");                        // 2e déclaration : inerte
    expect(state.babelCommonTongue).toBe("infra");
  });

  it("sans l'héritage, déclarer est inerte", () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, activeMythId: null, babelHeritage: false, crisisThresholds: latched }));
    stateModule.invalidateRenderCache("all");
    babelDeclareTongue("city");
    expect(state.babelCommonTongue).toBeNull();
  });

  it("réglage Auto : la langue retenue repart déclarée d'elle-même au cycle suivant", () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, activeMythId: null, babelHeritage: true, crisisThresholds: latched }));
    stateModule.invalidateRenderCache("all");
    babelDeclareTongue("infra");
    babelToggleAutoTongue();                          // retient « infra »
    expect(state.babelAutoTongue).toBe("infra");
    stateModule.resetTemporaryRunState(state);        // passage de cycle
    expect(state.babelCommonTongue).toBe("infra");    // re-déclarée toute seule
    babelToggleAutoTongue();                          // désarme (la déclaration du cycle reste)
    expect(state.babelAutoTongue).toBeNull();
    expect(state.babelCommonTongue).toBe("infra");
    stateModule.resetTemporaryRunState(state);
    expect(state.babelCommonTongue).toBeNull();       // sans Auto : à re-déclarer
  });

  it("Auto sans langue déclarée : rien à retenir, le toggle est inerte", () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, activeMythId: null, babelHeritage: true, crisisThresholds: latched }));
    stateModule.invalidateRenderCache("all");
    babelToggleAutoTongue();
    expect(state.babelAutoTongue).toBeNull();
  });
});

describe("Ragnarok — « l'Hiver Fimbul »", () => {
  // Refonte 2026-07-20 (identité choisie par Raph) : plus de superposition des 13
  // contraintes ni de « puissance ×3 » invisible — une apocalypse scriptée
  // (Hiver 8 min, Loup 14 min, Feu 20 min, Fin 24 min) conjurée par l'Arche :
  // 8 offrandes au prix VIVANT (secondes de prod courante, cliqueté à la hausse),
  // une par cooldown de 2 min — le 1er jet « prix figé à l'activation » tombait
  // aux planchers (l'activation suit le reset de cité) et le bot bouclait en 2:45.
  const fimbulState = (ageMs, overrides = {}) => {
    setState(hydrateState({
      ...MID_GAME_FIXTURE,
      activeMythId: RAGNAROK_ID,
      mythsCompleted: {},
      cycleStartedAt: FIXED_NOW - ageMs,
      crisisThresholds: { _25: true, _50: true, _75: true },
      ...overrides
    }));
    stateModule.invalidateRenderCache("all");
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    registerChoiceDialog((d) => d.options?.[0] || {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("OFFRIR paie le prix courant ; sans les moyens, le geste est inerte", () => {
    // Stocks riches : le prix vivant (75 s de prod) dépasse les stocks de base
    // du fixture — c'est voulu en jeu (il faut accumuler), pas utile ici.
    fimbulState(60_000, { food: 1e12, gold: 1e12, knowledge: 1e12, infrastructure: 1e12 });
    const lot = ragnarokOfferingCost();
    const foodAvant = toNum(state.food);
    ragnarokOffrir();
    expect(state.ragnarokArkOfferings).toBe(1);
    expect(toNum(state.food)).toBeCloseTo(foodAvant - toNum(lot.food), 2);
    vi.setSystemTime(FIXED_NOW + RAGNAROK_ARK_COOLDOWN_MS + 1_000); // cooldown passé
    state.food = D(0);                             // plus les moyens
    stateModule.invalidateRenderCache("all");
    ragnarokOffrir();
    expect(state.ragnarokArkOfferings).toBe(1);
  });

  it("l'Arche n'accepte qu'une offrande par cooldown — pas de rush", () => {
    fimbulState(60_000, { food: 1e12, gold: 1e12, knowledge: 1e12, infrastructure: 1e12 });
    ragnarokOffrir();
    ragnarokOffrir();                              // immédiat : refusé
    expect(state.ragnarokArkOfferings).toBe(1);
    vi.setSystemTime(FIXED_NOW + RAGNAROK_ARK_COOLDOWN_MS + 1_000);
    stateModule.invalidateRenderCache("all");
    ragnarokOffrir();
    expect(state.ragnarokArkOfferings).toBe(2);
  });

  it("le prix est SCELLÉ au pacte : l'Hiver ne le change pas", () => {
    fimbulState(60_000, { ragnarokArkCost: { food: 500, gold: 200, knowledge: 100, infrastructure: 40 } });
    const avant = toNum(ragnarokOfferingCost().food);
    expect(avant).toBe(500);
    vi.setSystemTime(FIXED_NOW + RAGNAROK_WINTER_AT_MS + 60_000);   // sous l'Hiver
    stateModule.invalidateRenderCache("all");
    expect(toNum(ragnarokOfferingCost().food)).toBe(avant);
  });

  it("la 8e offrande sacre le Mythe en direct — l'Arche conjure la Fin", () => {
    fimbulState(60_000, {
      ragnarokArkOfferings: RAGNAROK_ARK_TARGET - 1,
      food: 1e12, gold: 1e12, knowledge: 1e12, infrastructure: 1e12
    });
    ragnarokOffrir();
    expect(state.mythsCompleted[RAGNAROK_ID]).toBe(true);
    expect(state.activeMythId).toBeNull();          // le pacte se retire, les fléaux cessent
    expect(state.ragnarokHeritage).toBe(true);
    expect(state.finalChronicleTitle).toBeTruthy(); // le titre final est gravé
  });

  it("l'HIVER gèle la production dès 8 minutes (mesuré sur l'Infrastructure : mult plein)", () => {
    fimbulState(60_000);
    const avant = toNum(rates().infrastructure);
    fimbulState(RAGNAROK_WINTER_AT_MS + 60_000);
    const pendant = toNum(rates().infrastructure);
    expect(pendant / avant).toBeCloseTo(RAGNAROK_WINTER_PROD_MULT, 2);
  });

  it("le LOUP dévore le parc dès 14 minutes, au bâtiment le plus nombreux", () => {
    fimbulState(RAGNAROK_WOLF_AT_MS + 60_000, { buildings: { foragers: 50, scribes: 5 } });
    tick(1);
    expect(state.buildings.foragers).toBeLessThan(50);
    expect(state.buildings.scribes).toBe(5);            // le petit est épargné
    expect(state.ragnarokWolfBites).toBeGreaterThan(0);
  });

  it("le FEU fait monter la Rupture plus vite qu'un cycle sans Feu", () => {
    fimbulState(60_000, { instability: 0.5 });
    tick(4);
    const sansFeu = state.instability;
    fimbulState(RAGNAROK_FIRE_AT_MS + 60_000, { instability: 0.5 });
    tick(4);
    expect(state.instability).toBeGreaterThan(sansFeu);
  });

  it("activateMyth scelle le prix sur la prod d'AVANT le reset — pas des planchers", async () => {
    setState(hydrateState({
      ...MID_GAME_FIXTURE, grandResetCount: 1,
      mythsCompleted: Object.fromEntries(MYTHS.filter((m) => m.id !== RAGNAROK_ID).map((m) => [m.id, true])),
      crisisThresholds: { _25: true, _50: true, _75: true }
    }));
    stateModule.invalidateRenderCache("all");
    await activateMyth(RAGNAROK_ID);
    expect(state.activeMythId).toBe(RAGNAROK_ID);
    expect(state.ragnarokArkOfferings).toBe(0);
    // La cité MID_GAME produit de la Nourriture par milliers/s : 75 s de cette
    // prod dépasse largement le plancher — le prix reflète la puissance d'avant
    // le reset. (Le Savoir du fixture ne produit rien : plancher légitime.)
    expect(toNum(state.ragnarokArkCost.food)).toBeGreaterThan(100);
    expect(toNum(state.ragnarokArkCost.knowledge)).toBeGreaterThanOrEqual(25);
  });
});

describe("Antée — les fardeaux doivent exister ET mordre", () => {
  // Avant : 6 des 10 fardeaux étaient des coquilles vides désactivées, pour un
  // minimum requis de 4. Le joueur cochait obligatoirement les 4 mêmes cases :
  // le choix n'existait pas. Principe des 6 nouveaux : porter un Héritage comme
  // fardeau, c'est en GARDER le pouvoir mais en PERDRE le contrôle.
  it("plus aucun slot vide, et le choix redevient réel", () => {
    const selectables = ACTIVE_RUIN_DEFINITIONS.filter((d) => !d.pending);
    expect(selectables).toHaveLength(ACTIVE_RUIN_DEFINITIONS.length);
    expect(selectables.length).toBeGreaterThan(ANTEE_MIN_ACTIVE_RUINS);
  });

  it("aucun fardeau ne promet un effet « à définir »", () => {
    // Garde anti-régression sur le texte : un slot re-vidé se verrait ici.
    for (const d of ACTIVE_RUIN_DEFINITIONS) {
      expect(`${d.malus} ${d.bonus} ${d.title}`.toLowerCase()).not.toContain("définir");
      expect(`${d.title}`.toLowerCase()).not.toContain("slot futur");
    }
  });

  it("« Pente du rocher » réveille bien la malédiction de Sisyphe à l'achat", () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, sisypheHeritage: true, activeRuinIds: ["sisyphe"] }));
    stateModule.invalidateRenderCache("all");
    const avant = state.sisypheMult || 1;
    buyBuilding("foragers", 1);
    expect(state.sisypheMult).toBeGreaterThan(avant);
  });

  it("« Fardeau du ciel » : Atlas prend le PREMIER coup, pas celui qu'on choisit", () => {
    // Le pouvoir reste (une crise saute toujours), le contrôle part : le skip du
    // cycle est consommé d'office sur la PREMIÈRE crise — même sous Conseil
    // automatisé — au lieu d'être gardé pour celle qui fait mal.
    const crise = (marque) => ({
      id: "crise_test", title: "Crise d'essai",
      options: [{ label: "Subir", stance: "stabiliser", apply: () => { marque.applied += 1; return null; } }]
    });
    const sousFardeau = { applied: 0 };
    setState(hydrateState({
      ...MID_GAME_FIXTURE, atlasHeritage: true, activeRuinIds: ["atlas"],
      crisisThresholds: { _25: true, _50: true, _75: true }
    }));
    stateModule.invalidateRenderCache("all");
    autoResolveCrisisEvent(crise(sousFardeau), "stabiliser");
    expect(sousFardeau.applied).toBe(0);            // 1re crise : Atlas l'a prise
    expect(state.atlasSkipUsed).toBe(true);
    autoResolveCrisisEvent(crise(sousFardeau), "stabiliser");
    expect(sousFardeau.applied).toBe(1);            // 2e : coup consommé, elle s'applique

    // Sans le fardeau : pas d'auto-consommation — le Conseil tranche, le coup reste.
    const sansFardeau = { applied: 0 };
    setState(hydrateState({
      ...MID_GAME_FIXTURE, atlasHeritage: true, activeRuinIds: [],
      crisisThresholds: { _25: true, _50: true, _75: true }
    }));
    stateModule.invalidateRenderCache("all");
    autoResolveCrisisEvent(crise(sansFardeau), "stabiliser");
    expect(sansFardeau.applied).toBe(1);
    expect(state.atlasSkipUsed).toBe(false);
  });

  it("« Confusion des langues » renchérit la catégorie dominante, et elle seule", () => {
    const base = { ...MID_GAME_FIXTURE, babelHeritage: true };
    setState(hydrateState(base));
    stateModule.invalidateRenderCache("all");
    const dominante = buildingById["foragers"].category;
    const cible = buildings.find((b) => b.category === dominante && (state.buildings[b.id] || 0) > 0);
    const autre = buildings.find((b) => b.category !== dominante);
    const coutSans = { cible: buildingCostAt(cible, state.buildings[cible.id] || 0), autre: buildingCostAt(autre, 0) };

    setState(hydrateState({ ...base, activeRuinIds: ["babel"] }));
    stateModule.invalidateRenderCache("all");
    const coutAvec = { cible: buildingCostAt(cible, state.buildings[cible.id] || 0), autre: buildingCostAt(autre, 0) };

    const cle = cible.currency;
    expect(toNum(coutAvec.cible[cle])).toBeGreaterThan(toNum(coutSans.cible[cle]));
    const cleAutre = autre.currency;
    expect(toNum(coutAvec.autre[cleAutre])).toBeCloseTo(toNum(coutSans.autre[cleAutre]), 6);
  });
});

describe("§2.3 — Moisson de crise : la pince ne doit pas amputer le gradient", () => {
  // Le doc annonçait une « saturation à 3 crises » sur un cycle qui en produirait
  // bien davantage. C'est faux : il n'existe que 3 paliers, donc le compteur est
  // borné à 3 par construction et le cap 0,30 ne rogne rien. Ce qu'il faut garder,
  // c'est cette égalité — un futur 2e nœud porteur du même effet la casserait en
  // silence, et le texte joueur « maximum +30 % » deviendrait mensonger.
  const sumBonus = upgrades
    .filter((u) => u.group === "ruins" && u.effectType === "crisisResolveRuinBonus")
    .reduce((acc, u) => acc + (u.amount || 0), 0);

  it("le cap couvre exactement le maximum atteignable", () => {
    // 3 × 0.1 vaut 0.30000000000000004 en IEEE754 : comparer avec tolérance.
    expect(CRISIS_RESOLVE_RUIN_CAP).toBeCloseTo(CRISIS_EVENTS.length * sumBonus, 10);
    expect(CRISIS_RESOLVE_RUIN_CAP).toBeGreaterThanOrEqual(CRISIS_EVENTS.length * sumBonus - 1e-9);
  });

  it("le texte joueur annonce la valeur réellement appliquée", () => {
    // localizeData aplatit déjà {fr,en} en chaîne de la langue courante.
    const node = upgrades.find((u) => u.id === "moisson_de_crise");
    expect(node.amount).toBe(0.10);
    expect(node.effect).toContain(`+${Math.round(node.amount * 100)}%`);
    expect(node.effect).toContain(`+${Math.round(CRISIS_EVENTS.length * sumBonus * 100)}%`);
  });
});

describe("§2.3 bis — le latch des paliers de crise ne doit pas fuir hors-ligne", () => {
  const farmState = (overrides = {}) => hydrateState({
    population: 100000, food: 400000, gold: 200000, knowledge: 30000, infrastructure: 3000,
    ruins: 5000, cycles: 10, instability: 0.3, timeWear: 0.1,
    bestEraIndex: 6, cyclePeaks: { population: 120000, knowledge: 35000, infrastructure: 3500, eraIndex: 6 },
    cycleStartedAt: FIXED_NOW - 2 * 3600 * 1000, lastTick: FIXED_NOW - 2 * 3600 * 1000,
    buildings: { foragers: 30, granaries_city: 20, caravans: 12, markets: 8, irrigated_fields: 6 },
    upgrades: { conseil_de_crise: true, edit_effondrement: true },
    hephHeritage: true,
    crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser", autoCollapse: { enabled: true, trigger: "temps", timeSeconds: 180, usureThreshold: 0.9, prepare: false } },
    ...overrides
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rend ses 3 paliers au cycle EN LIGNE qui suit une session hors-ligne", () => {
    // simulateAwayCrises pré-latche _25/_50/_75 pour éviter les dialogues async.
    // Son `finally` restaurait Date.now, les pauses et l'historique — mais pas les
    // paliers, et applyOfflineProgress persiste ensuite l'état. Le joueur revenait
    // donc dans un cycle sans AUCUNE crise narrative : plus de dialogues, plus de
    // Moisson de crise, et les compteurs d'Olympe gelés (profil biaisé).
    setState(farmState());
    stateModule.invalidateRenderCache("all");
    applyOfflineProgress(2 * 3600);
    const latched = CRISIS_EVENTS.filter((e) => state.crisisThresholds[e.id]);
    expect(
      latched.length,
      `paliers encore latchés au retour en ligne : ${latched.map((e) => e.id).join(", ")}`
    ).toBe(0);
  });

  it("ne touche pas aux paliers d'un profil inéligible au farm hors-ligne", () => {
    // Chemin linéaire (pas d'auto-achat) : simulateAwayCrises sort tout de suite,
    // les paliers déjà franchis du cycle en cours doivent rester franchis.
    setState(farmState({ hephHeritage: false }));
    state.crisisThresholds = { _25: true };
    stateModule.invalidateRenderCache("all");
    applyOfflineProgress(2 * 3600);
    expect(state.crisisThresholds._25).toBe(true);
    expect(Boolean(state.crisisThresholds._50)).toBe(false);
  });
});
