"use strict";

/* ============================================================================
 * data-myths.js - Système de Mythes: défis permanents à compléter une seule fois.
 * Ordre de chargement: après render.js, avant main.js.
 *
 * Un Mythe est un défi activé avant un cycle. L'activation réinitialise le cycle
 * complet (ressources, bâtiments, jauges). Si le défi est honoré jusqu'à
 * l'effondrement, le Mythe est marqué complété de façon permanente et accorde
 * un Héritage (bonus permanent).
 *
 * Structure d'une entrée MYTHS :
 * {
 *   id:                  string   — identifiant unique
 *   name:                string   — nom affiché
 *   act:                 1|2|3|"ragnarok"
 *   description:         string   — règle spéciale résumée
 *   objectif:            string   — condition de réussite
 *   heritageDescription: string   — bonus permanent accordé si complété
 *   onActivate():        function — appelée au lancement (modifie state)
 *   onCollapse():        function → boolean — vérifie si le défi est réussi
 *   applyHeritage():     function — appelée une seule fois à la complétion
 * }
 *
 * Déblocage par actes :
 *   Acte 1   : toujours débloqué
 *   Acte 2   : tous les Mythes de l'Acte 1 complétés
 *   Acte 3   : tous les Mythes de l'Acte 2 complétés
 *   Ragnarök : tous les 13 Mythes des Actes 1-2-3 complétés
 * ============================================================================ */

// ── Constantes Mythe du Chaos ────────────────────────────────────────────────
// Seuil de Ruines requis pour réussir le Mythe du Chaos — à calibrer.
const CHAOS_RUIN_THRESHOLD = 50;

// ── Constantes Mythe d'Icare ─────────────────────────────────────────────────
const ICARE_PROD_MULT     = 100;      // Multiplicateur global de production
const ICARE_RUPTURE_MULT  = 30;       // Multiplicateur de vitesse de Rupture
const ICARE_USURE_MULT    = 15;       // Multiplicateur de vitesse d'Usure
const ICARE_INFRA_TARGET  = 5000;     // Infrastructure cible pour réussir le Mythe
const SURCHAUFFE_PROD_MULT    = 5;       // Multiplicateur de production pendant Surchauffe
const SURCHAUFFE_DURATION_MS  = 30_000;  // Durée de l'effet Surchauffe (30 secondes)
const SURCHAUFFE_RUPTURE      = 0.25;    // Rupture instantanée à l'activation (+25%)
const SURCHAUFFE_COOLDOWN_MS  = 120_000; // Cooldown Surchauffe (2 minutes)

// ── Constantes Mythe d'Atlas ─────────────────────────────────────────────────
const ATLAS_USURE_MULT          = 4;           // Usure ×4 pendant le cycle
const ATLAS_MIN_DURATION_MS     = 45 * 60_000; // Durée minimale de survie (45 minutes)
const ATLAS_MIN_CRISIS_WAVES    = 10;          // Vagues de crises min (condition alternative)
const ATLAS_USURE_REDUCTION     = 0.15;        // Héritage : -15% sur le taux d'Usure de base
const ATLAS_LEGIT_PASSIVE_RATE  = 0.05;        // Légitimité gagnée par seconde (passive)
const ATLAS_LEGIT_MAX_REDUCTION = 0.25;        // Réduction max des effets négatifs de crises (25%)

// ── Constantes Mythe de Sisyphe ──────────────────────────────────────────────
const SISYPHE_MULT_PER_PURCHASE = 1.03;  // ×1.03 par achat de bâtiment
const SISYPHE_GOLD_TARGET       = 50_000; // Trésor cible pour réussir (placeholder)
const SISYPHE_SCALE_REDUCTION   = 0.10;  // Héritage : -10% sur le facteur de scaling

