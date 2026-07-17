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
// Ce test verrouille le point 2, le piège qui s'est réarmé malgré un commentaire
// d'avertissement : seuls les états lus par cityMapBakeMargin (CM._*Bake) valent
// invalidation. Le point 1 est vérifié en live (canvas + rAF, hors portée vitest).

const MAP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEAD_KEYS = /\b(?:CM\.)?(staticCamKey|tileCamKey|groundCamKey)\s*=/;

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

// Une ligne de commentaire mentionnant les clés mortes est légitime (l'avertissement
// posé dans cityMapRuntime) : on ne traque que les AFFECTATIONS.
const codeLines = (src) =>
  src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));

describe("invalidation des bakes carte", () => {
  it("n'invalide jamais un bake via une clé parallèle morte", () => {
    const offenders = [];
    for (const file of jsFiles(MAP_DIR)) {
      codeLines(readFileSync(file, "utf8")).forEach((line) => {
        if (DEAD_KEYS.test(line)) offenders.push(`${file}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  // Contrôle négatif : le motif traqué est bien détectable (sinon le test ci-dessus
  // passerait pour de mauvaises raisons — un regex mort qui ne matche plus rien).
  it("détecte le motif mort quand il est présent (contrôle négatif)", () => {
    expect(codeLines("CM.groundCamKey = '';").some((l) => DEAD_KEYS.test(l))).toBe(true);
    expect(codeLines("  CM._isoGroundBake = null;").some((l) => DEAD_KEYS.test(l))).toBe(false);
  });
});
