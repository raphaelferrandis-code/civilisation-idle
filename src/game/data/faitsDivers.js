"use strict";

// LES FAITS DIVERS — le texte (docs/PLAN-FAITS-DIVERS.md fait foi).
//
// Des feuilletons qu'on trouve en se baladant sur la carte. Un chapitre est une
// petite scène discrète (une secte à la lisière, un homme dans un tonneau…) ; le
// clic sur l'un de ses personnages ouvre sa réplique et inscrit le chapitre dans
// la Chronique. Ce module ne contient QUE des données : qui parle, ce qu'il dit,
// ce que la Chronique en retient, et de quoi la scène a besoin (âge minimum,
// nuit, type de lieu). Les scènes elles-mêmes vivent dans src/game/map/faitsDivers/.
//
// Décisions de Raph (2026-10-04) : AUCUN indice — la Chronique ne dit ni où ni
// quand chercher, ni combien d'histoires ou de chapitres restent. Les visuels sont
// discrets : ce sont des éléments de la ville, et les rater est normal.
//
// Forme d'un chapitre :
//   id        identifiant stable (sauvegardé : ne jamais renommer un chapitre publié)
//   band      âge MINIMUM (0 Feu … 9 Démiurge) ; passé cet âge, le chapitre reste
//             possible — un joueur qui l'a raté le croise plus tard, ou au cycle suivant
//   night     true : la nuit seulement ; false : le jour seulement ; absent : peu importe
//   place     type de lieu (cf. map/faitsDivers/spots.js)
//   delayMin  minutes de jeu (à vie) depuis le chapitre précédent de la même histoire
//   stage     variante de décor passée à la scène
//   title     titre court, dans la Chronique
//   chronicle ce que la Chronique raconte, au passé
//   cast      les personnages, dans l'ordre où la scène les place : { who, line, ct }
//             (ct : 0 homme, 1 femme, 2 enfant — le dessin d'habitant de l'âge)
//   lines     (facultatif) répliques de RE-CLIC, tirées à tour de rôle
//
// L'apostrophe typographique (’) partout : pas d'échappement, et la police pixel
// la dessine.

// ── 1. LA SECTE DU FEU QUI PARLE ────────────────────────────────────────────
// Humour, puis une fin qui renverse tout. La lisière, la nuit. Le cercle grandit
// d'âge en âge ; une braise du premier feu traverse les siècles dans une boîte.
const SECTE = {
  id: 'secte',
  title: { fr: 'La Secte du Feu qui parle', en: 'The Cult of the Speaking Fire' },
  place: 'lisiere',
  night: true,
  chapters: [
    {
      id: 'cercle', band: 0, delayMin: 0, stage: 0,
      title: { fr: 'Le cercle', en: 'The circle' },
      chronicle: {
        fr: 'À la lisière, six silhouettes veillaient un feu en silence. Elles attendaient qu’il parle.',
        en: 'At the edge of the woods, six figures kept watch over a fire in silence. They were waiting for it to speak.',
      },
      cast: [
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'Ne parle pas si fort. Il écoute.', en: 'Don’t talk so loud. It’s listening.' } },
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'Hier, il a craqué deux fois. Deux. Ça veut forcément dire quelque chose.', en: 'Last night it crackled twice. Twice. That has to mean something.' } },
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'Moi, je crois qu’il a froid.', en: 'Personally, I think it’s cold.' } },
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'On ne dort pas. On veille. Ce n’est pas pareil.', en: 'We’re not sleeping. We’re keeping watch. It’s not the same thing.' } },
        { ct: 0, who: { fr: 'Le plus vieux', en: 'The eldest' }, line: { fr: 'Il a déjà parlé à ma grand-mère. Elle n’a jamais voulu dire ce qu’il avait dit.', en: 'It spoke to my grandmother once. She never would say what it said.' } },
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'Tu peux t’asseoir. Mais ne lui tourne pas le dos.', en: 'You can sit. Just don’t turn your back on it.' } },
      ],
    },
    {
      id: 'menhirs', band: 2, delayMin: 25, stage: 1,
      title: { fr: 'Les pierres levées', en: 'The standing stones' },
      chronicle: {
        fr: 'Ils étaient douze désormais, et ils avaient dressé des pierres autour du feu. Les enfants des premiers veillaient à leur tour.',
        en: 'There were twelve of them now, and they had raised stones around the fire. The children of the first ones kept watch in their turn.',
      },
      cast: [
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'Les pierres, c’est pour qu’il ne s’en aille pas. Ça fait trois générations qu’il n’est pas parti. Ça marche.', en: 'The stones are so it doesn’t leave. It hasn’t left in three generations. It works.' } },
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'Mon père attendait. Son père attendait. Nous, on a juste ajouté des pierres.', en: 'My father waited. His father waited. We just added stones.' } },
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'On a eu une scission. Les autres attendent qu’il pleuve.', en: 'We had a schism. The others are waiting for it to rain.' } },
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'Chaque pierre, c’est quelqu’un qui a attendu toute sa vie.', en: 'Every stone is someone who waited their whole life.' } },
        { ct: 2, who: { fr: 'Un enfant', en: 'A child' }, line: { fr: 'Quand il parlera, je lui demanderai pourquoi il a mis si longtemps.', en: 'When it speaks, I’m going to ask it what took so long.' } },
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'Cet hiver, il a fumé bleu. On en parle encore.', en: 'Last winter its smoke went blue. We still talk about it.' } },
      ],
    },
    {
      id: 'oracle', band: 4, delayMin: 30, stage: 2,
      title: { fr: 'L’oracle des braises', en: 'The oracle of the embers' },
      chronicle: {
        fr: 'Ils avaient bâti au-dessus du feu un temple pas plus grand qu’une cabane. Une oracle y lisait les braises. Les braises disaient : bientôt.',
        en: 'Over the fire they had built a temple no bigger than a hut. An oracle read the embers there. The embers said: soon.',
      },
      cast: [
        { ct: 1, who: { fr: 'L’oracle', en: 'The oracle' }, line: { fr: 'Les braises disent : bientôt. Elles disent bientôt depuis six cents ans. Mais elles le disent de mieux en mieux.', en: 'The embers say: soon. They have said soon for six hundred years. But they say it better and better.' } },
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'On lui a mis un toit. Il ne fallait pas qu’il pleuve sur lui.', en: 'We gave it a roof. It mustn’t be rained on.' } },
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'Les philosophes de la ville disent que le feu, c’est de la chimie. Les pauvres.', en: 'The philosophers in town say fire is just chemistry. Poor things.' } },
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'Je suis l’interprète de l’interprète. C’est un poste à responsabilités.', en: 'I am the interpreter’s interpreter. It’s a position of great responsibility.' } },
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'On a des colonnes, maintenant. Il ne les a pas remarquées.', en: 'We have columns now. It hasn’t noticed.' } },
      ],
    },
    {
      id: 'chaudiere', band: 5, delayMin: 30, stage: 3,
      title: { fr: 'La chaudière', en: 'The boiler' },
      chronicle: {
        fr: 'Le feu dormait désormais dans une chaudière de fonte. Il sifflait. Les fidèles y entendaient des voyelles.',
        en: 'The fire now slept inside an iron boiler. It whistled. The faithful heard vowels in it.',
      },
      cast: [
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'On l’a mis dans la fonte. Il fait plus de bruit qu’avant. On pense que c’est bon signe.', en: 'We put it in iron. It makes more noise than before. We think that’s a good sign.' } },
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'Il siffle, maintenant. Personne n’ose dire que c’est la soupape.', en: 'It whistles now. Nobody dares say it’s the valve.' } },
        { ct: 0, who: { fr: 'Le pelleteur', en: 'The stoker' }, line: { fr: 'Pelleteur de première classe. C’est un titre héréditaire.', en: 'Stoker, first class. It’s a hereditary title.' } },
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'L’usine d’à côté a le même. On ne leur adresse pas la parole.', en: 'The factory next door has the same one. We don’t speak to them.' } },
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'Le soir, on lui fait la lecture. Il préfère les histoires où quelqu’un se réchauffe.', en: 'In the evenings we read to it. It prefers stories where someone gets warm.' } },
      ],
    },
    {
      id: 'enseigne', band: 6, delayMin: 30, stage: 4,
      title: { fr: 'L’enseigne', en: 'The sign' },
      chronicle: {
        fr: 'Le feu était devenu une enseigne rouge qui grésillait au bord de la ville. Ils avaient une grammaire entière pour ses clignotements.',
        en: 'The fire had become a red sign buzzing at the edge of town. They had an entire grammar for its flickering.',
      },
      cast: [
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'Deux clignotements longs, un court. On a toute une grammaire, maintenant.', en: 'Two long flickers, one short. We have a whole grammar now.' } },
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'La compagnie d’électricité dit que c’est un faux contact. Nous, on dit que c’est un contact.', en: 'The power company says it’s a loose connection. We say it’s a connection.' } },
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'Les feux ont été interdits. On l’a remplacé par une enseigne. Il n’a pas eu l’air de nous en vouloir.', en: 'Open fires were banned. We replaced it with a sign. It didn’t seem to hold it against us.' } },
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'Cette nuit, il a grésillé « ATTEN ». Il manquait des lettres. On travaille dessus.', en: 'Last night it buzzed “WAI”. Some letters were missing. We’re working on it.' } },
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'Il ne s’éteint jamais. C’est le signe que tout va bien. Ou qu’on a perdu l’interrupteur.', en: 'It never goes out. That’s the sign everything is fine. Or that we lost the switch.' } },
      ],
    },
    {
      id: 'etoile', band: 8, delayMin: 35, stage: 5,
      title: { fr: 'L’étoile', en: 'The star' },
      chronicle: {
        fr: 'Ils regardaient le ciel. Le premier feu avait été trop petit, disaient-ils ; celui-là, au moins, ne pouvait pas les ignorer. Une braise du premier feu dormait dans une boîte.',
        en: 'They were watching the sky. The first fire had been too small, they said; this one, at least, could not ignore them. An ember from the first fire slept in a box.',
      },
      cast: [
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'Nous avons compris. Il était trop petit. Celui-ci ne pourra pas faire semblant de ne pas nous voir.', en: 'We understand now. It was too small. This one can’t pretend not to see us.' } },
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'Elle est à quatre cents années-lumière. On s’est dit qu’elle répondrait en différé.', en: 'It’s four hundred light-years away. We figured it would answer on a delay.' } },
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'Ma fille dit que les étoiles ne parlent pas. Ma fille a onze ans.', en: 'My daughter says stars don’t talk. My daughter is eleven.' } },
        { ct: 0, who: { fr: 'Le gardien de la boîte', en: 'The keeper of the box' }, line: { fr: 'On a gardé une braise du premier feu. Dans une boîte. Au cas où.', en: 'We kept an ember from the first fire. In a box. Just in case.' } },
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'Une étoile, c’est un feu qui a réussi.', en: 'A star is a fire that made it.' } },
      ],
    },
    {
      id: 'parole', band: 9, delayMin: 40, stage: 6,
      title: { fr: 'La parole', en: 'The word' },
      chronicle: {
        fr: 'Ils avaient rallumé la braise du premier feu, à la lisière, là où tout avait commencé. Et le feu avait parlé : « Vous auriez pu remettre une bûche. » Personne n’a su s’il était en colère.',
        en: 'They had rekindled the ember of the first fire, at the edge of the woods, where it all began. And the fire spoke: “You could have added a log.” No one could tell whether it was angry.',
      },
      cast: [
        { ct: -1, who: { fr: 'Le Feu', en: 'The Fire' }, line: { fr: 'Vous auriez pu remettre une bûche.', en: 'You could have added a log.' } },
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'Il a parlé. Il a PARLÉ.', en: 'It spoke. It SPOKE.' } },
        { ct: 0, who: { fr: 'Un fidèle', en: 'A believer' }, line: { fr: 'Dix mille ans. Dix mille ans qu’il avait froid, en fait.', en: 'Ten thousand years. It was just cold for ten thousand years.' } },
        { ct: 0, who: { fr: 'Le plus vieux', en: 'The eldest' }, line: { fr: 'On aurait dû y penser.', en: 'We should have thought of that.' } },
        { ct: 1, who: { fr: 'Une fidèle', en: 'A believer' }, line: { fr: 'Est-ce qu’il est fâché ? Il a l’air fâché. Quelqu’un a une bûche ?', en: 'Is it angry? It sounds angry. Does anyone have a log?' } },
      ],
    },
  ],
  trace: { fr: 'Le cercle de pierres', en: 'The stone circle' },
};

