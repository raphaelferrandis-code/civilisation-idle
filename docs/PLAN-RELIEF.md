# Plan — Le relief : « tout est plat »

Chantier ouvert le 2026-08-22, sur le grief de Raph :

> « un des problèmes qu'on a sur le rendu c'est qu'il n'y a pas de relief, tout est
> plat. Est-ce possible d'ajouter un peu de relief ? »

Établi par une lecture du chemin de rendu iso (`iso/projection.js`, `iso/isoRenderer.js`,
`renderWorld.js`) et par l'examen d'une capture de ville d'ère 1 (`.preview-shots/v3-large.png`).
Complète `PLAN-RENDU-VILLE.md` (« brouillon et pas net ») : c'est la **troisième maladie**,
et elle ne se soigne ni au même endroit ni avec les mêmes moyens que les deux autres.

**Aucune ligne de code n'a été écrite.** Ce document est un plan.

---

## 1. Ce qui est plat, et de quelle façon

### 1.1 La projection n'a pas de troisième axe

`worldToScreen(wx, wy)` (`iso/projection.js:105`) mappe un point du plan sur l'écran, et
c'est tout : il n'existe **aucune notion d'altitude** dans le moteur. Corollaires :

- `depthOf(wx, wy) = wx + wy` (`:141`) — le tri du peintre ne connaît que le plan ;
- le sol est une boucle `gy × gx` qui blitte un losange par cellule au coin nord projeté
  (`isoRenderer.js:2158`, `blitIsoTileKey`) — même `y` pour toutes les cellules d'une même
  diagonale, sans exception ;
- le champ de hauteur `cityMapDrawTerrain` (`renderWorld.js:346`) — un vrai hillshade,
  vallée du fleuve + bruit de collines, rendu en basse résolution et blitté en `soft-light` —
  **existe, fonctionne, et n'est câblé que dans le chemin LEGACY** (`cityMapRuntime.js:2142`
  et `:2155`, sous `if (!_pixelGround)`). En iso — c'est-à-dire dans le jeu — il n'est jamais
  appelé. C'est du code mort depuis la bascule iso.

### 1.2 Trois symptômes, par ordre de surface à l'écran

| Symptôme | Surface | Ce qu'on voit |
|---|---|---|
| **Le fleuve est un autocollant** | ~12 % | Le ruban bleu est *dans* le plan du sol. Hors quai (grève, berges sauvages, îles) l'eau touche l'herbe sans la moindre marche. |
| **La forêt est un tapis** | ~40 % | Masse verte d'un seul ton, aucune modulation de valeur à grande échelle. Elle lit comme une texture, pas comme un terrain. |
| **Le plateau urbain est une nappe** | ~35 % | Une étendue beige unique, sans modulation, du bord de l'eau à la lisière. |

### 1.3 L'exception qui prouve la règle : le mur de quai

`cityMapDrawQuays` (`renderWorld.js:783-800`) dessine déjà **un parement vertical de 0,66 à
0,75 tuile** le long de l'eau (`st.wallTiles`, § « berge maçonnée façon TheoTown »), avec, en
commentaire, la géométrie exacte du relief :

> « L'axe VERTICAL du monde se projette en Z-écran pur (screen-Y vers le bas) → un parement
> vertical est un ruban qui "pend" sous la margelle […] Il n'est visible que sur la rive dont
> l'EAU est DEVANT ; l'autre rive n'en montre que la margelle (son parement est occulté par
> sa promenade). »

C'est, mot pour mot, la règle de la **face unique** que Raph a lui-même imposée pour la marche
de trottoir (`PLAN-TISSU-URBAIN.md` § « ET LA MARCHE N'A QU'UNE FACE — la perspective dit
laquelle »).

**Donc le jeu affirme déjà que l'eau est ~0,75 tuile plus bas que la terre — et rien d'autre
dans le monde n'en tient compte.** Le mur pend sous la margelle pendant que la nappe d'eau,
elle, reste au niveau du sol. On a la face d'une marche sans la marche.

C'est le point d'appui de tout ce plan : il ne s'agit pas d'inventer une altitude, il s'agit
de **rendre vraie une altitude que le rendu prétend déjà**.

---

## 2. Le levier : une seule fonction projette

