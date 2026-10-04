# PLAN-COMPORTEMENTS — le comportement des habitants « au maximum »

> Ouvert le 2026-10-04. **VALIDÉ par Raph le jour même** : « fait tous les lots,
> commit après en avoir fini un puis enchaîne celui d'après. oui pour les choix,
> pixellab direct. Après avoir fini tu referas une passe d'analyse pour vérifier que
> tes conclusions de l'audit sont remplies ». Il FAIT FOI. Suite du lot D de `docs/PLAN-VIVANT.md` (« la vie dans la rue »), qui reste
> la charte du DESSIN ; ce plan-ci ne parle que de ce que les gens FONT.
>
> Demande de Raph (2026-10-04, après les flâneurs des places) : « on va revoir tous
> les comportements des habitants et améliorer leur comportement au maximum ok ?
> regarde comment ».

## 0. Ce qui est déjà acquis (ne pas refaire)

- Les gens des PLACES flânent, s'arrêtent aux étals, causent à 2-3, font un tour,
  quittent la place par une rue (`iso/plazaFolk.js`, poussé `1577b84`).
- Les passants marchent en petits groupes (~24 %), causent parfois, courent sous
  la pluie s'ils rentrent (`COMPANIONS`, `RAIN_SHELTER`, agents.js).
- Ils marchent du bon côté de la chaussée, sur le tablier des ponts, s'arrêtent au
  parvis des merveilles (vagues `wonderPull`), sans dash ni glissade.
- Promeneurs des quais, accoudés et pêcheur des ponts, voyageurs du bac, porteurs,
  laboureurs, filles des Plaisirs, petite vie (oiseaux, chats, chiens, canards…).

## 1. Diagnostic (audit du 2026-10-04, trois relevés du code)

### 1.1 Les passants des rues
1. **Ils n'ont pas de vrai trajet.** Aucun calcul de chemin : à chaque case, le pas
   qui rapproche le plus du but, et 5 % de chances par case de changer d'avis.
   « Va au travail » change sans arrêt, un but derrière le fleuve se trouve par
   chance, un passant qui rentre peut rester coincé pour toujours.
2. **Ils ne s'arrêtent jamais**, sauf sur une place ou un parvis. Arriver au travail
   ou chez soi = repartir aussitôt. Personne n'entre travailler, n'achète, ne s'assoit.
3. **La journée n'a pas de rythme.** Le lieu de travail est tiré au hasard dans toute
   la ville, sans lien avec la maison. La nuit : un tiers « dort » à n'importe quelle
   porte, les autres errent ; 18 % traversent encore le fleuve.
4. **Ils ne voient personne.** Ils se traversent entre eux, traversent les charrettes,
   changent de trottoir à chaque virage (le côté dépend du sens de marche).
5. **La pluie à moitié** : seuls ceux qui rentrent réagissent, les autres flânent
   sous l'averse ; après la pluie on ne ressort pas, on est remplacé.
6. **L'émeute vit à côté d'eux** : les émeutiers sortent de nulle part, vont 3 à 8×
   plus vite, disparaissent d'un coup ; les passants ne fuient ni ne regardent.
7. **Bugs relevés** :
   - le fondu d'apparition/disparition est CALCULÉ mais jamais DESSINÉ (`p.fade`,
     `_sleepFade`) → les passants popent à la porte ;
   - la bulle de pensée va à un passant au hasard parmi ~900, souvent hors écran ou
     endormi (cf. `REPRISE-bulles-habitants.md`, jamais corrigé) ;
   - les obstacles des places suivent l'ANCIEN décor supprimé → les passants
     traversent les étals et les bancs du kit iso ;
   - les porteuses de panier n'apparaissent jamais (`v.woman` jamais posé) ;
   - le chien est décalé de son maître et ne s'efface pas avec lui ;
   - un suiveur dont le meneur s'est couché le rattrape à l'aube EN LIGNE DROITE à
     travers les maisons ; un suiveur détaché ne retrouve jamais de groupe.

