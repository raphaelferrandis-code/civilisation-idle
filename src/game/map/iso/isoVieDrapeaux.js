// LES DRAPEAUX (docs/PLAN-MAQUETTE-VIVANTE.md §9, lot V3 « vent »).
//
// Réponse de Raph (2026-10-01) : « des drapeaux sur les ponts à partir de la pierre,
// les bâtiments publics oui, et quelques-uns le long des quais ». Les ponts sont
// dessinés par isoBridge (session des ponts), qui appelle la même recette
// (isoVie.drawVieFlag) : tous les drapeaux de la carte claquent dans le même vent.
//
//   · BÂTIMENTS PUBLICS (tribunal, ministère, écoles et académies, marché, guildes,
//     bourse, port, tour de guet, culte) : un mât planté devant la façade, côté rue.
//   · QUAIS : quelques grands mâts sur la promenade, au bord de l'eau, espacés.
//
// Tous plantés AU SOL : au tri du peintre, un mât est un passant immobile.
import { CM, cmHash } from '../layout.js';
import { worldToScreen, depthOf } from './projection.js';
import { isoBuildingFront, isoFrontOffset } from './isoGroundDetail.js';
import { bridgeBlocks } from './isoBridge.js';
import { VIE, vieK, vieZoomFade, vieCount, drawVieFlag, FLAG_COLS, registerVieActors } from './isoVie.js';

const bandOf = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);

// Bâtiments publics → couleur du drapeau. (Les greniers, champs, moulins, égouts,
// routes… n'en portent pas : ce sont des ouvrages, pas des institutions.)
const PUBLIC = {
  courthouses: 'azur', ministries: 'azur', bureaucracy: 'azur',
  schools: 'vert', academies: 'vert', universities: 'vert', libraries: 'vert', observatories: 'vert',
  markets: 'rouge', guilds: 'rouge', mint_houses: 'rouge', imperial_exchanges: 'rouge',
  river_ports: 'blanc', watch: 'rouge', ancestral_cult: 'blanc',
};
// Aux ères avancées, la couleur suit l'époque (bannières d'acier, puis lumière).
function flagCols(kind, band) {
  if (band >= 7) return FLAG_COLS.ciel;
  if (band >= 6) return kind === 'blanc' ? FLAG_COLS.blanc : FLAG_COLS.nuit;
  return FLAG_COLS[kind] || FLAG_COLS.rouge;
}
// La couleur de la VILLE, pour les mâts des quais.
const cityCols = (band) => (band >= 7 ? FLAG_COLS.ciel : band >= 6 ? FLAG_COLS.nuit : band >= 4 ? FLAG_COLS.azur : FLAG_COLS.rouge);

// DOSE : une ville de bande 4 compte ~280 tuiles d'institutions (un achat pose
// plusieurs instances) — un drapeau sur chacune, c'était 126 drapeaux à l'écran.
// Seules les DEUX plus grandes instances de chaque institution en portent un.
let _pub = null, _pubKey = '';
function publicFlagTiles() {
  const L = CM.layout;
  const key = (CM.layoutRecomputeAt || 0) + ':' + bandOf();
  if (_pub && _pubKey === key) return _pub;
  _pubKey = key; _pub = [];
  const byId = new Map();
  for (const t of ((L && L.tiles) || [])) {
    if (t.type !== 'engine' || !PUBLIC[t.buildingId]) continue;
    if (!byId.has(t.buildingId)) byId.set(t.buildingId, []);
    byId.get(t.buildingId).push(t);
  }
  const area = (t) => (t.spanX || t.size || 1) * (t.spanY || t.size || 1);
  for (const list of byId.values()) {
    list.sort((a, b) => area(b) - area(a) || (b.tier || 0) - (a.tier || 0)
      || ((cmHash('pf:' + a.gx + ':' + a.gy) >>> 0) - (cmHash('pf:' + b.gx + ':' + b.gy) >>> 0)));
    _pub.push(...list.slice(0, 2));
  }
  return _pub;
}

