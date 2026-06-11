# Phase 3 — Migration des nombres vers une bibliothèque Decimal

> Brief de passation pour une session dédiée (idéalement Fable 5).
> Les Phases 1 (versioning de save) et 2 (filet de tests golden-master) sont déjà en place — elles existent **précisément** pour rendre cette migration survivable. Lis-les avant de commencer.

## Consigne d'ouverture (à donner au modèle)

> Tu migres le cœur numérique d'un idle game des `number` JS natifs vers une bibliothèque Decimal (mantisse + exposant), pour lever le plafond de précision à 2^53 et le plafond dur à ~1.8e308. Travail **incrémental**, ressource par ressource. Avant de commencer : lis `docs/PHASE3-DECIMAL.md`, `src/game/core/__tests__/economy.golden.test.js`, `src/game/core/__tests__/fixtures.js`. `npm test` est ton garde-fou — lance-le après **chaque** étape. Ne mets jamais à jour un snapshot sans avoir vérifié manuellement que le changement de valeur est voulu (voir § Lire les échecs de tests). Ne touche à aucune valeur d'équilibrage.

## Pourquoi (le problème qu'on résout)

- Les coûts de bâtiments font `building.base * Math.pow(scale, n)` ([mechanics.js:628](../src/game/core/mechanics.js#L628)). Avec `scale ≈ 1.15`, on dépasse `2^53` (≈ 9e15) en quelques centaines d'achats, puis `Infinity` à ~1.8e308. Au-delà de 2^53, `canPayCost` devient faux et les achats incohérents.
- `fmt()` plafonne à `"Oc"` (10^27) ([utils.js:47](../src/game/core/utils.js#L47)).
- **Plafond caché au chargement** : `finiteNumber(value, fallback, min, max = Number.MAX_SAFE_INTEGER)` ([state.js:259](../src/game/core/state.js#L259)) **clampe toutes les ressources à 2^53 à chaque load**. Même si le runtime gérait de grands nombres, le save les écrête. À traiter impérativement.

## Choix de bibliothèque

`break_infinity.js` (Decimal mantisse+exposant, conçu pour les idle games — rapide, jusqu'à ~1e9e15). Alternative plus précise mais plus lente : `decimal.js`. **Vérifie l'API exacte de la lib choisie avant d'écrire du code** (ne devine pas les noms de méthodes).

Forme attendue de l'API `break_infinity` : `new Decimal(x)`, `.add/.sub/.mul/.div/.pow/.log10/.floor`, comparaisons `.gte/.lte/.gt/.lt/.eq`, `.max/.min`, `.toNumber()`, `.toString()`, parsing via `new Decimal("1.5e30")`. Sérialisation : confirme que `JSON.stringify` produit une string round-trippable (sinon, écris un `toString()`/`new Decimal(str)` explicite — voir § Save).

## Frontière Decimal ↔ number natif

**Decimal** (croît sans limite) : `population`, `food`, `gold`, `knowledge`, `infrastructure`, `ruins`, tous les **coûts**, et les **multiplicateurs cumulés qui peuvent exploser** (`ruinMultiplier` = `1 + ruins^0.62 * 0.09` dépasse 2^53 quand `ruins` est énorme — [mechanics.js:77](../src/game/core/mechanics.js#L77)).

**number natif** (bornés, jamais > ~100) : `instability` (0–1), `timeWear` (0–1), `legitimacy`, `collapsePreparation` (0–`COLLAPSE_PREP_MAX`), `atlasLegitimite` (0–100), les ratios de `cityVitals` (scores, bonus), `effort`/poids de `pressureBreakdown`. Mélanger Decimal là où un `number` suffit = perte de perf pure (Decimal alloue des objets) dans le hot path du tick.

Règle : Decimal **seulement** pour ce qui monte sans plafond. En cas de doute, regarde si le golden-master de la valeur dépasse ~1e6 dans une vraie partie.

## Stratégie incrémentale (surtout pas un big-bang)

Migre par tranches, `npm test` entre chaque. Ordre conseillé (du plus isolé/exposé au plus diffus) :

1. **Coûts + achats.** `buildingBatchCost` ([mechanics.js:628](../src/game/core/mechanics.js#L628)) et son `geomSum`, `buildingCostMainAt`, `maxBuyAmount`, plus `canPayCost`/`payCost` ([utils.js:88-94](../src/game/core/utils.js#L88)). C'est le site le plus exposé au `Math.pow` qui explose, et le plus isolé. `scratch/check-batchcost.js` valide déjà la somme fermée — réutilise-le. Vérifie : les valeurs *sous* 2^53 doivent rester identiques au golden-master ; celles *au-dessus* deviennent plus précises (échecs attendus, voir ci-dessous).
2. **Ruines & prestige** (`ruins`, `ruinMultiplier`, `ruinGain`, gains d'effondrement dans `completeCollapse`). C'est ce qui monte le plus haut via le prestige.
3. **Ressources de production** (`population`, `food`, `gold`, `knowledge`, `infrastructure`) et `rates()` ([mechanics.js:407](../src/game/core/mechanics.js#L407)). Attention : `rates()` retourne des taux réinjectés dans le state au tick — `state.population = Math.max(1, state.population + r.population * dt)` ([tick.js:80](../src/game/core/actions/tick.js#L80)). Si `population` est Decimal, `rates` doit retourner du Decimal pour ces champs, et le tick faire `.add(...)`.
4. **Multiplicateurs cumulés** (`globalMultiplier`, `institutionMultiplier`, etc.) au cas par cas, là où ils peuvent franchir 2^53.
5. **Affichage** : `fmt()` ([utils.js:40](../src/game/core/utils.js#L40)) — étendre les unités au-delà de `"Oc"` et accepter un Decimal en entrée (mode compact / scientifique). C'est cosmétique, à faire en dernier.

## Pièges concrets (repérés en review)

- **Comparaisons** : chaque `>=`, `>`, `<`, `Math.max`, `Math.min` sur une valeur migrée devient `.gte()`, `.gt()`, `.lt()`, `.max()`, `.min()`. C'est là que 90 % des bugs se cachent. `canPayCost` fait `state[currency] >= amount` → `state[currency].gte(amount)`.
- **`payCost`** fait `state[currency] -= amount` → `state[currency] = state[currency].sub(amount)`. (Profites-en pour ajouter le garde manquant : `if (!(currency in state)) throw` — un currency typo'é produit aujourd'hui un `NaN` silencieux qui corrompt le save.)
- **Sérialisation du save** : `JSON.stringify(state)` doit produire des Decimals round-trippables. Deux options : (a) un `replacer`/`reviver` global, ou (b) convertir explicitement chaque champ Decimal en string dans `save()` et le reparser dans les `normalize*` de `hydrateState`. L'option (b) est plus verbeuse mais plus lisible et localisée.
- **`finiteNumber` clampe à 2^53** ([state.js:259](../src/game/core/state.js#L259)) : écris une variante `decimalField(value, fallback)` pour les champs migrés dans `hydrateState`, sinon le load réécrête tout.
- **Migration de save** : la Phase 1 a déjà câblé le moteur. Ajoute simplement `MIGRATIONS[1] = (s) => { /* convertit les number bruts en strings Decimal */ }` et passe `CURRENT_SAVE_VERSION` à `2` ([state.js:12](../src/game/core/state.js#L12)). Les vieux saves se mettront à jour seuls au chargement. **Ne touche pas à `SAVE_KEY`.**
- **Perf du tick** : garde les jauges 0-1 en `number`. Ne crée pas de Decimal dans des boucles chaudes pour des valeurs qui n'en ont pas besoin.

## Lire les échecs de tests (crucial)

`npm test` compare les sorties au golden-master (`src/game/core/__tests__/__snapshots__/`). Trois cas :

- **Échec sur une valeur < 2^53** (ex. `cityVitals`, `pressureBreakdown`, `timeWearRate`, `ruinGain`, petits coûts) → **régression**. Decimal ne doit RIEN changer en dessous de 2^53. C'est un bug d'arithmétique introduit par ta migration (souvent une comparaison ou un `floor` mal traduit). **À corriger, pas à snapshotter.**
- **Échec sur une valeur > 2^53** (ex. `buildingBatchCost markets x500 = 3.05e46`, `foragers x500 = 1.3e39`) → **attendu et bon signe**. Le float perdait de la précision là où Decimal la garde. Ces échecs **signalent exactement les endroits où la profondeur numérique était cassée**. Vérifie à la main que la nouvelle valeur est plus juste, puis mets à jour le snapshot (`npm test -- -u`).
- **Tout passe** → tu n'as rien cassé sous 2^53.

Quand tu migres une ressource, le snapshot correspondant peut légitimement changer de **type** (number → string Decimal sérialisée). Adapte les assertions si besoin (compare `.toNumber()` ou `.toString()`), mais garde la philosophie : exact sous 2^53, plus précis au-dessus.

## Définition de « terminé »

- [ ] `npm test` passe (snapshots à jour, chaque changement de valeur justifié et vérifié).
- [ ] `npm run build` OK, `npx eslint src` sans nouvelle erreur (baseline actuelle : 26 erreurs pré-existantes, hors périmètre).
- [ ] Un vieux save (pré-Decimal) se charge sans perte via `MIGRATIONS[1]`.
- [ ] Achats x1/x25/xmax cohérents en jeu, y compris très tard (population/coûts > 1e20).
- [ ] `fmt()` affiche correctement au-delà de 10^27.
- [ ] Les jauges 0-1 (instabilité, usure) sont restées des `number` natifs.

## Fichiers de référence

- Tests : `src/game/core/__tests__/economy.golden.test.js`, `src/game/core/__tests__/fixtures.js`, snapshots dans `__snapshots__/`.
- Cœur numérique : `src/game/core/mechanics.js` (rates, pressureBreakdown, ruinGain, timeWearRate, buildingBatchCost, ruinMultiplier, institutionMultiplier).
- Coûts/paiement : `src/game/core/utils.js` (canPayCost, payCost, fmt, clamp).
- Save/migration : `src/game/core/state.js` (CURRENT_SAVE_VERSION, migrate, MIGRATIONS, hydrateState, finiteNumber, les normalize*).
- Application au tick : `src/game/core/actions/tick.js`.
- Validation somme géométrique : `scratch/check-batchcost.js`.
