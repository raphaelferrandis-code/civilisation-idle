"use strict";

import { localizeData } from '../core/i18n.js';

/* ============================================================================
 * data-upgrades.js - Donnees ruines/prestige: upgrades, PRESTIGE_TREE_BRANCHES, PRESTIGE_DOGMAS, dogmaIds, PRESTIGE_TREE.
 *
 * REFONTE « Arbre des Ruines » (cf. docs/REFONTE-ARBRE-RUINES.md) :
 *   - un nœud = UNE mécanique nommée du jeu (nécropole, aubaines, Démesure,
 *     routes, fleuve, stagnation, crises résolues, culte, épitaphes…) — plus
 *     aucun « +X % ressource » anonyme (le scaling passe par la Sève de braise,
 *     cf. braiseMultiplier dans production.js + RUIN_BRAISE_* dans balance.js) ;
 *   - 4 branches re-thématisées : Racines (ce qui reste) / Sève (la cité
 *     vivante) / Cendre (la chute) / Écorce gravée (la mémoire) ;
 *   - dogmes = PAIRES DE CHOIX EXCLUSIFS (conflictsWith), gratuits au palier ;
 *   - les ids des nœuds conservés ne changent PAS (branchements en dur dans
 *     core/ : granaries, fallen_roads, oral_tradition, ruin_liturgy,
 *     conseil_de_crise, edit_effondrement, veilleurs_nuit_*, trait_*,
 *     skill_archaeology, recurring_ages, foundation_ghosts, chronicle_engine).
 * ============================================================================ */