// ── Constantes Mythe de l'Âge d'Or ──────────────────────────────────────────
const OR_RUPTURE_CAP           = 0.05;    // Rupture plafonnée à 5%
const OR_POP_THRESHOLD         = 200;     // Seuil de rendements décroissants
const OR_POP_PENALTY_PCT       = 0.005;   // -0.5% de production par habitant au-delà du seuil
const OR_BALANCE_RATIO         = 0.25;    // Écart Nourriture/Trésor au-delà duquel il y a déséquilibre
const OR_USURE_IMBALANCE_MULT  = 3;       // Usure ×3 pendant le déséquilibre
const OR_GOLD_TARGET           = 75_000;  // Trésor cible pour réussir
const OR_POP_CAP               = 300;     // Population max autorisée pour valider
const OR_HERITAGE_BALANCE_RATIO = 0.15;  // Héritage : seuil d'équilibre (<15% d'écart)
const OR_HERITAGE_USURE_RED    = 0.20;   // Héritage : -20% Usure quand équilibré

// ── Constantes Mythe de Babel ─────────────────────────────────────────────────
const BABEL_RUPTURE_MULT   = 2;       // Rupture ×2 pendant le cycle
const BABEL_PROD_BASE_MULT = 1.05;    // Exponentielle par bâtiment du type choisi
const BABEL_MULT_TARGET    = 5;       // Multiplicateur cible pour réussite
const BABEL_ADJ_BONUS      = 0.10;    // Héritage : +10% par voisin du même type
const BABEL_CAT_LABELS     = { city: "Cite", knowledge: "Savoir", infra: "Infrastructure" };

// ── Constantes Mythe de Prométhée ────────────────────────────────────────────
const PROMETHEE_FOOD_MULT       = 3;      // Multiplicateur de production de Nourriture
const PROMETHEE_RUPTURE_PER_FOOD = 0.02;  // Rupture ajoutée par moteur de nourriture acheté (2%)
const PROMETHEE_POP_TARGET      = 500;    // Population cible pour réussir le Mythe
const PROMETHEE_FATAL_RUPTURE   = 0.80;   // Seuil de Rupture fatal (80%)
const BRAISIERS_DURATION_MS     = 120_000; // Durée du bonus Braisiers en ms (2 minutes)
const BRAISIERS_FOOD_MULT       = 2;      // Multiplicateur Nourriture pendant les Braisiers

