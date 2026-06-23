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
    title: "LA CRISE ÉTAIT PRÉVISIBLE, DONC PERSONNE N'A PRÉVU",
    text: "« Les signes étaient là : greniers vides, colère haute, routes coupées. Le gouvernement promet d'étudier pourquoi il n'a rien étudié. »",
    author: null
  },
  {
    id: "p5_crisis_riots",
    period: 5,
    conditionType: "crise",
    title: "LES ÉMEUTES GAGNENT LES QUARTIERS RICHES",
    text: "« Les milices affirment que la situation est sous contrôle. Les quartiers riches affirment que les milices sont trop loin. »",
    author: "Renaud, citoyen"
  },
  {
    id: "p5_crisis_fire",
    period: 5,
    conditionType: "crise",
    title: "LE GRAND INCENDIE DÉTRUIT TROIS DISTRICTS",
    text: "« Les flammes ont tout pris en une nuit. Dès l'aube, des plans de reconstruction étaient déjà prêts, comme s'ils attendaient. »",
    author: null
  },
  {
    id: "p5_crisis_guardian",
    period: 5,
    conditionType: "crise",
    title: "LE GARDIEN DU FEU NOUS INTERPELLE",
    text: "« Le feu sacré vacille, les fidèles paniquent, les prêtres improvisent. J'ai déjà vu ce genre de nuit. »",
    author: "Claude, gardien du feu"
  },

  // --- Tension élevée (0.5 <= instability < 0.75) ---
  {
    id: "p5_tension_who_decides",
    period: 5,
    conditionType: "tension",
    title: "LE PEUPLE SE DEMANDE QUI DÉCIDE VRAIMENT",
    text: "« Le roi désigne le conseil, le conseil désigne les prêtres, les prêtres désignent le ciel. Le ciel ne répond pas. Il va falloir du changement. »",
    author: null
  },
  {
    id: "p5_tension_tax_print",
    period: 5,
    conditionType: "tension",
    title: "NOUVELLE TAXE SUR LES TEXTES IMPRIMÉS",
    text: "« Lire rend critique. Le Trésor trouve prudent de rendre la critique payante. »",
    author: "Edith, comptable"
  },
  {
    id: "p5_tension_cult_split",
    period: 5,
    conditionType: "tension",
    title: "LE CULTE SE DIVISE EN TROIS BRANCHES",
    text: "« Les uns disent qu'il nous guide. Les autres qu'il nous teste. Les derniers qu'il attend. Personne ne sait ce que cela veut dire. »",
    author: null
  },
  {
    id: "p5_tension_march",
    period: 5,
    conditionType: "tension",
    title: "UNE GRANDE MARCHE POUR PLUS DE HASARD",
    text: "« Les citoyens réclament des récoltes normales, des crises normales, et quelques années qui ne ressemblent pas à un plan. »",
    author: null
  },

  // --- Usure élevée (0.5 <= timeWear < 0.75) ---
  {
    id: "p5_wear_streets",
    period: 5,
    conditionType: "usure",
    title: "LES RUES NE PORTENT PLUS LEUR NOM D'ORIGINE",
    text: "« La cité se laisse aller. On renomme les lieux d'après ce qu'ils remplacent ; ainsi, l'ancienne place du marché est maintenant l'ancienne ancienne place. »",
    author: null
  },
  {
    id: "p5_wear_old_papers",
    period: 5,
    conditionType: "usure",
    title: "LES ANCIENS JOURNAUX RACONTENT LA MÊME CHOSE",
    text: "« Famine, prospérité, guerre, miracle, chute, reconstruction. Les dates changent. Le ton, très peu. »",
    author: "Edith, comptable"
  },
  {
    id: "p5_wear_past_politics",
    period: 5,
    conditionType: "usure",
    title: "LE PASSÉ DEVIENT UN ARGUMENT POLITIQUE",
    text: "« Chaque faction affirme que l'histoire lui donne raison. L'histoire, elle, semble surtout fatiguée. »",
    author: null
  },

  // --- Nourriture dominante ---
  {
    id: "p5_food_harvest",
    period: 5,
    conditionType: "nourriture",
    title: "LES RÉCOLTES DÉPASSENT LES PRÉVISIONS",
    text: "« Les agronomes avaient prévu une bonne année. Elle l'est davantage. »",
    author: null
  },
  {
    id: "p5_food_bread",
    period: 5,
    conditionType: "nourriture",
    title: "DU PAIN POUR TOUS, MÊME POUR LES DOUTES",
    text: "« Les boulangeries ne désemplissent pas et les files sont calmes. On y parle beaucoup de Celui qui veille, et du prix de la farine. »",
    author: null
  },
  {
    id: "p5_food_export",
    period: 5,
    conditionType: "nourriture",
    title: "EXPORTATION MASSIVE DE BLÉ",
    text: "« La cité nourrit ses alliés, mais aussi ses rivaux. L'intendance appelle cela de la diplomatie comestible. »",
    author: "Nessa, marchande"
  },
  {
    id: "p5_food_peasants",
    period: 5,
    conditionType: "nourriture",
    title: "LES PAYSANS NE CROIENT PLUS AUX COÏNCIDENCES",
    text: "« Semer, attendre, récolter : voilà leur métier. Mais certains jurent que les saisons obéissent à un rythme qui n'est pas le leur. »",
    author: null
  },

  // --- Or dominant ---
  {
    id: "p5_gold_speed",
    period: 5,
    conditionType: "or",
    title: "L'OR CIRCULE PLUS VITE QUE LES DÉCRETS",
    text: "« Les banques ouvrent avant les temples et ferment après les tribunaux. Khael trouve cela pratique. »",
    author: "Khael, juge autoproclamé"
  },
  {
    id: "p5_gold_suspicious",
    period: 5,
    conditionType: "or",
    title: "LA PROSPÉRITÉ DEVIENT SUSPECTE",
    text: "« Chaque crise finit par remplir les coffres de quelqu'un. Le peuple se demande si les anciens effondrements ne profitaient pas déjà à certains. »",
    author: null
  },
  {
    id: "p5_gold_accounts",
    period: 5,
    conditionType: "or",
    title: "EDITH PUBLIE LES COMPTES DU ROYAUME",
    text: "« Les chiffres sont exacts, alignés et profondément inquiétants. Trop de pertes mènent à trop de gains. »",
    author: "Edith, comptable"
  },
  {
    id: "p5_gold_coins",
    period: 5,
    conditionType: "or",
    title: "DES PIÈCES À L'EFFIGIE DU CRÉATEUR",
    text: "« Le visage n'étant pas connu, les graveurs ont choisi le symbole d'une main. »",
    author: null
  },

  // --- Savoir actif ---
  {
    id: "p5_knowledge_academy",
    period: 5,
    conditionType: "savoir",
    title: "LE HASARD ENTRE À L'ACADÉMIE",
    text: "« Les savants ne demandent plus si la cité est favorisée, mais selon quelles règles. »",
    author: "Aldric, philosophe"
  },
  {
    id: "p5_knowledge_cycles",
    period: 5,
    conditionType: "savoir",
    title: "PREMIER MODÈLE DES CYCLES CIVIQUES",
    text: "« Un ouvrage affirme que les civilisations montent, brillent, craquent, puis recommencent autrement. Il est interdit, et donc très lu. »",
    author: null
  },
  {
    id: "p5_knowledge_rescues",
    period: 5,
    conditionType: "savoir",
    title: "LES SAUVETAGES TROP RESSEMBLANTS",
    text: "« Quand tout menace de tomber, quelque chose arrive : une réforme, une récolte, une idée. Et quand ça finit par tomber… »",
    author: "Raphaël, habitant"
  },
  {
    id: "p5_knowledge_medicine",
    period: 5,
    conditionType: "savoir",
    title: "LA MÉDECINE PROGRESSE",
    text: "« Les fièvres reculent, les prises en charge s'accélèrent, les remèdes circulent, et la population ne dit plus \"doigt de pied\" mais bien \"orteil\". »",
    author: null
  },

  // --- Jalons (Bonus) ---
  {
    id: "p5_bonus_start",
    period: 5,
    conditionType: "stage_start",
    title: "UN ÂGE NOUVEAU, ENCORE IMPRIMÉ EN GRAND",
    text: "« Les affiches promettent un nouveau départ. Pourquoi serait-il différent cette fois-ci ? »",
    author: null
  },
  {
    id: "p5_bonus_stage6",
    period: 5,
    conditionType: "stage_6",
    title: "LES ROUTES DESSINENT UNE INTENTION",
    text: "« Vues depuis les collines, les routes semblent former un réseau trop cohérent. Les ingénieurs prennent le compliment prudemment. »",
    author: null
  },
  {
    id: "p5_bonus_stage12",
    period: 5,
    conditionType: "stage_12",
    title: "L'EMPIRE SE CROIT DURABLE",
    text: "« Les cartes couvrent les murs, les frontières avancent et les ministres parlent d'éternité tandis que les historiens regardent leurs pieds. »",
    author: null
  },
  {
    id: "p5_bonus_pop100m",
    period: 5,
    conditionType: "pop_100m",
    title: "LA CAPITALE DÉBORDE DE SES MURS",
    text: "« On construit au-delà des portes, puis au-delà des nouveaux murs. La ville ne grandit plus : elle déborde. »",
    author: null
  },
  {
    id: "p5_bonus_peace1",
    period: 5,
    conditionType: "paix",
    title: "LA PAIX PROLONGÉE TROUBLE LES STRATÈGES",
    text: "« Les généraux organisent des simulations de guerre pour ne pas perdre la main. Certains demandent à perdre moins fort. »",
    author: null
  },
  {
    id: "p5_bonus_peace2",
    period: 5,
    conditionType: "paix",
    title: "TOUT VA BIEN",
    text: "« La prospérité dure et les enfants n'ont jamais connu la famine. Les adultes trouvent cela rassurant, mais anormal. »",
    author: null
  },
  {
    id: "p5_bonus_maps",
    period: 5,
    conditionType: "bonus_libre",
    title: "LES ENFANTS INVENTENT DES CARTES DU MONDE",
    text: "« Dans les écoles, une mode étrange se répand : dessiner les terres inconnues au-delà des frontières. Certaines cartes se ressemblent sans que leurs auteurs se soient jamais rencontrés. »",
    author: null
  },

];
