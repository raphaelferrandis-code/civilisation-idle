/**
 * PLANCHER TYPOGRAPHIQUE : AUCUNE NOUVELLE TAILLE SOUS 11 PX.
 * ---------------------------------------------------------------------------
 * variables.css fixe un « plancher absolu : 11px / 0.6875rem » — en français,
 * sous ~11 px il ne reste plus de ligne de pixels pour poser un accent. Le
 * relevé du 05/10 en a trouvé 18 sous ce plancher, jusqu'à 8,8 px, surtout dans
 * la refonte Cité et les tables des Plaisirs (audit du 2026-10-05, BUG-119).
 * Celles qui frôlaient le plancher (0.65-0.68rem) y ont été remontées, PARTOUT
 * — refonte V4 comprise, sur décision de Raph : l'écart est imperceptible. Puis,
 * sur la planche planches/plancher-11px, le reste de la refonte V4 aussi (ACHETER
 * des rangées de la Cité, libellés du rail et des Options, états du Conseil, état
 * des tuiles de Mythes, étiquette de l'Aide) : décision de Raph, vérifiée sans
 * débordement en 1280×800, 1584×861 et 2560×1340.
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
  // EXCEPTION ASSUMÉE (décision de Raph sur la planche planches/plancher-11px) : le
  // chiffre posé SUR le jeton pixel art de la roulette (0.55rem). Il doit tenir dans
  // le sprite : à 11 px, il en déborde.
  "plaisirs-roulette.css": 1,
  // Fenêtre ≤ 760 px seulement (trois ou quatre plaques sur 375 px de large).
  "plaisirs-tables.css": 2
};
// La refonte V4 « la ville d'abord » : ses dernières cotes sous le plancher (ACHETER
// 0.58rem, rail et Options 0.6, Conseil 0.6 à 0.64, tuiles de Mythes 0.6, Aide 0.62)
// sont remontées à 11 px — décision de Raph. Elles ne redescendent pas.
const V4_AU_PLANCHER = ["cite.css", "conseil.css", "lieux.css", "rail.css", "help-book.css", "places.css", "echoppe.css"];

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
  });

  it("refonte V4 : plus aucune cote sous 11 px (ACHETER, rail, Options, Conseil, Mythes, Aide)", () => {
    for (const nom of V4_AU_PLANCHER) expect(sous[nom] || [], nom).toEqual([]);
  });

  it("le jeton de roulette reste la seule exception hors petits écrans", () => {
    expect(sous["plaisirs-roulette.css"] || []).toEqual([".rl-jeton small → 0.55rem"]);
  });
});
