"use strict";
// LES SUCCÈS (audit 2026-10-05, STEAM-9) : la liste (data/achievements.js), les
// conditions et le suivi (core/achievements.js), la sauvegarde (state.achievements,
// chronicleStats.collapses), le pont Steam du préload et l'export Steamworks.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  state, setState, hydrateState, defaultState, buildGrandResetState, GR_PERSISTENT_FIELDS
} from "../state.js";
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, ACHIEVEMENT_ID_RE } from "../../data/achievements.js";
import {
  checkAchievements, achievementMet, achievementList, syncSteamAchievements,
  isAchievementUnlocked, unlockedAchievementCount, ACHIEVEMENT_CUSTOM_IDS
} from "../achievements.js";
import { recordCollapse } from "../chronicleStats.js";
import { MYTHS } from "../../data/myths.js";
import { GRAND_RESET_MILESTONES } from "../mechanics/grandResetMilestones.js";
import { registerOutcomeFloats } from "../outcomeFloat.js";
import { eras } from "../../data/world.js";
import { AMOUREUX } from "../../data/faitsDiversAmoureux.js";
import { steamAchievementsJson, steamAchievementsCsv } from "../../data/achievementsExport.js";
import { D } from "../num.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const byId = (id) => ACHIEVEMENTS.find((a) => a.id === id);
const quiet = { announce: false };

let unregisterFloats = null;
beforeEach(() => {
  setState(hydrateState({}));
});
afterEach(() => {
  if (unregisterFloats) { unregisterFloats(); unregisterFloats = null; }
  delete globalThis.window;
  vi.restoreAllMocks();
});

describe("succès — la liste", () => {
  it("entre 50 et 80 succès, ids d'API Steam uniques, textes FR/EN, famille connue", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(50);
    expect(ACHIEVEMENTS.length).toBeLessThanOrEqual(80);
    const groups = new Set(ACHIEVEMENT_GROUPS.map((g) => g.id));
    const ids = new Set();
    for (const a of ACHIEVEMENTS) {
      expect(ACHIEVEMENT_ID_RE.test(a.id), a.id).toBe(true);
      expect(ids.has(a.id), `${a.id} en double`).toBe(false);
      ids.add(a.id);
      expect(groups.has(a.group), `${a.id} : famille ${a.group}`).toBe(true);
      for (const key of ["name", "desc"]) {
        expect(a[key].fr.trim().length, `${a.id}.${key}.fr`).toBeGreaterThan(0);
        expect(a[key].en.trim().length, `${a.id}.${key}.en`).toBeGreaterThan(0);
      }
    }
    // Chaque famille annoncée a au moins un succès.
    for (const g of groups) expect(ACHIEVEMENTS.some((a) => a.group === g), g).toBe(true);
  });

  it("chaque succès a une condition, et aucune condition n'est orpheline", () => {
    const sansNeed = ACHIEVEMENTS.filter((a) => !a.need).map((a) => a.id).sort();
    expect([...ACHIEVEMENT_CUSTOM_IDS].sort()).toEqual(sansNeed);
  });

  it("un succès par Mythe du jeu, et les sceaux portent les noms des sceaux", () => {
    const myths = ACHIEVEMENTS.filter((a) => a.need && a.need.myth).map((a) => a.need.myth).sort();
    expect(myths).toEqual(MYTHS.map((m) => m.id).sort());
    const seals = ACHIEVEMENTS.filter((a) => a.need && a.need.seal != null);
    expect(seals.map((a) => a.need.seal)).toEqual(GRAND_RESET_MILESTONES.map((m) => m.gr));
    for (const a of seals) {
      const m = GRAND_RESET_MILESTONES.find((x) => x.gr === a.need.seal);
      expect(a.name).toEqual(m.name);
      expect(a.secret).toBe(true); // le jeu masque un sceau tant qu'il n'est pas découvert
    }
  });

  it("les paliers d'ère existent, et les transcendants visent des paliers MAJEURS", () => {
    for (const a of ACHIEVEMENTS.filter((x) => x.need && x.need.era != null)) {
      const index = eras.findIndex((e) => e.tier === a.need.era);
      expect(index, a.id).toBeGreaterThanOrEqual(0);
      // Le premier index d'un palier est sa vraie ère, jamais une « factice » (« … · II »).
      expect(String(eras[index].name).includes(" · "), a.id).toBe(false);
    }
  });
});

