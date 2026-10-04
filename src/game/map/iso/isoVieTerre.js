// LA PETITE VIE DE TERRE (docs/PLAN-MAQUETTE-VIVANTE.md §9, lot V3).
//
// Réponses de Raph (2026-10-01) : « petites bêtes de terre » (papillons près des
// fleurs, chats sur les murets, chiens qui trottent) et « vent » (linge qui sèche).
// Dose : calme, à découvrir.
//
//   · CHIENS : un habitant sur quatorze promène le sien. Le chien trotte derrière son
//     maître, un peu de côté, et s'assoit quand il s'arrête. Aucune simulation : il
//     est calé sur la position et le cap de l'habitant, frame par frame.
//   · CHATS : assis sur le parapet des quais, tournés vers l'eau, la queue qui bat.
//   · PAPILLONS : au printemps et l'été, de jour, autour des massifs fleuris des
//     places ; ils volettent, se posent sur une fleur, repartent.
//   · LINGE : une corde entre deux piquets dans une cour, au pied d'une maison ; les
//     draps claquent quand il y a du vent.
//
// Tout passe par le tri du peintre (acteurs 'vie') : ces bêtes sont au sol.
import { CM, cmHash } from '../layout.js';
import { worldToScreen } from './projection.js';
import { isoPlazaCompositions } from './isoPlaza.js';
import { VIE, vieK, vieZoomFade, vieSprite, vieBlit, viePixel, vieCount, registerVieActors } from './isoVie.js';
import { BFLY_KINDS } from './vieArt.js';

function h32(n) {
  let x = (n | 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}
const bandOf = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);

// ── CHIENS ──────────────────────────────────────────────────────────────────
function dogOf(c) {
  let d = c._vieDog;
  if (d === undefined) {
    const h = cmHash('dog:' + (c.name || '') + ':' + Math.round((c.phase || 0) * 100)) >>> 0;
    // Les enfants (charType 2) ne promènent pas de chien.
    d = c._vieDog = (c.charType !== 2 && (h % 14) === 0) ? { side: (h >>> 5) & 1 ? 1 : -1, g: h } : null;
  }
  return d;
}
function pushDogs(now, out) {
  if (VIE.chiens <= 0 || !CM.citizens) return;
  const band = bandOf();
  if (band < 1 || band > 6) return;
  const T = CM.TILE;
  for (const c of CM.citizens) {
    const d = dogOf(c);
    // Le chien vit au rythme de son MAÎTRE (docs/PLAN-COMPORTEMENTS.md, lot 1) : il
    // sort et rentre avec lui, dans le même fondu — tous les chiens de la ville
    // disparaissaient d'un coup à 0,55 de nuit, et restaient opaques pendant que
    // leur maître s'effaçait sur le seuil.
    if (!d || c._nightHidden) continue;
    const ma = (c.fade == null ? 1 : c.fade) * (c._sleepFade == null ? 1 : c._sleepFade);
    if (ma <= 0.02) continue;
    let hx = c.tx - c.x, hy = c.ty - c.y;
    const hl = Math.hypot(hx, hy);
    const moving = hl > T * 0.05 && !(c.pauseT > 0);
    if (hl > 1e-3) { hx /= hl; hy /= hl; } else { hx = d.hx || 1; hy = d.hy || 0; }
    d.hx = hx; d.hy = hy;
    // À CÔTÉ du maître, un peu devant (il tire sur la laisse) : placé derrière, il se
    // cachait sous l'habitant dès que celui-ci marchait vers le bas de l'écran.
    // Posé à côté du maître DESSINÉ : sa ligne de trottoir (lox/loy) comprise — sans
    // elle, le chien marchait à un demi-trottoir de lui.
    const wx = c.x + (c.lox || 0) + hx * T * 0.12 - hy * T * 0.34 * d.side;
    const wy = c.y + (c.loy || 0) + hy * T * 0.12 + hx * T * 0.34 * d.side;
    out.push({
      wx, wy,
      draw(ctx) {
        // Le fondu du maître, et rien d'autre : un chien à demi transparent hors
        // fondu ne se lirait plus.
        const k = vieK(), fz = vieZoomFade() * ma;
        if (fz <= 0) return;
        const p = worldToScreen(wx, wy);
        const q = worldToScreen(wx + hx * T, wy + hy * T);
        const left = q.x < p.x;
        const spr = moving ? vieSprite('dog', Math.floor(now / 120 + (d.g % 7)) % 2, left) : vieSprite('dogSit', 0, left);
        if (vieBlit(ctx, spr, p.x, p.y, k, fz)) vieCount('chiens');
      },
    });
  }
}

