/**
 * PIXELS PERDUS — nettoyage à la main (par script) de l'art de la scène d'arrivée.
 * ---------------------------------------------------------------------------
 * Demande de Raph (2026-09-28), après le livre retiré du foyer : « améliorer les
 * design pour que ça fasse clean et pas des pixels perdus ». Même geste que pour
 * le livre : on REPEINT des pixels précis dans les PNG livrés, on ne regénère rien
 * (PixelLab est coupé, et une regénération rendrait de l'art neuf).
 *
 * Mesuré sur la scène du campement (bande 0), trois familles de pixels perdus :
 *
 * 1. LE FEU ANIMÉ du foyer (`storyteller-fire`, 7 images de 96×80). L'original
 *    STATIQUE (`storyteller-prop-fire`) est propre ; l'animation, elle, porte :
 *    · un BLOC rouge sombre derrière la flamme, coiffé d'un rebord gris
 *      parfaitement DROIT (18 px) qui dépasse au-dessus du disque de terre — un
 *      rectangle posé derrière un foyer rond ;
 *    · des ÉTINCELLES et des bouts de flamme DÉTACHÉS qui flottent au-dessus.
 *    → `camp-hearth-fire.png` = copie nettoyée (l'original des Conteurs reste
 *    intact, comme `camp-hearth.png` l'est de `storyteller-back.png`). Là où le
 *    bloc est retiré, on pose ce que l'original STATIQUE montre au même pixel (le
 *    disque, son bord), jamais une couleur inventée ; au-dessus du disque, rien.
 *    ⚠ Le sol du foyer a des TROUS exactement là où le feu peint (les deux calques
 *    sont complémentaires) : on vérifie qu'aucun pixel retiré n'ouvre un trou sur
 *    la terre à l'intérieur du disque.
 *
 * 2. LES CAILLOUX GRIS-BLEU des sentiers (`road-dirt-1..4`) et de la friche
 *    (`iso-dirt-1..4`) : 2 à 8 px d'une autre famille de teinte (gris, bleuté,
 *    vert-de-gris) sur une terre brune, plus leur ombre. À l'échelle du jeu ils se
 *    lisent comme des pixels égarés. Le grain brun de la terre, lui, RESTE : c'est
 *    la matière (la terre du campement, `ground-earth`, n'a aucun pixel hors
 *    famille et n'est pas touchée).
 *    → repeints EN PLACE. Un pixel prend la couleur la plus fréquente de ses
 *    voisins sains, JAMAIS une moyenne (leçon de derimTiles : la moyenne invente
 *    des couleurs hors palette). L'ALPHA N'EST JAMAIS ÉCRIT (pavage exact).
 *
 * Usage :
 *   node scripts/pixelsPerdus.mjs              # mesure seule, n'écrit rien
 *   node scripts/pixelsPerdus.mjs --apply      # écrit camp-hearth-fire.png + repeint les tuiles
 *   node scripts/pixelsPerdus.mjs --proof <d>  # planches avant/après dans <d>
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const PROOF = (() => { const i = argv.indexOf('--proof'); return i >= 0 ? argv[i + 1] : null; })();

const BLD = 'public/pixelart/agents/buildings';
const ISO = 'public/pixelart/iso';

const read = (p) => PNG.sync.read(fs.readFileSync(p));
const hexOf = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx / 255 };
}
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// ── 1. LE FEU ────────────────────────────────────────────────────────────────
const FW = 96, FH = 80;
// Rampe vive de la flamme (mesurée sur les 7 images) ; le rouge sombre n'est de la
// flamme que collé à du vif — c'est son liseré. Isolé, c'est le bloc.
const BRIGHT = new Set(['#ef2a0b', '#ff5312', '#c4180a', '#d37e45', '#ffbc4e', '#dfe08a', '#fff0c8', '#e9e4d6']);
const DARKRED = '#8c1206';
// Zone du bloc : le rectangle derrière la flamme et une marge au-dessus.
const ZONE = { x0: 32, x1: 61, y0: 16, y1: 28 };
// Une composante détachée n'est une étincelle que tout entière AU-DESSUS du disque.
const SPARK_MAX_Y = 24, SPARK_MAX_PX = 20;

function cleanFire() {
  const fire = read(path.join(BLD, 'storyteller-fire.png'));
  const prop = read(path.join(BLD, 'storyteller-prop-fire.png'));
  const ground = read(path.join(BLD, 'camp-hearth.png'));
  const N = Math.round(fire.width / FW);
  const propAt = (x, y) => { const i = (y * FW + x) * 4; return prop.data[i + 3] > 16 ? i : -1; };
  // Flamme de l'original = la même rampe que l'animation (le cœur blanc #fff0c8 et
  // le jaune pâle #dfe08a y compris : peu saturés, ils passaient pour du disque et
  // posaient un pixel blanc au bord de la flamme), plus tout rouge-orangé saturé.
  const propFlame = (i) => {
    const hx = hexOf(prop.data, i);
    if (BRIGHT.has(hx) || hx === DARKRED) return true;
    const c = hsv(prop.data[i], prop.data[i + 1], prop.data[i + 2]);
    return (c.h <= 50 || c.h >= 345) && c.s >= 0.55 && c.v >= 0.4;
  };
  // LE DISQUE DERRIÈRE LE FEU. Le sol du foyer est troué là où le feu peint ; ses
  // bords de trou, eux, montrent le disque à chaque rangée. D'où deux règles :
  //   · rangée sans disque à ±12 px (au-dessus de son bord) → RIEN, la terre du
  //     campement transparaît, comme autour du reste du disque ;
  //   · sinon, la couleur du disque : le pixel de l'original statique s'il en est
  //     une, sinon le plus proche de la rangée qui en est une. « Couleur du
  //     disque » = palette relevée sur le sol, juste à gauche et à droite du trou —
  //     une pierre claire ou une braise de la flamme d'origine n'y entre pas (1er
  //     essai : un pixel de pierre recopié au-dessus du disque, repéré à la loupe).
  const groundAt = (x, y) => { const i = (y * FW + x) * 4; return x >= 0 && x < FW && ground.data[i + 3] > 16 ? i : -1; };
  const discPal = new Set();
  for (let y = 23; y <= 31; y += 1) {
    for (const x of [31, 32, 33, 34, 35, 36, 57, 58, 59, 60, 61, 62]) {
      const i = groundAt(x, y);
      if (i >= 0) discPal.add(hexOf(ground.data, i));
    }
  }
  const rgbAt = (img, i) => [img.data[i], img.data[i + 1], img.data[i + 2]];
  const ref = (x, y) => {
    let inDisc = false;
    for (let d = 0; d <= 12 && !inDisc; d += 1) if (groundAt(x - d, y) >= 0 || groundAt(x + d, y) >= 0) inDisc = true;
    if (!inDisc) return null;
    const i = propAt(x, y);
    if (i >= 0 && !propFlame(i) && discPal.has(hexOf(prop.data, i))) return rgbAt(prop, i);
    for (let d = 1; d <= 14; d += 1) {
      for (const xx of [x - d, x + d]) {
        if (xx < 0 || xx >= FW) continue;
        const j = propAt(xx, y);
        if (j >= 0 && !propFlame(j) && discPal.has(hexOf(prop.data, j))) return rgbAt(prop, j);
        const g = groundAt(xx, y);
        if (g >= 0 && discPal.has(hexOf(ground.data, g))) return rgbAt(ground, g);
      }
    }
    return null;
  };
  const out = new PNG({ width: fire.width, height: fire.height });
  fire.data.copy(out.data);
  const stats = [];
  for (let k = 0; k < N; k += 1) {
    const at = (x, y) => ((y * fire.width) + k * FW + x) * 4;
    const op = (x, y) => x >= 0 && y >= 0 && x < FW && y < FH && out.data[at(x, y) + 3] > 16;
    const col = (x, y) => hexOf(out.data, at(x, y));
    const flamish = (x, y) => {
      const c = col(x, y);
      if (BRIGHT.has(c)) return true;
      if (c !== DARKRED) return false;
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => op(x + dx, y + dy) && BRIGHT.has(col(x + dx, y + dy)));
    };
    let bloc = 0, sparks = 0, patched = 0;
    // A. le bloc → le disque de l'original statique (ou rien au-dessus du disque)
    const repl = [];
    for (let y = ZONE.y0; y <= ZONE.y1; y += 1) {
      for (let x = ZONE.x0; x <= ZONE.x1; x += 1) {
        if (!op(x, y) || flamish(x, y)) continue;
        repl.push([x, y, ref(x, y)]);
      }
    }
    for (const [x, y, c] of repl) {
      const i = at(x, y);
      if (!c) out.data[i + 3] = 0;
      else { out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255; }
      bloc += 1;
    }
    // B. étincelles : composantes détachées, toutes au-dessus du disque, en flamme
    const seen = new Uint8Array(FW * FH);
    for (let y = 0; y < FH; y += 1) {
      for (let x = 0; x < FW; x += 1) {
        if (!op(x, y) || seen[y * FW + x]) continue;
        const comp = [], st = [[x, y]];
        seen[y * FW + x] = 1;
        while (st.length) {
          const [cx, cy] = st.pop();
          comp.push([cx, cy]);
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const nx = cx + dx, ny = cy + dy;
              if ((dx || dy) && op(nx, ny) && !seen[ny * FW + nx]) { seen[ny * FW + nx] = 1; st.push([nx, ny]); }
            }
          }
        }
        const allFlame = comp.every(([cx, cy]) => BRIGHT.has(col(cx, cy)) || col(cx, cy) === DARKRED);
        const high = comp.every(([, cy]) => cy <= SPARK_MAX_Y);
        if (allFlame && high && comp.length <= SPARK_MAX_PX) {
          for (const [cx, cy] of comp) { out.data[at(cx, cy) + 3] = 0; sparks += 1; }
        }
      }
    }
    // C. aucun trou sur la terre à l'intérieur du disque
    for (let y = 0; y < FH; y += 1) {
      for (let x = 0; x < FW; x += 1) {
        const i = at(x, y);
        if (out.data[i + 3] > 16 || fire.data[i + 3] <= 16) continue;   // pas retiré
        if (ground.data[(y * FW + x) * 4 + 3] > 16) continue;          // le sol couvre
        const c = ref(x, y);
        if (!c) continue;                                             // hors du disque
        out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255;
        patched += 1;
      }
    }
    stats.push({ k, bloc, sparks, patched });
  }
  return { fire, out, ground, stats };
}

// ── 2. LES CAILLOUX ──────────────────────────────────────────────────────────
// Un pixel est « gris » quand sa saturation tombe sous GREY_K × celle de la terre
// d'alentour. 0,45 laissait passer les cailloux gris-beige de la friche (s 0,23
// sur une terre à 0,50) ; 0,55 les prend, et n'ajoute QUE des tons de caillou
// (gris-mauve, gris-beige, gris sombre : 5 à 7 px par tuile) — le grain brun
// n'est pas touché et la terre du campement (ground-earth) reste à 0, mesuré.
const GREY_K = 0.55;
function pebbles(png) {
  const W = png.width, H = png.height, d = png.data;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H || d[(y * W + x) * 4 + 3] <= 16 ? -1 : (y * W + x) * 4);
  const flag = new Uint8Array(W * H);
  const medOf = (x, y, skip) => {
    const nb = [];
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (!dx && !dy) continue;
        const j = at(x + dx, y + dy);
        if (j >= 0 && !(skip && skip[(y + dy) * W + x + dx])) nb.push(j);
      }
    }
    if (nb.length < 8) return null;
    return [0, 1, 2].map((c) => nb.map((j) => d[j + c]).sort((a, b) => a - b)[nb.length >> 1]);
  };
  // pixels hors famille : saturation effondrée (gris) sur fond saturé, ou teinte à > 60°
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = at(x, y);
      if (i < 0) continue;
      const m = medOf(x, y, null);
      if (!m) continue;
      const a = hsv(d[i], d[i + 1], d[i + 2]), b = hsv(...m);
      const dh = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
      if ((b.s > 0.25 && a.s < b.s * GREY_K) || (a.s > 0.15 && b.s > 0.2 && dh > 60)) flag[y * W + x] = 1;
    }
  }
  // …et leur OMBRE : un voisin nettement plus sombre que la terre d'alentour
  const seed = flag.slice();
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (!seed[y * W + x]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const j = at(x + dx, y + dy);
          if (j < 0 || flag[(y + dy) * W + x + dx]) continue;
          const m = medOf(x + dx, y + dy, seed);
          if (m && lum(d[j], d[j + 1], d[j + 2]) < lum(...m) * 0.72) flag[(y + dy) * W + x + dx] = 1;
        }
      }
    }
  }
  let n = 0;
  for (let i = 0; i < flag.length; i += 1) n += flag[i];
  // Repeinte : couleur la PLUS FRÉQUENTE des voisins sains (8-voisinage), de
  // l'extérieur vers l'intérieur de chaque caillou. Jamais une moyenne.
  let left = n, guard = 0;
  while (left > 0 && guard < 20) {
    guard += 1;
    const writes = [];
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (!flag[y * W + x]) continue;
        const count = new Map();
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const j = at(x + dx, y + dy);
            if (j < 0 || flag[(y + dy) * W + x + dx]) continue;
            const key = d[j] + ',' + d[j + 1] + ',' + d[j + 2];
            count.set(key, (count.get(key) || 0) + 1);
          }
        }
        let best = null, bestN = 0;
        for (const [key, c] of count) if (c > bestN) { best = key; bestN = c; }
        if (best && [...count.values()].reduce((a, b) => a + b, 0) >= 3) writes.push([x, y, best.split(',').map(Number)]);
      }
    }
    if (!writes.length) break;
    for (const [x, y, c] of writes) {
      const i = (y * W + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];     // alpha jamais écrit
      flag[y * W + x] = 0;
      left -= 1;
    }
  }
  return { flagged: n, left };
}

const TILES = [1, 2, 3, 4].flatMap((v) => [`road-dirt-${v}`, `iso-dirt-${v}`]);

// ── Planches de preuve ───────────────────────────────────────────────────────
function blitScaled(dst, src, sx0, sy0, sw, sh, dx0, dy0, S) {
  for (let y = 0; y < sh * S; y += 1) {
    for (let x = 0; x < sw * S; x += 1) {
      const si = ((sy0 + Math.floor(y / S)) * src.width + sx0 + Math.floor(x / S)) * 4;
      const di = ((dy0 + y) * dst.width + dx0 + x) * 4;
      const a = src.data[si + 3] / 255;
      for (let c = 0; c < 3; c += 1) dst.data[di + c] = Math.round(src.data[si + c] * a + dst.data[di + c] * (1 - a));
      dst.data[di + 3] = 255;
    }
  }
}

// ── Exécution ────────────────────────────────────────────────────────────────
const fireRes = cleanFire();
console.log('FEU (storyteller-fire → camp-hearth-fire)');
for (const s of fireRes.stats) console.log(`  image ${s.k} : bloc ${s.bloc} px · étincelles ${s.sparks} px · trous rebouchés ${s.patched} px`);

console.log('CAILLOUX (repeints en place)');
const tileRes = [];
for (const key of TILES) {
  const p = path.join(ISO, key + '.png');
  const before = read(p);
  const after = read(p);
  const r = pebbles(after);
  let changed = 0, alphaMoved = 0;
  for (let i = 0; i < before.data.length; i += 4) {
    if (before.data[i + 3] !== after.data[i + 3]) alphaMoved += 1;
    if (before.data[i] !== after.data[i] || before.data[i + 1] !== after.data[i + 1] || before.data[i + 2] !== after.data[i + 2]) changed += 1;
  }
  console.log(`  ${key.padEnd(12)} signalés ${String(r.flagged).padStart(3)} · repeints ${String(changed).padStart(3)} · restants ${r.left} · alpha touché ${alphaMoved}`);
  tileRes.push({ key, p, before, after, changed });
}

if (APPLY) {
  fs.writeFileSync(path.join(BLD, 'camp-hearth-fire.png'), PNG.sync.write(fireRes.out));
  // Seules les tuiles réellement repeintes sont réécrites : ré-encoder une tuile
  // intacte changerait ses octets sans changer un pixel (bruit dans git).
  const touched = tileRes.filter((t) => t.changed > 0);
  for (const t of touched) fs.writeFileSync(t.p, PNG.sync.write(t.after));
  console.log('\nÉcrit : camp-hearth-fire.png + ' + touched.length + ' tuiles.');
} else {
  console.log('\nRien écrit (ajouter --apply).');
}

if (PROOF) {
  fs.mkdirSync(PROOF, { recursive: true });
  // Feu : les 7 images composées sur le sol du foyer, avant (haut) / après (bas).
  const S = 4, G = 4, TERRE = [187, 135, 82];
  const W = fireRes.stats.length * (FW * S + G), H = FH * S * 2 + G;
  const sheet = new PNG({ width: W, height: H });
  for (let i = 0; i < sheet.data.length; i += 4) { sheet.data[i] = TERRE[0]; sheet.data[i + 1] = TERRE[1]; sheet.data[i + 2] = TERRE[2]; sheet.data[i + 3] = 255; }
  fireRes.stats.forEach(({ k }) => {
    for (const [row, strip] of [[0, fireRes.fire], [1, fireRes.out]]) {
      const dx = k * (FW * S + G), dy = row * (FH * S + G);
      blitScaled(sheet, fireRes.ground, 0, 0, FW, FH, dx, dy, S);
      blitScaled(sheet, strip, k * FW, 0, FW, FH, dx, dy, S);
    }
  });
  fs.writeFileSync(path.join(PROOF, 'feu-avant-apres.png'), PNG.sync.write(sheet));
  // Tuiles : un pan 4×4 de chaque clé, avant / après, à ×3.
  const PS = 3;
  for (const t of tileRes) {
    const tw = t.before.width, th = t.before.height;
    const panW = tw * 4, panH = th * 4;
    const out = new PNG({ width: panW * PS * 2 + 8, height: panH * PS });
    for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 60; out.data[i + 1] = 60; out.data[i + 2] = 60; out.data[i + 3] = 255; }
    for (const [col, img] of [[0, t.before], [1, t.after]]) {
      for (let gy = 0; gy < 4; gy += 1) {
        for (let gx = 0; gx < 4; gx += 1) {
          const px = Math.round((gx - gy) * tw / 2 + panW / 2 - tw / 2), py = Math.round((gx + gy) * th / 2);
          blitScaled(out, img, 0, 0, tw, th, col * (panW * PS + 8) + px * PS, py * PS, PS);
        }
      }
    }
    fs.writeFileSync(path.join(PROOF, `${t.key}-avant-apres.png`), PNG.sync.write(out));
  }
  console.log('Planches écrites dans', PROOF);
}
