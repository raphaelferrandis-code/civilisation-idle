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
     endormi (cf. `docs/archive/REPRISE-bulles-habitants.md`, jamais corrigé) ;
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
- 2026-10-04 — **LOT 3 FAIT** :
  - **attente animée** (3b, PixelLab direct) : chaque habitant de la garde-robe (66
    personnages, 10 ères, enfants compris) a sa bande d'attente « respiration » —
    4 images × 4 diagonales + demi-bandes, `{nom}-idle-{dir}.png`, même cadre et
    même palette que sa marche (`scripts/fetchAgentIdle.mjs` : archive PixelLab →
    ombre retirée → couleurs ramenées sur la palette de la marche) ;
    `drawNamedAgentIso` la joue dès qu'un passant est ARRÊTÉ (causette, vitrine,
    place, parvis, seuil), 280 ms par image, déphasée par passant — plus aucune
    image figée ; molette `__idleAnim` ;
  - **l'équipage des bateaux** respire aussi (boatKit.drawCrew posait l'image 0 de la
    marche : `agentIdleFrameIso`, déphasé par marin) ;
  - **regards** (3a) : sur la place, le flâneur en halte se tourne vers le centre (sa
    fontaine, son marché) ; ceux des places (plazaFolk) jettent un coup d'œil de
    côté de temps en temps (toutes les 6-11 s, 1,6 s) ;
  - **porteuses de panier** : `basket-woman` existait (commit 36b9976f, toutes ses
    directions) mais `v.woman` n'était jamais vrai — une porteuse sur deux
    (cityMapRuntime) ;
  - banc `__tests__/comportementsLot3.test.js` (une garde par habitant : 4 bandes +
    demi-bandes, format de la marche, palette incluse).
