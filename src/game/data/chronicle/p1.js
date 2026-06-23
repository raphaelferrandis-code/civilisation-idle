"use strict";
// Articles de la chronique — Période 1 (extrait de chronicleArticles.js, Audit Phase 6).
export const chroniclePeriod1 = [
  // =========================================================================
  //  PÉRIODE 1 — Tradition Orale
  // =========================================================================

  // --- Crise (instability >= 0.75 || timeWear >= 0.75) ---
  {
    id: "p1_crisis_fire",
    period: 1,
    conditionType: "crise",
    title: "LES FEUX FAIBLISSENT, LE FROID REVIENT",
    text: "« Les braises pâlissent et nul ne sait pourquoi. Les anciens conseillent de se serrer fort et d'espérer le matin. Comme d'habituuude. »",
    author: "Claude, gardien du feu"
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

  // --- Tension élevée (0.5 <= instability < 0.75) ---
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
    author: "Claude, gardien du feu"
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

  // --- Usure élevée (0.5 <= timeWear < 0.75) ---
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
    author: "Claude, gardien du feu"
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
    author: "Claude, gardien du feu"
  },
  {
    id: "p1_bonus_peace2",
    period: 1,
    conditionType: "paix",
    title: "UNE SAISON SANS UN SEUL MALHEUR",
    text: "« Pas de famine, pas de bête féroce, pas de querelle. Les anciens, méfiants, cherchent ce qui cloche. Ils ne trouvent rien, et ça les inquiète. »",
    author: null
  },

];
