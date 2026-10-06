// ============================================================================
// plazaBrazierAnim.mjs — les BRASEROS des places brûlent (bande animée).
//
//   POURQUOI. Les braseros du parvis (antique, médiéval, cosmique) étaient un
//   sprite FIXE : la flamme ne bougeait pas (Raph, 2026-10-04 : « les braseros
//   des places ne sont pas animés »). Et celle de l'antique avait été rabattue
//   sur les rampes bois/peau par le remap du 2026-07-01 (#b06a48, #c98a68,
//   braises en #f2c2a3) : un feu couleur chair, le « feu pâlot » de reflame.mjs.
//
//   CE QUE FAIT LE SCRIPT, par ère, sur le canvas EXACT du statique (32×32) :
//     1. GOMME la flamme peinte (pixels de feu au-dessus de la vasque) et, dans
//        la vasque, repose des braises sombres là où elle était ;
//     2. DESSINE une flamme de langues (3 à 5), dont la hauteur et le balancement
//        bouclent sur N images — une fonction du temps, aucun tirage : relancer
//        rend les mêmes PNG ;
//     3. la COLORE sur public/pixelart/fire-ramp.json par PROFONDEUR (bord rouge,
//        puis vermillon, orange, cœur d'or, cœur blanc tout en bas) — même
//        doctrine qu'ancestralCultFire.mjs ;
//     4. écrit la bande anim/brazier-<ère>.png (N images), la ZONE animée
//        anim/zone/brazier-<ère>.png (ce qui a le droit de bouger, lue par la
//        garde isoPlaza.test.js) et le STATIQUE, repli sans animation, posé à mi-
//        chemin entre deux images (la garde refuse une image qui rejoue le
//        statique) et gardant la boîte d'encre d'origine (l'ancrage en vient).
//   Le cosmique n'a pas de feu : c'est un orbe sur colonne. Sa lumière TOURNE
//   (un reflet fait le tour de la sphère), la colonne reste figée.
//
//   Lancer :  node scripts/plazaBrazierAnim.mjs [--dry] [--ere antique]
//   Planche : .preview-shots/braseros.png (statique + images, ×10). C'est elle
//   qui se juge.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { hash, tongueMask, flameDepth, flameTop, flameRampIndex } from './lib/fire.mjs';

// Dernier commit où les statiques sont les sprites d'ORIGINE (avant ce script).
const SOURCE_REV = 'af920cd1';
const DIR = 'public/pixelart/iso/plaza';
const ANIM = path.join(DIR, 'anim');
const ZONE = path.join(ANIM, 'zone');
const SHEET = '.preview-shots/braseros.png';
const DRY = process.argv.includes('--dry');
const ONLY = (() => {
  const i = process.argv.indexOf('--ere');
  if (i < 0) return null;
  const v = process.argv[i + 1];
  // `--ere` sans valeur : refuser plutôt que tout réécrire (même garde que sceneLive --cle).
  if (!v || v.startsWith('--')) { console.error('--ere attend une ère : --ere antique'); process.exit(1); }
  return v;
})();

const RAMP = JSON.parse(fs.readFileSync('public/pixelart/fire-ramp.json', 'utf8')).steps
  .map((s) => [parseInt(s.hex.slice(1, 3), 16), parseInt(s.hex.slice(3, 5), 16), parseInt(s.hex.slice(5, 7), 16)]);
// 0 braise-éteinte · 1 braise · 2 rouge-profond · 3 rouge-feu · 4 vermillon ·
// 5 orange-ardent · 6 or-de-cœur · 7 cœur-blanc

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const key = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');

// ── Recettes par ère ────────────────────────────────────────────────────────
// gomme   : rangées ≤ tipY → toute l'encre est flamme (transparent) ; rangées
//           tipY < y ≤ mouthY → seules les teintes `fire` sont de la flamme, et
//           deviennent une braise (`coal`, alternée) ;
// embers  : teintes de la vasque qui sont des BRAISES (repeintes, scintillent) ;
// cx/base : pied de la flamme (px d'art ; cx au centre d'un pixel = x + 0.5) ;
// tongues : { dx, h, w, ph } — décalage, hauteur, demi-largeur au pied, phase ;
// top     : rangée la plus haute permise (garde la boîte d'encre d'origine).
const RECIPES = {
  antique: {
    n: 8, tipY: 5, mouthY: 11, top: 1,
    fire: [],
    coal: ['#4a2f22', '#2a1c16'],
    embers: ['#f2c2a3', '#dfe08a', '#e9e4d6', '#ecc6a8', '#fbfaf4'],
    emberRows: [7, 12],
    cx: 15.5, base: 11, whiteW: 1.5,
    tongues: [
      { dx: 0, h: 9.6, w: 2.7, ph: 0 },
      { dx: -2.2, h: 5.4, w: 1.7, ph: 2.2 },
      { dx: 2.3, h: 6.6, w: 1.7, ph: 4.1 },
    ],
    sparks: 2,
  },
  medieval: {
    n: 8, tipY: 3, mouthY: 9, top: 1,
    fire: ['#fbbd46', '#ee5803', '#f8770a', '#fded9b', '#fca723', '#fdd26b', '#b55208', '#8b3e11', '#cdb570', '#bc8541', '#c47420', '#a16825', '#895018'],
    coal: ['#31211a', '#462c1f', '#5b2f12'],
    embers: [],
    emberRows: [0, 0],
    cx: 16, base: 9, whiteW: 1.5,
    tongues: [
      { dx: 0, h: 8.4, w: 3.4, ph: 0 },
      { dx: -3.4, h: 6.0, w: 2.4, ph: 2.5 },
      { dx: 3.4, h: 6.6, w: 2.4, ph: 4.4 },
      { dx: -5.6, h: 3.2, w: 1.4, ph: 1.1 },
      { dx: 5.6, h: 3.6, w: 1.4, ph: 3.3 },
    ],
    sparks: 2,
  },
  cosmic: { n: 12, orb: { cx: 15.5, cy: 4.5, r: 3.8, rows: [1, 8] } },
};

