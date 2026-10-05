import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { setLang, tr } from "../../core/i18n.js";
import { buildings } from "../../data/buildings.js";
import { CM, CM_WONDERS, cmRoadName } from "../layout.js";
import { CM_MAP_BUILDINGS } from "../cityBuildings.js";
import {
  CM_VARIANT_LABELS, cmVariantLabel, cmOfEn, CM_ROLES, CM_STREET_OF, CM_RESIDENCES,
} from "../cityNaming.js";
import { AGE_CONFIG } from "../procedural/ageVisualConfig.js";
import { VARIANTS_HOUSE } from "../procedural/buildingGenerator.js";
import { describePick, citizenSheet, focusCitizen, clearCitizenFocus, noteSceneFigure, focusPick } from "../citizenFocus.js";
import { buildingById } from "../../core/state.js";
// Pour son effet : publie CM.describeTile (le titre de l'infobulle d'une tuile).
import "../cityMapRuntime.js";

// AUDIT I18N-4 (2026-10-05) : l'infobulle de la carte était entièrement en
// français dans la version anglaise (types d'habitation, noms des moteurs,
// passants, véhicules, merveilles, rues), et une logique comparait le libellé
// affiché (`h.kind === "Émeute"`). Ce test balaie les tables { fr, en } et rend
// les infobulles avec setLang('en').

const isUnit = (u) => !!u && typeof u.fr === "string" && u.fr.length > 0 && typeof u.en === "string" && u.en.length > 0;

afterEach(() => { setLang("fr"); });

describe("types d'habitation et de district", () => {
  it("chaque libellé a son français et son anglais", () => {
    for (const [id, u] of Object.entries(CM_VARIANT_LABELS)) expect(isUnit(u), id).toBe(true);
  });
  it("chaque maison que le générateur pose a son libellé (pas le repli générique)", () => {
    for (const row of VARIANTS_HOUSE) {
      for (const list of [row.base, row.poor, row.rich]) {
        for (const v of list || []) expect(CM_VARIANT_LABELS[v], v).toBeTruthy();
      }
    }
  });
  it("suit la langue, replis compris", () => {
    expect(tr(cmVariantLabel("house", "hut"))).toBe("Cabane");
    setLang("en");
    expect(tr(cmVariantLabel("house", "hut"))).toBe("Hut");
    expect(tr(cmVariantLabel("house", "inconnu"))).toBe("Home");
    expect(tr(cmVariantLabel("district", "inconnu"))).toBe("Building");
    expect(tr(cmVariantLabel("district", "constructor"))).toBe("Building");
  });
});

