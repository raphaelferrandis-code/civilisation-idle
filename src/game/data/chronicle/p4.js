"use strict";
// Articles de la chronique — Période 4 (extrait de chronicleArticles.js, Audit Phase 6).
export const chroniclePeriod4 = [
  // =========================================================================
  //  PÉRIODE 4 — Proclamation
  // =========================================================================

  // --- Crise (instability >= 0.75 || timeWear >= 0.75) ---
  {
    id: "p4_crisis_manuscript",
    period: 4,
    conditionType: "crise",
    title: "UN MANUSCRIT PRÉDIT TOUT, MAIS APRÈS COUP",
    text: "« Un moine affirme que les signes étaient là depuis le début. Il les a trouvés hier, dans un texte qu'il vient de finir. »",
    author: null
  },
  {
    id: "p4_crisis_revolt",
    period: 4,
    conditionType: "crise",
    title: "UNE RÉVOLTE ÉCLATE AU PIED DU PALAIS",
    text: "« Le peuple demande du pain, moins d'impôts et une explication claire sur les décisions récentes. Le palais promet deux réponses sur trois. »",
    author: null
  },
  {
    id: "p4_crisis_bridge",
    period: 4,
    conditionType: "crise",
    title: "LE GRAND PONT S'EFFONDRE EN PLEINE CÉRÉMONIE",
    text: "« L'ouvrage devait prouver la grandeur de l'Empire. Il a surtout rappelé que même les plus grands projets peuvent s'écrouler. »",
    author: "Garin, maître bâtisseur"
  },
  {
    id: "p4_crisis_temple",
    period: 4,
    conditionType: "crise",
    title: "LE TEMPLE DÉCLARE L'URGENCE SACRÉE",
    text: "« Les prêtres annoncent que les dieux nous testent. Le peuple aimerait connaître la durée de l'épreuve pour s'organiser. »",
    author: "Claude, gardien du feu"
  },

  // --- Tension élevée (0.5 <= instability < 0.75) ---
  {
    id: "p4_tension_windows",
    period: 4,
    conditionType: "tension",
    title: "NOUVEL IMPÔT SUR LES FENÊTRES",
    text: "« Le trésor royal manque d'or et invente de nouveaux impôts. »",
    author: "Renaud, contribuable"
  },
  {
    id: "p4_tension_invisible",
    period: 4,
    conditionType: "tension",
    title: "LE CONSEIL SE DIVISE SUR L'INVISIBLE",
    text: "« De plus en plus de gens affirment qu'une force nous guide. D'autres rappellent que, même guidés, personne n'a réparé les égouts. »",
    author: null
  },
  {
    id: "p4_tension_cult",
    period: 4,
    conditionType: "tension",
    title: "CULTE NOUVEAU, FILE D'ATTENTE ANCIENNE",
    text: "« Les fidèles du Créateur se rassemblent chaque matin. Les voisins se plaignent du bruit et du manque de miracle. »",
    author: null
  },
  {
    id: "p4_tension_scribes",
    period: 4,
    conditionType: "tension",
    title: "LES SCRIBES REFUSENT DE COPIER LE DÉCRET",
    text: "« Le texte affirme que tout va selon un plan supérieur. Les scribes demandent à voir le plan avant de faire des copies. »",
    author: "Edith, Intendante"
  },

  // --- Usure élevée (0.5 <= timeWear < 0.75) ---
  {
    id: "p4_wear_statues",
    period: 4,
    conditionType: "usure",
    title: "LES STATUES DES ANCIENS ONT PERDU LEUR NEZ",
    text: "« On les vénère toujours, par respect même si on ne sait plus très bien qui elles représentent. C'est important un nez »",
    author: "Claude, gardien du feu"
  },
  {
    id: "p4_wear_archives",
    period: 4,
    conditionType: "usure",
    title: "LES ARCHIVES SENTENT L'HUMIDITÉ ET LA VÉRITÉ",
    text: "« Un registre ancien décrit une crise presque identique à la nôtre. La commission conclut à une grosse coïncidence. »",
    author: "Edith, Intendante"
  },
  {
    id: "p4_wear_walls",
    period: 4,
    conditionType: "usure",
    title: "LES VIEUX MURS TIENNENT",
    text: "« Les ingénieurs disent qu'ils ne comprennent pas pourquoi la cité tient encore debout. Les prêtres notent la phrase pour leur prochain sermon. »",
    author: null
  },

  // --- Nourriture dominante ---
  {
    id: "p4_food_bread",
    period: 4,
    conditionType: "nourriture",
    title: "TROP DE PAIN, TROP PEU DE MODÉRATION",
    text: "« Les fours tournent jour et nuit. Le peuple est nourri, heureux, et mange bien au-delà du raisonnable. »",
    author: null
  },
  {
    id: "p4_food_neighbors",
    period: 4,
    conditionType: "nourriture",
    title: "LA CITÉ NOURRIT SES VOISINS",
    text: "« Nos convois de grain partent vers les cités affamées. Les voisins remercient les dieux, mais oublient souvent de remercier ceux qui remplissent les chariots. »",
    author: null
  },
  {
    id: "p4_food_banquet",
    period: 4,
    conditionType: "nourriture",
    title: "BANQUET OFFICIEL EN L'HONNEUR DU CRÉATEUR",
    text: "« Trois cents plats ont été servis à Celui qui nous guide. Comme il n'est pas venu, les ministres ont fait preuve de dévouement. »",
    author: null
  },
  {
    id: "p4_food_peasants",
    period: 4,
    conditionType: "nourriture",
    title: "LES PAYSANS DEMANDENT MOINS DE MIRACLES",
    text: "« Les récoltes sont excellentes depuis des années. Les paysans réclament qu'on remercie aussi les bras, les dos et les phlyctènes. »",
    author: "Nessa, Marchande"
  },

  // --- Or dominant ---
  {
    id: "p4_gold_overflow",
    period: 4,
    conditionType: "or",
    title: "LE TRÉSOR DÉBORDE, LE PEUPLE AUSSI",
    text: "« Les coffres sont pleins à craquer. Les pauvres demandent s'il est possible de faire ruisseler la richesse. »",
    author: null
  },
  {
    id: "p4_gold_ministry",
    period: 4,
    conditionType: "or",
    title: "UN MINISTÈRE DE LA COMPTABILITE",
    text: "« La cité possède trop d'or pour être compté à la main. Je demande trois assistants, deux tables et une semaine sans prophète. »",
    author: "Edith, Intendante"
  },
  {
    id: "p4_gold_sacred",
    period: 4,
    conditionType: "or",
    title: "L'OR SACRÉ CHANGE DE SALLE",
    text: "« Le temple affirme protéger les richesses du Créateur. Le roi affirme protéger le temple. Le peuple se sent un peu abandonné. »",
    author: "Khael, juge autoproclamé"
  },
  {
    id: "p4_gold_relics",
    period: 4,
    conditionType: "or",
    title: "LES MARCHANDS VENDENT DES RELIQUES NEUVES",
    text: "« Des fragments de la volonté divine circulent au marché. La plupart portent encore l'odeur de l'atelier. »",
    author: null
  },

  // --- Savoir actif ---
  {
    id: "p4_knowledge_question",
    period: 4,
    conditionType: "savoir",
    title: "UN PHILOSOPHE POSE LA MAUVAISE QUESTION",
    text: "« Et si nous n'étions pas bénis, mais observés ? »",
    author: "Aldric, philosophe"
  },
  {
    id: "p4_knowledge_treatise",
    period: 4,
    conditionType: "savoir",
    title: "PREMIER TRAITÉ SUR CELUI QUI REGARDE",
    text: "« L'ouvrage parle de l'idée que notre cité soit guidée par une volonté extérieure. Il se vend mal, mais fait réfléchir. »",
    author: null
  },
  {
    id: "p4_knowledge_hand",
    period: 4,
    conditionType: "savoir",
    title: "UNE MAIN DANS LES HASARDS",
    text: "« Les catastrophes frappent sans prévenir, les ponts s'effondrent et les récoltes échouent parfois. Pourtant, au moment où tout semble perdu, une solution apparaît souvent. Je ne dis pas qu'on nous pousse. Je dis simplement que les coïncidences deviennent difficiles à ignorer. »",
    author: "Raphaël, habitant"
  },
  {
    id: "p4_knowledge_medicine",
    period: 4,
    conditionType: "savoir",
    title: "LA MÉDECINE PROGRESSE, LE TEMPLE S'ADAPTE",
    text: "« Les médecins guérissent mieux qu'avant. Le temple annonce que les dieux ont toujours été favorables aux plantes, surtout depuis que la recherche existe. »",
    author: null
  },

  // --- Jalons (Bonus) ---
  {
    id: "p4_bonus_start",
    period: 4,
    conditionType: "stage_start",
    title: "UNE NOUVELLE ÈRE EST PROCLAMÉE AU BALCON",
    text: "« Les hérauts annoncent un âge de paix, de grandeur et d'ordre. La foule applaudit, faute d'avoir reçu le programme. »",
    author: null
  },
  {
    id: "p4_bonus_stage6",
    period: 4,
    conditionType: "stage_6",
    title: "LES ROUTES SONT SI DROITES QUE C'EN EST GÊNANT",
    text: "« Les voies traversent plaines, forêts et collines avec une logique parfaite. Les cartographes remercient les ingénieurs. »",
    author: null
  },
  {
    id: "p4_bonus_stage12",
    period: 4,
    conditionType: "stage_12",
    title: "L'EMPIRE ORGANISE SES VOISINS",
    text: "« Les cités voisines conservent leurs coutumes, leurs fêtes et leurs chefs, tant qu'elles obéissent correctement. »",
    author: null
  },
  {
    id: "p4_bonus_pop1m",
    period: 4,
    conditionType: "pop_1m",
    title: "TROP DE MONDE POUR UNE SEULE PLACE PUBLIQUE",
    text: "« La capitale a grandi si vite que les annonces officielles mettent sept jours à atteindre tout le monde. Les rumeurs circulent mieux. »",
    author: null
  },
  {
    id: "p4_bonus_peace1",
    period: 4,
    conditionType: "paix",
    title: "AUCUNE GUERRE, AUCUNE FAMINE, AUCUN MÉRITE",
    text: "« Tout va bien depuis si longtemps que les anciens commencent à mentir. C'était quand même plus dur avant. »",
    author: "Renaud, citoyen"
  },
  {
    id: "p4_bonus_peace2",
    period: 4,
    conditionType: "paix",
    title: "LA PAIX DEVIENT UNE THÉORIE POLITIQUE",
    text: "« Les savants affirment que notre stabilité prouve l'existence d'un ordre supérieur. »",
    author: null
  },
  {
    id: "p4_bonus_watched",
    period: 4,
    conditionType: "bonus_libre",
    title: "ON NOUS REGARDE ?",
    text: "« La question circule à voix basse dans les rues. Personne ne sait qui regarde, mais chacun commence à mieux se tenir. »",
    author: null
  },

];
