// ── LA MACHINE À SOUS, PEINTE PAR LE CODE ─────────────────────────────────────
// (2026-10-03, demande de Raph : « une machine à sous, avec des bonus type free spin
// et mini jeux, qui déclenche une roue » ; elle ouvre à la Fonte.)
//
// Trois habits, comme les autres jeux changent de matière d'âge en âge :
//   · FONTE (1895, la Liberty Bell) : meuble de fonte et de laiton sur socle de bois ;
//     les symboles de l'époque — cœur, carreau, pique, fer à cheval, trèfle, et la
//     CLOCHE fêlée pour le gros lot ;
//   · NÉON (le bandit manchot) : chrome et laque rouge, fronton d'ampoules ; cerise,
//     citron, cloche, fer à cheval, BAR, 7 ;
//   · COSMIQUES (jade, astral, cristal) : un cadre de lumière qui flotte, les mêmes
//     symboles en cristal cernés de la lueur de la cité.
// Tout est PUR (rasters, aucun DOM) : la vue (ui/SlotsStage.jsx) en fait des canevas.
// Les symboles se dessinent par FORMES (cercles, courbes implicites) éclairées en haut
// à gauche et cernées d'encre — la règle de lumière de toute la carte.
import { INK, mix, bayer, palOf, lightPool, painter } from './plaisirsHDKit.js';
import { styleHD, wallAt, floorAt, lamp } from './plaisirsCoupeHD.js';
import { makeRaster } from './isoPixelPaint.js';

export const SLOT_CELL = 18;                 // une case de rouleau (px natifs)
export const SLOT_ICON = 16;                 // un symbole
// La scène native (mur, sol, machine). 164 de haut : sous la machine, le sol garde la
// place des mises et de leur bouton (à 148, « Tirer » sortait du cadre).
export const SCENE_W = 224, SCENE_H = 164;

const _rgb = new Map();
function rgb(c) {
  let v = _rgb.get(c);
  if (!v) { v = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; _rgb.set(c, v); }
  return v;
}
// Un pinceau minimal sur un raster { w, h, data }.
function brush(R) {
  const B = {
    R,
    put(x, y, c) {
      x |= 0; y |= 0;
      if (!c || x < 0 || y < 0 || x >= R.w || y >= R.h) return;
      const v = rgb(c), k = (y * R.w + x) * 4;
      R.data[k] = v[0]; R.data[k + 1] = v[1]; R.data[k + 2] = v[2]; R.data[k + 3] = 255;
    },
    get(x, y) {
      if (x < 0 || y < 0 || x >= R.w || y >= R.h) return null;
      const k = (y * R.w + x) * 4;
      if (!R.data[k + 3]) return null;
      const h = (n) => n.toString(16).padStart(2, '0');
      return '#' + h(R.data[k]) + h(R.data[k + 1]) + h(R.data[k + 2]);
    },
    on(x, y) { return x >= 0 && y >= 0 && x < R.w && y < R.h && R.data[(y * R.w + x) * 4 + 3] > 0; },
    rect(x, y, w, h, c) { for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) B.put(x + i, y + j, c); },
    hline(x, y, w, c) { B.rect(x, y, w, 1, c); },
    vline(x, y, h, c) { B.rect(x, y, 1, h, c); },
  };
  return B;
}

// L'habit d'un âge : 'fonte' | 'neon' | 'cosmic' (avant la Fonte, la machine n'existe
// pas — une molette de dev qui force un âge ancien retombe sur la fonte).
export function slotsLook(band) {
  const b = band | 0;
  return b >= 7 ? 'cosmic' : b === 6 ? 'neon' : 'fonte';
}

// ── Les SYMBOLES ──────────────────────────────────────────────────────────────
// Rampes : clair, moyen, sombre, ombre.
const RED = ['#ff9a9a', '#e8343e', '#b01e2a', '#6a0e16'];
const YELLOW = ['#fff8b0', '#f8d838', '#d49e14', '#7e5c0a'];
const GOLD = ['#fff2b8', '#f2c94a', '#c48e22', '#6e4a12'];
const BRONZE = ['#ffe2a6', '#daa24a', '#9c6a2a', '#5c3a14'];
const SILVER = ['#ffffff', '#cdd4dc', '#8e98a4', '#4c5462'];
const IRON = ['#e0d8c6', '#a49a88', '#6c665a', '#3c3832'];
const CARD = ['#7a7a88', '#3c3c48', '#24242c', '#121218'];
const GREEN = ['#9ae060', '#4caa2c', '#2a7018', '#14400a'];
const BARP = ['#6a6a78', '#34343e', '#1e1e26', '#0c0c12'];

