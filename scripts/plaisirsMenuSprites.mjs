// Les trois sprites du MENU DE LA MAISON DES PLAISIRS (« tableau d'étages »,
// 2026-10-03) : la poutre de fonte rivetée qui sépare les étages, les cadrans
// d'étage en laiton (ceux de l'ascenseur de la coupe) et la lanterne rouge et
// crème des festons, qui marque le lieu choisi.
//
// Dessinés au pixel, dans les couleurs RELEVÉES sur la coupe peinte par le code
// (iso/plaisirsCoupeHD.js, capture de la Fonte) : charpente #1f2228 et ses rivets
// #62676f tous les 12 px, laiton #9c7524/#d2a53e/#f0cf6a, laque de l'ascenseur
// #1a2622, lanternes #c8434a et crème #f4e8cc. Rendus ×2 par views-plaisirs.css.
//
//   node scripts/plaisirsMenuSprites.mjs
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const OUT = path.resolve('public/pixelart/ui/plaisirs');
const rgba = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

function sprite(file, w, h, paint) {
  const p = new PNG({ width: w, height: h });
  p.data.fill(0);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= w || y >= h || !c) return;
    const i = (y * w + x) * 4, v = rgba(c);
    for (let k = 0; k < 4; k += 1) p.data[i + k] = v[k];
  };
  paint(set);
  fs.writeFileSync(path.join(OUT, file), PNG.sync.write(p));
  console.log(file, `${w}×${h}`);
}

const IRON = { hi: '#464b54', mid: '#2f333b', body: '#1f2228', edge: '#181b21', drop: '#1c1216', rivet: '#62676f' };
const BRASS = { dk: '#9c7524', md: '#d2a53e', lt: '#f0cf6a' };
const LACQ = '#1a2622';

// La poutre : une travée de 12 px, un rivet par travée (comme la charpente).
sprite('menu-poutre.png', 12, 6, (set) => {
  for (let x = 0; x < 12; x += 1) {
    set(x, 0, IRON.hi); set(x, 1, IRON.mid); set(x, 2, IRON.body); set(x, 3, IRON.body);
    set(x, 4, IRON.edge); set(x, 5, IRON.drop);
  }
  set(5, 2, IRON.rivet); set(5, 3, IRON.edge);
});

// Les cadrans : une planche de médaillons 13×13, dans l'ordre de CADRANS
// (views-plaisirs.css décale l'arrière-plan d'un médaillon par rang). R = rez,
// T = le toit (la plateforme d'Icare). Chiffres en 3×5, laiton sur laque.
const CADRANS = 'R12345T';
const GLYPH = {
  R: ['110', '101', '110', '101', '101'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  T: ['010', '111', '010', '010', '010'],
};
sprite('menu-cadrans.png', 13 * CADRANS.length, 13, (set) => {
  [...CADRANS].forEach((ch, n) => {
    const ox = n * 13, c = 6;
    for (let y = 0; y < 13; y += 1) for (let x = 0; x < 13; x += 1) {
      const d = Math.hypot(x - c, y - c);
      if (d > 6.3) continue;
      if (d > 5.4) { set(ox + x, y, IRON.edge); continue; }
      if (d > 4.1) {
        const s = (x - c) + (y - c);
        set(ox + x, y, s < -2 ? BRASS.lt : s > 3 ? BRASS.dk : BRASS.md);
        continue;
      }
      set(ox + x, y, LACQ);
    }
    GLYPH[ch].forEach((row, gy) => [...row].forEach((b, gx) => { if (b === '1') set(ox + 5 + gx, 4 + gy, BRASS.lt); }));
  });
});

// La lanterne des festons : crochet et chapeau de laiton, panse rouge cerclée de
// crème, gland.
sprite('menu-lanterne.png', 6, 10, (set) => {
  const R = '#c8434a', r = '#e0625a', D = '#7a2333', C = '#f4e8cc';
  set(2, 0, BRASS.dk); set(3, 0, BRASS.dk);
  for (let x = 1; x < 5; x += 1) set(x, 1, BRASS.md);
  [[2, R], [3, R], [4, C], [5, R], [6, R]].forEach(([y, col]) => {
    const narrow = y === 2 || y === 6, w0 = narrow ? 1 : 0, w1 = narrow ? 4 : 5;
    for (let x = w0; x <= w1; x += 1) set(x, y, col);
    if (col === R) { set(w0 + (narrow ? 0 : 1), y, r); set(w1, y, D); }
  });
  for (let x = 1; x < 5; x += 1) set(x, 7, BRASS.md);
  set(2, 8, BRASS.dk); set(2, 9, R);
});
