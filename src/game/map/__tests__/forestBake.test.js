"use strict";
// LA FORÊT CUITE DANS LE SOL (audit du 2026-10-05, PERF-3, choix (d) de Raph).
// Aux niveaux ≤ 0,5, les arbres de forêt sont cuits dans les tuiles du sol et le peintre
// ne pose que ceux qu'il doit poser. La preuve d'identité au repos est un banc A/B dans
// Chrome (compte rendu du lot) ; ce fichier garde les points où elle repose sur un
// argument qu'on pourrait casser sans le voir :
//   - l'arbre cuit retombe au pixel device près où le peintre le pose, y compris sur un
//     canevas de largeur IMPAIRE (celui de Raph, 1 765 px) : origine arrondie une fois,
//     de façon déterministe, et phase du canevas ;
//   - un arbre n'est sauté que si rien de posé AVANT lui ne le recouvre (marques, arbre
//     posé, tuile pas à jour), et le verdict du repos coupe la mécanique sans profit ;
//   - les arbres que le peintre écarte (places, terre-pleins) sont ceux que la cuisson
//     écarte ; la variante d'un arbre est la même des deux côtés ;
//   - l'empreinte d'une tuile ne dépend que de son contenu.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CM } from "../layout.js";
import { camSpace, camForTile, tileSideCss, gutterCss } from "../iso/solPyramide.js";
import { screenOrigin } from "../iso/solPyramideFrame.js";
import {
  FOREST_BAKE, canvasPhase, diamondHitsRect, forestSigOf, treeBlockedIn, treeTvNow, treeTileXY,
  forestBakeNoteGround, forestBakeFrame, fbTree, fbMark, fbEnd,
} from "../iso/forestBake.js";
import { TREE_DEAD_VARIANT } from "../iso/isoGroundProps.js";

// La caméra de RENDU, comme drawIsoWorld la pose (quantifiée au pixel device).
function camRendu(camX, camY, z, dpr) {
  const ku = z * dpr, kv = 0.5 * z * dpr;
  const u = Math.round((camX - camY) * ku) / ku, v = Math.round((camX + camY) * kv) / kv;
  return { x: (u + v) / 2, y: (v - u) / 2 };
}