// Une forme pleine, éclairée en haut à gauche : `test(x, y)` sur les centres de pixels.
function blob(B, test, cx, cy, rad, ramp, spec = true) {
  for (let y = 0; y < SLOT_ICON; y += 1) for (let x = 0; x < SLOT_ICON; x += 1) {
    const px = x + 0.5, py = y + 0.5;
    if (!test(px, py)) continue;
    const l = 0.5 - ((px - cx) * 0.62 + (py - cy) * 0.78) / rad;
    let c = l > 0.86 ? ramp[0] : l > 0.42 ? ramp[1] : l > 0.08 ? ramp[2] : ramp[3];
    if (!spec && c === ramp[0]) c = ramp[1];
    B.put(x, y, c);
  }
}
const disc = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const seg = (ax, ay, bx, by, w) => (x, y) => {
  const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - ax - vx * t, y - ay - vy * t) <= w;
};
// Un triangle (a, b, c) : le point est-il dedans ?
const tri = (ax, ay, bx, by, cx, cy) => (x, y) => {
  const s1 = (x - bx) * (ay - by) - (ax - bx) * (y - by), s2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy), s3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  return !((s1 < 0 || s2 < 0 || s3 < 0) && (s1 > 0 || s2 > 0 || s3 > 0));
};
// Les FORMES DE CARTES, nettes à 16 px : deux lobes et une pointe (une courbe implicite
// rendait une tache ronde, où l'on ne lisait ni cœur ni pique).
const heart = () => (x, y) => disc(5.2, 6, 3.1)(x, y) || disc(10.8, 6, 3.1)(x, y) || tri(2.1, 6.8, 13.9, 6.8, 8, 14.2)(x, y);
const spade = () => (x, y) => disc(5.2, 9.2, 3)(x, y) || disc(10.8, 9.2, 3)(x, y) || tri(2.2, 8.4, 13.8, 8.4, 8, 1.4)(x, y) || tri(8, 9.5, 5.2, 15, 10.8, 15)(x, y);
const club = () => (x, y) => disc(8, 4.4, 2.7)(x, y) || disc(4.4, 9.4, 2.7)(x, y) || disc(11.6, 9.4, 2.7)(x, y) || disc(8, 8.6, 1.6)(x, y) || tri(8, 9, 5.4, 15, 10.6, 15)(x, y);
// La CLOCHE : un dôme, des flancs qui s'évasent, la lèvre, le battant.
const bell = (crack = false) => (x, y) => {
  const dx = Math.abs(x - 8);
  if (y >= 2 && y < 5.4) return dx <= Math.sqrt(Math.max(0, 3.7 * 3.7 - (5.4 - y) * (5.4 - y)));
  if (y >= 5.4 && y < 10) return dx <= 3.7 + (y - 5.4) * 0.22;
  if (y >= 10 && y < 12.2) return dx <= 4.7 + (y - 10) * 1.05;
  if (y >= 12.2 && y <= 13.4) return dx <= 7;
  void crack;
  return disc(8, 1.4, 1.1)(x, y) || disc(8, 14.5, 1.2)(x, y);
};
// La petite police (3×5) : chiffres, ×, et les lettres des enseignes.
const GLYPH = {
  0: ['xxx', 'x.x', 'x.x', 'x.x', 'xxx'], 1: ['.x', 'xx', '.x', '.x', '.x'], 2: ['xxx', '..x', 'xxx', 'x..', 'xxx'],
  3: ['xxx', '..x', '.xx', '..x', 'xxx'], 4: ['x.x', 'x.x', 'xxx', '..x', '..x'], 5: ['xxx', 'x..', 'xxx', '..x', 'xxx'],
  6: ['xxx', 'x..', 'xxx', 'x.x', 'xxx'], 7: ['xxx', '..x', '.x.', '.x.', '.x.'], 8: ['xxx', 'x.x', 'xxx', 'x.x', 'xxx'],
  9: ['xxx', 'x.x', 'xxx', '..x', 'xxx'], '×': ['...', 'x.x', '.x.', 'x.x', '...'],
  B: ['xx.', 'x.x', 'xx.', 'x.x', 'xx.'], A: ['.x.', 'x.x', 'xxx', 'x.x', 'x.x'], R: ['xx.', 'x.x', 'xx.', 'x.x', 'x.x'],
  J: ['..x', '..x', '..x', 'x.x', '.x.'], P: ['xx.', 'x.x', 'xx.', 'x..', 'x..'], C: ['xxx', 'x..', 'x..', 'x..', 'xxx'],
  K: ['x.x', 'x.x', 'xx.', 'x.x', 'x.x'], O: ['xxx', 'x.x', 'x.x', 'x.x', 'xxx'], T: ['xxx', '.x.', '.x.', '.x.', '.x.'],
};
export function textWidth(s) { return [...String(s)].reduce((w, ch) => w + (GLYPH[ch] ? GLYPH[ch][0].length + 1 : 3), -1); }
function text(B, s, x, y, c) {
  let lx = x;
  for (const ch of String(s)) {
    const g = GLYPH[ch];
    if (g) g.forEach((row, j) => [...row].forEach((v, i) => { if (v === 'x') B.put(lx + i, y + j, c); }));
    lx += (g ? g[0].length : 2) + 1;
  }
}
// Cerne d'encre autour de ce qui est peint (et, à l'âge cosmique, un cerne de lumière).
function outline(B, c) {
  const R = B.R, on = [];
  for (let y = 0; y < R.h; y += 1) for (let x = 0; x < R.w; x += 1) on.push(B.on(x, y));
  for (let y = 0; y < R.h; y += 1) for (let x = 0; x < R.w; x += 1) {
    if (on[y * R.w + x]) continue;
    const n = (dx, dy) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < R.w && Y < R.h && on[Y * R.w + X]; };
    if (n(1, 0) || n(-1, 0) || n(0, 1) || n(0, -1)) B.put(x, y, c);
  }
}
const lighten = (ramp, t) => ramp.map((c) => mix(c, '#ffffff', t));

