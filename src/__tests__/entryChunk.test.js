// LE MOTEUR DE CARTE HORS DU CHUNK D'ENTRÉE (audit 2026-10-05, PERF-67).
// ContemplationBar, montée par App, importait cityMapRuntime.js : toute la carte
// (peintre, sprites, scènes : ~1,1 Mo minifié) arrivait dans le chunk d'entrée et
// se parsait avant le premier rendu, même quand la partie s'ouvrait sur une autre
// vue — le lazy() de CityView était illusoire. Ce test suit les imports STATIQUES
// depuis main.jsx (ceux que le bundler met dans le chunk d'entrée) :
//  - cityMapRuntime.js ne doit plus y être (ni le peintre iso) ;
//  - layout.js, LUI, doit y rester : il branche à l'import le relevé des vestiges
//    auprès du cœur (cityMapBridge), dont chaque chute a besoin, Cité montée ou non.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..");
// import … from '…', export … from '…', import '…' — jamais import('…').
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function resolveSpec(from, spec) {
  if (!spec.startsWith(".")) return null;
  const p = path.resolve(path.dirname(from), spec);
  for (const c of [p, `${p}.js`, `${p}.jsx`]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

function staticGraph(entry) {
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (!/\.(jsx?|mjs)$/.test(file)) continue;
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of text.matchAll(STATIC_IMPORT)) {
      const dep = resolveSpec(file, m[1]);
      if (dep && !seen.has(dep)) { seen.add(dep); queue.push(dep); }
    }
  }
  return [...seen].map((f) => path.relative(SRC, f).replace(/\\/g, "/"));
}

describe("chunk d'entrée : la carte suit la vue Cité", () => {
  const graph = staticGraph(path.join(SRC, "main.jsx"));

  it("ni le runtime de la carte ni son peintre ne sont importés statiquement depuis main.jsx", () => {
    expect(graph).toContain("App.jsx");
    expect(graph).not.toContain("game/map/cityMapRuntime.js");
    expect(graph).not.toContain("game/map/iso/isoRenderer.js");
    expect(graph).not.toContain("game/map/cityEngineSprites.js");
  });

  it("le plan (layout.js) reste chargé au démarrage : le relevé des vestiges est branché dès la première chute", () => {
    expect(graph).toContain("game/map/layout.js");
    expect(readFileSync(path.join(SRC, "game/map/layout.js"), "utf8")).toMatch(/^setCaptureVestigeHandler\(captureVestige\);$/m);
  });
});
