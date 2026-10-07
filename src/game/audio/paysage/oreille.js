// L'OREILLE DU PAYSAGE SONORE (docs/PLAN-AMBIANCE-SONORE.md § 3.1 et § 3.5). Pur.
//
// L'oreille est posée au-dessus du CENTRE DE L'ÉCRAN (décision de Raph, 2026-10-07),
// et le zoom règle sa hauteur. Zoomé, elle frôle le sol : une libellule à deux cases
// s'entend. Dézoomé, elle monte : tout s'éloigne, et le proche cède la place à la
// rumeur lointaine. Le dézoom n'a pas de code à lui, c'est la distance qui le fait.
//
// Deux grandeurs suffisent :
//   · la PROXIMITÉ p (0..1), tirée du zoom sur une échelle logarithmique : elle
//     règle le passage du proche au lointain (fondu à puissance constante) et la
//     fermeture du passe-bas du proche (l'air mange l'aigu, comme chez Factorio 2.1) ;
//   · la HAUTEUR h (cases) : une source à r cases au sol est à √(r² + h²) de l'oreille.
//
// Les seuils sont des molettes du banc d'écoute (paysage/banc.js) : on les règle à
// l'oreille, pas à la règle. Les valeurs de départ se calaient sur l'image (la petite
// vie s'efface entre les zooms 0,62 et 0,5, iso/isoVie.js, vieZoomFade) ; Raph les a
// réglées au banc le 2026-10-07 : zLoin 0,42 (au lieu de 0,45), hauteur 4,3 (au lieu
// de 3,6) — l'oreille un peu plus haut, le proche un peu plus lointain.
export const OREILLE = {
  zLoin: 0.42,     // zoom où la proximité tombe à 0 : seule la rumeur reste
  zPres: 1.4,      // zoom où elle vaut 1 : tout le proche s'entend
  h0: 4.3,         // hauteur de l'oreille au zoom 1, en cases (h = h0 / zoom)
  panMax: 0.6,     // jamais une source dans une seule oreille
  fHaut: 16000,    // passe-bas du proche, grand ouvert (p = 1)…
  fBas: 3000,      // …et fermé (p = 0)
};

const lisse = (t) => t * t * (3 - 2 * t);

// Proximité au zoom `zoom` : 0 sous zLoin, 1 au-dessus de zPres, en S entre les deux.
export function proximite(zoom, o = OREILLE) {
  if (!(zoom > 0) || !(o.zPres > o.zLoin)) return 0;
  const a = Math.log(o.zLoin), b = Math.log(o.zPres);
  const t = (Math.log(zoom) - a) / (b - a);
  return lisse(Math.max(0, Math.min(1, t)));
}

// Hauteur de l'oreille (cases) au zoom `zoom`.
export function hauteur(zoom, o = OREILLE) {
  return o.h0 / Math.max(0.05, zoom || 0);
}

// Gain d'une source à `r` cases au sol, l'oreille à `h` cases de haut. `ref` : la
// distance (oreille → source) où le gain vaut ½ ; `max` : au-delà, le silence, atteint
// en fondu sur le dernier quart (une source qui s'éloigne ne s'éteint pas d'un coup).
export function attenuation(r, h, ref, max) {
  const d = Math.sqrt(r * r + h * h);
  if (!(d < max)) return 0;
  const q = d / ref;
  return (1 / (1 + q * q)) * Math.min(1, (max - d) / (max * 0.25));
}

// Panoramique d'une source vue à l'abscisse `sx` d'un écran large de `cw` : la
// position À L'ÉCRAN, gauche ou droite, bornée à ±panMax.
export function panoramique(sx, cw, panMax = OREILLE.panMax) {
  if (!(cw > 0)) return 0;
  const u = (sx - cw / 2) / (cw / 2);
  return Math.max(-1, Math.min(1, u)) * panMax;
}

// Le fondu du proche au lointain, à PUISSANCE CONSTANTE (cosinus et sinus) : la somme
// des carrés vaut 1, le volume ne se creuse pas au milieu du zoom.
export function fondu(p) {
  const s = (1 - Math.max(0, Math.min(1, p))) * Math.PI / 2;
  return { proche: Math.cos(s), loin: Math.sin(s) };
}

// Coupure du passe-bas du proche (Hz) : géométrique entre fBas (p = 0) et fHaut (p = 1).
export function coupure(p, o = OREILLE) {
  return o.fBas * Math.pow(o.fHaut / o.fBas, Math.max(0, Math.min(1, p)));
}
