# Perf de la carte — état et reprise

**Dernière mise à jour :** 2026-10-06 (réécrit après l'audit du 2026-10-05,
STRUCT-13 ; la version du 2026-07-25 est dans l'historique git) · **Périmètre :**
rendu de la carte iso (`src/game/map/`) · **Public :** reprendre le chantier sur un
autre poste.

Ce document dit **ce qui est mesuré**, **ce qui est livré**, **ce qui a été tenté
puis rejeté** (avec les chiffres, pour ne pas le refaire), et **où sont les pistes
ouvertes**. Le détail des pistes vit dans le rapport d'audit
(`audit-2026-10-05-RAPPORT.md`, entrées PERF-1 à PERF-73, gardé hors du dépôt sur le
poste de Raph, dans docs/audits) : ce document ne le recopie pas.

---

## 1. Le verdict (état au 2026-10-06)

Les deux défauts de juillet sont réglés : le peintre culle en **losange**
(`visibleDiamondBounds` dans `iso/isoRenderer.js` : les ~44 % d'items hors écran
du rectangle englobant ne sont plus ni triés ni dessinés), et le sol n'est plus
recuit au zoom ni au pan : c'est une **pyramide de tuiles** ancrées monde
(`iso/solPyramide*.js`, docs/PLAN-SOL-PYRAMIDE.md), cuites sous budget et
réutilisées d'une frame à l'autre.

Ce qui coûte aujourd'hui, c'est le **nombre de blits** du peintre, et la façon dont
ils sont composés. Deux machines, deux goulots, à ne jamais confondre :

- **Le .exe sur une vraie carte graphique** est limité par le **GPU** : chaque blit
  `multiply` (ombres du soleil) ou `destination-out` (calque de lumière) relit la
  destination. Le profileur de frame JS ne voit pas ce coût (cf. §7).
- **Le Chrome de Raph rend en LOGICIEL** (accélération désactivée) : c'est la
  surface remplie et le nombre d'appels qui pèsent, le mode de fusion presque pas.

Mesures de l'audit (mégapole ère 33, zoom 1, jour) : ~30 ms par frame dans le .exe
(32 fps), ~44 ms en logiciel ; la nuit en logiciel ~58 ms ; le dézoom maximal en
« Élevée » 61-67 ms (.exe) et 78-91 ms (logiciel). Les trois premiers postes, par
rentabilité mesurée : les ombres du soleil (PERF-1), le calque de lumière (PERF-2),
le dézoom sans niveau de détail (PERF-3).

---

## 2. L'outillage (à connaître avant de mesurer quoi que ce soit)

Des profileurs opt-in, tous au même idiome : un drapeau `globalThis`, coût nul
éteint, relevé dans `…Last` ou dans un objet de compteurs.

| Drapeau | Couvre | Fichier |
|---|---|---|
| `__isoFrameProfile` | **la FRAME entière**, préambule inclus (postes `fp('…')`) | `framePerf.js` |
| `__isoProfParts` | la pesée fine de `vif-peinture`, dans le même relevé | `iso/isoLivePaint.js` |
| `__layoutProfile` | le CALCUL du plan, par phase | `layout.js` |
| `__isoGroundProfile` | la cuisson d'une tuile de sol (cells/flat/grass/fringe/roads) | `iso/isoGroundResolve.js`, `iso/isoGroundBake.js` |
| `__solPyramideStats` | la pyramide : tuiles cuites, ms, hits, replis, mémoire, invalidations | `iso/solPyramide.js` |
| `__solTrace(true)` / `__solTraceDump()` | le journal des recomputes du plan | `solTrace.js` |
| `__lightStats()` (dev) | dépôts et découpes du calque de lumière | `lightLayer.js` |

La sonde de geste (`scripts/sondeGeste.js`, à coller dans la console d'un build de
prod) enregistre 12 s de geste et imprime un JSON : rythme des frames dessinées,
postes, blits, lectures de pixels, pyramide.

Les profileurs de ce tableau (sauf `__lightStats`) sont les seules molettes
**non gatées sur `import.meta.env.DEV`** : le lag a été constaté dans le build
Electron, il faut pouvoir profiler là, sur une vraie fenêtre et une vraie sauvegarde.
Toutes les autres molettes (`__cityShot`, `__demoCity`, `__CM`, les réglages et A/B
du §8…) n'existent qu'en dev : la règle et la liste fermée sont dans
`src/game/map/devKnobs.js` (audit 2026-10-05, DEV-3).

### Mesurer dans le vrai jeu (Electron)

Ouvrir la console (Ctrl+Shift+I) et coller. Dans l'.exe empaqueté, les DevTools
sont coupés (audit 2026-10-05, ELEC-1) : le lancer avec `CIV_DEVTOOLS=1` ou
`--devtools` pour les rouvrir (Ctrl+Shift+I ou F12).

```js
globalThis.__isoFrameProfile = true;
const rows = [], t0 = performance.now();
(function c(){ const p = globalThis.__isoFrameProfileLast;
  if (p && p !== rows[rows.length-1]) rows.push(p);
  if (performance.now() - t0 < 5000) requestAnimationFrame(c);
  else { globalThis.__isoFrameProfile = false;
    const k = [...new Set(rows.flatMap(Object.keys))];
    const m = n => { const a = rows.map(r=>r[n]||0).sort((x,y)=>x-y); return +a[a.length>>1].toFixed(1); };
    console.table(Object.fromEntries(k.map(n=>[n, m(n)])));
    const cv = document.getElementById('cityCanvas');   // pas __CM : molette de dev, absente de l'.exe
    console.log('images/s', (rows.length/5).toFixed(1), '| canvas', cv.width+'x'+cv.height, '| dpr', (cv.width/cv.clientWidth).toFixed(2));
  } })();
```

⚠ **Ce relevé est du temps JavaScript.** Dans le .exe sur GPU, la frame réelle
(30-31 ms à l'audit) dépasse largement ce que `__isoFrameProfile` additionne : le
GPU compose après coup. Pour le temps réel d'image, mesurer l'intervalle entre
frames DESSINÉES (la sonde de geste le fait) ou passer par le protocole DevTools
(CDP, traces de rendu), et toujours lire d'abord le renderer WebGL (la sonde
l'imprime) : « SwiftShader » ou « Basic Render Driver » = rendu logiciel.

---

## 3. Chiffres de référence

### Audit du 2026-10-05 (campagne en jeu réel)

Mégapole ère 33 (et ère 135 pour la bande 9), Chrome en rendu logiciel
(2560×1340, le cas de Raph) et .exe Electron sur RTX (1765×1200). Médianes de
plusieurs relevés, A/B par molette, ordres alternés.

| Situation | .exe GPU | Chrome logiciel |
|---|---|---|
| Jour, zoom 1 | 30-31 ms | 42-46 ms |
| … sans ombres du soleil | 19,6 ms | ~36 ms |
| … ombres en `source-over` | 22,8 ms | ≈ multiply |
| Nuit, zoom 1 | ~26 ms (≈38 fps) | 52-63 ms |
| … calque de lumière coupé | −6,5 ms | 29,6-31 ms |
| Dézoom maximal (0,35), « Élevée » | 61-67,5 ms | 77,8-91 ms |

Comptages par frame (jour, zoom 1) : ~4 000 `drawImage`, dont ~1 540 ombres en
`multiply` ; calque de lumière : 90 dépôts et 605 découpes de jour, 847 et 1 155 la
nuit (avant la grille fine du lot 4). Au dézoom maximal : ~11 700 items et ~12 000
`drawImage` (arbres 4 175, tuiles 2 989, props de place 2 110, lampadaires 845).

**Coûts unitaires** (banc canvas de l'audit, `_audit/tmp-frame-budget/`, ms pour
1 000 appels sauf mention) :

| Opération | GPU (RTX, 2,1 Mpx) | Logiciel (3,4 Mpx) |
|---|---|---|
| blit sprite 72×96 (nearest) | 8,0 | 5,8 |
| blit d'ombre 72×96 en `multiply` | 20,9 | 12,8 |
| ombre 96×48 `source-over` / `multiply` | 7,4 / 21,5 | — |
| découpe `destination-out` (calque lumière) | 5,8 | — |
| blit hors écran (cull Skia) | 4,4 | 0,3 |
| voile plein écran `multiply` (1 appel) | 2,0 | 1,9 |
| pluie : 4 nappes × 2 blits plein écran | 2,4 | 4,2 |
| sol : tuiles 256 couvrant l'écran | 1,2 | 0,7 |

À retenir : sur GPU, un blit `multiply` coûte ~2,8× un blit normal, et un blit hors
écran n'est PAS gratuit (le cull JS paie) ; en logiciel, c'est la surface qui coûte.

### Juillet 2026 (archive : avant la pyramide et le cull en losange)

Ville de test : 29 types × 230 achats, 2 058 tuiles, 1 204 bâtiments-moteur,
grille N=168, canvas 1208×611, caméra au centre. Mesures dans la pane d'aperçu
(probablement en rendu logiciel) : les proportions comptent plus que les valeurs.

#### Frame en régime établi — **24,8 ms** (budget 33)

| phase | ms | part |
|---|---|---|
| `vif-peinture` (tri peintre) | 10,7 | 43 % |
| `quais` | 5,6 → **0,8** après bake | 23 % → 3 % |
| `fleuve` | 3,5 | 14 % |
| `vif-collecte` | 2,2 | 9 % |
| `nuit` | 1,6 | 6 % |
| préambule (layout, caméra, santé, météo, sol) | ~1 | 4 % |

Le préambule de `frame()` est **gratuit** : `pressureBreakdown()` + `cityVitals()`
à chaque frame mesurent 0,0-0,1 ms. Ce n'était pas le problème.

#### Recuisson du sol — le point noir de juillet (réglé par la pyramide)

∝ cellules VISIBLES, donc ∝ 1/zoom², et **indépendant de la taille de la ville**
(un village de 434 tuiles coûte déjà 169 ms à zoom 1). C'est ce coût que la
pyramide de tuiles a sorti de la frame : une tuile se cuit une fois, sous budget,
et sert à tous les zooms voisins.

| zoom | avant culling | après culling |
|---|---|---|
| 1,0 | 192 ms | **167 ms** |
| 0,6 | 403 ms | 380 ms |
| 0,4 | 780 ms | **660 ms** |

Découpage à zoom 0,4 (1 018 ms à l'époque) : `cells` 607, `flat` 191, `fringe` 170,
`roads` 157, `grass` 141, `tiles` 0, `median` 0.

#### Recensement des appels canvas (compteur → indépendant de la machine)

Une frame : `lineTo` **11 172**, `drawImage` 1 626, `beginPath` 1 589, `stroke`
1 091, `fill` 483, `fillRect` 407, `arc` 390, `createRadialGradient` 290,
`shadowBlur` **0**.

**Les sprites ne coûtent rien** (~1 600 blits pour une ville entière). Le coût est
le DESSIN VECTORIEL. Avant le bake, les quais pesaient **10 065 des 11 172 lineTo
(90 %)**.

---

## 4. Ce qui est LIVRÉ

| Correctif | Où | Note |
|---|---|---|
| **Sol en pyramide de tuiles** (2026-09-14) | `iso/solPyramide.js`, `iso/solPyramideFrame.js` | remplace le bake plein écran, le « budget de geste » (`ISO_CRISP_BUDGET_MS`, `CM._isoGroundBakeMs`) et le cache de crans ; réglages `PYR` |
| **Cull en losange du peintre** | `iso/isoRenderer.js` (`visibleDiamondBounds`, `iso/projection.js`) | le rectangle englobant retenait 437 tuiles pour 246 visibles à zoom 1 (1 006 / 582 à 0,6) ; marge basse de 10·hh, les sprites hauts dépassant loin au-dessus de leur ancre |
| **Culling par cellule** dans la cuisson d'une tuile | `iso/isoGroundBake.js` | −13 à −15 % ; A/B dev `globalThis.__isoCellCull = false` |
| **Pool d'items** de la collecte | `iso/isoLiveCollect.js` | les pics de ramasse-miettes de vif-collecte (26-39 ms) ont disparu |
| **Quais cuits** | `iso/isoQuay.js` | l'ancien `CM.quayCanvas` / `cityMapDrawQuays` est parti avec le legacy ; recuits seulement si leur géométrie change (lot 4 de l'audit, PERF-10) |
| **Profileurs dans l'.exe** | `framePerf.js`, `devKnobs.js` (`PROD_KNOBS`) | toutes les autres molettes sont retirées du build de prod |
| **Corrections de l'audit du 05/10** | commits `perf(audit): lot 4` et `perf(audit): lot 8` | gels du passage d'ère, du hors-ligne et de l'émeute, cuissons étalées sous budget (`iso/bakeBudget.js`), calque de lumière à grille fine, économie d'énergie sans focus, masques d'ombre, fleuve mémorisé, salle des Plaisirs en Worker… rendu identique au pixel |

### Détails à connaître

**Quais — ne jamais cuire l'additif.** Les lueurs des quais sont en
`globalCompositeOperation = "lighter"` (`paintQuays`) : cuites sur un offscreen
TRANSPARENT puis blittées en source-over, elles cesseraient de s'ajouter à l'eau
et le halo deviendrait un aplat. Elles restent EN DIRECT.

**Le palier « Auto ».** Il est choisi par `detectAutoTier()` (`qualityMode.js`)
d'après le NOMBRE DE CŒURS et le dpr, et depuis le 2026-10-06 d'après le type de
rendu : rendu logiciel reconnu ou WebGL absent (`rendererProbe.slowRenderer`) →
« Équilibrée sans effets » (décision de Raph, PERF-4 = b). Jamais d'après la durée
réelle des frames : le palier ne change pas en cours de partie. Sans effets, les
lumières ne sont plus occultées non plus (halos directs, PERF-2).

**Culling de la cuisson.** Rejet précoce avant `kindAt` et tout tracé, marge d'une
cellule pleine (le losange pend sous son coin nord, tuiles et touffes débordent).
Le rendu n'est pas bit-identique **et la cause est comprise** : en coupant les
voiles (`__grassDetail({meadow:0})`) l'écart tombe à 217 px / max 2 → c'est la
composition des lots de 256 de `veilPush` qui change, donc l'antialiasing des
arêtes internes des unions. Aucun contenu perdu.

---

## 5. Tenté puis REJETÉ — ne pas refaire

Chacun est commenté **sur place dans le code** avec ses chiffres.

| Piste | Résultat mesuré |
|---|---|
| Mémoriser les normales du ruban (`cmRiverNormalAt`, ~15 000 appels/frame) | **6,7 vs 6,5 ms — rien.** V8 élimine ces objets courts |
| Remplacer les dégradés radiaux (290/frame jour, 1001 nuit) | **0,7 et 1,7 ms — négligeable** |
| Cacher `kindAt` sur le layout (27 252 cellules) | cache vérifié réutilisé, **temps inchangé** (2029 vs 2066 ms) |
| Recuisson ALLÉGÉE au repos sous un seuil de zoom | gain réel −35 % à 0,5, **mais le pavage devient un APLAT uniforme**, marquages compris, visible dès 0,5 |

**Leçon transversale, vérifiée quatre fois : sur cette carte, ce qui coûte est
TOUJOURS le tracé, jamais le JavaScript autour.** Toute optimisation visant des
allocations, des hachages ou des lookups est perdue d'avance. (Exception
confirmée par l'audit : au dézoom maximal, la collecte et le tri de ~11 700 items
redeviennent un vrai poste JS — 13-15 ms dans le .exe.) Et sur GPU, le **mode de
fusion** compte autant que le nombre de blits (cf. §3).

---

## 6. Pistes ouvertes (par valeur mesurée)

Toutes sont détaillées, chiffres et correctif compris, dans le rapport d'audit du
2026-10-05. Celles qui changent un visuel ou une promesse attendent Raph.

1. **Ombres du soleil (PERF-1)** — premier poste du .exe. FAIT le 2026-10-06 :
   `SUN_SHADOW` par défaut en `source-over`, teinte `#00081c`, dose 0,22 (choix de
   Raph sur la planche `planches/ombres-soleil` : 99 % de l'assombrissement du
   multiply, −13 à −15 ms GPU). Le correctif structurel (cuire les ombres des
   objets fixes dans les tuiles du sol, −11 ms GPU / −8 ms logiciel) reste ouvert
   (effort L).
2. **Calque de lumière (PERF-2)** — la grille fine du lot 4 a retiré ~70 % des
   découpes de jour. Depuis le 2026-10-06, les paliers sans effets (Performance,
   et « Auto » en rendu logiciel) ne découpent plus rien (halos directs, choix de
   Raph) ; aux autres paliers, la nuit garde son coût.
3. **Dézoom maximal en « Élevée » (PERF-3)** — 16 fps (.exe), ~12 fps (logiciel).
   FAIT le 2026-10-06 (choix (a) + (d) de Raph) : « Auto » prend « Équilibrée sans
   effets » sur une machine lente (PERF-4), et aux niveaux 0,375 et 0,5 de la
   pyramide les arbres de forêt sont CUITS dans les tuiles du sol
   (`iso/forestBake.js`, molette `__forestBake`) — le peintre ne pose que ceux que
   quelque chose recouvre. Vue de forêt au zoom 0,375 : 52-57 → 33-35 ms
   (logiciel) ; cœur de ville : inchangé. Reste ouvert : le zoom 0,125 des très
   grandes cartes, servi par le niveau 0,25 réduit et lissé, où l'arbre cuit ne
   serait plus l'arbre posé (question posée à Raph). Au-delà (seuil de 3-4 px,
   `lodZoom` ≈ 0,45 en Élevée) : décision de Raph, car `qualityMode.js` promet
   « TOUT reste visible même en dézoom total ».