// Les dessins, symbole par symbole. `look` : l'habit ; `R` : la rampe d'un âge cosmique
// (éclaircie) ou d'origine.
function drawSymbol(B, id, look) {
  const k = look === 'cosmic' ? (r) => lighten(r, 0.3) : (r) => r;
  const fonte = look === 'fonte';
  switch (id) {
    case 'cerise':
      if (fonte) { blob(B, heart(), 6.5, 6.5, 7, k(RED)); break; }                          // le cœur
      for (const [a, b2] of [[[5.5, 8], [8.6, 2.2]], [[10.6, 8.4], [9.2, 2.2]]]) {
        for (let t = 0; t <= 1; t += 0.05) B.put(a[0] + (b2[0] - a[0]) * t, a[1] + (b2[1] - a[1]) * t, k(GREEN)[2]);
      }
      blob(B, (x, y) => ((x - 11) / 2.4) ** 2 + ((y - 2.6) / 1.3) ** 2 <= 1, 10, 2, 3, k(GREEN));
      blob(B, disc(5, 11, 3.4), 4, 10, 4, k(RED));
      blob(B, disc(11.2, 11.5, 3.4), 10.2, 10.5, 4, k(RED));
      break;
    case 'citron':
      if (fonte) { blob(B, (x, y) => Math.abs(x - 8) / 5.2 + Math.abs(y - 8) / 7.2 <= 1, 6.5, 6, 6, k(RED)); break; }  // le carreau
      blob(B, (x, y) => ((x - 8) / 6) ** 2 + ((y - 8.5) / 4.6) ** 2 <= 1 || disc(1.9, 8.5, 1.3)(x, y) || disc(14.1, 8.5, 1.3)(x, y), 6.5, 7, 6, k(YELLOW));
      break;
    case 'cloche':
      if (fonte) {                                                                            // le pique
        blob(B, spade(), 6.5, 6, 6.5, k(CARD));
        break;
      }
      blob(B, bell(), 6.2, 6.5, 6.5, k(GOLD));
      break;
    case 'fer': {
      const ramp = k(fonte ? IRON : SILVER);
      blob(B, (x, y) => { const d = Math.hypot(x - 8, y - 7.6); return d >= 3.3 && d <= 6.6 && !(y > 9.2 && Math.abs(x - 8) < 3.6); }, 6.5, 5.5, 6.5, ramp, false);
      for (const a of [-0.35, 0.35, 1.05, 2.1, 2.8, 3.5]) B.put(8 + Math.cos(a + Math.PI) * 4.9, 7.6 - Math.sin(a + Math.PI) * -4.9 * -1, ramp[3]);
      break;
    }
    case 'bar':
      if (fonte) {                                                                            // le trèfle
        blob(B, club(), 6.5, 6, 6.5, k(CARD));
        break;
      }
      blob(B, (x, y) => x >= 1 && x <= 15 && y >= 4 && y <= 12 && !((x < 2 || x > 14) && (y < 5 || y > 11)), 6, 6.5, 7, k(BARP), false);
      text(B, 'BAR', 3, 6, look === 'cosmic' ? '#ffffff' : '#ffe680');
      break;
    case 'sept':
      if (fonte) {                                                                            // la cloche de la Liberté
        blob(B, bell(true), 6.2, 6.5, 6.5, k(BRONZE));
        for (const [x, y] of [[9, 5], [8, 6], [9, 7], [8, 8], [9, 9], [10, 10], [9, 11]]) B.put(x, y, BRONZE[3]);   // la fêlure
        B.hline(5, 11, 7, BRONZE[0]);
        break;
      }
      blob(B, (x, y) => (x >= 3 && x <= 13 && y >= 1.8 && y <= 4.6) || seg(12, 4.4, 6.4, 14, 1.75)(x, y), 6.5, 6.5, 7, k(RED));
      break;
    case 'etoile': {
      const ramp = look === 'cosmic' ? lighten(GOLD, 0.35) : fonte ? BRONZE : ['#ffffff', '#ffe066', '#f0a020', '#a05a08'];
      blob(B, (x, y) => {
        const a = Math.atan2(y - 8.6, x - 8) + Math.PI / 2, r = Math.hypot(x - 8, y - 8.6);
        const t = ((a % (Math.PI * 0.4)) + Math.PI * 0.4) % (Math.PI * 0.4) / (Math.PI * 0.4);
        const lim = 2.9 + (7.3 - 2.9) * Math.abs(1 - 2 * t);
        return r <= lim;
      }, 6.5, 6.5, 6.5, ramp);
      break;
    }
    case 'roue': {
      const rim = fonte ? BRONZE : look === 'cosmic' ? lighten(GOLD, 0.3) : GOLD;
      const A = fonte ? '#b8282e' : '#e0303a', Bc = fonte ? '#f0e2c0' : '#fff2d0';
      for (let y = 0; y < SLOT_ICON; y += 1) for (let x = 0; x < SLOT_ICON; x += 1) {
        const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
        if (d > 7.2) continue;
        if (d > 5.6) B.put(x, y, x + y < 14 ? rim[1] : rim[2]);
        else if (d < 1.7) B.put(x, y, rim[1]);
        else {
          const s = Math.floor(((Math.atan2(y + 0.5 - 8, x + 0.5 - 8) + Math.PI) / (Math.PI * 2)) * 8) % 8;
          B.put(x, y, s % 2 ? A : Bc);
        }
      }
      B.put(8, 0, rim[3]); B.put(7, 0, rim[3]);
      break;
    }
    default: break;
  }
  outline(B, look === 'cosmic' ? null : INK);
}

const _sym = new Map();
// Le symbole `id` dans l'habit de l'âge : raster 16×16 (cerné), mis en cache.
export function symbolRaster(id, band) {
  const look = slotsLook(band), key = id + '|' + look + '|' + (look === 'cosmic' ? band : '');
  let R = _sym.get(key);
  if (R) return R;
  R = makeRaster(0, 0, SLOT_ICON, SLOT_ICON);
  const B = brush(R);
  drawSymbol(B, id, look);
  if (look === 'cosmic') outline(B, styleHD(band).glow);
  _sym.set(key, R);
  return R;
}

