"use strict";

/* ============================================================================
 * render.js - Rendu DOM: tous les render*, openView, helpers de rendu.
 * Ordre de chargement (index.html): U -> DB -> DU -> DW -> ST -> ME -> EV -> AC -> RE -> MA
 * Scope global partage (pas de modules) - ne pas envelopper dans une IIFE.
 * ============================================================================ */

function renderBuildingList(rootId, category) {
  const root = el(rootId);
  const globalMult = globalMultiplier();
  const sqrtGlobalMult = Math.sqrt(globalMult);
  const order = buildingDisplayOrder[category] || [];
  const allCategory = buildings
    .filter((b) => b.category === category)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const visibleBuildings = allCategory.filter((b) => isUnlocked(b));
  const nextLocked = allCategory.find((b) => !isUnlocked(b));
  const nextLockedKey = nextLocked
    ? `next:${nextLocked.id}:${nextLocked.unlockBuilding ? (state.buildings[nextLocked.unlockBuilding.id] || 0) : state.cycles}`
    : "none";
  const babelActive = state.activeMythId === "mythe_de_babel";
  const babelCat = babelActive ? (state.babelCategory || "") : "";
  const signature = [
    buyAmount,
    globalMult.toFixed(6),
    nextLockedKey,
    babelCat,
    ...visibleBuildings.map((building) => `${building.id}:${state.buildings[building.id] || 0}`)
  ].join("|");

  if (renderCache.buildings[rootId] !== signature) {
    root.innerHTML = "";
    renderCache.buildings[rootId] = signature;

    for (const b of visibleBuildings) {
      const prices = buildingBatchCost(b);
      // Stocke le coût dans le cache persistant (valide jusqu'à la prochaine invalidation)
      renderCache.batchCosts[b.id] = prices;
      const count = state.buildings[b.id] || 0;
      const outputMult = buildingOutputMultiplier(b, count);
      const outputCount = Math.max(1, count);
      const milestoneText = nextMilestoneText(b, count);
      const milestoneInfo = buildingMilestoneInfo(b, count);
      const milestoneFlash = Boolean(milestoneInfo) && recentBuildingMilestones[b.id] === milestoneInfo.milestone;
      const workDuration = clamp(3.8 - Math.log10(count + 1) * 0.72, 0.45, 3.8);
      const workFill = clamp(count, 0, 100);
      const item = document.createElement("article");
      const babelBlocked = babelActive && babelCat && b.category !== babelCat;
      item.className = `shop-item${count > 0 ? " active-machine" : ""}${milestoneInfo ? " milestone-achieved" : ""}${milestoneFlash ? " milestone-flash" : ""}${babelBlocked ? " babel-blocked" : ""}`;
      item.style.setProperty("--work-duration", `${workDuration}s`);
      item.style.setProperty("--work-fill", `${workFill}%`);
      item.style.setProperty("--milestone-alpha", String(Math.min(0.36, (milestoneInfo?.milestone || 0) * 0.045)));
      item.style.setProperty("--milestone-border", String(Math.min(0.92, 0.36 + (milestoneInfo?.milestone || 0) * 0.1)));
      item.style.setProperty("--milestone-glow", String(Math.min(0.34, (milestoneInfo?.milestone || 0) * 0.04)));
      item.innerHTML = `
        <div class="shop-main">
          <div class="shop-title">
            <h3>${b.name}</h3>
            <div class="shop-badges">
              ${milestoneInfo ? `<span class="chip milestone-badge">${milestoneInfo.label}</span>` : ""}
              <span class="chip level-chip">Niv. ${fmt(count)}</span>
            </div>
          </div>
          <div class="work-bar" aria-hidden="true"><span></span></div>
          <div class="shop-meta">
            <span class="chip">Cout ${costLabel(prices)}</span>
            ${milestoneText ? `<span class="chip">${milestoneText}</span>` : ""}
            <span class="chip output-chip">${buildingProductionText(b, outputCount, globalMult, sqrtGlobalMult, outputMult, Boolean(count))}</span>
          </div>
        </div>
        <button data-buy="${b.id}"${babelBlocked ? " disabled" : ""}>Acheter x${buyAmount}</button>
      `;
      item.querySelector("button").addEventListener("click", () => buyBuilding(b.id));
      root.appendChild(item);
      if (milestoneFlash) {
        setTimeout(() => {
          item.classList.remove("milestone-flash");
          if (recentBuildingMilestones[b.id] === milestoneInfo?.milestone) delete recentBuildingMilestones[b.id];
        }, 1200);
      }
    }

    if (nextLocked) {
      const conditions = [];
      if (nextLocked.unlockBuilding) {
        const req = buildingById[nextLocked.unlockBuilding.id];
        const have = state.buildings[nextLocked.unlockBuilding.id] || 0;
        conditions.push(`${have}/${nextLocked.unlockBuilding.count} ${req?.name || nextLocked.unlockBuilding.id}`);
      }
      if (nextLocked.unlockCycles && state.cycles < nextLocked.unlockCycles) {
        conditions.push(`cycle ${nextLocked.unlockCycles}`);
      }
      const hint = conditions.length ? `Debloque avec : ${conditions.join(" + ")}` : "Bientot disponible";
      const locked = document.createElement("article");
      locked.className = "shop-item shop-item--locked";
      locked.innerHTML = `
        <div>
          <h3>${nextLocked.name} <span class="chip">?</span></h3>
          <p class="locked-hint">${hint}</p>
        </div>
        <button disabled>Bientot</button>
      `;
      root.appendChild(locked);
    }
  }

  for (const b of visibleBuildings) {
    const button = root.querySelector(`[data-buy="${b.id}"]`);
    if (button) {
      const isBlocked = babelActive && babelCat && b.category !== babelCat;
      button.disabled = isBlocked || !canPayCost(renderCache.batchCosts[b.id] || buildingBatchCost(b));
    }
  }
}

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

function renderBuildings(r) {
  renderBuildingList("cityBuildings", "city");
  renderBuildingList("knowledgeBuildings", "knowledge");
  renderBuildingList("infraBuildings", "infra");
  el("popRate").textContent = fmt(r.population);
  el("foodRate").textContent = fmt(r.food);
  el("goldRate").textContent = fmt(r.gold);
  el("knowledgeRate").textContent = fmt(r.knowledge + theocracyKnowledgeRate());
  el("infraRate").textContent = has("trait_nomadism")
    ? `${fmt(r.infrastructure)} (cap ${fmt(nomadInfrastructureCap())})`
    : fmt(r.infrastructure);
}

