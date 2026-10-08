"use strict";

// LA VEILLÉE, LE DÉCLIC, LES DEMANDES (docs/PLAN-ECOUTER-PARLER.md, lot 5).
//
// Données pures, dans la plume de paroles.js. Aux deux premières périodes de la gazette,
// Claude, le gardien du feu de la Chronique, veille chaque nuit au foyer du camp avec un
// habitant (paroles/veillee.js). La première fois que le joueur écoute leur causette, dans
// une cité, c'est LE DÉCLIC (§ 7.1) : « Tu crois que le feu nous entend ? » « Le feu,
// non. » Claude se lève : « Mais quelqu'un écoute. » Dès lors, des passants DEMANDENT un
// signe dans leurs pensées (`request`) ; le joueur y répond, ou non.
//
//   PAROLES_VEILLEE   ce qu'on entend (genres 'chat' et 'thought', l'écoute les lit) : ses
//                     pensées à lui, leurs causettes de veillée (`when.veillee` ; Claude
//                     y est toujours `a`, l'autre `b`), le déclic (`forced`, jamais tiré :
//                     il vient), les demandes, et ce que la rue dit de tout ça ;
//   SIGNES_CLAUDE     ce que pense Claude d'un signe qu'on lui fait (il sait qui c'est) ;
//   PAROLES_REPONSES  ce que pense celui qui avait demandé un signe (genre 'sign',
//                     `answer`) : 'yes' il l'a eu, 'other' un autre (il l'interprète,
//                     parfois de travers), 'none' rien (« Comme d'habitude. »).
// Conditions propres : when.veillee (la causette de la veillée), when.declic (le déclic a
// eu lieu dans cette cité, ou pas), when.declics (dans au moins n cités : Claude se
// souvient), when.fire (un feu près de lui : on ne demande que ce qu'on peut voir),
// when.asked (le signe qu'il avait demandé), when.dry (ni pluie ni neige). Ni tiret, ni « ! », ni points de
// suspension ; l'apostrophe typographique.

const FEU = [0, 1];
const P12 = [1, 2];   // les périodes de la gazette où le dialogue se fait par signes

export const VEILLEE_JOB = 'firekeeper';

