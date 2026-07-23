import { useCityViewState } from '../../hooks/useCityViewState.js';
import { useGameState } from '../../hooks/useGameState.js';
import {
  cityVitals,
  pressureBreakdown,
  rates,
  has,
  nomadInfrastructureCap
} from '../../game/core/mechanics.js';
import { fmt, fmtShort, clamp01, multLabel, fmtHabitants, rateScale } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { state } from '../../game/core/state.js';
import OdometerNumber from './OdometerNumber.jsx';
import PixelIcon from './PixelIcon.jsx';
import { tipProps } from './HelpBubble.jsx';
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
  const rateSign = (rate) => (rate.gte(0) ? '+' : '');

  const showNomadCap = has("trait_nomadism");
  const nomadCap = nomadInfrastructureCap();

  // Habitants « crédibles » dérivés du Rayonnement (ex-Population). Purement
  // d'affichage : rien dans la simulation ne le relit. Recalculé à chaque
  // render (déclenché par le changement de population via le hook).
  const habitants = crediblePopulation(population);

  /* Humeurs (déplacées en tooltip). Les TABLES restent ici, mais l'humeur est
     choisie DANS l'infobulle, sur des vitales relues à l'appel : le contenu de
     la bulle est vivant, et fermer sur les vitales du rendu le figerait. */
  const foodMoods = [
    { fr: "Famine proche", en: "Famine looms" },
    { fr: "Entrepôts modestes", en: "Modest warehouses" },
    { fr: "Surplus rassurant", en: "Reassuring surplus" },
    { fr: "Abondance", en: "Abundance" }
  ];
  const goldMoods = [
    { fr: "Troc local", en: "Local barter" },
    { fr: "Bourses maigres", en: "Lean purses" },
    { fr: "Commerce actif", en: "Lively trade" },
    { fr: "Trésor florissant", en: "Flourishing treasury" }
  ];
  const knowledgeMoods = [
    { fr: "Traditions orales", en: "Oral traditions" },
    { fr: "Archives naissantes", en: "Nascent archives" },
    { fr: "Savoirs partagés", en: "Shared knowledge" },
    { fr: "Culture savante", en: "Learned culture" }
  ];

  /* Infobulles des cartes (B1) : des FONCTIONS qui rendent un TABLEAU de lignes.
     Une fonction, parce que ces chiffres bougent à chaque tick et qu'une chaîne
     se figerait à l'ouverture de la bulle. Un tableau, parce que ces libellés
     étaient multi-lignes : les couples libellé / valeur s'alignent en colonnes
     au lieu d'être coupés au bon vouloir de l'OS. */
  const tooltips = {
    population: () => [
      { label: tr({
        fr: "Essor global de votre civilisation : ce qui fait grandir la cité et franchir les âges.",
        en: "The overall rise of your civilization: what grows the city and crosses the ages."
      }) },
      {
        label: tr({ fr: "Habitants estimés", en: "Estimated inhabitants" }),
        value: fmtHabitants(crediblePopulation(state.population))
      }
    ],
    food: () => {
      const v = cityVitals();
      return [
        { label: tr({ fr: "Réserves", en: "Reserves" }), value: tr(mood(v.foodScore, foodMoods)) },
        { label: tr({ fr: "Croissance du rayonnement", en: "Radiance growth" }), value: multLabel(v.populationMult) },
        { label: tr({ fr: "Rupture", en: "Rupture" }), value: `-${fmt(clamp01(v.foodScore - 0.92) * 1.8)} pts` }
      ];
    },
    gold: () => {
      const v = cityVitals();
      return [
        { label: tr({ fr: "Économie", en: "Economy" }), value: tr(mood(v.goldScore, goldMoods)) },
        { label: tr({ fr: "Or", en: "Treasury" }), value: multLabel(v.goldMult) },
        { label: tr({ fr: "Infrastructure", en: "Infrastructure" }), value: multLabel(v.infraMult) }
      ];
    },
    knowledge: () => {
      const v = cityVitals();
      return [
        { label: tr({ fr: "Mémoire", en: "Memory" }), value: tr(mood(v.knowledgeScore, knowledgeMoods)) },
        { label: tr({ fr: "Savoir", en: "Knowledge" }), value: multLabel(v.knowledgeMult) },
        { label: tr({ fr: "Rupture", en: "Rupture" }), value: `-${fmt(v.instabilityRelief * 100)} pts` }
      ];
    },
    infrastructure: () => [
      { label: tr({
        fr: "Réseau routier et solidité technique.",
        en: "Road network and technical resilience."
      }) },
      // Ligne conditionnelle : `false` est jeté par normalizeTipContent.
      showNomadCap && {
        label: tr({ fr: "Cap nomade", en: "Nomad cap" }),
        value: fmt(nomadInfrastructureCap())
      }
    ]
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
            {...tipProps(tr(c.name), tooltips[c.key])}
          >
            <div className="resource-title-wrapper">
              {/* size explicite : la taille vient de `.topbar .resource-icon .px-icon`,
                  un sélecteur d'ANCÊTRE que PixelIcon ne peut pas déduire de sa classe. */}
              <span className="resource-icon"><PixelIcon name={c.pixIcon} size={24} /></span>
              <span className="resource-name">{tr(c.name)}</span>
            </div>
            {/* Valeur et débit sur la MÊME ligne, mais aux deux BOUTS de la
                cellule (grille de la carte, cf. components.css) : la place
                perdue de la barre était horizontale, on l'occupe donc en
                largeur au lieu d'empiler une troisième ligne — nom en haut,
                valeur en bas à gauche, débit en bas à droite. */}
            {/* Valeur EXACTE en infobulle : relue dans l'état à chaque
                réévaluation (les clés de carte sont celles de l'état), sinon le
                nombre se figerait à l'ouverture de la bulle alors que le
                cadran, lui, continue de tourner juste à côté. */}
            <span className="resource-value" id={c.valueId} {...tipProps(tr(c.name), () => exactLabel(state[c.key]))}>
              {/* Odomètre : chiffres qui roulent verticalement, pulse
                  uniquement aux jalons (changement de suffixe K→M→B).
                  `rate` = le VRAI débit : il fixe la précision affichée pour
                  que le dernier chiffre tourne à une allure suivable.
                  En crise terminale : débit nul, cadran figé (jeu en pause). */}
              <OdometerNumber value={c.value} rate={crisisFrozen ? 0 : c.rate} />
            </span>
            <div className="resource-rate-row">
              {crisisFrozen ? (
                <span className="rate-value rate-frozen" {...tipProps(null, tr({ fr: "Cité figée par la crise terminale. La production est suspendue.", en: "City frozen by the terminal crisis. Production is suspended." }))}>
                  {tr({ fr: "figé", en: "frozen" })}
                </span>
              ) : (
                <span className={`rate-value ${rateClass(c.rate)}`}>
                  {/* Flèche RÉSERVÉE aux débits négatifs. Quand tout monte,
                      un triangle vert sur chaque cellule ne dit rien que le
                      « + » ne dise déjà (retour Raph 2026-07-22) — alors
                      qu'une flèche qui n'apparaît que dans le mauvais sens
                      se remarque tout de suite. Le rouge du texte reste le
                      signal principal (views-city.css). */}
                  {c.rate.gte(0) ? null : <span className="rate-arrow" aria-hidden="true">▼</span>}
                  {/* UNITÉ ADAPTATIVE (B4) : sous 1/s le débit bascule en /min
                      puis en /h, pour cesser d'afficher « 0.0/s » là où la
                      valeur vaut 1,4 par heure. rateScale rend la valeur mise à
                      l'échelle, pas une chaîne signée : le signe reste composé
                      ici, sinon il doublerait. */}
                  {(() => {
                    const r = rateScale(c.rate);
                    return (<><strong id={c.rateId}>
                      {rateSign(r.value)}{fmtShort(r.value)}
                    </strong>{r.unit}</>);
                  })()}
                  {c.key === "infrastructure" && showNomadCap ? ` · cap ${fmtShort(nomadCap)}` : ""}
                </span>
              )}
            </div>
          </div>
        ))}
        {/* Sixième cellule : les Habitants. Compteur DÉRIVÉ du Rayonnement
            (rien dans la simulation ne le relit) qui vivait jusqu'ici caché
            dans une infobulle — il occupe l'espace récupéré avec la seule
            information à échelle humaine de la barre. */}
        <div className="resource-card-unified topbar-people" {...tipProps(tr({ fr: "Habitants", en: "Inhabitants" }), [
          { label: tr({
            fr: "Habitants estimés de la cité, dérivés du Rayonnement.",
            en: "Estimated inhabitants, derived from Radiance."
          }) },
          { label: tr({
            fr: "Aucun effet de jeu : c'est la taille que la cité aurait à ce stade.",
            en: "No gameplay effect: the size the city would have at this stage."
          }) }
        ])}>
          <div className="resource-title-wrapper">
            <span className="resource-icon"><PixelIcon name="ruins/population" size={24} /></span>
            <span className="resource-name">{tr({ fr: "Habitants", en: "Inhabitants" })}</span>
          </div>
          <span className="resource-value" id="habitants">{fmtHabitants(habitants)}</span>
        </div>
      </div>
    </header>
  );
}
