"use strict";
// Articles de la chronique — Période 5 (extrait de chronicleArticles.js, Audit Phase 6).
export const chroniclePeriod5 = [
  // =========================================================================
  //  PÉRIODE 5 — Imprimé
  // =========================================================================

  // --- Crise (instability >= 0.75 || timeWear >= 0.75) ---
  {
    id: "p5_crisis_predictable",
    period: 5,
    conditionType: "crise",
    title: { fr: "LA CRISE ÉTAIT PRÉVISIBLE, DONC PERSONNE N'A PRÉVU", en: "THE CRISIS WAS PREDICTABLE, SO NOBODY PREDICTED IT" },
    text: { fr: "« Les signes étaient là : greniers vides, colère haute, routes coupées. Le gouvernement promet d'étudier pourquoi il n'a rien étudié. »", en: "\"The signs were there: empty granaries, high anger, severed roads. The government promises to study why it studied nothing.\"" },
    author: null
  },
  {
    id: "p5_crisis_riots",
    period: 5,
    conditionType: "crise",
    title: { fr: "LES ÉMEUTES GAGNENT LES QUARTIERS RICHES", en: "THE RIOTS REACH THE WEALTHY DISTRICTS" },
    text: { fr: "« Les milices affirment que la situation est sous contrôle. Les quartiers riches affirment que les milices sont trop loin. »", en: "\"The militias claim the situation is under control. The wealthy districts claim the militias are too far away.\"" },
    author: { fr: "Renaud, citoyen", en: "Renaud, citizen" }
  },
  {
    id: "p5_crisis_fire",
    period: 5,
    conditionType: "crise",
    title: { fr: "LE GRAND INCENDIE DÉTRUIT TROIS DISTRICTS", en: "THE GREAT FIRE DESTROYS THREE DISTRICTS" },
    text: { fr: "« Les flammes ont tout pris en une nuit. Dès l'aube, des plans de reconstruction étaient déjà prêts, comme s'ils attendaient. »", en: "\"The flames took everything in one night. By dawn, reconstruction plans were already ready, as if they had been waiting.\"" },
    author: null
  },
  {
    id: "p5_crisis_guardian",
    period: 5,
    conditionType: "crise",
    title: { fr: "LE GARDIEN DU FEU NOUS INTERPELLE", en: "THE KEEPER OF THE FIRE CALLS OUT TO US" },
    text: { fr: "« Le feu sacré vacille, les fidèles paniquent, les prêtres improvisent. J'ai déjà vu ce genre de nuit. »", en: "\"The sacred fire flickers, the faithful panic, the priests improvise. I have seen this kind of night before.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },

  // --- Tension élevée (0.5 <= instability < 0.75) ---
  {
    id: "p5_tension_who_decides",
    period: 5,
    conditionType: "tension",
    title: { fr: "LE PEUPLE SE DEMANDE QUI DÉCIDE VRAIMENT", en: "THE PEOPLE WONDER WHO REALLY DECIDES" },
    text: { fr: "« Le roi désigne le conseil, le conseil désigne les prêtres, les prêtres désignent le ciel. Le ciel ne répond pas. Il va falloir du changement. »", en: "\"The king points to the council, the council points to the priests, the priests point to the heavens. The heavens do not answer. Change will be needed.\"" },
    author: null
  },
  {
    id: "p5_tension_tax_print",
    period: 5,
    conditionType: "tension",
    title: { fr: "NOUVELLE TAXE SUR LES TEXTES IMPRIMÉS", en: "NEW TAX ON PRINTED TEXTS" },
    text: { fr: "« Lire rend critique. Le Trésor trouve prudent de rendre la critique payante. »", en: "\"Reading makes one critical. The Treasury finds it prudent to make criticism cost money.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },
  {
    id: "p5_tension_cult_split",
    period: 5,
    conditionType: "tension",
    title: { fr: "LE CULTE SE DIVISE EN TROIS BRANCHES", en: "THE CULT SPLITS INTO THREE BRANCHES" },
    text: { fr: "« Les uns disent qu'il nous guide. Les autres qu'il nous teste. Les derniers qu'il attend. Personne ne sait ce que cela veut dire. »", en: "\"Some say He guides us. Others that He tests us. The last that He waits. No one knows what that means.\"" },
    author: null
  },
  {
    id: "p5_tension_march",
    period: 5,
    conditionType: "tension",
    title: { fr: "UNE GRANDE MARCHE POUR PLUS DE HASARD", en: "A GREAT MARCH FOR MORE RANDOMNESS" },
    text: { fr: "« Les citoyens réclament des récoltes normales, des crises normales, et quelques années qui ne ressemblent pas à un plan. »", en: "\"The citizens demand normal harvests, normal crises, and a few years that do not look like a plan.\"" },
    author: null
  },

  // --- Usure élevée (0.5 <= timeWear < 0.75) ---
  {
    id: "p5_wear_streets",
    period: 5,
    conditionType: "usure",
    title: { fr: "LES RUES NE PORTENT PLUS LEUR NOM D'ORIGINE", en: "THE STREETS NO LONGER BEAR THEIR ORIGINAL NAMES" },
    text: { fr: "« La cité se laisse aller. On renomme les lieux d'après ce qu'ils remplacent ; ainsi, l'ancienne place du marché est maintenant l'ancienne ancienne place. »", en: "\"The city is letting itself go. Places are renamed after what they replaced; thus the old market square is now the old old square.\"" },
    author: null
  },
  {
    id: "p5_wear_old_papers",
    period: 5,
    conditionType: "usure",
    title: { fr: "LES ANCIENS JOURNAUX RACONTENT LA MÊME CHOSE", en: "THE OLD NEWSPAPERS TELL THE SAME STORY" },
    text: { fr: "« Famine, prospérité, guerre, miracle, chute, reconstruction. Les dates changent. Le ton, très peu. »", en: "\"Famine, prosperity, war, miracle, fall, reconstruction. The dates change. The tone, hardly at all.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },
  {
    id: "p5_wear_past_politics",
    period: 5,
    conditionType: "usure",
    title: { fr: "LE PASSÉ DEVIENT UN ARGUMENT POLITIQUE", en: "THE PAST BECOMES A POLITICAL ARGUMENT" },
    text: { fr: "« Chaque faction affirme que l'histoire lui donne raison. L'histoire, elle, semble surtout fatiguée. »", en: "\"Every faction claims history proves it right. History itself just seems tired.\"" },
    author: null
  },

  // --- Nourriture dominante ---
  {
    id: "p5_food_harvest",
    period: 5,
    conditionType: "nourriture",
    title: { fr: "LES RÉCOLTES DÉPASSENT LES PRÉVISIONS", en: "THE HARVESTS EXCEED THE FORECASTS" },
    text: { fr: "« Les agronomes avaient prévu une bonne année. Elle l'est davantage. »", en: "\"The agronomists had forecast a good year. It is even better.\"" },
    author: null
  },
  {
    id: "p5_food_bread",
    period: 5,
    conditionType: "nourriture",
    title: { fr: "DU PAIN POUR TOUS, MÊME POUR LES DOUTES", en: "BREAD FOR ALL, EVEN FOR DOUBTS" },
    text: { fr: "« Les boulangeries ne désemplissent pas et les files sont calmes. On y parle beaucoup de Celui qui veille, et du prix de la farine. »", en: "\"The bakeries are never empty and the queues are calm. There is much talk of the One who watches, and of the price of flour.\"" },
    author: null
  },
  {
    id: "p5_food_export",
    period: 5,
    conditionType: "nourriture",
    title: { fr: "EXPORTATION MASSIVE DE BLÉ", en: "MASSIVE WHEAT EXPORT" },
    text: { fr: "« La cité nourrit ses alliés, mais aussi ses rivaux. L'intendance appelle cela de la diplomatie comestible. »", en: "\"The city feeds its allies, but also its rivals. The stewardship calls it edible diplomacy.\"" },
    author: { fr: "Nessa, marchande", en: "Nessa, merchant" }
  },
  {
    id: "p5_food_peasants",
    period: 5,
    conditionType: "nourriture",
    title: { fr: "LES PAYSANS NE CROIENT PLUS AUX COÏNCIDENCES", en: "THE PEASANTS NO LONGER BELIEVE IN COINCIDENCES" },
    text: { fr: "« Semer, attendre, récolter : voilà leur métier. Mais certains jurent que les saisons obéissent à un rythme qui n'est pas le leur. »", en: "\"To sow, to wait, to reap: that is their trade. But some swear the seasons obey a rhythm that is not their own.\"" },
    author: null
  },

  // --- Or dominant ---
  {
    id: "p5_gold_speed",
    period: 5,
    conditionType: "or",
    title: { fr: "L'OR CIRCULE PLUS VITE QUE LES DÉCRETS", en: "GOLD CIRCULATES FASTER THAN DECREES" },
    text: { fr: "« Les banques ouvrent avant les temples et ferment après les tribunaux. Khael trouve cela pratique. »", en: "\"The banks open before the temples and close after the courts. Khael finds this convenient.\"" },
    author: { fr: "Khael, juge autoproclamé", en: "Khael, self-proclaimed judge" }
  },
  {
    id: "p5_gold_suspicious",
    period: 5,
    conditionType: "or",
    title: { fr: "LA PROSPÉRITÉ DEVIENT SUSPECTE", en: "PROSPERITY BECOMES SUSPECT" },
    text: { fr: "« Chaque crise finit par remplir les coffres de quelqu'un. Le peuple se demande si les anciens effondrements ne profitaient pas déjà à certains. »", en: "\"Every crisis ends up filling someone's coffers. The people wonder whether the old collapses were not already profiting a few.\"" },
    author: null
  },
  {
    id: "p5_gold_accounts",
    period: 5,
    conditionType: "or",
    title: { fr: "EDITH PUBLIE LES COMPTES DU ROYAUME", en: "EDITH PUBLISHES THE KINGDOM'S ACCOUNTS" },
    text: { fr: "« Les chiffres sont exacts, alignés et profondément inquiétants. Trop de pertes mènent à trop de gains. »", en: "\"The figures are exact, aligned, and deeply unsettling. Too many losses lead to too many gains.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },
  {
    id: "p5_gold_coins",
    period: 5,
    conditionType: "or",
    title: { fr: "DES PIÈCES À L'EFFIGIE DU CRÉATEUR", en: "COINS BEARING THE EFFIGY OF THE CREATOR" },
    text: { fr: "« Le visage n'étant pas connu, les graveurs ont choisi le symbole d'une main. »", en: "\"The face being unknown, the engravers chose the symbol of a hand.\"" },
    author: null
  },

  // --- Savoir actif ---
  {
    id: "p5_knowledge_academy",
    period: 5,
    conditionType: "savoir",
    title: { fr: "LE HASARD ENTRE À L'ACADÉMIE", en: "RANDOMNESS ENTERS THE ACADEMY" },
    text: { fr: "« Les savants ne demandent plus si la cité est favorisée, mais selon quelles règles. »", en: "\"The scholars no longer ask whether the city is favored, but by what rules.\"" },
    author: { fr: "Aldric, philosophe", en: "Aldric, philosopher" }
  },
  {
    id: "p5_knowledge_cycles",
    period: 5,
    conditionType: "savoir",
    title: { fr: "PREMIER MODÈLE DES CYCLES CIVIQUES", en: "FIRST MODEL OF THE CIVIC CYCLES" },
    text: { fr: "« Un ouvrage affirme que les civilisations montent, brillent, craquent, puis recommencent autrement. Il est interdit, et donc très lu. »", en: "\"A work claims that civilizations rise, shine, crack, then begin again differently. It is banned, and therefore widely read.\"" },
    author: null
  },
  {
    id: "p5_knowledge_rescues",
    period: 5,
    conditionType: "savoir",
    title: { fr: "LES SAUVETAGES TROP RESSEMBLANTS", en: "THE RESCUES THAT LOOK TOO ALIKE" },
    text: { fr: "« Quand tout menace de tomber, quelque chose arrive : une réforme, une récolte, une idée. Et quand ça finit par tomber… »", en: "\"When everything threatens to fall, something arrives: a reform, a harvest, an idea. And when it finally does fall…\"" },
    author: { fr: "Raphaël, habitant", en: "Raphaël, resident" }
  },
  {
    id: "p5_knowledge_medicine",
    period: 5,
    conditionType: "savoir",
    title: { fr: "LA MÉDECINE PROGRESSE", en: "MEDICINE PROGRESSES" },
    text: { fr: "« Les fièvres reculent, les prises en charge s'accélèrent, les remèdes circulent, et la population ne dit plus \"doigt de pied\" mais bien \"orteil\". »", en: "\"Fevers recede, care quickens, remedies circulate, and the population no longer says \\\"foot finger\\\" but properly \\\"toe\\\".\"" },
    author: null
  },

  // --- Jalons (Bonus) ---
  {
    id: "p5_bonus_start",
    period: 5,
    conditionType: "stage_start",
    title: { fr: "UN ÂGE NOUVEAU, ENCORE IMPRIMÉ EN GRAND", en: "A NEW AGE, ONCE AGAIN PRINTED LARGE" },
    text: { fr: "« Les affiches promettent un nouveau départ. Pourquoi serait-il différent cette fois-ci ? »", en: "\"The posters promise a fresh start. Why would it be different this time?\"" },
    author: null
  },
  {
    id: "p5_bonus_stage6",
    period: 5,
    conditionType: "stage_6",
    title: { fr: "LES ROUTES DESSINENT UNE INTENTION", en: "THE ROADS TRACE AN INTENTION" },
    text: { fr: "« Vues depuis les collines, les routes semblent former un réseau trop cohérent. Les ingénieurs prennent le compliment prudemment. »", en: "\"Seen from the hills, the roads seem to form a network too coherent. The engineers accept the compliment cautiously.\"" },
    author: null
  },
  {
    id: "p5_bonus_stage12",
    period: 5,
    conditionType: "stage_12",
    title: { fr: "L'EMPIRE SE CROIT DURABLE", en: "THE EMPIRE BELIEVES ITSELF ENDURING" },
    text: { fr: "« Les cartes couvrent les murs, les frontières avancent et les ministres parlent d'éternité tandis que les historiens regardent leurs pieds. »", en: "\"Maps cover the walls, the borders advance, and the ministers speak of eternity while the historians stare at their feet.\"" },
    author: null
  },
  {
    id: "p5_bonus_pop100m",
    period: 5,
    conditionType: "pop_100m",
    title: { fr: "LA CAPITALE DÉBORDE DE SES MURS", en: "THE CAPITAL SPILLS BEYOND ITS WALLS" },
    text: { fr: "« On construit au-delà des portes, puis au-delà des nouveaux murs. La ville ne grandit plus : elle déborde. »", en: "\"They build beyond the gates, then beyond the new walls. The city no longer grows: it overflows.\"" },
    author: null
  },
  {
    id: "p5_bonus_peace1",
    period: 5,
    conditionType: "paix",
    title: { fr: "LA PAIX PROLONGÉE TROUBLE LES STRATÈGES", en: "PROLONGED PEACE TROUBLES THE STRATEGISTS" },
    text: { fr: "« Les généraux organisent des simulations de guerre pour ne pas perdre la main. Certains demandent à perdre moins fort. »", en: "\"The generals run war simulations so as not to lose their touch. Some ask to lose less badly.\"" },
    author: null
  },
  {
    id: "p5_bonus_peace2",
    period: 5,
    conditionType: "paix",
    title: { fr: "TOUT VA BIEN", en: "ALL IS WELL" },
    text: { fr: "« La prospérité dure et les enfants n'ont jamais connu la famine. Les adultes trouvent cela rassurant, mais anormal. »", en: "\"Prosperity endures and the children have never known famine. The adults find it reassuring, but abnormal.\"" },
    author: null
  },
  {
    id: "p5_bonus_maps",
    period: 5,
    conditionType: "bonus_libre",
    title: { fr: "LES ENFANTS INVENTENT DES CARTES DU MONDE", en: "THE CHILDREN INVENT MAPS OF THE WORLD" },
    text: { fr: "« Dans les écoles, une mode étrange se répand : dessiner les terres inconnues au-delà des frontières. Certaines cartes se ressemblent sans que leurs auteurs se soient jamais rencontrés. »", en: "\"In the schools, a strange fashion spreads: drawing the unknown lands beyond the borders. Some maps resemble one another though their authors have never met.\"" },
    author: null
  },

];
