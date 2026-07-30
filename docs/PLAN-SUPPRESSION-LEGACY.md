# Plan de suppression du rendu legacy top-down

> Etat : plan valide, pas encore execute. Ecrit le 2026-07-29 apres inventaire par sept sondes et
> contre-verification par sept contradicteurs. Les elements refutes avec preuve citee ont ete corriges ;
> les elements indecidables par recherche statique sont classes **keep** avec une note.
>
> **Le gain de ce chantier est la MAINTENANCE, pas le poids.** Un seul chemin de rendu, une seule
> geometrie, une seule facon de repondre a « pourquoi la carte fait ca ». Le poids libere est marginal
> (voir §1) et ne doit jamais servir a justifier le chantier.

---

## 1. Ce qu'on retire, et ce que ca pese

### 1.1 Code source (JavaScript)

| Zone | Fichier(s) | Lignes retirees (approx.) | Octets source |
|---|---|---|---|
| Peintre legacy | `src/game/map/renderWorld.js` (trim, 2855 → ~680 l.) | ~2 175 | ~114 000 |
| Bascule de frame | `src/game/map/cityMapRuntime.js` (bloc `else` 1739-1884 + canvas + imports) | ~200 | ~11 500 |
| Flag `CM.iso` | `src/game/map/iso/projection.js` (bloc 25-44 + 8 branches) | ~45 | ~2 300 |
| Modules supprimes | `pixelRiver.js`, `pixelMedian.js`, `roadPaving.js`, `plazaProps.js` | ~1 050 | ~39 700 |
| Modules trimmes | `pixelTerrain.js` (−240 l.), `renderBuildings.js` (−307 l.), `buildingShapes.js` (supprime, pont a repointer) | ~870 | ~44 500 |
| Agents | `src/game/map/agents.js` (queue `vehicleLaneTarget` + 8 molettes + tri legacy) | ~450 | ~18 000 |
| Tests | `groundSort`, `ysortCorner`, `ysortPainter` (delete) + trims cibles | ~700 | ~22 000 |
| **Total code** | | **~5 490 lignes** | **~252 000 octets** |

Le brief annonce ~170 Ko de JS legacy ; l'inventaire consolide donne ~252 Ko de source **y compris les
tests et les modules satellites**. Sur le bundle expedie, apres minification et gzip, cela represente
**de l'ordre de 25-30 Ko gzip**. Le build fait 37 Mo (dont 30 Mo de PNG). **Le gain de poids est
inferieur a 0,1 % du build.**

### 1.2 Assets

| Lot | Contenu | Octets |
|---|---|---|
| Libere par le chantier | `plazas/anim/` (5), `plazas/` lamppost+paving (10), `medians/` (5), `trees/` (7), `streets*.png` (11), `roads/*.edge.png` (10), `water/{water,reeds-*}` (4), `grass.png` | **~510 000** |
| Deja orphelin, independant du chantier | `agents/vehicles/veh-{barrow,cart}-*` (16), `iso/bridge-full-*` (5), `agents/buildings/veh-caravan-{wagon,truck,pod}` (3), `_archive/` (vide) | **~444 000** |
| A deplacer hors de `public/` (pas supprimer) | `master-palette.{json,gpl}`, `README.md` racine, `wonders/README.md`, `Asepritelayers/` | **~59 700** |

**Total assets touchables : ~1 Mo sur 30 Mo.** Dont a peine la moitie est reellement due au chantier.

### 1.3 Chiffre honnete du gain

| Metrique | Avant | Apres | Gain |
|---|---|---|---|
| Chemins de rendu de la carte | 2 | 1 | **le vrai gain** |
| Lignes de source dans `src/game/map/` | ~19 500 | ~14 000 | −28 % |
| `renderWorld.js` | 147 Ko | ~33 Ko | −78 % |
| Build total | ~37 Mo | ~36 Mo | −2,7 % |
| Bundle JS gzip | — | — | ~−25 Ko |

**Formulation a utiliser dans le commit et le journal :** « un seul chemin de rendu ». Jamais « on gagne
du poids ».

---

## 2. Inventaire verifie

### 2.1 `src/game/map/renderWorld.js` (2855 lignes)

#### Ce qui part

| Fichier | Symbole | Lignes | Verdict | Risque | Note |
|---|---|---|---|---|---|
| renderWorld.js | `CM_GLOW_SPRITES` + `cmGlowSprite` + `cmDrawGlow` | 57-91 | delete | bas | 10 appelants, tous supprimes. Faire **apres** `cityMapDrawCityLights` (dernier appel direct l.2821) |
| renderWorld.js | `cmRoadPalette` + `getRoadVisualStyle` | 92-184 | delete | bas | Seul appelant : `cityMapDrawRoad` l.1633 |
| renderWorld.js | Bloc ARBRES (`CITY_MAP_GREENS`, `TREE_*`, `CANOPY_*`, `TRUNK_*`, `pixelTreesOn`, `FOREST_*`, `treeImg`, `ensureTree`, `treeReady`, `treeKindFor`, prechargement l.240, 6 molettes `window.__`) | 186-249 | delete | bas | La l.240 precharge 7 PNG au chargement du module : **7 requetes mortes a chaque boot, y compris .exe**. Molettes = acces dynamiques, invisibles au lint |
| renderWorld.js | `cmLerpRgb` + `cmUrbanGroundRgb` | 250-269 | delete | bas | |
| renderWorld.js | `cityMapDrawUrbanMass` | 270-292 | delete | bas | |
| renderWorld.js | `cityMapDrawGround` | 293-324 | delete | bas | |
| renderWorld.js | `CM_TERRAIN` + `cmIHash2` + `cmValueNoise` | 325-345 | delete | bas | Emporte le sous-cache signale par l'audit lot2 n-04 |
| renderWorld.js | `cityMapDrawTerrain` | 346-466 | delete | bas | Seul usage de `state.mapSeed` dans ce fichier |
| renderWorld.js | `cityMapDrawRiver` | 824-883 | delete | bas | Seul lecteur de `CM.quayBankCells` (l.860) |
| renderWorld.js | `cityMapDrawTrees` | 884-1196 | delete | bas | Plus gros bloc unitaire, 312 lignes / 15 Ko |
| renderWorld.js | `cityMapDrawNight` | 1197-1243 | delete | bas | L'iso importe `paintFlameGlows` directement (isoRenderer.js:27) : les lueurs ne tombent pas |
| renderWorld.js | `cityMapPlazaBlockedByWonder` | 1244-1259 | delete | bas | Seul consommateur de `cmWonderExtent` |
| renderWorld.js | `cityMapDrawPlazaSurface` | 1260-1324 | delete | bas | |
| renderWorld.js | `cityMapDrawPlazaFurniture` | 1325-1389 | delete | bas | |
| renderWorld.js | `cityMapDrawFountainWater` | 1390-1412 | delete | bas | |
| renderWorld.js | `cityMapDrawPlazas` | 1413-1489 | delete | bas | Pose `CM._plazaTall`, dont le seul lecteur part dans le meme lot |
| renderWorld.js | `cityMapDrawPlazaTallProps` | 1490-1522 | delete | bas | |
| renderWorld.js | `cityMapDrawCityReflections` | 1523-1592 | delete | bas | Deja portee en iso (commentaire isoRenderer.js:3893) |
| renderWorld.js | `cmRoadConnects` + `cmRoadMask` | 1593-1618 | delete | bas | Seul consommateur de `cmIsBridgeRoad` |
| renderWorld.js | `cityMapDrawRoad` | 1619-1814 | delete | **moyen** | Importee par `roadDivided.test.js:4` — trim du test dans le meme commit |
| renderWorld.js | `ensureRoadRuns` + `roadBodyWidth` | 1815-1887 | delete | moyen | Publie `CM.roadRuns`, lu uniquement par `roadDivided.test.js` |
| renderWorld.js | `cityMapDrawRoadMarkings` | 1888-2075 | delete | **moyen** | Idem : importee par le test. Seul consommateur de `drawPixelMedians` ici |
| renderWorld.js | `CM.debugRoads` (calque de debug des masques) | 1787-1800 | delete | bas | Molette pilotee par `__CM.debugRoads`. **Aucun equivalent iso** — voir §6 Q4 |
| renderWorld.js | `bridgeStyleFor` + `cityMapDrawBridgeSpan` | 2076-2208 | delete | bas | |
| renderWorld.js | `cityMapDrawBridges` | 2209-2217 | delete | bas | |
| renderWorld.js | `cityMapDrawBridgeLights` | 2218-2257 | delete | bas | |
| renderWorld.js | `cityMapDrawStreetLights` | 2258-2355 | delete | bas | Emporte le bug audit lot2 (`now` dans un bake sans `now`) |
| renderWorld.js | `drawCrisis` | 2594-2709 | delete | bas | La sim (`updateCrisis`) reste. Seul consommateur de `drawNamedAgent` / `riotEraKey` |
| renderWorld.js | `cityMapDrawHealthTint` | 2710-2741 | delete | bas | |
| renderWorld.js | `cityMapDrawCityLights` | 2742-2827 | delete | bas | Seul consommateur de `vehicleLaneOffset` ici, dernier de `toNum` et `cmGlowSprite` |
| renderWorld.js | Sous-bloc `CM.quayBankCells` dans `ensureQuayGate` | 528-540 | trim | bas | **Sortie morte dans une fonction vivante** : le Set n'a qu'un lecteur, l.860, qui part |
| renderWorld.js | Imports + hooks `setXOnLoad` | 2-39 | trim | moyen | Le fichier commence par `/* eslint-disable */` : **aucune regle de lint ne protege ce menage**, il est entierement manuel |
| renderWorld.js | Bloc d'export final | 2829-2855 | trim | bas | 25 noms → 7. `quayWallTune` est un `export const` inline l.548, **ne pas l'ajouter au bloc** |

#### Ce qui reste (racines conservees)

`baseColor` (49-52), `cmLitColor` (54-56), `cmRiverNormalAt` (467-471), `ensureQuayGate` (473-541),
`quayWallTune` (543-548), `lightenHex` (550-557), `cityMapDrawQuays` (559-823), `RIOT_WONDER_CLEAR_R` +
`cityMapRiotBlocked` (2356-2368), `cityMapPickRiotRoadNear` (2369-2383), `cityMapRiotGroupCenter`
(2384-2396), `drawRiotWeapon` (2397-2425), `cityMapCalmRioterAt` (2427-2450), `updateCrisis` (2452-2593).

Le fichier passe de 2855 a ~680 lignes. **Il ne « rend » plus le monde : il ne reste que les quais et la
simulation d'emeute.** Renommage a envisager (voir §6 Q5).

