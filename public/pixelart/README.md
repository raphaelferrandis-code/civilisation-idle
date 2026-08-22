# Terrain pixel-art — mode d'emploi

> **⚠ Mise à jour du 2026-08-23 — le rendu top-down a été retiré.** Deux sections de ce
> document décrivaient des couches qui n'existent plus et ont été supprimées : la
> **frange d'herbe** (`roads/<band>.edge.png`) et la **couche rues edge-Wang par ère**
> (`streets-band{0..9}.png`). Leurs assets sont partis avec elles, ainsi que `grass.png`,
> `medians/`, `trees/`, `plazas/anim/` et les props `lamppost-*` / `paving-*`.
> Détail et raisons : `docs/PLAN-SUPPRESSION-LEGACY.md`.
>
> Ce qui reste vivant ici : le **rangement des sprites**, la **fiche DA des
> bâtiments-moteur**, et la **palette maître**.

Ce document décrivait à l'origine un prototype de terrain en 4 couches (herbe, sol urbain,
frange, rues edge-Wang), monté derrière un flag. **Ce terrain-là n'existe plus** : le sol de
la carte est peint par le rendu isométrique. Ce qui subsiste ici est la matière d'ÂGE des
routes (`roads/band*`), encore lue par `drawEraGroundFill` pour les champs et les scènes.

## Rangement des sprites `agents/` (par catégorie)

Les sprites (habitants ET bâtiments) sont rangés en **sous-dossiers** de `public/pixelart/agents/` — plus de fourre-tout à plat :

| Dossier | Contenu | Chargé par |
|---|---|---|
| `inhabitants/` | habitants par ère (`caveman`→`future`, + femmes/enfants), `farmer`, porteurs (`basket-*`) | `agents.js` (`ensureAgentChar`), `cityEngineSprites.js` (farmer) |
| `animals/` | bêtes de trait : `ox`, `horse` | `agents.js` (`ensureAgentChar`) |
| `vehicles/` | véhicules : `veh-*` (cart, wagon, chariot, caravan, car, tram, barrow) | `agents.js` (`ensureVeh`) |
| `boats/` | bateaux par ère : `boat-*` (raft, sail, steam, container, cosmic-7/8/9) | `agents.js` / `cityEngineSprites.js` |
| `events/` | agents de crise : émeutiers **par ère** `rioter-‹ère›-‹genre›-‹arme›` (ère ∈ {`stone`,``médiéval=sans préfixe``,`anti`,`ind`,`fut`} ; genre ∈ {man,woman} ; arme ∈ {torch,fork}) — sélection via `riotEraKey(band)` dans `agents.js`, repli sur le jeu médiéval non préfixé | `agents.js` (`drawNamedAgent`+`riotEraKey`) ; la SIMULATION d'émeute reste dans `renderWorld.js` (`updateCrisis`), le dessin est passé à l'iso |
| `buildings/` | props + scènes des **bâtiments-moteur** + acteurs de scène (`forager-*` clips, `caravan-mule-rest` = mulet couché qui lève la tête, `*-prop-*`, `*-fire`, `*-back`) | `cityEngineSprites.js` (`PROP_KEYS`, `ANIM_BANDS`, forager, mule), `engineSprites.js` |
| `plazas/` | ⚠ **kit RÉDUIT le 2026-08-23** : ne restent que `bench`, `bush`, `fountain`, `flag` et `planter` — les seuls que le repli iso sonde (`LEGACY_PROP`, isoPlaza.js). `lamppost-*`, `paving-*` et `plazas/anim/` sont partis avec le rendu top-down. Description d'origine : **places** en 5 grappes d'ère (`antique·classique·industrielle·moderne·futuriste`) : props `lamppost·fountain·flag·planter·bush` en `‹prop›-‹ère›.png` ; le banc en 4 variantes directionnelles `bench-‹n\|s\|e\|w›-‹ère›.png` (tourné vers le centre) ; et la **dalle de sol** en 4 variantes tuilées `paving-‹0..3›-‹ère›.png` (32×32, `create_tiles_pro` square_topdown, tirées par cellule). **`plazas/anim/`** = strips d'animation bakés (`fountain-‹ère›.png`, 8 frames côte à côte, eau animée via `create_1_direction_object`+`animate_object`) | `plazaProps.js` (registre + `plazaEraForBand`, `variant`, `plazaPropImage`, `plazaAnimReady`/`blitPlazaAnim`), appelé par `cityMapDrawPlazaSurface`/`cityMapDrawPlazas` de `renderWorld.js` |

