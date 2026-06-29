"use strict";
// Articles de la chronique — Période 3 (extrait de chronicleArticles.js, Audit Phase 6).
export const chroniclePeriod3 = [
  // =========================================================================
  //  PÉRIODE 3 — Manuscrit
  // =========================================================================

  // --- Crise (instability >= 0.75 || timeWear >= 0.75) ---
  {
    id: "p3_crisis_plague",
    period: 3,
    conditionType: "crise",
    title: { fr: "LA PESTE FRAPPE LA CITÉ ÉLUE", en: "PLAGUE STRIKES THE CHOSEN CITY" },
    text: { fr: "« Les morts s'empilent malgré nos temples. Si nous sommes vraiment favorisés, certains trouvent que ça ne se voit pas beaucoup. »", en: "\"The dead pile up despite our temples. If we are truly favored, some feel it does not show very much.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the flame" }
  },
  {
    id: "p3_crisis_barbarians",
    period: 3,
    conditionType: "crise",
    title: { fr: "LES BARBARES AUX PORTES", en: "BARBARIANS AT THE GATES" },
    text: { fr: "« Une armée étrangère assiège la cité. Les prêtres promettent une protection divine. Les soldats préfèrent compter sur les murs. »", en: "\"A foreign army besieges the city. The priests promise divine protection. The soldiers would rather count on the walls.\"" },
    author: null
  },
  {
    id: "p3_crisis_fire",
    period: 3,
    conditionType: "crise",
    title: { fr: "L'ENTREPÔT CENTRAL A BRÛLÉ", en: "THE CENTRAL WAREHOUSE HAS BURNED" },
    text: { fr: "« Une nuit, tout le grain de l'année est parti en fumée. On cherche un coupable, et à défaut, on accuse le destin. »", en: "\"One night, the whole year's grain went up in smoke. We look for a culprit, and failing that, we blame fate.\"" },
    author: { fr: "Doran, habitant", en: "Doran, citizen" }
  },
  {
    id: "p3_crisis_heir",
    period: 3,
    conditionType: "crise",
    title: { fr: "LE ROI EST MORT SANS HÉRITIER", en: "THE KING IS DEAD WITHOUT AN HEIR" },
    text: { fr: "« Trois cousins revendiquent le trône. La cité, prudente, prépare déjà trois fêtes de couronnement. »", en: "\"Three cousins claim the throne. The city, ever prudent, is already preparing three coronation feasts.\"" },
    author: null
  },

  // --- Tension élevée (0.5 <= instability < 0.75) ---
  {
    id: "p3_tension_taxes",
    period: 3,
    conditionType: "tension",
    title: { fr: "IMPÔTS EN HAUSSE, CHAUSSÉES EN RUINE", en: "TAXES RISING, ROADS IN RUINS" },
    text: { fr: "« On paie toujours plus pour réparer les chemins. À ce jour, le seul trajet vraiment amélioré est celui entre nos poches et celles du percepteur. »", en: "\"We pay ever more to mend the roads. To this day, the only route truly improved is the one between our pockets and the tax collector's.\"" },
    author: { fr: "Renaud, citoyen", en: "Renaud, citizen" }
  },
  {
    id: "p3_tension_philosophers",
    period: 3,
    conditionType: "tension",
    title: { fr: "LES PHILOSOPHES SE DISPUTENT SUR LA PLACE", en: "PHILOSOPHERS QUARREL IN THE SQUARE" },
    text: { fr: "« L'un dit que tout est nombre, l'autre que tout est lettres. Au final, le public a surtout faim. »", en: "\"One says all is number, the other that all is letters. In the end, the crowd is mostly hungry.\"" },
    author: { fr: "Aldric, philosophe", en: "Aldric, philosopher" }
  },
  {
    id: "p3_tension_schism",
    period: 3,
    conditionType: "tension",
    title: { fr: "SCHISME AU TEMPLE", en: "SCHISM AT THE TEMPLE" },
    text: { fr: "« Deux prêtres ne s'accordent plus sur la volonté des dieux. Chacun fonde son propre temple, avec sa propre quête. »", en: "\"Two priests no longer agree on the will of the gods. Each founds his own temple, with his own quest.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the flame" }
  },
  {
    id: "p3_tension_scribes",
    period: 3,
    conditionType: "tension",
    title: { fr: "LA GUILDE DES SCRIBES EN COLÈRE", en: "THE SCRIBES' GUILD IN ANGER" },
    text: { fr: "« Copier coûte cher, lire est gratuit. Les scribes jugent l'équation injuste et cessent la plume. »", en: "\"Copying is costly, reading is free. The scribes deem the equation unfair and lay down the quill.\"" },
    author: { fr: "Edith, comptable", en: "Edith, bookkeeper" }
  },

  // --- Usure élevée (0.5 <= timeWear < 0.75) ---
  {
    id: "p3_wear_aqueducts",
    period: 3,
    conditionType: "usure",
    title: { fr: "LES AQUEDUCS SE LÉZARDENT", en: "THE AQUEDUCTS ARE CRACKING" },
    text: { fr: "« Bâtis par les anciennes générations, mais jamais réparés par les nouvelles. On admire l'ouvrage en attendant qu'il nous tombe dessus. »", en: "\"Built by the old generations, but never mended by the new. We admire the work while waiting for it to fall on us.\"" },
    author: { fr: "Garin, forgeron", en: "Garin, blacksmith" }
  },
  {
    id: "p3_wear_oldtexts",
    period: 3,
    conditionType: "usure",
    title: { fr: "PLUS PERSONNE NE SAIT LIRE LES VIEUX TEXTES", en: "NO ONE CAN READ THE OLD TEXTS ANYMORE" },
    text: { fr: "« Les manuscrits des anciens dorment dans la poussière. Tant de savoirs perdus pour rien, et très proprement classés. »", en: "\"The manuscripts of the ancients sleep in the dust. So much knowledge lost for nothing, and very neatly filed.\"" },
    author: { fr: "Edith, comptable", en: "Edith, bookkeeper" }
  },
  {
    id: "p3_wear_history",
    period: 3,
    conditionType: "usure",
    title: { fr: "L'HISTOIRE BÉGAIE", en: "HISTORY STUTTERS" },
    text: { fr: "« Un savant remarque que les empires montent et tombent toujours pareil. Il l'écrit, personne ne le lit. L'histoire se répète. »", en: "\"A scholar notes that empires always rise and fall the same way. He writes it down, no one reads it. History repeats itself.\"" },
    author: null
  },

  // --- Nourriture dominante ---
  {
    id: "p3_food_blessed",
    period: 3,
    conditionType: "nourriture",
    title: { fr: "UNE ANNÉE DE BLÉ BÉNIE", en: "A BLESSED YEAR OF WHEAT" },
    text: { fr: "« Les champs croulent. Les prêtres y voient la preuve que leurs bénédictions marchent ; les paysans y voient la preuve qu'ils ont travaillé. »", en: "\"The fields are overflowing. The priests see proof that their blessings work; the peasants see proof that they labored.\"" },
    author: { fr: "Nessa, marchande", en: "Nessa, merchant" }
  },
  {
    id: "p3_food_wine",
    period: 3,
    conditionType: "nourriture",
    title: { fr: "LE VIN COULE À FLOT", en: "THE WINE FLOWS FREELY" },
    text: { fr: "« La vendange est si bonne que la cité célèbre sans interruption depuis trois jours. Le travail attendra que les têtes décantent. »", en: "\"The harvest is so good that the city has celebrated without pause for three days. Work will wait until the heads clear.\"" },
    author: null
  },
  {
    id: "p3_food_feast",
    period: 3,
    conditionType: "nourriture",
    title: { fr: "DES FÊTES POUR REMERCIER QUI ?", en: "FEASTS TO THANK WHOM?" },
    text: { fr: "« On banquette en l'honneur des dieux et les plats finissent dans nos ventres. Un enfant demande à qui profitent vraiment les offrandes. »", en: "\"We feast in honor of the gods and the dishes end up in our bellies. A child asks who really profits from the offerings.\"" },
    author: null
  },
  {
    id: "p3_food_storage",
    period: 3,
    conditionType: "nourriture",
    title: { fr: "PROBLÈME DE STOCKAGE", en: "A STORAGE PROBLEM" },
    text: { fr: "« La cité produit trop de blé. Les mendiants proposent très généreusement de nous aider à régler ce problème. »", en: "\"The city produces too much wheat. The beggars very generously offer to help us solve this problem.\"" },
    author: null
  },

  // --- Or dominant ---
  {
    id: "p3_gold_richest",
    period: 3,
    conditionType: "or",
    title: { fr: "LA CITÉ LA PLUS RICHE DU MONDE CONNU", en: "THE RICHEST CITY IN THE KNOWN WORLD" },
    text: { fr: "« Notre or attire marchands et voleurs des quatre horizons. Je tiens des registres si longs que je commence à croire que le vol n'est qu'un commerce sans tampon. »", en: "\"Our gold draws merchants and thieves from all four horizons. I keep ledgers so long that I am beginning to believe theft is merely trade without a stamp.\"" },
    author: { fr: "Edith, comptable", en: "Edith, bookkeeper" }
  },
  {
    id: "p3_gold_lending",
    period: 3,
    conditionType: "or",
    title: { fr: "ON PRÊTE DE L'OR CONTRE PLUS D'OR", en: "GOLD IS LENT FOR MORE GOLD" },
    text: { fr: "« Un marchand prête, puis réclame davantage qu'il n'a donné. Adoption générale : on appellera ça la banque. »", en: "\"A merchant lends, then demands more than he gave. Widely adopted: we shall call it banking.\"" },
    author: null
  },
  {
    id: "p3_gold_statues",
    period: 3,
    conditionType: "or",
    title: { fr: "STATUES D'OR À CHAQUE COIN DE RUE", en: "GOLDEN STATUES ON EVERY STREET CORNER" },
    text: { fr: "« On dresse des effigies dorées des dieux protecteurs. Curieusement, elles ressemblent surtout aux notables qui les financent. »", en: "\"Gilded effigies of the guardian gods are raised. Curiously, they mostly resemble the notables who fund them.\"" },
    author: { fr: "Khael, juge autoproclamé", en: "Khael, self-proclaimed judge" }
  },
  {
    id: "p3_gold_temple",
    period: 3,
    conditionType: "or",
    title: { fr: "L'OR DU TEMPLE FAIT DES JALOUX", en: "THE TEMPLE'S GOLD STIRS ENVY" },
    text: { fr: "« Les caves sacrées débordent. Le roi lorgne, le peuple murmure, les prêtres serrent les clés. »", en: "\"The sacred vaults overflow. The king eyes them, the people murmur, the priests clutch the keys.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the flame" }
  },

  // --- Savoir actif ---
  {
    id: "p3_knowledge_library",
    period: 3,
    conditionType: "savoir",
    title: { fr: "UNE GRANDE BIBLIOTHÈQUE OUVRE SES PORTES", en: "A GREAT LIBRARY OPENS ITS DOORS" },
    text: { fr: "« On rassemble tout le savoir du monde sous un même toit. Reste à trouver des gens qui savent lire. »", en: "\"All the knowledge of the world is gathered under one roof. Now we just need to find people who can read.\"" },
    author: { fr: "Edith, comptable", en: "Edith, bookkeeper" }
  },
  {
    id: "p3_knowledge_stars",
    period: 3,
    conditionType: "savoir",
    title: { fr: "LES ASTRES ANNONCENT-ILS NOTRE DESTIN ?", en: "DO THE STARS FORETELL OUR FATE?" },
    text: { fr: "« Les astrologues ont noté que la cité était née dans l'alignement de deux planètes. Ils en concluent que nous sommes choisis. Reste à savoir par qui, et pour quoi. »", en: "\"The astrologers have noted that the city was born under the alignment of two planets. They conclude that we are chosen. It remains to be known by whom, and for what.\"" },
    author: { fr: "Aldric, philosophe", en: "Aldric, philosopher" }
  },
  {
    id: "p3_knowledge_probability",
    period: 3,
    conditionType: "savoir",
    title: { fr: "LE CALCUL DES CHANCES", en: "THE RECKONING OF ODDS" },
    text: { fr: "« Un savant a mesuré notre prospérité : trop régulière pour être due au seul hasard. Il évoque \"une main invisible\". Nous lui conseillons de se reposer. »", en: "\"A scholar measured our prosperity: too regular to be owed to chance alone. He speaks of \\\"an invisible hand.\\\" We advise him to get some rest.\"" },
    author: { fr: "Raphaël, habitant", en: "Raphaël, citizen" }
  },
  {
    id: "p3_knowledge_medicine",
    period: 3,
    conditionType: "savoir",
    title: { fr: "LA MÉDECINE REMPLACE (PARFOIS) LA PRIÈRE", en: "MEDICINE REPLACES PRAYER (SOMETIMES)" },
    text: { fr: "« Une fièvre tenace a disparu après quelques décoctions. Le temple se félicite d'avoir été entendu. Le médecin n'a pas contredit. »", en: "\"A stubborn fever vanished after a few decoctions. The temple congratulates itself on being heard. The physician did not contradict.\"" },
    author: null
  },

  // --- Jalons (Bonus) ---
  {
    id: "p3_bonus_start",
    period: 3,
    conditionType: "stage_start",
    title: { fr: "UN NOUVEL ÂGE D'OR EST PROCLAMÉ", en: "A NEW GOLDEN AGE IS PROCLAIMED" },
    text: { fr: "« La cité entre dans une ère qu'on dit dorée. Comme à chaque ère, d'ailleurs. Les hérauts manquent d'imagination. »", en: "\"The city enters an era said to be golden. As with every era, in fact. The heralds lack imagination.\"" },
    author: null
  },
  {
    id: "p3_bonus_stage6",
    period: 3,
    conditionType: "stage_6",
    title: { fr: "DES ROUTES MÈNENT PARTOUT", en: "ROADS LEAD EVERYWHERE" },
    text: { fr: "« On pave des chemins vers les cités voisines. Le commerce explose, les idées circulent, les maladies aussi. »", en: "\"Roads are paved toward the neighboring cities. Trade booms, ideas circulate, and so do diseases.\"" },
    author: null
  },
  {
    id: "p3_bonus_stage12",
    period: 3,
    conditionType: "stage_12",
    title: { fr: "UN EMPIRE, RIEN DE MOINS", en: "AN EMPIRE, NO LESS" },
    text: { fr: "« La cité a tant grandi qu'elle gouverne ses voisines. On appelle ça un empire. Ça passe mieux. »", en: "\"The city has grown so much that it governs its neighbors. We call it an empire. It goes down better.\"" },
    author: null
  },
  {
    id: "p3_bonus_pop100k",
    period: 3,
    conditionType: "pop_100k",
    title: { fr: "LA CAPITALE GROUILLE DE MONDE", en: "THE CAPITAL TEEMS WITH PEOPLE" },
    text: { fr: "« Tant d'habitants qu'on se perd dans sa propre cité. On invente les plans gravés. On s'y perd aussi. »", en: "\"So many inhabitants that one gets lost in one's own city. We invent engraved maps. We get lost in those too.\"" },
    author: null
  },
  {
    id: "p3_bonus_peace1",
    period: 3,
    conditionType: "paix",
    title: { fr: "UN SIÈCLE SANS GUERRE : SUSPECT", en: "A CENTURY WITHOUT WAR: SUSPICIOUS" },
    text: { fr: "« Ni peste, ni invasion, ni famine depuis des générations. Les savants cherchent la cause ; les prêtres crient au miracle. »", en: "\"No plague, no invasion, no famine for generations. The scholars search for the cause; the priests cry miracle.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the flame" }
  },
  {
    id: "p3_bonus_peace2",
    period: 3,
    conditionType: "paix",
    title: { fr: "TOUT VA SI BIEN QUE C'EN EST GÊNANT", en: "ALL IS SO WELL IT'S EMBARRASSING" },
    text: { fr: "« La prospérité est telle que les poètes manquent de tragédies à chanter. Ils en inventent pour ne pas perdre la main. »", en: "\"Prosperity is such that the poets run short of tragedies to sing. They invent some so as not to lose their touch.\"" },
    author: null
  },

];
