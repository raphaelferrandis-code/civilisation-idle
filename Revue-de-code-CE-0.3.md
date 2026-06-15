# Revue de code — *Civilisation Effondrement* 0.3

> **Périmètre analysé** : `src/` (~28 400 lignes JS/JSX, ~7 500 CSS), exécution des tests (71 ✓), ESLint (0 erreur).
> **Stack constatée** : Vite + React 19 + `break_infinity.js` + Electron. Le moteur est désormais un store maison (`subscribe`/`notify` + `useSyncExternalStore`), plus le vanilla-JS d'origine.
> **Verdict global** : code **nettement au-dessus de la moyenne** pour un projet IA-assisté. Architecture claire, commentaires « pourquoi » remarquables, tests golden/hydration pertinents, frontière Decimal soignée, zéro faille évidente. Les axes d'amélioration tournent autour d'**un seul problème de fond** — la **double maintenance float/Decimal** — et de quelques scories de l'ancienne couche de rendu.

Légende des priorités : 🔴 **Bloquant** · 🟠 **Amélioration importante** · 🔵 **Détail**

---

## 1. JUSTESSE & SÉCURITÉ

### 1.1 🟠 Double maintenance float ↔ Decimal : divergence silencieuse possible
**Fichiers** : `src/game/core/mechanics.js` (omniprésent), `gather` dans `actions/building.js`, `ruinGain`.

Chaque formule du cœur économique existe **en double** : une version float et un miroir Decimal censé prendre le relais au-delà de ~1.8e308 (`ruinMultiplier`/`ruinMultiplierDec`, `institutionMultiplier`/`…Dec`, `globalMultiplier`/`…Dec`, `buildingOutputMultiplier`/`…Dec`, les deux branches de `rates()`, etc.). Les commentaires l'assument honnêtement (« doit évoluer en parallèle »), mais c'est exactement la classe de bug la plus dangereuse :

> Un rééquilibrage appliqué à la branche float **mais oublié dans la branche Decimal** ne casse rien pour 99,9 % des parties. Le bug ne se manifeste qu'au-delà du domaine float — une zone que presque aucun joueur/testeur n'atteint. Il **part en production sans être détecté**.

Le garde-fou existant (`decimal.parity.test.js`) est la bonne idée, mais il ne couvre qu'une poignée de fonctions, pas *toutes* les paires.

**Problème** : la sûreté repose sur la discipline humaine de modifier deux endroits à chaque tweak.

**Reco (court terme)** — étendre la parité à **toutes** les paires, par table :

```js
// AVANT — parité testée au cas par cas, paires manquantes
it("rates parity", () => { /* … */ });

// APRÈS — table exhaustive, échoue dès qu'une paire diverge sous 2^53
const PAIRS = [
  ["ruinMultiplier",            ruinMultiplier,            ruinMultiplierDec],
  ["institutionMultiplier",     institutionMultiplier,     institutionMultiplierDec],
  ["infraMultiplier",           infraMultiplier,           infraMultiplierDec],
  ["unspentRuinsPowerMult",     unspentRuinsPowerMultiplier, unspentRuinsPowerMultiplierDec],
  ["globalMultiplier",          globalMultiplier,          globalMultiplierDec],
  // …une ligne par paire, point.
];
for (const [name, f, fDec] of PAIRS) {
  it(`${name} : float == Decimal sous 2^53`, () => {
    setState(hydrateState(MID_GAME_FIXTURE)); invalidateRenderCache("all");
    expect(fDec().toNumber()).toBeCloseTo(f(), 6);
  });
}
```

**Reco (moyen terme)** : factoriser les multiplicateurs « petits et bornés » dans **un seul objet** calculé une fois (cf. §2.2), pour que la surface de divergence se réduise aux 3–4 fonctions réellement débordantes.

---

### 1.2 🟠 `performGrandReset` : liste manuelle de ~30 champs « à préserver » — bombe à retardement
**Fichier** : `src/game/core/actions/building.js`, lignes ~153–213.

Le Grand Reset reconstruit un `defaultState()` puis **recopie à la main** chaque champ d'héritage permanent (`savedXxx → fresh.Xxx`). Ajouter un futur déblocage permanent **sans penser à l'ajouter ici** ⇒ il est **silencieusement effacé** au prochain GR.

