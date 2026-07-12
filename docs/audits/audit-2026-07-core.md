# Audit du cœur — Civilisation Effondrement (lot « core »)

**Date :** 2026-07-12 · **Type :** audit lecture seule (aucune modification appliquée) · **Version cible :** post-`fecdace`
**Périmètre de ce run :** `src/game/core/**` + scripts de simulation à la racine + système de save/migrations.
**Hors périmètre (runs dédiés) :** rendu, carte (`src/game/map/**`), UI (`src/components/**`), narration/data de contenu.

> Méthode : 7 lecteurs approfondis (un par concern) + vérification adversariale de chaque finding
> (24 findings bruts → 1 réfuté, 1 fusion → **22 findings retenus**), doublée d'une passe manuelle
> de l'orchestrateur sur `state.js`, `cost.js`, `crisis.js`, `prestige.js`, `main.js` et les imports des sims.
> Règle « grep avant d'affirmer » appliquée : chaque affirmation de code mort / non-couverture / crash est
> étayée d'une commande et de son résultat. La frontière float/Decimal (`num.js`) est précisée à chaque
> affirmation numérique.

---

## 1. Portes de qualité (exécutées avant l'audit)

| Porte | Commande | Résultat | En-tête de finding |
|---|---|---|---|
| **Build** | `npm run build` (`vite build`) | ✅ **PASS** (exit 0, 136 modules, 2.15 s) | — |
| **Tests** | `npx vitest run` | ❌ **FAIL** (exit 1) — **2 échecs / 717** | **CORE‑01 (BLOQUANT)** |
| **Lint** | `npx eslint .` | ❌ **FAIL** (exit 1) — 114 erreurs, 3 warnings | Voir ci-dessous |

### 1.1 Détail vitest (échec dans le périmètre)

Un **seul** test unique échoue : `economy.golden.test.js > buildingBatchCost > foragers x25`.
Le « 2 » vient d'un **worktree parasite** (`.claude/worktrees/…`) qui duplique le test (cf. CORE‑18).

```
- Expected  "food": Decimal(130380.06209513952)
+ Received  "food": Decimal(130380.06209513955)
```

Dérive du **dernier ulp** (~2e‑16 en relatif) : fragilité de snapshot pleine précision, **pas** un bug de
logique de jeu. C'est un finding **BLOQUANT** (porte qualité déclarée du projet, `vitest run`, rouge de
façon déterministe). Détail : **CORE‑01**.

### 1.2 Détail eslint

- **0 erreur dans `src/game/core/**`** — le cœur est propre côté lint.
- **Dans le périmètre :** `sim-10-profils.js` = **26 erreurs** (19 faux positifs `no-undef` sur les globals
  Node `global`/`process`/`setImmediate`, + 7 vrais `no-unused-vars`) parce qu'il est **absent** de
  `globalIgnores` (`eslint.config.js:8`) qui liste pourtant tous les autres sims. Détail : **CORE‑15** (config)
  et **CORE‑19** (vars mortes).
- **Hors périmètre (non traité ici) :** `src/components/ui/OdometerNumber.jsx`, `RollingNumber.jsx`
  (règle `react-hooks/refs`), `src/game/map/*` (`no-unused-vars`), et deux **worktrees parasites**
  `.claude/worktrees/{quizzical-payne-f6808f, serene-satoshi-33e13c}` qui dupliquent tout l'arbre et
  gonflent le compte. Ces worktrees sont `gitignore`d (CI propre non affectée) mais polluent les portes en
  local — cf. **CORE‑18**.

### 1.3 Périmètre exact — fichiers lus

**Lus intégralement** (cœur) : `num.js`, `outcomeFloat.js`, `mechanics.js` (baril), `mechanics/{shared,
production,cost,crisis-cost,prestige,upgrades}.js`, `balance.js`, `state.js` (1230 l.), `main.js`,
`actions.js`, `actions/{tick,crisis,building,automation,myths,mythTicks,olympus,utils}.js`,
`events.js`, `chronicleEvaluator.js`, `choiceDialog.js`.
**Lus intégralement** (sims racine) : `simulate-ce.js`, `sim-10-profils.js`, `sim-idle-impact.js`,
`sim-idle-impact-return.js`, `simulate-game.js`, `bench-myths.js`, `bench-rupture.js`.
**Lus intégralement** (tests cœur, 16 fichiers) : tous les `src/game/core/__tests__/*.js` + le
`__snapshots__/economy.golden.test.js.snap`.
**Survolés / consultés en preuve seulement** (hors périmètre) : `src/game/data/{world,olympus,myths,
upgrades,buildings,activeRuins}.js` (pour prouver le couplage données↔cœur), `src/components/views/
MythsView.jsx`, `src/hooks/useCityViewState.js`, `eslint.config.js`, `vite.config.js`.

---

## 2. Tableau de synthèse (trié par sévérité décroissante)

| ID | Sévérité | Catégorie | Fichier:ligne | Résumé |
|---|---|---|---|---|
| **CORE‑01** | 🔴 BLOQUANT | test-fragile / parité-float | `__tests__/economy.golden.test.js:28` + `mechanics/cost.js:77` | Snapshot golden fige la précision float complète → dérive du dernier ulp de `geomSum` (forme close) = `vitest run` ROUGE |
| **CORE‑02** | 🟠 MAJEUR | save / grand-reset | `state.js:1187` | `eneeHeritage` absent de `GR_PERSISTENT_FIELDS` : **seul** héritage mythique effacé à chaque Grand Reset (perte permanente silencieuse) |
| **CORE‑03** | 🟡 MINEUR | crash-latent | `actions/crisis.js:70` | `pickCrisisEvent` sans garde runtime : `choices` vide → `%0`=NaN → `event.id` crash (défendu seulement par un invariant DEV-only) |
| **CORE‑04** | 🟡 MINEUR | crash-latent | `actions/crisis.js:146` | `openCrisisEvent` appelle `choice.apply()` sans garde de type (asymétrie avec `autoResolveCrisisEvent`) → soft-lock en pause |
| **CORE‑05** | 🟡 MINEUR | crash-latent | `actions/automation.js:153` | `canPayCost(costs[rule.actionId])` non gardé → `Object.entries(undefined)` throw dans le tick si `actionId` hors `crisisCosts` |
| **CORE‑06** | 🟡 MINEUR | save / round-trip | `state.js:411` | `decimalField` ne gère pas la forme Decimal objet-plat `{mantissa,exponent}`, contrairement à `D()`/`toNum()` |
| **CORE‑07** | 🟡 MINEUR | parité-float | `mechanics/production.js:564` | Branches Decimal de `pressureBreakdown`/`cityVitals`/`scarcityRawInstant` jamais comparées à leur jumelle float |
| **CORE‑08** | 🟡 MINEUR | archi / inversion de couche | `mechanics/production.js:75` | `production.js` (couche mechanics) importe **vers le haut** dans `actions/olympus.js` → couplage bidirectionnel de paquets |
| **CORE‑09** | 🟡 MINEUR | sim / déterminisme | `actions/tick.js:304` | Les sims ne seedent pas `Math.random` alors que le tick le consomme (aubaines) → rapports non reproductibles |
| **CORE‑10** | 🟡 MINEUR | sim / déterminisme | `simulate-ce.js:200` | Budget de calcul borné sur l'horloge murale réelle non stubbée → jalons dépendants de la vitesse machine |
| **CORE‑11** | 🟡 MINEUR | lint-gate | `eslint.config.js:8` | `sim-10-profils.js` absent de `globalIgnores` → 19 faux positifs `no-undef` (globals Node) cassent `eslint .` |
| **CORE‑12** | 🟡 MINEUR | pollution porte qualité | `vite.config.js:61` | Pas de `test.exclude` → vitest ramasse les 64 tests des worktrees parasites (suite en triple, échec compté 2×) |
| **CORE‑13** | 🟡 MINEUR | test / couverture | `actions/mythTicks.js:208` | `runMythTicks` + `MYTH_TICK_HANDLERS` (~140 l.) jamais exercés : aucun test ne tick avec un mythe actif |
| **CORE‑14** | 🟡 MINEUR | test / couverture | `mechanics/prestige.js:192` | `legitimacyGain` (devise de prestige) sans aucun test malgré une formule retravaillée |
| **CORE‑15** | 🟡 MINEUR | test / couverture | `events.js:112` | Chemin interactif d'effondrement **après** le dialogue d'épitaphe (`nextEpitaphLegacy`, `generateEpitaph`) non exercé |
| **CORE‑16** | 🟡 MINEUR | test / couverture | `actions/crisis.js:62` | `pickCrisisEvent`/`checkCrisisThresholds`/`openCrisisEvent` non testés (seul `autoResolveCrisisEvent` l'est) |
| **CORE‑17** | 🟡 MINEUR | test / couverture | `actions/tick.js:281` | Déclenchement d'effondrement dans le tick (`triggerCollapseChoices`) jamais atteint par un test |
| **CORE‑18** | ⚪ NETTOYAGE | code-mort | `state.js:300` | `state.notifEnabled` : champ sérialisé mais jamais relu par `hydrate` ni lu par le jeu (miroir mort ; réglage réel dans `civ-opt-notif`) |
| **CORE‑19** | ⚪ NETTOYAGE | code-mort | `sim-10-profils.js:116` | 7 imports/variables réellement inutilisés (dont `buyMinimalGold` jamais appelée) |
| **CORE‑20** | ⚪ NETTOYAGE | code-mort | `actions/olympus.js:125` | `olympusUnlockedProfile()` exporté via le baril mais jamais appelé — doublon mort de `data/olympus.js:unlockedOlympusProfile` |
| **CORE‑21** | ⚪ NETTOYAGE | duplication | `mechanics/production.js:151` | Multiplicateur de Grand Reset `2^grandResetCount` recopié dans 2 fonctions + 4 chaînes d'affichage sans source unique |
| **CORE‑22** | ⚪ NETTOYAGE | test-fragile | `__tests__/newMechanics.test.js:159` | Test d'aubaine couplé à l'ordre du tableau `BOONS` (`Math.random→0` = `BOONS[0]`) |

**Réfuté (écarté) :** `num.js:26` — l'affirmation « le commentaire *filet de sécurité dégradé* est faux »
a été **réfutée** en vérification : hors DEV, le `valueOf` de break_infinity renvoie une *string*, mais les
opérateurs `-`/`*`/`/`/comparaisons contre un number recoercent en float sans crash — le commentaire est exact.

---

## 3. Réponses aux questions de l'audit (A–E)

Cette section répond directement aux questions du brief, au-delà des findings ponctuels.

### A. Correctness du cœur

**Parité float/Decimal — couverture de la table.**
Les **7 paires miroir** (`ruinMultiplier`/`…Dec`, `unspentRuinsPowerMultiplier`/`…Dec`,
`institutionMultiplier`/`…Dec`, `infraMultiplier`/`…Dec`, `babelExponentialMult`/`…Dec`,
`globalMultiplier`/`…Dec`, `buildingOutputMultiplier`/`…Dec`) **+ `rates()` en double-chemin** sont
**toutes** couvertes par `decimal.parity.test.js`, avec une **tolérance relative** `REL_TOL = 1e-9`
(bien conçu : attrape une vraie dérive de formule >1e‑3 sans casser sur le bruit ulp ~1e‑14). Relecture
ligne-à-ligne : **aucune divergence de formule vivante** aujourd'hui.
Les fonctions **numériques ajoutées depuis juin** n'introduisent **pas** de nouvelle paire miroir à tester :
elles sont soit **single-path Decimal** (coûts : `buildingBatchCost`, `crisisCosts`, `terminalCrisisCost`),
soit **float pur alimentant une jauge bornée** (`legitimacyGain`, `timeWearRate`, `pressureBreakdown`,
`cityVitals`). **`legitimacyGain` est correctement hors table de parité** : `legitimacy` est un `number`
natif (côté borné de la frontière `num.js`), sans jumelle Decimal.

> ⚠️ **Écart doc↔code à signaler.** Le brief décrit `legitimacyGain` comme « prime-douce baseExp 0.55 /
> cycleDiv 16 / prepCoef 1.2 / prepExp 1.0 ». **Cette formule n'existe nulle part dans le code** (grep de
> `0.55`/`prepCoef`/`prepExp`/`cycleDiv` = aucun `legitimacyGain`). Le code réel (`prestige.js:196-201`) est :
> `floor( min(MAX_VALUE, (ruins/160)^0.5) + cycles/12 + floor(dynastyCount/5) )` — **exposant 0.5, division
> par 12, aucun terme de préparation**. Les sims recopient d'ailleurs la **bonne** formule en prose
> (`sim-10-profils.js:1002`). Conclusion : c'est la **note mémoire/brief qui est périmée**, pas le code ni la
> sim. Aucun défaut de code, mais la garde de régression manque (**CORE‑14**).

