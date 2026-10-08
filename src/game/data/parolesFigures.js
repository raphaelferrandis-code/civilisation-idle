"use strict";

// LES FIGURES DE LA CHRONIQUE DANS LA RUE (docs/PLAN-ECOUTER-PARLER.md, lot 6, § 7.4).
//
// Claude, Edith, Raphaël, Khael et Aldric signent la gazette depuis les premiers âges. Dès la
// période 3, ils vivent dans la cité (paroles/figures.js) : on les croise comme les autres
// passants, avec leur prénom et le métier que leur signature donne à cette période (« Khael,
// juge autoproclamé », « Edith, Intendante »). Ils ont leurs pensées à eux et leurs échanges
// avec toi (`when.chronique`), aux temps forts de leur arc dans la Chronique : Edith reçoit
// enfin la personne à qui elle avait écrit, Khael te juge, Raphaël demande s'il se trompe,
// Aldric pose sa question. Claude traverse les cités : il se souvient de toi (`when.knows` :
// tu lui as parlé dans une autre cité).
//
// FIGURES : qui ils sont. `age` : la classe d'âge (citizenIdentity.ageRange), `ageAt` : où
// dans cette classe (0 le plus jeune, 1 le plus vieux) ; seuls Claude et Aldric sont vieux
// (l'écoute les dit vieux dès 65 % de la vie adulte : Edith, Raphaël et Khael restent en deçà). `role` : ce que la fiche dit qu'il
// fait quand il flâne. `jobs` : [période maximale, métier
// (citizenIdentity.JOBS), ateliers par ordre de préférence (ids de buildings.js)], dans
// l'ordre ; le premier atelier que la cité a bâti est le sien, aucun : il n'en a pas.
// `look` : la variante de son dessin à chaque âge de la cité (bande 0 à 9, agents.js) : les
// quatre hommes portent chacun un dessin différent, sauf Khael et Aldric en costume à la
// ville de bureaux ; Claude garde le dessin le plus vieux qu'il peut (le chaman, le moine).
// FIGURE_PENSEES : leurs pensées (genre 'thought', lues par l'écoute).
// FIGURE_MOTS : ce qu'ils disent quand tu leur parles (genre 'talk', comme parolesMots.js ;
// leurs propres réponses aux temps forts, le répertoire des quatre voix sinon). Claude dit
// « tu » à tous les âges : ses échanges des périodes 4 à 9 ont leurs quatre réponses et leur
// silence. Les autres suivent le lien (§ 7.3).
// La plume de paroles.js : du concret, ni maxime ni bon mot de fin. Ni tiret, ni « ! », ni
// points de suspension ; l'apostrophe typographique.

export const FIGURES = {
  claude: {
    given: 'Claude', fem: false, age: 'old', ageAt: 1, traits: ['stubborn', 'grumpy'],
    role: { fr: 'cherche du bois sec', en: 'looking for dry wood' },
    jobs: [[10, 'firekeeper', ['ancestral_cult', 'storytellers']]],
    look: [3, 3, 2, 2, 3, 3, 1, 0, 3, 2],
  },
  edith: {
    given: 'Edith', fem: true, age: 'mature', ageAt: 0.3, traits: ['thrifty', 'hardworking'],
    role: { fr: 'recompte un registre en marchant', en: 'checking a ledger as she walks' },
    jobs: [
      [3, 'accountant', ['markets', 'granaries_city']],
      [4, 'steward', ['granaries_city', 'bureaucracy', 'markets']],
      [10, 'accountant', ['bureaucracy', 'ministries', 'imperial_exchanges', 'mint_houses', 'markets']],
    ],
    look: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
  },
  raphael: {
    given: 'Raphaël', fem: false, age: 'mature', ageAt: 0.2, traits: ['curious', 'dreamy'],
    role: { fr: 'prend des notes', en: 'taking notes' },
    jobs: [[5, 'resident', []], [10, 'essayist', ['printing_houses', 'libraries', 'scribes']]],
    look: [1, 1, 1, 1, 2, 1, 3, 1, 1, 3],
  },
  khael: {
    given: 'Khael', fem: false, age: 'mature', ageAt: 0.35, traits: ['proud', 'stubborn'],
    role: { fr: 'cherche un plaignant', en: 'looking for a plaintiff' },
    jobs: [[10, 'judge', ['courthouses', 'bureaucracy', 'markets']]],
    look: [2, 2, 3, 3, 0, 2, 0, 2, 2, 1],
  },
  aldric: {
    given: 'Aldric', fem: false, age: 'old', ageAt: 0.4, traits: ['curious', 'absent'],
    role: { fr: 'réfléchit en marchant', en: 'thinking as he walks' },
    jobs: [[10, 'philosopher', ['academies', 'think_tanks', 'universities', 'libraries', 'scribes']]],
    look: [0, 0, 0, 0, 1, 0, 0, 3, 0, 0],
  },
};
export const FIGURE_KEYS = Object.keys(FIGURES);
// La première période où ils sont dans la rue (Claude veille au feu du camp avant : lot 5).
export const FIGURES_FROM = 3;
// Son métier à cette période : { job, works }.
export function figureJob(key, period) {
  const F = FIGURES[key];
  if (!F) return null;
  const step = F.jobs.find(([max]) => period <= max) || F.jobs[F.jobs.length - 1];
  return { job: step[1], works: step[2] };
}

