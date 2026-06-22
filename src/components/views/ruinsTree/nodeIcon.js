"use strict";

// Icône Font Awesome par nœud de ruines.
// Priorité : (1) icône THÉMATIQUE par id (variété intra-branche — casse le « mur
// d'icônes identiques »), (2) sinon icône de la famille d'effet, (3) sinon glyphe
// de branche. Toutes les classes ci-dessous sont vérifiées en FA 6.4 free-solid.
import { RES_ICONS } from "../../ui/resourceIcons.js";
import { branchTheme } from "./branchTheme.js";

// (1) Thématique par upgrade — variée à l'intérieur de chaque branche.
const NODE_ICON = {
  // ── Résilience (nourriture / pop / stabilité / usure) ──
  root_cellars: "fa-mountain",
  ember_baskets: "fa-fire",
  granaries: "fa-warehouse",
  seed_vaults: "fa-box-archive",
  ancestor_granaries: "fa-wheat-awn",
  charred_ploughs: "fa-tractor",
  smoke_calendar: "fa-calendar-days",
  clay_cisterns: "fa-droplet",
  stone_bread: "fa-bread-slice",
  green_ruins: "fa-leaf",
  age_sutures: "fa-bandage",
  crisis_theatre: "fa-masks-theater",
  dynastic_seeds: "fa-crown",
  echo_census: "fa-clipboard-list",
  evergreen_fields: "fa-tree",
  cradle_of_laws: "fa-scale-balanced",
  ten_thousand_storehouses: "fa-boxes-stacked",
  root_hospices: "fa-house-medical",
  winter_granaries: "fa-snowflake",
  slow_calendar: "fa-hourglass-half",
  plague_records: "fa-skull",
  famine_laws: "fa-gavel",
  river_seedbanks: "fa-water",
  ash_medicine: "fa-mortar-pestle",
  green_census: "fa-seedling",
  mother_walls: "fa-shield-halved",
  seasonal_oaths: "fa-handshake",
  deep_wells: "fa-circle-down",
  patient_bloodlines: "fa-dna",
  last_refuges: "fa-house-chimney",

  // ── Prospérité (trésor / infra / routes / coûts / conservation) ──
  buried_coins: "fa-coins",
  salvage_crews: "fa-recycle",
  ash_paths: "fa-shoe-prints",
  broken_milestones: "fa-road",
  fallen_roads: "fa-road-barrier",
  cracked_scales: "fa-scale-unbalanced",
  ash_markets: "fa-store",
  silent_wells: "fa-faucet",
  old_wall_maps: "fa-map",
  buried_tolls: "fa-money-bill",
  ash_contracts: "fa-file-contract",
  ancestral_markets: "fa-tags",
  old_coin_molds: "fa-stamp",
  tilted_milestones: "fa-signs-post",
  forgotten_wharves: "fa-anchor",
  buried_engineers: "fa-helmet-safety",
  fossil_taxes: "fa-bone",
  rubble_survey: "fa-ruler-combined",
  dead_road_network: "fa-route",
  bronze_foundations: "fa-cubes",
  ancestor_stipends: "fa-sack-dollar",
  silver_ghosts: "fa-ghost",
  cyclopean_blocks: "fa-cube",
  palace_of_receipts: "fa-receipt",
  immortal_blueprint: "fa-compass-drafting",
  silver_roads: "fa-gem",
  public_quarries: "fa-hammer",
  nomad_ledgers: "fa-clipboard",
  canal_charters: "fa-ship",
  vaulted_treasuries: "fa-vault",
  imperial_scaffolds: "fa-building",
  deep_foundry: "fa-industry",

  // ── Connaissance (savoir / archives / mémoire) ──
  charcoal_tablets: "fa-scroll",
  bone_ledgers: "fa-bone",
  oral_tradition: "fa-comment",
  burnt_abacus: "fa-calculator",
  memory_scribes: "fa-pen-nib",
  rubble_contracts: "fa-file-signature",
  sunken_scriptorium: "fa-book-bookmark",
  mirror_archives: "fa-clone",
  ashen_libraries: "fa-book-open",
  first_grammar: "fa-language",
  blackboard_walls: "fa-chalkboard",
  salted_memory: "fa-brain",
  ivory_questions: "fa-question",
  ritual_accounting: "fa-file-invoice",
  library_under_world: "fa-book-skull",
  ink_relics: "fa-pen-fancy",
  dead_language_schools: "fa-graduation-cap",
  memory_courts: "fa-building-columns",
  silent_observatories: "fa-binoculars",
  lamp_archives: "fa-lightbulb",
  counterfactual_histories: "fa-clock-rotate-left",
  chronicle_engine: "fa-feather",

  // ── Cycle & Crise (gain de ruines / arbitrages / automatisation) ──
  conseil_de_crise: "fa-gears",
  edit_effondrement: "fa-clipboard-check",
  ruin_liturgy: "fa-place-of-worship",
  foundation_ghosts: "fa-piggy-bank",
  recurring_ages: "fa-arrows-spin",
  crowned_debris: "fa-trophy",
  burial_math: "fa-square-root-variable",
  ruined_mandate: "fa-bolt",
  oracle_tables: "fa-eye",
  codex_of_failures: "fa-circle-exclamation",
  collapse_taxonomy: "fa-sitemap",
  axiom_engine: "fa-infinity",

  // ── Veille (hors-ligne) ──
  veilleurs_nuit_1: "fa-moon",
  veilleurs_nuit_2: "fa-cloud-moon",
  veilleurs_nuit_3: "fa-bed",
  veilleurs_nuit_4: "fa-clock",

  // ── Dogmes / traits / compétences ──
  dogma_communal_granaries: "fa-wheat-awn",
  dogma_medicine: "fa-staff-snake",
  dogma_stoic_rites: "fa-dove",
  trait_nomadism: "fa-campground",
  dogma_merchant_law: "fa-store",
  dogma_public_works: "fa-trowel-bricks",
  trait_theocracy: "fa-hands-praying",
  skill_archaeology: "fa-magnifying-glass",
  dogma_free_academies: "fa-school",
  dogma_eternal_return: "fa-rotate",
};

