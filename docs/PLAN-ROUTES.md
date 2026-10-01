# Plan — Routes : une ville qui se souvient de ses rues

Chantier ouvert le 2026-10-01. Demande de Raph : « il faut refaire le système de
route pour qu'il soit cohérent avec les ères, et que les routes ne poussent pas
n'importe comment ».

## 1. Le défaut, mesuré

Sonde headless (`.preview-shots/routes-probe/`, gitignoré) : une même ville (seed
fixe, même état d'une étape à l'autre, comme une vraie partie) grandit de l'ère 0
à l'ère 34. Repère = centre de grille (`cx, cy`), celui des slots persistants.

| moment | rues d'avant qui DISPARAISSENT |
|---|---|
| changement d'ère, villages (ères 5-9) | 49-62 % |
| changement d'ère, bourg/cité (10-19) | 39-63 % |
| changement d'ère, villes (20-34) | 9-71 % |
| simple achat dans la même ère, village | jusqu'à 62 % |

Causes, vérifiées dans le code :

1. **Aucune mémoire du réseau.** `computeCityLayout` recalcule tout à chaque achat :
   échafaudage → placement → dissolution → desserte retracée bâtiment par bâtiment.
   Nouveaux compteurs = autre arbre de rues.
2. **Le cœur glisse.** `plan.core = cx + (rng − 0,5)·N·0,16` (cityPlan.js) : il
   dépend de N, qui grandit. Mesuré : (0,5 ; −1,3) à l'ère 0 → (5,3 ; −12,9) à
   l'ère 34. Toute la grille d'avenues, ancrée sur le cœur, saute d'une case à
   chaque arrondi, alors que les bâtiments sont ancrés sur `cx, cy`. Le pont (la
   colonne la plus proche du cœur) dérive avec lui.
3. **Le plan change deux fois** : village dispersé (bandes 0-1) → ville-rue ou
   carrefour (2-3) → capitale en damier (4+). Chaque bascule redessine la ville.
4. **La matière est globale** : au changement de bande, `ROAD_MATS` repeint TOUTES
   les rues d'un coup. Pas de vieux centre.

Le fleuve, lui, est stable : moins de 1,5 case de dérive sur toute la partie.

## 2. Ce que Raph a tranché (2026-10-01)

1. **Le vieux centre reste ancien** : les ruelles gardent leur terre ou leurs
   pavés ; seules les grandes artères sont refaites dans la matière de l'ère.
2. **Chaque quartier prend le style de son ère** : la ville se lit en couches.
3. **Ordre** : campement → village → bourg d'abord (ères 0-14, bandes 0-2),
   planche avant/après, puis les cités.

## 3. Les règles

- **R1 — Une rue posée ne disparaît plus.** Elle peut seulement monter en grade
  (sentier → rue → avenue) ou être repavée. Exceptions explicites : une merveille
  qui se construit dessus, le fleuve qui la recouvre.
- **R2 — Une rue nouvelle part toujours du réseau existant**, vers les bâtiments
  qui en ont besoin.
- **R3 — Le cœur et le pont ne bougent plus** une fois la ville fondée.
- **R4 — Chaque cellule de rue sait quand elle est née et quand elle a été pavée.**
  Le rendu lit la matière de la cellule, pas celle de l'ère courante.

## 4. Les lots

| lot | contenu | bandes |
|---|---|---|
| L1 | Cœur et colonne du pont figés dans la sauvegarde (`state.cityCore`) | toutes |
| L2 | Réseau persistant (`state.cityRoads`) : chargé avant la génération, jamais émondé, complété par la desserte | 0-2 |
| L3 | Identité du bourg : la place du marché naît au feu de camp, la grand-rue est le chemin le plus emprunté, promu et pavé | 2 |
| L4 | Matière par cellule : vieux sentiers en terre, rues du bourg pavées | 0-2 |
| L5 | Les cités : couronnes et extensions planifiées autour du vieux centre | 3+ |

