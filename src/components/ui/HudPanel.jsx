import { useState } from 'react';

/**
 * Encart de HUD pliable : un titre cliquable, un corps qui se replie.
 * En late game le HUD de la Cité déborde — chaque encart peut donc être réduit
 * à son seul titre. L'état (ouvert/fermé) est mémorisé en localStorage par
 * `storageKey` (indépendant de la sauvegarde du jeu) : il survit aux remontages
 * (changement d'onglet) et aux rechargements.
 */
export default function HudPanel({ title, storageKey, className = '', defaultOpen = true, children }) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const v = localStorage.getItem(`hud:${storageKey}`);
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });

  const toggle = () => setOpen((o) => {
    const next = !o;
    try {
      if (storageKey) localStorage.setItem(`hud:${storageKey}`, next ? '1' : '0');
    } catch {
      // localStorage indisponible : on garde quand même l'état en mémoire.
    }
    return next;
  });

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
