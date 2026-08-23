# Plan de suppression du rendu legacy top-down

> Etat : **✔ CHANTIER CLOS — etapes 2 a 9 executees le 2026-08-23** (bilan en fin de §4). Ecrit le 2026-07-29 apres inventaire par sept sondes et
> contre-verification par sept contradicteurs. Les elements refutes avec preuve citee ont ete corriges ;
> les elements indecidables par recherche statique sont classes **keep** avec une note.
>
> **Relu et re-verifie le 2026-08-22 : le raisonnement tient, les numeros de ligne sont morts.
> LIRE LE §0 AVANT TOUTE CHOSE.**
>
> **Le gain de ce chantier est la MAINTENANCE, pas le poids.** Un seul chemin de rendu, une seule
> geometrie, une seule facon de repondre a « pourquoi la carte fait ca ». Le poids libere est marginal
> (voir §1) et ne doit jamais servir a justifier le chantier.

---

## 0. Etat de la derive — relecture du 2026-08-22

> Relecture integrale et verification contre l'arbre du 2026-08-22, soit **24 jours** apres la redaction.
> Les pieges porteurs ont ete rejoues un par un et resistent. Les ancres, elles, ont derive massivement.
>
> **Regle absolue : ne jamais editer sur la foi d'un numero de ligne de ce document. Re-grepper le
> symbole.** Le plan reste un excellent guide de RAISONNEMENT et une carte PERIMEE.

### 0.1 Derive des tailles

| Fichier / repere | Plan (2026-07-29) | Reel (2026-08-22) | Derive |
|---|---|---|---|
| `iso/isoRenderer.js` | ~7 350 l. | **10 948 l.** | **+49 %** |
| `drawIsoWorld` | l. 6841 | **l. 10427** | +3 586 |
| `cityMapRuntime.js` | 2 117 l. | **2 500 l.** | +383 |
| Bloc `else` legacy | 1739-1884 | **2112-2257** | +373 |
| Bascule `if (CM.iso && drawIsoWorld(` | 1737 | **2110** | +373 |
| `renderWorld.js` | 2 855 l. | **2 939 l.** | +84 |
| Suite de tests | ~116 fichiers / ~1112 `it` | **149 / 1713** | **+54 %** |

### 0.2 Points de controle devenus faux

- **Le comptage « ~1112 → ~1068 `it` » est CADUC** (§2.5, §4 etape 1, §5.1). La vraie ligne de base est
  **149 fichiers / 1713 `it`**, mesuree le 2026-08-22 (`npx vitest run`, 8,8 s, tout vert). Refaire
  l'etape 1 AVANT tout : ce comptage est le seul garde-fou qui prouve qu'on a perdu **exactement** ce
  qu'on croyait.
- **L'inventaire des tests qui pilotent le flag est incomplet : 6 fichiers listes, 9 en realite.** Le plan
  avait predit ce risque (§2.5, `isoPlaza.test.js` : « 4e fichier qui pilote le flag, absent des
  inventaires initiaux. Futur faux vert »). C'est arrive **trois fois de plus** depuis.

| Fichier | Lignes | Statut |
|---|---|---|
| `iso/__tests__/projection.test.js` | 16, 18, 63 | inventorie |
| `iso/__tests__/isoPlaza.test.js` | 75, 80 | inventorie |
| `__tests__/citizenDoorstep.test.js` | 28 | inventorie |
| `__tests__/bridgePedEdge.test.js` | 34 | inventorie |
| `__tests__/pedTurnSmooth.test.js` | 23 | inventorie |
| `__tests__/roadDivided.test.js` | 149, 157, 163, 167 | inventorie |
| `__tests__/riverLife.test.js` | 32-33 | **NOUVEAU** (2026-07-30) — pilote aussi `isoFlag`, voir **P22** |
| `__tests__/bridgeWalkBand.test.js` | 27, 73 | **NOUVEAU** (2026-08-05) |
| `__tests__/bridgeBury.test.js` | 26, 41 | **NOUVEAU** (non suivi par git) |

### 0.3 Table de re-ancrage

Ancres verifiees le 2026-08-22. **A re-verifier a nouveau avant chaque seance** : `isoRenderer.js` a pris
+49 % en 24 jours, rien ne dit que ca s'arrete.

| Repere | Plan | Reel 2026-08-22 |
|---|---|---|
| `cityMapRuntime` — bascule `if (CM.iso && drawIsoWorld(` | 1737 | **2110** |
| `cityMapRuntime` — corps du `else` | 1739-1884 | **2112-2257** |
| `cityMapRuntime` — `} // fin du pipeline legacy` | 1884 | **2257** |
| `cityMapRuntime` — imports a elaguer | 42-69 | **68-73** |
| `cityMapRuntime` — lectures de `CM.iso` | 314, 321, 393, 1737 | **330, 337, 411, 2110** |
| `agents.js` — pedEdge / spread / isoK / lane / retour anticipe | 769, 778, 1058, 1352, 1368 | **847, 856, 1164, 1481, 1497** |
| `projection.js` — branches legacy | 50, 61, 70, 78, 85, 135, 181 | **96, 107, 116, 124, 131, 181, 227** |
| `projection.js` — bloc racine du flag | 25-44 | **26-44** |
| `isoRenderer` — `import { drawEngineSprite }` (P8) | 22 | **23** |
| `isoRenderer` — `drawPixelBridges(CM, now)` (P5) | 4397 | **7290** |
| `isoRenderer` — `if (!L) return false` (P13) | 6855 | **10429** |
| `isoRenderer` — `CM._wonderBoxes = []` (P11) | 6893 | **10467** |
| `isoRenderer` — `cityMapDrawQuays(now)` (P6) | 7324 | **10921** |
| `renderWorld` — `cityMapDrawTrees` | 884 | **968** |
| `renderWorld` — `cityMapDrawRoad` | 1619 | **1703** |
| `renderWorld` — `drawCrisis` | 2594 | **2678** |
| `renderWorld` — `cityMapDrawCityLights` | 2742 | **2826** |
| `renderWorld` — `quayWallTune` | 543-548 | **638** |
| `cityEngineSprites` — appel `drawEraGroundFill` (P4) | 2931 | **3297** |

### 0.4 Ce qui a ete REJOUE et tient toujours

Inutile de re-verifier ces points a la prochaine seance : ils ont ete controles sur l'arbre du 2026-08-22.

| Point | Verdict 2026-08-22 |
|---|---|
| **P4** — `drawEraGroundFill` atteint par l'iso | tient — `cityEngineSprites.js:3297` |
| **P5** — `drawPixelBridges` appele en iso | tient — `isoRenderer.js:7290` |
| **P8** — `buildingShapes.js` est un pont, pas un mort | tient — import l.23, re-export `buildingShapes.js:335` |
| **P13** — `drawIsoWorld` renvoie `false` sans layout | tient — `isoRenderer.js:10429` |
| **§2.4** — graphe d'import des 4 modules a supprimer | tient, **exact au symbole pres**, aucun nouvel importeur |

### 0.5 Etape 0 : l'arbre est presque propre

Le plan partait d'un `git status` melant trois chantiers (voirie, places iso, flotte fluviale). Ce n'est
plus le cas. Au 2026-08-22 il ne reste **qu'un** chantier en vol — le **pont** (`iso/isoBridge.js` modifie,
`__tests__/bridgeBury.test.js` non suivi) — plus quelques fichiers non suivis hors code
(`aseprite-pont/*.png`, `scene-family.png`, `scripts/zipDist.mjs`).

**L'etape 0 est devenue courte : fermer le chantier pont, et commencer.**

### 0.6 Etat des questions du §6

- **Q7 — TRANCHEE le 2026-08-22 par Raphael : on porte LES 13. → ETAPE 3 FAITE le meme jour.**
  11 des 13 regles etaient deja couvertes par `isoUnitDepth.test.js` ; les 2 manquantes sont ecrites, et
  les 3 `it` de phares sont portes dans un `vehicleHeadlights.test.js` neuf (6 `it`, les 4 gardes).
  Suite : **151 fichiers / 1728 `it`**, tout vert. **Prochaine etape : 2, puis 4.**
- **Q1** (les champs passent-ils encore par `drawEraGroundFill` en iso) : **encore ouverte**, bloque
  l'etape 6.3 et une partie de l'etape 8.
- **Q2 a Q6, Q8** : encore ouvertes, ne bloquent rien.
- **Q9 — TRANCHEE le 2026-08-22 par la mesure** (sonde `__depthProbe` + force brute) : l'aveuglement a la
  hauteur ne fausse pas le tri. Option 3, ne pas toucher aux fiches (P23).
