"use strict";

// CE QU'ON DIT DE TOI — la troisième couche des paroles (docs/PLAN-ECOUTER-PARLER.md,
// lot 2). Même forme et même plume que paroles.js (lire sa charte en tête).
//
// Ce que les habitants savent du joueur, ils le tiennent de LEUR cité :
//   · la Chronique de ce cycle : sa période (`when.period`) et les articles déjà parus
//     (`when.article`, l'un d'eux suffit), qui donnent aussi le nom ({nom}, {Nom}) ;
//   · ce qu'ils voient : la ville qui reste des jours sans rien bâtir (`away`), les
//     idées qui s'en vont (`bulles`, les bulles cueillies), la caméra qui suit
//     quelqu'un (`followed`), la Maison des Plaisirs où quelqu'un joue (`plaisirs`) ;
//   · ce que la cité d'avant a laissé : ses ruines (`collapses`, combien de chutes,
//     `manual` si l'une au moins est venue de ta main), son legs (`legacy`), le culte
//     que l'Olympe a proclamé (`profile`).
// La confiance (`when.trust`, et les règles de pick.js) : on y PENSE avant d'en
// PARLER ; on en parle à l'écart, jamais le taciturne.
//
// ⛔ {nom} ne se met jamais après « de » ni « à » (« du Créateur », « au Créateur ») :
// le tirer en sujet ou en complément direct.

// Le nom que la gazette te donne, par article (le dernier paru dans ce cycle
// l'emporte). Avant le premier, ils ne t'appellent pas.
const MAIN_INVISIBLE = { fr: 'la main invisible', Fr: 'La main invisible', en: 'the invisible hand', En: 'The invisible hand' };
const CREATEUR = { fr: 'le Créateur', Fr: 'Le Créateur', en: 'the Creator', En: 'The Creator' };
const INVISIBLE = { fr: 'l’Invisible', Fr: 'L’Invisible', en: 'the Invisible', En: 'The Invisible' };
const LA_MAIN = { fr: 'la Main', Fr: 'La Main', en: 'the Hand', En: 'The Hand' };
export const NOMS_DU_JOUEUR = {
  p3_knowledge_probability: MAIN_INVISIBLE,
  p4_tension_invisible: INVISIBLE,
  p4_tension_cult: CREATEUR,
  p4_food_banquet: { fr: 'Celui qui nous guide', Fr: 'Celui qui nous guide', en: 'the One who guides us', En: 'The One who guides us' },
  p4_knowledge_treatise: { fr: 'Celui qui regarde', Fr: 'Celui qui regarde', en: 'the One who watches', En: 'The One who watches' },
  p4_gold_sacred: CREATEUR,
  p5_food_bread: { fr: 'Celui qui veille', Fr: 'Celui qui veille', en: 'the One who keeps watch', En: 'The One who keeps watch' },
  p5_gold_coins: LA_MAIN,
  p6_tension_parties: CREATEUR,
  p6_gold_logo: LA_MAIN,
  p6_gold_khael: INVISIBLE,
  p7_tension_cult: CREATEUR,
  p7_gold_hand: LA_MAIN,
  p7_know_raphael: { fr: 'celui qui joue', Fr: 'Celui qui joue', en: 'the one who plays', En: 'The one who plays' },
};

