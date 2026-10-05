/**
 * LES RETOURS ÉPHÉMÈRES RESTENT VISIBLES EN MOUVEMENT RÉDUIT.
 * ---------------------------------------------------------------------------
 * base.css écrase la durée de TOUTES les animations à 0.01ms, pour le réglage
 * du système (prefers-reduced-motion) comme pour le cran « Mouvement : Aucune »
 * des Options (:root[data-motion="none"]). Une animation à remplissage
 * `forwards`/`both` dont la dernière image est opacity:0 saute alors
 * directement à son état final : invisible. Chacune doit donc écrire son
 * exception (animation: none, display: none, ou un délai en `forwards`) dans
 * les DEUX modes. Neuf l'avaient oubliée, dont le bandeau des grands gains et
 * le +coût des Routes, invisible même pour le réglage du système (audit du
 * 2026-10-05, BUG-54 ; même maladie que M22).
 *
 * postcss est fourni par Vite (dépendance directe de vite).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const dossier = path.resolve(__dirname, "..");
const feuilles = fs.readdirSync(dossier).filter((f) => f.endsWith(".css"));
const norm = (s) => s.replace(/\s+/g, " ").trim();
const EXCEPTION = new Set(["animation", "animation-name", "animation-fill-mode", "display"]);

const fondus = new Set();   // keyframes dont la dernière image est invisible
const usages = [];          // { sel, kf, loc } : règles qui les jouent en forwards/both
const reduit = new Set();   // sélecteurs exceptés sous @media (prefers-reduced-motion: reduce)
const aucune = new Set();   // sélecteurs exceptés sous :root[data-motion="none"]

for (const f of feuilles) {
  const root = postcss.parse(fs.readFileSync(path.join(dossier, f), "utf8"), { from: f });
  root.walkAtRules(/keyframes$/, (at) => {
    at.each((r) => {
      if (r.type !== "rule" || !r.selectors.some((s) => /^(to|100%)$/.test(s.trim()))) return;
      r.walkDecls((d) => {
        if ((d.prop === "opacity" && Number(d.value) === 0) || (d.prop === "visibility" && d.value === "hidden")) fondus.add(at.params.trim());
      });
    });
  });
  root.walkRules((r) => {
    if (r.parent?.type === "atrule" && /keyframes$/.test(r.parent.name)) return;
    const sousReduit = r.parent?.type === "atrule" && r.parent.name === "media" && /prefers-reduced-motion:\s*reduce/.test(r.parent.params);
    let excepte = false;
    r.walkDecls((d) => {
      if (EXCEPTION.has(d.prop)) excepte = true;
      if ((d.prop === "animation" || d.prop === "animation-fill-mode") && /\b(forwards|both)\b/.test(d.value) && !sousReduit) {
        for (const sel of r.selectors) usages.push({ sel: norm(sel), valeur: d.value, loc: `${f}:${d.source.start.line}` });
      }
    });
    if (!excepte) return;
    for (const sel of r.selectors.map(norm)) {
      if (sousReduit) reduit.add(sel);
      const m = sel.match(/^:root\[data-motion="none"\] (.+)$/);
      if (m) aucune.add(m[1]);
    }
  });
}

describe("animations qui finissent invisibles — exceptées en mouvement réduit", () => {
  const visees = usages.filter((u) => [...fondus].some((k) => new RegExp(`(^|[\\s,])${k}($|[\\s,])`).test(u.valeur)));

  it("le relevé trouve bien les animations concernées", () => {
    expect(feuilles.length).toBeGreaterThan(10);
    expect(visees.length).toBeGreaterThanOrEqual(13);
  });

  it("chacune a son exception sous prefers-reduced-motion", () => {
    expect(visees.filter((u) => !reduit.has(u.sel)).map((u) => `${u.loc} ${u.sel}`)).toEqual([]);
  });

  it("chacune a son jumeau :root[data-motion=\"none\"] (cran « Aucune » des Options)", () => {
    expect(visees.filter((u) => !aucune.has(u.sel)).map((u) => `${u.loc} ${u.sel}`)).toEqual([]);
  });
});
