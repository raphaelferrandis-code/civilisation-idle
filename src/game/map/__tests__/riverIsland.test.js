import { describe, it, expect } from "vitest";

// L'Aiguille Céleste tenait au milieu du courant, et les bateaux devaient la
// contourner. Sur le modèle de l'Île de la Cité (Raph, 2026-07-30), le fleuve
// s'ÉVASE désormais autour d'elle et la contourne par deux bras.
//
// Ce test rejoue la géométrie de layout.js sur un ruban synthétique. Il ne
// vérifie pas des couleurs mais les trois propriétés dont tout le reste dépend :
// l'île tient dans le lit, les deux bras existent VRAIMENT, et le lit s'ouvre en
// douceur au lieu de faire un renflement carré.

// Mêmes valeurs que layout.js — si elles y changent, ce test doit suivre, et
// c'est voulu : ce sont elles qui décident de la forme de l'île.
const RX = 4.6, RY = 2.4, ETALE = RX * 2.5, BOSSE = RY + 1.9;

// Ruban droit, largeur de base 3 (soit 6 tuiles de lit) — le fleuve du jeu.
function litApres(nSamples = 60, hw0 = 3) {
  const sm = Array.from({ length: nSamples }, (_, i) => ({ x: i, y: 0, hw: hw0 }));
  const c = sm[Math.floor(nSamples / 2)];
  for (const sp of sm) {
    const d = Math.abs(sp.x - c.x);
    if (d > ETALE) continue;
    const u = 1 - d / ETALE;
    sp.hw += BOSSE * u * u * (3 - 2 * u);
  }
  return { sm, centre: c };
}

describe("île de l'Aiguille — le fleuve se sépare en deux bras", () => {
  it("le lit s'évase autour de l'île", () => {
    const { sm, centre } = litApres();
    const auCentre = sm.find((s) => s.x === centre.x).hw;
    const auLoin = sm[0].hw;
    expect(auCentre).toBeGreaterThan(auLoin);
    expect(auCentre - auLoin).toBeCloseTo(BOSSE, 5);
  });

  it("chaque bras reste NAVIGABLE, pas un filet d'eau", () => {
    // C'est tout l'enjeu : une île qui mangerait le lit laisserait deux rigoles
    // et le fleuve cesserait de se lire comme un fleuve. Chaque bras doit
    // avaler le porte-conteneurs (2,24 tuiles de large).
    const { sm, centre } = litApres();
    const hw = sm.find((s) => s.x === centre.x).hw;
    const bras = hw - RY;                       // de la berge de l'île à la rive
    expect(bras).toBeGreaterThan(2.24);
  });

  it("l'île tient DANS le lit élargi, elle ne mord pas les rives", () => {
    const { sm, centre } = litApres();
    const hw = sm.find((s) => s.x === centre.x).hw;
    expect(RY).toBeLessThan(hw * 0.7);
  });

  it("les rives s'ouvrent en DOUCEUR, sans renflement carré", () => {
    // L'évasement suit un smoothstep : la pente doit être nulle aux deux bouts
    // et maximale à mi-chemin. Un profil en créneau se verrait comme un
    // élargissement brutal du fleuve.
    const { sm, centre } = litApres();
    const at = (dx) => sm.find((s) => s.x === centre.x + dx).hw;
    const pente = (dx) => Math.abs(at(dx + 1) - at(dx));
    expect(pente(Math.round(ETALE) - 2)).toBeLessThan(pente(Math.round(ETALE / 2)));
    expect(pente(0)).toBeLessThan(pente(Math.round(ETALE / 2)));
  });

  it("l'évasement est LOCAL : le fleuve reprend sa largeur", () => {
    const { sm } = litApres(60, 3);
    expect(sm[0].hw).toBeCloseTo(3, 5);
    expect(sm[sm.length - 1].hw).toBeCloseTo(3, 5);
  });

  it("l'île est un FUSEAU, pas un rond", () => {
    // Une île ronde ferait barrage ; un fuseau allongé dans le sens du courant
    // se laisse contourner — c'est la forme de toutes les îles de rivière.
    expect(RX).toBeGreaterThan(RY * 1.5);
  });
});
