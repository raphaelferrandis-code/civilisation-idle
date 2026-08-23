// Sous-pavage du losange de sol (groundTileTune.rep / isoSubTileRect).
// Retour Raph 2026-07-25 : « les tuiles du sol sont trop grosses », même
// diagnostic que l'eau. La tuile ne couvre plus une cellule entière mais
// rep×rep SOUS-LOSANGES. Tout repose sur une seule promesse : ces rep² pièces
// PAVENT le losange de cellule — ni trou (fond qui transparaît) ni recouvrement
// (double blit, donc double liseré = le quadrillage qu'on passe son temps à
// retirer). C'est ce que ce fichier vérifie, à la géométrie près du moteur.
import { describe, it, expect } from "vitest";
import { isoSubTileRect, isoFaceInset, isoFaceKeeps, groundTileTune, isoTileIsFlat } from "../iso/isoGroundTiles.js";

const FW = 64, FH = 32;   // géométrie réelle de ground-cobble / iso-grass / iso-plaza

// Losange inscrit dans un rectangle, en coordonnées CONTINUES (0 = sur l'arête).
// Négatif = dedans, positif = dehors.
const dist = (px, py, r) =>
  Math.abs(px - (r.x + r.w / 2)) / (r.w / 2) + Math.abs(py - (r.y + r.h / 2)) / (r.h / 2) - 1;

describe("sous-pavage de la face de sol iso", () => {
  it("est ancré sur la MÊME géométrie que le masque de face", () => {
    // isoFaceKeeps à tolérance nulle doit être le losange de `dist` : si les deux
    // divergeaient, le remasquage final rognerait des sous-tuiles valides.
    const cell = { x: 0, y: 0, w: FW, h: FH };
    for (let y = 0; y < FH; y += 1) {
      for (let x = 0; x < FW; x += 1) {
        expect(isoFaceKeeps(x, y, FW, FH, 0)).toBe(dist(x + 0.5, y + 0.5, cell) <= 0);
      }
    }
  });

  for (const rep of [2, 3, 4]) {
    it(`rep=${rep} : les ${rep * rep} sous-losanges pavent la cellule, sans trou ni recouvrement`, () => {
      const cell = { x: 0, y: 0, w: FW, h: FH };
      const subs = [];
      for (let j = 0; j < rep; j += 1) for (let i = 0; i < rep; i += 1) subs.push(isoSubTileRect(i, j, FW, FH, rep));
      expect(subs).toHaveLength(rep * rep);
      let covered = 0, holes = 0, overlaps = 0;
      // Échantillonnage au quart de pixel : plus fin que le pixel, donc un trou
      // d'un demi-pixel ne peut pas passer entre les mailles du test.
      for (let y = 0.125; y < FH; y += 0.25) {
        for (let x = 0.125; x < FW; x += 0.25) {
          if (dist(x, y, cell) > -1e-9) continue;          // hors cellule : pas notre affaire
          covered += 1;
          let inside = 0, strictly = 0;
          for (const s of subs) {
            const d = dist(x, y, s);
            if (d <= 1e-9) inside += 1;
            if (d < -1e-9) strictly += 1;
          }
          if (inside === 0) holes += 1;                    // trou : le fond transparaîtrait
          if (strictly > 1) overlaps += 1;                 // recouvrement : double liseré
        }
      }
      expect(covered).toBeGreaterThan(1000);               // le test a bien balayé la cellule
      expect(holes).toBe(0);
      expect(overlaps).toBe(0);
    });

    it(`rep=${rep} : les sous-losanges tiennent exactement dans la face, bords compris`, () => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, area = 0;
      for (let j = 0; j < rep; j += 1) {
        for (let i = 0; i < rep; i += 1) {
          const r = isoSubTileRect(i, j, FW, FH, rep);
          x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
          x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
          area += r.w * r.h / 2;                            // aire d'un losange = w·h/2
        }
      }
      // toBeCloseTo et pas toEqual : à rep=3 le pas vaut 64/3, la somme des demi-pas
      // retombe sur 0 à 2·10⁻¹⁵ près. Bruit flottant, pas un débord.
      expect(x0).toBeCloseTo(0, 9); expect(y0).toBeCloseTo(0, 9);   // ni débord ni marge
      expect(x1).toBeCloseTo(FW, 9); expect(y1).toBeCloseTo(FH, 9);
      expect(area).toBeCloseTo(FW * FH / 2, 6);             // aire du losange de cellule
    });
  }

  it("rep=1 laisse la face intacte (retour possible à l'ancien sol)", () => {
    expect(isoSubTileRect(0, 0, FW, FH, 1)).toEqual({ x: 0, y: 0, w: FW, h: FH });
  });

  // La fenêtre échantillonnée (insetF) doit exclure le POURTOUR de la face : c'est
  // le liseré de la dalle en volume, et répété rep fois par cellule il redessine un
  // quadrillage diagonal. Vérifié en aperçu hors-jeu avant d'écrire le moteur.
  it("l'inset écarte l'échantillonnage du liseré de dalle, en gardant le 2:1", () => {
    const insetF = groundTileTune.insetF;
    expect(insetF).toBeGreaterThan(0);
    // ⚠ isoFaceInset est LU dans le moteur, pas recopié ici : une garde qui
    // recalcule la formule qu'elle teste ne mord pas (vérifié — la version
    // recopiée laissait passer un inset impair, qui écrase la fenêtre).
    const { ix, iy } = isoFaceInset(FW, insetF);
    expect(Number.isInteger(ix)).toBe(true);
    expect(Number.isInteger(iy)).toBe(true);                        // sinon la fenêtre s'écrase
    expect((FW - 2 * ix) / (FH - 2 * iy)).toBeCloseTo(FW / FH, 9);  // fenêtre restée en 2:1
    expect(ix).toBeGreaterThanOrEqual(2);                           // ~la hauteur du liseré
    expect(ix).toBeLessThan(FW / 4);                                // au-delà, on mange le motif
  });

  // Depuis la regénération (2026-07-28, sols PUIS chaussées), toutes les tuiles
  // en service sont PLATES et natives en 64×32 : elles COURT-CIRCUITENT le
  // sous-pavage via isoTileIsFlat — rep > 1 les rééchantillonnerait à un ratio
  // non entier (×1,757 à rep=2) et détruirait la grille de pixels, le défaut
  // même qui avait effacé les pierres du pavé. Le sous-pavage (et son inset)
  // reste la molette __groundTile pour toute DALLE EN VOLUME résiduelle
  // (iso-pavement, un asset regénéré avec le mauvais outil…) : la géométrie
  // testée plus haut est toujours en service. Le format 64×32 des tuiles
  // livrées est vérifié sur les ASSETS (isoGroundTileAssets.test.js) ; ici on
  // vérifie que le prédicat sépare bien les deux familles.
  it("les tuiles plates natives échappent au sous-pavage, les dalles non", () => {
    expect(isoTileIsFlat(64, 32)).toBe(true);     // sols et chaussées regénérés
    expect(isoTileIsFlat(48, 48)).toBe(false);    // anciennes road-* (dalles)
    expect(isoTileIsFlat(64, 64)).toBe(false);    // anciennes dalles / iso-pavement
  });
});
