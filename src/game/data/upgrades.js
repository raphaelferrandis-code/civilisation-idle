"use strict";

import { localizeData } from '../core/i18n.js';

/* ============================================================================
 * data-upgrades.js - Donnees ruines/prestige: ruinPaths, upgrades, PRESTIGE_TREE_BRANCHES, PRESTIGE_DOGMAS, dogmaIds, PRESTIGE_TREE.
 * Ordre de chargement (index.html): U -> DB -> DU -> DW -> ST -> ME -> EV -> AC -> RE -> MA
 * Scope global partage (pas de modules) - ne pas envelopper dans une IIFE.
 * ============================================================================ */

export const upgrades = [
  {
    id: "root_cellars",
    group: "ruins",
    effectType: "foodMult",
    amount: 0.22,
    name: { fr: "Caves racines", en: "Root cellars" },
    cost: { ruins: 1 },
    desc: { fr: "Les cachettes survivent aux empires. Quelqu'un l'a compris très tôt.", en: "Hiding places outlast empires. Someone understood that very early." },
    effect: { fr: "Production de nourriture +60%.", en: "Food production +60%." }
  },
  {
    id: "oral_tradition",
    group: "ruins",
    name: { fr: "Tradition orale", en: "Oral tradition" },
    cost: { ruins: 6 },
    desc: { fr: "Ce qu'on dit à voix basse résiste mieux aux incendies que les bibliothèques.", en: "What is spoken in a low voice withstands fire better than any library." },
    effect: { fr: "Mémoire des pierres: bonus de ruines renforcé.", en: "Memory of stones: ruins bonus strengthened." }
  },
  {
    id: "granaries",
    group: "ruins",
    name: { fr: "Greniers cycliques", en: "Cyclic granaries" },
    cost: { ruins: 12 },
    desc: { fr: "Tout le monde ne survit pas. Juste assez pour que l'histoire continue.", en: "Not everyone survives. Just enough for history to go on." },
    effect: { fr: "Les survivants repartent avec un socle de population.", en: "Survivors begin again with a base of population." }
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
    id: "ruin_liturgy",
    group: "ruins",
    unlockCycles: 3,
    name: { fr: "Liturgie des ruines", en: "Liturgy of ruins" },
    cost: { ruins: 35 },
    desc: { fr: "Quand la chute devient un rite, elle fait moins mal au cycle suivant.", en: "When the fall becomes a rite, it hurts less the next cycle." },
    effect: { fr: "Les ruines calment une partie de la pression de dissidence.", en: "Ruins ease part of the pressure of dissent." }
  },
  {
    id: "recurring_ages",
    group: "ruins",
    unlockCycles: 8,
    name: { fr: "Âges récurrents", en: "Recurring ages" },
    cost: { ruins: 90 },
    desc: { fr: "Certaines époques reviennent si souvent qu'elles finissent par ressembler à des habitudes.", en: "Some eras return so often they come to look like habits." },
    effect: { fr: "L'âge maximum atteint renforce légèrement la production globale.", en: "The highest age reached slightly strengthens global production." }
  },
  {
    id: "ember_baskets",
    group: "ruins",
    name: { fr: "Paniers de braises", en: "Ember baskets" },
    cost: { ruins: 2 },
    effectType: "startFood",
    amount: 40,
    desc: { fr: "Le feu voyage dans des paniers depuis plus longtemps qu'il n'existe de cités.", en: "Fire has travelled in baskets longer than there have been cities." },
    effect: { fr: "Chaque cycle commence avec plus de nourriture.", en: "Each cycle starts with more food." }
  },
  {
    id: "bone_ledgers",
    group: "ruins",
    name: { fr: "Registres d'os", en: "Bone ledgers" },
    cost: { ruins: 4 },
    effectType: "knowledgeMult",
    amount: 0.37,
    desc: { fr: "Des comptes gravés dans l'os. Difficiles à brûler, impossibles à perdre.", en: "Accounts carved in bone. Hard to burn, impossible to lose." },
    effect: { fr: "Production de savoir +15%.", en: "Knowledge production +15%." }
  },
  {
    id: "ash_paths",
    group: "ruins",
    name: { fr: "Sentiers de cendre", en: "Ash paths" },
    cost: { ruins: 6 },
    effectType: "cityDiscount",
    amount: 0.14,
    desc: { fr: "La cendre garde la forme des chemins qu'elle a recouverts.", en: "Ash keeps the shape of the paths it has covered." },
    effect: { fr: "Coûts des moteurs -3%.", en: "Engine costs -3%." }
  },
  {
    id: "cracked_scales",
    group: "ruins",
    name: { fr: "Balances fendues", en: "Cracked scales" },
    cost: { ruins: 9 },
    effectType: "goldMult",
    amount: 0.18,
    desc: { fr: "Cassées, elles mesurent encore. L'étalon survit à l'instrument.", en: "Broken, they still measure. The standard outlives the instrument." },
    effect: { fr: "Production de trésor +18%.", en: "Treasury production +18%." }
  },
  {
    id: "silent_wells",
    group: "ruins",
    name: { fr: "Puits silencieux", en: "Silent wells" },
    cost: { ruins: 21 },
    effectType: "infraMult",
    amount: 0.9,
    desc: { fr: "L'eau est là depuis avant la cité. Elle sera là après.", en: "The water was here before the city. It will be here after." },
    effect: { fr: "Production d'infrastructure +15%.", en: "Infrastructure production +15%." }
  },
  {
    id: "buried_tolls",
    group: "ruins",
    unlockCycles: 1,
    name: { fr: "Péages ensevelis", en: "Buried tolls" },
    cost: { ruins: 72 },
    effectType: "goldMult",
    amount: 0.3,
    desc: { fr: "L'ancienne taxe est devenue un réflexe. La route veut toujours quelque chose.", en: "The old tax has become a reflex. The road always wants something." },
    effect: { fr: "Production de trésor +30%.", en: "Treasury production +30%." }
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
    id: "smoke_calendar",
    group: "ruins",
    unlockCycles: 2,
    name: { fr: "Calendrier de fumée", en: "Smoke calendar" },
    cost: { ruins: 90 },
    effectType: "timeWearSlow",
    amount: 0.08,
    desc: { fr: "Les saisons y sont notées par la couleur des fumées. Ça marche.", en: "The seasons are read here by the color of the smoke. It works." },
    effect: { fr: "Usure du temps -8%.", en: "Time Wear -8%." }
  },
  {
    id: "rubble_contracts",
    group: "ruins",
    unlockCycles: 2,
    name: { fr: "Contrats de gravats", en: "Rubble contracts" },
    cost: { ruins: 130 },
    effectType: "knowledgeDiscount",
    amount: 0.05,
    desc: { fr: "Les promesses signées sur des pierres cassées tiennent mieux que celles sur parchemin.", en: "Promises signed on broken stone hold better than those on parchment." },
    effect: { fr: "Coûts du savoir -5%.", en: "Knowledge costs -5%." }
  },
  {
    id: "sunken_scriptorium",
    group: "ruins",
    unlockCycles: 2,
    name: { fr: "Scriptorium englouti", en: "Sunken scriptorium" },
    cost: { ruins: 420 },
    effectType: "knowledgeKeep",
    amount: 0.03,
    desc: { fr: "Sous l'eau, l'encre a refusé de disparaître. Quelqu'un en a fait une théologie.", en: "Underwater, the ink refused to vanish. Someone made a theology of it." },
    effect: { fr: "Effondrements: savoir conservé +3%.", en: "Collapses: knowledge preserved +3%." }
  },
  {
    id: "old_coin_molds",
    group: "ruins",
    unlockCycles: 3,
    name: { fr: "Moules à monnaie", en: "Coin molds" },
    cost: { ruins: 650 },
    effectType: "goldKeep",
    amount: 0.16,
    desc: { fr: "Les visages gravés dans le métal durent plus longtemps que ceux qui les ont commandés.", en: "The faces stamped in metal last longer than those who ordered them struck." },
    effect: { fr: "Effondrements: trésor conservé +4%.", en: "Collapses: treasury preserved +4%." }
  },
  {
    id: "stone_bread",
    group: "ruins",
    unlockCycles: 3,
    name: { fr: "Pain de pierre", en: "Stone bread" },
    cost: { ruins: 1000 },
    effectType: "foodMult",
    amount: 1.87,
    conflictsWith: "mirror_archives",
    desc: { fr: "Une légende absurde sur du grain qui ne meurt pas. Mais les greniers s'ouvrent mieux après.", en: "An absurd legend of grain that never dies. Yet the granaries open more readily after." },
    effect: { fr: "Production de nourriture +55%.", en: "Food production +55%." }
  },
  {
    id: "mirror_archives",
    group: "ruins",
    unlockCycles: 3,
    name: { fr: "Archives miroirs", en: "Mirror archives" },
    cost: { ruins: 1500 },
    effectType: "knowledgeMult",
    amount: 0.55,
    conflictsWith: "stone_bread",
    desc: { fr: "Chaque texte y semble écrit par deux peuples différents. L'un d'eux avait raison.", en: "Every text here seems written by two different peoples. One of them was right." },
    effect: { fr: "Production de savoir +55%.", en: "Knowledge production +55%." }
  },
  {
    id: "crowned_debris",
    group: "ruins",
    unlockCycles: 3,
    name: { fr: "Débris couronnés", en: "Crowned debris" },
    cost: { ruins: 4500 },
    effectType: "ruinGain",
    amount: 0.15,
    desc: { fr: "Un fragment de palais suffit à fonder une prétention.", en: "A fragment of palace is enough to found a claim." },
    effect: { fr: "Ruines gagnées +15%.", en: "Ruins gained +15%." }
  },
  {
    id: "burial_math",
    group: "ruins",
    unlockCycles: 4,
    name: { fr: "Mathématique funéraire", en: "Funerary mathematics" },
    cost: { ruins: 10000 },
    effectType: "ruptureHaste",
    amount: 0.24,
    conflictsWith: "crisis_theatre",
    desc: { fr: "Les tombes sont alignées avec une précision que les vivants n'atteignent pas.", en: "The tombs are aligned with a precision the living never reach." },
    effect: { fr: "Pression de rupture +4 pts.", en: "Rupture pressure +4 pts." }
  },
  {
    id: "forgotten_wharves",
    group: "ruins",
    unlockCycles: 4,
    name: { fr: "Quais oubliés", en: "Forgotten wharves" },
    cost: { ruins: 23000 },
    effectType: "goldMult",
    amount: 1.3,
    desc: { fr: "Les amarres sont coupées depuis longtemps. Les habitudes de commerce, non.", en: "The moorings were cut long ago. The habits of trade were not." },
    effect: { fr: "Production de trésor +85%.", en: "Treasury production +85%." }
  },
  {
    id: "crisis_theatre",
    group: "ruins",
    unlockCycles: 5,
    name: { fr: "Théâtre des crises", en: "Theatre of crises" },
    cost: { ruins: 120000 },
    effectType: "stability",
    amount: 0.03,
    conflictsWith: "burial_math",
    desc: { fr: "Rejouer les catastrophes passées pour apprivoiser la prochaine. Ça aide, un peu.", en: "Re-enacting past catastrophes to tame the next one. It helps, a little." },
    effect: { fr: "Pression de rupture -3 pts.", en: "Rupture pressure -3 pts." }
  },
  {
    id: "first_grammar",
    group: "ruins",
    unlockCycles: 5,
    name: { fr: "Première grammaire", en: "First grammar" },
    cost: { ruins: 120000 },
    effectType: "startKnowledgePctPeak",
    amount: 0.03,
    desc: { fr: "Les premières règles du langage ont tout changé. La deuxième fois, ça va plus vite.", en: "The first rules of language changed everything. The second time, it comes faster." },
    effect: { fr: "Chaque cycle commence avec 3% du pic de savoir précédent.", en: "Each cycle starts with 3% of the previous knowledge peak." }
  },
  {
    id: "rubble_survey",
    group: "ruins",
    unlockCycles: 6,
    name: { fr: "Arpentage des gravats", en: "Rubble survey" },
    cost: { ruins: 600000 },
    effectType: "infraDiscount",
    amount: 0.08,
    desc: { fr: "Mesurer les ruines, c'est la première étape pour ne pas les reproduire.", en: "To measure the ruins is the first step toward not repeating them." },
    effect: { fr: "Coûts d'infrastructure -8%.", en: "Infrastructure costs -8%." }
  },
  {
    id: "echo_census",
    group: "ruins",
    unlockCycles: 6,
    name: { fr: "Recensement d'écho", en: "Echo census" },
    cost: { ruins: 3000000 },
    effectType: "populationMult",
    amount: 0.9,
    desc: { fr: "Les absents sont comptés avec les vivants. Pour ne pas recommencer seuls.", en: "The absent are counted with the living. So as not to begin again alone." },
    effect: { fr: "Croissance de population +35%.", en: "Population growth +35%." }
  },
  {
    id: "bronze_foundations",
    group: "ruins",
    unlockCycles: 7,
    name: { fr: "Fondations de bronze", en: "Bronze foundations" },
    cost: { ruins: 6800000 },
    effectType: "infraKeep",
    amount: 0.05,
    desc: { fr: "Certaines bases refusent de redevenir poussière. On s'en sort.", en: "Some foundations refuse to return to dust. We get by." },
    effect: { fr: "Effondrements: infrastructure conservée +5%.", en: "Collapses: infrastructure preserved +5%." }
  },
  {
    id: "ivory_questions",
    group: "ruins",
    unlockCycles: 8,
    name: { fr: "Questions d'ivoire", en: "Ivory questions" },
    cost: { ruins: 35000000 },
    effectType: "knowledgeMult",
    amount: 2.65,
    desc: { fr: "Trop belles pour des réponses simples. C'est pour ça qu'elles durent.", en: "Too beautiful for simple answers. That is why they endure." },
    effect: { fr: "Production de savoir +180%.", en: "Knowledge production +180%." }
  },
  {
    id: "ritual_accounting",
    group: "ruins",
    unlockCycles: 8,
    name: { fr: "Comptabilité rituelle", en: "Ritual accounting" },
    cost: { ruins: 78000000 },
    effectType: "globalMult",
    amount: 0.34,
    desc: { fr: "Les nombres sont devenus des gestes. Les gestes, des lois.", en: "The numbers became gestures. The gestures, laws." },
    effect: { fr: "Production globale +18%.", en: "Global production +18%." }
  },
  {
    id: "deep_foundry",
    group: "ruins",
    unlockCycles: 8,
    capstone: true,
    name: { fr: "Fonderie profonde", en: "Deep foundry" },
    cost: { ruins: 12000000000 },
    effectType: "globalMult",
    amount: 0.30,
    desc: { fr: "Sous les décombres, le métal apprend une seconde chaleur.", en: "Beneath the rubble, the metal learns a second heat." },
    effect: { fr: "Capstone Prospérité : production globale +30%.", en: "Prosperity Capstone: global production +30%." }
  },
  {
    id: "ten_thousand_storehouses",
    group: "ruins",
    unlockCycles: 9,
    name: { fr: "Dix mille réserves", en: "Ten thousand storehouses" },
    cost: { ruins: 270000000 },
    effectType: "startFoodPctPeak",
    amount: 0.13,
    desc: { fr: "La famine cherche une entrée. Elle trouve des portes fermées partout.", en: "Famine looks for a way in. It finds closed doors everywhere." },
    effect: { fr: "Chaque cycle commence avec 5% du pic de nourriture précédent.", en: "Each cycle starts with 5% of the previous food peak." }
  },
  {
    id: "palace_of_receipts",
    group: "ruins",
    unlockCycles: 9,
    name: { fr: "Palais des quittances", en: "Palace of receipts" },
    cost: { ruins: 400000000 },
    effectType: "startGoldPctPeak",
    amount: 0.09,
    desc: { fr: "Le trésor physique a déménagé ici. Les preuves de paiement ont plus de gardes que les princes.", en: "The physical treasury moved here. Proofs of payment have more guards than princes do." },
    effect: { fr: "Chaque cycle commence avec 6% du pic de trésor précédent.", en: "Each cycle starts with 6% of the previous treasury peak." }
  },
  {
    id: "immortal_blueprint",
    group: "ruins",
    unlockCycles: 10,
    name: { fr: "Plan immortel", en: "Immortal blueprint" },
    cost: { ruins: 900000000 },
    effectType: "infraKeep",
    amount: 0.22,
    desc: { fr: "Une ville entière tient dans ces traits. Elle peut être rebâtie après n'importe quel feu.", en: "An entire city fits within these lines. It can be rebuilt after any fire." },
    effect: { fr: "Effondrements: infrastructure conservée +12%.", en: "Collapses: infrastructure preserved +12%." }
  },
  {
    id: "chronicle_engine",
    group: "ruins",
    unlockCycles: 10,
    capstone: true,
    name: { fr: "Machine chronique", en: "Chronicle engine" },
    cost: { ruins: 40000000000 },
    effectType: "chronicleEngine",
    amount: 0.03,
    desc: { fr: "Elle transforme chaque fin en chapitre. L'histoire ne s'arrête plus — elle recommence.", en: "It turns every ending into a chapter. History no longer stops — it begins again." },
    effect: { fr: "Capstone Connaissance : chaque achat de ruines renforce toute la production, et les ruines non dépensées ajoutent un bonus.", en: "Knowledge Capstone: every ruins purchase strengthens all production, and unspent ruins add a bonus." }
  },
  {
    id: "winter_granaries",
    group: "ruins",
    name: { fr: "Greniers d'hiver", en: "Winter granaries" },
    cost: { ruins: 1200000000 },
    effectType: "foodKeep",
    amount: 0.12,
    desc: { fr: "Les mauvaises saisons y sont attendues. On les connaît par leur nom.", en: "The bad seasons are expected here. They are known by name." },
    effect: { fr: "Effondrements: nourriture conservée +8%.", en: "Collapses: food preserved +8%." }
  },
  {
    id: "river_seedbanks",
    group: "ruins",
    name: { fr: "Semences du fleuve", en: "River seedbanks" },
    cost: { ruins: 6000000000 },
    effectType: "foodMult",
    amount: 4.2,
    desc: { fr: "Chaque crue enterre une graine et la rend plus nombreuse.", en: "Each flood buries a seed and makes it many." },
    effect: { fr: "Production de nourriture +240%.", en: "Food production +240%." }
  },
  {
    id: "ash_medicine",
    group: "ruins",
    name: { fr: "Médecine de cendre", en: "Ash medicine" },
    cost: { ruins: 9000000000 },
    effectType: "timeWearSlow",
    amount: 0.38,
    desc: { fr: "Les remèdes les plus anciens sentent le feu éteint et la terre après la pluie.", en: "The oldest remedies smell of dead fire and earth after rain." },
    effect: { fr: "Usure du temps -16%.", en: "Time Wear -16%." }
  },
  {
    id: "green_census",
    group: "ruins",
    name: { fr: "Recensement vert", en: "Green census" },
    cost: { ruins: 13000000000 },
    effectType: "startPopulationPctPeak",
    amount: 0.07,
    desc: { fr: "Les noms de famille repoussent avec les jardins. Les gens reviennent.", en: "Family names grow back with the gardens. People return." },
    effect: { fr: "Chaque cycle commence avec 5% du pic de population précédent.", en: "Each cycle starts with 5% of the previous population peak." }
  },
  {
    id: "mother_walls",
    group: "ruins",
    name: { fr: "Murs nourriciers", en: "Mother walls" },
    cost: { ruins: 17000000000 },
    effectType: "foodKeep",
    amount: 0.1,
    desc: { fr: "Ces murs ne protègent pas les palais. Ils protègent la nourriture.", en: "These walls do not protect the palaces. They protect the food." },
    effect: { fr: "Effondrements: nourriture conservée +10%.", en: "Collapses: food preserved +10%." }
  },
  {
    id: "seasonal_oaths",
    group: "ruins",
    name: { fr: "Serments saisonniers", en: "Seasonal oaths" },
    cost: { ruins: 21000000000 },
    effectType: "stability",
    amount: 0.09,
    desc: { fr: "À chaque saison, la cité répète pourquoi elle existe. Ça aide à tenir.", en: "Each season, the city repeats why it exists. It helps to hold on." },
    effect: { fr: "Pression de rupture -4 pts.", en: "Rupture pressure -4 pts." }
  },
  {
    id: "patient_bloodlines",
    group: "ruins",
    name: { fr: "Lignées patientes", en: "Patient bloodlines" },
    cost: { ruins: 30000000000 },
    effectType: "populationMult",
    amount: 1.95,
    desc: { fr: "Ces lignées ont appris à ne pas confondre survivre et attendre. Il y a une différence.", en: "These bloodlines learned not to mistake surviving for waiting. There is a difference." },
    effect: { fr: "Croissance de population +120%.", en: "Population growth +120%." }
  },
  {
    id: "last_refuges",
    group: "ruins",
    capstone: true,
    name: { fr: "Derniers refuges", en: "Last refuges" },
    cost: { ruins: 35000000000 },
    effectType: "timeWearSlow",
    amount: 0.22,
    desc: { fr: "Ces lieux savent encore fermer leurs portes quand tout le reste tombe.", en: "These places still know how to close their doors when all else falls." },
    effect: { fr: "Capstone Résilience : usure du temps -22%.", en: "Resilience Capstone: Time Wear -22%." }
  },
  {
    id: "silver_roads",
    group: "ruins",
    name: { fr: "Routes d'argent", en: "Silver roads" },
    cost: { ruins: 1400000000 },
    effectType: "goldMult",
    amount: 4.2,
    desc: { fr: "Elles brillent surtout la nuit, quand les marchands mentent moins.", en: "They shine most at night, when merchants lie less." },
    effect: { fr: "Production de trésor +240%.", en: "Treasury production +240%." }
  },
  {
    id: "public_quarries",
    group: "ruins",
    name: { fr: "Carrieres publiques", en: "Public quarries" },
    cost: { ruins: 2100000000 },
    effectType: "infraMult",
    amount: 3.2,
    desc: { fr: "Quand la pierre devient bien commun, les murs poussent plus vite et plus haut.", en: "When stone becomes a common good, the walls rise faster and higher." },
    effect: { fr: "Production d'infrastructure +180%.", en: "Infrastructure production +180%." }
  },
  {
    id: "nomad_ledgers",
    group: "ruins",
    name: { fr: "Livres nomades", en: "Nomad ledgers" },
    cost: { ruins: 3200000000 },
    effectType: "cityDiscount",
    amount: 0.18,
    desc: { fr: "Les comptes voyagent plus légèrement que les coffres. L'économie suit.", en: "Accounts travel lighter than coffers. The economy follows." },
    effect: { fr: "Coûts des moteurs -10%.", en: "Engine costs -10%." }
  },
  {
    id: "canal_charters",
    group: "ruins",
    name: { fr: "Chartes des canaux", en: "Canal charters" },
    cost: { ruins: 5000000000 },
    effectType: "infraDiscount",
    amount: 0.18,
    desc: { fr: "Chaque canal est aussi un accord. L'eau circule, l'argent suit.", en: "Every canal is also an accord. Water flows, money follows." },
    effect: { fr: "Coûts d'infrastructure -10%.", en: "Infrastructure costs -10%." }
  },
  {
    id: "vaulted_treasuries",
    group: "ruins",
    name: { fr: "Trésors voûtés", en: "Vaulted treasuries" },
    cost: { ruins: 5500000000 },
    effectType: "goldKeep",
    amount: 0.2,
    desc: { fr: "L'or qui survit aux empires est celui qui sait se cacher.", en: "The gold that outlives empires is the gold that knows how to hide." },
    effect: { fr: "Effondrements: trésor conservé +12%.", en: "Collapses: treasury preserved +12%." }
  },
  {
    id: "dead_language_schools",
    group: "ruins",
    name: { fr: "Écoles de langues mortes", en: "Schools of dead languages" },
    cost: { ruins: 3000000000 },
    effectType: "knowledgeDiscount",
    amount: 0.18,
    desc: { fr: "On y apprend des langues que plus personne ne parle. Pour lire les avertissements dans leur première version.", en: "Here they learn languages no one speaks anymore. To read the warnings in their first version." },
    effect: { fr: "Coûts du savoir -10%.", en: "Knowledge costs -10%." }
  },
  {
    id: "memory_courts",
    group: "ruins",
    name: { fr: "Cours de mémoire", en: "Courts of memory" },
    cost: { ruins: 5000000000 },
    effectType: "knowledgeKeep",
    amount: 0.14,
    desc: { fr: "Les témoins jurent devant des archives plus vieilles qu'eux. Ça évite le pire.", en: "Witnesses swear before archives older than themselves. It spares the worst." },
    effect: { fr: "Effondrements: savoir conservé +8%.", en: "Collapses: knowledge preserved +8%." }
  },
  {
    id: "codex_of_failures",
    group: "ruins",
    name: { fr: "Codex des échecs", en: "Codex of failures" },
    cost: { ruins: 10000000000 },
    effectType: "stability",
    amount: 0.035,
    desc: { fr: "Chaque page commence par une erreur. C'est le livre le plus important.", en: "Every page begins with a mistake. It is the most important book of all." },
    effect: { fr: "Pression de rupture -3.5 pts.", en: "Rupture pressure -3.5 pts." }
  },
  {
    id: "lamp_archives",
    group: "ruins",
    name: { fr: "Archives aux lampes", en: "Lamp archives" },
    cost: { ruins: 14000000000 },
    effectType: "startKnowledgePctPeak",
    amount: 0.12,
    desc: { fr: "Une lumière basse, des mains qui copient, des idées qui ne dorment pas.", en: "A low light, hands that copy, ideas that never sleep." },
    effect: { fr: "Chaque cycle commence avec 7% du pic de savoir précédent.", en: "Each cycle starts with 7% of the previous knowledge peak." }
  },
  {
    id: "counterfactual_histories",
    group: "ruins",
    name: { fr: "Histoires contrefactuelles", en: "Counterfactual histories" },
    cost: { ruins: 18000000000 },
    effectType: "knowledgeMult",
    amount: 5.4,
    desc: { fr: "On y étudie les mondes qui auraient pu tomber autrement. Ça aide à éviter les mêmes erreurs.", en: "Here they study the worlds that might have fallen otherwise. It helps avoid the same mistakes." },
    effect: { fr: "Production de savoir +300%.", en: "Knowledge production +300%." }
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
    id: "axiom_engine",
    group: "ruins",
    capstone: true,
    name: { fr: "Moteur d'axiomes", en: "Axiom engine" },
    cost: { ruins: 30000000000 },
    effectType: "globalMult",
    amount: 0.32,
    desc: { fr: "Quelques vérités simples y font tourner des empires entiers.", en: "A few simple truths keep entire empires turning here." },
    effect: { fr: "Capstone Cycle & Crise : production globale +32%.", en: "Cycle & Crisis Capstone: global production +32%." }
  },
  {
    id: "trait_theocracy",
    group: "ruins",
    name: { fr: "Théocratie", en: "Theocracy" },
    cost: { ruins: 0 },
    desc: { fr: "La richesse est devenue une forme de piété. Le savoir suit l'or.", en: "Wealth has become a form of piety. Knowledge follows gold." },
    effect: { fr: "Dogme: +1% du trésor actuel en savoir par seconde. Contrepartie: la rupture monte 25% plus vite.", en: "Dogma: +1% of current treasury as knowledge per second. Trade-off: rupture rises 25% faster." }
  },
  {
    id: "trait_nomadism",
    group: "ruins",
    name: { fr: "Nomadisme", en: "Nomadism" },
    cost: { ruins: 0 },
    desc: { fr: "La ville, c'est les gens, pas les pierres. On peut tout emporter.", en: "The city is the people, not the stones. Everything can be carried away." },
    effect: { fr: "Dogme: tous les bâtiments coûtent -30%. Contrepartie: l'infrastructure est plafonnée par la taille de la cité.", en: "Dogma: all buildings cost -30%. Trade-off: infrastructure is capped by the size of the city." }
  },
  {
    id: "skill_archaeology",
    group: "ruins",
    name: { fr: "Archéologie", en: "Archaeology" },
    cost: { ruins: 0 },
    desc: { fr: "Ce que l'ancien siècle a laissé, ce siècle peut l'exhumer et s'en servir.", en: "What the old century left behind, this century can unearth and use." },
    effect: { fr: "Active: une fois par cycle, dépense du savoir pour exhumer un bâtiment de la civilisation précédente.", en: "Active: once per cycle, spend knowledge to unearth a building from the previous civilization." }
  },
  {
    id: "dogma_communal_granaries",
    group: "ruins",
    name: { fr: "Communes vivrières", en: "Food communes" },
    cost: { ruins: 0 },
    effectType: "foodKeep",
    amount: 0.10,
    desc: { fr: "Personne ne mange avant les autres. C'est difficile, mais ça dure.", en: "No one eats before the others. It is hard, but it lasts." },
    effect: { fr: "Dogme: les effondrements conservent +10% de nourriture.", en: "Dogma: collapses preserve +10% food." }
  },
  {
    id: "dogma_medicine",
    group: "ruins",
    name: { fr: "Médecine civique", en: "Civic medicine" },
    cost: { ruins: 0 },
    effectType: "timeWearSlow",
    amount: 0.20,
    desc: { fr: "Les médecins viennent avant les sculpteurs. La cité en tient plus longtemps.", en: "Doctors come before sculptors. The city holds on longer for it." },
    effect: { fr: "Dogme: usure du temps -20%.", en: "Dogma: Time Wear -20%." }
  },
  {
    id: "dogma_stoic_rites",
    group: "ruins",
    name: { fr: "Rites de patience", en: "Rites of patience" },
    cost: { ruins: 0 },
    effectType: "stability",
    amount: 0.08,
    desc: { fr: "On ne panique pas. On a déjà vu ça, on sait ce qu'on fait.", en: "We do not panic. We have seen this before; we know what we are doing." },
    effect: { fr: "Dogme: pression de rupture -8 pts.", en: "Dogma: rupture pressure -8 pts." }
  },
  {
    id: "dogma_merchant_law",
    group: "ruins",
    name: { fr: "Droit marchand", en: "Merchant law" },
    cost: { ruins: 0 },
    effectType: "goldMult",
    amount: 0.75,
    desc: { fr: "Ce qui est écrit reste valable même quand les parties qui l'ont signé ne sont plus là.", en: "What is written holds even when the parties who signed it are gone." },
    effect: { fr: "Dogme: production de trésor +75%.", en: "Dogma: treasury production +75%." }
  },
  {
    id: "dogma_public_works",
    group: "ruins",
    name: { fr: "Grands travaux", en: "Public works" },
    cost: { ruins: 0 },
    effectType: "infraMult",
    amount: 0.65,
    desc: { fr: "Ce qu'on construit pour tous laisse une trace plus profonde que les décrets.", en: "What is built for all leaves a deeper mark than decrees." },
    effect: { fr: "Dogme: production d'infrastructure +65%.", en: "Dogma: infrastructure production +65%." }
  },
  {
    id: "dogma_free_academies",
    group: "ruins",
    name: { fr: "Académies libres", en: "Free academies" },
    cost: { ruins: 0 },
    effectType: "knowledgeMult",
    amount: 1.25,
    desc: { fr: "Quand tout le monde peut apprendre, les idées circulent plus vite que les rumeurs.", en: "When everyone can learn, ideas travel faster than rumors." },
    effect: { fr: "Dogme: production de savoir +125%.", en: "Dogma: knowledge production +125%." }
  },
  {
    id: "dogma_eternal_return",
    group: "ruins",
    name: { fr: "Éternel retour", en: "Eternal return" },
    cost: { ruins: 0 },
    effectType: "ruinGain",
    amount: 0.30,
    desc: { fr: "Chaque fin est une répétition générale. On finit par en tirer plus à chaque chute.", en: "Every ending is a dress rehearsal. We come to draw more from each fall." },
    effect: { fr: "Dogme: Ruines gagnées +30%.", en: "Dogma: Ruins gained +30%." }
  },
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
    id: "edit_effondrement",
    group: "ruins",
    unlockCycles: 3,
    name: { fr: "Édit d'effondrement", en: "Edict of collapse" },
    cost: { ruins: 15 },
    desc: { fr: "L'effondrement devient un acte programmé, déclenché sans hésitation le moment venu.", en: "Collapse becomes a scheduled act, triggered without hesitation when the time comes." },
    effect: { fr: "Débloque l'effondrement automatique configurable : à 100% de Rupture, à un seuil d'Usure, ou après une durée. Peut tenter Rationner/Réformes avant.", en: "Unlocks configurable automatic collapse: at 100% Rupture, at a Wear threshold, or after a set duration. Can attempt Ration/Reforms first." }
  },
  {
    id: "veilleurs_nuit_1",
    group: "ruins",
    unlockCycles: 1,
    name: { fr: "Veilleurs de nuit", en: "Night watch" },
    cost: { ruins: 8 },
    desc: { fr: "Quelques gardiens tiennent les registres pendant que la cité dort. Rien ne s'arrête vraiment.", en: "A few keepers hold the registers while the city sleeps. Nothing truly stops." },
    effect: { fr: "Gain hors-ligne : la cité produit et vieillit jusqu'à 4 h d'absence (au lieu de 2 h).", en: "Offline gains: the city produces and ages for up to 4 h away (instead of 2 h)." }
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

// Arbre de prestige à PALIERS À CHOIX (et non plus rails linéaires) :
// chaque branche est une suite de `tiers` (paliers) ; un nœud du palier t devient
// disponible quand on possède au moins `unlock[t]` nœuds des paliers INFÉRIEURS —
// un compteur, pas un nœud précis. On peut donc SAUTER ~40 % de chaque palier et
// choisir sa spécialisation. `unlock[0] = 0` (premier palier toujours ouvert).
// Conséquence clé : un `conflictsWith` (choix exclusif) ne sévère plus jamais
// l'aval — bloquer un nœud n'empêche pas le compteur d'atteindre le seuil suivant.
export const PRESTIGE_TREE_BRANCHES = [
  {
    id: "resilience",
    name: { fr: "Résilience", en: "Resilience" },
    hint: { fr: "Population, nourriture, stabilité et résistance à l'usure.", en: "Population, food, stability, and resistance to wear." },
    unlock: [0, 3, 5, 8, 11],
    tiers: [
      ["root_cellars", "ember_baskets", "granaries", "smoke_calendar"],
      ["stone_bread", "crisis_theatre", "echo_census"],
      ["ten_thousand_storehouses", "winter_granaries", "river_seedbanks"],
      ["ash_medicine", "green_census", "mother_walls", "seasonal_oaths"],
      ["patient_bloodlines", "last_refuges"]
    ]
  },
  {
    id: "prosperity",
    name: { fr: "Prospérité", en: "Prosperity" },
    hint: { fr: "Trésor, infrastructures, routes, coûts de construction et conservation matérielle.", en: "Treasury, infrastructure, roads, building costs, and material preservation." },
    unlock: [0, 3, 6, 9, 13],
    tiers: [
      ["ash_paths", "fallen_roads", "cracked_scales", "silent_wells"],
      ["buried_tolls", "old_coin_molds", "forgotten_wharves", "rubble_survey"],
      ["bronze_foundations", "palace_of_receipts", "immortal_blueprint", "silver_roads"],
      ["public_quarries", "nomad_ledgers", "canal_charters", "vaulted_treasuries"],
      ["deep_foundry"]
    ]
  },
  {
    id: "knowledge",
    name: { fr: "Connaissance", en: "Knowledge" },
    hint: { fr: "Savoir, archives, mémoire longue et coûts de recherche.", en: "Knowledge, archives, long memory, and research costs." },
    unlock: [0, 3, 6, 8],
    tiers: [
      ["bone_ledgers", "oral_tradition", "rubble_contracts", "sunken_scriptorium"],
      ["mirror_archives", "first_grammar", "ivory_questions"],
      ["ritual_accounting", "dead_language_schools", "memory_courts"],
      ["lamp_archives", "counterfactual_histories", "chronicle_engine"]
    ]
  },
  {
    id: "cycle_crise",
    name: { fr: "Cycle & Crise", en: "Cycle & Crisis" },
    hint: { fr: "Gain de ruines, arbitrages d'effondrement, automatisation des crises et gains hors-ligne.", en: "Ruin gains, collapse trade-offs, crisis automation, and offline gains." },
    unlock: [0, 3, 6],
    tiers: [
      ["conseil_de_crise", "veilleurs_nuit_1", "edit_effondrement", "ruin_liturgy"],
      ["foundation_ghosts", "recurring_ages", "veilleurs_nuit_4", "crowned_debris"],
      ["burial_math", "codex_of_failures", "collapse_taxonomy", "axiom_engine"]
    ]
  }
];

export const PRESTIGE_DOGMAS = [
  { id: "dogma_communal_granaries", tier: { fr: "Palier I", en: "Tier I" }, requiredPurchases: 4, branch: "resilience" },
  { id: "dogma_medicine", tier: { fr: "Palier II", en: "Tier II" }, requiredPurchases: 8, branch: "resilience" },
  { id: "dogma_stoic_rites", tier: { fr: "Palier III", en: "Tier III" }, requiredPurchases: 12, branch: "resilience" },
  { id: "trait_nomadism", tier: { fr: "Palier I", en: "Tier I" }, requiredPurchases: 4, branch: "prosperity" },
  { id: "dogma_merchant_law", tier: { fr: "Palier II", en: "Tier II" }, requiredPurchases: 8, branch: "prosperity" },
  { id: "dogma_public_works", tier: { fr: "Palier III", en: "Tier III" }, requiredPurchases: 13, branch: "prosperity" },
  { id: "trait_theocracy", tier: { fr: "Palier I", en: "Tier I" }, requiredPurchases: 4, branch: "knowledge" },
  { id: "skill_archaeology", tier: { fr: "Palier II", en: "Tier II" }, requiredPurchases: 7, branch: "knowledge" },
  { id: "dogma_free_academies", tier: { fr: "Palier III", en: "Tier III" }, requiredPurchases: 10, branch: "knowledge" },
  { id: "dogma_eternal_return", tier: { fr: "Palier I", en: "Tier I" }, requiredPurchases: 5, branch: "cycle_crise" }
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
