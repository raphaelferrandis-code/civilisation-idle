# Index des animations — où vit le visuel de chaque élément

> Référence pour le workflow « 1 session par élément ». Chaque bloc est autonome
> (dispatch `if (id===)` / `if (variant===)` avec `return`). Ne toucher QUE le bloc visé.
>
> **Conventions partagées à respecter (lire avant d'éditer) :**
> - `CM`, `CM.nightF` → `src/game/map/layout.js` (toute lumière nocturne passe par `CM.nightF`)
> - `cmLitColor(band)` → `src/game/map/renderWorld.js` (couleur vitres éclairées par ère)
> - `roofGable()` / `facade()` / `BUILDING_HEIGHTS` → haut de `src/game/map/buildingShapes.js`
> - **Aléa toujours seedé** (`rngFrom`/`seededWeightedPick`) — jamais `Math.random()` dans le rendu (scintillement).
> - build + lint + test doivent passer. Vérif visuelle via `?mapshot` / captures (pas de hot-reload fiable).

## 1. Bâtiments ACHETABLES (sprite moteur unique, identique à tous les âges)

### City — `src/game/map/cityEngineSprites.js`
| Bâtiment | id | Ligne |
|---|---|---|
| Cueilleurs | `foragers` | 5 |
| Entrepôts | `granaries_city` | 99 |
| Caravanes | `caravans` | 177 |
| Marchés | `markets` | 241 |
| Guildes | `guilds` | 314 |
| Champs | `irrigated_fields` | 366 |
| Ports | `river_ports` | 407 |
| Moulins | `water_mills` | 529 |
| Hôtels des monnaies | `mint_houses` | 578 |
| Banques Nationales | `imperial_exchanges` | 650 |

### Knowledge — `src/game/map/engineSprites.js` (dans `drawEngineSpriteCore`)
| Bâtiment | id | Ligne |
|---|---|---|
| Conteurs | `storytellers` | 45 |
| Scribes | `scribes` | 116 |
| Écoles | `schools` | 143 |
| Académies | `academies` | 165 |
| Culte des ancêtres | `ancestral_cult` | 187 |
| Observatoires | `observatories` | 218 |
| Bibliothèques | `libraries` | 245 |
| Universités | `universities` | 267 |
| Imprimeries | `printing_houses` | 436 |
| Instituts stratégiques | `think_tanks` | 467 |

### Infra — `src/game/map/engineSprites.js` (dans `drawEngineSpriteCore`)
| Bâtiment | id | Ligne |
|---|---|---|
| Routes | `roads` | — (pas de sprite : rendu comme réseau routier) |
| Aqueducs | `aqueducts` | 509 |
| Veilleurs | `watch` | 560 |
| Égouts | `sewers` | 608 |
| Bureaucratie | `bureaucracy` | 644 |
| Tribunaux | `courthouses` | 680 |
| Grands travaux | `public_works` | 734 |
| Ministères | `ministries` | 783 |
| Réseaux d'archives | `archive_grids` | 817 |
| Architectes des ruines | `ruin_architects` | 861 |

## 2. Décor procédural (non-achetable, variantes par âge)

### Maisons — `src/game/map/buildingShapes.js` (dans `drawHouseShape`)
| Variante | Ligne | Âges où elle apparaît |
|---|---|---|
| `tent` / `firepit` (camp) | 65 (`drawTinyCamp`) | 0–1 |
| `hut` | 148 | 0–2 |
| `longhouse` | 168 | 1 |
| `townhouse` | 186 | 2–3 |
| `courtyard` | 210 | 2 |
| `stonehouse` | 233 | 3 |
| `manor` | 253 | 2–4 |
| `block` / `tenement` | 272 | 4–6 |
| `tower` | 300 | 5–6 |
| `megablock` / `arcologyhome` | 324 | 6 |

### Places & Savoir — `src/game/map/buildingShapes.js` (dans `drawPublicShape`)
| Variante | Ligne | Catégorie / âges |
|---|---|---|
| `firepit` (grange commune) | 361 | public, âge 0 |
| `shrine` | 398 | library, âges 0–2 |
| `market` | 457 | public, âges 1–4 |
| `granary` | 480 | public, âge 1 |
| `temple` | 507 | public+library, âges 2–4 |
| `hall` | 536 | public, âges 2–3 |
| `keep` | 554 | public, âges 3–5 |
| `forum` | 582 | public, âges 4–5 |
| `palace` | 604 | public, âges 3–6 |
| `school` / `scribehall` | 629 | library, âges 1–3 |
| `library` | 644 | library, âges 2–3 |
| `academy` / `university` | 663 | library, âges 3–6 |
| `station` | 694 | public, âges 5–6 |
| `datavault` | 716 | library, âge 6 |
| `observatory` | 740 | library, âges 5–6 |
| `spire` / `archive` | 765 | public+library, âge 6 |

### Fermes — `src/game/map/renderBuildings.js`
| Variantes | Ligne | Âges |
|---|---|---|
| `patch` / `field` / `industrial` | 280 (`t.type === "farm"`) | patch 0–1, field 0–6, industrial 4–6 |

> Tables de mapping âge→variantes : `VARIANTS_HOUSE` / `VARIANTS_PUBLIC` / `VARIANTS_LIBRARY`
> en haut de `src/game/map/procedural/buildingGenerator.js` (lignes 19–47).