- 2026-10-04 — **LOT 4 FAIT** :
  - **pluie** : on presse le pas (×1,35), l'agenda se replie (moins de place, de
    merveille, de balade ; plus de maison, de courses) ; à l'instant où l'averse
    devient franche, trois flâneurs sur quatre partis AU SEC revoient leur programme
    (vécu : 454 passants sur 728 marchaient encore vers une place) ; repli sans
    place sous la pluie ; on s'abrite parfois sous un auvent, dos au mur, 12-40 s
    (≈ 15-20 % de la foule à la fois — à 30 % par seuil et jusqu'à la fin de
    l'averse, c'était la MOITIÉ de la ville figée) ; qui rentre chez soi ne
    s'abrite pas ; l'averse passée, ceux que la pluie renvoyait chez eux et pas
    encore rentrés reprennent leur journée (`cmRetireExcessCitizens`) ;
  - **places** (plazaFolk) : la nuit, sous l'averse et l'hiver, plus de flâneurs
    quittent la place par une rue (en fondu) ; le temps qu'il fait est FIGÉ par
    créneau (une averse ne réécrit pas l'identité des flâneurs passés) ;
  - **quais** : moins de promeneurs sous la pluie (~30 %) et l'hiver (~65 %), qui
    s'effacent en fondu au seuil ;
  - **nuit** : lanterne pendue à la main (bandes 2-5) ou torche levée (bandes 0-1)
    pour un peu plus de la moitié des passants et tous les couche-tard ; verre
    ambré + lueur dans la couche de lumière, masquée par ce qui passe devant ;
    molette `__carryLight` ;
  - **saisons** : l'hiver, moins de place et de balade, une part de la journée au
    logis, un pas plus vif ; l'été, plus de flânerie ;
  - **émeute** : les émeutiers SORTENT des passants (le plus proche de la foule,
    masqué le temps de l'émeute) et leur RENDENT la place à la fin, au clic
    d'apaisement ou quand la foule décroît — là où l'émeutier s'est arrêté, en
    fondu ; sans passant, l'émeutier d'appoint s'efface en 0,8 s ; allure d'une
    foule échauffée (13-17 px/s, elle « glissait » à 24-34) ; file lissée ; à moins
    de 6 cases, un passant sur deux s'éloigne d'un bon pas, un sur quatre s'arrête à
    distance pour regarder (une décision par émeute) ; pas de rendez-vous dans le
    quartier de l'émeute ;
  - fiche : « Attend sous un auvent », « Fuit l'émeute », « Regarde l'émeute » ;
  - banc `__tests__/comportementsLot4.test.js` (11) ; en jeu sous l'averse forcée :
    728 → 330 passants (palier existant), 454 → 48 en route vers une place, 72 à
    l'abri au pic.
- 2026-10-04 — **LOT 5 FAIT** (sauf les filles des Plaisirs, cf. fin) :
  - **bac** : ce sont LES MÊMES — le groupe qui attend au ponton est celui qu'on voit
    ensuite sur le pont (boatKit `passNames` sur les places de voyageur du bac, qui
    garde ses places d'une traversée à l'autre) ; pendant l'escale, ceux qui arrivent
    DESCENDENT à pied jusqu'au bout de l'embarcadère où ils s'effacent, puis ceux qui
    attendaient MONTENT chacun à sa place ; le pont cuit ne montre ses voyageurs
    qu'une fois tous arrivés (`ferryDeckHidden`) ; le groupe suivant apparaît en fondu
    sur l'autre rive ; chacun respire à son rythme ;
  - **porteurs** : pauses tirées à chaque aller-retour, départ décalé, une porteuse sur
    trois, charge de l'ère (ballot, panier, sac, amphore, caisse, carton, conteneur à
    voyant), arrivée de la rive en fondu et RETOUR à la rive avant le départ du bateau
    (plus d'escale trop courte avec deux porteurs qui popent) ;
  - **laboureur** : sillon après sillon en zigzag, souffle au bout du champ, demi-tour en
    ARC (la bête mène — plus de saut de 0,54 case), rentre au crépuscule ; **l'été,
    les moissonneurs** (deux faucheurs à la faux, une lieuse qui s'arrête lier) ;
  - **quais** : promeneuses, un accompagnant sur trois est un enfant ; l'accompagnant
    se tient du côté extérieur de sa file (il croisait l'autre file en plein) ; on se
    double en s'écartant ; fondu du soir allongé ; **le héron s'envole** quand un
    passant marche à moins de 0,8 case (il se laissait traverser) ;
  - **ponts** : ordre et dessins tirés par travée, un pont sur trois sans pêcheur ; les
    habitués ARRIVENT en longeant le parapet, s'accoudent, jettent des regards le long
    du pont, REPARTENT ; chacun son souffle ; la nuit, deux sur trois sont rentrés ;
  - **scènes de bâtiment** : la navette (paysan, chaland) a élan, freinage, halte au
    bout et au départ, des allures qui changent d'un tour à l'autre, des pas calés sur
    la distance ; un CLIENT DIFFÉRENT à chaque tour (fondu au bord), une cliente sur
    deux (`basket-woman`) ; aux âges industriels et après, ce sont les habitants de
    l'ère (le chapeau de paille y était anachronique) ;
  - banc `__tests__/comportementsLot5.test.js` (10) ; en jeu : descente/montée du bac
    filmée à l'escalier du quai, porteurs filmés sur une escale de 16 s, laboureur et
    moissonneurs en bande 4.
  - **Laissé aux sessions qui tiennent ces fichiers** (non commités chez elles) : les
    filles des Plaisirs (vitesse constante sur l'ellipse, pas calés sur la distance,
    ne plus se traverser — demandé à la session « Passage des filles ») ; les
    attendants de la navette cliquables (demandé à la session « PNJ cliquables »).
- 2026-10-04 — **LOT 6 FAIT** :
  - **registre des figures** (`figures.js`) : rangé par cases de 64 px à la première
    question de la frame (il parcourait toute la liste pour chaque pigeon, mouette,
    héron) ; y entrent désormais aussi les voyageurs du bac, les laboureurs et
    moissonneurs, les accoudés des ponts (en plus des passants, flâneurs, promeneurs,
    porteurs, émeutiers des lots 1-5) ; `figAhead` (quelqu'un devant ou à côté ?) et
    `figFree` (une place libre, pour qui veut se poser — faits divers) ;
  - **on s'évite** (agents.js, `AVOID`, molette `__avoid`) : un passant qui a quelqu'un
    devant lui — de n'importe quel peuple — fait un pas de côté du côté libre et le
    garde tant que l'autre est à côté ; vécu au banc : en dépassant un lent sur le même
    bord, 0 px d'écart avant (il lui passait au travers), 6 px après ; coût mesuré en
    jeu (576 passants) : dans le bruit (0,7 ms médian contre 0,9) ;
  - les **aides communes** (fondu, regard) ne sont pas factorisées : chaque peuple garde
    les siennes, déjà écrites et testées lot par lot ; rien de visible à gagner à les
    déplacer dans des fichiers que d'autres sessions tiennent ouverts ;
  - banc `__tests__/comportementsLot6.test.js` (3).

## 7. Passe d'analyse (2026-10-04, après les six lots)

Chaque constat du §1, revérifié dans le code, au banc et EN JEU (serveur de capture,
ville de bande 4, 943 passants, sim pas à pas). ✅ = réglé et mesuré ; ◐ = en partie ;
le reste dit pourquoi.

### 7.1 Les passants des rues
1. **Pas de vrai trajet** ✅ — A* (lot 2). En jeu sur 40 s simulées : **0** changement de
   but en route, **0** passant immobile plus de 5 s sans raison (halte, porte, émeute).
2. **Ne s'arrêtent jamais** ◐ — on entre par la porte (travail, courses, maison), on
   lèche les vitrines, on se salue en se croisant, on s'abrite sous un auvent (lots 2,
   4) ; en jeu ~7 % de la foule est à l'intérieur en journée. Reste : personne ne
   **s'assoit** (pas de dessin assis — un lot de dessin à part).
3. **La journée n'a pas de rythme** ✅ — travail tiré près de la maison : **13 cases en
   médiane, 17 pour 90 %** (il était tiré dans toute la ville) ; rentrer le soir,
   ressortir à l'aube étalé. ⚠ **Trouvé par cette passe** : les buts de la journée
   survivaient à la nuit (36 s après la tombée de la nuit, 372 passants sur 943
   marchaient encore vers une place, **40 traversaient le fleuve**). Corrigé (agents.js,
   `DUSK_RETHINK`) : chacun revoit son programme à son heure (étalé sur ~45 s) ;
   remesuré : **1** traversée, 194 rentrent, 17 % déjà chez eux 46 s après, les 88 en
   route vers une place sont tous des couche-tard partis APRÈS le crépuscule (la sortie
   du soir voulue). Banc `comportementsAnalyse.test.js`.
4. **Ne voient personne** ✅ — trottoir tenu (lot 2), rencontres (lot 2), évitement par le
   registre (lot 6). En jeu, passants À L'ÉCRAN qui se superposent (< 3 px) : **3,07 →
   0,04** par relevé (évitement éteint / allumé, même ville, même minute).
5. **La pluie à moitié** ✅ — lot 4, mesuré (454 → 48 en route vers une place, abri ~15-20
   %, on ressort après l'averse).
6. **L'émeute à côté d'eux** ✅ — lot 4 (sortent des passants et y retournent, allure de
   foule, fuite / regard), banc.
7. **Bugs** ✅ — fondus dessinés, bulles à l'écran, obstacles des places, porteuses,
   chien, compagnons (lot 1) ; porteuses posées (lot 3).

### 7.2 Tous les autres
1. **Des statues** ✅ — 66 habitants + 2 porteurs de panier respirent à l'arrêt (lot 3),
   et l'équipage des bateaux aussi. Les filles de la Maison des Plaisirs à la porte et
   au balcon respirent depuis le §8, et le matelot salue vraiment (§8).
2. **Apparitions / disparitions à vue** ✅ — bac (on monte, on descend), porteurs (de la
   rive à la rive), quais (fondu), chiens (lot 1), émeutiers (lot 4), accoudés des ponts
   (arrivent et repartent), laboureur (rentre au crépuscule).
3. **Boucles mécaniques** ✅ — laboureur (sillons, souffle, arc), porteurs (pauses
   tirées), navettes des scènes de bâtiment (élan, haltes, allures), filles des Plaisirs
   (vitesse au sol constante, pas calés sur la distance, un couloir chacune — fait par la
   session « Passage des filles », NON COMMITÉ chez elle).
4. **Le temps qu'il fait ignoré** ✅ — passants, places, quais (lot 4) ; laboureur (nuit,
   hiver, été), accoudés (nuit) (lot 5).
5. **Distribution pauvre** ✅ — promeneuses et enfants sur les quais, porteuses, lieuse,
   ponts tirés par travée, charge de l'ère, clients et clientes, habitants de l'ère dans
   les scènes industrielles et après. (Les scènes d'avant gardent leurs dessins dédiés —
   cueilleur, paysan au chapeau, chaland au panier — qui sont de leur époque.)
6. **Ils s'ignorent** ✅ — mouettes et pigeons fuient tout ce qui marche (registre), le
   héron s'envole quand on approche, les chats restent sur le parapet (hors des files de
   marche : personne ne les traverse).

### 7.3 Ce qui reste, et à qui
- **S'asseoir** et le **salut** : faits au §8 (bancs des places, causettes, équipage).
  Restent sans assise : les marches et les terrasses (pas de banc à viser), et deux
  habitants (POSE_NONE, ci-dessous).
- **Filles de la Maison des Plaisirs** : leurs promeneuses sont faites mais dans la copie
  de la session « Passage des filles » ; leur respiration à la porte / au balcon est
  faite au §8.
- **Attendants de la navette cliquables** : faits par la session « PNJ cliquables »,
  non commités chez elle.

## 8. Les poses : s'asseoir, saluer, et les filles qui respirent (2026-10-05)

Demande de Raph (« fais ça ») sur les deux manques du §7 : s'asseoir et saluer, et les
filles de la Maison figées à la porte et au balcon.

**Les dessins (PixelLab, ~320 générations).**
- **Assis et salut** pour les 64 habitants des ères, faces SUD seulement (sud-est,
  sud-ouest) : de dos on ne voit ni l'un ni l'autre, une pose demandée de dos retombe
  sur l'attente. Animation v3 décrite en texte, partant de NOTRE image d'attente
  (`custom_start_frame`) — partir de la rotation du personnage donnait une silhouette
  plus massive (18 px de large au lieu de 15) et un banc dessiné. Bandes
  `{nom}-{sit|wave}-{vue}.png` (+ demi-bandes), récupérées par
  `scripts/fetchAgentIdle.mjs --as=sit|wave --dirs=… [--to-lowest]`.
- **L'assis se coupe à l'image la plus RAMASSÉE** (hauteur d'encre minimale) : la v3 se
  relève souvent à la fin ; le jeu tient la dernière image tant qu'on est assis.
- **Ratés** (~30 % des assis : la v3 se penche au lieu de s'asseoir, ou un objet tenu
  l'en empêche) : une reprise avec une autre consigne, sinon le MIROIR de l'autre vue
  (24 bandes — même personnage vu en symétrique, la palette ne change pas). Deux
  habitants restent sans assise après plusieurs essais — la mage au bâton (cristal) et
  la paysanne au panier (village) : `POSE_NONE`, jamais demandés (le .exe compte chaque
  fichier absent), ils restent debout devant le banc.
- **Les 16 filles** de porte et de balcon : `animate_image` sur leur image de face,
  4 images (« respire, ondule des hanches »), image 0 = l'image de la marche (raccord
  exact), plus grande tache seule (une bouffée détachée près du visage), couleurs
  rabattues sur la palette de la marche → `plaisirs-{fille}-idle-southeast.png`.
- ⚠ **Recopie des images de départ** : envoyées en base64 dans l'appel, elles se
  corrompaient parfois (PNG refusé). En PNG À PALETTE (~500 caractères au lieu de
  1 500), plus aucune erreur — et l'image de référence renvoyée par PixelLab est
  vérifiée identique à celle envoyée (sauf les miroirs, attendus).

**Le câblage.**
- `agents.js` : `poseStrip` (chargement à la première demande, faces sud), `pose`
  ({ kind, u }) au bout de `drawNamedAgentIso` / `drawEraAgentIso` ; `agentPoseFrameIso`
  pour qui dessine à sa main ; `IDLE_ONE` = l'attente sur la seule vue sud-est (les
  filles) ; `idleOk` par vue (au lieu de « les 4 vues chargées »).
- **Places** (`plazaFolk.js`, `isoPlaza.js`) : un poste `seat` par banc de face (ceux
  qui regardent le sud ou l'est), rejeté s'il est masqué (empreinte d'un massif) ou si
  l'on doit traverser la base d'un objet pour l'atteindre. Le siège est à 0,03 case
  devant le centre du banc : à 0,1, mesuré en jeu, on le voyait DEBOUT À CÔTÉ. On
  s'assoit en 0,9 s en arrivant, on se relève avant de repartir ; une causette commence
  par un salut d'1,3 s.
- **Passants qui se croisent** (`updateCitizens`, `isoUnits.js`) : la causette commence
  par un salut (`citizenPose`).
- **Équipage** (`boatKit.js`) : le matelot qui salue lève vraiment la main (bande en
  boucle).

**Vérifié en jeu** (vite-capture) : une passante assise sur un banc de la place du
jardin, un passant qui lève la main en croisant quelqu'un, les filles de porte et de
balcon qui changent d'image (différences d'image mesurées). Gardes :
`__tests__/comportementsLot8.test.js` (bandes sur le disque, au format et dans la
palette de la marche, assis plus bas que debout ; filles : image 0 = marche ; salut
d'1,3 s ; on finit assis sur une place à bancs).