function renderUpgradeGroup(rootId, group) {
  const root = el(rootId);
  if (group === "ruins") {
    const signature = upgrades
      .filter((upgrade) => upgrade.group === "ruins" && !dogmaIds.has(upgrade.id) && isUnlocked(upgrade))
      .map((upgrade) => `${upgrade.id}:${has(upgrade.id) ? 1 : 0}:${checkNodeAvailability(upgrade.id)}`)
      .join("|");
    if (renderCache.upgrades[rootId] === signature) return;
    renderCache.upgrades[rootId] = signature;
    root.innerHTML = "";
    renderRuinUpgradePaths(root);
    return;
  }

  const visible = upgrades.filter((upgrade) => (upgrade.group || "heritage") === group && isUnlocked(upgrade));
  const signature = visible.map((upgrade) => `${upgrade.id}:${has(upgrade.id) ? 1 : 0}:${canBuyUpgrade(upgrade) ? 1 : 0}`).join("|");
  if (renderCache.upgrades[rootId] === signature) return;
  renderCache.upgrades[rootId] = signature;
  root.innerHTML = "";
  for (const u of visible) {
    root.appendChild(createUpgradeCard(u, true));
  }
}

function createUpgradeCard(upgrade, showLore) {
  const item = document.createElement("article");
  item.className = `upgrade${has(upgrade.id) ? " bought" : ""}`;
  item.innerHTML = `
    <div>
      <h3>${upgrade.name}</h3>
      ${showLore ? `<p>${upgrade.desc}</p>` : ""}
      <p class="effect-line">${upgrade.effect}</p>
      <div class="shop-meta"><span class="chip">${has(upgrade.id) ? "Acquis" : upgradeCostText(upgrade)}</span></div>
    </div>
    <button data-upgrade="${upgrade.id}">${has(upgrade.id) ? "Actif" : "Acheter"}</button>
  `;
  const button = item.querySelector("button");
  button.disabled = has(upgrade.id) || !canBuyUpgrade(upgrade);
  button.addEventListener("click", () => buyUpgrade(upgrade.id));
  return item;
}

function ruinPathFor(upgrade) {
  return ruinPaths.find((path) => path.ids.includes(upgrade.id) || path.types.includes(upgrade.effectType)) || ruinPaths[ruinPaths.length - 1];
}

function renderRuinUpgradePaths(root) {
  root.className = "prestige-tree";
  const visibleIds = new Set(upgrades.filter((upgrade) => upgrade.group === "ruins" && !dogmaIds.has(upgrade.id) && isUnlocked(upgrade)).map((upgrade) => upgrade.id));
  for (const branch of PRESTIGE_TREE_BRANCHES) {
    const branchNodes = PRESTIGE_TREE.filter((node) => node.branch === branch.id && visibleIds.has(node.id));
    if (!branchNodes.length) continue;
    const branchCount = ownedRuinBranchPurchaseCount(branch.id);
    const maxDogma = PRESTIGE_DOGMAS.filter((d) => d.branch === branch.id).reduce((max, d) => Math.max(max, d.requiredPurchases), 0);
    const nextDogma = PRESTIGE_DOGMAS.filter((d) => d.branch === branch.id && !has(d.id)).sort((a, b) => a.requiredPurchases - b.requiredPurchases)[0];
    const progressTarget = nextDogma ? nextDogma.requiredPurchases : maxDogma;
    const progressPct = progressTarget > 0 ? Math.min(100, Math.round((branchCount / progressTarget) * 100)) : 100;
    const progressLabel = nextDogma ? `${branchCount} / ${progressTarget} vers ${nextDogma.tier}` : `${branchCount} achats — tous paliers atteints`;
    const section = document.createElement("section");
    section.className = `tree-branch ${branch.id}`;
    section.innerHTML = `
      <div class="tree-branch-heading">
        <span class="label">Branche</span>
        <h3>${branch.name}</h3>
        <p>${branch.hint}</p>
        <div class="branch-progress">
          <div class="branch-progress-bar ${branch.id}"><span style="width:${progressPct}%"></span></div>
          <span class="branch-progress-label">${progressLabel}</span>
        </div>
      </div>
      <div class="tree-flow"></div>
    `;
    const flow = section.querySelector(".tree-flow");
    for (const node of branchNodes) flow.appendChild(createPrestigeNode(node));
    root.appendChild(section);
  }
}

function renderDogmaMilestones() {
  const root = el("dogmaMilestones");
  // Précalcule les comptes par branche (évite N appels à ownedRuinBranchPurchaseCount par dogma)
  const branchCounts = {};
  for (const dogma of PRESTIGE_DOGMAS) {
    if (!(dogma.branch in branchCounts)) {
      branchCounts[dogma.branch] = ownedRuinBranchPurchaseCount(dogma.branch);
    }
  }
  const signature = PRESTIGE_DOGMAS.map((dogma) => `${dogma.id}:${branchCounts[dogma.branch]}:${checkDogmaAvailability(dogma.id)}`).join("|");
  if (renderCache.dogmas === signature) return;
  renderCache.dogmas = signature;
  root.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "dogma-heading";
  heading.innerHTML = `
    <div>
      <span class="label">Paliers culturels</span>
      <h3>Dogmes majeurs</h3>
    </div>
    <strong>10 / 20 / 30 achats par branche</strong>
  `;
  root.appendChild(heading);

  const grid = document.createElement("div");
  grid.className = "dogma-grid";
  for (const dogma of PRESTIGE_DOGMAS) {
    const upgrade = upgradeById[dogma.id];
    const status = checkDogmaAvailability(dogma.id);
    const branchCount = branchCounts[dogma.branch];
    const missing = Math.max(0, dogma.requiredPurchases - branchCount);
    const branchName = PRESTIGE_TREE_BRANCHES.find((branch) => branch.id === dogma.branch)?.name || dogma.branch;
    const card = document.createElement("button");
    card.type = "button";
    card.className = `dogma-card ${dogma.branch} ${status}`;
    card.disabled = status !== "available";
    const barPct = has(dogma.id) ? 100 : Math.min(100, Math.round((branchCount / dogma.requiredPurchases) * 100));
    card.innerHTML = `
      <span class="tree-status">${has(dogma.id) ? "Adopte" : dogma.tier}</span>
      <strong>${upgrade.name}</strong>
      <small>${upgrade.effect}</small>
      ${has(dogma.id) ? `<span class="tree-cost">Actif</span>` : `
        <div class="dogma-progress">
          <div class="dogma-progress-bar ${dogma.branch}"><span style="width:${barPct}%"></span></div>
          <span class="dogma-progress-label">${branchCount} / ${dogma.requiredPurchases}</span>
        </div>
      `}
      ${missing > 0 ? `<em>${missing} achats requis</em>` : has(dogma.id) ? "" : "<em>Palier atteint — adoption gratuite</em>"}
    `;
    card.addEventListener("click", () => buyUpgrade(dogma.id));
    grid.appendChild(card);
  }
  root.appendChild(grid);
}

