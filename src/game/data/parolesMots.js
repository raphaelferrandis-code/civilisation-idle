"use strict";

// LES MOTS (docs/PLAN-ECOUTER-PARLER.md, lot 6).
//
// Dès la période 3 de la gazette (§ 7.2), le joueur peut PARLER à un passant. Dans la fiche
// (§ 7.3) : le passant entend une voix et le dit (`lines`), puis QUATRE réponses du joueur,
// une par orientation (Raph, 2026-10-08 : « 4 choix de réponses orientés soit joueur soit
// dieux soit indifférent soit intéressé par la vie du pnj »), et « Se taire » ; puis ce
// qu'il répond et ce qu'il FAIT (les gestes du lot 4 bis).
//   joueur       il dit qu'il joue (« Je joue. », « J'ai cliqué sur toi. ») ; chaque âge
//                l'entend avec ses mots : les osselets, les dés, le loto, l'écran
//   dieu         il parle en dieu (« Je veille sur vous. », « C'est moi qui ai bâti tout
//                ça. ») : c'est vrai, il a tout bâti
//   indifferent  il ne s'en soucie pas (« Peu importe. », « Je passais. »)
//   vie          il demande des nouvelles de SA vie : ses enfants et son conjoint par leurs
//                prénoms, son travail, sa journée (tiré de la fiche)
// Se taire est une réponse aussi (`silence`) ; c'est elle qui vient quand on ne dit rien.
//
// PAROLES_MOTS : ce qu'il dit en entendant la voix. { id, kind: 'talk', layer, bands, when,
//   lines, choices?, silence? }. `choices` { joueur?, dieu?, indifferent?, vie? } : les
//   réponses propres à CET échange, quand sa question en appelle une (« Lequel des
//   deux ? ») ; les autres viennent du répertoire de chaque voix (VOIX). Chacune :
//   { you, belief?, replies } ; `belief` dit ce que la réponse affirme de lui ('guide',
//   'test', 'wait' ; 'joue', 'joue-pas').
// VOIX : le répertoire de chaque voix, { joueur, dieu, indifferent, vie } : des réponses
//   { key, when?, you, replies }, et `silence` (ses répliques quand on se tait).
// Une réplique : { when?, bands?, act, lines } ; la première qui convient (son caractère
//   d'abord, l'enfant, puis celle de tous) et dont il peut faire le geste.
// Le tutoiement suit le lien (§ 7.3) : « tu » au coin du feu (P3) et au Démiurge (P10),
// « vous » entre les deux ; l'enfant dit toujours « tu ». Le joueur, lui, dit « tu ».
// La plume de paroles.js : du concret, ni maxime ni bon mot de fin. Ni tiret, ni « ! », ni
// points de suspension ; l'apostrophe typographique.

export const TALK_ORIENTATIONS = ['joueur', 'dieu', 'indifferent', 'vie'];

const P3 = [3, 3], P4 = [4, 4], P5 = [5, 5], P6 = [6, 6], P7 = [7, 7], P8 = [8, 8], P9 = [9, 9], P10 = [10, 10];
const VOUS = [4, 9];   // les périodes où l'on dit « vous » au joueur

