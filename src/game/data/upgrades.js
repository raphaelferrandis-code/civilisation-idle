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
    hint: "Nourriture, reserves et relance des premiers jours.",
    types: ["foodMult", "startFood", "foodKeep"],
    ids: ["root_cellars", "granaries", "ancestor_granaries", "ember_baskets"]
  },
  {
    id: "treasure",
    name: "Tresor",
    hint: "Argent, commerce et richesses conservees.",
    types: ["goldMult", "startGold", "goldKeep"],
    ids: ["buried_coins", "ash_markets", "ash_contracts"]
  },
  {
    id: "knowledge",
    name: "Savoir",
    hint: "Memoire, recherche et savoir qui survit aux chutes.",
    types: ["knowledgeMult", "startKnowledge", "knowledgeKeep", "knowledgeDiscount"],
    ids: ["charcoal_tablets", "memory_scribes"]
  },
  {
    id: "foundations",
    name: "Fondations",
    hint: "Infrastructure, couts, routes et bases conservees.",
    types: ["infraMult", "infraDiscount", "infraKeep"],
    ids: ["fallen_roads", "old_wall_maps"]
  },
  {
    id: "rupture",
    name: "Rupture",
    hint: "Options qui accelerent ou ralentissent la crise.",
    types: ["stability", "ruptureHaste", "timeWearSlow", "ruinGain"],
    ids: ["ruin_liturgy", "recurring_ages"]
  },
  {
    id: "relaunch",
    name: "Relance",
    hint: "Bonus globaux, population, clics et puissance des ruines gardees.",
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
    desc: "Les cachettes survivent aux empires. Quelqu'un l'a compris tres tot.",
    effect: "Production de nourriture +60%."
  },
  {
    id: "buried_coins",
    group: "ruins",
    name: "Monnaies enterrees",
    cost: { ruins: 2 },
    desc: "L'argent enterre perd du temps, mais pas des guerres.",
    effect: "Production de tresor +60%."
  },
  {
    id: "charcoal_tablets",
    group: "ruins",
    name: "Tablettes de charbon",
    cost: { ruins: 2 },
    desc: "Sur les murs calcines, les signes tenaient encore. Quelqu'un a pense a les recopier.",
    effect: "Production de savoir +60%."
  },
  {
    id: "oral_tradition",
    group: "ruins",
    name: "Tradition orale",
    cost: { ruins: 6 },
    desc: "Ce qu'on dit a voix basse resiste mieux aux incendies que les bibliotheques.",
    effect: "Memoire des pierres: bonus de ruines renforce."
  },
  {
    id: "granaries",
    group: "ruins",
    name: "Greniers cycliques",
    cost: { ruins: 12 },
    desc: "Pas tout le monde ne survit. Juste assez pour que l'histoire continue.",
    effect: "Les survivants repartent avec un socle de population."
  },
  {
    id: "salvage_crews",
    group: "ruins",
    unlockCycles: 1,
    name: "Equipes de recuperation",
    cost: { ruins: 5 },
    desc: "Les survivants savent ou regarder en premier.",
    effect: "Les clics sur la cite donnent un peu plus de nourriture et de tresor."
  },
  {
    id: "broken_milestones",
    group: "ruins",
    unlockCycles: 1,
    name: "Bornes brisees",
    cost: { ruins: 7 },
    desc: "Les vieilles routes ne menent plus nulle part, mais elles indiquent encore les distances.",
    effect: "Les couts des moteurs baissent legerement."
  },
  {
    id: "fallen_roads",
    group: "ruins",
    unlockCycles: 2,
    name: "Routes ensevelies",
    cost: { ruins: 8 },
    desc: "Le chemin existe deja sous la boue. Il suffit de gratter.",
    effect: "Chaque nouveau cycle commence avec une petite base d'infrastructure."
  },
  {
    id: "ancestor_granaries",
    group: "ruins",
    unlockCycles: 3,
    name: "Greniers des ancetres",
    cost: { ruins: 45 },
    desc: "Les ancetres ont fait les erreurs de la disette. Vous, non.",
    effect: "Les resets conservent plus de nourriture."
  },
  {
    id: "memory_scribes",
    group: "ruins",
    unlockCycles: 5,
    name: "Scribes de memoire",
    cost: { ruins: 65 },
    desc: "Certains n'ecrivent que les erreurs. C'est la bibliotheque la plus utile.",
    effect: "Une petite part du savoir survit toujours aux effondrements."
  },
  {
    id: "ash_contracts",
    group: "ruins",
    unlockCycles: 5,
    name: "Contrats de cendre",
    cost: { ruins: 75 },
    desc: "Les dettes d'avant l'effondrement ont la dent dure.",
    effect: "Le tresor conserve par les crises augmente."
  },
  {
    id: "ash_markets",
    group: "ruins",
    unlockCycles: 2,
    name: "Marches de cendres",
    cost: { ruins: 18 },
    desc: "Les survivants commercent autour des decombres avant meme d'avoir fini de pleurer.",
    effect: "Les effondrements conservent une meilleure part du tresor."
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
    desc: "Les anciens murs delimitaient encore les routes, meme effondres.",
    effect: "Les couts d'infrastructure baissent legerement apres plusieurs chutes."
  },
  {
    id: "recurring_ages",
    group: "ruins",
    unlockCycles: 8,
    name: "Ages recurrents",
    cost: { ruins: 90 },
    desc: "Certaines epoques reviennent si souvent qu'elles finissent par ressembler a des habitudes.",
    effect: "L'age maximum atteint renforce legerement la production globale."
  },
  {
    id: "ember_baskets",
    group: "ruins",
    name: "Paniers de braises",
    cost: { ruins: 2 },
    effectType: "startFood",
    amount: 40,
    desc: "Le feu voyage dans des paniers depuis plus longtemps qu'il n'existe de cites.",
    effect: "Chaque cycle commence avec plus de nourriture."
  },
  {
    id: "bone_ledgers",
    group: "ruins",
    name: "Registres d'os",
    cost: { ruins: 4 },
    effectType: "knowledgeMult",
    amount: 0.15,
    desc: "Des comptes graves dans l'os. Difficiles a bruler, impossibles a perdre.",
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
    effect: "Couts des moteurs -3%."
  },
  {
    id: "cracked_scales",
    group: "ruins",
    name: "Balances fendues",
    cost: { ruins: 9 },
    effectType: "goldMult",
    amount: 0.18,
    desc: "Cassees, elles mesurent encore. L'etalon survit a l'instrument.",
    effect: "Production de tresor +18%."
  },
  {
    id: "seed_vaults",
    group: "ruins",
    name: "Coffres a graines",
    cost: { ruins: 14 },
    effectType: "foodMult",
    amount: 0.22,
    desc: "Les graines attendent dans le noir, plus patientes que les royaumes qui les ont oubliees.",
    effect: "Production de nourriture +22%."
  },
  {
    id: "silent_wells",
    group: "ruins",
    name: "Puits silencieux",
    cost: { ruins: 21 },
    effectType: "infraMult",
    amount: 0.15,
    desc: "L'eau est la depuis avant la cite. Elle sera la apres.",
    effect: "Production d'infrastructure +15%."
  },
  {
    id: "burnt_abacus",
    group: "ruins",
    unlockCycles: 1,
    name: "Abaque brule",
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
    name: "Charrues charbonnees",
    cost: { ruins: 48 },
    effectType: "foodMult",
    amount: 0.32,
    desc: "La terre brulee est la plus fertile. Ca vaut aussi pour les civilisations.",
    effect: "Production de nourriture +32%."
  },
  {
    id: "buried_tolls",
    group: "ruins",
    unlockCycles: 1,
    name: "Peages ensevelis",
    cost: { ruins: 72 },
    effectType: "goldMult",
    amount: 0.3,
    desc: "L'ancienne taxe est devenue un reflexe. La route veut toujours quelque chose.",
    effect: "Production de tresor +30%."
  },
  {
    id: "foundation_ghosts",
    group: "ruins",
    name: "Ruines en reserve",
    cost: { ruins: 110 },
    effectType: "unspentRuinsPower",
    amount: 0.01,
    desc: "Les murs tombes indiquent encore ou poser les prochains. Rien ne se perd vraiment.",
    effect: "Production globale +1% par ruine non depensee."
  },
  {
    id: "smoke_calendar",
    group: "ruins",
    unlockCycles: 2,
    name: "Calendrier de fumee",
    cost: { ruins: 165 },
    effectType: "timeWearSlow",
    amount: 0.08,
    desc: "Les saisons y sont notees par la couleur des fumees. Ca marche.",
    effect: "Usure du temps -8%."
  },
  {
    id: "rubble_contracts",
    group: "ruins",
    unlockCycles: 2,
    name: "Contrats de gravats",
    cost: { ruins: 250 },
    effectType: "knowledgeDiscount",
    amount: 0.05,
    desc: "Les promesses signees sur des pierres cassees tiennent mieux que celles sur parchemin.",
    effect: "Couts du savoir -5%."
  },
  {
    id: "ancestral_markets",
    group: "ruins",
    unlockCycles: 2,
    name: "Marches ancestraux",
    cost: { ruins: 375 },
    effectType: "goldMult",
    amount: 0.45,
    desc: "Les vieilles places de marche ont la memoire des prix.",
    effect: "Production de tresor +45%."
  },
  {
    id: "clay_cisterns",
    group: "ruins",
    unlockCycles: 2,
    name: "Citernes d'argile",
    cost: { ruins: 560 },
    effectType: "foodKeep",
    amount: 0.04,
    desc: "L'argile garde mieux les lendemains que les serments.",
    effect: "Effondrements: nourriture conservee +4%."
  },
  {
    id: "sunken_scriptorium",
    group: "ruins",
    unlockCycles: 2,
    name: "Scriptorium englouti",
    cost: { ruins: 840 },
    effectType: "knowledgeKeep",
    amount: 0.03,
    desc: "Sous l'eau, l'encre a refuse de disparaitre. Quelqu'un en a fait une theologie.",
    effect: "Effondrements: savoir conserve +3%."
  },
  {
    id: "old_coin_molds",
    group: "ruins",
    unlockCycles: 3,
    name: "Moules a monnaie",
    cost: { ruins: 1300 },
    effectType: "goldKeep",
    amount: 0.04,
    desc: "Les visages graves dans le metal durent plus longtemps que ceux qui les ont commandes.",
    effect: "Effondrements: tresor conserve +4%."
  },
  {
    id: "stone_bread",
    group: "ruins",
    unlockCycles: 3,
    name: "Pain de pierre",
    cost: { ruins: 2000 },
    effectType: "foodMult",
    amount: 0.55,
    conflictsWith: "mirror_archives",
    desc: "Une legende absurde sur du grain qui ne meurt pas. Mais les greniers s'ouvrent mieux apres.",
    effect: "Production de nourriture +55%."
  },
  {
    id: "mirror_archives",
    group: "ruins",
    unlockCycles: 3,
    name: "Archives miroirs",
    cost: { ruins: 3000 },
    effectType: "knowledgeMult",
    amount: 0.55,
    conflictsWith: "stone_bread",
    desc: "Chaque texte y semble ecrit par deux peuples differents. L'un d'eux avait raison.",
    effect: "Production de savoir +55%."
  },
  {
    id: "crowned_debris",
    group: "ruins",
    unlockCycles: 3,
    name: "Debris couronnes",
    cost: { ruins: 4500 },
    effectType: "ruinGain",
    amount: 0.08,
    desc: "Un fragment de palais suffit a fonder une pretention.",
    effect: "Ruines gagnees +8%."
  },
  {
    id: "tilted_milestones",
    group: "ruins",
    unlockCycles: 3,
    name: "Bornes penchees",
    cost: { ruins: 6800 },
    effectType: "cityDiscount",
    amount: 0.05,
    desc: "Elles ne montrent plus la bonne distance. Mais encore la bonne direction.",
    effect: "Couts des moteurs -5%."
  },
  {
    id: "burial_math",
    group: "ruins",
    unlockCycles: 4,
    name: "Mathematique funeraire",
    cost: { ruins: 10000 },
    effectType: "ruptureHaste",
    amount: 0.08,
    conflictsWith: "crisis_theatre",
    desc: "Les tombes sont alignees avec une precision que les vivants n'atteignent pas.",
    effect: "Pression de rupture +4 pts."
  },
  {
    id: "ashen_libraries",
    group: "ruins",
    unlockCycles: 4,
    name: "Bibliotheques cendrees",
    cost: { ruins: 15000 },
    effectType: "knowledgeMult",
    amount: 0.85,
    desc: "Les livres ont brule. Les idees, elles, ont survecu dans les tetes des lecteurs.",
    effect: "Production de savoir +85%."
  },
  {
    id: "forgotten_wharves",
    group: "ruins",
    unlockCycles: 4,
    name: "Quais oublies",
    cost: { ruins: 23000 },
    effectType: "goldMult",
    amount: 0.85,
    desc: "Les amarres sont coupees depuis longtemps. Les habitudes de commerce, non.",
    effect: "Production de tresor +85%."
  },
  {
    id: "green_ruins",
    group: "ruins",
    unlockCycles: 4,
    name: "Ruines vertes",
    cost: { ruins: 35000 },
    effectType: "foodMult",
    amount: 1,
    desc: "Des figuiers poussent dans les salles du trone. C'est peut-etre ca, l'optimisme.",
    effect: "Production de nourriture +100%."
  },
  {
    id: "buried_engineers",
    group: "ruins",
    unlockCycles: 4,
    name: "Ingenieurs enterres",
    cost: { ruins: 52000 },
    effectType: "infraMult",
    amount: 0.75,
    desc: "Leurs plans sont incomplets. Leurs erreurs, elles, sont precieuses.",
    effect: "Production d'infrastructure +75%."
  },
  {
    id: "age_sutures",
    group: "ruins",
    unlockCycles: 5,
    name: "Sutures d'age",
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
    name: "Theatre des crises",
    cost: { ruins: 120000 },
    effectType: "stability",
    amount: 0.03,
    conflictsWith: "burial_math",
    desc: "Rejouer les catastrophes passees pour apprivoiser la prochaine. Ca aide, un peu.",
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
    desc: "Certaines familles savent deja qu'elles vont durer. Ca change tout.",
    effect: "Chaque cycle commence avec plus de population."
  },
  {
    id: "fossil_taxes",
    group: "ruins",
    unlockCycles: 5,
    name: "Impots fossiles",
    cost: { ruins: 270000 },
    effectType: "startGold",
    amount: 250,
    desc: "La dette survit mieux que les palais qui l'ont generee.",
    effect: "Chaque cycle commence avec plus de tresor."
  },
  {
    id: "first_grammar",
    group: "ruins",
    unlockCycles: 5,
    name: "Premiere grammaire",
    cost: { ruins: 400000 },
    effectType: "startKnowledge",
    amount: 120,
    desc: "Les premieres regles du langage ont tout change. La deuxieme fois, ca va plus vite.",
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
    desc: "Mesurer les ruines, c'est la premiere etape pour ne pas les reproduire.",
    effect: "Couts d'infrastructure -8%."
  },
  {
    id: "dead_road_network",
    group: "ruins",
    unlockCycles: 6,
    name: "Reseau de routes mortes",
    cost: { ruins: 900000 },
    effectType: "cityDiscount",
    amount: 0.08,
    desc: "Les nouvelles jambes prennent les vieilles routes. Elles arrivent plus vite.",
    effect: "Couts des moteurs -8%."
  },
  {
    id: "blackboard_walls",
    group: "ruins",
    unlockCycles: 6,
    name: "Murs tableaux",
    cost: { ruins: 1300000 },
    effectType: "knowledgeDiscount",
    amount: 0.08,
    desc: "La pluie efface les lecons sur les murs. Les enfants les memorisent avant.",
    effect: "Couts du savoir -8%."
  },
  {
    id: "ruined_mandate",
    group: "ruins",
    unlockCycles: 6,
    name: "Mandat ruine",
    cost: { ruins: 2000000 },
    effectType: "ruptureHaste",
    amount: 0.16,
    desc: "Les peuples reconnaissent les signes d'une chute familiere. Ca va vite.",
    effect: "Pression de rupture +8 pts."
  },
  {
    id: "echo_census",
    group: "ruins",
    unlockCycles: 6,
    name: "Recensement d'echo",
    cost: { ruins: 3000000 },
    effectType: "populationMult",
    amount: 0.35,
    desc: "Les absents sont comptes avec les vivants. Pour ne pas recommencer seuls.",
    effect: "Croissance de population +35%."
  },
  {
    id: "salted_memory",
    group: "ruins",
    unlockCycles: 7,
    name: "Memoire salee",
    cost: { ruins: 4500000 },
    effectType: "knowledgeKeep",
    amount: 0.06,
    desc: "Ce qui est conserve dans le sel pique encore longtemps apres.",
    effect: "Effondrements: savoir conserve +6%."
  },
  {
    id: "bronze_foundations",
    group: "ruins",
    unlockCycles: 7,
    name: "Fondations de bronze",
    cost: { ruins: 6800000 },
    effectType: "infraKeep",
    amount: 0.05,
    desc: "Certaines bases refusent de redevenir poussiere. On s'en sort.",
    effect: "Effondrements: infrastructure conservee +5%."
  },
  {
    id: "ancestor_stipends",
    group: "ruins",
    unlockCycles: 7,
    name: "Rentes des ancetres",
    cost: { ruins: 10000000 },
    effectType: "goldKeep",
    amount: 0.08,
    desc: "Les morts financent mal, mais longtemps et sans se plaindre.",
    effect: "Effondrements: tresor conserve +8%."
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
    name: "Fantomes d'argent",
    cost: { ruins: 23000000 },
    effectType: "goldMult",
    amount: 1.8,
    desc: "L'argent fantome circule encore. Personne ne sait vraiment d'ou il vient.",
    effect: "Production de tresor +180%."
  },
  {
    id: "ivory_questions",
    group: "ruins",
    unlockCycles: 8,
    name: "Questions d'ivoire",
    cost: { ruins: 35000000 },
    effectType: "knowledgeMult",
    amount: 1.8,
    desc: "Trop belles pour des reponses simples. C'est pour ca qu'elles durent.",
    effect: "Production de savoir +180%."
  },
  {
    id: "cyclopean_blocks",
    group: "ruins",
    unlockCycles: 8,
    name: "Blocs cyclopeens",
    cost: { ruins: 52000000 },
    effectType: "infraMult",
    amount: 1.4,
    desc: "Personne ne sait qui les a portes. Tout le monde construit autour.",
    effect: "Production d'infrastructure +140%."
  },
  {
    id: "ritual_accounting",
    group: "ruins",
    unlockCycles: 8,
    name: "Comptabilite rituelle",
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
    desc: "Sous les decombres, le metal apprend une seconde chaleur.",
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
    desc: "La premiere regle n'est pas ecrite — elle est repetee jusqu'a ce qu'elle devienne evidente.",
    effect: "Pression de rupture -5 pts."
  },
  {
    id: "ten_thousand_storehouses",
    group: "ruins",
    unlockCycles: 9,
    name: "Dix mille reserves",
    cost: { ruins: 270000000 },
    effectType: "startFood",
    amount: 250000,
    desc: "La famine cherche une entree. Elle trouve des portes fermees partout.",
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
    desc: "Le tresor physique a demenage ici. Les preuves de paiement ont plus de gardes que les princes.",
    effect: "Chaque cycle commence avec beaucoup plus de tresor."
  },
  {
    id: "library_under_world",
    group: "ruins",
    unlockCycles: 9,
    name: "Bibliotheque souterraine",
    cost: { ruins: 600000000 },
    effectType: "startKnowledge",
    amount: 50000,
    desc: "Les livres y respirent dans l'ombre minerale, patients comme de la geologie.",
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
    desc: "Une ville entiere tient dans ces traits. Elle peut etre rebatie apres n'importe quel feu.",
    effect: "Effondrements: infrastructure conservee +12%."
  },
  {
    id: "chronicle_engine",
    group: "ruins",
    unlockCycles: 10,
    name: "Machine chronique",
    cost: { ruins: 1300000000 },
    effectType: "chronicleEngine",
    amount: 0.03,
    desc: "Elle transforme chaque fin en chapitre. L'histoire ne s'arrete plus — elle recommence.",
    effect: "Capstone: chaque achat de ruines renforce toute la production, et les ruines non depensees ajoutent un bonus."
  },
  {
    id: "root_hospices",
    group: "ruins",
    name: "Hospices racines",
    cost: { ruins: 800000000 },
    effectType: "populationMult",
    amount: 0.55,
    desc: "Une societe se mesure a comment elle traite ceux qui ne peuvent pas se defendre seuls.",
    effect: "Croissance de population +55%."
  },
  {
    id: "winter_granaries",
    group: "ruins",
    name: "Greniers d'hiver",
    cost: { ruins: 1200000000 },
    effectType: "foodKeep",
    amount: 0.08,
    desc: "Les mauvaises saisons y sont attendues. On les connait par leur nom.",
    effect: "Effondrements: nourriture conservee +8%."
  },
  {
    id: "slow_calendar",
    group: "ruins",
    name: "Calendrier lent",
    cost: { ruins: 1800000000 },
    effectType: "timeWearSlow",
    amount: 0.1,
    desc: "Ici le temps est compte en respirations, pas en journees. Il passe autrement.",
    effect: "Usure du temps -10%."
  },
  {
    id: "plague_records",
    group: "ruins",
    name: "Registres des pestes",
    cost: { ruins: 2700000000 },
    effectType: "populationMult",
    amount: 0.75,
    desc: "Les morts ont enseigne ou ne plus se rassembler. Les vivants ont appris.",
    effect: "Croissance de population +75%."
  },
  {
    id: "famine_laws",
    group: "ruins",
    name: "Lois de famine",
    cost: { ruins: 4000000000 },
    effectType: "stability",
    amount: 0.025,
    desc: "Quand les stocks baissent, la loi parle avant la foule. Ca evite le pire.",
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
    name: "Medecine de cendre",
    cost: { ruins: 9000000000 },
    effectType: "timeWearSlow",
    amount: 0.16,
    desc: "Les remedes les plus anciens sentent le feu eteint et la terre apres la pluie.",
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
    cost: { ruins: 20000000000 },
    effectType: "foodKeep",
    amount: 0.1,
    desc: "Ces murs ne protegent pas les palais. Ils protegent la nourriture.",
    effect: "Effondrements: nourriture conservee +10%."
  },
  {
    id: "seasonal_oaths",
    group: "ruins",
    name: "Serments saisonniers",
    cost: { ruins: 30000000000 },
    effectType: "stability",
    amount: 0.04,
    desc: "A chaque saison, la cite repete pourquoi elle existe. Ca aide a tenir.",
    effect: "Pression de rupture -4 pts."
  },
  {
    id: "deep_wells",
    group: "ruins",
    name: "Puits profonds",
    cost: { ruins: 45000000000 },
    effectType: "startFood",
    amount: 1000000,
    desc: "L'eau ici remonte d'avant la premiere cite. Elle sera la apres la derniere.",
    effect: "Chaque cycle commence avec beaucoup plus de nourriture."
  },
  {
    id: "patient_bloodlines",
    group: "ruins",
    name: "Lignees patientes",
    cost: { ruins: 68000000000 },
    effectType: "populationMult",
    amount: 1.2,
    desc: "Ces lignees ont appris a ne pas confondre survivre et attendre. Il y a une difference.",
    effect: "Croissance de population +120%."
  },
  {
    id: "last_refuges",
    group: "ruins",
    name: "Derniers refuges",
    cost: { ruins: 100000000000 },
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
    desc: "Les comptes voyagent plus legerement que les coffres. L'economie suit.",
    effect: "Couts des moteurs -10%."
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
    name: "Tresors voutes",
    cost: { ruins: 8000000000 },
    effectType: "goldKeep",
    amount: 0.12,
    desc: "L'or qui survit aux empires est celui qui sait se cacher.",
    effect: "Effondrements: tresor conserve +12%."
  },
  {
    id: "imperial_scaffolds",
    group: "ruins",
    name: "Echafaudages imperiaux",
    cost: { ruins: 12000000000 },
    effectType: "infraKeep",
    amount: 0.1,
    desc: "Meme demontes, ils indiquent encore comment aller haut.",
    effect: "Effondrements: infrastructure conservee +10%."
  },
  {
    id: "ink_relics",
    group: "ruins",
    name: "Reliques d'encre",
    cost: { ruins: 1900000000 },
    effectType: "knowledgeMult",
    amount: 2.4,
    desc: "L'encre sechee pese comme une preuve. Personne ne la conteste.",
    effect: "Production de savoir +240%."
  },
  {
    id: "dead_language_schools",
    group: "ruins",
    name: "Ecoles de langues mortes",
    cost: { ruins: 3000000000 },
    effectType: "knowledgeDiscount",
    amount: 0.1,
    desc: "On y apprend des langues que plus personne ne parle. Pour lire les avertissements dans leur premiere version.",
    effect: "Couts du savoir -10%."
  },
  {
    id: "oracle_tables",
    group: "ruins",
    name: "Tables d'oracle",
    cost: { ruins: 4500000000 },
    effectType: "ruinGain",
    amount: 0.12,
    desc: "Elles ne predisent pas la chute. Elles savent juste l'utiliser.",
    effect: "Ruines gagnees +12%."
  },
  {
    id: "memory_courts",
    group: "ruins",
    name: "Cours de memoire",
    cost: { ruins: 7000000000 },
    effectType: "knowledgeKeep",
    amount: 0.08,
    desc: "Les temoins jurent devant des archives plus vieilles qu'eux. Ca responsabilise.",
    effect: "Effondrements: savoir conserve +8%."
  },
  {
    id: "silent_observatories",
    group: "ruins",
    name: "Observatoires muets",
    cost: { ruins: 10000000000 },
    effectType: "globalMult",
    amount: 0.16,
    desc: "Ils observent depuis assez longtemps pour que les empires leur semblent provisoires.",
    effect: "Production globale +16%."
  },
  {
    id: "codex_of_failures",
    group: "ruins",
    name: "Codex des echecs",
    cost: { ruins: 15000000000 },
    effectType: "stability",
    amount: 0.035,
    desc: "Chaque page commence par une erreur. C'est le livre le plus important.",
    effect: "Pression de rupture -3.5 pts."
  },
  {
    id: "lamp_archives",
    group: "ruins",
    name: "Archives aux lampes",
    cost: { ruins: 23000000000 },
    effectType: "startKnowledge",
    amount: 200000,
    desc: "Une lumiere basse, des mains qui copient, des idees qui ne dorment pas.",
    effect: "Chaque cycle commence avec beaucoup plus de savoir."
  },
  {
    id: "counterfactual_histories",
    group: "ruins",
    name: "Histoires contrefactuelles",
    cost: { ruins: 35000000000 },
    effectType: "knowledgeMult",
    amount: 3,
    desc: "On y etudie les mondes qui auraient pu tomber autrement. Ca aide a eviter les memes erreurs.",
    effect: "Production de savoir +300%."
  },
  {
    id: "collapse_taxonomy",
    group: "ruins",
    name: "Taxonomie des chutes",
    cost: { ruins: 52000000000 },
    effectType: "ruinGain",
    amount: 0.18,
    desc: "Classer les effondrements, c'est apprendre a mieux en tirer profit.",
    effect: "Ruines gagnees +18%."
  },
  {
    id: "axiom_engine",
    group: "ruins",
    name: "Moteur d'axiomes",
    cost: { ruins: 78000000000 },
    effectType: "globalMult",
    amount: 0.28,
    desc: "Quelques verites simples y font tourner des empires entiers.",
    effect: "Production globale +28%."
  },
  {
    id: "trait_theocracy",
    group: "ruins",
    name: "Theocratie",
    cost: { ruins: 0 },
    desc: "La richesse est devenue une forme de piete. Le savoir suit l'or.",
    effect: "Dogme: +1% du tresor actuel en savoir par seconde. Contrepartie: la rupture monte 25% plus vite."
  },
  {
    id: "trait_nomadism",
    group: "ruins",
    name: "Nomadisme",
    cost: { ruins: 0 },
    desc: "La ville, c'est les gens, pas les pierres. On peut tout emporter.",
    effect: "Dogme: tous les batiments coutent -30%. Contrepartie: l'infrastructure est plafonnee par la taille de la cite."
  },
  {
    id: "skill_archaeology",
    group: "ruins",
    name: "Archeologie",
    cost: { ruins: 0 },
    desc: "Ce que l'ancien siecle a laisse, ce siecle peut l'exhumer et s'en servir.",
    effect: "Active: une fois par cycle, depense du savoir pour exhumer un batiment de la civilisation precedente."
  },
  {
    id: "dogma_communal_granaries",
    group: "ruins",
    name: "Communes vivrieres",
    cost: { ruins: 0 },
    effectType: "foodKeep",
    amount: 0.06,
    desc: "Personne ne mange avant les autres. C'est difficile, mais ca dure.",
    effect: "Dogme: les effondrements conservent +6% de nourriture."
  },
  {
    id: "dogma_medicine",
    group: "ruins",
    name: "Medecine civique",
    cost: { ruins: 0 },
    effectType: "timeWearSlow",
    amount: 0.15,
    desc: "Les medecins viennent avant les sculpteurs. La cite en tient plus longtemps.",
    effect: "Dogme: usure du temps -15%."
  },
  {
    id: "dogma_stoic_rites",
    group: "ruins",
    name: "Rites de patience",
    cost: { ruins: 0 },
    effectType: "stability",
    amount: 0.06,
    desc: "On ne panique pas. On a deja vu ca, on sait ce qu'on fait.",
    effect: "Dogme: pression de rupture -6 pts."
  },
  {
    id: "dogma_merchant_law",
    group: "ruins",
    name: "Droit marchand",
    cost: { ruins: 0 },
    effectType: "goldMult",
    amount: 0.75,
    desc: "Ce qui est ecrit reste valable meme quand les parties qui l'ont signe ne sont plus la.",
    effect: "Dogme: production de tresor +75%."
  },
  {
    id: "dogma_public_works",
    group: "ruins",
    name: "Grands travaux",
    cost: { ruins: 0 },
    effectType: "infraMult",
    amount: 0.65,
    desc: "Ce qu'on construit pour tous laisse une trace plus profonde que les decrets.",
    effect: "Dogme: production d'infrastructure +65%."
  },
  {
    id: "dogma_free_academies",
    group: "ruins",
    name: "Academies libres",
    cost: { ruins: 0 },
    effectType: "knowledgeMult",
    amount: 1.25,
    desc: "Quand tout le monde peut apprendre, les idees circulent plus vite que les rumeurs.",
    effect: "Dogme: production de savoir +125%."
  },
  {
    id: "intendant_de_crise",
    group: "ruins",
    unlockCycles: 1,
    name: "Intendant de crise",
    cost: { ruins: 3 },
    desc: "Quand personne ne decide, quelqu'un doit finir par le faire.",
    effect: "Effondrement automatique apres 10 min d'inaction en crise ouverte (55% des ruines)."
  },
  {
    id: "conseil_de_regence",
    group: "ruins",
    unlockCycles: 2,
    name: "Conseil de regence",
    cost: { ruins: 18 },
    desc: "Le conseil essaie d'abord de rationner avant d'abandonner.",
    effect: "Effondrement auto apres 6 min. Tente Rationner avant d'effondrer si possible (80% des ruines)."
  },
  {
    id: "memoire_institutionnelle",
    group: "ruins",
    unlockCycles: 4,
    name: "Memoire institutionnelle",
    cost: { ruins: 100 },
    desc: "Les institutions survivent aux personnes. La procedure continue meme sans gardien.",
    effect: "Effondrement auto apres 3 min. Tente Rationner et Reformes d'abord. Aucune penalite (100% des ruines)."
  },
  {
    id: "reforme_administrative",
    group: "heritage",
    name: "Reforme administrative",
    cost: { legitimacy: 1 },
    desc: "Les institutions apprennent a faire plus avec les memes mains.",
    effect: "Debloque le bouton Max: achete autant de batiments que possible en un clic."
  },
  {
    id: "protocoles_urgence",
    group: "heritage",
    name: "Protocoles de stabilisation",
    cost: { legitimacy: 3 },
    desc: "La machine tourne sans gardien. Les premiers signes de rupture declenchent une reponse automatique.",
    effect: "A 65% de rupture: Rationner se declenche automatiquement si possible. A 82%: Recensement aussi."
  },
  {
    id: "reseau_routes",
    group: "heritage",
    name: "Reseau de routes",
    cost: { legitimacy: 6 },
    desc: "Les routes anciennes se souviennent. Chaque nouvelle dynastie reconnait les anciens chemins.",
    effect: "Couts de construction -5% par dynastie fondee (maximum -60%)."
  },
  {
    id: "codex_mythique",
    group: "heritage",
    name: "Memoire des Cycles",
    cost: { legitimacy: 9 },
    desc: "Les lecons des cycles precedents n'ont pas besoin d'etre reapprises. Le savoir s'incarne dans les pierres.",
    effect: "Au debut de chaque nouveau cycle, recoit +250 Savoir par ere maximale atteinte dans les cycles precedents. Permet de debloquer les recherches avancees plus rapidement."
  },
  {
    id: "conservateurs_ruines",
    group: "heritage",
    name: "Archivistes des Ruines",
    cost: { legitimacy: 14 },
    desc: "Ils savent quelle ruine doit etre decouverte en premier. Et ils le font sans qu'on le leur demande.",
    effect: "Apres chaque effondrement, achete automatiquement le premier upgrade de ruines abordable grace aux ruines recoltees. Economise les premiers clics de chaque cycle."
  },
  {
    id: "rituel_effondrement",
    group: "heritage",
    name: "Rite de Passage",
    cost: { legitimacy: 20 },
    desc: "L'effondrement est devenu un acte conscient et maitrise. La cite sait comment tomber pour mieux se relever.",
    effect: "+25% de ruines lors de chaque effondrement. L'option 'Preparer la chute' est selectionnee automatiquement (son bonus +20% s'applique en plus)."
  },
  {
    id: "grand_reset",
    group: "heritage",
    name: "Grand Reset",
    cost: { legitimacy: 300 },
    desc: "Tout recommence. Mais les cicatrices restent, et elles rendent deux fois plus fort.",
    effect: "Remet la partie a zero, mais ajoute un bonus permanent x2 sur toute la production. Cumulable. Le prochain Grand Reset sera deux fois plus rapide a atteindre."
  }
];