// ── LA SCÈNE : le mur de la salle, le sol, la machine ─────────────────────────
// Rend { back (raster W×H), win {x, y, w, h} (la fenêtre des rouleaux), reelX[3],
// lever {x, y0, y1} (le levier : sa boule et son pivot), bulbs [{x, y}] (les ampoules
// qui clignotent), glow (la couleur de la lueur), look }.
// `W` : la largeur native voulue (la scène remplit le cadre ; la machine reste au centre).
export function bakeSlotsScene(band, W = SCENE_W) {
  W = Math.max(SCENE_W, W | 0);
  const H = SCENE_H, S = styleHD(Math.max(5, band | 0)), pal = palOf(S), look = slotsLook(band);
  const back = makeRaster(0, 0, W, H);
  // Le pinceau de la coupe (les lampes de l'âge s'y peignent telles quelles).
  const P = painter(back), N = painter(makeRaster(0, 0, W, H));
  // Le mur (la matière de la coupe), la corniche, les lampes et leurs flaques.
  const wallH = 108;
  for (let y = 0; y < wallH; y += 1) for (let x = 0; x < W; x += 1) P.put(x, y, wallAt(S, x + 1000, y, 0, wallH + 30));
  for (const x of [Math.round(W / 2) - 86, Math.round(W / 2) + 86]) {
    lightPool(P, x, 44, 30, 46, 0, W - 1, 0, wallH - 1, S.poolTint || '#ffcf8a');
    lamp(P, N, S, pal, x, S.light === 'torch' ? -10 : -3);
  }
  // Le sol, en profondeur, qui s'assombrit vers nous.
  for (let y = wallH; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    P.put(x, y, mix(floorAt(S, x, Math.min(9, (y - wallH) >> 2)), INK, 0.12 + (y - wallH) * 0.006));
  }
  // Les coins sombres : la machine est la lumière.
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const d = Math.abs(x - W / 2) / (W / 2);
    if (d > 0.62 && bayer(x, y) < (d - 0.62) * 1.6) P.put(x, y, mix(P.get(x, y), INK, 0.3));
  }
  const geo = machine(P, look, S, Math.round(W / 2), wallH + 28);
  return { back, ...geo, look, glow: look === 'cosmic' ? S.glow : look === 'neon' ? '#fff2c8' : '#ffd890', W, H };
}

