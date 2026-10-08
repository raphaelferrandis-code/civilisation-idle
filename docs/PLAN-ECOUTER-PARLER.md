# Plan — Écouter, puis parler

Chantier ouvert le 2026-10-07 sur la demande de Raph :

> « Et possibilité d'interagir avec ? qui jouerait avec le lore et la compréhension qu'ils
> ont du joueur ? Au début une option écouter la discussion pour les comprendre et on
> n'interagit pas avec eux, puis après une option dialogue qui permette de parler avec
> certains. »

**Statut : plan tranché, lots 1 à 5 livrés, le 6 en cours (parler, les quatre voix, les rumeurs, la gazette, la promesse ; restent les figures de la Chronique) ; les lots 2 à 6 sont à juger en jeu.** La fiche d'habitant qui sert de socle est faite
(commit `4a99b8bc` : identité, foyers, métier, humeur et sa cause, « où il est entré »).
Raph a répondu aux questions du § 11 le jour même (tableau 1 bis).
**Ce document fait foi pour ce chantier.**

---

## 0. En bref

- **Deux compréhensions avancent ensemble.** Le joueur comprend les habitants en les
  écoutant. Les habitants comprennent le joueur en le voyant faire.
- **La voix du joueur se gagne** : d'abord le silence (écouter), puis des signes, enfin des
  mots. Aujourd'hui, le joueur n'a jamais parlé, sauf un murmure rapporté dans l'histoire de
  Diogène.
- **Ils n'en savent jamais plus que la Chronique de leur cité.** Elle repart de zéro à
  chaque chute (`resetTemporaryRunState`), leur savoir aussi.
- **Le récit seulement.** Aucun effet de jeu pour l'instant.
- **N'importe quel passant** peut être écouté, recevoir un signe, puis des mots. Les
  figures de la Chronique et des faits divers ont en plus des arcs écrits.

---

## 1. Les décisions de Raph (2026-10-07)

| Question | Réponse |
|---|---|
| « Comprendre » | **Le sens.** Le texte reste lisible ; ce qui se gagne, c'est la confiance, donc la profondeur de ce qu'on entend. Pas de langue à déchiffrer. |
| L'identité du joueur | **Elle suit ce qui se sait dans la Chronique.** |
| La voix du joueur | **Des signes, puis des mots.** Interactions possibles dès le début : souffle de vent, lumière plus intense, feu plus fort, écouter les pensées du passant. |
| Les effets | **Seulement le récit**, « à voir plus tard ». |
| Les interlocuteurs | **N'importe quel passant.** |
| L'ordre | La fiche d'abord (faite), puis le lore et les interactions. |

### 1 bis. Les réponses aux questions du § 11 (2026-10-07)

