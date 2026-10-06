import { describe, it, expect, vi, afterAll } from "vitest";

// ── SCÈNES DE BÂTIMENTS : LE CHEMIN PNG, CELUI QUE VOIT LE JOUEUR ──────────────
// Audit du 05/10 (TEST-5). Sous Node, `Image` n'existe pas : propReady() et
// animReady() répondent toujours faux, et cityEngineSprites.test.js ne traverse
// donc QUE l'état « décor pas chargé » (où une scène ne dessine plus rien depuis
// MORT-2). Or une exception dans une branche « prop prêt » est avalée en jeu par
// la quarantaine d'isoEngineScene : la scène devient un socle gris pour la
// session, sans le moindre échec en CI.
//
// Ici, une Image DÉJÀ PRÊTE est posée sur globalThis AVANT tout import (vi.hoisted
// passe devant les import) : propImg / animImg sont des états de MODULE, remplis
// une seule fois par le premier dessin. Fichier SÉPARÉ pour la même raison — dans
// le fichier sans Image, l'ordre d'exécution décidait du chemin parcouru (rouge en
// ordre mélangé, audit du 05/10).
const { ImagePrete } = vi.hoisted(() => {
  class ImagePrete {
    constructor() { this.complete = true; this.naturalWidth = 192; this.naturalHeight = 160; this.width = 192; this.height = 160; this.onload = null; }
    set src(v) { this._src = v; if (this.onload) this.onload(); }
    get src() { return this._src; }
  }
  vi.stubGlobal("Image", ImagePrete);
  return { ImagePrete };
});

import { CM_MAP_BUILDINGS } from "../cityBuildings.js";
import { drawEngineSprite } from "../engineSprites.js";
import { blitProp, blitAnim, propReady, animReady, setEngineSpan } from "../cityEngineSprites.js";
import { drawIsoEngineScene, isoEngineSceneBox, isoSceneQuarantineSize } from "../iso/isoEngineScene.js";
import { engineAnimNow } from "../engineAnim.js";
import { CM } from "../layout.js";

afterAll(() => { vi.unstubAllGlobals(); });

