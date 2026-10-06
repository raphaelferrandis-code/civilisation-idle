import { describe, it, expect, beforeEach } from "vitest";

import { CM } from "../layout.js";
import {
  focusCitizen, focusPick, releaseFocusCamera, resumeFocusCamera, clearCitizenFocus,
  focusCameraTarget, citizenSheet, onCitizenFocus, noteFigure, noteSceneFigure, citizenHoverTick,
  keepFigureAlive, FOCUS_TUNE, focusPortrait, portraitImgReady,
} from "../citizenFocus.js";
import {
  cmPasserbyName, CM_GIVEN_M, CM_GIVEN_F, CM_TRADES_F, CM_HOUSES,
} from "../cityNaming.js";

// FICHE D'HABITANT (Raph 2026-10-03 : « chaque pnj un personnage cliquable, une
// petite fiche générée et la caméra qui le suit »). Ce test pilote la logique
// pure de citizenFocus.js — désignation, protection contre le reflux de foule,
// relevé de la fiche — sans canvas : le clic et le rendu se vérifient en jeu.

function makeCitizen(name, extra = {}) {
  return {
    name, seed: 123456789, fem: false, charType: 0, phase: 0.3,
    gx: 4, gy: 4, x: 90, y: 90, lox: 2, loy: -1, pauseT: 0, dir: 0,
    home: null, work: null, goal: null, goalKind: "wander", role: "porte un panier",
    ...extra,
  };
}

beforeEach(() => {
  clearCitizenFocus();
  CM.TILE = 20;
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.zoomGoal = 1;
  CM.camGoal = null;
  CM.panVel = null;
  CM.nightF = 0;
  CM.rainF = 0;
  CM.healthF = 0.6;
  CM.rioters = [];
  CM.layout = { counts: { eraBand: 4 } };
  CM.tileGrid = new Map();
  CM.describeTile = (t) => ({ title: t.title });
  CM.citizens = [];
});

describe("cmPasserbyName — le nom s'accorde au portrait", () => {
  it("homme et femme tirent dans leur liste, l'enfant n'a ni épithète ni métier", () => {
    for (let s = 1; s < 400; s += 7) {
      expect(CM_GIVEN_M).toContain(cmPasserbyName(s, 0, false, false).split(" ")[0]);
      expect(CM_GIVEN_F).toContain(cmPasserbyName(s, 0, true, false).split(" ")[0]);
      // Âge des villages : la femme porte un métier féminin ou un lieu-dit.
      const f = cmPasserbyName(s, 2, true, false);
      expect(CM_TRADES_F.some((t) => f.endsWith(" " + t))).toBe(true);
      // L'enfant : prénom seul au camp, lieu-dit de la famille au village.
      expect(cmPasserbyName(s, 1, true, true).split(" ")).toHaveLength(1);
      expect(cmPasserbyName(s, 3, false, true)).toMatch(/ d/);
      // La ville : le nom de maison.
      expect(CM_HOUSES.some((h) => cmPasserbyName(s, 6, false, false).endsWith(" " + h))).toBe(true);
    }
  });
});

describe("focusCitizen — désigner et protéger", () => {
  it("met l'habitant en tête de liste et annule un départ déjà décidé", () => {
    const a = makeCitizen("A"), b = makeCitizen("B");
    const p = makeCitizen("P", { leaving: true, leaveCell: { gx: 1, gy: 1 }, goal: { gx: 1, gy: 1 }, goalKind: "leave" });
    CM.citizens = [a, b, p];
    focusCitizen(p);
    // cmRetireExcessCitizens marque la QUEUE de la liste : en tête, il est à l'abri.
    expect(CM.citizens[0]).toBe(p);
    expect(CM.citizens).toHaveLength(3);
    expect(p.leaving).toBe(false);
    expect(p.leaveCell).toBe(null);
    expect(p.goal).toBe(null);
    expect(CM.focus).toEqual({ p, kind: "citizen", cam: true });
  });

  it("rapproche la caméra au cran visé, sans jamais l'éloigner", () => {
    const p = makeCitizen("P");
    CM.citizens = [p];
    focusCitizen(p);
    expect(CM.zoomGoal).toBe(FOCUS_TUNE.zoom);
    CM.zoomGoal = 3;
    focusCitizen(p);
    expect(CM.zoomGoal).toBe(3);
  });

  it("la caméra vise ses pieds (trottoir compris) tant que le suivi tourne", () => {
    const p = makeCitizen("P");
    CM.citizens = [p];
    focusCitizen(p);
    expect(focusCameraTarget()).toEqual({ x: 92, y: 89 });
    releaseFocusCamera();
    expect(focusCameraTarget()).toBe(null);
    expect(CM.focus.p).toBe(p);          // la fiche reste ouverte
    resumeFocusCamera();
    expect(focusCameraTarget()).toEqual({ x: 92, y: 89 });
  });

  it("prévient ses abonnés à chaque changement", () => {
    const p = makeCitizen("P");
    CM.citizens = [p];
    const seen = [];
    const off = onCitizenFocus((q) => seen.push(q ? q.name : null));
    focusCitizen(p);
    releaseFocusCamera();
    clearCitizenFocus();
    off();
    expect(seen).toEqual(["P", "P", null]);
  });
});