// La MACHINE : `cx` son axe, `yb` le sol sous son socle. Les cotes sont communes aux
// trois habits (la fenêtre, le levier) ; seul le meuble change.
function machine(P, look, S, cx, yb) {
  const MW = 98, x0 = cx - (MW >> 1), top = yb - 132;
  const win = { x: cx - 29, y: top + 44, w: 58, h: 54 };
  const reelX = [win.x, win.x + 20, win.x + 40];
  const lever = { x: x0 + MW - 4, y0: top + 34, y1: top + 74 };
  const bulbs = [];
  if (look === 'fonte') {
    const IR = ['#6a6874', '#4a4852', '#34323a', '#222026', '#141218'], BR = ['#fff0b0', '#f0cf6a', '#c89a3e', '#8e6a26'], WD = S.wood;
    // Le socle de bois, ses pieds tournés.
    P.rect(x0 + 2, yb - 12, MW - 4, 10, WD[2]); P.hline(x0 + 2, yb - 12, MW - 4, WD[1]); P.hline(x0 + 2, yb - 3, MW - 4, WD[3]);
    for (const fx of [x0 + 6, x0 + MW - 10]) { P.rect(fx, yb - 2, 5, 3, WD[3]); P.put(fx + 1, yb - 2, WD[2]); }
    // Le meuble de fonte : panneaux en relief, liserés de laiton.
    for (let y = top + 22; y < yb - 12; y += 1) for (let x = x0 + 6; x < x0 + MW - 6; x += 1) {
      const u = (x - x0 - 6) / (MW - 12);
      let c = u < 0.08 ? IR[1] : u > 0.92 ? IR[3] : IR[2];
      if ((x + y * 3) % 11 === 0) c = IR[3];
      P.put(x, y, c);
    }
    P.vline(x0 + 6, top + 22, yb - 12 - top - 22, BR[2]); P.vline(x0 + MW - 7, top + 22, yb - 12 - top - 22, BR[3]);
    // Le fronton : un arc de laiton, la cloche au centre, les volutes.
    // Le fronton : un arc festonné de laiton, la CLOCHE DE LA LIBERTÉ au centre (le gros
    // lot de cette machine), deux volutes.
    for (let i = -46; i <= 46; i += 1) {
      const a = Math.round(20 * Math.sqrt(Math.max(0, 1 - (i * i) / (46 * 46))));
      const scal = (Math.abs(i) % 8) < 2 ? 1 : 0;
      for (let j = 0; j <= a + scal; j += 1) P.put(cx + i, top + 22 - j, j >= a ? BR[0] : j > a - 2 ? BR[1] : j > a - 4 ? BR[3] : (i * 3 + j * 5) % 13 === 0 ? IR[3] : IR[2]);
    }
    for (let i = -46; i <= 46; i += 1) { P.put(cx + i, top + 22, BR[2]); P.put(cx + i, top + 23, BR[3]); }
    for (const sx of [-1, 1]) for (let t = 0; t < 14; t += 1) { const a = t * 0.45; P.put(cx + sx * (30 + Math.cos(a) * (6 - t * 0.35)), top + 15 + Math.sin(a) * (6 - t * 0.35), BR[1]); }
    blitIcon(P, symbolRaster('sept', 5), cx - 8, top + 4);
    // La plaque de la fenêtre : un cadre de laiton à rivets.
    frame(P, win, 4, BR, IR[4]);
    for (const [rx, ry] of [[win.x - 3, win.y - 3], [win.x + win.w + 2, win.y - 3], [win.x - 3, win.y + win.h + 2], [win.x + win.w + 2, win.y + win.h + 2]]) P.put(rx, ry, BR[0]);
    // La plaque des paiements (des traits gravés), la fente à pièces, le plateau.
    P.rect(cx - 30, win.y + win.h + 8, 60, 8, BR[3]); P.rect(cx - 29, win.y + win.h + 9, 58, 6, BR[2]);
    for (let r = 0; r < 2; r += 1) for (let i = 0; i < 9; i += 1) P.hline(cx - 26 + i * 6, win.y + win.h + 10 + r * 3, 4, BR[3]);
    P.rect(cx + 18, top + 30, 8, 3, IR[4]); P.hline(cx + 18, top + 30, 8, BR[2]);
    P.rect(cx - 22, yb - 24, 44, 8, IR[4]); P.hline(cx - 22, yb - 24, 44, BR[1]); P.hline(cx - 22, yb - 17, 44, BR[3]);
    // Le levier (sa tige se peint à part : il s'abaisse quand on tire).
    P.rect(x0 + MW - 7, top + 70, 5, 8, BR[2]); P.put(x0 + MW - 6, top + 71, BR[0]);
  } else if (look === 'neon') {
    const CH = ['#ffffff', '#e2e8f0', '#b4bcc6', '#7f8892', '#4e5560'], RD = ['#ff6a6a', '#d8343a', '#a02a30', '#681a1e'];
    // Le socle chromé.
    P.rect(x0 + 4, yb - 10, MW - 8, 9, CH[3]); P.hline(x0 + 4, yb - 10, MW - 8, CH[1]); P.hline(x0 + 4, yb - 2, MW - 8, CH[4]);
    // Le coffre : laque rouge, flancs de chrome.
    for (let y = top + 24; y < yb - 10; y += 1) for (let x = x0 + 6; x < x0 + MW - 6; x += 1) {
      const u = (x - x0 - 6) / (MW - 12);
      P.put(x, y, u < 0.07 ? CH[1] : u > 0.93 ? CH[3] : u < 0.14 ? RD[0] : u > 0.86 ? RD[3] : y < top + 30 ? RD[1] : RD[2]);
    }
    // Le fronton d'ampoules : un arc chromé, le 7 lumineux, les ampoules qui courent.
    for (let i = -44; i <= 44; i += 1) {
      const a = Math.round(18 * Math.sqrt(Math.max(0, 1 - (i * i) / (44 * 44))));
      for (let j = 0; j <= a; j += 1) P.put(cx + i, top + 24 - j, j >= a - 1 ? CH[1] : j >= a - 3 ? CH[3] : '#2a1430');
    }
    for (let t = 0; t <= 20; t += 1) {
      const ang = Math.PI * (t / 20), bx = Math.round(cx - Math.cos(ang) * 40), by = Math.round(top + 23 - Math.sin(ang) * 15);
      bulbs.push({ x: bx, y: by });
      P.put(bx, by, '#a08850');
    }
    blitIcon(P, symbolRaster('sept', 6), cx - 8, top + 6);
    frame(P, win, 4, CH, '#0e0e14');
    // Les boutons de mise, le plateau chromé.
    for (let i = 0; i < 5; i += 1) { P.rect(cx - 24 + i * 10, win.y + win.h + 9, 7, 4, i === 4 ? RD[0] : CH[1]); P.hline(cx - 24 + i * 10, win.y + win.h + 12, 7, CH[3]); }
    P.rect(cx - 24, yb - 24, 48, 9, CH[4]); P.hline(cx - 24, yb - 24, 48, CH[1]); P.hline(cx - 24, yb - 16, 48, CH[2]);
    P.rect(x0 + MW - 7, top + 70, 5, 8, CH[2]); P.put(x0 + MW - 6, top + 71, CH[0]);
  } else {
    // COSMIQUE : un cadre de lumière qui flotte, des panneaux de verre, la lueur dessous.
    const G = S.glow, G2 = S.glow2, GL = S.glass || [mix(G, '#ffffff', 0.7), mix(G, '#ffffff', 0.4), G, G2, mix(G2, INK, 0.4)];
    for (let y = top + 18; y < yb - 16; y += 1) for (let x = x0 + 8; x < x0 + MW - 8; x += 1) {
      const u = (x - x0 - 8) / (MW - 16), v = (y - top - 18) / (yb - 16 - top - 18);
      let c = mix(GL[1], GL[3], v * 0.7 + u * 0.2);
      if ((x - y + 300) % 23 < 2) c = mix(c, '#ffffff', 0.5);
      P.put(x, y, c);
    }
    for (let y = top + 18; y < yb - 16; y += 1) { P.put(x0 + 8, y, '#ffffff'); P.put(x0 + MW - 9, y, G2); }
    P.hline(x0 + 8, top + 18, MW - 16, '#ffffff'); P.hline(x0 + 8, yb - 17, MW - 16, G2);
    // Le fronton : un croissant de lumière.
    for (let i = -40; i <= 40; i += 1) {
      const a = Math.round(14 * Math.sqrt(Math.max(0, 1 - (i * i) / 1600)));
      for (let j = Math.max(0, a - 3); j <= a; j += 1) P.put(cx + i, top + 18 - j, j === a ? '#ffffff' : G);
    }
    for (let t = 0; t <= 12; t += 1) { const ang = Math.PI * (t / 12); bulbs.push({ x: Math.round(cx - Math.cos(ang) * 34), y: Math.round(top + 12 - Math.sin(ang) * 8) }); }
    blitIcon(P, symbolRaster('etoile', S.band), cx - 8, top + 2);
    frame(P, win, 3, [mix(G, '#ffffff', 0.6), '#ffffff', G, G2], mix(G2, INK, 0.75));
    // La lueur sous le meuble (il flotte), les orbes du plateau.
    for (let y = yb - 14; y < yb - 2; y += 1) for (let x = x0 + 14; x < x0 + MW - 14; x += 1) {
      const d = Math.abs(x - cx) / (MW / 2 - 14) + (y - yb + 14) / 12;
      if (bayer(x, y) < 0.9 - d * 0.7) P.put(x, y, mix(G, '#ffffff', 0.2));
    }
    for (let i = 0; i < 5; i += 1) { P.rect(cx - 22 + i * 10, win.y + win.h + 10, 4, 4, i % 2 ? G : '#ffffff'); }
    P.rect(x0 + MW - 9, top + 70, 4, 6, G);
  }
  return { win, reelX, lever, bulbs };
}

