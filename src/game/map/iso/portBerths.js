"use strict";
// ── LES NAVIRES À QUAI, ET CE QUE LA FLOTTE DOIT SAVOIR DES PORTS ───────────────
// (docs/PLAN-PORTS.md §5, contrat avec la session des bateaux, 2026-10-01)
//
// · `drawMooredHull` — UNE indirection pour tout navire posé à quai par les ports
//   (terminal de commerce, bassin du Vieux-Port). D'abord les coques DESSINÉES PAR
//   LE CODE de la session des bateaux (iso/boatKit.js, drawMooredKit : cargos de
//   l'ère au terminal, plaisance d'époque au bassin) ; repli sur les sprites
//   boat-<métier>-<secteur> là où l'ère n'a pas de modèle. Aucun décalage codé
//   ailleurs sur BOAT_SIZES × échelle.
// · `hullFootprint` — longueur et largeur d'une coque, en tuiles (mêmes sources ;
//   `kit: true` quand la coque vient du kit).
// La flotte MOBILE (riverFleet) reste à la session des bateaux : rien ici ne
// simule de navigation.
import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { isoArt } from './isoArt.js';
import { boatSector, BOAT_IMG_TOP } from './isoFleet.js';
import { noteReflection } from './isoReflect.js';
import { drawSunShadow } from './isoSunShadow.js';
import { snapDev } from '../blitSnap.js';
import { ensureQuayGate } from '../quaysAndRiot.js';
import { drawMooredKit, mooredFootprint } from './boatKit.js';

// Rôle → sprite et échelle (unité : la largeur de dessin du sprite en tuiles). Les
// échelles marchandes de la FLOTTE (FLEET_SCALE × 0,7 × 1,15) sont écrêtées pour passer
// sous le pont ; un navire À QUAI ne navigue pas : le cargo du terminal reprend une
// taille de cargo face aux portiques (×1,45), le vapeur des docks ×1,3.
const HULLS = {
  container: { key: 'container', w: 0.7 * 2.6 * 1.15 * 1.45, len: 2.6, beam: 0.6 },
  steam: { key: 'steam', w: 0.7 * 2.4 * 1.15 * 1.3, len: 2.1, beam: 0.52 },
  sail: { key: 'sail', w: 0.7 * 1.8 * 1.15, len: 1.15, beam: 0.36 },
  fisher: { key: 'fisher-row', w: 0.7 * 1.3 * 1.15, len: 0.7, beam: 0.26 },
  motorboat: { key: 'motorboat', w: 0.7 * 1.25 * 1.15, len: 0.75, beam: 0.28 },
  dinghy: { key: 'dinghy', w: 0.7 * 1.1 * 1.15, len: 0.6, beam: 0.24 },
  rowboat: { key: 'rowboat', w: 0.7 * 1.0 * 1.15, len: 0.55, beam: 0.22 },
};

