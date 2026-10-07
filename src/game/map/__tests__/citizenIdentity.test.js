import { describe, it, expect } from "vitest";

import {
  buildIdentity, ageRange, TRAITS, EPITHET_RULES, SPRITE_PROFILE, JOBS, WORK_JOBS, familyName,
  householdOf, householdSlot, householdSeedOf, householdHeadName, memberOf, jobOfBuilding,
} from "../citizenIdentity.js";
import { CM_EPITHETS_M, CM_EPITHETS_F, CM_LIEUX } from "../cityNaming.js";
import { cmHash } from "../layout.js";

// UNE PERSONNE D'UN SEUL TENANT (Raph, 2026-10-07 : « Garin l'Ancien · Homme ·
// 25 ans », « pour ne pas avoir des trucs comme ça »). Chaque test balaie des
// centaines de graines : une incohérence rare doit sortir ici, pas en jeu.

const SEEDS = Array.from({ length: 1500 }, (_, i) => (i * 2654435761) >>> 0);
const within = (age, [lo, hi]) => age >= lo && age <= hi;

describe("le surnom et l'âge", () => {
  it("l'Ancien et l'Aïeule sont vieux, le Cadet est jeune, aux deux âges des camps", () => {
    let seen = 0;
    for (const band of [0, 1]) {
      for (const s of SEEDS) {
        for (const fem of [false, true]) {
          const id = buildIdentity({ seed: s, band, fem });
          if (!id.epithet) continue;
          const rule = EPITHET_RULES[id.epithet];
          if (rule && rule.age) {
            seen += 1;
            expect(within(id.age, ageRange(band, rule.age)), `${id.name}, ${id.age} ans`).toBe(true);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(50);
  });

  it("un dessin aux cheveux blancs n'est jamais « le Cadet », et il est âgé", () => {
    for (const s of SEEDS) {
      const id = buildIdentity({ seed: s, band: 0, sprite: "caveman4" });
      expect(id.epithet).not.toBe("le Cadet");
      expect(within(id.age, ageRange(0, "old"))).toBe(true);
    }
    for (const s of SEEDS.slice(0, 300)) {
      expect(within(buildIdentity({ seed: s, band: 2, sprite: "villager3" }).age, ageRange(2, "old"))).toBe(true);
      expect(within(buildIdentity({ seed: s, band: 9, sprite: "crystalman" }).age, ageRange(9, "old"))).toBe(true);
    }
  });

  it("plus de boiteux qui marche droit ni de rousse aux cheveux noirs", () => {
    expect(CM_EPITHETS_M).not.toContain("le Boiteux");
    expect(CM_EPITHETS_F).not.toContain("la Rousse");
  });

  it("un enfant a entre 4 et 13 ans, sans surnom ni métier", () => {
    for (const s of SEEDS.slice(0, 400)) {
      const id = buildIdentity({ seed: s, band: s % 10, child: true, fem: s % 2 === 0, sprite: "villagerchild" });
      expect(id.age).toBeGreaterThanOrEqual(4);
      expect(id.age).toBeLessThanOrEqual(13);
      expect(id.epithet).toBe(null);
      expect(id.job).toBe(null);
    }
  });
});

describe("le caractère", () => {
  it("jamais deux traits qui se contredisent", () => {
    const not = Object.fromEntries(TRAITS.map((t) => [t.key, t.not]));
    for (const s of SEEDS) {
      const [a, b] = buildIdentity({ seed: s, band: s % 10, fem: s % 3 === 0 }).traits;
      expect(a).not.toBe(b);
      expect(not[a]).not.toBe(b);
      expect(not[b]).not.toBe(a);
    }
  });

  it("le surnom impose son trait : le Taciturne est taciturne, jamais bavard", () => {
    let seen = 0;
    for (const s of SEEDS) {
      const id = buildIdentity({ seed: s, band: 0 });
      if (id.epithet !== "le Taciturne") continue;
      seen += 1;
      expect(id.traits).toContain("quiet");
      expect(id.traits).not.toContain("chatty");
    }
    expect(seen).toBeGreaterThan(5);
  });

  it("un métier de foi rend pieux", () => {
    for (const s of SEEDS.slice(0, 200)) {
      expect(buildIdentity({ seed: s, band: 2, sprite: "villager3" }).traits[0]).toBe("pious");
      expect(buildIdentity({ seed: s, band: 4, fem: true, sprite: "romanwoman2" }).traits[0]).toBe("pious");
    }
  });
});

describe("le métier et le nom", () => {
  it("le métier vient du dessin quand il en porte un, sinon de l'appelant", () => {
    expect(buildIdentity({ seed: 7, band: 2, sprite: "villagerwoman3", fem: true }).job).toBe("baker");
    expect(buildIdentity({ seed: 7, band: 2, sprite: "villager", job: "gatherer" }).job).toBe("gatherer");
    expect(buildIdentity({ seed: 7, band: 2, sprite: "villager" }).job).toBe(null);
    for (const [sprite, prof] of Object.entries(SPRITE_PROFILE)) {
      if (prof.job) expect(JOBS[prof.job], sprite).toBeTruthy();
    }
  });

  it("aux villages, le moine est Frère, les autres (la boulangère comprise) portent le nom du foyer", () => {
    for (const s of SEEDS.slice(0, 200)) {
      expect(buildIdentity({ seed: s, band: 3, sprite: "villager3" }).name).toMatch(/^Frère /);
      const baker = buildIdentity({ seed: s, band: 2, sprite: "villagerwoman3", fem: true });
      expect(baker.name).toBe(`${baker.given} ${baker.family}`);
      const hh = householdOf(4242, 2);
      const v = buildIdentity({ seed: s, band: 2, sprite: "villager", household: hh, slot: hh.m ? "m" : null });
      expect(CM_LIEUX).toContain(v.family);
      if (hh.m) expect(v.name).toBe(`${hh.m.given} ${familyName(2, hh.seed)}`);
    }
  });
});

describe("le foyer", () => {
  const HOUSES = SEEDS.slice(0, 600);

  it("un couple, ses enfants et son aïeul partagent le nom ; chacun le prénom de sa place", () => {
    for (const band of [2, 4, 6, 9]) {
      for (const hs of HOUSES.slice(0, 150)) {
        const hh = householdOf(hs, band);
        const slots = ["m", "f", "g", ...hh.kids.map((_, i) => "k" + i)].filter((k) => memberOf(hh, k));
        const names = new Set();
        for (const slot of slots) {
          const m = memberOf(hh, slot);
          const id = buildIdentity({ seed: hs ^ 77, band, child: slot[0] === "k", fem: m.fem, household: hh, slot });
          expect(id.given).toBe(m.given);
          expect(id.age).toBe(m.age);
          expect(id.family).toBe(familyName(band, hh.seed));
          names.add(id.given);
        }
        expect(names.size, "deux prénoms pareils sous un toit").toBe(slots.length);
      }
    }
  });

  it("un enfant a au moins seize ans de moins que ses parents, l'aïeul dix-huit de plus que son enfant", () => {
    let kids = 0, elders = 0;
    for (const band of [0, 3, 5, 8]) {
      for (const hs of HOUSES) {
        const hh = householdOf(hs, band);
        const young = Math.min(hh.m ? hh.m.age : Infinity, hh.f ? hh.f.age : Infinity);
        for (const k of hh.kids) { kids += 1; expect(k.age).toBeLessThanOrEqual(young - 16); expect(k.age).toBeGreaterThanOrEqual(4); }
        if (hh.g) {
          elders += 1;
          expect(hh.g.age).toBeGreaterThanOrEqual(Math.min(hh[hh.g.of].age + 18, ageRange(band, "old")[1]));
        }
      }
    }
    expect(kids).toBeGreaterThan(200);
    expect(elders).toBeGreaterThan(100);
  });

  it("la fiche du mari nomme sa femme, celle de la femme son mari, celle de l'enfant ses parents", () => {
    let seen = 0;
    for (const hs of HOUSES) {
      const hh = householdOf(hs, 4);
      if (!hh.couple || !hh.kids.length) continue;
      seen += 1;
      const man = buildIdentity({ seed: 1, band: 4, household: hh, slot: "m" });
      const wife = buildIdentity({ seed: 2, band: 4, fem: true, household: hh, slot: "f" });
      const kid = buildIdentity({ seed: 3, band: 4, child: true, fem: hh.kids[0].fem, household: hh, slot: "k0" });
      expect(man.line).toEqual({ kind: "married", other: "f", kids: hh.kids.length });
      expect(wife.line).toEqual({ kind: "married", other: "m", kids: hh.kids.length });
      expect(kid.line).toEqual({ kind: "child", parents: ["m", "f"] });
    }
    expect(seen).toBeGreaterThan(50);
  });

  it("chacun sa place : pas deux maris, un vieux dessin prend la place de l'aïeul, le moine aucune", () => {
    for (const hs of HOUSES.slice(0, 300)) {
      const hh = householdOf(hs, 2);
      if (hh.m) {
        expect(householdSlot(hh, { fem: false, band: 2 }, new Set())).toBe("m");
        expect(householdSlot(hh, { fem: false, band: 2 }, new Set(["m"]))).toBe(null);
      }
      expect(householdSlot(hh, { fem: false, sprite: "villager3", band: 2 }, new Set())).toBe(null);
      const elder = householdSlot(hh, { fem: true, sprite: "romanwoman", band: 2 }, new Set());
      if (elder) expect(within(memberOf(hh, elder).age, ageRange(2, "mature"))).toBe(true);
      const old = householdSlot(hh, { fem: false, sprite: "caveman4", band: 2 }, new Set());
      if (old) expect(within(memberOf(hh, old).age, ageRange(2, "old"))).toBe(true);
    }
    // Le moine n'a pas de famille à dire.
    const hh = householdOf(5, 2);
    expect(buildIdentity({ seed: 9, band: 2, sprite: "villager3", household: hh, slot: null }).line).toBe(null);
  });

  it("la maison porte le nom de la tête de son foyer, avec la graine de l'infobulle", () => {
    for (const key of ["3,4", "12,7", "40,22"]) {
      expect(householdSeedOf(key, 2)).toBe(cmHash(`${key}:2`));
    }
    for (const hs of HOUSES.slice(0, 100)) {
      const hh = householdOf(hs, 2);
      const head = hh[hh.head];
      const id = buildIdentity({ seed: 1, band: 2, fem: head.fem, household: hh, slot: hh.head });
      expect(householdHeadName(hh)).toBe(id.name);
    }
  });
});

describe("le métier, la suite", () => {
  it("l'enfant dessiné en garçon porte un prénom de garçon", () => {
    for (const s of SEEDS.slice(0, 300)) {
      expect(buildIdentity({ seed: s, band: 2, child: true, fem: true, sprite: "villagerchild" }).fem).toBe(false);
      // Un dessin qui ne dit rien laisse le tirage.
      expect(buildIdentity({ seed: s, band: 6, child: true, fem: true, sprite: "modernchild" }).fem).toBe(true);
    }
  });

  it("est déterministe : même graine, même personne", () => {
    const hh = householdOf(77, 5);
    const a = buildIdentity({ seed: 123456789, band: 5, sprite: "industrialman3", household: hh, slot: hh.m ? "m" : null });
    const b = buildIdentity({ seed: 123456789, band: 5, sprite: "industrialman3", household: householdOf(77, 5), slot: hh.m ? "m" : null });
    expect(a).toEqual(b);
  });

  it("chaque atelier donne un métier connu, qui y travaille", () => {
    for (const id of Object.keys(WORK_JOBS)) {
      for (const band of [0, 2, 4, 5, 6, 9]) {
        const key = jobOfBuilding(id, band);
        expect(JOBS[key], `${id} en bande ${band}`).toBeTruthy();
        expect(JOBS[key].works).toContain(id);
      }
    }
    // Le cueilleur des camps devient maraîcher au bourg, le batelier docker à la Fonte.
    expect(jobOfBuilding("foragers", 1)).toBe("gatherer");
    expect(jobOfBuilding("foragers", 2)).toBe("marketGardener");
    expect(jobOfBuilding("river_ports", 5)).toBe("docker");
  });
});
