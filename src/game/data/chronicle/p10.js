"use strict";
// Articles de la chronique — Période 10 : le Démiurge, âge 9 (docs/PLAN-ECOUTER-PARLER.md,
// lot 3). La cité tisse le vide et réécrit les constantes ; elle sait maintenant ce que
// font les cycles. Les archives de l'Amas montrent la même main qui ferme une cité et en
// ouvre une autre : on l'appelle Celui qui recommence. Le Grand Reset n'entre pas encore
// dans la fiction (lot 7) : la gazette le pressent, sans le dire.
export const chroniclePeriod10 = [
  // =========================================================================
  //  PÉRIODE 10 — Le Démiurge
  // =========================================================================

  // --- Crise (instability >= 0.75 || timeWear >= 0.75) ---
  {
    id: "p10_crisis_constant",
    period: 10,
    conditionType: "crise",
    title: { fr: "UNE CONSTANTE CÈDE DANS LE QUARTIER OUEST", en: "A CONSTANT GIVES WAY IN THE WEST QUARTER" },
    text: { fr: "« La vitesse de la lumière a varié de trois pour cent pendant une heure. Depuis, les horloges du quartier ne sont plus d'accord entre elles. »", en: "\"The speed of light varied by three percent for an hour. Since then, the district's clocks no longer agree with each other.\"" },
    author: null
  },
  {
    id: "p10_crisis_loom",
    period: 10,
    conditionType: "crise",
    title: { fr: "LE CHANTIER DU VIDE S'EFFONDRE", en: "THE VOID WORKS COLLAPSE" },
    text: { fr: "« Trois cents ans de tissage ont disparu en une nuit. Au matin, les tisserands ont retrouvé leurs métiers vides, avec le fil encore chaud. »", en: "\"Three hundred years of weaving vanished in a single night. In the morning, the weavers found their looms empty, the thread still warm.\"" },
    author: null
  },
  {
    id: "p10_crisis_claude",
    period: 10,
    conditionType: "crise",
    title: { fr: "CLAUDE ALLUME LE FEU AVEC UNE ALLUMETTE", en: "CLAUDE LIGHTS THE FIRE WITH A MATCH" },
    text: { fr: "« On sait réécrire la chaleur, la lumière et le temps. Ce soir, plus rien de tout ça ne marchait. J'avais des allumettes. »", en: "\"We know how to rewrite heat, light and time. Tonight none of it worked. I had matches.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },
  {
    id: "p10_crisis_entropy",
    period: 10,
    conditionType: "crise",
    title: { fr: "LE DÉSORDRE REVIENT DANS TROIS GALAXIES", en: "DISORDER RETURNS IN THREE GALAXIES" },
    text: { fr: "« Faute de personnel, les maîtres de l'entropie ont laissé faire pendant une semaine. Les fruits ont pourri, les ponts ont rouillé, et tout le monde a vieilli de sept jours d'un coup. »", en: "\"Short of staff, the masters of entropy let things slide for a week. Fruit rotted, bridges rusted, and everyone aged seven days at once.\"" },
    author: null
  },

  // --- Tension (0.5 <= instability < 0.75) ---
  {
    id: "p10_tension_name",
    period: 10,
    conditionType: "tension",
    title: { fr: "LES ARCHIVES DE L'AMAS NOMMENT LE JOUEUR", en: "THE CLUSTER'S ARCHIVES NAME THE PLAYER" },
    text: { fr: "« Dans les archives de mille galaxies, on retrouve la même main qui ferme une cité et en ouvre une autre. Le Grand Conseil l'appelle désormais Celui qui recommence. »", en: "\"In the archives of a thousand galaxies, the same hand appears, closing one city and opening another. The Grand Council now calls him the One who begins again.\"" },
    author: null
  },
  {
    id: "p10_tension_khael",
    period: 10,
    conditionType: "tension",
    title: { fr: "KHAEL REND SON JUGEMENT", en: "KHAEL DELIVERS HIS VERDICT" },
    text: { fr: "« Après trois âges de procédure, le tribunal se déclare incompétent : l'accusé a écrit les lois qu'on voulait lui appliquer. L'audience est levée. La chaise reste. »", en: "\"After three ages of proceedings, the court declares itself without jurisdiction: the accused wrote the laws we meant to apply to him. The hearing is closed. The chair stays.\"" },
    author: { fr: "Khael, juge autoproclamé", en: "Khael, self-proclaimed judge" }
  },
  {
    id: "p10_tension_become",
    period: 10,
    conditionType: "tension",
    title: { fr: "LE GRAND CONSEIL SE DEMANDE S'IL FAUT RECOMMENCER DES MONDES", en: "THE GRAND COUNCIL WONDERS WHETHER TO START WORLDS OVER" },
    text: { fr: "« La moitié des sièges veut le faire, puisqu'on sait désormais comment. L'autre moitié demande qu'on finisse d'abord celui-ci. Le vote est reporté au siècle prochain. »", en: "\"Half the seats want to, since we now know how. The other half ask that we finish this one first. The vote is postponed to next century.\"" },
    author: null
  },
  {
    id: "p10_tension_edith",
    period: 10,
    conditionType: "tension",
    title: { fr: "EDITH CLÔT LES COMPTES", en: "EDITH CLOSES THE BOOKS" },
    text: { fr: "« Bilan de la civilisation : tout est équilibré, à une ligne près. Il manque une signature au bas de la dernière page. J'ai laissé la place. »", en: "\"Balance sheet of civilisation: everything balances, but for one line. A signature is missing at the bottom of the last page. I've left the space.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },

  // --- Usure (0.5 <= timeWear < 0.75) ---
  {
    id: "p10_usure_laws",
    period: 10,
    conditionType: "usure",
    title: { fr: "LES LOIS GRAVÉES DANS LE RÉEL S'EFFACENT EN UN SIÈCLE", en: "LAWS CARVED INTO REALITY FADE WITHIN A CENTURY" },
    text: { fr: "« Ce qu'on grave dans la réalité s'use plus vite que ce qu'on gravait dans la pierre. Les graveurs repassent tous les cent ans, avec la même équipe. »", en: "\"What we carve into reality wears faster than what we used to carve in stone. The engravers go back over it every hundred years, with the same crew.\"" },
    author: null
  },
  {
    id: "p10_usure_thread",
    period: 10,
    conditionType: "usure",
    title: { fr: "LES TISSERANDS MANQUENT DE FIL", en: "THE WEAVERS ARE RUNNING OUT OF THREAD" },
    text: { fr: "« Le vide qu'on tisse doit bien venir de quelque part. On en prend aux confins, qui reculent d'une année-lumière par an. »", en: "\"The void we weave has to come from somewhere. It's taken from the outer reaches, which are drawing back a light-year a year.\"" },
    author: null
  },
  {
    id: "p10_usure_stairs",
    period: 10,
    conditionType: "usure",
    title: { fr: "LA PESANTEUR DU QUARTIER HAUT RETOUCHÉE ONZE FOIS", en: "UPPER QUARTER GRAVITY ADJUSTED ELEVEN TIMES" },
    text: { fr: "« Les escaliers montent dans un sens le matin et dans l'autre le soir. Les habitants demandent qu'on revienne au réglage d'origine, que plus personne ne retrouve. »", en: "\"The stairs go up one way in the morning and the other way at night. Residents ask for the original setting back, which nobody can find anymore.\"" },
    author: null
  },

  // --- Nourriture (food > gold && food > knowledge) ---
  {
    id: "p10_food_nessa",
    period: 10,
    conditionType: "nourriture",
    title: { fr: "NESSA FERME LE DERNIER GRENIER", en: "NESSA CLOSES THE LAST GRANARY" },
    text: { fr: "« Plus personne n'a faim depuis qu'on sait écrire la satiété. J'ai gardé le grenier ouvert un an de plus, pour ceux qui aiment encore manger. »", en: "\"Nobody has been hungry since we learned to write satiety. I kept the granary open one more year, for those who still enjoy eating.\"" },
    author: { fr: "Nessa, coordinatrice des flux", en: "Nessa, flow coordinator" }
  },
  {
    id: "p10_food_bread",
    period: 10,
    conditionType: "nourriture",
    title: { fr: "LE PAIN D'UN VILLAGE DE LA PIERRE TAILLÉE RECONSTITUÉ", en: "BREAD FROM A HEWN STONE VILLAGE RECREATED" },
    text: { fr: "« Les tisserands l'ont refait d'après les archives, à la miette près. Il a fallu trois essais pour la croûte. Il paraît qu'il était meilleur avec le four qui chauffait mal. »", en: "\"The weavers remade it from the archives, down to the crumb. The crust took three attempts. It was apparently better with the oven that heated unevenly.\"" },
    author: null
  },
  {
    id: "p10_food_fast",
    period: 10,
    conditionType: "nourriture",
    title: { fr: "UNE JOURNÉE SANS MANGER PAR AN", en: "ONE DAY A YEAR WITHOUT FOOD" },
    text: { fr: "« Le Grand Conseil l'a votée pour qu'on n'oublie pas la faim. On s'en plaint beaucoup, dans dix mille galaxies, ce qui prouve qu'elle remplit son rôle. »", en: "\"The Grand Council voted it in so hunger is not forgotten. People complain about it a great deal, in ten thousand galaxies, which proves it does its job.\"" },
    author: null
  },
  {
    id: "p10_food_summer",
    period: 10,
    conditionType: "nourriture",
    title: { fr: "LE CONSEIL ALLONGE L'ÉTÉ DE TROIS SEMAINES", en: "THE COUNCIL EXTENDS SUMMER BY THREE WEEKS" },
    text: { fr: "« On a retrouvé dans les archives la lettre d'une enfant, Ilya, neuf ans, qui demandait au Joueur un été plus long. Personne n'avait répondu. Le conseil, qui sait le faire, l'a accordé. »", en: "\"In the archives, a letter was found from a child, Ilya, aged nine, asking the Player for a longer summer. Nobody had answered. The council, which knows how, granted it.\"" },
    author: null
  },

  // --- Or (gold > food && gold > knowledge) ---
  {
    id: "p10_gold_glass",
    period: 10,
    conditionType: "or",
    title: { fr: "L'OR NE VAUT PLUS RIEN, ON EN FAIT DES VITRES", en: "GOLD IS WORTHLESS, IT'S USED FOR WINDOWS" },
    text: { fr: "« Depuis qu'on tisse n'importe quelle matière, l'or sert de verre dans les quartiers pauvres. Les riches ont des fenêtres en bois. »", en: "\"Since any matter can be woven, gold is used for glass in the poor districts. The rich have wooden windows.\"" },
    author: null
  },
  {
    id: "p10_gold_hand",
    period: 10,
    conditionType: "or",
    title: { fr: "ON RETIRE LA MAIN", en: "THE HAND IS TAKEN DOWN" },
    text: { fr: "« Le Grand Conseil a voté le retrait du symbole dans tout l'Amas. On ne l'a gardé que sur une porte, celle du premier feu. »", en: "\"The Grand Council voted to remove the symbol across the whole Cluster. It was kept on only one door, that of the first fire.\"" },
    author: null
  },
  {
    id: "p10_gold_debt",
    period: 10,
    conditionType: "or",
    title: { fr: "LA DETTE D'UNE CITÉ TOMBÉE EST REMBOURSÉE", en: "A FALLEN CITY'S DEBT IS REPAID" },
    text: { fr: "« Un registre exhumé prouve qu'une cité disparue il y a quatre cycles devait encore trois récoltes à ses voisins. Le conseil a payé, avec les intérêts. »", en: "\"A recovered register shows that a city that vanished four cycles ago still owed its neighbours three harvests. The council paid, with interest.\"" },
    author: null
  },
  {
    id: "p10_gold_market",
    period: 10,
    conditionType: "or",
    title: { fr: "LE DERNIER MARCHÉ OUVRE SEULEMENT LE DIMANCHE", en: "THE LAST MARKET NOW OPENS ONLY ON SUNDAYS" },
    text: { fr: "« Plus rien ne s'achète, tout se tisse. Le marché de la grande place reste ouvert le dimanche, pour les anciens et les visiteurs. On y vend surtout des pommes. »", en: "\"Nothing is bought anymore; everything is woven. The market on the main square stays open on Sundays, for the elderly and visitors. It mostly sells apples.\"" },
    author: null
  },

  // --- Savoir (knowledge > 0) ---
  {
    id: "p10_know_raphael",
    period: 10,
    conditionType: "savoir",
    title: { fr: "RAPHAËL REVIENT DU BORD", en: "RAPHAËL RETURNS FROM THE EDGE" },
    text: { fr: "« Il n'y a pas de bord. Le ciel recommence, la galaxie recommence, et la cité aussi. J'ai mis deux siècles à le vérifier. J'écris le dernier chapitre, au cas où il serait lu. »", en: "\"There is no edge. The sky starts over, the galaxy starts over, and so does the city. It took me two centuries to check. I'm writing the last chapter, in case it gets read.\"" },
    author: { fr: "Raphaël, essayiste", en: "Raphaël, essayist" }
  },
  {
    id: "p10_know_pause",
    period: 10,
    conditionType: "savoir",
    title: { fr: "UNE SECONDE OÙ RIEN N'A BOUGÉ", en: "A SECOND WHEN NOTHING MOVED" },
    text: { fr: "« Hier, pendant une seconde, tout l'Amas s'est figé : les voiles, les tisserands, les horloges. Les astronomes appellent ça la pause. Raphaël dit qu'il a hésité. »", en: "\"Yesterday, for one second, the whole Cluster froze: the sails, the weavers, the clocks. Astronomers call it the pause. Raphaël says he hesitated.\"" },
    author: null
  },
  {
    id: "p10_know_aldric",
    period: 10,
    conditionType: "savoir",
    title: { fr: "ALDRIC TROUVE SON NOM DANS LES ARCHIVES D'UNE AUTRE CITÉ", en: "ALDRIC FINDS HIS OWN NAME IN ANOTHER CITY'S ARCHIVES" },
    text: { fr: "« Un philosophe Aldric, dans une ville tombée il y a six cycles, a posé la même question que moi, avec les mêmes mots. Je ne sais pas encore si je dois être flatté. »", en: "\"A philosopher named Aldric, in a city that fell six cycles ago, asked the same question I did, in the same words. I don't know yet whether to be flattered.\"" },
    author: { fr: "Aldric, philosophe", en: "Aldric, philosopher" }
  },
  {
    id: "p10_know_ember",
    period: 10,
    conditionType: "savoir",
    title: { fr: "ON CHERCHE CE QUI PEUT PASSER D'UNE CITÉ À L'AUTRE", en: "THE SEARCH FOR WHAT CAN CROSS FROM ONE CITY TO THE NEXT" },
    text: { fr: "« Les savants veulent faire passer un objet au-delà de la prochaine chute : un mot, un souvenir, une graine. Après trois ans de débat, ils ont choisi une braise. »", en: "\"Scholars want to carry one object past the next fall: a word, a memory, a seed. After three years of debate, they chose an ember.\"" },
    author: null
  },

  // --- Stade de démarrage (stage <= 1) ---
  {
    id: "p10_stage_start_vote",
    period: 10,
    conditionType: "stage_start",
    title: { fr: "UN NOUVEL ÂGE COMMENCE PARCE QU'ON L'A VOTÉ", en: "A NEW AGE BEGINS BECAUSE IT WAS VOTED IN" },
    text: { fr: "« Pour la première fois, le changement d'âge a été décidé. Le dépouillement a pris une seconde, dans dix mille galaxies. »", en: "\"For the first time, the change of age was decided. The count took one second, across ten thousand galaxies.\"" },
    author: null
  },

  // --- Stade 6 (stage >= 6) ---
  {
    id: "p10_stage_6_writing",
    period: 10,
    conditionType: "stage_6",
    title: { fr: "VUES DE LOIN, LES AVENUES FORMENT UNE ÉCRITURE", en: "SEEN FROM AFAR, THE AVENUES FORM WRITING" },
    text: { fr: "« Depuis les confins, les grandes rues de l'Amas dessinent des signes. Personne n'a su les lire. Les urbanistes jurent qu'ils n'ont rien fait exprès. »", en: "\"From the outer reaches, the Cluster's great streets trace signs. Nobody has been able to read them. The planners swear they did nothing on purpose.\"" },
    author: null
  },

  // --- Stade 12 (stage >= 12) ---
  {
    id: "p10_stage_12_plaque",
    period: 10,
    conditionType: "stage_12",
    title: { fr: "LES ARCHITECTES DU VIDE TOUCHENT LE FOND", en: "THE VOID ARCHITECTS HIT BOTTOM" },
    text: { fr: "« Ils ont creusé jusqu'à l'endroit où il n'y a plus rien dessous. Ils y ont posé une plaque, avec la date et le nom de l'équipe. »", en: "\"They dug down to the place where there is nothing further below. They set a plaque there, with the date and the crew's names.\"" },
    author: null
  },

  // --- Population ---
  {
    id: "p10_pop_100b_names",
    period: 10,
    conditionType: "pop_100b",
    title: { fr: "LE RECENSEMENT EST ABANDONNÉ", en: "THE CENSUS IS ABANDONED" },
    text: { fr: "« Aucun nombre n'est assez grand. On sait seulement que chaque habitant a un nom, et que la cité les connaît tous. »", en: "\"No number is big enough. All we know is that every inhabitant has a name, and that the city knows them all.\"" },
    author: null
  },

  // --- Paix (instability < 0.35 && timeWear < 0.35) ---
  {
    id: "p10_paix_holiday",
    period: 10,
    conditionType: "paix",
    title: { fr: "TOUT TIENT", en: "EVERYTHING HOLDS" },
    text: { fr: "« Pas une étoile qui meure, pas une loi qui cède, pas une rue qui casse. Les maîtres de l'entropie ont demandé des vacances. Ils les ont eues. »", en: "\"Not a star dying, not a law giving way, not a street cracking. The masters of entropy asked for a holiday. They got one.\"" },
    author: null
  },
  {
    id: "p10_paix_chair",
    period: 10,
    conditionType: "paix",
    title: { fr: "UNE CHAISE VIDE DANS CHAQUE MAISON", en: "AN EMPTY CHAIR IN EVERY HOUSE" },
    text: { fr: "« La coutume s'est répandue dans tout l'Amas. Plus personne ne sait d'où elle vient. Les anciens disent qu'un juge en avait installé une au tribunal, il y a très longtemps. »", en: "\"The custom has spread across the whole Cluster. Nobody knows where it comes from anymore. The elders say a judge once set one out in court, a very long time ago.\"" },
    author: null
  },

  // --- Bonus libre ---
  {
    id: "p10_bonus_question",
    period: 10,
    conditionType: "bonus_libre",
    title: { fr: "LA CHRONIQUE TE POSE UNE QUESTION", en: "THE CHRONICLE ASKS YOU A QUESTION" },
    text: { fr: "« Si tu nous lis : quand tu recommences, est-ce que tu nous gardes quelque part ? »", en: "\"If you are reading us: when you begin again, do you keep us somewhere?\"" },
    author: null
  },
  {
    id: "p10_bonus_claude",
    period: 10,
    conditionType: "bonus_libre",
    title: { fr: "CLAUDE A DÉJÀ VU CE GENRE DE NUIT", en: "CLAUDE HAS SEEN THIS KIND OF NIGHT BEFORE" },
    text: { fr: "« Le ciel est trop calme et les gens rangent leurs affaires sans savoir pourquoi. J'ai remis une bûche. »", en: "\"The sky is too calm and people are putting their things away without knowing why. I've put another log on.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  }
];