export const upgrades = [
  /* ── LES RACINES (resilience) — ce qui traverse la mort ─────────────────── */
  {
    id: "granaries",
    group: "ruins",
    effectType: "startFood",
    amount: 40,
    name: { fr: "Porteurs de braise", en: "Ember bearers" },
    cost: { ruins: 2 },
    desc: { fr: "Tout le monde ne survit pas. Mais ceux qui partent emportent le feu et le grain.", en: "Not everyone survives. But those who leave carry the fire and the grain." },
    effect: { fr: "À l'effondrement : 3% de la population et 8% de la nourriture survivent, et chaque cycle commence avec +40 vivres.", en: "On collapse: 3% of population and 8% of food survive, and each cycle starts with +40 food." }
  },
  {
    id: "veilleurs_nuit_1",
    group: "ruins",
    unlockCycles: 1,
    name: { fr: "Veilleurs de nuit", en: "Night watch" },
    cost: { ruins: 8 },
    desc: { fr: "Quelques gardiens tiennent les registres pendant que la cité dort. Rien ne s'arrête vraiment.", en: "A few keepers hold the registers while the city sleeps. Nothing truly stops." },
    effect: { fr: "Gain hors-ligne : la cité produit et vieillit jusqu'à 8 h d'absence (au lieu de 2 h).", en: "Offline gains: the city produces and ages for up to 8 h away (instead of 2 h)." }
  },
  {
    id: "skill_archaeology",
    group: "ruins",
    unlockCycles: 2,
    name: { fr: "Archéologie", en: "Archaeology" },
    cost: { ruins: 12 },
    desc: { fr: "Ce que l'ancien siècle a laissé, ce siècle peut l'exhumer et s'en servir.", en: "What the old century left behind, this century can unearth and use." },
    effect: { fr: "Active : une fois par cycle, dépense du savoir pour exhumer un bâtiment de la civilisation précédente.", en: "Active: once per cycle, spend knowledge to unearth a building from the previous civilization." }
  },
  {
    id: "reliquaire_pics",
    group: "ruins",
    unlockCycles: 3,
    effectType: "allStartPctPeak",
    amount: 0.03,
    name: { fr: "Reliquaire des pics", en: "Reliquary of peaks" },
    cost: { ruins: 120 },
    desc: { fr: "On y conserve la plus haute marque de chaque crue. Les cités suivantes savent où viser.", en: "The highest mark of every flood is kept here. The next cities know where to aim." },
    effect: { fr: "Chaque cycle commence avec 3% du pic précédent de CHAQUE ressource.", en: "Each cycle starts with 3% of the previous peak of EVERY resource." }
  },
  {
    id: "necropole_vivante",
    group: "ruins",
    unlockCycles: 3,
    effectType: "vestigePower",
    amount: 0.02,
    name: { fr: "Nécropole vivante", en: "Living necropolis" },
    cost: { ruins: 320 },
    desc: { fr: "À l'ouest, les cités mortes n'ont jamais cessé de servir.", en: "To the west, the dead cities never stopped serving." },
    effect: { fr: "+2% de production globale par vestige dans la nécropole (maximum 10 vestiges).", en: "+2% global production per vestige in the necropolis (up to 10 vestiges)." }
  },
  {
    id: "veilleurs_nuit_4",
    group: "ruins",
    unlockCycles: 7,
    name: { fr: "Veilleurs de nuit IV", en: "Night watch IV" },
    cost: { ruins: 1500 },
    desc: { fr: "La cité fonctionne désormais aussi bien sans toi qu'avec. C'est à la fois rassurant et vertigineux.", en: "The city now runs as well without you as with you. It is both reassuring and dizzying." },
    effect: { fr: "Gain hors-ligne : jusqu'à 24 h d'absence.", en: "Offline gains: up to 24 h away." }
  },
  {
    id: "chambres_scellees",
    group: "ruins",
    unlockCycles: 5,
    effectType: "allKeep",
    amount: 0.08,
    name: { fr: "Chambres scellées", en: "Sealed chambers" },
    cost: { ruins: 60000 },
    desc: { fr: "Personne ne sait qui les a fermées. Elles s'ouvrent toujours au bon moment.", en: "No one knows who sealed them. They always open at the right moment." },
    effect: { fr: "Effondrements : +8% de CHAQUE ressource conservée.", en: "Collapses: +8% of EVERY resource preserved." }
  },
  {
    id: "chantiers_fouilles",
    group: "ruins",
    unlockCycles: 6,
    effectType: "exhumeCharges",
    amount: 2,
    name: { fr: "Chantiers de fouilles", en: "Excavation yards" },
    cost: { ruins: 250000 },
    desc: { fr: "L'ancienne cité est devenue une carrière ordonnée. On y descend en équipes.", en: "The old city has become an orderly quarry. Teams go down in shifts." },
    effect: { fr: "Archéologie : 3 exhumations par cycle, et leur coût en savoir est réduit de moitié.", en: "Archaeology: 3 excavations per cycle, and their knowledge cost is halved." }
  },
  {
    id: "limon_des_ages",
    group: "ruins",
    effectType: "sedimentBoost",
    amount: 1,
    name: { fr: "Limon des âges", en: "Silt of ages" },
    cost: { ruins: 2000000000 },
    desc: { fr: "Plus la terre repose, plus elle rend. Les absences deviennent des jachères.", en: "The longer the land rests, the more it yields. Absences become fallows." },
    effect: { fr: "Le bonus de longue absence démarre deux fois plus tôt et monte jusqu'à ×7 (au lieu de ×5).", en: "The long-absence bonus starts twice as early and climbs to ×7 (instead of ×5)." }
  },
  {
    id: "racine_mere",
    group: "ruins",
    capstone: true,
    effectType: "engineFamilyKeep",
    amount: 1,
    name: { fr: "Racine-mère", en: "Mother root" },
    cost: { ruins: 30000000000 },
    desc: { fr: "Sous la ville, il y a une racine qui n'a jamais brûlé. Tout repart d'elle.", en: "Beneath the city there is a root that never burned. Everything grows back from it." },
    effect: { fr: "Capstone Racines : à l'effondrement, votre famille de bâtiments la plus nombreuse survit ENTIÈREMENT.", en: "Roots Capstone: on collapse, your most numerous building family survives ENTIRELY." }
  },

  /* ── LA SÈVE (prosperity) — la cité vivante ─────────────────────────────── */
  {
    id: "rives_fecondes",
    group: "ruins",
    effectType: "riverEngineMult",
    amount: 0.6,
    name: { fr: "Rives fécondes", en: "Fertile banks" },
    cost: { ruins: 5 },
    desc: { fr: "Le fleuve se souvient de chaque quai. Il rend au centuple ce qu'on lui confie.", en: "The river remembers every wharf. It returns a hundredfold what it is entrusted." },
    effect: { fr: "Les moteurs riverains (Ports fluviaux, Moulins riverains) produisent +60%.", en: "Riverside engines (River ports, Water mills) produce +60%." }
  },
  {
    id: "fallen_roads",
    group: "ruins",
    unlockCycles: 2,
    name: { fr: "Routes ensevelies", en: "Buried roads" },
    cost: { ruins: 8 },
    desc: { fr: "Le chemin existe déjà sous la boue. Il suffit de gratter.", en: "The path already exists beneath the mud. You only have to scrape." },
    effect: { fr: "Chaque nouveau cycle commence avec une petite base d'infrastructure.", en: "Each new cycle starts with a small base of infrastructure." }
  },
  {
    id: "foundation_ghosts",
    group: "ruins",
    name: { fr: "Ruines en réserve", en: "Ruins in reserve" },
    cost: { ruins: 60 },
    effectType: "unspentRuinsPower",
    amount: 0.01,
    desc: { fr: "Les murs tombés indiquent encore où poser les prochains. Rien ne se perd vraiment.", en: "The fallen walls still show where to lay the next ones. Nothing is truly lost." },
    effect: { fr: "Production globale +1% par ruine non dépensée.", en: "Global production +1% per unspent ruin." }
  },
  {
    id: "grand_cadastre",
    group: "ruins",
    unlockCycles: 3,
    effectType: "roadCapBonus",
    amount: 0.05,
    name: { fr: "Grand cadastre", en: "Great cadastre" },
    cost: { ruins: 150 },
    desc: { fr: "Chaque rue est nommée, chaque borne comptée. Le réseau cesse de se perdre.", en: "Every street is named, every milestone counted. The network stops losing itself." },
    effect: { fr: "Couverture routière : bonus maximal porté de +10% à +15%, et les Routes coûtent −25%.", en: "Road coverage: maximum bonus raised from +10% to +15%, and Roads cost −25%." }
  },
  {
    id: "caravanes_aubaine",
    group: "ruins",
    unlockCycles: 3,
    effectType: "boonFrequency",
    amount: 0.4,
    name: { fr: "Caravanes d'aubaine", en: "Windfall caravans" },
    cost: { ruins: 400 },
    desc: { fr: "Les bonnes nouvelles ont appris le chemin de la cité.", en: "Good news has learned the road to the city." },
    effect: { fr: "Les aubaines arrivent 40% plus souvent.", en: "Boons arrive 40% more often." }
  },
  {
    id: "fetes_jalon",
    group: "ruins",
    unlockCycles: 5,
    effectType: "milestoneBoon",
    amount: 1,
    name: { fr: "Fêtes de jalon", en: "Milestone feasts" },
    cost: { ruins: 120000 },
    desc: { fr: "Le vingt-cinquième toit se fête. La ville entière y gagne.", en: "The twenty-fifth roof is celebrated. The whole city gains from it." },
    effect: { fr: "Chaque jalon de bâtiment atteint déclenche une aubaine dorée (4 minutes de production offertes).", en: "Each building milestone reached triggers a golden boon (4 minutes of production granted)." }
  },
  {
    id: "franchises_marchandes",
    group: "ruins",
    unlockCycles: 6,
    effectType: "inequalityDamp",
    amount: 0.5,
    name: { fr: "Franchises marchandes", en: "Merchant franchises" },
    cost: { ruins: 500000 },
    desc: { fr: "L'or qui circule ne moisit pas. Les chartes l'y obligent.", en: "Gold that moves does not moulder. The charters see to it." },
    effect: { fr: "Le foyer d'Inégalités (or thésaurisé) pèse moitié moins sur la Rupture.", en: "The Inequality source (hoarded gold) weighs half as much on Rupture." }
  },
  {
    id: "gouvernail_millions",
    group: "ruins",
    effectType: "demesureSlow",
    amount: 0.3,
    name: { fr: "Gouvernail des millions", en: "Helm of millions" },
    cost: { ruins: 5000000000 },
    desc: { fr: "Gouverner dix mille âmes est un art. En gouverner dix millions, une machine.", en: "Governing ten thousand souls is an art. Governing ten million, a machine." },
    effect: { fr: "Démesure −30% : l'hubris d'échelle pèse moins sur les cités géantes.", en: "Hubris −30%: the weight of scale bears less on giant cities." }
  },
  {
    id: "ville_monde",
    group: "ruins",
    capstone: true,
    effectType: "milestoneStep",
    amount: 5,
    name: { fr: "Ville-Monde", en: "World-City" },
    cost: { ruins: 32000000000 },
    desc: { fr: "Elle ne s'arrête plus à ses murs. Les cartes s'arrêtent à elle.", en: "It no longer stops at its walls. The maps stop at it." },
    effect: { fr: "Capstone Sève : les jalons de bâtiments tombent tous les 20 achats au lieu de 25.", en: "Sap Capstone: building milestones land every 20 purchases instead of 25." }
  },

  /* ── LA CENDRE (cycle_crise) — la chute ─────────────────────────────────── */
  {
    id: "conseil_de_crise",
    group: "ruins",
    unlockCycles: 2,
    name: { fr: "Conseil de crise", en: "Crisis council" },
    cost: { ruins: 8 },
    desc: { fr: "Un conseil permanent tranche les crises sans réveiller le prince. Tu fixes la ligne, il l'applique.", en: "A standing council settles crises without waking the prince. You set the line, it enforces it." },
    effect: { fr: "Débloque la Doctrine de crise : réponse automatique (Stabiliser / Temporiser) à chaque palier de Rupture (25 / 50 / 75 %). Fini les interruptions.", en: "Unlocks the Crisis Doctrine: automatic response (Stabilize / Stall) at each Rupture threshold (25 / 50 / 75%). No more interruptions." }
  },
  {
    id: "rites_feu_court",
    group: "ruins",
    effectType: "shortCycleRuinBonus",
    amount: 0.25,
    name: { fr: "Rites du feu court", en: "Rites of the short fire" },
    cost: { ruins: 10 },
    desc: { fr: "Certains feux valent mieux vifs et brefs. Les prêtres l'ont mesuré.", en: "Some fires are best quick and bright. The priests have measured it." },
    effect: { fr: "Les cycles achevés en moins de 15 minutes rapportent +25% de ruines.", en: "Cycles ended in under 15 minutes yield +25% ruins." }
  },
  {
    id: "edit_effondrement",
    group: "ruins",
    unlockCycles: 3,
    name: { fr: "Édit d'effondrement", en: "Edict of collapse" },
    cost: { ruins: 15 },
    desc: { fr: "L'effondrement devient un acte programmé, déclenché sans hésitation le moment venu.", en: "Collapse becomes a scheduled act, triggered without hesitation when the time comes." },
    effect: { fr: "Débloque l'effondrement automatique configurable : à 100% de Rupture, à un seuil d'Usure, ou après une durée. Peut tenter Rationner/Réformes avant.", en: "Unlocks configurable automatic collapse: at 100% Rupture, at a Wear threshold, or after a set duration. Can attempt Ration/Reforms first." }
  },
  {
    id: "ruin_liturgy",
    group: "ruins",
    unlockCycles: 3,
    name: { fr: "Liturgie des ruines", en: "Liturgy of ruins" },
    cost: { ruins: 35 },
    desc: { fr: "Quand la chute devient un rite, elle fait moins mal au cycle suivant.", en: "When the fall becomes a rite, it hurts less the next cycle." },
    effect: { fr: "Les ruines calment une partie de la pression de dissidence.", en: "Ruins ease part of the pressure of dissent." }
  },
  {
    id: "moisson_de_crise",
    group: "ruins",
    unlockCycles: 4,
    effectType: "crisisResolveRuinBonus",
    amount: 0.10,
    name: { fr: "Moisson de crise", en: "Crisis harvest" },
    cost: { ruins: 300 },
    desc: { fr: "Chaque tourmente traversée laisse quelque chose dans les filets.", en: "Every storm weathered leaves something in the nets." },
    effect: { fr: "Chaque crise stabilisée pendant le cycle : +10% de ruines à l'effondrement (maximum +30%).", en: "Each crisis stabilized during the cycle: +10% ruins on collapse (up to +30%)." }
  },
  {
    id: "cendres_fertiles",
    group: "ruins",
    unlockCycles: 5,
    effectType: "regrowthRush",
    amount: 2,
    name: { fr: "Cendres fertiles", en: "Fertile ashes" },
    cost: { ruins: 90000 },
    desc: { fr: "Rien ne pousse plus vite que sur un champ brûlé.", en: "Nothing grows faster than on a burnt field." },
    effect: { fr: "Après un effondrement : production ×3 pendant les 3 premières minutes du cycle.", en: "After a collapse: production ×3 for the first 3 minutes of the cycle." }
  },
  {
    id: "preparations_funebres",
    group: "ruins",
    unlockCycles: 5,
    effectType: "terminalPrepDiscount",
    amount: 0.4,
    name: { fr: "Préparations funèbres", en: "Funeral preparations" },
    cost: { ruins: 200000 },
    desc: { fr: "La cité apprend à mourir proprement. C'est un métier.", en: "The city learns to die cleanly. It is a craft." },
    effect: { fr: "Préparations terminales : coût −40% et effet de préparation renforcé de moitié.", en: "Terminal preparations: cost −40% and preparation effect strengthened by half." }
  },
  {
    id: "stagnation_feconde",
    group: "ruins",
    unlockCycles: 6,
    effectType: "stagnationBoon",
    amount: 1,
    name: { fr: "Stagnation féconde", en: "Fertile stagnation" },
    cost: { ruins: 450000 },
    desc: { fr: "Le calme n'est plus une rouille. C'est une réserve.", en: "Calm is no longer a rust. It is a reserve." },
    effect: { fr: "La stagnation n'accélère plus l'Usure : chaque longue accalmie charge une aubaine.", en: "Stagnation no longer speeds up Wear: each long lull charges a boon instead." }
  },
  {
    id: "collapse_taxonomy",
    group: "ruins",
    name: { fr: "Taxonomie des chutes", en: "Taxonomy of falls" },
    cost: { ruins: 22000000000 },
    effectType: "ruinGain",
    amount: 0.65,
    desc: { fr: "Classer les effondrements, c'est apprendre à mieux en tirer profit.", en: "To classify collapses is to learn how to profit from them better." },
    effect: { fr: "Ruines gagnées +40%.", en: "Ruins gained +40%." }
  },
  {
    id: "phenix_calendaire",
    group: "ruins",
    capstone: true,
    effectType: "farmUncap",
    amount: 1,
    name: { fr: "Phénix calendaire", en: "Calendar phoenix" },
    cost: { ruins: 34000000000 },
    desc: { fr: "La renaissance est inscrite à l'almanach, entre les semailles et l'impôt.", en: "Rebirth is written into the almanac, between sowing and taxes." },
    effect: { fr: "Capstone Cendre : le farm hors-ligne n'est plus plafonné à 20 effondrements.", en: "Ash Capstone: offline farming is no longer capped at 20 collapses." }
  },

  /* ── L'ÉCORCE GRAVÉE (knowledge) — la mémoire ───────────────────────────── */
  {
    id: "oral_tradition",
    group: "ruins",
    name: { fr: "Tradition orale", en: "Oral tradition" },
    cost: { ruins: 6 },
    desc: { fr: "Ce qu'on dit à voix basse résiste mieux aux incendies que les bibliothèques.", en: "What is spoken in a low voice withstands fire better than any library." },
    effect: { fr: "Mémoire des pierres : le bonus de production des ruines est renforcé de 20%.", en: "Memory of stones: the ruins production bonus is strengthened by 20%." }
  },
  {
    id: "grammaire_des_ruines",
    group: "ruins",
    effectType: "ruinShopDiscount",
    amount: 0.10,
    name: { fr: "Grammaire des ruines", en: "Grammar of ruins" },
    cost: { ruins: 15 },
    desc: { fr: "Les ruines sont une langue. La lire coûte moins cher que la deviner.", en: "Ruins are a language. Reading it costs less than guessing it." },
    effect: { fr: "Les nœuds de l'arbre des ruines coûtent −10%.", en: "Ruins tree nodes cost −10%." }
  },
  {
    id: "autel_du_culte",
    group: "ruins",
    unlockCycles: 4,
    effectType: "cultAmp",
    amount: 0.5,
    name: { fr: "Autel du culte", en: "Altar of the cult" },
    cost: { ruins: 250 },
    desc: { fr: "L'Olympe regarde la cité depuis longtemps. On lui a enfin dressé une table.", en: "Olympus has watched the city for a long time. At last a table has been set for it." },
    effect: { fr: "Le culte de l'Olympe : effets renforcés de moitié et révélation du culte accélérée.", en: "The Olympus cult: effects strengthened by half and cult revelation accelerated." }
  },
  {
    id: "encre_indelebile",
    group: "ruins",
    unlockCycles: 4,
    effectType: "reformsPersist",
    amount: 1,
    name: { fr: "Encre indélébile", en: "Indelible ink" },
    cost: { ruins: 600 },
    desc: { fr: "Certaines lois sont écrites pour survivre à leurs scribes.", en: "Some laws are written to outlive their scribes." },
    effect: { fr: "Les réformes de fond survivent désormais aux effondrements.", en: "Deep reforms now survive collapses." }
  },
  {
    id: "recurring_ages",
    group: "ruins",
    unlockCycles: 8,
    name: { fr: "Âges récurrents", en: "Recurring ages" },
    cost: { ruins: 80000 },
    desc: { fr: "Certaines époques reviennent si souvent qu'elles finissent par ressembler à des habitudes.", en: "Some eras return so often they come to look like habits." },
    effect: { fr: "L'âge maximum atteint renforce légèrement la production globale.", en: "The highest age reached slightly strengthens global production." }
  },
  {
    id: "loi_des_temoins",
    group: "ruins",
    unlockCycles: 6,
    effectType: "policyCostHalf",
    amount: 0.5,
    name: { fr: "Loi des témoins", en: "Law of witnesses" },
    cost: { ruins: 150000 },
    desc: { fr: "Ce que cent témoins ont vu n'a plus besoin d'être imposé.", en: "What a hundred witnesses have seen no longer needs enforcing." },
    effect: { fr: "Les politiques permanentes ne coûtent plus que la moitié de leur production.", en: "Permanent policies only cost half their production." }
  },
  {
    id: "epitaphes_profondes",
    group: "ruins",
    effectType: "epitaphAmp",
    amount: 1.5,
    name: { fr: "Épitaphes profondes", en: "Deep epitaphs" },
    cost: { ruins: 6000000000 },
    desc: { fr: "Gravées assez profond, les dernières volontés deviennent des fondations.", en: "Carved deep enough, last wills become foundations." },
    effect: { fr: "Le legs d'épitaphe dure 20 minutes au lieu de 8.", en: "The epitaph legacy lasts 20 minutes instead of 8." }
  },
  {
    id: "chronicle_engine",
    group: "ruins",
    capstone: true,
    effectType: "braiseAmp",
    amount: 0.5,
    name: { fr: "Machine chronique", en: "Chronicle engine" },
    cost: { ruins: 40000000000 },
    desc: { fr: "Elle transforme chaque fin en chapitre. L'histoire ne s'arrête plus — elle recommence.", en: "It turns every ending into a chapter. History no longer stops — it begins again." },
    effect: { fr: "Capstone Mémoire : la Sève de braise est amplifiée de +50% — chaque nœud allumé et chaque ruine dépensée nourrissent l'arbre davantage.", en: "Memory Capstone: the Ember Sap is amplified by +50% — every lit node and every spent ruin feeds the tree further." }
  },

  /* ── DOGMES — paires de choix exclusifs, gratuits au palier ─────────────── */
  {
    id: "trait_nomadism",
    group: "ruins",
    conflictsWith: "trait_enracinement",
    name: { fr: "Nomadisme", en: "Nomadism" },
    cost: { ruins: 0 },
    desc: { fr: "La ville, c'est les gens, pas les pierres. On peut tout emporter.", en: "The city is the people, not the stones. Everything can be carried away." },
    effect: { fr: "Dogme : tous les bâtiments coûtent -30%. Contrepartie : l'infrastructure est plafonnée par la taille de la cité.", en: "Dogma: all buildings cost -30%. Trade-off: infrastructure is capped by the size of the city." }
  },
  {
    id: "trait_enracinement",
    group: "ruins",
    conflictsWith: "trait_nomadism",
    name: { fr: "Enracinement", en: "Rootedness" },
    cost: { ruins: 0 },
    desc: { fr: "On ne part pas. On répare.", en: "We do not leave. We repair." },
    effect: { fr: "Dogme : l'infrastructure excédentaire ne se dégrade plus jamais (fin de l'entretien). Contrepartie : tous les bâtiments coûtent +15%.", en: "Dogma: surplus infrastructure never decays again (no more upkeep). Trade-off: all buildings cost +15%." }
  },
  {
    id: "dogma_communal_granaries",
    group: "ruins",
    conflictsWith: "dogma_reliquaire_scelle",
    name: { fr: "Communes vivrières", en: "Food communes" },
    cost: { ruins: 0 },
    effectType: "foodKeep",
    amount: 0.10,
    desc: { fr: "Personne ne mange avant les autres. C'est difficile, mais ça dure.", en: "No one eats before the others. It is hard, but it lasts." },
    effect: { fr: "Dogme : les effondrements conservent +10% de nourriture.", en: "Dogma: collapses preserve +10% food." }
  },
  {
    id: "dogma_reliquaire_scelle",
    group: "ruins",
    conflictsWith: "dogma_communal_granaries",
    name: { fr: "Reliquaire scellé", en: "Sealed reliquary" },
    cost: { ruins: 0 },
    effectType: "allStartPctPeak",
    amount: 0.05,
    desc: { fr: "Le reliquaire reçoit un second sceau. Ce qui y entre ne diminue plus.", en: "The reliquary receives a second seal. What enters it no longer dwindles." },
    effect: { fr: "Dogme : le départ au pic passe de 3% à 8% de chaque ressource.", en: "Dogma: the peak start rises from 3% to 8% of every resource." }
  },
  {
    id: "dogma_merchant_law",
    group: "ruins",
    conflictsWith: "dogma_public_works",
    name: { fr: "Droit marchand", en: "Merchant law" },
    cost: { ruins: 0 },
    effectType: "goldMult",
    amount: 0.75,
    desc: { fr: "Ce qui est écrit reste valable même quand les parties qui l'ont signé ne sont plus là.", en: "What is written holds even when the parties who signed it are gone." },
    effect: { fr: "Dogme : production de trésor +75%.", en: "Dogma: treasury production +75%." }
  },
  {
    id: "dogma_public_works",
    group: "ruins",
    conflictsWith: "dogma_merchant_law",
    name: { fr: "Grands travaux", en: "Public works" },
    cost: { ruins: 0 },
    effectType: "infraMult",
    amount: 0.65,
    desc: { fr: "Ce qu'on construit pour tous laisse une trace plus profonde que les décrets.", en: "What is built for all leaves a deeper mark than decrees." },
    effect: { fr: "Dogme : production d'infrastructure +65%.", en: "Dogma: infrastructure production +65%." }
  },
  {
    id: "dogma_eternal_return",
    group: "ruins",
    conflictsWith: "dogma_abime_assume",
    name: { fr: "Éternel retour", en: "Eternal return" },
    cost: { ruins: 0 },
    effectType: "ruinGain",
    amount: 0.30,
    desc: { fr: "Chaque fin est une répétition générale. On finit par en tirer plus à chaque chute.", en: "Every ending is a dress rehearsal. We come to draw more from each fall." },
    effect: { fr: "Dogme : Ruines gagnées +30%.", en: "Dogma: Ruins gained +30%." }
  },
  {
    id: "dogma_abime_assume",
    group: "ruins",
    conflictsWith: "dogma_eternal_return",
    name: { fr: "Abîme assumé", en: "Embraced abyss" },
    cost: { ruins: 0 },
    desc: { fr: "Vivre au bord du gouffre affûte les gestes.", en: "Living at the edge of the chasm sharpens the hand." },
    effect: { fr: "Dogme : tant que la Rupture dépasse 70%, production globale +20%.", en: "Dogma: while Rupture exceeds 70%, global production +20%." }
  },
  {
    id: "trait_theocracy",
    group: "ruins",
    conflictsWith: "dogma_free_academies",
    name: { fr: "Théocratie", en: "Theocracy" },
    cost: { ruins: 0 },
    desc: { fr: "La richesse est devenue une forme de piété. Le savoir suit l'or.", en: "Wealth has become a form of piety. Knowledge follows gold." },
    effect: { fr: "Dogme : +1% du trésor actuel en savoir par seconde. Contrepartie : la rupture monte 25% plus vite.", en: "Dogma: +1% of current treasury as knowledge per second. Trade-off: rupture rises 25% faster." }
  },
  {
    id: "dogma_free_academies",
    group: "ruins",
    conflictsWith: "trait_theocracy",
    name: { fr: "Académies libres", en: "Free academies" },
    cost: { ruins: 0 },
    effectType: "complexityDamp",
    amount: 0.35,
    desc: { fr: "Quand tout le monde peut apprendre, l'État cesse d'étouffer sous ses propres registres.", en: "When everyone can learn, the state stops choking on its own registers." },
    effect: { fr: "Dogme : le foyer de Complexité (charge administrative) pèse 35% de moins sur la Rupture.", en: "Dogma: the Complexity source (administrative load) weighs 35% less on Rupture." }
  },

  /* ── HÉRITAGE (légitimité) — inchangé ───────────────────────────────────── */
  {
    id: "reforme_administrative",
    group: "heritage",
    name: { fr: "Réforme administrative", en: "Administrative reform" },
    cost: { legitimacy: 1 },
    desc: { fr: "Les institutions apprennent à faire plus avec les mêmes mains.", en: "Institutions learn to do more with the same hands." },
    effect: { fr: "Débloque le bouton Max: achète autant de bâtiments que possible en un clic.", en: "Unlocks the Max button: buy as many buildings as possible in one click." }
  },
  {
    id: "protocoles_urgence",
    group: "heritage",
    name: { fr: "Protocoles de stabilisation", en: "Stabilization protocols" },
    cost: { legitimacy: 3 },
    desc: { fr: "La machine tourne sans gardien. Les premiers signes de rupture déclenchent une réponse automatique.", en: "The machine runs without a keeper. The first signs of rupture trigger an automatic response." },
    effect: { fr: "A 65% de rupture: Rationner se déclenche automatiquement si possible. A 82%: Recensement aussi.", en: "At 65% rupture: Ration triggers automatically if possible. At 82%: Census as well." }
  },
  {
    id: "reseau_routes",
    group: "heritage",
    name: { fr: "Réseau de routes", en: "Road network" },
    cost: { legitimacy: 6 },
    desc: { fr: "Les routes anciennes se souviennent. Chaque nouvelle dynastie reconnaît les anciens chemins.", en: "The old roads remember. Each new dynasty recognizes the ancient paths." },
    effect: { fr: "Coûts de construction -5% par dynastie fondée (maximum -60%).", en: "Construction costs -5% per dynasty founded (maximum -60%)." }
  },
  {
    id: "codex_mythique",
    group: "heritage",
    name: { fr: "Mémoire des Cycles", en: "Memory of the Cycles" },
    cost: { legitimacy: 9 },
    desc: { fr: "Les leçons des cycles précédents n'ont pas besoin d'être réapprises. Le savoir s'incarne dans les pierres.", en: "The lessons of past cycles need not be relearned. Knowledge takes form in the stones." },
    effect: { fr: "Au début de chaque nouveau cycle, reçoit +250 Savoir par ère maximale atteinte dans les cycles précédents. Permet de débloquer les recherches avancées plus rapidement.", en: "At the start of each new cycle, gain +250 Knowledge per highest era reached in previous cycles. Lets you unlock advanced research sooner." }
  },
  {
    id: "conservateurs_ruines",
    group: "heritage",
    name: { fr: "Archivistes des Ruines", en: "Archivists of the Ruins" },
    cost: { legitimacy: 14 },
    desc: { fr: "Ils savent quelle ruine doit être découverte en premier. Et ils le font sans qu'on le leur demande.", en: "They know which ruin must be uncovered first. And they do it without being asked." },
    effect: { fr: "Après chaque effondrement, achète automatiquement le premier upgrade de ruines abordable grâce aux ruines récoltées. Économise les premiers clics de chaque cycle.", en: "After each collapse, automatically buys the first affordable ruins upgrade with the ruins harvested. Saves the first clicks of every cycle." }
  },
  {
    id: "rituel_effondrement",
    group: "heritage",
    name: { fr: "Rite de Passage", en: "Rite of Passage" },
    cost: { legitimacy: 20 },
    desc: { fr: "L'effondrement est devenu un acte conscient et maîtrisé. La cité sait comment tomber pour mieux se relever.", en: "Collapse has become a conscious, mastered act. The city knows how to fall in order to rise again." },
    effect: { fr: "+25% de ruines de base lors de chaque effondrement. Le choix d'épitaphe reste libre et oriente la prochaine civilisation.", en: "+25% base ruins on each collapse. The choice of epitaph remains free and shapes the next civilization." }
  },
  {
    id: "grand_reset",
    group: "heritage",
    name: { fr: "Grand Reset", en: "Grand Reset" },
    cost: { legitimacy: 300 },
    desc: { fr: "Tout recommence. Mais les cicatrices restent, et elles rendent deux fois plus fort.", en: "Everything begins again. But the scars remain, and they make you twice as strong." },
    effect: { fr: "Remet la partie à zéro, mais ajoute un bonus permanent x2 sur toute la production et les Ruines gagnées. Cumulable. Le prochain Grand Reset sera deux fois plus rapide à atteindre.", en: "Resets the game, but adds a permanent x2 bonus to all production and Ruins gained. Stacks. The next Grand Reset will be twice as fast to reach." }
  }
];

