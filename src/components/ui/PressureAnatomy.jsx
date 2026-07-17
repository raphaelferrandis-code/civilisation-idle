import { useGameState } from '../../hooks/useGameState.js';
import { pressureBreakdown } from '../../game/core/mechanics.js';
import { pct } from '../../game/core/utils.js';
import { INEQUALITY_RESERVE_REF_S } from '../../game/core/balance.js';
import { tr } from '../../game/core/i18n.js';
import { tipProps } from './HelpBubble.jsx';

/**
 * Anatomie de la Rupture (pilier 1 de la Chancellerie) — version DENSE (passe
 * 2026-07-14, retour Raph « enlève les cadres, pas trop d'infos, tout sans
 * scroller ») : plus de panneau ni de sous-titre, une ligne par affluent
 * (icône + nom + barre + %), le MOTEUR chiffré de chaque source vit dans son
 * tooltip. Le barrage est du texte nu entre deux flèches. Fidèle à la formule :
 * la Démesure s'ajoute APRÈS la mitigation → rangée de dérivation dédiée.
 */

const FOYER_TONE = {
  scarcity: 'var(--res-food)',
  inequality: 'var(--res-treasure)',
  complexity: 'var(--res-knowledge)',
  dissent: 'var(--state-usure)',
  structural: 'var(--res-infra)',
  demesure: '#d97a4e'
};

function AnatomyRow({ foyer, label, value, title, icon }) {
  return (
    <div className="anatomy-row" style={{ '--foyer-color': FOYER_TONE[foyer] }} {...tipProps(label, title)}>
      <span className="anatomy-icon" aria-hidden="true">
        <img src={icon} alt="" />
      </span>
      <span className="anatomy-name">{label}</span>
      <span className="anatomy-track"><span className="anatomy-fill" style={{ width: `${Math.min(1, value) * 100}%` }}></span></span>
      <span className="anatomy-val">{pct(value)}</span>
    </div>
  );
}

