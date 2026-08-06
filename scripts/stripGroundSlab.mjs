/* ============================================================================
 * stripGroundSlab.mjs — retire la DALLE au sol d'un sprite de bâtiment
 *
 * POURQUOI. PixelLab pose presque toujours son bâtiment sur un socle : un losange
 * de dalle, de terre ou de pavé qui dépasse de la silhouette, plus parfois des
 * objets posés autour (buissons, clôtures). Sur la carte, ce socle se lit comme
 * une tache claire sur l'herbe — refusé trois fois (socle carré, ombre
 * elliptique, dalle dans le sprite). Les négations du prompt n'y font rien :
 * PixelLab les ignore, et la clause de découpe documentée dans
 * PLAN-EGALISATION-GRAIN §5 échoue une fois sur deux. Le retrait se fait en POST.
 *
 * DEUX PASSES.
 *   1. COMPOSANTES DÉTACHÉES — tout ce qui n'est pas relié au bâtiment (clôture,
 *      buisson, pot) part. Tri en 4-CONNEXITÉ : en 8-connexité une bordure en
 *      pointillé diagonal raccroche le décor au bâtiment et survit au tri.
 *   2. DALLE — le socle est un losange iso 2:1 dont le grand axe est la ligne la
 *      plus large du bas de l'image. On efface par propagation depuis ses POINTES,
 *      bornée au losange.
 *
 * ⛔ LA PROPAGATION EST À COULEUR EXACTE (tol 0 par défaut), pas approchée. Le
 * projet a déjà mangé une façade en tolérant l'écart : sur l'atelier, le crème du
 * mur (`#f0dfc0`) est à 24 unités du sable de la dalle (`#eed6b6`) — une tolérance
 * de 46 les confond et la propagation remonte tout le mur. Mesuré avant de coder :
 * sur les deux sprites traités, AUCUNE couleur de dalle n'apparaît dans le
 * bâtiment. Ne relever `--tol` qu'après avoir vérifié ce point sur le sprite visé.
 *
 *   node scripts/stripGroundSlab.mjs <fichier.png> [--out f.png] [--tol N] [--edge F] [--dry]
 *   node scripts/stripGroundSlab.mjs <f.png> --parts-only   (passe 1 seule)
 *
 * ⚠ TOUJOURS RELIRE LE RÉSULTAT À ×6 : c'est l'œil qui tranche, pas le compteur.
 * ============================================================================ */

import { PNG } from "pngjs";
import fs from "fs";

const OPAQUE = 8;

// Passe 1 — ne garder que la composante 4-connexe la plus grande.
function keepLargestPart(p) {
  const W = p.width, H = p.height;
  const lab = new Int32Array(W * H).fill(-1);
  const sizes = [];
  for (let s = 0; s < W * H; s += 1) {
    if (lab[s] >= 0 || p.data[s * 4 + 3] <= OPAQUE) continue;
    const id = sizes.length;
    let n = 0;
    const st = [s];
    lab[s] = id;
    while (st.length) {
      const k = st.pop();
      n += 1;
      const x = k % W, y = (k / W) | 0;
      if (x > 0) { const q = k - 1; if (lab[q] < 0 && p.data[q * 4 + 3] > OPAQUE) { lab[q] = id; st.push(q); } }
      if (x < W - 1) { const q = k + 1; if (lab[q] < 0 && p.data[q * 4 + 3] > OPAQUE) { lab[q] = id; st.push(q); } }
      if (y > 0) { const q = k - W; if (lab[q] < 0 && p.data[q * 4 + 3] > OPAQUE) { lab[q] = id; st.push(q); } }
      if (y < H - 1) { const q = k + W; if (lab[q] < 0 && p.data[q * 4 + 3] > OPAQUE) { lab[q] = id; st.push(q); } }
    }
    sizes.push(n);
  }
  let best = 0;
  for (let i = 1; i < sizes.length; i += 1) if (sizes[i] > sizes[best]) best = i;
  let dropped = 0;
  for (let k = 0; k < W * H; k += 1) {
    if (lab[k] >= 0 && lab[k] !== best) { p.data[k * 4 + 3] = 0; dropped += 1; }
  }
  return { parts: sizes.length, dropped };
}

