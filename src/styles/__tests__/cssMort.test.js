/**
 * PAS DE CSS MORT : chaque règle peut viser un élément que le jeu pose.
 * ---------------------------------------------------------------------------
 * Le relevé du 05/10 a trouvé ≈370 règles qu'aucun élément ne pouvait porter
 * (≈42 Ko minifiés, ≈11 % du CSS principal) : les anciennes UI des Augures,
 * d'Icare, de l'ancienne boutique et de l'ancienne vue Cité, qui se lisaient
 * comme vivantes, plus 15 @keyframes et une dizaine de jetons orphelins (audit
 * du 2026-10-05, MORT-7 et STRUCT-14). Le relevé lui-même vit dans
 * scripts/cssMort.mjs (`node scripts/cssMort.mjs` pour la liste lisible).
 *
 * Retirer une classe du JSX sans retirer ses règles fait échouer cette garde :
 * c'est voulu, c'est le moment où l'on sait encore à quoi elles servaient.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyserCss, formaterCss } from "../../../scripts/cssMort.mjs";

const racine = path.resolve(__dirname, "../../..");

describe("CSS mort", () => {
  it("aucune règle, aucun sélecteur, aucune @keyframes ni aucun jeton orphelin", () => {
    const r = formaterCss(analyserCss({ racine }));
    expect(r).toEqual({ regles: [], partielles: [], keyframes: [], jetonsMuets: [], jetonsVides: [] });
  });

  it("le relevé voit bien le mort, et seulement lui (témoin)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "css-mort-"));
    try {
      fs.mkdirSync(path.join(tmp, "src"));
      fs.writeFileSync(path.join(tmp, "src", "a.css"), [
        ".vive { color: red; animation: battre 1s; border-color: var(--lu); }",
        ".morte { animation: jamais 1s; color: var(--lu-par-du-mort); }",
        ".vive, .morte-aussi { color: blue; }",
        ".vive:not(.absente) { color: green; }",       // :not() n'exige rien
        ".etat-dyn { color: gold; }",                  // `etat-${x}` dans le JS
        "[data-pose] .vive, [data-jamais] .vive { color: pink; }",
        ".vive :is(.vive, .morte-is, :not(.x)) { color: teal; }", // un argument mort traîne
        "@keyframes battre { to { opacity: 0; } }",
        "@keyframes jamais { to { opacity: 0; } }",
        "@keyframes orpheline { to { opacity: 0; } }",
        ":root { --lu: red; --muet: blue; --lu-par-du-mort: green; }",
        ".vive { outline-color: var(--jamais-ecrit, red); }",
      ].join("\n"));
      fs.writeFileSync(path.join(tmp, "src", "A.jsx"),
        "export const A = ({ x }) => <div className={`vive etat-${x}`} data-pose=\"1\" />;\n");
      const r = analyserCss({ racine: tmp });
      expect(r.regles.map((x) => x.selecteurs.join(", "))).toEqual([".morte"]);
      expect(r.partielles.map((x) => x.morts)).toEqual([[".morte-aussi"], ["[data-jamais] .vive"], [":is(.morte-is)"]]);
      expect(r.keyframes.map((x) => x.nom)).toEqual(["jamais", "orpheline"]);
      expect(r.jetonsMuets.map((x) => x.nom)).toEqual(["--muet", "--lu-par-du-mort"]);
      expect(r.jetonsVides.map((x) => x.nom)).toEqual(["--jamais-ecrit"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
