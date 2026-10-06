// LES TUILES DE SOL, ET LA GRÈVE — la MATIÈRE du sol iso.
//
// Extraites d'isoRenderer.js le 2026-08-23 (Q10). Ce module ne peint rien : il dit
// DE QUOI le sol est fait. Le catalogue des clés PixelLab, la variante tirée par
// cellule, la bascule d'hiver, le découpage d'une tuile en FACES (bbox mesurée une
// seule fois, encarts, voile de lecture), et les tons mesurés de la grève.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, 16 sortantes, deux imports externes. Vérifiée ligne à
// ligne contre la version commitée.
//
// ⚠ L'ORDRE DES DEUX BLOCS EST CELUI D'ORIGINE, et il compte : `isoWinterTile` et
// `beachTone` lisent `BEACH` et les tons, déclarés PLUS BAS. Ce sont des
// `function` exprès (cf. leur commentaire) — en `const` elles tomberaient en zone
// morte au chargement, le piège que ce fichier documente déjà.
//
// ⚠ Ce n'est PAS le peintre du sol (isoGroundBake / isoGroundCells / la pyramide
// solPyramide*), qui importe d'ici. Le blitteur de tuiles `blitIsoTileKey`, lui, vit
// ICI depuis le 2026-08-23 (cf. « LE BLITTEUR » plus bas).
import { CM } from '../layout.js';
import { solInvalidate } from './solInvalidate.js';
import { WINTER } from '../seasonMode.js';
import { pxProbe, recPx } from '../pixelGrid.js';
import { mkCanvas } from '../pixelUtil.js';