// ── 2. LA TORTUE DE ZÉNON ──────────────────────────────────────────────────
// Profondeur douce. Elle traverse le monde en toute la partie : à chaque chapitre,
// elle parcourt la moitié de ce qui lui reste (le paradoxe) — et au dernier, elle
// arrive. Une lignée d’Achille la poursuit… ou l’accompagne.
const TORTUE = {
  id: 'tortue',
  title: { fr: 'La Tortue de Zénon', en: 'Zeno’s Tortoise' },
  place: 'chemin',
  chapters: [
    {
      id: 'depart', band: 0, delayMin: 0, stage: 0,
      title: { fr: 'Le départ', en: 'Setting out' },
      chronicle: {
        fr: 'Une tortue s’était mise en marche au bord du monde. Elle allait de l’autre côté.',
        en: 'A tortoise had set out from the edge of the world. She was going to the other side.',
      },
      cast: [
        { ct: -1, who: { fr: 'La tortue', en: 'The tortoise' }, line: { fr: 'Je vais de l’autre côté du monde. Non, rien ne presse.', en: 'I’m going to the other side of the world. No, there’s no hurry.' } },
      ],
    },
    {
      id: 'moitie', band: 2, delayMin: 30, stage: 1,
      title: { fr: 'La moitié', en: 'Halfway' },
      chronicle: {
        fr: 'La tortue avait fait la moitié du chemin. Il lui restait l’autre moitié.',
        en: 'The tortoise was halfway there. The other half remained.',
      },
      cast: [
        { ct: -1, who: { fr: 'La tortue', en: 'The tortoise' }, line: { fr: 'J’ai fait la moitié du chemin. Il me reste la moitié. C’est encourageant.', en: 'I’ve done half the way. Half remains. That’s encouraging.' } },
      ],
    },
    {
      id: 'achille', band: 4, delayMin: 30, stage: 2,
      title: { fr: 'Le paradoxe', en: 'The paradox' },
      chronicle: {
        fr: 'Un coureur nommé Achille avait défié la tortue. Un philosophe avait démontré qu’il ne la rattraperait jamais. Achille avait couru quand même.',
        en: 'A runner named Achilles had challenged the tortoise. A philosopher proved he would never catch her. Achilles ran anyway.',
      },
      cast: [
        { ct: -1, who: { fr: 'La tortue', en: 'The tortoise' }, line: { fr: 'Quand il arrivera là où je suis, j’aurai avancé. Un peu. Toujours un peu.', en: 'By the time he reaches where I am, I’ll have moved on. A little. Always a little.' } },
        { ct: 0, who: { fr: 'Achille', en: 'Achilles' }, line: { fr: 'Je te laisse une longueur d’avance, la vieille. Par politesse.', en: 'I’ll give you a head start, old girl. Out of politeness.' } },
      ],
    },
    {
      id: 'velocipede', band: 5, delayMin: 30, stage: 3,
      title: { fr: 'Le vélocipède', en: 'The velocipede' },
      chronicle: {
        fr: 'Le petit-fils d’Achille la poursuivait en vélocipède. Il gagnait du terrain : la moitié du terrain.',
        en: 'Achilles’ grandson pursued her on a velocipede. He was gaining ground: half of the ground.',
      },
      cast: [
        { ct: -1, who: { fr: 'La tortue', en: 'The tortoise' }, line: { fr: 'Ton grand-père courait bien. Il avait de belles jambes.', en: 'Your grandfather ran well. He had lovely legs.' } },
        { ct: 0, who: { fr: 'Achille II', en: 'Achilles II' }, line: { fr: 'Mon grand-père a perdu. Pas moi. Moi, j’ai une machine.', en: 'My grandfather lost. Not me. I have a machine.' } },
      ],
    },
    {
      id: 'reacteur', band: 6, delayMin: 30, stage: 4,
      title: { fr: 'Les sponsors', en: 'The sponsors' },
      chronicle: {
        fr: 'Achille IV avait un réacteur dorsal et des sponsors. La tortue avait la moitié de la moitié de la moitié du chemin derrière elle.',
        en: 'Achilles IV had a jetpack and sponsors. The tortoise had half of half of half the way behind her.',
      },
      cast: [
        { ct: -1, who: { fr: 'La tortue', en: 'The tortoise' }, line: { fr: 'Tu fais beaucoup de bruit pour quelqu’un qui arrive toujours après moi.', en: 'You make a lot of noise for someone who always arrives after me.' } },
        { ct: 0, who: { fr: 'Achille IV', en: 'Achilles IV' }, line: { fr: 'Cette fois, c’est la bonne. On est en direct.', en: 'This time’s the one. We’re live.' } },
      ],
    },
    {
      id: 'lumiere', band: 8, delayMin: 35, stage: 5,
      title: { fr: 'Presque', en: 'Almost' },
      chronicle: {
        fr: 'Achille VII frôlait la vitesse de la lumière. Il frôlait aussi la tortue. Il la frôlait depuis des siècles.',
        en: 'Achilles VII was brushing the speed of light. He was also brushing the tortoise. He had been brushing her for centuries.',
      },
      cast: [
        { ct: -1, who: { fr: 'La tortue', en: 'The tortoise' }, line: { fr: 'Moi aussi, je vais presque. C’est tout le secret.', en: 'I’m almost going too. That’s the whole secret.' } },
        { ct: 0, who: { fr: 'Achille VII', en: 'Achilles VII' }, line: { fr: 'Je vais presque à la vitesse de la lumière. Presque.', en: 'I’m going almost the speed of light. Almost.' } },
      ],
    },
    {
      id: 'arrivee', band: 9, delayMin: 40, stage: 6,
      title: { fr: 'L’arrivée', en: 'The arrival' },
      chronicle: {
        fr: 'La tortue avait touché l’autre bord du monde. Les descendants d’Achille l’y attendaient pour applaudir. Personne n’a jamais su s’ils l’avaient poursuivie ou accompagnée.',
        en: 'The tortoise reached the far edge of the world. Achilles’ descendants were waiting there to applaud. No one ever knew whether they had been chasing her or keeping her company.',
      },
      cast: [
        { ct: -1, who: { fr: 'La tortue', en: 'The tortoise' }, line: { fr: 'Je suis arrivée. Je pensais que ce serait plus loin.', en: 'I’ve arrived. I thought it would be farther.' } },
        { ct: 0, who: { fr: 'Achille IX', en: 'Achilles IX' }, line: { fr: 'On n’a jamais su si on la poursuivait ou si on l’accompagnait.', en: 'We never knew if we were chasing her or keeping her company.' } },
        { ct: 1, who: { fr: 'Une descendante d’Achille', en: 'A descendant of Achilles' }, line: { fr: 'Elle a gagné. Grand-père, si tu voyais ça. Elle a gagné.', en: 'She won. Grandfather, if you could see this. She won.' } },
      ],
    },
  ],
  trace: { fr: 'La tortue, endormie au bout du monde', en: 'The tortoise, asleep at the end of the world' },
};