// Arbre de prestige à PALIERS À CHOIX : chaque branche est une suite de `tiers`
// (paliers) ; un nœud du palier t devient disponible quand on possède au moins
// `unlock[t]` nœuds des paliers INFÉRIEURS — un compteur, pas un nœud précis.
// Refonte « Arbre des Ruines » : 4 rameaux re-thématisés, ~9 nœuds chacun, coûts
// CROISSANTS le long des paliers (invariant testé par ruinTree.structure.test.js).
export const PRESTIGE_TREE_BRANCHES = [
  {
    id: "resilience",
    name: { fr: "Les Racines", en: "The Roots" },
    hint: { fr: "Ce qui reste : conservation, départ au pic, nécropole, archéologie, hors-ligne.", en: "What remains: preservation, peak starts, necropolis, archaeology, offline." },
    unlock: [0, 2, 3, 5],
    tiers: [
      ["granaries", "veilleurs_nuit_1", "skill_archaeology"],
      ["reliquaire_pics", "necropole_vivante"],
      ["veilleurs_nuit_4", "chambres_scellees", "chantiers_fouilles"],
      ["limon_des_ages", "racine_mere"]
    ]
  },
  {
    id: "prosperity",
    name: { fr: "La Sève", en: "The Sap" },
    hint: { fr: "La cité vivante : fleuve, routes, aubaines, jalons, Démesure.", en: "The living city: river, roads, boons, milestones, Hubris." },
    unlock: [0, 2, 3, 5],
    tiers: [
      ["rives_fecondes", "fallen_roads"],
      ["foundation_ghosts", "grand_cadastre", "caravanes_aubaine"],
      ["fetes_jalon", "franchises_marchandes"],
      ["gouvernail_millions", "ville_monde"]
    ]
  },
  {
    id: "cycle_crise",
    name: { fr: "La Cendre", en: "The Ash" },
    hint: { fr: "La chute : crises, effondrement, gain de ruines, automatisation.", en: "The fall: crises, collapse, ruin gains, automation." },
    unlock: [0, 2, 3, 5],
    tiers: [
      ["conseil_de_crise", "rites_feu_court"],
      ["edit_effondrement", "ruin_liturgy", "moisson_de_crise"],
      ["cendres_fertiles", "preparations_funebres", "stagnation_feconde"],
      ["collapse_taxonomy", "phenix_calendaire"]
    ]
  },
  {
    id: "knowledge",
    name: { fr: "L'Écorce gravée", en: "The Graven Bark" },
    hint: { fr: "La mémoire : culte, réformes durables, épitaphes, méta.", en: "Memory: cult, lasting reforms, epitaphs, meta." },
    unlock: [0, 2, 3, 5],
    tiers: [
      ["oral_tradition", "grammaire_des_ruines"],
      ["autel_du_culte", "encre_indelebile"],
      ["recurring_ages", "loi_des_temoins"],
      ["epitaphes_profondes", "chronicle_engine"]
    ]
  }
];

