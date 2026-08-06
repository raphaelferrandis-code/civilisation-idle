// S11 + S7 (docs/PLAN-RENDU-VILLE.md) — LA GRILLE DU SOL EST-ELLE EXACTE ?
//
// Ces deux lots n'en font qu'un. Le « +1 px anti-couture » de blitIsoTileKey
// existait parce que le pas de grille du sol était fractionnaire ; il coûtait une
// colonne et une rangée d'art DUPLIQUÉES sur chaque cellule (source 64×32 →
// destination 65×33 à z = 1). Quantifier le zoom rend le pas entier, et le blit
// redevient 1:1.
//
// Ce que le test verrouille, c'est la CHAÎNE : zoom sur un cran ⟹ hw et hh entiers
// ⟹ dw et dh entiers ⟹ blitIsoTileKey prend son chemin exact. Chaque maillon a
// déjà été cassé une fois ailleurs dans ce projet en changeant l'autre.
import { describe, it, expect, afterEach } from "vitest";
import { snapZoom, ZOOM_QUANT, ISO_X, ISO_Y } from "../iso/projection.js";

const T = 32;                     // CM.TILE
const WHEEL = 1.12;               // CAM_FEEL.wheelStep
const KEY = 1.06;                 // CAM_FEEL.keyZoom

afterEach(() => { ZOOM_QUANT.on = true; ZOOM_QUANT.per = 8; });

// Les crans réellement atteignables : de 0,375 (plancher après rabattage) à 3,125
// (plafond 3,2 rabattu vers le bas).
const crans = () => {
  const out = [];
  for (let n = 3; n <= 25; n += 1) out.push(n / 8);
  return out;
};

describe("S11 — quantification du zoom", () => {
  it("tout cran rend hw ET hh entiers (la condition de la grille exacte)", () => {
    for (const z of crans()) {
      const hw = T * z * ISO_X, hh = T * z * ISO_Y;
      expect(Number.isInteger(hw), `hw à z=${z}`).toBe(true);
      expect(Number.isInteger(hh), `hh à z=${z}`).toBe(true);
      // Le chemin exact de blitIsoTileKey exige aussi hw PAIR (il en déduit hh).
      expect(hw % 2, `hw pair à z=${z}`).toBe(0);
    }
  });

  it("et rend dw/dh entiers pour une tuile native 64×32 (donc blit 1:1)", () => {
    for (const z of crans()) {
      const hw = T * z * ISO_X;
      const bbW = 64, faceH = 32;
      const k = (hw * 2) / bbW;
      expect(bbW * k, `dw à z=${z}`).toBe(Math.round(bbW * k));
      expect(faceH * k, `dh à z=${z}`).toBe(Math.round(faceH * k));
      // …et dw vaut exactement la largeur du losange : aucun débord d'un pixel.
      expect(bbW * k).toBe(2 * hw);
    }
  });

  it("snapZoom pose toujours sur un cran", () => {
    for (const z of [0.35, 0.4, 0.61, 0.99, 1.0, 1.37, 2.03, 3.19]) {
      for (const dir of [-1, 0, 1]) {
        const s = snapZoom(z, dir);
        expect(Number.isInteger(s * ZOOM_QUANT.per), `z=${z} dir=${dir} → ${s}`).toBe(true);
      }
    }
  });

  // ⚠ LE point du lot côté ergonomie. Un pas MULTIPLICATIF de 1,12 depuis 0,375
  // rend 0,42, dont le cran le plus PROCHE est 0,375 : arrondir au plus proche
  // rendrait la molette MORTE en bas de plage. D'où l'arrondi dans le sens du
  // geste — et ce test le prouve sur toute la plage, pas sur un cas.
  it("un cran de molette bouge TOUJOURS, dans les deux sens et sur toute la plage", () => {
    for (const z of crans()) {
      if (z < 3.125) expect(snapZoom(z * WHEEL, 1), `zoom-in depuis ${z}`).toBeGreaterThan(z);
      if (z > 0.375) expect(snapZoom(z / WHEEL, -1), `zoom-out depuis ${z}`).toBeLessThan(z);
    }
  });

  it("un appui clavier aussi (pas plus fin : 1,06)", () => {
    for (const z of crans()) {
      if (z < 3.125) expect(snapZoom(z * KEY, 1), `clavier + depuis ${z}`).toBeGreaterThan(z);
      if (z > 0.375) expect(snapZoom(z / KEY, -1), `clavier − depuis ${z}`).toBeLessThan(z);
    }
  });

  it("un zoom DÉJÀ posé sur un cran ne dérive pas (sinon la caméra rampe)", () => {
    for (const z of crans()) {
      expect(snapZoom(z, 1), `ceil sur ${z}`).toBe(z);
      expect(snapZoom(z, -1), `floor sur ${z}`).toBe(z);
      expect(snapZoom(z, 0), `round sur ${z}`).toBe(z);
    }
  });

  it("le rabattage des bornes va dans le bon sens", () => {
    // Le plancher monte (au cran inférieur on verrait hors de la boîte de cadrage),
    // le plafond descend.
    expect(snapZoom(0.35, 1)).toBeGreaterThanOrEqual(0.35);
    expect(snapZoom(0.35, 1)).toBe(0.375);
    expect(snapZoom(3.2, -1)).toBeLessThanOrEqual(3.2);
    expect(snapZoom(3.2, -1)).toBe(3.125);
  });

  // La molette d'A/B doit rendre le zoom VRAIMENT continu, sinon la comparaison
  // avant/après du lot ne montre rien.
  it("__zoomQuant(0) rend le zoom continu — et là la grille N'EST PLUS exacte", () => {
    ZOOM_QUANT.on = false;
    expect(snapZoom(1.37, 1)).toBe(1.37);
    // Contrôle inverse : c'est bien ce que le lot corrige. Sans quantification, la
    // plupart des zooms atteints par la molette donnent un pas fractionnaire, donc
    // le +1 (et le pixel dupliqué) restent nécessaires.
    let frac = 0;
    let z = 1;
    for (let i = 0; i < 12; i += 1) { z *= WHEEL; if (!Number.isInteger(T * z * ISO_Y)) frac += 1; }
    expect(frac).toBeGreaterThanOrEqual(11);
  });
});
