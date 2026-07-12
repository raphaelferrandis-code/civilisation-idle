# Audit CE 0.3 — SYNTHÈSE des 4 lots (core · lot2 · lot3 · mort)

**Date :** 2026-07-12 · **Type :** synthèse transversale (lecture seule — aucun code modifié) · **Version cible :** post-`fecdace`
**Sources fusionnées :**
[`audit-2026-07-core.md`](audit-2026-07-core.md) (cœur numérique + save + sims) ·
[`audit-2026-07-lot2.md`](audit-2026-07-lot2.md) (carte + composants + hooks + CSS) ·
[`audit-2026-07-lot3.md`](audit-2026-07-lot3.md) (contenu narratif + config + outillage + i18n) ·
[`audit-2026-07-mort.md`](audit-2026-07-mort.md) (code mort + duplication, tout le dépôt).
**Base de comparaison v0.4 :** [`Revue-de-code-CE-0.4.md`](../../Revue-de-code-CE-0.4.md) (juin 2026).

> **Verdict en une ligne.** Le **jeu livré est sain** (build vert, 0 vulnérabilité, save round-trip solide, sim↔jeu propre), mais les **trois portes de qualité locales sont deux fois rouges** (golden float fragile + lint du code carte/iso récent) et le **contenu de référence a dérivé** (docs, i18n) — le tout réparable en quasi-totalité par des correctifs **S/M** de config et d'hygiène. Un **seul** défaut de perte de données joueur (héritage d'Énée). Trajectoire : **cœur qui tient, périmètre qui s'étend plus vite que la discipline d'outillage.**

---

## 1. État des portes de qualité (les 4 lots concordent)

| Porte | Commande | Résultat brut | Résultat **réel** (dépôt seul) | Finding fusionné |
|---|---|---|---|---|
| **Build** | `npm run build` | ✅ PASS (136 modules, ~2 s) | ✅ PASS | — |
| **Tests** | `npx vitest run` | ❌ 2 échecs / 717 | ❌ **1 échec réel** (+1 fantôme worktree) | **G‑01** |
| **Lint** | `npx eslint .` | ❌ 117 problèmes (114 err) | ❌ **48 erreurs réelles** (+68 fantômes worktree) | **G‑02** |

Deux portes rouges, mais **le produit tourne** : le lint n'est pas un gate de build, et l'échec de test est un écart d'1 ULP flottant sur un golden du cœur. Le gonflement « brut → réel » vient d'un même bug d'outillage (**G‑03** : ESLint & Vitest descendent dans `.claude/worktrees/**`). Croissance notable depuis juin : **82 → 717 tests**.

---

## 2. Tableau fusionné de TOUS les findings (trié par sévérité globale)

**Méthode de fusion.** Les 4 lots totalisent **~95 findings bruts** (hors verdicts « RAS/PROPRE » et les 6 pistes de régression A1–A6 déjà tranchées). Après dédup des recoupements inter-lots (**13 lignes fusionnées**, colonne « Sources »), ce tableau présente **73 findings distincts** (G‑01…G‑73). Sévérité globale = max des sévérités attribuées, ajustée si l'impact agrégé change (ex. un même défaut vu par 3 lots). Barème commun : **BLOQUANT** = porte rouge / crash / corruption save · **MAJEUR** = bug joueur observable ou perte de données edge-case ou doc activement trompeuse · **MINEUR** = robustesse/incorrection sans impact courant · **NETTOYAGE** = code mort vérifié / duplication / style.

### 🔴 BLOQUANT (3)

| # | Domaine | Fichier:ligne | Résumé | Sources |
|---|---|---|---|---|
| **G‑01** | test / parité-float | `__tests__/economy.golden.test.js:28` · `mechanics/cost.js:77` | Snapshot golden fige la précision float complète → `geomSum` (forme close) dérive du dernier ulp (`…952`→`…955`) → `vitest run` déterministement ROUGE. Impact joueur nul. | CORE‑01 · B‑02 · L3‑B02 |
| **G‑02** | gate / lint | `eslint.config.js` · `package.json:10` | `eslint .` rouge : **48 erreurs réelles** = refs-in-render (8, →G‑06) + `no-unused-vars` carte/iso (14, →N‑bloc) + globals Node `sim-10-profils.js` (26, →G‑21). Bloque toute CI. | B‑01 · L3‑B01 · CORE‑11 |
| **G‑03** | config / portes | `eslint.config.js:8` · `vite.config.js:61` | Ni ESLint (`globalIgnores`) ni Vitest (`test.exclude`) n'excluent `.claude/worktrees/**` → suites en triple, +68 erreurs de lint & 1 échec de test **fantômes** ; portes non déterministes en local. | CORE‑12 · n‑01 · L3‑B03 |

### 🟠 MAJEUR (9)

