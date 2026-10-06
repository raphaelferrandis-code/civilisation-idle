# PLAN : l'herbe et les arbres

Demande de Raph (2026-10-04, deux captures à l'appui : une friche verte en ville, une
ceinture forestière autour d'une ville de la bande 5-6) : « il faut améliorer l'herbe et
les arbres actuels, tu me fais un plan ? »

## 1. Constats (mesurés sur les sprites et dans le code, pas supposés)

**Arbres** (`iso/isoWildForest.js`, `iso/isoGroundProps.js`, branche `tree` d'`iso/isoLivePaint.js`)

| # | Constat | Mesure |
|---|---|---|
| A1 | **Trois dessins pour toute la forêt.** `tree-1` et `tree-2` (feuillus ronds), `tree-3` (sapin). `tree-4` (sapin mort) ne sort qu'en hiver et dans les ruines. Des milliers de copies du même rond : un papier peint. | `ISO_TREE_VARIANTS = 4`, essence = `cmHash('tree:gx:gy') % 4` |
| A2 | **Une seule taille.** `grainR = 1.26` fixe le rayon de TOUS les arbres (décision « une seule main » du 2026-09-29, juste pour le grain). Comme il n'existe aucun jeune ni vieil arbre dessiné, toutes les couronnes ont le même diamètre. | `TREE_TUNE`, layout.js |
| A3 | **Des pastilles lime sur un feutre sombre.** Les feuillus sont DEUX FOIS plus clairs que leur sol, et presque plats : 9 teintes seulement, peu de volume interne. Le sapin, lui, a la valeur de l'herbe : il s'y noie. | feuillus lum 127-139, sat 0,40 ; sapin lum 61 ; herbe lum 66-83 |
| A4 | **Aucun peuplement.** L'essence est tirée au hasard cellule par cellule, donc feuillus et sapins sont mélangés uniformément partout : ni sapinière, ni chênaie, ni bosquet. | `treeBaseVariant` |
| A5 | **Aucune lisière.** Le bord du bois est le même arbre adulte, juste plus clairsemé (`TREE_LIFE.keep`) : pas de buissons, pas de jeunes arbres. | `TREE_LIFE` |
| A6 | **Pas de sous-bois.** Sous les arbres, c'est la même pelouse fleurie que dans le pré : les arbres sont *posés sur un gazon*. | `drawGrassDetail` ne sait rien de la forêt |

**Herbe** (`iso/isoGroundCells.js`, `iso/isoGroundDetail.js`)

| # | Constat | Mesure |
|---|---|---|
| H1 | **Un feutre vert sombre et saturé.** Les 4 tuiles d'herbe sont posées à pleine dose depuis le 2026-07-28. L'herbe est la 2e surface la plus saturée de la carte après l'eau, alors que la cible de la « maquette vivante » est « fonds calmes, couleur vive réservée à la vie ». | tuiles lum 66-83, sat 0,38-0,44 (le reste des sols : 0,12-0,30, audit du 2026-09-30) |
| H2 | **Les prés ne se voient pas.** Le voile `meadow` plafonne à 8 % d'alpha : sur des centaines de cellules, l'herbe est partout la même. | `GRASS_DETAIL.meadow = 0.16` × \|bruit − 0,5\| ≤ 0,5 |
| H3 | **Les fleurs sont des confettis.** Un seul motif (croix de 4 pétales), semé uniformément sur 22 % des cellules : au pré, en forêt, en ville. | `GRASS_DETAIL.flowerP = 0.22`, tirage par cellule |
| H4 | **La friche de ville est un morceau de campagne.** Même tuile sombre, mêmes fleurs, mêmes touffes que la forêt, découpés dans le pavé : une tache de moquette (capture 1). | `courField` → `grass` ; `COUR.lawnFrom = 6` |

## 2. Ce qu'on ne refait pas (refus déjà donnés)

- ⛔ Arbres du pack Cainos (« je n'aime pas les arbres », 2026-07-22) : tout nouvel arbre est dessiné pour nous.
- ⛔ Taille d'arbre au hasard (grain) : la variété de taille vient de **dessins différents au même grain**, jamais d'un facteur d'échelle.
- ⛔ Toute variation de ton **par cellule** (4 refus) : toute nuance de sol est un champ **continu** (`smoothNoise`).
- ⛔ Pierres semées dans l'herbe ; ⛔ brume ; ⛔ décorer la couture herbe/ville (7 refus).
- ⛔ « Trop de pixels sur une tuile » : les touffes restent dosées comme aujourd'hui.
- ⛔ Égaliser les 4 tuiles d'herbe entre elles : leurs écarts SONT le patchwork voulu.
- Lumière HAUT-GAUCHE ; aucune ombre peinte dans les sprites (le jeu pose l'ombre solaire).

## 3. La cible, en une phrase

**Un bois se lit comme une masse sombre aux couronnes éclairées, qui s'ouvre sur des
prés plus clairs et plus calmes ; on y reconnaît des essences, des âges, une lisière.**

Quatre règles :
1. **La valeur sépare les matières.** Couronne moyenne un peu PLUS SOMBRE que le pré,
   reflets clairs seulement en haut à gauche des couronnes. Aujourd'hui c'est l'inverse.
2. **La variété vient du dessin, pas du hasard.** Essences × âges, au grain des habitations.
3. **La forêt a une structure.** Peuplements, lisière étagée, vieux arbres au cœur, trouées.
4. **Chaque sol dit où il est.** Pré, sous-bois, berge, friche de ville : quatre herbes.

## 4. Les lots

Méthode habituelle : planche avant/après sur de vraies captures, validation de Raph,
**un commit local par lot** (fichiers nommés), lint + suite verts, puis le lot suivant.

### Lot 0 : planche de décision (pas de code de jeu) · S
- Captures de référence, été, automne et hiver, bandes 0, 2, 4, 6 et 8 : un pré, une
  lisière, un cœur de forêt, une friche de ville.
- **Maquette de la cible par montage** (sprites recolorés hors jeu, sol redosé) sur UNE
  capture, en 2 ou 3 variantes de valeur (question Q1).
- `get_balance` PixelLab avant la série du lot 1.

### Lot 1 : la famille d'arbres (art PixelLab) · L
- **4 essences × 3 âges = 12 arbres** : feuillu rond (chêne/hêtre), feuillu clair
  (bouleau, tronc blanc), sapin, pin. Jeune, adulte, vieil arbre remarquable.
- **+ 3 buissons de lisière** de la même main (les `bush-1..6` Cainos ont un contour
  rouge-brun : ils restent aux terre-pleins).
- Contraintes de dessin : canvas 96 px, grain des habitations, lumière haut-gauche, sans
  ombre, 14-20 teintes (contre 9), palette par essence (chêne vert profond, bouleau
  jaune-vert, sapin vert-bleu) **plus sombre en masse**, reflets en haut à gauche.
- Recette : une génération par essence, puis les autres en image de style de la
  première validée (une seule main) ; `image_to_pixelart` à la taille cible, jamais de
  réduction par moyenne ; contrôle d'angle et de fond opaque sur chaque image.
- Hiver : `scripts/snowTrees.mjs` sur les 15 nouveaux. Automne : la teinte actuelle.
- **Méta par sprite** (haut et rayon de couronne) : les particules d'ambiance, le vent
  (`vieTreeSway`) et les bêtes qui évitent les arbres lisent aujourd'hui `treeCanvasT`,
  calé sur un seul gabarit.
- Branché d'abord en remplacement simple (même tirage, 12 dessins au lieu de 3) : le
  gain de répétition se juge seul, avant toute structure.

### Lot 2 : peuplements et lisière (code, `isoWildForest.js`) · M
- **Essence par peuplement** : un bruit lisse à grande échelle (~14 cellules) choisit
  sapinière, chênaie ou bois mêlé ; mélange progressif aux frontières. Bouleaux en
  pionniers au bord des trouées.
- **Âge par position** : à la lisière (distance `TREE_LIFE`), buissons puis jeunes
  arbres ; au cœur des fourrés, des adultes ; quelques vieux arbres, rares, aussi
  isolés dans les prés.
- **Des trouées franches** : plus de contraste entre bois dense et pré ouvert, moins
  d'arbres isolés répartis uniformément. **Nombre total d'arbres ≤ aujourd'hui** (le
  coût d'une frame suit le nombre d'arbres, mesuré le 2026-09-29).
- Même mémo par blocs, même tri, même batcher GL : seule la donnée par arbre change
  (essence, âge). Vérifier que l'atlas GL accueille 15 sprites de plus.
- Arbres de ville (`L.trees`) : même famille, adultes seulement. Arbres de place : inchangés.

### Lot 3 : le sol de la forêt · M
- Sous les fourrés denses, l'herbe devient **sous-bois** : voile continu plus sombre et
  plus froid, tiré du MÊME champ de densité que les arbres (lissé, aucune cellule visible).
- **Pas de fleurs sous la canopée** ; au printemps, quelques taches de jacinthes aux trouées.
- ⚠ Le sol est cuit en tuiles de pyramide : le champ de forêt doit entrer dans la
  signature de tuile (`tileSig`), sinon des tuiles gardent l'ancien sol.

### Lot 4 : le pré · M
- **Calmer le feutre** (question Q1) : soit redoser les tuiles, soit les régénérer plus
  claires, plus chaudes, à brins plus fins (sat ~0,30, lum ~90). Les 4 variantes gardent
  leurs écarts.
- **Prés en zones** : `meadow` remonté et porté par deux champs continus, herbe grasse
  près de l'eau, herbe sèche et dorée loin d'elle.
- **Fleurs en colonies** : MÊME nombre de fleurs, mais regroupées par un bruit lisse
  (un pré fleuri ici, une prairie verte là) ; 3-4 motifs au lieu d'un (pâquerette,
  bouton d'or, coquelicot, bleuet). Les couleurs actuelles restent.

### Lot 5 : la friche de ville · S
- Une herbe de ville : plus claire, plus fine, **sans touffes**, fleurs seulement en
  massif au cœur de la friche. La couture avec le pavé n'est PAS décorée (7 refus) :
  c'est la matière qui change, pas son bord.

### Lot 6 (facultatif) : arbres de ville par ère · M
- Cyprès et pins parasols antiques, tilleuls médiévaux, platanes d'alignement au XIXe…
  pour les seuls `L.trees`. À décider après le lot 2.

## 5. Mesures de réussite

| Mesure | Aujourd'hui | Cible |
|---|---|---|
| Dessins d'arbres distincts dans une vue de forêt | 3 | ≥ 12 |
| Luminance couronne moyenne / pré | ≈ 1,8 (feuillus), 0,85 (sapin) | 0,85-1,0, reflets à part |
| Saturation de l'herbe de pré | 0,38-0,44 | ≤ 0,32 |
| Fleurs sous canopée dense | autant qu'au pré | 0 |
| Fleurs en colonies | 0 % | ≥ 70 % (même total) |
| Arbres visibles au dézoom maximal | référence lot 0 | ≤ référence |
| Coût de frame au dézoom (rendu logiciel) | référence lot 0 | ≤ +5 % |

## 6. Questions à Raph

- **Q1 : la valeur.** Recommandé : un pré plus clair et plus calme, et une forêt plus
  sombre aux reflets clairs (l'inverse d'aujourd'hui). Autre voie : garder l'herbe
  sombre actuelle et seulement enrichir et assombrir les arbres. Le lot 0 montre les deux.
- **Q2 : les essences.** Recommandé : une forêt tempérée (chêne, bouleau, sapin, pin) à
  toutes les ères ; les essences d'époque vont seulement aux arbres de ville (lot 6).
- **Q3 : les fleurs.** Recommandé : les regrouper en colonies, à nombre égal.

## 7. Journal

- 2026-10-04 : plan écrit, en attente des réponses de Raph. Aucun code touché.
- 2026-10-04 : **Q1, Q2, Q3 = oui** (« 1 oui, 2 oui, 3 oui, go lot 0 »).
- 2026-10-04 : **lot 0 fait**, planche https://claude.ai/artifact/XUQNPgaWj1ikL6AXqggNvW.
  - Maquette DANS le jeu sans toucher aux sources : arbres et tuiles d'herbe retonifiés
    en mémoire (`.preview-shots/vegetation/vegMock-v2.js`, gamma sur la luminance qui
    garde les reflets au-dessus de 0,5-0,78, puis saturation et teinte). Bande 4, été.
  - Doses (luminance moyenne des pixels opaques) : pré 72 → A 82 / B 92 / C 102 ;
    feuillus 127-139 → 98 / 86 / 76 ; sapin 61 → 60 / 58 / 55 ; couronne ÷ pré 1,8 →
    1,2 / 0,93 / 0,75. Recommandé : **B**. Choix de Raph : en attente.
  - Références (été, zoom 1 lisière / zoom 2 ville, bandes 0-2-4-6-8, 4 saisons) :
    `.preview-shots/veg-b*-{vue,lisiere-z2,coeur,pre,friche-z2}.png`, `veg-saison-*.png`.
  - Mesures de départ (banc dev, CPU seul, canevas 1 352 × 804, vue centrée) : arbres
    de forêt visibles à z 0,25 = 7 186 (b0), 6 024 (b2), 5 624 (b4), 1 941 (b6), 1 769
    (b8) ; image p50 23 / 64 / 41 / 55 / 54 ms. À z 0,125 : 32 084 (b2) / 31 670 (b4) /
    27 633 (b6) / 27 445 (b8), p50 175 / 120 / 124 / 117 ms.
  - PixelLab : 1 532 générations restantes (reset 30/10), lot 1 ≈ 60.
  - ⚠ Banc : serveur `vite-vegetation` (port 62110, sans rechargement auto). Les aides
    `.preview-shots/vegetation/vegHelpers-v2.js` s'importent depuis la page ; Vite ne
    relit JAMAIS un fichier modifié sous `.preview-shots/` (dossier hors surveillance) →
    nouveau NOM de fichier à chaque version. Une boucle d'attente active bloque les
    `onload` d'images : sans `settle()` (rendre la main 300 ms), une capture juste après
    un rechargement sort le sol en aplat (repli), fausse alerte.
- 2026-10-04 soir : **dose B choisie par Raph** ; « fais tous les lots, je vais dormir ».
- **Lot 1 fait** : 33 dessins (chêne, chêne rond, bouleau, sapin, pin × jeune / adulte /
  vieux, + 3 buissons) au lieu de 3.
  - PixelLab par l'API REST v2 `generate-with-style-v2` (l'outil MCP tronque les images
    de style) : images de style = les arbres du jeu passés à la dose B, puis les premiers
    chênes retenus (une seule main). 4 candidats à 96-128 px, 16 à 48-64 px, 20
    générations l'appel ; 11 appels, 220 générations.
  - `scripts/installVegetation.mjs` pose les sources brutes (`scripts/data/vegetation-raw/`,
    choix dans `vegetation-trees.json`) : pied à 0,92 et au milieu, canevas agrandi par pas
    de 8 si l'encre n'y tient pas, dose par essence mesurée sur le FEUILLAGE seul (masque
    vert pris avant la dose : la dose déplace la teinte), 24 teintes. Feuillus 84,
    bouleaux 92, sapins 62, pins 66 ; la teinte des conifères tourne de −18/−20° vers le
    vert sur le feuillage SEUL (tourner l'écorce du pin la rendait rose), écorce du pin
    désaturée à 0,6.
  - LE GRAIN : canevas de 64 (jeune), 96 (adulte), 104-128 (grand ou vieux) ; le moteur
    dessine à px/96 de la taille de référence (`treeSpriteK`). Aucun redimensionnement.
  - tree-1..3 ont reçu les nouveaux adultes (contrat des places et de l'île des
    merveilles : index 1..4) ; tree-4 (sapin mort) inchangé, son hiver aussi.
  - Hiver : `snowTrees.mjs` lit le manifeste ; l'écorce blanche du bouleau compte comme
    écorce (sinon toute la neige tombait sur le tronc), règle réservée aux bouleaux.
  - Tirage provisoire du lot 1 : sapin mort 1 sur 4 comme avant, sinon uniforme parmi les
    30 vivants (`TREE_LIVING`). Le lot 2 le remplace.
  - Garde `vegetationFamily.test.js` (table = manifeste = PNG : taille, pied, 24 teintes) ;
    `isoWinterTreeAssets.test.js` lit le manifeste.
  - Commit local `30957f17`.
- **Lot 2 fait** (`isoWildForest.js`, réglages `FOREST`, molette `__forest`) : chaque arbre
  sauvage reçoit son dessin `v` à la plantation.
  - Essence par PEUPLEMENT : bruit lisse (`standScale` 17) de la sapinière (0) à la
    chênaie (1), pinède en PALIER (posée en un seul point, aucune pinède ne se formait —
    vu par le test), bois mêlé ; bouleaux pionniers (+0,22) en lisière et trouées.
  - Âge par position : jeunes à la lisière (distance TREE_LIFE) et dans les trouées,
    vieux dans les fourrés denses et seuls au pré ; un vieil arbre laisse libres ses
    voisins droite/bas. Buissons sur les cellules de lisière laissées vides.
  - Trouées lisses (bruit interpolé, `holeScale` 8, `contrast` 1,55) au lieu des blocs
    de 5 et 11 cellules.
  - Sapin mort : 35 % des conifères adultes en hiver/ruines (`dead`) ; les arbres de VILLE
    ne tirent plus que des adultes (`TREE_ADULTS`).
  - Mesuré, même ville (bande 4, graine 1198668116), dézoom 0,125 : 31 405 → 29 902 arbres
    (−4,8 %), image p50 109-121 → 107-110 ms (A/B alterné, même séance). Zoom 0,25 :
    5 651 → 5 613.
  - Garde `forestStands.test.js` (regroupement, chaque essence domine quelque part,
    pionniers, moyenne de densité, trouées franches et lisses).
  - Commit local `c6f3a367`.
- **Lot 3 fait** (`iso/isoForestFloor.js`, réglages `FOREST_FLOOR`, molette
  `__forestFloor`) : le sous-bois.
  - ⛔ Pas de voile par losange : à 30 % d'alpha, un voile dosé cellule par cellule
    montrerait la grille (4 refus de ton par cellule). Le voile est UNE image d'un pixel
    par cellule, posée sous la transformée iso avec le lissage du navigateur : dégradé
    continu d'un centre de cellule à l'autre, aucune marche (vérifié à l'œil, jointures
    de tuiles comprises).
  - Part de sous-bois = densité des fourrés (`forestDensity`, celle qui plante) entre
    0,42 et 0,78, × la part TREE_LIFE (rien au ras de la vie), 0 sur route et eau.
    Couleur (20,36,26) à 0,32 ; × 0,55 en hiver.
  - Fleurs éteintes sous les couronnes (`forestFlowerK`, combiné à `campFlowerK`).
  - Signature de tuile (`tileSig` → `forestFloorSig`) : la distance à la vie dépend de
    routes et d'emprises jusqu'à 5 cellules hors de la tuile.
  - Garde `forestFloor.test.js`.
  - Commit local `bbbe2aab`.
- **Lot 4 fait** : le pré.
  - Tuiles d'herbe à la dose B : `node scripts/vegetationDose.mjs grass` (depuis le commit
    source épinglé, un seul gamma pour les 4 variantes : écarts gardés). Moyenne 72 → 92 ;
    `GRASS_TILE_UNDER` [42,85,39] → [69,104,61]. Les touffes dessinées (lum ~92) n'ont pas
    bougé : elles se fondent maintenant dans le pré au lieu d'en ressortir.
  - Prés en ZONES (`iso/isoMeadow.js`, `MEADOW`, molette `__meadow`) : herbe grasse vert
    profond près du fleuve (6 cellules) et dans les creux du bruit, herbe sèche blonde sur
    les bosses ; l'automne sèche (×1,35), l'hiver rien. Même technique que le sous-bois
    (image d'un pixel par cellule lissée), et les deux voiles sont maintenant DÉCOUPÉS à
    l'herbe (`drawGrassVeils` : gabarit des losanges d'herbe et des rectangles de lisière
    remisé par le balayage) — le lissage débordait d'une demi-cellule sur les trottoirs.
  - ⚠⚠ TROUVÉ : `diamondPath` (isoQuad) ouvre un NOUVEAU chemin à chaque appel ; le
    `flushVeils` des anciens voiles de prés l'appelait en boucle avant un seul `fill` →
    seul le dernier losange de chaque paquet était peint. C'est pourquoi les prés ne se
    voyaient pas. Corrigé (tracé en ligne) ; `GRASS_DETAIL.meadow` passe à 0, remplacé
    par les zones lissées. Le même piège a mordu mon gabarit au premier essai.
  - Fleurs en COLONIES (`FLOWER_COLONY`, isoGroundDetail) : bruit lisse, facteur ramené à
    1 en moyenne (×2,34 : même nombre de fleurs), 91 % des fleurs dans une colonie ;
    chaque colonie a une couleur dominante (70 %) ; 4 formes (croix = pâquerette, bouton
    d'or, coquelicot à cœur sombre, bleuet en X). `__grassDetail({ colony: false })`
    rejoue le semis uniforme.
  - `iso/vegNoise.js` : bruit et hachage partagés (forêt, sous-bois, prés, fleurs) —
    isoGroundDetail ne peut pas importer la forêt sans boucle.
  - Garde `meadowFlowers.test.js` (luminance des tuiles, écarts gardés, couronne ÷ pré
    entre 0,85 et 1, zones grasses au bord de l'eau, zones lisses, colonies).
  - ⚠ Banc : juste après un rechargement, le sol peut rester en aplat plusieurs images
    (tuiles du plancher cuites avant le décodage) : `warm()` de
    `.preview-shots/vegetation/vegHelpers-v4.js` attend le décodage, recuit tout, laisse
    12 tours.
  - Test rouge HORS chantier : `comportementsAnalyse.test.js` (agents.js modifié par la
    session « comportements », non commité) — pas touché.
  - Commit local `08196930`.
- **Lot 5 fait** : la pelouse de ville (`LAWN`, `townLawnAt` dans `iso/isoMeadow.js`,
  molette `__lawn`).
  - Pelouse = `L.townGreen` (jardins, cours et air des îlots, prés et ceintures de la
    structure de ville) + friche de quartier (`courField` → 'grass'). C'étaient les
    « taches de moquette » de la capture de Raph.
  - Voile clair (178,204,120) à 0,16, lissé avec les prés (une pelouse ne prend pas les
    zones sèches/grasses) ; ni touffes, ni brins, ni herbes folles ; fleurs seulement en
    MASSIF au cœur (cellule dont les 8 voisines sont de la pelouse, `LAWN_FLOWER_P` 0,5).
  - La couture avec le pavé n'est PAS décorée (7 refus) : la frange existante reste telle
    quelle, seule la matière change.
  - Tests ajoutés à `meadowFlowers.test.js`.
  - Commit local `971b6751`.
- **Lot 6 fait** : les arbres de ville par ère (`CITY_TREES`, `cityTreeVariant` dans
  `iso/isoGroundProps.js`).
  - 10 dessins PixelLab (4 appels, 80 générations ; images de style = tree-1, tree-2,
    tree-3, tree-pin-a1 posés) : cyprès ×3, pin parasol ×2, platane ×2 (écorce tachetée),
    tilleul ×3. Posés par `installVegetation.mjs` (nouvelle dose `cypres`), hiver dérivé.
    ⚠ Une génération dont l'encre touche le bord du canevas est ROGNÉE (3 pins parasols
    sur 4, un platane) : contrôler la boîte d'encre avant de choisir.
  - Médiéval (bandes 2-3) : tilleuls, chênes, bouleaux ; antique (4) : cyprès, pins
    parasols, tilleuls, chênes ; industriel (5) : platanes, tilleuls, chênes ; moderne
    (6) : platanes, bouleaux, tilleuls, pins ; cosmique (7+) : platanes, bouleaux, cyprès,
    tilleuls. Adultes seulement, pas de sapin mort en ville ; places et île inchangées.
  - Les essences de ville ne poussent jamais en forêt (`TREE_LIVING` = chêne, bouleau,
    sapin, pin). Tests dans `vegetationFamily.test.js` (proportions par bande à 5 %).
  - PixelLab : 634 générations restantes au début du lot (les autres sessions
    consomment aussi), 519 au matin.
  - Commit local `205b06f0`.
- **Vérification finale** (nuit du 4 au 5) :
  - Copie propre au commit `205b06f0` : `npm run lint` vert, `npm run build` vert, tests
    3 093/3 094. Le seul rouge, `comportementsAnalyse.test.js` (habitants, autre
    chantier), est ALÉATOIRE : il échoue aussi 1 fois sur 6 au commit d'avant le lot 1
    (`7bc9ced8`, mesuré).
  - Avant/après à graine fixe (777), bandes 0-2-4-6-8 + automne/hiver, serveur de capture
    monté sur un worktree détaché (avant `7bc9ced8`, après `a8cf8201`) :
    planche https://claude.ai/artifact/XUQNPgaWj1ikL6AXqggNvW (version 2).
  - Vu sur la planche : au dézoom de la bande 8, l'herbe grasse (30,64,38 à 0,2) faisait
    une grande ombre → `a8cf8201` (58,104,46 à 0,16). Les autres taches sombres des grands
    prés sont les OMBRES DE NUAGES de la petite vie (`__vie({ on: false })` les efface) :
    la forêt les cachait, le pré dégagé les montre. Question posée à Raph.
  - Même ville antique : arbres visibles 5 551 → 5 520 (dézoom 0,25), 31 501 → 29 743
    (dézoom maximal) ; image p50 73 → 59 ms et 114-199 → 109-161 ms (bruit fort).
- **Reste ouvert** : la réponse de Raph sur la planche (ombres de nuages, part des cyprès
  et pins parasols dans la ville antique). Rien de poussé.
- 2026-10-05 matin, Raph (captures : le vieux chêne au tronc plissé, le chêne tordu, une
  rue médiévale) : « refais ces arbres, délimite davantage en ville les zones d'herbe pour
  plus de cohérence ».
  - Chênes refaits : `tree-chene-v1`, `-v2`, `-v3` (vieux, 128 px) et `-a3` (96 px). Les
    anciens avaient des troncs noueux et verdâtres (racines en rideau, « visage ») et des
    couronnes en grappes cerclées de noir. Nouveaux : tronc brun droit, couronne en grosses
    masses arrondies, images de style = tree-1, tree-2 et le tilleul (4 appels, 80
    générations). Pose et hiver par les scripts habituels.
  - Pelouses de ville délimitées (`LAWN.crisp`, `__lawn({ crisp: false })` pour l'A/B) :
    bord FRANC avec le pavé et la terre de cour — pelouse hors du champ de la lisière
    arrondie (les deux côtés de la couture), pas de langues de frange vers elle, et
    FRONTIER ne retourne plus le pavé qui la borde (une voisine de jardin compte comme de
    la ville). Rien n'est AJOUTÉ sur la couture (7 refus). Pelouse = bande ≥ 2 seulement
    (camp et village gardent leur pré) ; aux ères où la cour de terre devient gazon
    (`COUR.lawnFrom`), elle en est.
  - Commit local `4b836b13`.
- 2026-10-06, Raph (capture d'un parc cosmique) : « du coup l'herbe et les fleurs
  paraissent énormes, on les voit depuis le ciel ». Les arbres suivaient déjà l'échelle
  de l'ère (`treeBandMul` : ×0,85 bandes 5-6, ×0,65 dès 7), pas l'herbe : brins de la
  tuile, touffes et fleurs en croix de 3 pixels, aussi grosses qu'une voiture ; et les
  grands parcs (presque tout en cœur de pelouse) portaient une fleur sur deux cellules.
  `GRASS_ERA` (isoGroundDetail, molette dev `__grassEra`), le GRAIN ne bouge pas :
  - tuile d'herbe adoucie vers son ton moyen (`GRASS_TILE_UNDER`) à (1 − k) × 1,4
    (0,21 aux bandes 5-6, 0,49 dès 7), dans l'herbe seule (`drawGrassVeils`) et sur le fond
    hors plan (`isoWildBackdrop`, sinon le bord du plan se verrait) ;
  - fleurs, brins et touffes × k² ; sous k 0,9, une fleur = UN pixel ;
  - massif des pelouses `LAWN_FLOWER_P` 0,5 → 0,3.
  Vérifié en jeu bandes 6 et 8 (A/B même séance). Rien ne change jusqu'à la bande 4.
