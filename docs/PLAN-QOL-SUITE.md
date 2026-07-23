# Plan de mise en place, suite du dossier QoL

Date : 2026-07-22. Base de vérification : HEAD `0b02e24`.

Ce document ne remplace pas `AMELIORATIONS-VISUELLES-QOL.md`, il le corrige. Le dossier
d'origine a été écrit le matin du 2026-07-22 ; 22 commits ont atterri depuis, dont les trois
lots de QoL. Chaque fiche restante a donc été rouverte contre le code d'aujourd'hui, affirmation
par affirmation. Quand ce document et le dossier d'origine se contredisent, **c'est celui-ci qui
fait foi**, et le désaccord est explicité en section 1.

Les deux annexes (collisions de fichiers, révision des arbitrages) sont le matériau brut de
cette vérification, conservées parce qu'elles portent le détail que la synthèse compresse.

---

## Compte des fiches

49 fiches au dossier. 26 livrées (les trois lots, plus D9 que l'inventaire du dossier avait
manquée). 1 rejetée (A1). **Il en reste 22**, dont 3 proposées à l'abandon en section 5.

Tous les numéros de ligne ci-dessous sont ceux d'aujourd'hui, pas ceux du dossier d'origine.

---

## 1. Ce que l'audit a changé

### Une fiche est sans objet

**D9 est livrée en entier**, commit `68ef77e` (lot 1), alors que la consigne ne la listait pas. `CycleReportBanner.jsx` existe (93 lignes), `state.lastCycleReport` est écrit dans la branche silencieuse de `runCollapseSequence` (`events.js:161-173`), `state.prevCycle` dans `completeCollapse` (`crisis.js:350-355`), le bandeau est monté sur `CityView.jsx:334`, le CSS est en `views-misc.css:116-179`, et `cycleReport.test.js` passe. Il reste un défaut d'affichage de 4 lignes : `CycleReportBanner.jsx:15-20` déclare `famine`, `instability`, `time`, `auto_collapse`, alors que `collapseCause()` (`events.js:44-52`) ne rend que `time`, `famine`, `avarice`, `rupture`. Sur deux causes de chute sur quatre, le bandeau imprime la clé interne brute. Le mapping correct existe déjà en `epitaphs.js:70-74`.

### Trois points de fiche décrivent du travail déjà fait

- **E5 point 3** (silhouettes de ressource dans la Topbar) : fait. Chaque entrée du tableau `cards` (`Topbar.jsx:110-131`) porte déjà son `pixIcon` dédié, rendu ligne 146.
- **E4 point 4** (créer un cran Mouvement qui pilotera `CM.ambianceK`) : à l'envers. A8 est livré, `ambianceMode.js` existe, et le contrôle joueur est déjà dans l'onglet Affichage (`OptionsDialog.jsx:511-539`, libellé « Vie de la carte »). E4 doit étendre ce contrôle, pas en poser un second.
- **D11, champ de stockage** : `state.lastCollapseGain` n'a pas à être créé, `state.prevCycle.ruinGain` existe depuis le lot 1, exactement à l'endroit que la fiche indique.

### Sept affirmations fausses qui déplacent un périmètre

| Fiche | Ce que disait le dossier | Ce que dit le code |
|---|---|---|
| **D2** | 3 sites d'application de `epitaphRuinMultiplier` | 4 : `events.js:157`, `events.js:189`, `events.js:258`, `main.js:273`. Le site oublié (189) est celui qui décide du montant versé sur le chemin manuel. `events.js:258` est **inopérant** : `choice.ruinGain` est toujours défini, le `??` ne tombe jamais |
| **D2** | un seul site d'effacement du champ | `resetCivilization()` appelle aussi `resetTemporaryRunState()` (`myths.js:723`) hors de tout effondrement. Un vœu rangé là disparaît quand le joueur scelle un pacte |
| **D11** | 3 fichiers de liste blanche | 4 : `automation.js:132` filtre les triggers de son côté. Sans lui, le bouton Ratio est un clic silencieusement mort |
| **B2** | le CSS va dans `components.css` | `components.css` ne porte que 2 lignes `.csp-`. Les 55 autres sont dans `layout.css:244-413` |
| **B2** | tous les facteurs sont bornés | Trois débordent à `Infinity` par construction : `infraMultiplier` (commentaire 103-104, c'est voulu), `ruinMultiplier:45`, `unspentRuinsPowerMultiplier:71` |
| **B1** | 126 `title=`, PurchaseRow en compte 6 | 146 dans 28 fichiers, PurchaseRow en compte 10, CityStatusPanel 11, et `CityView.jsx` en porte 35 que la fiche ne mentionne pas |
| **B1 point 6** | déplacer `.regul-tip` vers `components.css` pour monter la priorité | `index.css` importe `components.css` (16) avant `views.css` (17) : le déplacement **baisse** la priorité |
| **D10** | pondérer le tirage pour garder les gros lots rares | Il n'y a pas de gros lots : les 5 aubaines valent toutes 110 s de production sauf `migrants` à 150 (`boons.js:24, 32, 40, 48, 56`) |
| **E1** | première étape « bâtis ton premier grenier » | Le premier bâtiment est `foragers` (`buildings.js:13`), et le départ est calibré pour en payer exactement un (`state.js:308`, food = 12, coût 10) |
| **A9** | `E`, `M`, `S`, `I` sont en dur dans `App.jsx` | Partis dans `SHORTCUT_DEFS` (`shortcuts.js:27-38`) avec C11. Un bloc caméra en dur recréerait la double source que C11 vient de supprimer |
| **B7** | couper les courbes sous 1200 px, où la barre passe à 3 colonnes | Sous 1200 px la grille passe à **cinq** colonnes (`components.css:399-408`), à deux seulement sous 768 (410-414) |

### Trois périmètres qui gonflent, deux qui rétrécissent

**Gonflent.** `A11` : la sauvegarde ne garde que trois vestiges (`layout.js:2156`, `shift` au delà de 3) et le record ne contient **aucune cause de chute** (`layout.js:2146-2155`). L'effort L achète trois taches grises muettes. `E4` : trois vues se positionnent en absolu contre `<main>` en `height:100vh` sans scroll (`views-city-hud.css:33-38`, `ruinsTree.css:131-136`, `views-regulation.css:19-25`), donc la mise à l'échelle demande 8 écrans relus à 4 crans, et `--odo-cap: calc(var(--city-topbar-h) - 78px)` (`views-city-hud.css:30`) contient une constante pixel qui ne suivra pas. `D12` : le point d'accroche `runCrisisAction` serait du **code neuf** (aucun Mythe n'y bloque aujourd'hui) sur une fonction à 8 appelants, dont `steward.js:122` et `automation.js:209`.

**Rétrécissent.** `E5` : un tiers du travail est fait, et le seuil « bientôt » est gratuit depuis que B5 a livré `purchaseEta` et `quantizeEta` (`utils.js:196-202`). `A10` : le cran d'usure existe déjà sous le nom `crisisBand` (`cityMapRuntime.js:640-641`), il entre déjà dans `coreSig` donc il invalide déjà le bake. Le point 1 se réduit à **publier** ce cran au lieu d'en ajouter un second.

### Une chaîne de dépendances rouverte

A1 est rejeté, mais l'API dont A10 avait besoin a été livrée quand même par A3 et A7 : `drawPixelHouse` rend la boîte écran réellement dessinée (`pixelHouses.js:227-235`), `pixelHouseBox` l'expose sans dessiner (242), et l'item `smoke` est déjà trié dans la profondeur (`isoRenderer.js:4103`, dessiné en 4445). **A10 est débloqué.**

### Cinq collisions que le dossier traite comme des fiches indépendantes

1. **Trois bandeaux non modaux pour une ancre.** `.cycle-report` (top 3.2rem, z-index 6, `views-misc.css:121`) et `.idle-report` (top 3.2rem, z-index 7, 187) se disputent déjà la même bande. D8 serait le troisième.
2. **L'encart latéral est plein.** `CityStatusPanel` a reçu quatre blocs depuis le dossier (C2, C7, B9, C10) et `layout.css` compte déjà cinq blocs media pour le palier 981-1500 px. D2, D10, B2 et E1 y veulent tous une ligne.
3. **La rangée de boutique porterait quatre signaux d'attente** : `etaLabel` de B5 (livré), le pip de E5, la jauge de D6, le chip de B6. `arePropsEqual` (`PurchaseRow.jsx:284-308`) compare 14 props, sans aucun test.
4. **Quatre fiches carte, un seul budget de recuisson.** `ISO_SETTLE_MS = 110` mesure l'accalmie sur le mouvement réel de la caméra (`isoRenderer.js:4676-4679`). A9 la fait bouger en continu, A4 ajoute un vol, A10 ajoute des états de bake, A11 abaisse le plancher de zoom en élargissant la boîte (`cityMapRuntime.js:336-338`).
5. **B1 est une cible mouvante.** D6, B6, B2, E5 et D10 ajoutent chacune une infobulle. Chaque fiche livrée avant B1 augmente le travail de B1.

### Une convention à réapprendre avant de toucher `tick()`

C12 a séparé deux drapeaux que D2 et D10 confondent encore. `state.js:274-275` : `isNotifyPaused()` = pas de bruit visuel, `isOfflineSim()` = on rejoue du temps. La mécanique se garde avec `!isOfflineSim()` (`tick.js:177`, `352`), l'affichage avec `!isNotifyPaused()` (`tick.js:214`, `274`, `296`). Et un latch se pose **inconditionnellement**, la garde restant chez l'appelant (patron exact `refreshGrandResetReveal`, `tick.js:295-302`).

---

## 2. Les lots

Quatre lots, 19 fiches plus un correctif. D9 est déduite (livrée), D12, A11 et B7 sont proposées à l'abandon en section 5.

### Lot 1. Comprendre ses chiffres, fin du lot 3 de l'auteur

Ordre imposé : **correctif D9**, puis **B1**, puis **B2**, puis **B3**.

`B1 -> B2` parce que B1 migre le `title` de la tuile Multi. (`CityStatusPanel.jsx:149`) que B2 rend cliquable, et parce que le contenu structuré de `tipProps` est ce qui rend une pile de facteurs affichable dans une bulle. `B2 -> B3` est déclaré prérequis et confirmé : les deux visent le même hôte (`ChronicleView.jsx:51-70`, tuile Multi. 118-123) et si B3 passe d'abord il réexplique une pile que B2 va décomposer.

Effort cumulé : S + M + M + L.

Pour le joueur : une seule bulle sombre partout au lieu du mélange bulle native / bulle maison, le multiplicateur global cesse d'être un nombre magique, et un écran dit enfin où va la production ressource par ressource.

### Lot 2. La rangée d'achat dit tout

Ordre imposé : **D6 point 1**, puis **E5**, puis **B6**.

`D6 -> B6` : le tri de `categoryData` (`BuildingShop.jsx:143-152`) ne peut pas être mémoïsé sans le compteur de version que le latch de D6 introduit, et la liste de dépendances écrite dans la fiche B6 (buildings, cycles, ère) gèlerait l'apparition économique. `E5 -> B6` : E5 ne fait que classer de la donnée existante (`lackingKey` + délai B5), B6 ajoute un troisième signal sur une ligne déjà occupée. On fixe le vocabulaire d'état avant d'y empiler un chip.

Les trois fiches partagent **un seul sélecteur quantifié** dans `BuildingShop`, seul composant `memo()` sans props du dépôt avec `PurchaseRow`, sur le modèle d'`etaSig` (`BuildingShop.jsx:187-199`). Et **un seul passage** sur `arePropsEqual`.

Effort cumulé : M (S si l'option A de la question D6 est retenue) + S + M.

Pour le joueur : la boutique se rafraîchit à l'instant où un bâtiment apparaît (elle ne le fait pas aujourd'hui, aucun abonnement du composant ne lit `state.cyclePeaks`), les trois états d'achat se distinguent sans la couleur, et chaque rangée dit ce que le lot ajoute.

### Lot 3. Confort, accessibilité, découverte

Ordre imposé : **E4**, **E12**, **E7**, **E8**, **E11**, **E1**.

`E4 -> E12` : `uiPrefs.js` n'existe pas, c'est E4 qui le crée. `E4 -> E7` : le fondu d'écran doit tomber sous le cran Mouvement, et E4 doit d'abord trancher s'il étend « Vie de la carte » ou crée un second cran. `E7 -> E8` : E7 décide où vit la racine de vue, E8 pointe dessus (aria-label, cible du lien d'évitement, focus au changement de vue). `E11 -> E1` : la règle d'exclusion de l'arbitrage 3 ne peut s'écrire que si la liste des feuillets existe.