---

### 2.2 `src/game/map/cityMapRuntime.js` (2117 lignes)

| Fichier | Symbole | Lignes | Verdict | Risque | Note |
|---|---|---|---|---|---|
| cityMapRuntime.js | Bloc `else` du pipeline legacy | 1739-1884 | delete | bas | Bornes exactes verifiees : 1737 `if (CM.iso && drawIsoWorld(...)) {`, 1739 `} else {`, 1884 `} // fin du pipeline legacy`, 1885 `fpEnd()`. Rien a re-indenter, le corps part entier |
| cityMapRuntime.js | Bascule `if (CM.iso && drawIsoWorld(...))` | 1734-1739 + 1884 | rewrite | **moyen** | Devient un appel nu. `drawIsoWorld` renvoie `false` quand `CM.layout` est nul (isoRenderer.js:**6855**, delegue via 6876 → 7349) : poser un garde `if (!CM.layout) { fpEnd(); return; }` **avant** l'appel |
| cityMapRuntime.js | `import { ... } from './renderWorld.js'` | 42-64 | trim | bas | 20 → 2 : `cityMapCalmRioterAt` (l.772), `quayWallTune` (l.2050) |
| cityMapRuntime.js | `import { drawTile, drawWonder } from './renderBuildings.js'` | 65 | delete | bas | L'iso importe `drawWonder` pour son compte (isoRenderer.js:23) |
| cityMapRuntime.js | `import { ... } from './agents.js'` | 66 | trim | bas | 10 → 4 : `getVehicleDensity`, `chooseRoadVehicleType`, `thoughtBubbleAnchor`, `citizenSpawnCell`. `drawCitizens` est **deja mort aujourd'hui** |
| cityMapRuntime.js | `import { ... } from './pixelTerrain.js'` | 67 | trim | **moyen** | Retirer **le seul specifieur `drawPixelTerrain`**. Les 5 autres survivent par les molettes (2041, 2042, 2045, 2046, 2054). Oubli symetrique de `agents.js:4` — a faire dans le **meme commit que la bascule** sinon la porte de lint casse |
| cityMapRuntime.js | `import ... from './pixelRiver.js'` | 68 | delete | bas | Le module devient orphelin |
| cityMapRuntime.js | `import ... from './pixelBridge.js'` | 69 | delete | bas | **Le module reste** (isoRenderer.js:33, isoBridge.js:45) |
| cityMapRuntime.js | `CM.staticCanvas` / `CM.sctx` / `CM._staticBake` | 123, 131-136, 168, 1468-1469, 1482-1483, 1744, 1798-1799 | delete | **HAUT** | Voir piege P1 |
| cityMapRuntime.js | `CM.tileCanvas` / `CM.tctx` / `CM._tileBake` / `CM.tileDirtyUntil` | 137-142, 169, 933-934, 1470-1471, 1482, 1484, 1492, 1832-1840 | delete | moyen | `tileDirtyUntil` devient ecrit-jamais-lu. Invalidations orphelines chez `pixelHouses.js` (136, 323, 328, 329, 332) |
| cityMapRuntime.js | `CM._groundBake` (la **cle** legacy) | 151, 170, 1765-1773, 2045-2046 | trim | moyen | Le **canvas** reste (partage avec l'iso). Voir piege P2 |
| cityMapRuntime.js | `cityMapCameraTarget` — `perTile` | 314 | trim | bas | `T * (CM.iso ? 2*ISO_X : 1)` → `T * 2 * ISO_X` |
| cityMapRuntime.js | `cityMapCameraTarget` — fit-to-bounds | 321 | trim | bas | `if (b && CM.iso)` → `if (b)`. **Le repli 339-344 reste vivant** (`cityContentBounds` peut renvoyer null, l.290) |
| cityMapRuntime.js | `cmClampCamera` — queue legacy | 408-419 | trim | moyen | Garder 394-405, retirer le `return` 406. Ne pas perdre le bornage de `CM.zoomGoal` (403) |
| cityMapRuntime.js | `CM.born[t.key]` et `CM.born[d.key]` | 973-982 | trim | moyen | **Garder imperativement la purge l.987** qui protege les cles `wonder:`. Les entrees `d.key` sont deja mortes aujourd'hui |
| cityMapRuntime.js | `CM.frameRuined` (affectation) | 1675 | trim | bas | Relue en 1763/1836 (bloc supprime) et par 4 fonctions legacy de renderWorld. Le **champ** reste teste par `roadDivided.test.js:46` |
| cityMapRuntime.js | Molettes `__pixelTerrain`, `__pixelRoads`, `__sidewalk`+`__sidewalkTune`, `__pixelTileset`, `__pixelWater`, `__waterRipples` | 2041-2046, 2054, 2055, 2058 | delete | bas | Sept no-ops silencieux si laisses. Voir piege P6 |
| cityMapRuntime.js | `setBridgeOnLoad(() => { CM._staticBake = null; })` | 2064 | delete | bas | Le callback seul ; **`window.__pixelBridge` l.2061 : voir piege P5** |
| cityMapRuntime.js | `cmInvalidateBakes` | 167-173 | trim | bas | Reduire aux 2 bakes iso (`_isoGroundBake`, `_quayBake`). Appelee par l'UI Options via `applyCityMapQuality:229` — **re-tester en cliquant les 4 paliers** |
| cityMapRuntime.js | Commentaires « iso/legacy » | 37-38, 275-276, 1721-1725, 1734-1736 | trim | bas | Purement redactionnel |

---

### 2.3 Le flag `CM.iso`

| Fichier | Symbole | Lignes | Verdict | Risque | Note |
|---|---|---|---|---|---|
| iso/projection.js | `isoFlag` + `localStorage "cmIsoMode"` + `window.__iso` + `CM.iso = isoFlag.on` | 25-44 | delete | **moyen** | **A SUPPRIMER EN DERNIER.** `CM.iso` absent = `undefined` = falsy : le retirer trop tot rallume tout le legacy **en silence**, sans une seule erreur |
| iso/projection.js | `worldToScreen` — branche legacy | 50 | trim | bas | |
| iso/projection.js | `screenToWorld` — branche legacy | 61 | trim | bas | |
| iso/projection.js | `panDeltaToScreen` — branche legacy | 70 | trim | bas | |
| iso/projection.js | `screenDeltaToPan` — branche legacy | 78 | trim | bas | |
| iso/projection.js | `depthOf` — ternaire | 85 | trim | bas | Corps devient `return wx + wy;` |
| iso/projection.js | `wonderFootWorld` — `if (!CM.iso) return legacy;` | 135 | trim | **moyen** | **La const `legacy` l.134 n'est PAS morte** : elle reste renvoyee l.137 pour `era_mega` (l'Aiguille). 3 consommateurs de `wonderAnchor` : cityMapRuntime.js:603, isoRenderer.js:5911, **renderBuildings.js:12/593** (atteint par isoRenderer.js:6364) |
| iso/projection.js | `tileDiamond` — branche legacy | 157-160 | trim | bas | La fonction n'a **aucun consommateur de production**, seulement `projection.test.js:67`. Suppression complete = autre chantier |
| iso/projection.js | `visibleDiamondBounds` — `if (!CM.iso) return null;` | 181 | trim | bas | L'appelant (isoRenderer.js:5701) tolere deja `null` |
| iso/projection.js | Commentaires « identite au bit pres » | 9-10, 95-96, 152-153 | trim | bas | Raison d'etre affichee du fichier, devenue fausse |
| agents.js | pedEdge — ligne de trottoir | 769 | trim | bas | Retirer `CM.iso && ` **seulement**. Garder `CM.isoPedEdge != null` : voir piege P3 |
| agents.js | pedEdge — etalement personnel | 778 | trim | bas | Idem |
| agents.js | `isoK` — vitesse de marche | 1058 | trim | **moyen** | `CM.iso ? (__isoWalkSpeed ?? 0.72) : 1` → `__isoWalkSpeed ?? 0.72`. **Consequence : les 3 suites pietonnes passent de vitesse ×1 a ×0,72** |
| agents.js | `vehicleLaneTarget` — voie non-main | 1352 | trim | bas | Retirer `CM.iso && `, garder `CM.isoVehLane != null` |
| agents.js | `vehicleLaneTarget` — poussee bord exterieur legacy | 1364-1392 | delete | moyen | `if (CM.iso) return {x:0,y:0}` (1368) devient inconditionnel. **La fonction ne devient PAS constante** : `rank !== "main"` (1338-1362), plaza (1337) et gare (1335) restent vivants |
| agents.js | `import { pixelSidewalkFlag, sidewalkTune }` | 4 | delete | bas | Unique usage : l.1382, dans le bloc qui part |
| agents.js | Commentaires « legacy » | 760, 1057, 1330, 1351, 1981 | trim | bas | L.1981 est le plus trompeur : donne `__iso(false)` comme mode d'emploi |
| cityMapRuntime.js | Lectures de `CM.iso` | 314, 321, 393, 1737 | delete | bas | Condition de sortie : `grep -n "CM\.iso\b" src/` doit etre **vide** avant de toucher projection.js:25-44 |

---

### 2.4 Les modules satellites

