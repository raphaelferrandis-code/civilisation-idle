// bustBounce.mjs — fait REBONDIR la poitrine d'une bande de marche ou de danse
// (Maison des Plaisirs, retour de Raph du 2026-10-03 : « leurs seins doivent bouger
// quand elles marchent/dansent »). À la taille de jeu (~10 px par personnage), un
// rebond, c'est UN pixel : la zone du buste descend d'un rang aux images d'appui
// (le pied touche le sol, le corps s'affaisse) et remonte d'un rang à l'envol.
//   node scripts/bustBounce.mjs <bande.png> [...] [--down=0,3] [--up=1,4] [--zone=0.34,0.47] [--w=0.56]
// --down / --up : indices d'images (bande de N images carrées H×H) ; --zone : haut et
// bas du buste, en fraction de la hauteur du personnage (sa boîte opaque) ; --w :
// largeur de la zone, en fraction de sa largeur, centrée sur lui. Le rang laissé libre
// reprend la couleur du rang voisin (décolleté au-dessus, taille au-dessous) : rien ne
// se troue. À passer AVANT quantize.cjs et la bande -half.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const list = (s) => (s ? s.split(',').filter(Boolean).map(Number) : []);
const DOWN = list(arg('down', '0,3')), UP = list(arg('up', '')), [ZS, ZE] = list(arg('zone', '0.34,0.47')), WF = +arg('w', '0.56');
for (const f of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const p = PNG.sync.read(fs.readFileSync(f));
  const H = p.height, N = Math.round(p.width / H);
  const at = (x, y) => (y * p.width + x) * 4;
  let moved = 0;
  for (let n = 0; n < N; n += 1) {
    const d = DOWN.includes(n) ? 1 : UP.includes(n) ? -1 : 0;
    if (!d) continue;
    const x0 = n * H;
    let top = H, bot = -1, left = H, right = -1;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < H; x += 1) {
      if (p.data[at(x0 + x, y) + 3] < 128) continue;
      if (y < top) top = y; if (y > bot) bot = y; if (x < left) left = x; if (x > right) right = x;
    }
    if (bot < 0) continue;
    const h = bot - top + 1, w = right - left + 1, cx = (left + right) / 2;
    const r0 = top + Math.round(ZS * h), r1 = top + Math.round(ZE * h);
    const c0 = Math.round(cx - (WF * w) / 2), c1 = Math.round(cx + (WF * w) / 2);
    const src = Buffer.from(p.data);
    for (let x = c0; x <= c1; x += 1) {
      if (d > 0) {
        // Le buste descend : chaque rang prend celui du dessus ; le haut reprend le rang au-dessus de la zone.
        for (let y = r1 + 1; y > r0; y -= 1) {
          const s = at(x0 + x, y - 1), t = at(x0 + x, y);
          if (src[s + 3] < 128 || src[t + 3] < 128) continue;
          for (let c = 0; c < 4; c += 1) p.data[t + c] = src[s + c];
          moved += 1;
        }
      } else {
        // Le buste remonte : chaque rang prend celui du dessous.
        for (let y = r0 - 1; y < r1; y += 1) {
          const s = at(x0 + x, y + 1), t = at(x0 + x, y);
          if (src[s + 3] < 128 || src[t + 3] < 128) continue;
          for (let c = 0; c < 4; c += 1) p.data[t + c] = src[s + c];
          moved += 1;
        }
      }
    }
  }
  fs.writeFileSync(f, PNG.sync.write(p));
  console.log(f.split(/[\\/]/).pop(), `— ${moved} px déplacés (${N} images)`);
}
