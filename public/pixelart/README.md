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

## Fiche DA — bâtiments-moteur (sprites PixelLab faits main)

**Parti pris (verrouillé) : MINIMALISTE.** De **petits volumes 3/4** simples (façon
*Kingdom Two Crowns*) — un toit + une face ombrée, palette ultra-réduite — pensés pour
**peupler la map en grand nombre** : lisibles tout petits, légers, répétables. PAS des
bâtiments « héros » détaillés. La règle d'or : **cohérence absolue** sur toute la série
(vue + lumière + palette + outline), sinon la ville devient un patchwork.

### Réglages PixelLab
| Champ | Valeur | Pourquoi |
|---|---|---|
| **Direction** | South-East (figé) | Sur un bâtiment statique, ne fixe que la **lumière**. Identique partout (et harmonisé avec les agents). |
| **View** | oblique **3/4 léger** (petits volumes, pas top-down plat) | On devine une face + un toit → silhouette reconnaissable, dans l'esprit des agents 3/4. |
| **Detail** | **Low** | Le minimalisme vient de là : peu de pixels, peu de teintes, formes franches. |
| **Outline** | **None ou thin** (jamais Black dur) | L'outline noir = look cartoon ; sans / fin colle au minimalisme et au sombre/or antique. |
| **Taille** | **48×48** (32–48 ; 64 max) | Petites unités denses. Dessiné nearest-neighbor au footprint → garder petit pour rester net et « tuile ». |
| **Fond** | **transparent** (obligatoire) | Composité par-dessus le terrain. |

### Palette / ambiance
- **Minimaliste** : 2-3 teintes par matériau, pas de détail superflu (pas de fenêtres
  ciselées, pas de matériaux riches). La force = la **silhouette**.
- Registre **chaud antique** : argile, bois, pierre sombre, or éteint — cohérent avec le
  terrain et les routes par ère. Toit nord éclairé / face sud plus sombre (lumière douce).
- Pas d'objet flottant : le sprite = le **site statique**, le personnage qui marche
  reste un **agent animé séparé** (`agents.js`). L'anim diégétique (feu, roue, tissu)
  reste au procédural pour l'instant.

### Prompt PixelLab — suffixe DA (à coller à CHAQUE prompt, inchangé)
```
minimalist pixel art, tiny isometric 3/4 building, facing south-east, transparent background,
small simple volume with a clear roof and one shaded south face, very limited palette
(2-3 shades per material), warm ancient tones (clay, timber, dark stone, muted gold),
thin subtle outline, soft flat lighting (north roof lit / south face darker), strong readable
silhouette, low detail, cozy storybook city-builder feel, no characters, grounded static structure
```

### Amorces par bâtiment (à mettre AVANT le suffixe)
| buildingId | amorce |
|---|---|
| `foragers` | `a small primitive hut,` |
| `granaries_city` | `a small granary with a round roof,` |
| `caravans` | `a tiny tent and a cart,` |
| `markets` | `a small market stall with an awning,` |
| `guilds` | `a small workshop with a chimney,` |
| `mint_houses` | `a small stone house with a coin sign,` |
| `imperial_exchanges` | `a small columned hall,` |

**Gigantisme t0→t3** : on reste minimaliste — on ajoute **du nombre / un étage**, jamais du
détail. Suffixe par tier : t0 `small, single` · t1 `slightly bigger, one annex` · t2
`a small cluster, an upper level` · t3 `a small compound, banners`.

### Nommage & emplacement (sinon ça ne se branche pas)
- Fichier : `public/pixelart/buildings/<buildingId>-s<stage>-t<tier>.png`
- **buildingId** (ère 1, non-cosmique, `band < 7`) :
  `foragers · granaries_city · caravans · markets · guilds · mint_houses · imperial_exchanges`
- **stage** `s0..s3` = palier d'ère du moteur (`eraIndex` : <10→0, <20→1, <30→2, sinon 3).
- **tier** `t0..t3` = palier d'achat (`cmEngineTier`). t0→t3 = la **station qui grandit**.
- Ex. : `markets-s0-t1.png`, `foragers-s0-t3.png`.

### Après livraison (côté code — je m'en charge)
1. Étendre le `Set` **AVAILABLE** dans `src/game/map/pixelBuildings.js` (sinon sprite ignoré → repli procédural).
2. **F5** dans le jeu. Toggle dev : `window.__pixelBuildings(false)` pour comparer au procédural.
3. ⚠️ Éditer `renderWorld.js`/moteur ne se voit pas en HMR live → **full-reload** + `__CM.forceFrame()` avant `__cityShot` pour vérifier.

## Reste à faire

- Affiner à la main les couleurs/styles de sols (band0 un peu orange, band3 violet…) ;
  distinguer band2 (gravier) de band3 (pavé rustique) ; remonter le contraste de band4/band6.
- **Rues** : les 10 `streets-band{N}.png` (surfaces PixelLab par ère) sont des **bases** —
  à retravailler à la main (marquages : passages/lignes ; raccords ; relief). Restent à faire :
  hiérarchie de largeur (avenues multi-cellules côté moteur) et tuiles de **pont** pixel pour
  reprendre les traversées du fleuve (aujourd'hui laissées au procédural).
- Plus tard : agents pixel-art (habitants/véhicules), puis bâtiments. Cf. l'audit de migration.
