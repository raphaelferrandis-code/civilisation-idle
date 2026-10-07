"use strict";

// ÉCOUTER — ce que disent les habitants (docs/PLAN-ECOUTER-PARLER.md, lot 1).
//
// Données pures. Deux genres :
//   · 'chat'    : une CAUSETTE entre deux passants (`a` = celui qu'on écoute, `b` =
//                 l'autre ; `parent` / `kid` quand ils sont parent et enfant) ;
//   · 'thought' : une PENSÉE, celle du passant désigné (Raph : « dès le début le
//                 joueur peut regarder les pensées de tout le monde »).
// Deux couches au lot 1 : 1 = sa vie (sa famille, son métier, son caractère),
// 2 = la cité telle qu'elle va (ce qui pèse sur elle, le temps, la nuit, l'émeute,
// la merveille, l'âge). La troisième, ce qu'ils disent du joueur, est au lot 2.
//
// Une entrée : { id, kind, layer, bands: [min, max] (âges 0 Feu … 9 Démiurge, tous
// par défaut), when: { … } (toutes requises), lines: [ … ] }. `adult: true` : jamais
// dans la bouche d'un enfant, ni d'un adulte qui parle à un enfant (la paie, le guichet).
//   when.rel     'couple' | 'parentKid'  — le lien entre les deux (causette)
//   when.family  'married' | 'single' | 'child' | 'elder' | 'lodger' — sa place au foyer
//   when.kids    true — il a des enfants
//   when.job     [groupes de métier] (JOB_GROUP) — celui qu'on écoute
//   when.trait   clé de caractère (citizenIdentity.TRAITS) — celui qu'on écoute
//   when.traitB  clé de caractère de l'autre (causette)
//   when.old     true — un ancien (place d'aïeul, ou dessin aux cheveux blancs)
//   when.child   true | false — un enfant
//   when.cause   ce qui pèse le plus sur la cité (le même calcul que la cause de
//                l'humeur : scarcity, inequality, complexity, dissent, structural,
//                demesure, wear, poverty)
//   when.night, when.precip ('rain' | 'snow'), when.riot, when.wonder, when.prosper
// Une réplique : { who, fr, en } ou { who, m, f, en } quand le français s'accorde au
// genre de QUI PARLE. Des prénoms vrais, tirés de la fiche : {a}, {b}, {conjoint},
// {enfant}, {hote}. Une entrée qui nomme quelqu'un qu'il n'a pas n'est pas choisie.
//
// ⛔ Style des textes du jeu : phrases courtes, ni tiret, ni « ! », ni points de
// suspension. Le ton de la Chronique et des faits divers : une chute, de la tendresse.

// Les métiers par familles (clés de citizenIdentity.JOBS).
export const JOB_GROUP = {
  gatherer: 'food', fisher: 'food', farmer: 'food', agronomist: 'food', marketGardener: 'food',
  baker: 'food', storekeeper: 'food', miller: 'food', gardener: 'food',
  artisan: 'craft', factory: 'craft', weaver: 'craft', sculptor: 'craft', minter: 'craft',
  printer: 'craft', builder: 'craft', miner: 'craft', sewerman: 'craft', engineer: 'craft',
  shaman: 'faith', monk: 'faith', priest: 'faith',
  guard: 'guard', legionary: 'guard', constable: 'guard', watchman: 'guard',
  merchant: 'trade', florist: 'trade', changer: 'trade', banker: 'trade', caravaneer: 'trade',
  hauler: 'trade', courier: 'trade',
  scribe: 'learning', lettered: 'learning', librarian: 'learning', professor: 'learning',
  scholar: 'learning', astronomer: 'learning', strategist: 'learning', schoolmaster: 'learning',
  teacher: 'learning', archivist: 'learning', botanist: 'learning', mage: 'learning',
  porter: 'carry', basket: 'carry', waterCarrier: 'carry', boatman: 'carry', docker: 'carry',
  starSailor: 'carry', pilot: 'carry', navigator: 'carry',
  magistrate: 'office', clerk: 'office', official: 'office', courtClerk: 'office',
  stateClerk: 'office', fountaineer: 'office', architect: 'office', nurse: 'office',
  storyteller: 'art', actor: 'art', journalist: 'art', singer: 'art', dancer: 'art',
  matron: 'gentry', noble: 'gentry',
};

