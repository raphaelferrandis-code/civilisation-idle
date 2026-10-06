# Revue de code — *Civilisation Effondrement* 0.4

> **Périmètre** : dépôt complet `raphaelferrandis-code/civilisation-idle` (~39 100 lignes JS/JSX/CSS hors lockfile), cloné et exécuté. Cœur lu en intégralité (`state`, `num`, `mechanics`, `balance`, `tick`, `main`, `utils`, `events`, `actions`, `crisis`), hooks, shell React, composants chauds, et audit du cycle de vie de la couche carte.
> **Outillage vérifié sur cette machine** : `npx vitest run` → **82 ✓ / 82** (10 fichiers). `npx eslint .` → **0 erreur**.
> **Stack** : Vite 8 + React 19 + `break_infinity.js` + Electron 42. Store maison (`subscribe`/`notify` + `useSyncExternalStore` + `shallowEqual`).
> **Verdict global** : le code reste **nettement au-dessus de la moyenne** pour un projet IA-assisté, et il a **progressé** depuis la 0.3 : les deux findings phares (parité Decimal incomplète, liste manuelle du Grand Reset) sont **corrigés**, la perf #1 du shop aussi, et la dette d'inline-styles de `CityView` est résorbée. Il reste **zéro bug bloquant et zéro faille de sécurité**. Les axes ouverts sont du polissage : le fichier-dieu `mechanics.js`, le couplage au singleton `state`, quelques re-renders évitables, et de l'hygiène de dépôt (historique mono-commit, CRLF/LF).

Légende des priorités : 🔴 **Bloquant** · 🟠 **Amélioration importante** · 🔵 **Détail**

---

## 0. CE QUI A ÉTÉ CORRIGÉ DEPUIS LA 0.3

Quatre des points majeurs de la revue précédente sont **résolus** — c'est notable et ça vaut d'être acté :

| Finding 0.3 | État 0.4 | Preuve |
|---|---|---|
| §1.1 Parité float↔Decimal partielle | ✅ **Corrigé** | `decimal.parity.test.js` couvre désormais **les 7 paires miroir + `rates()`** via une table de scénarios, tolérance relative 1e-9 (15 tests). |
| §1.2 Liste manuelle de ~30 champs dans `performGrandReset` | ✅ **Corrigé** | `GR_PERSISTENT_FIELDS` déclaratif + `buildGrandResetState()` **pur et testable** + `grandReset.test.js` (5 tests). |
| §3.1 `BuildingShop` recalcule les coûts ×3/bâtiment/tick | ✅ **Corrigé** | `costById` mémoïsé sur `[buildingsVersion, upgradesVersion, buyAmount]` ; l'« achetable » est réduit à un `canPayCost()` bon marché. |
| Effet de bord caché de `currentEraIndex()` (mute `bestEraIndex`) | ✅ **Corrigé** | `currentEraIndex()` est désormais **pur** (+ early-exit). La mutation de `bestEraIndex` a migré, explicite, dans `tick.js`. |
| Inline-styles massifs dans `CityView.jsx` (53+) | ✅ **Résorbé** | Plus que **4** `style={{` (valeurs dynamiques légitimes : largeurs, `--vars`). |
| Dette `escape/unescape` à l'export de save | ✅ **Confirmé résolu** | `TextEncoder` + `btoa` avec chunking 8192 (`utils.js`). |

Reste **non traité** depuis la 0.3 : découpage de `mechanics.js`, abonnement aux chaînes formatées plutôt qu'aux Decimal, invariant dev-only sur les ids data, `node_modules`/`localStorage` dans les tests (→ §4), renommage des ids `_25/_50/_75`.

---

## 1. JUSTESSE & SÉCURITÉ

> ✅ **Socle confirmé sain** : **aucun sink XSS** (`innerHTML`/`eval`/`dangerouslySetInnerHTML`/`new Function` absents de tout `src/`), **aucun `TODO/FIXME/HACK`**, **un seul `console.*`** dans tout le code applicatif. L'import de save **parse du JSON non fiable mais le re-construit champ par champ** via `hydrateState` (bornage + whitelist systématiques) — voir ci-dessous. Le piège `valueOf` en DEV (`num.js`) reste un excellent filet anti-coercition.

### 1.1 🟠 Double maintenance float ↔ Decimal : surface réduite, mais toujours là
**Fichiers** : `mechanics.js` (7 paires `xxx` / `xxxDec`).

