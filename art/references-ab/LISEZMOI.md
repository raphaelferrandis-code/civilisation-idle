# Références d'A/B tranchées — sources, plus livrées

Ces PNG étaient dans `public/` (donc dans le .exe et sur Steam) alors que le jeu ne les
affichait plus que par une molette de comparaison. Les A/B ont été tranchés par Raph
(audit du 05/10, MORT-12, MORT-13 et MORT-6) : le code qui les lisait est retiré, les
images restent ici comme source.

| Dossier | Ce que c'était | Remplacé par |
|---|---|---|
| `places-scene/` | La place centrale en UNE image par ère (`plaza-<ère>.png`) et l'eau animée de sa fontaine (`anim/plaza-fountain-<ère>.png`) — mode `__plaza({ mode: 'scene' })` | La place composée prop par prop (`iso/isoPlaza.js`) |
| `buissons-cainos/` | Buissons du pack Cainos (`bush-1..6`, été et hiver) — terre-pleins et île d'avant le kit de rue | Buissons dessinés par le code (`iso/streetKits.js`) |
| `terre-plein-parterres/` | Bacs de fleurs du terre-plein (`flowerbed-1..4`) | Plantations du kit de rue par ère |
| `reverberes-png/` | Réverbères PNG par ère (`lamp-antique/gas/electric/energy`) | Réverbères du kit de rue, dessinés par le code |
| `eau-planches/` | Bandes d'eau calmes de 16 px (azur, ciel, hiver, trouble, turquoise, ardoise) et la nappe turquoise de 64 px | Les nappes « -v2 » de 64 px de `public/pixelart/water/` |
| `bateaux-sprites/` | Les coques PixelLab en 8 rotations (`boat-<stade>-<secteur>`, 9 stades : radeau, voile, vapeur, porte-conteneurs, pêcheur au mouillage et en route, plaisance) — A/B `__boatKit({ on: false })`, avec le calibreur de feux `navCalib` | Les bateaux dessinés par le code (`iso/boatKit.js`, `iso/boatKits*.js`) |
| `pontons-sprites/` | Le ponton du port en objet 8 directions (`pontoon-bois-ne/nw`, `pontoon-pierre-se/sw`) — A/B `__pier(false)` | Le ponton au pixel (`iso/isoPier.js`) |

⚠ `public/pixelart/agents/boats/` n'est PAS une référence d'A/B : la scène moteur du
port non riverain lit ces sprites (`cityEngineSprites.ensurePortBoat`).

Les scripts qui produisent ces fichiers (`fetchFountainAnims`, `sliceFlowerBeds`,
`contourBuissons`, `calmWaterTiles`, `eauCalme`, `eauSansEcailles`, `eauTrouble`) lisent
et écrivent ici, comme les planches de contrôle des bateaux (`boatSheet`, `boatFaces`).
Les tests de palette de l'eau (`waterCalmTile`, `waterSansEcailles`,
`eauTrouble`) y lisent leurs témoins.
