// Petite icône pixel-art d'UI (PixelLab, style emblème mat/désaturé). Rend un
// <img> net (image-rendering: pixelated) depuis /pixelart/ui/<name>.png.
// `name` inclut le sous-dossier, ex. "glyphs/ruines", "foyers/scarcity", "prep/exode".
//
// VARIANTE NATIVE. Les maîtres font 64×64 alors que l'UI les affiche entre 16 et 48 px.
// Livrés tels quels, ils étaient réduits par le navigateur en plus-proche-voisin : à 24 px
// le rapport vaut 2,67, donc l'échantillonnage DÉRIVE et coupe les traits fins (c'est le
// défaut déjà corrigé sur la nav, cf. scripts/bakeUiIcons.cjs). On sert donc la variante
// cuite à la taille exacte — `<name>@<taille>.png`, produite par scripts/bakeUiIconSizes.cjs
// — pour que le navigateur n'ait plus rien à rééchantillonner.
//
// La taille vient, dans l'ordre : de la prop `size`, sinon de la classe (table ci-dessous),
// sinon 16 (la valeur de `.px-icon`). Elle doit TOUJOURS correspondre au CSS qui s'applique
// réellement : servir @32 dans une boîte de 24 px ramène le rééchantillonnage qu'on retire.

// Familles pour lesquelles des variantes ont été cuites (cf. scripts/bakeUiIconSizes.cjs).
// `ruins/` n'est décliné qu'en 24 et 32, les deux seules tailles auxquelles PixelIcon le
// demande (Habitants dans la topbar, sceaux du Testament, une carte de mythe) : l'arbre,
// lui, ne passe PAS par ce composant et dimensionne ses emblèmes en POURCENTAGE
// (.rt-emblem, 72 % — ruinsTree.css), donc il lui faut le maître pleine résolution.
const FAMILIES_WITH_VARIANTS = new Set(['res', 'glyphs', 'prep', 'foyers', 'seals', 'myths', 'nav', 'ruins']);
const SIZES_BY_FAMILY = { ruins: [24, 32], myths: [16, 32], nav: [24] };

// Classe portée par l'<img> -> taille CSS appliquée. À tenir synchronisée avec les règles
// correspondantes des feuilles de style ; un écart ici se voit tout de suite en jeu.
const SIZE_BY_CLASS = {
  'csp-stat-icon': 16,   // components.css
  'myth-card-icon': 32,  // components.css
  'tab-icon': 24,        // layout.css
  'qa-icon': 24,         // layout.css
  'harvest-glyph': 24,   // views-crises.css
  'edict-seal': 32,      // views-crises.css
  'edict-emblem': 48,    // views-crises.css
  'policy-seal': 24,     // views-city.css — l'état désactivé passe size={16} explicitement
  'comptoir-icon': 32,   // views-city.css
};

const DEFAULT_SIZE = 16;

export function resolveIconSrc(name, className = '', size) {
  const family = String(name).split('/')[0];
  if (!FAMILIES_WITH_VARIANTS.has(family)) return `/pixelart/ui/${name}.png`;
  let px = size;
  if (!px) for (const c of className.split(/\s+/)) if (SIZE_BY_CLASS[c]) { px = SIZE_BY_CLASS[c]; break; }
  px = px || DEFAULT_SIZE;
  // Toutes les familles ne sont pas déclinées dans toutes les tailles. Demander une
  // variante non cuite donnerait un 404 et une icône vide : on retombe sur le maître,
  // qui reste correct (juste rééchantillonné par le navigateur).
  const dispo = SIZES_BY_FAMILY[family];
  if (dispo && !dispo.includes(px)) return `/pixelart/ui/${name}.png`;
  return `/pixelart/ui/${name}@${px}.png`;
}

export default function PixelIcon({ name, className = '', alt = '', title, size }) {
  return (
    <img
      className={`px-icon${className ? ' ' + className : ''}`}
      src={resolveIconSrc(name, className, size)}
      alt={alt}
      aria-hidden={alt ? undefined : 'true'}
      title={title}
      draggable="false"
    />
  );
}