C'est la *même* classe de bug que le code documente et **teste** déjà pour `hydrateState` (cf. `state.hydration.test.js`, commentaire « champ écrit mais absent de l'hydratation »). Or `performGrandReset` utilise le pattern fragile **et n'a aucun test équivalent**.

```js
// AVANT — 30 lignes "saved… / fresh…" à maintenir, aucun filet
const savedCadmosHeritage = Boolean(state.cadmosHeritage);
const savedAnteeHeritage  = Boolean(state.anteeHeritage);
// … +25 autres, facile d'en oublier un
const fresh = defaultState();
fresh.cadmosHeritage = savedCadmosHeritage;
fresh.anteeHeritage  = savedAnteeHeritage;
// …

// APRÈS — source de vérité déclarative (comme DECIMAL_SAVE_FIELDS)
export const GR_PERSISTENT_FIELDS = [
  "grandResetCount", "mythsCompleted", "mythActsAnnounced",
  "chaosRuinsDouble", "chaosRuinsBonus", "legitimacy", "dynastyCount",
  "dynastyDoctrine", "ragnarokHeritage", "finalChronicleTitle",
  "atlasHeritage", "sisypheHeritage", "icareHeritage", "babelHeritage",
  "orHeritage", "phoenixHeritage", "atridesHeritage", "hephHeritage",
  "cadmosHeritage", "anteeHeritage", "eneeHeritage",
  "autoScriptRules", "automateRules", "cadmosPermanentEpitaphs",
  "surchauffeEndTime", "surchauffeCooldownEnd", /* … */
];

const fresh = defaultState();
for (const k of GR_PERSISTENT_FIELDS) {
  if (state[k] !== undefined) fresh[k] = structuredClone(state[k]); // ou copie ad hoc
}
fresh.grandResetCount = nextCount;
fresh.legitimacy = Math.max(0, (state.legitimacy || 0) - legitCost);
```

Et **un test** qui code l'invariant :

```js
it("Grand Reset préserve tous les héritages permanents", () => {
  const before = defaultState();
  GR_PERSISTENT_FIELDS.forEach(k => { before[k] = markValue(k); }); // valeurs sentinelles
  setState(before);
  performGrandResetSync(); // ou extraire la partie pure
  GR_PERSISTENT_FIELDS.forEach(k => expect(state[k]).toEqual(markValue(k)));
});
```

---

### 1.3 🔵 Flux d'effondrement piloté par des drapeaux non persistés
**Fichiers** : `events.js` (`runCollapseSequence`), `actions/crisis.js`, `state.js`.

`collapseInProgress` / `gamePaused` sont des **variables de module** (non sauvegardées), alors que `runCollapseSequence` et `openCrisisEvent` **`await` une saisie utilisateur** au milieu de la séquence. Si le joueur fait **F5 pendant le dialogue d'épitaphe**, le gain en cours est abandonné et la crise est re-proposée au rechargement.

**Aujourd'hui c'est sûr** (pas de corruption) car *toutes* les mutations d'état surviennent **après** les `await`, dans `completeCollapse`. Mais l'invariant est implicite : un futur ajout qui muterait l'état *avant* l'`await` corromprait la sauvegarde sur reload.

**Reco** : rendre l'invariant explicite (commentaire de tête sur `runCollapseSequence` : « aucune mutation persistée avant la résolution du dialogue ») et, idéalement, persister un drapeau `pendingCollapse` géré par hydrateState pour reprendre/annuler proprement.

---

### 1.4 🔵 Fragilité d'intégrité des données (accès direct par id)
**Fichiers** : `mechanics.js` (`marketMultiplier`, `rates`), `actions/crisis.js` (`pickCrisisEvent`).

Plusieurs chemins chauds supposent l'existence d'ids de données :

- `state.buildings.bureaucracy` / `.markets` / `.guilds` — **accès direct** : un renommage d'id ⇒ `undefined` ⇒ `NaN` qui se propage dans toute la production, sans erreur.
- `pickCrisisEvent` : `choices[state.cycles % choices.length]` ⇒ si `choices` est vide (un seuil de `CRISIS_EVENTS` sans entrée correspondante dans `CRISIS_POOL`), on obtient `choices[NaN]` → `undefined` → `openCrisisEvent(undefined)` plante.

