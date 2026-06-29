import { memo, useMemo, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { useCollapsiblePanel } from '../../hooks/useCollapsiblePanel.js';
import {
  globalMultiplier,
  isUnlocked,
  buildingBatchCost,
  buildingOutputMultiplier,
  buildingMilestoneInfo
} from '../../game/core/mechanics.js';
import { buildings, buildingDisplayOrder } from '../../game/data/buildings.js';
import { isMythEffectActive } from '../../game/data/myths.js';
import { buildingById, renderCache } from '../../game/core/state.js';
import { tr } from '../../game/core/i18n.js';
import { D } from '../../game/core/num.js';
import BuyToolbar from './BuyToolbar.jsx';
import PurchaseRow from './PurchaseRow.jsx';

/* Segments de production [[ressource, valeur/s], …] — mêmes formules que
   l'ancien texte "Produit/Ajoute", rendu en icônes par PurchaseRow. */
function buildingProductionSegments(building, outputCount, globalMult, sqrtGlobalMult, outputMult) {
  return [
    ["population", building.pop * outputCount * globalMult * outputMult],
    ["food", building.food * outputCount * sqrtGlobalMult * outputMult],
    ["gold", building.gold * outputCount * sqrtGlobalMult * outputMult],
    ["knowledge", building.knowledge * outputCount * globalMult * outputMult],
    ["infrastructure", building.infra * outputCount * globalMult * outputMult]
  ].filter(([, value]) => Math.abs(value) > 0.0001);
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
  // babelActive dépend de activeMythId ET de ragnarokEffectsApplied (Babel ∈
  // RAGNAROK_CONSTRAINTS) : sans cet abonnement, le blocage Babel resterait
  // périmé si Ragnarok (dés)activait ses effets sans changer activeMythId.
  useGameState(s => s.ragnarokEffectsApplied);
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

  // Abonnement à la VALEUR de globalMultiplier (un number, pas un Decimal) :
  // piecewise-constant, il ne re-render qu'aux bascules réelles (fin de surchauffe,
  // paliers Atrides/Énée…) qui n'incrémentent pas _buildingsVersion → garde les
  // /s de production à jour sans re-render à chaque tick.
  const globalMult = useGameState(() => globalMultiplier());
  const sqrtGlobalMult = Math.sqrt(globalMult);

  const babelActive = isMythEffectActive("mythe_de_babel");
  const babelCat = babelActive ? (babelCategory || "") : "";

  const categoryData = (catId) => {
    const order = buildingDisplayOrder[catId] || [];
    const all = buildings
      .filter((b) => b.category === catId)
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return {
      visible: all.filter((b) => isUnlocked(b)),
      nextLocked: all.find((b) => !isUnlocked(b))
    };
  };

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

  return (
    <div className={`panel shop-panel ${open ? 'is-open' : 'is-collapsed'}`}>
      <div className="panel-heading">
        <button
          type="button"
          className="shop-collapse-toggle"
          aria-expanded={open}
          onClick={toggleOpen}
          title={open ? tr({ fr: "Réduire la boutique", en: "Collapse the shop" }) : tr({ fr: "Déplier la boutique", en: "Expand the shop" })}
        >
          <h2>{tr({ fr: "Bâtiments", en: "Buildings" })}</h2>
          <span className="hud-panel-chevron" aria-hidden="true"></span>
        </button>
        {open && <BuyToolbar />}
      </div>

      {open && (<>
      <div className="shop-controls-row">
        <div className="shop-subtabs" role="tablist" aria-label="Catégories de bâtiments">
          {TABS.map((tab) => {
            const n = affordableCount(tab.id);
            return (
              <button
                key={tab.id}
                className={`shop-subtab ${activeTab === tab.id ? 'active' : ''}`}
                data-cat={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
              >
                <span className="subtab-label">{tr(tab.label)}</span>
                {n > 0 && <span className="subtab-badge" title={tr({ fr: `${n} achat${n > 1 ? "s" : ""} possible${n > 1 ? "s" : ""}`, en: `${n} purchase${n > 1 ? "s" : ""} available` })}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="shop-list shop-cat active">
        {visibleBuildings.map((b) => {
          const prices = costById[b.id];
          const count = stateBuildings[b.id] || 0;
          const outputMult = buildingOutputMultiplier(b, count);
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

          return (
            <PurchaseRow
              key={b.id}
              building={b}
              count={count}
              prices={prices}
              buyAmount={buyAmount}
              affordable={isAffordable}
              babelBlocked={babelBlocked}
              milestoneInfo={milestoneInfo}
              tier={milestoneTier}
              production={buildingProductionSegments(b, outputCount, globalMult, sqrtGlobalMult, outputMult)}
              globalMult={globalMult}
              lackingKey={lackingKey}
              pulse={pulse}
            />
          );
        })}

        {nextLocked && (() => {
          const conditions = [];
          if (nextLocked.unlockBuilding) {
            const req = buildingById[nextLocked.unlockBuilding.id];
            const have = stateBuildings[nextLocked.unlockBuilding.id] || 0;
            conditions.push(`${have}/${nextLocked.unlockBuilding.count} ${req ? tr(req.name) : nextLocked.unlockBuilding.id}`);
          }
          if (nextLocked.unlockCycles && stateCycles < nextLocked.unlockCycles) {
            conditions.push(`cycle ${nextLocked.unlockCycles}`);
          }
          const hint = conditions.length
            ? tr({ fr: `Débloqué avec : ${conditions.join(" + ")}`, en: `Unlocked with: ${conditions.join(" + ")}` })
            : tr({ fr: "Bientôt disponible", en: "Available soon" });

          return (
            <article className="purchase-row pr-locked">
              <div className="pr-icon" aria-hidden="true">
                <i className="fa-solid fa-lock"></i>
              </div>
              <div className="pr-main">
                <div className="pr-name-row">
                  <h3 className="pr-name">{tr(nextLocked.name)}</h3>
                </div>
                <p className="pr-locked-hint">{hint}</p>
              </div>
              <button className="btn-purchase" disabled>
                <span className="bp-action">{tr({ fr: "Bientôt", en: "Soon" })}</span>
              </button>
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