| Fichier | Symbole | Verdict | Risque | Note |
|---|---|---|---|---|
| pixelRiver.js | module entier | delete | bas | Unique importeur : cityMapRuntime.js:68. `isoRenderer.js:2969` dit par ecrit que les vaguelettes iso ont ete retirees le 2026-07-22 |
| pixelMedian.js | module entier | delete | bas | Importeurs : pixelTerrain.js:17 et renderWorld.js:23, tous deux legacy. L'iso a son terre-plein en art dedie (isoRenderer.js:5921-5953, `MEDIAN_TUNE`) |
| roadPaving.js | module entier | delete | bas | Importeurs : pixelTerrain.js:18 et renderWorld.js:24. **Zero reference dans `src/game/map/iso/`** |
| plazaProps.js | module entier | delete | bas | Unique importeur : renderWorld.js:22. `isoPlaza.js` **ne passe pas par lui** : il charge ses PNG lui-meme et redefinit une `plazaEraForBand` **homonyme au mapping different** |
| pixelTerrain.js | `drawPixelTerrain` (160-319) + `pixelTerrainFlag` + `pixelRoadsFlag` + `setPixelTileset` + `ensureGrass`/`ensureStreet`/`streetForBand`/`streetCache`/`streetRoadColors`/`sidewalkTone`/`SKIP_SIDEWALK` + imports l.17/l.18 | trim | **moyen** | **`drawEraGroundFill` (326-340) RESTE** : voir piege P4 |
| pixelTerrain.js | `pixelSidewalkFlag` + `sidewalkTune` | **keep** | — | Refute avec preuve : voir piege P7 |
| renderBuildings.js | `drawTile` + tout le bloc LOD (27-333) | trim | moyen | Coupure nette a la l.334. Imports qui tombent : `buildingById`, `CM_INFRA_IDS`, `CM_KNOWLEDGE_IDS`, `drawEngineSprite`/`drawHouseShape`/`BUILDING_HEIGHTS`, `pixelHouseReady`/`drawPixelHouse`, `baseColor`, **et `cmHash`** (l.7, seuls usages 148 et 230, tous deux dans la plage qui part) |
| buildingShapes.js | module entier | delete **conditionnel** | **moyen** | Ce n'est pas un mort, c'est **un pont a demonter** : voir piege P8 |
| pixelBridge.js | `drawPixelBridges` + `pixelBridgeFlag` + `setBridgeOnLoad` + chargement des scenes | **keep** | — | Chemin A/B iso vivant : voir piege P5 |
| pixelBuildings.js | module entier | **keep** | — | Inerte au runtime (`AVAILABLE` vide) mais **importe statiquement** par engineSprites.js:4/1697, chemin iso vivant. Hors perimetre |
| engineSprites.js | module entier | keep | — | Atteint par l'iso via `buildingShapes.js` **et** `engineSceneCache.js:30` |
| pixelHouses.js | module entier | keep | — | Coeur du rendu iso des habitations (isoRenderer.js:20) |
| necropolis.js | `buildNecropolis` | keep | — | Appele hors bloc legacy (cityMapRuntime.js:994). Note : `L.necropolis` n'est lu nulle part — dette anterieure, **ne pas la traiter ici** |
| layout.js | `computeMedianSegments` / `L.median` | keep | — | La **fonction** reste appelee (layout.js:2663) ; seuls ses **lecteurs de rendu** meurent. Ne pas la supprimer sur la foi d'un « plus de lecteur » |
| Dossier `procedural/` (8 modules) | — | keep | — | Absent des inventaires initiaux. Tous vivants, hors legacy (layout.js:9-17, CityView.jsx:45-46, state.js:13-14, crisis.js:49-50) |

---

### 2.5 Les tests

| Fichier | Portee | Verdict | Risque | Note |
|---|---|---|---|---|
| `__tests__/groundSort.test.js` | 8 `it` | delete **partiel** | **moyen** | Les 3 derniers `it` (l.155-175, phares) couvrent `drawVehicleHeadlights`, **appelee inconditionnellement par l'iso** (isoRenderer.js:4596). Les reecrire par appel direct avant de jeter le fichier |
| `__tests__/ysortCorner.test.js` | 6 `it` | delete | bas | Pilote `drawGroundAgents`. Successeur : `isoUnitDepth.test.js` |
| `__tests__/ysortPainter.test.js` | 13 `it` | delete | **moyen** | 13 `it` de doctrine (« rue entre deux rangs de tours », « empreinte multi-tuiles : base = rang SUD »). **Porter au moins 3-4 regles vers isoUnitDepth avant de supprimer** — le bug est deja revenu une fois |
| `__tests__/roadDivided.test.js` | 17 `it` | **trim, pas delete** | moyen | Retirer : les 2 `describe` renderWorld (58-134, 203-291) et le `it` legacy (146-158). **Garder** le `describe` `vehicleLaneOffset` (136-201) : il teste une fonction **iso vivante** (isoRenderer.js:4489/5987) et son `it` iso (160-168) est la seule couverture executable de ce cas. Reecrire ce `it` sans l'echafaudage `CM.iso`. Renommer le fichier en `vehicleLane.test.js` |
| `iso/__tests__/projection.test.js` | 14 `it` | trim | moyen | Supprimer le `describe` legacy (35-60) + les 3 pilotages du flag (16, 18, 63). **Garder le helper `legacyPlanarAnchor` (27-33)** : il sert au test iso l.108-117 qui verifie que l'ancre iso **diverge** de la projection planaire |
| `__tests__/citizenDoorstep.test.js` | `CM.iso = false` l.28 | trim | moyen | Effet reel : vitesse ×0,72. Budgets larges (6000 pas l.97/153), ratio l.143 invariant. **Rejouer, pas relire** |
| `__tests__/bridgePedEdge.test.js` | `CM.iso = false` l.25 | trim | bas | `FULL_EDGE = 0.42` reste exact (`CM.isoPedEdge` jamais publie ici) |
| `__tests__/pedTurnSmooth.test.js` | `CM.iso = false` l.23 | trim | bas | Les 2 `it` comparent un **ratio** : le facteur se simplifie |
| `iso/__tests__/isoPlaza.test.js` | `CM.iso = true` l.55 / `false` l.60 | trim | bas | **4e fichier qui pilote le flag**, absent des inventaires initiaux. Futur faux vert |
| `__tests__/bakeInvalidation.test.js` | scan statique | keep | bas | Reste vert (corpus retreci). Son regex ne couvre pas `_groundBakeStable` |
| `__tests__/roadWidth.test.js` | 3 `it` | keep | bas | **Vert mais decoratif** apres coup : `roadWidthFor` ne survit que par le repli `agents.js:1354`. Commentaire l.3-4 (« 3 copies : getRoadVisualStyle, roadBodyWidth, vehicleLaneOffset ») devient faux |
| `__tests__/terrePlein.test.js`, `isoUnitDepth.test.js`, `roadIsoHierarchy.test.js` | — | keep | bas | Ne touchent jamais au flag ; ce sont les gardes qui restent |

**Comptage attendu :** ~1112 `it` avant → ~1068 apres (~44 retires). Mesurer le total **avant** de commencer.

---

### 2.6 Les assets

