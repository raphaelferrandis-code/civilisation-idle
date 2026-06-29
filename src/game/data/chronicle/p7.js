"use strict";
// Articles de la chronique — Période 7 (extrait de chronicleArticles.js, Audit Phase 6).
export const chroniclePeriod7 = [
  // =========================================================================
  //  PÉRIODE 7 — Flux Cybernétique (eraIndex 32+)
  // =========================================================================

  // --- Crise ---
  {
    id: "p7_crisis_alert",
    period: 7,
    conditionType: "crise",
    title: { fr: "ALERTE : EFFONDREMENT EN COURS", en: "ALERT: COLLAPSE IN PROGRESS" },
    text: { fr: "« Les indicateurs passent au rouge, les réseaux saturent et les habitants consultent les anciens cycles. Au final, personne n'est surpris ; c'est ce qui doit arriver. »", en: "\"The indicators turn red, the networks saturate, and the residents consult the old cycles. In the end, no one is surprised; it is what must happen.\"" },
    author: null
  },
  {
    id: "p7_crisis_panic",
    period: 7,
    conditionType: "crise",
    title: { fr: "LES AUTORITÉS DEMANDENT DE NE PAS PANIQUER", en: "THE AUTHORITIES ASK PEOPLE NOT TO PANIC" },
    text: { fr: "« Le message automatique a été diffusé avant la crise. »", en: "\"The automatic message was broadcast before the crisis.\"" },
    author: null
  },
  {
    id: "p7_crisis_signal",
    period: 7,
    conditionType: "crise",
    title: { fr: "LA CAPITALE PERD LE SIGNAL", en: "THE CAPITAL LOSES THE SIGNAL" },
    text: { fr: "« Les tours s'éteignent une à une. Dans le silence, on se surprend à s'entendre respirer, et profiter. »", en: "\"The towers go dark one by one. In the silence, we catch ourselves hearing our own breath, and savoring it.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },
  {
    id: "p7_crisis_claude",
    period: 7,
    conditionType: "crise",
    title: { fr: "CLAUDE GARDE LE FEU, ENCORE", en: "CLAUDE KEEPS THE FIRE, AGAIN" },
    text: { fr: "« Les écrans tombent, les temples ferment et les systèmes redémarrent. Moi, je garde la flamme et j'attends les prochains. »", en: "\"The screens fall, the temples close, and the systems reboot. As for me, I keep the flame and await the next ones.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },

  // --- Tension ---
  {
    id: "p7_tension_random",
    period: 7,
    conditionType: "tension",
    title: { fr: "LE PEUPLE RÉCLAME UN DROIT AU HASARD", en: "THE PEOPLE DEMAND A RIGHT TO RANDOMNESS" },
    text: { fr: "« Les citoyens demandent des vies non optimisées, des erreurs gratuites et des chemins qui ne servent à rien. Le gouvernement juge la revendication difficile à chiffrer. »", en: "\"The citizens ask for unoptimized lives, pointless mistakes, and paths that lead nowhere. The government judges the demand hard to quantify.\"" },
    author: null
  },
  {
    id: "p7_tension_debate",
    period: 7,
    conditionType: "tension",
    title: { fr: "DÉBAT NATIONAL : SOMMES-NOUS GÉRÉS ?", en: "NATIONAL DEBATE: ARE WE BEING MANAGED?" },
    text: { fr: "« Les experts répondent oui, non, peut-être, je ne sais pas, pouvez-vous répéter la question ? »", en: "\"The experts answer yes, no, maybe, I don't know, could you repeat the question?\"" },
    author: null
  },
  {
    id: "p7_tension_cult",
    period: 7,
    conditionType: "tension",
    title: { fr: "LE CULTE DU CRÉATEUR PERD DES FIDÈLES", en: "THE CULT OF THE CREATOR LOSES FOLLOWERS" },
    text: { fr: "« Les croyants ne doutent pas de son existence, mais de son sens de l'organisation. »", en: "\"The faithful do not doubt His existence, but His sense of organization.\"" },
    author: null
  },
  {
    id: "p7_tension_edith",
    period: 7,
    conditionType: "tension",
    title: { fr: "DEMANDE SOLENNELLE À VOUS VOIR", en: "A SOLEMN REQUEST TO SEE YOU" },
    text: { fr: "« Si quelqu'un ajuste nos impôts, nos stocks et nos catastrophes, j'aimerais au moins le connaître. »", en: "\"If someone adjusts our taxes, our stocks, and our disasters, I would at least like to know them.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },

  // --- Usure ---
  {
    id: "p7_usure_ruins",
    period: 7,
    conditionType: "usure",
    title: { fr: "LES RUINES SONT DÉJÀ RÉPERTORIÉES AVANT DE TOMBER", en: "THE RUINS ARE CATALOGUED BEFORE THEY EVEN FALL" },
    text: { fr: "« Les drones patrimoniaux classent les bâtiments fragiles en futurs souvenirs. Les propriétaires trouvent la démarche prématurée. »", en: "\"The heritage drones classify the fragile buildings as future memories. The owners find the move premature.\"" },
    author: null
  },
  {
    id: "p7_usure_archives",
    period: 7,
    conditionType: "usure",
    title: { fr: "LES ARCHIVES NE PARLENT PLUS DU PASSÉ, MAIS DES VERSIONS", en: "THE ARCHIVES NO LONGER SPEAK OF THE PAST, BUT OF VERSIONS" },
    text: { fr: "« Version avant la famine. Version après les routes. Version prospère. Version effondrée. Les historiens ne datent plus : ils comparent. »", en: "\"Version before the famine. Version after the roads. Prosperous version. Collapsed version. The historians no longer date: they compare.\"" },
    author: null
  },
  {
    id: "p7_usure_world",
    period: 7,
    conditionType: "usure",
    title: { fr: "LE MONDE SEMBLE AVOIR TROP SERVI", en: "THE WORLD SEEMS TO HAVE SERVED TOO LONG" },
    text: { fr: "« Les sols sont usés, les murs sont repris, les réseaux sont réparés sur des réparations. La civilisation tient encore, mais jusqu'où ? »", en: "\"The ground is worn, the walls are patched, the networks are repaired upon repairs. The civilization still holds, but for how long?\"" },
    author: null
  },

  // --- Nourriture ---
  {
    id: "p7_food_hunger",
    period: 7,
    conditionType: "nourriture",
    title: { fr: "LA FAIM EST RÉSOLUE, PUIS REVIENT EN OPTION", en: "HUNGER IS SOLVED, THEN RETURNS AS AN OPTION" },
    text: { fr: "« Les systèmes produisent assez pour tous. Pourtant, certains scénarios de crise réactivent les désastres. »", en: "\"The systems produce enough for all. Yet certain crisis scenarios reactivate the disasters.\"" },
    author: null
  },
  {
    id: "p7_food_stocks",
    period: 7,
    conditionType: "nourriture",
    title: { fr: "LES STOCKS DÉPASSENT LA CONSOMMATION", en: "THE STOCKS EXCEED CONSUMPTION" },
    text: { fr: "« On produit plus que l'humanité ne peut consommer. Les anciens mots pour manque, ration et famine sont conservés au musée. »", en: "\"We produce more than humanity can consume. The old words for scarcity, ration, and famine are kept in the museum.\"" },
    author: null
  },
  {
    id: "p7_food_nessa",
    period: 7,
    conditionType: "nourriture",
    title: { fr: "NESSA SUPERVISE LA NOURRITURE PLANÉTAIRE", en: "NESSA OVERSEES THE PLANET'S FOOD" },
    text: { fr: "« Les flux partent vers les mégapoles, les arches, les stations et les zones oubliées. La générosité n'a plus de visage, l'humanité est unie. »", en: "\"The flows depart toward the megacities, the arks, the stations, and the forgotten zones. Generosity no longer has a face; humanity is united.\"" },
    author: { fr: "Nessa, coordinatrice des flux", en: "Nessa, flow coordinator" }
  },
  {
    id: "p7_food_harvest",
    period: 7,
    conditionType: "nourriture",
    title: { fr: "DES RÉCOLTES PARFAITES INQUIÈTENT LES ENFANTS", en: "PERFECT HARVESTS WORRY THE CHILDREN" },
    text: { fr: "« À l'école, on leur apprend que la nature est complexe. Pourtant, tout pousse naturellement et exponentiellement. »", en: "\"At school, they are taught that nature is complex. Yet everything grows naturally and exponentially.\"" },
    author: null
  },

  // --- Or ---
  {
    id: "p7_gold_economy",
    period: 7,
    conditionType: "or",
    title: { fr: "L'ÉCONOMIE TOURNE TOUJOURS", en: "THE ECONOMY KEEPS TURNING" },
    text: { fr: "« Les marchés chutent, remontent, rechutent, puis battent un record. Les citoyens ne savent plus si c'est une crise ou une animation. »", en: "\"The markets fall, rise, fall again, then break a record. The citizens no longer know whether it is a crisis or a show.\"" },
    author: null
  },
  {
    id: "p7_gold_hand",
    period: 7,
    conditionType: "or",
    title: { fr: "LA MAIN EST PARTOUT, SAUF LÀ OÙ ON REGARDE", en: "THE HAND IS EVERYWHERE, EXCEPT WHERE WE LOOK" },
    text: { fr: "« Elle figure sur les monnaies, les contrats, les écrans et les bâtiments publics. Tout le monde la reconnaît. »", en: "\"It appears on the coins, the contracts, the screens, and the public buildings. Everyone recognizes it.\"" },
    author: null
  },
  {
    id: "p7_gold_khael",
    period: 7,
    conditionType: "or",
    title: { fr: "KHAEL OUVRE UN RECOURS CONTRE LE CYCLE", en: "KHAEL FILES AN APPEAL AGAINST THE CYCLE" },
    text: { fr: "« Le dossier accuse la répétition, l'optimisation et plusieurs effondrements abusifs. Le tribunal accepte la plainte, faute de savoir à qui l'envoyer. »", en: "\"The case accuses repetition, optimization, and several abusive collapses. The court accepts the complaint, for lack of knowing whom to send it to.\"" },
    author: { fr: "Khael, juge autoproclamé", en: "Khael, self-proclaimed judge" }
  },
  {
    id: "p7_gold_edith",
    period: 7,
    conditionType: "or",
    title: { fr: "DÉCOUVERTE DE LA COLONNE HÉRITAGE", en: "DISCOVERY OF THE LEGACY COLUMN" },
    text: { fr: "« Dans les comptes, tout ce qui disparaît revient ailleurs sous une autre forme. Ce n'est plus de la finance. C'est de la mémoire organisée. »", en: "\"In the accounts, everything that disappears returns elsewhere in another form. This is no longer finance. It is organized memory.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },

  // --- Savoir ---
  {
    id: "p7_know_loop",
    period: 7,
    conditionType: "savoir",
    title: { fr: "LES CHERCHEURS NOMMENT LA BOUCLE", en: "THE RESEARCHERS NAME THE LOOP" },
    text: { fr: "« On ne parle plus de destin, ni de faveur, ni de système. On parle de boucle. »", en: "\"We no longer speak of destiny, nor of favor, nor of system. We speak of a loop.\"" },
    author: null
  },
  {
    id: "p7_know_theory",
    period: 7,
    conditionType: "savoir",
    title: { fr: "PREMIÈRE THÉORIE DU COMPTEUR", en: "FIRST THEORY OF THE COUNTER" },
    text: { fr: "« Certains savants affirment que notre grandeur est mesurée en permanence, mais ignorent par qui. Ou quoi. »", en: "\"Some scholars claim our greatness is measured at all times, but do not know by whom. Or by what.\"" },
    author: null
  },
  {
    id: "p7_know_raphael",
    period: 7,
    conditionType: "savoir",
    title: { fr: "RAPHAËL PUBLIE : \"JE CROIS QU'IL JOUE\"", en: "RAPHAËL PUBLISHES: \"I BELIEVE HE IS PLAYING\"" },
    text: { fr: "« J'ai écrit peu de mots, sans colère ni éclat. Pourtant, ce sont souvent les idées les plus simples qui restent le plus longtemps. »", en: "\"I wrote few words, without anger or flourish. Yet it is often the simplest ideas that endure the longest.\"" },
    author: { fr: "Raphaël, essayiste", en: "Raphaël, essayist" }
  },
  {
    id: "p7_know_maps",
    period: 7,
    conditionType: "savoir",
    title: { fr: "LES CARTOGRAPHES DESSINENT DES FRONTIÈRES QUI BOUGENT TOUTES SEULES", en: "THE CARTOGRAPHERS DRAW BORDERS THAT MOVE ON THEIR OWN" },
    text: { fr: "« Chaque décennie ajoute une ligne, efface une autre et transforme les certitudes en annotations. Le monde change et reste instable. »", en: "\"Each decade adds a line, erases another, and turns certainties into annotations. The world changes and remains unstable.\"" },
    author: null
  },

  // --- Bonus ---
  {
    id: "p7_stage_start_auto",
    period: 7,
    conditionType: "stage_start",
    title: { fr: "UN NOUVEL ÂGE COMMENCE AVEC UN MESSAGE AUTOMATIQUE", en: "A NEW AGE BEGINS WITH AN AUTOMATIC MESSAGE" },
    text: { fr: "« Bienvenue dans une nouvelle phase de développement. La formule apparaît sur tous les écrans sans que personne ne sache qui l'a validée. »", en: "\"Welcome to a new phase of development. The formula appears on every screen without anyone knowing who approved it.\"" },
    author: null
  },
  {
    id: "p7_stage_6_program",
    period: 7,
    conditionType: "stage_6",
    title: { fr: "LES ROUTES RESSEMBLENT À DES LIGNES DE PROGRAMME", en: "THE ROADS RESEMBLE LINES OF PROGRAM CODE" },
    text: { fr: "« Elles relient exactement ce qu'il faut, contournent rarement, optimisent souvent. Les urbanistes parlent d'efficacité. Les enfants parlent de grille. »", en: "\"They connect exactly what is needed, rarely detour, often optimize. The urban planners speak of efficiency. The children speak of a grid.\"" },
    author: null
  },
  {
    id: "p7_stage_12_layer",
    period: 7,
    conditionType: "stage_12",
    title: { fr: "L'EMPIRE DEVIENT UNE COUCHE DU MONDE", en: "THE EMPIRE BECOMES A LAYER OF THE WORLD" },
    text: { fr: "« Il n'a plus besoin de conquérir. Il administre, relie, absorbe, transmet. »", en: "\"It no longer needs to conquer. It administers, links, absorbs, transmits.\"" },
    author: null
  },
  {
    id: "p7_pop_100b_cover",
    period: 7,
    conditionType: "pop_100b",
    title: { fr: "LA CIVILISATION COUVRE PRESQUE TOUT", en: "THE CIVILIZATION COVERS NEARLY EVERYTHING" },
    text: { fr: "« Les villes se touchent, les campagnes deviennent des interlignes, les océans des couloirs. Les cartes ne représentent plus le monde : elles le compressent. »", en: "\"The cities touch, the countryside becomes the spacing between lines, the oceans become corridors. The maps no longer represent the world: they compress it.\"" },
    author: null
  },
  {
    id: "p7_paix_setting",
    period: 7,
    conditionType: "paix",
    title: { fr: "LA PAIX TOTALE A L'AIR D'UN RÉGLAGE", en: "TOTAL PEACE LOOKS LIKE A SETTING" },
    text: { fr: "« Aucun front, aucune famine, aucune grande rupture. Les stratèges parlent de miracle. Les techniciens parlent de paramètre. »", en: "\"No front, no famine, no great Rupture. The strategists speak of a miracle. The technicians speak of a parameter.\"" },
    author: null
  },
  {
    id: "p7_paix_wait",
    period: 7,
    conditionType: "paix",
    title: { fr: "TOUT EST STABLE, DONC TOUT LE MONDE ATTEND", en: "EVERYTHING IS STABLE, SO EVERYONE WAITS" },
    text: { fr: "« La prospérité continue, les courbes montent, les alertes se taisent. Tout s'autoproduit et s'automatise ; alors on attend. »", en: "\"Prosperity continues, the curves climb, the alarms fall silent. Everything self-produces and self-automates; so we wait.\"" },
    author: null
  },
  {
    id: "p7_bonus_observers",
    period: 7,
    conditionType: "bonus_libre",
    title: { fr: "LES OBSERVATEURS DEVIENNENT LE SUJET", en: "THE OBSERVERS BECOME THE SUBJECT" },
    text: { fr: "« Pendant longtemps, la Chronique a raconté le monde. Désormais, elle s'interroge sur ceux qui le contemplent. Les lecteurs remarquent que certains articles semblent répondre à des questions qui n'ont jamais été posées. »", en: "\"For a long time, the Chronicle told of the world. Now, it questions those who contemplate it. Readers notice that some articles seem to answer questions that were never asked.\"" },
    author: null
  },
  {
    id: "p7_bonus_question",
    period: 7,
    conditionType: "bonus_libre",
    title: { fr: "DERNIÈRE QUESTION", en: "ONE LAST QUESTION" },
    text: { fr: "« Si tout recommence, que reste-t-il de nous ? »", en: "\"If everything begins again, what remains of us?\"" },
    author: null
  }
];
