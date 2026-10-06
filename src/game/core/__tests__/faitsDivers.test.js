"use strict";
// Les faits divers de la carte (docs/PLAN-FAITS-DIVERS.md) : la mémoire éternelle
// (state.faitsDivers), le rythme qui étale les découvertes, l'enregistreur (seule
// source de mutation) et ce que la Chronique en montre — jamais d'indice.

import { describe, it, expect, beforeEach } from "vitest";
import {
  state, setState, hydrateState, defaultState, buildGrandResetState, GR_PERSISTENT_FIELDS,
} from "../state.js";
import { normalizeFaitsDivers, defaultFaitsDivers } from "../faitsDiversState.js";
import {
  fdCandidates, fdInscrire, fdInscrireCurio, fdLoversInscrire, fdChronicle, fdDiscovered, fdProgress,
  FD_TUNE, fdNightOk,
} from "../faitsDivers.js";
import { FD_STORY_LIST, FD_STORIES, FD_CURIOS } from "../../data/faitsDivers.js";
import { AMOUREUX, AMOUREUX_PISTES, accordePiste } from "../../data/faitsDiversAmoureux.js";
import { CM_MAP_BUILDINGS } from "../../map/cityBuildings.js";

const MIN = 60;
const live = (sec) => { state.chronicleStats.lifetimePlaySec = sec; };

beforeEach(() => {
  setState(hydrateState({}));
});

describe("faitsDivers — la mémoire", () => {
  it("existe dès une partie neuve et traverse le Grand Reset", () => {
    expect(defaultState().faitsDivers).toEqual(defaultFaitsDivers());
    expect(GR_PERSISTENT_FIELDS).toContain("faitsDivers");
    live(40 * MIN);
    fdInscrire("secte", "cercle", 0);
    const fresh = buildGrandResetState(1);
    expect(fresh.faitsDivers.seen.secte.cercle).toBeTruthy();
  });
  it("normalise une sauvegarde abîmée sans rien inventer", () => {
    const n = normalizeFaitsDivers({ seen: { secte: { cercle: { band: 2, at: 99 }, "x y": {} }, "<bad>": 3 }, lovers: { step: 3.7, firstFound: "bob" }, rev: -2 });
    expect(n.seen.secte.cercle).toEqual({ band: 2, at: 99 });
    expect(Object.keys(n.seen)).toEqual(["secte"]);
    expect(n.lovers.step).toBe(3);
    expect(n.lovers.firstFound).toBeNull();
    expect(n.rev).toBe(0);
    expect(normalizeFaitsDivers(null)).toEqual(defaultFaitsDivers());
  });
  it("survit au chargement d'une sauvegarde (hydrateState)", () => {
    live(40 * MIN);
    fdInscrire("secte", "cercle", 0);
    const saved = JSON.parse(JSON.stringify(state));
    setState(hydrateState(saved));
    expect(state.faitsDivers.seen.secte.cercle.band).toBe(0);
  });
});

