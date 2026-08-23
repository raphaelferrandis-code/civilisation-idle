// Densité des bâtiments-moteur : « halle + ateliers » (2026-07-24).
//
// Refonte demandée par Raph : « 1 achat = 1 bâtiment puis 10 font un gros
// bâtiment. Ça donne des scènes avec des paniers de fruits énormes ; le jeu a
// l'ambition d'être un idle citybuilder avec des bâtiments de qualité et en
// grand nombre, pas un gros pâté. En fin de partie on a 10 bâtiments, c'est nul. »
//
// Un seul compteur pilotait DEUX choses : le regroupement (9 cabanes fusionnaient
// en 1 bloc au 10e achat — la ville RÉTRÉCISSAIT quand on achetait) et l'échelle
// de dessin (isoRenderer étire la scène sur l'emprise, donc une emprise 3×3
// peignait des paniers de fruits hauts comme un homme). Désormais le compteur ne
// pilote que le NOMBRE ; seule la halle (instance nº 0) a le droit de grandir.
//
// ⚠ Ces gardes passent par cmEngineGroupSig — la signature RÉELLEMENT consommée
// par le runtime pour décider d'un recompute — et non par une réimplémentation
// locale du calcul. Le premier test est un CONTRÔLE NÉGATIF : il rejoue l'ancien
// découpage et vérifie que l'invariant de monotonie le REJETTE. Sans lui, rien ne
// prouverait que ces assertions sont capables d'échouer.
import { describe, it, expect } from 'vitest';
import { cmEngineGroupSig } from '../layout.js';

// Emprises par groupe pour un type à `n` achats, telles que le layout les pose.
const foots = (id, n) => {
  const sig = cmEngineGroupSig({ buildings: { [id]: n } });
  expect(sig.startsWith(id)).toBe(true);          // sinon on parserait du vide en silence
  return sig.slice(id.length, -1).split(',').map(Number);
};
const count = (id, n) => foots(id, n).length;

// Découpage HISTORIQUE (paliers 10/25/64, extras par 25 puis 10, cap 16 groupes).
function legacyInstances(n) {
  const out = [];
  if (n <= 0) return out;
  if (n >= 10) out.push(10);
  if (n >= 25) out.push(25);
  if (n >= 64) out.push(64);
  if (n < 10) { for (let i = 0; i < n; i += 1) out.push(1); return out; }
  let extra = Math.max(0, n - (n >= 64 ? 64 : n >= 25 ? 25 : 10));
  while (extra >= 25 && out.length < 16) { out.push(25); extra -= 25; }
  while (extra >= 10 && out.length < 16) { out.push(10); extra -= 10; }
  return out;
}

describe('densité moteur — la ville ne rétrécit jamais', () => {
  it('CONTRÔLE NÉGATIF : l\'ancien découpage viole bien l\'invariant', () => {
    // 9 achats = 9 cabanes ; 10 achats = 1 bloc. C'est exactement le défaut
    // corrigé — si ce test cessait d'échouer sur legacy, l'invariant ci-dessous
    // ne prouverait plus rien.
    expect(legacyInstances(9)).toHaveLength(9);
    expect(legacyInstances(10)).toHaveLength(1);
    const regressions = [];
    for (let n = 1; n < 400; n += 1) {
      if (legacyInstances(n + 1).length < legacyInstances(n).length) regressions.push(n + 1);
    }
    expect(regressions.length).toBeGreaterThan(0);
    expect(regressions).toContain(10);
  });

  it('acheter n\'enlève jamais un bâtiment (1 → 400 achats)', () => {
    for (const id of ['foragers', 'ministries', 'schools', 'water_mills']) {
      for (let n = 1; n < 400; n += 1) {
        expect(count(id, n + 1), `${id} : ${n} → ${n + 1} achats`).toBeGreaterThanOrEqual(count(id, n));
      }
    }
  });

  it('1 achat = 1 bâtiment jusqu\'à 12, sans marche ensuite', () => {
    for (let n = 1; n <= 12; n += 1) expect(count('foragers', n)).toBe(n);
    expect(count('foragers', 13)).toBe(13);      // continuité : pas de saut au raccord
    expect(count('water_mills', 13)).toBe(13);   // le moulin à vent suit le régime commun
  });

  it('la fin de partie est une ville, pas une dizaine de blocs', () => {
    expect(count('foragers', 300)).toBeGreaterThanOrEqual(40);
    expect(legacyInstances(300).length).toBeLessThan(16);   // l'avant, pour mémoire
  });
});