describe("succès — déblocage", () => {
  it("partie neuve : rien n'est débloqué", () => {
    expect(checkAchievements(quiet)).toEqual([]);
    expect(state.achievements).toEqual({});
    expect(unlockedAchievementCount()).toBe(0);
  });

  it("débloque, horodate, puis ne redébloque jamais", () => {
    state.chronicleStats.collapses = 10;
    const fresh = checkAchievements({ ...quiet, now: 1234 });
    expect(fresh).toContain("CHUTE_PREMIERE");
    expect(fresh).toContain("CHUTE_10");
    expect(fresh).not.toContain("CHUTE_50");
    expect(state.achievements.CHUTE_10).toBe(1234);
    expect(isAchievementUnlocked("CHUTE_10")).toBe(true);
    expect(checkAchievements(quiet)).toEqual([]);
    // Un succès ne se reperd pas, même si la condition retombe.
    state.chronicleStats.collapses = 0;
    expect(checkAchievements(quiet)).toEqual([]);
    expect(isAchievementUnlocked("CHUTE_10")).toBe(true);
  });

  it("les familles : ère, sceau, tous les sceaux, Mythe", () => {
    state.bestEraIndex = 19;
    state.grClaimed = { 3: true };
    state.mythsCompleted = { mythe_d_atlas: true };
    const fresh = checkAchievements(quiet);
    expect(fresh).toEqual(expect.arrayContaining(["ERE_HAMEAU", "ERE_ROYAUME", "SCEAU_III", "MYTHE_ATLAS"]));
    expect(fresh).not.toContain("ERE_EMPIRE");
    expect(fresh).not.toContain("SCEAUX_TOUS");
    for (let gr = 1; gr <= 11; gr += 1) state.grClaimed[gr] = true;
    expect(checkAchievements(quiet)).toContain("SCEAUX_TOUS");
  });

  it("une ère transcendante « factice » ne vaut pas le palier majeur", () => {
    const firstMajor = eras.findIndex((e) => e.tier === 35);
    state.bestEraIndex = firstMajor - 1; // dernière factice sous la Conscience planétaire
    expect(achievementMet(byId("ERE_CONSCIENCE"))).toBe(false);
    expect(achievementMet(byId("ERE_SINGULARITE"))).toBe(true);
    state.bestEraIndex = firstMajor;
    expect(achievementMet(byId("ERE_CONSCIENCE"))).toBe(true);
  });

  it("conditions écrites à la main : merveilles, Rayonnement, Maison, Atlas, temps, Nancy et William", () => {
    state.wonderTiers = { dynasty1: 5 };
    state.cyclePeaks.population = D("1e100");
    state.maisonRank = 4;
    state.atlasCrushed = true;
    state.chronicleStats.lifetimePlaySec = 36000;
    state.chronicleStats.games.osselets.dog = 1;
    state.faitsDivers.lovers.step = AMOUREUX.steps.findIndex((s) => s.where === "mariage") + 1;
    const fresh = checkAchievements(quiet);
    expect(fresh).toEqual(expect.arrayContaining([
      "MERVEILLE_PREMIERE", "MERVEILLE_RANG_V", "RAYONNEMENT_GOGOL",
      "MAISON_FAMILIER", "MAISON_MECENE", "MAISON_PRINCE", "CIEL_TOMBE",
      "TEMPS_UNE_HEURE", "TEMPS_DIX_HEURES", "OSSELETS_CHIEN", "FD_AMOUREUX"
    ]));
    expect(fresh).not.toContain("MERVEILLES_TOUTES");
    expect(fresh).not.toContain("TEMPS_CENT_HEURES");
  });

  it("trois crises stabilisées : dès la troisième du cycle, sans attendre la chute qui grave le record", () => {
    state.cycleCrisesResolved = 2;
    expect(achievementMet(byId("CRISES_TROIS"))).toBe(false);
    state.cycleCrisesResolved = 3;
    expect(checkAchievements(quiet)).toContain("CRISES_TROIS");
    // Le record à vie (gravé à la chute) suffit aussi, cycle en cours vierge.
    expect(achievementMet(byId("CRISES_TROIS"), { cycleCrisesResolved: 0, chronicleStats: { mostCrisesInCycle: 3 } })).toBe(true);
  });

  it("une condition ne jette jamais, même sur un état abîmé", () => {
    state.chronicleStats = null;
    state.wonderTiers = 5;
    state.faitsDivers = null;
    state.cyclePeaks = null;
    expect(() => checkAchievements(quiet)).not.toThrow();
    for (const a of ACHIEVEMENTS) expect(() => achievementMet(a, { })).not.toThrow();
  });

  it("pendant la chute (deuil, cinématique), on attend la relecture suivante", () => {
    state.chronicleStats.collapses = 1;
    state.chute = true;
    expect(checkAchievements(quiet)).toEqual([]);
    state.chute = false;
    state.mourning = true;
    expect(checkAchievements(quiet)).toEqual([]);
    state.mourning = false;
    expect(checkAchievements(quiet)).toEqual(["CHUTE_PREMIERE"]);
  });
});

describe("succès — annonce", () => {
  it("un succès : son nom ; plusieurs d'un coup : UN toast et UNE ligne de journal", () => {
    const floats = [];
    unregisterFloats = registerOutcomeFloats((o) => floats.push(o));
    state.chronicleStats.collapses = 1;
    checkAchievements();
    expect(floats).toHaveLength(1);
    expect(floats[0].label).toContain("Tout ce qui s'élève");
    expect(floats[0].view).toBe("history");
    const before = state.history.length;
    state.chronicleStats.collapses = 100;
    state.chronicleStats.lifetimePlaySec = 3600;
    checkAchievements();
    expect(floats).toHaveLength(2);
    expect(floats[1].label).toMatch(/4/);
    expect(state.history.length).toBe(Math.min(48, before + 1));
  });
});