// Passe 2 — la dalle, propagée depuis les pointes du losange.
function stripSlab(p, tol, edge) {
  const W = p.width, H = p.height;
  const alphaAt = (x, y) => p.data[(y * W + x) * 4 + 3];
  const rgbAt = (x, y) => {
    const i = (y * W + x) * 4;
    return [p.data[i], p.data[i + 1], p.data[i + 2]];
  };
  // Grand axe de la dalle = PREMIER MAXIMUM LOCAL DE LARGEUR EN REMONTANT DEPUIS LE BAS.
  // ⛔ Pas « la ligne la plus large du bas de l'image » : sur un sprite à toit débordant
  // (auvent, avancée de pignon) c'est le TOIT qui gagne, le losange se cale trop haut et
  // la bande de sol qui court sous l'auvent reste en place. Le bord avant de la dalle,
  // lui, s'élargit régulièrement en remontant jusqu'à son grand axe : on s'arrête là.
  const widthAt = (y) => {
    let first = -1, last = -1;
    for (let x = 0; x < W; x += 1) if (alphaAt(x, y) > OPAQUE) { if (first < 0) first = x; last = x; }
    return first < 0 ? null : [first, last];
  };
  let ay = H - 1;
  while (ay > 0 && !widthAt(ay)) ay -= 1;
  while (ay > 1) {
    const here = widthAt(ay), up = widthAt(ay - 1);
    if (!up || up[1] - up[0] < here[1] - here[0]) break;
    ay -= 1;
  }
  const [ax0, ax1] = widthAt(ay);
  const cx = (ax0 + ax1) / 2, a = (ax1 - ax0) / 2 + 1, b = a / 2;
  const inDiamond = (x, y) => Math.abs(x - cx) / a + Math.abs(y - ay) / b <= 1.001;

  // Germes : le POURTOUR du demi-losange avant (sous le grand axe), à plus de `edge` du
  // centre. Deux bornes qui ont chacune coûté un essai :
  //  - la moitié haute est exclue — le toit y déborde (auvent, avancée de pignon) et un
  //    germe pris là empoisonne la palette avec de la tuile ;
  //  - ⛔ ne PAS prendre tout le demi-losange : le bas des murs descend devant la ligne
  //    de contact et part avec la dalle (mesuré : la rangée ouvrière perdait ses murs).
  // Si une frange de dalle survit (nuance d'ombre sous un auvent, absente du bord),
  // baisser `--edge` plutôt que relever `--tol` : on élargit la palette sans confondre
  // deux matières.
  const seeds = [];
  for (let y = ay; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (alphaAt(x, y) <= OPAQUE) continue;
      const t = Math.abs(x - cx) / a + Math.abs(y - ay) / b;
      if (t <= 1.001 && t > edge) seeds.push([x, y]);
    }
  }
  const palette = seeds.map(([x, y]) => rgbAt(x, y));
  const isSlabTone = (c) => palette.some((q) =>
    (tol > 0
      ? Math.hypot(c[0] - q[0], c[1] - q[1], c[2] - q[2]) <= tol
      : c[0] === q[0] && c[1] === q[1] && c[2] === q[2]));

  const seen = new Uint8Array(W * H), stack = [];
  for (const [x, y] of seeds) if (!seen[y * W + x]) { seen[y * W + x] = 1; stack.push(x, y); }
  let removed = 0;
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    removed += 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = ny * W + nx;
      if (seen[k] || alphaAt(nx, ny) <= OPAQUE || !inDiamond(nx, ny) || !isSlabTone(rgbAt(nx, ny))) continue;
      seen[k] = 1; stack.push(nx, ny);
    }
  }
  for (let i = 0; i < W * H; i += 1) if (seen[i]) p.data[i * 4 + 3] = 0;
  return { axis: [ax0, ax1, ay], removed };
}

export function stripGroundSlab(file, { tol = 0, edge = 0.86, partsOnly = false } = {}) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const parts = keepLargestPart(png);
  const slab = partsOnly ? { axis: [], removed: 0 } : stripSlab(png, tol, edge);
  // Le retrait de la dalle DÉTACHE ce qu'elle portait (allée pavée au centre, touffes
  // isolées) et laisse des pixels orphelins là où sa teinte sortait de la palette des
  // germes. Une seconde passe de composantes les emporte — d'où l'ordre A/B/A.
  const after = partsOnly ? { parts: 0, dropped: 0 } : keepLargestPart(png);
  return { png, parts, slab, after };
}

if (process.argv[1] && process.argv[1].endsWith("stripGroundSlab.mjs")) {
  const args = process.argv.slice(2);
  const file = args.find((s) => !s.startsWith("--"));
  if (!file) {
    console.error("usage: node scripts/stripGroundSlab.mjs <f.png> [--out g.png] [--tol N] [--edge F] [--parts-only] [--dry]");
    process.exit(1);
  }
  const flag = (name, def) => {
    const i = args.indexOf("--" + name);
    return i >= 0 ? args[i + 1] : def;
  };
  const res = stripGroundSlab(file, {
    tol: Number(flag("tol", 0)),
    edge: Number(flag("edge", 0.86)),
    partsOnly: args.includes("--parts-only")
  });
  const out = flag("out", file);
  if (!args.includes("--dry")) fs.writeFileSync(out, PNG.sync.write(res.png));
  console.log(`${file} — ${res.parts.parts} composantes, ${res.parts.dropped} px détachés`
    + (res.slab.axis.length ? `, dalle axe ${res.slab.axis.join(",")} : ${res.slab.removed} px` : "")
    + (res.after.dropped ? `, ${res.after.dropped} px orphelins` : "")
    + (args.includes("--dry") ? " (dry)" : " → " + out));
}