**Deux zones de robustesse de parité restent découvertes** (**CORE‑07**) : `pressureBreakdown`, `cityVitals`
et `scarcityRawInstant` portent un double chemin float/Decimal **inline** jamais comparé float-vs-Decimal
(seulement « sanity-checké » par `decimal.smoke`). Équivalents aujourd'hui, mais une retouche d'équilibrage
côté float passerait au vert tout en faussant les cités post-débordement (>1.8e308).

**Save / migrations — round-trip `defaultState` ↔ `hydrateState`.**
Diff clé par clé des **138 clés** de `defaultState()` contre les overrides de `hydrateState` (qui part de
`...base`) :
- **137 clés** sont restaurées depuis `source` (ou remises volontairement, ex. `mourning:false`).
- **1 seule clé** n'est jamais lue depuis `source` : `notifEnabled` — mais c'est un **miroir mort** dont la
  vraie valeur vit ailleurs (`localStorage['civ-opt-notif']` + `initAudio`), donc **pas de perte joueur**
  (**CORE‑18**, NETTOYAGE — faux positif de round-trip écarté par grep).
- **Le bug historique `epitaphLegacy` est corrigé et testé** : `activeEpitaphLegacy`/`nextEpitaphLegacy`
  présents dans `defaultState` (296-297) **et** `hydrate` (894-895) **et** couverts par
  `state.hydration.test.js`. Aucun autre champ « présent au défaut mais oublié à l'hydrate ».
- **Sens inverse** (clé hydratée absente du défaut) : **aucune**.

> ⚠️ **Angle mort de test à connaître.** `state.hydration.test.js:25-29` ne compare que le **jeu de clés**
> (`Object.keys(hydrated) === Object.keys(original)`). Comme `hydrate` fait `...base`, ce test passe même si
> un champ était lu depuis `base` au lieu de `source`. Seuls les tests **à valeur non-défaut** (épitaphe,
> chronicle `publishedAt`) attraperaient une vraie perte de round-trip. Un futur oubli de type « lit `base`
> au lieu de `source` » ne serait **pas** attrapé — c'est exactement la classe de **CORE‑02**.

**Grand Reset — synchro `GR_PERSISTENT_FIELDS`.**
- **Orphelins (listés mais inexistants dans `defaultState`) : aucun** — les 26 entrées existent.
- **Champ qui DEVRAIT survivre mais ABSENT : `eneeHeritage`** → **CORE‑02 (MAJEUR)**. C'est le **seul** des
  **12** booléens `*Heritage` hors de la liste ; les 11 autres y sont, ainsi que `prometheeBraisiers`.
- **Exclusions correctes vérifiées** : `sisypheMult` (scopé « mythe actif »), `dynastiesSinceGR` (reset
  volontaire), et les compteurs d'échelle (`phoenixCycleCount`, `eneeCollapseCount`…) — le patron maison est
  « le **booléen** d'héritage persiste, les **compteurs** repartent à 0 ». Donc le correctif de CORE‑02 = ajouter
  **uniquement** le booléen `eneeHeritage`.

