# Architecture — *Civilisation Effondrement*

Document d'orientation : les **contrats implicites** du moteur, à connaître avant
de toucher au cœur. Pour le *quoi* (mécaniques de jeu), lire les commentaires du
code ; ce fichier décrit le *comment* structurel.

Stack : **Vite + React 19 + break_infinity.js** (+ Electron pour le build desktop).
Le moteur de jeu est en JS vanilla (un `state` singleton) ; React n'est qu'une
couche de rendu branchée dessus via un store maison.

---

## 1. Store : un singleton `state` + abonnement manuel

Toute la partie vit dans **un seul objet mutable** `state` ([state.js](src/game/core/state.js)),
muté en place par la logique de jeu. React s'y abonne via `useSyncExternalStore` :

- [state.js](src/game/core/state.js) expose `subscribe(listener)` / `notify()`.
  La boucle de jeu appelle `notify()` à **chaque tick** (1 Hz, [main.js](src/game/core/main.js)).
- [useGameState.js](src/hooks/useGameState.js) : `useGameState(selector)` lit une
  tranche de `state`. Un `shallowEqual` mémoïse la valeur → pas de re-render si la
  tranche sélectionnée est inchangée (`Object.is` pour les primitives, comparaison
  de surface pour les objets).

**Conséquences à garder en tête :**
- Les fonctions de calcul **lisent le `state` global** et ne sont donc pas pures —
  on les teste via `setState(hydrateState(fixture))` (cf. les tests `__tests__`).
- **Un Decimal réassigné à chaque tick casse `shallowEqual`** : un composant abonné
  à `s.food` (ressource principale) re-render chaque seconde. C'est **voulu** pour
  les affichages vivants (taux « +X/s », état « achetable »). Pour une jauge qui ne
  doit pas spammer les re-renders, s'abonner à une valeur **dérivée stable**
  (ex. `App.jsx` arrondit `--crisis-level` au pas de 5 %).

---

## 2. Frontière numérique float ↔ Decimal

Règle unique, posée dans [num.js](src/game/core/num.js) :

> **Sous le plafond float (~1.8e308), on garde le résultat float bit-à-bit** en
> l'enveloppant dans un `Decimal`. On ne bascule sur l'arithmétique mantisse/exposant
> de break_infinity **que là où le float déborderait**.

Implications :
- Les valeurs **sans plafond** (ressources, ruines, coûts, multiplicateurs cumulés)
  sont des `Decimal`. Les **jauges bornées** (instabilité, usure, légitimité, ratios)
  restent des `number` natifs — créer des Decimal dans le hot path pour elles est une
  perte de perf pure.
- Plusieurs fonctions du cœur existent **en double** : une version float et un miroir
  `…Dec` (`ruinMultiplier`/`ruinMultiplierDec`, `globalMultiplier`/`globalMultiplierDec`,
  les deux branches de `rates()`, etc.). **Elles DOIVENT évoluer ensemble** : un
  rééquilibrage appliqué à un seul côté ne casse rien sous le plafond float (99,9 % des
  parties) et part en prod sans être vu. Filet : [decimal.parity.test.js](src/game/core/__tests__/decimal.parity.test.js)
  vérifie l'égalité des deux branches sous 2^53 (étendre la table à toute nouvelle paire).
- **Piège anti-coercition** : en DEV, `Decimal.prototype.valueOf` jette. Donc jamais de
  `+`, `-`, `<`, `>=`, `Math.*`, `` `${x}` `` sur un Decimal → utiliser `.add/.sub/.mul/.div`,
  `.gt/.gte/.lt/.lte`, ou `toNum()`/`fmt()`.

---

## 3. Contrat du cache de frame (`renderCache`)

`renderCache` ([state.js](src/game/core/state.js)) mémoïse des calculs coûteux. Deux
familles, invalidées différemment — **se tromper de portée = affichage périmé**.

### a) Caches « par frame » : `_frameX`
`_frameVitals`, `_framePressure`, `_frameGlobalMult`, `_frameGlobalMultDec`, `_frameRates`.
- Recalculés une fois puis réutilisés **dans le même tick**.
- **Remis à `null` en tête de chaque tick** par [tick.js](src/game/core/actions/tick.js)
  (et non via `invalidateRenderCache`). C'est le SEUL endroit qui les nulle au fil du temps.