La règle d'or du chantier iso — « PLUS PERSONNE ne projette à la main » (`projection.js:12`) —
est tenue : **98 sites d'appel**, tous à travers `worldToScreen` (92 dans `isoRenderer.js`,
3 dans `agents.js`, 2 dans `isoBridge.js`, 1 dans `renderWorld.js`).

Ajouter un troisième argument OPTIONNEL :

```
worldToScreen(wx, wy, wz = 0)   →   sy -= wz · zoom
```

est une ligne, rétro-compatible au bit près (`wz = 0` ⇒ comportement actuel), et **tout
consommateur qui passe une altitude lève correctement, sans autre changement**. Dans une base
de code où la projection serait recopiée à la main, ce chantier serait irréalisable ; ici il
est mécaniquement contenu. C'est la raison principale pour laquelle la réponse à la question
de Raph est **oui**.

### 2.1 L'unité de relief : le quart de tuile, et pas autre chose

`TILE = 32`, le zoom est quantifié au 1/8 (`ZOOM_QUANT.per = 8`, `projection.js:81`) et le blit
1:1 du sol exige que le pas de grille soit entier (`hw = 32z` entier et pair, `blitIsoTileKey`
§ S7). Le décalage vertical d'une marche vaut `H · U · z` px écran. Pour qu'il tombe toujours
sur l'entier aux crans autorisés `z = k/8` :

| U | décalage à `z = k/8` | entier ? |
|---|---|---|
| T/8 = 4 px | `k/2` | ❌ demi-pixel aux crans impairs |
| **T/4 = 8 px** | **`k`** | ✅ **toujours** |
| T/2 = 16 px | `2k` | ✅ (mais marche grossière) |

**⇒ L'unité de relief est `U = T/4 = 8 px monde`, et les hauteurs sont des ENTIERS de `U`.**
Sinon on rouvre la couture que le lot S11 vient de fermer, et le « +1 px anti-couture » revient
sur tout le sol.

Échelle qui en découle :

| Élément | Hauteur | Correspondance |
|---|---|---|
| Nappe d'eau | **−3 U** (24 px, 0,75 tuile) | = `wallTiles: 0.75` des ères modernes, à l'identique |
| Plateau urbain | **0** | inchangé |
| Collines hors ville | **0 → +6 U** (48 px, 1,5 tuile) sur ~25 tuiles | une marche tous les ~4 tuiles |
| Amplitude totale | **9 U** = 72 px monde = 2,25 tuiles | 72 px écran à zoom 1 |

Le mur de quai cesse alors d'être une constante par ère et devient **la face d'un vrai
dénivelé** : `wallTiles` se dérive de `−WATER_Z`, un seul chiffre pour toute la carte.

---

## 3. La décision de cadrage : LA VILLE RESTE À L'ALTITUDE 0

C'est la décision qui rend le chantier faisable, et elle n'est pas un renoncement — elle est
déjà écrite dans le projet, dans le prototype legacy lui-même (`renderWorld.js:316`) :

> « La ville (routes droites, bâtiments alignés) reste plate — sinon le relief peint lirait
> comme un papier peint sous des objets plats. »

**Le relief vit là où rien n'est posé, cliqué, ni parcouru** : la bande sauvage, la vallée du
fleuve, le bord du plateau. Cinq raisons, toutes structurelles :

1. **Le hit-test.** `screenToWorld` est aujourd'hui l'inverse EXACT de `worldToScreen`. Avec une
   altitude, un point écran correspond à plusieurs cellules — l'inverse devient un lancer de
   rayon. Tant que tout ce qui est survolable est à 0, l'inverse reste exact là où il compte.
2. **Le tri du peintre.** `isoUnitDepth` est déjà aveugle à la hauteur (constat P23 de
   `PLAN-SUPPRESSION-LEGACY.md`). Y ajouter une altitude variable sous les sprites rouvrirait
   ce dossier au pire endroit.
3. **Les agents.** Les voies piétonnes et les files de véhicules sont publiées en coordonnées
   monde plates (`CM.isoVehLane`, bandes de marche). Un sol qui monte sous eux exige de porter
   l'altitude dans toute la sim de déplacement.
4. **Le tissu.** Routes droites, emprises alignées, `builtCells`, `courField`, `frontierFlip` —
   tout le tissu urbain est un graphe plan.
