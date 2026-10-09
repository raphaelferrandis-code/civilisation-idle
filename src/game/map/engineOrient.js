// ── LES BÂTIMENTS-MOTEUR TOURNÉS VERS LEUR RUE (reprise des sprites, 2026-10-09) ──
// Même règle que les maisons (ilotArt.ORIENTED, pixelHouses.orientKeyOf) : un décor qui a
// ses quatre vues présente sa façade à la rue du lot. Le nom de vue de Codex est la
// direction où regarde l'ENTRÉE (art/batiments/regles.json, « rotationPhysique ») :
//   S (rue au sud, +gy)  = la clé nue, vue sud-ouest
//   E (rue à l'est, +gx) = « -fr », vue sud-est
//   N (rue au nord)      = « -bl », vue nord-est
//   W (rue à l'ouest)    = « -br », vue nord-ouest
// Le côté est la façade sur rue que le rendu connaît déjà (isoBuildingFront, mémoïsée sur
// la tuile) : le poussé de la scène vers la rue et la vue désignent ainsi le même côté.
// Chaque DÉCOR d'une scène se tourne sur place (bâtiment, étal, charrette) ; les bandes
// animées et les humains de scène gardent leur dessin.
import { CM } from './layout.js';
import { isoBuildingFront } from './iso/isoGroundDetail.js';
import { ENGINE_ORIENTED_KEYS } from './engineOrientKeys.js';

export const ENGINE_ORIENTED = new Set(ENGINE_ORIENTED_KEYS);
export const ENGINE_ORIENT_SUFFIX = { E: '-fr', N: '-bl', W: '-br' };

const FACE_OF = (f) => (!f ? null : f.dy > 0 ? 'S' : f.dx > 0 ? 'E' : f.dx < 0 ? 'W' : 'N');
// Côté de rue d'une tuile de bâtiment-moteur, ou null (pas de rue, pas de plan).
export function engineFaceOf(t) {
  const rm = CM.layout?.roadMap;
  return rm && t ? FACE_OF(isoBuildingFront(t, rm)) : null;
}

// « <clé>-fr/-bl/-br », construite une fois par couple (le dessin passe ici à chaque blit).
const _keys = new Map();   // clé -> face -> clé tournée
export function engineOrientKey(k, face) {
  if (!face || face === 'S' || !ENGINE_ORIENTED.has(k)) return null;
  let m = _keys.get(k);
  if (!m) _keys.set(k, m = {});
  return m[face] || (m[face] = k + ENGINE_ORIENT_SUFFIX[face]);
}
