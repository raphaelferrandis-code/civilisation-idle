// ── LA VILLE QUI S'ÉTEINT (docs/PLAN-LISIBILITE.md, chantier E) ─────────────────
// Un regard extérieur, 2026-10-06 : la récompense du jeu, c'est « regarde ce que ma
// civilisation est devenue » — « et ensuite, regarde-la mourir ». La chute a sa vague de
// ruines (isoChute) ; ce qui manquait, c'est l'AGONIE qui la précède : une ville à 60 %
// de Rupture ressemblait à une ville à 10 %, à l'eau trouble et aux étals vides près.
//
// Au-delà de `from` (le palier 50 % des fumées et des émeutes), un FRONT D'ABANDON avance
// du bord de la ville vers son cœur, quartier par quartier : une maison au-delà du front
// est ABANDONNÉE —
//  - la nuit, ses fenêtres ne se rallument plus (houseWindows) : la ville s'éteint par
//    ses faubourgs, le cœur brille seul au milieu du noir ;
//  - le jour, elle est ternie (couleurs passées, un ton plus sombre — même dessin) ;
//  - les colonnes de suie de la crise montent de ces quartiers-là (isoLiveCollect).
// Le cœur (`core`, fraction du rayon) ne s'éteint jamais avant la chute. Le front recule
// si la Rupture redescend : les quartiers se rallument.
//
// Quartiers, pas maisons : le tirage se fait par PATCH de `patch` cases (deux îlots), avec
// un petit écart par maison — des rues entières s'éteignent, quelques fenêtres résistent.
// Aucune image nouvelle, aucun élément ajouté.
// Molette : __decline(false) | ({ from, full, core, ease, … }) ; __decline({ force: 0.9 })
// simule une Rupture (null pour revenir à celle du jeu).
import { CM, cmHash } from './layout.js';
import { state } from '../core/state.js';

export const DECLINE = {
  on: true,
  from: 0.5,      // Rupture où le front part du bord
  full: 1.0,      // Rupture où il atteint le cœur
  core: 0.3,      // fraction du rayon qui ne s'éteint jamais
  ease: 1.5,      // > 1 : lent au départ (à 75 %, ~un tiers de la ville éteinte)
  patch: 10,      // côté d'un quartier tiré d'un bloc (cases)
  jPatch: 0.16,   // écart du quartier (fraction du rayon)
  jHouse: 0.05,   // écart de la maison
  dimL: 0.8,      // luminosité d'une maison abandonnée, le jour
  dimS: 0.5,      // saturation gardée
  force: null,    // Rupture simulée (molette)
};
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__decline = (o) => {
    if (o === false) DECLINE.on = false;
    else if (o && typeof o === 'object') Object.assign(DECLINE, { on: true }, o);
    else DECLINE.on = true;
    dimCache.clear();
    return { ...DECLINE };
  };
}

// La Rupture que lit la carte (0..1).
export function declineLevel() {
  const r = DECLINE.force != null ? DECLINE.force : (state && state.instability) || 0;
  return r < 0 ? 0 : r > 1 ? 1 : r;
}

// Position du front, en fraction du rayon : au-delà (écarts compris), c'est abandonné.
// Au départ il est hors de la ville (1 + les écarts max), à la fin sur le cœur.
export function declineFront(r) {
  const D = DECLINE;
  if (!D.on || r <= D.from) return Infinity;
  const k = Math.pow(Math.min(1, (r - D.from) / Math.max(1e-6, D.full - D.from)), D.ease);
  const start = 1 + D.jPatch + D.jHouse;
  return start - k * (start - D.core);
}