// Contexte 2D factice : les méthodes d'un VRAI CanvasRenderingContext2D, rien de
// plus — une méthode inventée lève ici comme dans le navigateur (un Proxy « tout
// est une fonction » l'aurait laissée passer). Compte les drawImage : la preuve
// que le chemin PNG a bien été pris.
const CTX_METHODS = [
  "arc", "arcTo", "beginPath", "bezierCurveTo", "clearRect", "clip", "closePath",
  "drawFocusIfNeeded", "drawImage", "ellipse", "fill", "fillRect", "fillText",
  "lineTo", "moveTo", "putImageData", "quadraticCurveTo", "rect", "reset",
  "resetTransform", "restore", "rotate", "roundRect", "save", "scale",
  "setLineDash", "setTransform", "stroke", "strokeRect", "strokeText",
  "transform", "translate",
];
function makeCtx() {
  const grad = { addColorStop: () => {} };
  const ctx = {
    canvas: { width: 512, height: 512 },
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt", lineJoin: "miter",
    globalAlpha: 1, globalCompositeOperation: "source-over", imageSmoothingEnabled: false,
    filter: "none", font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic",
    shadowBlur: 0, shadowColor: "transparent", shadowOffsetX: 0, shadowOffsetY: 0,
    _images: 0,
  };
  for (const m of CTX_METHODS) ctx[m] = () => {};
  ctx.drawImage = () => { ctx._images += 1; };
  ctx.createLinearGradient = () => grad;
  ctx.createRadialGradient = () => grad;
  ctx.createConicGradient = () => grad;
  ctx.createPattern = () => ({ setTransform: () => {} });
  ctx.measureText = (s) => ({ width: String(s).length * 5 });
  ctx.getLineDash = () => [];
  ctx.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  ctx.isPointInPath = () => false;
  ctx.getImageData = (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
  ctx.createImageData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
  return ctx;
}

// Bande d'ère d'un âge (cinq âges par bande, comme eraBandOf).
const bandOf = (ei) => Math.min(9, Math.floor(ei / 5));
const IDS = CM_MAP_BUILDINGS.map((b) => b.id);
// Familles SANS scène moteur : leurs props (ASSET-5) puis leurs branches (MORT-2) ont
// été retirés à l'audit du 05/10 — les champs irrigués sont refusés par isoEngineScene,
// les moulins cuits par isoMill, les aqueducs posés en points d'eau. Elles ne dessinent
// plus rien : on vérifie seulement qu'elles ne lèvent pas.
const SANS_PNG = new Set(["irrigated_fields", "water_mills", "aqueducts"]);

function poser(ei, nightF) {
  CM.nightF = nightF;
  CM.layout = { counts: { eraBand: bandOf(ei), eraIndex: ei } };
}

// Au moins les 29 familles d'aujourd'hui : garde contre un registre vide (le
// describe.each passerait à vide), sans tomber quand une famille s'ajoute.
it("le registre couvre les 29 familles de la carte", () => {
  expect(IDS.length).toBeGreaterThanOrEqual(29);
});

// Les 29 familles × les 50 âges × les 4 tiers × jour / nuit × empreintes 1 à 3
// (et 5 pour la bourse).
describe.each(IDS)("drawEngineSprite, props prêts — %s", (id) => {
  it("dessine tous les âges sans lever, et par le PNG", () => {
    const ctx = makeCtx();
    CM.ctx = ctx;
    const sizes = id === "imperial_exchanges" ? [3, 5] : [1, 2, 3];
    for (let ei = 0; ei < 50; ei += 1) {
      for (const tier of [0, 1, 2, 3]) {
        for (const nightF of [0, 1]) {
          poser(ei, nightF);
          for (const size of sizes) {
            const groupIndex = size >= 3 ? 1 : 2 + (ei % 3);
            const t = {
              type: "engine", buildingId: id, tier, size, groupIndex, gx: 3 + ei, gy: 4 + tier,
              spanX: id === "river_ports" ? 4 : undefined, spanY: id === "river_ports" ? 3 : undefined,
              waterEnd: ei % 2 ? "W" : "E",
            };
            expect(() => drawEngineSprite(t, 0, 0, 120, 120, 1234 + ei * 97),
              `${id} âge ${ei} tier ${tier} nuit ${nightF} empreinte ${size}`).not.toThrow();
          }
        }
      }
    }
    // Le chemin PNG a réellement été parcouru (sinon ce fichier testerait à vide
    // le repli, comme l'autre).
    if (!SANS_PNG.has(id)) expect(ctx._images).toBeGreaterThan(0);
  });
});

// ── LA SCÈNE ISO EST DESSINÉE EN DIRECT (audit du 05/10, MORT-1) ───────────────
// Le cache des scènes cuites (engineSceneCache) est retiré : il éteignait les fenêtres
// de nuit et figeait les scènes vivantes, pour un drawImage remplacé par un drawImage.
// La porte d'entrée iso rend donc EXACTEMENT les appels de drawEngineSprite, posés sur
// la boîte de la scène et à l'horloge de l'instance. (Les passes 'back' / 'anim' /
// 'front', qui ne servaient que ce cache, ont suivi : plus de test de leur conservation.)
describe("drawIsoEngineScene ≡ drawEngineSprite sur sa boîte", () => {
  function rec() {
    const ctx = makeCtx(), calls = [];
    ctx.drawImage = (im, ...a) => { calls.push(String(im && im.src).split("/").pop() + ":" + a.map((v) => Math.round(v * 100) / 100).join(",")); };
    return { ctx, calls };
  }
  it.each(["foragers", "guilds", "libraries", "watch", "imperial_exchanges"])("%s", (id) => {
    CM.cam = CM.cam || {};
    CM.cam.zoom = 1;
    for (const ei of [4, 22, 32, 44]) {
      for (const nightF of [0, 1]) {
        poser(ei, nightF);
        const t = { type: "engine", buildingId: id, tier: 1, size: 2, groupIndex: 3, gx: 6, gy: 7 };
        const iso = rec();
        CM.ctx = iso.ctx;
        drawIsoEngineScene(iso.ctx, t, { x: 200, y: 200 }, 2, 2, 32, 1, 16, 4321);
        const { bx, by, bw } = isoEngineSceneBox(t, { x: 200, y: 200 }, 2, 2, 32, 1, 16);
        const direct = rec();
        CM.ctx = direct.ctx;
        drawEngineSprite(t, bx, by, bw, bw, engineAnimNow(t, 4321));
        expect(iso.calls.length, `${id} âge ${ei} nuit ${nightF}`).toBeGreaterThan(0);
        expect(iso.calls, `${id} âge ${ei} nuit ${nightF}`).toEqual(direct.calls);
      }
    }
  });
});

// Par la porte d'entrée du rendu iso : la quarantaine (le socle gris qui avale
// une exception) doit rester VIDE sur tout le parcours.
describe("drawIsoEngineScene, props prêts — aucune scène en quarantaine", () => {
  it("les 29 familles à chaque bande, de jour et de nuit", () => {
    CM.cam = CM.cam || {};
    CM.cam.zoom = 1;
    CM.capture = true;
    try {
      for (let ei = 0; ei < 50; ei += 5) {
        for (const nightF of [0, 1]) {
          poser(ei, nightF);
          for (const id of IDS) {
            const ctx = makeCtx();
            CM.ctx = ctx;
            const size = ei % 10 === 0 ? 3 : 2;
            const t = { type: "engine", buildingId: id, tier: (ei / 5) % 4, size, groupIndex: size === 3 ? 1 : 2, gx: 6, gy: 7 };
            drawIsoEngineScene(ctx, t, { x: 200, y: 200 }, size, size, 32, 1, 16, 4321 + ei);
          }
        }
      }
    } finally { CM.capture = false; }
    expect(isoSceneQuarantineSize()).toBe(0);
  });
});

// ── PALIER DU STADE 0 DU CULTE : deux couches, un seul rectangle ─────────────
// Le cercle de mégalithes est dessiné en deux temps — le prop statique par
// blitProp, la flamme par blitAnim — qui recalculent CHACUN leurs fractions
// quand le palier s'arme. Rien dans le code ne les oblige à tomber au même
// endroit : c'est une coïncidence entretenue par le manifeste (même spanSum de
// calibrage, même hFrac, mêmes proportions de canvas). Ce test la vérifie sur
// les rectangles RÉELLEMENT passés à drawImage, pas sur la table qui les
// produit — le seul moyen d'attraper une bande régénérée à un autre format.
// (Venu de cityEngineSprites.test.js : son Image prête, posée en cours de route,
// faisait passer les tests suivants du repli au PNG selon l'ordre d'exécution.)
describe("palier du cercle de mégalithes — les deux couches se superposent", () => {
  // Rectangle de destination du dernier drawImage (les 4 derniers arguments).
  function rectCtx() {
    const rects = [];
    return {
      ctx: {
        imageSmoothingEnabled: false,
        drawImage: (im, ...a) => rects.push({ src: String(im.src).split("/").pop(), r: a.slice(-4).map((v) => +Number(v).toFixed(4)) }),
      },
      rects,
    };
  }
  // Le chargement des grands est PARESSEUX : la 1re passe l'amorce et sert le
  // petit (repli voulu), la 2e sert le palier. On dessine donc deux fois.
  function poserPalier(spanSum) {
    expect(globalThis.Image).toBe(ImagePrete);
    propReady("ancestralcult-back"); animReady("ancestralcult-fire");
    const demi = spanSum / 2;
    const { ctx, rects } = rectCtx();
    for (let i = 0; i < 2; i += 1) {
      setEngineSpan(demi, demi);
      rects.length = 0;
      blitProp(ctx, 0, 0, 100, 100, "ancestralcult-back", 0.5, 0.53, 0.88, 0.73);
      blitAnim(ctx, 0, 0, 100, 100, "ancestralcult-fire", 0, 0.5, 0.53, 0.88, 0.73);
    }
    return rects;
  }

  it("à l'empreinte 3, les deux couches passent au grand DANS LE MÊME rectangle", () => {
    const rects = poserPalier(6);
    expect(rects.map((r) => r.src)).toEqual(
      ["ancestralcult-back-grand.png", "ancestralcult-fire-grand.png"]);
    expect(rects[0].r, "cercle et flamme dessinés dans des rectangles différents").toEqual(rects[1].r);
  });

  it("à l'empreinte d'atelier, aucune des deux ne bascule", () => {
    const rects = poserPalier(4);
    expect(rects.map((r) => r.src)).toEqual(
      ["ancestralcult-back.png", "ancestralcult-fire.png"]);
    expect(rects[0].r).toEqual(rects[1].r);
  });

  // Le palier n'a d'intérêt que s'il DÉSENFLE le dessin : le 96×80 étiré dans la
  // boîte d'une halle est ce qu'on vient corriger.
  it("le grand est dessiné plus petit que le petit étiré dans la même boîte", () => {
    const grand = poserPalier(6)[0].r, petit = poserPalier(4)[0].r;
    expect(grand[3]).toBeLessThan(petit[3]);
  });
});
