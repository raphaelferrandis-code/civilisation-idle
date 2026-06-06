import { useState, useEffect } from 'react';
import { useGameState } from '../hooks/useGameState.js';
import CityMapCanvas from './CityMapCanvas.jsx';
import BuildingShop from './BuildingShop.jsx';
import {
  cityVitals,
  pressureBreakdown,
  rates,
  currentEraIndex,
  nextEraProgress,
  globalMultiplier,
  ruinEffectSum,
  unspentRuinsPowerMultiplier,
  has,
  theocracyKnowledgeRate
} from '../game/core/mechanics.js';
import { gather, exhumeVestige } from '../game/core/actions.js';
import { save, setCityName } from '../game/core/state.js';
import { eras } from '../game/data/world.js';
import { fmt, pct, clamp01, roman, multLabel } from '../game/core/utils.js';
import {
  ICARE_INFRA_TARGET,
  OR_GOLD_TARGET,
  OR_POP_CAP,
  BABEL_CAT_LABELS,
  PHENIX_CYCLE_COUNT,
  HEPH_INFRA_TARGET
} from '../game/data/myths.js';

function mood(value, labels) {
  if (value >= 0.95) return labels[3];
  if (value >= 0.45) return labels[2];
  if (value >= 0.12) return labels[1];
  return labels[0];
}

