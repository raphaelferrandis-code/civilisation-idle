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

## Audit perf/robustesse — prompt pour une nouvelle conversation

> Audit perf + robustesse du moteur de carte de « Civilisation: Effondrement Idle » (idle game React + Canvas 2D). Le rendu ville est dans `src/game/map/` : `cityMapRuntime.js` (boucle frame + caches offscreen static/tile), `layout.js` (calcul du plan, censé pur), `pixelTerrain.js` (sol/rues pixel edge-Wang), `renderWorld.js` (routes/eau procédurales), `production.js` (simulation pure).
>
> Fais un audit approfondi (perf, robustesse, couplages) puis IMPLÉMENTE les correctifs à fort ratio impact/effort, avec vérification (`npx vitest run` + instrumentation). Pistes prioritaires :
> 1. **Sol pixel redessiné LIVE chaque frame** : `pixelTerrain.js drawPixelTerrain` appelé à chaque frame depuis `cityMapRuntime.js` (~l.890, « sol ET rivière ne sont PAS dans ce canvas ») — boucle 4 couches/cellule sur le viewport alors que c'est statique entre mouvements caméra. Envisager un cache offscreen blitté en préservant l'ordre sol→rivière→blit.
> 2. **Freeze thread si `state.population` n'est pas un Decimal valide** : objet plat `{mantissa,exponent}` casse le dimensionnement de grille → boucle infinie (layout.js). Ajouter garde/normalisation à l'entrée de `computeCityLayout`.
> 3. **Crash `setTransform` null** sur grandes villes (pop ≥ ~2e5) : vérifier `CM.ctx/sctx/tctx` (`cityMapRuntime.js` l.76/790/887). Reproduire puis corriger, ou confirmer artefact.
> 4. **Couplage sim↔rendu** : `production.js roadNetworkMultiplier()` lit `state.roadCoverage`, écrit seulement par la carte (`cityMapEnsureLayout`). Hors carte/offline la valeur est figée → bonus faux. Évaluer un calcul de couverture côté sim (pur).
> 5. **HMR périmé** sur les modules carte : ajouter `import.meta.hot.accept` pour ré-importer les fns de rendu.
> 6. **Coûts/frame secondaires** : corner-fill des routes (pixelTerrain.js), BFS `connectBuildingsToNetwork` O(N²) (layout.js), recompute complet du layout à l'achat d'une route.
>
> Livrable : diagnostic priorisé (impact × effort), correctifs implémentés + tests verts + note sur le reste. Attention : le preview blanchit au zoom (bug connu, pas la cible).
