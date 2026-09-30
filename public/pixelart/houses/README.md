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

## Les 16 sprites

| Fichier | id variante | Libellé FR | Ère (band / époque) | Canvas | Contenu réel |
|---|---|---|---|---|---|
| `tent.png` | tent | Tente | 0 · Feu | 40×40 | 38×34 |
| `hut.png` | hut | Cabane | 0–1 · Feu/Bois | 44×44 | 34×35 |
| `longhouse.png` | longhouse | Longue maison | 1 · Bois | 64×44 | 48×38 |
| `courtyard.png` | courtyard | Maison à cour | 2 · Pierre | 64×52 | 57×40 |
| `townhouse.png` | townhouse | Maison de ville | 2 · Pierre | 48×60 | 42×56 |
| `crafthouse.png` | crafthouse | Logis d'artisan | 2–3 · Pierre/Couronne | 60×60 | 49×48 |
| `towerhouse.png` | towerhouse | Maison-tour | 2–3 · Pierre/Couronne | 52×80 | 39×76 |
| `stonehouse.png` | stonehouse | Maison de pierre | 3 · Couronne | 48×60 | 43×50 |
| `manor.png` | manor | Manoir | 2–4 (cités riches) | 72×64 | 63×60 |
| `insula.png` | insula | Immeuble de rapport | 4 · Marbre | 64×76 | 48×68 |
| `block.png` | block | Bloc résidentiel | 4 · Marbre | 64×84 | 58×76 |
| `terrace.png` | terrace | Rangée ouvrière | 5–6 · Fonte/Néon | 88×56 | 54×42 |
| `tenement.png` | tenement | Immeuble populaire | 4–6 | 56×100 | 49×94 |
| `tower.png` | tower | Tour d'habitation | 5–6 · Fonte/Néon | 56×120 | 52×115 |
| `megablock.png` | megablock | Grand ensemble | 6 · Néon | 104×100 | 91×97 |
| `arcologyhome.png` | arcologyhome | Logement d'arcologie | 6+ · Néon/cosmique | 112×128 | 95×116 |
| `domus.png` | domus | Domus | 4 · Marbre | 64×64 | 52×39 |
| `taberna.png` | taberna | Taberna | 4 · Marbre | 64×64 | 56×64 |
| `villa.png` | villa | Villa (lot 2×2) | 4 · Marbre | 64×64 | 62×52 |
| `insula2.png` | insula2 | Immeuble de rapport (ocre) | 4 · Marbre | 76×76 | 42×66 |
| `haussmann.png` | haussmann | Immeuble haussmannien | 5 · Fonte | 80×80 | 44×73 |
| `gardentower.png` | gardentower | Tour-jardin | 7–9 · cosmique | 96×96 | 29×87 |
| `domehome.png` | domehome | Maison-dôme | 7–9 · cosmique | 64×64 | 57×51 |
| `podstack.png` | podstack | Grappe de capsules | 7–9 · cosmique | 80×80 | 42×75 |

### Les trois cosmiques de la nuit du 2026-10-01 — plus de brique entre les flèches

