/**
 * Glyphes pixel de l'économie du temple (2026-07-16) : la FLAMME VOTIVE est la
 * monnaie Faveur (remplace le ✦ texte dans l'UI riche — le ✦ reste le repli
 * typographique dans les chaînes brutes), l'AMPHORE est la cagnotte commune
 * (remplace 🏺). Assets : public/pixelart/ui/faveur/, recette
 * scratch/generate-faveur-icons.cjs. Dimensionnés en em (cf. .faveur-glyph /
 * .pot-glyph dans views-regulation.css), décoratifs (alt vide) — le sens est
 * porté par le texte voisin.
 */

export function FaveurIcon({ className = '' }) {
  return (
    <img
      className={`faveur-glyph${className ? ` ${className}` : ''}`}
      src="/pixelart/ui/faveur/flamme.png"
      alt=""
      aria-hidden="true"
      draggable="false"
    />
  );
}

export function PotIcon({ className = '' }) {
  return (
    <img
      className={`pot-glyph${className ? ` ${className}` : ''}`}
      src="/pixelart/ui/faveur/amphore.png"
      alt=""
      aria-hidden="true"
      draggable="false"
    />
  );
}
