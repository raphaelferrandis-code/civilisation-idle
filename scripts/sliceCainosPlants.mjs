// Découpe la planche végétale du pack « Pixel Art Top Down - Basic » (Cainos,
// itch.io — gratuit, usage commercial autorisé, redistribution INTERDITE) en
// sprites iso individuels : arbres et buissons.
//
// Pourquoi ce script et pas un découpage à la main : la planche n'a pas de
// grille (les sprites sont posés librement sur 512×512), donc les boîtes sont
// MESURÉES sur l'alpha — aucune coordonnée en dur à re-corriger si le pack bouge.
//
// Convention de sortie, calquée sur les tree-N existants (cf. le blit d'arbre
// dans isoRenderer.js : `drawImage(img, p.x - hpx/2, p.y - hpx*0.92, hpx, hpx)`) :
//   - canvas CARRÉ (le blit dessine hpx×hpx : un canvas non carré étirerait) ;
//   - contenu ancré par le PIED, centré sur le TRONC (le centre du bas du
//     contenu), pas sur la boîte — une canopée débordant d'un côté ne doit pas
//     décaler l'arbre par rapport à sa cellule ;
//   - pied posé à 92 % de la hauteur du canvas (le blit lit ce ratio).
//
// Usage (--report liste les boîtes mesurées sans rien écrire) :
//   --mode tufts --src "<...>/TX Plant.png"   → deco/tuft-1..15 (touffes d'herbe)
//   --mode plants --src "<...>/TX Plant.png"  → bush-1..6
// Ce qui a été essayé puis REFUSÉ par Raph le 2026-07-22, et n'est donc plus
// sorti : les 3 ARBRES de la planche végétale, et toutes les PIERRES de
// « TX Props.png » (plates puis rondes). Ne pas re-proposer.
// Puis palette du jeu (obligatoire, le vert de Cainos est un olive jaune) :
//   node scripts/remapPalette.mjs public/pixelart/iso/deco/tuft-1.png --no-accent --inplace
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REPORT = args.includes('--report');
const MODE = argOf('--mode', 'plants');   // plants | tufts | rocks
const SRC = argOf('--src', '');
const OUT = argOf('--out', 'public/pixelart/iso');
const FOOT_F = 0.92;          // pied à 92 % de la hauteur du canvas (cf. blit)
const PAD_F = 0.06;           // marge latérale, en fraction du côté

if (!SRC || !fs.existsSync(SRC)) {
  console.error('--src manquant : chemin vers "TX Plant.png" du pack Cainos (non versionné).');
  process.exit(2);
}

const png = PNG.sync.read(fs.readFileSync(SRC));
const { width: W, height: H, data } = png;
const A = (x, y) => data[(y * W + x) * 4 + 3];

// ── Composantes connexes (8-voisins) sur alpha > 8 ───────────────────────────
const lab = new Int32Array(W * H).fill(-1);
const boxes = [];
const stack = [];
for (let y0 = 0; y0 < H; y0 += 1) {
  for (let x0 = 0; x0 < W; x0 += 1) {
    if (A(x0, y0) <= 8 || lab[y0 * W + x0] >= 0) continue;
    const id = boxes.length;
    const bb = { x0, y0, x1: x0, y1: y0, n: 0 };
    stack.push(x0, y0);
    lab[y0 * W + x0] = id;
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      bb.n += 1;
      if (x < bb.x0) bb.x0 = x; if (x > bb.x1) bb.x1 = x;
      if (y < bb.y0) bb.y0 = y; if (y > bb.y1) bb.y1 = y;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (A(nx, ny) <= 8 || lab[ny * W + nx] >= 0) continue;
        lab[ny * W + nx] = id;
        stack.push(nx, ny);
      }
    }
    boxes.push(bb);
  }
}

// ── Fusion des composantes proches ───────────────────────────────────────────
// Un arbre perd des feuilles détachées de la canopée : elles forment leurs
// propres composantes. On recolle tout ce qui se touche à GAP px près.
const GAP = 4;
const near = (a, b) => a.x0 - GAP <= b.x1 && b.x0 - GAP <= a.x1 && a.y0 - GAP <= b.y1 && b.y0 - GAP <= a.y1;
let groups = boxes.map((b, i) => ({ ...b, ids: [i] }));
for (let changed = true; changed;) {
  changed = false;
  outer: for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      if (!near(groups[i], groups[j])) continue;
      const a = groups[i], b = groups[j];
      groups[i] = {
        x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
        x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
        n: a.n + b.n, ids: a.ids.concat(b.ids),
      };
      groups.splice(j, 1);
      changed = true;
      break outer;
    }
  }
}
// Ordre de lecture : par rangée (tolérance verticale), puis de gauche à droite.
groups.sort((a, b) => (Math.abs(a.y0 - b.y0) > 24 ? a.y0 - b.y0 : a.x0 - b.x0));

const wOf = (g) => g.x1 - g.x0 + 1;
const hOf = (g) => g.y1 - g.y0 + 1;

if (REPORT) {
  for (const [i, g] of groups.entries()) {
    console.log(`#${String(i).padStart(2)}  ${String(wOf(g)).padStart(3)}×${String(hOf(g)).padStart(3)}  @(${g.x0},${g.y0})  px=${g.n}  parts=${g.ids.length}`);
  }
  console.log(`\n${groups.length} groupes`);
  process.exit(0);
}