describe("forêt cuite — même pixel que le peintre", () => {
  it("la phase d'un canevas : nulle en largeur device paire, −½ en impaire", () => {
    expect(canvasPhase(2456, 1)).toBe(0);
    expect(canvasPhase(1765, 1)).toBe(-0.5);
    expect(canvasPhase(1600, 1.25)).toBe(0);
    expect(canvasPhase(1245, 1)).toBe(-0.5);
  });

  it("l'origine des tuiles s'arrondit toujours dans le même sens, quel que soit le bruit flottant", () => {
    // Caméra quantifiée : c·dpr entier au bruit près ; largeur impaire : demi-pixel pile.
    for (const noise of [1e-12, -1e-12, 3e-10, -3e-10, 0]) {
      const o = screenOrigin({ x: 400 + noise, y: 120 - noise }, 1765, 1245, 1);
      expect(o).toEqual({ x: Math.round(1765 / 2 - 400), y: Math.round(1245 / 2 - 120) });
    }
    // Hors caméra quantifiée : l'arrondi d'avant.
    expect(screenOrigin({ x: 400.3, y: 0 }, 1000, 800, 1).x).toBe(Math.round(500 - 400.3));
  });

  it("l'arbre cuit dans sa tuile tombe, à l'écran, au pixel device où le peintre le pose", () => {
    let graine = 11;
    const alea = () => ((graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const G = gutterCss();
    let n = 0;
    for (const [cw, ch, dpr] of [[1765, 1162, 1], [2456, 1245, 1], [1600, 900, 1.25], [1601, 901, 1.5]]) {
      for (const z of [0.25, 0.375, 0.5]) {
        const S = tileSideCss(dpr, z);
        const phx = canvasPhase(cw, dpr), phy = canvasPhase(ch, dpr);
        for (let i = 0; i < 300; i += 1) {
          const cam = camRendu(1000 + alea() * 8000, 1000 + alea() * 8000, z, dpr);
          const c = camSpace(cam.x, cam.y, z);
          const org = screenOrigin(c, cw, ch, dpr);
          // Un pied d'arbre quelque part à l'écran, une toile de 20 à 45 px.
          const fx = cam.x + (alea() - 0.5) * 2000, fy = cam.y + (alea() - 0.5) * 2000, hpx = 20 + alea() * 25;
          // Le peintre (isoLivePaint) : worldToScreen, puis x − hpx/2, y − 0,92·hpx.
          const dx = fx - cam.x, dy = fy - cam.y;
          const liveX = ((dx - dy) * z + cw / 2 - hpx / 2) * dpr, liveY = ((dx + dy) * 0.5 * z + ch / 2 - hpx * 0.92) * dpr;
          // La cuisson : la tuile qui contient le coin, sa caméra, puis la pose de la
          // tuile à l'écran (drawPart : source à G·dpr, destination org + origine tuile).
          const X = (fx - fy) * z - hpx / 2, Y = (fx + fy) * 0.5 * z - hpx * 0.92;
          const tx = Math.floor(X / S), ty = Math.floor(Y / S);
          const p = treeTileXY(fx, fy, hpx, camForTile(tx, ty, S, z), S + 2 * G, z, phx / dpr, phy / dpr);
          const bakedX = p.x * dpr - G * dpr + Math.round((tx * S + org.x) * dpr);
          const bakedY = p.y * dpr - G * dpr + Math.round((ty * S + org.y) * dpr);
          expect(Math.abs(bakedX - liveX)).toBeLessThan(1e-6);
          expect(Math.abs(bakedY - liveY)).toBeLessThan(1e-6);
          n += 1;
        }
      }
    }
    expect(n).toBe(3600);
  });
});

describe("forêt cuite — géométrie et règles partagées", () => {
  it("losange contre rectangle", () => {
    expect(diamondHitsRect(0, 0, 10, 5, -1, -1, 1, 1)).toBe(true);
    expect(diamondHitsRect(0, 0, 10, 5, 6, 3, 9, 9)).toBe(false);   // coin hors du losange
    expect(diamondHitsRect(0, 0, 10, 5, 4, 2, 9, 9)).toBe(true);
    expect(diamondHitsRect(0, 0, 10, 5, -30, -30, -11, 30)).toBe(false);
  });

  it("l'empreinte d'une tuile : son contenu, pas l'ordre de l'énumération", () => {
    expect(forestSigOf([], 0, 0)).toBe(0);
    const a = forestSigOf([11, 22, 33], 0, 0);
    expect(forestSigOf([33, 11, 22], 0, 0)).toBe(a);
    expect(forestSigOf([11, 22, 34], 0, 0)).not.toBe(a);
    expect(forestSigOf([11, 22], 0, 0)).not.toBe(a);
    expect(forestSigOf([11, 22, 33], 0, -0.5)).not.toBe(a);         // une autre phase de canevas
    expect(forestSigOf([0], 0, 0)).not.toBe(0);                      // jamais « aucun arbre »
  });

  it("les arbres écartés par le peintre (places, terre-pleins) : la même règle", () => {
    const places = [{ gx0: 10, gx1: 14, gy0: 10, gy1: 12 }];
    expect(treeBlockedIn(places, [], 8.5, 11)).toBe(true);
    expect(treeBlockedIn(places, [], 8.4, 11)).toBe(false);
    expect(treeBlockedIn(places, [], 15.5, 13.5)).toBe(true);
    const tp = [{ axis: "v", x: 20, y0: 5, y1: 9 }, { axis: "h", y: 30, x0: 2, x1: 6 }];
    expect(treeBlockedIn([], tp, 20, 7)).toBe(true);
    expect(treeBlockedIn([], tp, 22, 7)).toBe(false);
    expect(treeBlockedIn([], tp, 4, 30)).toBe(true);
  });

  it("la variante : celle du peintre (sapin mort hors hiver remplacé, conifère mort en hiver)", () => {
    const mort = { gx: 3, gy: 4, v: TREE_DEAD_VARIANT };
    const vif = treeTvNow(mort, 2, false);
    expect(vif).not.toBe(TREE_DEAD_VARIANT);
    expect(treeTvNow(mort, 2, false)).toBe(vif);                     // mémoïsé sur l'arbre
    expect(treeTvNow(mort, 2, true)).toBe(TREE_DEAD_VARIANT);
    expect(treeTvNow({ gx: 1, gy: 1, v: 3, dead: true }, 2, true)).toBe(TREE_DEAD_VARIANT);
    expect(treeTvNow({ gx: 1, gy: 1, v: 3, dead: true }, 2, false)).toBe(3);
  });
});

describe("forêt cuite — le peintre ne saute que ce que rien ne recouvre", () => {
  const SAVED = ["cam", "cw", "ch", "ships", "riotDraw", "hover"];
  let saved, lv;
  const W = 800, H = 600;
  beforeEach(() => {
    saved = Object.fromEntries(SAVED.map((k) => [k, CM[k]]));
    CM.cam = { x: 0, y: 0, zoom: 0.5 }; CM.cw = W; CM.ch = H; CM.ships = []; CM.riotDraw = null; CM.hover = null;
    FOREST_BAKE.juge = false; FOREST_BAKE.minShare = 0;   // le verdict du repos a son propre test
    lv = { recs: new WeakMap(), geos: new WeakMap(), masks: new Map(), S: 128, hmax: 40, imgs: [], T: 32, z: 0.5, dpr: 1, band: 0, deadOk: false };
  });
  afterEach(() => { Object.assign(CM, saved); FOREST_BAKE.juge = true; FOREST_BAKE.minShare = 0.05; forestBakeNoteGround(null); });

  // Un arbre cuit, sa boîte (espace tuile = écran ici : offX = offY = 0, s = 1).
  const tree = (x, y, d, bake = true) => {
    const tr = { gx: 0, gy: 0 };
    lv.recs.set(tr, { tr, img: {}, hpx: 20, cx: x, cy: y, x0: x, y0: y, x1: x + 20, y1: y + 20, foot: y + 18, d, bake, mask: null });
    return { kind: "tree", tr, d };
  };
  const ground = (fresh = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4]]) => forestBakeNoteGround({
    lv, z: 0.5, s: 1, zoom: 0.5, camX: 0, camY: 0, cw: W, ch: H, quant: true, offX: 0, offY: 0,
    fresh: new Set(fresh.map(([tx, ty]) => (tx + 32768) * 65536 + ty + 32768)), vis: { tx0: 0, tx1: 6, ty0: 0, ty1: 4 },
  });
  // Le peintre : marque ce qu'il pose, juge chaque arbre (cf. isoLivePaint).
  const paint = (items) => {
    const fr = forestBakeFrame(32, 0.5, 0, items);
    const out = [];
    for (const it of items) {
      if (!fr) { if (it.kind === "tree") out.push(false); continue; }
      if (it.kind === "tree") out.push(fbTree(fr, it.tr)); else fbMark(fr, it);
    }
    if (fr) fbEnd(fr);
    return { fr, out };
  };

  it("un arbre cuit sur une tuile à jour, rien devant : sauté", () => {
    ground();
    expect(paint([tree(300, 300, 1000)]).out).toEqual([true]);
  });

  it("un passant posé AVANT lui, sur sa boîte : posé ; APRÈS lui : sauté", () => {
    ground();
    // L'arbre : boîte (300..320, 300..320), pied à y = 318, soit la profondeur 1 272.
    // Le passant à (wx, wy) = (920, 300) tombe à l'écran en (310, 305) : sur l'arbre.
    const cit = (d) => ({ kind: "cit", gwx: 920, gwy: 300, d });
    expect(paint([cit(1220), tree(300, 300, 1272)]).out).toEqual([false]);
    expect(paint([tree(300, 300, 1272), cit(1300)]).out).toEqual([true]);
    // Un passant derrière l'arbre mais trop haut à l'écran pour l'atteindre : sauté.
    expect(paint([{ kind: "cit", gwx: 700, gwy: 0, d: 700 }, tree(300, 300, 1272)]).out).toEqual([true]);
  });

  it("un arbre posé par le peintre recouvre celui qui le suit : la contagion le fait poser", () => {
    // Le premier n'est pas candidat (sa tuile n'est pas à jour) : posé, et il recouvre le second.
    ground([[2, 2], [3, 2], [2, 3], [3, 3]]);
    const a = tree(250, 120, 900), b = tree(260, 300, 1000);
    expect(paint([a, b]).out).toEqual([false, true]);       // a est loin : b sauté
    const c = tree(255, 290, 950);                           // c recouvre b, mais sa tuile (1, 2) n'est pas à jour
    expect(paint([c, b]).out).toEqual([false, false]);
  });

  it("une tuile visible pas à jour sous l'arbre : posé", () => {
    ground([[0, 0]]);
    expect(paint([tree(300, 300, 1000)]).out).toEqual([false]);
  });

  it("un genre d'objet inconnu marque tout l'écran", () => {
    ground();
    expect(paint([{ kind: "inconnu", d: 10 }, tree(300, 300, 1000)]).out).toEqual([false]);
  });

  it("le verdict du repos : sans profit, la vue suivante ne marque plus rien — sauf molette", () => {
    ground();
    // 1 arbre, 4 000 objets loin de lui : 4 µs de gain contre 1 000 µs de marques.
    const filler = Array.from({ length: 4000 }, (_, i) => ({ kind: "cit", gwx: 3000 + i, gwy: 3000, d: 5000 + i }));
    const items = [tree(300, 300, 1000), ...filler];
    FOREST_BAKE.juge = true;
    expect(paint(items).fr).not.toBeNull();
    expect(paint(items).fr).toBeNull();                      // même vue : jugée sans profit
    FOREST_BAKE.juge = false;
    expect(paint(items).fr).not.toBeNull();
  });
});
