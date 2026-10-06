// LES RENVOIS DU CODE VERS LA DOC (audit du 2026-10-05, GIT-6 / GIT-7).
// Le code cite ses plans par leur chemin (« cf. docs/PLAN-SOL-PYRAMIDE.md ») : c'est
// là que vivent les décisions et les pièges. Le 2026-10-06, la racine et docs/ ont été
// rangées (passations et audits périmés dans docs/archive/, rapports des bancs dans
// docs/bench/), en corrigeant les renvois. Cette garde empêche qu'un rangement futur
// casse un renvoi en silence : chaque `docs/….md` cité doit exister, et chaque nom
// de plan cité seul (`PLAN-….md`, `RETRI-….md`) doit se trouver à la racine, dans
// docs/ ou dans docs/archive/.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SKIP = new Set(["node_modules", "dist", ".git", ".claude", "maquettes", ".preview-shots", "release", "_archive"]);
// Noms cités qui ne sont pas des plans du dépôt : la licence des dépendances, écrite
// au build dans dist/licenses/ ; les LISEZMOI, un par dossier d'assets.
const HORS_DOCS = new Set(["THIRD-PARTY-LICENSES.md", "LISEZMOI.md"]);

function sources() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(m?js|cjs|jsx|css|md)$/.test(e.name)) out.push(p);
    }
  };
  walk(path.join(ROOT, "src"));
  walk(path.join(ROOT, "scripts"));
  for (const f of fs.readdirSync(ROOT)) if (/\.(m?js|cjs|md)$/.test(f)) out.push(path.join(ROOT, f));
  for (const f of ["README.md", "APRES-LA-SORTIE.md"]) out.push(path.join(ROOT, "docs", f));
  return out;
}

const trouve = (nom) => [ROOT, path.join(ROOT, "docs"), path.join(ROOT, "docs", "archive")]
  .some((d) => fs.existsSync(path.join(d, nom)));

describe("renvois du code vers la doc", () => {
  it("chaque plan cité existe (racine, docs/, docs/archive/)", () => {
    const casses = [];
    for (const f of sources()) {
      const s = fs.readFileSync(f, "utf8");
      const ici = path.relative(ROOT, f);
      for (const m of s.matchAll(/docs\/[A-Za-z0-9_./-]+\.md/g)) {
        if (!fs.existsSync(path.join(ROOT, m[0]))) casses.push(`${ici} → ${m[0]}`);
      }
      // Un nom de plan cité seul : majuscule en tête, au moins un tiret (PLAN-…,
      // CE-spec-…, RETRI-…), pas précédé d'un chemin — `BRASS.md` est une propriété.
      for (const m of s.matchAll(/(?<![\w/.-])([A-Z][A-Z0-9]*(?:-[A-Za-z0-9]+)+\.md)\b/g)) {
        if (!HORS_DOCS.has(m[1]) && !trouve(m[1])) casses.push(`${ici} → ${m[1]}`);
      }
    }
    expect(casses).toEqual([]);
  });
});