export default function CityView() {
  const cityName = useGameState(s => s.cityName);
  const population = useGameState(s => s.population);
  const food = useGameState(s => s.food);
  const gold = useGameState(s => s.gold);
  const knowledge = useGameState(s => s.knowledge);
  const infrastructure = useGameState(s => s.infrastructure);
  const instability = useGameState(s => s.instability);
  const timeWear = useGameState(s => s.timeWear);
  const cycles = useGameState(s => s.cycles);
  const dynastyCount = useGameState(s => s.dynastyCount);
  const bestEraIndex = useGameState(s => s.bestEraIndex);
  const cycleStartedAt = useGameState(s => s.cycleStartedAt);
  const archaeologyUsed = useGameState(s => s.archaeologyUsed);
  
  // Myth tracking
  const activeMythId = useGameState(s => s.activeMythId);
  const sisypheMult = useGameState(s => s.sisypheMult);
  const icareInfraReached = useGameState(s => s.icareInfraReached);
  const babelProdReached = useGameState(s => s.babelProdReached);
  const babelCategory = useGameState(s => s.babelCategory);
  const orPopPeak = useGameState(s => s.orPopPeak);
  const orUsureImbalance = useGameState(s => s.orUsureImbalance);
  const phoenixCycleCount = useGameState(s => s.phoenixCycleCount);
  const phoenixTotalRuins = useGameState(s => s.phoenixTotalRuins);
  const phoenixNextForceAt = useGameState(s => s.phoenixNextForceAt);
  const hephPopPeak = useGameState(s => s.hephPopPeak);
  const hephGoalReached = useGameState(s => s.hephGoalReached);
  const atlasLegitimite = useGameState(s => s.atlasLegitimite);
  const atlasHeritage = useGameState(s => s.atlasHeritage);

  const [now, setNow] = useState(() => Date.now());

  // Update cycle duration timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);

  const globalMult = globalMultiplier();

  const eraIndex = currentEraIndex();
  const era = eras[eraIndex];
  const progress = nextEraProgress(eraIndex);
  const nextEra = eras[eraIndex + 1];

  const unspentPower = ruinEffectSum("unspentRuinsPower");
  const unspentMult = unspentPower > 0 ? unspentRuinsPowerMultiplier() : 1;
  const hasLatent = unspentPower > 0;

  const showExhume = has("skill_archaeology") && !archaeologyUsed;

  const handleNameChange = (e) => {
    setCityName(e.target.value);
  };

  const handleNameBlur = () => {
    save();
  };

  // formatting for special myths
  const isSisyphe = activeMythId === "mythe_de_sisyphe";
  const isIcare = activeMythId === "mythe_d_icare";
  const isBabel = activeMythId === "mythe_de_babel";
  const isOr = activeMythId === "mythe_age_or";
  const isPhoenix = activeMythId === "mythe_du_phenix";
  const isHeph = activeMythId === "mythe_d_hephaistos";
  const cycleSeconds = Math.floor((now - (cycleStartedAt || now)) / 1000);
  const phoenixSeconds = phoenixNextForceAt ? Math.max(0, Math.floor((phoenixNextForceAt - now) / 1000)) : null;

  return (
    <section className="view active" id="city">
      <div className="city-left-col">
        <div className="panel focus">
          <div className="panel-heading">
            <div>
              <input
                id="cityNameInput"
                className="city-name-input"
                maxLength={42}
                value={cityName}
                onChange={handleNameChange}
                onBlur={handleNameBlur}
                aria-label="Nom de la ville"
              />
            </div>
          </div>
          
          <div className="city-dashboard" aria-label="Tableau de bord de la cite">
            <div className="city-pop-card">
              <span>Population</span>
              <strong id="cityPopulation">{fmt(population)}</strong>
              <small><b id="cityPopRate">{fmt(r.population)}</b> / sec</small>
            </div>
            
            <div className="city-prod-food">
              <span>Nourriture</span>
              <strong id="cityFoodTotal">{fmt(food)}</strong>
              <small><b id="cityFoodRate">{fmt(r.food)}</b> / sec</small>
            </div>
            
            <div className="city-prod-gold">
              <span>Tresor</span>
              <strong id="cityGoldTotal">{fmt(gold)}</strong>
              <small><b id="cityGoldRate">{fmt(r.gold)}</b> / sec</small>
            </div>
            
            <div className="city-prod-knowledge">
              <span>Savoir</span>
              <strong id="cityKnowledgeTotal">{fmt(knowledge)}</strong>
              <small><b id="cityKnowledgeRate">{fmt(r.knowledge + theocracyKnowledgeRate())}</b> / sec</small>
            </div>
            
            <div className="city-prod-infra">
              <span>Infrastructure</span>
              <strong id="cityInfraTotal">{fmt(infrastructure)}</strong>
              <small><b id="cityInfraRate">{fmt(r.infrastructure)}</b> / sec</small>
            </div>
            
            <div className="city-pressure-card">
              <div className="city-gauge-row">
                <div className="city-gauge-label">
                  <span>Rupture</span>
                  <strong id="cityInstability">{pct(instability)}</strong>
                </div>
                <div className="city-wide-gauge rupture-gauge">
                  <span id="cityInstabilityBar" style={{ width: `${clamp01(instability) * 100}%` }}></span>
                </div>
              </div>
              
              <div className="city-gauge-row">
                <div className="city-gauge-label">
                  <span>Usure</span>
                  <strong id="cityTimeWear">{pct(timeWear)}</strong>
                </div>
                <div className="city-wide-gauge wear-gauge">
                  <span id="cityTimeWearBar" style={{ width: `${clamp01(timeWear) * 100}%` }}></span>
                </div>
              </div>

              {(atlasHeritage || activeMythId === "mythe_d_atlas") && (
                <div className="city-gauge-row">
                  <div className="city-gauge-label">
                    <span>Legitimite</span>
                    <strong id="atlasLegitimiteValue">{fmt(atlasLegitimite)}</strong>
                  </div>
                  <div className="city-wide-gauge legitimite-gauge">
                    <span id="atlasLegitimiteBar" style={{ width: `${clamp01((atlasLegitimite || 0) / 100) * 100}%` }}></span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            className="civilization-map"
            id="civilizationMap"
            type="button"
            onClick={gather}
            aria-label="Encourager doucement la civilisation"
          >
            <CityMapCanvas />
            
            <div className="map-caption map-age">
              <div className="map-age-head">
                <span className="label">Age courant</span>
                <span className="era-index" id="eraIndexDisplay">
                  {roman(eraIndex + 1)} / {roman(eras.length)}
                </span>
              </div>
              <strong className="era-name" id="eraName">{era.name}</strong>
              <div className="era-progress-wrap">
                <div className="era-track">
                  <span id="eraProgress" style={{ width: `${progress * 100}%` }}></span>
                </div>
                <span className="era-next-label" id="eraNextName">
                  {nextEra ? `â†’ ${nextEra.name}` : "Apogee atteinte"}
                </span>
              </div>
              <p className="era-flavor" id="eraText">{era.text}</p>
            </div>
          </button>

          <div className="metrics-grid">
            <div><span>Cycles</span><strong id="cycles">{fmt(cycles)}</strong></div>
            <div><span>Dynastie</span><strong id="dynastyAge">{roman(dynastyCount + 1)}</strong></div>
            <div><span>Multiplicateur</span><strong id="globalMult">x{fmt(globalMult)}</strong></div>
            <div><span>Age max</span><strong id="bestEra">{eras[bestEraIndex].name}</strong></div>
            <div><span>Temps du cycle</span><strong id="cycleTime">{cycleSeconds}s</strong></div>
            
            {isSisyphe && (
              <div className="sisyphe-mult-row">
                <span>âš– Malediction</span>
                <strong id="sisypheMultValue">x{fmt(sisypheMult || 1)}</strong>
              </div>
            )}
            
            {isIcare && (
              <div className="icare-timer-row">
                <span>âš¡ Cycle Icare</span>
                <strong id="icareTimerValue">
                  {icareInfraReached ? "Soleil touchÃ© !" : `Infra target: ${fmt(infrastructure)} / ${fmt(ICARE_INFRA_TARGET)}`}
                </strong>
              </div>
            )}
            
            {isBabel && (
              <div className="babel-status-row">
                <span>ðŸ— Babel</span>
                <span id="babelCategoryValue">{BABEL_CAT_LABELS[babelCategory] || babelCategory || 'Non choisi'}</span>
                <strong id="babelMultValue">{babelProdReached ? "Tour achevÃ©e !" : "En construction"}</strong>
              </div>
            )}
            
            {isOr && (
              <div className="or-status-row" style={{ gridColumn: 'span 2', fontSize: '0.8rem' }}>
                <span>âœ¦ Age d'Or</span>
                <span>Or: {fmt(gold)} / {fmt(OR_GOLD_TARGET)}</span>
                <span>Peak Pop: {fmt(orPopPeak)} / {fmt(OR_POP_CAP)}</span>
                <span>{orUsureImbalance ? "DÃ©sÃ©quilibrÃ© !" : "Ã‰quilibrÃ©"}</span>
              </div>
            )}
            
            {isPhoenix && (
              <div className="phoenix-status-row" style={{ gridColumn: 'span 2', fontSize: '0.8rem' }}>
                <span>ðŸ”¥ Phenix</span>
                <span>Cycle: {phoenixCycleCount} / {PHENIX_CYCLE_COUNT}</span>
                <span>Ruines: {fmt(phoenixTotalRuins)}</span>
                <span>Prox: {phoenixSeconds !== null ? `${phoenixSeconds}s` : '-'}</span>
              </div>
            )}
            
            {isHeph && (
              <div className="heph-status-row" style={{ gridColumn: 'span 2', fontSize: '0.8rem' }}>
                <span>âš™ Hephaistos</span>
                <span>Infra: {fmt(infrastructure)} / {fmt(HEPH_INFRA_TARGET)}</span>
                <span>Decay: {population < hephPopPeak ? `Pop en dÃ©clin (Pic ${fmt(hephPopPeak)})` : 'Stable'}</span>
                {hephGoalReached && <strong>Pacte accompli !</strong>}
              </div>
            )}
            
            {hasLatent && (
              <div id="cityLatentRow">
                <span>Puissance latente</span>
                <strong id="cityLatentBonus">x{fmt(unspentMult)}</strong>
              </div>
            )}
          </div>
        </div>

        <div className="panel city-state">
          <div className="panel-heading">
            <div>
              <span className="label">Etat de la cite</span>
              <h2>Sante des ressources</h2>
            </div>
          </div>
          
          <div className="city-health-grid">
            <div className="health-card health-food">
              <div className="health-header">
                <span className="health-label">Reserves</span>
                <strong className="health-mood" id="foodMood">
                  {mood(vitals.foodScore, ["Famine proche", "Greniers modestes", "Surplus rassurant", "Abondance"])}
                </strong>
              </div>
              <div className="health-bar">
                <span id="foodBar" style={{ width: `${clamp01(vitals.foodScore) * 100}%` }}></span>
              </div>
              <small className="health-effect" id="foodEffect">
                Croissance pop {multLabel(vitals.populationMult)} Â· pression -{fmt(clamp01(vitals.foodScore - 0.92) * 1.8)} pts
              </small>
            </div>
            
            <div className="health-card health-gold">
              <div className="health-header">
                <span className="health-label">Economie</span>
                <strong className="health-mood" id="goldMood">
                  {mood(vitals.goldScore, ["Troc local", "Bourses maigres", "Commerce actif", "Tresor florissant"])}
                </strong>
              </div>
              <div className="health-bar">
                <span id="goldBar" style={{ width: `${clamp01(vitals.goldScore) * 100}%` }}></span>
              </div>
              <small className="health-effect" id="goldEffect">
                Tresor {multLabel(vitals.goldMult)} Â· infrastructure {multLabel(vitals.infraMult)}
              </small>
            </div>
            
            <div className="health-card health-knowledge">
              <div className="health-header">
                <span className="health-label">Memoire</span>
                <strong className="health-mood" id="knowledgeMood">
                  {mood(vitals.knowledgeScore, ["Traditions orales", "Archives naissantes", "Savoirs partages", "Culture savante"])}
                </strong>
              </div>
              <div className="health-bar">
                <span id="knowledgeBar" style={{ width: `${clamp01(vitals.knowledgeScore) * 100}%` }}></span>
              </div>
              <small className="health-effect" id="knowledgeEffect">
                Savoir {multLabel(vitals.knowledgeMult)} Â· pression -{fmt(vitals.instabilityRelief * 100)} pts
              </small>
            </div>
          </div>
          
          {showExhume && (
            <button id="exhumeBtn" className="exhume-btn" onClick={exhumeVestige}>
              Exhumer un vestige
            </button>
          )}
        </div>
      </div>

      <div className="city-right-col">
        <BuildingShop />
      </div>
    </section>
  );
}