- **Q10** (decoupage d'`isoRenderer.js`), **Q11** (la passe fantome redessine 86-87 % des unites) et
  **Q12** (le departage d'egalite d'`isoUnitDepthEx`) : **ajoutees le 2026-08-22**, toutes trois **hors
  perimetre** de ce chantier.

### 0.7 Ce que la derive dit du chantier lui-meme

`isoRenderer.js` a pris **+3 600 lignes en 24 jours**. La coupe du legacy donne un seul chemin de rendu —
elle ne touche pas au fichier-dieu, qui grossit plus vite que tout le reste de la carte reunie. Le
chantier reste la bonne premiere etape ; **le decoupage d'`isoRenderer.js` reste a faire derriere**, et
plus on attend, plus il coute. Verse au §6 comme **Q10**.

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
| Deja orphelin, independant du chantier — **SORTI le 2026-08-23, etape 2** | `agents/vehicles/veh-{barrow,cart}-*` (16), `iso/bridge-full-*` (5), `agents/buildings/veh-caravan-{wagon,truck,pod}` (3). ⚠ **`_archive/` RETIRE de cette liste : plus vide, et non suivi par git** (P16) | **476 000 mesures** |
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

### 2.1 `src/game/map/renderWorld.js` (~~2855~~ **2939** lignes au 2026-08-22)

> Lignes derivees de **~+84**. Quelques ancres re-verifiees en §0.3 ; re-grepper les autres.

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

### 2.2 `src/game/map/cityMapRuntime.js` (~~2117~~ **2500** lignes au 2026-08-22)

> Toutes les lignes de ce tableau ont derive de **~+373**. Re-anchor en §0.3.

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
| cityMapRuntime.js | Lectures de `CM.iso` | ~~314, 321, 393, 1737~~ → **330, 337, 411, 2110** | delete | bas | Condition de sortie **corrigee (P22)** : `grep -rn "CM\.iso\b\|isoFlag" src/` ne doit plus rendre que projection.js, avant de toucher a son bloc racine |

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

> **CADUC au 2026-08-22 (§0.2).** La suite est passee a **149 fichiers / 1713 `it`**. Le delta de ~44 `it`
> reste plausible (les fichiers vises n'ont pas bouge), mais **les totaux sont faux** : re-mesurer la
> ligne de base avant de commencer, et recalculer la cible a partir de la mesure fraiche.

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
| `public/pixelart/_archive/` | ~~delete~~ → **KEEP** | ~~bas~~ **HAUT** | ⚠⚠ **CORRIGE le 2026-08-23 : le dossier N'EST PLUS VIDE.** 33 entrees, dont `coupled/` (20 fichiers). Il est **non suivi par git** — le supprimer serait **IRRECUPERABLE**. C'est la source de `separatePixelTerrain.mjs`, donc de `roads/*.png`. **NE PAS Y TOUCHER.** Voir P16 corrige |
| `scripts/makeStreetTiles.mjs`, `fetchStreetSurfaces.mjs` | delete | bas | Deja inoperants (`_streets_src/` n'existe plus) |
| `scripts/makeGrassEdge.mjs`, `fetchTrees.mjs`, `fetchMedians.mjs`, `retintWater.mjs` | trim | bas | Generateurs orphelins de leurs assets. Voir §6 Q6 |
| `scripts/separatePixelTerrain.mjs` | **keep** | moyen | Seul regenerateur de `roads/<band>.png` (asset keep/haut). ~~Sa source `_archive/coupled/` est vide : ces 20 fichiers sont irremplacables~~ → **FAUX depuis le 2026-08-23 : `coupled/` contient de nouveau 20 fichiers**, `roads/*.png` est donc REGENERABLE. Voir P16 corrige |

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

#### P16 — ~~`roads/*.png` n'est plus regenerable~~ → **CORRIGE : il l'est de nouveau, et `_archive/` est devenu INTOUCHABLE**

> **Re-mesure du 2026-08-23, a l'ouverture de l'etape 2. Ce piege s'est INVERSE.**

```js
// scripts/separatePixelTerrain.mjs:14
const SRC = 'public/pixelart/_archive/coupled';
```

~~Or `public/pixelart/_archive/` est **vide** (0 fichier, verifie). Le seul regenerateur de l'asset le
plus critique de la dimension n'a plus de matiere premiere : **ces 20 fichiers sont irremplacables en
l'etat.** Argument supplementaire pour ne jamais les froler.~~

**FAUX aujourd'hui.** `public/pixelart/_archive/` contient **33 entrees**, dont **`coupled/` avec ses 20
fichiers**. Deux consequences opposees :

1. **`roads/*.png` EST regenerable.** L'argument « irremplacable » qui interdisait d'y toucher **tombe**.
   A reporter dans **Q1**, dont c'etait le principal frein.
2. **⚠⚠ `_archive/` DEVIENT INTOUCHABLE.** L'etape 2 dit de le supprimer « (vide, a la main) ». **NE PAS
   LE FAIRE** : le dossier est **non suivi par git** (`git ls-files` → 0), donc une suppression serait
   **definitive, sans recours**. C'est la matiere premiere de l'asset le plus critique de la carte.

**Lecon de methode.** Un piege ecrit « ce dossier est vide » est une **mesure**, pas un fait. Une mesure
se re-fait. Celle-ci s'est inversee en 25 jours, et la suivre a la lettre aurait detruit 20 fichiers
irrecuperables.

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

> **Mise a jour 2026-08-22 : cette section est desormais tres en dessous de la realite.** La derive n'est
> plus de +2 a +9 lignes, elle depasse **+3 500**. `isoRenderer.js` est passe de ~7 350 a **10 948
> lignes** (+49 %) et `drawIsoWorld` de 6841 a **10427**. Les ancres « inferieures a ~4300 » ne sont plus
> exactes non plus (l'import de P8 est passe de 22 a 23). **Aucune ancre de ce document n'est fiable.**
> Table de re-ancrage en **§0.3**. Le tableau ci-dessous n'a plus qu'une valeur historique.

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

> **Mise a jour 2026-08-22 : les trois worktrees nommes ici n'existent plus, il y en a CINQ autres.**
> `hungry-elion-3915d3`, `mystifying-faraday-f6bcfe`, `nifty-sutherland-efaff9`, `quizzical-payne-f6808f`,
> `serene-satoshi-33e13c` — chacun avec sa copie de `isoRenderer.js`, `cityMapRuntime.js`, `layout.js`,
> a des tailles toutes differentes (de 1 604 a 3 755 lignes pour `isoRenderer.js`). Le nom des worktrees
> change a chaque seance : **ne jamais les lister en dur, toujours borner la recherche.** La consigne
> ci-dessous est inchangee et plus importante que jamais.

Un `grep -rn "CM\.iso"` lance depuis la racine ramene **trois arbres de travail paralleles**
(`distracted-wilbur-08307d`, `elegant-liskov-158aaf`, `exciting-mendeleev-5471e0`) avec des numeros de
ligne differents (ex. `agents.js:647/655/894/1192/1207` au lieu de `769/778/1058/1352/1368`).

Ils ne comptent pas : `git ls-files | grep -c worktrees` → 0, et `vite.config.js:76` les exclut de vitest.
**Toutes les recherches de ce chantier doivent etre bornees a `src/`, `docs/`, `scripts/` et la racine.**

---

#### P22 — `isoFlag` a deux lecteurs de PRODUCTION que la condition de passage de l'etape 7 ne voit pas

> Piege **ajoute le 2026-08-22**. Il n'existait pas a la redaction du plan. C'est le seul piege neuf de la
> relecture — les 21 autres tiennent.

```js
// pixelHouses.js:17   — module classe **keep** par le plan (« coeur du rendu iso des habitations »)
import { isoFlag } from './iso/projection.js';
// pixelHouses.js:242  — unite honnete des lots 1x2
const spanY = isoFlag.on ? (t.spanY || span) : span;
// pixelHouses.js:339
const shape = isoFlag.on ? (2 * sx) / (sx + sy) : 1;
```

Introduit le 2026-08-04 par `feat(grain): G1 — l'unite honnete des lots 1x2`, **six jours apres** la
redaction du plan.

L'etape 7.4 supprime `projection.js:26-44`, donc `isoFlag`, sous la condition de passage
**« `grep -n "CM\.iso\b" src/` doit etre vide »**. Cette condition **passe au vert** alors que `isoFlag` a
encore deux lecteurs de production et un import vivant : la suppression casserait l'import de
`pixelHouses.js:17`. Le lint l'attraperait — mais seulement apres coup, et le plan presente cette
condition comme le **feu vert** de l'etape la plus risquee.

S'y ajoute `riverLife.test.js:4` qui importe `isoFlag` et le pilote (l.31-33).

**Geste correct.** La condition de passage de l'etape 7.4 devient :

```
grep -rn "CM\.iso\b\|isoFlag" src/
```

et ne doit plus rendre que la definition dans `projection.js`. Traiter les trois lecteurs **d'abord** :
`pixelHouses.js` 242 et 339 (les branches `: span` et `: 1` sont la geometrie legacy — les aplatir), puis
`riverLife.test.js`.

**Lecon de methode :** la condition de passage d'une etape ne doit pas nommer **un** symbole quand le
bloc supprime en exporte **trois** (`isoFlag`, `window.__iso`, `CM.iso`). Verifier chaque export du bloc,
pas seulement le plus visible.

---

#### P23 — `isoUnitDepth` est AVEUGLE A LA HAUTEUR : une regle legacy n'est pas portable en l'etat

> Trouve le 2026-08-22 en cartographiant Q7. **MESURE le meme jour — verdict ci-dessous.**
>
> **VERDICT EN TROIS TEMPS :**
> 1. **L'aveuglement a la hauteur ne fausse PAS le tri** — la hauteur n'entre jamais dans le verdict.
>    Le soupcon initial est clos, avec preuve. **Ne pas le rejouer.**
> 2. **Un plafond peut malgre tout ecraser une remontee**, pour une raison sans rapport : un **departage
>    d'egalite** quand lifteur et plafonneur ont la meme cle. Reel mais minuscule (0,01 % des geometries,
>    0 en jeu), **fige par un test**. Verse en **Q12**.
> 3. **La vraie trouvaille est ailleurs** : la passe **fantome** redessine **86-87 % des unites** a chaque
>    frame. Verse en **Q11**. Detail en fin de section.
>
> ⚠ Cette fiche a d'abord conclu « cas inatteignable ». **C'etait faux** — le tirage aleatoire ratait la
> bande de declenchement. Le contre-exemple et le piege de methode sont conserves ci-dessous : ils valent
> plus que la conclusion.

Le legacy pesait la **hauteur** du sprite occulteur :

```js
// ysortPainter.test.js:56 — « tour au sud TROP BASSE pour recouvrir la rue »
setInfo(tower(8, 7), tower(8, 9, 1.0));   // hutte d'1 tuile au sud
expect(frontByPainter(...feet(8, 8))).toBe(true);   // -> elle n'occulte PAS
```

Les fiches legacy portaient `topY` (haut du sprite). **Les fiches iso ne portent que `ax`, `halfW`,
`key`, `x1`, `y1` — aucune hauteur.** `isoUnitDepth` ne peut donc pas rejouer cette regle.

**Ce n'est pas forcement inoffensif.** Le `cap` est un **minimum global** sur toutes les fiches :

```js
// isoRenderer.js — isoUnitDepthEx
} else if (b.key - T * 0.02 < cap) { cap = b.key - T * 0.02; }
...
const out = lift < cap ? lift : cap;
_depthOut.hidden = cap < Infinity;
```

Un batiment **bas** au sud-est de l'unite pose un `cap` **quelle que soit sa hauteur**. Si l'unite devait
par ailleurs se **lever** au-dessus d'une facade voisine (`lift`), le `cap` du batiment bas peut
**annuler cette remontee** : l'unite retombe sous la cle de la facade et **se fait avaler par un mur qui,
lui, la recouvre vraiment** — alors que la fiche qui a declenche le `cap` ne la cache pas du tout.

Second effet : `hidden` passe a `true` des qu'un `cap` existe. Une unite peut donc etre **declaree
occultee**, et re-dessinee en silhouette fantome, sans que rien ne la cache.

**Rapprochement a faire** (non verifie) : le balayage des fantomes du 2026-08-03 relevait **10-19 % de
conflits lift/cap** a toutes les eres. L'aveuglement a la hauteur en est un suspect plausible.

**Ce que ce piege ne dit PAS.** Il ne dit pas qu'il y a un bug visible : un `cap` superflu n'a d'effet que
si un `lift` concurrent existait, et le rendu iso n'a pas la meme geometrie de recouvrement que le
top-down. **Il faut le mesurer avant d'y toucher.**

### La mesure (2026-08-22) — option 1 executee

**En jeu**, sonde `__depthProbe` (isoRenderer.js, opt-in, cout nul eteinte), vraie ville `__demoCity`,
foule normale, habitants a la cible pleine :

| Ere | Evaluations | `lift` | `cap` (= fantome) | Conflits lift+cap | **`suppressed`** |
|---|---|---|---|---|---|
| 11 | 244 | 37 | 196 | 33 | **0** |
| 23 | 2 312 | 631 | 1 992 (86,2 %) | 557 | **0** |
| 161 | 852 | 231 | 745 (87,4 %) | 183 | **0** |

**Par force brute sur la vraie fonction** (`isoUnitDepth` importee, comparaison « les deux batiments »
contre « le meilleur des deux solos » — une remontee ecrasee se voit sans instrumentation) :

| Echantillonnage | Cas legaux | Remontees | **Suppressions** |
|---|---|---|---|
| Aleatoire, position continue (emprises 1×1 a 6×6) | 866 418 | 37 420 | **0** |
| **Grille reguliere calee pres des faces** (emprises 1×1 a 3×3) | **19 557** | — | **2 (0,01 %)** |

> ⚠⚠ **DEUX PIEGES DE MESURE, chacun a coute une conclusion fausse.**
>
> **(1) Rejeter les chevauchements.** Le premier jet, sans contrainte de disjonction, trouvait 382
> suppressions sur 400 000 tirages — **toutes** dues a des emprises qui **se chevauchent**. Ca n'existe
> pas en ville, et dans `isoUnitFiches` la seconde fiche **ecrase** la premiere dans la Map : la
> geometrie testee n'etait meme pas celle qu'on croyait.
>
> **(2) Le tirage ALEATOIRE a position continue RATE le vrai cas.** 866 418 tirages, zero trouvaille —
> d'ou une premiere conclusion « inatteignable » qui etait **fausse**. La remontee ne se declenche qu'en
> **longeant une face**, bande etroite que le hasard visite peu. C'est une **grille reguliere**, calee a
> 0,35 tuile des faces, qui a leve les 2 cas. **Pour sonder un comportement de face, echantillonner la
> face, pas le volume.**

**Ce que les 2 cas sont — et ce qu'ils ne sont pas.** Ils n'ont **rien a voir avec la hauteur**. Les deux
ont le **meme cle peintre** pour le lifteur et le plafonneur : `lift = cle + T·0.02` contre
`cap = cle − T·0.02`, le plafond gagne de **2·epsilon**, et l'unite bascule de « juste apres les deux
batiments » a « juste avant les deux » — elle se fait avaler par le mur qu'elle longeait. C'est un
**departage d'egalite**, pas un defaut de tri. Perte mesuree : exactement 0,04 tuile, dans les 2 cas.
Zero occurrence en jeu sur 3 468 evaluations.

**Conclusion Q9 : option 3, avec une reserve nommee.**
- La regle de HAUTEUR n'est **pas portable** et n'a **pas besoin de l'etre** : la hauteur n'entre jamais
  dans le verdict. **Ne pas ajouter la hauteur aux fiches.**
- Le departage d'egalite est un **defaut reel mais minuscule** (0,01 % des geometries, 0 en jeu). Il est
  **fige par un test** — `isoUnitDepth.test.js`, « un plafond ne coute qu'un departage d'egalite, jamais
  un rang » : toute perte plus grande, ou a cles differentes, echoue. Le corriger est une **decision de
  rendu** (Raph), pas une consequence de ce chantier : verse en **Q12**.

### Ce que la mesure a trouve a la place — la passe FANTOME redessine presque tout

`hidden` vaut vrai des qu'un `cap` existe, **sans egard a la hauteur de l'occulteur**. Or la passe
fantome ne verifie rien :

```js
// isoRenderer.js — SILHOUETTES FANTOMES
for (const it of items) {
  if (!it.ghost) continue;
  if (it.kind === 'cit') drawIsoCitizenItem(ctx, it.p, now, z);
  ...
}
```

**86 a 87 % des unites sont donc dessinees DEUX FOIS par frame** — a l'ere 23, ~1 992 redessins
supplementaires. Sur une carte dont la campagne perf a etabli que **le cout est le trace, jamais le JS**,
c'est un poste reel. Et une unite que rien ne cache recoit une copie translucide **pile sur elle-meme**.

C'est **le vrai debouche** de l'aveuglement a la hauteur : il ne casse pas le tri, il fait redessiner
6 unites sur 7. **Chantier distinct, hors perimetre de la suppression du legacy** — a ouvrir a part, et a
rapprocher du reglage d'alpha des fantomes deja en cours cote Raph.

---

#### P24 — ⚠⚠ `cityMapRuntime.js` EST `/* eslint-disable */` : la porte de l'etape 4 N'EXISTE PAS

> Trouve le 2026-08-23 en executant l'etape 4. **Ce plan affirme l'inverse, noir sur blanc.**

L'etape 4 dit : « `npm run lint` propre (c'est **la porte qui attrapera un import oublie** — attention,
`renderWorld.js` commence par `/* eslint-disable */`, mais `cityMapRuntime.js` **non**, donc le lint mord
ici) ».

**FAUX.** `cityMapRuntime.js` **ligne 1** :

```js
/* eslint-disable */
```

**Verifie par mutation, deux fois :**

| Mutation | Attendu si le lint mordait | Reel |
|---|---|---|
| Retirer `cityMapCalmRioterAt` de l'import, en gardant son appel l.977 | erreur `no-undef` | **rien** |
| Ajouter `const x = zzzTotalementIndefini + 1;` | erreur `no-undef` | **rien** |

`npm run build` ne l'attrape pas non plus (le bundle se construit, la `ReferenceError` n'arriverait qu'a
l'execution de la ligne fautive — c'est-a-dire au clic, au survol, ou jamais).

**Consequence : l'etape 4 n'a AUCUNE porte automatique.** Ce qui a tenu lieu de garde-fou :

1. **Une analyse mesuree, symbole par symbole**, avec les **commentaires blanchis** — sans ca, une
   mention en prose fait passer un symbole mort pour vivant (⚠ **7 faux positifs** au premier jet :
   `cityMapDrawBridges`, `cityMapDrawPlazas`, `drawTile`, `drawWonder`, `drawCitizens`, `drawShips`…).
2. **Un controle croise apres coupe** : aucun import mort (importe, jamais utilise) **et** aucun import
   manquant (utilise, plus importe).
3. **Le jeu lance**, seul juge reel : chaque symbole conserve exerce depuis la page.

**A refaire a l'identique pour l'etape 5** : `renderWorld.js` porte le meme `/* eslint-disable */`, et le
plan le sait pour celui-la. **Ne jamais ecrire « le lint est propre donc la coupe est bonne » sur ces deux
fichiers.**

---

#### P25 — Entre les etapes 4 et 7, `__iso(false)` donne un rendu HYBRIDE, pas le legacy

> Trouve le 2026-08-23. L'etape 4 annonce que `window.__iso(false)` « doit desormais **ne plus rien
> changer** a l'ecran ». **C'est faux, et ce ne sera vrai qu'apres l'etape 7.**

La bascule de frame ne lit plus `CM.iso` — mais **`projection.js` le lit toujours** (`worldToScreen`,
`screenToWorld`, `panDeltaToScreen`, `screenDeltaToPan`, `depthOf`, `wonderFootWorld`,
`visibleDiamondBounds`). Donc `__iso(false)` fait tourner **le peintre iso a travers la projection
planaire** : mesure, l'ecran change bel et bien.

Gravite **faible** : le canvas reste peint a 100 %, ce n'est pas un ecran noir, et la molette est
dev-only (aucune UI ne l'expose). Mais :

**⚠ Un poste qui porte `localStorage.cmIsoMode = '0'` verra une carte de travers entre les etapes 4 et 7**
— la ou, avant l'etape 4, il voyait le legacy fonctionner. Le §5.2 disait « jugera le mauvais pipeline » ;
c'est desormais « jugera un pipeline hybride ». **Verifier `localStorage.getItem('cmIsoMode')` avant toute
seance**, et le remettre a `'1'` ou le supprimer.

Le nettoyage one-shot propose en option a l'etape 7.5 (`localStorage.removeItem('cmIsoMode')`) **gagne a
etre avance** si la periode 4→7 doit durer.

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
  > **Mise a jour 2026-08-22 (§0.5) : ces trois chantiers sont fermes.** Il ne reste qu'**un** chantier en
  > vol, le **pont** (`iso/isoBridge.js` modifie, `__tests__/bridgeBury.test.js` non suivi), plus des
  > fichiers non suivis hors code. **L'etape est devenue courte.**
- **Fichiers** : ~~les ~26 modifies + ~15 non suivis du `git status` initial~~ → au 2026-08-22 :
  `iso/isoBridge.js`, `__tests__/bridgeBury.test.js`, et le hors-code (`aseprite-pont/*.png`,
  `scene-family.png`, `scripts/zipDist.mjs`).
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
  - `npx vitest run` → noter le nombre exact de fichiers et de tests passants. ~~attendu ~116 fichiers,
    ~1112 `it`~~ → **au 2026-08-22 : 149 fichiers / 1713 `it`, tout vert en 8,8 s** (§0.2). Ce chiffre
    bouge vite : c'est une mesure a refaire, pas une valeur a recopier.
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

> ## ✔ ETAPE 2 FAITE — 2026-08-23
>
> **24 PNG sortis** (476 Ko), tous suivis par git donc **recuperables** : brouettes (8), charrettes (8),
> caravanes animees (3), ponts complets iso (5).
>
> **Orphelinat RE-VERIFIE avant de couper**, et pas seulement au grep de nom de fichier : les chemins
> sont **construits par template** (`'/pixelart/agents/vehicles/veh-' + type + …`, agents.js), donc un
> `grep "veh-cart"` ne peut pas les voir. Controle sur les **types nus** : `'cart'` et `'barrow'`
> n'existent **nulle part** dans `src/`. Confirme a l'execution — sur 4 eres basses, le seul type de
> vehicule emis est `basket`.
>
> **Rosters elagues** : `extractVehFrame0.cjs` (TYPES), `fetchVehicleAnims.mjs` (cart + barrow),
> `normalizeIsoScenes.mjs` (**tout le mode `bridges`**, son en-tete et ses deux helpers devenus morts —
> `flipX`, `rotate`, attrapes par le lint), `isoBatchRoster.json` (bloc `bridgesFull` → note de retrait).
>
> **⚠ DEUX ECARTS ASSUMES, chacun motive :**
> 1. **`_archive/` N'A PAS ETE SUPPRIME.** Le plan le croyait vide ; il contient 33 entrees dont
>    `coupled/` (20 fichiers), **non suivies par git**. Le supprimer aurait ete definitif. Voir **P16**,
>    qui s'est inverse.
> 2. **`fetchCaravanVehAnims.mjs` laisse INTACT.** Ses 3 entrees sont la totalite de son contenu :
>    les retirer en aurait fait une coquille vide qui ne fait rien — pire que le garder ou le supprimer.
>    Verse tel quel a **Q6** (memoire de fabrication vs dette), qui tranchera le sort du script entier.
>
> `scripts/data/sprite-inventory.json` porte encore 3 cles `veh-caravan-*` : fichier **genere**
> (`spriteScaleAudit.mjs inventory`, « ne pas editer a la main »), il se remettra a jour tout seul.
>
> **Verification** : build OK ; jeu charge et carte exercee sur **6 eres** (0, 4, 9, 16, 23, 69) ;
> **250 ressources reseau, ZERO requete vers un sprite supprime, zero image non decodee, console vide**.
> 152 fichiers / 1734 `it` verts, lint revenu a sa seule erreur preexistante.
>
> **Prochaine etape : 4, la bascule de frame** — le point de non-retour. Re-ancrer d'abord (§0.3).

---

### Etape 3 — Les tests Y-sort : porter avant de jeter

- **Objectif** : ne pas perdre 27 `it` de doctrine ni la seule couverture de `drawVehicleHeadlights`.
- **Fichiers** :
  - **Nouveau** `src/game/map/__tests__/vehicleHeadlights.test.js` — **ECRIT le 2026-08-22, 6 `it`.**
    Les 3 `it` de `groundSort.test.js` (l. **156-164**, pas 155-175) sont repris en appelant
    `drawVehicleHeadlights(ctx, v)` **directement** — la fonction est exportee (`agents.js:2414`, pas
    2282) et vit aussi dans le chemin iso, donc la couverture survit a la coupe.
    **Les QUATRE gardes du bloc d'entree sont couvertes une par une** (`agents.js` **1668** nuit,
    **1669** ere ≥ 14, **1670** `MOTOR_TYPES`, **1671** gare/arrete) — l'appel direct a permis d'aller
    au-dela des 3 `it` d'origine, qui tournaient **tous a l'ere 16** : la garde d'ERE, pourtant nommee
    par ce plan, n'etait **jamais exercee**. Idem pour `MOTOR_TYPES` et pour la moitie `parkT` de la
    garde d'arret.
    Chaque `it` assert dans **les deux sens** (un cas allume, un cas eteint) : aucun ne peut passer au
    vert par vacuite. **Verifie par mutation** : neutraliser la garde d'ere fait tomber l'`it` d'ere, et
    lui seul.
    ⚠ Ce fichier ne touche **pas** a `CM.iso` — inutile d'ajouter un 10e pilote du drapeau (§0.2).
  - `src/game/map/__tests__/isoUnitDepth.test.js` : ~~porter 3-4 regles fortes~~ → **Q7 tranchee le
    2026-08-22 : LES 13.** Cartographie faite le meme jour — **11 des 13 sont deja couvertes**, il reste
    **2 regles** a ecrire. Table ci-dessous.

**Cartographie des 13 `it` legacy vers le contrat iso** (verifiee le 2026-08-22)

Les deux fonctions n'ont pas le meme contrat : `frontByPainter` rend un booleen (devant / derriere /
`null`), `isoUnitDepth` rend une **cle de profondeur**. Porter = transposer la regle, pas copier l'assert.

