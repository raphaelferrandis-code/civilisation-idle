// reflame.mjs — repeint les FLAMMES d'un sprite sur la rampe « rouge feu ».
//
//   POURQUOI CE SCRIPT EXISTE. Le 2026-07-01, `remapPalette.mjs --dir
//   public/pixelart/agents` a rabattu tous les sprites sur le coeur de la palette
//   maitre pour tuer le jaune. Le coeur ne contient AUCUN rouge sature : les feux
//   des scenes moteur (forge, conteurs, culte, tour de guet) et les torches des
//   emeutiers sont donc partis sur les rampes bois/argile/PEAU. Mesure : la flamme
//   de la tour de guet etait peinte en #f2c2a3 (skin-lit) et #d37e45 — un feu
//   couleur chair. C'est ca, « le feu palot ».
//
//   Le remap est un outil de PIGMENT ; une flamme est une SOURCE. Elle a donc sa
//   rampe a part (public/pixelart/fire-ramp.json), et ce script est le seul chemin
//   pour la poser. La garde src/game/map/__tests__/flameHue.test.js relit les PNG
//   et refuse tout feu delave : rejouer le remap sur ces sprites casse le test.
//
//   Lancer :
//     node scripts/reflame.mjs <f.png> --mask all                       (strip 100 % feu)
//     node scripts/reflame.mjs <f.png> --mask motion --band 96x80x7 --core 0.48,0.44
//     node scripts/reflame.mjs <f.png> --mask box --box x0,y0,x1,y1
//     node scripts/reflame.mjs <f.png> --mask colors --colors "#dfe08a,#f2c2a3" [--box …]
//
//   • --mask all|motion|box|colors|tip  comment on DESIGNE les pixels de flamme.
//        motion  : dans une bande animee le batiment est FIGE et seul le feu bouge
//                  (meme mesure que flameGlow.test.js) → on prend la plus grosse
//                  composante 8-connexe de pixels mouvants proche de --core. La
//                  silhouette du sprite « respire » d'un pixel sur ces bandes
//                  PixelLab : sans le filtre par composante, le bord du toit
//                  passerait au rouge lui aussi.
//        tip     : torche d'emeutier. Le masque par TEINTE est ici un piege — la
//                  flamme delavee partage #f2c2a3 avec la PEAU des personnages, et
//                  8 directions × 5 eres × 2 genres interdisent une boite a la main.
//                  On prend donc, frame par frame, la composante 8-connexe de
//                  pixels CHAUDS ET CLAIRS qui contient le pixel candidat le plus
//                  HAUT : la torche est toujours levee au-dessus de la tete.
//   • --core fx,fy   foyer en fraction de frame (mask motion) — cf. ANIM_FIRE_CORES.
//   • --band WxHxN   geometrie d'une bande animee (frame w, frame h, nb de frames).
//   • --box x0,y0,x1,y1  rectangle INCLUSIF, en px du PNG (bande : coordonnees
//                  DANS la frame, appliquees a toutes les frames).
//   • --colors "#a,#b"   restreint aux teintes listees (souvent + --box).
//   • --keep "#a,#b"     teintes JAMAIS repeintes meme dans le masque (buches,
//                  suie, pierres du foyer : elles ne brulent pas, elles noircissent).
//   • --grow N     N passes de dilatation, limitees aux pixels dont la teinte est
//                  DEJA dans le masque : rattrape la base figee d'une flamme sans
//                  deborder sur le mur (verifier a l'oeil, --sheet).
//   • --lo / --hi  bornes utilisees de la rampe (0..1). --hi 0.85 = pas de coeur
//                  blanc (petits feux) ; --hi 1 = coeur incandescent (braseros).
//   • --gamma G    courbe de repartition ; > 1 pousse la masse vers le rouge.
//   • --dry        rapport seul. --sheet out.png : planche avant/apres zoomee.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const RAMP = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'pixelart', 'fire-ramp.json'), 'utf8'));
const STEPS = RAMP.steps.map((s) => [
  parseInt(s.hex.slice(1, 3), 16), parseInt(s.hex.slice(3, 5), 16), parseInt(s.hex.slice(5, 7), 16),
]);

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const FILE = argv.find((a) => !a.startsWith('--') && a.endsWith('.png'));
if (!FILE) { console.error('usage : node scripts/reflame.mjs <f.png> --mask all|motion|box|colors [...]'); process.exit(1); }
const MODE = opt('--mask', 'all');
const DRY = flag('--dry');
const SHEET = opt('--sheet', null);
const LO = parseFloat(opt('--lo', '0'));
const HI = parseFloat(opt('--hi', '1'));
const GAMMA = parseFloat(opt('--gamma', '1'));
const GROW = parseInt(opt('--grow', '0'), 10);
const hexList = (s) => (s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const COLORS = new Set(hexList(opt('--colors', '')));
const KEEP = new Set(hexList(opt('--keep', '')));
const KEY = new Set(hexList(opt('--blob-key', '')));
const BOX = (() => { const v = opt('--box', null); return v ? v.split(',').map(Number) : null; })();
const BAND_ARG = opt('--band', null);
const CORE = (() => { const v = opt('--core', null); return v ? v.split(',').map(Number) : [0.5, 0.5]; })();

const png = PNG.sync.read(fs.readFileSync(FILE));
const { width: W, height: H, data } = png;
// --band auto : une bande de marche est carree frame par frame (largeur = n × hauteur).
const BAND = (() => {
  if (!BAND_ARG) return null;
  if (BAND_ARG === 'auto') {
    if (W % H !== 0) { console.error(`--band auto : ${W}x${H} n'est pas un multiple de frames carrees`); process.exit(1); }
    return { fw: H, fh: H, frames: W / H };
  }
  const m = /^(\d+)x(\d+)x(\d+)$/.exec(BAND_ARG);
  if (!m) { console.error('--band attend WxHxN ou auto'); process.exit(1); }
  return { fw: +m[1], fh: +m[2], frames: +m[3] };
})();
const before = Buffer.from(data);
const hexOf = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const at = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
const inBox = (x, y) => {
  if (!BOX) return true;
  const fx = BAND ? x % BAND.fw : x;                    // bande : le rectangle vaut DANS la frame
  return fx >= BOX[0] && fx <= BOX[2] && y >= BOX[1] && y <= BOX[3];
};

/* ---- masque -------------------------------------------------------------- */
const mask = new Uint8Array(W * H);
if (MODE === 'all' || MODE === 'box' || MODE === 'colors') {
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const [r, g, b, a] = at(x, y);
    if (a < 128 || !inBox(x, y)) continue;
    if (COLORS.size && !COLORS.has(hexOf(r, g, b))) continue;
    mask[y * W + x] = 1;
  }
} else if (MODE === 'motion') {
  if (!BAND) { console.error('--mask motion exige --band WxHxN'); process.exit(1); }
  const { fw, fh, frames } = BAND;
  const px = (f, x, y) => { const i = ((y * W) + (f * fw + x)) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  const moving = new Uint8Array(fw * fh);
  for (let y = 0; y < fh; y += 1) for (let x = 0; x < fw; x += 1) {
    const a = px(0, x, y);
    for (let f = 1; f < frames; f += 1) {
      const b = px(f, x, y);
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]) > 12) { moving[y * fw + x] = 1; break; }
    }
  }
  // composantes 8-connexes ; on garde celle qui contient/serre le foyer mesure.
  const lab = new Int32Array(fw * fh).fill(-1);
  const comps = [];
  for (let y = 0; y < fh; y += 1) for (let x = 0; x < fw; x += 1) {
    if (!moving[y * fw + x] || lab[y * fw + x] >= 0) continue;
    const id = comps.length, st = [[x, y]]; lab[y * fw + x] = id;
    let n = 0, sx = 0, sy = 0;
    while (st.length) {
      const [cx, cy] = st.pop(); n += 1; sx += cx; sy += cy;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= fw || ny >= fh || !moving[ny * fw + nx] || lab[ny * fw + nx] >= 0) continue;
        lab[ny * fw + nx] = id; st.push([nx, ny]);
      }
    }
    comps.push({ id, n, cx: sx / n, cy: sy / n });
  }
  const kx = CORE[0] * fw, ky = CORE[1] * fh;
  let best = null;
  for (const c of comps) {
    if (c.n < 20) continue;
    const d = Math.hypot(c.cx - kx, c.cy - ky);
    if (!best || d < best.d) best = { c, d };
  }
  if (!best) { console.error('aucune composante mouvante credible'); process.exit(1); }
  console.log(`  masque motion : composante ${best.c.n} px a ${best.d.toFixed(1)} px du foyer (${comps.length} composantes)`);
  for (let f = 0; f < frames; f += 1) for (let y = 0; y < fh; y += 1) for (let x = 0; x < fw; x += 1) {
    if (lab[y * fw + x] !== best.c.id) continue;
    const X = f * fw + x;
    if (at(X, y)[3] < 128 || !inBox(X, y)) continue;
    mask[y * W + X] = 1;
  }
} else if (MODE === 'blobs') {
  // PETITES TACHES SEULEMENT. Les merveilles portent leurs flammes CUITES dans le
  // sprite (une centaine sur le Mausolée rang V), peintes des mêmes ors que les
  // portes et les volées d'escalier : un masque par teinte dorerait le monument
  // entier. Ce qui sépare une flamme d'une porte, c'est la TAILLE de la tache
  // 8-connexe — une flamme fait quelques dizaines de pixels, une porte des
  // centaines. Seuil explicite, et le rapport dit combien de taches ont été
  // écartées (une refonte de sprite doit se voir, pas passer en silence).
  const MAXB = parseInt(opt('--blob-max', '90'), 10);
  const isCand = (x, y) => {
    const [r, g, b, a] = at(x, y);
    return a >= 128 && inBox(x, y) && (!COLORS.size || COLORS.has(hexOf(r, g, b)));
  };
  const seen = new Uint8Array(W * H);
  let kept = 0, dropped = 0, droppedPx = 0;
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (seen[y * W + x] || !isCand(x, y)) continue;
    const st = [[x, y]], blob = [];
    seen[y * W + x] = 1;
    while (st.length) {
      const [cx, cy] = st.pop(); blob.push([cx, cy]);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || !isCand(nx, ny)) continue;
        seen[ny * W + nx] = 1; st.push([nx, ny]);
      }
    }
    if (blob.length > MAXB) { dropped += 1; droppedPx += blob.length; continue; }
    // Une flamme a un CŒUR INCANDESCENT ; une marche d'escalier, non. Sans cette
    // clé, les volées de marches — mêmes ors, mêmes petites taches — partaient au
    // rouge avec les braseros.
    if (KEY.size && !blob.some(([bx, by]) => KEY.has(hexOf(...at(bx, by))))) { dropped += 1; droppedPx += blob.length; continue; }
    kept += 1;
    for (const [px2, py2] of blob) mask[py2 * W + px2] = 1;
  }
  console.log(`  masque blobs : ${kept} taches retenues, ${dropped} écartées (${droppedPx} px, > ${MAXB})`);
} else if (MODE === 'fill') {
  // REMPLISSAGE BORNE PAR LE CONTOUR. Sur les scenes statiques, la flamme partage
  // sa teinte avec le decor : le feu du culte des ancetres est peint du meme
  // #f2c2a3 que la dalle qui l'entoure, si bien qu'une boite rectangulaire
  // repeint un BLOC rouge au lieu d'une flamme. Ce qui la delimite, c'est son
  // CONTOUR (--wall) : on part du point le plus clair et on s'arrete dessus.
  const WALL = new Set(hexList(opt('--wall', '')));
  let sd = opt('--seed', null);
  if (sd) sd = sd.split(',').map(Number);
  else {
    let bl = -1;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const [r, g, b, a] = at(x, y);
      if (a < 128 || !inBox(x, y)) continue;
      const L = lum(r, g, b);
      if (L > bl) { bl = L; sd = [x, y]; }
    }
  }
  if (!sd) { console.error('--mask fill : aucune amorce'); process.exit(1); }
  const st = [sd];
  mask[sd[1] * W + sd[0]] = 1;
  while (st.length) {
    const [cx, cy] = st.pop();
    const [r, g, b] = at(cx, cy);
    if (WALL.has(hexOf(r, g, b))) continue;               // le contour ferme la piece
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || mask[ny * W + nx]) continue;
      if (at(nx, ny)[3] < 128 || !inBox(nx, ny)) continue;
      mask[ny * W + nx] = 1; st.push([nx, ny]);
    }
  }
  console.log(`  masque fill : amorce ${sd[0]},${sd[1]}`);
} else if (MODE === 'tip') {
  if (!BAND) { console.error('--mask tip exige --band WxHxN'); process.exit(1); }
  const { fw, fh, frames } = BAND;
  const LMIN = parseFloat(opt('--tip-lum', '110'));
  // BRIDE GEOMETRIQUE : une flamme de torche tient dans une poignee de pixels sous
  // sa pointe. Sans elle, le remplissage descend le long du manche jusqu'a la main
  // puis au bras nu — la peau delavee (#f2c2a3) est aussi chaude et claire que la
  // flamme delavee — et repeint l'emeutier en rouge jusqu'a la ceinture.
  const SPX = Math.round(fh * parseFloat(opt('--tip-spanx', '0.14')));
  const SPY = Math.round(fh * parseFloat(opt('--tip-spany', '0.25')));
  const MAXW = Math.round(fh * parseFloat(opt('--tip-maxw', '0.16')));
  const SUP = parseInt(opt('--tip-support', '6'), 10);
  const sizes = [];
  for (let f = 0; f < frames; f += 1) {
    const warm = (x, y, m) => {
      const [r, g, b, a] = at(f * fw + x, y);
      return a >= 128 && r >= b + m && lum(r, g, b) >= LMIN;
    };
    const seed = (x, y) => warm(x, y, 10);      // amorce : franchement chaude
    const grow = (x, y) => warm(x, y, -4);      // propagation : le coeur quasi blanc en fait partie
    const opaque = (x, y) => x >= 0 && y >= 0 && x < fw && y < fh && at(f * fw + x, y)[3] >= 128;
    // Etendue opaque de la frame : le seuil « en haut du sprite » se mesure sur
    // le personnage, pas sur le cadre (les marges varient d'une ere a l'autre).
    let oy0 = fh, oy1 = -1;
    for (let y = 0; y < fh; y += 1) for (let x = 0; x < fw; x += 1) if (opaque(x, y)) { if (y < oy0) oy0 = y; if (y > oy1) oy1 = y; break; }
    for (let y = fh - 1; y >= 0; y -= 1) { let hit = false; for (let x = 0; x < fw; x += 1) if (opaque(x, y)) { hit = true; break; } if (hit) { oy1 = y; break; } }
    const yCut = oy0 + (oy1 - oy0) * parseFloat(opt('--tip-top', '0.45'));
    const LHOT = parseFloat(opt('--tip-hot', '185'));
    const done = new Uint8Array(fw * fh);
    let found = null;
    // On descend candidat par candidat. Le premier blob CLAIR ET PORTE PAR UN
    // MANCHE gagne : c'est le seul discriminant qui distingue une flamme d'une
    // chevelure ou d'un bonnet clair, tous deux « le point chaud le plus haut ».
    for (let y0 = 0; y0 < fh && !found; y0 += 1) for (let x0 = 0; x0 < fw && !found; x0 += 1) {
      if (done[y0 * fw + x0] || y0 > yCut || !seed(x0, y0)) continue;   // la torche est LEVEE
      const seen = new Uint8Array(fw * fh), st = [[x0, y0]], blob = [];
      seen[y0 * fw + x0] = 1;
      while (st.length) {
        const [cx, cy] = st.pop(); blob.push([cx, cy]); done[cy * fw + cx] = 1;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= fw || ny >= fh || seen[ny * fw + nx] || !grow(nx, ny)) continue;
          if (Math.abs(nx - x0) > SPX || ny - y0 > SPY || ny < y0) continue;
          seen[ny * fw + nx] = 1; st.push([nx, ny]);
        }
      }
      if (blob.length < 3) continue;
      let bx0 = fw, bx1 = -1, by1 = -1, hot = false;
      for (const [x, y] of blob) {
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y > by1) by1 = y;
        const c = at(f * fw + x, y);
        if (lum(c[0], c[1], c[2]) >= LHOT) hot = true;
      }
      if (!hot) continue;                                     // un feu a un coeur clair
      if (bx1 - bx0 + 1 > MAXW) continue;                     // trop large pour une flamme
      let support = 0;                                        // ce qui PORTE le blob, 3 rangees plus bas
      for (let dy = 1; dy <= 3; dy += 1) for (let x = bx0 - 2; x <= bx1 + 2; x += 1) if (opaque(x, by1 + dy)) support += 1;
      if (support > SUP * 3) continue;                        // une tete repose sur des epaules, pas sur un baton
      found = blob;
    }
    if (!found) { sizes.push(null); continue; }
    let a0 = fw, a1 = -1, c0 = fh, c1 = -1;
    for (const [x, y] of found) { if (x < a0) a0 = x; if (x > a1) a1 = x; if (y < c0) c0 = y; if (y > c1) c1 = y; }
    sizes.push({ f, blob: found, n: found.length, x0: a0, x1: a1, y0: c0, y1: c1, cx: (a0 + a1) / 2, cy: (c0 + c1) / 2 });
  }
  // VOTE ENTRE FRAMES. Une detection frame par frame se trompe parfois (une
  // chevelure claire, un pan de robe blanche) et rate parfois (flamme masquee par
  // le corps) : les deux se voient a l'oeil comme un emeutier qui clignote. Les
  // frames d'une bande de marche montrent le MEME bras leve — les detections
  // correctes se groupent donc a quelques pixels pres. On garde le plus gros
  // groupe, et sa boite sert a TOUTES les frames, y compris celles ou la
  // detection avait echoue.
  const hits = sizes.filter(Boolean);
  if (!hits.length) { console.error('aucune flamme detectee sur la bande'); process.exit(1); }
  let group = [];
  for (const h of hits) {
    const g = hits.filter((o) => Math.abs(o.cx - h.cx) <= 8 && Math.abs(o.cy - h.cy) <= 8);
    if (g.length > group.length) group = g;
  }
  const bx = { x0: Math.min(...group.map((g) => g.x0)), x1: Math.max(...group.map((g) => g.x1)), y0: Math.min(...group.map((g) => g.y0)), y1: Math.max(...group.map((g) => g.y1)) };
  const PAD = 2;
  const inGroup = new Set(group.map((g) => g.f));
  let filled = 0;
  for (let f = 0; f < frames; f += 1) {
    const hit = sizes[f];
    if (hit && inGroup.has(f)) { for (const [x, y] of hit.blob) mask[y * W + (f * fw + x)] = 1; continue; }
    // Frame sans detection fiable : on retombe sur la boite votee. Le bras se
    // balance pendant le cycle de marche, donc la boite est celle du GROUPE
    // elargie de 2 px — sans ce repli, une frame sur six gardait sa flamme
    // delavee et l'emeutier clignotait en marchant.
    filled += 1;
    for (let y = Math.max(0, bx.y0 - PAD); y <= Math.min(fh - 1, bx.y1 + PAD); y += 1) {
      for (let x = Math.max(0, bx.x0 - PAD); x <= Math.min(fw - 1, bx.x1 + PAD); x += 1) {
        const X = f * fw + x, c = at(X, y);
        if (c[3] < 128 || c[0] < c[2] - 4 || lum(c[0], c[1], c[2]) < LMIN) continue;
        mask[y * W + X] = 1;
      }
    }
  }
  console.log(`  masque tip : ${group.length}/${frames} frames d'accord, boite ${bx.x1 - bx.x0 + 1}x${bx.y1 - bx.y0 + 1} @ ${bx.x0},${bx.y0}, ${filled} frame(s) au repli`);
  if (group.length < Math.ceil(frames / 2)) console.warn(`  ⚠ accord faible (${group.length}/${frames}) — verifier a l'oeil`);
} else { console.error(`--mask inconnu : ${MODE}`); process.exit(1); }

