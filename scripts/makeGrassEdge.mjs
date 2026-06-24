// Génère une COUCHE DE BORD herbe→sol par-dessus chaque tileset de sol urbain.
//   Entrée : public/pixelart/grass.png + public/pixelart/roads/<band>.png (alpha = sol)
//   Sortie : public/pixelart/roads/<band>.edge.png — overlay transparent qui contient :
//     · un liseré sombre côté SOL (ombre de contact → donne du relief),
//     · une ligne d'herbe foncée côté HERBE (définition du bord),
//     · des touffes d'herbe qui débordent sur le sol (bord organique).
//   Même grille Wang que le sol (réutilise le .json du sol → pas de métadonnée à part).
//   NON DESTRUCTIF : ne modifie jamais les PNG de sol. Idempotent.
//   Lancer : node scripts/makeGrassEdge.mjs
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'public/pixelart/roads';
const GRASS = 'public/pixelart/grass.png';

// --- réglages (à ajuster au ressenti via la planche compare.html) ----------
const RIM_FACTOR = 0.6;     // ombre de contact côté sol, bord HAUT/nord (plus bas = plus sombre)
const HILITE_FACTOR = 1.12; // reflet de lumière côté sol, bord BAS/sud (plus haut = plus clair)
const TUFT_EVERY = 9;       // ~1 touffe tous les N pixels de bord (plus grand = moins dense)
const TUFT_LEN = 2;         // profondeur des touffes dans le sol (px)

const clamp = (c) => Math.max(0, Math.min(255, Math.round(c)));
const g = PNG.sync.read(fs.readFileSync(GRASS));
const GR = [g.data[0], g.data[1], g.data[2]];
const DARK_GRASS = GR.map((c) => clamp(c * 0.6));
const TUFT_HI = GR.map((c) => clamp(c * 1.28));

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png') && !f.endsWith('.edge.png'));

for (const f of files) {
  const png = PNG.sync.read(fs.readFileSync(path.join(DIR, f)));
  const W = png.width, H = png.height, d = png.data;
  const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? false : d[(y * W + x) * 4 + 3] > 0; // sol
  const out = new PNG({ width: W, height: H }); // tout transparent au départ
  const set = (x, y, r, gc, b) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4; out.data[i] = r; out.data[i + 1] = gc; out.data[i + 2] = b; out.data[i + 3] = 255;
  };
  const nearGround = (x, y, dist) => {
    for (let dy = -dist; dy <= dist; dy += 1) for (let dx = -dist; dx <= dist; dx += 1) if (A(x + dx, y + dy)) return true;
    return false;
  };
  const touchesGrass = (x, y) => (!A(x - 1, y) || !A(x + 1, y) || !A(x, y - 1) || !A(x, y + 1));

  // Lumière directionnelle (vue high top-down) : le bord HAUT/nord de la ville est
  // à l'ombre, le bord BAS/sud capte la lumière → la perspective se lit.
  // Passe 1 — herbe foncée : seulement au bord HAUT (sol juste en dessous).
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (A(x, y)) continue;
    if (A(x, y + 1)) set(x, y, DARK_GRASS[0], DARK_GRASS[1], DARK_GRASS[2]); // herbe au bord nord du sol
  }
  // Passe 2 — relief de contact côté SOL, DIRECTIONNEL :
  //   herbe au-dessus (bord nord) → ombre marquée ; côtés → ombre douce ;
  //   herbe en dessous (bord sud) → léger reflet, pas d'ombre.
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (!A(x, y) || !touchesGrass(x, y)) continue;
    const i = (y * W + x) * 4;
    const grassAbove = !A(x, y - 1), grassBelow = !A(x, y + 1);
    const grassSide = !A(x - 1, y) || !A(x + 1, y);
    let f;
    if (grassAbove) f = RIM_FACTOR;                        // ombre forte (nord)
    else if (grassSide && !grassBelow) f = (1 + RIM_FACTOR) / 2; // ombre douce (côté)
    else if (grassBelow) f = HILITE_FACTOR;                // reflet (sud)
    else continue;
    set(x, y, clamp(d[i] * f), clamp(d[i + 1] * f), clamp(d[i + 2] * f));
  }
  // Passe 3 — touffes : l'herbe déborde sur le sol (pointe éclaircie).
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (A(x, y) || !nearGround(x, y, 1)) continue;              // pixel d'herbe au contact du sol
    if (((x * 73 + y * 149) >>> 0) % TUFT_EVERY !== 0) continue; // espacement déterministe
    let dirx = 0, diry = 0;                                      // direction vers le sol
    if (A(x + 1, y)) dirx = 1; else if (A(x - 1, y)) dirx = -1;
    else if (A(x, y + 1)) diry = 1; else if (A(x, y - 1)) diry = -1;
    for (let k = 1; k <= TUFT_LEN; k += 1) {
      const c = (k === TUFT_LEN) ? TUFT_HI : GR;
      set(x + dirx * k, y + diry * k, c[0], c[1], c[2]);
    }
  }
  const o = f.replace('.png', '.edge.png');
  fs.writeFileSync(path.join(DIR, o), PNG.sync.write(out));
  console.log('edge:', o);
}
console.log('OK :', files.length, 'couches de bord générées dans', DIR);