5. **La sauvegarde.** Un champ de hauteur DÉRIVÉ (de `mapSeed` + du fleuve) ne touche pas la
   save. Un relief posé dans la ville deviendrait de la donnée à migrer — et ce projet a déjà
   perdu une save sur une migration (`migrations-tdz-perte-de-save`).

**Sens de défaillance, et il est bon :** le sol (relief compris) est BAKÉ, donc dessiné avant
tous les sprites. Une colline ne peut jamais passer *par-dessus* un sprite — au pire elle
*manque* de l'occulter. Le défaut résiduel est discret, jamais un bug franc.

---

## 4. Les lots

### Lot 0 — La mesure, avant tout pixel

Ce projet a déjà vu la mesure contredire l'œil quatre fois (`PLAN-RENDU-VILLE.md` §7 : 5
constats réfutés sur 39 ; le grief des « cadres » qui ne venait pas de la marche). Avant de
peindre quoi que ce soit :

- **Sonde de platitude** : écart-type de luminance à GRANDE ÉCHELLE (bloc de 64 px), par zone
  (ville / forêt / eau / lisière), sur une capture de référence. La conjecture à vérifier est
  que la forêt et le plateau sont sous 5 points d'écart-type quand la lisière en fait 40.
- **Trois captures de référence** figées maintenant (ère 1, ère 4, ère 7) pour l'avant/après.

⚠ **Sur l'eau, l'œil ment** (leçon `plaisirs-eloignement-aura`, `vagues-fleuve-ressac`) :
toute vérification touchant le fleuve se fait par **diff de canvas**, jamais au jugé.

**Coût : une demi-journée. Non négociable.**

---

### Lot 1 — ⭐ LE FLEUVE S'ENFONCE (l'entrée recommandée)

**Ce que ça fait.** La nappe d'eau descend à `−3 U`. La berge devient une vraie marche : le mur
de quai en est la face maçonnée (déjà dessinée, à raccorder), les berges naturelles en reçoivent
une face de terre/roche, la grève devient une **pente** de 2 sous-marches au lieu d'un anneau de
sable à plat, les îles reçoivent un rebord.

**Pourquoi en premier.** Trois raisons :
1. C'est le seul lot qui **corrige une incohérence existante** au lieu d'ajouter une couche.
2. C'est la marche que l'œil attend le plus fort : une rive sans dénivelé est le signal n°1 de
   « c'est un autocollant ».
3. C'est le lot le mieux **borné** : le fleuve est déjà un ruban tracé point par point.

**Comment.** Trois points d'entrée, pas plus :
- `riverRibbonScreen` (`isoRenderer.js:3585-3586`) — les deux `worldToScreen` du ruban prennent
  `WATER_Z`. Le lit, les vagues, les bateaux, les reflets suivent par construction.
- `islandOutline` (`:3620`) — idem pour le contour d'île.
- Le mur de quai (`renderWorld.js:783`) — `wallTiles` se dérive de `WATER_Z` au lieu d'être une
  constante par ère ; son test `waterBelow` par sample devient **redondant avec la géométrie**
  (la face regarde +x/+y ou elle est cachée) et peut être conservé comme garde-fou.
- **Neuf** : la face de berge NATURELLE, là où le quai ne trace rien (`quayGapRuns`) — même
  ruban, matière de terre, deux assises comme le mur.

**⚠ Le pont.** Le tablier reste à 0 — ce qui devient enfin *juste* : aujourd'hui il est posé
sur l'eau. Mais le travail `buryClip` / `dryRuns` du 2026-08-22 (non commité) vit exactement à
ce joint : **le lot 1 doit être ouvert APRÈS que ce travail soit commité**, et son test
d'enterrement rejoué.

**Recette d'acceptation :**
- diff de canvas avant/après sur les 3 captures ;
- garde : la face de berge naturelle et le mur de quai ont **la même hauteur au sample de
  jonction** (test pur, sans canvas) ;
- garde : aucun pixel d'eau au-dessus de la ligne de berge sur la rive éloignée.

**Molette :** `__relief({ water: 0..3 })` — `0` rejoue l'état actuel.

**Coût : 2 à 3 jours.**

---

### Lot 2 — Les collines hors ville