## 4 bis. État au 2026-10-01 (soir) — L1 à L4 faits, NON commités

Mesuré par la sonde, même graine, mêmes étapes, ères 0 à 14 :

| | avant | après |
|---|---|---|
| rues disparues par changement d'ère | 40-63 % | 0 (sauf berge qui recouvre une rue de rive, et parvis de merveille) |
| bâtiments déplacés par étape | 80-250 | 0-6 (ateliers qui grossissent) |
| maisons posées à l'ère 12 | 330 | 352 (toutes celles demandées) |
| cellules de place (bourg) | 16 → 43 (glissement) | 16, stable |

Ce qui a été fait, et où :

- **L1** — `state.cityCore = { seed, dx, dy, bx, wonders }` (layout.js, juste après
  `generateCityPlan`) : cœur, colonne du pont figés à toutes les bandes. Sur les
  villes (ères 20-34), les pics de 46-71 % de rues disparues tombent à 8-15 %.
- **L2** — `map/roadMemory.js` (format, décodage, molette `__roadMemory`) ;
  `state.cityRoads`. Dans layout.js : décodage après `plan.finalize`, fusion dans
  le squelette après `generateRoadsGraph`, `memKeep` passé aux trois émondages,
  chantiers de voirie payés dépensés UNE fois (`works`/`widened` dans la mémoire),
  écriture après `cmBuildRoadGraph`. Archétype forcé `scattered` tant que la
  mémoire couvre la bande (`forceAnyArchetype`, cityPlan.js).
- **L2 bis — les bâtiments tiennent leur place** (indispensable, découvert en
  mesurant) : `heldBy` = cellules des slots du cycle ; footprintFits refuse une
  cellule tenue par un autre propriétaire (`placingOwner`), l'échafaudage ne se pose
  plus dessus, `placeCategorySlotted` passe le propriétaire à `cellFree`. Sans ça,
  les maisons déménageaient et laissaient des chemins vers nulle part (la ville
  s'étouffait : 117 maisons posées au lieu de 235 à l'ère 9).
- **L3** — `plan.centralSite` (cityPlan.js) réservé dès le campement (ajouté à
  `hearthClear`) ; la place centrale y naît au bourg ; places mémorisées
  (`cityRoads.plazas`), une place neuve ne s'ouvre que sur terrain libre ; grand-rue
  = plus court chemin place → tablier, promu `secondary`. Merveilles FIGÉES à leur
  première pose (`cityCore.wonders`), et tenues à l'écart du site de la place
  (marge = rayon du parvis).
- **L4** — `pave` par cellule (venelle : bande de naissance ; artère, place :
  bande courante) → `rr.pave` → `iso/isoGroundRoads.js` (`matOf`) ; signé dans
  `tileSig` (solPyramideFrame.js).

Tests : `src/game/map/__tests__/roadMemory.test.js` (7) ; deux tests adaptés
(decorIntegration : stable dès le 2e calcul ; urbanGroundCoversBuildings : scénario
rejoué mémoire coupée + même invariant mémoire allumée). Suite : 1 904 verts, lint
propre.

Points ouverts, à trancher avec Raph sur captures :

