/**
 * LE PANNEAU DU JEU DES PLAISIRS N'A PAS DE FLOU (audit du 2026-10-05, PERF-62).
 * ---------------------------------------------------------------------------
 * Son sol est le feutre OPAQUE de la table de l'âge : un `backdrop-filter` n'y
 * floutait que l'invisible, mais coûtait ~220 ms de CPU par seconde en rendu
 * logiciel (la salle derrière se repeint 12 fois par seconde), et faisait du
 * panneau le bloc conteneur du feuillet « ? » (`position: fixed`, StageHelp) :
 * décalé hors du cadre, rogné, invisible sur la roue et pendant le vol d'Icare.
 *
 * postcss est fourni par Vite (dépendance directe de vite).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const src = path.resolve(__dirname, "../..");
const norm = (s) => s.replace(/\s+/g, " ").trim();

describe("le panneau du jeu des Plaisirs", () => {
  it("ne porte aucun filtre (ni backdrop-filter, ni filter) hors « none »", () => {
    const fautifs = [];
    for (const f of ["views-plaisirs.css", "plaisirs-tables.css"]) {
      postcss.parse(fs.readFileSync(path.join(src, "styles", f), "utf8"), { from: f }).walkDecls(/^(-webkit-)?(backdrop-)?filter$/, (d) => {
        const sel = d.parent && d.parent.selector ? norm(d.parent.selector) : "";
        if (/\.regulation-stage(?![\w-])(?![^,]*\s)/.test(sel) && norm(d.value) !== "none") fautifs.push(`${f} : ${sel} { ${d.prop}: ${d.value} }`);
      });
    }
    expect(fautifs).toEqual([]);
  });
});
