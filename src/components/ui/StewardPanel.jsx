import { useGameState } from '../../hooks/useGameState.js';
import { state } from '../../game/core/state.js';
import { regulationContext } from '../../game/core/mechanics.js';
import {
  setStewardClause,
  stewardSlotCount,
  stewardActionChoices,
  stewardMagistrate,
  STEWARD_SLOT_UNLOCKS
} from '../../game/core/actions.js';
import { STEWARD_MAX_CLAUSES, STEWARD_THRESHOLDS, STEWARD_FATIGUE_GATE } from '../../game/core/balance.js';
import { REGULATION_ACTIONS_BY_ID } from '../../game/data/regulationActions.js';
import { tr } from '../../game/core/i18n.js';
import { regulActionLabel } from './CycleAnnals.jsx';
import { tipProps } from './HelpBubble.jsx';

/**
 * L'Intendance (onglet Régulation — pilier 3 de la Chancellerie) : consignes
 * conditionnelles « si la Rupture dépasse X % → lancer tel édit ». L'intendance
 * paie les mêmes coûts et la même fatigue que le joueur (cf. steward.js) —
 * c'est un lisseur de micro-gestion, pas un bouclier. Slots gatés Ère IV puis
 * 1 mythe ; chaque consigne est signée par un magistrat (flavor, stable par cycle).
 */

// Office du magistrat selon le foyer de l'édit délégué (pur flavor).
const FOYER_OFFICE = {
  scarcity: { fr: 'aux greniers', en: 'of the granaries' },
  inequality: { fr: 'aux monnaies', en: 'of the coinage' },
  complexity: { fr: 'aux registres', en: 'of the registers' },
  dissent: { fr: 'aux autels', en: 'of the altars' }
};
const BASE_ACTION_FOYER = {
  rationing: 'scarcity',
  festivals: 'inequality',
  census: 'complexity',
  reforms: 'complexity',
  archiveCrisis: 'dissent',
  ancestorCrisis: 'dissent'
};

function clauseAt(clauses, i) {
  return (clauses && clauses[i]) || { threshold: 0.65, actionId: null, enabled: false, lastAt: 0 };
}

function ClauseRow({ slot, clause, choices, now }) {
  const office = clause.actionId
    ? FOYER_OFFICE[REGULATION_ACTIONS_BY_ID[clause.actionId]?.foyer || BASE_ACTION_FOYER[clause.actionId]]
    : null;
  const sinceLast = clause.lastAt ? Math.round((now - clause.lastAt) / 1000) : null;
  return (
    <div className={`steward-clause${clause.enabled ? ' is-armed' : ''}`}>
      <div className="steward-clause-line">
        <span className="steward-clause-if">{tr({ fr: 'Si la Rupture dépasse', en: 'If the Rupture exceeds' })}</span>
        <select
          value={String(clause.threshold)}
          onChange={(e) => setStewardClause(slot, { threshold: parseFloat(e.target.value) })}
          aria-label={tr({ fr: 'Seuil de Rupture', en: 'Rupture threshold' })}
        >
          {STEWARD_THRESHOLDS.map((th) => <option key={th} value={String(th)}>{Math.round(th * 100)} %</option>)}
        </select>
        <span className="steward-clause-arrow" aria-hidden="true">→</span>
        <select
          value={clause.actionId || ''}
          onChange={(e) => setStewardClause(slot, { actionId: e.target.value || null })}
          aria-label={tr({ fr: 'Édit délégué', en: 'Delegated edict' })}
        >
          <option value="">{tr({ fr: '— choisir un édit —', en: '— choose an edict —' })}</option>
          {choices.map((id) => <option key={id} value={id}>{regulActionLabel(id)}</option>)}
        </select>
        <button
          className={`steward-toggle${clause.enabled ? ' is-on' : ''}`}
          disabled={!clause.actionId}
          title={clause.actionId
            ? tr({ fr: "Armer ou suspendre la consigne. L'intendance ne paie que si l'édit est payable, et se met en veille quand l'administration est fatiguée.", en: 'Arm or suspend the clause. The stewardship only pays when the edict is affordable, and stands by when the administration is weary.' })
            : tr({ fr: "Choisissez d'abord un édit à déléguer.", en: 'Choose an edict to delegate first.' })}
          onClick={() => setStewardClause(slot, { enabled: !clause.enabled })}
        >
          {clause.enabled ? `● ${tr({ fr: 'en vigueur', en: 'in force' })}` : `○ ${tr({ fr: 'suspendue', en: 'suspended' })}`}
        </button>
      </div>
      <div className="steward-clause-meta">
        <span className="steward-signature">
          ✍ {stewardMagistrate(slot)}{office ? `, ${tr({ fr: 'intendance', en: 'steward' })} ${tr(office)}` : tr({ fr: ', sans office', en: ', without office' })}
        </span>
        {clause.enabled && (
          <span className="steward-last">
            {sinceLast != null && sinceLast < 600
              ? tr({ fr: `dernière intervention il y a ${sinceLast < 60 ? `${sinceLast} s` : `${Math.round(sinceLast / 60)} min`}`, en: `last intervention ${sinceLast < 60 ? `${sinceLast}s` : `${Math.round(sinceLast / 60)} min`} ago` })
              : tr({ fr: 'veille la jauge', en: 'watching the gauge' })}
          </span>
        )}
      </div>
    </div>
  );
}