### b) Caches « par version » : invalidés aux mutations
`_buildingSums`, `cachedRuinEffects`, et les compteurs `_buildingsVersion` / `_upgradesVersion`.
- Stables **entre les ticks** : le tick ne les touche pas. Ils ne changent qu'aux
  vraies mutations, via `invalidateRenderCache(scope)` :
  - `"buildings"` → achat de bâtiment ([buyBuilding](src/game/core/actions/building.js)).
  - `"upgrades"` → (réservé).
  - `"all"` → upgrade, mythe, dynastie, effondrement, Grand Reset, import.
- **Discipline** : toute mutation qui change une de ces entrées DOIT appeler
  `invalidateRenderCache` avec la bonne portée. En pratique, toute action de jeu
  significative invalide déjà `"all"` ou `"buildings"`.
- **Pattern de mémoïsation côté UI** : comme `_buildingsVersion`/`_upgradesVersion`
  bougent UNIQUEMENT aux mutations, un composant peut mémoïser un calcul coûteux dessus.
  Exemple : [BuildingShop.jsx](src/components/ui/BuildingShop.jsx) calcule les coûts de
  lot (`buildingBatchCost`, sommes géométriques Decimal) dans un `useMemo` keyé sur
  `(_buildingsVersion, _upgradesVersion, buyAmount)` → recalcul à l'achat, pas à chaque tick.

---

## 4. Sauvegarde : schéma versionné + hydratation défensive

- La **clé** `localStorage` est `SAVE_KEY` — **ne jamais la bumper** (ça effacerait
  tous les saves). La **version de schéma** vit DANS le payload (`state.saveVersion`).
- Pour faire évoluer le format : incrémenter `CURRENT_SAVE_VERSION` et ajouter une
  étape dans `MIGRATIONS` (transforme un save de la version N vers N+1, séquentiellement).
- `hydrateState(parsed)` reconstruit le state **champ par champ** depuis un `defaultState()`,
  avec bornage/whitelist via les `normalize*` / `finite*` / `decimalField`. Le JSON importé
  est donc non fiable mais **jamais appliqué tel quel**.
- **Invariant** : tout champ persistant doit figurer dans `defaultState()` ET être traité
  dans `hydrateState` — sinon il est silencieusement perdu au rechargement
  (cf. [state.hydration.test.js](src/game/core/__tests__/state.hydration.test.js)).

---

## 5. Grand Reset : héritages préservés

`performGrandReset` ([building.js](src/game/core/actions/building.js)) repart d'un
`defaultState()` frais. Les **héritages permanents** à conserver sont déclarés dans
`GR_PERSISTENT_FIELDS` ([state.js](src/game/core/state.js)), recopiés par
`buildGrandResetState()` (les champs calculés — `grandResetCount`, `legitimacy` amputée
du coût, `history` — sont traités à part).

> ⚠️ **Tout nouveau déblocage permanent doit être ajouté à `GR_PERSISTENT_FIELDS`**,
> sinon il est effacé au prochain GR. Invariant figé par
> [grandReset.test.js](src/game/core/__tests__/grandReset.test.js).
> Note : les `Decimal` (ex. `chaosRuinsBonus`) sont copiés par référence, jamais via
> `structuredClone`/JSON (qui perdrait la classe).

---

## 6. Carte de la cité (canvas)

Rendu séparé de React, dans [cityMapRuntime.js](src/game/map/cityMapRuntime.js)
(le runtime *vivant* — malgré son ancien nom `legacyRuntime.js`). La disposition est
**pure** ([layout.js](src/game/map/layout.js)) et mise en cache sur `_buildingsVersion` ;
le rendu est plafonné à 30 fps, mis en pause derrière les modales, et déterministe par
`state.mapSeed`. Moteur de routes unique : `generateRoadsGraph` ([roadGraph.js](src/game/map/procedural/roadGraph.js),
graphe connexe par construction).

---

## Tests

`npm test` (vitest). Couverture du cœur : golden-master économique, parité float/Decimal,
round-trip d'hydratation, préservation du Grand Reset, chronique, et procédural carte
(routes/eau/bâtiments). Les `scratch/*` (non versionnés) et `simulate-*.js` (racine, hors build et hors
lint) sont des harnais de balancing qui importent le **vrai** moteur.