4. **Palier « Auto » (PERF-4)** — FAIT le 2026-10-06 : rendu logiciel ou WebGL
   absent → « Équilibrée sans effets » ; pas de descente sur la durée des frames
   (choix de Raph).
5. **Le démarrage** — le hors-ligne (`creditSpan()`, forme close) et le plan au
   boot (chemin chaud, ~0,3-0,7 s) sont écartés depuis juillet ; le gel du
   rattrapage après une longue absence est réglé (PERF-8, lot 4). Restent le JIT
   (frames à 50 ms les ~25 premières) et le décodage des PNG.
6. **Les cuissons des ports à la croissance de grille (PERF-10)** — FAIT le
   2026-10-06 (choix A de Raph, planche `planches/ports-grain-ancre`) : le grain des
   ports (écume, dalles, briques, mouchetis) se lit depuis l'ANCRE du port, plus sur
   le monde ; une scène translatée cuit la même image, et la cuisson se GARDE,
   décalée (`isoBoxBake.anchoredBake`, clé relative = boîtes + fleuve voisin). Mesuré
   (mega-33 / mega-135, croissance de 2 cases dans la vallée) : postes « quais » +
   « fleuve » de 93-97 → 30-32 ms, deux cuissons sur deux gardées. Reste : au
   premier cycle (et au-delà de la largeur de la cité tombée), le fleuve s'étire
   avec la grille (RN = N) et glisse sous le port — la cuisson se refait, juste
   (question posée à Raph). Les ~25 ms restants de « quais » sont les quais du
   fleuve, pas les ports.