export const PAROLES_MOTS = [
  // ══ P3 : « une main invisible » ; une voix, pour la première fois ; on dit « tu » ═════
  { id: 'm3-qui', kind: 'talk', layer: 1, bands: [1, 2], when: { period: P3 },
    lines: [{ who: 'a', fr: 'Qui a parlé ? Il n’y a personne.', en: 'Who said that? There’s nobody here.' }],
    silence: [{ act: 'go', lines: [{ fr: 'J’ai dû rêver. Je dors mal depuis la dernière lune.', en: 'I must have dreamt it. I haven’t slept well since the last moon.' }] }] },
  { id: 'm3-voisin', kind: 'talk', layer: 1, bands: [2, 2], when: { period: P3, child: false },
    lines: [{ who: 'a', fr: 'Si c’est encore toi, {voisin}, ce n’est pas drôle.', en: 'If that’s you again, {voisin}, it isn’t funny.' }] },
  { id: 'm3-nuit', kind: 'talk', layer: 1, bands: [1, 2], when: { period: P3, night: true, child: false },
    lines: [{ who: 'a', fr: 'Il y a quelqu’un ? Pas si fort, tu vas réveiller les petits.', en: 'Is someone there? Not so loud, you’ll wake the little ones.' }] },
  { id: 'm3-prie', kind: 'talk', layer: 1, bands: [1, 2], when: { period: P3, trait: 'pious' },
    lines: [{ who: 'a', fr: 'C’est toi ? C’est toi que je prie, le soir ?', en: 'Is it you? Are you the one I pray to at night?' }] },
  { id: 'm3-rien-fait', kind: 'talk', layer: 1, bands: [1, 2], when: { period: P3, trait: 'superstitious' },
    lines: [{ who: 'a', fr: 'Je n’ai rien fait. Je n’ai rien pris.', en: 'I didn’t do anything. I didn’t take anything.' }] },
  { id: 'm3-encore', kind: 'talk', layer: 1, bands: [1, 2], when: { period: P3, trait: 'curious' },
    lines: [{ who: 'a', fr: 'Encore. Parle encore, je n’ai pas bien entendu d’où ça venait.', en: 'Again. Say it again, I didn’t catch where it came from.' }] },
  { id: 'm3-claude', kind: 'talk', layer: 1, bands: [1, 2], when: { period: P3, declic: true, child: false },
    lines: [{ who: 'a', fr: 'C’est toi que Claude entend, la nuit, au feu ?', en: 'Are you the one Claude hears at night, by the fire?' }],
    choices: {
      dieu: { you: { fr: 'Oui. C’est moi.', en: 'Yes. It’s me.' }, replies: [
        { act: 'go', lines: [{ fr: 'Alors il n’est pas fou. Je lui porterai du bois ce soir.', en: 'Then he isn’t mad. I’ll take him some wood tonight.' }] },
      ] },
    } },
  { id: 'm3-cache', kind: 'talk', layer: 1, bands: [1, 2], when: { period: P3, child: true },
    lines: [{ who: 'a', fr: 'Tu es où ? Tu es caché derrière le mur ?', en: 'Where are you? Are you hiding behind the wall?' }],
    choices: {
      dieu: { you: { fr: 'En haut.', en: 'Up here.' }, replies: [
        { act: 'search', lines: [{ fr: 'Sur le toit ? Je ne vois que des pigeons.', en: 'On the roof? I can only see pigeons.' }] },
      ] },
    },
    silence: [{ act: 'search', lines: [{ fr: 'Tu joues à te cacher. Je compte jusqu’à dix.', en: 'You’re playing hide-and-seek. I’m counting to ten.' }] }] },

  // ══ P4 : le Créateur, Celui qui nous guide, Celui qui regarde ; on dit « vous » ══════
  { id: 'm4-seigneur', kind: 'talk', layer: 1, bands: [3, 4], when: { period: P4, child: false },
    lines: [{ who: 'a', fr: 'Seigneur ? C’est vous ?', en: 'Lord? Is it you?' }],
    choices: {
      dieu: { you: { fr: 'Oui.', en: 'Yes.' }, replies: [
        { when: { trait: 'pious' }, act: 'kneel', lines: [{ fr: 'Je savais que vous viendriez. Je me mets à genoux, là, sur les pavés.', en: 'I knew you would come. I’m kneeling, right here on the cobbles.' }] },
        { when: { trait: 'grumpy' }, act: 'look', lines: [{ fr: 'Alors vous existez. Il faudra m’expliquer les impôts.', en: 'So you exist. You’ll have to explain the taxes to me.' }] },
        { act: 'look', lines: [{ fr: 'Vous parlez comme tout le monde. Je croyais que ce serait plus fort.', en: 'You talk like anyone else. I thought it would be louder.' }] },
      ] },
    },
    silence: [{ act: 'home', lines: [{ fr: 'J’ai trop jeûné cette semaine. Je rentre manger.', en: 'I’ve fasted too much this week. I’m going home to eat.' }] }] },
  { id: 'm4-impot', kind: 'talk', layer: 1, bands: [3, 4], when: { period: P4, child: false, trait: 'grumpy' },
    lines: [{ who: 'a', fr: 'Si vous êtes du conseil, je paierai jeudi. Pas avant.', en: 'If you’re from the council, I’ll pay on Thursday. Not before.' }] },
  { id: 'm4-temple', kind: 'talk', layer: 1, bands: [3, 4], when: { period: P4, child: false, doing: ['pray'] },
    lines: [{ who: 'a', fr: 'Au temple, on m’a dit que vous ne parliez qu’aux prêtres.', en: 'At the temple they told me you only speak to priests.' }] },
  { id: 'm4-guet', kind: 'talk', layer: 1, bands: [3, 4], when: { period: P4, child: false, night: true },
    lines: [{ who: 'a', fr: 'Qui va là ? Montrez-vous, ou j’appelle le guet.', en: 'Who goes there? Show yourself, or I’ll call the watch.' }] },
  { id: 'm4-ciel', kind: 'talk', layer: 1, bands: [3, 4], when: { period: P4, child: true },
    lines: [{ who: 'a', fr: 'C’est toi qui parles dans le ciel ? Tu es tout en haut ?', en: 'Is it you talking in the sky? Are you right up there?' }] },

  { id: 'm4-foin', kind: 'talk', layer: 1, bands: [3, 4], when: { period: P4, child: false, precip: 'rain' },
    lines: [{ who: 'a', fr: 'Vous ne pourriez pas arrêter la pluie ? Mon foin est encore dehors.', en: 'Couldn’t you stop the rain? My hay is still outside.' }] },
  { id: 'm4-clocher', kind: 'talk', layer: 1, bands: [3, 4], when: { period: P4, child: false, trait: 'curious' },
    lines: [{ who: 'a', fr: 'Vous parlez d’où ? Du clocher ? Je n’entends que vous.', en: 'Where are you speaking from? The bell tower? I can only hear you.' }] },
  { id: 'm4-vieux', kind: 'talk', layer: 1, bands: [3, 4], when: { period: P4, child: false, old: true },
    lines: [{ who: 'a', fr: 'J’ai attendu toute ma vie que quelqu’un me réponde. Pas forcément vous.', en: 'I’ve waited all my life for someone to answer me. Not necessarily you.' }] },
  { id: 'm4-chercher', kind: 'talk', layer: 1, bands: [3, 4], when: { period: P4, child: false, trait: 'chatty', family: 'married' },
    lines: [{ who: 'a', fr: 'Attendez, je vais chercher {conjoint}. Personne ne me croira, sinon.', en: 'Wait, I’ll fetch {conjoint}. Nobody will believe me otherwise.' }] },

  // ══ P5 : le schisme ; il nous guide, il nous teste, il attend ══════════════════════
  { id: 'm5-lequel', kind: 'talk', layer: 1, bands: [4, 5], when: { period: P5, article: ['p5_tension_cult_split'], child: false },
    lines: [{ who: 'a', fr: 'Le prêtre dit que vous nous guidez, mon frère que vous nous testez. Lequel des deux ?', en: 'The priest says you guide us, my brother says you’re testing us. Which is it?' }],
    choices: {
      joueur: { belief: 'test', you: { fr: 'Je fais des essais.', en: 'I’m trying things out.' }, replies: [
        { act: 'look', lines: [{ fr: 'Des essais ? Depuis le début ? Même l’hiver où le grenier a brûlé ?', en: 'Trying things out? Since the start? Even the winter the granary burned?' }] },
      ] },
      dieu: { belief: 'guide', you: { fr: 'Je vous guide.', en: 'I guide you.' }, replies: [
        { when: { trait: 'pious' }, act: 'pray', lines: [{ fr: 'Je le savais. Je vais au temple, tout de suite, le dire au prêtre.', en: 'I knew it. I’m going to the temple right now to tell the priest.' }] },
        { act: 'go', lines: [{ fr: 'Alors le prêtre avait raison. Mon frère ne va pas aimer ça.', en: 'So the priest was right. My brother won’t like that.' }] },
      ] },
      indifferent: { belief: 'wait', you: { fr: 'J’attends.', en: 'I’m waiting.' }, replies: [
        { act: 'search', lines: [{ fr: 'Vous attendez quoi ? Dites-le, qu’on s’y mette.', en: 'Waiting for what? Tell us, and we’ll get on with it.' }] },
      ] },
      vie: { you: { fr: 'Et ton frère, vous vous parlez encore ?', en: 'And your brother, do you still talk?' }, replies: [
        { act: 'look', lines: [{ fr: 'Plus depuis la fête des moissons. Il dit que je crois n’importe quoi.', en: 'Not since the harvest feast. He says I’ll believe anything.' }] },
      ] },
    },
    silence: [{ act: 'go', lines: [{ fr: 'Vous ne répondez pas. Mon frère dira que c’est un test.', en: 'You don’t answer. My brother will say it’s a test.' }] }] },
  { id: 'm5-pain', kind: 'talk', layer: 1, bands: [4, 5], when: { period: P5, child: false, doing: ['errand', 'home'] },
    lines: [{ who: 'a', fr: 'Si c’est vous, il faut parler au boulanger. Le pain a encore pris deux sous.', en: 'If it’s you, you need to talk to the baker. Bread’s gone up two pennies again.' }] },
  { id: 'm5-pluie', kind: 'talk', layer: 1, bands: [4, 5], when: { period: P5, child: false },
    lines: [{ who: 'a', fr: 'C’est vous qui décidez de tout ? Même de la pluie ?', en: 'Do you decide everything? Even the rain?' }] },
  { id: 'm5-pause', kind: 'talk', layer: 1, bands: [5, 5], when: { period: P5, child: false, doing: ['work'] },
    lines: [{ who: 'a', fr: 'Pas maintenant, le contremaître regarde. Parlez-moi à la pause.', en: 'Not now, the foreman’s watching. Talk to me at the break.' }] },
  { id: 'm5-enfant', kind: 'talk', layer: 1, bands: [4, 5], when: { period: P5, child: true },
    lines: [{ who: 'a', fr: 'Maman dit que tu vois tout. Même sous le lit ?', en: 'Mum says you see everything. Even under the bed?' }] },

  { id: 'm5-ivrognes', kind: 'talk', layer: 1, bands: [4, 5], when: { period: P5, child: false, night: true },
    lines: [{ who: 'a', fr: 'À cette heure-ci, il n’y a que les ivrognes dans la rue. Et vous.', en: 'At this hour there’s nobody in the street but drunks. And you.' }] },
  { id: 'm5-bougie', kind: 'talk', layer: 1, bands: [4, 5], when: { period: P5, child: false, trait: 'pious' },
    lines: [{ who: 'a', fr: 'Je vous ai allumé une bougie, hier. Elle a brûlé jusqu’au bout.', en: 'I lit a candle for you yesterday. It burned right down.' }] },
  { id: 'm5-temps', kind: 'talk', layer: 1, bands: [4, 5], when: { period: P5, child: false, old: true },
    lines: [{ who: 'a', fr: 'De mon temps, vous ne parliez pas.', en: 'In my day, you didn’t talk.' }] },
  { id: 'm5-quete', kind: 'talk', layer: 1, bands: [4, 5], when: { period: P5, child: false, trait: 'grumpy' },
    lines: [{ who: 'a', fr: 'Si c’est pour la quête, j’ai déjà donné dimanche.', en: 'If it’s for the collection, I already gave on Sunday.' }] },

  // ══ P6 : les partis, le logo, le procès de Khael ═══════════════════════════════════
  { id: 'm6-proces', kind: 'talk', layer: 1, bands: [5, 6], when: { period: P6, article: ['p6_gold_khael'], child: false },
    lines: [{ who: 'a', fr: 'Au tribunal, Khael dit que vous ne viendrez jamais vous défendre. Vous avez entendu ?', en: 'At the court, Khael says you’ll never come to defend yourself. Did you hear?' }],
    choices: {
      dieu: { you: { fr: 'Je viendrai.', en: 'I’ll come.' }, replies: [
        { act: 'look', lines: [{ fr: 'Alors c’est jeudi, à neuf heures, salle trois. Je préviens Khael.', en: 'Then it’s Thursday at nine, courtroom three. I’ll tell Khael.' }] },
      ] },
    },
    silence: [{ act: 'go', lines: [{ fr: 'Vous ne dites rien. Je le noterai pour Khael, il tient un registre.', en: 'You say nothing. I’ll note it for Khael, he keeps a register.' }] }] },
  { id: 'm6-banque', kind: 'talk', layer: 1, bands: [5, 6], when: { period: P6, article: ['p6_gold_logo'], child: false },
    lines: [{ who: 'a', fr: 'Votre main est sur ma banque. Ma banque m’a refusé un prêt, mardi.', en: 'Your hand is on my bank. My bank turned me down for a loan on Tuesday.' }] },
  { id: 'm6-bureau', kind: 'talk', layer: 1, bands: [5, 6], when: { period: P6, article: ['p6_know_publication'], child: false },
    lines: [{ who: 'a', fr: 'Raphaël écrit que vous nous administrez. Vous avez un bureau, quelque part ?', en: 'Raphaël writes that you administer us. Do you have an office somewhere?' }] },
  { id: 'm6-radio', kind: 'talk', layer: 1, bands: [5, 6], when: { period: P6, child: false },
    lines: [{ who: 'a', fr: 'Vous parlez dans ma tête, ou dans le poste ?', en: 'Are you talking in my head, or in the radio?' }] },
  { id: 'm6-enfant', kind: 'talk', layer: 1, bands: [5, 6], when: { period: P6, child: true },
    lines: [{ who: 'a', fr: 'À l’école, on dit que tu recommences tout le temps. C’est vrai ?', en: 'At school they say you start over all the time. Is it true?' }] },

  { id: 'm6-chaine', kind: 'talk', layer: 1, bands: [5, 5], when: { period: P6, child: false, doing: ['work'] },
    lines: [{ who: 'a', fr: 'Pas maintenant. La chaîne ne s’arrête pas pour moi.', en: 'Not now. The line doesn’t stop for me.' }] },
  { id: 'm6-pirate', kind: 'talk', layer: 1, bands: [5, 6], when: { period: P6, child: false, night: true },
    lines: [{ who: 'a', fr: 'Vous parlez la nuit, maintenant ? Comme les radios pirates.', en: 'You talk at night now? Like the pirate radios.' }] },
  { id: 'm6-prie', kind: 'talk', layer: 1, bands: [5, 6], when: { period: P6, child: false, trait: 'pious' },
    lines: [{ who: 'a', fr: 'Je vous prie tous les soirs dans ma cuisine, et c’est dans la rue que vous me parlez ?', en: 'I pray to you every night in my kitchen, and you speak to me in the street?' }] },
  { id: 'm6-machine', kind: 'talk', layer: 1, bands: [5, 6], when: { period: P6, child: false, old: true },
    lines: [{ who: 'a', fr: 'Les jeunes disent que vous êtes une machine. Je leur ai dit de se taire.', en: 'The young ones say you’re a machine. I told them to be quiet.' }] },

  // ══ P7 : la boucle, le compteur, « Je crois qu'il joue » ════════════════════════════
  { id: 'm7-joue', kind: 'talk', layer: 1, bands: [6, 6], when: { period: P7, article: ['p7_know_raphael'], child: false },
    lines: [{ who: 'a', fr: 'Raphaël écrit que vous jouez. C’est vrai ?', en: 'Raphaël writes that you’re playing. Is it true?' }],
    choices: {
      joueur: { belief: 'joue', you: { fr: 'Oui.', en: 'Yes.' }, replies: [
        { when: { trait: 'grumpy' }, act: 'go', lines: [{ fr: 'Super. Moi, je fais dix heures par jour au guichet.', en: 'Great. I do ten hours a day at the counter.' }] },
        { act: 'look', lines: [{ fr: 'Et nous, on est quoi ? Les pions ? Je préfère ne pas le savoir.', en: 'And what are we? The pieces? I’d rather not know.' }] },
      ] },
      dieu: { belief: 'joue-pas', you: { fr: 'Non.', en: 'No.' }, replies: [
        { act: 'go', lines: [{ fr: 'Je préfère ça. Je vais le dire à Raphaël, il me doit un café.', en: 'I’d rather that. I’ll tell Raphaël, he owes me a coffee.' }] },
      ] },
    },
    silence: [{ act: 'go', lines: [{ fr: 'Vous ne répondez pas. Raphaël va encore en écrire trois pages.', en: 'You don’t answer. Raphaël will write three more pages about it.' }] }] },
  { id: 'm7-edith', kind: 'talk', layer: 1, bands: [6, 6], when: { period: P7, article: ['p7_tension_edith'], child: false },
    lines: [{ who: 'a', fr: 'Edith a demandé à vous voir. Vous avez reçu sa lettre ?', en: 'Edith asked to see you. Did you get her letter?' }] },
  { id: 'm7-compteur', kind: 'talk', layer: 1, bands: [6, 6], when: { period: P7, child: false },
    lines: [{ who: 'a', fr: 'On dit que vous comptez nos jours. On en est à combien ?', en: 'They say you count our days. What’s the number now?' }] },
  { id: 'm7-metro', kind: 'talk', layer: 1, bands: [6, 6], when: { period: P7, child: false, doing: ['work', 'errand'] },
    lines: [{ who: 'a', fr: 'Si vous êtes réel, faites que le métro arrive à l’heure. Juste demain.', en: 'If you’re real, make the metro run on time. Just tomorrow.' }] },
  { id: 'm7-enfant', kind: 'talk', layer: 1, bands: [6, 6], when: { period: P7, child: true },
    lines: [{ who: 'a', fr: 'Tu es dans la tablette ? Je t’entends sans le casque.', en: 'Are you in the tablet? I can hear you without the headphones.' }] },

  { id: 'm7-insomnie', kind: 'talk', layer: 1, bands: [6, 6], when: { period: P7, child: false, night: true },
    lines: [{ who: 'a', fr: 'Vous non plus, vous ne dormez pas ?', en: 'You can’t sleep either?' }] },
  { id: 'm7-ecouteurs', kind: 'talk', layer: 1, bands: [6, 6], when: { period: P7, child: false, doing: ['errand', 'wander', 'plaza'] },
    lines: [{ who: 'a', fr: 'Attendez, j’enlève mes écouteurs. Voilà. Vous disiez ?', en: 'Hang on, I’m taking my earphones out. There. You were saying?' }] },
  { id: 'm7-plus-personne', kind: 'talk', layer: 1, bands: [6, 6], when: { period: P7, child: false, trait: 'pious' },
    lines: [{ who: 'a', fr: 'On m’avait dit que vous ne parliez plus à personne, depuis longtemps.', en: 'I was told you hadn’t spoken to anyone in a long time.' }] },
  { id: 'm7-service', kind: 'talk', layer: 1, bands: [6, 6], when: { period: P7, child: false, trait: 'grumpy' },
    lines: [{ who: 'a', fr: 'Si vous êtes du service client, je raccroche.', en: 'If you’re customer service, I’m hanging up.' }] },

  // ══ P8 : l'Absent ═══════════════════════════════════════════════════════════════════
  { id: 'm8-pensee', kind: 'talk', layer: 1, bands: [7, 7], when: { period: P8, article: ['p8_tension_absent'], child: false },
    lines: [{ who: 'a', fr: 'Au chœur, il manque une pensée. Edith dit que c’est la vôtre.', en: 'There’s a thought missing in the choir. Edith says it’s yours.' }],
    choices: {
      dieu: { you: { fr: 'C’est la mienne.', en: 'It’s mine.' }, replies: [
        { act: 'look', lines: [{ fr: 'Alors pensez avec nous, ce soir. On commence à neuf heures, sur le toit du jardin.', en: 'Then think with us tonight. We start at nine, on the garden roof.' }] },
      ] },
      indifferent: { you: { fr: 'Je préfère écouter.', en: 'I’d rather listen.' }, replies: [
        { act: 'go', lines: [{ fr: 'Comme vous voudrez. Je garderai une place libre, au cas où.', en: 'As you like. I’ll keep a place free, just in case.' }] },
      ] },
    },
    silence: [{ act: 'go', lines: [{ fr: 'Toujours rien. Edith va encore recompter.', en: 'Still nothing. Edith will count again.' }] }] },
  { id: 'm8-dehors', kind: 'talk', layer: 1, bands: [7, 7], when: { period: P8, child: false },
    lines: [{ who: 'a', fr: 'Vous n’êtes pas dans le chœur, et je vous entends quand même. Comment vous faites ?', en: 'You’re not in the choir, and I can still hear you. How do you do it?' }] },
  { id: 'm8-banc', kind: 'talk', layer: 1, bands: [7, 7], when: { period: P8, child: false, doing: ['plaza', 'wander'] },
    lines: [{ who: 'a', fr: 'Asseyez-vous, il y a de la place sur le banc. Si vous pouvez vous asseoir.', en: 'Sit down, there’s room on the bench. If you can sit.' }] },
  { id: 'm8-enfant', kind: 'talk', layer: 1, bands: [7, 7], when: { period: P8, child: true },
    lines: [{ who: 'a', fr: 'Tu n’es pas dans le chœur des petits. Tu veux venir ?', en: 'You’re not in the little ones’ choir. Do you want to come?' }] },

  { id: 'm8-nuit', kind: 'talk', layer: 1, bands: [7, 7], when: { period: P8, child: false, night: true },
    lines: [{ who: 'a', fr: 'La nuit, le chœur se tait. Je vous entends mieux.', en: 'At night the choir goes quiet. I can hear you better.' }] },
  { id: 'm8-garde', kind: 'talk', layer: 1, bands: [7, 7], when: { period: P8, child: false, trait: 'pious' },
    lines: [{ who: 'a', fr: 'J’ai gardé une pensée pour vous, au chœur. Vous l’avez reçue ?', en: 'I kept a thought for you in the choir. Did you get it?' }] },
  { id: 'm8-ecrans', kind: 'talk', layer: 1, bands: [7, 7], when: { period: P8, child: false, old: true },
    lines: [{ who: 'a', fr: 'J’ai connu le temps des écrans. On ne vous entendait pas, à l’époque.', en: 'I remember the age of screens. Nobody could hear you then.' }] },
  { id: 'm8-langue', kind: 'talk', layer: 1, bands: [7, 7], when: { period: P8, child: false, trait: 'curious' },
    lines: [{ who: 'a', fr: 'Vous pensez en quelle langue ?', en: 'What language do you think in?' }] },

  // ══ P9 : le Joueur ══════════════════════════════════════════════════════════════════
  { id: 'm9-nom', kind: 'talk', layer: 1, bands: [8, 8], when: { period: P9, article: ['p9_tension_joueur'], child: false },
    lines: [{ who: 'a', fr: 'Le conseil vous appelle le Joueur, maintenant. Ça vous va ?', en: 'The council calls you the Player now. Does that suit you?' }],
    choices: {
      joueur: { you: { fr: 'Ça me va.', en: 'It suits me.' }, replies: [
        { act: 'look', lines: [{ fr: 'Tant mieux. On l’a déjà gravé sur la coque de la navette.', en: 'Good. We’ve already engraved it on the shuttle’s hull.' }] },
      ] },
      dieu: { you: { fr: 'Je n’ai pas de nom.', en: 'I have no name.' }, replies: [
        { act: 'search', lines: [{ fr: 'Tout le monde a un nom. Même la sonde qu’on a perdue en a un.', en: 'Everyone has a name. Even the probe we lost has one.' }] },
      ] },
    },
    silence: [{ act: 'go', lines: [{ fr: 'Je dirai au conseil que vous n’avez pas dit non.', en: 'I’ll tell the council you didn’t say no.' }] }] },
  { id: 'm9-bord', kind: 'talk', layer: 1, bands: [8, 8], when: { period: P9, child: false },
    lines: [{ who: 'a', fr: 'Vous êtes à bord ? On ne vous a pas compté, au départ.', en: 'Are you on board? We didn’t count you when we left.' }] },
  { id: 'm9-chaise', kind: 'talk', layer: 1, bands: [8, 8], when: { period: P9, child: false },
    lines: [{ who: 'a', fr: 'Le conseil laisse toujours une chaise vide pour vous. Vous venez, ce soir ?', en: 'The council always leaves an empty chair for you. Are you coming tonight?' }] },
  { id: 'm9-enfant', kind: 'talk', layer: 1, bands: [8, 8], when: { period: P9, child: true },
    lines: [{ who: 'a', fr: 'Tu habites sur quelle étoile ? Moi, sur la navette sept.', en: 'Which star do you live on? I live on shuttle seven.' }] },

  { id: 'm9-soir', kind: 'talk', layer: 1, bands: [8, 8], when: { period: P9, child: false, night: true },
    lines: [{ who: 'a', fr: 'Il n’y a pas de nuit, à bord. Vous parlez quand même comme si c’était le soir.', en: 'There’s no night on board. You still talk as if it were evening.' }] },
  { id: 'm9-hublot', kind: 'talk', layer: 1, bands: [8, 8], when: { period: P9, child: false, trait: 'pious' },
    lines: [{ who: 'a', fr: 'On vous a gardé un hublot, au fond du pont trois.', en: 'We kept a porthole for you, at the far end of deck three.' }] },
  { id: 'm9-planete', kind: 'talk', layer: 1, bands: [8, 8], when: { period: P9, child: false, old: true },
    lines: [{ who: 'a', m: 'Je suis né sur la planète. Vous parliez déjà, là-bas ?', f: 'Je suis née sur la planète. Vous parliez déjà, là-bas ?', en: 'I was born on the planet. Did you talk, back there?' }] },
  { id: 'm9-voile', kind: 'talk', layer: 1, bands: [8, 8], when: { period: P9, child: false, doing: ['work'] },
    lines: [{ who: 'a', fr: 'Une seconde, je finis d’aligner la voile. Voilà. C’était vous ?', en: 'One second, I’m finishing lining up the sail. There. Was that you?' }] },

  // ══ P10 : Celui qui recommence ; on se dit « tu », entre égaux ═════════════════════
  { id: 'm10-souvenir', kind: 'talk', layer: 1, bands: [9, 9], when: { period: P10 },
    lines: [{ who: 'a', fr: 'Tu recommences tout, chaque fois. Tu te souviens de nous, après ?', en: 'You start everything over, every time. Do you remember us, afterwards?' }],
    choices: {
      dieu: { you: { fr: 'Oui.', en: 'Yes.' }, replies: [
        { act: 'look', lines: [{ fr: 'Alors souviens-toi de moi. Je m’appelle {a}.', en: 'Then remember me. My name is {a}.' }] },
      ] },
      indifferent: { you: { fr: 'Pas de tout.', en: 'Not all of it.' }, replies: [
        { act: 'look', lines: [{ fr: 'Alors garde le jardin de ma mère, si tu peux. Le reste, tant pis.', en: 'Then keep my mother’s garden, if you can. Never mind the rest.' }] },
      ] },
    },
    silence: [{ act: 'go', lines: [{ fr: 'Tu ne réponds pas. Je vais l’écrire quelque part, au cas où.', en: 'You don’t answer. I’ll write it down somewhere, just in case.' }] }] },
  { id: 'm10-attendu', kind: 'talk', layer: 1, bands: [9, 9], when: { period: P10 },
    lines: [{ who: 'a', fr: 'Te voilà. On t’attendait plus tôt, cette fois.', en: 'There you are. We expected you sooner, this time.' }] },
  { id: 'm10-braise', kind: 'talk', layer: 1, bands: [9, 9], when: { period: P10, child: false },
    lines: [{ who: 'a', fr: 'On a choisi une braise pour la cité d’après. Tu la prendras ?', en: 'We’ve chosen an ember for the next city. Will you take it?' }] },
  { id: 'm10-plus-prier', kind: 'talk', layer: 1, bands: [9, 9], when: { period: P10, child: false, trait: 'pious' },
    lines: [{ who: 'a', fr: 'Je ne te prie plus. On se parle, maintenant.', en: 'I don’t pray to you any more. We talk now.' }] },
  { id: 'm10-douze', kind: 'talk', layer: 1, bands: [9, 9], when: { period: P10, child: false, old: true },
    lines: [{ who: 'a', fr: 'J’ai vu passer douze cités. Tu étais là à chaque fois.', en: 'I’ve seen twelve cities go by. You were there every time.' }] },
  { id: 'm10-montre', kind: 'talk', layer: 1, bands: [9, 9], when: { period: P10, child: false, trait: 'curious' },
    lines: [{ who: 'a', fr: 'Tu me montres comment tu recommences ? Juste une fois.', en: 'Will you show me how you start over? Just once.' }] },
  { id: 'm10-etoiles', kind: 'talk', layer: 1, bands: [9, 9], when: { period: P10, child: true },
    lines: [{ who: 'a', fr: 'Tu veux jouer avec nous ? On fait des étoiles.', en: 'Do you want to play with us? We’re making stars.' }] },
];

