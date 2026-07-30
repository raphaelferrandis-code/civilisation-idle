import { describe, it, expect } from "vitest";

import { riverDodge } from "../iso/isoRenderer.js";

// L'Aiguille Céleste est posée EN PLEIN FLEUVE — c'est un phare, et
// cmWetWonderSlot la cale volontairement sur le centre du courant. Les bateaux,
// eux, suivent le ruban : ils lui rentraient dedans (Raph, 2026-07-30).
//
// L'évitement se joue sur la seule voie TRANSVERSALE, jamais sur la position le
// long du fleuve : on ne dévie pas le cours d'eau, on se range d'un bord.
//
// `lateral` et `obs.lat` sont dans le même repère : des tuiles depuis l'axe du
// ruban, signées. `hw` est la demi-largeur d'eau à cet endroit.

const OBS = (lat, t = 0.5, r = 1.2) => [{ t, lat, r }];
const HW = 6;                     // fleuve large : la place de manœuvrer
const SIZE = 1.4;                 // coque moyenne

describe("évitement d'un obstacle planté dans l'eau", () => {
  it("écarte le bateau quand il arrive au droit du monument", () => {
    const avant = 0.2;
    const apres = riverDodge(avant, 0.5, SIZE, HW, OBS(0));
    expect(Math.abs(apres)).toBeGreaterThan(Math.abs(avant));
    // Et il passe VRAIMENT à côté : au moins le rayon plus la demi-coque.
    expect(Math.abs(apres - 0)).toBeGreaterThan(1.2 + SIZE * 0.5);
  });

  it("ne touche à rien loin de l'obstacle", () => {
    // À l'autre bout du fleuve, la voie doit être exactement celle demandée —
    // sinon tous les bateaux navigueraient de travers en permanence.
    expect(riverDodge(0.3, 0.05, SIZE, HW, OBS(0))).toBe(0.3);
    expect(riverDodge(-0.7, 0.9, SIZE, HW, OBS(0))).toBe(-0.7);
  });

  it("l'écart se creuse PROGRESSIVEMENT à l'approche", () => {
    // Un coup de barre sec se verrait ; la manœuvre doit s'annoncer.
    const suite = [0.5 - 0.04, 0.5 - 0.025, 0.5 - 0.012, 0.5]
      .map((t) => Math.abs(riverDodge(0.1, t, SIZE, HW, OBS(0))));
    for (let i = 1; i < suite.length; i += 1) {
      expect(suite[i]).toBeGreaterThanOrEqual(suite[i - 1]);
    }
    expect(suite[suite.length - 1]).toBeGreaterThan(suite[0] * 2);
  });

  it("se range du côté où il est DÉJÀ", () => {
    // Traverser le monument pour se ranger « du bon côté » serait pire que le
    // défaut qu'on corrige.
    expect(riverDodge(0.6, 0.5, SIZE, HW, OBS(0))).toBeGreaterThan(0);
    expect(riverDodge(-0.6, 0.5, SIZE, HW, OBS(0))).toBeLessThan(0);
  });

  it("passe de l'autre bord plutôt que d'échouer sur la berge", () => {
    // Obstacle collé à la rive droite : se ranger encore plus à droite mettrait
    // le bateau au sec. Il doit filer à gauche.
    const hwEtroit = 3;
    const obsPresDeLaRive = OBS(2.2);
    const apres = riverDodge(1.8, 0.5, SIZE, hwEtroit, obsPresDeLaRive);
    expect(apres).toBeLessThan(1.8);
    // Et il reste DANS l'eau.
    expect(Math.abs(apres)).toBeLessThanOrEqual(hwEtroit);
  });

  it("ne sort jamais du lit, même si le dégagement voulu n'y tient pas", () => {
    // Fleuve étroit + grosse coque : impossible de dégager complètement. Le
    // bateau doit se ranger AU MAXIMUM sans jamais franchir la berge — mieux
    // vaut frôler le monument que naviguer sur le quai.
    const hwEtroit = 2.5, grosse = 2.4;
    for (const depart of [-0.5, 0, 0.5]) {
      const apres = riverDodge(depart, 0.5, grosse, hwEtroit, OBS(0, 0.5, 1.6));
      expect(Math.abs(apres)).toBeLessThanOrEqual(hwEtroit * 0.86);
    }
  });

  it("un bateau LARGE se range plus loin qu'une barque", () => {
    const barque = Math.abs(riverDodge(0.2, 0.5, 0.7, HW, OBS(0)));
    const cargo = Math.abs(riverDodge(0.2, 0.5, 2.4, HW, OBS(0)));
    expect(cargo).toBeGreaterThan(barque);
  });

  it("sans obstacle publié, la voie est intacte", () => {
    expect(riverDodge(0.42, 0.5, SIZE, HW, [])).toBe(0.42);
  });
});

// Les palées d'un pont tombaient tous les 1,15 à 1,6 tuiles d'une berge à
// l'autre, alors qu'un porte-conteneurs en fait 2,24 de large : il ne pouvait
// passer NULLE PART et traversait la pierre. isoBridge ouvre maintenant la
// travée du milieu ; encore faut-il que les bateaux s'y présentent.
const GATE = (t = 0.5) => [{ t }];

describe("passe navigable sous un pont", () => {
  it("recentre le bateau au droit de l'ouvrage", () => {
    const aBord = 2.4;
    const auPont = riverDodge(aBord, 0.5, SIZE, HW, [], GATE());
    expect(Math.abs(auPont)).toBeLessThan(Math.abs(aBord) * 0.2);
  });

  it("le recentrage s'annonce de LOIN", () => {
    // On se présente à une passe bien avant d'y être — l'inverse d'un obstacle,
    // qu'on ne serre qu'au dernier moment.
    const suite = [0.5 - 0.065, 0.5 - 0.04, 0.5 - 0.02, 0.5]
      .map((t) => Math.abs(riverDodge(2.4, t, SIZE, HW, [], GATE())));
    for (let i = 1; i < suite.length; i += 1) {
      expect(suite[i]).toBeLessThanOrEqual(suite[i - 1]);
    }
    expect(suite[0]).toBeLessThan(2.4);          // déjà amorcé au plus loin
  });

  it("ne touche à rien loin du pont", () => {
    expect(riverDodge(2.1, 0.1, SIZE, HW, [], GATE())).toBe(2.1);
  });

  it("l'obstacle l'emporte sur la passe s'ils se superposent", () => {
    // Un monument planté juste sous un pont : mieux vaut sortir de l'axe que
    // rentrer dans la pierre. L'évitement s'applique APRÈS le recentrage.
    const r = riverDodge(0.8, 0.5, SIZE, HW, OBS(0), GATE());
    expect(Math.abs(r)).toBeGreaterThan(1);
  });
});
