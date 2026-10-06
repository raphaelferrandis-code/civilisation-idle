import { describe, it, expect } from "vitest";

import { CM_MAP_BUILDINGS } from "../cityBuildings.js";
import { drawEngineSprite } from "../engineSprites.js";
import { drawCityEngineSprite } from "../cityEngineSprites.js";
import { CM } from "../layout.js";

// ── SANS PNG, UNE SCÈNE MOTEUR NE DESSINE RIEN (audit du 05/10, MORT-2) ──────────
// Décision de Raph : les ~3 400 lignes de replis procéduraux des bâtiments-moteur —
// des scènes vectorielles que personne ne voyait qu'aux premières frames, avant le
// décodage des PNG — sont retirées. Tant qu'un décor n'est pas chargé, sa scène ne
// dessine RIEN : ni flash d'un autre style à l'ouverture, ni encre parasite mesurée
// pour le survol (BUG-59 : « pas d'encre, pas de cache » redevient vrai).
// Sous Node, `Image` n'existe pas : aucun décor ne se charge jamais, c'est l'état
// « PNG pas encore décodé » prolongé indéfiniment. Ce fichier vérifie qu'il ne laisse
// AUCUN appel au contexte, sur toutes les familles et toutes les ères.
// ⚠ Il ne doit JAMAIS poser d'Image factice : propImg / animImg sont des états de
// module, l'ordre des tests déciderait alors du chemin suivi (audit du 05/10, TEST-5).
// Le chemin PNG, celui du jeu, vit dans cityEngineSprites.png.test.js.

// Contexte-espion : la moindre méthode appelée (dessin, état, dégradé) est comptée.
function makeSpyCtx() {
  const calls = [];
  const base = {
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt",
    globalAlpha: 1, globalCompositeOperation: "source-over", imageSmoothingEnabled: false,
  };
  const ctx = new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => { calls.push(String(prop)); return { addColorStop: () => {} }; };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return { ctx, calls };
}

const bandOf = (ei) => Math.min(9, Math.floor(ei / 5));
const IDS = CM_MAP_BUILDINGS.map((b) => b.id);

it("le registre couvre les 29 familles de la carte", () => {
  expect(IDS.length).toBeGreaterThanOrEqual(29);
});

describe.each(IDS)("drawEngineSprite sans PNG — %s", (id) => {
  it("ne dessine rien, à aucun âge, aucun palier", () => {
    for (let ei = 0; ei < 50; ei += 1) {
      for (const tier of [0, 3]) {
        for (const size of id === "imperial_exchanges" ? [3, 5] : [1, 3]) {
          const { ctx, calls } = makeSpyCtx();
          CM.ctx = ctx;
          CM.nightF = ei % 2 ? 1 : 0;
          CM.layout = { counts: { eraBand: bandOf(ei), eraIndex: ei } };
          const t = {
            type: "engine", buildingId: id, tier, size, groupIndex: size >= 3 ? 1 : 2 + (ei % 3), gx: 3 + ei, gy: 4,
            spanX: id === "river_ports" ? 4 : undefined, spanY: id === "river_ports" ? 3 : undefined,
            waterEnd: ei % 2 ? "W" : "E",
          };
          expect(() => drawEngineSprite(t, 0, 0, 120, 120, 1234 + ei * 97)).not.toThrow();
          expect(calls, `${id} âge ${ei} tier ${tier} empreinte ${size}`).toEqual([]);
        }
      }
    }
  });
});

// Les trois familles qui n'avaient plus de chemin vers une scène moteur (champs
// irrigués refusés par isoEngineScene, moulins cuits par isoMill, aqueducs posés en
// points d'eau) ont perdu leur branche : drawCityEngineSprite ne les prend plus en charge.
describe.each(["irrigated_fields", "water_mills", "aqueducts"])("famille retirée — %s", (id) => {
  it("n'est plus prise en charge par drawCityEngineSprite", () => {
    for (const ei of [4, 14, 24, 32, 38, 49]) {
      const { ctx, calls } = makeSpyCtx();
      const result = drawCityEngineSprite({
        ctx, id, tier: 1, litGold: "rgba(255,220,120,0.5)", ox: 0, oy: 0, sw: 64, sh: 80,
        px: () => {}, strokeRect: () => {}, now: 1234, band: bandOf(ei), ei, gw: 4, gh: 4,
      });
      expect(result).toBe(false);
      expect(calls).toEqual([]);
    }
  });
});
