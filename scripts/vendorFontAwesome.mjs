// FONT AWESOME : LE SOUS-ENSEMBLE QUE LE JEU DESSINE (audit 2026-10-05, ASSET-10).
//
// index.css importait fontawesome.min.css et solid.min.css en entier : 54 Ko de CSS
// (≈ 2 000 classes .fa-*, 7 @keyframes) parsés à chaque lancement pour une trentaine
// d'icônes, et une police TTF de 426 Ko que Chromium ne télécharge jamais (2e `src` de
// la @font-face, derrière le woff2) mais que Vite copiait dans dist/ et que l'.exe
// embarquait.
//
// Ce script relève les icônes `fa-<nom>` citées par le code (src/, hors tests), prend
// leur glyphe dans le CSS du paquet et écrit src/assets/fontawesome.css : les règles
// de base du style « solid », une règle par icône, et une @font-face en woff2 SEUL.
// La police reste celle du paquet (servie depuis node_modules, empaquetée par Vite) :
// aucune dépendance nouvelle.
//
// À RELANCER après avoir posé une icône Font Awesome nouvelle dans le code —
// src/__tests__/fontAwesomeSubset.test.js tombe tant que ce n'est pas fait.
//
// Usage : node scripts/vendorFontAwesome.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = join(ROOT, "node_modules", "@fortawesome", "fontawesome-free");
const OUT = join(ROOT, "src", "assets", "fontawesome.css");

// Le glyphe de chaque nom d'icône (alias compris), lu dans le CSS non minifié du
// paquet : `.fa-xmark {\n  --fa: "\f00d"; }`.
export function glyphTable(css) {
  const table = new Map();
  const re = /\.fa-([a-z0-9-]+)\s*\{\s*--fa:\s*"([^"]+)";\s*\}/g;
  let m;
  while ((m = re.exec(css))) table.set(m[1], m[2]);
  return table;
}

// Les noms `fa-…` cités par le code : classes posées en dur, tables (RES_ICONS),
// replis (`"fa-circle"`). On garde ceux qui sont des ICÔNES du paquet (pas fa-solid,
// ni un mot qui ressemble). ⚠ Un nom cité dans une table que plus rien ne lit compte
// quand même : la règle en trop ne coûte qu'une ligne, une règle manquante dessine
// une icône VIDE.
export function iconsUsed(srcDir, table) {
  const used = new Set();
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "__tests__") walk(p); continue; }
      if (!/\.(js|jsx)$/.test(e.name)) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/\bfa-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) {
        if (table.has(m[1])) used.add(m[1]);
      }
    }
  };
  walk(srcDir);
  return [...used].sort();
}

function main() {
  const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8"));
  const table = glyphTable(readFileSync(join(PKG, "css", "fontawesome.css"), "utf8"));
  const icons = iconsUsed(join(ROOT, "src"), table);
  const rules = icons.map((n) => `.fa-${n} { --fa: "${table.get(n)}"; }`).join("\n");
  writeFileSync(OUT, `/*!
 * Font Awesome Free ${pkg.version} by @fontawesome - https://fontawesome.com
 * License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License)
 * Copyright 2024 Fonticons, Inc.
 */
/* FONT AWESOME — SOUS-ENSEMBLE (audit 2026-10-05, ASSET-10). Fichier GÉNÉRÉ par
   scripts/vendorFontAwesome.mjs : ne pas éditer à la main, relancer le script.

   Ce que le jeu met en œuvre de fontawesome.css et solid.css, à la même place
   dans la cascade et à la même spécificité (le rendu ne bouge pas) : la classe
   fa-solid — la seule posée —, ${icons.length} icônes, et la @font-face en woff2 SEUL
   (le TTF de repli n'est plus copié dans dist/). Les variables --fa-display,
   --fa-style… ne sont définies nulle part : leur valeur de repli est écrite
   telle quelle. */

@font-face {
  font-family: 'Font Awesome 6 Free';
  font-style: normal;
  font-weight: 900;
  font-display: block;
  src: url("@fortawesome/fontawesome-free/webfonts/fa-solid-900.woff2") format("woff2");
}

.fa-solid {
  -moz-osx-font-smoothing: grayscale;
  -webkit-font-smoothing: antialiased;
  display: inline-block;
  font-style: normal;
  font-variant: normal;
  line-height: 1;
  text-rendering: auto;
  font-family: 'Font Awesome 6 Free';
  font-weight: 900;
}

.fa-solid::before {
  content: var(--fa);
}

${rules}

/* Utilitaire d'accessibilité du paquet, GARDÉ : la classe .sr-only du jeu
   (components.css) ne pose ni marge, ni remplissage, ni bordure — elle comptait
   sur celle-ci. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
`);
  console.log(`${icons.length} icônes → ${OUT}`);
  console.log(icons.join(" "));
}
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/vendorFontAwesome.mjs")) main();