// Pose un symbole (raster 16×16) dans la scène.
function blitIcon(P, ic, x, y) {
  for (let j = 0; j < ic.h; j += 1) for (let i = 0; i < ic.w; i += 1) {
    const k = (j * ic.w + i) * 4;
    if (ic.data[k + 3]) P.put(x + i, y + j, '#' + [ic.data[k], ic.data[k + 1], ic.data[k + 2]].map((c) => c.toString(16).padStart(2, '0')).join(''));
  }
}
// Le cadre de la fenêtre des rouleaux : `t` d'épaisseur, la rampe du métal, le fond.
function frame(P, win, t, M, inside) {
  for (let j = -t; j < win.h + t; j += 1) for (let i = -t; i < win.w + t; i += 1) {
    const inW = i >= 0 && j >= 0 && i < win.w && j < win.h;
    if (inW) { P.put(win.x + i, win.y + j, inside); continue; }
    const top = j < 0, left = i < 0;
    P.put(win.x + i, win.y + j, (top || left) ? (i + j < -t ? M[0] : M[1]) : M[2]);
  }
  // Les filets entre les rouleaux.
  for (const dx of [18, 38]) for (let j = 0; j < win.h; j += 1) { P.put(win.x + dx, win.y + j, M[3] || M[2]); P.put(win.x + dx + 1, win.y + j, M[2]); }
}

// ── LES ROULEAUX, à un instant ────────────────────────────────────────────────
// Peint la fenêtre dans `R` (le raster de la scène, recopié) : chaque rouleau montre
// sa bande à la position `pos[r]` (en cases, fractionnaire pendant qu'il tourne), le
// tambour s'assombrit en haut et en bas (il est rond), `blur[r]` étire les symboles.
export function paintReels(R, scene, reels, pos, band, blur = [0, 0, 0]) {
  const { win, reelX } = scene, C = SLOT_CELL;
  for (let r = 0; r < 3; r += 1) {
    const reel = reels[r], n = reel.length, x0 = reelX[r];
    for (let j = 0; j < win.h; j += 1) {
      // La case vue en (j) : pos est l'arrêt au centre de la rangée du milieu.
      const v = pos[r] + (j - win.h / 2) / C, cell = Math.floor(v + 0.5), fy = (v + 0.5 - cell) * C;
      const sym = reel[((cell % n) + n) % n];
      const ic = symbolRaster(sym, band);
      const shade = Math.abs(j - win.h / 2) / (win.h / 2);
      const bg = mix(scene.look === 'cosmic' ? '#f8fbff' : '#fbf6e8', '#5a5048', Math.max(0, shade - 0.35) * 0.9);
      for (let i = 0; i < C; i += 1) {
        let col = bg;
        const sy = Math.floor(fy) - 1, sx = i - 1;
        let hit = null;
        if (sx >= 0 && sx < SLOT_ICON) {
          for (let b = 0; b <= blur[r]; b += 1) {
            const yy = sy - b;
            if (yy >= 0 && yy < SLOT_ICON) { const k = (yy * SLOT_ICON + sx) * 4; if (ic.data[k + 3]) { hit = [ic.data[k], ic.data[k + 1], ic.data[k + 2]]; break; } }
          }
        }
        if (hit) col = mix('#' + hit.map((c) => c.toString(16).padStart(2, '0')).join(''), '#000000', Math.max(0, shade - 0.45) * 0.8);
        const k2 = ((win.y + j) * R.w + x0 + i) * 4, c = rgb(col);
        R.data[k2] = c[0]; R.data[k2 + 1] = c[1]; R.data[k2 + 2] = c[2]; R.data[k2 + 3] = 255;
      }
    }
  }
}