export default function PressureAnatomy() {
  useGameState((s) => s.instability);
  const cycles = useGameState((s) => s.cycles);
  const p = pressureBreakdown();
  const g = p.gauges || {};

  const foodCoverage = Math.max(0, Math.round((1 - (g.scarcityDeficit || 0)) * 100));
  const reserveS = g.goldReserveSeconds != null ? Math.round(g.goldReserveSeconds) : null;
  const coverageX = (g.infraCoverage || 0).toFixed(1);
  const demesureCutPct = Math.round((g.demesureCut || 0) * 100);
  const gracesPct = Math.round((g.graces || 0) * 100);
  const ruinStabPct = Math.round((g.ruinStability || 0) * 100);

  // Le moteur chiffré de chaque affluent (ex-sous-ligne) OUVRE le tooltip,
  // suivi de l'explication longue.
  const rows = [
    {
      foyer: 'scarcity', value: p.scarcity, icon: '/pixelart/ui/foyers/scarcity.png',
      label: tr({ fr: 'Subsistance', en: 'Subsistence' }),
      title: tr({
        fr: `Le manque de nourriture. Les entrepôts couvrent ${foodCoverage} % du besoin. Un déficit prolongé fait monter cette pression.`,
        en: `Food shortage. Warehouses cover ${foodCoverage}% of need. A lasting deficit raises this pressure.`
      })
    },
    {
      foyer: 'inequality', value: p.inequality, icon: '/pixelart/ui/foyers/inequality.png',
      label: tr({ fr: 'Inégalités', en: 'Inequality' }),
      title: reserveS == null
        ? tr({ fr: 'La richesse accumulée dans le trésor. Plus la réserve grossit, plus cette pression monte.', en: 'Wealth piled up in the treasury. The bigger the reserve, the higher this pressure.' })
        : tr({
          fr: `La richesse accumulée dans le trésor. La réserve vaut ${reserveS} s de revenu et pèse au-delà de ${INEQUALITY_RESERVE_REF_S} s.`,
          en: `Wealth piled up in the treasury. The reserve is worth ${reserveS}s of income and weighs beyond ${INEQUALITY_RESERVE_REF_S}s.`
        })
    },
    {
      foyer: 'complexity', value: p.complexity, icon: '/pixelart/ui/foyers/complexity.png',
      label: tr({ fr: 'Complexité', en: 'Complexity' }),
      title: (g.knowledgeStrain || 0) > 0.5
        ? tr({
          fr: `Le poids administratif de la cité. ${g.riskyBuildingCount || 0} bâtiments à administrer. Le savoir dépasse ce que l'infrastructure peut tenir et pèse aussi.`,
          en: `The city's administrative weight. ${g.riskyBuildingCount || 0} buildings to administer. Knowledge exceeds what infrastructure can hold and weighs too.`
        })
        : tr({
          fr: `Le poids administratif de la cité. ${g.riskyBuildingCount || 0} bâtiments à administrer, absorbés par la couverture d'infrastructure.`,
          en: `The city's administrative weight. ${g.riskyBuildingCount || 0} buildings to administer, absorbed by infrastructure coverage.`
        })
    },
    {
      foyer: 'dissent', value: p.dissent, icon: '/pixelart/ui/foyers/dissent.png',
      label: tr({ fr: 'Dissidence', en: 'Dissent' }),
      title: tr({
        fr: `La mémoire de ${cycles || 0} cycle${(cycles || 0) > 1 ? 's' : ''} et des ruines divise l'opinion. Cette pression grandit à chaque âge.`,
        en: `The memory of ${cycles || 0} cycle${(cycles || 0) > 1 ? 's' : ''} and the ruins divides opinion. This pressure grows each age.`
      })
    },
    {
      foyer: 'structural', value: p.structural, icon: '/pixelart/ui/foyers/structural.png',
      label: tr({ fr: 'Structurelle', en: 'Structural' }),
      title: tr({
        fr: `L'instabilité propre à certains bâtiments. ${g.stabilizerCount || 0} bâtiments stabilisants la réduisent.`,
        en: `The instability inherent to some buildings. ${g.stabilizerCount || 0} stabilizing buildings reduce it.`
      })
    }
  ];

  return (
    <section className="regul-block anatomy-block">
      <h3
        className="regul-block-title"
        {...tipProps(
          tr({ fr: 'Anatomie de la Rupture', en: 'Anatomy of the Rupture' }),
          tr({ fr: "D'où vient la pression et ce que vos institutions en absorbent.", en: 'Where the pressure comes from and what your institutions absorb.' })
        )}
      >
        {tr({ fr: 'Anatomie de la Rupture', en: 'Anatomy of the Rupture' })}
      </h3>
      <div className="anatomy-flow">
        <div className="anatomy-sources">
          {rows.map((r) => <AnatomyRow key={r.foyer} {...r} />)}
        </div>
        <span className="anatomy-arrow" aria-hidden="true">→</span>
        <div
          className="anatomy-dam"
          {...tipProps(
            tr({ fr: 'Barrage des institutions', en: 'Dam of institutions' }),
            tr({
              fr: 'La part de pression que vos institutions absorbent en continu.',
              en: 'The share of pressure your institutions absorb continuously.'
            })
          )}
        >
          <span className="anatomy-dam-name">{tr({ fr: 'Institutions', en: 'Institutions' })}</span>
          <strong className="anatomy-dam-val">−{pct(p.mitigation)}</strong>
          <span className="anatomy-dam-chips">
            <span>{tr({ fr: 'couverture', en: 'coverage' })} ×{coverageX}</span>
            {ruinStabPct > 0 && <span>{tr({ fr: 'ruines', en: 'ruins' })} +{ruinStabPct} %</span>}
            {gracesPct > 0 && <span>{tr({ fr: 'grâces', en: 'graces' })} +{gracesPct} %</span>}
          </span>
        </div>
        <span className="anatomy-arrow" aria-hidden="true">→</span>
        <div className={`anatomy-target${p.total >= 1 ? ' is-over' : ''}`}>
          <strong className="anatomy-target-val">{pct(p.total)}</strong>
          <span className="anatomy-target-sub">{tr({ fr: 'cible · seuil 100 %', en: 'target · threshold 100%' })}</span>
        </div>
        <div className="anatomy-bypass">
          <AnatomyRow
            foyer="demesure"
            value={p.demesure}
            icon="/pixelart/ui/foyers/demesure.png"
            label={tr({ fr: 'Démesure', en: 'Hubris' })}
            title={tr({
              fr: `La démesure d'une cité de 10^${(g.popLog || 0).toFixed(1)} habitants. Elle s'ajoute après le barrage. La Gouvernance impériale la réduit de ${demesureCutPct} %.`,
              en: `The hubris of a city of 10^${(g.popLog || 0).toFixed(1)} inhabitants. It is added after the dam. Imperial Governance reduces it by ${demesureCutPct}%.`
            })}
          />
          <span className="anatomy-bypass-note">
            {tr({ fr: 'contourne le barrage', en: 'bypasses the dam' })} <span aria-hidden="true">↗</span>
          </span>
        </div>
      </div>
    </section>
  );
}
