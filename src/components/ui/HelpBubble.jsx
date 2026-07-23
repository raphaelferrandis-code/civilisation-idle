import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ALIVE_POLL_MS,
  BUBBLE_WIDTH,
  normalizeTipContent,
  openDelayFor,
  placeTip,
  tipStillAlive
} from './helpBubbleCore.js';

/**
 * L'INFOBULLE UNIQUE DU JEU (B1) — MÊME DA que les bulles de l'arbre des Ruines
 * (NodeTooltip / .rt-tooltip : bulle sombre épurée, nom + effet). `tipProps`
 * s'étale sur N'IMPORTE QUEL élément existant, sans wrapper (les grilles
 * restent intactes), et <HelpBubbleLayer/>, monté UNE FOIS dans App, rend la
 * bulle. Remplace les `title=` natifs, dont l'apparition, le délai et le style
 * appartenaient à l'OS.
 *
 * La couche était montée par vue (RegulationView seule) : elle est maintenant
 * globale, ce qui impose trois choses que la version par vue n'avait pas à
 * traiter.
 *
 * 1. ELLE SORT DE `.app` PAR UN PORTAIL. En deuil, `.app` porte
 *    `filter: grayscale(1)` (layout.css:11) et un filtre crée un bloc
 *    conteneur : le `position: fixed` de la bulle se résoudrait contre `.app`
 *    et non contre l'écran. Les variables CSS viennent de `:root`, donc rien
 *    ne se perd à sortir.
 *
 * 2. ELLE ENTRE DANS LES MODALES. Un <dialog> ouvert par showModal() vit dans
 *    le TOP LAYER du navigateur : une bulle posée dans body serait peinte
 *    DESSOUS quel que soit son z-index. On porte donc la bulle dans la modale
 *    elle-même quand la cible y est. `:modal` distingue showModal() d'un
 *    <dialog open> ordinaire (MythsView en pose un, en position statique).
 *
 * 3. ELLE SURVEILLE SA CIBLE. Voir tipStillAlive : la couche ne se démontant
 *    plus au changement de vue, une bulle orpheline resterait à l'écran.
 */

const TIP_ID = 'help-bubble';

let showFn = null;
let lastHideAt = 0;
let openTimer = null;

function hostFor(el) {
  const dialog = el.closest?.('dialog');
  if (dialog) {
    // `:modal` n'est pas connu de tous les moteurs : en cas de doute on
    // retombe sur body plutôt que de lever pendant un survol.
    try {
      if (dialog.matches(':modal')) return dialog;
    } catch {
      if (dialog.open) return dialog;
    }
  }
  return document.body;
}

function resolveContent(source) {
  return normalizeTipContent(typeof source === 'function' ? source() : source);
}

function showTipAt(el, name, source) {
  if (!showFn || !el) return;
  const content = resolveContent(source);
  if (!content) return;
  const { left, top, flip } = placeTip(el.getBoundingClientRect(), window.innerWidth, window.innerHeight);
  showFn({ left, top, flip, name, content, source, el, host: hostFor(el) });
}

function cancelPending() {
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }
}

function openTip(el, name, source) {
  cancelPending();
  const delay = openDelayFor(Date.now(), lastHideAt);
  if (!delay) {
    showTipAt(el, name, source);
    return;
  }
  // La cible est capturée MAINTENANT : au déclenchement, `e.currentTarget`
  // vaut déjà null (React recycle l'événement).
  openTimer = setTimeout(() => {
    openTimer = null;
    showTipAt(el, name, source);
  }, delay);
}

function hideTip() {
  cancelPending();
  if (showFn) {
    lastHideAt = Date.now();
    showFn(null);
  }
}

/**
 * Props à étaler sur l'élément cible : remplace `title={text}`.
 *
 * `text` accepte une chaîne, un tableau de lignes { label, value } pour un
 * contenu structuré, ou une FONCTION qui rend l'un des deux. La fonction sert
 * aux valeurs vivantes (débits de la Topbar) : le contenu est réévalué tant
 * que la bulle est ouverte, alors qu'une chaîne est figée à l'ouverture.
 *
 * `aria-describedby` est posé en dur : l'attribut pend dans le vide tant que
 * la bulle n'existe pas, ce que les lecteurs d'écran ignorent sans bruit, et
 * se résout dès qu'elle s'ouvre. Sans lui, retirer un `title` retirerait
 * l'information au lecteur d'écran au lieu de la déplacer.
 */
// eslint-disable-next-line react-refresh/only-export-components -- helper étalé sur ~140 éléments ; le Fast Refresh dev n'en pâtit pas
export function tipProps(name, text) {
  if (text == null || text === false) return {};
  return {
    'aria-describedby': TIP_ID,
    onMouseEnter: (e) => openTip(e.currentTarget, name, text),
    onMouseLeave: hideTip,
    onFocus: (e) => openTip(e.currentTarget, name, text),
    onBlur: hideTip
  };
}

export function HelpBubbleLayer() {
  const [tip, setTip] = useState(null);

  useEffect(() => {
    showFn = setTip;
    const hide = () => setTip(null);
    // Échap ferme une modale sans qu'aucun mouseleave ne parte : on coupe tout
    // de suite plutôt que d'attendre le contrôle de survie.
    const onKey = (e) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', hide);
    return () => {
      if (showFn === setTip) showFn = null;
      cancelPending();
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Contrôle de survie de la cible, et rafraîchissement du contenu vivant.
  // Ne tourne QUE pendant qu'une bulle est ouverte : coût nul au repos.
  useEffect(() => {
    if (!tip) return undefined;
    const id = setInterval(() => {
      if (!tipStillAlive(tip.el)) {
        setTip(null);
        return;
      }
      if (typeof tip.source !== 'function') return;
      const next = resolveContent(tip.source);
      if (!next) return;
      setTip((cur) => (cur && cur.el === tip.el ? { ...cur, content: next } : cur));
    }, ALIVE_POLL_MS);
    return () => clearInterval(id);
  }, [tip]);

  if (!tip) return null;

  const bubble = (
    <div
      id={TIP_ID}
      className={`regul-tip${tip.flip ? ' regul-tip--flip' : ''}`}
      style={{ left: `${tip.left}px`, top: `${tip.top}px`, maxWidth: `${BUBBLE_WIDTH}px` }}
      role="tooltip"
    >
      {tip.name && <strong className="regul-tip-name">{tip.name}</strong>}
      {tip.content.kind === 'text' ? (
        <span className="regul-tip-text">{tip.content.text}</span>
      ) : (
        <dl className="regul-tip-rows">
          {tip.content.rows.map((row, i) => (
            <div className="regul-tip-row" key={`${row.label}-${i}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );

  return createPortal(bubble, tip.host);
}
