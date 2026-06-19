import { useCollapsiblePanel } from '../../hooks/useCollapsiblePanel.js';

/**
 * Encart de HUD pliable : un titre cliquable, un corps qui se replie.
 * En late game le HUD de la Cité déborde — chaque encart peut donc être réduit
 * à son seul titre. L'état (ouvert/fermé) est mémorisé en localStorage par
 * `storageKey` (voir useCollapsiblePanel) : il survit aux remontages
 * (changement d'onglet) et aux rechargements.
 */
export default function HudPanel({ title, storageKey, className = '', defaultOpen = true, children }) {
  const [open, toggle] = useCollapsiblePanel(storageKey, defaultOpen);

  return (
    <div className={`hud-panel ${className} ${open ? 'is-open' : 'is-collapsed'}`.trim()}>
      <button type="button" className="hud-panel-toggle" aria-expanded={open} onClick={toggle}>
        <span className="hud-panel-title">{title}</span>
        <span className="hud-panel-chevron" aria-hidden="true"></span>
      </button>
      {open && <div className="hud-panel-body">{children}</div>}
    </div>
  );
}