function createPrestigeNode(node) {
  const upgrade = upgradeById[node.id];
  const status = checkNodeAvailability(node.id);
  const item = document.createElement("button");
  item.type = "button";
  item.id = `tree-node-${node.id}`;
  item.className = `tree-node ${status}`;
  item.dataset.nodeId = node.id;
  const parentName = node.requires ? upgradeById[node.requires]?.name : "";
  const conflictName = upgrade.conflictsWith ? upgradeById[upgrade.conflictsWith]?.name : "";
  const statusLabel = status === "purchased" ? "Achete" : status === "available" ? "Disponible" : status === "blocked" ? "Exclu" : "Verrouille";
  item.innerHTML = `
    <span class="tree-status">${statusLabel}</span>
    <strong>${upgrade.name}</strong>
    <small>${upgrade.effect}</small>
    <span class="tree-cost">${status === "purchased" ? "Maxe" : `${fmt(node.cost)} ruines`}</span>
    ${status === "blocked" ? `<em>Exclu par : ${conflictName}</em>` : node.requires && !has(node.requires) ? `<em>Requiert ${parentName}</em>` : ""}
  `;
  item.disabled = status !== "available";
  item.addEventListener("click", () => buyUpgrade(node.id));
  return item;
}

function renderUpgrades() {
  renderUpgradeGroup("upgrades", "heritage");
  renderDogmaMilestones();
  renderUpgradeGroup("ruinUpgrades", "ruins");
  const unlocked = state.cycles > 0 || state.ruins > 0 || upgrades.some((upgrade) => upgrade.group === "ruins" && has(upgrade.id));
  el("ruinsTab").classList.toggle("hidden", !unlocked);
  const exhumeBtn = el("exhumeBtn");
  const archaeologyUnlocked = has("skill_archaeology");
  exhumeBtn.classList.toggle("hidden", !archaeologyUnlocked);
  exhumeBtn.disabled = !canExhume();
  exhumeBtn.textContent = state.archaeologyUsed
    ? "Vestige deja exhume"
    : `Exhumer un vestige (${fmt(archaeologyCost())} savoir)`;
  if (!unlocked && el("ruinsView").classList.contains("active")) {
    document.querySelector('[data-view="city"]').click();
  }
}

