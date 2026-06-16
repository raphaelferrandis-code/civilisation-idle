"use strict";

/* ============================================================================
 * data-upgrades.js - Donnees ruines/prestige: ruinPaths, upgrades, PRESTIGE_TREE_BRANCHES, PRESTIGE_DOGMAS, dogmaIds, PRESTIGE_TREE.
 * Ordre de chargement (index.html): U -> DB -> DU -> DW -> ST -> ME -> EV -> AC -> RE -> MA
 * Scope global partage (pas de modules) - ne pas envelopper dans une IIFE.
 * ============================================================================ */

export const ruinPaths = [
  {
    id: "abundance",
    name: "Abondance",
    hint: "Nourriture, réserves et relance des premiers jours.",
    types: ["foodMult", "startFood", "foodKeep"],
    ids: ["root_cellars", "granaries", "ancestor_granaries", "ember_baskets"]
  },
  {
    id: "treasure",
    name: "Trésor",
    hint: "Argent, commerce et richesses conservées.",
    types: ["goldMult", "startGold", "goldKeep"],
    ids: ["buried_coins", "ash_markets", "ash_contracts"]
  },
  {
    id: "knowledge",
    name: "Savoir",
    hint: "Mémoire, recherche et savoir qui survit aux chutes.",
    types: ["knowledgeMult", "startKnowledge", "knowledgeKeep", "knowledgeDiscount"],
    ids: ["charcoal_tablets", "memory_scribes"]
  },
  {
    id: "foundations",
    name: "Fondations",
    hint: "Infrastructure, coûts, routes et bases conservées.",
    types: ["infraMult", "infraDiscount", "infraKeep"],
    ids: ["fallen_roads", "old_wall_maps"]
  },
  {
    id: "rupture",
    name: "Rupture",
    hint: "Options qui accélèrent ou ralentissent la crise.",
    types: ["stability", "ruptureHaste", "timeWearSlow", "ruinGain"],
    ids: ["ruin_liturgy", "recurring_ages"]
  },
  {
    id: "relaunch",
    name: "Relance",
    hint: "Bonus globaux, population, clics et puissance des ruines gardées.",
    types: ["globalMult", "populationMult", "startPopulation", "cityDiscount", "unspentRuinsPower", "chronicleEngine"],
    ids: ["oral_tradition", "salvage_crews", "broken_milestones"]
  }
];

