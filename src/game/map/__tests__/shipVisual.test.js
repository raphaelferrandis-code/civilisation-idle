import { describe, it, expect } from "vitest";

import { shipVisual, tradeStage } from "../iso/isoRenderer.js";

// Trois métiers sur le fleuve, trois aspects (riverFleet.js pilote leur vie, ce
// module décide de quoi ils ont l'air). Deux invariants tiennent la fiche :
//   • le PÊCHEUR garde sa barque en bois du début à la fin — c'est ce qui le
//     rend intemporel au milieu d'une ville qui mute (arbitrage Raph) ;
//   • le PLAISANCIER, lui, évolue en trois âges.
//
// Le troisième cas est une correction : l'iso avait gardé le seuil `ei >= 20`
// pour le vapeur alors que le legacy l'avait déjà repoussé à 25 EN DOCUMENTANT
// pourquoi (à 20, un vapeur croisait dès la bande Marbre devant des habitants
// en toge). Les deux rendus avaient divergé sans que personne le voie ; le
// seuil vivait même à trois endroits du seul fichier iso.

describe("shipVisual — le pêcheur ne vieillit pas", () => {
  it("garde la même barque de la première à la dernière ère", () => {
    const eres = [[0, 1], [2, 8], [4, 18], [5, 27], [6, 34], [9, 44]];
    // L'ère ne doit RIEN changer, dans l'une comme dans l'autre pose : seul
    // l'état de la barque a le droit de faire varier le sprite.
    for (const st of ["anchor", "cruise"]) {
      const keys = new Set(eres.map(([band, ei]) => shipVisual("fisher", band, ei, st).key));
      expect(keys.size).toBe(1);
    }
    expect(shipVisual("fisher", 0, 1, "anchor").key).toBe("fisher");
  });

  it("ne sort sa canne qu'à l'ARRÊT", () => {
    // « On ne pêche pas en naviguant » (Raph) : deux poses du même bonhomme, la
    // bascule se fait sur l'état de la barque et sur rien d'autre.
    const pose = shipVisual("fisher", 4, 18, "anchor").key;
    const route = shipVisual("fisher", 4, 18, "cruise").key;
    expect(pose).not.toBe(route);
    expect(pose).toBe("fisher");
    // Tout ce qui n'est pas l'ancre est en route — y compris un état inconnu,
    // sinon un futur état ferait pêcher le bonhomme en pleine traversée.
    for (const st of ["cruise", "dock", undefined, "", "leave"]) {
      expect(shipVisual("fisher", 4, 18, st).key).toBe(route);
    }
  });

  it("garde la même barque et la même échelle dans les deux poses", () => {
    const a = shipVisual("fisher", 4, 18, "anchor");
    const b = shipVisual("fisher", 4, 18, "cruise");
    expect(a.sizeMul).toBe(b.sizeMul);
    expect(a.stage).toBe(b.stage);
  });

  it("ne laisse un sillage QUE lorsqu'il avance", () => {
    // ⚠ CE TEST DISAIT L'INVERSE JUSQU'AU 2026-07-30 : « ne laisse aucun sillage,
    // il est à l'ancre ». C'était vrai du seul pêcheur qui existait alors — celui
    // qui traverse et se pose 90 s. Depuis que celui de l'île TOURNE autour d'elle,
    // une barque qui rame sans rien laisser derrière elle glisse comme un décalque
    // (Raph : « il faut qu'il ait des clapotis autour de lui et un sillage »).
    // Ce qui reste vrai, et c'est ce qui rend la pose lisible : à l'ancre, RIEN.
    expect(shipVisual("fisher", 4, 18, "anchor").wake).toBe(0);
    expect(shipVisual("fisher", 4, 18, "cruise").wake).toBeGreaterThan(0);
    // ...mais il reste le plus discret du fleuve : une barque n'est pas un cargo.
    expect(shipVisual("fisher", 4, 18, "cruise").wake).toBeLessThan(shipVisual("trade", 4, 18).wake);
  });

  it("reste la plus PETITE chose qui flotte", () => {
    // Échelle ramenée de 1,75 à 1,3 (Raph). La valeur généreuse datait du
    // pêcheur v1, sombre, qui se perdait sur l'eau ; la barque claire actuelle
    // se lit très bien plus petite. Une barque de pêche qui rivalise de taille
    // avec un vapeur ne se lit plus comme une barque.
    const barque = shipVisual("fisher", 4, 18, "anchor").sizeMul;
    for (const [band, ei] of [[2, 8], [5, 27], [6, 34]]) {
      expect(barque).toBeLessThan(shipVisual("trade", band, ei).sizeMul);
    }
  });
});

describe("shipVisual — le plaisancier a été retiré", () => {
  it("ne connaît plus que le marchand et le pêcheur", () => {
    // 🚫 Retiré par Raph le 2026-07-30 : le fleuve raconte le TRAVAIL, et un
    // promeneur y ajoutait du mouvement sans y ajouter de sens. Un `kind`
    // inconnu doit retomber sur le marchand plutôt que d'inventer un bateau.
    expect(shipVisual("yacht", 4, 18).stage).toBe(shipVisual("trade", 4, 18).stage);
    expect(shipVisual("promeneur", 4, 18).stage).toBe(shipVisual("trade", 4, 18).stage);
  });
});

describe("tradeStage — le vapeur ne double plus les toges", () => {
  it("n'arrive qu'à partir de l'ère 25", () => {
    expect(tradeStage(4, 20)).toBe("sail");
    expect(tradeStage(4, 24)).toBe("sail");
    expect(tradeStage(5, 25)).toBe("steam");
  });

  it("garde la marche complète des ères", () => {
    expect(tradeStage(1, 3)).toBe("raft");
    expect(tradeStage(3, 12)).toBe("sail");
    expect(tradeStage(6, 32)).toBe("container");
    expect(tradeStage(8, 40)).toBe("cosmic");
  });
});
