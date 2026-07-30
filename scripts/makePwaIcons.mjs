// Génère les icônes d'installation (PWA) depuis le logo du jeu.
//
//   node scripts/makePwaIcons.mjs
//
// ⚠ AGRANDISSEMENT AU PLUS PROCHE VOISIN, ET FACTEUR ENTIER. Le logo est du
// pixel art (171×169) : un rééchantillonnage lisse le rendrait flou, et un
// facteur fractionnaire donnerait des pixels de largeurs inégales — le défaut
// le plus visible qui soit sur ce genre d'image. On agrandit donc ×1 pour la
// 192 et ×2 pour la 512, puis on CENTRE sur un carré au fond de l'application.
// Le reste de la marge est voulu : les lanceurs Android et iOS rognent les coins
// (icônes « maskable »), un logo collé aux bords y perdrait ses lettres.
import { PNG } from "pngjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(racine, "src/assets/LOGO.png");
const SORTIE = join(racine, "public/icons");

// --surface-app (variables.css) : l'icône se fond avec l'écran de démarrage.
const FOND = [0x0e, 0x13, 0x20, 0xff];

function fabriquer(taille, facteur) {
  const src = PNG.sync.read(readFileSync(SOURCE));
  const out = new PNG({ width: taille, height: taille });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = FOND[0]; out.data[i + 1] = FOND[1];
    out.data[i + 2] = FOND[2]; out.data[i + 3] = FOND[3];
  }
  const lw = src.width * facteur;
  const lh = src.height * facteur;
  if (lw > taille || lh > taille) {
    throw new Error(`facteur ${facteur} trop grand pour ${taille}px (${lw}×${lh})`);
  }
  const ox = Math.floor((taille - lw) / 2);
  const oy = Math.floor((taille - lh) / 2);
  for (let y = 0; y < lh; y += 1) {
    const sy = Math.floor(y / facteur);
    for (let x = 0; x < lw; x += 1) {
      const sx = Math.floor(x / facteur);
      const si = (sy * src.width + sx) * 4;
      const di = ((oy + y) * taille + ox + x) * 4;
      const a = src.data[si + 3] / 255;
      // Composition sur le fond : le logo a des bords transparents, et une icône
      // d'application ne peut pas être translucide.
      out.data[di] = Math.round(src.data[si] * a + FOND[0] * (1 - a));
      out.data[di + 1] = Math.round(src.data[si + 1] * a + FOND[1] * (1 - a));
      out.data[di + 2] = Math.round(src.data[si + 2] * a + FOND[2] * (1 - a));
      out.data[di + 3] = 0xff;
    }
  }
  return PNG.sync.write(out);
}

mkdirSync(SORTIE, { recursive: true });
for (const [taille, facteur] of [[192, 1], [512, 2]]) {
  const fichier = join(SORTIE, `icon-${taille}.png`);
  writeFileSync(fichier, fabriquer(taille, facteur));
  console.log(`écrit ${fichier} (logo ×${facteur}, centré)`);
}
