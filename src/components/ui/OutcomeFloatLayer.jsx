import { useEffect, useState } from 'react';
import { registerOutcomeFloats } from '../../game/core/outcomeFloat.js';
import { openView } from '../../game/core/state.js';
import { emptyStack, pushOutcome, tickOutcomes, stackIsEmpty } from './outcomeStack.js';

// Cadence de vieillissement de la pile. Un seul intervalle pour toute la couche,
// plutôt qu'un minuteur par toast : la fusion relance la vie d'une entrée déjà
// affichée, ce qu'un minuteur par entrée obligerait à annuler et reprogrammer.
const TICK_MS = 120;

export default function OutcomeFloatLayer() {
  const [stack, setStack] = useState(emptyStack);

  useEffect(() => registerOutcomeFloats((outcome) => {
    setStack((current) => pushOutcome(current, outcome, Date.now()));
  }), []);

  const busy = !stackIsEmpty(stack);
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(() => setStack((current) => tickOutcomes(current, Date.now())), TICK_MS);
    return () => clearInterval(id);
  }, [busy]);

  if (!stack.visible.length) return null;

  return (
    <>
      <div className="outcome-float-layer">
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
