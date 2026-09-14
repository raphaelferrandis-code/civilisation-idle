# PLAN — Le sol en pyramide de tuiles

Ouvert le 2026-09-14 sur le go de Raph, après cinq relevés de la sonde de geste
(`scripts/sondeGeste.js`) sur sa machine (mégapole, GPU actif). La note
`NOTE-SOL-PYRAMIDE.md` porte l'architecture cible, les invariants mesurés et les
pièges ; ce plan la découpe en lots livrables, chacun avec SA preuve.

## 0. Pourquoi maintenant — les chiffres à battre

| Symptôme mesuré (relevé 5, build `Ct2gM9cs`) | Valeur | Cible pyramide |
|---|---|---|
| Drag au plancher 0,25 : bande de défilement | 44-46 ms (4 500-6 200 cellules) | une tuile ≈ 1 500 cellules ≈ 10 ms, jamais une bande pleine hauteur |
| Première tranche d'un plein au plancher | 53 ms (plafonnée à 64 px depuis) | plus de tranches : des tuiles |
| Recompute de layout → cache du sol | `missBase` 101-239, `restores` 0-1 | seules les tuiles touchées se recuisent |
| Frames > 100 ms pendant le geste | 5-13 sur 12 s | 0 imputable au sol |
| `sol` total sur 12 s de geste | 1 050-1 970 ms | ≤ 400 ms (cuisson budgetée 8 ms/frame) |

Ce que la pyramide NE règle PAS, et qui reste des chantiers à part : le
recompute de layout lui-même (312-563 ms synchrones), la peinture des sprites au
dézoom (11-27 k blits/frame), le quai (son propre bake, déjà en rafale).

## 1. Le principe, en une frame

- Le sol est découpé en **tuiles carrées de 256 px DEVICE**, par **niveau** =
  un cran de la grille de zoom (`ZOOM_QUANT.per = 8` → z = n/8, de 0,25 à 3,2).
- Coordonnées de tuile : l'espace « écran à caméra nulle » du niveau —
  `sx = (wx − wy)·ISO_X·z`, `sy = (wx + wy)·ISO_Y·z` (+ altitude du terrain,
  inerte à `amp = 0`) → `tx = floor(sx / 256)`, `ty = floor(sy / 256)`. Comme
  `worldToScreen` est une translation pure en caméra, une tuile est ancrée
  MONDE : sa clé ne dépend pas de la caméra.
- Une frame : niveau courant = cran ≤ zoom ; échelle `s = zoom / zNiveau`
  (1 hors glissement) ; pour chaque tuile visible → prête : `drawImage` à
  position DEVICE entière ; absente : **la tuile la plus fine disponible d'un
  niveau plus grossier qui la couvre**, étirée, et la tuile manquante entre en
  file. Jamais un pixel sans contenu, par construction.
- **File de cuisson** : 8 ms par frame (budget éprouvé), coût par tuile mesuré
  et extrapolé en 1/z² pour un niveau jamais visité ; priorité : tuiles
  visibles (centre → bords) → anneau de marge → tuiles du plancher sous la vue
  (le repli du dézoom réflexe). En geste : 1-2 tuiles par frame maximum
  (les uploads GPU groupés faisaient les trous de 100-150 ms).
