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
  sont des `Decimal`. Les **jauges bornées** (instabilité, usure, ratios)
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
- **Versionnés, pas remis à `null`** : chaque cache retient la version à laquelle il
  a été calculé (`_frameXVer`) et se périme quand `renderCache.frameVersion` avance.
  `bumpFrame()` ([state.js](src/game/core/state.js)) l'incrémente **une fois par tick**,
  appelé par [tick.js](src/game/core/actions/tick.js) — c'est la seule horloge de ces
  caches. `invalidateRenderCache("all")` appelle aussi `bumpFrame()` ; les portées
  `"buildings"` et `"upgrades"` ne périment que `_frameRates` (sentinelle `-1`), les
  autres attendent le tick suivant.

### b) Caches « par version » : invalidés aux mutations
`_buildingSums`, `cachedRuinEffects`, et les compteurs `_buildingsVersion` / `_upgradesVersion`.
- Stables **entre les ticks** : le tick ne les touche pas. Ils ne changent qu'aux
  vraies mutations, via `invalidateRenderCache(scope)` :
  - `"buildings"` → achat de bâtiment ([buyBuilding](src/game/core/actions/building.js)).
  - `"upgrades"` → nœud de ruines posé hors du verbe joueur (ex. l'exhumation d'un
    nœud pendant une chute, [crisis.js](src/game/core/actions/crisis.js)) : vide aussi
    `_buildingSums`, que certains nœuds modulent.
  - `"all"` → upgrade, mythe, effondrement, Grand Reset, import.
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
`buildGrandResetState()` (les champs calculés — `grandResetCount` et `history` — sont
traités à part).

> ⚠️ **Tout nouveau déblocage permanent doit être ajouté à `GR_PERSISTENT_FIELDS`**,
> sinon il est effacé au prochain GR. Invariant figé par
> [grandReset.test.js](src/game/core/__tests__/grandReset.test.js).
> Note : les `Decimal` éventuels sont copiés par référence, jamais via
> `structuredClone`/JSON (qui perdrait la classe).

---

## 6. Carte de la cité (canvas)

Rendu séparé de React. La boucle de frame, la caméra, les entrées et la simulation
de la flotte vivent dans [cityMapRuntime.js](src/game/map/cityMapRuntime.js). Le
dessin passe par [iso/isoRenderer.js](src/game/map/iso/isoRenderer.js), qui n'est
plus qu'un **orchestrateur** (~250 lignes) : il avance habitants et véhicules
(`updateCitizens` / `updateVehicles`, agents.js), puis appelle dans l'ordre pictural
plus de 120 modules `iso/` — le sol en pyramide de tuiles (`solPyramide*`), le
fleuve et ses ouvrages, la passe vivante (`isoLiveCollect` collecte les items,
tri par profondeur, `isoLivePaint` les peint), la nuit et le ciel. Les bâtiments-
moteur sont des scènes PNG ([cityEngineSprites.js](src/game/map/cityEngineSprites.js)).
⚠ Aucun module `iso/` n'importe isoRenderer (cycle ESM = TDZ) : ce qui se partage
descend dans une feuille (`isoMath`, `isoArt`, `isoPalette`…).

**Une seule projection**, dans [iso/projection.js](src/game/map/iso/projection.js) :
losange 2:1, caméra fixe. Règle d'or — *plus personne ne projette à la main*, tout
passage monde↔écran passe par `worldToScreen` / `screenToWorld`.

La disposition ([layout.js](src/game/map/layout.js)) est **déterministe** (même état,
même `state.mapSeed` → même plan) et mise en cache sur `_buildingsVersion`, mais elle
n'est **pas pure** : elle lit le `state` global en plusieurs endroits, et le module
porte la capture des vestiges (`setCaptureVestigeHandler`), qui écrit
`state.vestiges` à l'effondrement. Les rangs des merveilles, eux, se gravent dans le
cœur ([mechanics/wonders.js](src/game/core/mechanics/wonders.js)) depuis l'audit du
05/10. Le rendu est plafonné par le palier de qualité (30 fps, 60 au palier Élevé),
ralenti sans focus ou sans entrée ([energySaver.js](src/game/map/energySaver.js)) et
mis en pause derrière les modales. Moteur de routes unique : `generateRoadsGraph`
([roadGraph.js](src/game/map/procedural/roadGraph.js), graphe connexe par construction).