Le contrat de `num.js` est sain et bien documenté : float bit-à-bit sous ~1.8e308, miroir Decimal au-delà. La grande amélioration depuis la 0.3 : **`rates()` ne duplique plus** ses formules — elle prend un paramètre `forceDecimalPath` et partage le corps. Et **la parité est maintenant testée pour les 7 paires**, ce qui attrape toute divergence macroscopique (>1e-3) introduite d'un seul côté.

Il reste néanmoins **7 paires de fonctions à maintenir en lockstep** (`ruinMultiplier(Dec)`, `unspentRuinsPowerMultiplier(Dec)`, `institutionMultiplier(Dec)`, `infraMultiplier(Dec)`, `globalMultiplier(Dec)`, `babelExponentialMult(Dec)`, `buildingOutputMultiplier(Dec)`). Le risque résiduel n'est plus « divergence non détectée » (le test la voit), mais **charge cognitive** : chaque rééquilibrage d'un multiplicateur impose de toucher deux corps.

**Reco (moyen terme, inchangée)** : pour les multiplicateurs **petits et bornés** (institution, infra, unspent), envisager un calcul unique en number puis enveloppé en Decimal au point d'usage — la branche Decimal n'est nécessaire que là où le float **déborde réellement** (`ruinMultiplier`, `globalMultiplier`, `babelExponential`). On passerait de 7 paires à ~3.

### 1.2 🟠 `pickCrisisEvent` : `choices[NaN]` possible si une donnée manque
**Fichier** : `actions/crisis.js`, `pickCrisisEvent` (l. 59-67) et `checkCrisisThresholds` (l. 80).

La cascade de repli est bonne (`eligible → pool`, puis `fresh → candidates`). Mais le dernier maillon :

```js
const choices = fresh.length ? fresh : candidates;
return choices[state.cycles % choices.length];   // choices.length === 0 → choices[NaN] → undefined
```

`candidates` (donc `choices`) est **vide si et seulement si** `CRISIS_POOL` ne contient aucune entrée pour le `threshold` demandé. `checkCrisisThresholds` fait alors `event.id` sur `undefined` → crash. *Vérifié : actuellement OK* (0.25 / 0.5 / 0.75 ont chacun plusieurs entrées). Mais c'est une garantie **uniquement data**, qu'aucun test ne défend — pile la classe de bug que le projet sait pourtant verrouiller ailleurs.

**Reco** : invariant de démarrage dev-only, coût nul en prod.

```js
// num.js l'utilise déjà : import.meta.env?.DEV
if (import.meta.env?.DEV) {
  for (const ev of CRISIS_EVENTS) {
    console.assert(
      CRISIS_POOL.some((p) => p.threshold === ev.threshold),
      `Aucune crise dans CRISIS_POOL pour le seuil ${ev.threshold}`
    );
  }
}
```
Idem pour les ids de bâtiments lus en accès direct (`bureaucracy`, `markets`, `guilds`) dans `marketMultiplier`/`rates` : un renommage d'id → `undefined` → `NaN` propagé silencieusement dans toute la prod.

### 1.3 🔵 Effondrement : F5 pendant le dialogue d'épitaphe annule le gain (par construction)
**Fichier** : `events.js`, `runCollapseSequence`.