*Vérifié : actuellement OK* (les 3 ids existent ; les seuils 0.25/0.5/0.75 ont chacun 6 entrées). Mais c'est une garantie **uniquement data**, qu'aucun test ne défend.

```js
// APRÈS — invariant de démarrage, dev-only, coût nul en prod
if (import.meta.env?.DEV) {
  for (const id of ["bureaucracy", "markets", "guilds"])
    console.assert(buildingById[id], `Bâtiment requis manquant: ${id}`);
  for (const ev of CRISIS_EVENTS)
    console.assert(CRISIS_POOL.some(p => p.threshold === ev.threshold),
      `Aucune crise pour le seuil ${ev.threshold}`);
}
```

> ✅ **Points sûrs confirmés** : aucun sink XSS (`innerHTML`/`eval`/`dangerouslySetInnerHTML` absents) ; le chemin d'import de sauvegarde **parse du JSON non fiable mais `hydrateState` le re-construit champ par champ avec bornage/whitelist** — excellent. Le piège `valueOf` en DEV + `toJSON` sur Decimal sécurisent la sérialisation. L'ancienne dette `escape/unescape` est **résolue** (`TextEncoder`/`btoa` avec chunking 8192 — pas de stack overflow sur gros saves).

---

## 2. LISIBILITÉ & MAINTENABILITÉ

### 2.1 🟠 `mechanics.js` (1 365 lignes) = fichier-dieu
Il mélange : multiplicateurs (ruines/institution/GR/infra), sommes de bâtiments, `pressureBreakdown`, `cityVitals`, `rates`, coûts unitaires/lots/`maxBuyAmount`, archéologie, disponibilité des upgrades, progression d'ère, `ruinGain`, seuils dynastie/GR, usure du temps, préparations terminales, coûts de crise, contexte de régulation, `mapStage`. Le **principe de responsabilité unique est violé au niveau du fichier**.