// ── BÂTIMENTS PUBLICS ───────────────────────────────────────────────────────
// Un MÂT PLANTÉ DEVANT LA FAÇADE, côté rue, à côté de la porte — comme devant une
// mairie ou une école ; deux mâts qui encadrent l'entrée pour les grands bâtiments.
// ⚠ Pas sur le toit : le haut de l'encre MESURÉE d'une scène moteur (y compris son
// profil opaque) dépasse le toit affiché de 15 à 30 px sur certaines scènes, et le
// drapeau flottait au-dessus de la bibliothèque (zoom 2, 2026-10-01). Planté au sol,
// le mât est trié comme un passant : devant la façade quand elle regarde le joueur,
// caché par le bâtiment quand elle regarde au loin.
function pushPublicFlags(now, out) {
  const L = CM.layout, band = bandOf();
  if (band < 2) return;
  const T = CM.TILE;
  for (const t of publicFlagTiles()) {
    const kind = PUBLIC[t.buildingId];
    let masts = t._vieMasts;
    if (masts === undefined) {
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      const f = isoBuildingFront(t, L.roadMap);
      const sd = cmHash('flag:' + t.gx + ':' + t.gy) >>> 0;
      // Porte au milieu de la façade ; sans rue, le coin sud (face au joueur).
      const dx = f ? f.dx : 1, dy = f ? f.dy : 1;
      const hx = f ? f.hx + 0.5 : t.gx + sx, hy = f ? f.hy + 0.5 : t.gy + sy;
      const px = -dy, py = dx;                              // le long de la façade
      const ex = hx + dx * 0.46, ey = hy + dy * 0.46;      // au bord du trottoir
      const sides = sx * sy >= 4 ? [-1, 1] : [((sd >>> 4) & 1) ? 1 : -1];
      // TRI : un mât planté DEVANT une façade qui regarde le joueur (+x ou +y) est
      // plus au nord que le coin sud qui sert de clé au bâtiment — trié à son pied,
      // il passait SOUS le socle et son drapeau disparaissait derrière. Il prend donc
      // la clé du bâtiment + ε. Devant une façade qui regarde au loin, il reste à son
      // pied : le bâtiment le cache, c'est juste.
      const fo = isoFrontOffset(t, L.roadMap);
      const dB = depthOf((t.gx + sx + (fo ? fo.ox : 0)) * T, (t.gy + sy + (fo ? fo.oy : 0)) * T) + 0.002;
      const facing = dx + dy > 0;
      masts = t._vieMasts = sides.map((sg) => {
        const m = { x: ex + px * sg * 0.36, y: ey + py * sg * 0.36, s: sd + sg };
        m.d = facing ? Math.max(dB, depthOf(m.x * T, m.y * T)) : null;
        return m;
      });
    }
    for (const m of masts) {
      const wx = m.x * T, wy = m.y * T;
      out.push({
        wx, wy, d: m.d,
        draw(ctx) {
          const fz = vieZoomFade();
          if (fz <= 0) return;
          const p = worldToScreen(wx, wy);
          if (drawVieFlag(ctx, p.x, p.y, {
            k: vieK(), poleH: 18, w: 6, h: 4,
            cols: flagCols(kind, band), swallow: kind === 'rouge' && (m.s & 1) === 1,
            seed: (m.s % 100) / 16, now, alpha: fz, pole: band >= 5 ? '#5a5e66' : '#4a3a2a',
          })) vieCount('drapeaux');
        },
      });
    }
  }
}

// ── QUAIS ───────────────────────────────────────────────────────────────────
// Un grand mât tous les ~22 samples de quai, en alternant les rives, sur la
// promenade au ras de l'eau ; en ville, loin des arbres et des ponts.
let _quay = null, _quayKey = '';
function quayMasts() {
  const L = CM.layout, rv = L && L.river, band = bandOf();
  const key = (CM.layoutRecomputeAt || 0) + ':' + band + ':' + ((CM.quayGate && CM.quayGate.key) || '');
  if (_quay && _quayKey === key) return _quay;
  _quayKey = key; _quay = [];
  if (!rv || !rv.present || !rv.samples || band < 2) return _quay;
  const sm = rv.samples, g = CM.quayGate, N = L.gridN | 0, T = CM.TILE;
  const treed = new Set();
  for (const tr of (L.trees || [])) for (let dx = -2; dx <= 2; dx += 1) for (let dy = -2; dy <= 2; dy += 1) treed.add((tr.gx + dx) + ',' + (tr.gy + dy));
  const urban = L.urbanSet;
  let last = -99, side = 1;
  for (let i = 2; i < sm.length - 2; i += 1) {
    if (i - last < 22) continue;
    const q = sm[i];
    if (q.x < 1 || q.y < 1 || q.x > N - 1 || q.y > N - 1) continue;
    const draw = g ? (side > 0 ? g.drawPlus : g.drawMinus) : null;
    if (draw && !draw[i]) continue;
    const a = sm[i - 1], b = sm[i + 1];
    let tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const off = (q.hw || 2) + 0.18;
    const x = q.x - ty * side * off, y = q.y + tx * side * off;
    const ck = Math.floor(x) + ',' + Math.floor(y);
    if (treed.has(ck) || (urban && urban.has && !urban.has(ck))) continue;
    if (bridgeBlocks(x * T, y * T, T * 2)) continue;
    _quay.push({ x, y, s: cmHash('qflag:' + i) >>> 0 });
    last = i; side = -side;
  }
  return _quay;
}
function pushQuayFlags(now, out) {
  const band = bandOf(), T = CM.TILE;
  for (const m of quayMasts()) {
    const wx = m.x * T, wy = m.y * T;
    out.push({
      wx, wy,
      draw(ctx) {
        const fz = vieZoomFade();
        if (fz <= 0) return;
        const p = worldToScreen(wx, wy);
        if (drawVieFlag(ctx, p.x, p.y, {
          k: vieK(), poleH: 20, w: 7, h: 5, cols: cityCols(band), swallow: (m.s & 1) === 1,
          seed: (m.s % 100) / 16, now, alpha: fz, pole: band >= 5 ? '#5a5e66' : '#4a3a2a',
        })) vieCount('drapeauxQuai');
      },
    });
  }
}

registerVieActors((now, out) => {
  if (!VIE.on || !(VIE.drapeaux > 0) || CM.lodActive || CM.collapseAt || !CM.layout) return;
  pushPublicFlags(now, out);
  pushQuayFlags(now, out);
});

// Vérification : où sont les mâts (monde, tuiles).
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__vieFlags = () => ({
    quai: quayMasts().map((m) => [m.x, m.y]),
    publics: publicFlagTiles()
      .map((t) => [t.gx + (t.spanX || t.size || 1) / 2, t.gy + (t.spanY || t.size || 1) / 2, t.buildingId]),
  });
}