// ── Tuiles de SOL PixelLab (post-GO) — /pixelart/iso/<key>.png ────────────────
// Chargées paresseusement ; tant qu'un PNG n'est pas prêt, le losange garde son
// APLAT (repli) → aucune dépendance dure à l'art. bbox mesurée une fois (alpha>16,
// même geste que pixelHouses.contentBBox) : le HAUT du contenu = sommet NORD du
// losange, largeur du contenu → largeur du losange (2·hw). L'épaisseur « thin
// tile » déborde vers le sud : recouverte par les rangées suivantes (le bake
// balaie gy croissant) → lisière naturelle sur les bords sud. Invalide le bake
// sol iso à chaque PNG décodé (sinon l'aplat reste gelé dans le cache).
// wonder → `iso-wonder`, MATIÈRE PROPRE au parvis des merveilles depuis le
// 2026-07-28 (Raph : « je veux une génération pixel lab » pour ces sols) :
// MOSAÏQUE ocre et blanche. Il empruntait jusque-là la tuile de place (iso-plaza), au
// point qu'un parvis de merveille et une place de quartier avaient le même sol —
// rien ne disait que le monument était important. Le prompt et les gardes sont
// dans scripts/fetchGroundTiles.mjs.
export const ISO_TILE_KEYS = { grass: 'iso-grass', dirt: 'iso-dirt', urban: null, plaza: 'iso-plaza', wonder: 'iso-wonder', shingle: 'iso-shingle', sand: 'iso-sand' };
// VARIANTES par matière — public/pixelart/iso/<clé>-1..N.png (scripts/fetchGroundTiles.mjs).
// Clé absente ou N ≤ 1 : tuile unique <clé>.png, comme avant.
//
// ⚠ POURQUOI DES VARIANTES SONT LÉGITIMES ICI, alors que ce fichier répète que
// « toute variation par CELLULE montre la grille » (cf. l'aplat strictement uni
// de drawIsoGround) : le grief visé par cette règle est une variation de TON.
// Quatre tuiles de valeurs différentes tirées au hasard ne cassent pas la
// répétition — elles dessinent un damier clair/sombre qui SOULIGNE la grille,
// donc pire que la tuile unique qu'elles remplacent. Mesuré sur le 1er lot :
// 24,0 d'écart de luminance moyenne entre les variantes d'herbe (1,1 seulement
// pour le pavé — le défaut dépend de la matière, il se mesure). fetchGroundTiles
// les égalise PAR CANAL avant de les écrire, écart ramené à ~0 : ce qui varie
// d'une cellule à l'autre est alors le DESSIN seul, jamais la valeur ni la
// teinte. La règle tient, la variante passe.
export const ISO_TILE_VARIANTS = {
  'iso-wonder': 4,
  'iso-grass': 4, 'iso-dirt': 4, 'iso-plaza': 4,
  // Galets de rivage : les 4 variantes échelonnent le CALIBRE de la pierre, pas
  // la valeur (écart de luminance 1,9 mesuré) — rien à égaliser, cf. le lot
  // 4dc13d54 dans fetchGroundTiles.mjs.
  'iso-shingle': 4, 'iso-shingle-winter': 4,
  // Sable de rivage : réserve de l'ancien lot road-tech, écart 4,0 entre variantes.
  'iso-sand': 4,
  // Dallage de place PAR ÈRE (Raph 2026-07-30 : « je veux des sprites de dalles,
  // pas de traits »). Appareillage en ARCS — le tracé rayonnant qu'il avait
  // refusé était dessiné à la volée par la place ; ici le rayonnement est CUIT
  // dans la matière, donc il tient à tous les zooms et ne coûte rien au bake.
  // ⚠ le moderne n'en a que TROIS : sa 4e variante constellait la place de taches
  // claires au pan (cf. fetchGroundTiles). Le compte doit suivre les FICHIERS —
  // annoncer 4 ferait demander un PNG absent, et blitIsoTileKey rendrait false
  // sur une cellule sur quatre, qui resterait en aplat au milieu du dallage.
  'iso-plaza-antique': 4, 'iso-plaza-medieval': 4, 'iso-plaza-industrial': 4,
  'iso-plaza-modern': 3, 'iso-plaza-cosmic': 4,
  'ground-earth': 4, 'ground-cobble': 4, 'ground-flagstone': 4,
  'ground-concrete': 4, 'ground-tech': 4,
  'road-dirt': 4, 'road-cobble': 4, 'road-stone': 4, 'road-asphalt': 4, 'road-tech': 4,
  'iso-grass-winter': 4, 'ground-earth-winter': 4, 'ground-cobble-winter': 4,
  'ground-flagstone-winter': 4, 'ground-concrete-winter': 4,
};
// Jeu d'HIVER — neige CUITE dans l'art (sprites dédiés demandés par Raph après
// la suppression du liseré/mottes procéduraux qui clignotaient au pan, cf. le
// bloc NEIGE D'HIVER). Résolu au BLIT par CM.season ; la saison fait déjà
// partie de la clé du bake (cityMapRuntime : « elle entre dans la clé du bake du
// sol ») → le cran de saison recuit tout seul, la bascule est gratuite ici.
// Tant que le PNG d'hiver n'est pas décodé, on blitte la tuile d'ÉTÉ (jamais
// d'aplat qui flashe) ; son onload déclenche la recuisson douce habituelle.
// Sans entrée ici (tech, routes, place, dirt sauvage) : la matière reste
// telle quelle en hiver — voulu pour les voies (piétinées/déneigées).
export const ISO_TILE_WINTER = {
  'iso-grass': 'iso-grass-winter',
  'ground-earth': 'ground-earth-winter',
  'ground-cobble': 'ground-cobble-winter',
  'ground-flagstone': 'ground-flagstone-winter',
  'ground-concrete': 'ground-concrete-winter',
};
// ── LA GRÈVE NE PREND PAS LA NEIGE ───────────────────────────────────────────
// Retour Raph, 2026-07-30 : « laisse le sable même quand il neige sur l'île ».
// Ces deux matières étaient DANS la table ci-dessus, au motif qu'« une plage
// couverte n'a plus de couleur propre » — mais c'est justement l'inverse qui se
// voit en jeu : le rivage est la moitié de l'Aiguille (une île de 4,8 tuiles de
// large bordée de 0,8 de sable), et le voir blanchir efface l'île entière dans
// le blanc du reste. Le vrai argument est physique en plus d'être graphique :
// une grève que le ressac lave douze fois par minute ne tient pas la neige.
// Elles vivent donc à part, et `__beach.snow = true` rend l'ancien comportement.
const ISO_TILE_WINTER_BEACH = {
  'iso-shingle': 'iso-shingle-winter',
  'iso-sand': 'iso-shingle-winter',      // pas de sable enneigé dans le lot
};
// Tuile d'hiver d'une matière, grève comprise. ⚠ Déclarée en `function` et non
// en `const` : elle est appelée depuis blitIsoTileKey, plus haut dans le fichier
// que `BEACH` — une const serait en zone morte au chargement (le piège que
// NAV_STAGES a déjà tendu ici).
export function isoWinterTile(key) {
  return ISO_TILE_WINTER[key] || (BEACH.snow ? ISO_TILE_WINTER_BEACH[key] : null);
}
// Ton MOYEN de la grève — aplat de repli du bake, bande de sable, rivage d'île.
// UN seul endroit : ces trois couches se superposent au pixel près, deux règles
// de saison différentes feraient lire la plage en deux matières selon la couche.
export function beachTone(mat) {
  if (CM.season === WINTER && BEACH.snow) return SHINGLE_TONE_WINTER;
  return mat === 'sand' ? SAND_TONE : SHINGLE_TONE;
}
// Clé de la variante d'une cellule, depuis le hash DÉJÀ calculé par l'appelant
// (celui qui décide aussi le miroir) — pas de second cmHash par cellule.
// ⚠ bits 5-6, JAMAIS le bit faible : sur FNV-1a le bit 0 n'est que la parité de
// l'entrée, et un tirage sur 'gx,gy' y donne un damier (8,5 % de voisins
// identiques au lieu de 50 %) que la répartition globale, restée à 50,0 % pile,
// cache complètement. Exportée pour le test.
export function isoVariantKey(key, h) {
  const n = ISO_TILE_VARIANTS[key] || 0;
  return n > 1 ? key + '-' + (1 + ((h >>> 5) % n)) : key;
}
export const isoTileCache = new Map();   // key -> { img, ready, bbox }
export function isoTileBBox(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return null;
  const c = mkCanvas(w, h);
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, 0, 0);
  let data;
  try { data = cx.getImageData(0, 0, w, h).data; } catch { return { x0: 0, y0: 0, w, h }; }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (data[(y * w + x) * 4 + 3] > 16) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, w, h };
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
// Face SUPÉRIEURE seule, MASQUÉE AU LOSANGE — canvas construit une fois au décodage.
// ⚠ Pourquoi un masque et pas un simple recadrage (retour Raph 2026-07-22 : « on voit
// encore les bordures de sol ») : les tuiles PixelLab sont des DALLES EN VOLUME (face
// 2:1 + épaisseur). L'épaisseur ne déborde pas seulement SOUS la pointe sud — ses deux
// faces latérales pendent sous les arêtes SO et SE, donc À L'INTÉRIEUR du rectangle
// (bb.w × bb.w/2). Un crop rectangulaire ne peut pas les retirer : elles se reposaient
// sur chaque voisine → liseré clair au SO + liseré sombre au SE de CHAQUE cellule =
// quadrillage sur tout le sol. Seul un masque losange les enlève. Mesuré : ~500 px
// parasites par tuile de 64.
// Tolérance +0.75 px : les losanges voisins se recouvrent d'un cheveu (comme le +1 px
// du blit) → aucun interstice de fond entre cellules, et on reste loin des faces
// latérales (≥ 6 px de haut). Renvoie null si les pixels sont illisibles (canvas
// teinté) → l'appelant retombe sur le recadrage rectangulaire historique.
// Le pixel (x,y) de la face fw×fh est-il DANS le losange de la cellule ?
// Exporté pour le test : c'est la géométrie qui distingue la face du sol des
// faces latérales de la dalle (ces dernières vivent dans les coins bas du
// rectangle, sous les arêtes SO/SE — exactement ce que le masque doit couper).
export function isoFaceKeeps(x, y, fw, fh, tol = 0.75) {
  const cx = fw / 2, cy = fh / 2;
  return Math.abs(x + 0.5 - cx) / cx + Math.abs(y + 0.5 - cy) / cy <= 1 + tol / cx;
}
function isoTileFace(img, bb) {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h || !bb) return null;
  const fw = bb.w, fh = Math.max(1, Math.round(bb.w / 2));
  let src, dst;
  try {
    const c = mkCanvas(w, h);
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0);
    src = cx.getImageData(0, 0, w, h);
    const fc = mkCanvas(fw, fh);
    const fx = fc.getContext('2d', { willReadFrequently: true });
    fx.imageSmoothingEnabled = false;
    dst = fx.createImageData(fw, fh);
    for (let y = 0; y < fh; y += 1) {
      const sy = bb.y0 + y;
      for (let x = 0; x < fw; x += 1) {
        const sx = bb.x0 + x;
        if (sx >= w || sy >= h) continue;
        if (!isoFaceKeeps(x, y, fw, fh)) continue;
        const si = (sy * w + sx) * 4, di = (y * fw + x) * 4;
        dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1];
        dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = src.data[si + 3];
      }
    }
    fx.putImageData(dst, 0, 0);
    return fc;
  } catch { return null; }
}

