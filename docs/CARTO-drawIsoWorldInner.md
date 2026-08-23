# Cartographie de `drawIsoWorldInner` — 493 lignes, mais **une seule chose** · 🏁 **découpée : 98 lignes**

Troisième et dernière carte du lot Q10, après `drawIsoGround` (1 164 l. → 77) et
`drawIsoLive` (936 l. → 91). Celle-ci est courte, parce que la fonction l'est
devenue : les deux découpes précédentes lui ont retiré ses deux gros locataires.
Ce qui reste tient en trois morceaux — et **un seul pèse**.

État mesuré le 2026-08-23 : `isoRenderer.js` fait **1 186 lignes**, 10 fonctions.
`drawIsoWorldInner` occupe les lignes **693-1185**, soit **493 lignes**.

---

## 1. La forme — trois phases, dont une qui fait 80 %

| # | Phase | Lignes | Taille | Ce que c'est |
|---|-------|--------|--------|--------------|
| 1 | **Préambule** | 693-714 | 22 l. | remise à zéro des boîtes, palette de saison, **la simulation** (`updateCitizens`, `updateVehicles`, `updateCrisis`), fond d'herbe sauvage plein écran |
| 2 | **LE CACHE DU SOL** | 715-1110 | **396 l.** | `if (CM.groundCanvas && helpers)` — quand recuire le sol, et surtout comment ne pas le recuire |
| 3 | **La file de rendu** | 1111-1183 | 73 l. | fleuve, quais, ponts, bateaux, vivant, oiseaux, drones, nuit, pluie, ambiance, pensées — **des appels d'une ligne**, séparés par des `fp(...)` |
| — | `return true` | 1184-1185 | 2 l. | |

La phase 3 est **déjà** ce qu'on voulait obtenir : de la pure coordination, une
ligne par sujet, chaque sujet dans son module. Elle n'a rien à donner. La phase 1
non plus : 22 lignes qui n'appartiennent à personne d'autre.

**Il n'y a donc qu'une coupe dans cette fonction**, et elle vaut 396 lignes.

---

## 2. Le couplage — trois noms, et c'est tout

Ce que le bloc 715-1110 lit de la fonction qui l'englobe :

| Nom | Lignes | Nature |
|-----|--------|--------|
| `ctx` | 4 | le contexte 2D |
| `L` | 2 | `CM.layout` |
| `helpers` | 7 | le paramètre — `bakeMargin` / `blitMargin` du runtime |

**Trois.** Rien d'autre. Aucun état réassigné, aucune fermeture partagée avec le
reste de la frame.

### ⚠ Et l'angle mort n°5 a été vérifié explicitement

La coupe de la collecte avait montré que **les paramètres d'une fonction sont
invisibles** à un balayage de déclarations. Ici, `dt`, `now` et `helpers` ont donc
été cherchés à la main dans le bloc. Résultat :

- `helpers` : **7 usages réels** → il passe en paramètre ;
- `dt` et `now` : **zéro**. Les 3 occurrences de chacun sont de faux positifs —
  `performance.now()` (un accès de propriété) et un `const dt` local, à la ligne
  856, qui **masque** le paramètre du même nom à l'intérieur de la fermeture
  `bake`.

C'est un fait de conception, pas un détail de mesure : **le cache du sol ne sait
pas quelle heure il est dans le jeu.** Il travaille à l'horloge murale
(`performance.now()`), parce que ses délais — 110 ms d'apaisement, 400 ms de
repos, les budgets de 45 et 70 ms — sont des délais de *ressenti*, pas de
simulation. Une pause du jeu ne doit pas geler la recuisson du sol.

---

## 3. La coupe : ce n'est pas un bloc, c'est un **sous-système**

Le bloc appelle `drawIsoGround()` (l. 845, l. 1109). Le sortir seul créerait le
cycle qu'on s'interdit depuis le début. Il faut donc emmener la cuisson avec le
cache — et quand on suit le fil, on trouve un ensemble déjà clos, simplement
**dispersé en trois endroits** du fichier, avec le survol et `drawIsoLive` coincés
au milieu :

| Où | Lignes | Quoi |
|----|--------|------|
| A | 159-236 | `ISO_GROUND_LOD` + `drawIsoGround` — **la cuisson** |
| B | 375-663 | 18 déclarations — **la machinerie** : seuils, tranches, défilement au pan, cache de crans, pré-cuisson en fond, signature de contenu |
| C | 715-1110 | **la décision** — le bloc de `drawIsoWorldInner` |

**Total : 763 lignes.**

### La mesure qui décide

Les 20 déclarations de A+B, comptées une à une dans tout le dépôt :

- **16 ne servent QUE dans le bloc C.** Zéro usage ailleurs dans `isoRenderer.js`,
  zéro import dans un autre fichier.
- `drawIsoGround` sort deux fois de C — dans `bakeGroundStrip` et
  `gzcPrebakeStrip`, c'est-à-dire **dans le sous-système lui-même**.