// ── 3. LA CHÈVRE DES TOITS ─────────────────────────────────────────────────
// Humour absurde, et un clin d’œil : la chèvre de M. Seguin (Daudet) s’appelait
// Blanquette, et voulait la montagne. Celle-ci s’échappe d’âge en âge, toujours
// plus haut, chez des Seguin qui n’en reviennent pas — et un jour, elle rentre.
const CHEVRE = {
  id: 'chevre',
  title: { fr: 'La Chèvre des toits', en: 'The Rooftop Goat' },
  place: 'toit',
  chapters: [
    {
      id: 'enclos', band: 1, delayMin: 0, stage: 0, place: 'champ',
      title: { fr: 'L’enclos vide', en: 'The empty pen' },
      chronicle: {
        fr: 'La chèvre de M. Seguin, Blanquette, s’était échappée de son enclos. Elle avait pourtant une très longue corde.',
        en: 'Mr. Seguin’s goat, Blanquette, had escaped her pen. She had a very long rope, too.',
      },
      cast: [
        { ct: 0, who: { fr: 'M. Seguin', en: 'Mr. Seguin' }, line: { fr: 'Elle avait tout : de l’herbe, de l’eau, une corde longue comme ça. Si tu la vois, dis-lui de rentrer. Elle ne t’écoutera pas, mais dis-lui.', en: 'She had everything: grass, water, a rope this long. If you see her, tell her to come home. She won’t listen, but tell her.' } },
        { ct: -1, who: { fr: 'Blanquette', en: 'Blanquette' }, line: { fr: 'Mêêh.', en: 'Mehh.' } },
      ],
    },
    {
      id: 'toit', band: 2, delayMin: 25, stage: 1,
      title: { fr: 'Sur le toit', en: 'On the roof' },
      chronicle: {
        fr: 'On avait retrouvé Blanquette sur un toit. Elle mangeait la mousse et regardait les gens d’en haut.',
        en: 'Blanquette had been found on a roof. She was eating the moss and looking down at people.',
      },
      cast: [
        { ct: -1, who: { fr: 'Blanquette', en: 'Blanquette' }, line: { fr: 'Mêêêh.', en: 'Mehhh.' } },
        { ct: 1, who: { fr: 'La voisine', en: 'The neighbour' }, line: { fr: 'Elle est sur mon toit depuis l’aube. Elle mange la mousse. Elle me regarde.', en: 'She’s been on my roof since dawn. She’s eating the moss. She’s looking at me.' } },
      ],
    },
    {
      id: 'temple', band: 3, delayMin: 25, stage: 2,
      title: { fr: 'Un signe', en: 'A sign' },
      chronicle: {
        fr: 'Une descendante de Blanquette trônait au sommet d’un grand toit. Le prêtre y vit un signe ; les Seguin, une chèvre.',
        en: 'A descendant of Blanquette sat enthroned atop a great roof. The priest saw a sign in it; the Seguins saw a goat.',
      },
      cast: [
        { ct: -1, who: { fr: 'Blanquette', en: 'Blanquette' }, line: { fr: 'Mêh.', en: 'Meh.' } },
        { ct: 0, who: { fr: 'Un Seguin', en: 'A Seguin' }, line: { fr: 'C’est sa petite-fille. Elle a le même regard. Le prêtre dit que c’est un signe. Ma femme dit que c’est une chèvre.', en: 'That’s her granddaughter. Same look in her eye. The priest says it’s a sign. My wife says it’s a goat.' } },
      ],
    },
    {
      id: 'merveille', band: 4, delayMin: 25, stage: 3,
      title: { fr: 'Vingt minutes', en: 'Twenty minutes' },
      chronicle: {
        fr: 'Une Blanquette s’était hissée tout en haut. Les architectes avaient mis vingt ans à bâtir ; elle, vingt minutes à gravir.',
        en: 'A Blanquette had hauled herself to the very top. The architects had taken twenty years to build it; she took twenty minutes to climb it.',
      },
      cast: [
        { ct: -1, who: { fr: 'Blanquette', en: 'Blanquette' }, line: { fr: 'Mêêêêh.', en: 'Mehhhh.' } },
        { ct: 0, who: { fr: 'Un architecte', en: 'An architect' }, line: { fr: 'Vingt ans de travaux. Elle a mis vingt minutes à monter dessus. Vingt.', en: 'Twenty years of work. It took her twenty minutes to climb it. Twenty.' } },
      ],
    },
    {
      id: 'cheminee', band: 5, delayMin: 25, stage: 4,
      title: { fr: 'Les barbelés', en: 'The barbed wire' },
      chronicle: {
        fr: 'Blanquette avait élu domicile tout en haut, au-dessus des fumées. Les Seguin avaient essayé les barbelés. Elle les avait mangés.',
        en: 'Blanquette had taken up residence up high, above the smoke. The Seguins had tried barbed wire. She ate it.',
      },
      cast: [
        { ct: -1, who: { fr: 'Blanquette', en: 'Blanquette' }, line: { fr: 'Mêêh.', en: 'Mehh.' } },
        { ct: 1, who: { fr: 'Mme Seguin', en: 'Mrs. Seguin' }, line: { fr: 'On a mis des barbelés. Elle a mangé les barbelés. Je ne sais plus quoi vous dire.', en: 'We put up barbed wire. She ate the barbed wire. I don’t know what else to tell you.' } },
      ],
    },
    {
      id: 'connecte', band: 6, delayMin: 25, stage: 5,
      title: { fr: 'L’enclos connecté', en: 'The smart pen' },
      chronicle: {
        fr: 'On l’aperçut perchée sous les néons. Les Seguin lui avaient offert un enclos connecté ; elle l’avait débranché.',
        en: 'She was spotted perched among the neon. The Seguins had bought her a smart pen; she unplugged it.',
      },
      cast: [
        { ct: -1, who: { fr: 'Blanquette', en: 'Blanquette' }, line: { fr: 'Mêh.', en: 'Meh.' } },
        { ct: 0, who: { fr: 'Un Seguin', en: 'A Seguin' }, line: { fr: 'On lui a acheté un enclos connecté. Avec une application. Elle l’a débranché avec les dents.', en: 'We bought her a smart pen. With an app. She unplugged it with her teeth.' } },
      ],
    },
    {
      id: 'nuages', band: 8, delayMin: 30, stage: 6,
      title: { fr: 'Plus haut que les nuages', en: 'Above the clouds' },
      chronicle: {
        fr: 'Blanquette broutait au sommet d’une flèche plus haute que les nuages. Elle redescendrait quand elle aurait faim. Elle n’avait jamais faim.',
        en: 'Blanquette was grazing atop a spire higher than the clouds. She would come down when she got hungry. She was never hungry.',
      },
      cast: [
        { ct: -1, who: { fr: 'Blanquette', en: 'Blanquette' }, line: { fr: 'Mêêêh.', en: 'Mehhh.' } },
        { ct: 1, who: { fr: 'Une Seguin', en: 'A Seguin' }, line: { fr: 'Elle redescendra quand elle aura faim. Elle n’a jamais faim.', en: 'She’ll come down when she’s hungry. She’s never hungry.' } },
      ],
    },
    {
      id: 'retour', band: 9, delayMin: 35, stage: 7, place: 'champ',
      title: { fr: 'La barrière ouverte', en: 'The open gate' },
      chronicle: {
        fr: 'Blanquette était rentrée dans son enclos, une nuit, sans un bruit. Elle avait l’air d’avoir tout vu. Les Seguin n’ont pas refermé la barrière.',
        en: 'Blanquette came back to her pen one night, without a sound. She looked like she had seen everything. The Seguins did not close the gate.',
      },
      cast: [
        { ct: 0, who: { fr: 'Le dernier Seguin', en: 'The last Seguin' }, line: { fr: 'Elle est rentrée cette nuit. Toute seule. On ne sait pas d’où. Elle a l’air d’avoir tout vu.', en: 'She came home last night. On her own. No one knows from where. She looks like she’s seen everything.' } },
        { ct: -1, who: { fr: 'Blanquette', en: 'Blanquette' }, line: { fr: '…', en: '…' } },
      ],
    },
  ],
  trace: { fr: 'L’enclos à la barrière ouverte', en: 'The pen with the open gate' },
};

