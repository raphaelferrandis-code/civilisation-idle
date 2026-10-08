"use strict";
// LA NUIT DU GRAND JEU, LE SPECTACLE, LE DUEL DES GRANDS FLAMBEURS ET LES COURSES
// (2026-10-04, docs/PLAN-NUIT-DES-PLAISIRS.md).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, CURRENT_SAVE_VERSION, GR_PERSISTENT_FIELDS } from "../state.js";
import {
  tickNuit, ouvrirNuit, nuitActive, nuitResteMin, flambeurDeLaNuit, FLAMBEURS,
  lancerSpectacle, spectaclePret, spectacleActif, spectacleCout
} from "../actions/nuitGrandJeu.js";
import { jouerDuel, duelOuvert, duelMiseMin, FACES } from "../actions/duel.js";
import { coursePartants, lancerCourse, coursesUnlocked, coteExacte, coteAffichee, parisTotal } from "../actions/courses.js";
import { recettesPerHour, potCap, tableLimits } from "../actions/maisonTable.js";
import { recordWager, maisonReputation } from "../actions/maisonRang.js";
import { rouletteUnlocked, rouletteVipUnlocked } from "../actions/roulette.js";
import { trunkValue, collectTrunk } from "../actions/offeringTrunk.js";
import {
  NUIT_INTERVAL_H, NUIT_PREMIERE_H, NUIT_DUREE_MIN, NUIT_POT_H, SPECTACLE_DUREE_MIN, SPECTACLE_REPOS_MIN,
  SPECTACLE_AFFLUENCE, DUEL_RTP, COURSES_RTP, COURSES_PROFILS, COURSES_PARTANTS
} from "../balance.js";
import { seededRng } from "../utils.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const H = 3600 * 1000, MIN = 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = 10;
  state.maisonRank = 0;
  state.maisonReputation = 0;
  state.faveur = 1e12;
  state.icarusPotFaveur = 0;
  state.nuitDebut = 0;
  state.nuitProchaine = 0;
  state.spectacleDebut = 0;
  state.spectacleFin = 0;
  invalidateRenderCache("all");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("La Nuit du Grand Jeu", () => {
  it("la première s'ouvre une heure après qu'on la découvre, puis toutes les trois heures", () => {
    expect(tickNuit()).toBe(false); // fixe la première
    expect(state.nuitProchaine).toBe(FIXED_NOW + NUIT_PREMIERE_H * H);
    vi.setSystemTime(FIXED_NOW + NUIT_PREMIERE_H * H - 1);
    expect(tickNuit()).toBe(false);
    vi.setSystemTime(FIXED_NOW + NUIT_PREMIERE_H * H);
    expect(tickNuit()).toBe(true);
    expect(nuitActive()).toBe(true);
    expect(nuitResteMin()).toBe(NUIT_DUREE_MIN);
    const debut = state.nuitDebut;
    expect(state.nuitProchaine).toBe(debut + NUIT_DUREE_MIN * MIN + NUIT_INTERVAL_H * H);
    vi.setSystemTime(debut + NUIT_DUREE_MIN * MIN);
    expect(nuitActive()).toBe(false);
    expect(tickNuit()).toBe(false);
  });

  it("à l'ouverture : la cagnotte, un tour de roue, la troupe toute la nuit, le flambeur, la Chronique", () => {
    state.roueAt = FIXED_NOW - 1000;
    const info = ouvrirNuit();
    expect(state.icarusPotFaveur).toBe(Math.min(potCap(), NUIT_POT_H * recettesPerHour()));
    expect(info.verse).toBe(state.icarusPotFaveur);
    expect(state.roueAt).toBe(0);
    expect(spectacleActif()).toBe(true);
    expect(state.spectacleFin).toBe(FIXED_NOW + NUIT_DUREE_MIN * MIN);
    expect(FLAMBEURS).toContain(flambeurDeLaNuit());
    expect(state.history.some((l) => l.includes("Nuit du Grand Jeu"))).toBe(true);
  });

  it("toutes les portes s'ouvrent, et la réputation compte double", () => {
    expect(rouletteUnlocked()).toBe(false);
    expect(rouletteVipUnlocked()).toBe(false);
    expect(coursesUnlocked()).toBe(false);
    expect(duelOuvert()).toBe(false);
    const simple = recordWager(1e6, 0.97);
    ouvrirNuit();
    expect(rouletteUnlocked()).toBe(true);
    expect(rouletteVipUnlocked()).toBe(true);
    expect(coursesUnlocked()).toBe(true);
    expect(duelOuvert()).toBe(true);
    const avant = maisonReputation();
    expect(recordWager(1e6, 0.97)).toBeCloseTo(2 * simple, 12);
    expect(maisonReputation()).toBeCloseTo(avant + 2 * simple, 12);
  });

  it("la salle pleine : la caisse se remplit deux fois plus vite pendant la Nuit, pas avant", () => {
    collectTrunk({ silent: true, render: false }); // la caisse repart de zéro
    vi.setSystemTime(FIXED_NOW + 5 * MIN);
    const avant = trunkValue();
    expect(avant).toBeCloseTo((5 * 60 * recettesPerHour()) / 3600, 6);
    ouvrirNuit();
    vi.setSystemTime(FIXED_NOW + 10 * MIN); // 5 min de nuit
    expect(trunkValue()).toBeCloseTo(avant + ((5 * 60 * SPECTACLE_AFFLUENCE * recettesPerHour()) / 3600), 6);
  });

  it("la Nuit survit à la sauvegarde", () => {
    ouvrirNuit();
    const s = hydrateState({ ...JSON.parse(JSON.stringify(state)), saveVersion: CURRENT_SAVE_VERSION });
    expect(s.nuitDebut).toBe(state.nuitDebut);
    expect(s.nuitProchaine).toBe(state.nuitProchaine);
    expect(s.spectacleFin).toBe(state.spectacleFin);
  });

  it("son horloge traverse le Grand Reset (la Nuit en cours, non)", () => {
    expect(GR_PERSISTENT_FIELDS).toEqual(expect.arrayContaining(["nuitProchaine", "nuitCompte"]));
    expect(GR_PERSISTENT_FIELDS).not.toContain("nuitDebut");
  });
});

