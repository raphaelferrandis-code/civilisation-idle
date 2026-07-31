// Aucune tuile de sol ne doit être ENFERMÉE dans un liseré.
//
// Le grief (Raph 2026-07-31, capture en jeu) : « tous mes sols ont leur tuile
// enfermée par une ligne de pixels sombres ». Le défaut n'était visible dans
// aucune constante — le masque du losange pave sans trou ni recouvrement, le
// blit est 1:1. Il était PEINT dans les PNG : les lots PixelLab cuisent un
// liseré de dalle sur l'arête malgré le prompt « seamless ». Répété par cellule,
// il retrace la grille. Ce test lit donc les PNG livrés, comme
// isoRoadGroundContrast.test.js.
//
// Il importe le détecteur de scripts/derimTiles.mjs au lieu de le recopier : une
// garde qui réimplémente ce qu'elle surveille mesure sa propre copie, et les
// deux divergent au premier réglage. C'est aussi pour ça que le contrôle négatif
// ci-dessous existe — un seuil qu'aucune entrée ne franchit ne garde rien.
//
// LES DEUX SEUILS ne sont pas calés sur le pire cas observé, ce qui reviendrait
// à graver le défaut dans la garde. Ils sont posés ENTRE les deux populations,
// mesurées sur les 119 mêmes tuiles avant et après la repeinte :
//   · médiane de la 1re coquille / cœur — avant : 0,38 au pire (road-cobble-3) ;
//     après : 0,92 au pire (road-dirt-4). Seuil 0,90.
//   · excédent de pixels sombres de la 1re coquille sur le fond de la matière —
//     avant : +83 points au pire ; après : +10. Seuil 20 points.
// 66 des 119 tuiles de HEAD franchissaient ces seuils, aucune ne les franchit
// aujourd'hui. La marge est courte du côté médiane (0,92 contre 0,90) : c'est le
// prix d'un seuil posé entre les populations plutôt qu'au ras de l'une d'elles.
//
// ⚠ La mesure porte sur les pixels OPAQUES, pas sur le losange analytique. Une
// tuile 64×32 en peint 1088 quand la formule n'en compte que 1024 : les 64 de
// l'escalier extérieur sont dessinés par le moteur, et c'est justement là que se
// cachait le trait le plus noir (médiane 23 pour un cœur à 67 sur le parvis).
// Une garde qui mesurerait le losange théorique ne le verrait jamais.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import { diagnose, FAMILY, SKIP } from "../../../../scripts/derimTiles.mjs";

const DIR = new URL("../../../../public/pixelart/iso/", import.meta.url);
const MED_MIN = 0.90;
const DARK_MAX = 0.20;

// iso-grass est hors garde À CE JOUR : un lot d'hiver était en cours dans
// l'arbre (tree-*-winter, bush-*-winter non suivis) et la repeinte ne devait pas
// s'y mêler. Ses quatre variantes portent encore un liseré de 1 px, mesuré à
// 0,88 de médiane. À reprendre — `node scripts/derimTiles.mjs --only iso-grass`
// dit où on en est, et cette exception saute le jour où c'est fait.
const EN_ATTENTE = /^iso-grass/;
// iso-wonder est écarté par SKIP, et pas pour la même raison : son parvis n'a pas
// un liseré mais une DALLE EN RELIEF. Le filtre en retire bien le trait, et laisse
// des encoches là où l'escalier extérieur n'a aucun voisin sain à recopier —
// clonage comme dissolution. C'est de l'art à refaire, pas un seuil à régler.

const tuiles = fs.readdirSync(DIR)
  .filter((f) => FAMILY.test(f) && !SKIP.test(f) && !EN_ATTENTE.test(f))
  .map((f) => [f, PNG.sync.read(fs.readFileSync(new URL(f, DIR)))])
  // losange de cellule, débord des brins toléré ; au-delà c'est une dalle en
  // volume, dont le bord n'est pas une arête de cellule
  .filter(([, p]) => p.height >= p.width / 2 && p.height <= p.width / 2 + 12);

describe("liseré des tuiles de sol", () => {
  it("a de quoi mesurer", () => {
    expect(tuiles.length).toBeGreaterThan(80);
  });

  it("aucune tuile livrée n'est cernée d'un trait sombre", () => {
    const fautives = [];
    for (const [nom, png] of tuiles) {
      const d = diagnose(png);
      const ratio = d.shellMed[0] / d.coreMed;
      const exces = d.shellDark[0] - d.baseDark;
      if (ratio < MED_MIN || exces > DARK_MAX) {
        fautives.push(`${nom} — médiane ${ratio.toFixed(2)}× le cœur, ${Math.round(exces * 100)} pts de sombre en trop`);
      }
    }
    expect(fautives).toEqual([]);
  });

  // CONTRÔLE NÉGATIF. Sans lui, les deux seuils ci-dessus pourraient être
  // n'importe quoi : une garde qui passe sur tout ne dit rien. On peint le
  // défaut exact que la repeinte a retiré — un trait sombre d'un pixel sur
  // l'arête d'une matière unie — et on exige qu'elle morde.
  it("mord sur une tuile délibérément liserée", () => {
    const w = 64, h = 32;
    const png = new PNG({ width: w, height: h });
    const keeps = (x, y) => Math.abs((x + 0.5) / w - 0.5) + Math.abs((y + 0.5) / h - 0.5) <= 0.5;
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const dedans = keeps(x, y);
      const bord = dedans && (!keeps(x - 1, y) || !keeps(x + 1, y) || !keeps(x, y - 1) || !keeps(x, y + 1));
      const v = bord ? 40 : 150;
      png.data[i] = v; png.data[i + 1] = v; png.data[i + 2] = v; png.data[i + 3] = dedans ? 255 : 0;
    }
    const d = diagnose(png);
    expect(d.ring).toBeGreaterThanOrEqual(0);
    expect(d.shellMed[0] / d.coreMed).toBeLessThan(MED_MIN);
  });
});