1. **Densité** : la ville pose désormais toutes ses maisons (590 bâtiments contre
   418 à l'ère 14) — plus serré.
2. **Merveilles figées près du vieux centre** (avant : elles glissaient vers la
   périphérie en rasant tout sur leur passage).
3. **Grand-rue courte** : le pont débouche presque sur la place ; il manque un axe
   qui traverse le bourg.
4. **Places de quartier** : elles ne trouvent pas de terrain libre dans un village
   déjà bâti, seule la place centrale s'ouvre.
5. **Au-delà de la bande 2**, l'ancien calcul reprend (mémoire ni lue ni écrite) :
   la ville se redessine encore au passage à la cité. C'est L5.

## 4 ter. Retour de Raph sur le bourg, et lots L6-L9 (2026-10-01 soir, NON commités)

Verdict sur les captures L1-L4 : « un poil trop dense » ; « refaire les merveilles,
mieux les centrer sur leur parvis, davantage les espacer » ; « une vraie grande
artère principale (autoroute aux ères supérieures), la place doit se décaler » ;
« les places de quartier doivent trouver leur place ». Choix : places **réservées à
la fondation du quartier** ; aération par **jardins + ceinture verte**.

Tout vit dans `map/cityQuarters.js` (géométrie pure, molette `__cityQuarters`) et le
bloc « LA STRUCTURE DE LA VILLE » de layout.js (avant le tracé) :

- **L6 — artère** : colonne du pont prolongée tout droit sur les deux rives jusqu'à
  la lisière + 3 ; rang par bande (sentier → `secondary` → `main` au bourg) ; la
  colonne voisine (2e voie du pont) est RÉSERVÉE pour l'élargir aux ères suivantes.
  Place centrale CONTRE l'artère (ouest), figée (`cityCore.central`) ; le feu du
  camp brûle en son centre et un sentier droit le relie à l'artère.
- **L7 — quartiers** : chaque ancre est FONDÉE une fois (clé `bande:index`, son
  étiquette portait le kind, qui changeait d'une ère à l'autre), au premier site
  libre en s'éloignant du cœur dans sa direction ; position + kind figés
  (`cityCore.quarters`). Site réservé dès la fondation (pré), place au bourg pour
  TOUS les kinds (`QUARTER_PLAZA` : marché, parvis/place d'armes, square). Rues de
  quartier : plus court chemin site → artère promu `secondary`.
- **L8 — aération** : `spread` 1,4 (grille et portée, à partir du village — le camp
  validé ne bouge pas) ; jardins en grappes (30 %, bruit lissé échelle 4) et ceinture
  verte (médiatrice entre centres de quartier) hors constructible, sortis du sol de
  ville (herbe), contournés par la desserte, épargnés par la lisière divagante.
  ⚠ Tout tirage « par cellule » se lit dans le repère du CENTRE DE GRILLE en mémoire
  (`fx0/fy0`) : en absolu, le motif glissait sous la ville (84 maisons « dans » un
  jardin, 16 y étaient nées).
- **L9 — merveilles** : figées à la première érection (`cityCore.wonders`) ; une
  merveille neuve exige un parvis ENTIER libre (ni artère, ni site, ni bâtiment) et
  4 cases d'écart avec tout autre parvis ; parvis PAVÉ à la taille du socle
  (demi-socle + 1,5), le reste de l'emprise en pelouse ; SOCLE centré
  (`wonderFootWorld`, seulement quand `L.wonderPaveR` existe — ailleurs la boîte
  du sprite reste centrée, cf. projection.test).
- Une maison qui reprend SA place (cellule tenue) saute les règles de composition
  (écart entre tentes, voie à portée) : elles servaient à chasser les occupants.

Mesuré (sonde, ères 0-14) : 0 rue disparue hors berge, 6 déplacements (4 ateliers qui
grossissent, 2 maisons de rive) ; bourg ère 14 : grille 76, 590 bâtiments, 5 places.
Planche : `.preview-shots/routes-v2-planche.png`. Suite : 1 903 verts ; seul
`snowRoof` échoue, à cause de `granary-hall.png` modifié par une autre session.

### Miettes de sol (retour Raph, 2026-10-01 nuit)

« Ces petits morceaux de sol qui ne sont pas logiques » : carrés de sol clair au
bord de l'artère. Deux causes, deux corrections :

1. La **2e voie réservée** de l'artère (bande libre et traversable) servait de
   couloir aux sentiers du village, posés en parallèle de la grande rue. RETIRÉE :
   les maisons bordent l'artère, l'élargissement viendra avec les cités.
2. Partout ailleurs (déjà présent avant la mémoire : 24 carrés 2×2 au bourg ;
   25 maintenant), deux cellules de route voisines non reliées laissent une fente,
   et un carré 2×2 un losange de sol au coin commun. Le rendu les COMBLE
   (`isoGroundRoads.js`, § « PAS DE MIETTES DE SOL », molette
   `__roadMat({ gapFill: false })`) — sauf pont, place et virages arrondis.

## 4 quater. L5 — les cités, TOUTES les ères (Raph 2026-10-01 : « passe aux cités et fais toutes les ères »)

- **Mémoire sur toutes les bandes** (`ROAD_MEMORY.lastBand = 9`). Archétype
  organique forcé jusqu'au bourg seulement ; à partir de la cité, le plan de l'ère
  (radial, districts, capitale, mégalopole) reprend ses droits…
- **…sur le terrain NEUF seulement** (« LES EXTENSIONS PLANIFIÉES », layout.js) :
  toute cellule tracée à ≤ 2 cases d'un bâtiment posé ou d'une rue mémorisée est
  retirée, puis les morceaux détachés sont RECOUSUS au réseau par le plus court
  chemin (tableaux à plat). Vieux centre tortueux, faubourgs planifiés autour.
- **Axe des plans géométriques = colonne de l'artère** (`axisX`), **un seul pont**
  (`singleBridge`, roadGraph.js).
- **La percée** : à `ARTERY_TWIN_BAND` (5) l'artère devient boulevard à deux voies
  (2e voie = colonne ax+1, dans le prolongement de la 2e voie du pont) ; les
  bâtiments sur cette colonne perdent leur slot UNE fois (mesuré : 36 maisons).
  Croisements entre les deux voies là où une rue arrive (≥ toutes les 8 rangées).
- **Grands ensembles civiques figés** (`cityCore.districts`), jamais sur un
  bâtiment posé ; **grille qui ne rétrécit jamais** (`cityCore.maxN`).
- **Jardins et étalement par bande** (`gardenShareFor`, `spreadFor` : 30 % → 14 %,
  ×1,4 → ×1,15).
- **Une maison garde sa place quand son dessin grandit** (manoir 2×2, tour 1×2,
  tour cosmique 2×2) : repli sur un dessin d'une case (`smallVariant`, tirage hors
  cellule — aux bandes cosmiques le tirage par pâté retombait toujours sur la tour).
  Avant : 40 à 700 maisons déplacées par ère.
- **Merveilles** : la découpe des routes ne touche que le parvis PAVÉ et jamais
  l'artère (la Colonne au rang 4 coupait la rive sud du pont — 0 rue au sud).
- **Desserte** : jardins = obstacle DOUX (contournés, traversés en 2e passe) —
  contrat « aucun bâtiment servable sans rue » (roadDesserte.test).
- ⚠ `normalizeCityCore` (state.js) reconstruit la fiche : tout champ ajouté doit y
  passer (central, quarters, districts, maxN — oubliés au premier jet).

Mesuré (sonde `toutes.sonde.js`, ères 0 → 180) : **0 rue disparue** hors berge et
parvis ; 0-7 bâtiments déplacés par ère, sauf la percée (ère 25, 36 maisons) et
l'entrée en mégalopole (ère 30, 18). Fin de partie : layout ~345 ms contre ~300
avant (+15 %, la grille est plus grande) ; mémoire ~50 Ko dans la sauvegarde.
Planche : `.preview-shots/routes-cites-planche.png`.

## 5. Garde-fous

- Déterminisme par seed, idempotence d'un recalcul sans changement d'état.
- Sauvegardes existantes : à la première ouverture, le réseau et le cœur
  COURANTS sont mémorisés tels quels — aucun saut visible à la mise à jour.
- Effondrement : `cityCore` et `cityRoads` repartent à zéro avec la nouvelle seed.
- La sonde se relance après chaque lot : la ligne « rues disparues » doit tomber à
  zéro sur les bandes couvertes.