describe("Le spectacle", () => {
  it("se paie, remplit la salle, puis la troupe se repose", () => {
    expect(spectaclePret()).toBe(true);
    const cout = spectacleCout();
    expect(cout).toBe(Math.round(0.25 * recettesPerHour()));
    const f0 = state.faveur;
    expect(lancerSpectacle()).toMatchObject({ cout });
    expect(state.faveur).toBe(f0 - cout);
    expect(spectacleActif()).toBe(true);
    expect(spectaclePret()).toBe(false);
    expect(lancerSpectacle()).toBeNull();
    vi.setSystemTime(FIXED_NOW + SPECTACLE_DUREE_MIN * MIN);
    expect(spectacleActif()).toBe(false);
    expect(spectaclePret()).toBe(false); // la troupe se repose
    vi.setSystemTime(FIXED_NOW + (SPECTACLE_DUREE_MIN + SPECTACLE_REPOS_MIN) * MIN);
    expect(spectaclePret()).toBe(true);
  });

  it("refusé sans la Faveur de la troupe", () => {
    state.faveur = spectacleCout() - 1;
    expect(lancerSpectacle()).toBeNull();
    expect(spectacleActif()).toBe(false);
  });
});

describe("Le duel des grands flambeurs", () => {
  it("fermé hors de la Nuit (sauf pour un Prince), et pas pour une petite mise", () => {
    expect(jouerDuel(duelMiseMin(), { silent: true, render: false })).toBeNull();
    state.maisonRank = 4;
    expect(duelOuvert()).toBe(true);
    state.maisonRank = 0;
    ouvrirNuit();
    expect(duelMiseMin()).toBe(Math.round(recettesPerHour()));
    expect(jouerDuel(duelMiseMin() - 1, { silent: true, render: false })).toBeNull();
    expect(jouerDuel(state.faveur + 1, { silent: true, render: false })).toBeNull();
  });

  it("au meilleur des trois manches, les mêmes dés des deux côtés ; le vainqueur prend 97 % du pot", () => {
    ouvrirNuit();
    const mise = duelMiseMin() * 5;
    const f0 = state.faveur;
    const r = jouerDuel(mise, { silent: true, render: false });
    const gagnees = (qui) => r.manches.filter((m) => m.gagnant === qui).length;
    expect(Math.max(gagnees("joueur"), gagnees("flambeur"))).toBe(2);
    expect(Math.min(gagnees("joueur"), gagnees("flambeur"))).toBeLessThanOrEqual(1);
    for (const m of r.manches) {
      expect(m.joueur.every((v) => FACES.includes(v))).toBe(true);
      expect(m.flambeur.every((v) => FACES.includes(v))).toBe(true);
      const sj = m.joueur.reduce((a, b) => a + b, 0), sf = m.flambeur.reduce((a, b) => a + b, 0);
      expect(m.gagnant).toBe(sj > sf ? "joueur" : sf > sj ? "flambeur" : null);
    }
    expect(r.gagne).toBe(gagnees("joueur") === 2);
    expect(state.faveur).toBe(f0 - mise + r.gain);
    if (r.gagne) expect(Math.abs(r.gain - 2 * mise * DUEL_RTP)).toBeLessThanOrEqual(1);
    else expect(r.gain).toBe(0);
  });

  it("Monte-Carlo : 97 % sur la durée", () => {
    ouvrirNuit();
    const mise = duelMiseMin();
    let mis = 0, rendu = 0;
    for (let i = 0; i < 20000; i += 1) {
      const r = jouerDuel(mise, { silent: true, render: false });
      mis += mise;
      rendu += r.gain;
    }
    expect(rendu / mis).toBeGreaterThan(DUEL_RTP - 0.03);
    expect(rendu / mis).toBeLessThan(DUEL_RTP + 0.03);
  });
});