| # | `it` legacy — `frontByPainter` (10) | Couverture iso existante | Action |
|---|---|---|---|
| 1 | sans `buildingInfo` → `null` | `sans layout : somme brute (repli sur)` | rien |
| 2 | tour PILE au nord → devant | `unite sur la route SUD d'une tour 1x2` | rien |
| 3 | **RUE ENTRE DEUX RANGS DE TOURS → derriere** | `conflit devant B1 / derriere B2 : la remontee PLAFONNE` — meme doctrine, **geometrie differente** (B1 large au nord, B2 1x1 au sud) | **ECRIT le 2026-08-22** : `« RUE ENTRE DEUX RANGS DE TOURS : l'unite reste sous la cle de la tour sud »`, geometrie d'origine (tours en 8,7 et 8,9, unite en 8,8 — celle du legacy) |
| 4 | **tour au sud TROP BASSE pour recouvrir la rue → devant** | **AUCUNE** — `isoUnitDepth` ne lit pas la hauteur | **TRANCHE (Q9) + ECRIT le 2026-08-22** : la hauteur n'entre jamais dans le verdict, la regle est sans objet. `it` « un plafond ne coute qu'un departage d'egalite, jamais un rang » — balayage de 19 557 geometries legales qui **fige la frontiere** : perte toleree UNIQUEMENT a cle egale et ≤ 2·epsilon (le seul defaut reel, verse en Q12). Ne PAS ajouter la hauteur aux fiches (P23) |
| 5 | LONGEUR DE FLANC (tour meme rangee, est) | `unite sur le flanc EST d'une tour 2x2 (cas voiture verifie in-game)` | rien |
| 6 | tour meme rangee sans voisine au nord → devant | idem #5 | rien |
| 7 | meme rangee sans recouvrement de colonne → derriere | `unite hors de la colonne du sprite : cle brute` | rien |
| 8 | tour au sud 2 colonnes plus loin → ignoree | idem #7 | rien |
| 9 | `clipOnly` (moteur/district) au sud → n'occulte JAMAIS | `empreinte A PLAT (champ) : ignoree` + `point d'eau : ignore` — deux exclusions, meme doctrine | rien |
| 10 | empreinte multi-tuiles : base = rang SUD | **c'est le titre meme du `describe` iso** | rien |

| # | `it` legacy — `drawGroundAgents` (3) | Sort |
|---|---|---|
| 11-13 | rue entre deux rangs → passe 1 ; tour au nord → passe 2 ; longeur de flanc → passe 2 | **Non portables** : ils testent le **split de passes** de `drawGroundAgents`, fonction supprimee a l'etape 6.5. L'iso n'a pas de passes, il a une cle continue. Ce sont les echos d'integration des regles #3, #2, #5, **deja couvertes au niveau unitaire**. Les documenter comme tels dans l'en-tete du fichier iso, ne pas les recreer artificiellement |
- **Diff attendu** : un fichier de test cree, un fichier de test enrichi. **Aucun code de production
  touche.**
- **Verification** : `npx vitest run src/game/map/__tests__/vehicleHeadlights.test.js src/game/map/__tests__/isoUnitDepth.test.js`
  → tout vert. Le total de `it` **augmente** a cette etape.
- **Effort** : moyenne.
- **Commit** : `test(carte): porter les phares et les regles de tri peintre vers le chemin iso`

> ## ✔ ETAPE 3 FAITE — 2026-08-22, non commitee
>
> | Fichier | Etat |
> |---|---|
> | `__tests__/vehicleHeadlights.test.js` | **cree**, 6 `it`, les 4 gardes couvertes une par une |
> | `__tests__/isoUnitDepth.test.js` | **enrichi**, +2 `it` (bug fondateur en geometrie d'origine + balayage du departage d'egalite) |
>
> **Aucun code de production touche** (seule exception, hors etape : la sonde `__depthProbe` ajoutee dans
> `isoRenderer.js` pour trancher Q9, opt-in et sans effet eteinte).
> Suite complete : **151 fichiers / 1728 `it`, tout vert.** Les trois fichiers legacy
> (`groundSort`, `ysortCorner`, `ysortPainter`) peuvent maintenant partir a l'etape 6.5 **sans perte de
> couverture** — c'etait la condition de passage.
>
> **Prochaine etape : 2 (orphelins d'assets), puis 4 (la bascule de frame).** Rappel : re-ancrer les
> lignes avant d'editer (§0.3), et fermer d'abord le chantier pont (§0.5).

---

### Etape 4 — La bascule de frame

- **Objectif** : le point de non-retour visuel. **Un commit a lui seul**, pour un `git revert` propre.
> **⚠ LIGNES RE-ANCREES LE 2026-08-22 (§0.3).** Les numeros barres ci-dessous visent aujourd'hui du code
> **sans aucun rapport** : supprimer « 1739-1884 » detruirait `cityMapEnsureLayout`. Re-verifier avant
> d'editer — le fichier a encore pu bouger.

- **Fichiers** : `src/game/map/cityMapRuntime.js` uniquement.
  - Supprimer ~~1739-1884~~ **2112-2257** (le corps du `else`, borne par `} // fin du pipeline legacy`).
  - Reecrire ~~1737~~ **2110** : garde `if (!CM.layout) { fpEnd(); return; }` **avant**, puis
    `drawIsoWorld(dt, now, { bakeMargin: cityMapBakeMargin, blitMargin: cityMapBlitMargin });` (valeur de
    retour non consommee — P13).
  - Elaguer les imports ~~42-69~~ **68-73** : `renderWorld` (l.68) → 2 specifieurs, `renderBuildings`
    (l.69) → ligne supprimee, `agents` (l.70) → 4 specifieurs, `pixelTerrain` (l.71) → retirer **le seul
    `drawPixelTerrain`**, `pixelRiver` (l.72) → ligne supprimee, `pixelBridge` (l.73) → ligne supprimee.
  - Reecrire les commentaires de bascule (autour de **2106-2112**).