// (2) Famille d'effet → icône de ressource (repli si pas d'override par id).
const EFFECT_ICON = {
  foodMult: RES_ICONS.food, foodKeep: RES_ICONS.food,
  goldMult: RES_ICONS.gold, goldKeep: RES_ICONS.gold,
  knowledgeMult: RES_ICONS.knowledge, knowledgeKeep: RES_ICONS.knowledge, knowledgeDiscount: RES_ICONS.knowledge,
  infraMult: RES_ICONS.infrastructure, infraKeep: RES_ICONS.infrastructure, infraDiscount: RES_ICONS.infrastructure,
  populationMult: RES_ICONS.population,
  timeWearSlow: "fa-hourglass-half",
  stability: "fa-scale-balanced",
  ruptureHaste: "fa-bolt",
  ruinGain: RES_ICONS.ruins,
  globalMult: "fa-earth-europe",
  cityDiscount: "fa-tags",
  unspentRuinsPower: "fa-vault",
  chronicleEngine: "fa-feather",
};

function startIcon(effectType) {
  if (/food/i.test(effectType)) return RES_ICONS.food;
  if (/gold/i.test(effectType)) return RES_ICONS.gold;
  if (/knowledge/i.test(effectType)) return RES_ICONS.knowledge;
  if (/population/i.test(effectType)) return RES_ICONS.population;
  return null;
}

export function iconFor(upgrade, branchId) {
  const id = upgrade?.id || "";
  if (NODE_ICON[id]) return NODE_ICON[id];

  const et = upgrade?.effectType;
  if (et) {
    if (EFFECT_ICON[et]) return EFFECT_ICON[et];
    if (/^start/i.test(et)) {
      const s = startIcon(et);
      if (s) return s;
    }
  }
  if (/^veilleurs_nuit/.test(id)) return "fa-moon";
  if (id === "conseil_de_crise" || id === "edit_effondrement") return "fa-gears";
  return branchTheme(branchId).glyph;
}