Les bandes 7 à 9 reprenaient la liste de la bande 6 : `block`, `terrace` et `tenement`
(brique, cheminées) sortaient entre les flèches de jade, d'or et de cristal. Une ligne
cosmique propre (VARIANTS_HOUSE[7]) ne garde que les archétypes à skin d'ère (tour, grand
ensemble, arcologie) et trois maisons dessinées en NACRE : `gardentower` (tour ronde à
terrasses plantées, éolienne), `domehome` (trois coupoles, bassin rond), `podstack`
(capsules empilées, portes teal / corail / jaune). Référence de style `arcologyhome.png`.
Plus BASSES que les tours : c'est la gamme de hauteurs qui manquait.
⚠ Sur le sol NACRE de ces ères (bible des surfaces, même nuit), leurs gris d'ombre
tombaient à 4 du sol (garde bâti/sol : dôme 12,5 % d'encre dissoute). Corrigés par
`scripts/ecartSol.mjs --darker` : chaque couleur trop proche du sol prend la plus proche
PLUS SOMBRE de la palette du sprite — l'ombre reste une ombre, le volume ne s'aplatit pas.

### L'haussmannien de la nuit du 2026-10-01 — la bande 5 perd sa tour de verre

La tour de verre (`tower`) sortait dès la bande 5 (Fonte, XIXe) : un gratte-ciel au
milieu des attelages et des immeubles de brique. Elle démarre désormais à la bande 6, et
`haussmann` prend sa place (calcaire crème, balcons de fer forgé aux 2e et 5e étages, toit
de zinc à lucarnes, boutique à auvent vert au rez). Même recette que les romaines (8 vues,
référence de style `block.png`, rotation south-west, ×0,5, quantize 24). Mesure : luminance
134 ; « mur gauche 120 / droit 135 » n'est PAS une lumière inversée — la façade gauche
porte les fenêtres et balcons sombres, le pignon droit est nu ; en couleur de mur, la
façade crème reste la plus claire. Pas de miroir.

### Les quatre romaines du 2026-10-01 — la bande 4 cesse d'être médiévale

`stonehouse` et `manor` (colombages, toits d'ardoise) sortaient à la bande 4 à côté
d'habitants en toge. Quatre maisons ROMAINES les remplacent (docs/PLAN-MAQUETTE-VIVANTE.md,
lot 3) : `domus` (plain-pied, atrium ouvert dans le toit, porche à colonnes), `taberna`
(boutique ouverte sous auvent rayé au rez), `villa` (portique, jardin clos et son bassin),
`insula2` (immeuble ocre à volets verts, frère de l'insula de brique).

Recette : `create_object_pro_flash`, 8 vues, 128×128 (152 pour l'insula), vue
`low top-down`, `insula.png` en référence de style passée par URL publique du dépôt ; on
garde la rotation **south-west** (façade sur la face gauche éclairée, comme toute la série)
écrasée ×0,5 (moyenne 2×2 prémultipliée), puis quantize à 24 teintes. Mesures avant
branchement : mur gauche plus clair que le droit sur les quatre (pas de miroir), luminance
93 à 117 (série : 87 à 121). ⚠ La garde de contraste au sol (isoBuildingGroundContrast)
a mordu : deux beiges de `insula2` et deux de `domus` tombaient à moins de 24 du dallage
de la bande 4 (177,172,150) — remplacés par la couleur la plus proche de LEUR palette
restée à plus de 26 du sol (dessin intact). Pas de socle à retirer cette fois.

### Les quatre de 2026-08-06 — ce qu'ils apportent

Ajoutés parce que les bandes 2 à 5 n'offraient que **deux ou trois** archétypes : aucune
règle de placement ne peut créer une variété qui n'existe pas. Chacun apporte une
SILHOUETTE que sa bande n'avait pas — c'est le critère du choix, pas le programme :

| | ce qui manquait à la bande |
|---|---|
| `crafthouse` | l'**auvent** et l'encorbellement — une masse qui déborde de son volume |
| `towerhouse` | la **verticale** : b2-b3 n'alignaient que des maisons basses |
| `insula` | la **hauteur d'habitation** de l'antiquité, sans immeuble XIXe anachronique |
| `terrace` | l'**horizontale** : b5-b6 n'empilaient que des tours |

⛔ **La dalle de sol.** Les quatre sont sortis de PixelLab posés sur un socle (sauf
`towerhouse`) : les négations sont ignorées, la clause de découpe de
`PLAN-EGALISATION-GRAIN §5` a échoué **9 générations sur 10**, et la régénérer coûte plus
qu'elle ne rapporte. Retrait en post par `scripts/stripGroundSlab.mjs` (composantes
détachées + propagation à couleur EXACTE depuis le pourtour du losange). Le paramètre qui
compte est `--edge` : 0,86 par défaut, 0,78 pour `crafthouse` dont l'ombre sous l'auvent
n'existait pas au bord du losange.

⚠ **`terrace` a été régénérée une seconde fois, sur MESURE et non au goût.** La première
version sortait à **65 de luminance moyenne, 59 % de son encre sous L60** — la plus sombre
de toute la série (block 102, tenement 74, courtyard 105) : en jeu elle faisait des taches
noires sur les sols clairs des bandes 5 et 6. Prompt repris en « warm light red brick /
PALE GREY slate » sans « soot », `basic shading` : **103 et 42 %**, dans la ligne de la
série. La luminance moyenne d'un sprite se compare à ses frères AVANT de le brancher.

⚠ **`terrace` et `crafthouse` sont MIROITÉS**, mesure à l'appui : leur mur gauche sortait
plus sombre que le droit (57 vs 146 et 80 vs 110), à l'envers de toute la carte. C'est le
miroir de RATTRAPAGE du horreum (`f576faf`), pas le miroir de VARIATION rejeté en
2026-07-22 — celui-là cassait une lumière déjà juste. On mesure d'abord, on ne retourne
que ce qui est à l'envers.

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
