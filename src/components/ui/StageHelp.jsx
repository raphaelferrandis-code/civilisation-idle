import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { tr } from '../../game/core/i18n.js';

/**
 * Le « ? » des scènes de jeu (demande Raphaël 2026-07-17 : « trop d'infos
 * répétées, mets les règles en hover pour ne plus scroller ») — un jeton d'os
 * dans la ligne de titre, qui déplie au survol (ou au focus clavier) un
 * feuillet avec les règles et la table des lots. Contenu LIBRE (JSX) : les
 * légendes à symboles pixel y entrent, ce que l'infobulle texte (HelpBubble)
 * ne sait pas faire.
 *
 * ⚠ Le feuillet OUVRE VERS LE HAUT (retour Raphaël : en bas il masquait les
 * encarts de mise). Or la scène vit dans `.regulation-stage { overflow-y:auto }`
 * qui CLIPPE tout enfant absolu débordant par le haut. Le feuillet est donc
 * `position: fixed` (il échappe à l'overflow) et positionné en JS relativement
 * au bouton — un positionneur maison plutôt que l'anchor positioning CSS, qui
 * n'existe pas dans le Chromium de l'.exe Electron shippé (< Chrome 125). Il
 * bascule vers le BAS seulement s'il n'y a pas la place au-dessus.
 */
export default function StageHelp({ children }) {
  const wrapRef = useRef(null);
  const popRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { left, top?, bottom? } en px viewport
  // id unique par instance : plusieurs scènes peuvent monter leur « ? ».
  const popId = useId();

  // Échap ferme le feuillet (WCAG 1.4.13 : un contenu au survol doit être
  // congédiable sans bouger la souris) — même écoute fenêtre que HelpBubble,
  // car au survol seul, aucun keydown n'atteint le wrapper.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  // Positionne le feuillet AU-DESSUS du bouton, aligné à droite, en évitant les
  // bords ; bascule dessous si le haut manque de place. Mesuré après paint
  // (useLayoutEffect) pour connaître la hauteur réelle du contenu.
  const place = useCallback(() => {
    const btn = wrapRef.current?.querySelector('.stage-help');
    const pop = popRef.current;
    if (!btn || !pop) return;
    const b = btn.getBoundingClientRect();
    const ph = pop.offsetHeight;
    const pw = pop.offsetWidth;
    const gap = 8;
    const margin = 8;
    const roomAbove = b.top;
    const up = roomAbove >= ph + gap + margin; // assez de place au-dessus ?
    const left = Math.max(margin, Math.min(b.right - pw, window.innerWidth - pw - margin));
    setPos(up
      ? { left, bottom: window.innerHeight - b.top + gap }
      : { left, top: b.bottom + gap });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    // Recalage si la fenêtre bouge pendant la lecture (scroll de page, resize).
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const style = pos
    ? { left: `${pos.left}px`, ...(pos.bottom != null ? { bottom: `${pos.bottom}px` } : { top: `${pos.top}px` }) }
    : { left: '-9999px', top: '0' }; // hors écran le temps de la 1re mesure

  return (
    <span
      className="stage-help-wrap"
      ref={wrapRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        className="stage-help"
        aria-label={tr({ fr: 'Règles du jeu', en: 'Game rules' })}
        // Posé seulement quand le feuillet existe : un aria-describedby qui
        // pointe dans le vide est ignoré, mais autant ne rien promettre.
        aria-describedby={open ? popId : undefined}
      >?</button>
      {open && (
        <div className="stage-help-pop" id={popId} role="tooltip" ref={popRef} style={style}>{children}</div>
      )}
    </span>
  );
}
