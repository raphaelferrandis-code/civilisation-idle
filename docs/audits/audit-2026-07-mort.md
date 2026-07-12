# Audit transversal — Code mort & Duplication (lot « mort »)

**Date :** 2026-07-12 · **Type :** audit lecture seule (aucune factorisation/suppression appliquée) · **Périmètre :** tout le dépôt (src/, scripts sim racine, public/, CSS).
**Méthode :** outillage automatique (knip / jscpd / depcheck) en *proposition*, puis **confirmation par grep de chaque résultat** avant inscription, puis **vérification adversariale** (refute-by-default sur tout « code mort »). Les faux positifs écartés sont un livrable à part entière (§5) : ils documentent les hooks dynamiques du projet.

> **Bilan en une ligne.** Peu de vrai code mort, beaucoup de **sur-exposition d'API** (exports internes), quelques **duplications de rendu** — et surtout : **la catégorie la plus dangereuse (divergence sim↔jeu) est PROPRE**. Aucun finding BLOQUANT/MAJEUR ; tout est NETTOYAGE ou MINEUR.

---

## 1. Outillage (proposition brute)

| Outil | Commande | Sortie brute | Après confirmation grep |
|---|---|---|---|
| **knip** | `npx knip` (re-run avec config d'entrées : `index.html`, `src/main.jsx`, 7 sims racine, `scripts/**`, tous les tests) | 105 « unused exports », **0 unused file, 0 unused dep** | **2 vrais morts + ~9 morts ciblés (map/data) + ~75 REDUNDANT_EXPORT + ~19 faux positifs** |
| **jscpd** | `npx jscpd src/ --min-tokens 30` | **166 clones**, 1290 lignes dupliquées (2.54 %), 67 cross-file / 99 intra-file | ~12 clusters réels (le reste = boilerplate de test / fortuit) |
| **depcheck** | `npx depcheck` | 0 unused *dependency*, 2 unused *devDependency* (`@types/react`, `@types/react-dom`) | Aucune dep runtime morte ; les `@types/*` = IntelliSense éditeur (faux positif, §5) |

**Note méthodologique importante — knip sans config = inexploitable.** Au premier passage (sans config), knip entrait par `main.cjs` (Electron) et déclarait **72 « unused files »** (tous les `scripts/**` + les 7 sims) : pur bruit. Avec une config d'entrées correcte (gardée **hors du dépôt**, dans le scratchpad), la liste tombe à **0 unused file / 0 unused dep**, ce qui confirme au passage que les sims/scripts **atteignent bien** le code et que `adm-zip`/`pngjs` sont utilisés. C'est le rappel que **ces outils proposent, ils ne tranchent pas.**

---

## 2. Tableau de synthèse (trié par sévérité)

### A. Code mort

| ID | Sévérité | Genre | Fichier:ligne | Résumé |
|---|---|---|---|---|
| **MORT‑01** | 🟡 MINEUR | dead-code | `game/core/actions/olympus.js:125` | `olympusUnlockedProfile()` : fonction morte, doublon du jumeau vivant `data/olympus.js:168` (= CORE‑20) |
| **MORT‑02** | 🟡 MINEUR | dead-code | `game/map/iso/projection.js:108` | `worldBoxToScreenBox()` exportée, **aucun appelant** |
| **MORT‑03** | 🟡 MINEUR | dead-code | `game/map/cityMapRuntime.js:169` | `cityMapTileScreen()` exportée (l.1412), jamais appelée |
| **MORT‑04** | 🟡 MINEUR | dead-code | `game/map/procedural/cityPlan.js:21` | `ANCHOR_KINDS` : const exportée (l.210), 0 usage interne/externe |
| **MORT‑05** | ⚪ NETTOYAGE | dead-code | `components/views/ruinsTree/branchTheme.js:9` | `BRANCH_ORDER` : ordre des branches jamais consommé |
| **MORT‑06** | ⚪ NETTOYAGE | dead-code | `game/map/plazaProps.js:95` | Trio mort : `blitPlazaPropCentered()` + `PLAZA_PROPS` + `PLAZA_ERAS` |
| **MORT‑07** | ⚪ NETTOYAGE | dead-code | `game/data/activeRuins.js:13` | `ANTEE_POWER_THRESHOLD` : const auto-étiquetée `(obsolète)`, 0 usage |
| **MORT‑08** | ⚪ NETTOYAGE | dead-code | `game/core/state.js:340` | `export let buyAmount` : miroir module write-only jamais relu (vérité = `state.buyAmount`) |
| **MORT‑09** | ⚪ NETTOYAGE | dead-asset | `public/pixelart/wonders/arc-t5-candidats/` | 3 cibles trackées+shippées jamais chargées (~447 K) : `arc-t5-candidats` (420 K), `palettes` (19 K), `agents/_orig/guild-prop-lodge.png` (8 K) |
| **MORT‑10** | ⚪ NETTOYAGE | redundant-export | `game/core/actions.js:3` | ~75 exports « inutilisés » = fonctions **vivantes en interne** au mot-clé `export` superflu (surface d'API trop large) |

### B. Duplication (par gravité décroissante)

| ID | Sévérité | Fichier:ligne | Résumé | Source de vérité | Effort |
|---|---|---|---|---|---|
| **DUP‑00** | ✅ (RAS) | — | **Sim↔jeu : AUCUNE logique recopiée en exécutable** (les 7 sims importent le vrai moteur) | `mechanics.js` | — |
| **DUP‑01** | 🟡 MINEUR | `components/views/HeritageView.jsx:273` | `Math.pow(2, grandResetCount)` figé sur 5 sites d'affichage (+ dialogues) hors moteur (= CORE‑21 étendu à l'UI) | `prestige.js:43` / `production.js:151` | M |
| **DUP‑02** | 🟡 MINEUR | `components/views/ChronicleView.jsx:135` | `2.4` (= `COLLAPSE_PREP_MAX`) codé en dur dans l'affichage au lieu d'importer la constante | `balance.js:26` | S |
| **DUP‑03** | 🟡 MINEUR | `scripts/buildPalette.mjs:71` | Les ancres HSL par époque de `EPOCHS` recopiées à la main dans le script de palette | `data/eraThemes.js:47` | M |
| **DUP‑04** | 🟡 MINEUR | `components/ui/OdometerNumber.jsx:55` | `OdometerNumber` ↔ `RollingNumber` : ~59 l. de moteur count-up identiques (les 2 sont vivants) | nouveau hook `useCountUp` | M |
| **DUP‑05** | 🟡 MINEUR | `game/map/pixelMedian.js:44` | `pixelMedian` = jumeau verbatim de `pixelBridge` (~80 l., 4 helpers de 9-slice) | `pixelBridge.js` | M‑L |
| **DUP‑06** | 🟡 MINEUR | `game/map/cityEngineSprites.js` (multi) | Peintres carte : halo `glow` inliné ~68×, silhouette humanoïde ×3, pas-sur-grille ×3, bateaux recopiés dans `isoRenderer`, préambule stade ~30× | helpers carte communs | S‑L |
| **DUP‑07** | ⚪ NETTOYAGE | `components/dialogs/DebugDialog.jsx:15` | Coquille `useEffect isOpen→showModal()/close()` recopiée dans 3 des 4 dialogues | futur `<DialogShell>` | M |
| **DUP‑08** | ⚪ NETTOYAGE | `game/map/pixelRiver.js:83` | Helpers fleuve redéfinis 3× (normale, ruban-clip) au lieu d'importer | `renderWorld.js:460` | S |
| **DUP‑09** | ⚪ NETTOYAGE | `game/core/utils.js:199` | PRNG mulberry32 recopié dans `seedManager.rngFrom` (copie **assumée** par commentaire) | `utils.js:198` `seededRng` | S |
| **DUP‑10** | ⚪ NETTOYAGE | `components/views/ChronicleView.jsx:19` | Formateur d'horloge `fmtDuration` ≈ `fmtCycleTime` (CityStatusPanel) | util commun | S |

### C. Vérifié PROPRE (livrables « rien à supprimer »)

| Domaine | Verdict |
|---|---|
| **Contenu Chronique** (échos p1–p7) | ✅ **Aucun écho mort** : chaque couple (période, `conditionType`) est déclenchable (mapping période→ère + seuils pop atteignables — détail §4) |
| **Flags & hooks debug** (~60 `window.__` / `globalThis.__`) | ✅ **Aucun flag mort** : tous lus par le rendu ou destinés à la console dev |
| **Migrations de save** (`MIGRATIONS`, `OLD_RUIN_NODE_COSTS`) | ✅ **Aucune migration morte** : `SAVE_KEY` inchangé → saves v0/v1/v2 encore chargeables |
| **Composants / JSX** | ✅ Aucun composant non monté, aucune branche JSX morte détectée |

---

## 3. Détail — Code mort

### MORT‑01 — 🟡 `olympusUnlockedProfile()` : fonction morte, doublon du jumeau vivant
`src/game/core/actions/olympus.js:125` (+ ré-export baril `actions.js:75`)
**Problème.** Lookup identique à `unlockedOlympusProfile(olympus)` (`data/olympus.js:168`) : renvoyer `OLYMPUS_PROFILES[unlockedProfile]` ou `null`. La version cœur n'a **aucun appelant** (app, 7 sims, scripts, tests) ; c'est le jumeau `data/` qui est câblé (`MythsView.jsx:59`).
**Preuve.** `rg olympusUnlockedProfile` → 2 lignes : def `olympus.js:125` + ré-export baril `actions.js:75`. Dans `olympus.js`, tous les `unlockedProfile` sont des accès **propriété** (`o.unlockedProfile`), jamais un appel. `rg unlockedOlympusProfile` → def `data/olympus.js:168` + `MythsView.jsx:21/59`.
**Impact.** Maintenance à deux endroits pour une seule règle ; un dev pourrait « corriger » la version morte. Zéro effet runtime.
**Correction (non appliquée).** Supprimer `olympus.js:125-128` + la ligne du baril `actions.js:75`. **Source de vérité : `data/olympus.js:168`.** **Effort S.**
> Recoupe **CORE‑20** de `audit-2026-07-core.md` (vérifié à la source ici, pas repris).

### MORT‑02 — 🟡 `worldBoxToScreenBox()` : exportée, aucun appelant
`src/game/map/iso/projection.js:108`
**Problème.** Fonction exportée (l.108-116) annoncée « pour le culling et le clamp », mais le culling réel passe par `visibleCellBounds`/`screenToWorld`. Aucun usage interne ni externe.
**Preuve.** `grep -rn worldBoxToScreenBox src/ *.js scripts/` → **1 seule ligne (la définition)**.
**Impact.** Code mort de projection. **Correction.** Supprimer la fonction. **Effort S.**

### MORT‑03 — 🟡 `cityMapTileScreen()` : définie + exportée, jamais appelée
`src/game/map/cityMapRuntime.js:169` (export `:1412`)
**Preuve.** `grep -rn cityMapTileScreen` → def `:169` + `export { … cityMapTileScreen }` `:1412`, **zéro appelant**. Ses jumelles `cityMapWorldAtScreen`/`cityMapScreenFromWorld` sont distinctes et ne l'appellent pas.
**Correction.** Supprimer la fonction + la retirer de l'export. **Effort S.**

### MORT‑04 — 🟡 `ANCHOR_KINDS` : const exportée jamais utilisée
`src/game/map/procedural/cityPlan.js:21` (export `:210`)
**Preuve.** `grep -n ANCHOR_KINDS cityPlan.js` → def `:21` + `export { ANCHOR_KINDS }` `:210` seulement. La logique d'ancres (l.68) utilise une **liste inline distincte**. 0 usage interne/externe → vrai mort (pas un simple export redondant).
**Correction.** Supprimer const + export. **Effort S.**

### MORT‑05 — ⚪ `BRANCH_ORDER` : ordre angulaire des branches jamais consommé
`src/components/views/ruinsTree/branchTheme.js:9`
**Preuve.** `grep -rn BRANCH_ORDER src/` → def `:9` seule ; l'ordre réel des 4 branches est établi ailleurs. (À côté, `BRANCH_THEME` `:11` est, lui, **REDUNDANT_EXPORT** : utilisé en interne, export superflu — voir MORT‑10.)
**Correction.** Supprimer `BRANCH_ORDER`. **Effort S.**

### MORT‑06 — ⚪ Trio mort dans `plazaProps.js`
`src/game/map/plazaProps.js:95` (`blitPlazaPropCentered`), `:167` (`PLAZA_PROPS`), `:168` (`PLAZA_ERAS`)
**Problème.** `blitPlazaPropCentered` est une variante « ancrage centré » de `blitPlazaProp` (l.79) **jamais appelée** ; `PLAZA_PROPS`/`PLAZA_ERAS` sont des tables documentaires jamais lues.
**Preuve.** `grep -rn 'blitPlazaPropCentered|PLAZA_PROPS|PLAZA_ERAS' src/` → uniquement défs + exports.
**Correction.** Supprimer les 3 exports (~15 l.). **Effort S.**

### MORT‑07 — ⚪ `ANTEE_POWER_THRESHOLD` : constante obsolète
`src/game/data/activeRuins.js:13`
**Preuve.** `export const ANTEE_POWER_THRESHOLD = 10_000;   // (obsolète — remplacé par la croissance relative)` — `grep` → **la déclaration seule**. Vestige de l'ancienne condition du mythe d'Antée.
**Correction.** Supprimer la ligne. **Effort S.**

### MORT‑08 — ⚪ `export let buyAmount` : miroir module write-only
`src/game/core/state.js:340`
**Problème.** Binding `export let buyAmount` réassigné par les setters (`:1050/1092/1100`) mais **jamais relu ni importé** : la vérité est le champ `state.buyAmount` (lu ex. `BuildingShop.jsx:45 s.buyAmount`). Miroir mort au niveau module.
**Preuve.** `grep -rn '\bbuyAmount\b' src/` → écritures internes seulement pour l'export module ; toutes les **lectures** portent sur `state.buyAmount`/`s.buyAmount`.
**Correction.** Supprimer l'export module `buyAmount` (garder le champ d'état + les setters). **Effort S.**

