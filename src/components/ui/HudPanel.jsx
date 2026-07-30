import { useEffect, useRef } from 'react';
import { useCollapsiblePanel } from '../../hooks/useCollapsiblePanel.js';

/**
 * Encart de HUD pliable : un titre cliquable, un corps qui se replie.
 * En late game le HUD de la Cité déborde — chaque encart peut donc être réduit
 * à son seul titre. L'état (ouvert/fermé) est mémorisé en localStorage par
 * `storageKey` (voir useCollapsiblePanel) : il survit aux remontages
 * (changement d'onglet) et aux rechargements.
 *
 * `summary` — POIGNÉE : un résumé montré à la place du corps quand l'encart est
 * replié. Sans lui, replier revient à éteindre l'information ; avec lui, replier
 * ne coûte que le détail et les actions. C'est ce qui rend le repli acceptable
 * par défaut sur petit écran (cf. les crans de densité de views-city-hud.css).
 *
 * `openWhen` — DÉPLIAGE D'AUTORITÉ sur FRONT MONTANT : quand la condition
 * devient vraie, l'encart s'ouvre seul. Volontairement pas un verrou : le
 * joueur peut le refermer tout de suite après. Un encart qu'on ne peut plus
 * fermer se combat, un encart qui s'ouvre au bon moment se lit.
 */
export default function HudPanel({
  title,
  storageKey,
  className = '',
  defaultOpen = true,
  summary = null,
  openWhen = false,
  children,
}) {
  const [open, toggle, setOpen] = useCollapsiblePanel(storageKey, defaultOpen);

  // Front montant seulement : sans cette mémoire, la condition restant vraie
  // rouvrirait l'encart à chaque rendu (1 Hz en vue Cité) et le bouton
  // paraîtrait cassé.
  // ⚠ Initialisé à FALSE et non à `openWhen` : sinon arriver dans le jeu ALORS
  // QUE la condition est déjà vraie ne déclenche aucun front, et le joueur qui
  // avait replié l'encart avant de quitter revient en pleine crise avec la
  // Régulation fermée — précisément le cas que ce mécanisme doit couvrir.
  const wasOn = useRef(false);
  useEffect(() => {
    if (openWhen && !wasOn.current) setOpen(true);
    wasOn.current = openWhen;
  }, [openWhen, setOpen]);

  return (
    <div className={`hud-panel ${className} ${open ? 'is-open' : 'is-collapsed'}`.trim()}>
      <button type="button" className="hud-panel-toggle" aria-expanded={open} onClick={toggle}>
        <span className="hud-panel-title">{title}</span>
        {!open && summary && <span className="hud-panel-summary">{summary}</span>}
        <span className="hud-panel-chevron" aria-hidden="true"></span>
      </button>
      {open && <div className="hud-panel-body">{children}</div>}
    </div>
  );
}