**Déterminisme de la sim headless — mêmes seeds → mêmes résultats ? NON, et il n'y a aucun seed.**
Point **positif majeur** d'abord : **les 7 sims importent STRICTEMENT le vrai moteur** (`await import(
"./src/game/core/mechanics.js" | state.js | actions.js | num.js | utils.js)`) — **aucune formule de jeu
recopiée en code exécutable**. Les seules « formules » propres aux sims sont la **politique du bot**
(comportement joueur) ; les formules recopiées **en prose** dans les rapports `.md` ont été recoupées et
sont **exactes** (`ruinMultiplier = 1 + ruins^0.62 × 0.09`, `legitimacyGain` réelle, seuils de dynastie/GR).
Donc **pas de divergence sim↔jeu**.
**Mais** la reproductibilité n'existe pas : les sims stubent `Date.now` (`setClock`) **sans** stuber
`Math.random`, et le vrai moteur consomme `Math.random` **à chaque tick** — aubaines
(`tick.js:247 → 304/311`) et sélection de chronique (`chronicleEvaluator.js:186`) — et lors des **paris** de
régulation (`crisis.js:509`). Une **probe runtime** (même état, même échéancier `Date.now`, 300 ticks, 2 runs)
renvoie « DÉTERMINISTE ? **false** ». Conséquence : les tables de jalons committées varient d'un run à l'autre.
C'est un défaut **d'outillage d'équilibrage** (pas du jeu livré) → **CORE‑09** (Math.random) + **CORE‑10**
(horloge murale). `bench-myths.js`/`bench-rupture.js` ne tickent pas → eux sont déterministes.

### B. Robustesse & bugs latents

Verdict global : **le cœur est codé de façon défensive**. **Aucun BLOQUANT ni MAJEUR de robustesse**, aucune
boucle sans borne, aucun effet de bord nuisible dans une fonction « pure ».
- **`pickCrisisEvent` (finding v0.4)** : le crash « `choices` vide » **n'est pas ré-introduit** et reste
  **inatteignable** avec les données actuelles (5 crises par seuil 0.25/0.5/0.75). **Mais** la garde n'est
  **pas** dans la fonction — la seule barrière en prod est la staticité des données, l'invariant de cohérence
  `CRISIS_POOL`↔`CRISIS_EVENTS` étant `import.meta.env?.DEV` (strippé du build). → **CORE‑03**.
- **Deux autres gardes asymétriques** de même nature : `openCrisisEvent` (**CORE‑04**, soft-lock possible) et
  `checkAutomateRules` (**CORE‑05**, throw de tick possible) — tous deux latents/inatteignables aujourd'hui.
- **Boucles bornées** : `buyAllAffordable` (borne `BUY_ALL_MAX_ITERS=10000`), migration (`version+=1`),
  `simulateAwayCrises` (garde anti-spin `remaining>0 && collapses<max`), `buildCadmosAgeOption`
  (`guard<words.length`). **Le pattern « crash carte » (while sur donnée d'état pouvant exploser/NaN) n'existe
  pas dans le cœur.**
- **Effets de bord cachés** : la seule mutation d'état dans `mechanics/production.js` est
  `enforceInfrastructureCap()` (correctement nommée). `rates`/`ruinGain`/`*Count`/`*Cost` sont purs. Les
  lazy-init idempotents (`getAutoScriptRules`, `olympus()`) ne se déclenchent jamais en flux normal (cibles
  toujours présentes après hydrate). **Non nuisible.**

### C. Architecture

**`mechanics.js` « god-file » — référence v0.4 (1413 l. / 67 exports) CADUQUE.**
`mechanics.js` est aujourd'hui un **baril de 38 lignes** qui réexporte 6 sous-modules à **DAG acyclique**
(mesuré : `shared` 155 l., `production` **977 l.**, `prestige` 202 l., `crisis-cost` 144 l., `cost` 140 l.,
`upgrades` 74 l. ; total paquet ≈ 1692 l. / ~74 exports publics). Le refactor v0.4 est **fait**. Le **nouveau
point chaud est `production.js` (977 l. / 30 exports)**.

**Découpage concret proposé pour `production.js`** → dossier `mechanics/production/` avec un `index.js`‑baril
qui conserve l'API (le baril `mechanics.js` passe à `export * from './production/index.js'`, **zéro impact**
sur les ~28 consommateurs + `simulate-ce.js`) :

| Module | Contenu | Dépend de |
|---|---|---|
| `buildingSums.js` (L0) | `getBuildingSums`, `riverEngineFactor`, `buildingOutputMultiplier(+Dec)`, `buildingMilestoneInfo`, `milestoneStepSize` (~140 l.) | state, data, shared, num |
| `vitals.js` (L0) | `cityVitals`, `scarcityRawInstant` (~60 l.) | num, utils, myths(atlas) |
| `policies.js` (L0) | `addProductionPenalty`, `policyProductionMultiplier`, `policyRiseSlow`, `policyOvershootDamp`, `policyFoyerDamp`, `policyDemesureDamp`, `crisisProductionMultiplier` (~90 l.) | state, data/regulationActions, shared |
| `mythModifiers.js` (L0) | `babelExponentialMult(+Dec)`, `orProdPenaltyMult`, `heph*`, `cadmos*`, `activeEpitaphLegacy`, `ruptureGrowthMultiplier`, `amplifyRuptureFactor` (~200 l.) | myths, epitaphs, cityMapBridge, shared |
| `multipliers.js` (L0) | `ruinMultiplier(+Dec)`, `unspentRuinsPowerMultiplier(+Dec)`, `institutionMultiplier(+Dec)`, `grandResetMultiplier`, `marketMultiplier`, `roadNetworkMultiplier`, `infraMultiplier(+Dec)`, `globalScalarFactors`, `globalMultiplier(+Dec)`, `nomad/enforceInfrastructureCap` (~230 l.) | shared, balance, myths, activeRuins, olympusEffect, renderCache |
| `pressure.js` (L1) | `pressureBreakdown` (~130 l.) | buildingSums, policies, shared, balance, renderCache |
| `rates.js` (L2) | `rates()`, `terminalPrepMultiplier` (~180 l.) | buildingSums, multipliers, vitals, pressure, policies, mythModifiers |

Layering L0→L1→L2 **acyclique garanti**. **Contrainte Node (sim headless) confirmée OK** : les 2 seuls
`import.meta` du hot-path (`production.js:91`, `num.js:27`) sont **optional-chained** (`import.meta.env?.DEV`
→ `undefined`/no-op sous Node) et **doivent le rester** dans les modules éclatés ; le seul `import.meta.env`
non gardé (`main.js:432`) est hors chargement et `main.js` n'est pas importé par les sims. **Règle à
maintenir : aucun `import.meta` non gardé au chargement d'un module du cœur.**

**Couplage au singleton `state`.**
Pattern : `export let state = load()` muté en place ; store maison `subscribe`/`notify` avec `notifyPaused`
(suspendu pendant la sim offline) ; `setState()` fait delete-all-keys + `Object.assign` (référence stable →
les sims/tests « swappent » l'état par ce biais). **Lecteurs directs** (`state.` par fichier) :
`production.js` (110), `tick.js` (60), `prestige.js` (29), `crisis-cost.js` (15), `shared.js` (15),
`cost.js` (13), etc. Seule exception dans `mechanics/` : `upgrades.js` ne lit **pas** le singleton.

**Liste priorisée à purifier (état en paramètre), hot-path d'abord** — le bon patron existe déjà
(`hasActiveRuin(state, …)`, `runMythTicks(state, dt)`) :
1. `rates(state, vitals, pressure)` (`production.js:700`) — ROI max (tick **et** `crisisCosts`).
2. `getBuildingSums(state)` (`production.js:419`) — `buildingOutputMultiplier` est déjà pur.
3. `pressureBreakdown(state)` / `cityVitals(state)` (`production.js:520/651`).
4. `globalMultiplier(state)` + helpers multiplicateurs.
5. `buildingBatchCost(building, amount, state)` / `buildingDiscount` (`cost.js`).
6. `ruinGain(state)` / `timeWearRate(state)` / `legitimacyGain(state)` (`prestige.js`).

> **Nuance :** `renderCache` (`state.js:341`) est un **second** singleton de module (cache par frame). Purifier
> `rates(state)` seul ne « dé-singletonise » pas le cache. Reco : passer un contexte `{ state, cache }` plutôt
> qu'un `state` nu. **Non bloquant** (la sim marche via le swap `setState`) ; la purification vise
> snapshot/restore + scénarios parallèles, pas un bug courant.

Un vrai défaut d'architecture ponctuel : **CORE‑08** — `production.js` importe **vers le haut**
(`actions/olympus.js`), inversion de couche.

### D. Code mort & duplication (règle grep respectée)

Cartographie chiffrée (script d'énumération de 200+ exports + comptage des références word-boundary sur
`src/` + tous les sims racine, en **excluant** les worktrees parasites) :
- **0 export totalement orphelin.**
- **1 seul export réellement mort** : `olympusUnlockedProfile` (**CORE‑20**) — doublon du jumeau
  `data/olympus.js` que l'UI utilise vraiment.
- **0 constante `balance.js` morte** (les 84 exportées sont toutes lues ailleurs).
- **0 fonction/const interne non référencée**, **0 branche constante**, **0 `while(true)`** dans le cœur.
- Table de dispatch `MYTH_TICK_HANDLERS` **symétrique** (10 clés = 10 ids de `MYTH_TICK_ORDER`).
- **Faux positifs écartés** (surexposition volontaire, grep confirme un self-call vivant) : tous les
  `normalize*` de `state.js`, les paires `*Dec` (parité intentionnelle), les fonctions debug (câblées à
  `DebugDialog.jsx`), `ownedRuinUpgradeCount`/`ruinSpentTotal` (internes au paquet, lus par `production.js`).
- **Duplications** : `2^grandResetCount` sur 6 sites (**CORE‑21**) ; côté sims, 7 symboles morts dans
  `sim-10-profils.js` (**CORE‑19**). Duplication mineure notée mais non fichée : l'idiome
  `Math.pow(0.5, dt/HALF_LIFE)` répété 4× **dans le seul `tick.js`** (candidat helper `decayKeep`/`emaToward`,
  valeur faible).

### E. Tests

**Couverture chiffrée : impossible en l'état** — aucun provider installé (`@vitest/coverage-*` absent,
aucune dépendance `coverage`, aucun bloc `test:` dans `vite.config.js`). `npx vitest run --coverage`
exigerait une installation réseau → non exécuté (lecture seule). Estimation qualitative : **16 fichiers de
test (~1736 l.) pour ~7000 l. de cœur.**

**Bien couvert :** frontière `num.js` (boundary, parité 7 miroirs, smoke), migrations/hydratation save
(v0/v1/v2/v3 + legs épitaphe), économie golden, bornes du tick (`tickInvariants` 50 ticks), Grand Reset pur,
progression offline + farm de crises, arbre de ruines structurel, `autoResolveCrisisEvent`.

**Zones critiques NON couvertes** (findings dédiés) : système de mythes par tick (**CORE‑13**),
`legitimacyGain` (**CORE‑14**), chemin interactif post-effondrement (**CORE‑15**), sélection de crise
(**CORE‑16**), déclenchement d'effondrement dans le tick (**CORE‑17**). Le plus gros trou est le **système
de mythes** (dette Atrides, malédiction Sisyphe sur les coûts, Usure Icare/Atlas : ~140 l. jamais tickées en
assertion CI).

**Tests fragiles :** le golden pleine-précision (**CORE‑01**, cause du RED) ; le couplage à l'ordre de
`BOONS` (**CORE‑22**). Le reste des dépendances `Date.now`/`Math.random` est correctement figé
(`vi.spyOn` + `FIXED_NOW`).

---

## 4. Détail par finding

### CORE‑01 — 🔴 BLOQUANT — Snapshot golden pleine précision + `geomSum` forme close → `vitest run` ROUGE
**Fichiers :** `src/game/core/__tests__/economy.golden.test.js:28` (site du correctif) · `src/game/core/mechanics/cost.js:77` (mécanisme)

**Problème.** Le sérialiseur de snapshot `serialize: (value) => `Decimal(${value.toString()})`` fige la
valeur Decimal en **précision complète (15-17 chiffres)**. `geomSum` (`cost.js:76-82`) calcule la somme
géométrique en **forme close** via `Math.pow` : `flt = B·s^n·(s^k−1)/(s−1)`. Pour foragers
(B=10, s=1.19, n=20, k=25) cela donne `130380.06209513955`, alors que le snapshot committé (recordé via une
somme terme-à-terme et/ou une autre plateforme) vaut `130380.06209513952`. Le dernier ulp dépend de la forme
du calcul et de l'implémentation `Math.pow` → la porte `vitest run` est **déterministement rouge** sur cette
machine.

**Preuve.**
```
cost.js:77  const flt = s === 1 ? B * k : B * Math.pow(s, n) * (Math.pow(s, k) - 1) / (s - 1);
node repro  closed = 130380.06209513955 · term-by-term = 130380.06209513952 · snapshot = …952
vitest      - Expected "food": Decimal(130380.06209513952)
            + Received "food": Decimal(130380.06209513955)   (tree principal, pas seulement le worktree)