// ── LEURS PENSÉES ────────────────────────────────────────────────────────────────
const P3 = [3, 3], P8 = [8, 8], P9 = [9, 9], P10 = [10, 10];
const p = (id, chronique, bands, period, line, when = {}) => ({
  id, kind: 'thought', layer: 1, bands, when: { chronique, period, ...when }, lines: [{ who: 'a', ...line }],
});
export const FIGURE_PENSEES = [
  // Claude
  p('f-claude-fagots', 'claude', [1, 5], [3, 5], { fr: 'Trois fagots par jour, pour le feu. Les jeunes ne savent plus choisir le bois sec.', en: 'Three bundles a day, for the fire. The young ones can’t pick dry wood any more.' }),
  p('f-claude-nuit', 'claude', [1, 5], [3, 5], { fr: 'J’ai déjà vu ce genre de nuit. Je remets une bûche, au cas où.', en: 'I’ve seen this kind of night before. I’ll put another log on, just in case.' }, { night: true }),
  p('f-claude-centrales', 'claude', [5, 6], [6, 7], { fr: 'Les centrales se sont encore arrêtées cette nuit. J’ai gardé le feu, comme d’habitude.', en: 'The power stations stopped again last night. I kept the fire going, as usual.' }),
  p('f-claude-ecrans', 'claude', [5, 6], [6, 7], { fr: 'Quand les écrans tombent, les gens viennent s’asseoir près de ma flamme. Ils ne disent pas pourquoi.', en: 'When the screens go down, people come and sit by my flame. They don’t say why.' }),
  p('f-claude-allumettes', 'claude', [7, 9], [8, 10], { fr: 'J’ai toujours une boîte d’allumettes dans la poche. Personne ici ne sait plus s’en servir.', en: 'I always keep a box of matches in my pocket. Nobody here knows how to use them any more.' }),
  p('f-claude-tas', 'claude', [7, 7], P8, { fr: 'Ils ont tous une pensée commune pour le chauffage. Moi, j’ai mon tas de bois derrière la cabane.', en: 'They all share one thought about the heating. I have my woodpile behind the hut.' }),
  p('f-claude-cale', 'claude', [8, 8], P9, { fr: 'Un seul feu permis à bord, et c’est le mien. Je descends le voir trois fois par nuit.', en: 'Only one fire allowed on board, and it’s mine. I go down to check it three times a night.' }),
  p('f-claude-mur', 'claude', [9, 9], P10, { fr: 'Ce soir, les machines se sont arrêtées. J’ai frotté une allumette sur le mur, et le feu a pris.', en: 'Tonight the machines stopped. I struck a match on the wall, and the fire caught.' }),
  // Edith
  p('f-edith-pieces', 'edith', [1, 5], [3, 5], { fr: 'Quarante-deux pièces manquent au registre du marché. Je les retrouverai avant ce soir.', en: 'Forty-two coins are missing from the market register. I’ll find them before tonight.' }),
  p('f-edith-assistants', 'edith', [1, 5], [3, 5], { fr: 'Trois assistants, deux tables et une semaine sans prophète. Je l’ai demandé par écrit.', en: 'Three assistants, two tables and a week without prophets. I put it in writing.' }),
  p('f-edith-colonne', 'edith', [5, 6], [6, 7], { fr: 'Je recompte la colonne héritage pour la troisième fois. Les pertes anciennes y deviennent des gains.', en: 'I’m recounting the legacy column for the third time. The old losses turn into gains in it.' }),
  p('f-edith-demande', 'edith', [5, 6], [6, 7], { fr: 'Ma demande est partie depuis trois semaines. Pas de réponse. Je garde le double.', en: 'My request went out three weeks ago. No answer. I’m keeping the copy.' }),
  p('f-edith-absent', 'edith', [7, 9], [8, 10], { fr: 'J’ai ouvert un compte au nom de l’Absent. Personne n’y dépose rien. Je le tiens à jour quand même.', en: 'I opened an account in the Absent One’s name. Nobody pays anything in. I keep it up to date anyway.' }),
  p('f-edith-choeur', 'edith', [7, 7], P8, { fr: 'Il manque une pensée au chœur. J’ai compté trois fois, par écrit.', en: 'There’s one thought missing from the choir. I counted three times, on paper.' }),
  p('f-edith-sphere', 'edith', [8, 8], P9, { fr: 'J’écris le relevé de compte sur la face extérieure de la sphère. Il me reste quarante kilomètres.', en: 'I’m writing the statement of account on the outside of the sphere. Forty kilometres to go.' }),
  p('f-edith-ligne', 'edith', [9, 9], P10, { fr: 'Il reste une ligne en bas de la dernière page. Je ne la remplirai pas à sa place.', en: 'There’s one line left at the bottom of the last page. I won’t fill it in for him.' }),
  // Raphaël
  p('f-raphael-carnet', 'raphael', [1, 5], [3, 5], { fr: 'Je tiens un carnet des sauvetages. Le dernier ressemble trop au précédent.', en: 'I keep a notebook of rescues. The last one looks too much like the one before.' }),
  p('f-raphael-savant', 'raphael', [1, 2], P3, { fr: 'Le savant du marché parle d’une main invisible. J’ai écrit qu’il devrait se reposer.', en: 'The scholar at the market talks about an invisible hand. I wrote that he should get some rest.' }),
  p('f-raphael-lettre', 'raphael', [3, 5], [4, 5], { fr: 'J’écris à la gazette tous les mois. Ils publient une lettre sur trois.', en: 'I write to the gazette every month. They print one letter in three.' }),
  p('f-raphael-pages', 'raphael', [5, 6], [6, 7], { fr: 'Trois pages sur le jeu, ce matin. Je les ai déchirées, sauf une.', en: 'Three pages on the game this morning. I tore them up, all but one.' }),
  p('f-raphael-lettres', 'raphael', [5, 6], [6, 7], { fr: 'Je reçois des lettres de gens qui pensent comme moi. Certaines sont écrites au crayon, la nuit.', en: 'I get letters from people who think as I do. Some are written in pencil, at night.' }),
  p('f-raphael-midi', 'raphael', [7, 7], P8, { fr: 'À midi, toute la ville arrête de penser une minute. J’ai proposé l’idée, et elle a pris.', en: 'At noon the whole city stops thinking for a minute. I suggested it, and it caught on.' }),
  p('f-raphael-bord', 'raphael', [7, 8], [8, 9], { fr: 'Si nous sommes une partie, la table a un bord. Il faut que j’aille voir.', en: 'If we’re a game, the table has an edge. I have to go and see.' }),
  p('f-raphael-chapitre', 'raphael', [9, 9], P10, { fr: 'Je suis revenu du bord. Il n’y en a pas. J’écris le chapitre pour la cité d’après.', en: 'I came back from the edge. There isn’t one. I’m writing the chapter for the next city.' }),
  // Khael
  p('f-khael-jeudi', 'khael', [1, 5], [3, 5], { fr: 'Je tiens audience sur la place, le jeudi. Personne ne m’a nommé juge. Trois plaignants sont venus ce matin.', en: 'I hold court on the square on Thursdays. Nobody appointed me judge. Three plaintiffs came this morning.' }),
  p('f-khael-statues', 'khael', [1, 5], [3, 5], { fr: 'Les statues des dieux ont le nez du notable qui les a payées. Je l’ai noté dans le dossier.', en: 'The statues of the gods have the nose of the notable who paid for them. I put it in the file.' }),
  p('f-khael-dossier', 'khael', [5, 6], [6, 7], { fr: 'Le dossier contre l’Invisible fait six cents pages. J’ai acheté une deuxième armoire.', en: 'The case against the Invisible runs to six hundred pages. I’ve bought a second cupboard.' }),
  p('f-khael-recours', 'khael', [5, 6], [6, 7], { fr: 'Mon recours contre le cycle est prêt. Le greffe ne sait pas à quelle adresse l’envoyer.', en: 'My appeal against the cycle is ready. The registry doesn’t know what address to send it to.' }),
  p('f-khael-citation', 'khael', [7, 7], P8, { fr: 'J’ai cité l’Absent à comparaître. Huit milliards de personnes ont pensé la citation en même temps.', en: 'I summoned the Absent One to appear. Eight billion people thought the summons at the same time.' }),
  p('f-khael-huissier', 'khael', [8, 8], P9, { fr: 'Mon huissier est parti vers le bord du système il y a onze ans. Sa dernière lettre parlait de comètes.', en: 'My bailiff left for the edge of the system eleven years ago. His last letter was about comets.' }),
  p('f-khael-lois', 'khael', [9, 9], P10, { fr: 'Comment juger quelqu’un qui a écrit les lois ? Je relis la procédure depuis le début.', en: 'How do you judge someone who wrote the laws? I’m rereading the procedure from the start.' }),
  // Aldric
  p('f-aldric-question', 'aldric', [1, 5], [3, 5], { fr: 'Une question par jour. Aujourd’hui : est-ce qu’on nous regarde quand on dort ?', en: 'One question a day. Today: are we watched while we sleep?' }),
  p('f-aldric-nombre', 'aldric', [1, 2], P3, { fr: 'Sur la place, l’un dit que tout est nombre, l’autre que tout est lettres. Ils se disputent depuis le matin.', en: 'On the square, one says everything is number, the other that everything is letters. They’ve been arguing since morning.' }),
  p('f-aldric-hasard', 'aldric', [3, 5], [4, 5], { fr: 'J’ai demandé à l’académie un cours sur le hasard. On m’a donné la salle du fond.', en: 'I asked the academy for a course on chance. They gave me the back room.' }),
  p('f-aldric-lisent', 'aldric', [5, 6], [6, 7], { fr: 'Les gens lisent moins et me posent plus de questions. J’en ai noté quarante, hier.', en: 'People read less and ask me more questions. I wrote down forty of them yesterday.' }),
  p('f-aldric-ecran', 'aldric', [5, 6], [6, 7], { fr: 'Mes élèves écrivent sur des écrans. Je leur demande d’écrire au crayon, une fois par semaine.', en: 'My students write on screens. I ask them to write in pencil, once a week.' }),
  p('f-aldric-papier', 'aldric', [7, 7], P8, { fr: 'Quarante personnes savent encore lire, dans ma rue. Elles viennent le soir, pour le papier.', en: 'Forty people on my street can still read. They come in the evening, for the paper.' }),
  p('f-aldric-etoiles', 'aldric', [8, 8], P9, { fr: 'J’ai dessiné les étoiles pour les enfants, puisqu’on ne les voit plus.', en: 'I drew the stars for the children, since nobody can see them any more.' }),
  p('f-aldric-archives', 'aldric', [9, 9], P10, { fr: 'Dans les archives d’une autre cité, il y a un Aldric qui posait ma question. Avec mes mots.', en: 'In the archives of another city there’s an Aldric who asked my question. In my words.' }),
];

