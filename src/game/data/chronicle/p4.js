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
    title: { fr: "UN MANUSCRIT PRÉDIT TOUT, MAIS APRÈS COUP", en: "A MANUSCRIPT PREDICTS EVERYTHING, AFTER THE FACT" },
    text: { fr: "« Un moine affirme que les signes étaient là depuis le début. Il les a trouvés hier, dans un texte qu'il vient de finir. »", en: "\"A monk claims the signs were there from the start. He found them yesterday, in a text he just finished writing.\"" },
    author: null
  },
  {
    id: "p4_crisis_revolt",
    period: 4,
    conditionType: "crise",
    title: { fr: "UNE RÉVOLTE ÉCLATE AU PIED DU PALAIS", en: "A REVOLT BREAKS OUT AT THE PALACE GATES" },
    text: { fr: "« Le peuple demande du pain, moins d'impôts et une explication claire sur les décisions récentes. Le palais promet deux réponses sur trois. »", en: "\"The people demand bread, lower taxes, and a clear explanation of recent decisions. The palace promises two answers out of three.\"" },
    author: null
  },
  {
    id: "p4_crisis_bridge",
    period: 4,
    conditionType: "crise",
    title: { fr: "LE GRAND PONT S'EFFONDRE EN PLEINE CÉRÉMONIE", en: "THE GREAT BRIDGE COLLAPSES MID-CEREMONY" },
    text: { fr: "« L'ouvrage devait prouver la grandeur de l'Empire. Il a surtout rappelé que même les plus grands projets peuvent s'écrouler. »", en: "\"The structure was meant to prove the greatness of the Empire. Above all, it reminded us that even the grandest projects can collapse.\"" },
    author: { fr: "Garin, maître bâtisseur", en: "Garin, master builder" }
  },
  {
    id: "p4_crisis_temple",
    period: 4,
    conditionType: "crise",
    title: { fr: "LE TEMPLE DÉCLARE L'URGENCE SACRÉE", en: "THE TEMPLE DECLARES A SACRED EMERGENCY" },
    text: { fr: "« Les prêtres annoncent que les dieux nous testent. Le peuple aimerait connaître la durée de l'épreuve pour s'organiser. »", en: "\"The priests announce that the gods are testing us. The people would like to know how long the trial will last, so as to plan accordingly.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the flame" }
  },

  // --- Tension élevée (0.5 <= instability < 0.75) ---
  {
    id: "p4_tension_windows",
    period: 4,
    conditionType: "tension",
    title: { fr: "NOUVEL IMPÔT SUR LES FENÊTRES", en: "A NEW TAX ON WINDOWS" },
    text: { fr: "« Le trésor royal manque d'or et invente de nouveaux impôts. »", en: "\"The royal treasury is short of gold and invents new taxes.\"" },
    author: { fr: "Renaud, contribuable", en: "Renaud, taxpayer" }
  },
  {
    id: "p4_tension_invisible",
    period: 4,
    conditionType: "tension",
    title: { fr: "LE CONSEIL SE DIVISE SUR L'INVISIBLE", en: "THE COUNCIL DIVIDES OVER THE INVISIBLE" },
    text: { fr: "« De plus en plus de gens affirment qu'une force nous guide. D'autres rappellent que, même guidés, personne n'a réparé les égouts. »", en: "\"More and more people claim a force is guiding us. Others point out that, guided or not, no one has repaired the sewers.\"" },
    author: null
  },
  {
    id: "p4_tension_cult",
    period: 4,
    conditionType: "tension",
    title: { fr: "CULTE NOUVEAU, FILE D'ATTENTE ANCIENNE", en: "NEW CULT, OLD QUEUE" },
    text: { fr: "« Les fidèles du Créateur se rassemblent chaque matin. Les voisins se plaignent du bruit et du manque de miracle. »", en: "\"The faithful of the Creator gather every morning. The neighbors complain of the noise and the lack of miracle.\"" },
    author: null
  },
  {
    id: "p4_tension_scribes",
    period: 4,
    conditionType: "tension",
    title: { fr: "LES SCRIBES REFUSENT DE COPIER LE DÉCRET", en: "THE SCRIBES REFUSE TO COPY THE DECREE" },
    text: { fr: "« Le texte affirme que tout va selon un plan supérieur. Les scribes demandent à voir le plan avant de faire des copies. »", en: "\"The text asserts that all proceeds according to a higher plan. The scribes ask to see the plan before making copies.\"" },
    author: { fr: "Edith, Intendante", en: "Edith, Steward" }
  },

  // --- Usure élevée (0.5 <= timeWear < 0.75) ---
  {
    id: "p4_wear_statues",
    period: 4,
    conditionType: "usure",
    title: { fr: "LES STATUES DES ANCIENS ONT PERDU LEUR NEZ", en: "THE STATUES OF THE ANCIENTS HAVE LOST THEIR NOSES" },
    text: { fr: "« On les vénère toujours, par respect même si on ne sait plus très bien qui elles représentent. C'est important un nez »", en: "\"We still revere them, out of respect, even if we no longer quite know whom they represent. A nose matters\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the flame" }
  },
  {
    id: "p4_wear_archives",
    period: 4,
    conditionType: "usure",
    title: { fr: "LES ARCHIVES SENTENT L'HUMIDITÉ ET LA VÉRITÉ", en: "THE ARCHIVES SMELL OF DAMP AND TRUTH" },
    text: { fr: "« Un registre ancien décrit une crise presque identique à la nôtre. La commission conclut à une grosse coïncidence. »", en: "\"An old ledger describes a crisis almost identical to ours. The commission concludes it is a great coincidence.\"" },
    author: { fr: "Edith, Intendante", en: "Edith, Steward" }
  },
  {
    id: "p4_wear_walls",
    period: 4,
    conditionType: "usure",
    title: { fr: "LES VIEUX MURS TIENNENT", en: "THE OLD WALLS HOLD" },
    text: { fr: "« Les ingénieurs disent qu'ils ne comprennent pas pourquoi la cité tient encore debout. Les prêtres notent la phrase pour leur prochain sermon. »", en: "\"The engineers say they do not understand why the city is still standing. The priests jot the line down for their next sermon.\"" },
    author: null
  },

  // --- Nourriture dominante ---
  {
    id: "p4_food_bread",
    period: 4,
    conditionType: "nourriture",
    title: { fr: "TROP DE PAIN, TROP PEU DE MODÉRATION", en: "TOO MUCH BREAD, TOO LITTLE RESTRAINT" },
    text: { fr: "« Les fours tournent jour et nuit. Le peuple est nourri, heureux, et mange bien au-delà du raisonnable. »", en: "\"The ovens run day and night. The people are fed, happy, and eat well beyond reason.\"" },
    author: null
  },
  {
    id: "p4_food_neighbors",
    period: 4,
    conditionType: "nourriture",
    title: { fr: "LA CITÉ NOURRIT SES VOISINS", en: "THE CITY FEEDS ITS NEIGHBORS" },
    text: { fr: "« Nos convois de grain partent vers les cités affamées. Les voisins remercient les dieux, mais oublient souvent de remercier ceux qui remplissent les chariots. »", en: "\"Our grain convoys set out for the starving cities. The neighbors thank the gods, but often forget to thank those who load the carts.\"" },
    author: null
  },
  {
    id: "p4_food_banquet",
    period: 4,
    conditionType: "nourriture",
    title: { fr: "BANQUET OFFICIEL EN L'HONNEUR DU CRÉATEUR", en: "OFFICIAL BANQUET IN HONOR OF THE CREATOR" },
    text: { fr: "« Trois cents plats ont été servis à Celui qui nous guide. Comme il n'est pas venu, les ministres ont fait preuve de dévouement. »", en: "\"Three hundred dishes were served to the One who guides us. As he did not come, the ministers showed great devotion.\"" },
    author: null
  },
  {
    id: "p4_food_peasants",
    period: 4,
    conditionType: "nourriture",
    title: { fr: "LES PAYSANS DEMANDENT MOINS DE MIRACLES", en: "THE PEASANTS ASK FOR FEWER MIRACLES" },
    text: { fr: "« Les récoltes sont excellentes depuis des années. Les paysans réclament qu'on remercie aussi les bras, les dos et les phlyctènes. »", en: "\"The harvests have been excellent for years. The peasants demand that thanks also go to the arms, the backs, and the blisters.\"" },
    author: { fr: "Nessa, Marchande", en: "Nessa, Merchant" }
  },

  // --- Or dominant ---
  {
    id: "p4_gold_overflow",
    period: 4,
    conditionType: "or",
    title: { fr: "LE TRÉSOR DÉBORDE, LE PEUPLE AUSSI", en: "THE TREASURY OVERFLOWS, AND SO DO THE PEOPLE" },
    text: { fr: "« Les coffres sont pleins à craquer. Les pauvres demandent s'il est possible de faire ruisseler la richesse. »", en: "\"The coffers are bursting at the seams. The poor ask whether it might be possible to make the wealth trickle down.\"" },
    author: null
  },
  {
    id: "p4_gold_ministry",
    period: 4,
    conditionType: "or",
    title: { fr: "UN MINISTÈRE DE LA COMPTABILITE", en: "A MINISTRY OF ACCOUNTING" },
    text: { fr: "« La cité possède trop d'or pour être compté à la main. Je demande trois assistants, deux tables et une semaine sans prophète. »", en: "\"The city has too much gold to be counted by hand. I request three assistants, two tables, and one week without a prophet.\"" },
    author: { fr: "Edith, Intendante", en: "Edith, Steward" }
  },
  {
    id: "p4_gold_sacred",
    period: 4,
    conditionType: "or",
    title: { fr: "L'OR SACRÉ CHANGE DE SALLE", en: "THE SACRED GOLD CHANGES ROOMS" },
    text: { fr: "« Le temple affirme protéger les richesses du Créateur. Le roi affirme protéger le temple. Le peuple se sent un peu abandonné. »", en: "\"The temple claims to protect the riches of the Creator. The king claims to protect the temple. The people feel rather abandoned.\"" },
    author: { fr: "Khael, juge autoproclamé", en: "Khael, self-proclaimed judge" }
  },
  {
    id: "p4_gold_relics",
    period: 4,
    conditionType: "or",
    title: { fr: "LES MARCHANDS VENDENT DES RELIQUES NEUVES", en: "MERCHANTS SELL BRAND-NEW RELICS" },
    text: { fr: "« Des fragments de la volonté divine circulent au marché. La plupart portent encore l'odeur de l'atelier. »", en: "\"Fragments of the divine will circulate at the market. Most still carry the smell of the workshop.\"" },
    author: null
  },

  // --- Savoir actif ---
  {
    id: "p4_knowledge_question",
    period: 4,
    conditionType: "savoir",
    title: { fr: "UN PHILOSOPHE POSE LA MAUVAISE QUESTION", en: "A PHILOSOPHER ASKS THE WRONG QUESTION" },
    text: { fr: "« Et si nous n'étions pas bénis, mais observés ? »", en: "\"What if we were not blessed, but watched?\"" },
    author: { fr: "Aldric, philosophe", en: "Aldric, philosopher" }
  },
  {
    id: "p4_knowledge_treatise",
    period: 4,
    conditionType: "savoir",
    title: { fr: "PREMIER TRAITÉ SUR CELUI QUI REGARDE", en: "FIRST TREATISE ON THE ONE WHO WATCHES" },
    text: { fr: "« L'ouvrage parle de l'idée que notre cité soit guidée par une volonté extérieure. Il se vend mal, mais fait réfléchir. »", en: "\"The work explores the idea that our city is guided by an outside will. It sells poorly, but gives pause for thought.\"" },
    author: null
  },
  {
    id: "p4_knowledge_hand",
    period: 4,
    conditionType: "savoir",
    title: { fr: "UNE MAIN DANS LES HASARDS", en: "A HAND IN THE CHANCES" },
    text: { fr: "« Les catastrophes frappent sans prévenir, les ponts s'effondrent et les récoltes échouent parfois. Pourtant, au moment où tout semble perdu, une solution apparaît souvent. Je ne dis pas qu'on nous pousse. Je dis simplement que les coïncidences deviennent difficiles à ignorer. »", en: "\"Disasters strike without warning, bridges collapse, and harvests sometimes fail. And yet, at the moment when all seems lost, a solution often appears. I am not saying we are being nudged. I am simply saying the coincidences are becoming hard to ignore.\"" },
    author: { fr: "Raphaël, habitant", en: "Raphaël, citizen" }
  },
  {
    id: "p4_knowledge_medicine",
    period: 4,
    conditionType: "savoir",
    title: { fr: "LA MÉDECINE PROGRESSE, LE TEMPLE S'ADAPTE", en: "MEDICINE ADVANCES, THE TEMPLE ADAPTS" },
    text: { fr: "« Les médecins guérissent mieux qu'avant. Le temple annonce que les dieux ont toujours été favorables aux plantes, surtout depuis que la recherche existe. »", en: "\"The physicians heal better than before. The temple announces that the gods have always favored herbs, especially since research came along.\"" },
    author: null
  },

  // --- Jalons (Bonus) ---
  {
    id: "p4_bonus_start",
    period: 4,
    conditionType: "stage_start",
    title: { fr: "UNE NOUVELLE ÈRE EST PROCLAMÉE AU BALCON", en: "A NEW ERA IS PROCLAIMED FROM THE BALCONY" },
    text: { fr: "« Les hérauts annoncent un âge de paix, de grandeur et d'ordre. La foule applaudit, faute d'avoir reçu le programme. »", en: "\"The heralds announce an age of peace, grandeur, and order. The crowd applauds, for want of having received the program.\"" },
    author: null
  },
  {
    id: "p4_bonus_stage6",
    period: 4,
    conditionType: "stage_6",
    title: { fr: "LES ROUTES SONT SI DROITES QUE C'EN EST GÊNANT", en: "THE ROADS ARE SO STRAIGHT IT'S EMBARRASSING" },
    text: { fr: "« Les voies traversent plaines, forêts et collines avec une logique parfaite. Les cartographes remercient les ingénieurs. »", en: "\"The roads cross plains, forests, and hills with perfect logic. The cartographers thank the engineers.\"" },
    author: null
  },
  {
    id: "p4_bonus_stage12",
    period: 4,
    conditionType: "stage_12",
    title: { fr: "L'EMPIRE ORGANISE SES VOISINS", en: "THE EMPIRE ORGANIZES ITS NEIGHBORS" },
    text: { fr: "« Les cités voisines conservent leurs coutumes, leurs fêtes et leurs chefs, tant qu'elles obéissent correctement. »", en: "\"The neighboring cities keep their customs, their festivals, and their chiefs, so long as they obey properly.\"" },
    author: null
  },
  {
    id: "p4_bonus_pop1m",
    period: 4,
    conditionType: "pop_1m",
    title: { fr: "TROP DE MONDE POUR UNE SEULE PLACE PUBLIQUE", en: "TOO MANY PEOPLE FOR A SINGLE PUBLIC SQUARE" },
    text: { fr: "« La capitale a grandi si vite que les annonces officielles mettent sept jours à atteindre tout le monde. Les rumeurs circulent mieux. »", en: "\"The capital has grown so fast that official announcements take seven days to reach everyone. Rumors travel better.\"" },
    author: null
  },
  {
    id: "p4_bonus_peace1",
    period: 4,
    conditionType: "paix",
    title: { fr: "AUCUNE GUERRE, AUCUNE FAMINE, AUCUN MÉRITE", en: "NO WAR, NO FAMINE, NO CREDIT" },
    text: { fr: "« Tout va bien depuis si longtemps que les anciens commencent à mentir. C'était quand même plus dur avant. »", en: "\"All has been well for so long that the elders are starting to lie. It was harder back then, you know.\"" },
    author: { fr: "Renaud, citoyen", en: "Renaud, citizen" }
  },
  {
    id: "p4_bonus_peace2",
    period: 4,
    conditionType: "paix",
    title: { fr: "LA PAIX DEVIENT UNE THÉORIE POLITIQUE", en: "PEACE BECOMES A POLITICAL THEORY" },
    text: { fr: "« Les savants affirment que notre stabilité prouve l'existence d'un ordre supérieur. »", en: "\"The scholars assert that our stability proves the existence of a higher order.\"" },
    author: null
  },
  {
    id: "p4_bonus_watched",
    period: 4,
    conditionType: "bonus_libre",
    title: { fr: "ON NOUS REGARDE ?", en: "ARE WE BEING WATCHED?" },
    text: { fr: "« La question circule à voix basse dans les rues. Personne ne sait qui regarde, mais chacun commence à mieux se tenir. »", en: "\"The question passes in hushed voices through the streets. No one knows who is watching, but everyone is starting to behave a little better.\"" },
    author: null
  },

];
