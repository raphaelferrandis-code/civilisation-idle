import { describe, it, expect } from "vitest";

// OÙ SE POSE LA MAISON DES PLAISIRS — et surtout : par rapport à QUOI.
//
// Trois poses refusées avant celle-ci, et c'est la troisième qui compte :
//
//   u = 0,82  (1,15 N)  « c'est vraiment très éloigné »              2026-08-06
//   u = 0,58  (0,29 N)  « beaucoup trop proche du centre »           2026-08-22
//   u = 0,62  (0,43 N)  « il est TOUJOURS DANS LE RAYON DE LA VILLE
//                        et je ne veux pas ça »                      2026-08-22
//
// Les deux premières poses raisonnaient en fraction de GRILLE. Or la ville
// n'occupe pas une fraction fixe de la grille : son emprise dépend de l'ère, de
// la population et de l'archétype, et `reachFor` l'étire jusqu'à ~1,9 fois son
// rayon nominal dans la direction d'allongement — laquelle, pour un plan
// linéaire, suit justement le fleuve. Une carte pouvait donc rester bâtie bien
// au delà de 0,43 N, et le monument s'y retrouvait en plein faubourg.
//
// La règle est maintenant une MARCHE le long du cours, et ce fichier la rejoue
// sur des villes synthétiques (même recette que riverIsland.test.js).

// MÊMES VALEURS QUE `PLAISIRS` dans layout.js — si elles y changent, ce test
// doit suivre, et c'est voulu.
const REACH_MUL = 1.35, GAP = 12, U_MIN = 0.5, U_MAX = 0.72, MIN_BRIDGE = 12;

// Le cours tel que layout.js le construit : de `cx − 1,8 N` à `cx + 1,8 N`,
// échantillonné tous les ~1,5 tuiles. Ville et pont au centre.
function carte({ N, contour, pontX = null }) {
  const cx = N / 2, cy = N / 2;
  const x0 = cx - N * 1.8, x1 = cx + N * 1.8;
  const pas = 1.5;
  const sm = [];
  // ⚠ Décalage latéral du lit FIXE ici, alors qu'en jeu il suit N : sinon la
  // distance au cœur varierait avec la grille par la seule géométrie du fleuve,
  // et le test mesurerait le fleuve au lieu de mesurer la règle.
  for (let x = x0; x <= x1; x += pas) sm.push({ x, y: cy + 8 });
  return { N, cx, cy, sm, core: { x: cx, y: cy }, contour, pontX: pontX == null ? cx : pontX };
}

// LA MARCHE, copiée de layout.js : premier échantillon franchement hors ville,
// et jamais sur la traversée historique.
function poser(c) {
  const last = c.sm.length - 1;
  const idxOf = (u) => Math.max(0, Math.min(last, Math.round(u * last)));
  const iMin = idxOf(U_MIN), iMax = idxOf(U_MAX);
  const dehors = (sp) => {
    const dx = sp.x - c.core.x, dy = sp.y - c.core.y;
    return Math.hypot(dx, dy) >= c.contour(Math.atan2(dy, dx)) * REACH_MUL + GAP;
  };
  const loinDuPont = (sp) => Math.abs(sp.x - c.pontX) >= MIN_BRIDGE;
  let si = iMax;
  for (let i = iMin; i <= iMax; i += 1) {
    if (dehors(c.sm[i]) && loinDuPont(c.sm[i])) { si = i; break; }
  }
  return { si, sp: c.sm[si], iMin, iMax };
}

const distCore = (c, sp) => Math.hypot(sp.x - c.core.x, sp.y - c.core.y);