### 1.2 Tous les autres (personnages de scène)
1. **Des statues** : aucune animation d'attente n'existe — tout personnage arrêté
   est figé sur l'image 0 (accoudés, voyageurs, porteurs à l'arrêt, équipages, filles
   du balcon, causettes). Le geste « salut » d'un matelot ne se voit pas.
2. **Des apparitions/disparitions à vue** : voyageurs du bac (personne ne monte ni
   ne descend — et ceux du pont du bac ne sont pas ceux qui attendaient), porteurs à
   l'accostage, promeneurs des quais au seuil de la nuit, chiens à 0,55 de nuit,
   émeutiers.
3. **Des boucles mécaniques** : le laboureur dans le même sillon pour toujours, les
   porteurs à demi-cycle exact, les filles sur une ellipse à vitesse constante, les
   navettes des scènes de bâtiment (le « métronome » déjà refusé pour la caravane).
4. **Le temps qu'il fait ignoré** : pluie, nuit, saison ne changent presque rien.
5. **Distribution pauvre** : promeneurs des quais, porteurs, laboureurs = hommes
   seuls ; même ordre d'accoudés sur tous les ponts ; l'amphore à toutes les ères ;
   un seul costume pour les humains des scènes de bâtiment.
6. **Ils s'ignorent** : les promeneurs passent à travers mouettes, chats et héron ;
   les oiseaux ne fuient que les passants des rues et les flâneurs des places.

## 2. Règles (reprises des plans et des refus — ne pas rouvrir)

- ⛔ Pas de gens EN CERCLE (« ça fait secte »), sauf clin d'œil voulu (fait divers).
- ⛔ Pas de fantômes derrière les bâtiments. ⛔ Pas d'agrandissement des habitants
  (échelle close, habitant visible = 10 px). ⛔ Pas de recuisson des émeutiers.
- ⛔ Pas de volée d'oiseaux dans le ciel ; pas de halage ; personne sur les grands
  bateaux ; pas de pêcheur dans un bateau amarré ; rien POSÉ sur une scène moteur.
- On entre et on sort par une PORTE ; rien ne pop à l'écran.
- Sans état f(now) dès que possible (captures reproductibles) ; horloge murale,
  jamais `setTimeout` (`__demoCity` tue les minuteries).
- Une seule main de dessin (aplats + contour), lumière haut-gauche, ombre du soleil
  calculée par le jeu ; 4 diagonales, marche 6 images.
- Dose calme, « à découvrir ». Pilote bande 4 → planche → verdict → déroulé.
- Tout personnage se signale par `noteSceneFigure`/`noteFigure` (fiche cliquable).

## 3. Les lots proposés

### Lot 1 — Réparer ce qui se voit (code seul, rapide, sans risque)
- Dessiner enfin les fondus (porte, nuit, recalcul de la carte = glisser, pas sauter).
- Bulles : seulement sur un passant VISIBLE et éveillé ; rythme 30-70 s.
- Les passants des rues contournent le mobilier des places (`plazaBases`) et ne se
  posent plus tous au centre exact de la case.
- Porteuses de panier ; chien collé à son maître (fondu compris).
- Personne coincé : délai de grâce puis nouveau but ; suiveur qui suit les rues.
- Oiseaux qui fuient aussi promeneurs, porteurs, émeutiers.

### Lot 2 — Des trajets qui ont un sens (le cerveau des passants)
- Vrai calcul de chemin sur le réseau piéton (A*, chemins mis en cache) : on va
  quelque part, on y arrive.
- Une vie : une maison, un travail PROCHE, un emploi du temps sur l'horloge du jour
  (le matin on part au travail, on ENTRE par la porte et on ressort plus tard ; à
  midi le marché, la place ; le soir on rentre ; la nuit, peu de monde dehors).
- Des arrêts en route : devant une échoppe, deux connaissances qui se croisent et
  causent, une halte à l'ombre ; puis on repart.
- Discipline de trottoir : on garde son côté, on traverse aux carrefours.
- Des allures : enfants qui trottinent, vieux lents, pressés sous la pluie.