economy.golden.test.js:26-29  expect.addSnapshotSerializer({ test: v => v instanceof Decimal,
                                serialize: v => `Decimal(${v.toString()})` });
```
Portée : **10 snapshots** stockent la précision complète (batchCost `e+41`/`e+47`, `rates`, `ruinGain e+138`,
`cityVitals`, `pressureBreakdown`, `timeWearRate`) — ils coïncident sur cette machine mais sont tout aussi
fragiles cross-plateforme.

**Impact.** Joueur : **nul** (coût identique à ~2e‑16 près ; `buildingBatchCost` est le point de passage
unique achat/`maxBuyAmount`, donc le jeu reste cohérent avec lui-même). Dev : **porte qualité rouge**, bloque
tout merge et **masque de vraies régressions** dans le bruit float. (Nuance : aucun CI/hook n'est configuré,
donc l'enforcement est le `npm test` manuel.)

**Correction recommandée (non appliquée).** Rendre le golden robuste au bruit ulp, au choix :
1. sérialiseur à **précision bornée** (`Decimal(${value.toPrecision(12)})`) — tue la variance ulp en gardant
   12 chiffres significatifs ; **le plus simple** ;
2. basculer les Decimal **non entiers** (`buildingBatchCost`/`rates`/`timeWearRate`) sur
   `toBeCloseTo`/tolérance relative au lieu de `toMatchSnapshot` ;
3. calculer `geomSum` en somme **itérative** pour les petits lots (n≤500, coût négligeable) afin de coller au
   terme-à-terme.
Puis régénérer les snapshots. **Ne pas toucher à l'équilibrage.** La même fragilité pleine précision touche
aussi les snapshots `number` natifs (`cityVitals`/`pressureBreakdown`/`timeWearRate`) — à traiter ensemble.
**Effort : S.**

---

### CORE‑02 — 🟠 MAJEUR — `eneeHeritage` absent de `GR_PERSISTENT_FIELDS` : héritage effacé au Grand Reset
**Fichier :** `src/game/core/state.js:1187` (bloc `GR_PERSISTENT_FIELDS` 1186-1195)

**Problème.** `eneeHeritage` est un **déblocage permanent** accordé une seule fois quand le Mythe d'Énée est
honoré (`myths.js:329 → state.eneeHeritage = true`, appelé au collapse via `actions/myths.js:60`). Il active
un boost de production globale en début de cycle (`production.js:370-371`) et un effet dans `crisis.js:280`.
Les **12 autres** booléens d'héritage figurent dans `GR_PERSISTENT_FIELDS` (`atlasHeritage`,
`sisypheHeritage`, `icareHeritage`, `babelHeritage`, `orHeritage`, `phoenixHeritage`, `atridesHeritage`,
`hephHeritage`, `cadmosHeritage`, `anteeHeritage`, `ragnarokHeritage`, + `prometheeBraisiers`), mais **pas
`eneeHeritage`**. `buildGrandResetState` (`state.js:1211-1220`) part d'un `defaultState()` frais
(`eneeHeritage=false`) et ne recopie que les champs de la liste ; **aucune ré-dérivation** depuis
`mythsCompleted` (`applyHeritage` n'est jamais rejoué). Résultat : au **premier Grand Reset**, l'héritage
d'Énée est perdu **définitivement**, alors que le message du GR promet « Les pactes mythiques demeurent ».
Aggravant : `mythsCompleted['mythe_d_enee']` **survit** (il est dans la liste), donc le mythe reste marqué
« complété » et **ne peut pas être re-gagné** — la perte est irrécupérable.

**Preuve.**
```
state.js:313   eneeHeritage: false,
state.js:869   eneeHeritage: Boolean(source.eneeHeritage),        // survit au save/load normal…
state.js:1186-1195  GR_PERSISTENT_FIELDS = [ …"atlasHeritage","sisypheHeritage",…"hephHeritage",…
                    "cadmosHeritage",…"anteeHeritage","ragnarokHeritage","olympus" ]   // JAMAIS "eneeHeritage"
myths.js:328-331   applyHeritage(){ state.eneeHeritage = true; state.eneeCollapseCount = 0; }  // seul point d'écriture
state.js:1213-1214 for (const key of GR_PERSISTENT_FIELDS) if (state[key]!==undefined) fresh[key]=… // enee jamais copié
```
Grep : `eneeHeritage` est le **seul** des 12 `*Heritage` absent de la liste.

**Impact.** Joueur : après un Grand Reset (méta-reset de fin de jeu), la « Migration fondatrice » d'Énée
disparaît pour toujours, **contrairement à tous les autres héritages**. Perte silencieuse et permanente,
incohérence flagrante. `grandReset.test.js` **ne peut pas l'attraper** : il fige l'invariant de recopie mais
« ne peut pas deviner un champ **oublié** dans la liste » — exactement la régression `olympus` déjà survenue
(cf. `grandReset.test.js:50`).

**Correction recommandée (non appliquée).** Ajouter `"eneeHeritage"` à `GR_PERSISTENT_FIELDS`
(`state.js:1186-1195`). `eneeCollapseCount` peut rester reset au GR (cohérent avec
`phoenixCycleCount`/`phoenixRenaissances`, eux aussi hors liste — patron « booléen persiste, compteur reset »).
**Barrer la classe de bug** : ajouter dans `grandReset.test.js` une assertion « tout booléen `*Heritage` de
`defaultState()` figure dans `GR_PERSISTENT_FIELDS` ». **Effort : S.**

---

### CORE‑03 — 🟡 MINEUR — `pickCrisisEvent` sans garde runtime (crash `choices` vide, latent)
**Fichier :** `src/game/core/actions/crisis.js:70`

**Problème.** `pickCrisisEvent` retourne `choices[state.cycles % choices.length]`. Si `choices` était vide,
`state.cycles % 0 = NaN` → `choices[NaN] = undefined`, puis `checkCrisisThresholds` fait `event.id`
(`crisis.js:82`) → **TypeError à chaque franchissement de palier** (jeu injouable). `choices` ne peut être
vide que si `pool = CRISIS_POOL.filter(e => e.threshold === threshold)` est vide, i.e. un seuil de
`CRISIS_EVENTS` sans crise correspondante. **Inatteignable aujourd'hui** (5 crises par seuil 0.25/0.5/0.75),
**mais** la seule barrière en prod est la **staticité des données** : l'invariant de cohérence est
`import.meta.env?.DEV` (`world.js:552`), strippé du build.

**Preuve.**
```
crisis.js:62-70  const pool = CRISIS_POOL.filter(e=>e.threshold===threshold); … 
                 const choices = fresh.length ? fresh : candidates;
                 return choices[state.cycles % choices.length];
crisis.js:81-82  const event = pickCrisisEvent(slot.threshold);
                 state.recentCrisisIds = [...(state.recentCrisisIds||[]).slice(-7), event.id];
world.js:552     if (import.meta.env?.DEV) { for (const ev of CRISIS_EVENTS) if (!CRISIS_POOL.some(...)) throw … }
```

**Impact.** Nul en pratique aujourd'hui. Risque : un futur ajout de seuil de crise (ou un tri de données
échappant à DEV/test) ferait planter la partie **en prod** à la première crise, sans filet.

**Correction recommandée (non appliquée).** Garde in-fonction : `if (!choices.length) return null;` + early-return
dans `checkCrisisThresholds`, **ou** faire tourner l'invariant `CRISIS_POOL`↔`CRISIS_EVENTS` **en prod aussi**
(le sortir du `if (DEV)`). Coût nul, filet permanent. **Effort : S.**

---

### CORE‑04 — 🟡 MINEUR — `openCrisisEvent` appelle `choice.apply()` sans garde de type (soft-lock latent)
**Fichier :** `src/game/core/actions/crisis.js:146`

**Problème.** `openCrisisEvent` fait `setGamePaused(true)` (`:129`) puis `const outcome = choice.apply();`
(`:146`), et ne lève la pause qu'à `:156`. Si `choice.apply` n'était pas une fonction (option de crise mal
authorée), l'appel throw **entre** la mise en pause et la levée → la partie reste **bloquée en pause**
(soft-lock), pas un simple log récupérable. Le miroir `autoResolveCrisisEvent` garde pourtant explicitement
`if (!choice || typeof choice.apply !== "function") return;` (`:113`). **Défense asymétrique**, inatteignable
avec les données actuelles.

**Preuve.**
```
crisis.js:112-113  const choice = opts.find(o=>o.stance===stance) || opts[0];
                   if (!choice || typeof choice.apply !== "function") return;   // ← garde présente