- **Cache** : LRU global en Mo (256 KB par tuile ; 96 Mo ≈ 380 tuiles ; un
  écran 1765×1162 = 35 tuiles, 63 avec l'anneau). Jamais de purge totale.
- **Invalidation** : trois portes, une seule fonction (`solInvalidate`) :
  `all` (saison, bande d'ère, plage, relief, molettes) ; `cells(set)`
  (recompute de layout : diff des ensembles → tuiles touchées, tous niveaux) ;
  `soft` (décodage tardif : tuiles visibles marquées, recuisson coalescée).
- **`drawIsoGround` inchangé** : on cuit une tuile en posant `CM.cam` sur son
  origine, `CM.cw/ch` sur 256 + 2 gouttières, `CM.ctx` sur son canvas — le
  même geste que `gzcPrebakeStrip` et `bakeGroundStrip` font déjà.
- Le vif (bâtiments, agents, eau, quais, ponts) : hors périmètre, inchangé.

## 2. Les lots

### Lot 0 — Le banc et la façade (½ séance) — ✔ LIVRÉ 2026-09-14

> Fait : `iso/solInvalidate.js` (façade, 3 clés, abonnement de la pyramide par
> `setSolPyramideInvalidator`), `iso/solPyramide.js` (molette `__solPyramide`,
> défaut false, relevé `__solPyramideStats`), les 19 sites routés (isoGroundDetail
> ×7, isoGroundTiles ×2, isoArt, isoPlaza, isoTerrain, isoTissu, isoWonderGround
> ×2, isoDistricts, projection, cityMapRuntime ×2), garde
> `solInvalidate.test.js` (6 tests : comportement + aucune écriture directe hors
> isoGroundBake.js/solInvalidate.js), section `pyramide` dans la sonde. Lint +
> 1758 tests verts, build prod chargée, molette vérifiée en console.
> ⚠ Piège rencontré : un module qui ne pose que des molettes doit être importé
> quelque part (import d'effet dans solInvalidate.js), sinon la prod ne le
> charge pas.
- `__solPyramide` (défaut false) : l'A/B qui rend l'ancien chemin en une
  molette, tenu jusqu'au lot 4.
- **Façade d'invalidation** : les ~19 sites qui écrivent `CM._isoGroundBake =
  null` ou `.soft = true` (isoGroundDetail ×7, isoGroundTiles, isoArt, isoPlaza,
  isoTerrain, isoTissu, isoWonderGround, isoDistricts, projection,
  cityMapRuntime) passent par `solInvalidate(kind)`. Garde : un test lit les
  sources et refuse toute écriture directe (même idiome que
  `vivantSnapDevice.test.js`).
- La sonde gagne une section `tuiles` : cuites/frame, ms par tuile, hits du
  cache, replis étirés, tuiles sales par recompute.
- **Preuve** : lint + suite verts, ancien chemin byte-identique (capture
  `__cityShot` avant/après = 0 pixel).

### Lot 1 — La tuile (1 séance) — ✔ LIVRÉ 2026-09-14

> **Fait** : `iso/solPyramide.js` — géométrie pure (levelZoom, tileSpace /
> camSpace / camForSpace, tileIndex / tileOrigin, camForTile, tilesCovering,
> 9 tests), `cookTile` (une tuile par `drawIsoGround`, caméra au centre, état
> restauré en `finally`), `blitTile`, et le banc dev `__solPyramideAB` (plein
> vs tuiles, et tuiles vs tuiles sur une grille décalée d'une demi-tuile =
> **l'invariance à la découpe, la couture MESURÉE**). `drawIsoGround` exporté ;
> `isoArtLayer.artLayerAnchor` (ancre de phase du calque de voirie).
>
> **Preuve (petite ville, 952×680, dpr 1, deux passes — la 2e fait foi, la 1re
> chauffe les caches de textures)** — pixels « forts » (Δ > 8) entre les deux
> découpes / dont sur les frontières de tuiles :
> z 1 : 6 / 0 · z 0,5 : 12 / 0 · z 0,25 : 7 / 0 · z 0,375 : 164 / 0 ·
> z 0,875 : 3 / 0 · z 2,375 : 0 / 0. Δmax 9-10 hors z 0,375 (36).
> Les pixels « faibles » (Δ ≤ 8, 2 000-25 000 par écran) sont l'antialiasing
> des VOILES translucides (prairie, alpha ≤ 0,1) dont l'union de losanges se
> découpe autrement : invisible, mesuré à Δ ≤ 2 pour l'essentiel. Le critère
> retenu est donc « 0 pixel FORT sur les frontières », pas « 0 pixel ».
> Coût : 0,9-4,2 ms par tuile (z 1 → 0,25) sur ce poste.
>
> **Trois pièges payés, à ne pas repayer :**
> 1. ⚠⚠ **La caméra de cuisson doit être EXACTE en flottant.** Avec un côté
>    fixe de 256, camForTile donnait 8·X/n (z = n/8) non dyadique, et
>    worldToScreen arrondissait au dernier bit différemment par tuile : un blit
>    au plus proche voisin posé sur un demi-pixel basculait d'un pixel entier
>    → 2,5-5,7 % de l'écran différait entre deux découpes, PARTOUT. Remède :
>    `tileSideCss(dpr, z)` = côté multiple de n le plus proche de 256 (255 à
>    z 0,375, 259 à 0,875, 247 à 2,375), et côté device entier ; la caméra est
>    alors un demi-entier. Le banc lui-même doit décaler sa grille d'un multiple
>    de n (127,5 → 20 000 px faux).
> 2. ⚠ **Le calque de voirie est un raster à zoom 1 composé à l'échelle** : sa
>    grille dépend de la caméra de la tuile → `artLayerAnchor` décale tracé et
>    composition d'une même fraction φ = D mod z pour l'ancrer monde. Sans
>    ancre : byte-identique à avant (le plein n'en pose pas).
> 3. ⚠ **La première cuisson d'un zoom n'est pas la bonne** : les variantes de
>    textures se construisent à la demande (`ensureIsoTileKey`) → première
>    passe = aplat, seconde = texture. Toute mesure se fait sur une 2e passe.
>
> Résidu noté : plein vs tuiles diffère « fort » de 0,001-0,07 % (z ≤ 1) et
> 1,7 % à z 2,375 — la phase du raster de voirie, que le plein ne fixe pas et
> que les tuiles ancrent monde. Ce n'est pas une couture, c'est un autre
> arrondi, cohérent d'une tuile à l'autre.
- `iso/solPyramide.js` : clé de tuile, `tileFromWorld` / `worldFromTile`
  (fonctions pures, tests), cuisson d'UNE tuile : gouttière d'**une cellule**
  (les franges d'herbe mordent, les joints débordent), clip au blit.
- ⚠ Vérifier que `makeGroundBake` dérive ses bornes de cellules `b` de
  `CM.cw/ch` : le balayage doit rester O(cellules de la tuile), pas
  O(grille). Sinon, borner ici.
- ⚠ Phase des motifs : herbe et trame urbaine doivent rester ancrées MONDE
  (coordonnées de cellule) — un motif ancré tuile « saute » à chaque frontière.
  La caméra de cuisson est posée à l'ENTIER device.
- **Preuve** : composite de tuiles au repos vs plein actuel, à 3 zooms
  (1,0 / 0,5 / 0,25), même caméra, capture déterministe → diff de canvas :
  0 pixel différent hors gouttières, **0 pixel sur les frontières de tuiles**
  (la couture est le piège n° 1, on la mesure, on ne la regarde pas).

### Lot 2 — La frame (1 séance) — ✔ LIVRÉ 2026-09-14, ✔ MESURÉ chez Raph

> **Preuve sur la machine de Raph** (build `DQGkDthy`, mégapole, même geste,
> sonde avec `?pyramide=1` puis sans) — pyramide / ancien cache :
> frames dessinées en 12 s **472 / 348** ; rythme p50 **20,8 / 27,8** ms, p90
> **55 / 69**, p99 **83 / 111**, pire frame **111 / 201** ; frames > 100 ms
> **1 / 5** ; trous à l'écran 1. 625 tuiles cuites (1,9 s de cuisson répartie),
> 72 Mo, 5 059 replis étirés. Deux corrections dans la foulée : le quai lit
> l'horloge de rafale que l'ancien cache ne tenait plus (`7fca682`, il recuisait
> à chaque frame de zoom) ; un trou se bouche d'abord avec la tuile du PLANCHER
> qui le couvre (`8c43c3d`, 22 tuiles exactes d'un coup = 60 ms).
> Reste à obtenir de Raph : son verdict sur les jointures à l'œil.

> **Fait** : `iso/solPyramideFrame.js` — cache par POSITION (une entrée par
> tuile, fraîcheur = base de contenu + époque d'invalidation, périmée = repli),
> LRU en Mo, file de cuisson budgetée (8 ms repos / 12 ms geste, coût par
> niveau lissé et extrapolé en 1/z²), repli pyramidal PARTIEL (les niveaux les
> plus éloignés d'abord, le plus proche dessus), glissement de zoom = niveau
> étiré et cuisson au NIVEAU CIBLE (borné au plancher), pré-cuisson au repos :
> le plancher sur TOUTE LA CARTE puis l'anneau, capture = tout le visible
> synchrone. Branché dans isoRenderer (`paintGroundPyramid` sinon l'ancien) ;
> `groundKeySuffix` partagé ; `?pyramide=1` dans l'URL allume la molette.
>
> **Cinq règles trouvées au banc (grande ville, band 4, dev), à ne pas perdre :**
> 1. ⚠⚠ **« Jamais un pixel sans contenu » passe avant le budget** : une tuile
>    visible sans AUCUN repli se cuit hors budget (plafond dur 80 ms) — sinon
>    35 trous noirs au premier affichage, résorbés 1-2 par frame pendant une
>    seconde.
> 2. ⚠ **Hors de la carte, ni tuile ni trou** : le fond hors-monde est le bon
>    contenu. Sans ce test, des dizaines de tuiles vides se cuisaient en
>    urgence au plancher (100 ms de gel pour rien).
> 3. ⚠ **Sous z 0,5, tuile de 128 px** : une tuile de 256 coûtait 17 ms au
>    plancher, plus qu'une frame.
> 4. ⚠ **Le plancher se pré-cuit sur toute la carte** (~15 tuiles de 128 px),
>    pas sur la vue : un dézoom révèle jusqu'à 16× le monde visible.
> 5. ⚠ **La gouttière ne change pas la couture** (le pad de culling de
>    drawIsoGround fait le travail) : 8 px constants au lieu d'une cellule
>    (64 px à z 1 doublait la surface cuite : 4,2 → 2,2 ms la tuile).
>
> **Mesuré (dev, grande ville, mêmes gestes, pyramide vs ancien cache, poste
> `sol` par frame)** : repos p50 0,4 / p90 8,3 / max 16 (ancien 13,8 / 24,6 /
> 44,7) ; dézoom 5 crans p50 7,8 / max 16,6 (ancien 0,1 / 72) ; rezoom max 8,8
> (ancien 23,5) ; drag p50 0,2 / p90 24 (ancien 8,5 / 13,1 — le drag rapide
> cuit ~4 tuiles par frame, l'anneau ne suit pas un pan de 150 px/frame) ;
> **0 trou** sur les cinq gestes. Mémoire 28-60 Mo pour 130-350 tuiles.
>
> **Résidus, à juger par Raph** : (a) sous z 1 sur une grande ville, 1-2 % des
> pixels diffèrent « fort » entre deux découpes (petits traits sur les allées,
> les trottoirs, les touffes ; répartis uniformément, 2 % d'entre eux sur les
> frontières) — pas une couture continue, à regarder en jeu ; (b) le drag très
> rapide coûte plus qu'avant (cuisson des colonnes découvertes) ; (c) le
> premier affichage cuit tout le visible d'un coup (comme avant).
- Ensemble visible, LRU en Mo, file budgetée avec coût mesuré/extrapolé, repli
  pyramidal (tuile grossière étirée), glissement de zoom = étirement du niveau
  courant, capture (`CM.capture`) = cuisson synchrone de tout le visible.
- Pacing : la file rend la main dès 8 ms ; 1-2 tuiles fraîches par frame en
  geste.
- **Preuve sur la machine de Raph** (sonde, même geste que les relevés) :
  drag au plancher → `sol` ≤ 12 ms par frame, 0 bande ; dézoom 5 crans →
  0 frame avec un pixel hors-monde en zone monde (recette transitoire
  `forceFrame` + `toDataURL`, pane masquée, de la fiche clignotements) ;
  `sol` total sur 12 s ≤ 400 ms.

### Lot 3 — L'invalidation partielle (1 séance) — ✔ LIVRÉ 2026-09-14 (preuve dev ; à confirmer sur la save de Raph)

> **Fait** : chaque tuile porte la SIGNATURE DE SES CELLULES (`tileSig`,
> solPyramideFrame.js) — routes et leur masque, urbain, prairie, parvis,
> fleuve, bâti, ports, bancs de berge, cour, brèches du quai et îles qui
> touchent la tuile, avec deux cellules de marge (franges, faces). Au recompute
> du plan, la signature globale change ; une tuile est re-jugée SUR SES
> CELLULES à la demande (une fois par recompute, mémoïsé) : même signature →
> elle reste fraîche, sinon elle se recuit. Pas de diff old/new du plan : la
> signature par tuile suffit et ne dépend d'aucun état antérieur. Ce qui ne se
> signe pas par cellule (ère, saison, plage, mode du quai, relief, présence du
> fleuve) reste dans le suffixe : s'il change, tout se recuit. Garde :
> `solPyramideSig.test.js` (5 tests : stabilité, localité, masque de route,
> bâti/urbain, marge de deux cellules).
>
> **Preuve dev** (grande ville, 42 tuiles visibles) : une cellule de route
> ajoutée au plan → **36 tuiles revalidées, 6 recuites** à la frame du
> recompute (18 ms), puis 14 / 4 sur l'anneau ; aucune recuisson d'écran.
> Contre-épreuve : une croissance qui agrandit la GRILLE (gridN 78 → 84,
> toute la ville translate en monde) → 98 recuites / 18 revalidées — c'est
> juste, le monde a bougé sous les tuiles.
>
> **Deux pièges payés :**
> 1. ⚠⚠ **La clé du masque de quai porte l'horodatage du recompute** (`qg…`) :
>    laissée dans le suffixe, elle périmait TOUTES les tuiles à chaque
>    recompute — zéro revalidation, sans erreur visible. Le suffixe des tuiles
>    n'en garde que le mode (plein/naturel) ; bancs et brèches sont signés par
>    tuile.
> 2. ⚠ **Le fleuve grandit avec la grille** (1 866 → 2 003 cellules sur une
>    croissance) : ses tailles globales ne vont pas dans le suffixe — ses
>    cellules et ses îles sont signées par tuile.
> ⚠ Banc : en dev, un recompute « naturel » est dur à provoquer — la population
> ne change pas l'eraFrac, les achats directs ne bumpent pas la version des
> bâtiments (skipStable), `cycles` régénère tout. Muter le plan à la main
> (`CM.layout = {...L, roadSet, roadMap}` + `layoutRecomputeAt`) est le seul
> stimulus local fiable. La preuve réelle = la sonde sur la save de Raph
> (`pyramide.revalidees` / `sales` après un recompute dans la fenêtre).
- Au recompute : diff de `roadSet` / `urbanSet` / `roadMap` / `meadow` /
  `wonderGround` / `river.cells` entre l'ancien et le nouveau layout → cellules
  changées (+ leurs voisines : les fringes lisent le voisinage) → tuiles sales
  à tous les niveaux. Le recompute cesse d'être une purge.
- Softs coalescés par tuile (fenêtre ~250 ms), tuiles visibles d'abord.
- **Preuve** : ville en croissance, recompute en fenêtre → `tuiles sales` ≪
  `tuiles visibles` (attendu : quelques unités sur 35), hits du cache
  inchangés avant/après, aucune recuisson d'écran entier.

### Lot 4 — Le retrait de l'ancien cache (1 séance, APRÈS validation de Raph en prod)
- `__solPyramide` passe à true par défaut, Raph joue dessus quelques jours.
- Puis suppression dans `isoGroundBake.js` : bakeMargin du sol, cache de
  crans + restore exact/approché, pré-cuisson, tranches et bandes, filet,
  webLanding, budgets prédictifs, les trois horloges ; `solStrips.js` et la
  trace des tranches partent avec. `drawIsoGround` et ses passes restent.
- Tests de l'ancienne machinerie retirés, `bakeInvalidation.test.js` réécrit
  sur la façade. Docs + mémoire à jour ; NOTE-SOL-PYRAMIDE devient l'historique.
- **Preuve** : suite verte, `isoGroundBake.js` ≤ 400 lignes (1 141
  aujourd'hui), sonde à l'identique du lot 2.

## 3. Ordre, rythme, règles

- Chaque lot = un commit nommé, des fichiers nommés (jamais `-a`), lint +
  suite verts, et SA preuve chiffrée AVANT le lot suivant.
- Tout jugement de fluidité = PROD (`npm run build` + `npm run preview`), sur
  la machine de Raph, la ligne `gpu` lue en premier, la ligne `build`
  vérifiée après chaque Ctrl+F5.
- Tant que `__solPyramide` est false par défaut, un lot livré ne change rien
  pour le joueur : on avance sans casser.
- Estimation honnête : 4 séances de travail plus les jours de jeu de Raph
  entre les lots 3 et 4.

## 4. Risques nommés

- **Coutures** (gouttière, phase des motifs, caméra à l'entier) — mesurées au
  lot 1, pas regardées.
- **Coût fixe par tuile** (préparation de `makeGroundBake`, calque d'art de
  la voirie par appel) : 35 tuiles × coût fixe doit rester ≪ 8 ms → mesurer au
  lot 1, sinon partager la préparation entre tuiles d'une même frame.
- **Mémoire** : LRU en Mo, jamais en nombre ; plafond réglable par palier de
  qualité.
- **Terrain** (`amp = 0` par défaut) : entre dans la clé ; à `amp > 0`
  l'altitude déforme la projection mais reste ancrée monde — à vérifier au
  lot 1 avec `__terrain(true)`.
- **Harnais** : `__cityShot` / `captureFrame` doivent produire un sol complet
  et déterministe (chemin synchrone).
- **Le quai** garde son bake propre ; il pourrait rejoindre les tuiles plus
  tard, hors de ce plan.
