import { useGameState } from '../../hooks/useGameState.js';
import { pressureBreakdown } from '../../game/core/mechanics.js';
import { pct, clamp01 } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { tipProps } from './HelpBubble.jsx';

/**
 * Jauges Rupture / Usure — BANDEAU FIN (passe densité 2026-07-14, retour Raph
 * « réduit la taille, enlève les cadres ») : une seule ligne, plus de cartes ni
 * de sous-textes. La cible (« monte vers X % ») vit dans le tooltip et le
 * fantôme sur la barre — le chiffre détaillé est déjà dans l'Anatomie (cible).
 * ⚠ classes DÉDIÉES (tension-*) : les barometer-* de views-crises.css servent
 * encore la jauge héros de l'Effondrement, ne pas les partager.
 */
export default function TensionBarometers() {
  const instability = useGameState(s => s.instability);
  const timeWear = useGameState(s => s.timeWear);
  const pressure = pressureBreakdown();

  return (
    <div className="tension-strip">
      <div
        className="tension-gauge tension-gauge--rupture"
        {...tipProps(tr({ fr: 'Rupture', en: 'Rupture' }), tr({
          fr: `La jauge dérive vers ${pct(pressure.total)}, le trait blanc. À 100 %, la crise s'ouvre.`,
          en: `The gauge drifts toward ${pct(pressure.total)}, the white tick. At 100%, the crisis opens.`
        }))}
      >
        <span className="tension-label">{tr({ fr: 'Rupture', en: 'Rupture' })}</span>
        <span className="tension-track">
          <span className="tension-fill tension-fill--rupture" style={{ width: `${clamp01(instability) * 100}%` }}></span>
          <span className="tension-ghost" style={{ left: `${clamp01(pressure.total) * 100}%` }}></span>
        </span>
        <strong className="tension-val">{pct(instability)}</strong>
      </div>
      <div
        className="tension-gauge tension-gauge--usure"
        {...tipProps(tr({ fr: 'Usure du Temps', en: 'Wear of Time' }), tr({
          fr: "Monte avec le temps. À 100 %, la fin d'une ère s'impose.",
          en: 'Rises with time. At 100%, the end of an era imposes itself.'
        }))}
      >
        <span className="tension-label">{tr({ fr: 'Usure', en: 'Wear' })}</span>
        <span className="tension-track">
          <span className="tension-fill tension-fill--usure" style={{ width: `${clamp01(timeWear) * 100}%` }}></span>
        </span>
        <strong className="tension-val">{pct(timeWear)}</strong>
      </div>
    </div>
  );
}