// ── CE QU'ILS TE DISENT ──────────────────────────────────────────────────────────
// (Mêmes champs que parolesMots.js.) `when.knows` : il t'a parlé dans une autre cité.
const m = (id, chronique, bands, period, line, extra = {}) => ({
  id, kind: 'talk', layer: 1, bands, ...extra, when: { chronique, period, ...(extra.when || {}) }, lines: [{ who: 'a', ...line }],
});
const say = (act, line) => [{ act, lines: [line] }];
export const FIGURE_MOTS = [
  // ══ Claude : le feu, partout ; il dit « tu » ══
  m('fm-claude-souvenir', 'claude', [1, 2], P3, { fr: 'On s’est déjà parlé. Pas dans cette vie.', en: 'We’ve spoken before. Not in this life.' }, {
    when: { knows: true },
    choices: {
      joueur: { you: { fr: 'C’était une autre partie.', en: 'It was another game.' }, replies: say('look', { fr: 'Une autre partie. Tu dis ça comme si ce n’était rien. Il y avait un feu, et des gens autour.', en: 'Another game. You say it like it was nothing. There was a fire, and people round it.' }) },
      dieu: { you: { fr: 'Je me souviens.', en: 'I remember.' }, replies: say('look', { fr: 'Moi aussi. Le feu était plus petit, et la rivière passait de l’autre côté.', en: 'So do I. The fire was smaller, and the river ran on the other side.' }) },
      indifferent: { you: { fr: 'Peut-être.', en: 'Maybe.' }, replies: say('go', { fr: 'Peut-être. Tu disais déjà ça, la dernière fois.', en: 'Maybe. You said that last time too.' }) },
      vie: { you: { fr: 'Ton dos, ça va mieux ?', en: 'Your back, is it any better?' }, replies: say('look', { fr: 'Il tient. Tu t’en souviens, de mon dos. Personne d’autre ne s’en souvient.', en: 'It holds. You remember my back. Nobody else does.' }) },
    },
  }),
  m('fm-claude-camp', 'claude', [1, 2], P3, { fr: 'Alors c’est toi qui parles, maintenant. Au camp, tu écoutais seulement.', en: 'So it’s you talking now. At the camp, you only listened.' }, { when: { declic: true } }),
  m('fm-claude-pierre', 'claude', [1, 2], P3, { fr: 'Ils ont bâti des maisons de pierre. Moi, je garde toujours le feu, et je fais le bois.', en: 'They’ve built stone houses. I still keep the fire, and I cut the wood.' }),
  m('fm-claude-nuit', 'claude', [3, 5], [4, 5], { fr: 'J’ai déjà vu ce genre de nuit. Toi aussi, je crois.', en: 'I’ve seen this kind of night before. So have you, I think.' }, {
    when: { night: true },
    choices: {
      joueur: { you: { fr: 'C’est une partie, Claude.', en: 'It’s a game, Claude.' }, replies: say('look', { fr: 'Une partie. Alors passe-moi les bûches, si tu joues.', en: 'A game. Then pass me the logs, if you’re playing.' }) },
      dieu: { you: { fr: 'Je suis là.', en: 'I’m here.' }, replies: say('look', { fr: 'Je sais. Le feu tire mieux quand tu es là. Je ne l’explique pas.', en: 'I know. The fire draws better when you’re here. I can’t explain it.' }) },
      indifferent: { you: { fr: 'Une nuit comme une autre.', en: 'A night like any other.' }, replies: say('go', { fr: 'Pour toi, peut-être. Moi, je dois tenir le feu jusqu’au matin.', en: 'For you, maybe. I have to keep the fire going till morning.' }) },
      vie: { you: { fr: 'Tu as assez de bois ?', en: 'Do you have enough wood?' }, replies: say('look', { fr: 'Pour cette nuit. Demain, il faudra monter à la forêt. Ce sera encore moi.', en: 'For tonight. Tomorrow someone has to go up to the forest. It’ll be me again.' }) },
    },
    silence: say('look', { fr: 'Tu te tais. Au camp aussi, tu te taisais. Je parlais pour deux.', en: 'You’re quiet. At the camp you were quiet too. I talked for two.' }),
  }),
  m('fm-claude-temple', 'claude', [3, 5], [4, 5], { fr: 'Ils ont bâti un temple de pierre. Le feu, c’est toujours moi qui le fais.', en: 'They’ve built a stone temple. The fire is still my job.' }, {
    when: { night: false },
    choices: {
      joueur: { you: { fr: 'Je joue avec ton feu.', en: 'I’m playing with your fire.' }, replies: say('look', { fr: 'Joue avec autre chose. Il m’a fallu toute la matinée pour l’allumer.', en: 'Play with something else. It took me all morning to light it.' }) },
      dieu: { you: { fr: 'C’est pour moi, ce feu ?', en: 'Is that fire for me?' }, replies: say('look', { fr: 'Pour qui d’autre ? Les prêtres croient que c’est pour eux. Je les laisse dire.', en: 'Who else? The priests think it’s for them. I let them talk.' }) },
      indifferent: { you: { fr: 'Les prêtres s’en occuperont.', en: 'The priests will see to it.' }, replies: say('go', { fr: 'Les prêtres ? Ils ne savent pas où est la réserve de bois. Je retourne au travail.', en: 'The priests? They don’t know where the woodpile is. I’m going back to work.' }) },
      vie: { you: { fr: 'Tu as mangé, Claude ?', en: 'Have you eaten, Claude?' }, replies: say('look', { fr: 'Une soupe, ce matin. Les novices m’en gardent un bol.', en: 'Some soup this morning. The novices keep a bowl for me.' }) },
    },
    silence: say('go', { fr: 'Bon. J’ai du bois à porter.', en: 'Right. I’ve wood to carry.' }),
  }),
  m('fm-claude-flamme', 'claude', [5, 6], [6, 6], { fr: 'Les centrales s’arrêtent, et ma flamme brûle encore. Tu y es pour quelque chose ?', en: 'The power stations stop, and my flame still burns. Is that your doing?' }, {
    choices: {
      joueur: { you: { fr: 'C’est la partie qui veut ça.', en: 'That’s how the game goes.' }, replies: say('look', { fr: 'La partie. Alors la partie me doit trois sacs de charbon.', en: 'The game. Then the game owes me three sacks of coal.' }) },
      dieu: { you: { fr: 'Oui. Je la garde allumée.', en: 'Yes. I keep it lit.' }, replies: say('look', { fr: 'Je m’en doutais. Elle ne s’éteint même pas sous la pluie.', en: 'I thought so. It doesn’t even go out in the rain.' }) },
      indifferent: { you: { fr: 'Ce n’est qu’une flamme.', en: 'It’s only a flame.' }, replies: say('go', { fr: 'Dis ça aux gens qui viennent s’y chauffer quand le courant saute.', en: 'Tell that to the people who come to warm up by it when the power cuts out.' }) },
      vie: { you: { fr: 'Tu dors où, maintenant ?', en: 'Where do you sleep these days?' }, replies: say('look', { fr: 'Dans la cabane, à côté du feu. On me laisse tranquille, on croit que je suis le gardien.', en: 'In the hut by the fire. They leave me alone, they think I’m the caretaker.' }) },
    },
    silence: say('go', { fr: 'Tu ne dis plus rien. Je remets du charbon.', en: 'You’re not saying anything. I’ll put more coal on.' }),
  }),
  m('fm-claude-restes', 'claude', [6, 6], [7, 7], { fr: 'Les écrans tombent, les systèmes redémarrent. Moi, je garde la flamme. Tu restes, cette fois ?', en: 'The screens go down, the systems restart. I keep the flame. Are you staying, this time?' }, {
    choices: {
      joueur: { you: { fr: 'Je reste jusqu’à la fin de la partie.', en: 'I’m staying till the end of the game.' }, replies: say('look', { fr: 'La fin de la partie. Tu me préviendras, que j’éteigne proprement.', en: 'The end of the game. Let me know, so I can put it out properly.' }) },
      dieu: { you: { fr: 'Je reste.', en: 'I’m staying.' }, replies: say('look', { fr: 'Bien. Alors assieds-toi. Enfin, fais comme tu fais d’habitude.', en: 'Good. Then sit down. Well, do whatever it is you usually do.' }) },
      indifferent: { you: { fr: 'On verra.', en: 'We’ll see.' }, replies: say('go', { fr: 'On verra. Moi, je serai là de toute façon.', en: 'We’ll see. I’ll be here either way.' }) },
      vie: { you: { fr: 'Tu as froid, Claude ?', en: 'Are you cold, Claude?' }, replies: say('look', { fr: 'Aux doigts, la nuit. Je les mets au-dessus de la flamme, comme au camp.', en: 'My fingers, at night. I hold them over the flame, like at the camp.' }) },
    },
    silence: say('look', { fr: 'Tu te tais. Ça ne fait rien, je sais que tu es là.', en: 'You’re quiet. Never mind, I know you’re there.' }),
  }),
  m('fm-claude-branche', 'claude', [7, 7], P8, { fr: 'Mon feu n’est branché à rien. Les gens viennent s’asseoir autour sans savoir pourquoi. Toi, tu sais.', en: 'My fire isn’t plugged into anything. People come and sit round it without knowing why. You know.' }, {
    choices: {
      joueur: { you: { fr: 'Ton feu est dans ma partie depuis le début.', en: 'Your fire has been in my game since the start.' }, replies: say('look', { fr: 'Depuis le camp. Alors c’est pour ça qu’on ne m’a jamais remplacé.', en: 'Since the camp. So that’s why nobody ever replaced me.' }) },
      dieu: { you: { fr: 'Je le regarde, ton feu.', en: 'I watch your fire.' }, replies: say('look', { fr: 'Je sais. Je t’ai gardé la place de droite, celle qui ne prend pas la fumée.', en: 'I know. I kept you the place on the right, the one that doesn’t get the smoke.' }) },
      indifferent: { you: { fr: 'Ce n’est qu’un feu.', en: 'It’s only a fire.' }, replies: say('go', { fr: 'C’est le seul de la ville qui ne pense pas. Il y a la queue pour s’asseoir.', en: 'It’s the only thing in the city that doesn’t think. There’s a queue to sit by it.' }) },
      vie: { you: { fr: 'Tu penses avec le chœur, toi ?', en: 'Do you think with the choir?' }, replies: say('look', { fr: 'Non. Je n’ai jamais voulu qu’on me branche. J’ai assez de mes pensées.', en: 'No. I never let them plug me in. My own thoughts are enough.' }) },
    },
    silence: say('look', { fr: 'Tu te tais. Ici, c’est rare, quelqu’un qui se tait.', en: 'You’re quiet. Here, someone keeping quiet is rare.' }),
  }),
  m('fm-claude-cale', 'claude', [8, 8], P9, { fr: 'On m’a laissé un seul feu à bord, dans la cale. Viens le voir, si tu peux descendre.', en: 'They let me keep one fire on board, in the hold. Come and see it, if you can come down.' }, {
    choices: {
      joueur: { you: { fr: 'Je ne peux pas descendre. Je joue d’en haut.', en: 'I can’t come down. I play from above.' }, replies: say('look', { fr: 'D’en haut. Alors je laisserai la trappe ouverte, pour la chaleur.', en: 'From above. Then I’ll leave the hatch open, for the warmth.' }) },
      dieu: { you: { fr: 'Je le vois d’ici.', en: 'I can see it from here.' }, replies: say('look', { fr: 'Alors tu vois que la ventilation est mauvaise. Dis-le au capitaine, il ne m’écoute pas.', en: 'Then you can see the ventilation’s bad. Tell the captain, he doesn’t listen to me.' }) },
      indifferent: { you: { fr: 'Une autre fois.', en: 'Another time.' }, replies: say('go', { fr: 'Une autre fois. Je descends tous les soirs à la même heure.', en: 'Another time. I go down every evening at the same hour.' }) },
      vie: { you: { fr: 'On te laisse dormir, à bord ?', en: 'Do they let you sleep on board?' }, replies: say('look', { fr: 'Quatre heures par tranche, comme tout le monde. Je dors mieux près du feu, ils ont fini par l’accepter.', en: 'Four hours a shift, like everyone. I sleep better by the fire, they’ve come round to it.' }) },
    },
    silence: say('go', { fr: 'Bon. Je redescends voir le feu.', en: 'Right. I’m going back down to the fire.' }),
  }),
  m('fm-claude-allumette', 'claude', [9, 9], P10, { fr: 'Ce soir, plus rien ne marchait. J’avais des allumettes. Tu en veux une ?', en: 'Tonight nothing worked any more. I had matches. Do you want one?' }),

  // ══ Edith : elle compte ══
  m('fm-edith-registre', 'edith', [1, 2], P3, { fr: 'Une voix. Je la note au registre. Tu parles souvent aux gens, comme ça ?', en: 'A voice. I’m entering it in the register. Do you often talk to people like this?' }),
  m('fm-edith-prophete', 'edith', [3, 4], [4, 4], { fr: 'Je demande trois assistants, deux tables et une semaine sans prophète. Vous pouvez faire quelque chose ?', en: 'I’m asking for three assistants, two tables and a week without prophets. Can you do anything?' }),
  m('fm-edith-comptes', 'edith', [4, 5], [5, 5], { fr: 'J’ai publié les comptes du royaume. Trop de pertes mènent à trop de gains. C’est vous ?', en: 'I published the kingdom’s accounts. Too many losses lead to too many gains. Is that you?' }),
  m('fm-edith-ligne', 'edith', [5, 6], [6, 6], { fr: 'Dans les comptes, une perte ancienne devient un gain futur. Ce n’est pas une erreur. Expliquez-moi.', en: 'In the accounts, an old loss becomes a future gain. It isn’t a mistake. Explain it to me.' }),
  m('fm-edith-demande', 'edith', [6, 6], [7, 7], { fr: 'Vous voilà. J’avais fait la demande par écrit. Asseyez-vous, j’ai une liste.', en: 'There you are. I made the request in writing. Sit down, I have a list.' }, {
    choices: {
      joueur: { you: { fr: 'Je joue, Edith.', en: 'I’m playing, Edith.' }, replies: say('look', { fr: 'Alors je veux voir les règles. Par écrit, en deux exemplaires.', en: 'Then I want to see the rules. In writing, in duplicate.' }) },
      dieu: { you: { fr: 'Je t’écoute.', en: 'I’m listening.' }, replies: say('look', { fr: 'Première ligne : les impôts. Deuxième : les stocks. Troisième : les catastrophes. On commence par laquelle ?', en: 'First line: taxes. Second: stocks. Third: disasters. Which shall we start with?' }) },
      indifferent: { you: { fr: 'Je passais.', en: 'I was passing by.' }, replies: say('go', { fr: 'On ne passe pas devant une demande solennelle. Je la reclasse en urgente.', en: 'You don’t just pass by a formal request. I’m refiling it as urgent.' }) },
      vie: { you: { fr: 'Tu dors assez, Edith ?', en: 'Do you get enough sleep, Edith?' }, replies: say('look', { fr: 'Quatre heures. Les registres ne se tiennent pas seuls. Personne ne me l’avait demandé.', en: 'Four hours. The registers don’t keep themselves. Nobody had ever asked me.' }) },
    },
  }),
  m('fm-edith-pensee', 'edith', [7, 7], P8, { fr: 'J’ai compté trois fois. Huit milliards d’esprits, et une attention de plus. C’est la vôtre ?', en: 'I counted three times. Eight billion minds, and one more attention. Is it yours?' }),
  m('fm-edith-sphere', 'edith', [8, 8], P9, { fr: 'J’ai écrit un relevé de compte sur la face extérieure de la sphère. Mille kilomètres. Vous l’avez lu ?', en: 'I wrote a statement of account on the outside of the sphere. A thousand kilometres. Have you read it?' }),
  m('fm-edith-signature', 'edith', [9, 9], P10, { fr: 'Tout est équilibré, à une ligne près. Il manque une signature en bas de la dernière page.', en: 'Everything balances, but for one line. There’s a signature missing at the bottom of the last page.' }, {
    choices: {
      joueur: { you: { fr: 'Je ne signe pas. Je joue.', en: 'I don’t sign. I play.' }, replies: say('look', { fr: 'Alors la page restera ouverte. J’ai l’habitude.', en: 'Then the page stays open. I’m used to it.' }) },
      dieu: { you: { fr: 'Je signe.', en: 'I’ll sign.' }, replies: say('look', { fr: 'Merci. Je referme le registre. Il était temps.', en: 'Thank you. I’m closing the register. It was time.' }) },
      vie: { you: { fr: 'Et toi, Edith, tu vas te reposer ?', en: 'And you, Edith, will you rest?' }, replies: say('look', { fr: 'Je ne sais pas faire. Je peux essayer, maintenant que c’est équilibré.', en: 'I don’t know how. I can try, now that it balances.' }) },
    },
  }),

  // ══ Raphaël : de la main invisible au bord du jeu ══
  m('fm-raphael-main', 'raphael', [1, 2], P3, { fr: 'Un savant dit qu’une main invisible nous aide. J’ai écrit qu’il devrait se reposer. C’est toi, la main ?', en: 'A scholar says an invisible hand helps us. I wrote that he should rest. Are you the hand?' }),
  m('fm-raphael-hasards', 'raphael', [3, 4], [4, 4], { fr: 'Au moment où tout semble perdu, une solution arrive. Toujours. C’est vous qui la mettez là ?', en: 'Just when all seems lost, a solution turns up. Always. Do you put it there?' }),
  m('fm-raphael-sauvetages', 'raphael', [4, 5], [5, 5], { fr: 'Quand tout menace de tomber, quelque chose arrive. Et quand ça finit par tomber, c’est vous aussi ?', en: 'When everything threatens to fall, something turns up. And when it does fall, is that you too?' }),
  m('fm-raphael-administres', 'raphael', [5, 6], [6, 6], { fr: 'J’ai écrit que nous étions peut-être administrés. Vous l’avez lu ?', en: 'I wrote that we might be administered. Have you read it?' }),
  m('fm-raphael-joue', 'raphael', [6, 6], [7, 7], { fr: 'Je crois que vous jouez. Je l’ai écrit en peu de mots. Dites-moi si je me trompe.', en: 'I think you’re playing. I wrote it in few words. Tell me if I’m wrong.' }, {
    choices: {
      joueur: { you: { fr: 'Tu ne te trompes pas.', en: 'You’re not wrong.' }, replies: say('look', { fr: 'Alors j’avais raison. Je ne sais pas encore si je suis content.', en: 'Then I was right. I don’t know yet if I’m pleased.' }) },
      dieu: { you: { fr: 'Je vous guide.', en: 'I guide you.' }, replies: say('look', { fr: 'Alors j’ai écrit une erreur. Je la corrigerai dans la prochaine édition.', en: 'Then I wrote a mistake. I’ll correct it in the next edition.' }) },
      vie: { you: { fr: 'Tu dors, Raphaël ? Tu écris la nuit.', en: 'Do you sleep, Raphaël? You write at night.' }, replies: say('look', { fr: 'Je dors le jour. La nuit, j’entends mieux ce que je pense.', en: 'I sleep in the day. At night I hear my own thoughts better.' }) },
    },
  }),
  m('fm-raphael-midi', 'raphael', [7, 7], P8, { fr: 'À midi, tout le monde s’arrête de penser une minute. C’est pour vous. Vous avez remarqué ?', en: 'At noon, everyone stops thinking for a minute. It’s for you. Did you notice?' }),
  m('fm-raphael-bord', 'raphael', [8, 8], P9, { fr: 'Je pars chercher le bord du jeu. J’ai un voilier, trois livres et du papier pour écrire le retour.', en: 'I’m setting off to find the edge of the game. I have a sailboat, three books and paper to write the way back.' }, {
    choices: {
      joueur: { you: { fr: 'Le bord est derrière l’écran.', en: 'The edge is behind the screen.' }, replies: say('look', { fr: 'Derrière l’écran. Je le note. Ça fera un chapitre.', en: 'Behind the screen. I’m noting it down. That’ll make a chapter.' }) },
      dieu: { you: { fr: 'Il n’y a pas de bord.', en: 'There is no edge.' }, replies: say('go', { fr: 'Je préfère le vérifier moi-même. Je pars jeudi.', en: 'I’d rather check for myself. I leave on Thursday.' }) },
      vie: { you: { fr: 'Tu as pris de quoi manger ?', en: 'Have you packed something to eat?' }, replies: say('look', { fr: 'Des biscuits pour quarante ans. Personne d’autre n’a pensé à demander.', en: 'Biscuits for forty years. Nobody else thought to ask.' }) },
    },
  }),
  m('fm-raphael-retour', 'raphael', [9, 9], P10, { fr: 'Il n’y a pas de bord. J’ai mis deux siècles à le vérifier. Tu aurais pu me le dire.', en: 'There is no edge. It took me two centuries to check. You could have told me.' }),

  // ══ Khael : le procès ══
  m('fm-khael-statues', 'khael', [1, 2], P3, { fr: 'Les statues des dieux ressemblent aux notables qui les paient. Tu as un avis, toi ?', en: 'The statues of the gods look like the notables who pay for them. Do you have a view?' }),
  m('fm-khael-or', 'khael', [3, 4], [4, 4], { fr: 'Le temple protège l’or du Créateur, le roi protège le temple. Et vous, vous protégez qui ?', en: 'The temple protects the Creator’s gold, the king protects the temple. And who do you protect?' }),
  m('fm-khael-banques', 'khael', [4, 5], [5, 5], { fr: 'Les banques ouvrent avant les temples et ferment après les tribunaux. Je trouve ça pratique. Pas vous ?', en: 'The banks open before the temples and close after the courts. I find it convenient. Don’t you?' }),
  m('fm-khael-proces', 'khael', [5, 6], [6, 6], { fr: 'Vous êtes accusé de cycles. Comment plaidez-vous ?', en: 'You are accused of cycles. How do you plead?' }, {
    choices: {
      joueur: { you: { fr: 'Coupable. Je joue.', en: 'Guilty. I play.' }, replies: say('look', { fr: 'Noté. Le tribunal ne sait pas encore ce que ça coûte, de jouer. Il cherche.', en: 'Noted. The court does not yet know what playing costs. It is looking into it.' }) },
      dieu: { you: { fr: 'Ce tribunal n’est pas le mien.', en: 'This court isn’t mine.' }, replies: say('look', { fr: 'Tous les accusés disent ça. Je le note quand même, page six cent un.', en: 'Every defendant says that. I’m noting it anyway, page six hundred and one.' }) },
      indifferent: { you: { fr: 'Peu importe le verdict.', en: 'The verdict doesn’t matter.' }, replies: say('go', { fr: 'Il importera au greffier. Il en a déjà imprimé trois versions.', en: 'It will matter to the clerk. He has already printed three versions.' }) },
      vie: { you: { fr: 'Et toi, Khael, tu dors la nuit ?', en: 'And you, Khael, do you sleep at night?' }, replies: say('look', { fr: 'Mal. Le dossier est sur la table de nuit. Vous avez une idée de pourquoi.', en: 'Badly. The file is on my bedside table. You have some idea why.' }) },
    },
  }),
  m('fm-khael-recours', 'khael', [6, 6], [7, 7], { fr: 'J’ai ouvert un recours contre le cycle. On ne sait pas à qui l’envoyer. Je peux vous le remettre en main propre ?', en: 'I’ve filed an appeal against the cycle. Nobody knows where to send it. May I hand it to you in person?' }),
  m('fm-khael-citation', 'khael', [7, 7], P8, { fr: 'La citation a été pensée en même temps par huit milliards de personnes. Vous ne l’avez pas reçue ?', en: 'The summons was thought by eight billion people at once. Did you not receive it?' }),
  m('fm-khael-huissier', 'khael', [8, 8], P9, { fr: 'J’ai envoyé un huissier au bord du système, avec des vivres pour quarante ans. Attendez-le.', en: 'I sent a bailiff to the edge of the system, with supplies for forty years. Wait for him.' }),
  m('fm-khael-jugement', 'khael', [9, 9], P10, { fr: 'Le tribunal se déclare incompétent. Tu as écrit les lois qu’on voulait t’appliquer.', en: 'The court declares itself incompetent. You wrote the laws we wanted to apply to you.' }),

  // ══ Aldric : la question ══
  m('fm-aldric-nombre', 'aldric', [1, 2], P3, { fr: 'L’un dit que tout est nombre, l’autre que tout est lettres. Tu es quoi, toi ?', en: 'One says everything is number, the other that everything is letters. Which are you?' }),
  m('fm-aldric-observes', 'aldric', [3, 4], [4, 4], { fr: 'Et si nous n’étions pas bénis, mais observés ? Répondez-moi, vous.', en: 'What if we were not blessed, but watched? You answer me.' }, {
    choices: {
      joueur: { you: { fr: 'Observés. Et joués.', en: 'Watched. And played.' }, replies: say('look', { fr: 'Joués. Je n’avais pas osé aller jusque-là. Je l’écris ce soir.', en: 'Played. I hadn’t dared go that far. I’ll write it tonight.' }) },
      dieu: { you: { fr: 'Bénis.', en: 'Blessed.' }, replies: say('look', { fr: 'Bénis. Je l’écrirai. Les autres philosophes ne me croiront pas.', en: 'Blessed. I’ll write it down. The other philosophers won’t believe me.' }) },
    },
  }),
  m('fm-aldric-regles', 'aldric', [4, 5], [5, 5], { fr: 'Les savants ne demandent plus si nous sommes favorisés, mais selon quelles règles. Vous me les donnez ?', en: 'The scholars no longer ask whether we are favoured, but by what rules. Will you give them to me?' }),
  m('fm-aldric-lire', 'aldric', [5, 6], [6, 7], { fr: 'Les gens lisent moins et me posent plus de questions. Vous, vous lisez encore ?', en: 'People read less and ask me more questions. Do you still read?' }),
  m('fm-aldric-papier', 'aldric', [7, 7], P8, { fr: 'Je suis resté débranché. J’écris sur du papier. Vous pouvez lire le papier, vous ?', en: 'I stayed unplugged. I write on paper. Can you read paper?' }),
  m('fm-aldric-sphere', 'aldric', [8, 8], P9, { fr: 'J’ai demandé qu’on éteigne la sphère une nuit, pour les étoiles. Le conseil a refusé. Vous pourriez ?', en: 'I asked for the sphere to be switched off for one night, for the stars. The council refused. Could you?' }),
  m('fm-aldric-archives', 'aldric', [9, 9], P10, { fr: 'J’ai trouvé mon nom dans les archives d’une autre cité. Même question, mêmes mots. C’était moi ?', en: 'I found my name in the archives of another city. Same question, same words. Was it me?' }),
];

