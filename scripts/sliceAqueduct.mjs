// sliceAqueduct.mjs — découpe UNE scène d'aqueduc cohérente (générée large chez PixelLab)
// en 3 modules tileables : outlet (ouest) · seg (travée répétée) · intake (est).
//   C'est la MÉTHODE du stade 0 (scène cohérente → découpe), retrouvée après perte du
//   script d'origine. Le canal continu sur toute la largeur de la scène = ce qui fait
//   que le seg (tranche du milieu) se raccorde d'un module à l'autre au blit.
//
//   Lancer :  node scripts/sliceAqueduct.mjs <era> [x0 x1 x2 x3]
//     <era>            = roman | iron | modern (lit aqueduct-<era>-scene.png)
//     x0 x1 x2 x3      = bornes de coupe optionnelles (px). Défaut = 3 tiers égaux.
//                        Ajuster pour caler le seg sur UNE période (pilier centré).
//   Sortie : aqueduct-<era>-outlet/-seg/-intake.png dans public/pixelart/agents/buildings/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BUILDINGS = path.join(ROOT, 'public', 'pixelart', 'agents', 'buildings');

const era = process.argv[2] || 'roman';
const scenePath = path.join(BUILDINGS, `aqueduct-${era}-scene.png`);
if (!fs.existsSync(scenePath)) { console.error(`manque ${scenePath}`); process.exit(1); }
const scene = PNG.sync.read(fs.readFileSync(scenePath));
const W = scene.width, H = scene.height;

const b = process.argv.slice(3).map(Number).filter((n) => !Number.isNaN(n));
const [x0, x1, x2, x3] = b.length === 4 ? b : [0, Math.round(W / 3), Math.round((2 * W) / 3), W];
if (!(x0 >= 0 && x0 <= x1 && x1 <= x2 && x2 <= x3 && x3 <= W)) {
  console.error(`bornes invalides: ${x0} ${x1} ${x2} ${x3} — attendu 0 ≤ x0 ≤ x1 ≤ x2 ≤ x3 ≤ ${W}`);
  process.exit(1);
}
const cuts = [['outlet', x0, x1], ['seg', x1, x2], ['intake', x2, x3]];

for (const [name, a, z] of cuts) {
  const w = z - a;
  const out = new PNG({ width: w, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * W + (a + x)) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = scene.data[si];
      out.data[di + 1] = scene.data[si + 1];
      out.data[di + 2] = scene.data[si + 2];
      out.data[di + 3] = scene.data[si + 3];
    }
  }
  fs.writeFileSync(path.join(BUILDINGS, `aqueduct-${era}-${name}.png`), PNG.sync.write(out));
  console.log(`aqueduct-${era}-${name}.png  ${w}x${H}  (x ${a}..${z})`);
}