- **Diff attendu** : ~200 lignes retirees dans un seul fichier ; le legacy devient inatteignable.
- **Verification** :
  - ~~`npm run lint` propre (c'est la porte qui attrapera un import oublie — attention, `renderWorld.js`
    commence par `/* eslint-disable */`, mais `cityMapRuntime.js` **non**, donc le lint mord ici).~~
    **⚠⚠ FAUX — voir P24. `cityMapRuntime.js` porte `/* eslint-disable */` en LIGNE 1 : le lint est
    AVEUGLE sur ce fichier, et le build aussi.** Verifie par mutation. Il n'y a **aucune porte
    automatique** a cette etape : il faut une analyse mesuree symbole par symbole (commentaires
    blanchis !), un controle croise apres coupe, et le jeu lance.
  - `npx vitest run` : **meme total qu'a l'etape 3** (aucun test n'importe ce bloc).
  - Pane : **full-reload obligatoire** (`renderWorld`/`cityMapRuntime` ne se voient pas en HMR), puis
    `await __demoCity({ pop: '1e25' })`, `__CM.forceFrame()`, `__cityShot({ name: 'apres-bascule' })`.
    Comparer a `avant-coupe`. Verifier a la main : pan, zoom (les deux sens), redimensionnement de la
    fenetre, les 4 paliers de qualite dans les Options.
  - ~~`window.__iso(false)` doit desormais **ne plus rien changer** a l'ecran.~~ **⚠ FAUX — voir P25.**
    La bascule ne lit plus `CM.iso`, mais **`projection.js` si** : `__iso(false)` fait tourner le peintre
    iso a travers la projection planaire, l'ecran CHANGE. Ce ne sera vrai qu'apres l'etape 7.
- **Effort** : moyenne.
- **Commit** : `feat(carte): la carte n'a plus qu'un chemin — l'iso peint, le top-down disparait de la frame`

> ## ✔ ETAPE 4 FAITE — 2026-08-23
>
> `cityMapRuntime.js` : **2500 → 2348 lignes**. Le bloc `else` (145 lignes, 2112-2257) est parti, la
> bascule est devenue un appel nu precede du garde `if (!CM.layout) { fpEnd(); return; }`. **Le pipeline
> top-down n'est plus atteignable depuis la frame.**
>
> **⚠⚠ L'ELAGAGE DES IMPORTS NE SUIT PAS LE PLAN — il suit la MESURE, et le plan se trompait sur 3 des 6 :**
>
> | Module | Plan | Mesure | Retenu |
> |---|---|---|---|
> | `renderWorld` | → 2 specifieurs | 2 | ✔ conforme |
> | `renderBuildings` | ligne supprimee | 0 survivant | ✔ conforme |
> | `agents` | → 4 specifieurs | **5** | ✘ le plan oubliait `vehSkinFor` (l.1088/1555/1854) |
> | `pixelTerrain` | retirer `drawPixelTerrain` seul | 5 survivants | ✔ conforme |
> | `pixelRiver` | **ligne supprimee** | **2 survivants** | ✘ `setPixelWater`, `waterRippleTune` (molettes) |
> | `pixelBridge` | **ligne supprimee** | **2 survivants** | ✘ `pixelBridgeFlag`, `setBridgeOnLoad` — et **P5 le disait deja**, l'etape 4 se contredisait elle-meme |
>
> Ces cinq modules ne sont plus tenus que par le bloc de molettes `window.__*` : c'est l'etape 6 qui les
> emportera.
>
> **Verification, sans filet automatique (P24)** : analyse symbole par symbole **commentaires blanchis**
> (7 faux positifs sans ca) ; controle croise apres coupe — zero import mort, zero import manquant ;
> 152 fichiers / 1734 `it` verts ; build OK. Puis **le jeu**, seul juge : carte peinte a 100 %, pan, zoom
> aux deux bouts (0,35 et 2,0), redimensionnement de fenetre, **les 4 paliers de qualite** (`perf` arme
> bien le LOD), les 9 molettes conservees appelees une a une, clic et survol de carte — **zero erreur**.
> Rechargement a froid : ere 18, 250 ressources, aucune image cassee, console vide.
>
> **Prochaine etape : 5, vider `renderWorld.js` en 5 temps.** ⚠ Meme piege qu'ici : ce fichier porte lui
> aussi `/* eslint-disable */`, le menage d'imports y est **entierement manuel** (P24).

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

> ## ✔ ETAPE 5 FAITE — 2026-08-23, **en UN commit et non en 5 temps**
>
> `renderWorld.js` : **2939 → 742 lignes**, 52 declarations retirees (2162 lignes). Il ne reste que les
> QUAIS et la SIMULATION D'EMEUTE, exactement les racines annoncees au §2.1.
>
> **Pourquoi un seul commit.** Les 5 temps avaient pour raison d'etre « `npm run lint` doit sortir propre
> entre deux temps ». **Cette raison n'existe pas** : le lint est aveugle sur ce fichier (P24). Des
> etats intermediaires non verifiables sont plus risques qu'une coupe unique validee d'un bloc.
>
> **La coupe a ete conduite par ANALYSE D'ATTEIGNABILITE**, pas a la main : graphe des references entre
> declarations de premier niveau, depuis les 9 racines conservees, **commentaires ET chaines litterales
> blanchis**, effets de bord du module traites comme racines. 17 vivants, 52 morts. Le plan annoncait
> ~680 lignes restantes et ~2175 retirees ; mesure : **742 et 2162**.
>
> **⚠ P15 CONFIRME, ET PLUS MORDANT QUE PREVU.** Dix constantes d'arbres ne survivaient QUE par la boucle
> de prechargement des 7 PNG et les 6 molettes `window.__tree*`, executees au simple import. Un effet de
> bord de niveau module n'est pas une racine : c'est parfois du poids mort qui ancre du poids mort. Les
> traiter comme morts fait tomber le bloc entier (42 morts → 52).
>
> **En-tete : 10 imports → 4.** Meurent `toNum`, `mapThemeForBand`, les 6 de `plazaProps.js`, les 2 de
> `pixelMedian.js`, `setRoadPavingOnLoad`, `paintFlameGlows` (sans danger, l'iso l'importe pour son
> compte), et les **trois hooks `setXOnLoad`**. → `plazaProps.js`, `pixelMedian.js`, `roadPaving.js`
> deviennent orphelins, comme prevu : etape 6.
>
> **Q4 TRANCHEE PAR NECESSITE.** `CM.debugRoads` vivait **a l'interieur** de `cityMapDrawRoad` (l.1871
> dans 1703-1885) : impossible de garder l'un en supprimant l'autre. Aucun equivalent iso ; les ~14
> lignes sont dans l'historique, le recreer serait un petit chantier separe.
>
> **Tests — P9 respecte.** `roadDivided.test.js` → **`vehicleLane.test.js`** (301 → 58 lignes), trim et
> non delete : son `describe` `vehicleLaneOffset` teste une fonction du chemin ISO, seule couverture
> executable du placement des files. L'echafaudage `CM.iso` du `it` conserve saute aussi → **un pilote de
> drapeau en moins pour l'etape 7 (9 → 8)**. **1734 → 1721 `it`** : les 12 tombes plus celui-la, au compte.
>
> **Verification** : controle croise apres coupe (aucun import mort, aucun manquant) ; 152 fichiers /
> 1721 verts ; build OK — il attrape la seule chose qu'il sache attraper ici, un `export` vers un nom
> disparu. Puis le jeu : eres 4, 16 et 69, carte peinte a 100 %, quais presents et molette vivante,
> 250 ressources, aucune image cassee, console vide.
>
> **Prochaine etape : 6, les modules satellites.** ⚠ Elle est partiellement bloquee par **Q1**, toujours
> ouverte — mais son principal frein a saute (P16 inverse : `roads/*.png` est regenerable).

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
- **Verification** : `npm run lint` propre (mord sur tous ces fichiers) ; `npx vitest run` → ~~**~1068
  `it`**~~ **le compte recalcule a l'etape 1** (§0.2) ; full-reload + `__cityShot` ; taper `__pixelWater`
  dans la console doit rendre `undefined`, taper `__quayWall` doit repondre.
