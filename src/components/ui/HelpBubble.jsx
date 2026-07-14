import { useEffect, useState } from 'react';

/**
 * Bulles d'aide de la Chancellerie — MÊME DA que les bulles de l'arbre des
 * Ruines (NodeTooltip / .rt-tooltip : bulle sombre épurée, nom + effet), en
 * version générique : `tipProps(name, text)` s'étale sur N'IMPORTE QUEL
 * élément existant (aucun wrapper — les grilles restent intactes), et
 * <HelpBubbleLayer/> (monté une fois par vue) rend la bulle en position fixe
 * sous l'élément survolé, avec bascule au-dessus près du bas de l'écran.
 * Remplace les `title=` natifs (retour Raph : même DA que l'arbre des Ruines).
 */

let showFn = null;

function showTipAt(el, name, text) {
  if (!showFn || !el || !text) return;
  const r = el.getBoundingClientRect();
  const width = 280;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 16));
  let top = r.bottom + 10;
  let flip = false;
  if (top > window.innerHeight - 150) {
    top = Math.max(8, r.top - 10);
    flip = true; // la bulle se pose AU-DESSUS (translateY(-100%))
  }
  showFn({ left, top, flip, name, text });
}

function hideTip() {
  if (showFn) showFn(null);
}

// Props à étaler sur l'élément cible : remplace `title={text}`.
// eslint-disable-next-line react-refresh/only-export-components -- helper partagé par 6 vues ; le Fast Refresh dev n'en pâtit pas
export function tipProps(name, text) {
  if (!text) return {};
  return {
    onMouseEnter: (e) => showTipAt(e.currentTarget, name, text),
    onMouseLeave: hideTip,
    onFocus: (e) => showTipAt(e.currentTarget, name, text),
    onBlur: hideTip
  };
}

export function HelpBubbleLayer() {
  const [tip, setTip] = useState(null);
  useEffect(() => {
    showFn = setTip;
    const hideOnScroll = () => setTip(null);
    window.addEventListener('scroll', hideOnScroll, true);
    return () => {
      if (showFn === setTip) showFn = null;
      window.removeEventListener('scroll', hideOnScroll, true);
    };
  }, []);
  if (!tip) return null;
  return (
    <div
      className={`regul-tip${tip.flip ? ' regul-tip--flip' : ''}`}
      style={{ left: `${tip.left}px`, top: `${tip.top}px` }}
      role="tooltip"
    >
      {tip.name && <strong className="regul-tip-name">{tip.name}</strong>}
      <span className="regul-tip-text">{tip.text}</span>
    </div>
  );
}