// Dogmes = PAIRES DE CHOIX EXCLUSIFS (conflictsWith), gratuits une fois le seuil
// d'achats de branche atteint. Deux dogmes de même palier/branche = une paire.
export const PRESTIGE_DOGMAS = [
  { id: "trait_nomadism", tier: { fr: "Palier I", en: "Tier I" }, requiredPurchases: 4, branch: "resilience" },
  { id: "trait_enracinement", tier: { fr: "Palier I", en: "Tier I" }, requiredPurchases: 4, branch: "resilience" },
  { id: "dogma_communal_granaries", tier: { fr: "Palier II", en: "Tier II" }, requiredPurchases: 7, branch: "resilience" },
  { id: "dogma_reliquaire_scelle", tier: { fr: "Palier II", en: "Tier II" }, requiredPurchases: 7, branch: "resilience" },
  { id: "dogma_merchant_law", tier: { fr: "Palier I", en: "Tier I" }, requiredPurchases: 4, branch: "prosperity" },
  { id: "dogma_public_works", tier: { fr: "Palier I", en: "Tier I" }, requiredPurchases: 4, branch: "prosperity" },
  { id: "dogma_eternal_return", tier: { fr: "Palier I", en: "Tier I" }, requiredPurchases: 4, branch: "cycle_crise" },
  { id: "dogma_abime_assume", tier: { fr: "Palier I", en: "Tier I" }, requiredPurchases: 4, branch: "cycle_crise" },
  { id: "trait_theocracy", tier: { fr: "Palier I", en: "Tier I" }, requiredPurchases: 4, branch: "knowledge" },
  { id: "dogma_free_academies", tier: { fr: "Palier I", en: "Tier I" }, requiredPurchases: 4, branch: "knowledge" }
];