Effort cumulé : L + S + M + S + M + M.

Pour le joueur : le texte et la densité se règlent, les textes secondaires repassent au dessus du seuil lisible, les écrans ne sautent plus, le clavier et le lecteur d'écran cessent de naviguer à l'aveugle, un onglet neuf s'annonce, et les trois premières intentions se cochent seules.

### Lot 4. La chute et la carte

Deux voies indépendantes, sans fichier commun. Livrables dans n'importe quel ordre l'une par rapport à l'autre, mais chacune interne strictement ordonnée.

Voie moteur : **D11**, puis **D2**, puis **D10**, puis **D8**.
`D11 -> D2` est une contrainte dure : les deux écrivent dans `completeCollapse`, et si D2 majore la moisson en premier, la référence de gain que D11 stocke (`crisis.js:350`) inclut le facteur de vœu et le seuil ratio dérive de cycle en cycle sans qu'aucun test ne le voie.

Voie carte : **A9**, puis **A10**, puis **A4**.
`A9 -> A4` : `camGoal` et son rattrapage amorti sont le même mécanisme, à écrire une fois. `A10 -> A4` : A10 fixe la convention d'ancrage de la boîte écran (tassement d'effondrement appliqué à `pixelHouseBox`), la pastille de A4 s'ancre dessus et flotterait si elle passait avant.

Effort cumulé : M + L + S/M + M, puis M + M + M.

Pour le joueur : un mode d'effondrement automatique qui se recalibre, un vœu par cycle, une attente d'aubaine lisible, une stèle après un Grand Reset, une caméra qui a du poids, une ville qui se salit avant de tomber, et un bâtiment neuf qui se signale.

---

## 3. Le premier lot, en détail

### 3.0. Correctif D9, table des causes du bilan de cycle (S)

**Fichiers, dans l'ordre.**
1. `src/game/data/epitaphs.js:70-74` en lecture seule (`FAVORED_CAUSE_LABELS`, source du mapping correct).
2. `src/components/ui/CycleReportBanner.jsx:15-20`, remplacer `instability` et `auto_collapse` par `avarice` et `rupture`, en `tr({fr, en})`.
3. `src/game/core/__tests__/cycleReport.test.js`, ajouter les deux causes non exercées.

**Pièges nommés.**
Deux champs `cause` de sens différent : `state.prevCycle.cause` stocke le **reason** (`"manual"`, `"auto_collapse"`, `crisis.js:354`), `state.lastCycleReport.cause` stocke la **cause physique** (`events.js:165`). Même piège sur `peakPop` : `lastCycleReport.peakPop` passe par `crediblePopulation` (`events.js:156`) donc ce sont des Habitants, `prevCycle.peakPop` est la ressource brute (`crisis.js:353`) donc du Rayonnement, et le bandeau libelle « habitants ». Ne pas croiser les deux.
Le champ `at` (`events.js:171`) n'est lu nulle part : sur le chemin Edit il n'y a pas de `openView("city")` (`events.js:180`), donc si le joueur est ailleurs le bilan surgit à la prochaine ouverture de la Cité, plusieurs minutes après. Brancher la péremption ou l'assumer.

**Unitaire.** Itérer sur les quatre valeurs de `collapseCause()` et échouer si le libellé rendu est égal à la clé. Ce test aurait attrapé le défaut du premier coup.

**En jeu.** Que `.idle-report` ne recouvre pas `.cycle-report` sur une carte étroite (`views-misc.css:121` et `187`, même `top: 3.2rem`), cas réel : retour d'absence puis effondrement dans les secondes qui suivent.

### 3.1. B1, une seule infobulle (M)

**Fichiers, dans l'ordre.**
1. `src/components/ui/HelpBubble.jsx`. Accepter un contenu structuré dans `tipProps` (signature ligne 35, garde `if (!text) return {}` ligne 36) sans casser les 23 sites d'appel existants, et corriger la bulle orpheline dans le même geste (`AUDIT-2026-07-21.md:347` : `tipProps` ne pose que `onMouseLeave`/`onBlur`, un démontage de la cible ne tire aucun des deux).
2. `src/App.jsx`, monter `HelpBubbleLayer` à côté d'`OutcomeFloatLayer` (ligne 344).
3. `src/components/views/RegulationView.jsx:39`, retirer la couche locale. `showFn` est un singleton de module (`HelpBubble.jsx:13`, écrit sans garde d'unicité lignes 47-55) : deux instances montées se voleraient la référence.
4. `src/components/ui/Topbar.jsx`. Les 5 tooltips (objet 83-104), l'attribut ligne 141, et **garder** le `title` de valeur exacte ligne 154 qui répond à une autre question. Deux `title` ajoutés depuis : ligne 164 (« figé ») et 197 (6e cellule Habitants). Au passage, le tooltip population ligne 85 répète « Habitants estimés » alors que la 6e cellule affiche déjà ce chiffre ligne 205.
5. `src/components/ui/PurchaseRow.jsx`, 10 `title` (143, 147, 170, 182, 195, 208, 222, 241, 259, 269).
6. `src/components/ui/CityStatusPanel.jsx`, 11 `title` (102, 118, 144, 149, 154, 159, 171, 191, 232, 247, 251).
7. `src/styles/views-regulation.css:1292-1324` vers `src/styles/components.css`, en sachant que c'est une **baisse** de priorité.

**Pièges nommés.**
Les `<dialog>` sont dans le top layer : `ChoiceDialog` appelle `showModal()` (`ChoiceDialog.jsx:28` et `47`), Options / Import / Debug sont aussi des `<dialog>`. Une bulle en z-index 80 sera peinte dessous quel que soit le z-index. Ne pas migrer les `title` d'`OptionsDialog` ni de `ChoiceDialog` dans ce lot.
Les 5 tooltips de la Topbar contiennent des `\n` (85-86, 89-90, 93-94, 97-98, 101-102) : le contenu structuré doit arriver **en même temps** que la migration Topbar, pas après, sinon la Topbar régresse.
Le texte est figé au `mouseenter` (`showTipAt`, 15-27), or la Topbar se re-rend à chaque tick (elle appelle `cityVitals()` et `rates()` lignes 48-50) et ses tooltips contiennent des valeurs vivantes. Avec le `title` natif le gel ne se voyait pas.
`FaveurShop.jsx` est **mort** : aucun import dans le dépôt (`AUDIT-2026-07-21.md:505`). Ne pas le migrer.
`etaLabel` (`PurchaseRow.jsx:356`) est une chaîne déjà formatée pour rester comparable comme une primitive par `arePropsEqual` (284-308). Ne pas la transformer en objet.
`.app` porte `filter: grayscale(1)` en deuil (`layout.css:11-13`) : ce filtre crée un bloc conteneur et casse le `position:fixed` de la couche.
Accessibilité : la bulle a `role="tooltip"` (ligne 61) mais aucun `aria-describedby`. Retirer un `title` sans compensation supprime l'information pour un lecteur d'écran.
Cinq mécaniques de bulle coexistent, pas deux : le `title` natif, `tipProps`, `NodeTooltip` (`RuinsTreePixel.jsx:503`), `.city-map-tooltip` (piloté par le canvas, `CityMapCanvas.jsx:36-39`) et `StageHelp` (`StageHelp.jsx:73`, positionneur maison, contenu JSX libre, choix documenté). Laisser `StageHelp`.

**Unitaire.** Le dépôt n'a ni jsdom ni testing library, aucun composant React n'est monté dans les 82 fichiers de test. Trois fonctions pures seulement : le calcul de placement (rect de la cible plus taille de fenêtre vers `{left, top, flip}`, ce qui couvre la bascule et le clamp à 8 px), la règle « pas deux fois » (horodatage de dernière fermeture vers délai 0 ou 120 ms), et le normaliseur de contenu (chaîne simple contre tableau `{label, value}`, retour vide qui doit continuer à rendre `{}`).

**En jeu.** Survoler une carte de la Topbar puis changer d'onglet. Survoler un libellé de cagnotte puis presser Échap (le cas exact de `AUDIT:347`). Ouvrir les Options en gardant une bulle ouverte. Survoler une rangée pendant que l'ETA de B5 se met à jour. Passer en deuil avec une bulle ouverte.

### 3.2. B2, anatomie du multiplicateur global (M)

**Fichiers, dans l'ordre.**
1. `src/game/core/mechanics/production/globalMultipliers.js`. Écrire une fonction de décomposition **séparée**, et ne pas toucher à la ligne 187 (le produit des 16 termes). `globalScalarFactors` (136-182) rend déjà 8 facteurs nommés et n'est pas cachée, donc une fonction d'affichage qui la rappelle ne touche à aucun cache de frame.
2. `src/game/core/mechanics/production.js:36-47`, le barrel, sans lequel la fonction n'est pas atteignable depuis l'UI.
3. Le composant, sur le patron visuel de `PressureAnatomy.jsx:26-37` mais **pas** en réutilisant `AnatomyRow` : sa barre attend un ratio 0..1 rendu par `pct()` (`utils.js:156`, clampé à 999 %), sa couleur vient de `FOYER_TONE` indexé par 6 foyers, son icône est une URL `/pixelart/ui/foyers/`.
4. L'hôte, `src/components/ui/CityStatusPanel.jsx:149-153` (tuile Multi.) ou `src/components/views/ChronicleView.jsx:118-123` selon la question 3.
5. `src/styles/layout.css`, pas `components.css`.

**Pièges nommés.**
Trois facteurs et le total peuvent valoir `Infinity` en fin de partie, moment où `rates()` bascule sur `globalMultiplierDec` (`rates.js:178`), et `fmt()` rend `inf` (`utils.js:152`). Détecter le non fini et écrire « au delà du float ».
La tuile dit multiplicateur de production, mais `rates.js:124-125` n'applique que `Math.sqrt(mult)` à la nourriture et au trésor. `BuildingShop.jsx:108` calcule déjà `sqrtGlobalMult`. Taire cette règle apprend une fausse leçon.
Beaucoup de multiplicateurs ne sont pas dans `globalMultiplier` (`rates.js:118-138` : effet d'épitaphe, vitals, effets de ruines par ressource, crise, préparation terminale, Cadmos, bonus marchés et guildes sur l'or, drain Atrides à 0,9, `eneeDegraded` qui met nourriture et or à zéro). Ne pas appeler l'écran « anatomie de la production », c'est l'anatomie d'une couche.
Ne pas éclater `ruinTreeMult` (agrégat de braise, vestiges, cendres fertiles, dogme Abîme, lignes 169-176) dans le produit de la ligne 187 : changer l'associativité peut déplacer les derniers chiffres et faire bouger les snapshots d'`economy.golden.test.js` (`STABLE_SIG = 12`, ligne 33). Exposer les sous facteurs pour l'affichage seulement.
`globalScalarFactors` lit `Date.now()` ligne 151 : Atrides (120 s), Énée et Cendres fertiles sont des fenêtres qui expirent, et le total est caché par frame (ligne 185). Lire le total via `globalMultiplier()` une fois et n'afficher les sous totaux que comme dérivés.
Aucune icône n'existe pour les 16 facteurs : `public/pixelart/ui/glyphs` n'en contient que 8, `foyers` que 6, tous pris. Supprimer la colonne icône.
Partie neuve : les 16 facteurs valent 1 sauf infra. Le filtre des neutres laisse un panneau vide au moment où le joueur découvre le bouton.
Notation : `multLabel` (`utils.js:246-249`) rend `+X %` et `pct` clampe à 999 %, ni l'un ni l'autre ne convient à un facteur qui peut valoir 0,5 ou 40. Choisir `x2,4` localement, sans rouvrir la convention écartée du point 4 de B4.

**Unitaire.** Un fichier à côté de `decimal.parity.test.js` : sur `MID_GAME_FIXTURE`, `Date.now()` figé à `FIXED_NOW` et `invalidateRenderCache('all')`, le produit des facteurs rendus égale `globalMultiplier()` à 1e-12 près, les 16 clés sont présentes et dans l'ordre, le cas non fini est signalé. Le test doit **échouer si un facteur est ajouté ligne 187 sans être ajouté à la décomposition** : c'est le seul garde fou contre la dérive.

**En jeu.** La lisibilité entre 981 et 1500 px (gouttière de 4,5 rem, `layout.css:389-413` masque déjà `.csp-label`, `.csp-value`, `.csp-stat-label`), le comportement du calque près du bas de l'écran, l'état vide en partie neuve.

### 3.3. B3, les Comptes de la cité (L)

**Fichiers, dans l'ordre.**
1. `src/game/core/mechanics/production/buildingOutput.js`. Nouvelle fonction de contribution par bâtiment, **hors** du cache `renderCache._buildingSums` (lignes 61 et 123), avec la branche Decimal quand `sums.overflow` est vrai (104-121).
2. `src/game/core/mechanics/production/rates.js` en lecture, pour rejouer les facteurs par catégorie (102-113 : Babel exponentiel sur `state.babelCategory`, `babelCommonTongueMult(cat)`, bonus Héphaïstos réservé à `cat === 'infra'`) et le bonus marchés et guildes sur l'or (125).
3. `src/components/views/ChronicleView.jsx`, **composant séparé**, jamais niché dans `CivilizationReview` qui s'abonne à `playTimeSec` (ligne 87) et se re-rend chaque seconde.
4. `src/styles/views-chronicle-timeline.css`.
5. `src/components/ui/Topbar.jsx`, point d'entrée cliquable, seulement si la question 4 est tranchée.

**Pièges nommés.**
Il n'y a que **trois** catégories dans tout le jeu : `city`, `knowledge`, `infra` (`BuildingShop.jsx:39-43`, le fallback `'other'` de `buildingOutput.js:82` n'est jamais atteint). Une barre à trois segments n'apprend presque rien : la valeur réelle est le classement par bâtiment.
Le débit de la Topbar contient des termes qui ne viennent d'aucun bâtiment (`rates.js:96-98` : pop 0,04, food = population x 0,012, gold = max(0, population - 25) x 0,0015, et `theocracyKnowledgeRate()` ligne 126). Une barre qui ne montre que les catégories ne somme pas au total affiché, et le joueur le verra.
Rendre la Topbar cliquable est un changement de nature : elle est purement contemplative aujourd'hui (`components.css:97` `cursor: default`, 115-119 survol neutralisé), et un état de survol y sera visible sur toute la largeur.
Le piège `valueOf` : décider du type en entrée de fonction, pas au fil de la boucle. Les parts se calculent par `.div()` puis `toNum` sur le seul ratio.