describe("faitsDivers — le rythme", () => {
  it("rien avant les premières minutes de jeu", () => {
    live((FD_TUNE.firstMin - 1) * MIN);
    expect(fdCandidates({ band: 9, nightF: 1 })).toEqual([]);
    live((FD_TUNE.firstMin + 1) * MIN);
    expect(fdCandidates({ band: 9, nightF: 1 }).length).toBeGreaterThan(0);
  });
  it("la secte attend la nuit, la borne le jour", () => {
    live(10 * 3600);
    const night = fdCandidates({ band: 2, nightF: 1 }).filter((c) => c.kind === "story").map((c) => c.story.id);
    const day = fdCandidates({ band: 2, nightF: 0 }).filter((c) => c.kind === "story").map((c) => c.story.id);
    expect(night).toContain("secte");
    expect(day).not.toContain("secte");
    expect(day).toContain("borne");
    expect(night).not.toContain("borne");
  });
  it("une seule histoire NOUVELLE à la fois : la suivante attend son écart", () => {
    live(30 * MIN);
    fdInscrire("secte", "cercle", 0);
    const fresh = fdCandidates({ band: 9, nightF: 0, life: 31 * MIN }).filter((c) => c.isNew);
    expect(fresh).toEqual([]);
    const later = fdCandidates({ band: 9, nightF: 0, life: (30 + FD_TUNE.newGapMin) * MIN }).filter((c) => c.isNew);
    expect(later.length).toBeGreaterThan(0);
  });
  it("le chapitre suivant attend son délai ET son âge", () => {
    live(30 * MIN);
    fdInscrire("secte", "cercle", 0);
    const next = FD_STORIES.secte.chapters[1];
    const at = (life, band) => fdCandidates({ band, nightF: 1, life }).some((c) => c.kind === "story" && c.story.id === "secte");
    expect(at(30 * MIN + (next.delayMin - 1) * MIN, 9)).toBe(false);
    expect(at(30 * MIN + (next.delayMin + 1) * MIN, next.band - 1)).toBe(false);
    expect(at(30 * MIN + (next.delayMin + 1) * MIN, next.band)).toBe(true);
  });
  it("Nancy et William n'arrivent qu'après deux histoires découvertes", () => {
    live(10 * 3600);
    const lovers = (life) => fdCandidates({ band: 3, nightF: 0, life }).some((c) => c.kind === "lovers");
    expect(lovers(10 * 3600)).toBe(false);
    fdInscrire("secte", "cercle", 0);
    live(11 * 3600);
    fdInscrire("tortue", "depart", 0);
    expect(fdDiscovered()).toBe(2);
    expect(lovers(11 * 3600 + 1)).toBe(false);                               // l'écart des nouveautés
    expect(lovers(11 * 3600 + FD_TUNE.newGapMin * MIN + 1)).toBe(true);
  });
  it("les curiosités viennent après la première histoire, une seule fois chacune", () => {
    live(10 * 3600);
    const curios = (life) => fdCandidates({ band: 9, nightF: 0, life }).filter((c) => c.kind === "curio");
    expect(curios(10 * 3600)).toEqual([]);
    fdInscrire("borne", "borne", 2);
    expect(curios(10 * 3600).length).toBeGreaterThan(0);
    expect(fdInscrireCurio("file", 2)).toBe(true);
    expect(fdInscrireCurio("file", 2)).toBe(false);
    expect(curios(10 * 3600 + 1)).toEqual([]);                                   // l'écart entre deux curiosités
    expect(curios(10 * 3600 + FD_TUNE.curioGapMin * MIN + 1).some((c) => c.curio.id === "file")).toBe(false);
  });
  it("fdNightOk : nuit, jour, soir", () => {
    expect(fdNightOk(true, 0.6)).toBe(true);
    expect(fdNightOk(true, 0.2)).toBe(false);
    expect(fdNightOk(false, 0.2)).toBe(true);
    expect(fdNightOk("soir", 0.2)).toBe(true);
    expect(fdNightOk(null, 0.4)).toBe(true);
  });
});

describe("faitsDivers — l'enregistreur", () => {
  it("inscrit une fois, dans l'ordre, et refuse l'inconnu", () => {
    live(30 * MIN);
    expect(fdInscrire("secte", "cercle", 0)).toBe(true);
    expect(fdInscrire("secte", "cercle", 0)).toBe(false);
    expect(fdInscrire("secte", "nimporte", 0)).toBe(false);
    expect(fdInscrire("inconnue", "cercle", 0)).toBe(false);
    expect(fdProgress(FD_STORIES.secte).n).toBe(1);
    expect(state.faitsDivers.firstAt).toBe(30 * MIN);
    expect(state.faitsDivers.lastNewAt).toBe(30 * MIN);
  });
  it("Nancy et William avancent rendez-vous par rendez-vous", () => {
    live(3 * 3600);
    expect(fdLoversInscrire("william", 3)).toBe(false);                          // pas dans l'ordre
    expect(fdLoversInscrire("ruban", 3, { type: "markets", next: "libraries", piste: 1, place: "door:1,2" })).toBe(true);
    const L = state.faitsDivers.lovers;
    expect(L.step).toBe(1);
    expect(L.first).toBe("markets");
    expect(L.next).toBe("libraries");
    expect(state.faitsDivers.seen.amoureux.ruban).toBeTruthy();
  });
});