| # | Domaine | Fichier:ligne | Résumé | Sources |
|---|---|---|---|---|
| **G‑04** | save / grand-reset | `state.js:1187` | `eneeHeritage` **seul** des 12 booléens `*Heritage` absent de `GR_PERSISTENT_FIELDS` → héritage mythique effacé **définitivement** au 1ᵉʳ Grand Reset (mythe reste « complété », donc irrécupérable). **Perte joueur permanente.** | CORE‑02 |
| **G‑05** | perf-react / float | `PurchaseRow.jsx:233` · `BuildingShop.jsx:92` | `arePropsEqual` compare `globalMult` qui dérive à **chaque tick** (`infraMultiplier` continu) → memo intégralement défait → **toutes** les rangées du shop re-render 1×/s en mid/late. | M‑01 |
| **G‑06** | correctness / lint / concurrent | `OdometerNumber.jsx:136` · `RollingNumber.jsx:91` | Lecture/écriture de refs **pendant le render** + `key={ref.current}` → 8 erreurs `react-hooks/refs`, animation non concurrent-safe (React 19 / StrictMode). Cosmétique en jeu, mais nourrit G‑02. | M‑03 · m‑08 |
| **G‑07** | incohérence sim↔rendu | `cityMapRuntime.js:565` · `production.js:164` | `roadCoverage` calculé **géométriquement par la carte** (writer unique) ; les sims headless le laissent à `0` → le balancing **sous-estime** le bonus routes (+10..15 % de prod). Source unique OK, mais non reproductible hors carte montée. | M‑02 (A4) |
| **G‑08** | docs (référence balancing) | `balance-summary.md:44‑57` | Catalogue des Mythes **entièrement périmé** : 13 objectifs faux vs code (seuils absolus refondus en objectifs relatifs/chronométrés). Doc **activement trompeuse** — mal-règle qui s'y fie. | L3‑M01 |
| **G‑09** | i18n (haute visibilité) | `chronicleEvaluator.js:32‑50,191,200` | 20 libellés joueur en FR nu hors `{fr,en}` (catégories + « Campement/Chronique/An ») affichés à **chaque dépêche** de la Chronique. | L3‑M02 |
| **G‑10** | i18n (haute visibilité) | `events.js` (dialogue collapse) | Dialogue d'effondrement + fragments d'épitaphe en FR nu (10), le fichier n'importe pas `i18n` — moment fort du jeu non traduit en EN. | L3‑M03 |
| **G‑11** | config / lint | `eslint.config.js:9` | Le seul bloc de règles est scopé `**/*.{js,jsx}` → **65 scripts `.mjs/.cjs` + `main.cjs`** (process Electron principal) **jamais lintés** (vérifié : exit 0, zéro finding sur du code plein de `require`/`process`). | L3‑M04 |
| **G‑12** | hygiène / CI | (absence) `.github/` | **Aucune intégration continue** — finding v0.4 **toujours ouvert** ; les 717 tests ne sont un filet automatique sur aucun push. | L3‑M05 |

### 🟡 MINEUR (43)

**Robustesse / crash latents (cœur)**

| # | Fichier:ligne | Résumé | Sources |
|---|---|---|---|
| **G‑13** | `actions/crisis.js:70` | `pickCrisisEvent` sans garde runtime : `choices` vide → `%0`=NaN → `event.id` crash (défendu seulement par un invariant DEV-only strippé du build). | CORE‑03 (0.4 §1.2) |
| **G‑14** | `actions/crisis.js:146` | `openCrisisEvent` appelle `choice.apply()` sans garde de type entre `setGamePaused(true)` et le `false` → soft-lock possible (asymétrie avec `autoResolveCrisisEvent`). | CORE‑04 |
| **G‑15** | `actions/automation.js:153` | `canPayCost(costs[rule.actionId])` non gardé → `Object.entries(undefined)` throw dans le tick si `actionId` hors `crisisCosts`. | CORE‑05 |
| **G‑16** | `state.js:411` | `decimalField` ne gère pas la forme Decimal objet-plat `{mantissa,exponent}` (contrairement à `D()`/`toNum()`) → ressource sans plafond remise au défaut sur save édité à la main. | CORE‑06 |

**Parité & architecture (cœur)**

| # | Fichier:ligne | Résumé | Sources |
|---|---|---|---|
| **G‑17** | `production.js:564` | Branches Decimal de `pressureBreakdown`/`cityVitals`/`scarcityRawInstant` jamais comparées à leur jumelle float (golden & smoke ne les attrapent pas au-delà de ~1.8e308). | CORE‑07 |
| **G‑18** | `production.js:75` | `production.js` (mechanics) importe **vers le haut** `actions/olympus.js` → inversion de couche, cycle ES latent. | CORE‑08 |

**Déterminisme des sims d'équilibrage**

| # | Fichier:ligne | Résumé | Sources |
|---|---|---|---|
| **G‑19** | `tick.js:304` (+`chronicleEvaluator.js:186`, `crisis.js:509`) | `Math.random` du tick non seedé alors que les sims stubent `Date.now` → tables de pacing **non reproductibles** (bruit présenté comme « chiffres EXACTS »). | CORE‑09 |
| **G‑20** | `simulate-ce.js:200` | Budget de sim borné sur l'**horloge murale réelle** → moins de jalons sur machine lente → livrables non reproductibles inter-machines. | CORE‑10 |

**Couverture de test (cœur — zones critiques nues)**