- Les mentions inter-fichiers sont toutes fausses : `ISO_GROUND_LOD` dans
  `isoGroundResolve.js` est un **nom de paramètre** (gardé exprès), `ISO_SETTLE_MS`
  dans `cityMapRuntime.js` est un **commentaire**, et les neuf modules `iso/` qui
  citent `drawIsoGround` le citent en prose. `cityMapRuntime.js` n'importe
  d'`isoRenderer` que `drawIsoWorld`.

### Ce que ça donne

```
← IMPORTS depuis isoRenderer : 0        ⚠ c'est le COÛT de la couture
→ SURFACE PUBLIQUE du module  : 1 fonction
```

**Une couture à zéro.** C'est la première du chantier. Les 16 noms deviennent
privés au module ; `drawIsoWorldInner` n'en voit plus aucun et appelle une
fonction, à laquelle il passe `ctx`, `L` et `helpers`.

Imports à recopier : **12 exclusifs** (`BEACH`, `SEASON_GRASS`, `makeGroundBake`,
`sweepIsoGroundCells`, `drawIsoGroundRoads`, `drawWonderGroundAll`,
`drawGrassDetailAll`, `drawGrassFringeAll`, `drawIsoMedians`, `ensureQuayGate`,
`panDeltaToScreen`, `screenDeltaToPan`) qui **quittent** `isoRenderer` ;
**6 partagés** (`CM`, `ISO_X`, `ISO_Y`, `fp`, `rgb`, `visibleCellBounds`) qui
restent des deux côtés.

---

## 4. Le bloc est indivisible — mesuré, pas supposé

On pouvait espérer une coupe plus fine : « la décision de recuire » d'un côté, « le
cache de crans » de l'autre. Structure interne :

| Lignes | Taille | Sujet |
|--------|--------|-------|
| 715-750 | 36 l. | **la clé** — porte du quai résolue *en avance* (⚠ elle entre dans la clé, le fleuve la peindra bien plus tard), `keyPre` / `keySuf` / `key` / `cacheBase` |
| 751-810 | 60 l. | **restauration** depuis le cache de crans, exacte ou approchée |
| 811-836 | 26 l. | **l'état de la frame** — `bm`, marge, delta de pan, apaisé / au repos, même contenu, dans la marge, en LOD |
| 837-861 | 25 l. | la fermeture **`bake(level)`** |
| 862-981 | 120 l. | **LA DÉCISION** — la cascade : geste net, dans la marge, apaisé, défilement, blit de zoom, repli |
| 982-1032 | 51 l. | **snapshot** du cache de crans |
| 1033-1107 | 75 l. | **pré-cuisson en fond** |
| 1108-1110 | 3 l. | le repli `else drawIsoGround()` |

Verdict de la mesure : **10 noms déclarés dans la première moitié (715-861) sont
relus par la seconde (982-1107)** — `key`, `cacheBase`, `gc`, `e`, `d`, `M`,
`nowMs`, `settled`, `restful`, et la fermeture `bake` elle-même. Le cache de crans
ne *suit* pas la décision : il en fait partie. **Un seul module.**

---

## 5. Deux choses trouvées à la mesure — qui ne bloquent pas la coupe

### ⚠ Une garde P31 est déjà **creuse**

`cellClump.test.js:113` lit le **texte source** d'`isoRenderer.js` et affirme :

```js
expect(src).toContain("cmCellNoise");
```

Elle est verte. Mais `cmCellNoise` n'apparaît plus dans `isoRenderer.js` que dans
un **commentaire de la ligne 16** — celui qui dit que la fonction est partie avec
la forêt sauvage. La garde passe grâce à de la prose. Elle ne prouve plus rien.

Elle ne menace pas cette coupe (la ligne 16 ne bouge pas), mais c'est le
quatrième épisode du même piège : *une garde qui cherche du texte ne porte aucun
nom d'export, donc aucun balayage de symboles ne peut la voir devenir fausse.*
Ici elle n'a pas cassé — elle a fait pire, elle est restée verte en perdant son
sens. **Repointer la garde sur `isoWildForest.js` est une réparation d'une ligne,
à faire à part** : ce n'est pas un déplacement pur.

### `globalThis.__groundZoomCacheStats` doit voyager avec `gzcStats`

Ligne 589, au niveau module :

```js
if (typeof globalThis !== 'undefined') globalThis.__groundZoomCacheStats = gzcStats;
```

C'est la molette de diagnostic du cache. Elle est **dans la tranche B**, donc elle
part avec — mais c'est un effet de bord au chargement (P32) : il ne s'exécutera
que si quelqu'un importe le module. `isoRenderer` l'importera pour appeler la
coupe, donc la chaîne tient. À vérifier tout de même après la coupe, molette en
main : `globalThis.__groundZoomCacheStats` doit toujours répondre.

---

## 6. Ce que cette carte NE propose pas

- **Le survol** (38 l., `HOVER_CELL` + `drawIsoHoverCell`) et **`drawIsoLive`**
  (91 l.) restent. Ce sont des coordinateurs courts, et c'est exactement le
  travail d'un fichier nommé `isoRenderer`.