| Chemin | Verdict | Risque | Note |
|---|---|---|---|
| `public/pixelart/plazas/anim/` (5) | delete | bas | 296 Ko sur les 339 du dossier. L'iso a `iso/anim/plaza-fountain-<ere>.png` |
| `public/pixelart/plazas/` lamppost-* + paving-* (10) | delete | bas | Non sondes par l'iso (absents de `LEGACY_PROP`) |
| `public/pixelart/plazas/` bench/planter/bush/fountain/flag/amphora (~50) | **keep** | moyen | Maillon 2 de la chaine de repli iso (`isoPlaza.js:761-762`, doc `PLACES-ISO-COMPOSEES.md:100/407`). Voir §6 Q3 |
| `public/pixelart/medians/` (5) | trim | bas | Generateur associe : `scripts/fetchMedians.mjs` |
| `public/pixelart/trees/` (7) | delete | bas | Retirer **aussi** le prechargement renderWorld.js:240. Generateur : `scripts/fetchTrees.mjs` (orphelin, son en-tete cite `TREE_SPRITES`, symbole deja inexistant) |
| `public/pixelart/streets*.png` (11) | delete | bas | Retirer aussi `ensureStreet` + pixelTerrain.js:111 |
| `public/pixelart/roads/*.edge.png` (10) | delete | bas | Retirer aussi pixelTerrain.js:43-48 |
| `public/pixelart/roads/*.png` + `*.json` (20) | **keep** | **HAUT** | Voir piege P4 |
| `public/pixelart/water/{water,reeds-0..2}.png` | trim | bas | `water.png` : lecture **non gardee** par `scripts/retintWater.mjs:30` |
| `public/pixelart/water/river-tiles.png` | keep | haut | isoRenderer.js:2622 |
| `public/pixelart/grass.png` | trim | bas | Lecture **non gardee** par `scripts/makeGrassEdge.mjs:26`. Regenere par `separatePixelTerrain.mjs` |
| `public/pixelart/grass-ref.{png,json}` | **keep** | bas | `.gitignore:68` le classe nommement « asset UTILISE ». Indecidable → keep |
| `public/pixelart/houses/` (22) | keep | haut | Art des maisons **de l'iso** (isoRenderer.js:20) |
| `public/pixelart/bridges/` (5) | keep | moyen | Retenu par l'A/B `__isoBridge3d`, pas par le legacy. Voir §6 Q2 |
| `agents/vehicles/veh-{barrow,cart}-*` (16) | trim | bas | Deja orphelin (agents.js:357-361). Corriger le roster `extractVehFrame0.cjs:12` |
| `agents/buildings/veh-caravan-{wagon,truck,pod}` (3) | trim | bas | Deja orphelin (cityEngineSprites.js:315-318). **Ne pas confondre avec `caravan-*` sans prefixe `veh-`, vivants** |
| `iso/bridge-full-*` (5) | trim | bas | Deja orphelin (isoRenderer.js:4396). Mais `scripts/normalizeIsoScenes.mjs:106` boucle dessus |
| `public/pixelart/_archive/` | delete | bas | Dossier **vide**, non suivi par git : ne partira qu'a la main |
| `scripts/makeStreetTiles.mjs`, `fetchStreetSurfaces.mjs` | delete | bas | Deja inoperants (`_streets_src/` n'existe plus) |
| `scripts/makeGrassEdge.mjs`, `fetchTrees.mjs`, `fetchMedians.mjs`, `retintWater.mjs` | trim | bas | Generateurs orphelins de leurs assets. Voir §6 Q6 |
| `scripts/separatePixelTerrain.mjs` | **keep** | moyen | Seul regenerateur de `roads/<band>.png` (asset keep/haut). **Sa source `_archive/coupled/` est vide : ces 20 fichiers sont irremplacables en l'etat** |

---

### 2.7 UI, configuration, documentation

| Fichier | Symbole | Verdict | Risque | Note |
|---|---|---|---|---|
| `src/components/**` | tout | **keep** | bas | **Zero reference** au flag ou au rendu legacy. Les 40+ « legacy » sont `epitaphLegacy` (legs de testament), homonymie totale |
| `qualityMode.js` + `OptionsDialog.jsx` | preset qualite | keep | bas | Deja 100 % pipeline-agnostique. **Ne rien y toucher** |
| `package.json`, `vite.config.js`, `eslint.config.js` | build | keep | bas | Globs `dist/**/*`, aucune liste d'assets par chemin |
| `main.cjs` | commentaire `app://` (26-31) | **keep** | bas | Refute : `renderBuildings.js:353` fetch encore un JSON d'asset. Les deux raisons restent vraies |
| `.gitignore` | ligne 68 | trim | bas | `# (public/pixelart/roads/, grass-ref) restent versionnes.` — a reverifier si `roads/*.edge.png` part |
| `package.json` | ligne 25 (`!dist/**/Asepritelayers/**`) | trim | bas | A toucher **seulement** si on deplace `Asepritelayers/` |
| `REPRISE-chantier-iso.md` | 12-13, 15, 19, 22, 166, 250-254, 340, 349-350, 513, 544-545, 613-614, 630 | rewrite | bas | **LE doc du chantier** : doit porter la cloture. Cocher la l.513 (« retirer le top-down un jour ») |
| `public/pixelart/README.md` | 3, 18, 20, 27-53, 61-95, 99-101, 165, 219-224 | rewrite | bas | Elaguer, **pas jeter** : 8-23 (rangement), 103-165 (DA moteurs), 167-215 (palette) restent vivants. `compare.html` (69, 92) n'existe deja plus |
| `public/pixelart/wonders/README.md` | fichier entier | trim | bas | 14 Ko de prose d'auteur servis au client. A deplacer avec son jumeau racine |
| `ARCHITECTURE.md` | §6 (121-128) | rewrite | bas | Ne mentionne meme pas l'iso. Corriger aussi « plafonne a 30 fps » (faux depuis le palier Elevee a 60) |
| `REPRISE-places-pixel.md` | 11, 22, 37, 48, 49, 55 | trim | bas | Entierement indexe sur `plazaProps.js` + `renderWorld.js` |
| `REPRISE-fleuve-quais.md` | 12, 26, 45 | trim | bas | L.12 (`cityMapDrawRiver`) meurt ; l.26 (`cityMapDrawQuays`) **reste vraie** |
| `RETRI-2026-07-27.md` | 50 | trim | bas | « le legacy reste en direct, assume » |
| `ANIMATION_INDEX.md` | 8 | trim | bas | Renvoi `cmLitColor` → `renderWorld.js` : le symbole demenage |
| `AUDIT-2026-07-21.md` | 482, 485, 562, 582 | trim | bas | Ligne par ligne : 482 pointe `cityMapDrawQuays` qui **survit** ; 485/562 pointent du code qui part |
| `docs/PERF-CARTE-REPRISE.md` | 121 | trim | bas | « absent (tout, legacy inchange) » → « absent (tout, en direct) » : c'est l'iso qui appelle sans mode (isoRenderer.js:7324) |
| `docs/audits/audit-2026-07-lot2.md` | 21, 50, 57, 260-265, 285-287 | trim | bas | m-11 planifie **exactement ce chantier** : le marquer resolu et date. n-04 devient sans objet |
| `docs/audits/audit-2026-07-mort.md` | 33, 51, 60, 76-82, 97-98, 128, 171, 191-192, 228, 230, 251 | trim | bas | MORT-02/03 sont **deja appliquees** (grep vide). DUP-08 designe `renderWorld.js:460` comme **source de verite** d'une dedup a venir |
| `docs/audits/audit-2026-07-SYNTHESE.md` | 163, 168, 245 | trim | bas | G-62 et G-67 pointent des fichiers supprimes |
| `docs/AMELIORATIONS-VISUELLES-QOL.md` | 51, 653, 1203 | trim | bas | Trois preuves qui meurent. **Re-pointer, ne pas supprimer les fiches** |
| `docs/PLACES-ISO-COMPOSEES.md` | 82, 100, 121, 130, 171, 390, 407-408, 446 | **keep** | bas | Faux ami : « legacy » = le **kit d'art**, pas le pipeline. Reste vrai |
| `docs/reprise-infra-pixel.md` | 28, 115 | **keep** | bas | Faux ami : repli **procedural d'un sprite absent**, vivant dans les deux pipelines |

---

### 2.8 Pieges : ce qui a l'air mort mais ne l'est pas

> **Cette section est la plus importante du document.** Chaque entree est une affirmation d'un
> inventaire, **refutee par une preuve citee**. Un faux « delete » casse le jeu ; un faux « keep » ne
> coute rien.

---

#### P1 — `CM.staticCanvas` : supprimer le canvas casse le **resize** du sol iso

`resize()` teste :

```js
// cityMapRuntime.js:123
const offSame = !CM.staticCanvas || (CM.staticCanvas.width === onw && CM.staticCanvas.height === onh);
// :124
if (mainSame && offSame) return;
```

Si `CM.staticCanvas` disparait, `offSame` vaut **toujours vrai** : `resize()` sort **avant** de
redimensionner `CM.groundCanvas` et `CM.quayCanvas`. Symptome : le sol iso et les quais gardent leur
ancienne taille quand seule la marge de pan change (`window.__panMargin`) → blit decale/tronque.

**Geste correct :** re-ancrer le test sur `CM.groundCanvas` **avant** de supprimer `staticCanvas`.

---

#### P2 — Le sol ISO bake **dans** `CM.groundCanvas`

Seule la **cle** `_groundBake` est legacy. Le canvas, le contexte et `CM._bakeMargin` sont **partages** :

```js
// isoRenderer.js:6604
const gc = CM.groundCanvas, gctx = CM.gctx;
// isoRenderer.js:6703 / 6733 / 7024
helpers.blitMargin(CM.groundCanvas, '_isoGroundBake');
```

`CM._bakeMargin` est lu par isoRenderer.js:6605, 6709, 6794, 6976. `cityMapBakeMargin` /
`cityMapBlitMargin` (cityMapRuntime.js:239-273) sont l'**unique canal** par lequel l'iso cuit son sol :
elles sont passees en `helpers` a la ligne 1737.

**Ne jamais supprimer** le bloc 143-152 de `resize()` ni la ligne 171 de `cmInvalidateBakes`.

---

#### P3 — `CM.isoPedEdge != null` n'est **pas** une garde de flag

```js
// agents.js:769
const isoPed = CM.iso && CM.isoPedEdge != null ? (...) : null;
```

`agents.js` **ne peut pas importer `isoRenderer`** (import inverse). La geometrie est publiee par
`syncIsoStreetGeom` (isoRenderer.js:1287-1307, appelee au chargement du module l.1307). En test unitaire
(`agents.js` sans `isoRenderer`), `CM.isoPedEdge` reste `undefined` et le repli `0.42` (l.774) **doit
survivre**.

**Geste correct :** retirer `CM.iso && ` **seulement**. Meme chose pour `CM.isoPedSpread` (l.778) et
`CM.isoVehLane` (l.1352). Filet : `roadIsoHierarchy.test.js:22/47-58`.

---

#### P4 — `public/pixelart/roads/*.png|json` est **vivant en iso**

Le dossier est declare dans `ROAD_STAGES` (pixelTerrain.js:56-67) et consomme par `drawPixelTerrain` :
tout dit legacy. Mais :

```js
// pixelTerrain.js:324 (commentaire de la fonction)
// (l'appelant retombe alors sur un aplat). Independant du flag terrain.
// pixelTerrain.js:327
const ts = ensure(tilesetForBand(band));
```

`drawEraGroundFill` est appelee par `cityEngineSprites.js:2931` (module **partage**, importe par
isoRenderer.js:24). Supprimer `roads/*.png|json` remplace la matiere d'age des champs par un aplat brun
**dans toutes les eres, en iso**.

**Reserve honnete :** en iso, les champs sont peints par `drawIsoField` (isoRenderer.js:6227) et les
scenes moteur sont refusees pour ce motif (`isoRenderer.js:4844: if (/field|farm|crop|orchard|aqueduct/i.test(id)) return false;`).
La branche est **peut-etre** morte a l'execution — mais c'est indecidable par recherche statique.
**Regle d'or : keep.** Voir §6 Q1.

Seuls les **10 `.edge.png`** sont reellement legacy (lus a pixelTerrain.js:255).

---

#### P5 — `pixelBridgeFlag` et `window.__pixelBridge` sont **vivants en iso**

```js
// pixelBridge.js:29   (2e definition de la molette, au chargement du module)
if (typeof window !== 'undefined') window.__pixelBridge = setPixelBridge;
// pixelBridge.js:150  (coupe-circuit)
if (!pixelBridgeFlag.on) return false;
// isoRenderer.js:4397 (appel ISO, sous withLegacyToIso)
if (withLegacyToIso(ctx, () => drawPixelBridges(CM, now))) {
```

Supprimer `cityMapRuntime.js:2061` ne tue **pas** la molette : elle retombe sur celle de `pixelBridge.js:29`.
Et le flag pilote toujours un chemin iso (repli quand `__isoBridge3d(false)`).

**Geste correct :** supprimer seulement le callback `setBridgeOnLoad` l.2064 (il n'invalide qu'un bake
mort) et la ligne d'import l.69. **Ne pas ecrire dans le journal que `__pixelBridge` disparait.**

---

#### P6 — `cityMapDrawQuays` sans mode reste **atteignable en iso**

```js
// isoRenderer.js:7309
// A/B : globalThis.__quayBake = false rejoue le trace en direct (reference).
// isoRenderer.js:7310
if (CM.quayCanvas && helpers && globalThis.__quayBake !== false) {
// isoRenderer.js:7324 (branche else)
cityMapDrawQuays(now);
```

L'affirmation « apres la coupe, l'iso passe toujours `'base'` ou `'glow'` » est **fausse**. La branche
mode-indefini (baseOn && glowOn simultanement) reste prise des que `__quayBake` vaut `false` ou que
`CM.quayCanvas` manque.

**Geste correct :** ne **pas** simplifier la branche 577-579. 265 lignes de trace de quai, non couvertes
par les tests.

---

#### P7 — `pixelSidewalkFlag` / `sidewalkTune` ont une garde **executee par un test**

```js
// roadDivided.test.js:149
CM.iso = false;   // poussee exterieure = geometrie LEGACY
// roadDivided.test.js:150
const top = vehicleLaneOffset(v(5, 5, 0), 32);
```

Ce chemin traverse `agents.js:1368` (`if (CM.iso) return {x:0,y:0}`) et atteint `agents.js:1382`
(`const swW = pixelSidewalkFlag.on ? ... : 0`). Regle (f) : usage dans les tests = reference vivante.

**Correction du diagnostic inverse aussi :** l'inventaire annonce un « PIEGE MAJEUR » selon lequel
supprimer `pixelTerrain.js` casserait le placement des vehicules **en iso**. **C'est faux** : le retour
anticipe `agents.js:1368` precede de 14 lignes la lecture, et le recablage iso **existe deja** :

```js
// agents.js:1352
const lane = (CM.iso && CM.isoVehLane != null)
// agents.js:1353
  ? ((CM.isoVehLaneByRank && CM.isoVehLaneByRank[rank] != null) ? CM.isoVehLaneByRank[rank] : CM.isoVehLane)
```

Confirme par `roadDivided.test.js:165` : `expect(vehicleLaneOffset(v(5,5,0), 32)).toEqual({x:0, y:0})`
sous `CM.iso = true`. **Geste correct : supprimer la queue morte (1369-1391) + l'import l.4. Ne pas
recabler sur `SIDEWALK_ISO`.** La fonction s'appelle `vehicleLaneTarget` (agents.js:1332), pas `laneOffset`.

---

#### P8 — `buildingShapes.js` n'est pas un mort, c'est un **pont a demonter**

```js
// isoRenderer.js:22
import { drawEngineSprite } from '../buildingShapes.js';
// isoRenderer.js:4753 / 4809 / 4899 — trois appels vivants
```

`buildingShapes.js:3` importe `drawEngineSprite` de `engineSprites.js` et le **re-exporte tel quel**
(l.327). Le classer `delete` sans autre precaution **casse l'iso**.

**Geste correct, dans cet ordre :** (1) repointer `isoRenderer.js:22` vers `'../engineSprites.js'`
(precedent existant : `engineSceneCache.js:30`), (2) puis supprimer le fichier. Signaler dans le meme
commit que `cmLitColor` (renderWorld.js:54/2850) perd son dernier lecteur (`buildingShapes.js:99`).

---

#### P9 — `roadDivided.test.js` n'est legacy qu'a **moitie**

Le `describe` `vehicleLaneOffset` (l.136-201, 5 `it`) ne teste **pas** `renderWorld` : il teste
`vehicleLaneOffset` (agents.js:1399), fonction du chemin **iso** (isoRenderer.js:4489, 5987). Il pose
`CM.layout` a la main via `boulevardH()` (l.139-144), sans passer par `setupLayout`. Il ne tombe qu'a
cause de l'import statique l.4.

`roadDivided.test.js:160` (« iso : chaque cellule du boulevard EST une voie ») est la **seule couverture
executable** du comportement iso de `vehicleLaneOffset`.

**Geste correct : trim, pas delete.** Retirer les 2 `describe` renderWorld + le `it` legacy, garder le
reste, renommer le fichier.

---

#### P10 — 3 `it` de `groundSort.test.js` couvrent du code **vivant en iso**

```js
// isoRenderer.js:4596
drawVehicleHeadlights(ctx, v);
```

Tout le gating teste par les 3 `it` (l.155-175) vit **dans la fonction partagee** : `agents.js:1539`
(nuit), `:1540` (ere motorisee), `:1542` (gare/arrete). **Aucun autre test du depot** ne touche
`drawVehicleHeadlights`. La fonction est exportee (agents.js:2282) : ces 3 `it` se reecrivent par appel
direct.

---

#### P11 — Le repli du survol des merveilles **tourne en iso**

Malgre son commentaire « Repli (legacy top-down…) », `cityMapHitTest` 595-606 est atteint a chaque frame
ou aucune merveille n'est dessinee : `CM._wonderBoxes = []` est reinitialise en `isoRenderer.js:6893`,
donc `wb && wb.length` est faux. C'est aussi le **seul consommateur** de `wonderAnchor` dans ce fichier
(import l.39, appel l.603).

**Ne pas supprimer** — seulement reecrire le commentaire.

---

#### P12 — `wonderAnchor` a **3** consommateurs, dont un oublie

```js
// renderBuildings.js:12
import { wonderAnchor } from './iso/projection.js';
// renderBuildings.js:593
const anchor = wonderAnchor(idx, L.gridN, L.cx, L.cy);
```

Atteint par l'iso via `isoRenderer.js:23` → `isoRenderer.js:6364` (`drawWonder(it.w, it.wi, now)`). Les
inventaires ne citaient que `cityMapRuntime.js:603` et `isoRenderer.js:5911`.

Et dans `wonderFootWorld`, la const `legacy` (projection.js:134) **n'est pas morte** : elle reste
renvoyee l.137 pour `era_mega` (l'Aiguille garde le centre-bas de tuile, garde-fou teste
`projection.test.js:153-163`).

---

#### P13 — Le bloc legacy est aussi un **repli d'execution**, pas seulement un chemin console

```js
// isoRenderer.js:6855
if (!L) return false;
// isoRenderer.js:6876
return drawIsoWorldInner(dt, now, helpers);
// isoRenderer.js:7349
return true;
```

`drawIsoWorld` renvoie `false` quand `CM.layout` est nul, et le `else` legacy tourne alors — y compris
hors console, sur les frames sans layout, ou `cityMapDrawGround(CM.layout)` peint encore un fond
(renderWorld.js:296 utilise `layout?.counts?.eraBand`, le `?.` prouve que le cas est prevu).

**Geste correct :** poser le garde `if (!CM.layout) { fpEnd(); return; }` **avant** l'appel, pas apres.

---

#### P14 — `grass.png` et `water/water.png` : lectures de script **non gardees**

```js
// scripts/makeGrassEdge.mjs:26 — au niveau module, sans existsSync
const g = PNG.sync.read(fs.readFileSync(GRASS));
// scripts/retintWater.mjs:30 — la garde porte sur ARCHIVE (dossier VIDE), pas sur FILE
if (!fs.existsSync(ARCHIVE)) fs.copyFileSync(FILE, ARCHIVE);
```

Supprimer ces deux PNG fait **jeter** les scripts. Et `makeGrassEdge.mjs` lit aussi
`public/pixelart/roads/` — l'asset classe keep/haut. Verdict : **trim** (retirer les scripts en meme
temps), pas delete sec.