crisis.js:129,146,156  setGamePaused(true); … const outcome = choice.apply(); … setGamePaused(false);  // ← garde absente
```

**Impact.** Nul aujourd'hui. Si une crise future avait une option sans `apply`, le joueur se retrouverait
avec un jeu **figé en pause** plutôt qu'une erreur récupérable.

**Correction recommandée (non appliquée).** Aligner sur le jumeau :
`if (!choice || typeof choice.apply !== "function") { setGamePaused(false); render(); return; }` avant
l'appel. **Effort : S.**

---

### CORE‑05 — 🟡 MINEUR — `checkAutomateRules` : `canPayCost(undefined)` throw dans le tick (latent)
**Fichier :** `src/game/core/actions/automation.js:153`

**Problème.** Branche `crisis_action` : `if (canPayCost(costs[rule.actionId]))` passe `costs[rule.actionId]`
directement. Si `rule.actionId` n'est pas une clé de `crisisCosts()`, la valeur est `undefined` et
`canPayCost` fait `Object.entries(undefined)` → **TypeError dans le tick** (`checkAutomateRules` tourne chaque
frame quand `hephHeritage`). **Tous** les autres sites gardent `!cost` d'abord (`crisis.js:476,502,551`).
Inatteignable aujourd'hui car `normalizeRuleList` (`state.js:569`) fige `actionId` à `"rationing"`, présent
dans `crisisCosts`.

**Preuve.**
```
automation.js:149-155  if (rule.type==="crisis_action"){ … const costs = crisisCosts();
                         if (canPayCost(costs[rule.actionId])) { runCrisisAction(rule.actionId,…); } }
utils.js:145-146       export function canPayCost(cost){ return Object.entries(cost).every(...); }  // throw si undefined
```

**Impact.** Nul aujourd'hui (`actionId` verrouillé). Devient un **crash de tick** si une future règle
d'automatisation porte un `actionId` absent de `crisisCosts` (ex. une action de régulation déblocable).

**Correction recommandée (non appliquée).** Garder comme ailleurs :
`const c = costs[rule.actionId]; if (c && canPayCost(c)) runCrisisAction(...)`, ou durcir `canPayCost` pour
renvoyer `false` sur `cost` falsy. **Effort : S.**

---

### CORE‑06 — 🟡 MINEUR — `decimalField` ne gère pas la forme Decimal objet-plat
**Fichier :** `src/game/core/state.js:411`

**Problème.** `decimalField()` accepte `Decimal`/`number`/`string`, mais retombe sur le fallback pour un
Decimal **déshydraté en objet plat** `{mantissa, exponent}` — alors que `D()` et `toNum()` (`num.js:40-62`)
défendent explicitement cette forme (via `plainDecimal()`) précisément parce qu'un tel objet coerce en NaN/0.
Un champ **sans plafond** (côté Decimal de la frontière) présent sous forme objet-plat serait donc
**silencieusement remis au défaut** au chargement.

**Preuve.**
```
state.js:411-421  const candidate = value instanceof Decimal ? value
                    : typeof value==="number" && Number.isFinite(value) ? new Decimal(value)
                    : typeof value==="string" && value ? new Decimal(value)
                    : null;                         // {mantissa,exponent} → null
                  if (!candidate || …) return D(fallback);   // → défaut (0)
num.js:56-60      if (plainDecimal(value)) return Decimal.fromMantissaExponent(value.mantissa, value.exponent);  // D() le gère
```

**Impact.** **Latent** : les saves réels ne produisent jamais d'objet-plat (`Decimal.toJSON = this.toString()`
→ sérialisation en string, vérifié dans `node_modules/break_infinity.js`). Le risque se limite aux saves
**importés/édités à la main** ou d'une version hypothétique sans `toJSON` : une ressource sans plafond
(population/food/gold/ruins…) serait remise à 0 au lieu d'être ré-hydratée. Contrairement à `toNum`/`D`, le
fallback ici est un `D(fallback)` **valide** — donc remise silencieuse au défaut, pas un gel de layout.

**Correction recommandée (non appliquée).** Faire passer `decimalField` par `D()` pour le cas objet (ajouter
une branche `plainDecimal(value)` ou déléguer à `D()` quand `candidate===null` et que `value` est objet-plat),
en conservant le clamp `>= 0`. **Effort : S.**

---

### CORE‑07 — 🟡 MINEUR — Branches Decimal de `pressureBreakdown`/`cityVitals`/`scarcityRawInstant` non testées en parité
**Fichier :** `src/game/core/mechanics/production.js:564`

**Problème.** Contrairement aux 7 paires `*Dec` explicites (toutes dans `decimal.parity.test.js`),
`pressureBreakdown()` (branche Decimal 562-569), `cityVitals()` (664-669) et `scarcityRawInstant()` (516-517)
portent un **double chemin float/Decimal inline** jamais comparé float-vs-Decimal. `decimal.parity.test.js`
ne les importe pas ; `economy.golden` ne les exerce qu'en float ; `decimal.smoke` ne fait qu'un contrôle de
**saneté** (`isSaneDecimal`), sans égalité. Équivalents aujourd'hui (relu ligne-à-ligne), donc **aucun bug
vivant** — mais l'équilibrage retouche surtout la formule **float**, et un oubli côté Decimal passerait golden
**et** smoke au vert tout en produisant une jauge fausse au-delà de ~1.8e308.

**Preuve.**
```
production.js:562-568  } else { const popDec = D(state.population).max(1);
                         scarcityRaw = Math.max(0, popDec.mul(2.4).sub(state.food).div(...).toNumber()); … }