describe("noms propres : seul le mot générique se traduit", () => {
  it("cmOfEn retire l'article français et garde le nom", () => {
    expect(cmOfEn("des Tanneurs")).toBe("Tanneurs");
    expect(cmOfEn("du Vieux Mur")).toBe("Vieux Mur");
    expect(cmOfEn("de la Colline")).toBe("Colline");
    expect(cmOfEn("de l'Aurore")).toBe("Aurore");
    for (const of of [...CM_STREET_OF, ...CM_RESIDENCES]) {
      const en = cmOfEn(of);
      expect(en.length, of).toBeGreaterThan(0);
      expect(en, of).not.toMatch(/^(?:de|du|des|la|l')[ ']/);
    }
  });

  it("une rue et une place : nom français intact, mot anglais derrière le nom propre", () => {
    CM.layout = {
      cx: 0, cy: 0, counts: { eraBand: 2 },
      roadMap: new Map([
        ["0,5", { gx: 0, gy: 5, rank: "secondary", mask: 0 }],
        ["3,3", { gx: 3, gy: 3, rank: "plaza", mask: 0 }],
      ]),
      plan: { plazas: [{ gx: 3, gy: 3, kind: "marche" }] },
    };
    const rueFr = cmRoadName(0, 5), placeFr = cmRoadName(3, 3);
    expect(rueFr).toMatch(/^(?:Rue|Ruelle) (?:des?|du|de la|de l') ?/);
    expect(placeFr).toMatch(/^(?:Place du Marché|Halles) /);
    setLang("en");
    const rueEn = cmRoadName(0, 5), placeEn = cmRoadName(3, 3);
    // Le complément français (« des Tanneurs ») devient « Tanneurs », devant le mot.
    const ofRue = rueFr.replace(/^(?:Rue|Ruelle) /, "");
    expect(rueEn).toBe(`${cmOfEn(ofRue)} ${rueFr.startsWith("Ruelle") ? "Alley" : "Street"}`);
    const ofPlace = placeFr.replace(/^(?:Place du Marché|Halles) /, "");
    expect(placeEn).toBe(`${cmOfEn(ofPlace)} ${placeFr.startsWith("Halles") ? "Market Hall" : "Market Square"}`);
    CM.layout = null;
  });
});

describe("rôles des passants", () => {
  it("chaque rôle (par âge et de repli) est une unité { fr, en }", () => {
    for (const cfg of AGE_CONFIG) {
      for (const r of cfg.citizenRoles) {
        expect(isUnit(r), `${cfg.id}: ${JSON.stringify(r)}`).toBe(true);
        expect(r.en).not.toBe(r.fr);
      }
    }
    for (const list of CM_ROLES) for (const r of list) expect(isUnit(r), JSON.stringify(r)).toBe(true);
  });
});

describe("bâtiments-moteur et merveilles", () => {
  it("le registre de la carte ne recopie plus les noms : il les lit dans buildings.js", () => {
    const byId = Object.fromEntries(buildings.map((b) => [b.id, b]));
    for (const meta of CM_MAP_BUILDINGS) {
      expect(meta.name, meta.id).toBeUndefined();
      expect(byId[meta.id] && byId[meta.id].name, meta.id).toBeTruthy();
    }
  });
  it("le titre d'un moteur est celui de la boutique ; un repère civique garde son titre générique", () => {
    const engine = { type: "engine", buildingId: "mint_houses", variant: "mint_houses", level: 3, groupTotal: 1, tier: 1 };
    // Pseudo-tuile de district (iso/isoDistricts.js) : elle EMPRUNTE le dessin
    // des tribunaux, elle n'en est pas — avant l'audit son titre était « Bâtiment ».
    const forum = { type: "engine", buildingId: "courthouses", __district: "forum", gx: 0, gy: 0 };
    const port = { type: "engine", buildingId: "river_ports", variant: "river_ports",
      buildingName: { fr: "Port de commerce", en: "Trade Port" }, level: 2, groupIndex: 2, groupTotal: 2, groupLevel: 2 };
    expect(CM.describeTile(engine)).toEqual({ title: "Hôtels des monnaies", body: "Niveau 3 · groupe de bâtiments" });
    expect(CM.describeTile(forum).title).toBe("Bâtiment");
    expect(CM.describeTile(port).title).toBe("Port de commerce");
    // localizeData aplatit buildings.js dans la langue du chargement : en anglais,
    // buildingById porte « Mints ». On le simule pour prouver que la carte le LIT.
    const b = buildingById.mint_houses, before = b.name;
    try {
      b.name = "Mints";
      setLang("en");
      expect(CM.describeTile(engine)).toEqual({ title: "Mints", body: "Level 3 · building cluster" });
      expect(CM.describeTile(forum).title).toBe("Building");
      expect(CM.describeTile(port)).toEqual({ title: "Trade Port", body: "Annex of the main building · level 2" });
    } finally { b.name = before; }
  });
  it("nom, condition et chaque jalon d'une merveille existent dans les deux langues", () => {
    for (const w of CM_WONDERS) {
      expect(isUnit(w.name), w.id).toBe(true);
      expect(isUnit(w.unlockedBy), w.id).toBe(true);
      for (const v of w.tiers) expect(isUnit(w.tierLabel(v)), `${w.id} ${v}`).toBe(true);
    }
  });
});

describe("infobulle des passants, véhicules et du bac (describePick)", () => {
  beforeEach(() => {
    clearCitizenFocus();
    CM.TILE = 20;
    CM.cam = { x: 0, y: 0, zoom: 1 };
    CM.cw = 800; CM.ch = 600;
    CM.nightF = 0; CM.rainF = 0;
    CM.rioters = [];
    CM.layout = { counts: { eraBand: 4 } };
    CM.tileGrid = new Map();
    CM.citizens = [];
  });

  it("en anglais : libellés traduits, catégorie stable dans kindId", () => {
    setLang("en");
    const boat = describePick({ kind: "boat", p: { kind: "ferry", id: 8, trip: 1, state: "cross" } });
    expect(boat.title).toBe("Ferry");
    expect(boat.kind).toBe("Boat");
    expect(boat.kindId).toBe("boat");
    expect(boat.body).toMatch(/^Ferryman: \S/);
    const cart = describePick({ kind: "vehicle", p: { type: "wagon", seed: 987654, x: 0, y: 0, dir: 0, gx: 0, gy: 0 } });
    expect(cart.title).toBe("Amphora cart");
    expect(cart.kind).toBe("Vehicle");
    expect(cart.kindId).toBe("vehicle");
    const p = {
      name: "Oda", seed: 42, fem: true, charType: 1, phase: 0.3, gx: 1, gy: 1, x: 20, y: 20, pauseT: 0, dir: 0,
      goalKind: "wander", role: { fr: "porte un panier", en: "carrying a basket" },
    };
    const who = describePick({ kind: "citizen", p });
    expect(who).toMatchObject({ title: "Oda", body: "carrying a basket", kind: "Inhabitant", kindId: "citizen" });
    // La fiche du même passant dit la même chose (plus de « Strolling » fixe).
    CM.citizens = [p];
    focusCitizen(p);
    expect(tr(citizenSheet().activity)).toBe("Carrying a basket");
  });

  it("en français : rien ne change, sauf les noms propres qui gardent leur majuscule", () => {
    const p = {
      name: "Oda", seed: 42, fem: true, charType: 1, phase: 0.3, gx: 1, gy: 1, x: 20, y: 20, pauseT: 0, dir: 0,
      goalKind: "wander", role: { fr: "porte un panier", en: "carrying a basket" },
    };
    expect(describePick({ kind: "citizen", p })).toMatchObject({ body: "porte un panier", kind: "Habitant", kindId: "citizen" });
    const w = { charType: 1, figSeed: 6, dir: 0 };
    noteSceneFigure(w, "navette", "anti-woman", 400, 300, { drawW: 20, drawH: 20, top: 282 });
    focusPick({ kind: "figure", p: w });
    expect(describePick({ kind: "figure", p: w }).body).toBe("attend la navette des Plaisirs");
    setLang("en");
    expect(describePick({ kind: "figure", p: w }).body).toBe("waiting for the shuttle");
  });
});

describe("aucune logique ne lit le libellé affiché", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const runtime = readFileSync(join(here, "..", "cityMapRuntime.js"), "utf8");
  const focus = readFileSync(join(here, "..", "citizenFocus.js"), "utf8");
  it("le curseur de l'émeute lit kindId, jamais kind", () => {
    expect(runtime).not.toMatch(/\.kind\s*===\s*["'](?:Émeute|Riot|Habitant|Inhabitant|Logement|Home|Bâtiment|Building|Voie|Road|Place|Square|Merveille|Wonder|Monument)["']/);
    expect(runtime).toMatch(/kindId === "riot"/);
    expect(runtime).toMatch(/kindId: "riot"/);
  });
  it("describePick ne force plus le français", () => {
    expect(focus).not.toMatch(/vehicleLabel\(p\)\.fr|activityOf\(p, false\)\.fr/);
  });
});