export const dogmaIds = new Set(PRESTIGE_DOGMAS.map((dogma) => dogma.id));

// Aplatissement des paliers en nœuds. Chaque nœud porte son `tier` et son seuil
// `unlock` (recopié de la branche) → checkNodeAvailability est auto-suffisant.
export const PRESTIGE_TREE = PRESTIGE_TREE_BRANCHES.flatMap((branch) =>
  branch.tiers.flatMap((tierIds, tierIndex) => tierIds.map((id) => {
    const upgrade = upgrades.find((candidate) => candidate.id === id);
    return {
      id,
      branch: branch.id,
      tier: tierIndex,
      unlock: branch.unlock[tierIndex] ?? 0,
      name: upgrade?.name || id,
      cost: upgrade?.cost || { ruins: 0 },
      capstone: Boolean(upgrade?.capstone),
      purchased: false,
      effect: upgrade?.effect || ""
    };
  }))
);

// Aplatit les feuilles { fr, en } en chaînes de la langue courante (cf. i18n.js).
// PRESTIGE_TREE est résolu SÉPARÉMENT : ses nœuds recopient name/effect des
// upgrades AVANT que localizeData(upgrades) ne les résolve, donc ses copies
// doivent l'être à part. PRESTIGE_DOGMAS.tier ("Palier I/II/III") est aplati ici
// → la regex de layout.js (qui en extrait le chiffre romain) le lit bien en string.
localizeData(upgrades);
localizeData(PRESTIGE_TREE_BRANCHES);
localizeData(PRESTIGE_DOGMAS);
localizeData(PRESTIGE_TREE);
