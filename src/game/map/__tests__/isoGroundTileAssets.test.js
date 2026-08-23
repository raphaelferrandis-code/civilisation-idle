// Les TUILES DE SOL livrées tiennent-elles la promesse sur laquelle le moteur
// s'appuie ? Ce test lit les PNG de public/pixelart/iso/, pas des constantes.
//
// Pourquoi lire les assets. Trois réglages du renderer ne sont corrects QUE si
// l'art a une certaine forme, et chacun a déjà coûté un aller-retour :
//   • le court-circuit du sous-pavage (isoTileIsFlat → blit 1:1) suppose que la
//     tuile fait exactement le losange d'une cellule à zoom 1 (64×32). Une tuile
//     64×64 (vue de dessus non projetée) ou 48×48 repasserait silencieusement
//     par le rééchantillonnage à ratio non entier — ce qui avait effacé toutes
//     les pierres du pavé.
//   • le masque losange et `insetF` ne sont plus nécessaires parce que les
//     tuiles sont PLATES. Une tuile régénérée en « dalle en volume » (l'ancien
//     `create_isometric_tile`) ferait revenir le liseré latéral, donc le
//     quadrillage diagonal sur toute la ville — sans rien casser de visible ici.
//   • les variantes ne cassent la répétition que si elles ne diffèrent PAS en
//     valeur. Un lot mal groupé (les lots PixelLab sont tantôt rangés par
//     rangée, tantôt par colonne) donne quatre matières différentes sous une
//     même clé : 149 à 194 d'écart de luminance, contre 1 à 50 pour de vraies
//     variantes.
//
// La géométrie du losange vient de `isoFaceKeeps`, LU dans le moteur : recopier
// la formule reviendrait à comparer le test à lui-même.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import { isoFaceKeeps, isoVariantKey, ISO_TILE_VARIANTS } from "../iso/isoGroundTiles.js";

const DIR = new URL("../../../../public/pixelart/iso/", import.meta.url);
const FW = 64, FH = 32;          // losange d'une cellule à zoom 1 (TILE=32, cf. projection.js)

const read = (name) => PNG.sync.read(fs.readFileSync(new URL(name, DIR)));
const meanRGB = (p) => {
  const s = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < p.width * p.height; i += 1) {
    if (p.data[i * 4 + 3] < 128) continue;
    for (let c = 0; c < 3; c += 1) s[c] += p.data[i * 4 + c];
    n += 1;
  }
  return { mean: s.map((v) => v / n), n };
};
const lum = (m) => 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];

const KEYS = Object.keys(ISO_TILE_VARIANTS);

