/**
 * BANDEAU-DÉPÊCHE : PAS DE POLICE ABSENTE (décision de Raph, audit du 05/10, STRUCT-14).
 * ---------------------------------------------------------------------------
 * Les thèmes « Presse / Ondes » (is-press) et « Flux cybernétique » (is-cyber-feed)
 * demandaient « Roboto Mono » et « Orbitron », qui ne sont pas embarquées : le .exe
 * hors ligne et presque tous les joueurs voyaient la chasse fixe du système
 * (Consolas sous Windows). Choix C : écrire ce qui s'affiche, `monospace`. Aucun
 * changement visible — les tailles du bandeau sont en rem, le « monospace » seul ne
 * rétrécit pas (mesuré dans Chrome : mêmes largeurs, mêmes hauteurs).
 *
 * postcss est fourni par Vite (dépendance directe de vite).
 */
import { it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const styles = path.resolve(__dirname, "..");

it("les thèmes Presse et Cyber écrivent `monospace`, sans police non embarquée", () => {
  const vus = [];
  postcss.parse(fs.readFileSync(path.join(styles, "components.css"), "utf8")).walkDecls("font-family", (d) => {
    const sel = d.parent.selector || "";
    if (/\.is-press|\.is-cyber-feed/.test(sel)) vus.push(d.value.trim());
  });
  expect(vus.length).toBeGreaterThanOrEqual(3);          // presse (titre + ligne), cyber titre, cyber ligne
  for (const v of vus) expect(v).toBe("monospace");
});

it("aucune feuille ne réclame Roboto Mono ni Orbitron", () => {
  for (const f of fs.readdirSync(styles).filter((n) => n.endsWith(".css"))) {
    postcss.parse(fs.readFileSync(path.join(styles, f), "utf8")).walkDecls(/^font(-family)?$/, (d) => {
      expect(d.value, `${f} : ${d.parent.selector}`).not.toMatch(/Roboto Mono|Orbitron/i);
    });
  }
});