// ── LES QUAIS (chats) ───────────────────────────────────────────────────────
// Postes sur le parapet : un pas en retrait du bord, là où le mur est tracé, en
// ville et loin des arbres — mêmes règles que les mouettes.
let _cats = null, _catKey = '';
function catSpots() {
  const L = CM.layout, rv = L && L.river;
  const band = bandOf();
  const key = (CM.layoutRecomputeAt || 0) + ':' + band + ':' + ((CM.quayGate && CM.quayGate.key) || '');
  if (_cats && _catKey === key) return _cats;
  _catKey = key; _cats = [];
  if (!rv || !rv.present || !rv.samples || band < 2 || band > 6) return _cats;
  const sm = rv.samples, g = CM.quayGate, N = L.gridN | 0;
  // Deux cases autour de chaque arbre : la couronne d'un arbre posé DEVANT (au sud)
  // couvre la bête posée derrière — un chat à une case d'écart disparaissait dessous.
  const treed = new Set();
  for (const tr of (L.trees || [])) for (let dx = -2; dx <= 2; dx += 1) for (let dy = -2; dy <= 2; dy += 1) treed.add((tr.gx + dx) + ',' + (tr.gy + dy));
  const urban = L.urbanSet, seed = (L.mapSeed || 0) | 0;
  // D'abord TOUS les postes valides (les deux rives), puis quelques-uns bien espacés :
  // tirer au hasard puis filtrer ne laissait parfois aucun chat dans une petite ville.
  const valid = [];
  for (let i = 2; i < sm.length - 2; i += 1) for (const side of [-1, 1]) {
    const hh = cmHash('cat:' + i + ':' + side + ':' + seed) >>> 0;
    const draw = g ? (side > 0 ? g.drawPlus : g.drawMinus) : null;
    if (draw && !draw[i]) continue;
    const q = sm[i];
    if (q.x < 1 || q.y < 1 || q.x > N - 1 || q.y > N - 1) continue;
    const a = sm[i - 1], b = sm[i + 1];
    let tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const off = (q.hw || 2) + 0.12;
    const x = q.x - ty * side * off, y = q.y + tx * side * off;
    const ck = Math.floor(x) + ',' + Math.floor(y);
    if (treed.has(ck) || (urban && urban.has && !urban.has(ck))) continue;
    valid.push({ x, y, cx: q.x, cy: q.y, g: hh });
  }
  // Un chat pour ~30 postes valides, 1 à 4 ; espacés régulièrement, décalés par la graine.
  const n = Math.max(valid.length ? 1 : 0, Math.min(4, Math.round(valid.length / 30)));
  const off = (seed >>> 0) % Math.max(1, Math.floor(valid.length / Math.max(1, n)));
  for (let j = 0; j < n; j += 1) _cats.push(valid[Math.min(valid.length - 1, off + Math.floor(j * valid.length / n))]);
  return _cats;
}
function pushCats(now, out) {
  if (VIE.chats <= 0) return;
  const T = CM.TILE, t = now / 1000;
  for (const s of catSpots()) {
    out.push({
      wx: s.x * T, wy: s.y * T,
      draw(ctx) {
        const k = vieK(), fz = vieZoomFade();
        if (fz <= 0) return;
        const p = worldToScreen(s.x * T, s.y * T), c = worldToScreen(s.cx * T, s.cy * T);
        // Queue lente (1,3 s), toilette 3 s toutes les 20 s.
        const groom = ((t + (s.g % 20)) % 20) < 3;
        const fr = groom ? 2 : Math.floor(t / 1.3 + (s.g % 3)) % 2;
        if (vieBlit(ctx, vieSprite('cat', fr, c.x < p.x), p.x, p.y, k, fz)) vieCount('chats');
      },
    });
  }
}

