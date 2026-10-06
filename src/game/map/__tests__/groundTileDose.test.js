// S2 — LA DOSE DU PAVÉ (docs/PLAN-RENDU-VILLE.md), et ce qui la justifie.
//
// Le grief « brouillon » de Raph vient pour partie du GRAIN de la matière de sol :
// mesuré sur les PNG livrés, `ground-cobble` porte 18,4 points d'écart de luminance
// entre pixels VOISINS, quatre à six fois plus que toutes les autres pierres — et
// c'est la matière des bandes 2 et 3, celles de sa capture. La tuile est blittée
// 1:1 à l'écran (cf. lot S7), donc ces 18,4 points sont bien des pixels d'écran.
//
// La dose (`URBAN_TILE_A.cobble = 0,6`, arbitrée sur planche le 2026-08-05) n'est
// donc pas un goût : elle répond à un chiffre. Ce test garde les DEUX bouts —
// la dose ET la mesure qui la justifie. Si un jour les tuiles de pavé sont
// régénérées avec un grain calme, c'est le second `it` qui tombera, et il faudra
// rouvrir la dose au lieu de la traîner.
//
// ⚠ Troisième garde : doser ne laisse aucun trou UNIQUEMENT parce que l'aplat de ton
// est peint SOUS la tuile de la cellule urbaine. Elle se vérifie sur ce que la boucle
// de cuisson PEINT (sweepIsoGroundCells, contexte enregistreur) : elle lisait jadis
// une formule dans le texte de isoGroundCells.js, au caractère près (audit 2026-10-05,
// TEST-11) — un reformatage la cassait, un autre chemin de peinture lui échappait.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import { URBAN_TILE_A, URBAN_DETAIL } from "../iso/isoGroundDetail.js";
import { ISO_TILE_VARIANTS, isoTileCache } from "../iso/isoGroundTiles.js";
import { sweepIsoGroundCells } from "../iso/isoGroundCells.js";
import { rgb } from "../iso/isoPalette.js";
import { CM } from "../layout.js";
import { lum } from "../../../test/pixels.js";

const ISO = new URL("../../../../public/pixelart/iso/", import.meta.url);

// Grain d'une matière = moyenne des |ΔL| entre pixels ADJACENTS (H et V), sur les
// pixels opaques, moyennée sur ses variantes. C'est la texture que l'œil lit, pas
// l'écart-type global (une tuile peut être très contrastée et parfaitement lisse).
function grain(key) {
  const n = ISO_TILE_VARIANTS[key] || 0;
  const names = n > 1 ? Array.from({ length: n }, (_, i) => `${key}-${i + 1}.png`) : [`${key}.png`];
  let acc = 0, used = 0;
  for (const name of names) {
    const url = new URL(name, ISO);
    if (!fs.existsSync(url)) continue;
    const p = PNG.sync.read(fs.readFileSync(url));
    const L = new Float64Array(p.width * p.height);
    const A = new Uint8Array(p.width * p.height);
    for (let i = 0; i < p.width * p.height; i += 1) {
      A[i] = p.data[i * 4 + 3] >= 128 ? 1 : 0;
      L[i] = lum(p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2]);
    }
    let s = 0, m = 0;
    for (let y = 0; y < p.height; y += 1) {
      for (let x = 0; x < p.width; x += 1) {
        const i = y * p.width + x;
        if (!A[i]) continue;
        if (x + 1 < p.width && A[i + 1]) { s += Math.abs(L[i] - L[i + 1]); m += 1; }
        if (y + 1 < p.height && A[i + p.width]) { s += Math.abs(L[i] - L[i + p.width]); m += 1; }
      }
    }
    if (m) { acc += s / m; used += 1; }
  }
  return used ? acc / used : NaN;
}

