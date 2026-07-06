# Habitations pixel-art (logements NON achetables de la carte)

Les 12 **logements** décoratifs générés sur la carte de la ville (tile `type:"house"`).
Ce ne sont **pas** des bâtiments achetables : ils apparaissent tout seuls selon la
population, l'ère et la personnalité de la cité. Source de vérité des variantes :
`VARIANTS_HOUSE` dans `src/game/map/procedural/buildingGenerator.js` ; libellés FR dans
`cityMapVariantLabel()` (`src/game/map/cityMapRuntime.js`) ; hauteurs relatives dans
`BUILDING_HEIGHTS` (`src/game/map/buildingShapes.js`).

## Direction artistique

**Même DA verrouillée que les bâtiments-moteur** (cf. `../README.md` §« Fiche DA ») :
minimaliste, petit volume iso **3/4** (`create_map_object`, view `low top-down`), fond
transparent, palette réduite (2-3 teintes/matériau), outline fin, lumière douce
**haut-gauche → ombre bas-droite** (toit éclairé / face sud sombre), pas de personnage,
pas d'ombre de contact. Seuls les **matériaux** dérivent par ère : terre cuite / chaume /
bois (tôt) → pierre / brique / ardoise (milieu) → béton / verre / acier / cyan (late game).

**Taille** : le canvas monte avec `BUILDING_HEIGHTS` — les mega-complexes de late game
« suivent le nom » (silhouette massive/monumentale, pas plus de détail).

## Les 12 sprites

| Fichier | id variante | Libellé FR | Ère (band / époque) | Canvas | Contenu réel |
|---|---|---|---|---|---|
| `tent.png` | tent | Tente | 0 · Feu | 40×40 | 38×34 |
| `hut.png` | hut | Cabane | 0–1 · Feu/Bois | 44×44 | 34×35 |
| `longhouse.png` | longhouse | Longue maison | 1 · Bois | 64×44 | 48×38 |
| `courtyard.png` | courtyard | Maison à cour | 2 · Pierre | 64×52 | 57×40 |
| `townhouse.png` | townhouse | Maison de ville | 2 · Pierre | 48×60 | 42×56 |
| `stonehouse.png` | stonehouse | Maison de pierre | 3 · Couronne | 48×60 | 43×50 |
| `manor.png` | manor | Manoir | 2–4 (cités riches) | 72×64 | 63×60 |
| `block.png` | block | Bloc résidentiel | 4 · Marbre | 64×84 | 58×76 |
| `tenement.png` | tenement | Immeuble populaire | 4–6 | 56×100 | 49×94 |
| `tower.png` | tower | Tour d'habitation | 5–6 · Fonte/Néon | 56×120 | 52×115 |
| `megablock.png` | megablock | Grand ensemble | 6 · Néon | 104×100 | 91×97 |
| `arcologyhome.png` | arcologyhome | Logement d'arcologie | 6+ · Néon/cosmique | 112×128 | 95×116 |

## Statut & étapes suivantes

- **État** : 1ers jets **bruts** PixelLab (non retouchés, **palette non verrouillée**).
- **Câblage jeu** : ✅ BRANCHÉ. `src/game/map/pixelHouses.js` (miroir de `pixelBuildings.js`)
  charge `houses/<variant>.png`, mesure la bbox du contenu, et dessine le sprite **ancré
  par la base** (monte au-dessus de la tuile, échelle commune `HOUSE_UNIT`=42 px/tuile).
  Appelé par `renderBuildings.js` (`drawTile`) avec repli procédural (`drawHouseShape`) si
  sprite absent/pas chargé. `cityMapRuntime.js` trie `L.tiles` par `gy` (painter's) pour le
  chevauchement des hauts. Flag `pixelHousesFlag.on` ; toggle dev `window.__pixelHouses(false)`.
- **Palette** (optionnel, cf `../README.md`) :
  `node scripts/remapPalette.mjs public/pixelart/houses/<f>.png --epoch <feu|bois|pierre|couronne|marbre|fonte|neon> --inplace`
  → rabat sur la palette maître (16-24 teintes).
