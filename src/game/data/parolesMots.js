"use strict";

// LES MOTS (docs/PLAN-ECOUTER-PARLER.md, lot 6) — ÉCHANTILLON, à juger avant d'écrire le reste.
//
// Dès la période 3 de la gazette (§ 7.2), le joueur peut PARLER à un passant. Dans la fiche
// (§ 7.3) : le passant entend une voix et le dit (`lines`), puis deux ou trois réponses
// courtes du joueur (`choices`), puis ce qu'il répond (`replies`) et ce qu'il FAIT (`act`,
// les gestes du lot 4 bis). Se taire est une réponse aussi (`silence`), et c'est elle qui
// vient quand le joueur ne dit rien.
//
// Une entrée : { id, kind: 'talk', layer, bands, when, lines, choices, silence }.
//   when      les conditions de paroles.js (period, article, trait, child, declic…)
//   lines     ce qu'il dit en entendant la voix (qui parle : 'a', lui)
//   choices   [{ key, tone, you, replies }] : `you` ce que dit le joueur ({ fr, en }, ou
//             { m, f, en } accordé à celui à qui il parle) ; `tone` sa manière, que la
//             cité retient (core/parolesState.js, TALK_TONES) : 'vrai' (il répond
//             franchement), 'doux' (il rassure), 'ordre' (il demande), 'secret' (il
//             esquive), et 'muet' quand il se tait ; `belief` ce que la réponse dit de lui,
//             quand elle en dit quelque chose ('guide', 'test', 'wait' ; 'joue', 'joue-pas')
//   replies   [{ when, act, lines }] : la première qui convient (son caractère d'abord,
//             puis celle de tous, sans `when`) et dont il peut faire le geste
//   silence   les réponses quand le joueur se tait
// Le tutoiement suit le lien (§ 7.3) : « tu » au coin du feu (P3), « vous » quand le joueur
// devient une institution (P4 à P9), « tu » de nouveau au Démiurge (P10), entre égaux. Le
// joueur, lui, dit « tu ». La plume de paroles.js : du concret, ni maxime ni bon mot de fin.
// Ni tiret, ni « ! », ni points de suspension ; l'apostrophe typographique.