**Ce que ça fait.** Un champ `H(gx, gy)` entier en unités `U` :
- `0` sur l'emprise de la ville et sur une bande de raccord lissée autour ;
- montée par bruit de valeur basse fréquence au-delà (les fréquences de `cmValueNoise` du
  prototype legacy sont déjà réglées : `HILL_BIG = 9`, `HILL_DETAIL = 3.3`) ;
- vallée creusée le long de `riverYAt`.

Le sol blitte à `worldToScreen(gx·T, gy·T, H·U)`. Toute cellule dont le voisin SUD ou EST est
plus bas dessine ses **faces visibles** — et seulement celles-là : en 3/4 on ne voit que les
faces tournées vers +x et +y (règle de la marche, § 1.3). Arbres, buissons, props lisent `H` à
leur pied.

**Coût de rastérisation, estimé.** Avec une marche tous les ~4 tuiles, ~1 cellule sauvage sur 4
porte des faces, à 2 quads chacune. Sur les ~100 cellules sauvages visibles à zoom 1 : **~50
`fill` de plus par recuisson**, contre les 140 à 960 ms que coûte déjà une recuisson pleine.
L'ordre de grandeur est négligeable — **à confirmer par mesure au dézoom**, où le nombre de
cellules explose.

**⚠ Les allégés.** `ISO_GROUND_LOD.on` (HARD) doit sauter les faces ; `light` peut les garder.
Sinon on paie le relief en plein geste, exactement là où le budget n'existe pas.

**Recette d'acceptation :**
- test pur : `H` est entier, `H = 0` partout sur `urbanSet ∪ roadSet ∪ buildFoot` ;
- test pur : la table des faces visibles ne rend jamais une face −x ou −y ;
- test pur : à `z = k/8`, le décalage écran de toute cellule est un entier (§ 2.1) ;
- mesure : temps de recuisson pleine avant/après, à zoom 1 / 0,5 / 0,35.

**Molette :** `__relief({ hills: 0..6, seed })`.

**Coût : 4 à 6 jours** (le champ est facile, les faces et le raccord à la lisière ne le sont pas).

---

### Lot 3 — L'ombrage à grande échelle

**Ce que ça fait.** Le hillshade du prototype legacy (`cityMapDrawTerrain`), porté en iso —
mais calculé depuis **le même `H` que le lot 2** et cuit **DANS le bake du sol**, pas blitté en
`soft-light` plein écran à chaque frame.

**Pourquoi pas seul, et pourquoi pas en overlay.** Deux raisons dures :
1. Sans le lot 2, c'est du papier peint sous des objets plats — le prototype legacy le dit
   lui-même en commentaire, et c'est pour ça qu'il s'interdisait la ville.
