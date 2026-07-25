# Perf de la carte — état et reprise

**Dernière mise à jour :** 2026-07-25 · **Périmètre :** rendu de la carte iso
(`src/game/map/`) · **Public :** reprendre le chantier sur un autre poste.

Ce document dit **ce qui est mesuré**, **ce qui est livré**, **ce qui a été tenté
puis rejeté** (avec les chiffres, pour ne pas le refaire), et **quoi faire ensuite**.

---

## 1. Le verdict en une ligne

La carte n'est pas lourde : elle **fait deux fois trop de travail**. Le culling se
fait sur un RECTANGLE de cellules alors que l'écran, en projection isométrique, se
projette en LOSANGE — dont la boîte englobante fait le double de l'aire. Environ
**50 % du sol** et **44 % du tri peintre** portent sur des objets hors écran.

Le régime établi tient le budget (frame ~25 ms pour 33 disponibles). Ce qui fait
mal, c'est la **recuisson du sol** au zoom/pan, et le **démarrage**.

---

## 2. L'outillage (à connaître avant de mesurer quoi que ce soit)

Trois profileurs opt-in, tous au même idiome : un drapeau `globalThis`, coût nul
éteint, relevé dans `…Last`.

| Drapeau | Couvre | Fichier |
|---|---|---|
| `__layoutProfile` | le CALCUL du layout (14 phases) | `layout.js` |
| `__isoGroundProfile` | la RECUISSON du sol (cells/flat/grass/fringe/roads) | `iso/isoRenderer.js` |
| `__isoFrameProfile` | **la FRAME entière**, préambule inclus | `framePerf.js` 🆕 |

`framePerf.js` est le seul **non gaté sur `import.meta.env.DEV`** : le lag a été
constaté dans le build Electron, il faut pouvoir profiler là, sur une vraie fenêtre
et une vraie sauvegarde. Les harnais `__cityShot` / `__demoCity`, eux, sautent en
prod.

### Mesurer dans le vrai jeu (Electron)

Ouvrir la console (Ctrl+Shift+I) et coller :

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
    console.log('images/s', (rows.length/5).toFixed(1), '| canvas', __CM.canvas.width+'x'+__CM.canvas.height, '| dpr', __CM.dpr);
  } })();
