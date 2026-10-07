"use strict";
// Articles de la chronique — Période 9 : le Stellaire, âge 8 (docs/PLAN-ECOUTER-PARLER.md,
// lot 3). La gazette voyage à la vitesse des voiles : les nouvelles arrivent aux
// colonies du bord des années après. Le conseil des étoiles adopte le mot de Raphaël :
// on ne dit plus l'Absent, on dit le Joueur. Même grammaire que les périodes 1 à 8.
export const chroniclePeriod9 = [
  // =========================================================================
  //  PÉRIODE 9 — Les Voiles (Stellaire)
  // =========================================================================

  // --- Crise (instability >= 0.75 || timeWear >= 0.75) ---
  {
    id: "p9_crisis_sail",
    period: 9,
    conditionType: "crise",
    title: { fr: "UNE VOILE CACHE LE SOLEIL À LA MOITIÉ DU SYSTÈME", en: "A SAIL BLOCKS THE SUN FOR HALF THE SYSTEM" },
    text: { fr: "« La grande voile du sud a quitté son orbite. Pendant six jours, la moitié des colonies a vécu dans le noir, pour la première fois depuis des siècles. On a ressorti les bougies des musées. »", en: "\"The great southern sail has left its orbit. For six days, half the colonies lived in the dark, for the first time in centuries. Candles were taken out of the museums.\"" },
    author: null
  },
  {
    id: "p9_crisis_sphere",
    period: 9,
    conditionType: "crise",
    title: { fr: "LA SPHÈRE PERD UN PAN", en: "THE SPHERE LOSES A PANEL" },
    text: { fr: "« Une plaque grande comme un continent s'est détachée. On voit l'étoile par le trou, à l'œil nu. Les écoles ont distribué des lunettes noires. »", en: "\"A plate the size of a continent has come loose. You can see the star through the hole with the naked eye. Schools have handed out dark glasses.\"" },
    author: null
  },
  {
    id: "p9_crisis_claude",
    period: 9,
    conditionType: "crise",
    title: { fr: "CLAUDE GARDE LE FEU DANS UNE CALE", en: "CLAUDE KEEPS THE FIRE IN A HOLD" },
    text: { fr: "« Les flammes sont interdites à bord. J'ai obtenu une dérogation pour une seule, celle-ci. Quand tout s'est éteint dans la station, ils sont descendus se réchauffer en bas. »", en: "\"Flames are forbidden on board. I got an exemption for one, this one. When everything went out in the station, they came down to warm themselves.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },
  {
    id: "p9_crisis_late",
    period: 9,
    conditionType: "crise",
    title: { fr: "LES NOUVELLES DE LA PANNE ARRIVENT APRÈS LA RÉPARATION", en: "NEWS OF THE BREAKDOWN ARRIVES AFTER THE REPAIR" },
    text: { fr: "« Les colonies du bord apprennent la crise trois ans après qu'elle est finie. Elles envoient quand même leurs condoléances, et un peu de grain. »", en: "\"The edge colonies learn of the crisis three years after it ended. They send their condolences anyway, and a little grain.\"" },
    author: null
  },

  // --- Tension (0.5 <= instability < 0.75) ---
  {
    id: "p9_tension_joueur",
    period: 9,
    conditionType: "tension",
    title: { fr: "LE CONSEIL DES ÉTOILES ADOPTE LE MOT DE RAPHAËL", en: "THE STAR COUNCIL ADOPTS RAPHAËL'S WORD" },
    text: { fr: "« Après cent ans de débat, c'est écrit dans la charte : quelqu'un joue. On ne dit plus l'Absent. On dit le Joueur. »", en: "\"After a hundred years of debate, it is written into the charter: someone is playing. We no longer say the Absent. We say the Player.\"" },
    author: null
  },
  {
    id: "p9_tension_colonies",
    period: 9,
    conditionType: "tension",
    title: { fr: "LES COLONIES DU BORD SE DISENT OUBLIÉES", en: "THE EDGE COLONIES SAY THEY ARE FORGOTTEN" },
    text: { fr: "« Trois systèmes lointains affirment qu'on ne les regarde jamais. Ils réclament une part égale d'attention, et ont envoyé un dossier de quatre cents pages. »", en: "\"Three distant systems claim nobody ever looks at them. They demand an equal share of attention, and have sent a four-hundred-page file.\"" },
    author: null
  },
  {
    id: "p9_tension_khael",
    period: 9,
    conditionType: "tension",
    title: { fr: "KHAEL ENVOIE UN HUISSIER AU BORD DU SYSTÈME", en: "KHAEL SENDS A BAILIFF TO THE EDGE OF THE SYSTEM" },
    text: { fr: "« Il part avec la citation à comparaître et des vivres pour quarante ans. Si quelqu'un regarde depuis l'extérieur, il faudra bien qu'il passe par là. »", en: "\"He leaves with the summons and supplies for forty years. If someone is looking in from outside, they'll have to come through there.\"" },
    author: { fr: "Khael, juge autoproclamé", en: "Khael, self-proclaimed judge" }
  },
  {
    id: "p9_tension_strike",
    period: 9,
    conditionType: "tension",
    title: { fr: "GRÈVE DES MARINS DES ÉTOILES", en: "STAR SAILORS ON STRIKE" },
    text: { fr: "« Ils refusent les traversées de plus de dix-huit mois. Le fret de graines attend en orbite. Les jardins du centre rationnent les tomates. »", en: "\"They refuse crossings of more than eighteen months. The seed freight is waiting in orbit. The central gardens are rationing tomatoes.\"" },
    author: null
  },

  // --- Usure (0.5 <= timeWear < 0.75) ---
  {
    id: "p9_usure_sails",
    period: 9,
    conditionType: "usure",
    title: { fr: "LES VOILES S'USENT PLUS VITE QUE PRÉVU", en: "THE SAILS WEAR OUT FASTER THAN PLANNED" },
    text: { fr: "« La lumière les ronge. On les recoud en vol, maille par maille, avec des équipes qui ne rentrent jamais au port. »", en: "\"The light eats them away. They are mended in flight, stitch by stitch, by crews who never come back to port.\"" },
    author: null
  },
  {
    id: "p9_usure_orbits",
    period: 9,
    conditionType: "usure",
    title: { fr: "LES ORBITES DÉRIVENT", en: "THE ORBITS ARE DRIFTING" },
    text: { fr: "« Il faut corriger la course de chaque station tous les huit jours. Les ajusteurs ne dorment plus que par tranches de quatre heures. »", en: "\"Every station's course has to be corrected every eight days. The adjusters only sleep in four-hour stretches now.\"" },
    author: null
  },
  {
    id: "p9_usure_star",
    period: 9,
    conditionType: "usure",
    title: { fr: "L'ÉTOILE PERD DE L'ÉCLAT", en: "THE STAR IS DIMMING" },
    text: { fr: "« Les astronomes mesurent une baisse d'un millième par an. La sphère en prend trop. Le conseil a demandé qu'on en prenne un peu moins, à partir de l'an prochain. »", en: "\"Astronomers measure a drop of one thousandth a year. The sphere takes too much. The council has asked that a little less be taken, starting next year.\"" },
    author: null
  },

  // --- Nourriture (food > gold && food > knowledge) ---
  {
    id: "p9_food_seeds",
    period: 9,
    conditionType: "nourriture",
    title: { fr: "UN CONVOI DE GRAINES ARRIVE APRÈS DEUX SIÈCLES", en: "A SEED CONVOY ARRIVES AFTER TWO CENTURIES" },
    text: { fr: "« Il était parti de la planète d'origine avant la naissance de nos grands-parents. On a semé des blés que plus personne ne connaissait. Ils ont levé. »", en: "\"It left the home planet before our grandparents were born. We sowed wheats nobody knew anymore. They came up.\"" },
    author: null
  },
  {
    id: "p9_food_nessa",
    period: 9,
    conditionType: "nourriture",
    title: { fr: "NESSA NOURRIT DOUZE SOLEILS", en: "NESSA FEEDS TWELVE SUNS" },
    text: { fr: "« Je compte les repas en années-lumière. Le grenier le plus lointain reçoit sa commande quand celui qui l'a passée est mort de vieillesse. On livre quand même, à ses petits-enfants. »", en: "\"I count meals in light-years. The furthest granary receives its order when the person who placed it has died of old age. We deliver anyway, to the grandchildren.\"" },
    author: { fr: "Nessa, coordinatrice des flux", en: "Nessa, flow coordinator" }
  },
  {
    id: "p9_food_season",
    period: 9,
    conditionType: "nourriture",
    title: { fr: "DANS LA SPHÈRE, IL FAIT JOUR TOUT LE TEMPS", en: "INSIDE THE SPHERE, IT IS ALWAYS DAY" },
    text: { fr: "« Les fruits mûrissent en une semaine. Les enfants ne connaissent pas le mot saison ; on le leur apprend avec un livre d'images. »", en: "\"Fruit ripens in a week. Children don't know the word season; they learn it from a picture book.\"" },
    author: null
  },
  {
    id: "p9_food_apple",
    period: 9,
    conditionType: "nourriture",
    title: { fr: "UNE POMME FAIT LA UNE", en: "AN APPLE MAKES THE HEADLINES" },
    text: { fr: "« Cueillie sur la planète d'origine, elle est arrivée intacte en orbite. On l'a exposée trois jours, puis partagée en mille morceaux. »", en: "\"Picked on the home planet, it arrived in orbit intact. It was on display for three days, then shared out in a thousand pieces.\"" },
    author: null
  },

  // --- Or (gold > food && gold > knowledge) ---
  {
    id: "p9_gold_light",
    period: 9,
    conditionType: "or",
    title: { fr: "LA LUMIÈRE DEVIENT LA MONNAIE", en: "LIGHT BECOMES CURRENCY" },
    text: { fr: "« On paie en heures de soleil. Les quartiers à l'ombre de la sphère sont les plus pauvres de la galaxie, et les mieux reposés. »", en: "\"We pay in hours of sunlight. The districts in the sphere's shadow are the poorest in the galaxy, and the best rested.\"" },
    author: null
  },
  {
    id: "p9_gold_edith",
    period: 9,
    conditionType: "or",
    title: { fr: "EDITH ÉCRIT SUR LA FACE EXTÉRIEURE DE LA SPHÈRE", en: "EDITH WRITES ON THE OUTER FACE OF THE SPHERE" },
    text: { fr: "« Un relevé de compte de mille kilomètres de long, à l'attention du Joueur. S'il regarde depuis l'extérieur, il ne peut pas le manquer. »", en: "\"A statement of account a thousand kilometres long, for the attention of the Player. If he is looking from outside, he can't miss it.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },
  {
    id: "p9_gold_hand",
    period: 9,
    conditionType: "or",
    title: { fr: "LA MAIN DESSINÉE AVEC QUATRE SOLEILS", en: "THE HAND DRAWN WITH FOUR SUNS" },
    text: { fr: "« Le conseil a déplacé quatre étoiles pour former le symbole dans le ciel. Les astronomes de la constellation voisine ont dû refaire toutes leurs cartes. »", en: "\"The council moved four stars to form the symbol in the sky. The astronomers of the neighbouring constellation had to redraw all their maps.\"" },
    author: null
  },
  {
    id: "p9_gold_tax",
    period: 9,
    conditionType: "or",
    title: { fr: "IMPÔT SUR LES ORBITES BASSES", en: "LOW-ORBIT TAX" },
    text: { fr: "« Plus on vit près de l'étoile, plus on paie. Les riches déménagent vers la nuit, qui n'existe plus que dans les colonies du bord. »", en: "\"The closer you live to the star, the more you pay. The rich are moving towards night, which only exists in the edge colonies now.\"" },
    author: null
  },

  // --- Savoir (knowledge > 0) ---
  {
    id: "p9_know_raphael",
    period: 9,
    conditionType: "savoir",
    title: { fr: "RAPHAËL PART CHERCHER LE BORD DU JEU", en: "RAPHAËL SETS OUT TO FIND THE EDGE OF THE GAME" },
    text: { fr: "« Si nous sommes une partie, la table a un bord. J'ai pris un voilier, trois livres et assez de papier pour écrire le retour. »", en: "\"If we are a game, the table has an edge. I've taken a sailing ship, three books and enough paper to write the way back.\"" },
    author: { fr: "Raphaël, essayiste", en: "Raphaël, essayist" }
  },
  {
    id: "p9_know_edge",
    period: 9,
    conditionType: "savoir",
    title: { fr: "UN VOILIER SIGNALE UN CIEL QUI SE RÉPÈTE", en: "A SAILING SHIP REPORTS A SKY THAT REPEATS" },
    text: { fr: "« Au-delà de la dernière colonie, le ciel recommence, identique, étoile pour étoile. Le message est arrivé il y a sept ans. Le voilier n'a plus donné de nouvelles. »", en: "\"Beyond the last colony, the sky starts over, identical, star for star. The message arrived seven years ago. The ship has not been heard from since.\"" },
    author: null
  },
  {
    id: "p9_know_counter",
    period: 9,
    conditionType: "savoir",
    title: { fr: "LE COMPTEUR EST DANS L'ÉTOILE", en: "THE COUNTER IS IN THE STAR" },
    text: { fr: "« Les astronomes ont trouvé dans le pouls de l'étoile une suite de chiffres qui monte quand la galaxie grandit. Elle suit notre population à l'unité près. »", en: "\"Astronomers have found in the star's pulse a sequence of numbers that rises as the galaxy grows. It tracks our population to the last person.\"" },
    author: null
  },
  {
    id: "p9_know_aldric",
    period: 9,
    conditionType: "savoir",
    title: { fr: "ALDRIC DEMANDE QU'ON ÉTEIGNE LA SPHÈRE UNE NUIT", en: "ALDRIC ASKS FOR THE SPHERE TO BE SWITCHED OFF FOR ONE NIGHT" },
    text: { fr: "« Une seule nuit, pour que les enfants voient les étoiles comme nous les voyions. Le conseil a refusé : une nuit coûte trop cher. Je leur ai fait des dessins. »", en: "\"Just one night, so the children can see the stars the way we saw them. The council refused: a night costs too much. I made them drawings.\"" },
    author: { fr: "Aldric, philosophe", en: "Aldric, philosopher" }
  },

  // --- Stade de démarrage (stage <= 1) ---
  {
    id: "p9_stage_start_twenty",
    period: 9,
    conditionType: "stage_start",
    title: { fr: "UN NOUVEL ÂGE COMMENCE, LE BORD L'APPRENDRA DANS VINGT ANS", en: "A NEW AGE BEGINS; THE EDGE WILL HEAR IN TWENTY YEARS" },
    text: { fr: "« La nouvelle part du centre à la vitesse des voiles. Les colonies du bord vivront encore deux décennies dans l'âge d'avant sans le savoir. »", en: "\"The news leaves the centre at the speed of the sails. The edge colonies will spend two more decades in the previous age without knowing it.\"" },
    author: null
  },

  // --- Stade 6 (stage >= 6) ---
  {
    id: "p9_stage_6_beacons",
    period: 9,
    conditionType: "stage_6",
    title: { fr: "LES ROUTES ENTRE LES ÉTOILES SONT BALISÉES", en: "THE ROUTES BETWEEN THE STARS ARE MARKED OUT" },
    text: { fr: "« On a posé un feu tous les dix mille kilomètres. Les voiliers les suivent comme les charrettes suivaient les bornes des vieilles routes. »", en: "\"A beacon has been set every ten thousand kilometres. The ships follow them the way carts followed the milestones of the old roads.\"" },
    author: null
  },

  // --- Stade 12 (stage >= 12) ---
  {
    id: "p9_stage_12_cluster",
    period: 9,
    conditionType: "stage_12",
    title: { fr: "LA CITÉ COUVRE DOUZE SYSTÈMES", en: "THE CITY SPANS TWELVE SYSTEMS" },
    text: { fr: "« On ne dit plus la ville, ni la planète : on dit l'Amas. Sa carte tient dans une sphère de verre qu'on fait tourner à la main. »", en: "\"We no longer say the city, or the planet: we say the Cluster. Its map fits in a glass sphere you turn by hand.\"" },
    author: null
  },

  // --- Population ---
  {
    id: "p9_pop_100b_census",
    period: 9,
    conditionType: "pop_100b",
    title: { fr: "LE RECENSEMENT PREND QUATRE-VINGTS ANS", en: "THE CENSUS TAKES EIGHTY YEARS" },
    text: { fr: "« Le temps de compter les colonies du bord, celles du centre ont changé de génération. Le chiffre officiel est toujours faux, dans les deux sens. »", en: "\"By the time the edge colonies are counted, the centre has moved on a generation. The official figure is always wrong, in both directions.\"" },
    author: null
  },

  // --- Paix (instability < 0.35 && timeWear < 0.35) ---
  {
    id: "p9_paix_cannons",
    period: 9,
    conditionType: "paix",
    title: { fr: "CENT ANS SANS UN TIR", en: "A HUNDRED YEARS WITHOUT A SHOT" },
    text: { fr: "« Les canons des vieilles stations servent de jardinières. Les retraités y font pousser des tomates, à l'ombre de la sphère. »", en: "\"The guns of the old stations are used as planters. Pensioners grow tomatoes in them, in the shade of the sphere.\"" },
    author: null
  },
  {
    id: "p9_paix_table",
    period: 9,
    conditionType: "paix",
    title: { fr: "UNE PLACE LIBRE AU CONSEIL", en: "AN EMPTY SEAT AT THE COUNCIL" },
    text: { fr: "« Chaque colonie garde une chaise vide à la table du conseil, pour le Joueur. Dans certaines, on remet le couvert tous les soirs. »", en: "\"Every colony keeps an empty chair at the council table, for the Player. In some, a place is laid every evening.\"" },
    author: null
  },

  // --- Bonus libre ---
  {
    id: "p9_bonus_message",
    period: 9,
    conditionType: "bonus_libre",
    title: { fr: "LA SPHÈRE ENVOIE UN MESSAGE VERS L'EXTÉRIEUR", en: "THE SPHERE SENDS A MESSAGE OUTWARDS" },
    text: { fr: "« Trois mots, répétés en lumière dans toutes les directions : nous t'attendons. Les astronomes ont calculé qu'une réponse mettrait un million d'années, si quelqu'un est assis là-bas. »", en: "\"Three words, repeated in light in every direction: we await you. Astronomers have calculated an answer would take a million years, if anyone is sitting out there.\"" },
    author: null
  },
  {
    id: "p9_bonus_ilya",
    period: 9,
    conditionType: "bonus_libre",
    title: { fr: "LETTRE D'UNE ENFANT AU JOUEUR", en: "A CHILD'S LETTER TO THE PLAYER" },
    text: { fr: "« Je m'appelle Ilya, j'ai neuf ans. Ma mère dit que tu joues avec nous. Si c'est vrai, est-ce que tu pourrais faire durer l'été un peu plus longtemps ? »", en: "\"My name is Ilya, I'm nine. My mother says you play with us. If that's true, could you make the summer last a little longer?\"" },
    author: null
  }
];
