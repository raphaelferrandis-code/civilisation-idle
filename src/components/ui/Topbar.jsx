import { useCityViewState } from '../../hooks/useCityViewState.js';
import {
  cityVitals,
  pressureBreakdown,
  rates,
  has,
  nomadInfrastructureCap
} from '../../game/core/mechanics.js';
import { fmt, fmtShort, clamp01, multLabel } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import RollingNumber from './RollingNumber.jsx';

/* Valeur exacte pour le tooltip (le bandeau affiche du compact via fmtShort). */
function exactLabel(value) {
  const n = typeof value?.toNumber === "function" ? value.toNumber() : value;
  if (!Number.isFinite(n)) {
    return typeof value?.toExponential === "function" ? value.toExponential(3) : String(value);
  }
  return Math.round(n).toLocaleString("fr-FR");
}

function mood(value, labels) {
  if (value >= 0.95) return labels[3];
  if (value >= 0.45) return labels[2];
  if (value >= 0.12) return labels[1];
  return labels[0];
}

/**
 * Topbar (Audit UI Phase 5) :
 * — 5 cartes de ressources sur 2 lignes (valeur dominante + flux signé ▲▼),
 *   humeurs et effets déplacés en tooltip, jauge de réserve en filet 3px.
 * L'état civilisationnel (Âge / Usure / Légitimité / bonus sédiment) vit
 * désormais dans l'encart latéral (CityStatusPanel).
 */
export default function Topbar() {
  const {
    population, food, gold, knowledge, infrastructure
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

  /* Humeurs (déplacées en tooltip) */
  const foodMood = mood(vitals.foodScore, [
    { fr: "Famine proche", en: "Famine looms" },
    { fr: "Greniers modestes", en: "Modest granaries" },
    { fr: "Surplus rassurant", en: "Reassuring surplus" },
    { fr: "Abondance", en: "Abundance" }
  ]);
  const goldMood = mood(vitals.goldScore, [
    { fr: "Troc local", en: "Local barter" },
    { fr: "Bourses maigres", en: "Lean purses" },
    { fr: "Commerce actif", en: "Lively trade" },
    { fr: "Trésor florissant", en: "Flourishing treasury" }
  ]);
  const knowledgeMood = mood(vitals.knowledgeScore, [
    { fr: "Traditions orales", en: "Oral traditions" },
    { fr: "Archives naissantes", en: "Nascent archives" },
    { fr: "Savoirs partagés", en: "Shared knowledge" },
    { fr: "Culture savante", en: "Learned culture" }
  ]);

  const tooltips = {
    population: tr({
      fr: "Fondation démographique de votre empire.",
      en: "Demographic foundation of your empire."
    }),
    food: tr({
      fr: `Réserves : ${tr(foodMood)}\nCroissance pop ${multLabel(vitals.populationMult)} — rupture -${fmt(clamp01(vitals.foodScore - 0.92) * 1.8)} pts`,
      en: `Reserves: ${tr(foodMood)}\nPop growth ${multLabel(vitals.populationMult)} — rupture -${fmt(clamp01(vitals.foodScore - 0.92) * 1.8)} pts`
    }),
    gold: tr({
      fr: `Économie : ${tr(goldMood)}\nOr ${multLabel(vitals.goldMult)} — infrastructure ${multLabel(vitals.infraMult)}`,
      en: `Economy: ${tr(goldMood)}\nTreasury ${multLabel(vitals.goldMult)} — infrastructure ${multLabel(vitals.infraMult)}`
    }),
    knowledge: tr({
      fr: `Mémoire : ${tr(knowledgeMood)}\nSavoir ${multLabel(vitals.knowledgeMult)} — rupture -${fmt(vitals.instabilityRelief * 100)} pts`,
      en: `Memory: ${tr(knowledgeMood)}\nKnowledge ${multLabel(vitals.knowledgeMult)} — rupture -${fmt(vitals.instabilityRelief * 100)} pts`
    }),
    infrastructure: tr({
      fr: `Réseau routier et solidité technique.${showNomadCap ? `\nCap nomade : ${fmt(nomadCap)}` : ""}`,
      en: `Road network and technical resilience.${showNomadCap ? `\nNomad cap: ${fmt(nomadCap)}` : ""}`
    })
  };

  const cards = [
    {
      key: "population", cls: "card-pop", icon: "fa-users", name: { fr: "Population", en: "Population" },
      valueId: "population", value: population, rate: r.population, rateId: "popRate",
      gauge: null
    },
    {
      key: "food", cls: "card-food", icon: "fa-wheat-awn", name: { fr: "Nourriture", en: "Food" },
      valueId: "food", value: food, rate: r.food, rateId: "foodRate",
      gauge: { id: "foodBar", score: vitals.foodScore }
    },
    {
      key: "gold", cls: "card-gold", icon: "fa-coins", name: { fr: "Trésor", en: "Treasury" },
      valueId: "gold", value: gold, rate: r.gold, rateId: "goldRate",
      gauge: { id: "goldBar", score: vitals.goldScore }
    },
    {
      key: "knowledge", cls: "card-knowledge", icon: "fa-book-open", name: { fr: "Savoir", en: "Knowledge" },
      valueId: "knowledge", value: knowledge, rate: r.knowledge, rateId: "knowledgeRate",
      gauge: { id: "knowledgeBar", score: vitals.knowledgeScore }
    },
    {
      key: "infrastructure", cls: "card-infra", icon: "fa-archway", name: { fr: "Infrastructure", en: "Infrastructure" },
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
                <span className="resource-name">{tr(c.name)}</span>
              </div>
              <span className="resource-value" id={c.valueId} title={`${tr(c.name)} : ${exactLabel(c.value)}`}>
                <RollingNumber value={c.value} format={fmtShort} />
              </span>
            </div>
            <div className="resource-rate-row">
              <span className={`rate-value ${rateClass(c.rate)}`}>
                <span className="rate-arrow" aria-hidden="true">{rateArrow(c.rate)}</span>
                <strong id={c.rateId}>
                  {rateSign(c.rate)}{fmtShort(c.rate)}
                  {c.key === "infrastructure" && showNomadCap ? ` (cap ${fmtShort(nomadCap)})` : ""}
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
    </header>
  );
}