- **Effort** : longue (peut se scinder en 2-3 commits : renderBuildings+buildingShapes / pixelTerrain +
  les 4 suppressions / agents + molettes).
- **Commit** : `refactor(carte): quatre modules de peinture top-down disparaissent, le pont buildingShapes est demonte`

> ## ✔ ETAPE 6 FAITE — 2026-08-23
>
> **CINQ modules supprimes** (et non quatre) : `plazaProps.js`, `pixelMedian.js`, `roadPaving.js`,
> `pixelRiver.js` — orphelins en cascade, chacun verifie sans importeur avant la coupe — plus
> **`buildingShapes.js`**, le PONT de P8, repointe puis supprime.
>
> **Quatre modules trimmes**, par atteignabilite depuis leurs vrais consommateurs :
> `agents.js` **2417 → 1421**, `renderBuildings.js` **1088 → 775**, `pixelTerrain.js` **340 → 96**,
> et `renderWorld.js` perd `baseColor` + `cmLitColor` (derniers lecteurs partis avec le bloc LOD et
> `buildingShapes`). **Trois fichiers de test** retires : 1721 → **1694 `it`**, le compte exact.
>
> **Molettes** : 9 retirees, **5 gardees** (`__quayWall`, `__waterShore`, `__pixelBridge`, `__sidewalk`,
> `__sidewalkTune`) — P17 respecte. ⚠ `__headlightDepth` et `__droneSprite` ont ete VERIFIES avant de
> tomber : leurs drapeaux `CM.*` n'etaient lus que dans `drawOneVehicle`. L'iso appelle
> `drawVehicleHeadlights` **sans garde** — un commentaire de `vehicleHeadlights.test.js` disait le
> contraire, corrige.
>
> ### ⚠⚠ P26 — LA SUITE DE TESTS PASSE VERTE SUR UN MODULE CASSE
>
> Apres la coupe d'`agents.js`, son bloc `export` nommait encore 5 symboles disparus.
> **`npx vitest run` : 1694 tests VERTS. `npm run build` : 5 `PARSE_ERROR` « Export X is not defined ».**
> Vitest ne parse pas ces re-exports comme le bundler. **Sur ce chantier, « tests verts » ne vaut PAS
> validation — lancer `npm run build` a chaque etape.** C'est la seule porte automatique qui reste sur les
> fichiers `eslint-disable`, et elle n'attrape qu'une chose : un export vers un nom disparu.
>
> ### ✔ P24 REPARE — LA PORTE DU LINT EST RENDUE
>
> Une fois le top-down parti, **ESLint a signale lui-meme** que les `/* eslint-disable */` de
> `renderWorld.js` et `pixelTerrain.js` etaient devenus inutiles (« unused eslint-disable directive »).
> Retires. **`cityMapRuntime.js` a suivi** : il ne restait qu'une erreur, un parametre de `catch`
> inutilise, corrigee.
>
> **Les quatre fichiers de la carte sont de nouveau lintes.** C'est exactement le garde-fou que P24
> constatait absent a l'etape 4 — **l'etape 7 en profitera**. Le lint a servi dans la minute : il a
> attrape `AGENT_NF`, `AGENT_FW` et `BOAT_SCALE`, restes morts apres la coupe. **Ne pas remettre ces
> commentaires magiques sans raison ecrite.**
>
> **Verification** : lint propre, build OK, 149 fichiers / 1694 verts. Puis le jeu : ere 18,
> 182 habitants, 80 vehicules, carte peinte a 100 %, quais presents, les 5 molettes conservees repondent
> et les 9 retirees rendent `undefined`, 250 ressources, aucune image cassee, console vide.
>
> **⚠ Q1 reste ouverte** : c'est elle qui dira si le reliquat de `pixelTerrain.js` (96 lignes,
> `drawEraGroundFill` + son tileset) peut disparaitre a son tour, avec les assets `roads/*.png`.
>
> **Prochaine etape : 7, le drapeau `CM.iso`.** Rappels : **P22** (la condition de passage doit inclure
> `isoFlag`, pas seulement `CM.iso`), **P25** (entre 4 et 7, `__iso(false)` donne un rendu hybride —
> avancer le nettoyage de `localStorage.cmIsoMode` si la periode dure), et l'inventaire des pilotes du
> drapeau est descendu de 9 a **8** fichiers de test (§0.2).

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
  4. **Le bloc racine en dernier** : `projection.js:26-44` (`isoFlag`, `window.__iso`, lecture/ecriture
     `cmIsoMode`, invalidation des 4 bakes). **Condition de passage — CORRIGEE le 2026-08-22, voir P22 :**
     ```
     grep -rn "CM\.iso\b\|isoFlag" src/
     ```
     ne doit plus rendre que la definition dans `projection.js`. **L'ancienne condition (`CM.iso` seul)
     passait au vert alors que `pixelHouses.js:17/242/339` lit encore `isoFlag`.** Traiter ces lecteurs
     de production **avant** ce point.
  5. Optionnel : un `localStorage.removeItem('cmIsoMode')` one-shot au boot carte, pour ne pas laisser de
     dechet chez les postes qui avaient fait `__iso(false)`.
- **Diff attendu** : ~45 lignes de branches + le bloc de 20 lignes du flag.
- **Verification** :
  - **Rejouer isolement** `npx vitest run src/game/map/__tests__/citizenDoorstep.test.js src/game/map/__tests__/bridgePedEdge.test.js src/game/map/__tests__/pedTurnSmooth.test.js` — c'est la **seule** etape ou
    un seuil numerique peut bouger : la vitesse pietonne passe de ×1 a ×0,72 (agents.js:1058). Les budgets
    sont larges (6000/8000 pas) et les assertions sont des ratios, mais **rejouer, pas relire**.
  - `npx vitest run` complet.
  - `grep -rn "CM\.iso\b\|isoFlag" src/` → **plus rien hors `projection.js`** (P22 ; l'ancienne forme
    `grep -n "CM\.iso\b"` seule est un faux feu vert).
  - Pane : taper `__iso` → `undefined`. Full-reload + `__cityShot`.
- **Effort** : moyenne.
- **Commit** : `feat(carte): plus de bascule de rendu — l'iso est la seule geometrie`

> ## ✔ ETAPE 7 FAITE — 2026-08-23
>
> `CM.iso`, `isoFlag`, `window.__iso` et la cle `cmIsoMode` ont disparu. **Il n'y a plus qu'une
> projection.** L'ordre impose a ete tenu a la lettre : lecteurs, puis `projection.js` fonction par
> fonction, puis les tests, puis le bloc racine.
>
> ### ⚠⚠ LA CONDITION DE PASSAGE DU PLAN ETAIT INSUFFISANTE — DEUX FOIS
>
> Elle nommait **`CM.iso` seul**. Auraient echappe a ce grep :
>
> | Lecteur | Decouvert par |
> |---|---|
> | `pixelHouses.js` (import + 2 lectures de `isoFlag`) | **P22**, ajoute le 2026-08-22 en relisant le plan |
> | `isoBridge.js` ×2 (`bridgeWalkBand`, `bridgeLiftScreen`) | **la condition elargie**, jamais inventories |
> | `isoRenderer.js` ×1 (`drawIsoSplashes`) | idem |
>
> Les trois derniers sont apparus **apres** la redaction du plan. C'est `grep -rn "CM\.iso\b\|isoFlag"`
> qui les a leves. **Une condition de passage ne doit pas nommer UN symbole quand le bloc supprime en
> exporte TROIS** — la lecon de P22, verifiee sur pieces.
>
> ### Les pieges ont tenu
>
> **P3** — dans `agents.js`, seul `CM.iso && ` saute ; `CM.isoPedEdge != null` et `CM.isoVehLane != null`
> RESTENT. Ce ne sont pas des restes du drapeau mais des gardes de **publication** : `agents.js` ne peut
> pas importer `isoRenderer` (import inverse), la geometrie lui arrive sur `CM`, et sous vitest elle est
> absente. Un commentaire le dit desormais sur place, pour que personne ne « simplifie » ca.
> **P12** — la const `legacy` de `wonderFootWorld` est conservee : toujours renvoyee pour `era_mega`.
> **P11** — le repli de survol des merveilles n'etait pas mort, seul son commentaire l'etait : reecrit.
> **P25** — clos par le nettoyage ponctuel de `localStorage.cmIsoMode` au chargement.
>
> ### Les tests
>
> **Huit fichiers pilotaient le drapeau ; il n'en reste aucun.** Le `describe` « mode legacy » de
> `projection.test.js` part — le `describe` iso couvrait deja chacun de ses cas (aller-retour, `depthOf`,
> divergence de `wonderAnchor`). ⚠ **`legacyPlanarAnchor` RESTE malgre son nom** : ce n'est plus un
> pilote mais un **temoin**, le test « l'ancre iso N'EST PAS la projection planaire » en depend.
> **1694 → 1690 `it`.**
>
> ⚠ L'effet de bord annonce s'est produit sans casse : la vitesse pietonne passe de ×1 a ×0,72 dans les
> suites qui eteignaient le drapeau. Budgets larges, assertions en ratio — **rejouees, pas relues**.
>
> **Verification** : lint propre, build OK, 149 fichiers / 1690 verts. Puis le jeu : `__iso` rend
> `undefined`, `CM.iso` aussi, `cmIsoMode` est nettoye, et la carte tient — ere 20, 100 % peinte au repos,
> en pan et aux deux bouts du zoom, quais presents, console vide.
>
> **Reste l'etape 8** (assets liberes, partiellement bloquee par **Q1** et **Q3**) et l'**etape 9**
> (documentation). Puis **Q5** : `renderWorld.js` ne rend plus rien, son nom ment.

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