---

#### P15 — Prechargements au **niveau module** dans des fichiers qui **survivent**

Quatre jeux d'assets sont charges au simple import, dans des fichiers conserves :

| Site | Assets |
|---|---|
| `pixelTerrain.js:80` | `ROAD_STAGES` |
| `pixelTerrain.js:91` | `grass.png` |
| `pixelTerrain.js:111` | `streets.png` |
| `renderWorld.js:240` | 7 PNG de `trees/` |

Supprimer un PNG sans retirer sa boucle de prechargement donne **une volee de 404 au boot que rien ne
signale a l'ecran**. Meme mecanique pour `plazas/` : retirer `LEGACY_PROP`/`LEGACY_ERA`
(`isoPlaza.js:174-183`) et les deux `tries.push` (`isoPlaza.js:761-762`) **avant** de toucher aux
fichiers — ou, mieux, ne pas y toucher (voir §6 Q3).

---

#### P16 — `roads/*.png` n'est **plus regenerable**

```js
// scripts/separatePixelTerrain.mjs:14
const SRC = 'public/pixelart/_archive/coupled';
```

Or `public/pixelart/_archive/` est **vide** (0 fichier, verifie). Le seul regenerateur de l'asset le plus
critique de la dimension n'a plus de matiere premiere : **ces 20 fichiers sont irremplacables en l'etat.**
Argument supplementaire pour ne jamais les frôler.

---

#### P17 — Trois molettes du bloc console **ne sont pas legacy**

| Molette | Pourquoi elle reste |
|---|---|
| `__quayWall` (2050) | `quayWallTune` importe par isoRenderer.js:32, cle de bake l.7303 |
| `__waterShore` (2060) | `waterShoreTune` **defini dans** isoRenderer.js:76, lu l.2895 |
| `__pixelBridge` (2061) | Voir P5 |

Balayer le bloc 2041-2064 d'un coup casserait les quais, le bas-fond des rives et le repli de pont plat.

Piege de recherche symetrique : supprimer `__iso` par recherche textuelle emporte
`__isoWalkSpeed` (agents.js:1058), `__isoEngineScenes`, `__isoUnitDepth`, `__sidewalkIso` — **tous
vivants**. Ne supprimer que `window.__iso = (on) => {` (projection.js:35).

---

#### P18 — `main.cjs` : le commentaire `app://` reste **entierement** vrai

```js
// renderBuildings.js:353 — module CONSERVE (isoRenderer.js:23)
fetch("/pixelart/wonders/" + id + "-flames.json").then((r) => {
```

Le fetch de JSON d'asset survit a la mort de `pixelTerrain.js:33`. Les deux raisons du commentaire
restent valides. **Rien a retoucher.**

---

#### P19 — Faux amis documentaires

| Doc | Pourquoi « legacy » ne designe pas le pipeline |
|---|---|
| `docs/PLACES-ISO-COMPOSEES.md` (82, 100, 121, 130, 171, 390, 407, 446) | « legacy » = le **kit d'art** top-down des places, vraiment utilise en repli par `isoPlaza.js:761-762` |
| `docs/reprise-infra-pixel.md` (28, 115) | Repli **procedural d'un sprite** de batiment-moteur absent, vivant dans les deux pipelines |
| `pixelHouses.js:6`, `pixelBuildings.js:5`, `pixelMedian.js:18`, `pixelBridge.js:148` | Idem : « flag off / asset pas pret → procedural » |
| `src/components/**` (40+ occurrences) | `epitaphLegacy` / `EPITAPH_LEGACIES` = legs de testament, mecanique de prestige |

**Les corriger serait une regression documentaire.**

---

#### P20 — Derive des numeros de ligne dans `isoRenderer.js`

Les inventaires ont ete produits sur des arbres legerement differents. Au-dela de la ligne ~4300, les
ancres derivent de +2 a +9 :

| Cite | Reel | Contenu |
|---|---|---|
| 4381 | **4390** | `if (isoBridge3dFlag.on) return;` |
| 4388 | **4397** | `if (withLegacyToIso(ctx, () => drawPixelBridges(CM, now))) {` |
| 4751 / 4807 / 4896 / 4897 | **4753 / 4809 / 4898 / 4899** | mesure d'encre / contour / cache de scene / repli |
| 5905 | **5911** | `wonderFootWorld(...)` |
| 6357 | **6364** | `drawWonder(it.w, it.wi, now)` |
| 6685 | **6692** | `screenDeltaToPan(...)` |
| 6841 / 6848 | **6855** | `if (!L) return false;` |
| 6879 | **6893** | `CM._wonderBoxes = [];` |
| 6984 / 7172 | **6991 / 7179** | `panDeltaToScreen(...)` |

Les ancres **inferieures a ~4300 sont exactes** (1287-1307, 1289, 1290, 1292, 1309, 2622, 2969, 3928,
4596, 5701). **Toujours relire la ligne avant d'editer.**

---

#### P21 — Piege de methode : les worktrees `.claude/`

Un `grep -rn "CM\.iso"` lance depuis la racine ramene **trois arbres de travail paralleles**
(`distracted-wilbur-08307d`, `elegant-liskov-158aaf`, `exciting-mendeleev-5471e0`) avec des numeros de
ligne differents (ex. `agents.js:647/655/894/1192/1207` au lieu de `769/778/1058/1352/1368`).

Ils ne comptent pas : `git ls-files | grep -c worktrees` → 0, et `vite.config.js:76` les exclut de vitest.
**Toutes les recherches de ce chantier doivent etre bornees a `src/`, `docs/`, `scripts/` et la racine.**

---

## 3. Ce qu'on NE touche pas

