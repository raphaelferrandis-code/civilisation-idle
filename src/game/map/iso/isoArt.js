// LE CACHE D'ART ISO — /pixelart/iso/<nom>.png, chargé paresseusement.
//
// Extrait d'isoRenderer.js le 2026-08-23 (Q10). Une entrée par nom, décodée à la
// demande ; tant qu'un PNG manque, chaque consommateur garde SON repli, donc rien
// ne dépend durement de l'art.
//
// ⚠ Sorti pour être PARTAGEABLE, et ça compte : c'est une feuille, personne ne boucle
// en le lisant. Le pont (isoBridge) et, depuis l'audit du 05/10 (STRUCT-4), le registre
// des places (isoPlaza : mobilier, bandes animées, pieds d'arbre) passent par ici — la
// même PNG n'a plus deux entrées, ni deux mesures d'encre. Restent à part les chargeurs
// d'autres dossiers que /pixelart/iso/ (isoCampHearth.hearthArt, pixelHouses, agents,
// scènes moteur…) : un cache commun par URL serait un autre chantier.
import { solInvalidate } from './solInvalidate.js';
import { mkCanvas } from '../pixelUtil.js';

// ── Art iso dédié (/pixelart/iso/<name>.png) : cache paresseux ───────────────
// Bateaux par stade (8 rotations). Les bandes mill-wheel-* n'ont plus de
// consommateur depuis la refonte éolienne du moulin (retrait en phase art).
// Tant qu'un PNG manque, chaque consommateur garde son repli (skew / profil).
const isoArtCache = new Map();
// Les SEULS arts que lit le sol (audit du 2026-10-05, PERF-27) : les touffes d'herbe
// (isoGroundDetail) et le gazon des terre-pleins (drawIsoMedians, isoStreet). (La
// scène de place `plaza-<ère>` et les parterres `flowerbed-N` en étaient aussi : leur
// rendu a été retiré le 2026-10-06, audit MORT-12/13.) Le décodage de tout autre
// PNG (bateau, pont, clôture, arbre, merveille…) invalidait pourtant le sol entier :
// ~100 à 150 tuiles recuites par fenêtre de 250 ms, au chargement d'une grande ville
// et à chaque type de sprite nouveau. Garde : isoArtGround.test.js relève les
// isoArt(…) des passes du sol — un art ajouté au sol sans passer ici le fait échouer.
export const isoArtFeedsGround = (name) => name.startsWith('deco/tuft-') || name.startsWith('median-lawn');
// Abonnés au DÉCODAGE (reçoivent le nom) : les places se recalent quand un ARBRE
// arrive (son pied mesuré entre dans leur composition, cf. _artRev dans isoPlaza).
// Un art déjà décodé quand on le lit n'appelle personne : il se lit tout de suite.
const readyHooks = new Set();
export function onIsoArtReady(fn) { readyHooks.add(fn); return () => readyHooks.delete(fn); }
// Entrée : { img, ready, failed, bbox }. `failed` = le PNG n'existe pas (onerror) —
// propImage (isoPlaza) attend ce verdict avant de demander le nom nu d'un prop.
export function isoArt(name) {
  let e = isoArtCache.get(name);
  if (e) return e;
  e = { img: null, ready: false, failed: false, bbox: null };
  isoArtCache.set(name, e);
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => {
      e.img = im; e.ready = true;
      // Le BAKE du sol dépend de l'art décodé (dalle de place remplacée, bande
      // gazon des terre-pleins sautée) → invalidation DOUCE, recuisson coalescée
      // par drawIsoWorld (cf. isoTile : plus une recuisson par sprite décodé) —
      // pour les seuls arts qu'il lit (isoArtFeedsGround).
      if (isoArtFeedsGround(name)) solInvalidate('soft');
      for (const fn of readyHooks) fn(name);
    };
    im.onerror = () => { e.failed = true; };
    // `name` peut porter un cache-buster (`clef?v=2`) : la query passe APRÈS le
    // `.png` dans l'URL. Sert quand un PNG est RÉÉCRIT sur disque (aqueduc : des
    // navigateurs resservaient la 1re version cassée depuis le cache HTTP).
    const qi = name.indexOf('?');
    im.src = '/pixelart/iso/' + (qi < 0 ? name + '.png' : name.slice(0, qi) + '.png' + name.slice(qi));
  }
  return e;
}

// ── ENCRE D'UN SPRITE : { x0, y0, w, h } en px d'art, ou null ─────────────────
// ⚠ LA CAUSE DU « ÇA VOLE ». Les PNG ont du vide transparent tout autour de l'objet.
// Poser le BAS DU CANVAS sur le sol laisse donc l'objet flotter au-dessus de son
// ombre, d'une hauteur qui change d'un sprite à l'autre — c'est exactement ce que
// Raph a vu le 2026-07-29. On mesure l'encre une fois par image et on ancre dessus :
// bas de l'encre sur le sol, centre de l'encre sur le point. (Même leçon que les
// scènes de moteur : rogner sur l'encre MESURÉE, jamais sur des fractions de boîte.)
// UNE seule mesure pour tous (audit du 05/10, STRUCT-4) : celle des objets posés
// (isoProps) rendait { x, y }, celle des places { x0, y0 } — une ligne recopiée de
// l'une à l'autre lisait `bb.x` à undefined, et aucun brasero de parvis n'éclairait
// (BUG-61). Places, clôtures, statues et braseros des ponts et des merveilles lisent
// désormais celle-ci, dans le même cache.
const inkCache = new WeakMap();
export function inkBox(img) {
  let b = inkCache.get(img);
  if (b !== undefined) return b;
  b = null;
  const w = (img.naturalWidth || img.width) | 0, h = (img.naturalHeight || img.height) | 0;
  if (w && h) {
    try {
      const c = mkCanvas(w, h);
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (d[(y * w + x) * 4 + 3] > 16) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      // Une encre VIDE n'est pas « tout le canvas » : c'est un sprite cassé. On
      // le signale par null et le prop ne se dessine pas, plutôt que de poser un
      // rectangle transparent qui volerait la place à son voisin.
      if (x1 >= x0) b = { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    } catch { b = { x0: 0, y0: 0, w, h }; }   // canvas souillé : repli sur le canvas
  }
  inkCache.set(img, b);
  return b;
}
