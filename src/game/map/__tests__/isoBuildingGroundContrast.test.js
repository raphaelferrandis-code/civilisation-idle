// Une HABITATION se détache-t-elle du SOL DE SON LOT, à son ère ?
//
// Le grief (Raph 2026-08-05, sur capture) : « très brouillon ». Le diagnostic a
// chiffré la cause : le pan de toit du stonehouse mesure L 129,4 et le pavé qu'il
// occupe L 121,9 — 7,5 points d'écart, quand la chaussée en a 29 et le trottoir 36.
// Le budget de contraste de l'image est dépensé partout SAUF sur la frontière qui
// compte. Il existait une garde pour le couple chaussée/sol depuis juillet
// (isoRoadGroundContrast.test.js) ; il n'en existait AUCUNE pour bâti/sol.
//
// ── POURQUOI CETTE MÉTRIQUE ET PAS UNE AUTRE ────────────────────────────────────
//
// Premier essai, abandonné : la distance entre le ton DOMINANT du sprite et celui du
// sol, par symétrie avec la garde chaussée/sol. Mesuré, c'est inutilisable — le ton
// dominant d'une habitation est son TRAIT DE CONTOUR, pas son toit : `stonehouse`
// sort à L 22 sur 25 % de son encre, `manor` à L 28 sur 29 %. La garde aurait mesuré
// la distance entre le sol et un liseré noir, et serait passée au vert partout.
//
// Retenu : la PART D'ENCRE QUI SE DISSOUT, c'est-à-dire la fraction des pixels
// opaques du sprite dont la couleur est à moins de `RAYON` du ton moyen du sol.
// C'est directement le défaut décrit — « la maison ne se détache pas de son sol » —
// et ça ne demande de reconnaître ni le toit ni le mur.
//
// ⚠ Deux limites assumées, à connaître avant de se fier à un chiffre d'ici :
//  1. La référence est le ton MOYEN du sol, alors que la tuile porte 18,4 points
//     d'écart entre pixels voisins : un pixel de sprite « loin de la moyenne » peut
//     être proche de certains pixels de sol. La mesure sous-estime donc la confusion.
//  2. C'est une mesure sur les PNG SOURCES. À l'écran s'ajoutent la couche de
//     lumière, le voile de nuit, la saison et le LOD. Le juge final reste une
//     CAPTURE passée à scripts/frameStats.mjs — cf. docs/PLAN-RENDU-VILLE.md §4.
//
// La garde est un CLIQUET, pas une cible : elle grave l'état mesuré le 2026-08-05 et
// interdit d'empirer. Les chantiers S8/S13 (collision de teinte, élargissement du
// cœur de palette) feront baisser ces nombres ; on abaissera la table à ce moment-là.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import { isoEraSurface } from "../iso/isoGroundDetail.js";
import { ISO_TILE_VARIANTS } from "../iso/isoGroundTiles.js";
import { VARIANTS_HOUSE } from "../procedural/buildingGenerator.js";
import { HOUSE_FAMILY, HOUSE_TINTS, applyHouseTint } from "../housePalette.js";

const ISO = new URL("../../../../public/pixelart/iso/", import.meta.url);
const HOUSES = new URL("../../../../public/pixelart/houses/", import.meta.url);

// Rayon de confusion, en distance RGB. 24 n'est pas rond par hasard : c'est le pas
// qui sépare les couples qui LISENT (bandes 4-5, marbre et monumental : 0 à 16 % de
// dissolution) de ceux qui ne lisent pas (bandes 1-3 et 6-8 : 25 à 35 %). En dessous
// de 16 la mesure ne distingue plus rien ; au-dessus de 40 tout se dissout.
const RAYON = 24;