// Teintes du masque (avant croissance) : la croissance ne s'autorise QUE celles-la.
const seedCols = new Set();
for (let p = 0; p < W * H; p += 1) if (mask[p]) { const i = p * 4; seedCols.add(hexOf(data[i], data[i + 1], data[i + 2])); }
for (let g = 0; g < GROW; g += 1) {
  const add = [];
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const p = y * W + x;
    if (mask[p]) continue;
    const [r, gg, b, a] = at(x, y);
    if (a < 128 || !inBox(x, y) || !seedCols.has(hexOf(r, gg, b))) continue;
    let touch = false;
    for (let dy = -1; dy <= 1 && !touch; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (mask[ny * W + nx]) { touch = true; break; }
    }
    if (touch) add.push(p);
  }
  for (const p of add) mask[p] = 1;
}

/* ---- rampe --------------------------------------------------------------- */
const hist = new Map();
for (let p = 0; p < W * H; p += 1) {
  if (!mask[p]) continue;
  const i = p * 4, hx = hexOf(data[i], data[i + 1], data[i + 2]);
  if (KEEP.has(hx)) { mask[p] = 0; continue; }
  const e = hist.get(hx) || { n: 0, L: lum(data[i], data[i + 1], data[i + 2]) };
  e.n += 1; hist.set(hx, e);
}
if (!hist.size) { console.error('masque vide'); process.exit(1); }
const Ls = [...hist.values()].map((e) => e.L);
const Lmin = Math.min(...Ls), Lmax = Math.max(...Ls);
const remap = new Map();
for (const [hx, e] of hist) {
  const t = Lmax > Lmin ? (e.L - Lmin) / (Lmax - Lmin) : 0.5;
  const tt = LO + (HI - LO) * Math.pow(t, GAMMA);
  const idx = Math.max(0, Math.min(STEPS.length - 1, Math.round(tt * (STEPS.length - 1))));
  remap.set(hx, STEPS[idx]);
}