const curBand = () => (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0;

// ⚠ Les longueurs du kit ne sont pas celles des sprites (porte-conteneurs 2,4 tuiles,
// vedette 0,94, annexe 0,5) : les postes se cotent TOUJOURS par ici, à la bande du plan.
export function hullFootprint(role, band = curBand()) {
  const fp = mooredFootprint(role, band);
  if (fp) return { len: fp.len, beam: fp.beam, kit: true };
  const h = HULLS[role] || HULLS.sail;
  return { len: h.len, beam: h.beam };
}

// Un navire amarré : (x, y) en tuiles monde = centre de la coque, `heading` = cap
// ÉCRAN (rad), `z` = niveau de l'EAU par rapport au sol, en tuiles (négatif au pied
// d'un mur de quai). Reflet à la ligne de flottaison et ombre du soleil, comme la flotte.
// ⚠ Retour Raph (2026-10-02, capture du bassin) : « les bateaux sont dans le mur ».
// Posés au niveau du sol, les bateaux amarrés au pied d'un quai chevauchaient la face
// du mur, qui pend sous la margelle jusqu'à l'eau : un bateau à quai flotte EN BAS.
export function drawMooredHull(ctx, { role, heading, x, y, z = 0, now = 0, bob = true, band = null }) {
  // Le kit pose coque, reflet, ombre et roulis ; il rend false sans modèle pour l'ère.
  if (drawMooredKit(ctx, { role, heading, x, y, z, now, bob, band })) return true;
  const h = HULLS[role] || HULLS.sail;
  const art = isoArt('boat-' + h.key + '-' + boatSector(heading));
  if (!art || !art.ready) return false;
  const T = CM.TILE, s = T * CM.cam.zoom;
  const p = worldToScreen(x * T, y * T, z * T);
  const dw = Math.max(1, snapDev(s * h.w));
  if (p.x < -dw || p.x > CM.cw + dw || p.y < -dw || p.y > CM.ch + dw) return false;
  const dy = bob ? Math.sin((now || 0) / 1500 + x * 1.7 + y) * s * 0.012 : 0;
  const bx = snapDev(p.x - dw / 2), by = snapDev(p.y - dw * BOAT_IMG_TOP + dy);
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  noteReflection(ctx, art.img, bx, by, dw, dw, 0, 0, 0, 0, 'column', 'water');
  drawSunShadow(ctx, art.img, bx, by, dw, dw, 0, 0, 0, 0, 'column', false);
  ctx.drawImage(art.img, bx, by, dw, dw);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

// Bord d'eau PEINT (le ruban, pas le riverSet) d'une rive au droit d'une colonne.
export function riverEdgeAt(sm, x, side) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < sm.length - 1; i += 1) {
    const a = sm[i], b = sm[i + 1];
    if ((a.x - x) * (b.x - x) <= 0 && Math.abs(b.x - a.x) > 1e-6) {
      const f = (x - a.x) / (b.x - a.x), y = a.y + (b.y - a.y) * f, hw = (a.hw || 2) + ((b.hw || 2) - (a.hw || 2)) * f;
      return side === 'N' ? y - hw : y + hw;
    }
    const d = Math.abs(a.x - x);
    if (d < bd) { bd = d; bi = i; }
  }
  const s = sm[bi];
  return side === 'N' ? s.y - (s.hw || 2) : s.y + (s.hw || 2);
}
// `j0`, `j1` : la fenêtre de segments à tester. ⚠ À FOURNIR pour une cuisson : sans
// elle, chaque pixel parcourait les ~370 échantillons du fleuve (mesuré : 726 ms sur
// les 1,1 s de la première image d'un port). Cf. riverWindow.
export function riverWaterAt(sm, wx, wy, T, j0 = 0, j1 = sm.length - 1) {
  const x = wx / T, y = wy / T;
  let bd = Infinity, hw = 2;
  for (let j = Math.max(0, j0); j < Math.min(sm.length - 1, j1); j += 1) {
    const a = sm[j], b = sm[j + 1];
    if (Math.max(a.x, b.x) < x - 8 || Math.min(a.x, b.x) > x + 8) continue;
    const tx = b.x - a.x, ty = b.y - a.y, l2 = tx * tx + ty * ty || 1e-9;
    const f = Math.max(0, Math.min(1, ((x - a.x) * tx + (y - a.y) * ty) / l2));
    const qx = a.x + tx * f, qy = a.y + ty * f, d = Math.hypot(x - qx, y - qy);
    if (d < bd) { bd = d; hw = (a.hw || 2) + ((b.hw || 2) - (a.hw || 2)) * f; }
  }
  return bd < hw - 0.02;
}


