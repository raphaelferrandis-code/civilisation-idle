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
    title: { fr: "LA RÉCOLTE A POURRI", en: "THE HARVEST HAS ROTTED" },
    text: { fr: "« Pluies sans fin, greniers vides. Les prêtres affirment qu'un dieu est en colère ; reste à savoir lequel, et pourquoi. »", en: "\"Endless rains, empty granaries. The priests declare a god is angry; it remains to be known which one, and why.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },
  {
    id: "p2_crisis_flood",
    period: 2,
    conditionType: "crise",
    title: { fr: "INONDATION", en: "FLOOD" },
    text: { fr: "« La crue a noyé les champs, les réserves et les habitations. On reconstruit, comme l'an dernier, et comme l'an prochain sûrement. »", en: "\"The flood drowned the fields, the stores and the dwellings. We rebuild, like last year, and surely like next year too.\"" },
    author: { fr: "Doran, habitant", en: "Doran, dweller" }
  },
  {
    id: "p2_crisis_neighbors",
    period: 2,
    conditionType: "crise",
    title: { fr: "LA CITÉ VOISINE VEUT NOS TERRES", en: "THE NEIGHBORING CITY WANTS OUR LANDS" },
    text: { fr: "« Des hommes armés campent à la frontière. Le conseil hésite entre prier et fuir, et choisit de faire les deux. »", en: "\"Armed men are camped at the border. The council wavers between praying and fleeing, and chooses to do both.\"" },
    author: null
  },
  {
    id: "p2_crisis_plague",
    period: 2,
    conditionType: "crise",
    title: { fr: "LA MALADIE COURT DANS LES RUELLES", en: "SICKNESS RUNS THROUGH THE ALLEYS" },
    text: { fr: "« Les malades se comptent par dizaines. Les prêtres guérisseurs recommandent du repos, des offrandes, et de ne pas trop y penser. »", en: "\"The sick number in the dozens. The healer-priests recommend rest, offerings, and not thinking about it too much.\"" },
    author: null
  },

  // --- Tension élevée (0.5 <= instability < 0.75) ---
  {
    id: "p2_tension_king",
    period: 2,
    conditionType: "tension",
    title: { fr: "LE ROI PREND TROP", en: "THE KING TAKES TOO MUCH" },
    text: { fr: "« Beaucoup trouvent que le palais mange mieux que ceux qui sèment. »", en: "\"Many feel that the palace eats better than those who sow.\"" },
    author: { fr: "Renaud, citoyen", en: "Renaud, citizen" }
  },
  {
    id: "p2_tension_field",
    period: 2,
    conditionType: "tension",
    title: { fr: "À QUI APPARTIENT LE CHAMP DU MILIEU ?", en: "WHO OWNS THE MIDDLE FIELD?" },
    text: { fr: "« Deux familles brandissent chacune une tablette prouvant qu'elles ont raison, ces dernières se contredisent. »", en: "\"Two families each brandish a tablet proving they are right, and the tablets contradict each other.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },
  {
    id: "p2_tension_gods",
    period: 2,
    conditionType: "tension",
    title: { fr: "LES DIEUX DES UNS CONTRE LES DIEUX DES AUTRES", en: "ONE SIDE'S GODS AGAINST THE OTHER'S" },
    text: { fr: "« Le quartier d'en haut prie un dieu, celui d'en bas un autre. Aucun n'a encore été vu. »", en: "\"The upper quarter prays to one god, the lower to another. Neither has yet been seen.\"" },
    author: null
  },
  {
    id: "p2_tension_strike",
    period: 2,
    conditionType: "tension",
    title: { fr: "GRÈVE DES PORTEURS D'EAU", en: "THE WATER-CARRIERS GO ON STRIKE" },
    text: { fr: "« Plus personne ne veut monter les seaux gratuitement. Le concept de salaire est évoqué mais vite enterré. »", en: "\"No one wants to haul the buckets up for free anymore. The concept of a wage is raised, then quickly buried.\"" },
    author: null
  },

  // --- Usure élevée (0.5 <= timeWear < 0.75) ---
  {
    id: "p2_wear_bronze",
    period: 2,
    conditionType: "usure",
    title: { fr: "TOUJOURS PLUS", en: "ALWAYS MORE" },
    text: { fr: "« On use le bronze plus vite que je ne le fonds. Fondre, marteler, recommencer — Garin rêve d'un peu de repos. »", en: "\"We wear out the bronze faster than I can smelt it. Smelt, hammer, start over — Garin dreams of a little rest.\"" },
    author: { fr: "Garin, tailleur de silex en reconversion", en: "Garin, flint knapper retraining" }
  },
  {
    id: "p2_wear_canals",
    period: 2,
    conditionType: "usure",
    title: { fr: "LES CANAUX S'ENVASENT", en: "THE CANALS SILT UP" },
    text: { fr: "« L'eau passe de moins en moins bien. Curer les canaux est le travail que personne ne réclame et que tout le monde repousse. »", en: "\"The water flows less and less well. Dredging the canals is the work no one asks for and everyone puts off.\"" },
    author: null
  },
  {
    id: "p2_wear_seasons",
    period: 2,
    conditionType: "usure",
    title: { fr: "LES MÊMES SAISONS, ENCORE", en: "THE SAME SEASONS, AGAIN" },
    text: { fr: "« Semer, attendre, récolter, recommencer. Un ancien jure avoir déjà vécu cette année-là. On a mis ça sur le compte du grand âge. »", en: "\"Sow, wait, harvest, start over. An elder swears he has already lived through this very year. We put it down to his great age.\"" },
    author: null
  },

  // --- Nourriture dominante ---
  {
    id: "p2_food_granaries",
    period: 2,
    conditionType: "nourriture",
    title: { fr: "LES GRENIERS DÉBORDENT", en: "THE GRANARIES OVERFLOW" },
    text: { fr: "« Tant de grain qu'on en perd le compte. Edith propose de tout noter sur des tablettes ; ainsi naît l'ennui administratif. »", en: "\"So much grain we lose count of it. Edith proposes recording it all on tablets; thus is born administrative boredom.\"" },
    author: { fr: "Raphael, habitant", en: "Raphael, dweller" }
  },
  {
    id: "p2_food_feast",
    period: 2,
    conditionType: "nourriture",
    title: { fr: "UNE FÊTE, TROP DE BLÉ", en: "A FEAST, TOO MUCH WHEAT" },
    text: { fr: "« Le surplus est tel qu'on découvre un nouveau fléau : le mal de ventre collectif. »", en: "\"The surplus is such that we discover a new scourge: the collective bellyache.\"" },
    author: null
  },
  {
    id: "p2_food_cattle",
    period: 2,
    conditionType: "nourriture",
    title: { fr: "LES BÊTES SONT GRASSES", en: "THE BEASTS ARE FAT" },
    text: { fr: "« Les troupeaux n'ont jamais été si dodus. Je crains qu'à ce rythme, les moutons ne sachent même plus courir. »", en: "\"The herds have never been so plump. I fear that at this rate, the sheep will forget how to run.\"" },
    author: { fr: "Nessa, l'éleveuse", en: "Nessa, the herder" }
  },
  {
    id: "p2_food_export",
    period: 2,
    conditionType: "nourriture",
    title: { fr: "ON EXPORTE LE TROP-PLEIN", en: "WE EXPORT THE OVERFLOW" },
    text: { fr: "« Des marchands viennent acheter notre surplus contre un métal jaune. Personne ne sait encore si c'est une bonne affaire. »", en: "\"Merchants come to buy our surplus with a yellow metal. No one yet knows whether it's a good deal.\"" },
    author: null
  },

  // --- Or dominant ---
  {
    id: "p2_gold_metal",
    period: 2,
    conditionType: "or",
    title: { fr: "LE MÉTAL QUI BRILLE VAUT TOUT", en: "THE SHINING METAL IS WORTH EVERYTHING" },
    text: { fr: "« On échange grain, terres et bétail contre du métal jaune. Je tiens les comptes et soupire devant tant de chiffres. »", en: "\"We trade grain, lands and livestock for yellow metal. I keep the accounts and sigh at so many figures.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },
  {
    id: "p2_gold_temple",
    period: 2,
    conditionType: "or",
    title: { fr: "LE TEMPLE EST PLUS RICHE QUE LE ROI", en: "THE TEMPLE IS RICHER THAN THE KING" },
    text: { fr: "« Les offrandes s'entassent dans les temples. Les dieux n'ont pourtant jamais réclamé d'or. »", en: "\"Offerings pile up in the temples. Yet the gods have never asked for gold.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },
  {
    id: "p2_gold_theft",
    period: 2,
    conditionType: "or",
    title: { fr: "LE PREMIER VOL D'OR DE L'HISTOIRE", en: "THE FIRST GOLD THEFT IN HISTORY" },
    text: { fr: "« La nourriture, ça passe. Les querelles entre voisins aussi. Mais de l'or ? Nous devons inventer en urgence le concept de punition. »", en: "\"Food, that's forgivable. Quarrels between neighbors too. But gold? We must urgently invent the concept of punishment.\"" },
    author: { fr: "Khael, juge autoproclamé", en: "Khael, self-proclaimed judge" }
  },
  {
    id: "p2_gold_tablets",
    period: 2,
    conditionType: "or",
    title: { fr: "CHACUN VEUT SA TABLETTE DE COMPTES", en: "EVERYONE WANTS THEIR OWN LEDGER TABLET" },
    text: { fr: "« Posséder, c'est bien ; montrer qu'on possède, c'est mieux. Le marché des scribes explose. »", en: "\"To own is good; to show that you own is better. The market for scribes is booming.\"" },
    author: null
  },

  // --- Savoir actif ---
  {
    id: "p2_knowledge_clay",
    period: 2,
    conditionType: "savoir",
    title: { fr: "ON SAIT ÉCRIRE SUR L'ARGILE", en: "WE CAN WRITE ON CLAY" },
    text: { fr: "« Des marques dans la glaise gardent les formes une fois sèches. J'y vois l'avenir ; les anciens y voient des gribouillis. »", en: "\"Marks in the clay keep their shapes once dry. I see the future in them; the elders see scribbles.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },
  {
    id: "p2_knowledge_stars",
    period: 2,
    conditionType: "savoir",
    title: { fr: "LE CIEL SUIT DES RÈGLES", en: "THE SKY FOLLOWS RULES" },
    text: { fr: "« Un veilleur de nuit affirme que les astres reviennent toujours au même endroit. Si même le ciel est prévisible, que reste-t-il au hasard ? »", en: "\"A night watchman claims the stars always return to the same place. If even the sky is predictable, what is left to chance?\"" },
    author: null
  },
  {
    id: "p2_knowledge_wheel",
    period: 2,
    conditionType: "savoir",
    title: { fr: "LA ROUE, FINALEMENT", en: "THE WHEEL, AT LAST" },
    text: { fr: "« Après des générations de refus, la cité adopte la roue. L'inventeur d'origine reçoit à titre posthume un tour en charrette. »", en: "\"After generations of refusal, the city adopts the wheel. The original inventor is posthumously awarded a ride in a cart.\"" },
    author: null
  },
  {
    id: "p2_knowledge_laws",
    period: 2,
    conditionType: "savoir",
    title: { fr: "DES LOIS GRAVÉES POUR TOUS", en: "LAWS ENGRAVED FOR ALL" },
    text: { fr: "« On inscrit les règles sur une grande pierre pour ne plus ignorer la loi. Beaucoup, ne sachant pas lire, ne savent toujours pas. »", en: "\"The rules are carved on a great stone so no one can plead ignorance of the law. Many, unable to read, still don't know it.\"" },
    author: null
  },

  // --- Jalons (Bonus) ---
  {
    id: "p2_bonus_start",
    period: 2,
    conditionType: "stage_start",
    title: { fr: "ON POSE LA PREMIÈRE PIERRE", en: "WE LAY THE FIRST STONE" },
    text: { fr: "« La communauté décide de ne plus bouger et de bâtir pour de bon. Les nomades d'hier se découvrent une passion : la propriété. »", en: "\"The community decides to settle for good and build to stay. Yesterday's nomads discover a passion: property.\"" },
    author: null
  },
  {
    id: "p2_bonus_stage6",
    period: 2,
    conditionType: "stage_6",
    title: { fr: "LA VILLE A MAINTENANT DES MURS", en: "THE TOWN NOW HAS WALLS" },
    text: { fr: "« On entoure la cité de remparts. Dehors, le danger ; dedans, les querelles de voisinage. »", en: "\"The city is ringed with ramparts. Outside, danger; inside, neighborly quarrels.\"" },
    author: null
  },
  {
    id: "p2_bonus_stage12",
    period: 2,
    conditionType: "stage_12",
    title: { fr: "UN ROI POUR LES GOUVERNER", en: "A KING TO RULE THEM" },
    text: { fr: "« Lassée de tout décider en assemblée, la cité se choisit un roi. Elle se demande déjà comment s'en débarrasser. »", en: "\"Weary of deciding everything in assembly, the city chooses itself a king. It already wonders how to be rid of him.\"" },
    author: null
  },
  {
    id: "p2_bonus_pop10k",
    period: 2,
    conditionType: "pop_10k",
    title: { fr: "LA CITÉ NE TIENT PLUS DANS SES MURS", en: "THE CITY NO LONGER FITS WITHIN ITS WALLS" },
    text: { fr: "« Trop d'habitants et pas assez de rues. On bâtit vers le haut, faute de pouvoir s'étendre. Les voisins du dessous protestent. »", en: "\"Too many inhabitants and not enough streets. We build upward, for want of room to spread out. The neighbors below protest.\"" },
    author: null
  },
  {
    id: "p2_bonus_peace1",
    period: 2,
    conditionType: "paix",
    title: { fr: "NI GUERRE NI FAMINE : ÉTRANGE", en: "NEITHER WAR NOR FAMINE: STRANGE" },
    text: { fr: "« Greniers pleins, frontières calmes. Les prêtres, méfiants, demandent davantage d'offrandes pour que ça dure. On ne sait jamais à qui on doit la chance. »", en: "\"Granaries full, borders calm. The priests, wary, ask for more offerings to make it last. You never know whom to thank for luck.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },
  {
    id: "p2_bonus_peace2",
    period: 2,
    conditionType: "paix",
    title: { fr: "UNE GÉNÉRATION SANS MALHEUR", en: "A GENERATION WITHOUT MISFORTUNE" },
    text: { fr: "« Les vieux n'ont pas connu de fléau depuis si longtemps qu'ils ne savent plus quoi raconter aux enfants. Ils inventent donc des monstres, par prudence. »", en: "\"The old folk have not known a scourge for so long that they no longer know what to tell the children. So they invent monsters, just in case.\"" },
    author: null
  },

];
