import { useCityViewState } from '../../hooks/useCityViewState.js';
import {
  cityVitals,
  pressureBreakdown,
  rates,
  has,
  nomadInfrastructureCap,
  currentEraIndex,
  nextEraProgress
} from '../../game/core/mechanics.js';
import { eras } from '../../game/data/world.js';
import { isMythEffectActive } from '../../game/data/myths.js';
import { fmt, pct, clamp01, multLabel } from '../../game/core/utils.js';

function mood(value, labels) {
  if (value >= 0.95) return labels[3];
  if (value >= 0.45) return labels[2];
  if (value >= 0.12) return labels[1];
  return labels[0];
}

export default function Topbar() {
  const {
    population, food, gold, knowledge, infrastructure, instability, timeWear, atlasLegitimite, atlasHeritage, legitimacy,
    activeMythId, cycles, ruins, rationing, prometheeBraisiers,
    atridesPactActive, atridesNextRunPenaltyActive, eneeHeritage, eneeDegraded,
    buildingsSig, upgradesSig, cycleStartedAt
  } = useCityViewState();

  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);
  // Les taux de ressources sont des Decimal : signe via .gte, jamais via >=.
  const rateClass = (rate) => (rate.gte(0) ? 'positive' : 'negative');
  const rateSign = (rate) => (rate.gte(0) ? '+' : '');

  const showNomadCap = has("trait_nomadism");
  const nomadCap = nomadInfrastructureCap();

  const eraIdx = currentEraIndex();
  const currentEra = eras[eraIdx];
  const eraProgress = nextEraProgress(eraIdx);

  const SEDIMENT_PALIERS = [
    { secs: 3600,   bonus: 2   },
    { secs: 28800,  bonus: 15  },
    { secs: 86400,  bonus: 45  },
    { secs: 259200, bonus: 135 },
    { secs: 604800, bonus: 400 },
  ];
  const cycleElapsed = (Date.now() - cycleStartedAt) / 1000;
  let sedimentIdx = -1;
  for (let i = SEDIMENT_PALIERS.length - 1; i >= 0; i--) {
    if (cycleElapsed >= SEDIMENT_PALIERS[i].secs) { sedimentIdx = i; break; }
  }
  const sedimentBonus = sedimentIdx >= 0 ? SEDIMENT_PALIERS[sedimentIdx].bonus : 0;
  const nextPalier = sedimentIdx < SEDIMENT_PALIERS.length - 1 ? SEDIMENT_PALIERS[sedimentIdx + 1] : null;
  const segStart = sedimentIdx >= 0 ? SEDIMENT_PALIERS[sedimentIdx].secs : 0;
  const segEnd   = nextPalier ? nextPalier.secs : SEDIMENT_PALIERS[SEDIMENT_PALIERS.length - 1].secs;
  const sedimentBarFill = !nextPalier ? 100 : Math.min(100, ((cycleElapsed - segStart) / (segEnd - segStart)) * 100);
  const nextPalierInSecs = nextPalier ? Math.ceil(nextPalier.secs - cycleElapsed) : 0;
  const fmtSecs = (s) => {
    if (s >= 86400) return `${Math.floor(s / 86400)}j ${Math.floor((s % 86400) / 3600)}h`;
    if (s >= 3600)  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min`;
    return `${Math.floor(s / 60)}min`;
  };

  return (
    <header className="topbar unified-resource-grid" aria-label="Ressources de la cite">
      <div className="resource-card-unified card-pop" id="populationResource">
        <div className="card-header">
          <div className="resource-title-wrapper">
            <span className="resource-icon"><i className="fa-solid fa-users"></i></span>
            <span className="resource-name">Population</span>
          </div>
          <span className="resource-value" id="population">{fmt(population)}</span>
        </div>
        <div className="card-body">
          <div className="resource-rate-wrapper">
            <span className="rate-label">Croissance</span>
            <span className={`rate-value ${rateClass(r.population)}`}>
              <strong id="popRate">{rateSign(r.population)}{fmt(r.population)}</strong> / sec
            </span>
          </div>
        </div>
        <div className="card-footer">
          <small className="resource-desc">Fondation demographique de votre empire.</small>
        </div>
      </div>

      <div className="resource-card-unified card-food" id="foodResource">
        <div className="card-header">
          <div className="resource-title-wrapper">
            <span className="resource-icon"><i className="fa-solid fa-wheat-awn"></i></span>
            <span className="resource-name">Nourriture</span>
          </div>
          <span className="resource-value" id="food">{fmt(food)}</span>
        </div>
        <div className="card-body">
          <div className="resource-rate-wrapper">
            <span className="rate-label">Flux net</span>
            <span className={`rate-value ${rateClass(r.food)}`}>
              <strong id="foodRate">{rateSign(r.food)}{fmt(r.food)}</strong> / sec
            </span>
          </div>
          <div className="resource-gauge-section">
            <div className="gauge-header">
              <span className="gauge-label">Reserves</span>
              <strong className="gauge-mood-text" id="foodMood">
                {mood(vitals.foodScore, ["Famine proche", "Greniers modestes", "Surplus rassurant", "Abondance"])}
              </strong>
            </div>
            <div className="mini-gauge-bar food-bar">
              <span id="foodBar" className="gauge-fill" style={{ width: `${clamp01(vitals.foodScore) * 100}%` }}></span>
            </div>
          </div>
        </div>
        <div className="card-footer">
          <small className="resource-desc" id="foodEffect">
            Croissance pop {multLabel(vitals.populationMult)} - rupture -{fmt(clamp01(vitals.foodScore - 0.92) * 1.8)} pts
          </small>
        </div>
      </div>

      <div className="resource-card-unified card-gold" id="goldResource">
        <div className="card-header">
          <div className="resource-title-wrapper">
            <span className="resource-icon"><i className="fa-solid fa-coins"></i></span>
            <span className="resource-name">Tresor</span>
          </div>
          <span className="resource-value" id="gold">{fmt(gold)}</span>
        </div>
        <div className="card-body">
          <div className="resource-rate-wrapper">
            <span className="rate-label">Flux net</span>
            <span className={`rate-value ${rateClass(r.gold)}`}>
              <strong id="goldRate">{rateSign(r.gold)}{fmt(r.gold)}</strong> / sec
            </span>
          </div>
          <div className="resource-gauge-section">
            <div className="gauge-header">
              <span className="gauge-label">Economie</span>
              <strong className="gauge-mood-text" id="goldMood">
                {mood(vitals.goldScore, ["Troc local", "Bourses maigres", "Commerce actif", "Tresor florissant"])}
              </strong>
            </div>
            <div className="mini-gauge-bar gold-bar">
              <span id="goldBar" className="gauge-fill" style={{ width: `${clamp01(vitals.goldScore) * 100}%` }}></span>
            </div>
          </div>
        </div>
        <div className="card-footer">
          <small className="resource-desc" id="goldEffect">
            Or {multLabel(vitals.goldMult)} - infrastructure {multLabel(vitals.infraMult)}
          </small>
        </div>
      </div>

      <div className="resource-card-unified card-knowledge" id="knowledgeResource">
        <div className="card-header">
          <div className="resource-title-wrapper">
            <span className="resource-icon"><i className="fa-solid fa-book-open"></i></span>
            <span className="resource-name">Savoir</span>
          </div>
          <span className="resource-value" id="knowledge">{fmt(knowledge)}</span>
        </div>
        <div className="card-body">
          <div className="resource-rate-wrapper">
            <span className="rate-label">Flux net</span>
            <span className={`rate-value ${rateClass(r.knowledge)}`}>
              <strong id="knowledgeRate">{rateSign(r.knowledge)}{fmt(r.knowledge)}</strong> / sec
            </span>
          </div>
          <div className="resource-gauge-section">
            <div className="gauge-header">
              <span className="gauge-label">Memoire</span>
              <strong className="gauge-mood-text" id="knowledgeMood">
                {mood(vitals.knowledgeScore, ["Traditions orales", "Archives naissantes", "Savoirs partages", "Culture savante"])}
              </strong>
            </div>
            <div className="mini-gauge-bar knowledge-bar">
              <span id="knowledgeBar" className="gauge-fill" style={{ width: `${clamp01(vitals.knowledgeScore) * 100}%` }}></span>
            </div>
          </div>
        </div>
        <div className="card-footer">
          <small className="resource-desc" id="knowledgeEffect">
            Savoir {multLabel(vitals.knowledgeMult)} - rupture -{fmt(vitals.instabilityRelief * 100)} pts
          </small>
        </div>
      </div>

      <div className="resource-card-unified card-infra" id="infrastructureResource">
        <div className="card-header">
          <div className="resource-title-wrapper">
            <span className="resource-icon"><i className="fa-solid fa-archway"></i></span>
            <span className="resource-name">Infrastructure</span>
          </div>
          <span className="resource-value" id="infrastructure">{fmt(infrastructure)}</span>
        </div>
        <div className="card-body">
          <div className="resource-rate-wrapper">
            <span className="rate-label">Flux net</span>
            <span className={`rate-value ${rateClass(r.infrastructure)}`}>
              <strong id="infraRate">
                {rateSign(r.infrastructure)}{showNomadCap ? `${fmt(r.infrastructure)} (cap ${fmt(nomadCap)})` : fmt(r.infrastructure)}
              </strong> / sec
            </span>
          </div>
        </div>
        <div className="card-footer">
          <small className="resource-desc">Reseau routier et solidite technique.</small>
        </div>
      </div>

      <div className="resource-card-unified stability-vitals-card" id="vitalsResource">
        <div className="card-header">
          <div className="resource-title-wrapper">
            <span className="resource-icon"><i className="fa-solid fa-scale-balanced"></i></span>
            <span className="resource-name">Vitalite & Pressions</span>
          </div>
        </div>
        <div className="card-body stability-vitals-body">
          <div className="stability-gauge-row">
            <div className="gauge-meta">
              <span className="gauge-title">Âge</span>
              <strong id="currentEraTopbar">{currentEra.name}</strong>
            </div>
            <div className="gauge-container stability-age">
              <span className="gauge-bar-fill age-progress-fill" style={{ width: `${eraProgress * 100}%` }}></span>
            </div>
          </div>

          <div className="stability-gauge-row">
            <div className="gauge-meta">
              <span className="gauge-title">Usure</span>
              <span className="gauge-meta-right">
                <strong id="timeWear" className={timeWear >= 0.8 ? 'danger-pulse' : ''}>{pct(timeWear)}</strong>
                {sedimentIdx >= 0 && (
                  <span className="sediment-laps">
                    {SEDIMENT_PALIERS.map((_, i) => (
                      <span key={i} className={i <= sedimentIdx ? 'sediment-lap-done' : 'sediment-lap-empty'}>■</span>
                    ))}
                  </span>
                )}
              </span>
            </div>
            <div className="gauge-container stability-wear">
              <span id="timeWearMeter" className={`gauge-bar-fill sediment-palier-${Math.max(0, sedimentIdx + 1)}`} style={{ width: `${sedimentBarFill}%` }}></span>
            </div>
          </div>

          {(atlasHeritage || isMythEffectActive("mythe_d_atlas")) && (
            <div className="stability-gauge-row">
              <div className="gauge-meta">
                <span className="gauge-title">Legitimite</span>
                <strong id="atlasLegitimiteValue">{fmt(atlasLegitimite)}</strong>
              </div>
              <div className="gauge-container stability-legitimite">
                <span id="atlasLegitimiteBar" className="gauge-bar-fill" style={{ width: `${clamp01((atlasLegitimite || 0) / 100) * 100}%` }}></span>
              </div>
            </div>
          )}
        </div>
        <div className="card-footer">
          <small
            className={sedimentBonus > 0 ? 'sediment-bonus-value' : 'sediment-help'}
            title={nextPalier ? `Prochain palier : +${nextPalier.bonus}% dans ${fmtSecs(nextPalierInSecs)}` : 'Bonus maximum atteint'}
          >
            +{sedimentBonus}% ruines au prochain effondrement
          </small>
        </div>
      </div>
    </header>
  );
}
