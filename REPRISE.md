# Point de reprise — 2026-07-02

Branche : `feat/routes-reseau-connecte` (part de `main`, **pas** mergée).
Ce fichier remplace la mémoire locale (qui ne suit pas d'un poste à l'autre).

---

## 1. Chantier ROUTES — ✅ TERMINÉ (validé en jeu par Raph)

- `8a1d275` — les routes **relient vraiment les bâtiments** (BFS multi-source, budget = nb de routes achetées) + **largeur par ère** + **bonus de production** (+10 % × couverture, `state.roadCoverage` lu par `roadNetworkMultiplier()` dans `production.js`). Étapes 1-5.
- `3830afb` — comblage des coins de jonction (étape intermédiaire, remplacée par le rendu final ci-dessous).
- **Rendu final** : chaussée en **APLAT continu** (couleur échantillonnée du tileset de l'ère, `streetRoadColors()` dans `pixelTerrain.js`) + **liseré tracé UNIQUEMENT contre le non-route** → les routes adjacentes fusionnent sans grille interne, à toutes les largeurs. Repli tuiles edge-Wang si l'échantillonnage échoue. Décision : procédural sans asset (la tentative d'asset de Raph était un aplat tan = le même rendu).
- **UI** : rangée `Routes` de la boutique → ligne « {Sentiers|Routes|Avenues|Boulevards} · X% relié (+Y%) » + tooltip (PurchaseRow.jsx, `roadNetworkInfo()`). Se rafraîchit via `globalMult` (le bonus routes y est composé).
- **Desc** `roads` (buildings.js) : mentionne le réseau et le +10 %.

- **Terre-plein décorable** ✅ : ruban végétalisé (kerb + gazon `#586034` + buissons/fleurs terracotta déterministes) rendu dans `pixelTerrain.js` depuis DEUX entités pures du layout : `L.median` (axes de rang avenue/main — apparaît au palier « Avenues », ei≥20, continu à travers les croisements) et `L.terrePlein` (couture entre deux voies exactement collées, `computeTerrePleinSegments`, géométrie rare mais couverte + testée). Toute déco future (arbres, lampadaires) itère ces mêmes entités.

### Restes optionnels (non bloquants)
- Routes construites tuile-par-tuile à l'achat (proposé, jamais demandé).
- Déco de terre-plein plus riche (arbres/lampadaires sur `L.median`/`L.terrePlein`).

---

## 2. Bâtiments SAVOIR — WIP (dans le commit de reprise)

7 bâtiments créés en pixel (stade 0, registre primitif/feu) : **académies, culte des ancêtres** (feu animé), **observatoires, bibliothèques, universités, imprimeries, think tanks**.

- Sprites : `public/pixelart/agents/buildings/` → `academies-prop-yard`, `ancestralcult-{back,fire,prop}`, `libraries-prop-archive`, `observatories-prop-dial`, `printing-prop-workshop`, `universities-prop-hall`, `think-prop-council`.
- Wiring : `src/game/map/engineSprites.js` (branches `blitProp`/`blitAnim`), `cityEngineSprites.js` (`PROP_KEYS` + `ANIM_BANDS` pour `ancestralcult-fire`), `scripts/buildPalette.mjs` (tags `feu`).
- **Règles DA** : bâtiment fermé = zone **carrée** ; éléments à ciel ouvert (observatoire, culte, cercle de débat) = zone **ronde** ; **toit visible** (vue 3/4 constante) ; signal d'identité **gros et visible**.
- ⚠️ `master-palette.json/.gpl` et `palettes/*.png` **pas** régénérés exprès (travail terracotta en cours).

---

## 3. Terracotta — WIP (dans le commit de reprise)
`src/game/data/eraThemes.js` — refonte palette anti-jaune : cœur `goldSand`→`clayCopper` + accents bois/pierre en terre cuite. Fils ouverts : or chrome (`--brand-gold*` dans `variables.css`) et stellaire non touchés.

---

## Comment tester
- `npm run dev` — le jeu (recharge dur après tout edit des modules carte, cf. pièges).
- `npx vitest run` — suite complète. Carte seule : `npx vitest run src/game/map` (44/44 verts au dernier point).

## Pièges connus (IMPORTANT)
- **Preview blanchit au zoom** / captures blanches → juger le rendu carte dans le vrai `npm run dev`, pas via capture.
- **`forceFrame` plante** (`setTransform` null) sur villes moyennes/grandes (~pop ≥ 2e5).
- **Ne jamais** setter `state.population` avec un objet plat `{mantissa,exponent}` → boucle infinie → **fige le thread**. Utiliser un Decimal.
- **HMR périmé** sur `layout.js` / `renderWorld.js` / `pixelTerrain.js` / `cityMapRuntime.js` → **full-reload** obligatoire avant de vérifier.
- **Navigation bloquée si rupture 100 %** (« Résolvez la crise ») → cliquer « Effondrer la Cité » + choisir un legs pour re-monter la carte.
- Commits avec message à guillemets : passer par `git commit -F fichier` (les here-strings PowerShell cassent).

## Fichiers clés
- `src/game/map/pixelTerrain.js` — sol + rues pixel edge-Wang (`drawPixelTerrain`, `streetRoadFill`).
- `src/game/map/layout.js` — plan **pur** (`computeCityLayout`, `connectBuildingsToNetwork`, `roadMedian`, `computeMedianSegments`).
- `src/game/map/cityMapRuntime.js` — boucle `frame` + canvas offscreen (static/tile). ⚠️ le SOL est redessiné **live** chaque frame (pas dans le cache).
- `src/game/map/renderWorld.js` — routes/eau **procédurales** (utilisées seulement si `pixelRoads` OFF).
- `src/game/core/mechanics/production.js` — sim **pure** (`roadNetworkMultiplier()` lit `state.roadCoverage`).

---

## Audit perf/robustesse — ✅ FAIT 2026-07-02

**Corrigé (tests 191/191, build prod OK)** :
1. **Sol pixel en cache offscreen** (`CM.groundCanvas`, cityMapRuntime) — le sol (procédural + tuiles pixel + relief) était redessiné live chaque frame (~7 ms/frame, indépendant de la taille de ville). Bake keyé caméra/layout/flags, blit par frame, retry tant que les tilesets chargent (`CM._groundBakeStable`), ordre sol→rivière (live)→blit intact. **Frame mesurée : 18,5 → 4,8 ms.** Bonus : `resize()` no-op à dimensions inchangées (réallouer un canvas l'efface et cassait tous les caches à chaque `forceFrame`).
2. **Anti-freeze** (num.js) : `toNum({mantissa,exponent})` → NaN → boucle infinie du placement → thread figé. `toNum` ne renvoie plus jamais NaN ; `D()` reconstruit les Decimals déshydratés. + `num.boundary.test.js`. Scénario du gel rejoué en live : layout valide en 55 ms.
3. **Crash `setTransform` null** : c'était la carte DÉMONTÉE (`resetCityMapRuntime` nullifie ctx/canvas ; l'écran de crise à pop ≥2e5 démonte la vue) + `forceFrame`/frame rAF attardés. Gardes aux 3 points ; une frame orpheline ne se replanifie plus.
4. **`state.roadCoverage` persisté** (hydrateState) : il était perdu au chargement → l'offline se calculait sans le bonus routes.
5. **HMR carte fiable** : plugin `mapFullReloadPlugin` (vite.config.js) → tout edit de `src/game/map/` = FULL RELOAD auto (vérifié au canari). Le mécanisme du piège : les hot-updates s'arrêtaient au boundary React `CityMapCanvas.jsx` pendant que la boucle rAF gardait l'ancien code. `import.meta.hot.decline()` est un NO-OP dans Vite moderne — ne pas s'y fier.

**Mesures utiles** (petite ville, viewport ~1270×1300, zoom 1,6) : frame chaude 4,8 ms ; bake arbres 11,4 ms (payé au mouvement caméra) ; sol pixel isolé 6,6-7,1 ms (désormais amorti par le cache).

**✅ CHANTIER LAYOUT LATE GAME — FAIT 2026-07-02** : `connectBuildingsToNetwork` (le BFS de connexion des routes) dominait à ~65 % — il refaisait un BFS complet en Map/Set de clés STRING pour CHAQUE bâtiment connecté, en rescannant toutes les tuiles. Réécrit en grilles typées (`Uint8Array` obstacles/routes, `Int32Array` dist/from, file plate, parents encodés même hors-grille) en préservant l'ordre BFS exact → **layout bit-à-bit identique** (hash FNV des tuiles+routes inchangé sur 3 tailles). Mesures browser réelles (médiane ×3) :
| pop | gridN | avant | après |
|---|---|---|---|
| 1e12 | 48 | 237 ms | **107 ms** |
| 1e23 | 92 | 1,38 s | **327 ms** |
| 1e30 | 148 | 4,39 s | **780 ms** |

**Outillage laissé en place** : profileur de phases dans `computeCityLayout` (`globalThis.__layoutProfile = true` → `globalThis.__layoutProfileLast = {total, <phase>: ms}`, coût nul éteint). Breakdown gridN 148 restant : decor ~78 ms, cellules ~45, connexion ~38, routes-gen ~32, riviere ~24, median ~23, urbain ~19 (node ; ×~2,7 en browser).

**Si un jour il faut encore gagner** (dans l'ordre de rendement) : (1) précalculer le SEUIL d'`organicLimit` par cellule (Float64Array, une passe N² — sert cellules/urbain/placement) ; (2) `roadMedian`/`median` sur grilles typées ; (3) profiler `decor` (placeCategorySlotted / footprintFits en Set-string) ; (4) Web Worker (layout pur, mais lit `state` global + `ensureMapSeed`/slots mutent → à décorréler d'abord).
