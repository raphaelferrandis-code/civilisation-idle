// Bandes d'eau CALMES du fleuve (public/pixelart/water/river-tiles-calm*.png).
//
// Retour Raph 2026-07-30 : « le fleuve est trop bruyant ». Mesuré sur la bande
// du pack : 48,6 % des pixels changent à CHAQUE transition et PAS UN SEUL n'est
// stable sur le cycle — ce ne sont pas huit images d'une vague, ce sont huit
// champs de bruit. `scripts/calmWaterTiles.mjs` recompose la bande : substrat
// figé, seuls les reflets réimprimés (la règle des tutos d'eau pixel art).
//
// Puis, même jour : QUATRE coloris pilotés par l'état de la partie (azur au beau
// fixe, turquoise quand l'usure monte, bleu pâle en hiver, ardoise sous l'averse).
// Les trois nouveaux gardent les couleurs NATIVES du pack — leur teinte EST
// l'information — donc le contrôle « la texture ne déplace pas le ton du fleuve »
// ne s'applique qu'à l'ardoise.
//
// Ce qu'on protège ici, c'est la PROPRIÉTÉ des assets, pas le script qui les a
// produits : les PNG sont versionnés, ils peuvent être recuits avec d'autres
// réglages ou remplacés par un autre pack.
//
// ⚠ CHAQUE GARDE A SON TÉMOIN, qui rejoue la MÊME mesure sur la bande d'origine
// et exige qu'elle ÉCHOUE. Sans lui, un seuil « churn < 15 % » ne prouve rien :
// il faut montrer qu'il refuse effectivement la matière qui a motivé le
// chantier (leçon [[lot1-comprendre-ses-chiffres]] : une garde qui ne mord pas
// est décorative).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { WATER_SHEETS } from "../iso/isoRiver.js";

const T = 16, FRAMES = 8;
const WATER = [74, 98, 109];                 // isoPalette.js — teinte du corps d'eau
const RAMP = [                               // rampe ardoise du remap (bakeWaterTiles.mjs)
  [44, 62, 72], [68, 92, 103], [92, 119, 130], [122, 150, 160], [158, 184, 192],
];

const load = (name) => {
  const p = PNG.sync.read(fs.readFileSync(path.join(process.cwd(), "public/pixelart/water", name)));
  const key = (x, y) => { const i = (y * p.width + x) * 4; return `${p.data[i]},${p.data[i + 1]},${p.data[i + 2]}`; };
  const rgbAt = (x, y) => { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i + 1], p.data[i + 2]]; };
  return { png: p, key, rgbAt };
};

// Part des pixels qui changent d'une image à la suivante, en moyenne sur le cycle.
function churn({ png, key }) {
  const F = png.width / T;
  let n = 0;
  for (let f = 0; f < F; f += 1) {
    const g = (f + 1) % F;
    for (let y = 0; y < T; y += 1) for (let x = 0; x < T; x += 1) {
      if (key(f * T + x, y) !== key(g * T + x, y)) n += 1;
    }
  }
  return 100 * n / (F * T * T);
}

// Part des pixels identiques sur TOUT le cycle — le « socle » qui ne bout pas.
function socle({ png, key }) {
  const F = png.width / T;
  let n = 0;
  for (let y = 0; y < T; y += 1) for (let x = 0; x < T; x += 1) {
    let same = true;
    for (let f = 1; f < F && same; f += 1) if (key(f * T + x, y) !== key(x, y)) same = false;
    if (same) n += 1;
  }
  return 100 * n / (T * T);
}

// Raccord : discontinuité au bord de tuile / discontinuité interne. ~1 = seamless.
function raccord({ png, rgbAt }) {
  const F = png.width / T;
  const d = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  let worst = 0;
  for (let f = 0; f < F; f += 1) {
    const o = f * T;
    let wH = 0, iH = 0, wV = 0, iV = 0;
    for (let y = 0; y < T; y += 1) { wH += d(rgbAt(o + T - 1, y), rgbAt(o, y)); for (let x = 1; x < T; x += 1) iH += d(rgbAt(o + x - 1, y), rgbAt(o + x, y)); }
    for (let x = 0; x < T; x += 1) { wV += d(rgbAt(o + x, T - 1), rgbAt(o + x, 0)); for (let y = 1; y < T; y += 1) iV += d(rgbAt(o + x, y - 1), rgbAt(o + x, y)); }
    worst = Math.max(worst, (wH / T) / (iH / (T * (T - 1))), (wV / T) / (iV / (T * (T - 1))));
  }
  return worst;
}

function moyenne({ png }) {
  const sum = [0, 0, 0];
  const n = png.width * png.height;
  for (let y = 0; y < png.height; y += 1) for (let x = 0; x < png.width; x += 1) {
    const i = (y * png.width + x) * 4;
    sum[0] += png.data[i]; sum[1] += png.data[i + 1]; sum[2] += png.data[i + 2];
  }
  return sum.map((v) => Math.round(v / n));
}

function ecartLum({ png }) {
  let s = 0, s2 = 0;
  const n = png.width * png.height;
  for (let y = 0; y < png.height; y += 1) for (let x = 0; x < png.width; x += 1) {
    const i = (y * png.width + x) * 4;
    const l = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
    s += l; s2 += l * l;
  }
  const m = s / n;
  return Math.sqrt(s2 / n - m * m);
}

