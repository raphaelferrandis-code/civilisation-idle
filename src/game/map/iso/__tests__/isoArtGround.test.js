import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isoArt, isoArtFeedsGround } from "../isoArt.js";
import { setSolPyramideInvalidator } from "../solInvalidate.js";

// Audit 2026-10-05, PERF-27 — chaque PNG iso décodé (bateau, pont, clôture, arbre,
// merveille…) invalidait TOUT le sol en pyramide (~100 à 150 tuiles recuites). Seuls
// les arts que le sol lit l'invalident désormais (isoArtFeedsGround). La garde : les
// isoArt(…) des modules que la cuisson du sol peut atteindre passent tous le prédicat,
// sauf les appels de la passe vivante, relevés ici à la main — un art ajouté au sol
// sans passer par le prédicat (le sol resterait périmé à son décodage) fait échouer.

const ISO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// + isoWonder.js : le peintre des LIEUX des merveilles, que le sol appelle sans
// l'importer (injecté par setWonderPlacePainter, cf. isoWonderGround.js).
const ROOTS = ["isoGroundBake.js", "solPyramide.js", "solPyramideFrame.js", "isoWonder.js"].map((f) => path.join(ISO, f));
// Les modules atteignables par import depuis la cuisson du sol (sur-ensemble).
function closure(roots) {
  const seen = new Set(), stack = [...roots];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !fs.existsSync(f)) continue;
    seen.add(f);
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/^import[^;]*?from\s+['"](\.[^'"]+)['"]/gms)) {
      let p = path.join(path.dirname(f), m[1]);
      if (!p.endsWith(".js")) p += ".js";
      stack.push(p);
    }
  }
  return [...seen];
}
// Les appels isoArt(…) d'un fichier, hors commentaires : l'argument, tel qu'écrit.
function calls(file) {
  const out = [];
  const src = fs.readFileSync(file, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  let i = src.indexOf("isoArt(");
  while (i >= 0) {
    if (!/[\w.]/.test(src[i - 1] || "")) {
      let d = 1, j = i + 7;
      for (; j < src.length && d > 0; j += 1) { if (src[j] === "(") d += 1; else if (src[j] === ")") d -= 1; }
      out.push(src.slice(i + 7, j - 1).replace(/\s+/g, " ").trim());
    }
    i = src.indexOf("isoArt(", i + 7);
  }
  return out;
}
// Appels de la PASSE VIVANTE dans ces modules (le sol ne les atteint pas) : arbres
// de saison, réverbères, chaussée du pont (sa propre cuisson), objets des ponts et
// des merveilles, arbres de l'îlot de l'Aiguille, navires à quai.
const LIVE = new Set([
  "isoGroundDetail.js|name + '-winter'",
  "isoWonder.js|name",
  "isoStreet.js|'lamp-' + lampEraForBand(band) + '?v=' + LAMP_V",
  "isoBridge.js|tile",
  "isoProps.js|PROP_ART[pr.prop] || ('plaza/' + pr.prop + '-' + pr.era)",
  "isoProps.js|'plaza/anim/brazier-' + pr.era",
  "portBerths.js|'boat-' + h.key + '-' + boatSector(heading)",
]);

describe("PERF-27 — seuls les arts du sol invalident le sol", () => {
  it("chaque isoArt(…) atteignable par la cuisson du sol passe le prédicat, ou est de la passe vivante", () => {
    const groundLits = new Set(), liveSeen = new Set();
    for (const f of closure(ROOTS)) {
      if (path.basename(f) === "isoArt.js") continue;
      for (const arg of calls(f)) {
        const id = path.basename(f) + "|" + arg;
        if (LIVE.has(id)) { liveSeen.add(id); continue; }
        const lits = [...arg.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2]);
        expect(lits.length, `${id} : un nom d'art sans littéral, à classer`).toBeGreaterThan(0);
        for (const s of lits) {
          expect(isoArtFeedsGround(s), `${id} : « ${s} » lu par le sol mais hors de isoArtFeedsGround`).toBe(true);
          groundLits.add(s);
        }
      }
    }
    // Le prédicat n'est pas vide de sens : les cinq arts du sol sont bien là…
    for (const s of ["plaza-", "deco/tuft-", "median-lawn", "median-lawn-winter", "flowerbed-"]) expect(groundLits.has(s), s).toBe(true);
    // …et la liste des appels vivants n'est pas périmée.
    expect([...LIVE].filter((id) => !liveSeen.has(id))).toEqual([]);
  });

  it("le prédicat écarte les sprites de la passe vivante", () => {
    for (const n of ["boat-sail-3", "tree-2", "tree-2-winter", "plaza/fence-n-antique", "lamp-gas?v=3", "bush-1", "anim/plaza-fountain-medieval?v=2"]) {
      expect(isoArtFeedsGround(n), n).toBe(false);
    }
    for (const n of ["plaza-antique", "deco/tuft-3", "median-lawn-winter", "flowerbed-2"]) expect(isoArtFeedsGround(n), n).toBe(true);
  });

  describe("au décodage", () => {
    afterEach(() => { setSolPyramideInvalidator(null); vi.unstubAllGlobals(); });
    it("un sprite vivant décodé ne touche pas au sol ; un art du sol l'invalide en douceur", () => {
      const imgs = [];
      vi.stubGlobal("Image", class { constructor() { imgs.push(this); } });
      const inv = [];
      setSolPyramideInvalidator((kind) => inv.push(kind));
      isoArt("boat-test-perf27-1");
      isoArt("deco/tuft-perf27");
      expect(imgs).toHaveLength(2);
      imgs[0].onload();
      expect(inv).toEqual([]);
      imgs[1].onload();
      expect(inv).toEqual(["soft"]);
    });
  });
});