export const PAROLES_TOI = [
  // ══ CE QU'ILS VOIENT, À TOUT ÂGE ════════════════════════════════════════════
  // ── La caméra le suit ──
  { id: 't3-suivi-feu', kind: 'thought', layer: 3, bands: [0, 1], when: { followed: true }, lines: [
    { fr: 'Depuis la source, j’ai l’impression que quelqu’un marche derrière moi. Je me retourne, il n’y a que les arbres.', en: 'Ever since the spring, I feel like someone is walking behind me. I turn round and there are only trees.' },
  ] },
  { id: 't3-suivi-bourg', kind: 'thought', layer: 3, bands: [2, 5], when: { followed: true }, lines: [
    { m: 'Depuis le pont, je me sens suivi. Deux fois je me suis arrêté devant une vitrine pour voir. Personne.', f: 'Depuis le pont, je me sens suivie. Deux fois je me suis arrêtée devant une vitrine pour voir. Personne.', en: 'Since the bridge I’ve felt followed. Twice I stopped at a shop window to check. Nobody.' },
  ] },
  { id: 't3-suivi-raphael', kind: 'thought', layer: 3, bands: [1, 3], when: { followed: true, article: ['p3_knowledge_probability'] }, lines: [
    { m: 'Ça fait trois rues que je me sens regardé. Raphaël dirait que c’est {nom}. Je marche plus vite.', f: 'Ça fait trois rues que je me sens regardée. Raphaël dirait que c’est {nom}. Je marche plus vite.', en: 'Three streets now I’ve felt watched. Raphaël would say it’s {nom}. I walk faster.' },
  ] },
  { id: 't3-suivi-aldric', kind: 'thought', layer: 3, bands: [3, 5], when: { followed: true, article: ['p4_knowledge_question'] }, lines: [
    { m: 'Ça fait trois rues que je me sens regardé. Aldric a raison, on est observés. Je marche plus vite.', f: 'Ça fait trois rues que je me sens regardée. Aldric a raison, on est observés. Je marche plus vite.', en: 'Three streets now I’ve felt watched. Aldric is right, we are being observed. I walk faster.' },
  ] },
  { id: 't3-suivi-nom', kind: 'thought', layer: 3, bands: [4, 6], when: { followed: true, trust: 2, period: [5, 7] }, lines: [
    { m: 'Ça fait trois rues que je me sens regardé. Ma grand-mère dirait que c’est {nom}. Je marche plus vite.', f: 'Ça fait trois rues que je me sens regardée. Ma grand-mère dirait que c’est {nom}. Je marche plus vite.', en: 'Three streets now I’ve felt watched. My grandmother would say it’s {nom}. I walk faster.' },
  ] },
  { id: 't3-suivi-nom-x', kind: 'thought', layer: 3, bands: [7, 9], when: { followed: true, trust: 2, period: [5, 7] }, lines: [
    { m: 'Ça fait trois passerelles que je me sens regardé. Ma grand-mère dirait que c’est {nom}.', f: 'Ça fait trois passerelles que je me sens regardée. Ma grand-mère dirait que c’est {nom}.', en: 'Three walkways now I’ve felt watched. My grandmother would say it’s {nom}.' },
  ] },
  { id: 't3-suivi-neon', kind: 'thought', layer: 3, bands: [6, 9], when: { followed: true }, lines: [
    { fr: 'Les caméras de la rue me suivent, d’accord. Mais là, c’est autre chose. Je le sens dans la nuque.', en: 'The street cameras follow me, fine. But this is something else. I can feel it on the back of my neck.' },
  ] },
  { id: 't3-suivi-enfant', kind: 'thought', layer: 3, bands: [2, 6], when: { followed: true, child: true }, lines: [
    { fr: 'Il y a quelqu’un qui me suit, mais il n’a pas de pieds. Je vais le dire à maman.', en: 'Someone is following me, but they don’t have feet. I’m going to tell Mum.' },
  ] },
  { id: 't3-suivi-enfant-x', kind: 'thought', layer: 3, bands: [7, 9], when: { followed: true, child: true }, lines: [
    { fr: 'Quelqu’un me suit depuis l’école. Pas une caméra. Quelqu’un.', en: 'Someone has been following me since school. Not a camera. Someone.' },
  ] },

  // ── Les idées qui s'en vont (les bulles cueillies) ──
  { id: 't3-bulle-miel', kind: 'thought', layer: 3, bands: [0, 1], when: { bulles: true }, lines: [
    { fr: 'Ce matin, je savais où trouver du miel. Je l’ai su jusqu’au gué, et puis plus rien.', en: 'This morning I knew where to find honey. I knew it all the way to the ford, then nothing.' },
  ] },
  { id: 't3-bulle-toit', kind: 'thought', layer: 3, bands: [2, 6], when: { bulles: true }, lines: [
    { fr: 'J’avais une idée pour le toit en sortant de chez moi. Au coin de la rue, elle n’y était plus. C’est la troisième fois cette semaine.', en: 'I had an idea for the roof when I left the house. By the corner it was gone. Third time this week.' },
  ] },
  { id: 't3-bulle-chat', kind: 'chat', layer: 3, bands: [2, 6], when: { bulles: true }, lines: [
    { who: 'a', fr: 'Tu sais à quoi tu pensais, juste avant ?', en: 'Do you know what you were thinking about, just before?' },
    { who: 'b', fr: 'Non. C’est parti d’un coup.', en: 'No. It just went.' },
    { who: 'a', fr: 'Moi aussi, ce matin. Ma voisine dit qu’on nous les prend.', en: 'Same with me, this morning. My neighbour says someone takes them.' },
  ] },
  { id: 't3-bulle-tours', kind: 'thought', layer: 3, bands: [7, 9], when: { bulles: true }, lines: [
    { fr: 'Une idée m’est venue près de la tour sud, et je ne la retrouve pas dans ma mémoire. Ni dans celle du chœur.', en: 'An idea came to me near the south tower and I can’t find it in my memory. Or in the chorus’s.' },
  ] },

  // ── Les jours où rien ne se bâtit (l'absence) ──
  { id: 't3-absence-camp', kind: 'thought', layer: 3, bands: [0, 1], when: { away: true }, lines: [
    { fr: 'Pendant des jours, personne n’a rien bâti. Les enfants disaient que le camp dormait.', en: 'For days nobody built anything. The children said the camp was asleep.' },
  ] },
  { id: 't3-absence-champs', kind: 'thought', layer: 3, bands: [2, 4], when: { away: true }, lines: [
    { fr: 'Pendant trois jours, personne n’a posé une pierre. Les champs ont poussé quand même.', en: 'For three days nobody laid a stone. The fields grew all the same.' },
  ] },
  { id: 't3-absence-grues', kind: 'thought', layer: 3, bands: [5, 6], when: { away: true }, lines: [
    { fr: 'Toute la semaine, les chantiers sont restés arrêtés. Ce matin, tout est reparti d’un coup, à la même minute.', en: 'All week the building sites stood still. This morning everything started up at once, at the same minute.' },
  ] },
  { id: 't3-absence-tours', kind: 'thought', layer: 3, bands: [7, 9], when: { away: true }, lines: [
    { fr: 'Pendant des jours, aucune tour n’a poussé. Ce matin, trois d’un coup.', en: 'For days not a single tower went up. This morning, three at once.' },
  ] },
  { id: 't3-absence-chat', kind: 'chat', layer: 3, bands: [2, 6], when: { away: true }, lines: [
    { who: 'a', fr: 'Tu as remarqué ? Pendant des jours, plus rien ne se construisait.', en: 'Did you notice? For days nothing new was being built.' },
    { who: 'b', fr: 'Le chantier de ma rue est resté ouvert, avec les outils posés.', en: 'The site on my street just sat there, tools lying where they were.' },
    { who: 'a', fr: 'Et ce matin, ils ont tous repris en même temps.', en: 'And this morning they all started again at the same time.' },
  ] },

  // ── La Maison des Plaisirs ──
  { id: 't3-plaisirs-table', kind: 'thought', layer: 3, bands: [2, 6], when: { plaisirs: true, trust: 2 }, lines: [
    { fr: 'Mon cousin sert à la Maison des Plaisirs. Il dit qu’il y a une table où quelqu’un joue toutes les nuits, et qu’il n’y a jamais personne d’assis.', en: 'My cousin works at the House of Pleasures. He says there’s a table where someone plays every night, and nobody is ever sitting there.' },
  ] },
  { id: 't3-plaisirs-chat', adult: true, kind: 'chat', layer: 3, bands: [2, 6], when: { plaisirs: true }, lines: [
    { who: 'a', fr: 'Il paraît qu’on joue gros, à la Maison des Plaisirs.', en: 'They say the stakes are high at the House of Pleasures.' },
    { who: 'b', fr: 'Qui ça ?', en: 'Who does?' },
    { who: 'a', fr: 'Personne ne sait. Le croupier dit que les jetons partent tout seuls de la caisse.', en: 'Nobody knows. The croupier says the chips leave the till on their own.' },
  ] },

  { id: 't3-plaisirs-machine', kind: 'thought', layer: 3, bands: [7, 9], when: { plaisirs: true, trust: 2 }, lines: [
    { fr: 'Il paraît qu’à la Maison des Plaisirs, une table joue seule toute la nuit. Le personnel a ordre de ne pas la débarrasser.', en: 'They say that at the House of Pleasures one table plays by itself all night. The staff are told not to clear it.' },
  ] },

  // ══ CE QUE LA CITÉ D'AVANT A LAISSÉ ═════════════════════════════════════════
  // ── Ses ruines ──
  { id: 't3-ruines-camp', kind: 'thought', layer: 3, bands: [0, 1], when: { collapses: 1 }, lines: [
    { fr: 'Dans le champ de pierres, au nord, il y avait un camp avant le nôtre. On y trouve encore des foyers noirs.', en: 'In the stony field to the north there was a camp before ours. You can still find black hearths there.' },
  ] },
  { id: 't3-ruines-tuiles', kind: 'thought', layer: 3, bands: [2, 3], when: { collapses: 1 }, lines: [
    { fr: 'En labourant, mon père a trouvé des tuiles sous la terre. Il y avait un village ici, avant le nôtre.', en: 'Ploughing, my father found roof tiles under the soil. There was a village here before ours.' },
  ] },
  { id: 't3-ruines-rue', kind: 'thought', layer: 3, bands: [4, 5], when: { collapses: 1 }, lines: [
    { fr: 'Sous les fondations du nouveau marché, ils ont trouvé une rue entière, avec ses pavés et ses égouts.', en: 'Under the foundations of the new market they found a whole street, paving and sewers included.' },
  ] },
  { id: 't3-ruines-parking', kind: 'thought', layer: 3, bands: [6, 6], when: { collapses: 1 }, lines: [
    { fr: 'Pour le parking, ils ont creusé jusqu’à une ville d’avant. Les travaux sont arrêtés depuis un mois.', en: 'Digging for the car park, they hit a city from before. Work has been stopped for a month.' },
  ] },
  { id: 't3-ruines-archives', kind: 'thought', layer: 3, bands: [7, 9], when: { collapses: 1 }, lines: [
    { fr: 'Les archives parlent de villes avant la nôtre, au même endroit. On ne nous l’apprend qu’en dernière année.', en: 'The archives speak of cities before ours, in this same place. They only teach it in the final year.' },
  ] },
  { id: 't3-ruines-trois', kind: 'thought', layer: 3, bands: [2, 6], when: { collapses: 3 }, lines: [
    { fr: 'On dit qu’on a bâti ici trois fois, peut-être quatre. Chaque fois au même endroit, près du fleuve.', en: 'They say we’ve built here three times, maybe four. Each time in the same spot, by the river.' },
  ] },
  { id: 't3-ruines-chat', kind: 'chat', layer: 3, bands: [2, 6], when: { collapses: 1 }, lines: [
    { who: 'a', fr: 'Tu sais pourquoi la ville d’avant est tombée ?', en: 'Do you know why the city before fell?' },
    { who: 'b', fr: 'Ma grand-mère disait la faim. Le maître d’école dit la guerre.', en: 'My grandmother said hunger. The schoolmaster says war.' },
    { who: 'a', fr: 'Et toi ?', en: 'And you?' },
    { who: 'b', fr: 'Moi, j’ai juste vu les pierres.', en: 'Me, I’ve only seen the stones.' },
  ] },
  { id: 't3-chute-pleine', kind: 'thought', layer: 3, bands: [2, 6], when: { collapses: 1, manual: true, trust: 2 }, lines: [
    { fr: 'Les anciens disent que la ville d’avant est tombée d’un coup, un jour où les greniers étaient pleins. Ce n’était pas la famine.', en: 'The old folk say the city before fell all at once, on a day the granaries were full. It wasn’t famine.' },
  ] },
  { id: 't3-chute-nom', kind: 'thought', layer: 3, bands: [5, 9], when: { collapses: 1, manual: true, trust: 3 }, lines: [
    { fr: 'Ceux du temple disent que c’est {nom} qui a fait tomber la ville d’avant, le jour où elle allait le mieux. Ma mère dit qu’ils exagèrent.', en: 'The temple people say it was {nom} who brought down the city before, on the very day it was doing best. My mother says they exaggerate.' },
  ] },

  // ── Son legs ──
  { id: 't3-legs-grain', kind: 'thought', layer: 3, bands: [2, 6], when: { legacy: 'granaries' }, lines: [
    { fr: 'Sous les ruines, on a trouvé des réserves encore pleines. Le grain était sec, comme si on l’avait rangé pour nous.', en: 'Under the ruins we found stores still full. The grain was dry, as if someone had put it away for us.' },
  ] },
  { id: 't3-legs-memoire', kind: 'thought', layer: 3, bands: [2, 6], when: { legacy: 'archives' }, lines: [
    { fr: 'Dans une cave sous les ruines, il y avait des registres d’une ville qu’on ne connaît pas. On les lit encore le soir.', en: 'In a cellar under the ruins there were records from a city nobody knows. People still read them in the evenings.' },
  ] },
  { id: 't3-legs-ordre', kind: 'thought', layer: 3, bands: [2, 6], when: { legacy: 'laws' }, lines: [
    { fr: 'Notre première règle, on ne l’a pas inventée. On l’a trouvée gravée sur une pierre des ruines, et on l’a gardée.', en: 'We didn’t make up our first rule. We found it carved on a stone in the ruins, and we kept it.' },
  ] },
  { id: 't3-legs-pillage', kind: 'thought', layer: 3, bands: [2, 6], when: { legacy: 'plunder' }, lines: [
    { fr: 'Ceux d’avant avaient caché leurs richesses sous la place. On les a trouvées en creusant la fontaine.', en: 'The people before had hidden their riches under the square. We found them digging the fountain.' },
  ] },
  { id: 't3-legs-grain-camp', kind: 'thought', layer: 3, bands: [0, 1], when: { legacy: 'granaries' }, lines: [
    { fr: 'En creusant derrière l’abri, on a trouvé des jarres pleines de grain. Personne au camp ne les avait enterrées.', en: 'Digging behind the shelter we found jars full of grain. Nobody in the camp had buried them.' },
  ] },
  { id: 't3-legs-memoire-camp', kind: 'thought', layer: 3, bands: [0, 1], when: { legacy: 'archives' }, lines: [
    { fr: 'Sur les rochers du ravin, il y a des marques gravées. Ce ne sont pas les nôtres, mais elles comptent les lunes comme nous.', en: 'On the ravine rocks there are carved marks. They aren’t ours, but they count the moons the way we do.' },
  ] },
  { id: 't3-legs-ordre-camp', kind: 'thought', layer: 3, bands: [0, 1], when: { legacy: 'laws' }, lines: [
    { fr: 'Les anciens disent que la règle du partage vient d’avant le camp. Personne ne sait qui l’a faite.', en: 'The elders say the sharing rule comes from before the camp. Nobody knows who made it.' },
  ] },
  { id: 't3-legs-pillage-camp', kind: 'thought', layer: 3, bands: [0, 1], when: { legacy: 'plunder' }, lines: [
    { fr: 'Sous les cendres d’un vieux feu, on a trouvé des haches enterrées. Beaucoup trop pour un seul clan.', en: 'Under the ashes of an old fire we found buried axes. Far too many for one clan.' },
  ] },
  { id: 't3-legs-loin', kind: 'thought', layer: 3, bands: [7, 9], when: { collapses: 1, trust: 2 }, lines: [
    { fr: 'Ceux d’avant nous ont laissé quelque chose sous les ruines. Les vieux disent qu’ils savaient qu’on viendrait.', en: 'The people before left us something under the ruins. The old folk say they knew we would come.' },
  ] },

  // ── Le culte que l'Olympe a proclamé ──
  { id: 't3-culte-fin', kind: 'thought', layer: 3, bands: [2, 6], when: { profile: 'apocalypse' }, lines: [
    { fr: 'Ma tante va au temple des ruines tous les sept jours. Elle compte les années en chutes, comme les prêtres.', en: 'My aunt goes to the temple of ruins every seven days. She counts the years in collapses, like the priests.' },
  ] },
  { id: 't3-culte-registres', kind: 'thought', layer: 3, bands: [3, 6], when: { profile: 'bureaucracy' }, lines: [
    { fr: 'Au temple, on dépose sa prière par écrit, en deux exemplaires. Le prêtre tamponne le second et me le rend.', en: 'At the temple you hand in your prayer in writing, in duplicate. The priest stamps the second copy and gives it back.' },
  ] },
  { id: 't3-culte-sommeil', kind: 'thought', layer: 3, bands: [2, 6], when: { profile: 'sleep', trust: 2 }, lines: [
    { fr: 'Le veilleur de notre rue parle tout bas, la nuit. Il dit qu’il ne faut pas réveiller {nom}.', en: 'Our street’s watchman talks in a whisper at night. He says you mustn’t wake {nom}.' },
  ] },
  { id: 't3-culte-abime', kind: 'thought', layer: 3, bands: [2, 6], when: { profile: 'abyss' }, lines: [
    { fr: 'Ceux de l’Abîme se réunissent au bord de la falaise quand la ville tremble. Mon frère y va. Il revient sans rien dire.', en: 'The Abyss people gather at the cliff edge when the city shakes. My brother goes. He comes back without a word.' },
  ] },

  { id: 't3-culte-fin-x', kind: 'thought', layer: 3, bands: [7, 9], when: { profile: 'apocalypse' }, lines: [
    { fr: 'Ma tante compte encore les années en chutes, comme au temple des ruines. Elle a une ligne par ville sur son mur.', en: 'My aunt still counts the years in collapses, like at the temple of ruins. She has a line per city on her wall.' },
  ] },
  { id: 't3-culte-registres-x', kind: 'thought', layer: 3, bands: [7, 9], when: { profile: 'bureaucracy' }, lines: [
    { fr: 'Au temple, on dépose sa prière au registre du conseil, avec un numéro. La mienne est la quatre mille douze.', en: 'At the temple you file your prayer in the council register, with a number. Mine is four thousand and twelve.' },
  ] },
  { id: 't3-culte-sommeil-x', kind: 'thought', layer: 3, bands: [7, 9], when: { profile: 'sleep', trust: 2 }, lines: [
    { fr: 'Le veilleur de la tour parle tout bas, la nuit. Il dit qu’il ne faut pas réveiller {nom}.', en: 'The tower watchman talks in a whisper at night. He says you mustn’t wake {nom}.' },
  ] },
  { id: 't3-culte-abime-x', kind: 'thought', layer: 3, bands: [7, 9], when: { profile: 'abyss' }, lines: [
    { fr: 'Ceux de l’Abîme montent sur la plus haute passerelle quand la ville tremble. Mon frère y va. Il revient sans rien dire.', en: 'The Abyss people climb the highest walkway when the city shakes. My brother goes. He comes back without a word.' },
  ] },

  // ══ CE QUE DIT LA CHRONIQUE, PÉRIODE PAR PÉRIODE ════════════════════════════
  // ── P1, la tradition orale : on ne sait rien de toi ──
  { id: 't3-p1-feu', kind: 'chat', layer: 3, bands: [0, 0], when: { period: [1, 2] }, lines: [
    { who: 'a', fr: 'Le feu ne s’éteint jamais, même quand personne ne le garde.', en: 'The fire never goes out, even when nobody is minding it.' },
    { who: 'b', fr: 'Claude dit que c’est lui qui le garde.', en: 'Claude says he’s the one minding it.' },
    { who: 'a', fr: 'Claude dort, la nuit. Je l’ai vu.', en: 'Claude sleeps at night. I’ve seen him.' },
  ] },
  { id: 't3-p1-braises', kind: 'thought', layer: 3, bands: [0, 0], when: { period: [1, 2] }, lines: [
    { fr: 'Hier, j’ai laissé le feu mourir exprès. Ce matin, il y avait des braises. Personne ne s’est levé dans la nuit.', en: 'Yesterday I let the fire die on purpose. This morning there were embers. Nobody got up in the night.' },
  ] },
  { id: 't3-p1-reve', kind: 'thought', layer: 3, bands: [0, 1], when: { period: [1, 2], notJob: ['shaman'] }, lines: [
    { fr: 'Cette nuit, j’ai rêvé que je voyais le camp d’en haut, tout petit, comme un nid. Je l’ai raconté au chaman. Il n’a rien répondu.', en: 'Last night I dreamed I saw the camp from above, tiny, like a nest. I told the shaman. He said nothing.' },
  ] },
  { id: 't3-p1-flammes', kind: 'chat', layer: 3, bands: [0, 1], when: { period: [1, 2] }, lines: [
    { who: 'a', fr: 'Tu as remarqué ? Quand on se dispute au grand feu, les flammes baissent.', en: 'Have you noticed? When we argue at the big fire, the flames go down.' },
    { who: 'b', fr: 'C’est le vent.', en: 'That’s the wind.' },
    { who: 'a', fr: 'Il n’y avait pas de vent.', en: 'There was no wind.' },
  ] },
  { id: 't3-p1-chasse', kind: 'thought', layer: 3, bands: [0, 1], when: { period: [1, 2] }, lines: [
    { fr: 'Quand la chasse revient pleine, ma mère remercie le ciel. Moi, je remercie Brenn, c’est lui qui a lancé la sagaie.', en: 'When the hunt comes back full, my mother thanks the sky. I thank Brenn. He’s the one who threw the spear.' },
  ] },
  // ── P2, l'argile gravée : des dieux ──
  { id: 't3-p2-puits', kind: 'thought', layer: 3, bands: [0, 1], when: { article: ['p2_tension_gods'] }, lines: [
    { fr: 'Ceux du haut ont gravé leur dieu sur la pierre du puits. Ceux du bas l’ont gratté cette nuit.', en: 'The uphill lot carved their god on the well stone. The downhill lot scraped it off last night.' },
  ] },
  { id: 't3-p2-galettes', kind: 'thought', layer: 3, bands: [0, 1], when: { article: ['p2_crisis_harvest'] }, lines: [
    { fr: 'Ma mère a posé trois galettes devant la pierre du dieu en colère. Il ne nous reste plus que deux paniers.', en: 'My mother laid three flatbreads before the angry god’s stone. We’re down to two baskets.' },
  ] },
  { id: 't3-p2-chevre', kind: 'chat', layer: 3, bands: [0, 2], when: { period: [2, 3] }, lines: [
    { who: 'a', fr: 'Mon frère a porté une chèvre au temple, pour la pluie.', en: 'My brother took a goat to the temple, for rain.' },
    { who: 'b', fr: 'Et il a plu ?', en: 'And did it rain?' },
    { who: 'a', fr: 'Deux jours après. Il dit que c’est la chèvre.', en: 'Two days later. He says it was the goat.' },
  ] },
  { id: 't3-p2-tablette', kind: 'thought', layer: 3, bands: [0, 1], when: { article: ['p2_gold_temple'] }, lines: [
    { fr: 'Ils gravent sur les tablettes du temple tout ce qu’on apporte. Ma chèvre y est, entre deux sacs d’orge.', en: 'They carve on the temple tablets everything people bring. My goat is on there, between two sacks of barley.' },
  ] },
  { id: 't3-p2-argile', kind: 'thought', layer: 3, bands: [0, 1], when: { period: [2, 2] }, lines: [
    { fr: 'Au temple, ils gravent sur l’argile ce que veulent les dieux. Ça change à chaque lune, et il faut refaire les tablettes.', en: 'At the temple they carve on clay what the gods want. It changes every moon, and the tablets have to be redone.' },
  ] },
  { id: 't3-p2-lequel', kind: 'chat', layer: 3, bands: [0, 1], when: { article: ['p2_tension_gods'] }, lines: [
    { who: 'a', fr: 'Tu crois qu’un dieu nous regarde, là ?', en: 'Do you think a god is watching us right now?' },
    { who: 'b', fr: 'Lequel ? Ceux du haut en ont un, ceux du bas un autre.', en: 'Which one? The uphill lot have one, the downhill lot another.' },
  ] },
  // ── P3, le manuscrit : une main invisible ──
  { id: 't3-p3-raphael', kind: 'thought', layer: 3, bands: [1, 2], when: { article: ['p3_knowledge_probability'] }, lines: [
    { fr: 'Raphaël a écrit que nos récoltes étaient trop régulières pour être le hasard. Il appelle ça {nom}. Mon père a ri, puis il a recompté ses sacs.', en: 'Raphaël wrote that our harvests were too regular to be luck. He calls it {nom}. My father laughed, then counted his sacks again.' },
  ] },
  { id: 't3-p3-fumier', kind: 'chat', layer: 3, bands: [1, 3], when: { article: ['p3_knowledge_probability'] }, lines: [
    { who: 'a', fr: 'Tu y crois, toi, à ce que Raphaël a écrit ?', en: 'Do you believe what Raphaël wrote?' },
    { who: 'b', fr: 'Je ne sais pas. Mais depuis trois ans, pas une seule mauvaise récolte.', en: 'I don’t know. But three years now without one bad harvest.' },
    { who: 'a', fr: 'Mon oncle dit que c’est le fumier.', en: 'My uncle says it’s the manure.' },
  ] },
  { id: 't3-p3-deux-temples', kind: 'thought', layer: 3, bands: [1, 3], when: { article: ['p3_tension_schism'] }, lines: [
    { fr: 'Les deux prêtres ne se parlent plus. Je vais au temple de droite le matin, à celui de gauche le soir, pour ne fâcher personne.', en: 'The two priests don’t speak anymore. I go to the right-hand temple in the morning and the left-hand one at night, so as not to upset anyone.' },
  ] },
  { id: 't3-p3-banquet', kind: 'thought', layer: 3, bands: [1, 3], when: { article: ['p3_food_feast'] }, lines: [
    { fr: 'Au banquet des dieux, un enfant a demandé à qui étaient vraiment les offrandes. Les prêtres ont continué à manger.', en: 'At the gods’ banquet a child asked who the offerings were really for. The priests went on eating.' },
  ] },
  // ── P4, la proclamation : le Créateur, Celui qui regarde ──
  { id: 't3-p4-aube', kind: 'thought', layer: 3, bands: [3, 4], when: { article: ['p4_tension_cult'] }, lines: [
    { fr: 'Les fidèles du Créateur chantent sous ma fenêtre tous les matins à l’aube. J’ai fini par apprendre l’air.', en: 'The Creator’s faithful sing under my window every morning at dawn. I’ve ended up learning the tune.' },
  ] },
  { id: 't3-p4-banquet', kind: 'chat', layer: 3, bands: [3, 4], when: { article: ['p4_food_banquet'] }, lines: [
    { who: 'a', fr: 'Tu as vu le banquet pour {nom} ?', en: 'Did you see the banquet for {nom}?' },
    { who: 'b', fr: 'Trois cents plats, et la place d’honneur vide toute la soirée.', en: 'Three hundred dishes, and the seat of honour empty all evening.' },
    { who: 'a', fr: 'Ma sœur faisait le service. Les ministres ont tout mangé.', en: 'My sister was serving. The ministers ate the lot.' },
  ] },
  { id: 't3-p4-volets', kind: 'thought', layer: 3, bands: [3, 5], when: { article: ['p4_knowledge_question'] }, lines: [
    { fr: 'Aldric dit qu’on n’est pas bénis, mais observés. Depuis, je ferme les volets pour me changer.', en: 'Aldric says we’re not blessed but watched. Since then I close the shutters to get changed.' },
  ] },
  { id: 't3-p4-traite', kind: 'thought', layer: 3, bands: [3, 5], when: { article: ['p4_knowledge_treatise'] }, lines: [
    { fr: 'J’ai acheté le traité sur Celui qui regarde. Je l’ai lu deux fois. Je ne sais toujours pas à quoi il ressemble.', en: 'I bought the treatise on the One who watches. I’ve read it twice. I still don’t know what he looks like.' },
  ] },
  { id: 't3-p4-egouts', kind: 'thought', layer: 3, bands: [3, 4], when: { article: ['p4_tension_invisible'] }, lines: [
    { fr: 'Au conseil, la moitié veut un temple pour l’Invisible, l’autre moitié veut d’abord réparer les égouts. Mon voisin est dans la seconde moitié.', en: 'On the council, half want a temple for the Invisible and the other half want the sewers fixed first. My neighbour is in the second half.' },
  ] },
  { id: 't3-p4-or', kind: 'chat', layer: 3, bands: [3, 4], when: { article: ['p4_gold_sacred'] }, lines: [
    { who: 'a', fr: 'Ils ont déménagé l’or du temple dans la salle du roi.', en: 'They moved the temple gold into the king’s hall.' },
    { who: 'b', fr: 'Il a fallu douze hommes et toute la nuit. Mon fils en était.', en: 'It took twelve men and the whole night. My son was one of them.' },
  ] },
  // ── P5, l'imprimé : Celui qui veille, la Main ──
  { id: 't3-p5-piece', kind: 'thought', layer: 3, bands: [4, 5], when: { article: ['p5_gold_coins'] }, lines: [
    { fr: 'Les nouvelles pièces ont une main gravée à la place du visage. J’en garde une dans ma poche, pour la chance.', en: 'The new coins have a hand engraved where the face should be. I keep one in my pocket for luck.' },
  ] },
  { id: 't3-p5-lampe', kind: 'chat', layer: 3, bands: [4, 5], when: { article: ['p5_food_bread'] }, lines: [
    { who: 'a', fr: 'Dans la file du boulanger, ils disaient que {nom} passe dans les rues la nuit.', en: 'In the bread queue they were saying {nom} walks the streets at night.' },
    { who: 'b', fr: 'Ma voisine laisse une lampe allumée à sa fenêtre, au cas où.', en: 'My neighbour leaves a lamp lit in her window, just in case.' },
  ] },
  { id: 't3-p5-soupe', kind: 'thought', layer: 3, bands: [4, 5], when: { period: [5, 5], trust: 2 }, lines: [
    { fr: 'Mon frère dit que {nom} nous teste. Ma sœur dit que {nom} attend. Au repas, on ne parle plus que de ça, et la soupe refroidit.', en: 'My brother says {nom} is testing us. My sister says {nom} is waiting. At supper we talk of nothing else, and the soup goes cold.' },
  ] },
  // ── P6, la presse et les ondes : le logo, le procès ──
  { id: 't3-p6-proces', kind: 'thought', layer: 3, bands: [5, 6], when: { article: ['p6_gold_khael'] }, lines: [
    { fr: 'Le procès de Khael contre l’Invisible reprend lundi. J’ai demandé ma journée pour y assister. La salle sera pleine.', en: 'Khael’s trial against the Invisible resumes on Monday. I’ve asked for the day off to attend. The hall will be packed.' },
  ] },
  { id: 't3-p6-chaise', kind: 'chat', layer: 3, bands: [5, 6], when: { article: ['p6_gold_khael'] }, lines: [
    { who: 'a', fr: 'Tu crois que l’accusé viendra ?', en: 'Do you think the accused will turn up?' },
    { who: 'b', fr: 'Il n’est jamais venu.', en: 'He never has.' },
    { who: 'a', fr: 'Khael a quand même fait mettre une chaise pour lui.', en: 'Khael has had a chair put out for him anyway.' },
  ] },
  { id: 't3-p6-biscuits', kind: 'thought', layer: 3, bands: [5, 6], when: { article: ['p6_gold_logo'] }, lines: [
    { fr: 'La main est sur ma boîte de biscuits, sur le reçu de la banque et sur la porte de l’école.', en: 'The hand is on my biscuit tin, on the bank receipt and on the school door.' },
  ] },
  { id: 't3-p6-radio', kind: 'thought', layer: 3, bands: [5, 6], when: { article: ['p6_tension_parties'] }, lines: [
    { fr: 'À la radio, trois partis ont débattu deux heures de ce que veut le Créateur. Ils avaient gardé une chaise vide à la table.', en: 'On the radio, three parties argued for two hours about what the Creator wants. They’d kept an empty chair at the table.' },
  ] },
  { id: 't3-p6-ecole', kind: 'thought', layer: 3, bands: [5, 6], when: { article: ['p6_know_loops'], child: true }, lines: [
    { fr: 'À l’école, on apprend que les villes naissent, grandissent et tombent. J’ai demandé quand tombait la nôtre. La maîtresse a changé de sujet.', en: 'At school we learn that cities are born, grow and fall. I asked when ours falls. The teacher changed the subject.' },
  ] },
  // ── P7, le flux : la boucle, le compteur, « je crois qu'il joue » ──
  { id: 't3-p7-joue', kind: 'thought', layer: 3, bands: [6, 9], when: { article: ['p7_know_raphael'] }, lines: [
    { fr: 'Raphaël a écrit qu’il joue. Au bureau, quelqu’un a imprimé l’article et l’a punaisé à côté de la machine à café.', en: 'Raphaël wrote that he plays. At the office someone printed the article and pinned it up by the coffee machine.' },
  ] },
  { id: 't3-p7-compteur', kind: 'chat', layer: 3, bands: [6, 9], when: { article: ['p7_know_theory'] }, lines: [
    { who: 'a', fr: 'Tu as lu la théorie du compteur ?', en: 'Have you read the counter theory?' },
    { who: 'b', fr: 'Ils disent qu’on nous mesure en permanence.', en: 'They say we’re being measured all the time.' },
    { who: 'a', fr: 'Ma fille a arrêté de compter ses pas. Elle dit que quelqu’un le fait déjà.', en: 'My daughter has stopped counting her steps. She says someone already does.' },
  ] },
  { id: 't3-p7-montre', kind: 'thought', layer: 3, bands: [6, 9], when: { article: ['p7_tension_cult'] }, lines: [
    { fr: 'Ma mère va encore au culte du Créateur, mais elle garde sa montre au poignet pour partir avant la fin.', en: 'My mother still goes to the Creator’s service, but she keeps her watch on so she can leave before the end.' },
  ] },
  { id: 't3-p7-cahiers', kind: 'thought', layer: 3, bands: [6, 9], when: { article: ['p7_gold_hand'], kids: true }, lines: [
    { fr: 'La main est sur les écrans, les contrats, la porte de l’ascenseur. {enfant} la dessine sur tous ses cahiers.', en: 'The hand is on the screens, the contracts, the lift door. {enfant} draws it in every exercise book.' },
  ] },
  { id: 't3-p7-boucle', kind: 'thought', layer: 3, bands: [6, 9], when: { article: ['p7_know_loop'] }, lines: [
    { fr: 'Sur le fil, ils ne disent plus le destin. Ils disent la boucle. Mon père, lui, dit encore le destin.', en: 'On the feed they don’t say fate anymore. They say the loop. My father still says fate.' },
  ] },
  { id: 't3-p7-edith', kind: 'thought', layer: 3, bands: [6, 9], when: { article: ['p7_tension_edith'] }, lines: [
    { fr: 'Edith a demandé à le voir, dans le journal. Ma voisine a acheté trois exemplaires du suivant, au cas où il répondrait.', en: 'Edith asked to see him, in the paper. My neighbour bought three copies of the next issue, in case he answered.' },
  ] },

  // ══ LE NOM, UNE FOIS QUE LA GAZETTE L'A ÉCRIT ═══════════════════════════════
  { id: 't3-nom-bougie', kind: 'thought', layer: 3, bands: [2, 6], when: { family: 'married', trust: 2 }, lines: [
    { fr: 'La nuit, {conjoint} laisse une bougie à la fenêtre pour {nom}. Je n’ai jamais demandé pourquoi.', en: 'At night {conjoint} leaves a candle in the window for {nom}. I’ve never asked why.' },
  ] },
  { id: 't3-nom-coucou', kind: 'thought', layer: 3, bands: [2, 6], when: { child: true }, lines: [
    { fr: 'Maman dit que {nom} nous regarde. Je lui ai fait coucou depuis le pont, au cas où.', en: 'Mum says {nom} watches us. I waved from the bridge, just in case.' },
  ] },
  { id: 't3-nom-soupe', kind: 'chat', layer: 3, bands: [2, 6], when: { rel: 'parentKid' }, lines: [
    { who: 'kid', fr: 'Est-ce que {nom} nous voit, la nuit ?', en: 'Can {nom} see us at night?' },
    { who: 'parent', fr: 'Mange ta soupe.', en: 'Eat your soup.' },
  ] },
  { id: 't3-nom-croire-neuf', kind: 'chat', layer: 3, bands: [2, 4], when: { trust: 2, period: [3, 4] }, lines: [
    { who: 'a', fr: 'Tu crois que {nom} nous regarde, là, maintenant ?', en: 'Do you think {nom} is watching us right now?' },
    { who: 'b', fr: 'Ma mère y croit depuis qu’elle a lu ça. Elle se coiffe avant de sortir.', en: 'My mother has believed it ever since she read about it. She does her hair before going out.' },
  ] },
  { id: 't3-nom-croire', kind: 'chat', layer: 3, bands: [4, 8], when: { trust: 2, period: [5, 7] }, lines: [
    { who: 'a', fr: 'Tu crois que {nom} nous regarde, là, maintenant ?', en: 'Do you think {nom} is watching us right now?' },
    { who: 'b', fr: 'Ma grand-mère le croyait. Elle se coiffait avant de sortir.', en: 'My grandmother believed it. She did her hair before going out.' },
  ] },
  { id: 't3-nom-curieux', kind: 'thought', layer: 3, bands: [3, 7], when: { trait: 'curious' }, lines: [
    { fr: 'Si {nom} regarde la ville, le toit de chez moi se voit aussi. Il faudrait que je le répare.', en: 'If {nom} is watching the city, my roof is on show too. I ought to fix it.' },
  ] },
  { id: 't3-nom-superstitieux', kind: 'thought', layer: 3, bands: [4, 8], when: { trait: 'superstitious' }, lines: [
    { fr: 'Je touche la main de la porte en sortant, comme ma mère. Une fois j’ai oublié, et j’ai perdu ma bourse.', en: 'I touch the hand on the door on my way out, like my mother did. Once I forgot, and I lost my purse.' },
  ] },
  { id: 't3-nom-pieux', kind: 'thought', layer: 3, bands: [2, 6], when: { trait: 'pious' }, lines: [
    { fr: 'Je remercie {nom} pour la récolte, et je demande qu’on garde un œil sur mon frère, qui part demain.', en: 'I thank {nom} for the harvest, and ask for an eye kept on my brother, who leaves tomorrow.' },
  ] },
  { id: 't3-nom-raleur', kind: 'thought', layer: 3, bands: [3, 7], when: { trait: 'grumpy' }, lines: [
    { fr: 'Si {nom} veillait vraiment sur nous, l’égout de ma rue ne déborderait pas à chaque orage.', en: 'If {nom} really watched over us, the drain in my street wouldn’t overflow every storm.' },
  ] },
  { id: 't3-nom-coucou-x', kind: 'thought', layer: 3, bands: [7, 9], when: { child: true }, lines: [
    { fr: 'Maman dit que {nom} nous regarde. Je lui ai fait coucou depuis la passerelle, au cas où.', en: 'Mum says {nom} watches us. I waved from the walkway, just in case.' },
  ] },
  { id: 't3-nom-demain', kind: 'chat', layer: 3, bands: [7, 9], when: { rel: 'parentKid' }, lines: [
    { who: 'kid', fr: 'Est-ce que {nom} nous voit, même la nuit ?', en: 'Can {nom} see us, even at night?' },
    { who: 'parent', fr: 'Range tes affaires. On en parlera demain.', en: 'Put your things away. We’ll talk about it tomorrow.' },
  ] },
  { id: 't3-nom-pieux-x', kind: 'thought', layer: 3, bands: [7, 9], when: { trait: 'pious' }, lines: [
    { fr: 'Je remercie {nom} pour le jardin du toit, et je demande qu’on garde un œil sur mon frère, sur la navette du sud.', en: 'I thank {nom} for the roof garden, and ask for an eye kept on my brother, on the southern shuttle.' },
  ] },
  // ── La confiance gagnée : ce qu'on pense sans le dire ──
  { id: 't3-nom-jambe-neuf', kind: 'thought', layer: 3, bands: [2, 4], when: { trust: 3, period: [3, 4] }, lines: [
    { fr: 'Depuis que {nom} est dans toutes les bouches, il m’arrive de penser à voix basse, au cas où. Aujourd’hui je pensais à ma jambe.', en: 'Since {nom} has been on everyone’s lips, I sometimes think quietly, just in case. Today I was thinking about my leg.' },
  ] },
  { id: 't3-nom-jambe', kind: 'thought', layer: 3, bands: [4, 6], when: { trust: 3, period: [5, 7] }, lines: [
    { fr: 'Ma grand-mère disait qu’il suffit de penser fort pour que {nom} entende. Je pense fort à ma jambe, depuis trois jours.', en: 'My grandmother said you only had to think hard for {nom} to hear. I’ve been thinking hard about my leg for three days.' },
  ] },
  { id: 't3-nom-examen', kind: 'thought', layer: 3, bands: [7, 9], when: { trust: 3, period: [5, 7] }, lines: [
    { fr: 'Ma grand-mère disait qu’il suffit de penser fort pour que {nom} entende. Je pense fort à mon examen, depuis trois jours.', en: 'My grandmother said you only had to think hard for {nom} to hear. I’ve been thinking hard about my exam for three days.' },
  ] },
  { id: 't3-nom-loyer', adult: true, kind: 'thought', layer: 3, bands: [4, 8], when: { trust: 3 }, lines: [
    { fr: 'Il m’arrive de penser à voix basse, au cas où {nom} écouterait. Aujourd’hui, je pensais au loyer.', en: 'Sometimes I think quietly, in case {nom} is listening. Today I was thinking about the rent.' },
  ] },
  { id: 't3-toi-marche', kind: 'thought', layer: 3, bands: [2, 6], when: { trust: 3, followed: true }, lines: [
    { fr: 'Si c’est toi qui me suis depuis tout à l’heure, je vais au marché. Rien d’intéressant.', en: 'If that’s you following me since earlier, I’m only going to the market. Nothing interesting.' },
  ] },
  { id: 't3-toi-jardin', kind: 'thought', layer: 3, bands: [7, 9], when: { trust: 3, followed: true }, lines: [
    { fr: 'Si c’est toi qui me suis depuis la tour, je vais juste au jardin du toit. Rien d’intéressant.', en: 'If that’s you following me since the tower, I’m only going up to the roof garden. Nothing interesting.' },
  ] },
];
