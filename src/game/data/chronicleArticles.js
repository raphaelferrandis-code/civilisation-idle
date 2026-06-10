"use strict";

export const chronicleArticles = [
  // =========================================================================
  //  PÉRIODE 1 — Tradition Orale
  // =========================================================================

  // --- Crise (instability >= 1 || timeWear >= 1) ---
  {
    id: "p1_crisis_fire",
    period: 1,
    conditionType: "crise",
    title: "LES FEUX FAIBLISSENT, LE FROID REVIENT",
    text: "« Les braises pâlissent et nul ne sait pourquoi. Les anciens conseillent de se serrer fort et d'espérer le matin. Comme d'habituuude. »",
    author: "Claude, le gardien du feu"
  },
  {
    id: "p1_crisis_hunter",
    period: 1,
    conditionType: "crise",
    title: "LA DIFFERENCE ENTRE UN BON CHASSEUR",
    text: "« Trois jours que les chasseurs rentrent les mains vides. Aucun volontaire pour goûter en premier. »",
    author: null
  },
  {
    id: "p1_crisis_split",
    period: 1,
    conditionType: "crise",
    title: "LE CLAN PARLE DE SE SÉPARER",
    text: "« Trop de bouches, pas assez de nourriture. Certains veulent partir vers l'ouest. Les anciens rappellent qu'à l'ouest, c'est pareil, mais plus loin. »",
    author: null
  },
  {
    id: "p1_crisis_forget_fire",
    period: 1,
    conditionType: "crise",
    title: "ON A OUBLIÉ COMMENT FAIRE DU FEU",
    text: "« Le dernier qui savait s'est endormi pour de bon. On frotte des bâtons en attendant que la mémoire revienne mais il fait froid pendant ce temps. »",
    author: null
  },

  // --- Tension élevée (instability >= 0.75) ---
  {
    id: "p1_tension_tents",
    period: 1,
    conditionType: "tension",
    title: "BAGARRE POUR LA MEILLEURE TENTE",
    text: "« Deux familles revendiquent la même tente, sous prétexte qu'ils l'ont vu en premier. »",
    author: null
  },
  {
    id: "p1_tension_reserve",
    period: 1,
    conditionType: "tension",
    title: "QUI A MANGÉ DANS LA RESERVE?",
    text: "« Une ration a disparu cette nuit. Les soupçons pèsent sur tout le monde, surtout sur celui qui n'a plus faim. »",
    author: "Claude, le gardien du feu"
  },
  {
    id: "p1_tension_chief",
    period: 1,
    conditionType: "tension",
    title: "LE CHEF EST CONTESTÉ",
    text: "« Un jeune costaud estime qu'il guiderait mieux le clan. Le vieux chef propose de régler ça à la prochaine famine. »",
    author: null
  },
  {
    id: "p1_tension_crowd",
    period: 1,
    conditionType: "tension",
    title: "TROP DE MONDE AUTOUR DU FEU",
    text: "« Quelqu'un a suggéré un deuxième feu. Idée révolutionnaire, mais accueillie avec méfiance. »",
    author: null
  },

  // --- Usure élevée (timeWear >= 0.75) ---
  {
    id: "p1_wear_repos",
    period: 1,
    conditionType: "usure",
    title: "ON VEUT DU REPOS",
    text: "« Les silex s'émoussent plus vite qu'on ne les taille. Le tailleur réclame du repos ; on lui répond qu'il se reposera plus tard, comme tout le monde. »",
    author: "Garin, tailleur de silex"
  },
  {
    id: "p1_wear_tired",
    period: 1,
    conditionType: "usure",
    title: "ON EST FATIGUÉ",
    text: "« Cueillir, chasser, recommencer : certains se demandent si ça vaut le coup : on leur a conseillé de moins réfléchir. »",
    author: "Claude, le gardien du feu"
  },
  {
    id: "p1_wear_resemble",
    period: 1,
    conditionType: "usure",
    title: "LES JOURS SE RESSEMBLENT TROP",
    text: "« Un membre du clan jure que cette lune est exactement la même que la dernière. On a mis ça sur le compte de la fatigue. »",
    author: null
  },

  // --- Nourriture dominante ---
  {
    id: "p1_food_surplus",
    period: 1,
    conditionType: "nourriture",
    title: "TROP DE VIANDE : UNE SOLUTION?",
    text: "« La chasse a été si bonne qu'on ne sait plus où poser le surplus. Un gars a proposé d'en garder pour demain. On l'a regardé comme s'il avait inventé la magie. »",
    author: "Renaud, habitant"
  },
  {
    id: "p1_food_berries",
    period: 1,
    conditionType: "nourriture",
    title: "LES BAIES JUSQU'À PLUS SOIF",
    text: "« Les cueilleurs sont trop efficaces, les enfants mangent trop de baies qu'ils en sont violets. »",
    author: null
  },
  {
    id: "p1_food_tomorrow",
    period: 1,
    conditionType: "nourriture",
    title: "LE CONCEPT DE 'DEMAIN'",
    text: "« Pour la première fois, il reste à manger après le repas. La communauté peut penser à demain »",
    author: null
  },
  {
    id: "p1_food_river",
    period: 1,
    conditionType: "nourriture",
    title: "LA RIVIÈRE DÉBORDE DE POISSONS",
    text: "« Il suffit de tendre la main. Certains trouvent ça trop facile et se méfient. Les autres mangent. »",
    author: "Nessa, chasseuse"
  },

  // --- Or dominant ---
  {
    id: "p1_gold_stones",
    period: 1,
    conditionType: "or",
    title: "LA FOLIE DES CAILLOUX BRILLANTS",
    text: "« On échange trois jours de cueillette contre une pierre qui brille mais ne se mange pas. Personne ne comprend mais tout le monde en veut. »",
    author: "une habitante perplexe"
  },
  {
    id: "p1_gold_shell",
    period: 1,
    conditionType: "or",
    title: "LE COQUILLAGE VAUT-IL UN REPAS ?",
    text: "« Le troc d'une jolie coquille contre de la viande ouvre un grand débat : peut-on manger du joli ? »",
    author: null
  },
  {
    id: "p1_gold_hoarder",
    period: 1,
    conditionType: "or",
    title: "CELUI QUI A LE PLUS DE PIERRES",
    text: "« Un habitant a amassé plus de cailloux brillants que tout le monde. Depuis, il dort mal de peur qu'on les lui prenne »",
    author: null
  },
  {
    id: "p1_gold_tombs",
    period: 1,
    conditionType: "or",
    title: "ON ENTERRE LES MORTS AVEC LEURS TRÉSORS",
    text: "« Nouvelle coutume : une belle pierre dans la tombe. Ceux qui n'en ont pas trouvent ça dommage. »",
    author: null
  },

  // --- Savoir actif ---
  {
    id: "p1_knowledge_numbers",
    period: 1,
    conditionType: "savoir",
    title: "ON A COMPTÉ!",
    text: "« Un habitant jure qu'après dix, il existe encore des nombres. On reste prudent : on n'a jamais eu besoin d'autant. »",
    author: "Edith, comptable"
  },
  {
    id: "p1_knowledge_drawings",
    period: 1,
    conditionType: "savoir",
    title: "DES DESSINS SUR LES MURS",
    text: "« Quelqu'un a peint un bison sur la roche et a presque provoqué une guerre civile; A quoi bon peindre un bison qu'on ne peut pas manger. »",
    author: null
  },
  {
    id: "p1_knowledge_stones",
    period: 1,
    conditionType: "savoir",
    title: "LE FEU PEUT VENIR DES PIERRES",
    text: "« En frappant deux silex, des étincelles naissent. La nouvelle bouleverse Claude le gardien du feu, soudain moins indispensable. »",
    author: "Garin, tailleur de silex"
  },
  {
    id: "p1_knowledge_wheel",
    period: 1,
    conditionType: "savoir",
    title: "LA ROUE, PEUT-ÊTRE ?",
    text: "« Une habitante a eu l'idée d'un transporteur roulant. Le conseil note l'idée mais préfère faire porter les charges à dos d'homme, comme des gens sérieux. »",
    author: null
  },

  // --- Jalons (Bonus) ---
  {
    id: "p1_bonus_start",
    period: 1,
    conditionType: "stage_start",
    title: "UNE NOUVELLE COMMUNAUTÉ",
    text: "« Des inconnus se sont assis autour du même feu sans se battre. Les anciens parlent déjà d'âge d'or. »",
    author: null
  },
  {
    id: "p1_bonus_stage6",
    period: 1,
    conditionType: "stage_6",
    title: "LE CAMPEMENT DEVIENT UN VRAI VILLAGE",
    text: "« Plus de huttes que de doigts pour les compter. Certains s'émeuvent ; d'autres pensent que c'était quand même mieux avant. »",
    author: null
  },
  {
    id: "p1_bonus_stage12",
    period: 1,
    conditionType: "stage_12",
    title: "ET SI ON RESTAIT ICI POUR TOUJOURS ?",
    text: "« Ne plus suivre les troupeaux fait son chemin. Semer, attendre, récolter : pari risqué, mais les jambes sont fatiguées de marcher. »",
    author: null
  },
  {
    id: "p1_bonus_pop10k",
    period: 1,
    conditionType: "pop_10k",
    title: "DIX MILLE BOUCHES AUTOUR DU FEU",
    text: "« Le clan est si grand qu'on ne se connait plus tous. »",
    author: null
  },
  {
    id: "p1_bonus_peace1",
    period: 1,
    conditionType: "paix",
    title: "RIEN À SIGNALER, ET C'EST TRÈS BIEN COMME ÇA",
    text: "« Les feux brûlent, les ventres sont pleins, (presque) personne n'est mort ce mois. On s'excuse pour le manque de nouvelles palpitantes. »",
    author: "Claude, le gardien du feu"
  },
  {
    id: "p1_bonus_peace2",
    period: 1,
    conditionType: "paix",
    title: "UNE SAISON SANS UN SEUL MALHEUR",
    text: "« Pas de famine, pas de bête féroce, pas de querelle. Les anciens, méfiants, cherchent ce qui cloche. Ils ne trouvent rien, et ça les inquiète. »",
    author: null
  },

  // =========================================================================
  //  PÉRIODE 2 — Argile Gravée
  // =========================================================================

  // --- Crise (instability >= 1 || timeWear >= 1) ---
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

  // --- Tension élevée (instability >= 0.75) ---
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

  // --- Usure élevée (timeWear >= 0.75) ---
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

  // =========================================================================
  //  PÉRIODE 3 — Manuscrit
  // =========================================================================

  // --- Crise (instability >= 1 || timeWear >= 1) ---
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

  // --- Tension élevée (instability >= 0.75) ---
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

  // --- Usure élevée (timeWear >= 0.75) ---
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
  }
];
