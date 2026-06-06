import { useGameState } from '../hooks/useGameState.js';
import {
  cityVitals,
  pressureBreakdown,
  rates,
  ruinMultiplier,
  ruinGain,
  theocracyKnowledgeRate,
  has,
  nomadInfrastructureCap,
  crisisOpen
} from '../game/core/mechanics.js';
import { fmt, pct, clamp01 } from '../game/core/utils.js';

export default function Topbar() {
  // Subscribe to changes in core state properties to trigger re-renders
  const population = useGameState(s => s.population);
  const food = useGameState(s => s.food);
  const gold = useGameState(s => s.gold);
  const knowledge = useGameState(s => s.knowledge);
  const infrastructure = useGameState(s => s.infrastructure);
  const instability = useGameState(s => s.instability);
  const timeWear = useGameState(s => s.timeWear);
  const ruins = useGameState(s => s.ruins);

  // Recalculate rates & factors on the fly
  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);
  
  const ruinMult = ruinMultiplier();
  const ruinGainVal = ruinGain();

  const isCrisisActive = crisisOpen();

  const collapseHint = isCrisisActive ? `+${fmt(ruinGainVal)} ruines possibles` : "structure a 100%";
  const timeWearHint = isCrisisActive ? `+${fmt(ruinGainVal)} ruines possibles` : "avance hors ligne";

  const showNomadCap = has("trait_nomadism");
  const nomadCap = nomadInfrastructureCap();

  return (
    <header className="topbar">
      <div className="resource primary resource-population" id="populationResource" tabIndex={0} data-tooltip="Nombre d'habitants. Ils produisent surtout nourriture, puis tresor quand la cite grossit.">
        <span>Population</span>
        <strong id="population">{fmt(population)}</strong>
        <small><b id="popRate">{fmt(r.population)}</b> / sec</small>
      </div>

      <div className="resource resource-food" id="foodResource" tabIndex={0} data-tooltip="Premier carburant economique. Les moteurs de nourriture financent ensuite les moteurs de tresor.">
        <span>Nourriture</span>
        <strong id="food">{fmt(food)}</strong>
        <small><b id="foodRate">{fmt(r.food)}</b> / sec</small>
      </div>

      <div className="resource resource-gold" id="goldResource" tabIndex={0} data-tooltip="Monnaie urbaine. Les gros moteurs de tresor financent surtout les producteurs de savoir.">
        <span>Tresor</span>
        <strong id="gold">{fmt(gold)}</strong>
        <small><b id="goldRate">{fmt(r.gold)}</b> / sec</small>
      </div>

      <div className="resource resource-knowledge" id="knowledgeResource" tabIndex={0} data-tooltip="Memoire active. Le savoir sert surtout a acheter les infrastructures et a rendre les effondrements plus riches.">
        <span>Savoir</span>
        <strong id="knowledge">{fmt(knowledge)}</strong>
        <small><b id="knowledgeRate">{fmt(r.knowledge + theocracyKnowledgeRate())}</b> / sec</small>
      </div>

      <div className="resource resource-infrastructure" id="infrastructureResource" tabIndex={0} data-tooltip="Routes, aqueducs, administration. S'achete surtout avec le savoir et calme la rupture.">
        <span>Infrastructure</span>
        <strong id="infrastructure">{fmt(infrastructure)}</strong>
        <small>
          <b id="infraRate">
            {showNomadCap ? `${fmt(r.infrastructure)} (cap ${fmt(nomadCap)})` : fmt(r.infrastructure)}
          </b>
        </small>
      </div>

      <div className={`resource strain ${instability >= 1 ? 'crisis-ready' : ''}`} id="instabilityResource" tabIndex={0} data-tooltip="Instabilite structurelle. Elle monte avec la complexite, les tensions et les choix de croissance.">
        <span>Rupture</span>
        <strong id="instability">{pct(instability)}</strong>
        <small id="collapseHint">{collapseHint}</small>
        <div className="instability-meter" aria-hidden="true">
          <span id="instabilityMeter" style={{ width: `${clamp01(instability) * 100}%` }}></span>
        </div>
      </div>

      <div className="resource strain timewear" id="timeWearResource" tabIndex={0} data-tooltip="Usure historique. Elle avance lentement avec le temps, meme hors ligne, et peut ouvrir une crise a 100%.">
        <span>Usure</span>
        <strong id="timeWear">{pct(timeWear)}</strong>
        <small id="timeWearHint">{timeWearHint}</small>
        <div className="instability-meter" aria-hidden="true">
          <span id="timeWearMeter" style={{ width: `${clamp01(timeWear) * 100}%` }}></span>
        </div>
      </div>

      <div className="resource ruins-resource" id="ruinsResource" tabIndex={0} data-tooltip="Ruines accumulees a travers les effondrements. Elles financent l'arbre inter-cycles et donnent un multiplicateur permanent.">
        <span>Ruines</span>
        <strong id="ruinsTopbar">{fmt(ruins)}</strong>
        <small>Ã—<b id="ruinMultTopbar">{fmt(ruinMult)}</b></small>
      </div>
    </header>
  );
}