const MYTHS = [

  // ── Acte I · Fondation ────────────────────────────────────────────────────
  {
    id: "mythe_du_chaos",
    act: 1,
    name: "Le Mythe du Chaos",
    description: "Tous les bonus de meta-progression sont desactives pour ce cycle : Ruines, Legitimite, Grand Reset. Chaque multiplicateur retombe a sa valeur de base (1x). Les upgrades restent achetes — ils sont simplement ignores.",
    objectif: `Atteindre ${CHAOS_RUIN_THRESHOLD} Ruines sans aucun bonus de meta-progression.`,
    heritageDescription: "Les Ruines gagnees lors d'un cycle Chaos comptent double dans le calcul du multiplicateur global de Ruines, en permanence.",

    onActivate() {
      // mechanics.js detecte state.activeMythId === "mythe_du_chaos" et neutralise
      // ruinEffects(), ruinMultiplier(), institutionMultiplier(), grandResetMultiplier().
      // On invalide uniquement le cache pour forcer un recalcul immédiat.
      cachedRuinEffects = null;
      cachedRuinEffectsSignature = "";
    },

    onCollapse() {
      return state.ruins >= CHAOS_RUIN_THRESHOLD;
    },

    applyHeritage() {
      state.chaosRuinsDouble = true;
      // Le double-comptage est appliqué dans completeCollapse() via le flag wasChaos :
      // state.chaosRuinsBonus += gain, puis ruinMultiplier() utilise
      // state.ruins + state.chaosRuinsBonus pour son calcul permanent.
    }
  },

  {
    id: "mythe_de_promethee",
    act: 1,
    name: "Le Mythe de Promethee",
    description: `La production de Nourriture est multipliee par ${PROMETHEE_FOOD_MULT}x. Mais chaque moteur de Nourriture achete ajoute ${Math.round(PROMETHEE_RUPTURE_PER_FOOD * 100)}% de Rupture instantanement. Plus la cite grandit, plus elle brule.`,
    objectif: `Atteindre ${PROMETHEE_POP_TARGET} habitants AVANT que la Rupture ne depasse ${Math.round(PROMETHEE_FATAL_RUPTURE * 100)}%. Depasser le seuil fatal en premier = echec.`,
    heritageDescription: `Braisiers ancestraux : chaque cycle demarre avec un bonus de production de Nourriture x${BRAISIERS_FOOD_MULT} pendant ${BRAISIERS_DURATION_MS / 60_000} minutes.`,

    onActivate() {
      state.prometheeFailed    = false;
      state.prometheePopReached = false;
    },

    onCollapse() {
      // Réussi si la population a atteint la cible AVANT l'échec par rupture
      return state.prometheePopReached && !state.prometheeFailed;
    },

    applyHeritage() {
      state.prometheeBraisiers = true;
      // mechanics.js lit ce flag dans rates() et applique BRAISIERS_FOOD_MULT
      // pendant BRAISIERS_DURATION_MS au début de chaque cycle.
    }
  },

  // ── Acte II · Domination ──────────────────────────────────────────────────
  {
    id: "mythe_de_sisyphe",
    act: 2,
    name: "Le Mythe de Sisyphe",
    description: `Chaque achat de batiment augmente le cout de tous les batiments de +${Math.round((SISYPHE_MULT_PER_PURCHASE - 1) * 100)}% de facon cumulative. Ce multiplicateur de malediction ne se reinitialise jamais en cours de cycle.`,
    objectif: `Accumuler ${SISYPHE_GOLD_TARGET.toLocaleString()} de Tresor malgre l'inflation des couts.`,
    heritageDescription: `Reduit de facon permanente le facteur de scaling des couts de tous les batiments de ${Math.round(SISYPHE_SCALE_REDUCTION * 100)}% (l'inflation naturelle croît plus lentement pour toujours).`,

    onActivate() {
      state.sisypheMult = 1;
    },

    onCollapse() {
      return state.gold >= SISYPHE_GOLD_TARGET;
    },

    applyHeritage() {
      state.sisypheHeritage = true;
      // mechanics.js : buildingEffectiveScale() retourne
      // 1 + (building.scale - 1) * (1 - SISYPHE_SCALE_REDUCTION)
      // à la place de building.scale dans tous les calculs de coût.
    }
  },

  {
    id: "mythe_de_babel",
    act: 2,
    name: "Le Mythe de Babel",
    description: `Seul le type de batiment choisi au lancement peut etre achete ce cycle. Chaque batiment du type concentre une puissance exponentielle : bonus x${BABEL_PROD_BASE_MULT}^N (N = nombre de batiments du type). En contrepartie, la Rupture monte x${BABEL_RUPTURE_MULT} plus vite.`,
    objectif: `Porter le multiplicateur exponentiel jusqu'a x${BABEL_MULT_TARGET} (~${Math.ceil(Math.log(BABEL_MULT_TARGET) / Math.log(BABEL_PROD_BASE_MULT))} batiments du type choisi).`,
    heritageDescription: `Synergie d'Urbanisme : sur la carte, chaque batiment du meme type place cote a cote accorde +${Math.round(BABEL_ADJ_BONUS * 100)}% de production par voisin du meme type (halo dore visible sur le canvas).`,

    buildChoiceHTML() {
      const cats = [
        { value: "city",      label: "Cite",          desc: "Nourriture, Commerce, Population" },
        { value: "knowledge", label: "Savoir",         desc: "Connaissance, Academies, Archives" },
        { value: "infra",     label: "Infrastructure", desc: "Aqueducs, Routes, Batisseurs" }
      ];
      return `
        <div class="myth-modal-row">
          <span class="myth-modal-label">Type de batiment</span>
          <div class="babel-category-choice">
            ${cats.map((c, i) => `
              <label class="babel-cat-option">
                <input type="radio" name="babelCategory" value="${c.value}"${i === 0 ? " checked" : ""}>
                <span class="babel-cat-name">${c.label}</span>
                <span class="babel-cat-desc">${c.desc}</span>
              </label>
            `).join("")}
          </div>
        </div>
      `;
    },

    readChoice(dialog) {
      const checked = dialog.querySelector('[name="babelCategory"]:checked');
      state.babelCategory = checked ? checked.value : "city";
    },

    onActivate() {
      state.babelProdReached = false;
    },

    onCollapse() {
      return Boolean(state.babelProdReached);
    },

    applyHeritage() {
      state.babelHeritage = true;
    }
  },

  {
    id: "mythe_age_or",
    act: 2,
    name: "Le Mythe de l'Age d'Or",
    description: `La Rupture est plafonnee a ${Math.round(OR_RUPTURE_CAP * 100)}% et toutes ses crises sont suspendues. Mais au-dela de ${OR_POP_THRESHOLD} habitants, chaque point de Population supprime ${OR_POP_PENALTY_PCT * 100}% de production globale. Si l'ecart entre Nourriture et Tresor depasse ${Math.round(OR_BALANCE_RATIO * 100)}%, l'Usure monte x${OR_USURE_IMBALANCE_MULT} plus vite.`,
    objectif: `Accumuler ${OR_GOLD_TARGET.toLocaleString()} de Tresor en ayant la population qui n'a jamais depasse ${OR_POP_CAP} habitants.`,
    heritageDescription: `Equilibre Dore : quand l'ecart entre Nourriture et Tresor est inferieur a ${Math.round(OR_HERITAGE_BALANCE_RATIO * 100)}%, l'Usure monte ${Math.round(OR_HERITAGE_USURE_RED * 100)}% plus lentement — en permanence, dans toutes les runs futures.`,

    onActivate() {
      state.orPopPeak      = state.population;
      state.orGoldReached  = false;
      state.orUsureImbalance = false;
    },

    onCollapse() {
      return Boolean(state.orGoldReached);
    },

    applyHeritage() {
      state.orHeritage = true;
    }
  },

  // ── Acte III · Apocalypse ─────────────────────────────────────────────────
  {
    id: "mythe_d_atlas",
    act: 3,
    name: "Le Mythe d'Atlas",
    description: `L'effondrement manuel est desactive. L'Usure monte ${ATLAS_USURE_MULT}x plus vite. La Rupture ne peut plus etre reduite par aucun moyen — les crises absorbent leur cout mais n'allegent plus l'instabilite.`,
    objectif: `Survivre au moins ${ATLAS_MIN_DURATION_MS / 60_000} minutes de cycle actif, OU resister a ${ATLAS_MIN_CRISIS_WAVES} vagues de crises avant l'effondrement.`,
    heritageDescription: `1) L'Usure de base est reduite de ${Math.round(ATLAS_USURE_REDUCTION * 100)}% en permanence. 2) Debloque la jauge "Legitimite" (0-100, demarre a 50 chaque cycle). Quand elle est haute, les effets negatifs des crises sont attenues jusqu'a ${Math.round(ATLAS_LEGIT_MAX_REDUCTION * 100)}%.`,

    onActivate() {
      state.atlasCrisisCount = 0;
      // mechanics.js detecte "mythe_d_atlas" pour :
      //   cityVitals().instabilityRelief = 0
      //   timeWearRate() × ATLAS_USURE_MULT
      // runCrisisAction() bloque effect.drop et compte les vagues.
      // render.js desactive collapseBtn.
    },

    onCollapse() {
      const durationMs   = Date.now() - (state.cycleStartedAt || Date.now());
      const enoughTime   = durationMs >= ATLAS_MIN_DURATION_MS;
      const enoughCrises = (state.atlasCrisisCount || 0) >= ATLAS_MIN_CRISIS_WAVES;
      return enoughTime || enoughCrises;
    },

    applyHeritage() {
      state.atlasHeritage = true;
      // timeWearRate() multiplie par (1 - ATLAS_USURE_REDUCTION).
      // addProductionPenalty() reduit les effets en fonction de atlasLegitimite.
      // render.js affiche la jauge Legitimite (#atlasLegitimiteRow).
    }
  },

  {
    id: "mythe_d_icare",
    act: 3,
    name: "Le Mythe d'Icare",
    description: `La production globale est multipliee par ${ICARE_PROD_MULT}x. La Rupture monte ${ICARE_RUPTURE_MULT}x plus vite, l'Usure ${ICARE_USURE_MULT}x plus vite. L'effondrement manuel est desactive — seul l'automatique peut terminer ce cycle.`,
    objectif: `Atteindre ${fmt ? fmt(ICARE_INFRA_TARGET) : ICARE_INFRA_TARGET} d'Infrastructure avant l'effondrement automatique.`,
    heritageDescription: `Surchauffe : debloque un bouton activable pendant les runs normaux. Active x${SURCHAUFFE_PROD_MULT} production pendant ${SURCHAUFFE_DURATION_MS / 1000}s (+${Math.round(SURCHAUFFE_RUPTURE * 100)}% Rupture instant). Cooldown : ${SURCHAUFFE_COOLDOWN_MS / 60_000} min.`,

    onActivate() {
      state.icareInfraReached = false;
      // mechanics.js detecte state.activeMythId === "mythe_d_icare" pour :
      //   globalMultiplier() × ICARE_PROD_MULT
      //   rates().instability × ICARE_RUPTURE_MULT
      //   timeWearRate()     × ICARE_USURE_MULT
      // render.js desactive collapseBtn et affiche le timer.
    },

    onCollapse() {
      return state.icareInfraReached;
    },

    applyHeritage() {
      state.icareHeritage = true;
      // render.js lit ce flag pour afficher le bouton Surchauffe (#surchauffeBtn).
      // activateSurchauffe() dans actions.js gère l'activation et le cooldown.
    }
  },

  // ── Ragnarök · La Fin ─────────────────────────────────────────────────────
  // (1 mythe — débloqué après complétion des 13 Mythes des Actes I, II et III)
];

