// FONT AWESOME RÉDUIT AUX ICÔNES DU JEU (audit 2026-10-05, ASSET-10). index.css
// n'importe plus le paquet entier (54 Ko de CSS, TTF de 426 Ko copié dans dist/) mais
// src/assets/fontawesome.css, généré par scripts/vendorFontAwesome.mjs. Le risque de
// ce sous-ensemble : poser une icône nouvelle dans le code sans relancer le script —
// elle s'afficherait VIDE. Ce test relit le code et le CSS livré.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { glyphTable, iconsUsed } from "../../scripts/vendorFontAwesome.mjs";

const ROOT = path.resolve(__dirname, "../..");
const PKG = path.join(ROOT, "node_modules", "@fortawesome", "fontawesome-free");
const SUBSET = fs.readFileSync(path.join(ROOT, "src", "assets", "fontawesome.css"), "utf8");
const TABLE = glyphTable(fs.readFileSync(path.join(PKG, "css", "fontawesome.css"), "utf8"));

describe("Font Awesome : le sous-ensemble couvre le code", () => {
  it("chaque icône `fa-…` citée par le code a sa règle et le bon glyphe", () => {
    const used = iconsUsed(path.join(ROOT, "src"), TABLE);
    expect(used.length, "aucune icône relevée : la garde ne verrait rien").toBeGreaterThan(20);
    // Les classes construites (table RES_ICONS, repli de PurchaseRow) en font partie.
    for (const n of ["users", "wheat-awn", "coins", "book-open", "archway", "landmark", "scroll", "circle"]) expect(used).toContain(n);
    const absents = used.filter((n) => !SUBSET.includes(`.fa-${n} { --fa: "${TABLE.get(n)}"; }`));
    expect(absents, "relancer : node scripts/vendorFontAwesome.mjs").toEqual([]);
  });

  it("la police est servie en woff2 SEUL, depuis un fichier présent", () => {
    const faces = SUBSET.match(/@font-face\s*\{[^}]*\}/g) || [];
    expect(faces.length).toBe(1);
    expect(faces[0]).not.toMatch(/truetype|\.ttf/);
    const url = /url\("@fortawesome\/fontawesome-free\/([^"]+)"\)\s*format\("woff2"\)/.exec(faces[0]);
    expect(url, "la @font-face doit pointer le woff2 du paquet").not.toBe(null);
    expect(fs.existsSync(path.join(PKG, url[1]))).toBe(true);
  });

  it("index.css importe le sous-ensemble, plus le paquet entier", () => {
    const index = fs.readFileSync(path.join(ROOT, "src", "index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(index).toContain("@import './assets/fontawesome.css';");
    expect(index).not.toMatch(/@fortawesome\/fontawesome-free\/css/);
  });
});