// ── 4. LE CYNIQUE ──────────────────────────────────────────────────────────
// Diogène, poussé à fond : une anecdote vraie par âge, transposée. Un chien le
// suit partout (« cynique » vient de « chien »). Profondeur ET esprit. Au
// Démiurge, c’est le joueur qui joue Alexandre.
const CYNIQUE = {
  id: 'cynique',
  title: { fr: 'Le Cynique', en: 'The Cynic' },
  place: 'place',
  chapters: [
    {
      id: 'jarre', band: 1, delayMin: 0, stage: 0,
      title: { fr: 'La jarre', en: 'The jar' },
      chronicle: {
        fr: 'Un homme vivait dans une grande jarre couchée, avec un chien. Il disait qu’une maison ne devrait rien demander. Il s’appelait Diogène.',
        en: 'A man lived in a great jar lying on its side, with a dog. He said a house should ask for nothing. His name was Diogenes.',
      },
      cast: [
        { ct: 0, who: { fr: 'Diogène', en: 'Diogenes' }, line: { fr: 'Une jarre, c’est une maison qui ne demande rien. Pas de toit à refaire, pas de voisin. Juste du soleil, quand on ne me le cache pas.', en: 'A jar is a house that asks for nothing. No roof to mend, no neighbours. Just sunlight, when nobody blocks it.' } },
      ],
    },
    {
      id: 'ecuelle', band: 2, delayMin: 30, stage: 1,
      title: { fr: 'L’écuelle', en: 'The bowl' },
      chronicle: {
        fr: 'Diogène avait vu un enfant boire dans le creux de ses mains, et il avait jeté son écuelle. Un enfant, disait-il, l’avait battu en simplicité.',
        en: 'Diogenes saw a child drinking from cupped hands, and he threw away his bowl. A child, he said, had beaten him at simplicity.',
      },
      cast: [
        { ct: 0, who: { fr: 'Diogène', en: 'Diogenes' }, line: { fr: 'Cet enfant boit dans ses mains. Et moi, je traînais une écuelle. Un enfant m’a battu en simplicité. Ça m’apprendra.', en: 'That child drinks from his hands. And me, lugging a bowl around. A child beat me at simplicity. That’ll teach me.' } },
        { ct: 2, who: { fr: 'Un enfant', en: 'A child' }, line: { fr: 'Pourquoi il a jeté son bol, le monsieur ? Il était très bien, son bol.', en: 'Why did the man throw his bowl away? It was a good bowl.' } },
      ],
    },
    {
      id: 'statue', band: 3, delayMin: 30, stage: 2,
      title: { fr: 'La statue', en: 'The statue' },
      chronicle: {
        fr: 'On l’avait vu tendre la main à une statue, des heures durant. Il s’exerçait, disait-il, à essuyer des refus.',
        en: 'He was seen holding out his hand to a statue for hours on end. He was practising, he said, at being refused.',
      },
      cast: [
        { ct: 0, who: { fr: 'Diogène', en: 'Diogenes' }, line: { fr: 'Je m’exerce à essuyer des refus. Elle est très douée.', en: 'I’m practising being refused. She’s very good at it.' } },
      ],
    },
    {
      id: 'soleil', band: 4, delayMin: 30, stage: 3,
      title: { fr: 'Le soleil', en: 'The sun' },
      chronicle: {
        fr: 'Diogène vivait dans un tonneau, sur la place. Quand on s’était approché pour lui demander ce qu’il désirait, il avait répondu : « Ôte-toi de mon soleil. »',
        en: 'Diogenes lived in a barrel on the square. When someone came close to ask what he desired, he answered: “Stand out of my sunlight.”',
      },
      cast: [
        { ct: 0, who: { fr: 'Diogène', en: 'Diogenes' }, line: { fr: 'Ce que je désire ? Que tu t’ôtes de mon soleil.', en: 'What do I desire? For you to stand out of my sunlight.' } },
      ],
    },
    {
      id: 'poulet', band: 4, delayMin: 30, stage: 4, place: 'batiment:academies',
      title: { fr: 'L’homme de Platon', en: 'Plato’s man' },
      chronicle: {
        fr: 'Les savants avaient défini l’homme comme un bipède sans plumes. Diogène avait plumé un poulet et l’avait brandi devant eux : « Voici l’homme de Platon. » Ils avaient ajouté « aux ongles plats » à leur définition.',
        en: 'The scholars had defined man as a featherless biped. Diogenes plucked a chicken and held it up before them: “Behold Plato’s man.” They added “with broad flat nails” to their definition.',
      },
      cast: [
        { ct: 0, who: { fr: 'Diogène', en: 'Diogenes' }, line: { fr: 'Un bipède sans plumes, disiez-vous ? Voici l’homme de Platon.', en: 'A featherless biped, you said? Behold Plato’s man.' } },
        { ct: 0, who: { fr: 'Un savant', en: 'A scholar' }, line: { fr: 'Ajoutez « aux ongles plats ». Et que quelqu’un rende ce poulet à son propriétaire.', en: 'Add “with broad flat nails”. And someone return that chicken to its owner.' } },
      ],
    },
    {
      id: 'reculons', band: 5, delayMin: 30, stage: 5, place: 'rue',
      title: { fr: 'À reculons', en: 'Backwards' },
      chronicle: {
        fr: 'Il marchait à reculons, à contre-courant de la foule des ouvriers. Il fallait bien, disait-il, que quelqu’un regarde d’où ils venaient.',
        en: 'He walked backwards, against the flow of the factory crowds. Someone, he said, had to look at where they came from.',
      },
      cast: [
        { ct: 0, who: { fr: 'Diogène', en: 'Diogenes' }, line: { fr: 'Vous marchez tous dans le même sens. Il faut bien que quelqu’un regarde d’où vous venez.', en: 'You all walk the same way. Somebody has to look at where you came from.' } },
      ],
    },
    {
      id: 'lanterne', band: 6, delayMin: 30, stage: 6, night: false,
      title: { fr: 'La lanterne', en: 'The lantern' },
      chronicle: {
        fr: 'En plein midi, sous les néons, il promenait une lanterne allumée. Il cherchait un humain.',
        en: 'At high noon, under the neon, he walked about with a lit lantern. He was looking for a human being.',
      },
      cast: [
        { ct: 0, who: { fr: 'Diogène', en: 'Diogenes' }, line: { fr: 'Je cherche un humain. Toi ? Montre-moi tes mains. … Je continue de chercher.', en: 'I’m looking for a human. You? Show me your hands. … I’ll keep looking.' } },
      ],
    },
    {
      id: 'reseau', band: 7, delayMin: 35, stage: 7,
      title: { fr: 'Hors réseau', en: 'Offline' },
      chronicle: {
        fr: 'Dans la ville où tous les esprits pensaient ensemble, lui seul restait débranché. C’était plus lent, disait-il, mais c’était à lui.',
        en: 'In the city where every mind thought together, he alone stayed unplugged. It was slower, he said, but it was his.',
      },
      cast: [
        { ct: 0, who: { fr: 'Diogène', en: 'Diogenes' }, line: { fr: 'Ils pensent tous ensemble. Moi, je pense tout seul. C’est plus lent, mais c’est à moi.', en: 'They all think together. I think alone. It’s slower, but it’s mine.' } },
      ],
    },
    {
      id: 'capsule', band: 8, delayMin: 35, stage: 8,
      title: { fr: 'La capsule', en: 'The capsule' },
      chronicle: {
        fr: 'Il vivait dans une capsule de survie vide, tournée vers une étoile. On lui avait demandé ce qu’il voulait. « Ôtez-vous de mon étoile. »',
        en: 'He lived in an empty escape pod, turned toward a star. Someone asked what he wanted. “Stand out of my starlight.”',
      },
      cast: [
        { ct: 0, who: { fr: 'Diogène', en: 'Diogenes' }, line: { fr: 'Ce que je veux ? Ôtez-vous de mon étoile.', en: 'What do I want? Stand out of my starlight.' } },
      ],
    },
    {
      id: 'alexandre', band: 9, delayMin: 40, stage: 9,
      title: { fr: 'Alexandre', en: 'Alexander' },
      chronicle: {
        fr: 'Le Démiurge en personne était venu voir Diogène et lui avait offert tout ce qu’il voudrait. Il avait demandé la même chose qu’à Alexandre, bien des âges plus tôt. On dit que le Démiurge, en repartant, a murmuré qu’il aurait voulu être Diogène.',
        en: 'The Demiurge came in person to see Diogenes and offered him anything he wished. He asked for the same thing he had asked of Alexander, many ages before. They say the Demiurge, walking away, murmured a wish to have been Diogenes.',
      },
      cast: [
        { ct: 0, who: { fr: 'Diogène', en: 'Diogenes' }, line: { fr: 'Tu es le Démiurge ? Tu peux tout ? Alors ôte-toi de mon soleil. Comme l’autre, la dernière fois.', en: 'You’re the Demiurge? You can do anything? Then stand out of my sunlight. Like the other one, last time.' } },
      ],
    },
  ],
  // Le re-clic : Diogène a toujours quelque chose à dire.
  lines: [
    { fr: 'Les riches ont des maisons. Moi, j’ai le temps.', en: 'The rich have houses. I have time.' },
    { fr: 'On me traite de chien. Les chiens, au moins, mordent ceux qui le méritent.', en: 'They call me a dog. At least dogs bite those who deserve it.' },
    { fr: 'La pauvreté n’est pas un manque. C’est de la place.', en: 'Poverty is not a lack. It’s room.' },
    { fr: 'Je suis citoyen du monde. Le monde ne paie pas d’impôts.', en: 'I am a citizen of the world. The world pays no taxes.' },
    { fr: 'Tu veux un conseil ? N’en demande pas.', en: 'You want advice? Don’t ask for any.' },
    { fr: 'Ceux qui ont tout ont surtout peur.', en: 'Those who have everything mostly have fear.' },
    { fr: 'Le soleil entre partout, même chez les rois. Il ne s’en vante pas.', en: 'The sun goes everywhere, even into kings’ houses. It doesn’t boast about it.' },
    { fr: 'Tu me regardes depuis tout à l’heure. Il y a une merveille, là-bas, qui a coûté une fortune. Va la regarder, elle.', en: 'You’ve been staring at me for a while. There’s a wonder over there that cost a fortune. Go stare at that.' },
    { fr: 'Les savants mesurent les étoiles et marchent dans les flaques.', en: 'Scholars measure the stars and step in puddles.' },
    { fr: 'Je ne suis pas pauvre. Je suis léger.', en: 'I’m not poor. I’m light.' },
    { fr: 'On m’a demandé d’où je venais. J’ai répondu : du monde. Où j’allais ? Même réponse.', en: 'They asked where I came from. I said: the world. Where I was going? Same answer.' },
    { fr: 'Il y a deux sortes de gens : ceux qui veulent quelque chose, et moi.', en: 'There are two kinds of people: those who want something, and me.' },
    { fr: 'Mon chien n’a besoin de rien non plus. On s’entend bien.', en: 'My dog doesn’t need anything either. We get along.' },
    { fr: 'Le plus beau, chez l’homme ? La franchise. On n’en voit presque jamais.', en: 'The finest thing in a man? Frankness. You almost never see it.' },
    { fr: 'Tu peux rester. Mais un peu plus à gauche. Là. Le soleil.', en: 'You can stay. But a bit to the left. There. The sun.' },
  ],
  trace: { fr: 'Le tonneau, où dort le chien', en: 'The barrel, where the dog sleeps' },
};

