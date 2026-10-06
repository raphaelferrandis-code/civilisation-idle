/**
 * exportWizardChrome.mjs — chrome « cuir » du pack Complete UI Book Styles
 * (02_WizardBook, licence Crusenho : usage commercial libre, crédit obligatoire).
 *
 * Copie les sprites retenus vers public/pixelart/ui/chrome/wizard/ et génère
 * les variantes d'état par REMAP EXACT de la rampe (le pack n'a que 2 à 6 tons
 * par objet, une correspondance couleur à couleur suffit et reste sans perte).
 *
 * Pourquoi un remap et pas un filtre CSS : `filter: sepia/hue-rotate` déplace
 * TOUTES les teintes d'un bloc, y compris le contour sombre qui fait la
 * profondeur — le bouton perdrait exactement ce qu'on est venu chercher.
 *
 * Usage : node scripts/exportWizardChrome.mjs <dossier Sprites du pack>
 *   ex. …/Complete_UI_Book_Styles_Pack_Full_v1.0/02_WizardBook/Sprites
 * Le chemin est OBLIGATOIRE : le pack n'est pas dans le dépôt (licence), et l'ancien
 * défaut pointait le scratchpad d'une session Claude d'un autre poste.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2];
if (!SRC) {
  console.error('Usage : node scripts/exportWizardChrome.mjs <dossier Sprites du pack>\n' +
    '  le dossier 02_WizardBook/Sprites du pack Complete UI Book Styles (Crusenho),\n' +
    '  qui contient les UI_WizardBook_*.png.');
  process.exit(1);
}
const OUT = join(ROOT, 'public', 'pixelart', 'ui', 'chrome', 'wizard');

/* ---------- PNG (pngjs, comme les autres scripts) : RGBA { w, h, rgba } ----
   Un lecteur/écrivain écrit à la main vivait ici (audit 2026-10-05, SCRIPT-11) ;
   pngjs rend les mêmes pixels et gère en plus l'entrelacé et les profondeurs ≠ 8. */
function readPng(buf) {
  const p = PNG.sync.read(buf);
  return { w: p.width, h: p.height, rgba: p.data };
}

function writePng(w, h, rgba) {
  const p = new PNG({ width: w, height: h });
  rgba.copy(p.data);
  return PNG.sync.write(p);
}

const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();

function remap(img, map) {
  const out = Buffer.from(img.rgba);
  for (let i = 0, n = img.w * img.h; i < n; i++) {
    if (out[i * 4 + 3] < 128) continue;
    const k = hex(out[i * 4], out[i * 4 + 1], out[i * 4 + 2]);
    const to = map[k];
    if (!to) continue;
    out[i * 4] = parseInt(to.slice(1, 3), 16);
    out[i * 4 + 1] = parseInt(to.slice(3, 5), 16);
    out[i * 4 + 2] = parseInt(to.slice(5, 7), 16);
  }
  return { w: img.w, h: img.h, rgba: out };
}

/* ---------- Rampes -------------------------------------------------------
   Le remap conserve la STRUCTURE de contraste du pack (contour très sombre,
   champ, rehaut) et n'en change que la teinte. C'est ce contour opaque qui
   donne la profondeur ; un filtre CSS l'aurait éclairci avec le reste.        */
/* Or de marque, décliné en 7 crans autour de --brand-gold #C9A968 (indice 3).
   Les deux premiers tons sont volontairement TRÈS sombres : ce sont eux qui
   remplacent le contour #32211B du cuir, donc eux qui portent la profondeur. */
const OR = ['#241A08', '#3A2C10', '#6B5423', '#C9A968', '#E4C77E', '#F3E8CC', '#FFF6E2'];
const OR_ANCRE = 3;

function rampMap(img, to, ancre) {
  /* ANCRAGE SUR LE TON DOMINANT, décalage d'un cran par rang.
     Deux approches ont échoué avant celle-ci, elles sont notées pour ne pas
     être rejouées :
       · par RANG étalé sur toute la rampe → un sprite n'a que 2 à 6 tons, le
         champ (mi-clair) était poussé vers l'avant-dernier cran : bouton blanc.
       · par LUMINANCE normalisée entre le ton le plus sombre et le plus clair
         PRÉSENTS → sur `button` le ton le plus clair EST le champ (ce sprite
         n'a pas de rehaut plus clair que lui), donc il repartait à 1,0 : encore
         blanc.
     Ici le ton le plus RÉPANDU en pixels est le champ par construction ; on le
     colle sur `ancre` (l'or de marque) et chaque ton voisin descend ou monte
     d'exactement un cran. Le contour reste le plus sombre, le rehaut le plus
     clair, et la structure de contraste du pack est conservée telle quelle. */
  const seen = new Map(), count = new Map();
  for (let i = 0, n = img.w * img.h; i < n; i++) {
    if (img.rgba[i * 4 + 3] < 128) continue;
    const k = hex(img.rgba[i * 4], img.rgba[i * 4 + 1], img.rgba[i * 4 + 2]);
    if (!seen.has(k)) seen.set(k, 0.2126 * img.rgba[i * 4] + 0.7152 * img.rgba[i * 4 + 1] + 0.0722 * img.rgba[i * 4 + 2]);
    count.set(k, 1 + (count.get(k) || 0));
  }
  const parLum = [...seen.entries()].sort((a, b) => a[1] - b[1]).map(e => e[0]);
  let dom = parLum[0], best = -1;
  for (const [k, c] of count) if (c > best) { best = c; dom = k; }
  const rangDom = parLum.indexOf(dom);
  const map = {};
  parLum.forEach((k, i) => {
    map[k] = to[Math.max(0, Math.min(to.length - 1, ancre + (i - rangDom)))];
  });
  return map;
}

// Seuls les sprites que lit le CSS (chrome-wizard.css, conseil, lieux, échoppe…) :
// card-on, gauge-fill et les variantes or de button-sm, segment et card ont été
// retirés de public/ comme orphelins (audit 2026-10-05, ASSET-3) — les réécrire
// les remettrait dans le build.
const PICKS = [
  ['Button08a', 'button'],   // plaque d'action : cuir embossé + socle, coins coupés
  ['Button01a', 'button-sm'],// utilitaire
  ['Frame04a',  'segment'],  // segment / onglet
  ['Slot01a',   'card'],     // carte, rangée d'achat
  ['Bar01a',    'gauge'],    // piste de jauge
];
const GOLD = new Set(['button']);   // déclinaison or (button-gold.png)

if (!existsSync(SRC)) { console.error('Pack introuvable :', SRC); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const manifest = [];
for (const [src, name] of PICKS) {
  const img = readPng(readFileSync(join(SRC, `UI_WizardBook_${src}.png`)));
  writeFileSync(join(OUT, `${name}.png`), writePng(img.w, img.h, img.rgba));
  manifest.push(`${name}.png        ${img.w}x${img.h}   <- ${src}`);
  if (GOLD.has(name)) {
    const gold = remap(img, rampMap(img, OR, OR_ANCRE));
    writeFileSync(join(OUT, `${name}-gold.png`), writePng(gold.w, gold.h, gold.rgba));
    manifest.push(`${name}-gold.png   ${img.w}x${img.h}   (remap or)`);
  }
}
console.log(manifest.join('\n'));
console.log('\n->', OUT);
