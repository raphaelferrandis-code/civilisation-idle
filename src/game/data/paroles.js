"use strict";

// ÉCOUTER — ce que disent les habitants (docs/PLAN-ECOUTER-PARLER.md).
//
// Données pures. Deux genres :
//   · 'chat'    : une CAUSETTE entre deux passants (`a` = celui qu'on écoute, `b` =
//                 l'autre ; `parent` / `kid` quand ils sont parent et enfant) ;
//   · 'thought' : une PENSÉE, celle du passant désigné (Raph : « dès le début le
//                 joueur peut regarder les pensées de tout le monde »).
// Trois couches : 1 = sa vie (sa famille, son métier, son caractère, ce qu'il fait),
// 2 = la cité telle qu'elle va (ce qui pèse sur elle, le temps, la saison, la nuit,
// l'émeute, la merveille), 3 = ce qu'ils disent du joueur (parolesToi.js, lot 2).
//
// ── LA PLUME (Raph, 2026-10-07 : « il nous faut des pensées moins IA codée, genre
// "le marché crie très fort", ça ne veut rien dire ») ─────────────────────────────
//   1. Du concret : un prénom, un objet, un lieu, un nombre, une heure.
//   2. Ce qu'une tête contient vraiment : un projet, un souci, un petit calcul, un
//      souvenir précis, une envie, une rancune, la tâche du jour.
//   3. La langue parlée, ordinaire. Des phrases qui s'arrêtent sur du pratique.
//   4. Ni maxime, ni phrase retournée, ni bon mot de fin ; les choses ne parlent
//      pas, ne crient pas, ne se souviennent pas. L'humour vient du caractère
//      (le radin, la bavarde), rarement.
//   5. Chaque âge son monde : ses objets, ses métiers, son argent, ses lieux. Aucune
//      réplique ne vaut du Feu au Démiurge (`bands` obligatoire, cinq âges au plus).
//   6. Les pensées suivent ce qu'on le voit faire (`when.doing`), et chaque métier a
//      ses mots (`when.job`).
//   7. Ni tiret, ni « ! », ni points de suspension ; l'apostrophe typographique.
//
// Une entrée : { id, kind, layer, bands: [min, max], when: { … } (toutes requises),
// lines: [ … ] }. `adult: true` : jamais dans la bouche d'un enfant, ni dans une
// causette où il y a un enfant (la paie, le loyer, le patron).
//   when.rel     'couple' | 'parentKid' : le lien entre les deux (causette)
//   when.family  'married' | 'single' | 'child' | 'elder' | 'lodger' | 'nephew'
//   when.kids    true : il a des enfants
//   when.job     [clés de métier] (citizenIdentity.JOBS) : celui qu'on écoute
//   when.group   [familles de métier] (JOB_GROUP ci-dessous)
//   when.notJob  [clés de métier] : pas lui (la boulangère ne pense pas « le boulanger
//                allume son four », le garde ne fuit pas le guet)
//   when.doing   [ce qu'il fait] (citizenFocus.doingOf) : 'work', 'school', 'home',
//                'errand', 'plaza', 'pray', 'wonder', 'wander', 'night', 'flee',
//                'shelter', 'riot', 'river', 'port', 'field'
//   when.trait   clé de caractère (citizenIdentity.TRAITS) ; when.traitB, de l'autre
//   when.old     true : un ancien ; when.child true | false
//   when.cause   ce qui pèse le plus sur la cité (scarcity, inequality, complexity,
//                dissent, structural, demesure, wear, poverty)
//   when.season  'spring' | 'summer' | 'autumn' | 'winter'
//   when.night, when.precip ('rain' | 'snow'), when.riot, when.wonder, when.prosper
// Une réplique : { who, fr, en } ou { who, m, f, en } quand le français s'accorde au
// genre de QUI PARLE. Des prénoms vrais (paroles/listen.js) : {a}, {b}, {conjoint},
// {enfant}, {hote} ; {voisin}, {voisine} (des adultes d'une maison de sa rue),
// {gamin}, {gamine} (des enfants de sa rue). Une entrée qui nomme quelqu'un qu'il n'a
// pas n'est pas choisie.

import { PAROLES_TOI } from './parolesToi.js';

// Les âges (eraThemes.js), par mondes.
const FEU = [0, 1];      // Feu et Bois : le camp, la chasse, la cueillette, l'abri
const BOURG = [2, 3];    // Pierre taillée et Couronne : le four, le puits, le seigneur
const MARBRE = [4, 4];   // Marbre : le forum, les thermes, la légion, les immeubles
const FONTE = [5, 5];    // Fonte : l'usine, la sirène, la paie, le charbon
const NEON = [6, 6];     // Néon : le bureau, le métro, l'écran, le loyer
const NOOS = [7, 7];     // Noosphère : le chœur, les tours-mémoire, les jardins du toit
const ETOILES = [8, 8];  // Stellaire : les navettes, les voiles, les longs voyages
const DEMIURGE = [9, 9]; // Démiurge : le cristal, le vide tissé, les constantes
const AU_DELA = [7, 9];

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