// ── PAPILLONS ───────────────────────────────────────────────────────────────
// Ancres : les massifs et bacs fleuris des places (isoPlaza), relus à chaque frame
// (le cache de la place se reconstruit à chaque recalcul de la ville).
function flowerAnchors(L, band) {
  const out = [];
  for (const comp of isoPlazaCompositions(L, band) || []) {
    for (const p of comp.props || []) {
      if (!/flower|planter|bed/.test(String(p.prop))) continue;
      // Mobilier en PIXELS MONDE (cf. isoVieOiseaux) : ramené en tuiles.
      const x = p.wx / CM.TILE, y = p.wy / CM.TILE;
      out.push({ x, y, g: cmHash('bf:' + Math.round(x * 10) + ':' + Math.round(y * 10)) >>> 0 });
    }
  }
  return out;
}
function pushButterflies(now, out) {
  if (VIE.papillons <= 0) return;
  if (!(CM.season === 0 || CM.season === 1) || (CM.nightF || 0) > 0.25 || (CM.rainF || 0) > 0.25) return;
  const L = CM.layout, band = bandOf();
  if (!L || band < 1 || band > 6) return;
  const T = CM.TILE, t = now / 1000;
  for (const a of flowerAnchors(L, band)) {
    if ((a.g % 3) === 0) continue;                       // deux massifs sur trois
    const kind = BFLY_KINDS[(a.g >>> 4) % BFLY_KINDS.length];
    // Cycle de 11-16 s : il volette autour du massif, puis se pose 3-5 s ailes fermées.
    const P = 11 + h32(a.g) * 5, rest = 3 + h32(a.g + 1) * 2;
    const u = (t + h32(a.g + 2) * P) % P;
    const flying = u < P - rest;
    // Serrés sur le massif (0,28 tuile) : un papillon blanc au-dessus du pavé clair
    // ne se voit pas ; sur le vert et les fleurs, si.
    const r = 0.28;
    let fx = a.x, fy = a.y;
    if (flying) {
      const s1 = h32(a.g + 3) * 6.28, s2 = h32(a.g + 4) * 6.28;
      // Vol en zigzag : deux sinus lents et un rapide, bornés au massif.
      const env = Math.sin(Math.PI * (u / (P - rest)));
      fx += (Math.sin(t * 0.9 + s1) * 0.8 + Math.sin(t * 3.7 + s2) * 0.2) * r * env;
      fy += (Math.cos(t * 0.7 + s2) * 0.8 + Math.sin(t * 4.3 + s1) * 0.2) * r * env;
    }
    const wx = fx * T, wy = fy * T;
    out.push({
      wx, wy,
      draw(ctx) {
        const k = vieK(), fz = vieZoomFade();
        if (fz <= 0) return;
        const p = worldToScreen(wx, wy);
        const hover = flying ? (4 + Math.sin(t * 6 + a.g) * 1.5) * k : 2 * k;   // posé : sur la fleur
        const fr = flying ? Math.floor(now / 110 + (a.g % 5)) % 2 : 1;
        if (vieBlit(ctx, vieSprite(kind, fr), p.x, p.y - hover, k, fz)) vieCount('papillons');
      },
    });
  }
}