export const PRESTIGE_TREE_BRANCHES = [
  {
    id: "resilience",
    name: "Resilience",
    hint: "Population, nourriture, stabilite et resistance a l'usure.",
    ids: [
      "root_cellars", "ember_baskets", "granaries", "seed_vaults", "charred_ploughs", "ancestor_granaries",
      "clay_cisterns", "smoke_calendar", "stone_bread", "green_ruins", "age_sutures", "crisis_theatre",
      "dynastic_seeds", "echo_census", "evergreen_fields", "cradle_of_laws", "ten_thousand_storehouses",
      "root_hospices", "winter_granaries", "slow_calendar", "plague_records", "famine_laws",
      "river_seedbanks", "ash_medicine", "green_census", "mother_walls", "seasonal_oaths",
      "deep_wells", "patient_bloodlines", "last_refuges"
    ]
  },
  {
    id: "prosperity",
    name: "Prosperite",
    hint: "Tresor, infrastructures, routes, couts de construction et conservation materielle.",
    ids: [
      "buried_coins", "salvage_crews", "broken_milestones", "fallen_roads", "ash_markets", "old_wall_maps",
      "ash_paths", "cracked_scales", "silent_wells", "buried_tolls", "ash_contracts", "ancestral_markets",
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
    hint: "Savoir, archives, actions avancees, gains de ruines et memoire longue.",
    ids: [
      "charcoal_tablets", "oral_tradition", "memory_scribes", "ruin_liturgy", "bone_ledgers", "burnt_abacus",
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
    hint: "Gestion autonome des crises: effondrement automatique si le joueur ne decide pas.",
    ids: ["intendant_de_crise", "conseil_de_regence", "memoire_institutionnelle", "recurring_ages"]
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
    cost: upgrade?.cost?.ruins || 0,
    purchased: false,
    requires: index > 0 ? branch.ids[index - 1] : null,
    effect: upgrade?.effect || ""
  };
}));