const PAROLES_VIE = [
  // ══ FEU ET BOIS ════════════════════════════════════════════════════════════════
  // ── Causettes, leur vie ──
  { id: 'f-c-peau', kind: 'chat', layer: 1, bands: FEU, when: { rel: 'couple', kids: true }, lines: [
    { who: 'a', fr: 'Tu as gardé une peau pour le petit ?', en: 'Did you keep a hide back for the little one?' },
    { who: 'b', fr: 'Celle du cerf. Elle est encore raide.', en: 'The deer one. It’s still stiff.' },
    { who: 'a', fr: 'Je la mâcherai ce soir, près du feu.', en: 'I’ll chew it soft tonight, by the fire.' },
  ] },
  { id: 'f-c-poisson-fume', adult: true, kind: 'chat', layer: 1, bands: FEU, when: { rel: 'couple' }, lines: [
    { who: 'a', fr: 'Il reste du poisson fumé ?', en: 'Is there any smoked fish left?' },
    { who: 'b', fr: 'Trois. Je les garde pour le jour où la chasse rentrera vide.', en: 'Three. I’m keeping them for the day the hunt comes back empty.' },
    { who: 'a', fr: 'Bon. Je ferai cuire des racines.', en: 'Fine. I’ll cook some roots.' },
  ] },
  { id: 'f-c-gue', kind: 'chat', layer: 1, bands: FEU, when: { rel: 'parentKid' }, lines: [
    { who: 'kid', fr: 'Je peux aller au gué avec les autres ?', en: 'Can I go down to the ford with the others?' },
    { who: 'parent', fr: 'Quand tu auras rapporté du bois. Deux brassées.', en: 'Once you’ve brought back wood. Two armfuls.' },
    { who: 'kid', fr: 'Une seule ?', en: 'Just one?' },
    { who: 'parent', fr: 'Deux.', en: 'Two.' },
  ] },
  { id: 'f-c-champignons', kind: 'chat', layer: 1, bands: FEU, when: { rel: 'parentKid' }, lines: [
    { who: 'kid', fr: 'Pourquoi on ne mange pas les champignons rouges ?', en: 'Why don’t we eat the red mushrooms?' },
    { who: 'parent', fr: 'Parce que le frère de ta grand-mère en a mangé, un automne.', en: 'Because your grandmother’s brother ate some, one autumn.' },
    { who: 'kid', fr: 'Il est mort ?', en: 'Did he die?' },
    { who: 'parent', fr: 'Il a été malade jusqu’aux neiges.', en: 'He was sick until the snows came.' },
  ] },
  { id: 'f-c-gamin-jouer', kind: 'chat', layer: 1, bands: FEU, when: { rel: 'parentKid' }, lines: [
    { who: 'kid', fr: '{gamin} a trouvé un nid de canard dans les roseaux. Je peux aller voir ?', en: '{gamin} found a duck’s nest in the reeds. Can I go and see?' },
    { who: 'parent', fr: 'Tu regardes, tu ne touches pas aux œufs.', en: 'You look. You don’t touch the eggs.' },
  ] },
  { id: 'f-c-noisetiers', kind: 'chat', layer: 1, bands: FEU, when: { group: ['food'] }, lines: [
    { who: 'a', fr: 'Les noisetiers du ravin sont vides.', en: 'The hazels in the ravine are bare.' },
    { who: 'b', fr: 'Les sangliers sont passés avant nous.', en: 'The boars got there before us.' },
    { who: 'a', fr: 'Demain, on monte plus haut.', en: 'Tomorrow we go higher up.' },
  ] },
  { id: 'f-c-chasseurs', kind: 'chat', layer: 1, bands: FEU, lines: [
    { who: 'a', fr: 'Ils sont partis depuis trois jours.', en: 'They’ve been gone three days.' },
    { who: 'b', fr: 'Ils ont dû suivre le cerf jusqu’aux marais.', en: 'They must have followed the deer to the marshes.' },
    { who: 'a', fr: 'Pourvu qu’ils rentrent avant la pleine lune.', en: 'As long as they’re back before the full moon.' },
  ] },
  { id: 'f-c-garde-feu', kind: 'chat', layer: 1, bands: [0, 0], lines: [
    { who: 'a', fr: 'Qui garde le feu cette nuit ?', en: 'Who’s keeping the fire tonight?' },
    { who: 'b', fr: '{gamin}. Il a demandé.', en: '{gamin}. He asked to.' },
    { who: 'a', fr: 'Il s’endort toujours avant la fin. Je passerai voir.', en: 'He always falls asleep before the end. I’ll go and check.' },
  ] },
  { id: 'f-c-palissade', kind: 'chat', layer: 1, bands: [1, 1], lines: [
    { who: 'a', fr: 'La palissade penche du côté de la rivière.', en: 'The palisade is leaning on the river side.' },
    { who: 'b', fr: 'J’ai vu. Il faudra trois troncs, au moins.', en: 'I saw. It’ll take three trunks at least.' },
    { who: 'a', fr: 'On les coupera après la pluie.', en: 'We’ll cut them after the rain.' },
  ] },
  { id: 'f-c-pirogue', kind: 'chat', layer: 1, bands: [1, 1], lines: [
    { who: 'a', fr: 'Tu me prêtes ta pirogue demain ?', en: 'Will you lend me your canoe tomorrow?' },
    { who: 'b', fr: 'Si tu me la rends avant midi. J’en ai besoin pour relever les nasses.', en: 'If you bring it back before noon. I need it to check the fish traps.' },
  ] },
  { id: 'f-c-aiguille', kind: 'chat', layer: 1, bands: FEU, when: { kids: true }, lines: [
    { who: 'a', fr: 'Tu m’as pris mon aiguille en os ?', en: 'Did you take my bone needle?' },
    { who: 'b', fr: 'Je te l’ai rendue hier. Elle est dans ton panier.', en: 'I gave it back yesterday. It’s in your basket.' },
    { who: 'a', fr: 'J’ai vidé mon panier.', en: 'I emptied my basket.' },
    { who: 'b', fr: 'Alors demande à tes petits.', en: 'Then ask your little ones.' },
  ] },
  { id: 'f-c-pointe', kind: 'chat', layer: 1, bands: FEU, lines: [
    { who: 'a', fr: 'Tu peux me tailler une pointe, ce soir ?', en: 'Can you knap me a point tonight?' },
    { who: 'b', fr: 'Si tu m’apportes le bon silex. Pas celui de la rivière, il éclate.', en: 'If you bring me the right flint. Not the river one, it shatters.' },
  ] },
  { id: 'f-c-source', kind: 'chat', layer: 1, bands: FEU, lines: [
    { who: 'a', fr: 'Tu vas où comme ça ?', en: 'Where are you off to?' },
    { who: 'b', fr: 'À la source du haut. Celle d’ici est trouble depuis la pluie.', en: 'The upper spring. This one’s been muddy since the rain.' },
  ] },
  { id: 'f-c-vieux-hiver', kind: 'chat', layer: 1, bands: FEU, when: { old: true }, lines: [
    { who: 'a', m: 'L’hiver où je suis né, la rivière a gelé jusqu’au fond.', f: 'L’hiver où je suis née, la rivière a gelé jusqu’au fond.', en: 'The winter I was born, the river froze to the bottom.' },
    { who: 'b', fr: 'Jusqu’au fond ?', en: 'To the bottom?' },
    { who: 'a', fr: 'Ma mère est allée chercher du bois sur l’autre rive, à pied.', en: 'My mother walked across to the other bank for firewood.' },
  ] },
  { id: 'f-c-fumee', kind: 'chat', layer: 1, bands: FEU, when: { job: ['shaman', 'priest'] }, lines: [
    { who: 'b', fr: 'On part avant l’hiver, ou on reste ?', en: 'Do we leave before winter, or stay?' },
    { who: 'a', fr: 'Je regarderai la fumée ce soir.', en: 'I’ll read the smoke tonight.' },
    { who: 'b', fr: 'Et si la fumée ne dit rien ?', en: 'And if the smoke says nothing?' },
    { who: 'a', fr: 'Alors on attendra le passage des oies.', en: 'Then we wait for the geese to go over.' },
  ] },

  // ── Causettes, le camp tel qu'il va ──
  { id: 'f-c-glands', kind: 'chat', layer: 2, bands: FEU, when: { cause: 'scarcity' }, lines: [
    { who: 'a', fr: 'Il ne reste que des glands.', en: 'There’s nothing left but acorns.' },
    { who: 'b', fr: 'Les enfants n’aiment pas les glands.', en: 'The children don’t like acorns.' },
    { who: 'a', fr: 'Je les ferai tremper deux jours. Ils seront moins amers.', en: 'I’ll soak them two days. They’ll be less bitter.' },
  ] },
  { id: 'f-c-chef-peaux', kind: 'chat', layer: 2, bands: FEU, when: { cause: 'inequality' }, lines: [
    { who: 'a', fr: 'Le chef garde les meilleures peaux pour son abri.', en: 'The chief keeps the best hides for his own shelter.' },
    { who: 'b', fr: 'Il a toujours fait ça.', en: 'He always has.' },
    { who: 'a', fr: 'Avant, il en donnait aux vieux.', en: 'He used to give some to the old ones.' },
  ] },
  { id: 'f-c-autre-chaman', kind: 'chat', layer: 2, bands: FEU, when: { notJob: ['shaman'], cause: 'dissent' }, lines: [
    { who: 'a', fr: 'Ceux du grand feu disent que le chaman ne parle plus aux ancêtres.', en: 'The ones at the big fire say the shaman doesn’t speak to the ancestors anymore.' },
    { who: 'b', fr: 'Ils veulent qui, à sa place ?', en: 'Who do they want instead?' },
    { who: 'a', fr: 'Le fils de la vieille aux herbes. Il n’a pas quinze ans.', en: 'The herb woman’s son. He isn’t fifteen.' },
  ] },
  { id: 'f-c-perches', adult: true, kind: 'chat', layer: 2, bands: FEU, when: { cause: 'structural' }, lines: [
    { who: 'a', fr: 'Le toit de l’abri a encore cédé du côté de la pente.', en: 'The shelter roof gave way again on the slope side.' },
    { who: 'b', fr: 'Il faut de nouvelles perches.', en: 'We need new poles.' },
    { who: 'a', fr: 'Il n’y en a plus de bonnes près du camp. Il faudra aller jusqu’aux bouleaux.', en: 'There are no good ones left near the camp. We’ll have to go as far as the birches.' },
  ] },
  { id: 'f-c-grattoir', kind: 'chat', layer: 2, bands: FEU, when: { cause: 'wear' }, lines: [
    { who: 'a', fr: 'Mon grattoir ne coupe plus.', en: 'My scraper won’t cut anymore.' },
    { who: 'b', fr: 'Va voir {voisin}. Il taille encore les meilleurs silex du camp.', en: 'Go and see {voisin}. He still knaps the best flints in the camp.' },
  ] },
  { id: 'f-c-gue-chaman', kind: 'chat', layer: 2, bands: FEU, when: { notJob: ['shaman'], cause: 'complexity' }, lines: [
    { who: 'a', fr: 'On n’a plus le droit de pêcher au gué avant que le chaman ait parlé.', en: 'We can’t fish at the ford anymore until the shaman has spoken.' },
    { who: 'b', fr: 'Depuis quand ?', en: 'Since when?' },
    { who: 'a', fr: 'Depuis la dernière lune. Et il faut lui porter un poisson pour qu’il parle.', en: 'Since the last moon. And you have to bring him a fish before he speaks.' },
  ] },
  { id: 'f-c-veuve', kind: 'chat', layer: 2, bands: FEU, when: { cause: 'poverty' }, lines: [
    { who: 'a', fr: 'Tu as encore donné ta part à la veuve de Garn ?', en: 'Did you give your share to Garn’s widow again?' },
    { who: 'b', fr: 'Elle n’a plus personne pour chasser.', en: 'She has nobody left to hunt for her.' },
  ] },
  { id: 'f-c-inconnu', kind: 'chat', layer: 2, bands: FEU, when: { cause: 'demesure' }, lines: [
    { who: 'a', fr: 'J’ai croisé un homme à la source, ce matin. Je ne connaissais pas son nom.', en: 'I passed a man at the spring this morning. I didn’t know his name.' },
    { who: 'b', fr: 'Le camp est devenu trop grand. Avant, on savait qui dormait où.', en: 'The camp’s grown too big. We used to know who slept where.' },
  ] },
  { id: 'f-c-peaux-pluie', kind: 'chat', layer: 2, bands: FEU, when: { precip: 'rain' }, lines: [
    { who: 'a', fr: 'Les peaux ne sècheront jamais avec ce temps.', en: 'The hides will never dry in this weather.' },
    { who: 'b', fr: 'Mets-les sous l’abri, près du feu.', en: 'Put them under the shelter, near the fire.' },
    { who: 'a', fr: 'Il n’y a plus de place sous l’abri.', en: 'There’s no room left under the shelter.' },
  ] },
  { id: 'f-c-lievre', kind: 'chat', layer: 2, bands: FEU, when: { precip: 'snow' }, lines: [
    { who: 'a', fr: 'Les traces du lièvre vont jusqu’aux rochers.', en: 'The hare’s tracks go all the way to the rocks.' },
    { who: 'b', fr: 'Avec la neige fraîche, on le trouvera avant midi.', en: 'With fresh snow, we’ll find it before noon.' },
  ] },
  { id: 'f-c-loups', kind: 'chat', layer: 2, bands: FEU, when: { night: true }, lines: [
    { who: 'a', fr: 'On rentre ? Le feu baisse.', en: 'Shall we go back? The fire’s getting low.' },
    { who: 'b', fr: 'Encore un peu. J’écoute les loups.', en: 'A bit longer. I’m listening to the wolves.' },
    { who: 'a', fr: 'Ils sont de l’autre côté de la rivière. Ils ne traverseront pas.', en: 'They’re over the river. They won’t cross.' },
  ] },
  { id: 'f-c-viande', kind: 'chat', layer: 2, bands: FEU, when: { riot: true }, lines: [
    { who: 'a', fr: 'Ils se battent pour la viande, devant le grand feu.', en: 'They’re fighting over the meat by the big fire.' },
    { who: 'b', fr: 'Reste ici avec les petits. J’y vais.', en: 'Stay here with the little ones. I’ll go.' },
  ] },
  { id: 'f-c-colline', kind: 'chat', layer: 2, bands: FEU, when: { wonder: true }, lines: [
    { who: 'a', fr: 'Tu as vu ce qu’ils ont bâti sur la colline ?', en: 'Have you seen what they’ve built on the hill?' },
    { who: 'b', fr: 'Il a fallu trente hommes pour monter une seule pierre.', en: 'It took thirty men to raise a single stone.' },
    { who: 'a', fr: 'Mon frère en était. Il a encore mal au dos.', en: 'My brother was one of them. His back still hurts.' },
  ] },
  { id: 'f-c-paniers', kind: 'chat', layer: 2, bands: FEU, when: { prosper: true }, lines: [
    { who: 'a', fr: 'Les paniers sont pleins.', en: 'The baskets are full.' },
    { who: 'b', fr: 'On pourra faire sécher des baies pour l’hiver.', en: 'We’ll be able to dry berries for the winter.' },
    { who: 'a', fr: 'Et fumer du poisson. Beaucoup de poisson.', en: 'And smoke fish. Lots of fish.' },
  ] },

  // ── Pensées, ce qu'il fait ──
  { id: 'f-t-repas', adult: true, kind: 'thought', layer: 1, bands: FEU, when: { doing: ['home'] }, lines: [
    { fr: 'Il reste du poisson fumé. Avec des racines, ça fera le repas.', en: 'There’s smoked fish left. With some roots, that’ll do for supper.' },
  ] },
  { id: 'f-t-braises', kind: 'thought', layer: 1, bands: FEU, when: { doing: ['home'], family: 'married' }, lines: [
    { m: '{conjoint} a dû rallumer le feu. J’espère qu’elle a gardé des braises pour la nuit.', f: '{conjoint} a dû rallumer le feu. J’espère qu’il a gardé des braises pour la nuit.', en: '{conjoint} will have relit the fire. I hope some embers were kept for the night.' },
  ] },
  { id: 'f-t-troc', adult: true, kind: 'thought', layer: 1, bands: FEU, when: { doing: ['errand'] }, lines: [
    { fr: 'Trois poissons contre une aiguille en os. Elle en voudra quatre, je la connais.', en: 'Three fish for a bone needle. She’ll want four. I know her.' },
  ] },
  { id: 'f-t-grand-feu', kind: 'thought', layer: 1, bands: FEU, when: { doing: ['plaza'] }, lines: [
    { fr: 'Au grand feu, les deux familles du bas vont encore se disputer pour l’eau. Je m’assiérai loin.', en: 'At the big fire the two families from down the slope will fight over the water again. I’ll sit well away.' },
  ] },
  { id: 'f-t-ancetres-toux', kind: 'thought', layer: 1, bands: FEU, when: { doing: ['pray'] }, lines: [
    { fr: 'Je demanderai aux ancêtres que la toux de ma mère passe avant les grands froids.', en: 'I’ll ask the ancestors to let my mother’s cough pass before the deep cold.' },
  ] },
  { id: 'f-t-oeufs', kind: 'thought', layer: 1, bands: FEU, when: { doing: ['wander'] }, lines: [
    { fr: 'Si je longe la rivière, je trouverai peut-être des œufs de canard dans les roseaux.', en: 'If I follow the river, I might find duck eggs in the reeds.' },
  ] },
  { id: 'f-t-abri-nuit', kind: 'thought', layer: 1, bands: FEU, when: { doing: ['night'] }, lines: [
    { fr: 'Tout le monde dort sous l’abri. Si je rentre maintenant, je vais marcher sur quelqu’un.', en: 'Everyone’s asleep under the shelter. If I go in now, I’ll tread on someone.' },
  ] },
  { id: 'f-t-ravin', adult: true, kind: 'thought', layer: 1, bands: FEU, when: { doing: ['flee'] }, lines: [
    { fr: 'Prendre les petits, passer par le ravin, attendre aux rochers.', en: 'Grab the little ones, go down the ravine, wait at the rocks.' },
  ] },
  { id: 'f-t-branches', kind: 'thought', layer: 1, bands: FEU, when: { doing: ['shelter'] }, lines: [
    { fr: 'La pluie passe à travers les branches. J’aurais dû aller sous les rochers.', en: 'The rain comes through the branches. I should have gone under the rocks.' },
  ] },
  { id: 'f-t-pierres-gue', kind: 'thought', layer: 1, bands: FEU, when: { doing: ['river'] }, lines: [
    { fr: 'L’eau a baissé. On voit les pierres du gué jusqu’à l’autre rive.', en: 'The water’s gone down. You can see the ford stones all the way across.' },
  ] },
  { id: 'f-t-grains', kind: 'thought', layer: 1, bands: FEU, when: { doing: ['field'] }, lines: [
    { fr: 'Les grains qu’on a mis dans la terre ont levé. Ma mère disait que ça ne marcherait jamais.', en: 'The seeds we put in the ground have come up. My mother said it would never work.' },
  ] },
  { id: 'f-t-bois', kind: 'thought', layer: 1, bands: FEU, lines: [
    { fr: 'Il faut que je rapporte du bois avant la nuit. Le tas est presque fini.', en: 'I need to bring back wood before dark. The pile’s nearly gone.' },
  ] },
  { id: 'f-t-chaussure', kind: 'thought', layer: 1, bands: FEU, lines: [
    { fr: 'Ma chaussure de peau est percée au talon. Je la recoudrai ce soir, près du feu.', en: 'My hide shoe has a hole in the heel. I’ll stitch it tonight by the fire.' },
  ] },
  { id: 'f-t-chien', kind: 'thought', layer: 1, bands: FEU, lines: [
    { fr: 'Le chien a encore volé un poisson sur le séchoir. Je l’ai vu filer vers la rivière.', en: 'The dog stole a fish off the drying rack again. I saw it run off towards the river.' },
  ] },

  // ── Pensées, le métier ──
  { id: 'f-t-noisetiers', kind: 'thought', layer: 1, bands: FEU, when: { job: ['gatherer'] }, lines: [
    { fr: 'Les noisetiers du ravin, c’est fini pour cette année. Demain je monte vers les rochers.', en: 'The ravine hazels are done for this year. Tomorrow I’ll head up towards the rocks.' },
  ] },
  { id: 'f-t-mures', kind: 'thought', layer: 1, bands: FEU, when: { job: ['gatherer'] }, lines: [
    { fr: 'Il y a des mûres derrière la grande souche. Personne ne les a vues. Je n’en parle à personne.', en: 'There are blackberries behind the big stump. Nobody’s seen them. I’m not telling anyone.' },
  ] },
  { id: 'f-t-gros-poisson', kind: 'thought', layer: 1, bands: FEU, when: { job: ['fisher'] }, lines: [
    { fr: 'Le gros poisson est encore sous la pierre plate du gué. Ça fait trois jours que je le vois.', en: 'The big fish is still under the flat stone at the ford. I’ve seen it three days running.' },
  ] },
  { id: 'f-t-nasse', kind: 'thought', layer: 1, bands: FEU, when: { job: ['fisher'] }, lines: [
    { fr: 'Il faut que je retende la nasse avant que la rivière monte.', en: 'I need to reset the fish trap before the river rises.' },
  ] },
  { id: 'f-t-fumee', kind: 'thought', layer: 1, bands: FEU, when: { job: ['shaman', 'priest'] }, lines: [
    { fr: 'Ils attendent que je dise si on part avant l’hiver. Je n’ai encore rien vu dans la fumée.', en: 'They’re waiting for me to say whether we leave before winter. I haven’t seen anything in the smoke yet.' },
  ] },
  { id: 'f-t-herbes', kind: 'thought', layer: 1, bands: FEU, when: { job: ['shaman'] }, lines: [
    { fr: '{gamine} veut apprendre les herbes. Elle a la main sûre.', en: '{gamine} wants to learn the herbs. She has a steady hand.' },
  ] },
  { id: 'f-t-ocre', kind: 'thought', layer: 1, bands: FEU, when: { job: ['priest', 'shaman'] }, lines: [
    { fr: 'Il faut repasser de l’ocre sur les pierres du cercle avant la nouvelle lune.', en: 'The circle stones need fresh ochre before the new moon.' },
  ] },
  { id: 'f-t-ours', kind: 'thought', layer: 1, bands: FEU, when: { job: ['storyteller'] }, lines: [
    { fr: 'Ce soir, ils voudront encore l’histoire de l’ours. Je ne sais plus comment ma grand-mère la finissait.', en: 'Tonight they’ll want the bear story again. I can’t remember how my grandmother ended it.' },
  ] },
  { id: 'f-t-sel', kind: 'thought', layer: 1, bands: FEU, when: { job: ['caravaneer'] }, lines: [
    { fr: 'Huit jours jusqu’au clan du lac, avec le sel. Si les loups nous laissent tranquilles.', en: 'Eight days to the lake clan with the salt. If the wolves leave us alone.' },
  ] },
  { id: 'f-t-silex-troc', kind: 'thought', layer: 1, bands: FEU, when: { job: ['merchant'] }, lines: [
    { fr: 'Trois peaux contre un bon silex. Ceux de la colline en demandent quatre, maintenant.', en: 'Three hides for a good flint. The hill people want four now.' },
  ] },
  { id: 'f-t-rats', kind: 'thought', layer: 1, bands: FEU, when: { job: ['storekeeper'] }, lines: [
    { fr: 'Il faut monter les paniers de noisettes plus haut. Les rats ont trouvé le chemin.', en: 'The nut baskets need to go higher. The rats have found the way up.' },
  ] },
  { id: 'f-t-bord-camp', kind: 'thought', layer: 1, bands: FEU, when: { job: ['watchman', 'guard'] }, lines: [
    { fr: 'Toute la nuit au bord du camp. Si rien ne bouge, je dormirai au matin.', en: 'All night at the edge of the camp. If nothing moves, I’ll sleep in the morning.' },
  ] },
  { id: 'f-t-encoches', kind: 'thought', layer: 1, bands: FEU, when: { job: ['scribe'] }, lines: [
    { fr: 'Encore six encoches sur le bâton des lunes. Le vieux veut savoir quand reviendront les oies.', en: 'Six more notches on the moon stick. The old man wants to know when the geese will be back.' },
  ] },
  { id: 'f-t-carriere', kind: 'thought', layer: 1, bands: FEU, when: { job: ['artisan'] }, lines: [
    { fr: 'Il me faut un silex de la carrière du nord. Ceux d’ici éclatent de travers.', en: 'I need flint from the northern quarry. The stones round here split crooked.' },
  ] },
  { id: 'f-t-resine', kind: 'thought', layer: 1, bands: FEU, when: { job: ['boatman'] }, lines: [
    { fr: 'La pirogue prend l’eau à l’arrière. Encore de la résine avant demain.', en: 'The canoe’s leaking at the back. More resin before tomorrow.' },
  ] },
  { id: 'f-t-semis', kind: 'thought', layer: 1, bands: FEU, when: { job: ['farmer', 'agronomist'] }, lines: [
    { fr: 'Les oiseaux ont mangé la moitié des grains. L’an prochain, je mettrai des enfants à les chasser.', en: 'The birds ate half the seed. Next year I’ll set the children to chase them off.' },
  ] },
  { id: 'f-t-sangle', kind: 'thought', layer: 1, bands: FEU, when: { job: ['basket'] }, lines: [
    { fr: 'La sangle du panier me scie le front. Encore jusqu’au grand feu, et je le pose.', en: 'The basket strap is sawing into my forehead. As far as the big fire, then I set it down.' },
  ] },
  { id: 'f-t-perches', kind: 'thought', layer: 1, bands: FEU, when: { job: ['builder'] }, lines: [
    { fr: 'Encore dix perches à planter pour le grand abri. Les jeunes tiennent mal la corde.', en: 'Ten more poles to set for the big shelter. The young ones don’t hold the rope right.' },
  ] },

  // ── Pensées, sa famille, son âge ──
  { id: 'f-t-collets', kind: 'thought', layer: 1, bands: FEU, when: { family: 'married' }, lines: [
    { fr: '{conjoint} a encore rapporté un lièvre. Personne ne pose les collets comme ça.', en: '{conjoint} brought back another hare. Nobody sets snares like that.' },
  ] },
  { id: 'f-t-toux', kind: 'thought', layer: 1, bands: FEU, when: { kids: true }, lines: [
    { fr: '{enfant} tousse depuis trois nuits. Demain, si ça continue, je l’emmène chez la vieille aux herbes.', en: '{enfant} has been coughing for three nights. Tomorrow, if it keeps on, I’m taking them to the herb woman.' },
  ] },
  { id: 'f-t-source', kind: 'thought', layer: 1, bands: FEU, when: { notJob: ['shaman'], family: 'single' }, lines: [
    { m: 'Si je passe par la source, je verrai peut-être la fille du chaman.', f: 'Si je passe par la source, je verrai peut-être le fils du chaman.', en: 'If I go by the spring, I might run into the shaman’s eldest.' },
  ] },
  { id: 'f-t-annee-loups', kind: 'thought', layer: 1, bands: FEU, when: { old: true }, lines: [
    { m: 'Quand j’étais petit, le camp était de l’autre côté de la rivière. On a traversé l’année des loups.', f: 'Quand j’étais petite, le camp était de l’autre côté de la rivière. On a traversé l’année des loups.', en: 'When I was small, the camp was across the river. We moved over the year of the wolves.' },
  ] },
  { id: 'f-t-place', kind: 'thought', layer: 1, bands: FEU, when: { family: 'lodger' }, lines: [
    { fr: 'Je dors au fond de l’abri de {hote}. Il faudra que je rapporte plus de bois pour payer ma place.', en: 'I sleep at the back of {hote}’s shelter. I’ll have to bring more wood to earn my place.' },
  ] },
  { id: 'f-t-graisse-cousins', kind: 'thought', layer: 1, bands: FEU, when: { family: 'nephew' }, lines: [
    { fr: 'Chez {hote}, je mange après les cousins. Ce soir, il restera peut-être de la graisse.', en: 'At {hote}’s I eat after the cousins. Tonight there might be some fat left.' },
  ] },
  { id: 'f-t-enfant-ours', kind: 'thought', layer: 1, bands: FEU, when: { child: true }, lines: [
    { fr: '{gamin} dit qu’il a vu un ours au ravin. Il ment tout le temps. J’irai voir quand même.', en: '{gamin} says he saw a bear in the ravine. He lies all the time. I’ll go and look anyway.' },
  ] },
  { id: 'f-t-enfant-torche', kind: 'thought', layer: 1, bands: FEU, when: { child: true }, lines: [
    { fr: 'On m’a laissé porter la torche jusqu’à la source. Je ne l’ai pas fait tomber une seule fois.', en: 'They let me carry the torch to the spring. I didn’t drop it once.' },
  ] },
  { id: 'f-t-enfant-doigt', kind: 'thought', layer: 1, bands: FEU, when: { child: true }, lines: [
    { fr: 'J’ai touché le feu pour montrer aux autres. J’ai encore mal au doigt.', en: 'I touched the fire to show the others. My finger still hurts.' },
  ] },

  // ── Pensées, son caractère ──
  { id: 'f-t-grumpy', adult: true, kind: 'thought', layer: 1, bands: FEU, when: { trait: 'grumpy' }, lines: [
    { fr: '{gamin} a encore pris mes braises sans demander. La prochaine fois, je lui tire l’oreille.', en: '{gamin} took my embers again without asking. Next time I’ll pull his ear.' },
  ] },
  { id: 'f-t-superstitious', adult: true, kind: 'thought', layer: 1, bands: FEU, when: { trait: 'superstitious' }, lines: [
    { fr: 'Un corbeau sur l’abri, ce matin. Je ne sors pas les peaux aujourd’hui.', en: 'A crow on the shelter this morning. I’m not putting the hides out today.' },
  ] },
  { id: 'f-t-cheerful', kind: 'thought', layer: 1, bands: FEU, when: { trait: 'cheerful' }, lines: [
    { fr: 'Le soleil est revenu. Je vais trier les noisettes au bord de l’eau, au chaud.', en: 'The sun’s back. I’ll sort the hazelnuts by the water, in the warm.' },
  ] },
  { id: 'f-t-chatty', kind: 'thought', layer: 1, bands: FEU, when: { trait: 'chatty' }, lines: [
    { fr: 'Il faut que je dise à quelqu’un ce que j’ai vu derrière l’abri. Pas à ma sœur, elle le répéterait au grand feu.', en: 'I have to tell someone what I saw behind the shelter. Not my sister. She’d repeat it at the big fire.' },
  ] },
  { id: 'f-t-greedy', kind: 'thought', layer: 1, bands: FEU, when: { trait: 'greedy' }, lines: [
    { fr: 'Ça sent la viande grillée du côté de chez {voisin}. Je vais passer devant, juste pour voir.', en: 'There’s a smell of roast meat over by {voisin}’s. I’ll walk past, just to see.' },
  ] },
  { id: 'f-t-curious', kind: 'thought', layer: 1, bands: FEU, when: { trait: 'curious' }, lines: [
    { fr: 'Il y a des traces près de la source que je ne connais pas. Trop grandes pour un renard.', en: 'There are tracks by the spring I don’t recognise. Too big for a fox.' },
  ] },
  { id: 'f-t-thrifty', adult: true, kind: 'thought', layer: 1, bands: FEU, when: { trait: 'thrifty' }, lines: [
    { fr: 'Je garde la graisse dans l’outre, pour l’hiver. Personne n’y touche.', en: 'I keep the fat in the skin bag for winter. Nobody touches it.' },
  ] },
  { id: 'f-t-generous', adult: true, kind: 'thought', layer: 1, bands: FEU, when: { trait: 'generous' }, lines: [
    { fr: 'J’ai encore deux poissons. La veuve de Garn n’a rien eu hier.', en: 'I’ve still got two fish. Garn’s widow got nothing yesterday.' },
  ] },
  { id: 'f-t-stubborn', kind: 'thought', layer: 1, bands: FEU, when: { trait: 'stubborn' }, lines: [
    { fr: 'Ils disent que la source du haut est tarie. J’irai voir moi-même.', en: 'They say the upper spring has dried up. I’ll go and see for myself.' },
  ] },
  { id: 'f-t-early', kind: 'thought', layer: 1, bands: FEU, when: { trait: 'early' }, lines: [
    { fr: 'Personne n’est levé. Je ravive le feu avant qu’ils se plaignent du froid.', en: 'Nobody’s up. I’ll stir the fire before they start complaining about the cold.' },
  ] },
  { id: 'f-t-chilly', kind: 'thought', layer: 1, bands: FEU, when: { trait: 'chilly' }, lines: [
    { fr: 'J’aurais dû prendre la peau d’ours, pas celle du cerf.', en: 'I should have taken the bearskin, not the deer hide.' },
  ] },
  { id: 'f-t-brave', kind: 'thought', layer: 1, bands: FEU, when: { trait: 'brave', riot: true }, lines: [
    { fr: 'Ils se battent pour la viande. Il faut que quelqu’un les sépare avant qu’il y ait du sang.', en: 'They’re fighting over the meat. Someone has to pull them apart before there’s blood.' },
  ] },
  { id: 'f-t-cautious', adult: true, kind: 'thought', layer: 1, bands: FEU, when: { trait: 'cautious', riot: true }, lines: [
    { fr: 'Contourner le grand feu par les rochers, prendre les petits, attendre que ça se calme.', en: 'Go round the big fire by the rocks, take the little ones, wait for it to calm down.' },
  ] },
  { id: 'f-t-quiet', kind: 'thought', layer: 1, bands: FEU, when: { trait: 'quiet' }, lines: [
    { fr: 'Au grand feu, ils parlent tous en même temps. Je vais m’asseoir près des chiens.', en: 'At the big fire they all talk at once. I’ll go and sit with the dogs.' },
  ] },
  { id: 'f-t-proud', kind: 'thought', layer: 1, bands: FEU, when: { trait: 'proud' }, lines: [
    { fr: 'Mon panier est le plus serré du camp. Même la vieille aux herbes l’a dit.', en: 'My basket is the tightest weave in the camp. Even the herb woman said so.' },
  ] },
  { id: 'f-t-spiteful', adult: true, kind: 'thought', layer: 1, bands: FEU, when: { trait: 'spiteful' }, lines: [
    { m: '{voisine} m’a salué comme si de rien n’était. Moi, je n’ai pas oublié l’histoire du lièvre.', f: '{voisine} m’a saluée comme si de rien n’était. Moi, je n’ai pas oublié l’histoire du lièvre.', en: '{voisine} greeted me as if nothing had happened. I haven’t forgotten the business with the hare.' },
  ] },
  { id: 'f-t-absent', kind: 'thought', layer: 1, bands: FEU, when: { trait: 'absent' }, lines: [
    { fr: 'Où est-ce que j’ai posé mon grattoir ? Je l’avais en sortant de l’abri.', en: 'Where did I put my scraper? I had it when I came out of the shelter.' },
  ] },
  { id: 'f-t-dreamy', kind: 'thought', layer: 1, bands: FEU, when: { trait: 'dreamy' }, lines: [
    { fr: 'Si on suivait la rivière jusqu’au bout, on arriverait où ?', en: 'If we followed the river all the way, where would we end up?' },
  ] },
  { id: 'f-t-pious', kind: 'thought', layer: 1, bands: FEU, when: { trait: 'pious' }, lines: [
    { fr: 'J’ai posé une noisette sur la pierre des ancêtres. Ma mère disait qu’ils aimaient les noisettes.', en: 'I left a hazelnut on the ancestors’ stone. My mother said they liked hazelnuts.' },
  ] },
  { id: 'f-t-hardworking', adult: true, kind: 'thought', layer: 1, bands: FEU, when: { trait: 'hardworking' }, lines: [
    { fr: 'Si je finis de gratter cette peau ce soir, je commence la deuxième demain.', en: 'If I finish scraping this hide tonight, I’ll start the second one tomorrow.' },
  ] },

  // ── Pensées, le camp tel qu'il va ──
  { id: 'f-t-racines', adult: true, kind: 'thought', layer: 2, bands: FEU, when: { cause: 'scarcity' }, lines: [
    { fr: 'On a fini les racines séchées. Il reste les glands. Il faudra les faire tremper.', en: 'The dried roots are finished. There are acorns left. They’ll need soaking.' },
  ] },
  { id: 'f-t-peaux-dehors', kind: 'thought', layer: 2, bands: FEU, when: { precip: 'rain' }, lines: [
    { fr: 'Les peaux qui sèchent dehors. Personne ne les aura rentrées.', en: 'The hides drying outside. Nobody will have brought them in.' },
  ] },
  { id: 'f-t-traces', kind: 'thought', layer: 2, bands: FEU, when: { precip: 'snow' }, lines: [
    { fr: 'Avec cette neige, on verra les traces du cerf jusqu’au ravin.', en: 'With this snow we’ll see the deer’s tracks all the way to the ravine.' },
  ] },
  { id: 'f-t-feu-baisse', kind: 'thought', layer: 2, bands: FEU, when: { night: true }, lines: [
    { fr: 'Le feu baisse. Quelqu’un doit remettre du bois, et ce sera encore moi.', en: 'The fire’s dying down. Someone has to put wood on, and it’ll be me again.' },
  ] },
  { id: 'f-t-cris', kind: 'thought', layer: 2, bands: FEU, when: { riot: true }, lines: [
    { fr: 'Ils crient autour du grand feu. Je ne sais pas encore qui a commencé.', en: 'They’re shouting round the big fire. I don’t know yet who started it.' },
  ] },
  { id: 'f-t-merveille', kind: 'thought', layer: 2, bands: FEU, when: { notJob: ['shaman'], wonder: true }, lines: [
    { fr: 'Le chaman dit que ce qu’ils ont bâti sur la colline se verra depuis le clan du lac.', en: 'The shaman says what they’ve built on the hill can be seen from the lake clan.' },
  ] },
  { id: 'f-t-ecorce', kind: 'thought', layer: 2, bands: FEU, when: { prosper: true }, lines: [
    { fr: 'Les paniers sont pleins. Cet hiver, personne ne mangera d’écorce.', en: 'The baskets are full. This winter nobody will be eating bark.' },
  ] },
  { id: 'f-t-abri-chef', kind: 'thought', layer: 2, bands: FEU, when: { cause: 'inequality' }, lines: [
    { fr: 'L’abri du chef a encore trois peaux de plus. Le nôtre laisse passer le vent.', en: 'The chief’s shelter has three more hides. Ours lets the wind through.' },
  ] },
  { id: 'f-t-qui-ecouter', kind: 'thought', layer: 2, bands: FEU, when: { notJob: ['shaman'], cause: 'dissent' }, lines: [
    { fr: 'Ceux du grand feu disent que le chaman se trompe. Je ne sais pas qui écouter.', en: 'The ones at the big fire say the shaman is wrong. I don’t know who to listen to.' },
  ] },
  { id: 'f-t-perche-cassee', adult: true, kind: 'thought', layer: 2, bands: FEU, when: { cause: 'structural' }, lines: [
    { fr: 'Une perche de l’abri a cassé cette nuit. On a dormi sous la peau tombée.', en: 'A shelter pole snapped in the night. We slept under the fallen hide.' },
  ] },
  { id: 'f-t-grattoir', adult: true, kind: 'thought', layer: 2, bands: FEU, when: { cause: 'wear' }, lines: [
    { fr: 'Mon grattoir ne coupe plus. {voisin} m’en taillera un autre contre du poisson.', en: 'My scraper won’t cut. {voisin} will knap me another for some fish.' },
  ] },
  { id: 'f-t-chaman-lent', kind: 'thought', layer: 2, bands: FEU, when: { notJob: ['shaman'], cause: 'complexity' }, lines: [
    { fr: 'Pour pêcher au gué, il faut maintenant attendre que le chaman ait parlé. Il parle lentement.', en: 'To fish at the ford you now have to wait for the shaman to speak. He speaks slowly.' },
  ] },
  { id: 'f-t-peau-loup', adult: true, kind: 'thought', layer: 2, bands: FEU, when: { cause: 'poverty' }, lines: [
    { fr: 'Plus rien à échanger. Il me reste la peau de loup, et je ne veux pas la donner.', en: 'Nothing left to trade. I’ve still got the wolfskin, and I don’t want to give it up.' },
  ] },
  { id: 'f-t-noms', kind: 'thought', layer: 2, bands: FEU, when: { cause: 'demesure' }, lines: [
    { fr: 'Le camp est si grand que je ne connais plus le nom de ceux du bout.', en: 'The camp’s so big I don’t know the names of the ones at the far end anymore.' },
  ] },
  { id: 'f-t-automne', kind: 'thought', layer: 2, bands: FEU, when: { season: 'autumn' }, lines: [
    { fr: 'Les noisettes tombent. Il faudra tout ramasser avant les sangliers.', en: 'The hazelnuts are falling. We’ll have to gather everything before the boars do.' },
  ] },
  { id: 'f-t-printemps', kind: 'thought', layer: 2, bands: FEU, when: { season: 'spring' }, lines: [
    { fr: 'Les oies reviennent. Ma mère disait qu’après les oies, on pouvait ranger les grosses peaux.', en: 'The geese are back. My mother said once the geese came, you could put the heavy hides away.' },
  ] },
  { id: 'f-t-ete', adult: true, kind: 'thought', layer: 2, bands: FEU, when: { season: 'summer' }, lines: [
    { fr: 'Les enfants vont encore passer la journée dans la rivière. Au moins, ils seront propres.', en: 'The children will spend the whole day in the river again. At least they’ll be clean.' },
  ] },
  { id: 'f-t-hiver', adult: true, kind: 'thought', layer: 2, bands: FEU, when: { season: 'winter' }, lines: [
    { fr: 'Encore deux lunes de froid. Je compte les paniers tous les soirs.', en: 'Two more moons of cold. I count the baskets every evening.' },
  ] },

  // ══ PIERRE TAILLÉE ET COURONNE ═══════════════════════════════════════════════
  // ── Causettes, leur vie ──
  { id: 'b-c-sel', kind: 'chat', layer: 1, bands: [2, 3], when: { rel: 'couple' }, lines: [
    { who: 'a', fr: 'Tu as pensé au sel ?', en: 'Did you remember the salt?' },
    { who: 'b', fr: 'Il n’y en avait plus chez Odile. Elle en attend pour mardi.', en: 'Odile had none left. She’s expecting some on Tuesday.' },
    { who: 'a', fr: 'Bon. On fera sans jusqu’à mardi.', en: 'Fine. We’ll do without till Tuesday.' },
  ] },
  { id: 'b-c-tuiles', kind: 'chat', layer: 1, bands: [2, 3], lines: [
    { who: 'a', fr: 'Tu vas où comme ça ?', en: 'Where are you off to?' },
    { who: 'b', fr: 'Chez ma sœur. Son toit a encore pris l’eau.', en: 'My sister’s. Her roof let the rain in again.' },
    { who: 'a', fr: 'Dis-lui que j’ai des tuiles en trop, derrière la maison.', en: 'Tell her I’ve got spare tiles behind the house.' },
  ] },
  { id: 'b-c-foire', kind: 'chat', layer: 1, bands: [2, 3], lines: [
    { who: 'a', fr: 'Tu viens à la foire jeudi ?', en: 'Coming to the fair on Thursday?' },
    { who: 'b', fr: 'Si la vache a vêlé d’ici là.', en: 'If the cow has calved by then.' },
  ] },
  { id: 'b-c-sou-puits', kind: 'chat', layer: 1, bands: [2, 3], when: { rel: 'parentKid' }, lines: [
    { who: 'kid', fr: 'Je peux garder le sou que j’ai trouvé ?', en: 'Can I keep the coin I found?' },
    { who: 'parent', fr: 'Où ça ?', en: 'Where?' },
    { who: 'kid', fr: 'Près du puits.', en: 'By the well.' },
    { who: 'parent', fr: 'Alors c’est celui de {voisine}. Elle le cherche depuis ce matin.', en: 'Then it’s {voisine}’s. She’s been looking for it all morning.' },
  ] },
  { id: 'b-c-foire-seul', kind: 'chat', layer: 1, bands: [2, 3], when: { rel: 'parentKid' }, lines: [
    { who: 'kid', m: 'Quand je serai grand, je pourrai aller à la foire tout seul ?', f: 'Quand je serai grande, je pourrai aller à la foire toute seule ?', en: 'When I’m bigger, can I go to the fair on my own?' },
    { who: 'parent', fr: 'Quand tu sauras compter la monnaie.', en: 'When you can count your change.' },
  ] },
  { id: 'b-c-ecole', kind: 'chat', layer: 1, bands: [2, 4], when: { rel: 'parentKid' }, lines: [
    { who: 'parent', fr: 'Qu’est-ce que vous avez fait, à l’école ?', en: 'What did you do at school?' },
    { who: 'kid', fr: 'Des lettres. J’ai fait le G à l’envers, il a fallu refaire toute la ligne.', en: 'Letters. I did the G backwards and had to redo the whole line.' },
  ] },
  { id: 'b-c-garde', kind: 'chat', layer: 1, bands: BOURG, when: { job: ['guard'] }, lines: [
    { who: 'b', fr: 'Rien de neuf ?', en: 'Anything new?' },
    { who: 'a', fr: 'Des gamins qui jetaient des pierres sur le pigeonnier. Je les ai renvoyés chez eux.', en: 'Some kids throwing stones at the dovecote. I sent them home.' },
    { who: 'b', fr: 'Les fils du charron ?', en: 'The cartwright’s boys?' },
    { who: 'a', fr: 'Qui d’autre.', en: 'Who else.' },
  ] },
  { id: 'b-c-pommes', kind: 'chat', layer: 1, bands: [2, 3], when: { job: ['merchant'] }, lines: [
    { who: 'b', fr: 'Elles sont à combien, tes pommes ?', en: 'How much are your apples?' },
    { who: 'a', fr: 'Deux sous le panier. Trois pour celles du verger d’en haut.', en: 'Two sous a basket. Three for the ones from the upper orchard.' },
    { who: 'b', fr: 'Donne-m’en un panier. Pas les tachées.', en: 'Give me a basket. Not the spotted ones.' },
  ] },
  { id: 'b-c-pain-hier', kind: 'chat', layer: 1, bands: BOURG, when: { job: ['baker'] }, lines: [
    { who: 'b', fr: 'Il te reste du pain ?', en: 'Any bread left?' },
    { who: 'a', fr: 'Deux miches d’hier. Le four a mal chauffé ce matin, je n’ai pas pu tout cuire.', en: 'Two loaves from yesterday. The oven didn’t heat right this morning, I couldn’t bake it all.' },
    { who: 'b', fr: 'Je prends les deux.', en: 'I’ll take both.' },
  ] },
  { id: 'b-c-puits-gele', kind: 'chat', layer: 1, bands: [2, 3], when: { old: true }, lines: [
    { who: 'a', m: 'L’hiver où je suis né, le puits a gelé.', f: 'L’hiver où je suis née, le puits a gelé.', en: 'The winter I was born, the well froze.' },
    { who: 'b', fr: 'Le puits entier ?', en: 'The whole well?' },
    { who: 'a', fr: 'Mon père cassait la glace à la pioche tous les matins.', en: 'My father broke the ice with a pick every morning.' },
  ] },
  { id: 'b-c-foin', kind: 'chat', layer: 1, bands: [2, 3], when: { group: ['food'] }, lines: [
    { who: 'b', fr: 'Tu as fini de faucher ?', en: 'Done mowing?' },
    { who: 'a', fr: 'Le pré du bas, oui. Celui du haut attendra que le temps se lève.', en: 'The lower meadow, yes. The upper one can wait for the weather to clear.' },
  ] },
  { id: 'b-c-moine', kind: 'chat', layer: 1, bands: BOURG, when: { job: ['monk'] }, lines: [
    { who: 'b', fr: 'Tu pries pour qui, aujourd’hui ?', en: 'Who are you praying for today?' },
    { who: 'a', fr: 'Pour la récolte, pour le fils du meunier qui a la fièvre, et pour moi s’il reste du temps.', en: 'For the harvest, for the miller’s boy who has a fever, and for myself if there’s time left.' },
  ] },
  { id: 'b-c-tonnelier', kind: 'chat', layer: 1, bands: [2, 3], when: { notJob: ['miller'], trait: 'chatty' }, lines: [
    { who: 'a', fr: 'Tu sais que la fille du tonnelier se marie ?', en: 'Did you know the cooper’s daughter is getting married?' },
    { who: 'b', fr: 'Avec qui ?', en: 'Who to?' },
    { who: 'a', fr: 'Le fils du meunier. Sa mère n’est pas contente.', en: 'The miller’s son. His mother isn’t pleased.' },
  ] },
  { id: 'b-c-forgeron', kind: 'chat', layer: 1, bands: [2, 4], when: { rel: 'couple', kids: true }, lines: [
    { who: 'a', fr: '{enfant} ne veut plus aller à l’école.', en: '{enfant} doesn’t want to go to school anymore.' },
    { who: 'b', fr: 'Pourquoi ?', en: 'Why?' },
    { who: 'a', fr: 'Le fils du forgeron lui prend son pain tous les matins.', en: 'The blacksmith’s boy takes their bread every morning.' },
    { who: 'b', fr: 'Je passerai voir le forgeron.', en: 'I’ll go and see the blacksmith.' },
  ] },
  { id: 'b-c-bailli', adult: true, kind: 'chat', layer: 1, bands: [3, 3], lines: [
    { who: 'a', fr: 'Le bailli passe jeudi pour la taille.', en: 'The bailiff comes on Thursday for the tax.' },
    { who: 'b', fr: 'Encore ? Il est passé après les moissons.', en: 'Again? He came after the harvest.' },
    { who: 'a', fr: 'C’était pour le seigneur. Celle-ci est pour le roi.', en: 'That was for the lord. This one’s for the king.' },
  ] },
  { id: 'b-c-chiens', adult: true, kind: 'chat', layer: 1, bands: [3, 3], when: { group: ['food'] }, lines: [
    { who: 'a', fr: 'Les chiens du seigneur ont encore traversé mon champ.', en: 'The lord’s hounds went through my field again.' },
    { who: 'b', fr: 'Tu ne peux rien dire.', en: 'You can’t say anything.' },
    { who: 'a', fr: 'Je sais. Je compte les rangs de pois, c’est tout.', en: 'I know. I’m counting the rows of peas, that’s all.' },
  ] },
  { id: 'b-c-mur-place', kind: 'chat', layer: 1, bands: [2, 2], lines: [
    { who: 'a', fr: 'Ils ont commencé le mur de la place.', en: 'They’ve started the wall on the square.' },
    { who: 'b', fr: 'En pierre taillée ?', en: 'In cut stone?' },
    { who: 'a', fr: 'Mon cousin y travaille. Il dit qu’ils sont payés en pain.', en: 'My cousin’s working on it. He says they’re paid in bread.' },
  ] },

  // ── Causettes, le bourg tel qu'il va ──
  { id: 'b-c-farine', kind: 'chat', layer: 2, bands: [2, 3], when: { notJob: ['miller'], cause: 'scarcity' }, lines: [
    { who: 'a', fr: 'Plus de farine au moulin.', en: 'No flour left at the mill.' },
    { who: 'b', fr: 'Il y en avait mardi.', en: 'There was some on Tuesday.' },
    { who: 'a', fr: 'Le meunier attend la charrette de grain depuis trois jours.', en: 'The miller’s been waiting three days for the grain cart.' },
  ] },
  { id: 'b-c-vitres', kind: 'chat', layer: 2, bands: [3, 3], when: { cause: 'inequality' }, lines: [
    { who: 'a', fr: 'Ils ont refait la façade de la maison du bailli.', en: 'They’ve redone the front of the bailiff’s house.' },
    { who: 'b', fr: 'Avec quel argent ?', en: 'With what money?' },
    { who: 'a', fr: 'Ma sœur y fait le ménage. Elle dit qu’il y a des vitres à toutes les fenêtres.', en: 'My sister cleans there. She says there’s glass in every window.' },
  ] },
  { id: 'b-c-sceau', adult: true, kind: 'chat', layer: 2, bands: [3, 3], when: { notJob: ['courtClerk', 'scribe'], cause: 'complexity' }, lines: [
    { who: 'a', fr: 'Il faut un sceau du greffe pour vendre une chèvre, maintenant.', en: 'You need a seal from the registry to sell a goat now.' },
    { who: 'b', fr: 'Depuis quand ?', en: 'Since when?' },
    { who: 'a', m: 'Depuis la foire. J’y suis allé deux fois, le greffier n’était pas là.', f: 'Depuis la foire. J’y suis allée deux fois, le greffier n’était pas là.', en: 'Since the fair. I went twice and the clerk wasn’t there.' },
  ] },
  { id: 'b-c-conseil-grain', kind: 'chat', layer: 2, bands: [2, 3], when: { cause: 'dissent' }, lines: [
    { who: 'a', fr: 'Au puits, ils disaient que le conseil cache du grain.', en: 'At the well they were saying the council’s hiding grain.' },
    { who: 'b', fr: 'Tu le crois ?', en: 'Do you believe it?' },
    { who: 'a', fr: 'Je ne sais pas. Mais le fils du conseiller mange de la viande tous les jours.', en: 'I don’t know. But the councillor’s son eats meat every day.' },
  ] },
  { id: 'b-c-poutres', adult: true, kind: 'chat', layer: 2, bands: [2, 3], when: { cause: 'structural' }, lines: [
    { who: 'a', fr: 'Le mur de la cour penche encore.', en: 'The yard wall’s leaning again.' },
    { who: 'b', fr: 'Ne laisse pas les enfants jouer contre.', en: 'Don’t let the children play against it.' },
    { who: 'a', fr: 'Je l’ai étayé avec deux poutres. Ça tiendra jusqu’au printemps.', en: 'I’ve propped it up with two beams. It’ll hold till spring.' },
  ] },
  { id: 'b-c-marche', adult: true, kind: 'chat', layer: 2, bands: [3, 6], when: { cause: 'wear' }, lines: [
    { who: 'a', fr: 'L’escalier de la cour a encore perdu une marche.', en: 'The yard stairs have lost another step.' },
    { who: 'b', fr: 'Tu as prévenu le propriétaire ?', en: 'Did you tell the landlord?' },
    { who: 'a', fr: 'Trois fois.', en: 'Three times.' },
  ] },
  { id: 'b-c-deux-sous', adult: true, kind: 'chat', layer: 2, bands: [2, 3], when: { cause: 'poverty' }, lines: [
    { who: 'a', fr: 'Tu peux me prêter deux sous jusqu’à samedi ?', en: 'Can you lend me two sous till Saturday?' },
    { who: 'b', fr: 'Je te les prêterais si je les avais. Demande à Odile, elle a vendu son cochon.', en: 'I would if I had them. Ask Odile, she’s sold her pig.' },
  ] },
  { id: 'b-c-chaume', kind: 'chat', layer: 2, bands: BOURG, when: { precip: 'rain' }, lines: [
    { who: 'a', fr: 'Encore une averse.', en: 'Another downpour.' },
    { who: 'b', fr: 'Ton toit tient ?', en: 'Is your roof holding?' },
    { who: 'a', fr: 'Le chaume, oui. Mais l’eau entre sous la porte. Il faudra rehausser le seuil.', en: 'The thatch, yes. But the water gets in under the door. I’ll have to raise the step.' },
  ] },
  { id: 'b-c-pelle', kind: 'chat', layer: 2, bands: [2, 4], when: { precip: 'snow' }, lines: [
    { who: 'a', fr: 'Il faudra dégager le seuil avant que ça gèle.', en: 'We’ll have to clear the doorstep before it freezes.' },
    { who: 'b', fr: 'Je te prête ma pelle, si tu veux. La tienne a le manche fendu.', en: 'I’ll lend you my shovel if you like. Yours has a split handle.' },
  ] },
  { id: 'b-c-guet', kind: 'chat', layer: 2, bands: [2, 3], when: { notJob: ['guard', 'watchman'], night: true }, lines: [
    { who: 'a', fr: 'On devrait rentrer, le guet va passer.', en: 'We should go in, the watch will be coming round.' },
    { who: 'b', fr: 'Encore un peu. Ils ne disent rien si on marche sans bruit.', en: 'A bit longer. They don’t say anything if we walk quietly.' },
  ] },
  { id: 'b-c-halle', kind: 'chat', layer: 2, bands: [2, 3], when: { notJob: ['guard', 'watchman'], riot: true }, lines: [
    { who: 'a', fr: 'Ne passe pas par la halle ce soir.', en: 'Don’t go by the market hall tonight.' },
    { who: 'b', fr: 'Pourquoi ?', en: 'Why?' },
    { who: 'a', fr: 'Ils ont renversé l’étal du boucher. Le guet arrive avec des bâtons.', en: 'They’ve knocked over the butcher’s stall. The watch is coming with clubs.' },
  ] },
  { id: 'b-c-merveille', kind: 'chat', layer: 2, bands: BOURG, when: { wonder: true }, lines: [
    { who: 'a', fr: 'Tu as vu la merveille de près ?', en: 'Have you seen the wonder up close?' },
    { who: 'b', m: 'J’y suis allé dimanche. Il y avait la queue jusqu’au pont.', f: 'J’y suis allée dimanche. Il y avait la queue jusqu’au pont.', en: 'I went on Sunday. The queue went back to the bridge.' },
  ] },
  { id: 'b-c-prix-pain', kind: 'chat', layer: 2, bands: [2, 3], when: { notJob: ['baker'], prosper: true }, lines: [
    { who: 'a', fr: 'Les entrepôts sont pleins.', en: 'The warehouses are full.' },
    { who: 'b', fr: 'Alors le pain va baisser ?', en: 'So bread will get cheaper?' },
    { who: 'a', fr: 'Le boulanger dit qu’il ne bouge pas ses prix avant la récolte.', en: 'The baker says he won’t change his prices before the harvest.' },
  ] },
  { id: 'b-c-halles', kind: 'chat', layer: 2, bands: [3, 3], when: { cause: 'demesure' }, lines: [
    { who: 'a', fr: 'Il m’a fallu toute la matinée pour aller chez ma sœur.', en: 'It took me all morning to get to my sister’s.' },
    { who: 'b', fr: 'Elle habite où, maintenant ?', en: 'Where does she live now?' },
    { who: 'a', fr: 'Derrière les nouvelles halles. Avant, c’étaient des champs.', en: 'Behind the new market halls. It used to be fields.' },
  ] },
  { id: 'b-c-oeufs', kind: 'chat', layer: 1, bands: [2, 3], when: { doing: ['errand'] }, lines: [
    { who: 'a', fr: 'Les œufs sont à combien, chez la fermière ?', en: 'How much are eggs at the farm woman’s?' },
    { who: 'b', fr: 'Six pour un sou. Ceux de la ferme d’en haut sont plus gros, mais il faut monter.', en: 'Six for a sou. The ones from the upper farm are bigger, but it’s a climb.' },
  ] },

  // ── Pensées, ce qu'il fait ──
  { id: 'b-t-lentilles', kind: 'thought', layer: 1, bands: [2, 5], when: { doing: ['home'], family: 'married' }, lines: [
    { fr: '{conjoint} a dit qu’il restait des lentilles. Avec un oignon, ça fera le repas.', en: '{conjoint} said there were lentils left. With an onion, that’ll make supper.' },
  ] },
  { id: 'b-t-porte', adult: true, kind: 'thought', layer: 1, bands: [2, 4], when: { doing: ['home'] }, lines: [
    { fr: 'Il faut que je rentre avant la nuit. La porte de derrière ferme mal depuis l’orage.', en: 'I need to be home before dark. The back door hasn’t shut properly since the storm.' },
  ] },
  { id: 'b-t-maitre', adult: true, kind: 'thought', layer: 1, bands: [2, 4], when: { group: ['craft', 'food', 'trade', 'carry'], doing: ['work'] }, lines: [
    { fr: 'Si j’arrive en retard, le maître va encore me retenir une heure le soir.', en: 'If I’m late, the master will keep me an extra hour again tonight.' },
  ] },
  { id: 'b-t-liste', adult: true, kind: 'thought', layer: 1, bands: [2, 3], when: { doing: ['errand'] }, lines: [
    { fr: 'Du sel, du fil, et voir si le cordonnier a fini mes souliers.', en: 'Salt, thread, and see if the cobbler has finished my shoes.' },
  ] },
  { id: 'b-t-crieur', kind: 'thought', layer: 1, bands: [2, 3], when: { doing: ['plaza'] }, lines: [
    { fr: 'Le crieur doit passer à midi. On saura enfin la date de la foire.', en: 'The crier comes by at noon. We’ll finally know the date of the fair.' },
  ] },
  { id: 'b-t-dos', adult: true, kind: 'thought', layer: 1, bands: [2, 4], when: { doing: ['pray'] }, lines: [
    { fr: 'Je vais demander aux ancêtres une bonne récolte, et que mon dos tienne jusqu’aux moissons.', en: 'I’ll ask the ancestors for a good harvest, and for my back to hold out till the reaping.' },
  ] },
  { id: 'b-t-fontaine', kind: 'thought', layer: 1, bands: [2, 4], when: { doing: ['wander'], family: 'single' }, lines: [
    { m: 'Si je passe par la fontaine, je verrai peut-être la fille du potier. Je passe par la fontaine.', f: 'Si je passe par la fontaine, je verrai peut-être le fils du potier. Je passe par la fontaine.', en: 'If I go by the fountain, I might see the potter’s eldest. I’m going by the fountain.' },
  ] },
  { id: 'b-t-grincer', adult: true, kind: 'thought', layer: 1, bands: [2, 5], when: { doing: ['night'] }, lines: [
    { fr: 'Si je rentre maintenant, la porte va grincer et réveiller toute la maison.', en: 'If I go in now, the door will creak and wake the whole house.' },
  ] },
  { id: 'b-t-tablette', kind: 'thought', layer: 1, bands: [2, 4], when: { doing: ['school'] }, lines: [
    { fr: 'J’ai oublié ma tablette. Le maître va encore me mettre au fond.', en: 'I forgot my slate. The master will put me at the back again.' },
  ] },
  { id: 'b-t-cloche', kind: 'thought', layer: 1, bands: [2, 5], when: { doing: ['school'] }, lines: [
    { fr: 'Si je passe par le pont, je verrai les bateaux. Mais j’arriverai après la cloche.', en: 'If I go by the bridge, I’ll see the boats. But I’ll get there after the bell.' },
  ] },
  { id: 'b-t-crue', kind: 'thought', layer: 1, bands: [2, 4], when: { doing: ['river'] }, lines: [
    { fr: 'L’eau a monté depuis hier. Les barques du bas touchent presque le quai.', en: 'The water’s risen since yesterday. The boats down there are nearly level with the quay.' },
  ] },
  { id: 'b-t-noyer', kind: 'thought', layer: 1, bands: [2, 5], when: { doing: ['field'] }, lines: [
    { fr: 'Encore trois rangs avant midi. Après, je mange à l’ombre du noyer.', en: 'Three more rows before noon. Then I eat in the shade of the walnut tree.' },
  ] },
  { id: 'b-t-batelier', adult: true, kind: 'thought', layer: 1, bands: [2, 4], when: { notJob: ['boatman'], doing: ['port'] }, lines: [
    { fr: 'Encore deux sacs, et le batelier me paie. Il a dit avant midi, je le prends au mot.', en: 'Two more sacks and the boatman pays me. He said before noon, and I’m holding him to it.' },
  ] },
  { id: 'b-t-jardins', kind: 'thought', layer: 1, bands: [2, 3], when: { doing: ['flee'] }, lines: [
    { fr: 'Par le lavoir, puis les jardins. Personne ne passe par les jardins.', en: 'Through the wash-house, then the gardens. Nobody goes through the gardens.' },
  ] },
  { id: 'b-t-auvent', kind: 'thought', layer: 1, bands: [2, 5], when: { doing: ['shelter'] }, lines: [
    { fr: 'Mes souliers prennent l’eau. Je reste sous l’auvent jusqu’à ce que ça se calme.', en: 'My shoes are letting water in. I’ll stay under the awning till it eases off.' },
  ] },
  { id: 'b-t-coq', kind: 'thought', layer: 1, bands: [2, 3], lines: [
    { fr: 'Le coq de la voisine a chanté toute la nuit. Je dors debout.', en: 'The neighbour’s rooster crowed all night. I’m asleep on my feet.' },
  ] },
  { id: 'b-t-remouleur', adult: true, kind: 'thought', layer: 1, bands: [2, 4], lines: [
    { fr: 'Il faut que je passe chez le rémouleur. Mes couteaux ne coupent plus rien.', en: 'I have to stop at the knife grinder’s. My knives won’t cut a thing.' },
  ] },
  { id: 'b-t-soeur', adult: true, kind: 'thought', layer: 1, bands: [2, 3], lines: [
    { fr: 'J’ai promis à ma sœur de passer la voir avant la foire. Ça fait deux fois que je le dis.', en: 'I promised my sister I’d visit before the fair. That’s twice I’ve said so.' },
  ] },
  { id: 'b-t-cerises', kind: 'thought', layer: 1, bands: [2, 4], when: { child: true }, lines: [
    { fr: 'Il y a des cerises mûres dans le verger d’en haut. Personne ne garde le verger à midi.', en: 'There are ripe cherries in the upper orchard. Nobody watches the orchard at noon.' },
  ] },

  // ── Pensées, le métier ──
  { id: 'b-t-pages', kind: 'thought', layer: 1, bands: BOURG, when: { job: ['monk'] }, lines: [
    { fr: 'Encore douze pages à recopier avant la cloche du soir. La lumière baisse déjà dans la salle.', en: 'Twelve more pages to copy before the evening bell. The light is already going in the hall.' },
  ] },
  { id: 'b-t-croute', kind: 'thought', layer: 1, bands: BOURG, when: { job: ['monk'] }, lines: [
    { fr: 'Le frère cellérier m’a encore donné la croûte. Je l’ai remercié quand même.', en: 'Brother cellarer gave me the crust again. I thanked him anyway.' },
  ] },
  { id: 'b-t-ronde', kind: 'thought', layer: 1, bands: BOURG, when: { job: ['guard'] }, lines: [
    { fr: 'Encore la ronde du marché. Le marchand de vin va me proposer un verre, et je vais dire non.', en: 'The market round again. The wine seller will offer me a cup, and I’ll say no.' },
  ] },
  { id: 'b-t-dague', kind: 'thought', layer: 1, bands: BOURG, when: { job: ['guard'] }, lines: [
    { fr: 'Si le sergent voit que j’ai perdu ma dague, je n’ai pas fini d’en entendre parler.', en: 'If the sergeant sees I’ve lost my dagger, I’ll never hear the end of it.' },
  ] },
  { id: 'b-t-noce', kind: 'thought', layer: 1, bands: BOURG, when: { job: ['baker'] }, lines: [
    { fr: 'Quarante pains pour la noce de la fille du meunier, et le four qui chauffe mal du côté gauche.', en: 'Forty loaves for the miller’s daughter’s wedding, and the oven running cold on the left side.' },
  ] },
  { id: 'b-t-levain', kind: 'thought', layer: 1, bands: BOURG, when: { job: ['baker'] }, lines: [
    { fr: 'Le levain a mal pris cette nuit. Si ça recommence, j’irai demander du sien à la vieille Berthe.', en: 'The starter didn’t take last night. If it happens again, I’ll ask old Berthe for some of hers.' },
  ] },
  { id: 'b-t-limaces', kind: 'thought', layer: 1, bands: [2, 4], when: { job: ['marketGardener'] }, lines: [
    { fr: 'Les limaces ont mangé la moitié des choux. Il faudra mettre de la cendre au pied, ce soir.', en: 'The slugs have eaten half the cabbages. Ashes round the stems tonight.' },
  ] },
  { id: 'b-t-deux-sacs', kind: 'thought', layer: 1, bands: [2, 3], when: { job: ['storekeeper'] }, lines: [
    { fr: 'Il faut compter les sacs avant que le bailli passe. Il en manquera deux. Il en manque toujours deux.', en: 'The sacks need counting before the bailiff comes. Two will be missing. Two are always missing.' },
  ] },
  { id: 'b-t-mulet', kind: 'thought', layer: 1, bands: [2, 3], when: { job: ['caravaneer'] }, lines: [
    { fr: 'Dix jours jusqu’à la foire du sel, si le gué n’a pas monté. Le mulet boite déjà.', en: 'Ten days to the salt fair, if the ford hasn’t risen. The mule is already limping.' },
  ] },
  { id: 'b-t-ombre', kind: 'thought', layer: 1, bands: [2, 3], when: { job: ['merchant'] }, lines: [
    { fr: 'Il faut que je sois au marché avant ceux de la Combe, sinon ils prennent la place à l’ombre.', en: 'I have to get to the market before the Combe lot, or they’ll take the shady spot.' },
  ] },
  { id: 'b-t-panneton', kind: 'thought', layer: 1, bands: [2, 3], when: { job: ['artisan'] }, lines: [
    { fr: 'Le maître veut la serrure pour demain. Il ne reste qu’à limer le panneton.', en: 'The master wants the lock for tomorrow. Just the key bit left to file.' },
  ] },
  { id: 'b-t-foin', kind: 'thought', layer: 1, bands: [2, 3], when: { job: ['farmer'] }, lines: [
    { fr: 'Si le temps tient jusqu’à jeudi, on rentre tout le foin. Sinon, il pourrira au pré.', en: 'If the weather holds till Thursday, we get all the hay in. Otherwise it rots in the meadow.' },
  ] },
  { id: 'b-t-poix', kind: 'thought', layer: 1, bands: [2, 3], when: { job: ['boatman'] }, lines: [
    { fr: 'La barque prend l’eau à l’arrière. Encore de la poix avant de charger le grain.', en: 'The boat’s taking water at the stern. More pitch before we load the grain.' },
  ] },
  { id: 'b-t-meule', kind: 'thought', layer: 1, bands: [2, 3], when: { job: ['miller'] }, lines: [
    { fr: 'La meule a un éclat depuis hier. Si je ne la fais pas rhabiller, il y aura du sable dans la farine.', en: 'The millstone has been chipped since yesterday. If I don’t get it dressed, there’ll be grit in the flour.' },
  ] },
  { id: 'b-t-coin', kind: 'thought', layer: 1, bands: [3, 3], when: { job: ['minter'] }, lines: [
    { fr: 'Encore trois cents pièces à frapper, et le coin commence à s’user.', en: 'Three hundred more coins to strike, and the die is starting to wear.' },
  ] },
  { id: 'b-t-actes', kind: 'thought', layer: 1, bands: [2, 3], when: { job: ['scribe'] }, lines: [
    { fr: 'Douze actes à recopier pour demain. Le greffier les veut propres, évidemment.', en: 'Twelve deeds to copy for tomorrow. The clerk wants them clean, of course.' },
  ] },
  { id: 'b-t-mordu', kind: 'thought', layer: 1, bands: [2, 3], when: { job: ['schoolmaster'] }, lines: [
    { fr: 'Le fils du forgeron a encore mordu quelqu’un. Il faudra parler au père, et le père est plus grand que moi.', en: 'The blacksmith’s boy bit someone again. I’ll have to talk to the father, and the father is bigger than me.' },
  ] },
  { id: 'b-t-loup-moulin', kind: 'thought', layer: 1, bands: BOURG, when: { job: ['storyteller'] }, lines: [
    { fr: 'Ils veulent encore l’histoire du loup du moulin. Je la raconte depuis vingt ans. Il faudrait que j’en trouve une autre.', en: 'They want the tale of the mill wolf again. I’ve told it for twenty years. I ought to find another.' },
  ] },
  { id: 'b-t-marches', kind: 'thought', layer: 1, bands: [2, 3], when: { job: ['priest'] }, lines: [
    { fr: 'Il faut balayer les marches du culte avant que les familles arrivent. Les feuilles reviennent toutes les nuits.', en: 'The shrine steps need sweeping before the families come. The leaves are back every night.' },
  ] },
  { id: 'b-t-pain-veille', kind: 'thought', layer: 1, bands: [2, 3], when: { job: ['watchman'] }, lines: [
    { fr: 'Toute la nuit à faire le tour du quartier, et on nous donne le pain d’hier.', en: 'All night going round the quarter, and they give us yesterday’s bread.' },
  ] },
  { id: 'b-t-assises', kind: 'thought', layer: 1, bands: [2, 3], when: { job: ['builder'] }, lines: [
    { fr: 'Encore deux rangs de pierre et le mur tiendra tout seul. Le maître dit trois.', en: 'Two more courses of stone and the wall will stand on its own. The master says three.' },
  ] },
  { id: 'b-t-vache', kind: 'thought', layer: 1, bands: [3, 3], when: { job: ['courtClerk'] }, lines: [
    { fr: 'L’affaire de la vache de Jehan, encore. Ils reviennent pour la troisième fois avec la même vache.', en: 'Jehan’s cow again. Third time they’ve come back with the same cow.' },
  ] },
  { id: 'b-t-cote', kind: 'thought', layer: 1, bands: BOURG, when: { job: ['basket'] }, lines: [
    { fr: 'Le panier de pommes pour la maison d’en haut. Ils paient bien, mais il y a la côte.', en: 'The basket of apples for the house up the hill. They pay well, but there’s the slope.' },
  ] },
  { id: 'b-t-bassin', kind: 'thought', layer: 1, bands: [3, 3], when: { job: ['fountaineer'] }, lines: [
    { fr: 'Le bassin de la place est encore plein de feuilles. Il faudra le vider avant le marché.', en: 'The basin on the square is full of leaves again. It’ll need emptying before market day.' },
  ] },
  { id: 'b-t-sauge', kind: 'thought', layer: 1, bands: [3, 3], when: { job: ['lettered'] }, lines: [
    { fr: 'Le maître de l’académie veut mon traité des herbes avant la fin du mois. Je n’ai écrit que la sauge.', en: 'The academy master wants my treatise on herbs by the end of the month. I’ve only written up the sage.' },
  ] },
  { id: 'b-t-comptes', kind: 'thought', layer: 1, bands: [3, 3], when: { job: ['librarian'] }, lines: [
    { fr: 'Quelqu’un a encore rangé les livres de comptes avec les chroniques.', en: 'Someone has shelved the account books with the chronicles again.' },
  ] },
  { id: 'b-t-comete', kind: 'thought', layer: 1, bands: [3, 3], when: { job: ['astronomer'] }, lines: [
    { fr: 'La comète doit revenir cette année, d’après les registres. Il faudra veiller toutes les nuits claires.', en: 'The comet is due back this year, according to the records. I’ll have to watch every clear night.' },
  ] },
  { id: 'b-t-foyers', kind: 'thought', layer: 1, bands: [3, 3], when: { job: ['official'] }, lines: [
    { fr: 'Il faut recompter les foyers de la rue des Tanneurs. Ils en déclarent toujours moins qu’il n’y en a.', en: 'The households on Tanners’ Street need recounting. They always declare fewer than there are.' },
  ] },
  { id: 'b-t-fosse', kind: 'thought', layer: 1, bands: [3, 3], when: { job: ['sewerman'] }, lines: [
    { fr: 'Le grand fossé est bouché derrière la tannerie. On descend demain avec les crocs.', en: 'The big ditch is blocked behind the tannery. We go down tomorrow with the hooks.' },
  ] },

  // ── Pensées, sa famille, son âge ──
  { id: 'b-t-sel-conjoint', kind: 'thought', layer: 1, bands: [2, 4], when: { family: 'married' }, lines: [
    { fr: '{conjoint} va me demander si j’ai pensé au sel. Je n’y ai pas pensé.', en: '{conjoint} will ask if I remembered the salt. I didn’t.' },
  ] },
  { id: 'b-t-guerisseuse', kind: 'thought', layer: 1, bands: [2, 4], when: { kids: true }, lines: [
    { fr: '{enfant} tousse depuis trois nuits. Si ça continue demain, je l’emmène chez la guérisseuse.', en: '{enfant} has been coughing for three nights. If it’s still bad tomorrow, I’m taking them to the healer.' },
  ] },
  { id: 'b-t-souliers', kind: 'thought', layer: 1, bands: [2, 5], when: { kids: true }, lines: [
    { fr: 'Il faut que je trouve des souliers à {enfant} avant l’hiver. Ceux du cousin sont trop petits.', en: 'I need to find shoes for {enfant} before winter. The cousin’s old ones are too small.' },
  ] },
  { id: 'b-t-chevreaux', kind: 'thought', layer: 1, bands: [2, 3], when: { old: true }, lines: [
    { m: 'Quand j’étais petit, il n’y avait pas de pont. On traversait à gué, les chevreaux sur les épaules.', f: 'Quand j’étais petite, il n’y avait pas de pont. On traversait à gué, les chevreaux sur les épaules.', en: 'When I was little there was no bridge. We waded across with the young goats on our shoulders.' },
  ] },
  { id: 'b-t-genou', kind: 'thought', layer: 1, bands: [2, 6], when: { old: true }, lines: [
    { fr: 'J’ai mal au genou depuis ce matin. Il pleuvra avant ce soir, je l’ai dit à la voisine.', en: 'My knee’s been aching since this morning. It’ll rain before evening. I told the neighbour.' },
  ] },
  { id: 'b-t-orge', kind: 'thought', layer: 1, bands: BOURG, when: { family: 'lodger' }, lines: [
    { fr: 'Je dois encore deux mesures d’orge à {hote}. Je les rendrai après la récolte.', en: 'I still owe {hote} two measures of barley. I’ll pay them back after the harvest.' },
  ] },
  { id: 'b-t-fronde', kind: 'thought', layer: 1, bands: [2, 4], when: { child: true }, lines: [
    { fr: '{gamin} a une fronde. Il dit qu’il me la prête si je lui donne mes billes.', en: '{gamin} has a sling. He says he’ll lend it to me if I give him my marbles.' },
  ] },
  { id: 'b-t-sucre-orge', kind: 'thought', layer: 1, bands: [3, 5], when: { child: true }, lines: [
    { fr: 'J’ai trouvé un sou près du puits. Si je ne dis rien, j’achète du sucre d’orge.', en: 'I found a coin by the well. If I don’t tell, I can buy barley sugar.' },
  ] },
  { id: 'b-t-eau-pont', kind: 'thought', layer: 1, bands: [2, 4], when: { child: true }, lines: [
    { fr: 'Si je finis de porter l’eau avant midi, on me laisse aller au pont.', en: 'If I finish carrying the water before noon, they’ll let me go to the bridge.' },
  ] },
  { id: 'b-t-cousins', kind: 'thought', layer: 1, bands: [2, 5], when: { family: 'nephew' }, lines: [
    { fr: 'Chez {hote}, je dors avec les cousins. Le plus petit donne des coups de pied.', en: 'At {hote}’s I sleep with the cousins. The smallest one kicks.' },
  ] },

  // ── Pensées, son caractère ──
  { id: 'b-t-grumpy', adult: true, kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'grumpy' }, lines: [
    { fr: '{gamin} a encore laissé sa charrette devant ma porte. La prochaine fois, elle finit dans le fossé.', en: '{gamin} left his cart in front of my door again. Next time it goes in the ditch.' },
  ] },
  { id: 'b-t-superstitious', kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'superstitious' }, lines: [
    { m: 'Je suis sorti du pied gauche ce matin. Je ne passerai pas près du puits.', f: 'Je suis sortie du pied gauche ce matin. Je ne passerai pas près du puits.', en: 'I stepped out left foot first this morning. I won’t go near the well.' },
  ] },
  { id: 'b-t-cheerful', kind: 'thought', layer: 1, bands: [2, 5], when: { trait: 'cheerful' }, lines: [
    { fr: 'Il fait doux. Je rentrerai par le chemin du bas, celui des tilleuls.', en: 'It’s mild out. I’ll go home the low way, past the lime trees.' },
  ] },
  { id: 'b-t-chatty', kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'chatty' }, lines: [
    { fr: 'Il faut que je raconte à quelqu’un ce que j’ai vu au lavoir. Pas à ma sœur, elle le répéterait.', en: 'I have to tell someone what I saw at the wash-house. Not my sister. She’d repeat it.' },
  ] },
  { id: 'b-t-greedy', kind: 'thought', layer: 1, bands: [2, 5], when: { trait: 'greedy' }, lines: [
    { fr: 'Ça sent les beignets du côté de la place. Un seul. Peut-être deux.', en: 'Fritters, over by the square. Just one. Maybe two.' },
  ] },
  { id: 'b-t-curious', kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'curious' }, lines: [
    { fr: 'Il y a de la lumière chez le forgeron, si tard. Qu’est-ce qu’il peut bien fabriquer ?', en: 'There’s a light on at the blacksmith’s this late. What can he be making?' },
  ] },
  { id: 'b-t-thrifty', adult: true, kind: 'thought', layer: 1, bands: [2, 4], when: { notJob: ['baker'], trait: 'thrifty' }, lines: [
    { fr: 'Trois sous le pain chez Odile, deux et demi chez l’autre. Je vais chez l’autre.', en: 'Three sous a loaf at Odile’s, two and a half at the other place. I’ll go to the other place.' },
  ] },
  { id: 'b-t-generous', adult: true, kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'generous' }, lines: [
    { fr: 'J’ai encore deux pommes. Le petit de {voisine} n’a rien mangé ce matin, je crois.', en: 'I’ve still got two apples. I don’t think {voisine}’s little one ate this morning.' },
  ] },
  { id: 'b-t-stubborn', adult: true, kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'stubborn' }, lines: [
    { fr: 'Ils peuvent dire ce qu’ils veulent, je replanterai les choux au même endroit.', en: 'They can say what they like. I’m planting the cabbages in the same spot.' },
  ] },
  { id: 'b-t-early', adult: true, kind: 'thought', layer: 1, bands: [2, 4], when: { notJob: ['baker'], trait: 'early' }, lines: [
    { fr: 'Le boulanger allume son four. Dans une heure, j’aurai le premier pain.', en: 'The baker’s lighting his oven. In an hour I’ll have the first loaf.' },
  ] },
  { id: 'b-t-chilly', kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'chilly' }, lines: [
    { fr: 'J’aurais dû prendre la grosse laine. Ce vent passe à travers tout.', en: 'I should have taken the thick wool. This wind goes straight through.' },
  ] },
  { id: 'b-t-brave', kind: 'thought', layer: 1, bands: [2, 4], when: { notJob: ['guard', 'watchman'], trait: 'brave', riot: true }, lines: [
    { fr: 'Ils sont trop nombreux sur la place. Il faut que quelqu’un aille chercher le guet.', en: 'There are too many of them on the square. Someone has to fetch the watch.' },
  ] },
  { id: 'b-t-cautious', kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'cautious', riot: true }, lines: [
    { fr: 'La rue du puits, puis la ruelle des tanneurs, puis la maison. Sans courir.', en: 'Well Street, then the tanners’ alley, then home. Without running.' },
  ] },
  { id: 'b-t-quiet', kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'quiet' }, lines: [
    { fr: 'Au repas, ils vont encore vouloir que je raconte la foire.', en: 'At supper they’ll want me to tell them about the fair again.' },
  ] },
  { id: 'b-t-proud', adult: true, kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'proud' }, lines: [
    { fr: 'Personne n’a un seuil aussi propre que le mien dans toute la rue.', en: 'Nobody on the whole street has a doorstep as clean as mine.' },
  ] },
  { id: 'b-t-spiteful', adult: true, kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'spiteful' }, lines: [
    { fr: '{voisine} veut m’emprunter mon chaudron. Elle ne m’a jamais rendu la louche.', en: '{voisine} wants to borrow my cauldron. She never gave back the ladle.' },
  ] },
  { id: 'b-t-absent', adult: true, kind: 'thought', layer: 1, bands: [2, 6], when: { trait: 'absent' }, lines: [
    { fr: 'Où est-ce que j’ai mis la clé ? Je l’avais dans la main en fermant.', en: 'Where did I put the key? I had it in my hand when I locked up.' },
  ] },
  { id: 'b-t-dreamy', kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'dreamy' }, lines: [
    { fr: 'Si je prenais la route du sud, en dix jours je verrais la mer. Ma tante l’a vue, une fois.', en: 'If I took the south road, I’d see the sea in ten days. My aunt saw it once.' },
  ] },
  { id: 'b-t-pious', kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'pious' }, lines: [
    { fr: 'Trois prières pour ma mère, une pour la récolte. Je dirai la dernière en marchant.', en: 'Three prayers for my mother, one for the harvest. I’ll say the last one as I walk.' },
  ] },
  { id: 'b-t-hardworking', adult: true, kind: 'thought', layer: 1, bands: [2, 4], when: { trait: 'hardworking' }, lines: [
    { fr: 'Si je finis la haie ce soir, demain je peux commencer le toit de l’appentis.', en: 'If I finish the hedge tonight, I can start on the lean-to roof tomorrow.' },
  ] },

  // ── Pensées, le bourg tel qu'il va ──
  { id: 'b-t-galettes', adult: true, kind: 'thought', layer: 2, bands: [2, 4], when: { cause: 'scarcity' }, lines: [
    { fr: 'Plus que deux mesures de farine. Je ferai les galettes plus fines, ils ne verront pas la différence.', en: 'Two measures of flour left. I’ll make the flatbreads thinner. They won’t notice.' },
  ] },
  { id: 'b-t-linge', kind: 'thought', layer: 2, bands: [2, 6], when: { precip: 'rain' }, lines: [
    { fr: 'Le linge est resté dehors.', en: 'The washing’s still out.' },
  ] },
  { id: 'b-t-bucher', kind: 'thought', layer: 2, bands: [2, 4], when: { precip: 'snow' }, lines: [
    { fr: 'Il faudra rentrer du bois pour trois jours. Le chemin du bûcher sera pris par la neige.', en: 'I’ll need to bring in three days of wood. The path to the woodshed will be snowed under.' },
  ] },
  { id: 'b-t-guet-nuit', kind: 'thought', layer: 2, bands: [2, 3], when: { notJob: ['guard', 'watchman'], night: true }, lines: [
    { fr: 'Le guet va passer. Je rentre avant qu’il me demande où je vais.', en: 'The watch will be round. I’ll go in before they ask where I’m going.' },
  ] },
  { id: 'b-t-etal', kind: 'thought', layer: 2, bands: [2, 3], when: { riot: true }, lines: [
    { fr: 'Ils ont renversé l’étal du boucher sur la place. Je rentre par la ruelle.', en: 'They’ve knocked over the butcher’s stall on the square. I’m going home by the alley.' },
  ] },
  { id: 'b-t-merveille', kind: 'thought', layer: 2, bands: BOURG, when: { wonder: true }, lines: [
    { fr: 'Mon père a taillé des pierres pour la merveille pendant onze ans. Il en parlait tous les soirs.', en: 'My father cut stone for the wonder for eleven years. He talked about it every evening.' },
  ] },
  { id: 'b-t-chevre', adult: true, kind: 'thought', layer: 2, bands: [2, 3], when: { prosper: true }, lines: [
    { fr: 'Cette année, on pourra refaire le toit. Peut-être même acheter une chèvre.', en: 'This year we can redo the roof. Maybe even buy a goat.' },
  ] },
  { id: 'b-t-tapis', kind: 'thought', layer: 2, bands: [3, 3], when: { cause: 'inequality' }, lines: [
    { fr: 'Ils ont encore fait venir des tapis pour la maison du bailli. Nous, on n’a pas de quoi changer la porte.', en: 'They’ve had more carpets brought in for the bailiff’s house. We can’t afford a new door.' },
  ] },
  { id: 'b-t-papier-toit', adult: true, kind: 'thought', layer: 2, bands: [3, 3], when: { cause: 'complexity' }, lines: [
    { fr: 'Il me faut un papier du greffe pour réparer mon propre toit.', en: 'I need a paper from the registry to fix my own roof.' },
  ] },
  { id: 'b-t-conseil', kind: 'thought', layer: 2, bands: [2, 3], when: { cause: 'dissent' }, lines: [
    { fr: 'Au puits, ils disaient que le conseil cache du grain. Je ne sais pas qui croire.', en: 'At the well they said the council’s hiding grain. I don’t know who to believe.' },
  ] },
  { id: 'b-t-mur-cour', adult: true, kind: 'thought', layer: 2, bands: [2, 3], when: { cause: 'structural' }, lines: [
    { fr: 'Le mur de la cour penche un peu plus chaque hiver. Je ne laisse plus les enfants jouer contre.', en: 'The yard wall leans a bit more every winter. I don’t let the children play against it anymore.' },
  ] },
  { id: 'b-t-escalier', adult: true, kind: 'thought', layer: 2, bands: [2, 3], when: { cause: 'wear' }, lines: [
    { fr: 'Encore une marche de l’escalier qui casse. Personne ne la répare, on l’enjambe.', en: 'Another stair broken. Nobody fixes it. We just step over.' },
  ] },
  { id: 'b-t-couverture', adult: true, kind: 'thought', layer: 2, bands: [2, 3], when: { cause: 'poverty' }, lines: [
    { fr: 'Si je vends la couverture, on mange jusqu’à la paie. Mais l’hiver arrive.', en: 'If I sell the blanket, we eat till payday. But winter’s coming.' },
  ] },
  { id: 'b-t-champs-porte', adult: true, kind: 'thought', layer: 2, bands: [3, 3], when: { cause: 'demesure' }, lines: [
    { fr: 'Il m’a fallu toute la matinée pour traverser la ville. Avant, je voyais les champs depuis ma porte.', en: 'It took me all morning to cross town. I used to see the fields from my door.' },
  ] },
  { id: 'b-t-cidre', kind: 'thought', layer: 2, bands: [2, 3], when: { season: 'autumn' }, lines: [
    { fr: 'Les pommes sont tombées avec le vent. Il faudra en faire du cidre avant qu’elles pourrissent.', en: 'The wind has brought the apples down. We’ll have to press them before they rot.' },
  ] },
  { id: 'b-t-pois', adult: true, kind: 'thought', layer: 2, bands: [2, 3], when: { season: 'spring' }, lines: [
    { fr: 'Il faut semer les pois avant la fin de la lune. Mon père ne semait jamais après.', en: 'The peas have to go in before the moon wanes. My father never sowed after.' },
  ] },
  { id: 'b-t-moissons', kind: 'thought', layer: 2, bands: [2, 3], when: { season: 'summer' }, lines: [
    { fr: 'Les moissons commencent lundi. Toute la famille aux champs, même la grand-mère.', en: 'The harvest starts Monday. The whole family in the fields, even grandmother.' },
  ] },
  { id: 'b-t-vieille-table', adult: true, kind: 'thought', layer: 2, bands: [2, 3], when: { season: 'winter' }, lines: [
    { fr: 'Encore un mois de bois, si on fait attention. Après, on brûlera la vieille table.', en: 'A month of wood left, if we’re careful. After that we burn the old table.' },
  ] },

  // ══ MARBRE ══════════════════════════════════════════════════════════════════
  // ── Causettes, leur vie ──
  { id: 'm-c-thermes', adult: true, kind: 'chat', layer: 1, bands: MARBRE, lines: [
    { who: 'a', fr: 'Tu viens aux thermes ce soir ?', en: 'Coming to the baths tonight?' },
    { who: 'b', fr: 'Pas avant d’avoir vu mon patron. Il me doit trois jours.', en: 'Not before I’ve seen my patron. He owes me three days.' },
  ] },
  { id: 'm-c-courses', adult: true, kind: 'chat', layer: 1, bands: MARBRE, lines: [
    { who: 'a', fr: 'Tu as vu l’affiche pour les courses ?', en: 'Seen the notice for the races?' },
    { who: 'b', fr: 'Les Verts contre les Bleus, encore.', en: 'Greens against Blues, again.' },
    { who: 'a', fr: 'Mon beau-frère a misé toute sa paie sur les Bleus.', en: 'My brother-in-law bet his whole pay on the Blues.' },
  ] },
  { id: 'm-c-laine', kind: 'chat', layer: 1, bands: MARBRE, lines: [
    { who: 'a', fr: 'Tu dors, toi, avec les chariots de la nuit ?', en: 'Can you sleep, with the carts at night?' },
    { who: 'b', fr: 'Je mets de la laine dans mes oreilles.', en: 'I put wool in my ears.' },
  ] },
  { id: 'm-c-cruches', kind: 'chat', layer: 1, bands: MARBRE, when: { rel: 'couple' }, lines: [
    { who: 'a', fr: 'Il faut monter l’eau avant la nuit.', en: 'We need to carry the water up before dark.' },
    { who: 'b', fr: 'J’ai déjà monté deux cruches ce matin.', en: 'I already carried two jugs up this morning.' },
    { who: 'a', fr: 'Ta mère en a renversé une dans l’escalier.', en: 'Your mother knocked one over on the stairs.' },
  ] },
  { id: 'm-c-gladiateurs', kind: 'chat', layer: 1, bands: MARBRE, when: { rel: 'parentKid' }, lines: [
    { who: 'kid', fr: 'Je peux aller voir les gladiateurs ?', en: 'Can I go and see the gladiators?' },
    { who: 'parent', fr: 'Quand tu auras douze ans.', en: 'When you’re twelve.' },
    { who: 'kid', fr: 'Le fils de la boulangère y va.', en: 'The baker’s son goes.' },
    { who: 'parent', fr: 'Sa mère fait ce qu’elle veut. Toi, tu viens m’aider à la boutique.', en: 'His mother does as she likes. You’re coming to help me at the shop.' },
  ] },
  { id: 'm-c-ides', kind: 'chat', layer: 1, bands: MARBRE, when: { job: ['legionary'] }, lines: [
    { who: 'b', fr: 'Tu repars quand ?', en: 'When do you leave again?' },
    { who: 'a', fr: 'Après les ides. On remonte vers le nord, deux mois de marche.', en: 'After the ides. We march north, two months on the road.' },
    { who: 'b', fr: 'Écris à ta mère, cette fois.', en: 'Write to your mother this time.' },
  ] },
  { id: 'm-c-requete', kind: 'chat', layer: 1, bands: MARBRE, when: { job: ['magistrate'] }, lines: [
    { who: 'b', fr: 'Tu as reçu ma requête ?', en: 'Did you get my petition?' },
    { who: 'a', fr: 'Elle est sur la pile. Il y en a quarante avant la tienne, et la moitié parlent de la même fontaine.', en: 'It’s on the pile. There are forty ahead of yours, and half are about the same fountain.' },
  ] },
  { id: 'm-c-eau-trouble', kind: 'chat', layer: 1, bands: MARBRE, when: { job: ['waterCarrier', 'fountaineer'] }, lines: [
    { who: 'b', fr: 'L’eau est trouble, aujourd’hui.', en: 'The water’s cloudy today.' },
    { who: 'a', fr: 'Ils curent le canal en amont. Demain, elle sera claire.', en: 'They’re dredging the channel upstream. It’ll be clear tomorrow.' },
  ] },
  { id: 'm-c-gendre', kind: 'chat', layer: 1, bands: MARBRE, when: { job: ['matron'] }, lines: [
    { who: 'b', fr: 'Tu as trouvé un mari pour ta fille ?', en: 'Have you found a husband for your daughter?' },
    { who: 'a', fr: 'Le fils du marchand de vin. Sérieux, mais il parle trop.', en: 'The wine merchant’s son. Steady, but he talks too much.' },
    { who: 'b', fr: 'Il a une maison ?', en: 'Does he have a house?' },
    { who: 'a', fr: 'Deux étages sur la rue des Potiers, et une vigne.', en: 'Two floors on Potters’ Street, and a vineyard.' },
  ] },

  // ── Causettes, la ville telle qu'elle va ──
  { id: 'm-c-ble', kind: 'chat', layer: 2, bands: MARBRE, when: { cause: 'scarcity' }, lines: [
    { who: 'a', fr: 'La distribution de blé est retardée.', en: 'The grain dole is delayed.' },
    { who: 'b', fr: 'Encore ?', en: 'Again?' },
    { who: 'a', fr: 'Les bateaux ne sont pas arrivés. Trois jours de vent contraire, ils disent.', en: 'The ships haven’t come in. Three days of headwind, they say.' },
  ] },
  { id: 'm-c-villa', kind: 'chat', layer: 2, bands: MARBRE, when: { cause: 'inequality' }, lines: [
    { who: 'a', fr: 'Ils ont encore agrandi la villa sur la colline.', en: 'They’ve enlarged the villa on the hill again.' },
    { who: 'b', fr: 'Avec des colonnes ?', en: 'With columns?' },
    { who: 'a', fr: 'Seize. Mon cousin les a montées. On ne l’a pas payé pour les quatre dernières.', en: 'Sixteen. My cousin put them up. He wasn’t paid for the last four.' },
  ] },
  { id: 'm-c-edile', adult: true, kind: 'chat', layer: 2, bands: MARBRE, when: { cause: 'complexity' }, lines: [
    { who: 'a', fr: 'Il faut un certificat pour ouvrir une boutique sur la rue, maintenant.', en: 'You need a certificate to open a shop on the street now.' },
    { who: 'b', fr: 'Et pour l’avoir ?', en: 'And to get one?' },
    { who: 'a', fr: 'Passer au bureau de l’édile. Il reçoit le mardi, quand il n’est pas aux bains.', en: 'Go to the aedile’s office. He sees people on Tuesdays, when he isn’t at the baths.' },
  ] },
  { id: 'm-c-caisse', kind: 'chat', layer: 2, bands: MARBRE, when: { cause: 'dissent' }, lines: [
    { who: 'a', fr: 'Au forum, un homme disait que le conseil vend le blé en cachette.', en: 'At the forum a man was saying the council sells the grain on the sly.' },
    { who: 'b', fr: 'Quel homme ?', en: 'What man?' },
    { who: 'a', fr: 'Un homme debout sur une caisse. Les gardes l’ont fait descendre.', en: 'A man standing on a crate. The guards made him get down.' },
  ] },
  { id: 'm-c-balcon', kind: 'chat', layer: 2, bands: MARBRE, when: { cause: 'structural' }, lines: [
    { who: 'a', fr: 'L’immeuble d’en face a perdu un balcon cette nuit.', en: 'The building opposite lost a balcony last night.' },
    { who: 'b', fr: 'Il y avait quelqu’un dessous ?', en: 'Was anyone underneath?' },
    { who: 'a', fr: 'Une charrette de choux. Le marchand pleure encore.', en: 'A cart of cabbages. The seller’s still in tears.' },
  ] },
  { id: 'm-c-filet', kind: 'chat', layer: 2, bands: [4, 5], when: { cause: 'wear' }, lines: [
    { who: 'a', fr: 'La fontaine du carrefour ne donne plus qu’un filet.', en: 'The crossroads fountain is down to a trickle.' },
    { who: 'b', fr: 'Il faut prévenir le service des eaux.', en: 'The water office needs telling.' },
    { who: 'a', fr: 'C’est fait. Ils ont noté.', en: 'Done. They wrote it down.' },
  ] },
  { id: 'm-c-calendes', adult: true, kind: 'chat', layer: 2, bands: MARBRE, when: { cause: 'poverty' }, lines: [
    { who: 'a', fr: 'Tu peux me prêter dix sesterces jusqu’au début du mois ?', en: 'Can you lend me ten sesterces till the start of the month?' },
    { who: 'b', fr: 'Je les dois déjà à mon propriétaire.', en: 'I already owe them to my landlord.' },
  ] },
  { id: 'm-c-arcades', kind: 'chat', layer: 2, bands: MARBRE, when: { precip: 'rain' }, lines: [
    { who: 'a', fr: 'Ça déborde des gouttières, toute la rue est à l’eau.', en: 'The gutters are overflowing. The whole street’s flooded.' },
    { who: 'b', fr: 'Passe par les arcades, on sera au sec.', en: 'Go by the arcades, we’ll stay dry.' },
  ] },
  { id: 'm-c-chariots', kind: 'chat', layer: 2, bands: MARBRE, when: { night: true }, lines: [
    { who: 'a', fr: 'On rentre ? Les chariots vont commencer à passer.', en: 'Shall we head back? The carts will start coming through.' },
    { who: 'b', fr: 'Ils font un de ces bruits. Mon fils ne dort plus.', en: 'They make such a racket. My son can’t sleep anymore.' },
  ] },
  { id: 'm-c-marchand-grain', kind: 'chat', layer: 2, bands: MARBRE, when: { riot: true }, lines: [
    { who: 'a', fr: 'Ils se battent devant la boutique du marchand de grain.', en: 'They’re fighting outside the grain seller’s shop.' },
    { who: 'b', fr: 'Pour le prix ?', en: 'Over the price?' },
    { who: 'a', fr: 'Pour le prix, et parce qu’il a fermé sa porte.', en: 'Over the price, and because he shut his door.' },
  ] },
  { id: 'm-c-merveille', kind: 'chat', layer: 2, bands: MARBRE, when: { wonder: true }, lines: [
    { who: 'a', fr: 'Tu as vu l’intérieur de la merveille ?', en: 'Have you seen inside the wonder?' },
    { who: 'b', fr: 'Jusqu’à la deuxième salle. Le plafond est peint, avec des gens dedans.', en: 'As far as the second hall. The ceiling’s painted, with people in it.' },
  ] },
  { id: 'm-c-amphore', kind: 'chat', layer: 2, bands: MARBRE, when: { prosper: true }, lines: [
    { who: 'a', fr: 'Le port est plein de bateaux.', en: 'The harbour’s full of ships.' },
    { who: 'b', fr: 'L’huile va baisser.', en: 'Oil will get cheaper.' },
    { who: 'a', fr: 'On pourrait en acheter une amphore entière, pour une fois.', en: 'We could buy a whole amphora, for once.' },
  ] },
  { id: 'm-c-six-etages', kind: 'chat', layer: 2, bands: [4, 5], when: { cause: 'demesure' }, lines: [
    { who: 'a', fr: 'Il y a des immeubles de six étages, maintenant, derrière le marché.', en: 'There are six-storey buildings behind the market now.' },
    { who: 'b', fr: 'Qui habite tout en haut ?', en: 'Who lives right at the top?' },
    { who: 'a', fr: 'Ceux qui paient le moins. Ils montent l’eau à pied.', en: 'The ones who pay least. They carry their water up on foot.' },
  ] },

  // ── Pensées, ce qu'il fait ──
  { id: 'm-t-cinquieme', adult: true, kind: 'thought', layer: 1, bands: [4, 5], when: { doing: ['home'] }, lines: [
    { fr: 'Six étages à monter avec la cruche. Il faudrait que je trouve un logement plus bas.', en: 'Six floors to climb with the jug. I should find a place lower down.' },
  ] },
  { id: 'm-t-distribution', kind: 'thought', layer: 1, bands: MARBRE, when: { doing: ['home'], family: 'married' }, lines: [
    { fr: '{conjoint} a dû aller chercher le pain à la distribution. Avec un peu de chance, il en restait.', en: '{conjoint} will have gone for bread at the dole. With luck there was some left.' },
  ] },
  { id: 'm-t-porteurs', adult: true, kind: 'thought', layer: 1, bands: MARBRE, when: { group: ['trade', 'food', 'craft'], doing: ['work'] }, lines: [
    { fr: 'Le patron veut que la boutique soit ouverte avant le passage des porteurs. J’ai encore une rue à faire.', en: 'The boss wants the shop open before the porters come through. I’ve still got a street to go.' },
  ] },
  { id: 'm-t-garum', adult: true, kind: 'thought', layer: 1, bands: MARBRE, when: { doing: ['errand'] }, lines: [
    { fr: 'De l’huile, des lentilles, et de la sauce de poisson si le marchand ne la vend pas trop cher.', en: 'Oil, lentils, and fish sauce if the seller isn’t asking too much.' },
  ] },
  { id: 'm-t-orateur', kind: 'thought', layer: 1, bands: MARBRE, when: { doing: ['plaza'] }, lines: [
    { fr: 'Au forum, il y a un homme qui parle tous les jours à midi. Je ne comprends pas tout, mais il parle fort.', en: 'At the forum there’s a man who speaks every day at noon. I don’t follow it all, but he’s loud.' },
  ] },
  { id: 'm-t-proces', adult: true, kind: 'thought', layer: 1, bands: MARBRE, when: { doing: ['pray'] }, lines: [
    { fr: 'Une offrande aux ancêtres pour le procès de mon frère. Une petite. On verra s’il gagne.', en: 'An offering to the ancestors for my brother’s trial. A small one. We’ll see if he wins.' },
  ] },
  { id: 'm-t-tournee', adult: true, kind: 'thought', layer: 1, bands: MARBRE, when: { doing: ['wander'] }, lines: [
    { fr: 'Si je passe par les thermes, je croiserai peut-être {voisin}. Il me doit une tournée.', en: 'If I go by the baths, I might run into {voisin}. He owes me a round.' },
  ] },
  { id: 'm-t-livraisons', kind: 'thought', layer: 1, bands: MARBRE, when: { doing: ['night'] }, lines: [
    { fr: 'Les chariots de livraison passent toute la nuit. Je ne dormirai pas avant le jour, de toute façon.', en: 'The delivery carts go by all night. I won’t sleep before daylight anyway.' },
  ] },
  { id: 'm-t-regle', kind: 'thought', layer: 1, bands: [4, 5], when: { doing: ['school'] }, lines: [
    { fr: 'Le maître tape avec la règle quand on se trompe dans les chiffres. Aujourd’hui, je compte sur mes doigts sous la table.', en: 'The master raps with his ruler when you get the numbers wrong. Today I’ll count on my fingers under the table.' },
  ] },
  { id: 'm-t-amphores', adult: true, kind: 'thought', layer: 1, bands: MARBRE, when: { doing: ['port'] }, lines: [
    { fr: 'Encore un bateau d’amphores à décharger. Celles de vin sont les plus lourdes.', en: 'Another ship of amphorae to unload. The wine ones are the heaviest.' },
  ] },
  { id: 'm-t-piliers', kind: 'thought', layer: 1, bands: MARBRE, when: { doing: ['river'] }, lines: [
    { fr: 'Le fleuve est bas. On voit les piliers de l’ancien pont.', en: 'The river’s low. You can see the piers of the old bridge.' },
  ] },
  { id: 'm-t-champ-maitre', adult: true, kind: 'thought', layer: 1, bands: [4, 5], when: { doing: ['field'] }, lines: [
    { fr: 'Le champ du maître d’abord, le mien après. Il fera nuit.', en: 'The master’s field first, mine after. It’ll be dark.' },
  ] },
  { id: 'm-t-paves', kind: 'thought', layer: 1, bands: MARBRE, when: { doing: ['shelter'] }, lines: [
    { fr: 'J’attends sous les arcades. Les pavés glissent quand il pleut. Mon oncle s’est cassé la jambe comme ça.', en: 'I’ll wait under the arcades. The paving’s slippery in the rain. My uncle broke his leg that way.' },
  ] },
  { id: 'm-t-escalier-derriere', kind: 'thought', layer: 1, bands: MARBRE, when: { doing: ['flee'] }, lines: [
    { fr: 'Par les arcades, puis la rue des Potiers, puis l’escalier de derrière.', en: 'Through the arcades, then Potters’ Street, then the back stairs.' },
  ] },
  { id: 'm-t-eau-fenetre', adult: true, kind: 'thought', layer: 1, bands: MARBRE, lines: [
    { fr: 'Le voisin du dessus a encore jeté son eau par la fenêtre. Il faudra que je lui dise deux mots.', en: 'The man upstairs threw his slops out of the window again. I’ll have to have a word.' },
  ] },
  { id: 'm-t-cruche-rendre', adult: true, kind: 'thought', layer: 1, bands: MARBRE, lines: [
    { fr: 'J’ai encore oublié de rendre la cruche au marchand. Il va me la compter.', en: 'I forgot to take the jug back to the seller again. He’ll charge me for it.' },
  ] },
  { id: 'm-t-barbier', adult: true, kind: 'thought', layer: 1, bands: MARBRE, lines: [
    { fr: 'Il faut que je passe chez le barbier avant les jeux. Il parle trop, mais il rase bien.', en: 'I need to stop at the barber’s before the games. He talks too much, but he gives a good shave.' },
  ] },
  { id: 'm-t-lampe-huile', kind: 'thought', layer: 1, bands: MARBRE, lines: [
    { fr: 'Il ne reste presque plus d’huile pour la lampe. Ce soir, on se couchera tôt.', en: 'There’s hardly any oil left for the lamp. We’ll go to bed early tonight.' },
  ] },
  { id: 'm-t-singe', kind: 'thought', layer: 1, bands: MARBRE, when: { child: true }, lines: [
    { fr: 'Les gens du dessus ont un singe. Je l’ai vu à la fenêtre.', en: 'The people upstairs have a monkey. I saw it at the window.' },
  ] },

  // ── Pensées, le métier ──
  { id: 'm-t-mitoyen', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['magistrate'] }, lines: [
    { fr: 'L’affaire du mur mitoyen, encore. Les deux voisins viendront avec leurs témoins, et les témoins avec leurs voisins.', en: 'The party wall case again. Both neighbours will bring witnesses, and the witnesses will bring their neighbours.' },
  ] },
  { id: 'm-t-laine', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['merchant'] }, lines: [
    { fr: 'Le bateau de laine a deux jours de retard. S’il n’est pas là demain, je vends à perte.', en: 'The wool ship is two days late. If it’s not in tomorrow, I sell at a loss.' },
  ] },
  { id: 'm-t-lopin', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['legionary'] }, lines: [
    { fr: 'Encore six ans de service. Après, un lopin près de la rivière, si le légat tient parole.', en: 'Six more years of service. Then a plot by the river, if the legate keeps his word.' },
  ] },
  { id: 'm-t-vingt-sacs', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['porter'] }, lines: [
    { fr: 'Encore vingt sacs avant la pause. Le chef d’équipe compte, moi aussi.', en: 'Twenty more sacks before the break. The foreman’s counting, and so am I.' },
  ] },
  { id: 'm-t-marier', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['matron'] }, lines: [
    { fr: 'Il faut marier la petite avant la fin de l’année. Le fils du marchand de vin, peut-être. Sérieux, mais il parle trop.', en: 'The girl must be married before the year is out. The wine merchant’s son, perhaps. Steady, but he talks too much.' },
  ] },
  { id: 'm-t-offrandes', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['priest'] }, lines: [
    { fr: 'Les familles veulent toutes leur offrande le même jour. Je vais devoir dire non à quelqu’un.', en: 'The families all want their offering on the same day. I’ll have to turn someone down.' },
  ] },
  { id: 'm-t-preteur', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['waterCarrier'] }, lines: [
    { fr: 'Quarante cruches pour la maison du préteur. Ils ont des fontaines, mais ils disent que l’eau du puits est meilleure pour le vin.', en: 'Forty jugs for the praetor’s house. They have fountains, but they say well water is better for the wine.' },
  ] },
  { id: 'm-t-col', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['caravaneer'] }, lines: [
    { fr: 'Le col est fermé par la neige. On passera par la côte. Quatre jours de plus.', en: 'The pass is closed with snow. We’ll go by the coast. Four more days.' },
  ] },
  { id: 'm-t-halage', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['boatman'] }, lines: [
    { fr: 'Le courant est fort depuis la pluie. On remontera au halage.', en: 'The current’s strong since the rain. We’ll have to tow upstream.' },
  ] },
  { id: 'm-t-rogner', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['changer'] }, lines: [
    { fr: 'Encore des pièces étrangères. Il faut les peser une à une, les gens en rognent les bords.', en: 'More foreign coins. They have to be weighed one by one. People clip the edges.' },
  ] },
  { id: 'm-t-roi', kind: 'thought', layer: 1, bands: [4, 5], when: { job: ['actor'] }, lines: [
    { fr: 'Ce soir, je joue le roi. J’ai oublié la fin du deuxième discours. Je dirai autre chose.', en: 'Tonight I play the king. I’ve forgotten the end of the second speech. I’ll say something else.' },
  ] },
  { id: 'm-t-salle-rue', kind: 'thought', layer: 1, bands: [4, 5], when: { job: ['schoolmaster'] }, lines: [
    { fr: 'Vingt enfants dans une salle sur la rue. Avec les chariots, ils n’entendent que la moitié de ce que je dis.', en: 'Twenty children in a room on the street. With the carts, they hear half of what I say.' },
  ] },
  { id: 'm-t-sauterelles', kind: 'thought', layer: 1, bands: [4, 5], when: { job: ['farmer'] }, lines: [
    { fr: 'Le blé est beau. Si les sauterelles ne viennent pas, on paiera le fermage sans emprunter.', en: 'The wheat looks good. If the locusts stay away, we’ll pay the rent without borrowing.' },
  ] },
  { id: 'm-t-poireaux', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['marketGardener'] }, lines: [
    { fr: 'Les choux pour le marché, les poireaux pour la maison. Les plus beaux pour le marché.', en: 'Cabbages for the market, leeks for home. The best ones for the market.' },
  ] },
  { id: 'm-t-felees', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['storekeeper'] }, lines: [
    { fr: 'Trois amphores d’huile fêlées. Il faut les noter avant que le patron les trouve.', en: 'Three cracked amphorae of oil. I have to log them before the owner finds them.' },
  ] },
  { id: 'm-t-lampes', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['artisan'] }, lines: [
    { fr: 'Douze lampes en bronze pour les jeux, avec le nom du donateur gravé sur chacune. Il a un nom très long.', en: 'Twelve bronze lamps for the games, the donor’s name engraved on each. He has a very long name.' },
  ] },
  { id: 'm-t-ane', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['miller'] }, lines: [
    { fr: 'L’âne de la meule tourne de plus en plus lentement. Il faudra le remplacer avant les moissons.', en: 'The mill donkey is turning slower and slower. He’ll need replacing before the harvest.' },
  ] },
  { id: 'm-t-profil', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['minter'] }, lines: [
    { fr: 'Le nouveau magistrat veut son profil sur les pièces. Il a demandé qu’on lui redresse le nez.', en: 'The new magistrate wants his profile on the coins. He asked us to straighten his nose.' },
  ] },
  { id: 'm-t-temoins', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['scribe'] }, lines: [
    { fr: 'Le procès de demain a soixante témoins. Il faut tous les écrire, avec le nom de leur père.', en: 'Tomorrow’s trial has sixty witnesses. Every one has to be written down, with their father’s name.' },
  ] },
  { id: 'm-t-cometes', kind: 'thought', layer: 1, bands: [4, 5], when: { job: ['lettered'] }, lines: [
    { fr: 'Il faut que je finisse ma lettre sur les comètes avant la réunion. Le vieux maître va encore me couper au milieu.', en: 'I need to finish my letter on comets before the meeting. The old master will cut me off halfway again.' },
  ] },
  { id: 'm-t-rouleaux', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['librarian'] }, lines: [
    { fr: 'Quelqu’un a encore rangé les rouleaux de géographie avec ceux de médecine.', en: 'Someone has put the geography scrolls in with the medicine ones again.' },
  ] },
  { id: 'm-t-planete-rouge', kind: 'thought', layer: 1, bands: [4, 6], when: { job: ['astronomer'] }, lines: [
    { fr: 'La planète rouge doit passer près de la lune cette nuit. S’il y a des nuages, j’attendrai l’an prochain.', en: 'The red planet should pass close to the moon tonight. If it’s cloudy, I’ll wait till next year.' },
  ] },
  { id: 'm-t-fuite-pilier', kind: 'thought', layer: 1, bands: [4, 5], when: { job: ['fountaineer'] }, lines: [
    { fr: 'Une fuite au pied du troisième pilier. Si on ne la bouche pas, elle creusera la pierre avant l’hiver.', en: 'A leak at the foot of the third pier. If we don’t plug it, it’ll eat into the stone before winter.' },
  ] },
  { id: 'm-t-incendies', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['watchman', 'guard'] }, lines: [
    { fr: 'Les incendies, c’est toujours dans les immeubles du bas. Trois depuis la dernière lune.', en: 'Fires are always in the lower buildings. Three since the last moon.' },
  ] },
  { id: 'm-t-marche-poissons', kind: 'thought', layer: 1, bands: [4, 5], when: { job: ['sewerman'] }, lines: [
    { fr: 'Le grand égout est bouché sous le marché aux poissons. Ça devait arriver.', en: 'The main sewer is blocked under the fish market. It was bound to happen.' },
  ] },
  { id: 'm-t-recensement', kind: 'thought', layer: 1, bands: [4, 5], when: { job: ['official'] }, lines: [
    { fr: 'Le recensement commence lundi. Il faudra compter chaque immeuble de la rue des Potiers, étage par étage.', en: 'The census starts on Monday. Every building on Potters’ Street has to be counted, floor by floor.' },
  ] },
  { id: 'm-t-figuier', kind: 'thought', layer: 1, bands: [4, 5], when: { job: ['courtClerk'] }, lines: [
    { fr: 'Une plainte pour un figuier qui dépasse sur la cour du voisin. La quatrième de l’année, pour le même figuier.', en: 'A complaint about a fig tree hanging over the neighbour’s yard. The fourth this year, same fig tree.' },
  ] },
  { id: 'm-t-voute', kind: 'thought', layer: 1, bands: [4, 5], when: { job: ['builder'] }, lines: [
    { fr: 'On pose la voûte du nouveau marché demain. Si le cintre tient, on dormira tranquilles.', en: 'We set the vault of the new market tomorrow. If the centring holds, we’ll sleep easy.' },
  ] },
  { id: 'm-t-figues', kind: 'thought', layer: 1, bands: MARBRE, when: { job: ['basket'] }, lines: [
    { fr: 'Des figues pour la maison du préteur, et la cuisinière qui compte chaque fruit.', en: 'Figs for the praetor’s house, and the cook who counts every one.' },
  ] },

  // ── Pensées, sa famille, son âge ──
  { id: 'm-t-fontaine', kind: 'thought', layer: 1, bands: [4, 5], when: { family: 'married' }, lines: [
    { fr: '{conjoint} veut qu’on déménage plus près de la fontaine. Il faudrait que je gagne plus.', en: '{conjoint} wants us to move closer to the fountain. I’d have to earn more.' },
  ] },
  { id: 'm-t-chien', kind: 'thought', layer: 1, bands: MARBRE, when: { kids: true }, lines: [
    { fr: '{enfant} veut un chien. Dans deux pièces, au cinquième étage.', en: '{enfant} wants a dog. In two rooms, on the fifth floor.' },
  ] },
  { id: 'm-t-thermes-meme-heure', kind: 'thought', layer: 1, bands: [4, 5], when: { family: 'single' }, lines: [
    { fr: 'Si je vais aux thermes à la même heure qu’hier, je reverrai peut-être ce visage.', en: 'If I go to the baths at the same time as yesterday, I might see that face again.' },
  ] },
  { id: 'm-t-maisons-basses', kind: 'thought', layer: 1, bands: [4, 5], when: { old: true }, lines: [
    { fr: 'Quand j’étais jeune, il n’y avait que des maisons basses ici. On voyait le fleuve depuis la rue.', en: 'When I was young there were only low houses here. You could see the river from the street.' },
  ] },
  { id: 'm-t-part-loyer', kind: 'thought', layer: 1, bands: [4, 5], when: { family: 'lodger' }, lines: [
    { fr: 'Je dors dans la petite pièce chez {hote}. Il faudra que je paie ma part du loyer à la fin du mois.', en: 'I sleep in the little room at {hote}’s. I’ll need to pay my share of the rent at the end of the month.' },
  ] },
  { id: 'm-t-toupie', kind: 'thought', layer: 1, bands: MARBRE, when: { child: true }, lines: [
    { fr: '{gamin} a une toupie en bronze. Je lui échange contre mes osselets.', en: '{gamin} has a bronze top. I’ll swap him my knucklebones for it.' },
  ] },
  { id: 'm-t-clous', kind: 'thought', layer: 1, bands: [4, 5], when: { child: true }, lines: [
    { fr: 'Si je ramasse assez de clous tombés des chantiers, le forgeron me donne une pièce.', en: 'If I pick up enough nails from the building sites, the smith gives me a coin.' },
  ] },
  { id: 'm-t-ronfle', kind: 'thought', layer: 1, bands: MARBRE, when: { family: 'nephew' }, lines: [
    { fr: 'Chez {hote}, on dort à quatre dans la même pièce. Le plus petit ronfle.', en: 'At {hote}’s four of us sleep in one room. The smallest one snores.' },
  ] },

  // ── Pensées, la ville telle qu'elle va ──
  { id: 'm-t-orge', kind: 'thought', layer: 2, bands: MARBRE, when: { cause: 'scarcity' }, lines: [
    { fr: 'Pas de blé à la distribution aujourd’hui. On mangera la bouillie d’orge, encore.', en: 'No grain at the dole today. Barley porridge again.' },
  ] },
  { id: 'm-t-manteaux', adult: true, kind: 'thought', layer: 2, bands: MARBRE, when: { night: true }, lines: [
    { fr: 'Les voleurs de manteaux travaillent la nuit, du côté des thermes. Je garde le mien sur moi.', en: 'The cloak thieves work at night, over by the baths. I’m keeping mine on.' },
  ] },
  { id: 'm-t-pierres-maison', kind: 'thought', layer: 2, bands: MARBRE, when: { riot: true }, lines: [
    { fr: 'Ils lancent des pierres sur la maison du marchand de grain. Je rentre par l’autre côté du forum.', en: 'They’re throwing stones at the grain merchant’s house. I’m going home the other way round the forum.' },
  ] },
  { id: 'm-t-merveille', kind: 'thought', layer: 2, bands: MARBRE, when: { wonder: true }, lines: [
    { fr: 'On dit qu’il a fallu vingt ans pour finir la merveille. Mon grand-père a commencé, mon père a fini.', en: 'They say the wonder took twenty years to finish. My grandfather started it, my father finished it.' },
  ] },
  { id: 'm-t-theatre', adult: true, kind: 'thought', layer: 2, bands: MARBRE, when: { prosper: true }, lines: [
    { fr: 'Cette année, on aura de quoi payer des places au théâtre. Les bonnes, en bas.', en: 'This year we can afford seats at the theatre. Good ones, down at the front.' },
  ] },
  { id: 'm-t-colline', kind: 'thought', layer: 2, bands: MARBRE, when: { cause: 'inequality' }, lines: [
    { fr: 'Sur la colline, ils ont l’eau dans la maison. Ici, on fait la queue à la fontaine avec les cruches.', en: 'Up on the hill they have water in the house. Down here we queue at the fountain with our jugs.' },
  ] },
  { id: 'm-t-temoins-sceau', adult: true, kind: 'thought', layer: 2, bands: MARBRE, when: { cause: 'complexity' }, lines: [
    { fr: 'Pour déclarer une naissance, il faut trois témoins et un sceau. Le sceau coûte plus cher que les témoins.', en: 'To register a birth you need three witnesses and a seal. The seal costs more than the witnesses.' },
  ] },
  { id: 'm-t-inscriptions', kind: 'thought', layer: 2, bands: MARBRE, when: { cause: 'dissent' }, lines: [
    { fr: 'Il y a des inscriptions contre le conseil sur le mur des bains. On les efface le matin, elles reviennent le soir.', en: 'There’s writing against the council on the bathhouse wall. It’s scrubbed off every morning and back every night.' },
  ] },
  { id: 'm-t-enduit', adult: true, kind: 'thought', layer: 2, bands: MARBRE, when: { cause: 'structural' }, lines: [
    { fr: 'La façade de l’immeuble est fendue du toit jusqu’au deuxième. Le propriétaire dit que c’est l’enduit.', en: 'The front of the building is cracked from the roof to the second floor. The landlord says it’s just the plaster.' },
  ] },
  { id: 'm-t-ornieres', kind: 'thought', layer: 2, bands: MARBRE, when: { cause: 'wear' }, lines: [
    { fr: 'Les pavés de la grande rue sont si usés qu’on y voit la trace des roues.', en: 'The paving on the main street is so worn you can see the wheel ruts.' },
  ] },
  { id: 'm-t-moitie-loyer', adult: true, kind: 'thought', layer: 2, bands: MARBRE, when: { cause: 'poverty' }, lines: [
    { fr: 'Ce mois-ci, je ne paierai que la moitié du loyer. Le propriétaire l’acceptera, ou pas.', en: 'This month I’ll only pay half the rent. The landlord will take it, or he won’t.' },
  ] },
  { id: 'm-t-village-mere', adult: true, kind: 'thought', layer: 2, bands: MARBRE, when: { cause: 'demesure' }, lines: [
    { fr: 'La ville a avalé le village de ma mère. Il y a un marché à la place de sa maison.', en: 'The city has swallowed my mother’s village. There’s a market where her house was.' },
  ] },
  { id: 'm-t-toit-ete', kind: 'thought', layer: 2, bands: MARBRE, when: { season: 'summer' }, lines: [
    { fr: 'Il fait trop chaud pour dormir au cinquième. Je monterai sur le toit avec une couverture.', en: 'Too hot to sleep on the fifth floor. I’ll go up on the roof with a blanket.' },
  ] },
  { id: 'm-t-brasero', kind: 'thought', layer: 2, bands: MARBRE, when: { season: 'winter' }, lines: [
    { fr: 'Le brasero a encore enfumé la chambre. On a dormi la fenêtre ouverte, dans le froid.', en: 'The brazier smoked out the room again. We slept with the window open, in the cold.' },
  ] },
  { id: 'm-t-vendanges', adult: true, kind: 'thought', layer: 2, bands: MARBRE, when: { season: 'autumn' }, lines: [
    { fr: 'Les vendanges commencent. Mon cousin cherche des bras pour sa vigne, il paie en vin.', en: 'The grape harvest is starting. My cousin needs hands for his vineyard. He pays in wine.' },
  ] },
  { id: 'm-t-caves', kind: 'thought', layer: 2, bands: MARBRE, when: { season: 'spring' }, lines: [
    { fr: 'Le fleuve monte avec la fonte des neiges. Les caves du bas seront encore inondées.', en: 'The river is rising with the snowmelt. The cellars down there will flood again.' },
  ] },

  // ══ FONTE ═══════════════════════════════════════════════════════════════════
  // ── Causettes, leur vie ──
  { id: 'u-c-sirene', adult: true, kind: 'chat', layer: 1, bands: FONTE, lines: [
    { who: 'a', fr: 'Tu as entendu la sirène ?', en: 'Did you hear the whistle?' },
    { who: 'b', fr: 'C’était celle de la filature. Ils commencent une heure plus tôt cette semaine.', en: 'That was the mill. They’re starting an hour earlier this week.' },
    { who: 'a', fr: 'Sans payer l’heure, je parie.', en: 'Without paying for the hour, I bet.' },
  ] },
  { id: 'u-c-frere-mines', kind: 'chat', layer: 1, bands: FONTE, lines: [
    { who: 'a', fr: 'Tu as des nouvelles de ton frère ?', en: 'Any news of your brother?' },
    { who: 'b', fr: 'Il a écrit de la ville du nord. Il cherche du travail dans les mines.', en: 'He wrote from the northern town. He’s looking for work in the mines.' },
  ] },
  { id: 'u-c-bal-samedi', kind: 'chat', layer: 1, bands: FONTE, lines: [
    { who: 'a', fr: 'On se voit au bal samedi ?', en: 'See you at the dance on Saturday?' },
    { who: 'b', fr: 'Si je ne fais pas les heures de nuit.', en: 'If I’m not on the night shift.' },
  ] },
  { id: 'u-c-paie', adult: true, kind: 'chat', layer: 1, bands: FONTE, when: { rel: 'couple' }, lines: [
    { who: 'a', fr: 'La paie est tombée ?', en: 'Has the pay come in?' },
    { who: 'b', fr: 'Moins les deux jours où la machine était cassée.', en: 'Minus the two days the machine was broken.' },
    { who: 'a', fr: 'Ce n’est pas ta faute si la machine est cassée.', en: 'It’s not your fault the machine broke.' },
    { who: 'b', fr: 'Va le dire au contremaître.', en: 'Go and tell the foreman that.' },
  ] },
  { id: 'u-c-pralines', kind: 'chat', layer: 1, bands: FONTE, when: { rel: 'couple', kids: true }, lines: [
    { who: 'a', fr: 'On va au bal dimanche ?', en: 'Shall we go to the dance on Sunday?' },
    { who: 'b', fr: 'Si ta mère garde les petits.', en: 'If your mother minds the little ones.' },
    { who: 'a', fr: 'Elle a dit oui. Elle veut qu’on lui rapporte des pralines.', en: 'She said yes. She wants us to bring her back some pralines.' },
  ] },
  { id: 'u-c-usine-enfant', kind: 'chat', layer: 1, bands: FONTE, when: { rel: 'parentKid' }, lines: [
    { who: 'kid', fr: '{gamin} commence à l’usine lundi. Je peux y aller aussi ?', en: '{gamin} starts at the factory on Monday. Can I go too?' },
    { who: 'parent', fr: 'Tu finis l’école d’abord.', en: 'You finish school first.' },
    { who: 'kid', fr: 'Il gagne trois sous par jour.', en: 'He makes three sous a day.' },
    { who: 'parent', fr: 'Tu finis l’école.', en: 'You finish school.' },
  ] },
  { id: 'u-c-dictee', kind: 'chat', layer: 1, bands: FONTE, when: { rel: 'parentKid' }, lines: [
    { who: 'parent', fr: 'Tu as appris tes mots pour la dictée ?', en: 'Have you learned your words for the dictation?' },
    { who: 'kid', fr: 'Pas tous. Il y en a un avec trois consonnes de suite.', en: 'Not all of them. There’s one with three consonants in a row.' },
  ] },
  { id: 'u-c-depot', kind: 'chat', layer: 1, bands: FONTE, when: { job: ['constable'] }, lines: [
    { who: 'b', fr: 'Du nouveau ?', en: 'Anything new?' },
    { who: 'a', fr: 'Un vol de charbon au dépôt. Trois sacs. Les traces vont jusqu’à la rue des Tanneurs.', en: 'Coal stolen from the depot. Three sacks. The tracks lead to Tanners’ Street.' },
  ] },
  { id: 'u-c-roses', kind: 'chat', layer: 1, bands: FONTE, when: { job: ['florist'] }, lines: [
    { who: 'b', fr: 'Elles sont fraîches, tes roses ?', en: 'Are your roses fresh?' },
    { who: 'a', fr: 'Arrivées par le train de six heures. Demain, elles seront à moitié prix.', en: 'Came in on the six o’clock train. Tomorrow they’ll be half price.' },
  ] },
  { id: 'u-c-courroie', adult: true, kind: 'chat', layer: 1, bands: FONTE, lines: [
    { who: 'a', fr: 'Tu as vu {voisin}, ces jours-ci ?', en: 'Have you seen {voisin} lately?' },
    { who: 'b', fr: 'Il a eu la main prise dans la courroie. Il est au dispensaire.', en: 'He got his hand caught in the belt. He’s at the clinic.' },
    { who: 'a', fr: 'Il reprend quand ?', en: 'When’s he back?' },
    { who: 'b', fr: 'Il ne sait pas. Ils ont déjà mis quelqu’un à sa place.', en: 'He doesn’t know. They’ve already put someone in his place.' },
  ] },

  // ── Causettes, la ville telle qu'elle va ──
  { id: 'u-c-pain-livre', kind: 'chat', layer: 2, bands: FONTE, when: { cause: 'scarcity' }, lines: [
    { who: 'a', fr: 'Le pain a encore augmenté.', en: 'Bread’s gone up again.' },
    { who: 'b', fr: 'De combien ?', en: 'By how much?' },
    { who: 'a', fr: 'Deux sous la livre. Le boulanger dit que c’est la farine.', en: 'Two sous a pound. The baker blames the flour.' },
  ] },
  { id: 'u-c-gaz', kind: 'chat', layer: 2, bands: FONTE, when: { cause: 'inequality' }, lines: [
    { who: 'a', fr: 'Ils ont mis le gaz dans les maisons du boulevard.', en: 'They’ve put gas into the houses on the boulevard.' },
    { who: 'b', fr: 'Et chez nous ?', en: 'And here?' },
    { who: 'a', fr: 'La bougie, comme avant.', en: 'Candles, same as ever.' },
  ] },
  { id: 'u-c-livret', adult: true, kind: 'chat', layer: 2, bands: FONTE, when: { cause: 'complexity' }, lines: [
    { who: 'a', fr: 'Il faut un livret pour être embauché, maintenant.', en: 'You need a work book to get hired now.' },
    { who: 'b', fr: 'Tu l’as, le tien ?', en: 'Have you got yours?' },
    { who: 'a', fr: 'Je l’ai perdu. Pour en refaire un, il faut montrer l’ancien.', en: 'I lost it. To get a new one you have to show the old one.' },
  ] },
  { id: 'u-c-greve', adult: true, kind: 'chat', layer: 2, bands: FONTE, when: { cause: 'dissent' }, lines: [
    { who: 'a', fr: 'Ceux de la filature parlent de grève pour lundi.', en: 'The mill workers are talking about a strike on Monday.' },
    { who: 'b', fr: 'Tu vas suivre ?', en: 'Will you go along with it?' },
    { who: 'a', fr: 'Si tout le monde suit. Sinon on perd la place.', en: 'If everyone does. Otherwise we lose our jobs.' },
  ] },
  { id: 'u-c-planche', adult: true, kind: 'chat', layer: 2, bands: [5, 6], when: { cause: 'structural' }, lines: [
    { who: 'a', fr: 'Le plafond de l’escalier s’effrite.', en: 'The stairwell ceiling is crumbling.' },
    { who: 'b', fr: 'Le propriétaire est venu ?', en: 'Did the landlord come?' },
    { who: 'a', fr: 'Il a mis une planche et il est reparti.', en: 'He put up a plank and left.' },
  ] },
  { id: 'u-c-essieu', kind: 'chat', layer: 2, bands: FONTE, when: { cause: 'wear' }, lines: [
    { who: 'a', fr: 'Le tramway s’arrête encore au pont. L’essieu est fendu.', en: 'The tram’s stopping at the bridge again. The axle’s cracked.' },
    { who: 'b', fr: 'On finira à pied, comme hier.', en: 'We’ll walk the rest, like yesterday.' },
  ] },
  { id: 'u-c-montre', adult: true, kind: 'chat', layer: 2, bands: FONTE, when: { cause: 'poverty' }, lines: [
    { who: 'a', fr: 'J’ai porté la montre de mon père au mont-de-piété.', en: 'I took my father’s watch to the pawnshop.' },
    { who: 'b', fr: 'Tu pourras la reprendre ?', en: 'Will you get it back?' },
    { who: 'a', fr: 'À la paie, si personne ne tombe malade d’ici là.', en: 'On payday, if nobody falls ill before then.' },
  ] },
  { id: 'u-c-suie', kind: 'chat', layer: 2, bands: FONTE, when: { precip: 'rain' }, lines: [
    { who: 'a', fr: 'Toute la suie descend avec la pluie.', en: 'All the soot comes down with the rain.' },
    { who: 'b', fr: 'Mes chemises sont grises avant d’être sèches.', en: 'My shirts are grey before they’re dry.' },
  ] },
  { id: 'u-c-neige-noire', kind: 'chat', layer: 2, bands: FONTE, when: { precip: 'snow' }, lines: [
    { who: 'a', fr: 'La neige est noire au bout d’une heure, avec les cheminées.', en: 'The snow is black within the hour, with all the chimneys.' },
    { who: 'b', fr: 'Les enfants y jouent quand même.', en: 'The children play in it anyway.' },
  ] },
  { id: 'u-c-bistrot', adult: true, kind: 'chat', layer: 2, bands: FONTE, when: { night: true }, lines: [
    { who: 'a', fr: 'On passe au bistrot ?', en: 'Shall we stop at the bar?' },
    { who: 'b', fr: 'Une demi-heure. La sirène est à six heures.', en: 'Half an hour. The whistle goes at six.' },
  ] },
  { id: 'u-c-barre', kind: 'chat', layer: 2, bands: FONTE, when: { notJob: ['constable'], riot: true }, lines: [
    { who: 'a', fr: 'Ils ont barré la rue devant l’usine.', en: 'They’ve blocked the street outside the factory.' },
    { who: 'b', fr: 'Les sergents arrivent ?', en: 'Are the constables coming?' },
    { who: 'a', fr: 'À cheval. Rentre par la cour.', en: 'On horseback. Go home through the yard.' },
  ] },
  { id: 'u-c-merveille', kind: 'chat', layer: 2, bands: FONTE, when: { wonder: true }, lines: [
    { who: 'a', fr: 'Le dimanche, il y a des familles entières qui viennent regarder la merveille.', en: 'On Sundays whole families come to look at the wonder.' },
    { who: 'b', fr: 'On devrait y emmener les enfants. Il paraît qu’il y a un marchand de gaufres.', en: 'We should take the children. They say there’s a waffle seller.' },
  ] },
  { id: 'u-c-embauche', adult: true, kind: 'chat', layer: 2, bands: FONTE, when: { prosper: true }, lines: [
    { who: 'a', fr: 'L’usine embauche.', en: 'The factory’s hiring.' },
    { who: 'b', fr: 'Tu y vas ?', en: 'Are you going?' },
    { who: 'a', fr: 'Mon fils, oui. Ils prennent à partir de quatorze ans.', en: 'My son is. They take them from fourteen.' },
  ] },
  { id: 'u-c-voie-ferree', kind: 'chat', layer: 2, bands: FONTE, when: { cause: 'demesure' }, lines: [
    { who: 'a', fr: 'Ils ont construit jusqu’à la voie ferrée.', en: 'They’ve built right up to the railway.' },
    { who: 'b', fr: 'Il y a des gens qui habitent sous les fumées, maintenant.', en: 'There are people living under the smoke now.' },
  ] },

  // ── Pensées, ce qu'il fait ──
  { id: 'u-t-eau-chaude', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { doing: ['home'] }, lines: [
    { fr: 'Encore trois étages. Si {voisine} a déjà fait chauffer l’eau, je lui en demanderai un peu.', en: 'Three more floors. If {voisine} has already heated the water, I’ll ask her for some.' },
  ] },
  { id: 'u-t-compter-paie', kind: 'thought', layer: 1, bands: FONTE, when: { doing: ['home'], family: 'married' }, lines: [
    { fr: '{conjoint} va encore compter la paie sur la table. Il manque les deux jours de la machine.', en: '{conjoint} will count the pay out on the table again. The two days of the machine are missing.' },
  ] },
  { id: 'u-t-pieds', adult: true, kind: 'thought', layer: 1, bands: FONTE, when: { doing: ['work'] }, lines: [
    { fr: 'Encore dix heures debout. Ce soir, je ne sentirai plus mes pieds.', en: 'Ten more hours on my feet. Tonight I won’t be able to feel them.' },
  ] },
  { id: 'u-t-savon', adult: true, kind: 'thought', layer: 1, bands: FONTE, when: { doing: ['errand'] }, lines: [
    { fr: 'Du pain, du charbon pour deux jours, et un savon s’il reste de quoi.', en: 'Bread, coal for two days, and a bar of soap if there’s anything left.' },
  ] },
  { id: 'u-t-orgue', kind: 'thought', layer: 1, bands: FONTE, when: { doing: ['plaza'] }, lines: [
    { fr: 'Il y a un orgue de Barbarie sur la place le samedi. Les enfants le suivent jusqu’au pont.', en: 'There’s a barrel organ on the square on Saturdays. The children follow it to the bridge.' },
  ] },
  { id: 'u-t-jambe-frere', adult: true, kind: 'thought', layer: 1, bands: FONTE, when: { doing: ['pray'] }, lines: [
    { fr: 'Une prière pour la jambe de mon frère, et pour qu’ils le reprennent à l’usine.', en: 'A prayer for my brother’s leg, and that the factory takes him back.' },
  ] },
  { id: 'u-t-peniches', kind: 'thought', layer: 1, bands: FONTE, when: { doing: ['wander'] }, lines: [
    { m: 'Si je prends par le canal, je verrai les péniches. Je ne suis pas pressé.', f: 'Si je prends par le canal, je verrai les péniches. Je ne suis pas pressée.', en: 'If I go along the canal, I’ll see the barges. I’m in no hurry.' },
  ] },
  { id: 'u-t-onze-heures', kind: 'thought', layer: 1, bands: FONTE, when: { doing: ['night'], family: 'married' }, lines: [
    { fr: 'Le bistrot ferme à onze heures. Si je rentre avant, {conjoint} ne dira rien.', en: 'The bar shuts at eleven. If I’m home before then, {conjoint} won’t say anything.' },
  ] },
  { id: 'u-t-dictee', kind: 'thought', layer: 1, bands: [5, 6], when: { doing: ['school'] }, lines: [
    { fr: 'L’instituteur a dit qu’il y aurait une dictée demain. Je n’ai pas appris les mots.', en: 'The teacher said there’d be a dictation tomorrow. I haven’t learned the words.' },
  ] },
  { id: 'u-t-teintures', kind: 'thought', layer: 1, bands: FONTE, when: { doing: ['river'] }, lines: [
    { fr: 'L’eau du canal est verte aujourd’hui. Ils ont encore vidé les teintures.', en: 'The canal water is green today. They’ve emptied the dye vats again.' },
  ] },
  { id: 'u-t-gris', adult: true, kind: 'thought', layer: 1, bands: FONTE, when: { doing: ['port'] }, lines: [
    { fr: 'Encore une péniche de charbon. Ce soir je me laverai deux fois, et je serai encore gris.', en: 'Another barge of coal. Tonight I’ll wash twice and still be grey.' },
  ] },
  { id: 'u-t-faucheuse', adult: true, kind: 'thought', layer: 1, bands: FONTE, when: { doing: ['field'] }, lines: [
    { fr: 'Le patron a commandé une machine qui fauche comme dix hommes. On verra combien d’hommes il garde.', en: 'The boss has ordered a machine that mows like ten men. We’ll see how many men he keeps.' },
  ] },
  { id: 'u-t-marquise', kind: 'thought', layer: 1, bands: FONTE, when: { doing: ['shelter'] }, lines: [
    { fr: 'J’attends sous la marquise de la gare. Ici, au moins, il y a de la lumière.', en: 'I’ll wait under the station canopy. At least there’s light here.' },
  ] },
  { id: 'u-t-passerelle', kind: 'thought', layer: 1, bands: FONTE, when: { notJob: ['constable'], doing: ['flee'] }, lines: [
    { fr: 'Par la cour, puis la passerelle du canal. Les sergents ne vont jamais jusque-là.', en: 'Through the yard, then the canal footbridge. The constables never go that far.' },
  ] },
  { id: 'u-t-chaudrons', adult: true, kind: 'thought', layer: 1, bands: FONTE, lines: [
    { fr: 'Le voisin du dessous tape encore sur ses chaudrons à six heures. Je dors la tête sous l’oreiller.', en: 'The man downstairs is banging his pots again at six. I sleep with my head under the pillow.' },
  ] },
  { id: 'u-t-ressemeler', adult: true, kind: 'thought', layer: 1, bands: FONTE, lines: [
    { fr: 'Il faut que je fasse ressemeler mes souliers avant l’hiver. Le cordonnier prend trois jours.', en: 'I need my shoes resoled before winter. The cobbler takes three days.' },
  ] },
  { id: 'u-t-lettre-mere', adult: true, kind: 'thought', layer: 1, bands: [5, 6], lines: [
    { fr: 'Il faut que je réponde à la lettre de ma mère. Ça fait trois semaines qu’elle attend.', en: 'I need to answer my mother’s letter. She’s been waiting three weeks.' },
  ] },
  { id: 'u-t-marrons', kind: 'thought', layer: 1, bands: FONTE, when: { child: true }, lines: [
    { fr: 'Le marchand de marrons est au coin du pont. Je n’ai pas de sou. Je vais juste sentir.', en: 'The chestnut seller is at the corner of the bridge. I haven’t got a coin. I’ll just go and smell.' },
  ] },
  { id: 'u-t-charbon-peniches', kind: 'thought', layer: 1, bands: FONTE, when: { child: true }, lines: [
    { fr: 'Si je ramasse le charbon tombé des péniches, à la maison on en aura pour deux jours.', en: 'If I pick up the coal that falls off the barges, we’ll have two days’ worth at home.' },
  ] },

  // ── Pensées, le métier ──
  { id: 'u-t-sirene', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['factory'] }, lines: [
    { fr: 'Si j’arrive après la sirène, le contremaître me retient la demi-journée. Je coupe par la cour des tanneurs.', en: 'If I get in after the whistle, the foreman docks me half a day. I’ll cut through the tanners’ yard.' },
  ] },
  { id: 'u-t-troisieme-rang', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['factory'] }, lines: [
    { fr: 'La machine du troisième rang se bloque toutes les heures. Personne ne veut s’en approcher.', en: 'The machine in the third row jams every hour. Nobody wants to go near it.' },
  ] },
  { id: 'u-t-commissaire', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['constable'] }, lines: [
    { fr: 'Le commissaire veut le rapport sur le dépôt avant midi. Je n’ai que des traces de pas et un sac vide.', en: 'The inspector wants the depot report by noon. All I’ve got is footprints and an empty sack.' },
  ] },
  { id: 'u-t-violettes', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['florist'] }, lines: [
    { fr: 'Il me reste vingt bouquets de violettes. Si je n’en vends pas dix avant le soir, elles seront fanées demain.', en: 'I’ve twenty bunches of violets left. If I don’t sell ten before evening, they’ll be wilted tomorrow.' },
  ] },
  { id: 'u-t-marechal', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['hauler'] }, lines: [
    { fr: 'Le cheval de droite tire moins. Je le ferai voir au maréchal avant la tournée de jeudi.', en: 'The right-hand horse isn’t pulling. I’ll have the farrier look at him before Thursday’s round.' },
  ] },
  { id: 'u-t-tonne', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['docker'] }, lines: [
    { fr: 'Le chef d’équipe paie à la tonne. Il compte toujours une tonne de moins.', en: 'The foreman pays by the ton. He always counts one ton short.' },
  ] },
  { id: 'u-t-boutons', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['banker'] }, lines: [
    { fr: 'Le client de dix heures veut un prêt pour une usine de boutons. C’est la troisième usine de boutons du mois.', en: 'The ten o’clock client wants a loan for a button factory. It’s the third button factory this month.' },
  ] },
  { id: 'u-t-rappels', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['actor'] }, lines: [
    { fr: 'Trois rappels hier soir. Ce soir, la salle sera à moitié vide, il pleut.', en: 'Three curtain calls last night. Tonight the house will be half empty. It’s raining.' },
  ] },
  { id: 'u-t-encrier', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['schoolmaster'] }, lines: [
    { fr: 'Trente-deux élèves, et l’encrier du fond fuit encore.', en: 'Thirty-two pupils, and the inkwell at the back is leaking again.' },
  ] },
  { id: 'u-t-ble-train', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['farmer'] }, lines: [
    { fr: 'Le blé d’ailleurs arrive par le train, moins cher que le nôtre.', en: 'Wheat from elsewhere comes in on the train, cheaper than ours.' },
  ] },
  { id: 'u-t-halles', kind: 'thought', layer: 1, bands: [5, 6], when: { job: ['marketGardener'] }, lines: [
    { fr: 'Les halles ouvrent à quatre heures. Si je pars à trois, j’ai la place près de l’entrée.', en: 'The market halls open at four. If I leave at three, I get the spot by the entrance.' },
  ] },
  { id: 'u-t-clous', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['storekeeper'] }, lines: [
    { fr: 'Il manque six caisses de clous. Le registre dit qu’elles sont là.', en: 'Six crates of nails are missing. The ledger says they’re here.' },
  ] },
  { id: 'u-t-gants', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['merchant'] }, lines: [
    { fr: 'Le magasin d’en face fait des soldes. Je baisserai les gants, pas les chapeaux.', en: 'The shop across the way is having a sale. I’ll mark down the gloves, not the hats.' },
  ] },
  { id: 'u-t-machine', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['artisan'] }, lines: [
    { fr: 'Le patron veut que j’apprenne la nouvelle machine. Trente ans que je fais ces pièces à la main.', en: 'The boss wants me to learn the new machine. Thirty years I’ve made these parts by hand.' },
  ] },
  { id: 'u-t-minoterie', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['miller'] }, lines: [
    { fr: 'La minoterie du port fait en une heure ce que je fais en une journée.', en: 'The flour mill at the port does in an hour what I do in a day.' },
  ] },
  { id: 'u-t-centimes', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['minter'] }, lines: [
    { fr: 'Les nouvelles pièces de dix centimes sont plus légères. Les gens vont dire qu’on les vole.', en: 'The new ten-centime coins are lighter. People will say they’re being robbed.' },
  ] },
  { id: 'u-t-penchee', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['scribe'] }, lines: [
    { fr: 'Quarante lettres à copier avant six heures. Le patron veut une écriture penchée.', en: 'Forty letters to copy before six. The boss wants a slanted hand.' },
  ] },
  { id: 'u-t-chiens-ecrases', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['printer'] }, lines: [
    { fr: 'Le journal doit partir à quatre heures. Il manque encore la colonne des chiens écrasés.', en: 'The paper goes out at four. The odds-and-ends column is still missing.' },
  ] },
  { id: 'u-t-enterrements', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['priest'] }, lines: [
    { fr: 'Trois enterrements cette semaine, tous de la même rue. Il faudra en parler au médecin.', en: 'Three funerals this week, all from the same street. Someone should tell the doctor.' },
  ] },
  { id: 'u-t-chien-gardien', kind: 'thought', layer: 1, bands: [5, 6], when: { job: ['watchman'] }, lines: [
    { fr: 'La ronde des entrepôts du port. Le chien du gardien de nuit me connaît, maintenant.', en: 'The round of the dock warehouses. The night guard’s dog knows me now.' },
  ] },
  { id: 'u-t-galerie', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['sewerman'] }, lines: [
    { fr: 'La grande galerie sous le boulevard est bouchée. On descend à quatre, avec les lampes.', en: 'The main tunnel under the boulevard is blocked. Four of us go down, with lamps.' },
  ] },
  { id: 'u-t-treize', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['official'] }, lines: [
    { fr: 'Encore le dossier des rues à numéroter. Personne ne veut le numéro treize.', en: 'The street-numbering file again. Nobody wants number thirteen.' },
  ] },
  { id: 'u-t-loyers', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['courtClerk'] }, lines: [
    { fr: 'Une affaire de loyers impayés. Le même propriétaire que la semaine dernière.', en: 'An unpaid rent case. Same landlord as last week.' },
  ] },
  { id: 'u-t-poutrelles', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['builder'] }, lines: [
    { fr: 'On assemble les poutrelles du pont lundi. Il faudra cent hommes et du beau temps.', en: 'We fit the bridge girders on Monday. It’ll take a hundred men and fine weather.' },
  ] },
  { id: 'u-t-voies', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['stateClerk'] }, lines: [
    { fr: 'Il faut recompter les kilomètres de voie. Le rapport de l’an dernier oubliait trois lignes.', en: 'The miles of track need recounting. Last year’s report left out three lines.' },
  ] },
  { id: 'u-t-fossiles', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['lettered'] }, lines: [
    { fr: 'La société savante se réunit jeudi. J’ai promis une communication sur les fossiles du canal.', en: 'The learned society meets on Thursday. I promised a paper on the canal fossils.' },
  ] },
  { id: 'u-t-almanachs', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['librarian'] }, lines: [
    { fr: 'Deux cents volumes de la succession du notaire. La moitié sont des almanachs.', en: 'Two hundred volumes from the notary’s estate. Half of them are almanacs.' },
  ] },
  { id: 'u-t-doyen', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['professor'] }, lines: [
    { fr: 'Il faut refaire l’expérience de la semaine dernière. Elle n’a pas marché devant le doyen.', en: 'I’ll have to redo last week’s experiment. It failed in front of the dean.' },
  ] },
  { id: 'u-t-pompe', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['fountaineer'] }, lines: [
    { fr: 'La pompe du quartier haut est encore en panne. Ils montent l’eau en seaux depuis trois jours.', en: 'The pump in the upper quarter is broken again. They’ve been carrying water up in buckets for three days.' },
  ] },
  { id: 'u-t-chiffre-rond', kind: 'thought', layer: 1, bands: FONTE, when: { job: ['strategist'] }, lines: [
    { fr: 'Le conseil veut savoir combien d’hommes il faudrait pour tenir la ligne du fleuve. Il veut un chiffre rond.', en: 'The council wants to know how many men it would take to hold the river line. They want a round number.' },
  ] },

  // ── Pensées, sa famille, son âge ──
  { id: 'u-t-bal', kind: 'thought', layer: 1, bands: FONTE, when: { family: 'married' }, lines: [
    { m: '{conjoint} veut qu’on aille au bal dimanche. Il faudra repasser ma chemise.', f: '{conjoint} veut qu’on aille au bal dimanche. Il faudra repasser ma robe.', en: '{conjoint} wants to go to the dance on Sunday. I’ll need to iron my good clothes.' },
  ] },
  { id: 'u-t-medecin', kind: 'thought', layer: 1, bands: FONTE, when: { kids: true }, lines: [
    { fr: '{enfant} tousse depuis trois nuits. Si ça continue, il faudra payer le médecin.', en: '{enfant} has been coughing for three nights. If it goes on, we’ll have to pay for the doctor.' },
  ] },
  { id: 'u-t-rentree', kind: 'thought', layer: 1, bands: [5, 6], when: { kids: true }, lines: [
    { fr: 'Il faudra des souliers neufs à {enfant} pour la rentrée. Ceux-là ont deux trous.', en: '{enfant} will need new shoes for school. These have two holes.' },
  ] },
  { id: 'u-t-six-heures', kind: 'thought', layer: 1, bands: [5, 6], when: { family: 'single' }, lines: [
    { m: 'Si je passe devant la blanchisserie à six heures, je la verrai sortir.', f: 'Si je passe devant l’atelier à six heures, je le verrai sortir.', en: 'If I walk past at six o’clock, I’ll see a certain someone come out.' },
  ] },
  { id: 'u-t-pre-vaches', kind: 'thought', layer: 1, bands: FONTE, when: { old: true }, lines: [
    { fr: 'Quand j’étais jeune, il n’y avait pas d’usine ici. Il y avait un pré et des vaches.', en: 'When I was young there was no factory here. There was a meadow and cows.' },
  ] },
  { id: 'u-t-cabinet', kind: 'thought', layer: 1, bands: [5, 6], when: { family: 'lodger' }, lines: [
    { fr: 'Je dors dans le cabinet chez {hote}. Il faudra que je paie ma part du charbon.', en: 'I sleep in the box room at {hote}’s. I’ll need to pay my share of the coal.' },
  ] },
  { id: 'u-t-billes', kind: 'thought', layer: 1, bands: [5, 6], when: { child: true }, lines: [
    { fr: '{gamin} a des billes en verre. Je lui échange contre ma toupie.', en: '{gamin} has glass marbles. I’ll swap him my spinning top.' },
  ] },
  { id: 'u-t-bout-lit', kind: 'thought', layer: 1, bands: [5, 6], when: { family: 'nephew' }, lines: [
    { fr: 'Chez {hote}, je dors au bout du lit des cousins. J’ai froid aux pieds.', en: 'At {hote}’s I sleep at the foot of the cousins’ bed. My feet get cold.' },
  ] },

  // ── Pensées, son caractère (Fonte et Néon) ──
  { id: 'u-t-grumpy', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'grumpy' }, lines: [
    { fr: 'Le voisin du dessus a encore traîné ses meubles à minuit. Demain, je monte lui parler.', en: 'The upstairs neighbour dragged his furniture around at midnight again. Tomorrow I’m going up to have a word.' },
  ] },
  { id: 'u-t-superstitious', kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'superstitious' }, lines: [
    { fr: 'Un chat noir devant la porte. Je fais le tour par la rue d’à côté.', en: 'A black cat by the door. I’ll go round by the next street.' },
  ] },
  { id: 'u-t-cheerful', kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'cheerful' }, lines: [
    { fr: 'Il fait beau. Je vais manger sur un banc du square, au soleil.', en: 'Lovely weather. I’ll eat on a bench in the square, in the sun.' },
  ] },
  { id: 'u-t-chatty', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'chatty' }, lines: [
    { fr: 'Il faut que je raconte à {voisine} ce que j’ai vu dans l’escalier. Elle va adorer.', en: 'I have to tell {voisine} what I saw on the stairs. She’ll love it.' },
  ] },
  { id: 'u-t-greedy', kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'greedy' }, lines: [
    { fr: 'La pâtisserie du coin a mis des éclairs en vitrine. Je regarde seulement.', en: 'The corner bakery has éclairs in the window. I’m only looking.' },
  ] },
  { id: 'u-t-curious', kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'curious' }, lines: [
    { fr: 'Pourquoi il y a une voiture devant chez {voisin} depuis trois jours ?', en: 'Why has there been a carriage outside {voisin}’s for three days?' },
  ] },
  { id: 'u-t-thrifty', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'thrifty' }, lines: [
    { fr: 'Le pain est moins cher à l’autre bout de la rue. Dix minutes de marche, ça vaut la peine.', en: 'Bread is cheaper at the other end of the street. A ten-minute walk. Worth it.' },
  ] },
  { id: 'u-t-generous', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'generous' }, lines: [
    { fr: 'J’ai pris deux pains. Le vieux du troisième ne descend plus beaucoup.', en: 'I bought two loaves. The old man on the third floor doesn’t come down much anymore.' },
  ] },
  { id: 'u-t-stubborn', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'stubborn' }, lines: [
    { fr: 'Ils disent que la boutique ferme à six heures. J’y serai à six heures moins une.', en: 'They say the shop shuts at six. I’ll be there at one minute to.' },
  ] },
  { id: 'u-t-early', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'early' }, lines: [
    { fr: 'Les rues sont vides. Le boulanger vient d’ouvrir, le pain est encore chaud.', en: 'The streets are empty. The baker has just opened. The bread is still warm.' },
  ] },
  { id: 'u-t-chilly', kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'chilly' }, lines: [
    { fr: 'J’aurais dû prendre l’écharpe. Ce vent passe à travers le manteau.', en: 'I should have brought my scarf. This wind goes right through my coat.' },
  ] },
  { id: 'u-t-brave', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'brave', riot: true }, lines: [
    { fr: 'Il y a un gamin coincé contre la vitrine. Il faut que quelqu’un aille le chercher.', en: 'There’s a kid pinned against the shop window. Someone has to go and get him.' },
  ] },
  { id: 'u-t-cautious', kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'cautious', riot: true }, lines: [
    { fr: 'Rentrer par la cour, fermer les volets, attendre que ça passe.', en: 'Go in through the courtyard, close the shutters, wait for it to pass.' },
  ] },
  { id: 'u-t-quiet', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'quiet' }, lines: [
    { fr: 'Au repas de dimanche, la famille va encore parler de politique. Je découperai le rôti.', en: 'At Sunday lunch the family will talk politics again. I’ll carve the roast.' },
  ] },
  { id: 'u-t-proud', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'proud' }, lines: [
    { fr: 'Mes vitres sont les plus propres de la rue. Ça se voit d’en bas.', en: 'My windows are the cleanest on the street. You can tell from down below.' },
  ] },
  { id: 'u-t-spiteful', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'spiteful' }, lines: [
    { m: '{voisine} a raconté à tout l’immeuble que j’étais rentré tard. Je n’oublie pas.', f: '{voisine} a raconté à tout l’immeuble que j’étais rentrée tard. Je n’oublie pas.', en: '{voisine} told the whole building I came home late. I won’t forget it.' },
  ] },
  { id: 'u-t-absent', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'absent' }, lines: [
    { fr: 'J’ai laissé le gaz allumé ? Non. Je crois que non.', en: 'Did I leave the gas on? No. I don’t think so.' },
  ] },
  { id: 'u-t-dreamy', kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'dreamy' }, lines: [
    { fr: 'Il y a un train pour la mer le samedi. Un jour, je le prendrai.', en: 'There’s a train to the sea on Saturdays. One day I’ll take it.' },
  ] },
  { id: 'u-t-pious', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'pious' }, lines: [
    { fr: 'Je passerai allumer une bougie pour ma mère. Ça fera un an jeudi.', en: 'I’ll stop by and light a candle for my mother. It’ll be a year on Thursday.' },
  ] },
  { id: 'u-t-hardworking', adult: true, kind: 'thought', layer: 1, bands: [5, 6], when: { trait: 'hardworking' }, lines: [
    { fr: 'Si je finis la commande ce soir, demain je peux en prendre une autre.', en: 'If I finish the order tonight, I can take on another tomorrow.' },
  ] },

  // ── Pensées, la ville telle qu'elle va ──
  { id: 'u-t-soupe-claire', adult: true, kind: 'thought', layer: 2, bands: FONTE, when: { cause: 'scarcity' }, lines: [
    { fr: 'Le pain a encore pris deux sous. On fera la soupe plus claire.', en: 'Bread’s up another two sous. We’ll make the soup thinner.' },
  ] },
  { id: 'u-t-charbon-neige', adult: true, kind: 'thought', layer: 2, bands: FONTE, when: { precip: 'snow' }, lines: [
    { fr: 'Il faudra du charbon pour trois jours si ça continue. On n’en a que pour un.', en: 'We’ll need coal for three days if this keeps up. We’ve only got enough for one.' },
  ] },
  { id: 'u-t-reverbere', kind: 'thought', layer: 2, bands: FONTE, when: { night: true }, lines: [
    { fr: 'Le réverbère de la rue est encore cassé. Je marche au milieu de la chaussée.', en: 'The street lamp is broken again. I walk down the middle of the road.' },
  ] },
  { id: 'u-t-chantent', kind: 'thought', layer: 2, bands: FONTE, when: { notJob: ['constable'], riot: true }, lines: [
    { fr: 'Ils chantent devant l’usine. Les sergents à cheval sont au bout de la rue. Je ne reste pas.', en: 'They’re singing outside the factory. Mounted constables at the end of the street. I’m not staying.' },
  ] },
  { id: 'u-t-merveille', kind: 'thought', layer: 2, bands: FONTE, when: { wonder: true }, lines: [
    { fr: 'On dit qu’on voit toute la ville du haut de la merveille. Il faut payer pour monter.', en: 'They say you can see the whole city from the top of the wonder. You have to pay to go up.' },
  ] },
  { id: 'u-t-vraie-fenetre', adult: true, kind: 'thought', layer: 2, bands: FONTE, when: { prosper: true }, lines: [
    { fr: 'Ils embauchent partout. Si ça tient, on prendra un logement avec une vraie fenêtre.', en: 'They’re hiring everywhere. If it lasts, we’ll get a place with a real window.' },
  ] },
  { id: 'u-t-cave-charbon', kind: 'thought', layer: 2, bands: FONTE, when: { cause: 'inequality' }, lines: [
    { fr: 'Sur le boulevard, le charbon arrive par la cave. Ici, on le monte à dos sur six étages.', en: 'On the boulevard the coal comes in through the cellar. Here we carry it up six floors on our backs.' },
  ] },
  { id: 'u-t-certificats', adult: true, kind: 'thought', layer: 2, bands: FONTE, when: { cause: 'complexity', kids: true }, lines: [
    { fr: 'Pour inscrire {enfant} à l’école, il faut un certificat de vaccine, un certificat de domicile et une photographie.', en: 'To enrol {enfant} at school you need a vaccination certificate, proof of address and a photograph.' },
  ] },
  { id: 'u-t-tracts', kind: 'thought', layer: 2, bands: FONTE, when: { cause: 'dissent' }, lines: [
    { fr: 'Il y a des tracts sous les portes ce matin. Ils parlent de la journée de huit heures.', en: 'There are leaflets under the doors this morning. They’re about the eight-hour day.' },
  ] },
  { id: 'u-t-platre', adult: true, kind: 'thought', layer: 2, bands: FONTE, when: { cause: 'structural' }, lines: [
    { fr: 'La cage d’escalier sent le plâtre mouillé. Je ne tiens plus la rampe.', en: 'The stairwell smells of wet plaster. I don’t hold the banister anymore.' },
  ] },
  { id: 'u-t-passage', kind: 'thought', layer: 2, bands: FONTE, when: { cause: 'wear' }, lines: [
    { fr: 'Le pavé du passage est défoncé depuis l’hiver. Personne ne le refait.', en: 'The paving in the passage has been broken since winter. Nobody repairs it.' },
  ] },
  { id: 'u-t-quatre-jours', adult: true, kind: 'thought', layer: 2, bands: FONTE, when: { cause: 'poverty' }, lines: [
    { fr: 'Encore quatre jours avant la paie. Il reste du pain pour deux.', en: 'Four more days to payday. There’s bread for two.' },
  ] },
  { id: 'u-t-trois-arbres', adult: true, kind: 'thought', layer: 2, bands: FONTE, when: { cause: 'demesure' }, lines: [
    { fr: 'Ils ont construit jusqu’au bois où on allait le dimanche. Il reste trois arbres, derrière la gare.', en: 'They’ve built right up to the woods where we went on Sundays. There are three trees left, behind the station.' },
  ] },
  { id: 'u-t-cuisine', adult: true, kind: 'thought', layer: 2, bands: FONTE, when: { season: 'winter' }, lines: [
    { fr: 'Le charbon a encore augmenté. On ne chauffe plus que la cuisine.', en: 'Coal’s gone up again. We only heat the kitchen now.' },
  ] },
  { id: 'u-t-une-fenetre', adult: true, kind: 'thought', layer: 2, bands: FONTE, when: { season: 'summer' }, lines: [
    { fr: 'Il fait trente degrés dans l’atelier. Le contremaître a fait ouvrir une fenêtre. Une seule.', en: 'It’s thirty degrees in the workshop. The foreman had a window opened. Just one.' },
  ] },
  { id: 'u-t-square', adult: true, kind: 'thought', layer: 2, bands: FONTE, when: { season: 'autumn' }, lines: [
    { fr: 'Les marrons tombent dans le square. Les enfants vont rentrer les poches pleines.', en: 'The conkers are falling in the square. The children will come home with their pockets full.' },
  ] },
  { id: 'u-t-bord-eau', kind: 'thought', layer: 2, bands: FONTE, when: { season: 'spring' }, lines: [
    { fr: 'Les beaux jours reviennent. Dimanche, on ira au bord de l’eau, s’il ne pleut pas.', en: 'The fine weather’s back. On Sunday we’ll go down to the water, if it doesn’t rain.' },
  ] },

  // ══ NÉON ════════════════════════════════════════════════════════════════════
  // ── Causettes, leur vie ──
  { id: 'n-c-metro', kind: 'chat', layer: 1, bands: NEON, lines: [
    { who: 'a', fr: 'Tu prends le métro ?', en: 'Taking the metro?' },
    { who: 'b', fr: 'La ligne trois est encore en panne. Je vais marcher jusqu’au pont.', en: 'Line three is down again. I’ll walk to the bridge.' },
  ] },
  { id: 'n-c-interphone', kind: 'chat', layer: 1, bands: NEON, lines: [
    { who: 'a', fr: 'Ton interphone marche ?', en: 'Is your intercom working?' },
    { who: 'b', fr: 'Pas depuis lundi. Les livreurs m’appellent sur le portable.', en: 'Not since Monday. The delivery people call my mobile.' },
  ] },
  { id: 'n-c-loyer', adult: true, kind: 'chat', layer: 1, bands: NEON, when: { rel: 'couple' }, lines: [
    { who: 'a', fr: 'Tu as payé le loyer ?', en: 'Did you pay the rent?' },
    { who: 'b', fr: 'Ce matin. Il reste quarante jusqu’à la fin du mois.', en: 'This morning. There’s forty left till the end of the month.' },
    { who: 'a', fr: 'On fera des pâtes.', en: 'Pasta, then.' },
  ] },
  { id: 'n-c-vacances', kind: 'chat', layer: 1, bands: NEON, when: { rel: 'couple' }, lines: [
    { who: 'a', fr: 'On part où, cet été ?', en: 'Where are we going this summer?' },
    { who: 'b', fr: 'Chez ta sœur, comme l’an dernier.', en: 'Your sister’s, like last year.' },
    { who: 'a', fr: 'Elle a toujours le chien ?', en: 'Has she still got that dog?' },
  ] },
  { id: 'n-c-devoirs', kind: 'chat', layer: 1, bands: NEON, when: { rel: 'parentKid' }, lines: [
    { who: 'kid', fr: 'Je peux aller jouer chez {gamin} ?', en: 'Can I go and play at {gamin}’s?' },
    { who: 'parent', fr: 'Après tes devoirs.', en: 'After your homework.' },
    { who: 'kid', fr: 'Je les ai faits.', en: 'I’ve done it.' },
    { who: 'parent', fr: 'Montre-moi.', en: 'Show me.' },
  ] },
  { id: 'n-c-ferrand', kind: 'chat', layer: 1, bands: NEON, when: { job: ['clerk'] }, lines: [
    { who: 'b', fr: 'Tu as fini le dossier Ferrand ?', en: 'Have you finished the Ferrand file?' },
    { who: 'a', fr: 'Il est sur mon bureau depuis lundi.', en: 'It’s been on my desk since Monday.' },
    { who: 'b', fr: 'Le chef le veut avant la réunion.', en: 'The boss wants it before the meeting.' },
    { who: 'a', fr: 'Quelle réunion ?', en: 'What meeting?' },
  ] },
  { id: 'n-c-scooter', kind: 'chat', layer: 1, bands: NEON, when: { job: ['courier'] }, lines: [
    { who: 'b', fr: 'Tu en es à combien, aujourd’hui ?', en: 'How many so far today?' },
    { who: 'a', fr: 'Trente-deux livraisons. Le scooter fait un drôle de bruit depuis midi.', en: 'Thirty-two deliveries. The scooter’s been making a funny noise since noon.' },
  ] },
  { id: 'n-c-garde', kind: 'chat', layer: 1, bands: NEON, when: { job: ['nurse'] }, lines: [
    { who: 'b', fr: 'Tu sors de garde ?', en: 'Coming off your shift?' },
    { who: 'a', fr: 'Douze heures. Trois entrées après minuit.', en: 'Twelve hours. Three admissions after midnight.' },
    { who: 'b', fr: 'Va dormir.', en: 'Go to bed.' },
    { who: 'a', fr: 'Je passe d’abord à la pharmacie pour ma mère.', en: 'I have to stop at the pharmacy for my mother first.' },
  ] },

  // ── Causettes, la ville telle qu'elle va ──
  { id: 'n-c-rayons', kind: 'chat', layer: 2, bands: NEON, when: { cause: 'scarcity' }, lines: [
    { who: 'a', fr: 'Il n’y avait plus de farine au supermarché.', en: 'There was no flour left at the supermarket.' },
    { who: 'b', fr: 'Ni d’huile. Les rayons sont vides depuis mardi.', en: 'Or oil. The shelves have been empty since Tuesday.' },
  ] },
  { id: 'n-c-lofts', kind: 'chat', layer: 2, bands: NEON, when: { cause: 'inequality' }, lines: [
    { who: 'a', fr: 'Ils ont refait tout l’immeuble d’en face. Des lofts.', en: 'They’ve redone the whole building opposite. Lofts.' },
    { who: 'b', fr: 'Et ceux qui habitaient là ?', en: 'And the people who lived there?' },
    { who: 'a', fr: 'Partis en banlieue. La boulangère aussi.', en: 'Moved out to the suburbs. The baker too.' },
  ] },
  { id: 'n-c-guichet', adult: true, kind: 'chat', layer: 2, bands: NEON, when: { cause: 'complexity' }, lines: [
    { who: 'a', fr: 'J’ai attendu trois heures au guichet.', en: 'I waited three hours at the counter.' },
    { who: 'b', fr: 'Qu’est-ce qu’on t’a dit ?', en: 'What did they tell you?' },
    { who: 'a', fr: 'Que le formulaire se remplit en ligne. Le site ne marche pas.', en: 'That the form has to be filled in online. The website doesn’t work.' },
  ] },
  { id: 'n-c-coupures', kind: 'chat', layer: 2, bands: NEON, when: { cause: 'dissent' }, lines: [
    { who: 'a', fr: 'Aux nouvelles, ils disent que tout va bien.', en: 'On the news they say everything’s fine.' },
    { who: 'b', fr: 'Ma sœur travaille à la mairie. Elle dit qu’ils préparent des coupures d’électricité.', en: 'My sister works at the town hall. She says they’re planning power cuts.' },
  ] },
  { id: 'n-c-ascenseur', kind: 'chat', layer: 2, bands: NEON, when: { cause: 'structural' }, lines: [
    { who: 'a', fr: 'L’ascenseur est encore en panne.', en: 'The lift’s broken again.' },
    { who: 'b', fr: 'Depuis quand ?', en: 'Since when?' },
    { who: 'a', fr: 'Jeudi. La dame du sixième ne sort plus de chez elle.', en: 'Thursday. The lady on the sixth floor hasn’t been out since.' },
  ] },
  { id: 'n-c-manteaux', kind: 'chat', layer: 2, bands: NEON, when: { cause: 'wear' }, lines: [
    { who: 'a', fr: 'Les fenêtres de l’école ne ferment plus. Les enfants gardent leur manteau en classe.', en: 'The school windows won’t shut anymore. The children keep their coats on in class.' },
    { who: 'b', fr: 'Ils ont promis des travaux pour l’été.', en: 'They’ve promised repairs for the summer.' },
  ] },
  { id: 'n-c-decouvert', adult: true, kind: 'chat', layer: 2, bands: NEON, when: { cause: 'poverty' }, lines: [
    { who: 'a', fr: 'Tu peux me dépanner jusqu’au dix ?', en: 'Can you tide me over till the tenth?' },
    { who: 'b', fr: 'Je suis à découvert depuis le cinq.', en: 'I’ve been overdrawn since the fifth.' },
  ] },
  { id: 'n-c-bonde', kind: 'chat', layer: 2, bands: NEON, when: { precip: 'rain' }, lines: [
    { who: 'a', fr: 'Encore une averse.', en: 'Another downpour.' },
    { who: 'b', fr: 'Le métro va être bondé, tout le monde va le prendre.', en: 'The metro will be packed. Everyone will take it.' },
  ] },
  { id: 'n-c-bus-neige', kind: 'chat', layer: 2, bands: NEON, when: { precip: 'snow' }, lines: [
    { who: 'a', fr: 'Les bus ne passent plus depuis ce matin.', en: 'The buses stopped running this morning.' },
    { who: 'b', fr: 'Je vais au travail à pied. Trois quarts d’heure.', en: 'I’m walking to work. Forty-five minutes.' },
  ] },
  { id: 'n-c-snack', kind: 'chat', layer: 2, bands: NEON, when: { night: true }, lines: [
    { who: 'a', fr: 'On va manger un morceau ?', en: 'Shall we get something to eat?' },
    { who: 'b', fr: 'Le snack du coin ferme à deux heures. On a le temps.', en: 'The place on the corner closes at two. We’ve got time.' },
  ] },
  { id: 'n-c-boulevard', kind: 'chat', layer: 2, bands: NEON, when: { riot: true }, lines: [
    { who: 'a', fr: 'Ils ont bloqué le boulevard.', en: 'They’ve blocked the boulevard.' },
    { who: 'b', fr: 'Pour quoi ?', en: 'What for?' },
    { who: 'a', fr: 'Le prix des transports, je crois. Prends la rue de derrière.', en: 'Transport fares, I think. Take the back street.' },
  ] },
  { id: 'n-c-merveille', kind: 'chat', layer: 2, bands: NEON, when: { wonder: true }, lines: [
    { who: 'a', fr: 'Tu as vu la merveille, la nuit ?', en: 'Have you seen the wonder at night?' },
    { who: 'b', fr: 'Elle est éclairée jusqu’en haut. On la voit depuis l’autoroute.', en: 'It’s lit right to the top. You can see it from the motorway.' },
  ] },
  { id: 'n-c-stage', adult: true, kind: 'chat', layer: 2, bands: NEON, when: { prosper: true }, lines: [
    { who: 'a', fr: 'Ils embauchent partout dans le quartier.', en: 'They’re hiring all over the neighbourhood.' },
    { who: 'b', fr: 'Ma fille a trouvé un stage. Payé, cette fois.', en: 'My daughter found an internship. Paid, this time.' },
  ] },
  { id: 'n-c-periph', kind: 'chat', layer: 2, bands: NEON, when: { cause: 'demesure' }, lines: [
    { who: 'a', fr: 'Une heure et demie de bus pour traverser la ville.', en: 'An hour and a half on the bus to cross town.' },
    { who: 'b', fr: 'Et ils construisent encore de l’autre côté du périphérique.', en: 'And they’re still building on the other side of the ring road.' },
  ] },

  // ── Pensées, ce qu'il fait ──
  { id: 'n-t-pates', adult: true, kind: 'thought', layer: 1, bands: NEON, when: { doing: ['home'] }, lines: [
    { fr: 'Il reste des pâtes et une demi-boîte de sauce. Ça ira.', en: 'There’s pasta and half a jar of sauce. That’ll do.' },
  ] },
  { id: 'n-t-lait', kind: 'thought', layer: 1, bands: NEON, when: { doing: ['home'], family: 'married' }, lines: [
    { fr: '{conjoint} m’a envoyé un message pour le lait. Je l’ai lu trop tard.', en: '{conjoint} texted me about the milk. I saw it too late.' },
  ] },
  { id: 'n-t-reunion', adult: true, kind: 'thought', layer: 1, bands: NEON, when: { group: ['office', 'learning', 'trade', 'art'], doing: ['work'] }, lines: [
    { fr: 'Si le métro a encore dix minutes de retard, je rate le début de la réunion. Le chef va le remarquer.', en: 'If the metro is ten minutes late again, I’ll miss the start of the meeting. The boss will notice.' },
  ] },
  { id: 'n-t-lessive', adult: true, kind: 'thought', layer: 1, bands: NEON, when: { doing: ['errand'] }, lines: [
    { fr: 'Du lait, des œufs, la lessive. Et rendre les bouteilles.', en: 'Milk, eggs, washing powder. And take the bottles back.' },
  ] },
  { id: 'n-t-concert', adult: true, kind: 'thought', layer: 1, bands: NEON, when: { doing: ['plaza'] }, lines: [
    { fr: 'Il y a un concert gratuit sur la place à huit heures. Je dirai à {voisine} de venir.', en: 'There’s a free concert on the square at eight. I’ll tell {voisine} to come.' },
  ] },
  { id: 'n-t-operation', adult: true, kind: 'thought', layer: 1, bands: NEON, when: { doing: ['pray'] }, lines: [
    { fr: 'Je vais allumer une bougie pour l’opération de ma mère. Jeudi, neuf heures.', en: 'I’ll light a candle for my mother’s operation. Thursday, nine o’clock.' },
  ] },
  { id: 'n-t-bouquinistes', kind: 'thought', layer: 1, bands: NEON, when: { doing: ['wander'] }, lines: [
    { fr: 'Je vais faire le tour par les quais. Il y a des bouquinistes le mardi.', en: 'I’ll go round by the river. There are book stalls on Tuesdays.' },
  ] },
  { id: 'n-t-cinq-heures', adult: true, kind: 'thought', layer: 1, bands: NEON, when: { doing: ['night'] }, lines: [
    { fr: 'Il est deux heures. Si je rentre maintenant, je dors cinq heures.', en: 'It’s two o’clock. If I go home now, I get five hours’ sleep.' },
  ] },
  { id: 'n-t-fractions', kind: 'thought', layer: 1, bands: NEON, when: { doing: ['school'] }, lines: [
    { fr: 'Contrôle de maths demain. Je n’ai pas compris les fractions.', en: 'Maths test tomorrow. I don’t get fractions.' },
  ] },
  { id: 'n-t-peniches', kind: 'thought', layer: 1, bands: NEON, when: { doing: ['river'] }, lines: [
    { fr: 'Les bateaux-restaurants sont allumés. On n’y est jamais allés.', en: 'The restaurant boats are lit up. We’ve never been.' },
  ] },
  { id: 'n-t-chariot', adult: true, kind: 'thought', layer: 1, bands: NEON, when: { doing: ['port'] }, lines: [
    { fr: 'Les conteneurs arrivent à six heures. Je serai là à cinq heures et demie pour avoir le bon chariot.', en: 'The containers come in at six. I’ll be there at half five to get the good forklift.' },
  ] },
  { id: 'n-t-capteur', adult: true, kind: 'thought', layer: 1, bands: [6, 7], when: { doing: ['field'] }, lines: [
    { fr: 'Le capteur du champ nord dit qu’il manque d’eau. J’attends la pluie de cet après-midi avant d’arroser.', en: 'The sensor on the north field says it needs water. I’ll wait for this afternoon’s rain before irrigating.' },
  ] },
  { id: 'n-t-abribus', kind: 'thought', layer: 1, bands: NEON, when: { doing: ['shelter'] }, lines: [
    { fr: 'J’attends sous l’abribus. Le prochain est dans douze minutes, d’après l’écran.', en: 'I’ll wait in the bus shelter. The next one’s in twelve minutes, says the screen.' },
  ] },
  { id: 'n-t-station-suivante', kind: 'thought', layer: 1, bands: NEON, when: { doing: ['flee'] }, lines: [
    { fr: 'Prendre la rue de derrière, puis le métro à la station suivante.', en: 'Take the back street, then the metro at the next station.' },
  ] },
  { id: 'n-t-machine-laver', adult: true, kind: 'thought', layer: 1, bands: NEON, lines: [
    { fr: 'Le voisin du dessus a encore fait tourner sa machine à laver à minuit.', en: 'The upstairs neighbour ran his washing machine at midnight again.' },
  ] },
  { id: 'n-t-plombier', adult: true, kind: 'thought', layer: 1, bands: NEON, lines: [
    { fr: 'Il faut que je rappelle le plombier. Ça fait trois fois qu’il dit qu’il passe.', en: 'I have to call the plumber back. That’s three times he’s said he’s coming.' },
  ] },
  { id: 'n-t-tele', kind: 'thought', layer: 1, bands: NEON, when: { child: true }, lines: [
    { fr: 'Si je rentre avant maman, je peux regarder la télé une demi-heure sans qu’elle le sache.', en: 'If I get home before Mum, I can watch half an hour of telly without her knowing.' },
  ] },
  { id: 'n-t-musee', kind: 'thought', layer: 1, bands: NEON, when: { child: true }, lines: [
    { fr: 'Demain, c’est la sortie au musée. Il faut que je pense à demander l’argent du car.', en: 'Tomorrow’s the museum trip. I have to remember to ask for the coach money.' },
  ] },

  // ── Pensées, le métier ──
  { id: 'n-t-ferrand', kind: 'thought', layer: 1, bands: NEON, when: { job: ['clerk'] }, lines: [
    { fr: 'Le dossier Ferrand traîne sur mon bureau depuis lundi. Je le remets sous la pile.', en: 'The Ferrand file has been on my desk since Monday. I’ll put it back under the pile.' },
  ] },
  { id: 'n-t-quartier-haut', kind: 'thought', layer: 1, bands: NEON, when: { job: ['courier'] }, lines: [
    { fr: 'Encore huit livraisons. Si je fais les trois du quartier haut d’un coup, je gagne vingt minutes.', en: 'Eight more deliveries. If I do the three uptown in one go, I save twenty minutes.' },
  ] },
  { id: 'n-t-chambre-quatre', kind: 'thought', layer: 1, bands: NEON, when: { job: ['nurse'] }, lines: [
    { fr: 'Douze heures de garde. La dame de la chambre quatre m’a demandé trois fois si sa fille avait appelé.', en: 'A twelve-hour shift. The lady in room four asked me three times if her daughter had called.' },
  ] },
  { id: 'n-t-gouttiere', kind: 'thought', layer: 1, bands: NEON, when: { job: ['journalist'] }, lines: [
    { fr: 'Il me faut un sujet avant seize heures. Le chat coincé dans la gouttière, rue des Lilas, peut-être.', en: 'I need a story before four. The cat stuck in the gutter on Lilac Street, maybe.' },
  ] },
  { id: 'n-t-copies', kind: 'thought', layer: 1, bands: NEON, when: { job: ['teacher'] }, lines: [
    { fr: 'Les copies du contrôle de jeudi. Trente et une, et j’en ai corrigé quatre.', en: 'Thursday’s test papers. Thirty-one, and I’ve marked four.' },
  ] },
  { id: 'n-t-semences', kind: 'thought', layer: 1, bands: NEON, when: { job: ['agronomist'] }, lines: [
    { fr: 'Les semences ont augmenté de vingt pour cent. On sèmera moins serré.', en: 'Seed prices are up twenty percent. We’ll sow less densely.' },
  ] },
  { id: 'n-t-restaurant', kind: 'thought', layer: 1, bands: NEON, when: { job: ['banker'] }, lines: [
    { fr: 'Le client de dix heures veut un prêt pour ouvrir un restaurant. Le troisième de la rue.', en: 'The ten o’clock wants a loan to open a restaurant. The third on that street.' },
  ] },
  { id: 'n-t-bouchons', kind: 'thought', layer: 1, bands: NEON, when: { job: ['hauler'] }, lines: [
    { fr: 'Six cents kilomètres jusqu’à l’entrepôt. Si je pars à quatre heures, j’évite les bouchons.', en: 'Six hundred kilometres to the depot. If I leave at four, I miss the traffic.' },
  ] },
  { id: 'n-t-portique', kind: 'thought', layer: 1, bands: NEON, when: { job: ['docker'] }, lines: [
    { fr: 'Le portique numéro deux est encore en panne. On décharge à la main, comme avant.', en: 'Crane number two is down again. We’re unloading by hand, like the old days.' },
  ] },
  { id: 'n-t-etiquettes', kind: 'thought', layer: 1, bands: NEON, when: { job: ['merchant'] }, lines: [
    { fr: 'Les soldes commencent mercredi. Il faut changer toutes les étiquettes ce soir.', en: 'The sales start on Wednesday. All the labels need changing tonight.' },
  ] },
  { id: 'n-t-chene', kind: 'thought', layer: 1, bands: NEON, when: { job: ['artisan'] }, lines: [
    { fr: 'Un comptoir en chêne pour la boulangerie, pour vendredi. Le chêne n’est pas encore arrivé.', en: 'An oak counter for the bakery, due Friday. The oak hasn’t arrived yet.' },
  ] },
  { id: 'n-t-cartons', kind: 'thought', layer: 1, bands: NEON, when: { job: ['storekeeper'] }, lines: [
    { fr: 'Le logiciel dit qu’il reste quarante cartons. J’en compte trente-huit.', en: 'The software says forty boxes left. I count thirty-eight.' },
  ] },
  { id: 'n-t-vingt-personnes', kind: 'thought', layer: 1, bands: NEON, when: { job: ['official'] }, lines: [
    { fr: 'Le guichet ouvre dans dix minutes. Il y a déjà vingt personnes devant la porte.', en: 'The counter opens in ten minutes. Twenty people at the door already.' },
  ] },
  { id: 'n-t-une-page', kind: 'thought', layer: 1, bands: NEON, when: { job: ['stateClerk'] }, lines: [
    { fr: 'Il faut réécrire la note pour le ministre. Il veut une page, pas trois.', en: 'The memo for the minister needs rewriting. He wants one page, not three.' },
  ] },
  { id: 'n-t-haie', kind: 'thought', layer: 1, bands: NEON, when: { job: ['courtClerk'] }, lines: [
    { fr: 'Audience à quatorze heures. Encore la haie de monsieur Ravel.', en: 'Hearing at two. Mr Ravel’s hedge again.' },
  ] },
  { id: 'n-t-disquettes', kind: 'thought', layer: 1, bands: [6, 7], when: { job: ['archivist'] }, lines: [
    { fr: 'Les fichiers de l’ancien cadastre sont sur des disquettes. Il faut trouver un lecteur qui marche.', en: 'The old land registry files are on floppy disks. I need to find a drive that works.' },
  ] },
  { id: 'n-t-sonder', kind: 'thought', layer: 1, bands: [6, 7], when: { job: ['architect'] }, lines: [
    { fr: 'Ils veulent construire sur l’ancienne usine. Il faut sonder le sol avant. Personne ne sait ce qu’il y a dessous.', en: 'They want to build on the old factory site. The ground needs surveying first. Nobody knows what’s under there.' },
  ] },
  { id: 'n-t-scenarios', kind: 'thought', layer: 1, bands: [6, 7], when: { job: ['strategist'] }, lines: [
    { fr: 'Trois scénarios pour demain. Ils prendront le moins cher, comme d’habitude.', en: 'Three scenarios for tomorrow. They’ll pick the cheapest, as usual.' },
  ] },
  { id: 'n-t-rotative', kind: 'thought', layer: 1, bands: NEON, when: { job: ['printer'] }, lines: [
    { fr: 'La rotative du deuxième tombe en panne toutes les nuits à la même heure.', en: 'The second-floor press breaks down every night at the same time.' },
  ] },
  { id: 'n-t-jambon', kind: 'thought', layer: 1, bands: NEON, when: { job: ['librarian'] }, lines: [
    { fr: 'Quelqu’un a rendu un livre avec une tranche de jambon en marque-page.', en: 'Someone returned a book with a slice of ham as a bookmark.' },
  ] },
  { id: 'n-t-memoires', kind: 'thought', layer: 1, bands: [6, 7], when: { job: ['professor'] }, lines: [
    { fr: 'Il faut que je finisse de corriger les mémoires avant le jury de vendredi. Il en reste neuf.', en: 'I have to finish marking the dissertations before Friday’s panel. Nine left.' },
  ] },
  { id: 'n-t-lingettes', kind: 'thought', layer: 1, bands: NEON, when: { job: ['sewerman'] }, lines: [
    { fr: 'Les égouts du centre sont encore bouchés par les lingettes. On descend à quatre.', en: 'The central sewers are blocked with wet wipes again. Four of us are going down.' },
  ] },
  { id: 'n-t-parking', kind: 'thought', layer: 1, bands: NEON, when: { job: ['watchman'] }, lines: [
    { fr: 'Ronde du parking à minuit. Le néon du troisième sous-sol clignote encore.', en: 'Car park round at midnight. The light on the third basement level is flickering again.' },
  ] },
  { id: 'n-t-lilas', kind: 'thought', layer: 1, bands: [6, 7], when: { job: ['fountaineer'] }, lines: [
    { fr: 'Une fuite sur la conduite principale, rue des Lilas. On coupe l’eau à tout le quartier pendant deux heures.', en: 'A leak on the main pipe on Lilac Street. We’re cutting the water to the whole area for two hours.' },
  ] },
  { id: 'n-t-dalle', kind: 'thought', layer: 1, bands: NEON, when: { job: ['builder'] }, lines: [
    { fr: 'On coule la dalle du douzième lundi, si le béton arrive à l’heure.', en: 'We pour the twelfth-floor slab on Monday, if the concrete turns up on time.' },
  ] },
  { id: 'n-t-touche-e', kind: 'thought', layer: 1, bands: NEON, when: { job: ['scribe'] }, lines: [
    { fr: 'Encore trente pages à saisir pour l’étude du notaire. Le clavier colle à la touche E.', en: 'Thirty more pages to type for the notary’s office. The E key sticks.' },
  ] },
  { id: 'n-t-colloque', kind: 'thought', layer: 1, bands: [6, 7], when: { job: ['lettered'] }, lines: [
    { fr: 'Le colloque est dans trois semaines. Je n’ai que le titre de ma communication.', en: 'The conference is in three weeks. I’ve only got the title of my paper.' },
  ] },
  { id: 'n-t-billets', kind: 'thought', layer: 1, bands: NEON, when: { job: ['minter'] }, lines: [
    { fr: 'On change les billets en janvier. Il faut recalibrer toutes les machines.', en: 'The banknotes change in January. Every machine has to be recalibrated.' },
  ] },
  { id: 'n-t-nuits', kind: 'thought', layer: 1, bands: NEON, when: { job: ['miller'] }, lines: [
    { fr: 'La minoterie tourne jour et nuit. Je fais les nuits cette semaine.', en: 'The flour mill runs day and night. I’m on nights this week.' },
  ] },
  { id: 'n-t-fleurs', kind: 'thought', layer: 1, bands: NEON, when: { job: ['priest'] }, lines: [
    { fr: 'Deux familles seulement, ce matin. Je garderai les fleurs pour dimanche.', en: 'Only two families this morning. I’ll keep the flowers for Sunday.' },
  ] },
  { id: 'n-t-cooperative', kind: 'thought', layer: 1, bands: NEON, when: { job: ['marketGardener'] }, lines: [
    { fr: 'La coopérative paie les tomates moins cher que l’an dernier. Je vendrai au marché le samedi.', en: 'The co-op is paying less for tomatoes than last year. I’ll sell at the market on Saturdays.' },
  ] },

  // ── Pensées, sa famille, son âge ──
  { id: 'n-t-conges', kind: 'thought', layer: 1, bands: NEON, when: { family: 'married' }, lines: [
    { fr: '{conjoint} veut qu’on parte en vacances cet été. Il faudrait que je pose mes congés avant vendredi.', en: '{conjoint} wants us to go away this summer. I’d have to book my leave before Friday.' },
  ] },
  { id: 'n-t-fievre', kind: 'thought', layer: 1, bands: NEON, when: { kids: true }, lines: [
    { fr: '{enfant} a encore de la fièvre. Si ça continue demain, j’appelle le médecin et je ne vais pas au travail.', en: '{enfant} still has a temperature. If it’s still up tomorrow, I’ll call the doctor and stay off work.' },
  ] },
  { id: 'n-t-maitresse', kind: 'thought', layer: 1, bands: NEON, when: { kids: true }, lines: [
    { fr: 'La maîtresse de {enfant} veut me voir à dix-huit heures. Il a dû se passer quelque chose.', en: '{enfant}’s teacher wants to see me at six. Something must have happened.' },
  ] },
  { id: 'n-t-laverie', kind: 'thought', layer: 1, bands: NEON, when: { family: 'single' }, lines: [
    { fr: 'À la laverie, il y a quelqu’un qui lit toujours en attendant. J’irai laver mes affaires jeudi.', en: 'At the launderette there’s someone who always reads while they wait. I’ll do my washing on Thursday.' },
  ] },
  { id: 'n-t-vaches-periph', kind: 'thought', layer: 1, bands: NEON, when: { old: true }, lines: [
    { fr: 'Quand j’étais jeune, il y avait des vaches de l’autre côté du périphérique.', en: 'When I was young there were cows on the other side of the ring road.' },
  ] },
  { id: 'n-t-canape', kind: 'thought', layer: 1, bands: NEON, when: { family: 'lodger' }, lines: [
    { fr: 'Je dors sur le canapé de {hote} depuis trois semaines. Il faudra que je trouve quelque chose avant la fin du mois.', en: 'I’ve been on {hote}’s sofa for three weeks. I need to find somewhere before the end of the month.' },
  ] },
  { id: 'n-t-jeu', kind: 'thought', layer: 1, bands: NEON, when: { child: true }, lines: [
    { fr: '{gamin} a le nouveau jeu. Il me le prête si je lui donne mes cartes.', en: '{gamin} has the new game. He’ll lend it to me if I give him my cards.' },
  ] },
  { id: 'n-t-bebe', kind: 'thought', layer: 1, bands: NEON, when: { family: 'nephew' }, lines: [
    { fr: 'Chez {hote}, j’ai la chambre du bébé. Il pleure à quatre heures.', en: 'At {hote}’s I sleep in the baby’s room. It cries at four.' },
  ] },

  // ── Pensées, la ville telle qu'elle va ──
  { id: 'n-t-riz', adult: true, kind: 'thought', layer: 2, bands: NEON, when: { cause: 'scarcity' }, lines: [
    { fr: 'Les rayons sont vides depuis mardi. J’ai fait la queue une heure pour deux paquets de riz.', en: 'The shelves have been empty since Tuesday. I queued an hour for two packets of rice.' },
  ] },
  { id: 'n-t-chaussures', kind: 'thought', layer: 2, bands: NEON, when: { precip: 'snow' }, lines: [
    { fr: 'Le bus ne passera pas. Trois quarts d’heure à pied, et j’ai mis les mauvaises chaussures.', en: 'The bus won’t come. Forty-five minutes on foot, and I’m in the wrong shoes.' },
  ] },
  { id: 'n-t-pharmacie', kind: 'thought', layer: 2, bands: NEON, when: { night: true }, lines: [
    { fr: 'Les enseignes de la rue clignotent. Celle de la pharmacie est la seule qui marche bien.', en: 'The shop signs along the street are flickering. The pharmacy’s is the only one that works properly.' },
  ] },
  { id: 'n-t-cars-police', kind: 'thought', layer: 2, bands: NEON, when: { riot: true }, lines: [
    { fr: 'Il y a des cars de police au bout de la rue. Je fais le tour par le parc.', en: 'Police vans at the end of the street. I’ll go round through the park.' },
  ] },
  { id: 'n-t-merveille', kind: 'thought', layer: 2, bands: NEON, when: { wonder: true }, lines: [
    { fr: 'On voit la merveille depuis la fenêtre de la cuisine. Le soir, elle est allumée jusqu’en haut.', en: 'You can see the wonder from the kitchen window. At night it’s lit right to the top.' },
  ] },
  { id: 'n-t-voiture', adult: true, kind: 'thought', layer: 2, bands: NEON, when: { prosper: true }, lines: [
    { fr: 'Cette année, on pourra peut-être changer la voiture. Celle-là fait un bruit depuis l’hiver.', en: 'This year we might be able to change the car. This one’s been making a noise since winter.' },
  ] },
  { id: 'n-t-piscine', kind: 'thought', layer: 2, bands: NEON, when: { cause: 'inequality' }, lines: [
    { fr: 'Dans les tours du haut, ils ont une piscine sur le toit. Ici, l’ascenseur ne marche pas.', en: 'In the towers up there they have a pool on the roof. Here the lift doesn’t work.' },
  ] },
  { id: 'n-t-bail', adult: true, kind: 'thought', layer: 2, bands: NEON, when: { cause: 'complexity' }, lines: [
    { fr: 'Pour refaire ma carte, il faut un justificatif de domicile. Le bail est au nom de ma sœur.', en: 'To renew my card I need proof of address. The lease is in my sister’s name.' },
  ] },
  { id: 'n-t-greve', adult: true, kind: 'thought', layer: 2, bands: NEON, when: { cause: 'dissent' }, lines: [
    { fr: 'Au bureau, ils parlent tous de la grève de jeudi. Personne ne dit s’il la fera.', en: 'At the office they’re all talking about Thursday’s strike. Nobody says if they’ll join it.' },
  ] },
  { id: 'n-t-fissure', adult: true, kind: 'thought', layer: 2, bands: NEON, when: { cause: 'structural' }, lines: [
    { fr: 'Il y a une fissure au plafond de la salle de bains. Elle fait le tour de la lampe, maintenant.', en: 'There’s a crack in the bathroom ceiling. It goes all the way round the light now.' },
  ] },
  { id: 'n-t-huit-etages', adult: true, kind: 'thought', layer: 2, bands: NEON, when: { cause: 'wear' }, lines: [
    { fr: 'Encore une panne d’ascenseur. Huit étages avec les courses.', en: 'The lift’s out again. Eight floors with the shopping.' },
  ] },
  { id: 'n-t-dix-jours', adult: true, kind: 'thought', layer: 2, bands: NEON, when: { cause: 'poverty' }, lines: [
    { fr: 'Encore dix jours avant la paie. Je ne prendrai pas le métro cette semaine.', en: 'Ten days till payday. I won’t take the metro this week.' },
  ] },
  { id: 'n-t-trajet', adult: true, kind: 'thought', layer: 2, bands: NEON, when: { cause: 'demesure' }, lines: [
    { fr: 'Une heure et demie de trajet le matin, autant le soir. Je lis dans le bus, au moins.', en: 'An hour and a half each way, morning and evening. At least I read on the bus.' },
  ] },
  { id: 'n-t-trente-cinq', kind: 'thought', layer: 2, bands: NEON, when: { season: 'summer' }, lines: [
    { fr: 'Il fait trente-cinq degrés dans l’appartement. On dort fenêtres ouvertes, avec le bruit de la rue.', en: 'It’s thirty-five degrees in the flat. We sleep with the windows open and the street noise coming in.' },
  ] },
  { id: 'n-t-chauffage', kind: 'thought', layer: 2, bands: NEON, when: { season: 'winter' }, lines: [
    { fr: 'Le chauffage de l’immeuble est en panne depuis lundi. On dort habillés.', en: 'The building’s heating has been off since Monday. We sleep in our clothes.' },
  ] },
  { id: 'n-t-fournitures', adult: true, kind: 'thought', layer: 2, bands: NEON, when: { season: 'autumn', kids: true }, lines: [
    { fr: 'La rentrée. Il faut acheter les fournitures de {enfant}, la liste fait deux pages.', en: 'Back to school. I have to buy {enfant}’s supplies. The list runs to two pages.' },
  ] },
  { id: 'n-t-terrasses', adult: true, kind: 'thought', layer: 2, bands: NEON, when: { season: 'spring' }, lines: [
    { fr: 'Les terrasses rouvrent. Je dirai à {voisine} de venir prendre un café samedi.', en: 'The café terraces are opening again. I’ll ask {voisine} to come for a coffee on Saturday.' },
  ] },

  // ══ NOOSPHÈRE, STELLAIRE, DÉMIURGE ══════════════════════════════════════════
  // Peu de chose encore : ces âges attendent leur Chronique (lot 3). On y vit quand
  // même, avec les mots que le jeu leur donne déjà (le chœur, la membrane, les
  // tours-mémoire ; les voiles, l'essaim ; le vide tissé, les constantes).
  // ── Causettes, leur vie ──
  { id: 'x-c-choeur', kind: 'chat', layer: 1, bands: NOOS, lines: [
    { who: 'a', fr: 'Tu étais au chœur, cette nuit ?', en: 'Were you in the chorus last night?' },
    { who: 'b', m: 'Une heure. Après, je me suis débranché, je n’arrivais pas à dormir.', f: 'Une heure. Après, je me suis débranchée, je n’arrivais pas à dormir.', en: 'An hour. Then I unplugged. I couldn’t sleep.' },
  ] },
  { id: 'x-c-veille', kind: 'chat', layer: 1, bands: NOOS, lines: [
    { who: 'a', fr: 'Ta veille de la membrane, c’est quand ?', en: 'When’s your watch on the membrane?' },
    { who: 'b', fr: 'Demain, de six heures à midi. J’ai demandé l’après-midi, on me l’a refusé.', en: 'Tomorrow, six till noon. I asked for the afternoon and they said no.' },
  ] },
  { id: 'x-c-douze-ans', kind: 'chat', layer: 1, bands: NOOS, when: { rel: 'parentKid' }, lines: [
    { who: 'kid', fr: '{gamin} est déjà branché au chœur.', en: '{gamin} is already connected to the chorus.' },
    { who: 'parent', fr: 'Il a douze ans. Toi, tu en as neuf.', en: 'He’s twelve. You’re nine.' },
    { who: 'kid', fr: 'J’aurai douze ans dans trois ans.', en: 'I’ll be twelve in three years.' },
    { who: 'parent', fr: 'Voilà.', en: 'There you go.' },
  ] },
  { id: 'x-c-soeur-jardins', kind: 'chat', layer: 1, bands: AU_DELA, lines: [
    { who: 'a', fr: 'Tu as des nouvelles de ta sœur ?', en: 'Any news of your sister?' },
    { who: 'b', fr: 'Elle est passée au quartier des jardins. Elle a enfin de la lumière.', en: 'She’s moved to the garden district. She finally gets some light.' },
  ] },
  { id: 'x-c-navette', kind: 'chat', layer: 1, bands: ETOILES, lines: [
    { who: 'a', fr: 'La navette de ravitaillement a trois jours de retard.', en: 'The supply shuttle is three days late.' },
    { who: 'b', fr: 'On rationne le café ?', en: 'Are we rationing the coffee?' },
    { who: 'a', fr: 'Depuis hier.', en: 'Since yesterday.' },
  ] },
  { id: 'x-c-voile', kind: 'chat', layer: 1, bands: ETOILES, lines: [
    { who: 'a', fr: 'Tu as vu la nouvelle voile ?', en: 'Have you seen the new sail?' },
    { who: 'b', fr: 'Elle est plus grande que le quartier. Elle part dans un mois.', en: 'It’s bigger than the whole district. It leaves in a month.' },
  ] },
  { id: 'x-c-lettre', kind: 'chat', layer: 1, bands: ETOILES, when: { rel: 'couple' }, lines: [
    { who: 'a', fr: 'Ta sœur a écrit ?', en: 'Has your sister written?' },
    { who: 'b', fr: 'Sa lettre est partie il y a deux ans. Elle devrait arriver à l’automne.', en: 'Her letter left two years ago. It should get here in the autumn.' },
  ] },
  { id: 'x-c-geante', kind: 'chat', layer: 1, bands: ETOILES, when: { job: ['navigator', 'starSailor', 'pilot'] }, lines: [
    { who: 'b', fr: 'On part quand ?', en: 'When do we leave?' },
    { who: 'a', fr: 'Quand la géante sera passée. Dans six jours, si les calculs sont bons.', en: 'When the giant has gone by. Six days, if the calculations are right.' },
  ] },
  { id: 'x-c-chantier-vide', kind: 'chat', layer: 1, bands: DEMIURGE, lines: [
    { who: 'a', fr: 'Tu travailles où, cette semaine ?', en: 'Where are you working this week?' },
    { who: 'b', fr: 'Au chantier du vide, côté est. On pose les premières lois.', en: 'On the void site, east side. We’re laying the first laws.' },
    { who: 'a', fr: 'Tu rentreras tard ?', en: 'Will you be late home?' },
    { who: 'b', fr: 'Comme d’habitude.', en: 'As usual.' },
  ] },
  { id: 'x-c-constante', kind: 'chat', layer: 1, bands: DEMIURGE, lines: [
    { who: 'a', fr: 'Ils ont encore changé une constante cette nuit ?', en: 'Did they change a constant again last night?' },
    { who: 'b', fr: 'La lumière est plus jaune, ce matin. Ou alors, c’est moi.', en: 'The light’s yellower this morning. Or maybe it’s me.' },
  ] },
  { id: 'x-c-cristal', kind: 'chat', layer: 1, bands: DEMIURGE, when: { job: ['miner'] }, lines: [
    { who: 'b', fr: 'Le cristal du puits trois s’est fendu.', en: 'The crystal in shaft three has cracked.' },
    { who: 'a', fr: 'Personne n’y touche avant que le mage l’ait vu.', en: 'Nobody touches it until the mage has seen it.' },
  ] },

  // ── Causettes, la cité telle qu'elle va ──
  { id: 'x-c-rations', kind: 'chat', layer: 2, bands: AU_DELA, when: { cause: 'scarcity' }, lines: [
    { who: 'a', fr: 'Les jardins suspendus n’ont rien donné ce mois-ci.', en: 'The hanging gardens produced nothing this month.' },
    { who: 'b', fr: 'On mangera les rations de réserve. Elles ont un goût de carton.', en: 'We’ll eat the reserve rations. They taste of cardboard.' },
  ] },
  { id: 'x-c-lumiere-jour', kind: 'chat', layer: 2, bands: AU_DELA, when: { cause: 'inequality' }, lines: [
    { who: 'a', fr: 'Dans les tours du haut, ils ont la vraie lumière du jour.', en: 'In the upper towers they get real daylight.' },
    { who: 'b', fr: 'Ici, on a les lampes. Et encore, une sur deux.', en: 'Here we get lamps. One in two working, at that.' },
  ] },
  { id: 'x-c-changer-quartier', adult: true, kind: 'chat', layer: 2, bands: AU_DELA, when: { cause: 'complexity' }, lines: [
    { who: 'a', fr: 'Pour changer de quartier, il faut l’accord du conseil et du quartier d’arrivée.', en: 'To change districts you need the council and the new district to agree.' },
    { who: 'b', fr: 'Ça prend combien de temps ?', en: 'How long does that take?' },
    { who: 'a', fr: 'Ma cousine attend depuis l’hiver.', en: 'My cousin has been waiting since winter.' },
  ] },
  { id: 'x-c-noeud-est', kind: 'chat', layer: 2, bands: NOOS, when: { cause: 'dissent' }, lines: [
    { who: 'a', fr: 'Ceux du nœud est refusent de se synchroniser.', en: 'The east node won’t synchronise.' },
    { who: 'b', fr: 'Depuis quand ?', en: 'Since when?' },
    { who: 'a', fr: 'Depuis l’annonce des quotas.', en: 'Since the quotas were announced.' },
  ] },
  { id: 'x-c-passerelle', adult: true, kind: 'chat', layer: 2, bands: AU_DELA, when: { cause: 'structural' }, lines: [
    { who: 'a', fr: 'La passerelle du douzième grince quand on y passe à deux.', en: 'The twelfth-floor walkway creaks when two people cross it.' },
    { who: 'b', fr: 'Alors on passera un par un.', en: 'Then we’ll cross one at a time.' },
  ] },
  { id: 'x-c-lampes', kind: 'chat', layer: 2, bands: AU_DELA, when: { cause: 'wear' }, lines: [
    { who: 'a', fr: 'Les lampes du couloir s’éteignent une à une.', en: 'The corridor lights are going out one by one.' },
    { who: 'b', fr: 'J’ai écrit au conseil. Ils ont répondu qu’ils avaient noté.', en: 'I wrote to the council. They replied that they’d made a note.' },
  ] },
  { id: 'x-c-credit', adult: true, kind: 'chat', layer: 2, bands: AU_DELA, when: { cause: 'poverty' }, lines: [
    { who: 'a', fr: 'Il te reste du crédit ?', en: 'Have you any credit left?' },
    { who: 'b', fr: 'Trois jours. Je ne prendrai pas la navette cette semaine.', en: 'Three days. I won’t take the shuttle this week.' },
  ] },
  { id: 'x-c-trois-tours', kind: 'chat', layer: 2, bands: AU_DELA, when: { cause: 'demesure' }, lines: [
    { who: 'a', fr: 'La ville a encore poussé de trois tours cette nuit.', en: 'The city grew three more towers overnight.' },
    { who: 'b', fr: 'Il me faut une heure pour aller chez ma sœur, maintenant.', en: 'It takes me an hour to get to my sister’s now.' },
  ] },
  { id: 'x-c-pluie', kind: 'chat', layer: 2, bands: AU_DELA, when: { precip: 'rain' }, lines: [
    { who: 'a', fr: 'Il pleut depuis trois jours.', en: 'It’s been raining for three days.' },
    { who: 'b', fr: 'Tant mieux. Je n’aurai pas à arroser le jardin du toit.', en: 'Good. I won’t have to water the roof garden.' },
  ] },
  { id: 'x-c-essaim', kind: 'chat', layer: 2, bands: ETOILES, when: { night: true }, lines: [
    { who: 'a', fr: 'On rentre ?', en: 'Shall we go back?' },
    { who: 'b', fr: 'Attends. L’essaim passe dans dix minutes, on le verra d’ici.', en: 'Wait. The swarm comes over in ten minutes. We’ll see it from here.' },
  ] },
  { id: 'x-c-tours-memoire', kind: 'chat', layer: 2, bands: NOOS, when: { riot: true }, lines: [
    { who: 'a', fr: 'Ils se sont rassemblés devant les tours-mémoire.', en: 'They’ve gathered outside the memory towers.' },
    { who: 'b', fr: 'Rentre. Ferme la porte, et ne te branche pas ce soir.', en: 'Go home. Shut the door, and don’t connect tonight.' },
  ] },
  { id: 'x-c-merveille', kind: 'chat', layer: 2, bands: AU_DELA, when: { wonder: true }, lines: [
    { who: 'a', fr: 'Tu as vu la merveille de près ?', en: 'Have you seen the wonder up close?' },
    { who: 'b', fr: 'Ma fille y travaille de nuit. Elle dit qu’il faut des lunettes noires pour regarder le centre.', en: 'My daughter works nights there. She says you need dark glasses to look at the middle.' },
  ] },
  { id: 'x-c-silos', kind: 'chat', layer: 2, bands: AU_DELA, when: { prosper: true }, lines: [
    { who: 'a', fr: 'Les silos sont pleins jusqu’à la prochaine récolte.', en: 'The silos are full until the next harvest.' },
    { who: 'b', fr: 'Alors on pourra fêter les soixante ans de ma mère comme il faut.', en: 'Then we can do my mother’s sixtieth properly.' },
  ] },

  // ── Pensées, ce qu'il fait ──
  { id: 'x-t-algues', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, when: { doing: ['home'] }, lines: [
    { fr: 'Il reste de la soupe d’algues. Avec le pain d’hier, ça ira.', en: 'There’s seaweed soup left. With yesterday’s bread, that’ll do.' },
  ] },
  { id: 'x-t-veille-six', adult: true, kind: 'thought', layer: 1, bands: NOOS, when: { doing: ['work'] }, lines: [
    { fr: 'Ma veille commence à six heures. Je n’ai pas fini de manger.', en: 'My watch starts at six. I haven’t finished eating.' },
  ] },
  { id: 'x-t-quart', adult: true, kind: 'thought', layer: 1, bands: ETOILES, when: { group: ['carry', 'learning', 'guard'], doing: ['work'] }, lines: [
    { fr: 'Quatre heures de quart au pont d’observation. J’ai pris un livre, cette fois.', en: 'Four hours on watch on the observation deck. I brought a book this time.' },
  ] },
  { id: 'x-t-secteur', adult: true, kind: 'thought', layer: 1, bands: DEMIURGE, when: { group: ['learning', 'craft', 'office'], doing: ['work'] }, lines: [
    { fr: 'Il faut stabiliser le secteur douze avant midi. Le onze, on verra demain.', en: 'Sector twelve needs stabilising before noon. Eleven can wait till tomorrow.' },
  ] },
  { id: 'x-t-pile-lampe', kind: 'thought', layer: 1, bands: AU_DELA, when: { doing: ['errand'], kids: true }, lines: [
    { fr: 'Des graines pour le jardin du toit, du fil, et une pile pour la lampe de {enfant}.', en: 'Seeds for the roof garden, thread, and a cell for {enfant}’s lamp.' },
  ] },
  { id: 'x-t-cordes', kind: 'thought', layer: 1, bands: AU_DELA, when: { doing: ['plaza'] }, lines: [
    { fr: 'Sur la grande place, il y a un homme qui joue d’un instrument à cordes. Un vrai, en bois.', en: 'On the big square there’s a man playing a stringed instrument. A real one, made of wood.' },
  ] },
  { id: 'x-t-mere-chambre', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, when: { doing: ['pray'] }, lines: [
    { fr: 'Une prière pour ma mère. Elle ne sort plus de sa chambre depuis l’hiver.', en: 'A prayer for my mother. She hasn’t left her room since winter.' },
  ] },
  { id: 'x-t-pont-obs', kind: 'thought', layer: 1, bands: ETOILES, when: { doing: ['wander'] }, lines: [
    { fr: 'Si je monte au pont d’observation, je verrai passer la voile de ravitaillement.', en: 'If I go up to the observation deck, I’ll see the supply sail go by.' },
  ] },
  { id: 'x-t-seul-rue', adult: true, kind: 'thought', layer: 1, bands: NOOS, when: { doing: ['night'] }, lines: [
    { m: 'Tout le quartier est branché au chœur. Je suis le seul à marcher dans la rue.', f: 'Tout le quartier est branché au chœur. Je suis la seule à marcher dans la rue.', en: 'The whole district is plugged into the chorus. I’m the only one out walking.' },
  ] },
  { id: 'x-t-levres', kind: 'thought', layer: 1, bands: NOOS, when: { doing: ['school'] }, lines: [
    { fr: 'Aujourd’hui, on apprend à se brancher sans parler. {gamin} triche, il bouge les lèvres.', en: 'Today we’re learning to connect without speaking. {gamin} cheats. He moves his lips.' },
  ] },
  { id: 'x-t-orbites', kind: 'thought', layer: 1, bands: [8, 9], when: { doing: ['school'] }, lines: [
    { fr: 'Contrôle sur les orbites demain. Je confonds toujours la troisième et la quatrième.', en: 'Test on the orbits tomorrow. I always mix up the third and the fourth.' },
  ] },
  { id: 'x-t-machines-fond', kind: 'thought', layer: 1, bands: AU_DELA, when: { doing: ['river'] }, lines: [
    { fr: 'Le fleuve est clair jusqu’au fond. On voit les vieilles machines couchées dedans.', en: 'The river is clear to the bottom. You can see the old machines lying in it.' },
  ] },
  { id: 'x-t-ble-toit', kind: 'thought', layer: 1, bands: AU_DELA, when: { doing: ['field'] }, lines: [
    { fr: 'Les rangs de blé du toit est sont prêts. On coupera demain, avant la chaleur.', en: 'The wheat rows on the east roof are ready. We cut tomorrow, before the heat.' },
  ] },
  { id: 'x-t-glace', adult: true, kind: 'thought', layer: 1, bands: [8, 9], when: { doing: ['port'] }, lines: [
    { fr: 'Encore un cargo de glace à décharger. Les gants sont gelés au bout d’une heure.', en: 'Another cargo of ice to unload. The gloves freeze solid within the hour.' },
  ] },
  { id: 'x-t-passerelle-abri', kind: 'thought', layer: 1, bands: AU_DELA, when: { doing: ['shelter'] }, lines: [
    { fr: 'J’attends sous la passerelle que ça se calme. Je n’ai pas pris de manteau.', en: 'I’ll wait under the walkway till it eases off. I didn’t bring a coat.' },
  ] },
  { id: 'x-t-ascenseur-service', kind: 'thought', layer: 1, bands: AU_DELA, when: { doing: ['flee'] }, lines: [
    { fr: 'Par la passerelle du douzième, puis l’ascenseur de service.', en: 'Across the twelfth-floor walkway, then the service lift.' },
  ] },
  { id: 'x-t-outils', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, lines: [
    { fr: 'Il faut que je rende ses outils à l’atelier du bas avant la fin de la semaine.', en: 'I have to return the tools to the workshop downstairs before the end of the week.' },
  ] },
  { id: 'x-t-mere-montrer', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, lines: [
    { fr: 'Ma mère m’a demandé de passer ce soir. Elle a encore quelque chose à me montrer.', en: 'My mother asked me to come by tonight. She has something to show me again.' },
  ] },
  { id: 'x-t-arroser', kind: 'thought', layer: 1, bands: AU_DELA, lines: [
    { fr: 'Le jardin du toit a besoin d’eau. Je monterai avant de dormir.', en: 'The roof garden needs water. I’ll go up before bed.' },
  ] },
  { id: 'x-t-echelle', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, lines: [
    { fr: '{voisin} a encore emprunté mon échelle. C’est la troisième fois ce mois-ci.', en: '{voisin} has borrowed my ladder again. Third time this month.' },
  ] },
  { id: 'x-t-frere-navette', adult: true, kind: 'thought', layer: 1, bands: ETOILES, lines: [
    { fr: 'Mon frère n’a pas répondu depuis la dernière navette. D’habitude, il répond toujours.', en: 'My brother hasn’t answered since the last shuttle. He always answers, usually.' },
  ] },
  { id: 'x-t-plume', kind: 'thought', layer: 1, bands: AU_DELA, when: { child: true }, lines: [
    { fr: 'J’ai trouvé une plume d’oiseau sur le toit. Une vraie. Je la garde dans ma boîte.', en: 'I found a bird’s feather on the roof. A real one. I’m keeping it in my box.' },
  ] },
  { id: 'x-t-une-minute', kind: 'thought', layer: 1, bands: NOOS, when: { child: true }, lines: [
    { fr: 'Demain, on a le droit d’écouter le chœur pendant une minute, avec la maîtresse.', en: 'Tomorrow we’re allowed to listen to the chorus for one minute, with the teacher.' },
  ] },
  { id: 'x-t-couleur-ciel', kind: 'thought', layer: 1, bands: DEMIURGE, when: { child: true }, lines: [
    { fr: 'Le maître dit qu’avant, on ne pouvait pas changer la couleur du ciel. Je ne le crois pas.', en: 'The teacher says that once you couldn’t change the colour of the sky. I don’t believe him.' },
  ] },
  { id: 'x-t-marin', kind: 'thought', layer: 1, bands: [8, 9], when: { child: true }, lines: [
    { m: 'Quand je serai grand, je serai marin des étoiles. Dix-huit mois sans école.', f: 'Quand je serai grande, je serai marin des étoiles. Dix-huit mois sans école.', en: 'When I grow up I’ll be a star sailor. Eighteen months with no school.' },
  ] },
  { id: 'x-t-chien-toit', kind: 'thought', layer: 1, bands: AU_DELA, when: { child: true }, lines: [
    { fr: 'Le chien de {voisine} a encore creusé dans le jardin du toit. Je ne dirai rien.', en: '{voisine}’s dog has been digging in the roof garden again. I won’t say anything.' },
  ] },

  // ── Pensées, le métier ──
  { id: 'x-t-tomates', kind: 'thought', layer: 1, bands: [7, 8], when: { job: ['gardener'] }, lines: [
    { fr: 'Les plants de tomates du toit ont pris le froid. Il faudra les refaire sous la serre.', en: 'The tomato plants on the roof caught the cold. I’ll have to start them again under glass.' },
  ] },
  { id: 'x-t-noeud', kind: 'thought', layer: 1, bands: NOOS, when: { job: ['engineer'] }, lines: [
    { fr: 'Le nœud de la rue haute perd le signal toutes les nuits à trois heures. Personne ne sait pourquoi.', en: 'The node on the high street loses its signal every night at three. Nobody knows why.' },
  ] },
  { id: 'x-t-date', kind: 'thought', layer: 1, bands: NOOS, when: { job: ['scholar'] }, lines: [
    { fr: 'J’ai trouvé une erreur dans les archives de la conscience commune. Une date. Il va falloir le dire à quelqu’un.', en: 'I’ve found a mistake in the common consciousness archives. A date. I’ll have to tell someone.' },
  ] },
  { id: 'x-t-mousse', kind: 'thought', layer: 1, bands: NOOS, when: { job: ['botanist'] }, lines: [
    { fr: 'La mousse du jardin nord a changé de couleur. Je prends un échantillon avant qu’on la coupe.', en: 'The moss in the north garden has changed colour. I’ll take a sample before they cut it back.' },
  ] },
  { id: 'x-t-tour-sud', kind: 'thought', layer: 1, bands: [7, 8], when: { job: ['pilot'] }, lines: [
    { fr: 'Trois traversées aujourd’hui. Le vent de la tour sud me pousse toujours à gauche à l’atterrissage.', en: 'Three crossings today. The south tower wind always pushes me left on landing.' },
  ] },
  { id: 'x-t-etoile-baisse', kind: 'thought', layer: 1, bands: ETOILES, when: { job: ['astronomer'] }, lines: [
    { m: 'L’étoile qu’on surveille a encore baissé. Je refais la mesure ce soir, pour être sûr.', f: 'L’étoile qu’on surveille a encore baissé. Je refais la mesure ce soir, pour être sûre.', en: 'The star we’re watching has dimmed again. I’ll take the measurement again tonight, to be sure.' },
  ] },
  { id: 'x-t-a-la-main', kind: 'thought', layer: 1, bands: NOOS, when: { job: ['courier'] }, lines: [
    { fr: 'Six messages à porter à la main, parce qu’ils ne veulent pas passer par le chœur.', en: 'Six messages to carry by hand, because they won’t send them through the chorus.' },
  ] },
  { id: 'x-t-vingt-kilos', kind: 'thought', layer: 1, bands: ETOILES, when: { job: ['courier'] }, lines: [
    { fr: 'Quarante colis pour le quartier des voiles, et l’ascenseur orbital qui ne prend que vingt kilos.', en: 'Forty parcels for the sail district, and the orbital lift only takes twenty kilos.' },
  ] },
  { id: 'x-t-maison-orbe', kind: 'thought', layer: 1, bands: ETOILES, when: { job: ['noble'] }, lines: [
    { fr: 'Le dîner de la Maison Orbe, ce soir. Il faudra encore écouter le vieux raconter son voyage.', en: 'Dinner at House Orbe tonight. I’ll have to hear the old man tell his voyage again.' },
  ] },
  { id: 'x-t-trois-livres', kind: 'thought', layer: 1, bands: ETOILES, when: { job: ['starSailor'] }, lines: [
    { fr: 'Dix-huit mois jusqu’au prochain port. J’ai pris trois livres. Ce ne sera pas assez.', en: 'Eighteen months to the next port. I’ve brought three books. It won’t be enough.' },
  ] },
  { id: 'x-t-chanson-terre', kind: 'thought', layer: 1, bands: ETOILES, when: { job: ['singer'] }, lines: [
    { fr: 'Ce soir, je chante au pont d’observation. Ils veulent encore la vieille chanson de la Terre.', en: 'Tonight I sing on the observation deck. They want the old Earth song again.' },
  ] },
  { id: 'x-t-decimale', kind: 'thought', layer: 1, bands: ETOILES, when: { job: ['navigator'] }, lines: [
    { fr: 'Il faut recalculer la trajectoire avant de passer derrière la géante. Le dernier calcul était faux à la sixième décimale.', en: 'The course needs recalculating before we pass behind the giant. The last one was wrong at the sixth decimal.' },
  ] },
  { id: 'x-t-pesanteur', kind: 'thought', layer: 1, bands: DEMIURGE, when: { job: ['mage'] }, lines: [
    { fr: 'Le conseil veut qu’on retouche la pesanteur du quartier haut. Les vieux se plaignent des escaliers.', en: 'The council wants the gravity adjusted in the upper quarter. The old folk complain about the stairs.' },
  ] },
  { id: 'x-t-statue', kind: 'thought', layer: 1, bands: DEMIURGE, when: { job: ['sculptor'] }, lines: [
    { fr: 'La statue de la place a encore bougé d’un doigt pendant la nuit. Il faudra la refixer.', en: 'The statue on the square has shifted a finger’s width overnight again. It’ll need fixing back.' },
  ] },
  { id: 'x-t-mille-ans', kind: 'thought', layer: 1, bands: DEMIURGE, when: { job: ['monk'] }, lines: [
    { fr: 'Mille ans de prières recopiées dans le cristal. Aujourd’hui, j’en relis dix.', en: 'A thousand years of prayers copied into the crystal. Today I reread ten.' },
  ] },
  { id: 'x-t-veine', kind: 'thought', layer: 1, bands: DEMIURGE, when: { job: ['miner'] }, lines: [
    { fr: 'La veine du puits trois vibre quand on la touche. Le chef d’équipe dit de ne pas y faire attention.', en: 'The seam in shaft three vibrates when you touch it. The foreman says to pay it no mind.' },
  ] },
  { id: 'x-t-trois-mariages', kind: 'thought', layer: 1, bands: DEMIURGE, when: { job: ['priest'] }, lines: [
    { fr: 'Trois mariages demain, et un seul autel. Il faudra se lever tôt.', en: 'Three weddings tomorrow and only one altar. An early start.' },
  ] },
  { id: 'x-t-pan-vide', kind: 'thought', layer: 1, bands: DEMIURGE, when: { job: ['weaver'] }, lines: [
    { m: 'Il me reste un pan de vide à tisser pour la commande du conseil. Le fil casse quand je suis fatigué.', f: 'Il me reste un pan de vide à tisser pour la commande du conseil. Le fil casse quand je suis fatiguée.', en: 'I’ve one more length of void to weave for the council’s order. The thread breaks when I’m tired.' },
  ] },
  { id: 'x-t-cheville', kind: 'thought', layer: 1, bands: DEMIURGE, when: { job: ['dancer'] }, lines: [
    { fr: 'Répétition à huit heures. J’ai encore mal à la cheville depuis mardi.', en: 'Rehearsal at eight. My ankle still hurts from Tuesday.' },
  ] },
  { id: 'x-t-yeux', kind: 'thought', layer: 1, bands: NOOS, when: { job: ['teacher'] }, lines: [
    { fr: 'Trente élèves, et la moitié sont branchés au chœur pendant le cours. Je le vois à leurs yeux.', en: 'Thirty pupils, and half are plugged into the chorus during class. I can see it in their eyes.' },
  ] },
  { id: 'x-t-cristaux-illisibles', kind: 'thought', layer: 1, bands: [8, 9], when: { job: ['archivist'] }, lines: [
    { fr: 'Les archives du premier port sont sur des cristaux qu’on ne sait plus lire. On cherche quelqu’un qui sait.', en: 'The first port’s archives are on crystals nobody can read anymore. We’re looking for someone who can.' },
  ] },
  { id: 'x-t-anneau', kind: 'thought', layer: 1, bands: AU_DELA, when: { job: ['builder'] }, lines: [
    { fr: 'On monte le douzième anneau de la tour demain, si le vent tombe.', en: 'We raise the tower’s twelfth ring tomorrow, if the wind drops.' },
  ] },
  { id: 'x-t-trois-mille', kind: 'thought', layer: 1, bands: NOOS, when: { job: ['official'] }, lines: [
    { fr: 'Il faut recompter les habitants du quartier. Le chœur dit trois mille, le registre deux mille huit cents.', en: 'The district’s inhabitants need recounting. The chorus says three thousand, the register two thousand eight hundred.' },
  ] },
  { id: 'x-t-graines-prix', kind: 'thought', layer: 1, bands: [8, 9], when: { job: ['merchant'] }, lines: [
    { fr: 'Le prix des graines a doublé depuis la dernière navette. Les gens vont râler, et acheter quand même.', en: 'Seed prices have doubled since the last shuttle. People will grumble and buy anyway.' },
  ] },
  { id: 'x-t-chien-navette', kind: 'thought', layer: 1, bands: AU_DELA, when: { job: ['journalist'] }, lines: [
    { fr: 'Il me faut un sujet pour ce soir. Le chien qui a pris la navette tout seul, peut-être.', en: 'I need a story for tonight. The dog that took the shuttle on its own, maybe.' },
  ] },
  { id: 'x-t-ancienne-terre', kind: 'thought', layer: 1, bands: [8, 9], when: { job: ['professor'] }, lines: [
    { fr: 'Mon cours sur l’ancienne Terre commence dans dix minutes. Trois étudiants, dont un qui dort.', en: 'My lecture on old Earth starts in ten minutes. Three students, one of them asleep.' },
  ] },
  { id: 'x-t-recycleur', kind: 'thought', layer: 1, bands: [8, 9], when: { job: ['fountaineer'] }, lines: [
    { fr: 'Le recycleur d’eau du quartier fait des bulles. Il faudra le démonter avant ce soir.', en: 'The district water recycler is bubbling. It’ll have to come apart before tonight.' },
  ] },
  { id: 'x-t-conduites', kind: 'thought', layer: 1, bands: AU_DELA, when: { job: ['sewerman'] }, lines: [
    { fr: 'Les conduites de recyclage sont encore bouchées sous le marché. On descend à quatre.', en: 'The recycling pipes under the market are blocked again. Four of us are going down.' },
  ] },
  { id: 'x-t-porte-tour', kind: 'thought', layer: 1, bands: AU_DELA, when: { job: ['watchman'] }, lines: [
    { fr: 'Toute la nuit à la porte de la tour. Personne ne passe, mais il faut que quelqu’un soit là.', en: 'All night at the tower door. Nobody comes through, but someone has to be there.' },
  ] },
  { id: 'x-t-semences-saison', kind: 'thought', layer: 1, bands: AU_DELA, when: { job: ['storekeeper'] }, lines: [
    { fr: 'Il faut ranger les semences par saison avant l’inspection. Quelqu’un a tout mélangé.', en: 'The seed stock has to be sorted by season before the inspection. Someone has mixed it all up.' },
  ] },
  { id: 'x-t-lampes-cristal', kind: 'thought', layer: 1, bands: [8, 9], when: { job: ['artisan'] }, lines: [
    { fr: 'La commande du conseil : douze lampes de cristal. J’en ai fini quatre, et la cinquième est fêlée.', en: 'The council’s order: twelve crystal lamps. I’ve finished four, and the fifth is cracked.' },
  ] },
  { id: 'x-t-salades', kind: 'thought', layer: 1, bands: AU_DELA, when: { job: ['marketGardener'] }, lines: [
    { fr: 'Les salades du toit sont belles. Je les vends au marché du bas avant qu’il fasse chaud.', en: 'The roof lettuces look good. I’ll sell them at the lower market before it gets hot.' },
  ] },
  { id: 'x-t-miroirs', kind: 'thought', layer: 1, bands: [8, 9], when: { job: ['agronomist'] }, lines: [
    { fr: 'Le champ du troisième anneau n’a pas assez de lumière. Il faudra régler les miroirs.', en: 'The field on the third ring isn’t getting enough light. The mirrors will need adjusting.' },
  ] },
  { id: 'x-t-farine-verte', kind: 'thought', layer: 1, bands: AU_DELA, when: { job: ['miller'] }, lines: [
    { fr: 'Le moulin à algues tourne trop vite. La farine sort verte.', en: 'The seaweed mill is running too fast. The flour is coming out green.' },
  ] },
  { id: 'x-t-quotas-eau', kind: 'thought', layer: 1, bands: AU_DELA, when: { job: ['stateClerk'] }, lines: [
    { fr: 'Le conseil veut une note sur les quotas d’eau. Une page, avec des chiffres ronds.', en: 'The council wants a memo on water quotas. One page, round numbers.' },
  ] },
  { id: 'x-t-lumiere-mur', kind: 'thought', layer: 1, bands: AU_DELA, when: { job: ['courtClerk'] }, lines: [
    { fr: 'Audience à quatorze heures. Deux voisins se disputent la lumière d’un mur.', en: 'Hearing at two. Two neighbours fighting over the light on a wall.' },
  ] },

  // ── Pensées, sa famille, son âge ──
  { id: 'x-t-deuxieme-jardin', kind: 'thought', layer: 1, bands: AU_DELA, when: { family: 'married' }, lines: [
    { fr: '{conjoint} veut qu’on prenne un deuxième jardin sur le toit. On n’arrive déjà pas à entretenir le premier.', en: '{conjoint} wants us to take a second roof garden. We can’t keep up with the first one as it is.' },
  ] },
  { id: 'x-t-avant-age', kind: 'thought', layer: 1, bands: NOOS, when: { kids: true }, lines: [
    { fr: '{enfant} veut se brancher au chœur avant l’âge. Je lui ai dit d’attendre ses douze ans, comme tout le monde.', en: '{enfant} wants to join the chorus early. I said to wait till twelve, like everyone else.' },
  ] },
  { id: 'x-t-voir-terre', kind: 'thought', layer: 1, bands: [8, 9], when: { kids: true }, lines: [
    { fr: '{enfant} a encore demandé à voir la Terre. Je ne sais pas quoi lui montrer.', en: '{enfant} asked to see Earth again. I don’t know what to show them.' },
  ] },
  { id: 'x-t-meme-heure', kind: 'thought', layer: 1, bands: AU_DELA, when: { family: 'single' }, lines: [
    { fr: 'Il y a quelqu’un au jardin du toit qui arrose à la même heure que moi. Demain, je lui parle.', en: 'There’s someone in the roof garden who waters at the same time as me. Tomorrow I’ll say something.' },
  ] },
  { id: 'x-t-bouche', kind: 'thought', layer: 1, bands: NOOS, when: { old: true }, lines: [
    { fr: 'Quand j’étais jeune, on se parlait avec la bouche. Mes petits-enfants rient quand je le dis.', en: 'When I was young we talked with our mouths. My grandchildren laugh when I say so.' },
  ] },
  { id: 'x-t-lune-fenetre', kind: 'thought', layer: 1, bands: [8, 9], when: { old: true }, lines: [
    { fr: 'Quand j’étais jeune, on voyait encore la lune depuis la fenêtre de ma mère.', en: 'When I was young you could still see the moon from my mother’s window.' },
  ] },
  { id: 'x-t-piece-jardin', kind: 'thought', layer: 1, bands: AU_DELA, when: { family: 'lodger' }, lines: [
    { fr: 'Je dors dans la pièce du jardin chez {hote}. Il faudra que j’arrose pour payer ma place.', en: 'I sleep in the garden room at {hote}’s. I’ll have to do the watering to earn my keep.' },
  ] },
  { id: 'x-t-ecrans', kind: 'thought', layer: 1, bands: AU_DELA, when: { family: 'nephew' }, lines: [
    { fr: 'Chez {hote}, il y a un écran dans chaque pièce. Chez moi, il n’y en avait qu’un.', en: 'At {hote}’s there’s a screen in every room. At home there was only one.' },
  ] },

  // ── Pensées, son caractère ──
  { id: 'x-t-grumpy', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, when: { trait: 'grumpy' }, lines: [
    { fr: '{voisin} a encore réglé sa lumière trop fort. Toute la rue est blanche jusqu’à minuit.', en: '{voisin} has turned his light up too high again. The whole street is white till midnight.' },
  ] },
  { id: 'x-t-curious', adult: true, kind: 'thought', layer: 1, bands: NOOS, when: { trait: 'curious' }, lines: [
    { fr: 'Pourquoi la tour-mémoire du coin est éteinte depuis trois jours ? Personne n’en parle au chœur.', en: 'Why has the memory tower on the corner been dark for three days? Nobody mentions it in the chorus.' },
  ] },
  { id: 'x-t-dreamy', adult: true, kind: 'thought', layer: 1, bands: ETOILES, when: { trait: 'dreamy' }, lines: [
    { fr: 'Si je prenais la prochaine voile, je verrais l’autre bras de la galaxie avant mes cinquante ans.', en: 'If I took the next sail, I’d see the other arm of the galaxy before I turn fifty.' },
  ] },
  { id: 'x-t-cheerful', kind: 'thought', layer: 1, bands: AU_DELA, when: { trait: 'cheerful' }, lines: [
    { fr: 'Il fait doux. Je mangerai sur le toit, au milieu des tomates.', en: 'It’s mild out. I’ll eat up on the roof, among the tomatoes.' },
  ] },
  { id: 'x-t-chilly', kind: 'thought', layer: 1, bands: [8, 9], when: { trait: 'chilly' }, lines: [
    { fr: 'Ils ont encore baissé la température du quartier pour économiser. J’ai mis deux pulls.', en: 'They’ve turned the district temperature down again to save energy. I’m wearing two jumpers.' },
  ] },
  { id: 'x-t-thrifty', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, when: { trait: 'thrifty' }, lines: [
    { fr: 'Les graines sont moins chères au marché du bas. Je ferai le détour.', en: 'Seeds are cheaper at the lower market. I’ll go the long way round.' },
  ] },
  { id: 'x-t-superstitious', adult: true, kind: 'thought', layer: 1, bands: NOOS, when: { trait: 'superstitious' }, lines: [
    { fr: 'Je ne me branche jamais au chœur un jour de pluie. Ma grand-mère disait que ça mélange les pensées.', en: 'I never connect to the chorus on a rainy day. My grandmother said it muddles your thoughts.' },
  ] },
  { id: 'x-t-pious', adult: true, kind: 'thought', layer: 1, bands: ETOILES, when: { trait: 'pious' }, lines: [
    { fr: 'Je dirai une prière pour mon frère, sur la navette du sud. Il arrive dans quatre mois.', en: 'I’ll say a prayer for my brother on the southern shuttle. He arrives in four months.' },
  ] },
  { id: 'x-t-hardworking', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, when: { trait: 'hardworking' }, lines: [
    { fr: 'Si je finis le rapport ce soir, je prendrai aussi la garde de demain matin.', en: 'If I finish the report tonight, I’ll take tomorrow morning’s shift as well.' },
  ] },
  { id: 'x-t-chatty', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, when: { trait: 'chatty' }, lines: [
    { fr: 'Il faut que je raconte à {voisine} ce que j’ai vu au jardin du toit. Elle ne va pas me croire.', en: 'I have to tell {voisine} what I saw in the roof garden. She won’t believe me.' },
  ] },
  { id: 'x-t-spiteful', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, when: { trait: 'spiteful' }, lines: [
    { fr: '{voisin} m’a coupé la lumière du jardin pendant deux jours. Je n’ai pas oublié.', en: '{voisin} cut off my garden light for two days. I haven’t forgotten.' },
  ] },
  { id: 'x-t-proud', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, when: { trait: 'proud' }, lines: [
    { fr: 'Mon jardin de toit a donné plus que tous ceux de la rue. Même {voisine} l’a dit.', en: 'My roof garden yielded more than any on the street. Even {voisine} said so.' },
  ] },
  { id: 'x-t-absent', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, when: { trait: 'absent' }, lines: [
    { m: 'Je suis sorti sans mon badge. Il faudra que {voisin} m’ouvre.', f: 'Je suis sortie sans mon badge. Il faudra que {voisin} m’ouvre.', en: 'I came out without my pass. {voisin} will have to let me in.' },
  ] },
  { id: 'x-t-early', kind: 'thought', layer: 1, bands: AU_DELA, when: { trait: 'early' }, lines: [
    { fr: 'Personne dans la rue. La lumière du matin monte à six heures, je serai au jardin avant.', en: 'Nobody in the street. The morning light comes up at six. I’ll be in the garden before then.' },
  ] },
  { id: 'x-t-greedy', kind: 'thought', layer: 1, bands: ETOILES, when: { trait: 'greedy' }, lines: [
    { fr: 'Il y a des fruits frais à la navette de ce matin. Des vrais. Je vais faire la queue.', en: 'There’s fresh fruit on this morning’s shuttle. Real fruit. I’m going to queue.' },
  ] },
  { id: 'x-t-stubborn', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, when: { trait: 'stubborn' }, lines: [
    { fr: 'Ils veulent que je change de secteur. Je garde le mien.', en: 'They want me to change sectors. I’m keeping mine.' },
  ] },
  { id: 'x-t-generous', adult: true, kind: 'thought', layer: 1, bands: AU_DELA, when: { trait: 'generous' }, lines: [
    { fr: 'J’ai fait trop de soupe. J’en porterai à {voisine}, elle vit seule depuis l’hiver.', en: 'I made too much soup. I’ll take some to {voisine}. She’s lived alone since the winter.' },
  ] },
  { id: 'x-t-quiet', adult: true, kind: 'thought', layer: 1, bands: NOOS, when: { trait: 'quiet' }, lines: [
    { fr: 'Au chœur, tout le monde parle en même temps. Je me débranche et je regarde par la fenêtre.', en: 'In the chorus everyone talks at once. I unplug and look out of the window.' },
  ] },
  { id: 'x-t-brave', kind: 'thought', layer: 1, bands: AU_DELA, when: { notJob: ['watchman'], trait: 'brave', riot: true }, lines: [
    { fr: 'Ils sont trop nombreux devant les tours. Il faut que quelqu’un prévienne les veilleurs.', en: 'There are too many of them outside the towers. Someone has to alert the watch.' },
  ] },
  { id: 'x-t-cautious', kind: 'thought', layer: 1, bands: AU_DELA, when: { trait: 'cautious', riot: true }, lines: [
    { fr: 'Rentrer, fermer, attendre. Et ne pas se brancher ce soir.', en: 'Go home, lock up, wait. And don’t connect tonight.' },
  ] },

  // ── Pensées, la cité telle qu'elle va ──
  { id: 'x-t-quatre-rations', adult: true, kind: 'thought', layer: 2, bands: AU_DELA, when: { cause: 'scarcity' }, lines: [
    { fr: 'Il reste quatre rations de réserve à la maison. Je les compte tous les soirs.', en: 'There are four reserve rations left at home. I count them every evening.' },
  ] },
  { id: 'x-t-jardins-haut', kind: 'thought', layer: 2, bands: AU_DELA, when: { cause: 'inequality' }, lines: [
    { fr: 'Ceux des étages du haut ont des jardins qui donnent toute l’année. Le nôtre gèle en hiver.', en: 'The people on the upper floors have gardens that crop all year round. Ours freezes in winter.' },
  ] },
  { id: 'x-t-trois-autorisations', adult: true, kind: 'thought', layer: 2, bands: AU_DELA, when: { cause: 'complexity' }, lines: [
    { fr: 'Il faut trois autorisations pour planter un arbre sur le toit. J’en ai deux.', en: 'You need three permits to plant a tree on the roof. I’ve got two.' },
  ] },
  { id: 'x-t-messages-murs', kind: 'thought', layer: 2, bands: AU_DELA, when: { cause: 'dissent' }, lines: [
    { fr: 'Il y a des messages sur les murs, ce matin. Ils disent que le conseil ment sur les réserves.', en: 'There are messages on the walls this morning. They say the council is lying about the reserves.' },
  ] },
  { id: 'x-t-paroi', adult: true, kind: 'thought', layer: 2, bands: AU_DELA, when: { cause: 'structural' }, lines: [
    { fr: 'Il y a une fissure dans la paroi de la tour, au niveau de la cuisine. Ils disent que c’est normal.', en: 'There’s a crack in the tower wall, level with the kitchen. They say it’s normal.' },
  ] },
  { id: 'x-t-lampes-couloir', adult: true, kind: 'thought', layer: 2, bands: AU_DELA, when: { cause: 'wear' }, lines: [
    { fr: 'Encore une lampe du couloir éteinte. On rentre à tâtons, maintenant.', en: 'Another corridor light gone. We feel our way home now.' },
  ] },
  { id: 'x-t-tour-jardin', adult: true, kind: 'thought', layer: 2, bands: AU_DELA, when: { cause: 'poverty' }, lines: [
    { fr: 'Je vendrai mon tour de jardin à {voisin}. Ça fera deux semaines de rations.', en: 'I’ll sell my turn in the garden to {voisin}. That’ll be two weeks of rations.' },
  ] },
  { id: 'x-t-couloirs', kind: 'thought', layer: 2, bands: AU_DELA, when: { cause: 'demesure' }, lines: [
    { m: 'Je me suis encore perdu dans les nouveaux couloirs. Ils changent les plans chaque mois.', f: 'Je me suis encore perdue dans les nouveaux couloirs. Ils changent les plans chaque mois.', en: 'I got lost in the new corridors again. They change the plans every month.' },
  ] },
  { id: 'x-t-rue-a-moi', kind: 'thought', layer: 2, bands: AU_DELA, when: { precip: 'rain' }, lines: [
    { fr: 'Il pleut. Tout le monde reste chez soi, j’ai la rue pour moi.', en: 'It’s raining. Everyone’s staying in. I’ve got the street to myself.' },
  ] },
  { id: 'x-t-etoiles-rues', kind: 'thought', layer: 2, bands: NOOS, when: { night: true }, lines: [
    { fr: 'La nuit, ils baissent la lumière des rues de moitié. On voit enfin les étoiles.', en: 'At night they turn the street lights down by half. You can finally see the stars.' },
  ] },
  { id: 'x-t-cris-tours', kind: 'thought', layer: 2, bands: NOOS, when: { riot: true }, lines: [
    { fr: 'Ils crient devant les tours-mémoire. Je ne sais pas encore de quoi il s’agit.', en: 'They’re shouting outside the memory towers. I don’t know yet what it’s about.' },
  ] },
  { id: 'x-t-ascenseur-orbital', kind: 'thought', layer: 2, bands: [8, 9], when: { riot: true }, lines: [
    { fr: 'Ils bloquent l’ascenseur orbital. Personne ne monte, personne ne descend.', en: 'They’re blocking the orbital lift. Nobody goes up, nobody comes down.' },
  ] },
  { id: 'x-t-merveille', kind: 'thought', layer: 2, bands: AU_DELA, when: { wonder: true }, lines: [
    { fr: 'On voit la merveille depuis toutes les fenêtres de la tour. La nuit, elle éclaire ma chambre.', en: 'You can see the wonder from every window in the tower. At night it lights up my room.' },
  ] },
  { id: 'x-t-agrandir', kind: 'thought', layer: 2, bands: AU_DELA, when: { prosper: true }, lines: [
    { fr: 'Les silos sont pleins jusqu’à la prochaine récolte. Je vais enfin agrandir le jardin.', en: 'The silos are full till the next harvest. I can finally make the garden bigger.' },
  ] },
  { id: 'x-t-deux-fois', kind: 'thought', layer: 2, bands: NOOS, when: { season: 'summer' }, lines: [
    { fr: 'Il fait chaud. Les jardins du toit ont soif, je monterai deux fois aujourd’hui.', en: 'It’s hot. The roof gardens need water. I’ll go up twice today.' },
  ] },
  { id: 'x-t-hiver-lundi', kind: 'thought', layer: 2, bands: DEMIURGE, when: { season: 'winter' }, lines: [
    { fr: 'Ils ont annoncé l’hiver pour lundi. Il faut rentrer les plants du toit avant.', en: 'They’ve announced winter for Monday. The roof plants have to come in before then.' },
  ] },
  { id: 'x-t-ete-promis', kind: 'thought', layer: 2, bands: DEMIURGE, when: { season: 'spring' }, lines: [
    { fr: 'Le conseil a promis l’été pour la semaine prochaine. Les enfants comptent les jours.', en: 'The council has promised summer for next week. The children are counting the days.' },
  ] },
];

// La troisième couche, ce qu'on dit de toi (lot 2), vit dans parolesToi.js.
export const PAROLES = [...PAROLES_VIE, ...PAROLES_TOI];