```

**Ce chiffre manque encore.** Toutes les mesures ci-dessous viennent de la pane
d'aperçu, qui rend en arrière-plan (`document.hidden`) — donc probablement en
rastérisation LOGICIELLE. Les **proportions** sont fiables, les **valeurs absolues**
non. C'est la première chose à faire à la reprise.

---

## 3. Chiffres de référence

Ville de test : 29 types × 230 achats, 2 058 tuiles, 1 204 bâtiments-moteur,
grille N=168, canvas 1208×611, caméra au centre.

### Frame en régime établi — **24,8 ms** (budget 33)

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

### Recuisson du sol — le vrai point noir

∝ cellules VISIBLES, donc ∝ 1/zoom², et **indépendant de la taille de la ville**
(un village de 434 tuiles coûte déjà 169 ms à zoom 1).

| zoom | avant culling | après culling |
|---|---|---|
| 1,0 | 192 ms | **167 ms** |
| 0,6 | 403 ms | 380 ms |
| 0,4 | 780 ms | **660 ms** |

Découpage à zoom 0,4 (1 018 ms à l'époque) : `cells` 607, `flat` 191, `fringe` 170,
`roads` 157, `grass` 141, `tiles` 0, `median` 0.

### Recensement des appels canvas (compteur → indépendant de la machine)

Une frame : `lineTo` **11 172**, `drawImage` 1 626, `beginPath` 1 589, `stroke`
1 091, `fill` 483, `fillRect` 407, `arc` 390, `createRadialGradient` 290,
`shadowBlur` **0**.

**Les sprites ne coûtent rien** (~1 600 blits pour une ville entière). Le coût est
le DESSIN VECTORIEL. Avant le bake, les quais pesaient **10 065 des 11 172 lineTo
(90 %)**.

---

## 4. Ce qui est LIVRÉ

| Correctif | Gain mesuré | Vérification |
|---|---|---|
| **Quais bakés** (`CM.quayCanvas`) | poste 5,7 → 0,8 ms ; frame 22,4 → 18,8 | écart moyen 1,1-1,4/255, 0 % de pixels perceptibles, pan/zoom/dézoom propres |
| **Budget de geste** (`ISO_CRISP_BUDGET_MS`) | dézoom : médiane **396 → 37 ms** | sol net revient bien à l'arrêt (`zoomB === cam.zoom`, clé sans `:lod`) |
| **Culling par cellule** (`drawIsoGround`) | −13 % à zoom 1, −15 % à 0,4 | 681 px/738 k diffèrent, max **14/255**, 0 au-dessus du seuil perceptible |
| **Profileur de frame** | — | disponible en build Electron |

### Détails à connaître

**Quais — bake PARTIEL.** `cityMapDrawQuays(now, mode)` : `'base'` (bakable) /
`'glow'` (additif, reste EN DIRECT) / absent (tout, legacy inchangé). Les lueurs
sont en `globalCompositeOperation = "lighter"` ; bakées sur un offscreen
TRANSPARENT puis blittées en source-over, elles cessent de s'ajouter à l'eau et le
halo devient un aplat. Ne jamais baker l'additif.

**Budget de geste.** Le palier « Élevée » recuisait le sol NET à chaque cran de
geste ; la clé du bake contenant le zoom, un dézoom payait ~1 s PAR IMAGE.
Désormais le geste net est conditionné au **coût mesuré** de la dernière recuisson
(`CM._isoGroundBakeMs`) contre 45 ms. Auto-calibrant. Molette `__crispBudgetMs`.
⚠ Le palier est choisi par `detectAutoTier()` d'après le NOMBRE DE CŒURS : 16 cœurs
→ « Élevée » d'office. **Une machine rapide reçoit donc les réglages les plus
coûteux**, alors que le coût dépend de la ville et du zoom, pas du CPU.

**Culling.** Rejet précoce avant `kindAt` et tout tracé, marge d'une cellule pleine
(le losange pend sous son coin nord, tuiles et touffes débordent). A/B :
`globalThis.__isoCellCull = false`.
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
allocations, des hachages ou des lookups est perdue d'avance.

---

## 6. À FAIRE ensuite, par ordre de valeur

### ① Mesurer dans Electron (30 s, prérequis de tout le reste)
Coller le snippet du §2 en jeu réel. La fenêtre fait 1600×900 contre 1208×611 ici,
soit ~2× les pixels : les phases limitées par le remplissage (peinture, quais,
fleuve, nuit ≈ 21 des 24,8 ms) doubleraient → ~45 ms, hors budget. À confirmer.

### ② Culling du tri peintre (`drawIsoLive`) — le plus gros gain restant
Même défaut que le sol, même ligne de code (`visibleCellBounds` rectangulaire).
Mesuré : **44 % des tuiles retenues sont hors écran** (437 retenues, 246 visibles à
zoom 1 ; 1 006 / 582 à zoom 0,6). Le peintre trie ET dessine ~1,8× trop d'items,
pour 10,7 ms sur 25.

⚠ **Plus risqué que le sol** : les bâtiments sont HAUTS et leur sprite déborde loin
au-dessus de l'ancre sud. Une extension verticale mal calée fait apparaître et
disparaître des bâtiments au bord de l'écran — régression qu'on ne voit qu'en
jouant. Il faut **mesurer** la hauteur réelle des sprites (cf. `engineInkFrac`,
`propBBox`), pas l'estimer.

### ③ Le démarrage (« lent dès le début », signalé en build Electron)
Écarté en lecture : la progression hors-ligne utilise `creditSpan()`, une forme
CLOSE en O(1) — pas une boucle de ticks. Et `cityMapSlots` étant persisté, le
layout au boot prend le chemin CHAUD (~0,3-0,7 s), pas les 2,3 s du froid.
Restent : le JIT (frames à 50 ms qui tombent à 25 après ~25 frames) et le décodage
des PNG. Candidat non mesuré : `img.decode()` à la création dans `ensureProps`.

### ④ Structurels (gros chantiers)
- **Bake en chunks WORLD-space** : supprimerait la recuisson au pan ET au zoom.
  C'est le seul vrai correctif du point noir §3.
- **Arbitrage `lodZoom`** : en « Élevée » il vaut 0 → aucune simplification des
  sprites, les 2 058 tuiles sont dessinées une par une même à zoom 0,4 (~190 ms de
  frame). C'est une promesse produit (« tout reste visible »), pas un bug — à
  trancher par Raph.

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
6. **Après un rechargement HMR, les scènes moteur rendent en REPLI PROCÉDURAL**
   tant qu'`ensureProps()` n'a pas chargé les PNG — sans erreur ni warning. Le test
   qui tranche est non destructif : remettre la molette à sa valeur d'AVANT et
   recapturer ; si l'aspect plat persiste, il est environnemental.
7. **Tester le GESTE demande `CM.forceFrame()`** : `captureFrame` force
   `settled = true` et ne prend jamais le chemin du geste. Et il faut poser
   `CM.cam.zoom` ET `CM.zoomGoal`, sinon `cmCameraGlide` ramène la caméra à chaque
   frame et elle ne s'immobilise jamais.
8. **La pane d'aperçu ne déclenche AUCUN rAF** (onglet caché) : impossible
   d'observer la boucle réelle, il faut piloter les frames à la main.
9. **Ne pas mesurer et lancer les tests en parallèle** : les suites qui appellent
   `computeCityLayout` sont assez lourdes pour souffrir de la contention CPU (4
   tests rouges à vide, verts en re-run).

---

## 8. Molettes de réglage disponibles

| Molette | Effet |
|---|---|
| `window.__isoCellCull = false` | rejoue le balayage complet du sol (A/B du culling) |
| `window.__crispBudgetMs` | budget de recuisson en plein geste (défaut 45) |
| `window.__quayBake = false` | rejoue les quais en direct (A/B du bake) |
| `window.__engineDensityCap` | densité des bâtiments-moteur (défaut 48) |
| `window.__hallSceneMax` | échelle max d'une halle (défaut 1,7 ; 3 = aucun bornage) |
| `window.__groundLodZoom` | seuil de recuisson allégée (piste rejetée, cf. §5) |
| `window.__grassDetail({meadow:0})` | coupe les voiles d'herbe |

---

## 9. Portes CI

`npm run lint` · `npx vitest run` · `npm run build` — les trois passent.
⚠ Couper le serveur Vite avant `build` (EPERM sinon).
