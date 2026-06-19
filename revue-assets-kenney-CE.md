# Revue & curation des assets Kenney — refonte iso

> Inventaire complet de ce que le user a déposé dans `assets/` : **143 packs 2D** +
> **52 kits 3D** (~65 000 fichiers, tous **CC0**, attribution non requise).
> Ce document trie ce qui nous sert **maintenant** (2D, paliers T1–T3) et **plus tard**
> (3D, paliers T4+), avec les chemins exacts, pour s'y retrouver. Les bruts sont
> gitignorés (`assets/`) ; on ne versionne que les sprites/atlas dérivés + ce doc.

## Direction artistique retenue : low-poly Kenney cohérent

Découverte clé : les packs **2D « Isometric Miniature » / « Isometric Medieval Town »**
et **tous les kits 3D** (City, Space, Fantasy Town…) partagent **le même langage low-poly
doux** (les 2D iso de Kenney sont des rendus de modèles low-poly). Donc :

- **T1–T3 → 2D iso** (Miniature + Medieval Town + Nature), directement utilisable.
- **T4–T5 → kits 3D** (City, Factory, Space) **pré-rendus en sprites iso**, **même style**.

→ **Un seul langage visuel propre sur tous les âges** = exactement le plan « 2D au début,
3D à partir de T4 », sans rupture de DA. Échelle iso Kenney ≈ **128 px** (colle à notre
`TILE_W = 128`). Choix « éléments propres avec une vraie DA » : on privilégie le low-poly
Miniature/Medieval (plus caractériel) au set plat « Isometric Tiles Buildings ».

---

## POUR MAINTENANT — 2D, paliers T1–T3

| Pack | Contenu | Usage (tier / famille) | Chemin (`assets/2D assets/…`) |
|---|---|---|---|
| **Isometric Miniature Overworld** | herbe, arbres, rochers, chemins | **SOL + décor** (tous paliers) | `Isometric Miniature Overworld/` |
| **Isometric Medieval Town** | toits, murs, **arche**, fenêtres, escaliers, lampe, tente *(modulaire)* | **bâtiments T2/T3** ; arche → `aqueduct` | `Isometric Medieval Town/` |
| **Isometric Miniature Farm** | clôtures, **récoltes, foin, barriques, puits** | `farm`, `granary`, `civic`(puits) — T1/T2 | `Isometric Miniature Farm/` |
| **Isometric Miniature Library** | étagères, bureaux, bancs | `knowledge` (intérieur/symbolique) | `Isometric Miniature Library/` |
| **Isometric Nature** | arbres, rochers (PNG + spritesheet) | décor / végétation | `Isometric Nature/` |
| Isometric Watercraft | barques, bateaux | `port` / animation rivière | `Isometric Watercraft/` |
| Isometric Tower Defense | tours, bâtiments iso | `watchtower`, `observatory` | `Isometric Tower Defense/` |
| Isometric Miniature Dungeon / Bases / Prototype | donjon, socles de terrain, tuiles proto | terrain, soubassements | `Isometric Miniature …/` |
| Isometric Blocks | blocs iso modulaires | prototypage / volumes | `Isometric Blocks/` |
| *(alt)* Isometric Tiles Base / Buildings / City | set **plat coloré**, bâtiments complets génériques | repli « facile » si le modulaire coûte trop | `assets/Isometric Tiles …/` |

**Note :** ces packs 2D sont surtout **modulaires** (pièces à assembler : socle + murs + toit).
Plus de travail qu'un bâtiment tout-fait, mais bien plus propre et flexible.

---

## POUR PLUS TARD — 3D, paliers T4–T5 (pré-rendu iso requis)

| Kit 3D | Contenu | Usage | Chemin (`assets/3D assets/…`) |
|---|---|---|---|
| **City Kit - Commercial** | immeubles modernes **complets** + gratte-ciels | **T4 moderne/mégalopole** | `City Kit - Commercial/` |
| **City Kit - Industrial / Suburban / Roads** | usines, pavillons, routes | T4 (industriel, faubourgs) | `City Kit - …/` |
| **Factory Kit** | cheminées, halls, cuves | T4 industriel | `Factory Kit/` |
| **Space Kit** / **Space Station Kit** / **Modular Space Kit** | sci-fi modulaire, fusées, modules orbitaux | **T5 cosmique** | `Space Kit/`, `Space Station Kit/`, `Modular Space Kit/` |
| Fantasy Town Kit / Castle Kit | médiéval 3D complet | alt T2/T3 si on passe le médiéval en 3D | `Fantasy Town Kit/`, `Castle Kit/` |
| Nature Kit | arbres, rochers, terrain 3D | décor cohérent | `Nature Kit/` |
| Train / Car / Watercraft Kit | véhicules | vie/animation (Phase 9) | `Train Kit/`, `Car Kit/`, `Watercraft Pack/` |

> ⚠️ **Les kits 3D = modèles bruts** (`Models/` en .obj/.gltf + `Previews/` thumbnails).
> Pas de rendu iso pré-fait → il faudra un **pipeline de pré-rendu** (caméra iso fixe,
> export PNG par bâtiment) à monter quand on attaque T4. **Bon point :** ce sont des
> **bâtiments complets** (moins d'assemblage que le 2D modulaire).

---

## Trous connus & points de vigilance

- **T1 primitif** : aucun pack Kenney dédié. À approximer (huttes via Medieval Town/Farm
  bois + nature Overworld) ou en sur-mesure. C'est le mur récurrent du début de jeu.
- **2D = modulaire** (assemblage de pièces) ; **3D = pré-rendu à industrialiser** (T4).
- Cohérence : **assurée** tant qu'on reste dans le low-poly Kenney (2D miniature ↔ 3D kits).

## Packs écartés (non pertinents pour une carte iso)

La grande majorité des 143 packs 2D ne nous concerne pas : *Platformer\**, *Pixel\**,
*Topdown Shooter/Tanks*, *Roguelike\** (top-down), *Hexagon\** (hex, pas iso), *UI/Letter
Tiles/Medals/Emote/Crosshair*, *Cartography/Map/Minimap*, *Character/Animal/Fish/Robot*,
*Space Shooter*, *Sketch/Scribble/Monochrome/1-Bit/Pico-8* (styles à part), *Puzzle/Sokoban/
Playing Cards/Sports/Racing*… Gardés sous le coude au cas où : *RTS Medieval*, *RPG Urban
Pack*, *Roguelike City* (si on cherche des variantes top-down à ré-projeter — peu probable).