---

## 7. Pièges de mesure (chacun m'a coûté du temps)

1. **`captureFrame` mesure le HARNAIS.** Il finit par `toDataURL('image/png')`, qui
   force une synchro GPU→CPU : 161 ms mesurés = 26 de frame + ~135 de harnais.
   Lire `__isoFrameProfileLast.total`, jamais l'appel englobant.
2. **Le JIT froid double tout.** Même config à 48,7 puis 24,8 ms après 25 frames de
   chauffe. Toute mesure sans chauffe longue est fausse d'un facteur 2.
3. **Un A/B dans un seul ordre ne prouve rien.** Le cache de `kindAt` mesurait
   « 3× plus rapide » dans un sens, « identique » dans l'autre. **Toujours alterner
   les deux ordres.**
4. **Comparer deux rendus exige `citizens:'none'`** (vide piétons, véhicules ET
   bateaux). Sinon on mesure la simulation : deux diffs annonçaient 2,8 % de pixels
   différents — c'était le BATEAU qui avait bougé.
5. **Un premier relevé aberrant après un déplacement de caméra est un TRANSITOIRE
   de bake.** Le rejouer avant de conclure.
6. **Après un rechargement HMR, les scènes moteur rendent sans leurs PNG** tant
   qu'`ensureProps()` ne les a pas chargés — sans erreur ni warning (en repli
   procédural jusqu'au 2026-10-06, et depuis la suppression de ce repli, audit
   MORT-2, pas du tout). Le test qui tranche est non destructif : remettre la
   molette à sa valeur d'AVANT et recapturer ; si l'écart persiste, il est
   environnemental.