`collapseInProgress` / `gamePaused` / `mourning` sont des **drapeaux non persistés**, et `runCollapseSequence` `await` une saisie utilisateur (choix d'épitaphe) **au milieu** de la séquence. L'invariant qui sauve aujourd'hui est respecté : **toutes les mutations persistées (`nextEpitaphLegacy`, `completeCollapse`) surviennent APRÈS les `await`** — donc un rechargement pendant le dialogue ne corrompt rien, il **re-propose** simplement la crise et **recalcule** le gain. `hydrateState` force d'ailleurs `mourning: false` (commentaire à l'appui).

C'est donc *sûr mais implicite*. Un futur ajout qui muterait l'état **avant** l'`await` casserait la sauvegarde sur reload.

**Reco** : commentaire de tête sur `runCollapseSequence` (« aucune mutation persistée avant résolution du dialogue ») et, idéalement, un drapeau `pendingCollapse` persisté + repris par `hydrateState` pour reprendre/annuler proprement.

### 1.4 🔵 Progression hors-ligne = **usure seule** (choix de design à documenter)
**Fichier** : `main.js`, `applyElapsedWear` / `applyOfflineProgress`.

L'absence du joueur n'applique **aucune production hors-ligne**, seulement de l'**usure** (`timeWear`), plafonnée à 6 h et pondérée ×0.35. C'est cohérent avec le thème (le temps érode), mais c'est contre-intuitif pour le genre idle (où l'absence rapporte). Ce n'est pas un bug — juste un parti pris fort à **expliciter** dans la doc joueur, sous peine d'incompréhension (« j'ai laissé tourner la nuit et j'ai *régressé* »).

---

## 2. ARCHITECTURE & MAINTENABILITÉ

### 2.1 🟠 `mechanics.js` (1 413 lignes, ~67 exports) : toujours un fichier-dieu
La reco 0.3 de l'éclater n'a pas été suivie. Il mélange : multiplicateurs (ruines/institution/infra/global/babel), sommes de bâtiments, `pressureBreakdown`, `cityVitals`, `rates`, coûts unitaires/lots/`maxBuyAmount`, archéologie, disponibilité des upgrades, progression d'ère, `ruinGain`, seuils dynastie/GR, usure du temps, préparations terminales, coûts de crise, contexte de régulation, `mapStage`. Le principe de responsabilité unique est violé **au niveau du fichier**.

**Reco (sans casser aucun import)** — éclater derrière un baril qui réexporte :
- `production.js` → `cityVitals`, `pressureBreakdown`, `rates`, multiplicateurs globaux
- `cost.js` → `buildingCostAt`, `buildingBatchCost`, `maxBuyAmount`, discount/scale
- `prestige.js` → `ruinGain`, seuils dynastie/GR, `legitimacyGain`, `timeWearRate`
- `crisis-cost.js` → `crisisCosts`, `terminalCrisisCost`, `regulationContext`

```js
// mechanics.js devient :
export * from "./mechanics/production.js";
export * from "./mechanics/cost.js";
export * from "./mechanics/prestige.js";
export * from "./mechanics/crisis-cost.js";
// → zéro changement chez les ~10 fichiers qui importent depuis "./mechanics.js"
```

### 2.2 🟠 Couplage fort au singleton `state` + invalidation manuelle des frame-caches
Quasiment chaque module **importe le `state` vivant et le mute directement** ; les calculs ne sont donc pas purs (testables seulement via `setState` global). Surtout, le **cache de frame** (`_frameVitals`, `_framePressure`, `_frameRates`, `_frameGlobalMult(Dec)`) est nullé **à la main au début de `tick()`** *et* dans `invalidateRenderCache("all")`. C'est un **couplage implicite** : toute action modifiant un input doit penser à appeler `invalidateRenderCache(scope)` avec le **bon scope**, et `tick.js` doit nuller les bons `_frameX` — un oubli = affichage périmé silencieux.

**Reco** : centraliser l'invalidation pour qu'on **ne puisse pas l'oublier** — un compteur de version que les getters comparent eux-mêmes (le tick ne fait plus qu'incrémenter) :

```js
let frameVersion = 0;
export const bumpFrame = () => { frameVersion++; };   // 1× en tête de tick, à la place des 5 nullages
function cachedVitals() {
  if (renderCache._vitalsVer === frameVersion) return renderCache._vitals;
  renderCache._vitals = computeVitals();
  renderCache._vitalsVer = frameVersion;
  return renderCache._vitals;
}
```
Plusieurs fonctions acceptent déjà `state` en paramètre (`runMythTicks(state, dt)`, `rates(vitals, pressure)`) : généraliser ce style là où c'est peu coûteux rendrait le cœur progressivement testable en isolation.

### 2.3 🔵 `CityView.jsx` (597 l.) : vue « grasse » qui calcule beaucoup au rendu
La vue lit `cityVitals()`, `pressureBreakdown()`, `rates()` **et** `computeCityPersonality()` à **chaque rendu** (donc ~1×/s). Les trois premières sont amorties par le frame-cache ; `computeCityPersonality`, lui, **n'est pas mémoïsé** alors qu'il ne dépend que du `mapSeed` (stable sur le cycle).

```jsx
// AVANT — recalcul chaque tick
const cityPersonalityLabel = (() => { try { return computeCityPersonality(ensureMapSeed(state), state).label; } catch { return ""; } })();
// APRÈS — recalcul seulement si la seed change
const seed = useGameState(s => s.mapSeed);
const cityPersonalityLabel = useMemo(() => { try { return computeCityPersonality(seed ?? 0, state).label; } catch { return ""; } }, [seed]);
```
Sur le fond, la vue gagnerait à être éclatée en sous-composants par mythe (un `<MythStatusCard>` par cas) — purement lisibilité, pas un bug.