- **Découper le préambule ou la file de rendu.** 22 et 73 lignes qui ne sont que
  de l'appel. Les sortir ne ferait que déplacer une indirection.
- **Toucher à la cascade de décision.** Elle a été calibrée au profileur sur
  machine de jeu (les chiffres sont dans les commentaires : 1 197 ms de recuisson
  sur 13 s de dézoom). On la déplace **au caractère près**, on ne la relit pas.
- **Dédupliquer `rgb` et le cache d'art avec `isoBridge.js`.** Toujours en
  attente, toujours hors sujet ici.

---

## 7. Ordre conseillé

Une seule coupe, en un seul commit — mais en trois morceaux à recoller dans le
bon ordre, et la tranche C est la dernière parce qu'elle referme la fonction :

1. **A + B** (159-236, 375-663) → `iso/isoGroundBake.js`, avec les 12 imports
   exclusifs. Rien ne bouge encore dans `drawIsoWorldInner`.
2. **C** (715-1110) → devient le corps de la fonction exportée, avec le contexte
   destructuré en tête : `const { ctx, L, helpers } = …` — les 3 lectures
   redeviennent des locales **à leur nom**, et les 396 lignes sont reprises sans
   une ligne de changée.
3. Dans `isoRenderer` : un import, un appel, et `drawIsoWorldInner` passe de
   **493 à ~98 lignes**.

Preuve : **identité des octets** sur les 763 lignes (jamais une empreinte de
canvas — cf. P24). Puis les trois portes, aucune ne suffisant seule : `lint`
(no-undef, imports orphelins), `test`, `build`. Puis à l'écran, molettes en main :
`__groundZoomCache`, `__groundZoomCacheStats`, `__crispBudgetMs`,
`__lightBudgetMs`.

**Après cette coupe, `isoRenderer.js` ferait ~424 lignes** — dont ~130 d'en-tête
d'imports — et le chantier Q10 serait à **11 039 → ~424 l., soit −96 %**.

---

## 8. ✔ FAIT — 🏁 `isoRenderer.js` : 1 186 → **394 lignes**

Un seul commit, les trois tranches d'un bloc, dans l'ordre du §7. `iso/isoGroundBake.js`
fait **830 lignes** et n'expose qu'un nom : `paintIsoGroundCached(ctx, L, helpers)`.
`drawIsoWorldInner` est passé de 493 à **98 lignes** — la prévision au ligne près.

**La preuve, dans les deux sens.** Les 779 lignes de A+B+C se retrouvent verbatim dans
le module ; et le reste d'`isoRenderer` était, avant le nettoyage des imports,
**identique à la ligne près** à l'ancien fichier privé de ces trois plages, plus
l'appel. Le nettoyage a ensuite retiré dix imports devenus orphelins — vérification :
sur le fichier final, **quatorze lignes seulement** n'existaient pas dans la version
commitée, et ce sont exactement les quatre imports réécrits (chacun un sous-ensemble
strict de son original), le bloc du nouvel import, et la ligne d'appel. Rien d'inventé.

Les trois portes : lint du dépôt, **1 690 tests**, build. Vertes.

### Ce que l'écran a montré, pane masquée

`document.hidden` étant vrai, le rAF ne tire jamais et le jeu ne tique pas — mais
`CM.captureFrame()` **joue une frame complète en synchrone**, layout compris. C'est
l'outil pour ce cas, et il faut le noter : il vaut mieux que tous les contournements
essayés jusqu'ici.

- La carte peint : clé de cache composée `iso:…:0.850:0:s3:bchsand0.8_7:qg1000:f` —
  on y lit `qg1000` (la porte du quai, résolue en avance, §4) et `bchsand` (`BEACH`,
  un des imports déménagés) — bake réel mesuré à **14,6 ms**, image juste (sol
  d'hiver, grève, pont, tentes, routes).
- **Le cache de crans vit** : en promenant la caméra sur des crans neufs puis en y
  revenant, `snapshots` monte 1 → 7 et `restores` 0 → 2, avec sept crans distincts
  dans la Map. Les deux branches déplacées — restauration (l. 751-810) et snapshot
  (l. 982-1032) — font donc ce pour quoi elles sont écrites.
- ✔ **`globalThis.__groundZoomCacheStats` répond** : l'effet de bord de niveau module
  a survécu au déménagement, comme le §5 le demandait (P32).

⚠ **Ce que cette vérification n'établit PAS, et il faut le dire.** En pilotant la
caméra à la main via `CM.forceFrame()`, le bake s'est figé sur un cran (2.400) et n'a
plus été refait sur 52 frames. Ce n'est pas imputable à la coupe — le code est
identique à l'octet près — mais c'est un artefact du harnais : `forceFrame` avec une
horloge synthétique et une caméra poussée à la main ne rejoue pas la cascade de
recuisson, qui s'appuie sur le temps mural et sur l'amortissement du zoom
(`CM.zoomGoal`). Dès qu'on repasse par `captureFrame` (qui pose `CM.capture`, donc
`settled`), la recuisson repart. **Le régime permanent du cache n'a donc pas été
observé en conditions réelles** — seulement ses branches, une à une.