export const PAROLES_MOTS = [
  // ══ P3 : « une main invisible » ; une voix, pour la première fois ══════════════════
  { id: 'm3-qui', kind: 'talk', layer: 1, bands: [1, 2], when: { period: [3, 3] },
    lines: [{ who: 'a', fr: 'Qui a parlé ? Il n’y a personne.', en: 'Who said that? There’s nobody here.' }],
    choices: [
      { key: 'moi', tone: 'vrai', you: { fr: 'Moi.', en: 'Me.' }, replies: [
        { when: { trait: 'pious' }, act: 'kneel', lines: [{ fr: 'Une voix d’en haut. Je me mets à genoux, on verra après.', en: 'A voice from above. I’m getting down on my knees, and we’ll see.' }] },
        { when: { trait: 'superstitious' }, act: 'flee', lines: [{ fr: 'Ma grand-mère disait de ne jamais répondre aux voix. Je rentre, vite.', en: 'My grandmother said never to answer voices. I’m going home, fast.' }] },
        { when: { trait: 'curious' }, act: 'search', lines: [{ fr: 'Moi qui ? Où ça ? Parle encore, que je trouve d’où ça vient.', en: 'Me who? Where? Say it again so I can find where it’s coming from.' }] },
        { act: 'search', lines: [{ fr: 'Moi qui ? Je ne vois que la rue.', en: 'Me who? All I can see is the street.' }] },
      ] },
      { key: 'peur', tone: 'doux', you: { fr: 'N’aie pas peur.', en: 'Don’t be afraid.' }, replies: [
        { when: { trait: 'grumpy' }, act: 'go', lines: [{ fr: 'Peur de quoi ? J’ai du travail, moi.', en: 'Afraid of what? I’ve got work to do.' }] },
        { when: { child: true }, act: 'parent', lines: [{ fr: 'Je n’ai pas peur. Je vais quand même le dire à maman.', en: 'I’m not scared. I’m telling Mum anyway.' }] },
        { act: 'look', lines: [{ fr: 'Je n’ai pas peur. J’ai les mains qui tremblent, c’est tout.', en: 'I’m not afraid. My hands are shaking, that’s all.' }] },
      ] },
    ],
    silence: [
      { act: 'go', lines: [{ fr: 'J’ai dû rêver. Je dors mal depuis la dernière lune.', en: 'I must have dreamt it. I haven’t slept well since the last moon.' }] },
    ] },

  { id: 'm3-claude', kind: 'talk', layer: 1, bands: [1, 2], when: { period: [3, 3], declic: true }, adult: true,
    lines: [{ who: 'a', fr: 'C’est toi que Claude entend, la nuit, au feu ?', en: 'Are you the one Claude hears at night, by the fire?' }],
    choices: [
      { key: 'oui', tone: 'vrai', you: { fr: 'Oui.', en: 'Yes.' }, replies: [
        { act: 'go', lines: [{ fr: 'Alors il n’est pas fou. Je lui porterai du bois ce soir.', en: 'Then he isn’t mad. I’ll take him some wood tonight.' }] },
      ] },
      { key: 'secret', tone: 'ordre', you: { fr: 'Ne le dis à personne.', en: 'Don’t tell anyone.' }, replies: [
        { when: { trait: 'chatty' }, act: 'look', lines: [{ fr: 'Je vais essayer. Ce n’est pas facile, pour moi.', en: 'I’ll try. It isn’t easy, for me.' }] },
        { act: 'go', lines: [{ fr: 'Je ne dirai rien. Même pas à Claude.', en: 'I won’t say a word. Not even to Claude.' }] },
      ] },
    ],
    silence: [
      { act: 'look', lines: [{ fr: 'Tu ne réponds pas. Claude dit que tu ne réponds jamais.', en: 'You don’t answer. Claude says you never answer.' }] },
    ] },

  { id: 'm3-cache', kind: 'talk', layer: 1, bands: [2, 2], when: { period: [3, 3], child: true },
    lines: [{ who: 'a', fr: 'Tu es où ? Tu es caché derrière le puits ?', en: 'Where are you? Are you hiding behind the well?' }],
    choices: [
      { key: 'haut', tone: 'vrai', you: { fr: 'En haut.', en: 'Up here.' }, replies: [
        { act: 'search', lines: [{ fr: 'Sur le toit ? Je ne vois que des pigeons.', en: 'On the roof? I can only see pigeons.' }] },
      ] },
      { key: 'mere', tone: 'ordre', you: { fr: 'Va retrouver ta mère.', en: 'Go and find your mother.' }, replies: [
        { act: 'parent', lines: [{ fr: 'Maman est au lavoir. J’y vais en courant.', en: 'Mum’s at the washing place. I’m running there.' }] },
        { act: 'home', lines: [{ fr: 'Maman m’appelle tout le temps, de toute façon. Je rentre.', en: 'Mum calls me all the time anyway. I’m going home.' }] },
      ] },
    ],
    silence: [
      { act: 'search', lines: [{ fr: 'Tu joues à te cacher. Je compte jusqu’à dix.', en: 'You’re playing hide-and-seek. I’m counting to ten.' }] },
    ] },

  // ══ P4 : le Créateur, Celui qui nous guide, Celui qui regarde ; on dit « vous » ══════
  { id: 'm4-seigneur', kind: 'talk', layer: 1, bands: [3, 4], when: { period: [4, 4] },
    lines: [{ who: 'a', fr: 'Seigneur ? C’est vous ?', en: 'Lord? Is it you?' }],
    choices: [
      { key: 'oui', tone: 'vrai', you: { fr: 'Oui.', en: 'Yes.' }, replies: [
        { when: { trait: 'pious' }, act: 'kneel', lines: [{ fr: 'Je savais que vous viendriez. Je me mets à genoux, là, sur les pavés.', en: 'I knew you would come. I’m kneeling, right here on the cobbles.' }] },
        { when: { trait: 'grumpy' }, act: 'look', lines: [{ fr: 'Alors vous existez. Il faudra m’expliquer les impôts.', en: 'So you exist. You’ll have to explain the taxes to me.' }] },
        { act: 'look', lines: [{ fr: 'Vous parlez comme tout le monde. Je croyais que ce serait plus fort.', en: 'You talk like anyone else. I thought it would be louder.' }] },
      ] },
      { key: 'pas-seigneur', tone: 'vrai', you: { fr: 'Je ne suis pas un seigneur.', en: 'I’m not a lord.' }, replies: [
        { act: 'search', lines: [{ fr: 'Alors qui êtes-vous ? Au temple, ils ne parlent que du Seigneur.', en: 'Then who are you? At the temple they only ever talk about the Lord.' }] },
      ] },
    ],
    silence: [
      { act: 'home', lines: [{ fr: 'J’ai trop jeûné cette semaine. Je rentre manger.', en: 'I’ve fasted too much this week. I’m going home to eat.' }] },
    ] },

  // ══ P5 : le schisme, il nous guide, il nous teste, il attend ═══════════════════════
  { id: 'm5-lequel', kind: 'talk', layer: 1, bands: [4, 5], when: { period: [5, 5], article: ['p5_tension_cult_split'] }, adult: true,
    lines: [{ who: 'a', fr: 'Le prêtre dit que vous nous guidez, mon frère que vous nous testez. Lequel des deux ?', en: 'The priest says you guide us, my brother says you’re testing us. Which is it?' }],
    choices: [
      { key: 'guide', tone: 'vrai', belief: 'guide', you: { fr: 'Je vous guide.', en: 'I guide you.' }, replies: [
        { act: 'go', lines: [{ fr: 'Alors le prêtre avait raison. Mon frère ne va pas aimer ça.', en: 'So the priest was right. My brother won’t like that.' }] },
      ] },
      { key: 'test', tone: 'vrai', belief: 'test', you: { fr: 'Je vous teste.', en: 'I’m testing you.' }, replies: [
        { when: { trait: 'pious' }, act: 'pray', lines: [{ fr: 'Alors il faut tenir. Je vais au temple, tout de suite.', en: 'Then we have to hold on. I’m going to the temple, right now.' }] },
        { act: 'look', lines: [{ fr: 'Depuis le début ? Même l’hiver où le grenier a brûlé ?', en: 'From the start? Even the winter the granary burned?' }] },
      ] },
      { key: 'attends', tone: 'secret', belief: 'wait', you: { fr: 'J’attends.', en: 'I’m waiting.' }, replies: [
        { act: 'search', lines: [{ fr: 'Vous attendez quoi ? Dites-le, qu’on s’y mette.', en: 'Waiting for what? Tell us, and we’ll get on with it.' }] },
      ] },
    ],
    silence: [
      { act: 'go', lines: [{ fr: 'Vous ne répondez pas. Mon frère dira que c’est un test.', en: 'You don’t answer. My brother will say it’s a test.' }] },
    ] },

  // ══ P6 : le procès de Khael ═════════════════════════════════════════════════════════
  { id: 'm6-proces', kind: 'talk', layer: 1, bands: [5, 6], when: { period: [6, 6], article: ['p6_gold_khael'] }, adult: true,
    lines: [{ who: 'a', fr: 'Au tribunal, Khael dit que vous ne viendrez jamais vous défendre. Vous avez entendu ?', en: 'At the court, Khael says you’ll never come to defend yourself. Did you hear?' }],
    choices: [
      { key: 'entendu', tone: 'vrai', you: { fr: 'J’ai entendu.', en: 'I heard.' }, replies: [
        { act: 'look', lines: [{ fr: 'Alors venez. La séance est jeudi, à neuf heures, salle trois.', en: 'Then come. The hearing is Thursday at nine, courtroom three.' }] },
      ] },
      { key: 'raison', tone: 'vrai', you: { fr: 'Khael a raison.', en: 'Khael is right.' }, replies: [
        { act: 'go', lines: [{ fr: 'Je vais le lui dire. Il va être insupportable toute la semaine.', en: 'I’ll tell him. He’ll be unbearable all week.' }] },
      ] },
    ],
    silence: [
      { act: 'go', lines: [{ fr: 'Vous ne dites rien. Je le noterai pour Khael, il tient un registre.', en: 'You say nothing. I’ll note it for Khael, he keeps a register.' }] },
    ] },

  // ══ P7 : « Je crois qu'il joue » ═════════════════════════════════════════════════════
  { id: 'm7-joue', kind: 'talk', layer: 1, bands: [6, 6], when: { period: [7, 7], article: ['p7_know_raphael'] }, adult: true,
    lines: [{ who: 'a', fr: 'Raphaël écrit que vous jouez. C’est vrai ?', en: 'Raphaël writes that you’re playing. Is it true?' }],
    choices: [
      { key: 'oui', tone: 'vrai', belief: 'joue', you: { fr: 'Oui.', en: 'Yes.' }, replies: [
        { when: { trait: 'grumpy' }, act: 'go', lines: [{ fr: 'Super. Moi, je fais dix heures par jour au guichet.', en: 'Great. I do ten hours a day at the counter.' }] },
        { act: 'look', lines: [{ fr: 'Et nous, on est quoi ? Les pions ? Je préfère ne pas le savoir.', en: 'And what are we? The pieces? I’d rather not know.' }] },
      ] },
      { key: 'non', tone: 'doux', belief: 'joue-pas', you: { fr: 'Non.', en: 'No.' }, replies: [
        { act: 'go', lines: [{ fr: 'Je préfère ça. Je vais le dire à Raphaël, il me doit un café.', en: 'I’d rather that. I’ll tell Raphaël, he owes me a coffee.' }] },
      ] },
      { key: 'seulement', tone: 'secret', you: { fr: 'Pas seulement.', en: 'Not only.' }, replies: [
        { act: 'search', lines: [{ fr: 'Pas seulement ? Ça veut dire quoi, pas seulement ?', en: 'Not only? What does that mean, not only?' }] },
      ] },
    ],
    silence: [
      { act: 'go', lines: [{ fr: 'Vous ne répondez pas. Raphaël va encore en écrire trois pages.', en: 'You don’t answer. Raphaël will write three more pages about it.' }] },
    ] },

  // ══ P8 : l'Absent ═══════════════════════════════════════════════════════════════════
  { id: 'm8-pensee', kind: 'talk', layer: 1, bands: [7, 7], when: { period: [8, 8], article: ['p8_tension_absent'] },
    lines: [{ who: 'a', fr: 'Au chœur, il manque une pensée. Edith dit que c’est la vôtre.', en: 'There’s a thought missing in the choir. Edith says it’s yours.' }],
    choices: [
      { key: 'mienne', tone: 'vrai', you: { fr: 'C’est la mienne.', en: 'It’s mine.' }, replies: [
        { act: 'look', lines: [{ fr: 'Alors pensez avec nous, ce soir. On commence à neuf heures, sur le toit du jardin.', en: 'Then think with us tonight. We start at nine, on the garden roof.' }] },
      ] },
      { key: 'ecouter', tone: 'doux', you: { fr: 'Je préfère écouter.', en: 'I’d rather listen.' }, replies: [
        { act: 'go', lines: [{ fr: 'Comme vous voudrez. Je garderai une place libre, au cas où.', en: 'As you like. I’ll keep a place free, just in case.' }] },
      ] },
    ],
    silence: [
      { act: 'go', lines: [{ fr: 'Toujours rien. Edith va encore recompter.', en: 'Still nothing. Edith will count again.' }] },
    ] },

  // ══ P9 : le Joueur ══════════════════════════════════════════════════════════════════
  { id: 'm9-nom', kind: 'talk', layer: 1, bands: [8, 8], when: { period: [9, 9], article: ['p9_tension_joueur'] },
    lines: [{ who: 'a', fr: 'Le conseil vous appelle le Joueur, maintenant. Ça vous va ?', en: 'The council calls you the Player now. Does that suit you?' }],
    choices: [
      { key: 'va', tone: 'vrai', you: { fr: 'Ça me va.', en: 'It suits me.' }, replies: [
        { act: 'look', lines: [{ fr: 'Tant mieux. On l’a déjà gravé sur la coque de la navette.', en: 'Good. We’ve already engraved it on the shuttle’s hull.' }] },
      ] },
      { key: 'sans-nom', tone: 'secret', you: { fr: 'Je n’ai pas de nom.', en: 'I have no name.' }, replies: [
        { act: 'search', lines: [{ fr: 'Tout le monde a un nom. Même la sonde qu’on a perdue en a un.', en: 'Everyone has a name. Even the probe we lost has one.' }] },
      ] },
    ],
    silence: [
      { act: 'go', lines: [{ fr: 'Je dirai au conseil que vous n’avez pas dit non.', en: 'I’ll tell the council you didn’t say no.' }] },
    ] },

  // ══ P10 : Celui qui recommence ; on se dit « tu », entre égaux ══════════════════════
  { id: 'm10-souvenir', kind: 'talk', layer: 1, bands: [9, 9], when: { period: [10, 10] },
    lines: [{ who: 'a', fr: 'Tu recommences tout, chaque fois. Tu te souviens de nous, après ?', en: 'You start everything over, every time. Do you remember us, afterwards?' }],
    choices: [
      { key: 'oui', tone: 'vrai', you: { fr: 'Oui.', en: 'Yes.' }, replies: [
        { act: 'look', lines: [{ fr: 'Alors souviens-toi de moi. Je m’appelle {a}.', en: 'Then remember me. My name is {a}.' }] },
      ] },
      { key: 'pas-tout', tone: 'vrai', you: { fr: 'Pas de tout.', en: 'Not all of it.' }, replies: [
        { act: 'look', lines: [{ fr: 'Alors garde le jardin de ma mère, si tu peux. Le reste, tant pis.', en: 'Then keep my mother’s garden, if you can. Never mind the rest.' }] },
      ] },
    ],
    silence: [
      { act: 'go', lines: [{ fr: 'Tu ne réponds pas. Je vais l’écrire quelque part, au cas où.', en: 'You don’t answer. I’ll write it down somewhere, just in case.' }] },
    ] },
];
