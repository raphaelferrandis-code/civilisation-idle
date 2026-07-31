/**
 * LE SUFFIXE D'ÉCHELLE EST UN CONTRAT ENTRE DEUX FICHIERS.
 * ---------------------------------------------------------------------------
 * `OdometerNumber` calcule la largeur du cadran (publiée en `--odo-w`) à partir
 * de la taille du suffixe ; le CSS, lui, la PEINT. Quand les deux divergent, la
 * valeur est calée trop grande pour sa cellule, elle déborde, et comme elle est
 * centrée en tactile le débordement se rogne des deux côtés : le suffixe, qui
 * est le dernier glyphe, disparaît. C'est le défaut du 2026-07-31 — le tactile
 * peignait 0.85em contre 0.72 budgété, et Raph ne voyait plus ses unités.
 *
 * Cette garde relit les DEUX feuilles et compare aux constantes du composant.
 * Elle ne recopie pas le nombre : elle importe celui qui sert au calcul.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SUF_EM_FINE, SUF_EM_COARSE } from "../OdometerNumber.jsx";

const racine = path.resolve(__dirname, "../../../..");
const lire = (rel) => fs.readFileSync(path.join(racine, rel), "utf8");

/**
 * Taille de police déclarée dans le bloc d'un sélecteur, en em.
 * Retourne null si le sélecteur est absent OU s'il ne déclare pas de taille :
 * les deux cas doivent faire ÉCHOUER la garde, pas la rendre muette.
 */
function fontSizeEm(css, selecteur) {
  const i = css.indexOf(selecteur);
  if (i < 0) return null;
  const debut = css.indexOf("{", i);
  const fin = css.indexOf("}", debut);
  if (debut < 0 || fin < 0) return null;
  const bloc = css.slice(debut + 1, fin);
  const m = bloc.match(/font-size:\s*([\d.]+)em\s*;/);
  return m ? Number(m[1]) : null;
}

describe("suffixe d'échelle : la peinture suit le modèle de largeur", () => {
  it("le régime curseur peint le suffixe à SUF_EM_FINE", () => {
    const em = fontSizeEm(lire("src/styles/components.css"), ".odo-suffix {");
    expect(em).not.toBeNull();
    expect(em).toBe(SUF_EM_FINE);
  });

  it("le régime tactile peint le suffixe à SUF_EM_COARSE", () => {
    const em = fontSizeEm(
      lire("src/styles/touch-shell.css"),
      ':root[data-pointer="coarse"] .topbar .odo-suffix {'
    );
    expect(em).not.toBeNull();
    expect(em).toBe(SUF_EM_COARSE);
  });

  // ── CONTRÔLES NÉGATIFS : une garde qui ne peut pas échouer ne garde rien ──
  it("le lecteur rend null sur un sélecteur absent ou sans taille", () => {
    expect(fontSizeEm(".autre { font-size: 1em; }", ".odo-suffix {")).toBeNull();
    expect(fontSizeEm(".odo-suffix { color: red; }", ".odo-suffix {")).toBeNull();
  });

  it("le lecteur voit bien un écart : 0.85em ne passe pas pour 1em", () => {
    const faux = ':root[data-pointer="coarse"] .topbar .odo-suffix {\n  font-size: 0.85em;\n}';
    const em = fontSizeEm(faux, ':root[data-pointer="coarse"] .topbar .odo-suffix {');
    expect(em).toBe(0.85);
    expect(em).not.toBe(SUF_EM_COARSE);
  });
});
