import PlaceScene from './PlaceScene.jsx';
import { tipProps } from './HelpBubble.jsx';

/**
 * UN LIEU (refonte « chaque onglet est un lieu », maquette V4) : le décor en
 * bandeau, le nom posé dessus avec ses chiffres clés, puis le contenu.
 * Briques et doctrine : places.css. Rendue À LA PLACE de la `<section
 * className="view">` d'un onglet (même id, mêmes classes de vue active).
 */
export default function Place({
  id,
  className = '',
  scene,
  sceneAlt = '',
  focus,
  eyebrow,
  title,
  keys,
  bodyClassName = '',
  children
}) {
  return (
    <section className={`view active place-view${className ? ` ${className}` : ''}`} id={id}>
      <PlaceScene className="place-band" src={scene} alt={sceneAlt} focus={focus} />
      <header className="place-head">
        <div className="place-title">
          {eyebrow && <span className="place-eyebrow">{eyebrow}</span>}
          <h1 className="place-name">{title}</h1>
        </div>
        {keys && <div className="place-keys">{keys}</div>}
      </header>
      <div className={`place-body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
    </section>
  );
}

/** Un chiffre clé posé sur le décor : libellé, valeur, et une ligne de détail. */
export function PlaceKey({ label, value, sub, valueClassName = '', tip, wide = false, children }) {
  return (
    <div className={`place-key${wide ? ' is-wide' : ''}`} {...tipProps(label, tip)}>
      <span className="place-key-label">{label}</span>
      <strong className={`place-key-val${valueClassName ? ` ${valueClassName}` : ''}`}>{value}</strong>
      {children}
      {sub && <span className="place-key-sub">{sub}</span>}
    </div>
  );
}
