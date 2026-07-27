import { describe, it, expect } from "vitest";

import { drawCityEngineSprite } from "../cityEngineSprites.js";

// Le lint ne voit pas ce qui se passe DANS une branche de stade : ce smoke-test
// exécute réellement le sprite pour attraper toute variable indéfinie / erreur
// runtime, sur tous les stades d'ère et tiers.

// Mini-mock de CanvasRenderingContext2D : no-op + compteur de fillRect pour
// vérifier qu'on dessine effectivement quelque chose.
function makeCtx() {
  const ctx = {
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt",
    globalAlpha: 1, globalCompositeOperation: "source-over",
    _fills: 0,
  };
  for (const m of [
    "beginPath", "moveTo", "lineTo", "arc", "ellipse", "closePath", "fill",
    "stroke", "save", "restore", "translate", "rotate", "scale",
    "quadraticCurveTo", "bezierCurveTo", "arcTo", "rect", "roundRect",
    "strokeRect", "fillText", "clip", "setLineDash", "drawImage",
  ]) ctx[m] = () => {};
  // Les scènes qui halonnent (nuit, néon) demandent un dégradé : sans ces deux-là le
  // smoke-test s'arrête sur une méthode absente du MOCK et non sur un vrai défaut.
  const grad = { addColorStop: () => {} };
  ctx.createRadialGradient = () => grad;
  ctx.createLinearGradient = () => grad;
  ctx.fillRect = () => { ctx._fills += 1; };
  return ctx;
}

// Reproduit la construction du contexte dans engineSprites.js (helpers px/strokeRect).
function makeContext({ id, ei, tier, now, pass, ctx }) {
  ctx = ctx || makeCtx();
  const ox = 0, oy = 0, sw = 64, sh = 80;          // emprise rectangulaire (large × profonde)
  const px = (rx, ry, rw, rh, col) => { ctx.fillStyle = col; ctx.fillRect(ox + sw * rx, oy + sh * ry, sw * rw, sh * rh); };
  const strokeRect = (rx, ry, rw, rh, col) => { ctx.strokeStyle = col; ctx.strokeRect(ox + sw * rx, oy + sh * ry, sw * rw, sh * rh); };
  const c = {
    ctx, id, tier, ox, oy, sw, sh, px, strokeRect, now,
    litWarm: `rgba(255,204,68,0.45)`, litGold: `rgba(255,220,120,0.50)`,
    band: 0, ei, gw: 4, gh: 4,
  };
  if (pass !== undefined) c.pass = pass;
  return c;
}

// Un âge représentatif par stade (ei<10/<20/<30/sinon).
const stages = [{ ei: 4 }, { ei: 14 }, { ei: 24 }, { ei: 32 }];

describe.each(["water_mills", "mint_houses", "imperial_exchanges", "caravans"])("drawCityEngineSprite — %s", (id) => {
  it("dessine les 4 stades d'ère pour chaque tier sans planter", () => {
    for (const { ei } of stages) {
      for (const tier of [0, 1, 2]) {
        for (const now of [0, 1234]) {
          const c = makeContext({ id, ei, tier, now });
          let result;
          expect(() => { result = drawCityEngineSprite(c); }).not.toThrow();
          expect(result).toBe(true);          // le sprite est pris en charge
          expect(c.ctx._fills).toBeGreaterThan(0); // il a effectivement dessiné
        }
      }
    }
  });

  // Les passes de cache ('back' statique sous / 'anim' ce qui lit now / 'front' statique
  // par-dessus) ne doivent JAMAIS planter : chaque branche dérive ses trois booléens et
  // saute simplement les appels qui ne la concernent pas.
  it("accepte les passes back/anim/front sans planter", () => {
    for (const { ei } of stages) {
      for (const tier of [0, 1, 2]) {
        for (const pass of ["back", "anim", "front"]) {
          const c = makeContext({ id, ei, tier, now: 1234, pass });
          let result;
          expect(() => { result = drawCityEngineSprite(c); }).not.toThrow();
          expect(result).toBe(true);          // le sprite reste pris en charge quelle que soit la passe
        }
      }
    }
  });
});

// ── Conservation des appels : back + anim + front ≡ all ─────────────────────────
// Un ctx-espion (Proxy) compte chaque appel de méthode de dessin. Pour des ids
// représentatifs, la SOMME des appels des trois passes doit être EXACTEMENT le
// compte de pass='all' (chaque appel de dessin vit dans UNE et UNE SEULE passe).
// NB : on ne compare que les méthodes de DESSIN — save/translate/beginPath font
// partie de la plomberie ré-exécutée à chaque passe (ex. le miroir de l'aqueduc).
// `storytellers` (suggéré) vit dans drawEngineSpriteCore, dont l'import tirerait
// state.js (localStorage absent en environnement node) → remplacé par
// granaries_city, même moule économique.
const DRAW_METHODS = ["fillRect", "strokeRect", "drawImage", "fill", "stroke", "fillText"];
function makeSpyCtx() {
  const counts = Object.fromEntries(DRAW_METHODS.map((m) => [m, 0]));
  const base = makeCtx();
  const ctx = new Proxy(base, {
    get(target, prop) {
      const v = target[prop];
      if (typeof v === "function" && DRAW_METHODS.includes(prop)) {
        return (...args) => { counts[prop] += 1; return v.apply(target, args); };
      }
      return v;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return { ctx, counts };
}
function drawCounts({ id, ei, tier, now, pass }) {
  const { ctx, counts } = makeSpyCtx();
  drawCityEngineSprite(makeContext({ id, ei, tier, now, pass, ctx }));
  return counts;
}

describe.each(["foragers", "granaries_city", "guilds", "mint_houses", "markets"])(
  "passes back+anim+front ≡ all — %s", (id) => {
    it("conserve exactement le nombre d'appels de dessin", () => {
      for (const { ei } of stages) {
        for (const tier of [0, 2]) {
          const now = 1234;
          const all = drawCounts({ id, ei, tier, now, pass: "all" });
          const back = drawCounts({ id, ei, tier, now, pass: "back" });
          const anim = drawCounts({ id, ei, tier, now, pass: "anim" });
          const front = drawCounts({ id, ei, tier, now, pass: "front" });
          for (const m of DRAW_METHODS) {
            expect(back[m] + anim[m] + front[m], `${id} ei=${ei} tier=${tier} ${m}`).toBe(all[m]);
          }
        }
      }
    });
  }
);