describe("tuiles de sol livrées", () => {
  it("déclare au moins les huit matières de sol", () => {
    expect(KEYS.length).toBeGreaterThanOrEqual(8);
  });

  // DÉBORD EN PERSPECTIVE : l'herbe est la seule matière autorisée à dépasser —
  // PNG 64×(32+OV], OV ≤ 12, brins au-dessus du losange qui recouvrent le voisin
  // du nord au blit (« au sud du sol, elle passe devant », Raph 2026-07-28).
  // C'est le prédicat e.over du moteur : hauteur dans (w/2, w/2+12].
  const OVERSHOOT_MAX = { 'iso-grass': 12, 'iso-grass-winter': 12 };
  // Plancher de remplissage du losange par clé. Les deux herbes gardent leurs
  // petits creux entre brins (~0,98 mesuré), rien de plus.
  // ⚠ CE PLANCHER ÉTAIT À 0,55 POUR L'HIVER, et c'est ce qui a laissé passer le
  // défaut : trois variantes sur quatre ne remplissaient leur losange qu'à 61 à
  // 84 %, ce que Raph a vu en jeu le 2026-07-31 (« une bande transparente sur la
  // tuile »). Le 0,55 s'appuyait sur une variante « éparse » mesurée à 0,614 —
  // sauf que ces 39 % manquants n'étaient PAS des creux entre brins : c'était un
  // pan entier du losange, une tuile de la rangée 3 du lot dont l'art ne fait
  // que 56×28. Un plancher calé sur le pire cas OBSERVÉ ne mesure plus rien : il
  // recopie le défaut. Celui-ci est calé sur ce que l'art SAIN produit (98,7 %
  // au pire des huit tuiles d'herbe, été et hiver confondus).
  const FILL_MIN = { 'iso-grass': 0.9, 'iso-grass-winter': 0.95 };

  for (const key of KEYS) {
    const n = ISO_TILE_VARIANTS[key];
    const ovMax = OVERSHOOT_MAX[key] || 0;

    it(`${key} : ses ${n} variantes existent, en 64×32${ovMax ? ' (+ débord ≤ ' + ovMax + ')' : ' (blit 1:1)'}`, () => {
      for (let v = 1; v <= n; v += 1) {
        const p = read(`${key}-${v}.png`);
        expect(p.width).toBe(FW);
        expect(p.height).toBeGreaterThanOrEqual(FH);
        expect(p.height).toBeLessThanOrEqual(FH + ovMax);
      }
    });

    it(`${key} : losange PLEIN, débord seulement en MOITIÉ HAUTE`, () => {
      for (let v = 1; v <= n; v += 1) {
        const p = read(`${key}-${v}.png`);
        const OV = p.height - FH;                  // 0 sauf herbe
        let outLow = 0, inside = 0, opaque = 0;
        for (let y = 0; y < p.height; y += 1) {
          for (let x = 0; x < FW; x += 1) {
            const a = p.data[(y * FW + x) * 4 + 3];
            const yD = y - OV;                     // repère du losange (ancré en bas)
            const keep = yD >= 0 && isoFaceKeeps(x, yD, FW, FH);
            if (keep) {
              inside += 1;
              if (a > 16) opaque += 1;
            } else if (a > 16 && yD >= FH / 2) {
              // Hors losange en MOITIÉ BASSE = épaisseur de dalle revenue, ou un
              // débord qui mordrait sur des voisins peints APRÈS la cellule.
              outLow += 1;
            }
          }
        }
        expect(outLow).toBe(0);
        // …et le losange est REMPLI : une tuile trouée laisserait voir l'aplat en
        // résille — sauf plancher par clé (creux voulus de l'herbe, cf. FILL_MIN).
        expect(opaque / inside).toBeGreaterThan(FILL_MIN[key] || 0.97);
      }
    });

    it(`${key} : ses variantes sont bien UNE matière (pas un lot mal groupé)`, () => {
      const Ls = [];
      for (let v = 1; v <= n; v += 1) Ls.push(lum(meanRGB(read(`${key}-${v}.png`)).mean));
      // Les variantes restent BRUTES — Raph veut leurs écarts clair/sombre, c'est
      // le patchwork (l'égalisation qui les gommait a été retirée, 2026-07-28).
      // Ce qui reste interdit, c'est le lot PixelLab mal groupé (rangé par colonne
      // et lu par rangée) : quatre MATIÈRES différentes sous une même clé. Mesuré
      // 1 à 50 d'écart de luminance pour de vraies variantes, 149 à 194 pour un
      // groupement faux — le seuil 60 est la même garde que fetchGroundTiles.
      // L'herbe d'HIVER est l'exception assumée (65,9 mesuré) : sa couverture de
      // neige varie PAR CHOIX d'une variante à l'autre (congères au niveau des
      // tuiles), quartet choisi à l'œil — même dérogation que `spreadMax` côté
      // script, et même valeur : 75, pas les 110 d'avant, qui laissaient passer
      // n'importe quel groupement une fois le quartet ramené à la rangée 2.
      const max = key === 'iso-grass-winter' ? 75 : 60;
      expect(Math.max(...Ls) - Math.min(...Ls)).toBeLessThan(max);
    });
  }

  // Le tirage de variante : c'est lui qui décide ce qu'on voit sur chaque cellule.
  it("tire les variantes uniformément, et SANS damier sur les cellules voisines", () => {
    const key = "ground-cobble", n = ISO_TILE_VARIANTS[key];
    // cmHash est privé à layout.js : on rejoue le FNV-1a du moteur sur des clés de
    // cellule réelles ('gx,gy'), c'est l'entrée que isoVariantKey reçoit en vrai.
    const h = (t) => {
      let x = 2166136261;
      for (let i = 0; i < t.length; i += 1) { x ^= t.charCodeAt(i); x = Math.imul(x, 16777619); }
      return x >>> 0;
    };
    const idx = (gx, gy) => isoVariantKey(key, h(gx + "," + gy));
    const count = new Map();
    let same = 0, pairs = 0;
    for (let gy = 0; gy < 60; gy += 1) {
      for (let gx = 0; gx < 60; gx += 1) {
        const k = idx(gx, gy);
        count.set(k, (count.get(k) || 0) + 1);
        if (gx > 0) { pairs += 1; if (idx(gx - 1, gy) === k) same += 1; }
        if (gy > 0) { pairs += 1; if (idx(gx, gy - 1) === k) same += 1; }
      }
    }
    expect(count.size).toBe(n);
    for (const c of count.values()) expect(c / 3600).toBeGreaterThan(0.2);   // ~0.25 attendu
    // ⚠ LE point du test. Sur FNV-1a les bits faibles ne portent guère que la
    // parité de l'entrée : tirer sur eux fabrique un damier, et la répartition
    // globale reste PARFAITE — le comptage ci-dessus ne voit rien. Vérifié en
    // cassant la garde : `h >>> 0` au lieu de `h >>> 5` dans isoVariantKey fait
    // tomber cette assertion à 4,7 % de voisins identiques au lieu des ~25 %
    // attendus pour 4 variantes.
    expect(same / pairs).toBeGreaterThan(1 / n - 0.06);
    expect(same / pairs).toBeLessThan(1 / n + 0.06);
  });
});