// ── Une flamme de langues à l'instant u ∈ [0,1) (boucle) ───────────────────
// Le dessin (langues, profondeur par érosion, couleur par profondeur, hash) vit
// dans scripts/lib/fire.mjs, partagé avec les feux peints de sceneLive.mjs. Ici :
// souffle ±16 %, balancement de 1,1 px.
const flameMask = (R, u, W, H) => tongueMask(W, H, R.tongues, { cx: R.cx, base: R.base, top: R.top, breath: 0.16, sway: 1.1 }, u);

function fireFrame(R, src, u, fi) {
  const { width: W, height: H } = src;
  const out = Buffer.from(src.data);
  const fire = new Set(R.fire.map((s) => s.toLowerCase()));
  const embers = new Set(R.embers.map((s) => s.toLowerCase()));
  const coal = R.coal.map(hex);
  const put = (i, c, a = 255) => { out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = a; };
  // 1. Gomme.
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const i = (y * W + x) * 4;
    if (src.data[i + 3] < 16) continue;
    if (y <= R.tipY) { out[i + 3] = 0; continue; }
    if (y <= R.mouthY && fire.has(key(src.data, i))) put(i, coal[(x + y) % coal.length]);
    // Braises de la vasque : niveau tiré de la clarté d'origine, ±1 cran par image.
    if (embers.has(key(src.data, i)) && y >= R.emberRows[0] && y <= R.emberRows[1]) {
      const l = (src.data[i] + src.data[i + 1] + src.data[i + 2]) / 765;
      const lv = Math.max(1, Math.min(5, Math.round(1 + l * 4 + (hash(x, y, fi) < 0.35 ? -1 : hash(x, y, fi + 9) < 0.3 ? 1 : 0))));
      put(i, RAMP[lv]);
    }
  }
  // 2-3. Flamme colorée par profondeur.
  const m = flameMask(R, u, W, H);
  const d = flameDepth(m, W, H, R.base);
  const yTop = flameTop(m, W, R.base);
  const span = Math.max(1, R.base - yTop);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (!m[y * W + x]) continue;
    put((y * W + x) * 4, RAMP[flameRampIndex(d[y * W + x], (R.base - y) / span, Math.abs(x + 0.5 - R.cx) <= R.whiteW)]);
  }
  // Étincelles : un pixel qui monte au-dessus des langues et s'éteint en trois
  // temps (or → orange → rouge). Phase propre à chacune, bouclée sur N.
  for (let s = 0; s < (R.sparks | 0); s += 1) {
    const life = ((fi + s * Math.round(R.n / 2) + 1) % R.n);
    if (life > 2) continue;
    const sx = Math.round(R.cx - 0.5 + (s ? 1.5 : -1.5) + (life === 2 ? (s ? 1 : -1) : 0));
    const sy = yTop - 1 - life;
    if (sy < R.top || sy >= H || sx < 0 || sx >= W) continue;
    const i = (sy * W + sx) * 4;
    if (out[i + 3] > 16 && !m[sy * W + sx]) continue;   // jamais sur la vasque
    put(i, RAMP[[6, 5, 3][life]]);
  }
  return out;
}

// ── L'orbe cosmique : un reflet fait le tour de la sphère ────────────────────
const ORB_RAMP = ['#534434', '#7b5c2b', '#a57f35', '#cf913b', '#fabe53', '#f3d282', '#fff4d6'].map(hex);
function orbFrame(R, src, u) {
  const { width: W } = src;
  const out = Buffer.from(src.data);
  const O = R.orb;
  const th = u * Math.PI * 2;
  for (let y = O.rows[0]; y <= O.rows[1]; y += 1) for (let x = 0; x < W; x += 1) {
    const i = (y * W + x) * 4;
    if (src.data[i + 3] < 16) continue;
    const dx = x + 0.5 - O.cx, dy = y + 0.5 - O.cy;
    if (Math.hypot(dx, dy) > O.r) continue;
    const l = (src.data[i] * 0.3 + src.data[i + 1] * 0.59 + src.data[i + 2] * 0.11) / 255;
    if (l < 0.42) continue;                            // contour et monture : figés
    // Rang d'origine sur la rampe de l'orbe, puis ±1 cran selon l'angle au reflet.
    let r0 = 0, best = 1e9;
    for (let k = 0; k < ORB_RAMP.length; k += 1) {
      const c = ORB_RAMP[k];
      const e = (c[0] - src.data[i]) ** 2 + (c[1] - src.data[i + 1]) ** 2 + (c[2] - src.data[i + 2]) ** 2;
      if (e < best) { best = e; r0 = k; }
    }
    const a = Math.atan2(dy, dx);
    const lift = Math.cos(a - th) * Math.min(1, Math.hypot(dx, dy) / 2);
    const r = Math.max(2, Math.min(ORB_RAMP.length - 1, r0 + Math.round(lift * 1.6)));
    const c = ORB_RAMP[r];
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
  }
  return out;
}