### 2.4 🔵 Hygiène de dépôt : historique mono-commit + CRLF/LF mélangés
- **Un seul commit** dans tout le dépôt (`feat(eres): cité cosmique complète…`). Impossible de bissecter une régression, pas de granularité, pas de message expliquant l'évolution. Pour un projet de cette taille, **commits atomiques** (une intention par commit) = filet anti-régression + journal de bord.
- **CRLF résiduels** : la couche `src/game/map/` est en **CRLF** alors que `.gitattributes` impose `* text=auto eol=lf`. L'attribut a été ajouté **sans renormaliser** l'existant.
  ```bash
  git add --renormalize . && git commit -m "chore: normalise les fins de ligne en LF"
  ```

### 2.5 🔵 Nommage : bon, deux accrocs connus
Le mix FR (domaine) / EN (code) reste cohérent et lisible. À resserrer :
- ids de crise `_25 / _50 / _75` (`world.js` l. 508-510) — opaques ; `rupture_25` etc. seraient auto-documentés.
- `App.jsx` l. 165 : `onClick={() => !crisisLocked || tab.id === 'prestige' ? openView(tab.id) : undefined}` — correct (précédence `||` > `?:`) mais **redondant** avec le `disabled={…}` juste au-dessus. Le bouton désactivé n'émet pas de clic → `onClick={() => openView(tab.id)}` suffit.

---

## 3. PERFORMANCE

> Rappel : `useGameState` est bien implémenté (snapshot stable via `useRef` + `shallowEqual`, `useSyncExternalStore`). Le pattern `--crisis-level` arrondi à 5 % dans `App.jsx` reste exemplaire. La perf #1 de la 0.3 (coûts du shop) est **corrigée**. Restent des re-renders évitables à 1 Hz.

### 3.1 🟠 `PurchaseRow` n'est pas mémoïsé → toute la liste se re-rend chaque tick
**Fichiers** : `BuildingShop.jsx`, `PurchaseRow.jsx`.

`BuildingShop` s'abonne aux ressources (`{ f, g, k, i, p }`), or **chaque ressource est une nouvelle instance Decimal à chaque tick** → `shallowEqual` faux → `BuildingShop` se re-rend chaque seconde → **toutes** les `PurchaseRow` se re-rendent, alors que la quasi-totalité n'a rien qui change visuellement (le coût est figé entre deux achats, l'« achetable » ne bascule qu'au franchissement d'un seuil).

Les coûts étant déjà mémoïsés (`costById`, ref stable), il manque le `React.memo` sur la rangée — **aucun `memo()` dans tout `components/`** aujourd'hui. Attention : `production` et `milestoneInfo` sont **recréés à chaque rendu** dans le `.map()` → un `React.memo` naïf ne servirait à rien. Deux options :

```jsx
// Option A — comparateur ciblé sur ce qui change vraiment l'affichage
export default React.memo(PurchaseRow, (a, b) =>
  a.count === b.count && a.affordable === b.affordable &&
  a.buyAmount === b.buyAmount && a.pulse === b.pulse &&
  a.tier === b.tier && a.babelBlocked === b.babelBlocked &&
  a.prices === b.prices            // ref stable depuis costById
  // production/milestoneInfo ignorés : dérivés de count, déjà couverts
);
```
…ou **Option B** (plus propre) : stabiliser `production`/`milestoneInfo` côté parent (les mémoïser sur `[count, globalMult]`) puis `React.memo` par défaut.

### 3.2 🟠 S'abonner aux **chaînes formatées**, pas aux Decimal bruts
**Fichiers** : `BuildingShop.jsx`, `useCityViewState.js`, tout composant lisant une ressource.

`useCityViewState` compare ~45 clés chaque tick, dont 6 Decimal qui **changent d'instance à chaque tick** → re-render garanti de toute la `CityView` même quand l'affichage est stable. Là où seul le **texte** compte, s'abonner à `fmt(s.food)` (une string) court-circuite via `Object.is` quand l'affichage ne bouge pas :

```js
// AVANT — nouvelle instance Decimal chaque tick → re-render systématique
const food = useGameState(s => s.food);            // <span>{fmt(food)}</span>
// APRÈS — string : re-render seulement quand l'AFFICHAGE change
const foodLabel = useGameState(s => fmt(s.food));
```
Pour le shop, l'abonnement aux ressources ne sert qu'à rafraîchir l'« achetable » : on pourrait s'abonner à une **signature d'abordabilité** (un booléen par bâtiment visible, ou un hash) plutôt qu'aux Decimal.

### 3.3 🔵 Carte : la rAF se ré-arme même inactive
**Fichier** : `cityMapRuntime.js`, `frame()` (l. 671-673).

`requestAnimationFrame(frame)` est rappelé **en tête** de `frame`, donc la boucle tourne à la cadence rAF même quand `isActive()` est faux (modale ouverte, ou onglet visible mais vue ≠ Cité) — chaque frame ne fait qu'un test `now - last < FRAME_MS` puis `return`. Coût quasi nul, mais non nul. On pourrait ne ré-armer qu'à la réactivation (et stopper sinon).

> ✅ **Reste bien optimisé** (confirmé) : cap 30 fps, layout caché sur `_buildingsVersion`, **pause derrière les modales** (`isActive`), `OffscreenCanvas`, et **teardown complet** — `resetCityMapRuntime()` (appelé au démontage de `CityMapCanvas`) annule la rAF (`cancelAnimationFrame`), et `CM.cleanup` couvre **tous** les listeners (AbortController + `{ signal }` partout, y compris les `window` mousemove/mouseup) + `ResizeObserver.disconnect()` + `window resize`. Pas de fuite.

### 3.4 🔵 Petits setTimeout non nettoyés au démontage
`PurchaseRow` (floats/shake) et `CityView` (bulle citoyen) posent des `setTimeout` non annulés au démontage. En React 19 ce n'est plus un warning ni une vraie fuite (l'updater est no-op sur composant démonté), mais c'est à savoir si tu actives le mode strict / des tests de montage-démontage rapides.