// ── L'ÉTAT MESURÉ LE 2026-08-05 (le cliquet) ───────────────────────────────────
// Part d'encre dissoute du PIRE archétype de chaque bande, teintes comprises. Le
// « pire » est le bon juge : une bande où un archétype sur quatre disparaît est une
// bande où un quart des maisons disparaît.
//
// Ce que la table dit, et qui est le constat du chantier : les bandes 4, 5 et 9
// lisent (≤ 16 %), les bandes 1, 2, 3, 6, 7 et 8 non (≥ 25 %). La bande 3 — celle de
// la capture de Raph — est la troisième pire du jeu.
// ⭐ MISE À JOUR 2026-08-05, après le retrait de `townhouse` et `manor` de l'échange
// calcaire (cf. FAMILY dans housePalette.js) : leur teinte les envoyait sur `#8f8475`,
// la pire valeur de la rampe face au sol. Effet mesuré, bandes 2-4 :
//
//   bande 2 : 25,0 % → 2,8 %   (townhouse, c'était la pire du jeu)
//   bande 3 : 32,2 % → 15,1 %  (manor sort ; reste stonehouse/ardoise)
//   bande 4 :  9,2 % → 0,0 %
//
// Les autres bandes sont inchangées : la case coupable ne les concernait pas.
// ⚠ RÉÉCHELONNÉ le 2026-09-30 pour les bandes 1, 3, 5 et 6, SANS qu'un pixel de
// bâtiment ait changé : les OMBRES PEINTES des sprites ont été rendues transparentes
// (scripts/ombresPeintes.mjs — l'ombre du soleil les remplace, iso/isoSunShadow.js).
// Ces pixels très sombres comptaient comme « encre qui se détache » ; les retirer
// réduit le DÉNOMINATEUR, pas les pixels confondus, qui restent les mêmes couleurs
// au même nombre. Vérifié : 34,9 % × 809 px d'encre = 38,0 % × (809 − 66 px
// d'ombre) pour la maison longue ; mêmes coupables pour les trois autres (#8f8475,
// #b4a890, #7c828c). Le cliquet mesure désormais le BÂTIMENT seul.
// ⭐ RESSERRÉ le 2026-10-01 par la BIBLE DES SURFACES (isoSurfaceBible.test.js) : le
// sol mesuré est désormais celui que le bake PEINT — l'aplat de ton sous la tuile
// dosée —, et ce sol a changé aux bandes 2-3 et 5 à 9. Aucun pixel de maison n'a
// bougé ; c'est le fond qui s'est écarté d'elles :
//   bande 3 : 17,0 % → 0,0 %   ·   bande 6 : 31,9 % → 0,0 %
//   bande 7 : 25,0 % → 0,8 %   ·   bande 8 : 28,1 % → 18,0 %   ·   bande 9 : 7,5 → 5,5
//   bande 2 : 2,8 → 0,0.  Bande 4 : 0,0 → 1,6, SANS changement de sol — c'est la
//   MESURE qui a changé (la dalle y était déjà dosée à 0,3 depuis le 2026-09-30 : le
//   PNG seul n'était pas le sol affiché). Coupable : #ccb394, un FIL de 1,6 % de la villa.
const CLIQUET = [
  { band: 0, max: 13.5, pire: "tent/origine" },
  { band: 1, max: 38.0, pire: "longhouse/origine" },
  { band: 2, max: 0.0, pire: "townhouse/origine" },
  { band: 3, max: 0.0, pire: "stonehouse/origine" },
  { band: 4, max: 1.6, pire: "villa/origine (fil #ccb394, 1,6 %)" },
  { band: 5, max: 18.0, pire: "block/calcaire" },
  { band: 6, max: 0.0, pire: "tower/origine" },
  // Bandes 7 et 9 : 0,8 et 5,5 → 0,0 le 2026-10-01 (jour), par les MAISONS — les skins
  // cosmiques redessinés en nacre (tower/megablock/arcologyhome-cosmic-7/8/9), leurs
  // gris d'ombre écartés du sol (scripts/ecartSol.mjs --darker).
  { band: 7, max: 0.0, pire: "tower/origine" },
  // Bande 8 : 18,0 → 0,0 le même soir, par les MAISONS cette fois — la ligne cosmique de
  // VARIANTS_HOUSE (bandes 7-9) n'a plus de `block` de brique, le coupable.
  { band: 8, max: 0.0, pire: "tower/origine" },
  // ⚠ RELEVÉ de 3,1 à 7,5 le 2026-08-06, et c'est le SEUL relèvement de ce cliquet —
  // il doit rester exceptionnel et justifié. Cause : l'archétype `terrace` (vague « les
  // îlots n'ont qu'un type de bâtiment »), que la garde a attrapé dès sa pose.
  //
  // Pourquoi c'est acceptable, et comment ça se VÉRIFIE : le coupable est un FIL, pas
  // une masse. Sur la version livrée, `#1f3a44` (teal, couleur protégée) pèse 4,1 % de
  // l'encre, chaque pixel a 0,74 voisin de sa propre couleur et la plus grosse tache
  // d'un seul tenant fait 4 px — 0,2 % du sprite. Un vrai défaut de lecture est un MUR
  // ou un TOIT : 20 à 35 % de l'encre, en une seule plaque. Un liseré sombre sur une
  // dalle tech sombre ne fait disparaître aucun bâtiment.
  // ⚠ Le critère est « fil ou masse », pas le pourcentage seul : si un futur archétype
  // pousse une PLAQUE dans le rayon, il faudra traiter le sprite, pas relever la ligne.
  { band: 9, max: 0.0, pire: "tower/origine" },
];
const TOLERANCE = 1.5;   // points de pourcentage — bruit d'arrondi des PNG
// Plancher dur : aucune bande ne doit JAMAIS franchir ça, même en régressant depuis
// une valeur déjà mauvaise. Posé au-dessus de la pire valeur actuelle (34,9).
const PLAFOND_DUR = 40;

