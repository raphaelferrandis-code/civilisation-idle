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
    title: { fr: "LES FEUX FAIBLISSENT, LE FROID REVIENT", en: "THE FIRES DWINDLE, THE COLD RETURNS" },
    text: { fr: "« Les braises pâlissent et nul ne sait pourquoi. Les anciens conseillent de se serrer fort et d'espérer le matin. Comme d'habituuude. »", en: "\"The embers pale and no one knows why. The elders advise us to huddle tight and pray for morning. As uuusual.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },
  {
    id: "p1_crisis_hunter",
    period: 1,
    conditionType: "crise",
    title: { fr: "LA DIFFERENCE ENTRE UN BON CHASSEUR", en: "THE DIFFERENCE BETWEEN A GOOD HUNTER" },
    text: { fr: "« Trois jours que les chasseurs rentrent les mains vides. Aucun volontaire pour goûter en premier. »", en: "\"Three days now the hunters come home empty-handed. No volunteers to taste first.\"" },
    author: null
  },
  {
    id: "p1_crisis_split",
    period: 1,
    conditionType: "crise",
    title: { fr: "LE CLAN PARLE DE SE SÉPARER", en: "THE CLAN SPEAKS OF SPLITTING UP" },
    text: { fr: "« Trop de bouches, pas assez de nourriture. Certains veulent partir vers l'ouest. Les anciens rappellent qu'à l'ouest, c'est pareil, mais plus loin. »", en: "\"Too many mouths, not enough food. Some want to head west. The elders remind them that west is just the same, only farther.\"" },
    author: null
  },
  {
    id: "p1_crisis_forget_fire",
    period: 1,
    conditionType: "crise",
    title: { fr: "ON A OUBLIÉ COMMENT FAIRE DU FEU", en: "WE'VE FORGOTTEN HOW TO MAKE FIRE" },
    text: { fr: "« Le dernier qui savait s'est endormi pour de bon. On frotte des bâtons en attendant que la mémoire revienne mais il fait froid pendant ce temps. »", en: "\"The last one who knew has fallen asleep for good. We rub sticks together waiting for the memory to come back, but it's cold in the meantime.\"" },
    author: null
  },

  // --- Tension élevée (0.5 <= instability < 0.75) ---
  {
    id: "p1_tension_tents",
    period: 1,
    conditionType: "tension",
    title: { fr: "BAGARRE POUR LA MEILLEURE TENTE", en: "BRAWL OVER THE BEST TENT" },
    text: { fr: "« Deux familles revendiquent la même tente, sous prétexte qu'ils l'ont vu en premier. »", en: "\"Two families claim the same tent, on the grounds that they saw it first.\"" },
    author: null
  },
  {
    id: "p1_tension_reserve",
    period: 1,
    conditionType: "tension",
    title: { fr: "QUI A MANGÉ DANS LA RESERVE?", en: "WHO ATE FROM THE STORES?" },
    text: { fr: "« Une ration a disparu cette nuit. Les soupçons pèsent sur tout le monde, surtout sur celui qui n'a plus faim. »", en: "\"A ration vanished in the night. Suspicion falls on everyone, especially on the one who's no longer hungry.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },
  {
    id: "p1_tension_chief",
    period: 1,
    conditionType: "tension",
    title: { fr: "LE CHEF EST CONTESTÉ", en: "THE CHIEF IS CHALLENGED" },
    text: { fr: "« Un jeune costaud estime qu'il guiderait mieux le clan. Le vieux chef propose de régler ça à la prochaine famine. »", en: "\"A strapping youth reckons he'd lead the clan better. The old chief proposes settling it at the next famine.\"" },
    author: null
  },
  {
    id: "p1_tension_crowd",
    period: 1,
    conditionType: "tension",
    title: { fr: "TROP DE MONDE AUTOUR DU FEU", en: "TOO MANY AROUND THE FIRE" },
    text: { fr: "« Quelqu'un a suggéré un deuxième feu. Idée révolutionnaire, mais accueillie avec méfiance. »", en: "\"Someone suggested a second fire. A revolutionary idea, but met with suspicion.\"" },
    author: null
  },

  // --- Usure élevée (0.5 <= timeWear < 0.75) ---
  {
    id: "p1_wear_repos",
    period: 1,
    conditionType: "usure",
    title: { fr: "ON VEUT DU REPOS", en: "WE WANT REST" },
    text: { fr: "« Les silex s'émoussent plus vite qu'on ne les taille. Le tailleur réclame du repos ; on lui répond qu'il se reposera plus tard, comme tout le monde. »", en: "\"The flints go blunt faster than we can knap them. The knapper demands rest; he's told he'll rest later, like everyone else.\"" },
    author: { fr: "Garin, tailleur de silex", en: "Garin, flint knapper" }
  },
  {
    id: "p1_wear_tired",
    period: 1,
    conditionType: "usure",
    title: { fr: "ON EST FATIGUÉ", en: "WE'RE TIRED" },
    text: { fr: "« Cueillir, chasser, recommencer : certains se demandent si ça vaut le coup : on leur a conseillé de moins réfléchir. »", en: "\"Gather, hunt, start over: some wonder whether it's worth it; they were advised to think less.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },
  {
    id: "p1_wear_resemble",
    period: 1,
    conditionType: "usure",
    title: { fr: "LES JOURS SE RESSEMBLENT TROP", en: "THE DAYS LOOK TOO MUCH ALIKE" },
    text: { fr: "« Un membre du clan jure que cette lune est exactement la même que la dernière. On a mis ça sur le compte de la fatigue. »", en: "\"A clan member swears this moon is exactly the same as the last. We put it down to fatigue.\"" },
    author: null
  },

  // --- Nourriture dominante ---
  {
    id: "p1_food_surplus",
    period: 1,
    conditionType: "nourriture",
    title: { fr: "TROP DE VIANDE : UNE SOLUTION?", en: "TOO MUCH MEAT: A SOLUTION?" },
    text: { fr: "« La chasse a été si bonne qu'on ne sait plus où poser le surplus. Un gars a proposé d'en garder pour demain. On l'a regardé comme s'il avait inventé la magie. »", en: "\"The hunt went so well we no longer know where to put the surplus. A fellow proposed keeping some for tomorrow. We looked at him as if he'd invented magic.\"" },
    author: { fr: "Renaud, habitant", en: "Renaud, dweller" }
  },
  {
    id: "p1_food_berries",
    period: 1,
    conditionType: "nourriture",
    title: { fr: "LES BAIES JUSQU'À PLUS SOIF", en: "BERRIES UNTIL WE BURST" },
    text: { fr: "« Les cueilleurs sont trop efficaces, les enfants mangent trop de baies qu'ils en sont violets. »", en: "\"The gatherers are too good at it; the children eat so many berries they've turned purple.\"" },
    author: null
  },
  {
    id: "p1_food_tomorrow",
    period: 1,
    conditionType: "nourriture",
    title: { fr: "LE CONCEPT DE 'DEMAIN'", en: "THE CONCEPT OF 'TOMORROW'" },
    text: { fr: "« Pour la première fois, il reste à manger après le repas. La communauté peut penser à demain »", en: "\"For the first time, there is food left after the meal. The community can think about tomorrow.\"" },
    author: null
  },
  {
    id: "p1_food_river",
    period: 1,
    conditionType: "nourriture",
    title: { fr: "LA RIVIÈRE DÉBORDE DE POISSONS", en: "THE RIVER TEEMS WITH FISH" },
    text: { fr: "« Il suffit de tendre la main. Certains trouvent ça trop facile et se méfient. Les autres mangent. »", en: "\"You need only reach out a hand. Some find it too easy and grow wary. The others eat.\"" },
    author: { fr: "Nessa, chasseuse", en: "Nessa, huntress" }
  },

  // --- Or dominant ---
  {
    id: "p1_gold_stones",
    period: 1,
    conditionType: "or",
    title: { fr: "LA FOLIE DES CAILLOUX BRILLANTS", en: "THE CRAZE FOR SHINY PEBBLES" },
    text: { fr: "« On échange trois jours de cueillette contre une pierre qui brille mais ne se mange pas. Personne ne comprend mais tout le monde en veut. »", en: "\"We trade three days of foraging for a stone that shines but cannot be eaten. No one understands, yet everyone wants one.\"" },
    author: { fr: "une habitante perplexe", en: "a baffled dweller" }
  },
  {
    id: "p1_gold_shell",
    period: 1,
    conditionType: "or",
    title: { fr: "LE COQUILLAGE VAUT-IL UN REPAS ?", en: "IS A SEASHELL WORTH A MEAL?" },
    text: { fr: "« Le troc d'une jolie coquille contre de la viande ouvre un grand débat : peut-on manger du joli ? »", en: "\"Bartering a pretty shell for meat opens a great debate: can you eat the pretty?\"" },
    author: null
  },
  {
    id: "p1_gold_hoarder",
    period: 1,
    conditionType: "or",
    title: { fr: "CELUI QUI A LE PLUS DE PIERRES", en: "THE ONE WITH THE MOST STONES" },
    text: { fr: "« Un habitant a amassé plus de cailloux brillants que tout le monde. Depuis, il dort mal de peur qu'on les lui prenne »", en: "\"A dweller has hoarded more shiny pebbles than anyone. Ever since, he sleeps poorly, fearing they'll be taken from him.\"" },
    author: null
  },
  {
    id: "p1_gold_tombs",
    period: 1,
    conditionType: "or",
    title: { fr: "ON ENTERRE LES MORTS AVEC LEURS TRÉSORS", en: "WE BURY THE DEAD WITH THEIR TREASURES" },
    text: { fr: "« Nouvelle coutume : une belle pierre dans la tombe. Ceux qui n'en ont pas trouvent ça dommage. »", en: "\"A new custom: a fine stone in the grave. Those who have none find it a shame.\"" },
    author: null
  },

  // --- Savoir actif ---
  {
    id: "p1_knowledge_numbers",
    period: 1,
    conditionType: "savoir",
    title: { fr: "ON A COMPTÉ!", en: "WE COUNTED!" },
    text: { fr: "« Un habitant jure qu'après dix, il existe encore des nombres. On reste prudent : on n'a jamais eu besoin d'autant. »", en: "\"A dweller swears that after ten, there are still more numbers. We remain cautious: we've never needed that many.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },
  {
    id: "p1_knowledge_drawings",
    period: 1,
    conditionType: "savoir",
    title: { fr: "DES DESSINS SUR LES MURS", en: "DRAWINGS ON THE WALLS" },
    text: { fr: "« Quelqu'un a peint un bison sur la roche et a presque provoqué une guerre civile; A quoi bon peindre un bison qu'on ne peut pas manger. »", en: "\"Someone painted a bison on the rock and nearly sparked a civil war; what's the point of painting a bison you can't eat.\"" },
    author: null
  },
  {
    id: "p1_knowledge_stones",
    period: 1,
    conditionType: "savoir",
    title: { fr: "LE FEU PEUT VENIR DES PIERRES", en: "FIRE CAN COME FROM STONES" },
    text: { fr: "« En frappant deux silex, des étincelles naissent. La nouvelle bouleverse Claude le gardien du feu, soudain moins indispensable. »", en: "\"Striking two flints together makes sparks. The news shakes Claude the keeper of the fire, suddenly less indispensable.\"" },
    author: { fr: "Garin, tailleur de silex", en: "Garin, flint knapper" }
  },
  {
    id: "p1_knowledge_wheel",
    period: 1,
    conditionType: "savoir",
    title: { fr: "LA ROUE, PEUT-ÊTRE ?", en: "THE WHEEL, MAYBE?" },
    text: { fr: "« Une habitante a eu l'idée d'un transporteur roulant. Le conseil note l'idée mais préfère faire porter les charges à dos d'homme, comme des gens sérieux. »", en: "\"A dweller had the idea of a rolling carrier. The council notes the idea but prefers to carry loads on people's backs, like serious folk.\"" },
    author: null
  },

  // --- Jalons (Bonus) ---
  {
    id: "p1_bonus_start",
    period: 1,
    conditionType: "stage_start",
    title: { fr: "UNE NOUVELLE COMMUNAUTÉ", en: "A NEW COMMUNITY" },
    text: { fr: "« Des inconnus se sont assis autour du même feu sans se battre. Les anciens parlent déjà d'âge d'or. »", en: "\"Strangers sat around the same fire without fighting. The elders already speak of a golden age.\"" },
    author: null
  },
  {
    id: "p1_bonus_stage6",
    period: 1,
    conditionType: "stage_6",
    title: { fr: "LE CAMPEMENT DEVIENT UN VRAI VILLAGE", en: "THE CAMP BECOMES A REAL VILLAGE" },
    text: { fr: "« Plus de huttes que de doigts pour les compter. Certains s'émeuvent ; d'autres pensent que c'était quand même mieux avant. »", en: "\"More huts than fingers to count them. Some are moved; others reckon it was better before, all the same.\"" },
    author: null
  },
  {
    id: "p1_bonus_stage12",
    period: 1,
    conditionType: "stage_12",
    title: { fr: "ET SI ON RESTAIT ICI POUR TOUJOURS ?", en: "WHAT IF WE STAYED HERE FOREVER?" },
    text: { fr: "« Ne plus suivre les troupeaux fait son chemin. Semer, attendre, récolter : pari risqué, mais les jambes sont fatiguées de marcher. »", en: "\"The idea of no longer following the herds is gaining ground. Sow, wait, harvest: a risky gamble, but the legs are tired of walking.\"" },
    author: null
  },
  {
    id: "p1_bonus_pop10k",
    period: 1,
    conditionType: "pop_10k",
    title: { fr: "DIX MILLE BOUCHES AUTOUR DU FEU", en: "TEN THOUSAND MOUTHS AROUND THE FIRE" },
    text: { fr: "« Le clan est si grand qu'on ne se connait plus tous. »", en: "\"The clan is so large we no longer all know one another.\"" },
    author: null
  },
  {
    id: "p1_bonus_peace1",
    period: 1,
    conditionType: "paix",
    title: { fr: "RIEN À SIGNALER, ET C'EST TRÈS BIEN COMME ÇA", en: "NOTHING TO REPORT, AND THAT'S JUST FINE" },
    text: { fr: "« Les feux brûlent, les ventres sont pleins, (presque) personne n'est mort ce mois. On s'excuse pour le manque de nouvelles palpitantes. »", en: "\"The fires burn, the bellies are full, (almost) no one died this month. We apologize for the lack of thrilling news.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },
  {
    id: "p1_bonus_peace2",
    period: 1,
    conditionType: "paix",
    title: { fr: "UNE SAISON SANS UN SEUL MALHEUR", en: "A SEASON WITHOUT A SINGLE MISFORTUNE" },
    text: { fr: "« Pas de famine, pas de bête féroce, pas de querelle. Les anciens, méfiants, cherchent ce qui cloche. Ils ne trouvent rien, et ça les inquiète. »", en: "\"No famine, no fierce beast, no quarrel. The elders, wary, look for what's wrong. They find nothing, and that worries them.\"" },
    author: null
  },

];