Le routage est **codé** : `agentDir(name)` dans `agents.js` (nom→dossier : ox/horse→`animals`, rioter→`events`, sinon `inhabitants`) ; chaque chargeur pointe sur son sous-dossier. Les scripts `fetch*` écrivent dans le bon sous-dossier (`OUT`). Remap en lot (scan **récursif**) : `node scripts/remapPalette.mjs --dir public/pixelart/agents`.
⚠️ `scripts/contactSheet.mjs` lit `agents/` **à plat** → à passer en récursif si réutilisé.

## Fichiers à retravailler (à la main, dans Aseprite / Piskel / GIMP…)

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

- **`src/game/map/pixelTerrain.js`** — réduit depuis le 2026-08-23 à `drawEraGroundFill` et
  son tileset : il ne dessine plus le terrain, il fournit la MATIÈRE D'ÂGE des champs et des
  scènes (`ROAD_STAGES` choisit la planche selon la bande d'ère). Le sol de la carte est peint
  par `iso/isoRenderer.js`.
- **`src/game/map/cityMapRuntime.js`** — la boucle de frame, la caméra et les entrées. Le dessin
  lui-même est délégué en entier à `iso/isoRenderer.js`.

## Vérif visuelle (dev)

Serveur dev lancé, dans la console de la page : `await window.__cityShot({name:'x'})` → écrit
`.preview-shots/x.png`. Monter une ville de démo : `window.__state` + `window.__D` +
`window.__cityRecompute()` (cf. hooks DEV dans cityMapRuntime.js).

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
- Registre **chaud antique** : argile, terre cuite, cuivre, bois, pierre sombre — cohérent avec le
  terrain et les routes par ère. Toit nord éclairé / face sud plus sombre (lumière douce).
- Pas d'objet flottant : le sprite = le **site statique**, le personnage qui marche
  reste un **agent animé séparé** (`agents.js`). L'anim diégétique (feu, roue, tissu)
  reste au procédural pour l'instant.

### Prompt PixelLab — suffixe DA (à coller à CHAQUE prompt, inchangé)
```
minimalist pixel art, tiny isometric 3/4 building, facing south-east, transparent background,
small simple volume with a clear roof and one shaded south face, very limited palette
(2-3 shades per material), warm ancient tones (clay, terracotta, copper, timber, dark stone),
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

## Palette maître — anti-bloat couleurs

**Problème** : les sprites PixelLab arrivent avec un **bloat** de teintes (mesuré : `market-prop-stall`
= 153 couleurs pour 2606 px ; moyenne ~37/sprite, ~2550 distinctes sur tout le set). Du bruit
anti-aliasé, pas du pixel-art propre. **Cible : 16-24 teintes par sprite**, toutes tirées d'**une
seule palette pour tout le jeu**.

### La palette (source de vérité)
- **`scripts/buildPalette.mjs`** génère tout. Lancer : `node scripts/buildPalette.mjs`.
- **`master-palette.json`** = la liste. Structure :
  - **`core`** (36 teintes) — rampes PARTAGÉES par tous les sprites : `inkShadow` · `timberClay` ·
    `earthStone` · `clayCopper` (terre cuite / cuivre — a remplacé l'ancien or/sable jaune) · `skin` · `foliage` · `water` · `metalSlate` ·
    `boneWhite` · `universal`. C'est le cœur qui garantit la cohésion.
  - **`epochs[]`** — un **accent** par époque (3 pas deep/mid/bright), **calculé depuis les ancres
    HSL de `src/game/data/eraThemes.js`** (donc sprite + chrome UI + sol de carte = même couleur).
    `usable` = cœur (36) + accent (3) = **39 teintes** par époque (≤ 48).
  - **`spriteEpochTags`** — tag **sprite → époque** (la cohérence intra-époque demandée).
- **`master-palette.gpl`** — palette GIMP/Aseprite/**Lospec** (et « Target Palette » côté PixelLab).
- **`palettes/epoch-<id>.png`** + `core.png` — les **`color_image`** (cf. génération). `_contact.png`
  = planche-contact visuelle de contrôle.

| band | époque | accent mid | band | époque | accent mid |
|---:|---|---|---:|---|---|
| 0 | feu | ember `#d37e45` | 5 | fonte | copper `#c77e60` |
| 1 | bois | terracotta `#c2653d` | 6 | neon | cyan `#4fcdd8` |
| 2 | pierre | clay `#c17057` | 7 | noosphere | jade `#31d892` |
| 3 | couronne | purple `#b695bb` | 8 | stellaire | gold `#eab63e` |
| 4 | marbre | lapis `#719cd6` | 9 | demiurge | iris `#c9afd4` |

### Forcer la palette à la GÉNÉRATION (biais)
L'API REST `create-image-pixflux` / `create-image-bitforge` accepte un champ **`color_image`**
(`Base64Image`, *« Forced color palette, image containing colors used for palette »*) → lui passer
`palettes/epoch-<id>.png`. ⚠️ C'est un **biais, pas un verrou**, et **le MCP `create_map_object`
n'expose PAS ce champ** (il faut taper l'API REST directement). Donc on ne s'y fie pas seul.

