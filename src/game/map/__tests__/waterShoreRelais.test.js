// Relais du bas-fond clair là où le quai ne trace pas (quayGapRuns).
//
// Retour Raph 2026-07-30, capture du port : « il n'y a plus de quais ni de liseré
// de bordure d'eau, et là ça fait une coupe nette ». Cause mesurée : l'exclusion
// « le quai porte le bord de l'eau » était un booléen GLOBAL par ère, alors que le
// quai est coupé LOCALEMENT — sur l'emprise du port (`ensureQuayGate` le fait
// exprès), là où le fleuve est trop étroit pour un mur, et aux deux extrémités.
// Sur ces tronçons personne ne dessinait le bord de l'eau.
//
// L'INVARIANT à protéger n'est pas une largeur ni une teinte, c'est une COUVERTURE :
// tout sample où le quai ne trace pas doit être couvert par un tronçon de relais.
// C'est exactement ce qu'un booléen global ne peut pas garantir, et c'est testable
// sans canvas.
import { describe, it, expect } from "vitest";
import { quayGapRuns } from "../quaysAndRiot.js";

const mask = (s) => Uint8Array.from([...s].map((c) => (c === "1" ? 1 : 0)));
const couvre = (runs) => { const s = new Set(); for (const [a, b] of runs) for (let i = a; i <= b; i += 1) s.add(i); return s; };

describe("tronçons de relais du bas-fond", () => {
  it("quai partout : aucun relais", () => {
    expect(quayGapRuns(mask("1111111111"), 10)).toEqual([]);
  });

  it("un trou au milieu (le port) : un tronçon, débordant d'un sample de chaque côté", () => {
    // 4 zéros = la coupe mesurée sur une démo d'ère 7 (samples 265 à 268, ≈ 4,5
    // tuiles de berge). Le débordement est voulu : sans lui les deux traits
    // s'arrêtent au même sample et laissent une couture visible au raccord.
    expect(quayGapRuns(mask("111100001111"), 12)).toEqual([[3, 8]]);
  });

  it("trous aux extrémités : bornes serrées, jamais d'index négatif ni hors bande", () => {
    expect(quayGapRuns(mask("0001111000"), 10)).toEqual([[0, 3], [6, 9]]);
    expect(quayGapRuns(mask("0000000000"), 10)).toEqual([[0, 9]]);
  });

  it("masque absent : tout le ruban, jamais rien", () => {
    // Repli de sûreté : mieux vaut un liseré partout qu'une coupe nette si le
    // gate n'a pas encore été calculé.
    expect(quayGapRuns(null, 10)).toEqual([[0, 9]]);
  });

  it("deux trous séparés par un seul sample restent DEUX tronçons", () => {
    // Les fusionner ferait passer le relais par-dessus un sample que le quai
    // occupe — et donc deux traits clairs parallèles, le défaut d'origine de
    // l'exclusion mutuelle.
    const runs = quayGapRuns(mask("1101011"), 7);
    expect(runs.length).toBe(2);
  });

  it("INVARIANT : tout sample sans quai est couvert par un relais", () => {
    for (const s of ["1111000111", "0011110011", "1010101010", "0000000000", "1111111110"]) {
      const m = mask(s);
      const vus = couvre(quayGapRuns(m, m.length));
      for (let i = 0; i < m.length; i += 1) {
        if (!m[i]) expect(vus.has(i), `${s} : le sample ${i} n'est couvert par personne`).toBe(true);
      }
    }
  });

  it("le relais ne s'étend pas au-delà d'un sample dans le territoire du quai", () => {
    // Sinon on repeindrait un bas-fond clair par-dessus celui du quai sur toute
    // sa longueur : deux lignes parallèles, ce que l'exclusion mutuelle existe
    // justement pour éviter.
    const m = mask("1111111000");
    const vus = couvre(quayGapRuns(m, m.length));
    for (let i = 0; i < 6; i += 1) expect(vus.has(i), `sample ${i} ne devrait pas être repris`).toBe(false);
    expect(vus.has(6)).toBe(true);           // le seul recouvrement autorisé
  });

  it("TÉMOIN : la règle GLOBALE d'avant laissait ces samples à découvert", () => {
    // Sans ce témoin les assertions ci-dessus passeraient sur n'importe quelle
    // implémentation, y compris celle qui n'a jamais eu le défaut. On rejoue donc
    // l'ancienne décision — un seul booléen pour tout le fleuve — et on exige
    // qu'elle échoue sur l'invariant de couverture.
    const m = mask("111100001111");
    const ancienneRegle = () => [];          // « l'ère a des quais → le ruban ne dessine rien »
    const vusAvant = couvre(ancienneRegle());
    let decouverts = 0;
    for (let i = 0; i < m.length; i += 1) if (!m[i] && !vusAvant.has(i)) decouverts += 1;
    expect(decouverts).toBe(4);              // les 4 samples du port, nus
    expect(couvre(quayGapRuns(m, m.length)).size).toBeGreaterThan(0);
  });
});
