// JOUEUR SCRIPTÉ du harnais de parcours (audit 2026-10-05, TEST-1) : une
// politique générique + une tactique par Mythe, avec les vraies actions du jeu.
//
// Fidèle à l'interface : un bouton n'est cliqué qu'au pas où il est ACTIF (ÉPAULER
// d'Atlas : récupération à 0, comme `disabled={atlasCdLeft > 0}` de CityView).
// Doctrine de crise « auto » (postures Stabiliser du Conseil de crise) ou « ask »
// (chaque crise narrative ouvre sa fenêtre) ; `dialogMs` donne aux fenêtres une
// durée NON NULLE — la partie est en pause pendant ce temps, mais l'horloge
// murale tourne (fenêtre du Phénix, chrono du Ragnarök…). Le harnais de l'audit
// les résolvait en temps nul.
import { settle, roundTrip, vtSec, fmtT } from "./harness.js";
// balance.js n'importe rien : le lire ici ne charge pas le jeu avant setupEnv.
import { ICARUS_SEAL_MULT, ICARUS_SEAL_STAKE_SHARE } from "../../balance.js";

export const MYTH_IDS = [
  "mythe_du_chaos", "mythe_de_promethee", "mythe_d_enee", "mythe_de_cadmos", "mythe_d_hephaistos",
  "mythe_de_sisyphe", "mythe_de_babel", "mythe_age_or",
  "mythe_d_atlas", "mythe_d_icare", "mythe_du_phenix", "mythe_atrides", "mythe_d_antee",
  "mythe_du_ragnarok"
];

const DOGMA_PREF = new Set(["trait_enracinement", "dogma_communal_granaries", "dogma_merchant_law", "dogma_eternal_return", "dogma_free_academies"]);

