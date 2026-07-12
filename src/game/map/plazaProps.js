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

// Les props du kit et les grappes d'ère produites. Le banc existe aussi en
// variantes DIRECTIONNELLES (`bench-‹n|s|e|w›-‹ère›`) pour être tourné vers le
// centre selon le bord ; le buisson complète les bacs fleuris sur les contours.

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
// La DALLE de sol (`paving-*`) est dessinée dans le cache STATIQUE de la carte :
// quand une tuile finit de décoder, on notifie l'appelant (renderWorld) pour qu'il
// invalide ce cache, sinon le sol resterait sur la couleur de repli jusqu'au
// prochain re-bake fortuit (caméra, zoom, cycle jour/nuit).
let onPavingLoad = null;
function setPlazaPropOnLoad(cb) { onPavingLoad = cb; }
function ensureKey(key) {
  if (propImg[key] || typeof Image === 'undefined') return;
  const im = new Image();
  if (key.indexOf('paving') === 0) im.onload = () => { if (onPavingLoad) onPavingLoad(); };
  im.src = '/pixelart/plazas/' + key + '.png';
  propImg[key] = im;
}
// Clé du sprite. `variant` (optionnel) insère un suffixe AVANT l'ère — sert aux
// bancs directionnels : keyFor('bench',band,'n') → 'bench-n-‹ère›'. Sans variant,
// on garde l'ancien nommage 'prop-‹ère›' (rétro-compatible).
function keyFor(prop, band, variant) {
  const era = plazaEraForBand(band);
  return variant ? prop + '-' + variant + '-' + era : prop + '-' + era;
}

// Sprite du prop (éventuellement d'une variante) pour cette bande chargé et
// décodé ? (déclenche le chargement paresseux)
function plazaPropReady(prop, band, variant) {
  const key = keyFor(prop, band, variant);
  ensureKey(key);
  const im = propImg[key];
  return !!(im && im.complete && im.naturalWidth > 0);
}

// Blit d'un prop ANCRÉ AU SOL : centré en x sur `xPx`, base (pieds) posée sur
// `yPx`, le sprite montant vers le haut — convention naturelle d'un objet en vue
// 3/4 (le point d'ancrage = là où il touche le dallage). `hPx` = hauteur écran
// cible ; la largeur suit le ratio natif du PNG (pas de déformation).
function blitPlazaProp(ctx, prop, band, xPx, yPx, hPx, variant) {
  const key = keyFor(prop, band, variant);
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

// Accès à l'IMAGE chargée d'un prop (ou null) — pour un rendu qui n'est pas un
// simple blit ancré : la dalle de sol se TUILE cellule par cellule (voir
// cityMapDrawPlazaSurface), donc l'appelant pilote lui-même le drawImage.
function plazaPropImage(prop, band, variant) {
  const key = keyFor(prop, band, variant);
  ensureKey(key);
  const im = propImg[key];
  return (im && im.complete && im.naturalWidth > 0) ? im : null;
}

// ── ANIMATIONS BAKÉES (frames PixelLab) ─────────────────────────────────────
// Miroir du système `ANIM_BANDS`/`blitAnim` de cityEngineSprites : un strip
// HORIZONTAL /pixelart/plazas/anim/<prop>-<ère>.png de `frames` images `fw×fh`.
// Sert d'abord à la FONTAINE (eau animée baké-pixel, remplace l'eau procédurale
// quand le strip existe). Chargement paresseux ; repli = sprite statique.
const plazaAnimImg = {};
const PLAZA_ANIM_FRAMES = 8, PLAZA_ANIM_MS = 120;   // strips = 8 frames côte à côte
const animKey = (prop, band) => prop + '-' + plazaEraForBand(band);
function ensurePlazaAnim(key) {
  if (plazaAnimImg[key] || typeof Image === 'undefined') return;
  const im = new Image();
  im.src = '/pixelart/plazas/anim/' + key + '.png';
  plazaAnimImg[key] = im;
}
// Strip d'anim du prop pour cette bande chargé et décodé ?
function plazaAnimReady(prop, band) {
  const key = animKey(prop, band);
  ensurePlazaAnim(key);
  const im = plazaAnimImg[key];
  return !!(im && im.complete && im.naturalWidth > 0);
}
// Blit de la FRAME COURANTE (∝ now) ANCRÉE AU SOL (base = yPx), hauteur `hPx`.
// `fw`/`fh` sont DÉDUITS du strip (largeur/8 × hauteur) → marche pour n'importe
// quelle ère sans méta dédiée (chaque fontaine recadrée a ses propres dimensions).
function blitPlazaAnim(ctx, prop, band, xPx, yPx, hPx, now) {
  const key = animKey(prop, band);
  ensurePlazaAnim(key);
  const im = plazaAnimImg[key];
  if (!im || !(im.naturalWidth > 0)) return false;
  const fw = im.naturalWidth / PLAZA_ANIM_FRAMES, fh = im.naturalHeight;
  const frame = Math.floor((now || 0) / PLAZA_ANIM_MS) % PLAZA_ANIM_FRAMES;
  const ratio = fw / fh, drawH = hPx, drawW = hPx * ratio;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, frame * fw, 0, fw, fh, xPx - drawW / 2, yPx - drawH, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

export {
  plazaEraForBand,
  plazaPropReady,
  plazaPropImage,
  plazaAnimReady,
  blitPlazaAnim,
  setPlazaPropOnLoad,
  blitPlazaProp,
};
