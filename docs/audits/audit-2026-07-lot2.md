# Audit CE 0.3 — Lot 2 : carte (`src/game/map/**`) + composants (`src/components/**`) + hooks + CSS

**Date :** 2026-07-12 · **Mode :** lecture seule (aucun fichier du code modifié ; ce rapport est le seul fichier créé).
**Méthode :** fan-out multi-agents (6 pistes de régression + 6 dimensions perf/canvas/UI), **chaque finding haut-sévérité re-vérifié adversarialement** par un agent indépendant + contre-lecture manuelle des points de contact sim↔rendu. Règle « grep avant d'affirmer » appliquée (usages dynamiques, hooks debug `globalThis.__*`, JSX conditionnel, imports lazy, scripts headless `sim-10-profils.js`/`simulate-ce.js` inclus dans les recherches).

---

## 0. Portes de qualité (exécutées AVANT l'audit)

| Porte | Commande | Résultat | Détail |
|---|---|---|---|
| Lint | `npx eslint .` | ❌ **ROUGE** | `✖ 117 problems (114 errors, 3 warnings)` — voir **B-01** |
| Tests | `npx vitest run` | ❌ **ROUGE** | `Tests 2 failed | 715 passed (717)` — voir **B-02** |
| Build | `npm run build` (`vite build`) | ✅ **VERT** | `✓ built in 1.82s`, 136 modules |

> Deux portes échouent → documentées en tête comme findings **BLOQUANT** (B-01, B-02), conformément à la consigne. **Nuance importante :** le *build produit* passe et le jeu tourne — aucune de ces deux défaillances ne casse le runtime. Le lint n'est pas un gate de build/test ici (aucune dépendance croisée), et l'échec de test est un écart flottant d'1 ULP sur un golden-master du **cœur** (périmètre lot 1). Elles restent BLOQUANT au sens « une porte de qualité est rouge », pas au sens « le jeu est cassé ».

### Périmètre exact

