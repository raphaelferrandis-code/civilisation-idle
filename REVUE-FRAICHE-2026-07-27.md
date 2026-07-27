# Revue fraîche ciblée — 2026-07-27 (phase 2)

Complète le re-tri de `RETRI-2026-07-27.md`. Périmètre : **ce que l'audit du
21/07 n'a jamais vu** — le diff `31fe1cf..HEAD` (63 commits, 172 fichiers,
+17 189 lignes : lots QoL, refonte typo, gros œuvre carte) et les angles morts
déclarés dans la section « Couverture » de l'audit. 10 chercheurs (7 diff,
3 angles morts), anti-redite strict contre RETRI/REPRISE, **contre-expertise
adversariale sur chaque trouvaille haute : 7 MAJEUR signalés, 7 confirmés,
0 réfuté**. Les 25 basses (17 MINEUR + 8 ENTRETIEN) sont livrées non
contre-expertisées.

Constat d'ensemble : **les 7 MAJEUR sont tous dans le code des 6 derniers
jours**, et 5 des 7 se concentrent sur deux chantiers récents — les
emplacements manuels C9 et la clepsydre/hors-ligne C7/C12. Logique : c'est le
code le plus jeune, celui qu'aucun audit n'avait relu.

---

## MAJEUR confirmés (7)

### 1. `saveSlots.js:43-59` — Écraser un emplacement en stockage plein DÉTRUIT l'instantané précédent
`localStorage.setItem` est atomique : s'il lève `QuotaExceededError`, l'ancien
instantané est resté intact. Mais le `catch` de `writeSlot` fait
`removeItem(slotKey)` + `removeItem(metaKey)` sans condition — il efface la
sauvegarde qui venait de survivre, pendant que le float dit « emplacement non
écrit ». Perte du filet que C9 venait de tendre.
**Piste** : lire les anciennes valeurs avant l'écriture et les RESTAURER dans le
catch (le seul vrai risque est la désynchro payload/méta, pas la demi-écriture).

### 2. `saveSlots.js:65-77` — `loadSlot` ne force pas le miroir nuage : la partie abandonnée peut ressusciter
Un emplacement est par construction un instantané PASSÉ (lifetimePlaySec
moindre) : après `loadSlot`, `save()` passe par `cloudMirrorSave()` sans
`force`, la garde `mayOverwriteCloud` refuse d'écrire **et met
`cloudDirty=false`** (neutralisant même le flush de sortie). Crash ou kill sans
`beforeunload` → au reboot, « la plus avancée gagne » restaure la partie
abandonnée, le chargement d'emplacement est silencieusement annulé.
`importSave`, le chemin frère exact, ferme ce trou avec
`cloudMirrorSave({force:true})` et un commentaire qui décrit précisément ce
risque (`main.js:106-109`).
**Piste** : même `cloudMirrorSave({ force: true })` après le `save()` de
`loadSlot`.

### 3. `main.js:401-417` — La clepsydre étale les fenêtres de bonus non gardées sur des heures
`clepsydreRefusal` ne refuse que Bénédiction et Braisiers. Or
`globalScalarFactors` contient d'autres fenêtres sur
`elapsed = Date.now() − cycleStartedAt` : Cendres fertiles ×(1+rush) les 3
premières min du cycle, Atrides ×3 / pacte ×2 les 2 premières, legs d'épitaphe
(8-20 min), Énée. Chemin linéaire : effondrer puis verser 24 h pendant la
fenêtre → `creditSpan` évalue `rates()` UNE fois au taux boosté × 86 400 s.
Chemin farm : `virtual = now − spend` rend `elapsed` NÉGATIF, donc « < 120 s »
vrai pendant presque tout le versement. Reproductible chaque cycle avec le nœud
`regrowthRush`.
**Piste** : étendre `clepsydreRefusal` à ces fenêtres, ou scinder le crédit
comme les Braisiers ; côté farm, clamper `elapsed` à 0 (comme `pressure.js:86`).

