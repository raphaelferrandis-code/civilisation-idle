import { useCityViewState } from '../../hooks/useCityViewState.js';
import { useGameState } from '../../hooks/useGameState.js';
import {
  cityVitals,
  pressureBreakdown,
  rates,
  has,
  nomadInfrastructureCap
} from '../../game/core/mechanics.js';
import { fmt, fmtShort, clamp01, multLabel, fmtHabitants } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import OdometerNumber from './OdometerNumber.jsx';
import PixelIcon from './PixelIcon.jsx';
import { crediblePopulation } from '../../game/core/demographics.js';

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

  // Crise terminale : le tick est GELÉ (rien ne produit) — afficher les débits
  // potentiels mentirait (« la ville n'est plus » mais les chiffres montent).
  const crisisFrozen = useGameState(s => Boolean(s.crisisLimitAnnounced));

  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);
  // Les taux de ressources sont des Decimal : signe via .gte, jamais via >=.
  const rateClass = (rate) => (rate.gte(0) ? 'positive' : 'negative');
  const rateArrow = (rate) => (rate.gte(0) ? '▲' : '▼');
  const rateSign = (rate) => (rate.gte(0) ? '+' : '');

  const showNomadCap = has("trait_nomadism");
  const nomadCap = nomadInfrastructureCap();

  // Habitants « crédibles » dérivés du Rayonnement (ex-Population). Purement
  // d'affichage : rien dans la simulation ne le relit. Recalculé à chaque
  // render (déclenché par le changement de population via le hook).
  const habitants = crediblePopulation(population);

  /* Humeurs (déplacées en tooltip) */
  const foodMood = mood(vitals.foodScore, [
    { fr: "Famine proche", en: "Famine looms" },
    { fr: "Entrepôts modestes", en: "Modest warehouses" },
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
      fr: `Essor global de votre civilisation : ce qui fait grandir la cité et franchir les âges.\nHabitants estimés : ${fmtHabitants(habitants)}`,
      en: `The overall rise of your civilization: what grows the city and crosses the ages.\nEstimated inhabitants: ${fmtHabitants(habitants)}`
    }),
    food: tr({
      fr: `Réserves : ${tr(foodMood)}\nCroissance du rayonnement ${multLabel(vitals.populationMult)} · rupture -${fmt(clamp01(vitals.foodScore - 0.92) * 1.8)} pts`,
      en: `Reserves: ${tr(foodMood)}\nRadiance growth ${multLabel(vitals.populationMult)} · rupture -${fmt(clamp01(vitals.foodScore - 0.92) * 1.8)} pts`
    }),
    gold: tr({
      fr: `Économie : ${tr(goldMood)}\nOr ${multLabel(vitals.goldMult)} · infrastructure ${multLabel(vitals.infraMult)}`,
      en: `Economy: ${tr(goldMood)}\nTreasury ${multLabel(vitals.goldMult)} · infrastructure ${multLabel(vitals.infraMult)}`
    }),
    knowledge: tr({
      fr: `Mémoire : ${tr(knowledgeMood)}\nSavoir ${multLabel(vitals.knowledgeMult)} · rupture -${fmt(vitals.instabilityRelief * 100)} pts`,
      en: `Memory: ${tr(knowledgeMood)}\nKnowledge ${multLabel(vitals.knowledgeMult)} · rupture -${fmt(vitals.instabilityRelief * 100)} pts`
    }),
    infrastructure: tr({
      fr: `Réseau routier et solidité technique.${showNomadCap ? `\nCap nomade : ${fmt(nomadCap)}` : ""}`,
      en: `Road network and technical resilience.${showNomadCap ? `\nNomad cap: ${fmt(nomadCap)}` : ""}`
    })
  };

  // Ancres visuelles : icônes pixel-art dédiées (public/pixelart/ui/res/),
  // une par ressource, teintées dans la couleur de la ressource. Les jauges de
  // réserve ont été retirées (bruit sans décision) : l'état des réserves reste
  // lisible dans le tooltip de chaque carte (humeurs).
  const cards = [
    {
      key: "population", cls: "card-pop", pixIcon: "res/population", name: { fr: "Rayonnement", en: "Radiance" },
      valueId: "population", value: population, rate: r.population, rateId: "popRate"
    },
    {
      key: "food", cls: "card-food", pixIcon: "res/food", name: { fr: "Nourriture", en: "Food" },
      valueId: "food", value: food, rate: r.food, rateId: "foodRate"
    },
    {
      key: "gold", cls: "card-gold", pixIcon: "res/gold", name: { fr: "Trésor", en: "Treasury" },
      valueId: "gold", value: gold, rate: r.gold, rateId: "goldRate"
    },
    {
      key: "knowledge", cls: "card-knowledge", pixIcon: "res/knowledge", name: { fr: "Savoir", en: "Knowledge" },
      valueId: "knowledge", value: knowledge, rate: r.knowledge, rateId: "knowledgeRate"
    },
    {
      key: "infrastructure", cls: "card-infra", pixIcon: "res/infra", name: { fr: "Infrastructure", en: "Infrastructure" },
      valueId: "infrastructure", value: infrastructure, rate: r.infrastructure, rateId: "infraRate"
    }
  ];

  return (
    <header className="topbar" aria-label={tr({ fr: "Ressources de la cité", en: "City resources" })}>
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
                <span className="resource-icon"><PixelIcon name={c.pixIcon} /></span>
                <span className="resource-name">{tr(c.name)}</span>
              </div>
              <span className="resource-value" id={c.valueId} title={`${tr(c.name)} : ${exactLabel(c.value)}`}>
                {/* Odomètre : chiffres qui roulent verticalement, pulse
                    uniquement aux jalons (changement de suffixe K→M→B).
                    `alive` = débit réel > 0 → jamais de cadran mort.
                    En crise terminale : cadran figé (le jeu est en pause). */}
                <OdometerNumber value={c.value} alive={!crisisFrozen && c.rate.gt(0)} />
              </span>
            </div>
            <div className="resource-rate-row">
              {crisisFrozen ? (
                <span className="rate-value rate-frozen" title={tr({ fr: "Cité figée par la crise terminale. La production est suspendue.", en: "City frozen by the terminal crisis. Production is suspended." })}>
                  {tr({ fr: "figé", en: "frozen" })}
                </span>
              ) : (
                <span className={`rate-value ${rateClass(c.rate)}`}>
                  <span className="rate-arrow" aria-hidden="true">{rateArrow(c.rate)}</span>
                  {/* Convention compacte « /s » (celle de la boutique) ; le cap nomade
                      passe en suffixe court — le détail vit dans le tooltip. */}
                  <strong id={c.rateId}>
                    {rateSign(c.rate)}{fmtShort(c.rate)}
                  </strong>/s
                  {c.key === "infrastructure" && showNomadCap ? ` · cap ${fmtShort(nomadCap)}` : ""}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </header>
  );
}
