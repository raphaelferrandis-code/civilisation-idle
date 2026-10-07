"use strict";

// LES SIGNES — ce qu'un passant pense du signe qu'on lui fait (docs/PLAN-ECOUTER-PARLER.md,
// lot 4).
//
// Données pures, sur le modèle de paroles.js et tenues par la même plume (sa charte est
// en tête de paroles.js). Une entrée est une PENSÉE, celle du passant qui vient de le
// recevoir :
//   sign   'wind' (le souffle de vent), 'light' (la lumière plus forte sur lui), 'fire'
//          (le feu le plus proche qui monte), 'beast' (une bête qui s'arrête et le fixe) ;
//          absent : n'importe lequel.
//   stage  la fois : 1 la surprise, 2 une explication, 3 « Ça suffit. » (§ 5.3). Après la
//          troisième, il ne se prête plus au jeu (paroles/signs.js).
//   bands  son monde, comme partout (cinq âges au plus) ; la lecture change avec lui : au
//          Feu un esprit, au Bourg un présage, au Marbre un dieu, à la Fonte un courant
//          d'air, au Néon une panne, à la Noosphère le chœur, au Stellaire la machinerie
//          de la sphère, au Démiurge toi.
//   when   les conditions de paroles.js (trait, child, night, article…), et `beast` : les
//          bêtes qui conviennent ('dog', 'cat', 'goat', 'sheep', 'cow').
// Le caractère fait la lecture : ce qui est écrit pour SON caractère (ou pour un enfant)
// passe d'abord ; le taciturne regarde et ne dit rien, il n'a que ses mots à lui (pick.js).
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

