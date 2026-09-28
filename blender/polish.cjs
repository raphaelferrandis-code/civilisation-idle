// POLISH pixel-art d'un rendu Blender : contour sélectif + rehauts + ombre
// d'avant-toit, calculés à partir de la passe d'identité des matières
// (<nom>.ids.png, R = index·8 ; <nom>.ids.json = nom → index).
//   node blender/polish.cjs <nom> [--colors 20]
// Règles (toutes locales, 1 px, en nearest — rien n'est flouté) :
//   · SILHOUETTE bas/droite (voisin transparent) → assombri ×0,55 (le liseré
//     sombre côté ombre des sprites actuels) ;
//   · SILHOUETTE haut/gauche (voisin transparent) → éclairci ×1,22 (rehaut
//     côté lumière) ;
//   · CHANGEMENT DE MATIÈRE vers le bas ou la droite → ×0,72 (arête interne
//     côté ombre : le toit se détache du mur, le cadre de la fenêtre du mur) ;
//   · AVANT-TOIT : mur dont le voisin du dessus est du toit → ×0,7 sur 1 px
//     (l'occlusion sous la gouttière que le rendu sans ombre n'a pas).
// Puis quantification (median-cut du projet) sur <nom>.polish.png.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PNG } = require('pngjs');

const name = process.argv[2] || 'stonehouse';
const COLORS = (() => { const i = process.argv.indexOf('--colors'); return i > 0 ? +process.argv[i + 1] : 20; })();
const OUT = path.join(__dirname, 'out');
const rd = (f) => PNG.sync.read(fs.readFileSync(path.join(OUT, f)));
const col = rd(name + '.png'), ids = rd(name + '.ids.png');
const map = JSON.parse(fs.readFileSync(path.join(OUT, name + '.ids.json'), 'utf8'));
const ROOF = new Set(['slate', 'ridge', 'thatch', 'roof_flat', 'trim'].map((k) => map[k]).filter((v) => v != null));
const W = col.width, H = col.height;
const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : col.data[(y * W + x) * 4 + 3];
const ID = (x, y) => (x < 0 || y < 0 || x >= W || y >= H || A(x, y) < 128) ? -1 : ids.data[(y * W + x) * 4];
const out = new PNG({ width: W, height: H });
col.data.copy(out.data);
const mul = (x, y, k) => { const i = (y * W + x) * 4; for (let c = 0; c < 3; c++) out.data[i + c] = Math.max(0, Math.min(255, Math.round(col.data[i + c] * k))); };
let nOut = 0, nRim = 0, nEdge = 0, nEave = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (A(x, y) < 128) { out.data[(y * W + x) * 4 + 3] = 0; continue; }
  const me = ID(x, y);
  const r = ID(x + 1, y), d = ID(x, y + 1), u = ID(x, y - 1), l = ID(x - 1, y);
  // Dosage v2 : la première passe (arêtes internes ×0,72 partout) assombrissait
  // tout le bâtiment en boue — les arêtes internes ne prennent qu'un ×0,88.
  if (r < 0 || d < 0) { mul(x, y, 0.6); nOut++; continue; }
  if (u < 0 || l < 0) { mul(x, y, 1.15); nRim++; continue; }
  if (ROOF.has(u) && !ROOF.has(me)) { mul(x, y, 0.72); nEave++; continue; }
  if (r !== me || d !== me) { mul(x, y, 0.88); nEdge++; continue; }
}
const dst = path.join(OUT, name + '.polish.png');
fs.writeFileSync(dst, PNG.sync.write(out));
console.log(`${name}: silhouette ${nOut} px, rehaut ${nRim}, arêtes ${nEdge}, avant-toit ${nEave}`);
execFileSync('node', [path.join(__dirname, '..', 'scripts', 'quantize.cjs'), dst, '--colors', String(COLORS), '--min', '0'], { stdio: 'inherit' });
