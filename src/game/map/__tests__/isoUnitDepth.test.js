import { describe, it, expect, afterEach } from "vitest";

import { CM } from "../layout.js";
import { isoUnitDepth } from "../iso/isoRenderer.js";

// PROFONDEUR PEINTRE des unités mobiles (habitants / véhicules / émeutiers) en
// iso (isoUnitDepth). drawIsoLive classe chaque bâtiment au coin SUD de son
// emprise (clé x1+y1) : une unité qui longe la face sud/est d'une emprise
// multi-tuiles a une somme wx+wy PLUS PETITE que cette clé → elle était
// dessinée AVANT, donc avalée par le mur qu'elle devance (retour Raph « pas de
// cohérence de profondeur »). isoUnitDepth remonte sa clé juste au-dessus de
// celle du bâtiment ; une unité DERRIÈRE (nord-ouest, colonne recouverte)
// plafonne au contraire toute remontée SOUS la clé de son occulteur (jamais
// dessinée sur son toit — l'occulteur gagne, comme la passe 1 du legacy).

const T = 32;
const house = (gx, gy, spanX, spanY, buildingId = "house") => ({ gx, gy, spanX, spanY, buildingId, type: "house" });
function setLayout(tiles) {
  CM.TILE = T;
  CM.layout = { tiles };
  // Invalide la mémo des fiches (clé = layoutRecomputeAt).
  CM.layoutRecomputeAt = (CM.layoutRecomputeAt || 0) + 1;
}
afterEach(() => { CM.layout = null; });

describe("isoUnitDepth — unités face aux emprises multi-tuiles", () => {
  it("unité sur la route SUD d'une tour 1×2, collée au mur : remontée juste devant la clé", () => {
    setLayout([house(95, 86, 1, 2)]);                 // coin sud (96,88) → clé 184·T
    const d = isoUnitDepth(95.3 * T, 88.2 * T);       // somme brute 183.5·T < 184·T
    expect(d).toBeGreaterThan(184 * T);               // passe devant le mur…
    expect(d - 184 * T).toBeLessThanOrEqual(T);       // …d'un cheveu seulement
  });

  it("unité sur le flanc EST d'une tour 2×2 (cas voiture vérifié in-game) : devant", () => {
    setLayout([house(98, 77, 2, 2)]);                 // coin sud (100,79) → clé 179·T
    const d = isoUnitDepth(100.5 * T, 78.2 * T);      // somme brute 178.7·T, wx ≥ x1 → devant
    expect(d).toBeGreaterThan(179 * T);
  });

  it("unité au NORD (vraiment derrière) : clé brute inchangée — elle reste occultée", () => {
    setLayout([house(10, 10, 2, 2)]);                 // clé 24·T
    expect(isoUnitDepth(11 * T, 9.5 * T)).toBe((11 + 9.5) * T);
  });

  it("unité hors de la colonne du sprite : clé brute (pas de recouvrement)", () => {
    setLayout([house(10, 10, 1, 1)]);                 // ax = 0, halfW ≈ 1.23·T
    // Voisine (fiche balayée) mais à l'ouest du rect : |sxScr − ax| = 2.2·T > halfW → intacte.
    expect(isoUnitDepth(9.2 * T, 11.4 * T)).toBe((9.2 + 11.4) * T);
  });

  it("conflit devant B1 / derrière B2 : la remontée PLAFONNE sous la clé de l'occulteur", () => {
    // B1 très large au nord (clé 27·T) ; B2 1×1 au sud de l'unité (clé 27·T − 1·T).
    setLayout([house(10, 10, 6, 1), house(13, 12, 1, 1)]);
    const raw = (13.5 + 11.3) * T;                    // 24.8·T
    const d = isoUnitDepth(13.5 * T, 11.3 * T);       // devant B1 (wy ≥ 11) mais derrière B2
    expect(d).toBeGreaterThan(raw);                   // remontée réelle…
    expect(d).toBeLessThan((14 + 13) * T);            // …mais jamais au-dessus de B2 (pas sur son toit)
  });

  it("empreinte À PLAT (champ) : ignorée — le sol ne peut pas avaler une unité", () => {
    setLayout([house(95, 86, 1, 2, "field-wheat")]);
    expect(isoUnitDepth(95.3 * T, 88.2 * T)).toBe((95.3 + 88.2) * T);
  });

  it("aqueduc : ignoré (tranches par tuile, clippées à leur colonne)", () => {
    setLayout([house(90, 40, 10, 1, "aqueducts")]);
    expect(isoUnitDepth(92 * T, 41.2 * T)).toBe((92 + 41.2) * T);
  });

  it("sans layout : somme brute (repli sûr)", () => {
    CM.layout = null;
    expect(isoUnitDepth(5 * T, 7 * T)).toBe(12 * T);
  });
});