// (Le SOUS-PAVAGE du losange — rep×rep sous-losanges pour rétrécir le motif d'une
//  dalle EN VOLUME, avec un inset anti-liseré : isoFaceTiled, isoSubTileRect,
//  isoFaceInset, isoTileIsFlat et la molette __groundTile(rep) — ne servait plus :
//  depuis la regénération des tuiles (2026-07-28, sols puis chaussées), toutes les
//  tuiles en service sont PLATES et NATIVES en 64×32, ou à DÉBORD (herbe), et le
//  court-circuitaient pour être blittées pixel pour pixel (il rééchantillonnait à un
//  ratio non entier et détruisait la grille de pixels). Retiré le 2026-10-06, audit
//  MORT-14. Le grain fin vient du dessin.)
// `exact` : le blit 1:1 quand la grille le permet (cf. S7 dans blitIsoTileKey).
export const groundTileTune = { exact: true };
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  // Molette : __groundTile({ exact: false }) rejoue le +1 px inconditionnel du blit.
  window.__groundTile = (arg) => {
    if (arg && typeof arg === 'object') Object.assign(groundTileTune, arg);
    isoTileCache.forEach((e) => { e.veiled = null; });
    solInvalidate('all');   // le sol est CUIT : sans ça la molette ne se voit pas
    return { ...groundTileTune };
  };
}
// VOILE DE LECTURE cuit dans la face (cf. ROAD_VEIL) : composé UNE FOIS par
// (tuile, voile) et gardé sur l'entrée de cache — coût nul par cellule.
// ⚠ Pourquoi pas un aplat en alpha rempli sur le ruban après le blit, qui aurait
// tenu en deux lignes : le ruban est tracé PAR CELLULE (pavé + bras), et deux
// cellules voisines partagent une arête. Une couche opaque ne le voit pas, une
// couche en ALPHA double-blende le cheveu d'antialiasing du raccord → un
// quadrillage fantôme en travers des rues, précisément ce que les passes-union
// des autres couches (ourlet, gorge, trottoir) existent pour éviter.
// `source-atop` ne peint que les pixels déjà opaques : le masque losange de la
// face est préservé tel quel. Sans face (débord d'herbe, pixels illisibles) on
// rend la face nue — les chaussées sont toutes plates, le cas ne se présente pas.
function isoFaceVeiled(e, veil) {
  const face = e.face;
  if (!face || !veil) return face;
  const sig = veil.join(',');
  if (e.veiled && e.veiled.sig === sig && e.veiled.c) return e.veiled.c;
  try {
    const w = face.width, h = face.height;
    const c = mkCanvas(w, h);
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(face, 0, 0);
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = `rgba(${veil[0]},${veil[1]},${veil[2]},${veil[3]})`;
    cx.fillRect(0, 0, w, h);
    e.veiled = { sig, c };
    return c;
  } catch { return face; }
}

