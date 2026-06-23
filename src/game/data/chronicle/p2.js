"use strict";
// Articles de la chronique — Période 2 (extrait de chronicleArticles.js, Audit Phase 6).
export const chroniclePeriod2 = [
  // =========================================================================
  //  PÉRIODE 2 — Argile Gravée
  // =========================================================================

  // --- Crise (instability >= 0.75 || timeWear >= 0.75) ---
  {
    id: "p2_crisis_harvest",
    period: 2,
    conditionType: "crise",
    title: "LA RÉCOLTE A POURRI",
    text: "« Pluies sans fin, greniers vides. Les prêtres affirment qu'un dieu est en colère ; reste à savoir lequel, et pourquoi. »",
    author: "Claude, gardien du feu"
  },
  {
    id: "p2_crisis_flood",
    period: 2,
    conditionType: "crise",
    title: "INONDATION",
    text: "« La crue a noyé les champs, les réserves et les habitations. On reconstruit, comme l'an dernier, et comme l'an prochain sûrement. »",
    author: "Doran, habitant"
  },
  {
    id: "p2_crisis_neighbors",
    period: 2,
    conditionType: "crise",
    title: "LA CITÉ VOISINE VEUT NOS TERRES",
    text: "« Des hommes armés campent à la frontière. Le conseil hésite entre prier et fuir, et choisit de faire les deux. »",
    author: null
  },
  {
    id: "p2_crisis_plague",
    period: 2,
    conditionType: "crise",
    title: "LA MALADIE COURT DANS LES RUELLES",
    text: "« Les malades se comptent par dizaines. Les prêtres guérisseurs recommandent du repos, des offrandes, et de ne pas trop y penser. »",
    author: null
  },

  // --- Tension élevée (0.5 <= instability < 0.75) ---
  {
    id: "p2_tension_king",
    period: 2,
    conditionType: "tension",
    title: "LE ROI PREND TROP",
    text: "« Beaucoup trouvent que le palais mange mieux que ceux qui sèment. »",
    author: "Renaud, citoyen"
  },
  {
    id: "p2_tension_field",
    period: 2,
    conditionType: "tension",
    title: "À QUI APPARTIENT LE CHAMP DU MILIEU ?",
    text: "« Deux familles brandissent chacune une tablette prouvant qu'elles ont raison, ces dernières se contredisent. »",
    author: "Edith, comptable"
  },
  {
    id: "p2_tension_gods",
    period: 2,
    conditionType: "tension",
    title: "LES DIEUX DES UNS CONTRE LES DIEUX DES AUTRES",
    text: "« Le quartier d'en haut prie un dieu, celui d'en bas un autre. Aucun n'a encore été vu. »",
    author: null
  },
  {
    id: "p2_tension_strike",
    period: 2,
    conditionType: "tension",
    title: "GRÈVE DES PORTEURS D'EAU",
    text: "« Plus personne ne veut monter les seaux gratuitement. Le concept de salaire est évoqué mais vite enterré. »",
    author: null
  },

  // --- Usure élevée (0.5 <= timeWear < 0.75) ---
  {
    id: "p2_wear_bronze",
    period: 2,
    conditionType: "usure",
    title: "TOUJOURS PLUS",
    text: "« On use le bronze plus vite que je ne le fonds. Fondre, marteler, recommencer — Garin rêve d'un peu de repos. »",
    author: "Garin, tailleur de silex en reconversion"
  },
  {
    id: "p2_wear_canals",
    period: 2,
    conditionType: "usure",
    title: "LES CANAUX S'ENVASENT",
    text: "« L'eau passe de moins en moins bien. Curer les canaux est le travail que personne ne réclame et que tout le monde repousse. »",
    author: null
  },
  {
    id: "p2_wear_seasons",
    period: 2,
    conditionType: "usure",
    title: "LES MÊMES SAISONS, ENCORE",
    text: "« Semer, attendre, récolter, recommencer. Un ancien jure avoir déjà vécu cette année-là. On a mis ça sur le compte du grand âge. »",
    author: null
  },

  // --- Nourriture dominante ---
  {
    id: "p2_food_granaries",
    period: 2,
    conditionType: "nourriture",
    title: "LES GRENIERS DÉBORDENT",
    text: "« Tant de grain qu'on en perd le compte. Edith propose de tout noter sur des tablettes ; ainsi naît l'ennui administratif. »",
    author: "Raphael, habitant"
  },
  {
    id: "p2_food_feast",
    period: 2,
    conditionType: "nourriture",
    title: "UNE FÊTE, TROP DE BLÉ",
    text: "« Le surplus est tel qu'on découvre un nouveau fléau : le mal de ventre collectif. »",
    author: null
  },
  {
    id: "p2_food_cattle",
    period: 2,
    conditionType: "nourriture",
    title: "LES BÊTES SONT GRASSES",
    text: "« Les troupeaux n'ont jamais été si dodus. Je crains qu'à ce rythme, les moutons ne sachent même plus courir. »",
    author: "Nessa, l'éleveuse"
  },
  {
    id: "p2_food_export",
    period: 2,
    conditionType: "nourriture",
    title: "ON EXPORTE LE TROP-PLEIN",
    text: "« Des marchands viennent acheter notre surplus contre un métal jaune. Personne ne sait encore si c'est une bonne affaire. »",
    author: null
  },

  // --- Or dominant ---
  {
    id: "p2_gold_metal",
    period: 2,
    conditionType: "or",
    title: "LE MÉTAL QUI BRILLE VAUT TOUT",
    text: "« On échange grain, terres et bétail contre du métal jaune. Je tiens les comptes et soupire devant tant de chiffres. »",
    author: "Edith, comptable"
  },
  {
    id: "p2_gold_temple",
    period: 2,
    conditionType: "or",
    title: "LE TEMPLE EST PLUS RICHE QUE LE ROI",
    text: "« Les offrandes s'entassent dans les temples. Les dieux n'ont pourtant jamais réclamé d'or. »",
    author: "Claude, gardien du feu"
  },
  {
    id: "p2_gold_theft",
    period: 2,
    conditionType: "or",
    title: "LE PREMIER VOL D'OR DE L'HISTOIRE",
    text: "« La nourriture, ça passe. Les querelles entre voisins aussi. Mais de l'or ? Nous devons inventer en urgence le concept de punition. »",
    author: "Khael, juge autoproclamé"
  },
  {
    id: "p2_gold_tablets",
    period: 2,
    conditionType: "or",
    title: "CHACUN VEUT SA TABLETTE DE COMPTES",
    text: "« Posséder, c'est bien ; montrer qu'on possède, c'est mieux. Le marché des scribes explose. »",
    author: null
  },

  // --- Savoir actif ---
  {
    id: "p2_knowledge_clay",
    period: 2,
    conditionType: "savoir",
    title: "ON SAIT ÉCRIRE SUR L'ARGILE",
    text: "« Des marques dans la glaise gardent les formes une fois sèches. J'y vois l'avenir ; les anciens y voient des gribouillis. »",
    author: "Edith, comptable"
  },
  {
    id: "p2_knowledge_stars",
    period: 2,
    conditionType: "savoir",
    title: "LE CIEL SUIT DES RÈGLES",
    text: "« Un veilleur de nuit affirme que les astres reviennent toujours au même endroit. Si même le ciel est prévisible, que reste-t-il au hasard ? »",
    author: null
  },
  {
    id: "p2_knowledge_wheel",
    period: 2,
    conditionType: "savoir",
    title: "LA ROUE, FINALEMENT",
    text: "« Après des générations de refus, la cité adopte la roue. L'inventeur d'origine reçoit à titre posthume un tour en charrette. »",
    author: null
  },
  {
    id: "p2_knowledge_laws",
    period: 2,
    conditionType: "savoir",
    title: "DES LOIS GRAVÉES POUR TOUS",
    text: "« On inscrit les règles sur une grande pierre pour ne plus ignorer la loi. Beaucoup, ne sachant pas lire, ne savent toujours pas. »",
    author: null
  },

  // --- Jalons (Bonus) ---
  {
    id: "p2_bonus_start",
    period: 2,
    conditionType: "stage_start",
    title: "ON POSE LA PREMIÈRE PIERRE",
    text: "« La communauté décide de ne plus bouger et de bâtir pour de bon. Les nomades d'hier se découvrent une passion : la propriété. »",
    author: null
  },
  {
    id: "p2_bonus_stage6",
    period: 2,
    conditionType: "stage_6",
    title: "LA VILLE A MAINTENANT DES MURS",
    text: "« On entoure la cité de remparts. Dehors, le danger ; dedans, les querelles de voisinage. »",
    author: null
  },
  {
    id: "p2_bonus_stage12",
    period: 2,
    conditionType: "stage_12",
    title: "UN ROI POUR LES GOUVERNER",
    text: "« Lassée de tout décider en assemblée, la cité se choisit un roi. Elle se demande déjà comment s'en débarrasser. »",
    author: null
  },
  {
    id: "p2_bonus_pop10k",
    period: 2,
    conditionType: "pop_10k",
    title: "LA CITÉ NE TIENT PLUS DANS SES MURS",
    text: "« Trop d'habitants et pas assez de rues. On bâtit vers le haut, faute de pouvoir s'étendre. Les voisins du dessous protestent. »",
    author: null
  },
  {
    id: "p2_bonus_peace1",
    period: 2,
    conditionType: "paix",
    title: "NI GUERRE NI FAMINE : ÉTRANGE",
    text: "« Greniers pleins, frontières calmes. Les prêtres, méfiants, demandent davantage d'offrandes pour que ça dure. On ne sait jamais à qui on doit la chance. »",
    author: "Claude, gardien du feu"
  },
  {
    id: "p2_bonus_peace2",
    period: 2,
    conditionType: "paix",
    title: "UNE GÉNÉRATION SANS MALHEUR",
    text: "« Les vieux n'ont pas connu de fléau depuis si longtemps qu'ils ne savent plus quoi raconter aux enfants. Ils inventent donc des monstres, par prudence. »",
    author: null
  },

];