### Lot 3 — Fini les statues (attente animée)
- 3a, code seul : petits gestes sans nouveau dessin — se tourner vers celui qui
  parle, regarder passer un bateau, piétiner (alterner deux images), le bac qui
  arrive regardé par ceux qui attendent.
- 3b, dessin (PixelLab, pilote bande 4) : une courte bande « attente / parler / saluer »
  par habitant, utilisée partout où quelqu'un est arrêté (causettes, accoudés,
  voyageurs, équipages, balcon). Coût : 8 dessins × 10 ères, à chiffrer avant.

### Lot 4 — La ville réagit (météo, nuit, saisons, émeute)
- Pluie : TOUT le monde réagit (presse le pas, s'abrite sous un auvent ou une
  porte), et ressort après l'averse.
- Nuit : un point de lumière tenu à la main aux ères anciennes (lanterne, torche —
  dans le calque de lumière, sans nouveau dessin), du monde le soir près des
  tavernes et des Plaisirs, la rue presque vide au cœur de la nuit, l'aube qui
  remet tout le monde en route.
- Saisons : moins de flâneurs l'hiver et plus vite, plus de monde au bord de l'eau
  l'été.
- Émeute : les émeutiers SORTENT des passants et y retournent (plus de pop) ; les
  passants s'écartent, certains regardent de loin.

### Lot 5 — Les scènes vivent mieux
- Bac : les voyageurs montent et descendent vraiment (ceux du pont = ceux qui
  attendaient) ; attendants de la navette cliquables.
- Porteurs : charge de leur ère (amphore → sacs → caisses → conteneurs), rythme
  irrégulier, ils viennent de l'entrepôt.
- Laboureur : change de sillon, souffle au bout du champ, rentre le soir ;
  moissonneurs l'été (PLAN-TERROIR T4).
- Quais : femmes et enfants aussi, on part par un escalier ou une rue la nuit, on se
  double sans se traverser, on contourne les chats et les mouettes.
- Ponts : distribution différente par pont, des habitués qui arrivent et repartent.
- Humains des scènes de bâtiment : costume de leur ère (dessin), fin des allers-
  retours métronomes.