export function createPlayer(g, opts = {}) {
  const { state } = g.st;
  const A = g.actions;
  const M = g.mech;
  const { D } = g.num;
  const { canPayCost } = g.utils;
  const log = opts.log || (() => {});
  const P = {
    dt: opts.dt || 2,
    holdSec: opts.holdSec ?? 900,          // tenir la Rupture sous 90 % jusqu'à cet âge de cycle
    regThreshold: opts.regThreshold ?? 0.88,
    grPolicy: opts.grPolicy || "greedy",  // greedy | single
    grOrder: opts.grOrder || null,
    mythOrder: opts.mythOrder || MYTH_IDS,
    activeRuinsPolicy: opts.activeRuinsPolicy || "all",
    ragnarokTiming: opts.ragnarokTiming || "afterCollapse", // afterCollapse | atPeak
    noMyths: !!opts.noMyths,
    useAutomation: opts.useAutomation ?? true,
    doctrine: opts.doctrine || "auto",    // auto | ask
    dialogMs: opts.dialogMs ?? 0,         // durée d'une fenêtre de choix (ms virtuelles)
    crisisStance: opts.crisisStance || "stabiliser", // stabiliser | temporiser
    editTemps: !!opts.editTemps,          // Édit d'effondrement sur la durée du cycle
    ragnarokEdit: !!opts.ragnarokEdit,    // garder l'Édit actif pendant le Ragnarök
    icarusHunt: opts.icarusHunt ?? true,
    sisypheBurst: opts.sisypheBurst ?? true,
    fastBuy: opts.fastBuy ?? true,
    noGR: !!opts.noGR,
    ragnarokSmart: opts.ragnarokSmart ?? true,
    survive: !!opts.survive,
    atlasNoClick: !!opts.atlasNoClick,    // Atlas : ni ÉPAULER ni régulation (joueur parti)
    noEdit: !!opts.noEdit                 // Édit d'effondrement éteint : la chute manuelle seule
  };
  const R = {
    milestones: [], cycles: [], offline: [], anomalies: [], roundTrips: [], myth: {}, gr: [], dialogs: {},
    dialogMissingMulti: 0, eras: [], blocked: null, flights: { launched: 0, cashouts: 0, crashes: 0, jackpots: 0 }
  };
  const anomalyKeys = new Set();
  function anomaly(kind, detail) {
    const key = kind + "|" + String(detail).slice(0, 120);
    if (anomalyKeys.has(key)) return;
    anomalyKeys.add(key);
    R.anomalies.push({ t: vtSec(), kind, detail: String(detail).slice(0, 800) });
    log(`!! ${fmtT(vtSec())} ANOMALIE ${kind}: ${String(detail).slice(0, 500)}`);
  }
  function milestone(label, extra = "") {
    R.milestones.push({ t: vtSec(), label, extra });
    log(`== ${fmtT(vtSec())} ${label} ${extra}`);
  }

  // ── Dialogues ────────────────────────────────────────────────────────────
  // Le joueur « lit » la fenêtre pendant dialogMs (horloge virtuelle), puis répond.
  const answer = (choice) => (P.dialogMs > 0
    ? new Promise((resolve) => setTimeout(() => resolve(choice), P.dialogMs))
    : Promise.resolve(choice));
  g.cd.registerChoiceDialog((dialog) => {
    const opts2 = dialog.options || [];
    const title = String(dialog.title || "");
    const variant = dialog.variant || "";
    const key = variant || title.replace(/[0-9]/g, "").slice(0, 30);
    R.dialogs[key] = (R.dialogs[key] || 0) + 1;
    // Ruines actives : le multiSelectOptions doit arriver jusqu'ici (BUG-1).
    if (variant === "active-ruins") {
      if (!dialog.multiSelectOptions) R.dialogMissingMulti++;
      const ids = activeRuinChoice();
      return answer({ ...opts2[0], selectedIds: ids });
    }
    // Épitaphe : le legs qui rapporte le plus de ruines.
    if (opts2.length && opts2.every((o) => o.epitaphLegacyId)) {
      let best = opts2[0];
      for (const o of opts2) if (D(o.ruinGain || 0).gt(best.ruinGain || 0)) best = o;
      return answer(best);
    }
    // Caravanes de l'Âge d'Or.
    if (opts2.some((o) => /Marchander|Haggle/.test(o.label || ""))) {
      const broke = /suffit pas|cannot cover/.test(dialog.body || "");
      const want = broke ? /Refus/ : /Accept/;
      return answer(opts2.find((o) => want.test(o.label || "")) || opts2[opts2.length - 1]);
    }
    // Grand Reset : réclamer.
    if (/^Grand Reset/.test(title)) return answer(opts2.find((o) => /Réclamer/.test(o.label)) || opts2[0]);
    // Crise narrative : l'option qui stabilise (foyer en recul), sinon la 1re.
    if (opts2.length > 1 && opts2.some((o) => typeof o.apply === "function")) {
      if (P.crisisStance === "temporiser") {
        const t = opts2.find((o) => o.stance === "temporiser") || opts2.find((o) => typeof o.foyerShift === "number" && o.foyerShift > 0);
        if (t) return answer(t);
      }
      const stab = opts2.find((o) => o.stance === "stabiliser") || opts2.find((o) => typeof o.foyerShift === "number" && o.foyerShift < 0);
      return answer(stab || opts2.find((o) => typeof o.apply === "function") || opts2[0]);
    }
    return answer(opts2[0]);
  });

  function activeRuinChoice() {
    const defs = g.ar.unlockedActiveRuinDefinitions(state).map((d) => d.id);
    if (state.activeMythId === "mythe_d_antee") return defs; // tous les fardeaux
    if (P.activeRuinsPolicy === "none") return [];
    if (P.activeRuinsPolicy === "safe") return defs.filter((id) => !["phenix", "icare", "atrides"].includes(id));
    return defs;
  }

  // ── Économie ─────────────────────────────────────────────────────────────
  let lastBuyAll = 0;
  function buyBuildings(filter = null) {
    if (M.crisisOpen()) return 0;
    if (!filter) {
      if (!P.fastBuy || Date.now() - lastBuyAll > 300_000) { lastBuyAll = Date.now(); return A.buyAllAffordable(); }
      const list = g.bld.buildings.filter((b) => b.id !== "roads" && M.isUnlocked(b) && ["food", "gold", "knowledge", "infrastructure"].includes(b.currency) && (!b.extraCost || Object.keys(b.extraCost).every((c) => c !== "ruins")))
        .map((b) => ({ b, c: D(M.buildingBatchCost(b, 1)[b.currency]) }))
        .sort((x, y) => (y.c.gt(x.c) ? 1 : y.c.lt(x.c) ? -1 : 0));
      const prev = state.buyAmount; state.buyAmount = "max";
      let n = 0;
      for (const { b } of list) { if (canPayCost(M.buildingBatchCost(b, 1)) && A.buyBuilding(b.id)) n++; }
      state.buyAmount = prev;
      // voirie : son propre guichet
      for (let i = 0; i < 8 && g.rw.buyRoadWorkCore(); i++) n++;
      return n;
    }
    let n = 0;
    for (let pass = 0; pass < 400; pass++) {
      let best = null, bestCost = null;
      for (const b of g.bld.buildings) {
        if (b.id === "roads") continue;
        if (!M.isUnlocked(b) || !filter(b)) continue;
        if (!["food", "gold", "knowledge", "infrastructure"].includes(b.currency)) continue;
        const c = M.buildingBatchCost(b, 1);
        if (!canPayCost(c)) continue;
        if (!best || D(c[b.currency]).lt(bestCost)) { best = b; bestCost = D(c[b.currency]); }
      }
      if (!best) break;
      const prev = state.buyAmount; state.buyAmount = 1;
      const ok = A.buyBuilding(best.id);
      state.buyAmount = prev;
      if (!ok) break;
      n++;
    }
    return n;
  }

  function buyRuinTree() {
    let bought = 0;
    for (let i = 0; i < 60; i++) {
      const avail = g.up.upgrades.filter((u) => u.group === "ruins" && !g.up.dogmaIds.has(u.id) && M.checkNodeAvailability(u.id) === "available")
        .sort((a, b) => M.ruinNodeCost(a) - M.ruinNodeCost(b));
      if (!avail.length) break;
      if (!A.buyUpgrade(avail[0].id)) break;
      bought++;
    }
    for (const d of g.up.PRESTIGE_DOGMAS) {
      if (!DOGMA_PREF.has(d.id)) continue;
      if (M.checkDogmaAvailability(d.id) === "available") { if (A.buyUpgrade(d.id)) bought++; }
    }
    return bought;
  }

  function buyHeritage() {
    for (const u of g.up.upgrades) {
      if (u.group !== "heritage") continue;
      if (M.has(u.id)) continue;
      const reserve = state.grRevealed?.[7] ? 0 : 20000;
      if ((state.faveur || 0) >= (u.cost.faveur || 0) + reserve) A.buyUpgrade(u.id);
    }
  }

  function regulate(limit = P.regThreshold) {
    if (state.crisisLimitAnnounced || M.crisisOpen()) return false;
    if (state.instability < limit) return false;
    const costs = M.crisisCosts();
    for (const id of ["rationing", "festivals", "census", "archiveCrisis", "reforms"]) {
      const c = costs[id];
      if (c && canPayCost(c)) { A.runCrisisAction(id, { render: false }); return true; }
    }
    return false;
  }

  function regulateHard(limit) {
    if (state.crisisLimitAnnounced || M.crisisOpen()) return false;
    const costs = M.crisisCosts();
    // réformes durables d'abord (foyers), puis apaisements
    for (const id of ["reformDissent", "reformComplexity", "reformInequality", "reformScarcity", "stateOracle", "celestialChancery", "evergetism", "cornucopia"]) {
      const c = costs[id]; if (c && canPayCost(c)) A.runCrisisAction(id, { render: false });
    }
    if (state.instability < limit) return false;
    for (const id of ["rationing", "festivals", "census", "archiveCrisis", "reforms", "monumentalFetes", "publicWorks", "stateMecenat", "royalIrrigation", "granariesCommunal", "sumptuaryLaws"]) {
      const c = costs[id]; if (c && canPayCost(c)) { A.runCrisisAction(id, { render: false }); if (state.instability < limit) return true; }
    }
    return false;
  }

  function automation() {
    if (!P.useAutomation) return;
    if (P.doctrine === "auto" && M.has("conseil_de_crise") && state.crisisDoctrine && state.crisisDoctrine.p25 === "ask") {
      for (const p of ["p25", "p50", "p75"]) A.setCrisisPosture(p, "stabiliser");
    }
    if (P.noEdit) {
      if (state.crisisDoctrine?.autoCollapse?.enabled) A.setAutoCollapseConfig({ enabled: false });
    } else if (M.has("edit_effondrement") && state.crisisDoctrine?.autoCollapse && !state.crisisDoctrine.autoCollapse.enabled) {
      A.setAutoCollapseConfig(P.editTemps ? { enabled: true, trigger: "temps", timeSeconds: 2400, prepare: false } : { enabled: true, trigger: "rupture100", prepare: false });
    }
    if (state.hephHeritage) {
      // Automates d'achat TOUJOURS allumés, Âge d'Or compris : depuis la correction
      // d'AGE-OR-AUTOMATES (audit du 05/10), l'automate attend que le moins cher
      // soit payable au lieu de vider l'Or sur un plus cher — les caravanes se
      // paient sans couper quoi que ce soit, comme avant le lot 5.
      for (const r of A.getAutomateRules()) if (r.type === "buy_cheapest" && !r.enabled) A.toggleAutomate(r.id);
    }
  }

  // ── Icare : chasse au sceau VII ──────────────────────────────────────────
  // Depuis BUG-40 (choix b de Raph), le sceau veut un vol posé à ×25 ou plus, mise
  // d'au moins la moitié de la salle commune : le joueur mise cette moitié dès que
  // sa Faveur la couvre, et vise ×25.
  function icarusHunt() {
    if (!P.icarusHunt) return;
    if (state.grRevealed && state.grRevealed[7]) return;
    if (A.icarusFlying()) {
      const m = A.icarusMultiplier();
      if (m >= ICARUS_SEAL_MULT + 0.01) {
        const o = A.cashOutIcarus();
        if (o && o.type === "cashout") {
          R.flights.cashouts++;
          if (o.jackpotFaveur) { R.flights.jackpots++; milestone("JACKPOT ICARE", `×${o.m} +${o.jackpotFaveur} faveur`); }
        } else R.flights.crashes++;
      }
      return;
    }
    if (g.st.gamePaused || state.crisisLimitAnnounced) return;
    if (!A.icarusUnlocked()) return;
    const lim = A.tableLimits();
    const stake = Math.max(lim.min, Math.ceil(lim.base * ICARUS_SEAL_STAKE_SHARE));
    if ((state.faveur || 0) < stake || stake > lim.max) return;
    if (A.launchIcarus(stake)) R.flights.launched++;
  }

  // ── Grand Reset ──────────────────────────────────────────────────────────
  async function maybeGrandReset() {
    if (state.activeMythId || P.noGR) return false;
    const claimable = M.GRAND_RESET_MILESTONES.filter((m) => M.isGrandResetMilestoneClaimable(m.gr)).map((m) => m.gr);
    if (!claimable.length) return false;
    let seals = claimable;
    if (P.grOrder) {
      // ordre imposé : on ne réclame que le prochain de la liste s'il est prêt
      const next = P.grOrder.find((n) => !M.isGrandResetMilestoneClaimed(n));
      if (next == null) seals = claimable; else if (claimable.includes(next)) seals = [next]; else return false;
    } else if (P.grPolicy === "single") seals = [claimable[0]];
    const before = state.grandResetCount || 0;
    await settle(A.performGrandReset(seals));
    if ((state.grandResetCount || 0) > before) {
      R.gr.push({ t: vtSec(), seals, count: state.grandResetCount });
      milestone(`GRAND RESET → ${state.grandResetCount}`, `sceaux ${seals.join(",")}`);
      return true;
    }
    anomaly("gr-refus", `performGrandReset(${seals}) n'a rien fait (paused=${g.st.gamePaused})`);
    return false;
  }

  // ── Mythes ───────────────────────────────────────────────────────────────
  let mythState = {};
  function nextMyth() {
    if (P.noMyths) return null;
    const cands = P.mythOrder.filter((id) => { const m = g.myth.getMythById(id); return m && !g.myth.isMythCompleted(id) && g.myth.isMythUnlocked(m); });
    if (!cands.length) return null;
    if (cands.length > 1) {
      // on écarte le mythe qui vient d'échouer 3 fois d'affilée s'il y a une alternative
      const fresh = cands.filter((id) => ((R.myth[id] && R.myth[id].streak) || 0) < 3);
      const pick = fresh.length ? fresh[0] : cands.sort((a, b) => ((R.myth[a]?.streak || 0) - (R.myth[b]?.streak || 0)))[0];
      if (!fresh.length) for (const id of cands) if (R.myth[id]) R.myth[id].streak = 0;
      return g.myth.getMythById(pick);
    }
    return g.myth.getMythById(cands[0]);
  }
  async function maybeActivateMyth(cycleAge) {
    if (state.activeMythId) return;
    const m = nextMyth();
    if (!m) return;
    if (m.id === "mythe_du_ragnarok" && P.ragnarokTiming === "atPeak") {
      if (!(cycleAge >= 900 || (cycleAge >= 150 && state.instability >= 0.9 && !state.crisisLimitAnnounced))) return;
    } else if (cycleAge > 20) return; // on scelle un pacte en début de cycle
    const rec = R.myth[m.id] || (R.myth[m.id] = { attempts: 0, firstAt: vtSec(), log: [] });
    rec.attempts++;
    mythState = { id: m.id, startedAt: vtSec() };
    await settle(A.activateMyth(m.id, m.id === "mythe_de_babel" ? { babelCategory: "city" } : {}));
    if (state.activeMythId !== m.id) { anomaly("myth-activation", `${m.id} non activé`); return; }
    milestone(`MYTHE activé ${m.id}`, `essai ${rec.attempts}`);
  }

  function mythTactic(cycleAge) {
    const id = state.activeMythId;
    if (id && mythState.id === id) mythState.snap = { age: cycleAge | 0, inst: +(state.instability || 0).toFixed(3), wear: +(state.timeWear || 0).toFixed(3), terminal: !!state.crisisLimitAnnounced, cran: state.sisypheCran, montees: state.sisypheMontees, fardeau: Math.round(state.atlasFardeau || 0), epaules: state.atlasEpaules, crushed: state.atlasCrushed, phx: state.phoenixRenaissances, atr: state.atridesReached, debt: Math.round(state.atridesDebt || 0), alt: state.icareAltitude, hold: Math.round(state.icareHoldSec || 0) };
    if (!id) return "normal";
    switch (id) {
      case "mythe_de_promethee": {
        const foodRate = D(M.rates().food);
        if (state.instability < 0.6 && foodRate.lt(0)) buyBuildings((b) => b.food > 0);
        buyBuildings((b) => !(b.food > 0));
        regulate(0.7);
        return "custom";
      }
      case "mythe_d_enee":
        if (state.eneeDegraded) A.migrerEnee();
        if (P.survive) {
          for (const pol of ["paxDivina", "martialLaw"]) if (!(state.activePolicies || []).includes(pol) && (state.activePolicies || []).length < 2 && M.regulationPolicyUnlocked(pol)) A.togglePolicy(pol);
          if (state.crisisDoctrine?.autoCollapse?.enabled) A.setAutoCollapseConfig({ enabled: false });
          buyBuildings((b) => b.category === "infra");
          regulateHard(0.75);
          return "custom";
        }
        regulate(0.85);
        return "hold";
      case "mythe_d_hephaistos":
        buyBuildings((b) => b.category === "infra");
        regulate(0.85);
        return "hold";
      case "mythe_de_sisyphe": return sisypheTactic();
      case "mythe_de_babel":
        regulate(0.85);
        return "hold";
      case "mythe_age_or":
        return "orDeal";
      case "mythe_d_atlas":
        // Joueur parti : le ciel écrase la cité, la Rupture monte jusqu'à la crise
        // terminale, dont seule la chute manuelle sort sans Édit (ATLAS-ECRASE).
        if (P.atlasNoClick) return "hold";
        // Bouton ÉPAULER actif (récupération à 0) et ciel lourd : on clique.
        if ((state.atlasShoulderCdTicks || 0) === 0 && (state.atlasFardeau || 0) >= g.myth.ATLAS_COUNT_THRESHOLD) A.atlasEpauler();
        regulate(0.85);
        return "hold";
      case "mythe_d_icare": {
        // TENIR l'altitude 5 pendant 2 min de jeu (BUG-41) : la Rupture monte
        // alors au plafond. Freins permanents d'abord (politiques), montée d'une
        // traite au creux de la jauge, puis régulation serrée jusqu'au sacre.
        for (const pol of ["paxDivina", "martialLaw"]) if (!(state.activePolicies || []).includes(pol) && (state.activePolicies || []).length < 2 && M.regulationPolicyUnlocked(pol)) A.togglePolicy(pol);
        if ((state.icareAltitude || 0) < 5 && !state.crisisLimitAnnounced && state.instability <= 0.1) {
          while ((state.icareAltitude || 0) < 5) { const a = state.icareAltitude || 0; A.icareClimb(); if ((state.icareAltitude || 0) === a) break; }
        }
        regulateHard(0.8);
        return "hold";
      }
      case "mythe_du_phenix": return phenixTactic();
      case "mythe_atrides":
        if (Date.now() >= (state.atridesRenegotiateCooldownEnd || 0)) A.renegocierAtridesDebt();
        buyBuildings((b) => b.currency !== "gold");
        regulate(0.85);
        return "custom";
      case "mythe_d_antee":
        regulate(0.85);
        return "hold";
      case "mythe_du_ragnarok":
        if (P.ragnarokSmart) {
          if (state.crisisDoctrine?.autoCollapse?.enabled && !P.ragnarokEdit) A.setAutoCollapseConfig({ enabled: false });
          for (const pol of ["paxDivina", "martialLaw"]) if (!(state.activePolicies || []).includes(pol) && (state.activePolicies || []).length < 2 && M.regulationPolicyUnlocked(pol)) A.togglePolicy(pol);
        }
        A.ragnarokOffrir();
        if (state.orHeritage && cycleAge > 60) {
          // Comptoir : convertir l'or en ressource la plus en retard sur l'Arche
          const cost = A.ragnarokOfferingCost();
          for (const k of ["food", "knowledge", "infrastructure"]) {
            if (D(state[k]).lt(cost[k]) && D(state.gold).gt(D(cost.gold).mul(2))) A.comptoirBuy(k);
          }
        }
        regulate(0.9);
        return "normal";
      default:
        regulate(0.85);
        return "hold";
    }
  }

  // La matière dont le prix courant pèse le moins sur son stock, ou null.
  function cheapestSisypheMaterial() {
    const base = g.myth.SISYPHE_STEP_BASE;
    const us = state.sisypheUsages || {};
    let best = null, bestRatio = Infinity;
    for (const k of Object.keys(base)) {
      const cost = base[k] * Math.pow(2, us[k] || 0);
      if (D(state[k]).lt(cost)) continue;
      const ratio = cost / Math.max(1, Number(D(state[k]).toNumber()));
      if (ratio < bestRatio) { bestRatio = ratio; best = k; }
    }
    return best;
  }
  function sisypheTactic() {
    const need = { food: 5000 * 3, knowledge: 1000 * 3, infrastructure: 120 * 3 };
    const ready = Object.entries(need).every(([k, v]) => D(state[k]).gte(v * 1.05));
    if ((state.sisypheCran || 0) === 0 && !ready) { buyBuildings(() => true); regulate(0.85); return "custom"; }
    const best = cheapestSisypheMaterial();
    if (best) A.sisyphePousser(best);
    if (P.sisypheBurst) {
      for (let i = 0; i < 6 && (state.sisypheCran || 0) > 0; i++) {
        const next = cheapestSisypheMaterial();
        if (!next) break;
        A.sisyphePousser(next);
      }
    }
    regulate(0.85);
    return "custom";
  }

  // La fenêtre du Phénix se compte en temps de jeu NON PAUSÉ (phoenixCycleSec,
  // BUG-38), plus en âge mural du cycle : les fenêtres de crise ne la mangent plus.
  function phenixTactic() {
    buyBuildings(() => true);
    const target = D(state.phoenixRebirthTargetPop || 0);
    const peak = D(state.cyclePeaks?.population || state.population);
    const windowSec = g.myth.PHENIX_REBIRTH_WINDOW_MS / 1000;
    const played = state.phoenixCycleSec || 0;
    // Monter (Aile) pour embraser la Rupture en fin de fenêtre si l'objectif de pop est là.
    if (state.icareHeritage && played >= windowSec - 80 && played <= windowSec - 5 && peak.gte(target) && !M.crisisOpen()) {
      if ((state.icareAltitude || 0) < 12 && state.instability < 0.99) A.icareClimb();
    }
    if (M.crisisOpen() && played <= windowSec) return "collapseNow";
    return "custom";
  }

  // ── Boucle d'action par pas ──────────────────────────────────────────────
  let sinceBuy = 0, sinceHouse = 0, sinceOr = 0, terminalSince = null;

  async function act(dt) {
    if (g.st.gamePaused || g.st.collapseInProgress || state.mourning) return;
    const now = Date.now();
    const cycleAge = (now - (state.cycleStartedAt || now)) / 1000;
    sinceBuy += dt; sinceHouse += dt; sinceOr += dt;

    if (sinceHouse >= 10) {
      sinceHouse = 0;
      const tv = A.trunkValue(), cap = A.trunkCap();
      if (tv >= cap * 0.9) A.collectTrunk({ silent: true, render: false });
      buyRuinTree();
      buyHeritage();
      automation();
      if (g.vows.cycleVowChoosable(state) && state.cycleVow?.offered?.length && !state.cycleVow.chosen) g.main.chooseCycleVow(state.cycleVow.offered[0].id);
      if (await maybeGrandReset()) return;
      await maybeActivateMyth(cycleAge);
      if (g.st.gamePaused) return;
    }

    icarusHunt();

    const mode = mythTactic(cycleAge);
    if (mode === "orDeal" && sinceOr >= 15) {
      sinceOr = 0;
      const r = M.rates();
      const price = D(r.gold).max(0).mul(90 * 1.6).max(40);
      if (D(state.gold).gte(price)) await settle(A.negotiateOrDeal());
      else buyBuildings((b) => b.currency !== "gold");
    }
    if (mode === "collapseNow") { A.collapse("manual"); return; }

    if (sinceBuy >= 5 && (mode === "normal" || mode === "hold" || mode === "orDeal")) {
      sinceBuy = 0;
      if (state.activeMythId !== "mythe_de_sisyphe") buyBuildings(state.activeMythId === "mythe_age_or" ? (b) => b.currency !== "gold" : null);
    }
    if (mode === "normal" && !state.activeMythId && cycleAge < P.holdSec) regulate(0.92);

    // Crise terminale : rite si possible, puis chute manuelle (sauf Édit actif).
    if (state.crisisLimitAnnounced && !(P.ragnarokSmart && state.activeMythId === "mythe_du_ragnarok")) {
      if (terminalSince == null) terminalSince = now;
      const edit = state.crisisDoctrine?.autoCollapse?.enabled && M.has("edit_effondrement");
      if (!edit || (now - terminalSince) > 240_000) {
        for (const type of ["prepareArchives", "holdOrder", "exodus"]) {
          for (let tier = 2; tier >= 0; tier--) if (M.terminalCrisisReady(type, tier)) { A.runTerminalCrisisAction(type, tier); break; }
        }
        A.collapse("manual");
      }
    } else terminalSince = null;
  }

  // ── Suivi : cycles, ères, mythes, sceaux ─────────────────────────────────
  let lastCycles = state.cycles || 0, lastEra = state.bestEraIndex || 0;
  const lastGrRevealed = {}, lastMyths = {};
  for (const [id, v] of Object.entries(state.mythsCompleted || {})) if (v) lastMyths[id] = true;
  for (const [gr, v] of Object.entries(state.grRevealed || {})) if (v) lastGrRevealed[gr] = true;
  let lastProgressT = vtSec(), lastSig = "";
  function track() {
    const t = vtSec();
    if ((state.cycles || 0) !== lastCycles) {
      const pc = state.prevCycle || {};
      R.cycles.push({ t, cycle: state.cycles, sec: Math.round(pc.cycleSec || 0), gain: pc.ruinGain, peakPop: pc.peakPop, era: pc.peakEra, cause: pc.cause, myth: mythState.id || null, gr: state.grandResetCount || 0 });
      lastCycles = state.cycles || 0;
      if (mythState.id && !(state.mythsCompleted || {})[mythState.id] && !mythState.closed && state.activeMythId !== mythState.id) {
        const rec = R.myth[mythState.id];
        mythState.closed = true; rec.fails = (rec.fails || 0) + 1; rec.streak = (rec.streak || 0) + 1;
        rec.log.push(`échec @${fmtT(t)} durée=${pc.cycleSec | 0}s cause=${pc.cause} snap=${JSON.stringify(mythState.snap || {})}`);
        log(`   échec ${mythState.id}: ${rec.log[rec.log.length - 1]}`);
      }
      const rt = roundTrip(g);
      if (rt.error) anomaly("roundtrip-throw", rt.error);
      else if (!rt.same) {
        R.roundTrips.push({ t, keys: rt.diffs.map((d) => d.k).join(","), diffs: rt.diffs.slice(0, 6) });
        anomaly("roundtrip-diff", rt.diffs.map((d) => d.k).join(",") + " :: " + JSON.stringify(rt.diffs.map((d) => d.detail).flat().slice(0, 8)));
      }
    }
    if ((state.bestEraIndex || 0) > lastEra) {
      for (let e = lastEra + 1; e <= state.bestEraIndex; e++) R.eras.push({ t, era: e, gr: state.grandResetCount || 0, cycle: state.cycles });
      lastEra = state.bestEraIndex || 0;
    }
    if (state.bestEraIndex < lastEra) lastEra = state.bestEraIndex || 0;
    for (const [gr, v] of Object.entries(state.grRevealed || {})) {
      if (v && !lastGrRevealed[gr]) { lastGrRevealed[gr] = true; milestone(`SCEAU révélé GR ${gr}`); }
    }
    for (const [id, v] of Object.entries(state.mythsCompleted || {})) {
      if (v && !lastMyths[id]) {
        lastMyths[id] = true;
        const rec = R.myth[id] || (R.myth[id] = { attempts: 0, log: [] });
        rec.doneAt = t; rec.doneDur = mythState.id === id ? t - mythState.startedAt : null;
        milestone(`MYTHE accompli ${id}`, `après ${rec.attempts} essai(s), ${rec.doneDur != null ? fmtT(rec.doneDur) : "?"}`);
      }
    }
    const sig = [state.cycles, state.bestEraIndex, state.grandResetCount, Object.keys(state.mythsCompleted || {}).length, Object.keys(state.grRevealed || {}).length, g.mech.ownedRuinTreePurchaseCount()].join("|");
    if (sig !== lastSig) { lastSig = sig; lastProgressT = t; }
    return t - lastProgressT;
  }

  return { P, R, act, track, anomaly, milestone, regulate, buyBuildings, buyRuinTree, get mythState() { return mythState; } };
}