| # | Fichier:ligne | Résumé | Sources |
|---|---|---|---|
| **G‑21** | `actions/mythTicks.js:208` | Système de mythes **par tick** (dette Atrides, coûts Sisyphe, Usure Icare/Atlas, ~140 l.) jamais exercé : aucun test ne tick avec un mythe actif. Plus gros trou de test. | CORE‑13 |
| **G‑22** | `mechanics/prestige.js:192` | `legitimacyGain` (devise de prestige, gate dynasties/GR) sans aucun test. | CORE‑14 |
| **G‑23** | `events.js:112` | Chemin interactif post-épitaphe (`nextEpitaphLegacy`, `generateEpitaph` 4 causes) jamais exercé par assertion. | CORE‑15 (0.4 §1.3) |
| **G‑24** | `actions/crisis.js:62` | Sélection de crise (`pickCrisisEvent`/`checkCrisisThresholds`/`openCrisisEvent`) non testée. | CORE‑16 |
| **G‑25** | `actions/tick.js:281` | Chaîne « tick → Rupture=1 → effondrement » (`triggerCollapseChoices`) jamais atteinte par un test temps réel. | CORE‑17 |

**Carte / canvas (lot2)**

| # | Fichier:ligne | Résumé | Sources |
|---|---|---|---|
| **G‑26** | `cityMapRuntime.js:1122` | Bake décor statique : clé inclut `nightF` mais pas `now` → sur-invalide (~20 re-bakes/cycle) **et** gèle la pulsation néon des lampadaires. | m‑10 |
| **G‑27** | `cityMapRuntime.js:523` | Un achat de route déclenche un `computeCityLayout` **complet** (throttlé 1,5 s) au lieu d'une MAJ réseau incrémentale. | m‑01 (A5) |
| **G‑28** | `cityMapRuntime.js:82` | Aucun clamp des dimensions canvas vs limite navigateur (~8192 px) → risque latent 8K/multi-écran (offscreen vides). **Pas** lié à la population. | m‑12 |
| **G‑29** | `cityMapRuntime.js:1000` | `getContext('2d')` des 3 offscreen non vérifié null avant `setTransform` → crash init si contexte perdu/épuisé. | m‑13 |
| **G‑30** | `cityMapRuntime.js:986` | `getContext` principal non vérifié : si null, `CM.inited` reste true → tailles offscreen NaN. | m‑14 |

**Hooks / perf-react (lot2)**

| # | Fichier:ligne | Résumé | Sources |
|---|---|---|---|
| **G‑31** | `useGameState.js:42` | `getSnapshot` mute `lastValueRef` **pendant le render** (diverge du shim officiel) → MAJ manquée en rendu concurrent. | m‑06 (0.4 §3.2) |
| **G‑32** | `useGameState.js:15` | `shallowEqual` 1 niveau : 2 invariants non documentés (sélecteurs plats / pas de réf mutée en place) sans garde-fou. | m‑05 |
| **G‑33** | `ChronicleTicker.jsx:20` | Re-render chaque tick via `tickNow` même quand aucune dépêche n'est visible. | m‑07 |
| **G‑34** | `CrisisActionBar.jsx:244` | Reconstruit tous les descripteurs de foyers (Decimal→number) chaque tick, même accordéon fermé. | m‑09 |

**UI / a11y / cohérence d'état (lot2)**

| # | Fichier:ligne | Résumé | Sources |
|---|---|---|---|
| **G‑35** | `mechanics/upgrades.js:58` | Arbre Ruines : « palier gaté » et « trop pauvre » → même gris `rt-locked` ; le tooltip ambre contredit le nœud grisé. | m‑02 |
| **G‑36** | `HeritageView.jsx:155` | Cartes Héritage sans classe d'abordabilité (≠ boutique `is-affordable`/`is-locked-cost`). | m‑03 |
| **G‑37** | `HeritageView.jsx:167` (+ Prestige, boutique) | Boutons `disabled` sans `aria-disabled`/`title` → sortis du tab-order, aucune raison annoncée au lecteur d'écran (≠ `TreeNode` focusable). | m‑04 |

**i18n restant (lot3)**