7. **Tester le GESTE demande `CM.forceFrame()`** : `captureFrame` force
   `settled = true` et ne prend jamais le chemin du geste. Et il faut poser
   `CM.cam.zoom` ET `CM.zoomGoal`, sinon `cmCameraGlide` ramène la caméra à chaque
   frame et elle ne s'immobilise jamais.
8. **La pane d'aperçu ne déclenche AUCUN rAF** (onglet caché) : impossible
   d'observer la boucle réelle, il faut piloter les frames à la main.
9. **Ne pas mesurer et lancer les tests en parallèle** : les suites qui appellent
   `computeCityLayout` sont assez lourdes pour souffrir de la contention CPU (4
   tests rouges à vide, verts en re-run).
10. **Le profileur de frame est AVEUGLE au GPU** (audit du 05/10). Sur le .exe
    GPU, `__isoFrameProfile` additionne le JavaScript ; la composition GPU (blits
    `multiply`, `destination-out`) se paie ensuite. Une piste qui « ne gagne rien »
    au profileur peut gagner 10 ms d'image réelle : mesurer l'intervalle entre
    frames dessinées, ou la trace CDP.
11. **Lire le renderer avant de conclure.** Le Chrome de Raph a l'accélération
    matérielle désactivée : rendu LOGICIEL, où multiply et source-over coûtent
    pareil et où seule la surface compte. Une mesure sur une autre machine ne se
    transpose pas : la sonde de geste imprime le renderer WebGL, c'est la première
    ligne à lire.
