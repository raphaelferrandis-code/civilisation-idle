import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../../hooks/useGameState.js';
import { nuitActive } from '../../../game/core/actions/nuitGrandJeu.js';
import { tr } from '../../../game/core/i18n.js';
import { fmt } from '../../../game/core/utils.js';
import { tipProps } from '../../ui/HelpBubble.jsx';
import '../../../styles/plaisirs-nuit.css';

/**
 * LA CAGNOTTE AU MUR (2026-10-04, docs/PLAN-NUIT-DES-PLAISIRS.md, lot 2 : « l'argent
 * qu'on voit ») : en haut de la salle, l'enseigne lumineuse de la cagnotte de la Maison,
 * ses ampoules qui courent, son montant qui ROULE vers sa nouvelle valeur à chaque mise
 * des tables (le compteur ne repart jamais de zéro). Pendant la Nuit du Grand Jeu,
 * l'enseigne s'emballe.
 */

// Le montant qui roule de l'ancienne valeur à la nouvelle (texte écrit directement :
// pas d'état React par image). Le texte rendu par React reste celui du premier rendu :
// sinon chaque nouvelle valeur s'afficherait d'un coup avant de rouler.
function Rouleau({ value }) {
  const ref = useRef(null);
  const shown = useRef(null);
  const [premier] = useState(() => fmt(Math.max(0, Number(value) || 0)));
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const to = Math.max(0, Number(value) || 0);
    const from = shown.current == null ? to : shown.current;
    if (from === to) { el.textContent = fmt(to); shown.current = to; return undefined; }
    let raf = 0, t0 = null;
    const step = (now) => {
      if (t0 === null) t0 = now;
      const u = Math.min(1, (now - t0) / 900);
      const v = u >= 1 ? to : from + (to - from) * (1 - Math.pow(1 - u, 3));
      shown.current = v;
      el.textContent = fmt(Math.round(v));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span ref={ref} className="salle-cagnotte-montant">{premier}</span>;
}

export default function CagnotteSalle({ centre = '50%' }) {
  const pot = useGameState((s) => Math.round(Math.max(0, s.icarusPotFaveur || 0)));
  const nuit = useGameState(() => nuitActive());
  if (!(pot > 0)) return null;
  return (
    <div
      className={`salle-cagnotte${nuit ? ' is-nuit' : ''}`}
      style={{ left: centre }}
      {...tipProps(
        tr({ fr: 'La cagnotte de la Maison', en: 'The House pot' }),
        tr({ fr: 'Nourrie par chaque mise des tables et par la Nuit du Grand Jeu. Icare la rafle à ×10, le carré de six aux osselets, la grande roue de la machine.', en: 'Fed by every stake at the tables and by the Night of High Play. Icarus sweeps it at ×10, four sixes at knucklebones, the machine\'s grand wheel.' })
      )}
    >
      {/* La lueur de la Nuit, peinte une fois et respirant en opacité (PERF-65). */}
      {nuit && <i className="lueur" aria-hidden="true" />}
      <span className="salle-cagnotte-titre">{tr({ fr: 'Cagnotte', en: 'Jackpot' })}</span>
      <Rouleau value={pot} />
    </div>
  );
}