const teintes = ({ png, key }) => {
  const set = new Set();
  for (let y = 0; y < png.height; y += 1) for (let x = 0; x < png.width; x += 1) set.add(key(x, y));
  return set;
};

// Les quatre coloris livrés + la bande du pack, qui sert de témoin partout.
const BANDES = [
  { cle: 'pluie', fichier: 'river-tiles-calm.png', ardoise: true },
  { cle: 'beau', fichier: 'river-tiles-calm-azur.png', ardoise: false },
  { cle: 'usure', fichier: 'river-tiles-calm-turquoise.png', ardoise: false },
  { cle: 'hiver', fichier: 'river-tiles-calm-hiver.png', ardoise: false },
].map((b) => ({ ...b, png: load(b.fichier) }));
const vive = load("river-tiles.png");        // la bande du pack — témoin

describe("bandes d'eau calmes du fleuve", () => {
  for (const b of BANDES) {
    describe(`coloris « ${b.cle} » (${b.fichier})`, () => {
      it("est une bande de 8 images de 16×16 en 5 teintes", () => {
        expect([b.png.png.width, b.png.png.height]).toEqual([T * FRAMES, T]);
        expect(teintes(b.png).size).toBe(5);
      });

      it("ne fait bouger qu'une petite part de la surface, et garde un socle figé", () => {
        expect(churn(b.png)).toBeLessThan(15);
        expect(socle(b.png)).toBeGreaterThan(55);
      });

      it("se répète sans couture", () => {
        expect(raccord(b.png)).toBeLessThan(2.2);
      });

      it("reste de la MATIÈRE, pas un aplat calmé à mort", () => {
        // Le repli facile pour baisser le churn serait d'écraser le contraste — on
        // retomberait sur l'aplat d'avant la texture, écart-type 0.
        expect(ecartLum(b.png)).toBeGreaterThan(0.9 * ecartLum(vive));
      });
    });
  }

  it("TÉMOIN : la bande du pack échoue aux deux mesures qui ont diagnostiqué le bruit", () => {
    // Sans ce témoin, les seuils ci-dessus passeraient aussi bien sur du code
    // n'ayant jamais eu le défaut. On exige que la matière rejetée soit refusée.
    expect(churn(vive)).toBeGreaterThan(40);
    expect(socle(vive)).toBeLessThan(5);
  });

  it("l'ardoise ne déplace pas le ton du fleuve, les coloris natifs OUI (c'est leur raison d'être)", () => {
    const ard = BANDES.find((b) => b.ardoise);
    moyenne(ard.png).forEach((v, i) => expect(Math.abs(v - WATER[i]), `canal ${i} : ${v} contre ${WATER[i]}`).toBeLessThanOrEqual(4));
    // Et l'ardoise est bien DANS la rampe du remap, contrairement aux natifs.
    const rampe = new Set(RAMP.map((c) => c.join(",")));
    for (const c of teintes(ard.png)) expect(rampe.has(c), `teinte hors rampe : ${c}`).toBe(true);
    for (const b of BANDES.filter((x) => !x.ardoise)) {
      const dist = moyenne(b.png).reduce((s, v, i) => s + Math.abs(v - WATER[i]), 0);
      expect(dist, `${b.cle} devrait être franchement autre chose que l'ardoise`).toBeGreaterThan(60);
    }
  });

  it("le bas-fond de chaque coloris est PLUS CLAIR que son eau, et de la même famille", () => {
    // C'est tout le sens du liseré : « l'eau est moins profonde au bord ». Le seul
    // moyen de le vérifier, c'est de confronter la table de teintes au PNG qu'elle
    // accompagne — une valeur recopiée du mauvais coloris passerait sinon inaperçue.
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    for (const b of BANDES) {
      const eau = moyenne(b.png);
      const acc = WATER_SHEETS[b.cle];
      const liseré = acc.shore[2].split(',').map(Number);
      expect(lum(liseré), `${b.cle} : liseré ${acc.shore[2]} contre eau ${eau.join(',')}`).toBeGreaterThan(lum(eau) + 30);
      // Même famille : le canal DOMINANT de l'eau doit rester dominant dans le
      // liseré (sinon on éclaircit vers une autre couleur — un liseré vert sur de
      // l'eau bleue, exactement ce qu'on vient de corriger).
      const domEau = eau.indexOf(Math.max(...eau));
      const domLis = liseré.indexOf(Math.max(...liseré));
      // le liseré peut saturer à 255 sur deux canaux : on tolère l'égalité
      expect(liseré[domEau], `${b.cle} : le canal dominant de l'eau (${domEau}) doit rester haut dans le liseré`)
        .toBeGreaterThanOrEqual(liseré[domLis] - 20);
    }
  });

  it("les quatre coloris sont franchement DISTINCTS entre eux", () => {
    // La garde qui mord vraiment : une erreur de `--row` dans la cuisson
    // produirait quatre bandes identiques, et le fleuve ne changerait jamais de
    // couleur sans qu'aucune autre assertion ne s'en aperçoive.
    for (let i = 0; i < BANDES.length; i += 1) for (let j = i + 1; j < BANDES.length; j += 1) {
      const a = moyenne(BANDES[i].png), c = moyenne(BANDES[j].png);
      const dist = a.reduce((s, v, k) => s + Math.abs(v - c[k]), 0);
      expect(dist, `${BANDES[i].cle} vs ${BANDES[j].cle} : ${a.join(",")} contre ${c.join(",")}`).toBeGreaterThan(40);
    }
  });
});
