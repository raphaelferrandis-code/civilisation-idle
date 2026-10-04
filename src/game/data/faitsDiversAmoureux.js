"use strict";

// NANCY ET WILLIAM — le feuilleton des amoureux (docs/PLAN-FAITS-DIVERS.md §3.9).
//
// Idée de Raph (2026-10-04) : deux amoureux qui se cherchent, s’éloignent et finissent
// par se marier. On les trouve devant les bâtiments de la ville, un peu par hasard, et
// « par rapport à ce que l’autre a dit » : celui qu’on trouve parle de l’autre, et ce
// qu’il en dit désigne — sans le nommer — le bâtiment où l’autre attend vraiment.
//
// Cette histoire n’est PAS liée aux âges : elle avance par rendez-vous, dans la ville
// du moment, et elle survit aux effondrements (« On s’est perdus dans l’effondrement »).
// Les deux portent la moitié d’un même ruban rouge : c’est leur seul signe distinctif.
//
// Forme d’un rendez-vous (step) :
//   id        stable (sauvegardé)
//   who       'nancy' | 'william' | 'both' | 'first' (le premier trouvé des deux) |
//             'second' (l’autre)
//   where     'hasard'   un bâtiment tiré au sort
//             'piste'    le bâtiment désigné par la piste du rendez-vous précédent
//             'meme'     le même endroit que le rendez-vous précédent
//             'premier'  le bâtiment du tout premier rendez-vous
//             'mariage'  une place
//             'banc'     au bord de l’eau ou sur une place, au crépuscule
//   clue      true : la réplique se termine par une piste sur l’autre (cf. AMOUREUX_PISTES)
//   delayMin  minutes de jeu (à vie) depuis le rendez-vous précédent
//   lines     { nancy, william } : ce que dit chacun (un seul quand `who` est un prénom)

export const AMOUREUX_NAMES = {
  nancy: { fr: 'Nancy', en: 'Nancy', fem: true },
  william: { fr: 'William', en: 'William', fem: false },
};