export const PAROLES = [
  // ── LES CAUSETTES, SA VIE ────────────────────────────────────────────────────
  { id: 'c-couple-pain', kind: 'chat', layer: 1, bands: [1, 9], when: { rel: 'couple' }, lines: [
    { who: 'a', fr: 'Tu as pensé au pain ?', en: 'Did you think of the bread?' },
    { who: 'b', fr: 'J’ai pensé à toi. C’est déjà ça.', en: 'I thought of you. That’s something.' },
  ] },
  { id: 'c-couple-feu', kind: 'chat', layer: 1, bands: [0, 1], when: { rel: 'couple' }, lines: [
    { who: 'a', fr: 'Tu as remis du bois ?', en: 'Did you put wood on?' },
    { who: 'b', fr: 'J’ai remis du bois hier.', en: 'I put wood on yesterday.' },
    { who: 'a', fr: 'Le feu, lui, a mangé aujourd’hui.', en: 'The fire ate today, though.' },
  ] },
  { id: 'c-couple-ciel', kind: 'chat', layer: 1, when: { rel: 'couple', kids: true }, lines: [
    { who: 'a', fr: '{enfant} a encore demandé pourquoi le ciel est en haut.', en: '{enfant} asked again why the sky is up there.' },
    { who: 'b', fr: 'Qu’est-ce que tu as répondu ?', en: 'What did you say?' },
    { who: 'a', fr: 'Que sinon, il nous tomberait dessus.', en: 'That otherwise it would fall on us.' },
  ] },
  { id: 'c-pk-feu', kind: 'chat', layer: 1, bands: [0, 1], when: { rel: 'parentKid' }, lines: [
    { who: 'kid', fr: 'Pourquoi le feu ne s’éteint jamais ?', en: 'Why does the fire never go out?' },
    { who: 'parent', fr: 'Parce que quelqu’un le garde.', en: 'Because someone keeps it.' },
    { who: 'kid', fr: 'Qui ?', en: 'Who?' },
    { who: 'parent', fr: 'Mange.', en: 'Eat.' },
  ] },
  { id: 'c-pk-ecole', kind: 'chat', layer: 1, bands: [2, 9], when: { rel: 'parentKid' }, lines: [
    { who: 'parent', fr: 'Qu’est-ce que tu as appris aujourd’hui ?', en: 'What did you learn today?' },
    { who: 'kid', fr: 'Que le maître ne sait pas tout.', en: 'That the teacher doesn’t know everything.' },
    { who: 'parent', fr: 'C’est déjà beaucoup.', en: 'That’s already a lot.' },
  ] },
  { id: 'c-pk-grand', kind: 'chat', layer: 1, when: { rel: 'parentKid' }, lines: [
    { who: 'kid', m: 'Quand je serai grand, je ferai quoi ?', f: 'Quand je serai grande, je ferai quoi ?', en: 'What will I do when I grow up?' },
    { who: 'parent', fr: 'Comme moi.', en: 'Same as me.' },
    { who: 'kid', fr: 'Il n’y a pas autre chose ?', en: 'Isn’t there anything else?' },
  ] },
  { id: 'c-garde-chat', kind: 'chat', layer: 1, bands: [2, 6], when: { job: ['guard'] }, lines: [
    { who: 'b', fr: 'Rien à signaler ?', en: 'Anything to report?' },
    { who: 'a', fr: 'Un chat. Deux fois.', en: 'A cat. Twice.' },
    { who: 'b', fr: 'Le même ?', en: 'The same one?' },
    { who: 'a', fr: 'Je n’ai pas voulu l’interroger.', en: 'I didn’t want to question it.' },
  ] },
  { id: 'c-foi-attendre', kind: 'chat', layer: 1, when: { job: ['faith'] }, lines: [
    { who: 'a', fr: 'Tu viens prier, ce soir ?', en: 'Coming to pray tonight?' },
    { who: 'b', fr: 'Si les ancêtres m’attendent, ils sauront attendre.', en: 'If the ancestors are waiting for me, they know how to wait.' },
  ] },
  { id: 'c-marchand-hier', kind: 'chat', layer: 1, bands: [2, 9], when: { job: ['trade'] }, lines: [
    { who: 'b', fr: 'Combien pour les pommes ?', en: 'How much for the apples?' },
    { who: 'a', fr: 'Pour toi, le prix d’hier.', en: 'For you, yesterday’s price.' },
    { who: 'b', fr: 'Et hier ?', en: 'And yesterday?' },
    { who: 'a', fr: 'C’était plus cher.', en: 'It was higher.' },
  ] },
  { id: 'c-artisan-mains', kind: 'chat', layer: 1, when: { job: ['craft'] }, lines: [
    { who: 'b', fr: 'Tu as les mains noires.', en: 'Your hands are black.' },
    { who: 'a', fr: 'Ce sont des mains qui ont travaillé.', en: 'They’re hands that have worked.' },
    { who: 'b', fr: 'Les miennes aussi. Elles sont propres.', en: 'So have mine. They’re clean.' },
    { who: 'a', fr: 'Alors elles ont mal travaillé.', en: 'Then they worked badly.' },
  ] },
  { id: 'c-vieux-temps', kind: 'chat', layer: 1, when: { old: true }, lines: [
    { who: 'a', fr: 'De mon temps, on ne se plaignait pas.', en: 'In my day, nobody complained.' },
    { who: 'b', fr: 'De ton temps, on n’avait pas le temps.', en: 'In your day, nobody had the time.' },
  ] },
  { id: 'c-bavard', kind: 'chat', layer: 1, when: { trait: 'chatty' }, lines: [
    { who: 'a', fr: 'Tu sais ce qu’on dit du voisin ?', en: 'Do you know what they’re saying about the neighbour?' },
    { who: 'b', fr: 'Non.', en: 'No.' },
    { who: 'a', fr: 'Moi non plus. Je pensais que tu saurais.', en: 'Me neither. I thought you’d know.' },
  ] },
  { id: 'c-taciturne', kind: 'chat', layer: 1, when: { traitB: 'quiet' }, lines: [
    { who: 'a', fr: 'Tu ne dis rien ?', en: 'You’re not saying anything?' },
    { who: 'b', fr: 'Non.', en: 'No.' },
    { who: 'a', fr: 'C’est reposant.', en: 'That’s restful.' },
  ] },
  { id: 'c-gourmand', kind: 'chat', layer: 1, bands: [1, 9], when: { trait: 'greedy' }, lines: [
    { who: 'a', fr: 'Ça sent le pain chaud.', en: 'Smells like fresh bread.' },
    { who: 'b', fr: 'Ça sent le pain des autres.', en: 'Smells like other people’s bread.' },
  ] },
  { id: 'c-reveur', kind: 'chat', layer: 1, when: { trait: 'dreamy' }, lines: [
    { who: 'b', fr: 'Tu regardes quoi ?', en: 'What are you looking at?' },
    { who: 'a', fr: 'Le nuage, là. On dirait une maison.', en: 'That cloud. It looks like a house.' },
    { who: 'b', fr: 'Ici, tout ressemble à une maison.', en: 'Around here, everything looks like a house.' },
  ] },
  { id: 'c-superstitieux', kind: 'chat', layer: 1, bands: [1, 9], when: { trait: 'superstitious' }, lines: [
    { who: 'a', fr: 'Ne passe pas sous l’échelle.', en: 'Don’t walk under the ladder.' },
    { who: 'b', fr: 'Il n’y a pas d’échelle.', en: 'There is no ladder.' },
    { who: 'a', fr: 'Justement. Elle est quelque part.', en: 'Exactly. It’s somewhere.' },
  ] },
  { id: 'c-travailleur', kind: 'chat', layer: 1, when: { trait: 'hardworking' }, lines: [
    { who: 'b', fr: 'Tu ne t’arrêtes jamais ?', en: 'Don’t you ever stop?' },
    { who: 'a', fr: 'Je m’arrête en ce moment.', en: 'I’m stopping right now.' },
    { who: 'b', fr: 'Tu regardes ton atelier par-dessus mon épaule.', en: 'You’re looking at your workshop over my shoulder.' },
  ] },
  { id: 'c-fier', kind: 'chat', layer: 1, when: { traitB: 'proud' }, lines: [
    { who: 'a', fr: 'Tu as l’air content de toi.', en: 'You look pleased with yourself.' },
    { who: 'b', fr: 'J’ai mes raisons.', en: 'I have my reasons.' },
    { who: 'a', fr: 'Lesquelles ?', en: 'Which ones?' },
    { who: 'b', fr: 'Je les garde pour moi. Ça en fait partie.', en: 'I keep them to myself. That’s one of them.' },
  ] },
  { id: 'c-ou-vas-tu', kind: 'chat', layer: 1, lines: [
    { who: 'a', fr: 'Tu vas où ?', en: 'Where are you headed?' },
    { who: 'b', fr: 'Là où je vais tous les jours.', en: 'Where I go every day.' },
    { who: 'a', fr: 'Ça doit être joli, depuis le temps.', en: 'Must be lovely by now.' },
  ] },
  { id: 'c-belle-journee', kind: 'chat', layer: 1, lines: [
    { who: 'a', fr: 'Belle journée.', en: 'Nice day.' },
    { who: 'b', fr: 'Pour l’instant.', en: 'So far.' },
  ] },
  { id: 'c-petite-ville', kind: 'chat', layer: 1, bands: [3, 9], lines: [
    { who: 'a', fr: 'On se voit au marché ?', en: 'See you at the market?' },
    { who: 'b', fr: 'On se voit partout. La ville est petite.', en: 'I see you everywhere. It’s a small town.' },
  ] },

  // ── LES CAUSETTES, LA CITÉ ───────────────────────────────────────────────────
  { id: 'c-disette-chasse', kind: 'chat', layer: 2, bands: [0, 1], when: { cause: 'scarcity' }, lines: [
    { who: 'a', fr: 'La chasse n’a rien rapporté.', en: 'The hunt brought nothing back.' },
    { who: 'b', fr: 'Alors on mangera la chasse de demain.', en: 'Then we’ll eat tomorrow’s hunt.' },
  ] },
  { id: 'c-disette-moulin', kind: 'chat', layer: 2, bands: [2, 9], when: { cause: 'scarcity' }, lines: [
    { who: 'a', fr: 'Plus de farine au moulin.', en: 'No more flour at the mill.' },
    { who: 'b', fr: 'Il y en avait hier.', en: 'There was some yesterday.' },
    { who: 'a', fr: 'Hier, c’était hier.', en: 'Yesterday was yesterday.' },
  ] },
  { id: 'c-inegal-portes', kind: 'chat', layer: 2, bands: [2, 9], when: { cause: 'inequality' }, lines: [
    { who: 'a', fr: 'Les grandes maisons ont fait dorer leurs portes.', en: 'The great houses had their doors gilded.' },
    { who: 'b', fr: 'Les nôtres ferment mal.', en: 'Ours don’t shut properly.' },
    { who: 'a', fr: 'Au moins, elles ferment.', en: 'At least they shut.' },
  ] },
  { id: 'c-paperasse-chevre', adult: true, kind: 'chat', layer: 2, bands: [2, 5], when: { cause: 'complexity' }, lines: [
    { who: 'a', fr: 'Il faut un sceau pour vendre une chèvre, maintenant.', en: 'You need a seal to sell a goat now.' },
    { who: 'b', fr: 'Et pour avoir le sceau ?', en: 'And to get the seal?' },
    { who: 'a', fr: 'Une autre chèvre.', en: 'Another goat.' },
  ] },
  { id: 'c-paperasse-guichet', adult: true, kind: 'chat', layer: 2, bands: [6, 9], when: { cause: 'complexity' }, lines: [
    { who: 'a', fr: 'J’ai attendu trois heures au guichet.', en: 'I waited three hours at the counter.' },
    { who: 'b', fr: 'Qu’est-ce qu’on t’a dit ?', en: 'What did they tell you?' },
    { who: 'a', fr: 'De revenir avec le bon guichet.', en: 'To come back with the right counter.' },
  ] },
  { id: 'c-grand-pere', kind: 'chat', layer: 2, when: { cause: 'dissent' }, lines: [
    { who: 'a', fr: 'Mon grand-père disait que la cité finit toujours par tomber.', en: 'My grandfather said the city always falls in the end.' },
    { who: 'b', fr: 'Le mien aussi.', en: 'So did mine.' },
    { who: 'a', fr: 'Ils se connaissaient ?', en: 'Did they know each other?' },
  ] },
  { id: 'c-fissure', adult: true, kind: 'chat', layer: 2, bands: [1, 9], when: { cause: 'structural' }, lines: [
    { who: 'a', fr: 'Le mur a encore une fissure.', en: 'The wall has another crack.' },
    { who: 'b', fr: 'Une nouvelle ?', en: 'A new one?' },
    { who: 'a', fr: 'Non. La même, en plus grande.', en: 'No. The same one, bigger.' },
  ] },
  { id: 'c-demesure', kind: 'chat', layer: 2, bands: [3, 9], when: { cause: 'demesure' }, lines: [
    { who: 'a', fr: 'La ville a encore grandi cette nuit.', en: 'The city grew again last night.' },
    { who: 'b', fr: 'Elle va finir par nous perdre.', en: 'It’ll end up losing us.' },
    { who: 'a', fr: 'Moi, elle m’a perdu depuis longtemps.', en: 'It lost me a long time ago.' },
  ] },
  { id: 'c-usure', adult: true, kind: 'chat', layer: 2, when: { cause: 'wear' }, lines: [
    { who: 'a', fr: 'Tout s’use.', en: 'Everything wears out.' },
    { who: 'b', fr: 'Même nous ?', en: 'Even us?' },
    { who: 'a', fr: 'Nous d’abord.', en: 'Us first.' },
  ] },
  { id: 'c-misere', adult: true, kind: 'chat', layer: 2, bands: [2, 9], when: { cause: 'poverty' }, lines: [
    { who: 'a', fr: 'Tu me prêtes une pièce ?', en: 'Can you lend me a coin?' },
    { who: 'b', fr: 'Je te la prêterais si je l’avais.', en: 'I would if I had one.' },
    { who: 'a', fr: 'Alors prête-moi l’intention.', en: 'Then lend me the intention.' },
  ] },
  { id: 'c-pluie-toit', kind: 'chat', layer: 2, when: { precip: 'rain' }, lines: [
    { who: 'a', fr: 'Encore une averse.', en: 'Another downpour.' },
    { who: 'b', fr: 'Ton toit fuit ?', en: 'Is your roof leaking?' },
    { who: 'a', fr: 'Le toit, non. Le ciel, oui.', en: 'The roof, no. The sky, yes.' },
  ] },
  { id: 'c-neige-prix', kind: 'chat', layer: 2, bands: [2, 9], when: { precip: 'snow' }, lines: [
    { who: 'a', fr: 'Il neige sur le marché.', en: 'It’s snowing on the market.' },
    { who: 'b', fr: 'Les prix vont geler.', en: 'Prices will freeze.' },
    { who: 'a', fr: 'Ce serait bien la première fois.', en: 'That would be a first.' },
  ] },
  { id: 'c-nuit-rue', kind: 'chat', layer: 2, when: { night: true }, lines: [
    { who: 'a', fr: 'On devrait rentrer.', en: 'We should go home.' },
    { who: 'b', fr: 'Encore une rue.', en: 'One more street.' },
    { who: 'a', fr: 'Tu dis ça depuis dix rues.', en: 'You’ve said that for ten streets.' },
  ] },
  { id: 'c-emeute-halle', kind: 'chat', layer: 2, bands: [2, 9], when: { riot: true }, lines: [
    { who: 'a', fr: 'Ne passe pas par la halle ce soir.', en: 'Don’t go by the market hall tonight.' },
    { who: 'b', fr: 'Pourquoi ?', en: 'Why?' },
    { who: 'a', fr: 'Parce que tout le monde y passe.', en: 'Because everyone’s going there.' },
  ] },
  { id: 'c-merveille', kind: 'chat', layer: 2, when: { wonder: true }, lines: [
    { who: 'a', fr: 'Tu as vu la merveille ?', en: 'Have you seen the wonder?' },
    { who: 'b', fr: 'On la voit depuis les champs.', en: 'You can see it from the fields.' },
    { who: 'a', fr: 'On ne voit plus qu’elle.', en: 'You can’t see anything else.' },
  ] },
  { id: 'c-paniers-pleins', kind: 'chat', layer: 2, bands: [0, 1], when: { prosper: true }, lines: [
    { who: 'a', fr: 'Les paniers sont pleins.', en: 'The baskets are full.' },
    { who: 'b', fr: 'Alors pourquoi tu soupires ?', en: 'Then why the sigh?' },
    { who: 'a', fr: 'Il faudra les porter.', en: 'They’ll have to be carried.' },
  ] },
  { id: 'c-entrepots-pleins', adult: true, kind: 'chat', layer: 2, bands: [2, 9], when: { prosper: true }, lines: [
    { who: 'a', fr: 'Les entrepôts débordent.', en: 'The warehouses are overflowing.' },
    { who: 'b', fr: 'Alors pourquoi tu fais cette tête ?', en: 'Then why the long face?' },
    { who: 'a', fr: 'Je cherche ce qui va mal.', en: 'I’m looking for what’s wrong.' },
  ] },
  { id: 'c-clan-fumee', kind: 'chat', layer: 2, bands: [0, 0], lines: [
    { who: 'a', fr: 'Tu as vu la fumée, de l’autre côté ?', en: 'See the smoke, on the other side?' },
    { who: 'b', fr: 'Un autre clan.', en: 'Another clan.' },
    { who: 'a', fr: 'Ou le nôtre, qui s’est perdu.', en: 'Or ours, lost again.' },
  ] },
  { id: 'c-semailles', adult: true, kind: 'chat', layer: 2, bands: [1, 2], lines: [
    { who: 'a', fr: 'Les anciens disent de semer après la lune.', en: 'The elders say to sow after the moon.' },
    { who: 'b', fr: 'Laquelle ?', en: 'Which one?' },
    { who: 'a', fr: 'Ils ne sont pas d’accord.', en: 'They don’t agree.' },
  ] },
  { id: 'c-roi-taxes', adult: true, kind: 'chat', layer: 2, bands: [3, 3], lines: [
    { who: 'a', fr: 'Le roi passe demain.', en: 'The king comes through tomorrow.' },
    { who: 'b', fr: 'On le saura comment ?', en: 'How will we know?' },
    { who: 'a', fr: 'Les taxes arriveront avant lui.', en: 'The taxes will get here first.' },
  ] },
  { id: 'c-jeux', kind: 'chat', layer: 2, bands: [4, 4], lines: [
    { who: 'a', fr: 'Tu vas aux jeux ?', en: 'Going to the games?' },
    { who: 'b', fr: 'Je vais regarder ceux qui regardent.', en: 'I’m going to watch the people watching.' },
  ] },
  { id: 'c-horloge-usine', adult: true, kind: 'chat', layer: 2, bands: [5, 5], lines: [
    { who: 'a', fr: 'Ils ont mis une horloge à l’usine.', en: 'They put a clock in the factory.' },
    { who: 'b', fr: 'Pour quoi faire ?', en: 'What for?' },
    { who: 'a', fr: 'Pour qu’on sache combien de temps on perd.', en: 'So we know how much time we lose.' },
  ] },
  { id: 'c-nouvelles', kind: 'chat', layer: 2, bands: [6, 6], lines: [
    { who: 'a', fr: 'Tu as vu les nouvelles ?', en: 'Seen the news?' },
    { who: 'b', fr: 'Je les vois tout le temps.', en: 'I see it all the time.' },
    { who: 'a', fr: 'Et tu en penses quoi ?', en: 'And what do you think?' },
    { who: 'b', fr: 'Je n’ai pas eu le temps.', en: 'I haven’t had the time.' },
  ] },
  { id: 'c-pluie-ancienne', kind: 'chat', layer: 2, bands: [7, 9], lines: [
    { who: 'a', fr: 'Tu te souviens de la pluie ?', en: 'Do you remember rain?' },
    { who: 'b', fr: 'Laquelle ?', en: 'Which rain?' },
    { who: 'a', fr: 'Celle qui tombait toute seule.', en: 'The kind that fell on its own.' },
  ] },

  // ── LES PENSÉES, SA VIE ──────────────────────────────────────────────────────
  { id: 't-couple-soir', kind: 'thought', layer: 1, when: { family: 'married' }, lines: [
    { fr: 'Ce soir, je dirai à {conjoint} que tout va bien.', en: 'Tonight I’ll tell {conjoint} that everything’s fine.' },
  ] },
  { id: 't-parent-questions', kind: 'thought', layer: 1, when: { kids: true }, lines: [
    { fr: '{enfant} pose trop de questions. Je n’ai que des réponses d’hier.', en: '{enfant} asks too many questions. I only have yesterday’s answers.' },
  ] },
  { id: 't-enfant-choux', kind: 'thought', layer: 1, when: { child: true }, lines: [
    { m: 'Quand je serai grand, je ne mangerai plus de choux.', f: 'Quand je serai grande, je ne mangerai plus de choux.', en: 'When I grow up, I’ll never eat cabbage again.' },
  ] },
  { id: 't-enfant-maitre', kind: 'thought', layer: 1, bands: [2, 9], when: { child: true }, lines: [
    { fr: 'Le maître dit que je rêve. Je rêve qu’il se taise.', en: 'The teacher says I’m daydreaming. I’m dreaming he’ll stop talking.' },
  ] },
  { id: 't-enfant-feu', kind: 'thought', layer: 1, bands: [0, 1], when: { child: true }, lines: [
    { fr: 'Un jour, on me laissera garder le feu. Toute la nuit.', en: 'One day they’ll let me keep the fire. All night.' },
  ] },
  { id: 't-aieul-rue', kind: 'thought', layer: 1, when: { old: true }, lines: [
    { fr: 'J’ai vu bâtir cette rue. Elle ne me reconnaît pas.', en: 'I watched this street being built. It doesn’t recognise me.' },
  ] },
  { id: 't-seul', kind: 'thought', layer: 1, when: { family: 'single' }, lines: [
    { fr: 'Personne ne m’attend. Je peux marcher aussi lentement que je veux.', en: 'Nobody’s waiting for me. I can walk as slowly as I like.' },
  ] },
  { id: 't-heberge', kind: 'thought', layer: 1, when: { family: 'lodger' }, lines: [
    { m: 'Je dors chez {hote}. Je me fais tout petit.', f: 'Je dors chez {hote}. Je me fais toute petite.', en: 'I sleep at {hote}’s. I keep myself small.' },
  ] },
  { id: 't-job-food', kind: 'thought', layer: 1, when: { job: ['food'] }, lines: [
    { fr: 'Encore un jour à nourrir des gens qui ne savent pas mon nom.', en: 'Another day feeding people who don’t know my name.' },
  ] },
  { id: 't-job-craft', kind: 'thought', layer: 1, when: { job: ['craft'] }, lines: [
    { fr: 'Mes mains savent le métier. Moi, je pense à autre chose.', en: 'My hands know the trade. I’m thinking about something else.' },
  ] },
  { id: 't-job-faith', kind: 'thought', layer: 1, when: { job: ['faith'] }, lines: [
    { fr: 'Si les ancêtres écoutent, ils écoutent beaucoup.', en: 'If the ancestors are listening, they’re listening a lot.' },
  ] },
  { id: 't-job-guard', kind: 'thought', layer: 1, when: { job: ['guard'] }, lines: [
    { fr: 'Je garde la porte. Personne ne m’a dit contre quoi.', en: 'I guard the gate. Nobody told me against what.' },
  ] },
  { id: 't-job-tablette', kind: 'thought', layer: 1, bands: [0, 4], when: { job: ['learning'] }, lines: [
    { fr: 'Encore une tablette. Personne ne lira celle-ci non plus.', en: 'Another tablet. Nobody will read this one either.' },
  ] },
  { id: 't-job-rapport', kind: 'thought', layer: 1, bands: [5, 9], when: { job: ['learning'] }, lines: [
    { fr: 'Encore un rapport. Personne ne lira celui-ci non plus.', en: 'Another report. Nobody will read this one either.' },
  ] },
  { id: 't-job-trade', kind: 'thought', layer: 1, when: { job: ['trade'] }, lines: [
    { fr: 'Acheter bas, vendre haut, et sourire au milieu.', en: 'Buy low, sell high, and smile in between.' },
  ] },
  { id: 't-job-carry', kind: 'thought', layer: 1, when: { job: ['carry'] }, lines: [
    { fr: 'Le fardeau est plus léger quand on pense au dîner.', en: 'The load’s lighter when you think about supper.' },
  ] },
  { id: 't-job-office', kind: 'thought', layer: 1, when: { job: ['office'] }, lines: [
    { fr: 'Signer, tamponner, ranger. Demain, la même chose dans un autre ordre.', en: 'Sign, stamp, file. Tomorrow, the same in another order.' },
  ] },
  { id: 't-job-gentry', kind: 'thought', layer: 1, when: { job: ['gentry'] }, lines: [
    { fr: 'Rien à faire aujourd’hui. C’est un métier aussi.', en: 'Nothing to do today. That’s a job too.' },
  ] },
  { id: 't-job-art', kind: 'thought', layer: 1, when: { job: ['art'] }, lines: [
    { fr: 'Ils applaudissent toujours au même endroit. Je pourrais changer la fin.', en: 'They always clap at the same place. I could change the ending.' },
  ] },
  { id: 't-grumpy', kind: 'thought', layer: 1, when: { trait: 'grumpy' }, lines: [
    { fr: 'Tout le monde marche trop lentement. Sauf moi, qui marche trop vite.', en: 'Everyone walks too slowly. Except me. I walk too fast.' },
  ] },
  { id: 't-cheerful', kind: 'thought', layer: 1, when: { trait: 'cheerful' }, lines: [
    { fr: 'Belle journée. Je n’ai pas encore vérifié, mais belle journée.', en: 'Lovely day. I haven’t checked yet, but lovely day.' },
  ] },
  { id: 't-dreamy', kind: 'thought', layer: 1, when: { trait: 'dreamy' }, lines: [
    { fr: 'Si j’avais des ailes, je ne ferais pas mes courses.', en: 'If I had wings, I wouldn’t run errands.' },
  ] },
  { id: 't-curious', kind: 'thought', layer: 1, when: { trait: 'curious' }, lines: [
    { fr: 'Qu’est-ce qu’il y a derrière ce mur ? Un autre mur, sans doute.', en: 'What’s behind that wall? Another wall, probably.' },
  ] },
  { id: 't-superstitious', kind: 'thought', layer: 1, when: { trait: 'superstitious' }, lines: [
    { fr: 'Trois corbeaux. Ou deux et une ombre. Ça compte quand même.', en: 'Three crows. Or two and a shadow. It still counts.' },
  ] },
  { id: 't-pious-pluie', kind: 'thought', layer: 1, when: { trait: 'pious', precip: 'rain' }, lines: [
    { fr: 'J’ai prié pour la pluie. Il pleut. Je vais devoir faire attention à ce que je demande.', en: 'I prayed for rain. It’s raining. I’ll have to be careful what I ask for.' },
  ] },
  { id: 't-proud', kind: 'thought', layer: 1, when: { trait: 'proud' }, lines: [
    { fr: 'On me regarde. C’est normal.', en: 'People are looking at me. It’s only natural.' },
  ] },
  { id: 't-thrifty', adult: true, kind: 'thought', layer: 1, when: { trait: 'thrifty' }, lines: [
    { fr: 'Une pièce dépensée ne revient jamais. Comme mon frère.', en: 'A coin spent never comes back. Like my brother.' },
  ] },
  { id: 't-generous', kind: 'thought', layer: 1, when: { trait: 'generous' }, lines: [
    { fr: 'J’ai donné ma part. J’ai faim, mais j’ai donné ma part.', en: 'I gave my share. I’m hungry, but I gave my share.' },
  ] },
  { id: 't-stubborn', kind: 'thought', layer: 1, when: { trait: 'stubborn' }, lines: [
    { fr: 'Ils ont dit que c’était impossible. Ils n’ont pas dit pourquoi.', en: 'They said it was impossible. They didn’t say why.' },
  ] },
  { id: 't-absent', kind: 'thought', layer: 1, when: { trait: 'absent' }, lines: [
    { m: 'Je suis sorti pour quelque chose. C’était important.', f: 'Je suis sortie pour quelque chose. C’était important.', en: 'I came out for something. It was important.' },
  ] },
  { id: 't-chilly', kind: 'thought', layer: 1, when: { trait: 'chilly' }, lines: [
    { fr: 'Le froid entre par les pieds et ne ressort jamais.', en: 'The cold comes in through the feet and never leaves.' },
  ] },
  { id: 't-early', kind: 'thought', layer: 1, when: { trait: 'early' }, lines: [
    { fr: 'Debout avant le jour. Le jour, lui, prend son temps.', en: 'Up before the day. The day takes its time.' },
  ] },
  { id: 't-hardworking', adult: true, kind: 'thought', layer: 1, when: { trait: 'hardworking' }, lines: [
    { fr: 'Encore une heure. Après, encore une heure.', en: 'One more hour. Then one more hour.' },
  ] },
  { id: 't-spiteful', kind: 'thought', layer: 1, when: { trait: 'spiteful' }, lines: [
    { fr: 'Je n’ai pas oublié. Je ne sais plus quoi, mais je n’ai pas oublié.', en: 'I haven’t forgotten. I don’t remember what, but I haven’t forgotten.' },
  ] },
  { id: 't-chatty', kind: 'thought', layer: 1, when: { trait: 'chatty' }, lines: [
    { fr: 'Il faudra que je raconte ça à quelqu’un. N’importe qui.', en: 'I’ll have to tell someone about this. Anyone.' },
  ] },
  { id: 't-quiet', kind: 'thought', layer: 1, when: { trait: 'quiet' }, lines: [
    { fr: 'Rien à dire. C’est déjà beaucoup.', en: 'Nothing to say. That’s already a lot.' },
  ] },
  { id: 't-greedy', kind: 'thought', layer: 1, when: { trait: 'greedy' }, lines: [
    { fr: 'Je pense au dîner. Puis au dîner de demain.', en: 'I’m thinking about supper. Then tomorrow’s supper.' },
  ] },
  { id: 't-brave-emeute', kind: 'thought', layer: 1, when: { trait: 'brave', riot: true }, lines: [
    { fr: 'Ils crient. Je reste. Quelqu’un doit regarder.', en: 'They’re shouting. I’m staying. Someone has to watch.' },
  ] },
  { id: 't-cautious-emeute', kind: 'thought', layer: 1, when: { trait: 'cautious', riot: true }, lines: [
    { fr: 'La rue du puits. Puis celle d’après. Puis la maison.', en: 'The well street. Then the next one. Then home.' },
  ] },
  { id: 't-journee', kind: 'thought', layer: 1, lines: [
    { fr: 'Encore une journée. Elle ressemble à hier, en plus neuve.', en: 'Another day. It looks like yesterday, only newer.' },
  ] },
  { id: 't-important', kind: 'thought', layer: 1, lines: [
    { fr: 'Il faudrait que je pense à quelque chose d’important. Demain.', en: 'I should think about something important. Tomorrow.' },
  ] },

  // ── LES PENSÉES, LA CITÉ ─────────────────────────────────────────────────────
  { id: 't-disette', kind: 'thought', layer: 2, when: { cause: 'scarcity' }, lines: [
    { fr: 'J’ai rêvé de pain. Le pain ne rêve pas de moi.', en: 'I dreamed of bread. Bread doesn’t dream of me.' },
  ] },
  { id: 't-inegal', adult: true, kind: 'thought', layer: 2, bands: [2, 9], when: { cause: 'inequality' }, lines: [
    { fr: 'Là-haut, ils ont l’eau dans la cour. Ici, on a la cour.', en: 'Up there, they have water in the courtyard. Down here, we have the courtyard.' },
  ] },
  { id: 't-paperasse', adult: true, kind: 'thought', layer: 2, bands: [2, 9], when: { cause: 'complexity' }, lines: [
    { fr: 'Il me faut un papier pour avoir le papier.', en: 'I need a form to get the form.' },
  ] },
  { id: 't-balayer', kind: 'thought', layer: 2, when: { cause: 'dissent' }, lines: [
    { fr: 'On dit que tout finit par tomber. Alors pourquoi on balaie ?', en: 'They say everything falls in the end. So why do we sweep?' },
  ] },
  { id: 't-murs', adult: true, kind: 'thought', layer: 2, bands: [1, 9], when: { cause: 'structural' }, lines: [
    { fr: 'Je ne m’appuie plus sur les murs. Ils ont assez à faire.', en: 'I don’t lean on the walls anymore. They have enough to do.' },
  ] },
  { id: 't-demesure', adult: true, kind: 'thought', layer: 2, bands: [3, 9], when: { cause: 'demesure' }, lines: [
    { fr: 'La ville est si grande qu’elle ne sait plus où je suis. Moi non plus.', en: 'The city is so big it doesn’t know where I am. Neither do I.' },
  ] },
  { id: 't-usure', adult: true, kind: 'thought', layer: 2, when: { cause: 'wear' }, lines: [
    { fr: 'Tout grince. Moi aussi, le matin.', en: 'Everything creaks. So do I, in the morning.' },
  ] },
  { id: 't-paie', adult: true, kind: 'thought', layer: 2, bands: [2, 9], when: { cause: 'poverty' }, lines: [
    { fr: 'Encore trois jours avant la paie. Le pain, lui, n’attend pas.', en: 'Three more days until payday. Bread doesn’t wait.' },
  ] },
  { id: 't-nuit', kind: 'thought', layer: 2, when: { night: true }, lines: [
    { fr: 'La nuit, la ville parle moins fort. On l’entend mieux.', en: 'At night the city speaks lower. You hear it better.' },
  ] },
  { id: 't-pluie', kind: 'thought', layer: 2, when: { precip: 'rain' }, lines: [
    { fr: 'La pluie lave les rues et les mauvaises idées. Surtout les rues.', en: 'Rain washes the streets and bad ideas. Mostly the streets.' },
  ] },
  { id: 't-neige', kind: 'thought', layer: 2, when: { precip: 'snow' }, lines: [
    { fr: 'La neige efface les chemins. Je sais quand même où je vais. Je crois.', en: 'Snow erases the paths. I still know where I am going. I think.' },
  ] },
  { id: 't-emeute', kind: 'thought', layer: 2, when: { riot: true }, lines: [
    { fr: 'Ils crient sur la place. Je ne sais pas encore si je suis d’accord.', en: 'They’re shouting in the square. I don’t know yet if I agree.' },
  ] },
  { id: 't-merveille', kind: 'thought', layer: 2, when: { wonder: true }, lines: [
    { fr: 'On a bâti ça, nous. Enfin, d’autres que nous. Mais ici.', en: 'We built that. Well, others did. But here.' },
  ] },
  { id: 't-prospere', kind: 'thought', layer: 2, when: { prosper: true }, lines: [
    { fr: 'Tout va bien. Je me méfie.', en: 'Everything’s fine. I don’t trust it.' },
  ] },
  { id: 't-feu-garde', kind: 'thought', layer: 2, bands: [0, 0], lines: [
    { fr: 'Le feu nous garde. Qui garde le feu ?', en: 'The fire keeps us. Who keeps the fire?' },
  ] },
  { id: 't-pierres', kind: 'thought', layer: 2, bands: [0, 1], lines: [
    { fr: 'Les anciens disent que les pierres se souviennent. Se souviennent de quoi ?', en: 'The elders say stones remember. Remember what?' },
  ] },
  { id: 't-marche-crie', kind: 'thought', layer: 2, bands: [2, 3], lines: [
    { fr: 'Le marché crie plus fort que moi. Il a plus de choses à vendre.', en: 'The market shouts louder than I do. It has more to sell.' },
  ] },
  { id: 't-colonnes', kind: 'thought', layer: 2, bands: [4, 4], lines: [
    { fr: 'Les colonnes tiennent le ciel. Qui leur a demandé ?', en: 'The columns hold up the sky. Who asked them to?' },
  ] },
  { id: 't-fumee', kind: 'thought', layer: 2, bands: [5, 5], lines: [
    { fr: 'La fumée monte. Le salaire, non.', en: 'The smoke goes up. The wages don’t.' },
  ] },
  { id: 't-ecran', kind: 'thought', layer: 2, bands: [6, 6], lines: [
    { fr: 'Mon écran me connaît mieux que mes voisins. Mes voisins ne s’en plaignent pas.', en: 'My screen knows me better than my neighbours do. My neighbours don’t mind.' },
  ] },
  { id: 't-noosphere', kind: 'thought', layer: 2, bands: [7, 7], lines: [
    { fr: 'Je pense, donc la ville pense un peu aussi.', en: 'I think, therefore the city thinks a little too.' },
  ] },
  { id: 't-etoiles', kind: 'thought', layer: 2, bands: [8, 8], lines: [
    { fr: 'Les étoiles sont loin. On y va quand même.', en: 'The stars are far. We’re going anyway.' },
  ] },
  { id: 't-constante', kind: 'thought', layer: 2, bands: [9, 9], lines: [
    { fr: 'Réécrire une constante avant midi. Puis déjeuner.', en: 'Rewrite a constant before noon. Then lunch.' },
  ] },
];