// ── LES QUATRE VOIX ──────────────────────────────────────────────────────────────
// Ce que dit le joueur (toujours « tu »), et ce qu'on lui répond, âge par âge.
export const VOIX = {
  // Il dit qu'il joue. Chaque âge l'entend avec ce qu'il connaît du jeu.
  joueur: [
    { key: 'joue', you: { fr: 'Je joue.', en: 'I’m playing.' }, replies: [
      { when: { child: true }, bands: [1, 8], act: 'look', lines: [{ fr: 'Moi aussi, je joue. Tu joues à quoi ?', en: 'Me too, I’m playing. What are you playing?' }] },
      { when: { period: VOUS, trait: 'grumpy' }, act: 'go', lines: [{ fr: 'Vous jouez, et moi je travaille. On n’a pas la même journée.', en: 'You play, and I work. We don’t have the same day.' }] },
      { when: { period: P3 }, act: 'search', lines: [{ fr: 'Tu joues ? Comme les enfants aux osselets ?', en: 'You’re playing? Like the children with knucklebones?' }] },
      { when: { period: P4 }, act: 'look', lines: [{ fr: 'Vous jouez ? Comme aux dés, à l’auberge ?', en: 'You’re playing? Like dice, at the inn?' }] },
      { when: { period: P5 }, act: 'look', lines: [{ fr: 'Vous jouez ? Mon oncle aussi jouait. Il a perdu sa boutique aux dés.', en: 'You’re playing? My uncle played too. He lost his shop at dice.' }] },
      { when: { period: P6 }, act: 'look', lines: [{ fr: 'Vous jouez ? Comme au loto du dimanche ? On gagne quoi, nous ?', en: 'You’re playing? Like the Sunday lottery? What do we win?' }] },
      { when: { period: P7 }, act: 'look', lines: [{ fr: 'Vous jouez ? Sur un écran, comme mon fils dans le métro ?', en: 'You’re playing? On a screen, like my son on the metro?' }] },
      { when: { period: P8 }, act: 'look', lines: [{ fr: 'Vous jouez. Je le dirai au chœur, ce soir. Ça va faire du bruit dans les têtes.', en: 'You’re playing. I’ll tell the choir tonight. That will make some noise in our heads.' }] },
      { when: { period: P9 }, act: 'look', lines: [{ fr: 'Vous jouez. Le conseil le savait, c’est écrit dans la charte. Article trois.', en: 'You’re playing. The council knew, it’s in the charter. Article three.' }] },
      { when: { period: P10 }, act: 'look', lines: [{ fr: 'Je sais. Je l’ai vu dans les archives de l’Amas : la même main, une partie de plus.', en: 'I know. I saw it in the Cluster archives: the same hand, one more game.' }] },
    ] },
    { key: 'partie', you: { fr: 'Tu es dans ma partie.', en: 'You’re in my game.' }, replies: [
      { when: { child: true }, bands: [1, 8], act: 'look', lines: [{ fr: 'Je peux être le chef, dans ta partie ?', en: 'Can I be the leader, in your game?' }] },
      { when: { period: P3 }, act: 'search', lines: [{ fr: 'Dans ta partie ? Je ne sais pas ce que c’est, une partie.', en: 'In your game? I don’t know what a game is.' }] },
      { when: { period: P4 }, act: 'go', lines: [{ fr: 'Une partie de quoi ? Je ne joue à rien, moi. J’ai du travail.', en: 'A game of what? I’m not playing anything. I have work to do.' }] },
      { when: { period: P5 }, act: 'look', lines: [{ fr: 'Dans votre partie ? Alors faites-moi gagner une fois.', en: 'In your game? Then let me win, just once.' }] },
      { when: { period: P6 }, act: 'look', lines: [{ fr: 'Votre partie. Et quand vous éteignez, on fait quoi, nous ?', en: 'Your game. And when you switch off, what do we do?' }] },
      { when: { period: P7 }, act: 'look', lines: [{ fr: 'Votre partie. Je me disais aussi, les loyers montent trop régulièrement.', en: 'Your game. I did wonder, the rents go up too regularly.' }] },
      { when: { period: P8 }, act: 'look', lines: [{ fr: 'Votre partie. Alors la pensée qui manque au chœur était occupée ailleurs.', en: 'Your game. So the thought missing from the choir was busy elsewhere.' }] },
      { when: { period: P9 }, act: 'look', lines: [{ fr: 'Votre partie. On en est à quel tour, à peu près ?', en: 'Your game. What turn are we on, roughly?' }] },
      { when: { period: P10 }, act: 'look', lines: [{ fr: 'Ta partie. Tu en as fait combien, avant celle-ci ?', en: 'Your game. How many have you played before this one?' }] },
    ] },
    { key: 'clic', you: { fr: 'J’ai cliqué sur toi.', en: 'I clicked on you.' }, replies: [
      { when: { child: true }, bands: [1, 8], act: 'look', lines: [{ fr: 'Ça chatouille. Tu peux recommencer ?', en: 'That tickles. Can you do it again?' }] },
      { when: { period: P3 }, act: 'search', lines: [{ fr: 'Cliqué ? Je ne connais pas ce mot. Tu parles comme les marchands du sud.', en: 'Clicked? I don’t know that word. You talk like the merchants from the south.' }] },
      { when: { period: P4 }, act: 'look', lines: [{ fr: 'Cliqué ? C’est un mot de votre pays ?', en: 'Clicked? Is that a word from your country?' }] },
      { when: { period: P5 }, act: 'look', lines: [{ fr: 'Cliqué ? Comme le cliquet d’un métier à tisser ?', en: 'Clicked? Like the pawl on a loom?' }] },
      { when: { period: P6 }, act: 'look', lines: [{ fr: 'Cliqué ? Comme un interrupteur ?', en: 'Clicked? Like a switch?' }] },
      { when: { period: P7 }, act: 'look', lines: [{ fr: 'Cliqué ? Comme sur une annonce ? Je n’ai rien demandé, moi.', en: 'Clicked? Like on an advert? I didn’t ask for anything.' }] },
      { when: { period: P8 }, act: 'look', lines: [{ fr: 'Vous avez cliqué sur moi. Je l’ai senti, derrière l’oreille.', en: 'You clicked on me. I felt it, behind my ear.' }] },
      { when: { period: P9 }, act: 'look', lines: [{ fr: 'Cliqué. À bord, on dit : sélectionné.', en: 'Clicked. On board we say: selected.' }] },
      { when: { period: P10 }, act: 'look', lines: [{ fr: 'Je sais. Je l’ai senti. Ça chatouille, la première fois.', en: 'I know. I felt it. It tickles, the first time.' }] },
    ] },
  ],

  // Il parle en dieu. C'est vrai : il a tout bâti, il veille, ils lui ont donné un nom.
  dieu: [
    { key: 'veille', you: { fr: 'Je veille sur vous.', en: 'I watch over you.' }, replies: [
      { when: { child: true }, bands: [1, 8], act: 'look', lines: [{ fr: 'Tu veilles sur moi ? Même la nuit, quand j’ai peur ?', en: 'You watch over me? Even at night, when I’m scared?' }] },
      { when: { trait: 'pious', period: P3 }, act: 'kneel', lines: [{ fr: 'Je le savais. Ma grand-mère le disait aussi. Je me mets à genoux.', en: 'I knew it. My grandmother said so too. I’m getting down on my knees.' }] },
      { when: { trait: 'pious', period: VOUS }, act: 'kneel', lines: [{ fr: 'Je le savais. Je me mets à genoux, là, devant tout le monde.', en: 'I knew it. I’m going down on my knees, right here, in front of everyone.' }] },
      { when: { trait: 'superstitious', period: P3 }, act: 'flee', lines: [{ fr: 'Une voix qui veille. Je ne reste pas là, je rentre.', en: 'A voice that watches. I’m not staying here, I’m going home.' }] },
      { when: { trait: 'grumpy', period: VOUS }, act: 'look', lines: [{ fr: 'Vous veillez ? Alors il faudra m’expliquer l’égout de ma rue.', en: 'You watch over us? Then you’ll have to explain the sewer in my street.' }] },
      { when: { period: P3 }, act: 'look', lines: [{ fr: 'Tu veilles ? Alors tu as vu qui a pris mes deux poules.', en: 'You watch over us? Then you saw who took my two hens.' }] },
      { when: { period: P4 }, act: 'look', lines: [{ fr: 'Vous veillez ? Alors vous avez vu brûler le moulin. Il fallait venir.', en: 'You watch over us? Then you saw the mill burn. You should have come.' }] },
      { when: { period: P5 }, act: 'look', lines: [{ fr: 'Vous veillez. Alors vous savez pour la farine. Elle a encore augmenté.', en: 'You watch over us. Then you know about the flour. It’s gone up again.' }] },
      { when: { period: P6 }, act: 'look', lines: [{ fr: 'Vous veillez ? Les partis disent tous que vous êtes avec eux. Vous êtes avec qui ?', en: 'You watch over us? Every party says you’re on their side. Whose side are you on?' }] },
      { when: { period: P7 }, act: 'look', lines: [{ fr: 'Vous veillez. Alors vous avez vu ma note d’électricité.', en: 'You watch over us. Then you’ve seen my electricity bill.' }] },
      { when: { period: P8 }, act: 'look', lines: [{ fr: 'Vous veillez. Le chœur dit que vous regardez sans penser. C’est vrai ?', en: 'You watch over us. The choir says you watch without thinking. Is that true?' }] },
      { when: { period: P9 }, act: 'look', lines: [{ fr: 'Vous veillez. Alors c’est vous, la lumière sur la coque, la nuit ?', en: 'You watch over us. So you’re the light on the hull at night?' }] },
      { when: { period: P10 }, act: 'look', lines: [{ fr: 'Tu veilles. Moi aussi, je veille sur des mondes, maintenant. Ce n’est pas reposant.', en: 'You watch. I watch over worlds too, now. It isn’t restful.' }] },
    ] },
    { key: 'bati', you: { fr: 'C’est moi qui ai bâti tout ça.', en: 'I built all this.' }, replies: [
      { when: { child: true }, bands: [1, 8], act: 'look', lines: [{ fr: 'Tu as fait les arbres aussi ? Et les chats ?', en: 'Did you make the trees too? And the cats?' }] },
      { when: { trait: 'pious', period: VOUS }, act: 'kneel', lines: [{ fr: 'Alors merci pour le grenier. Je me mets à genoux, je ne sais pas faire autrement.', en: 'Then thank you for the granary. I’m kneeling, I don’t know what else to do.' }] },
      { when: { period: P3 }, act: 'look', lines: [{ fr: 'Toi ? Le mur du four, c’est mon père qui l’a monté. Je l’ai vu faire.', en: 'You? The oven wall, my father built that. I watched him do it.' }] },
      { when: { period: P4 }, act: 'look', lines: [{ fr: 'Vous ? Le pont, c’est les maçons de la guilde. Je les connais tous.', en: 'You? The bridge was the guild masons. I know every one of them.' }] },
      { when: { period: P5 }, act: 'look', lines: [{ fr: 'Vous ? Alors c’est vous qui avez mis le grenier si loin du port.', en: 'You? So you’re the one who put the granary so far from the port.' }] },
      { when: { period: P6 }, act: 'look', lines: [{ fr: 'Vous ? Alors c’est vous qui avez construit l’usine à côté de l’école.', en: 'You? So you built the factory next to the school.' }] },
      { when: { period: P7 }, act: 'look', lines: [{ fr: 'Vous ? Alors c’est vous, le métro qui s’arrête juste avant mon quartier.', en: 'You? So you’re the metro that stops just short of my neighbourhood.' }] },
      { when: { period: P8 }, act: 'look', lines: [{ fr: 'Vous ? Les tours-mémoire aussi ? On croyait que c’était le chœur.', en: 'You? The memory towers too? We thought it was the choir.' }] },
      { when: { period: P9 }, act: 'look', lines: [{ fr: 'Vous ? Même les voiles ? On a mis cent ans à les tisser.', en: 'You? Even the sails? It took us a hundred years to weave them.' }] },
      { when: { period: P10 }, act: 'look', lines: [{ fr: 'Je sais. Tu l’as rebâti combien de fois ?', en: 'I know. How many times have you rebuilt it?' }] },
    ] },
    { key: 'nom', you: { fr: 'C’est moi que vous appelez {nom}.', en: 'I’m the one you call {nom}.' }, replies: [
      { when: { child: true }, bands: [1, 8], act: 'look', lines: [{ fr: 'C’est toi ? Maman ne va jamais me croire.', en: 'It’s you? Mum will never believe me.' }] },
      { when: { period: P3 }, act: 'look', lines: [{ fr: 'Alors le savant du marché avait raison. On s’est tous moqués de lui.', en: 'So the scholar at the market was right. We all laughed at him.' }] },
      { when: { period: P4 }, act: 'look', lines: [{ fr: 'Vous ? Je vous imaginais plus grand.', en: 'You? I pictured you taller.' }] },
      { when: { period: P5, article: ['p5_gold_coins'] }, act: 'look', lines: [{ fr: 'Alors c’est votre main, sur les pièces. Elle est bien gravée.', en: 'So that’s your hand on the coins. It’s well engraved.' }] },
      { when: { period: P5 }, act: 'look', lines: [{ fr: 'Vous ? Je vous parle tous les soirs. Vous n’avez jamais répondu.', en: 'You? I talk to you every night. You never answered.' }] },
      { when: { period: P6, article: ['p6_gold_logo'] }, act: 'look', lines: [{ fr: 'Votre main est sur ma banque. Vous le saviez ?', en: 'Your hand is on my bank. Did you know?' }] },
      { when: { period: P6 }, act: 'look', lines: [{ fr: 'Vous ? Khael voudra vous parler. Il a des questions.', en: 'You? Khael will want to talk to you. He has questions.' }] },
      { when: { period: P7 }, act: 'look', lines: [{ fr: 'Vous ? Edith a demandé à vous voir. Elle a fait une demande écrite.', en: 'You? Edith asked to see you. She put it in writing.' }] },
      { when: { period: P8 }, act: 'look', lines: [{ fr: 'Vous ? Alors il faut que je prévienne Edith. Elle recompte depuis des semaines.', en: 'You? Then I need to tell Edith. She’s been recounting for weeks.' }] },
      { when: { period: P9 }, act: 'look', lines: [{ fr: 'On a gravé votre nom sur la coque. Vous voulez voir ?', en: 'We engraved your name on the hull. Do you want to see?' }] },
      { when: { period: P10 }, act: 'look', lines: [{ fr: 'Oui. Je t’ai reconnu à la voix.', en: 'Yes. I knew you by your voice.' }] },
    ] },
  ],

  // Il ne s'en soucie pas.
  indifferent: [
    { key: 'importe', you: { fr: 'Peu importe.', en: 'It doesn’t matter.' }, replies: [
      { when: { child: true }, bands: [1, 8], act: 'look', lines: [{ fr: 'Peu importe quoi ?', en: 'What doesn’t matter?' }] },
      { when: { trait: 'superstitious' }, act: 'home', lines: [{ fr: 'Une voix qui dit peu importe. C’est encore pire. Je rentre.', en: 'A voice that says it doesn’t matter. That’s even worse. I’m going home.' }] },
      { when: { period: VOUS, trait: 'grumpy' }, act: 'go', lines: [{ fr: 'Peu importe ? Alors pourquoi vous parlez ?', en: 'It doesn’t matter? Then why are you talking?' }] },
      { when: { period: P3 }, act: 'go', lines: [{ fr: 'Peu importe ? Bon. Je vais finir ma journée, alors.', en: 'It doesn’t matter? Fine. I’ll finish my day, then.' }] },
      { when: { period: P4 }, act: 'go', lines: [{ fr: 'Peu importe ? Le prêtre ne va pas aimer ça.', en: 'It doesn’t matter? The priest won’t like that.' }] },
      { when: { period: P5 }, act: 'go', lines: [{ fr: 'Peu importe. D’accord. Je retourne à la file, alors.', en: 'It doesn’t matter. All right. Back to the queue, then.' }] },
      { when: { period: P6 }, act: 'go', lines: [{ fr: 'Peu importe. Ça, c’est une réponse de ministre.', en: 'It doesn’t matter. Now that’s a minister’s answer.' }] },
      { when: { period: P7 }, act: 'go', lines: [{ fr: 'Peu importe. Vous parlez comme mon chef.', en: 'It doesn’t matter. You sound like my boss.' }] },
      { when: { period: P8 }, act: 'go', lines: [{ fr: 'Peu importe. Le chœur n’avait jamais entendu ça. Il va y penser toute la nuit.', en: 'It doesn’t matter. The choir has never heard that. It will think about it all night.' }] },
      { when: { period: P9 }, act: 'go', lines: [{ fr: 'Peu importe. Je le noterai quand même dans le journal de bord.', en: 'It doesn’t matter. I’ll still note it in the log.' }] },
      { when: { period: P10 }, act: 'go', lines: [{ fr: 'Peu importe. Oui. Tu dis ça chaque fois, à ce qu’on raconte.', en: 'It doesn’t matter. Yes. You say that every time, so they tell me.' }] },
    ] },
    { key: 'route', you: { fr: 'Continue ta route.', en: 'Go on your way.' }, replies: [
      { when: { child: true }, bands: [1, 8], act: 'go', lines: [{ fr: 'D’accord. Je vais jouer plus loin.', en: 'All right. I’ll go and play further on.' }] },
      { when: { trait: 'pious' }, act: 'go', lines: [{ fr: 'J’y vais. Merci de m’avoir parlé, quand même.', en: 'I’m going. Thank you for speaking to me, all the same.' }] },
      { when: { period: P3 }, act: 'go', lines: [{ fr: 'J’y vais. Je n’ai rien demandé, moi.', en: 'I’m going. I didn’t ask for anything.' }] },
      { when: { period: VOUS }, act: 'go', lines: [{ fr: 'J’y vais, j’y vais. Pas besoin de le dire deux fois.', en: 'I’m going, I’m going. No need to say it twice.' }] },
      { when: { period: P10 }, act: 'go', lines: [{ fr: 'Je continue. Tu sais où elle mène, toi, ma route ?', en: 'I’m going on. Do you know where it leads, my road?' }] },
    ] },
    { key: 'passais', you: { fr: 'Je passais.', en: 'I was passing by.' }, replies: [
      { when: { child: true }, bands: [1, 8], act: 'look', lines: [{ fr: 'Tu passais ? Tu repasses demain ?', en: 'You were passing? Will you come by tomorrow?' }] },
      { when: { period: P3 }, act: 'go', lines: [{ fr: 'Tu passais ? Par où ? Il n’y a que ce chemin-là.', en: 'You were passing? Which way? There’s only this path.' }] },
      { when: { period: VOUS }, act: 'go', lines: [{ fr: 'Vous passiez. Revenez quand vous voulez, je suis là tous les matins.', en: 'You were passing. Come back whenever you like, I’m here every morning.' }] },
      { when: { period: P10 }, act: 'go', lines: [{ fr: 'Tu passais. Comme toujours. Repasse.', en: 'You were passing. As always. Come by again.' }] },
    ] },
  ],

  // Il demande des nouvelles de SA vie : la plus précise d'abord (ses enfants, son
  // conjoint, ce qu'il fait), puis ce qu'on demande à tout le monde.
  vie: [
    { key: 'enfant', you: { fr: 'Comment va {enfant} ?', en: 'How is {enfant}?' }, replies: [
      { when: { period: P3 }, act: 'look', lines: [{ fr: '{enfant} ? Toujours cette toux. Comment tu connais son prénom ?', en: '{enfant}? Still that cough. How do you know the name?' }] },
      { when: { period: [4, 5] }, bands: [3, 4], act: 'look', lines: [{ fr: '{enfant} passe ses journées à courir après les chèvres du voisin. Comment vous savez son prénom ?', en: '{enfant} spends all day chasing the neighbour’s goats. How do you know the name?' }] },
      { when: { period: [5, 7] }, bands: [5, 6], act: 'look', lines: [{ fr: '{enfant} a eu de bonnes notes cette semaine. Vous connaissez son prénom ?', en: '{enfant} got good marks this week. You know the name?' }] },
      { when: { period: P8 }, act: 'look', lines: [{ fr: '{enfant} chante avec le chœur des petits, depuis le printemps. Vous l’avez entendu ?', en: '{enfant} has been singing in the little ones’ choir since spring. Have you heard?' }] },
      { when: { period: P9 }, act: 'look', lines: [{ m: '{enfant} veut partir sur la prochaine navette. Je ne suis pas prêt.', f: '{enfant} veut partir sur la prochaine navette. Je ne suis pas prête.', en: '{enfant} wants to leave on the next shuttle. I’m not ready.' }] },
      { when: { period: P10 }, act: 'look', lines: [{ fr: '{enfant} sait déjà tisser le vide. Plus vite que moi.', en: '{enfant} can already weave the void. Faster than me.' }] },
    ] },
    { key: 'conjoint', you: { fr: 'Et {conjoint}, ça va ?', en: 'And {conjoint}, all well?' }, replies: [
      { when: { period: P3 }, act: 'look', lines: [{ fr: '{conjoint} va bien. On s’est disputés pour le toit, ce matin. Comment tu sais son nom ?', en: '{conjoint} is fine. We argued about the roof this morning. How do you know the name?' }] },
      { when: { period: [4, 5] }, act: 'look', lines: [{ fr: '{conjoint} a un peu de fièvre, rien de grave. Vous voulez que je lui dise quelque chose ?', en: '{conjoint} has a bit of a fever, nothing serious. Do you want me to pass something on?' }] },
      { when: { period: [6, 7] }, act: 'look', lines: [{ fr: '{conjoint} travaille de nuit, en ce moment. On se croise au petit-déjeuner.', en: '{conjoint} is on nights at the moment. We pass each other at breakfast.' }] },
      { when: { period: P8 }, act: 'look', lines: [{ fr: '{conjoint} va bien. On pense souvent la même chose au même moment, c’est pratique.', en: '{conjoint} is fine. We often think the same thing at the same moment, it’s handy.' }] },
      { when: { period: P9 }, act: 'look', lines: [{ fr: '{conjoint} est en voyage, trois ans aller-retour. On s’écrit.', en: '{conjoint} is travelling, three years there and back. We write.' }] },
      { when: { period: P10 }, act: 'look', lines: [{ fr: '{conjoint} va bien. On a fêté nos mille ans de mariage, hier.', en: '{conjoint} is fine. We celebrated a thousand years married, yesterday.' }] },
    ] },
    { key: 'joue-avec', when: { child: true }, you: { fr: 'Tu as joué avec qui, aujourd’hui ?', en: 'Who did you play with today?' }, replies: [
      { bands: [1, 2], act: 'look', lines: [{ fr: 'Avec les grands, au bord de l’eau. On a trouvé une grenouille.', en: 'With the big ones, by the water. We found a frog.' }] },
      { bands: [3, 4], act: 'look', lines: [{ fr: 'Avec personne. Les grands ne veulent pas de moi aux billes.', en: 'With nobody. The big ones won’t let me play marbles.' }] },
      { bands: [5, 5], act: 'look', lines: [{ fr: 'Avec mon cousin. On a fait courir un rat dans la cour de l’usine.', en: 'With my cousin. We chased a rat round the factory yard.' }] },
      { bands: [6, 6], act: 'look', lines: [{ fr: 'Avec personne. J’étais sur la tablette de maman.', en: 'With nobody. I was on Mum’s tablet.' }] },
      { bands: [7, 7], act: 'look', lines: [{ fr: 'Avec le chœur des petits. On a pensé à un chien, tous ensemble.', en: 'With the little ones’ choir. We all thought about a dog together.' }] },
      { bands: [8, 8], act: 'look', lines: [{ fr: 'Avec Ilo, dans le hangar à navettes. On n’a pas le droit.', en: 'With Ilo, in the shuttle hangar. We’re not allowed.' }] },
      { bands: [9, 9], act: 'look', lines: [{ fr: 'Avec une étoile. Elle ne voulait pas rester ronde.', en: 'With a star. It wouldn’t stay round.' }] },
    ] },
    { key: 'rentres', when: { doing: ['home'], child: false }, you: { fr: 'Tu rentres déjà ?', en: 'Going home already?' }, replies: [
      { when: { period: P3 }, act: 'home', lines: [{ fr: 'Oui, je rentre. La soupe ne se fera pas toute seule.', en: 'Yes, I’m going home. The soup won’t make itself.' }] },
      { when: { period: VOUS }, act: 'home', lines: [{ fr: 'Oui, je rentre. J’ai les pieds en compote.', en: 'Yes, I’m going home. My feet are killing me.' }] },
      { when: { period: P10 }, act: 'home', lines: [{ fr: 'Oui, je rentre. Même nous, on rentre le soir.', en: 'Yes, I’m going home. Even we go home in the evening.' }] },
    ] },
    { key: 'travail', when: { doing: ['work'], child: false }, you: { fr: 'Tu vas au travail ?', en: 'Off to work?' }, replies: [
      { when: { period: P3 }, act: 'go', lines: [{ fr: 'Oui. Si j’arrive après le soleil, on me retient une part.', en: 'Yes. If I get there after sunrise, they keep back a share.' }] },
      { when: { period: VOUS }, act: 'go', lines: [{ fr: 'Oui. En retard, comme d’habitude.', en: 'Yes. Late, as usual.' }] },
      { when: { period: P10 }, act: 'go', lines: [{ fr: 'Oui. Les constantes ne se règlent pas toutes seules.', en: 'Yes. The constants don’t set themselves.' }] },
    ] },
    { key: 'faim', when: { cause: 'scarcity' }, you: { fr: 'Tu as de quoi manger, ces jours-ci ?', en: 'Do you have enough to eat these days?' }, replies: [
      { when: { child: true }, act: 'look', lines: [{ fr: 'Maman dit qu’on mangera mieux demain. Elle l’a dit hier aussi.', en: 'Mum says we’ll eat better tomorrow. She said that yesterday too.' }] },
      { bands: [1, 4], act: 'look', lines: [{ fr: 'Pas assez. Le grenier est vide depuis deux semaines.', en: 'Not enough. The granary’s been empty for two weeks.' }] },
      { bands: [5, 9], act: 'look', lines: [{ fr: 'Pas assez. Les rayons sont vides depuis lundi.', en: 'Not enough. The shelves have been empty since Monday.' }] },
    ] },
    { key: 'dos', when: { old: true }, you: { fr: 'Et ton dos, ça va ?', en: 'And your back, how is it?' }, replies: [
      { act: 'look', lines: [{ fr: 'Il tient. Il grince le matin, comme la porte.', en: 'It holds. It creaks in the morning, like the door.' }] },
    ] },
    { key: 'pluie', when: { precip: 'rain' }, you: { fr: 'Tu n’as pas froid, sous la pluie ?', en: 'Aren’t you cold in the rain?' }, replies: [
      { when: { child: true }, act: 'look', lines: [{ fr: 'Non. J’aime bien sauter dans les flaques.', en: 'No. I like jumping in the puddles.' }] },
      { act: 'go', lines: [{ fr: 'Si. Mais j’ai encore deux courses à faire.', en: 'I am. But I’ve still got two errands to run.' }] },
    ] },
    { key: 'dormi', you: { fr: 'Tu as bien dormi ?', en: 'Did you sleep well?' }, replies: [
      { when: { child: true }, bands: [1, 8], act: 'look', lines: [{ fr: 'J’ai fait un cauchemar avec un chien noir. Maman dit qu’il n’existe pas.', en: 'I had a nightmare about a black dog. Mum says it isn’t real.' }] },
      { when: { period: P3 }, act: 'look', lines: [{ fr: 'Non. Le chien du voisin a aboyé toute la nuit.', en: 'No. The neighbour’s dog barked all night.' }] },
      { when: { period: [4, 5] }, act: 'look', lines: [{ fr: 'Pas trop. Les cloches sonnent trop tôt.', en: 'Not really. The bells ring too early.' }] },
      { when: { period: [6, 7] }, act: 'look', lines: [{ fr: 'Quatre heures. Les voisins du dessus ont déménagé à minuit.', en: 'Four hours. The neighbours upstairs moved out at midnight.' }] },
      { when: { period: P8 }, act: 'look', lines: [{ fr: 'Je ne dors plus vraiment. On rêve tous ensemble, maintenant.', en: 'I don’t really sleep any more. We all dream together now.' }] },
      { when: { period: P9 }, act: 'look', lines: [{ fr: 'On dort par tranches, à bord. Celle-ci était bonne.', en: 'We sleep in shifts on board. This one was good.' }] },
      { when: { period: P10 }, act: 'look', lines: [{ fr: 'Je ne dors plus depuis trois siècles. Ça ne me manque pas.', en: 'I haven’t slept for three centuries. I don’t miss it.' }] },
    ] },
    // LA PROMESSE (§ 7.5) : elle se paie. S'il revient après trois jours d'absence au
    // moins, celui à qui il l'a dite s'en souvient, et la rue en parle (ci-dessous).
    { key: 'reviendrai', promise: true, you: { fr: 'Je reviendrai te voir.', en: 'I’ll come back to see you.' }, replies: [
      { when: { child: true }, bands: [1, 8], act: 'look', lines: [{ fr: 'Promis ? Tu reviens demain ?', en: 'Promise? Will you come back tomorrow?' }] },
      { when: { period: VOUS, trait: 'pious' }, act: 'look', lines: [{ fr: 'Je vous garderai une place à table, alors. Tous les soirs.', en: 'Then I’ll keep you a place at the table. Every evening.' }] },
      { when: { period: P3 }, act: 'look', lines: [{ fr: 'Quand ? Je passe ici tous les matins, à cette heure-ci.', en: 'When? I come by here every morning, at this time.' }] },
      { when: { period: VOUS }, act: 'look', lines: [{ fr: 'Je vous attendrai. Je passe ici tous les matins, à cette heure-ci.', en: 'I’ll wait for you. I come by here every morning, at this time.' }] },
      { when: { period: P10 }, act: 'look', lines: [{ fr: 'Je t’attendrai. Je ne bouge plus beaucoup, de toute façon.', en: 'I’ll wait for you. I don’t move around much these days anyway.' }] },
    ] },
    { key: 'mange', you: { fr: 'Tu as mangé, aujourd’hui ?', en: 'Have you eaten today?' }, replies: [
      { when: { child: true }, bands: [1, 8], act: 'look', lines: [{ fr: 'Une tartine. J’ai donné la croûte au chien.', en: 'A slice of bread. I gave the crust to the dog.' }] },
      { when: { period: P3 }, act: 'look', lines: [{ fr: 'Une galette et des noix. Ce soir, il y aura du poisson, si mon frère revient.', en: 'A flatbread and some nuts. Tonight there’ll be fish, if my brother comes back.' }] },
      { when: { period: [4, 5] }, bands: [3, 4], act: 'look', lines: [{ fr: 'Du pain, ce matin. Il était rassis.', en: 'Bread, this morning. It was stale.' }] },
      { when: { period: [5, 6] }, bands: [5, 5], act: 'look', lines: [{ fr: 'Un casse-croûte, debout, devant l’usine.', en: 'A sandwich, standing up, outside the factory.' }] },
      { when: { period: [6, 7] }, bands: [6, 6], act: 'look', lines: [{ fr: 'Un plat réchauffé, devant l’écran.', en: 'Something reheated, in front of the screen.' }] },
      { when: { period: P8 }, act: 'look', lines: [{ fr: 'On mange au jardin du toit, tous ensemble, à midi.', en: 'We eat in the roof garden, all together, at noon.' }] },
      { when: { period: P9 }, act: 'look', lines: [{ fr: 'Des rations, comme tout le monde à bord. Ça n’a le goût de rien.', en: 'Rations, like everyone on board. They taste of nothing.' }] },
      { when: { period: P10 }, act: 'look', lines: [{ fr: 'Je n’ai plus besoin de manger. Je le fais quand même, pour le goût.', en: 'I don’t need to eat any more. I do it anyway, for the taste.' }] },
    ] },
  ],

  // Quand on se tait.
  silence: [
    { when: { child: true }, bands: [1, 8], act: 'search', lines: [{ fr: 'Tu es parti ? Reviens.', en: 'Have you gone? Come back.' }] },
    { when: { period: P3 }, act: 'go', lines: [{ fr: 'Plus rien. J’ai dû l’imaginer.', en: 'Nothing more. I must have imagined it.' }] },
    { when: { period: VOUS }, act: 'go', lines: [{ fr: 'Vous ne dites plus rien. Bon.', en: 'You’re not saying anything more. Fine.' }] },
    { when: { period: P10 }, act: 'go', lines: [{ fr: 'Tu te tais. D’accord. Je repasserai.', en: 'You’re quiet. All right. I’ll come by again.' }] },
  ],
};