// ── LINGE QUI SÈCHE ─────────────────────────────────────────────────────────
// Une corde tendue entre deux piquets dans une COUR : une case libre (en ville, ni
// rue, ni bâti, ni arbre, ni place, ni eau) collée au mur d'une maison. Une cour sur
// ~45 maisons. La corde longe le mur ; trois ou quatre pièces de linge y pendent.
const LINEN = [[236, 232, 220], [180, 196, 212], [214, 170, 96], [196, 92, 72], [226, 222, 204]];
let _lines = null, _lineKey = '';
function lineSpots() {
  const L = CM.layout, band = bandOf();
  const key = (CM.layoutRecomputeAt || 0) + ':' + band;
  if (_lines && _lineKey === key) return _lines;
  _lineKey = key; _lines = [];
  if (!L || band < 1 || band > 6) return _lines;
  const built = new Map();
  for (const tl of (L.tiles || [])) {
    const sx = tl.spanX || tl.size || 1, sy = tl.spanY || tl.size || 1;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) built.set((tl.gx + ax) + ',' + (tl.gy + ay), tl);
  }
  const blocked = new Set();
  for (const tr of (L.trees || [])) blocked.add(tr.gx + ',' + tr.gy);
  for (const cr of (L.critters || [])) blocked.add(cr.gx + ',' + cr.gy);
  const rv = L.river, road = L.roadSet, urban = L.urbanSet, seed = (L.mapSeed || 0) | 0;
  for (const [k, tl] of built) {
    if (tl.type !== 'house' && tl.type !== 'enginehome') continue;
    const [gx, gy] = k.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const cx = gx + dx, cy = gy + dy, ck = cx + ',' + cy;
      if (built.has(ck) || blocked.has(ck) || (road && road.has(ck))) continue;
      if (urban && urban.has && !urban.has(ck)) continue;
      if (rv && rv.isWater && (rv.isWater(cx, cy) || (rv.isBank && rv.isBank(cx, cy)))) continue;
      const hh = cmHash('linge:' + ck + ':' + seed) >>> 0;
      if ((hh % 45) !== 0) continue;
      blocked.add(ck);
      // La corde LONGE le mur : axe perpendiculaire au côté par lequel la case touche
      // la maison.
      const ax = dx !== 0 ? 0 : 1, ay = dx !== 0 ? 1 : 0;
      _lines.push({ x: cx + 0.5 - dx * 0.12, y: cy + 0.5 - dy * 0.12, ax, ay, g: hh });
    }
  }
  return _lines;
}
function pixelLine(ctx, x0, y0, x1, y1, k, rgb, a, sag = 0) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / k));
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    viePixel(ctx, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + Math.sin(Math.PI * u) * sag, k, rgb, a);
  }
}
function pushLaundry(now, out) {
  if (VIE.linge <= 0) return;
  const T = CM.TILE;
  for (const s of lineSpots()) {
    out.push({
      wx: s.x * T, wy: s.y * T,
      draw(ctx) {
        const k = vieK(), fz = vieZoomFade();
        if (fz <= 0) return;
        const hl = 0.36;
        const A = worldToScreen((s.x - s.ax * hl) * T, (s.y - s.ay * hl) * T);
        const B = worldToScreen((s.x + s.ax * hl) * T, (s.y + s.ay * hl) * T);
        const H = 7 * k;                                  // hauteur des piquets (pixels d'art)
        const wood = [96, 74, 52];
        // Piquets, puis la corde qui plonge un peu au milieu.
        for (const P of [A, B]) for (let j = 0; j < 7; j += 1) viePixel(ctx, P.x, P.y - j * k, k, wood, fz);
        pixelLine(ctx, A.x, A.y - H, B.x, B.y - H, k, [70, 62, 56], fz * 0.9, 1.2 * k);
        // Le linge : 3-4 pièces le long de la corde, 2 px de large, 2 à 4 de haut.
        const wind = CM.windX || 0, t = now / 1000;
        const n = 3 + (s.g % 2);
        for (let i = 0; i < n; i += 1) {
          const u = (i + 0.7) / (n + 0.4);
          const x = A.x + (B.x - A.x) * u, y = A.y + (B.y - A.y) * u - H + Math.sin(Math.PI * u) * 1.2 * k;
          const col = LINEN[(s.g + i * 3) % LINEN.length];
          const hgt = 2 + ((s.g >>> (i + 2)) % 3);
          // Le vent soulève le bas de la pièce d'un pixel, par à-coups.
          const flap = Math.abs(wind) > 0.15 && Math.sin(t * (5 + i) + i * 1.7) > 0 ? Math.sign(wind) : 0;
          for (let r = 0; r < hgt; r += 1) {
            const sh = r === hgt - 1 ? flap : 0;
            viePixel(ctx, x + sh * k, y + (r + 1) * k, k, col, fz);
            viePixel(ctx, x + (1 + sh) * k, y + (r + 1) * k, k, col.map((v) => v - 18), fz);
          }
        }
        vieCount('linge');
      },
    });
  }
}

registerVieActors((now, out) => {
  if (!VIE.on || CM.lodActive || CM.collapseAt) return;
  pushDogs(now, out);
  pushCats(now, out);
  pushButterflies(now, out);
  pushLaundry(now, out);
});

if (typeof window !== 'undefined') {
  window.__vieTerre = () => ({
    chats: catSpots().map((s) => [s.x, s.y]),
    linge: lineSpots().map((s) => [s.x, s.y]),
    chiens: (CM.citizens || []).filter((c) => dogOf(c)).map((c) => [c.x / CM.TILE, c.y / CM.TILE]),
    fleurs: CM.layout ? flowerAnchors(CM.layout, bandOf()).map((a) => [a.x, a.y]) : [],
  });
}