const nMask = mask.reduce((a, b) => a + b, 0);
console.log(`\n### ${path.basename(FILE)} — ${nMask} px de flamme, ${hist.size} teintes (L ${Lmin.toFixed(0)}..${Lmax.toFixed(0)})`);
for (const [hx, e] of [...hist.entries()].sort((a, b) => a[1].L - b[1].L)) {
  const t = STEPS.indexOf(remap.get(hx));
  console.log(`   ${hx}  L=${e.L.toFixed(0).padStart(3)}  ${String(e.n).padStart(5)} px  →  ${RAMP.steps[t].hex} ${RAMP.steps[t].name}`);
}

/* ---- ecriture ------------------------------------------------------------ */
for (let p = 0; p < W * H; p += 1) {
  if (!mask[p]) continue;
  const i = p * 4, c = remap.get(hexOf(data[i], data[i + 1], data[i + 2]));
  if (!c) continue;
  data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
}
if (!DRY) { fs.writeFileSync(FILE, PNG.sync.write(png)); console.log(`   ecrit : ${FILE}`); }
else console.log('   [dry] rien ecrit');

if (SHEET) {
  const Z = parseInt(process.env.Z || '5', 10);
  const fw = BAND ? BAND.fw : W, fh = BAND ? BAND.fh : H;
  const shots = BAND ? [0, Math.min(3, BAND.frames - 1)] : [0];
  const gap = 4;
  const SW = shots.length * 2 * (fw * Z + gap) + gap, SH = fh * Z + gap * 2;
  const o = new PNG({ width: SW, height: SH });
  for (let i = 0; i < SW * SH; i += 1) { o.data[i * 4] = 24; o.data[i * 4 + 1] = 22; o.data[i * 4 + 2] = 30; o.data[i * 4 + 3] = 255; }
  let ox = gap;
  for (const src of [before, data]) {
    for (const f of shots) {
      for (let y = 0; y < fh * Z; y += 1) for (let x = 0; x < fw * Z; x += 1) {
        const sx = f * fw + Math.floor(x / Z), sy = Math.floor(y / Z);
        if (sx >= W || sy >= H) continue;
        const si = (sy * W + sx) * 4, a = src[si + 3] / 255;
        if (a < 0.02) continue;
        const di = ((y + gap) * SW + (x + ox)) * 4;
        for (let k = 0; k < 3; k += 1) o.data[di + k] = Math.round(o.data[di + k] * (1 - a) + src[si + k] * a);
      }
      ox += fw * Z + gap;
    }
  }
  fs.writeFileSync(SHEET, PNG.sync.write(o));
  console.log(`   planche : ${SHEET}`);
}