---

## 4. TESTS & OUTILLAGE

### 4.1 ✅ Force : la simulation tape la **vraie** économie
**Point clé pour ton balancing** : `simulate-ce.js` **importe les fonctions réelles** du jeu (`ruinGain`, `globalMultiplier`, `rates`, `buildingBatchCost`, `legitimacyGain`, `timeWearRate`, `isUnlocked`, `canBuyUpgrade`…), il ne **réimplémente pas** les formules. Tes décisions d'équilibrage sont donc prises contre le moteur exact — pas contre un modèle qui dériverait. C'est l'archi correcte, et un vrai atout.
> **À vérifier** : `bench-myths.js` / `bench-rupture.js` font de même (ils doivent importer depuis `src/`, pas dupliquer). S'ils dupliquent, c'est la même dette de divergence que §1.1, mais pour le balancing.

### 4.2 ✅ Couverture pertinente
82 ✓ : economy **golden**, **hydration round-trip**, **grand reset** (nouveau), **chronicle**, **decimal parity** (étendu), **procédural** (road/water/building), **sprites**. Les tests golden + parité sont exactement les bons garde-fous pour un jeu à formules.

### 4.3 🔵 Bruit `localStorage is not defined` dans les tests (toujours là)
4 tests log `Sauvegarde impossible: localStorage is not defined` (déjà signalé en 0.3). Ça salit la sortie et masquerait un vrai warning. **Mocker `localStorage`** dans un setup vitest :
```js
// vitest.setup.js  (+ test.setupFiles dans la config)
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
```