### Verrouiller la palette en POST (fiable)
- **`scripts/remapPalette.mjs`** — rabat chaque pixel sur la palette utilisable de l'époque du
  sprite (plus proche voisin perceptuel « redmean »), puis **plafonne à K teintes** (défaut 22),
  tue le halo AA, et préserve l'alpha. C'est le **verrou dur** (Python/Aseprite absents → node+pngjs).
  - Un fichier : `node scripts/remapPalette.mjs <f.png> [--epoch feu] [--max 22] [--inplace]`
  - Lot (époque auto par tag) : `node scripts/remapPalette.mjs --dir public/pixelart/agents`
  - `--dry` = rapport seul. Sans `--inplace` → écrit `<nom>.remap.png` à côté.
- Validé : `market-prop-stall` 153→22, `granary-prop-silo` 120→14, `field-prop-crop-gold` 100→11 —
  silhouettes intactes, moyenne **107→17** sur les pires sprites.

### Pipeline recommandé (à chaque nouveau sprite)
1. Générer (idéalement via REST + `color_image = palettes/epoch-<id>.png`) ; sinon MCP comme avant.
2. **`node scripts/remapPalette.mjs <fichier> --epoch <id> --inplace`** → 16-24 teintes garanties.
3. Tagger le sprite dans `spriteEpochTags` (buildPalette.mjs) pour que le lot auto le retrouve.

## Reste à faire

- Affiner à la main les couleurs/styles de sols (band0 un peu orange, band3 violet…) ;
  distinguer band2 (gravier) de band3 (pavé rustique) ; remonter le contraste de band4/band6.
- **Rues** : les 10 `streets-band{N}.png` (surfaces PixelLab par ère) sont des **bases** —
  à retravailler à la main (marquages : passages/lignes ; raccords ; relief). Restent à faire :
  hiérarchie de largeur (avenues multi-cellules côté moteur) et tuiles de **pont** pixel pour
  reprendre les traversées du fleuve (aujourd'hui laissées au procédural).
- Plus tard : agents pixel-art (habitants/véhicules), puis bâtiments. Cf. l'audit de migration.