### 4. `main.js:235` — Verser la clepsydre ne fait JAMAIS tourner cadrans du temple ni aubaines
L'horloge virtuelle du versement court de `now − spend` à `now`, mais
`templeAuto[game].lastAt ≈ now` (le jeu tournait à l'instant) et
`nextBoonAt > now` : les tests `virtual − lastAt ≥ intervalle` et
`virtual < nextBoonAt` échouent pendant TOUT le versement. Verser 8 h rend
0 partie de temple (contre ~40 pour une vraie absence de 8 h) et ~0 aubaine —
alors que `main.js:375-378` promet « verser une heure vaut une heure
d'absence », et que le rapport de reprise n'annonce plus le temple comme
inactif. Perte sèche de Faveur espérée en régime imprimante.
**Piste** : rebaser les jalons au début du versement
(`lastAt = min(lastAt, virtualStart)`, idem `nextBoonAt`).

### 5. `tick.js:379-398` + `automation.js:68` — Effondrements forcés non gardés pendant la sim hors-ligne
Bûcher programmé, Ragnarök, Script du Phénix appellent `collapse()` en pleine
`simulateAwayCrises` : `setGamePaused(true)` + séquence async bloquée 2 s sur un
`setTimeout` RÉEL → la boucle de sim `break` sur `gamePaused`, les heures
restantes sont créditées linéairement dans une cité déjà condamnée, le rapport
annonce 0 effondrement, puis ~2 s après le retour la séquence en suspens rase la
cité avec un gain figé mi-sim. L'Édit, lui, passe par le chemin synchrone prévu.
**Piste** : garder ces `collapse()` derrière `!isOfflineSim()` et laisser la sim
les traiter par `completeCollapse` direct ; a minima ne pas créditer le reliquat
quand `collapseInProgress` est vrai au sortir de la boucle.

### 6. `base.css:28-35` — « Mouvement : Aucune » (E4) recrée le blackout M22 sur un chemin neuf
`data-motion="none"` force `animation-duration: 0.01ms` sans toucher
`fill-mode` : les 4 animations `forwards` finissant à `opacity:0`
(`.outcome-float`, `.era-banner`, `.pr-float`, `.map-bubble-alert`) sautent à
l'état final invisible. Les exceptions existantes ne couvrent que
`prefers-reduced-motion`, pas ce nouveau chemin. Aggravation : le toast
cliquable C13 garde `pointer-events:auto` à opacité 0 — un bouton invisible
traîne sur la carte et un clic déclenche une navigation surprise.
**Piste** : traiter M22 et ce chemin d'un coup — exceptions communes aux deux
blocs (ou `animation-fill-mode: none !important` + retrait différé côté JS).

### 7. `crisis.js:435` — L'Infrastructure est privée du socle de départ « Reliquaire des pics »
`reliquaire_pics` (« 3 % du pic précédent de CHAQUE ressource ») et
`dogma_reliquaire_scelle` (8 %) : `completeCollapse` applique
`computeStartFloor` à Population/Food/Gold/Knowledge mais la ligne 435 pose
`state.infrastructure` sans `max(startFloor(...))` — alors que le pic est bien
tracké (`cyclePeaks.infrastructure`) et que `shared.js:107` affirme « couvre
TOUTES les ressources ». Même omission dans `myths.js:713-717` et `:743`.
L'effet acheté est partiellement inopérant à chaque cycle.
**Piste** : ajouter le `max(computeStartFloor("Infrastructure", 0))` (et
trancher le cas `resetCivilization`) ; sinon corriger les textes des deux nœuds.

---

## MINEUR (17) — non contre-expertisés

**Hors-ligne / clepsydre (4)**
- `idleReport.js:30` — le rapport de reprise B11 est JETÉ si la vue Cité n'est
  pas montée à la publication (activeView persisté ≠ cité → retour d'absence
  muet). Piste : queue de 1, ou monter le panneau hors des vues conditionnelles.
- `main.js:343` — la liste « resté inactif » du rapport n'annonce plus
  temple/aubaines, même sur le chemin LINÉAIRE où ils ne tournent pas.
- `templeAutomation.js:99-101` — l'auto-relève du tronc n'est pas silencieuse en
  sim : rafale de floats au retour + `save()` par relève sous horloge virtuelle.
- `layout.js:2326` — `captureVestige` recalcule un layout COMPLET par
  effondrement : jusqu'à 500 recomputes synchrones au retour d'absence
  (`phenix_calendaire`). Piste : sous `isOfflineSim()`, ne capturer que le
  dernier vestige.

**Nombres / affichages (3)**
- `globalMultipliers.js:250` — l'Anatomie du multiplicateur (B2) ne miroite que
  le chemin float : en régime Decimal elle affiche « ×inf » pendant que le
  moteur calcule juste.
- `ChronicleView.jsx:337 + 385` — mêmes tuiles « ×inf » (miroirs Decimal
  existants non utilisés ; même motif dans BuildingShop.jsx:136).
- `scratch.js:83-95` — `scratchRtpRef` compte `Math.round` alors que le payout
  réel passe par `payRound` (non biaisé) : RTP de référence surélevé (~+0,7 pt
  sur l'obole), badge d'auto-gratteux optimiste autour de la bascule. Le
  commentaire :77-78 est devenu faux.

**UI / interactions (5)**
- `cityMapRuntime.js:1874` — `__showWonder` : le zoom d'aperçu est annulé par le
  glissement caméra A9 (`zoomGoal` jamais resynchronisé).
- `HelpBubble.jsx:97` — `hideTip` horodate `lastHideAt` même sans bulle
  affichée : la grâce de réouverture annule le délai d'ouverture en traversée.
- `PurchaseRow.jsx:257 & co` — motif « ternaire coupé » :
  `{...tipProps(null, affordable ? tip : null)}` retire aussi `onMouseLeave` →
  bulle orpheline quand la cible se désactive sous la souris (aussi
  CityView.jsx:583/605/783/926).
- `CityStatusPanel.jsx:353` — versement refusé en silence si le motif de refus
  change entre rendu et clic (float avec label `undefined`). Piste : dériver le
  texte de `res.reason`.
- `preload.cjs:96` — export fichier du .exe : écrit en silence dans Documents
  (le commentaire promet un « dialogue natif »), chemin jamais affiché,
  horodatage à la minute qui écrase les homonymes.

**A11y / CSS (3)**
- `IdleReportPanel.jsx:45` — région aria-live montée avec son contenu : rapport
  d'absence muet au lecteur d'écran (motif OutcomeFloatLayer, s'ajoute à la
  liste E de RETRI).
- `views-misc.css:148 + 239` — `var(--font-display)` n'est défini NULLE PART :
  titres du bilan de cycle (D9) et du rapport de reprise (B11) en serif système.
- `frames.css:67` — le cadre grec des Options n'a pas le repli < 720 px des
  panneaux de vue ; le bloc mobile ≤ 620 px de base.css est lettre morte.

**Carte (2)**
- `weatherMode.js:58` — météo forcée « pluie » : le vent saute d'un coup toutes
  les 24 min en pleine averse (contredit l'invariant du module).
- *(voir aussi ENTRETIEN cityMapRuntime.js:1524 — foule hachée par capture.)*

## ENTRETIEN (8)

- `lightLayer.js:86` — `__lightOcclusion({cell})` à chaud laisse de la lumière
  fantôme (le canvas n'est pas réalloué au changement de `cell` seul).
- `cityMapRuntime.js:1524` — le palier météo de foule bascule à chaque
  `__cityShot` : coupe brutale de piétons au retour de la pluie (harnais).
- `automation.js:96` — `setAutomateField` fait un `save()` complet par onChange
  des champs réserve/débit — même motif que RETRI A.8, site NOUVEAU (C6) ; à
  traiter ensemble.
- `augures.js:461-469` — `doubleAugury` sans garde moteur : ni plafond de crans
  (l'Échelle de Vénus n'est vérifiée que côté UI), ni exigence que la mise
  vienne d'un gain — contraire à la doctrine « la garde vit dans le moteur ».
- `building.js:174` — commentaire : `buyableInMass` se dit exporté pour la file
  d'achats C8 (revertée) ; en réalité il sert au délai d'achat B5.
- `BuildingShop.jsx:168` — `useMemo` mémoïse une FONCTION, pas ses résultats ;
  le commentaire décrit un cache qui n'existe pas (pas de bug, doc mensongère).
- `components.css:335` — commentaire « --font-small = Pixelify Sans » faux
  (= Inter depuis cdb541a).
- `events.js:165-167` — garde `isNotifyPaused()` morte dans
  `runCollapseSequence` (le rattrapage hors-ligne appelle `completeCollapse`
  directement) ; commentaire trompeur.

---

## Angles morts déclarés par cette revue

Statique intégral : rien d'exécuté, aucun rendu vérifié à l'image — les mesures
citées en commentaire du code (culls, budgets ms, ratios de contraste, calages
pixel) sont prises sur parole ; seule la boucle visuelle (`__cityShot`) ou le
profileur peuvent les juger. Non couverts notamment : bench-temple.js non
exécuté (tables d'équité vérifiées par algèbre seulement), les écrivains de
`chronicleStats` (justesse des montants), `chronicleArticles.js` (couverture par
période), steward.js/olympus.js sous horloge virtuelle, et les moteurs derrière
les UI du lot vues.

## État global de la revue complète du 27/07

Le backlog à jour du dépôt = **4 documents** :
1. `REPRISE-2026-07-27.md` — les 5 MAJEUR historiques (M3, M4, M8, M19, M22).
2. `RETRI-2026-07-27.md` — les 72 ouvertes de l'audit re-triées (38 MINEUR,
   34 ENTRETIEN).
3. **Ce rapport** — 7 MAJEUR neufs + 25 basses sur le code récent.
4. Réserve dynamique : la perf ne se juge qu'au profileur (leçon de la REPRISE).

Priorité suggérée : les 12 MAJEUR (5 anciens + 7 neufs), en commençant par les
deux de `saveSlots` (perte de sauvegarde manuelle) et le trio clepsydre —
M22 + le n°6 se corrigent en une seule passe CSS.
