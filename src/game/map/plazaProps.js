/* eslint-disable */
// ============================================================================
// plazaProps.js — Registre de sprites pixel-art pour le MOBILIER DES PLACES.
//
//   Même patron que les props des scènes de moteur (cityEngineSprites.js) :
//   un registre d'Image() chargé paresseusement, un test `ready` et un blit
//   `imageSmoothingEnabled=false`. Le RENDU procédural d'origine reste le REPLI :
//   tant qu'un sprite n'est pas prêt, renderWorld.js dessine la forme vectorielle
//   (aucune régression).
//
//   Voie A (visuel seul) : on ne touche NI le modèle de données des places
//   (`{gx,gy,size,kind}`, cellules rang "plaza"), NI la génération. On remplace
//   uniquement le dessin du mobilier, aux mêmes emplacements déterministes
//   (graine `seedH` par place → chaque place reste unique et stable entre frames).
//
//   DÉCLINAISON PAR ÈRE : chaque prop existe en 5 « grappes » d'ère, choisies
//   depuis la bande d'ère de la carte (voir plazaEraForBand). Fichiers :
//   /pixelart/plazas/<prop>-<ère>.png (fond transparent, DA 3/4 léger, lumière
//   sud-est, palette antique chaude — cf. public/pixelart/README.md).
//   Remap palette : `node scripts/remapPalette.mjs --dir public/pixelart/plazas`.
// ============================================================================

// Les props du kit et les grappes d'ère produites.
const PLAZA_PROPS = ['lamppost', 'bench', 'fountain', 'flag', 'planter'];
const PLAZA_ERAS = ['antique', 'classique', 'industrielle', 'moderne', 'futuriste'];

// Bande d'ère (0..9) → grappe d'ère du prop. Les places n'apparaissent qu'à
// partir de band 2 (pierre) ; on renvoie 'antique' par sûreté en deçà.
//   2-3 pierre/couronne → antique   ·   4 marbre → classique
//   5 fonte → industrielle          ·   6 néon → moderne
//   7-9 noosphère/stellaire/démiurge → futuriste
function plazaEraForBand(band) {
  const b = band | 0;
  if (b <= 3) return 'antique';
  if (b === 4) return 'classique';
  if (b === 5) return 'industrielle';
  if (b === 6) return 'moderne';
  return 'futuriste';
}

// Chargement PARESSEUX par clé (`<prop>-<ère>`) : on ne charge que ce qui sert.
const propImg = {};
function ensureKey(key) {
  if (propImg[key] || typeof Image === 'undefined') return;
  const im = new Image();
  im.src = '/pixelart/plazas/' + key + '.png';
  propImg[key] = im;
}
function keyFor(prop, band) { return prop + '-' + plazaEraForBand(band); }

// Sprite du prop pour cette bande chargé et décodé ? (déclenche le chargement)
function plazaPropReady(prop, band) {
  const key = keyFor(prop, band);
  ensureKey(key);
  const im = propImg[key];
  return !!(im && im.complete && im.naturalWidth > 0);
}

// Blit d'un prop ANCRÉ AU SOL : centré en x sur `xPx`, base (pieds) posée sur
// `yPx`, le sprite montant vers le haut — convention naturelle d'un objet en vue
// 3/4 (le point d'ancrage = là où il touche le dallage). `hPx` = hauteur écran
// cible ; la largeur suit le ratio natif du PNG (pas de déformation).
function blitPlazaProp(ctx, prop, band, xPx, yPx, hPx) {
  const key = keyFor(prop, band);
  ensureKey(key);
  const im = propImg[key];
  if (!im || !(im.naturalWidth > 0)) return false;
  const ratio = im.naturalWidth / im.naturalHeight;
  const drawH = hPx, drawW = hPx * ratio;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, xPx - drawW / 2, yPx - drawH, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

// Variante CENTRÉE (prop posé à plat vu du dessus, ex. fontaine/parterre) :
// (xPx,yPx) est le CENTRE du sprite, taille `hPx` de haut.
function blitPlazaPropCentered(ctx, prop, band, xPx, yPx, hPx) {
  const key = keyFor(prop, band);
  ensureKey(key);
  const im = propImg[key];
  if (!im || !(im.naturalWidth > 0)) return false;
  const ratio = im.naturalWidth / im.naturalHeight;
  const drawH = hPx, drawW = hPx * ratio;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, xPx - drawW / 2, yPx - drawH / 2, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

export {
  plazaEraForBand,
  plazaPropReady,
  blitPlazaProp,
  blitPlazaPropCentered,
  PLAZA_PROPS,
  PLAZA_ERAS,
};