// ── 5. L’HOMME-VOLANT ──────────────────────────────────────────────────────
// Humour tendre. Les Grandvent, d’âge en âge, au bord de l’eau, avec des badauds.
// Ils sautent, ils tombent dans le fleuve, ils recommencent. La fin dit ce que
// tout le monde savait sans le dire.
const VOLANT = {
  id: 'volant',
  title: { fr: 'Les Grandvent', en: 'The Grandvents' },
  place: 'berge',
  night: false,
  chapters: [
    {
      id: 'plumes', band: 2, delayMin: 0, stage: 0,
      title: { fr: 'Les plumes', en: 'Feathers' },
      chronicle: {
        fr: 'Un certain Grandvent s’était collé des plumes aux bras et s’était jeté de la berge. Il avait volé un peu, surtout vers le bas.',
        en: 'A man named Grandvent glued feathers to his arms and leapt from the riverbank. He flew a little, mostly downward.',
      },
      cast: [
        { ct: 0, who: { fr: 'Grandvent', en: 'Grandvent' }, line: { fr: 'Les oiseaux le font bien. Et les oiseaux sont bêtes.', en: 'Birds manage it. And birds are stupid.' } },
        { ct: 1, who: { fr: 'Une badaude', en: 'An onlooker' }, line: { fr: 'Il a dit ça hier, aussi.', en: 'He said that yesterday, too.' } },
        { ct: 2, who: { fr: 'Un enfant', en: 'A child' }, line: { fr: 'Encore ! Encore !', en: 'Again! Again!' } },
      ],
    },
    {
      id: 'catapulte', band: 3, delayMin: 30, stage: 1,
      title: { fr: 'La catapulte', en: 'The catapult' },
      chronicle: {
        fr: 'Son petit-fils avait emprunté une catapulte aux armées du roi. Il avait franchi le fleuve. Presque.',
        en: 'His grandson borrowed a catapult from the king’s army. He cleared the river. Almost.',
      },
      cast: [
        { ct: 0, who: { fr: 'Grandvent', en: 'Grandvent' }, line: { fr: 'Le principe est bon. C’est l’atterrissage qui manque de principes.', en: 'The principle is sound. It’s the landing that lacks principles.' } },
        { ct: 0, who: { fr: 'L’ingénieur du roi', en: 'The king’s engineer' }, line: { fr: 'Le roi veut savoir si on peut s’en servir à la guerre. Je vais lui dire que non.', en: 'The king wants to know if this can be used in war. I’m going to tell him no.' } },
        { ct: 1, who: { fr: 'Une badaude', en: 'An onlooker' }, line: { fr: 'Son grand-père faisait pareil, avec des plumes. Ça se transmet.', en: 'His grandfather did the same, with feathers. It runs in the family.' } },
      ],
    },
    {
      id: 'icare', band: 4, delayMin: 30, stage: 2,
      title: { fr: 'Icare', en: 'Icarus' },
      chronicle: {
        fr: 'Un Grandvent se faisait appeler Icare. Personne ne lui avait raconté la fin de l’histoire. Il ne montait de toute façon pas assez haut pour qu’elle le concerne.',
        en: 'A Grandvent called himself Icarus. No one had told him how that story ends. In any case he never got high enough for it to apply.',
      },
      cast: [
        { ct: 0, who: { fr: '« Icare »', en: '“Icarus”' }, line: { fr: 'Appelez-moi Icare. Non, pas pour la fin. Pour le début.', en: 'Call me Icarus. No, not for the ending. For the beginning.' } },
        { ct: 1, who: { fr: 'Une badaude', en: 'An onlooker' }, line: { fr: 'Il paraît qu’il ne faut pas voler trop près du soleil. Je ne crois pas qu’il y ait le moindre risque.', en: 'They say you shouldn’t fly too close to the sun. I don’t think there’s any risk of that.' } },
      ],
    },
    {
      id: 'montgolfiere', band: 5, delayMin: 30, stage: 3,
      title: { fr: 'Le dimanche', en: 'Sunday' },
      chronicle: {
        fr: 'Le ballon des Grandvent s’était élevé au-dessus des toits, un dimanche. Il était redescendu dans le fleuve, un dimanche aussi.',
        en: 'The Grandvents’ balloon rose above the rooftops one Sunday. It came down in the river, also on a Sunday.',
      },
      cast: [
        { ct: 0, who: { fr: 'Grandvent', en: 'Grandvent' }, line: { fr: 'Ça monte ! Ça monte ! … Comment ça descend ?', en: 'It’s rising! It’s rising! … How does it come down?' } },
        { ct: 0, who: { fr: 'Un badaud', en: 'An onlooker' }, line: { fr: 'J’ai parié sur le fleuve. Je parie toujours sur le fleuve.', en: 'I bet on the river. I always bet on the river.' } },
      ],
    },
    {
      id: 'reacteur', band: 6, delayMin: 30, stage: 4,
      title: { fr: 'Trois secondes', en: 'Three seconds' },
      chronicle: {
        fr: 'Le réacteur dorsal de Grandvent avait tenu trois secondes en l’air. Un record familial.',
        en: 'Grandvent’s jetpack held him in the air for three seconds. A family record.',
      },
      cast: [
        { ct: 0, who: { fr: 'Grandvent', en: 'Grandvent' }, line: { fr: 'Trois secondes ! Un record familial. Mon arrière-grand-père en aurait pleuré.', en: 'Three seconds! A family record. My great-grandfather would have wept.' } },
        { ct: 1, who: { fr: 'Une badaude', en: 'An onlooker' }, line: { fr: 'On vient tous les ans. C’est devenu une tradition. On apporte des serviettes.', en: 'We come every year. It’s a tradition now. We bring towels.' } },
      ],
    },
    {
      id: 'vertige', band: 8, delayMin: 35, stage: 5,
      title: { fr: 'Le vertige', en: 'Vertigo' },
      chronicle: {
        fr: 'Un Grandvent volait enfin. Il découvrit, à cette occasion, qu’il avait le vertige. Toute la famille s’est posé des questions.',
        en: 'A Grandvent was finally flying. On that occasion he discovered he was afraid of heights. The whole family had some questions.',
      },
      cast: [
        { ct: 0, who: { fr: 'Grandvent', en: 'Grandvent' }, line: { fr: 'Je vole. Je vole vraiment. Est-ce que quelqu’un peut me faire redescendre ? Je n’aime pas trop la hauteur.', en: 'I’m flying. I’m really flying. Could somebody get me down? I’m not fond of heights.' } },
        { ct: 1, who: { fr: 'Une badaude', en: 'An onlooker' }, line: { fr: 'Dix générations pour en arriver là.', en: 'Ten generations to get here.' } },
      ],
    },
    {
      id: 'regard', band: 9, delayMin: 40, stage: 6,
      title: { fr: 'Ceux qui regardent', en: 'Those who watch' },
      chronicle: {
        fr: 'Le dernier Grandvent avait rangé ses ailes. Sa famille, disait-il, n’avait jamais vraiment voulu voler : elle voulait qu’on la regarde. Et quelqu’un, toujours, avait regardé.',
        en: 'The last Grandvent put away his wings. His family, he said, never truly wanted to fly: they wanted to be watched. And someone, always, had watched.',
      },
      cast: [
        { ct: 0, who: { fr: 'Le dernier Grandvent', en: 'The last Grandvent' }, line: { fr: 'J’ai compris quelque chose. On n’a jamais voulu voler. On voulait qu’on nous regarde. Et toi, tu as toujours regardé. Merci.', en: 'I understood something. We never wanted to fly. We wanted to be watched. And you always watched. Thank you.' } },
      ],
    },
  ],
  trace: { fr: 'Une plaque au bord de l’eau', en: 'A plaque by the water' },
};

