# Plan — Le rendu de la ville : « brouillon et pas net »

Chantier ouvert le 2026-08-05, sur capture de Raph et deux références visées
(rendu voxel isométrique d'un quartier de New York ; pixel-art eBoy de Belfast) :

> « le peu qu'on a déjà a un rendu très brouillon et pas net ; rajouter des éléments
> n'arrangerait rien. Analyse les moyens qu'on a et ce qu'on peut mettre en place. »

Établi par un diagnostic en éventail sur 10 axes du code de rendu, suivi d'une passe
de réfutation : **39 constats, 13 confirmés, 21 nuancés, 5 réfutés**. Les chiffres
ci-dessous sont ceux qui ont survécu à la réfutation ; les formulations réfutées sont
consignées au §7 pour qu'on ne les reprenne pas.

Complète `PLAN-TISSU-URBAIN.md` (le tissu), `PLAN-EGALISATION-GRAIN.md` (l'échelle du
grain), `REPRISE-TRACE-VECTORIEL.md` (le vectoriel), `PERF-CARTE-REPRISE.md` (le budget).

---

## 1. Deux maladies, pas une

Raph en a nommé deux, et ce sont bien deux. Elles ne se soignent pas dans le même
ordre ni avec les mêmes moyens.

### « Pas net » — la résolution (cause secondaire, la plus facile)

Six familles de sprites blittent à **six multiples différents du zoom, de 0,63 à 2,00
px écran par px source** (facteur 3,2) — 31 densités distinctes sur 256 sprites.
Aucune grille de pixels commune. S'y ajoutent trois défauts mécaniques :

- **le sol n'est jamais blitté 1:1, même à zoom 1** : `dw = ceil(bb.w·k) + 1`
  (`isoRenderer.js:695`), un « +1 px anti-couture » qui duplique une colonne et une
  rangée d'art sur **chaque** cellule — en contradiction avec la doctrine écrite
  300 lignes plus haut (`:387-395`, « blittées pixel pour pixel ») ;
- **le zoom n'est quantifié nulle part** : il glisse en continu et l'échelle de blit
  du sol vaut exactement `CM.cam.zoom` (`:687`) ;
- **82 sites de blit** de bâtiments-moteur et de mobilier de place posent des
  coordonnées et des tailles flottantes, alors que le même projet arrondit pour les
  agents avec le motif écrit noir sur blanc (`agents.js:332-335` : « en sous-pixel, le
  nearest ré-échantillonne différemment à chaque position, le sprite fourmille »).

### « Brouillon » — la composition (cause principale)

> **Le budget de contraste de l'image est dépensé partout SAUF sur la frontière qui
> compte.**

C'est le constat central, et il se chiffre. Le pan de toit du `stonehouse` mesure
**L 129,4** ; le pavé qu'il occupe, **L 121,9**. **7,5 points d'écart.** Au même
moment la chaussée en a 29 et le trottoir 36.

⚠ L'image n'est PAS plate globalement — c'est la réfutation la plus utile du
dossier : l'herbe rendue vaut 71 et le trottoir 158, soit **87 points d'amplitude**.
Le contraste existe. Il sert à dessiner un liseré de 0,22 tuile et une lisière de
campagne, jamais à séparer le bâti de son sol.

Et **aucune garde ne mesure ce couple**, alors qu'il en existe une pour chaussée/sol
depuis le même grief formulé en juillet (`isoRoadGroundContrast.test.js:26`).

Quatre aggravants, tous mesurés :

| | Mesure |
|---|---|
| **Aucune hiérarchie de hauteur** | à la bande 4, **848 bâtiments sur 849** tiennent entre 44 et 66 px dessinés ; le seul au-dessus est une halle 3×3 à 97 px |
| **Aucune contiguïté d'image** | entre deux sprites voisins il reste **10 à 17 px de sol nu**, par arithmétique : la boîte de lot vaut 49,9 px pour un losange de 64 |
| **La couleur ne varie pas** | deux tables d'échange visent la même cible → **50 % des habitations portent le même ton de toit**, pour 3 tons dans toute la bande |
| **La voirie s'est étalée** | les rangs ne peuvent que monter (aucune rétrogradation nulle part, aucun plafond) ; une avenue avec ses trottoirs fait **1,14 tuile**, un boulevard 1,20 — deux rues parallèles à une cellule d'écart ne laissent plus un pixel de sol |
| **Le grain de la matière** | la tuile de pavé porte **18,4 L d'écart entre pixels VOISINS**, soit 4 à 6× toutes les autres matières (tech 3,1, terre 3,1, béton 4,8, dalle 5,4) — et c'est la matière des bandes 2 et 3, celles de la capture |

---

## 2. Le vrai gisement : trois systèmes déjà construits et débranchés

C'est la réponse à « analyse les moyens qu'on a ». Les moyens sont largement **déjà
dans le dépôt**, non connectés.

| Système | État | Ce qu'il apporterait |
|---|---|---|
| **La couleur par quartier** (`qkind`) | calculé sur chaque tuile (`buildingGenerator.js:214`, `:259`), 7 teintes écrites (`renderBuildings.js:28-37`) — **tout coupé par `!usePixelHouse`** (`:303`, `:310`). Et en iso le rendu n'appelle même pas `drawTile` : il va droit à `drawPixelHouse` (`isoRenderer.js:9388`). **Deux systèmes de couleur écrits, testés, morts en production.** | colorer par ÎLOT au lieu de par tuile — exactement ce qui sépare la lecture eBoy d'un bruit uniforme |
| **Les districts** | 22 à 108 emprises civiques typées (palace/forum/archive/keep/market/temple/tower/spire/arcology) calculées (`layout.js:2119-2160`), versées dans `reserved`, excluant les cellules du pool bâtissable (`:2205`) — **et dessinées nulle part** (grep exhaustif : les seuls consommateurs sont l'occupation, le Y-sort et le survol) | la couche de repères qui manque à une image où 848 bâtiments sur 849 font la même hauteur |
| **L'occultation des bâtiments** | `houseSpriteHeightTiles` calcule la portée avec **la formule du mode legacy top-down**. En iso un sprite qui monte de `dh` px masque `2·dh/T` tuiles au nord, pas `dh/HOUSE_UNIT`. Erreur mesurée : stonehouse rend **1,11 tuile au lieu de 3,48** (×3,1), tenement **1,50 au lieu de 7,02** (×4,7). Et `clipOnly = !isHouse` interdit à **tout** bâtiment-moteur d'occulter quoi que ce soit | « le bâtiment mange ce qui est derrière lui » est le mécanisme même de la masse dans les deux références. Aucun test ne verrouille cette fonction |

À quoi s'ajoute **le cache de scènes** (`engineSceneCache.js`), écrit, prouvé
(−38 à −51 %), opt-in et éteint — cf. `REPRISE-TRACE-VECTORIEL.md` §3.1.

---

## 3. Les paliers

> ## ⚠ ÉTAT AU 2026-08-05, APRÈS LA PREMIÈRE SÉANCE
>
> **Livré et vérifié :** S0 (les deux lots), S11, S7.
> **RÉFUTÉ en lecture, ne pas rejouer :** S3.
> **Corrigé par la mesure :** S1 — voir ci-dessous, la cible a changé de rang.
>
> ### S3 — le défaut décrit N'EXISTE PAS
> En iso, l'occultation des agents se fait par **ordre du peintre**
> (`isoUnitDepthEx`, `isoRenderer.js:7785`) et **ne consulte jamais la hauteur du
> sprite** : un agent au nord-ouest d'un bâtiment, dans sa colonne écran, est
> plafonné sous la clé de l'occulteur donc dessiné AVANT lui, et le sprite le
> recouvre — automatiquement. Le `halfW` de `isoUnitFiches` y est correctement
> calibré (0,39·(sx+sy)·T + 0,45·T = la demi-largeur réelle du sprite).
>
> `houseSpriteHeightTiles` et `clipOnly = !isHouse` ne nourrissent QUE
> `frontByPainter` (`agents.js:1010` et `:1636`), qui est le split deux passes du
> mode **legacy top-down**, et `splashPointOk` (impacts de pluie). L'erreur ×3,1
> est réelle mais son seul effet visible en iso est que **des impacts de pluie se
> posent sur les façades** — un petit défaut, pas le grief. Reclassé en suivi.
>
> **Leçon** : le diagnostic a lu une fonction et pas ses consommateurs. Deux
> chemins de rendu coexistent dans ce projet ; toute affirmation sur « le » Y-sort
> doit dire LEQUEL.
>
> ### S1 — la cible n'est plus l'avenue, c'est le BOULEVARD
> `__tissu()` rejoué à HEAD (bande 3, 1321 tuiles, 2541 cellules de rue, **zéro
> chantier acheté**) :
>
> | rang | cellules | part | la table PÉRIMÉE du plan disait |
> |---|---|---|---|
> | `secondary` | 1510 | **59,4 %** | 10 % |
> | `main` | 700 | **27,5 %** | 23 % |
> | `path` | 275 | 10,8 % | 27 % |
> | `avenue` | 56 | **2,2 %** | 37 % |
> | `plaza` | 32 | 1,3 % | 4 % |
>
> **La prémisse « 60 % du réseau est en avenue/boulevard et la rue ordinaire a
> disparu » est FAUSSE à HEAD.** Le correctif `connectorRank` l'a déjà réglée :
> la rue ordinaire est redevenue majoritaire et l'avenue est un événement (2,2 %,
> déjà sous le `wideCap` de 18 % que le plan visait).
>
> Ce qui reste : **`main` à 27,5 % sans le moindre chantier acheté**, contre un
> `mainCap` visé à 6 % — et le plan avait mesuré cette part grimper au-delà de
> 50 % avec les achats. Un `main` fait 1,20 tuile avec ses trottoirs. **Le
> plafond doit donc porter sur `main`, pas sur `avenue`.** C'est un lot plus
> petit que prévu, et mieux ciblé.
>
> ### S11 + S7 — vérifiés en jeu
> Ce sont le même correctif : le `+1 px` anti-couture n'existait que parce que le
> pas de grille était fractionnaire. Zoom quantifié au 1/8 → `hw = 32z` et
> `hh = 16z` entiers → losanges jointifs → blit exact.
>
> Sonde sur `CM.gctx.drawImage`, bande 3, 1321 tuiles :
>
> | | source → destination |
> |---|---|
> | quantifié z = 1 | **64×32 → 64×32** (1878 blits) |
> | quantifié z = 1,5 | 64×32 → 96×48 |
> | quantifié z = 0,625 | 64×32 → 40×20 |
> | continu z = 1,37 | 64×32 → **89×45** |
> | continu z = 0,893 | 64×32 → **59×30** |
>
> A/B au même cadrage (`__groundTile({exact:false})` rejoue le `+1`) : **22,0 %
> des pixels perceptiblement différents**, écart max 189/255. Planche ×8
> `.preview-shots/s7-planche-x8.png` : à gauche les pixels ont des largeurs
> inégales et la diagonale est déchiquetée, à droite l'escalier 2:1 est propre.
>
> ### S1 — livré, et la mesure a encore corrigé la cible
> Première mesure trompeuse : j'ai lu `main` à 27,2 % en croyant la ville à zéro
> chantier — elle en avait ~58. **Le levier est `state.buildings.roads`**, pas
> `state.roadWorks`. Rejoué proprement :
>
> | routes achetées | avenue | `main` | `secondary` | avenue+main |
> |---|---|---|---|---|
> | 0 | 4,6 % | 9,0 % | 80,6 % | **13,6 %** |
> | 32 | 2,7 % | 17,3 % | 68,0 % | 20,0 % |
> | 128 | 2,5 % | **43,7 %** | 42,0 % | **46,2 %** |
>
> Le SQUELETTE seul pose 13,6 % (et `runLineWide` double toute artère `main` en deux
> lignes collées — c'est le boulevard à terre-plein, un choix assumé). Toute la
> dérive vient donc bien de `applyRoadWidenings`, sans plafond.
>
> **Livré** : `ROAD_RANKS.wideCap = 0.22` + `capMinCells = 200`, plafond sur
> **avenue ET main ensemble** — plafonner `main` seul déplacerait la masse sur
> l'avenue (0,33 contre 0,36 de demi-largeur) sans rien gagner. Compteur tenu à
> jour dans `promote`, jamais recompté. Mesuré en jeu à 128 routes :
> **avenue+main 46,2 % → 21,6 %**, `secondary` 42 % → 66,5 %. 11,9 % des pixels
> changent. Garde `roadRankCap.test.js` (6 tests, contrôle négatif compris : sans
> plafond la part dépasse le double et franchit 50 %). Molette
> `__roadRanks({ wideCap: 1 })` rejoue l'ancien.
>
> ⚠ Un hameau est EXEMPTÉ (`capMinCells`) : une part n'a pas de sens sur une rue
> unique, et l'ancien test d'échelle promeut toujours sa ligne de 12 cellules
> jusqu'à l'autoroute.
>
> ### S2 — ✅ ARBITRÉ : dose du pavé à 0,6 (Raph, 2026-08-05)
> Décision prise sur la planche des trois doses. `URBAN_TILE_A.cobble = 0.6`, les
> autres matières restent à 1. Garde `groundTileDose.test.js` : la dose, **la mesure
> qui la justifie** (si les tuiles de pavé étaient un jour régénérées calmes, le
> test tombe et il faudra rouvrir la dose au lieu de la traîner), et la garde
> structurelle par lecture de source sur `texAlpha === 0` — c'est ce 0 qui fait que
> doser ne montre pas le fond du canvas.
>
> ### S2 — comment l'outil a été construit
> `tileA` ne s'appliquait qu'à la terre battue (gate `mat.type === 'earth'`) :
> partout ailleurs la tuile partait à alpha 1 sans qu'aucun réglage ne puisse la
> calmer. Livré : `URBAN_TILE_A`, dose PAR MATIÈRE. Molette
> `__groundMat({ tileAType: { cobble: 1 } })` rejoue l'ancien.
>
> Grain mesuré sur capture (écart-type local, fenêtre 8×8) :
>
> | dose du pavé | grain moyen | médiane |
> |---|---|---|
> | 1 (actuel) | 40,0 | 38,5 |
> | 0,6 | 36,9 | 33,7 |
> | 0,35 | 35,3 | 32,6 |
>
> Planche `.preview-shots/s2-planche-pave.png` (gauche → droite : 1 / 0,6 / 0,35).
> **C'est à Raph de trancher** : monter `tileA` à 1 était sa décision du 2026-07-28.
> Quand la dose sera choisie, une garde devient utile (le grain de la tuile contre
> la dose) ; tant que le défaut est neutre il n'y a rien à protéger.
>
> ### S6 — fait par une SESSION PARALLÈLE, deux trous restants
> `snapRect` + `BLIT_SNAP` (mode 1 par défaut) + molettes `__blitSnap` /
> `__blitSnapStats` ont été livrés dans `cityEngineSprites.js` par une autre session
> pendant cette séance, sur 3 sites de blit. **Non couvert** : `plazaAnchor`
> (`isoPlaza.js:1079`) rend toujours des flottants — bancs, bacs, corbeilles,
> clôtures ; et le helper `snapDev` (arrondis en px CSS sous un contexte scalé par
> dpr) n'existe pas. À finir par la session qui possède ces fichiers.
>
> ### Pièges payés dans cette séance, à connaître
> - ⛔ **`captureFrame` RECENTRE**, et la boucle du jeu tourne ENTRE deux appels de
>   console : layout recomputé, saison changée, caméra recadrée. Un A/B doit tenir
>   dans UN SEUL appel, avec la caméra réépinglée à chaque image.
> - ⛔ **On juge le REPLI procédural si les tuiles ne sont pas décodées**, et rien
>   ne le signale : deux captures à deux doses différentes sont sorties
>   BYTE-IDENTIQUES. Le contrôle qui l'attrape : compter les `drawImage` de source
>   64 px sur `CM.gctx` pendant la cuisson (< 500 = capture sans valeur).
> - ⛔ **`CM._isoGroundBake = null` ne suffit pas toujours** : il existe aussi un
>   cache de crans de zoom (`CM._groundZoomCache`), contourné seulement quand
>   `CM.capture` est posé.
> - ⚠ Le masque de différence est le seul juge honnête d'un A/B de sol : il montre
>   les silhouettes de bâtiments NOIRES au pixel près si le cadrage n'a pas bougé.
>
> **Tests** : **1687 verts, 1 skippé, lint propre** (148 fichiers). Défaut `cobble
> = 0,6` confirmé en jeu au chargement du module, molette non touchée : grain moyen
> **37,0**, contre 36,9 mesuré pour la dose 0,6 sur la planche alignée — c'est bien
> la dose arbitrée qui est gravée.
>
> ⚠ **MOTIF CONNU — des rouges qui n'en sont pas.** Vu quatre fois sur la séance : une
> exécution complète rend 1 à 5 rouges alors que les mêmes fichiers passent en
> isolation. Le signe qui ne trompe pas est la DURÉE du run : 39 à 67 s contre ~20 s
> de référence, avec le serveur dev et une session parallèle qui tournent. Les tests
> qui lâchent sont ceux qui sont SENSIBLES AU TEMPS (`waveSwash`, `regulation`
> « les dés illustrent leur tier », `enginePlacementPerf` « contrôle négatif » — ce
> dernier mesuré à 7 640 ms alors que le fichier entier tourne en 5,7 s seul).
> **Avant de diagnostiquer un rouge : regarder la durée totale, puis rejouer le
> fichier seul.**
>
> ⚠ **Ne JAMAIS comparer deux captures prises de part et d'autre d'un rechargement
> de page** : la ville et la saison ont bougé entre-temps. Un tel diff a rendu
> 27,9 % de pixels et un écart max de 233/255 là où le changement réel de dose en
> valait 18,0 % et 0,00 % de gros écarts. Un `ecart max` élevé sur un changement
> d'ALPHA est le signal que la comparaison est polluée.

> ### S10 — ⛔ RÉFUTÉ : ce n'est pas un lot de plomberie, c'est un lot de COULEUR
> Mesuré le 2026-08-05. Trois choses, chacune suffisante :
> - **L'A/B annoncé comme gratuit n'existe pas.** `__pixelHouses(false)` ne montre pas
>   une ville colorée par quartier : il rend les boîtes de repli procédurales, toutes
>   du même khaki. La teinte y est bien atteinte, mais invisible (point suivant).
> - **Les valeurs sont décoratives d'un facteur 3 à 4.** `CM_QTINT` est un lavis alpha
>   0,11-0,16 : sur un mur crème, le déplacement va de **4,9 à 23,4** unités RGB, et
>   l'écart MAX entre deux quartiers vaut **33,4** — sous le seuil de 40 que ce projet
>   s'est lui-même fixé pour qu'un couple LISE. Les deux quartiers les plus fréquents,
>   `habitat` et `agricole`, ne diffèrent que de **10,1**.
> - **La distribution est écrasée.** Sur 392 habitations : 134 sans quartier (34 %), et
>   186 des 258 restantes en `habitat` (72 %). Colorer par quartier donnerait un tiers
>   de ville non teinté, la moitié sous un seul lavis, le reste sur quatre teintes que
>   l'œil ne sépare pas. (Les 744 tuiles `engine` sont exclues à juste titre.)
>
> Le lot n'est pas mort, mais il **passe APRÈS S13** : sans élargissement du cœur de
> palette il n'y a pas de couleurs à mettre dedans.
>
> ### S5 — livré ÉTEINT, et la prémisse était fausse
> Gain conservé : la **déduplication**. `cmCellNoise` est désormais défini une seule
> fois (dans `layout.js`, en amont d'`isoRenderer` — pas de module tiers, ç'aurait été
> un cycle), et la forêt sauvage a perdu sa copie locale de la formule. Une garde
> vérifie que la formule ne réapparaît pas en double.
>
> Le regroupement lui-même (`cmClumpK`, molette `__treeClump`) est écrit, testé, borné,
> de moyenne 1 — et **livré à 0**. Mesuré en jeu, bande 3, A/B rejoué à l'identique :
>
> | amplitude | arbres | groupés (≥2 voisins) | isolés |
> |---|---|---|---|
> | 0 | 1270 | 62,9 % | 15,4 % |
> | 1,9 (quasi max) | 1246 | 61,7 % | 16,6 % |
>
> 1,2 point d'écart pour une modulation de probabilité de ×0,05 à ×1,95. Le contrôle
> du lot passe (le compte est conservé, −1,9 %) mais il n'y a **rien à montrer**.
>
> ⚠ **Et la prémisse du diagnostic est fausse.** Il disait « hash par cellule, donc
> bruit blanc, donc confettis ». Mesuré : le champ occupe **9,1 % des 13 958 cellules
> éligibles** — le résidu n'est pas mince, chaque arbre a **3,77 voisines éligibles
> sur 4**, donc aucun plafond structurel. Or un tirage indépendant à 9 % donnerait
> ~4 % d'arbres à deux voisins, et on en mesure **62,9 %**. Le champ est donc DÉJÀ
> fortement aggloméré par un mécanisme que cette séance n'a pas identifié — deux
> populations réunies dans `trees` (ceinture boisée + arbres de ville) ? une densité
> radiale qui concentre plus que le modèle ? **À élucider avant de rallumer**, sinon
> on remue un champ déjà groupé.
>
> ⚠ Le volet PARCS n'a pas pu être vérifié : `L.cells` n'est pas publié sur le layout,
> donc le compte de cellules vertes est inobservable de l'extérieur. Le code est en
> place (même facteur, appliqué après le clamp) mais il est sous le même défaut à 0.
>
> **Tests** : 1696 verts, 1 skippé, lint propre.

> ### ⭐ LA TROUVAILLE : une seule case de table cause le défaut central
> Mesuré le 2026-08-05, en cherchant d'où vient la dissolution couleur par couleur.
> C'est le fait le plus important de tout le chantier.
>
> | cas | dissolution | responsable |
> |---|---|---|
> | `manor/calcaire` | 32,2 % | `#8f8475` (21,1 %) + `#7a7e88` (11,1 %) |
> | `townhouse/calcaire` | 25,0 % | `#8f8475` — **en totalité** |
> | `stonehouse/ardoise` | 15,1 % | `#8f8475` — **en totalité** |
> | `longhouse/origine` | 34,9 % | `#c98f5c` — en totalité |
>
> **`#8f8475` est la cible de rang 4 de `SWAP_CHAUD` ET de `SWAP_FROID`** — la
> collision que S8 avait repérée. La même case cause donc DEUX défauts : la
> dissolution figure/fond des bandes 2-3, et la monotonie des toits (50 % des
> habitations sur un ton).
>
> **C'est la pire valeur de toute la rampe calcaire contre le sol :**
>
> | ton | L | dist. sol b3 | dist. sol b2 | dist. chaussée | dist. trottoir |
> |---|---|---|---|---|---|
> | `#6f6354` | 100 | 41,1 | 45,8 | **13,6** | 145,6 |
> | **`#8f8475`** | 133 | **20,7** | **11,9** | 69,4 | 89,1 |
> | `#b4a890` | 169 | 77,3 | 68,8 | 127,6 | **33,8** |
>
> **Aucun voisin de rampe ne marche** : `#6f6354` déplacerait le défaut sur la
> chaussée (13,6), `#b4a890` est le rang 5 — les rangs 4 et 5 fusionneraient et le
> modelé perdrait un cran.
>
> **Et aucun ton du cœur ne peut le remplacer.** Recherche exhaustive sur les
> 41 teintes, à L 108-152 et distance ≥ 40 des DEUX sols : 7 candidats, tous soit des
> verts de FEUILLAGE (`#5c7d38`, `#8aa24a`, `#5aa87d`), soit **la rampe de BRIQUE
> elle-même** (`#a8704a` 60,2 · `#b06a48` 68,6 · `#c98f5c` 82,1). Autrement dit :
> **l'échange calcaire prend une couleur qui LIT et la transforme en une couleur qui
> ne lit pas.**
>
> ⚠ **Et ce n'est PAS un problème de toits.** Les centroïdes verticaux le disent :
> chez `townhouse` (`#a8704a`, centroïde 0,46) et `manor` (`#b06a48`, 0,49) c'est le
> **MUR** qui se dissout ; chez `stonehouse` (`#7c828c`, 0,30) c'est le toit. Le
> coupable est le rang 4 du calcaire, quelle que soit la surface où il atterrit —
> viser « la valeur des toits » aurait raté la cible sur deux archétypes sur trois.
>
> #### ✅ LIVRÉ le 2026-08-05 : `townhouse` et `manor` sortent de l'échange
> Arbitrage de Raph : étendre l'exclusion de juillet plutôt que dégeler la palette.
> Une ligne dans `FAMILY` (housePalette.js) + leur entrée dans `SANS_TEINTE` côté
> garde. Zéro art, zéro palette.
>
> | bande | avant | après |
> |---|---|---|
> | 2 | 25,0 % | **2,8 %** |
> | 3 | 32,2 % | **15,1 %** |
> | 4 | 9,2 % | **0,0 %** |
>
> La bande 2 passe de la pire du jeu à quasi parfaite. Le cliquet de
> `isoBuildingGroundContrast.test.js` est descendu d'autant. Capture
> `.preview-shots/s8-b2-sans-calcaire.png` : la ville de bande 2 est désormais
> franchement en brique sur pavé gris — c'est la polarité de la référence voxel.
>
> ⚠ **Coût assumé, visible sur la capture** : la bande 2 n'a plus AUCUNE variation de
> matière (`townhouse` ×2 + `courtyard`, aucun échangeable) et la bande 3 ne garde que
> `stonehouse`. Plus lisible, plus uniforme. **À rétablir le jour où la teinte de
> calcaire existe** — c'est la première chose à refaire à ce moment-là.
>
> ⚠ **Piège attrapé au passage** : `houseVariants.test.js` codait « townhouse » en dur
> dans sa garde anti-damier. L'archétype sorti de `FAMILY`, elle rendait 100 % de
> voisins identiques et échouait pour une raison sans rapport avec ce qu'elle
> surveille. Elle lit désormais le premier archétype de la table.
>
> #### Les bandes restantes, instruites à la même méthode (2026-08-05)
>
> | bande | coupable | part | dist. | contre | nature |
> |---|---|---|---|---|---|
> | 1 | `#c98f5c` (chaume du `longhouse`) | 34,9 % | 21,6 | terre battue | deux ocres |
> | 6 | `#7c828c` (ardoise `arcologyhome`) | 24,6 % | 11,9 | béton | deux gris-bleus |
> | 7 | `#32474b` (skin cosmique) | 25,0 % | 9,7 | dalle tech | deux bleus sombres |
> | 8 | `#3c3b47` + `#3b3d55` | 25,0 % | 7,1 / 13,4 | dalle tech | deux bleus sombres |
>
> **Le motif est structurel** : à chaque ère, le sol et l'architecture de cette ère ont
> été dessinés dans la MÊME famille de matière, donc ils se confondent par
> construction. Le cas `#8f8475` était la version aiguë (une table pointant *sur* la
> couleur du sol) ; ceux-ci sont chroniques.
>
> ⛔ **Et le levier de dose (S2) ne les sauve pas** — mesuré, pas supposé. Il faudrait
> descendre à une dose de **0,2**, c'est-à-dire effacer la tuile : double refus (le
> pavage devient un aplat uniforme, `PERF-CARTE-REPRISE.md` §5, et Raph a remonté
> `tileA` à 1 en juillet pour la raison inverse). À la bande 1 le levier n'existe même
> pas : l'aplat et la tuile sont à la même luminance (141 contre 142).
>
> | bande | dose 1,0 | 0,6 | 0,4 | 0,2 |
> |---|---|---|---|---|
> | 1 | 21,6 | 20,5 | 20,0 | 19,5 |
> | 6 | 11,9 | 20,4 | 29,9 | **40,1** |
> | 7 | 9,7 | 25,8 | 39,2 | **52,9** |
>
> **→ Le chemin sans art est ÉPUISÉ, et c'est mesuré.** Ce qui reste demande une tuile
> de sol redessinée, des skins repeints, ou la teinte de calcaire. ⚠ Relativisation
> utile : les bandes qui restent en échec sont 1 et 6-8, c'est-à-dire le tout début et
> la fin de partie. Les bandes 2 à 5 — celles de la capture de Raph et de l'essentiel
> d'une partie — sont désormais à 0,0-16,1 %.
>
> #### La garde nomme désormais le coupable
> Elle ne dit plus « la bande 6 échoue » mais :
> `ère 6 : arcologyhome/origine dissout 27,7 % de son encre — coupable #7c828c,
> 24,6 % de l'encre, à 11,9 du sol`. C'est cette attribution par couleur qui a trouvé
> `#8f8475` ; l'inscrire dans la garde évite de refaire l'enquête à chaque régression.
>
> **Conséquence pour le calendrier : S13 se réduit à UNE TEINTE.** Il ne faut pas une
> campagne de palette, il faut un calcaire de L 110-150 assez chromatique pour clairer
> 40 contre les deux sols. C'est mesuré, justifié, et ça débloque d'un coup S8 (la
> collision) et le défaut central. ⚠ Ça touche la palette maîtresse FIGÉE depuis le
> 2026-07-02 et ça rouvre l'arbitrage anti-jaune : c'est une décision de Raph.

> ### ✅ La hiérarchie de hauteur : réglée par l'ART (2026-08-06)
> Quatre archétypes livrés par une session parallèle. Rapport hauteur max/min de
> l'encre par bande :
>
> | bande | avant | après | apporté par |
> |---|---|---|---|
> | 3 | **1,10** | 1,58 | `towerhouse` (76 px d'encre contre 49) |
> | 4 | 1,35 | 1,70 | `insula` (68) |
> | 5 | 1,55 | **2,34** | `terrace`, qui ajoute un type BAS (47) |
>
> Un rapport de 1,10 à la bande 3 — trois archétypes à 49, 53 et 54 px — c'était
> littéralement le constat « 848 bâtiments sur 849 entre 44 et 66 px ». **Aucune règle
> de tirage ne pouvait créer une variété qui n'existait pas.** Mesuré ensuite au
> `frameStats`, la bande 3 rejoint le régime de la capture qui lit bien : amplitude
> 205,6 contre 199,4, grain 34,6 contre 32,7.
>
> ### ✅ La tour redevient un ACCENT (2026-08-06)
> Mesuré à la pose : `towerhouse` sortait à **22,8 %** des habitations de la bande 3,
> soit une tour toutes les 4,4 maisons — une forêt de pointes régulières, une
> monotonie remplacée par une autre. La liste `base` passe de 5 à 8 entrées :
> **13,2 %** mesuré après, les deux types courants à parité (44,4 / 42,5 %).
> Un repère qui se répète n'en est plus un.
>
> ### ⚠ S4 CHIFFRÉ, et son correctif demande un arbitrage
> Le défaut de pose des emprises multi-tuiles est maintenant mesuré, et il croît avec
> la taille — exactement l'inverse de ce qui fait lire une ville :
>
> | emprise | attendu | obtenu | perte |
> |---|---|---|---|
> | 1×1 (`block`, b5) | 20 % | 36,8 % | **absorbe** la part des autres |
> | 1×2 (`tenement`, `tower`, b5) | 20 % | 13,9 / 12,5 % | −35 % |
> | 2×2 (`manor`, b4) | 16,7 % | 2,7 % | **−84 %** |
> | 2×2 (`manor`, b3) | 12,5 % | **0 %** | l'archétype n'apparaît jamais |
>
> **Mécanisme, confirmé par lecture** : `chooseVariant(category, i, cell)` tire depuis
> la CELLULE (`buildingGenerator.js`, `(n + h) % list.length` avec `h = hash(gx,gy)`).
> Quand `finalize` refuse une emprise qui ne tient pas, le slot passe à la cellule
> suivante — et **retire un variant différent**. Le manoir n'est donc jamais réessayé ;
> seuls les tirages tombant sur du 1×1 aboutissent.
>
> #### ✅ S4 LIVRÉ le 2026-08-06
> J'avais d'abord posé le reshuffle comme un blocage nécessitant un arbitrage. **C'était
> faux : il avait déjà eu lieu.** Les quatre archétypes de la vague précédente ont fait
> passer la bande 3 de 3 à 8 entrées, et `list[(n + h) % list.length]` change
> d'affectation dès que la longueur change — toutes les positions avaient déjà changé,
> dans le commit `e1aedaa`. Le coût invoqué était déjà payé.
>
> Livré : `chooseVariant` tire sur l'INDEX DE SLOT seul sous la bande 7
> (`hashString(seed:category:v<i>)`), plus une **sonde en avant bornée** (96 cellules)
> dans `placeCategorySlotted` qui ne consomme pas le curseur — sans elle, un seul 2×2
> sans place mangerait toute la file. Les bandes cosmiques gardent la boucle d'origine
> (tirage par bloc, îlots uniformes voulus).
>
> | | attendu | avant | après |
> |---|---|---|---|
> | `tenement` 1×2, b5 | 20 % | 13,9 % | **19,3 %** |
> | `tower` 1×2, b5 | 20 % | 12,5 % | **20,9 %** |
> | `manor` 2×2, b4 | 16,7 % | 2,7 % | **6,7 %** |
> | `manor` 2×2, b3 | 12,5 % | 0 % | 0,3 % |
>
> Comptes de maisons conservés partout (372 / 522 / 839).
>
> ⚠ **CORRECTION du 2026-08-06 : « les 1×2 atteignent leur poids nominal » était un
> artefact de la liste du moment.** Ces 19,3 / 20,9 % ont été mesurés contre une liste
> b5 à 5 entrées (nominal 20 %). La session parallèle l'a depuis ramenée à 4 entrées
> (`terrace` ne compte plus qu'une fois) : nominal 25 % chacun, et les mêmes types
> sortent à **12,0 et 12,6 %**, soit la moitié.
>
> **Ce que ça révèle, et qui vaut mieux que le chiffre d'origine : la pose de
> multi-tuiles a un PLAFOND DE CAPACITÉ.** Il ne dépend pas du poids demandé mais de
> la granularité de l'espace libre, et les 1×2 **se bloquent mutuellement** (chacun
> posé retire les emplacements de ses voisins). Demander 50 % de 1×2 à la bande 5 n'en
> produit pas plus que demander 40 % — l'excédent retombe sur le repli 1×1, que
> `block` et `terrace` absorbent (37,2 et 38,1 %).
>
> **Conséquence pour qui règle ces listes : au-delà d'environ un quart de la liste, une
> emprise multi-tuiles ne rend plus ce qu'on lui demande.** Le régler par le poids est
> sans effet ; il faut libérer de l'espace contigu.

> #### ⛔ « Libérer les districts pour débloquer le manoir » : ÉCARTÉ (2026-08-06)
> C'est moi qui l'avais proposé comme « lot court et bien cerné ». Mesuré, il ne tient
> pas — sur les deux tableaux.
>
> | bande | districts | cellules réservées | carrés 2×2 offerts | occupées |
> |---|---|---|---|---|
> | 3 | 3 | 17 | **6** | 0 |
> | 5 | 15 | 130 | 57 | 0 |
> | 7 | 107 | **1 120** | — | 0 |
>
> 1. **Le gain sur le manoir est dérisoire là où il compte.** À la bande 3 — l'ère de
>    la capture de Raph — ça offrirait **6 emplacements pour ~46 tirages de manoir**.
>    Le manoir passerait de 0,3 % à ~1,6 %. Ce n'est pas le déblocage annoncé.
> 2. **Et ça DENSIFIERAIT, à contresens du retour de Raph.** Les 1 120 cellules de la
>    bande 7 (pour 2 371 tuiles bâties) ne se lisent PAS comme des trous : capture
>    `.preview-shots/b7-districts-vides.png`, elles font des respirations entre les
>    blocs. Les libérer ajouterait ~1 120 bâtiments à une ville dont le grief était
>    « les îlots sont trop denses ».
>
> **Ces emprises remplissent donc une fonction — clairière — sans que personne l'ait
> voulu.** Les dessiner reste ouvert (ce serait des repères civiques, ce qui manque
> encore) ; les libérer est à écarter.

> #### ⛔ Tri « grandes emprises d'abord » : ESSAYÉ, MESURÉ, REJETÉ (2026-08-06)
> Suite logique du diagnostic ci-dessous (73 % des refus venaient de `usedKeys`, donc
> des 1×1 posés plus tôt) : trier les slots par aire décroissante pour que les masses
> se posent sur une carte encore vide. Implémenté, mesuré, **retiré** :
>
> | | avant | avec le tri |
> |---|---|---|
> | `manor` b3 | 0,3 % | 1,9 % |
> | `manor` b4 | 6,7 % | 8,8 % |
> | `tenement` b5 | 19,3 % | **12,6 %** |
> | `tower` b5 | 20,9 % | **11,8 %** |
>
> Le tri gagne 1,6 et 2,1 points de manoir, et perd **40 %** sur les deux types 1×2 de
> la bande 5 — qui pèsent bien plus dans une ville. Mauvais échange, revenu à `36de247`.
>
> Et la sonde a donné la vraie cause, qui n'est pas l'ordre : **même en posant les
> manoirs EN PREMIER, 22 617 refus sur 24 049 viennent encore de `usedKeys`**. La carte
> n'est donc pas vide quand les maisons arrivent — moteurs, merveilles, places et
> districts l'ont déjà remplie. **L'espace libre de la bande 3 est GRANULAIRE : des
> cellules isolées, pas des carrés.** Un 2×2 n'a nulle part où aller, et aucun ordre de
> pose n'y changera rien. Ce qui débloquerait le manoir, c'est de libérer de l'espace
> contigu — à commencer par les districts, qui réservent 43 cellules à la bande 3 sans
> rien dessiner dessus.
>
> ⚠ **Le repli 1×1 est assumé et il a été mesuré.** Première version : sauter le slot
> quand l'emprise ne loge pas, pour ne pas reproduire la substitution silencieuse.
> Mesuré, c'était pire — **54 bâtiments perdus sur 522** à la bande 4, 10 % de la
> ville. La masse bâtie compte plus que la pureté du tirage.
>
> ⚠ **RESTE OUVERT : la bande 3 ne décolle pas** (0 → 0,3 %). `decCellFree(gx, gy, 2, 2)`
> y refuse quasiment toutes les cellules de la fenêtre de sonde. `footprintFits` a été
> relu, sa signature et son corps sont corrects (l'ordre d'arguments inhabituel
> `spanX` en 3e / `spanY` en 6e est le bon). La cause est donc dans `claimed` ou dans
> la densité de voirie de cette bande, et elle n'est PAS isolée. À reprendre là.

### Palier 0 — L'instrument (avant tout le reste)

**S0 — Instrument de valeur + garde bâti/sol.** `scripts/frameStats.mjs`
(histogramme de luminance d'une capture, écart-type local en fenêtre 8×8, part de
surface par décile) + `isoBuildingGroundContrast.test.js`, calqué sur la garde
existante.

Pourquoi d'abord : **aucun des 82 scripts `.mjs` du dépôt ne compare deux images**
(grep `diffPix`/`compare` vide) et **aucune des 70 suites de tests ne regarde une
frame rendue**. Le grief de Raph est intégralement un grief de valeur : sans cet
instrument, tout jugement reste à l'œil. Le code de lecture existe tel quel
(`isoRoadGroundContrast.test.js:31-49`).

⚠ Le seuil 40 de la garde existante est calibré sur des tuiles voilées cuites côte à
côte : **il n'est pas transférable** à un couple sol/sprite. Le recalibrer sur les
couples qui LISENT déjà avant d'en faire une porte. En rejouant la métrique, deux
bandes échouent : **b6 (30,5)** et de justesse **b2 (40,8)** ; b3 (63,6), b4 (123,7)
et b5 (119,7) sont larges.

**S0 bis — Remesurer `__tissu()`.** Toute la série de distribution des rangs
(18,5 % / 23,8 / 54,6 % de boulevard) a été relevée **avant** le correctif
`connectorRank` déjà posé dans l'arbre (`layout.js:2894`, `ROAD_RANKS.connector =
secondary`). Elle est périmée. Ne régler aucun plafond avant de l'avoir rejouée.

### Palier 1 — La netteté, en quelques constantes (aucun art)

| | Chantier | Coût |
|---|---|---|
| **S7** | **Le sol blitté enfin 1:1.** Poser la grille de cellules à partir d'un pas entier précalculé (`stepX = round(hw)`) au lieu d'arrondir chaque projection, ce qui rend le `+1` inutile. ⚠ Les deux gestes vont ENSEMBLE : retirer le `+1` sans poser le pas entier rouvre les liserés transparents entre losanges, défaut déjà combattu (`:673-679`) | S |
| **S6** | **Poser les sprites sur des pixels entiers.** Arrondir `drawW`/`drawH` puis `left`/`top` dans `blitProp`, `blitPropGrounded`, `blitCosmicTower`, `plazaAnchor` + helper `snapDev(v) = round(v·dpr)/dpr` : les arrondis existants se font en px CSS sous un contexte scalé par dpr, donc à 125 % ou 150 % d'échelle Windows ils tombent sur des quarts de pixel device — **ils défont le snap de caméra posé juste avant** (`:9983-9991`). ⚠ Quantifier le jitter d'échelle à 17 valeurs, ne pas le supprimer : c'est un acquis anti-damier | S |
| **S11** | **Quantifier le zoom** (p. ex. `round(z·4)/4`). ⚠ À annoncer explicitement comme n'étant PAS le « taille-selon-le-zoom » écarté le 2026-08-03 : aucune taille relative ne change, on limite les valeurs que la variable peut prendre. ⚠ Les deux planchers de dézoom (`cityMapRuntime.js:419`, `:428`) sont des réels calculés : les rabattre sur le cran supérieur | M |
| **+** | **Le quai dans le calque** — cf. `REPRISE-TRACE-VECTORIEL.md` §4.1 | S |

### Palier 2 — La composition, sans art

| | Chantier | Gain | Coût |
|---|---|---|---|
| **S1** | **Plafonner la promotion de rang.** `wideCap` / `mainCap` dans `ROAD_RANKS` (`layout.js:108`) + fermer `trunkUse` (0,30). `applyRoadWidenings` (`:1698-1702`) est un `for (i < count) { promote(runs[0]) }` sans plafond, `count` non borné. Le cliquet est monotone partout : **la distribution ne peut que dériver vers le haut.** Le plan a déjà écrit ce chantier (§L4 étapes E0-E4) et ne l'a pas livré | décisif | S |
| **S3** | **Rendre aux bâtiments leur pouvoir d'occulter** (cf. §2) | net | S |
| **S2** | **Calmer le grain du pavé.** Lever le gate `mat.type === 'earth'` (`:2440`) pour que `URBAN_DETAIL.tileA` s'applique aussi à cobble, et redoser **la seule matière cobble**. L'aplat de ton EST peint dessous (`texAlpha = 0`, `:2350`), donc doser ne laisse aucun trou. ⛔ **C'est un retour en arrière sur une décision de Raph** — voir §6 | décisif | S |
| **S5** | **Semer par grappes au lieu de par cellule.** Le tirage d'arbre de ville est un hash par cellule (`layout.js:2994-3003`) : bruit blanc, donc confetti. La forêt sauvage, elle, a un bruit de bloc (`isoRenderer.js:5168-5172`) dont le commentaire dit « agglutine les arbres en fourrés et ménage des trouées » — et elle lit en masses. Même défaut sur les parcs (`:2209-2214`). ⚠ `cellNoise` doit migrer dans un module pur d'abord : `layout.js` ne peut pas importer `isoRenderer.js` sans cycle | net | S |
| **S10** | **Rebrancher `qkind` sur le sprite** (cf. §2). ⚠ `__pixelHouses(false)` montre déjà à quoi ressemble une ville colorée par quartier : **c'est l'A/B gratuit à faire AVANT de coder.** Coût sous-estimé : le cache passe de ~24 à ~384 canvas | net | M |
| **S4** | **Rendre au manoir sa fréquence.** Il est tiré 25-33 % du temps et posé **4-6 %** : le refus d'empreinte fait avancer le curseur et `chooseVariant` re-tire sur la NOUVELLE cellule, donc seule la variante 1×1 survit — et c'est toujours la plus basse. Réserver les lots multi-tuiles en amont. ⚠ La cause n'est PAS la pose contre la rue (réfuté) mais l'occupation cumulée `usedKeys` | net | M |
| **S8** | **Casser la collision de teinte des toits.** `housePalette.js:72` envoie la rampe brique sur `#8f8475`, et `:91` y envoie **aussi** l'ardoise. La garde d'injectivité ne vérifie l'injectivité qu'À L'INTÉRIEUR d'un échange, jamais ENTRE les deux : angle mort structurel. ⚠ Bloqué par la palette (§ S13) : seul `courtyard` apporte vraiment un ton neuf | net | S |
| **S9** | **Le pas des joints du trottoir.** Une cellule de rue urbaine reçoit **7 couches systématiques, jusqu'à 12**. Le plus striant est le peigne : un `fillRect` tous les 0,26 tuile = 8,3 px, sur une bande large de 7 px. ⛔ Ne toucher NI `slabA` NI `tileA` (§6). ⚠ Pas avant S1 et S2 : le trottoir est aujourd'hui le seul dessin lisible du réseau | appoint | S |

### Palier 3 — Ce qui demande de l'art (c'est lui qui commande le calendrier)

| | Chantier | Coût |
|---|---|---|
| **S12** | **Dessiner les districts, ou les libérer** (cf. §2). ⚠ Rebrancher sur le socle `isoPlaza` demande de rouvrir le lot L1 (super-îlots, déclassé après mesure), pas d'ouvrir un chantier neuf | M + art |
| **S13** | **Élargir le cœur de palette.** Le cœur compte 41 teintes ; **seules 7 dépassent chroma 10 en OKLab, et 5 sont du FEUILLAGE.** Il ne reste que `copper` (10,2) et `terracotta` (11,5) pour une façade ou un toit — quand une brique new-yorkaise mesure **15,9** et un ocre eBoy **15,8** avec la même formule. Le secteur bleu du cœur est du gris pur, le secteur bleu-violet est vide. **Tant que le cœur reste ainsi, tout échange de rampes ne peut que permuter des ocres et des gris — c'est le plafond de tous les autres chantiers de couleur.** ⚠ Une rampe ocre rouvre le bannissement des jaunes (`buildPalette.mjs:52`) | L + art |
| **S14** | **La mitoyenneté, en art.** Façades de front, murets fermant le bord nu, variantes d'about. C'est le seul chemin vers l'îlot des deux références. ⛔ **INTERDIT de passer par le facteur d'échelle** : monter `HOUSE_LOT_WF` à 1,0 et descendre `HOUSE_UNIT` à 34 multiplie k par 1,66 et sort tout le corpus de la bande de porte 10-14 px. **On élargit l'ART, pas le facteur** | L + art |

---

## 4. À mesurer avant de trancher

1. **La distribution des rangs après le correctif `connectorRank`** (§S0 bis). Prérequis dur de S1.
2. **La config de rendu réelle sur la machine de Raph** : `devicePixelRatio`, `__CM.dpr`,
   `__CM.canvas.width`, `__CM.cam.zoom`, palier de qualité auto. Jamais relevé. Décide si
   `image-rendering: pixelated` sert à quelque chose (en palier Élevée, le plafond DPR de 2,0
   couvre les échelles Windows courantes : la règle CSS serait un no-op).
3. **La distance de valeur bâti/sol sur une CAPTURE**, pas sur les PNG : les habitations passent
   par l'échange de teintes, la couche de lumière et le LOD.
4. **Le taux réel de manoirs posés** : deux passes du dossier donnent 4,4 % et 5,8 % sur la même bande.
5. **Le nombre réel d'objets à l'écran** : `__streetProps().poses`, `CM._streetPropsDrawn`, le compte
   d'arbres. Trois compteurs qui existent et n'ont jamais été appelés depuis le correctif « devant une façade ».
6. **À quels zooms les liserés reviennent** si on retire le `+1` (S7). Zoom ×8 sur un pan uni.
7. **Le coût en ms des chantiers de netteté** : `CM._isoGroundBakeMs` avant/après. ⚠ Le budget se paie
   en NETTETÉ PENDANT LE GESTE, pas en fps : au-delà de 45 ms extrapolés, le sol bascule en re-blit flou
   pendant le zoom.

---

## 5. Écarté — ne pas reproposer

- ⛔ **AJOUTER DES ÉLÉMENTS.** Raph le dit et le code lui donne raison. Densifier le mobilier, les
  buissons ou les arbres avant d'avoir plafonné les rangs et calmé le grain, c'est **du bruit sur du bruit**.
- ⛔ **Toute ombre ou ancrage sous un bâtiment.** `drawGrounding` retirée le 2026-07-07 ; l'ombre peinte
  au pied du manoir et de la tente effacée des PNG le 2026-08-04 (commit `52e65d2`). Socle carré, ellipse
  de contact, dalle dans le sprite : **3 refus**. La silhouette translatée du pont n'est pas une porte de
  sortie — c'est la même image.
- ⛔ **Rétrécir les largeurs de voirie.** Le levier est le PLAFOND de promotion, pas la largeur. Ramener
  avenue à 0,26 la collerait à secondary (0,25) et effacerait la hiérarchie demandée le 2026-07-28.
- ⛔ **Augmenter `FRONT.push`.** La molette est **inerte** : 0,19 est déjà le plafond géométrique. Effet
  mesuré 2 px à zoom 1.
- ⛔ **Agrandir les sprites par le facteur d'échelle.** L'échelle habitants/bâtiments est CLOSE depuis le
  2026-08-05.
- ⛔ **Un voile de sol à forte dose dans la famille chaude.** Calcul fait : pour garder la distance
  chaussée/sol au-dessus du seuil 40, l'alpha maximal du même ton est **~0,08, soit 6 points de luminance**.
  Aucun voile de cette famille ne peut descendre le sol de 35 points sans faire disparaître la rue.
  **Et `GROUND_VEIL` n'existe pas dans le code**, contrairement à ce que plusieurs notes laissent croire.
- ⛔ **Baisser `slabA` ou `tileA` du trottoir** : montés de 0,12 à 0,42 le 2026-08-05 sur demande explicite.
- ⛔ **Égaliser les variantes de tuiles de sol** : refusé le jour de l'essai, les écarts SONT le patchwork voulu.
- ⛔ **Remapper les sols ou les bâtiments sur la palette maître en l'état** : le remap coupe **33 % de la
  chroma** (5,30 → 3,56). Lancer une passe d'unification « pour faire propre » avant d'élargir le cœur
  ÉLOIGNERAIT des références.
- ⛔ **Toute variation de ton par cellule** (jitter d'aplat, voile en plaques, usure en ellipses, damier de
  parité) : **4 refus distincts**. La vie vient de motifs CONTINUS.
- ⛔ **Décorer la couture herbe/ville** : 7 refus.
- ⛔ **Relever le plafond de teintes par sprite** : déjà dépassé par le bas (habitations à 9-17 teintes pour
  un plafond de 22). Ajouter des teintes ferait du bruit, pas du contraste — exactement le grief.
- ⛔ **Optimiser le JavaScript de la carte** : 4 tentatives mesurées et perdues.

---

## 6. Les deux arbitrages qui demandent Raph

1. **S2 — le grain du pavé est un retour en arrière sur sa propre décision.** Il a monté `tileA`
   de 0,12 à 1 le 2026-07-28 pour que les variantes régénérées « s'affichent pleines ». Redoser
   cobble revient dessus. **Ne pas le faire en silence.** À proposer en A/B par
   `__groundMat({tileA})` sur la seule matière cobble, sur planche à l'échelle du jeu (pan de 7×7
   cellules), jamais sur une vignette.
2. **S8 — la garde d'injectivité unilatérale ratifie une décision explicite** (`housePalette.js:63-67`).
   La rendre bilatérale demande de rouvrir cette décision, pas de « réparer un bug ».

---

## 7. Formulations réfutées — consignées pour ne pas les reprendre

| Réfuté | La formulation juste |
|---|---|
| « Toute l'image tient dans 46 unités de luminance » | l'amplitude est de **87** (herbe 71 → trottoir 158). Le problème n'est pas un manque global de contraste, c'est qu'il est dépensé sur le trottoir et l'herbe |
| « Aucune ombre portée, et elle n'a jamais été refusée » | elle a été codée, livrée, **puis retirée** — et refusée 3 fois sous 3 formes |
| « `connectorRank` promeut les dessertes au boulevard » | **périmé** : le correctif est déjà dans l'arbre |
| « Le trottoir est à 188 de luminance » | **158**. Sa tuile est `ground-cobble`, pas `walk-stone` (asset explicitement refusé). Écart au sol +36, pas +66. Et `lightK` ne sert que dans le repli : la vis proposée n'existe pas sur ce chemin |
| « Le seul poste cher est le tracé du sol » | le sol coûte **4 %** de la frame parce qu'il est BAKÉ ; le tri peintre en coûte 43 %. Le poste cher est la RECUISSON (167-660 ms), et baisser `tuftP` gagne sur la fluidité du PAN, pas sur les 24,8 ms |

---

## 8. L'ordre en une ligne

**S0 (mesurer) → palier 1 (netteté, constantes) → S1 + S3 (les deux gros gains de
composition sans art) → le reste du palier 2 → l'art.**

La netteté se corrige en quelques constantes. La composition demande du placement,
puis de l'art. Et l'art est le poste qui décide du calendrier — comme toujours sur
ce projet.
