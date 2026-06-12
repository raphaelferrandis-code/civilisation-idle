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
import { getEraTheme } from '../../game/data/eraThemes.js';
import { isMythEffectActive } from '../../game/data/myths.js';
import { fmt, pct, clamp01, multLabel } from '../../game/core/utils.js';

function mood(value, labels) {
  if (value >= 0.95) return labels[3];
  if (value >= 0.45) return labels[2];
  if (value >= 0.12) return labels[1];
  return labels[0];
}

/**
 * Topbar (Audit UI Phase 5) :
 * — 5 cartes de ressources sur 2 lignes (valeur dominante + flux signé ▲▼),
 *   humeurs et effets déplacés en tooltip, jauge de réserve en filet 3px ;
 * — bandeau d'état distinct (Âge / Usure / Légitimité / bonus sédiment).
 */
export default function Topbar() {
  const {
    population, food, gold, knowledge, infrastructure, timeWear, atlasLegitimite, atlasHeritage,
    cycleStartedAt, tickNow
  } = useCityViewState();

  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);
  // Les taux de ressources sont des Decimal : signe via .gte, jamais via >=.
  const rateClass = (rate) => (rate.gte(0) ? 'positive' : 'negative');
  const rateArrow = (rate) => (rate.gte(0) ? '▲' : '▼');
  const rateSign = (rate) => (rate.gte(0) ? '+' : '');

  const showNomadCap = has("trait_nomadism");
  const nomadCap = nomadInfrastructureCap();

  const eraIdx = currentEraIndex();
  const currentEra = eras[eraIdx];
  const eraProgress = nextEraProgress(eraIdx);
  const eraTheme = getEraTheme(eraIdx);

  const SEDIMENT_PALIERS = [
    { secs: 3600,   bonus: 2   },
    { secs: 28800,  bonus: 15  },
    { secs: 86400,  bonus: 45  },
    { secs: 259200, bonus: 135 },
    { secs: 604800, bonus: 400 },
  ];
  const cycleElapsed = (tickNow - cycleStartedAt) / 1000;
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

  /* Humeurs (déplacées en tooltip) */
  const foodMood = mood(vitals.foodScore, ["Famine proche", "Greniers modestes", "Surplus rassurant", "Abondance"]);
  const goldMood = mood(vitals.goldScore, ["Troc local", "Bourses maigres", "Commerce actif", "Trésor florissant"]);
  const knowledgeMood = mood(vitals.knowledgeScore, ["Traditions orales", "Archives naissantes", "Savoirs partagés", "Culture savante"]);

  const tooltips = {
    population: "Fondation démographique de votre empire.",
    food: `Réserves : ${foodMood}\nCroissance pop ${multLabel(vitals.populationMult)} — rupture -${fmt(clamp01(vitals.foodScore - 0.92) * 1.8)} pts`,
    gold: `Économie : ${goldMood}\nOr ${multLabel(vitals.goldMult)} — infrastructure ${multLabel(vitals.infraMult)}`,
    knowledge: `Mémoire : ${knowledgeMood}\nSavoir ${multLabel(vitals.knowledgeMult)} — rupture -${fmt(vitals.instabilityRelief * 100)} pts`,
    infrastructure: `Réseau routier et solidité technique.${showNomadCap ? `\nCap nomade : ${fmt(nomadCap)}` : ""}`
  };

  const cards = [
    {
      key: "population", cls: "card-pop", icon: "fa-users", name: "Population",
      valueId: "population", value: population, rate: r.population, rateId: "popRate",
      gauge: null
    },
    {
      key: "food", cls: "card-food", icon: "fa-wheat-awn", name: "Nourriture",
      valueId: "food", value: food, rate: r.food, rateId: "foodRate",
      gauge: { id: "foodBar", score: vitals.foodScore }
    },
    {
      key: "gold", cls: "card-gold", icon: "fa-coins", name: "Trésor",
      valueId: "gold", value: gold, rate: r.gold, rateId: "goldRate",
      gauge: { id: "goldBar", score: vitals.goldScore }
    },
    {
      key: "knowledge", cls: "card-knowledge", icon: "fa-book-open", name: "Savoir",
      valueId: "knowledge", value: knowledge, rate: r.knowledge, rateId: "knowledgeRate",
      gauge: { id: "knowledgeBar", score: vitals.knowledgeScore }
    },
    {
      key: "infrastructure", cls: "card-infra", icon: "fa-archway", name: "Infrastructure",
      valueId: "infrastructure", value: infrastructure, rate: r.infrastructure, rateId: "infraRate",
      gauge: null
    }
  ];

  return (
    <header className="topbar" aria-label="Ressources de la cité">
      <div className="topbar-resources">
        {cards.map((c) => (
          <div
            key={c.key}
            className={`resource-card-unified ${c.cls}`}
            id={`${c.key}Resource`}
            title={tooltips[c.key]}
          >
            <div className="card-header">
              <div className="resource-title-wrapper">
                <span className="resource-icon"><i className={`fa-solid ${c.icon}`}></i></span>
                <span className="resource-name">{c.name}</span>
              </div>
              <span className="resource-value" id={c.valueId}>{fmt(c.value)}</span>
            </div>
            <div className="resource-rate-row">
              <span className={`rate-value ${rateClass(c.rate)}`}>
                <span className="rate-arrow" aria-hidden="true">{rateArrow(c.rate)}</span>
                <strong id={c.rateId}>
                  {rateSign(c.rate)}{fmt(c.rate)}
                  {c.key === "infrastructure" && showNomadCap ? ` (cap ${fmt(nomadCap)})` : ""}
                </strong> / sec
              </span>
            </div>
            {c.gauge && (
              <span className="reserve-filet" aria-hidden="true">
                <span id={c.gauge.id} style={{ width: `${clamp01(c.gauge.score) * 100}%` }}></span>
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Bandeau d'état : nature différente des ressources, traitement distinct */}
      <div className="vitals-band" id="vitalsResource" aria-label="Vitalité et pressions">
        <div className="vitals-seg" title={`Progression vers l'âge suivant — ${eraTheme.epochLabel}, ère ${eraTheme.epochNumeral}/V`}>
          <span className="vitals-label">Âge</span>
          <strong className="vitals-value" id="currentEraTopbar">
            {currentEra.name}
            <span className="era-epoch-chip" aria-label={`Époque : ${eraTheme.epochLabel}`}>
              {eraTheme.epochLabel} · {eraTheme.epochNumeral}
            </span>
          </strong>
          <div className="gauge-container stability-age">
            <span className="gauge-bar-fill age-progress-fill" style={{ width: `${eraProgress * 100}%` }}></span>
          </div>
        </div>

        <div
          className="vitals-seg"
          title={nextPalier ? `Prochain palier sédiment : +${nextPalier.bonus}% dans ${fmtSecs(nextPalierInSecs)}` : "Bonus sédiment maximum atteint"}
        >
          <span className="vitals-label">Usure</span>
          <strong className={`vitals-value ${timeWear >= 0.8 ? 'danger-pulse' : ''}`} id="timeWear">{pct(timeWear)}</strong>
          {sedimentIdx >= 0 && (
            <span className="sediment-laps" aria-hidden="true">
              {SEDIMENT_PALIERS.map((_, i) => (
                <span key={i} className={i <= sedimentIdx ? 'sediment-lap-done' : 'sediment-lap-empty'}>■</span>
              ))}
            </span>
          )}
          <div className="gauge-container stability-wear">
            <span id="timeWearMeter" className={`gauge-bar-fill sediment-palier-${Math.max(0, sedimentIdx + 1)}`} style={{ width: `${sedimentBarFill}%` }}></span>
          </div>
        </div>

        {(atlasHeritage || isMythEffectActive("mythe_d_atlas")) && (
          <div className="vitals-seg" title="Légitimité d'Atlas">
            <span className="vitals-label">Légitimité</span>
            <strong className="vitals-value" id="atlasLegitimiteValue">{fmt(atlasLegitimite)}</strong>
            <div className="gauge-container stability-legitimite">
              <span id="atlasLegitimiteBar" className="gauge-bar-fill" style={{ width: `${clamp01((atlasLegitimite || 0) / 100) * 100}%` }}></span>
            </div>
          </div>
        )}

        <small
          className={sedimentBonus > 0 ? 'sediment-bonus-value' : 'sediment-help'}
          title={nextPalier ? `Prochain palier : +${nextPalier.bonus}% dans ${fmtSecs(nextPalierInSecs)}` : 'Bonus maximum atteint'}
        >
          +{sedimentBonus}% ruines au prochain effondrement
        </small>
      </div>
    </header>
  );
}
