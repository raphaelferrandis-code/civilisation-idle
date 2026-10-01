import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// « Des fois le jeu ne charge pas les textures avant que je bouge la caméra ou que
// je scroll » (retour Raph 2026-07-16). Cause : les canvases offscreen étaient
// effacés (réallocation au resize, ou recréés à neuf au remontage de la vue Cité)
// SANS que l'état de bake correspondant tombe — cityMapBakeMargin croyait son cache
// valide et blittait du vide, jusqu'à ce qu'un pan hors marge ou un zoom change la
// clé. Deux pièges se cumulaient :
//   1. resize() n'annulait pas CM._isoGroundBake, alors que le sol ISO (le renderer
//      par défaut) bake dans le MÊME CM.groundCanvas que le legacy ;
//   2. l'invalidation passait par CM.staticCamKey / tileCamKey / groundCamKey —
//      des clés PARALLÈLES écrites sur 15 sites et relues NULLE PART : chaque
//      invalidation était un no-op silencieux (y compris celles des onload de
//      sprites, d'où le repli procédural gelé).
// Ce test verrouillait le point 2 : seuls les états lus par cityMapBakeMargin
// (CM._*Bake) valaient invalidation.
//
// 2026-10-01 — la cuisson avec marge est partie avec l'ancien quai (c8b042c), son
// dernier client ; puis ses offscreen (CM.staticCanvas / CM.tileCanvas) et leurs
// états. Les CM._*Bake sont alors devenus à leur tour ce que les *CamKey étaient :
// écrits sur une quinzaine de sites, relus nulle part. Le sol a sa propre porte
// (iso/solInvalidate.js, gardée par solInvalidate.test.js) ; ce test garde
// désormais que TOUTE cette famille reste partie — une ligne qui y reviendrait
// serait du code mort qui se croit vivant.

const MAP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEAD = new RegExp(
  "\\b(?:staticCamKey|tileCamKey|groundCamKey" +
  "|_staticBake|_tileBake|_groundBake|_bakeMargin|tileDirtyUntil" +
  "|staticCanvas|tileCanvas|__panMargin" +
  "|cmInvalidateBakes|cityMapBakeMargin|cityMapBlitMargin)\\b" +
  "|\\bCM\\.(?:sctx|tctx)\\b"
);

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__") out.push(...jsFiles(full));
    } else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

// Une ligne de commentaire qui raconte cette histoire est légitime (journaux de
// cityMapRuntime, solTrace) : on ne traque que le CODE.
const codeLines = (src) =>
  src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));

describe("la cuisson avec marge et ses états sont bien partis", () => {
  it("aucun fichier de src/game/map n'y touche encore", () => {
    const offenders = [];
    for (const file of jsFiles(MAP_DIR)) {
      codeLines(readFileSync(file, "utf8")).forEach((line) => {
        if (DEAD.test(line)) offenders.push(`${file}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  // Contrôle négatif : le motif traqué est bien détectable (sinon le test ci-dessus
  // passerait pour de mauvaises raisons — un regex mort qui ne matche plus rien),
  // et il ne mord pas sur les homonymes VIVANTS (contextes locaux `sctx`/`tctx`
  // d'isoGroundRoads et solPyramide, états voisins du sol).
  it("détecte une résurgence, épargne les homonymes (contrôle négatif)", () => {
    const hit = (l) => codeLines(l).some((x) => DEAD.test(x));
    expect(hit("CM.groundCamKey = '';")).toBe(true);
    expect(hit("    CM._tileBake = null;")).toBe(true);
    expect(hit("  const ok = CM.staticCanvas && CM.tileCanvas;")).toBe(true);
    expect(hit("  CM.sctx.setTransform(dpr, 0, 0, dpr, 0, 0);")).toBe(true);
    expect(hit("  cmInvalidateBakes();")).toBe(true);
    expect(hit("  const sctx = lay ? lay.ctx : ctx;")).toBe(false);
    expect(hit("    tctx.setTransform(1, 0, 0, 1, 0, 0);")).toBe(false);
    expect(hit("  CM._groundBakeStable = true;")).toBe(false);
    expect(hit("  // CM._tileBake = null; (journal)")).toBe(false);
  });
});