function render() {
  // Invalide les caches frame à chaque render (pour les renders manuels hors setInterval)
  // Dans le setInterval, ils sont déjà invalidés après tick(); cette invalidation est donc
  // no-op dans ce cas mais garantit la cohérence pour tous les autres appels à render().
  _frameVitals = null;
  _framePressure = null;
  _frameGlobalMult = null;

  const eraIndex = currentEraIndex();
  const era = eras[eraIndex];
  const progress = nextEraProgress(eraIndex);
  const dynastyIndex = state.dynastyCount % dynastyNames.length;
  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);

  // Valeurs coûteuses calculées une seule fois par render()
  const globalMult = globalMultiplier();
  const ruinGainVal = ruinGain();
  const ruinMult = ruinMultiplier();
  const unspentPower = ruinEffectSum("unspentRuinsPower");
  const unspentMult = unspentPower > 0 ? unspentRuinsPowerMultiplier() : 1;
  const legitGain = legitimacyGain();

  el("population").textContent = fmt(state.population);
  el("food").textContent = fmt(state.food);
  el("gold").textContent = fmt(state.gold);
  el("knowledge").textContent = fmt(state.knowledge);
  el("infrastructure").textContent = fmt(state.infrastructure);
  el("instability").textContent = pct(state.instability);
  el("timeWear").textContent = pct(state.timeWear);
  el("ruinsTopbar").textContent = fmt(state.ruins);
  el("ruinMultTopbar").textContent = fmt(ruinMult);
  renderCityDashboard(r);
  el("collapseHint").textContent = crisisOpen() ? `+${fmt(ruinGainVal)} ruines possibles` : "structure a 100%";
  el("timeWearHint").textContent = crisisOpen() ? `+${fmt(ruinGainVal)} ruines possibles` : "avance hors ligne";
  renderGauge("instabilityResource", "instabilityMeter", state.instability);
  renderGauge("timeWearResource", "timeWearMeter", state.timeWear);
  el("instabilityResource").classList.toggle("crisis-ready", state.instability >= 1);
  el("instabilityResource").setAttribute("aria-label", state.instability >= 1 ? "Rupture ouverte, aller aux crises" : "Rupture structurelle");
  el("eraName").textContent = era.name;
  el("eraText").textContent = era.text;
  el("eraProgress").style.width = `${progress * 100}%`;
  el("eraIndexDisplay").textContent = `${roman(eraIndex + 1)} / ${roman(eras.length)}`;
  const nextEra = eras[eraIndex + 1];
  el("eraNextName").textContent = nextEra ? `→ ${nextEra.name}` : "Apogee atteinte";
  if (document.activeElement !== el("cityNameInput")) el("cityNameInput").value = state.cityName || "NomVille";
  el("dynastyAge").textContent = roman(state.dynastyCount + 1);
  el("cycles").textContent = fmt(state.cycles);
  el("globalMult").textContent = `x${fmt(globalMult)}`;
  el("bestEra").textContent = eras[state.bestEraIndex].name;
  // Bloc unspentRuinsPower unifié (remplace deux blocs hasLatentCity / hasLatent identiques)
  const hasLatent = unspentPower > 0;
  el("cityLatentRow").classList.toggle("hidden", !hasLatent);
  el("unspentBonusRow").classList.toggle("hidden", !hasLatent);
  if (hasLatent) {
    el("cityLatentBonus").textContent = `x${fmt(unspentMult)}`;
    el("unspentBonus").textContent = `x${fmt(unspentMult)} (${fmt(state.ruins)} ruines × ${fmt(unspentPower * 100)}%)`;
  }
  el("cycleTime").textContent = `${Math.floor((Date.now() - state.cycleStartedAt) / 1000)}s`;

  el("ruinGain").textContent = fmt(ruinGainVal);
  el("collapsePreparation").textContent = `+${fmt(Math.min(2.4, state.collapsePreparation || 0) * 100)}%`;
  el("heritageQuality").textContent = heritageQuality();
  el("ruins").textContent = fmt(state.ruins);
  el("ruinBonus").textContent = `x${fmt(ruinMult)}`;
  el("legitimacyGain").textContent = fmt(legitGain);
  el("legitimacy").textContent = fmt(state.legitimacy);
  // Palier dynastique : +1 légitimité par tranche de 5 dynasties
  const dynCount = state.dynastyCount || 0;
  const dynPalier = Math.floor(dynCount / 5);
  const dynastiesToNextPalier = 5 - (dynCount % 5);
  el("dynastyPalier").textContent = dynPalier > 0 ? `+${dynPalier} / fondation` : "+0 / fondation";
  el("dynastyPalierNext").textContent = dynastiesToNextPalier === 5
    ? `palier atteint (+${dynPalier})`
    : `dans ${dynastiesToNextPalier} dynasties (+${dynPalier + 1})`;
  el("institutionBonus").textContent = `x${fmt(institutionMultiplier())}`;

  const mythBlocksCollapse = state.activeMythId === "mythe_d_icare" || state.activeMythId === "mythe_d_atlas";
  el("collapseBtn").disabled = ruinGainVal <= 0 || mythBlocksCollapse;
  el("prepareArchivesBtn").disabled = !terminalCrisisReady("prepareArchives");
  el("prepareArchivesBtn").textContent = `Preparer (${costLabel(terminalCrisisCost("prepareArchives"))})`;
  el("exodusBtn").disabled = !terminalCrisisReady("exodus");
  el("exodusBtn").textContent = `Exode (${costLabel(terminalCrisisCost("exodus"))})`;
  el("holdOrderBtn").disabled = !terminalCrisisReady("holdOrder");
  el("holdOrderBtn").textContent = `Tenir (${costLabel(terminalCrisisCost("holdOrder"))})`;
  renderCrisisSummary(ruinGainVal, legitGain);
  renderMythView();
  renderIcareTimer();
  renderSurchauffe();
  renderSisypheMult();
  renderBabelStatus();
  renderOrStatus();
  renderPhoenixStatus();
  renderAutoScript();
  renderHephStatus();
  renderAutomates();
  renderAtlasLegitimite();
  el("dynastyBtn").disabled = legitGain <= 0;

  // Bouton Max (visible seulement si reforme_administrative achetée)
  const maxBtn = el("buyModeMax");
  if (maxBtn) maxBtn.classList.toggle("hidden", !has("reforme_administrative"));

  // Tab Heritage (visible dès la première légitimité)
  el("heritageTab")?.classList.toggle("hidden", state.legitimacy <= 0 && state.dynastyCount <= 0);

  // Tab Mythes dans la sidebar (visible dès le premier effondrement)
  const mythTabEl = el("mythTab");
  if (mythTabEl) mythTabEl.classList.toggle("hidden", (state.cycles || 0) < 1);

  // Panel Grand Reset
  const grCount = state.grandResetCount || 0;
  if (el("grandResetCount")) el("grandResetCount").textContent = grCount;
  if (el("grandResetBonus")) el("grandResetBonus").textContent = `x${Math.pow(2, grCount).toFixed(0)}`;
  if (el("grandResetBonusNext")) el("grandResetBonusNext").textContent = `x${Math.pow(2, grCount + 1).toFixed(0)}`;
  const grBtn = el("grandResetBtn");
  if (grBtn) grBtn.disabled = !has("grand_reset");

  renderBuildings(r);
  renderUpgrades();
  renderCivilization(eraIndex, dynastyIndex);
  renderCityState(vitals);
  renderTensions(pressure);
  renderLog();
  renderElementArchive();
}

function renderGauge(resourceId, meterId, value) {
  const resource = el(resourceId);
  const level = value >= 0.75 ? "danger" : value >= 0.45 ? "warning" : "stable";
  resource.classList.toggle("warning", level === "warning");
  resource.classList.toggle("danger", level === "danger");
  el(meterId).style.width = `${clamp01(value) * 100}%`;
}

function renderCityDashboard(r) {
  setAnimatedText("cityPopulation", fmt(state.population));
  setAnimatedText("cityPopRate", fmt(r.population));
  setAnimatedText("cityFoodRate", fmt(r.food));
  setAnimatedText("cityGoldRate", fmt(r.gold));
  setAnimatedText("cityKnowledgeRate", fmt(r.knowledge + theocracyKnowledgeRate()));
  setAnimatedText("cityInfraRate", fmt(r.infrastructure));
  setAnimatedText("cityFoodTotal", fmt(state.food));
  setAnimatedText("cityGoldTotal", fmt(state.gold));
  setAnimatedText("cityKnowledgeTotal", fmt(state.knowledge));
  setAnimatedText("cityInfraTotal", fmt(state.infrastructure));
  el("cityInstability").textContent = pct(state.instability);
  el("cityTimeWear").textContent = pct(state.timeWear);
  el("cityInstabilityBar").style.width = `${clamp01(state.instability) * 100}%`;
  el("cityTimeWearBar").style.width = `${clamp01(state.timeWear) * 100}%`;
  renderVillagerMessage(r);
}

function setAnimatedText(id, value) {
  const node = el(id);
  if (renderedCityCounters[id] !== value) {
    renderedCityCounters[id] = value;
    node.textContent = value;
    node.classList.remove("counter-bump");
    void node.offsetWidth;
    node.classList.add("counter-bump");
    return;
  }
  node.textContent = value;
}

