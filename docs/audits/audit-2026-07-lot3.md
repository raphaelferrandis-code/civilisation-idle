# Audit CE 0.3 — Lot 3 : contenu narratif · configuration · outillage

**Date :** 2026-07-12 · **Périmètre :** préparation i18n (priorité), hygiène de dépôt, qualité des docs, configuration.
**Mode :** LECTURE SEULE — aucune modification appliquée, ce rapport est le seul fichier créé.
**Hors périmètre (lots 1–2) :** logique de gameplay (cœur numérique, carte, rendu). Elle n'est citée que lorsqu'une porte de qualité échoue dessus ou qu'un texte joueur y vit.

---

## 0. Portes de qualité (exécutées avant l'audit)

| Porte | Commande | Résultat brut | Résultat réel (repo seul) |
|---|---|---|---|
| Build | `npm run build` | ✅ **exit 0** — 136 modules, `built in ~1 s` | ✅ OK |
| Lint | `npx eslint .` | ❌ **exit 1** — 117 problèmes (114 err / 3 warn) | ❌ **48 erreurs réelles** (+68 fantômes) |
| Tests | `npx vitest run` | ❌ **exit 1** — 2 fichiers échoués / 97 | ❌ **1 échec réel** (+1 fantôme) |

> ⚠️ **Deux des trois portes sont ROUGES.** Voir findings **L3‑B01/B02/B03**. Le gonflement « brut → réel » vient d'un bug d'outillage majeur : ESLint et Vitest descendent dans `.claude/worktrees/**` (copies de travail de l'agent), ce qui ajoute 68 erreurs de lint et 1 échec de test **fantômes** (finding **L3‑B03**).

**Frontière float/Decimal (règle #5) :** l'unique échec de test réel se situe **côté FLOAT** — dérive de ~1 ULP dans la mantisse float64 d'un `Decimal` (`buildingBatchCost`), pas dans la couche Decimal. La parité miroir (`decimal.parity.test.js`) reste verte.

### Périmètre de lecture

- **Lus intégralement (moi) :** `package.json`, `vite.config.js`, `eslint.config.js`, `index.html`, `.gitattributes`, `.gitignore`, `main.cjs`, `src/game/core/i18n.js`, `src/game/core/chronicleEvaluator.js`, `src/game/core/utils.js` (couche formatage), `economy.golden.test.js.snap`, `chronicle/p1.js` (échantillon), `chronicle.test.js` (extraits), `myths.js` (extraits 760‑767), `actions/myths.js` (extraits).
- **Inventoriés fichier par fichier (fan‑out de 13 agents, vérifié par grep) :** les **54 fichiers** porteurs de texte joueur (tableau §A.1).
- **Cross‑checkés docs↔code (agents + vérification adversariale + spot‑checks manuels) :** `balance-summary.md`, `pacing-profiles.md`, `bench-legit-formules.md`, `course-gr1-profils.md`, docs de l'arbre de ruines, revues de code 0.3/0.4, `PHASE3-DECIMAL.md`.
- **Vérifiés par commande :** `npm audit`, `npm outdated`, `git ls-files --eol` (CRLF), `git ls-files` (artefacts versionnés), couverture lint `.mjs`/`.cjs`, usage audio, absence de `dangerouslySetInnerHTML`.

---

## 1. Tableau de synthèse (trié par sévérité)

| ID | Sévérité | Catégorie | Fichier:ligne | Résumé |
|---|---|---|---|---|
| **L3‑B01** | BLOQUANT | Outillage/Lint | `eslint.config.js` + src | `npx eslint .` échoue (exit 1) — 48 erreurs réelles, dont 26 dans `sim-10-profils.js` (périmètre) |
| **L3‑B02** | BLOQUANT | Outillage/Test | `economy.golden.test.js.snap:11` | `npx vitest run` échoue (exit 1) — snapshot golden fige un float exact qui dérive de ~1 ULP |
| **L3‑B03** | BLOQUANT | Config | `eslint.config.js` / vitest | Lint & tests ratissent `.claude/worktrees/**` → +68 erreurs & +1 échec **fantômes**, portes non fiables |
| **L3‑M01** | MAJEUR | Docs | `balance-summary.md:44‑57` | Catalogue des Mythes entièrement périmé — 13 objectifs faux (confirmés vs code) |
| **L3‑M02** | MAJEUR | i18n | `chronicleEvaluator.js:32‑50,191,200` | 20 libellés joueur (catégories + « Campement/Chronique/An ») en FR nu, hors `{fr,en}` |
| **L3‑M03** | MAJEUR | i18n | `src/game/core/events.js` | Dialogue d'effondrement + épitaphes en FR nu (10), n'importe pas i18n |
| **L3‑M04** | MAJEUR | Config/Lint | `eslint.config.js:9` | ESLint ne lint que `.js/.jsx` → 65 scripts `.mjs/.cjs` + `main.cjs` **jamais lintés** |
| **L3‑M05** | MAJEUR | Hygiène/CI | (absence) `.github/` | Aucune CI — le finding v0.4 est toujours ouvert ; propositions §B.2 |
| **L3‑m01** | MINEUR | i18n/Contenu | `myths.js:764` | Nom court par strip de préfixe **cassé en FR** pour Chaos/Phénix/Atrides (bug d'affichage Ragnarok live) |
| **L3‑m02** | MINEUR | i18n | `actions/myths.js:175` | Charpente `L'Age ${article} ${word}` figée FR (→ « L'Age of Barns » en EN) + typo « L'Age » |
| **L3‑m03** | MINEUR | i18n | `myths.js:522,672` | `.toLocaleString()` suit la locale runtime, découplée du sélecteur de langue |
| **L3‑m04** | MINEUR | i18n | 6 fichiers UI (voir détail) | ~12 `aria-label` + petits littéraux FR non passés par `tr()` |
| **L3‑m05** | MINEUR | Hygiène | racine + `public/pixelart/compare.html` | 5 dumps de simulation `.tsv` + `compare.html` versionnés (artefacts générés) |
| **L3‑m06** | MINEUR | Sécurité/Electron | `main.cjs:39` / `index.html` | `app://` : traversal (decode après join), pas de CSP, pas de garde de navigation |
| **L3‑m07** | MINEUR | Config | `eslint.config.js:8` | `sim-10-profils.js` absent de `globalIgnores` (incohérent avec ses jumeaux) → 26 erreurs |
| **L3‑m08** | MINEUR | Docs | 6 docs (voir détail) | Journaux/revues périmés (arbre 5→4 branches, « mechanics.js fichier‑dieu » résolu, Decimal migré…) |
| **L3‑m09** | MINEUR | Hygiène | `package.json` | Dépendances mineures en retard (electron 42→43, vite/eslint/vitest patchs) |
| **L3‑n01** | NETTOYAGE | Hygiène | `__opts-full.patch`, `__opts-mine.patch` | Fichiers de diff résiduels à la racine (non versionnés, encombrants) |
| **L3‑n02** | NETTOYAGE | i18n | `DebugDialog.jsx:38‑71` | 13 chaînes FR nues — outil DEV, à traduire seulement si exposé |
| **L3‑n03** | NETTOYAGE | Docs | `README.md` | Mince : ne mentionne ni `npm test` ni Electron/`dist-win` |
| **L3‑n04** | NETTOYAGE | Tests/i18n | `chronicle.test.js:34` | Test couplé au littéral FR « Claude, gardien du feu » + à l'ordre localizeData/lang |

**Constats sains vérifiés :** `npm audit` = **0 vulnérabilité** · **aucun CRLF résiduel** (`.gitattributes` correct) · `dist/` non versionné · Electron `contextIsolation:true`/`nodeIntegration:false` · aucun `dangerouslySetInnerHTML` (surface XSS quasi nulle) · noms du casting **sans dépendance de code** (§A.4) · nombres **locale‑neutres** par conception (§A.3).

---

## A. Préparation i18n (priorité du run)

### A.0 État réel : la migration est ~95 % faite

Contrairement à ce que suggérait le brief (« reste ~6000 lignes à traduire »), l'approche **« bilingue sur place »** (`i18n.js` : `tr()` / `t()` / `localizeData()`) est **déjà déployée sur ~40 fichiers**. Les champs texte sont des objets `{ fr, en }` aplatis au chargement par `localizeData()`. **Le Fil (les ~208 Échos) est intégralement migré.**

- **Corpus joueur estimé :** ~**18 300 mots** répartis sur **54 fichiers**.
- **Restes en FR nu (joueur) :** ~**47 strings** sur **9 fichiers** + **13** dans un outil dev.
- **Unités `{fr,en}` déjà en place rien que dans le Fil :** ~**488** paires.

### A.1 Inventaire exhaustif (par fichier)

Légende : `i18n` = importe `i18n.js` · `statut` = full / partial / none / n/a (pas de texte joueur) · `pend` = strings joueur encore en FR nu · `traps` = motifs à risque relevés (bruts, avant tri).

#### Données narratives — cœur (`src/game/data/`, `src/game/core/`)

| Fichier | i18n | statut | entrées | pend | mots~ | traps |
|---|---|---|---|---|---|---|
| `chronicle/p1.js` | – | full | 29 | 0 | 1000 | 0 |
| `chronicle/p2.js` | – | full | 29 | 0 | 1020 | 0 |
| `chronicle/p3.js` | – | full | 29 | 0 | 1070 | 0 |
| `chronicle/p4.js` | – | full | 30 | 0 | 1080 | 0 |
| `chronicle/p5.js` | – | full | 30 | 0 | 1020 | 0 |
| `chronicle/p6.js` | – | full | 30 | 0 | 1020 | 0 |
| `chronicle/p7.js` | – | full | 31 | 0 | 1020 | 0 |
| `buildings.js` | ✓ | full | 38 | 0 | 525 | 0 |
| `upgrades.js` | ✓ | full | 68 | 0 | 1800 | 2* |
| `myths.js` | ✓ | **partial** | 14 | 2 | 1700 | 10 |
| `olympus.js` | ✓ | full | 4 | 0 | 142 | 0 |
| `boons.js` | ✓ | full | 5 | 0 | 64 | 5* |
| `world.js` | ✓ | full | 88 | 0 | 2550 | 5* |
| `eraThemes.js` | ✓ | full | 10 | 0 | 33 | 0 |
| `activeRuins.js` | ✓ | full | 10 | 0 | 120 | 4* |
| `regulationActions.js` | ✓ | full | 20 | 0 | 520 | 0 |
| `epitaphs.js` | ✓ | full | 14 | 0 | 100 | 2 |
| `idleNarrative.js` | ✓ | full | 27 | 0 | 175 | 4 |
| `chronicleArticles.js` | ✓ | full (agrégateur) | 0 | 0 | 0 | 0 |
| `chronicleEvaluator.js` | ✗ | **partial** | 17 | **20** | 20 | 4 |
| `events.js` | ✗ | **none** | 11 | **10** | 110 | 9 |
| `worldEffects.js` | ✗ | n/a | 0 | 0 | 0 | 0 |
| `pixelSplash.js` | ✗ | n/a | 0 | 0 | 0 | 0 |

`*` = traps quasi tous **réfutés** après vérification adversariale (motif d'interpolation correct, cf. §A.3).

#### Interface (`src/components/`)

| Fichier | i18n | statut | entrées | pend | mots~ | traps |
|---|---|---|---|---|---|---|
| `dialogs/ChoiceDialog.jsx` | ✓ | full | 4 | 0 | 6 | 0 |
| `dialogs/ImportDialog.jsx` | ✓ | full | 6 | 0 | 22 | 0 |
| `dialogs/OptionsDialog.jsx` | ✓ | **partial** | 43 | **6** | 115 | 5 |
| `dialogs/DebugDialog.jsx` | ✗ | none (DEV) | 13 | **13** | 0 | 13 |
| `ui/BuildingShop.jsx` | ✓ | **partial** | 10 | **1** | 30 | 3 |
| `ui/BuyToolbar.jsx` | ✓ | full | 2 | 0 | 3 | 0 |
| `ui/ChronicleTicker.jsx` | ✓ | full | 4 | 0 | 12 | 1 |
| `ui/CityStatusPanel.jsx` | ✓ | **partial** | 16 | **1** | 45 | 4 |
| `ui/CrisisActionBar.jsx` | ✓ | full | 45 | 0 | 180 | 8 |
| `ui/CrisisDoctrinePanel.jsx` | ✓ | full | 24 | 0 | 95 | 0 |
| `ui/PurchaseRow.jsx` | ✓ | full | 14 | 0 | 65 | 8 |
| `ui/Topbar.jsx` | ✓ | **partial** | 22 | **1** | 75 | 6 |
| `ui/journalThemes.js` | ✓ | full | 21 | 0 | 45 | 0 |
| `ui/{HudPanel,OdometerNumber,OutcomeFloatLayer,PixelIcon,RollingNumber}.jsx`, `resourceIcons.js` | ✗ | n/a | – | 0 | 0 | 1 |
| `views/CityView.jsx` | ✓ | full | 113 | 0 | 950 | 4 |
| `views/ChronicleView.jsx` | ✓ | full | 44 | 0 | 340 | 2 |
| `views/HeritageView.jsx` | ✓ | **partial** | 48 | **2** | 420 | 4 |
| `views/MythsView.jsx` | ✓ | full | 47 | 0 | 400 | 4 |
| `views/PrestigeView.jsx` | ✓ | full | 40 | 0 | 330 | 2 |
| `views/RuinsTreePixel.jsx` | ✓ | **partial** | 18 | **4** | 70 | 5 |
| `views/RuinsView.jsx`, `ruinsTree/{NodeTooltip,TreeNode}.jsx`, `ruinsTree/{nodeIcon,anchors}.js` | ✗ | n/a | – | 0 | 0 | 0 |
| `views/ruinsTree/branchTheme.js` | ✓ | full | 4 | 0 | 8 | 1 |

**Total : ~18 300 mots joueur · 60 strings FR nues (dont 13 dev‑only) · 116 traps bruts → 72 de type concat/nombre/pluriel, dont 16 vérifiés adversarialement.**

### A.2 Ce qu'il reste à traduire (les 9 fichiers `partial`/`none`)

| Fichier | Restes FR nus | Visibilité joueur |
|---|---|---|
| **`chronicleEvaluator.js`** | 17 `CATEGORY_LABELS` (l.32‑50) + « Campement » (l.191) + « Chronique » (l.201) + préfixe « An » (l.200) | **Haute** — le badge de catégorie + la date s'affichent à **chaque dépêche** (`ChronicleTicker.jsx:75`) → **L3‑M02** |
| **`events.js`** | 4 fragments d'épitaphe + 6 champs du dialogue d'effondrement | **Haute** — l'écran d'effondrement est un moment fort → **L3‑M03** |
| `myths.js` | `ragnarokSummary` (strip, l.764) + label Ragnarok (l.800) + 1 jsx‑literal (l.475) | Moyenne (Ragnarok) → **L3‑m01** |
| `OptionsDialog.jsx` | « Actif/Inactif » ×4 (l.393, l.428) + noms de langue « Français/English » (l.219/226) | Moyenne — « Actif/Inactif » est un **vrai oubli** (incohérent avec `tr()` l.325) |
| `BuildingShop.jsx` | `aria-label` (l.130) | Faible (a11y) |
| `CityStatusPanel.jsx` | `aria-label` (l.72) + unités de temps de `fmtSecs`/`fmtCycleTime` | Moyenne (tooltip Usure) |
| `Topbar.jsx` | `aria-label` (l.124) + suffixe « · cap » (l.153) | Faible |
| `HeritageView.jsx` | `<h2>Grand Reset</h2>` (l.249), `<span>Grand Resets</span>` (l.268) | FR==EN → cosmétique |
| `RuinsTreePixel.jsx` | titre « Mémoire des Ruines » (l.487) + 3 `aria-label` zoom (l.490/494/498) | Faible/moyenne |
| `DebugDialog.jsx` | 13 littéraux (l.58‑71) + 2 `log()` | **Nulle** (outil dev) → **L3‑n02** |

→ regroupés en findings **L3‑M02**, **L3‑M03**, **L3‑m04**, **L3‑n02**.

### A.3 Interpolations & nombres Decimal — le « piège classique » (majoritairement DÉJÀ résolu)

Le motif d'interpolation en place est **robuste** et répond directement à la préoccupation « nombres Decimal formatés » :

```js
// CityStatusPanel.jsx:93‑94 — deux gabarits complets, un formateur partagé
fr: `Prochain palier sédiment : +${nextPalier.bonus}% dans ${fmtSecs(nextPalierInSecs)}`,
en: `Next sediment tier: +${nextPalier.bonus}% in ${fmtSecs(nextPalierInSecs)}`
```

Deux propriétés le rendent sûr :
1. **Un gabarit complet et indépendant par langue** → l'ordre des mots est libre dans chaque langue (pas de concaténation de fragments).
2. **Le nombre est formaté une seule fois par un helper centralisé et LOCALE‑NEUTRE** : `fmt()` (`utils.js:64`) fait `toFixed()` + suffixes universels `K/M/B/…` — **jamais** de séparateur localisé. Un `Decimal` est toujours converti en **string** *avant* interpolation (`fmt(value)`), donc pas de `Decimal` collé au texte, pas de `[object Object]`.

**Vérification adversariale (16 traps sur 72) :** la grande majorité des `number-interp` relevés (`boons.js:27‑59`, objectifs de `myths`, `activeRuins.js:23`, `world.js:298`) sont **RÉFUTÉS comme bloquants** — c'est le motif *correct*. Les seuls **CONFIRMÉS bloquants** :

- **`myths.js:159` + `actions/myths.js:175`** *(concat — CONFIRMÉ)* → **L3‑m02**.
- **`myths.js:764`** *(concat — CONFIRMÉ, + bug FR live)* → **L3‑m01**.
- **`myths.js:522/672` `.toLocaleString()`** *(nombre — CONFIRMÉ mineur)* → **L3‑m03**.

> ⚠️ **Nuance décisive pour l'architecture** : ces `${}` symétriques sont sûrs *en place*, mais **incopiables tels quels dans un JSON plat**. À eux seuls les Mythes comptent **~93 interpolations** `${}`. Externaliser vers `fr.json/en.json` **exigerait** de convertir chacune en placeholder (ICU) + couche de formatage — un **coût net**, pas un gain. Cela oriente la recommandation §A.5.

### A.4 Casting récurrent des Échos — aucune dépendance de code (vérifié)

Question du brief : un code dépend‑il des prénoms en dur (Claude, Garin, Nessa, Renaud, Édith, Raphaël, Doran, Khael, Aldric) d'une façon qui casserait à l'externalisation ? **Réponse : non côté gameplay.** (grep sur les 7 fichiers du Fil + `src/`)

- **`chronicleEvaluator.js:198`** passe `author` en **passe‑plat** (`author: chosenArticle.author`) — aucune comparaison à un littéral.
- **`state.js:737`** tronque (`author.slice(0,100)`) — aucune dépendance de valeur.
- **`cityNaming.js:8‑11`** contient bien « Aldric/Garin/Renaud/Nessa/Doran/Khael/Édith » **mais** c'est un **pool indépendant de prénoms médiévaux** pour le générateur de noms de cité — **coïncidence**, pas une référence au casting. Traduire les auteurs n'y touche pas.
- **Seul couplage réel : un TEST.** `chronicle.test.js:34` filtre `typeof author === "string" && author.startsWith("Claude")` puis assère `["Claude, gardien du feu"]`. Il ne « marche » que parce que `localizeData()` a aplati l'auteur en **string FR** avant le test. Fragile à l'externalisation (dépend de l'ordre localizeData + de `lang=fr`) → **L3‑n04** (découpler : assérer sur `article.id` ou sur `author.fr`).

Les prénoms sont des **noms propres** → à conserver **identiques** en FR et EN dans un dictionnaire externe.

### A.5 Architecture d'externalisation — recommandation

**Recommandation : conserver l'approche « bilingue sur place », NE PAS basculer vers `fr.json/en.json` maintenant.** Justification factuelle : (a) ~95 % du corpus est déjà `{fr,en}` ; (b) les ~93+ interpolations de Mythes (et les gabarits UI) sont sûres en place mais nécessiteraient une réécriture ICU pour un JSON plat ; (c) les nombres sont déjà locale‑neutres. Un passage JSON aujourd'hui = **régression d'ergonomie** pour un gain nul tant qu'aucun outil de traduction externe (Crowdin/Weblate) n'est requis.

**Plan « finir en place » (recommandé, effort S/M) :**
1. **Migrer les 3 poches restantes** : `chronicleEvaluator.js` (importer `tr`, passer `CATEGORY_LABELS`/« Campement »/« Chronique »/« An » en `{fr,en}`), `events.js` (idem), les ~12 `aria-label`/petits littéraux (§A.2).
2. **Corriger les 2 concaténations bloquantes** (**L3‑m01/m02**) : intégrer la charpente dans le `{fr,en}` (`{fr:"L'Âge ${a} ${w}", en:"The Age ${a} ${w}"}`), et remplacer le strip de préfixe par un champ explicite `shortName:{fr,en}`.
3. **Ajouter une porte de test** : un test qui parcourt tous les exports de données et **échoue si une unité `{fr}` n'a pas son `en`** (attrape les migrations partielles et les futurs oublis). Wiring : réutiliser `isTransUnit`/`localizeData` de `i18n.js`.
4. **Remplacer les 2 `.toLocaleString()`** par `fmt()` (cohérence langue).

**Si/quand un TMS externe devient nécessaire (effort L, à ne PAS faire maintenant) — le schéma demandé :**

```
locales/
  fr/
    common.json            # dict UI (boutons, onglets, aria-labels) ← i18n.js UI{}
    buildings.json         # clé = building.id
    upgrades.json          # clé = upgrade.id
    myths.json             # clé = myth.id ; sous-clés name/description/objectif/...
    world.json             # ères ; clé = era index/id
    ruins.json  regulation.json  boons.json  epitaphs.json  events.json
    chronicle/
      p1.json … p7.json    # UN fichier par période (déjà la structure du code) ; clé = article.id
  en/ (miroir strict des mêmes clés)
```

- **Schéma de clés** : réutiliser les **`id` existants** comme clé‑feuille (stable, greppable, survit au réordonnancement) — jamais l'index de tableau.
- **Interpolations** : ICU MessageFormat — `"boons.caravan": "Une caravane… : +{amount} trésor."`, où `{amount}` reçoit **une string déjà formatée par `fmt()`** (garder la frontière nombre→string au même endroit qu'aujourd'hui). Ne jamais passer un `Decimal` brut au message.
- **Pluriels** : ICU `plural` uniquement pour la poignée de noms comptables (`{count, plural, one {# habitant} other {# habitants}}` — habitants, bâtiments, cycles, migrations). Aujourd'hui `boons.js:51` produit « +1 habitants » (pluriel forcé) — c'est le seul cas à corriger.
- **Échos / le Fil** : **fichiers séparés par période = OUI** (le code l'est déjà : `chronicle/p1..p7`). En JSON, mirroir `locales/<lang>/chronicle/pN.json` clé‑par‑`article.id`. Chargement anticipé OK (~7 k mots ×2 langues ≈ quelques dizaines de Ko) ; lazy‑load par `getPeriod()` seulement si le poids du bundle devient un souci.
- **Casting** : noms propres identiques FR/EN ; découpler `chronicle.test.js` (L3‑n04).
- **Migration** : un codemod peut extraire les `{fr,en}` en place vers ce schéma automatiquement le jour venu — d'où l'intérêt de **rester en place** d'ici là.

---

## B. Hygiène de dépôt

### B.1 Constats

- ✅ **`.gitattributes` présent et correct** (`* text=auto eol=lf`, `.bat/.cmd` en CRLF, binaires protégés). **Aucun CRLF résiduel** dans les fichiers texte suivis (`git ls-files --eol`).
- ✅ **`npm audit` = 0 vulnérabilité.**
- ✅ **`dist/` non versionné** ; le seul gros binaire suivi est `public/audio/ludum-dare-30-05.ogg` (4,2 Mo) — **légitime** (musique de fond, chargée `main.js:432`), déjà compressé (ogg), pas un finding.
- ❌ **Aucune CI** → **L3‑M05**.
- ⚠️ **Artefacts générés versionnés** → **L3‑m05**.
- ⚠️ **Fichiers résiduels à la racine** → **L3‑n01**.
- ⚠️ **Dépendances mineures en retard** → **L3‑m09**.

### B.2 Proposition de CI minimale (finding L3‑M05)

> ⚠️ Ce workflow **ne passera au vert qu'après** correction de **L3‑B01/B02/B03** (lint & tests actuellement rouges). Le faire dans cet ordre : réparer les portes, *puis* activer la CI.

`.github/workflows/ci.yml` :
```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm test          # vitest run
      - run: npm run build
```
Cache npm intégré via `setup-node cache: npm`. Node 20 = LTS aligné sur Vite 8 / Vitest 4.

### B.3 Détails

**L3‑m05 — artefacts générés versionnés (MINEUR, effort S).** `git ls-files` liste comme **suivis** : `audit-check.tsv`, `run10-final.tsv`, `gr11-pass.tsv`, `milestones-live.tsv`, `sim-10-profils-milestones.tsv` (dumps de simulation) et `public/pixelart/compare.html` (page de comparaison dev). Le `.gitignore` ignore déjà `sim_results.json`/`simulation-report.html` mais **pas** ces `.tsv`. *Impact dev :* bruit de diff, dumps qui périment. *Correction :* `git rm --cached` + ajouter `*.tsv` (racine) et `public/pixelart/compare.html` au `.gitignore`.

**L3‑n01 — patches résiduels (NETTOYAGE, effort S).** `__opts-full.patch` et `__opts-mine.patch` traînent à la racine (non versionnés, statut `??`). Reliquats d'un merge/diff. *Correction :* supprimer, ou les ignorer si un flux les régénère.

**L3‑m09 — dépendances (MINEUR, effort S).** `npm outdated` : `electron 42.4→43.1` (majeure), `vite 8.0.16→8.1.4`, `eslint 10.3→10.7`, `vitest 4.1.8→4.1.10`, `adm-zip 0.5→0.6` (majeure), `@vitejs/plugin-react 6.0.2→6.0.3`. Rien de sécuritaire (audit propre). *Correction :* bump patchs sans risque ; valider electron 43 / adm‑zip 0.6 (majeures) séparément.

---

## C. Qualité des docs

### C.1 L3‑M01 — `balance-summary.md` : catalogue des Mythes entièrement périmé (MAJEUR, effort M)

**Problème :** le tableau « Catalogue des Mythes » (l.44‑57) décrit les **anciens objectifs à seuil absolu**, tous refondus depuis en objectifs relatifs/chronométrés. **13 écarts, tous confirmés adversarialement + spot‑checkés à la main.**

**Preuve (échantillon vérifié) :**

| Doc (`balance-summary.md`) | Code (aujourd'hui) |
|---|---|
| L44 Chaos : « Atteindre **50 Ruines** sans bonus » | `myths.js:26` `CHAOS_RAW_RUIN_TARGET = 12` → « Gagner **12** Ruines BRUTES en un cycle » (l.238) |
| L45 Prométhée : « **500 habitants** avant la Rupture » | `myths.js:125` `PROMETHEE_POP_MULT = 100` → « croître la pop **×100** » |
| L49 Sisyphe : « **50 000** de Trésor » | `myths.js:59` `SISYPHE_BUILDING_TARGET = 180` → « **180 bâtiments** » |
| L50 Babel : « **x5** (~33 bâtiments) » | `myths.js:81‑82` base 1.05, `BABEL_MULT_TARGET = 30` → « **x30** (~70 bât.) » |
| L51/L53/L55 Or/Icare/Atrides | constantes marquées **« (obsolète — remplacé par le gain relatif) »** dans le code |
| L54 Phénix : « Sur 20 cycles, **400 Ruines** » | `myths.js:90‑98` refondu en « **Renaissances chronométrées** » (`PHENIX_RENAISSANCE_TARGET=3`) |
| L57 Ragnarok : « **1 000 000 de puissance** » | `myths.js:31,35` = tenir **90 s** ET surgir la puissance **×3** |

*Impact dev :* un doc de référence d'équilibrage **activement trompeur** — quiconque s'y fie mal‑règle les Mythes. *Correction :* régénérer le tableau depuis `myths.js`/`activeRuins.js`, ou marquer le doc « instantané obsolète — voir `myths.js` ». **Idéalement, ce tableau devrait être généré par un script** (il l'est peut‑être déjà à l'origine) pour ne plus dériver.

### C.2 L3‑m08 — journaux & revues périmés (MINEUR/NETTOYAGE, effort S)

Tous confirmés (grep des symboles cités) :

- **`analyse-arbres-de-ruines.md`, `REFONTE-arbre-ruines-skill-tree.md`, `brief-arbre-evolution-ux.md`** décrivent l'arbre de ruines en **5 branches / 80‑100 nœuds / rendu radial SVG**. Réalité : **4 branches ~9 nœuds** + rendu **pixel‑art** (`upgrades.js:578‑642`, `RuinsView.jsx:6`). *(MINEUR pour `analyse-` qui parle au présent ; NETTOYAGE pour les briefs.)*
- **`Revue-de-code-CE-0.3.md` (l.140) & `-0.4.md` (l.87)** : « `mechanics.js` = fichier‑dieu (1 365 / 1 413 lignes) ». Réalité : **`mechanics.js` = baril de 37 lignes** réexportant `mechanics/{shared,production,cost,crisis-cost,prestige,upgrades}`. Le principal reproche des deux revues est **déjà résolu** → à cocher/archiver.
- **`docs/PHASE3-DECIMAL.md`** : « brief de passation » pour **migrer** vers Decimal (travail futur). Réalité : **fait** (`break_infinity.js` dans `package.json:33`, `num.js` = frontière) → archiver.
- **`pacing-profiles.md`** : noms d'ères « Feux dispersés / Abris saisonniers / Clan… ». Réalité : « **Grand Feu / Abris / Clans / Maîtrise du bois** » (`world.js:36‑39`).
- **`bench-legit-formules.md`** : recommande la variante « prime‑douce » de `legitimacyGain` (baseExp 0.55 / cycleDiv 16 …). La formule **livrée** diffère (`prestige.js:196‑201`). *NETTOYAGE :* doc de recommandation non suivie telle quelle.

*Correction :* déplacer les journaux clos vers `docs/archive/` ; corriger les 2 revues (cocher « mechanics.js éclaté ») ; corriger les noms d'ères de `pacing-profiles.md`.

> `course-gr1-profils.md` : **non signalé** (ni le cross‑check dédié ni la passe de fraîcheur n'ont trouvé d'écart) — présumé encore cohérent, mais non re‑simulé exhaustivement dans ce run.

### C.3 L3‑n03 — README mince (NETTOYAGE, effort S)

`README.md` liste `dev/build/lint` mais **omet `npm test`** (vitest) et **toute mention Electron** (`npm run electron`, `dist-win`, `main.cjs`). *Correction :* ajouter section Tests + Desktop/Electron.

---

## D. Configuration

### D.1 L3‑B01 — le lint échoue (BLOQUANT, effort M)

`npx eslint .` → **exit 1**. Après exclusion des copies `.claude/` (cf. L3‑B03), **48 erreurs réelles** :

- **En périmètre (outillage) :** `sim-10-profils.js` — **26 erreurs** : `global`/`process`/`setImmediate` non définis (globals Node) + `no-unused-vars`. Cause : lint sous globals *navigateur* (voir **L3‑m07**).
- Hors périmètre (lots 1‑2, mais bloquent la porte) : `OdometerNumber.jsx`/`RollingNumber.jsx` — `react-hooks/refs` « Cannot access ref during render » (8) ; fichiers carte `buildingShapes/cityEngineSprites/iso/isoRenderer/pixelBridge` — `no-unused-vars` (14).

*Impact :* aucune CI verte possible ; la règle `react-hooks/refs` signale un vrai smell React (lecture/écriture de `ref.current` pendant le rendu). *Correction :* traiter `sim-10-profils.js` via L3‑m07 ; nettoyer les `no-unused-vars` (souvent `--fix`) ; corriger les accès `ref` en rendu dans les 2 composants (lot 1).

### D.2 L3‑B02 — un test échoue (BLOQUANT, effort S)

`npx vitest run` → **exit 1**. Échec réel unique : `economy.golden.test.js > buildingBatchCost > foragers x25`.

```
- Expected  "food": Decimal(130380.06209513952)   ← snapshot committé (.snap:11)
+ Received   "food": Decimal(130380.06209513955)   ← calcul actuel
```

**Côté FLOAT de la frontière** : dérive de ~1 ULP de la mantisse float64 (série géométrique dans `cost.js`). Le code économique n'a pas changé sur cette branche → il s'agit d'une **non‑déterminisme float inter‑environnement** (le snapshot a été enregistré sous un autre runtime). *Impact :* golden‑master **fragile/non portable** — casse la CI sur une autre machine/version de Node. *Correction :* soit re‑enregistrer le snapshot, soit — mieux — **assouplir le golden** : comparer les `Decimal` avec une tolérance relative (ex. `expect(...).toBeCloseTo` sur `.toNumber()`, ou arrondi à N chiffres significatifs avant `toMatchSnapshot`) plutôt qu'une égalité de string à pleine précision.

### D.3 L3‑B03 — les portes ratissent `.claude/worktrees/**` (BLOQUANT, effort S)

Ni ESLint (`globalIgnores`) ni Vitest (`test.exclude`) n'excluent `.claude/`. Résultat : deux worktrees de l'agent (`quizzical-payne-f6808f`, `serene-satoshi-33e13c`) sont **relintés/retestés en entier** →
- lint : **117 problèmes bruts vs 48 réels** (+68 fantômes, ×2 copies) ;
- tests : **2 fichiers échoués vs 1 réel** (l'échec golden dupliqué depuis un worktree).

*Impact :* portes de qualité **non fiables et non déterministes** (dépendent des worktrees présents), CI ingérable. *Correction :* ajouter `.claude` à `globalIgnores` d'ESLint **et** définir `test: { exclude: [...configDefaults.exclude, '**/.claude/**'] }` dans `vite.config.js`. (Le `.gitignore` ignore déjà `.claude/` pour git, mais lint/vitest ont leurs propres listes.)

### D.4 L3‑M04 — 65 scripts `.mjs/.cjs` + `main.cjs` jamais lintés (MAJEUR, effort M)

Le seul bloc porteur de règles d'`eslint.config.js` est scopé `files: ['**/*.{js,jsx}']`. Les `.mjs`/`.cjs` ne correspondent à **aucune** config fournissant des règles. **Vérifié empiriquement :** `npx eslint scripts/fetchAgents.mjs` et `npx eslint main.cjs` → **exit 0, zéro finding**, alors qu'ils utilisent massivement `require`/`process`/`__dirname` (qui seraient `no-undef` sous les globals navigateur). **65 fichiers `scripts/*.{mjs,cjs}` + `main.cjs` sont hors couverture.** *Impact :* aucun garde‑fou sur l'outillage ni sur le process principal Electron. *Correction :* ajouter un bloc `{ files: ['**/*.{mjs,cjs}', 'main.cjs', 'scripts/**'], languageOptions: { globals: globals.node }, extends: [js.configs.recommended] }`.

### D.5 L3‑m07 — `sim-10-profils.js` absent de `globalIgnores` (MINEUR, effort S)

`eslint.config.js:8` ignore `simulate-game.js`, `simulate-ce.js`, `sim-idle-*.js`, `bench-myths.js`, `bench-rupture.js` — mais **pas** `sim-10-profils.js` (script de simulation Node jumeau). D'où ses 26 erreurs (L3‑B01). *Correction :* soit l'ajouter à `globalIgnores`, soit — mieux — lui donner les globals Node via le bloc `.mjs/.cjs` de L3‑M04 (les scripts de sim méritent d'être lintés, pas ignorés).

### D.6 L3‑m06 — surface de sécurité Electron (MINEUR, effort M)

**Base saine :** `main.cjs:27‑28` `contextIsolation: true`, `nodeIntegration: false` ; `sandbox` par défaut à `true` (Electron ≥ 20) ; protocole `app://` `standard+secure+supportFetchAPI`. **Surface XSS quasi nulle** (aucun `dangerouslySetInnerHTML`/`innerHTML`/`eval` dans `src/`, React échappe par défaut) — ce qui **abaisse** la criticité des points ci‑dessous à un durcissement défensif :

1. **Traversal `app://`** (`main.cjs:39‑41`) : `pathname = decodeURIComponent(url.pathname)` **puis** `path.join(__dirname, "dist", pathname)`. Les `..` **percent‑encodés** (`%2e%2e`) survivent à la normalisation d'URL, puis `decodeURIComponent` les réintroduit **après** — `path.join` peut alors sortir de `dist/`. *Correction :* résoudre puis vérifier que le chemin final reste sous `dist/` (`path.resolve(...).startsWith(distRoot)`), sinon 404.
2. **Pas de CSP** (`index.html`) : l'app charge FontAwesome + Google Fonts depuis CDN. *Correction :* ajouter un `<meta http-equiv="Content-Security-Policy">` (ou en‑tête via le handler `app://`) restreignant `default-src 'self'` + les origines de polices.
3. **Pas de garde de navigation** dans `main.cjs` : ni `setWindowOpenHandler` ni `will-navigate`. *Correction :* bloquer/filtrer les navigations et `window.open` sortants.

*Impact :* faible en pratique (jeu local mono‑utilisateur, pas d'entrée HTML non échappée) — durcissement, pas urgence.

### D.7 Constats config sains

- **Vite** (`vite.config.js`) : `base: './'` (correct pour `app://` Electron). Pas de sourcemaps en prod (défaut = OK). Les 2 plugins custom (`previewShotPlugin`, `mapFullReloadPlugin`) sont bien `apply: 'serve'` → **aucun effet en build**. *Note (non‑finding) :* le build produit `jsx-runtime` (415 Ko) et `CityView` (412 Ko) — chunks lourds ; un `build.rollupOptions.output.manualChunks` pourrait scinder le vendor, mais rien de bloquant (gzip ~144/122 Ko).
- **ESLint** : aucune règle largement **désactivée** qui masquerait des bugs (au contraire, `react-hooks`/`react-refresh` actifs remontent de vrais problèmes). Le seul angle mort est la **couverture de fichiers** (L3‑M04), pas des règles éteintes.

---

## E. Top actions à fort ROI (max 5)

1. **Rendre les portes vertes & déterministes** *(effort S+S+S)* — exclure `.claude/**` d'ESLint & Vitest (**L3‑B03**), assouplir le golden float `foragers x25` (**L3‑B02**), corriger/ignorer proprement `sim-10-profils.js` (**L3‑m07**). **Débloque toute CI.**
2. **Activer la CI GitHub Actions** *(effort S)* — le workflow §B.2, une fois #1 fait. Empêche la re‑dérive des docs/portes (finding v0.4 enfin clos).
3. **Terminer l'i18n des 3 poches à haute visibilité** *(effort S/M)* — `chronicleEvaluator.js` (badges de catégorie, **L3‑M02**) + `events.js` (écran d'effondrement, **L3‑M03**) + un **test « fr sans en »** anti‑régression. Amène le corpus à ~100 % migré.
4. **Corriger `balance-summary.md`** *(effort M)* — le catalogue des Mythes est activement trompeur (**L3‑M01**) ; régénérer depuis le code (idéalement par script) et archiver les journaux clos (**L3‑m08**).
5. **Corriger les 2 bugs de concaténation Mythes** *(effort S)* — `myths.js:764` (nom court cassé en FR pour Chaos/Phénix/Atrides, **bug live**) et `actions/myths.js:175` (charpente « L'Age » figée FR + typo), tous deux i18n‑fragiles (**L3‑m01/m02**).

---

*Fin du rapport — Lot 3. Aucun fichier du dépôt n'a été modifié.*