### 3.1 Racines de `renderWorld.js` importees par l'iso

| Symbole | Consommateur |
|---|---|
| `cityMapDrawQuays` | isoRenderer.js:32 (2 passes `base`/`glow` + branche mode-indefini 7324) |
| `ensureQuayGate` | isoRenderer.js:32/3936, `CM.quayGate` lu isoRenderer.js:3928 |
| `quayWallTune` | isoRenderer.js:32/7303, cityMapRuntime.js:63/2050 (`window.__quayWall`) |
| `updateCrisis` | isoRenderer.js:32 ; publie `CM.riotDraw` (lu 5998, 6121) |
| `drawRiotWeapon` | isoRenderer.js:32 |
| `cityMapCalmRioterAt` | cityMapRuntime.js:62 (hit-test souris) ; publie `CM.calmPoofs` (lu isoRenderer.js:6530) |
| `baseColor` | renderBuildings.js:11 |
| `cmLitColor` | buildingShapes.js:2/99 — **dernier lecteur ; devient mort si buildingShapes part** |
| `cmRiverNormalAt`, `lightenHex`, `cityMapRiotBlocked`, `cityMapPickRiotRoadNear`, `cityMapRiotGroupCenter` | helpers internes des racines ci-dessus |

### 3.2 Etat partage sur `CM`

`CM.groundCanvas`, `CM.gctx`, `CM.quayCanvas`, `CM.qctx`, `CM._bakeMargin`, `CM._isoGroundBake`,
`CM._quayBake`, `CM.lodActive`, `CM.previewWonder`, `CM.born['wonder:*']` (+ la purge l.987),
`CM.riotDraw`, `CM.calmPoofs`, `CM.crispGesture`, `CM.isoPedEdge*`, `CM.isoVehLane*`, `CM.nightF`,
`CM.rainF`/`windX`/`gustF`, `CM.ships`.

Plus les deux helpers **passes a l'iso** : `cityMapBakeMargin`, `cityMapBlitMargin`.

### 3.3 Modules entiers

`layout.js`, `agents.js` (trim seulement), `cityEngineSprites.js`, `engineSceneCache.js`,
`engineSprites.js`, `pixelBuildings.js`, `pixelHouses.js`, `housePalette.js`, `pixelBridge.js`,
`lightLayer.js`, `flameGlow.js`, `glPainter.js`, `framePerf.js`, `riverFleet.js`, `necropolis.js`,
`cityBuildings.js`, `cityNaming.js`, `cityMapBridge.js`, `loadCityMapScripts.js`, `dayNightMode.js`,
`ambianceMode.js`, `qualityMode.js`, `seasonMode.js`, `weatherMode.js`, tout `procedural/` (8 modules),
tout `iso/`.

### 3.4 Interface et build

Aucun composant React ne touche au flag. `qualityMode.js` et `OptionsDialog.jsx` sont deja
pipeline-agnostiques (`lodZoom` → `CM.lodActive` pose **avant** la bascule, l.1631). `package.json`,
`vite.config.js`, `eslint.config.js`, `main.cjs` : **rien a modifier**.

### 3.5 Assets

`public/pixelart/roads/*.png|json` (P4, P16), `houses/`, `water/river-tiles.png`, `iso/**` (hors
`bridge-full-*`), `agents/**` (hors orphelins deja documentes), `wonders/`, `splash/` (150 cles ↔ 150
fichiers, correspondance parfaite), `ui/`, `bridges/`, `plazas/` bench+planter+bush+fountain+flag+amphora,
`grass-ref.*`.

### 3.6 Fichiers en cours de modification

`weatherMode.js` (rafales), `riverFleet.js` (fanal de nuit), `isoPlaza.js` + `isoRenderer.js` (places
composees), `roadWorks.js` / `RoadworksPanel.jsx` (chantiers de voirie). **Ne pas les toucher dans ce
chantier** au-dela des lignes explicitement listees en §2.

---

## 4. Le plan par etapes

> Chaque etape est commitable seule et laisse le jeu jouable. Ordre : du moins risque au plus risque.
> Le lint se lance par **`npm run lint`** (= `eslint .`), jamais `npx eslint src`.
> Les tests par **`npx vitest run`**, jamais avec `2>$null` (la redirection avale l'echec).

---

### Etape 0 — Committer l'existant

- **Objectif** : partir d'un arbre propre. Le `git status` melange trois chantiers en cours (voirie,
  places iso, flotte fluviale) ; sans ce commit, aucun `git revert` ne sera exploitable.
- **Fichiers** : les ~26 modifies + ~15 non suivis du `git status` initial.
- **Diff attendu** : aucun changement de code, seulement la mise sous git de l'existant.
- **Verification** : `npx vitest run` passe ; `npm run lint` propre ; `git status` vide.
- **Effort** : courte.
- **Commit** : `chore(carte): fermer les chantiers en cours avant la coupe du legacy`

---

### Etape 1 — Mesurer la ligne de base

- **Objectif** : avoir les chiffres qui prouveront ensuite qu'on a perdu **exactement** ce qu'on croyait.
- **Fichiers** : aucun.
- **Diff attendu** : aucun (etape de mesure, pas de commit).
- **Verification** :
  - `npx vitest run` → noter le nombre exact de fichiers et de tests passants (attendu ~116 fichiers,
    ~1112 `it`).
  - `npm run build` → noter la taille du bundle JS et du `dist/`.
  - Dans la pane : `await __demoCity({ pop: '1e25' })` puis `__CM.forceFrame()` puis
    `__cityShot({ name: 'avant-coupe' })`.
  - `localStorage.getItem('cmIsoMode')` — **si la valeur est `'0'` sur ce poste, la remettre a `'1'` ou
    la supprimer avant toute suppression partielle** (voir §5).
- **Effort** : courte.
- **Commit** : aucun.

---

### Etape 2 — Orphelins d'assets, independants du chantier

- **Objectif** : sortir ~444 Ko de fichiers morts **avant** de toucher au code, pour que le diff du
  chantier proprement dit ne soit pas noye.
- **Fichiers** : `public/pixelart/agents/vehicles/veh-{barrow,cart}-*.png` (16),
  `public/pixelart/agents/buildings/veh-caravan-{wagon,truck,pod}.png` (3),
  `public/pixelart/iso/bridge-full-*.png` (5), `public/pixelart/_archive/` (vide, a la main).
  Plus les rosters : `scripts/extractVehFrame0.cjs:12` (retirer `cart`, `barrow`),
  `scripts/fetchVehicleAnims.mjs:21/24`, `scripts/fetchCaravanVehAnims.mjs:21-23`,
  `scripts/normalizeIsoScenes.mjs:104-127` (bloc `bridges`), `scripts/isoBatchRoster.json:295`.
- **Diff attendu** : 24 PNG supprimes, 5 scripts elagues de leurs entrees mortes.
- **Verification** : `npm run build` puis charger le jeu et ouvrir la carte — **console reseau vide de
  404**. Aucun test ne lit ces fichiers.
- **Effort** : courte.
- **Commit** : `chore(art): retirer 24 sprites debranches — brouettes, charrettes, caravanes animees, ponts pleins iso`

---

### Etape 3 — Les tests Y-sort : porter avant de jeter

- **Objectif** : ne pas perdre 27 `it` de doctrine ni la seule couverture de `drawVehicleHeadlights`.
- **Fichiers** :
  - **Nouveau** `src/game/map/__tests__/vehicleHeadlights.test.js` : reprendre les 3 `it` de
    `groundSort.test.js:155-175` en appelant `drawVehicleHeadlights(ctx, v)` directement (fonction
    exportee, agents.js:2282), avec le meme `ctx` compteur de `createRadialGradient`. Gating a couvrir :
    `agents.js:1539` (nuit), `:1540` (ere ≥ 14), `:1542` (gare/arrete).
  - `src/game/map/__tests__/isoUnitDepth.test.js` : porter 3-4 regles fortes de `ysortPainter.test.js`
    (« rue entre deux rangs de tours », « longueur de flanc », « `clipOnly` n'occulte jamais »,
    « empreinte multi-tuiles : base = rang SUD »).
- **Diff attendu** : un fichier de test cree, un fichier de test enrichi. **Aucun code de production
  touche.**
- **Verification** : `npx vitest run src/game/map/__tests__/vehicleHeadlights.test.js src/game/map/__tests__/isoUnitDepth.test.js`
  → tout vert. Le total de `it` **augmente** a cette etape.
- **Effort** : moyenne.
- **Commit** : `test(carte): porter les phares et les regles de tri peintre vers le chemin iso`

---

### Etape 4 — La bascule de frame

- **Objectif** : le point de non-retour visuel. **Un commit a lui seul**, pour un `git revert` propre.
- **Fichiers** : `src/game/map/cityMapRuntime.js` uniquement.
  - Supprimer 1739-1884 (le corps du `else`).
  - Reecrire 1737 : garde `if (!CM.layout) { fpEnd(); return; }` **avant**, puis
    `drawIsoWorld(dt, now, { bakeMargin: cityMapBakeMargin, blitMargin: cityMapBlitMargin });` (valeur de
    retour non consommee — P13).
  - Elaguer les imports 42-69 : `renderWorld` → 2 specifieurs, `renderBuildings` → ligne supprimee,
    `agents` → 4 specifieurs, `pixelTerrain` → retirer **le seul `drawPixelTerrain`**, `pixelRiver` →
    ligne supprimee, `pixelBridge` → ligne supprimee.
  - Reecrire les commentaires 1721-1725 et 1734-1736.
