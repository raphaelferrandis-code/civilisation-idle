"use strict";
// Articles de la chronique — Période 8 : la Noosphère, âge 7 (docs/PLAN-ECOUTER-PARLER.md,
// lot 3). La gazette n'est plus imprimée : ce sont les dépêches du chœur, la pensée
// commune de la planète. On y apprend qu'il manque une pensée au chœur (l'Absent).
// Même grammaire que les périodes 1 à 7 ; la plume de la règle 7 du plan : des faits,
// des noms, des chiffres, l'ironie qui vient de la situation.
export const chroniclePeriod8 = [
  // =========================================================================
  //  PÉRIODE 8 — Le Chœur (Noosphère)
  // =========================================================================

  // --- Crise (instability >= 0.75 || timeWear >= 0.75) ---
  {
    id: "p8_crisis_desync",
    period: 8,
    conditionType: "crise",
    title: { fr: "LE CHŒUR SE DÉSYNCHRONISE", en: "THE CHORUS FALLS OUT OF SYNC" },
    text: { fr: "« Pendant onze minutes, trois continents ont pensé des choses différentes. On a coupé les nœuds de l'est pour que les autres puissent s'entendre. »", en: "\"For eleven minutes, three continents thought different things. The eastern nodes were cut so the rest could hear each other.\"" },
    author: null
  },
  {
    id: "p8_crisis_membrane",
    period: 8,
    conditionType: "crise",
    title: { fr: "LA MEMBRANE SE DÉCHIRE AU-DESSUS DU PÔLE", en: "THE MEMBRANE TEARS ABOVE THE POLE" },
    text: { fr: "« Les veilleurs signalent une brèche large comme une province. Les gens qui vivent dessous ont recommencé à se parler avec la bouche. »", en: "\"The watchers report a breach as wide as a province. The people living under it have started talking with their mouths again.\"" },
    author: null
  },
  {
    id: "p8_crisis_claude",
    period: 8,
    conditionType: "crise",
    title: { fr: "CLAUDE GARDE UN FEU QUE PERSONNE NE PENSE", en: "CLAUDE KEEPS A FIRE NOBODY IS THINKING" },
    text: { fr: "« Le chœur s'est tu cette nuit. Mon feu n'était branché à rien, alors il a brûlé comme d'habitude. Des gens sont venus s'asseoir autour sans savoir pourquoi. »", en: "\"The chorus went silent last night. My fire wasn't connected to anything, so it burned as usual. People came and sat round it without knowing why.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },
  {
    id: "p8_crisis_memory",
    period: 8,
    conditionType: "crise",
    title: { fr: "LES TOURS-MÉMOIRE PERDENT UNE ANNÉE", en: "THE MEMORY TOWERS LOSE A YEAR" },
    text: { fr: "« Une année entière a disparu des souvenirs communs. On se rappelle l'hiver d'avant et l'été d'après. Personne ne sait ce qu'il a fait entre les deux. »", en: "\"A whole year has vanished from the shared memory. People remember the winter before and the summer after. Nobody knows what they did in between.\"" },
    author: null
  },

  // --- Tension (0.5 <= instability < 0.75) ---
  {
    id: "p8_tension_absent",
    period: 8,
    conditionType: "tension",
    title: { fr: "IL MANQUE UNE PENSÉE AU CHŒUR", en: "THE CHORUS IS ONE THOUGHT SHORT" },
    text: { fr: "« J'ai compté trois fois. Huit milliards d'esprits dans le chœur, et une attention de plus qui n'en fait pas partie. Je l'ai inscrite au registre sous le nom d'Absent. »", en: "\"I counted three times. Eight billion minds in the chorus, and one more attention that isn't part of it. I've entered it in the register as the Absent.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },
  {
    id: "p8_tension_papers",
    period: 8,
    conditionType: "tension",
    title: { fr: "LES DÉBRANCHÉS RÉCLAMENT DES PAPIERS", en: "THE UNPLUGGED DEMAND PAPERS" },
    text: { fr: "« Ceux qui ont quitté le chœur n'existent plus pour l'administration. Il faut remplir un formulaire, et le formulaire ne se remplit qu'en pensée. »", en: "\"Those who left the chorus no longer exist for the administration. There's a form to fill in, and the form can only be filled in by thought.\"" },
    author: null
  },
  {
    id: "p8_tension_aldric",
    period: 8,
    conditionType: "tension",
    title: { fr: "ALDRIC RESTE DÉBRANCHÉ", en: "ALDRIC STAYS UNPLUGGED" },
    text: { fr: "« J'écris sur du papier que je fais venir de loin, et je le donne aux rares qui savent encore lire. Ils sont quarante dans ma rue. Ils viennent le soir, avec des chaises. »", en: "\"I write on paper I have brought from far away, and I give it to the few who can still read. There are forty of them in my street. They come in the evening, with chairs.\"" },
    author: { fr: "Aldric, philosophe", en: "Aldric, philosopher" }
  },
  {
    id: "p8_tension_khael",
    period: 8,
    conditionType: "tension",
    title: { fr: "KHAEL CITE L'ABSENT À COMPARAÎTRE", en: "KHAEL SUMMONS THE ABSENT" },
    text: { fr: "« La citation a été pensée en même temps par huit milliards de personnes. Si l'Absent ne l'a pas reçue, c'est qu'il ne veut pas la recevoir. »", en: "\"The summons was thought at the same moment by eight billion people. If the Absent didn't receive it, it's because he doesn't want to.\"" },
    author: { fr: "Khael, juge autoproclamé", en: "Khael, self-proclaimed judge" }
  },

  // --- Usure (0.5 <= timeWear < 0.75) ---
  {
    id: "p8_usure_towers",
    period: 8,
    conditionType: "usure",
    title: { fr: "LES TOURS-MÉMOIRE SONT PLEINES", en: "THE MEMORY TOWERS ARE FULL" },
    text: { fr: "« On efface les souvenirs les moins visités pour faire de la place. Les mariages d'il y a deux siècles partent les premiers. »", en: "\"The least-visited memories are being erased to make room. Weddings from two centuries ago go first.\"" },
    author: null
  },
  {
    id: "p8_usure_nodes",
    period: 8,
    conditionType: "usure",
    title: { fr: "UN NŒUD SUR DIX GRÉSILLE", en: "ONE NODE IN TEN CRACKLES" },
    text: { fr: "« Les techniciens remplacent les nœuds de la rue haute pour la troisième fois de l'année. En attendant, les habitants entendent les pensées de leurs voisins à moitié. »", en: "\"Technicians are replacing the high street nodes for the third time this year. Meanwhile, residents hear half of their neighbours' thoughts.\"" },
    author: null
  },
  {
    id: "p8_usure_watchers",
    period: 8,
    conditionType: "usure",
    title: { fr: "LES VEILLEURS DE LA MEMBRANE TRAVAILLENT EN TRIPLE ÉQUIPE", en: "MEMBRANE WATCHERS ON TRIPLE SHIFTS" },
    text: { fr: "« La membrane s'use plus vite que prévu. Le bureau des veilleurs embauche jusqu'aux retraités, et leur donne les nuits. »", en: "\"The membrane is wearing out faster than planned. The watchers' office is hiring even pensioners, and giving them the nights.\"" },
    author: null
  },

  // --- Nourriture (food > gold && food > knowledge) ---
  {
    id: "p8_food_roofs",
    period: 8,
    conditionType: "nourriture",
    title: { fr: "LES JARDINS DES TOITS NOURRISSENT LA MOITIÉ DU MONDE", en: "ROOF GARDENS FEED HALF THE WORLD" },
    text: { fr: "« On cultive sur chaque toit, du blé jusqu'aux algues. Les anciens champs sont rendus à la forêt. Les cartes ne les marquent plus. »", en: "\"Every roof is farmed, from wheat to seaweed. The old fields are given back to the forest. The maps no longer show them.\"" },
    author: null
  },
  {
    id: "p8_food_nessa",
    period: 8,
    conditionType: "nourriture",
    title: { fr: "NESSA PARTAGE LES RÉCOLTES PAR LA PENSÉE", en: "NESSA SHARES THE HARVEST BY THOUGHT" },
    text: { fr: "« Je n'ai plus de camions. Quand un quartier a faim, le chœur le sait avant lui, et le grain part avant qu'on le demande. »", en: "\"I don't have trucks anymore. When a district is hungry, the chorus knows before it does, and the grain leaves before anyone asks.\"" },
    author: { fr: "Nessa, coordinatrice des flux", en: "Nessa, flow coordinator" }
  },
  {
    id: "p8_food_soup",
    period: 8,
    conditionType: "nourriture",
    title: { fr: "TOUTE LA PLANÈTE CONNAÎT LE GOÛT DE LA SOUPE DE GARIN", en: "THE WHOLE PLANET KNOWS THE TASTE OF GARIN'S SOUP" },
    text: { fr: "« Depuis que les repas se pensent en commun, sa soupe aux poireaux est la plus goûtée du chœur. Garin refuse toujours de donner la recette. »", en: "\"Since meals have been thought in common, his leek soup is the most tasted in the chorus. Garin still refuses to give out the recipe.\"" },
    author: null
  },
  {
    id: "p8_food_hunger",
    period: 8,
    conditionType: "nourriture",
    title: { fr: "LA FAIM N'EST PLUS QU'UN SOUVENIR", en: "HUNGER IS ONLY A MEMORY NOW" },
    text: { fr: "« Dans les tours-mémoire, on peut encore ressentir la faim de l'âge de la Fonte. Les écoles y emmènent les enfants une fois par an, et les ramènent goûter. »", en: "\"In the memory towers you can still feel the hunger of the Iron Age. Schools take the children there once a year, then bring them back for a snack.\"" },
    author: null
  },

  // --- Or (gold > food && gold > knowledge) ---
  {
    id: "p8_gold_hours",
    period: 8,
    conditionType: "or",
    title: { fr: "ON PAIE EN HEURES DE CHŒUR", en: "PAYMENT IN CHORUS HOURS" },
    text: { fr: "« La monnaie a disparu. Les plus riches sont ceux qui peuvent penser longtemps sans se fatiguer. Les insomniaques ont fait fortune. »", en: "\"Money has gone. The richest are those who can think for a long time without tiring. Insomniacs have made a fortune.\"" },
    author: null
  },
  {
    id: "p8_gold_hand",
    period: 8,
    conditionType: "or",
    title: { fr: "LA MAIN QUITTE LES PIÈCES", en: "THE HAND LEAVES THE COINS" },
    text: { fr: "« Il n'y a plus de pièces où la graver. On l'a gardée sur les portes des tours-mémoire, par habitude. Les enfants la touchent en entrant. »", en: "\"There are no coins left to engrave it on. It's been kept on the doors of the memory towers, out of habit. Children touch it on the way in.\"" },
    author: null
  },
  {
    id: "p8_gold_edith",
    period: 8,
    conditionType: "or",
    title: { fr: "EDITH OUVRE UN COMPTE AU NOM DE L'ABSENT", en: "EDITH OPENS AN ACCOUNT IN THE ABSENT'S NAME" },
    text: { fr: "« Il ne dépose rien et ne retire rien. Mais chaque fois qu'une cité tombe quelque part dans les archives, le solde change. »", en: "\"He deposits nothing and withdraws nothing. But every time a city falls somewhere in the archives, the balance changes.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },
  {
    id: "p8_gold_auction",
    period: 8,
    conditionType: "or",
    title: { fr: "UN SOUVENIR VENDU QUATRE MILLE HEURES", en: "A MEMORY SOLD FOR FOUR THOUSAND HOURS" },
    text: { fr: "« Un premier baiser de l'âge de la Couronne a été adjugé hier. L'acheteur a demandé à rester anonyme ; dans le chœur, tout le monde sait qui c'est. »", en: "\"A first kiss from the Age of the Crown went under the hammer yesterday. The buyer asked to remain anonymous; in the chorus, everyone knows who it is.\"" },
    author: null
  },

  // --- Savoir (knowledge > 0) ---
  {
    id: "p8_know_raphael",
    period: 8,
    conditionType: "savoir",
    title: { fr: "RAPHAËL PROPOSE QUE TOUT LE MONDE S'ARRÊTE DE PENSER À MIDI", en: "RAPHAËL PROPOSES EVERYONE STOP THINKING AT NOON" },
    text: { fr: "« Une minute, ensemble. Si quelqu'un joue, il remarquera peut-être que la partie s'arrête. Je fournis les montres à ceux qui n'en ont plus. »", en: "\"One minute, together. If someone is playing, they might notice the game stop. I'm providing watches for those who no longer have one.\"" },
    author: { fr: "Raphaël, essayiste", en: "Raphaël, essayist" }
  },
  {
    id: "p8_know_minute",
    period: 8,
    conditionType: "savoir",
    title: { fr: "LA MINUTE DE RAPHAËL A EU LIEU", en: "RAPHAËL'S MINUTE HAS TAKEN PLACE" },
    text: { fr: "« Huit milliards de personnes se sont tues à midi. Il ne s'est rien passé, sinon qu'à midi et une minute, le vent s'est levé sur toute la côte. »", en: "\"Eight billion people fell silent at noon. Nothing happened, except that at one minute past, the wind got up along the whole coast.\"" },
    author: null
  },
  {
    id: "p8_know_cities",
    period: 8,
    conditionType: "savoir",
    title: { fr: "LES TOURS-MÉMOIRE GARDENT DES CITÉS QUE PERSONNE N'A CONNUES", en: "THE MEMORY TOWERS HOLD CITIES NOBODY HAS KNOWN" },
    text: { fr: "« On y trouve des rues, des noms et des fêtes dont personne ici ne se souvient. Les archivistes disent que ce sont les villes d'avant, et qu'il y en a beaucoup. »", en: "\"There are streets, names and festivals in them that nobody here remembers. The archivists say these are the cities from before, and that there are many.\"" },
    author: null
  },
  {
    id: "p8_know_number",
    period: 8,
    conditionType: "savoir",
    title: { fr: "NOTRE CITÉ A UN NUMÉRO", en: "OUR CITY HAS A NUMBER" },
    text: { fr: "« Les enfants apprennent que la nôtre n'est pas la première bâtie à cet endroit. Les professeurs connaissent le numéro. Ils refusent de le dire avant la dernière année. »", en: "\"Children learn that ours is not the first city built on this spot. The teachers know the number. They refuse to say it before the final year.\"" },
    author: null
  },

  // --- Stade de démarrage (stage <= 1) ---
  {
    id: "p8_stage_start_heads",
    period: 8,
    conditionType: "stage_start",
    title: { fr: "UN NOUVEL ÂGE COMMENCE DANS TOUTES LES TÊTES À LA FOIS", en: "A NEW AGE BEGINS IN EVERY HEAD AT ONCE" },
    text: { fr: "« Personne n'a eu besoin de l'annoncer. Ce matin, au réveil, huit milliards de personnes savaient qu'on avait changé d'âge. »", en: "\"Nobody had to announce it. This morning, on waking, eight billion people knew the age had changed.\"" },
    author: null
  },

  // --- Stade 6 (stage >= 6) ---
  {
    id: "p8_stage_6_walk",
    period: 8,
    conditionType: "stage_6",
    title: { fr: "LES RUES NE SERVENT PLUS QU'À SE PROMENER", en: "THE STREETS ARE ONLY FOR WALKING NOW" },
    text: { fr: "« On ne se déplace plus pour se parler. Les rues sont restées, pleines de gens qui marchent pour le plaisir de marcher. Les cordonniers n'ont jamais eu autant de travail. »", en: "\"Nobody travels to talk anymore. The streets have stayed, full of people walking for the pleasure of it. Cobblers have never been so busy.\"" },
    author: null
  },

  // --- Stade 12 (stage >= 12) ---
  {
    id: "p8_stage_12_name",
    period: 8,
    conditionType: "stage_12",
    title: { fr: "LA CITÉ ET LA PLANÈTE PORTENT LE MÊME NOM", en: "THE CITY AND THE PLANET SHARE A NAME" },
    text: { fr: "« Le conseil a fusionné les deux registres. Sur les lettres, on n'écrit plus le nom de la ville, seulement celui de la rue. »", en: "\"The council has merged the two registers. On letters, you no longer write the city's name, only the street's.\"" },
    author: null
  },

  // --- Population ---
  {
    id: "p8_pop_100b_queue",
    period: 8,
    conditionType: "pop_100b",
    title: { fr: "CENT MILLIARDS D'ESPRITS DANS LE CHŒUR", en: "A HUNDRED BILLION MINDS IN THE CHORUS" },
    text: { fr: "« Pour la première fois, il faut faire la queue pour penser à voix haute. Les créneaux du matin sont réservés aux enfants. »", en: "\"For the first time, there's a queue to think out loud. The morning slots are reserved for children.\"" },
    author: null
  },

  // --- Paix (instability < 0.35 && timeWear < 0.35) ---
  {
    id: "p8_paix_lawyers",
    period: 8,
    conditionType: "paix",
    title: { fr: "PAS UNE DISPUTE DEPUIS TROIS ANS", en: "NOT ONE QUARREL IN THREE YEARS" },
    text: { fr: "« Quand tout le monde pense ensemble, on ne se dispute plus. Les avocats se sont reconvertis dans le jardinage. Ils plaident encore pour leurs tomates. »", en: "\"When everyone thinks together, nobody quarrels. Lawyers have retrained as gardeners. They still plead for their tomatoes.\"" },
    author: null
  },
  {
    id: "p8_paix_evening",
    period: 8,
    conditionType: "paix",
    title: { fr: "LES VEILLEURS NOTENT L'HEURE OÙ L'ABSENT REGARDE", en: "THE WATCHERS LOG THE HOUR THE ABSENT LOOKS IN" },
    text: { fr: "« Les jours calmes, on sent passer son attention. Le registre des veilleurs montre qu'il vient surtout le soir, et rarement le dimanche matin. »", en: "\"On quiet days, you can feel his attention pass. The watchers' register shows he mostly comes in the evening, and rarely on Sunday mornings.\"" },
    author: null
  },

  // --- Bonus libre ---
  {
    id: "p8_bonus_letter",
    period: 8,
    conditionType: "bonus_libre",
    title: { fr: "UNE LETTRE À L'ABSENT EST DÉPOSÉE DANS LE CHŒUR", en: "A LETTER TO THE ABSENT IS LEFT IN THE CHORUS" },
    text: { fr: "« Elle dit seulement : nous savons que tu es là. Huit milliards de personnes l'ont pensée en même temps, à vingt heures. On attend la réponse. »", en: "\"It only says: we know you are there. Eight billion people thought it at the same moment, at eight in the evening. We are waiting for the answer.\"" },
    author: null
  },
  {
    id: "p8_bonus_school",
    period: 8,
    conditionType: "bonus_libre",
    title: { fr: "À L'ÉCOLE, ON APPREND À GARDER UNE PENSÉE POUR SOI", en: "SCHOOLS NOW TEACH KEEPING A THOUGHT TO YOURSELF" },
    text: { fr: "« C'est devenu une matière, avec une note. Les meilleurs élèves gardent un secret pendant toute une semaine. »", en: "\"It has become a subject, with a grade. The best pupils keep a secret for a whole week.\"" },
    author: null
  }
];