// ── 6. LA QUERELLE DE LA BORNE ─────────────────────────────────────────────
// Humour de farce, sur dix âges. Les Pinçon contre les Gratteloup.
const BORNE = {
  id: 'borne',
  title: { fr: 'La Querelle de la Borne', en: 'The Boundary Stone Feud' },
  place: 'champ',
  night: false,
  chapters: [
    {
      id: 'borne', band: 2, delayMin: 0, stage: 0,
      title: { fr: 'La borne', en: 'The stone' },
      chronicle: {
        fr: 'Deux voisins, Pinçon et Gratteloup, se disputaient une borne plantée entre leurs champs. Chacun jurait que l’autre l’avait déplacée pendant la nuit.',
        en: 'Two neighbours, Pinçon and Gratteloup, were arguing over a stone set between their fields. Each swore the other had moved it in the night.',
      },
      cast: [
        { ct: 0, who: { fr: 'Pinçon', en: 'Pinçon' }, line: { fr: 'Elle était à trois pas d’ici. Il l’a déplacée la nuit. Je le sais, je l’ai entendue rouler.', en: 'It was three paces from here. He moved it in the night. I know, I heard it roll.' } },
        { ct: 0, who: { fr: 'Gratteloup', en: 'Gratteloup' }, line: { fr: 'Elle a toujours été là. C’est lui qui a déplacé son champ.', en: 'It’s always been right here. He’s the one who moved his field.' } },
      ],
    },
    {
      id: 'duel', band: 3, delayMin: 30, stage: 1,
      title: { fr: 'L’honneur de la borne', en: 'The honour of the stone' },
      chronicle: {
        fr: 'Leurs petits-fils s’étaient battus en duel pour l’honneur de la borne. Il n’y avait eu aucun blessé : ils étaient très mauvais.',
        en: 'Their grandsons fought a duel for the honour of the stone. No one was hurt: they were both terrible.',
      },
      cast: [
        { ct: 0, who: { fr: 'Pinçon', en: 'Pinçon' }, line: { fr: 'En garde ! Pour l’honneur de la borne !', en: 'En garde! For the honour of the stone!' } },
        { ct: 0, who: { fr: 'Gratteloup', en: 'Gratteloup' }, line: { fr: 'Mon grand-père avait raison, et je vais le prouver avec ceci. Comment on le tient, déjà ?', en: 'My grandfather was right, and I shall prove it with this. How do you hold it again?' } },
        { ct: 1, who: { fr: 'Une passante', en: 'A passer-by' }, line: { fr: 'Ils se battent pour un caillou ? — Pour LE caillou, madame.', en: 'They’re fighting over a rock? — Over THE rock, madam.' } },
      ],
    },
    {
      id: 'proces', band: 4, delayMin: 30, stage: 2, place: 'place',
      title: { fr: 'Onze ans de procès', en: 'Eleven years in court' },
      chronicle: {
        fr: 'Le procès de la borne avait duré onze ans. Le juge avait proposé de la couper en deux ; les deux familles avaient refusé, pour une fois d’accord.',
        en: 'The trial of the stone lasted eleven years. The judge proposed cutting it in half; both families refused, for once in agreement.',
      },
      cast: [
        { ct: 0, who: { fr: 'Le juge', en: 'The judge' }, line: { fr: 'Ce procès dure depuis onze ans. Je propose qu’on coupe la borne en deux.', en: 'This trial has lasted eleven years. I propose we cut the stone in half.' } },
        { ct: 0, who: { fr: 'Pinçon', en: 'Pinçon' }, line: { fr: 'Jamais ! Mes titres remontent à l’âge de pierre !', en: 'Never! My deeds go back to the Stone Age!' } },
        { ct: 1, who: { fr: 'Gratteloup', en: 'Gratteloup' }, line: { fr: 'Jamais ! Pour une fois, je suis d’accord avec lui. Ça ne se reproduira pas.', en: 'Never! For once I agree with him. It won’t happen again.' } },
      ],
    },
    {
      id: 'pistolets', band: 5, delayMin: 30, stage: 3,
      title: { fr: 'Tous les mardis', en: 'Every Tuesday' },
      chronicle: {
        fr: 'Un Pinçon et un Gratteloup s’étaient battus au pistolet, à l’aube. Tous deux avaient raté. Ils ratèrent ainsi tous les mardis pendant quarante ans.',
        en: 'A Pinçon and a Gratteloup fought with pistols at dawn. Both missed. They kept missing every Tuesday for forty years.',
      },
      cast: [
        { ct: 0, who: { fr: 'Pinçon', en: 'Pinçon' }, line: { fr: 'J’ai raté. Lui aussi. On recommence mardi. On recommence depuis quarante ans.', en: 'I missed. So did he. Same time Tuesday. It’s been forty years of Tuesdays.' } },
        { ct: 0, who: { fr: 'Gratteloup', en: 'Gratteloup' }, line: { fr: 'Le jour où l’un de nous touche l’autre, je ne sais pas ce qu’on fera le mardi.', en: 'The day one of us hits the other, I don’t know what we’ll do with our Tuesdays.' } },
      ],
    },
    {
      id: 'television', band: 6, delayMin: 30, stage: 4, place: 'place',
      title: { fr: 'En direct', en: 'Live' },
      chronicle: {
        fr: 'Le procès de la borne était passé à la télévision. L’audience avait été excellente. La borne n’avait rien dit.',
        en: 'The trial of the stone was televised. The ratings were excellent. The stone said nothing.',
      },
      cast: [
        { ct: 1, who: { fr: 'La présentatrice', en: 'The host' }, line: { fr: 'Après la pause : la borne témoigne. Restez avec nous.', en: 'After the break: the stone testifies. Stay with us.' } },
        { ct: 0, who: { fr: 'Pinçon', en: 'Pinçon' }, line: { fr: 'Ma famille souffre depuis des générations. Je voudrais dire bonjour à ma mère.', en: 'My family has suffered for generations. I’d like to say hi to my mother.' } },
        { ct: 1, who: { fr: 'Gratteloup', en: 'Gratteloup' }, line: { fr: 'Je n’ai rien contre les Pinçon. À part tout.', en: 'I have nothing against the Pinçons. Except everything.' } },
      ],
    },
    {
      id: 'robots', band: 8, delayMin: 35, stage: 5,
      title: { fr: 'Les géants', en: 'The giants' },
      chronicle: {
        fr: 'Les deux familles s’affrontaient désormais avec des robots géants. Les champs avaient beaucoup souffert. La borne, pas du tout.',
        en: 'The two families now fought with giant robots. The fields suffered greatly. The stone, not at all.',
      },
      cast: [
        { ct: 1, who: { fr: 'Gratteloup', en: 'Gratteloup' }, line: { fr: 'Mon robot fait quarante mètres. Le sien en fait trente-neuf. Ça se jouera au mètre.', en: 'My robot is forty metres tall. His is thirty-nine. It’ll come down to the metre.' } },
        { ct: 0, who: { fr: 'Pinçon', en: 'Pinçon' }, line: { fr: 'Trente-neuf mètres cinquante. Je l’ai fait remesurer.', en: 'Thirty-nine and a half. I had it remeasured.' } },
      ],
    },
    {
      id: 'cousins', band: 9, delayMin: 40, stage: 6,
      title: { fr: 'Cousins', en: 'Cousins' },
      chronicle: {
        fr: 'Une savante avait examiné la borne : une météorite sans valeur, tombée bien avant les champs. Le même jour, les archives révélèrent qu’un Pinçon avait épousé une Gratteloup sous la Couronne. Ils étaient cousins. Ils ont dîné ensemble. Ils se sont disputé l’addition.',
        en: 'A scientist examined the stone: a worthless meteorite, fallen long before the fields. That same day the archives revealed that a Pinçon had married a Gratteloup under the Crown. They were cousins. They had dinner together. They argued over the bill.',
      },
      cast: [
        { ct: 1, who: { fr: 'La savante', en: 'The scientist' }, line: { fr: 'C’est une météorite. Elle ne vaut à peu près rien. Elle est tombée bien avant vous.', en: 'It’s a meteorite. It’s worth next to nothing. It fell long before your time.' } },
        { ct: 0, who: { fr: 'Pinçon', en: 'Pinçon' }, line: { fr: '… Cousin ?', en: '… Cousin?' } },
        { ct: 0, who: { fr: 'Gratteloup', en: 'Gratteloup' }, line: { fr: 'Cousin. C’est moi qui paie. — Non, c’est moi. — Non, moi.', en: 'Cousin. Dinner’s on me. — No, on me. — No, me.' } },
      ],
    },
  ],
  trace: { fr: 'La borne, et sa plaque', en: 'The stone, and its plaque' },
};