// La Chèvre des toits a été éteinte le 2026-10-05 (`off`) : son sprite venait du pack
// LaserKiwi, retiré faute de licence (audit STEAM-1) ; elle est revenue le même jour
// avec la chèvre maison. L'interrupteur reste : on l'éprouve en l'éteignant ici.
describe("faitsDivers — une histoire éteinte", () => {
  const ids = (life) => fdCandidates({ band: 9, nightF: 0, life }).filter((c) => c.kind === "story").map((c) => c.story.id);
  it("la Chèvre, rallumée, est de nouveau proposée", () => {
    expect(FD_STORIES.chevre.off).toBeFalsy();
    live(10 * 3600);
    expect(ids(10 * 3600)).toContain("chevre");
  });
  it("n'est plus jamais proposée, ni nouvelle ni en cours", () => {
    FD_STORIES.chevre.off = true;
    try {
      live(10 * 3600);
      expect(ids(10 * 3600)).not.toContain("chevre");
      fdInscrire("chevre", "enclos", 1);                // une sauvegarde qui l'avait commencée
      expect(ids(20 * 3600)).not.toContain("chevre");
    } finally { delete FD_STORIES.chevre.off; }
  });
  it("ce qui en a été lu reste dans la Chronique", () => {
    live(30 * MIN);
    expect(fdInscrire("chevre", "enclos", 1)).toBe(true);
    expect(fdChronicle().stories.map((s) => s.id)).toEqual(["chevre"]);
    expect(fdDiscovered()).toBe(1);
  });
});

describe("faitsDivers — la Chronique ne dit rien de ce qui reste", () => {
  it("vide tant que rien n'est vu", () => {
    expect(fdChronicle()).toEqual({ stories: [], curios: [] });
  });
  it("seulement les chapitres vus, dans l'ordre des découvertes", () => {
    live(30 * MIN);
    fdInscrire("secte", "cercle", 0);
    live(90 * MIN);
    fdInscrire("tortue", "depart", 1);
    const c = fdChronicle();
    expect(c.stories.map((s) => s.id)).toEqual(["secte", "tortue"]);
    expect(c.stories[0].chapters.length).toBe(1);
    expect(c.stories[0].done).toBe(false);
  });
});

describe("faitsDivers — le texte", () => {
  it("chaque chapitre a son titre, son récit et ses répliques, en deux langues", () => {
    for (const s of FD_STORY_LIST) {
      const ids = new Set();
      for (const ch of s.chapters) {
        expect(ids.has(ch.id)).toBe(false);
        ids.add(ch.id);
        for (const t of [ch.title, ch.chronicle]) { expect(t.fr).toBeTruthy(); expect(t.en).toBeTruthy(); }
        expect(ch.cast.length).toBeGreaterThan(0);
        for (const c of ch.cast) { expect(c.line.fr).toBeTruthy(); expect(c.line.en).toBeTruthy(); expect(c.who.fr).toBeTruthy(); }
      }
      // Les âges ne reculent jamais d'un chapitre au suivant.
      for (let i = 1; i < s.chapters.length; i += 1) expect(s.chapters[i].band).toBeGreaterThanOrEqual(s.chapters[i - 1].band);
    }
    for (const g of FD_CURIOS) { expect(g.title.fr).toBeTruthy(); expect(g.chronicle.en).toBeTruthy(); }
  });
  it("une piste pour chaque bâtiment de la carte, accordée aux deux", () => {
    for (const b of CM_MAP_BUILDINGS) {
      const set = AMOUREUX_PISTES[b.id];
      expect(set && set.length, b.id).toBeGreaterThanOrEqual(2);
      for (const p of set) {
        for (const fem of [true, false]) {
          expect(accordePiste(p.fr, fem, "fr")).not.toMatch(/[{}]/);
          expect(accordePiste(p.en, fem, "en")).not.toMatch(/[{}]/);
        }
      }
    }
    expect(accordePiste("{Il} est parti{e}.", true)).toBe("Elle est partie.");
    expect(accordePiste("{He} left {his} hat.", true, "en")).toBe("She left her hat.");
  });
  it("chaque histoire laisse une trace qui se lit, en deux langues", () => {
    for (const s of [...FD_STORY_LIST, AMOUREUX]) {
      expect(s.traceSay, s.id).toBeTruthy();
      expect(s.traceSay.who.fr && s.traceSay.who.en && s.traceSay.line.fr && s.traceSay.line.en).toBeTruthy();
    }
  });
  it("les rendez-vous de Nancy et William sont complets", () => {
    for (const st of AMOUREUX.steps) {
      expect(st.title.fr && st.chronicle.en).toBeTruthy();
      const who = st.who === "both" || st.who === "first" || st.who === "second" ? ["nancy", "william"] : [st.who];
      for (const w of who) { expect(st.lines[w], st.id + ":" + w).toBeTruthy(); expect(st.lines[w].en).toBeTruthy(); }
    }
  });
});