const SIGNES = [
  // ══ FEU ET BOIS : un esprit ═══════════════════════════════════════════════════
  // ── 1. La surprise ──
  { id: 's-f1-vent', sign: 'wind', stage: 1, bands: FEU, lines: [{ who: 'a', fr: 'Un coup de vent, sur moi seul. Les herbes à côté n’ont pas bougé.', en: 'A gust of wind, on me alone. The grass beside me didn’t move.' }] },
  { id: 's-f1-vent-dos', sign: 'wind', stage: 1, bands: FEU, lines: [{ who: 'a', fr: 'Le vent m’a pris dans le dos, et plus rien. Il n’y a pas de vent aujourd’hui.', en: 'The wind caught me from behind, then nothing. There’s no wind today.' }] },
  { id: 's-f1-soleil', sign: 'light', stage: 1, bands: FEU, when: { night: false }, lines: [{ who: 'a', fr: 'Le soleil m’est tombé dessus par un trou dans les nuages, et seulement sur moi.', en: 'The sun fell on me through a gap in the clouds, and only on me.' }] },
  { id: 's-f1-lune', sign: 'light', stage: 1, bands: FEU, when: { night: true }, lines: [{ who: 'a', m: 'La lune s’est montrée et m’a éclairé, moi, pas le chemin.', f: 'La lune s’est montrée et m’a éclairée, moi, pas le chemin.', en: 'The moon came out and lit me up. Me, not the path.' }] },
  { id: 's-f1-feu', sign: 'fire', stage: 1, bands: FEU, lines: [{ who: 'a', fr: 'Le feu a monté d’un coup. Personne n’y a remis de bois.', en: 'The fire shot up all at once. Nobody put more wood on.' }] },
  { id: 's-f1-feu-etincelles', sign: 'fire', stage: 1, bands: FEU, lines: [{ who: 'a', fr: 'Le feu a craché des étincelles jusqu’à hauteur d’homme.', en: 'The fire spat sparks up as high as a man.' }] },
  { id: 's-f1-bete', sign: 'beast', stage: 1, bands: FEU, lines: [{ who: 'a', fr: '{Bete} me regarde. Pas les autres, moi.', en: '{Bete} is looking at me. Not at the others. At me.' }] },
  { id: 's-f1-bete-derriere', sign: 'beast', stage: 1, bands: FEU, lines: [{ who: 'a', m: '{Bete} ne bouge plus et me fixe. Je me suis retourné, il n’y avait personne.', f: '{Bete} ne bouge plus et me fixe. Je me suis retournée, il n’y avait personne.', en: '{Bete} has gone still and is staring at me. I turned round. There was nobody there.' }] },
  { id: 's-f1-bete-chien', sign: 'beast', stage: 1, bands: FEU, lines: [{ who: 'a', fr: 'Le chien de {maitre} s’est couché et me regarde sans bouger.', en: '{maitre}’s dog has lain down and is watching me without moving.' }] },
  { id: 's-f1-quoi', stage: 1, bands: FEU, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Je n’ai rien vu venir.', en: 'What was that? I didn’t see it coming.' }] },
  { id: 's-f1-superstitious', stage: 1, bands: FEU, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'J’ai serré la dent d’ours de mon père. Ça ne me dit rien de bon.', en: 'I gripped my father’s bear tooth. I don’t like the feel of this.' }] },
  { id: 's-f1-pious', stage: 1, bands: FEU, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Grand-mère ? C’est toi ?', en: 'Grandmother? Is that you?' }] },
  { id: 's-f1-curious', stage: 1, bands: FEU, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ?', en: 'Again?' }] },
  { id: 's-f1-grumpy', adult: true, stage: 1, bands: FEU, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Et maintenant ça. J’ai encore trois peaux à gratter.', en: 'And now this. I’ve still got three hides to scrape.' }] },
  { id: 's-f1-enfant', stage: 1, bands: FEU, when: { child: true }, lines: [{ who: 'a', fr: 'Je l’ai vu. Les autres ne vont pas me croire.', en: 'I saw it. The others won’t believe me.' }] },
  { id: 's-f1-enfant-feu', sign: 'fire', stage: 1, bands: FEU, when: { child: true }, lines: [{ who: 'a', fr: 'Le feu a sauté tout seul. Je vais le dire à maman.', en: 'The fire jumped up by itself. I’m going to tell Mum.' }] },
  // ── 2. L'explication : un esprit ──
  { id: 's-f2-vent', sign: 'wind', stage: 2, bands: FEU, lines: [{ who: 'a', fr: 'C’est un esprit qui passe. Ma mère disait qu’ils soufflent sur ceux qu’ils cherchent.', en: 'It’s a spirit going by. My mother used to say they blow on the ones they’re looking for.' }] },
  { id: 's-f2-lumiere', sign: 'light', stage: 2, bands: FEU, lines: [{ who: 'a', fr: 'Un esprit me regarde. Les anciens disent qu’ils voient d’en haut, à travers les nuages.', en: 'A spirit is watching me. The old ones say they look down from above, through the clouds.' }] },
  { id: 's-f2-feu', sign: 'fire', stage: 2, bands: FEU, lines: [{ who: 'a', fr: 'L’esprit du feu est réveillé. Il faudra lui donner de la graisse ce soir.', en: 'The fire spirit is awake. We’ll have to give it some fat tonight.' }] },
  { id: 's-f2-bete', sign: 'beast', stage: 2, bands: FEU, lines: [{ who: 'a', fr: 'Les bêtes voient les esprits. {Bete} en regardait un, juste à côté de moi.', en: 'Animals see spirits. {Bete} was looking at one, right beside me.' }] },
  { id: 's-f2-deux', stage: 2, bands: FEU, lines: [{ who: 'a', fr: 'Deux fois. Un esprit me tourne autour.', en: 'Twice. A spirit is circling me.' }] },
  { id: 's-f2-pious', stage: 2, bands: FEU, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Grand-mère revient. Je lui poserai une noisette sur la pierre ce soir.', en: 'Grandmother’s back. I’ll put a hazelnut on the stone for her tonight.' }] },
  { id: 's-f2-superstitious', stage: 2, bands: FEU, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Un esprit me suit. Cette nuit je dors près du feu, le couteau sous la peau.', en: 'A spirit is following me. Tonight I sleep by the fire with my knife under the hide.' }] },
  { id: 's-f2-curious', stage: 2, bands: FEU, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Si c’est un esprit, il va recommencer. Je ne bouge pas d’ici.', en: 'If it’s a spirit, it’ll do it again. I’m not moving from here.' }] },
  { id: 's-f2-grumpy', stage: 2, bands: FEU, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Un esprit, maintenant. Comme si les loups ne suffisaient pas.', en: 'A spirit, now. As if the wolves weren’t enough.' }] },
  { id: 's-f2-enfant', stage: 2, bands: FEU, when: { child: true }, lines: [{ who: 'a', m: 'C’est un esprit. Il m’a choisi, moi.', f: 'C’est un esprit. Il m’a choisie, moi.', en: 'It’s a spirit. It chose me.' }] },
  // ── 3. Ça suffit ──
  { id: 's-f3-chaman', stage: 3, bands: FEU, lines: [{ who: 'a', fr: 'Ça suffit. Je vais voir le chaman.', en: 'That’s enough. I’m going to see the shaman.' }] },
  { id: 's-f3-abri', stage: 3, bands: FEU, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre sous l’abri.', en: 'That’s enough. I’m going back under the shelter.' }] },
  { id: 's-f3-grumpy', stage: 3, bands: FEU, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. Laisse-moi tranquille.', en: 'That’s enough. Leave me alone.' }] },
  { id: 's-f3-pious', stage: 3, bands: FEU, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit, grand-mère. J’irai repasser l’ocre sur les pierres.', en: 'That’s enough, Grandmother. I’ll go and put fresh ochre on the stones.' }] },
  { id: 's-f3-curious', stage: 3, bands: FEU, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Je reviendrai demain, à la même heure.', en: 'That’s enough for today. I’ll come back tomorrow at the same time.' }] },
  { id: 's-f3-enfant', stage: 3, bands: FEU, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai peur maintenant.', en: 'That’s enough, I’m scared now.' }] },

  // ══ PIERRE TAILLÉE ET COURONNE : un présage ═══════════════════════════════════
  // ── 1. La surprise ──
  { id: 's-b1-vent-linge', sign: 'wind', stage: 1, bands: BOURG, lines: [{ who: 'a', fr: 'Un coup de vent dans la rue, et sur moi seul. Le linge de {voisine} pendait sans bouger.', en: 'A gust down the street, and only on me. {voisine}’s washing hung there without moving.' }] },
  { id: 's-b1-vent-col', sign: 'wind', stage: 1, bands: BOURG, lines: [{ who: 'a', fr: 'Le vent m’a pris par le col, puis plus rien. Même la paille du chemin n’a pas bougé.', en: 'The wind took me by the collar, then nothing. Even the straw on the path didn’t stir.' }] },
  { id: 's-b1-soleil', sign: 'light', stage: 1, bands: BOURG, when: { night: false }, lines: [{ who: 'a', fr: 'Le soleil a percé juste au-dessus de moi. J’avais chaud comme à midi.', en: 'The sun broke through right above me. I was as warm as at noon.' }] },
  { id: 's-b1-lune', sign: 'light', stage: 1, bands: BOURG, when: { night: true }, lines: [{ who: 'a', fr: 'La lune s’est montrée juste au-dessus de moi. Le reste de la rue est resté noir.', en: 'The moon came out right above me. The rest of the street stayed dark.' }] },
  { id: 's-b1-feu', sign: 'fire', stage: 1, bands: BOURG, lines: [{ who: 'a', fr: 'Le feu a monté d’un coup, et il n’y avait pas un souffle.', en: 'The fire leapt up all at once, and there wasn’t a breath of wind.' }] },
  { id: 's-b1-feu-fagot', sign: 'fire', stage: 1, bands: BOURG, lines: [{ who: 'a', fr: 'Les flammes ont doublé, sans un fagot de plus.', en: 'The flames doubled, without one more bundle of sticks.' }] },
  { id: 's-b1-bete', sign: 'beast', stage: 1, bands: BOURG, lines: [{ who: 'a', fr: '{Bete} me regarde comme on regarde un étranger.', en: '{Bete} is looking at me the way you look at a stranger.' }] },
  { id: 's-b1-bete-brouter', sign: 'beast', stage: 1, bands: BOURG, when: { beast: HERD }, lines: [{ who: 'a', fr: '{Bete} a arrêté de brouter pour me regarder.', en: '{Bete} has stopped grazing to look at me.' }] },
  { id: 's-b1-bete-chien', sign: 'beast', stage: 1, bands: BOURG, lines: [{ who: 'a', fr: 'Le chien de {maitre} s’est assis au milieu de la rue, et c’est moi qu’il regarde.', en: '{maitre}’s dog has sat down in the middle of the street, and it’s me it’s looking at.' }] },
  { id: 's-b1-quoi', stage: 1, bands: BOURG, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Je n’ai jamais vu ça dans cette rue.', en: 'What was that? I’ve never seen that in this street.' }] },
  { id: 's-b1-superstitious', stage: 1, bands: BOURG, when: { trait: 'superstitious' }, lines: [{ who: 'a', m: 'Je suis sorti du pied gauche ce matin, je le savais. Je ne passe pas devant le puits ce soir.', f: 'Je suis sortie du pied gauche ce matin, je le savais. Je ne passe pas devant le puits ce soir.', en: 'I got up on the wrong foot this morning, I knew it. I’m not going past the well tonight.' }] },
  { id: 's-b1-pious', stage: 1, bands: BOURG, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Trois prières ce soir au lieu d’une.', en: 'Three prayers tonight instead of one.' }] },
  { id: 's-b1-curious', stage: 1, bands: BOURG, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? Je veux voir d’où ça vient.', en: 'Again? I want to see where it comes from.' }] },
  { id: 's-b1-grumpy', adult: true, stage: 1, bands: BOURG, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Il ne manquait plus que ça, avec le grain à porter au moulin.', en: 'That’s all I needed, with the grain still to take to the mill.' }] },
  { id: 's-b1-enfant', stage: 1, bands: BOURG, when: { child: true }, lines: [{ who: 'a', fr: 'Je vais le raconter à {gamin}. Il ne me croira jamais.', en: 'I’m going to tell {gamin}. He’ll never believe me.' }] },
  { id: 's-b1-enfant-seul', stage: 1, bands: BOURG, when: { child: true }, lines: [{ who: 'a', fr: 'Je l’ai vu, et personne d’autre.', en: 'I saw it, and nobody else did.' }] },
  // ── 2. L'explication : un présage ──
  { id: 's-b2-vent', sign: 'wind', stage: 2, bands: BOURG, lines: [{ who: 'a', fr: 'Un vent qui ne souffle que sur une seule personne, c’est un présage. Ma grand-mère en parlait.', en: 'Wind that blows on one person only is an omen. My grandmother used to talk about it.' }] },
  { id: 's-b2-lumiere', adult: true, sign: 'light', stage: 2, bands: BOURG, lines: [{ who: 'a', fr: 'La lumière sur moi, c’est un présage. La récolte, peut-être.', en: 'Light on me, that’s an omen. The harvest, maybe.' }] },
  { id: 's-b2-feu', sign: 'fire', stage: 2, bands: BOURG, lines: [{ who: 'a', fr: 'Un feu qui monte sans raison, ma mère disait que c’est quelqu’un qui pense à nous.', en: 'A fire that rises for no reason, my mother said that’s someone thinking of us.' }] },
  { id: 's-b2-bete', sign: 'beast', stage: 2, bands: BOURG, lines: [{ who: 'a', fr: 'Les bêtes sentent les présages avant nous. {Bete} le savait avant moi.', en: 'Animals feel omens before we do. {Bete} knew before I did.' }] },
  { id: 's-b2-pretre', stage: 2, bands: BOURG, lines: [{ who: 'a', fr: 'Deux fois. Il faudra demander au prêtre ce que ça veut dire.', en: 'Twice. I’ll have to ask the priest what it means.' }] },
  { id: 's-b2-pious', stage: 2, bands: BOURG, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Les ancêtres me parlent. Je porterai une miche au culte demain matin.', en: 'The ancestors are speaking to me. I’ll take a loaf to the cult tomorrow morning.' }] },
  { id: 's-b2-superstitious', stage: 2, bands: BOURG, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Un présage, et pour moi. Je ne sors plus jusqu’à la nouvelle lune.', en: 'An omen, and for me. I’m not going out again till the new moon.' }] },
  { id: 's-b2-curious', stage: 2, bands: BOURG, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Si je reste là, ça recommencera peut-être. Je compte jusqu’à cent.', en: 'If I stay here, maybe it’ll happen again. I’ll count to a hundred.' }] },
  { id: 's-b2-grumpy', stage: 2, bands: BOURG, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Un présage. Le dernier, c’était la grêle sur l’orge.', en: 'An omen. The last one was hail on the barley.' }] },
  { id: 's-b2-enfant', stage: 2, bands: BOURG, when: { child: true }, lines: [{ who: 'a', fr: 'C’est un présage, je le sais. Je ne l’ai dit à personne.', en: 'It’s an omen, I know it is. I haven’t told anyone.' }] },
  // ── 3. Ça suffit ──
  { id: 's-b3-volet', stage: 3, bands: BOURG, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre, et je ferme le volet.', en: 'That’s enough. I’m going home and shutting the shutter.' }] },
  { id: 's-b3-pretre', stage: 3, bands: BOURG, lines: [{ who: 'a', fr: 'Ça suffit. J’irai voir le prêtre demain.', en: 'That’s enough. I’ll go and see the priest tomorrow.' }] },
  { id: 's-b3-grumpy', adult: true, stage: 3, bands: BOURG, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. J’ai du travail, moi.', en: 'That’s enough. Some of us have work to do.' }] },
  { id: 's-b3-pious', stage: 3, bands: BOURG, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit. Je ferai l’offrande, c’est promis.', en: 'That’s enough. I’ll make the offering, I promise.' }] },
  { id: 's-b3-curious', stage: 3, bands: BOURG, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Demain je reviens avec {voisin}.', en: 'That’s enough for today. Tomorrow I’ll come back with {voisin}.' }] },
  { id: 's-b3-curious-compte', stage: 3, bands: BOURG, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. J’ai compté trois fois, c’est assez.', en: 'That’s enough for today. I counted three times; that’ll do.' }] },
  { id: 's-b3-enfant', stage: 3, bands: BOURG, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, je rentre voir maman.', en: 'That’s enough, I’m going home to Mum.' }] },

  // ══ MARBRE : un dieu ══════════════════════════════════════════════════════════
  // ── 1. La surprise ──
  { id: 's-m1-vent', sign: 'wind', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: 'Un coup de vent sur moi seul. À deux pas, la poussière ne bougeait pas.', en: 'A gust on me alone. Two steps away, the dust didn’t stir.' }] },
  { id: 's-m1-vent-face', sign: 'wind', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: 'Le vent m’a pris de face et m’a lâché d’un coup. Il fait pourtant lourd aujourd’hui.', en: 'The wind hit me head on and let go all at once. And it’s close today.' }] },
  { id: 's-m1-soleil', sign: 'light', stage: 1, bands: MARBRE, when: { night: false }, lines: [{ who: 'a', fr: 'Un rayon de soleil sur moi, comme sur une statue du forum.', en: 'A ray of sun on me, like on a statue in the forum.' }] },
  { id: 's-m1-lune', sign: 'light', stage: 1, bands: MARBRE, when: { night: true }, lines: [{ who: 'a', fr: 'La lune sur moi seul, et pas sur les colonnes.', en: 'The moon on me alone, and not on the columns.' }] },
  { id: 's-m1-feu', sign: 'fire', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: 'Le feu a monté d’un coup, comme quand on y jette de l’huile.', en: 'The fire shot up, like when you throw oil on it.' }] },
  { id: 's-m1-feu-coudee', sign: 'fire', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: 'Les flammes ont grandi d’une coudée. Personne n’a touché au bois.', en: 'The flames grew a cubit. Nobody touched the wood.' }] },
  { id: 's-m1-bete', sign: 'beast', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: '{Bete} me regarde comme si je lui devais quelque chose.', en: '{Bete} is looking at me as if I owed it something.' }] },
  { id: 's-m1-bete-derriere', sign: 'beast', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: '{Bete} s’arrête et me fixe. Je regarde derrière moi : personne.', en: '{Bete} stops and stares at me. I look behind me. Nobody.' }] },
  { id: 's-m1-bete-brouter', sign: 'beast', stage: 1, bands: MARBRE, when: { beast: HERD }, lines: [{ who: 'a', fr: '{Bete} a cessé de brouter et me regarde.', en: '{Bete} has stopped grazing and is looking at me.' }] },
  { id: 's-m1-quoi', stage: 1, bands: MARBRE, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Personne d’autre n’a l’air d’avoir vu.', en: 'What was that? Nobody else seems to have seen it.' }] },
  { id: 's-m1-superstitious', stage: 1, bands: MARBRE, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Le mauvais œil. Je ressortirai l’amulette de ma mère.', en: 'The evil eye. I’ll get my mother’s amulet out again.' }] },
  { id: 's-m1-pious', stage: 1, bands: MARBRE, when: { trait: 'pious' }, lines: [{ who: 'a', m: 'Un dieu m’a vu. Ce soir je laisserai une offrande, une vraie.', f: 'Un dieu m’a vue. Ce soir je laisserai une offrande, une vraie.', en: 'A god has seen me. Tonight I’ll leave an offering, a proper one.' }] },
  { id: 's-m1-curious', stage: 1, bands: MARBRE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? Cette fois je regarde mieux.', en: 'Again? This time I’ll watch properly.' }] },
  { id: 's-m1-grumpy', adult: true, stage: 1, bands: MARBRE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Il ne manquait plus que ça, avec le loyer de l’insula à payer aux calendes.', en: 'That’s all I needed, with the insula rent due at the calends.' }] },
  { id: 's-m1-enfant', stage: 1, bands: MARBRE, when: { child: true }, lines: [{ who: 'a', fr: 'Je le dirai au maître d’école. Lui, il saura.', en: 'I’ll tell the schoolmaster. He’ll know.' }] },
  // ── 2. L'explication : un dieu ──
  { id: 's-m2-vent', sign: 'wind', stage: 2, bands: MARBRE, lines: [{ who: 'a', fr: 'C’est un dieu qui passe. Il a soufflé pour que je le remarque.', en: 'It’s a god going by. He blew so I’d notice him.' }] },
  { id: 's-m2-lumiere', sign: 'light', stage: 2, bands: MARBRE, lines: [{ who: 'a', fr: 'Un dieu m’a pris dans sa lumière. Je ne sais pas encore lequel.', en: 'A god has caught me in his light. I don’t know which one yet.' }] },
  { id: 's-m2-feu', sign: 'fire', stage: 2, bands: MARBRE, lines: [{ who: 'a', fr: 'Un feu ne monte pas tout seul. Un dieu a voulu que je le voie.', en: 'A fire doesn’t rise by itself. A god wanted me to see it.' }] },
  { id: 's-m2-bete', sign: 'beast', stage: 2, bands: MARBRE, lines: [{ who: 'a', m: 'Les augures lisent les bêtes. {Bete} m’a regardé, ça veut dire quelque chose.', f: 'Les augures lisent les bêtes. {Bete} m’a regardée, ça veut dire quelque chose.', en: 'The augurs read animals. {Bete} looked at me; that means something.' }] },
  { id: 's-m2-augures', stage: 2, bands: MARBRE, lines: [{ who: 'a', fr: 'Deux fois de suite. J’irai demander aux augures.', en: 'Twice running. I’ll go and ask the augurs.' }] },
  { id: 's-m2-pious', adult: true, stage: 2, bands: MARBRE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Un dieu s’occupe de moi. Une colombe au temple demain, avant le travail.', en: 'A god is looking after me. A dove at the temple tomorrow, before work.' }] },
  { id: 's-m2-pious-nom', stage: 2, bands: MARBRE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'C’est {nom}. J’irai au temple demain, avant le jour.', en: 'It’s {nom}. I’ll go to the temple tomorrow, before daybreak.' }] },
  { id: 's-m2-superstitious', stage: 2, bands: MARBRE, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Un dieu en colère. J’ai dû oublier une offrande, mais laquelle ?', en: 'An angry god. I must have forgotten an offering, but which?' }] },
  { id: 's-m2-curious', stage: 2, bands: MARBRE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Si c’est un dieu, je veux savoir lequel. Encore une fois et je saurai.', en: 'If it’s a god, I want to know which one. Once more and I’ll know.' }] },
  { id: 's-m2-grumpy', stage: 2, bands: MARBRE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Un dieu qui n’a rien de mieux à faire. Les thermes sont froids depuis une semaine, il pourrait s’en occuper.', en: 'A god with nothing better to do. The baths have been cold for a week; he could see to that.' }] },
  { id: 's-m2-enfant', stage: 2, bands: MARBRE, when: { child: true }, lines: [{ who: 'a', m: 'C’est un dieu. Il m’a choisi.', f: 'C’est un dieu. Il m’a choisie.', en: 'It’s a god. He chose me.' }] },
  // ── 3. Ça suffit ──
  { id: 's-m3-tanneurs', stage: 3, bands: MARBRE, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre par la rue des tanneurs.', en: 'That’s enough. I’m going home by the tanners’ street.' }] },
  { id: 's-m3-compris', stage: 3, bands: MARBRE, lines: [{ who: 'a', fr: 'Ça suffit. Qui que tu sois, j’ai compris.', en: 'That’s enough. Whoever you are, I get it.' }] },
  { id: 's-m3-grumpy', adult: true, stage: 3, bands: MARBRE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. J’irai me plaindre au magistrat, je ne sais pas encore de qui.', en: 'That’s enough. I’ll go and complain to the magistrate, about whom I don’t know yet.' }] },
  { id: 's-m3-pious', stage: 3, bands: MARBRE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai entendu. L’offrande sera faite ce soir.', en: 'That’s enough, I heard. The offering will be made tonight.' }] },
  { id: 's-m3-curious', stage: 3, bands: MARBRE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. J’écrirai tout ça sur une tablette.', en: 'That’s enough for today. I’ll write all this down on a tablet.' }] },
  { id: 's-m3-enfant', stage: 3, bands: MARBRE, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, ça me fait peur.', en: 'That’s enough, it scares me.' }] },

  // ══ FONTE : un courant d'air ══════════════════════════════════════════════════
  // ── 1. La surprise ──
  { id: 's-u1-vent', sign: 'wind', stage: 1, bands: FONTE, lines: [{ who: 'a', fr: 'Un courant d’air en pleine rue, et sur moi seul. La fumée des cheminées montait droit.', en: 'A draught in the middle of the street, and only on me. The chimney smoke was going straight up.' }] },
  { id: 's-u1-vent-chapeau', sign: 'wind', stage: 1, bands: FONTE, lines: [{ who: 'a', fr: 'Le vent a failli m’arracher mon chapeau. Personne d’autre n’a levé la main.', en: 'The wind nearly took my hat off. Nobody else even put a hand up.' }] },
  { id: 's-u1-soleil', sign: 'light', stage: 1, bands: FONTE, when: { night: false }, lines: [{ who: 'a', fr: 'Le soleil a percé la fumée, juste sur moi. Ça n’arrive jamais par ici.', en: 'The sun broke through the smoke, right on me. That never happens round here.' }] },
  { id: 's-u1-nuit', sign: 'light', stage: 1, bands: FONTE, when: { night: true }, lines: [{ who: 'a', fr: 'Il a fait clair sur moi comme sous un bec de gaz, et il n’y en a pas ici.', en: 'It went as bright on me as under a gas lamp, and there isn’t one here.' }] },
  { id: 's-u1-feu', sign: 'fire', stage: 1, bands: FONTE, lines: [{ who: 'a', fr: 'Le feu a fait un bond, comme quand on ouvre la porte du poêle.', en: 'The fire jumped, like when you open the stove door.' }] },
  { id: 's-u1-feu-fourneau', sign: 'fire', stage: 1, bands: FONTE, lines: [{ who: 'a', fr: 'Les flammes ont doublé d’un coup, comme au haut fourneau quand on charge.', en: 'The flames doubled all at once, like at the blast furnace when they load it.' }] },
  { id: 's-u1-bete', sign: 'beast', stage: 1, bands: FONTE, lines: [{ who: 'a', fr: '{Bete} me fixe depuis tout à l’heure. Je n’ai rien à manger sur moi.', en: '{Bete} has been staring at me for a while. I’ve no food on me.' }] },
  { id: 's-u1-bete-chien', sign: 'beast', stage: 1, bands: FONTE, lines: [{ who: 'a', fr: 'Le chien de {maitre} s’est arrêté net et me regarde. {maitre} tire sur la laisse pour rien.', en: '{maitre}’s dog has stopped dead and is staring at me. {maitre}’s pulling on the lead for nothing.' }] },
  { id: 's-u1-quoi', adult: true, stage: 1, bands: FONTE, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Je n’ai rien bu, pourtant.', en: 'What was that? And I haven’t had a drop.' }] },
  { id: 's-u1-superstitious', stage: 1, bands: FONTE, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Je ne reprends plus cette rue. Ma mère aurait dit que c’est un signe.', en: 'I’m not taking this street again. My mother would have said it’s a sign.' }] },
  { id: 's-u1-pious', stage: 1, bands: FONTE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Je passerai allumer une bougie. On ne sait jamais.', en: 'I’ll stop and light a candle. You never know.' }] },
  { id: 's-u1-curious', stage: 1, bands: FONTE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? Je voudrais voir d’où vient le courant d’air.', en: 'Again? I’d like to see where the draught comes from.' }] },
  { id: 's-u1-grumpy', adult: true, stage: 1, bands: FONTE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Il ne manquait plus que ça. La paie est en retard, et maintenant ça.', en: 'That’s all I needed. The pay’s late, and now this.' }] },
  { id: 's-u1-enfant', stage: 1, bands: FONTE, when: { child: true }, lines: [{ who: 'a', fr: 'Je le raconterai à l’école. La maîtresse ne me croira pas.', en: 'I’ll tell them at school. The teacher won’t believe me.' }] },
  // ── 2. L'explication : un courant d'air ──
  { id: 's-u2-vent', sign: 'wind', stage: 2, bands: FONTE, lines: [{ who: 'a', fr: 'Un courant d’air entre deux immeubles, rien d’autre. Ça arrive avec les rues étroites.', en: 'A draught between two buildings, nothing else. It happens with narrow streets.' }] },
  { id: 's-u2-lumiere', sign: 'light', stage: 2, bands: FONTE, lines: [{ who: 'a', fr: 'Un trou dans la fumée des usines, rien de plus.', en: 'A gap in the factory smoke, nothing more.' }] },
  { id: 's-u2-feu', adult: true, sign: 'fire', stage: 2, bands: FONTE, lines: [{ who: 'a', fr: 'Un courant d’air dans le conduit. Il faudra faire ramoner avant l’hiver.', en: 'A draught in the flue. I’ll have to get it swept before winter.' }] },
  { id: 's-u2-bete', sign: 'beast', stage: 2, bands: FONTE, lines: [{ who: 'a', fr: '{Bete} a senti le pain dans ma poche, c’est tout.', en: '{Bete} smelled the bread in my pocket, that’s all.' }] },
  { id: 's-u2-explication', stage: 2, bands: FONTE, lines: [{ who: 'a', fr: 'Il y a forcément une explication. Je la trouverai en rentrant.', en: 'There’s bound to be an explanation. I’ll work it out on the way home.' }] },
  { id: 's-u2-pious', stage: 2, bands: FONTE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Un courant d’air, diront-ils. Moi je dis qu’on a voulu me parler. Une bougie ce soir.', en: 'A draught, they’ll say. I say someone wanted to speak to me. A candle tonight.' }] },
  { id: 's-u2-pious-nom', stage: 2, bands: FONTE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'C’est {nom} qui veille sur moi, je le savais. Ce soir, une bougie, une grande.', en: 'It’s {nom} watching over me, I knew it. Tonight, a candle, a big one.' }] },
  { id: 's-u2-superstitious', stage: 2, bands: FONTE, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Deux fois. Ce n’est plus un courant d’air. Ce soir je dors chez ma sœur.', en: 'Twice. That’s no draught any more. Tonight I’m sleeping at my sister’s.' }] },
  { id: 's-u2-curious', stage: 2, bands: FONTE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois et je saurai d’où ça vient. Je ne bouge pas.', en: 'Once more and I’ll know where it comes from. I’m not moving.' }] },
  { id: 's-u2-grumpy', adult: true, stage: 2, bands: FONTE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Un courant d’air de plus. Le propriétaire ne bouchera jamais rien.', en: 'One more draught. The landlord’ll never block anything up.' }] },
  { id: 's-u2-enfant', stage: 2, bands: FONTE, when: { child: true }, lines: [{ who: 'a', fr: 'Papa dira que c’est un courant d’air. Moi je sais que non.', en: 'Dad’ll say it’s a draught. I know it isn’t.' }] },
  // ── 3. Ça suffit ──
  { id: 's-u3-sirene', stage: 3, bands: FONTE, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre avant la sirène.', en: 'That’s enough. I’m going home before the siren.' }] },
  { id: 's-u3-rien', stage: 3, bands: FONTE, lines: [{ who: 'a', fr: 'Ça suffit. Je ne veux plus rien voir aujourd’hui.', en: 'That’s enough. I don’t want to see anything else today.' }] },
  { id: 's-u3-grumpy', adult: true, stage: 3, bands: FONTE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. J’ai dix heures d’atelier dans les jambes.', en: 'That’s enough. I’ve got ten hours of the workshop in my legs.' }] },
  { id: 's-u3-pious', stage: 3, bands: FONTE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai compris. Dimanche, j’irai au culte.', en: 'That’s enough, I understand. On Sunday I’ll go to the service.' }] },
  { id: 's-u3-curious', adult: true, stage: 3, bands: FONTE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. J’en parlerai au contremaître, il lit les journaux.', en: 'That’s enough for today. I’ll tell the foreman; he reads the papers.' }] },
  { id: 's-u3-enfant', stage: 3, bands: FONTE, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, je rentre.', en: 'That’s enough, I’m going home.' }] },

  // ══ NÉON : une panne ══════════════════════════════════════════════════════════
  // ── 1. La surprise ──
  { id: 's-n1-vent', sign: 'wind', stage: 1, bands: NEON, lines: [{ who: 'a', fr: 'Un souffle d’air chaud sur moi, comme à la bouche du métro. Il n’y a pas de métro ici.', en: 'A blast of warm air on me, like at a metro vent. There’s no metro here.' }] },
  { id: 's-n1-vent-coiffe', sign: 'wind', stage: 1, bands: NEON, lines: [{ who: 'a', m: 'Le vent m’a décoiffé et s’est arrêté net. Sur le trottoir, rien n’a bougé.', f: 'Le vent m’a décoiffée et s’est arrêté net. Sur le trottoir, rien n’a bougé.', en: 'The wind messed up my hair and stopped dead. Nothing else on the pavement moved.' }] },
  { id: 's-n1-soleil', sign: 'light', stage: 1, bands: NEON, when: { night: false }, lines: [{ who: 'a', fr: 'Le soleil est passé entre deux tours, pile sur moi.', en: 'The sun came through between two towers, right on me.' }] },
  { id: 's-n1-nuit', sign: 'light', stage: 1, bands: NEON, when: { night: true }, lines: [{ who: 'a', fr: 'Il a fait clair sur moi d’un coup, et sur personne d’autre.', en: 'It went bright on me all of a sudden, and on nobody else.' }] },
  { id: 's-n1-feu', sign: 'fire', stage: 1, bands: NEON, lines: [{ who: 'a', fr: 'Les flammes sont montées d’un coup, comme avec de l’essence.', en: 'The flames shot up, like with petrol.' }] },
  { id: 's-n1-feu-recul', sign: 'fire', stage: 1, bands: NEON, lines: [{ who: 'a', fr: 'Le feu a grandi d’un coup. J’ai reculé sans réfléchir.', en: 'The fire flared up all at once. I stepped back without thinking.' }] },
  { id: 's-n1-bete', sign: 'beast', stage: 1, bands: NEON, lines: [{ who: 'a', fr: '{Bete} me fixe comme si on se connaissait.', en: '{Bete} is staring at me like we know each other.' }] },
  { id: 's-n1-bete-chien', sign: 'beast', stage: 1, bands: NEON, lines: [{ who: 'a', fr: 'Le chien de {maitre} s’est assis sur le trottoir et me regarde. {maitre} n’arrive plus à le faire avancer.', en: '{maitre}’s dog has sat down on the pavement and is staring at me. {maitre} can’t get it to move.' }] },
  { id: 's-n1-quoi', stage: 1, bands: NEON, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Je n’ai même pas eu le temps de sortir mon téléphone.', en: 'What was that? I didn’t even have time to get my phone out.' }] },
  { id: 's-n1-superstitious', stage: 1, bands: NEON, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Je ne prends pas le métro aujourd’hui. Je rentre à pied.', en: 'I’m not taking the metro today. I’ll walk home.' }] },
  { id: 's-n1-pious', stage: 1, bands: NEON, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Je n’y croyais plus trop. Il faudra peut-être que j’y repense.', en: 'I hadn’t really believed for a while. Maybe I need to think about it again.' }] },
  { id: 's-n1-curious', stage: 1, bands: NEON, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? Cette fois, je sors mon téléphone.', en: 'Again? This time I’m getting my phone out.' }] },
  { id: 's-n1-grumpy', adult: true, stage: 1, bands: NEON, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Super. Exactement ce qu’il me fallait avant la réunion de neuf heures.', en: 'Great. Exactly what I needed before the nine o’clock meeting.' }] },
  { id: 's-n1-enfant', stage: 1, bands: NEON, when: { child: true }, lines: [{ who: 'a', fr: 'Je vais le dire à {gamin}, il va être jaloux.', en: 'I’m going to tell {gamin}. He’ll be so jealous.' }] },
  { id: 's-n1-enfant-seul', stage: 1, bands: NEON, when: { child: true }, lines: [{ who: 'a', fr: 'Je l’ai vu. Personne ne regardait à part moi.', en: 'I saw it. Nobody else was looking.' }] },
  // ── 2. L'explication : une panne ──
  { id: 's-n2-vent', sign: 'wind', stage: 2, bands: NEON, lines: [{ who: 'a', fr: 'La ventilation d’un immeuble qui s’emballe. Il y a des pannes partout en ce moment.', en: 'Some building’s ventilation running wild. There are breakdowns everywhere at the moment.' }] },
  { id: 's-n2-lumiere', sign: 'light', stage: 2, bands: NEON, lines: [{ who: 'a', fr: 'Un reflet sur une vitre de bureau, ou une panne de quelque chose. Je regarderai les infos.', en: 'A reflection off an office window, or something on the blink. I’ll check the news.' }] },
  { id: 's-n2-feu', sign: 'fire', stage: 2, bands: NEON, lines: [{ who: 'a', fr: 'Une fuite de gaz, sûrement. Il faudrait prévenir quelqu’un.', en: 'A gas leak, surely. Someone should be told.' }] },
  { id: 's-n2-bete', sign: 'beast', stage: 2, bands: NEON, lines: [{ who: 'a', fr: '{Bete} est peut-être malade. Ou c’est moi qui sens quelque chose.', en: '{Bete} might be ill. Or maybe it’s me that smells of something.' }] },
  { id: 's-n2-panne', stage: 2, bands: NEON, lines: [{ who: 'a', fr: 'Deux fois. Une panne, quelque chose qui déraille dans le quartier.', en: 'Twice. A fault, something going wrong in the neighbourhood.' }] },
  { id: 's-n2-pious', stage: 2, bands: NEON, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Une panne, ils diront. Ce soir j’allume une bougie, comme ma grand-mère.', en: 'A fault, they’ll say. Tonight I’m lighting a candle, like my grandmother did.' }] },
  { id: 's-n2-pious-nom', stage: 2, bands: NEON, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Si c’est {nom}, je voudrais savoir ce qu’on attend de moi.', en: 'If it’s {nom}, I’d like to know what’s expected of me.' }] },
  { id: 's-n2-superstitious', stage: 2, bands: NEON, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Une panne, peut-être. Mais je ne repasse pas par ici.', en: 'A fault, maybe. But I’m not coming this way again.' }] },
  { id: 's-n2-curious', stage: 2, bands: NEON, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois et je filme. J’ai le téléphone à la main.', en: 'Once more and I’m filming. I’ve got my phone in my hand.' }] },
  { id: 's-n2-grumpy', stage: 2, bands: NEON, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Une panne de plus. Personne ne répare rien dans cette ville.', en: 'One more fault. Nobody fixes anything in this city.' }] },
  { id: 's-n2-enfant', stage: 2, bands: NEON, when: { child: true }, lines: [{ who: 'a', fr: 'Maman dira que c’est une panne. Ce n’est pas une panne.', en: 'Mum’ll say it’s a fault. It isn’t a fault.' }] },
  // ── 3. Ça suffit ──
  { id: 's-n3-volets', stage: 3, bands: NEON, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre, je ferme les volets, je ne regarde plus.', en: 'That’s enough. I’m going home, closing the shutters, not looking any more.' }] },
  { id: 's-n3-quartier', stage: 3, bands: NEON, lines: [{ who: 'a', fr: 'Ça suffit. Je change de quartier pour aujourd’hui.', en: 'That’s enough. I’m going to another part of town for today.' }] },
  { id: 's-n3-grumpy', stage: 3, bands: NEON, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. Je vais écrire à la mairie.', en: 'That’s enough. I’m writing to the town hall.' }] },
  { id: 's-n3-pious', stage: 3, bands: NEON, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai compris. Je passerai au culte en rentrant.', en: 'That’s enough, I get it. I’ll stop by the service on the way home.' }] },
  { id: 's-n3-curious', stage: 3, bands: NEON, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Demain, même heure, même trottoir.', en: 'That’s enough for today. Tomorrow, same time, same pavement.' }] },
  { id: 's-n3-enfant', stage: 3, bands: NEON, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, je veux rentrer.', en: 'That’s enough, I want to go home.' }] },

  // ══ NOOSPHÈRE : le chœur ══════════════════════════════════════════════════════
  // Plus de bêtes à cet âge, et guère de feux : le vent et la lumière.
  // ── 1. La surprise ──
  { id: 's-x71-vent', sign: 'wind', stage: 1, bands: NOOS, lines: [{ who: 'a', fr: 'Un souffle d’air sur moi seul. Sous la membrane, l’air ne bouge jamais comme ça.', en: 'A breath of air on me alone. Under the membrane, the air never moves like that.' }] },
  { id: 's-x71-vent-cou', sign: 'wind', stage: 1, bands: NOOS, lines: [{ who: 'a', m: 'Ça m’a soufflé dans le cou, comme quelqu’un derrière moi. Je me suis retourné : personne.', f: 'Ça m’a soufflé dans le cou, comme quelqu’un derrière moi. Je me suis retournée : personne.', en: 'Something blew on my neck, like someone behind me. I turned round. Nobody.' }] },
  { id: 's-x71-jour', sign: 'light', stage: 1, bands: NOOS, when: { night: false }, lines: [{ who: 'a', fr: 'La lumière a monté sur moi, et pas sur la rue. Le chœur n’en dit rien.', en: 'The light rose on me, and not on the street. The chorus says nothing about it.' }] },
  { id: 's-x71-nuit', sign: 'light', stage: 1, bands: NOOS, when: { night: true }, lines: [{ who: 'a', fr: 'De la lumière sur moi, en pleine nuit, et pas une tour-mémoire allumée à côté.', en: 'Light on me, in the middle of the night, and not one memory tower lit nearby.' }] },
  { id: 's-x71-quoi', stage: 1, bands: NOOS, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Je n’ai rien senti venir dans le chœur.', en: 'What was that? I didn’t feel it coming in the chorus.' }] },
  { id: 's-x71-superstitious', stage: 1, bands: NOOS, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Je me débranche du chœur ce soir. Ma grand-mère disait que ça attire les choses.', en: 'I’m unplugging from the chorus tonight. My grandmother said it draws things in.' }] },
  { id: 's-x71-pious', stage: 1, bands: NOOS, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Quelqu’un pense à moi, et ce n’est pas le chœur.', en: 'Someone is thinking of me, and it isn’t the chorus.' }] },
  { id: 's-x71-curious', stage: 1, bands: NOOS, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? Je veux que le chœur l’enregistre.', en: 'Again? I want the chorus to record it.' }] },
  { id: 's-x71-grumpy', stage: 1, bands: NOOS, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Le chœur est censé prévenir de ce genre de chose. À quoi il sert ?', en: 'The chorus is supposed to warn about this sort of thing. What’s it for?' }] },
  { id: 's-x71-enfant', stage: 1, bands: NOOS, when: { child: true }, lines: [{ who: 'a', m: 'Quand je serai branché au chœur, je le raconterai à tout le monde.', f: 'Quand je serai branchée au chœur, je le raconterai à tout le monde.', en: 'When I’m connected to the chorus, I’ll tell everyone.' }] },
  // ── 2. L'explication : le chœur ──
  { id: 's-x72-vent', sign: 'wind', stage: 2, bands: NOOS, lines: [{ who: 'a', fr: 'Quelqu’un a dû penser trop fort dans le chœur. Il paraît que ça fait bouger l’air.', en: 'Someone must have thought too hard in the chorus. Apparently that moves the air.' }] },
  { id: 's-x72-lumiere', sign: 'light', stage: 2, bands: NOOS, lines: [{ who: 'a', fr: 'Les tours-mémoire ont dû renvoyer la lumière. Je chercherai l’explication dans le chœur.', en: 'The memory towers must have thrown the light back. I’ll look up the explanation in the chorus.' }] },
  { id: 's-x72-deux', stage: 2, bands: NOOS, lines: [{ who: 'a', fr: 'Deux fois. Je vais demander au chœur si d’autres l’ont senti.', en: 'Twice. I’ll ask the chorus whether anyone else felt it.' }] },
  { id: 's-x72-pious', stage: 2, bands: NOOS, when: { trait: 'pious' }, lines: [{ who: 'a', m: 'Il y a quelqu’un hors du chœur. J’en suis sûr, maintenant.', f: 'Il y a quelqu’un hors du chœur. J’en suis sûre, maintenant.', en: 'There’s someone outside the chorus. I’m sure of it now.' }] },
  { id: 's-x72-pious-nom', stage: 2, bands: NOOS, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'C’est {nom}. Je le dirai au chœur, tout bas.', en: 'It’s {nom}. I’ll tell the chorus, very quietly.' }] },
  { id: 's-x72-superstitious', stage: 2, bands: NOOS, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Ce n’est pas le chœur. Le chœur ne fait pas ça.', en: 'It isn’t the chorus. The chorus doesn’t do that.' }] },
  { id: 's-x72-curious', stage: 2, bands: NOOS, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois, et je partage la mesure. Il m’en faut deux.', en: 'Once more and I’ll share the reading. I need two.' }] },
  { id: 's-x72-grumpy', stage: 2, bands: NOOS, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Un pic dans le chœur, et c’est encore sur moi que ça tombe.', en: 'A spike in the chorus, and of course it lands on me.' }] },
  { id: 's-x72-enfant', stage: 2, bands: NOOS, when: { child: true }, lines: [{ who: 'a', fr: 'Je l’ai senti deux fois. Je ne l’ai pas encore dit à maman.', en: 'I felt it twice. I haven’t told Mum yet.' }] },
  { id: 's-x72-enfant-nom', stage: 2, bands: NOOS, when: { child: true }, lines: [{ who: 'a', fr: 'C’est {nom}. Ils en parlent à l’école.', en: 'It’s {nom}. They talk about it at school.' }] },
  // ── 3. Ça suffit ──
  { id: 's-x73-coupe', adult: true, stage: 3, bands: NOOS, lines: [{ who: 'a', fr: 'Ça suffit. Je me coupe du chœur pour aujourd’hui.', en: 'That’s enough. I’m cutting myself off from the chorus for today.' }] },
  { id: 's-x73-dormir', stage: 3, bands: NOOS, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre dormir, on verra demain.', en: 'That’s enough. I’m going home to sleep. We’ll see tomorrow.' }] },
  { id: 's-x73-grumpy', stage: 3, bands: NOOS, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. Je ne suis pas un appareil de mesure.', en: 'That’s enough. I’m not a measuring device.' }] },
  { id: 's-x73-pious', stage: 3, bands: NOOS, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai compris. Je garderai ça pour moi, pas pour le chœur.', en: 'That’s enough, I get it. I’ll keep this for myself, not for the chorus.' }] },
  { id: 's-x73-curious', stage: 3, bands: NOOS, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Tout est dans le chœur, je relirai.', en: 'That’s enough for today. It’s all in the chorus; I’ll go over it again.' }] },
  { id: 's-x73-enfant', stage: 3, bands: NOOS, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai la tête qui tourne.', en: 'That’s enough, my head’s spinning.' }] },

  // ══ STELLAIRE : la machinerie de la sphère ════════════════════════════════════
  // ── 1. La surprise ──
  { id: 's-x81-vent', sign: 'wind', stage: 1, bands: ETOILES, lines: [{ who: 'a', fr: 'Un souffle sur moi seul. Dans la sphère, l’air ne bouge que quand on le décide.', en: 'A breath of air on me alone. In the sphere, the air only moves when someone decides it should.' }] },
  { id: 's-x81-vent-dos', sign: 'wind', stage: 1, bands: ETOILES, lines: [{ who: 'a', fr: 'Ça m’a poussé dans le dos, une seule fois. Il n’y a jamais eu de vent ici.', en: 'Something pushed me in the back, just once. There has never been wind here.' }] },
  { id: 's-x81-jour', sign: 'light', stage: 1, bands: ETOILES, when: { night: false }, lines: [{ who: 'a', fr: 'Le soleil m’est arrivé dessus en direct, sans passer par les voiles.', en: 'The sunlight hit me straight on, without going through the sails.' }] },
  { id: 's-x81-nuit', sign: 'light', stage: 1, bands: ETOILES, when: { night: true }, lines: [{ who: 'a', fr: 'De la lumière sur moi, à l’heure où les voiles sont fermées.', en: 'Light on me, at the hour when the sails are closed.' }] },
  { id: 's-x81-quoi', stage: 1, bands: ETOILES, lines: [{ who: 'a', fr: 'Qu’est-ce que c’était ? Les capteurs du quartier n’ont rien dit.', en: 'What was that? The district sensors didn’t say a thing.' }] },
  { id: 's-x81-superstitious', stage: 1, bands: ETOILES, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Les anciens de la navette disaient que ça arrive avant un départ. Je ne pars pas.', en: 'The old hands on the shuttle used to say it happens before a departure. I’m not leaving.' }] },
  { id: 's-x81-pious', stage: 1, bands: ETOILES, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Une prière de plus ce soir. Pour ça, et pour mon frère sur la navette du sud.', en: 'An extra prayer tonight. For this, and for my brother on the southern shuttle.' }] },
  { id: 's-x81-curious', stage: 1, bands: ETOILES, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? Je note l’heure, à la seconde.', en: 'Again? I’m noting the time, to the second.' }] },
  { id: 's-x81-grumpy', stage: 1, bands: ETOILES, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Le régulateur de climat fait encore des siennes. Trois ans qu’on le signale.', en: 'The climate regulator’s playing up again. We’ve been reporting it for three years.' }] },
  { id: 's-x81-enfant', stage: 1, bands: ETOILES, when: { child: true }, lines: [{ who: 'a', fr: 'Je le dirai à {gamine}. Elle dira que j’invente.', en: 'I’ll tell {gamine}. She’ll say I’m making it up.' }] },
  { id: 's-x81-enfant-moi', stage: 1, bands: ETOILES, when: { child: true }, lines: [{ who: 'a', fr: 'Il s’est passé quelque chose, et c’était sur moi.', en: 'Something happened, and it was on me.' }] },
  // ── 2. L'explication : la sphère ──
  { id: 's-x82-vent', sign: 'wind', stage: 2, bands: ETOILES, lines: [{ who: 'a', fr: 'Une erreur du régulateur d’air. C’est rare, mais ça arrive.', en: 'An air regulator error. It’s rare, but it happens.' }] },
  { id: 's-x82-lumiere', sign: 'light', stage: 2, bands: ETOILES, lines: [{ who: 'a', fr: 'Une voile qui a tourné trop tôt. Le conseil enverra quelqu’un.', en: 'A sail that turned too early. The council will send someone.' }] },
  { id: 's-x82-conseil', stage: 2, bands: ETOILES, lines: [{ who: 'a', fr: 'Deux fois sur moi, et sur personne d’autre. J’écrirai au conseil.', en: 'Twice on me, and on nobody else. I’ll write to the council.' }] },
  { id: 's-x82-pious', stage: 2, bands: ETOILES, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Quelqu’un s’occupe de moi, d’aussi loin que les étoiles. Ce soir je dirai merci.', en: 'Someone is looking after me, from as far off as the stars. Tonight I’ll say thank you.' }] },
  { id: 's-x82-pious-nom', stage: 2, bands: ETOILES, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'C’est {nom}. Ce soir je lui dirai merci, à voix haute.', en: 'It’s {nom}. Tonight I’ll say thank you, out loud.' }] },
  { id: 's-x82-superstitious', stage: 2, bands: ETOILES, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Mon père a vu ça avant l’accident de la navette de quarante. Je reste à quai.', en: 'My father saw this before the shuttle accident in forty. I’m staying on the dock.' }] },
  { id: 's-x82-curious', stage: 2, bands: ETOILES, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois et j’ai ma mesure. Je reste ici jusqu’au soir s’il le faut.', en: 'Once more and I’ll have my reading. I’ll stay here till evening if I have to.' }] },
  { id: 's-x82-grumpy', stage: 2, bands: ETOILES, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Avec ce que coûte la sphère, on devrait au moins ne pas avoir de courants d’air.', en: 'With what the sphere costs, we should at least not get draughts.' }] },
  { id: 's-x82-enfant', stage: 2, bands: ETOILES, when: { child: true }, lines: [{ who: 'a', m: 'C’est {nom}, j’en suis sûr.', f: 'C’est {nom}, j’en suis sûre.', en: 'It’s {nom}, I’m sure of it.' }] },
  { id: 's-x82-enfant-deux', stage: 2, bands: ETOILES, when: { child: true }, lines: [{ who: 'a', fr: 'Je l’ai vu deux fois. Personne n’était là pour voir.', en: 'I saw it twice. Nobody was there to see.' }] },
  // ── 3. Ça suffit ──
  { id: 's-x83-voiles', stage: 3, bands: ETOILES, lines: [{ who: 'a', fr: 'Ça suffit. Je rentre avant qu’on ferme les voiles.', en: 'That’s enough. I’m going home before they close the sails.' }] },
  { id: 's-x83-conseil', stage: 3, bands: ETOILES, lines: [{ who: 'a', fr: 'Ça suffit. J’écris au conseil, et j’arrête d’y penser.', en: 'That’s enough. I’ll write to the council and stop thinking about it.' }] },
  { id: 's-x83-grumpy', stage: 3, bands: ETOILES, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. Va jouer ailleurs.', en: 'That’s enough. Go and play somewhere else.' }] },
  { id: 's-x83-pious', stage: 3, bands: ETOILES, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai compris. Je n’en parlerai à personne.', en: 'That’s enough, I get it. I won’t tell anyone.' }] },
  { id: 's-x83-pious-chaise', stage: 3, bands: ETOILES, when: { trait: 'pious', article: ['p9_paix_table'] }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai compris. Ta chaise restera vide, c’est promis.', en: 'That’s enough, I get it. Your chair will stay empty, I promise.' }] },
  { id: 's-x83-curious', stage: 3, bands: ETOILES, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Trois mesures, c’est déjà beaucoup.', en: 'That’s enough for today. Three readings is plenty.' }] },
  { id: 's-x83-enfant', stage: 3, bands: ETOILES, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, je vais chercher maman.', en: 'That’s enough, I’m going to get Mum.' }] },

  // ══ DÉMIURGE : toi ════════════════════════════════════════════════════════════
  // On s'y tutoie, entre égaux (§ 7.3).
  // ── 1. La surprise ──
  { id: 's-x91-vent', sign: 'wind', stage: 1, bands: DEMIURGE, lines: [{ who: 'a', fr: 'Un souffle sur moi seul. Ici, l’air ne bouge que si quelqu’un touche à une constante.', en: 'A breath of air on me alone. Here, the air only moves if somebody touches a constant.' }] },
  { id: 's-x91-vent-nulle-part', sign: 'wind', stage: 1, bands: DEMIURGE, lines: [{ who: 'a', fr: 'Le vent est venu de nulle part, sur moi, et il est reparti.', en: 'The wind came from nowhere, onto me, and left again.' }] },
  { id: 's-x91-jour', sign: 'light', stage: 1, bands: DEMIURGE, when: { night: false }, lines: [{ who: 'a', fr: 'La lumière a changé d’un cran sur moi, et seulement sur moi.', en: 'The light shifted one notch on me, and only on me.' }] },
  { id: 's-x91-nuit', sign: 'light', stage: 1, bands: DEMIURGE, when: { night: true }, lines: [{ who: 'a', fr: 'De la lumière sur moi, en pleine nuit, et sans source.', en: 'Light on me, in the middle of the night, with no source.' }] },
  { id: 's-x91-quoi', stage: 1, bands: DEMIURGE, lines: [{ who: 'a', fr: 'Tiens. Quelqu’un s’intéresse à moi.', en: 'Well. Somebody’s interested in me.' }] },
  { id: 's-x91-superstitious', stage: 1, bands: DEMIURGE, when: { trait: 'superstitious' }, lines: [{ who: 'a', fr: 'Je n’aime pas qu’on touche aux constantes près de moi.', en: 'I don’t like people touching the constants near me.' }] },
  { id: 's-x91-pious', stage: 1, bands: DEMIURGE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Tu es là.', en: 'You’re here.' }] },
  { id: 's-x91-curious', stage: 1, bands: DEMIURGE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois ? J’aimerais voir comment tu fais.', en: 'Again? I’d like to see how you do it.' }] },
  { id: 's-x91-grumpy', stage: 1, bands: DEMIURGE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Si c’est toi, dis-le.', en: 'If it’s you, say so.' }] },
  { id: 's-x91-enfant', stage: 1, bands: DEMIURGE, when: { child: true }, lines: [{ who: 'a', fr: 'Il y a quelqu’un. Je le sens.', en: 'There’s someone here. I can feel it.' }] },
  // ── 2. L'explication : toi ──
  { id: 's-x92-vent', sign: 'wind', stage: 2, bands: DEMIURGE, lines: [{ who: 'a', fr: 'C’est toi. Tu fais ça quand tu passes près de quelqu’un.', en: 'It’s you. You do that when you pass close to someone.' }] },
  { id: 's-x92-lumiere', sign: 'light', stage: 2, bands: DEMIURGE, lines: [{ who: 'a', fr: 'C’est toi, avec ta lumière. Je ne sais pas ce que tu veux.', en: 'It’s you, with your light. I don’t know what you want.' }] },
  { id: 's-x92-deux', stage: 2, bands: DEMIURGE, lines: [{ who: 'a', fr: 'Deux fois. C’est toi, je le sais.', en: 'Twice. It’s you. I know it.' }] },
  { id: 's-x92-pious', stage: 2, bands: DEMIURGE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Tu reviens. Je ne pensais pas que tu reviendrais.', en: 'You’ve come back. I didn’t think you would.' }] },
  { id: 's-x92-pious-nom', stage: 2, bands: DEMIURGE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: '{Nom} s’arrête sur moi. Je ne sais pas quoi faire de mes mains.', en: '{Nom} has stopped on me. I don’t know what to do with my hands.' }] },
  { id: 's-x92-superstitious', stage: 2, bands: DEMIURGE, when: { trait: 'superstitious' }, lines: [{ who: 'a', m: 'Ne me regarde pas trop. Je ne veux pas être remarqué.', f: 'Ne me regarde pas trop. Je ne veux pas être remarquée.', en: 'Don’t look at me too long. I don’t want to be noticed.' }] },
  { id: 's-x92-curious', stage: 2, bands: DEMIURGE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Encore une fois. Je voudrais comprendre comment tu fais, de ton côté.', en: 'Once more. I’d like to understand how you do it, on your side.' }] },
  { id: 's-x92-grumpy', stage: 2, bands: DEMIURGE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Tu as mille galaxies, et c’est moi que tu choisis.', en: 'You’ve got a thousand galaxies, and it’s me you pick.' }] },
  { id: 's-x92-enfant', stage: 2, bands: DEMIURGE, when: { child: true }, lines: [{ who: 'a', fr: 'C’est toi ? Tu reviens demain ?', en: 'Is that you? Will you come back tomorrow?' }] },
  // ── 3. Ça suffit ──
  { id: 's-x93-autres', stage: 3, bands: DEMIURGE, lines: [{ who: 'a', fr: 'Ça suffit. Va voir les autres.', en: 'That’s enough. Go and see the others.' }] },
  { id: 's-x93-compris', stage: 3, bands: DEMIURGE, lines: [{ who: 'a', fr: 'Ça suffit. J’ai compris que tu étais là.', en: 'That’s enough. I understand you’re here.' }] },
  { id: 's-x93-grumpy', stage: 3, bands: DEMIURGE, when: { trait: 'grumpy' }, lines: [{ who: 'a', fr: 'Ça suffit. Je ne suis pas une constante.', en: 'That’s enough. I’m not a constant.' }] },
  { id: 's-x93-pious', stage: 3, bands: DEMIURGE, when: { trait: 'pious' }, lines: [{ who: 'a', fr: 'Ça suffit. Je garde ça pour moi.', en: 'That’s enough. I’ll keep this to myself.' }] },
  { id: 's-x93-curious', stage: 3, bands: DEMIURGE, when: { trait: 'curious' }, lines: [{ who: 'a', fr: 'Ça suffit pour aujourd’hui. Reviens à la même heure, je serai là.', en: 'That’s enough for today. Come back at the same time; I’ll be here.' }] },
  { id: 's-x93-enfant', stage: 3, bands: DEMIURGE, when: { child: true }, lines: [{ who: 'a', fr: 'Ça suffit, j’ai sommeil.', en: 'That’s enough, I’m sleepy.' }] },
];

// ══ LE TACITURNE : il regarde, et ne dit rien ════════════════════════════════════
// Un mot, celui de la chose. Les mêmes à tous les âges, écrits deux fois (la plume ne
// laisse aucune réplique valoir du Feu au Démiurge).
const QUIET = [
  { key: 'vent', sign: 'wind', stage: 1, lines: [{ who: 'a', fr: 'Du vent.', en: 'Wind.' }] },
  { key: 'soleil', sign: 'light', stage: 1, when: { night: false }, lines: [{ who: 'a', fr: 'Du soleil.', en: 'Sun.' }] },
  { key: 'lune', sign: 'light', stage: 1, when: { night: true }, lines: [{ who: 'a', fr: 'La lune.', en: 'The moon.' }] },
  { key: 'feu', sign: 'fire', stage: 1, lines: [{ who: 'a', fr: 'Le feu.', en: 'The fire.' }] },
  { key: 'bete', sign: 'beast', stage: 1, lines: [{ who: 'a', fr: '{Bete}.', en: '{Bete}.' }] },
  { key: 'encore', stage: 2, lines: [{ who: 'a', fr: 'Encore.', en: 'Again.' }] },
  { key: 'assez', stage: 3, lines: [{ who: 'a', fr: 'Ça suffit.', en: 'That’s enough.' }] },
];
for (const [k, bands] of [['a', [0, 4]], ['b', [5, 9]]]) {
  for (const q of QUIET) {
    SIGNES.push({ id: `s-q${k}-${q.key}`, sign: q.sign, stage: q.stage, bands, when: { ...(q.when || {}), trait: 'quiet' }, lines: q.lines });
  }
}

// Toutes de genre 'sign', couche 1 : ce qu'un signe fait penser, pas ce qu'on dit de toi.
export const PAROLES_SIGNES = SIGNES.map((e) => ({ kind: 'sign', layer: 1, when: {}, ...e }));