**Unitaire.** La somme des contributions par bâtiment égale la somme par catégorie de `getBuildingSums`, pour les deux chemins (float et Decimal forcé). La nouvelle fonction n'écrit jamais dans `renderCache._buildingSums`. Les parts somment à 1 à epsilon près et restent finies quand un bâtiment déborde le float. Un état sans aucun bâtiment ne produit ni NaN ni division par zéro.

**En jeu.** La lisibilité de la barre à trois segments, l'ouverture de la Chronique depuis la Topbar et l'atterrissage sur la bonne section, le ressenti d'un total qui ne colle pas au bandeau si le socle n'est pas montré.

---

## 4. Les questions à trancher

### Q1. Le dénominateur commun (bloque B3, puis B6)

B2, B3, B6 et B7 répondent toutes à « d'où vient ma production » et arriveraient avec trois conventions différentes. Une seule décision, avant la première des quatre.

- **Option base bâtiments** : sommes de `getBuildingSums`, propre et testable, mais le total ne colle pas au bandeau du haut (`rates.js:96-98` et `126`).
- **Option débit affiché** : colle à ce que le joueur voit, mais oblige à un segment « socle de la cité » explicite et à rejouer les facteurs par catégorie (`rates.js:102-113`).

Coût : nul si tranché maintenant, une réécriture de B6 et B7 si tranché après B3.

### Q2. Où loger la pile de B2 (bloque B2)

La sidebar ne peut pas l'accueillir dépliée : `layout.css:52-62`, `height:100vh`, flex colonne, **sans overflow**, `CityStatusPanel` collé en bas par `margin-top:auto`, et gouttière à 4,5 rem entre 981 et 1500 px.

- **Calque flottant** ancré à la tuile Multi., patron existant `HelpBubbleLayer` (`HelpBubble.jsx:45-67`). Coût : un positionneur, et une dépendance à B1 si la pile passe par la bulle.
- **Section dans la Chronique**, sous la tuile Multi. de production qui existe déjà (`ChronicleView.jsx:118-123`) avec son hint en prose qui énumère les sources. Coût : nul en positionnement, mais B2 rend ce hint obsolète et il faut le remplacer. C'est aussi ce qui rapproche B2 de B3.

### Q3. Le mutisme de l'apparition économique (bloque le point 2 de D6)

Le commentaire de design est toujours là, `BuildingShop.jsx:362-365`, et il protège le seuil de `shared.js:27-30` (pic du cycle supérieur ou égal à 25 % du coût de base, `BUILDING_REVEAL_PEAK_FRACTION`, `balance.js:1026`). Trois options maintenant, pas deux, parce que B9 a livré un précédent de jauge anonyme.

- **A, garder le mutisme.** Coût nul, on livre le point 1 seul (latch à vie plus dépêche). Bénéfice caché : aucun abonnement de `BuildingShop` ne lit `state.cyclePeaks`, donc l'apparition d'un bâtiment ne provoque aucun rendu par elle même aujourd'hui, elle attend qu'une autre signature bouge. Le latch corrige ce retard gratuitement.
- **B, jauge chiffrée.** Publie le seuil. Deux coûts non chiffrés par la fiche : `completeCollapse` vide `state.buildings` (`crisis.js:447`) et `resetCyclePeaks` remet les pics au socle (`crisis.js:486`), donc la barre repart de zéro toutes les deux ou trois minutes et rend visible un recul aujourd'hui invisible ; et sur 15 des 30 bâtiments le verrou qui mord est le cycle, testé en premier (`shared.js:19`), donc la jauge peut afficher 100 % sous un bâtiment qui n'apparaîtra pas.
- **C, jauge anonyme, modèle B9.** Barre seule, ni devise ni chiffre. `GrandResetLadder.jsx:197-218` et les classes `.gr-gauge*` (`views-shop-myths.css:796-828`) existent. Ne publie aucun seuil, enlève le sentiment que rien ne se passe, et le recul par cycle se ressent comme une respiration au lieu d'une perte.

### Q4. Le périmètre de B1 (fait basculer l'effort de M à L)

Chrome hors carte seulement (Topbar, PurchaseRow, CityStatusPanel, soit 26 `title` sur 146), ou aussi les 35 `title` de `CityView.jsx` et les trois autres mécaniques de bulle (`NodeTooltip`, `.city-map-tooltip`, `StageHelp`) ? Rappel : chaque fiche livrée avant B1 ajoute des `title`, donc la troisième voie « la livrer tard quand ce sera stable » n'existe pas.

### Q5. Le vocabulaire des pastilles d'onglet (bloque E11, et le point pastille de D6)

`tabBadges.js:5-16` pose une règle écrite : ne badger que ce qui est **gratuit ou dû**, et le module ne badge que `prestige` et `ruinsView` (34-42). Ni « nouveau » (E11) ni « bâtiment apparu » (D6) n'entre dans cette règle. Les trois visent le même `<span className="tab-badge">` (`App.jsx:261-271`), dans un `.tab` dont le `clip-path` interdit toute position absolue.

Collision réelle mesurée : les onglets qui se débloquent sont `ruinsView`, `tech`, `mythView`, `comptoir`, les onglets badgés sont `prestige` et `ruinsView`. L'intersection est **un seul onglet**, `ruinsView`, pendant une fenêtre courte.

