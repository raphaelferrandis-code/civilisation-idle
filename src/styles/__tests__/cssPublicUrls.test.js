/**
 * LES url() ABSOLUES DES FEUILLES VISENT DES FICHIERS QUI EXISTENT.
 * ---------------------------------------------------------------------------
 * Une url("/pixelart/…") est laissée telle quelle par Vite et résolue dans
 * public/ à l'exécution. Pointée vers un fichier absent, elle ne casse rien de
 * visible — seulement un « didn't resolve at build time » à chaque build, qui
 * noie les vrais avertissements. C'était le cas des trois faces de ticket à
 * gratter `ui/scratch/ticket-*.png`, qui n'ont jamais existé (audit du
 * 2026-10-05, ASSET-9). En CI, le clone n'a que les fichiers suivis : un asset
 * resté local (ignoré par git) y fait échouer cette garde, comme il se doit.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const racine = path.resolve(__dirname, "../../..");
const feuilles = fs.readdirSync(path.join(racine, "src"), { recursive: true })
  .map((f) => String(f).replace(/\\/g, "/"))
  .filter((f) => f.endsWith(".css"));

describe("url() absolues des feuilles de style", () => {
  it("chacune vise un fichier présent dans public/", () => {
    const absentes = [];
    for (const f of feuilles) {
      const css = fs.readFileSync(path.join(racine, "src", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      // `/` seul : `//hôte/…` (relatif au protocole) n'est pas un fichier de public/.
      for (const m of css.matchAll(/url\(\s*["']?(\/(?!\/)[^"')?#]+)/g)) {
        if (!fs.existsSync(path.join(racine, "public", m[1]))) absentes.push(`${f} → ${m[1]}`);
      }
    }
    expect(feuilles.length).toBeGreaterThan(0);
    expect(absentes).toEqual([]);
  });
});