describe("succès — sauvegarde", () => {
  it("defaultState les porte, le Grand Reset les garde", () => {
    expect(defaultState().achievements).toEqual({});
    expect(GR_PERSISTENT_FIELDS).toContain("achievements");
    state.achievements = { CHUTE_PREMIERE: 42 };
    state.chronicleStats.collapses = 12;
    const fresh = buildGrandResetState(1);
    expect(fresh.achievements).toEqual({ CHUTE_PREMIERE: 42 });
    expect(fresh.chronicleStats.collapses).toBe(12);
  });

  it("hydratation : garde les succès (même d'une version future), jette les ids mal formés", () => {
    const hydrated = hydrateState({ achievements: { ERE_HAMEAU: 5, FUTUR_SUCCES: 9, "pas un id": 1, minuscule: 2, VOEU_TENU: "x" } });
    expect(hydrated.achievements).toEqual({ ERE_HAMEAU: 5, FUTUR_SUCCES: 9, VOEU_TENU: 0 });
    expect(hydrateState({ achievements: [1, 2] }).achievements).toEqual({});
    expect(hydrateState({}).achievements).toEqual({});
  });

  it("effondrements à vie : compté à chaque chute, semé pour une save d'avant le compteur", () => {
    recordCollapse({ ruinGain: 1 });
    recordCollapse({ ruinGain: 1 });
    expect(state.chronicleStats.collapses).toBe(2);
    // Save d'avant : `cycles` du Grand Reset en cours (+10 si le sceau I est réclamé).
    expect(hydrateState({ cycles: 7, chronicleStats: { lifetimePlaySec: 5 } }).chronicleStats.collapses).toBe(7);
    expect(hydrateState({ cycles: 7, grClaimed: { 1: true }, chronicleStats: {} }).chronicleStats.collapses).toBe(17);
    expect(hydrateState({ cycles: 2, grandResetCount: 1, chronicleStats: {} }).chronicleStats.collapses).toBe(12);
    // Compteur présent : jamais ressemé.
    expect(hydrateState({ cycles: 7, chronicleStats: { collapses: 3 } }).chronicleStats.collapses).toBe(3);
    expect(hydrateState({ cycles: 7, chronicleStats: { collapses: null } }).chronicleStats.collapses).toBe(7);
  });
});

describe("succès — affichage", () => {
  it("un secret reste caché tant qu'il n'est ni débloqué ni révélé par le jeu", () => {
    const sealV = () => achievementList().find((a) => a.id === "SCEAU_V");
    expect(sealV().hidden).toBe(true);
    state.grRevealed = { 5: true };
    expect(sealV().hidden).toBe(false);
    expect(sealV().unlocked).toBe(false);
    const dog = () => achievementList().find((a) => a.id === "OSSELETS_CHIEN");
    expect(dog().hidden).toBe(true);
    state.chronicleStats.games.osselets.dog = 1;
    checkAchievements({ ...quiet, now: 77 });
    expect(dog()).toMatchObject({ hidden: false, unlocked: true, at: 77 });
    // Un succès non secret n'est jamais caché.
    expect(achievementList().find((a) => a.id === "ERE_EMPIRE").hidden).toBe(false);
  });
});

describe("succès — pont Steam (préload de l'.exe)", () => {
  it("chaque déblocage part vers Steam ; au lancement, toute la liste connue repart", () => {
    const unlock = vi.fn();
    globalThis.window = { civSteam: { unlock } };
    state.chronicleStats.collapses = 1;
    checkAchievements(quiet);
    expect(unlock).toHaveBeenLastCalledWith(["CHUTE_PREMIERE"]);
    state.achievements = { ...state.achievements, FUTUR_SUCCES: 1 };
    syncSteamAchievements();
    expect(unlock).toHaveBeenLastCalledWith(["CHUTE_PREMIERE"]); // l'id inconnu de cette version reste local
  });

  it("navigateur (pas de pont) ou pont qui casse : le jeu continue", () => {
    state.chronicleStats.collapses = 1;
    expect(checkAchievements(quiet)).toEqual(["CHUTE_PREMIERE"]);
    globalThis.window = { civSteam: { unlock: () => { throw new Error("ipc"); } } };
    state.chronicleStats.collapses = 10;
    expect(checkAchievements(quiet)).toEqual(["CHUTE_10"]);
    expect(() => syncSteamAchievements()).not.toThrow();
  });
});

describe("succès — export Steamworks", () => {
  it("docs/steam/succes.json et .csv suivent la liste (node scripts/exportSteamAchievements.mjs)", () => {
    const read = (file) => fs.readFileSync(path.join(ROOT, "docs", "steam", file), "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    expect(read("succes.json")).toBe(steamAchievementsJson());
    expect(read("succes.csv")).toBe(steamAchievementsCsv().replace(/^\uFEFF/, ""));
    const json = JSON.parse(read("succes.json"));
    expect(json.count).toBe(ACHIEVEMENTS.length);
    expect(json.achievements.filter((a) => a.hidden).map((a) => a.apiName))
      .toEqual(ACHIEVEMENTS.filter((a) => a.secret).map((a) => a.id));
  });
});