grep pressureBreakdown|cityVitals|scarcityRawInstant  decimal.parity.test.js  →  0 hit
```

**Impact.** Risque de régression **silencieuse** réservée au très late game (post-débordement float), non
attrapée par la suite. Pas d'impact courant.

**Correction recommandée (non appliquée).** Étendre `decimal.parity.test.js` : ajouter ces 3 fonctions à la
table de scénarios, comparées sur un état sous-plafond via un séam de forçage de branche (à l'image de
`forceDecimalPath` de `rates()`). **Effort : M.**

---

### CORE‑08 — 🟡 MINEUR — `production.js` (mechanics) importe vers le haut dans `actions/olympus.js`
**Fichier :** `src/game/core/mechanics/production.js:75`

**Problème.** `production.js:75` fait `import { olympusAbyssProductionMultiplier } from '../actions/olympus.js'`.
Or `actions.js` (baril de la couche actions) importe `mechanics.js`, et `actions/olympus.js:7` réimporte
`ruinEffectSum` depuis `mechanics/shared.js` → **cycle de dépendances au niveau des paquets** (mechanics
dépend d'actions/olympus ; actions dépend de mechanics). Il ne casse pas le chargement aujourd'hui **uniquement**
parce que `shared.js` est une feuille. C'est fragile : dès qu'`olympus.js` importera quoi que ce soit de
`production.js`/`prestige.js`, ce devient un vrai cycle ES (risque TDZ/undefined). Or
`olympusAbyssProductionMultiplier()` est une **lecture pure** de `state.olympus`/`state.instability` renvoyant
un multiplicateur borné — sa place logique est dans la couche mechanics. Le header `production.js:6` affirme
d'ailleurs « Dépend uniquement de shared », **invariant violé** par la ligne 75.

**Preuve.**
```
production.js:75   import { olympusAbyssProductionMultiplier } from '../actions/olympus.js';
actions/olympus.js:7      import { ruinEffectSum } from "../mechanics/shared.js";
actions/olympus.js:108-116  export function olympusAbyssProductionMultiplier(){ … lit state.olympus/instability … }
production.js:392/407  (consommé dans le chemin chaud float ET le miroir Decimal)
```

**Impact.** Dev : graphe de dépendances du cœur inversé sur ce point ; toute évolution d'`olympus.js` peut
transformer l'inversion en **cycle de chargement bloquant**, y compris pour la sim headless qui importe
`mechanics.js` en premier. Aucun impact joueur.

**Correction recommandée (non appliquée).** Extraire `olympusAbyssProductionMultiplier` (+ les helpers
**partagés** `cultAmpMult`/`olympus()`, utilisés aussi par d'autres exports d'`olympus.js:66/87/101/121/125`)
dans un module de la couche mechanics (ex. `mechanics/production/olympusEffect.js`), le faire consommer par
`production.js`, et le **ré-exporter** depuis `actions/olympus.js` pour préserver l'API. `production.js`
n'importe alors plus vers le haut. **Effort : S.**

---

### CORE‑09 — 🟡 MINEUR — Sims non reproductibles : `Math.random` du tick non seedé
**Fichier :** `src/game/core/actions/tick.js:304` (+ `:311`, `chronicleEvaluator.js:186`, `crisis.js:509`)

**Problème.** Les 4 simulateurs qui tickent en direct (`simulate-ce.js`, `sim-10-profils.js`,
`sim-idle-impact.js`, `simulate-game.js`) stubent `Date.now` (`setClock`) mais laissent `Math.random` réel.
À chaque tick, le vrai moteur tire `Math.random` pour les **aubaines** (`maybeFireBoon` `tick.js:247` →
`scheduleBoonDelay` `:304` pour le délai + `fireBoon` `:311` pour la ressource), la **sélection de chronique**
(`chronicleEvaluator.js:186`) et les **paris** de régulation (`crisis.js:509`). Sur des heures/jours virtuels
par profil, ce sont des **centaines** de perturbations économiques aléatoires : deux exécutions du même
scénario, même machine, même échéancier `Date.now`, **divergent**. La sim reste **fidèle** au moteur (elle
hérite de l'aléa du jeu, aucune divergence sim↔jeu) — mais un **outil de mesure** qui publie des « chiffres
EXACTS » pour calibrer le pacing doit neutraliser cet aléa.

**Preuve.**
```
tick.js:247  if (!isNotifyPaused()) { celebratePopMilestone(); maybeFireBoon(r); }
tick.js:304  return ((BOON_INTERVAL_MIN_SEC + Math.random() * span) / freq) * 1000;
tick.js:311  const boon = BOONS[Math.floor(Math.random() * BOONS.length)];
Probe runtime (état identique, même Date.now, 300 ticks, 2 runs) → « DÉTERMINISTE ? false »
grep Math.random dans les sims → 0 (aucun stub/seed) ; grep setNotifyPaused → 0
```

**Impact.** Les rapports committés (`balance-summary.md`, `course-gr1-profils.md`,
`simulation-report.html`, l'en-tête `pacing-profiles.md` annonçant « Chiffres EXACTS » via `simulate-ce.js:671`)
varient d'un run à l'autre sur la même machine ; un designer qui compare deux runs ou règle un coût sur un
jalon horodaté **agit sur du bruit présenté comme exact**. Aucun impact sur le jeu livré, les saves, ni de crash.

**Correction recommandée (non appliquée).** Avant de ticker : soit **couper les aubaines** pendant la mesure
(`setNotifyPaused(true)` importé de `state.js`, comme le fait déjà l'offline), soit remplacer `Math.random`
par un **PRNG seedé** (mulberry32) réinitialisé dans `resetScenario()`/`runProfile()`. Documenter que la
mesure est alors reproductible. **Effort : M.**

---

### CORE‑10 — 🟡 MINEUR — Budget de sim borné sur l'horloge murale réelle → jalons dépendants de la machine
**Fichier :** `simulate-ce.js:200` (idem `sim-10-profils.js:244`)

**Problème.** `timedOut()` compare `realNow()` — l'horloge **réelle** capturée avant le patch de `Date.now`
(`ORIGINAL_NOW`, `simulate-ce.js:148-149`) — à `REAL_TIME_LIMIT_MS`. La boucle s'arrête quand le **temps réel
de calcul** dépasse `--maxreal`, pas quand le budget **virtuel** est atteint (borne de boucle
`simulate-ce.js:460`). Conséquence : sur une machine plus lente, **moins de temps virtuel** est simulé, donc
**moins de jalons** enregistrés, et les cellules « — » confondent « pas eu le temps de calculer » et
« réellement hors de portée ». En partie voulu (garde-fou compute) et divulgué (`truncatedByRealTime`), mais
reste une source de non-reproductibilité **inter-machines** des livrables committés, distincte de CORE‑09.

**Preuve.**
```
simulate-ce.js:149  const realNow = () => ORIGINAL_NOW.call(Date);
simulate-ce.js:200  function timedOut() { return realNow() - scenarioRealStart > REAL_TIME_LIMIT_MS; }
                    (borne de boucle simulate-ce.js:460 ; idem sim-10-profils.js:743)
```

**Impact.** Deux machines produisent des tables de jalons différentes pour le même code de jeu ; comparaisons
de pacing entre runs/versions faussées si le compute varie.

**Correction recommandée (non appliquée).** Pour les runs de référence, borner uniquement sur le temps
**virtuel** (`VT`/`BUDGET_SECONDS`) et réserver `--maxreal` à un garde-fou anti-boucle, en signalant
explicitement dans le rapport si la troncature réelle a mordu (déjà partiellement fait). **Effort : S.**

---

### CORE‑11 — 🟡 MINEUR — `sim-10-profils.js` absent de `globalIgnores` → 19 faux positifs `no-undef`
**Fichier :** `eslint.config.js:8`

**Problème.** `globalIgnores` liste `'simulate-game.js'`, `'simulate-ce.js'`, `'sim-idle-*.js'`,
`'bench-myths.js'`, `'bench-rupture.js'` mais **pas `'sim-10-profils.js'`**. Ce fichier est donc linté avec
`globals.browser` alors qu'il tourne sous Node : `global`, `process`, `setImmediate` deviennent `no-undef`.
Sur les 26 erreurs, **19 sont ces faux positifs de config** (`global`×7, `process`×11, `setImmediate`×1) ;
elles ne signalent aucun défaut du script.

**Preuve.**
```
eslint.config.js:8  globalIgnores(['dist','scratch','simulate-game.js','simulate-ce.js','sim-idle-*.js',
                                   'bench-myths.js','bench-rupture.js'])   // 'sim-10-profils.js' manquant
npx eslint sim-10-profils.js → 26 problems : "56:1 global is not defined no-undef",
                                             "141:33 process is not defined", "243:40 setImmediate is not defined"