### 4.4 🔵 Pas d'intégration continue
Aucun workflow CI (`.github/workflows/`). Un simple job `npm ci && npm run lint && npm test` à chaque push transformerait tes 82 tests en filet **automatique** (utile justement parce que l'historique est mono-commit : tu sauras *quand* un push casse la parité ou un golden). `node_modules` est correctement ignoré (`.gitignore`) — le souci « 555 Mo dans le zip » de la 0.3 était un artefact d'archive, pas un problème de dépôt.

---

## 5. BUILD & CONFIG

### 5.1 ✅ Sécurité Electron : bons défauts
`main.cjs` : `contextIsolation: true`, `nodeIntegration: false`, `autoHideMenuBar`. Chargement par `loadFile(dist/index.html)` et `base: './'` dans `vite.config.js` (chemins relatifs indispensables au `file://` d'Electron). Rien à redire.
> 🔵 Détail défensif : pas de Content-Security-Policy. Sur une app Electron 100 % locale chargeant ses propres fichiers, le risque est faible, mais une `<meta http-equiv="Content-Security-Policy">` stricte (pas de `unsafe-inline` côté script) serait une ceinture de plus si un jour tu charges du contenu distant.

### 5.2 🔵 `electron-builder` : chemin de sortie en dur
`package.json` → `build.directories.output: "C:/Users/Hardware31/ce-release"` : chemin absolu **spécifique à ta machine**. Préfère un chemin relatif (`"release"` ou `"dist-electron"`), déjà couvert par `.gitignore` (`release`), pour que le build soit reproductible ailleurs.

---

## 6. SYNTHÈSE PAR COUCHE

| Couche | Volume | Appréciation |
|---|---|---|
| `core` (state/num/balance/mechanics/tick/actions) | ~6 000 l. | **A** — sérialisation et frontière Decimal de niveau pro ; seul `mechanics.js` pèse. |
| Composants React + hooks | ~3 000 l. | **A−** — store propre, lazy-loading ; re-renders 1 Hz à raffiner, 0 `memo`. |
| `data` (buildings/upgrades/myths/world/chronicle) | ~5 700 l. | **A** — déclaratif, lisible, `chronicleArticles` bien isolé. |
| `map` (runtime/render/layout/agents/procédural) | ~11 400 l. | **B+** — runtime au cycle de vie irréprochable ; `renderWorld`/`cityEngineSprites` énormes (2 400 / 3 000 l.) et CRLF. |
| Tooling (simulate/bench) | ~1 800 l. | **A−** — simule la vraie économie (atout) ; à mettre sous CI. |
| Styles CSS | ~7 500 l. | non audité en détail (hors périmètre) ; `views.css` = 3 600 l. à surveiller. |

---

## Plan d'action — checklist par priorité

### 🔴 Bloquant
*(Aucun. Pas de bug bloquant ni de faille de sécurité.)*

### 🟠 Amélioration importante
- [ ] **Perf** — `React.memo` (comparateur ciblé) sur `PurchaseRow`, ou stabiliser `production`/`milestoneInfo` côté parent. *(§3.1)*
- [ ] **Perf** — S'abonner aux **chaînes formatées** des ressources (ou à une signature d'abordabilité) plutôt qu'aux Decimal bruts. *(§3.2)*
- [ ] **Maintenabilité** — Éclater `mechanics.js` derrière un baril (`production`/`cost`/`prestige`/`crisis-cost`). *(§2.1)*
- [ ] **Couplage** — Centraliser l'invalidation de frame-cache via un compteur de version (les getters comparent). *(§2.2)*
- [ ] **Justesse** — Réduire les paires float/Decimal bornées à un calcul unique (de 7 → ~3). *(§1.1)*
- [ ] **Justesse** — Invariant dev-only : appariement `CRISIS_EVENTS`↔`CRISIS_POOL` + existence des ids de bâtiments lus en direct. *(§1.2)*

### 🔵 Détail
- [ ] Mémoïser `computeCityPersonality` sur `mapSeed` ; envisager d'éclater `CityView` par mythe. *(§2.3)*
- [ ] `git add --renormalize` (CRLF → LF) ; adopter des **commits atomiques**. *(§2.4)*
- [ ] Ne ré-armer la rAF de la carte qu'à la réactivation. *(§3.3)*
- [ ] Mocker `localStorage` dans le setup de tests ; ajouter un workflow **CI** (lint + test). *(§4.3, §4.4)*
- [ ] Vérifier que `bench-myths.js`/`bench-rupture.js` importent les vraies formules. *(§4.1)*
- [ ] Expliciter l'invariant « aucune mutation persistée avant résolution du dialogue » dans `runCollapseSequence` ; documenter le **hors-ligne = usure seule** côté joueur. *(§1.3, §1.4)*
- [ ] Chemin de sortie `electron-builder` relatif ; CSP Electron. *(§5.1, §5.2)*
- [ ] Renommer les ids de crise `_25/_50/_75` ; simplifier le ternaire `onClick` des onglets. *(§2.5)*

---

### En une phrase
> Depuis la 0.3, le projet a **corrigé ses deux dettes structurelles majeures** (parité Decimal exhaustive, Grand Reset déclaratif) et son hotspot de perf : il ne reste **aucun bloquant**, juste du polissage de re-renders 1 Hz, le découpage du fichier-dieu `mechanics.js`, et de l'hygiène de dépôt — un code **solide, testé et désormais nettement assaini**.