const COSMIC = new Set(["tower", "megablock", "arcologyhome"]);

const readPng = (url) => PNG.sync.read(fs.readFileSync(url));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Ton moyen d'une matière de sol = moyenne de ses variantes sur les pixels opaques.
// Même lecture que la garde chaussée/sol, pour que les deux chiffres se comparent.
const matTone = (key) => {
  const n = ISO_TILE_VARIANTS[key] || 0;
  const names = n > 1 ? Array.from({ length: n }, (_, i) => `${key}-${i + 1}.png`) : [`${key}.png`];
  const acc = [0, 0, 0];
  for (const name of names) {
    const p = readPng(new URL(name, ISO));
    const s = [0, 0, 0];
    let px = 0;
    for (let i = 0; i < p.width * p.height; i += 1) {
      if (p.data[i * 4 + 3] < 128) continue;
      for (let c = 0; c < 3; c += 1) s[c] += p.data[i * 4 + c];
      px += 1;
    }
    for (let c = 0; c < 3; c += 1) acc[c] += s[c] / px / names.length;
  }
  return acc;
};

// Part d'encre du sprite (teinté ou non) à moins de `rayon` du ton de sol, ET la
// couleur qui en est le plus responsable.
//
// ⚠ L'ATTRIBUTION EST LE VRAI SERVICE RENDU. Sans elle, un échec dit « la bande 6
// échoue » et il faut refaire toute l'enquête ; avec elle il dit « #7c828c, 24,6 % de
// l'encre, à 11,9 du sol », et le geste suivant est évident. C'est cette attribution
// qui a trouvé `#8f8475` — une seule case de table derrière trois bandes en échec.
const dissolution = (file, tintIdx, ground, rayon = RAYON) => {
  const p = readPng(file);
  const w = p.width, h = p.height;
  let data = p.data;
  if (tintIdx) {
    const out = Buffer.alloc(w * h * 4);
    applyHouseTint(p.data, out, w, h, tintIdx);
    data = out;
  }
  let ink = 0, near = 0;
  const parCouleur = new Map();
  for (let i = 0; i < w * h; i += 1) {
    if (data[i * 4 + 3] < 128) continue;
    ink += 1;
    const rgb = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    const dd = dist(rgb, ground);
    if (dd >= rayon) continue;
    near += 1;
    const cle = "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
    const e = parCouleur.get(cle) || { n: 0, d: dd };
    e.n += 1;
    parCouleur.set(cle, e);
  }
  let pire = null;
  for (const [cle, e] of parCouleur) {
    if (!pire || e.n > pire.n) pire = { cle, part: (e.n / ink) * 100, d: e.d };
  }
  return { part: ink ? (near / ink) * 100 : 0, coupable: pire };
};

// La même règle de nom que le rendu (pixelHouses.js:73). Recopiée — mais le test
// d'existence de fichier juste en dessous la garde de dériver en silence.
const spriteKey = (variant, band) =>
  (band >= 7 && COSMIC.has(variant)) ? `${variant}-cosmic-${Math.min(9, band)}` : variant;

// Les habitations réellement posées par une bande, avec les teintes qu'elles peuvent
// prendre. `pickHouseTint` tire à deux états ÉQUIPROBABLES entre l'origine et
// l'échange de la famille : les deux comptent autant. Les skins cosmiques sont exclus
// de l'échange par le rendu (housePalette : leur couleur de bande est un signal).
function couples(band) {
  const row = VARIANTS_HOUSE[Math.min(VARIANTS_HOUSE.length - 1, band)];
  const out = [];
  for (const variant of new Set(row.base)) {
    const key = spriteKey(variant, band);
    const tints = key.includes("-cosmic-") ? [0] : [...new Set([0, HOUSE_FAMILY[variant] | 0])];
    for (const t of tints) out.push({ variant, key, tint: t, nom: `${variant}/${HOUSE_TINTS[t].id}` });
  }
  return out;
}

const cacheSol = new Map();
const solTone = (key) => {
  if (!cacheSol.has(key)) cacheSol.set(key, matTone(key));
  return cacheSol.get(key);
};
// Le sol que l'écran MONTRE : depuis la bible des surfaces (2026-10-01), la tuile est
// dosée sur un aplat de ton — c'est ce mélange que les maisons côtoient, pas le PNG
// seul (à la bande 7, le PNG est une dalle sombre à L61, le sol peint une nacre à L159).
const solLu = (band) => {
  const s = isoEraSurface(band);
  const t = solTone(s.ground);
  return s.groundTone.map((v, i) => v * (1 - s.groundDose) + t[i] * s.groundDose);
};