// ── LA ROUE ───────────────────────────────────────────────────────────────────
// Raster `size`×`size` de la roue tournée de `angle` (radians) : douze cases égales,
// couleurs de l'habit, étiquettes droites (lisibles) posées à leur place tournée.
// `labels[i]` : un texte court ('×20') ou un pictogramme ('coffres', 'tours', 'vol',
// 'jackpot').
export const WHEEL_SIZE = 96;
export function wheelRaster(band, segments, angle) {
  const look = slotsLook(band), S = styleHD(Math.max(5, band | 0)), n = segments.length;
  const R = makeRaster(0, 0, WHEEL_SIZE, WHEEL_SIZE), B = brush(R), c0 = WHEEL_SIZE / 2, r0 = c0 - 2;
  const pairs = look === 'fonte' ? [['#b8282e', '#f0e2c0'], ['#2a4a6a', '#f0e2c0']]
    : look === 'neon' ? [['#d8343a', '#2a1430'], ['#f0cf6a', '#3a5ab8']]
      : [[S.glow, mix(S.glow2, INK, 0.5)], ['#ffffff', S.glow2]];
  const rim = look === 'fonte' ? BRONZE : look === 'neon' ? SILVER : [ '#ffffff', mix(S.glow, '#ffffff', 0.4), S.glow, S.glow2];
  for (let y = 0; y < WHEEL_SIZE; y += 1) for (let x = 0; x < WHEEL_SIZE; x += 1) {
    const dx = x + 0.5 - c0, dy = y + 0.5 - c0, d = Math.hypot(dx, dy);
    if (d > r0) continue;
    if (d > r0 - 4) { B.put(x, y, dx + dy < 0 ? rim[1] : rim[2]); continue; }
    if (d < 6) { B.put(x, y, d < 3 ? rim[0] : rim[2]); continue; }
    let a = Math.atan2(dy, dx) + Math.PI / 2 - angle;          // 0 = en haut
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const i = Math.floor((a / (Math.PI * 2)) * n), fr = (a / (Math.PI * 2)) * n - i;
    const seg = segments[i];
    const special = seg === 'jackpot';
    let c = special ? (look === 'cosmic' ? '#ffffff' : '#141218') : pairs[i % 2][(i >> 1) % 2 ? 1 : 0];
    if (seg === 'jackpot' && look !== 'cosmic' && (x + y) % 3 === 0) c = '#3a2a10';
    if (fr < 0.03 || fr > 0.97) c = rim[2];                  // les rayons
    if (d > r0 - 6 && d <= r0 - 4) c = mix(c, '#000000', 0.25);
    B.put(x, y, c);
  }
  // Les clous du rebord (un par case) et les étiquettes.
  for (let i = 0; i < n; i += 1) {
    const am = angle + ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
    const ab = angle + (i / n) * Math.PI * 2 - Math.PI / 2;
    B.put(c0 + Math.cos(ab) * (r0 - 2), c0 + Math.sin(ab) * (r0 - 2), rim[0]);
    const lx = Math.round(c0 + Math.cos(am) * (r0 - 16)), ly = Math.round(c0 + Math.sin(am) * (r0 - 16));
    const seg = segments[i];
    const ink = seg === 'jackpot' ? (look === 'cosmic' ? S.glow2 : '#ffd84a') : '#ffffff';
    if (typeof seg === 'number') {
      const s = '×' + seg, tw = textWidth(s);
      // Un liseré sombre sous le texte : lisible sur toutes les cases.
      for (let j = -1; j <= 5; j += 1) for (let k = -1; k <= tw; k += 1) B.put(lx - (tw >> 1) + k, ly - 2 + j, INK);
      text(B, s, lx - (tw >> 1), ly - 2, ink);
    } else pictogram(B, seg, lx, ly, look, S);
  }
  return R;
}
// Les pictogrammes de la roue (7×7 environ, centrés).
function pictogram(B, seg, x, y, look, S) {
  const gold = look === 'cosmic' ? '#ffffff' : '#f2c94a';
  if (seg === 'coffres') {
    B.rect(x - 4, y - 1, 9, 5, '#8a5a2a'); B.rect(x - 4, y - 3, 9, 2, '#a8723a'); B.hline(x - 4, y - 1, 9, gold); B.put(x, y + 1, gold);
    for (const [i, j] of [[-5, -3], [5, -3], [-5, 4], [5, 4]]) B.put(x + i, y + j, INK);
    B.hline(x - 4, y - 4, 9, INK); B.hline(x - 4, y + 4, 9, INK); B.vline(x - 5, y - 3, 7, INK); B.vline(x + 5, y - 3, 7, INK);
  } else if (seg === 'tours') {
    const ic = symbolRaster('etoile', look === 'fonte' ? 5 : look === 'neon' ? 6 : S.band);
    for (let j = 0; j < SLOT_ICON; j += 2) for (let i = 0; i < SLOT_ICON; i += 2) {
      const k = (j * SLOT_ICON + i) * 4;
      if (ic.data[k + 3]) B.put(x - 4 + (i >> 1), y - 4 + (j >> 1), '#' + [ic.data[k], ic.data[k + 1], ic.data[k + 2]].map((c) => c.toString(16).padStart(2, '0')).join(''));
    }
  } else if (seg === 'vol') {
    // L'aile d'Icare : des pennes en éventail, cernées.
    const WING = ['....xxx', '..xxxxx', '.xxxxxx', 'xxxxxx.', 'xxxxx..', '.xxx...', '..x....'];
    WING.forEach((row, j) => [...row].forEach((v, i) => { if (v === 'x') B.put(x - 3 + i, y - 3 + j, j % 2 ? '#d8e0ec' : '#ffffff'); }));
    WING.forEach((row, j) => [...row].forEach((v, i) => {
      if (v !== 'x') return;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const r2 = WING[j + dj]; if (!r2 || r2[i + di] !== 'x') B.put(x - 3 + i + di, y - 3 + j + dj, INK); }
    }));
  } else if (seg === 'jackpot') {
    const s = 'JP', tw = textWidth(s);
    text(B, s, x - (tw >> 1), y - 2, look === 'cosmic' ? S.glow2 : '#ffd84a');
    B.put(x - 5, y - 4, '#ffffff'); B.put(x + 5, y + 3, '#ffffff');
  }
}