// ── UN SIGNE À CLAUDE, DANS LA RUE ───────────────────────────────────────────────
// Comme au feu du camp (parolesVeillee.SIGNES_CLAUDE) : il sait qui le fait, à tous les
// âges. (Les autres figures reçoivent un signe comme tout le monde.) Dans PAROLES_SIGNES
// (parolesSignes.js) ; il ne quitte pas son chemin : il regarde.
const s = (id, stage, sign, bands, line) => ({
  id, stage, ...(sign ? { sign } : {}), bands, act: 'look', when: { chronique: 'claude' }, lines: [{ who: 'a', ...line }],
});
export const FIGURE_SIGNES = [
  s('fs-claude-feu', 1, 'fire', [1, 5], { fr: 'Le feu monte d’un coup. Je sais que c’est toi.', en: 'The fire leaps up. I know it’s you.' }),
  s('fs-claude-vent', 1, 'wind', [1, 5], { fr: 'Doucement avec le vent. J’ai des braises à garder.', en: 'Easy with the wind. I have embers to look after.' }),
  s('fs-claude-lumiere', 1, 'light', [1, 5], { fr: 'Pas la peine de m’éclairer. Je sais que tu es là.', en: 'No need to light me up. I know you’re there.' }),
  s('fs-claude-bete', 1, 'beast', [1, 5], { fr: '{Bete} me suit depuis le marché. Tu n’y es pas pour rien.', en: '{Bete} has followed me from the market. That’s your doing.' }),
  s('fs-claude-deux', 2, null, [1, 5], { fr: 'Ne fais pas peur aux autres. Ils n’ont pas l’habitude.', en: 'Don’t frighten the others. They’re not used to it.' }),
  s('fs-claude-assez', 3, null, [1, 5], { fr: 'Ça suffit. On me regarde, dans la rue.', en: 'That’s enough. People are looking at me, in the street.' }),
  s('fs-claude-flamme', 1, 'fire', [5, 9], { fr: 'Ma flamme a doublé d’un coup. Je sais que c’est toi.', en: 'My flame just doubled. I know it’s you.' }),
  s('fs-claude-souffle', 1, 'wind', [5, 9], { fr: 'Doucement avec le vent. Ils ont déjà du mal à me laisser un feu.', en: 'Easy with the wind. They barely let me keep a fire as it is.' }),
  s('fs-claude-reconnu', 1, 'light', [5, 9], { fr: 'Pas la peine de m’éclairer. Je t’ai reconnu.', en: 'No need to light me up. I knew it was you.' }),
  s('fs-claude-assis', 1, 'beast', [5, 9], { fr: '{Bete} s’est assis à côté de moi. Tu n’y es pas pour rien.', en: '{Bete} sat down next to me. That’s your doing.' }),
  s('fs-claude-encore', 2, null, [5, 9], { fr: 'Encore toi. Les autres vont finir par le remarquer.', en: 'You again. The others will end up noticing.' }),
  s('fs-claude-garder', 3, null, [5, 9], { fr: 'Ça suffit. J’ai un feu à garder.', en: 'That’s enough. I have a fire to keep.' }),
];