- **Diff attendu** : ~200 lignes retirees dans un seul fichier ; le legacy devient inatteignable.
- **Verification** :
  - `npm run lint` propre (c'est la porte qui attrapera un import oublie — **attention, `renderWorld.js`
    commence par `/* eslint-disable */`, mais `cityMapRuntime.js` **non**, donc le lint mord ici).
  - `npx vitest run` : **meme total qu'a l'etape 3** (aucun test n'importe ce bloc).
  - Pane : **full-reload obligatoire** (`renderWorld`/`cityMapRuntime` ne se voient pas en HMR), puis
    `await __demoCity({ pop: '1e25' })`, `__CM.forceFrame()`, `__cityShot({ name: 'apres-bascule' })`.
    Comparer a `avant-coupe`. Verifier a la main : pan, zoom (les deux sens), redimensionnement de la
    fenetre, les 4 paliers de qualite dans les Options.
  - `window.__iso(false)` doit desormais **ne plus rien changer** a l'ecran.
- **Effort** : moyenne.
- **Commit** : `feat(carte): la carte n'a plus qu'un chemin — l'iso peint, le top-down disparait de la frame`

---

### Etape 5 — Vider `renderWorld.js`, en 5 temps

- **Objectif** : 2855 → ~680 lignes. Chaque temps ferme un sous-graphe complet ; `npm run lint` doit
  sortir propre entre deux temps.
- **Fichiers** : `src/game/map/renderWorld.js` (+ `roadDivided.test.js` au temps 4).

| Temps | Contenu | Note |
|---|---|---|
| 5a | Feuilles sans etat publie : `cityMapDrawTrees` + bloc arbres 186-249, `cityMapDrawTerrain` + `CM_TERRAIN`/`cmValueNoise`/`cmIHash2`, `cityMapDrawGround`, `cityMapDrawUrbanMass` + `cmUrbanGroundRgb`/`cmLerpRgb`, `cityMapDrawRiver`, `cityMapDrawHealthTint`, `cityMapDrawNight`, `cityMapDrawCityReflections`. Retirer les 6 molettes `window.__tree*` a la main | ~34 Ko |
| 5b | Bloc places : `cityMapDrawPlazaSurface`, `cityMapDrawPlazaFurniture`, `cityMapDrawFountainWater`, `cityMapDrawPlazas`, `cityMapDrawPlazaTallProps`, `cityMapPlazaBlockedByWonder`. `CM._plazaTall` meurt entier | Rend `plazaProps.js` orphelin |
| 5c | Ponts + lampes : `bridgeStyleFor`, `cityMapDrawBridgeSpan`, `cityMapDrawBridges`, `cityMapDrawBridgeLights`, `cityMapDrawStreetLights`, puis `cityMapDrawCityLights`, **puis** `cmDrawGlow`/`cmGlowSprite`/`CM_GLOW_SPRITES` | Ordre impose : `cityMapDrawCityLights` **avant** `cmGlowSprite` (l.2821 = dernier appel direct) |
| 5d | Routes + le test, **meme commit** : `cityMapDrawRoad`, `cityMapDrawRoadMarkings`, `ensureRoadRuns`, `roadBodyWidth`, `cmRoadMask`, `cmRoadConnects`, `cmRoadPalette`, `getRoadVisualStyle`, `CM.debugRoads`. Et dans `roadDivided.test.js` : retirer l'import l.4, les 2 `describe` renderWorld (58-134, 203-291), le `it` legacy (146-158) ; renommer en `vehicleLane.test.js` | **Seul temps ou un oubli casse la suite de tests plutot que le jeu** |
| 5e | `drawCrisis`, puis le menage d'en-tete (imports 2-25, hooks `setXOnLoad` 27-39, bloc d'export 2829-2855), puis le trim de `CM.quayBankCells` (528-540) | **`/* eslint-disable */` l.1 : menage entierement manuel** |

- **Diff attendu** : ~2 175 lignes / ~114 Ko retirees de `renderWorld.js`.
- **Verification par temps** : `npm run lint` (ne mord pas sur ce fichier — verifier **a la main** qu'aucun
  import n'est orphelin) ; `npx vitest run` vert sauf au temps 5d ou code et test bougent ensemble ;
  full-reload + `__cityShot` apres 5a et apres 5c (les deux temps qui touchent au visuel de nuit).
- **Effort** : longue (5 commits).
- **Commits** :
  - `refactor(carte): renderWorld ne peint plus le sol, les arbres ni le fleuve`
  - `refactor(carte): renderWorld ne peint plus les places`
  - `refactor(carte): renderWorld ne peint plus les ponts ni les lampadaires`
  - `refactor(carte): renderWorld ne peint plus les routes — le marquage double vit desormais en iso`
  - `refactor(carte): renderWorld se reduit aux quais et a la simulation d'emeute`

---

### Etape 6 — Les modules satellites

- **Objectif** : supprimer les 4 modules devenus orphelins, trimmer les 2 autres, demonter le pont
  `buildingShapes`.
- **Fichiers, dans cet ordre imperatif** :
  1. `renderBuildings.js` : trim de `drawTile` + bloc LOD (27-333), imports `buildingById`,
     `CM_INFRA_IDS`, `CM_KNOWLEDGE_IDS`, `drawEngineSprite`/`drawHouseShape`/`BUILDING_HEIGHTS`,
     `pixelHouseReady`/`drawPixelHouse`, `baseColor`, **`cmHash`** ; export reduit a `drawWonder`.
  2. `isoRenderer.js:22` : repointer vers `'../engineSprites.js'` (P8). **Puis** supprimer
     `buildingShapes.js`. Signaler que `cmLitColor` (renderWorld.js:54/2850) perd son dernier lecteur.
  3. `pixelTerrain.js` : trim jusqu'a `drawEraGroundFill` seul + son tileset. **Garder**
     `pixelSidewalkFlag`/`sidewalkTune` (P7 — leur derniere garde de test disparait a l'etape 5d, mais
     `drawEraGroundFill` a besoin de `ensure`/`tilesetForBand` de toute facon). Retirer `ensureGrass`,
     `ensureStreet`, `streetForBand`, `streetCache`, `streetRoadColors`, `sidewalkTone`, `SKIP_SIDEWALK`,
     `drawPixelTerrain`, les flags, `setPixelTileset`, `override`, les imports l.17/18, les
     prechargements l.91/111 et les lignes 43-48 (`.edge.png`).
  4. Supprimer `pixelMedian.js`, `roadPaving.js`, `plazaProps.js`, `pixelRiver.js`.
  5. `agents.js` : supprimer `drawGroundAgents`, `drawCitizens`, `drawVehicles`, `drawShips`,
     `frontByPainter`, `isCitizenInFront`, `isVehicleInFront`, `buildingNorthOf`, `drawOneVehicle`, la
     queue `vehicleLaneTarget` 1369-1391, l'import l.4, les molettes `__ysort`, `__groundSort`,
     `__droneSort`, `__droneSprite`, `__headlightDepth`, `__ysortPainter`/`__ysortEps`, `__boatScale`.
     **Garder `drawVehicleHeadlights`** (P10). Supprimer `groundSort.test.js`, `ysortCorner.test.js`,
     `ysortPainter.test.js` **dans ce commit**.
  6. `cityMapRuntime.js` : molettes `__pixelTerrain`, `__pixelRoads`, `__pixelTileset`, `__pixelWater`,
     `__waterRipples`, callback `setBridgeOnLoad` l.2064. **Garder `__quayWall`, `__waterShore`,
     `__pixelBridge`, `__sidewalk`, `__sidewalkTune`** (P17).
- **Diff attendu** : 4 modules supprimes, 3 trimmes, 3 fichiers de test supprimes, ~10 molettes retirees.
- **Verification** : `npm run lint` propre (mord sur tous ces fichiers) ; `npx vitest run` → **~1068 `it`**
  (le compte prevu) ; full-reload + `__cityShot` ; taper `__pixelWater` dans la console doit rendre
  `undefined`, taper `__quayWall` doit repondre.
- **Effort** : longue (peut se scinder en 2-3 commits : renderBuildings+buildingShapes / pixelTerrain +
  les 4 suppressions / agents + molettes).
- **Commit** : `refactor(carte): quatre modules de peinture top-down disparaissent, le pont buildingShapes est demonte`

---

### Etape 7 — Le flag `CM.iso`

- **Objectif** : effacer la derniere trace du choix de pipeline.
- **Ordre imperatif** — `CM.iso` absent vaut `undefined` vaut `false` : supprimer la definition avant le
  dernier lecteur rallume **tout le legacy en silence, sans une seule erreur**.
  1. **Les lecteurs d'abord.** `agents.js` : 769, 778, 1058, 1352 (retirer `CM.iso && ` en gardant les
     gardes `!= null`, P3). `cityMapRuntime.js` : 314, 321, 393-419 (aplatir, garder le repli 339-344 et
     le bornage de `CM.zoomGoal` l.403).
  2. **`projection.js` fonction par fonction** : 50, 61, 70, 78, 85, 135 (garder la const `legacy` pour
     `era_mega`, P12), 157-160, 181. Plus les commentaires 9-10, 95-96, 152-153.
  3. **Les tests** : `projection.test.js` (supprimer le `describe` 35-60 + les pilotages 16, 18, 63 ;
     **garder** le helper `legacyPlanarAnchor` 27-33) ; retirer `CM.iso = false` de
     `citizenDoorstep.test.js:28`, `bridgePedEdge.test.js:25`, `pedTurnSmooth.test.js:23` ;
     `isoPlaza.test.js:55/60` ; nettoyer l'echafaudage du `it` iso de `vehicleLane.test.js`.
  4. **Le bloc racine en dernier** : `projection.js:25-44` (`isoFlag`, `window.__iso`, lecture/ecriture
     `cmIsoMode`, invalidation des 4 bakes). **Condition de passage : `grep -n "CM\.iso\b" src/` doit
     etre vide.**
  5. Optionnel : un `localStorage.removeItem('cmIsoMode')` one-shot au boot carte, pour ne pas laisser de
     dechet chez les postes qui avaient fait `__iso(false)`.
- **Diff attendu** : ~45 lignes de branches + le bloc de 20 lignes du flag.
- **Verification** :
  - **Rejouer isolement** `npx vitest run src/game/map/__tests__/citizenDoorstep.test.js src/game/map/__tests__/bridgePedEdge.test.js src/game/map/__tests__/pedTurnSmooth.test.js` — c'est la **seule** etape ou
    un seuil numerique peut bouger : la vitesse pietonne passe de ×1 a ×0,72 (agents.js:1058). Les budgets
    sont larges (6000/8000 pas) et les assertions sont des ratios, mais **rejouer, pas relire**.
  - `npx vitest run` complet.
  - `grep -n "CM\.iso\b" src/` → **vide**.
  - Pane : taper `__iso` → `undefined`. Full-reload + `__cityShot`.
- **Effort** : moyenne.
- **Commit** : `feat(carte): plus de bascule de rendu — l'iso est la seule geometrie`

---

### Etape 8 — Les assets liberes

- **Objectif** : sortir les ~510 Ko que le chantier vient de rendre morts, **et leurs prechargements**.
- **Fichiers** : `plazas/anim/` (5), `plazas/lamppost-*` + `plazas/paving-*` (10), `medians/` (5),
  `trees/` (7), `streets*.png` (11), `roads/*.edge.png` (10), `water/{water,reeds-0..2}.png` (4),
  `grass.png`. Plus : `scripts/makeGrassEdge.mjs`, `fetchTrees.mjs`, `fetchMedians.mjs`,
  `retintWater.mjs`, `makeStreetTiles.mjs`, `fetchStreetSurfaces.mjs`. **Garder
  `separatePixelTerrain.mjs`** (P16).
