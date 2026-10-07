"use strict";

// LES SIGNES — ce qu'un passant pense du signe qu'on lui fait, et ce qu'il FAIT
// (docs/PLAN-ECOUTER-PARLER.md, lots 4 et 4 bis).
//
// Données pures, sur le modèle de paroles.js et tenues par la même plume (sa charte est
// en tête de paroles.js). Une entrée est une PENSÉE, celle du passant qui vient de le
// recevoir, et le GESTE qu'elle annonce :
//   sign   'wind' (le souffle de vent), 'light' (la lumière plus forte sur lui), 'fire'
//          (le feu le plus proche qui monte), 'beast' (une bête qui s'arrête et le fixe),
//          ou une liste de ces signes ; absent : n'importe lequel.
//   stage  la fois : 1 la surprise, 2 une explication, 3 « Ça suffit. » (§ 5.3). Après la
//          troisième, il ne se prête plus au jeu (paroles/signs.js).
//   act    ce qu'il fait, et que la pensée dit (Raph, 2026-10-07 : « les comportements du
//          pnj ne changent pas, il marche tranquillement ») :
//            look    il s'arrête et regarde (devant la bête, il suit son regard)
//            back    il recule d'un pas, sans quitter des yeux ce qu'il a vu
//            flee    il part en courant, chez lui ou loin du signe
//            kneel   il s'agenouille, tourné vers toi
//            pray    il va au lieu de culte le plus proche, d'un pas pressé
//            wave    il te fait signe de la main
//            search  il reste planté là et cherche des yeux, d'un côté puis de l'autre
//            home    il rentre chez lui et s'y enferme
//            parent  l'enfant court vers son père ou sa mère, s'ils sont dans la rue
//            go      il repart en pressant le pas
//          Absent : 'look' les deux premières fois, 'home' à la troisième.
//   bands  son monde, comme partout (cinq âges au plus) ; la lecture change avec lui : au
//          Feu un esprit, au Bourg un présage, au Marbre un dieu, à la Fonte un courant
//          d'air, au Néon une panne, à la Noosphère le chœur, au Stellaire la machinerie
//          de la sphère, au Démiurge toi.
//   when   les conditions de paroles.js (trait, child, night, article…), et `beast` : les
//          bêtes qui conviennent ('dog', 'cat', 'goat', 'sheep', 'cow').
// Le caractère fait la lecture : ce qui est écrit pour SON caractère (ou pour un enfant)
// passe d'abord ; le taciturne regarde et ne dit rien, il n'a que ses mots à lui (pick.js).
// Qui fait quoi : le pieux regarde, puis s'agenouille sous la lumière ou va prier, et y
// retourne à la troisième fois ; le superstitieux et le prudent reculent, puis fuient ; le
// curieux reste à chercher ; le joyeux et l'enfant font signe, l'enfant court ensuite vers
// ses parents ; le râleur repart en pressant le pas ; les autres regardent, s'expliquent
// la chose, puis rentrent chez eux.
// Les prénoms : ceux de paroles.js, plus {bete} / {Bete} (« ce chien », « cette chèvre »,
// la bête qui le fixe ; jamais d'accord qui la suive) et {maitre} (le maître du chien
// qu'on promène). Ni tiret, ni « ! », ni points de suspension ; l'apostrophe typographique.

// Les mêmes mondes que paroles.js.
const FEU = [0, 1];
const BOURG = [2, 3];
const MARBRE = [4, 4];
const FONTE = [5, 5];
const NEON = [6, 6];
const NOOS = [7, 7];
const ETOILES = [8, 8];
const DEMIURGE = [9, 9];

const HERD = ['goat', 'sheep', 'cow'];
// Ce qui fait peur pour de bon : le feu qui monte, la bête qui vous fixe.
const FEAR = ['fire', 'beast'];
// Tout sauf la lumière (sous la lumière, le pieux s'agenouille).
const NOT_LIGHT = ['wind', 'fire', 'beast'];

export const SIGN_ACTS = ['look', 'back', 'flee', 'kneel', 'pray', 'wave', 'search', 'home', 'parent', 'go'];