// ── 7. LE MONSTRE DU FLEUVE ────────────────────────────────────────────────
// Profondeur : la peur, la légende, puis la tendresse. Le premier pêcheur
// s’appelait Anselme ; le poisson finira par porter son nom.
const MONSTRE = {
  id: 'monstre',
  title: { fr: 'Le Monstre du fleuve', en: 'The River Monster' },
  place: 'berge',
  chapters: [
    {
      id: 'touche', band: 1, delayMin: 0, stage: 0, night: false,
      title: { fr: 'La touche', en: 'The bite' },
      chronicle: {
        fr: 'Un pêcheur nommé Anselme avait senti, au bout de sa ligne, quelque chose de plus gros que lui. Il avait lâché la canne.',
        en: 'A fisherman named Anselme felt something bigger than himself at the end of his line. He let go of the rod.',
      },
      cast: [
        { ct: 0, who: { fr: 'Anselme', en: 'Anselme' }, line: { fr: 'Il est gros. Il est très gros. Il est plus gros que moi. … Je lâche.', en: 'It’s big. It’s very big. It’s bigger than me. … I’m letting go.' } },
      ],
    },
    {
      id: 'aileron', band: 3, delayMin: 30, stage: 1, night: false,
      title: { fr: 'L’aileron', en: 'The fin' },
      chronicle: {
        fr: 'Un aileron avait fendu l’eau devant la berge. La foule l’avait vu. Le lendemain, plus personne n’en était sûr.',
        en: 'A fin split the water by the bank. The crowd saw it. By the next day, nobody was sure anymore.',
      },
      cast: [
        { ct: 1, who: { fr: 'Une lavandière', en: 'A washerwoman' }, line: { fr: 'Mon arrière-grand-père l’avait senti tirer. On ne le croyait pas. Maintenant, c’est moi qu’on ne croit pas.', en: 'My great-grandfather felt it pull. Nobody believed him. Now nobody believes me.' } },
        { ct: 0, who: { fr: 'Un badaud', en: 'An onlooker' }, line: { fr: 'C’était une branche. Une très grosse branche. Qui nageait.', en: 'It was a branch. A very big branch. That swam.' } },
      ],
    },
    {
      id: 'sousmarin', band: 5, delayMin: 30, stage: 2, night: false,
      title: { fr: 'Le périscope', en: 'The periscope' },
      chronicle: {
        fr: 'Un savant avait plongé à sa recherche dans un sous-marin à vapeur. Il en était ressorti trempé, sans preuve, mais convaincu.',
        en: 'A scientist dove in search of it in a steam submarine. He came up drenched, without proof, but convinced.',
      },
      cast: [
        { ct: 0, who: { fr: 'Le savant', en: 'The scientist' }, line: { fr: 'La science le trouvera. La science a un périscope. La science a aussi une fuite, mais c’est un détail.', en: 'Science will find it. Science has a periscope. Science also has a leak, but that’s a detail.' } },
      ],
    },
    {
      id: 'emission', band: 6, delayMin: 30, stage: 3, night: true,
      title: { fr: 'Trois nuits sur le quai', en: 'Three nights on the quay' },
      chronicle: {
        fr: 'Une équipe de télévision avait passé trois nuits au bord de l’eau. L’émission avait fait un triomphe. On n’y voyait que de l’eau.',
        en: 'A television crew spent three nights by the water. The programme was a triumph. All it showed was water.',
      },
      cast: [
        { ct: 1, who: { fr: 'La présentatrice', en: 'The host' }, line: { fr: 'Ce soir : le monstre existe-t-il ? Réponse après trois heures d’émission.', en: 'Tonight: does the monster exist? Answer after three hours of programming.' } },
        { ct: 0, who: { fr: 'Le caméraman', en: 'The cameraman' }, line: { fr: 'J’ai filmé l’eau pendant trois nuits. Elle est très bien, l’eau.', en: 'I filmed the water for three nights. It’s very nice water.' } },
      ],
    },
    {
      id: 'enfant', band: 8, delayMin: 35, stage: 4, night: true,
      title: { fr: 'Il m’a regardée', en: 'He looked at me' },
      chronicle: {
        fr: 'Une enfant l’avait vu remonter, un soir. Il l’avait regardée longtemps. Elle disait qu’il avait l’air vieux, et gentil.',
        en: 'A girl saw it surface one evening. It looked at her for a long time. She said it seemed old, and kind.',
      },
      cast: [
        { ct: 2, who: { fr: 'Une enfant', en: 'A girl' }, line: { fr: 'Il m’a regardée. Il a l’air vieux. Il a l’air gentil. Je crois qu’il a peur de nous, en fait.', en: 'He looked at me. He looks old. He looks kind. I think he’s scared of us, actually.' } },
      ],
    },
    {
      id: 'bapteme', band: 9, delayMin: 40, stage: 5, night: false,
      title: { fr: 'Anselme', en: 'Anselme' },
      chronicle: {
        fr: 'Le poisson était remonté devant toute la ville. Il était plus vieux que le premier pont. On l’a baptisé Anselme, comme le pêcheur qui l’avait senti tirer, des âges plus tôt. Il a soufflé une bulle. On a décidé que c’était oui.',
        en: 'The fish surfaced in front of the whole town. It was older than the first bridge. They named it Anselme, after the fisherman who had felt it pull, ages earlier. It blew a bubble. They decided that meant yes.',
      },
      cast: [
        { ct: 1, who: { fr: 'La vieille enfant', en: 'The girl, grown old' }, line: { fr: 'Il était là avant le premier pont. Avant la première barque. Il nous a regardés grandir. On l’appellera Anselme. … Il a fait une bulle. C’est oui.', en: 'He was here before the first bridge. Before the first boat. He watched us grow up. We’ll call him Anselme. … He blew a bubble. That’s a yes.' } },
        { ct: -1, who: { fr: 'Anselme', en: 'Anselme' }, line: { fr: '(une bulle)', en: '(a bubble)' } },
      ],
    },
  ],
  trace: { fr: 'Une ombre immense, à l’aube, sous le pont', en: 'A vast shadow under the bridge at dawn' },
};

// ── 8. LE MUSICIEN DES RUES ────────────────────────────────────────────────
// Profondeur : une mélodie transmise de main en main, de l’os à la lumière. Au
// clic, sa mélodie joue (la petite mélodie de la scène, par l’instrument de l’âge).
const MUSICIEN = {
  id: 'musicien',
  title: { fr: 'La Mélodie de toujours', en: 'The Ever-Melody' },
  place: 'place',
  chapters: [
    {
      id: 'os', band: 0, delayMin: 0, stage: 0, place: 'foyer', night: true,
      title: { fr: 'La flûte d’os', en: 'The bone flute' },
      chronicle: {
        fr: 'Près du feu, quelqu’un jouait d’une flûte taillée dans un os. La mélodie, disait-il, était dans l’os. Il l’en avait seulement sortie.',
        en: 'By the fire, someone played a flute carved from a bone. The melody, he said, was in the bone. He had only let it out.',
      },
      cast: [
        { ct: 0, who: { fr: 'Le flûtiste', en: 'The flute player' }, line: { fr: 'Je ne l’ai pas inventée. Elle était dans l’os. Je l’ai seulement laissée sortir.', en: 'I didn’t invent it. It was in the bone. I just let it out.' } },
      ],
    },
    {
      id: 'lyre', band: 2, delayMin: 30, stage: 1,
      title: { fr: 'Plus lentement', en: 'More slowly' },
      chronicle: {
        fr: 'Son fils jouait la même mélodie sur une lyre, un peu plus lentement, pour un père qui avait eu mal aux doigts sur la fin.',
        en: 'His son played the same melody on a lyre, a little slower, for a father whose fingers had hurt toward the end.',
      },
      cast: [
        { ct: 0, who: { fr: 'Le joueur de lyre', en: 'The lyre player' }, line: { fr: 'Mon père me l’a apprise. Il avait mal aux doigts, sur la fin. Je la joue un peu plus lentement. Pour lui.', en: 'My father taught it to me. His fingers hurt, toward the end. I play it a little slower. For him.' } },
      ],
    },
    {
      id: 'vielle', band: 3, delayMin: 30, stage: 2,
      title: { fr: 'Les enfants la sifflent', en: 'The children whistle it' },
      chronicle: {
        fr: 'Sur la place, une vielle jouait la vieille mélodie. Les seigneurs la trouvaient trop simple. Les enfants la sifflaient en rentrant.',
        en: 'On the square, a hurdy-gurdy played the old melody. The lords found it too simple. The children whistled it on their way home.',
      },
      cast: [
        { ct: 1, who: { fr: 'La joueuse de vielle', en: 'The hurdy-gurdy player' }, line: { fr: 'Les seigneurs la trouvent trop simple. Les enfants la sifflent en rentrant. Je préfère les enfants.', en: 'The lords find it too simple. The children whistle it on the way home. I prefer the children.' } },
      ],
    },
    {
      id: 'theatre', band: 4, delayMin: 30, stage: 3,
      title: { fr: 'Ceux qui passent', en: 'Those passing by' },
      chronicle: {
        fr: 'On avait proposé au musicien de jouer au théâtre. Il avait refusé : il préférait ceux qui passaient à ceux qui venaient exprès.',
        en: 'The musician was offered a place in the theatre. He refused: he preferred those passing by to those who came on purpose.',
      },
      cast: [
        { ct: 0, who: { fr: 'Le cithariste', en: 'The kithara player' }, line: { fr: 'On m’a demandé de la jouer au théâtre. J’ai dit non. Au théâtre, les gens viennent exprès. Ici, ils passent. Et parfois, ils restent.', en: 'They asked me to play it in the theatre. I said no. In the theatre, people come on purpose. Here, they pass by. And sometimes they stay.' } },
      ],
    },
    {
      id: 'accordeon', band: 5, delayMin: 30, stage: 4,
      title: { fr: 'Il faut bien que quelque chose chante', en: 'Something has to sing' },
      chronicle: {
        fr: 'Au coin de la place, un accordéon jouait la mélodie de toujours. Les machines faisaient du bruit ; il fallait bien que quelque chose chante.',
        en: 'At the corner of the square, an accordion played the ever-melody. The machines made noise; something had to sing.',
      },
      cast: [
        { ct: 1, who: { fr: 'L’accordéoniste', en: 'The accordionist' }, line: { fr: 'Les machines font tellement de bruit. Il faut bien que quelque chose chante.', en: 'The machines make so much noise. Something has to sing.' } },
      ],
    },
    {
      id: 'electrique', band: 6, delayMin: 30, stage: 5,
      title: { fr: 'Le fond', en: 'The heart of it' },
      chronicle: {
        fr: 'La mélodie était passée à l’électrique. Le fond n’avait pas changé. Le fond ne changeait jamais.',
        en: 'The melody had gone electric. The heart of it hadn’t changed. The heart of it never changed.',
      },
      cast: [
        { ct: 0, who: { fr: 'Le guitariste', en: 'The guitarist' }, line: { fr: 'Je l’ai passée à l’électrique. Le fond n’a pas changé. Le fond ne change jamais.', en: 'I took it electric. The heart of it didn’t change. The heart of it never does.' } },
      ],
    },
    {
      id: 'theremine', band: 8, delayMin: 35, stage: 6,
      title: { fr: 'Les mains se souviennent', en: 'The hands remember' },
      chronicle: {
        fr: 'Sur une place de verre, on jouait la mélodie sans toucher l’instrument. Les mains se souvenaient quand même.',
        en: 'On a square of glass, the melody was played without touching the instrument. The hands remembered anyway.',
      },
      cast: [
        { ct: 1, who: { fr: 'La musicienne', en: 'The musician' }, line: { fr: 'On joue sans toucher, maintenant. Mes mains se souviennent quand même. Elles se souviennent de l’os.', en: 'We play without touching now. My hands remember anyway. They remember the bone.' } },
      ],
    },
    {
      id: 'tous', band: 9, delayMin: 40, stage: 7,
      title: { fr: 'Tous', en: 'All of them' },
      chronicle: {
        fr: 'Le dernier musicien avait retrouvé la flûte d’os. Quand il en avait joué, tous ses ancêtres étaient revenus l’accompagner, chacun avec son instrument. La mélodie était la même qu’au premier soir.',
        en: 'The last musician found the bone flute. When he played it, all his ancestors came back to accompany him, each with an instrument. The melody was the same as on the first night.',
      },
      cast: [
        { ct: 0, who: { fr: 'Le dernier musicien', en: 'The last musician' }, line: { fr: 'J’ai retrouvé l’os. Écoute. Ils sont tous venus.', en: 'I found the bone. Listen. They all came.' } },
      ],
    },
  ],
  trace: { fr: 'Un chapeau posé au coin de la place', en: 'A hat set down at the corner of the square' },
};

