/**
 * PLANCHER TYPOGRAPHIQUE : AUCUNE NOUVELLE TAILLE SOUS 11 PX.
 * ---------------------------------------------------------------------------
 * variables.css fixe un « plancher absolu : 11px / 0.6875rem » — en français,
 * sous ~11 px il ne reste plus de ligne de pixels pour poser un accent. Le
 * relevé du 05/10 en a trouvé 18 sous ce plancher, jusqu'à 8,8 px, surtout dans
 * la refonte Cité et les tables des Plaisirs (audit du 2026-10-05, BUG-119).
 * Celles qui frôlaient le plancher (0.65-0.68rem) y ont été remontées, PARTOUT
 * — refonte V4 comprise, sur décision de Raph : l'écart est imperceptible.
 *
 * Les EXCEPTIONS RESTANTES sont comptées fichier par fichier, et chacune dit
 * pourquoi elle tient encore : un fichier qui en gagne une fait échouer la
 * garde. Les remonter (ou les assumer) est une décision de Raph, pas de la garde.
 *
 * postcss est fourni par Vite (dépendance directe de vite).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const PLANCHER_REM = 0.6875;

// fichier → nombre maximal de déclarations sous le plancher, et pourquoi.
const EXCEPTIONS = {
  // Cotes de la maquette V4 de la refonte « la ville d'abord », relevées côte à
  // côte en 2560×1340 et validées par Raph (en-tête de cite.css) : le bouton
  // ACHETER des rangées (0.58rem). Raph juge sur planche (planches/plancher-11px).
  "cite.css": 1,
  // Même refonte V4 : les états du Conseil (0.6 à 0.64), l'état d'une tuile de
  // mythe (0.6), le libellé du rail et des Options (0.6), l'étiquette de l'Aide
  // (0.62). Même planche, même décision en attente.
  "conseil.css": 3,
  "lieux.css": 1,
  "rail.css": 2,
  "help-book.css": 1,
  // Le chiffre posé SUR le jeton pixel art de la roulette (0.55rem) : il doit
  // tenir dans le sprite — sur la même planche.
  "plaisirs-roulette.css": 1,
  // Fenêtre ≤ 760 px seulement (trois ou quatre plaques sur 375 px de large).
  "plaisirs-tables.css": 2
};

const racine = path.resolve(__dirname, "../..");
const feuilles = fs.readdirSync(racine, { recursive: true })
  .map((f) => String(f).replace(/\\/g, "/"))
  .filter((f) => f.endsWith(".css"));

// Taille en rem d'une déclaration font-size / font, ou null (em, %, calc, var…).
function tailleRem(decl) {
  if (decl.prop === "font-size") {
    const m = decl.value.trim().match(/^(\d*\.?\d+)rem$/);
    return m ? Number(m[1]) : null;
  }
  if (decl.prop === "font") {
    // Raccourci : « [style] [poids] <taille>[/<interligne>] <famille> ».
    const m = decl.value.match(/(?:^|\s)(\d*\.?\d+)rem(?:\/|\s|$)/);
    return m ? Number(m[1]) : null;
  }
  return null;
}

describe("plancher typographique (11 px)", () => {
  const sous = {};
  for (const f of feuilles) {
    const root = postcss.parse(fs.readFileSync(path.join(racine, f), "utf8"), { from: f });
    root.walkDecls((d) => {
      const v = tailleRem(d);
      if (v !== null && v < PLANCHER_REM) {
        const nom = path.basename(f);
        (sous[nom] ||= []).push(`${d.parent?.selector || "?"} → ${d.value}`);
      }
    });
  }

  it("aucun fichier ne dépasse son compte d'exceptions", () => {
    const fautifs = Object.entries(sous)
      .filter(([nom, liste]) => liste.length > (EXCEPTIONS[nom] || 0))
      .map(([nom, liste]) => `${nom} (${liste.length} > ${EXCEPTIONS[nom] || 0}) : ${liste.join(" ; ")}`);
    expect(feuilles.length).toBeGreaterThan(0);
    expect(fautifs).toEqual([]);
  });

  it("les tables et la salle des Plaisirs tiennent le plancher hors exceptions", () => {
    // Les valeurs remontées le 05/10 ne redescendent pas.
    for (const nom of ["plaisirs-scene.css", "views-plaisirs.css", "citizen-sheet.css"]) {
      expect(sous[nom] || [], nom).toEqual([]);
    }
  });

  it("refonte V4 : plus rien entre 0.65 et 0.68rem (remonté à 0.6875, décision de Raph)", () => {
    const frolent = Object.entries(sous).flatMap(([nom, liste]) =>
      liste.filter((l) => /(?:^|\s)0\.6[5-8]\d*rem/.test(l.split(" → ")[1])).map((l) => `${nom} : ${l}`));
    expect(frolent).toEqual([]);
    for (const nom of ["places.css", "echoppe.css"]) expect(sous[nom] || [], nom).toEqual([]);
  });
});
