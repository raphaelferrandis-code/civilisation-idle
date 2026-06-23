# Terrain pixel-art — mode d'emploi

Prototype de terrain pixel-art de la carte (derrière un flag). Rendu en **2 couches** :
une **herbe** unique + une **route** par bande d'ère, posée par-dessus.

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

## Régénérer / re-séparer (outil agent)

`scripts/separatePixelTerrain.mjs` régénère `grass.png` + les overlays à partir des tilesets
**couplés** (herbe+route) source dans `_archive/coupled/` (non versionné — re-téléchargeables
depuis PixelLab par leur id). Méthode : il rend le vert (« dominance du vert ») **transparent**.

## Reste à faire

- Affiner à la main les couleurs/styles de routes (band0 un peu orange, band3 violet…).
- Plus tard : agents pixel-art (habitants/véhicules), puis bâtiments. Cf. l'audit de migration.