function renderVillagerMessage(r) {
  const message = villagerMessage(r);
  const signature = `${message.quote ? 1 : 0}:${message.text}`;
  if (signature === renderedVillagerMessage) return;
  renderedVillagerMessage = signature;
  const feed = el("villagerFeed");
  const messageNode = el("villagerMessage");
  const tagNode = el("villagerTag");
  const sourceNode = el("villagerSource");
  messageNode.textContent = message.text;
  if (message.quote) {
    feed.classList.add("is-quote");
    feed.classList.remove("is-situation");
    tagNode.textContent = "Voix de la cite";
    sourceNode.textContent = "— Un habitant";
  } else {
    feed.classList.add("is-situation");
    feed.classList.remove("is-quote");
    tagNode.textContent = "Chroniques";
    sourceNode.textContent = "";
  }
  feed.classList.remove("message-bump");
  void feed.offsetWidth;
  feed.classList.add("message-bump");
}

function villagerMessage(r) {
  const stage = mapStage();
  const age = Math.floor((Date.now() - state.cycleStartedAt) / 1000);
  const cityName = state.cityName || "NomVille";
  const messages = [];
  const quote = (text) => ({ text, quote: true });
  const situation = (text) => ({ text, quote: false });

  if (state.instability >= 1 || state.timeWear >= 1) {
    messages.push(situation(`Des familles quittent ${cityName} avec quelques sacs et beaucoup de silence.`));
    messages.push(quote(`Je ne veux pas que mes enfants voient ${cityName} tomber.`));
    messages.push(quote("On a obei, on a travaille, et maintenant on nous demande encore d'attendre."));
    messages.push(situation(`Les places de ${cityName} se vident avant la tombee de la nuit.`));
  } else if (state.instability >= 0.75) {
    messages.push(situation(`Au marche de ${cityName}, on parle moins fort quand la garde passe.`));
    messages.push(quote("Les greniers montent, les murs montent, mais nos vies ne montent pas avec."));
    messages.push(quote(`Je ne reconnais plus ${cityName}. Tout coute plus cher, meme le calme.`));
    messages.push(situation(`Dans ${cityName}, les voisins se disputent pour des choses qui semblaient petites hier.`));
  } else if (state.timeWear >= 0.75) {
    messages.push(situation(`Les vieux de ${cityName} racontent les memes histoires, mais plus personne n'est sur des noms.`));
    messages.push(quote("J'ai repare ce mur trois fois. Cette fois, il ne veut plus tenir."));
    messages.push(quote(`On dit que ${cityName} est solide, mais tout craque quand il pleut.`));
    messages.push(situation(`On repare encore les toits de ${cityName}, pourtant chacun voit que les fondations fatiguent.`));
  } else if (r.food > r.gold && r.food > r.knowledge) {
    messages.push(situation(`Les greniers de ${cityName} se remplissent. Les retours des champs sont plus legers.`));
    messages.push(quote("Ce soir, personne ne dormira le ventre vide."));
    messages.push(quote(`A ${cityName}, on travaille dur, mais au moins les enfants mangent.`));
    messages.push(situation(`A ${cityName}, on manque de bras aux meules, mais personne ne se plaint vraiment.`));
  } else if (r.gold > r.knowledge) {
    messages.push(situation(`Les marchands reviennent a ${cityName} avec du sel, des tissus et des histoires arrangees.`));
    messages.push(quote("J'ai vendu plus cette semaine que mon pere en une saison."));
    messages.push(quote(`Si les routes restent ouvertes, ${cityName} ne manquera de rien.`));
    messages.push(situation(`A ${cityName}, il y a plus de bruit autour des etals que devant le temple.`));
  } else if (r.knowledge > 0) {
    messages.push(situation(`Les enfants de ${cityName} repetent les lettres dans la poussiere devant l'ecole.`));
    messages.push(quote("Je veux apprendre a compter les saisons avant qu'elles nous surprennent."));
    messages.push(quote(`Un jour, quelqu'un lira le nom de ${cityName} et saura que nous avons existe.`));
    messages.push(situation(`Un scribe de ${cityName} a note les reserves du mois. Les anciens trouvent ca un peu pretentieux.`));
  }

  if (stage <= 1) messages.push(situation(`Le feu central de ${cityName} attire encore tout le monde a la tombee du soir.`));
  if (stage >= 6) messages.push(situation(`La grande place de ${cityName} reste animee longtemps apres le coucher du soleil.`));
  if (stage >= 12) messages.push(situation(`Certains habitants de ${cityName} n'ont jamais vu l'autre bout de la cite.`));
  if (state.population > 10000) messages.push(quote("Je croise chaque jour des gens d'ici que je n'ai jamais vus."));
  if (state.instability < 0.35 && state.timeWear < 0.35) {
    messages.push(quote(`Pour l'instant, ${cityName} tient bon. On peut respirer.`));
    messages.push(situation(`Les rues de ${cityName} gardent un rythme calme et regulier.`));
  }
  if (!messages.length) messages.push(situation(`La journee avance tranquillement. Pour l'instant, ${cityName} tient.`));

  return messages[Math.floor(age / 24) % messages.length];
}

function renderBabelStatus() {
  const row = el("babelStatusRow");
  if (!row) return;
  const isBabel = state.activeMythId === "mythe_de_babel";
  row.classList.toggle("hidden", !isBabel);
  if (!isBabel) return;
  const catEl  = el("babelCategoryValue");
  const multEl = el("babelMultValue");
  if (catEl)  catEl.textContent  = BABEL_CAT_LABELS?.[state.babelCategory] || (state.babelCategory || "?");
  if (multEl) multEl.textContent = `x${babelExponentialMult().toFixed(2)}`;
}

function renderAtlasLegitimite() {
  const row = el("atlasLegitimiteRow");
  if (!row) return;
  const hasHeritage = Boolean(state.atlasHeritage);
  row.classList.toggle("hidden", !hasHeritage);
  if (!hasHeritage) return;
  const val = Math.round(state.atlasLegitimite || 50);
  const valEl = el("atlasLegitimiteValue");
  const barEl = el("atlasLegitimiteBar");
  if (valEl) valEl.textContent = `${val}`;
  if (barEl) barEl.style.width = `${val}%`;
}