export const upgrades = [
  {
    id: "root_cellars",
    group: "ruins",
    name: "Caves racines",
    cost: { ruins: 1 },
    desc: "Les cachettes survivent aux empires. Quelqu'un l'a compris très tôt.",
    effect: "Production de nourriture +60%."
  },
  {
    id: "buried_coins",
    group: "ruins",
    name: "Monnaies enterrées",
    cost: { ruins: 2 },
    desc: "L'argent enterré perd du temps, mais pas des guerres.",
    effect: "Production de trésor +60%."
  },
  {
    id: "charcoal_tablets",
    group: "ruins",
    name: "Tablettes de charbon",
    cost: { ruins: 2 },
    desc: "Sur les murs calcinés, les signes tenaient encore. Quelqu'un a pensé à les recopier.",
    effect: "Production de savoir +60%."
  },
  {
    id: "oral_tradition",
    group: "ruins",
    name: "Tradition orale",
    cost: { ruins: 6 },
    desc: "Ce qu'on dit à voix basse résiste mieux aux incendies que les bibliothèques.",
    effect: "Mémoire des pierres: bonus de ruines renforcé."
  },
  {
    id: "granaries",
    group: "ruins",
    name: "Greniers cycliques",
    cost: { ruins: 12 },
    desc: "Tout le monde ne survit pas. Juste assez pour que l'histoire continue.",
    effect: "Les survivants repartent avec un socle de population."
  },
  {
    id: "salvage_crews",
    group: "ruins",
    unlockCycles: 1,
    name: "Équipes de récupération",
    cost: { ruins: 5 },
    desc: "Les survivants savent où regarder en premier.",
    effect: "Les clics sur la cité donnent un peu plus de nourriture et de trésor."
  },
  {
    id: "broken_milestones",
    group: "ruins",
    unlockCycles: 1,
    name: "Bornes brisées",
    cost: { ruins: 7 },
    desc: "Les vieilles routes ne mènent plus nulle part, mais elles indiquent encore les distances.",
    effect: "Les coûts des moteurs baissent légèrement."
  },
  {
    id: "fallen_roads",
    group: "ruins",
    unlockCycles: 2,
    name: "Routes ensevelies",
    cost: { ruins: 8 },
    desc: "Le chemin existe déjà sous la boue. Il suffit de gratter.",
    effect: "Chaque nouveau cycle commence avec une petite base d'infrastructure."
  },
  {
    id: "ancestor_granaries",
    group: "ruins",
    unlockCycles: 3,
    name: "Greniers des ancêtres",
    cost: { ruins: 45 },
    desc: "Les ancêtres ont fait les erreurs de la disette. Vous, non.",
    effect: "Les resets conservent plus de nourriture."
  },
  {
    id: "memory_scribes",
    group: "ruins",
    unlockCycles: 5,
    name: "Scribes de mémoire",
    cost: { ruins: 65 },
    desc: "Certains n'écrivent que les erreurs. C'est la bibliothèque la plus utile.",
    effect: "Une petite part du savoir survit toujours aux effondrements."
  },
  {
    id: "ash_contracts",
    group: "ruins",
    unlockCycles: 5,
    name: "Contrats de cendre",
    cost: { ruins: 75 },
    desc: "Les dettes d'avant l'effondrement ont la dent dure.",
    effect: "Le trésor conservé par les crises augmente."
  },
  {
    id: "ash_markets",
    group: "ruins",
    unlockCycles: 2,
    name: "Marchés de cendres",
    cost: { ruins: 18 },
    desc: "Les survivants commercent autour des décombres avant même d'avoir fini de pleurer.",
    effect: "Les effondrements conservent une meilleure part du trésor."
  },
  {
    id: "ruin_liturgy",
    group: "ruins",
    unlockCycles: 3,
    name: "Liturgie des ruines",
    cost: { ruins: 35 },
    desc: "Quand la chute devient un rite, elle fait moins mal au cycle suivant.",
    effect: "Les ruines calment une partie de la pression de dissidence."
  },
  {
    id: "old_wall_maps",
    group: "ruins",
    unlockCycles: 2,
    name: "Cartes des anciens murs",
    cost: { ruins: 24 },
    desc: "Les anciens murs délimitaient encore les routes, même effondrés.",
    effect: "Les coûts d'infrastructure baissent légèrement après plusieurs chutes."
  },
  {
    id: "recurring_ages",
    group: "ruins",
    unlockCycles: 8,
    name: "Âges récurrents",
    cost: { ruins: 90 },
    desc: "Certaines époques reviennent si souvent qu'elles finissent par ressembler à des habitudes.",
    effect: "L'âge maximum atteint renforce légèrement la production globale."
  },
  {
    id: "ember_baskets",
    group: "ruins",
    name: "Paniers de braises",
    cost: { ruins: 2 },
    effectType: "startFood",
    amount: 40,
    desc: "Le feu voyage dans des paniers depuis plus longtemps qu'il n'existe de cités.",
    effect: "Chaque cycle commence avec plus de nourriture."
  },
  {
    id: "bone_ledgers",
    group: "ruins",
    name: "Registres d'os",
    cost: { ruins: 4 },
    effectType: "knowledgeMult",
    amount: 0.15,
    desc: "Des comptes gravés dans l'os. Difficiles à brûler, impossibles à perdre.",
    effect: "Production de savoir +15%."
  },
  {
    id: "ash_paths",
    group: "ruins",
    name: "Sentiers de cendre",
    cost: { ruins: 6 },
    effectType: "cityDiscount",
    amount: 0.03,
    desc: "La cendre garde la forme des chemins qu'elle a recouverts.",
    effect: "Coûts des moteurs -3%."
  },
  {
    id: "cracked_scales",
    group: "ruins",
    name: "Balances fendues",
    cost: { ruins: 9 },
    effectType: "goldMult",
    amount: 0.18,
    desc: "Cassées, elles mesurent encore. L'étalon survit à l'instrument.",
    effect: "Production de trésor +18%."
  },
  {
    id: "seed_vaults",
    group: "ruins",
    name: "Coffres à graines",
    cost: { ruins: 14 },
    effectType: "foodMult",
    amount: 0.22,
    desc: "Les graines attendent dans le noir, plus patientes que les royaumes qui les ont oubliées.",
    effect: "Production de nourriture +22%."
  },
  {
    id: "silent_wells",
    group: "ruins",
    name: "Puits silencieux",
    cost: { ruins: 21 },
    effectType: "infraMult",
    amount: 0.15,
    desc: "L'eau est là depuis avant la cité. Elle sera là après.",
    effect: "Production d'infrastructure +15%."
  },
  {
    id: "burnt_abacus",
    group: "ruins",
    unlockCycles: 1,
    name: "Abaque brûlé",
    cost: { ruins: 32 },
    effectType: "knowledgeMult",
    amount: 0.22,
    desc: "Ses billes manquent, mais les calculs qui comptent sont encore lisibles.",
    effect: "Production de savoir +22%."
  },
  {
    id: "charred_ploughs",
    group: "ruins",
    unlockCycles: 1,
    name: "Charrues charbonnées",
    cost: { ruins: 48 },
    effectType: "foodMult",
    amount: 0.32,
    desc: "La terre brûlée est la plus fertile. Ça vaut aussi pour les civilisations.",
    effect: "Production de nourriture +32%."
  },
  {
    id: "buried_tolls",
    group: "ruins",
    unlockCycles: 1,
    name: "Péages ensevelis",
    cost: { ruins: 72 },
    effectType: "goldMult",
    amount: 0.3,
    desc: "L'ancienne taxe est devenue un réflexe. La route veut toujours quelque chose.",
    effect: "Production de trésor +30%."
  },
  {
    id: "foundation_ghosts",
    group: "ruins",
    name: "Ruines en réserve",
    cost: { ruins: 60 },
    effectType: "unspentRuinsPower",
    amount: 0.01,
    desc: "Les murs tombés indiquent encore où poser les prochains. Rien ne se perd vraiment.",
    effect: "Production globale +1% par ruine non dépensée."
  },
  {
    id: "smoke_calendar",
    group: "ruins",
    unlockCycles: 2,
    name: "Calendrier de fumée",
    cost: { ruins: 90 },
    effectType: "timeWearSlow",
    amount: 0.08,
    desc: "Les saisons y sont notées par la couleur des fumées. Ça marche.",
    effect: "Usure du temps -8%."
  },
  {
    id: "rubble_contracts",
    group: "ruins",
    unlockCycles: 2,
    name: "Contrats de gravats",
    cost: { ruins: 130 },
    effectType: "knowledgeDiscount",
    amount: 0.05,
    desc: "Les promesses signées sur des pierres cassées tiennent mieux que celles sur parchemin.",
    effect: "Coûts du savoir -5%."
  },
  {
    id: "ancestral_markets",
    group: "ruins",
    unlockCycles: 2,
    name: "Marchés ancestraux",
    cost: { ruins: 190 },
    effectType: "goldMult",
    amount: 0.45,
    desc: "Les vieilles places de marché ont la mémoire des prix.",
    effect: "Production de trésor +45%."
  },
  {
    id: "clay_cisterns",
    group: "ruins",
    unlockCycles: 2,
    name: "Citernes d'argile",
    cost: { ruins: 280 },
    effectType: "foodKeep",
    amount: 0.04,
    desc: "L'argile garde mieux les lendemains que les serments.",
    effect: "Effondrements: nourriture conservée +4%."
  },
  {
    id: "sunken_scriptorium",
    group: "ruins",
    unlockCycles: 2,
    name: "Scriptorium englouti",
    cost: { ruins: 420 },
    effectType: "knowledgeKeep",
    amount: 0.03,
    desc: "Sous l'eau, l'encre a refusé de disparaître. Quelqu'un en a fait une théologie.",
    effect: "Effondrements: savoir conservé +3%."
  },
  {
    id: "old_coin_molds",
    group: "ruins",
    unlockCycles: 3,
    name: "Moules à monnaie",
    cost: { ruins: 650 },
    effectType: "goldKeep",
    amount: 0.04,
    desc: "Les visages gravés dans le métal durent plus longtemps que ceux qui les ont commandés.",
    effect: "Effondrements: trésor conservé +4%."
  },
  {
    id: "stone_bread",
    group: "ruins",
    unlockCycles: 3,
    name: "Pain de pierre",
    cost: { ruins: 1000 },
    effectType: "foodMult",
    amount: 0.55,
    conflictsWith: "mirror_archives",
    desc: "Une légende absurde sur du grain qui ne meurt pas. Mais les greniers s'ouvrent mieux après.",
    effect: "Production de nourriture +55%."
  },
  {
    id: "mirror_archives",
    group: "ruins",
    unlockCycles: 3,
    name: "Archives miroirs",
    cost: { ruins: 1500 },
    effectType: "knowledgeMult",
    amount: 0.55,
    conflictsWith: "stone_bread",
    desc: "Chaque texte y semble écrit par deux peuples différents. L'un d'eux avait raison.",
    effect: "Production de savoir +55%."
  },
  {
    id: "crowned_debris",
    group: "ruins",
    unlockCycles: 3,
    name: "Débris couronnés",
    cost: { ruins: 4500 },
    effectType: "ruinGain",
    amount: 0.15,
    desc: "Un fragment de palais suffit à fonder une prétention.",
    effect: "Ruines gagnées +15%."
  },
  {
    id: "tilted_milestones",
    group: "ruins",
    unlockCycles: 3,
    name: "Bornes penchées",
    cost: { ruins: 6800 },
    effectType: "cityDiscount",
    amount: 0.05,
    desc: "Elles ne montrent plus la bonne distance. Mais encore la bonne direction.",
    effect: "Coûts des moteurs -5%."
  },
  {
    id: "burial_math",
    group: "ruins",
    unlockCycles: 4,
    name: "Mathématique funéraire",
    cost: { ruins: 10000 },
    effectType: "ruptureHaste",
    amount: 0.08,
    conflictsWith: "crisis_theatre",
    desc: "Les tombes sont alignées avec une précision que les vivants n'atteignent pas.",
    effect: "Pression de rupture +4 pts."
  },
  {
    id: "ashen_libraries",
    group: "ruins",
    unlockCycles: 4,
    name: "Bibliothèques cendrées",
    cost: { ruins: 15000 },
    effectType: "knowledgeMult",
    amount: 0.85,
    desc: "Les livres ont brûlé. Les idées, elles, ont survécu dans les têtes des lecteurs.",
    effect: "Production de savoir +85%."
  },
  {
    id: "forgotten_wharves",
    group: "ruins",
    unlockCycles: 4,
    name: "Quais oubliés",
    cost: { ruins: 23000 },
    effectType: "goldMult",
    amount: 0.85,
    desc: "Les amarres sont coupées depuis longtemps. Les habitudes de commerce, non.",
    effect: "Production de trésor +85%."
  },
  {
    id: "green_ruins",
    group: "ruins",
    unlockCycles: 4,
    name: "Ruines vertes",
    cost: { ruins: 35000 },
    effectType: "foodMult",
    amount: 1,
    desc: "Des figuiers poussent dans les salles du trône. C'est peut-être ça, l'optimisme.",
    effect: "Production de nourriture +100%."
  },
  {
    id: "buried_engineers",
    group: "ruins",
    unlockCycles: 4,
    name: "Ingénieurs enterrés",
    cost: { ruins: 52000 },
    effectType: "infraMult",
    amount: 0.75,
    desc: "Leurs plans sont incomplets. Leurs erreurs, elles, sont précieuses.",
    effect: "Production d'infrastructure +75%."
  },
  {
    id: "age_sutures",
    group: "ruins",
    unlockCycles: 5,
    name: "Sutures d'âge",
    cost: { ruins: 78000 },
    effectType: "timeWearSlow",
    amount: 0.12,
    desc: "Le temps se referme mal autour des vieilles catastrophes. C'est utile.",
    effect: "Usure du temps -12%."
  },
  {
    id: "crisis_theatre",
    group: "ruins",
    unlockCycles: 5,
    name: "Théâtre des crises",
    cost: { ruins: 120000 },
    effectType: "stability",
    amount: 0.03,
    conflictsWith: "burial_math",
    desc: "Rejouer les catastrophes passées pour apprivoiser la prochaine. Ça aide, un peu.",
    effect: "Pression de rupture -3 pts."
  },
  {
    id: "dynastic_seeds",
    group: "ruins",
    unlockCycles: 5,
    name: "Graines dynastiques",
    cost: { ruins: 180000 },
    effectType: "startPopulation",
    amount: 25,
    desc: "Certaines familles savent déjà qu'elles vont durer. Ça change tout.",
    effect: "Chaque cycle commence avec plus de population."
  },
  {
    id: "fossil_taxes",
    group: "ruins",
    unlockCycles: 5,
    name: "Impôts fossiles",
    cost: { ruins: 270000 },
    effectType: "startGold",
    amount: 250,
    desc: "La dette survit mieux que les palais qui l'ont générée.",
    effect: "Chaque cycle commence avec plus de trésor."
  },
  {
    id: "first_grammar",
    group: "ruins",
    unlockCycles: 5,
    name: "Première grammaire",
    cost: { ruins: 400000 },
    effectType: "startKnowledge",
    amount: 120,
    desc: "Les premières règles du langage ont tout changé. La deuxième fois, ça va plus vite.",
    effect: "Chaque cycle commence avec plus de savoir."
  },
  {
    id: "rubble_survey",
    group: "ruins",
    unlockCycles: 6,
    name: "Arpentage des gravats",
    cost: { ruins: 600000 },
    effectType: "infraDiscount",
    amount: 0.08,
    desc: "Mesurer les ruines, c'est la première étape pour ne pas les reproduire.",
    effect: "Coûts d'infrastructure -8%."
  },
  {
    id: "dead_road_network",
    group: "ruins",
    unlockCycles: 6,
    name: "Réseau de routes mortes",
    cost: { ruins: 900000 },
    effectType: "cityDiscount",
    amount: 0.08,
    desc: "Les nouvelles jambes prennent les vieilles routes. Elles arrivent plus vite.",
    effect: "Coûts des moteurs -8%."
  },
  {
    id: "blackboard_walls",
    group: "ruins",
    unlockCycles: 6,
    name: "Murs tableaux",
    cost: { ruins: 1300000 },
    effectType: "knowledgeDiscount",
    amount: 0.08,
    desc: "La pluie efface les leçons sur les murs. Les enfants les mémorisent avant.",
    effect: "Coûts du savoir -8%."
  },
  {
    id: "ruined_mandate",
    group: "ruins",
    unlockCycles: 6,
    name: "Mandat ruiné",
    cost: { ruins: 2000000 },
    effectType: "ruptureHaste",
    amount: 0.16,
    desc: "Les peuples reconnaissent les signes d'une chute familière. Ça va vite.",
    effect: "Pression de rupture +8 pts."
  },
  {
    id: "echo_census",
    group: "ruins",
    unlockCycles: 6,
    name: "Recensement d'écho",
    cost: { ruins: 3000000 },
    effectType: "populationMult",
    amount: 0.35,
    desc: "Les absents sont comptés avec les vivants. Pour ne pas recommencer seuls.",
    effect: "Croissance de population +35%."
  },
  {
    id: "salted_memory",
    group: "ruins",
    unlockCycles: 7,
    name: "Mémoire salée",
    cost: { ruins: 4500000 },
    effectType: "knowledgeKeep",
    amount: 0.06,
    desc: "Ce qui est conservé dans le sel pique encore longtemps après.",
    effect: "Effondrements: savoir conservé +6%."
  },
  {
    id: "bronze_foundations",
    group: "ruins",
    unlockCycles: 7,
    name: "Fondations de bronze",
    cost: { ruins: 6800000 },
    effectType: "infraKeep",
    amount: 0.05,
    desc: "Certaines bases refusent de redevenir poussière. On s'en sort.",
    effect: "Effondrements: infrastructure conservée +5%."
  },
  {
    id: "ancestor_stipends",
    group: "ruins",
    unlockCycles: 7,
    name: "Rentes des ancêtres",
    cost: { ruins: 10000000 },
    effectType: "goldKeep",
    amount: 0.08,
    desc: "Les morts financent mal, mais longtemps et sans se plaindre.",
    effect: "Effondrements: trésor conservé +8%."
  },
  {
    id: "evergreen_fields",
    group: "ruins",
    unlockCycles: 7,
    name: "Champs toujours verts",
    cost: { ruins: 15000000 },
    effectType: "foodMult",
    amount: 1.8,
    desc: "La terre pousse comme si elle avait peur du silence.",
    effect: "Production de nourriture +180%."
  },
  {
    id: "silver_ghosts",
    group: "ruins",
    unlockCycles: 7,
    name: "Fantômes d'argent",
    cost: { ruins: 23000000 },
    effectType: "goldMult",
    amount: 1.8,
    desc: "L'argent fantôme circule encore. Personne ne sait vraiment d'où il vient.",
    effect: "Production de trésor +180%."
  },
  {
    id: "ivory_questions",
    group: "ruins",
    unlockCycles: 8,
    name: "Questions d'ivoire",
    cost: { ruins: 35000000 },
    effectType: "knowledgeMult",
    amount: 1.8,
    desc: "Trop belles pour des réponses simples. C'est pour ça qu'elles durent.",
    effect: "Production de savoir +180%."
  },
  {
    id: "cyclopean_blocks",
    group: "ruins",
    unlockCycles: 8,
    name: "Blocs cyclopéens",
    cost: { ruins: 52000000 },
    effectType: "infraMult",
    amount: 1.4,
    desc: "Personne ne sait qui les a portés. Tout le monde construit autour.",
    effect: "Production d'infrastructure +140%."
  },
  {
    id: "ritual_accounting",
    group: "ruins",
    unlockCycles: 8,
    name: "Comptabilité rituelle",
    cost: { ruins: 78000000 },
    effectType: "globalMult",
    amount: 0.18,
    desc: "Les nombres sont devenus des gestes. Les gestes, des lois.",
    effect: "Production globale +18%."
  },
  {
    id: "deep_foundry",
    group: "ruins",
    unlockCycles: 8,
    name: "Fonderie profonde",
    cost: { ruins: 120000000 },
    effectType: "globalMult",
    amount: 0.24,
    desc: "Sous les décombres, le métal apprend une seconde chaleur.",
    effect: "Production globale +24%."
  },
  {
    id: "cradle_of_laws",
    group: "ruins",
    unlockCycles: 9,
    name: "Berceau des lois",
    cost: { ruins: 180000000 },
    effectType: "stability",
    amount: 0.05,
    desc: "La première règle n'est pas écrite — elle est répétée jusqu'à ce qu'elle devienne évidente.",
    effect: "Pression de rupture -5 pts."
  },
  {
    id: "ten_thousand_storehouses",
    group: "ruins",
    unlockCycles: 9,
    name: "Dix mille réserves",
    cost: { ruins: 270000000 },
    effectType: "startFood",
    amount: 250000,
    desc: "La famine cherche une entrée. Elle trouve des portes fermées partout.",
    effect: "Chaque cycle commence avec beaucoup plus de nourriture."
  },
  {
    id: "palace_of_receipts",
    group: "ruins",
    unlockCycles: 9,
    name: "Palais des quittances",
    cost: { ruins: 400000000 },
    effectType: "startGold",
    amount: 100000,
    desc: "Le trésor physique a déménagé ici. Les preuves de paiement ont plus de gardes que les princes.",
    effect: "Chaque cycle commence avec beaucoup plus de trésor."
  },
  {
    id: "library_under_world",
    group: "ruins",
    unlockCycles: 9,
    name: "Bibliothèque souterraine",
    cost: { ruins: 600000000 },
    effectType: "startKnowledge",
    amount: 50000,
    desc: "Les livres y respirent dans l'ombre minérale, patients comme de la géologie.",
    effect: "Chaque cycle commence avec beaucoup plus de savoir."
  },
  {
    id: "immortal_blueprint",
    group: "ruins",
    unlockCycles: 10,
    name: "Plan immortel",
    cost: { ruins: 900000000 },
    effectType: "infraKeep",
    amount: 0.12,
    desc: "Une ville entière tient dans ces traits. Elle peut être rebâtie après n'importe quel feu.",
    effect: "Effondrements: infrastructure conservée +12%."
  },
  {
    id: "chronicle_engine",
    group: "ruins",
    unlockCycles: 10,
    name: "Machine chronique",
    cost: { ruins: 1300000000 },
    effectType: "chronicleEngine",
    amount: 0.03,
    desc: "Elle transforme chaque fin en chapitre. L'histoire ne s'arrête plus — elle recommence.",
    effect: "Capstone: chaque achat de ruines renforce toute la production, et les ruines non dépensées ajoutent un bonus."
  },
  {
    id: "root_hospices",
    group: "ruins",
    name: "Hospices racines",
    cost: { ruins: 800000000 },
    effectType: "populationMult",
    amount: 0.55,
    desc: "Une société se mesure à comment elle traite ceux qui ne peuvent pas se défendre seuls.",
    effect: "Croissance de population +55%."
  },
  {
    id: "winter_granaries",
    group: "ruins",
    name: "Greniers d'hiver",
    cost: { ruins: 1200000000 },
    effectType: "foodKeep",
    amount: 0.08,
    desc: "Les mauvaises saisons y sont attendues. On les connaît par leur nom.",
    effect: "Effondrements: nourriture conservée +8%."
  },
  {
    id: "slow_calendar",
    group: "ruins",
    name: "Calendrier lent",
    cost: { ruins: 1800000000 },
    effectType: "timeWearSlow",
    amount: 0.1,
    desc: "Ici le temps est compté en respirations, pas en journées. Il passe autrement.",
    effect: "Usure du temps -10%."
  },
  {
    id: "plague_records",
    group: "ruins",
    name: "Registres des pestes",
    cost: { ruins: 2700000000 },
    effectType: "populationMult",
    amount: 0.75,
    desc: "Les morts ont enseigné où ne plus se rassembler. Les vivants ont appris.",
    effect: "Croissance de population +75%."
  },
  {
    id: "famine_laws",
    group: "ruins",
    name: "Lois de famine",
    cost: { ruins: 4000000000 },
    effectType: "stability",
    amount: 0.025,
    desc: "Quand les stocks baissent, la loi parle avant la foule. Ça évite le pire.",
    effect: "Pression de rupture -2.5 pts."
  },
  {
    id: "river_seedbanks",
    group: "ruins",
    name: "Semences du fleuve",
    cost: { ruins: 6000000000 },
    effectType: "foodMult",
    amount: 2.4,
    desc: "Chaque crue enterre une graine et la rend plus nombreuse.",
    effect: "Production de nourriture +240%."
  },
  {
    id: "ash_medicine",
    group: "ruins",
    name: "Médecine de cendre",
    cost: { ruins: 9000000000 },
    effectType: "timeWearSlow",
    amount: 0.16,
    desc: "Les remèdes les plus anciens sentent le feu éteint et la terre après la pluie.",
    effect: "Usure du temps -16%."
  },
  {
    id: "green_census",
    group: "ruins",
    name: "Recensement vert",
    cost: { ruins: 13000000000 },
    effectType: "startPopulation",
    amount: 120,
    desc: "Les noms de famille repoussent avec les jardins. Les gens reviennent.",
    effect: "Chaque cycle commence avec +120 population."
  },
  {
    id: "mother_walls",
    group: "ruins",
    name: "Murs nourriciers",
    cost: { ruins: 17000000000 },
    effectType: "foodKeep",
    amount: 0.1,
    desc: "Ces murs ne protègent pas les palais. Ils protègent la nourriture.",
    effect: "Effondrements: nourriture conservée +10%."
  },
  {
    id: "seasonal_oaths",
    group: "ruins",
    name: "Serments saisonniers",
    cost: { ruins: 21000000000 },
    effectType: "stability",
    amount: 0.04,
    desc: "A chaque saison, la cite repete pourquoi elle existe. Ca aide a tenir.",
    effect: "Pression de rupture -4 pts."
  },
  {
    id: "deep_wells",
    group: "ruins",
    name: "Puits profonds",
    cost: { ruins: 25000000000 },
    effectType: "startFood",
    amount: 1000000,
    desc: "L'eau ici remonte d'avant la premiere cite. Elle sera la apres la derniere.",
    effect: "Chaque cycle commence avec beaucoup plus de nourriture."
  },
  {
    id: "patient_bloodlines",
    group: "ruins",
    name: "Lignées patientes",
    cost: { ruins: 30000000000 },
    effectType: "populationMult",
    amount: 1.2,
    desc: "Ces lignées ont appris à ne pas confondre survivre et attendre. Il y a une différence.",
    effect: "Croissance de population +120%."
  },
  {
    id: "last_refuges",
    group: "ruins",
    name: "Derniers refuges",
    cost: { ruins: 35000000000 },
    effectType: "timeWearSlow",
    amount: 0.22,
    desc: "Ces lieux savent encore fermer leurs portes quand tout le reste tombe.",
    effect: "Usure du temps -22%."
  },
  {
    id: "silver_roads",
    group: "ruins",
    name: "Routes d'argent",
    cost: { ruins: 1400000000 },
    effectType: "goldMult",
    amount: 2.4,
    desc: "Elles brillent surtout la nuit, quand les marchands mentent moins.",
    effect: "Production de tresor +240%."
  },
  {
    id: "public_quarries",
    group: "ruins",
    name: "Carrieres publiques",
    cost: { ruins: 2100000000 },
    effectType: "infraMult",
    amount: 1.8,
    desc: "Quand la pierre devient bien commun, les murs poussent plus vite et plus haut.",
    effect: "Production d'infrastructure +180%."
  },
  {
    id: "nomad_ledgers",
    group: "ruins",
    name: "Livres nomades",
    cost: { ruins: 3200000000 },
    effectType: "cityDiscount",
    amount: 0.1,
    desc: "Les comptes voyagent plus légèrement que les coffres. L'économie suit.",
    effect: "Coûts des moteurs -10%."
  },
  {
    id: "canal_charters",
    group: "ruins",
    name: "Chartes des canaux",
    cost: { ruins: 5000000000 },
    effectType: "infraDiscount",
    amount: 0.1,
    desc: "Chaque canal est aussi un accord. L'eau circule, l'argent suit.",
    effect: "Couts d'infrastructure -10%."
  },
  {
    id: "vaulted_treasuries",
    group: "ruins",
    name: "Trésors voûtés",
    cost: { ruins: 5500000000 },
    effectType: "goldKeep",
    amount: 0.12,
    desc: "L'or qui survit aux empires est celui qui sait se cacher.",
    effect: "Effondrements: trésor conservé +12%."
  },
  {
    id: "imperial_scaffolds",
    group: "ruins",
    name: "Échafaudages impériaux",
    cost: { ruins: 8000000000 },
    effectType: "infraKeep",
    amount: 0.1,
    desc: "Même démontés, ils indiquent encore comment aller haut.",
    effect: "Effondrements: infrastructure conservée +10%."
  },
  {
    id: "ink_relics",
    group: "ruins",
    name: "Reliques d'encre",
    cost: { ruins: 1900000000 },
    effectType: "knowledgeMult",
    amount: 2.4,
    desc: "L'encre séchée pèse comme une preuve. Personne ne la conteste.",
    effect: "Production de savoir +240%."
  },
  {
    id: "dead_language_schools",
    group: "ruins",
    name: "Écoles de langues mortes",
    cost: { ruins: 3000000000 },
    effectType: "knowledgeDiscount",
    amount: 0.1,
    desc: "On y apprend des langues que plus personne ne parle. Pour lire les avertissements dans leur première version.",
    effect: "Coûts du savoir -10%."
  },
  {
    id: "oracle_tables",
    group: "ruins",
    name: "Tables d'oracle",
    cost: { ruins: 3500000000 },
    effectType: "ruinGain",
    amount: 0.25,
    desc: "Elles ne prédisent pas la chute. Elles savent juste l'utiliser.",
    effect: "Ruines gagnées +25%."
  },
  {
    id: "memory_courts",
    group: "ruins",
    name: "Cours de mémoire",
    cost: { ruins: 5000000000 },
    effectType: "knowledgeKeep",
    amount: 0.08,
    desc: "Les témoins jurent devant des archives plus vieilles qu'eux. Ça évite le pire.",
    effect: "Effondrements: savoir conservé +8%."
  },
  {
    id: "silent_observatories",
    group: "ruins",
    name: "Observatoires muets",
    cost: { ruins: 7000000000 },
    effectType: "globalMult",
    amount: 0.16,
    desc: "Ils observent depuis assez longtemps pour que les empires leur semblent provisoires.",
    effect: "Production globale +16%."
  },
  {
    id: "codex_of_failures",
    group: "ruins",
    name: "Codex des échecs",
    cost: { ruins: 10000000000 },
    effectType: "stability",
    amount: 0.035,
    desc: "Chaque page commence par une erreur. C'est le livre le plus important.",
    effect: "Pression de rupture -3.5 pts."
  },
  {
    id: "lamp_archives",
    group: "ruins",
    name: "Archives aux lampes",
    cost: { ruins: 14000000000 },
    effectType: "startKnowledge",
    amount: 200000,
    desc: "Une lumière basse, des mains qui copient, des idées qui ne dorment pas.",
    effect: "Chaque cycle commence avec beaucoup plus de savoir."
  },
  {
    id: "counterfactual_histories",
    group: "ruins",
    name: "Histoires contrefactuelles",
    cost: { ruins: 18000000000 },
    effectType: "knowledgeMult",
    amount: 3,
    desc: "On y étudie les mondes qui auraient pu tomber autrement. Ça aide à éviter les mêmes erreurs.",
    effect: "Production de savoir +300%."
  },
  {
    id: "collapse_taxonomy",
    group: "ruins",
    name: "Taxonomie des chutes",
    cost: { ruins: 22000000000 },
    effectType: "ruinGain",
    amount: 0.40,
    desc: "Classer les effondrements, c'est apprendre à mieux en tirer profit.",
    effect: "Ruines gagnées +40%."
  },
  {
    id: "axiom_engine",
    group: "ruins",
    name: "Moteur d'axiomes",
    cost: { ruins: 26000000000 },
    effectType: "globalMult",
    amount: 0.28,
    desc: "Quelques vérités simples y font tourner des empires entiers.",
    effect: "Production globale +28%."
  },
  {
    id: "trait_theocracy",
    group: "ruins",
    name: "Théocratie",
    cost: { ruins: 0 },
    desc: "La richesse est devenue une forme de piété. Le savoir suit l'or.",
    effect: "Dogme: +1% du trésor actuel en savoir par seconde. Contrepartie: la rupture monte 25% plus vite."
  },
  {
    id: "trait_nomadism",
    group: "ruins",
    name: "Nomadisme",
    cost: { ruins: 0 },
    desc: "La ville, c'est les gens, pas les pierres. On peut tout emporter.",
    effect: "Dogme: tous les bâtiments coûtent -30%. Contrepartie: l'infrastructure est plafonnée par la taille de la cité."
  },
  {
    id: "skill_archaeology",
    group: "ruins",
    name: "Archéologie",
    cost: { ruins: 0 },
    desc: "Ce que l'ancien siècle a laissé, ce siècle peut l'exhumer et s'en servir.",
    effect: "Active: une fois par cycle, dépense du savoir pour exhumer un bâtiment de la civilisation précédente."
  },
  {
    id: "dogma_communal_granaries",
    group: "ruins",
    name: "Communes vivrières",
    cost: { ruins: 0 },
    effectType: "foodKeep",
    amount: 0.10,
    desc: "Personne ne mange avant les autres. C'est difficile, mais ça dure.",
    effect: "Dogme: les effondrements conservent +10% de nourriture."
  },
  {
    id: "dogma_medicine",
    group: "ruins",
    name: "Médecine civique",
    cost: { ruins: 0 },
    effectType: "timeWearSlow",
    amount: 0.20,
    desc: "Les médecins viennent avant les sculpteurs. La cité en tient plus longtemps.",
    effect: "Dogme: usure du temps -20%."
  },
  {
    id: "dogma_stoic_rites",
    group: "ruins",
    name: "Rites de patience",
    cost: { ruins: 0 },
    effectType: "stability",
    amount: 0.08,
    desc: "On ne panique pas. On a déjà vu ça, on sait ce qu'on fait.",
    effect: "Dogme: pression de rupture -8 pts."
  },
  {
    id: "dogma_merchant_law",
    group: "ruins",
    name: "Droit marchand",
    cost: { ruins: 0 },
    effectType: "goldMult",
    amount: 0.75,
    desc: "Ce qui est écrit reste valable même quand les parties qui l'ont signé ne sont plus là.",
    effect: "Dogme: production de trésor +75%."
  },
  {
    id: "dogma_public_works",
    group: "ruins",
    name: "Grands travaux",
    cost: { ruins: 0 },
    effectType: "infraMult",
    amount: 0.65,
    desc: "Ce qu'on construit pour tous laisse une trace plus profonde que les décrets.",
    effect: "Dogme: production d'infrastructure +65%."
  },
  {
    id: "dogma_free_academies",
    group: "ruins",
    name: "Académies libres",
    cost: { ruins: 0 },
    effectType: "knowledgeMult",
    amount: 1.25,
    desc: "Quand tout le monde peut apprendre, les idées circulent plus vite que les rumeurs.",
    effect: "Dogme: production de savoir +125%."
  },
  {
    id: "conseil_de_crise",
    group: "ruins",
    unlockCycles: 2,
    name: "Conseil de crise",
    cost: { ruins: 8 },
    desc: "Un conseil permanent tranche les crises sans réveiller le prince. Tu fixes la ligne, il l'applique.",
    effect: "Débloque la Doctrine de crise : réponse automatique (Stabiliser / Temporiser) à chaque palier de Rupture (25 / 50 / 75 %). Fini les interruptions."
  },
  {
    id: "edit_effondrement",
    group: "ruins",
    unlockCycles: 3,
    name: "Édit d'effondrement",
    cost: { ruins: 15 },
    desc: "L'effondrement devient un acte programmé, déclenché sans hésitation le moment venu.",
    effect: "Débloque l'effondrement automatique configurable : à 100% de Rupture, à un seuil d'Usure, ou après une durée. Peut tenter Rationner/Réformes avant."
  },
  {
    id: "veilleurs_nuit_1",
    group: "ruins",
    unlockCycles: 1,
    name: "Veilleurs de nuit",
    cost: { ruins: 8 },
    desc: "Quelques gardiens tiennent les registres pendant que la cité dort. Rien ne s'arrête vraiment.",
    effect: "Gain hors-ligne : la cité produit et vieillit jusqu'à 4 h d'absence (au lieu de 2 h)."
  },
  {
    id: "veilleurs_nuit_2",
    group: "ruins",
    unlockCycles: 3,
    name: "Veilleurs de nuit II",
    cost: { ruins: 40 },
    desc: "La veille s'organise en relèves. La cité ne ferme plus jamais tout à fait les yeux.",
    effect: "Gain hors-ligne : jusqu'à 8 h d'absence."
  },
  {
    id: "veilleurs_nuit_3",
    group: "ruins",
    unlockCycles: 5,
    name: "Veilleurs de nuit III",
    cost: { ruins: 200 },
    desc: "Des consignes écrites couvrent toutes les situations prévues. Et quelques-unes qui ne le sont pas.",
    effect: "Gain hors-ligne : jusqu'à 12 h d'absence."
  },
  {
    id: "veilleurs_nuit_4",
    group: "ruins",
    unlockCycles: 7,
    name: "Veilleurs de nuit IV",
    cost: { ruins: 1500 },
    desc: "La cité fonctionne désormais aussi bien sans toi qu'avec. C'est à la fois rassurant et vertigineux.",
    effect: "Gain hors-ligne : jusqu'à 24 h d'absence."
  },
  {
    id: "reforme_administrative",
    group: "heritage",
    name: "Réforme administrative",
    cost: { legitimacy: 1 },
    desc: "Les institutions apprennent à faire plus avec les mêmes mains.",
    effect: "Débloque le bouton Max: achète autant de bâtiments que possible en un clic."
  },
  {
    id: "protocoles_urgence",
    group: "heritage",
    name: "Protocoles de stabilisation",
    cost: { legitimacy: 3 },
    desc: "La machine tourne sans gardien. Les premiers signes de rupture déclenchent une réponse automatique.",
    effect: "A 65% de rupture: Rationner se déclenche automatiquement si possible. A 82%: Recensement aussi."
  },
  {
    id: "reseau_routes",
    group: "heritage",
    name: "Réseau de routes",
    cost: { legitimacy: 6 },
    desc: "Les routes anciennes se souviennent. Chaque nouvelle dynastie reconnaît les anciens chemins.",
    effect: "Coûts de construction -5% par dynastie fondée (maximum -60%)."
  },
  {
    id: "codex_mythique",
    group: "heritage",
    name: "Mémoire des Cycles",
    cost: { legitimacy: 9 },
    desc: "Les leçons des cycles précédents n'ont pas besoin d'être réapprises. Le savoir s'incarne dans les pierres.",
    effect: "Au début de chaque nouveau cycle, reçoit +250 Savoir par ère maximale atteinte dans les cycles précédents. Permet de débloquer les recherches avancées plus rapidement."
  },
  {
    id: "conservateurs_ruines",
    group: "heritage",
    name: "Archivistes des Ruines",
    cost: { legitimacy: 14 },
    desc: "Ils savent quelle ruine doit être découverte en premier. Et ils le font sans qu'on le leur demande.",
    effect: "Après chaque effondrement, achète automatiquement le premier upgrade de ruines abordable grâce aux ruines récoltées. Économise les premiers clics de chaque cycle."
  },
  {
    id: "rituel_effondrement",
    group: "heritage",
    name: "Rite de Passage",
    cost: { legitimacy: 20 },
    desc: "L'effondrement est devenu un acte conscient et maîtrisé. La cité sait comment tomber pour mieux se relever.",
    effect: "+25% de ruines de base lors de chaque effondrement. Le choix d'épitaphe reste libre et oriente la prochaine civilisation."
  },
  {
    id: "grand_reset",
    group: "heritage",
    name: "Grand Reset",
    cost: { legitimacy: 300 },
    desc: "Tout recommence. Mais les cicatrices restent, et elles rendent deux fois plus fort.",
    effect: "Remet la partie à zéro, mais ajoute un bonus permanent x2 sur toute la production et les Ruines gagnées. Cumulable. Le prochain Grand Reset sera deux fois plus rapide à atteindre."
  }
];

