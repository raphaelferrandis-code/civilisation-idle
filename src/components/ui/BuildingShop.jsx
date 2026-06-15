import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import {
  globalMultiplier,
  isUnlocked,
  buildingBatchCost,
  buildingOutputMultiplier,
  buildingMilestoneInfo
} from '../../game/core/mechanics.js';
import { buildings, buildingDisplayOrder } from '../../game/data/buildings.js';
import { isMythEffectActive } from '../../game/data/myths.js';
import { buildingById } from '../../game/core/state.js';
import { canPayCost } from '../../game/core/utils.js';
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
  { id: "city", label: "Moteurs" },
  { id: "knowledge", label: "Savoir" },
  { id: "infra", label: "Infra" }
];

export default function BuildingShop() {
  const [activeTab, setActiveTab] = useState("city"); // "city", "knowledge", "infra"

  // Subscriptions to trigger component update on state mutations
  const stateBuildings = useGameState(s => ({ ...s.buildings }));
  const buyAmount = useGameState(s => s.buyAmount);
  const stateCycles = useGameState(s => s.cycles);
  useGameState(s => s.activeMythId);
  const babelCategory = useGameState(s => s.babelCategory);
  // Ressources : nécessaires pour que l'état "achetable" se mette à jour en
  // continu (les instances Decimal changent à chaque tick → re-render).
  useGameState(s => ({
    f: s.food, g: s.gold, k: s.knowledge, i: s.infrastructure, p: s.population
  }));

  const globalMult = globalMultiplier();
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
      .filter((b) => canPayCost(buildingBatchCost(b)))
      .length;
  };

  const { visible: visibleBuildings, nextLocked } = categoryData(activeTab);

  // Premier bâtiment achetable, calculé avant le rendu (pas de mutation
  // pendant le .map() : incompatible avec la mémoïsation du React Compiler).
  const firstAffordableId = visibleBuildings.find((b) =>
    canPayCost(buildingBatchCost(b)) && !(babelActive && babelCat && b.category !== babelCat)
  )?.id;

  return (
    <div className="panel shop-panel">
      <div className="panel-heading">
        <div>
          <h2>Bâtiments</h2>
        </div>
        <BuyToolbar />
      </div>

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
                {tab.label}
                {n > 0 && <span className="subtab-badge" title={`${n} achat${n > 1 ? "s" : ""} possible${n > 1 ? "s" : ""}`}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="shop-list shop-cat active">
        {visibleBuildings.map((b) => {
          const prices = buildingBatchCost(b);
          const count = stateBuildings[b.id] || 0;
          const outputMult = buildingOutputMultiplier(b, count);
          const outputCount = Math.max(1, count);
          const milestoneInfo = buildingMilestoneInfo(b, count);
          const babelBlocked = babelActive && babelCat && b.category !== babelCat;
          const isAffordable = canPayCost(prices) && !babelBlocked;

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
              pulse={pulse}
            />
          );
        })}

        {nextLocked && (() => {
          const conditions = [];
          if (nextLocked.unlockBuilding) {
            const req = buildingById[nextLocked.unlockBuilding.id];
            const have = stateBuildings[nextLocked.unlockBuilding.id] || 0;
            conditions.push(`${have}/${nextLocked.unlockBuilding.count} ${req?.name || nextLocked.unlockBuilding.id}`);
          }
          if (nextLocked.unlockCycles && stateCycles < nextLocked.unlockCycles) {
            conditions.push(`cycle ${nextLocked.unlockCycles}`);
          }
          const hint = conditions.length ? `Débloqué avec : ${conditions.join(" + ")}` : "Bientôt disponible";

          return (
            <article className="purchase-row pr-locked">
              <div className="pr-icon" aria-hidden="true">
                <i className="fa-solid fa-lock"></i>
              </div>
              <div className="pr-main">
                <div className="pr-name-row">
                  <h3 className="pr-name">{nextLocked.name}</h3>
                </div>
                <p className="pr-locked-hint">{hint}</p>
              </div>
              <button className="btn-purchase" disabled>
                <span className="bp-action">Bientôt</span>
              </button>
            </article>
          );
        })()}
      </div>
    </div>
  );
}
