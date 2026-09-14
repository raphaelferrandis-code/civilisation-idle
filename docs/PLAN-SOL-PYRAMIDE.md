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

### Lot 0 — Le banc et la façade (½ séance)
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

### Lot 1 — La tuile (1 séance)
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

### Lot 2 — La frame (1 séance)
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

### Lot 3 — L'invalidation partielle (1 séance)
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
