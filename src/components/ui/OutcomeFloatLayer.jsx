import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { registerOutcomeFloats } from '../../game/core/outcomeFloat.js';
import { openView } from '../../game/core/state.js';
import { emptyStack, pushOutcome, tickOutcomes, stackIsEmpty } from './outcomeStack.js';

// Cadence de vieillissement de la pile. Un seul intervalle pour toute la couche,
// plutôt qu'un minuteur par toast : la fusion relance la vie d'une entrée déjà
// affichée, ce qu'un minuteur par entrée obligerait à annuler et reprogrammer.
const TICK_MS = 120;

// Écart entre le haut de la Régulation et la plus récente des annonces.
const ABOVE_REGUL_PX = 12;

// Le couloir vit en bas à gauche (components.css). Dans la Cité, la Régulation
// borde le bas de la carte : repliée c'est une poignée, dépliée (en crise) un
// panneau d'une demi-hauteur d'écran, dont les boutons sont justement ce qu'on
// clique quand les annonces pleuvent. Le couloir se pose donc juste AU-DESSUS
// d'elle, où qu'elle s'arrête, et calé sur son bord DROIT, côté boutique : à
// gauche, une Régulation dépliée le faisait monter sur le rail d'outils (vu le
// 2026-09-29, l'annonce du haut couvrait le bouton des Mythes). Mesuré au rendu,
// pas deviné : sa hauteur dépend du nombre de politiques débloquées. Au doigt
// (touch-shell.css) le couloir garde sa place centrée en haut, et la Régulation
// n'est pas sur la carte.
function regulAnchor() {
  if (document.documentElement.dataset.pointer === 'coarse') return null;
  const regul = document.querySelector('.app[data-active-view="city"] .city-controls-panel');
  const r = regul ? regul.getBoundingClientRect() : null;
  if (!r || r.height <= 0) return null;
  return {
    bottom: `${Math.round(window.innerHeight - r.top + ABOVE_REGUL_PX)}px`,
    right: `${Math.round(window.innerWidth - r.right)}px`,
  };
}

export default function OutcomeFloatLayer() {
  const [stack, setStack] = useState(emptyStack);
  const layerRef = useRef(null);

  useEffect(() => registerOutcomeFloats((outcome) => {
    setStack((current) => pushOutcome(current, outcome, Date.now()));
  }), []);

  const busy = !stackIsEmpty(stack);
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(() => setStack((current) => tickOutcomes(current, Date.now())), TICK_MS);
    return () => clearInterval(id);
  }, [busy]);

  // Recalé à chaque changement de la pile visible, AVANT la peinture : une
  // annonce n'apparaît jamais à l'ancienne hauteur pour sauter ensuite.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const anchor = regulAnchor();
    layer.classList.toggle('is-over-regul', Boolean(anchor));
    layer.style.bottom = anchor ? anchor.bottom : '';
    layer.style.right = anchor ? anchor.right : '';
  }, [stack.visible]);

  // PAS de `return null` quand la pile est vide : les lecteurs d'écran
  // n'annoncent que les MUTATIONS d'une région aria-live DÉJÀ présente — une
  // région démontée puis ré-insérée déjà remplie reste muette. Le conteneur et
  // la zone sr-only restent donc montés en permanence ; seuls les enfants
  // vont et viennent.
  return (
    <>
      <div className="outcome-float-layer" ref={layerRef}>
        {stack.visible.map((f) => {
          const label = f.count > 1 ? `${f.label} ×${f.count}` : f.label;
          // La COUCHE reste en pointer-events: none (cf. components.css) : seuls
          // les toasts porteurs d'une vue redeviennent cliquables. Sans cela, la
          // couche intercepterait les clics sur la carte, qu'elle recouvre.
          if (!f.view) {
            return <span key={f.id} className={`outcome-float is-${f.kind}`}>{label}</span>;
          }
          return (
            <button
              key={f.id}
              type="button"
              className={`outcome-float is-${f.kind} is-clickable`}
              onClick={() => openView(f.view)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {/* Annonce SÉPARÉE de l'affichage : la pile ne publie que ce qui vient
          d'apparaître, une fusion ou une expiration n'y passent pas. */}
      <div className="sr-only" role="status" aria-live="polite">{stack.announce}</div>
    </>
  );
}