export const PAROLES_VEILLEE = [
  // ── LE DÉCLIC (§ 7.1) : la première cité, puis les suivantes (Claude se souvient) ──
  { id: 'v-declic', kind: 'chat', layer: 3, bands: FEU, forced: 'declic', when: { veillee: true }, lines: [
    { who: 'b', fr: 'Tu crois que le feu nous entend ?', en: 'Do you think the fire can hear us?' },
    { who: 'a', fr: 'Le feu, non.', en: 'The fire? No.' },
    { who: 'a', fr: 'Mais quelqu’un écoute.', en: 'But someone is listening.' },
  ] },
  { id: 'v-declic-encore', kind: 'chat', layer: 3, bands: FEU, forced: 'declic', when: { veillee: true }, lines: [
    { who: 'b', fr: 'Tu crois que le feu nous entend ?', en: 'Do you think the fire can hear us?' },
    { who: 'a', fr: 'Le feu, non.', en: 'The fire? No.' },
    { who: 'a', fr: 'Mais quelqu’un écoute. Il écoutait déjà, à l’autre feu.', en: 'But someone is listening. He was listening already, at the other fire.' },
  ] },

  // ── Claude, ses pensées ──
  { id: 'v-t-bois', kind: 'thought', layer: 1, bands: FEU, when: { job: [VEILLEE_JOB] }, lines: [
    { who: 'a', fr: 'Trois brassées pour la nuit. Le bois du fond est encore humide de la pluie d’hier.', en: 'Three armfuls for the night. The wood at the back is still damp from yesterday’s rain.' },
  ] },
  { id: 'v-t-jeunes', kind: 'thought', layer: 1, bands: FEU, when: { job: [VEILLEE_JOB] }, lines: [
    { who: 'a', fr: 'Les jeunes croient que le feu se garde tout seul. Je les ai vus dormir à côté jusqu’aux braises.', en: 'The young ones think a fire keeps itself. I’ve seen them sleep beside it till it was down to embers.' },
  ] },
  { id: 'v-t-gel', kind: 'thought', layer: 1, bands: FEU, when: { job: [VEILLEE_JOB] }, lines: [
    { who: 'a', fr: 'Je garde ce feu depuis l’hiver où la rivière a gelé. Personne ne le gardait avant moi.', en: 'I’ve kept this fire since the winter the river froze. Nobody kept it before me.' },
  ] },
  { id: 'v-t-nuits', kind: 'thought', layer: 1, bands: FEU, when: { job: [VEILLEE_JOB], season: 'winter' }, lines: [
    { who: 'a', fr: 'Les nuits sont longues en ce moment. Il faudra plus de bois demain.', en: 'The nights are long just now. We’ll need more wood tomorrow.' },
  ] },
  { id: 'v-t-pluie', kind: 'thought', layer: 1, bands: FEU, when: { job: [VEILLEE_JOB], precip: 'rain' }, lines: [
    { who: 'a', fr: 'Il pleut sur le bois de réserve. J’aurais dû le rentrer sous la peau de bison.', en: 'It’s raining on the spare wood. I should have put it under the bison hide.' },
  ] },
  { id: 'v-t-dos', kind: 'thought', layer: 1, bands: FEU, when: { job: [VEILLEE_JOB] }, lines: [
    { who: 'a', fr: 'Mon dos me tire depuis la dernière lune. Je m’assois plus près des pierres chaudes.', en: 'My back has been pulling since the last moon. I sit closer to the warm stones.' },
  ] },
  { id: 'v-t-silex', kind: 'thought', layer: 1, bands: FEU, when: { job: [VEILLEE_JOB], article: ['p1_knowledge_stones'] }, lines: [
    { who: 'a', fr: 'Garin dit qu’avec deux silex on fait du feu quand on veut. Qu’il essaie, une nuit de pluie.', en: 'Garin says two flints will make a fire whenever you like. Let him try it on a rainy night.' },
  ] },
  { id: 'v-t-ecoute', kind: 'thought', layer: 3, bands: FEU, when: { job: [VEILLEE_JOB], declic: true }, lines: [
    { who: 'a', fr: 'Il écoute encore ce soir. Je mets une bûche de plus, pour qu’il voie.', en: 'He’s listening again tonight. I put on one more log so he can see.' },
  ] },
  { id: 'v-t-ce-quil-veut', kind: 'thought', layer: 3, bands: FEU, when: { job: [VEILLEE_JOB], declic: true }, lines: [
    { who: 'a', fr: 'On me demande ce qu’il veut, celui qui écoute. Je n’en sais rien. Je garde le feu.', en: 'They ask me what he wants, the one who listens. I don’t know. I keep the fire.' },
  ] },
  { id: 'v-t-ailleurs', kind: 'thought', layer: 3, bands: FEU, when: { job: [VEILLEE_JOB], declics: 2 }, lines: [
    { who: 'a', fr: 'J’ai déjà gardé un feu comme celui-ci. La rivière passait de l’autre côté. Il écoutait déjà.', en: 'I’ve kept a fire like this one before. The river ran on the other side. He was listening then too.' },
  ] },

  // ── La veillée : Claude (a) et celui qui veille avec lui (b) ──
  { id: 'v-c-pluie', kind: 'chat', layer: 1, bands: FEU, when: { veillee: true, dry: true }, lines: [
    { who: 'b', fr: 'Tu crois qu’il va pleuvoir ?', en: 'Do you think it’ll rain?' },
    { who: 'a', fr: 'Pas cette nuit. La fumée monte droit.', en: 'Not tonight. The smoke’s going straight up.' },
  ] },
  { id: 'v-c-dormir', kind: 'chat', layer: 1, bands: FEU, when: { veillee: true }, lines: [
    { who: 'b', fr: 'Tu dors quand, toi ?', en: 'When do you sleep?' },
    { who: 'a', fr: 'Quand le soleil se lève. Le feu n’a pas besoin de moi le jour.', en: 'When the sun comes up. The fire doesn’t need me in the day.' },
  ] },
  { id: 'v-c-bois', kind: 'chat', layer: 1, bands: FEU, when: { veillee: true }, lines: [
    { who: 'b', fr: 'Il reste assez de bois pour la nuit ?', en: 'Is there enough wood for the night?' },
    { who: 'a', fr: 'Deux brassées derrière la hutte. Si tu as froid, va en chercher une.', en: 'Two armfuls behind the hut. If you’re cold, go and fetch one.' },
  ] },
  { id: 'v-c-renard', kind: 'chat', layer: 1, bands: FEU, when: { veillee: true }, lines: [
    { who: 'b', fr: 'J’ai entendu quelque chose, du côté de la rivière.', en: 'I heard something, over by the river.' },
    { who: 'a', fr: 'Un renard. Les loups ne descendent pas tant qu’il y a des flammes.', en: 'A fox. Wolves don’t come down while there are flames.' },
  ] },
  { id: 'v-c-etoiles', kind: 'chat', layer: 1, bands: FEU, when: { veillee: true, dry: true }, lines: [
    { who: 'b', fr: 'Tu les connais, toi, les étoiles ?', en: 'Do you know the stars?' },
    { who: 'a', fr: 'Celles du chasseur. Quand elles passent au-dessus de la colline, l’hiver arrive.', en: 'The hunter’s ones. When they come over the hill, winter’s on its way.' },
  ] },
  { id: 'v-c-dents', kind: 'chat', layer: 1, bands: FEU, when: { veillee: true }, lines: [
    { who: 'b', fr: 'Les petits dorment enfin. Le dernier a pleuré jusqu’au lever de la lune.', en: 'The little ones are finally asleep. The youngest cried until the moon came up.' },
    { who: 'a', fr: 'Il fait ses dents. Donne-lui de l’écorce de saule à mâcher demain.', en: 'He’s teething. Give him some willow bark to chew tomorrow.' },
  ] },
  { id: 'v-c-pieds', kind: 'chat', layer: 1, bands: FEU, when: { veillee: true, season: 'winter' }, lines: [
    { who: 'b', fr: 'Je ne sens plus mes pieds.', en: 'I can’t feel my feet.' },
    { who: 'a', fr: 'Approche-les. Pas dans les braises, plus près.', en: 'Bring them in. Not into the embers, just closer.' },
  ] },
  { id: 'v-c-pourquoi', kind: 'chat', layer: 1, bands: FEU, when: { veillee: true, declic: false }, lines: [
    { who: 'b', fr: 'Pourquoi tu restes là toute la nuit ?', en: 'Why do you stay out here all night?' },
    { who: 'a', fr: 'Si le feu meurt, il faut le rallumer. Une demi-journée à frotter du bois.', en: 'If the fire dies, someone has to light it again. Half a day rubbing sticks.' },
  ] },
  { id: 'v-c-lui-parler', kind: 'chat', layer: 3, bands: FEU, when: { veillee: true, declic: true }, lines: [
    { who: 'b', fr: 'Tu lui parles, toi, à celui qui écoute ?', en: 'Do you talk to him, the one who listens?' },
    { who: 'a', fr: 'Non. Je mets une bûche de plus, le soir. Il voit mieux.', en: 'No. I put on one more log in the evening. He can see better.' },
  ] },
  { id: 'v-c-ou', kind: 'chat', layer: 3, bands: FEU, when: { veillee: true, declic: true }, lines: [
    { who: 'b', fr: 'Il est où, celui qui écoute ?', en: 'Where is he, the one who listens?' },
    { who: 'a', fr: 'Au-dessus du camp. Quand je lève les yeux, il est là.', en: 'Above the camp. When I look up, he’s there.' },
  ] },
  { id: 'v-c-repondu', kind: 'chat', layer: 3, bands: FEU, when: { veillee: true, declic: true, seen: 'answered' }, lines: [
    { who: 'b', fr: 'Et s’il ne répond jamais ?', en: 'And what if he never answers?' },
    { who: 'a', fr: 'Il a répondu à {temoin}. Je l’ai vu de mes yeux.', en: 'He answered {temoin}. I saw it with my own eyes.' },
  ] },
  { id: 'v-c-autre-feu', kind: 'chat', layer: 3, bands: FEU, when: { veillee: true, declic: true, declics: 2 }, lines: [
    { who: 'b', fr: 'Tu dis que tu l’as déjà vu, celui qui écoute. Où ça ?', en: 'You say you’ve seen him before, the one who listens. Where?' },
    { who: 'a', fr: 'À un autre feu. La rivière était à gauche, pas à droite.', en: 'At another fire. The river was on the left, not the right.' },
  ] },

  // ── Les demandes (§ 7.1) : « Si tu m'entends, fais monter le feu. » ──
  { id: 'v-d-feu', kind: 'thought', layer: 2, bands: FEU, request: 'fire', when: { declic: true, period: P12, fire: true }, lines: [
    { who: 'a', fr: 'Si tu m’entends, fais monter le feu.', en: 'If you can hear me, make the fire rise.' },
  ] },
  { id: 'v-d-feu-grandmere', kind: 'thought', layer: 2, bands: FEU, request: 'fire', when: { declic: true, period: P12, fire: true, trait: 'pious' }, lines: [
    { who: 'a', fr: 'Grand-mère, si c’est toi qui écoutes, fais monter le feu.', en: 'Grandmother, if it’s you listening, make the fire rise.' },
  ] },
  { id: 'v-d-feu-voyons', kind: 'thought', layer: 2, bands: FEU, request: 'fire', when: { declic: true, period: P12, fire: true, trait: 'curious' }, lines: [
    { who: 'a', fr: 'Claude dit que quelqu’un écoute. Voyons. Fais monter le feu, si tu es là.', en: 'Claude says someone is listening. Let’s see. Make the fire rise, if you’re there.' },
  ] },
  { id: 'v-d-feu-finir', kind: 'thought', layer: 2, bands: FEU, request: 'fire', when: { declic: true, period: P12, fire: true, trait: 'grumpy' }, lines: [
    { who: 'a', fr: 'Si tu écoutes vraiment, fais monter le feu, qu’on en finisse.', en: 'If you’re really listening, make the fire go up and let’s be done with it.' },
  ] },
  { id: 'v-d-vent', kind: 'thought', layer: 2, bands: FEU, request: 'wind', when: { declic: true, period: P12 }, lines: [
    { who: 'a', fr: 'Si quelqu’un m’écoute, qu’il fasse souffler le vent. Juste sur moi.', en: 'If someone is listening, let them make the wind blow. Just on me.' },
  ] },
  { id: 'v-d-vent-peur', kind: 'thought', layer: 2, bands: FEU, request: 'wind', when: { declic: true, period: P12, trait: 'superstitious' }, lines: [
    { who: 'a', fr: 'Je ne devrais pas demander. Mais si tu m’entends, le vent, juste un peu.', en: 'I shouldn’t ask. But if you can hear me, the wind, just a little.' },
  ] },
  { id: 'v-d-vent-enfant', kind: 'thought', layer: 2, bands: FEU, request: 'wind', when: { declic: true, period: P12, child: true }, lines: [
    { who: 'a', fr: 'Fais souffler le vent. S’il te plaît. Personne ne le saura.', en: 'Make the wind blow. Please. Nobody will know.' },
  ] },
  { id: 'v-d-soleil', kind: 'thought', layer: 2, bands: FEU, request: 'light', when: { declic: true, period: P12, night: false }, lines: [
    { who: 'a', fr: 'Si tu es là, envoie-moi un peu de soleil. Rien qu’un peu.', en: 'If you’re there, send me a bit of sun. Just a little.' },
  ] },
  { id: 'v-d-soleil-froid', kind: 'thought', layer: 2, bands: FEU, request: 'light', when: { declic: true, period: P12, night: false, trait: 'chilly' }, lines: [
    { who: 'a', fr: 'J’ai les mains gelées. Si tu es là, un peu de soleil sur moi.', en: 'My hands are frozen. If you’re there, a bit of sun on me.' },
  ] },
  { id: 'v-d-lune', kind: 'thought', layer: 2, bands: FEU, request: 'light', when: { declic: true, period: P12, night: true }, lines: [
    { who: 'a', fr: 'Si tu es là, montre-moi la lune. Rien que pour moi.', en: 'If you’re there, show me the moon. Just for me.' },
  ] },

  // ── Ce que la rue en dit ──
  { id: 'v-e-claude', kind: 'chat', layer: 2, bands: FEU, when: { declic: true }, lines: [
    { who: 'a', fr: 'Claude dit que quelqu’un écoute, la nuit, près du feu.', en: 'Claude says someone listens at night, by the fire.' },
    { who: 'b', fr: 'Il veille seul depuis trop longtemps. Je lui porterai du bouillon demain.', en: 'He’s kept watch alone too long. I’ll take him some broth tomorrow.' },
  ] },
  { id: 'v-e-mere', kind: 'thought', layer: 2, bands: FEU, when: { declic: true }, lines: [
    { who: 'a', fr: 'Depuis que Claude a parlé de celui qui écoute, ma mère ne dit plus rien de méchant après le coucher du soleil.', en: 'Since Claude talked about the one who listens, my mother says nothing nasty after sunset.' },
  ] },
  { id: 'v-e-repondu', kind: 'chat', layer: 2, bands: FEU, when: { seen: 'answered' }, lines: [
    { who: 'a', fr: '{temoin} a demandé un signe, tout à l’heure.', en: '{temoin} asked for a sign earlier.' },
    { who: 'b', fr: 'Et alors ?', en: 'And?' },
    { who: 'a', fr: 'Et le signe est venu.', en: 'And the sign came.' },
  ] },
  { id: 'v-e-mon-tour', kind: 'thought', layer: 2, bands: FEU, when: { seen: 'answered' }, lines: [
    { who: 'a', fr: 'Si {temoin} a eu son signe, je peux bien demander le mien.', en: 'If {temoin} got a sign, I can ask for mine.' },
  ] },
];