### MORT‑09 — ⚪ Assets trackés & shippés mais jamais chargés (~447 K)
`public/pixelart/wonders/arc-t5-candidats/` (6 fichiers, 420 K), `public/pixelart/palettes/` (12, 19 K), `public/pixelart/agents/_orig/guild-prop-lodge.png` (1, 8 K)
**Problème.** Ces 3 cibles sont **trackées par git** (donc copiées `public/`→`dist/` au build) mais **jamais fetchées** : (a) `arc-t5-candidats` = 4 candidats de design provisoires (le `README.md:111` le dit lui-même ; le loader merveilles construit `"/pixelart/wonders/"+key+".png"` sans sous-dossier) ; (b) `palettes` = swatches générés par `buildPalette.mjs`, aucune `Image()`/fetch runtime ; (c) `agents/_orig/guild-prop-lodge.png` = backup pré-quantize orphelin (le prop vivant se charge depuis `agents/buildings/…`, et **aucun** script ne lit `agents/_orig`, contrairement à `buildings/_orig`).
**Preuve.** `git ls-files` → 6 / 12 / 1 fichiers trackés ; `grep` des préfixes de chemin dans `src/` → 0 (les rares hits `_archive`/`palettes` sont des sous-chaînes fortuites : `mirror_archives`, `p4_wear_archives`).
**Impact.** ~447 K de poids de build inutile.
**Correction (non appliquée).** Retirer ces 3 cibles du suivi git (ou les `.gitignore` comme leurs voisins). **Ne PAS toucher** `_archive/`, `buildings/_orig/`, `iso/_orig/` : ceux-là sont **gitignorés** et servent de source aux scripts de régénération (`retintWater.mjs`, `flipBuildings.mjs`, `normalizeIsoScenes.mjs`) — voir §5. **Effort S.**