### Lot 6 — Un seul peuple (fondation, en continu)
- Un registre commun de toutes les figures (position, s'il marche) : chacun évite
  les autres, les oiseaux fuient tout le monde, les faits divers savent où se poser.
- Aides communes : fondu, regard, geste, réaction à la pluie.

## 4. Coordination

- `agents.js`, `cityMapRuntime.js`, `isoUnits.js` portent ~400 lignes NON commitées
  d'autres sessions (fiche cliquable surtout) : les lots 1, 2 et 4 y touchent →
  attendre ou obtenir leur commit avant de commencer.
- Faits divers : leurs figures se poseront dans le registre du lot 6.
- Bateaux, Plaisirs, Terroir : les lots 5 se font avec ou après leurs sessions.

## 5. Décisions de Raph (2026-10-04)

1. Tous les lots, dans l'ordre, un commit par lot.
2. Lot 3b : PixelLab directement.
3. Émeute : les émeutiers sortent des passants et y retournent — OUI.
4. Nuit : lanternes et torches tenues à la main aux ères anciennes — OUI.
5. À la fin : une passe d'analyse qui vérifie chaque constat du §1.

## 6. Journal

- 2026-10-04 : audit (passants des rues, personnages de scène, plans et refus) ;
  brouillon de ce plan, validé.
- 2026-10-04 — **LOT 1 FAIT** :
  - fondus enfin DESSINÉS (`drawIsoCitizenItem` applique `fade × _sleepFade`,
    ombre comprise ; apparition 0,5 s devant la porte) ;
  - bulles tirées parmi les passants À L'ÉCRAN, éveillés, hors fondu, pas au dézoom ;
    30-70 s ; ancre lue sur la variante du passant ;
  - places : `plazaWalkAnchors` (isoPlaza.js) donne à chaque case son point de
    passage hors de la base des meubles, case pleine retirée du réseau — remplace la
    géométrie de juillet (`fountainCells`/`plazaPropCells`, supprimée) ; petit écart
    personnel au centre libre ;
  - compagnons : rentrent, dorment et ressortent AVEC leur meneur (fondu miroir),
    se raccrochent à un autre une fois lâchés ; branche « courir sous l'averse » vivante ;
  - délai de grâce du partant (40 s : porte la plus proche ; 80 s : il entre où il est) ;
  - chien : collé au maître DESSINÉ, dans son fondu, plus de disparition générale à 0,55 ;
  - porteur de panier : phase de pas tirée de sa graine (plus de la position) ;
  - **registre des figures** (`src/game/map/figures.js`, double tampon) : passants
    visibles, flâneurs des places, promeneurs des quais, porteurs, émeutiers ; les
    oiseaux fuient TOUT ce qui marche ;
  - banc `__tests__/comportementsLot1.test.js` (5) ; sonde en jeu : 0 pied dans un
    meuble de place sur 193 relevés (contrôle sans points de passage : 0,4 %).
  - Reporté au lot 3 (dessin) : les porteuses de panier — `basket-woman` n'a jamais
    été dessinée, poser `v.woman` ne ferait rien apparaître.
- 2026-10-04 — **LOT 2 FAIT** :
  - **chemin** : A* sur le réseau piéton (`src/game/map/citizenRoute.js`, mêmes règles
    que le pas : masques, parvis, anneau du feu ; mémoïsé par ville), suivi case par
    case, repli glouton seulement sans chemin ; fini le re-tirage de 5 % par case ;
    îlots du réseau numérotés (`walkComponent`) — on ne vise jamais un but sans
    chemin ; ⚠ vécu : le parvis d'une merveille posée sur un ÎLOT du fleuve n'était
    pas numéroté (hors walkRoadList) → 270 passants marchaient vers un but
    impossible ; corrigé en numérotant CM.walkRoadSet ;
  - **porte la plus proche EN MARCHANT** pour le partant et le sans-logis
    (`walkNearest`), plus à vol d'oiseau ;
  - **journée** (`src/game/map/citizenDay.js`, horloge CM.dayP) : travail le matin,
    place à midi, courses et travail l'après-midi, retour le soir ; un quart de
    couche-tard la nuit ; travail tiré à moins de 18 cases de la maison
    (`citizenWorkNear`) ;
  - **entrer par la porte** (`p._enter`) : travail 16-42 s, courses 5-13 s, maison
    6-20 s le jour, jusqu'à l'aube le soir (sorties étalées sur l'aube) ; immobile
    pendant le fondu ; un passant né la nuit sur son seuil y est déjà rentré ; le
    « tiers dormeur » qui s'effaçait à n'importe quelle porte disparaît ; cible de
    foule ×1,25 (une partie de la foule est dedans) ;
  - **arrêts en route** : lèche-vitrine devant un atelier (6 %, 1,8-4,4 s, tourné vers
    la façade) ; deux passants qui se CROISENT se saluent et causent (30 % par
    rencontre, 3-6,5 s, face à face ; rangés par position DESSINÉE — par case visée,
    deux passants qui se croisent échangent leurs cases pile au croisement) ;
  - **trottoir tenu** : on garde son côté le long d'une rue ; au carrefour, le
    trottoir du côté d'où l'on vient ;
  - **allures** : pas lent (15 % des adultes), rentrer d'un bon pas le soir, un peu
    pressé le matin, flânerie du soir plus lente ; démarrage progressif (0,5 s) ;
  - fiche (citizenFocus.js, chantier de la session « PNJ cliquables ») : « Fait ses
    courses », « Regarde une vitrine », « Entre au travail », « Se promène à la nuit
    tombée », « Avec » pendant une causette de rencontre ;
  - banc `__tests__/comportementsLot2.test.js` (10) ; 1 000 passants : 0,6 ms par
    frame (p95 1 ms) ; en jeu 0 passant sans chemin.