**Lus intégralement (contre-lecture manuelle de l'auditeur, en plus des agents) :**
`src/game/map/layout.js` (§ `computeCityLayout` 1116-1170, `connectBuildingsToNetwork` 835-1018, dimensionnement/guards), `src/game/map/cityMapRuntime.js` (§ gating recompute 490-595, boucle `frame` 1033-1090, resize/getContext 70-120 & 979-1031, offscreen 996/1301), `src/game/map/renderWorld.js` (§ terrain offscreen 324-452), `src/game/core/mechanics/production.js` (§ `roadNetworkMultiplier` 158-168, `infraMultiplier`/`globalMultiplier` 330-407), `src/components/ui/PurchaseRow.jsx` (intégral), `src/components/ui/BuildingShop.jsx` (§ souscriptions 40-100), `src/components/map/CityMapCanvas.jsx` (intégral), `src/game/map/loadCityMapScripts.js` (intégral), `src/App.jsx` (§ montage des vues), `eslint.config.js` (intégral).

**Lus intégralement par les agents dédiés :** `src/hooks/useGameState.js`, `useCityViewState.js`, `useCollapsiblePanel.js` ; `src/components/ui/OdometerNumber.jsx`, `RollingNumber.jsx`, `ChronicleTicker.jsx`, `CrisisActionBar.jsx`, `BuyToolbar.jsx`, `Topbar.jsx`, `CityStatusPanel.jsx` ; `src/components/views/{RuinsView,RuinsTreePixel,HeritageView,PrestigeView,MythsView,CityView}.jsx` + `ruinsTree/{TreeNode,NodeTooltip}.jsx`, `branchTheme.js` ; `src/components/dialogs/{DebugDialog,OptionsDialog}.jsx` ; `src/game/map/iso/{isoRenderer,projection}.js`, `pixelTerrain.js`, `pixelRiver.js`, `cityEngineSprites.js`, `engineSprites.js`, `pixelHouses.js`, `buildingShapes.js`, `pixelBridge.js`.

**Survolés (grep ciblé / points de contact seulement) :** `src/game/core/state.js` (contrat subscribe/notify + hydratation `roadCoverage`), `tick.js` (croissance `state.infrastructure`), `main.js` (`notify()` par tick), CSS (`purchase.css`, `ruinsTree.css`, `views-*.css`, `variables.css` — pour les tokens d'état d'achat).

**Hors périmètre (audité au lot 1) :** cœur logique `src/game/core/**` sauf les points de contact sim↔rendu explicitement listés (`roadNetworkMultiplier`, `roadCoverage`, `infraMultiplier`/`globalMultiplier`, `toNum`, croissance infra).

---

## 1. Tableau de synthèse (trié par sévérité décroissante)

| ID | Sévérité | Catégorie | Fichier:ligne | Résumé |
|---|---|---|---|---|
| **B-01** | BLOQUANT | gate/lint | `package.json:10` · `eslint.config.js:8` | `npx eslint .` rouge : 114 erreurs (refs-in-render + no-unused-vars + globals Node) |
| **B-02** | BLOQUANT | gate/test · float | `src/game/core/__tests__/economy.golden.test.js:104` | `foragers x25` : golden Decimal diverge d'1 ULP flottant (`…952` vs `…955`) — cœur/lot 1 |
| **M-01** | MAJEUR | perf-react · float | `src/components/ui/PurchaseRow.jsx:233` | `arePropsEqual` compare `globalMult` (dérive chaque tick via `infraMultiplier` continu) → memo défait, **toutes les rangées re-render 1×/s** |
| **M-02** | MAJEUR | incohérence sim↔rendu | `src/game/map/cityMapRuntime.js:565` | `roadCoverage` produit **uniquement** par la carte ; sims headless le laissent à 0 → balancing sous-estime la prod du bonus routes (+10..15 %) |
| **M-03** | MAJEUR | correctness/lint | `src/components/ui/OdometerNumber.jsx:136` | Écriture/lecture de refs pendant le render + `key={pulseRef.current}` (7 erreurs `react-hooks/refs`), non concurrent-safe |
| **m-01** | MINEUR | perf-map | `src/game/map/cityMapRuntime.js:523` | Un achat de route déclenche un `computeCityLayout` **complet** (throttlé 1,5 s), pas une simple MAJ réseau |
| **m-02** | MINEUR | state-consistency | `src/game/core/mechanics/upgrades.js:58` | Nœud Ruines « palier gaté » et « trop pauvre » → même gris `rt-locked` ; tooltip ambre vs gris → granularité incohérente |
| **m-03** | MINEUR | state-consistency | `src/components/views/HeritageView.jsx:155` | Cartes Héritage sans classe d'abordabilité (juste `bought`) ≠ boutique (`is-affordable`/`is-locked-cost`) |
| **m-04** | MINEUR | a11y | `src/components/views/HeritageView.jsx:167` | Boutons `disabled` sans `aria-disabled`/`title` (Héritage, Prestige, boutique) ≠ `TreeNode` focusable |
| **m-05** | MINEUR | perf-react | `src/hooks/useGameState.js:15` | `shallowEqual` 1 niveau : 2 invariants non documentés (sélecteurs plats / pas de réf mutée en place) |
| **m-06** | MINEUR | perf-react | `src/hooks/useGameState.js:42` | `getSnapshot` mute `lastValueRef` **pendant le render** (diverge du shim officiel) ; risque en concurrent |
| **m-07** | MINEUR | perf-react | `src/components/ui/ChronicleTicker.jsx:20` | Re-render chaque tick via `tickNow` même sans dépêche visible |
| **m-08** | MINEUR | correctness | `src/components/ui/RollingNumber.jsx:91` | `key={tickRef.current}` : ref lue au render, incrémentée en effet (1 erreur `react-hooks/refs`) |
| **m-09** | MINEUR | perf-react | `src/components/ui/CrisisActionBar.jsx:244` | Reconstruit tous les descripteurs de foyers (conv. Decimal→number) chaque tick, même accordéon fermé |
| **m-10** | MINEUR | canvas-invalidation | `src/game/map/cityMapRuntime.js:1122` | Clé du bake décor statique inclut `nightF` mais pas `now` → sur-invalide (~20 re-bakes/cycle) ET gèle la pulsation néon |
| **m-11** | MINEUR | duplication | `src/game/map/iso/isoRenderer.js:351` | Peintres iso vs legacy top-down dupliqués (fleuve/nuit/navires/véhicules/ponts) |
| **m-12** | MINEUR | canvas-lifecycle | `src/game/map/cityMapRuntime.js:82` | Aucun clamp des dimensions canvas vs limite navigateur (~8192 px) — risque latent 8K/multi-écran, **pas** lié à la population |
| **m-13** | MINEUR | canvas-lifecycle | `src/game/map/cityMapRuntime.js:1000` | `getContext('2d')` des 3 offscreen non vérifié null avant `setTransform` → crash init si contexte perdu/épuisé |
| **m-14** | MINEUR | canvas-lifecycle | `src/game/map/cityMapRuntime.js:986` | `getContext` principal non vérifié : si null, `CM.inited` reste true → tailles offscreen NaN |
| **n-01** | NETTOYAGE | config | `eslint.config.js:8` | ESLint n'ignore pas `.claude/worktrees` (erreurs ×3) ni `sim-10-profils.js` (globals Node) |
| **n-02** | NETTOYAGE | robustesse | `src/game/map/layout.js:773` | Finitude de `popDepth` vs `Infinity` implicite (repose sur les clamps aval) |
| **n-03** | NETTOYAGE | dev-hook | `src/game/map/layout.js:1142` | `__nCapOverride` non validé `isFinite` (double-override dev pourrait neutraliser la borne) |
| **n-04** | NETTOYAGE | canvas-cache | `src/game/map/renderWorld.js:405` | Sous-cache `CM_TERRAIN` (hillshade) redondant depuis le bake sol offscreen |
| **n-05** | NETTOYAGE | doc-comment | `src/game/map/cityMapRuntime.js:513` | Commentaire trompeur : dit `roadCount` « dans sig seulement » alors qu'il est aussi dans `structSig` |
| **n-06** | NETTOYAGE | perf-layout | `src/game/map/layout.js:1002` | Résidu `O(P²)` : la boucle de sélection rescanne `pending` à chaque carve (borné, ~qq ms/recompute) |
| **n-07** | NETTOYAGE | canvas-lifecycle | `src/game/map/cityEngineSprites.js:326` | `propPivot` + `propBBox` : 2 décodes `getImageData` de la même image |
| **n-08** | NETTOYAGE | dead-code | `src/game/map/pixelHouses.js:103` | Réaffectation redondante `c.width/height` après `new OffscreenCanvas` (idem `isoRenderer.js:66`) |
| **n-09** | NETTOYAGE | dead-code | `src/game/map/iso/isoRenderer.js:20` | Imports/vars inutilisés (`blitPropRot`, `ISO_DIAG`, `kind`, `now`, `z`, `sp`) |
| **n-10** | NETTOYAGE | dead-code | `src/game/map/cityEngineSprites.js:2152` | `flap` calculé jamais lu + `catch (e)` ×2 inutilisés |
| **n-11** | NETTOYAGE | dead-code | `src/game/map/buildingShapes.js:60` | `drawTinyCamp` : 4 paramètres inutilisés (`pad`, `seed`, `variant`, `now`) |
| **n-12** | NETTOYAGE | dead-code | `src/game/map/pixelBridge.js:149` | Paramètre `now` inutilisé dans `drawPixelBridges` |
| **n-13** | NETTOYAGE | doc-comment | `src/game/core/state.js:72` | Commentaire périmé « en prévision de la Phase 3 » (le système est le cœur du rendu) |
| **n-14** | NETTOYAGE | nettoyage | `src/components/ui/BuyToolbar.jsx:15` | Tableau `modes` recréé à chaque render (hisser au module) |
| **n-15** | NETTOYAGE | design-token | `src/components/views/ruinsTree/branchTheme.js:12` | Pas de token couleur partagé « achetable/bientôt/verrouillé » ; ambre `#e0b057` en dur |
| **n-16** | NETTOYAGE | i18n | 8 fichiers (voir D) | Inventaire textes hardcodés (prépa lot 3) : ~25 chaînes dans 8 composants |

---

## A. Régression — audit carte du 1er juillet (statut des 6 pistes)

> **Synthèse : 3 CORRIGÉ, 3 PARTIEL, 0 OUVERT.** Toutes les évaluations ci-dessous ont été confirmées par un agent vérificateur indépendant (verdict entre parenthèses) **et** contre-lues manuellement.

| # | Piste | Statut | Verdict vérif. |
|---|---|---|---|
| A1 | Garde/normalisation input population + borne max d'itérations | ✅ **CORRIGÉ** | CONFIRMED |
| A2 | Cache offscreen sol/rivière | ✅ **CORRIGÉ** | CONFIRMED |
| A3 | Clamp dimensions canvas + gardes ctx null | ⚠️ **PARTIEL** | CONFIRMED |
| A4 | `roadCoverage` = fonction pure partagée sim↔carte | ⚠️ **PARTIEL** | CONFIRMED |
| A5 | `roadCount` sorti du recompute complet de layout | ⚠️ **PARTIEL** | CONFIRMED |
| A6 | BFS `connectBuildingsToNetwork` O(N²) | ✅ **CORRIGÉ** | CONFIRMED |

### A1 — Garde population + borne d'itérations · ✅ CORRIGÉ

**Preuve.** Normalisation (côté **float natif** — la population `Decimal` break_infinity est convertie *avant* le layout) :
- `src/game/core/num.js:69-73` — `toNum()` : `value.toNumber()` pour Decimal, sinon `Number(value)`, `Number.isNaN(n) ? 0 : n` (NaN→0).
- `src/game/map/layout.js:769` — `const lg = (v) => Math.log10(Math.max(0, v) + 1);` (négatifs neutralisés) ; `layout.js:773` — `const popDepth = lg(toNum(s.population));`.

Bornes d'itération :
- `layout.js:1142-1143` — `const NCAP = Math.floor((globalThis.__nCapOverride) || 360);` puis `while (N*N*packFactor < total + … && N < NCAP) N += 2;` → **borne structurelle `N < NCAP` (360)**, `packFactor ∈ [0.13, 0.27] > 0` rend aussi la condition de coût auto-terminante.
- `layout.js:996-998` — `let guard = tiles.length + 8; while (guard-- > 0 && pending.length > 0)` (garde décrémentale sur la boucle de connexion).
- `layout.js:964` — `for (let steps = 0; steps <= NN; steps += 1) { // garde-fou absolu` (remontée de chemin).

**Analyse.** `Infinity` (population > ~1e308 en ères transcendantes) n'est pas neutralisé par `toNum` mais **systématiquement absorbé en aval** : `popFill` via `Math.min(popDepth, 10)` (788), `houses`/`campTier`/`megaDistricts` via `cmClamp(…)` (247, 793, 809-810). `total` reste donc fini et borné → aucune boucle quasi-infinie possible sur input dégénéré (NaN/négatif/Infinity/très forte pop). Les **deux** exigences (garde ET borne) sont satisfaites.

**Impact / correction.** Aucune correction fonctionnelle requise. Voir sous-findings **n-02** / **n-03** (durcissement défensif facultatif). Effort : N/A.

### A2 — Cache offscreen sol/rivière · ✅ CORRIGÉ

**Preuve.**
- **SOL** baké une fois et re-blitté : `cityMapRuntime.js:1144-1152` — `cityMapBakeMargin(CM.groundCanvas, CM.gctx, '_groundBake', …)` puis `cityMapBlitMargin(CM.groundCanvas, '_groundBake')`. Garde de re-bake réelle à `cityMapRuntime.js:138` (`|px|>M || |py|>M`, M=256) → pan sous la marge = **aucun** redraw cellule/frame. Clé d'invalidation `_otherGround` (`1141-1143`) = `zoom + layoutRecomputeAt + healthF + timeWear + flags` → ère/taille/pop/layout re-bakent, pan léger non.
- **RIVIÈRE** dessinée live *volontairement* car **animée** : `cityMapRuntime.js:1167` → `pixelRiver.js:142,150` (`const tsec = (now||0)/1000; const sx = tsec * ly.speed * T * ly.dirX;`), avec culling viewport∩bbox (`pixelRiver.js:136-138`) + clip au ruban.

**Analyse.** Le cache sol est présent et correctement invalidé (ni trop souvent — la pop pure passe par le fast-path `skipStable` sans re-bake —, ni jamais). La rivière est légitimement live (un buffer statique gèlerait le courant). Voir **n-04** (sous-cache `CM_TERRAIN` devenu redondant).

**Impact / correction.** Aucune correction nécessaire. Effort : N/A.

### A3 — Clamp dimensions canvas + gardes ctx null · ⚠️ PARTIEL

**Preuve.**
- ✅ DPR plafonné : `cityMapRuntime.js:76` — `const dpr = Math.min(window.devicePixelRatio || 1, CM_MAX_RENDER_DPR);` (`CM_MAX_RENDER_DPR = 1.5`).
- ✅ Gardes `ctx` sur la boucle : `cityMapRuntime.js:75` (`if (!CM.ctx) return;`), `:1042` (`if (!CM.ctx || !CM.canvas) return;`), `:1284`.
- ✅ **La population n'entre PAS dans la taille du canvas** : `cityMapRuntime.js:77-92` — dimensions = `canvas.clientWidth/clientHeight × dpr + marge fixe M`. La ville est dessinée par transformation caméra ⇒ le canvas reste de la taille de l'écran quelle que soit la pop. **La prémisse « canvas géant à forte population » est réfutée.**
- ❌ **Aucun clamp** de `nw/nh/onw/onh` contre la limite navigateur (~8192 px) → **m-12**.
- ❌ `getContext('2d')` des offscreen non vérifiés null → **m-13** / **m-14**.

**Analyse.** Le vecteur « forte population » est inexistant (bien plus rassurant que l'hypothèse d'origine), mais deux durcissements manquent : robustesse **grands écrans** (8K/spanning) et **perte/épuisement de contexte 2D**. D'où PARTIEL.

**Impact / correction.** Voir **m-12/m-13/m-14** ci-dessous. Ne PAS présenter ce durcissement comme un fix « forte population ». Effort global : S.

### A4 — `roadCoverage` fonction pure partagée sim↔carte · ⚠️ PARTIEL

**Preuve du flux complet :**
- CALCUL (carte) : `layout.js:1938` — `const netCover = connectBuildingsToNetwork({ … roadBudget, connectorRank });` → `layout.js:2021` `roadCover: netCover` (retour de `computeCityLayout`).
- ÉCRITURE (carte, **writer unique**) : `cityMapRuntime.js:564-565` — `const rc = L.roadCover; state.roadCoverage = (rc && rc.engineTotal > 0) ? rc.engineConnected / rc.engineTotal : 0;`
- LECTURE (sim) : `production.js:164` — `const cov = state.roadCoverage;` (dans `roadNetworkMultiplier`, `163-168`).
- AFFICHAGE : `PurchaseRow.jsx:33` — `const cov = state.roadCoverage;` (même valeur, aucun recalcul).
- PERSISTANCE : `state.js:172` défaut `roadCoverage: 0` ; `state.js:899` `clamp01(finiteNumber(source.roadCoverage, base.roadCoverage))`.
- HEADLESS : `grep roadCoverage` dans `simulate-ce.js` = « No matches found » ; absent de `sim-10-profils.js`. `computeCityLayout` n'est appelé QUE par `cityMapRuntime.js:542` — **jamais dans le tick moteur ni les sims headless**.

**Analyse.** La prémisse A4 (« `roadCoverage` = fonction PURE de l'état sim dans `production.js`, la carte ne fait que visualiser ») est **inversée dans le code** : c'est la **carte** qui calcule géométriquement (BFS distance-réelle) et écrit dans le state ; le sim et l'UI ne font que lire. Côté « deux calculs divergents » c'est **sain** (source unique, aucun double-calcul). MAIS la valeur est **géométrique** donc non reproductible hors carte → voir **M-02** (divergence environnement headless ↔ jeu monté). D'où PARTIEL (source unique OK, pureté sim non satisfaite).

**Impact / correction.** Voir **M-02**. Effort : M (option fonction pure) ou S (documenter l'écart assumé).

### A5 — `roadCount` sorti du recompute complet · ⚠️ PARTIEL

**Preuve.**
- `cityMapRuntime.js:516` — `roadCount` **dans `sig`** ; `cityMapRuntime.js:523` — `roadCount` **aussi dans `structSig`** → un achat de route rend `structSig != CM.layoutStructSig` et **saute le fast-path** `525-529` (qui ne touche que `t.level`).
- `cityMapRuntime.js:533` — `coreSig` **sans** `roadCount` → `coreChanged` reste false sur achat route-seule, donc la garde throttle `535` (`(now - layoutRecomputeAt) < 1500 → return`) s'applique.
- `cityMapRuntime.js:542` — chemin pris : `const L = computeCityLayout(state);` (**layout ENTIER** : rues, bâtiments, arbres, districts, fleuve, médians, graphe). Le seul usage de `roadCount` côté layout est `roadBudget` → `connectBuildingsToNetwork` (`layout.js:1932-1941`), appelé uniquement *dans* `computeCityLayout`.

**Analyse.** Le volet **anti-rebuild-par-achat** est traité (throttle ≤1/1500 ms, rafales coalescées). Mais le volet **« sorti du recompute complet »** n'est **pas** réalisé : un achat de route (fenêtre throttle écoulée) régénère l'intégralité du layout, pas seulement la couche réseau. Coût atténué (générateur déterministe via `mapSeed` → géométrie visuellement stable) mais le CPU d'un `computeCityLayout` complet est bien payé. D'où PARTIEL. Voir **m-01** + **n-05** (commentaire trompeur).

**Impact / correction.** Voir **m-01**. ⚠️ Ne PAS retirer `roadCount` de `structSig` (les achats passeraient par le fast-path `525` qui n'update que `t.level` → `roadCoverage`/graphe jamais rafraîchis). Effort : L (chemin incrémental réseau-seul) ou S (documenter comme intentionnel).

### A6 — BFS `connectBuildingsToNetwork` O(N²) · ✅ CORRIGÉ — **bucket-grid NON justifié**

**Preuve (la régression O(P·N²) est déjà corrigée dans le code) :**
- Champ de distance BFS multi-source calculé **UNE fois** : `layout.js:886-916` (`dist`/`from` en `Int32Array`), appelé une seule fois hors boucle en régime par défaut `layout.js:997` (`if (useIncr) computeField();`, `useIncr = !(globalThis.__incrConnect === false)` → vrai par défaut).
- MAJ **incrémentale bornée** après chaque carve : `layout.js:930-949` `relaxFrom(attach, path)` — seed depuis la seule route ajoutée, relaxe uniquement les cellules améliorées (`if (dist[ni] !== -1 && dist[ni] <= d + 1) continue;`).
- Le « plus proche seuil » par bâtiment **lit** le champ pré-calculé sur l'emprise (`layout.js:952-961`) → **O(footprint)**, ne scanne PAS toutes les routes.
- Le recompute complet par bâtiment n'existe que dans le fallback A/B dev `layout.js:999` (`if (!useIncr) computeField();`).
- Le commentaire du code documente la régression historique corrigée (`layout.js:845-849` : « dominait le layout… ~65 %, ~2,9 s à gridN 148 »).

**Analyse chiffrée.** Complexité réelle (régime défaut) : 1× `computeField` O(N²) (NN ≤ 129 600 à NCAP=360, `Int32Array` ≈ 1-3 ms, **partagé** par tous les bâtiments) + boucle de sélection **O(P²) en nombre de tuiles** (P = tuiles non adjacentes à une route ; décoratifs posés à ≤4 cellules d'une route via `HOUSE_ROAD_RADIUS=4`) + `relaxFrom` amorti faible. Estimation pessimiste très late : P≈300-500 → ~5-12 M ops **une fois par recompute** (pas par frame), mineur face aux passes O(N²) du layout.

**Verdict sur l'optim.** **NE PAS implémenter le bucket-grid** : il accélérerait une recherche « bâtiment → plus proche nœud route » **qui n'existe plus** (le nearest vient d'un champ de distance partagé). Le seul résidu est un `O(P²)` de re-planification (**n-06**) qui, si un jour il fallait le grignoter, appellerait un tas min — pas un bucket-grid — et seulement après profilage. Effort : N/A (aucune action requise).

---

## B. Performance React

### M-01 · MAJEUR · `src/components/ui/PurchaseRow.jsx:233` — `arePropsEqual` défait le memo à chaque tick

**Problème.** Le `React.memo(PurchaseRow, arePropsEqual)` (v0.4) **existe bien** (`PurchaseRow.jsx:238`) — mais son comparateur inclut `prev.globalMult === next.globalMult` (`:233`), et `globalMult` **dérive à chaque tick**. La mémoïsation est donc intégralement défaite en mid/late game.

**Preuve (chaîne re-vérifiée manuellement + par agent) :**
- `production.js:332-334` — `infraMultFromLog = 1 + log10*0.018` (**continu**, aucun palier).
- `production.js:336-338` — `infraMultiplier() = infraMultFromLog(Math.log10(toNum(state.infrastructure) + 1))`.
- `production.js:392` — `globalMultiplier()` multiplie `infraMultiplier()` dans le produit.
- `tick.js:100` — `state.infrastructure = D(state.infrastructure).add(r.infrastructure.mul(dt)).max(0)` → **infrastructure bouge chaque tick** dès que la prod est non nulle (cas normal mid/late).
- `BuildingShop.jsx:92` — `const globalMult = useGameState(() => globalMultiplier());` ; commentaire `88-91` « piecewise-constant » → **factuellement FAUX**.
- `BuildingShop.jsx:197` — `globalMult` passé à chaque `<PurchaseRow>` ; `PurchaseRow.jsx:233` — comparé par `===` sans arrondi.

**Frontière float.** `globalMult` est un **number natif** (pas Decimal), comparé par `===` → la moindre dérive d'ULP casse l'égalité.

**Impact joueur/dev.** À chaque tick (1 Hz), `BuildingShop` se re-render ET **chaque rangée** (~10-20) se re-render : `fmtShort(prices)` (`:196`), `production.map`, `splashSrcFor(b.id, currentEraIndex())` (`:73`), `new Set(lackingKey.split(','))` (`:76`), `roadNetworkInfo()`. Toute l'architecture anti-re-render (signatures d'abordabilité, `costById` mémoïsé, `memo(BuildingShop)`) est annulée pour ce chemin — **contraire à l'intention documentée**.

**Correction recommandée (ne PAS appliquer).** Rendre `globalMult` réellement piecewise-constant *pour l'affichage* : arrondir avant de passer ET de comparer — p.ex. `BuildingShop.jsx:92` `const globalMult = useGameState(() => Math.round(globalMultiplier() * 1e4) / 1e4)` (variation < 0,01 %/s imperceptible). Alternative : retirer `globalMult` de `arePropsEqual` et rafraîchir les `/s` sur changement de `count`/abordabilité, ou recalculer `production` dans `PurchaseRow` à partir d'entrées stables. **Effort : M.**

### M-03 · MAJEUR · `src/components/ui/OdometerNumber.jsx:136` — refs pendant le render + `key={pulseRef.current}`

**Problème.** Écriture (`shapeRef`/`pulseRef`) et lecture (`targetRef`/`fromRef`) de refs **pendant le render**, avec `pulseRef.current` utilisé comme `key`.

**Preuve.**
- `OdometerNumber.jsx:135-139` — `const shape = \`${count}|${suffix}\`; if (shapeRef.current !== shape) { shapeRef.current = shape; pulseRef.current += 1; }`
- `OdometerNumber.jsx:185` — `<span className="odo roll-pulse" key={pulseRef.current}>`
- `OdometerNumber.jsx:130-132` — `const ratePerSec = resting ? 0 : (targetRef.current - fromRef.current) / (duration / 1000);` (refs écrites dans l'effet `91-93`).
- `npx eslint src/components/ui/OdometerNumber.jsx` → **7 erreurs `react-hooks/refs`** (132:8, 132:28, 136:7, 137:5, 138:5 ×2, 185:43).

**Impact.** Strictement **cosmétique** en jeu (animation d'odomètre — aucune corruption du nombre ni de l'état) : l'interpolation via `displayRef` reste correcte. Mais sous StrictMode dev et rendu concurrent React 19, un render abandonné peut muter `shapeRef` sans commit → l'anim `.roll-pulse` au franchissement K→M→B sautée/dupliquée, et `dialRate` lu depuis un segment périmé. **La sévérité MAJEUR tient par l'angle « lint cassé » (7 erreurs) + motif `key=ref.current` + fragilité concurrente.**

**Correction recommandée (ne PAS appliquer).** Dériver la key de la signature de forme sans ref : `key={shape}` (supprime `shapeRef`+`pulseRef` et l'écriture-au-render). Pour `ratePerSec`, poser le débit du segment dans un state via le rAF. **Effort : S.**

### m-05 · MINEUR · `src/hooks/useGameState.js:15` — `shallowEqual` 1 niveau, invariants non documentés

**Problème.** La mémoïsation de `getSnapshot` repose sur un `shallowEqual` à un seul niveau (`Object.is` par clé, `useGameState.js:15`). Deux invariants non documentés portent tous les sélecteurs.
**Preuve.** `useGameState.js:15` (`!Object.is(a[key], b[key])`). Corroboration `BuildingShop.jsx:44` — `useGameState(s => ({ ...s.buildings }))` : le spread est **obligatoire** car `building.js:79` mute `state.buildings[id] += amount` en place (un `s => s.buildings` direct serait comparé par identité et ne détecterait **jamais** l'achat).
**Impact.** (a) Un sélecteur renvoyant un objet/array **imbriqué** littéral → nouvelle réf/tick → re-render chaque tick + avertissement React « getSnapshot should be cached ». (b) Un sélecteur renvoyant une réf **mutée en place** → jamais détecté → UI figée. Respecté partout aujourd'hui, mais aucun garde-fou.
**Correction (ne PAS appliquer).** Documenter les 2 contraintes en tête de `useGameState.js` ; optionnel : warning dev-only si `getSnapshot` renvoie 2 réfs différentes pour une même version de store. **Effort : S.**

### m-06 · MINEUR · `src/hooks/useGameState.js:42` — `getSnapshot` mute une ref pendant le render

**Problème.** `lastValueRef.current = nextValue` exécuté **dans `getSnapshot`** (donc pendant le render), au lieu du pattern canonique `useSyncExternalStoreWithSelector` (mémo + validation en `useEffect`).
**Preuve.** `useGameState.js:31` (init) et `:42` (MAJ) ; StrictMode confirmé `main.jsx:6-9`.
**Impact.** En pratique OK (store 1 Hz synchrone, tests verts). Mais sous interruption de rendu (transition/Suspense futurs), un render abandonné **après** mutation de `lastValueRef` peut laisser une valeur jamais commitée → MAJ manquée dans un entrelacement rare.
**Correction (ne PAS appliquer).** Aligner sur le shim officiel (`use-sync-external-store/with-selector`) ou valider la dernière valeur commitée en `useEffect([value])`. **Effort : M.**

### m-07 · MINEUR · `src/components/ui/ChronicleTicker.jsx:20` — re-render chaque tick sans changement visible

**Problème.** `const tickNow = useGameState(() => renderCache.tickNow);` — sélecteur primitif qui change à chaque `notify()` → re-render garanti 1×/s, même quand aucune dépêche n'est visible.
**Preuve.** `ChronicleTicker.jsx:20` + `:40` (`visible = tickNow - latest.publishedAt < CHRONICLE_VISIBLE_MS`) ; `main.js:461-464` (`renderCache.tickNow = Date.now(); … notify();`).
**Impact.** Dépêche périmée (>60 s) → `visible` reste false mais le composant se re-render chaque seconde pour rien, indéfiniment (coût unitaire faible).
**Correction (ne PAS appliquer).** Armer un `setTimeout` à l'arrivée d'une dépêche plutôt qu'échantillonner `tickNow` à 1 Hz. **Effort : M.**

### m-08 · MINEUR · `src/components/ui/RollingNumber.jsx:91` — `key={tickRef.current}` (ref lue au render)

**Problème.** `return <span className="roll-pulse" key={tickRef.current}>{text}</span>;` avec `tickRef` incrémenté dans l'effet (`:66`).
**Preuve.** `RollingNumber.jsx:91` + `:66` ; eslint : `91:44 error Cannot access refs during render`.
**Impact.** La key utilisée au render est celle du tick **précédent** → remontage `.roll-pulse` décalé d'un commit, non concurrent-safe. Cosmétique ; contribue au lint rouge.
**Correction (ne PAS appliquer).** Tenir la key dans un state (`setPulseKey(k => k+1)` dans l'effet, sur vraie hausse). **Effort : S.**

### m-09 · MINEUR · `src/components/ui/CrisisActionBar.jsx:244` — descripteurs reconstruits chaque tick

**Problème.** La variante compacte (toujours visible dans l'en-tête Cité) s'abonne à `s.instability` (change chaque tick) et reconstruit **tous** les descripteurs de foyers/actions/réformes (avec `toNum`/`costSeconds` sur des Decimal) même accordéon fermé.
**Preuve.** `CrisisActionBar.jsx:244` (`useGameState(s => s.instability)`), `:274-276` (`pressureBreakdown()`, `crisisCosts()`, `rates()`), `:286-293` (`describeAction`/`describeRegAction` pour 4 foyers × N actions), `costSeconds` `:35-42`.
**Impact.** À 1 Hz, tout le jeu de descripteurs tactiques (Decimal→number + `regulationActionUnlocked`) rebâti à chaque tick, y compris `<details>` repliés. Travail borné mais récurrent sur un composant persistant.
**Correction (ne PAS appliquer).** `useMemo` sur les seules entrées mouvantes (signature de `costs`, `cycles`, somme `foyerReform`, `activePolicies`, `regulFatigue`) et/ou ne bâtir un foyer que si son `<details>` est ouvert. **Effort : M.**

### n-13 · NETTOYAGE · `src/game/core/state.js:72` — commentaire périmé

`// Rendre disponible le système d'abonnement en prévision de la Phase 3` — suivi de `const listeners = new Set();`, désormais cœur vivant du rendu (25 consommateurs `useGameState`). Réécrire pour refléter le rôle actuel (source de notifications `useSyncExternalStore`). **Effort : S.**

### n-14 · NETTOYAGE · `src/components/ui/BuyToolbar.jsx:15` — tableau recréé chaque render

`const modes = [{label:'x1',value:1}, …]` déclaré dans le corps du composant. Hisser au niveau module. Impact négligeable (enfants = boutons DOM non mémoïsés). **Effort : S.**

---

## C. Rendu canvas

### Boucle rAF — question « s'arrête-t-elle quand caché / carte non visible ? » : **RÉFUTÉE (pas un bug)**

Vérification (contre-lecture manuelle + agent) :
- **Autre vue** : `App.jsx:217` `{activeView === 'city' && <CityView />}` = rendu **conditionnel** → quitter la vue **démonte** `CityMapCanvas` → `useEffect` cleanup `resetCityMapRuntime()` → `loadCityMapScripts.js:18-20` `cancelAnimationFrame(CM.raf)`. La boucle **meurt** proprement.
- **Onglet/fenêtre caché** : `main.cjs` ne désactive pas `backgroundThrottling` (défaut Electron = true) → le rAF est **gelé nativement** ; le commentaire `cityMapRuntime.js:1283` (« utile quand rAF est gelé en arrière-plan ») confirme que les devs comptent dessus.
- **Modale ouverte** : `CityMapCanvas.jsx:22` `isActive: () => !document.querySelector("dialog[open]")` → le **corps de dessin** (`1049-1280`) est sauté, mais la boucle continue à se replanifier à 30 Hz (travail quasi-nul). Seul micro-coût : un `querySelector` DOM par frame.

**Conclusion :** aucune fuite CPU/batterie réelle. Micro-opt facultative uniquement (booléen de modale posé sur événement plutôt qu'un `querySelector`/frame). **Non retenu comme finding actionnable.**

### m-10 · MINEUR · `src/game/map/cityMapRuntime.js:1122` — bake décor : clé `nightF` sans `now`

**Problème.** La couche décor statique est bakée avec `_otherStatic = zoom + layoutRecomputeAt + nightF.toFixed(1) + healthF.toFixed(1)` (`:1122`) — inclut `nightF` mais **pas** `now`. Or `cityMapDrawStreetLights(now)` (`:1133`) est baké dedans et anime avec `now` (`renderWorld.js:2185` `pulse = 0.65 + 0.25*Math.sin(t2/500 + …)`).
**Impact.** (joueur late `ei≥30`, néon) la pulsation des lampadaires ne s'anime pas en continu — elle saute par paliers/gèle sur un plateau de nuit. (dev) coupler `nightF` à la clé force **~20 re-bakes complets** du décor (arbres/routes/ponts) par cycle jour-nuit → micro-hitch périodique sur une grande ville.
**Correction (ne PAS appliquer).** Sortir l'éclairage animé du bake statique et le dessiner **live par-dessus** le blit (comme les agents), ou retirer la dépendance à `now` si le décor doit être figé. Ne PAS ajouter `now` à `_otherStatic` (rebakerait tout par frame). **Effort : M.**

### m-11 · MINEUR · `src/game/map/iso/isoRenderer.js:351` — peintres iso ⟷ legacy top-down dupliqués

**Problème.** `drawIsoRiver`/`drawIsoShips`/`drawIsoNight`/`drawIsoBridges`/`drawIsoVehicle` (`isoRenderer.js:351/493/660/814/918`) dupliquent `cityMapDrawRiver`/`drawShips`/`cityMapDrawNight`/`drawVehicles` (`renderWorld.js:658/1031`, `agents.js:1595/1141`). L'iso étant le défaut (`projection.js:29` `isoFlag = { on: true }`, `cityMapRuntime.js:1116`), tout le peintre legacy n'est atteint qu'en secours via `__iso(false)`.
> **Correctif à l'hypothèse d'origine :** les helpers `blit*`/`soft*` ne sont **PAS** dupliqués — définition **unique** dans `cityEngineSprites.js:42/209/243/345/467/485`, importés partout ; projection centralisée (`projection.js`).
**Impact.** Dette de maintenance : deux jeux de peintres à faire évoluer en tandem ; risque de divergence. Pas de bug runtime (legacy fonctionnel en fallback).
**Correction (ne PAS appliquer).** Décision produit : une fois l'iso stabilisé (fin du chantier), planifier la suppression du peintre legacy + du fallback `__iso(false)`, ou l'isoler dans un module marqué `legacy`. **Effort : L.**

### m-12 · MINEUR · `src/game/map/cityMapRuntime.js:82` — pas de clamp canvas vs limite navigateur

**Problème.** `nw/nh/onw/onh` (`:82-92`) = viewport × dpr + marge, **sans borne max**. **Aucun lien avec la population** (dimensions viewport-driven).
**Impact.** Risque latent grands écrans uniquement : offscreen `onw = (clientWidth + 512) × 1.5` dépasse 8192 dès ~5461 px de large ; sur 8K (7680 px) → ~12288 px → sur certains navigateurs allocation silencieuse 0×0 → couches offscreen vides (pas de crash net).
**Correction (ne PAS appliquer).** `CM_MAX_CANVAS_PX = 8192` et clamper ; si dépassement, réduire le dpr effectif ou la marge M plutôt que tronquer le viewport. **Effort : S.**

### m-13 · MINEUR · `src/game/map/cityMapRuntime.js:1000` — offscreen `getContext` non gardé avant `setTransform`

**Problème.** `CM.sctx = CM.staticCanvas.getContext('2d'); CM.sctx.setTransform(…)` (`:1000-1001`, idem `tctx :1004-1005`, `gctx :1011-1012`) — aucune garde entre les deux.
**Impact.** Un `getContext` null (contexte 2D perdu, ou dépassement du nb max de contextes/page dû à la fragmentation des canvases temporaires `cityEngineSprites`/`pixel*`) → `TypeError` sur `setTransform` → `initCityMap` plante. La boucle `frame()` est protégée (`:1042`), pas l'allocation.
**Correction (ne PAS appliquer).** Vérifier chaque contexte non-null avant `setTransform`, ou `try/catch` autour de `993-1014` avec `CM.inited = false` propre. **Effort : S.**

### m-14 · MINEUR · `src/game/map/cityMapRuntime.js:986` — `getContext` principal non vérifié

**Problème.** `CM.ctx = canvas.getContext("2d");` (`:986`) non vérifié : `resize()` no-ope via la garde `:75` quand `CM.ctx` est null → `CM.cw/ch` jamais posés.
**Impact.** Contexte principal null → `initCityMap` se poursuit avec `CM.inited = true` et `CM.cw/ch` undefined → `_pw/_ph` (`:994-995`) = NaN → `OffscreenCanvas(NaN, NaN)`. État incohérent au lieu d'un abandon propre. Cas rare.
**Correction (ne PAS appliquer).** Après `:986` : `if (!CM.ctx) { CM.inited = false; CM.canvas = null; return; }`. **Effort : S.**

### n-04 · NETTOYAGE · `src/game/map/renderWorld.js:405` — sous-cache `CM_TERRAIN` redondant

`cityMapDrawTerrain` n'est appelée que dans le bake sol (`cityMapRuntime.js:1148`, repli quand `pixelTerrainFlag` off) → le sous-cache hillshade ne recalcule déjà qu'au re-bake. Double mise en cache inoffensive. Conserver tel quel ou retirer la clé interne. **Effort : S.**

### n-06 · NETTOYAGE · `src/game/map/layout.js:1002` — résidu `O(P²)` de sélection

La boucle `998-1018` rescanne tout `pending` (`touchesRoad`+`plan`) à chaque carve pour choisir le connecteur de coût min → `O(P²·footprint)` borné (P quelques centaines, ~qq ms **une fois par recompute**). **Ce n'est PAS le O(N²) de la régression A6.** Optionnel : tas min par coût, uniquement après profilage. **Effort : M.**

### n-07 · NETTOYAGE · `src/game/map/cityEngineSprites.js:326` — double décode `getImageData`

`propPivot` (`299-305`) et `propBBox` (`322-328`) allouent chacun un canvas + `getImageData` sur le **même** `propImg[p]` (deux `drawImage`+`getImageData`). Résultats cachés → coût unique par prop, mais doublé au 1er accès. Fusionner en une passe (centroïde + bbox opaque). **Effort : S.**

### n-08 · NETTOYAGE · `src/game/map/pixelHouses.js:103` (+ `isoRenderer.js:66`) — réaffectation redondante

`if (OffscreenCanvas) c = new OffscreenCanvas(w,h); else {…} c.width = w; c.height = h;` — la dernière ligne refait ce que le constructeur/branche fallback ont déjà fait. Inoffensif (canvas vide) mais trompeur. Supprimer. **Effort : S.**

### n-09/n-10/n-11/n-12 · NETTOYAGE · vars/params inutilisés (contribuent à B-01)

- `isoRenderer.js:20/27/185/660/818/1102` — `blitPropRot`, `ISO_DIAG`, `kind` (init null), `now` (`drawIsoNight`), `z`, `sp`.
- `cityEngineSprites.js:2152` — `flap` calculé jamais lu (« bannière au vent » non appliquée) + `catch (e)` ×2 (`312/339`).
- `buildingShapes.js:60` — `drawTinyCamp(x,y,w,h,pad,seed,variant,now)` : `pad`/`seed`/`variant`/`now` inutilisés (fonction bien appelée `:118` — params morts, pas code mort).
- `pixelBridge.js:149` — `drawPixelBridges(CM, now)` : `now` inutilisé.
Pour les `catch`, utiliser `} catch {`. **Effort : S chacun.**

---

## D. UI & accessibilité rapide

### États d'achat (achetable / bientôt / verrouillé)

#### m-02 · MINEUR · `src/game/core/mechanics/upgrades.js:58` — arbre Ruines : « gaté » et « trop pauvre » indistincts

**Problème.** `checkNodeAvailability` renvoie `"locked"` pour **trois** situations distinctes : non débloqué (`:55`), palier gaté (`:57`), et pas assez de ruines (`:58` — `canPayCost(…) ? "available" : "locked"`). Le nœud reçoit alors la **même** classe grise.
**Preuve.** `TreeNode.jsx:13` `` `rt-${status}` `` → gaté ET trop-pauvre = `rt-locked` ; `ruinsTree.css:590` `.rt-locked { opacity: 0.52; }` + `:306` grayscale (aucune nuance). Pourtant le **tooltip** re-dérive 5 états (`RuinsTreePixel.jsx:338/340`) rendus de couleurs **opposées** : `.rt-status--cost { color: #e0b057; }` (ambre = « bientôt ») vs `.rt-status--locked { color: var(--text-mid); }` (gris). La boutique, elle, distingue `is-locked-cost` (0.58, trop cher) ≠ `pr-locked` (verrouillé).
**Impact joueur.** Impossible de distinguer d'un coup d'œil, sur la fresque, un nœud « à une poignée de ruines près » d'un « palier fermé » — tous grisés pareil ; le tooltip ambre contredit visuellement le nœud grisé.
> *Vérification adversariale :* preuve confirmée verbatim, **sévérité reclassée MAJEUR→MINEUR** (purement cosmétique/rendu↔rendu : le nœud reste fonctionnellement correct — cliquable ssi `available`, gating & coût respectés ; aucune perte de progression ni divergence sim↔rendu).
**Correction (ne PAS appliquer).** Faire remonter la distinction jusqu'au nœud : enrichir `checkNodeAvailability` (état `"cost"` quand tier ouvert + débloqué mais `!canPayCost`) ou passer un flag `costLocked` au vm + classe `.rt-cost` (ambre) alignée sur `is-locked-cost`. **Effort : M.**

#### m-03 · MINEUR · `src/components/views/HeritageView.jsx:155` — cartes Héritage sans état d'abordabilité

**Problème.** `<article className={\`upgrade ${isOwned ? "bought" : ""}\`}>` — `canBuy` n'influence **pas** la classe ; l'achetable vs trop cher n'est signalé que par le `disabled` du bouton, et le coût est un `.chip` sans état (`:161-163`). À comparer à `PurchaseRow.jsx:117` (`is-affordable`/`is-locked-cost`) + `:199` (`is-lacking` par devise).
**Impact.** Une carte abordable et une carte trop chère se ressemblent hors le grisé du bouton ; aucune mise en avant de la légitimité manquante. Affordance moins riche, incohérente avec la boutique voisine.
**Correction (ne PAS appliquer).** Ajouter une classe d'état sur `<article>` dérivée de `canBuy` quand `!isOwned`, réutiliser le token « devise manquante ». **Effort : S.**

#### m-04 · MINEUR · `src/components/views/HeritageView.jsx:167` — boutons `disabled` sans sémantique a11y

**Problème.** Boutons `disabled` sans `aria-disabled` ni `title` explicatif dans Héritage (`:167`, `:80`, `:254`), Prestige (`PrestigeView.jsx:223`, `:266`) et la carte verrouillée boutique (`BuildingShop.jsx:222`). L'attribut natif `disabled` les retire du tab-order et n'annonce **aucune raison** au lecteur d'écran. À l'opposé, `TreeNode.jsx:36` utilise `aria-disabled={!interactive}` (reste focusable + `aria-label`).
**Impact.** Utilisateurs clavier/lecteur d'écran ne peuvent ni atteindre ni comprendre pourquoi ces achats sont bloqués. Traitement du « désactivé » incohérent d'une surface à l'autre.
**Correction (ne PAS appliquer).** Homogénéiser : `title`/`aria-label` explicatifs sur les `disabled`, ou basculer sur le motif `aria-disabled` focusable + handler no-op comme `TreeNode`. **Effort : S.**

#### n-15 · NETTOYAGE · `src/components/views/ruinsTree/branchTheme.js:12` — pas de token d'état partagé

Chaque surface réinvente le code couleur : achetable = **or** (boutique `purchase.css:85`, mythes `views-layout-wrapper.css:326`) vs **vert** (arbre `ruinsTree.css:729`) ; « bientôt/trop cher » = ambre `#e0b057` en dur (arbre) vs tiret-atténué (boutique) vs gris (mythes). Définir `--state-affordable`/`--state-soon`/`--state-locked` dans `variables.css` et les consommer partout ; remplacer l'ambre en dur. **Effort : M.**

### n-16 · NETTOYAGE · Inventaire des textes hardcodés (prépa lot 3, i18n)

Le projet a un tuyau `tr()`/`{fr,en}` partiellement câblé. Chaînes UI **non** passées par `tr()` (à migrer) :

| Fichier | ~N | Exemples (file:line) |
|---|---|---|
| `src/components/dialogs/DebugDialog.jsx` | ~13 | L58 `<h2>Mode debug</h2>`, L64 `Rupture 100%`, L66 `Ressources late`, L71 `Fermer` — **dev-only, à traiter en dernier** |
| `src/components/views/RuinsTreePixel.jsx` | 4 | L487 `Mémoire des Ruines`, L490 `aria-label="Zoom avant"`, L494 `Zoom arrière`, L498 `Recentrer la vue` |
| `src/components/dialogs/OptionsDialog.jsx` | 2 | L393 / L428 `{r.enabled ? "Actif" : "Inactif"}` (→ `tr({fr:'Actif',en:'On'})`) |
| `src/components/views/HeritageView.jsx` | 2 | L249 `<h2>Grand Reset</h2>`, L268 `<span>Grand Resets</span>` |
| `src/components/ui/Topbar.jsx` | 1 | L124 `aria-label="Ressources de la cité"` |
| `src/components/ui/BuildingShop.jsx` | 1 | L130 `aria-label="Catégories de bâtiments"` |
| `src/components/ui/CityStatusPanel.jsx` | 1 | L72 `aria-label="État de la civilisation"` |
| `src/components/views/CityView.jsx` | 1 | L549 préfixe `Babel (` (contenu interne déjà `tr()`) |

> Les `aria-label` en dur (Topbar/BuildingShop/CityStatusPanel) sont le cas le plus « rentable » : petits, à fort impact a11y en mode EN. Les `<h2>` proches de noms propres (Grand Reset, Babel) peuvent être assumés non traduits. **Effort global : M** (mécanique).

---

## E. Portes de qualité — détail des findings BLOQUANT

### B-01 · BLOQUANT · `npx eslint .` rouge — `package.json:10`

**Preuve.** `✖ 117 problems (114 errors, 3 warnings)`.
**Décomposition (grep-vérifiée).** Le compte est **gonflé ×3** parce qu'ESLint parcourt aussi `.claude/worktrees/quizzical-payne-*` et `serene-satoshi-*` (copies jetables de worktrees) → voir **n-01**. Erreurs **réelles dans le dépôt** (hors `.claude`) :
- `OdometerNumber.jsx` — **7** `react-hooks/refs` (→ **M-03**).
- `RollingNumber.jsx` — **1** `react-hooks/refs` (→ **m-08**).
- `isoRenderer.js` — 6, `cityEngineSprites.js` — 3, `buildingShapes.js` — 4, `pixelBridge.js` — 1 (`no-unused-vars`, → **n-09/n-10/n-11/n-12**).
- `plazaProps.js:1` — 1 warning (directive `eslint-disable` inutile).
- `sim-10-profils.js` — ~24 (`global`/`process`/`setImmediate` non définis : script headless **Node** non couvert par la config → **n-01**).
**Impact.** Si le lint devient un gate CI/pre-commit, la branche est bloquée. Aujourd'hui `vite build` et `vitest` n'en dépendent pas → produit non cassé. Toutes ces erreurs étant `no-unused-vars`/`react-hooks/refs`, `eslint --fix` ne les corrige pas seul.
**Correction (ne PAS appliquer).** (1) Nettoyer les vars/params/imports (**n-09→n-12**) + refs-in-render (**M-03/m-08**) ; (2) ajouter `.claude` (et si voulu `sim-10-profils.js` ou un bloc `globals.node` pour lui) à `globalIgnores` de `eslint.config.js` (**n-01**). **Effort : S+S.**

### B-02 · BLOQUANT · `npx vitest run` rouge — cœur/lot 1 · frontière float

**Preuve.** `Tests 2 failed | 715 passed (717)` — le même test compté 2× (dépôt + copie `.claude/worktrees`, cf. **n-01**) :
```
economy.golden.test.js > buildingBatchCost > foragers x25
- Expected: Decimal(130380.06209513952)
+ Received: Decimal(130380.06209513955)
```
**Analyse (frontière float/Decimal).** L'écart est **d'1 ULP flottant** sur les 3 derniers chiffres d'un `Decimal` **construit à partir d'opérations en `double`** (somme géométrique de coûts). Le golden-master fige la mantisse float à 17 chiffres → il est **fragile à la non-déterminisme flottant** (ordre de sommation, microarchitecture/lib math). Ce test est dans `src/game/core/**` = **périmètre lot 1** ; il n'est listé ici que parce que la porte est rouge.
**Impact.** Aucun impact joueur (écart 3e-11 relatif, invisible in-game). Mais le gate de test est cassé ⇒ toute CI qui l'exécute échoue.
**Correction (ne PAS appliquer — relève du lot 1).** Rendre le golden **tolérant** : comparer via `toBeCloseTo`/une tolérance relative (ex. `1e-9`) sur `.toNumber()` plutôt qu'un snapshot exact de mantisse, OU régénérer le snapshot **et** documenter qu'il est machine-dépendant. Ne PAS masquer par un simple `-u` sans comprendre la source de la dérive. **Effort : S** (mais décision lot 1).

---

## F. Top 5 actions à fort ROI du lot

1. **M-01 — Arrondir `globalMult` avant `arePropsEqual` (`BuildingShop.jsx:92` + `PurchaseRow.jsx:233`).** Un `Math.round(globalMultiplier()*1e4)/1e4` restaure la mémoïsation de **toutes** les rangées de la boutique (aujourd'hui re-rendues 1×/s en mid/late). Effort **M**, gain perf immédiat et visible, restaure l'intention documentée.
2. **B-01/n-01 — Remettre le lint au vert (`eslint.config.js` + nettoyages `n-09→n-12`).** Ajouter `.claude` à `globalIgnores` (supprime ~2/3 des erreurs d'un coup) puis nettoyer les `no-unused-vars` réels + corriger `M-03`/`m-08` (refs-in-render). Effort **S+S**, débloque tout gate CI/pre-commit.
3. **M-03/m-08 — `key={shape}` au lieu de `key={ref.current}` (Odometer/RollingNumber).** Supprime 8 erreurs `react-hooks/refs`, rend l'animation concurrent-safe pour React 19. Effort **S**, pur bénéfice.
4. **M-02 — Trancher la frontière `roadCoverage` sim↔carte (`cityMapRuntime.js:565` / `production.js:161`).** Décider : fonction pure `roadCoverageFrom(state)` partagée (le balancing headless voit alors le bonus routes) **ou** documenter+neutraliser explicitement le bonus map-only dans les sims. Effort **M/S**, corrige un écart de balancing systématique (+10..15 %).
5. **m-04 + n-15 — Uniformiser états d'achat & a11y (`aria-disabled`/`title` + tokens `--state-*`).** Un langage visuel commun « achetable/bientôt/verrouillé » sur boutique/arbre/héritage/mythes + boutons `disabled` annoncés au lecteur d'écran. Effort **S→M**, cohérence UX transversale et accessibilité.

---

*Fin du rapport lot 2. Aucun fichier du code n'a été modifié. Les 6 statuts de régression et les 3 findings haut-sévérité (M-01, M-02, M-03) ont été vérifiés par un agent adversarial indépendant ET contre-lus manuellement sur le code source.*