export const PRESTIGE_TREE_BRANCHES = [
  {
    id: "resilience",
    name: "Résilience",
    hint: "Population, nourriture, stabilité et résistance à l'usure.",
    ids: [
      "root_cellars", "ember_baskets", "granaries", "seed_vaults", "ancestor_granaries", "charred_ploughs",
      "smoke_calendar", "clay_cisterns", "stone_bread", "green_ruins", "age_sutures", "crisis_theatre",
      "dynastic_seeds", "echo_census", "evergreen_fields", "cradle_of_laws", "ten_thousand_storehouses",
      "root_hospices", "winter_granaries", "slow_calendar", "plague_records", "famine_laws",
      "river_seedbanks", "ash_medicine", "green_census", "mother_walls", "seasonal_oaths",
      "deep_wells", "patient_bloodlines", "last_refuges"
    ]
  },
  {
    id: "prosperity",
    name: "Prospérité",
    hint: "Trésor, infrastructures, routes, coûts de construction et conservation matérielle.",
    ids: [
      "buried_coins", "salvage_crews", "ash_paths", "broken_milestones", "fallen_roads", "cracked_scales",
      "ash_markets", "silent_wells", "old_wall_maps", "buried_tolls", "ash_contracts", "ancestral_markets",
      "old_coin_molds", "tilted_milestones", "forgotten_wharves", "buried_engineers", "fossil_taxes",
      "rubble_survey", "dead_road_network", "bronze_foundations", "ancestor_stipends", "silver_ghosts",
      "cyclopean_blocks", "deep_foundry", "palace_of_receipts", "immortal_blueprint",
      "silver_roads", "public_quarries", "nomad_ledgers", "canal_charters", "vaulted_treasuries",
      "imperial_scaffolds"
    ]
  },
  {
    id: "knowledge",
    name: "Connaissance",
    hint: "Savoir, archives, actions avancées, gains de ruines et mémoire longue.",
    ids: [
      "charcoal_tablets", "bone_ledgers", "oral_tradition", "burnt_abacus", "ruin_liturgy", "memory_scribes",
      "foundation_ghosts", "rubble_contracts", "sunken_scriptorium", "mirror_archives", "crowned_debris",
      "burial_math", "ashen_libraries", "first_grammar", "blackboard_walls", "ruined_mandate",
      "salted_memory", "ivory_questions", "ritual_accounting", "library_under_world", "chronicle_engine",
      "ink_relics", "dead_language_schools", "oracle_tables", "memory_courts", "silent_observatories",
      "codex_of_failures", "lamp_archives", "counterfactual_histories", "collapse_taxonomy",
      "axiom_engine"
    ]
  },
  {
    id: "rupture",
    name: "Rupture",
    hint: "Gestion autonome des crises: doctrine de crise + effondrement automatique configurable.",
    ids: ["conseil_de_crise", "edit_effondrement", "recurring_ages"]
  },
  {
    id: "veille",
    name: "Veille",
    hint: "Gain hors-ligne : la cite continue de produire et de vieillir en ton absence.",
    ids: ["veilleurs_nuit_1", "veilleurs_nuit_2", "veilleurs_nuit_3", "veilleurs_nuit_4"]
  }
];

