import { useEffect, useRef } from 'react';
import { useSheetSwipeClose } from '../../hooks/useSheetSwipeClose.js';
import { isCoarsePointer } from '../../game/core/pointerMode.js';

const NO_OP = () => {};

/**
 * Encart de HUD pliable : un titre cliquable, un corps qui se replie.
 * En late game le HUD de la Cité déborde — chaque encart peut donc être réduit
 * à son seul titre. L'état (ouvert/fermé) est PILOTÉ par l'appelant (`open`,
 * `onToggle`, `onOpenChange`), qui le mémorise (useCollapsiblePanel) : au doigt,
 * la poignée de la Régulation est un bouton flottant posé sur la carte, hors de
 * l'encart — deux `useCollapsiblePanel` sur la même clé tiendraient deux
 * vérités qui divergent au premier clic. (Le chemin non piloté, sans appelant,
 * est parti : audit 2026-10-05.)
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
  className = '',
  summary = null,
  openWhen = false,
  open = false,
  onToggle = NO_OP,
  onOpenChange,
  swipeToClose = false,
  children,
}) {
  const toggle = onToggle;
  // ⚠ Repli STABLE et non un `() => {}` écrit ici : `setOpen` est en dépendance
  // de l'effet `openWhen`, une identité neuve à chaque rendu le relancerait à
  // chaque tick (1 Hz en vue Cité).
  const setOpen = onOpenChange || NO_OP;

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

  // FERMETURE AU BALAYAGE (M4), sur demande explicite de l'appelant. Tous les
  // encarts de HUD ne sont pas des feuilles : celui-ci ne l'est qu'au doigt, et
  // seulement là où il recouvre la carte. On ne l'arme donc pas d'office —
  // `swipeToClose` est le contrat, `enabled` la condition de régime.
  // Le bandeau reste un bouton : le tap le replie comme avant, le balayage n'est
  // qu'un second chemin vers la même action (le plan demande les deux).
  // ⚠ Déstructuré sur place : cf. la note de BuildingShop — `react-hooks/refs`
  // refuse une lecture de propriété sur un objet porteur de ref pendant le rendu.
  const [sheetRef, swipeHandleProps] = useSheetSwipeClose({
    enabled: swipeToClose && open && isCoarsePointer(),
    onClose: toggle,
  });

  return (
    <div className={`hud-panel ${className} ${open ? 'is-open' : 'is-collapsed'}`.trim()} ref={sheetRef}>
      <button type="button" className="hud-panel-toggle" aria-expanded={open} onClick={toggle} {...swipeHandleProps}>
        <span className="hud-panel-title">{title}</span>
        {!open && summary && <span className="hud-panel-summary">{summary}</span>}
        <span className="hud-panel-chevron" aria-hidden="true"></span>
      </button>
      {open && <div className="hud-panel-body">{children}</div>}
    </div>
  );
}