describe("Les courses", () => {
  it("six partants, des chances qui font 1, des cotes à 95 %", () => {
    for (const profil of COURSES_PROFILS) expect(profil.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const p = coursePartants();
    expect(p).toHaveLength(COURSES_PARTANTS);
    expect(p.reduce((a, x) => a + x.p, 0)).toBeCloseTo(1, 12);
    for (const x of p) {
      expect(coteExacte(x.p) * x.p).toBeCloseTo(COURSES_RTP, 12);
      expect(coteAffichee(x.p)).toBeLessThanOrEqual(coteExacte(x.p));
    }
    // La même course attend tant qu'on n'a pas couru.
    expect(coursePartants()).toBe(p);
  });

  it("une course abîmée (couloirs hors de leur place) est retirée", () => {
    // Les couloirs 1 à 6 (et non 0 à 5) faisaient planter la vue des courses : le 6e
    // n'a pas de casaque.
    const noms = ["Aquilon", "Borée", "Zéphyr", "Notos", "Euros", "Lips"];
    state.courseField = [0.3, 0.2, 0.15, 0.15, 0.1, 0.1].map((p, i) => ({ couloir: i + 1, nom: noms[i], p }));
    const p = coursePartants();
    expect(p.map((x) => x.couloir)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(state.courseField).toBe(p);
  });

  it("au titre de Notable : la course paie le gagnant, l'arrivée est un ordre complet", () => {
    expect(lancerCourse({ 0: 1000 }, { silent: true, render: false })).toBeNull();
    state.maisonRank = 2;
    const p = coursePartants();
    const f0 = state.faveur;
    const r = lancerCourse({ 0: 1000, 3: 2000 }, { silent: true, render: false });
    expect(r.total).toBe(3000);
    expect([...r.ordre].sort()).toEqual(p.map((x) => x.couloir).sort());
    expect(r.ordre[0]).toBe(r.gagnant);
    const mise = r.paris[r.gagnant] || 0;
    const pw = p.find((x) => x.couloir === r.gagnant).p;
    expect(Math.abs(r.gain - mise * coteExacte(pw))).toBeLessThanOrEqual(1);
    expect(state.faveur).toBe(f0 - 3000 + r.gain);
    expect(coursePartants()).not.toBe(p); // la course suivante est tirée
  });

  it("la mise totale respecte la table ; Monte-Carlo : 95 % sur la durée", () => {
    // Les courses tirent au sort (Math.random) : le banc tire avec une GRAINE, sinon il
    // tombait au hasard (σ du RTP sur 30 000 courses ≈ 0,014 : 22 tirages sur 600 hors
    // des bornes). Graine 230 : la médiane de 600 graines (0,9522) ; les bornes ±0,03
    // tiennent pour 578 graines sur 600 — un changement de courses.js qui décale les
    // tirages ne doit pas les faire tomber, un RTP faussé de quelques points si.
    // (Restauré par le vi.restoreAllMocks de l'afterEach.)
    vi.spyOn(Math, "random").mockImplementation(seededRng(230));
    state.maisonRank = 2;
    const { max } = tableLimits();
    expect(lancerCourse({ 0: max + 1 }, { silent: true, render: false })).toBeNull();
    expect(parisTotal({ 0: 5, 9: 7, x: 3, 2: -1 })).toBe(5);
    let mis = 0, rendu = 0;
    for (let i = 0; i < 30000; i += 1) {
      const p = coursePartants();
      const c = p[i % p.length].couloir;
      const r = lancerCourse({ [c]: 100 }, { silent: true, render: false });
      mis += 100;
      rendu += r.gain;
    }
    expect(rendu / mis).toBeGreaterThan(COURSES_RTP - 0.03);
    expect(rendu / mis).toBeLessThan(COURSES_RTP + 0.03);
  });
});