export const PRESTIGE_DOGMAS = [
  {
    id: "dogma_communal_granaries",
    tier: "Palier I",
    requiredPurchases: 10,
    branch: "resilience"
  },
  {
    id: "dogma_medicine",
    tier: "Palier II",
    requiredPurchases: 20,
    branch: "resilience"
  },
  {
    id: "dogma_stoic_rites",
    tier: "Palier III",
    requiredPurchases: 30,
    branch: "resilience"
  },
  {
    id: "trait_nomadism",
    tier: "Palier I",
    requiredPurchases: 10,
    branch: "prosperity"
  },
  {
    id: "dogma_merchant_law",
    tier: "Palier II",
    requiredPurchases: 20,
    branch: "prosperity"
  },
  {
    id: "dogma_public_works",
    tier: "Palier III",
    requiredPurchases: 30,
    branch: "prosperity"
  },
  {
    id: "trait_theocracy",
    tier: "Palier I",
    requiredPurchases: 10,
    branch: "knowledge"
  },
  {
    id: "skill_archaeology",
    tier: "Palier II",
    requiredPurchases: 20,
    branch: "knowledge"
  },
  {
    id: "dogma_free_academies",
    tier: "Palier III",
    requiredPurchases: 30,
    branch: "knowledge"
  }
];

export const dogmaIds = new Set(PRESTIGE_DOGMAS.map((dogma) => dogma.id));

export const PRESTIGE_TREE = PRESTIGE_TREE_BRANCHES.flatMap((branch) => branch.ids.map((id, index) => {
  const upgrade = upgrades.find((candidate) => candidate.id === id);
  return {
    id,
    branch: branch.id,
    name: upgrade?.name || id,
    cost: upgrade?.cost || { ruins: 0 },
    purchased: false,
    requires: index > 0 ? branch.ids[index - 1] : null,
    effect: upgrade?.effect || ""
  };
}));
