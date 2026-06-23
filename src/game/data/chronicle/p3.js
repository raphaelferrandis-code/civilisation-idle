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
    title: "LA PESTE FRAPPE LA CITÉ ÉLUE",
    text: "« Les morts s'empilent malgré nos temples. Si nous sommes vraiment favorisés, certains trouvent que ça ne se voit pas beaucoup. »",
    author: "Claude, gardien du feu"
  },
  {
    id: "p3_crisis_barbarians",
    period: 3,
    conditionType: "crise",
    title: "LES BARBARES AUX PORTES",
    text: "« Une armée étrangère assiège la cité. Les prêtres promettent une protection divine. Les soldats préfèrent compter sur les murs. »",
    author: null
  },
  {
    id: "p3_crisis_fire",
    period: 3,
    conditionType: "crise",
    title: "L'ENTREPÔT CENTRAL A BRÛLÉ",
    text: "« Une nuit, tout le grain de l'année est parti en fumée. On cherche un coupable, et à défaut, on accuse le destin. »",
    author: "Doran, habitant"
  },
  {
    id: "p3_crisis_heir",
    period: 3,
    conditionType: "crise",
    title: "LE ROI EST MORT SANS HÉRITIER",
    text: "« Trois cousins revendiquent le trône. La cité, prudente, prépare déjà trois fêtes de couronnement. »",
    author: null
  },

  // --- Tension élevée (0.5 <= instability < 0.75) ---
  {
    id: "p3_tension_taxes",
    period: 3,
    conditionType: "tension",
    title: "IMPÔTS EN HAUSSE, CHAUSSÉES EN RUINE",
    text: "« On paie toujours plus pour réparer les chemins. À ce jour, le seul trajet vraiment amélioré est celui entre nos poches et celles du percepteur. »",
    author: "Renaud, citoyen"
  },
  {
    id: "p3_tension_philosophers",
    period: 3,
    conditionType: "tension",
    title: "LES PHILOSOPHES SE DISPUTENT SUR LA PLACE",
    text: "« L'un dit que tout est nombre, l'autre que tout est lettres. Au final, le public a surtout faim. »",
    author: "Aldric, philosophe"
  },
  {
    id: "p3_tension_schism",
    period: 3,
    conditionType: "tension",
    title: "SCHISME AU TEMPLE",
    text: "« Deux prêtres ne s'accordent plus sur la volonté des dieux. Chacun fonde son propre temple, avec sa propre quête. »",
    author: "Claude, gardien du feu"
  },
  {
    id: "p3_tension_scribes",
    period: 3,
    conditionType: "tension",
    title: "LA GUILDE DES SCRIBES EN COLÈRE",
    text: "« Copier coûte cher, lire est gratuit. Les scribes jugent l'équation injuste et cessent la plume. »",
    author: "Edith, comptable"
  },

  // --- Usure élevée (0.5 <= timeWear < 0.75) ---
  {
    id: "p3_wear_aqueducts",
    period: 3,
    conditionType: "usure",
    title: "LES AQUEDUCS SE LÉZARDENT",
    text: "« Bâtis par les anciennes générations, mais jamais réparés par les nouvelles. On admire l'ouvrage en attendant qu'il nous tombe dessus. »",
    author: "Garin, forgeron"
  },
  {
    id: "p3_wear_oldtexts",
    period: 3,
    conditionType: "usure",
    title: "PLUS PERSONNE NE SAIT LIRE LES VIEUX TEXTES",
    text: "« Les manuscrits des anciens dorment dans la poussière. Tant de savoirs perdus pour rien, et très proprement classés. »",
    author: "Edith, comptable"
  },
  {
    id: "p3_wear_history",
    period: 3,
    conditionType: "usure",
    title: "L'HISTOIRE BÉGAIE",
    text: "« Un savant remarque que les empires montent et tombent toujours pareil. Il l'écrit, personne ne le lit. L'histoire se répète. »",
    author: null
  },

  // --- Nourriture dominante ---
  {
    id: "p3_food_blessed",
    period: 3,
    conditionType: "nourriture",
    title: "UNE ANNÉE DE BLÉ BÉNIE",
    text: "« Les champs croulent. Les prêtres y voient la preuve que leurs bénédictions marchent ; les paysans y voient la preuve qu'ils ont travaillé. »",
    author: "Nessa, marchande"
  },
  {
    id: "p3_food_wine",
    period: 3,
    conditionType: "nourriture",
    title: "LE VIN COULE À FLOT",
    text: "« La vendange est si bonne que la cité célèbre sans interruption depuis trois jours. Le travail attendra que les têtes décantent. »",
    author: null
  },
  {
    id: "p3_food_feast",
    period: 3,
    conditionType: "nourriture",
    title: "DES FÊTES POUR REMERCIER QUI ?",
    text: "« On banquette en l'honneur des dieux et les plats finissent dans nos ventres. Un enfant demande à qui profitent vraiment les offrandes. »",
    author: null
  },
  {
    id: "p3_food_storage",
    period: 3,
    conditionType: "nourriture",
    title: "PROBLÈME DE STOCKAGE",
    text: "« La cité produit trop de blé. Les mendiants proposent très généreusement de nous aider à régler ce problème. »",
    author: null
  },

  // --- Or dominant ---
  {
    id: "p3_gold_richest",
    period: 3,
    conditionType: "or",
    title: "LA CITÉ LA PLUS RICHE DU MONDE CONNU",
    text: "« Notre or attire marchands et voleurs des quatre horizons. Je tiens des registres si longs que je commence à croire que le vol n'est qu'un commerce sans tampon. »",
    author: "Edith, comptable"
  },
  {
    id: "p3_gold_lending",
    period: 3,
    conditionType: "or",
    title: "ON PRÊTE DE L'OR CONTRE PLUS D'OR",
    text: "« Un marchand prête, puis réclame davantage qu'il n'a donné. Adoption générale : on appellera ça la banque. »",
    author: null
  },
  {
    id: "p3_gold_statues",
    period: 3,
    conditionType: "or",
    title: "STATUES D'OR À CHAQUE COIN DE RUE",
    text: "« On dresse des effigies dorées des dieux protecteurs. Curieusement, elles ressemblent surtout aux notables qui les financent. »",
    author: "Khael, juge autoproclamé"
  },
  {
    id: "p3_gold_temple",
    period: 3,
    conditionType: "or",
    title: "L'OR DU TEMPLE FAIT DES JALOUX",
    text: "« Les caves sacrées débordent. Le roi lorgne, le peuple murmure, les prêtres serrent les clés. »",
    author: "Claude, gardien du feu"
  },

  // --- Savoir actif ---
  {
    id: "p3_knowledge_library",
    period: 3,
    conditionType: "savoir",
    title: "UNE GRANDE BIBLIOTHÈQUE OUVRE SES PORTES",
    text: "« On rassemble tout le savoir du monde sous un même toit. Reste à trouver des gens qui savent lire. »",
    author: "Edith, comptable"
  },
  {
    id: "p3_knowledge_stars",
    period: 3,
    conditionType: "savoir",
    title: "LES ASTRES ANNONCENT-ILS NOTRE DESTIN ?",
    text: "« Les astrologues ont noté que la cité était née dans l'alignement de deux planètes. Ils en concluent que nous sommes choisis. Reste à savoir par qui, et pour quoi. »",
    author: "Aldric, philosophe"
  },
  {
    id: "p3_knowledge_probability",
    period: 3,
    conditionType: "savoir",
    title: "LE CALCUL DES CHANCES",
    text: "« Un savant a mesuré notre prospérité : trop régulière pour être due au seul hasard. Il évoque \"une main invisible\". Nous lui conseillons de se reposer. »",
    author: "Raphaël, habitant"
  },
  {
    id: "p3_knowledge_medicine",
    period: 3,
    conditionType: "savoir",
    title: "LA MÉDECINE REMPLACE (PARFOIS) LA PRIÈRE",
    text: "« Une fièvre tenace a disparu après quelques décoctions. Le temple se félicite d'avoir été entendu. Le médecin n'a pas contredit. »",
    author: null
  },

  // --- Jalons (Bonus) ---
  {
    id: "p3_bonus_start",
    period: 3,
    conditionType: "stage_start",
    title: "UN NOUVEL ÂGE D'OR EST PROCLAMÉ",
    text: "« La cité entre dans une ère qu'on dit dorée. Comme à chaque ère, d'ailleurs. Les hérauts manquent d'imagination. »",
    author: null
  },
  {
    id: "p3_bonus_stage6",
    period: 3,
    conditionType: "stage_6",
    title: "DES ROUTES MÈNENT PARTOUT",
    text: "« On pave des chemins vers les cités voisines. Le commerce explose, les idées circulent, les maladies aussi. »",
    author: null
  },
  {
    id: "p3_bonus_stage12",
    period: 3,
    conditionType: "stage_12",
    title: "UN EMPIRE, RIEN DE MOINS",
    text: "« La cité a tant grandi qu'elle gouverne ses voisines. On appelle ça un empire. Ça passe mieux. »",
    author: null
  },
  {
    id: "p3_bonus_pop100k",
    period: 3,
    conditionType: "pop_100k",
    title: "LA CAPITALE GROUILLE DE MONDE",
    text: "« Tant d'habitants qu'on se perd dans sa propre cité. On invente les plans gravés. On s'y perd aussi. »",
    author: null
  },
  {
    id: "p3_bonus_peace1",
    period: 3,
    conditionType: "paix",
    title: "UN SIÈCLE SANS GUERRE : SUSPECT",
    text: "« Ni peste, ni invasion, ni famine depuis des générations. Les savants cherchent la cause ; les prêtres crient au miracle. »",
    author: "Claude, gardien du feu"
  },
  {
    id: "p3_bonus_peace2",
    period: 3,
    conditionType: "paix",
    title: "TOUT VA SI BIEN QUE C'EN EST GÊNANT",
    text: "« La prospérité est telle que les poètes manquent de tragédies à chanter. Ils en inventent pour ne pas perdre la main. »",
    author: null
  },

];