// Pire dissolution d'une bande, mémoïsée (chaque `it` la redemanderait sinon).
const cachePire = new Map();
function pireDeLaBande(band) {
  if (cachePire.has(band)) return cachePire.get(band);
  const ground = solLu(band);
  let pire = { part: -1, nom: "(aucun)", coupable: null };
  for (const c of couples(band)) {
    const r = dissolution(new URL(`${c.key}.png`, HOUSES), c.tint, ground);
    if (r.part > pire.part) pire = { part: r.part, nom: c.nom, coupable: r.coupable };
  }
  cachePire.set(band, pire);
  return pire;
}

// Message d'échec qui dit quoi FAIRE, pas seulement que ça a cassé.
const detail = (band, pire) => {
  const c = pire.coupable;
  return `ère ${band} : ${pire.nom} dissout ${pire.part.toFixed(1)} % de son encre`
    + (c ? ` — coupable ${c.cle}, ${c.part.toFixed(1)} % de l'encre, à ${c.d.toFixed(1)} du sol` : "");
};

describe("habitations vs sol des lots, par ère", () => {
  it("chaque archétype tiré par une bande a bien son PNG", () => {
    for (let band = 0; band <= 9; band += 1) {
      for (const c of couples(band)) {
        expect(fs.existsSync(new URL(`${c.key}.png`, HOUSES)), `bande ${band} : ${c.key}.png`).toBe(true);
      }
    }
  });

  for (const ref of CLIQUET) {
    it(`ère ${ref.band} : aucune habitation ne se dissout plus qu'au 2026-08-05 (${ref.max} %)`, () => {
      const pire = pireDeLaBande(ref.band);
      expect(pire.part, detail(ref.band, pire)).toBeLessThanOrEqual(ref.max + TOLERANCE);
      expect(pire.part, detail(ref.band, pire)).toBeLessThan(PLAFOND_DUR);
    });
  }

  // ⚠ LE point du test. Une garde qui ne mesure que l'existant se satisfait de
  // n'importe quoi : celle-ci doit prouver qu'elle DÉTECTE une collision. On repeint
  // le sprite le mieux détaché du jeu (bande 4) au ton exact de son sol et on exige
  // que la mesure s'effondre. Sans ce test, une erreur de signe ou un rayon à 0
  // rendrait 0 % partout et toutes les assertions passeraient au vert.
  // (Leçon du lot « Comprendre ses chiffres » : une garde qui compare le calcul à
  // lui-même est décorative.)
  it("mord : un sprite repeint au ton de son sol se dissout à plus de 95 %", () => {
    const band = 4;
    const ground = solLu(band);
    const src = readPng(new URL("stonehouse.png", HOUSES));
    const w = src.width, h = src.height;
    for (let i = 0; i < w * h; i += 1) {
      if (src.data[i * 4 + 3] < 128) continue;
      src.data[i * 4] = Math.round(ground[0]);
      src.data[i * 4 + 1] = Math.round(ground[1]);
      src.data[i * 4 + 2] = Math.round(ground[2]);
    }
    let ink = 0, near = 0;
    for (let i = 0; i < w * h; i += 1) {
      if (src.data[i * 4 + 3] < 128) continue;
      ink += 1;
      if (dist([src.data[i * 4], src.data[i * 4 + 1], src.data[i * 4 + 2]], ground) < RAYON) near += 1;
    }
    expect((near / ink) * 100).toBeGreaterThan(95);
    // …et le sprite d'origine, lui, est loin du compte : la mesure discrimine.
    expect(pireDeLaBande(band).part).toBeLessThan(20);
  });

  // Témoin de lecture. Jusqu'au 2026-10-01 : bandes 4 et 9 bonnes, 1, 3 et 6
  // brouillonnes. La bible des surfaces a fait passer les bandes 2, 3, 6 et 7 sous 1 %
  // — elles doivent y rester ; les dernières brouillonnes (1 : la terre battue du
  // village, 5 : block/calcaire) sont le chantier suivant, pas une fatalité. La bande 8
  // les a quittées la même nuit (plus de brique XIXe dans la ligne cosmique).
  it("les ères refaites par la bible des surfaces gardent leur avance", () => {
    const bonnes = [2, 3, 4, 6, 7, 8].map(pireDeLaBande).map((p) => p.part);
    const mauvaises = [1, 5].map(pireDeLaBande).map((p) => p.part);
    expect(Math.max(...bonnes)).toBeLessThan(Math.min(...mauvaises));
    for (const p of bonnes) expect(p).toBeLessThan(2);
  });
});