export const AMOUREUX = {
  id: 'amoureux',
  title: { fr: 'Nancy et William', en: 'Nancy and William' },
  steps: [
    // ── Acte I · La rencontre
    {
      id: 'ruban', who: 'nancy', where: 'hasard', clue: true, delayMin: 0,
      title: { fr: 'La moitié d’un ruban', en: 'Half a ribbon' },
      chronicle: {
        fr: 'Une jeune femme, Nancy, cherchait un garçon croisé dans la foule. Un ruban rouge s’était déchiré entre eux ; elle en gardait la moitié. Elle ne savait même pas son nom.',
        en: 'A young woman named Nancy was looking for a boy she had passed in a crowd. A red ribbon had torn between them; she kept half of it. She didn’t even know his name.',
      },
      lines: {
        nancy: {
          fr: 'Tu n’aurais pas vu un garçon avec un ruban rouge au poignet ? On s’est croisés dans la foule, le ruban s’est déchiré entre nous, et j’en ai gardé la moitié. Je ne sais même pas son nom. Une marchande m’a parlé de lui.',
          en: 'You haven’t seen a boy with a red ribbon on his wrist? We bumped into each other in the crowd, the ribbon tore between us, and I kept half. I don’t even know his name. A market woman told me about him.',
        },
      },
    },
    {
      id: 'william', who: 'william', where: 'piste', clue: true, delayMin: 6,
      title: { fr: 'William', en: 'William' },
      chronicle: {
        fr: 'Le garçon s’appelait William. Il avait l’autre moitié du ruban, et il la cherchait aussi.',
        en: 'The boy’s name was William. He had the other half of the ribbon, and he was looking for her too.',
      },
      lines: {
        william: {
          fr: 'L’autre moitié du ruban ? C’est elle qui l’a ? … Elle me cherche. Elle me cherche ! Je m’appelle William. Dis-lui… non, je vais le lui dire moi-même. On m’a dit où la trouver.',
          en: 'The other half of the ribbon? She has it? … She’s looking for me. She’s looking for me! My name is William. Tell her… no, I’ll tell her myself. Someone told me where to find her.',
        },
      },
    },
    {
      id: 'attente', who: 'nancy', where: 'piste', clue: true, delayMin: 8,
      title: { fr: 'Je ne bouge plus', en: 'I’m not moving' },
      chronicle: {
        fr: 'Nancy avait décidé de ne plus bouger : William finirait bien par passer.',
        en: 'Nancy decided not to move another step: William was bound to come by.',
      },
      lines: {
        nancy: {
          fr: 'William. Il s’appelle William. … Bon. Je ne bouge plus d’ici, il finira bien par passer. Si tu le croises avant, dis-lui où je suis. On l’a vu ce matin.',
          en: 'William. His name is William. … Right. I’m not moving from here, he’s bound to come by. If you see him first, tell him where I am. Someone saw him this morning.',
        },
      },
    },
    // ── Acte II · Ils se cherchent
    {
      id: 'personne', who: 'william', where: 'piste', clue: true, delayMin: 10,
      title: { fr: 'Personne', en: 'No one there' },
      chronicle: {
        fr: 'William était allé là où Nancy l’attendait. Elle venait de partir le chercher.',
        en: 'William went to where Nancy was waiting for him. She had just left to look for him.',
      },
      lines: {
        william: {
          fr: 'Elle m’attendait ? J’y suis allé. Il n’y avait personne. Une voisine m’a dit qu’elle était partie me chercher. Elle a dit autre chose, aussi.',
          en: 'She was waiting for me? I went there. No one. A neighbour said she’d gone off to look for me. She said something else, too.',
        },
      },
    },
    {
      id: 'croises', who: 'nancy', where: 'piste', clue: true, delayMin: 10,
      title: { fr: 'Croisés sans se voir', en: 'Passing without seeing' },
      chronicle: {
        fr: 'Ils s’étaient croisés sans se voir. Ils avaient recommencé.',
        en: 'They had passed each other without seeing. They started again.',
      },
      lines: {
        nancy: {
          fr: 'Il est venu ? Pendant que j’étais partie le chercher ? … On s’est croisés sans se voir. Bon. Je recommence. Cette fois, je sais où il est.',
          en: 'He came? While I was out looking for him? … We passed each other without seeing. Fine. I’ll start again. This time I know where he is.',
        },
      },
    },
    {
      id: 'paris', who: 'william', where: 'piste', clue: true, delayMin: 12,
      title: { fr: 'Les paris', en: 'The bets' },
      chronicle: {
        fr: 'Ils se cherchaient depuis trois saisons. En ville, on pariait sur le jour où ils se trouveraient.',
        en: 'They had been looking for each other for three seasons. In town, people were betting on the day they’d find each other.',
      },
      lines: {
        william: {
          fr: 'Ça fait trois saisons qu’on se court après. Les gens commencent à parier. Mon oncle a misé sur l’hiver. Je ne veux pas lui faire gagner d’argent, à mon oncle.',
          en: 'Three seasons we’ve been chasing each other. People have started betting. My uncle put money on winter. I don’t want my uncle to win.',
        },
      },
    },
    {
      id: 'mot', who: 'nancy', where: 'piste', clue: true, delayMin: 12,
      title: { fr: 'Le mot', en: 'The note' },
      chronicle: {
        fr: 'William avait laissé un mot pour Nancy. Quelqu’un s’en était servi pour allumer un feu. Elle avait pu lire la fin : un rendez-vous.',
        en: 'William had left a note for Nancy. Someone used it to light a fire. She could read the end: a meeting place.',
      },
      lines: {
        nancy: {
          fr: 'Il m’a laissé un mot. Quelqu’un s’en est servi pour allumer le feu, mais j’ai pu lire la fin. Il me donne rendez-vous. Il ne bougera pas, cette fois. Il l’a souligné deux fois.',
          en: 'He left me a note. Someone used it to light the fire, but I could read the end. He’s asking me to meet him. He won’t move this time. He underlined it twice.',
        },
      },
    },
    // ── Acte III · Ils se trouvent, et s’éloignent
    {
      id: 'enfin', who: 'both', where: 'piste', delayMin: 10,
      title: { fr: 'Enfin', en: 'At last' },
      chronicle: {
        fr: 'Nancy et William s’étaient enfin trouvés. Il était plus petit que dans son souvenir ; elle parlait plus que dans le sien. Ils avaient noué les deux moitiés du ruban.',
        en: 'Nancy and William had found each other at last. He was shorter than she remembered; she talked more than he remembered. They tied the two halves of the ribbon together.',
      },
      lines: {
        nancy: { fr: 'On s’est trouvés. Il est plus petit que dans mon souvenir.', en: 'We found each other. He’s shorter than I remembered.' },
        william: { fr: 'Elle parle plus que dans le mien. … Je ne m’en plains pas.', en: 'She talks more than I remembered. … I’m not complaining.' },
      },
    },
    {
      id: 'dispute', who: 'both', where: 'meme', delayMin: 25,
      title: { fr: 'Le reste du monde', en: 'The rest of the world' },
      chronicle: {
        fr: 'Ils s’étaient disputés. Elle voulait voir le reste du monde ; il ne comprenait pas qu’on quitte un endroit où il y avait tout. Le ruban s’était dénoué.',
        en: 'They had quarrelled. She wanted to see the rest of the world; he couldn’t understand leaving a place that had everything. The ribbon came undone.',
      },
      lines: {
        nancy: { fr: 'Il veut rester ici toute sa vie. Moi, je veux voir le reste du monde. Il n’y a rien de mal à vouloir voir le reste du monde.', en: 'He wants to stay here all his life. I want to see the rest of the world. There’s nothing wrong with wanting to see the rest of the world.' },
        william: { fr: 'Elle veut partir. Ici, il y a tout. Pourquoi est-ce qu’on partirait d’un endroit où il y a tout ?', en: 'She wants to leave. Everything is here. Why would anyone leave a place that has everything?' },
      },
    },
    {
      id: 'seuls', who: 'first', where: 'hasard', delayMin: 25,
      title: { fr: 'Chacun de son côté', en: 'Each on their own' },
      chronicle: {
        fr: 'Chacun de son côté, ils faisaient semblant d’aller bien. Nancy parlait de partir ; William regardait un mur.',
        en: 'Each on their own, they pretended to be fine. Nancy talked about leaving; William stared at a wall.',
      },
      lines: {
        nancy: { fr: 'Je pars demain. Ou après-demain. Un jour. … Non, je ne veux pas parler de lui.', en: 'I’m leaving tomorrow. Or the day after. Someday. … No, I don’t want to talk about him.' },
        william: { fr: 'Je vais très bien. Je suis très occupé. Je regarde ce mur. C’est un très bon mur.', en: 'I’m fine. I’m very busy. I’m looking at this wall. It’s a very good wall.' },
      },
    },
    {
      id: 'messager', who: 'second', where: 'hasard', delayMin: 3,
      title: { fr: 'Le messager', en: 'The messenger' },
      chronicle: {
        fr: 'Chacun demandait des nouvelles de l’autre à qui voulait bien en donner. Quelqu’un en donnait.',
        en: 'Each of them asked for news of the other from anyone willing to give it. Someone was.',
      },
      lines: {
        nancy: { fr: 'Tu l’as vu ? … Il regarde un mur ? Il ne regarde jamais rien, d’habitude. Il doit être malheureux. Bien fait. … Non. Pas bien fait.', en: 'You saw him? … He’s staring at a wall? He never looks at anything, usually. He must be miserable. Serves him right. … No. It doesn’t.' },
        william: { fr: 'Tu l’as vue ? Elle part ? Elle a dit quand ? … « Un jour » ? Alors il reste du temps.', en: 'You saw her? She’s leaving? Did she say when? … “Someday”? Then there’s still time.' },
      },
    },
    // ── Acte IV · Le mariage
    {
      id: 'commencement', who: 'william', where: 'hasard', delayMin: 30,
      title: { fr: 'Là où tout a commencé', en: 'Where it all began' },
      chronicle: {
        fr: 'William avait réfléchi. Le reste du monde, il voulait bien le voir, mais avec elle. Il l’attendait là où tout avait commencé.',
        en: 'William had thought it over. He was willing to see the rest of the world, but with her. He was waiting where it all began.',
      },
      lines: {
        william: { fr: 'J’ai réfléchi. Le reste du monde, je veux bien le voir. Mais avec elle. Dis-lui que je l’attends là où elle a commencé à me chercher. Elle saura.', en: 'I’ve thought about it. I’m willing to see the rest of the world. But with her. Tell her I’ll be waiting where she first started looking for me. She’ll know.' },
      },
    },
    {
      id: 'retrouvailles', who: 'both', where: 'premier', delayMin: 6,
      title: { fr: 'Les retrouvailles', en: 'Together again' },
      chronicle: {
        fr: 'Nancy était revenue là où tout avait commencé. William l’y attendait. Ils avaient décidé de se marier, puis de partir.',
        en: 'Nancy came back to where it all began. William was waiting there. They decided to marry, and then to leave.',
      },
      lines: {
        nancy: { fr: 'Tu es venu. … On se marie. Sur la place, quand les fleurs seront prêtes. Tu viendras, toi aussi ?', en: 'You came. … We’re getting married. On the square, when the flowers are ready. You’ll come too?' },
        william: { fr: 'Je suis venu. On part quand ? Après le mariage ? D’accord. Après le mariage.', en: 'I came. When do we leave? After the wedding? All right. After the wedding.' },
      },
    },
    {
      id: 'mariage', who: 'both', where: 'mariage', delayMin: 30, night: false,
      title: { fr: 'Le mariage', en: 'The wedding' },
      chronicle: {
        fr: 'Nancy et William se sont mariés sur la place. Le ruban avait été recousu ; on ne voyait presque pas la couture. Le lendemain, ils sont partis voir le reste du monde, en promettant de revenir.',
        en: 'Nancy and William were married on the square. The ribbon had been sewn back together; you could hardly see the seam. The next day they left to see the rest of the world, promising to come back.',
      },
      lines: {
        nancy: { fr: 'Il a dit oui avant que je finisse la question.', en: 'He said yes before I finished the question.' },
        william: { fr: 'On part demain, voir le reste du monde. Et après, on reviendra ici. Il y a tout, ici.', en: 'Tomorrow we leave to see the rest of the world. And afterwards we’ll come back here. Everything is here.' },
      },
      // Les invités : petits groupes lâches (jamais un cercle — « ça fait secte »).
      guests: [
        { ct: 1, who: { fr: 'Une invitée', en: 'A guest' }, line: { fr: 'Ils se sont cherchés pendant des années. Moi, j’ai juste demandé à ma voisine.', en: 'They spent years looking for each other. I just asked my neighbour.' } },
        { ct: 0, who: { fr: 'Un invité', en: 'A guest' }, line: { fr: 'Le ruban est recousu. On ne voit presque pas la couture.', en: 'The ribbon’s been sewn back. You can hardly see the seam.' } },
        { ct: 2, who: { fr: 'Un enfant', en: 'A child' }, line: { fr: 'Ils vont s’embrasser ? Beurk.', en: 'Are they going to kiss? Yuck.' } },
        { ct: 0, who: { fr: 'L’oncle de William', en: 'William’s uncle' }, line: { fr: 'J’avais misé sur l’hiver. On est au printemps. Je ne lui pardonnerai jamais.', en: 'I bet on winter. It’s spring. I’ll never forgive him.' } },
        { ct: 1, who: { fr: 'La marchande', en: 'The market woman' }, line: { fr: 'C’est moi qui lui ai dit où il était, la première fois. On ne me remercie jamais.', en: 'I’m the one who told her where he was, the first time. Nobody ever thanks me.' } },
      ],
    },
    {
      id: 'banc', who: 'both', where: 'banc', delayMin: 120, dusk: true,
      title: { fr: 'Le banc', en: 'The bench' },
      chronicle: {
        fr: 'Bien des années plus tard, on a revu Nancy et William sur un banc, à la tombée du jour. Ils avaient vu le reste du monde. Il était bien, disaient-ils ; ici, c’était mieux.',
        en: 'Many years later, Nancy and William were seen again on a bench at dusk. They had seen the rest of the world. It was fine, they said; here was better.',
      },
      lines: {
        nancy: { fr: 'On a vu le reste du monde. Il était bien. Ici, c’est mieux.', en: 'We saw the rest of the world. It was fine. Here is better.' },
        william: { fr: 'Je le lui avais dit. — Tais-toi. — Je le lui avais dit.', en: 'I told her so. — Hush. — I told her so.' },
      },
    },
  ],
  // Quand un effondrement arrive au milieu de l’histoire : la première réplique du
  // rendez-vous suivant, dans la ville d’après.
  afterCollapse: {
    fr: 'On s’est perdus dans l’effondrement. Tout est tombé, sauf ça.',
    en: 'We lost each other in the collapse. Everything fell, except this.',
  },
  trace: { fr: 'Un banc, au bord de l’eau', en: 'A bench by the water' },
};

