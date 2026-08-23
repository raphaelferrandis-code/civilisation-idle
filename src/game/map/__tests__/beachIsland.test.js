// Rivage de galets/sable des îles — garde de RÉGLAGE.
//
// Raph, 2026-07-30 : « il faut générer une plage, aussi autour de l'île de
// l'aiguille », puis « le contour n'est pas bien fait, on veut un joli contour
// identique ». Le contour est un TRAIT le long de l'ellipse de l'île, d'épaisseur
// constante (`drawIsoIslandShore`) : il n'y a plus de règle par cellule à tester,
// et son aspect se juge à l'œil.
//
// Ce qui reste testable est le seul chiffre que je me suis trompé DEUX FOIS :
// la largeur. 1,3 tuile puis 0,75 paraissaient modestes dans l'absolu, mais
// l'Aiguille ne fait que 2 × ry = 4,8 tuiles de LARGE — à 1,3 le rivage en
// mangeait la moitié et se lisait comme une allée de gravier, pas comme une berge.
// Une largeur de rivage se juge au RAPPORT à l'objet qu'elle borde.
import { describe, it, expect } from "vitest";
import { BEACH } from "../iso/isoGroundTiles.js";

// L'Aiguille Céleste telle que layout.js la construit (rx 7,6 / ry 2,4).
const AIGUILLE_RY = 2.4;

describe("réglage du rivage d'île", () => {
  it("reste nettement plus étroit que la demi-largeur de l'île", () => {
    // À ry/2 le sable et l'herbe se partagent l'île moitié-moitié ; au-delà, il
    // n'y a plus d'île sous la plage. On exige une vraie marge.
    expect(BEACH.islandW).toBeLessThan(AIGUILLE_RY / 2);
    expect(BEACH.islandW).toBeGreaterThan(0.2);          // sous 0,2 tuile, invisible au zoom de jeu
  });

  it("la matière du rivage est l'une des deux cuites", () => {
    // `mat` nomme un kind du bake ET une clé de tuile : une valeur fantaisiste
    // ferait un sol en aplat gris sans que rien ne proteste.
    expect(['sand', 'shingle']).toContain(BEACH.mat);
  });

  it("la frange humide a un ton pour CHAQUE matière", () => {
    // Le ton suit la matière (du sable mouillé reste du sable) : une matière sans
    // entrée retomberait sur le gris des galets sous une plage de sable.
    expect(BEACH.wetTone.sand).toMatch(/^\d+,\d+,\d+$/);
    expect(BEACH.wetTone.shingle).toMatch(/^\d+,\d+,\d+$/);
    expect(BEACH.wetTone[BEACH.mat], `pas de ton humide pour « ${BEACH.mat} »`).toBeTruthy();
  });
});
