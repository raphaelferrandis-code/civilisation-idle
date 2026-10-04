// LES PRÉS — des zones d'herbe, pas un tapis uniforme (docs/PLAN-VEGETATION.md, lot 4).
//
// Le voile de prés d'avant (GRASS_DETAIL.meadow) plafonnait à 8 % d'alpha, dosé losange
// par losange : sur des centaines de cellules, l'herbe était partout la même. Le monter
// aurait montré la grille (4 refus de ton par cellule). Les prés sont maintenant un champ
// LISSÉ, peint comme le sous-bois (une image d'un pixel par cellule sous la transformée
// iso, cf. isoForestFloor.drawCellVeil) :
//  - HERBE GRASSE, vert profond, près de l'eau (`water` cellules du fleuve) et dans les
//    creux du bruit ;
//  - HERBE SÈCHE, blond doré, loin de l'eau sur les bosses du bruit ;
//  - entre les deux, l'herbe telle quelle.
// L'automne sèche les prés (×`autumn`), l'hiver les couvre (rien).
// Molette : __meadow(false) | ({ dry, wet, scale, water }).
import { CM, cmLifeDistance } from '../layout.js';
import { AUTUMN, WINTER } from '../seasonMode.js';
import { vegNoise } from './vegNoise.js';
import { solInvalidate } from './solInvalidate.js';

export const MEADOW = {
  on: true, scale: 13, water: 6,
  dry: 0.17, dryCol: [204, 190, 112],
  wet: 0.2, wetCol: [30, 64, 38],
  autumn: 1.35,
};
if (typeof window !== 'undefined') {
  window.__meadow = (o) => {
    if (o === false) MEADOW.on = false;
    else if (o && typeof o === 'object') Object.assign(MEADOW, { on: true }, o);
    else MEADOW.on = true;
    solInvalidate('all');
    return { ...MEADOW };
  };
}

// Sécheresse en (gx, gy) : −1 herbe grasse … +1 herbe sèche. Mémoïsée sur le layout
// (la distance au fleuve en dépend) et les réglages.
export function meadowAt(L) {
  const sig = MEADOW.scale + ':' + MEADOW.water;
  if (L._meadowAt && L._meadowAt.sig === sig) return L._meadowAt.at;
  const river = (L.river && L.river.present && L.river.cells) || null;
  const W = MEADOW.water;
  const dist = river && river.size ? cmLifeDistance(L.gridN | 0, [river], W) : null;
  const at = (gx, gy) => {
    let s = (vegNoise(gx, gy, MEADOW.scale, 5) - 0.5) * 2.6;
    if (dist) { const d = dist.at(gx, gy); if (d <= W) s -= 1.3 * (1 - d / (W + 1)); }
    return s < -1 ? -1 : s > 1 ? 1 : s;
  };
  L._meadowAt = { sig, at };
  return at;
}

// ── LA PELOUSE DE VILLE (lot 5, 2026-10-04) ──────────────────────────────────
// Les jardins, les cours et l'air des îlots (L.townGreen) et la friche d'un quartier
// (courField → 'grass') étaient un morceau de campagne découpé dans le pavé : même
// tuile sombre, mêmes touffes, mêmes fleurs que la forêt — une tache de moquette
// (capture de Raph). C'est maintenant une herbe ENTRETENUE : plus claire et plus
// régulière (voile clair, lissé comme les prés), sans touffes ni herbes folles, et des
// fleurs seulement en MASSIF au cœur du jardin (cellules dont les 8 voisines sont de la
// pelouse). ⛔ La couture avec le pavé n'est PAS décorée (7 refus) : c'est la matière
// qui change, pas son bord.
// Molette : __lawn(false) | ({ alpha, col }) ; la part de fleurs du massif est LAWN_FLOWER_P
// (isoGroundDetail).
export const LAWN = { on: true, alpha: 0.16, col: [178, 204, 120] };
if (typeof window !== 'undefined') {
  window.__lawn = (o) => {
    if (o === false) LAWN.on = false;
    else if (o && typeof o === 'object') Object.assign(LAWN, { on: true }, o);
    else LAWN.on = true;
    solInvalidate('all');
    return { ...LAWN };
  };
}
// Pelouse de ville en (gx, gy) : 0 herbe sauvage, 1 pelouse, 2 cœur de pelouse.
// `cour` : courField du layout (isoTissu.courOf), passé par l'appelant (pas d'import ici).
export function townLawnAt(L, cour) {
  if (!LAWN.on || !L) return null;
  if (L._townLawn) return L._townLawn;
  const green = L.townGreen || null;
  const is = (gx, gy) => {
    const k = gx + ',' + gy;
    return !!((green && green.has(k)) || (cour && cour.get && cour.get(k) === 'grass'));
  };
  if (!(green && green.size) && !(cour && cour.size)) { L._townLawn = () => 0; return L._townLawn; }
  const at = (gx, gy) => {
    if (!is(gx, gy)) return 0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if ((dx || dy) && !is(gx + dx, gy + dy)) return 1;
    return 2;
  };
  L._townLawn = at;
  return at;
}

// Remplit le pixel RGBA `o` de l'image du voile pour la cellule (gx, gy) ; false si rien.
// `lawn` (townLawnAt) : la pelouse de ville prend son voile clair, pas celui des prés.
export function meadowPixel(L, lawn = null) {
  const winter = CM.season === WINTER;
  if (winter || (!MEADOW.on && !lawn)) return null;
  const at = meadowAt(L);
  const k = CM.season === AUTUMN ? MEADOW.autumn : 1;
  const { dry, wet, dryCol, wetCol } = MEADOW;
  const lc = LAWN.col, la = Math.round(LAWN.alpha * 255);
  return (gx, gy, d, o) => {
    if (lawn && lawn(gx, gy)) { d[o] = lc[0]; d[o + 1] = lc[1]; d[o + 2] = lc[2]; d[o + 3] = la; return true; }
    if (!MEADOW.on) return false;
    const s = at(gx, gy);
    const c = s > 0 ? dryCol : wetCol;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
    const a = s > 0 ? s * dry * k : -s * wet;
    d[o + 3] = Math.round(Math.min(1, a) * 255);
    return a > 0.004;
  };
}