const SIGNES = [
  // ══ FEU ET BOIS : un esprit ═══════════════════════════════════════════════════
  // ── 1. La surprise ──
  { id: 's-f1-vent', sign: 'wind', stage: 1, bands: FEU, lines: [{ who: 'a', fr: 'Un coup de vent, sur moi seul. Les herbes à côté n’ont pas bougé.', en: 'A gust of wind, on me alone. The grass beside me didn’t move.' }] },
  { id: 's-f1-vent-dos', sign: 'wind', stage: 1, bands: FEU, lines: [{ who: 'a', fr: 'Le vent m’a pris dans le dos, et plus rien. Il n’y a pas de vent aujourd’hui.', en: 'The wind caught me from behind, then nothing. There’s no wind today.' }] },
  { id: 's-f1-soleil', sign: 'light', stage: 1, bands: FEU, when: { night: false }, lines: [{ who: 'a', fr: 'Le soleil m’est tombé dessus par un trou dans les nuages, et seulement sur moi.', en: 'The sun fell on me through a gap in the clouds, and only on me.' }] },
  { id: 's-f1-lune', sign: 'light', stage: 1, bands: FEU, when: { night: true }, lines: [{ who: 'a', m: 'La lune s’est montrée et m’a éclairé, moi, pas le chemin.', f: 'La lune s’est montrée et m’a éclairée, moi, pas le chemin.', en: 'The moon came out and lit me up. Me, not the path.' }] },
  { id: 's-f1-feu', sign: 'fire', stage: 1, bands: FEU, lines: [{ who: 'a', fr: 'Le feu a monté d’un coup. Personne n’y a remis de bois.', en: 'The fire shot up all at once. Nobody put more wood on.' }] },
  { id: 's-f1-feu-etincelles', act: 'back', sign: 'fire', stage: 1, bands: FEU, lines: [{ who: 'a', fr: 'Le feu a craché des étincelles jusqu’à hauteur d’homme. J’ai reculé d’un pas.', en: 'The fire spat sparks up as high as a man. I stepped back.' }] },
  { id: 's-f1-bete', sign: 'beast', stage: 1, bands: FEU, lines: [{ who: 'a', fr: '{Bete} me regarde. Pas les autres, moi.', en: '{Bete} is looking at me. Not at the others. At me.' }] },
  { id: 's-f1-bete-derriere', sign: 'beast', stage: 1, bands: FEU, lines: [{ who: 'a', m: '{Bete} ne bouge plus et me fixe. Je me suis retourné, il n’y avait personne.', f: '{Bete} ne bouge plus et me fixe. Je me suis retournée, il n’y avait personne.', en: '{Bete} has gone still and is staring at me. I turned round. There was nobody there.' }] },
  { id: 's-f1-bete-chien', sign: 'beast', stage: 1, bands: FEU, lines: [{ who: 'a', fr: 'Le chien de {maitre} s’est couché et me regarde sans bouger.', en: '{maitre}’s dog has lain down and is watching me without moving.' }] },
  { id: 's-f1-quoi', stage: 1, bands: FEU, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Je n’ai rien vu venir.', en: 'What was that? I didn’t see it coming.' }] },
  { id: 's-f1-superstitious', act: 'back', stage: 1, bands: FEU, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'J’ai serré la dent d’ours de mon père, et j’ai reculé. Ça ne me dit rien de bon.', en: 'I gripped my father’s bear tooth and stepped back. I don’t like the feel of this.' }] },
  { id: 's-f1-superstitious-fuir', act: 'flee', sign: FEAR, stage: 1, bands: FEU, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Ça, c’est un esprit, et il est en colère. Je cours à l’abri.', en: 'That’s a spirit, and it’s angry. I’m running for the shelter.' }] },
  { id: 's-f1-cautious', act: 'back', stage: 1, bands: FEU, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Je recule de trois pas, et je regarde.', en: 'I back off three steps, and I watch.' }] },
  { id: 's-f1-pious', stage: 1, bands: FEU, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Grand-mère ? C’est toi ?', en: 'Grandmother? Is that you?' }] },
  { id: 's-f1-curious', act: 'search', stage: 1, bands: FEU, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ?', en: 'Again?' }] },
  { id: 's-f1-cheerful', act: 'wave', stage: 1, bands: FEU, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Qui que tu sois, bonjour. Je lève la main, comme pour quelqu’un de l’autre rive.', en: 'Whoever you are, hello. I raise my hand, like for someone on the far bank.' }] },
  { id: 's-f1-grumpy', act: 'go', adult: true, stage: 1, bands: FEU, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Et maintenant ça. J’ai encore trois peaux à gratter, moi.', en: 'And now this. I’ve still got three hides to scrape.' }] },
  { id: 's-f1-enfant', stage: 1, bands: FEU, when: { child: true }, lines: [{ who: 'a', fr: 'Je l’ai vu. Les autres ne vont pas me croire.', en: 'I saw it. The others won’t believe me.' }] },
  { id: 's-f1-enfant-signe', act: 'wave', stage: 1, bands: FEU, when: { child: true }, lines: [{ who: 'a', fr: 'Je fais signe en l’air, des deux mains. Peut-être qu’on me répond.', en: 'I wave up at the sky with both hands. Maybe someone will answer.' }] },
  { id: 's-f1-enfant-feu', act: 'parent', sign: 'fire', stage: 1, bands: FEU, when: { child: true }, lines: [{ who: 'a', fr: 'Le feu a sauté tout seul. Je cours le dire à maman.', en: 'The fire jumped up by itself. I’m running to tell Mum.' }] },
  // ── 2. L'explication : un esprit ──
  { id: 's-f2-vent', sign: 'wind', stage: 2, bands: FEU, lines: [{ who: 'a', fr: 'C’est un esprit qui passe. Ma mère disait qu’ils soufflent sur ceux qu’ils cherchent.', en: 'It’s a spirit going by. My mother used to say they blow on the ones they’re looking for.' }] },
  { id: 's-f2-lumiere', sign: 'light', stage: 2, bands: FEU, lines: [{ who: 'a', fr: 'Un esprit me regarde. Les anciens disent qu’ils voient d’en haut, à travers les nuages.', en: 'A spirit is watching me. The old ones say they look down from above, through the clouds.' }] },
  { id: 's-f2-lumiere-genoux', act: 'kneel', sign: 'light', stage: 2, bands: FEU, lines: [{ who: 'a', fr: 'Un esprit me regarde d’en haut. Je me mets à genoux, comme devant les anciens.', en: 'A spirit is looking down at me. I go down on my knees, as before the old ones.' }] },
  { id: 's-f2-feu', sign: 'fire', stage: 2, bands: FEU, lines: [{ who: 'a', fr: 'L’esprit du feu est réveillé. Il faudra lui donner de la graisse ce soir.', en: 'The fire spirit is awake. We’ll have to give it some fat tonight.' }] },
  { id: 's-f2-bete', sign: 'beast', stage: 2, bands: FEU, lines: [{ who: 'a', fr: 'Les bêtes voient les esprits. {Bete} en regardait un, juste à côté de moi.', en: 'Animals see spirits. {Bete} was looking at one, right beside me.' }] },
  { id: 's-f2-deux', stage: 2, bands: FEU, lines: [{ who: 'a', fr: 'Deux fois. Un esprit me tourne autour.', en: 'Twice. A spirit is circling me.' }] },
  { id: 's-f2-pious', act: 'pray', sign: NOT_LIGHT, stage: 2, bands: FEU, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Grand-mère revient. Je vais lui porter une noisette sur la pierre, tout de suite.', en: 'Grandmother’s back. I’m taking her a hazelnut to the stone, right now.' }] },
  { id: 's-f2-pious-genoux', act: 'kneel', sign: 'light', stage: 2, bands: FEU, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Grand-mère, c’est toi, je le sais. Je me mets à genoux.', en: 'Grandmother, it’s you, I know it. I’m going down on my knees.' }] },
  { id: 's-f2-superstitious', act: 'flee', stage: 2, bands: FEU, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Un esprit me suit. Je cours à l’abri, le couteau à la main.', en: 'A spirit is following me. I’m running for the shelter, knife in hand.' }] },
  { id: 's-f2-cautious', act: 'flee', stage: 2, bands: FEU, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Deux fois au même endroit. Je retourne au camp, et vite.', en: 'Twice in the same spot. I’m going back to camp, and quickly.' }] },
  { id: 's-f2-curious', act: 'search', stage: 2, bands: FEU, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Si c’est un esprit, il va recommencer. Je ne bouge pas d’ici.', en: 'If it’s a spirit, it’ll do it again. I’m not moving from here.' }] },
  { id: 's-f2-cheerful', act: 'wave', stage: 2, bands: FEU, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Encore toi. Je te fais signe, au cas où tu me verrais.', en: 'You again. I wave to you, in case you can see me.' }] },
  { id: 's-f2-grumpy', act: 'go', stage: 2, bands: FEU, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Un esprit, maintenant. Comme si les loups ne suffisaient pas.', en: 'A spirit, now. As if the wolves weren’t enough.' }] },
  { id: 's-f2-enfant', act: 'wave', stage: 2, bands: FEU, when: { child: true }, lines: [{ who: 'a', m: 'C’est un esprit. Il m’a choisi, moi. Je lui fais signe.', f: 'C’est un esprit. Il m’a choisie, moi. Je lui fais signe.', en: 'It’s a spirit. It chose me. I’m waving to it.' }] },
  { id: 's-f2-enfant-parent', act: 'parent', stage: 2, bands: FEU, when: { child: true }, lines: [{ who: 'a', fr: 'Encore. Je cours voir maman.', en: 'Again. I’m running to Mum.' }] },
  // ── 3. Ça suffit ──
  { id: 's-f3-chaman', act: 'pray', stage: 3, bands: FEU, lines: [{ who: 'a', fr: 'Ça suffit. Je vais voir le chaman.', en: 'That’s enough. I’m going to see the shaman.' }] },
  { id: 's-f3-abri', stage: 3, bands: FEU, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre sous l’abri.', en: 'That’s enough. I’m going back under the shelter.' }] },
  { id: 's-f3-grumpy', stage: 3, bands: FEU, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. Laisse-moi tranquille, je rentre.', en: 'That’s enough. Leave me alone, I’m going home.' }] },
  { id: 's-f3-pious', act: 'pray', stage: 3, bands: FEU, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit, grand-mère. Je vais repasser l’ocre sur les pierres.', en: 'That’s enough, Grandmother. I’m going to put fresh ochre on the stones.' }] },
  { id: 's-f3-curious', stage: 3, bands: FEU, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Je rentre, je reviendrai demain à la même heure.', en: 'That’s enough for today. I’m going home; I’ll come back tomorrow at the same time.' }] },
  { id: 's-f3-enfant', act: 'parent', stage: 3, bands: FEU, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai peur maintenant. Je veux maman.', en: 'That’s enough, I’m scared now. I want Mum.' }] },
  { id: 's-f3-reprendre', act: 'go', stage: 3, bands: FEU, lines: [{ who: 'a', fr: 'Ça suffit. Je retourne à ce que je faisais.', en: 'That’s enough. Back to what I was doing.' }] },

  // ══ PIERRE TAILLÉE ET COURONNE : un présage ═══════════════════════════════════
  // ── 1. La surprise ──
  { id: 's-b1-vent-linge', sign: 'wind', stage: 1, bands: BOURG, lines: [{ who: 'a', fr: 'Un coup de vent dans la rue, et sur moi seul. Le linge de {voisine} pendait sans bouger.', en: 'A gust down the street, and only on me. {voisine}’s washing hung there without moving.' }] },
  { id: 's-b1-vent-col', sign: 'wind', stage: 1, bands: BOURG, lines: [{ who: 'a', fr: 'Le vent m’a pris par le col, puis plus rien. Même la paille du chemin n’a pas bougé.', en: 'The wind took me by the collar, then nothing. Even the straw on the path didn’t stir.' }] },
  { id: 's-b1-soleil', sign: 'light', stage: 1, bands: BOURG, when: { night: false }, lines: [{ who: 'a', fr: 'Le soleil a percé juste au-dessus de moi. J’avais chaud comme à midi.', en: 'The sun broke through right above me. I was as warm as at noon.' }] },
  { id: 's-b1-lune', sign: 'light', stage: 1, bands: BOURG, when: { night: true }, lines: [{ who: 'a', fr: 'La lune s’est montrée juste au-dessus de moi. Le reste de la rue est resté noir.', en: 'The moon came out right above me. The rest of the street stayed dark.' }] },
  { id: 's-b1-feu', sign: 'fire', stage: 1, bands: BOURG, lines: [{ who: 'a', fr: 'Le feu a monté d’un coup, et il n’y avait pas un souffle.', en: 'The fire leapt up all at once, and there wasn’t a breath of wind.' }] },
  { id: 's-b1-feu-fagot', act: 'back', sign: 'fire', stage: 1, bands: BOURG, lines: [{ who: 'a', m: 'Les flammes ont doublé, sans un fagot de plus. Je me suis écarté.', f: 'Les flammes ont doublé, sans un fagot de plus. Je me suis écartée.', en: 'The flames doubled, without one more bundle of sticks. I stepped aside.' }] },
  { id: 's-b1-bete', sign: 'beast', stage: 1, bands: BOURG, lines: [{ who: 'a', fr: '{Bete} me regarde comme on regarde un étranger.', en: '{Bete} is looking at me the way you look at a stranger.' }] },
  { id: 's-b1-bete-brouter', sign: 'beast', stage: 1, bands: BOURG, when: { beast: HERD }, lines: [{ who: 'a', fr: '{Bete} a arrêté de brouter pour me regarder.', en: '{Bete} has stopped grazing to look at me.' }] },
  { id: 's-b1-bete-chien', sign: 'beast', stage: 1, bands: BOURG, lines: [{ who: 'a', fr: 'Le chien de {maitre} s’est assis au milieu de la rue, et c’est moi qu’il regarde.', en: '{maitre}’s dog has sat down in the middle of the street, and it’s me it’s looking at.' }] },
  { id: 's-b1-quoi', stage: 1, bands: BOURG, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Je n’ai jamais vu ça dans cette rue.', en: 'What was that? I’ve never seen that in this street.' }] },
  { id: 's-b1-superstitious', act: 'back', stage: 1, bands: BOURG, when: { trait: 'superstitious' }, lines: [{ who: 'a', m: 'Je recule. Je suis sorti du pied gauche ce matin, je le savais.', f: 'Je recule. Je suis sortie du pied gauche ce matin, je le savais.', en: 'I back away. I got up on the wrong foot this morning, I knew it.' }] },
  { id: 's-b1-superstitious-fuir', act: 'flee', sign: FEAR, stage: 1, bands: BOURG, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Ma grand-mère disait de ne jamais rester là quand ça arrive. Je rentre en courant.', en: 'My grandmother said never to stay put when that happens. I’m running home.' }] },
  { id: 's-b1-cautious', act: 'back', stage: 1, bands: BOURG, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Je recule jusqu’au mur, et je regarde d’où ça vient.', en: 'I back up to the wall and watch where it comes from.' }] },
  { id: 's-b1-pious', stage: 1, bands: BOURG, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Trois prières ce soir au lieu d’une.', en: 'Three prayers tonight instead of one.' }] },
  { id: 's-b1-curious', act: 'search', stage: 1, bands: BOURG, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? Je veux voir d’où ça vient.', en: 'Again? I want to see where it comes from.' }] },
  { id: 's-b1-cheerful', act: 'wave', stage: 1, bands: BOURG, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Bonjour à vous, là-haut. Je ne sais pas qui, mais bonjour.', en: 'Good day to you up there. I don’t know who, but good day.' }] },
  { id: 's-b1-grumpy', act: 'go', adult: true, stage: 1, bands: BOURG, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Il ne manquait plus que ça, avec le grain à porter au moulin.', en: 'That’s all I needed, with the grain still to take to the mill.' }] },
  { id: 's-b1-enfant', stage: 1, bands: BOURG, when: { child: true }, lines: [{ who: 'a', fr: 'Je vais le raconter à {gamin}. Il ne me croira jamais.', en: 'I’m going to tell {gamin}. He’ll never believe me.' }] },
  { id: 's-b1-enfant-seul', stage: 1, bands: BOURG, when: { child: true }, lines: [{ who: 'a', fr: 'Je l’ai vu, et personne d’autre.', en: 'I saw it, and nobody else did.' }] },
  { id: 's-b1-enfant-signe', act: 'wave', stage: 1, bands: BOURG, when: { child: true }, lines: [{ who: 'a', fr: 'Je lève la main. Si c’est quelqu’un, il me verra.', en: 'I put my hand up. If it’s someone, they’ll see me.' }] },
  // ── 2. L'explication : un présage ──
  { id: 's-b2-vent', sign: 'wind', stage: 2, bands: BOURG, lines: [{ who: 'a', fr: 'Un vent qui ne souffle que sur une seule personne, c’est un présage. Ma grand-mère en parlait.', en: 'Wind that blows on one person only is an omen. My grandmother used to talk about it.' }] },
  { id: 's-b2-lumiere', adult: true, sign: 'light', stage: 2, bands: BOURG, lines: [{ who: 'a', fr: 'La lumière sur moi, c’est un présage. La récolte, peut-être.', en: 'Light on me, that’s an omen. The harvest, maybe.' }] },
  { id: 's-b2-lumiere-genoux', act: 'kneel', sign: 'light', stage: 2, bands: BOURG, lines: [{ who: 'a', fr: 'Deux fois la lumière sur moi. Je me mets à genoux, on ne sait jamais.', en: 'The light on me twice. I go down on my knees, you never know.' }] },
  { id: 's-b2-feu', sign: 'fire', stage: 2, bands: BOURG, lines: [{ who: 'a', fr: 'Un feu qui monte sans raison, ma mère disait que c’est quelqu’un qui pense à nous.', en: 'A fire that rises for no reason, my mother said that’s someone thinking of us.' }] },
  { id: 's-b2-bete', sign: 'beast', stage: 2, bands: BOURG, lines: [{ who: 'a', fr: 'Les bêtes sentent les présages avant nous. {Bete} le savait avant moi.', en: 'Animals feel omens before we do. {Bete} knew before I did.' }] },
  { id: 's-b2-pretre', act: 'pray', stage: 2, bands: BOURG, lines: [{ who: 'a', fr: 'Deux fois. Je vais demander au prêtre ce que ça veut dire.', en: 'Twice. I’m going to ask the priest what it means.' }] },
  { id: 's-b2-pious', act: 'pray', sign: NOT_LIGHT, stage: 2, bands: BOURG, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Les ancêtres me parlent. Je vais au culte tout de suite, avec une miche.', en: 'The ancestors are speaking to me. I’m going to the cult right now, with a loaf.' }] },
  { id: 's-b2-pious-genoux', act: 'kneel', sign: 'light', stage: 2, bands: BOURG, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Les ancêtres me regardent. Je me mets à genoux ici, dans la rue.', en: 'The ancestors are watching me. I go down on my knees here, in the street.' }] },
  { id: 's-b2-superstitious', act: 'flee', stage: 2, bands: BOURG, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Un présage, et pour moi. Je rentre, et je ne sors plus jusqu’à la nouvelle lune.', en: 'An omen, and for me. I’m going home, and not coming out again till the new moon.' }] },
  { id: 's-b2-cautious', act: 'flee', stage: 2, bands: BOURG, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Deux fois au même endroit. Je rentre par la ruelle, en courant.', en: 'Twice in the same spot. I’m going home by the alley, at a run.' }] },
  { id: 's-b2-curious', act: 'search', stage: 2, bands: BOURG, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Si je reste là, ça recommencera peut-être. Je compte jusqu’à cent.', en: 'If I stay here, maybe it’ll happen again. I’ll count to a hundred.' }] },
  { id: 's-b2-cheerful', act: 'wave', stage: 2, bands: BOURG, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Encore. Je fais signe en l’air, pour qu’on sache que j’ai vu.', en: 'Again. I wave up in the air, so they know I saw.' }] },
  { id: 's-b2-grumpy', act: 'go', stage: 2, bands: BOURG, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Un présage. Le dernier, c’était la grêle sur l’orge.', en: 'An omen. The last one was hail on the barley.' }] },
  { id: 's-b2-enfant', stage: 2, bands: BOURG, when: { child: true }, lines: [{ who: 'a', fr: 'C’est un présage, je le sais. Je ne l’ai dit à personne.', en: 'It’s an omen, I know it is. I haven’t told anyone.' }] },
  { id: 's-b2-enfant-parent', act: 'parent', stage: 2, bands: BOURG, when: { child: true }, lines: [{ who: 'a', fr: 'Je vais chercher papa. Lui, il saura.', en: 'I’m going to get Dad. He’ll know.' }] },
  // ── 3. Ça suffit ──
  { id: 's-b3-volet', stage: 3, bands: BOURG, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre, et je ferme le volet.', en: 'That’s enough. I’m going home and shutting the shutter.' }] },
  { id: 's-b3-pretre', stage: 3, bands: BOURG, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre. J’irai voir le prêtre demain.', en: 'That’s enough. I’m going home. I’ll go and see the priest tomorrow.' }] },
  { id: 's-b3-grumpy', adult: true, stage: 3, bands: BOURG, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre, j’ai du travail, moi.', en: 'That’s enough. I’m going home; some of us have work to do.' }] },
  { id: 's-b3-pious', act: 'pray', stage: 3, bands: BOURG, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit. Je vais faire l’offrande, tout de suite.', en: 'That’s enough. I’m going to make the offering, right now.' }] },
  { id: 's-b3-curious', stage: 3, bands: BOURG, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Je rentre, et demain je reviens avec {voisin}.', en: 'That’s enough for today. I’m going home, and tomorrow I’ll come back with {voisin}.' }] },
  { id: 's-b3-curious-compte', stage: 3, bands: BOURG, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. J’ai compté trois fois, je rentre.', en: 'That’s enough for today. I counted three times; I’m going home.' }] },
  { id: 's-b3-enfant', act: 'parent', stage: 3, bands: BOURG, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, je vais voir maman.', en: 'That’s enough, I’m going to Mum.' }] },
  { id: 's-b3-reprendre', act: 'go', stage: 3, bands: BOURG, lines: [{ who: 'a', fr: 'Ça suffit. J’ai mieux à faire que de regarder en l’air.', en: 'That’s enough. I’ve better things to do than stare at the sky.' }] },

  // ══ MARBRE : un dieu ══════════════════════════════════════════════════════════
  // ── 1. La surprise ──
  { id: 's-m1-vent', sign: 'wind', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: 'Un coup de vent sur moi seul. À deux pas, la poussière ne bougeait pas.', en: 'A gust on me alone. Two steps away, the dust didn’t stir.' }] },
  { id: 's-m1-vent-face', sign: 'wind', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: 'Le vent m’a pris de face et m’a lâché d’un coup. Il fait pourtant lourd aujourd’hui.', en: 'The wind hit me head on and let go all at once. And it’s close today.' }] },
  { id: 's-m1-soleil', sign: 'light', stage: 1, bands: MARBRE, when: { night: false }, lines: [{ who: 'a', fr: 'Un rayon de soleil sur moi, comme sur une statue du forum.', en: 'A ray of sun on me, like on a statue in the forum.' }] },
  { id: 's-m1-lune', sign: 'light', stage: 1, bands: MARBRE, when: { night: true }, lines: [{ who: 'a', fr: 'La lune sur moi seul, et pas sur les colonnes.', en: 'The moon on me alone, and not on the columns.' }] },
  { id: 's-m1-feu', act: 'back', sign: 'fire', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: 'Le feu a monté d’un coup, comme quand on y jette de l’huile. J’ai fait un pas en arrière.', en: 'The fire shot up, like when you throw oil on it. I took a step back.' }] },
  { id: 's-m1-feu-coudee', sign: 'fire', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: 'Les flammes ont grandi d’une coudée. Personne n’a touché au bois.', en: 'The flames grew a cubit. Nobody touched the wood.' }] },
  { id: 's-m1-bete', sign: 'beast', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: '{Bete} me regarde comme si je lui devais quelque chose.', en: '{Bete} is looking at me as if I owed it something.' }] },
  { id: 's-m1-bete-derriere', sign: 'beast', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: '{Bete} s’arrête et me fixe. Je regarde derrière moi : personne.', en: '{Bete} stops and stares at me. I look behind me. Nobody.' }] },
  { id: 's-m1-bete-brouter', sign: 'beast', stage: 1, bands: MARBRE, when: { beast: HERD }, lines: [{ who: 'a', fr: '{Bete} a cessé de brouter et me regarde.', en: '{Bete} has stopped grazing and is looking at me.' }] },
  { id: 's-m1-quoi', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Personne d’autre n’a l’air d’avoir vu.', en: 'What was that? Nobody else seems to have seen it.' }] },
  { id: 's-m1-superstitious', act: 'back', stage: 1, bands: MARBRE, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Le mauvais œil. Je recule, et je ressortirai l’amulette de ma mère.', en: 'The evil eye. I back away, and I’ll get my mother’s amulet out again.' }] },
  { id: 's-m1-superstitious-fuir', act: 'flee', sign: FEAR, stage: 1, bands: MARBRE, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Le mauvais œil, ici. Je rentre par l’autre rue, en courant.', en: 'The evil eye, here. I’m going home by the other street, at a run.' }] },
  { id: 's-m1-cautious', act: 'back', stage: 1, bands: MARBRE, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Je recule jusqu’aux colonnes. On verra d’abord.', en: 'I back off to the columns. I’ll see first.' }] },
  { id: 's-m1-pious', stage: 1, bands: MARBRE, when: { trait: 'pious' }, lines: [{ who: 'a', m: 'Un dieu m’a vu. Ce soir je laisserai une offrande, une vraie.', f: 'Un dieu m’a vue. Ce soir je laisserai une offrande, une vraie.', en: 'A god has seen me. Tonight I’ll leave an offering, a proper one.' }] },
  { id: 's-m1-curious', act: 'search', stage: 1, bands: MARBRE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? Cette fois je regarde mieux.', en: 'Again? This time I’ll watch properly.' }] },
  { id: 's-m1-cheerful', act: 'wave', stage: 1, bands: MARBRE, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Salut à toi, qui que tu sois. Je lève la main, comme au forum.', en: 'Greetings, whoever you are. I raise my hand, as in the forum.' }] },
  { id: 's-m1-grumpy', act: 'go', adult: true, stage: 1, bands: MARBRE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Il ne manquait plus que ça, avec le loyer de l’insula à payer aux calendes.', en: 'That’s all I needed, with the insula rent due at the calends.' }] },
  { id: 's-m1-enfant', stage: 1, bands: MARBRE, when: { child: true }, lines: [{ who: 'a', fr: 'Je le dirai au maître d’école. Lui, il saura.', en: 'I’ll tell the schoolmaster. He’ll know.' }] },
  { id: 's-m1-enfant-signe', act: 'wave', stage: 1, bands: MARBRE, when: { child: true }, lines: [{ who: 'a', fr: 'Je fais signe au dieu. Le maître d’école dit qu’ils aiment qu’on les salue.', en: 'I wave to the god. The schoolmaster says they like being greeted.' }] },
  // ── 2. L'explication : un dieu ──
  { id: 's-m2-vent', sign: 'wind', stage: 2, bands: MARBRE, lines: [{ who: 'a', fr: 'C’est un dieu qui passe. Il a soufflé pour que je le remarque.', en: 'It’s a god going by. He blew so I’d notice him.' }] },
  { id: 's-m2-lumiere', sign: 'light', stage: 2, bands: MARBRE, lines: [{ who: 'a', fr: 'Un dieu m’a pris dans sa lumière. Je ne sais pas encore lequel.', en: 'A god has caught me in his light. I don’t know which one yet.' }] },
  { id: 's-m2-lumiere-genoux', act: 'kneel', sign: 'light', stage: 2, bands: MARBRE, lines: [{ who: 'a', fr: 'Un dieu me tient dans sa lumière. Je mets un genou à terre.', en: 'A god holds me in his light. I go down on one knee.' }] },
  { id: 's-m2-feu', sign: 'fire', stage: 2, bands: MARBRE, lines: [{ who: 'a', fr: 'Un feu ne monte pas tout seul. Un dieu a voulu que je le voie.', en: 'A fire doesn’t rise by itself. A god wanted me to see it.' }] },
  { id: 's-m2-bete', sign: 'beast', stage: 2, bands: MARBRE, lines: [{ who: 'a', m: 'Les augures lisent les bêtes. {Bete} m’a regardé, ça veut dire quelque chose.', f: 'Les augures lisent les bêtes. {Bete} m’a regardée, ça veut dire quelque chose.', en: 'The augurs read animals. {Bete} looked at me; that means something.' }] },
  { id: 's-m2-augures', act: 'pray', stage: 2, bands: MARBRE, lines: [{ who: 'a', fr: 'Deux fois de suite. Je vais tout de suite demander aux augures.', en: 'Twice running. I’m going to ask the augurs right now.' }] },
  { id: 's-m2-pious', act: 'pray', adult: true, sign: NOT_LIGHT, stage: 2, bands: MARBRE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Un dieu s’occupe de moi. Je vais au temple avec une colombe, tout de suite.', en: 'A god is looking after me. I’m going to the temple with a dove, right now.' }] },
  { id: 's-m2-pious-nom', act: 'pray', sign: NOT_LIGHT, stage: 2, bands: MARBRE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'C’est {nom}. Je vais au temple, maintenant.', en: 'It’s {nom}. I’m going to the temple, now.' }] },
  { id: 's-m2-pious-genoux', act: 'kneel', sign: 'light', stage: 2, bands: MARBRE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Un dieu sur moi, deux fois. À genoux, ici même.', en: 'A god upon me, twice. On my knees, right here.' }] },
  { id: 's-m2-superstitious', act: 'flee', stage: 2, bands: MARBRE, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Un dieu en colère. J’ai dû oublier une offrande. Je rentre, vite.', en: 'An angry god. I must have forgotten an offering. I’m going home, quickly.' }] },
  { id: 's-m2-cautious', act: 'flee', stage: 2, bands: MARBRE, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Deux fois. Je quitte la rue, je repasserai demain.', en: 'Twice. I’m leaving this street; I’ll come back tomorrow.' }] },
  { id: 's-m2-curious', act: 'search', stage: 2, bands: MARBRE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Si c’est un dieu, je veux savoir lequel. Encore une fois et je saurai.', en: 'If it’s a god, I want to know which one. Once more and I’ll know.' }] },
  { id: 's-m2-cheerful', act: 'wave', stage: 2, bands: MARBRE, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Encore toi. Je te salue, comme on salue au forum.', en: 'You again. I greet you, the way we greet in the forum.' }] },
  { id: 's-m2-grumpy', act: 'go', stage: 2, bands: MARBRE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Un dieu qui n’a rien de mieux à faire. Les thermes sont froids depuis une semaine, il pourrait s’en occuper.', en: 'A god with nothing better to do. The baths have been cold for a week; he could see to that.' }] },
  { id: 's-m2-enfant', act: 'wave', stage: 2, bands: MARBRE, when: { child: true }, lines: [{ who: 'a', m: 'C’est un dieu. Il m’a choisi. Je lui fais signe.', f: 'C’est un dieu. Il m’a choisie. Je lui fais signe.', en: 'It’s a god. He chose me. I’m waving to him.' }] },
  { id: 's-m2-enfant-parent', act: 'parent', stage: 2, bands: MARBRE, when: { child: true }, lines: [{ who: 'a', fr: 'Je cours le dire à maman.', en: 'I’m running to tell Mum.' }] },
  // ── 3. Ça suffit ──
  { id: 's-m3-tanneurs', stage: 3, bands: MARBRE, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre par la rue des tanneurs.', en: 'That’s enough. I’m going home by the tanners’ street.' }] },
  { id: 's-m3-compris', stage: 3, bands: MARBRE, lines: [{ who: 'a', fr: 'Ça suffit. Qui que tu sois, j’ai compris. Je rentre.', en: 'That’s enough. Whoever you are, I get it. I’m going home.' }] },
  { id: 's-m3-grumpy', adult: true, stage: 3, bands: MARBRE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre, et demain je me plains au magistrat, je ne sais pas encore de qui.', en: 'That’s enough. I’m going home, and tomorrow I’ll complain to the magistrate, about whom I don’t know yet.' }] },
  { id: 's-m3-pious', act: 'pray', stage: 3, bands: MARBRE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai entendu. Je vais au temple faire l’offrande.', en: 'That’s enough, I heard. I’m going to the temple to make the offering.' }] },
  { id: 's-m3-curious', stage: 3, bands: MARBRE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Je rentre écrire tout ça sur une tablette.', en: 'That’s enough for today. I’m going home to write all this down on a tablet.' }] },
  { id: 's-m3-enfant', act: 'parent', stage: 3, bands: MARBRE, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, ça me fait peur. Je vais voir maman.', en: 'That’s enough, it scares me. I’m going to Mum.' }] },
  { id: 's-m3-reprendre', act: 'go', stage: 3, bands: MARBRE, lines: [{ who: 'a', fr: 'Ça suffit. Je ne lève plus les yeux.', en: 'That’s enough. I’m not looking up again.' }] },

  // ══ FONTE : un courant d'air ══════════════════════════════════════════════════
  // ── 1. La surprise ──
  { id: 's-u1-vent', sign: 'wind', stage: 1, bands: FONTE, lines: [{ who: 'a', fr: 'Un courant d’air en pleine rue, et sur moi seul. La fumée des cheminées montait droit.', en: 'A draught in the middle of the street, and only on me. The chimney smoke was going straight up.' }] },
  { id: 's-u1-vent-chapeau', sign: 'wind', stage: 1, bands: FONTE, lines: [{ who: 'a', fr: 'Le vent a failli m’arracher mon chapeau. Personne d’autre n’a levé la main.', en: 'The wind nearly took my hat off. Nobody else even put a hand up.' }] },
  { id: 's-u1-soleil', sign: 'light', stage: 1, bands: FONTE, when: { night: false }, lines: [{ who: 'a', fr: 'Le soleil a percé la fumée, juste sur moi. Ça n’arrive jamais par ici.', en: 'The sun broke through the smoke, right on me. That never happens round here.' }] },
  { id: 's-u1-nuit', sign: 'light', stage: 1, bands: FONTE, when: { night: true }, lines: [{ who: 'a', fr: 'Il a fait clair sur moi comme sous un bec de gaz, et il n’y en a pas ici.', en: 'It went as bright on me as under a gas lamp, and there isn’t one here.' }] },
  { id: 's-u1-feu', act: 'back', sign: 'fire', stage: 1, bands: FONTE, lines: [{ who: 'a', fr: 'Le feu a fait un bond, comme quand on ouvre la porte du poêle. J’ai reculé.', en: 'The fire jumped, like when you open the stove door. I stepped back.' }] },
  { id: 's-u1-feu-fourneau', sign: 'fire', stage: 1, bands: FONTE, lines: [{ who: 'a', fr: 'Les flammes ont doublé d’un coup, comme au haut fourneau quand on charge.', en: 'The flames doubled all at once, like at the blast furnace when they load it.' }] },
  { id: 's-u1-bete', sign: 'beast', stage: 1, bands: FONTE, lines: [{ who: 'a', fr: '{Bete} me fixe depuis tout à l’heure. Je n’ai rien à manger sur moi.', en: '{Bete} has been staring at me for a while. I’ve no food on me.' }] },
  { id: 's-u1-bete-chien', sign: 'beast', stage: 1, bands: FONTE, lines: [{ who: 'a', fr: 'Le chien de {maitre} s’est arrêté net et me regarde. {maitre} tire sur la laisse pour rien.', en: '{maitre}’s dog has stopped dead and is staring at me. {maitre}’s pulling on the lead for nothing.' }] },
  { id: 's-u1-quoi', adult: true, stage: 1, bands: FONTE, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Je n’ai rien bu, pourtant.', en: 'What was that? And I haven’t had a drop.' }] },
  { id: 's-u1-superstitious', act: 'back', stage: 1, bands: FONTE, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Je recule. Ma mère aurait dit que c’est un signe.', en: 'I back away. My mother would have said it’s a sign.' }] },
  { id: 's-u1-superstitious-fuir', act: 'flee', sign: FEAR, stage: 1, bands: FONTE, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Je ne reste pas dans cette rue. Ma mère aurait dit que c’est un signe.', en: 'I’m not staying in this street. My mother would have said it’s a sign.' }] },
  { id: 's-u1-cautious', act: 'back', stage: 1, bands: FONTE, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Je recule contre le mur et j’attends que ça passe.', en: 'I back up against the wall and wait for it to pass.' }] },
  { id: 's-u1-pious', stage: 1, bands: FONTE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Je passerai allumer une bougie. On ne sait jamais.', en: 'I’ll stop and light a candle. You never know.' }] },
  { id: 's-u1-curious', act: 'search', stage: 1, bands: FONTE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? Je voudrais voir d’où vient le courant d’air.', en: 'Again? I’d like to see where the draught comes from.' }] },
  { id: 's-u1-cheerful', act: 'wave', stage: 1, bands: FONTE, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Bonjour, qui que vous soyez. Un signe de la main, ça ne coûte rien.', en: 'Good day, whoever you are. A wave costs nothing.' }] },
  { id: 's-u1-grumpy', act: 'go', adult: true, stage: 1, bands: FONTE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Il ne manquait plus que ça. La paie est en retard, et maintenant ça.', en: 'That’s all I needed. The pay’s late, and now this.' }] },
  { id: 's-u1-enfant', stage: 1, bands: FONTE, when: { child: true }, lines: [{ who: 'a', fr: 'Je le raconterai à l’école. La maîtresse ne me croira pas.', en: 'I’ll tell them at school. The teacher won’t believe me.' }] },
  { id: 's-u1-enfant-signe', act: 'wave', stage: 1, bands: FONTE, when: { child: true }, lines: [{ who: 'a', fr: 'Je fais signe en l’air, pour voir.', en: 'I wave up in the air, just to see.' }] },
  // ── 2. L'explication : un courant d'air ──
  { id: 's-u2-vent', sign: 'wind', stage: 2, bands: FONTE, lines: [{ who: 'a', fr: 'Un courant d’air entre deux immeubles, rien d’autre. Ça arrive avec les rues étroites.', en: 'A draught between two buildings, nothing else. It happens with narrow streets.' }] },
  { id: 's-u2-lumiere', sign: 'light', stage: 2, bands: FONTE, lines: [{ who: 'a', fr: 'Un trou dans la fumée des usines, rien de plus.', en: 'A gap in the factory smoke, nothing more.' }] },
  { id: 's-u2-feu', adult: true, sign: 'fire', stage: 2, bands: FONTE, lines: [{ who: 'a', fr: 'Un courant d’air dans le conduit. Il faudra faire ramoner avant l’hiver.', en: 'A draught in the flue. I’ll have to get it swept before winter.' }] },
  { id: 's-u2-bete', sign: 'beast', stage: 2, bands: FONTE, lines: [{ who: 'a', fr: '{Bete} a senti le pain dans ma poche, c’est tout.', en: '{Bete} smelled the bread in my pocket, that’s all.' }] },
  { id: 's-u2-explication', stage: 2, bands: FONTE, lines: [{ who: 'a', fr: 'Il y a forcément une explication. Je la trouverai en rentrant.', en: 'There’s bound to be an explanation. I’ll work it out on the way home.' }] },
  { id: 's-u2-pious', act: 'pray', sign: NOT_LIGHT, stage: 2, bands: FONTE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Un courant d’air, diront-ils. Moi je vais allumer une bougie au culte, tout de suite.', en: 'A draught, they’ll say. I’m going to light a candle at the service, right now.' }] },
  { id: 's-u2-pious-nom', act: 'pray', sign: NOT_LIGHT, stage: 2, bands: FONTE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'C’est {nom} qui veille sur moi, je le savais. Je vais allumer une bougie, une grande.', en: 'It’s {nom} watching over me, I knew it. I’m going to light a candle, a big one.' }] },
  { id: 's-u2-pious-genoux', act: 'kneel', sign: 'light', stage: 2, bands: FONTE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Deux fois la lumière sur moi. Je mets un genou à terre, tant pis pour les passants.', en: 'The light on me twice. I go down on one knee, never mind the passers-by.' }] },
  { id: 's-u2-superstitious', act: 'flee', stage: 2, bands: FONTE, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Deux fois. Ce n’est plus un courant d’air. Je rentre en courant.', en: 'Twice. That’s no draught any more. I’m running home.' }] },
  { id: 's-u2-cautious', act: 'flee', stage: 2, bands: FONTE, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Deux fois. Je change de rue, et vite.', en: 'Twice. I’m changing streets, and quickly.' }] },
  { id: 's-u2-curious', act: 'search', stage: 2, bands: FONTE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois et je saurai d’où ça vient. Je ne bouge pas.', en: 'Once more and I’ll know where it comes from. I’m not moving.' }] },
  { id: 's-u2-cheerful', act: 'wave', stage: 2, bands: FONTE, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Encore. Je fais un signe de la main, au cas où.', en: 'Again. I give a wave, just in case.' }] },
  { id: 's-u2-grumpy', act: 'go', adult: true, stage: 2, bands: FONTE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Un courant d’air de plus. Le propriétaire ne bouchera jamais rien.', en: 'One more draught. The landlord’ll never block anything up.' }] },
  { id: 's-u2-enfant', stage: 2, bands: FONTE, when: { child: true }, lines: [{ who: 'a', fr: 'Papa dira que c’est un courant d’air. Moi je sais que non.', en: 'Dad’ll say it’s a draught. I know it isn’t.' }] },
  { id: 's-u2-enfant-parent', act: 'parent', stage: 2, bands: FONTE, when: { child: true }, lines: [{ who: 'a', fr: 'Je cours chercher papa.', en: 'I’m running to get Dad.' }] },
  // ── 3. Ça suffit ──
  { id: 's-u3-sirene', stage: 3, bands: FONTE, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre avant la sirène.', en: 'That’s enough. I’m going home before the siren.' }] },
  { id: 's-u3-rien', stage: 3, bands: FONTE, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre, je ne veux plus rien voir aujourd’hui.', en: 'That’s enough. I’m going home; I don’t want to see anything else today.' }] },
  { id: 's-u3-grumpy', adult: true, stage: 3, bands: FONTE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre, j’ai dix heures d’atelier dans les jambes.', en: 'That’s enough. I’m going home; I’ve got ten hours of the workshop in my legs.' }] },
  { id: 's-u3-pious', act: 'pray', stage: 3, bands: FONTE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai compris. Je vais au culte, maintenant.', en: 'That’s enough, I understand. I’m going to the service, now.' }] },
  { id: 's-u3-curious', adult: true, stage: 3, bands: FONTE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Je rentre, j’en parlerai au contremaître, il lit les journaux.', en: 'That’s enough for today. I’m going home; I’ll tell the foreman, he reads the papers.' }] },
  { id: 's-u3-enfant', stage: 3, bands: FONTE, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, je rentre.', en: 'That’s enough, I’m going home.' }] },
  { id: 's-u3-reprendre', act: 'go', stage: 3, bands: FONTE, lines: [{ who: 'a', fr: 'Ça suffit. Je fais comme si de rien n’était.', en: 'That’s enough. I’ll act as if nothing happened.' }] },

  // ══ NÉON : une panne ══════════════════════════════════════════════════════════
  // ── 1. La surprise ──
  { id: 's-n1-vent', sign: 'wind', stage: 1, bands: NEON, lines: [{ who: 'a', fr: 'Un souffle d’air chaud sur moi, comme à la bouche du métro. Il n’y a pas de métro ici.', en: 'A blast of warm air on me, like at a metro vent. There’s no metro here.' }] },
  { id: 's-n1-vent-coiffe', sign: 'wind', stage: 1, bands: NEON, lines: [{ who: 'a', m: 'Le vent m’a décoiffé et s’est arrêté net. Sur le trottoir, rien n’a bougé.', f: 'Le vent m’a décoiffée et s’est arrêté net. Sur le trottoir, rien n’a bougé.', en: 'The wind messed up my hair and stopped dead. Nothing else on the pavement moved.' }] },
  { id: 's-n1-soleil', sign: 'light', stage: 1, bands: NEON, when: { night: false }, lines: [{ who: 'a', fr: 'Le soleil est passé entre deux tours, pile sur moi.', en: 'The sun came through between two towers, right on me.' }] },
  { id: 's-n1-nuit', sign: 'light', stage: 1, bands: NEON, when: { night: true }, lines: [{ who: 'a', fr: 'Il a fait clair sur moi d’un coup, et sur personne d’autre.', en: 'It went bright on me all of a sudden, and on nobody else.' }] },
  { id: 's-n1-feu', sign: 'fire', stage: 1, bands: NEON, lines: [{ who: 'a', fr: 'Les flammes sont montées d’un coup, comme avec de l’essence.', en: 'The flames shot up, like with petrol.' }] },
  { id: 's-n1-feu-recul', act: 'back', sign: 'fire', stage: 1, bands: NEON, lines: [{ who: 'a', fr: 'Le feu a grandi d’un coup. J’ai reculé sans réfléchir.', en: 'The fire flared up all at once. I stepped back without thinking.' }] },
  { id: 's-n1-bete', sign: 'beast', stage: 1, bands: NEON, lines: [{ who: 'a', fr: '{Bete} me fixe comme si on se connaissait.', en: '{Bete} is staring at me like we know each other.' }] },
  { id: 's-n1-bete-chien', sign: 'beast', stage: 1, bands: NEON, lines: [{ who: 'a', fr: 'Le chien de {maitre} s’est assis sur le trottoir et me regarde. {maitre} n’arrive plus à le faire avancer.', en: '{maitre}’s dog has sat down on the pavement and is staring at me. {maitre} can’t get it to move.' }] },
  { id: 's-n1-quoi', stage: 1, bands: NEON, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Je n’ai même pas eu le temps de sortir mon téléphone.', en: 'What was that? I didn’t even have time to get my phone out.' }] },
  { id: 's-n1-superstitious', act: 'back', stage: 1, bands: NEON, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Je recule. Je ne prends pas le métro aujourd’hui, je rentrerai à pied.', en: 'I back away. I’m not taking the metro today; I’ll walk home.' }] },
  { id: 's-n1-superstitious-fuir', act: 'flee', sign: FEAR, stage: 1, bands: NEON, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Je ne reste pas là. Je rentre, et je ferme à double tour.', en: 'I’m not staying here. I’m going home, and double-locking the door.' }] },
  { id: 's-n1-cautious', act: 'back', stage: 1, bands: NEON, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Je recule d’un pas. Il y a sûrement une explication, mais de loin.', en: 'I take a step back. There’s surely an explanation, but from a distance.' }] },
  { id: 's-n1-pious', stage: 1, bands: NEON, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Je n’y croyais plus trop. Il faudra peut-être que j’y repense.', en: 'I hadn’t really believed for a while. Maybe I need to think about it again.' }] },
  { id: 's-n1-curious', act: 'search', stage: 1, bands: NEON, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? Cette fois, je sors mon téléphone.', en: 'Again? This time I’m getting my phone out.' }] },
  { id: 's-n1-cheerful', act: 'wave', stage: 1, bands: NEON, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Salut, qui que tu sois. Je te fais coucou.', en: 'Hi, whoever you are. I’m waving to you.' }] },
  { id: 's-n1-grumpy', act: 'go', adult: true, stage: 1, bands: NEON, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Super. Exactement ce qu’il me fallait avant la réunion de neuf heures.', en: 'Great. Exactly what I needed before the nine o’clock meeting.' }] },
  { id: 's-n1-enfant', stage: 1, bands: NEON, when: { child: true }, lines: [{ who: 'a', fr: 'Je vais le dire à {gamin}, il va être jaloux.', en: 'I’m going to tell {gamin}. He’ll be so jealous.' }] },
  { id: 's-n1-enfant-seul', stage: 1, bands: NEON, when: { child: true }, lines: [{ who: 'a', fr: 'Je l’ai vu. Personne ne regardait à part moi.', en: 'I saw it. Nobody else was looking.' }] },
  { id: 's-n1-enfant-signe', act: 'wave', stage: 1, bands: NEON, when: { child: true }, lines: [{ who: 'a', fr: 'Je fais coucou en l’air. Personne ne me voit faire.', en: 'I wave up at the sky. Nobody sees me doing it.' }] },
  // ── 2. L'explication : une panne ──
  { id: 's-n2-vent', sign: 'wind', stage: 2, bands: NEON, lines: [{ who: 'a', fr: 'La ventilation d’un immeuble qui s’emballe. Il y a des pannes partout en ce moment.', en: 'Some building’s ventilation running wild. There are breakdowns everywhere at the moment.' }] },
  { id: 's-n2-lumiere', sign: 'light', stage: 2, bands: NEON, lines: [{ who: 'a', fr: 'Un reflet sur une vitre de bureau, ou une panne de quelque chose. Je regarderai les infos.', en: 'A reflection off an office window, or something on the blink. I’ll check the news.' }] },
  { id: 's-n2-feu', sign: 'fire', stage: 2, bands: NEON, lines: [{ who: 'a', fr: 'Une fuite de gaz, sûrement. Il faudrait prévenir quelqu’un.', en: 'A gas leak, surely. Someone should be told.' }] },
  { id: 's-n2-bete', sign: 'beast', stage: 2, bands: NEON, lines: [{ who: 'a', fr: '{Bete} est peut-être malade. Ou c’est moi qui sens quelque chose.', en: '{Bete} might be ill. Or maybe it’s me that smells of something.' }] },
  { id: 's-n2-panne', stage: 2, bands: NEON, lines: [{ who: 'a', fr: 'Deux fois. Une panne, quelque chose qui déraille dans le quartier.', en: 'Twice. A fault, something going wrong in the neighbourhood.' }] },
  { id: 's-n2-pious', act: 'pray', sign: NOT_LIGHT, stage: 2, bands: NEON, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Une panne, ils diront. Moi je vais allumer une bougie au culte, maintenant.', en: 'A fault, they’ll say. I’m going to light a candle at the service, now.' }] },
  { id: 's-n2-pious-nom', act: 'kneel', sign: 'light', stage: 2, bands: NEON, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Si c’est {nom}, je voudrais savoir ce qu’on attend de moi. Je m’agenouille, en attendant.', en: 'If it’s {nom}, I’d like to know what’s expected of me. I kneel, while I wait.' }] },
  { id: 's-n2-pious-genoux', act: 'kneel', sign: 'light', stage: 2, bands: NEON, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Deux fois. Je m’agenouille là, sur le trottoir, tant pis s’ils regardent.', en: 'Twice. I kneel right here on the pavement, never mind if they stare.' }] },
  { id: 's-n2-superstitious', act: 'flee', stage: 2, bands: NEON, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Une panne, peut-être. Mais je ne repasse pas par ici. Je rentre.', en: 'A fault, maybe. But I’m not coming this way again. I’m going home.' }] },
  { id: 's-n2-cautious', act: 'flee', stage: 2, bands: NEON, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Deux fois. Je rentre, je verrai ça aux infos.', en: 'Twice. I’m going home; I’ll see it on the news.' }] },
  { id: 's-n2-curious', act: 'search', stage: 2, bands: NEON, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois et je filme. J’ai le téléphone à la main.', en: 'Once more and I’m filming. I’ve got my phone in my hand.' }] },
  { id: 's-n2-cheerful', act: 'wave', stage: 2, bands: NEON, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Encore. Je te fais signe, pour voir si ça recommence.', en: 'Again. I wave to you, to see if it happens again.' }] },
  { id: 's-n2-grumpy', act: 'go', stage: 2, bands: NEON, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Une panne de plus. Personne ne répare rien dans cette ville.', en: 'One more fault. Nobody fixes anything in this city.' }] },
  { id: 's-n2-enfant', stage: 2, bands: NEON, when: { child: true }, lines: [{ who: 'a', fr: 'Maman dira que c’est une panne. Ce n’est pas une panne.', en: 'Mum’ll say it’s a fault. It isn’t a fault.' }] },
  { id: 's-n2-enfant-parent', act: 'parent', stage: 2, bands: NEON, when: { child: true }, lines: [{ who: 'a', fr: 'Je cours le dire à maman.', en: 'I’m running to tell Mum.' }] },
  // ── 3. Ça suffit ──
  { id: 's-n3-volets', stage: 3, bands: NEON, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre, je ferme les volets, je ne regarde plus.', en: 'That’s enough. I’m going home, closing the shutters, not looking any more.' }] },
  { id: 's-n3-quartier', act: 'go', stage: 3, bands: NEON, lines: [{ who: 'a', fr: 'Ça suffit. Je change de quartier pour aujourd’hui.', en: 'That’s enough. I’m going to another part of town for today.' }] },
  { id: 's-n3-grumpy', stage: 3, bands: NEON, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre, et je vais écrire à la mairie.', en: 'That’s enough. I’m going home, and I’m writing to the town hall.' }] },
  { id: 's-n3-pious', act: 'pray', stage: 3, bands: NEON, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai compris. Je passe au culte, maintenant.', en: 'That’s enough, I get it. I’m stopping by the service, now.' }] },
  { id: 's-n3-curious', act: 'go', stage: 3, bands: NEON, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Demain, même heure, même trottoir.', en: 'That’s enough for today. Tomorrow, same time, same pavement.' }] },
  { id: 's-n3-enfant', stage: 3, bands: NEON, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, je veux rentrer.', en: 'That’s enough, I want to go home.' }] },
  { id: 's-n3-reprendre', act: 'go', stage: 3, bands: NEON, lines: [{ who: 'a', fr: 'Ça suffit. Je remets mes écouteurs et je continue.', en: 'That’s enough. I’m putting my earphones back in and carrying on.' }] },

  // ══ NOOSPHÈRE : le chœur ══════════════════════════════════════════════════════
  // Plus de bêtes à cet âge, et guère de feux : le vent et la lumière.
  // ── 1. La surprise ──
  { id: 's-x71-vent', sign: 'wind', stage: 1, bands: NOOS, lines: [{ who: 'a', fr: 'Un souffle d’air sur moi seul. Sous la membrane, l’air ne bouge jamais comme ça.', en: 'A breath of air on me alone. Under the membrane, the air never moves like that.' }] },
  { id: 's-x71-vent-cou', sign: 'wind', stage: 1, bands: NOOS, lines: [{ who: 'a', m: 'Ça m’a soufflé dans le cou, comme quelqu’un derrière moi. Je me suis retourné : personne.', f: 'Ça m’a soufflé dans le cou, comme quelqu’un derrière moi. Je me suis retournée : personne.', en: 'Something blew on my neck, like someone behind me. I turned round. Nobody.' }] },
  { id: 's-x71-jour', sign: 'light', stage: 1, bands: NOOS, when: { night: false }, lines: [{ who: 'a', fr: 'La lumière a monté sur moi, et pas sur la rue. Le chœur n’en dit rien.', en: 'The light rose on me, and not on the street. The chorus says nothing about it.' }] },
  { id: 's-x71-nuit', sign: 'light', stage: 1, bands: NOOS, when: { night: true }, lines: [{ who: 'a', fr: 'De la lumière sur moi, en pleine nuit, et pas une tour-mémoire allumée à côté.', en: 'Light on me, in the middle of the night, and not one memory tower lit nearby.' }] },
  { id: 's-x71-quoi', stage: 1, bands: NOOS, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Je n’ai rien senti venir dans le chœur.', en: 'What was that? I didn’t feel it coming in the chorus.' }] },
  { id: 's-x71-superstitious', act: 'back', stage: 1, bands: NOOS, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Je recule. Ce soir je me débranche du chœur, ma grand-mère disait que ça attire les choses.', en: 'I back away. Tonight I’m unplugging from the chorus; my grandmother said it draws things in.' }] },
  { id: 's-x71-cautious', act: 'back', stage: 1, bands: NOOS, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Je recule de trois pas et j’attends.', en: 'I back off three steps and wait.' }] },
  { id: 's-x71-pious', stage: 1, bands: NOOS, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Quelqu’un pense à moi, et ce n’est pas le chœur.', en: 'Someone is thinking of me, and it isn’t the chorus.' }] },
  { id: 's-x71-curious', act: 'search', stage: 1, bands: NOOS, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? Je veux que le chœur l’enregistre.', en: 'Again? I want the chorus to record it.' }] },
  { id: 's-x71-cheerful', act: 'wave', stage: 1, bands: NOOS, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Je fais signe, au cas où ce serait quelqu’un du chœur qui s’amuse.', en: 'I wave, in case it’s someone in the chorus having fun.' }] },
  { id: 's-x71-grumpy', act: 'go', stage: 1, bands: NOOS, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Le chœur est censé prévenir de ce genre de chose. À quoi il sert ?', en: 'The chorus is supposed to warn about this sort of thing. What’s it for?' }] },
  { id: 's-x71-enfant', stage: 1, bands: NOOS, when: { child: true }, lines: [{ who: 'a', m: 'Quand je serai branché au chœur, je le raconterai à tout le monde.', f: 'Quand je serai branchée au chœur, je le raconterai à tout le monde.', en: 'When I’m connected to the chorus, I’ll tell everyone.' }] },
  { id: 's-x71-enfant-signe', act: 'wave', stage: 1, bands: NOOS, when: { child: true }, lines: [{ who: 'a', fr: 'Je fais signe en l’air, des deux mains.', en: 'I wave up in the air with both hands.' }] },
  // ── 2. L'explication : le chœur ──
  { id: 's-x72-vent', sign: 'wind', stage: 2, bands: NOOS, lines: [{ who: 'a', fr: 'Quelqu’un a dû penser trop fort dans le chœur. Il paraît que ça fait bouger l’air.', en: 'Someone must have thought too hard in the chorus. Apparently that moves the air.' }] },
  { id: 's-x72-lumiere', sign: 'light', stage: 2, bands: NOOS, lines: [{ who: 'a', fr: 'Les tours-mémoire ont dû renvoyer la lumière. Je chercherai l’explication dans le chœur.', en: 'The memory towers must have thrown the light back. I’ll look up the explanation in the chorus.' }] },
  { id: 's-x72-deux', stage: 2, bands: NOOS, lines: [{ who: 'a', fr: 'Deux fois. Je vais demander au chœur si d’autres l’ont senti.', en: 'Twice. I’ll ask the chorus whether anyone else felt it.' }] },
  { id: 's-x72-pious', stage: 2, bands: NOOS, when: { trait: 'pious' }, lines: [{ who: 'a', m: 'Il y a quelqu’un hors du chœur. J’en suis sûr, maintenant.', f: 'Il y a quelqu’un hors du chœur. J’en suis sûre, maintenant.', en: 'There’s someone outside the chorus. I’m sure of it now.' }] },
  { id: 's-x72-pious-nom', act: 'pray', sign: NOT_LIGHT, stage: 2, bands: NOOS, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'C’est {nom}. Je vais le dire au culte, tout bas.', en: 'It’s {nom}. I’m going to tell them at the service, very quietly.' }] },
  { id: 's-x72-pious-genoux', act: 'kneel', sign: 'light', stage: 2, bands: NOOS, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Quelqu’un hors du chœur me regarde. Je m’agenouille, là.', en: 'Someone outside the chorus is watching me. I kneel, right here.' }] },
  { id: 's-x72-superstitious', act: 'flee', stage: 2, bands: NOOS, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Ce n’est pas le chœur. Le chœur ne fait pas ça. Je rentre, vite.', en: 'It isn’t the chorus. The chorus doesn’t do that. I’m going home, quickly.' }] },
  { id: 's-x72-cautious', act: 'flee', stage: 2, bands: NOOS, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Deux fois. Je rentre et je me débranche.', en: 'Twice. I’m going home to unplug.' }] },
  { id: 's-x72-curious', act: 'search', stage: 2, bands: NOOS, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois, et je partage la mesure. Il m’en faut deux.', en: 'Once more and I’ll share the reading. I need two.' }] },
  { id: 's-x72-cheerful', act: 'wave', stage: 2, bands: NOOS, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Encore toi. Je te fais signe, tant pis si le chœur me trouve bête.', en: 'You again. I wave to you, even if the chorus thinks I’m silly.' }] },
  { id: 's-x72-grumpy', act: 'go', stage: 2, bands: NOOS, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Un pic dans le chœur, et c’est encore sur moi que ça tombe.', en: 'A spike in the chorus, and of course it lands on me.' }] },
  { id: 's-x72-enfant', stage: 2, bands: NOOS, when: { child: true }, lines: [{ who: 'a', fr: 'Je l’ai senti deux fois. Je ne l’ai pas encore dit à maman.', en: 'I felt it twice. I haven’t told Mum yet.' }] },
  { id: 's-x72-enfant-nom', stage: 2, bands: NOOS, when: { child: true }, lines: [{ who: 'a', fr: 'C’est {nom}. Ils en parlent à l’école.', en: 'It’s {nom}. They talk about it at school.' }] },
  { id: 's-x72-enfant-parent', act: 'parent', stage: 2, bands: NOOS, when: { child: true }, lines: [{ who: 'a', fr: 'Je cours le dire à maman, tout de suite.', en: 'I’m running to tell Mum, right now.' }] },
  // ── 3. Ça suffit ──
  { id: 's-x73-coupe', adult: true, stage: 3, bands: NOOS, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre, et je me coupe du chœur pour aujourd’hui.', en: 'That’s enough. I’m going home, and cutting myself off from the chorus for today.' }] },
  { id: 's-x73-dormir', stage: 3, bands: NOOS, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre dormir, on verra demain.', en: 'That’s enough. I’m going home to sleep. We’ll see tomorrow.' }] },
  { id: 's-x73-grumpy', stage: 3, bands: NOOS, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre, je ne suis pas un appareil de mesure.', en: 'That’s enough. I’m going home; I’m not a measuring device.' }] },
  { id: 's-x73-pious', act: 'go', stage: 3, bands: NOOS, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai compris. Je garderai ça pour moi, pas pour le chœur.', en: 'That’s enough, I get it. I’ll keep this for myself, not for the chorus.' }] },
  { id: 's-x73-curious', stage: 3, bands: NOOS, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Je rentre, tout est dans le chœur, je relirai.', en: 'That’s enough for today. I’m going home; it’s all in the chorus, I’ll go over it again.' }] },
  { id: 's-x73-enfant', act: 'parent', stage: 3, bands: NOOS, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai la tête qui tourne. Je veux maman.', en: 'That’s enough, my head’s spinning. I want Mum.' }] },
  { id: 's-x73-reprendre', act: 'go', stage: 3, bands: NOOS, lines: [{ who: 'a', fr: 'Ça suffit. Je retourne à ma journée.', en: 'That’s enough. Back to my day.' }] },

  // ══ STELLAIRE : la machinerie de la sphère ════════════════════════════════════
  // ── 1. La surprise ──
  { id: 's-x81-vent', sign: 'wind', stage: 1, bands: ETOILES, lines: [{ who: 'a', fr: 'Un souffle sur moi seul. Dans la sphère, l’air ne bouge que quand on le décide.', en: 'A breath of air on me alone. In the sphere, the air only moves when someone decides it should.' }] },
  { id: 's-x81-vent-dos', sign: 'wind', stage: 1, bands: ETOILES, lines: [{ who: 'a', fr: 'Ça m’a poussé dans le dos, une seule fois. Il n’y a jamais eu de vent ici.', en: 'Something pushed me in the back, just once. There has never been wind here.' }] },
  { id: 's-x81-jour', sign: 'light', stage: 1, bands: ETOILES, when: { night: false }, lines: [{ who: 'a', fr: 'Le soleil m’est arrivé dessus en direct, sans passer par les voiles.', en: 'The sunlight hit me straight on, without going through the sails.' }] },
  { id: 's-x81-nuit', sign: 'light', stage: 1, bands: ETOILES, when: { night: true }, lines: [{ who: 'a', fr: 'De la lumière sur moi, à l’heure où les voiles sont fermées.', en: 'Light on me, at the hour when the sails are closed.' }] },
  { id: 's-x81-quoi', stage: 1, bands: ETOILES, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Les capteurs du quartier n’ont rien dit.', en: 'What was that? The district sensors didn’t say a thing.' }] },
  { id: 's-x81-superstitious', act: 'back', stage: 1, bands: ETOILES, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Je recule. Les anciens de la navette disaient que ça arrive avant un départ. Je ne pars pas.', en: 'I back away. The old hands on the shuttle used to say it happens before a departure. I’m not leaving.' }] },
  { id: 's-x81-cautious', act: 'back', stage: 1, bands: ETOILES, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Je recule jusqu’au garde-fou et je regarde.', en: 'I back up to the railing and watch.' }] },
  { id: 's-x81-pious', stage: 1, bands: ETOILES, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Une prière de plus ce soir. Pour ça, et pour mon frère sur la navette du sud.', en: 'An extra prayer tonight. For this, and for my brother on the southern shuttle.' }] },
  { id: 's-x81-curious', act: 'search', stage: 1, bands: ETOILES, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? Je note l’heure, à la seconde.', en: 'Again? I’m noting the time, to the second.' }] },
  { id: 's-x81-cheerful', act: 'wave', stage: 1, bands: ETOILES, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Je fais signe vers les voiles. Si c’est quelqu’un, bonjour.', en: 'I wave towards the sails. If it’s someone, hello.' }] },
  { id: 's-x81-grumpy', act: 'go', stage: 1, bands: ETOILES, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Le régulateur de climat fait encore des siennes. Trois ans qu’on le signale.', en: 'The climate regulator’s playing up again. We’ve been reporting it for three years.' }] },
  { id: 's-x81-enfant', stage: 1, bands: ETOILES, when: { child: true }, lines: [{ who: 'a', fr: 'Je le dirai à {gamine}. Elle dira que j’invente.', en: 'I’ll tell {gamine}. She’ll say I’m making it up.' }] },
  { id: 's-x81-enfant-moi', stage: 1, bands: ETOILES, when: { child: true }, lines: [{ who: 'a', fr: 'Il s’est passé quelque chose, et c’était sur moi.', en: 'Something happened, and it was on me.' }] },
  { id: 's-x81-enfant-signe', act: 'wave', stage: 1, bands: ETOILES, when: { child: true }, lines: [{ who: 'a', fr: 'Je fais signe vers le haut, là où il y a les voiles.', en: 'I wave up high, where the sails are.' }] },
  // ── 2. L'explication : la sphère ──
  { id: 's-x82-vent', sign: 'wind', stage: 2, bands: ETOILES, lines: [{ who: 'a', fr: 'Une erreur du régulateur d’air. C’est rare, mais ça arrive.', en: 'An air regulator error. It’s rare, but it happens.' }] },
  { id: 's-x82-lumiere', sign: 'light', stage: 2, bands: ETOILES, lines: [{ who: 'a', fr: 'Une voile qui a tourné trop tôt. Le conseil enverra quelqu’un.', en: 'A sail that turned too early. The council will send someone.' }] },
  { id: 's-x82-conseil', stage: 2, bands: ETOILES, lines: [{ who: 'a', fr: 'Deux fois sur moi, et sur personne d’autre. J’écrirai au conseil.', en: 'Twice on me, and on nobody else. I’ll write to the council.' }] },
  { id: 's-x82-pious', stage: 2, bands: ETOILES, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Quelqu’un s’occupe de moi, d’aussi loin que les étoiles. Ce soir je dirai merci.', en: 'Someone is looking after me, from as far off as the stars. Tonight I’ll say thank you.' }] },
  { id: 's-x82-pious-nom', act: 'pray', sign: NOT_LIGHT, stage: 2, bands: ETOILES, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'C’est {nom}. Je vais au culte lui dire merci, à voix haute.', en: 'It’s {nom}. I’m going to the service to say thank you, out loud.' }] },
  { id: 's-x82-pious-genoux', act: 'kneel', sign: 'light', stage: 2, bands: ETOILES, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Deux fois sur moi. Je m’agenouille, ici, sous les voiles.', en: 'Twice on me. I kneel, here, under the sails.' }] },
  { id: 's-x82-superstitious', act: 'flee', stage: 2, bands: ETOILES, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Mon père a vu ça avant l’accident de la navette de quarante. Je rentre, et je reste à quai.', en: 'My father saw this before the shuttle accident in forty. I’m going home, and staying on the dock.' }] },
  { id: 's-x82-cautious', act: 'flee', stage: 2, bands: ETOILES, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Deux fois. Je rentre, et j’écrirai au conseil de chez moi.', en: 'Twice. I’m going home, and I’ll write to the council from there.' }] },
  { id: 's-x82-curious', act: 'search', stage: 2, bands: ETOILES, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois et j’ai ma mesure. Je reste ici jusqu’au soir s’il le faut.', en: 'Once more and I’ll have my reading. I’ll stay here till evening if I have to.' }] },
  { id: 's-x82-cheerful', act: 'wave', stage: 2, bands: ETOILES, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Encore. Je te fais signe, au cas où tu regarderais vraiment.', en: 'Again. I wave to you, in case you really are watching.' }] },
  { id: 's-x82-grumpy', act: 'go', stage: 2, bands: ETOILES, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Avec ce que coûte la sphère, on devrait au moins ne pas avoir de courants d’air.', en: 'With what the sphere costs, we should at least not get draughts.' }] },
  { id: 's-x82-enfant', stage: 2, bands: ETOILES, when: { child: true }, lines: [{ who: 'a', m: 'C’est {nom}, j’en suis sûr.', f: 'C’est {nom}, j’en suis sûre.', en: 'It’s {nom}, I’m sure of it.' }] },
  { id: 's-x82-enfant-deux', stage: 2, bands: ETOILES, when: { child: true }, lines: [{ who: 'a', fr: 'Je l’ai vu deux fois. Personne n’était là pour voir.', en: 'I saw it twice. Nobody was there to see.' }] },
  { id: 's-x82-enfant-parent', act: 'parent', stage: 2, bands: ETOILES, when: { child: true }, lines: [{ who: 'a', fr: 'Je cours chercher maman.', en: 'I’m running to get Mum.' }] },
  // ── 3. Ça suffit ──
  { id: 's-x83-voiles', stage: 3, bands: ETOILES, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre avant qu’on ferme les voiles.', en: 'That’s enough. I’m going home before they close the sails.' }] },
  { id: 's-x83-conseil', stage: 3, bands: ETOILES, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre écrire au conseil, et j’arrête d’y penser.', en: 'That’s enough. I’m going home to write to the council, and then I’ll stop thinking about it.' }] },
  { id: 's-x83-grumpy', stage: 3, bands: ETOILES, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. Va jouer ailleurs, moi je rentre.', en: 'That’s enough. Go and play somewhere else; I’m going home.' }] },
  { id: 's-x83-pious', act: 'go', stage: 3, bands: ETOILES, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai compris. Je n’en parlerai à personne.', en: 'That’s enough, I get it. I won’t tell anyone.' }] },
  { id: 's-x83-pious-chaise', stage: 3, bands: ETOILES, when: { trait: 'pious', article: ['p9_paix_table'] }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai compris. Je rentre, et ta chaise restera vide, c’est promis.', en: 'That’s enough, I get it. I’m going home, and your chair will stay empty, I promise.' }] },
  { id: 's-x83-curious', stage: 3, bands: ETOILES, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Trois mesures, c’est déjà beaucoup. Je rentre.', en: 'That’s enough for today. Three readings is plenty. I’m going home.' }] },
  { id: 's-x83-enfant', act: 'parent', stage: 3, bands: ETOILES, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, je vais chercher maman.', en: 'That’s enough, I’m going to get Mum.' }] },
  { id: 's-x83-reprendre', act: 'go', stage: 3, bands: ETOILES, lines: [{ who: 'a', fr: 'Ça suffit. Je reprends ma route.', en: 'That’s enough. I’m going on my way.' }] },

  // ══ DÉMIURGE : toi ════════════════════════════════════════════════════════════
  // On s'y tutoie, entre égaux (§ 7.3).
  // ── 1. La surprise ──
  { id: 's-x91-vent', sign: 'wind', stage: 1, bands: DEMIURGE, lines: [{ who: 'a', fr: 'Un souffle sur moi seul. Ici, l’air ne bouge que si quelqu’un touche à une constante.', en: 'A breath of air on me alone. Here, the air only moves if somebody touches a constant.' }] },
  { id: 's-x91-vent-nulle-part', sign: 'wind', stage: 1, bands: DEMIURGE, lines: [{ who: 'a', fr: 'Le vent est venu de nulle part, sur moi, et il est reparti.', en: 'The wind came from nowhere, onto me, and left again.' }] },
  { id: 's-x91-jour', sign: 'light', stage: 1, bands: DEMIURGE, when: { night: false }, lines: [{ who: 'a', fr: 'La lumière a changé d’un cran sur moi, et seulement sur moi.', en: 'The light shifted one notch on me, and only on me.' }] },
  { id: 's-x91-nuit', sign: 'light', stage: 1, bands: DEMIURGE, when: { night: true }, lines: [{ who: 'a', fr: 'De la lumière sur moi, en pleine nuit, et sans source.', en: 'Light on me, in the middle of the night, with no source.' }] },
  { id: 's-x91-quoi', stage: 1, bands: DEMIURGE, lines: [{ who: 'a', fr: 'Tiens. Quelqu’un s’intéresse à moi.', en: 'Well. Somebody’s interested in me.' }] },
  { id: 's-x91-superstitious', act: 'back', stage: 1, bands: DEMIURGE, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Je recule. Je n’aime pas qu’on touche aux constantes près de moi.', en: 'I back away. I don’t like people touching the constants near me.' }] },
  { id: 's-x91-cautious', act: 'back', stage: 1, bands: DEMIURGE, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Je recule d’un pas. Avec toi, on ne sait jamais.', en: 'I take a step back. With you, you never know.' }] },
  { id: 's-x91-pious', stage: 1, bands: DEMIURGE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Tu es là.', en: 'You’re here.' }] },
  { id: 's-x91-curious', act: 'search', stage: 1, bands: DEMIURGE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? J’aimerais voir comment tu fais.', en: 'Again? I’d like to see how you do it.' }] },
  { id: 's-x91-cheerful', act: 'wave', stage: 1, bands: DEMIURGE, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Je te fais signe. Entre égaux, ça se fait.', en: 'I wave to you. Between equals, that’s what you do.' }] },
  { id: 's-x91-grumpy', stage: 1, bands: DEMIURGE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Si c’est toi, dis-le.', en: 'If it’s you, say so.' }] },
  { id: 's-x91-enfant', stage: 1, bands: DEMIURGE, when: { child: true }, lines: [{ who: 'a', fr: 'Il y a quelqu’un. Je le sens.', en: 'There’s someone here. I can feel it.' }] },
  { id: 's-x91-enfant-signe', act: 'wave', stage: 1, bands: DEMIURGE, when: { child: true }, lines: [{ who: 'a', fr: 'Je te fais signe. Tu me vois ?', en: 'I’m waving to you. Can you see me?' }] },
  // ── 2. L'explication : toi ──
  { id: 's-x92-vent', sign: 'wind', stage: 2, bands: DEMIURGE, lines: [{ who: 'a', fr: 'C’est toi. Tu fais ça quand tu passes près de quelqu’un.', en: 'It’s you. You do that when you pass close to someone.' }] },
  { id: 's-x92-lumiere', sign: 'light', stage: 2, bands: DEMIURGE, lines: [{ who: 'a', fr: 'C’est toi, avec ta lumière. Je ne sais pas ce que tu veux.', en: 'It’s you, with your light. I don’t know what you want.' }] },
  { id: 's-x92-deux', stage: 2, bands: DEMIURGE, lines: [{ who: 'a', fr: 'Deux fois. C’est toi, je le sais.', en: 'Twice. It’s you. I know it.' }] },
  { id: 's-x92-pious', stage: 2, bands: DEMIURGE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Tu reviens. Je ne pensais pas que tu reviendrais.', en: 'You’ve come back. I didn’t think you would.' }] },
  { id: 's-x92-pious-nom', stage: 2, bands: DEMIURGE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: '{Nom} s’arrête sur moi. Je ne sais pas quoi faire de mes mains.', en: '{Nom} has stopped on me. I don’t know what to do with my hands.' }] },
  { id: 's-x92-pious-genoux', act: 'kneel', sign: 'light', stage: 2, bands: DEMIURGE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Deux fois ta lumière. Je m’agenouille, même si on se tutoie.', en: 'Your light, twice. I kneel, even if we’re on first-name terms.' }] },
  { id: 's-x92-superstitious', act: 'flee', stage: 2, bands: DEMIURGE, when: { trait: 'superstitious' }, lines: [{ who: 'a', m: 'Ne me regarde pas trop. Je rentre, je ne veux pas être remarqué.', f: 'Ne me regarde pas trop. Je rentre, je ne veux pas être remarquée.', en: 'Don’t look at me too long. I’m going home; I don’t want to be noticed.' }] },
  { id: 's-x92-cautious', act: 'flee', stage: 2, bands: DEMIURGE, when: { trait: 'cautious' }, lines: [{ who: 'a', fr: 'Deux fois. Je préfère rentrer.', en: 'Twice. I’d rather go home.' }] },
  { id: 's-x92-curious', act: 'search', stage: 2, bands: DEMIURGE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois. Je voudrais comprendre comment tu fais, de ton côté.', en: 'Once more. I’d like to understand how you do it, on your side.' }] },
  { id: 's-x92-cheerful', act: 'wave', stage: 2, bands: DEMIURGE, when: { trait: 'cheerful' }, lines: [{ who: 'a', fr: 'Encore. Je te rends ton signe.', en: 'Again. I’m returning your sign.' }] },
  { id: 's-x92-grumpy', act: 'go', stage: 2, bands: DEMIURGE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Tu as mille galaxies, et c’est moi que tu choisis.', en: 'You’ve got a thousand galaxies, and it’s me you pick.' }] },
  { id: 's-x92-enfant', act: 'wave', stage: 2, bands: DEMIURGE, when: { child: true }, lines: [{ who: 'a', fr: 'C’est toi ? Tu reviens demain ?', en: 'Is that you? Will you come back tomorrow?' }] },
  { id: 's-x92-enfant-parent', act: 'parent', stage: 2, bands: DEMIURGE, when: { child: true }, lines: [{ who: 'a', fr: 'Je vais chercher papa, il voudra te voir.', en: 'I’m going to get Dad. He’ll want to see you.' }] },
  // ── 3. Ça suffit ──
  { id: 's-x93-autres', stage: 3, bands: DEMIURGE, lines: [{ who: 'a', fr: 'Ça suffit. Va voir les autres, je rentre.', en: 'That’s enough. Go and see the others; I’m going home.' }] },
  { id: 's-x93-compris', stage: 3, bands: DEMIURGE, lines: [{ who: 'a', fr: 'Ça suffit. J’ai compris que tu étais là. Je rentre.', en: 'That’s enough. I understand you’re here. I’m going home.' }] },
  { id: 's-x93-grumpy', stage: 3, bands: DEMIURGE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre, je ne suis pas une constante.', en: 'That’s enough. I’m going home; I’m not a constant.' }] },
  { id: 's-x93-pious', act: 'go', stage: 3, bands: DEMIURGE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit. Je garde ça pour moi.', en: 'That’s enough. I’ll keep this to myself.' }] },
  { id: 's-x93-curious', act: 'go', stage: 3, bands: DEMIURGE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Reviens à la même heure, je serai là.', en: 'That’s enough for today. Come back at the same time; I’ll be here.' }] },
  { id: 's-x93-enfant', stage: 3, bands: DEMIURGE, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai sommeil. Je rentre.', en: 'That’s enough, I’m sleepy. I’m going home.' }] },
  { id: 's-x93-reprendre', act: 'go', stage: 3, bands: DEMIURGE, lines: [{ who: 'a', fr: 'Ça suffit. Je continue, fais ce que tu veux.', en: 'That’s enough. I’m carrying on; do as you like.' }] },
];

// ══ LE TACITURNE : il regarde, et ne dit rien ════════════════════════════════════
// Un mot, celui de la chose. Les mêmes à tous les âges, écrits deux fois (la plume ne
// laisse aucune réplique valoir du Feu au Démiurge). À la troisième fois, il repart sans
// un mot.
const QUIET = [
  { key: 'vent', sign: 'wind', stage: 1, lines: [{ who: 'a', fr: 'Du vent.', en: 'Wind.' }] },
  { key: 'soleil', sign: 'light', stage: 1, when: { night: false }, lines: [{ who: 'a', fr: 'Du soleil.', en: 'Sun.' }] },
  { key: 'lune', sign: 'light', stage: 1, when: { night: true }, lines: [{ who: 'a', fr: 'La lune.', en: 'The moon.' }] },
  { key: 'feu', sign: 'fire', stage: 1, lines: [{ who: 'a', fr: 'Le feu.', en: 'The fire.' }] },
  { key: 'bete', sign: 'beast', stage: 1, lines: [{ who: 'a', fr: '{Bete}.', en: '{Bete}.' }] },
  { key: 'encore', stage: 2, lines: [{ who: 'a', fr: 'Encore.', en: 'Again.' }] },
  { key: 'assez', act: 'go', stage: 3, lines: [{ who: 'a', fr: 'Ça suffit.', en: 'That’s enough.' }] },
];
for (const [k, bands] of [['a', [0, 4]], ['b', [5, 9]]]) {
  for (const q of QUIET) {
    SIGNES.push({ id: `s-q${k}-${q.key}`, sign: q.sign, stage: q.stage, ...(q.act ? { act: q.act } : {}), bands, when: { ...(q.when || {}), trait: 'quiet' }, lines: q.lines });
  }
}

// Toutes de genre 'sign', couche 1 : ce qu'un signe fait penser, pas ce qu'on dit de toi.
// Le geste par défaut : il regarde, puis à la troisième fois il rentre.
export const PAROLES_SIGNES = SIGNES.map((e) => ({ kind: 'sign', layer: 1, when: {}, act: e.stage >= 3 ? 'home' : 'look', ...e }));