### MORT‑10 — ⚪ Surface d'API trop large : ~75 exports vivants-mais-internes
`src/game/core/actions.js:3`, `state.js:372`, `mechanics/production.js:190`, `data/myths.js:31`, `i18n.js:19`, `main.js:334`… (groupé)
**Problème.** Sur les 105 « unused exports » de knip, **~75 sont des REDUNDANT_EXPORT** : la fonction/const est bien **utilisée** (en interne dans son fichier, ou via un import direct du module frère, ou via un hook `window.__`) mais son mot-clé `export` n'est importé par personne. Ce n'est **pas du code mort** — c'est une surface d'API publique inutilement large. Répartition vérifiée :
- **Baril `actions.js`** (~21) : ré-expose des fonctions vivantes que les consommateurs importent **en direct** depuis les sous-modules (`tick.js`, `crisis.js`, `production.js`…) ou que les sims destructurent via `actions.X` ;
- **`state.js`** (~26) : `normalize*`/`finite*`/`decimalField`/`isPlainObject`/`load` — tous appelés dans `hydrateState`/`load` ;
- **`data/myths.js`** (8 constantes `RAGNAROK_*`/`ATLAS_MIN_*`/`ATRIDES_STARTING_*`/`CADMOS_AGE_NAME_TARGET`) — lues dans les conditions/textes du même fichier ;
- **`mechanics`** : `ruinEffectMultiplier` (ré-export baril ; la def vit dans `shared.js`), `policy*`, `regulFatigueCostMult`, `activeEpitaphLegacy` ;
- **`main.js`** (`playMusic`/`pauseMusic`/`checkAutoCollapse`), **`i18n.js`** (`SUPPORTED_LANGS`/`DEFAULT_LANG`/`lang`), **map** (`cosmicGround`, `BRANCH_THEME`, `AGE_CONFIG`, `houseFootprint`, `PERSONALITIES`, `plazaEraForBand`, `EPOCHS`, `splashEpochForEra`, flags `isoFlag`/`pixel*Flag`).
**Impact.** Nul en runtime. Coût dev : l'API publique ment sur ce qui est réellement consommé ; gêne l'analyse d'impact et les outils comme knip (bruit permanent).
**Correction (non appliquée).** Retirer le mot-clé `export` des symboles à usage strictement interne (surtout `state.js` normalize* et le baril `actions.js` — ne garder au baril que ce que l'app/les sims importent réellement). **Aucune** de ces suppressions ne change le comportement. **Effort M** (mécanique mais volumineux ; à faire par petits lots + `vitest` entre chaque).

---

## 4. Détail — Duplication

### DUP‑00 — ✅ Sim↔jeu : AUCUNE divergence exécutable *(la bonne nouvelle)*
C'est la catégorie la plus dangereuse de l'audit, et elle est **propre**. Les 7 scripts (`simulate-ce.js`, `sim-10-profils.js`, `sim-idle-impact.js`, `sim-idle-impact-return.js`, `simulate-game.js`, `bench-myths.js`, `bench-rupture.js`) importent **le vrai moteur** via `await import('./src/game/core/mechanics.js' | prestige.js | production.js | actions.js | main.js)` et consomment les vraies fonctions (`ruinGain`, `legitimacyGain`, `pressureBreakdown`, `cityVitals`, `globalMultiplier`, `rates`, `timeWearRate`, `dynastyRuinsThreshold`, `applyOfflineProgress`). **Aucun** sim ne recalcule `instability`/`pressure`/`ruinMultiplier`/`legitimacy` en code exécutable. Les littéraux présents dans les sims sont soit de la **politique de bot** (comportement joueur : `growSeconds`, `manageBelow`, `CYCLE_HARD_CAP`…), soit des **copies documentaires en prose** dans les rapports `.md` générés — dont la plus détaillée (`legitimacyGain`, `sim-10-profils.js:1002`) a été vérifiée **exacte** vs le moteur (`prestige.js:196-201`). Seul bémol : ces proses ne sont gardées par aucun test → **NETTOYAGE** (elles *peuvent* mentir si le moteur change ; à régénérer plutôt qu'à figer).

### DUP‑01 — 🟡 `Math.pow(2, grandResetCount)` sur 5 sites d'affichage hors moteur
`components/views/HeritageView.jsx:273` (et `:277` ×3 dans la ligne), `actions/building.js:263/267/269`
**Problème.** Le multiplicateur de Grand Reset (base ×2, bonus Ragnarök ×4, cap 11) est **recalculé en dur** pour l'affichage/les dialogues, hors des deux fonctions moteur qui font autorité. Un rééquilibrage de la base ferait **mentir l'UI** sans casser la logique.
**Source de vérité.** `mechanics/prestige.js:43` (`grandResetRuinMultiplier`) + `production.js:151` (`grandResetMultiplier`).
**Correction (non appliquée).** Exposer un helper unique + `GRAND_RESET_PROD_BASE` dans `balance.js`, lu par les libellés. **Effort M.**
> Recoupe **CORE‑21** (qui listait 6 sites côté cœur) et l'**étend à l'UI** (`HeritageView`).

### DUP‑02 — 🟡 `2.4` (`COLLAPSE_PREP_MAX`) codé en dur dans l'affichage
`components/views/ChronicleView.jsx:135` — `Math.min(2.4, collapsePreparation || 0)`
**Problème.** Tout le moteur importe la constante `COLLAPSE_PREP_MAX` (`balance.js:26`, lue par `crisis.js:230`, `prestige.js:99`, `state.js:915`) **sauf** cet affichage, qui fige `2.4`. Si le plafond de préparation est relevé, la tuile « Héritage préparé » plafonnera à +240 % (valeur périmée).
**Source de vérité.** `balance.js:26`.
**Correction (non appliquée).** `import { COLLAPSE_PREP_MAX }` et l'utiliser. **Effort S.**

### DUP‑03 — 🟡 Ancres HSL `EPOCHS` recopiées à la main dans le script de palette
`scripts/buildPalette.mjs:71`
**Problème.** `buildPalette.mjs` maintient un `const EPOCHS` **codé à la main** (« miroir des ancres HSL de `eraThemes.EPOCHS` ») au lieu d'importer la donnée du jeu. Couplage documenté mais non contraint → dérive palette↔jeu possible.
**Source de vérité.** `data/eraThemes.js:47` `EPOCHS`.
**Correction (non appliquée).** Importer `EPOCHS` depuis `eraThemes.js` dans le script (ou en dériver). **Effort M** (le script tourne en Node pur — vérifier l'importabilité de `eraThemes.js`).

### DUP‑04 — 🟡 `OdometerNumber` ↔ `RollingNumber` : moteur count-up dupliqué (~59 l.)
`components/ui/OdometerNumber.jsx:55` ↔ `components/ui/RollingNumber.jsx:24`
**Problème.** Les **deux composants sont vivants** (`OdometerNumber` monté dans `Topbar.jsx:142` ; `RollingNumber` dans `CityStatusPanel.jsx:118/132/142`) mais partagent ~59 lignes identiques : 5 refs + `useEffect` + fonction `step` en rAF + cleanup (interpolation « count-up »). Les commentaires reconnaissent eux-mêmes le parallélisme (« Même constante que RollingNumber »).
**Source de vérité.** Aucun n'est canonique : extraire le moteur d'interpolation dans un hook `src/hooks/useCountUp.js` ; les 2 composants restent (rendus différents : colonnes de chiffres vs pulse) mais allégés.
**Correction (non appliquée).** Créer `useCountUp`, le consommer des deux côtés. **Effort M.**

### DUP‑05 — 🟡 `pixelMedian.js` = jumeau verbatim de `pixelBridge.js` (~80 l.)
`game/map/pixelMedian.js:44` ↔ `game/map/pixelBridge.js`
**Problème.** `pixelMedian` (terre-plein central) est le « jumeau » documenté de `pixelBridge` (pont) : ~47 l. de helpers quasi-identiques (`computeBounds`/`makeRotated`/`ensure`/`drawTiled` — découpe 9-slice culées+milieu) + ~15 l. d'échafaudage module (flag/setter/`window.__`). Seul paramètre divergent : `CAP` (0.14 vs 0.16).
**Source de vérité.** `pixelBridge.js` (l'original). Extraire un helper commun `drawClippedRibbon(kind, CAP)` ; `pixelMedian` l'appelle.
**Correction (non appliquée).** Helper partagé paramétré. **Effort M‑L.**

### DUP‑06 — 🟡 Peintres carte : motifs de rendu copiés (grappe)
`game/map/cityEngineSprites.js`, `agents.js`, `renderWorld.js`, `pixelRiver.js`, `iso/isoRenderer.js` (multi)
**Problème.** Plusieurs motifs de rendu copiés-collés, tous sur du code **actif** :
- **halo `glow` additif** (`save`+`lighter`+`radialGradient`+`arc`+`fill`+`restore`) **inliné ~68×** alors qu'un helper `glow()` existe déjà — et est lui-même dupliqué 2× (`cityEngineSprites.js:489`) ;
- **silhouette humanoïde de repli** (jambes alternées + tunique + tête) copiée **3×** (SoT `agents.js:831`) ;
- **pas-sur-grille du walker** (4 dirs, filtre demi-tour, score Manhattan, jitter) copié dans **3 agents** (SoT `agents.js:512`) ;
- **renderer de bateaux** recopié de `agents.js` vers `isoRenderer.js:512` (migration iso WIP) ;
- **préambule de bâtiment staged** (stade d'ère par ternaire + extraction `nF`) répété **~30×** ;
- **boilerplate de cache d'images paresseux** (`ensureBoat`≡`ensurePortBoat`, `ensureAgentDiag`≈`ensureVehDiag`).
**Impact.** Maintenance lourde ; un ajustement visuel doit être répliqué à N endroits. Risque de divergence **atténué** car un seul chemin de rendu tourne en prod à la fois.
**Correction (non appliquée).** Helpers carte communs (`glow`, `drawHumanoidFallback`, `gridStep`, `eraStage`/`litToAlpha`, `ensureLazyImage`). **Effort S→L** selon le motif ; commencer par `glow` (68 sites, gain immédiat, effort S côté helper).
> Hors périmètre strict des runs cœur/carte dédiés, mais c'est le plus gros volume de duplication du dépôt.

### DUP‑07 — ⚪ Coquille de dialogue recopiée dans 3 des 4 dialogues
`components/dialogs/DebugDialog.jsx:15`, `ImportDialog.jsx`, `OptionsDialog.jsx`
**Problème.** Le `useEffect` de synchro `isOpen → dialog.showModal()/close()` (+ structure overlay/fermeture) est recopié à l'identique dans 3 dialogues sur 4 (`ChoiceDialog` diffère). Pas de coquille partagée.
**Source de vérité.** Un futur `<DialogShell>` (ou hook `useDialogOpen`) paramétrant la variante de clic-overlay.
**Correction (non appliquée).** Extraire la coquille. **Effort M.**

### DUP‑08 — ⚪ Helpers fleuve redéfinis au lieu d'être importés
`game/map/pixelRiver.js:83` (normale) et `:113` (ruban-clip)
**Problème.** La normale au fleuve est redéfinie 3× (`cmRiverNormalAt`/`normalAt`/`riverNormalAt`) et le tracé du polygone-ruban + clip copié 3×, alors que `renderWorld.js:460` porte déjà un `cmRiverNormalAt` étiqueté « Helper partagé ».
**Source de vérité.** `renderWorld.js` (`cmRiverNormalAt` / `ribbon()`).
**Correction (non appliquée).** Importer le helper partagé. **Effort S.**

### DUP‑09 — ⚪ PRNG mulberry32 dupliqué (copie assumée)
`game/core/utils.js:199` (`seededRng`) ↔ `game/map/procedural/seedManager.js:29` (`rngFrom`)
**Problème.** Le corps mulberry32 est identique. `seedManager.js:27` **documente** la copie (« recopié ici pour garder le générateur de map utilisable hors contexte jeu »). Le motif est petit (8 l.) et l'algo ne change jamais → risque faible, mais c'est une redéfinition locale d'un util existant.
**Source de vérité.** `utils.js:198` `seededRng` (canonique). `utils.js` est pur/importable en Node — la justification de la copie est faible.
**Correction (non appliquée).** `seedManager` importe `seededRng` et l'enveloppe (le mixage de label reste local). **Effort S.**

### DUP‑10 — ⚪ Formateur d'horloge dupliqué
`components/views/ChronicleView.jsx:19` (`fmtDuration`) ≈ `components/ui/CityStatusPanel.jsx` (`fmtCycleTime`)
**Problème.** Deux formateurs `j/h/m/s` quasi-identiques (à 2 détails près) définis localement.
**Source de vérité.** Un util commun (`utils.js` ou un `formatDuration` partagé UI).
**Correction (non appliquée).** Factoriser en un util. **Effort S.**

### Contenu Chronique — vérifié PROPRE (livrable §B du brief)
Croisement complet triggers ↔ conditions réelles (pas la prose) : **aucun écho mort**.
- `checkAndTriggerChronicleEntries` est bien appelé dans le tick (`actions/tick.js:275`) → les `conditionType` « spéciaux » sont réellement produits.
- **Mapping période→ère** (`chronicleEvaluator.getPeriod`) : p1=ères 0-3, p2=4-8, p3=9-14, p4=15-20, p5=21-26, p6=27-31, p7=32+. Le tableau `eras` compte **299 ères** (35 de base + 264 transcendantes) → p7 couvre 32-298, **aucune période orpheline**.
- **Seuils pop** par période (`pop_10k`…`pop_100b`) : tous **atteignables** dans leur fenêtre (p1 franchit 10 k en ère 2 ; p2..p7 entrent déjà au-dessus de leur seuil → article démographie **garanti**, pas mort).
- `stage_start`/`stage_6`/`stage_12` en périodes tardives restent atteignables via la reconstruction post-effondrement (pop haute + bâtiments remis à zéro par `resetCivilization`). **Rare ≠ mort.** `bonus_libre` = `return true`. **Rien à supprimer côté contenu.**

---

## 5. Faux positifs écartés (livrable : documentation des hooks dynamiques)

Ce que les outils ont proposé et qui **n'est PAS** mort/problématique, avec la preuve d'usage. C'est la contrepartie de la règle « grep avant d'affirmer ».

**knip → REDUNDANT_EXPORT, pas morts (usage interne / import frère / namespace sim) :**
- **Baril `actions.js`** — les ~21 ré-exports sont vivants via import direct des sous-modules (`tick.js:32` importe `checkCrisisThresholds`/`triggerCollapseChoices` depuis `./crisis.js`) ou via la destructuration `actions.X` des sims (`await import('…/actions.js')`). `addProductionPenalty` : 46 usages réels, seule la ré-export baril est superflue.
- **`state.js`** `normalize*`/`finite*`/`decimalField`/`isPlainObject`/`load` — tous consommés dans `hydrateState`/`load`.
- **`data/myths.js`** `RAGNAROK_*`/`ATLAS_MIN_*`/`ATRIDES_STARTING_*`/`CADMOS_AGE_NAME_TARGET` — lus dans les conditions/textes de mythes du même fichier.
- **`eraThemes.EPOCHS`** — lu `eraThemes.js:188/219/220` (interne) ; l'export est redondant, mais la **donnée est dupliquée** à la main dans `buildPalette.mjs` (→ DUP‑03, ça oui).
- **i18n / main.js / mechanics** — `SUPPORTED_LANGS`/`DEFAULT_LANG`/`lang`, `playMusic`/`pauseMusic`/`checkAutoCollapse`, `ruinEffectMultiplier` (baril), `policy*` : tous à usage interne.

**knip → flags & setters VIVANTS via `window.__` (invisibles à knip) :**
- `setPixelBridge`/`setPixelMedian`/`setRoadPaving` : assignés à `window.__pixelBridge`/`__pixelMedian`/`__roadPaving` (toggles console). `isoFlag`/`pixelBuildingsFlag`/`pixelHousesFlag`/`pixelMedianFlag`/`houseFitTune` : lus en interne (`if(flag.on)`) **et** pilotés par des hooks `window.__`. Ce sont des molettes debug intentionnelles.

**manual → ~60 hooks `window.__`/`globalThis.__` : tous vivants.** Deux familles : (i) knobs lus chaque frame avec `?? défaut` (l'utilisateur écrit en console : `__strideLen`, `__pedEdge`, `__ysortEps`, `__panMargin`, `__citizenMul`, `__cosmicTowerH`…) ; (ii) setters dont la VAR cible est relue par le rendu (vérifié ≥1 read chacun). Seul « write-only par le code » : `__layoutProfileLast` — mais c'est la **sortie d'un profiler** destinée à la console (activé par `__layoutProfile`). **Aucun DEAD_FLAG.**

**manual → assets d'archive NON morts (gitignorés, sources de build) :**
- `public/pixelart/_archive/` (52 f.) — **gitignoré (0 tracké)**, source de `retintWater.mjs` + `separatePixelTerrain.mjs`.
- `public/pixelart/buildings/_orig/` (11 f.) — gitignoré, source idempotente de `flipBuildings.mjs`.
- `public/pixelart/iso/_orig/` (10 f.) — untracked, source de `normalizeIsoScenes.mjs`.
> ⚠️ Contraste avec MORT‑09 : là, `agents/_orig/guild-prop-lodge.png`, `arc-t5-candidats` et `palettes` sont **trackés** (donc shippés) et **sans** script consommateur → eux sont morts. La distinction se joue sur `git ls-files`, pas sur le nom `_orig`.

**manual → migrations & composants :**
- `MIGRATIONS[1]`/`[2]` + `OLD_RUIN_NODE_COSTS` : aucune migration morte (`SAVE_KEY` jamais changé → saves v0/v1/v2 encore chargeables ; `OLD_RUIN_NODE_COSTS` lu par la migration de refonte d'arbre `state.js:983`).
- `ChoiceDialog`/`PurchaseRow` : montés (tags JSX multi-lignes — faux positif d'un premier grep `<Name`), respectivement `App.jsx:237` et `BuildingShop.jsx:186`.
- `activeEpitaphLegacy` : la **fonction** moteur est vivante en interne (`production.js:296`) ; la ref `CityView.jsx:64` est le **champ d'état** homonyme, pas la fonction (collision de nom, pas un mort).

**depcheck → devDeps `@types/react`, `@types/react-dom` :** signalés « non importés » car ce sont des **types ambiants** (IntelliSense éditeur sur les 29 `.jsx`), non grep-ables. Projet JS pur sans `tsconfig` → leur retrait est **inoffensif** mais **facultatif** (perte d'auto-complétion JSX dans l'éditeur). Confiance faible ; laissé au choix de l'équipe, pas un finding ferme.

**jscpd → clones écartés :** boilerplate de setup des fichiers `__tests__/*` (fixtures répétées — non factorisable utilement, faible valeur), et similarités structurelles fortuites entre helpers sémantiquement distincts.

---

## 6. Top actions à fort ROI du lot

1. **Supprimer les 8 vrais morts de code (MORT‑01→08).** Effort cumulé **S**, risque nul : `olympusUnlockedProfile`, `worldBoxToScreenBox`, `cityMapTileScreen`, `ANCHOR_KINDS`, `BRANCH_ORDER`, le trio `plazaProps`, `ANTEE_POWER_THRESHOLD`, le miroir `buyAmount`. Gain immédiat de lisibilité, `knip` plus propre.
2. **Corriger les 2 constantes de balance figées dans l'UI (DUP‑01, DUP‑02).** `2^grandResetCount` (HeritageView) et `2.4` (ChronicleView) : ce sont les seuls doublons à **risque joueur** (l'UI ment si l'équilibrage bouge). Effort S‑M. Importer/centraliser depuis `balance.js`/`prestige.js`.
3. **Factoriser le helper `glow()` (DUP‑06, sous-item halo).** ~68 sites inlinés → 1 helper : plus gros ratio lignes-supprimées/effort du dépôt, effort **S** côté helper. Les autres motifs carte (silhouette, walker, préambule stade) suivront par petits lots.
4. **Extraire `useCountUp` (DUP‑04) et `<DialogShell>` (DUP‑07).** Deux factorisations UI nettes (~59 l. + coquille ×3), effort M, qui suppriment une vraie dette de maintenance sur des composants vivants.
5. **Alléger la surface d'API (MORT‑10) par lots.** Retirer le mot-clé `export` des ~26 helpers internes de `state.js` et élaguer le baril `actions.js` à ce que l'app/les sims importent vraiment. Effort M, mais rend les prochains audits `knip` exploitables sans config.

---

### Annexe — Continuité avec l'audit cœur
Deux findings recoupent `docs/audits/audit-2026-07-core.md` (re-vérifiés à la source, pas repris) : **MORT‑01 = CORE‑20** (`olympusUnlockedProfile`) et **DUP‑01 ⊃ CORE‑21** (multiplicateur de Grand Reset, ici **étendu à l'UI** `HeritageView`). Aucun autre chevauchement.