// ── Helpers d'état ───────────────────────────────────────────────────────────

function getMythById(id) {
  return MYTHS.find((m) => m.id === id) || null;
}

function isMythCompleted(id) {
  return Boolean(state.mythsCompleted && state.mythsCompleted[id]);
}

function isMythActive(id) {
  return state.activeMythId === id;
}

function isMythUnlocked(myth) {
  if (myth.act === 1) return true;
  if (myth.act === 2) {
    const act1 = MYTHS.filter((m) => m.act === 1);
    return act1.length > 0 && act1.every((m) => isMythCompleted(m.id));
  }
  if (myth.act === 3) {
    const act2 = MYTHS.filter((m) => m.act === 2);
    return act2.length > 0 && act2.every((m) => isMythCompleted(m.id));
  }
  if (myth.act === "ragnarok") {
    const mainMythes = MYTHS.filter((m) => m.act === 1 || m.act === 2 || m.act === 3);
    return mainMythes.length > 0 && mainMythes.every((m) => isMythCompleted(m.id));
  }
  return false;
}

// ── Déblocage des actes ──────────────────────────────────────────────────────

function checkActUnlocks() {
  if (!MYTHS.length) return;

  const byAct = (n) => MYTHS.filter((m) => m.act === n);
  const allDone = (arr) => arr.length > 0 && arr.every((m) => isMythCompleted(m.id));

  if (!state.mythActsAnnounced) state.mythActsAnnounced = {};

  if (allDone(byAct(1)) && byAct(2).length > 0 && !state.mythActsAnnounced.act2) {
    state.mythActsAnnounced.act2 = true;
    log("Acte II — Les pactes anciens s'eveillent. De nouveaux defis se revelent aux yeux du sage.");
  }
  if (allDone(byAct(2)) && byAct(3).length > 0 && !state.mythActsAnnounced.act3) {
    state.mythActsAnnounced.act3 = true;
    log("Acte III — L'epreuve finale approche. Les defis legendaires reclament un dernier sacrifice.");
  }
  const mainMythes = MYTHS.filter((m) => m.act === 1 || m.act === 2 || m.act === 3);
  const hasRagnarok = MYTHS.some((m) => m.act === "ragnarok");
  if (hasRagnarok && allDone(mainMythes) && !state.mythActsAnnounced.ragnarok) {
    state.mythActsAnnounced.ragnarok = true;
    log("Ragnarok — Le pacte ultime se brise. La fin de toutes choses vous attend.");
  }
}

