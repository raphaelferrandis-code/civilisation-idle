// Petite icône pixel-art d'UI (PixelLab, style emblème mat/désaturé). Rend un
// <img> net (image-rendering: pixelated) depuis /pixelart/ui/<name>.png.
// `name` inclut le sous-dossier, ex. "glyphs/ruines", "foyers/scarcity",
// "prep/exode". Par défaut l'icône se dimensionne sur la police (1.05em) et
// s'aligne dans le texte — passe une classe pour un format fixe.
export default function PixelIcon({ name, className = '', alt = '', title }) {
  return (
    <img
      className={`px-icon${className ? ' ' + className : ''}`}
      src={`/pixelart/ui/${name}.png`}
      alt={alt}
      aria-hidden={alt ? undefined : 'true'}
      title={title}
      draggable="false"
    />
  );
}