```

**Impact.** `npx eslint .` échoue en partie à cause d'un fichier in-scope, pour de faux positifs ; bruit qui
noie les 7 vraies `no-unused-vars` du même fichier (CORE‑19). (Nuance : aucune porte auto-enforcée — pas de
CI/hook — donc « sans impact courant ».)

**Correction recommandée (non appliquée).** Ajouter `'sim-10-profils.js'` à `globalIgnores:8` (ou remplacer
les entrées sim par un glob `'sim-*.js'` couvrant `sim-idle-*` **et** `sim-10-profils`), **ou** ajouter un
bloc `{ files:['sim-10-profils.js'], languageOptions:{ globals: globals.node } }` (garde alors les vraies
unused-vars). **Effort : S.**

---

### CORE‑12 — 🟡 MINEUR — Pas de `test.exclude` → vitest ramasse les worktrees parasites
**Fichier :** `vite.config.js:61`

**Problème.** `vite.config.js` n'a aucun bloc `test`, donc vitest utilise l'exclude par défaut
(`node_modules`/`dist`/`.git`…) qui ne couvre **pas** `.claude/worktrees/**`. Les deux worktrees dupliquent
tout l'arbre : **32 fichiers `.test.js` chacun** (64 en plus des ~32 réels). La suite tourne **en triple** et
l'échec golden est compté deux fois (d'où le « 2/717 »).

**Preuve.**
```
find .claude/worktrees -name "*.test.js" → 64
vite.config.js:61  plugins: [react(), previewShotPlugin(), mapFullReloadPlugin()],  // aucun champ `test`
```

**Impact.** **Local uniquement** : `.claude/` est `gitignore`d (CI sur checkout propre non affectée), mais un
`npm test`/`eslint .` en local est **pollué** — tests exécutés sur des copies potentiellement divergentes,
échec amplifié, temps triplé. Signal de porte qualité brouillé.

**Correction recommandée (non appliquée).** Ajouter dans `vite.config.js` :
`test: { exclude: [...configDefaults.exclude, '.claude/worktrees/**'] }` (import `configDefaults` de
`vitest/config`). Miroir eslint : ajouter `'.claude/worktrees/**'` (et `'sim-10-profils.js'`) aux
`globalIgnores`. **Effort : S.**

---

### CORE‑13 — 🟡 MINEUR — Système de mythes par tick jamais exercé par les tests
**Fichier :** `src/game/core/actions/mythTicks.js:208`

**Problème.** `runMythTicks` n'invoque un handler que si `isMythEffectActive(id)` (`:209-213`). **Aucun test
ne combine un mythe actif ET un appel à `tick()`** : la fixture `MID_GAME_FIXTURE` n'a pas d'`activeMythId`,
et `decimal.parity` pose `activeMythId` mais **ne tick pas**. Les corps des `MYTH_TICK_HANDLERS` (dette
Atrides, malédiction Sisyphe sur les coûts, Usure Icare/Atlas, clamp pop Âge d'Or, décroissance Héphaïstos,
retour `'abort'`) ont une **couverture d'assertion CI nulle**. Idem `myths.js` (376 l.) : `activateMyth`,
`checkMythOnCollapse`, `foundDynasty`, `resetCivilization`, `migrerEnee` — 0 test.

**Preuve.**
```
grep MYTH_TICK_HANDLERS|runMythTicks|activateMyth|checkMythOnCollapse  __tests__  → 0
mythTicks.js:208-214  for (const id of MYTH_TICK_ORDER){ if(!isMythEffectActive(id)) continue; …
                        if (handler(state,dt)==='abort') return 'abort'; }
fixtures.js:13-44  (aucun activeMythId)
```

**Impact.** Une régression dans un effet de mythe par tick (ex. Atrides dont la dette peut propager Infinity,
Sisyphe qui multiplie tous les coûts) **passerait toute la suite CI**. Atténuation : les sims racine
(`sim-10-profils.js` teste précisément la complétabilité des mythes) parcourent ces handlers — une régression
**grossière** remonterait à l'exécution d'une sim, mais pas comme garde automatisée.

**Correction recommandée (non appliquée).** Un test par mythe : poser `activeMythId`/`mythsCompleted`,
`tick(1)`, asserter l'effet (dette qui croît, coûts majorés, retour `'abort'` quand pending, Usure modifiée).
**Effort : M.**

---

### CORE‑14 — 🟡 MINEUR — `legitimacyGain` sans aucun test
**Fichier :** `src/game/core/mechanics/prestige.js:192`

**Problème.** `legitimacyGain` calcule la légitimité créditée à chaque dynastie fondée — devise qui gate la
fondation de dynasties puis le Grand Reset. Elle n'est appelée que par `foundDynasty` (`myths.js:69`),
lui-même non testé. **0 test.** (Voir aussi §3.A : la formule réelle est
`floor( min(MAX_VALUE, (ruins/160)^0.5) + cycles/12 + floor(dynastyCount/5) )` — le brief décrivait une
formule « prep » inexistante ; d'autant plus utile d'avoir une garde de régression sur la **vraie** formule.)

**Preuve.**
```
grep legitimacyGain __tests__ → 0
prestige.js:192-201  if (D(state.ruins).lt(dynastyRuinsThreshold())) return 0;
                     const base = Math.min(Number.MAX_VALUE, Math.pow(toNum(state.ruins)/160, 0.5));
                     const cycleMod = state.cycles / 12; const dynPalier = Math.floor((state.dynastyCount||0)/5);
                     return Math.floor(base + cycleMod + dynPalier);
```
`legitimacy` est un `number` natif (côté borné de la frontière `num.js`), plafonné à `MAX_VALUE` → pas de
NaN/Infinity propagé.

**Impact.** Un changement d'équilibrage ou une régression de la légitimité — devise de progression majeure —
ne serait attrapé par **aucun** test.

**Correction recommandée (non appliquée).** Test unitaire : branche sous-seuil (=0), points de courbe
(ruins/cycles/dynastyCount variés), non-propagation d'Infinity (`toNum(ruins)` énorme → plafond `MAX_VALUE`).
**Effort : S.**

---

### CORE‑15 — 🟡 MINEUR — Chemin interactif d'effondrement post-épitaphe non exercé
**Fichier :** `src/game/core/events.js:112`

**Problème.** `collapse.persistence` teste `runCollapseSequence` **jusqu'à** l'ouverture du dialogue seulement
(la promesse du dialogue n'est jamais résolue : `return new Promise(() => {})`). Tout ce qui suit l'`await` —
sélection du legs, écriture persistée `state.nextEpitaphLegacy` (`events.js:113-118`), `finalGain`,
`promptActiveRuinsForNewCycle` — n'est jamais couvert. `generateEpitaph` (`events.js:49`, 4 causes) n'a aucun
test d'assertion (il est exécuté par 4 sims, mais sans assertion). Le chemin offline court-circuite le choix
d'épitaphe.

**Preuve.**
```
collapse.persistence.test.js:41-44  registerChoiceDialog((dialog) => { … return new Promise(() => {}); }); // jamais résolu
grep generateEpitaph __tests__ → 0
```

**Impact.** Une régression dans l'attribution du legs d'épitaphe ou le gain final de ruines (chemin de jeu
**normal** via dialogue) ne serait pas détectée ; risque de perte du legs choisi.

**Correction recommandée (non appliquée).** Test qui **résout** le dialogue avec un `epitaphLegacyId` choisi et
asserte `state.nextEpitaphLegacy` (id/cause/chosenCycle) + `finalGain`, plus un test de `generateEpitaph` sur
les 4 causes. **Effort : M.**

---

### CORE‑16 — 🟡 MINEUR — Sélection de crise (`pickCrisisEvent` & co) non testée
**Fichier :** `src/game/core/actions/crisis.js:62`

**Problème.** La sélection d'événement de crise (filtrage par `condition`, dédup `recentCrisisIds`, choix
déterministe `cycles%len`) n'a **aucun test** (seul `autoResolveCrisisEvent` l'est). Le crash « choices vide »
(CORE‑03) est défendu au **chargement** par l'invariant DEV/test de `world.js` — donc non-live — mais cette
garde est data-only et ne vérifie pas la logique de `pickCrisisEvent`. Les 3 tests qui tickent **neutralisent**
la branche de tir (tous les seuils pré-marqués `true`) → aucune couverture incidente.

**Preuve.**
```
grep pickCrisisEvent|checkCrisisThresholds|openCrisisEvent __tests__ → 0
crisis.js:70  return choices[state.cycles % choices.length];
world.js:552-556  if (import.meta.env?.DEV){ for(const ev of CRISIS_EVENTS) if(!CRISIS_POOL.some(...)) throw … }
```

**Impact.** La logique de tirage (dédup, filtrage, déterminisme) peut régresser silencieusement ; en prod
l'invariant est strippé, donc un seuil orphelin introduit hors dev crasherait `event.id`.

**Correction recommandée (non appliquée).** Unit test `pickCrisisEvent` : `condition()` qui filtre, dédup via
`recentCrisisIds`, sélection déterministe `cycles%len`, cas pool réduit à 1. Optionnellement asserter que tout
seuil de `CRISIS_EVENTS` a un pool non vide. **Effort : M.**

---

### CORE‑17 — 🟡 MINEUR — Déclenchement d'effondrement dans le tick jamais atteint par un test
**Fichier :** `src/game/core/actions/tick.js:281`

**Problème.** Les trois tests qui appellent `tick()` (`tickInvariants`, `decimal.smoke`, `newMechanics`)
restent en **zone sûre** : la fixture ne franchit jamais Rupture/Usure = 1, si bien que le bloc
`crisisOpen() → triggerCollapseChoices` (`tick.js:280-282`) n'est **jamais exécuté**. La chaîne critique
« tick → Rupture à 1 → crise terminale → effondrement » (chemin de jeu normal) n'est couverte que par le
chemin offline (`simulateAwayCrises`), pas par le tick temps réel.

**Preuve.**
```
tickInvariants.test.js:27  state.crisisThresholds = Object.fromEntries(CRISIS_EVENTS.map(e=>[e.id,true]));  // idem smoke:35, newMechanics:37
tick.js:280-282  if (crisisOpen() && !state.crisisLimitAnnounced && !collapseInProgress) { triggerCollapseChoices(false); }
```
(Précision : le bloc dépend de `crisisOpen()` = instability/timeWear ≥ 1, PAS de `checkCrisisThresholds` ; la
fixture ne l'atteint jamais. `simulate-ce.js`/`sim-10-profils.js` l'exercent mais comme diagnostic manuel.)

**Impact.** La chaîne tick→seuil→effondrement n'a **aucune garde de régression** automatisée ; un bug de
déclenchement ne serait vu qu'en jeu.

**Correction recommandée (non appliquée).** Test d'intégration pilotant `instability→1` (dialogue/collapse
mockés) pour exercer `checkCrisisThresholds` + `triggerCollapseChoices` dans le tick. **Effort : M.**

---

### CORE‑18 — ⚪ NETTOYAGE — `state.notifEnabled` : miroir sérialisé mais mort
**Fichier :** `src/game/core/state.js:300`

**Problème.** `state.notifEnabled` est écrit (défaut `:300`, `main.js:357/417`) et sérialisé dans chaque save,
mais (1) `hydrateState` ne le restaure **jamais** depuis `source` (il ne vient que de `...base` → toujours
`true` au load) et (2) **aucune lecture** de `state.notifEnabled` n'existe : le vrai réglage est `optNotif`
(`main.js`), exposé par `getNotifEnabled()` et persisté à part dans `localStorage['civ-opt-notif']`, restauré
par `initAudio`. C'est un **miroir write-only mort** (faux positif de round-trip écarté par grep).

**Preuve.**
```
grep '\.notifEnabled' src → écritures : state.js:300, main.js:357, main.js:417 ; lectures : 0 (l'UI lit getNotifEnabled()=optNotif)
main.js:359  localStorage.setItem("civ-opt-notif", String(optNotif));
main.js:414-418  const savedNotif = localStorage.getItem("civ-opt-notif"); … state.notifEnabled = optNotif;
hydrateState (state.js:799-960) : aucune ligne `notifEnabled:`
```

**Impact.** **Aucun** impact joueur (le réglage survit via `civ-opt-notif` + `initAudio`). Mais le champ
ressemble à un trou de round-trip et brouille l'audit ; poids mort dans le payload.

**Correction recommandée (non appliquée).** Soit **supprimer** `state.notifEnabled` (s'appuyer sur
`getNotifEnabled()`/`civ-opt-notif`), soit — pour en faire la source de vérité — le restaurer dans
`hydrateState` **et** le faire lire par le jeu. Faible priorité. **Effort : S.**

---

### CORE‑19 — ⚪ NETTOYAGE — 7 imports/variables morts dans `sim-10-profils.js`
**Fichier :** `sim-10-profils.js:116` (+ 83, 117, 119, 374, 535)

**Problème.** Sept symboles définis mais jamais utilisés : `PRESTIGE_TREE_BRANCHES` (`:83`), `rates` (`:116`),
`timeWearRate` (`:116`), `ownedRuinBranchPurchaseCount` (`:117`), `TERMINAL_PREP_TIERS` (`:119`), la fonction
`buyMinimalGold` (définie `:374`, jamais appelée — seul `buyMinimalInfra` l'est), et le paramètre destructuré
`ageSec` (`:535`, dans `buy({ ageSec }) { buyMinimalInfra(); }` où le corps l'ignore). Vraies scories
(indépendantes des faux positifs `no-undef` de CORE‑11).

**Preuve.**
```
npx eslint sim-10-profils.js → "83:46 PRESTIGE_TREE_BRANCHES never used", "116:56 rates never used",
  "116:63 timeWearRate never used", "117:20 ownedRuinBranchPurchaseCount never used",
  "119:24 TERMINAL_PREP_TIERS never used", "374:10 buyMinimalGold is defined but never used",
  "535:11 ageSec is defined but never used"
```

**Impact.** Bruit de lint + confusion (`buyMinimalGold` suggère une tactique Âge d'Or jamais câblée ; les
imports `rates`/`timeWearRate` laissent croire à une mesure inexistante).

**Correction recommandée (non appliquée).** Retirer les 5 imports inutilisés, supprimer `buyMinimalGold` (ou
la câbler dans la tactique `mythe_age_or` si c'était l'intention), retirer le param `ageSec` de la closure.
**Effort : S.**

---

### CORE‑20 — ⚪ NETTOYAGE — `olympusUnlockedProfile()` : export mort, doublon du jumeau `data/`
**Fichier :** `src/game/core/actions/olympus.js:125`

**Problème.** `olympusUnlockedProfile()` est réexporté dans `actions.js:75` mais **n'a aucun appelant** (ni
self-call, ni consommateur applicatif, ni sim, ni test). C'est un **doublon fonctionnel exact** de
`src/game/data/olympus.js:168 unlockedOlympusProfile(olympus)` — et c'est la version `data/` qui est câblée à
l'écran des mythes (`MythsView.jsx:59`). La version cœur est du **code mort strict** qui gonfle l'API du baril.

**Preuve.**
```
grep -rn olympusUnlockedProfile src/ *.js (hors worktrees) →
  src/game/core/actions/olympus.js:125:export function olympusUnlockedProfile() {   ← def
  src/game/core/actions.js:75:  olympusUnlockedProfile                              ← SEULE autre occurrence = réexport
Le vrai consommateur utilise le jumeau : MythsView.jsx:59  unlockedOlympusProfile(olympus)  (data/olympus.js:168)
```

**Impact.** Aucun impact joueur (jamais exécuté). Dev : bruit dans l'API du baril + **divergence latente** —
toute évolution de la logique « profil olympien débloqué » doit se faire sur `data/olympus.js`, jamais ici ;
garder les deux invite à corriger le mauvais.

**Correction recommandée (non appliquée).** Supprimer la fonction (`olympus.js:125-128`) et la ligne du baril
(`actions.js:75`). **Ne pas toucher** `unlockedOlympusProfile` de `data/olympus.js` (c'est la vivante).
**Effort : S.**

---

### CORE‑21 — ⚪ NETTOYAGE — Multiplicateur de Grand Reset `2^grandResetCount` dupliqué sur 6 sites
**Fichier :** `src/game/core/mechanics/production.js:151`

**Problème.** La formule du multiplicateur de Grand Reset (garde chaos + `Math.pow(2, grandResetCount)`) est
dupliquée entre sous-modules : `grandResetMultiplier()` (`production.js:149-151`) et
`grandResetRuinMultiplier()` (`prestige.js:41-45`, + bonus ragnarok ×4) partagent le même cœur. La même base
`2^n` est en outre **recalculée en dur pour l'affichage** dans `building.js:263/267/269` et `state.js:1219`
(message d'historique). **Six sites** hardcodent le facteur 2 sans base nommée ni helper.

**Preuve.**
```
production.js:151  return Math.pow(2, state.grandResetCount || 0);            // grandResetMultiplier()
prestige.js:43     const base = Math.pow(2, state.grandResetCount || 0);      // grandResetRuinMultiplier()
building.js:263/267/269  `…x${Math.pow(2, nextCount).toFixed(0)} production…` (×3, affichage)
state.js:1219      `…x${Math.pow(2, nextCount).toFixed(0)} production et Ruines…` (historique)
```
(`prestige.js:148` exclu : c'est le **coût** de légitimité, quantité différente.)

**Impact.** Pas de bug courant (les 6 sites concordent sur base=2). Risque dev : un rééquilibrage de la base
oblige à modifier 2 fonctions **+ 4 chaînes** en synchro parfaite ; un oubli fait **mentir l'UI** (dialogue GR
/ historique) sans casser la logique. (Note orthogonale : les chaînes d'affichage recalculent `Math.pow(2,…)`
**sans** la garde `mythe_du_chaos` de `grandResetMultiplier()` → le dialogue mentirait déjà si le chaos était
actif.)

**Correction recommandée (non appliquée).** Une seule source de vérité : `GRAND_RESET_PROD_BASE = 2` dans
`balance.js` + un helper `grandResetProductionMult()` réutilisé par `production.js` et `prestige.js` (ce
dernier ajoutant le ragnarok), et faire **lire** ce helper par les libellés au lieu de recalculer.
**Effort : M.**

---

### CORE‑22 — ⚪ NETTOYAGE — Test d'aubaine couplé à l'ordre du tableau `BOONS`
**Fichier :** `src/game/core/__tests__/newMechanics.test.js:159` (bloc 156-164)

**Problème.** Le test B2 mocke `Math.random→0` en **supposant** `BOONS[0] = caravane (or)` et asserte que
l'or augmente. Réordonner `boons.js` casserait silencieusement l'hypothèse : si `BOONS[0]` devenait un boon
food, l'or n'augmenterait pas et le test échouerait pour une raison **sans rapport** avec la mécanique testée.

**Preuve.**
```
newMechanics.test.js:158-161  vi.spyOn(Math,'random').mockReturnValue(0); // BOONS[0] = caravane (or)
                              … expect(D(state.gold).gt(goldBefore)).toBe(true);
boons.js:20-23  export const BOONS = [ { id: "caravan", resource: "gold", … }, … ]   // or à l'index 0
```

**Impact.** Fragilité d'ordre : une réorganisation légitime des aubaines fait échouer un test qui n'a rien à
voir avec l'ordre, masquant l'intention.

**Correction recommandée (non appliquée).** Rendre le test indépendant de l'ordre : détecter dynamiquement le
boon tiré et asserter sur **sa** ressource, ou mocker l'indice pour cibler explicitement le boon `caravan`.
**Effort : S.**

---

## 5. Top actions à fort ROI du lot

1. **Remettre la porte vitest au vert (CORE‑01).** Borner la précision du sérialiseur golden
   (`Decimal(${value.toPrecision(12)})`) ou passer les Decimal non entiers sur `toBeCloseTo`, puis régénérer.
   Débloque tout merge, tue une classe entière de fragilité cross-plateforme. **Effort S, priorité absolue.**
2. **Sauver l'héritage d'Énée (CORE‑02).** Ajouter `"eneeHeritage"` à `GR_PERSISTENT_FIELDS` **et** une
   assertion de garde « tout `*Heritage` de `defaultState` ∈ `GR_PERSISTENT_FIELDS` » dans `grandReset.test.js`.
   Corrige une perte de progression permanente **+ barre la classe de bug** (déjà survenue avec `olympus`).
   **Effort S, plus fort ROI joueur.**
3. **Dé-polluer les portes qualité (CORE‑12 + CORE‑11).** `test.exclude: ['.claude/worktrees/**']` dans
   `vite.config.js` + `sim-10-profils.js`/`.claude/worktrees` dans `globalIgnores`. Restaure un signal
   lint/test fiable en local (une suite propre attrape la prochaine régression). **Effort S.**
4. **Fiabiliser les sims d'équilibrage (CORE‑09).** `setNotifyPaused(true)` pendant la mesure (coupe les
   aubaines) **ou** PRNG seedé. Rend reproductibles les tables de pacing sur lesquelles reposent les décisions
   d'équilibrage — aujourd'hui du bruit présenté comme « exact ». **Effort M.**
5. **Couvrir le plus gros trou de test : le système de mythes (CORE‑13) + `legitimacyGain` (CORE‑14).** Un
   test par mythe actif (`tick(1)` + assertion d'effet) + un golden sur `legitimacyGain`. Verrouille des
   mécaniques centrales (dette Atrides/Infinity, coûts Sisyphe, devise de prestige) aujourd'hui sans garde.
   **Effort M.**

---

### Annexe — Note de méthode sur la sévérité

Le barème appliqué : **BLOQUANT** = casse une porte qualité / crash / corruption de save ; **MAJEUR** = bug
joueur observable ou perte de données edge-case ; **MINEUR** = robustesse/incorrection sans impact courant ;
**NETTOYAGE** = code mort vérifié / duplication / style. Deux findings ont été **ajustés** en vérification :
la fragilité golden **relevée** MAJEUR→BLOQUANT (elle casse `vitest run`), et la pollution worktrees
**abaissée** MAJEUR→MINEUR (locale seulement, `.claude` gitignoré). Un finding a été **réfuté** et écarté
(`num.js:26`, commentaire exact). Le finding sim/déterminisme a été **abaissé** MAJEUR→MINEUR (outil de
mesure, aucune divergence sim↔jeu ni impact sur le jeu livré).