// ── Export ───────────────────────────────────────────────────────────────────
// Le TRONC, pas la boîte : centre horizontal des pixels de la tranche basse du
// contenu. Un feuillu dont la canopée déborde à gauche resterait sinon planté
// de travers dans sa cellule.
function footCenter(g) {
  const h = hOf(g);
  const band = Math.max(1, Math.round(h * 0.12));
  let sum = 0, n = 0;
  for (let y = g.y1 - band + 1; y <= g.y1; y += 1) {
    for (let x = g.x0; x <= g.x1; x += 1) {
      if (A(x, y) > 8 && g.ids.includes(lab[y * W + x])) { sum += x; n += 1; }
    }
  }
  return n ? sum / n : (g.x0 + g.x1) / 2;
}

// Recadrage SERRÉ (aucune marge) : pour les motifs de SOL (touffes, cailloux)
// que le bake du sol pose à l'échelle du « pixel d'art » — un canvas padé les
// rapetisserait d'un facteur arbitraire, et la marge n'a aucune utilité ici
// puisqu'ils sont placés par leur bas-centre, pas par un pied de tronc.
function emitTight(g, file) {
  const w = wOf(g), h = hOf(g);
  const out = new PNG({ width: w, height: h });
  out.data.fill(0);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = g.x0 + x, sy = g.y0 + y;
      if (A(sx, sy) <= 8) continue;
      if (!g.ids.includes(lab[sy * W + sx])) continue;
      const si = (sy * W + sx) * 4, di = (y * w + x) * 4;
      out.data[di] = data[si]; out.data[di + 1] = data[si + 1];
      out.data[di + 2] = data[si + 2]; out.data[di + 3] = data[si + 3];
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(out));
  console.log(`${path.basename(file)}  ${w}×${h}`);
}

function emit(g, file) {
  const w = wOf(g), h = hOf(g);
  const fx = footCenter(g);
  // Côté du canvas : il doit contenir la hauteur SOUS le ratio de pied, et la
  // largeur des deux côtés du tronc (la moitié la plus large commande).
  const halfMax = Math.max(fx - g.x0, g.x1 - fx) + 1;
  const side = Math.ceil(Math.max(h / FOOT_F, (halfMax * 2) / (1 - 2 * PAD_F)));
  const out = new PNG({ width: side, height: side });
  out.data.fill(0);
  const dx = Math.round(side / 2 - (fx - g.x0));      // tronc au centre du canvas
  const dy = Math.round(side * FOOT_F - h);           // pied à 92 %
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = g.x0 + x, sy = g.y0 + y;
      if (A(sx, sy) <= 8) continue;
      if (!g.ids.includes(lab[sy * W + sx])) continue;   // pixels d'un voisin
      const tx = dx + x, ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= side || ty >= side) continue;
      const si = (sy * W + sx) * 4, di = (ty * side + tx) * 4;
      out.data[di] = data[si]; out.data[di + 1] = data[si + 1];
      out.data[di + 2] = data[si + 2]; out.data[di + 3] = data[si + 3];
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(out));
  console.log(`${path.basename(file)}  ${side}×${side}  (source ${w}×${h})`);
}

// ── Familles ─────────────────────────────────────────────────────────────────
// Le tri est fait sur la GÉOMÉTRIE MESURÉE, jamais sur des index de la planche :
// si le pack bouge d'une version à l'autre, le classement suit.
if (MODE === 'plants') {
  // Planche végétale : on ne sort QUE les buissons (gabarit moyen).
  // Les ARBRES (les 3 grands sujets) ont été découpés, repalettisés et câblés en
  // variantes 5-7 le 2026-07-22, puis REFUSÉS par Raph (« je n'aime pas les
  // arbres »). Le script ne les sort plus : il reste ainsi idempotent avec la
  // décision au lieu de les recréer à chaque passage.
  const bushes = groups.filter((g) => hOf(g) >= 14 && hOf(g) < 60)
    .sort((a, b) => wOf(a) * hOf(a) - wOf(b) * hOf(b));
  bushes.forEach((g, i) => emit(g, path.join(OUT, `bush-${1 + i}.png`)));
  console.log(`\n${bushes.length} buissons → ${OUT} (arbres ignorés, refusés)`);
} else if (MODE === 'tufts') {
  // Touffes d'herbe : les tout petits motifs plats du bas de la planche végétale.
  // Le seuil w >= 8 écarte le point isolé de 6×5 (une poussière, pas une touffe).
  const tufts = groups.filter((g) => hOf(g) <= 12 && wOf(g) >= 8)
    .sort((a, b) => (Math.abs(a.y0 - b.y0) > 8 ? a.y0 - b.y0 : a.x0 - b.x0));
  tufts.forEach((g, i) => emitTight(g, path.join(OUT, 'deco', `tuft-${1 + i}.png`)));
  console.log(`\n${tufts.length} touffes → ${path.join(OUT, 'deco')}`);
} else {
  // (Il y a eu un mode `rocks` : bande du bas de « TX Props.png », rocher héros +
  // cailloux ronds + pierres plates, dispersés dans le bake avec trois règles de
  // pose. Tout a été REFUSÉ par Raph le 2026-07-22 — d'abord les pierres plates
  // (« en tuile » dans l'herbe), puis les cailloux ronds : « retire les cailloux
  // en fait ». Retiré. Ne pas re-proposer de semer des pierres sur la carte.)
  console.error(`--mode inconnu : ${MODE} (plants | tufts)`);
  process.exit(2);
}
