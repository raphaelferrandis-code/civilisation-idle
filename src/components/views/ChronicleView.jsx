import { useGameState } from '../../hooks/useGameState.js';
import { currentEraIndex } from '../../game/core/mechanics.js';
import { eras } from '../../game/data/world.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';

export default function ChronicleView() {
  const bestEraIndex = useGameState(s => s.bestEraIndex || 0);
  const eraIdx = useGameState(() => currentEraIndex());

  // Les âges déjà atteints (sur l'ensemble des cycles) sont révélés ; le
  // suivant est annoncé en silhouette, le reste demeure inconnu.
  const revealedMax = Math.max(bestEraIndex, eraIdx);

  return (
    <section className="view active" id="history">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>{tr({ fr: 'Les Âges traversés', en: 'The Ages Traversed' })}</h2>
          </div>
        </div>

        <ol className="era-timeline">
          {eras.map((era, i) => {
            if (i > revealedMax + 1) return null;
            const reached = i <= revealedMax;
            const isCurrent = i === eraIdx;
            return (
              <li
                key={era.name}
                className={`era-timeline-item${reached ? ' is-reached' : ' is-next'}${isCurrent ? ' is-current' : ''}`}
              >
                <span className="era-timeline-marker" aria-hidden="true"></span>
                <div className="era-timeline-body">
                  <div className="era-timeline-head">
                    <h3>{reached ? era.name : '— ? —'}</h3>
                    <span className="era-timeline-pop" title={tr({ fr: 'Population requise', en: 'Population required' })}>
                      {fmt(era.at)} {tr({ fr: 'habitants', en: 'inhabitants' })}
                    </span>
                    {isCurrent && <span className="era-timeline-now">{tr({ fr: 'Âge actuel', en: 'Current Age' })}</span>}
                  </div>
                  <p>{reached ? era.text : tr({ fr: "Cet âge reste à découvrir : la population doit encore croître.", en: "This age remains to be discovered: the population must still grow." })}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {revealedMax + 1 < eras.length - 1 && (
          <p className="era-timeline-more">{tr({ fr: '… et encore de nombreux âges à traverser.', en: '… and many more ages yet to traverse.' })}</p>
        )}
      </div>
    </section>
  );
}