> **Un seul chemin de rendu depuis le 2026-08-23.** La carte a longtemps porté DEUX
> peintres : l'isométrique et un top-down historique, choisis par un drapeau `CM.iso`.
> Le second a été retiré en huit étapes — voir [docs/PLAN-SUPPRESSION-LEGACY.md](docs/PLAN-SUPPRESSION-LEGACY.md),
> qui garde l'inventaire, les 26 pièges rencontrés et ce que chaque coupe a appris.
> `renderWorld.js` a survécu à la coupe mais ne rendait plus le monde : il ne lui
> restait que **les quais et la simulation d'émeute**, tous deux consommés par le
> peintre iso. Renommé [quaysAndRiot.js](src/game/map/quaysAndRiot.js) le même jour
> (Q5 du plan) — un fichier dont le nom mentait était le dernier vestige du chantier.

**Outils partagés des peintres** (audit du 05/10, STRUCT-4/8/9) — à importer, jamais
à recopier :
- [hash.js](src/game/map/hash.js) : les hachages, une variante EXACTE par famille
  (`fmix32`, `hash01Lowbias`, `h32`, `h01Pair`, `h01Imul`). On n'y change jamais un
  algorithme (la ville entière en dépend) ; une copie n'y est rapatriée que si elle
  est identique au bit près (garde : `hash.test.js`).
- [pixelUtil.js](src/game/map/pixelUtil.js) : modulo réel `fm`, `mkCanvas`,
  `rasterCanvas`, `mixRgb` (garde : `pixelUtil.test.js`).
- [iso/isoArt.js](src/game/map/iso/isoArt.js) : le cache des PNG de `/pixelart/iso/`
  (places, ponts, merveilles et clôtures y lisent les mêmes entrées) et `inkBox`, la
  boîte d'encre `{ x0, y0, w, h }` mesurée une fois par image.

---

## 7. Couches et cycles d'import

Les cycles ESM ne cassent pas au chargement… jusqu'au jour où un `const` est lu
avant sa déclaration (zone morte temporelle) — en juillet, c'est ce qui a coûté une
sauvegarde. Règles :

- **`data/` et `core/mechanics/` n'importent jamais le baril `core/actions.js`**
  (ni `core/actions/*` : les actions dépendent des mécaniques, pas l'inverse). Seuls
  la boucle (`main.js`), `events.js` et les outils de debug le lisent. Une exception
  connue, à résorber : `data/vows.js` lit `cycleYear` dans `core/actions/utils.js`
  (cf. APRES-LA-SORTIE.md, STRUCT-12). Le baril
  `core/mechanics.js` ne sert qu'aux consommateurs EXTÉRIEURS : un sous-module de
  `mechanics/` importe ses voisins directement (`shared.js` est la feuille commune).
- **`core/` et `map/` n'importent rien de `components/`** (l'UI lit le jeu, jamais
  l'inverse).
- **[state.js](src/game/core/state.js) : tout ce que `load()`, `hydrateState` et les
  `MIGRATIONS` utilisent est déclaré AVANT `export let state = load()`.** Un `const`
  plus bas est en zone morte au moment du chargement : la save est perdue sans
  erreur visible. Pour la même raison, `clamp` / `clamp01` de
  [utils.js](src/game/core/utils.js) restent des déclarations de `function` (hissées) :
  `state.js` et `utils.js` s'importent mutuellement.
- **Aucun module `iso/` n'importe `iso/isoRenderer.js`** ; ce qui se partage descend
  dans une feuille (`hash.js`, `pixelUtil.js`, `iso/isoArt.js`, `iso/isoMath.js`…).

Les cycles et croisements de couches qui restent (state ↔ utils ↔ olympus, agents →
rendu du pont, audio → boucle de jeu, le singleton `CM` défini dans layout.js qui
fait charger tout le cœur au moindre module de rendu) et leur correctif sont décrits
dans [docs/APRES-LA-SORTIE.md](docs/APRES-LA-SORTIE.md) (STRUCT-10, STRUCT-11).

---

## Tests

`npm test` (vitest). Couverture du cœur : golden-master économique, parité float/Decimal,
round-trip d'hydratation, préservation du Grand Reset, chronique, et procédural carte
(routes/eau/bâtiments). Les harnais d'équilibrage de la racine (`bench-*.js`,
`simulate-ce.js`, `sim-10-profils.js` ; hors build, mais lintés) importent le **vrai**
moteur ; [rootHarnesses.test.js](src/__tests__/rootHarnesses.test.js) vérifie qu'ils se
chargent et tournent. Leurs rapports versionnés vivent dans `docs/bench/`. Les
`scratch/*` (non versionnés) sont des brouillons locaux.