// ── Render de la vue Mythes ──────────────────────────────────────────────────

const ACT_META = {
  1:        { num: "Acte I",   name: "Fondation",  unlockHint: null },
  2:        { num: "Acte II",  name: "Domination", unlockHint: "Completez les 4 Mythes de l'Acte I" },
  3:        { num: "Acte III", name: "Apocalypse", unlockHint: "Completez les 4 Mythes de l'Acte II" },
  ragnarok: { num: "Ragnarok", name: "La Fin",     unlockHint: "Completez les 13 Mythes des Actes I, II et III" }
};

function renderMythView() {
  const container = el("mythChallengeList");
  if (!container) return;

  // Banner mythe actif
  const activeBanner = el("activeMythBanner");
  if (activeBanner) {
    const activeMyth = state.activeMythId ? getMythById(state.activeMythId) : null;
    activeBanner.classList.toggle("hidden", !activeMyth);
    if (activeMyth) {
      const nameEl = activeBanner.querySelector(".active-myth-name");
      const ruleEl = activeBanner.querySelector(".active-myth-rule");
      if (nameEl) nameEl.textContent = activeMyth.name;
      if (ruleEl) ruleEl.textContent = activeMyth.description;
    }
  }

  let html = "";
  for (const act of [1, 2, 3, "ragnarok"]) {
    const mythsInAct = MYTHS.filter((m) => m.act === act);
    const meta = ACT_META[act] || { num: String(act), name: "", unlockHint: null };

    // Détermine si l'acte lui-même est débloqué (indépendamment du contenu de mythsInAct)
    let actUnlocked;
    if (act === 1) {
      actUnlocked = true;
    } else if (act === 2) {
      const a1 = MYTHS.filter((m) => m.act === 1);
      actUnlocked = a1.length > 0 && a1.every((m) => isMythCompleted(m.id));
    } else if (act === 3) {
      const a2 = MYTHS.filter((m) => m.act === 2);
      actUnlocked = a2.length > 0 && a2.every((m) => isMythCompleted(m.id));
    } else {
      const mains = MYTHS.filter((m) => m.act === 1 || m.act === 2 || m.act === 3);
      actUnlocked = mains.length > 0 && mains.every((m) => isMythCompleted(m.id));
    }
    // .every() retourne true sur tableau vide — on exige au moins 1 mythe pour "accompli"
    const actCompleted = mythsInAct.length > 0 && mythsInAct.every((m) => isMythCompleted(m.id));

    html += `<div class="myth-act${actUnlocked ? "" : " myth-act-locked"}${actCompleted ? " myth-act-completed" : ""}">`;

    // En-tête de section
    html += `<div class="myth-act-header">`;
    html += `<span class="myth-act-num">${meta.num}</span>`;
    html += `<span class="myth-act-sep">·</span>`;
    html += `<span class="myth-act-name">${meta.name}</span>`;
    if (!actUnlocked && meta.unlockHint) {
      html += `<span class="myth-act-lock-hint">🔒 ${meta.unlockHint}</span>`;
    }
    if (actCompleted) {
      html += `<span class="myth-act-lock-hint" style="color:var(--green);opacity:1;">✦ Acte accompli</span>`;
    }
    html += `</div>`;

    // Grille de cartes (ou placeholder si acte vide)
    html += `<div class="myth-cards-grid">`;
    if (!mythsInAct.length) {
      html += `<p class="myth-locked-hint" style="grid-column:1/-1;padding:0.25rem 0;font-style:italic;">Les pactes de cet acte n'ont pas encore ete graves dans la pierre.</p>`;
    }
    for (const myth of mythsInAct) {
      const unlocked = isMythUnlocked(myth);
      const completed = isMythCompleted(myth.id);
      const active    = isMythActive(myth.id);

      let statusClass = "myth-locked";
      let statusLabel = "Verrouille";
      if (unlocked && completed)  { statusClass = "myth-completed"; statusLabel = "Accompli ✦"; }
      else if (unlocked && active) { statusClass = "myth-active";    statusLabel = "Actif"; }
      else if (unlocked)           { statusClass = "myth-available"; statusLabel = "Disponible"; }

      html += `<div class="myth-card ${statusClass}">`;
      html += `<div class="myth-card-header">`;
      html += `<span class="myth-name">${myth.name}</span>`;
      html += `<span class="myth-status-badge">${statusLabel}</span>`;
      html += `</div>`;

      if (unlocked) {
        html += `<p class="myth-rule"><strong>Regle</strong>${myth.description}</p>`;
        if (completed) {
          html += `<p class="myth-heritage-desc"><strong>Heritage</strong>${myth.heritageDescription}</p>`;
        } else {
          html += `<p class="myth-objectif"><strong>Objectif</strong>${myth.objectif}</p>`;
          const btnLabel = active ? "Pacte actif ↺" : "Sceller ce pacte";
          html += `<button class="myth-activate-btn" onclick="openMythModal('${myth.id}')">${btnLabel}</button>`;
        }
      } else {
        html += `<p class="myth-locked-hint">Completez l'acte precedent pour deverrouiller ce pacte.</p>`;
      }

      html += `</div>`;
    }
    html += `</div>`;
    html += `</div>`;
  }

  container.innerHTML = html;
}