export function ensureIsoTileKey(key) {
  if (!key) return null;
  let e = isoTileCache.get(key);
  if (e) return e;
  e = { img: null, ready: false, bbox: null, face: null, veiled: null, failed: false, over: 0 };
  isoTileCache.set(key, e);
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => {
      // DÉBORD EN PERSPECTIVE (herbe) : PNG 64×(32+OV], OV ≤ 12 — les OV lignes
      // au-dessus du losange sont des brins qui doivent recouvrir le voisin du
      // NORD (le bake balaie nord→sud, cette cellule est peinte après lui).
      // Les dalles en volume ne matchent pas (64×64 et 48×48 dépassent w/2+12).
      const ovh = im.naturalHeight - im.naturalWidth / 2;
      e.over = (ovh > 0 && ovh <= 12) ? ovh : 0;
      e.bbox = isoTileBBox(im);
      // Pas de face masquée pour un débord : le masque losange couperait
      // précisément les brins qu'on veut garder — blit brut depuis e.img.
      e.face = e.over ? null : isoTileFace(im, e.bbox);   // face masquée au losange (une fois)
      e.veiled = null;                    // la face voilée se recompose à la demande
      e.ready = !!e.bbox;
      // Invalidation DOUCE : le bake reste re-blittable, la recuisson (chère sur
      // mégapole) est coalescée par drawIsoWorld — une rafale de décodages au
      // chargement ne paie plus une recuisson par sprite. Pas de bake → rien à
      // faire, la 1re recuisson verra la tuile prête.
      solInvalidate('soft');
    };
    im.onerror = () => { e.failed = true; };   // PNG absent → on garde le repli procédural
    im.src = '/pixelart/iso/' + key + '.png';
    e.img = im;
  }
  return e;
}
// SONDE DE DISPONIBILITÉ d'une matière : la tuile que le blit demandera (variante 1),
// pas la base `<clé>.png`. blitIsoTileKey ne lit que les variantes (isoVariantKey) ;
// sonder la base faisait demander et décoder (boîte, face masquée) une image de plus
// par matière, pixel pour pixel la variante 1 — audit 2026-10-05, ASSET-8. Une clé
// sans variantes se sonde elle-même, comme avant.
export function isoTileProbe(key) {
  return ensureIsoTileKey(isoVariantKey(key, 0));
}
// (Les enveloppes par `kind` — ensureIsoTile / blitIsoTile — ont disparu le
// 2026-07-30 : depuis que la place résout SA matière par l'ère, le sol passe par
// la clé, et deux transferts sans consommateur ne valaient pas d'être gardés.)
// Matière de dallage de l'ÈRE, ou la générique tant qu'elle n'est pas là.
// ⚠ On exige les QUATRE variantes décodées avant de basculer. Basculer dès la
// première donnerait un sol MI-ÈRE MI-GÉNÉRIQUE le temps des autres décodages :
// blitIsoTileKey rend false sur une variante absente, et ces cellules-là
// resteraient en aplat au milieu du dallage. Chaque décodage invalide DOUCEMENT
// le bake (cf. ensureIsoTileKey), la bascule se fait donc d'elle-même à la
// recuisson suivante — rien à cadencer ici.
export function plazaEraTileKey(era) {
  const k = era && ('iso-plaza-' + era);
  const n = k && ISO_TILE_VARIANTS[k];
  if (!n) return ISO_TILE_KEYS.plaza;
  for (let v = 1; v <= n; v += 1) {
    const e = ensureIsoTileKey(k + '-' + v);
    if (!e || !e.ready) return ISO_TILE_KEYS.plaza;
  }
  return k;
}