- **Option point sans chiffre** pour « nouveau », priorité sur le compteur doré. Coût : quelques lignes de `layout.css` à côté de 125-145, et un second `title` (l'actuel, `App.jsx:264-267`, dit « à réclamer, sans rien dépenser », faux pour un onglet neuf).
- **Option même gabarit avec priorité** : moins de CSS, mais un « nouveau » se lit comme un compteur à 1.

Ne pas faire passer « nouveau » par `tabBadgeCounts()` : la fonction rend `{}` pendant une crise ouverte (ligne 35), la pastille disparaîtrait sans raison.

### Q6. Un seul contrôle de mouvement ou deux lignes (bloque E4, donc E12 et E7)

« Vie de la carte » existe déjà (`OptionsDialog.jsx:511-539`) avec trois crans et sa clé localStorage propre (`ambianceMode.js`). Deux frictions à trancher en même temps : la cardinalité (le bloc `base.css:7-16` coupe en `!important`, il n'y a pas de demi mesure CSS, donc le cran intermédiaire à 0,4 ne peut couper que la carte), et la persistance (deux clés derrière un bouton si `uiPrefs.js` en crée une seconde ; la voie propre est que `uiPrefs` délègue à `setAmbianceMode()`, module feuille sans import, aucun cycle possible).

Point neuf hors fiche à décider ici : `prefers-reduced-motion` ne coupe rien de la carte aujourd'hui (le canvas est du JS et n'écoute pas la media query). Un joueur dont le système demande moins de mouvement a l'interface figée et la carte en pleine agitation.

### Q7. L'ancre des bandeaux de scène (bloque D8, lot 4)

`.cycle-report` (`views-misc.css:121`) et `.idle-report` (187) sont tous deux en `top: 3.2rem` sur `.city-stage`, montés côte à côte (`CityView.jsx:334` et `336`). D8 serait le troisième. Et `.cycle-report` est en `pointer-events: none` (127), donc copier son style tel quel rend une stèle « passable au clic » incliquable. Décider la règle d'ancrage avant de livrer D8, pas après.

---

## 5. Ce que je propose d'abandonner

### D9, sans objet

Livrée par `68ef77e`. Il reste 4 lignes de correctif, traitées en tête du lot 1. Corriger l'inventaire des livraisons du dossier.

### D12, abandon, avec une contre proposition à un dixième du coût

Quatre raisons, toutes ancrées.

1. Le jeu porte déjà **trois** systèmes de contrainte contre récompense, pas un : les 14 Mythes (`myths.js:312`, plus 753 lignes d'actions, 234 de ticks, 78 appels de `isMythEffectActive` dans 16 fichiers), la doctrine de crise, et les Ruines actives (`activeRuins.js`, fardeaux opt-in avec bonus de moisson). D12 serait le quatrième, et le seul jetable.
2. Le seul point d'accroche neuf est le plus dangereux : aucun Mythe ne bloque dans `runCrisisAction` aujourd'hui (les usages dans `crisis.js` sont en 142, 174 et 357). La garde serait neuve, sur une fonction à 8 appelants dont `steward.js:122` et `automation.js:209`. Une épreuve qui interdit d'apaiser neutralise l'intendant et les automates que le joueur a payés.
3. Le contenu s'éteint à vie au premier Grand Reset (`GR_MILESTONE_THRESHOLDS.cycles = 10`, `grandResetMilestones.js:30`). Onze fichiers de production pour quelques heures de jeu.
4. Le trou visé est déjà à moitié bouché, mais invisible : l'Olympe marque des points **dès le cycle 0** (`olympus.js:60-91`, appelé depuis `crisis.js` sans aucune garde sur `grandResetCount`), et son unique écran vit dans `MythsView.jsx:125-160`, derrière `isMythsUnlocked = grandResetCount >= 1` (`App.jsx:171`).

**Contre proposition, une fiche S** : sortir la section `olympus-*` de `MythsView.jsx` vers un composant montable depuis `PrestigeView` (onglet `unlocked: true`, `App.jsx:184`). Zéro mécanique neuve, zéro champ d'état, zéro garde dans `runCrisisAction`. Le joueur découvre que la manière dont il règne est déjà notée.

Si l'auteur tient aux épreuves, la seule version défendable ne touche pas `runCrisisAction` et se limite aux deux gardes existantes (`buyBuildingCore`, `building.js:79-82`, et `timeWearRate`, `prestige.js:201-229`), avec une récompense en Ruines et **jamais** en Bénédiction, parce qu'une Bénédiction en cours refuse le versement de clepsydre (`main.js:409-411`).

### A11, abandon en l'état

L'effort est L, la livraison est au plus **trois** tombes grises alignées (`layout.js:2156`), et le record ne contient aucune cause de chute (`layout.js:2146-2155`). En prime, élargir la boîte de `cmClampCamera` (`cityMapRuntime.js:322`) abaisse le plancher de zoom (336-338), donc oblige à revalider le cadrage de départ et tout le ressenti de A9. Trois autres surfaces racontent déjà la mémoire des cycles morts (le bilan D9, la stèle de chute manuelle, la stèle de Grand Reset de D8).

À rouvrir seulement si l'auteur accepte deux décisions de design : conserver plus de trois vestiges, et ajouter la cause de la chute au record via `captureVestige` (`crisis.js:411`).

### B7, abandon

La cible n'existe plus. La plaque de ressources est une grille nommée à trois rangées (`components.css:149-173`) avec une **hauteur fixe** en vue Cité et un commentaire explicite (`components.css:394-398`) disant qu'une rangée de plus n'y tient pas. La cellule porte `container-type: inline-size` (`components.css:100`) parce que l'odomètre se mesure en `cqw` : y insérer un élément de largeur fixe change la largeur lue par le cadran à toutes les tailles d'écran, régression invisible en test.

Deux défauts de fond en plus : les débits peuvent être **négatifs** (c'est le cas nominal de la Nourriture en déficit, `Topbar.jsx:52-53` et `175`) donc `log10` rend NaN exactement quand la courbe sert le plus, et `annals.js:10-12` acte une décision de 2026-07-13 selon laquelle les annales regardent le passé seulement, aucune projection dérivée, proposition déjà rejetée une fois.

B3 répond à la même question avec un écran qui a de la place.

### Points de fiche à retirer du périmètre, sans abandonner la fiche

- **E5 point 3** : fait (`Topbar.jsx:110-131`).
- **E5, paragraphe Risque** : sans objet, `quantizeEta` (`utils.js:196-202`) empêche le clignotement par construction.
- **D6 point 3** tel qu'écrit : les dépendances proposées (buildings, cycles, ère) gèleraient l'apparition économique, `isUnlocked` ne lit que `state.buildings`, `state.cycles` et `state.cyclePeaks` (`shared.js:18-30`).
- **D6, la pastille d'onglet** : contredite par la règle de `tabBadges.js:5-16`, voir Q5.
- **D10 point 5** (pondération du tirage) : sans objet, les 5 aubaines ont la même taille. La correction utile à la place est de ne tirer que parmi les ressources qui produisent, ce qui règle l'aubaine annulée en silence (`tick.js:438`, `fireBoon` sort sans rien créditer alors que `maybeFireBoon` a déjà reprogrammé l'horloge ligne 456).
- **D10, la modulation par `isNotifyPaused`** : inopérante, le drapeau n'est levé que par `simulateAwayCrises` (`main.js:242`), chemin qui exige `hephHeritage` et `edit_effondrement` (`main.js:225` et `378`).
- **E7 point 2** tel qu'écrit : le `<div key={activeView}>` intercalé casse trois vues par deux mécanismes distincts (le flex de Régulation, et le `translateY` qui fait du div un bloc conteneur sous lequel `inset:0` se résout contre une hauteur nulle pour Cité et Ruines). Porter la clé sur `<main>` ou sur chaque racine de vue.
- **E11 point 3** tel qu'écrit : `StageHelp` est une infobulle de survol sans bouton de fermeture, pilotée uniquement par `onMouseEnter`/`onMouseLeave` (`StageHelp.jsx:62-70`). Réutiliser son **positionneur** (12-18 et 29-44, écrit pour contourner le Chromium de l'.exe), pas son composant.
- **E12 point 5** : le mode deuil est un `filter: grayscale(1) brightness(0.2)` sur toute l'application (`layout.css:11-13`). Aucune valeur de jeton ne peut sauver un rapport de contraste là dessous. Limiter le garde fou à la vignette de crise (`--crisis-level`, `App.jsx:234`, `layout.css:24-25`).
- **E8, ajout hors fiche** : `index.html:2` déclare `lang="fr"` en dur et `setLang` (`i18n.js:39`) ne touche jamais `document.documentElement.lang`. Un joueur en anglais reçoit tout le jeu annoncé en français par la synthèse vocale. Une ligne, à mettre dans le même lot.

---

# Annexe A. Collisions de fichiers entre fiches

# Collisions de fichiers entre les 23 fiches restantes

Établi en relisant chaque fichier touché par 2 fiches ou plus dans le code d'aujourd'hui (HEAD `0b02e24`).

---

## 1. Matrice fichier → fiches

Seuls les fichiers touchés par **2 fiches vivantes ou plus**. Entre parenthèses, les fiches déjà livrées qui occupent déjà la zone.

### Moteur / état

| Fichier | Fiches | Zone commune |
|---|---|---|
| `src/game/core/state.js` | **D2 D6 D8 D10 D11 D12 B7 E11 E1** (+D9) | les 4 mêmes sites : `defaultState`, liste blanche de `hydrateState`, `resetTemporaryRunState:1699`, `GR_PERSISTENT_FIELDS:1825` |
| `src/game/core/actions/tick.js` | **D2 D6 D10 D12 B7** | corps de `tick()` |
| `src/game/core/actions/crisis.js` | **D2 D11 D12 A11** | `completeCollapse` (330-521) pour trois d'entre elles |
| `src/game/core/actions/building.js` | **A4 D8 D12 B7** | `buyBuildingCore:79-109` (A4/D12) et `performGrandReset:362-378` (D8/B7) |
| `src/game/core/main.js` | **D2 D11** | boucle `simulateAwayCrises` (260-279) et `checkAutoCollapse` (509-558) |
| `.../mechanics/prestige.js` | **D11 D12** | `ruinGain:122` (lecture) vs `timeWearRate:201-229` — disjoint |
| `.../production/buildingOutput.js` | **B3 B6** | `getBuildingSums:60-132` vs `buildingOutputMultiplier:20-40` |
| `src/hooks/useCityViewState.js` | **D2 D10** | le même objet de sélecteur |
| `__tests__/i18n.coverage.test.js` | **D2 D12** | la liste d'imports 13-26 |

### Composants

| Fichier | Fiches | Zone commune |
|---|---|---|
| `src/App.jsx` | **B1 A9 D12 E7 E8 E11** | `handleKeyDown:102-148`, table `tabs:181-191` + rendu `244-273`, `<main>:294`, `<Suspense>:307-323` |
| `src/components/ui/CityStatusPanel.jsx` | **B1 B2 D2 D10** | tuile Multi. `149-153` et la pile de blocs conditionnels `169-256` |
| `src/components/ui/Topbar.jsx` | **B1 B3 B7** | **le même bloc JSX 137-191**, carte de ressource |
| `src/components/ui/BuildingShop.jsx` | **D6 B6 E5** | `categoryData:143-152`, bloc d'abonnements `85-199`, props de `PurchaseRow:337-357` |
| `src/components/ui/PurchaseRow.jsx` | **B1 B6 E5** | `arePropsEqual:284-308` + `pr-prod:155-191` / `pr-footer:217-272` |
| `src/components/views/CityView.jsx` | **D8 E1** (+D9) | `.city-stage:331-336` (D8) et `.city-aux:465` (E1) — disjoint |
| `src/components/views/ChronicleView.jsx` | **B2 B3** | `StatTile`/`StatSection:51-70` et la tuile Multi. `118-123` |
| `src/components/dialogs/OptionsDialog.jsx` | **A9 B6 E4 E12** | table d'onglets `314-371` + panneau `display` |

### Carte

| Fichier | Fiches | Zone commune |
|---|---|---|
| `src/game/map/cityMapRuntime.js` | **A4 A9 A10 A11** | `cmClampCamera:316-355`, `bindCityMapInput:527-600`, bloc de publication par frame `1290-1353` |
| `src/game/map/iso/isoRenderer.js` | **A4 A9 A10 A11** | boucle de collecte `drawIsoLive:4166-4204`, boucle de dessin `4403+`, clé de bake `4756` |

### Styles

| Fichier | Fiches | Zone commune |
|---|---|---|
| `src/styles/layout.css` | **B2 D10 E7 E11** | bloc `.csp-*` 244-413 + **3 media queries 981-1500 px** (389, 620, 690, 711, 734) ; `.tab-badge:125` |
| `src/styles/components.css` | **B1 B7 E8** | `.sr-only:1289`, grille de carte topbar `149-173` |
| `src/styles/purchase.css` | **D6 B6 E5** | bas de rangée : `.pr-eta`, `.pr-footer` |
| `src/styles/variables.css` | **B6 E4 E12** | jetons `--state-*:41-43`, échelle `--fs-*:158-165` |
| `src/styles/base.css` | **E4 E12** | bloc `prefers-reduced-motion:5-16` |
| `src/styles/views-misc.css` | **D8 D12** (+D9/B11) | surcouches de scène 116-264 |
| `src/styles/views-regulation.css` | **B1 B2 E7** | `.regul-tip:1292-1324`, `.anatomy-*:200-363`, `main:19-35` |
| `src/styles/views-city-hud.css` | **E1 E4 E7** | `--city-topbar-h:23` / `--odo-cap:30`, `main:33-38`, `.city-aux:161-173` |
| `src/styles/ruinsTree.css` | **E5 E7** | `.rt-*` états de nœud vs `main:131-145` |
| `src/game/core/uiPrefs.js` (neuf) | **E4 E12** | E4 le crée, E12 le consomme |

---

## 2. Collisions réelles, fichier par fichier

### 🔴 `Topbar.jsx` — B1 × B3 × B7 : trois réécritures du même JSX

Le rendu ne compte **qu'un seul bloc de carte** (137-191), répété par `.map()`. Les trois fiches y touchent :

- **B1** enlève `title={tooltips[c.key]}` (l. 141) et pose un spread `tipProps` sur `.resource-card-unified` ;
- **B3** veut faire du **nom** (l. 147, dans `.resource-title-wrapper`) un point d'entrée cliquable ;
- **B7** insère un `<svg>` dans `.resource-rate-row` (l. 162).

Elles ne se voient pas en tant que lignes, mais **elles se contredisent en tant que comportement** : `tipProps` pose `onMouseEnter/onMouseLeave/onFocus/onBlur` sur la carte entière, et B3 ajoute un `<button>` **à l'intérieur** de cette même carte. Survoler le nom déclenche alors la bulle du parent pendant qu'on vise un bouton : deux affordances superposées sur 40 px. Il faut décider si la bulle vit sur la carte (B1) ou sur les sous-éléments avant d'y mettre un contrôle.

Second point mesuré : la carte est une **grille nommée à trois rangées** (`components.css:149-173`) avec `--odo-cap: calc(var(--city-topbar-h) - 78px)` (`views-city-hud.css:30`) et `container-type: inline-size` sur la cellule. B7 insérant un élément de largeur fixe dans la rangée `debit` change la largeur de conteneur lue en `cqw` par l'odomètre. C'est une régression invisible en test.

### 🔴 `BuildingShop.jsx` — D6 × B6 × E5 : le seul composant `memo()` sans props du dépôt

Vérifié : le dépôt ne compte que **deux** composants mémoïsés, `BuildingShop.jsx:403` (`memo(BuildingShop)`, sans comparateur, sans props) et `PurchaseRow.jsx:310`. Tout ce qui doit vivre à la seconde dans la boutique passe donc par un `useGameState` à **signature quantifiée**, et le fichier en porte déjà deux exemples explicites (`globalMult` arrondi à 4 chiffres significatifs l. 98-107, `etaSig` bâti sur le libellé déjà quantifié l. 177-199).

Les trois fiches veulent chacune y ajouter un abonnement :
- **D6** : un compteur de version de révélation + une jauge de progression (`cyclePeaks` — **aujourd'hui aucun abonnement du composant ne lit `cyclePeaks`**) ;
- **B6** : le gain marginal par rangée, déjà formaté ;
- **E5** : l'état achetable / bientôt / verrouillé, dérivé de `lackingKey` (l. 328) et du délai B5.

Trois balayages supplémentaires des 30 bâtiments par tick, chacun capable à lui seul de casser le `memo()` de toute la boutique s'il n'est pas quantifié. **Ils doivent partager un seul sélecteur**, sur le modèle d'`etaSig`, pas en ouvrir trois.

Sur `categoryData` (l. 143-152) : D6 point 3 est le seul qui donne une dépendance correcte pour la mémoïser (un compteur de version bumpé par le latch). B6 point 5 veut trier ce même `categoryData`. B6 est donc **techniquement dépendant** de D6.

### 🔴 `PurchaseRow.jsx` — B1 × B6 × E5 : le goulot `arePropsEqual`

`arePropsEqual:284-308` compare 14 props et porte **déjà deux commentaires d'avertissement** écrits par C8 (297-299) et B5 (303-305). B6 ajoute une prop de gain, E5 une prop d'état : chacune oubliée **fige son affichage en silence**. Il n'y a aucun test qui protège cette fonction.

Danger spécifique à B1 : `etaLabel` (l. 356) est une **chaîne déjà formatée** justement pour rester comparable comme une primitive. Si B1 rend `tipProps` structuré et transforme un libellé en objet, la comparaison de primitives tombe et **toutes** les rangées se re-rendent au tick.

Place : le `pr-footer` (217-272) est plein (bouton + coûts + épingle C8 + compteur). Les emplacements libres sont `.pr-prod` (155-191, qui porte déjà « effet indirect » et le chip de réseau des routes) et la ligne `.pr-eta` (205-215). **B6 et E5 visent le même centimètre carré**, déjà occupé par B5.

### 🟠 `CityStatusPanel.jsx` — B1 × B2 × D2 × D10 : quatre blocs pour une gouttière de 4,5 rem

Correction importante par rapport aux fiches : **le composant n'est pas `memo()`** (l. 42, `export default function` nu) et il consomme `useCityViewState`, dont la signature contient `tickNow` (`useCityViewState.js:76`). **Il se re-rend déjà à 1 Hz**, ce que le bloc B9 écrit noir sur blanc l. 225-228. Ni D2 ni D10 n'ont besoin d'un abonnement quantifié supplémentaire ; ajouter des champs plats à `useCityViewState` suffit et ne coûte rien.

La collision réelle est **spatiale et CSS** :
- B1 migre les 11 `title` du fichier, dont celui de la tuile Multi. (l. 149) ;
- B2 rend cette **même** tuile cliquable ;
- D2 et D10 ajoutent chacun un bloc après les quatre existants (réserve C2 169-186, clepsydre C7 188-223, sceaux B9 229-242, sauvegarde C10 246-256).

Et `layout.css` masque déjà `.csp-label`, `.csp-value`, `.csp-laps`, `.csp-stat-label` entre 981 et 1500 px (l. 389-413), avec **trois blocs media supplémentaires** ajoutés au coup par coup pour la réserve (620), la clepsydre (690), les sceaux (711) et la sauvegarde (734). Toute nouvelle ligne doit ajouter son propre bloc media : quatre fiches, quatre blocs de plus dans un fichier qui en compte déjà cinq pour le même breakpoint.

### 🟠 `App.jsx` — six fiches, quatre zones

| Zone | Fiches | Verdict |
|---|---|---|
| `lazy()` 27-37 | E7 | seule |
| `handleKeyDown` 102-148 | **A9 E8** | A9 ajoute des touches caméra, E8 déplace le focus au changement de vue. Cohabitent, **mais A9 ne doit pas coder en dur** : `E`/`M`/`S`/`I` sont partis dans `shortcuts.js` avec C11, et `Échap` (103-117) porte un commentaire disant qu'il n'est *pas* réattribuable. Un bloc caméra en dur recrée la double source que C11 vient de supprimer. |
| table `tabs` 181-191 + rendu 244-273 | **E11 D12** | **collision franche.** Le rendu porte déjà `.tab-badge` de B10 (261-271) avec un commentaire de 6 lignes expliquant que le `clip-path` de `.tab` interdit toute pastille en position absolue. E11 veut une seconde pastille au même endroit ; D12 veut peut-être un onglet/pastille d'épreuves. |
| `<main>` 294 + `<Suspense>` 307-323 | **E7 E8** | **collision structurelle**, voir ci-dessous. |
| `<OutcomeFloatLayer/>` 344 | B1 | seule (monte `HelpBubbleLayer` à côté) |

### 🔴 `<main>` — E7 casse ce que E8 veut annoter

Trois vues prennent `<main>` comme parent direct **et compteur de dimension** :
- `views-city-hud.css:33-44` — `main { position:relative; height:100vh; overflow:hidden }` puis `.view.active#city { position:absolute; inset:0 }` ;
- `ruinsTree.css:131-145` — même schéma ;
- `views-regulation.css:19-35` — `main { display:flex; flex-direction:column; height:100vh }` puis `#regulation.view.active { flex:1 1 auto }`.

Le point 2 de E7 (un `<div key={activeView}>` intercalé) casse ces trois vues par **deux mécanismes distincts** :
1. sur Régulation, le div devient le flex-item : `#regulation` perd son `flex:1` et son `min-height:0` ;
2. sur Cité et Ruines, tant que le div reste statique le `position:absolute; inset:0` continue de se résoudre contre `main` — **mais dès que E7 applique le `translateY` annoncé, le div devient bloc conteneur** et `inset:0` se résout contre une boîte de hauteur nulle : la carte disparaît.

Corollaire : ce même `transform` déplacerait tous les descendants `position:fixed`, dont le feuillet `StageHelp` (`StageHelp.jsx:12-18`, positionneur JS en coordonnées viewport) que E11 veut réutiliser.

E8 pose son `aria-label` et sa cible de focus **sur `<main>` ou sur la racine de vue** : il faut donc que E7 ait tranché où vit le conteneur avant que E8 ne l'annote.

### 🟠 `cityMapRuntime.js` + `isoRenderer.js` — A4 × A9 × A10 × A11

**Caméra.** `cmClampCamera` (316-355) est la dernière autorité : elle est appelée une fois par frame et **ré-écrit** `CM.cam.x/y/zoom`, avec un plancher de zoom calculé sur l'étendue projetée de la boîte (l. 336-338).
- A9 y branche une interpolation `zoomGoal`/`camGoal` — **après** le clamp, sinon la caméra sort de la boîte une frame sur deux ;
- A11 **élargit la boîte** (`bx0`, l. 322) pour atteindre la nécropole, ce qui **abaisse mécaniquement le plancher de zoom** et change le cadrage de départ (`cityMapCenterCamera`).

Livrer A11 après A9 oblige à revalider tout le ressenti d'inertie de A9. **A9 avant A11.**

**Tri peintre.** Il n'y a **qu'une** boucle de collecte (`drawIsoLive:4166`, `for (const t of L.tiles)`), **un** tri, et **une** boucle de dessin (l. 4403, `for (const it of items)`).
- A10 modifie la boucle de collecte (tassement par tuile) *et* la boucle de dessin (fumée résiduelle, suie) ;
- A4 pousse un item `badge` à la profondeur du bâtiment, sur le modèle exact de l'item `smoke` (l. 4204, `d + 0.001`) et de son dessin (l. 4546, via `pixelHouseBox`) ;
- A11 a besoin d'une passe **hors** de ce pipeline : ses tombes vivent en coordonnées monde en dehors de la `gridN`, donc hors du bake du sol et hors de `visibleCellBounds`.

A4 ancre sa pastille sur `pixelHouseBox`. Si A10 introduit un décalage vertical d'effondrement appliqué au dessin de la tuile, **A4 doit hériter du même décalage** ou la pastille flottera. A10 fixe la convention d'ancrage → **A10 avant A4**.

**Clé de bake.** `isoRenderer.js:4756` : `'iso:' + layoutRecomputeAt + ':' + zoom + ':' + eraBand + ':s' + CM.season + preview`. A10 veut y ajouter un cran d'usure — mais `crisisBand` (`cityMapRuntime.js:640-641`) **entre déjà dans `coreSig`**, donc une bascule de bande force déjà un recompute complet et une recuisson. A9 et A4, eux, font bouger la caméra en continu et **repoussent** la recuisson tant que `CM._igMoveAt` est frais (`ISO_SETTLE_MS = 110`, l. 4728/4780). Les trois fiches se disputent le même budget de recuisson : livrées ensemble sans mesure, on obtient un sol flou en permanence.

### 🟡 `state.js` — neuf fiches, quatre sites, un patron unique

Aucune ne se gêne textuellement (chacune ajoute une clé), mais **toutes** répètent la même séquence en quatre points :

| Champ proposé | Fiche | Portée voulue |
|---|---|---|
| `cycleVow` | D2 | run (à effacer l. 1699) |
| `revealedBuildings` | D6 | **à vie** (dans `GR_PERSISTENT_FIELDS`, pas dans `resetTemporaryRunState`) |
| rapport de GR | D8 | transitoire (forcé à `null` à l'hydratation) |
| durée d'intervalle d'aubaine | D10 | persistant, borné comme `nextBoonAt` (l. 1432) |
| référence de moisson brute | D11 | dans `prevCycle` (l. 350/1044) |
| `activeTrial` + `trialsDone` | D12 | run + à vie |
| 5 séries d'annales | B7 | hors sauvegarde (module-scope) |
| `uiSeen` | E11 | à vie |
| `onboarding` | E1 | à vie |

Le piège partagé, non signalé par les fiches : `hydrateState` construit par **liste blanche** sans `...source` de rattrapage — un champ sans ligne de normalisation est perdu à chaque F5, sans erreur. Et l'ordre de module compte (`buildingById` déclaré avant `state = load()` pour éviter la TDZ documentée en mémoire). **La première fiche livrée doit poser le patron et son test ; les huit suivantes le copient.**

Deuxième règle partagée, sur `tick()` : la convention `isNotifyPaused` vs `isOfflineSim` (C12) n'est **pas** ce que disent D2 et D10. Le code d'aujourd'hui l'écrit explicitement l. 346-353 : `celebratePopMilestone` sous `!isNotifyPaused()` (affichage), `maybeFireBoon` sous `!isOfflineSim()` (mécanique). D2 et D12 sont de la mécanique, B7 de l'affichage, D6 doit **latcher inconditionnellement** et ne garder l'annonce sous garde (patron exact `refreshGrandResetReveal`, l. 295-302).

### 🟡 `crisis.js` — D2 × D11 × A11 dans `completeCollapse`

Trois insertions à trois endroits d'une même fonction de 190 lignes :
- **D11** à l. 350, dans le bloc `state.prevCycle` ;
- **A11** à l. 411, dans le `captureCurrentVestige({...})` (la cause de la chute manque au record) ;
- **D2** à l. 519-520, après `resetTemporaryRunState:468` et `resetCyclePeaks:486`.

Pas de conflit de lignes. **Conflit sémantique franc entre D11 et D2** : D11 stocke une référence de moisson pour son seuil ratio, D2 multiplie la moisson par un facteur de vœu. Si D2 passe d'abord, la référence de D11 **inclut** le vœu du cycle précédent et le seuil dérive à chaque cycle sans que rien ne le dise. **D11 avant D2** — ou D2 doit stocker sa référence hors facteur.

### 🟡 `building.js` — A4/D12 en tête, D8/B7 en queue

- `buyBuildingCore:79-109` : **D12** ajoute une garde de catégorie l. 82 (à côté de celle de Babel), **A4** émet la pastille l. 103-109. Le drapeau `silent` (l. 79, commentaire 76-78) est le garde-fou dont A4 a besoin — et il est déjà utilisé par le float doré l. 103. A4 doit s'y adosser, pas en inventer un.
- `performGrandReset:362-378` : **D8** doit attacher son rapport à `fresh` **avant** `setState(fresh)` (l. 364), qui supprime toutes les clés de l'état courant ; **B7** généralise le `resetAnnals()` de la l. 367. Cinq lignes séparent les deux éditions. Aucun conflit sémantique, mais l'une réécrira le contexte de l'autre.

### 🟡 `OptionsDialog.jsx` — A9 × B6 × E4 × E12

La table d'onglets (314-371) compte 5 onglets fixes + 2 conditionnels. **E4 en ajoute un** (Interface), et E12 y loge son mode contraste renforcé. B6 y pose un réglage — **il n'existe pas de groupe « Interface » aujourd'hui**, son réglage va dans `display`, déjà long (langue, format des nombres, jour/nuit, qualité, Vie de la carte 511-539, météo, saison). A9 étend la liste `shortcuts`, générée à partir de `SHORTCUT_DEFS`.

Point de fond, mesuré : **A8 est livré**, « Vie de la carte » existe et pilote `CM.ambianceK` (l. 511-539). Le cran « Mouvement » du point 4 de E4 **doublerait ce contrôle**. E4 doit l'étendre, pas en créer un second — sinon l'onglet Affichage porte deux curseurs qui font la même chose et E7 (fondu d'écran) ne saura pas lequel lire.

### 🟡 CSS — l'ordre de cascade

Ordre réel du barrel (`src/index.css`) :

```
fonts → fontawesome → variables → base → buttons → layout → components
     → views.css (shop-myths, layout-wrapper, crises, regulation, city,
                  world-fullframe, city-hud, misc, chronicle-timeline)
     → purchase → map → typography → eras → ruinsTree → frames → ui-light
```

Conséquences vérifiées :

1. **B1 point 6 est à l'envers.** `components.css` est importé **avant** `views.css` → déplacer `.regul-tip` de `views-regulation.css` vers `components.css` **baisse** sa priorité. Le déplacement reste défendable (une couche globale ne doit pas dépendre d'une feuille de vue), mais pas pour la raison écrite. Et `frames.css` + `ui-light.css` arbitrent **après tout le monde** : toute bulle, pastille ou pip doit être vérifié contre eux.
2. **`purchase.css` passe après `views.css`**, donc après `views-world-fullframe.css` — mais les règles du dock utilisent deux classes (`.city-shop-dock .purchase-row.is-locked-cost { opacity: .58 }`, l. 266) et **gagnent par spécificité quel que soit l'ordre**. E5 doit écrire son sélecteur de pip de façon à atteindre le dock, ou le dupliquer : le dock est l'endroit où le joueur passe le plus de temps.
3. **`layout.css` avant `components.css`** : le style de pastille de E11 doit vivre dans `layout.css` à côté de `.tab .tab-badge` (125-145), sinon il sera arbitré ailleurs. B2, s'il pose une pile flottante en `layout.css`, sera surchargeable par `ui-light.css`.
4. `base.css` est importé tôt : le bloc `prefers-reduced-motion` (5-16) porte des `!important` sur `animation-duration` et `transition-duration`. E4 et E12 y écrivent tous les deux ; E7 en dépend sans le toucher.

---

## 3. Ordre contraint

Paires « X doit passer avant Y », avec le motif exact.

### Contraintes dures (l'inverse produit du travail à refaire ou un bug)

| Ordre | Motif |
|---|---|
| **D11 → D2** | Les deux écrivent dans `completeCollapse`. Si D2 majore la moisson en premier, la référence de gain que D11 stocke (`crisis.js:350`) inclut le facteur de vœu : le seuil ratio dérive de cycle en cycle sans qu'aucun test ne le voie. |
| **A9 → A11** | A11 élargit la boîte de `cmClampCamera:322` ; le plancher de zoom (l. 336-338) et le cadrage de départ en dépendent. Toute l'inertie et le pincement de A9 sont à revalider si A11 passe après. |
| **A9 → A4** | `camGoal` et son rattrapage amorti sont le **même** mécanisme. À écrire une fois dans A9, pas deux. |
| **A10 → A4** | A10 fixe la convention d'ancrage de la boîte écran (tassement d'effondrement appliqué à `pixelHouseBox`). La pastille de A4 s'ancre dessus ; livrée avant, elle flottera dès que A10 arrive. |
| **E7 → E8** | E7 décide **où** vit la racine de vue (`<main>`, div intercalé, ou racine par vue). L'`aria-label`, la cible du lien d'évitement et le focus de changement de vue de E8 pointent sur cet élément. |
| **E4 → E12** | E12 n'a pas de module de préférences à lui : `uiPrefs.js` est créé par E4. Déclaré comme prérequis dans la fiche, confirmé (aucun `uiPrefs.js` dans l'arbre). |
| **E4 → E7** | Le fondu d'écran de E7 doit tomber sous le cran Mouvement, sinon on livre une animation non coupable juste après avoir livré le réglage pour les couper. E4 doit d'abord trancher s'il étend « Vie de la carte » ou crée un second cran. |
| **E11 → E1** | Arbitrage 3 du dossier : le feuillet de première ouverture ne doit pas répéter une étape du fil Premiers pas. La règle ne peut s'écrire que si la liste des feuillets existe. |
| **B2 → B3** | Déclaré prérequis, confirmé : les deux expliquent d'où vient le débit et visent le même hôte (`ChronicleView.jsx:51-70` et sa tuile Multi. 118-123). Si B3 passe d'abord, il réexplique une pile que B2 va décomposer. |
| **D6 → B6** | Le tri de la boutique (B6 point 5) porte sur `categoryData:143-152`, qui **ne peut pas être mémoïsé** sans le compteur de version que D6 introduit. Mémoïser sur `buildings/cycles/ère` (ce que dit la fiche B6) gèlerait l'apparition économique. |
| **B1 → B2** | B1 point 2 (contenu structuré dans `tipProps`) est ce qui rend une pile de facteurs affichable dans une bulle. Et B1 migre le `title` de la tuile Multi. (`CityStatusPanel:149`) que B2 rend cliquable : l'un des deux réécrit l'élément de l'autre. |
| **E5 → B6** | Les deux ajoutent une prop à `PurchaseRow` et une ligne au bas de la rangée, déjà occupée par B5. E5 ne fait que **classer** de la donnée existante (`lackingKey` + délai B5) ; B6 ajoute un troisième signal. Fixer le vocabulaire d'état avant d'y empiler un chip, sinon on décide de la place de trois signaux sans avoir arbitré les deux premiers. |

### Contraintes molles (regroupements, pas des blocages)

| Groupe | Motif |
|---|---|
| **D6, E11, E1** — la première fixe le patron | Les trois ajoutent une **map de latch persistante** à `state.js` avec la même séquence en quatre points (défaut, liste blanche d'`hydrateState`, `resetTemporaryRunState`, `GR_PERSISTENT_FIELDS`) et le même piège d'amorçage à l'hydratation. Un seul test de classe couvre les trois. D6 est la plus contrainte (elle doit résister à l'effondrement, qui vide `state.buildings`), donc la meilleure candidate pour écrire le patron. |
| **D2, D6, D10, D12, B7** — même passage dans `tick()` | Pas de conflit de lignes, mais une règle commune à respecter d'un seul coup : mécanique sous `!isOfflineSim()`, affichage sous `!isNotifyPaused()`, latch **inconditionnel** (modèle `refreshGrandResetReveal`, l. 295-302). Livrées séparément, elles vont diverger. |
| **D6, B6, E5** — un seul sélecteur pour trois | `BuildingShop` est le seul `memo()` sans props du dépôt. Trois abonnements séparés = trois balayages des 30 bâtiments par tick. Il faut une signature unique quantifiée, sur le modèle d'`etaSig` (l. 187-199). |
| **B6, E5, B1** — un seul passage sur `arePropsEqual` | Trois props ajoutées, aucun test pour protéger le comparateur, mode de panne silencieux déjà documenté deux fois dans le fichier. |
| **D2, D10, B2** — un seul passage sur `CityStatusPanel` + `layout.css` | Trois blocs de plus dans un encart qui en porte déjà quatre, et trois blocs `@media (981-1500px)` de plus dans un fichier qui en compte déjà cinq pour le même breakpoint. |
| **D8 puis B7** sur `performGrandReset` | Cinq lignes séparent l'insertion de D8 (avant `setState`, l. 362-364) du `resetAnnals()` que B7 généralise (l. 367). |

### Ce qui cohabite sans se voir

- `crisis.js` : D12 (garde en tête de `runCrisisAction:561`) vs D2/D11/A11 (dans `completeCollapse`) — fonctions distinctes.
- `prestige.js` : D11 lit `ruinGain:122`, D12 écrit dans `timeWearRate:201-229`.
- `buildingOutput.js` : B3 dans `getBuildingSums:60-132`, B6 autour de `buildingOutputMultiplier:20-40`. Mais **même arbitrage de dénominateur** à trancher une fois pour les deux (sommes de base vs débit affiché).
- `CityView.jsx` : D8 sur `.city-stage:331-336`, E1 sur `.city-aux:465`.
- `views-misc.css` : D8 (nouvelle surcouche) et D12 (panneau de PrestigeView) — sections disjointes. **Mais** `.cycle-report` (top 3.2rem, z-index 6) et `.idle-report` (top 3.2rem, z-index 7) se disputent déjà la même ancre : D8 est le **troisième** encart à cet endroit et doit prendre une autre ancre.
- `ruinsTree.css` : E5 (états de nœud) vs E7 (`main:131-145`).
- `i18n.coverage.test.js` : D2 et D12 ajoutent chacun une ligne d'import.

### Une contradiction de règle à trancher avant de coder

**E11 contre B10 (livré).** `tabBadges.js:5-16` pose une règle explicite et argumentée : *ne badger que ce qui est gratuit ou dû*. Le fichier ne badge que `prestige` (sceaux réclamables) et `ruinsView` (dogmes gratuits). E11 veut une pastille « jamais ouvert » et D6 une pastille « bâtiment apparu » — **ni l'une ni l'autre n'est gratuite ou due**. Les trois fiches visent le même `<span className="tab-badge">` d'`App.jsx:261-271`, dans un `.tab` dont le `clip-path` interdit toute position absolue. C'est une décision de vocabulaire, pas d'ordre : elle doit être prise avant D6 **et** avant E11.

---

# Annexe B. Révision des arbitrages du dossier

# Arbitrages et contradictions de design, revérifiés sur le code du 2026-07-22 (HEAD `0b02e24`)

---

## Arbitrage 1. A8 contre E4, un seul contrôle de mouvement

**Verdict : à réviser. L'intention tient, le sens de la dépendance s'est inversé.**

Ce que le code dit aujourd'hui :

- `src/game/map/ambianceMode.js` existe, 40 lignes, module feuille sans aucun import. Trois crans `full` / `sober` / `none`, clé `civ-opt-ambiance`, hors sauvegarde (commentaire lignes 10-12). `ambianceK()` rend `{ full: 1, sober: 0.4, none: 0 }`.
- `CM.ambianceK` est posé une fois par frame : `cityMapRuntime.js:1304` (`CM.capture ? 1 : ambianceK()`), lu par 5 sites du renderer (`isoRenderer.js:2502`, `3022`, `4096`, `4157`, `4522`).
- **Le contrôle joueur EXISTE DÉJÀ**, dans l'onglet Affichage : `OptionsDialog.jsx:511-539`, libellé « Vie de la carte », handler `handleAmbianceChange` lignes 128-132.

La fiche E4 décrit donc un cran Mouvement à créer qui pilotera `CM.ambianceK`, alors que c'est `CM.ambianceK` qui a déjà son cran. E4 ne pilote plus A8 : E4 doit se greffer sur A8, ou l'onglet Interface posera un deuxième curseur à côté d'un curseur existant, exactement ce que l'arbitrage voulait éviter.

Trois frictions concrètes que l'arbitrage n'avait pas :

1. **Cardinalité incompatible.** A8 a trois crans avec un intermédiaire à 0,4. `data-motion` est binaire par construction : le bloc `base.css:7-16` coupe `animation-duration`, `transition-duration` et `scroll-behavior` en `!important`, il n'y a pas de demi-mesure CSS. Le cran « Sobre » ne peut donc couper que la carte. À écrire explicitement dans l'infobulle, sinon on promet une gradation que le CSS ne sait pas rendre.
2. **Deux clés de persistance pour un contrôle.** `ambianceMode` a sa clé localStorage. Si `uiPrefs.js` en crée une seconde pour le mouvement, il y a deux sources de vérité derrière un seul bouton. Recommandation : `uiPrefs` délègue à `setAmbianceMode()` (exporté, module feuille, aucun cycle d'import possible) et dérive `data-motion` de `ambianceMode === 'none'`. Aucun bake à invalider, le commentaire `OptionsDialog.jsx:125-127` le garantit.
3. **Le libellé actuel est écrit contre l'unification.** L'infobulle ligne 514 insiste sur la distinction carte / qualité (« la qualité sert la machine, ce réglage sert le confort »). L'élargir à l'interface demande de réécrire ce texte, pas seulement de renommer.

**Point neuf, hors arbitrage :** `prefers-reduced-motion` ne coupe rien de la carte aujourd'hui (le canvas est du JS, il n'écoute pas la media query). Un joueur dont le système demande « moins de mouvement » a donc l'interface figée et la carte en pleine agitation. C'est une incohérence existante que E4 est le seul endroit naturel pour régler : faire lire la media query par `ambianceK()` comme valeur par défaut, sans écraser un choix explicite.

---

## Arbitrage 2. B10 contre E11, une seule pastille par onglet

**Verdict : tient, et devient nettement plus facile que prévu, mais demande une précision de vocabulaire que l'arbitrage n'avait pas posée.**

Ce que le code livré dit :

- `tabBadges.js:34-42` : `tabBadgeCounts()` ne badge que **deux** onglets, `prestige` (sceaux réclamables) et `ruinsView` (dogmes gratuits), et rend `{}` pendant une crise ouverte (ligne 35).
- La règle est écrite en tête du module, lignes 14-16 : « Ne restent que les deux choses qui sont **GRATUITES ou DUES**, et qu'on ne peut que perdre à ignorer. »
- Le rendu est `App.jsx:261-271`, en flux, avec un commentaire de 6 lignes (255-260) expliquant pourquoi il ne peut pas être en position absolue (le `clip-path` de `.tab` découpe tous ses descendants, y compris en `position: fixed`). Style : `layout.css:125-145`, un **nombre** doré, jamais de rouge, plus un palier responsive `layout.css:466`.

**La collision réelle se réduit à un seul onglet.** Les onglets qui se débloquent sont `ruinsView`, `tech`, `mythView`, `comptoir` (`App.jsx:185-189`). Les onglets badgés sont `prestige` et `ruinsView`. Intersection : `ruinsView`, et seulement pendant la fenêtre entre le premier effondrement et la première ouverture de l'onglet.

**Ce que E11 doit faire, précisément :**

1. Ne pas rendre un second `<span>`. Réutiliser le même emplacement (`App.jsx:261`) avec une seule sortie, priorité au « nouveau ».
2. **Ne pas passer par `tabBadgeCounts()`.** Deux raisons : la règle du module exclut « nouveau » (ce n'est ni gratuit ni dû), et la fonction rend `{}` en crise ouverte, ce qui ferait disparaître la pastille « nouveau » pendant une crise sans aucune raison. Deux sources séparées, une seule décision de rendu.
3. **Forme distincte obligatoire.** Le badge actuel est un chiffre doré. Un « nouveau » rendu avec le même gabarit se lit comme un compteur à 1. Un point sans chiffre est la seule forme qui se distingue d'un coup d'œil, dans les contraintes déjà posées : en flux, `min-width` réduite, jamais de rouge, et lisible sous 980 px en grille multi-colonnes.
4. Le `title` actuel (`App.jsx:264-267`) dit « à réclamer, sans rien dépenser ». Faux pour un onglet neuf, il faut un second texte.

---

## Arbitrage 3. E1 contre E11, deux tutoriels

**Verdict : tient. Vérifié qu'aucun fil d'objectifs n'existe.**

Grep insensible à la casse sur `src/` pour `onboarding|premiersPas|firstSteps|tutorial|didacticiel|uiSeen` : **zéro occurrence**. Rien n'a été amorcé par les lots 1, 2 ou 3.

Deux nuances tout de même, tirées du code :

- **Deux listes de progression existent déjà**, non didactiques mais concurrentes pour l'attention : l'échelle des sceaux avec ses jauges chiffrées (`GrandResetLadder.jsx:197-218`, B9 livré) et les objectifs de Mythes (`myths.js`, champ `objectif` sur les 14 entrées). La première est visible dès le début dans l'onglet Effondrement (`unlocked: true`, `App.jsx:184`). Un fil « Premiers pas » dans le rail de la Cité serait donc la troisième liste de progression du jeu, pas la première.
- **La règle d'exclusion de l'arbitrage se retourne contre l'écran le plus important.** Elle dit : le feuillet ne s'ouvre pas pour les vues déjà couvertes par une étape d'E1. Or les étapes d'E1 portent sur la Cité et la Régulation, c'est-à-dire précisément les deux écrans qu'un débutant voit en premier, et qui seraient donc privés de feuillet. Découpage plus sain : **E1 couvre les deux vues ouvertes dès la première seconde (Cité, Régulation), E11 couvre exclusivement les quatre vues qui se DÉBLOQUENT** (`ruinsView`, `tech`, `mythView`, `comptoir`). Un partage par écran, statique et lisible, plutôt qu'une règle d'exclusion dynamique.

---

## Arbitrage 4. C7 contre D4, horloge virtuelle

**Verdict : tient. Aucune fiche D restante ne réintroduit de ticks hors horloge virtuelle. Mais l'arbitrage a acquis un corollaire que trois fiches ignorent.**

Chemin vérifié : `spendStoredTime` (`main.js:419`) appelle `advanceWorldBy` (`main.js:433`), qui appelle `simulateAwayCrises` (`main.js:378`) et retombe sur le crédit linéaire `creditSpan` si non éligible. Dans `simulateAwayCrises`, `Date.now` est remplacé ligne 241 (`Date.now = () => virtual`) et restauré dans le `finally` ligne 299. La clepsydre passe donc bien par l'horloge virtuelle, exactement comme tranché.

Revue des fiches D restantes : **aucune ne rejoue du temps**. D2 et D6 latchent au tick normal, D10 touche un intervalle basé sur `Date.now`, D11 s'insère dans les deux évaluations existantes, D8 ne fait avancer aucune horloge. Aucun `tick(1)` nu proposé nulle part.

**Le corollaire non écrit :** depuis C7, « hors ligne » n'est plus synonyme de « joueur absent ». Trois fiches restantes s'appuient encore sur l'ancienne équivalence.

| Fiche | Ce qu'elle suppose | Ce que C7 a changé |
|---|---|---|
| D10 | `isNotifyPaused()` distingue joueur présent et joueur absent, donc peut moduler la fenêtre d'aubaine | Le drapeau n'est levé que par `simulateAwayCrises` (`main.js:242`), chemin qui exige `hephHeritage` + `edit_effondrement` (`main.js:225`). Pour la majorité des parties il est **toujours faux**, y compris pendant une vraie absence. Le garde-fou anti-farm de D10 est inopérant. |
| D2 | Un vœu est tiré par cycle et choisi par le joueur | Un versement de clepsydre enchaîne plusieurs effondrements pendant que le joueur regarde l'écran, donc consomme plusieurs vœux sans qu'aucun choix ne puisse être proposé (aucun dialogue ne peut s'ouvrir, garde `main.js:257`). |
| D11 | Il suffit d'ajouter le mode ratio dans `checkAutoCollapse` | Il faut aussi `main.js:260-262`, sinon le mode est muet pendant la clepsydre ET pendant l'absence. Le test `crisisDoctrine.test.js:131-149` attraperait l'oubli, il faut s'en servir. |

**Piège transverse à consigner :** pendant la boucle, `Date.now` est faux. Toute fiche qui persiste un horodatage (`boonFrom` de D10, un `startedAt` de vœu pour D2, un `revealedAt` pour D6) écrit une date **virtuelle**, en retard sur l'heure murale à la sortie. Toute jauge dérivée doit être clampée à l'affichage, sinon elle dépasse 100 % au retour.

---

## Arbitrage 5. D12 contre les Mythes, tranché

**Verdict : ABANDON de D12. Contre-proposition à un dixième du coût.**

Les éléments de code qui tranchent :

1. **Le jeu porte déjà trois systèmes de contrainte contre récompense**, pas un. Les 14 Mythes (`myths.js:312`, 883 lignes de données, 753 d'actions, 234 de ticks, 393 de vue, 78 appels de `isMythEffectActive` dans 16 fichiers). La doctrine de crise. Et un troisième que la fiche ne cite pas : les **Ruines actives** (`activeRuins.js`, 10 fardeaux opt-in avec bonus de moisson). D12 serait le quatrième, et le seul jetable.
2. **Le seul point d'accroche neuf est le plus dangereux.** Vérifié : aucun Mythe ne bloque dans `runCrisisAction` aujourd'hui, les usages de `isMythEffectActive` dans `crisis.js` sont en 142, 174 et 357 seulement. La garde d'épreuve serait donc du code neuf, posée sur une fonction à **8 appelants**, dont `steward.js:122` et `automation.js:209`. Une épreuve qui interdit d'apaiser neutralise l'intendant et les automates que le joueur a payés : une régression déguisée en contenu.
3. **Le contenu s'éteint à vie.** Le sceau GR1 demande 10 effondrements (`GR_MILESTONE_THRESHOLDS.cycles = 10`, `grandResetMilestones.js:30`). Onze fichiers de production pour un contenu qui ne se rejoue jamais, et dont aucun champ d'état n'a de sens après le premier Grand Reset.
4. **Le trou visé est déjà partiellement bouché, mais invisible.** L'Olympe marque des points **dès le cycle 0** : `registerOlympusCrisisResolved`, `registerOlympusCrisisIgnored` et `registerOlympusCollapse` sont appelés depuis `crisis.js` en 161, 165, 226, 230, 284, 332, 334, 585, 638 et 689, et leurs implémentations (`actions/olympus.js:60-91`) ne portent **aucune garde sur `grandResetCount`**. Le joueur d'avant premier Grand Reset joue donc déjà un défi de style, qui compte, qui persiste, qui est testé. Son unique écran vit dans `MythsView.jsx:125-160`, derrière `isMythsUnlocked = grandResetCount >= 1` (`App.jsx:171`).

**Contre-proposition, une fiche S : rendre l'Olympe visible avant le premier Grand Reset.** Sortir la section `olympus-*` de `MythsView.jsx` vers un composant montable depuis `PrestigeView` (onglet `unlocked: true`, `App.jsx:184`). Zéro mécanique neuve, zéro nouveau champ d'état, zéro garde dans `runCrisisAction`. Le joueur découvre que la manière dont il règne est déjà notée, ce qui est exactement la promesse de D12 sans en payer le prix.

**Réserve honnête.** Si l'auteur tient à des épreuves, la seule version défendable est celle qui **ne touche pas** `runCrisisAction` et se limite aux deux gardes qui existent déjà : refus de catégorie dans `buyBuildingCore` (`building.js:79-82`) et facteur d'usure dans `timeWearRate` (`prestige.js:201-229`). Deux points d'accroche, six fichiers au lieu de onze, et une récompense en Ruines et **jamais** en Bénédiction, parce qu'une Bénédiction en cours refuse le versement de clepsydre (`main.js:409-411`).

---

## Le sixième point, non tranchable : la jauge de révélation de D6

**Le commentaire est toujours là. Il a bougé : `BuildingShop.jsx:362-365`, et non 208-211.**

Texte exact d'aujourd'hui :

> `// Seule condition AFFICHABLE : le cycle (verrou explicite voulu).`
> `// L'apparition économique (cf. isUnlocked) reste muette : le bâtiment`
> `// caché suivant ne dit rien de plus que « Bientôt » (le bouton) —`
> `// pas de ligne « Bientôt disponible » redondante.`

Le seuil qu'il protège : `shared.js:27-30`, pic du cycle dans la devise supérieur ou égal à 25 % du coût de base (`BUILDING_REVEAL_PEAK_FRACTION`, `balance.js:1026`).

**Fait nouveau qui change la question.** B9 a livré, depuis l'écriture du dossier, un précédent exact de jauge **anonyme** : `GrandResetLadder.jsx:197-218`, avec ce commentaire, « Sur un sceau SCELLÉ elle reste ANONYME : on montre qu'on approche, jamais de quoi. » Les classes `.gr-gauge`, `.gr-gauge-track`, `.gr-gauge-fill`, `.gr-gauge-num` existent déjà. Il n'y a donc pas deux options mais **trois**.

### Question à poser à l'auteur

> Le mutisme de l'apparition économique est-il une règle de design que tu veux tenir, ou acceptes-tu qu'une barre montre qu'on approche sans dire de quoi ?

Avec les trois options et leur coût réel :

**Option A, garder le mutisme.** Coût nul. On livre le point 1 de D6 seul, le latch à vie plus la dépêche. Bénéfice caché non négligeable : aucun abonnement de `BuildingShop` ne lit `state.cyclePeaks` aujourd'hui, donc l'apparition d'un bâtiment **ne provoque aucun rendu par elle-même**, elle attend qu'une autre signature bouge. Le latch corrige ce retard gratuitement. Ce qu'on n'a pas : le joueur continue de voir « Bientôt » sans savoir s'il approche.

**Option B, jauge chiffrée (« 4,2 k / 37,5 k nourriture »).** Publie le seuil des 25 %, ce qui contredit frontalement le commentaire. Deux coûts que la fiche ne chiffrait pas. Un : `completeCollapse` vide `state.buildings` (`crisis.js:447`) et `resetCyclePeaks` remet les pics au socle (`crisis.js:486`), donc **la barre repart quasiment de zéro toutes les deux ou trois minutes** et rend visible un recul que le mutisme actuel masque entièrement. Deux : sur 15 des 30 bâtiments le verrou qui mord est le **cycle**, testé en premier (`shared.js:19`), donc une jauge économique peut afficher 100 % sous un bâtiment qui n'apparaîtra pas.

**Option C, jauge anonyme, modèle B9.** Barre seule, ni devise ni chiffre. CSS quasi gratuit, les quatre classes existent. Ne publie aucun seuil, enlève le sentiment que rien ne se passe. Garde le même recul à chaque chute, mais sans chiffre pour le mesurer, donc ressenti comme une respiration et non comme une perte.

---

## Contradictions nouvelles, non vues par le dossier

### 1. Trois bandeaux non modaux se disputent la même ancre sur la carte

`views-misc.css:121-127` pose `.cycle-report` en `absolute; top: 3.2rem; left: 50%; z-index: 6`. `views-misc.css:187-192` pose `.idle-report` en `absolute; top: 3.2rem; left: 1rem; z-index: 7; width: min(20rem, 42%)`. Les deux sont livrés (D9 au lot 1, B11 au lot 2) et montés côte à côte sur la même `.city-stage` (`CityView.jsx:334` et `336`). **D8 propose un troisième bandeau au même endroit.** Cas réel qui se produira : retour d'absence, puis effondrement dans les secondes qui suivent, puis réclamation d'un sceau. Trois encarts empilés sur une bande de 3,2 rem. Il faut une règle d'ancrage unique avant de livrer D8, pas après.

### 2. L'encart latéral est plein, et quatre fiches restantes veulent y entrer

`CityStatusPanel.jsx` fait 240 lignes et a reçu quatre blocs depuis l'écriture du dossier (réserve d'absence C2, clepsydre C7, sceaux prêts B9, pastille de sauvegarde C10). Le media query `layout.css:389-399` masque déjà `.csp-label`, `.csp-value` et `.csp-stat-label` entre 981 et 1500 px, et la sidebar est en `height: 100vh` **sans overflow**. Or **D2** y veut une ligne de vœu, **D10** une quatrième jauge, **B2** une pile de 16 facteurs, et **E1** hésite entre le rail de la Cité et cet encart. Le dossier traite ces quatre fiches comme indépendantes. Elles visent le même centimètre carré, et la place n'existe plus.

### 3. La rangée de boutique porterait quatre signaux d'attente

Sur une seule `purchase-row` : le délai avant achat de **B5** (livré, `etaLabel`), le pip « bientôt » de **E5**, la jauge de révélation de **D6**, le chip de gain relatif de **B6**. Trois de ces quatre disent au joueur la même chose, « pas encore ». `arePropsEqual` (`PurchaseRow.jsx:284-308`) compare aujourd'hui **14 props**, avec deux commentaires d'avertissement écrits à l'occasion de C8 (297-299) et B5 (303-305). Chaque fiche qui ajoute une prop sans l'ajouter là fige son affichage en silence. Il faut un arbitrage de rangée avant de livrer la deuxième de ces quatre fiches.

### 4. Quatre fiches carte se partagent un seul budget de recuisson

`ISO_SETTLE_MS = 110` (`isoRenderer.js:4627`) mesure l'accalmie sur le **mouvement réel de la caméra** (`CM._igMoveAt`). Conséquence composée que le dossier n'a pas vue : **A9** fait bouger la caméra en continu (inertie, zoom interpolé, pan clavier), **A4** ajoute un vol par achat, **A10** ajoute des crans dans la clé du bake, et **A11** élargit la boîte de `cmClampCamera` donc **abaisse le plancher de zoom** (`cityMapRuntime.js:336-338`, `zoomFloorIso` calculé sur l'étendue projetée de la boîte) donc agrandit la surface à recuire. Chacune est bornée isolément. Empilées, le sol net n'arrive jamais. À traiter comme un budget commun, avec le profileur `__isoGroundProfile` comme juge, et non fiche par fiche.

### 5. Quatre nouveaux champs persistants, et le seul test automatique ne les couvre pas

**D2** veut `cycleVow`, **D6** `revealedBuildings`, **E11** `uiSeen`, **E1** `onboarding`. Chacun demande la même couture en quatre points : `defaultState`, un normaliseur dans `hydrateState` (liste blanche stricte, aucun `...source` de rattrapage), `resetTemporaryRunState`, `GR_PERSISTENT_FIELDS`. Or le test automatique `grandReset.test.js:54-70` **ne filtre que les champs `*Heritage`** : aucun de ces quatre ne sera vu s'il est oublié. Trois de ces quatre champs ont en plus des règles de survie opposées (le latch de D6 doit survivre à l'effondrement, le vœu de D2 doit y mourir). À écrire une fois, comme un patron documenté, plutôt que quatre fois de mémoire.

### 6. B1 est une cible mouvante que les autres fiches alimentent

B1 veut unifier les infobulles. Or **D6**, **B6**, **B2**, **E5** et **D10** ajoutent chacune un `title` natif ou une infobulle. Le dossier comptait 126 `title=`, l'audit en compte 146. Chaque fiche livrée avant B1 augmente le travail de B1. Deux voies seulement : livrer B1 tôt et exiger `tipProps` de tout ce qui suit, ou accepter que B1 ne couvre jamais qu'un instantané. La troisième voie, la livrer tard « quand ce sera stable », n'existe pas.

### 7. Quatre fiches répondent à la même question sans dénominateur commun

**B2** (anatomie du multiplicateur), **B3** (comptes par ressource), **B6** (gain relatif par achat), **B7** (sparklines) répondent toutes à « d'où vient ma production ». Trois d'entre elles doivent choisir **le même dénominateur** (production de base des bâtiments, ou débit réel affiché en Topbar qui contient un socle non lié aux bâtiments, `rates.js:96-98` et `126`). Elles sont écrites indépendamment et arriveraient avec trois conventions. Une seule décision, prise avant la première des quatre, vaut mieux que trois écrans qui donnent trois nombres différents pour la même chose.

### 8. Fait d'inventaire à corriger

**D9 est livré** (commit `68ef77e`, lot 1 : `CycleReportBanner.jsx`, `events.js:149-173`, `crisis.js:346-355`, `views-misc.css:116-179`, `cycleReport.test.js` au vert). La consigne de mission ne le liste pas parmi les livrables du lot 1, alors que le dossier le rangeait en optionnel (ligne 1235). Son seul résidu est un défaut de table de libellés : `CycleReportBanner.jsx:15-20` déclare `famine`, `instability`, `time`, `auto_collapse`, alors que `collapseCause()` (`events.js:44-52`) ne rend que `time`, `famine`, `avarice`, `rupture`. Sur deux causes sur quatre, le bandeau imprime la clé interne brute.