| # | Fichier:ligne | Résumé | Sources |
|---|---|---|---|
| **G‑38** | `myths.js:764` | Nom court par strip de préfixe **cassé en FR** pour Chaos/Phénix/Atrides — **bug d'affichage live** (Ragnarok). | L3‑m01 |
| **G‑39** | `actions/myths.js:175` | Charpente `L'Age ${article} ${word}` figée FR (→ « L'Age of Barns » en EN) + typo « L'Age ». | L3‑m02 |
| **G‑40** | `myths.js:522,672` | `.toLocaleString()` suit la locale runtime, découplée du sélecteur de langue. | L3‑m03 |
| **G‑41** | 6+8 fichiers UI | ~12 `aria-label` + petits littéraux FR non passés par `tr()` (Topbar/BuildingShop/CityStatusPanel/RuinsTreePixel…). | L3‑m04 · n‑16 |

**Sécurité / hygiène / dépendances (lot3)**

| # | Fichier:ligne | Résumé | Sources |
|---|---|---|---|
| **G‑42** | `main.cjs:39` · `index.html` | Electron : traversal `app://` (`decodeURIComponent` **après** `path.join`), pas de CSP, pas de garde de navigation. Surface XSS quasi nulle → durcissement défensif. | L3‑m06 (0.4 §5.1) |
| **G‑43** | racine + `public/pixelart/compare.html` | 5 dumps de simulation `.tsv` + `compare.html` **versionnés** (artefacts générés, bruit de diff). | L3‑m05 |
| **G‑44** | `package.json` | Dépendances mineures en retard (electron 42→43, vite/eslint/vitest patchs, adm-zip 0.5→0.6). `npm audit` = 0 vuln. | L3‑m09 |
| **G‑45** | 6 docs | Journaux/revues périmés (arbre 5→4 branches, « mechanics.js fichier-dieu » résolu, Decimal migré, noms d'ères). | L3‑m08 |

**Code mort réel (mort)**

| # | Fichier:ligne | Résumé | Sources |
|---|---|---|---|
| **G‑46** | `actions/olympus.js:125` | `olympusUnlockedProfile()` : fonction morte, doublon exact du jumeau vivant `data/olympus.js:168`. | CORE‑20 · MORT‑01 |
| **G‑47** | `iso/projection.js:108` | `worldBoxToScreenBox()` exportée, aucun appelant. | MORT‑02 |
| **G‑48** | `cityMapRuntime.js:169` | `cityMapTileScreen()` définie + exportée, jamais appelée. | MORT‑03 |
| **G‑49** | `procedural/cityPlan.js:21` | `ANCHOR_KINDS` const exportée, 0 usage (logique d'ancres = liste inline distincte). | MORT‑04 |

**Duplication à risque joueur / structurante (mort)**

| # | Fichier:ligne | Résumé | Sources |
|---|---|---|---|
| **G‑50** | `HeritageView.jsx:273` · `building.js:263` | `Math.pow(2, grandResetCount)` recalculé **en dur** sur 6 sites d'affichage/dialogue (hors les 2 fonctions moteur) → l'UI **ment** si l'équilibrage bouge. | CORE‑21 · DUP‑01 |
| **G‑51** | `ChronicleView.jsx:135` | `2.4` (= `COLLAPSE_PREP_MAX`) codé en dur au lieu d'importer la constante → tuile « Héritage préparé » périmée si le cap bouge. | DUP‑02 |
| **G‑52** | `scripts/buildPalette.mjs:71` | Ancres HSL `EPOCHS` recopiées à la main au lieu d'importer `eraThemes.EPOCHS` → dérive palette↔jeu. | DUP‑03 |
| **G‑53** | `OdometerNumber.jsx:55` ↔ `RollingNumber.jsx:24` | ~59 l. de moteur count-up identiques (2 composants vivants) → extraire `useCountUp`. | DUP‑04 |
| **G‑54** | `pixelMedian.js:44` ↔ `pixelBridge.js` | `pixelMedian` = jumeau verbatim de `pixelBridge` (~80 l., 4 helpers 9-slice). | DUP‑05 |
| **G‑55** | `cityEngineSprites.js`, `agents.js`, `isoRenderer.js` (multi) | Peintres carte copiés : halo `glow` inliné **~68×**, silhouette humanoïde ×3, pas-sur-grille ×3, bateaux recopiés iso, préambule stade ~30×. Plus gros volume de dup du dépôt. | DUP‑06 · m‑11 |

### ⚪ NETTOYAGE (18)

| # | Fichier:ligne | Résumé | Sources |
|---|---|---|---|
| **G‑56** | `state.js:300` | `state.notifEnabled` : miroir sérialisé write-only jamais relu (vraie valeur dans `civ-opt-notif`). | CORE‑18 |
| **G‑57** | `state.js:340` | `export let buyAmount` : miroir module write-only (vérité = `state.buyAmount`). | MORT‑08 |
| **G‑58** | `sim-10-profils.js:116` | 7 imports/variables morts (dont `buyMinimalGold` jamais appelée). | CORE‑19 |
| **G‑59** | `actions/olympus.js` · `state.js` · baril `actions.js` | ~75 `REDUNDANT_EXPORT` : symboles vivants-mais-internes au mot-clé `export` superflu (surface d'API trop large). | MORT‑10 |
| **G‑60** | `__tests__/newMechanics.test.js:159` | Test d'aubaine couplé à l'ordre du tableau `BOONS` (`Math.random→0`=`BOONS[0]`). | CORE‑22 |
| **G‑61** | `branchTheme.js:9` · `:12` | `BRANCH_ORDER` jamais consommé ; pas de token couleur d'état partagé (ambre `#e0b057` en dur). | MORT‑05 · n‑15 |
| **G‑62** | `plazaProps.js:95` | Trio mort : `blitPlazaPropCentered` + `PLAZA_PROPS` + `PLAZA_ERAS`. | MORT‑06 |
| **G‑63** | `activeRuins.js:13` | `ANTEE_POWER_THRESHOLD` : const auto-étiquetée « obsolète », 0 usage. | MORT‑07 |
| **G‑64** | `public/pixelart/wonders/arc-t5-candidats/` (+2) | ~447 K d'assets trackés & shippés jamais chargés. | MORT‑09 |
| **G‑65** | `iso/isoRenderer.js:20` · `cityEngineSprites.js:2152` · `buildingShapes.js:60` · `pixelBridge.js:149` | Imports/params/vars inutilisés (nourrissent G‑02) + `catch(e)` inutilisés + `flap` jamais lu. | n‑09/10/11/12 |
| **G‑66** | `pixelHouses.js:103` · `isoRenderer.js:66` | Réaffectation redondante `c.width/height` après `new OffscreenCanvas`. | n‑08 |
| **G‑67** | `renderWorld.js:405` | Sous-cache `CM_TERRAIN` (hillshade) redondant depuis le bake sol offscreen. | n‑04 |
| **G‑68** | `cityEngineSprites.js:326` | `propPivot`+`propBBox` : 2 décodes `getImageData` de la même image (fusionnables). | n‑07 |
| **G‑69** | `layout.js:1002` | Résidu `O(P²)` de sélection de connecteur (borné ~qq ms/recompute — **pas** le O(N²) régressé). | n‑06 |
| **G‑70** | `DebugDialog.jsx:15` (×3) | Coquille `useEffect isOpen→showModal()/close()` recopiée dans 3 dialogues → `<DialogShell>`. | DUP‑07 |
| **G‑71** | `pixelRiver.js:83` · `utils.js:199` · `ChronicleView.jsx:19` | Helpers redéfinis au lieu d'importer : normale fleuve ×3, PRNG mulberry32, formateur d'horloge `fmtDuration`≈`fmtCycleTime`. | DUP‑08/09/10 |
| **G‑72** | `state.js:72` · `cityMapRuntime.js:513` · `DebugDialog.jsx` · `README.md` | Doc-comments périmés (« Phase 3 », `roadCount`), 13 littéraux dev FR, README mince (omet `npm test`/Electron), `chronicle.test.js` couplé au littéral FR. | n‑05/13 · L3‑n02/n03/n04 |
| **G‑73** | racine | `__opts-full.patch` / `__opts-mine.patch` résiduels + durcissements défensifs facultatifs `layout.js` (`popDepth`/`__nCapOverride` finitude). | L3‑n01 · n‑02/03 |

> **Vérifié PROPRE (rien à corriger, à sanctuariser) :** sim↔jeu **aucune formule recopiée en exécutable** (DUP‑00, les 7 sims importent le vrai moteur) · save round-trip 137/138 clés OK + legs épitaphe corrigé & testé · migrations v0/v1/v2 chargeables · ~60 flags `window.__` tous vivants · contenu Chronique aucun écho mort · 0 vulnérabilité npm · aucun CRLF résiduel · Electron `contextIsolation`/`nodeIntegration` sains · surface XSS quasi nulle. **1 finding réfuté** (commentaire `num.js:26`, exact).

---

## 3. Top 10 actions à fort ROI (toutes catégories)

Effort : **S** ≤ ½ j · **M** ~1–2 j · **L** > 2 j. Risque de régression : probabilité qu'appliquer le correctif casse autre chose.

| # | Action (findings) | Effort | Risque régression | Dépendances |
|---|---|---|---|---|
| **1** | **Rendre les 3 portes vertes & déterministes.** Assouplir le golden (sérialiseur `toPrecision(12)` ou `toBeCloseTo`) **G‑01** ; `test.exclude`+`globalIgnores` sur `.claude/**` **G‑03** ; bloc `globals.node` pour `.mjs/.cjs`+`sim-10-profils.js` **G‑11/G‑21**. | S+S+S | **Très faible** — config + re-génération de snapshot, aucune logique de jeu touchée. | **AUCUNE.** Prérequis dur de **#2, #3, #10** (sans portes fiables, chaque fix suivant part d'un signal rouge/bruité). |
| **2** | **Vider le lint réel.** `key={shape}` au lieu de `key={ref.current}` (**G‑06**) ; retirer les `no-unused-vars` carte/iso (**G‑65**) ; élaguer les imports morts sims (**G‑58**). | S | **Faible** — `key={shape}` touche l'anim odomètre (cosmétique) : vérifier visuellement le passage K→M→B. | Après **#1** (worktrees exclus, sinon on chasse des erreurs fantômes). Complète **G‑02**. |
| **3** | **Activer la CI GitHub Actions** (`npm ci && lint && test && build`). Clôt **G‑12** (ouvert depuis v0.4). | S | **Nul.** | **APRÈS #1 et #2** obligatoirement (sinon rouge au 1ᵉʳ run). Devient le filet qui garde tous les fixes suivants. |
| **4** | **Sauver l'héritage d'Énée (G‑04).** Ajouter `"eneeHeritage"` à `GR_PERSISTENT_FIELDS` **+** assertion « tout `*Heritage` de `defaultState` ∈ la liste » dans `grandReset.test.js`. | S | **Très faible** — ajout à une liste + test ; barre la classe de bug (déjà survenue avec `olympus`). | **Indépendant** — peut se faire en parallèle de #1–3. **Plus fort ROI joueur** (seule perte de données permanente). |
| **5** | **Restaurer la mémoïsation du shop (G‑05).** Arrondir `globalMult` avant de le passer ET de le comparer (`Math.round(x*1e4)/1e4`). | M | **Faible-moyen** — toucher un comparateur `memo` ; vérifier que les `/s` se rafraîchissent encore à l'achat. | **Indépendant.** Gain perf immédiat et visible mid/late. |
| **6** | **Fiabiliser les sims d'équilibrage (G‑19+G‑20).** `setNotifyPaused(true)` pendant la mesure **ou** PRNG seedé (mulberry32) ; borner sur le temps **virtuel**. | M | **Faible** — outillage, pas le jeu livré. | **Indépendant, mais PRÉREQUIS de #7 et #8** : re-mesurer/régénérer sur des sims non-reproductibles reconduirait le bruit. |
| **7** | **Trancher la frontière `roadCoverage` sim↔carte (G‑07).** Extraire `roadCoverageFrom(state)` pure partagée **ou** documenter+neutraliser explicitement le bonus map-only. | M (pure) / S (doc) | **Moyen** si rendu pur — change les chiffres de balancing (voulu : +10..15 %). Nul si documenté. | **APRÈS #6** — pour valider le nouvel effet sur des sims fiables. |
| **8** | **Corriger + régénérer les docs de référence (G‑08+G‑45).** Régénérer le catalogue Mythes depuis `myths.js` (idéalement par script) ; archiver les journaux clos. | M | **Nul** (docs). | Bénéficie de **#6** si l'on régénère des chiffres de pacing ; le catalogue Mythes lui-même = lecture de constantes, indépendant. |
| **9** | **Finir l'i18n des poches à haute visibilité (G‑09+G‑10+G‑38/G‑39) + test « fr sans en ».** Migrer `chronicleEvaluator.js`+`events.js`, corriger les 2 concaténations, ajouter un test anti-régression. | S/M | **Faible** — `events.js` = chemin d'effondrement (joueur) : tester le rendu FR **et** EN. | **Indépendant.** Le test « fr sans en » verrouille la classe pour les futures migrations. |
| **10** | **Découper `production.js` (977 l.) derrière un baril + supprimer le code mort vérifié (G‑18 résolu au passage, G‑46→49, G‑56/57).** Plan L0→L1→L2 acyclique (7 modules), zéro impact API. | M (découpe) + S (morts) | **Moyen** pour la découpe (beaucoup de mouvements) — mais baril = API inchangée, `vitest` vert entre chaque lot ; nul pour les morts. | **APRÈS #1+#2+#3** : la découpe **doit** avoir des portes vertes comme filet à chaque étape (analogue « découper `mechanics.js` AVANT de s'appuyer sur le harnais »). `mechanics.js` **est déjà éclaté** (fait en v0.4) ; `production.js` est le **nouveau** point chaud. |

### Graphe de dépendances (ordre d'exécution)

```
#1 portes vertes ──┬─► #2 lint vide ──► #3 CI ──► (filet permanent) ──► #10 découpe production.js + morts
                   │
                   └─► #6 sims fiables ──┬─► #7 roadCoverage (re-balancing validé)
                                         └─► #8 régé docs (chiffres de pacing)

#4 héritage Énée   ─► indépendant (parallélisable, ROI joueur max)
#5 memo shop       ─► indépendant (ROI perf max)
#9 i18n + test     ─► indépendant (le test "fr sans en" = garde de classe)
```

**Chemin critique :** #1 → #2 → #3 (débloque tout), puis en parallèle la branche balancing (#6 → #7/#8) et la branche refactor (#10). #4/#5/#9 se glissent n'importe quand sans prérequis.

---

## 4. Comparatif avec l'état v0.4 (juin 2026)

Base : [`Revue-de-code-CE-0.4.md`](../../Revue-de-code-CE-0.4.md). En juin : **82/82 tests verts, `eslint .` 0 erreur, 0 bloquant, 0 faille**.

### 4.1 Findings v0.4 RÉSOLUS depuis (confirmés par les 4 lots)

| Finding v0.4 | Preuve de résolution (juillet) |
|---|---|
| **§2.1 `mechanics.js` fichier-dieu (1 413 l.)** | ✅ Éclaté en **baril de 38 l.** réexportant 6 sous-modules à DAG acyclique (CORE §C). Le nouveau point chaud est `production.js` (977 l.) → G‑18/action #10. |
| **§2.4 CRLF résiduels** | ✅ `.gitattributes` correct, **aucun CRLF** suivi (`git ls-files --eol`) — L3 §B.1. |
| **§2.4 Historique mono-commit** | ✅ Commits atomiques désormais (`fecdace`, `9330d31`, `6511bb9`…). |
| **§4.1 `bench-*` importent-ils les vraies formules ?** | ✅ Vérifié : **les 7 sims importent le vrai moteur**, zéro formule recopiée en exécutable (MORT DUP‑00). |
| **§3.3 rAF se ré-arme inactive** | ✅ Re-caractérisé : boucle **meurt** au changement de vue, gelée nativement en arrière-plan, travail quasi-nul derrière modale → « pas un bug actionnable » (lot2 §C). |

### 4.2 Findings v0.4 PERSISTANTS (toujours ouverts)

| Finding v0.4 | Statut juillet |
|---|---|
| **§4.4 Aucune CI** | 🔴 **Toujours ouvert** → **G‑12** (action #3). |
| **§2.2 Couplage singleton `state` + invalidation frame-cache manuelle** | 🟡 Persistant — la reco « compteur de version » n'a pas été adoptée ; `renderCache` reste un 2ᵉ singleton (CORE §C, action #10 en fait la liste priorisée à purifier). |
| **§1.2 Invariant `CRISIS_EVENTS`↔`CRISIS_POOL` + ids bâtiments** | 🟡 **Partiellement** — l'invariant a été ajouté **mais DEV-only** (strippé du build) → la garde runtime manque toujours → **G‑13/G‑24**. |
| **§1.1 Réduire 7 → ~3 paires float/Decimal** | 🟡 Persistant (7 paires maintenues) + **nouvel angle** : 3 branches Decimal inline non testées → **G‑17**. |
| **§3.2 S'abonner aux chaînes formatées, pas aux Decimal** | 🟡 Partiel — plusieurs re-renders 1 Hz évitables subsistent (**G‑31/G‑33/G‑34**). |
| **§5.1 Pas de CSP Electron** | 🟡 Persistant + **nouveaux** angles : traversal `app://`, pas de garde de navigation → **G‑42**. |
| **§1.3/§1.4 Commentaire `runCollapseSequence` + doc hors-ligne=usure** | 🟡 Non confirmé traité ; le chemin reste non testé → **G‑23**. |
| **§2.5 Renommer ids crise `_25/_50/_75`** | 🟡 Cosmétique, non traité. |

### 4.3 Findings NOUVEAUX (absents de v0.4)

- **Portes rouges (régression d'outillage) :** golden float **G‑01** (le golden était **vert** en juin — le snapshot a dérivé avec l'environnement) ; lint rouge **G‑02** venant du **code carte/iso récent** ; pollution worktrees **G‑03**.
- **Perte de données joueur :** `eneeHeritage` **G‑04** — un **trou dans le mécanisme même** (`GR_PERSISTENT_FIELDS`) que v0.4 célébrait comme « corrigé ».
- **Chantier iso (post-v0.4) :** tout le lot canvas-lifecycle **G‑26→G‑30**, duplication i↔legacy **G‑54/G‑55/m‑11**.
- **Mécanique roadCoverage :** incohérence sim↔carte **G‑07**.
- **i18n (pipeline `tr()` post-27/06) :** poches FR nues **G‑09/G‑10/G‑38→G‑41** — corpus **~95 % migré** (bien meilleur que le brief « ~6000 l. à traduire »).
- **Dérive de contenu :** catalogue Mythes périmé **G‑08**, journaux/docs **G‑45**.
- **Couverture lint incomplète :** 65 `.mjs/.cjs` hors périmètre **G‑11**.
- **Audit dédié code-mort/dup :** **G‑46→G‑73** (peu de vrai mort, beaucoup de sur-exposition d'API + dup de rendu).
- **Sécurité Electron approfondie :** traversal `app://` **G‑42**.

### 4.4 Verdict sur la trajectoire

> **Trajectoire positive mais déséquilibrée.** Le **cœur** a tenu ses promesses de juin (fichier-dieu éclaté, CRLF/commits assainis, sims fidèles au moteur, save solide) et le **périmètre a explosé** (chantier iso, i18n ~95 %, pixel-art, refonte Mythes, **82 → 717 tests**). Mais cette croissance a **distancé la discipline d'outillage** : les portes locales sont repassées au rouge (golden fragile + code carte/iso non nettoyé), les docs de référence ont dérivé, et la CI réclamée en juin n'existe toujours pas. **Aucun bloquant dans le jeu livré**, une seule perte de données joueur (Énée), et **la quasi-totalité de la dette est du S/M de config, de test et d'hygiène** — un rattrapage rapide remettrait le projet sur une pente franchement saine.

---

## 5. Plan de correction de tous les éléments

Phasé pour respecter le graphe §3. Chaque item porte son `G‑id` (voir §2) ; « effort » cumulé indicatif.

### Phase 0 — Portes & CI (débloque tout) · effort ~1–1,5 j

1. **G‑01** — Golden robuste au bruit ulp : sérialiseur `Decimal(${v.toPrecision(12)})` (ou `toBeCloseTo` sur les Decimal non entiers), puis régénérer les 10 snapshots. Traiter au passage les snapshots `number` (`cityVitals`/`pressureBreakdown`/`timeWearRate`). *Ne pas toucher à l'équilibrage.*
2. **G‑03** — `vite.config.js` : `test: { exclude: [...configDefaults.exclude, '**/.claude/**'] }` ; `eslint.config.js` : `.claude` dans `globalIgnores`.
3. **G‑11 + G‑21** — Bloc `{ files: ['**/*.{mjs,cjs}','main.cjs','scripts/**'], languageOptions:{ globals: globals.node }, extends:[js.configs.recommended] }` → couvre les 65 scripts **et** règle `sim-10-profils.js`.
4. **G‑06** — `key={shape}` (supprime `shapeRef`/`pulseRef`) sur `OdometerNumber`/`RollingNumber` ; débit de segment via un state posé au rAF.
5. **G‑65 + G‑58 + G‑60** — Retirer les `no-unused-vars` carte/iso + les 7 morts de `sim-10-profils.js` ; découpler le test aubaine de l'ordre `BOONS`.
6. **G‑12** — Ajouter `.github/workflows/ci.yml` (`npm ci && lint && test && build`, Node 20) — **après** que 1–5 soient verts.

### Phase 1 — Correctifs joueur / perf (indépendants, à glisser tôt) · effort ~2–3 j

7. **G‑04** — `"eneeHeritage"` dans `GR_PERSISTENT_FIELDS` + assertion garde-classe `*Heritage` dans `grandReset.test.js`. *(perte de données — priorité joueur)*
8. **G‑05** — Arrondir `globalMult` avant `arePropsEqual` (restaure la mémoïsation de toutes les rangées du shop).
9. **G‑50 + G‑51** — Centraliser `GRAND_RESET_PROD_BASE`/helper (lu par l'UI) et importer `COLLAPSE_PREP_MAX` dans `ChronicleView` (l'UI ne ment plus).
10. **G‑13/G‑14/G‑15/G‑16** — Gardes runtime : `pickCrisisEvent` (`if(!choices.length) return null`), `openCrisisEvent` (garde `apply` + `setGamePaused(false)`), `checkAutomateRules` (garde `cost` falsy), `decimalField` via `D()` pour l'objet-plat. *(coût quasi nul, filet permanent)*
11. **G‑35/G‑36/G‑37 + G‑61** — État d'achat unifié : classe `.rt-cost`/`costLocked` sur l'arbre Ruines, classe d'abordabilité sur cartes Héritage, `aria-disabled`/`title` sur les `disabled`, tokens `--state-affordable/soon/locked` dans `variables.css`.

### Phase 2 — Balancing fiable (chaîné) · effort ~2–3 j

12. **G‑19 + G‑20** — Neutraliser l'aléa des sims (`setNotifyPaused(true)` ou PRNG seedé) + borner sur temps virtuel.
13. **G‑07** — `roadCoverageFrom(state)` pure partagée (ou documenter+neutraliser) — **valider sur les sims fiabilisés en 12**.
14. **G‑08 + G‑45** — Régénérer `balance-summary.md` (catalogue Mythes) depuis le code, idéalement par script ; archiver `docs/archive/` les journaux clos, cocher « mechanics.js éclaté » dans les revues 0.3/0.4, corriger noms d'ères de `pacing-profiles.md`, étoffer `README.md`.

### Phase 3 — i18n & couverture de test · effort ~3–4 j

15. **G‑09 + G‑10 + G‑38 + G‑39 + G‑40 + G‑41** — Migrer les 3 poches (`chronicleEvaluator.js`, `events.js`, aria-labels), corriger les 2 concaténations (`shortName:{fr,en}`, charpente dans le `{fr,en}`), remplacer les 2 `.toLocaleString()` par `fmt()`. **+ test « une unité `{fr}` sans son `en` échoue ».**
16. **G‑21→G‑25** — Combler les trous de test cœur : 1 test par mythe actif (`tick(1)`+assertion), golden `legitimacyGain`, chemin post-épitaphe (résoudre le dialogue), `pickCrisisEvent`, chaîne tick→effondrement.
17. **G‑17** — Étendre `decimal.parity.test.js` à `pressureBreakdown`/`cityVitals`/`scarcityRawInstant` (séam de forçage de branche).

### Phase 4 — Refactor & nettoyage (sous filet CI) · effort ~3–5 j

18. **G‑10/action #10 : découper `production.js`** en `mechanics/production/` (baril + 7 modules L0→L1→L2), résout **G‑18** (extraire `olympusAbyssProductionMultiplier` côté mechanics). `vitest` vert entre chaque lot.
19. **G‑46→G‑49 + G‑56/G‑57 + G‑62/G‑63** — Supprimer les 8 vrais morts (fonctions + consts + miroirs write-only). Risque nul.
20. **G‑64 + G‑43 + G‑44 + G‑73** — Dé-tracker ~447 K d'assets orphelins + dumps `.tsv` + `compare.html` (`.gitignore`) ; supprimer les patches résiduels ; bump des dépendances patch (valider electron 43 / adm-zip 0.6 à part).
21. **G‑55 (halo `glow` d'abord, 68 sites) → G‑53/G‑54/G‑70/G‑71/G‑52** — Factoriser par petits lots : helper `glow`, `useCountUp`, `drawClippedRibbon` (bridge/median), `<DialogShell>`, helpers fleuve/PRNG/durée, import `EPOCHS` dans `buildPalette.mjs`.
22. **G‑59** — Alléger la surface d'API (~75 `REDUNDANT_EXPORT`) par petits lots + `vitest` entre chaque — rend les prochains `knip` exploitables.
23. **G‑26→G‑30 + G‑27 + G‑66→G‑69 + G‑72** — Durcissements carte : sortir l'éclairage animé du bake (G‑26), gardes `getContext` null (G‑29/G‑30), clamp canvas 8192 (G‑28), fusion `getImageData` (G‑68), doc-comments périmés (G‑72). *(chemin incrémental route G‑27 = L, optionnel)*
24. **G‑42** — Durcissement Electron (défensif) : vérif `path.resolve().startsWith(distRoot)` sur `app://`, `<meta>` CSP, `setWindowOpenHandler`/`will-navigate`.

> **Séquencement clé.** Phase 0 avant tout (portes = filet). Phase 2 chaînée (12 avant 13/14). Phase 4 **après** la CI. Phases 1 et 3 se parallélisent librement. Total indicatif : **~13–17 j-personne**, dont **~1,5 j** (Phase 0 + G‑04) débloquent l'essentiel du risque.

---

*Fin de la synthèse. Aucun fichier du code n'a été modifié — ce document et les 4 rapports de lot sont les seuls livrables.*