// ── LES GAGS D’UN SEUL COUP ────────────────────────────────────────────────
// Sans suite, sans délai entre eux autre que la rareté générale. La Chronique les
// garde comme des « curiosités ».
export const FD_CURIOS = [
  {
    id: 'file', band: 2, place: 'batiment', night: false,
    title: { fr: 'La file d’attente', en: 'The queue' },
    chronicle: {
      fr: 'Six personnes faisaient la queue devant un mur. Personne ne savait pourquoi. Personne ne partait.',
      en: 'Six people were queueing in front of a wall. Nobody knew why. Nobody left.',
    },
    cast: [
      { ct: 0, who: { fr: 'Le dernier de la file', en: 'The last in line' }, line: { fr: 'Je ne sais pas ce qu’on attend. Mais si autant de gens attendent, c’est que ça vaut le coup.', en: 'I don’t know what we’re waiting for. But if this many people are waiting, it must be worth it.' } },
      { ct: 1, who: { fr: 'La première de la file', en: 'The first in line' }, line: { fr: 'Je suis la première. Je ne sais pas non plus.', en: 'I’m first. I don’t know either.' } },
      { ct: 0, who: { fr: 'Un homme dans la file', en: 'A man in the queue' }, line: { fr: 'J’étais venu acheter du pain. Ça fait deux jours.', en: 'I came to buy bread. That was two days ago.' } },
    ],
  },
  {
    id: 'citrouilles', band: 1, place: 'rue', night: false,
    title: { fr: 'Les citrouilles', en: 'The pumpkins' },
    chronicle: {
      fr: 'Une charrette s’était renversée. Des citrouilles avaient dévalé toute la rue. On en avait retrouvé une sur le toit d’une maison ; personne n’a su expliquer comment.',
      en: 'A cart had tipped over. Pumpkins rolled the whole length of the street. One was found on a rooftop; nobody could explain how.',
    },
    cast: [
      { ct: 0, who: { fr: 'Le charretier', en: 'The carter' }, line: { fr: 'Elles roulaient mieux que mon âne. Elles roulent toujours mieux que mon âne.', en: 'They rolled better than my donkey. They always roll better than my donkey.' } },
    ],
  },
  {
    id: 'echelle', band: 2, place: 'toit', night: false,
    title: { fr: 'L’échelle', en: 'The ladder' },
    chronicle: {
      fr: 'Un homme était monté sur un toit chercher un cerf-volant. Le cerf-volant était redescendu. Pas lui.',
      en: 'A man climbed onto a roof to fetch a kite. The kite came down. He didn’t.',
    },
    cast: [
      { ct: 0, who: { fr: 'L’homme du toit', en: 'The man on the roof' }, line: { fr: 'Je suis monté chercher un cerf-volant. Le cerf-volant est redescendu. Pas moi. Tu n’aurais pas une échelle un peu plus longue ?', en: 'I came up for a kite. The kite came down. I didn’t. You wouldn’t have a slightly longer ladder?' } },
    ],
  },
  {
    id: 'sieste', band: 1, place: 'champ', night: false,
    title: { fr: 'La sieste', en: 'The nap' },
    chronicle: {
      fr: 'À midi, quatre moissonneurs dormaient dans le blé, en étoile. Le contremaître les cherchait. Il a fini par s’allonger aussi.',
      en: 'At noon, four harvesters were asleep in the wheat, arranged like a star. The foreman was looking for them. He ended up lying down too.',
    },
    cast: [
      { ct: 0, who: { fr: 'Un moissonneur', en: 'A harvester' }, line: { fr: 'Chut.', en: 'Shh.' } },
      { ct: 1, who: { fr: 'Une moissonneuse', en: 'A harvester' }, line: { fr: 'On ne dort pas. On écoute pousser le blé.', en: 'We’re not sleeping. We’re listening to the wheat grow.' } },
    ],
  },
  {
    id: 'serenade', band: 2, place: 'batiment', night: true,
    title: { fr: 'La sérénade', en: 'The serenade' },
    chronicle: {
      fr: 'Un amoureux chantait sous une fenêtre, la nuit. La fenêtre s’est ouverte. C’était pour lui jeter de l’eau. Il a recommencé le lendemain.',
      en: 'A lovesick man sang under a window at night. The window opened. It was to throw water on him. He came back the next night.',
    },
    cast: [
      { ct: 0, who: { fr: 'Le chanteur', en: 'The singer' }, line: { fr: 'Elle a ouvert la fenêtre ! … Ah non. C’était pour me jeter de l’eau. Mais elle l’a ouverte.', en: 'She opened the window! … Ah, no. It was to throw water at me. But she did open it.' } },
    ],
  },
  {
    id: 'cerfvolant', band: 2, place: 'lisiere', night: false,
    title: { fr: 'Le cerf-volant', en: 'The kite' },
    chronicle: {
      fr: 'Un cerf-volant était coincé dans un arbre. Trois générations tiraient sur la ficelle, chacune à son tour, depuis des années.',
      en: 'A kite was stuck in a tree. Three generations had been tugging on the string, each in turn, for years.',
    },
    cast: [
      { ct: 0, who: { fr: 'Le grand-père', en: 'The grandfather' }, line: { fr: 'C’est mon grand-père qui l’a coincé là. On tire un peu chaque dimanche. Il viendra.', en: 'My grandfather got it stuck there. We give it a tug every Sunday. It’ll come.' } },
      { ct: 2, who: { fr: 'Le petit-fils', en: 'The grandson' }, line: { fr: 'Moi, je crois que l’arbre l’aime bien.', en: 'I think the tree likes it.' } },
    ],
  },
  {
    id: 'vache', band: 2, place: 'rue', night: false,
    title: { fr: 'La vache', en: 'The cow' },
    chronicle: {
      fr: 'Une vache s’était arrêtée au milieu de la route. Personne n’osait la contourner. Elle est repartie quand elle l’a décidé.',
      en: 'A cow stopped in the middle of the road. Nobody dared go around her. She moved on when she decided to.',
    },
    cast: [
      { ct: -1, who: { fr: 'La vache', en: 'The cow' }, line: { fr: '…', en: '…' } },
      { ct: 0, who: { fr: 'Un voyageur', en: 'A traveller' }, line: { fr: 'Elle a la priorité. Elle l’a décidé.', en: 'She has right of way. She decided so.' } },
    ],
  },
  {
    id: 'mime', band: 3, place: 'place', night: false,
    title: { fr: 'Le mime', en: 'The mime' },
    chronicle: {
      fr: 'Un mime était resté immobile sur la place depuis le matin. Le soir, quelqu’un a juré l’avoir vu cligner des yeux. Personne ne l’a cru.',
      en: 'A mime had stood perfectly still on the square since morning. In the evening, someone swore they saw him blink. Nobody believed it.',
    },
    cast: [
      { ct: 0, who: { fr: 'Le mime', en: 'The mime' }, line: { fr: '…', en: '…' } },
    ],
    lines: [
      { fr: '… !', en: '… !' },
      { fr: '(Il mime une boîte. Tu es dans la boîte.)', en: '(He mimes a box. You are in the box.)' },
      { fr: '(Il mime une porte. Il te la tient.)', en: '(He mimes a door. He holds it open for you.)' },
    ],
  },
];

export const FD_STORY_LIST = [SECTE, TORTUE, CHEVRE, CYNIQUE, VOLANT, BORNE, MONSTRE, MUSICIEN];
export const FD_STORIES = Object.fromEntries(FD_STORY_LIST.map((s) => [s.id, s]));

// Le lieu d’un chapitre : le sien, sinon celui de son histoire.
export const fdPlaceOf = (story, ch) => ch.place || story.place;
// La nuit : true (la nuit seulement), false (le jour seulement), null (peu importe).
export const fdNightOf = (story, ch) => (ch.night != null ? ch.night : story.night != null ? story.night : null);
