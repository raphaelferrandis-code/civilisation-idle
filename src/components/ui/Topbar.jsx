import { useCityViewState } from '../../hooks/useCityViewState.js';
import {
  cityVitals,
  pressureBreakdown,
  rates,
  has,
  nomadInfrastructureCap
} from '../../game/core/mechanics.js';
import { fmt, clamp01, multLabel } from '../../game/core/utils.js';

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
    </header>
  );
}
