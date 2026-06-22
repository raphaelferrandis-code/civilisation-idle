import { useGameState } from '../../hooks/useGameState.js';
import { fmt } from '../../game/core/utils.js';
import RuinsTreeGraph from './RuinsTreeGraph.jsx';

export default function RuinsView() {
  const ruins = useGameState(s => s.ruins);

  return (
    <section className="view active" id="ruinsView">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Mémoire des Ruines</h2>
          </div>
          <div className="prestige-ruins-counter">
            <span className="label">Ruines Disponibles</span>
            <strong>{fmt(ruins)} <i className="fa-solid fa-landmark" aria-hidden="true"></i></strong>
          </div>
        </div>
        <RuinsTreeGraph />
      </div>
    </section>
  );
}