| Question | Réponse |
|---|---|
| Les signes | Un signe est un geste du joueur **vers un passant précis**. En plus du vent, de la lumière et du feu : **la bête** (proposition 3). Les sept autres propositions sont écartées. |
| Quand viennent les mots | **Entre P2 et P3** : au passage de la cité en P3 (index d'ère 9), là où la Chronique parle pour la première fois d'« une main invisible » (`p3_knowledge_probability`). |
| Les âges 7 à 9 | **On écrit** leur Chronique (P8 à P10) : les habitants n'en savent jamais plus qu'elle. |
| Les pensées | **Dès le début**, le joueur peut écouter les pensées de **tout le monde**. |
| Le nom qu'ils te donnent | **Celui de la Chronique** : la rue reprend le nom que la gazette a publié, et c'est là qu'il s'écrit. |
| Le son des signes | Avec le chantier « ambiance sonore », **quand il sera terminé**. |

---

## 2. Les règles

1. **Facultatif.** Écouter et parler ne rapportent rien qu'on regrette d'avoir ignoré. La
   carte reste un rendu qu'on regarde (décision D2 de la refonte des Mythes) et ses actions
   restent facultatives : ni minuteur, ni obligation.
2. **Discret**, comme les faits divers : aucune icône sur la carte pour signaler une
   conversation intéressante, aucun compteur, aucun « ??? ».
3. **Éternel pour le joueur, neuf pour la cité.** Ce que le joueur a entendu et dit survit
   aux chutes et au Grand Reset (`GR_PERSISTENT_FIELDS`). Ce que les habitants SAVENT de lui
   repart avec chaque cité, comme leur gazette. Seules les figures qui traversent les cycles
   (Claude, la troupe, Nancy et William) se souviennent.
4. **Le récit seulement** : aucune ressource, aucune Rupture, aucune Faveur.
5. **Jamais deux fois la même chose.** Un échange entendu ne revient pas tant que la
   réserve de sa situation n'est pas épuisée.
6. **Écrit à la main**, choisi par l'état du jeu. Pas de génération à la volée : le ton est
   tenu, et le jeu tourne hors ligne.
7. **La plume** (Raph, 2026-10-07, après le premier jet du lot 1 : « il nous faut des
   pensées moins IA codée, genre "le marché crie très fort", ça ne veut rien dire ») :
   - du concret : un prénom, un objet, un lieu, un nombre, une heure ;
   - ce qu'une tête contient vraiment : un projet, un souci, un petit calcul, un souvenir
     précis, une envie, une rancune, la tâche du jour ;
   - la langue parlée, ordinaire ; la plupart des échanges s'arrêtent sur du pratique ;
   - ni maxime, ni phrase retournée, ni bon mot de fin ; les choses ne parlent pas, ne
     crient pas, ne se souviennent pas ; l'humour vient du caractère, rarement ;
   - chaque âge son monde (aucune réplique ne vaut du Feu au Démiurge), les pensées
     suivent ce qu'on le voit faire, chaque métier a ses mots, les voisins sont de vrais
     habitants de sa rue ;
   - ni tiret, ni « ! », ni points de suspension.
   La charte complète est en tête de `src/game/data/paroles.js` ; les tests la gardent
   (`parolesPick.test.js`). ⛔ La première version de cette règle demandait « une chute » :
   c'est elle qui a produit les bons mots rejetés.

---

## 3. Ce qui existe déjà

### 3.1 Ce que le lore établit (relevé du 2026-10-07)

**La Chronique** est la voix des habitants. Elle publie par **période**, sur l'index d'ère
(`chronicleEvaluator.getPeriod`) : P1 < 4, P2 < 9, P3 < 15, P4 < 21, P5 < 27, P6 < 32, P7
au-delà. Ce qu'elle dit du joueur, période après période :

| Période | Ce qu'ils savent de toi |
|---|---|
| P1 | Rien. Le feu, le froid, le clan. Claude : « Comme d'habituuude. » |
| P2, P3 | Des dieux capricieux, puis « une main invisible » (Raphaël, p3). |
| P4 | Un culte nouveau, « le Créateur », « Celui qui nous guide », « Celui qui regarde ». Aldric : « Et si nous n'étions pas bénis, mais observés ? » |
| P5 | Le schisme : « Les uns disent qu'il nous guide. Les autres qu'il nous teste. Les derniers qu'il attend. » La Main devient un symbole. |
| P6 | La Main devient un logo ; Khael ouvre un procès contre l'Invisible. **« Vous n'avez répondu à aucun débat. »** |
| P7 | La boucle, le compteur. Edith : **« Demande solennelle à vous voir »**. Raphaël : **« Je crois qu'il joue. »** |
| P8 (lot 3) | Le chœur, la pensée commune de la planète : il y manque une pensée. Edith l'inscrit au registre : **l'Absent**. La minute de silence de Raphaël, et le vent qui se lève à midi et une minute. |
| P9 (lot 3) | Les voiles : le conseil des étoiles écrit dans sa charte que quelqu'un joue, **le Joueur**. Edith écrit un relevé de compte sur la face extérieure de la sphère ; Raphaël part chercher le bord du jeu ; une chaise vide à chaque conseil. |
| P10 (lot 3) | Le Démiurge : les archives de mille galaxies montrent la même main qui ferme une cité et en ouvre une autre, **Celui qui recommence**. Khael se déclare incompétent (« l'accusé a écrit les lois »), Edith clôt les comptes sans la signature, une seconde où tout s'arrête (« il a hésité »), une braise choisie pour passer à la cité d'après. |

Jusqu'au lot 3, les âges 7 à 9 (Noosphère, Stellaire, Démiurge) restaient en P7 ; ils ont
désormais leurs périodes, P8 à P10, qui suivent l'ÂGE de l'ère (`eraBandOf`) et non un
seuil d'index.

**L'Olympe** lit déjà la façon de jouer : `state.olympus` (éternel) compte les chutes
déclenchées (`manualCollapses`, `totalCollapses`, `collapseRuptureSum`), les crises
résolues ou ignorées, le temps sans intervenir (`idleSeconds`), le temps en Rupture haute.
Il en tire quatre cultes : Dieu de la Fin, Dieu des Registres, Dieu qui Rêve, Dieu du Bord.
Aujourd'hui, personne dans la rue n'en parle.

**Les personnages récurrents de la Chronique**, qu'on ne croise jamais : Claude (gardien du
feu de P1 à P7, « J'ai déjà vu ce genre de nuit »), Edith (comptable puis Intendante),
Raphaël (habitant puis essayiste), Khael (juge), Aldric (philosophe), Nessa, Garin, Renaud,
Doran.

**Deux motifs** reviennent partout : le **feu** (le premier feu, la flamme votive de la
Faveur, la Secte qui attend que le feu parle) et le **regard** (Diogène tourne le dos à la
caméra ; le dernier Grandvent : « Et toi, tu as toujours regardé. Merci. »).

**Ce qui n'est pas établi** : la voix du joueur, les âges 7 à 9, le Grand Reset (absent de la
fiction), le rapport entre le joueur et « les dieux ».

### 3.2 Ce que la carte et la fiche donnent déjà

- **Les causettes** : deux passants qui se croisent s'arrêtent de 3 à 6,5 s
  (`citizenGreetings`, agents.js) ; les compagnons font la causette ; les flâneurs des places
  se tiennent en groupes (`plazaFolk.js`, act `chat`) ; les promeneurs du quai vont par deux.
- **La fiche** (`citizenIdentity.js`, `citizenFocus.js`) : nom, métier, âge, foyer (les
  prénoms du conjoint, des enfants, de l'aïeul), caractère (clés `TRAITS`), humeur et sa
  cause, l'endroit où il est entré (`p._in`).
- **Les comportements** : `citizenTraits` (citizenDay.js) fait agir le caractère.

---

## 4. Écouter

### 4.1 Le geste

- Quand le passant désigné **parle avec quelqu'un** (causette, compagnon, groupe de place),
  la fiche propose **Écouter**. Les deux restent sur place le temps de l'échange (2 à 4
  répliques, environ 3 s chacune). Les répliques remplacent les lignes de la fiche, une à
  une, avec le prénom de qui parle. Sur la carte, une petite marque au-dessus de qui parle,
  jamais de texte. Puis ils reprennent leur route.
- Quand il **marche seul**, la fiche propose **Écouter ses pensées** (l'interaction de Raph) :
  une ligne, plus franche que ce qu'il dirait tout haut.

### 4.2 Ce qu'ils disent : trois couches

1. **Leur vie** : le métier, le foyer (par leurs vrais prénoms, ceux de la fiche), le
   travail, le voisin. « Talia dit que le four ne suit plus. »
2. **La cité telle qu'elle est** : le foyer de Rupture qui domine (la même source que la
   cause de l'humeur), la pluie, la nuit, la dernière crise, la merveille, l'émeute, et **la
   dernière dépêche de la Chronique** : on parle des nouvelles.
   « Plus de farine au moulin. » « Il y en avait mardi. » « Le meunier attend la charrette
   de grain depuis trois jours. »
3. **Toi** : ce qu'ils croient (§ 6). Tard, et pas devant tout le monde.

### 4.3 La confiance

Ce qui ouvre la troisième couche :
- **le nombre d'échanges déjà entendus** (éternel) : plus le joueur a écouté, plus la cité
  ose parler de lui ;
- **ce qui se sait** : la période de la Chronique et les articles déjà parus dans ce cycle ;
- **le lieu et l'heure** : la nuit, à l'écart, pas au milieu de la grand-place ;
- **le caractère** : le curieux, le superstitieux et le pieux en parlent, le taciturne jamais ;
- **les pensées** avant les paroles : on y pense avant d'oser le dire.

### 4.4 La trace

Un panneau **« Ce qu'on dit de toi »** dans la Chronique, sur le modèle du panneau des faits
divers. Il ne montre que ce que le joueur a entendu sur lui, daté (âge, temps de jeu), sans
compte ni « ??? ». Le nom qu'ils te donnent, lui, est celui que la gazette a publié (§ 6.4).

---

## 5. Les signes

### 5.1 Le geste

Dès le début, comme l'a voulu Raph. Un signe est un geste du joueur **vers un passant
précis** : on le désigne, on choisit le signe dans sa fiche, il réagit (il lève les yeux,
s'arrête, se retourne), puis une pensée dit ce qu'il en fait. Un signe ne change rien au
jeu : le feu monte à l'écran, la production ne bouge pas.

### 5.2 Le répertoire (tranché le 2026-10-07)

1. **Le souffle de vent** autour de lui.
2. **La lumière plus intense** sur lui.
3. **Le feu plus fort**, le feu le plus proche de lui.
4. **La bête** : un chien, une chèvre ou un oiseau proche s'arrête et le fixe ; il suit son
   regard.

Écouter ses pensées n'est pas un signe : c'est l'écoute (§ 4.1). Les autres propositions
(souffler une idée, envoyer un rêve, l'ombre d'un nuage, l'étoile filante, le poisson, le mot
dans la cendre, le signe qui change de forme avec les âges) sont écartées.

### 5.3 Comment ils les lisent

- **Par l'âge** (la période de la Chronique) : au Feu, un esprit ; au Marbre, un dieu ; à la
  Fonte, un courant d'air ; au Néon, une panne.
- **Par le caractère** : le pieux y voit un message, le superstitieux a peur, le curieux
  demande « Encore une fois ? », le râleur se plaint, le taciturne regarde et ne dit rien.
- **Par la répétition** : la première fois la surprise, la deuxième une explication, la
  troisième « Ça suffit. ». C'est la seule limite : pas de délai de recharge.
- **En réponse** : quand un passant demande un signe (§ 7.1), le signe est une réponse, et il
  l'interprète, parfois de travers.

### 5.4 Garde-fous de DA

- Des phénomènes naturels seulement : ni orbe, ni halo, ni lueur cyan, ni anneau
  (« trop IA », rejeté).
- Pas de fenêtres qui s'allument (rejeté au lot 1 « ville habitée »).
- Le feu passe par les flammes existantes : le feu n'est pas un pigment (`SKIP_FIRE`,
  rampe à part).
- Le son des signes se règle avec le chantier « ambiance sonore »
  (`docs/PLAN-AMBIANCE-SONORE.md`), **une fois ce chantier terminé** : en attendant, des
  signes muets.

### 5.5 Ce qui est fait (lot 4)

- **Le geste** : dans la fiche, une rangée « Signe » sous l'écoute : Vent, Lumière, et Feu
  ou Bête seulement s'il y en a un près de lui (huit cases pour le feu, cinq pour la bête).
  Le passant s'arrête un quart de seconde après, se tourne vers ce qu'il a vu (d'où vient
  le vent, la lumière en haut à gauche, le feu, la bête), reste là cinq secondes ; sa
  pensée vient 1,3 s après le geste, dans la fiche, comme ses pensées. Pendant ce temps les
  boutons attendent ; aucun délai de recharge ensuite. Après la troisième fois, la rangée
  disparaît pour lui : il repart sitôt « Ça suffit. » pensé.
- **Le vent** (`iso/isoSignes.js`) : une rafale qui passe sur lui, des feuilles sèches de la
  saison (la neige en hiver, une poussière pâle aux âges cosmiques) qui arrivent d'un côté,
  s'enroulent autour de lui et filent, et une traînée de poussière à ses pieds. Chaque
  feuille est au tri du peintre.
- **La lumière** : un rayon oblique venu d'en haut à gauche (la lumière du jeu) jusqu'à
  lui, et une flaque claire à ses pieds ; la lune la nuit. Couche de lumière, juste après
  lui au tri : elle l'éclaire, ce qui passe devant la coupe.
- **Le feu** : le feu le plus proche, parmi les lueurs de feu de la dernière frame
  (`flameGlow.flameFires`, les teintes de feu seulement, pas les lanternes). Sa lueur grandit
  (`FIRE_BOOST`), des langues se détachent du haut de la flamme et une gerbe d'étincelles
  file haut, aux encres de la rampe rouge. La flamme elle-même reste celle de son site.
- **La bête** : une bête posée (le bétail, le chien ou le chat couché au seuil) se tourne
  vers lui ; le chien qu'un autre passant promène s'assoit et le fixe, son maître l'attend.
  Lui la regarde, se retourne (il suit son regard, il n'y a personne), puis la regarde de
  nouveau. Plus de bêtes après le Néon : le signe n'y est pas proposé.
- **Ce qu'il en pense** (`src/game/data/parolesSignes.js`, 253 pensées) : par l'âge (au Feu
  un esprit, au Bourg un présage, au Marbre un dieu, à la Fonte un courant d'air, au Néon
  une panne, à la Noosphère le chœur, au Stellaire la machinerie de la sphère, au Démiurge
  toi), par le caractère (le pieux, le superstitieux, le curieux, le râleur, l'enfant ; ce
  qui est écrit pour lui passe d'abord, tant qu'il en reste de neuf) et par la fois. Le
  taciturne n'a que ses mots : « Le feu. », « Encore. », « Ça suffit. ». La bête se nomme
  (« ce chien », « cette chèvre »), le chien promené par le prénom de son maître ; le pieux
  qui sait le nom de la gazette le dit (« C'est la Main. »).
- **La trace** : `state.paroles.signs` (éternel : en tout, par signe ; et ce que la cité de
  ce cycle a vu). La pensée née d'un signe ne revient pas, mais ne compte pas dans la
  confiance : seule l'écoute l'ouvre. Les rumeurs sur les signes que la cité a vus restent
  à écrire (§ 6.2).

### 5.6 Ce qu'il fait (lot 4 bis)

Raph, sur le lot 4 : « les réactions sont un peu étranges aux signes, et les comportements du
pnj ne changent pas, il marche tranquillement. Il faudrait plusieurs réactions, par exemple
si la lumière vient plusieurs fois sur lui, il s'agenouille en priant, ou bien au contraire
il a peur et part en courant ». Dix idées proposées, toutes retenues (« tout ! »).

- **La pensée annonce le geste, et il le fait.** Chaque pensée porte son geste (`act`) :
  il regarde, recule d'un pas, s'agenouille tourné vers toi (la pose assise des bancs, posée
  au sol), te fait signe (la pose du salut), reste vingt secondes à chercher des yeux d'un
  côté puis de l'autre, part en courant (chez lui, sinon loin de ce qui l'a effrayé), rentre
  chez lui et s'y enferme quarante secondes (le râleur, plus vite), va prier au culte des
  ancêtres le plus proche d'un pas pressé, court vers son père ou sa mère s'ils sont dans la
  rue (l'enfant), ou repart en pressant le pas. Il ne pense jamais un geste qu'il ne peut pas
  faire : pas de temple sans culte, pas de « je rentre » sans logis (`signActs`).
- **Qui fait quoi** : le pieux regarde, puis s'agenouille sous la lumière ou va prier, et y
  retourne à la troisième fois ; le superstitieux et le prudent reculent, puis fuient (tout
  de suite devant le feu ou la bête) ; le curieux reste à chercher ; le joyeux et l'enfant
  font signe, l'enfant court ensuite vers ses parents ; le râleur repart en pressant le pas ;
  les autres regardent, s'expliquent la chose, puis rentrent. Au Feu, au Bourg et au Marbre,
  n'importe qui peut aussi s'agenouiller sous la lumière la deuxième fois.
- **Les passants autour** (à trois cases et demie, quatre au plus) s'arrêtent et regardent
  eux aussi, chacun à son rythme ; un enfant dont le père ou la mère est dans la rue court
  vers lui.
- **Les personnages de scène** du quai, du pont (le pêcheur se tourne sans lâcher sa ligne),
  de la place et de la Maison des Plaisirs s'arrêtent et se tournent ; leur scène prend le
  retard du temps arrêté, qu'elle rattrape ensuite. Le laboureur (soudé à son attelage), le
  port, le bac, la navette et les gens des bateaux ne reçoivent pas de signe.
- **La fiche dit ce qu'il fait** : « À genoux », « S’enfuit », « Va prier », « Court vers sa
  mère », « Cherche des yeux ».
- **Les petits manques, comblés** (Raph, 2026-10-08 : « on fait les petits manques puis on
  enchaîne lot 5 » ; l'agenouillement est validé en jeu) :
  - la ville parle de ceux qui ont reçu un signe, en les NOMMANT (`PAROLES_ECHOS`, 32
    causettes et pensées : « Tu as vu Maelis, à genoux devant le puits ? »), couche 2 pour
    ce qu'on a vu, couche 3 pour ceux qui y voient quelqu'un ; la mémoire de la cité :
    `signs.seen` (qui, quel signe, quel geste ; repart avec la cité) ;
  - les pensées de signe qui parlent de toi ou à toi (le nom de la gazette, « tu »,
    « vous ») entrent au panneau « Ce qu'on dit de toi » ;
  - aux âges 7 à 9, ni feu ni bête : le vent et la lumière (choix de Raph) ;
  - le laboureur (et son attelage) s'arrête ; le porteur du port aussi, s'il lui reste trente
    secondes d'escale ; le voyageur du bac ou de la navette se tourne tant qu'il attend sur le
    ponton, le marin sur son pont (leur bateau poursuit sa route).
- Mécanique : `paroles/signs.js` mène les réactions (une par personne, plusieurs à la fois) ;
  un passant de la rue part par `agents.citizenReactGo` et porte `p._react`, qui le garde de
  l'averse, du soir, de l'émeute, de l'auvent, de la vitrine et de la causette le temps de
  son geste ; un personnage de scène porte `_signDir` et `_signLag`.

---

## 6. Ce qu'ils savent et ce qu'ils croient de toi

### 6.1 Ce qui se sait : la Chronique de la cité

- **Le cadre** : la période de la Chronique (tableau du § 3.1). Un habitant de P2 ne parle
  pas du Créateur.
- **Les faits publiés** : les articles déjà parus dans ce cycle
  (`state.chronicleEntries[].articleId`). On ne parle du procès de Khael qu'après que la
  gazette l'a annoncé. À la chute, tout est oublié, comme la gazette.
- **Les âges 7 à 9 ont leur Chronique** (décision du 2026-10-07) : trois périodes de plus,
  P8 (Noosphère), P9 (Stellaire) et P10 (Démiurge), écrites dans la voix de la gazette et
  avec ses auteurs (`src/game/data/chronicle/p8.js` à `p10.js`, lot 3).

### 6.2 Ce que tu fais

Les faits que la cité a vus, et qui nourrissent les rumeurs de la troisième couche
(`src/game/data/parolesToi.js`, condition entre parenthèses).

| Fait | Où il se lit | Exemple |
|---|---|---|
| Les chutes, ses ruines (`collapses`) | `state.olympus.totalCollapses` (éternel) | « En labourant, mon père a trouvé des tuiles sous la terre. Il y avait un village ici, avant le nôtre. » |
| Une chute de ta main (`manual`) | `state.olympus.manualCollapses` | « Les anciens disent que la ville d'avant est tombée d'un coup, un jour où les greniers étaient pleins. Ce n'était pas la famine. » |
| Le culte proclamé (`profile`) | `state.olympus.unlockedProfile` | « Le veilleur de notre rue parle tout bas, la nuit. Il dit qu'il ne faut pas réveiller la Main. » |
| Ton absence (`away`) | rapport de reprise (`idleReport.lastAbsence`), une heure au moins, vingt minutes après | « Pendant trois jours, personne n'a posé une pierre. Les champs ont poussé quand même. » |
| Le legs choisi à la chute (`legacy`) | `activeEpitaphLegacy` | « Sous les ruines, on a trouvé des réserves encore pleines. Le grain était sec, comme si on l'avait rangé pour nous. » |
| Les bulles cueillies (`bulles`, trois dans la cité) | `state.paroles.bulles`, compté au clic (cityMapRuntime) | « J'avais une idée pour le toit en sortant de chez moi. Au coin de la rue, elle n'y était plus. » |
| La Maison des Plaisirs (`plaisirs`, dix parties) | `chronicleStats.games` | « Mon cousin sert à la Maison des Plaisirs. Il dit qu'il y a une table où quelqu'un joue toutes les nuits. » |
| La caméra qui le suit (`followed`, trente secondes) | `CM.focus.since` | « Depuis le pont, je me sens suivi. Deux fois je me suis arrêté devant une vitrine pour voir. Personne. » |

Les crises résolues ou ignorées passent par le culte qu'elles font naître (`profile`). Le
chemin d'une crise (Traiter ou Profiter) n'est consigné nulle part : à ajouter seulement si
on veut des rumeurs dessus.

Le chemin d'une crise (Traiter ou Profiter) n'est consigné nulle part aujourd'hui : à
ajouter seulement si on veut des rumeurs dessus.

### 6.3 Leur caractère fait la lecture

Le même fait, plusieurs voix, jamais un verdict. Le pieux remercie et demande (« Je
remercie le Créateur pour la récolte, et je demande qu'on garde un œil sur mon frère »), le
râleur compte ce qui ne va pas (« Si Celui qui veille veillait vraiment sur nous, l'égout de
ma rue ne déborderait pas à chaque orage »), le superstitieux touche la main de la porte, le
curieux regarde son toit.

### 6.4 Le nom qu'ils te donnent

**Celui de la Chronique** (décision du 2026-10-07). La rue ne l'invente pas : elle reprend
le dernier nom que la gazette a publié dans ce cycle, et c'est dans la gazette qu'il
s'écrit. Ceux qui existent déjà : « une main invisible » (P3), « le Créateur », « Celui qui
nous guide », « Celui qui regarde » (P4), « Celui qui veille », « la Main » (P5),
« l'Invisible » (P6), « celui qui joue » (P7), puis « l'Absent » (P8), « le Joueur » (P9) et
« Celui qui recommence » (P10). Les cultes de l'Olympe (Dieu de la Fin, des Registres, qui Rêve, du
Bord) y entrent par des articles à écrire, quand l'Olympe proclame une religion. Une table
`articleId → nom` dit quel article donne quel nom ; avant le premier, ils ne t'appellent
pas. Elle vit dans `parolesToi.js` (`NOMS_DU_JOUEUR`, quatorze articles) ; chaque nom s'écrit
dans les deux langues, en tête de phrase et dans la phrase ({Nom}, {nom}), et jamais après
« de » ni « à » (« du Créateur »). La grand-mère ne « disait » pas un nom paru la veille :
les répliques qui le traitent comme ancien attendent la période 5 ; avant, ce sont Raphaël
et Aldric.

---

## 7. Les mots

### 7.1 Le déclic

Aucun bouton n'apparaît tout seul. Un soir, au Feu, le joueur écoute deux hommes près du feu :

> Garin : « Tu crois que le feu nous entend ? »
> Claude : « Le feu, non. » *(il lève les yeux vers la caméra)* « Mais quelqu'un écoute. »

C'est le gardien du feu de la Chronique, celui qui a déjà vu ce genre de nuit. À partir de
là, des passants peuvent **demander un signe** (« Si tu m'entends, fais monter le feu. ») :
le dialogue commence par des signes. Si le joueur ne fait rien : « Comme d'habitude. »

### 7.1 bis Ce qui est fait (lot 5)

Raph, 2026-10-08 : Claude veille chaque nuit au foyer du camp, avec un passant ; la
première écoute de leur causette déclenche le déclic ; sans foyer, au feu du culte, jusqu'à
la période 3.
- **La veillée** (`paroles/veillee.js`) : aux périodes 1 et 2, quand la nuit tombe, Claude
  sort de la tente la plus proche du feu et va s'asseoir au foyer, au nord-ouest, tourné
  vers le feu et vers toi ; un habitant le rejoint (le plus proche encore dehors, sinon tiré
  de chez lui, jamais un deuxième vieux à barbe blanche s'il y a le choix) et s'assoit au
  nord-est. Ils causent. À l'aube, ils se lèvent : l'autre reprend sa journée, Claude
  rentre par une porte et quitte la rue. Au Bois, le foyer du camp est encore le cœur du
  village : il y reste ; sans foyer, il veille devant le culte des ancêtres. Pour qui a
  choisi le plein jour dans les Options, il veille à l'heure de la nuit. Ce sont des
  passants de la rue (fiche, écoute et signes comme les autres) ; Claude est fait à part :
  « Claude, Gardien du feu », l'âge du plus vieux du camp, le vieil homme à la barbe
  blanche, têtu et râleur, « Veille le feu ». Nouveau métier `firekeeper`.
- **Le déclic** : la première causette de la veillée qu'on écoute dans une cité. L'autre :
  « Tu crois que le feu nous entend ? » ; Claude : « Le feu, non. », puis « Mais quelqu'un
  écoute. », et à cette réplique il se lève, tourné vers toi, puis se rassoit. Dans les
  cités suivantes, il se souvient : « Il écoutait déjà, à l'autre feu. » Le panneau « Ce
  qu'on dit de toi » le garde. Mémoire : `state.paroles.declic` { n, city } (le compte
  est éternel, la cité est `cycles + 1000 × grandResetCount` ; les signes vus et les
  bulles prennent la même clé, qui survit au Grand Reset).
- **Leurs causettes** (12) et **ses pensées** (10), à eux seuls : Claude ne pense que ses
  pensées de gardien du feu ; certaines attendent le déclic, une autre cité, la pluie,
  l'hiver, l'article de Garin sur les silex. Un signe à Claude : il sait qui c'est (« Le
  feu monte. Je sais que c'est toi. »).
- **Les demandes** (10, `request`) : après le déclic, aux périodes 1 et 2, une pensée peut
  demander un signe (« Si tu m'entends, fais monter le feu. », le feu seulement s'il y en a
  un près de lui ; le vent, la lumière). Il s'arrête et attend, tourné vers le feu ou vers
  toi (« Attend un signe »), environ 19 s. Ce qu'on te demande va au panneau.
- **Les réponses** (22, `answer`) : le signe qu'il voulait (« Le feu a monté. Il m'a
  entendu. » ; le pieux s'agenouille, le superstitieux court à l'abri, l'enfant court le
  dire à sa mère, le joyeux te fait signe) ; un autre (« J'ai demandé le feu, il m'envoie le
  vent. Ça veut dire non ? ») ; rien, si on le regardait encore : « Comme d'habitude. », et
  il repart. La cité retient qui a été exaucé, et en parle en le nommant (« Si Linnea a eu
  son signe, je peux bien demander le mien. ») ; quatre rumeurs en tout, dont celle de
  Claude (« Il veille seul depuis trop longtemps. Je lui porterai du bouillon demain. »).
- Un signe à quelqu'un d'assis à la veillée : il se lève d'abord, puis réagit, puis se
  rassoit.
Vérifié en jeu au Campement, la nuit : Claude et Gauvin le Rieur au foyer, le déclic
réplique par réplique dans la fiche de Gauvin, Claude debout à « Mais quelqu'un écoute. »,
Linnea la Rieuse qui demande le vent et le reçoit, Soraya qui demande le feu et n'a rien,
l'aube. Une retouche : le premier compagnon tiré avait le même dessin que Claude (deux
chamans au coin du feu).

### 7.2 Quand viennent les mots

**Entre P2 et P3** (décision du 2026-10-07) : au passage de la cité en P3 (index d'ère 9).
C'est l'âge où la gazette parle pour la première fois d'« une main invisible »
(`p3_knowledge_probability`, Raphaël : « Nous lui conseillons de se reposer. »). Avant, des
signes. Chaque cité refait le chemin ; Claude, lui, se souvient : « On s'est déjà parlé. Pas
dans cette vie. »

### 7.3 Le format

Dans la fiche : la réplique du passant, puis deux ou trois réponses courtes. Un échange
tient en deux ou trois tours. Le tutoiement suit le lien : « tu » au coin du feu, « vous »
quand le joueur devient une institution (le Créateur, le tribunal de Khael : « Vous êtes
accusé de cycles. »), « tu » de nouveau au Démiurge, entre égaux.

### 7.4 Qui

- **N'importe quel passant** (décision 5) : de courts échanges choisis par la situation et le
  caractère.
- **Les figures, avec des arcs écrits** :
  - Claude, Edith, Raphaël, Khael et Aldric descendent dans la rue, reconnaissables, et
    changent de métier d'âge en âge comme dans la gazette ;
  - Diogène et la Secte du Feu, qui attend qu'une voix sorte du feu.

### 7.5 Ce que ça change

Le récit seulement :
- ce que le joueur dit change ce qu'ils croient et le nom qu'ils lui donnent ;
- la gazette en parle ;
- les figures qui traversent les cycles s'en souviennent ;
- une promesse se paie : « je reviendrai », puis trois jours d'absence, et quelqu'un s'en
  souvient.

**Le Grand Reset entre dans la fiction.** Au Démiurge, Claude : « Tu vas tout effacer. Même
ça ? » Après le reset, au premier feu : « J'ai rêvé que tu avais dit non. »

### 7.6 Ce qui est fait (lot 6 : parler)

Raph, 2026-10-08 : « gogo », puis, sur l'échantillon : « la plume ça va oui. La voix du
joueur : 4 choix de réponses orientés, soit joueur, soit dieu, soit indifférent, soit
intéressé par la vie du pnj. Le silence, c'est bien. Fais. »
- **Parler** (`paroles/talk.js`) : dès la période 3, la fiche propose « Parler » à un
  passant de la rue, une fois par passant. Il entend une voix : il s'arrête, lève les yeux
  vers toi (« T'écoute ») et dit ce qu'il en pense. La fiche propose **quatre réponses, une
  par voix**, toujours dans le même ordre, et « Se taire » :
  - **le joueur** : « Je joue. », « Tu es dans ma partie. », « J'ai cliqué sur toi. » ;
    chaque âge l'entend avec ses mots (« Tu joues ? Comme les enfants aux osselets ? »,
    les dés à l'auberge, le loto du dimanche, l'écran dans le métro) ;
  - **le dieu** : « Je veille sur vous. », « C'est moi qui ai bâti tout ça. » (c'est vrai :
    il a tout bâti ; « Vous ? Alors c'est vous qui avez construit l'usine à côté de
    l'école. »), « C'est moi que vous appelez {nom}. » quand la gazette lui en a donné un ;
  - **l'indifférent** : « Peu importe. », « Continue ta route. », « Je passais. » ;
  - **sa vie** : ses enfants et son conjoint par leurs prénoms (« Comment va Sira ? »,
    « Sira ? Toujours cette toux. Comment tu connais son prénom ? »), ce qu'il fait (« Tu
    rentres déjà ? »), la disette, son dos, la pluie ; ce qui est propre à lui passe avant
    ce qu'on demande à tout le monde.
  Un échange peut prévoir sa propre réponse pour une voix quand sa question l'appelle (P5,
  « Lequel des deux ? » : « Je fais des essais. », « Je vous guide. », « J'attends. », « Et
  ton frère, vous vous parlez encore ? »). Le répertoire tourne : une réponse déjà dite
  revient après les autres. Il répond selon son caractère, son âge et ce qu'il peut faire
  (le pieux s'agenouille s'il en a la pose, le superstitieux rentre, le râleur compte ce qui
  ne va pas, l'enfant parle en enfant), et fait ce que dit sa réponse. Rien choisi au bout
  de 30 s : le silence répond pour toi (« Tu te tais. »).
- **Le volume** (`data/parolesMots.js`) : 67 premières répliques (de 7 à 9 par période, de P3
  à P10 : la situation, la nuit, la pluie, le travail, le caractère, l'âge, les enfants, les
  articles parus), les quatre répertoires (12 réponses du joueur, 9 questions sur sa vie),
  et ce qu'on répond au silence.
- **Le tutoiement** (§ 7.3) : « tu » à la période 3 et au Démiurge, « vous » entre les deux ;
  l'enfant dit toujours « tu » ; le joueur dit « tu ». Un test le garde.
- **Ce que la cité retient** : à qui tu as parlé, ta réponse, ta voix (`joueur`, `dieu`,
  `indifferent`, `vie`, `muet`) et ce qu'elle dit de toi (« Je vous guide. » : `guide`),
  `state.paroles.mots` (le compte est éternel, le reste par cité). Le panneau « Ce qu'on dit
  de toi » garde l'échange entier (sa réplique, la tienne, la sienne).
- **Les rumeurs** (26, `PAROLES_ECHOS_MOTS`, lues par l'écoute) : la rue nomme celui à qui
  la voix a parlé, jamais celui qu'on écoute (« Orun dit que la voix parle comme un
  seigneur. », « La voix connaît le prénom des enfants d'Orun. » « Comment elle sait ça ? »
  « Elle regarde, je suppose. ») ; et après trois échanges, ce que la cité finit par croire,
  selon la voix qui domine (« Depuis que la voix demande des nouvelles, ma voisine raconte
  sa journée tout haut, dans la rue, au cas où. »).
- **La gazette en parle** (`chronicle/voix.js`, 32 articles, `voix_*` dans
  chronicleEvaluator) : quand une voix domine dans la cité (trois échanges, le silence ne
  compte pas), la gazette publie l'article de cette voix à cette période (« LA VOIX DEMANDE
  DES NOUVELLES : La voix connaît le prénom des enfants et s'inquiète de leurs toux. Les
  mères n'osent plus gronder dans la rue. »), avec la priorité d'une tension. **Et le nom
  qu'ils te donnent suit ta voix** (NOMS_DU_JOUEUR) : le Maître (le dieu), le Joueur, le
  Passant (l'indifférent), le Voisin d'en haut (sa vie), jusqu'au prochain nom que la
  gazette publie. Une seule règle pour « la voix qui domine » : `parolesState.dominantTone`.
- **Les personnages de scène** entendent la voix aussi (le quai, le pont, la place, la
  Maison des Plaisirs, le champ, le bac, la navette, les bateaux ; le porteur du port s'il a
  encore une longue escale) : ils se tournent vers toi et prennent du retard sur leur scène,
  comme pour un signe, et ne la quittent pas (regarder, chercher des yeux, repartir).
- **La promesse** (§ 7.5) : « Je reviendrai te voir. » est une réponse de la voix « sa vie ».
  Elle est gardée (`state.paroles.promesse`, la dernière). Si tu reviens après au moins trois
  jours d'absence (le rapport de reprise), tant que la cité dure, celui à qui tu l'as dite
  s'en souvient (« Tu avais dit que tu reviendrais. Ça fait quatre jours. Je venais ici
  chaque matin. », « vous » de P4 à P9), et les autres le nomment (« La voix avait promis à
  Orun de revenir. Elle a mis quatre jours. »). Le nombre de jours s'écrit en lettres
  jusqu'à douze.
- Vérifié en jeu au Bourg marchand (P3 : Bruna, puis Orun du Pont, « Si c'est encore toi,
  Bertran, ce n'est pas drôle. ») et au Royaume conquérant (P5 : « Je vous teste. »).

---

## 8. L'écriture

- **Un catalogue déclaratif**, comme celui des faits divers. Chaque entrée :
  `{ id, couche, genre ('causette' | 'pensée' | 'signe' | 'dialogue'), quand: { bandes,
  période, articles parus, nuit, temps, foyer de Rupture, trait, métier, faits }, répliques:
  [{ qui, fr, en }], poids }`.
- **Des noms vrais** : une réplique peut citer le conjoint, l'enfant, l'atelier, le logis de
  la fiche (`{conjoint}`, `{enfant}`, `{travail}`). Le mari parle de sa vraie femme.
- **Jamais de redite** (règle 5) : les identifiants entendus sont gardés (éternel).
- **Le volume** : quelques centaines d'échanges en tout, écrits âge par âge et lot par lot,
  comme les faits divers. C'est le vrai coût du chantier.

---

## 9. L'architecture proposée

| Fichier | Rôle |
|---|---|
| `src/game/data/paroles.js` | Le catalogue : données pures. |
| `src/game/core/paroles.js` | **Seule source de mutation** (modèle `faitsDivers.js`) : entendu, signes donnés, déclic, mots dits, nom donné. `state.paroles` déclaré avant `export let state = load()` (piège TDZ), au normaliseur, et dans `GR_PERSISTENT_FIELDS`. |
| `src/game/map/paroles/pick.js` | Le choix d'un échange, **pur et testé** : situation, candidats, poids, pas de redite. |
| `src/game/map/paroles/scene.js` | Tenir la causette le temps de l'échange (`pauseT`, `chatT`), les réactions (pose, regard vers la caméra). |
| `src/game/map/paroles/signs.js` | Les effets des signes, par forme d'âge. |
| `citizenFocus.js`, `CitizenSheet.jsx` | Écouter, Signes, Parler ; la vue d'échange dans la fiche. |
| `ChronicleView.jsx` | Le panneau « Ce qu'on dit de toi ». |
| Tests | Le choix, la redite, l'éligibilité par période, la survie au Grand Reset, l'i18n. |

À compter en plus : les bulles cueillies (§ 6.2).

---

## 10. Les lots

1. ✅ **Écouter, le socle** : le geste, les pensées de tout le monde, les couches 1 et 2, la
   mémoire de l'entendu. Raph juge en jeu.
2. ✅ **Ce qu'on dit de toi** : la troisième couche, branchée sur la Chronique et l'Olympe ;
   le nom de la gazette ; le panneau.
3. ✅ **La Chronique des âges 7 à 9** : P8 à P10, dans la voix de la gazette.
4. ✅ **Les signes** : vent, lumière, feu, bête ; les réactions par âge et par caractère.
   ✅ 4 bis : ce qu'il FAIT (§ 5.6).
5. ✅ **Le déclic et le dialogue par signes** : Claude, au Feu, jusqu'à P3 (§ 7.1 bis).
6. 🚧 **Les mots**, dès P3 : les passants, puis les figures de la Chronique (§ 7.6 : parler,
   les quatre voix, les rumeurs, la gazette, les personnages de scène, la promesse ;
   restent les figures de la Chronique).
7. **Le Démiurge et le Grand Reset dans la fiction.**
8. **Le son des signes**, quand le chantier « ambiance sonore » sera terminé.

---

## 11. Questions

Les six questions du premier jet sont tranchées (tableau 1 bis). Aucune ouverte.

---

## 12. Journal

- 2026-10-07 : idée de Raph et ses cinq décisions. La fiche d'habitant, socle du chantier,
  est faite et committée (`4a99b8bc`). Plan écrit (`fff6bf29`).
- 2026-10-07 : Raph tranche les six questions (tableau 1 bis) : la bête en plus du vent, de
  la lumière et du feu ; les mots entre P2 et P3 ; on écrit la Chronique des âges 7 à 9 ; les
  pensées de tous dès le début ; le nom est celui de la Chronique ; le son après le chantier
  sonore. Lot 1 lancé.
- 2026-10-07 : **lot 1 livré.** La fiche propose **Écouter** tant que le passant cause
  (un salut ne s'écoute que pendant qu'il dure ; écouté, il se prolonge le temps des
  répliques ; des compagnons causent en marchant) et **Ses pensées** toujours. Les
  répliques arrivent une à une (2,8 s), à la place des lignes ; sur la carte, une bulle
  sans texte au-dessus de qui parle. Écrit : 45 causettes et 64 pensées, couches 1 et 2
  (`src/game/data/paroles.js`), avec les vrais prénoms du foyer (conjoint, enfant, hôte).
  Le tirage (`map/paroles/pick.js`, pur) prend le moins entendu puis le plus précis ; les
  répliques d'adulte (la paie, les guichets) ne vont pas à un enfant, et une réplique qui
  nomme quelqu'un que le passant n'a pas est écartée. La mémoire de l'entendu : `state.paroles`, éternelle (`GR_PERSISTENT_FIELDS`),
  son seul enregistreur est `core/paroles.js`. Vérifié en jeu : causette d'un couple au
  prénom de leur fille, pensée liée à la disette, bulle passée de l'un à l'autre.
- 2026-10-07 : **Raph juge la plume** : la vitesse va, parler de leur vie va, mais les
  répliques sonnent « IA codée » (« Tu vas où ? » « Là où je vais tous les jours. » « Ça doit
  être joli, depuis le temps. » ; « le marché crie très fort »). Diagnostic : chaque réplique
  finissait sur un bon mot (la règle 7 le demandait), les choses parlaient, des maximes, et
  des répliques valables à tous les âges, donc vagues. Raph retient les cinq leviers : la
  charte (règle 7 réécrite), les pensées qui suivent ce qu'il fait, un monde par âge, les
  mots de chaque métier, de vrais voisins. **Catalogue réécrit en entier** : 675 entrées
  (153 causettes, 522 pensées), par mondes (Feu et Bois, Pierre taillée et Couronne,
  Marbre, Fonte, Néon, puis Noosphère, Stellaire et Démiurge, plus minces en attendant leur
  Chronique), chaque métier au moins une pensée. Nouvelles conditions : `when.doing` (ce
  qu'il fait, `citizenFocus.doingOf`, la même lecture que la ligne « Activité »),
  `when.job` (le métier exact ; les familles passent dans `when.group`), `when.season`.
  Nouveaux prénoms : {voisin}, {voisine} (les adultes d'une maison à quatre cases de chez
  lui, la tête du foyer d'abord, celle dont la maison porte le nom), {gamin}, {gamine} (les
  enfants de ces maisons) ; `paroles/listen.js`, `neighborsOf`.
- 2026-10-07 : Raph, sur la plume : « nettement mieux, on passe au lot 2 avec le style
  adapté ». **Lot 2 livré**, dans la même plume : 100 rumeurs (82 pensées, 18 causettes),
  `src/game/data/parolesToi.js`, période par période (la tradition orale du Feu ne sait rien
  de toi ; l'argile parle de dieux ; Raphaël invente « la main invisible » ; puis le
  Créateur, Celui qui veille, la Main, le procès de l'Invisible, « je crois qu'il joue »), et
  par faits vus (§ 6.2). **La confiance** : trois paliers selon les échanges déjà entendus (5,
  15, 40) : on PENSE à toi au premier, on en PARLE au deuxième, et seulement à l'écart (la
  nuit, hors de la place, du marché, du travail et de l'école), jamais le taciturne ; le
  troisième ouvre ce qu'on n'ose pas dire (« il m'arrive de penser à voix basse, au cas
  où »). Une rumeur pèse un peu plus au tirage quand elle vient. **Le panneau** « Ce qu'on
  dit de toi » dans la Chronique (`ParolesChronique.jsx`) : absent tant que rien n'a été
  entendu, la réplique, qui l'a dite, l'âge et le temps de jeu, l'échange entier au survol ;
  en tête, « On t'appelle la Main » si la gazette de ce cycle a donné un nom. La mémoire :
  `state.paroles.toi` (éternelle, 120 au plus, le texte relu dans le catalogue) et
  `state.paroles.bulles` (par cité). Vérifié sur une foule générée aux sept périodes : la
  grand-mère qui « disait » un nom paru la veille, et la caméra qui suit d'office le passant
  désigné (il se sentait suivi à chaque fois) ont été corrigées.
- 2026-10-07 : Raph : « continue ». **Lot 3 livré** : la Chronique des âges 7 à 9, 93
  articles (`chronicle/p8.js`, `p9.js`, `p10.js`, 31 chacun, toutes les catégories de la
  gazette), dans sa voix et avec ses auteurs, tenue par la plume (des faits, des noms, des
  chiffres ; l'ironie de la situation). L'arc : il manque une pensée au chœur (**l'Absent**),
  le conseil des étoiles adopte le mot de Raphaël (**le Joueur**), les archives de l'Amas
  montrent la main qui recommence (**Celui qui recommence**). Des fils se répondent d'une
  période à l'autre : la chaise vide de Khael (P6, puis la rumeur du lot 2, puis chaque
  conseil, puis chaque maison), la lettre d'Ilya qui demande un été plus long (P9), retrouvée
  et accordée par le conseil (P10), Raphaël qui part chercher le bord du jeu et revient
  sans en avoir trouvé, le feu de Claude que rien ne branche. Le Grand Reset reste au lot 7 :
  la gazette le pressent (« quand tu recommences, est-ce que tu nous gardes quelque part ? »)
  sans le dire. `getPeriod` suit l'âge au-delà de l'ère 34 ; `NOMS_DU_JOUEUR` gagne les trois
  noms ; la rue a douze rumeurs de plus sur ces articles (112 en tout).
- 2026-10-07 : Raph : « enchaine ». **Lot 4 livré** : les signes (§ 5.5). La rangée « Signe »
  de la fiche (Vent, Lumière, et Feu ou Bête quand il y en a un près de lui), le passant qui
  s'arrête et se tourne vers ce qu'il a vu, puis sa pensée. Dessin : `iso/isoSignes.js` (la
  rafale de feuilles sèches et de poussière, le rayon oblique et sa flaque dans la couche de
  lumière, les langues et la gerbe d'étincelles au-dessus du feu attisé, dont la lueur
  grandit) ; la bête se tourne dans son propre dessin (bétail, chien promené). Décision :
  `paroles/signs.js`. 253 pensées (`data/parolesSignes.js`), par âge, caractère et fois ; la
  troisième fois « Ça suffit. », et il ne s'y prête plus. Vérifié en jeu au Feu (le foyer
  qui monte, Mahaut la pieuse : « Grand-mère ? C'est toi ? », puis « Grand-mère revient.
  Je lui poserai une noisette sur la pierre ce soir. », puis « Ça suffit, grand-mère. »), et
  au Bourg (le chien de Bertran : elle le regarde, se retourne, le regarde de nouveau). Deux
  retouches en cours de route : les langues de feu restaient cachées dans la flamme du grand
  foyer (elles partent désormais du haut de la flamme), et les feuilles vertes disparaissaient
  sur l'herbe (le vent soulève des feuilles sèches). Muets jusqu'à la fin du chantier sonore.
- 2026-10-07 : Raph, sur le lot 4 : les réactions sont étranges et le passant continue de
  marcher tranquillement ; il veut des gestes (s'agenouiller sous la lumière, fuir en
  courant). Dix idées, toutes retenues. **Lot 4 bis livré** (§ 5.6) : la pensée annonce le
  geste et il le fait ; les passants autour regardent aussi ; les personnages de scène du
  quai, du pont, de la place et de la Maison des Plaisirs s'arrêtent ; la fiche dit ce
  qu'il fait. 325 pensées, chacune avec son geste. Ni le port, ni le bac, ni les bateaux (une
  autre session y travaille), ni le laboureur.
- 2026-10-08 : Raph a essayé : « la position à genoux est bonne. On fait les petits manques
  puis on enchaîne lot 5 ». Il tranche : vent et lumière seuls aux âges 7 à 9 ; les signes
  branchés sur les marins, le bac, le port et le laboureur ; au lot 5, Claude veille chaque
  nuit au foyer du camp, et au feu du culte jusqu'à la période 3 si la cité a quitté le camp.
  **Petits manques comblés** (§ 5.6) : la rue parle de ceux qui ont reçu un signe en les
  nommant, le panneau garde les pensées de signe qui parlent de toi, et les gens des bateaux,
  du port, du bac et du champ reçoivent des signes.
- 2026-10-08 : Raph : « on enchaîne lot 5 ». **Lot 5 livré** (§ 7.1 bis) : la veillée de
  Claude au foyer du camp, chaque nuit des périodes 1 et 2, avec un habitant ; le déclic à
  la première causette écoutée (« Mais quelqu'un écoute. », et Claude se lève) ; les
  passants qui demandent un signe, attendent, et pensent ce qu'ils ont reçu, ou « Comme
  d'habitude. » ; la rue nomme ceux qui ont été exaucés. Vérifié en jeu au Campement.
- 2026-10-08 : Raph : « gogo ». **Lot 6 commencé** (§ 7.6) : « Parler » dès la période 3, une
  fois par passant ; il entend la voix, tu réponds (deux ou trois réponses, ou le silence),
  il répond selon son caractère et fait ce qu'il dit ; la cité retient ta manière, le panneau
  garde l'échange ; le tutoiement suit le lien. Un échantillon de dix échanges, de P3 à P10,
  à juger avant d'écrire le reste. En passant : le test d'aller-retour de sauvegarde, cassé
  par le lot 5 (le déclic manquait à la partie de test), est réparé.
- 2026-10-08 : Raph, sur l'échantillon : « la plume ça va oui. La voix du joueur : 4 choix de
  réponses orientés, soit joueur, soit dieu, soit indifférent, soit intéressé par la vie du
  pnj. Le silence, c'est bien. Fais. » **Les quatre voix** (§ 7.6) : une réponse par voix à
  chaque échange, de l'échange ou du répertoire de la voix ; sa vie se demande par les
  vrais prénoms de la fiche. **Le volume** : 67 premières répliques de P3 à P10. **Les
  rumeurs** : la rue nomme celui à qui la voix a parlé, et finit par croire ce que dit la
  voix qui domine.
- 2026-10-08 : **La gazette parle de la voix** (§ 7.6) : un article par voix et par période,
  quand une voix domine dans la cité ; le nom qu'ils te donnent suit ta voix (le Maître, le
  Joueur, le Passant, le Voisin d'en haut).
- 2026-10-08 : **Les personnages de scène** entendent la voix (ils se tournent, ne quittent
  pas leur scène), et **la promesse** se paie : « Je reviendrai te voir. », trois jours
  d'absence, et celui à qui tu l'as dite s'en souvient ; la rue le nomme.
