// L'AIDE (Options › Aide) — un chapitre par lieu du jeu, un onglet par chapitre.
//
// Demande de Raph (2026-10-03) : « une Aide dans les options qui explique tout le
// jeu et ses mécanismes, SANS DONNER LES SOLUTIONS, rangée par chapitre », pour
// que l'interface n'ait plus à porter de phrases d'explication.
//
// ⚠ RÈGLES D'ÉCRITURE
// - Les MÉCANISMES, jamais les solutions : aucun objectif de sceau, aucune façon
//   de réussir un mythe, aucun « meilleur choix » de crise ou de legs.
// - Chaque phrase est vérifiée contre le code. Une règle qui change doit changer
//   ici aussi : les chiffres cités (paliers de 25, ×3.5 par sceau, réserve…) sont
//   ceux de balance.js et des données au moment de l'écriture.
// - Les noms sont ceux de l'interface (onglets, boutons), dans les deux langues.
// - `place` : le lieu du rail dont le chapitre parle (places.js). Tant que ce lieu
//   n'est pas découvert, le chapitre reste fermé — l'Aide ne dévoile pas plus
//   que le rail.
//
// BALISES dans les textes (rendues par HelpBook.jsx) :
//   {k:Maj}           une touche fixe, affichée telle quelle ;
//   {key:buy_all}     un raccourci RÉATTRIBUABLE (shortcuts.js) : affiché avec la
//                     touche choisie par le joueur, jamais avec celle d'origine.

