// S5 — SEMER PAR GRAPPES (docs/PLAN-RENDU-VILLE.md).
//
// Les arbres de VILLE et les cellules de PARC étaient tirés par un hash indépendant
// par cellule : du bruit blanc, donc des confettis. La forêt SAUVAGE, elle, avait
// déjà un bruit de BLOC dont le commentaire dit « agglutine les arbres en fourrés et
// ménage des trouées » — et elle lit en masses. Le lot met les trois sur le même
// bruit, `cmCellNoise`, désormais défini une seule fois dans layout.js.
//
// Ce que ce test verrouille, et pourquoi chacun compte :
//  1. la PROPRIÉTÉ du bruit de bloc — quasi constant entre voisines. C'est tout
//     l'écart avec un hash par cellule, et c'est ce qui fabrique les masses.
//  2. le CONTRÔLE NÉGATIF — l'ancien hash par cellule, mesuré côte à côte. Sans lui
//     on ne saurait pas si « quasi constant » veut dire quelque chose.
//  3. la CONSERVATION DU NOMBRE — `cmClumpK` vaut 1 en moyenne. Le lot redistribue,
//     il ne densifie pas. Un changement de compte voudrait dire qu'on a changé la
//     densité au lieu de la distribution, et c'est le piège annoncé du lot.
//  4. l'INTERRUPTEUR — à amplitude 0 le facteur vaut EXACTEMENT 1, donc l'ancien
//     comportement est récupérable au bit près (molette `__treeClump(0)`).
import { describe, it, expect, afterEach } from "vitest";
import { cmCellNoise, cmClumpK, cmHash, TREE_CLUMP } from "../layout.js";

const AMP0 = TREE_CLUMP.amp;
afterEach(() => { TREE_CLUMP.amp = AMP0; });

const N = 160;   // 25 600 cellules : assez large pour couvrir des dizaines de blocs

// Écart moyen entre cellules ADJACENTES (H et V). C'est la mesure du grain : basse =
// des plages, haute = du poivre-et-sel.
function ecartVoisines(f) {
  let s = 0, n = 0;
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      if (x + 1 < N) { s += Math.abs(f(x, y) - f(x + 1, y)); n += 1; }
      if (y + 1 < N) { s += Math.abs(f(x, y) - f(x, y + 1)); n += 1; }
    }
  }
  return s / n;
}

// L'ancien tirage des cellules vertes, tel qu'il était : hash par cellule.
const hashParCellule = (gx, gy) => (cmHash("green:" + gx + ":" + gy + ":7") % 100) / 100;