// Galets de rivage : tons MESURÉS sur les tuiles normalisées (imprimés par
// fetchGroundTiles.mjs). Servent d'aplat de repli le temps que le PNG décode, et
// de teinte au dézoom. `BEACH` est la molette de la plage : window.__beach.
const SHINGLE_TONE = [127, 130, 136];
const SHINGLE_TONE_WINTER = [174, 178, 183];
const SAND_TONE = [221, 195, 158];
export const BEACH = {
  on: true,
  // MATIÈRE du rivage. Raph a d'abord choisi les galets gris sur planche, puis
  // demandé le sable en les voyant en place (2026-07-30) — les deux matières
  // restent cuites, le basculement est un mot : `__beach.mat = 'shingle'`.
  mat: 'sand',
  // La grève prend-elle la neige en hiver ? NON depuis le 2026-07-30 (cf.
  // ISO_TILE_WINTER_BEACH pour le pourquoi). Porte les QUATRE couches d'un coup —
  // cellules bakées, bande de sable, rivage d'île, frange mouillée — parce qu'elles
  // se superposent au pixel près : n'en enneiger que certaines ferait lire la plage
  // en deux matières selon la couche, ce qui est pire que les deux choix francs.
  snow: false,
  // Largeur du rivage d'île, en TUILES depuis le bord de l'ellipse.
  //
  // ⚠ PAS un rayon normalisé : premier jet à 0,62 de rayon, et l'île y passait
  // presque entière aux galets. L'Aiguille fait rx 7,6 pour ry 2,4 — un rayon
  // constant donne une bande de 2,9 tuiles dans le sens du courant et de 0,9 en
  // travers, donc un plateau de gravier avec des mouchoirs d'herbe au milieu au
  // lieu d'une île herbue bordée de galets. La largeur doit être MÉTRIQUE, la
  // même partout, ce qui demande la distance au bord et pas le rayon.
  // ⚠ ET LA LARGEUR SE JUGE AU RAPPORT À L'ÎLE, PAS DANS L'ABSOLU : 1,3 tuile
  // paraissait modeste, mais l'Aiguille ne fait que 4,8 tuiles de LARGE (ry 2,4)
  // — le rivage en mangeait la moitié et se lisait comme une allée de gravier.
  // 0,75 donne un rebord d'une cellule, deux aux pointes du fuseau (la courbure y
  // fait grandir la distance au bord), ce qui est exactement le dessin d'une
  // langue de galets à la pointe d'une île de rivière.
  // Largeur du rivage d'île, en TUILES, mesurée depuis le bord de l'ellipse. C'est
  // un TRAIT le long de la courbe (cf. drawIsoIslandShore) et non des cellules :
  // sur un fuseau de 4,8 tuiles de large, la grille ne peut pas rendre un contour
  // régulier, quelle que soit la règle de classement.
  islandW: 0.8,
  // Bande de sable TEXTURÉE le long des berges du fleuve, côté terre, en tuiles.
  // Elle double les cellules bakées : celles-ci donnent la profondeur vers
  // l'intérieur, la bande donne le bord NET contre l'eau (les cellules, elles,
  // s'arrêtent en escalier). 0 la coupe.
  bankBand: 0.55,
  // ⛔ IL Y AVAIT ICI UN TIRAGE AU SORT SUR LA LARGEUR, RETIRÉ (Raph : « on veut un
  // joli contour identique »). Faire divaguer une lisière marche sur une grande
  // étendue — c'est ce que fait FRONTIER pour la limite ville↔campagne — mais sur
  // un anneau étroit ça ne fabrique pas un rivage irrégulier, ça fabrique des
  // TROUS. Ne pas le réintroduire pour les îles.
  // GRÈVE DE BERGE (iso/isoBeachCells.beachZone) : une BANDE le long des rives sans
  // quai, et non plus la couronne de cases à moins de `bankR` = 7 tuiles d'un trou
  // (retour Raph 2026-10-01 : « une vraie plage, pas des morceaux d'herbe dedans »).
  //   depth = profondeur du sable au-delà du bord d'eau peint, en tuiles, mesurée
  //           perpendiculairement au fleuve ;
  //   ramp  = samples (1,5 tuile chacun) sur lesquels elle s'amincit sous la pointe
  //           effilée du quai, qui sort ainsi du sable.
  depth: 2.2,
  ramp: 3,
  // Frange MOUILLÉE au ras de l'eau (couche vectorielle, cf. son bloc). Le ton
  // suit la matière : pour les galets c'est la 4e rangée du lot, mesurée à
  // [95,100,106] — des cailloux sombres et luisants ; pour le sable c'est le ton
  // sec assombri, parce que du sable humide est du sable, pas du gris.
  wet: 0.55, wetW: 5,
  wetTone: { sand: '156,132,100', shingle: '95,100,106' },
  wetWinter: '132,140,148',
};
if (import.meta.env?.DEV && typeof window !== 'undefined') window.__beach = BEACH;