function renderPhoenixStatus() {
  const row = el("phoenixStatusRow");
  if (!row) return;
  const isPhenix = state.activeMythId === "mythe_du_phenix";
  row.classList.toggle("hidden", !isPhenix);
  if (!isPhenix) return;
  const cycleEl = el("phoenixCycleValue");
  const ruinsEl = el("phoenixRuinsValue");
  const timerEl = el("phoenixTimerValue");
  if (cycleEl) cycleEl.textContent = `Cycle ${state.phoenixCycleCount || 0} / ${PHENIX_CYCLE_COUNT}`;
  if (ruinsEl) ruinsEl.textContent = `${fmt(state.phoenixTotalRuins || 0)} / ${PHENIX_RUIN_TARGET} ruines`;
  if (timerEl) {
    const remaining = state.phoenixNextForceAt ? Math.max(0, state.phoenixNextForceAt - Date.now()) : 0;
    const mins = Math.floor(remaining / 60_000);
    const secs = Math.floor((remaining % 60_000) / 1_000);
    timerEl.textContent = remaining > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : "—";
  }
}

function renderAutoScript() {
  const tab = el("autoScriptTab");
  if (tab) tab.classList.toggle("hidden", !state.phoenixHeritage);

  const panel = el("autoScriptPanel");
  if (!panel || !state.phoenixHeritage) return;

  const rules = getAutoScriptRules();
  const sig   = rules.map((r) => `${r.id}:${r.threshold}:${r.enabled ? 1 : 0}`).join("|");
  if (panel.dataset.sig === sig) return;
  panel.dataset.sig = sig;

  panel.innerHTML = rules.map((r) => `
    <div class="options-row auto-script-rule">
      <div>
        <span class="auto-script-label">${r.label}</span>
        <div class="auto-script-threshold">
          <input type="number" class="auto-script-input" value="${r.threshold}" min="1" max="9999"
                 onchange="setAutoScriptThreshold('${r.id}', this.value)"
                 oninput="setAutoScriptThreshold('${r.id}', this.value)">
          <span class="auto-script-unit">${r.unit}</span>
        </div>
      </div>
      <button type="button" class="toggle-btn${r.enabled ? "" : " off"}"
              onclick="toggleAutoScriptRule('${r.id}')">
        ${r.enabled ? "Actif" : "Inactif"}
      </button>
    </div>
  `).join("");
}

function renderHephStatus() {
  const row = el("hephStatusRow");
  if (!row) return;
  const isHeph = state.activeMythId === "mythe_d_hephaistos";
  row.classList.toggle("hidden", !isHeph);
  if (!isHeph) return;
  const infraEl = el("hephInfraValue");
  const popEl   = el("hephPopValue");
  const lockEl  = el("hephCrisisLock");
  const infraFactor = hephInfraMult();
  const peak = Math.max(1, state.hephPopPeak || state.population);
  const decline = Math.max(0, 1 - state.population / peak);
  const locked = state.population < HEPH_POP_CRISIS_THRESHOLD;
  if (infraEl) infraEl.textContent = `Infra x${infraFactor.toFixed(2)} | ${fmt(Math.floor(state.infrastructure))} / ${HEPH_INFRA_TARGET}`;
  if (popEl)   popEl.textContent   = `Pop -${Math.round(decline * 100)}% (pic ${fmt(Math.floor(peak))})`;
  if (lockEl) {
    lockEl.textContent = locked ? "Crises IRRESOLUBLES" : "";
    lockEl.style.display = locked ? "" : "none";
  }
}

function renderAutomates() {
  const tab = el("automatesTab");
  if (tab) tab.classList.toggle("hidden", !state.hephHeritage);

  const panel = el("automatesPanel");
  if (!panel || !state.hephHeritage) return;

  const rules = getAutomateRules();
  const sig   = rules.map((r) => `${r.id}:${r.threshold ?? ""}:${r.enabled ? 1 : 0}`).join("|");
  if (panel.dataset.sig === sig) return;
  panel.dataset.sig = sig;

  panel.innerHTML = rules.map((r) => {
    const hasThreshold = r.type === "crisis_action";
    return `
      <div class="options-row auto-script-rule">
        <div>
          <span class="auto-script-label">${r.label}</span>
          ${hasThreshold ? `
          <div class="auto-script-threshold">
            <input type="number" class="auto-script-input" value="${r.threshold}" min="1" max="99"
                   onchange="setAutomateThreshold('${r.id}', this.value)"
                   oninput="setAutomateThreshold('${r.id}', this.value)">
            <span class="auto-script-unit">${r.unit}</span>
          </div>` : ""}
        </div>
        <button type="button" class="toggle-btn${r.enabled ? "" : " off"}"
                onclick="toggleAutomate('${r.id}')">
          ${r.enabled ? "Actif" : "Inactif"}
        </button>
      </div>
    `;
  }).join("");
}

function renderOrStatus() {
  const row = el("orStatusRow");
  if (!row) return;
  const isOr = state.activeMythId === "mythe_age_or";
  row.classList.toggle("hidden", !isOr);
  if (!isOr) return;
  const goldEl  = el("orGoldValue");
  const popEl   = el("orPopValue");
  const imbalEl = el("orImbalValue");
  if (goldEl)  goldEl.textContent  = `${fmt(Math.floor(state.gold))} / ${fmt(OR_GOLD_TARGET)}`;
  if (popEl)   popEl.textContent   = `pop max ${fmt(Math.floor(state.orPopPeak || state.population))} / ${OR_POP_CAP}`;
  if (imbalEl) {
    imbalEl.textContent = state.orUsureImbalance ? "Desequilibre! x3" : "Equilibre";
    imbalEl.style.color = state.orUsureImbalance ? "#e07050" : "#80c080";
  }
}

function renderSisypheMult() {
  const row = el("sisypheMultRow");
  if (!row) return;
  const isSisyphe = state.activeMythId === "mythe_de_sisyphe";
  row.classList.toggle("hidden", !isSisyphe);
  if (!isSisyphe) return;
  const valEl = el("sisypheMultValue");
  if (valEl) valEl.textContent = `x${fmt(state.sisypheMult || 1)}`;
}