describe("citizenSheet — la fiche", () => {
  it("est déterministe : même habitant, même âge, même caractère", () => {
    const p = makeCitizen("P", { fem: true, charType: 1 });
    CM.citizens = [p];
    focusCitizen(p);
    const s1 = citizenSheet(), s2 = citizenSheet();
    expect(s1.kind).toBe("woman");
    expect(s1.age).toBe(s2.age);
    expect(s1.age).toBeGreaterThanOrEqual(18);
    expect(s1.age).toBeLessThanOrEqual(66);
    expect(s1.traits[0].fr).not.toBe(s1.traits[1].fr);
    expect(s1.traits).toEqual(s2.traits);
  });

  it("un enfant a entre 4 et 13 ans", () => {
    for (let seed = 1; seed < 2000; seed += 97) {
      const p = makeCitizen("E", { charType: 2, seed });
      CM.citizens = [p];
      focusCitizen(p);
      const { age, kind } = citizenSheet();
      expect(kind).toBe("child");
      expect(age).toBeGreaterThanOrEqual(4);
      expect(age).toBeLessThanOrEqual(13);
    }
  });

  it("dit ce qu'il fait : travail, sommeil, causette en compagnie", () => {
    const p = makeCitizen("P", { goalKind: "work" });
    CM.citizens = [p];
    focusCitizen(p);
    expect(citizenSheet().activity.fr).toBe("Va au travail");
    p._nightHidden = true; CM.nightF = 1;
    expect(citizenSheet().activity.fr).toBe("Dort");
    p._nightHidden = false; CM.nightF = 0;
    // Compagnon : la ligne « Avec » nomme le meneur, l'activité est LEUR but.
    const lead = makeCitizen("Meneur", { goalKind: "home" });
    p.lead = lead;
    CM.citizens = [p, lead];
    const s = citizenSheet();
    expect(s.companion).toBe("Meneur");
    expect(s.activity.fr).toBe("Rentre au logis");
    lead.chatT = 3;
    expect(citizenSheet().activity.fr).toBe("Fait la causette");
  });

  it("nomme son logis d'après la tuile qui occupe AUJOURD'HUI son ancre", () => {
    const old = { gx: 3, gy: 4, title: "Cabane d'Oda" };
    const p = makeCitizen("P", { home: { gx: 3, gy: 5, t: old } });
    CM.citizens = [p];
    focusCitizen(p);
    expect(citizenSheet().home).toBe("Cabane d'Oda");
    CM.tileGrid.set("3,4", { gx: 3, gy: 4, title: "Longue maison d'Oda" });
    expect(citizenSheet().home).toBe("Longue maison d'Oda");
  });

  it("l'émeute assombrit l'humeur", () => {
    const p = makeCitizen("P");
    CM.citizens = [p];
    focusCitizen(p);
    CM.healthF = 0.95;
    const calme = citizenSheet().mood.fr;
    CM.healthF = 0.2;
    CM.rioters = [{}];
    expect(citizenSheet().mood.fr).toBe("En colère");
    expect(calme).not.toBe("En colère");
  });

  it("promeneur du quai : une identité posée une fois, son compagnon nommé, parti quand on ne le peint plus", () => {
    const a = { x: 50, y: 50, dir: 0, pauseT: 0, phase: 0.42, charType: 0, skinVariant: 3, scene: "quai" };
    const b = { x: 52, y: 50, dir: 0, pauseT: 0, phase: 0.77, charType: 0, skinVariant: 5, scene: "quai" };
    a.mate = b; b.mate = a;
    noteFigure(a);
    focusPick({ kind: "figure", p: a });
    const nom = a.persona.name;
    expect(CM_GIVEN_M).toContain(nom.split(" ")[0]);
    const s = citizenSheet();
    expect(s.activity.fr).toBe("Flâne sur le quai");
    expect(s.companion).toBe(b.persona.name);
    expect(s.home).toBe(null);
    a.pauseT = 1;
    expect(citizenSheet().activity.fr).toBe("Regarde l'eau");
    focusPick({ kind: "figure", p: a });
    expect(a.persona.name).toBe(nom);               // l'identité ne se retire pas
    // Plus peint pendant ~3 s de frames : il a quitté la scène.
    for (let i = 0; i < 95; i += 1) citizenHoverTick(i * 100);
    expect(citizenSheet().lost).toBe(true);
    expect(focusCameraTarget()).toBe(null);
  });

  it("véhicule : nom d'époque, conducteur, chargement ou voyageurs, caméra sur sa file", () => {
    CM.layout = { counts: { eraBand: 4 } };
    const v = { type: "wagon", seed: 987654, x: 100, y: 60, dir: 0, gx: 3, gy: 1, speed: 14 };
    CM.vehicles = [v];
    focusPick({ kind: "vehicle", p: v });
    let s = citizenSheet();
    expect(s.kind).toBe("vehicle");
    expect(s.name.fr).toBe("Chariot à amphores");
    expect(s.driver).toBeTruthy();
    expect(s.cargo.fr).toMatch(/Amphores/);
    expect(focusCameraTarget()).not.toBe(null);
    const tram = { type: "tram", skin: "cos7", seed: 42, x: 0, y: 0, dir: 2, gx: 0, gy: 0, speed: 30 };
    CM.vehicles = [tram];
    focusPick({ kind: "vehicle", p: tram });
    s = citizenSheet();
    expect(s.name.fr).toBe("Tram magnétique");
    expect(s.riders).toBeGreaterThan(0);
    CM.vehicles = [];
    expect(citizenSheet().lost).toBe(true);
  });

  it("pont : le pêcheur pêche, l'accoudé regarde le fleuve", () => {
    CM.cw = 800; CM.ch = 600;
    const fisher = { charType: 0, fisher: true, figSeed: 5, dir: 0 };
    noteSceneFigure(fisher, "pont", "medieval-man", 400, 300, { drawW: 20, drawH: 20, top: 282 });
    focusPick({ kind: "figure", p: fisher });
    expect(citizenSheet().activity.fr).toBe("Pêche à la ligne");
    const idler = { charType: 1, fisher: false, figSeed: 6, dir: 0 };
    noteSceneFigure(idler, "pont", "medieval-woman", 420, 300, { drawW: 20, drawH: 20, top: 282 });
    focusPick({ kind: "figure", p: idler });
    const s = citizenSheet();
    expect(s.activity.fr).toBe("Regarde le fleuve");
    expect(s.kind).toBe("woman");
  });

  it("voyageur du bac : il attend, monte à bord (la caméra suit le bac), débarque", () => {
    CM.cw = 800; CM.ch = 600;
    const sh = { kind: "ferry", id: 3, trip: 5, state: "board" };
    CM.ships = [sh];
    const q = { charType: 1, figSeed: 99, ferryShip: sh, trip: 5, dir: 0 };
    noteSceneFigure(q, "bac", "medieval-woman", 400, 300, { drawW: 20, drawH: 20, top: 282 });
    focusPick({ kind: "figure", p: q });
    expect(citizenSheet().activity.fr).toBe("Attend le bac");
    // Le bac accoste à son embarcadère : à bord, plus dessiné mais pas parti.
    sh.trip = 6;
    sh._hull = { wx: 10, wy: 20, bx: 0, by: 0, dw: 32, img: null };
    for (let i = 0; i < 95; i += 1) citizenHoverTick(i * 100);
    let s = citizenSheet();
    expect(s.lost).toBe(false);
    expect(s.activity.fr).toBe("Monte à bord");
    expect(focusCameraTarget()).toEqual({ x: 10, y: 20 });
    sh.state = "cross";
    expect(citizenSheet().activity.fr).toBe("Traverse en bac");
    // Il accoste en face : débarqué.
    sh.trip = 7;
    s = citizenSheet();
    expect(s.lost).toBe(true);
    expect(s.activity.fr).toBe("A débarqué sur l'autre rive");
  });

  it("voyageur qu'on voit descendre : il débarque, puis il est parti ; la navette emmène les siens", () => {
    CM.cw = 800; CM.ch = 600;
    const sh = { kind: "ferry", id: 4, trip: 9, state: "board" };
    CM.ships = [sh];
    const q = { charType: 0, figSeed: 5, ferryShip: sh, trip: 7, dir: 0 };
    const box = { drawW: 20, drawH: 20, top: 282 };
    noteSceneFigure(q, "bac", "anti-man", 400, 300, box);
    focusPick({ kind: "figure", p: q });
    let s = citizenSheet();
    expect(s.lost).toBe(false);
    expect(s.activity.fr).toBe("Débarque");
    for (let i = 0; i < 12; i += 1) citizenHoverTick(30000 + i * 100);
    s = citizenSheet();
    expect(s.lost).toBe(true);
    expect(s.activity.fr).toBe("A débarqué sur l'autre rive");
    // La navette des Plaisirs : on l'attend, puis elle l'emmène.
    const w = { charType: 1, figSeed: 6, sceneTag: "navette", dir: 0 };
    noteSceneFigure(w, "navette", "anti-woman", 400, 300, box);
    focusPick({ kind: "figure", p: w });
    expect(citizenSheet().activity.fr).toBe("Attend la navette des Plaisirs");
    for (let i = 0; i < 95; i += 1) citizenHoverTick(40000 + i * 100);
    expect(citizenSheet().activity.fr).toBe("Parti pour la Maison des Plaisirs");
  });

  it("le bac : son passeur, ses voyageurs à bord, ses traversées", () => {
    const sh = { kind: "ferry", id: 8, trip: 7, state: "cross", _parties: { 6: 2 } };
    CM.ships = [sh];
    focusPick({ kind: "boat", p: sh });
    const s = citizenSheet();
    expect(s.name.fr).toBe("Bac");
    expect(s.driver).toBeTruthy();
    expect(s.driverLabel.fr).toBe("Passeur");
    expect(s.riders).toBe(2);
    expect(s.crossings).toBe(7);
    expect(s.activity.fr).toBe("Traverse le fleuve");
    CM.ships = [];
    expect(citizenSheet().lost).toBe(true);
  });

  // BUG-87 (audit du 2026-10-05) : la coque du kit est un CANVAS cuit, sans
  // `complete` ni `naturalWidth` — la fiche du bac gardait sa niche vide.
  it("le bac : son portrait est sa coque cuite, un canvas prêt à peindre", () => {
    // Canvas SERRÉ (PERF-36) : la coque 63 × 23, plus une colonne et une rangée vides.
    const hull = { width: 64, height: 24, getContext: () => null };
    const sh = { kind: "ferry", id: 9, trip: 1, state: "cross", _hull: { img: hull, bx: 5, by: 7, dw: 32, dh: 12, iw: 63, ih: 23, wx: 10, wy: 10 } };
    CM.ships = [sh];
    focusPick({ kind: "boat", p: sh });
    const fr = focusPortrait(0);
    expect(fr.img).toBe(hull);
    // L'encre en px (fh = 1) : toute la coque, sans la marge — et pas repliée en deux
    // « frames » comme le ferait la boîte d'encre d'une planche (64 de large pour 24).
    expect(fr.fh).toBe(1);
    expect(fr.ink).toEqual({ l: 0, t: 0, r: 63, b: 23 });
    expect(portraitImgReady(fr.img)).toBe(true);
    // Les images, elles, attendent d'être décodées ; un canvas vide ne peint rien.
    expect(portraitImgReady({ complete: false, naturalWidth: 0 })).toBe(false);
    expect(portraitImgReady({ complete: true, naturalWidth: 68 })).toBe(true);
    expect(portraitImgReady({ width: 0, height: 0, getContext: () => null })).toBe(false);
    expect(portraitImgReady(null)).toBe(false);
    CM.ships = [];
  });

  it("porteur, passant de place, laboureur : activité de leur scène, travail lu sur leur bâtiment", () => {
    CM.cw = 800; CM.ch = 600;
    CM.tileGrid.set("4,7", { gx: 4, gy: 7, title: "Port fluvial" });
    CM.tileGrid.set("9,2", { gx: 9, gy: 2, title: "Champs irrigués" });
    const box = { drawW: 20, drawH: 20, top: 282 };
    const porter = { charType: 0, figSeed: 11, dir: 0, walking: true, carry: true, workKey: "4,7" };
    noteSceneFigure(porter, "port", "anti-man", 400, 300, box);
    focusPick({ kind: "figure", p: porter });
    let s = citizenSheet();
    expect(s.activity.fr).toBe("Décharge le bateau");
    expect(s.work).toBe("Port fluvial");
    porter.carry = false;
    expect(citizenSheet().activity.fr).toBe("Retourne au bateau");
    // Sur la place, `name` est le nom de la BANDE : l'identité ne l'écrase pas.
    const buyer = { name: "medieval-woman", charType: 1, figSeed: 12, dir: 0, stall: true };
    noteSceneFigure(buyer, "place", buyer.name, 400, 300, box);
    focusPick({ kind: "figure", p: buyer });
    s = citizenSheet();
    expect(buyer.name).toBe("medieval-woman");
    expect(s.name).not.toBe("medieval-woman");
    expect(CM_GIVEN_F).toContain(s.name.split(" ")[0]);
    expect(s.activity.fr).toBe("Regarde les étals");
    const farmer = { charType: 0, figSeed: 13, dir: 0, walking: true, workKey: "9,2" };
    noteSceneFigure(farmer, "champ", "medieval-man", 400, 300, box);
    focusPick({ kind: "figure", p: farmer });
    s = citizenSheet();
    expect(s.activity.fr).toBe("Laboure son champ");
    expect(s.work).toBe("Champs irrigués");
  });

  it("Maison des Plaisirs : la même fille, nom de scène fixe, jamais perdue derrière la rotonde", () => {
    const g = {
      scene: "plaisirs", slot: 2, stageName: "Linnea la Vive", charType: 1, figSeed: 77,
      workLabel: { fr: "Courtisane · Maison des Plaisirs", en: "Courtesan · House of Pleasures" },
    };
    keepFigureAlive(g);
    focusPick({ kind: "figure", p: g });
    let s = citizenSheet();
    expect(s.name).toBe("Linnea la Vive");
    expect(s.kind).toBe("woman");
    expect(s.work.fr).toBe("Courtisane · Maison des Plaisirs");
    expect(s.activity.fr).toBe("Accueille sous la marquise");
    // Cachée derrière la rotonde (plus peinte), mais la maison la déclare : là.
    for (let i = 0; i < 120; i += 1) { citizenHoverTick(i * 100); keepFigureAlive(g); }
    s = citizenSheet();
    expect(s.lost).toBe(false);
    // Le nom ne change pas d'un âge à l'autre.
    CM.layout = { counts: { eraBand: 8 } };
    expect(citizenSheet().name).toBe("Linnea la Vive");
    // Plus de maison depuis ~3 s : partie.
    for (let i = 0; i < 95; i += 1) citizenHoverTick(20000 + i * 100);
    expect(citizenSheet().lost).toBe(true);
  });

  it("parti de la rue (liste vidée) : la fiche le dit et la caméra le lâche", () => {
    const p = makeCitizen("P");
    CM.citizens = [p];
    focusCitizen(p);
    CM.citizens = [];
    const s = citizenSheet();
    expect(s.lost).toBe(true);
    expect(s.following).toBe(false);
    expect(s.activity.fr).toBe("A quitté la rue");
    expect(focusCameraTarget()).toBe(null);
  });
});