// ── Modale de confirmation d'activation ─────────────────────────────────────

async function openMythModal(mythId) {
  if (gamePaused) return;
  const myth = getMythById(mythId);
  if (!myth || !isMythUnlocked(myth) || isMythCompleted(myth.id)) return;

  // Message d'avertissement adapté selon l'état courant
  const switchingFrom = state.activeMythId && state.activeMythId !== mythId
    ? getMythById(state.activeMythId)?.name || state.activeMythId
    : null;
  const reactivating = state.activeMythId === mythId;

  let warningText;
  if (switchingFrom) {
    warningText = `Le pacte "${switchingFrom}" est deja actif ce cycle et sera abandonne. Le cycle sera reinitialise.`;
  } else if (reactivating) {
    warningText = `Ce pacte est deja actif. Confirmer va reinitialiser entierement le cycle en cours.`;
  } else {
    warningText = `Le cycle en cours sera entierement reinitialise (ressources, batiments, jauges).`;
  }

  const actMeta = ACT_META[myth.act] || { num: String(myth.act), name: "" };

  const dialog = document.createElement("dialog");
  dialog.className = "event-dialog myth-modal";
  dialog.innerHTML = `
    <form method="dialog">
      <span class="label">${actMeta.num} · ${actMeta.name}</span>
      <h2>${myth.name}</h2>
      <div class="myth-modal-body">
        <div class="myth-modal-row">
          <span class="myth-modal-label">Regle imposee</span>
          <span>${myth.description}</span>
        </div>
        <div class="myth-modal-row">
          <span class="myth-modal-label">Objectif</span>
          <span>${myth.objectif}</span>
        </div>
        <div class="myth-modal-row myth-modal-heritage">
          <span class="myth-modal-label">Heritage promis</span>
          <span>${myth.heritageDescription}</span>
        </div>
        ${typeof myth.buildChoiceHTML === "function" ? myth.buildChoiceHTML() : ""}
      </div>
      <p class="myth-modal-warning">${warningText}</p>
      <menu class="choice-menu">
        <button value="confirm" class="myth-confirm-btn">Sceller ce pacte</button>
        <button value="cancel">Annuler</button>
      </menu>
    </form>
  `;
  document.body.appendChild(dialog);

  const confirmed = await new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      if (dialog.returnValue === "confirm" && typeof myth.readChoice === "function") {
        myth.readChoice(dialog);
      }
      dialog.remove();
      resolve(dialog.returnValue === "confirm");
    }, { once: true });
    dialog.showModal();
  });

  if (confirmed) activateMyth(mythId);
}