describe("Maison des Plaisirs — le lieu se pose HORS de la ville", () => {
  it("il est dehors, et de la marge choisie", () => {
    for (const rayon of [8, 20, 35, 60]) {
      const c = carte({ N: 120, contour: () => rayon });
      const { sp } = poser(c);
      expect(distCore(c, sp)).toBeGreaterThanOrEqual(rayon * REACH_MUL + GAP - 1.5);
    }
  });

  it("il ne se fait pas BANNIR : c'est le PREMIER point dehors, pas le dernier", () => {
    // Le refus de 2026-08-06 (« c'est vraiment très éloigné ») est l'autre bord
    // du problème. La marche doit s'arrêter dès qu'elle sort, sinon on corrige
    // un refus en en rejouant un autre.
    const c = carte({ N: 120, contour: () => 25 });
    const { si, sp, iMax } = poser(c);
    expect(si).toBeLessThan(iMax);
    const avant = c.sm[si - 1];
    const seuil = 25 * REACH_MUL + GAP;
    expect(distCore(c, avant)).toBeLessThan(seuil);   // le précédent était dedans
    expect(distCore(c, sp)).toBeGreaterThanOrEqual(seuil);
  });

  it("⚠ LA PROPRIÉTÉ QUI MANQUAIT : à ville égale, la GRILLE ne change rien", () => {
    // C'est tout le sujet des deux premiers refus. Deux cartes de taille très
    // différente mais de même emprise urbaine doivent poser le monument à la
    // MÊME distance du cœur — parce que c'est la ville qu'on fuit, pas la grille.
    // ⚠ Contour choisi pour que la borne U_MAX ne morde sur AUCUNE des deux (à
    // N = 40 elle tombe à 31,6 tuiles) : ce test-ci porte sur la règle, celui
    // des bornes porte sur les bornes.
    const petite = carte({ N: 40, contour: () => 12 });
    const grande = carte({ N: 300, contour: () => 12 });
    const da = distCore(petite, poser(petite).sp);
    const db = distCore(grande, poser(grande).sp);
    expect(Math.abs(da - db)).toBeLessThan(3);        // au pas d'échantillonnage près
  });

  it("une ville qui s'étire le long du fleuve le repousse d'autant", () => {
    // Le cas du plan « linear » : `ecc` monte à 1,55 dans la direction
    // d'allongement, et cette direction suit le fleuve. Un contour anisotrope
    // doit donc pousser le monument plus loin qu'un contour rond.
    const N = 160;
    const rond = carte({ N, contour: () => 30 });
    const etire = carte({ N, contour: (a) => 30 * (1 + Math.cos(2 * a) * 0.55) });
    expect(distCore(etire, poser(etire).sp)).toBeGreaterThan(distCore(rond, poser(rond).sp));
  });

  it("jamais sur la traversée historique", () => {
    // Le pont n'est filtré NULLE PART ailleurs (bridgeAvoid ne couvre que les
    // traversées seedées) : c'est ici, et seulement ici, qu'il est protégé.
    const N = 120;
    // Ville minuscule : sans le garde, la marche s'arrêterait au premier
    // échantillon venu, y compris sur le pont — qu'on décale ici en aval.
    const c = carte({ N, contour: () => 2, pontX: N / 2 + 0.16 * N });
    const { sp } = poser(c);
    expect(Math.abs(sp.x - c.pontX)).toBeGreaterThanOrEqual(MIN_BRIDGE);
  });

  it("les deux bornes tiennent, quelle que soit la ville", () => {
    // ⛔ En deçà de U_MIN on serait dans le faubourg ; au delà de U_MAX on
    // s'approche du 1,15 N déjà refusé. Une ville démesurée doit taper la borne,
    // pas partir à l'infini.
    for (const rayon of [1, 15, 40, 90, 500]) {
      const c = carte({ N: 120, contour: () => rayon });
      const { si, iMin, iMax } = poser(c);
      expect(si).toBeGreaterThanOrEqual(iMin);
      expect(si).toBeLessThanOrEqual(iMax);
    }
  });
});

describe("Maison des Plaisirs — le domaine réservé réserve vraiment", () => {
  const CLEAR = 8, U_NAT_REF = 0.62, SPREAD = 2.5;

  it("le rayon du domaine DÉPASSE le corridor eau + berge", () => {
    // Le piège mesuré le 2026-08-22 : au droit du monument le lit est évasé
    // (hw ≈ 2,0 + 1,1·sin(πu) + spread) et le corridor eau+berge vaut hw + 1,4.
    // Un domaine plus petit que ce corridor vit entièrement dedans et ne réserve
    // donc RIEN — c'était le cas à 6 tuiles.
    const hw = 2.0 + 1.1 * Math.sin(Math.PI * U_NAT_REF) + SPREAD;
    expect(CLEAR).toBeGreaterThan(hw + 1.4);
  });

  it("mais le domaine n'est PAS ce qui éloigne la ville", () => {
    // Garde-fou de lecture : 8 tuiles de domaine, c'est la frange de berge du
    // monument, pas son isolement. Si un jour la mesure en jeu retrouve un
    // bâtiment à ~8 tuiles, c'est que la marche ci-dessus a cessé de fonctionner
    // et que seul le domaine tient encore la ville à distance.
    // Relevé après la marche (N = 98, band 1) : bâtiment le plus proche à 21,2.
    expect(CLEAR * 2).toBeLessThan(21.2);
  });
});
