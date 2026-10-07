import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { state } from "../../core/state.js";
import { CM } from "../layout.js";
import { spawnOneCitizen } from "../cityMapRuntime.js";
import { cityMapWalkRoadKey } from "../agents.js";
import { ageConfigFor } from "../procedural/ageVisualConfig.js";
import { householdOf, memberOf, familyName, JOBS, SPRITE_PROFILE } from "../citizenIdentity.js";

// LA FOULE D'UN SEUL TENANT (fiche d'habitant, 2026-10-07). On fait naître une
// vraie foule par spawnOneCitizen, dans une ville de maisons et d'ateliers, et on
// vérifie ce que la fiche affirmera : la répartition des passants, leur foyer
// (personne ne tient la place d'un autre), leurs noms, leurs métiers et leur
// travail.

const saved = { cycles: state.cycles };

// Une ville de bourg (bande 2) : une rue, des maisons au nord, des ateliers au sud.
function town(band = 2, eraIndex = 12) {
  const roads = [];
  for (let gx = 0; gx < 60; gx += 1) roads.push({ gx, gy: 10, rank: "main", mask: 15 });
  const L = {
    counts: { eraIndex, eraBand: band, urbanTier: 1, houses: 0 }, roads,
    roadMap: new Map(roads.map((r) => [r.gx + "," + r.gy, r])),
    ageCfg: ageConfigFor(band), personality: null,
  };
  CM.layout = L;
  CM.TILE = 20;
  CM.walkRoadList = roads.slice();
  CM.walkRoadSet = new Set(roads.map((r) => cityMapWalkRoadKey(r.gx, r.gy)));
  CM.tileGrid = new Map();
  // Trente maisons (une sur deux en logement collectif à partir de la Fonte).
  CM.homeRoadCells = [];
  for (let i = 0; i < 30; i += 1) {
    const t = { type: "house", variant: band >= 5 && i % 2 ? "tenement" : "townhouse", gx: i * 2, gy: 9, key: `${i * 2},9` };
    CM.tileGrid.set(t.key, t);
    CM.homeRoadCells.push({ gx: i * 2, gy: 10, t });
  }
  // Les ateliers : culte, marchés, moulin, école, veilleurs, grands travaux.
  const ids = ["ancestral_cult", "markets", "water_mills", "schools", "watch", "public_works"];
  CM.workRoadCells = [];
  ids.forEach((id, i) => {
    for (let k = 0; k < 3; k += 1) {
      const gx = 4 + i * 9 + k;
      const t = { type: "engine", buildingId: id, variant: id, gx, gy: 11, key: `engine:${id}:${k}` };
      CM.tileGrid.set(`${gx},11`, t);
      CM.workRoadCells.push({ gx, gy: 10, t });
    }
  });
  return L;
}
function crowd(L, n) {
  CM.citizens = [];
  for (let i = 0; i < n; i += 1) spawnOneCitizen(L);
  return CM.citizens;
}

beforeEach(() => { state.cycles = 3; CM.focus = null; });
afterEach(() => {
  Object.assign(state, saved);
  CM.citizens = []; CM.focus = null; CM.layout = null;
  CM.walkRoadList = []; CM.walkRoadSet = new Set(); CM.homeRoadCells = []; CM.workRoadCells = []; CM.tileGrid = new Map();
});

describe("la foule", () => {
  it("42 % d'hommes, 42 % de femmes, 16 % d'enfants, et chaque dessin de l'âge sort", () => {
    const L = town(2);
    const list = crowd(L, 600);
    const share = (ct) => list.filter((p) => p.charType === ct).length / list.length;
    // Avant le correctif (`>>` sur une graine uint32) : 71 % d'hommes.
    expect(share(0)).toBeGreaterThan(0.34);
    expect(share(0)).toBeLessThan(0.5);
    expect(share(1)).toBeGreaterThan(0.34);
    expect(share(2)).toBeGreaterThan(0.1);
    expect(share(2)).toBeLessThan(0.22);
    const sprites = new Set(list.map((p) => p.identity.sprite));
    for (const s of ["villager", "villager2", "villager3", "villager4", "villagerwoman", "villagerwoman2", "villagerwoman3", "villagerchild"]) {
      expect(sprites.has(s), s).toBe(true);
    }
  });
});

describe("le foyer", () => {
  it("personne ne tient la place d'un autre, et le mari dont parle la fiche est bien celui qui passe", () => {
    for (const band of [2, 4, 6]) {
      const L = town(band, band * 5 + 2);
      const list = crowd(L, 160);
      const seen = new Set();
      let couples = 0;
      for (const p of list) {
        const id = p.identity;
        if (!id.slot) continue;
        const key = `${id.household}:${id.slot}`;
        expect(seen.has(key), `deux passants à la place ${key}`).toBe(false);
        seen.add(key);
        const hh = householdOf(id.household, band);
        expect(memberOf(hh, id.slot).given).toBe(id.given);
        expect(p.name.startsWith(id.given) || p.name.endsWith(" " + id.given)).toBe(true);
        if (id.line && id.line.kind === "married") {
          const other = list.find((q) => q.identity.household === id.household && q.identity.slot === id.line.other);
          if (other) {
            couples += 1;
            expect(other.identity.given).toBe(memberOf(hh, id.line.other).given);
            expect(other.identity.line.other).toBe(id.slot);
            // Même foyer, même nom de famille (le moine et la boulangère des villages
            // ont un nom de métier, mais pas de place de mari ou d'épouse ici).
            expect(other.identity.family).toBe(id.family);
          }
        }
      }
      expect(couples, `bande ${band} : des couples dans la rue`).toBeGreaterThan(0);
    }
  });

  it("la maison porte le nom de la tête de son foyer", () => {
    const L = town(2);
    const list = crowd(L, 200);
    for (const p of list) {
      const id = p.identity;
      if (!id.slot || !p.home || !p.home.t) continue;
      const hh = householdOf(id.household, 2);
      const head = hh[hh.head];
      expect(CM.describeTile(p.home.t).title.endsWith(`${head.given} ${familyName(2, hh.seed)}`)).toBe(true);
    }
  });
});

describe("le métier et le travail", () => {
  it("le moine prie au culte, le garde veille, l'enfant va à l'école, le meunier travaille au moulin", () => {
    const L = town(2);
    const list = crowd(L, 600);
    let checked = 0;
    for (const p of list) {
      const id = p.identity;
      const prof = SPRITE_PROFILE[id.sprite] || {};
      const where = p.work && p.work.t ? p.work.t.buildingId : null;
      if (p.charType === 2) { expect(where).toBe("schools"); checked += 1; continue; }
      if (prof.job) {
        if (where) expect(JOBS[prof.job].works).toContain(where);
        expect(id.job).toBe(prof.job);
        checked += 1;
        continue;
      }
      // Les autres : l'atelier donne le métier.
      if (where === "water_mills") expect(id.job).toBe("miller");
      if (where === "markets") expect(id.job).toBe("merchant");
      if (where) expect(JOBS[id.job].works).toContain(where);
    }
    expect(checked).toBeGreaterThan(100);
    expect(list.some((p) => p.identity.sprite === "villager3" && p.name.startsWith("Frère "))).toBe(true);
  });
});