function inkBox(data, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (data[(y * W + x) * 4 + 3] > 16) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return `${x0},${y0} ${x1 - x0 + 1}×${y1 - y0 + 1}`;
}

// ── Production ──────────────────────────────────────────────────────────────
const sheetRows = [];
for (const era of Object.keys(RECIPES)) {
  if (ONLY && era !== ONLY) continue;
  const R = RECIPES[era];
  const fStat = path.join(DIR, `brazier-${era}.png`);
  // Source = l'ORIGINAL, lu dans git à SOURCE_REV : le statique est réécrit par
  // ce script, relancer ne doit jamais repartir de sa propre sortie.
  const src = PNG.sync.read(execSync(`git show ${SOURCE_REV}:${fStat.replace(/\\/g, '/')}`, { maxBuffer: 1 << 24 }));
  const { width: W, height: H } = src;
  const make = (u, fi) => (R.orb ? orbFrame(R, src, u) : fireFrame(R, src, u, fi));
  const frames = [];
  for (let f = 0; f < R.n; f += 1) frames.push(make(f / R.n, f));
  // Statique : à mi-chemin entre deux images (ni l'une ni l'autre).
  const stat = make(0.5 / R.n + 0.25, R.n + 3);
  const zone = new PNG({ width: W, height: H });
  let moving = 0;
  for (let p = 0; p < W * H; p += 1) {
    const i = p * 4;
    const ref = stat;
    let mv = false;
    for (const fr of frames) { for (let c = 0; c < 4; c += 1) if (fr[i + c] !== ref[i + c]) { mv = true; break; } if (mv) break; }
    if (mv) { zone.data[i] = 255; zone.data[i + 3] = 255; moving += 1; }
  }
  const strip = new PNG({ width: W * R.n, height: H });
  frames.forEach((fr, f) => {
    for (let y = 0; y < H; y += 1) fr.copy(strip.data, (y * W * R.n + f * W) * 4, y * W * 4, (y + 1) * W * 4);
  });
  const st = new PNG({ width: W, height: H });
  stat.copy(st.data);
  const same = frames.filter((fr) => fr.equals(stat)).length;
  console.log(`${era} : ${R.n} images, ${moving} px animés, encre ${inkBox(src.data, W, H)} → ${inkBox(stat, W, H)}${same ? `, ⚠ ${same} image(s) = statique` : ''}`);
  sheetRows.push([src.data, stat, ...frames]);
  if (DRY) continue;
  fs.mkdirSync(ZONE, { recursive: true });
  fs.writeFileSync(path.join(ANIM, `brazier-${era}.png`), PNG.sync.write(strip));
  fs.writeFileSync(path.join(ZONE, `brazier-${era}.png`), PNG.sync.write(zone));
  fs.writeFileSync(fStat, PNG.sync.write(st));
}

// Planche : original | statique | images…, ×10 sur fond d'herbe sombre.
if (sheetRows.length) {
  const S = 10, W = 32, cols = Math.max(...sheetRows.map((r) => r.length));
  const sh = new PNG({ width: cols * (W * S + 6), height: sheetRows.length * (W * S + 6) });
  for (let i = 0; i < sh.data.length; i += 4) { sh.data[i] = 54; sh.data[i + 1] = 64; sh.data[i + 2] = 58; sh.data[i + 3] = 255; }
  sheetRows.forEach((row, r) => row.forEach((d, c) => {
    for (let y = 0; y < W; y += 1) for (let x = 0; x < W; x += 1) {
      const s = (y * W + x) * 4;
      if (d[s + 3] < 16) continue;
      for (let yy = 0; yy < S; yy += 1) for (let xx = 0; xx < S; xx += 1) {
        const o = ((r * (W * S + 6) + y * S + yy) * sh.width + c * (W * S + 6) + x * S + xx) * 4;
        sh.data[o] = d[s]; sh.data[o + 1] = d[s + 1]; sh.data[o + 2] = d[s + 2]; sh.data[o + 3] = 255;
      }
    }
  }));
  fs.mkdirSync(path.dirname(SHEET), { recursive: true });
  fs.writeFileSync(SHEET, PNG.sync.write(sh));
  console.log('planche :', SHEET);
}