// ── POSTES D'AMARRAGE ET EMPRISES DANS L'EAU (contrat avec la session des bateaux) ──
// Chaque port publie ce qu'il sait par un FOURNISSEUR (pas d'import croisé : ce
// module ne connaît aucun port) : fn(L) → { berths: [...], water: [{ x, y, r }] }.
//   berths : { id, kind: 'central'|'commerce'|'plaisance', x, y (tuiles monde, centre
//            de coque), heading (cap écran, rad), axis ({x,y} monde, le long du quai),
//            maxLen (tuiles), decor (un navire-décor y est déjà peint) } ;
//   water  : des disques (tuiles monde) que la flotte doit contourner.
const _providers = new Map();
export function registerPortProvider(kind, fn) { if (typeof fn === 'function') _providers.set(kind, fn); }
function collect(L) {
  const berths = [], water = [];
  if (!L) return { berths, water };
  for (const fn of _providers.values()) {
    try {
      const r = fn(L);
      if (r && r.berths) berths.push(...r.berths);
      if (r && r.water) water.push(...r.water);
    } catch { /* un port mal posé ne prive pas les autres */ }
  }
  return { berths, water };
}
export function portBerths(L) { return collect(L).berths; }
// Au format de riverIslandObstacles (isoFleet.js) : { t, lat, r, id }, t = position le
// long du ruban (index de sample / (n − 1)), lat = écart à l'axe sur la normale
// (−ty, tx), r = rayon en tuiles (plancher 0,35, cf. la note de riverIslandObstacles).
export function portWaterObstacles(L) {
  const sm = L && L.river && L.river.samples;
  if (!sm || sm.length < 2) return [];
  const len = sm.length, out = [];
  for (const o of collect(L).water) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < len; i += 1) { const dd = (sm[i].x - o.x) ** 2 + (sm[i].y - o.y) ** 2; if (dd < bd) { bd = dd; bi = i; } }
    const a = sm[Math.max(0, bi - 1)], b = sm[Math.min(len - 1, bi + 1)];
    let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    out.push({ t: bi / Math.max(1, len - 1), lat: (o.x - sm[bi].x) * -ty + (o.y - sm[bi].y) * tx, r: Math.max(0.35, o.r || 0.5), id: o.id || 'port' });
  }
  return out;
}

// Fenêtre de segments du fleuve qui bordent un intervalle de x (tuiles), marge comprise.
export function riverWindow(sm, x0, x1, margin = 10) {
  let j0 = sm.length, j1 = 0;
  for (let j = 0; j < sm.length; j += 1) {
    if (sm[j].x < x0 - margin || sm[j].x > x1 + margin) continue;
    if (j < j0) j0 = j; if (j > j1) j1 = j;
  }
  return j0 > j1 ? [0, sm.length - 1] : [Math.max(0, j0 - 1), Math.min(sm.length - 1, j1 + 1)];
}

// ── LES RÉVERBÈRES DES PORTS (au format d'isoStreet.isoLamps) ───────────────────
// { wx, wy (px monde), gx, gy, d (profondeur), s (graine) } : ils héritent du dessin de
// mât de l'ère, des halos de nuit et du plafond d'allumage des rues. Mêmes fournisseurs
// que les postes, par port.
const _lampProviders = new Map();
export function registerPortLamps(kind, fn) { if (typeof fn === 'function') _lampProviders.set(kind, fn); }
let _lampKey = '', _lamps = [];
export function portLampList(L, band) {
  if (!L || !_lampProviders.size) return [];
  const key = (CM.layoutRecomputeAt || 0) + ':' + band;
  if (key === _lampKey) return _lamps;
  const out = [];
  for (const fn of _lampProviders.values()) {
    try { const r = fn(L, band); if (r && r.length) out.push(...r); } catch { /* un port mal posé n'éteint pas les autres */ }
  }
  _lampKey = key; _lamps = out;
  return out;
}