12. **La fluidité se juge en PROD** (`npm run build` puis `npm run preview`, ou le
    .exe) : le serveur de dev ajoute le HMR, les molettes et React en mode
    développement.
13. **Le canevas 2D est DIFFÉRÉ, même en logiciel** (PERF-3, 2026-10-06). Un
    `drawImage` est enregistré, puis rastérisé plus tard — souvent dans une AUTRE
    phase du profileur, ou après la frame. Mesuré : 60 blits de tuiles « coûtaient »
    0,2 ms dans un mode et 10,8 ms dans l'autre, pour le même travail rastérisé
    ailleurs. Pour comparer deux modes en boucle de `forceFrame`, finir chaque frame
    mesurée par `CM.ctx.getImageData(0, 0, 1, 1)` (la rastérisation tombe dans la
    mesure), et chauffer jusqu'à ce que plus aucune tuile ne cuise (anneau et
    plancher compris), pas seulement le visible.
14. **Deux chargements ne rendent pas la même image** (PERF-10, 2026-10-06), même
    `captureFrame({ now })` figé et horloges gelées : la petite vie (`isoVie.js` :
    l'onde de vent, les bestioles) garde un état qui dérive. Une planche avant/après
    entre deux serveurs coupe `VIE.on` des deux côtés ; restent quelques lueurs et
    reflets d'eau (à vérifier par un A/A du même serveur).

---

## 8. Molettes de réglage disponibles

En dev seulement (`npm run dev`) : absentes du build de prod et de l'.exe
(`src/game/map/devKnobs.js`). Vérifiées présentes le 2026-10-06 ; `__crispBudgetMs`,
`__quayBake` et `__groundLodZoom` sont partis avec ce qu'ils réglaient.

| Molette | Effet |
|---|---|
| `__solPyramideTune({ budgetMs, gestureBudgetMs, memMo… })` | réglages de la pyramide (`PYR`, `iso/solPyramideFrame.js`) |
| `__sunShadow({ on, mode, col, alpha, minH })` | ombres du soleil (A/B de PERF-1) |
| `__lightOcclusion({ on })` | occultation des lumières (`on:false` = calque coupé) |
| `__forestBake({ on, juge, minShare })` | forêt cuite dans le sol aux niveaux ≤ 0,5 (A/B de PERF-3 ; `juge:false` saute toujours) ; relevé `stats` |
| `globalThis.__isoCellCull = false` | rejoue le balayage complet dans la cuisson d'une tuile |
| `window.__engineDensityCap` | densité des bâtiments-moteur (défaut 48) |
| `window.__hallSceneMax` | échelle max d'une halle (défaut 1,7 ; 3 = aucun bornage) |
| `__grassDetail({ meadow: 0 })` | coupe les voiles d'herbe |

---

## 9. Portes CI

`npm run lint` · `npm test` · `npm run build` — ce que rejoue la CI
(`.github/workflows/ci.yml`).
⚠ Couper le serveur Vite avant `build` (EPERM sinon).
