// Mausolée rang I (dynasty1-t1) : rend l'entrée « logique » — plus de feu dans
// la porte. (1) Cavité de la porte : la lueur chaude (firelit) est refroidie en
// tombeau sombre et la flamme cuite effacée ; l'overlay "door" est retiré du
// JSON. (2) Torche de droite : la flamme CUITE est effacée (comme
// erase-baked-pop1m pour la torche du t4) pour que l'overlay animé — désormais
// nettement plus petit (sc par flamme) — soit la seule flamme, sans vision
// double. Le brasero métallique et le cadre de pierre sont préservés.
// Réversible via git. Usage: node scripts/wonders/fix-t1-doorflame.cjs
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join(__dirname, "..", "..", "node_modules", "pngjs"));
const ROOT = path.join(__dirname, "..", "..", "public", "pixelart", "wonders");
const p = path.join(ROOT, "dynasty1-t1.png");
const png = PNG.sync.read(fs.readFileSync(p));
const W = png.width;
const at = (x, y) => (y * W + x) * 4;
const set = (x, y, r, g, b) => { const i = at(x, y); png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255; };

// ── (1) Porte : cavité éclairée par le feu → tombeau sombre & froid ───────────
// Silhouette de l'ouverture, ligne par ligne (relevé au hexdump, suit l'arche).
// Dans chaque plage on refroidit tout ce qui n'est pas déjà quasi-noir (on garde
// le liseré noir `000` du cadre). Dégradé vertical : sombre en haut (fond de
// l'arche, dans l'ombre), un peu moins sombre en bas (seuil, proche du jour).
const DOOR_ROWS = {
  50: [53, 58], 51: [51, 61], 52: [50, 61], 53: [50, 61],
  54: [49, 62], 55: [49, 62], 56: [49, 62], 57: [49, 62], 58: [49, 62], 59: [49, 62],
  60: [49, 62], 61: [49, 62], 62: [49, 62], 63: [49, 62], 64: [49, 62], 65: [49, 62],
  66: [49, 62], 67: [49, 62], 68: [49, 62], 69: [49, 62], 70: [49, 62], 71: [49, 62], 72: [49, 62],
  73: [49, 62], 74: [49, 62], 75: [49, 61], 76: [49, 61], 77: [50, 60], 78: [53, 59],
};
const Y_TOP = 50, Y_BOT = 78;
const TOMB_TOP = [18, 20, 26];   // fond de l'arche : bleu-gris très sombre
const TOMB_BOT = [34, 37, 45];   // seuil : à peine plus clair
let nDoor = 0;
for (const [yy, [xlo, xhi]] of Object.entries(DOOR_ROWS)) {
  const y = +yy;
  const t = (y - Y_TOP) / (Y_BOT - Y_TOP);
  const r = Math.round(TOMB_TOP[0] + (TOMB_BOT[0] - TOMB_TOP[0]) * t);
  const g = Math.round(TOMB_TOP[1] + (TOMB_BOT[1] - TOMB_TOP[1]) * t);
  const b = Math.round(TOMB_TOP[2] + (TOMB_BOT[2] - TOMB_TOP[2]) * t);
  for (let x = xlo; x <= xhi; x++) {
    const i = at(x, y);
    if (png.data[i + 3] === 0) continue;
    const mx = Math.max(png.data[i], png.data[i + 1], png.data[i + 2]);
    if (mx < 40) continue; // liseré noir du cadre : on le garde
    set(x, y, r, g, b);
    nDoor++;
  }
}

// ── (2) Torche : efface la flamme CUITE, préserve brasero & niche ─────────────
// La niche derrière la flamme est `112` (bleu-gris sombre) ; on rebouche avec.
const niche = (() => { const i = at(71, 62); return [png.data[i], png.data[i + 1], png.data[i + 2]]; })();
let nTorch = 0;
for (let y = 64; y <= 78; y++) {
  for (let x = 67; x <= 77; x++) {
    const i = at(x, y);
    if (png.data[i + 3] === 0) continue;
    const R = png.data[i], B = png.data[i + 2];
    if (R > 150 && R - B > 55) { // pixel de flamme (jaune/orange vif)
      set(x, y, niche[0], niche[1], niche[2]);
      nTorch++;
    }
  }
}

fs.writeFileSync(p, PNG.sync.write(png));
console.log(`dynasty1-t1.png : porte ${nDoor} px refroidis, torche ${nTorch} px effaces (niche ${niche.join(",")})`);