describe('échelle — les paniers de fruits ne grossissent plus', () => {
  // isoEngineScene.drawIsoEngineScene : bw = (spanX + spanY) · T · z · ISO_X · 0.72,
  // et toute la scène est peinte en coordonnées RELATIVES à cette boîte. Donc la
  // taille dessinée d'un panier est proportionnelle à l'emprise, point final.
  // Doit rester synchronisé avec isoRenderer.js.
  const sceneBox = (foot) => (foot + foot) * 32 * 1 * 1 * 0.72;

  it('un atelier garde la même emprise — donc la même boîte — à tout compteur', () => {
    for (const id of ['foragers', 'ministries', 'schools', 'markets', 'water_mills']) {
      const ref = foots(id, 400).slice(1);
      expect(ref.length).toBeGreaterThan(0);
      for (const n of [13, 25, 64, 150, 300, 400]) {
        const ateliers = foots(id, n).slice(1);
        expect(new Set(ateliers).size, `${id} @ ${n} : ateliers hétérogènes`).toBe(1);
        expect(ateliers[0], `${id} @ ${n} : emprise d'atelier dérive`).toBe(ref[0]);
      }
      expect(sceneBox(ref[0])).toBe(sceneBox(foots(id, 13)[1]));
    }
  });

  it('un atelier ne dépasse jamais 2 cellules', () => {
    for (const id of ['foragers', 'ministries', 'imperial_exchanges', 'universities', 'water_mills']) {
      for (const f of foots(id, 300).slice(1)) expect(f).toBeLessThanOrEqual(2);
    }
  });

  it('la halle, elle, grandit toujours avec l\'investissement', () => {
    expect(foots('foragers', 300)[0]).toBeGreaterThan(foots('foragers', 1)[0]);
    expect(foots('ministries', 300)[0]).toBeGreaterThan(foots('ministries', 1)[0]);
    expect(foots('water_mills', 300)[0]).toBe(3);   // la halle-moulin plafonne à 3×3
  });
});

describe('cas particuliers', () => {
  it('les 2 structures uniques restent uniques', () => {
    // Ceinture de champs et port : de vraies structures qui s'étendent, pas des
    // blobs — elles gardent leur croissance d'un seul tenant. Le moulin n'en fait
    // plus partie : devenu moulin à vent terrestre, il suit le régime halle +
    // ateliers. L'AQUEDUC non plus, et pour une autre raison : il n'est plus une
    // structure du tout (cf. le test suivant).
    for (const id of ['irrigated_fields', 'river_ports']) {
      for (const n of [1, 10, 64, 300]) expect(count(id, n), `${id} @ ${n}`).toBe(1);
    }
  });

  it('les points d\'eau se multiplient sans jamais grossir', () => {
    // L'aqueduc-conduite a été retiré le 2026-08-05 (il longeait la berge pour
    // puiser dans le fleuve d'à côté). Ce qui le remplace est une poignée de
    // POINTS D'EAU semés dans la ville, et c'est le compteur qui pilote leur
    // NOMBRE — jamais leur taille. Ces trois gardes disent exactement cela.
    for (const n of [1, 10, 64, 300]) {
      for (const f of foots('aqueducts', n)) expect(f, `emprise @ ${n}`).toBe(1);
    }
    expect(count('aqueducts', 1)).toBe(1);            // le 1er achat = 1 point d'eau
    // Croissance STRICTE tant que le plafond n'est pas atteint, puis plus rien :
    // sans le plafond, une mégalopole finirait pavée de puits.
    expect(count('aqueducts', 25)).toBeGreaterThan(count('aqueducts', 4));
    expect(count('aqueducts', 300)).toBe(count('aqueducts', 64));
    expect(count('aqueducts', 300)).toBeLessThanOrEqual(14);
  });

  it('le cap de densité est le seul curseur à bouger pour viser la mégalopole', () => {
    const base = count('foragers', 300);
    globalThis.__engineDensityCap = 80;
    try {
      expect(count('foragers', 300)).toBeGreaterThan(base);
    } finally {
      delete globalThis.__engineDensityCap;
    }
    expect(count('foragers', 300)).toBe(base);   // la molette ne fuit pas
  });
});