// Où le quai du fleuve reprend, de part et d'autre d'une coupure de port (rive où le
// masque marque la coupure comme « port », cf. quaysAndRiot.dockPlus/dockMinus).
// ⚠ Retour Raph (2026-10-04) : « une partie du quai n'apparaît pas aux alentours du
// port » — un trou d'eau entre le bout du quai et la tour du Vieux-Port. Le quai du
// fleuve (isoQuay) finit au BORD D'EAU de son dernier sample (centre + rive × normale
// × hw), pas à l'abscisse du centre : là où le fleuve passe en biais, les deux
// s'écartent de |nx|·hw (0,7 tuile mesurée), et le raccord, parti du centre, laissait
// ce trou d'un côté du port (de l'autre, il chevauchait). Le raccord mord de 0,1 tuile
// sur le dernier segment du quai : bord à bord, un trait d'eau d'un pixel restait.
// ⚠ DEUX PORTS CÔTE À CÔTE (Vieux-Port et commerce) : leurs coupures se suivent sans
// sample de quai entre elles. On s'arrête à la coupure du VOISIN (pas de raccord de ce
// côté, les deux maçonneries se touchent) : la recherche la traversait jusqu'au quai
// suivant, et le terre-plein du commerce fermait l'entrée du bassin, quand le bassin ne
// glissait pas une dalle de douze tuiles sous le commerce.
// `side` : la rive du port APPELANT, au signe des masques (+1 = dockPlus, la rive S d'un
// fleuve ouest → est ; −1 = dockMinus, la rive N). ⚠ Audit du 2026-10-05 (BUG-94) : sans
// lui, la boucle rendait le raccord de la PREMIÈRE rive coupée dans [x0, x1] — un
// terminal de commerce en face du bassin (rive S) effaçait les raccords du Vieux-Port, ou
// les calait sur la rive d'en face, en travers du fleuve. Omis : les deux rives, comme avant.
export function quayJoin(sm, x0, x1, side = 0) {
  ensureQuayGate();
  const g = CM.quayGate;
  if (!g || !g.dockPlus) return null;
  // Le bord d'eau d'un sample, comme isoQuay le trace : centre + rive × normale × hw.
  const bank = (k, s) => {
    const a = sm[Math.max(0, k - 1)], b = sm[Math.min(sm.length - 1, k + 1)];
    const tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
    return { x: sm[k].x - s * (ty / tl) * sm[k].hw, y: sm[k].y + s * (tx / tl) * sm[k].hw };
  };
  for (const [s, draw, dock] of [[1, g.drawPlus, g.dockPlus], [-1, g.drawMinus, g.dockMinus]]) {
    if (side && s !== side) continue;                    // la rive d'en face : pas la nôtre
    let iMin = -1, iMax = -1;
    for (let i = 0; i < sm.length; i += 1) {
      if (!dock[i] || sm[i].x < x0 - 0.6 || sm[i].x > x1 + 0.6) continue;
      if (iMin < 0) iMin = i;
      iMax = i;
    }
    if (iMin < 0) continue;
    let l = iMin - 1, r = iMax + 1;
    while (l > 0 && !draw[l] && !dock[l]) l -= 1;
    while (r < sm.length - 1 && !draw[r] && !dock[r]) r += 1;
    // Les bouts du quai (au bord d'eau), rangés de part et d'autre du milieu du port ;
    // `yL`/`yR` : l'ordonnée de ce bord d'eau, pour qu'un raccord parte À SA HAUTEUR
    // (null : pas de quai de ce côté).
    let xL = x0, xR = x1, yL = null, yR = null;
    for (const k of [l, r]) {
      if (dock[k] || !draw[k]) continue;                 // le port voisin, ou le bout du fleuve
      const e = bank(k, s);
      if (e.x < (x0 + x1) / 2) { if (e.x - 0.1 < xL) { xL = e.x - 0.1; yL = e.y; } } else if (e.x + 0.1 > xR) { xR = e.x + 0.1; yR = e.y; }
    }
    return { xL, xR, yL, yR };
  }
  return null;
}

