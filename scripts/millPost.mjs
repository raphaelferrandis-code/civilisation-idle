// millPost.mjs — post-traitement des sprites du moulin à vent (refonte éolienne 2026-07-28).
//   node scripts/millPost.mjs crop <in.png> <out.png>   — recadre sur la bbox opaque (alpha>40) :
//       blitProp REMPLIT sa boîte, un PNG à marges transparentes rend une tour rétrécie qui
//       flotte ; après recadrage le pied du PNG EST le pied de la tour et l'aspect naturel
//       lu par la scène (cityEngineSprites, branche water_mills) est celui de l'encre.
//   node scripts/millPost.mjs sym  <in.png> <out.png>   — hélice : recentre + SYMÉTRIE 4 AXES
//       parfaite. blitPropRot pivote au centroïde opaque : toute asymétrie fait une ORBITE
//       visible (leçon roue de char v1, wobble rejeté). On reconstruit l'image depuis son
//       secteur de 90° le mieux encré (axe dominant des pales par histogramme angulaire),
//       recopié par rotations EXACTES de 90° — grille paire : (x,y) -> (W-1-y, x), pivot
//       (W-1)/2, bijection sans rééchantillonnage. La sortie est vérifiée invariante par
//       rot90 pixel à pixel (exit 3 sinon) : « rot90-mismatch=0 » attendu.
// Chaîne complète hélice : create_map_object (96×96, side) → sym → remapPalette --ramps.
// Chaîne complète tour   : create_map_object (80×128, low top-down) → crop → remapPalette --ramps.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [mode, fin, fout] = process.argv.slice(2);
const png = PNG.sync.read(fs.readFileSync(fin));
const { width: W, height: H, data: D } = png;
const A = (x, y) => D[(y * W + x) * 4 + 3];

if (mode === 'crop') {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (A(x, y) > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) { console.error('image vide'); process.exit(2); }
  const out = new PNG({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
  PNG.bitblt(png, out, x0, y0, out.width, out.height, 0, 0);
  fs.writeFileSync(fout, PNG.sync.write(out));
  console.log(`crop ${W}x${H} -> ${out.width}x${out.height} (x0=${x0} y0=${y0})`);
} else if (mode === 'sym') {
  if (W !== H || W % 2) { console.error('attendu : carré pair (96×96)'); process.exit(2); }
  const C = (W - 1) / 2;
  // 1. recentre le contenu : centre de la bbox opaque -> centre du canvas (translation entière)
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (A(x, y) > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) { console.error('image vide'); process.exit(2); }
  const dx = Math.round(C - (x0 + x1) / 2), dy = Math.round(C - (y0 + y1) / 2);
  const src = Buffer.alloc(D.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = x - dx, sy = y - dy;
    if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
      for (let c = 0; c < 4; c++) src[(y * W + x) * 4 + c] = D[(sy * W + sx) * 4 + c];
    }
  }
  const sA = (x, y) => src[(y * W + x) * 4 + 3];
  // 2. axe dominant des pales : histogramme angulaire pondéré par alpha×rayon (rayon > 12)
  const hist = new Float64Array(360);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = sA(x, y); if (a <= 40) continue;
    const vx = x - C, vy = y - C, r = Math.hypot(vx, vy);
    if (r <= 12) continue;
    const deg = ((Math.atan2(vy, vx) * 180 / Math.PI) + 360) % 360;
    hist[Math.floor(deg)] += a * r; // pondéré par le rayon : la pointe des pales pèse
  }
  // lissage circulaire ±6°, repli des 4 quadrants (symétrie 90° attendue)
  const fold = new Float64Array(90);
  for (let d = 0; d < 360; d++) {
    let s = 0; for (let k = -6; k <= 6; k++) s += hist[(d + k + 360) % 360];
    fold[d % 90] += s;
  }
  let axis = 0; for (let d = 1; d < 90; d++) if (fold[d] > fold[axis]) axis = d;
  // 3. reconstruit depuis le secteur [axe-45°, axe+45°) : domaine fondamental exact du
  //    groupe rot90 (chaque pixel de sortie écrit UNE fois — la symétrie est garantie)
  const rot90 = (x, y) => [W - 1 - y, x];
  const out = new PNG({ width: W, height: H });
  const O = out.data; O.fill(0);
  let stamped = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const vx = x - C, vy = y - C;
    const deg = ((Math.atan2(vy, vx) * 180 / Math.PI) + 360) % 360;
    let delta = ((deg - axis) % 360 + 360) % 360;
    if (delta >= 315) delta -= 360;
    if (delta < -45 || delta >= 45) continue;
    let px = x, py = y;
    for (let k = 0; k < 4; k++) {
      for (let c = 0; c < 4; c++) O[(py * W + px) * 4 + c] = src[(y * W + x) * 4 + c];
      [px, py] = rot90(px, py);
    }
    if (sA(x, y) > 40) stamped++;
  }
  // vérification : l'image doit être invariante par rot90 (pixel à pixel)
  let bad = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [rx, ry] = rot90(x, y);
    for (let c = 0; c < 4; c++) if (O[(y * W + x) * 4 + c] !== O[(ry * W + rx) * 4 + c]) { bad++; break; }
  }
  fs.writeFileSync(fout, PNG.sync.write(out));
  console.log(`sym axe=${axis}° recentré=(${dx},${dy}) secteur=${stamped}px rot90-mismatch=${bad}`);
  if (bad > 0) process.exit(3);
} else {
  console.error('mode inconnu (crop|sym)'); process.exit(2);
}