// Géométrie de la ville (centre = cœur du plan, rayon = 95e centile des habitations),
// mémorisée sur le layout.
function geomOf(L) {
  if (L._declineGeom) return L._declineGeom;
  const core = (L.plan && L.plan.core) || { x: L.cx, y: L.cy };
  const ds = [];
  for (const t of L.tiles) if (t.type === 'house' || t.type === 'enginehome') ds.push(Math.hypot(t.gx + 0.5 - core.x, t.gy + 0.5 - core.y));
  ds.sort((a, b) => a - b);
  const R = Math.max(4, ds.length ? ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.95))] : 4);
  L._declineGeom = { x: core.x, y: core.y, R };
  return L._declineGeom;
}

const u01 = (s) => ((cmHash(s) >>> 0) % 10007) / 10006;

// Distance au cœur + écarts (quartier, maison) d'une habitation, gardés sur la tuile.
function scoreOf(t, L) {
  const m = t._decl;
  if (m && m.L === L) return m.s;
  const g = geomOf(L), D = DECLINE;
  const d = Math.hypot(t.gx + 0.5 - g.x, t.gy + 0.5 - g.y) / g.R;
  const p = D.patch | 0 || 10;
  const jp = (u01('declin:q:' + Math.floor(t.gx / p) + ':' + Math.floor(t.gy / p)) * 2 - 1) * D.jPatch;
  const jh = (u01('declin:m:' + t.gx + ':' + t.gy) * 2 - 1) * D.jHouse;
  const s = d + jp + jh;
  t._decl = { L, s };
  return s;
}

// Une CASE est-elle dans un quartier abandonné (réverbères éteints) ? Même front, même
// écart de quartier ; pas d'écart de maison (un mât suit sa rue).
export function isAbandonedAt(gx, gy, L = CM.layout) {
  if (!DECLINE.on || !L || !L.tiles) return false;
  const front = declineFront(declineLevel());
  if (front === Infinity) return false;
  const g = geomOf(L), D = DECLINE, p = D.patch | 0 || 10;
  const d = Math.hypot(gx + 0.5 - g.x, gy + 0.5 - g.y) / g.R;
  const jp = (u01('declin:q:' + Math.floor(gx / p) + ':' + Math.floor(gy / p)) * 2 - 1) * D.jPatch;
  return d + jp > front;
}

// Une habitation (maison, maison-moteur, boutique d'îlot) est-elle abandonnée ?
export function isAbandoned(t, L = CM.layout) {
  if (!DECLINE.on || !L || !t) return false;
  if (t.type !== 'house' && t.type !== 'enginehome' && !t.body) return false;
  const front = declineFront(declineLevel());
  if (front === Infinity) return false;
  return scoreOf(t, L) > front;
}

// ── Le dessin terni ────────────────────────────────────────────────────────────
// Une toile par (image, cadre) : couleurs passées et un ton plus sombre, alpha intact
// (la silhouette, le masque de survol et la découpe des lumières restent ceux du
// dessin d'origine).
const dimCache = new Map();   // image → Map("x:y:w:h" → toile)
export function dimmedCanvas(img, x0, y0, w, h) {
  if (typeof document === 'undefined' || !img || !w || !h) return null;
  let per = dimCache.get(img);
  if (!per) { per = new Map(); dimCache.set(img, per); }
  const k = x0 + ':' + y0 + ':' + w + ':' + h;
  if (per.has(k)) return per.get(k);
  let c;
  try {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, x0, y0, w, h, 0, 0, w, h);
    const id = cx.getImageData(0, 0, w, h), d = id.data;
    const L = DECLINE.dimL, S = DECLINE.dimS;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const y = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      d[i] = (y + (d[i] - y) * S) * L;
      d[i + 1] = (y + (d[i + 1] - y) * S) * L;
      d[i + 2] = (y + (d[i + 2] - y) * S) * L * 1.04;   // l'ombre d'un abandon tire vers le froid
    }
    cx.putImageData(id, 0, 0);
  } catch { c = null; }
  per.set(k, c);
  // Borne : les toiles d'une ère passée ne servent plus.
  if (dimCache.size > 600) dimCache.delete(dimCache.keys().next().value);
  return c;
}