// ── LES PISTES ──────────────────────────────────────────────────────────────
// Ce qu’on dit de l’autre, par type de bâtiment. Jamais le nom du bâtiment : une
// périphrase qu’on décode en regardant la ville. Deux par bâtiment, écrites pour
// les deux : {Il}/{il} → Il/Elle, {e} → accord féminin, {lui} → lui/elle,
// {He}/{he}/{him}/{his} → He/She, he/she, him/her, his/her.
export const AMOUREUX_PISTES = {
  foragers: [
    { fr: '{Il} est parti{e} remplir un panier de baies. {Il} en mange la moitié en chemin.', en: '{He} went off to fill a basket with berries. {He} eats half of them on the way.' },
    { fr: '{Il} sent toujours les mûres. Cherche du côté de ceux qui cueillent.', en: '{He} always smells of blackberries. Look where the gatherers are.' },
  ],
  granaries_city: [
    { fr: '{Il} compte les sacs de grain. {Il} dit que ça {le} calme.', en: '{He} counts the sacks of grain. {He} says it calms {him} down.' },
    { fr: '{Il} aime l’odeur des réserves. Va voir là où on garde le grain.', en: '{He} loves the smell of the stores. Go where they keep the grain.' },
  ],
  caravans: [
    { fr: '{Il} regarde partir les caravanes. {Il} ne monte jamais dedans.', en: '{He} watches the caravans leave. {He} never gets on one.' },
    { fr: '{Il} parle aux bêtes de somme. {Il} dit qu’elles écoutent mieux que les gens.', en: '{He} talks to the pack animals. {He} says they listen better than people.' },
  ],
  markets: [
    { fr: '{Il} m’a promis des oranges. Les oranges, ça se trouve où, d’après toi ?', en: '{He} promised me oranges. Where would you find oranges, do you think?' },
    { fr: '{Il} marchande pour le plaisir. {Il} n’achète jamais rien.', en: '{He} haggles for the fun of it. {He} never buys anything.' },
  ],
  guilds: [
    { fr: '{Il} traîne chez les artisans. {Il} a toujours de la sciure dans les cheveux.', en: '{He} hangs around the craftsmen. {He} always has sawdust in {his} hair.' },
    { fr: 'Cherche là où l’on tape sur du métal. {Il} aime le bruit.', en: 'Look where they hammer metal. {He} likes the noise.' },
  ],
  irrigated_fields: [
    { fr: '{Il} est aux champs. {Il} dit que le blé, au moins, ne pose pas de questions.', en: '{He}’s out in the fields. {He} says wheat, at least, doesn’t ask questions.' },
    { fr: '{Il} aide aux moissons. Ou {il} se cache dans le blé. Avec {lui}, on ne sait jamais.', en: '{He}’s helping with the harvest. Or hiding in the wheat. With {him}, you never know.' },
  ],
  river_ports: [
    { fr: '{Il} regarde partir les bateaux. Chaque fois, {il} a l’air d’hésiter.', en: '{He} watches the boats leave. Every time, {he} looks like {he}’s hesitating.' },
    { fr: '{Il} a parlé de partir avec le premier bateau. Pas le deuxième. Le premier.', en: '{He} talked about leaving on the first boat. Not the second. The first.' },
  ],
  water_mills: [
    { fr: '{Il} aime le bruit de l’eau qui tourne.', en: '{He} loves the sound of water going round and round.' },
    { fr: '{Il} m’a dit : la roue, c’est comme nous, ça revient toujours au même endroit.', en: '{He} told me: the wheel is like us, it always comes back to the same place.' },
  ],
  mint_houses: [
    { fr: '{Il} regarde frapper les pièces. {Il} dit que c’est le seul endroit où l’argent fait de la musique.', en: '{He} watches them strike the coins. {He} says it’s the only place where money makes music.' },
    { fr: 'Cherche là où l’on fabrique l’argent. {Il} n’en a jamais, mais {il} aime le bruit.', en: 'Look where they make money. {He} never has any, but {he} loves the sound.' },
  ],
  imperial_exchanges: [
    { fr: '{Il} compte, toujours. {Il} compte tout. Va là où l’on compte le plus.', en: '{He} counts, always. {He} counts everything. Go where they count the most.' },
    { fr: '{Il} est entré{e} à la banque demander s’ils prêtaient du courage.', en: '{He} went into the bank to ask whether they lend courage.' },
  ],
  storytellers: [
    { fr: '{Il} écoute les histoires. Surtout celles qui finissent mal. {Il} dit que ce sont les plus vraies.', en: '{He} listens to stories. Especially the ones that end badly. {He} says those are the truest.' },
    { fr: 'Va là où l’on raconte des histoires. {Il} y est sûrement, au premier rang.', en: 'Go where they tell stories. {He}’s surely there, in the front row.' },
  ],
  scribes: [
    { fr: '{Il} fait écrire une lettre. Je ne sais pas à qui. J’espère que c’est à moi.', en: '{He}’s having a letter written. I don’t know to whom. I hope it’s to me.' },
    { fr: '{Il} apprend à écrire mon nom. Va voir chez ceux qui écrivent.', en: '{He}’s learning to write my name. Go see the people who write.' },
  ],
  schools: [
    { fr: '{Il} est à l’école. Pas pour apprendre : pour se souvenir de comment c’était.', en: '{He}’s at the school. Not to learn: to remember what it was like.' },
    { fr: '{Il} attend devant l’école. {Il} aime regarder les enfants courir.', en: '{He}’s waiting outside the school. {He} likes watching the children run.' },
  ],
  academies: [
    { fr: '{Il} discute avec les savants. {Il} dit qu’ils ont réponse à tout, sauf à ce qui compte.', en: '{He}’s arguing with the scholars. {He} says they have an answer for everything except what matters.' },
    { fr: 'Va là où l’on débat. {Il} y perd toujours, et {il} adore ça.', en: 'Go where they debate. {He} always loses there, and {he} loves it.' },
  ],
  ancestral_cult: [
    { fr: '{Il} est allé{e} parler à ses ancêtres. {Il} leur parle de moi, je crois.', en: '{He} went to talk to {his} ancestors. {He} tells them about me, I think.' },
    { fr: '{Il} allume une flamme pour sa grand-mère, chaque semaine. Va là où l’on honore les morts.', en: '{He} lights a flame for {his} grandmother every week. Go where they honour the dead.' },
  ],
  observatories: [
    { fr: '{Il} regarde les étoiles. {Il} dit qu’il y en a une pour chaque personne qu’on a perdue de vue.', en: '{He} watches the stars. {He} says there’s one for every person you’ve lost sight of.' },
    { fr: '{Il} est monté{e} là où l’on regarde le ciel. {Il} cherche quelque chose qu’{il} n’a pas perdu là-haut.', en: '{He} went up where they watch the sky. {He}’s looking for something {he} didn’t lose up there.' },
  ],
  libraries: [
    { fr: '{Il} lit tout ce qui lui tombe sous la main.', en: '{He} reads everything {he} can get {his} hands on.' },
    { fr: '{Il} cherche un livre où deux personnes se trouvent à la fin. {Il} dit qu’il n’y en a pas assez.', en: '{He}’s looking for a book where two people find each other at the end. {He} says there aren’t enough.' },
  ],
  universities: [
    { fr: '{Il} suit des cours. {Il} ne sait pas lesquels. {Il} s’assoit au fond et {il} écoute.', en: '{He}’s attending lectures. {He} doesn’t know which ones. {He} sits at the back and listens.' },
    { fr: 'Va là où les étudiants refont le monde. {Il} les écoute en souriant.', en: 'Go where the students remake the world. {He} listens to them, smiling.' },
  ],
  printing_houses: [
    { fr: '{Il} voulait faire imprimer une affiche avec mon portrait. Je lui ai dit que c’était ridicule. {Il} y est quand même.', en: '{He} wanted to have a poster printed with my portrait. I told {him} it was ridiculous. {He}’s there anyway.' },
    { fr: '{Il} aime l’odeur de l’encre fraîche.', en: '{He} loves the smell of fresh ink.' },
  ],
  think_tanks: [
    { fr: '{Il} est allé{e} demander aux experts comment on retrouve quelqu’un. Ils ont dit qu’ils feraient un rapport.', en: '{He} went to ask the experts how you find someone. They said they’d write a report.' },
    { fr: 'Va voir chez ceux qui prévoient l’avenir. {Il} veut savoir si on en a un.', en: 'Go see the people who forecast the future. {He} wants to know if we have one.' },
  ],
  aqueducts: [
    { fr: '{Il} va chercher de l’eau, trois fois par jour. Je crois qu’{il} aime surtout le chemin.', en: '{He} fetches water three times a day. I think {he} mostly likes the walk.' },
    { fr: '{Il} attend près de l’eau qu’on puise. {Il} dit que l’eau répond quand on lui parle.', en: '{He}’s waiting by the water they draw. {He} says water answers when you talk to it.' },
  ],
  watch: [
    { fr: '{Il} a demandé aux veilleurs de garder un œil sur moi.', en: '{He} asked the watchmen to keep an eye on me.' },
    { fr: '{Il} monte la garde avec les veilleurs. {Il} dit que de là-haut, on voit tout le monde passer.', en: '{He}’s standing watch with the watchmen. {He} says from up there you see everyone go by.' },
  ],
  sewers: [
    { fr: 'Ne ris pas. {Il} est aux égouts. {Il} dit que c’est là qu’on apprend tout sur une ville.', en: 'Don’t laugh. {He}’s at the sewers. {He} says that’s where you learn everything about a city.' },
    { fr: '{Il} a fait tomber une bague dans les égouts. Pas n’importe quelle bague.', en: '{He} dropped a ring in the sewers. Not just any ring.' },
  ],
  bureaucracy: [
    { fr: '{Il} fait la queue pour un formulaire. Depuis mardi.', en: '{He}’s queueing for a form. Since Tuesday.' },
    { fr: '{Il} essaie de faire enregistrer qu’on se connaît. Il faut un tampon.', en: '{He}’s trying to get it officially recorded that we know each other. It needs a stamp.' },
  ],
  courthouses: [
    { fr: '{Il} assiste aux procès. {Il} dit que les gens n’y disent la vérité que par accident.', en: '{He} sits in on trials. {He} says people only tell the truth there by accident.' },
    { fr: '{Il} est au tribunal. Pas pour {lui}. Pour écouter.', en: '{He}’s at the courthouse. Not for {him}self. To listen.' },
  ],
  public_works: [
    { fr: '{Il} regarde les ouvriers construire. {Il} dit que c’est le seul endroit où l’on voit l’avenir pousser.', en: '{He} watches the workers build. {He} says it’s the only place you can watch the future grow.' },
    { fr: '{Il} porte des pierres sur le grand chantier. {Il} veut construire quelque chose qui reste.', en: '{He}’s carrying stones at the great works. {He} wants to build something that lasts.' },
  ],
  ministries: [
    { fr: '{Il} a rendez-vous avec un ministre. Le ministre ne le sait pas encore.', en: '{He} has an appointment with a minister. The minister doesn’t know yet.' },
    { fr: 'Va là où l’on décide des choses. {Il} veut décider quelque chose, une fois.', en: 'Go where things get decided. {He} wants to decide something, for once.' },
  ],
  archive_grids: [
    { fr: '{Il} fouille les archives. {Il} cherche si quelqu’un, avant nous, s’est déjà cherché aussi longtemps.', en: '{He}’s digging through the archives. {He} wants to know if anyone before us ever searched for each other this long.' },
    { fr: '{Il} est là où la ville garde sa mémoire. {Il} veut y laisser une trace.', en: '{He}’s where the city keeps its memory. {He} wants to leave a mark there.' },
  ],
  ruin_architects: [
    { fr: '{Il} est chez ceux qui relèvent les ruines. {Il} dit que rien n’est jamais vraiment perdu.', en: '{He}’s with the people who raise the ruins. {He} says nothing is ever truly lost.' },
    { fr: '{Il} dessine les ruines. {Il} dit qu’elles sont plus honnêtes que les bâtiments.', en: '{He} draws the ruins. {He} says they’re more honest than buildings.' },
  ],
  // Repli quand la ville n’a que des maisons : la place.
  place: [
    { fr: '{Il} est sur la place. {Il} fait semblant de regarder les étals.', en: '{He}’s on the square, pretending to look at the stalls.' },
    { fr: '{Il} attend sur la place, là où tout le monde passe. {Il} dit que c’est plus sûr.', en: '{He}’s waiting on the square, where everyone goes by. {He} says it’s safer.' },
  ],
};

// Accorde une phrase au genre de la personne dont on parle.
export function accordePiste(text, fem, lang = 'fr') {
  if (!text) return '';
  if (lang === 'en') {
    return text
      .replace(/\{He\}/g, fem ? 'She' : 'He')
      .replace(/\{he\}/g, fem ? 'she' : 'he')
      .replace(/\{him\}/g, fem ? 'her' : 'him')
      .replace(/\{his\}/g, fem ? 'her' : 'his');
  }
  return text
    .replace(/\{Il\}/g, fem ? 'Elle' : 'Il')
    .replace(/\{il\}/g, fem ? 'elle' : 'il')
    .replace(/\{e\}/g, fem ? 'e' : '')
    .replace(/\{lui\}/g, fem ? 'elle' : 'lui')
    .replace(/\{le\}/g, fem ? 'la' : 'le');
}