// ── LES COFFRES ───────────────────────────────────────────────────────────────
// Un coffre 22×18, fermé ou ouvert, dans la matière de l'âge.
export function chestRaster(band, open) {
  const look = slotsLook(band), S = styleHD(Math.max(5, band | 0));
  const R = makeRaster(0, 0, 22, 18), B = brush(R);
  const body = look === 'cosmic' ? [mix(S.glow, '#ffffff', 0.5), S.glow, S.glow2, mix(S.glow2, INK, 0.4)]
    : look === 'neon' ? ['#ff6a6a', '#d8343a', '#a02a30', '#681a1e'] : ['#c8945a', '#9a6a36', '#74502a', '#4a321a'];
  const band2 = look === 'cosmic' ? ['#ffffff', '#e8f0ff'] : look === 'neon' ? ['#ffffff', '#b4bcc6'] : ['#fff0b0', '#c89a3e'];
  // La caisse.
  for (let y = 8; y < 17; y += 1) for (let x = 1; x < 21; x += 1) B.put(x, y, x < 4 ? body[1] : x > 17 ? body[3] : y === 16 ? body[3] : body[2]);
  for (const x of [5, 16]) B.vline(x, 8, 9, band2[1]);
  B.hline(1, 8, 20, band2[0]);
  if (open) {
    // Le couvercle rabattu en arrière, l'intérieur qui brille.
    B.rect(2, 1, 18, 4, body[3]); B.hline(2, 1, 18, body[2]);
    for (let x = 3; x < 19; x += 1) B.put(x, 7, look === 'cosmic' ? '#ffffff' : '#ffe680');
    for (let x = 4; x < 18; x += 2) B.put(x, 6, look === 'cosmic' ? S.glow : '#f2c94a');
    B.rect(2, 5, 18, 1, body[3]);
  } else {
    // Le couvercle bombé, la serrure.
    for (let x = 1; x < 21; x += 1) { const a = Math.round(3 * Math.sqrt(Math.max(0, 1 - ((x - 10.5) / 10) ** 2))); for (let j = 0; j <= a + 2; j += 1) B.put(x, 7 - j, j > a ? body[0] : j === 0 ? body[3] : body[1]); }
    for (const x of [5, 16]) for (let j = 1; j < 7; j += 1) B.put(x, 7 - j, band2[1]);
    B.rect(9, 7, 4, 4, band2[0]); B.put(10, 9, INK); B.put(11, 9, INK);
  }
  outline(B, look === 'cosmic' ? S.glow2 : INK);
  return R;
}

// ── CE QUI BOUGE : le levier (`pull` 0 → 1 : la boule descend sous le pivot) et les
// ampoules du fronton (`t` en secondes : elles courent).
export function paintLive(R, scene, t, pull = 0, win = false) {
  const B = brush(R), { lever, bulbs, look } = scene;
  const ky = Math.round(lever.y0 + (lever.y1 + 14 - lever.y0) * pull);
  const rod = look === 'fonte' ? ['#fff0b0', '#c89a3e'] : look === 'neon' ? ['#ffffff', '#8a94a0'] : ['#ffffff', scene.glow];
  const ball = look === 'fonte' ? BRONZE : look === 'neon' ? RED : ['#ffffff', mix(scene.glow, '#ffffff', 0.4), scene.glow, mix(scene.glow, INK, 0.4)];
  const y0 = Math.min(ky, lever.y1), y1 = Math.max(ky, lever.y1);
  for (let y = y0; y <= y1; y += 1) { B.put(lever.x, y, rod[0]); B.put(lever.x + 1, y, rod[1]); }
  for (let j = -3; j <= 3; j += 1) for (let i = -3; i <= 3; i += 1) {
    const d = i * i + j * j;
    if (d > 10) continue;
    B.put(lever.x + i, ky + j, d > 6 ? ball[3] : i + j < -1 ? ball[0] : i + j < 2 ? ball[1] : ball[2]);
  }
  // Les ampoules : une sur trois allumée, la vague tourne ; toutes à la victoire.
  const step = Math.floor(t * 8);
  bulbs.forEach((b, i) => {
    const on = win ? (step + i) % 2 === 0 : (i + step) % 3 === 0;
    const c = on ? (look === 'cosmic' ? '#ffffff' : '#fff6c8') : (look === 'cosmic' ? scene.glow : '#8a6a2a');
    B.put(b.x, b.y, c);
    if (on && look !== 'fonte') { B.put(b.x + 1, b.y, mix(c, scene.glow, 0.5)); }
  });
}

// ── LES EMBLÈMES DES MISES (32×32) : un jeton, un rouleau de jetons, un lingot ──
export function stakeArtRaster(stakeId) {
  const R = makeRaster(0, 0, 32, 32), B = brush(R);
  const chip = (cx, cy, rx, ry, body, stripe) => {
    for (let j = -ry - 2; j <= ry + 2; j += 1) for (let i = -rx; i <= rx; i += 1) {
      const top = (i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1;
      const side = (i * i) / (rx * rx) + ((j - 2) * (j - 2)) / (ry * ry) <= 1 && j >= 0;
      if (!top && !side) continue;
      let c = top ? body[1] : body[3];
      if (top && (i * i) / (rx * rx) + (j * j) / (ry * ry) > 0.62) c = Math.floor((Math.atan2(j, i) + Math.PI) * 4) % 2 ? stripe : body[1];
      if (top && (i * i) / (rx * rx) + (j * j) / (ry * ry) < 0.25) c = body[0];
      if (!top && side && i % 3 === 0) c = stripe;
      B.put(cx + i, cy + j, c);
    }
  };
  const RD = ['#ff9a9a', '#d8343a', '#a02a30', '#681a1e'], BL = ['#a8c8ff', '#3a6ad8', '#2a4aa0', '#1a2a60'];
  if (stakeId === 'jeton') chip(16, 17, 11, 6, RD, '#fff6e0');
  else if (stakeId === 'rouleau') { for (let k = 4; k >= 0; k -= 1) chip(16, 9 + k * 3, 10, 5, k % 2 ? BL : RD, '#fff6e0'); }
  else {
    // Le lingot : un trapèze d'or, sa face, son reflet.
    for (let j = 0; j < 14; j += 1) {
      const inset = Math.round((13 - j) * 0.45);
      for (let i = 3 + inset; i < 29 - inset; i += 1) {
        const topFace = j < 5;
        B.put(i, 9 + j, topFace ? (i < 12 ? GOLD[0] : GOLD[1]) : (i < 9 + inset ? GOLD[1] : i > 23 - inset ? GOLD[3] : GOLD[2]));
      }
    }
    B.hline(10, 11, 6, '#ffffff');
  }
  outline(B, INK);
  return R;
}
