import { useEffect } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { clearCycleReport } from '../../game/core/state.js';
import { fmt } from '../../game/core/utils.js';
import { D } from '../../game/core/num.js';
import { tr } from '../../game/core/i18n.js';

// BILAN DE FIN DE CYCLE (D9). Sur le chemin SILENCIEUX de l'effondrement (Édit
// automatique, ou testament déjà gravé), la civilisation tombait sans un mot,
// alors que le chemin manuel ouvre une stèle chiffrée. Ce bandeau rétablit le
// récapitulatif sans jamais voler le focus : ce n'est PAS un dialogue, rien ne
// se met en pause, l'automatisation continue, et il s'efface tout seul.
const SHOW_MS = 9000;

const CAUSE_LABELS = {
  famine: { fr: "la famine", en: "famine" },
  instability: { fr: "la révolte", en: "revolt" },
  time: { fr: "l'usure du temps", en: "the wear of time" },
  auto_collapse: { fr: "l'Édit d'effondrement", en: "the Collapse Edict" }
};

// Durée en langage courant : « 4 min 12 s », « 1 h 07 ». Un cycle se raconte,
// il ne se lit pas en secondes.
function humanDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

// Écart relatif, mis en forme à partir d'un RAPPORT (courant / précédent).
// null quand il n'y a pas de point de comparaison (première chute) ou que
// l'écart est trop faible pour valoir un chiffre à l'écran.
function deltaFromRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const pct = Math.round((ratio - 1) * 100);
  if (Math.abs(pct) < 5) return null;
  return { pct, up: pct > 0 };
}

export default function CycleReportBanner() {
  const shown = useGameState(s => s.lastCycleReport);

  // Aucun état local : le bandeau EST le champ du state, et le minuteur ne fait
  // que le consommer. Recopier le rapport en state React obligerait à écrire
  // dans un effet, et à tenir deux vérités sur « qu'est-ce qui est affiché ».
  useEffect(() => {
    if (!shown) return undefined;
    const id = setTimeout(clearCycleReport, SHOW_MS);
    return () => clearTimeout(id);
  }, [shown]);

  if (!shown) return null;

  const gain = D(shown.ruinGain || 0);
  const prevGain = shown.prevRuinGain == null ? null : D(shown.prevRuinGain);
  // Rapport en Decimal puis converti : les gains de ruines dépassent vite le
  // plafond float, un écart calculé en natif partirait en Infinity.
  const gainDelta = prevGain && prevGain.gt(0) ? deltaFromRatio(gain.div(prevGain).toNumber()) : null;
  const timeDelta = shown.prevCycleSec > 0 ? deltaFromRatio(shown.cycleSec / shown.prevCycleSec) : null;
  const causeLabel = CAUSE_LABELS[shown.cause] ? tr(CAUSE_LABELS[shown.cause]) : shown.cause;

  return (
    <div className="cycle-report" role="status">
      <div className="cycle-report-head">
        {tr({ fr: `Chute de ${shown.dynasty}`, en: `Fall of ${shown.dynasty}` })}
        <span className="cycle-report-year">{tr({ fr: `an ${fmt(shown.year)}`, en: `year ${fmt(shown.year)}` })}</span>
      </div>
      <div className="cycle-report-line">
        {tr({ fr: "Emportée par", en: "Taken by" })} <strong>{causeLabel}</strong>
        {tr({ fr: " après ", en: " after " })}
        <strong>{humanDuration(shown.cycleSec)}</strong>
        {timeDelta && (
          <span className={`cycle-report-delta ${timeDelta.up ? 'is-up' : 'is-down'}`}>
            {timeDelta.up ? '+' : ''}{timeDelta.pct}%
          </span>
        )}
      </div>
      <div className="cycle-report-line">
        {tr({ fr: "Pic de", en: "Peak of" })} <strong>{fmt(D(shown.peakPop || 0))}</strong>{tr({ fr: " habitants", en: " inhabitants" })}
      </div>
      <div className="cycle-report-line cycle-report-gain">
        <strong>+{fmt(gain)}</strong> {tr({ fr: "ruines moissonnées", en: "ruins harvested" })}
        {gainDelta && (
          <span className={`cycle-report-delta ${gainDelta.up ? 'is-up' : 'is-down'}`}>
            {gainDelta.up ? '+' : ''}{gainDelta.pct}%
          </span>
        )}
      </div>
    </div>
  );
}
