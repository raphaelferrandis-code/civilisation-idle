// Lecture du SOURCE pour les gardes « ceci n'existe plus nulle part » (audit 2026-10-05,
// TEST-9 : trois copies de jsFiles). À réserver à ce qu'aucun test de résultat ne peut
// voir — un symbole retiré qui ne doit pas revenir, une règle écrite à un seul endroit.
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// src/game/map, le dossier que balaient ces gardes.
export const MAP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "game", "map");

// Tous les .js sous `dir`, récursivement, hors des dossiers __tests__.
export function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "__tests__") out.push(...jsFiles(full)); }
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

// Les lignes de CODE d'un source : une ligne de commentaire qui raconte un départ
// (« X est parti le… ») est légitime, on ne traque que le code.
export const codeLines = (src) => src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
