// NETTETÉ DES SPRITES RÉDUITS — ce que ce test garde, c'est la RÉGULARITÉ du
// motif de réduction, pas une valeur de retour.
//
// Question de Raph (2026-08-05) : « pourquoi on ne doublerait pas la taille de
// tous les sprites ? ». La mesure a montré que non — ils sont DÉJÀ dessinés plus
// petits que leur source (densité médiane 0,73), doubler les sources rendrait la
// réduction plus destructrice. Le vrai défaut était ailleurs : le nearest fait
// `src = floor(i × source/dest)`, donc la suite des lignes sautées se répète tous
// les `dest / pgcd(source, dest)` pixels. À 112 → 82 la période vaut 41 : sur un
// bâtiment de 82 px de haut, le motif ne se répète jamais, et le grain part en
// biais. C'est ça, le « pas droit ».
//
// `tailleNette` rabat la taille de destination sur l'entier de PLUS PETITE
// PÉRIODE dans une fenêtre serrée. Les trois contrats ci-dessous sont les seuls
// qui peuvent se casser en silence : la période doit s'améliorer, la taille ne
// doit pas dériver (l'égalisation du grain a été validée sur les tailles
// actuelles), et la fonction doit rester définie sur les cas dégénérés.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tailleNette } from '../cityEngineSprites.js';

const pgcd = (a, b) => { a = Math.abs(a | 0); b = Math.abs(b | 0); while (b) { const t = a % b; a = b; b = t; } return a || 1; };
const periode = (src, dest) => dest / pgcd(src, dest);

// Le vrai parc de sprites du jeu, croisé avec les échelles auxquelles il est
// réellement dessiné : le test porte sur les tailles LIVRÉES, pas sur des cas
// choisis pour lui plaire.
function couplesReels() {
  const racine = process.cwd();
  const app = JSON.parse(fs.readFileSync(path.join(racine, 'scripts/data/sprite-apparent.json'), 'utf8'));
  const inv = JSON.parse(fs.readFileSync(path.join(racine, 'scripts/data/sprite-inventory.json'), 'utf8'));
  const hauteurs = new Map(inv.entries.map((e) => [e.key, e.h]));
  const out = [];
  for (const r of app.rows) {
    const src = hauteurs.get(r.key);
    if (!src || !r.densite) continue;
    for (const dens of [r.densite, r.densPetit].filter(Boolean)) out.push({ key: r.key, src, cible: src * dens });
  }
  return out;
}

describe('taille de destination — le motif de réduction doit être PÉRIODIQUE', () => {
  it('ramène la période sous 8 px sur la grande majorité du parc', () => {
    const couples = couplesReels();
    expect(couples.length, 'parc de sprites introuvable').toBeGreaterThan(100);
    let bonsAvant = 0, bonsApres = 0;
    for (const { src, cible } of couples) {
      if (periode(src, Math.max(1, Math.round(cible))) <= 8) bonsAvant += 1;
      if (periode(src, tailleNette(src, cible)) <= 8) bonsApres += 1;
    }
    const partApres = bonsApres / couples.length;
    // Mesuré à la livraison : 24 % avant, 87 % après. Le seuil est posé bas
    // (75 %) pour ne pas casser au moindre sprite ajouté, mais assez haut pour
    // attraper une régression qui débrancherait le rabattement.
    expect(partApres, `seulement ${(100 * partApres).toFixed(0)} % du parc a une période ≤ 8`).toBeGreaterThan(0.75);
    expect(bonsApres, 'le rabattement doit AMÉLIORER la régularité').toBeGreaterThan(bonsAvant);
  });

  it('ne fait jamais dériver la taille de plus de 5 %', () => {
    // L'égalisation du grain (portes/fenêtres, 95 paliers) a été validée sur les
    // tailles actuelles : gagner en netteté en déplaçant les bâtiments de 10 %
    // reviendrait à la refaire. La fenêtre de recherche borne cette dérive.
    for (const { key, src, cible } of couplesReels()) {
      const d = tailleNette(src, cible);
      const ecart = Math.abs(d - cible) / cible;
      expect(ecart, `${key} : ${cible.toFixed(1)} → ${d} px, soit ${(100 * ecart).toFixed(1)} %`).toBeLessThanOrEqual(0.05);
    }
  });

  it('reste définie sur les cas dégénérés', () => {
    for (const [src, cible] of [[0, 40], [112, 0], [112, -5], [0, 0], [1, 1]]) {
      const d = tailleNette(src, cible);
      expect(Number.isFinite(d), `tailleNette(${src}, ${cible}) = ${d}`).toBe(true);
      expect(d).toBeGreaterThanOrEqual(1);
    }
  });
});