2. `PLAN-RENDU-VILLE.md` a établi que **le budget de contraste est déjà dépensé au mauvais
   endroit** (toit contre pavé : 7,5 points d'écart, quand la chaussée en a 29). Un voile
   plein écran ajouterait du brouillard sans ajouter de structure — il aggraverait la maladie
   n°1 pour soigner la n°3.

**⚠ Lumière HAUT-GAUCHE, ombres BAS-DROITE** (`map-lighting-shadow-direction`). Le prototype
legacy calcule `shade = dHdx + dHdy`, ce qui est cohérent ; à re-vérifier après portage iso, où
les axes monde ne sont plus les axes écran.

**Molette :** `__relief({ shade: 0..1 })`.

**Coût : 2 jours** après le lot 2. **Ne pas ouvrir avant.**

---

### Lot 4 — Le volume de la masse végétale (indépendant, et rentable)

**Ce que ça fait.** 40 % de l'image est une forêt d'un seul ton. Sans toucher à la géométrie :
un multiplicateur de valeur par arbre, tiré du même bruit basse fréquence que les fourrés
(`cmCellNoise`, déjà partagé entre forêt sauvage et arbres de ville), plus une occlusion douce
au cœur des fourrés denses.

**Pourquoi c'est le meilleur rapport effort/effet.** Aucune projection, aucun bake, aucun tri,
aucun hit-test. C'est un ton par sprite. Et c'est la plus grande surface plate de l'image.

**⚠ Ne pas se tromper d'échelle.** Le bruit doit être à l'échelle du **massif** (10-20 tuiles),
pas de l'arbre : un bruit fin rendrait des confettis, exactement le défaut que `cmCellNoise` a
été introduit pour corriger sur la dispersion.

**Recette :** sonde du lot 0 sur la zone forêt — l'écart-type de luminance à grande échelle doit
monter de façon mesurable, sans que l'écart-type LOCAL (grain) bouge.

**Molette :** `__canopy({ amp })`.

**Coût : 1 à 2 jours. Peut être fait en parallèle, ou en premier si on veut un effet visible
tout de suite.**

---

### Lot 5 — ÉCARTÉ : le relief DANS la ville

Terrasses, escaliers entre îlots, bâtiments à cheval sur deux niveaux. **Recommandation :
ne pas ouvrir.** Casse les cinq points du § 3 d'un coup (hit-test, peintre, agents, tissu, save)
et contredit une règle que Raph a lui-même posée. Le seul dénivelé urbain acceptable est le
**bord du plateau** à la limite de la ville, que le lot 2 rend gratuitement.

Si l'envie revient : rouvrir ce § avec les chiffres du lot 2 en main, pas avant.

---

## 5. Les pièges connus d'avance

| Piège | Pourquoi il mordra | Parade |
|---|---|---|
| **Invalidation du bake** | Ce projet s'est fait avoir **trois fois** (plage gelée, bas-fond de quai, saison). Le relief entre dans le sol baké ET dans le cache de crans. | `':rl' + version + amplitude` dans `key` ET dans `cacheBase` (`isoRenderer.js:10578-10592`). |
| **Culling** | `visibleCellBounds` / `visibleDiamondBounds` calculent sur un plan. Une cellule levée de 72 px dont la base est sous le bord bas reste visible. | `marginDownPx += Hmax · U · z`. |
| **Quantification du zoom** | Une marche non multiple de `T/4` rouvre la couture inter-losanges. | § 2.1, avec un test propriété. |
| **Tri du peintre** | `isoUnitDepth` est aveugle à la hauteur (P23). | Ville à 0 (§ 3). Sens de défaillance sûr : le sol est baké avant les sprites. |
| **HMR** | Toucher `layout`/`renderer` sous Vite donne un double graphe. | **Hard reload** systématique (`iso-migration-plan`). |
| **Capture de l'eau** | L'œil ment sur l'eau (3 refus historiques). | **Diff de canvas**, jamais le jugé. |
| **Numéros de ligne** | `isoRenderer.js` a pris +49 % en 24 jours. | Se ré-ancrer par **nom de symbole**, jamais par ligne (leçon `suppression-legacy-carte`). |

---

## 6. Ce qu'on ne refait pas

- **Le voile `soft-light` plein écran seul** — c'est le prototype legacy, il est du papier peint
  sans géométrie sous lui, et il dépense du contraste là où `PLAN-RENDU-VILLE` dit de ne pas.
- **Réécrire la carte** — refusé, preuves à l'appui (`suppression-legacy-carte`).
- **Une fraction de grille comme unité** — le § 2.1 tranche : `T/4`, entier, point.
- **Toucher au bois du pont de Raph** sans son accord (`pont-sprite-stade0`).

---

## 7. Ordre proposé et budget

| # | Lot | Coût | Effet visible | Dépend de |
|---|---|---|---|---|
| 0 | La mesure | 0,5 j | — | — |
| 4 | Volume de la végétation | 1-2 j | **fort**, immédiat | — |
| 1 | ⭐ Le fleuve s'enfonce | 2-3 j | **fort** | pont commité |
| 2 | Collines hors ville | 4-6 j | fort | lot 1 |
| 3 | Ombrage à grande échelle | 2 j | moyen | lot 2 |
| 5 | Relief dans la ville | — | — | **écarté** |

**Total 1+2+3+4 : ~10 à 14 jours**, chaque lot livrable et réversible seul derrière sa molette.

**Deux entrées possibles selon ce qu'on veut d'abord :**
- **Voir quelque chose vite** → lot 4 (la forêt), puis lot 1.
- **Attaquer la vraie cause** → lot 0 puis lot 1 (le fleuve), qui installe l'axe Z et l'unité
  `U` dont tout le reste dépend.

Dans les deux cas le **lot 0 se fait en premier** : sans sonde, on ne saura pas dire si un lot
a ajouté du relief ou seulement du brouillard.