export default function StewardPanel() {
  useGameState((s) => s.instability);
  useGameState((s) => (s.stewardClauses || []).map((c) => `${c.threshold}:${c.actionId}:${c.enabled ? 1 : 0}:${c.lastAt}`).join(','));
  const regulFatigue = useGameState((s) => s.regulFatigue || 0);

  const ctx = regulationContext();
  const slots = stewardSlotCount(ctx);
  const choices = stewardActionChoices(ctx);
  const clauses = state.stewardClauses || [];
  const armed = clauses.filter((c, i) => i < slots && c && c.enabled).length;
  // eslint-disable-next-line react-hooks/purity -- horodatage d'affichage « depuis X s » ; le panneau se re-rend déjà à 1 Hz
  const now = Date.now();
  const resting = regulFatigue > STEWARD_FATIGUE_GATE;

  return (
    <section className="regul-block steward-block">
      <h3
        className="regul-block-title"
        {...tipProps(
          tr({ fr: "L'Intendance", en: 'The Stewardship' }),
          tr({
            fr: 'Des consignes permanentes : des magistrats interviennent à votre place — aux mêmes coûts, à la même fatigue, jamais sur la cible.',
            en: 'Standing orders: magistrates act in your stead — same costs, same fatigue, never on the target.'
          })
        )}
      >
        {tr({ fr: "L'Intendance", en: 'The Stewardship' })}
        <span className="regul-block-count">{armed}/{slots || 0}</span>
      </h3>
      {resting && (
        <p className="steward-resting" title={tr({ fr: "Au-delà de 50 % de fatigue, l'intendance attend que l'administration récupère.", en: 'Beyond 50% fatigue, the stewardship waits for the administration to recover.' })}>
          😮‍💨 {tr({ fr: "l'administration souffle — consignes en pause", en: 'the administration is catching its breath — clauses paused' })}
        </p>
      )}
      <div className="steward-clauses">
        {Array.from({ length: STEWARD_MAX_CLAUSES }, (_, i) => (
          i < slots ? (
            <ClauseRow key={i} slot={i} clause={clauseAt(clauses, i)} choices={choices} now={now} />
          ) : (
            <div
              key={i}
              className="steward-clause steward-clause--locked"
              {...tipProps(
                tr({ fr: 'Consigne verrouillée', en: 'Locked clause' }),
                `${tr({ fr: 'Se débloque', en: 'Unlocks' })} : ${tr(STEWARD_SLOT_UNLOCKS[i].unlockLabel)}`
              )}
            >
              🔒 {tr({ fr: 'Consigne', en: 'Clause' })} {i + 1} — {tr(STEWARD_SLOT_UNLOCKS[i].unlockLabel)}
            </div>
          )
        ))}
      </div>
    </section>
  );
}
