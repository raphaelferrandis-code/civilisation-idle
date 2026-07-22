// RAPATRIEMENT DES POLICES (E9). Le jeu chargeait sa typographie depuis Google
// Fonts et Font Awesome depuis cdnjs : dans le .exe lancé sans réseau, tout
// retombait sur Georgia / system-ui et les glyphes devenaient des carrés vides.
//
// Ce script télécharge les woff2 et écrit les @font-face qui les servent en
// local. Il est à relancer UNIQUEMENT si l'on change de famille ou de graisse —
// les fichiers produits sont committés, le jeu ne dépend plus du réseau.
//
// TROIS familles et pas six : Cinzel, Crimson Text et Baloo 2 ne sont JAMAIS en
// première position dans les tokens de variables.css, et la mesure au canvas
// (largeur du glyphe contre le repli seul) confirme qu'elles n'apportent aucun
// caractère que Pixelify Sans, Silkscreen ou Inter ne rendent déjà. Les six
// symboles qu'aucune ne couvre (✦ ⚠ ✓ ▼ → ∞) viennent d'une police système,
// aujourd'hui comme demain.
//
// Usage : node scripts/vendorFonts.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src", "assets", "fonts");

// Sans un UA moderne, Google sert du TTF au lieu du woff2 (il détecte le client).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Les sous-ensembles à garder. Le jeu est en français et en anglais : `latin`
// couvre les accents des deux, `latin-ext` ajoute œ/Œ et les langues voisines.
// Les autres (cyrillique, grec, vietnamien) seraient du poids mort.
const SUBSETS = ["latin", "latin-ext"];

const FAMILIES = [
  { css: "Pixelify+Sans:wght@400..700", nom: "Pixelify Sans", slug: "pixelify-sans" },
  { css: "Silkscreen:wght@400;700", nom: "Silkscreen", slug: "silkscreen" },
  { css: "Inter:wght@400..800", nom: "Inter", slug: "inter" }
];

// Google écrit un commentaire /* latin */ juste avant chaque bloc @font-face.
function parseFaces(css) {
  const faces = [];
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const [, subset, body] = m;
    const champ = (nom) => (body.match(new RegExp(nom + ":\\s*([^;]+);")) || [])[1]?.trim();
    const url = (body.match(/url\(([^)]+)\)\s*format\('woff2'\)/) || [])[1];
    if (!url) continue;
    faces.push({
      subset,
      url,
      weight: champ("font-weight") || "400",
      style: champ("font-style") || "normal",
      range: champ("unicode-range")
    });
  }
  return faces;
}

const entete = `/* POLICES AUTONOMES (E9) — fichier GÉNÉRÉ par scripts/vendorFonts.mjs.
   Ne pas éditer à la main : relancer le script.

   Les woff2 vivent dans src/assets/fonts/ et sont committés. Vite les empaquette
   avec un nom haché ; en Electron ils sont servis par le protocole app:// comme
   le reste de dist/. Plus aucune requête réseau au lancement.

   font-display: swap est CONSERVÉ (c'était déjà le réglage du lien Google) : la
   fenêtre de bascule existait donc déjà, et elle se referme désormais bien plus
   vite puisque le fichier est local. */\n`;

const blocs = [entete];
mkdirSync(OUT_DIR, { recursive: true });

for (const fam of FAMILIES) {
  const url = `https://fonts.googleapis.com/css2?family=${fam.css}&display=swap`;
  const css = await (await fetch(url, { headers: { "User-Agent": UA } })).text();
  const faces = parseFaces(css).filter((f) => SUBSETS.includes(f.subset));
  if (!faces.length) throw new Error(`aucun woff2 pour ${fam.nom} — le format de Google a changé ?`);

  blocs.push(`\n/* ── ${fam.nom} ─────────────────────────────────────────────── */`);
  for (const f of faces) {
    // Un poids variable s'écrit « 400 700 » : on le garde tel quel dans le nom.
    const nomFichier = `${fam.slug}-${f.weight.replace(/\s+/g, "-")}-${f.subset}.woff2`;
    const bin = Buffer.from(await (await fetch(f.url)).arrayBuffer());
    writeFileSync(join(OUT_DIR, nomFichier), bin);
    console.log(`${nomFichier.padEnd(38)} ${String(Math.round(bin.length / 1024)).padStart(4)} Ko`);
    blocs.push(
      `@font-face {\n` +
      `  font-family: "${fam.nom}";\n` +
      `  font-style: ${f.style};\n` +
      `  font-weight: ${f.weight};\n` +
      `  font-display: swap;\n` +
      `  src: url("./fonts/${nomFichier}") format("woff2");\n` +
      (f.range ? `  unicode-range: ${f.range};\n` : "") +
      `}`
    );
  }
}

writeFileSync(join(ROOT, "src", "assets", "fonts.css"), blocs.join("\n") + "\n", "utf8");
console.log("\nsrc/assets/fonts.css écrit.");