// ── LE BLITTEUR, rapatrié d'isoRenderer le 2026-08-23 ────────────────────────
// L'en-tête de ce module disait « ce n'est PAS le peintre : `blitIsoTileKey` reste
// dans isoRenderer ». C'était vrai tant que le blitteur y avait ses attaches ; il
// n'en a plus. CINQ de ses sept dépendances vivent ici (`ensureIsoTileKey`,
// `isoVariantKey`, `isoWinterTile`, `groundTileTune`, `isoFaceVeiled`) et les deux
// autres (`CM`, `WINTER`) y sont déjà importées : le rapatriement ne coûte AUCUN
// import nouveau. Il débloque la passe de balayage de cellules, qui l'appelait.
// Blit une tuile de sol sur la cellule dont le coin NORD projeté est (nx, ny).
// ⚠ FACE SEULE, MASQUÉE AU LOSANGE (e.face, cf. isoTileFace) : l'épaisseur du
// « thin tile » ne se contente pas de déborder sous la pointe sud, ses faces
// latérales pendent sous les arêtes SO/SE, donc DANS le rectangle 2:1 — le seul
// recadrage rectangulaire (1er correctif) laissait un liseré clair + un liseré
// sombre sur chaque cellule = quadrillage sur tout le sol.
// Un sol plat doit être une SURFACE continue, pas un empilement de dalles.
// Repli (pixels illisibles) : recadrage rectangulaire historique depuis e.img.
// Renvoie false si pas prête (l'appelant garde l'aplat).
export function blitIsoTileKey(ctx, key, nx, ny, hw, mirror = false, h = 0, veil = null) {
  // HIVER : bascule vers la tuile enneigée si elle existe ET est décodée —
  // sinon on garde l'été pour cette recuisson (le décodage la rappellera).
  // (La GRÈVE n'en a pas, sauf `__beach.snow` — cf. ISO_TILE_WINTER_BEACH.)
  const wKey = CM.season === WINTER ? isoWinterTile(key) : null;
  if (wKey) {
    const we = ensureIsoTileKey(isoVariantKey(wKey, h));
    if (we && we.ready) key = wKey;
  }
  const e = ensureIsoTileKey(isoVariantKey(key, h));
  if (!e || !e.ready) return false;
  const bb = e.bbox;
  const faceH = Math.max(1, Math.round(bb.w / 2));   // face iso 2:1 du contenu
  const k = (hw * 2) / bb.w;
  // DÉBORD EN PERSPECTIVE (e.over, herbe) : les `ov` lignes au-dessus du losange
  // sont blittées AU-DESSUS du coin nord (dy remonte d'autant) — le bake balaie
  // nord→sud, elles recouvrent donc le voisin du nord, sol urbain compris :
  // « au sud du sol, l'herbe passe devant ». Borné par bb.h : une variante sans
  // brins hauts ne doit pas étirer son losange.
  const ov = (!e.face && e.over) ? Math.max(0, Math.min(e.over, bb.h - faceH)) : 0;
  const srcH = faceH + ov;
  // S7 — LE BLIT 1:1, QUAND LA GRILLE LE PERMET (docs/PLAN-RENDU-VILLE.md).
  //
  // Le `+1 px` historique est un anti-couture : à zoom fractionnaire le pas de
  // grille (hw en x, hh = hw/2 en y) ne tombe pas sur l'entier, deux losanges
  // voisins chacun arrondi laissent un liseré transparent, et on le recouvre en
  // débordant d'un pixel sur le voisin. Le prix était lourd et invisible : la
  // destination faisait 65×33 pour une source de 64×32 à z = 1, donc le nearest
  // DUPLIQUAIT une colonne et une rangée d'art sur CHAQUE cellule du sol. Tout le
  // reste du fichier promet un blit « pixel pour pixel » (cf. § tuiles natives) ;
  // ici il ne l'était nulle part.
  //
  // Depuis S11 le zoom est quantifié au 1/8, donc hw = 32z et hh = 16z sont
  // ENTIERS et les losanges se joignent exactement : plus de couture à couvrir.
  // On ne s'y fie pas pour autant — la molette `__zoomQuant(0)` rend le zoom
  // continu, et cam.zoom traverse des valeurs fractionnaires PENDANT le
  // glissement (une recuisson nette peut y tomber si le budget de geste
  // l'autorise). Le test porte donc sur la GÉOMÉTRIE COURANTE, pas sur un
  // réglage : `hw` entier et pair ⟺ hw et hh entiers ⟺ grille exacte. Le +1
  // revient tout seul dès qu'elle ne l'est plus.
  // ⚠ Le test porte sur les DEUX dimensions réellement demandées, pas seulement
  // sur hw : une tuile d'herbe à débord (`ov`) a srcH = faceH + ov, et sa hauteur
  // de destination reste fractionnaire à bas zoom même quand la grille est exacte
  // (hw = 4, ov = 3 → dh = 4,375). Elle retombe alors sur le +1, ce qui est le bon
  // choix : à k < 1 on sous-échantillonne de toute façon.
  const dwx = bb.w * k, dhx = srcH * k;
  const whole = (v) => Math.abs(v - Math.round(v)) < 1e-9;
  // `groundTileTune.exact = false` (molette `__groundTile({exact:false})`) rejoue le
  // +1 inconditionnel : c'est l'A/B du lot, et le seul moyen de revoir en une
  // seconde le pixel dupliqué que ce chemin supprime.
  const exact = groundTileTune.exact
    && Number.isInteger(hw) && hw % 2 === 0 && whole(dwx) && whole(dhx);
  const dw = exact ? Math.round(dwx) : Math.ceil(dwx) + 1;
  const dh = exact ? Math.round(dhx) : Math.ceil(dhx) + 1;
  const dy = Math.round(ny - ov * k);
  // Source : la face masquée (voilée s'il le faut) si elle a pu être construite,
  // sinon la tuile brute.
  const face = isoFaceVeiled(e, veil);
  const src = face || e.img;
  const sx = face ? 0 : bb.x0, sy = face ? 0 : bb.y0;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  // Sonde G0 (pixelGrid.js) : l'ÉTALON de la carte — « l'art EST la tuile », donc
  // 1,00 attendu. Le mesurer quand même : c'est ce blit-là qui a porté le +1 px
  // anti-couture pendant des mois (cf. le § S7 juste au-dessus), et un étalon
  // qu'on suppose ne vaut rien.
  // ⚠ Ce blit se fait DANS LE BAKE : la normalisation lit CM.cam.zoom, ce qui est
  // juste tant que le bake tourne au zoom courant (le cas nominal). Une photo de
  // cran réétirée (fond.z ≠ zoom) n'est pas mesurée ici — c'est du LOD, pas de la
  // grille de l'art.
  if (pxProbe.on) recPx('sol', bb.w, dw);
  if (mirror) {
    // Miroir horizontal 1 cellule sur ~2 (hash) : casse la répétition du motif
    // sans 2e asset — légitime pour une FACE de sol (pas d'ombrage directionnel fort).
    ctx.save();
    ctx.translate(Math.round(nx - hw) + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(src, sx, sy, bb.w, srcH, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(src, sx, sy, bb.w, srcH, Math.round(nx - hw), dy, dw, dh);
  }
  ctx.imageSmoothingEnabled = prev;
  return true;
}
