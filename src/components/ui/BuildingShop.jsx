import { memo, useMemo, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { useCollapsiblePanel } from '../../hooks/useCollapsiblePanel.js';
import {
  globalMultiplier,
  globalMultiplierDec,
  isUnlocked,
  buildingBatchCost,
  buildingUnitFactor,
  buildingMilestoneInfo,
  babelExponentialMult,
  milestoneStepSize,
  currentEraIndex
} from '../../game/core/mechanics.js';
import { buildings, buildingDisplayOrder } from '../../game/data/buildings.js';
import { isMythEffectActive } from '../../game/data/myths.js';
import { splashSrcFor } from '../../game/data/pixelSplash.js';
import { renderCache } from '../../game/core/state.js';
import { buyableInMass } from '../../game/core/actions/building.js';
import { purchaseEta, ETA_SECONDS, ETA_NO_INCOME, ETA_UNREACHABLE } from '../../game/core/mechanics/purchaseEta.js';
import { fmtEta, quantizeEta, labelFor } from '../../game/core/utils.js';
import { productionScales, buildingRelativeGain } from '../../game/core/mechanics/production/productionBreakdown.js';

// Seuil de l'état « bientôt » (E5) : payable en moins d'une minute au rythme
// actuel. Une minute est le palier de quantizeEta juste au-dessus des pas de
// 5 s, donc le seuil tombe pile sur une frontière de quantification et ne peut
// pas osciller.
const SOON_ETA_SECONDS = 60;

// Noms de ressource pour l'infobulle de gain (B6). labelFor rend des formes
// abrégées et minuscules (« Ray. », « tresor ») taillées pour les coûts serrés
// d'une rangée ; ici la bulle a la place d'écrire le mot en entier.
const RES_NAMES = {
  population: { fr: "Rayonnement", en: "Radiance" },
  food: { fr: "Nourriture", en: "Food" },
  gold: { fr: "Trésor", en: "Treasury" },
  knowledge: { fr: "Savoir", en: "Knowledge" },
  infrastructure: { fr: "Infrastructure", en: "Infrastructure" }
};

// Gain en part du débit courant. `null` quand la ressource ne coule pas encore :
// diviser par zéro donnerait « +Infini % » sur le premier grenier d'une partie,
// et « +0 % » serait tout aussi faux. On rend une chaîne vide, l'appelant dit
// alors « premier apport ».
function fmtGainPct(pct) {
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return "";
  const p = pct * 100;
  if (p < 0.1) return "<0.1 %";
  if (p >= 100) return `+${Math.round(p)} %`;
  return `+${p.toFixed(p < 10 ? 1 : 0)} %`;
}
import { tr } from '../../game/core/i18n.js';
import { D, Decimal } from '../../game/core/num.js';
import BuyToolbar from './BuyToolbar.jsx';
import PurchaseRow from './PurchaseRow.jsx';
import RoadworksPanel from './RoadworksPanel.jsx';
import { tipProps } from './HelpBubble.jsx';

/* Segments de production [[ressource, valeur/s], …] — mêmes formules que
   l'ancien texte "Produit/Ajoute", rendu en icônes par PurchaseRow.
   `outputMult` est le facteur unitaire COMPLET (jalons × Rives fécondes ×
   Babel), composé dans la rangée depuis les mêmes helpers que le moteur.
   `globalMult`/`sqrtGlobalMult` peuvent être des Decimal (au-delà du float,
   cf. l'abonnement plus bas) : le produit reste alors en Decimal —
   rateScale/signedShort savent déjà l'afficher, « inf » n'apprend rien. */
function buildingProductionSegments(building, outputCount, globalMult, sqrtGlobalMult, outputMult) {
  const estDec = globalMult instanceof Decimal;
  const seg = (base, mult) => estDec
    ? mult.mul(base * outputCount).mul(outputMult)
    : base * outputCount * mult * outputMult;
  return [
    ["population", seg(building.pop, globalMult)],
    ["food", seg(building.food, sqrtGlobalMult)],
    ["gold", seg(building.gold, sqrtGlobalMult)],
    ["knowledge", seg(building.knowledge, globalMult)],
    ["infrastructure", seg(building.infra, globalMult)]
  ].filter(([, value]) => (estDec ? value.abs().toNumber() : Math.abs(value)) > 0.0001);
}

const TABS = [
  { id: "city", label: { fr: "Moteurs", en: "Engines" } },
  { id: "knowledge", label: { fr: "Savoir", en: "Knowledge" } },
  { id: "infra", label: { fr: "Infrastructure", en: "Infrastructure" } }
];

function BuildingShop() {
  const [activeTab, setActiveTab] = useState("city"); // "city", "knowledge", "infra"
  // Encart pliable (même mécanique que la Régulation des tensions) : on peut
  // réduire la boutique à son seul bandeau-titre pour rendre la carte au regard.
  const [open, toggleOpen] = useCollapsiblePanel("shop", true);

  // Subscriptions to trigger component update on state mutations
  const stateBuildings = useGameState(s => ({ ...s.buildings }));
  const buyAmount = useGameState(s => s.buyAmount);
  const stateCycles = useGameState(s => s.cycles);
  useGameState(s => s.activeMythId);
  const babelCategory = useGameState(s => s.babelCategory);

  // Coûts de lot mémoïsés. buildingBatchCost fait des sommes géométriques en
  // Decimal et NE dépend PAS des ressources (qui changent chaque tick) : ses
  // seules entrées — compteurs, buyAmount, discount/upgrades/mythes — ne bougent
  // qu'aux achats, qui bumpent _buildingsVersion/_upgradesVersion (le tick, lui,
  // ne touche que les caches _frameX). On recalcule donc tous les coûts UNE fois
  // par achat, plus à chaque tick ; l'« achetable » reste, lui, réévalué chaque
  // tick par un simple canPayCost contre les coûts déjà calculés.
  const buildingsVersion = useGameState(() => renderCache._buildingsVersion);
  const upgradesVersion = useGameState(() => renderCache._upgradesVersion);
  // Pas des jalons : 25 par défaut, 20 avec le capstone Ville-Monde. Résolu ICI
  // et passé en prop plutôt que lu dans chaque rangée — sinon les rangées, qui
  // sont mémoïsées, resteraient sur l'ancien pas jusqu'au prochain achat.
  // Même clé d'invalidation que les coûts : le capstone est une amélioration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const milestoneStep = useMemo(() => milestoneStepSize(), [upgradesVersion]);
  const costById = useMemo(() => {
    const costs = {};
    for (const b of buildings) costs[b.id] = buildingBatchCost(b);
    return costs;
    // Deps = clés d'invalidation, pas des valeurs capturées : buildingBatchCost
    // lit l'état (compteurs, buyAmount, discount) en interne, invisible pour la
    // règle exhaustive-deps. Ces versions/buyAmount sont précisément ce qui doit
    // déclencher le recalcul, d'où la désactivation ciblée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingsVersion, upgradesVersion, buyAmount]);

  // Signature d'abordabilité par bâtiment : pour chaque coût, la liste (jointe)
  // des devises manquantes. Remplace l'abonnement aux Decimal bruts (nouvelle
  // instance/tick → re-render systématique) : ne déclenche un rendu QUE quand une
  // abordabilité bascule. Le sélecteur capture costById (coûts figés entre achats) ;
  // shallowEqual court-circuite tant que toutes les signatures restent stables.
  const affordability = useGameState((s) => {
    const sig = {};
    for (const b of buildings) {
      const cost = costById[b.id];
      sig[b.id] = Object.keys(cost).filter((cur) => !D(s[cur]).gte(cost[cur])).join(",");
    }
    return sig;
  });

  // globalMultiplier() DÉRIVE en continu (infraMultiplier = 1 + log10(infra)·0.018,
  // sans palier) → comparé brut dans PurchaseRow.arePropsEqual, il cassait la
  // mémoïsation de TOUTES les rangées (re-render 1×/s en mid/late). On l'arrondit
  // à 4 chiffres SIGNIFICATIFS (précision d'affichage des /s, indépendante de la
  // magnitude — contrairement à un arrondi décimal qui redevient trop fin quand le
  // multiplicateur est grand) → piecewise-constant pour l'AFFICHAGE : la rangée
  // (et ce composant) ne re-render que quand le /s changerait vraiment. Usage
  // strictement cosmétique ici (production affichée + sqrt), jamais réinjecté
  // dans les coûts/l'état.
  // Au-delà du float, globalMultiplier() déborde à Infinity PAR DESIGN (le
  // moteur bascule sur globalMultiplierDec, cf. rates.js) : l'affichage suit la
  // même bascule — un Decimal quantifié à 4 chiffres significatifs lui aussi
  // (shallowEqual compare mantisse/exposant, la mémoïsation des rangées tient).
  const globalMult = useGameState(() => {
    const m = globalMultiplier();
    return Number.isFinite(m) ? Number(m.toPrecision(4)) : D(globalMultiplierDec().toExponential(3));
  });
  const sqrtGlobalMult = globalMult instanceof Decimal ? globalMult.sqrt() : Math.sqrt(globalMult);

  // GAIN RELATIF (B6). Les échelles base → débit sont calculées UNE fois par
  // rendu, pas une fois par rangée : sinon chaque rangée relancerait une passe
  // sur les trente bâtiments. Recalculées quand le multiplicateur arrondi ou un
  // achat bougent, ce qui suffit à une aide à la décision — c'est un conseil
  // d'achat, pas un compteur à la seconde.
  //
  // ⚠ ON NE PART PAS DE buildingProductionSegments. Ces segments servent
  // l'AFFICHAGE et sont pondérés par un globalMult arrondi à 4 chiffres
  // significatifs (choix de mémoïsation, juste au-dessus) ; les diviser par
  // rates() mélangerait deux arrondis et donnerait un pourcentage faux de
  // quelques points. Le gain part des bases, comme les Comptes de la cité.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gainScales = useMemo(() => productionScales(), [globalMult, buildingsVersion, buyAmount]);

  const babelActive = isMythEffectActive("mythe_de_babel");
  const babelCat = babelActive ? (babelCategory || "") : "";
  // Babel : le moteur multiplie la catégorie élue par le mult exponentiel
  // (rates.js). Même source (babelExponentialMult), calculée UNE fois par rendu
  // — sans elle, les rangées de la catégorie élue mentaient d'un facteur
  // potentiellement énorme.
  const babelExpMult = babelActive && babelCat ? babelExponentialMult() : 1;

  // RÉVÉLATION (D6). Ce composant est memo() SANS props et n'avait AUCUN
  // abonnement lisant state.cyclePeaks : un bâtiment qui franchissait son seuil
  // n'apparaissait donc pas de lui-même, il attendait qu'une autre signature
  // bouge (une abordabilité qui bascule, le multiplicateur qui change de cran).
  // Le latch du tick donne enfin une clé d'invalidation honnête, et le compte
  // suffit puisque la map ne fait que grandir.
  const revealVersion = useGameState((s) => Object.keys(s.revealedBuildings || {}).length);

  // ATTENTION à la forme : ce useMemo mémoïse une FONCTION, pas ses résultats —
  // chaque appel de categoryData(catId) ré-exécute filter+sort. Pas un cache,
  // donc : juste une identité stable entre deux re-renders. Le vrai déclencheur
  // d'apparition, c'est l'abonnement revealVersion ci-dessus, qui force le
  // re-render (et donc le recalcul) quand un bâtiment se révèle.
  const categoryData = useMemo(() => (catId) => {
    const order = buildingDisplayOrder[catId] || [];
    const all = buildings
      .filter((b) => b.category === catId)
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return {
      visible: all.filter((b) => isUnlocked(b)),
      nextLocked: all.find((b) => !isUnlocked(b))
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealVersion, buildingsVersion]);

  /* Badge "n achetables" par onglet */
  const affordableCount = (catId) => {
    if (babelActive && babelCat && catId !== babelCat) return 0;
    return categoryData(catId).visible
      .filter((b) => affordability[b.id] === "")
      .length;
  };

  const { visible: visibleBuildings, nextLocked } = categoryData(activeTab);

  // Premier bâtiment achetable, calculé avant le rendu (pas de mutation
  // pendant le .map() : incompatible avec la mémoïsation du React Compiler).
  const firstAffordableId = visibleBuildings.find((b) =>
    affordability[b.id] === "" && !(babelActive && babelCat && b.category !== babelCat)
  )?.id;

  // ── DÉLAI AVANT ACHAT (B5) ────────────────────────────────────────────────
  // La cité est FIGÉE en crise terminale (tick.js sort avant tout crédit) :
  // annoncer un délai serait un mensonge, il ne s'écoulerait jamais.
  // On s'abonne ici et non au `crisisFrozen` de la Topbar, qui est une variable
  // locale à ce composant-là.
  const crisisFrozen = useGameState((s) => !!s.crisisLimitAnnounced);

  // Le sélecteur ne balaie QUE les rangées réellement affichées et réellement
  // impayables. Le balayage des 30 bâtiments de `affordability` est sans
  // conséquence parce qu'une abordabilité bascule rarement ; un délai, lui,
  // DÉCOMPTE par construction — trente compteurs déphasés feraient changer la
  // signature plusieurs fois par seconde, et on perdrait exactement le `memo()`
  // sans props qui protège la boutique du tick.
  //
  // La signature est bâtie sur la valeur QUANTIFIÉE et non sur les secondes
  // brutes : quantifier après coup ne servirait à rien, la comparaison porte
  // sur ce qui est comparé, pas sur ce qui est affiché. On y met les secondes
  // quantifiées plutôt que le libellé (E5) : c'est la MÊME source de stabilité,
  // mais elle reste exploitable pour décider de l'état « bientôt », alors que
  // le libellé est une phrase TRADUITE qu'il faudrait parser.
  const etaSig = useGameState(() => {
    if (crisisFrozen) return "";
    const parts = [];
    for (const b of visibleBuildings) {
      if (affordability[b.id] === "") continue;       // payable : rien à annoncer
      if (!buyableInMass(b)) continue;                // coûte des Ruines : elles tombent, elles ne coulent pas
      const res = purchaseEta(costById[b.id]);
      if (res.kind === ETA_SECONDS) parts.push(`${b.id}=${quantizeEta(res.seconds)}`);
      else if (res.kind === ETA_NO_INCOME) parts.push(`${b.id}=~${res.currency}`);
      else if (res.kind === ETA_UNREACHABLE) parts.push(`${b.id}=!`);
    }
    return parts.join("|");
  });

  // Rangées « bientôt » (E5) : payables sous une minute au rythme actuel. Le
  // seuil est comparé à l'échéance DÉJÀ QUANTIFIÉE, ce qui règle gratuitement
  // le Risque de la fiche — un seuil posé sur les secondes brutes basculerait
  // d'un tick à l'autre et ferait clignoter la rangée.
  const soonById = useMemo(() => {
    const map = {};
    if (!etaSig) return map;
    for (const part of etaSig.split("|")) {
      const [id, valeur] = part.split("=");
      const secondes = Number(valeur);
      if (Number.isFinite(secondes) && secondes <= SOON_ETA_SECONDS) map[id] = true;
    }
    return map;
  }, [etaSig]);

  const etaById = useMemo(() => {
    const map = {};
    if (!etaSig) return map;
    for (const part of etaSig.split("|")) {
      const [id, valeur] = part.split("=");
      map[id] = valeur === "!"
        // Chiffrer serait exact et inutile : ce n'est pas d'attendre qu'il
        // s'agit, mais de faire grandir la production. On le dit comme ça,
        // plutôt qu'avec un « hors de portée » qui sonne définitif.
        ? tr({ fr: "pas à ce rythme de production", en: "not at this production rate" })
        : valeur.startsWith("~")
        // Pas de revenu sur cette devise : on N'AFFIRME PAS l'impossibilité.
        // L'Or vaut 0/s tant que le Rayonnement est sous 25, ce qui est l'état
        // de départ de chaque cycle — « hors de portée » y serait faux et
        // décourageant.
        ? tr({ fr: `pas encore de ${labelFor(valeur.slice(1))}`, en: `no ${labelFor(valeur.slice(1))} income yet` })
        : tr({ fr: `payable dans ${fmtEta(Number(valeur))}`, en: `affordable in ${fmtEta(Number(valeur))}` });
    }
    return map;
  }, [etaSig]);

  return (
    <div className={`panel shop-panel ${open ? 'is-open' : 'is-collapsed'}`}>
      {/* En-tête : les catégories SONT le titre (plus de « Bâtiments ») ; le
          chevron replie le corps, cliquer une catégorie déplie si besoin. */}
      <div className="shop-head">
        <div className="shop-subtabs" role="tablist" aria-label={tr({ fr: "Catégories de bâtiments", en: "Building categories" })}>
          {TABS.map((tab) => {
            const n = affordableCount(tab.id);
            return (
              <button
                key={tab.id}
                className={`shop-subtab ${activeTab === tab.id ? 'active' : ''}`}
                data-cat={tab.id}
                onClick={() => { setActiveTab(tab.id); if (!open) toggleOpen(); }}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
              >
                <span className="subtab-label">{tr(tab.label)}</span>
                {n > 0 && <span className="subtab-badge" {...tipProps(null, tr({ fr: `${n} achat${n > 1 ? "s" : ""} possible${n > 1 ? "s" : ""}`, en: `${n} purchase${n > 1 ? "s" : ""} available` }))}>{n}</span>}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="shop-collapse-toggle"
          aria-expanded={open}
          onClick={toggleOpen}
          {...tipProps(null, open ? tr({ fr: "Réduire la boutique", en: "Collapse the shop" }) : tr({ fr: "Déplier la boutique", en: "Expand the shop" }))}
        >
          <span className="hud-panel-chevron" aria-hidden="true"></span>
        </button>
      </div>

      {open && (<>
      {/* Multiplicateurs d'achat, en petit sous les catégories. */}
      <div className="shop-controls-row">
        <BuyToolbar />
      </div>

      <div className="shop-list shop-cat active">
        {visibleBuildings.map((b) => {
          // Voirie : encart tableau de bord dédié (jauges + bouton-verbe), une
          // architecture À PART des rangées — il lit l'état des chantiers
          // lui-même, aucun des props calculés ici ne le concerne.
          if (b.id === "roads") return <RoadworksPanel key={b.id} building={b} />;
          const prices = costById[b.id];
          const count = stateBuildings[b.id] || 0;
          // Facteur unitaire = le MÊME que getBuildingSums (jalons × Rives
          // fécondes), × Babel sur la catégorie élue comme dans rates() — pas
          // de formule recopiée, seulement recomposée depuis les helpers moteur.
          const outputMult = buildingUnitFactor(b, count)
            * (babelActive && b.category === babelCat ? babelExpMult : 1);
          const outputCount = Math.max(1, count);
          const milestoneInfo = buildingMilestoneInfo(b, count);
          const babelBlocked = babelActive && babelCat && b.category !== babelCat;
          // lackingKey : devises manquantes (depuis la signature d'abordabilité).
          // "" ⟺ tout payable ⟺ canPayCost true. Pilote aussi le highlight
          // is-lacking par coût dans PurchaseRow (mémoïsé).
          const lackingKey = affordability[b.id];
          const isAffordable = lackingKey === "" && !babelBlocked;

          const m = milestoneInfo?.milestone || 0;
          const milestoneTier = m >= 8 ? 5 : m >= 6 ? 4 : m >= 4 ? 3 : m >= 2 ? 2 : m >= 1 ? 1 : 0;

          const pulse = b.id === firstAffordableId;

          // GAIN RELATIF (B6). La quantité doit être celle que le bouton va
          // RÉELLEMENT acheter, sinon le pourcentage annonce autre chose que le
          // prix affiché juste à côté. « Palier » se résout comme dans la
          // rangée (nextIn), et « Max » vaut 1 parce que c'est ce que
          // buildingBatchCost chiffre pour ce mode.
          const stepSize = milestoneStep || 25;
          const gainAmount = buyAmount === "max" ? 1
            : buyAmount === "step" ? (stepSize - (count % stepSize))
            : (Number(buyAmount) || 1);
          const gains = buildingRelativeGain(b, count, gainAmount, gainScales);
          // Deux CHAÎNES, jamais un objet : la rangée est mémoïsée et
          // arePropsEqual compare des primitives. Le détail par ressource part
          // dans l'infobulle, la plus forte seule sur le chip.
          const gainLabel = gains.length ? fmtGainPct(gains[0].pct) : "";
          const gainTitle = gains.length
            ? gains.map((g) => `${tr(RES_NAMES[g.resource])} ${fmtGainPct(g.pct) || tr({ fr: "premier apport", en: "first output" })}`).join(" · ")
            : "";

          return (
            <PurchaseRow
              key={b.id}
              building={b}
              count={count}
              prices={prices}
              buyAmount={buyAmount}
              affordable={isAffordable}
              babelBlocked={babelBlocked}
              // E5 : Babel prime sur « bientôt ». Une catégorie interdite par
              // le Mythe n'est pas une question d'argent, et annoncer une
              // échéance courte sur une rangée qu'on ne peut PAS acheter serait
              // le mensonge le plus agaçant de la boutique.
              rowState={isAffordable ? "affordable" : (!babelBlocked && soonById[b.id]) ? "soon" : "locked"}
              milestoneInfo={milestoneInfo}
              step={milestoneStep}
              tier={milestoneTier}
              production={buildingProductionSegments(b, outputCount, globalMult, sqrtGlobalMult, outputMult)}
              globalMult={globalMult}
              outputMult={outputMult}
              lackingKey={lackingKey}
              gainLabel={gainLabel}
              gainTitle={gainTitle}
              pulse={pulse}
              etaLabel={etaById[b.id] || ""}
            />
          );
        })}

        {nextLocked && (() => {
          // Seule condition AFFICHABLE : le cycle (verrou explicite voulu).
          // L'apparition économique (cf. isUnlocked) reste muette : le bâtiment
          // caché suivant ne dit rien de plus que « Bientôt » (le bouton) —
          // pas de ligne « Bientôt disponible » redondante.
          const cycleHint = (nextLocked.unlockCycles && stateCycles < nextLocked.unlockCycles)
            ? tr({ fr: `Débloqué avec : cycle ${nextLocked.unlockCycles}`, en: `Unlocked with: cycle ${nextLocked.unlockCycles}` })
            : null;
          const soon = tr({ fr: "Bientôt disponible", en: "Available soon" });
          // Splash-art du prochain bâtiment, montré ASSOMBRI derrière le teaser
          // (état « à venir »). null si aucun splash pour ce bâtiment → carte nue.
          const splash = splashSrcFor(nextLocked.id, currentEraIndex());

          return (
            <article
              className={`purchase-row pr-locked${splash ? " pr-has-splash" : ""}`}
              style={splash ? { "--pr-splash": `url(${splash})` } : undefined}
            >
              <div className="pr-name-row">
                <span className="pr-icon" aria-hidden="true">
                  <i className="fa-solid fa-lock"></i>
                </span>
                <h3 className="pr-name">{tr(nextLocked.name)}</h3>
              </div>
              {cycleHint && <p className="pr-locked-hint">{cycleHint}</p>}
              <div className="pr-footer">
                <button className="btn-purchase" disabled title={cycleHint || soon}>
                  <span className="bp-action">{tr({ fr: "Bientôt", en: "Soon" })}</span>
                </button>
              </div>
            </article>
          );
        })()}
      </div>
      </>)}
    </div>
  );
}

// Sans props : memo le découple du re-render de CityView (1 Hz via tickNow).
// Le shop ne se re-rend plus que sur ses propres abonnements (abordabilité,
// globalMult, bâtiments, buyAmount, mythes) — pas à chaque tick.
export default memo(BuildingShop);