describe("S5 — bruit de bloc et regroupement", () => {
  it("cmCellNoise est quasi constant entre voisines", () => {
    expect(ecartVoisines(cmCellNoise)).toBeLessThan(0.08);
  });

  // ⚠ LE point du test : sans cette comparaison, « quasi constant » ne veut rien dire.
  it("mord : le hash par cellule est cinq fois plus haché que le bruit de bloc", () => {
    const bloc = ecartVoisines(cmCellNoise);
    const cellule = ecartVoisines(hashParCellule);
    expect(cellule).toBeGreaterThan(bloc * 5);
    expect(cellule).toBeGreaterThan(0.3);        // ordre de grandeur d'un bruit blanc
  });

  it("cmCellNoise reste dans [0,1] et couvre bien sa plage", () => {
    let lo = 1, hi = 0;
    for (let y = 0; y < N; y += 3) for (let x = 0; x < N; x += 3) {
      const v = cmCellNoise(x, y);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi - lo).toBeGreaterThan(0.7);        // sinon le clump serait inerte
  });

  it("cmClumpK vaut 1 en moyenne : le NOMBRE d'arbres est conservé", () => {
    TREE_CLUMP.amp = 1.3;
    let s = 0, n = 0;
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) { s += cmClumpK(x, y); n += 1; }
    expect(s / n).toBeCloseTo(1, 1);
  });

  it("cmClumpK creuse vraiment un contraste de densité", () => {
    TREE_CLUMP.amp = 1.3;
    let lo = 9, hi = 0;
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
      const v = cmClumpK(x, y);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    expect(lo).toBeLessThan(0.6);                // des trouées franches
    expect(hi).toBeGreaterThan(1.4);             // des bosquets francs
    expect(lo).toBeGreaterThanOrEqual(0);        // jamais de probabilité négative
  });

  // ⛔ LA DÉCISION, verrouillée : le mécanisme est LIVRÉ ÉTEINT. Son effet mesuré en
  // jeu est de 1,2 point d'agglomération pour une modulation de ×0,05 à ×1,95, et la
  // prémisse du lot s'est révélée fausse (le champ est déjà groupé à 62,9 % alors
  // qu'un tirage indépendant à sa densité de 9 % en donnerait ~4 %). Rallumer demande
  // d'abord de comprendre ce qui l'agglomère — cf. le commentaire de TREE_CLUMP.
  // Ce test existe pour qu'un rallumage soit un GESTE, pas un glissement.
  it("le mécanisme est livré ÉTEINT (décision du 2026-08-05)", () => {
    expect(AMP0).toBe(0);
  });

  it("l'interrupteur rend EXACTEMENT l'ancien comportement", () => {
    TREE_CLUMP.amp = 0;
    for (let y = 0; y < 40; y += 1) for (let x = 0; x < 40; x += 1) {
      expect(cmClumpK(x, y)).toBe(1);
    }
  });

  it("le facteur est borné même si la molette est poussée à fond", () => {
    TREE_CLUMP.amp = 1.9;
    let lo = 9;
    for (let y = 0; y < N; y += 2) for (let x = 0; x < N; x += 2) lo = Math.min(lo, cmClumpK(x, y));
    expect(lo).toBeGreaterThanOrEqual(0);
  });

  // La forêt SAUVAGE lit déjà en fourrés avec ce bruit — c'est le précédent qui a
  // motivé le lot. Le gain conservé de S5 est donc la DÉDUPLICATION : isoRenderer
  // gardait sa propre copie de la formule. Une seule définition, un seul grain.
  //
  // ⚠ GARDE RÉÉCRITE le 2026-08-23, et c'est la leçon P33 du plan de suppression du
  // legacy. Elle cherchait `cmCellNoise` dans le TEXTE d'isoRenderer.js pour prouver
  // qu'il n'en gardait pas de copie. Le symbole est parti avec la forêt sauvage — et
  // la garde est restée VERTE, satisfaite par le COMMENTAIRE qui racontait ce départ.
  // Elle n'a pas cassé : elle a perdu son sens en silence. Une garde textuelle ne
  // distingue pas le code de la prose, et elle ne survit pas à un déménagement.
  // → On n'interroge plus UN fichier nommé, on interroge l'INVARIANT : la formule
  //   n'existe qu'à un seul endroit du dépôt, et son consommateur passe par le
  //   symbole partagé. Ça reste vrai quel que soit le fichier qui la consomme demain.
  it("la formule du bruit de cellule n'existe qu'UNE fois dans le dépôt", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const SRC = path.join(__dirname, "..", "..", "..");        // src/
    const porteurs = [];
    const marcher = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) marcher(p);
        else if (/\.jsx?$/.test(e.name)
          && /n1 \* 0\.6 \+ n2 \* 0\.4/.test(fs.readFileSync(p, "utf8"))) porteurs.push(p);
      }
    };
    marcher(SRC);
    expect(porteurs.map((p) => path.basename(p))).toEqual(["layout.js"]);
    // …et le consommateur l'atteint par le symbole partagé, pas par une recopie.
    expect(fs.readFileSync(path.join(SRC, "game", "map", "iso", "isoWildForest.js"), "utf8"))
      .toMatch(/import \{[^}]*\bcmCellNoise\b[^}]*\} from ["']\.\.\/layout\.js["']/);
  });
});
