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

// Remplit le pixel RGBA `o` de l'image du voile pour la cellule (gx, gy) ; false si rien.
export function meadowPixel(L) {
  if (!MEADOW.on || CM.season === WINTER) return null;
  const at = meadowAt(L);
  const k = CM.season === AUTUMN ? MEADOW.autumn : 1;
  const { dry, wet, dryCol, wetCol } = MEADOW;
  return (gx, gy, d, o) => {
    const s = at(gx, gy);
    const c = s > 0 ? dryCol : wetCol;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
    const a = s > 0 ? s * dry * k : -s * wet;
    d[o + 3] = Math.round(Math.min(1, a) * 255);
    return a > 0.004;
  };
}