// ── UN SIGNE À CLAUDE : il sait qui c'est ─────────────────────────────────────────
// (Le geste, `act`, comme au lot 4 bis ; il ne quitte pas son feu.)
export const SIGNES_CLAUDE = [
  { id: 'v-s-feu', stage: 1, sign: 'fire', bands: FEU, act: 'look', when: { job: [VEILLEE_JOB] }, lines: [{ who: 'a', fr: 'Le feu monte. Je sais que c’est toi.', en: 'The fire rises. I know it’s you.' }] },
  { id: 'v-s-vent', stage: 1, sign: 'wind', bands: FEU, act: 'look', when: { job: [VEILLEE_JOB] }, lines: [{ who: 'a', fr: 'Doucement avec le vent. Il y a des braises partout.', en: 'Easy with the wind. There are embers everywhere.' }] },
  { id: 'v-s-lumiere', stage: 1, sign: 'light', bands: FEU, act: 'look', when: { job: [VEILLEE_JOB] }, lines: [{ who: 'a', fr: 'Pas la peine de m’éclairer. Je sais que tu es là.', en: 'No need to light me up. I know you’re there.' }] },
  { id: 'v-s-bete', stage: 1, sign: 'beast', bands: FEU, act: 'look', when: { job: [VEILLEE_JOB] }, lines: [{ who: 'a', fr: '{Bete} me fixe depuis tout à l’heure. Tu n’y es pas pour rien.', en: '{Bete} has been staring at me for a while. That’s your doing.' }] },
  { id: 'v-s-deux', stage: 2, bands: FEU, act: 'look', when: { job: [VEILLEE_JOB] }, lines: [{ who: 'a', fr: 'Ne fais pas peur aux autres. Ils n’ont pas l’habitude.', en: 'Don’t frighten the others. They’re not used to it.' }] },
  { id: 'v-s-assez', stage: 3, bands: FEU, act: 'look', when: { job: [VEILLEE_JOB] }, lines: [{ who: 'a', fr: 'Ça suffit. Les autres dorment, tu vas les réveiller.', en: 'That’s enough. The others are asleep, you’ll wake them.' }] },
];