export const HELP_CHAPTERS = [
  {
    id: 'bref',
    icon: 'glyphs/cycles',
    title: { fr: 'Le jeu en bref', en: 'The game at a glance' },
    lede: {
      fr: "Une cité naît, grandit, se fragilise et finit par tomber. Ce qu'elle laisse en tombant rend la suivante plus forte.",
      en: 'A city is born, grows, weakens and finally falls. What it leaves behind makes the next one stronger.'
    },
    secs: [
      {
        h: { fr: 'Un cycle', en: 'A cycle' },
        items: [
          { t: { fr: 'Bâtir', en: 'Build' }, d: { fr: 'Tu achètes des bâtiments. Ils produisent des ressources, qui paient d\'autres bâtiments.', en: 'You buy buildings. They produce resources, which pay for more buildings.' } },
          { t: { fr: 'Grandir', en: 'Grow' }, d: { fr: 'Le Rayonnement mesure la grandeur de la cité. Quand il monte, la cité change d\'âge.', en: 'Radiance measures the greatness of the city. As it rises, the city moves into new ages.' } },
          { t: { fr: "S'user", en: 'Wear down' }, d: { fr: 'En grandissant, la cité se tend et la Rupture monte. Le temps, lui, fait monter l\'Usure.', en: 'As it grows, the city strains and Rupture rises. Time, for its part, raises Wear.' } },
          { t: { fr: 'Tomber', en: 'Fall' }, d: { fr: 'À 100 % de Rupture ou d\'Usure, la cité entre en crise et se fige : elle va tomber. Avant, tu peux accomplir un rite.', en: 'At 100% Rupture or Wear, the city enters a crisis and freezes: it is going to fall. Before that, you may perform a rite.' } },
          { t: { fr: 'Renaître', en: 'Rise again' }, d: { fr: 'L\'effondrement efface la cité mais laisse des Ruines. Elles rendent les cités suivantes plus fortes.', en: 'The collapse erases the city but leaves Ruins. They make the following cities stronger.' } }
        ]
      },
      {
        h: { fr: 'Les ressources', en: 'Resources' },
        items: [
          { t: { fr: 'Rayonnement', en: 'Radiance' }, d: { fr: 'La grandeur de la cité. Les bâtiments le font grandir, et c\'est lui qui fait passer les âges.', en: 'The greatness of the city. Buildings make it grow, and it is what carries the city through the ages.' } },
          { t: { fr: 'Nourriture', en: 'Food' }, d: { fr: 'Produite par les Moteurs. Elle paie les Moteurs.', en: 'Produced by the Engines. It pays for Engines.' } },
          { t: { fr: 'Trésor', en: 'Treasury' }, d: { fr: 'Produit par les Moteurs. Il paie les bâtiments de Savoir.', en: 'Produced by the Engines. It pays for Knowledge buildings.' } },
          { t: { fr: 'Savoir', en: 'Knowledge' }, d: { fr: 'Produit par les bâtiments de Savoir. Il paie l\'Infrastructure.', en: 'Produced by Knowledge buildings. It pays for Infrastructure.' } },
          { t: { fr: 'Infrastructure', en: 'Infrastructure' }, d: { fr: 'Elle tient la cité debout : elle renforce les institutions contre la Rupture et augmente la production.', en: 'It keeps the city standing: it strengthens the institutions against Rupture and raises production.' } },
          { t: { fr: 'Habitants', en: 'Inhabitants' }, d: { fr: 'La population de la ville, à l\'échelle de son âge.', en: 'The population of the town, to the scale of its age.' } }
        ]
      },
      {
        h: { fr: 'Les âges', en: 'Ages' },
        items: [
          { t: { fr: 'Les âges', en: 'Ages' }, d: { fr: 'La cité traverse plus de trente âges, du Campement aux âges cosmiques. Chacun change son visage sur la carte.', en: 'The city passes through more than thirty ages, from the Encampment to the cosmic ages. Each one changes its face on the map.' } },
          { t: { fr: 'Les ères', en: 'Eras' }, d: { fr: 'Certaines actions indiquent « Ère II » ou « Ère IV ». Elles s\'ouvrent quand ton meilleur âge, tous cycles confondus, est assez avancé.', en: 'Some actions show "Era II" or "Era IV". They open once your best age, across all cycles, is far enough along.' } }
        ]
      },
      {
        h: { fr: 'Pendant ton absence', en: 'While you are away' },
        items: [
          { t: { fr: "La réserve d'absence", en: 'Away reserve' }, d: { fr: 'Quand tu quittes le jeu, la cité continue de produire jusqu\'à la limite de ta réserve. La Rupture reste gelée, l\'Usure continue.', en: 'When you leave the game, the city keeps producing up to the limit of your reserve. Rupture stays frozen; Wear goes on.' } },
          { t: { fr: 'La clepsydre', en: 'The clepsydra' }, d: { fr: 'Le temps qui dépasse la réserve remplit la clepsydre, jusqu\'à la taille de la réserve. Tu peux le verser plus tard, hors des crises.', en: 'Time beyond the reserve fills the clepsydra, up to the size of the reserve. You can pour it later, outside of crises.' } }
        ]
      },
      {
        h: { fr: 'Les nombres', en: 'Numbers' },
        items: [
          { t: { fr: 'Les suffixes', en: 'Suffixes' }, d: { fr: 'K pour mille, M pour million, B pour milliard, T pour mille milliards ; puis Qa, Qi, Sx, Sp, Oc, No et Dc, chacun mille fois plus grand que le précédent.', en: 'K for thousand, M for million, B for billion, T for trillion; then Qa, Qi, Sx, Sp, Oc, No and Dc, each a thousand times the one before.' } },
          { t: { fr: 'Au-delà', en: 'Beyond' }, d: { fr: 'Les plus grands nombres passent en notation scientifique : 1.20e40 vaut 1.20 × 10⁴⁰. Le format se choisit dans l\'onglet Affichage.', en: 'Larger numbers switch to scientific notation: 1.20e40 means 1.20 × 10⁴⁰. The format is chosen in the Display tab.' } }
        ]
      }
    ]
  },

  {
    id: 'cite',
    place: 'city',
    icon: 'nav/cite',
    title: { fr: 'La Cité', en: 'The City' },
    lede: {
      fr: 'La carte montre ta cité. Ce que tu bâtis y prend place, et la ville change avec les âges.',
      en: 'The map shows your city. What you build takes its place there, and the town changes with the ages.'
    },
    secs: [
      {
        h: { fr: 'Bâtir', en: 'Building' },
        items: [
          { t: { fr: 'Les Moteurs', en: 'Engines' }, d: { fr: 'Payés en Nourriture. Ils produisent de la Nourriture ou du Trésor.', en: 'Paid in Food. They produce Food or Treasury.' } },
          { t: { fr: 'Le Savoir', en: 'Knowledge' }, d: { fr: 'Payé en Trésor. Il produit du Savoir.', en: 'Paid in Treasury. It produces Knowledge.' } },
          { t: { fr: "L'Infrastructure", en: 'Infrastructure' }, d: { fr: 'Payée en Savoir. Elle produit de l\'Infrastructure.', en: 'Paid in Knowledge. It produces Infrastructure.' } },
          { t: { fr: 'Le prix', en: 'Price' }, d: { fr: 'Chaque achat renchérit le suivant. Un bâtiment caché se montre quand tes ressources approchent de son prix ; certains n\'arrivent qu\'après plusieurs cycles.', en: 'Each purchase makes the next one dearer. A hidden building shows itself when your resources near its price; some only arrive after several cycles.' } },
          { t: { fr: 'Les quantités', en: 'Quantities' }, d: { fr: '×1, ×10, ×25, ×100. « Palier » achète juste ce qu\'il faut pour atteindre le prochain palier. « Max », débloqué à la Boutique, achète tout ce qui est abordable. {k:Maj} + clic achète par dix, {k:Ctrl} + clic par cent, et {key:buy_all} achète tout ce qui est abordable.', en: '×1, ×10, ×25, ×100. "Milestone" buys just what is needed to reach the next milestone. "Max", unlocked at the Shop, buys everything affordable. {k:Shift} + click buys ten, {k:Ctrl} + click a hundred, and {key:buy_all} buys everything affordable.' } },
          { t: { fr: 'Les paliers', en: 'Milestones' }, d: { fr: 'Tous les 25 exemplaires d\'un même bâtiment, sa production est multipliée : ×2 pour les Moteurs, ×1.5 pour le Savoir et l\'Infrastructure.', en: 'Every 25 copies of the same building, its output is multiplied: ×2 for Engines, ×1.5 for Knowledge and Infrastructure.' } },
          { t: { fr: 'Le gain', en: 'Gain' }, d: { fr: 'Le pourcentage affiché sur un bâtiment dit de combien son achat augmenterait la production actuelle.', en: 'The percentage shown on a building tells how much buying it would raise current production.' } },
          { t: { fr: 'Les routes', en: 'Roads' }, d: { fr: 'Plus les bâtiments sont reliés au réseau, plus la production monte, jusqu\'à +10 %. Les chantiers de voirie élargissent les rues et ajoutent un petit bonus ; ils se paient en Savoir.', en: 'The more buildings are linked to the network, the higher production goes, up to +10%. Roadworks widen the streets and add a small bonus; they are paid in Knowledge.' } }
        ]
      },
      {
        h: { fr: 'Ta cité', en: 'Your city' },
        items: [
          { t: { fr: 'Le nom', en: 'The name' }, d: { fr: 'Il se change d\'un clic.', en: 'Click it to change it.' } },
          { t: { fr: 'La personnalité', en: 'Personality' }, d: { fr: 'Tirée à la fondation, elle façonne le plan de la ville, ses bâtiments et ses habitants.', en: 'Drawn at the founding, it shapes the town plan, its buildings and its inhabitants.' } },
          { t: { fr: 'La jauge', en: 'The gauge' }, d: { fr: 'La Rupture du moment, et le trait de sa cible. À côté, les Ruines que rapporterait une chute maintenant.', en: 'The current Rupture, and the mark of its target. Next to it, the Ruins a fall would bring right now.' } },
          { t: { fr: 'Le vœu', en: 'The vow' }, d: { fr: 'Un objectif court, choisi parmi trois au début du cycle. Tenu, il augmente les Ruines de la prochaine chute. Manqué, il ne coûte rien.', en: 'A short goal, chosen among three at the start of the cycle. Kept, it raises the Ruins of the next fall. Missed, it costs nothing.' } }
        ]
      },
      {
        h: { fr: 'Regarder', en: 'Looking around' },
        items: [
          { t: { fr: 'Se déplacer', en: 'Moving' }, d: { fr: 'Glisse la carte pour te déplacer, molette pour zoomer, {key:recenter_map} pour recentrer.', en: 'Drag the map to move, use the wheel to zoom, {key:recenter_map} to recenter.' } },
          { t: { fr: 'Contempler', en: 'Contemplate' }, d: { fr: '{key:contemplation} cache l\'interface et laisse la ville seule à l\'écran. {k:Échap} pour revenir.', en: '{key:contemplation} hides the interface and leaves the town alone on screen. {k:Esc} to come back.' } },
          { t: { fr: 'Les habitants', en: 'Inhabitants' }, d: { fr: 'Clique un habitant perdu dans ses pensées : il te les confie, avec parfois un petit cadeau.', en: 'Click an inhabitant lost in thought: they share it with you, sometimes with a small gift.' } },
          { t: { fr: 'Les lieux', en: 'Places' }, d: { fr: 'Les touches {k:1} à {k:8} ouvrent les lieux de la barre, dans l\'ordre.', en: 'Keys {k:1} to {k:8} open the places of the bar, in order.' } }
        ]
      }
    ]
  },

  {
    id: 'regulation',
    place: 'regulation',
    icon: 'nav/regulation',
    title: { fr: 'La Régulation', en: 'Regulation' },
    lede: {
      fr: 'La Rupture mesure la tension de la cité. La Régulation montre d\'où elle vient et ce que tu peux y faire.',
      en: 'Rupture measures the strain on the city. Regulation shows where it comes from and what you can do about it.'
    },
    secs: [
      {
        h: { fr: 'La Rupture', en: 'Rupture' },
        items: [
          { t: { fr: 'Elle glisse', en: 'It drifts' }, d: { fr: 'La Rupture ne saute pas : elle glisse vers une cible, le trait blanc de la jauge. La cible dépend de ce que la cité est devenue.', en: 'Rupture does not jump: it drifts toward a target, the white mark on the gauge. The target depends on what the city has become.' } },
          { t: { fr: 'Les crises', en: 'Crises' }, d: { fr: 'À 25, 50 et 75 %, une crise éclate et offre deux voies. Traiter : une ressource produit moins jusqu\'à la chute, et le foyer de la crise s\'allège. Profiter : la chute rapportera plus de Ruines, et le foyer s\'alourdit.', en: 'At 25, 50 and 75%, a crisis breaks out and offers two paths. Treat: one resource produces less until the fall, and the crisis source grows lighter. Profit: the fall will bring more Ruins, and the source grows heavier.' } },
          { t: { fr: 'À 100 %', en: 'At 100%' }, d: { fr: 'La cité entre en crise terminale et se fige. Voir le chapitre de l\'Effondrement.', en: 'The city enters its terminal crisis and freezes. See the Collapse chapter.' } }
        ]
      },
      {
        h: { fr: "D'où elle vient", en: 'Where it comes from' },
        items: [
          { t: { fr: 'Subsistance', en: 'Subsistence' }, d: { fr: 'Monte quand la Nourriture ne couvre plus les besoins de la cité.', en: 'Rises when Food no longer covers the needs of the city.' } },
          { t: { fr: 'Inégalités', en: 'Inequality' }, d: { fr: 'Monte quand le Trésor dort en réserve au-delà d\'une minute de revenu environ.', en: 'Rises when the Treasury sits idle beyond roughly a minute of income.' } },
          { t: { fr: 'Complexité', en: 'Complexity' }, d: { fr: 'Monte avec le nombre de bâtiments à administrer, que l\'Infrastructure doit couvrir.', en: 'Rises with the number of buildings to administer, which Infrastructure must cover.' } },
          { t: { fr: 'Dissidence', en: 'Dissent' }, d: { fr: 'Monte avec la mémoire des cycles passés et des ruines.', en: 'Rises with the memory of past cycles and of the ruins.' } },
          { t: { fr: 'Structurelle', en: 'Structural' }, d: { fr: 'Une fragilité de fond, que certains bâtiments stabilisent.', en: 'An underlying fragility, which some buildings steady.' } },
          { t: { fr: 'Démesure', en: 'Hubris' }, d: { fr: 'Naît de la taille même de la cité. Elle s\'ajoute après les institutions, qui ne la retiennent pas.', en: 'Born of the sheer size of the city. It is added after the institutions, which do not hold it back.' } },
          { t: { fr: 'Les institutions', en: 'Institutions' }, d: { fr: 'Elles retiennent une part de la pression des autres sources. Leur force vient surtout de l\'Infrastructure, et de certains nœuds de l\'arbre des Ruines.', en: 'They hold back part of the pressure from the other sources. Their strength comes mostly from Infrastructure, and from some nodes of the Ruins Tree.' } }
        ]
      },
      {
        h: { fr: 'Décréter', en: 'Decrees' },
        items: [
          { t: { fr: 'Les édits', en: 'Edicts' }, d: { fr: 'Un soulagement immédiat, qui s\'estompe en quelques dizaines de secondes. Certains laissent un malus de production jusqu\'à la chute.', en: 'Immediate relief, which fades within a few dozen seconds. Some leave a production penalty until the fall.' } },
          { t: { fr: 'Les réformes', en: 'Reforms' }, d: { fr: 'Un recul durable de leur source, jusqu\'à la chute. Elles coûtent cher.', en: 'A lasting retreat of their source, until the fall. They are expensive.' } },
          { t: { fr: 'Le prix', en: 'Cost' }, d: { fr: 'Un décret se paie en secondes de production. Il renchérit avec l\'usage et avec la fatigue.', en: 'A decree is paid in seconds of production. It grows dearer with use and with fatigue.' } },
          { t: { fr: 'La fatigue', en: 'Fatigue' }, d: { fr: 'Chaque décret fatigue l\'administration et renchérit les suivants. Elle retombe d\'elle-même en quelques dizaines de secondes.', en: 'Each decree tires the administration and makes the next ones dearer. It wears off on its own within a few dozen seconds.' } }
        ]
      },
      {
        h: { fr: 'Durer', en: 'Lasting measures' },
        items: [
          { t: { fr: 'Les politiques', en: 'Policies' }, d: { fr: 'Deux au plus à la fois. Tant qu\'elles sont actives, elles freinent la Rupture contre une part de la production. Certaines s\'ouvrent avec les âges ou avec un mythe.', en: 'Two at most at a time. While active, they slow Rupture in exchange for a share of production. Some open with the ages or with a myth.' } },
          { t: { fr: "L'Intendance", en: 'The Stewardship' }, d: { fr: 'Des consignes : « si la Rupture dépasse tel seuil, décréter tel édit ». L\'intendance paie comme toi et se met en veille quand l\'administration est trop fatiguée. Elle ne tente jamais de pari. Une consigne s\'ouvre à l\'Ère IV, une seconde avec un mythe.', en: 'Standing orders: "if Rupture passes this threshold, issue this edict". The stewardship pays as you do and stands by when the administration is too tired. It never takes a gamble. One order opens at Era IV, a second with a myth.' } }
        ]
      }
    ]
  },

  {
    id: 'effondrement',
    place: 'prestige',
    icon: 'nav/effondrement',
    title: { fr: "L'Effondrement", en: 'The Collapse' },
    lede: {
      fr: 'Toute cité finit par tomber. La chute se prépare, et elle transmet.',
      en: 'Every city falls in the end. The fall can be prepared, and it passes things on.'
    },
    secs: [
      {
        h: { fr: 'La crise terminale', en: 'The terminal crisis' },
        items: [
          { t: { fr: 'Quand', en: 'When' }, d: { fr: 'À 100 % de Rupture, ou à 100 % d\'Usure.', en: 'At 100% Rupture, or at 100% Wear.' } },
          { t: { fr: "L'Usure", en: 'Wear' }, d: { fr: 'Elle monte avec le temps, quoi que tu fasses. Après une heure de cycle, des paliers de sédiment augmentent la moisson de Ruines.', en: 'It rises with time, whatever you do. After an hour of cycle, sediment tiers raise the harvest of Ruins.' } },
          { t: { fr: 'La cité figée', en: 'The frozen city' }, d: { fr: 'Pendant la crise, plus rien ne produit et seul l\'Effondrement reste ouvert.', en: 'During the crisis, nothing produces and only the Collapse stays open.' } }
        ]
      },
      {
        h: { fr: 'Relancer ou tomber', en: 'Revive or fall' },
        items: [
          { t: { fr: 'Les rites de la chute', en: 'The rites of the fall' }, d: { fr: 'Organiser l\'exode, Préparer les archives, Maintenir l\'ordre : un seul par chute, et la cité ne repart pas. Le rite augmente les Ruines de la chute et en décide la cause. Il se paie en secondes de production de sa ressource (Nourriture, Savoir, Trésor) : Mesuré, Drastique et Total demandent de plus en plus de réserve. Sans production de sa ressource, pas de rite.', en: 'Organize the exodus, Prepare the archives, Maintain order: only one per fall, and the city does not start again. The rite raises the Ruins of the fall and decides its cause. It is paid in seconds of production of its resource (Food, Knowledge, Treasury): Measured, Drastic and Total need more and more in reserve. Without production of its resource, no rite.' } },
          { t: { fr: 'Le bilan', en: 'The tally' }, d: { fr: 'Les Ruines que rapporterait la chute. La patience du cycle les augmente avec la durée du cycle ; elle reste figée pendant la crise.', en: 'The Ruins the fall would bring. Cycle patience raises them with the length of the cycle; it stays frozen during the crisis.' } },
          { t: { fr: 'Effondrer', en: 'Collapse' }, d: { fr: 'Maintiens le bouton un instant. Tout s\'efface, sauf les Ruines et ce que l\'arbre des Ruines fait survivre.', en: 'Hold the button for a moment. Everything is erased, except the Ruins and what the Ruins Tree keeps alive.' } }
        ]
      },
      {
        h: { fr: 'Préparer la chute', en: 'Preparing the fall' },
        items: [
          { t: { fr: 'Le Testament', en: 'The Testament' }, d: { fr: 'Grave un legs pour la cité suivante, qui agit pendant tout son cycle. Le Grain allège la Subsistance, la Mémoire ralentit l\'Usure, l\'Ordre allège la Complexité et la Dissidence. Le Pillage rapporte plus de Ruines tout de suite, mais la cité suivante naît avec des Inégalités plus fortes.', en: 'Engrave a legacy for the next city, which lasts for its whole cycle. Grain eases Subsistence, Memory slows Wear, Order eases Complexity and Dissent. Plunder brings more Ruins at once, but the next city is born with heavier Inequality.' } },
          { t: { fr: 'La chute annoncée', en: 'The foretold fall' }, d: { fr: 'Elle suit le foyer qui pèse le plus : la Subsistance mène à la famine, les Inégalités à l\'avarice, les autres à la rupture ; une crise ouverte par l\'Usure mène à l\'usure du temps. Le rite de la chute décide de la cause, sauf dans une crise ouverte par l\'Usure : l\'exode pour la famine, les archives pour l\'usure du temps, l\'ordre pour la rupture. Le legs assorti à la cause est renforcé.', en: 'It follows the heaviest source: Subsistence leads to famine, Inequality to avarice, the others to rupture; a crisis opened by Wear leads to the wear of time. The rite of the fall decides the cause, except in a crisis opened by Wear: the exodus for famine, the archives for the wear of time, order for rupture. The legacy that matches the cause is strengthened.' } },
          { t: { fr: 'Le Conseil de crise', en: 'The Crisis council' }, d: { fr: 'Il répond seul aux crises de 25, 50 et 75 %. Demander ouvre la crise et met le jeu en pause ; Stabiliser choisit de traiter ; Temporiser choisit de profiter.', en: 'It answers the 25, 50 and 75% crises on its own. Ask opens the crisis and pauses the game; Stabilize chooses to treat; Delay chooses to profit.' } },
          { t: { fr: "L'Édit d'effondrement", en: 'The Collapse Edict' }, d: { fr: 'La cité tombe seule au déclencheur choisi : la crise terminale, un seuil d\'Usure ou une durée de cycle. « Sauver avant » tente d\'abord Rationner et les Réformes.', en: 'The city falls on its own at the chosen trigger: the terminal crisis, a Wear threshold or a cycle length. "Save first" tries Ration and Reforms beforehand.' } },
          { t: { fr: 'Les obtenir', en: 'Getting them' }, d: { fr: 'Le Conseil de crise et l\'Édit d\'effondrement s\'obtiennent dans l\'arbre des Ruines.', en: 'The Crisis council and the Collapse Edict are obtained in the Ruins Tree.' } }
        ]
      },
      {
        h: { fr: 'Les Sceaux du Grand Reset', en: 'The Grand Reset Seals' },
        items: [
          { t: { fr: 'Dix sceaux', en: 'Ten seals' }, d: { fr: 'Chacun est lié à un domaine du jeu. Son objectif n\'est pas écrit : il se révèle quand tu t\'en approches.', en: 'Each is tied to one area of the game. Its goal is not written down: it reveals itself as you come near.' } },
          { t: { fr: 'Réclamer', en: 'Claiming' }, d: { fr: 'Un sceau atteint reste réclamable à vie. Le réclamer déclenche un Grand Reset : bâtiments, Ruines, améliorations et cycles sont effacés.', en: 'A seal once reached can be claimed forever. Claiming it triggers a Grand Reset: buildings, Ruins, upgrades and cycles are erased.' } },
          { t: { fr: 'En échange', en: 'In return' }, d: { fr: 'Chaque sceau multiplie pour toujours la production par 3.5 et les Ruines gagnées par 2. Plusieurs sceaux prêts se réclament en un seul Grand Reset.', en: 'Each seal multiplies production by 3.5 and Ruins earned by 2, forever. Several ready seals are claimed in a single Grand Reset.' } }
        ]
      }
    ]
  },

  {
    id: 'ruines',
    place: 'ruinsView',
    icon: 'glyphs/ruines',
    title: { fr: 'Les Ruines', en: 'The Ruins' },
    lede: {
      fr: 'Les Ruines sont la mémoire des cités tombées. Elles passent d\'un cycle à l\'autre.',
      en: 'Ruins are the memory of fallen cities. They carry over from one cycle to the next.'
    },
    secs: [
      {
        h: { fr: 'Les Ruines', en: 'Ruins' },
        items: [
          { t: { fr: 'Les gagner', en: 'Earning them' }, d: { fr: 'Chaque effondrement en rapporte. La taille de la cité, la durée du cycle et le rite de la chute en augmentent la moisson.', en: 'Every collapse brings some. The size of the city, the length of the cycle and the rite of the fall raise the harvest.' } },
          { t: { fr: 'Les garder', en: 'Keeping them' }, d: { fr: 'Même non dépensées, elles renforcent la production.', en: 'Even unspent, they strengthen production.' } },
          { t: { fr: 'Les dépenser', en: 'Spending them' }, d: { fr: 'Dans l\'arbre, pour des effets qui durent.', en: 'In the tree, for lasting effects.' } }
        ]
      },
      {
        h: { fr: "L'arbre", en: 'The tree' },
        items: [
          { t: { fr: 'Quatre branches', en: 'Four branches' }, d: { fr: 'La Sève pour la prospérité, l\'Écorce gravée pour le savoir et la mémoire, la Cendre pour les crises et la chute, les Racines pour ce qui survit à l\'effondrement.', en: 'The Sap for prosperity, the Graven Bark for knowledge and memory, the Ash for crises and the fall, the Roots for what survives the collapse.' } },
          { t: { fr: 'Les paliers', en: 'Tiers' }, d: { fr: 'Une branche s\'ouvre palier par palier : il faut assez de nœuds acquis au palier précédent. Certains nœuds attendent aussi un nombre de cycles.', en: 'A branch opens tier by tier: enough nodes must be owned in the tier before. Some nodes also wait for a number of cycles.' } },
          { t: { fr: 'Au bout', en: 'At the end' }, d: { fr: 'Au bout de chaque branche attend un nœud plus puissant que les autres.', en: 'At the end of each branch waits a node stronger than the others.' } },
          { t: { fr: 'Les dogmes', en: 'Dogmas' }, d: { fr: 'Ils vont par paires : en choisir un ferme l\'autre. Ils s\'offrent sans rien coûter quand la branche a assez grandi.', en: 'They come in pairs: choosing one closes the other. They are given for free once the branch has grown enough.' } }
        ]
      },
      {
        h: { fr: 'Les médaillons', en: 'Medallions' },
        items: [
          { t: { fr: 'À acheter', en: 'To buy' }, d: { fr: 'Anneau d\'or vif.', en: 'Bright gold ring.' }, dot: '#F4C96F' },
          { t: { fr: 'Acquis', en: 'Owned' }, d: { fr: 'Anneau de la couleur de sa branche.', en: 'Ring in the colour of its branch.' }, dot: '#C9A968' },
          { t: { fr: 'Trop cher', en: 'Too dear' }, d: { fr: 'Anneau ambre : il manque des Ruines.', en: 'Amber ring: Ruins are missing.' }, dot: '#E0B057' },
          { t: { fr: 'Verrouillé', en: 'Locked' }, d: { fr: 'Gris : son palier ou ses cycles ne sont pas atteints.', en: 'Grey: its tier or its cycles are not reached yet.' }, dot: '#6B6672' },
          { t: { fr: 'Exclu', en: 'Excluded' }, d: { fr: 'Rouge : son dogme jumeau a été choisi.', en: 'Red: its twin dogma was chosen.' }, dot: '#B04A4A' }
        ]
      }
    ]
  },

  {
    id: 'plaisirs',
    place: 'plaisirs',
    icon: 'nav/plaisirs',
    title: { fr: 'Les Plaisirs', en: 'The Pleasures' },
    lede: {
      fr: 'La maison des Plaisirs abrite les jeux du temple. On y gagne la Faveur.',
      en: 'The house of Pleasures holds the temple games. Favor is won there.'
    },
    secs: [
      {
        h: { fr: 'La Faveur', en: 'Favor' },
        items: [
          { t: { fr: 'La gagner', en: 'Earning it' }, d: { fr: 'Aux tables, et aux Offrandes : les habitants y déposent deux Faveur par minute, jusqu\'à ce qu\'elles soient pleines. Relève-les pour encaisser.', en: 'At the tables, and from the Offerings: the inhabitants leave two Favor a minute there, until they are full. Collect them to cash in.' } },
          { t: { fr: 'La dépenser', en: 'Spending it' }, d: { fr: 'À la Boutique.', en: 'At the Shop.' } }
        ]
      },
      {
        h: { fr: 'Les tables', en: 'The tables' },
        items: [
          { t: { fr: 'Les osselets', en: 'Knucklebones' }, d: { fr: 'Quatre os jetés sur la table. Le rite choisi règle la mise, le risque et le gain. Après un gain, tu peux tenter un quitte ou double.', en: 'Four bones thrown on the table. The chosen rite sets the stake, the risk and the prize. After a win, you can try double or nothing.' }, tag: { fr: 'Ère II', en: 'Era II' } },
          { t: { fr: 'Les tickets à gratter', en: 'Scratch tickets' }, d: { fr: 'Gratte le vernis : trois symboles identiques font gagner.', en: 'Scratch off the varnish: three matching symbols win.' }, tag: { fr: 'Ère II', en: 'Era II' } },
          { t: { fr: 'Le vingt-et-un', en: 'Twenty-one' }, d: { fr: 'Approche 21 sans le dépasser. Le croupier tire jusqu\'à 17.', en: 'Get close to 21 without going over. The dealer draws up to 17.' }, tag: { fr: 'Ère III', en: 'Era III' } },
          { t: { fr: "Le vol d'Icare", en: "Icarus's flight" }, d: { fr: 'Le multiplicateur grimpe tant qu\'Icare vole. Pose-toi avant que le soleil ne frappe.', en: 'The multiplier climbs as long as Icarus flies. Land before the sun strikes.' }, tag: { fr: 'Ère III', en: 'Era III' } }
        ]
      },
      {
        h: { fr: 'Autour des tables', en: 'Around the tables' },
        items: [
          { t: { fr: 'La cagnotte', en: 'The pot' }, d: { fr: 'Les mises perdues la nourrissent. Icare en emporte une part s\'il se pose à ×10 ou plus.', en: 'Lost stakes feed it. Icarus takes a share of it if he lands at ×10 or more.' } },
          { t: { fr: 'Le coffre', en: 'The chest' }, d: { fr: 'Chaque rang, acheté à la Boutique, autorise une mise dix fois plus lourde.', en: 'Each rank, bought at the Shop, allows a stake ten times heavier.' } },
          { t: { fr: 'Le pupitre', en: 'The temple desk' }, d: { fr: 'Un jeu dont l\'automatisation est achetée joue seul. Son pupitre règle la mise, le rythme et la Faveur à garder en réserve.', en: 'A game whose automation has been bought plays on its own. Its desk sets the stake, the pace and the Favor to keep in reserve.' } }
        ]
      }
    ]
  },

  {
    id: 'boutique',
    place: 'tech',
    icon: 'nav/boutique',
    title: { fr: 'La Boutique', en: 'The Shop' },
    lede: {
      fr: 'L\'échoppe du Chiffonnier des cycles. Tout s\'y paie en Faveur.',
      en: 'The shop of the Rag-picker of Cycles. Everything there is paid in Favor.'
    },
    secs: [
      {
        h: { fr: 'Les armoires', en: 'The cabinets' },
        items: [
          { t: { fr: 'Les jeux', en: 'Games' }, d: { fr: 'Les améliorations des tables. Chaque lignée s\'achète dans l\'ordre et se couronne par l\'automatisation de son jeu.', en: 'Upgrades for the tables. Each line is bought in order and is crowned by the automation of its game.' } },
          { t: { fr: 'Le confort', en: 'Comfort' }, d: { fr: 'Des gestes en moins.', en: 'Fewer chores.' } },
          { t: { fr: 'La production', en: 'Production' }, d: { fr: 'Ce qui fait grandir les cités suivantes.', en: 'What makes the following cities grow.' } }
        ]
      },
      {
        h: { fr: 'Acheter', en: 'Buying' },
        items: [
          { t: { fr: 'Choisir', en: 'Choosing' }, d: { fr: 'Choisis un objet sur les étagères : sa fiche donne l\'effet et le prix.', en: 'Pick an item on the shelves: its card gives the effect and the price.' } },
          { t: { fr: 'Garder', en: 'Keeping' }, d: { fr: 'Les améliorations achetées survivent aux effondrements.', en: 'Bought upgrades survive collapses.' } },
          { t: { fr: "S'ouvrir", en: 'Opening' }, d: { fr: 'La Boutique s\'ouvre au premier effondrement, ou dès la première Faveur.', en: 'The Shop opens at the first collapse, or as soon as you hold any Favor.' } }
        ]
      }
    ]
  },

  {
    id: 'mythes',
    place: 'mythView',
    icon: 'nav/mythes',
    title: { fr: 'Les Mythes', en: 'The Myths' },
    lede: {
      fr: 'Les Mythes s\'ouvrent après le premier Grand Reset. Chacun est un pacte avec les dieux.',
      en: 'The Myths open after the first Grand Reset. Each one is a pact with the gods.'
    },
    secs: [
      {
        h: { fr: 'Les pactes', en: 'The pacts' },
        items: [
          { t: { fr: 'Sceller', en: 'Sealing' }, d: { fr: 'Sceller un mythe recommence le cycle en cours sous une règle imposée.', en: 'Sealing a myth restarts the current cycle under an imposed rule.' } },
          { t: { fr: "L'objectif", en: 'The goal' }, d: { fr: 'Chaque mythe fixe un but à atteindre sous cette règle.', en: 'Each myth sets a goal to reach under that rule.' } },
          { t: { fr: "L'héritage", en: 'The heritage' }, d: { fr: 'Accompli, le mythe laisse un héritage pour toujours.', en: 'Once fulfilled, the myth leaves a heritage forever.' } },
          { t: { fr: 'Les actes', en: 'Acts' }, d: { fr: 'Les mythes sont rangés en actes. Un acte s\'ouvre quand le précédent est accompli.', en: 'Myths are grouped in acts. An act opens once the one before is fulfilled.' } }
        ]
      },
      {
        h: { fr: "L'Olympe", en: 'Olympus' },
        items: [
          { t: { fr: 'Les cultes', en: 'Cults' }, d: { fr: 'Quatre cultes se disputent la cité. Chacun se nourrit d\'une façon de jouer.', en: 'Four cults compete for the city. Each one feeds on a way of playing.' } },
          { t: { fr: 'La consécration', en: 'Consecration' }, d: { fr: 'Le culte le plus fervent gagne des crans. Au douzième, la religion est proclamée et laisse son héritage.', en: 'The most fervent cult gains notches. At the twelfth, the religion is proclaimed and leaves its heritage.' } }
        ]
      }
    ]
  },

  {
    id: 'marchandage',
    place: 'comptoir',
    // ⚠ Même icône PLACEHOLDER que le rail (App.jsx) : à remplacer ensemble.
    icon: 'res/gold',
    title: { fr: 'Le Marchandage', en: 'Trading' },
    lede: {
      fr: 'Le Comptoir s\'ouvre avec l\'héritage d\'un mythe. Le marchand échange à son tarif.',
      en: 'The Trading Post opens with the heritage of a myth. The merchant trades at their own rate.'
    },
    secs: [
      {
        h: { fr: 'Échanger', en: 'Trading' },
        items: [
          { t: { fr: 'Acheter', en: 'Buy' }, d: { fr: 'Une minute de ta production de Nourriture, de Savoir ou d\'Infrastructure, contre une minute et demie de ton revenu d\'Or.', en: 'One minute of your Food, Knowledge or Infrastructure production, for a minute and a half of your Gold income.' } },
          { t: { fr: 'Vendre', en: 'Sell' }, d: { fr: 'Une minute de ta production de Nourriture, contre trente-six secondes de ton revenu d\'Or.', en: 'One minute of your Food production, for thirty-six seconds of your Gold income.' } },
          { t: { fr: 'En crise', en: 'In a crisis' }, d: { fr: 'Le Comptoir ferme tant que la cité est figée.', en: 'The Trading Post closes while the city is frozen.' } }
        ]
      }
    ]
  },

  {
    id: 'chronique',
    place: 'history',
    icon: 'nav/chronique',
    title: { fr: 'La Chronique', en: 'The Chronicle' },
    lede: {
      fr: 'La Chronique garde la mémoire de la cité, et de toutes celles d\'avant.',
      en: 'The Chronicle keeps the memory of the city, and of all those before it.'
    },
    secs: [
      {
        h: { fr: "Ce qu'on y lit", en: 'What you will find' },
        items: [
          { t: { fr: 'Le bilan', en: 'The review' }, d: { fr: 'Le cycle en cours, ses records, ce que rapporterait la chute, et la mémoire de tous les cycles.', en: 'The current cycle, its records, what the fall would bring, and the memory of every cycle.' } },
          { t: { fr: 'Les comptes', en: 'The accounts' }, d: { fr: 'Qui produit quoi, ressource par ressource.', en: 'Who produces what, resource by resource.' } },
          { t: { fr: 'Le multiplicateur', en: 'The multiplier' }, d: { fr: 'Chaque facteur qui multiplie la production. La Nourriture et le Trésor n\'en reçoivent que la racine carrée.', en: 'Every factor that multiplies production. Food and Treasury only receive its square root.' } },
          { t: { fr: 'Les âges', en: 'The ages' }, d: { fr: 'Les âges déjà traversés. Le suivant reste caché tant que le Rayonnement ne l\'atteint pas.', en: 'The ages already crossed. The next one stays hidden until Radiance reaches it.' } },
          { t: { fr: 'Les dépêches', en: 'Dispatches' }, d: { fr: 'Des nouvelles de la cité paraissent au fil du jeu. Le journal garde aussi une ligne pour chaque événement.', en: 'News from the city appears as you play. The journal also keeps a line for each event.' } }
        ]
      }
    ]
  }
];