- **Diff attendu** : 52 PNG + 6 scripts retires.
- **Verification** : `npm run build` puis charger le jeu — **console reseau vide de 404**. C'est le seul
  controle qui compte : les prechargements de niveau module ne signalent rien a l'ecran (P15).
- **Effort** : courte.
- **Commit** : `chore(art): retirer les 52 tuiles du terrain top-down et leurs generateurs`

---

### Etape 9 — Documentation

- **Objectif** : que la memoire du projet ne pointe plus un pipeline disparu.
- **Fichiers, par ordre d'importance** :
  1. `REPRISE-chantier-iso.md` — section « Phase 7 — suppression du legacy », datee ; cocher la l.513 ;
     corriger 12-13, 15, 19, 22, 166, 250-254, 340, 349-350, 544-545, 613-614, 630.
  2. `ARCHITECTURE.md` §6 — nommer `iso/isoRenderer.js` et `iso/projection.js` ; corriger « 30 fps ».
  3. `public/pixelart/README.md` — elaguer 3, 27-53, 61-95, 99-101, 219-224 ; corriger 18, 20, 165.
     **Garder 8-23, 103-165, 167-215.**
  4. Audits : `audit-2026-07-lot2.md` (m-11 → **resolu**, date ; n-04 caduc),
     `audit-2026-07-mort.md` (isoFlag l.128/228 ; MORT-02/03 deja appliquees ; DUP-08 change de source de
     verite), `audit-2026-07-SYNTHESE.md` (G-62, G-67, 245).
  5. Ponctuels : `AMELIORATIONS-VISUELLES-QOL.md` (51, 653, 1203), `PERF-CARTE-REPRISE.md` (121),
     `REPRISE-places-pixel.md`, `REPRISE-fleuve-quais.md`, `RETRI-2026-07-27.md:50`,
     `ANIMATION_INDEX.md:8`, `AUDIT-2026-07-21.md` (482 a repointer, 485/562 caducs),
     `roadWidth.test.js:3-4` (commentaire), `.gitignore:68`.
  6. **Ne pas toucher** : `PLACES-ISO-COMPOSEES.md`, `reprise-infra-pixel.md`, `dist/pixelart/README.md`
     (artefact de build).
- **Diff attendu** : documentation seule, zero code.
- **Verification** : relecture. `grep -rn "__iso(" docs/ *.md` ne doit plus rendre que des mentions
  historiques explicitement datees.
- **Effort** : moyenne.
- **Commit** : `docs(carte): acter la fin du top-down — un seul pipeline documente`

---

## 5. Verification et retour arriere

### 5.1 Le protocole a chaque etape

| Controle | Commande | Ce qu'il attrape |
|---|---|---|
| Lint | `npm run lint` | Imports orphelins — **sauf dans `renderWorld.js`** (`/* eslint-disable */` l.1) |
| Tests | `npx vitest run` | Regressions de logique. **Jamais avec `2>$null`** : la redirection avale l'echec |
| Comptage | Total de `it` a chaque etape | Prouve qu'on a perdu **exactement** ce qu'on croyait (~1112 → ~1068) |
| Build | `npm run build` | Erreurs de resolution de module |
| 404 d'assets | Charger le jeu, onglet reseau | **Seul controle des prechargements de niveau module** (P15) |
| Visuel | full-reload + `__demoCity` + `__CM.forceFrame()` + `__cityShot` | Regression de rendu |

### 5.2 Les pieges de verification

- **HMR perime.** Editer `renderWorld.js` ou `cityMapRuntime.js` **ne se voit pas en live**. Toute
  verification visuelle exige un **rechargement complet de la pane** avant `__CM.forceFrame()` puis
  `__cityShot`. Sinon on juge l'ancien module et on croit que la suppression n'a rien casse.
- **`captureFrame` recentre** et force `rainF` a 0 : pour juger le cadrage ou la pluie, passer par
  `forceFrame` + stub de `Date.now`.
- **La pane ne tick pas** dans un onglet cache : sans `__CM.forceFrame()`, la mesure est muette.
- **`localStorage('cmIsoMode')`.** Si ce poste porte `'0'` (un `__iso(false)` reste), toute verification
  visuelle entre les etapes 4 et 7 jugera le mauvais pipeline. **Verifier a l'etape 1.**
- **Le lint ne protege pas `renderWorld.js`.** Le menage d'imports y est entierement manuel.
- **Les acces dynamiques sont invisibles au lint** : molettes `window.__`, cles de chaine, champs `CM.*`.
  Les retirer a la main, ne jamais compter sur eslint.
- **Ne pas chercher depuis la racine** : trois worktrees `.claude/` ramenent des numeros de ligne
  divergents (P21). Borner a `src/`, `docs/`, `scripts/`, racine.

### 5.3 Points de controle visuels obligatoires

Apres l'etape 4 puis apres l'etape 7, verifier **a la main** :

pan (drag), zoom (les deux sens, en verifiant que le sol se **recuit**), redimensionnement de la fenetre,
les 4 paliers de qualite dans les Options, survol d'une merveille **dormante** (P11), survol d'un
batiment-moteur, cycle jour/nuit complet, une averse, un pont, une place, le fleuve avec des bateaux, une
emeute (`__collapse`), et un clic d'apaisement sur un emeutier.

### 5.4 Retour arriere

- **Par etape** : chaque commit est autonome. `git revert <sha>` suffit.
- **Point de non-retour visuel** : l'etape 4. Elle est volontairement seule dans son commit. Si le rendu
  se degrade apres, `git revert` de l'etape 4 restaure la bascule **et** le bloc legacy, puisque le flag
  n'est supprime qu'a l'etape 7.
- **Apres l'etape 7**, le retour arriere demande de reverter 4 **et** 7 ensemble (le legacy sans le flag
  n'est plus atteignable, le flag sans le legacy n'a plus de branche a piloter).
- **Branche dediee** : faire tout le chantier sur `chantier/suppression-legacy` et ne fusionner qu'apres
  l'etape 9. Le projet est sur `main` par defaut : brancher avant l'etape 2.

---

## 6. Questions ouvertes

> A trancher par Raphael **avant** de commencer. Chacune bloque au moins une etape.

**Q1 — `public/pixelart/roads/*.png|json` : les champs irrigues passent-ils encore par
`drawEraGroundFill` en iso ?**
Statiquement, la reference est vivante (`cityEngineSprites.js:2931` ← `isoRenderer.js:24`). Mais l'iso
refuse explicitement les scenes moteur pour les champs (`isoRenderer.js:4844`) et les redessine avec
`drawIsoField` (`isoRenderer.js:6227`). **Indecidable par recherche** : il faut le mesurer a l'encre, en
jeu. Si la branche est morte, `pixelTerrain.js` disparait **en entier** et 177 Ko d'assets partent.
Rappel P16 : ces 20 fichiers **ne sont plus regenerables** (source `_archive/coupled/` vide).
*Bloque l'etape 6.3 et une partie de l'etape 8.*

**Q2 — L'A/B `__isoBridge3d(false)` : on le garde ou on l'assume mort ?**
`isoBridge3dFlag` vaut `{on: true}` par defaut (isoBridge.js:47). Tant qu'il existe,
`pixelBridge.js` + `withLegacyToIso` + `public/pixelart/bridges/` (41 Ko) restent. Ce n'est **pas** le
legacy qui les retient, c'est un A/B interne a l'iso. Le supprimer serait un second chantier, plus petit.
*Ne bloque rien, mais determine si le chantier « un seul chemin » est vraiment fini.*

**Q3 — Le kit `public/pixelart/plazas/` : on garde le repli ?**
`isoPlaza.js:761-762` sonde encore le kit top-down, et `docs/PLACES-ISO-COMPOSEES.md:100/407` le
documente comme repli assume. En pratique aucune recette ne l'emet aujourd'hui (`RECIPES`,
isoPlaza.js:214-257). Trois options : garder tel quel (defaut du plan) ; retirer `LEGACY_PROP`/`LEGACY_ERA`
et les fichiers ; ou garder les fichiers et documenter que le repli est dormant.
*Bloque une partie de l'etape 8.*

**Q4 — `CM.debugRoads` : on re-cree le calque cote iso ?**
C'est le calque de debug des masques N/E/S/W et des types de carrefour (renderWorld.js:1787-1800), pilote
par `__CM.debugRoads = true`. **Aucun equivalent iso.** Le chantier voirie en cours (desserte,
`RoadworksPanel`) pourrait en avoir besoin. Le supprimer sec, ou le porter d'abord ?
*Bloque le temps 5d.*

**Q5 — On renomme `renderWorld.js` ?**
Apres la coupe il ne reste que les quais (15,4 Ko) et la simulation d'emeute (~10 Ko). Le nom ment.
`mapQuaysAndRiot.js` ? `sharedMapPainters.js` ? Un renommage touche 5 imports (isoRenderer.js:32,
renderBuildings.js:11, buildingShapes.js:2 — qui disparait —, pixelRiver.js:35 — qui disparait —,
cityMapRuntime.js:62) plus une dizaine de docs. **A faire dans un commit separe, apres l'etape 9.**

**Q6 — Les generateurs de `scripts/` : memoire de fabrication ou dette ?**
`fetchTrees.mjs`, `fetchMedians.mjs`, `makeGrassEdge.mjs`, `makeStreetTiles.mjs`,
`fetchStreetSurfaces.mjs`, `retintWater.mjs` deviennent orphelins de leurs assets. Ce sont les **recettes
PixelLab** qui ont produit l'art. Les supprimer (defaut du plan, etape 8) perd la memoire de fabrication ;
les garder laisse 6 scripts qui pointent des fichiers absents. Option intermediaire : les deplacer dans
`scripts/_archive/` avec un README d'une ligne.

**Q7 — Les 13 `it` de `ysortPainter.test.js` : combien on porte ?**
Le plan (etape 3) propose 3-4 regles fortes. Le bug « pietons debout sur les toits » est **deja revenu
une fois**. Porter les 13 est plus long mais plus sur. `isoUnitDepth.test.js` couvre le meme probleme avec
une autre geometrie et moins de cas.
*Bloque l'etape 3, donc tout le reste.*

**Q8 — On deplace `master-palette.*`, les deux `README.md` de `pixelart/` et `Asepritelayers/` hors de
`public/` ?**
~60 Ko de fichiers d'auteur servis au client. Le deplacement demande de mettre a jour la constante `PUB`
de `scripts/buildPalette.mjs` et `scripts/remapPalette.mjs:48`, et `package.json:25`
(`!dist/**/Asepritelayers/**`). Hors perimetre strict du chantier — a faire ou a remettre a plus tard,
mais pas a oublier.
