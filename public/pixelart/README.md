# Terrain pixel-art — mode d'emploi

Prototype de terrain pixel-art de la carte (derrière un flag). Rendu en **4 couches** :
1. **herbe** unique (nature) ; 2. **sol urbain** par bande d'ère (zone bâtie) posé par-dessus ;
3. **frange d'herbe** (bord herbe→sol : liseré, ombre directionnelle, touffes) auto-générée ;
4. **rues** (réseau viaire en tuiles edge-Wang) posées par-dessus le sol urbain.

## Fichiers à retravailler (à la main, dans Aseprite / Piskel / GIMP…)

- **`grass.png`** — l'HERBE (1 tuile 32×32). Tu l'édites **une seule fois**, ça s'applique partout.
- **`roads/bandX-<ère>.png`** — la ROUTE de chaque bande, sur **fond transparent** (tu ne vois/édites que la route). 10 fichiers, retravaillables **indépendamment** :

| Bande | Fichier | Style actuel |
|------:|---------|--------------|
| 0 | `roads/band0-feu.png`         | terre battue |
| 1 | `roads/band1-bois.png`        | terre + planches |
| 2 | `roads/band2-pierre.png`      | gravier |
| 3 | `roads/band3-couronne.png`    | pavé rustique |
| 4 | `roads/band4-marbre.png`      | dalles claires |
| 5 | `roads/band5-fonte.png`       | pavé industriel |
| 6 | `roads/band6-singularite.png` | béton |
| 7 | `roads/band7-noosphere.png`   | pierre blanche lumineuse |
| 8 | `roads/band8-stellaire.png`   | métal bleu |
| 9 | `roads/band9-demiurge.png`    | or à runes |

Chaque PNG de route est une **tuile Wang 4×4 (16 tuiles, corner-based)** : ne déplace pas
les tuiles dans la grille (le mapping est dans le `.json` voisin), repeins **à l'intérieur**.
Après édition : **F5** dans le jeu → le moteur recompose les 2 couches.

## Comment c'est branché (code)

- **`src/game/map/pixelTerrain.js`** — le moteur : charge `grass.png` + les overlays de route,
  choisit la route selon la bande d'ère (`ROAD_STAGES`), dessine les 2 couches (auto-tiling Wang).
  Flag **`pixelTerrainFlag.on`** (ON par défaut en dev). Override dev : `window.__pixelTileset('roads/band3-couronne')`, retour par ère : `window.__pixelTileset()`.
- **`src/game/map/cityMapRuntime.js`** — câblage : quand le flag est ON, le sol + les routes
  procéduraux sont sautés au profit de la couche pixel.

## Vérif visuelle (dev)

Serveur dev lancé, dans la console de la page : `await window.__cityShot({name:'x'})` → écrit
`.preview-shots/x.png`. Monter une ville de démo : `window.__state` + `window.__D` +
`window.__cityRecompute()` (cf. hooks DEV dans cityMapRuntime.js).

## Couche de bord (frange d'herbe)

- **`roads/<band>.edge.png`** — overlay généré **automatiquement** (ne pas éditer à la main) :
  frange d'herbe le long du contour herbe→sol (ligne d'herbe foncée + liseré de contact côté
  sol + touffes qui débordent). Même grille Wang que le sol (réutilise le `.json` voisin).
- Généré par **`scripts/makeGrassEdge.mjs`** (`node scripts/makeGrassEdge.mjs`) à partir de
  l'**alpha** de chaque `roads/<band>.png` → toujours aligné. **Re-lance le script** après avoir
  repeint la silhouette d'un sol. Réglages (largeur d'ombre, densité/longueur des touffes) en
  tête du script. Toggle **`bord`** dans `compare.html` pour comparer avec/sans.

## Couche rues (réseau viaire, edge-Wang) — PAR ÈRE

- **`streets-band{0..9}.png`** — tilesets des RUES : **16 tuiles 32×32** (planche 4×4),
  **edge-Wang** (≠ le sol qui est corner-Wang). La tuile est choisie par les 4 voisins ORTHO
  qui sont aussi des rues : **bitmask N=1, E=2, S=4, W=8**, position `col = m&3, row = m>>2`.
  ⇒ droites / virages / T / croix / impasses. Source des cellules : `layout.roadSet` ; les
  **ponts** (`roadSurface==='bridge'`) restent au rendu procédural. `streets.png` = placeholder
  de repli (tant qu'une ère n'est pas générée).
- **Surface PixelLab + géométrie edge-Wang** (pipeline en 2 temps) :
  1. `node scripts/fetchStreetSurfaces.mjs` — télécharge les 10 tilesets PixelLab (IDs en
     tête du script) et extrait la **tuile pleine** (surface de route sans couture) →
     `_streets_src/band{N}.png`.
  2. `node scripts/makeStreetTiles.mjs` — pose la surface de l'ère sur des tuiles **pleine
     largeur (1 tuile)** + effet « route en creux » (liseré sombre + lèvre claire) sur les
     **bords ouverts** seulement (bords connectés = continuité) → `streets-band{N}.png`. Ce sont
     des **BASES à retravailler à la main**. Réglages (`EDGE`, `LIP`, `BASE`, `AO_*`) en tête du script.
  Pour régénérer une ère : nouveau tileset PixelLab → mets son ID dans `fetchStreetSurfaces.mjs`
  → relance les 2 scripts.
- Flag **`pixelRoadsFlag.on`** (dans `pixelTerrain.js`) ; quand il est ON, les routes
  procédurales (voies doubles) sont sautées au profit des tuiles. Le moteur charge
  `streets-band{ère}.png` (repli `streets.png`). Toggle dev : `window.__pixelRoads(true|false)` ;
  toggle **`rues`** dans `compare.html`.
- ⚠️ **Largeur uniforme** : une tuile = une cellule, donc les rangs de largeur du procédural
  (`roadWidthFor` : avenue/rue/sentier) ne se transposent pas. Hiérarchie de largeur = élargir
  les avenues en **multi-cellules** côté moteur (à faire).

## Régénérer / re-séparer (outil agent)

`scripts/separatePixelTerrain.mjs` régénère `grass.png` + les overlays à partir des tilesets
**couplés** (herbe+route) source dans `_archive/coupled/` (non versionné — re-téléchargeables
depuis PixelLab par leur id). Méthode : il rend le vert (« dominance du vert ») **transparent**.

## Reste à faire

- Affiner à la main les couleurs/styles de sols (band0 un peu orange, band3 violet…) ;
  distinguer band2 (gravier) de band3 (pavé rustique) ; remonter le contraste de band4/band6.
- **Rues** : les 10 `streets-band{N}.png` (surfaces PixelLab par ère) sont des **bases** —
  à retravailler à la main (marquages : passages/lignes ; raccords ; relief). Restent à faire :
  hiérarchie de largeur (avenues multi-cellules côté moteur) et tuiles de **pont** pixel pour
  reprendre les traversées du fleuve (aujourd'hui laissées au procédural).
- Plus tard : agents pixel-art (habitants/véhicules), puis bâtiments. Cf. l'audit de migration.
