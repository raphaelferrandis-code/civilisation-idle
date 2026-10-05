// L'équipage des bateaux (docs/PLAN-BATEAUX.md §8) : des HABITANTS de l'ère posés à
// bord, découpés par leur coque. Un nom de la distribution qui n'existe pas chez les
// habitants laisserait un bateau sans personne, sans erreur ni trace à l'écran.
import { describe, it, expect } from "vitest";
import { BOAT_MODELS, BAND_FLEET } from "../iso/boatKits.js";
import { bakeBoat, dirTheta } from "../iso/boatBake.js";
import { BOAT_CAST, crewSpec, crewDir } from "../iso/boatCrew.js";
import { ISO_AGENT_NAMES } from "../agents.js";
import fs from "node:fs";
import path from "node:path";

// Les métiers à équipage (les sentinelles cosmiques du service naviguent seules)…
const MANNED = ["trade", "barge", "fisher", "ferry"];
// … sauf les GRANDS NAVIRES, sans personne sur le pont (Raph, 2026-10-03).
const BIG = ["vapeur", "cargo-vapeur", "peniche", "remorqueur", "drague", "porte-conteneurs", "porte-conteneurs-quai", "petrolier", "pousseur"];
const sailing = (fl) => [...new Set(MANNED.flatMap((r) => fl[r] || []))].filter((id) => !BIG.includes(id));

describe("l'équipage des bateaux", () => {
  it("chaque marin, pêcheur ou passager est un habitant dessiné", () => {
    for (let b = 0; b <= 9; b += 1) {
      for (const [role, names] of Object.entries(BOAT_CAST[b])) {
        expect(names.length, `bande ${b} · ${role}`).toBeGreaterThan(0);
        for (const n of names) expect(ISO_AGENT_NAMES, `bande ${b} · ${role}`).toContain(n);
      }
    }
  });
  it("chaque bateau de métier a quelqu'un à bord, et personne une fois amarré", () => {
    for (let b = 0; b <= 9; b += 1) {
      for (const id of sailing(BAND_FLEET[b])) {
        const M = BOAT_MODELS[id];
        const ctx = { variant: M.variant(3), state: "cruise", k: 1.2 };
        const full = bakeBoat(M, dirTheta(5), ctx);
        expect(full.crew.length, id).toBeGreaterThan(0);
        for (const cr of full.crew) expect(ISO_AGENT_NAMES).toContain(crewSpec(b, M, cr).name);
        expect(bakeBoat(M, dirTheta(5), { ...ctx, empty: true }).crew.length, id + " amarré").toBe(0);
      }
    }
  });
  it("personne sur le pont des grands navires", () => {
    for (const id of BIG) {
      const M = BOAT_MODELS[id];
      expect(M, id).toBeTruthy();
      for (const state of ["cruise", "dock", "salute"]) {
        expect(bakeBoat(M, dirTheta(5), { variant: M.variant(3), state, k: 1.2 }).crew.length, id + " " + state).toBe(0);
      }
    }
  });
  it("le rameur assis a les jambes dans la coque : son masque couvre tout sous son banc", () => {
    const M = BOAT_MODELS.scapha;
    const b = bakeBoat(M, dirTheta(4), { variant: M.variant(3), state: "cruise", k: 1.2 });
    const rower = b.crew.find((c) => c.pose === "row");
    expect(rower).toBeTruthy();
    // Rangée du pied du sprite (enfoncé) : entièrement cachée.
    const j = Math.floor(rower.Y) - rower.y0;
    for (let i = 0; i < rower.w; i += 1) expect(rower.mask[j * rower.w + i]).toBe(1);
    // La tête, au-dessus du plat-bord, reste visible.
    const jh = j - 8;
    expect(rower.mask[jh * rower.w + (Math.floor(rower.X) - rower.x0)]).toBe(0);
  });
  it("le regard suit le cap : est → sud-est, sud → sud-ouest, ouest → nord-ouest, nord → nord-est", () => {
    expect(crewDir(0)).toBe(0);
    expect(crewDir(Math.PI / 2)).toBe(2);
    expect(crewDir(Math.PI)).toBe(1);
    expect(crewDir(-Math.PI / 2)).toBe(3);
    expect(crewDir(2 * Math.PI + 0.3)).toBe(0);
  });
  it("la navette des Plaisirs : l'hôtesse de la Maison à la proue, des passagers à l'aller, personne à la Maison", () => {
    for (let b = 0; b <= 9; b += 1) {
      const M = BOAT_MODELS[BAND_FLEET[b].shuttle[0]];
      const ctx = { variant: M.variant(3), state: "cruise", k: 1.2 };
      const go = bakeBoat(M, dirTheta(5), ctx);
      const host = go.crew.filter((c) => c.role === "hostess");
      expect(host.length, "bande " + b).toBe(1);
      const name = crewSpec(b, M, host[0]).name;
      expect(fs.existsSync(path.join(process.cwd(), "public/pixelart/agents/inhabitants", name + "-southeast.png")), name).toBe(true);
      expect(go.crew.length, "bande " + b).toBeGreaterThanOrEqual(3);
      for (const cr of go.crew) if (cr.role !== "hostess") expect(ISO_AGENT_NAMES).toContain(crewSpec(b, M, cr).name);
      expect(bakeBoat(M, dirTheta(5), { ...ctx, state: "unload" }).crew.length, "bande " + b).toBe(1);
      expect(bakeBoat(M, dirTheta(5), { ...ctx, state: "return" }).crew.length).toBeLessThanOrEqual(2);
    }
  });
  // Par crewSpec, ce que lit la cuisson (boatKit.js) : crewName n'a plus d'appelant
  // hors des tests (audit 2026-10-05, TEST-10).
  it("le bac distingue le passeur de ses passagers", () => {
    const M = { role: "ferry" };
    expect(BOAT_CAST[4].crew).toContain(crewSpec(4, M, { pose: "pole", id: 1 }).name);
    expect(BOAT_CAST[4].pass).toContain(crewSpec(4, M, { pose: "stand", id: 1 }).name);
  });
});
