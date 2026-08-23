// LE CACHE D'ART ISO — /pixelart/iso/<nom>.png, chargé paresseusement.
//
// Extrait d'isoRenderer.js le 2026-08-23 (Q10). Une entrée par nom, décodée à la
// demande ; tant qu'un PNG manque, chaque consommateur garde SON repli, donc rien
// ne dépend durement de l'art.
//
// ⚠ Sorti pour être PARTAGEABLE, et ça compte : `isoBridge.js` porte une copie de
// ce geste avec, en commentaire, la raison — « l'importer créerait un cycle
// isoRenderer ↔ isoBridge ». Cette raison n'existe plus : ce module est une feuille,
// personne ne boucle en le lisant. (La déduplication elle-même reste à faire — ce
// n'est pas un déplacement pur, donc pas cette tranche.)
import { CM } from '../layout.js';

// ── Art iso dédié (/pixelart/iso/<name>.png) : cache paresseux ───────────────
// Bateaux par stade (8 rotations). Les bandes mill-wheel-* n'ont plus de
// consommateur depuis la refonte éolienne du moulin (retrait en phase art).
// Tant qu'un PNG manque, chaque consommateur garde son repli (skew / profil).
const isoArtCache = new Map();
export function isoArt(name) {
  let e = isoArtCache.get(name);
  if (e) return e;
  e = { img: null, ready: false, bbox: null };
  isoArtCache.set(name, e);
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => {
      e.img = im; e.ready = true;
      // Le BAKE du sol dépend de l'art décodé (dalle de place remplacée, bande
      // gazon des terre-pleins sautée) → invalidation DOUCE, recuisson coalescée
      // par drawIsoWorld (cf. isoTile : plus une recuisson par sprite décodé).
      if (CM._isoGroundBake) CM._isoGroundBake.soft = true;
    };
    // `name` peut porter un cache-buster (`clef?v=2`) : la query passe APRÈS le
    // `.png` dans l'URL. Sert quand un PNG est RÉÉCRIT sur disque (aqueduc : des
    // navigateurs resservaient la 1re version cassée depuis le cache HTTP).
    const qi = name.indexOf('?');
    im.src = '/pixelart/iso/' + (qi < 0 ? name + '.png' : name.slice(0, qi) + '.png' + name.slice(qi));
  }
  return e;
}
