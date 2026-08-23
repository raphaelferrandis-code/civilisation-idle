// LISIÈRE QUI DIVAGUE : la frontière herbe↔ville serpente au lieu de suivre
// l'emprise au cordeau. La décision est un RENDU (kindAt), jamais le layout —
// ce que ces tests verrouillent, c'est qu'elle ne peut pas casser le jeu :
// aucune cellule bâtie ne bascule (sinon une maison se retrouve dans l'herbe),
// et rien ne bouge loin du bord.
import { describe, it, expect } from "vitest";
import { frontierFlip } from "../iso/isoGroundDetail.js";

// Ville = demi-plan gx < 0. La frontière court donc entre gx = -1 et gx = 0.
const cityLeft = (gx) => gx < 0;
const nothingBuilt = new Set();
const CFG = { p: 0.3, scale: 3.2, solo: true };   // solo : on teste une cellule à la fois

describe("garde des cellules bâties", () => {
  it("ne retourne JAMAIS une cellule qui porte une emprise", () => {
    const built = new Set();
    // Toute la colonne de bord est bâtie.
    for (let gy = -40; gy <= 40; gy += 1) built.add("-1," + gy);
    for (let gy = -40; gy <= 40; gy += 1) {
      expect(frontierFlip(-1, gy, true, cityLeft, built, CFG)).toBe(false);
    }
  });

  it("laisse passer la même cellule quand elle n'est bâtie de rien", () => {
    // Contrôle négatif : sans le garde, au moins une cellule de la colonne
    // bascule — sinon le test précédent ne prouverait rien.
    let flipped = 0;
    for (let gy = -40; gy <= 40; gy += 1) {
      if (frontierFlip(-1, gy, true, cityLeft, nothingBuilt, CFG)) flipped += 1;
    }
    expect(flipped).toBeGreaterThan(0);
  });

  it("n'applique le garde qu'au sens ville→herbe", () => {
    // Une cellule d'HERBE bâtie (cas théorique) peut se paver : ça ne déplace
    // aucun bâtiment, ça lui met du sol de ville sous les pieds.
    const built = new Set(["0,0"]);
    const asGrass = frontierFlip(0, 0, false, cityLeft, built, CFG);
    const asGrassUnbuilt = frontierFlip(0, 0, false, cityLeft, nothingBuilt, CFG);
    expect(asGrass).toBe(asGrassUnbuilt);
  });
});

describe("cellules peintes en ville sans être dans l'emprise (quais)", () => {
  // RÉGRESSION VÉCUE : le « quai-lite » pave toute berge qui touche le tissu
  // urbain — ces cellules sont rendues 'urban' mais ne sont PAS dans urbanSet.
  // Elles arrivaient donc ici avec isUrban=true et urbanLogical=false, le test de
  // bord ne pouvait pas les retenir, et le bruit les rendait en herbe : les quais
  // DISPARAISSAIENT le long du fleuve.
  it("ne retourne jamais une cellule rendue ville mais hors emprise", () => {
    // Berge : hors urbanSet, mais peinte en ville par la règle de quai.
    const berge = (gx) => gx < 0;   // l'emprise s'arrête à gx = 0
    let flipped = 0;
    for (let gy = -200; gy <= 200; gy += 1) {
      // gx = 0 : hors emprise (urbanLogical false) mais rendu 'urban' → isUrban true
      if (frontierFlip(0, gy, true, berge, nothingBuilt, CFG)) flipped += 1;
    }
    expect(flipped).toBe(0);
  });

  it("contrôle : la même colonne bouge quand rendu et emprise concordent", () => {
    // Sans ce contrôle, le test ci-dessus passerait même si plus RIEN ne bougeait.
    const berge = (gx) => gx < 0;
    let flipped = 0;
    for (let gy = -200; gy <= 200; gy += 1) {
      if (frontierFlip(0, gy, false, berge, nothingBuilt, CFG)) flipped += 1;   // rendu herbe = emprise
    }
    expect(flipped).toBeGreaterThan(0);
  });
});

describe("portée : le bord seulement", () => {
  it("ne touche à rien loin de la frontière", () => {
    for (let gx = -30; gx <= 30; gx += 1) {
      if (gx === -1 || gx === 0) continue;          // les deux colonnes de bord
      const isUrban = cityLeft(gx);
      expect(frontierFlip(gx, 7, isUrban, cityLeft, nothingBuilt, CFG)).toBe(false);
      expect(frontierFlip(gx, -13, isUrban, cityLeft, nothingBuilt, CFG)).toBe(false);
    }
  });

  it("fait bouger les deux colonnes de bord, dans les deux sens", () => {
    let bites = 0, tongues = 0;
    for (let gy = -60; gy <= 60; gy += 1) {
      if (frontierFlip(-1, gy, true, cityLeft, nothingBuilt, CFG)) bites += 1;    // herbe qui mord
      if (frontierFlip(0, gy, false, cityLeft, nothingBuilt, CFG)) tongues += 1;  // pavé qui sort
    }
    expect(bites).toBeGreaterThan(0);
    expect(tongues).toBeGreaterThan(0);
  });
});

describe("stabilité et dosage", () => {
  it("est déterministe : même cellule, même verdict", () => {
    for (let gy = -20; gy <= 20; gy += 1) {
      const a = frontierFlip(-1, gy, true, cityLeft, nothingBuilt, CFG);
      const b = frontierFlip(-1, gy, true, cityLeft, nothingBuilt, CFG);
      expect(b).toBe(a);
    }
  });

  it("p = 0 fige la frontière (le knob éteint vraiment)", () => {
    const off = { p: 0, scale: 3.2, solo: true };
    for (let gy = -60; gy <= 60; gy += 1) {
      expect(frontierFlip(-1, gy, true, cityLeft, nothingBuilt, off)).toBe(false);
      expect(frontierFlip(0, gy, false, cityLeft, nothingBuilt, off)).toBe(false);
    }
  });

  it("retourne d'autant plus de cellules que p monte", () => {
    const count = (p) => {
      let n = 0;
      for (let gy = -200; gy <= 200; gy += 1) {
        if (frontierFlip(-1, gy, true, cityLeft, nothingBuilt, { p, scale: 3.2, solo: true })) n += 1;
      }
      return n;
    };
    expect(count(0.45)).toBeGreaterThan(count(0.15));
  });

  it("la règle anti-losange-isolé ne peut que retirer des retournements", () => {
    const solo = { p: 0.3, scale: 3.2, solo: true };
    const grouped = { p: 0.3, scale: 3.2, solo: false };
    for (let gy = -80; gy <= 80; gy += 1) {
      if (frontierFlip(-1, gy, true, cityLeft, nothingBuilt, grouped)) {
        expect(frontierFlip(-1, gy, true, cityLeft, nothingBuilt, solo)).toBe(true);
      }
    }
  });
});
