import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import {
  globalMultiplier,
  isUnlocked,
  buildingBatchCost,
  buildingOutputMultiplier,
  nextMilestoneText,
  buildingMilestoneInfo
} from '../../game/core/mechanics.js';
import { buyBuilding } from '../../game/core/actions.js';
import { buildings, buildingDisplayOrder } from '../../game/data/buildings.js';
import { isMythEffectActive } from '../../game/data/myths.js';
import { buildingById } from '../../game/core/state.js';
import { fmt, clamp, costLabel, signed, canPayCost } from '../../game/core/utils.js';
import BuyToolbar from './BuyToolbar.jsx';

function buildingProductionText(building, outputCount, globalMult, sqrtGlobalMult, outputMult, isTotal) {
  const values = [
    ["pop", building.pop * outputCount * globalMult * outputMult],
    ["nour", building.food * outputCount * sqrtGlobalMult * outputMult],
    ["tres", building.gold * outputCount * sqrtGlobalMult * outputMult],
    ["sav", building.knowledge * outputCount * globalMult * outputMult],
    ["infra", building.infra * outputCount * globalMult * outputMult]
  ].filter(([, value]) => Math.abs(value) > 0.0001);
  
  const label = isTotal ? "Produit" : "Ajoute";
  if (!values.length) return `${label} effet indirect`;
  return `${label} ${values.map(([name, value]) => `${signed(value)} ${name}/s`).join(" | ")}`;
}

export default function BuildingShop() {
  const [activeTab, setActiveTab] = useState("city"); // "city", "knowledge", "infra"
  
  // Subscriptions to trigger component update on state mutations
  const stateBuildings = useGameState(s => ({ ...s.buildings }));
  const buyAmount = useGameState(s => s.buyAmount);
  const stateCycles = useGameState(s => s.cycles);
  useGameState(s => s.activeMythId);
  const babelCategory = useGameState(s => s.babelCategory);

  const globalMult = globalMultiplier();
  const sqrtGlobalMult = Math.sqrt(globalMult);

  const order = buildingDisplayOrder[activeTab] || [];
  const allCategory = buildings
    .filter((b) => b.category === activeTab)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  const visibleBuildings = allCategory.filter((b) => isUnlocked(b));
  const nextLocked = allCategory.find((b) => !isUnlocked(b));

  const babelActive = isMythEffectActive("mythe_de_babel");
  const babelCat = babelActive ? (babelCategory || "") : "";

  return (
    <div className="panel shop-panel">
      <div className="panel-heading">
        <div>
          <span className="label">Construction</span>
          <h2>Batiments</h2>
        </div>
      </div>

      <div className="shop-controls-row">
        <div className="shop-subtabs" role="tablist" aria-label="Categories de batiments">
          <button
            className={`shop-subtab ${activeTab === 'city' ? 'active' : ''}`}
            onClick={() => setActiveTab('city')}
            type="button"
          >
            Moteurs
          </button>
          <button
            className={`shop-subtab ${activeTab === 'knowledge' ? 'active' : ''}`}
            onClick={() => setActiveTab('knowledge')}
            type="button"
          >
            Savoir
          </button>
          <button
            className={`shop-subtab ${activeTab === 'infra' ? 'active' : ''}`}
            onClick={() => setActiveTab('infra')}
            type="button"
          >
            Infrastructures
          </button>
        </div>
        <BuyToolbar />
      </div>

      <div className="shop-list shop-cat active">
        {visibleBuildings.map((b) => {
          const prices = buildingBatchCost(b);
          const count = stateBuildings[b.id] || 0;
          const outputMult = buildingOutputMultiplier(b, count);
          const outputCount = Math.max(1, count);
          const milestoneText = nextMilestoneText(b, count);
          const milestoneInfo = buildingMilestoneInfo(b, count);

          const workDuration = clamp(3.8 - Math.log10(count + 1) * 0.72, 0.45, 3.8);
          const workFill = clamp(count, 0, 100);
          const babelBlocked = babelActive && babelCat && b.category !== babelCat;

          const isAffordable = canPayCost(prices) && !babelBlocked;

          const m = milestoneInfo?.milestone || 0;
          const milestoneTier = m >= 8 ? 5 : m >= 6 ? 4 : m >= 4 ? 3 : m >= 2 ? 2 : m >= 1 ? 1 : 0;

          return (
            <article
              key={b.id}
              className={`shop-item ${count > 0 ? "active-machine" : ""} ${milestoneInfo ? "milestone-achieved" : ""} ${babelBlocked ? "babel-blocked" : ""}`}
              data-tier={milestoneTier > 0 ? milestoneTier : undefined}
              style={{
                '--work-duration': `${workDuration}s`,
                '--work-fill': `${workFill}%`,
              }}
            >
              <div className="shop-main">
                <div className="shop-title">
                  <h3>{b.name}</h3>
                  <div className="shop-badges">
                    {milestoneInfo && <span className="chip milestone-badge">{milestoneInfo.label}</span>}
                    <span className="chip level-chip">Niv. {fmt(count)}</span>
                  </div>
                </div>
                <div className="work-bar" aria-hidden="true"><span></span></div>
                <div className="shop-meta">
                  <span className="chip">Cout {costLabel(prices)}</span>
                  {milestoneText && <span className="chip">{milestoneText}</span>}
                  <span className="chip output-chip">
                    {buildingProductionText(b, outputCount, globalMult, sqrtGlobalMult, outputMult, Boolean(count))}
                  </span>
                </div>
              </div>
              <button
                disabled={!isAffordable}
                onClick={() => buyBuilding(b.id)}
              >
                Acheter x{buyAmount}
              </button>
            </article>
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
          const hint = conditions.length ? `Debloque avec : ${conditions.join(" + ")}` : "Bientot disponible";
          
          return (
            <article className="shop-item shop-item--locked">
              <div>
                <h3>{nextLocked.name} <span className="chip">?</span></h3>
                <p className="locked-hint">{hint}</p>
              </div>
              <button disabled>Bientot</button>
            </article>
          );
        })()}
      </div>
    </div>
  );
}