// ── CE QU'IL PENSE DE LA RÉPONSE ─────────────────────────────────────────────────
// Le geste (`act`) comme au lot 4 bis : la pensée l'annonce, il le fait.
export const PAROLES_REPONSES = [
  // Il a eu le signe qu'il demandait.
  { id: 'v-r-oui-feu', answer: 'yes', sign: 'fire', bands: FEU, act: 'look', lines: [{ who: 'a', fr: 'Le feu a monté. Il m’a entendu.', en: 'The fire went up. He heard me.' }] },
  { id: 'v-r-oui-vent', answer: 'yes', sign: 'wind', bands: FEU, act: 'look', lines: [{ who: 'a', fr: 'Le vent, sur moi seul. Il m’a entendu.', en: 'The wind, on me alone. He heard me.' }] },
  { id: 'v-r-oui-soleil', answer: 'yes', sign: 'light', bands: FEU, act: 'look', when: { night: false }, lines: [{ who: 'a', fr: 'Le soleil, rien que sur moi. Il m’a entendu.', en: 'The sun, just on me. He heard me.' }] },
  { id: 'v-r-oui-lune', answer: 'yes', sign: 'light', bands: FEU, act: 'look', when: { night: true }, lines: [{ who: 'a', fr: 'La lune, rien que sur moi. Il m’a entendu.', en: 'The moon, just on me. He heard me.' }] },
  { id: 'v-r-oui-genoux', answer: 'yes', bands: FEU, act: 'kneel', when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Il m’a entendu. Je me mets à genoux, là, devant tout le monde.', en: 'He heard me. I go down on my knees, right here, in front of everyone.' }] },
  { id: 'v-r-oui-peur', answer: 'yes', bands: FEU, act: 'flee', when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Il a répondu. Je n’aurais jamais dû demander. Je cours à l’abri.', en: 'He answered. I should never have asked. I’m running for shelter.' }] },
  { id: 'v-r-oui-encore', answer: 'yes', bands: FEU, act: 'search', when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Il a répondu. Il est où, celui-là ? Je ne vois personne.', en: 'He answered. Where is he? I can’t see anyone.' }] },
  { id: 'v-r-oui-maman', answer: 'yes', bands: FEU, act: 'parent', when: { child: true }, lines: [{ who: 'a', fr: 'Il m’a répondu, à moi. Je cours le dire à maman.', en: 'He answered me. Me. I’m running to tell Mum.' }] },
  { id: 'v-r-oui-bon', answer: 'yes', bands: FEU, act: 'look', when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Bon. Il a répondu. Et maintenant, je fais quoi ?', en: 'Right. He answered. And now what do I do?' }] },
  { id: 'v-r-oui-signe', answer: 'yes', bands: FEU, act: 'wave', when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Il m’a répondu. Je lui fais signe, au cas où il regarde encore.', en: 'He answered me. I wave, in case he’s still looking.' }] },
  // Un autre signe que celui qu'il demandait : il l'interprète, parfois de travers.
  { id: 'v-r-autre', answer: 'other', bands: FEU, act: 'look', lines: [{ who: 'a', fr: 'J’ai demandé une chose, il en a fait une autre. Je ne sais pas ce que ça veut dire.', en: 'I asked for one thing and he did another. I don’t know what it means.' }] },
  { id: 'v-r-feu-vent', answer: 'other', sign: 'wind', bands: FEU, act: 'look', when: { asked: 'fire' }, lines: [{ who: 'a', fr: 'J’ai demandé le feu, il m’envoie le vent. Ça veut dire non ?', en: 'I asked for the fire and he sends me the wind. Does that mean no?' }] },
  { id: 'v-r-feu-lumiere', answer: 'other', sign: 'light', bands: FEU, act: 'search', when: { asked: 'fire' }, lines: [{ who: 'a', fr: 'J’ai demandé le feu, et c’est la lumière qui vient. Il veut que je regarde ailleurs.', en: 'I asked for the fire, and it’s the light that comes. He wants me to look somewhere else.' }] },
  { id: 'v-r-feu-bete', answer: 'other', sign: 'beast', bands: FEU, act: 'look', when: { asked: 'fire' }, lines: [{ who: 'a', fr: 'J’ai demandé le feu. C’est {bete} qui me regarde, maintenant.', en: 'I asked for the fire. Now it’s {bete} staring at me.' }] },
  { id: 'v-r-vent-feu', answer: 'other', sign: 'fire', bands: FEU, act: 'back', when: { asked: 'wind' }, lines: [{ who: 'a', fr: 'Je voulais le vent, c’est le feu qui monte. Je recule, au cas où.', en: 'I wanted the wind and it’s the fire that rises. I step back, just in case.' }] },
  { id: 'v-r-lumiere-autre', answer: 'other', bands: FEU, act: 'look', when: { asked: 'light' }, lines: [{ who: 'a', fr: 'Je voulais un peu de lumière. Il a fait autre chose. Il a ses idées.', en: 'I wanted a little light. He did something else. He has his own ideas.' }] },
  { id: 'v-r-autre-pieux', answer: 'other', bands: FEU, act: 'look', when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ce n’est pas ce que j’ai demandé. Ce n’est pas à moi de choisir.', en: 'That isn’t what I asked for. It isn’t for me to choose.' }] },
  { id: 'v-r-autre-peur', answer: 'other', bands: FEU, act: 'home', when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Ce n’est pas ce que j’ai demandé. C’est mauvais signe. Je rentre.', en: 'That isn’t what I asked for. It’s a bad sign. I’m going home.' }] },
  // Rien.
  { id: 'v-r-rien', answer: 'none', bands: FEU, act: 'go', lines: [{ who: 'a', fr: 'Comme d’habitude.', en: 'Same as always.' }] },
  { id: 'v-r-rien-savais', answer: 'none', bands: FEU, act: 'go', when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Comme d’habitude. Je le savais.', en: 'Same as always. I knew it.' }] },
  { id: 'v-r-rien-dort', answer: 'none', bands: FEU, act: 'go', when: { child: true }, lines: [{ who: 'a', fr: 'Comme d’habitude. Il dort, peut-être.', en: 'Same as always. Maybe he’s asleep.' }] },
  { id: 'v-r-rien-pieux', answer: 'none', bands: FEU, act: 'go', when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Comme d’habitude. Il a d’autres feux à regarder.', en: 'Same as always. He has other fires to watch.' }] },
];
