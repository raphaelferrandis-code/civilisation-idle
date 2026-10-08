"use strict";

// LE GRAND RESET DANS LA FICTION (docs/PLAN-ECOUTER-PARLER.md, lot 7, § 7.5).
//
// Ce que la rue en dit, de chaque côté du Grand Reset (lu par l'écoute : dans PAROLES,
// paroles.js). Claude, lui, a ses mots dans parolesVeillee.js (au feu du camp) et
// parolesFigures.js (dans la rue).
//   AVANT (`when.resetReady` : un sceau est prêt, le joueur peut tout effacer) : la cité le
//   pressent, chaque âge avec ce qu'il a sous la main (une pierre à feu, un registre, des
//   papiers, le chœur, les archives de l'Amas).
//   APRÈS (`when.afterReset` : la première cité d'un monde refait, au camp) : on rêve de
//   l'ancien monde sans savoir ce que c'est.
// La plume de paroles.js : du concret, ni maxime ni bon mot de fin. Ni tiret, ni « ! », ni
// points de suspension ; l'apostrophe typographique.

const FEU = [0, 1];

export const PAROLES_RESET = [
  // ── AVANT : la cité le pressent ──
  { id: 'r-presage-pierre', kind: 'thought', layer: 2, bands: FEU, when: { resetReady: true }, lines: [
    { who: 'a', fr: 'Les anciens disent qu’un jour tout recommencera au bord de la rivière. J’ai mis de côté une pierre à feu, au cas où.', en: 'The elders say one day everything will start again by the river. I’ve put a fire stone aside, just in case.' },
  ] },
  { id: 'r-presage-table', kind: 'thought', layer: 2, bands: [2, 4], when: { resetReady: true }, lines: [
    { who: 'a', fr: 'Le prêtre dit qu’un jour tout sera effacé, même les registres. J’ai gravé mon nom sous la table de la cuisine.', en: 'The priest says one day everything will be erased, even the registers. I carved my name under the kitchen table.' },
  ] },
  { id: 'r-presage-copie', kind: 'thought', layer: 2, bands: [5, 6], when: { resetReady: true }, lines: [
    { who: 'a', fr: 'On dit au bureau qu’une remise à zéro se prépare. J’ai fait une copie de mes papiers et je l’ai enterrée dans le jardin.', en: 'At the office they say a reset is coming. I made a copy of my papers and buried it in the garden.' },
  ] },
  { id: 'r-presage-choeur', kind: 'thought', layer: 2, bands: [7, 7], when: { resetReady: true }, lines: [
    { who: 'a', fr: 'Le chœur répète un mot qu’il ne connaît pas : recommencer. Je l’entends même en dormant.', en: 'The choir keeps repeating a word it doesn’t know: begin again. I hear it even in my sleep.' },
  ] },
  { id: 'r-presage-braise', kind: 'thought', layer: 2, bands: [8, 9], when: { resetReady: true }, lines: [
    { who: 'a', fr: 'Les archives annoncent la fin d’un cycle. On dit que ceux qui recommencent gardent une braise. Je cherche où ils la mettent.', en: 'The archives announce the end of a cycle. They say those who begin again keep an ember. I’m looking for where they keep it.' },
  ] },
  { id: 'r-presage-chat', kind: 'chat', layer: 2, bands: [2, 6], when: { resetReady: true }, lines: [
    { who: 'a', fr: 'Tu as remarqué ? Les vieux rangent leurs affaires comme avant un long voyage.', en: 'Have you noticed? The old folk are packing their things as if for a long journey.' },
    { who: 'b', fr: 'Ma mère a cousu ses économies dans l’ourlet de sa robe.', en: 'My mother has sewn her savings into the hem of her dress.' },
    { who: 'a', fr: 'Pour aller où ?', en: 'To go where?' },
    { who: 'b', fr: 'Elle ne sait pas. Elle dit que ça recommence.', en: 'She doesn’t know. She says it’s starting over.' },
  ] },

  // ── APRÈS : la première cité d'un monde refait rêve de l'ancien ──
  { id: 'r-reve-pierre', kind: 'thought', layer: 2, bands: FEU, when: { afterReset: true }, lines: [
    { who: 'a', fr: 'J’ai rêvé de maisons de pierre plus hautes que les arbres. Je ne sais pas à quoi ça sert, une maison de pierre.', en: 'I dreamt of stone houses taller than the trees. I don’t know what a stone house is for.' },
  ] },
  { id: 'r-reve-sentier', kind: 'thought', layer: 2, bands: FEU, when: { afterReset: true }, lines: [
    { who: 'a', fr: 'Ce sentier, je suis sûr de l’avoir déjà pris. Je ne suis jamais venu par ici.', en: 'I’m sure I’ve walked this path before. I’ve never been out this way.' },
  ] },
  { id: 'r-reve-lumiere', kind: 'thought', layer: 2, bands: FEU, when: { afterReset: true }, lines: [
    { who: 'a', fr: 'Cette nuit, tout le camp a rêvé d’une lumière qui s’éteignait. Au matin, personne n’en a parlé.', en: 'Last night the whole camp dreamt of a light going out. In the morning nobody mentioned it.' },
  ] },
  { id: 'r-reve-chat', kind: 'chat', layer: 2, bands: FEU, when: { afterReset: true }, lines: [
    { who: 'a', fr: 'Tu as rêvé, cette nuit ?', en: 'Did you dream last night?' },
    { who: 'b', fr: 'D’une ville immense. Et toi ?', en: 'Of a huge city. And you?' },
    { who: 'a', fr: 'De la même. Je n’ose pas le dire aux autres.', en: 'The same one. I don’t dare tell the others.' },
  ] },
];
