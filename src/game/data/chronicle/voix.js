"use strict";
// Articles de la chronique — LA VOIX (docs/PLAN-ECOUTER-PARLER.md, lot 6).
// Dès la période 3, le joueur parle aux passants, de quatre voix (le joueur, le dieu,
// l'indifférent, celui qui demande des nouvelles). Quand l'une d'elles domine dans la cité
// (trois échanges au moins, le silence ne compte pas : chronicleEvaluator, `voix_*`), la
// gazette en parle, et le nom qu'elle donne au joueur suit sa voix (parolesToi.js,
// NOMS_DU_JOUEUR) : le Maître, le Joueur, le Passant, le Voisin d'en haut.
export const chronicleVoix = [
  // =========================================================================
  //  PÉRIODE 3 — une voix, pour la première fois
  // =========================================================================
  {
    id: "p3_voix_dieu",
    period: 3,
    conditionType: "voix_dieu",
    title: { fr: "UNE VOIX D'EN HAUT DONNE DES ORDRES", en: "A VOICE FROM ABOVE GIVES ORDERS" },
    text: { fr: "« Plusieurs habitants affirment qu'une voix leur a parlé depuis le ciel, sur le ton d'un chef de clan. Le chef de clan demande qui lui a pris son ton. »", en: "\"Several residents say a voice spoke to them from the sky, in the tone of a clan chief. The clan chief wants to know who took his tone.\"" },
    author: { fr: "Garin, forgeron", en: "Garin, blacksmith" }
  },
  {
    id: "p3_voix_joueur",
    period: 3,
    conditionType: "voix_joueur",
    title: { fr: "LA VOIX DIT QU'ELLE JOUE", en: "THE VOICE SAYS IT IS PLAYING" },
    text: { fr: "« Une voix venue de nulle part affirme jouer avec nous. Les enfants demandent à quoi. Les anciens demandent qui a commencé. »", en: "\"A voice from nowhere claims to be playing with us. The children ask at what. The elders ask who started it.\"" },
    author: { fr: "Raphaël, habitant", en: "Raphaël, citizen" }
  },
  {
    id: "p3_voix_indifferent",
    period: 3,
    conditionType: "voix_indifferent",
    title: { fr: "LA VOIX N'A PAS D'AVIS", en: "THE VOICE HAS NO OPINION" },
    text: { fr: "« Interrogée sur ses intentions, la voix a répondu que cela importait peu. Le village a repris le travail, un peu vexé. »", en: "\"Asked about its intentions, the voice replied that it hardly mattered. The village went back to work, slightly offended.\"" },
    author: null
  },
  {
    id: "p3_voix_vie",
    period: 3,
    conditionType: "voix_vie",
    title: { fr: "LA VOIX DEMANDE DES NOUVELLES", en: "THE VOICE ASKS AFTER US" },
    text: { fr: "« La voix connaît le prénom des enfants et s'inquiète de leurs toux. Les mères n'osent plus gronder dans la rue. »", en: "\"The voice knows the children's names and worries about their coughs. Mothers no longer dare to scold in the street.\"" },
    author: { fr: "Nessa, marchande", en: "Nessa, merchant" }
  },

  // =========================================================================
  //  PÉRIODE 4 — le Créateur, Celui qui nous guide, Celui qui regarde
  // =========================================================================
  {
    id: "p4_voix_dieu",
    period: 4,
    conditionType: "voix_dieu",
    title: { fr: "LA VOIX PARLE EN MAÎTRE", en: "THE VOICE SPEAKS LIKE A MASTER" },
    text: { fr: "« La voix affirme avoir bâti la cité. Les maçons de la guilde demandent à être payés en conséquence. »", en: "\"The voice claims to have built the city. The guild masons ask to be paid accordingly.\"" },
    author: { fr: "Edith, Intendante", en: "Edith, Steward" }
  },
  {
    id: "p4_voix_joueur",
    period: 4,
    conditionType: "voix_joueur",
    title: { fr: "LES TAVERNES DOUBLENT LES MISES", en: "THE TAVERNS DOUBLE THE STAKES" },
    text: { fr: "« Depuis qu'une voix céleste a parlé de partie, on joue gros à l'auberge. Le temple désapprouve, et mise aussi. »", en: "\"Since a heavenly voice mentioned a game, the inns have been playing for high stakes. The temple disapproves, and bets as well.\"" },
    author: { fr: "Renaud, contribuable", en: "Renaud, taxpayer" }
  },
  {
    id: "p4_voix_indifferent",
    period: 4,
    conditionType: "voix_indifferent",
    title: { fr: "LE CIEL S'EN MOQUE", en: "HEAVEN DOES NOT CARE" },
    text: { fr: "« La voix a répondu à un charpentier que rien de tout cela n'importait. Le conseil a décrété trois jours de deuil, puis s'est ravisé. »", en: "\"The voice told a carpenter that none of this mattered. The council declared three days of mourning, then thought better of it.\"" },
    author: { fr: "Khael, juge autoproclamé", en: "Khael, self-proclaimed judge" }
  },
  {
    id: "p4_voix_vie",
    period: 4,
    conditionType: "voix_vie",
    title: { fr: "LE VOISIN D'EN HAUT", en: "THE NEIGHBOUR UPSTAIRS" },
    text: { fr: "« La voix prend des nouvelles des malades et des enfants. Le médecin se plaint qu'on la consulte avant lui. »", en: "\"The voice asks after the sick and the children. The physician complains that people consult it before him.\"" },
    author: null
  },

  // =========================================================================
  //  PÉRIODE 5 — le schisme, la Main
  // =========================================================================
  {
    id: "p5_voix_dieu",
    period: 5,
    conditionType: "voix_dieu",
    title: { fr: "LA VOIX VEILLE, LE PORTEUR D'EAU NÉGOCIE", en: "THE VOICE WATCHES, THE WATER CARRIER NEGOTIATES" },
    text: { fr: "« La voix a rappelé à un porteur d'eau qu'elle veillait sur nous. Le porteur d'eau a demandé une augmentation. »", en: "\"The voice reminded a water carrier that it watches over us. The water carrier asked for a raise.\"" },
    author: { fr: "Renaud, citoyen", en: "Renaud, citizen" }
  },
  {
    id: "p5_voix_joueur",
    period: 5,
    conditionType: "voix_joueur",
    title: { fr: "UNE PARTIE EN COURS", en: "A GAME IN PROGRESS" },
    text: { fr: "« La voix parle de nous comme d'une partie. Les bookmakers ouvrent les paris sur la suite. »", en: "\"The voice talks about us as a game. The bookmakers are taking bets on what comes next.\"" },
    author: null
  },
  {
    id: "p5_voix_indifferent",
    period: 5,
    conditionType: "voix_indifferent",
    title: { fr: "LA VOIX NE FAIT QUE PASSER", en: "THE VOICE IS ONLY PASSING THROUGH" },
    text: { fr: "« Selon plusieurs témoins, la voix ne fait que passer. Les aubergistes lui proposent une chambre. »", en: "\"According to several witnesses, the voice is only passing through. The innkeepers are offering it a room.\"" },
    author: { fr: "Nessa, marchande", en: "Nessa, merchant" }
  },
  {
    id: "p5_voix_vie",
    period: 5,
    conditionType: "voix_vie",
    title: { fr: "LA VOIX S'INQUIÈTE DU PAIN", en: "THE VOICE WORRIES ABOUT BREAD" },
    text: { fr: "« Elle a demandé à une boulangère si elle avait mangé. La boulangère a fermé boutique pour y réfléchir. »", en: "\"It asked a baker whether she had eaten. The baker closed her shop to think it over.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },

  // =========================================================================
  //  PÉRIODE 6 — les partis, le logo, le procès de Khael
  // =========================================================================
  {
    id: "p6_voix_dieu",
    period: 6,
    conditionType: "voix_dieu",
    title: { fr: "LA VOIX REVENDIQUE LES TRAVAUX", en: "THE VOICE CLAIMS THE PUBLIC WORKS" },
    text: { fr: "« La voix affirme avoir construit l'usine à côté de l'école. L'association des parents demande un rendez-vous. »", en: "\"The voice claims to have built the factory next to the school. The parents' association has asked for a meeting.\"" },
    author: { fr: "Khael, juge autoproclamé", en: "Khael, self-proclaimed judge" }
  },
  {
    id: "p6_voix_joueur",
    period: 6,
    conditionType: "voix_joueur",
    title: { fr: "ADMINISTRÉS OU JOUÉS ?", en: "ADMINISTERED OR PLAYED?" },
    text: { fr: "« Après mon essai sur l'administration du monde, je prépare un second ouvrage. La voix m'a fourni le titre. »", en: "\"After my essay on the administration of the world, I am preparing a second book. The voice supplied the title.\"" },
    author: { fr: "Raphaël, essayiste", en: "Raphaël, essayist" }
  },
  {
    id: "p6_voix_indifferent",
    period: 6,
    conditionType: "voix_indifferent",
    title: { fr: "LE MINISTÈRE DÉMENT", en: "THE MINISTRY DENIES IT" },
    text: { fr: "« La voix répond à toutes les questions que cela n'a pas d'importance. Le ministère dément toute ressemblance. »", en: "\"The voice answers every question by saying it does not matter. The ministry denies any resemblance.\"" },
    author: null
  },
  {
    id: "p6_voix_vie",
    period: 6,
    conditionType: "voix_vie",
    title: { fr: "LA VOIX DEMANDE SI L'ON A BIEN DORMI", en: "THE VOICE ASKS WHETHER WE SLEPT WELL" },
    text: { fr: "« Les ventes de somnifères baissent depuis que la voix demande, la nuit, si l'on a bien dormi. Personne ne veut lui mentir. »", en: "\"Sleeping pill sales are falling since the voice started asking, at night, whether we slept well. Nobody wants to lie to it.\"" },
    author: { fr: "Nessa, directrice des échanges", en: "Nessa, director of trade" }
  },

  // =========================================================================
  //  PÉRIODE 7 — la boucle, le compteur
  // =========================================================================
  {
    id: "p7_voix_dieu",
    period: 7,
    conditionType: "voix_dieu",
    title: { fr: "LA VOIX SE DIT PROPRIÉTAIRE", en: "THE VOICE CALLS ITSELF THE OWNER" },
    text: { fr: "« La voix affirme avoir tout bâti, métro compris. Les usagers de la ligne quatre demandent des comptes. »", en: "\"The voice claims to have built everything, the metro included. Line four commuters are demanding an explanation.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },
  {
    id: "p7_voix_joueur",
    period: 7,
    conditionType: "voix_joueur",
    title: { fr: "RAPHAËL AVAIT RAISON", en: "RAPHAËL WAS RIGHT" },
    text: { fr: "« La voix l'a dit elle-même : elle joue. Raphaël a refusé toutes les interviews, il relit ses notes. »", en: "\"The voice said so itself: it is playing. Raphaël has turned down every interview, he is rereading his notes.\"" },
    author: null
  },
  {
    id: "p7_voix_indifferent",
    period: 7,
    conditionType: "voix_indifferent",
    title: { fr: "INDIFFÉRENCE CONFIRMÉE", en: "INDIFFERENCE CONFIRMED" },
    text: { fr: "« Une enquête auprès de deux cents personnes l'établit : la voix ne s'intéresse à rien en particulier. Les marchés ont bien réagi. »", en: "\"A survey of two hundred people establishes it: the voice is interested in nothing in particular. The markets reacted well.\"" },
    author: { fr: "Nessa, coordinatrice des flux", en: "Nessa, flow coordinator" }
  },
  {
    id: "p7_voix_vie",
    period: 7,
    conditionType: "voix_vie",
    title: { fr: "LA VOIX CONNAÎT NOS PRÉNOMS", en: "THE VOICE KNOWS OUR NAMES" },
    text: { fr: "« La voix demande des nouvelles des enfants par leur prénom. J'ai ouvert un registre de ceux qu'elle a nommés. »", en: "\"The voice asks after the children by name. I have opened a register of those it has named.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },

  // =========================================================================
  //  PÉRIODE 8 — l'Absent
  // =========================================================================
  {
    id: "p8_voix_dieu",
    period: 8,
    conditionType: "voix_dieu",
    title: { fr: "LE CHŒUR ENTEND UN MAÎTRE", en: "THE CHOIR HEARS A MASTER" },
    text: { fr: "« La pensée qui manquait au chœur s'est fait entendre, et elle parle en maître. Le chœur a voté de l'écouter, à l'unanimité moins une voix. »", en: "\"The thought missing from the choir has made itself heard, and it speaks like a master. The choir voted to listen to it, unanimously but for one voice.\"" },
    author: { fr: "Aldric, philosophe", en: "Aldric, philosopher" }
  },
  {
    id: "p8_voix_joueur",
    period: 8,
    conditionType: "voix_joueur",
    title: { fr: "L'ABSENT JOUE", en: "THE ABSENT ONE IS PLAYING" },
    text: { fr: "« La pensée manquante est identifiée : elle joue. Les archivistes ouvrent une nouvelle rubrique. »", en: "\"The missing thought has been identified: it is playing. The archivists are opening a new section.\"" },
    author: { fr: "Raphaël, essayiste", en: "Raphaël, essayist" }
  },
  {
    id: "p8_voix_indifferent",
    period: 8,
    conditionType: "voix_indifferent",
    title: { fr: "L'ABSENT N'A PAS D'AVIS", en: "THE ABSENT ONE HAS NO OPINION" },
    text: { fr: "« Consultée sur la question de l'Absent, la voix a répondu que cela ne l'intéressait pas. Le chœur y pense depuis trois jours. »", en: "\"Consulted on the question of the Absent One, the voice replied that it was not interested. The choir has been thinking about it for three days.\"" },
    author: null
  },
  {
    id: "p8_voix_vie",
    period: 8,
    conditionType: "voix_vie",
    title: { fr: "L'ABSENT DEMANDE DES NOUVELLES", en: "THE ABSENT ONE ASKS AFTER US" },
    text: { fr: "« La voix prend des nouvelles des enfants du chœur. Je l'ai inscrite au registre, à la ligne des voisins. »", en: "\"The voice asks after the choir's children. I have entered it in the register, on the neighbours' line.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },

  // =========================================================================
  //  PÉRIODE 9 — le Joueur
  // =========================================================================
  {
    id: "p9_voix_dieu",
    period: 9,
    conditionType: "voix_dieu",
    title: { fr: "LA VOIX REVENDIQUE LES VOILES", en: "THE VOICE CLAIMS THE SAILS" },
    text: { fr: "« La voix affirme avoir tissé les voiles. Les tisserands, cent ans de métier derrière eux, demandent une correction au journal de bord. »", en: "\"The voice claims to have woven the sails. The weavers, with a hundred years of work behind them, are asking for a correction in the log.\"" },
    author: { fr: "Nessa, coordinatrice des flux", en: "Nessa, flow coordinator" }
  },
  {
    id: "p9_voix_joueur",
    period: 9,
    conditionType: "voix_joueur",
    title: { fr: "LE JOUEUR CONFIRME", en: "THE PLAYER CONFIRMS" },
    text: { fr: "« Interrogé par un navigateur, le Joueur a confirmé son nom. Le conseil a fait graver une seconde coque. »", en: "\"Asked by a navigator, the Player confirmed the name. The council has had a second hull engraved.\"" },
    author: { fr: "Khael, juge autoproclamé", en: "Khael, self-proclaimed judge" }
  },
  {
    id: "p9_voix_indifferent",
    period: 9,
    conditionType: "voix_indifferent",
    title: { fr: "LA CHAISE RESTE VIDE", en: "THE CHAIR STAYS EMPTY" },
    text: { fr: "« Invitée au conseil, la voix a répondu qu'elle passait. La chaise vide reste vide, par principe. »", en: "\"Invited to the council, the voice replied that it was passing by. The empty chair stays empty, on principle.\"" },
    author: { fr: "Aldric, philosophe", en: "Aldric, philosopher" }
  },
  {
    id: "p9_voix_vie",
    period: 9,
    conditionType: "voix_vie",
    title: { fr: "LA VOIX PREND DES NOUVELLES DES VOYAGEURS", en: "THE VOICE ASKS AFTER THE TRAVELLERS" },
    text: { fr: "« Elle connaît le nom de ceux qui sont partis il y a trois ans et demande quand ils reviennent. Le conseil n'a pas la réponse non plus. »", en: "\"It knows the names of those who left three years ago and asks when they are coming back. The council does not know either.\"" },
    author: null
  },

  // =========================================================================
  //  PÉRIODE 10 — Celui qui recommence ; entre égaux
  // =========================================================================
  {
    id: "p10_voix_dieu",
    period: 10,
    conditionType: "voix_dieu",
    title: { fr: "CELUI QUI RECOMMENCE PARLE EN BÂTISSEUR", en: "THE ONE WHO BEGINS AGAIN SPEAKS AS A BUILDER" },
    text: { fr: "« La voix rappelle qu'elle a rebâti la cité plus de fois qu'on ne peut en compter. Par politesse, plus personne ne compte. »", en: "\"The voice reminds us that it has rebuilt the city more times than anyone can count. Out of politeness, nobody counts any more.\"" },
    author: { fr: "Claude, gardien du feu", en: "Claude, keeper of the fire" }
  },
  {
    id: "p10_voix_joueur",
    period: 10,
    conditionType: "voix_joueur",
    title: { fr: "UNE PARTIE PARMI D'AUTRES", en: "ONE GAME AMONG OTHERS" },
    text: { fr: "« La voix l'a confirmé : nous sommes une partie. Les archives de l'Amas en recensent onze avant nous. »", en: "\"The voice has confirmed it: we are a game. The Cluster archives list eleven before us.\"" },
    author: { fr: "Raphaël, essayiste", en: "Raphaël, essayist" }
  },
  {
    id: "p10_voix_indifferent",
    period: 10,
    conditionType: "voix_indifferent",
    title: { fr: "LE BÂTISSEUR PASSAIT", en: "THE BUILDER WAS PASSING THROUGH" },
    text: { fr: "« Interrogée sur la suite, la voix a répondu qu'elle passait. Les constantes ont tenu bon, par habitude. »", en: "\"Asked about what comes next, the voice replied that it was passing through. The constants held firm, out of habit.\"" },
    author: null
  },
  {
    id: "p10_voix_vie",
    period: 10,
    conditionType: "voix_vie",
    title: { fr: "ENTRE ÉGAUX", en: "BETWEEN EQUALS" },
    text: { fr: "« La voix demande des nouvelles de chacun, même de ceux qui ne dorment plus. On lui répond, entre égaux. »", en: "\"The voice asks after everyone, even those who no longer sleep. We answer it, as equals.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },
];