> ## ✔ ETAPE 8 FAITE — 2026-08-23
>
> **58 PNG** retires (le plan en annoncait 52) et **6 scripts** devenus orphelins de leurs assets.
>
> **⚠ L'ECART DE 6 VIENT DU KIT DE PLACES.** Le plan comptait 10 `lamppost-*` + `paving-*` ; il y en a
> **15**. Verifie a la SOURCE plutot qu'au decompte : `LEGACY_PROP` (isoPlaza.js) mappe `bench`, `bush`,
> `fountain`, `flag` et `amphora→planter`, **rien d'autre** — ni `lamppost` ni `paving` ne peuvent etre
> sondes par le repli iso. Les **45 fichiers** du kit qui LE sont restent en place : c'est le defaut de
> **Q3**, toujours ouverte.
>
> ### ⚠⚠ LA VERIFICATION NE PEUT PAS ETRE UN GREP DE NOM DE FICHIER
>
> Lecon de l'etape 2, ou les chemins de vehicules etaient construits par TEMPLATE. Methode retenue :
> **enumerer tous les prefixes `/pixelart/…` litteraux de `src/`**, puis suivre chacun. Le seul prefixe nu
> (`'/pixelart/' + name`) est celui de `pixelTerrain.ensure`, dont les noms viennent de `ROAD_STAGES` —
> des `roads/band*`, conserves. **Aucun autre chemin ne peut atteindre les fichiers retires.**
>
> ### P14 respecte, avec une precision
>
> `grass.png` et `water/water.png` etaient lus **sans garde** par des scripts : les supprimer seuls aurait
> casse ces scripts, d'ou leur depart conjoint. Mais `grass.png` est aussi touche par
> `separatePixelTerrain.mjs`, que **P16 dit de garder**. Verifie : ce script l'**ECRIT** (`GRASS_OUT`), il
> ne le lit pas. Il reste — et il peut le regenerer, d'autant que sa matiere premiere `_archive/coupled/`
> est revenue (P16 inverse).
>
> Les **prechargements de niveau module** qui tenaient ces assets etaient deja partis avec leur code : les
> 7 arbres a l'etape 5, l'herbe et les rues a l'etape 6. C'est ce que **P15** reclamait, et c'est pourquoi
> le controle reseau est vide.
>
> `.gitignore` inchange : son commentaire dit que `public/pixelart/roads/` et `grass-ref` restent
> versionnes — toujours vrai, seuls les `.edge.png` sont partis.
>
> **Verification** : lint propre, build OK, 149 fichiers / 1690 verts. Puis le jeu — seul controle qui
> vaille pour des prechargements silencieux : **ere 23**, celle ou places et terre-pleins chargeraient,
> carte peinte a 100 %, 250 ressources reseau, **ZERO requete vers un asset retire**, aucune image non
> decodee, console vide.
>
> **Reste l'etape 9** (documentation), puis **Q5** (renommer `renderWorld.js`). Q1, Q2, Q3 et Q6 restent
> ouvertes — chacune ne commande plus qu'un petit menage supplementaire.

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