function renderIcareTimer() {
  const row = el("icareTimerRow");
  if (!row) return;
  const isIcare = state.activeMythId === "mythe_d_icare";
  row.classList.toggle("hidden", !isIcare);
  if (!isIcare) return;
  const elapsed = Math.floor((Date.now() - (state.cycleStartedAt || Date.now())) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const valEl = el("icareTimerValue");
  if (valEl) valEl.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function renderSurchauffe() {
  const btn = el("surchauffeBtn");
  if (!btn) return;
  const hasHeritage = Boolean(state.icareHeritage);
  btn.classList.toggle("hidden", !hasHeritage);
  if (!hasHeritage) return;
  const now = Date.now();
  const isActive   = state.surchauffeEndTime && now < state.surchauffeEndTime;
  const onCooldown = state.surchauffeCooldownEnd && now < state.surchauffeCooldownEnd;
  btn.disabled = Boolean(isActive || onCooldown || gamePaused || collapseInProgress);
  if (isActive) {
    const remaining = Math.ceil((state.surchauffeEndTime - now) / 1000);
    btn.textContent = `Surchauffe active (${remaining}s)`;
    btn.classList.add("surchauffe-active");
  } else if (onCooldown) {
    const remaining = Math.ceil((state.surchauffeCooldownEnd - now) / 1000);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    btn.textContent = `Surchauffe (${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`})`;
    btn.classList.remove("surchauffe-active");
  } else {
    btn.textContent = "Surchauffe";
    btn.classList.remove("surchauffe-active");
  }
}

function openView(viewId) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewId));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  el("buyToolbar")?.classList.toggle("hidden", viewId !== "city");
  document.querySelector(".app")?.setAttribute("data-active-view", viewId);
}

// Accepte les valeurs précalculées depuis render() pour éviter des appels redondants
function renderCrisisSummary(ruinGainVal = ruinGain(), legitGain = legitimacyGain()) {
  el("crisisRupture").textContent = pct(state.instability);
  el("crisisWear").textContent = pct(state.timeWear);
  el("crisisReadyText").textContent = state.instability >= 1 ? "Rupture structurelle ouverte" : `Encore ${fmt(Math.max(0, (1 - state.instability) * 100))} pts avant la rupture`;
  el("crisisWearText").textContent = state.timeWear >= 1 ? "Usure historique ouverte" : `Encore ${fmt(Math.max(0, (1 - state.timeWear) * 100))} pts avant l'usure`;
  el("terminalCrisisState").textContent = crisisOpen()
    ? `Crise ouverte: ${fmt(ruinGainVal)} ruines maintenant, ${heritageQuality().toLowerCase()}, ${fmt((state.collapsePreparation || 0) * 100)}% d'heritage prepare.`
    : "Disponible quand Rupture ou Usure atteint 100%. Ces choix deviennent alors une alternative a l'effondrement immediat.";

  // Banner d'urgence et preview effondrement
  el("crisisOutcomePanel")?.classList.toggle("crisis-live", crisisOpen() && state.crisisLimitAnnounced);
  const alertEl = el("crisisAlert");
  const previewEl = el("collapsePreview");
  if (alertEl) {
    const active = crisisOpen() && state.crisisLimitAnnounced;
    alertEl.classList.toggle("hidden", !active);
    if (active) {
      const source = (state.timeWear || 0) >= 1 ? "l'usure du temps" : "la rupture";
      el("crisisAlertTitle").textContent = `La cite s'est brisee sous ${source}.`;
      el("crisisAlertDesc").textContent = `Lance l'effondrement pour recuperer ${fmt(ruinGainVal)} ruines, ou prepare d'abord la chute pour en tirer davantage.`;
    }
  }
  if (previewEl) {
    const active = crisisOpen();
    previewEl.classList.toggle("hidden", !active);
    if (active) {
      el("collapseRuinsPreview").textContent = fmt(ruinGainVal);
      el("collapseQualityPreview").textContent = `Qualite: ${heritageQuality().toLowerCase()}`;
    }
  }

  const countdownEl = el("autoCollapseCountdown");
  if (countdownEl) {
    const hasTier1 = has("intendant_de_crise");
    if (state.crisisLimitAnnounced && hasTier1 && state.crisisOpenedAt) {
      const delay = autoCollapseDelay();
      const remaining = Math.max(0, delay - (Date.now() - state.crisisOpenedAt));
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      countdownEl.textContent = `Effondrement automatique dans ${mins}:${secs.toString().padStart(2, "0")}`;
      countdownEl.classList.remove("hidden");
    } else {
      countdownEl.classList.add("hidden");
    }
  }

  const dynastyRuinsNeed = Math.max(0, 300 - state.ruins);
  el("dynastyRequirement").textContent = "300 ruines";
  el("dynastyProgress").textContent = legitGain > 0
    ? `+${fmt(legitGain)} legitimite possible`
    : `Manque ${fmt(dynastyRuinsNeed)} ruines`;
  const activeDoctrine = DOCTRINES.find((d) => d.id === state.dynastyDoctrine);
  el("dynastyDoctrineLabel").textContent = activeDoctrine ? activeDoctrine.name : "Aucune doctrine";
  el("dynastyDoctrineDesc").textContent = activeDoctrine ? `${activeDoctrine.bonus} | ${activeDoctrine.penalty}` : "A choisir lors de la prochaine fondation";

}

function renderCityState(vitals) {
  const foodScore = vitals.foodScore;
  const goldScore = vitals.goldScore;
  const knowledgeScore = vitals.knowledgeScore;

  el("foodBar").style.width = `${clamp01(foodScore) * 100}%`;
  el("goldBar").style.width = `${clamp01(goldScore) * 100}%`;
  el("knowledgeBar").style.width = `${clamp01(knowledgeScore) * 100}%`;

  el("foodMood").textContent = mood(foodScore, ["Famine proche", "Greniers modestes", "Surplus rassurant", "Abondance"]);
  el("goldMood").textContent = mood(goldScore, ["Troc local", "Bourses maigres", "Commerce actif", "Tresor florissant"]);
  el("knowledgeMood").textContent = mood(knowledgeScore, ["Traditions orales", "Archives naissantes", "Savoirs partages", "Culture savante"]);
  el("foodEffect").textContent = `Croissance pop ${multLabel(vitals.populationMult)} · pression -${fmt(clamp01(foodScore - 0.92) * 1.8)} pts`;
  el("goldEffect").textContent = `Tresor ${multLabel(vitals.goldMult)} · infrastructure ${multLabel(vitals.infraMult)}`;
  el("knowledgeEffect").textContent = `Savoir ${multLabel(vitals.knowledgeMult)} · pression -${fmt(vitals.instabilityRelief * 100)} pts`;
}

function mood(value, labels) {
  if (value >= 0.95) return labels[3];
  if (value >= 0.45) return labels[2];
  if (value >= 0.12) return labels[1];
  return labels[0];
}

function renderTensions(pressure) {
  renderTensionSummary(pressure);
  const entries = [
    ["scarcity", pressure.scarcity, 0.7],
    ["inequality", pressure.inequality, 0.55],
    ["complexity", pressure.complexity, 0.75],
    ["dissent", pressure.dissent, 0.55]
  ];

  for (const [id, value, max] of entries) {
    el(`${id}Value`).textContent = pct(value);
    el(`${id}Bar`).style.width = `${Math.min(1, value / max) * 100}%`;
  }

  const costs = crisisCosts();
  const buttons = [
    ["rationBtn", "rationCost", "rationing"],
    ["festivalBtn", "festivalCost", "festivals"],
    ["censusBtn", "censusCost", "census"],
    ["reformBtn", "reformCost", "reforms"],
    ["archiveCrisisBtn", "archiveCrisisCost", "archiveCrisis"],
    ["ancestorCrisisBtn", "ancestorCrisisCost", "ancestorCrisis"]
  ];
  for (const [buttonId, costId, actionId] of buttons) {
    const unlocked = actionId === "archiveCrisis" ? state.cycles >= 2 : actionId === "ancestorCrisis" ? state.cycles >= 3 : true;
    el(buttonId).classList.toggle("hidden", !unlocked);
    if (!unlocked) continue;
    el(costId).textContent = costLabel(costs[actionId]);
    el(buttonId).disabled = !canPayCost(costs[actionId]);
  }
}

function renderTensionSummary(pressure) {
  const causes = [
    ["Subsistance", pressure.scarcity],
    ["Inegalites", pressure.inequality],
    ["Complexite", pressure.complexity],
    ["Dissidence", pressure.dissent],
    ["Structures", pressure.structural]
  ];
  const [mainCause, mainValue] = causes.reduce((best, current) => current[1] > best[1] ? current : best, ["Aucune", 0]);
  const drift = pressure.total - state.instability;

  el("tensionCurrent").textContent = pct(state.instability);
  el("tensionWear").textContent = pct(state.timeWear);
  el("tensionTarget").textContent = pct(pressure.total);
  el("tensionMitigation").textContent = pct(pressure.mitigation);
  el("tensionWearDrift").textContent = state.timeWear >= 1
    ? "L'usure a ouvert une crise"
    : `+${fmt(timeWearRate() * 100)} pts/s, meme hors ligne`;
  el("tensionDrift").textContent = Math.abs(drift) < 0.02
    ? "Tendance stable"
    : drift > 0
      ? `Monte vers ${pct(pressure.total)}`
      : `Redescend vers ${pct(pressure.total)}`;
  el("tensionMainCause").textContent = mainValue > 0.01 ? `Cause principale: ${mainCause}` : "Cause principale: aucune";
  el("tensionAdvice").textContent = tensionAdvice(mainCause, pressure);
}

function tensionAdvice(mainCause, pressure) {
  if (crisisOpen()) return "La crise est ouverte: choisis une issue dans Crises.";
  if (mainCause === "Subsistance") return "Augmente les reserves ou rationne avant que la faim politise la cite.";
  if (mainCause === "Inegalites") return "Le commerce enrichit la cite: festivals ou institutions peuvent absorber le choc.";
  if (mainCause === "Complexite") return "Ajoute infrastructure, recensement ou reformes pour suivre la croissance.";
  if (mainCause === "Dissidence") return "Les cycles parlent encore: rites, archives et legitimite aident.";
  if (pressure.mitigation < 0.05 && totalBuildingCount() > 8) return "La cite manque d'amortisseurs institutionnels.";
  return "La cite est encore lisible: tu peux pousser la croissance.";
}

function renderLog() {
  const signature = `${state.history.length}:${state.history[0] || ""}`;
  if (signature === renderedLogSignature) return;
  renderedLogSignature = signature;
  const root = el("log");
  root.innerHTML = "";
  for (const entry of state.history) {
    const li = document.createElement("li");
    li.textContent = entry;
    root.appendChild(li);
  }
}


function renderElementArchive() {
  const sig = buildings.map((b) => `${b.id}:${state.buildings[b.id] || 0}`).join("|")
    + "|w:" + (Array.isArray(state.wonders) ? state.wonders.join(",") : "");
  if (sig === renderedArchiveSignature) return;
  renderedArchiveSignature = sig;

  for (const [cat, listId] of [["city", "archiveMoteurList"], ["knowledge", "archiveSavoirList"], ["infra", "archiveInfraList"]]) {
    const list = el(listId);
    if (!list) continue;
    list.innerHTML = "";
    let any = false;
    for (const b of buildings.filter((b) => b.category === cat)) {
      const count = state.buildings[b.id] || 0;
      if (count < 1) continue;
      for (const entry of (BUILDING_LORE[b.id] || [])) {
        if (count >= entry.at) { list.appendChild(createLoreCard(b.name, entry.label, entry.text)); any = true; }
      }
    }
    if (!any) {
      const empty = document.createElement("p");
      empty.className = "archive-empty";
      empty.textContent = "Aucune trace encore. Les premières constructions révèlent leurs secrets.";
      list.appendChild(empty);
    }
  }

  const merList = el("archiveMerveillesList");
  if (merList) {
    merList.innerHTML = "";
    const wonders = Array.isArray(state.wonders) ? state.wonders : [];
    const earned = WONDER_LORE.filter((w) => wonders.includes(w.id));
    if (earned.length) {
      for (const w of earned) merList.appendChild(createLoreCard(w.name, "Merveille érigée", w.text));
    } else {
      const empty = document.createElement("p");
      empty.className = "archive-empty";
      empty.textContent = "Aucune merveille n'a encore été érigée. Les grandes œuvres demandent du temps.";
      merList.appendChild(empty);
    }
  }
}

function createLoreCard(title, label, text) {
  const article = document.createElement("article");
  article.className = "archive-entry";
  const header = document.createElement("header");
  const h3 = document.createElement("h3");
  const chip = document.createElement("span");
  const p = document.createElement("p");
  h3.textContent = title;
  chip.className = "chip";
  chip.textContent = label;
  p.textContent = text;
  header.append(h3, chip);
  article.append(header, p);
  return article;
}

function renderCivilization(eraIndex, dynastyIndex) {
  // La carte de l'onglet Cite est rendue par un moteur Canvas autonome (citymap.js,
  // boucle requestAnimationFrame). On lui transmet seulement la teinte de dynastie.
  if (typeof cityMapSetDynasty === "function") cityMapSetDynasty(dynastyIndex);
}
