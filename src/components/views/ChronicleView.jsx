import { useGameState } from '../../hooks/useGameState.js';
import { currentEraIndex } from '../../game/core/mechanics.js';
import { eras } from '../../game/data/world.js';
import { fmt } from '../../game/core/utils.js';

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
            <h2>Les Âges traversés</h2>
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
                    <span className="era-timeline-pop" title="Population requise">
                      {fmt(era.at)} habitants
                    </span>
                    {isCurrent && <span className="era-timeline-now">Âge actuel</span>}
                  </div>
                  <p>{reached ? era.text : "Cet âge reste à découvrir : la population doit encore croître."}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {revealedMax + 1 < eras.length - 1 && (
          <p className="era-timeline-more">… et encore de nombreux âges à traverser.</p>
        )}
      </div>
    </section>
  );
}