> ## ✔ ETAPE 9 FAITE — 2026-08-23. **LE CHANTIER EST CLOS.**
>
> `ARCHITECTURE.md` §6 etait le plus trompeur : il decrivait la carte **sans jamais nommer
> l'isometrique**, et donnait `cityMapRuntime.js` pour le renderer. Reecrit — la boucle de frame et la
> camera y vivent, mais LE DESSIN est entierement dans `iso/isoRenderer.js`. « Plafonne a 30 fps »
> corrige (60 au palier Eleve).
>
> ### ⚠ LES JOURNAUX NE SONT PAS REECRITS, ILS SONT DATES
>
> `REPRISE-chantier-iso.md` est un **registre de chantier** : sa valeur est d'avoir enregistre les
> decisions et les pieges AU MOMENT ou ils se posaient. Le reecrire pour qu'il « ait raison » aujourd'hui
> detruirait ca. Il recoit donc une **cloture en tete** (ce qui a ete retire, chiffres a l'appui) et un
> avertissement : ce document decrit juillet 2026, l'etat qui fait foi est **ce plan**. La ligne
> « retirer le top-down un jour » est cochee.
>
> Meme traitement pour les audits. **`m-11` de `audit-2026-07-lot2.md` planifiait exactement ce
> chantier** : marque resolu et date. `n-04` devient sans objet. `audit-2026-07-mort.md` : sa liste de
> molettes « intentionnelles » est caduque pour `isoFlag`, `__pixelMedian`, `__roadPaving` ; vivante pour
> `__pixelBridge` et `houseFitTune`.
>
> `public/pixelart/README.md` : **elague, pas jete** (−70 lignes). Les deux sections decrivant des couches
> disparues — frange d'herbe et rues edge-Wang — partent ; rangement des sprites, fiche DA moteurs et
> palette maitre restent. Le tableau du kit `plazas/` dit ce qui subsiste **et pourquoi** : les cinq props
> que `LEGACY_PROP` sonde encore.
>
> Ponctuels : `ANIMATION_INDEX.md`, `PERF-CARTE-REPRISE.md`, `RETRI-2026-07-27.md`, `PLAN-RENDU-VILLE.md`,
> et l'en-tete de `roadWidth.test.js` — il vantait la factorisation de 3 copies de la table des largeurs,
> dont 2 n'existent plus : c'est un garde-fou de VALEURS, plus de duplication.
>
> **Non touches, comme le §6 Q19 l'exige** : `PLACES-ISO-COMPOSEES.md` et `reprise-infra-pixel.md` — leurs
> « legacy » designent des kits d'art et des replis proceduraux, pas le pipeline. Les corriger serait une
> **regression documentaire**.
>
> ⚠ Piege de manipulation, rencontre deux fois : **`git add <dossier>` ramasse les fichiers non suivis
> d'autres sessions** (`scripts/zipDist.mjs` a l'etape 2, `docs/PLAN-RELIEF.md` ici). Sorti du commit
> avant le push les deux fois. **Stager par fichier.**
>
> ---
>
> # 🏁 BILAN DU CHANTIER — etapes 2 a 9, le 2026-08-23
>
> | | Avant | Apres |
> |---|---|---|
> | Chemins de rendu de la carte | **2** | **1** |
> | `renderWorld.js` | 2939 l. | **~735** — ne rend plus le monde |
> | `agents.js` | 2417 l. | **1421** |
> | `renderBuildings.js` | 1088 l. | **775** |
> | `pixelTerrain.js` | 340 l. | **96** |
> | `cityMapRuntime.js` | 2500 l. | **2352** |
> | Modules supprimes | — | **5** (`buildingShapes`, `plazaProps`, `pixelMedian`, `roadPaving`, `pixelRiver`) |
> | Assets retires | — | **82 PNG** (24 orphelins + 58 liberes) + **6 scripts** |
> | Drapeau de pipeline | `CM.iso`/`isoFlag`/`__iso`/`cmIsoMode` | **disparu** |
> | Fichiers de la carte lintes | 0 sur 4 (`eslint-disable`) | **4 sur 4** |
> | Tests | 1713 | **1690** (27 legacy retires, 14 portes/ecrits) |
>
> **Le gain est la MAINTENANCE, comme annonce en §1** — jamais le poids. Une seule facon de repondre a
> « pourquoi la carte fait ca ».
>
> **Ce qui reste, et qui n'est plus ce chantier** : **Q5** (renommer `renderWorld.js`, dont le nom ment),
> **Q1** (le reliquat de `pixelTerrain.js` et les assets `roads/`), **Q2** (l'A/B `__isoBridge3d`),
> **Q3** (le kit `plazas/` dormant), **Q6** (les generateurs archives ou non), **Q8** (les fichiers
> d'auteur hors `public/`), **Q10** (decouper `isoRenderer.js`, +49 % en 24 jours), **Q11** (la passe
> fantome qui redessine 86-87 % des unites) et **Q12** (le departage d'egalite de la profondeur).

---

## 5. Verification et retour arriere

### 5.1 Le protocole a chaque etape

| Controle | Commande | Ce qu'il attrape |
|---|---|---|
| Lint | `npm run lint` | Imports orphelins — **sauf dans `renderWorld.js`** (`/* eslint-disable */` l.1) |
| Tests | `npx vitest run` | Regressions de logique. **Jamais avec `2>$null`** : la redirection avale l'echec |
| Comptage | Total de `it` a chaque etape | Prouve qu'on a perdu **exactement** ce qu'on croyait. ~~(~1112 → ~1068)~~ — totaux caducs, re-mesurer (§0.2) |
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

> A trancher par Raphael **avant** de commencer. Q1 a Q8 bloquaient chacune au moins une etape ;
> **Q7 est tranchee** (2026-08-22 : on porte les 13). Q9 et Q10, ajoutees le 2026-08-22, ne bloquent
> que ce qu'elles nomment.

**Q1 — `public/pixelart/roads/*.png|json` : les champs irrigues passent-ils encore par
`drawEraGroundFill` en iso ?**
Statiquement, la reference est vivante (`cityEngineSprites.js:2931` ← `isoRenderer.js:24`). Mais l'iso
refuse explicitement les scenes moteur pour les champs (`isoRenderer.js:4844`) et les redessine avec
`drawIsoField` (`isoRenderer.js:6227`). **Indecidable par recherche** : il faut le mesurer a l'encre, en
jeu. Si la branche est morte, `pixelTerrain.js` disparait **en entier** et 177 Ko d'assets partent.
~~Rappel P16 : ces 20 fichiers **ne sont plus regenerables** (source `_archive/coupled/` vide).~~
**⚠ CE FREIN A SAUTE le 2026-08-23 : `_archive/coupled/` contient de nouveau ses 20 fichiers, donc
`roads/*.png` EST regenerable** (P16 corrige). Il reste a mesurer a l'encre si la branche est vivante,
mais le risque en cas d'erreur n'est plus irreversible.
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

**Q5 — On renomme `renderWorld.js` ? — ✔ FAIT le 2026-08-23 : `quaysAndRiot.js`.**

~~Apres la coupe il ne reste que les quais (15,4 Ko) et la simulation d'emeute (~10 Ko). Le nom ment.
`mapQuaysAndRiot.js` ? `sharedMapPainters.js` ?~~

**Nom retenu : `quaysAndRiot.js`**, ni l'un ni l'autre des deux candidats.
- Le prefixe `map` est **redondant** : le fichier vit dans `src/game/map/`, ou aucun autre module ne le
  porte (`riverFleet`, `flameGlow`, `pixelHouses`, `snowRoof`…).
- `sharedMapPainters` serait **faux** : `updateCrisis` est une SIMULATION, pas un peintre.

**Le renommage a touche 3 imports, pas 5** — `buildingShapes.js` et `pixelRiver.js` ont ete supprimes a
l'etape 6, et `renderBuildings.js` a perdu son import de `baseColor` a la meme etape. Restent
`isoRenderer.js`, `cityMapRuntime.js` et `__tests__/waterShoreRelais.test.js`.

Cote docs, seuls les **canoniques** sont repointes (`ARCHITECTURE.md`, ce plan). Les journaux dates —
audits, `REPRISE-*` — gardent l'ancien nom : c'est ce qu'ils citaient a l'epoque, et les reecrire serait
la meme regression documentaire que P19. **Le pont est fait dans l'AUTRE SENS** : l'en-tete de
`quaysAndRiot.js` dit qu'il s'appelait `renderWorld.js`, de sorte qu'un lecteur venu d'un vieux document
retombe sur ses pieds.

Deux bandeaux de section herites du decoupage d'origine (`legacy citymap rendering\draw-utils.js`,
`\crisis.js`) sont remplaces par les deux vrais sujets du fichier : **PARTIE 1 — la berge maconnee**,
**PARTIE 2 — l'emeute**. ⚠ Deux sujets sans rapport dans un meme fichier restent l'heritage de la coupe,
pas un choix : les separer serait un petit chantier a part.

**Q6 — Les generateurs de `scripts/` : memoire de fabrication ou dette ?**
`fetchTrees.mjs`, `fetchMedians.mjs`, `makeGrassEdge.mjs`, `makeStreetTiles.mjs`,
`fetchStreetSurfaces.mjs`, `retintWater.mjs` deviennent orphelins de leurs assets. Ce sont les **recettes
PixelLab** qui ont produit l'art. Les supprimer (defaut du plan, etape 8) perd la memoire de fabrication ;
les garder laisse 6 scripts qui pointent des fichiers absents. Option intermediaire : les deplacer dans
`scripts/_archive/` avec un README d'une ligne.

**Q7 — Les 13 `it` de `ysortPainter.test.js` : combien on porte ? — TRANCHEE le 2026-08-22 : LES 13.**

~~Le plan (etape 3) propose 3-4 regles fortes.~~ **Decision de Raphael : on porte les 13.** Le bug
« pietons debout sur les toits » est deja revenu une fois ; 3-4 regles ne suffisent pas.

**Mais « porter les 13 » ne veut pas dire « ecrire 13 `it` neufs ».** Cartographie faite le 2026-08-22
(lecture des deux fichiers + de l'implementation de `isoUnitDepth`) : **11 des 13 regles sont deja
couvertes** par `isoUnitDepth.test.js`, sous une autre geometrie. Le travail reel, c'est **2 regles** —
dont une qui revele une **divergence de contrat**. Voir la table de l'etape 3 et **P23**.

*Ne bloque plus rien. L'etape 3 est ouverte.*

**Q8 — On deplace `master-palette.*`, les deux `README.md` de `pixelart/` et `Asepritelayers/` hors de
`public/` ?**
~60 Ko de fichiers d'auteur servis au client. Le deplacement demande de mettre a jour la constante `PUB`
de `scripts/buildPalette.mjs` et `scripts/remapPalette.mjs:48`, et `package.json:25`
(`!dist/**/Asepritelayers/**`). Hors perimetre strict du chantier — a faire ou a remettre a plus tard,
mais pas a oublier.

---

**Q9 — `isoUnitDepth` est aveugle a la hauteur — TRANCHEE le 2026-08-22 par la mesure : option 3.**
*Ajoutee et fermee le meme jour. Chiffres, contre-exemple et pieges de methode complets en **P23**.*
La regle legacy « une tour au sud trop basse pour recouvrir la rue n'occulte pas » n'a aucun equivalent
iso. On soupconnait qu'un batiment bas puisse annuler une remontee legitime. **Mesure : la hauteur n'y
est pour rien** — 0 occurrence en jeu (3 468 evaluations, 3 eres, 773 conflits lift+cap), et la hauteur
n'entre jamais dans le verdict.
**Decision : ne PAS ajouter la hauteur aux fiches.** Le 13e `it` de Q7 est ecrit ; la divergence est
documentee en en-tete de `isoUnitDepth.test.js`.
⚠ Une premiere version de cette reponse concluait « cas inatteignable » sur la foi d'un tirage aleatoire.
**C'etait faux** : une grille calee pres des faces trouve 2 contre-exemples — voir **Q12**.
*Ne bloque plus rien.*

**Q10 — Quand decoupe-t-on `isoRenderer.js` ?**
*Ajoutee le 2026-08-22, cf. §0.7.* Le fichier a pris **+49 % en 24 jours** (~7 350 → 10 948 lignes) et
porte des fonctions de 1 249 lignes (`drawIsoGround`), 982 (`drawIsoLive`), 492 (`drawIsoWorldInner`). Ce
chantier-ci ne le touche pas : il supprime le **second** chemin de rendu, il ne range pas le premier.
Le decoupage se fait passe par passe, **sans changer un pixel**, tests verts a chaque etape — c'est une
extraction, pas une reecriture. Plus on attend, plus elle coute.
*Ne bloque rien. A ouvrir apres l'etape 9.*

> **OUVERTE le 2026-08-23, apres la fusion de l'etape 9.** Le decoupage avance tranche par tranche,
> chacune commitee a part, chacune passee par les trois portes (lint, tests, build) et par une **preuve
> d'identite des octets** contre la version commitee. **11 039 → 2 146 lignes, soit −81 %**, reparties
> en **33 modules** sous `iso/`.
>
> | Commit | Module sorti | isoRenderer |
> |---|---|---|
> | `8c9c786` | `iso/isoFleet.js` (575 l.) — coque, stade de commerce, feux de nav, evitement | → 10 485 |
> | `7647fd7` | `iso/isoSky.js` (138 l.) ; `iso/isoMath.js` (17 l., `_frac`/`_rnd` partages) | → 10 365 |
> | `a35e987` | `iso/isoWildForest.js` (159 l.) ; `iso/isoWonderGround.js` (44 l.) | → 10 196 |
> | `550ef12` | `iso/isoGroundTiles.js` (473 l.) — catalogue des tuiles de sol + greve | → 9 750 |
> | `f0f669f` | `iso/isoPalette.js` (98 l.) — les sept tons de reference ; **feuille du graphe** | → 9 682 |
> | `9119c6e` | `iso/isoWeather.js` (769 l.) — pluie, eclats au sol, neige (+ teintes de flocon) | → 8 945 |
> | `8186f81` | `iso/isoRiver.js` (1 783 l.) — le fleuve entier, derriere **3** symboles publics | → 7 201 |
> | `5a83a15` | `iso/isoUnits.js` (481 l.) — vehicules, emeutiers, objets portes + PROFONDEUR | → 6 753 |
> | `ec615c9` | `iso/isoEngineScene.js` (343 l.) — scenes moteur + liseres ; `HOVER_GOLD` → palette | → 6 435 |
> | `447670f` | `iso/isoQuad.js` (46 l.) + `iso/isoArt.js` (41 l.) — **le socle qui debloque** | → 6 383 |
> | `a171ab8` | `iso/isoPort.js` (433 l.) — flotte legacy, riverain, ponton, mouillage | → 5 983 |
> | `7cee866` | `iso/isoTissu.js` (233 l.) — bati / cour / friche, un MODELE ; `iso/isoFence.js` (218 l.) | → 5 580 |
> | `c2f5609` | `iso/isoRoad.js` (176 l.) — la voirie, **eparpillee en 4 endroits** | → 5 439 |
> | `6d59efe` | `iso/isoStreet.js` (639 l.) — lampadaires, mobilier, terre-pleins, la NUIT | → 4 840 |
> | `e9b7e88` | `iso/isoGroundDetail.js` (815 l.) — matieres du sol + l'etat de SAISON (P28) | → 4 071 |
> | `a979d90` | `iso/isoAmbient.js` (266 l.) + `iso/isoField.js` (96 l.) | → 3 747 |
> | `82a5949` | le TABLIER rejoint `iso/isoBridge.js` — **consolidation, pas creation** | → 3 583 |
> | `aa0acd0` | `iso/isoGroundProps.js` (107 l.) ; la FONTAINE rejoint `isoPlaza.js` | → 3 460 |
> | `e2955d6` | le PEINTRE DU PARVIS rejoint `iso/isoWonderGround.js` | → 3 368 |
>
> **La regle de coupe : la dependance ENTRANTE decide la borne**, jamais le bandeau de section. Zero
> entrante → on coupe ; quelques-unes → un **petit module partage** (`isoMath`, `isoWonderGround`),
> **jamais un import retour** vers `isoRenderer` (un cycle ESM tombe en TDZ sur un `const` — cf. P22 et
> la perte de save de juillet).
>
> ✔ **L'EAU EST SORTIE, ET C'EST LA DEMONSTRATION DE LA METHODE.** Ses dependances entrantes ont ete
> re-mesurees apres CHAQUE tranche : **11 → 5** (tuiles + greve) **→ 2** (palette) **→ 0** (meteo).
> Chaque coupe precedente etait le prix de celle-la. **On ne pouvait pas commencer par le fleuve** — et
> c'est precisement ce que la mesure de couture sert a savoir avant de poser le premier trait.
>
> ✔✔ **LE SOCLE PARTAGE EST LA VRAIE LEVIER, ET C'EST CONTRE-INTUITIF.** `isoQuad` (46 l.) et `isoArt`
> (41 l.) sont les deux plus PETITS modules du lot — et ce sont eux qui ont libere le PORT (400 l.),
> et qui rendent extractibles le PONT et le CHAMP. Ces blocs ne tenaient au peintre que par deux fils.
> **Ce n'est pas la taille du bloc qui decide, c'est le NOMBRE DE FILS** : quand plusieurs gros blocs
> partagent les memes une ou deux entrantes, sortir ces entrantes d'abord vaut mieux que de forcer un
> gros bloc.
> ⚠ Effet de bord a exploiter : `isoBridge.js` porte une COPIE du cache d'art, avec la raison en
> commentaire — « l'importer creerait un cycle isoRenderer ↔ isoBridge ». Cette raison n'existe plus.
> La deduplication n'est pas un deplacement pur, donc pas dans une tranche de decoupage.
>
> ✔✔✔ **CINQ FOIS DE SUITE, UNE FEUILLE A LIBERE UN GROS BLOC** — ce n'est plus une coincidence,
> c'est LA methode :
>
> | La feuille sortie | ce qu'elle a libere |
> |---|---|
> | `isoQuad` (46 l.) + `isoArt` (41 l.) | le PORT (400 l.), et le pont + le champ |
> | `isoTissu` (233 l.) | les CLOTURES (192 l.), dont `COUR` etait le seul fil |
> | `isoRoad` (176 l.) | la RUE (604 l.) et le pont (165 l.) |
>
> **Ce n'est pas la TAILLE du bloc qui decide, c'est le NOMBRE DE FILS.** Quand plusieurs gros blocs
> partagent une ou deux memes entrantes, sortir ces entrantes d'abord vaut mieux que de forcer un gros
> bloc. Et une CONFIG (isoRoad) ou un MODELE (isoTissu) n'a de toute facon rien a faire dans un peintre.
>
> ✔ **UNE TRANCHE PEUT ETRE UNE CONSOLIDATION.** Le TABLIER n'a pas cree de module : il a rejoint
> `isoBridge.js`, qui portait deja la structure du pont. Deux morceaux d'un seul ouvrage, separes par
> mille lignes. Chercher le FOYER NATUREL avant d'inventer un fichier.
>
> ⚠⚠ **CE DECOUPAGE MET AU JOUR DES DOUBLONS.** `isoBridge.js` portait sa propre copie du CACHE D'ART,
> puis on a decouvert qu'il porte aussi un `rgb` **identique au caractere pres** a celui d'isoPalette
> (leve par le lint, en collision de nom). Les deux existaient pour la meme raison, ecrite en
> commentaire : « l'importer creerait un cycle isoRenderer ↔ isoBridge ». **Cette raison n'a plus
> cours** depuis que ces briques sont en feuilles. La deduplication n'est PAS un deplacement pur : elle
> merite son propre chantier.
>
> ## 🏁 LA PHASE MECANIQUE EST FINIE — ce qui reste est d'une AUTRE NATURE
>
> **Tout ce qui pouvait sortir par DEPLACEMENT PUR est sorti.** Il reste 3 368 lignes, dont
> **2 593 (77 %) dans TROIS FONCTIONS** : `drawIsoGround` (1 164 l.), `drawIsoLive` (936 l.),
> `drawIsoWorldInner` (493 l.) — etendues mesurees par appariement d'accolades.
>
> **Pourquoi la meme methode ne s'applique plus.** Ce ne sont pas des blocs de declarations posees cote a
> cote : ce sont des fonctions LONGUES dont les passes successives partagent des variables LOCALES (le
> contexte du bake, la memoisation du type de cellule, les demi-losanges, le voile d'ere, les fermetures
> qui les lisent). On ne peut pas en deplacer un morceau tel quel : il faudrait **rendre cet etat
> explicite** — un objet de contexte passe en parametre. C'est un CHANGEMENT DE SIGNATURE, donc :
>   · l'identite des octets ne prouve plus rien (le code change) ;
>   · la garde devient le RENDU, pas le texte — et le harnais d'empreinte de canvas ne marche pas ici
>     (voir plus haut, decouvert par temoin) ;
>   · le risque n'est plus « un import oublie » mais « une variable capturee qu'on croyait locale ».
>
> **Avant d'y toucher, il faut donc trancher une question de conception** : qu'est-ce qui, dans ces
> fonctions, est une PASSE (autonome, qui prend un contexte et peint) et qu'est-ce qui est de la
> COORDINATION (l'ordre, les gates, le budget de frame) ? Tant que ce n'est pas decide, decouper
> ferait des modules qui se repassent dix parametres — pire que le fichier actuel.
>
> 📄 **`docs/CARTO-drawIsoGround.md`** — 🏁 **CLOSE**. Les 9 passes sont sorties, la fonction est passee
> de **1 164 a 77 lignes**. Son §11 tire le bilan, et il faut le lire avant d'attaquer les deux autres :
> la carte avait **predit a tort** que decouper un orchestrateur imposerait des changements de signature
> et un A/B pixel obligatoire. **Les six coupes ont ete des deplacements purs**, grace au **contexte
> destructure en tete** (les locales retrouvent leur nom → corps byte-identique, et la boucle chaude ne
> paie aucun acces de propriete). L'A/B pixel n'a jamais servi — mais il reste la bonne reponse le jour
> ou un decoupage changera vraiment du code.
>
> 📄 **`docs/CARTO-drawIsoLive.md`** (2026-08-23) — la deuxieme des trois, **cartographiee, non
> decoupee**. 936 l. en 8 phases, d'architecture bien plus nette que le sol : **COLLECTE → TRI → DESSIN
> → COMPOSITION**, un peintre a liste d'affichage. Couplage **deux fois plus faible** : 10 locales
> partagees par ≥ 3 phases contre 17. Deux coupes proposees — la COLLECTE (384 l., **9** lectures vers
> l'englobante) et le DESSIN (441 l., **12**) — qui rameneraient la fonction a **~110 lignes**.
> ⚠ Seul nœud : l'etat des LOTS GPU est REASSIGNE (cf. P28), mais toutes ses ecritures tombent dans les
> phases 5-6-7 — elles doivent donc partir ENSEMBLE. Meme motif que l'etat de saison et la couche de
> marche : l'etat voyage avec son ecrivain.
>
> **Reste aussi, mais mineur** : le SURVOL + le pool d'items (59 l., 0 entrante — c'est le PRELUDE
> naturel de `drawIsoLive`), et le CACHE DU SOL (323 l.) — ce dernier depend des orchestrateurs
> (`drawIsoGround`, `drawIsoWorldInner`), donc il ne peut pas partir avant eux sans creer un cycle.
>
> ⚠⚠ **CORRECTION D'UN CHIFFRE DE CE PLAN.** Il y etait ecrit « SURVOL : ~1 013 l., 47 entrantes, ne pas
> prendre de face ». **C'est faux** : la plage mesuree englobait `drawIsoLive`. Le SURVOL reel fait
> **45 lignes et ZERO entrante**. Lecon : quand une plage est bornee par deux bandeaux, verifier qu'elle
> ne contient pas une GROSSE FONCTION — sinon on mesure la couture de l'orchestrateur, pas celle de la
> passe. Un chiffre d'entrantes anormalement haut (≫ 10) est le symptome.
> ⚠ Deux choses restent **exprès** dans isoRenderer et n'iront jamais dans une palette : le ton de
> CHAUSSEE (`roadTone`/`roadToneRaw`), parce qu'il depend de `roadVeilFor` donc de `ROAD_DETAIL`
> (34 usages de reglage de VOIRIE) ; et l'etat de SAISON, pour la raison de P28 ci-dessous.
> ⚠ Le message de `550ef12` annonce « 8 des 11 » : c'etaient **6**, chiffre avance de memoire avant la
> re-mesure. Les mesures de ce paragraphe font foi.
>
> ⚠ **P28 — une liaison IMPORTEE est en LECTURE SEULE, donc un `let` reassigne ne peut pas etre
> deplace.** La palette de saison (`SEASON_GRASS` & co) est reecrite a chaque frame par isoRenderer :
> l'emporter dans `isoPalette` aurait jete un `TypeError` **a la premiere frame, apres un lint vert**.
> Elle reste chez son seul ecrivain et lit `GRASS`/`GRASS_WILD` du module. → **avant toute coupe,
> chercher les REASSIGNATIONS des noms candidats** (`nom =`, hors declaration). Une MUTATION d'objet
> (`Object.assign(waterShoreTune, …)`, comme la molette `__waterShore`) reste parfaitement legale.
> ⚠ Corollaire d'outillage : `couture.cjs` ne retient que le PREMIER nom d'une declaration multiple
> (`let A = …, B = …, C = …`) — les trois sœurs de `SEASON_GRASS` lui etaient invisibles.
>
> ⚠ **P29 — LES FINS DE LIGNE NE SONT PAS UNIFORMES DANS CE DEPOT.** `sed -i` a aplati
> `cityMapRuntime.js` de CRLF en LF —
> diff de **2 346/2 342** au lieu de 5/1. Ce fichier est CRLF dans le depot, contrairement a
> `isoRenderer.js` qui est LF. **Verifier `tr -dc '\r' | wc -c` avant/apres**, et preferer l'edition
> ciblee au `sed -i` sur les fichiers CRLF.
>
> ⚠ **P30 — UNE ANALYSE TEXTUELLE A TROIS TROUS, ET LES TROIS ONT MORDU.** L'outil de couture blanchit
> commentaires et chaines pour ne pas prendre une mention en prose pour une dependance. Ce faisant :
> 1. **`${…}` dans un gabarit est du CODE.** Le bloc meteo ne lisait `SNOW_TOP`/`SNOW_SHADE` que dans
>    un `rgba(${SNOW_TOP[0]}…)` : l'outil annoncait **0 entrante alors qu'il y en avait 2**. Corrige
>    (l'interpolation est desormais recopiee), puis re-mesure. Sans ca le module partait avec deux
>    symboles non definis.
> 2. **Une INSTRUCTION de premier niveau n'est pas une declaration.** `configureRiverLife({…})`, au
>    niveau module d'`isoRiver`, etait invisible ; c'est le **lint** (`no-undef`) qui l'a levee. Meme
>    classe que `isoTileCache` vide par une molette `window.__x`.
> 3. **Le texte ne voit pas les PORTEES.** `rgb` semblait utilise par le bloc meteo : c'est un
>    PARAMETRE de `rainStamp` qui masque l'import. L'import recopie devenait orphelin — leve par le lint.
>
> → La mesure sert a CHOISIR la borne, elle ne remplace aucune porte. Le lint reste l'arbitre.
>
> ⚠ **P31 — UNE GARDE QUI LIT DU TEXTE DE SOURCE NE PORTE AUCUN NOM.**
> `spriteScale.test.js` verrouille `ENGINE_UNIT_F` en cherchant la FORMULE
> `unit = T * z * ISO_X * 0.72` dans le TEXTE d'`isoRenderer.js` — pas un symbole, pas un export :
> **aucun balayage de noms ne peut la voir partir avec le code.** Elle est tombee a la tranche des
> scenes moteur ; ce sont les TESTS qui l'ont rattrapee.
> → Avant une coupe, chercher aussi les tests qui LISENT le fichier (`readFileSync` / `new URL` sur un
> `.js`). Les autres gardes du depot ont ete relues : elles sont POSITIVES (`toContain`), donc elles
> tombent bruyamment. Une garde NEGATIVE (`not.toMatch`) passerait, elle, **a vide** — c'est le cas
> silencieux a surveiller.
>
> ⚠ **P32 — UN TEST PEUT DEPENDRE D'UN EFFET DE BORD DE CHARGEMENT, SANS LE SAVOIR.**
> `roadIsoHierarchy.test.js` verifie `CM.isoVehLane`, publie par `syncIsoStreetGeom()` **au niveau
> module** d'isoRenderer. Tant que le test tirait ses largeurs DEPUIS isoRenderer, l'effet venait par la
> bande ; des que la config est partie dans `isoRoad.js`, le test a cesse de charger le renderer et
> 2 `it` sont tombes sur `undefined`.
> → Corrige en rendant la dependance EXPLICITE (`import "../iso/isoRenderer.js";` avec la raison
> ecrite). Le test est meilleur qu'avant : il verifie la coherence renderer ↔ agents, donc il DOIT
> charger le renderer et le dire.
> ⚠ Le cas general : **deplacer un symbole peut retirer a un importeur un effet de bord qu'il ne
> demandait pas explicitement.** Ni le lint ni le build ne le voient.
>
> ⚠ **P27 — chercher les importeurs des seuls sortants MESURES ne suffit pas.** Les tests importent aussi
> des noms que le moteur n'utilise plus lui-meme : 4 fichiers repointes a la main, **4 autres oublies,
> 29 `it` tombes**. Le lint y est aveugle, et un import ESM d'un nom absent rend **`undefined` en
> silence** — l'erreur sort en `Cannot read properties of undefined`, loin de sa cause.
> **Balayer tous les noms DECLARES par le bloc, pas ses sortants.**

**Q11 — La passe fantome redessine 86-87 % des unites a chaque frame : on la borne ?**
*Ajoutee le 2026-08-22, nee de la mesure de Q9. Detail en fin de **P23**.*
`hidden` se leve des qu'un occulteur existe **quelle que soit sa hauteur**, et la passe fantome redessine
sans verifier que l'unite est reellement couverte. A l'ere 23, ~1 992 redessins translucides par frame,
dont la plupart tombent **pile sur une unite que rien ne cache**. Sur une carte GPU-bound, c'est un poste
reel — et c'est probablement ce que le reglage d'alpha en cours cherche a compenser.
**Hors perimetre de ce chantier** : la suppression du legacy n'y touche pas. A ouvrir a part.
*Ne bloque rien ici.*

**Q12 — Le departage d'egalite d'`isoUnitDepthEx` : on le corrige ?**
*Ajoutee le 2026-08-22, nee de la mesure de Q9. Detail en **P23**.*
Quand le lifteur et le plafonneur ont **exactement la meme cle peintre**, `lift = cle + T·0.02` perd
contre `cap = cle − T·0.02` : l'unite bascule de « juste apres les deux batiments » a « juste avant les
deux » et se fait avaler par le mur qu'elle longeait. **Ampleur : 2 cas sur 19 557 geometries legales
(0,01 %), exactement 2·epsilon a chaque fois, 0 occurrence en jeu sur 3 468 evaluations.**
La frontiere est **figee par un test** (`isoUnitDepth.test.js`), donc rien ne peut empirer en silence.
Corriger reviendrait a faire gagner le lifteur a cle egale — **decision de rendu, donc Raph**, et
probablement a rapprocher de Q11 (la meme egalite decide aussi du marquage fantome).
*Ne bloque rien. Ne PAS traiter dans ce chantier.*