**Reco** : éclater derrière un baril (`mechanics.js` réexporte, zéro casse d'imports) :
- `production.js` → vitals, pressure, rates, multiplicateurs globaux
- `cost.js` → `buildingCostAt`, `buildingBatchCost`, `maxBuyAmount`, discount/scale
- `prestige.js` → `ruinGain`, seuils dynastie/GR, `legitimacyGain`
- `crisis-cost.js` → `crisisCosts`, `terminalCrisisCost`, contexte régulation

### 2.2 🟠 `rates()` : une fonction de ~150 lignes, expressions illisibles
Ligne ~729 : une **chaîne de multiplication de ~250 caractères** appliquant ~10 facteurs (épitaphe, vitals, crise, terminal, or, cadmos, marchés…), **dupliquée** dans la branche Decimal. Impossible d'auditer d'un coup d'œil « quel facteur s'applique à quelle ressource ».

```js
// AVANT (x4, une par ressource, x2 chemins float/Decimal = 8 copies à garder en phase)
let goldRate = gold * Math.sqrt(mult) * _epitaphEffect.globalMult * _epitaphEffect.goldMult
  * (1 + state.buildings.markets * 0.032 + state.buildings.guilds * 0.024) * vitals.goldMult
  * crisisProductionMultiplier("gold") * terminalPrepMultiplier("gold") * _orPenaltyMult
  * (hasActiveRuin(state, "age_or") ? ACTIVE_RUIN_GOLD_PROD_MULT : 1) * cadmosProductionMultiplier("gold");

// APRÈS — facteurs calculés UNE fois, appliqués uniformément aux deux chemins
function resourceFactors() {
  const e = epitaphLegacyEffect();
  return {
    gold: e.globalMult * e.goldMult * vitals.goldMult
        * (1 + state.buildings.markets*0.032 + state.buildings.guilds*0.024)
        * crisisProductionMultiplier("gold") * terminalPrepMultiplier("gold")
        * _orPenaltyMult * (hasActiveRuin(state,"age_or") ? ACTIVE_RUIN_GOLD_PROD_MULT : 1)
        * cadmosProductionMultiplier("gold"),
    /* food, knowledge, infra, population … */
  };
}
// puis, dans CHAQUE chemin : goldRate = goldBase * sqrtMult * f.gold;
```

Bénéfice double : lisibilité **et** réduction de la surface de divergence du §1.1 (les facteurs sont mutualisés, plus seulement la formule de base).

### 2.3 🟠 Couplage fort au singleton `state` + cache global mutable `renderCache`
Quasiment chaque module **importe le `state` vivant et le mute directement** ; `renderCache` est un global mutable dont les champs `_frameX` sont remis à `null` en début de tick. Conséquences :
- les fonctions de calcul ne sont **pas pures** (testables seulement via `setState` global) ;
- **l'invalidation de cache est un couplage implicite** : `tick.js` doit penser à nuller les bons `_frameX`, et toute action modifiant un input doit appeler `invalidateRenderCache(scope)` avec le **bon** scope, sinon affichage périmé.

**Reco** : centraliser l'invalidation pour qu'on **ne puisse pas l'oublier** — un compteur de version que les getters comparent :

```js
// APRÈS — le getter détecte lui-même la péremption, plus de nullage manuel dispersé
let frameVersion = 0;
export const bumpFrame = () => { frameVersion++; };       // appelé 1× en tête de tick
function cachedVitals() {
  if (renderCache._vitalsVer === frameVersion) return renderCache._vitals;
  renderCache._vitals = computeVitals();
  renderCache._vitalsVer = frameVersion;
  return renderCache._vitals;
}
```

Plusieurs fonctions acceptent déjà `state` en paramètre (`runMythTicks(state, dt)`) : généraliser ce style là où c'est peu coûteux.

### 2.4 🔵 Caches morts : `renderCache.batchCosts`, `.buildings`, `.upgrades`
Initialisés (`state.js:253`) et **invalidés** (`invalidateRenderCache`, ~810) mais **jamais lus ni écrits** ailleurs (vérifié par `grep`). Reliquat de l'ancien `render.js`. Ils **trompent** : un lecteur croit que les coûts de lot sont mémoïsés. À **supprimer** — ou à **brancher** (cf. §3.1, où `batchCosts` réglerait justement le hotspot perf).

### 2.5 🔵 Nommage : bon dans l'ensemble, quelques accrocs
Le mix FR (domaine) / EN (code) est **cohérent et lisible**. À resserrer :
- ids de crise `_25/_50/_75` (`world.js`) — opaques ; préférer `rupture_25` etc.
- `App.jsx` : `onClick={() => !crisisLocked || tab.id === 'prestige' ? openView(tab.id) : undefined}` — correct (précédence `||` > `?:`) mais ambigu **et redondant** avec `disabled={…}`. Simplifier en `onClick={() => openView(tab.id)}` puisque le bouton est déjà désactivé quand verrouillé.

---

## 3. PERFORMANCE & OPTIMISATION

### 3.1 🟠 `BuildingShop` recalcule les coûts ~3×/bâtiment **à chaque tick** (1 Hz)
**Fichier** : `src/components/ui/BuildingShop.jsx` (4 sites d'appel `buildingBatchCost`).

Le composant s'abonne aux ressources (`{f,g,k,…}`), or `state.food` devient une **nouvelle instance Decimal à chaque tick** ⇒ `shallowEqual` faux ⇒ **re-render garanti chaque seconde**. À chaque render :
1. `affordableCount(tab)` pour **les 3 onglets** → chacun fait `buildings.filter().sort()` + `buildingBatchCost` par bâtiment visible ;
2. `categoryData(activeTab)` **recalculé une 2ᵉ fois** ;
3. `firstAffordableId` → `buildingBatchCost` encore ;
4. le `.map()` → `buildingBatchCost` une **3ᵉ fois** par bâtiment.

⇒ ~100+ calculs de coût Decimal/seconde, **même sur Android**, alors que les coûts ne changent **que** lors d'un achat (ou d'un changement de `buyAmount`).

```jsx
// AVANT — coûts recalculés à chaque tick, x3 par bâtiment, x3 onglets
const affordableCount = (catId) =>
  categoryData(catId).visible.filter(b => canPayCost(buildingBatchCost(b))).length;
// … plus firstAffordableId et le .map qui rappellent buildingBatchCost

// APRÈS — coûts mémoïsés sur (bâtiments + buyAmount) ; l'abordabilité reste, elle, par tick mais devient un simple compare
const buildingsSig = useGameState(s => renderCache._buildingsVersion);
const buyAmount    = useGameState(s => s.buyAmount);
const costByTab = useMemo(() => {
  const m = {};
  for (const b of buildings) m[b.id] = buildingBatchCost(b); // 1× par bâtiment
  return m;
}, [buildingsSig, buyAmount]);            // ← recalcul SEULEMENT si bâtiments/quantité changent
// abordabilité (par tick) = compare bon marché contre coûts déjà calculés
const isAffordable = (b) => canPayCost(costByTab[b.id]);
```

Compléter par **`React.memo`** sur la rangée (aujourd'hui aucun `memo()` dans tout `components/`) :

```jsx
// APRÈS — PurchaseRow.jsx
export default React.memo(PurchaseRow, (a, b) =>
  a.count === b.count && a.affordable === b.affordable &&
  a.buyAmount === b.buyAmount && a.pulse === b.pulse && a.tier === b.tier
  // prices/production : ne comparer que si l'abordabilité ou le count a bougé
);
```

> C'est **le** gain perf principal et le plus actionnable. Bonus : il transforme enfin `renderCache.batchCosts` (cache mort du §2.4) en cache utile.

### 3.2 🟠 Re-render de toute l'UI abonnée à 1 Hz — quantifier avant de s'abonner
Le pattern `--crisis-level` dans `App.jsx` (arrondi à 5 % pour limiter les re-renders) est **exactement la bonne idée**. À généraliser aux **affichages de ressources** : s'abonner à la **chaîne formatée**, pas au Decimal, pour ne re-render que quand le texte visible change réellement.

```js
// AVANT — re-render à CHAQUE tick (nouvelle instance Decimal)
const food = useGameState(s => s.food);          // … <span>{fmt(food)}</span>

// APRÈS — re-render seulement quand l'AFFICHAGE change (souvent ~1 fois/seconde, mais 0 si stable)
const foodLabel = useGameState(s => fmt(s.food)); // string : Object.is court-circuite l'identique
```

### 3.3 🔵 `useCityViewState` : abonnement « large » de 50 champs
`shallowEqual` compare 50 clés chaque tick et n'importe lequel re-render toute la `CityView`. Acceptable (la vue les affiche tous) mais fragile ; à surveiller si la vue grossit. Un découpage en sous-composants abonnés finement réduirait la surface.

### 3.4 ✅ Couche canvas : déjà bien optimisée (mention positive)
`cityMapRuntime.js` : cap **30 fps**, layout mis en cache sur `_buildingsVersion` + population *binnée*, **pause derrière les modales** (`isActive()`), `OffscreenCanvas`, et **teardown propre** (AbortController + `resizeObserver.disconnect()` + `cancelAnimationFrame`). La dette « rebuild DOM à chaque tick » de la mémoire est **résorbée**. Nit mineur : la rAF se reprogramme même inactive — on pourrait économiser ~quelques % CPU en ne re-armant qu'à la fermeture du dialogue.

---

## 4. DOCUMENTATION

### 4.1 ✅ Force du projet : les commentaires « pourquoi »
Rare et précieux : les commentaires expliquent les **invariants de game design** (anti-immortalité, plafonds doux Michaelis-Menten), la **frontière Decimal** (`num.js`), la **stratégie de versionnage de save** (`CURRENT_SAVE_VERSION` vs `SAVE_KEY`, migrations séquentielles), le piège `valueOf`. C'est exactement le « pourquoi et non le comment » demandé. **À conserver comme standard.**

### 4.2 🔵 Manque : un `ARCHITECTURE.md` (contrat implicite à expliciter)
Un nouvel arrivant (ou toi dans 6 mois) doit **rétro-ingénierer** trois disciplines non écrites :
1. **Store** : `state` singleton + `subscribe`/`notify` + `useGameState(selector)` + `shallowEqual`.
2. **Contrat de frame-cache** : qui nulle `_frameX`, qui appelle `invalidateRenderCache(scope)` et avec quel scope.
3. **Règle float/Decimal** : « float bit-à-bit sous 1.8e308, miroir Decimal au-delà ».

Un document d'une page épargnerait des bugs de cache périmé et de divergence.

### 4.3 🔵 Manques ponctuels
- `performGrandReset` : aucun commentaire « **AJOUTER ICI tout nouveau champ permanent** » — pile à l'endroit où il le faut (§1.2).
- `renderCache` : la définition mériterait un paragraphe décrivant chaque `_frameX` et les **scopes** d'invalidation.
- `rates()` : ajouter le **tableau « ressource → multiplicateurs appliqués »** (réglerait §2.2 *et* la lisibilité).

### 4.4 🔵 Tests & outillage
- **Bonne couverture** : economy golden, hydration round-trip, chronicle, decimal parity, procédural (road/water/building). 71 ✓.
- **Manques** : pas de test de préservation des champs au Grand Reset (§1.2) ; bruit `Sauvegarde impossible: localStorage is not defined` dans les tests → **mocker `localStorage`** dans le setup pour un output propre.
- **`node_modules/` est dans le zip** (555 Mo) et contient des binaires natifs **Windows** (`@rolldown/binding`), d'où l'échec de `vitest` hors Windows tant qu'on ne réinstalle pas. À **`.gitignore`r** — réinstallation par plateforme.

---

## Plan d'action — checklist par priorité

### 🔴 Bloquant
*(Aucun. Pas de bug bloquant ni de faille de sécurité détectée.)*

### 🟠 Amélioration importante
- [ ] **Perf #1** — `BuildingShop` : mémoïser `buildingBatchCost` sur `(buildingsVersion, buyAmount)` (1×/bâtiment), réduire l'abordabilité à un `canPayCost(coûtMémoïsé)`, et `React.memo` sur `PurchaseRow`. *(§3.1)*
- [ ] **Justesse #1** — Étendre `decimal.parity.test.js` à **toutes** les paires float/Decimal via une table. *(§1.1)*
- [ ] **Justesse #2** — Remplacer la liste manuelle de `performGrandReset` par `GR_PERSISTENT_FIELDS` + ajouter le test d'invariant de préservation. *(§1.2)*
- [ ] **Maintenabilité** — Extraire un `resourceFactors()` mutualisé pour `rates()` (lisibilité + moindre divergence). *(§2.2)*
- [ ] **Maintenabilité** — Éclater `mechanics.js` derrière un baril (`production`/`cost`/`prestige`/`crisis-cost`). *(§2.1)*
- [ ] **Perf #2** — S'abonner aux **chaînes formatées** des ressources plutôt qu'aux Decimal. *(§3.2)*
- [ ] **Couplage** — Centraliser l'invalidation de cache via un compteur de version (les getters comparent). *(§2.3)*

### 🔵 Détail
- [ ] Supprimer (ou brancher) les caches morts `renderCache.batchCosts/.buildings/.upgrades`. *(§2.4)*
- [ ] Ajouter un invariant de démarrage dev-only (ids de bâtiments + appariement seuils crise). *(§1.4)*
- [ ] Rédiger `ARCHITECTURE.md` (store + frame-cache + règle float/Decimal). *(§4.2)*
- [ ] Mocker `localStorage` dans le setup de tests ; `.gitignore` sur `node_modules/`. *(§4.4)*
- [ ] Expliciter l'invariant « aucune mutation persistée avant la résolution du dialogue » dans `runCollapseSequence`. *(§1.3)*
- [ ] Simplifier le ternaire `onClick` des onglets dans `App.jsx` ; renommer les ids `_25/_50/_75`. *(§2.5)*
- [ ] Commentaire « ajouter ici les nouveaux champs permanents » sur `performGrandReset` ; doc des `_frameX` ; tableau de multiplicateurs sur `rates()`. *(§4.3)*

---

### En une phrase
> Le code est **solide et bien pensé** ; sa seule vraie dette structurelle est la **duplication float/Decimal**, à neutraliser par des tests de parité exhaustifs et une mutualisation des multiplicateurs — le reste relève du polissage (perf du shop, fichier-dieu, caches morts).