// ── CE QUE LA RUE EN DIT ─────────────────────────────────────────────────────────
// (Lues par l'écoute : elles vont dans PAROLES, paroles.js.) La cité retient à qui la voix
// a parlé et de quelle voix (core/paroles.js, `mots.said`) : on en parle en le NOMMANT
// ({temoin}, jamais celui qu'on écoute ni l'autre de la causette). `when.said` : une voix
// ('dieu', 'joueur', 'indifferent', 'vie', 'muet'), une réponse ('dieu:veille',
// 'vie:enfant'…) ou ce qu'elle affirmait ('test', 'guide', 'wait', 'joue', 'joue-pas').
// Couche 2 : ce qu'on a entendu dire ; couche 3 (`when.saidMost`, la voix qui domine dans
// la cité après trois échanges) : ce qu'on finit par croire d'elle.
// ⚠ Aucun accord qui suive le témoin : on ne sait pas d'avance si c'est un homme ou une
// femme (on répète son prénom plutôt qu'un pronom).
export const PAROLES_ECHOS_MOTS = [
  // ── la voix du dieu ──
  { id: 'em-dieu-seigneur', kind: 'thought', layer: 2, bands: [1, 5], when: { said: 'dieu' }, lines: [
    { who: 'a', fr: '{temoin} dit que la voix parle comme un seigneur. Je ne sais pas si c’est une bonne nouvelle.', en: '{temoin} says the voice talks like a lord. I don’t know if that’s good news.' },
  ] },
  { id: 'em-dieu-toit', kind: 'chat', layer: 2, bands: [1, 5], when: { said: 'dieu:veille' }, lines: [
    { who: 'a', fr: 'La voix a dit à {temoin} qu’elle veillait sur nous.', en: 'The voice told {temoin} it watches over us.' },
    { who: 'b', fr: 'Qu’elle veille, alors. Le toit du grenier fuit depuis l’automne.', en: 'Let it watch, then. The granary roof has leaked since autumn.' },
  ] },
  { id: 'em-dieu-murs', kind: 'thought', layer: 2, bands: [5, 9], when: { said: 'dieu:bati' }, lines: [
    { who: 'a', fr: 'La voix a dit à {temoin} qu’elle avait tout bâti. Depuis, {temoin} touche les murs en passant.', en: 'The voice told {temoin} it built everything. Since then {temoin} touches the walls when passing.' },
  ] },
  // ── la voix du joueur ──
  { id: 'em-joueur-osselets', kind: 'thought', layer: 2, bands: [1, 5], when: { said: 'joueur' }, lines: [
    { who: 'a', fr: '{temoin} dit que la voix joue avec nous, comme les enfants jouent aux osselets. Je n’aime pas ça.', en: '{temoin} says the voice plays with us, the way children play knucklebones. I don’t like it.' },
  ] },
  { id: 'em-joueur-quoi', kind: 'chat', layer: 2, bands: [1, 5], when: { said: 'joueur' }, lines: [
    { who: 'a', fr: '{temoin} dit que la voix joue.', en: '{temoin} says the voice is playing.' },
    { who: 'b', fr: 'Joue à quoi ?', en: 'Playing what?' },
    { who: 'a', fr: 'Elle n’a pas dit.', en: 'It didn’t say.' },
  ] },
  { id: 'em-joueur-partie', kind: 'thought', layer: 2, bands: [6, 9], when: { said: 'joueur' }, lines: [
    { who: 'a', fr: '{temoin} jure que la voix a parlé d’une partie. Raphaël va être content.', en: '{temoin} swears the voice talked about a game. Raphaël will be pleased.' },
  ] },
  { id: 'em-joueur-clic', kind: 'chat', layer: 2, bands: [6, 9], when: { said: 'joueur:clic' }, lines: [
    { who: 'a', fr: 'La voix a dit à {temoin} qu’elle avait cliqué dessus.', en: 'The voice told {temoin} it had clicked on them.' },
    { who: 'b', fr: 'Cliqué ? Comme sur un bouton ?', en: 'Clicked? Like a button?' },
    { who: 'a', fr: '{temoin} dit que ça chatouille.', en: '{temoin} says it tickles.' },
  ] },
  // ── la voix de l'indifférent ──
  { id: 'em-indiff-journee', kind: 'thought', layer: 2, bands: [1, 5], when: { said: 'indifferent' }, lines: [
    { who: 'a', fr: 'La voix a dit à {temoin} que ça n’avait pas d’importance. Ça m’a gâché la journée.', en: 'The voice told {temoin} it didn’t matter. It spoiled my day.' },
  ] },
  { id: 'em-indiff-route', kind: 'chat', layer: 2, bands: [5, 9], when: { said: 'indifferent:route' }, lines: [
    { who: 'a', fr: 'La voix a dit à {temoin} de continuer sa route.', en: 'The voice told {temoin} to go on their way.' },
    { who: 'b', fr: 'Et {temoin} a continué ?', en: 'And did {temoin} go on?' },
    { who: 'a', fr: 'Jusqu’au coin de la rue. Après, il a fallu s’asseoir.', en: 'As far as the corner. After that, they had to sit down.' },
  ] },
  // ── la voix qui demande des nouvelles ──
  { id: 'em-vie-voisine', kind: 'thought', layer: 2, bands: [1, 5], when: { said: 'vie' }, lines: [
    { who: 'a', fr: 'La voix a demandé des nouvelles à {temoin}. De sa famille, de son travail. Comme une voisine.', en: 'The voice asked {temoin} how things were. Family, work. Like a neighbour would.' },
  ] },
  { id: 'em-vie-prenoms', kind: 'chat', layer: 2, bands: [1, 5], when: { said: 'vie:enfant' }, lines: [
    { who: 'a', fr: 'La voix connaît le prénom des enfants de {temoin}.', en: 'The voice knows the names of {temoin}’s children.' },
    { who: 'b', fr: 'Comment elle sait ça ?', en: 'How does it know that?' },
    { who: 'a', fr: 'Elle regarde, je suppose.', en: 'It watches, I suppose.' },
  ] },
  { id: 'em-vie-mienne', kind: 'chat', layer: 2, bands: [6, 9], when: { said: 'vie' }, lines: [
    { who: 'a', fr: 'La voix demande des nouvelles des gens, maintenant.', en: 'The voice asks after people now.' },
    { who: 'b', fr: 'Des miennes aussi ?', en: 'After me too?' },
    { who: 'a', fr: 'Demande à {temoin}.', en: 'Ask {temoin}.' },
  ] },
  // ── son silence ──
  { id: 'em-muet-nuits', kind: 'thought', layer: 2, bands: [1, 5], when: { said: 'muet' }, lines: [
    { who: 'a', fr: '{temoin} a entendu la voix, puis plus rien. Ça fait deux nuits que {temoin} ne dort plus.', en: '{temoin} heard the voice, then nothing. {temoin} hasn’t slept for two nights.' },
  ] },
  { id: 'em-muet-ligne', kind: 'thought', layer: 2, bands: [6, 9], when: { said: 'muet' }, lines: [
    { who: 'a', fr: 'Paraît que la voix a parlé à {temoin}, puis s’est tue. Comme une ligne coupée.', en: 'Apparently the voice spoke to {temoin}, then went quiet. Like a cut line.' },
  ] },
  // ── ce qu'elle a dit d'elle-même ──
  { id: 'em-test-chambre', kind: 'thought', layer: 2, bands: [4, 5], when: { said: 'test' }, lines: [
    { who: 'a', fr: 'La voix a dit à {temoin} qu’elle faisait des essais avec nous. Depuis, mon frère range sa chambre.', en: 'The voice told {temoin} it was trying things out on us. Since then my brother tidies his room.' },
  ] },
  { id: 'em-guide-temple', kind: 'thought', layer: 2, bands: [4, 5], when: { said: 'guide' }, lines: [
    { who: 'a', fr: 'La voix a dit à {temoin} qu’elle nous guidait. Le prêtre l’a annoncé dimanche, au temple.', en: 'The voice told {temoin} it guides us. The priest announced it on Sunday, at the temple.' },
  ] },
  { id: 'em-attend-quoi', kind: 'chat', layer: 2, bands: [4, 5], when: { said: 'wait' }, lines: [
    { who: 'a', fr: 'Il paraît que la voix attend. Elle l’a dit à {temoin}.', en: 'Apparently the voice is waiting. It told {temoin}.' },
    { who: 'b', fr: 'Elle attend quoi ?', en: 'Waiting for what?' },
    { who: 'a', fr: 'Personne ne sait. Le prêtre non plus.', en: 'Nobody knows. Not even the priest.' },
  ] },
  { id: 'em-joue-bouteille', kind: 'thought', layer: 2, bands: [6, 6], when: { said: 'joue' }, lines: [
    { who: 'a', fr: 'La voix a dit à {temoin} qu’elle jouait. Raphaël a ouvert une bouteille.', en: 'The voice told {temoin} it was playing. Raphaël opened a bottle.' },
  ] },
  { id: 'em-joue-pas', kind: 'thought', layer: 2, bands: [6, 6], when: { said: 'joue-pas' }, lines: [
    { who: 'a', fr: 'La voix a dit à {temoin} qu’elle ne jouait pas. Raphaël a fait répéter {temoin} trois fois.', en: 'The voice told {temoin} it wasn’t playing. Raphaël made {temoin} say it three times.' },
  ] },
  // ── ce qu'on finit par croire d'elle (la voix qui domine dans la cité) ──
  { id: 'em-plus-dieu', kind: 'thought', layer: 3, bands: [1, 5], when: { saidMost: 'dieu' }, lines: [
    { who: 'a', fr: 'Ici, on dit que la voix parle comme un dieu. Ma mère se lève plus tôt pour balayer devant la porte.', en: 'Round here they say the voice talks like a god. My mother gets up earlier to sweep the doorstep.' },
  ] },
  { id: 'em-plus-dieu-x', kind: 'thought', layer: 3, bands: [6, 9], when: { saidMost: 'dieu' }, lines: [
    { who: 'a', fr: 'Paraît que la voix parle en maître. Mon voisin s’est remis à saluer tout le monde.', en: 'Apparently the voice talks like a master. My neighbour has started greeting everyone again.' },
  ] },
  { id: 'em-plus-vie', kind: 'thought', layer: 3, bands: [1, 5], when: { saidMost: 'vie' }, lines: [
    { who: 'a', fr: 'Depuis que la voix demande des nouvelles, ma voisine raconte sa journée tout haut, dans la rue, au cas où.', en: 'Since the voice started asking after people, my neighbour tells her day out loud in the street, just in case.' },
  ] },
  { id: 'em-plus-vie-x', kind: 'thought', layer: 3, bands: [6, 9], when: { saidMost: 'vie' }, lines: [
    { who: 'a', fr: 'Paraît que la voix demande comment on va. J’ai préparé une réponse, au cas où.', en: 'Apparently the voice asks how we are. I’ve got an answer ready, just in case.' },
  ] },
  { id: 'em-plus-joueur', kind: 'thought', layer: 3, bands: [1, 5], when: { saidMost: 'joueur', kids: true }, lines: [
    { who: 'a', fr: 'On dit que la voix joue. Mon fils joue aux dés tous les soirs, maintenant. Il dit qu’il s’entraîne.', en: 'They say the voice plays. My son plays dice every night now. He says he’s practising.' },
  ] },
  { id: 'em-plus-joueur-x', kind: 'thought', layer: 3, bands: [6, 9], when: { saidMost: 'joueur' }, lines: [
    { who: 'a', fr: 'Paraît que la voix joue. Je me demande à quel niveau on en est.', en: 'Apparently the voice is playing. I wonder what level we’re on.' },
  ] },
  // ── la promesse tenue, après trois jours d'absence au moins (`when.promised` : celui à
  //    qui elle a été faite ; `when.promise` : les autres, qui le nomment, {promis}) ──
  { id: 'em-promis-p3', kind: 'thought', layer: 3, bands: [1, 2], when: { promised: true, period: [3, 3], child: false }, lines: [
    { who: 'a', fr: 'Tu avais dit que tu reviendrais. Ça fait {jours} jours. Je venais ici chaque matin.', en: 'You said you’d come back. It’s been {jours} days. I came here every morning.' },
  ] },
  { id: 'em-promis-vous', kind: 'thought', layer: 3, bands: [3, 7], when: { promised: true, period: [4, 7], child: false }, lines: [
    { who: 'a', fr: 'Vous aviez dit que vous reviendriez. Ça fait {jours} jours. Je passais ici chaque matin.', en: 'You said you’d come back. It’s been {jours} days. I came by here every morning.' },
  ] },
  { id: 'em-promis-vous-x', kind: 'thought', layer: 3, bands: [7, 8], when: { promised: true, period: [8, 9], child: false }, lines: [
    { who: 'a', fr: 'Vous aviez dit que vous reviendriez. Il y a eu {jours} jours. Je les ai notés, un par un.', en: 'You said you’d come back. There have been {jours} days. I wrote them down, one by one.' },
  ] },
  { id: 'em-promis-p10', kind: 'thought', layer: 3, bands: [9, 9], when: { promised: true, period: [10, 10], child: false }, lines: [
    { who: 'a', fr: 'Tu avais dit que tu reviendrais. Ça fait {jours} jours, je les ai comptés.', en: 'You said you’d come back. It’s been {jours} days, I counted them.' },
  ] },
  { id: 'em-promis-enfant', kind: 'thought', layer: 3, bands: [1, 5], when: { promised: true, child: true }, lines: [
    { who: 'a', m: 'Tu avais promis. Ça fait {jours} jours. Je suis venu tous les jours.', f: 'Tu avais promis. Ça fait {jours} jours. Je suis venue tous les jours.', en: 'You promised. It’s been {jours} days. I came every day.' },
  ] },
  { id: 'em-promis-enfant-x', kind: 'thought', layer: 3, bands: [5, 9], when: { promised: true, child: true }, lines: [
    { who: 'a', fr: 'Tu avais promis. Ça fait {jours} jours. J’ai attendu à la fenêtre.', en: 'You promised. It’s been {jours} days. I waited at the window.' },
  ] },
  { id: 'em-promesse', kind: 'thought', layer: 2, bands: [1, 5], when: { promise: true }, lines: [
    { who: 'a', fr: 'La voix avait promis à {promis} de revenir. Elle a mis {jours} jours.', en: 'The voice promised {promis} it would come back. It took {jours} days.' },
  ] },
  { id: 'em-promesse-x', kind: 'chat', layer: 2, bands: [5, 9], when: { promise: true }, lines: [
    { who: 'a', fr: 'Tu te souviens de la voix qui avait promis de revenir ?', en: 'Remember the voice that promised to come back?' },
    { who: 'b', fr: 'À {promis}, oui.', en: 'To {promis}, yes.' },
    { who: 'a', fr: 'Elle est revenue, {jours} jours après.', en: 'It came back, {jours} days later.' },
  ] },
  { id: 'em-plus-indiff', kind: 'thought', layer: 3, bands: [2, 6], when: { saidMost: 'indifferent' }, lines: [
    { who: 'a', fr: 'Tout le monde le dit : la voix se moque de ce qui nous arrive. Je ferme quand même ma porte à clé.', en: 'Everyone says so: the voice doesn’t care what happens to us. I still lock my door.' },
  ] },
];