describe("S2 — dose de la tuile de sol par matière", () => {
  it("chaque matière de sol est dosée, sauf la terre battue", () => {
    expect(URBAN_TILE_A.cobble).toBeGreaterThan(0.3);   // pas un aplat : refus de juillet
    expect(URBAN_TILE_A.cobble).toBeLessThan(1);        // …mais bien dosé
    // La dalle (bandes 4-5) : dosée pour que la GRILLE des cases ne se lise plus
    // (2026-09-30, maquette vivante) — pas pour son grain, qui est bas.
    expect(URBAN_TILE_A.flagstone).toBeGreaterThanOrEqual(0.2);
    expect(URBAN_TILE_A.flagstone).toBeLessThan(0.6);
    // Béton et dalle tech : DOSÉS à leur tour depuis la bible des surfaces (2026-10-01,
    // isoSurfaceBible.test.js) — non pour leur grain, bas, mais pour ce que la tuile
    // pleine faisait à l'échelle de la ville : des dalles de valeurs différentes dans
    // chaque tuile (béton), une dalle plus sombre que sa propre chaussée (tech).
    expect(URBAN_TILE_A.concrete).toBeGreaterThanOrEqual(0.3);
    expect(URBAN_TILE_A.concrete).toBeLessThan(1);
    expect(URBAN_TILE_A.tech).toBeGreaterThanOrEqual(0.2);
    expect(URBAN_TILE_A.tech).toBeLessThan(1);
    // La terre battue garde son réglage HISTORIQUE partagé (`tileA`) : `null` =
    // « suit tileA ». La remplacer par un nombre couperait ce lien en silence.
    expect(URBAN_TILE_A.earth).toBeNull();
  });

  // ⚠ LE point du test : la dose répond à une MESURE. Si l'art change, elle tombe.
  it("mord : le pavé est bien la matière la plus bruyante, de loin", () => {
    const cobble = grain("ground-cobble");
    const autres = ["ground-flagstone", "ground-concrete", "ground-earth", "ground-tech"]
      .map((k) => ({ k, g: grain(k) }))
      .filter((e) => Number.isFinite(e.g));
    expect(autres.length).toBeGreaterThanOrEqual(3);
    expect(cobble).toBeGreaterThan(12);
    for (const { k, g } of autres) {
      expect(cobble / g, `pavé (${cobble.toFixed(1)}) vs ${k} (${g.toFixed(1)})`).toBeGreaterThan(2);
    }
  });

  // GARDE DE RÉSULTAT : c'est l'aplat de ton posé SOUS la tuile dosée qui fait que la
  // dose ne laisse pas voir le fond du canvas. On fait peindre UNE cellule urbaine à
  // la boucle de cuisson, toutes tuiles prêtes, et on relit ce qu'elle a peint.
  describe("l'aplat de ton est peint SOUS la tuile urbaine", () => {
    const URB = [150, 140, 120];                       // ton du sol de ville (aplat)
    const MAT = { tile: "test-sol-matiere", type: "cobble", tone: [90, 90, 90] };
    const GENERIC = "test-sol-urbain";                 // tuile GÉNÉRIQUE du kind urbain
    const face = (tag) => ({ tag, width: 64, height: 32 });
    const ready = (tag) => ({ img: face(tag), ready: true, bbox: { x0: 0, y0: 0, w: 64, h: 32 }, face: face(tag), flat: true, over: 0 });
    // Contexte ENREGISTREUR : les remplissages (avec leur couleur) et les blits (avec
    // leur source), dans l'ordre où la boucle les pose.
    const recorder = () => {
      const ops = [];
      const ctx = {
        fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, globalAlpha: 1, imageSmoothingEnabled: true,
        fill() { ops.push({ op: "fill", style: this.fillStyle }); },
        fillRect() { ops.push({ op: "fill", style: this.fillStyle }); },
        drawImage(src) { ops.push({ op: "draw", tag: src && src.tag, alpha: this.globalAlpha }); },
      };
      for (const m of ["save", "restore", "beginPath", "moveTo", "lineTo", "closePath", "stroke", "rect", "clip", "translate", "scale"]) ctx[m] = () => {};
      return { ctx, ops };
    };
    const sweep = (ctx, lisiere = null) => sweepIsoGroundCells(
      { ctx, T: 32, hw: 32, hh: 16, LOD: false, HARD: false, b: { gx0: 0, gx1: 0, gy0: 0, gy1: 0 },
        cullOn: false, cullPadX: 0, cullPadY: 0, L: { roadSet: new Set() }, roadMap: null, riverCells: null,
        urb: URB, mat: MAT, plazaEra: "antique", wg: null, PR: null },
      { kindAt: () => "urban", grassAt: () => false, keyOfKind: () => GENERIC, lisiere },
      { fringes: [], roads: [], wonderCells: [], grassCells: [], grassMask: [], grassMaskR: [],
        faceL: [], faceD: [], faceLU: [], faceDU: [], faceFoot: [], faceBand: [], faceJoint: [], faceLipG: [], faceLipS: [] },
    );
    let saved;
    beforeEach(() => {
      saved = { cam: CM.cam, cw: CM.cw, ch: CM.ch, season: CM.season, detail: { ...URBAN_DETAIL } };
      Object.assign(CM, { cam: { x: 0, y: 0, zoom: 1 }, cw: 200, ch: 200, season: 0 });
      Object.assign(URBAN_DETAIL, { on: true, tiles: true });
      // Les DEUX tuiles prêtes : si la générique ne se peint pas, c'est la règle
      // (alpha 0 pour l'urbain), pas un PNG absent.
      isoTileCache.set(GENERIC, ready("generique"));
      isoTileCache.set(MAT.tile, ready("matiere"));
    });
    afterEach(() => {
      Object.assign(CM, { cam: saved.cam, cw: saved.cw, ch: saved.ch, season: saved.season });
      Object.assign(URBAN_DETAIL, saved.detail);
      isoTileCache.delete(GENERIC);
      isoTileCache.delete(MAT.tile);
    });

    it("cellule pleine : l'aplat d'abord, puis la tuile de la matière, dosée ; jamais la tuile générique", () => {
      const { ctx, ops } = recorder();
      sweep(ctx);
      const aplat = ops.findIndex((o) => o.op === "fill" && o.style === rgb(URB, 1));
      const tuile = ops.findIndex((o) => o.op === "draw" && o.tag === "matiere");
      expect(aplat, "aucun aplat du ton de ville").toBeGreaterThanOrEqual(0);
      expect(tuile, "la tuile de la matière n'est pas peinte").toBeGreaterThan(aplat);
      expect(ops[tuile].alpha).toBeCloseTo(URBAN_TILE_A.cobble, 9);
      expect(ops.some((o) => o.tag === "generique"), "la tuile générique est peinte sur l'urbain").toBe(false);
    });

    it("cellule de BORD (lisière arrondie) : même ordre, dans ses rectangles", () => {
      const { ctx, ops } = recorder();
      const lisiere = { runs: () => ({ byKind: new Map([["urban", [-20, 0, 20, 20]]]), blades: [] }) };
      sweep(ctx, lisiere);
      const aplat = ops.findIndex((o) => o.op === "fill" && o.style === rgb(URB, 1));
      const tuile = ops.findIndex((o) => o.op === "draw" && o.tag === "matiere");
      expect(aplat, "aucun aplat du ton de ville").toBeGreaterThanOrEqual(0);
      expect(tuile, "la tuile de la matière n'est pas peinte").toBeGreaterThan(aplat);
      expect(ops.some((o) => o.tag === "generique"), "la tuile générique est peinte sur l'urbain").toBe(false);
    });
  });
});
