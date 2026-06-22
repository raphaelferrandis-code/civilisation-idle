# Refonte visuelle — Arbre des Ruines (« arbre de compétences »)

> **Statut** : plan validé, prêt à implémenter.
> **Source amont** : [`analyse-arbres-de-ruines.md`](analyse-arbres-de-ruines.md) (audit des données — à lire en complément ; la refonte *data* « paliers à choix » qu'il préconisait est **déjà livrée**, cf. `upgrades.js` + `ruinTree.structure.test.js`).
> **Portée** : refonte **purement présentationnelle** de [`RuinsView`](src/components/views/RuinsView.jsx). Aucun changement d'équilibrage, de coûts, de gating, ni de données testées.
> **Faits vérifiés sur le code** au moment de l'écriture (lignes citées entre parenthèses) : à re-vérifier si le code dérive.

---

## 1. Résumé exécutif

L'écran des Ruines est aujourd'hui une **grille de cartes plate** ([`RuinsView.jsx`](src/components/views/RuinsView.jsx)) : une grille de dogmes, puis 5 branches empilées, chacune en colonnes de paliers. L'utilisateur veut « que ce soit vraiment plus *arbre de compétences* » : des **nœuds** reliés, et des améliorations qui **apparaissent au fur et à mesure et font grandir l'arbre** (réf. image #3 : moyeu doré central, branches colorées qui rayonnent).

On livre un **arbre radial unique**, rendu en **SVG (troncs/portes/arêtes) + `<button>` HTML positionnés en absolu (nœuds)**, sans aucune nouvelle dépendance, sans canvas, sans pan/zoom au MVP. Le layout est une **fonction pure déterministe** dérivée des données figées. Toute la logique d'achat/disponibilité est réutilisée verbatim (`buyUpgrade`, `checkNodeAvailability`, `checkDogmaAvailability`, `has`, `isUnlocked`).

### Décisions tranchées (le quoi)

| # | Sujet | Décision | Pourquoi |
|---|---|---|---|
| **D1** | **Techno de rendu** | **SVG déclaratif** pour troncs/portes/arêtes + **`<button>` HTML absolus** pour les nœuds. Pas de canvas. | ~100 nœuds statiques, a11y native gratuite, démontage React trivial. Le canvas ne se justifie qu'au-delà de plusieurs centaines de nœuds animés. |
| **D2** | **Disposition** | **Radial à moyeu central**, secteurs angulaires **proportionnels au nombre de nœuds** par branche + plancher d'angle pour `veille`. **Un seul layout.** | Esthétique cible (image #3) + absorbe l'inégalité 30↔4 nœuds. Pas de double-UI à maintenir. |
| **D3** | **Schéma d'arêtes** | **« Tronc + porte de palier »** : un tronc radial par branche ; chaque nœud relié à SON tronc à hauteur de palier ; une **porte** sur le tronc entre paliers portant `ownedBelow/need`. | Honnête : le gating est un **compteur** (`ownedInBranchBelowTier`, [mechanics/upgrades.js:21](src/game/core/mechanics/upgrades.js)), il n'existe **aucun** prérequis nœud→nœud. On ne dessine jamais « A débloque B ». |
| **D4** | **Conflits** | Les 2 paires `conflictsWith` sont **INTER-branches** → **fil d'exclusion cross-branche** (trait rouge `--red`, icône ⊘), jamais une fourche locale. | Vérifié dans [upgrades.js](src/game/data/upgrades.js) : `stone_bread`(resilience t1)↔`mirror_archives`(knowledge t1) ; `crisis_theatre`(resilience t2)↔`burial_math`(cycle_crise t1). C'est la **seule vraie arête** du graphe. |
| **D5** | **Pan/zoom** | **Coupé du MVP.** Tout l'arbre tient dans un `<svg viewBox>` à `width:100%`. Pan/zoom = incrément ultérieur seulement si trop dense à l'usage. | Plus grosse coupe de complexité (~150 lignes + 5 pièges : `wheel preventDefault`, drag-vs-clic, clamp, focus hors-écran, `touch-action`). |
| **D6** | **Re-render** | **Garder `useGameState(s => s.ruins)`.** Mémoïser uniquement la **géométrie** (`useMemo` deps statiques). | Le « re-render 1 Hz » est un **mythe vérifié** : `state.ruins` n'est réassigné qu'à 4 endroits ([main.js:102](src/game/core/main.js) gain, [main.js:133](src/game/core/main.js) achat, [crisis.js:316/373](src/game/core/actions/crisis.js)), **jamais dans `tick()`**. `useGameState` compare en `Object.is` ([useGameState.js:6/37](src/hooks/useGameState.js)) → identité stable entre ticks. Seuls achats/gains re-rendent (rares). |
| **D7** | **Dogmes** | **Intégrés dès le MVP** comme **médaillons en bout de branche**, placés via `requiredPurchases`. La `.dogma-grid` plate disparaît. | Garder la grille plate au-dessus d'un arbre radial = livrer le « avant » qu'on veut supprimer. Demi-refonte refusée. |
| **D8** | **Icône monnaie** | **`fa-landmark`** (Font Awesome, déjà chargé) partout, y compris les coûts de nœuds. Pas l'emoji 🏛️. | Cohérence avec `RES_ICONS.ruins` ([resourceIcons.js:11](src/components/ui/resourceIcons.js)). Ne pas propager la dette de l'emoji du compteur actuel ([RuinsView.jsx:43](src/components/views/RuinsView.jsx)). |
| **D9** | **Croissance « l'arbre grandit »** | Animer **au premier montage post-effondrement** les nœuds nouvellement visibles, via un **set « déjà-vu » persistant au niveau racine de `state`** (survit au démontage en crise). **Jamais** rejouer au simple retour d'onglet. | Les cycles n'avancent qu'à l'effondrement, pendant lequel `RuinsView` est **démonté** (nav verrouillée hors `prestige`, [App.jsx:157-160](src/App.jsx)). Un `useRef` local ne survivrait pas. C'est le cœur de la demande utilisateur. |
| **D10** | **Icônes de nœud** | **Icône Font Awesome par `effectType`** (parlante : blé/pièces/livre/sablier… — table §5bis), au centre du cadre. `fa-landmark` pour les coûts. | Choix utilisateur (mix réf #5 + icône qui évoque le bonus). **Vérifié : les packs Kenney de `UI assets/` n'ont AUCUNE icône thématique** → l'icône vient de FA (déjà chargé, vectoriel, recolorable, exhaustif). Pas de tables d'emoji. |
| **D11** | **Cadre de nœud (look « juicy »)** | **Cadre biseauté Kenney** (`round_grey.png` / `hexagon_grey.png`, UI Pack - Adventure) **teinté par branche** (bake) ; états via filtres CSS. Hub encadré d'une **bordure Fantasy UI Borders or**. | Direction visuelle choisie (mélange options 2+3). Le « juicy » biseauté vient de Kenney ; la teinte par branche est bakée une fois (recette `docs/ui-references.md §3`), les états ne coûtent **aucun** asset (CSS). |

### Ce qu'on NE fait PAS (sur-ingénierie coupée)
- Pas de slices structurelles d'abonnement ni de « passe CSS d'affordabilité hors-React » (résolvent un bug inexistant — D6).
- Pas de pan/zoom au MVP (D5).
- Pas de double layout « radial + repli grille/vertical » optionnel. Le seul repli envisagé (desktop très étroit, **hors MVP**) est « 5 troncs verticaux », nommé en annexe.
- Pas d'appariement glouton « nœud→frère le plus proche du palier suivant » (mensonge visuel — D3).
- Pas de silhouettes-fantômes au MVP : `!isUnlocked` ⇒ non rendu (parité stricte avec `visibleIds`). Bourgeons = incrément.
- Pas de tables d'emoji (D8/D10).
- Pas de recoloration de `veille` en `--violet` (= `--state-usure`, couleur du danger → contresens sémantique).

---

## 2. Vision cible (UX)

**À l'écran** : un **moyeu doré central** « Mémoire des Ruines » affichant `{fmt(ruins)}` + `fa-landmark`. De ce moyeu **rayonnent 5 branches** colorées (réf. image #3) :

- **Résilience** (vert `--green`/`--res-food`) — grande branche (30 nœuds, 6 paliers).
- **Prospérité** (or `--gold`) — la plus grande (32 nœuds, 6 paliers, jusqu'à 6 nœuds/palier).
- **Connaissance** (bleu `--blue`/`--res-knowledge`) — moyenne (22 nœuds, 5 paliers).
- **Cycle & Crise** (rouge `#c86464`/`--red`) — courte (12 nœuds, 3 paliers).
- **Veille** (gris neutre `rgba(150,150,190,…)`) — minuscule (4 nœuds, 2 paliers).

Chaque branche = un **tronc** qui part du moyeu vers l'extérieur. Le long du tronc, des **anneaux concentriques** = les paliers. À chaque palier, les nœuds sont **greffés en éventail** autour de l'axe de la branche, **reliés au tronc** (pas entre eux). Entre deux paliers, une **porte** sur le tronc : fermée et grisée tant que `ownedBelow < need`, illuminée dès que le palier s'ouvre — c'est elle qui « pousse » le tronc vers l'anneau suivant.

En **bout de tronc** : les **dogmes** de la branche, en **médaillons hexagonaux** (forme distincte des disques-nœuds), positionnés par `requiredPurchases`, avec un **anneau de progression** `branchCount/requiredPurchases`.

**L'arbre qui grandit** (la demande verbatim) se manifeste de deux façons :
1. **Au fil des cycles** : de nouveaux nœuds (`unlockCycles`) entrent dans `visibleIds` ⇒ ils apparaissent (fade+scale-in), le tronc se trace (`stroke-dashoffset`). Joué **une seule fois**, au premier montage post-effondrement (D9).
2. **À l'achat** : le nœud s'illumine (couleur de branche), la porte aval peut s'ouvrir, ses arêtes passent `gated→open`.

**Deux fils traversent l'arbre** : les fils d'exclusion rouges (D4) reliant les paires `conflictsWith` à travers deux secteurs éloignés — la seule vraie dépendance du graphe, rendue lisible.

---

## 3. Décisions d'architecture (justifications)

### 3.1 Rendu — SVG + boutons DOM absolus (D1)

Un conteneur `position:relative` :
- une couche **`<svg>` de fond** (`position:absolute; inset:0; pointer-events:none; aria-hidden`) portant **uniquement** troncs, portes, arêtes feuille→tronc, fils d'exclusion, halos, glows ;
- au-dessus, **un `<button>` HTML par nœud** positionné en `left/top` (coordonnées monde converties), portant le texte (Inter), le statut, le coût, et `onClick={() => buyUpgrade(id)}`. Son **fond** est un **cadre biseauté Kenney teinté par branche** (`background-image`/`border-image`), et il contient une **icône Font Awesome centrée** évoquant l'effet (cf. §5bis).

Bénéfices : `:focus-visible` natif, ordre de Tab par markup, `aria-label` riche, hover/tooltip gratuits, démontage React trivial (crucial vu le démontage en crise), hi-DPI vectoriel. Le pattern caméra de [`cityMapRuntime.js`](src/game/map/cityMapRuntime.js) n'est **pas** importé au MVP (pas de pan/zoom) ; il reste la référence si on ajoute le pan/zoom plus tard.

### 3.2 Layout — radial à secteurs proportionnels (D2)

Layout **dérivé algorithmiquement** (zéro donnée de position dans `upgrades.js`). Les **seules** métadonnées additives vivent dans un module séparé `branchTheme` (angle de base, couleur, glyphe FA, label de hub) — jamais dans les structures testées. Voir §4 pour la math.

### 3.3 Mapping données→visuel — « tronc + porte » (D3)

Le gating est un **compteur de paliers inférieurs** (`ownedInBranchBelowTier`, [mechanics/upgrades.js:21-23](src/game/core/mechanics/upgrades.js)). Conséquences strictes :
- on ne relie **jamais** deux nœuds précis ;
- la seule relation réelle est **palier t → palier t+1**, médiatisée par `unlock[t+1]` ;
- on la matérialise par la **porte de palier** sur le tronc, annotée `ownedBelow/need` (valeurs déjà calculées dans [RuinsView.jsx:154-156](src/components/views/RuinsView.jsx)).

Le nœud `available` n'est tel que si **palier ouvert ET payable** (`checkNodeAvailability`, [mechanics/upgrades.js:47-48](src/game/core/mechanics/upgrades.js)). Le visuel distingue donc deux « non-achetables » : **palier fermé** (tronc/porte éteints + badge `ownedBelow/need`) vs **palier ouvert mais trop cher** (nœud doré **terni sans glow**). Ne pas les confondre (sinon on laisse croire que payer suffit).

---

## 4. Spécification du layout (la math)

Module pur `layout(branches, visibleIds) → { hub, nodes[], gates[], edges[], dogmas[], exclusionLinks[], bounds }`. **Déterministe** (aucun `Math.random`), **mémoïsable** sur la signature de `visibleIds`.

### 4.1 Constantes (toutes ajustables sans toucher aux données)
```
HUB        = { x: 0, y: 0 }      // moyeu central
R0         = 150                 // rayon du 1er anneau (palier 0)
R_STEP     = 130                 // espacement entre anneaux
NODE_R     = 20                  // rayon disque-nœud
CAPSTONE_R = 28                  // capstone (node.capstone === true)
DOGMA_R    = 26                  // médaillon de dogme
GAP_FRAC   = 0.18                // marge angulaire entre secteurs (fraction du sweep)
MIN_W      = 8                   // plancher de poids (protège veille = 4 nœuds)
CHORD_TARGET = 150               // corde cible entre frères d'un palier
```

### 4.2 Secteurs de branche (proportionnels + plancher)
```
nodeCount(b) = nb de nœuds VISIBLES de la branche b   // sur visibleIds
weight(b)    = max(nodeCount(b), MIN_W)
sweep(b)     = 2π · weight(b) / Σ weight(b')           // angle alloué
```
**Ordre angulaire figé** (réf. image #3, dans `branchTheme`), sens horaire depuis le haut :
`knowledge` (haut, bleu) → `prosperity` (droite, or) → `cycle_crise` (bas-droite, rouge) → `veille` (bas-gauche, gris) → `resilience` (haut-gauche, vert).
`centerAngle(b)` = milieu cumulatif du secteur. `usable(b) = sweep(b)·(1 − GAP_FRAC)`.

> **Sanity check densité** (vérifié) : `prosperity` a 2 paliers à **6 nœuds**. Son `weight` = 32 (sur Σ ≈ 30+32+22+12+8 = 104) ⇒ `sweep ≈ 0,31·2π ≈ 111°`, `usable ≈ 91°`. Au tier 4 (`radius = 150+4·130 = 670`), un span de 91° offre une corde ≈ `2·670·sin(45,5°) ≈ 956 px` pour 6 nœuds ⇒ **~159 px/nœud**, > diamètre nœud (40) + marge. **6 nœuds tiennent sans `.dense`.** Garder néanmoins une classe `.dense` (réduction d'échelle) comme garde-fou de dernier recours, non attendu en pratique.

### 4.3 Rayon par palier
```
radius(t) = R0 + t · R_STEP
```
Borné au nombre réel de paliers de la branche (`veille` s'arrête à `radius(1)`, `cycle_crise` à `radius(2)`). Aucun étirement artificiel : un secteur court est assumé (« branche jeune »).

### 4.4 Fan-out des nœuds d'un palier
Pour un palier `t` de la branche `b` avec `k` nœuds **visibles** (index `j`) :
```
span  = min(usable(b), CHORD_TARGET · k / radius(t))
a     = centerAngle(b) − span/2 + span · (j + 0.5)/k
x     = radius(t) · cos(a)
y     = radius(t) · sin(a)
```
`(j+0.5)/k` centre la rangée ; si `k==1`, le nœud tombe pile sur l'axe (épine dorsale lisible). `k`/`j` se calculent sur les nœuds **visibles** (sinon trous quand `unlockCycles` révèle).

### 4.5 Tronc, portes, arêtes (honnêtes)
- **Tronc** = polyligne sur l'axe `centerAngle(b)`, du moyeu jusqu'à `radius(maxTierVisible)`.
- **Porte** `gate(b,t)` = point sur l'axe à `radius = R0 + (t−0.5)·R_STEP`. Porte l'état `tierOpen` (`ownedBelow ≥ need`) et le texte `ownedBelow/need`.
- **Arête feuille→tronc** = courbe quadratique du nœud `(b,t,j)` vers son ancrage `(centerAngle(b), radius(t))`, point de contrôle sur la médiane (effet « ramille »).
- **Arête palier 0 → moyeu** = du segment de tronc interne au hub.
- **État d'arête** = état du palier aval : `purchased` (extrémité achetée) → trait plein lumineux couleur branche ; `open` → trait moyen ; `gated` → pointillé sombre.

### 4.6 Dogmes (médaillons en bout de tronc)
```
dogmaRadius(d) = R0 + (d.requiredPurchases / maxRequiredInBranch) · (R_STEP · nbTiers(b))
```
Posés sur l'axe `centerAngle(b)`, hexagone `DOGMA_R`, badge `Dogme`/`Trait`/`Compétence` (préfixe `dogma_`/`trait_`/`skill_`, logique [RuinsView.jsx:74-75](src/components/views/RuinsView.jsx)), anneau de progression `branchCount/requiredPurchases`. État via `checkDogmaAvailability`. `trait_` garde le liseré pointillé existant.

### 4.7 Fils d'exclusion (la seule vraie arête, cross-branche)
Pour chaque paire `conflictsWith` : un `<path>` rouge `--red` reliant directement les deux nœuds (par-dessus les troncs), icône ⊘ au milieu, style barré. Quand l'un est `purchased`, l'autre est `blocked` ⇒ le fil s'éteint côté perdant. Au survol d'un des deux, surligner le fil et l'autre nœud.

### 4.8 `bounds`
Cercle de rayon `max radius(maxTier) + marge` ⇒ alimente le `viewBox`. Aucune caméra au MVP.

---

## 5. États de nœud & interaction

### 5.1 Tableau état → style (source de vérité visuelle)
États issus **exclusivement** de `checkNodeAvailability` + `isUnlocked` + `node.capstone`. La colonne « Disque » désigne le **cadre Kenney teinté** (§5bis) ; elle décrit son traitement par état (filtres CSS, **aucun** asset par état).

| État | Source | Disque | Anneau (couleur branche) | Tronc/porte amont | Curseur / a11y |
|---|---|---|---|---|---|
| **caché** | `!isUnlocked` | non rendu (ni `<button>`) | — | tronc pas encore poussé | — |
| **verrouillé (palier fermé)** | `'locked'` + `!tierOpen` | `--surface-card`, `opacity .45`, `grayscale .75` | anneau `--border` mat | **porte VERROUILLÉE**, badge `ownedBelow/need` | `aria-disabled`, `not-allowed` |
| **verrouillé (trop cher)** | `'locked'` + `tierOpen` | doré **terni, SANS glow** | anneau couleur branche atténué | porte ouverte | `aria-disabled` + tooltip « Pas assez de ruines » |
| **disponible** | `'available'` | `--surface-card` + halo branche | anneau **plein** + `box-shadow 0 0 18px rgba(branche,.16)` | porte ouverte illuminée | `pointer`, button actif |
| **bloqué** | `'blocked'` | dégradé rouge sourd | anneau rouge cassé, overlay ⊘ | fil d'exclusion barré | `aria-disabled` + « Exclu par : {nom} » |
| **acheté** | `'purchased'` | dégradé couleur branche | anneau rempli/illuminé | arête aval pleine | focusable (info), `aria-disabled` |
| **capstone** | `node.capstone` (× état) | base + halo doré, taille 1,4× | **double anneau** doré + ★ | bout de tronc | comme l'état sous-jacent |

Réutiliser les ombres/halos existants de [views.css](src/styles/views.css) (~lignes 510-562). Texte de nœud en `--font-body` (Inter, règle mémoire « petit texte → Inter ») ; coût en `--font-number`.

### 5.2 Tooltip riche — OBLIGATOIRE (pas optionnel)
Les disques compacts ne peuvent loger les libellés FR longs (« Histoires contrefactuelles », « Bibliothèque souterraine »). Donc : **disque = icône + (au zoom suffisant) nom court** ; **tooltip au survol/focus** = source d'info complète. Un seul élément tooltip réutilisé (pattern `city-map-tooltip`). Contenu :
- `upgrade.name` ;
- `upgrade.effect` ;
- `upgrade.desc` (lore — **présent dans les données, pas encore affiché** : gain gratuit) ;
- coût `{fmt(node.cost.ruins)}` + `fa-landmark` ;
- ligne d'état contextuelle : palier fermé → « Palier verrouillé : {ownedBelow}/{need} achats requis » ; trop cher → « Pas assez de ruines » ; `blocked` → « Exclu par : {nom} ».

Ferme sur blur/Escape.

### 5.3 Achat
`available` → `buyUpgrade(node.id)` (inchangé). Sinon no-op + tooltip d'explication. Utiliser **`aria-disabled` (pas l'attribut `disabled`)** pour `locked`/`blocked`, afin que le nœud reste inspectable au clavier. (À l'inverse du legacy qui met `disabled` — léger gain a11y assumé.)

### 5.4 Animation de croissance (D9 — timing résolu)
- **Set « déjà-vu » persistant** : un ensemble d'ids déjà révélés stocké dans **un champ racine de `state`** (ex. `state.ruinsSeenNodes`, tableau d'ids — voir §7 pour la persistance), qui **survit au démontage** en crise. Pas un `useRef`/`useState` local.
- **Au montage** : comparer `visibleIds` à `ruinsSeenNodes`. Les ids nouveaux reçoivent `.is-entering` (fade `0→1` + `scale .6→1`, tronc tracé via `stroke-dashoffset`, ~600 ms), **puis** sont ajoutés à `ruinsSeenNodes`. ⇒ l'anim joue **une fois**, au premier retour post-effondrement, **jamais** aux visites suivantes.
- **À l'achat** (`available→purchased`) : flash de glow + arête aval `gated→open`.
- **`prefers-reduced-motion: reduce`** : toutes keyframes/transitions neutralisées (`animation:none; transition:none`) — état final instantané. Convention déjà présente (`base.css`/`layout.css`/`purchase.css`).

### 5.5 Accessibilité
- Un vrai `<button>` par nœud, `aria-label` = `` `${name} — ${statusLabel} — ${fmt(cost)} ruines` ``. SVG décoratif `aria-hidden`.
- Ordre de Tab = ordre du markup (branche → palier → angle) pour un parcours logique.
- `:focus-visible` net : `outline: 2px solid var(--brand-gold-bright); outline-offset: 2px` (ressort sur fond sombre).
- `aria-live="polite"` off-screen annonçant « {nom} acquis » et « {n} nouveaux nœuds disponibles ».
- Pas de `role="tree"` (pas de vraie hiérarchie parent→enfant) ; `<h3>` par branche en légende.

---

## 5bis. Direction visuelle retenue — cadres Kenney biseautés + icônes Font Awesome

> **Choix utilisateur** : mélange « réf #5 (nœuds biseautés, ludiques) » + « une icône qui évoque le bonus ».
> **Constat vérifié** : les packs Kenney de `UI assets/` (voisin de `CE 0.3`) ne contiennent **aucune icône thématique** (ni blé, ni pièce, ni livre, ni brique…) — seulement des glyphes d'UI (`iconCheck`, `iconCross`, flèches, play) + de rares thématiques dispersées (sablier, clé à molette, marteau, bouclier, étoile). L'icône « qui évoque le bonus » **ne peut donc pas** venir de Kenney.
> **Résolution** : le **cadre** (le côté « juicy » biseauté) vient de **Kenney** ; l'**icône** vient de **Font Awesome** (déjà chargé dans le projet, vectoriel, recolorable, couvre tous les effets). Un seul asset déjà intégré aujourd'hui : `src/assets/ui/topbar-frame.png` (bordure Fantasy teintée or, posée en `border-image`).

### Anatomie d'un nœud
`<button>` (cf. §3.1) composé de :
- **fond** = cadre biseauté Kenney `round_grey.png` (UI Pack - Adventure), **teinté à la couleur de la branche** ;
- **centre** = une **icône Font Awesome** dont le glyphe évoque l'effet (`effectType` → FA, table ci-dessous), en couleur branche/ivoire ;
- **coin** = pastille d'état (`iconCheck_*` acheté ✓ / `iconCross_*` exclu ✗, ou `fa-check`/`fa-ban`) ;
- **coût + nom** restent dans le tooltip (§5.2) ; nom court possible sous le disque au zoom.

**Capstone** : même cadre agrandi (×1,4) + **couronne** `fa-crown` (ou l'étoile `minimap_icon_star_yellow.png` de Kenney) en surimpression.
**Dogme** : médaillon **hexagonal** `hexagon_grey.png` (Kenney) teinté or, badge Dogme/Trait/Compétence (§4.6).
**Hub central** : encadré d'une **bordure Fantasy UI Borders teintée or** (même technique que `topbar-frame.png`, `border-image` 9-slice) → point focal antique cohérent avec le reste du jeu.

### Table `effectType → icône Font Awesome` (réutilise `RES_ICONS`, [resourceIcons.js](src/components/ui/resourceIcons.js))

| `effectType` (et sa famille) | Icône FA | Évoque |
|---|---|---|
| `foodMult` / `foodKeep` / `startFood*` | `fa-wheat-awn` | nourriture |
| `goldMult` / `goldKeep` / `startGold*` | `fa-coins` | trésor |
| `knowledgeMult` / `knowledgeKeep` / `knowledgeDiscount` / `startKnowledge*` | `fa-book-open` | savoir |
| `infraMult` / `infraKeep` / `infraDiscount` | `fa-archway` | infrastructure |
| `populationMult` / `startPopulation*` | `fa-users` | population |
| `timeWearSlow` | `fa-hourglass-half` | usure du temps |
| `stability` | `fa-scale-balanced` | rupture apaisée |
| `ruptureHaste` | `fa-bolt` | rupture accélérée (arbitrage opt-in) |
| `ruinGain` | `fa-landmark` | gain de ruines |
| `globalMult` | `fa-earth-europe` | production globale |
| `cityDiscount` | `fa-tags` | coûts des moteurs |
| `unspentRuinsPower` | `fa-vault` | ruines en réserve |
| `chronicleEngine` | `fa-feather` | chronique |
| *(sans `effectType` — automatisations `conseil_de_crise` / `edit_effondrement`)* | `fa-gears` | crise automatisée |
| *(`veilleurs_nuit*`)* | `fa-moon` | gain hors-ligne |
| **fallback** (aucun match) | **glyphe de branche** | — |

**Glyphes de branche** (hub + fallback) : resilience `fa-seedling`, prosperity `fa-coins`, knowledge `fa-book-open`, cycle_crise `fa-arrows-spin`, veille `fa-moon`.
`nodeIcon.js` = `iconFor(upgrade)` qui lit `upgrade.effectType` dans cette table, sinon retourne le glyphe de la branche.

### Teinte par branche & états — sans explosion d'assets
- **Bake (une fois)** : 5 cadres `round_*` teintés (vert/or/bleu/rouge/gris) depuis le master gris neutre, via la recette PowerShell `System.Drawing` documentée dans [`docs/ui-references.md`](docs/ui-references.md) §3 (remplacement RGB, alpha conservé) + 1 hexagone or (dogmes) + 1 cadre capstone. ⇒ **~7 PNG** dans `src/assets/ui/ruins-tree/`. **Pas** de variante par état.
- **États en pur CSS** (sur le même cadre, **zéro** asset supplémentaire) :
  - verrouillé (palier fermé) → `filter: grayscale(.8) opacity(.5)` ;
  - verrouillé (trop cher) → cadre plein, icône atténuée, **pas** de glow ;
  - disponible → `box-shadow` glow couleur branche + icône vive ;
  - acheté → surcouche lumineuse (`::after`) + pastille ✓ ;
  - bloqué → surcouche rouge + pastille ✗ (réutilise `iconCross_*` Kenney ou `fa-ban`).
- **Repli si le bake ennuie** : garder le cadre gris neutre unique et porter l'identité de branche par la **couleur de l'icône FA** + la couleur du tronc/arête. Moins « juicy » mais zéro bake.

> Cohérence : le « disque » de §5.1 = ce cadre Kenney teinté. La règle « petit texte → Inter » et la palette de tokens (§6, R11) restent valables ; les cadres bakés réutilisent exactement les couleurs de branche.

---

## 6. Contraintes & registre de risques (consolidé)

| # | Contrainte / risque | Sévérité | Mitigation |
|---|---|---|---|
| R1 | Modifier `upgrades.js`/`PRESTIGE_TREE_BRANCHES`/`PRESTIGE_DOGMAS` casserait `ruinTree.structure.test.js` | **bloquant** | Layout = module séparé en **lecture seule** ; n'ajoute que des coordonnées. Aucune écriture dans les structures testées. Rejouer vitest à chaque phase. |
| R2 | Compat save : achats persistants doivent s'afficher au 1er rendu | **bloquant** | Ne rien changer à `state.upgrades`/persistance. `has(id)` reflète déjà les achats. Tester avec un save avancé. |
| R3 | Interdiction de lib graphe (d3/reactflow/cytoscape/panzoom) | **bloquant** | Trigo maison (`cos/sin`), arêtes `<path>` SVG. Zéro dépendance ajoutée (`package.json` diff vide). |
| R4 | Régression **fonctionnelle non testée** (achat/coût/effet/statut/conflit/capstone/dogme) | **bloquant** | Checklist d'équivalence §8 + **ajouter un test d'intégration** sur le chemin d'achat (absent aujourd'hui). |
| R5 | Aucune arête nœud→nœud : une ligne « prérequis » mentirait | majeur | Schéma « tronc + porte » (D3). Seul `conflictsWith` est une vraie arête (cross-branche, D4). |
| R6 | Branches très inégales (30↔4) déséquilibrent un radial naïf | majeur | Secteur **proportionnel** + plancher `MIN_W` + rayon borné au nb de paliers réel (D2/§4.2). |
| R7 | Densité `prosperity` tier 4/5 (6 nœuds) | majeur | **Calculé §4.2 : ~159 px/nœud, tient sans `.dense`.** Garde-fou `.dense` conservé, non attendu. |
| R8 | Démontage en crise (nav verrouillée hors `prestige`) | majeur | SVG/React : démontage trivial. Tout état devant survivre (set « déjà-vu ») dans `state`, **pas** un `useRef` local (D9). |
| R9 | `prefers-reduced-motion` | majeur | Toute anim sous `@media (reduce)` → état final instantané (§5.4). |
| R10 | Libellés FR longs dans nœuds compacts | majeur | Tooltip **obligatoire** (§5.2) ; disque = icône + nom court ; `--font-body` (Inter) <0.9rem. |
| R11 | Couleurs hors palette | majeur | Tokens vérifiés : resilience `--green`, prosperity `--gold`, knowledge `--blue`, cycle_crise `#c86464`/`--red`, **veille = gris neutre existant** (ne PAS recolorer en `--violet` = `--state-usure` = danger). |
| R-perf | Recalcul layout à chaque achat/gain | mineur (re-render rare) | `useMemo` géométrie deps statiques + signature `visibleIds`. **Pas de re-render 1 Hz** (D6, vérifié). Possible réutilisation du pattern `renderCache`/signature existant ([shared.js:38-58](src/game/core/mechanics/shared.js)) pour mémoïser les statuts. |
| R12 | CSS legacy `.tree-*`/`.dogma-*` orphelin | mineur | Supprimer le legacy **seulement** après bascule (Phase finale) + `grep` confirmant aucun autre consommateur. |
| R13 | Electron offline | mineur | Tout vectoriel/CSS ; FA et polices déjà bundlées. Aucune ressource réseau. |
| R14 | Thémage d'ère | mineur | Couleurs **par branche**, or = accent global, `--era-rgb` constant. Aucun skin d'ère. |
| R15 | **Bake d'assets** : cadres Kenney teintés par branche à fabriquer/maintenir (§5bis) | majeur | Baker depuis **un** master gris neutre via la recette documentée (`docs/ui-references.md §3`) ; **≤7 PNG** ; **états en CSS** (pas d'asset par état). Repli « cadre neutre + icône colorée » si le bake ennuie. |
| R16 | **Netteté raster** (hi-DPI, futur zoom) : les PNG Kenney ne sont pas vectoriels | mineur | Taille de nœud **fixe** au MVP (pas de pan/zoom). Exporter le cadre à ~2× la taille rendue. Les **icônes** (FA) et **arêtes/troncs** (SVG) restent vectoriels → seul le cadre est raster. |
| R17 | **Style off-skin** : assets Kenney cartoon/saturés vs skin sombre/or austère | mineur | **Teinter** (désaturer + recolorer) au bake ; encadrer le hub d'une bordure Fantasy or (skin déjà en place) pour ré-ancrer l'ensemble. Le glow/halo CSS adoucit le biseau. |

---

## 7. Plan d'implémentation (fichier par fichier)

> Pas de flag `state.ruinsTreeGraph` + double rendu : le filet de sécurité est **git** (branche dédiée + commit du legacy dans l'historique), pas un A/B vivant en prod pour un projet solo. (Décision pondérée — voir Annexe 9.3.)

### Fichiers à créer
| Fichier | Rôle | React ? | Testé ? |
|---|---|---|---|
| `src/components/views/ruinsTree/layout.js` | **Layout pur** `layout(branches, visibleIds)` → `{hub, nodes[], gates[], edges[], dogmas[], exclusionLinks[], bounds}`. Déterministe, zéro state, zéro React. | non | **oui** |
| `src/components/views/ruinsTree/branchTheme.js` | `BRANCH_THEME[branchId] = { baseAngle, color, rgb, glow, faIcon, hubLabel }`. Réutilise tokens existants. | non | optionnel |
| `src/components/views/ruinsTree/nodeIcon.js` | `iconFor(upgrade)` : table `effectType → classe FA` (§5bis), fallback glyphe de branche. Réutilise `RES_ICONS`. | non | optionnel |
| `src/assets/ui/ruins-tree/*.png` | **Cadres Kenney bakés** : `node_{branch}.png` ×5 + `dogma_hex.png` + `capstone.png` (teintés depuis le master gris neutre, recette `ui-references.md §3`). ~7 PNG. | — | — |
| `src/components/views/RuinsTreeGraph.jsx` | Conteneur SVG : appelle `layout`, mappe statuts via `checkNodeAvailability`, gère croissance/tooltip, délègue aux sous-composants. | oui | non |
| `src/components/views/ruinsTree/TreeNode.jsx` | `<button>` absolu : icône + statut + coût + halo. `onClick={() => buyUpgrade(id)}`, `aria-disabled`. | oui | non |
| `src/components/views/ruinsTree/TreeTrunk.jsx` | `<path>` tronc + portes (cercle + texte `ownedBelow/need`). | oui | non |
| `src/components/views/ruinsTree/TreeEdge.jsx` | `<path>` feuille→tronc + fils d'exclusion, classe d'état. | oui | non |
| `src/components/views/ruinsTree/DogmaMedallion.jsx` | hexagone + badge + anneau de progression. `checkDogmaAvailability`. | oui | non |
| `src/components/views/ruinsTree/NodeTooltip.jsx` | overlay HTML : nom, effet, desc/lore, coût, état contextuel. | oui | non |
| `src/styles/ruinsTree.css` | Bloc CSS dédié : états nœud/arête, halos, croissance, couleurs branche, `reduced-motion`. (Importé via `src/index.css`.) | — | — |
| `src/components/views/ruinsTree/__tests__/layout.test.js` | Invariants layout (voir plus bas). | — | **oui** |

### Fichiers à modifier
| Fichier | Modification |
|---|---|
| [`src/components/views/RuinsView.jsx`](src/components/views/RuinsView.jsx) | Remplacer `.dogma-grid` + `.prestige-tree` par `<RuinsTreeGraph/>`. Conserver le `<section className="view active">` et le compteur de ruines (passer l'emoji 🏛️ → `fa-landmark`, D8). |
| [`src/game/core/state.js`](src/game/core/state.js) | Ajouter un champ racine `ruinsSeenNodes: []` dans **`defaultState()`** ET sa normalisation dans **`hydrateState()`** (le commentaire l.249 rappelle : tout champ persistant doit figurer aux deux endroits). Le `save()` sérialise tout le state en JSON ([state.js:902](src/game/core/state.js)) → stocker un **tableau** d'ids (pas un `Set`). Décider s'il entre dans `GR_PERSISTENT_FIELDS` (Annexe 9.3, décision #3). Champ purement UI, zéro impact gameplay. |

### Ordre & phases

**Phase 1 — MVP livrable (arbre radial statique cliquable + dogmes intégrés)**
- **Bake** des ~7 cadres Kenney teintés → `src/assets/ui/ruins-tree/` (recette `ui-references.md §3`).
- `layout.js` + `layout.test.js` complets (incl. dogmes & fils d'exclusion).
- `branchTheme.js` (couleur + cadre + glyphe par branche) + `nodeIcon.js` (table `effectType→FA` complète, §5bis).
- `RuinsTreeGraph.jsx` + `TreeNode` (cadre Kenney + icône FA) / `TreeTrunk` / `TreeEdge` / `DogmaMedallion` (hexagone) / `NodeTooltip`.
- `ruinsTree.css` : cadres teintés + 6 états (filtres CSS), portes, médaillons, fils d'exclusion, hub encadré Fantasy or.
- `RuinsView.jsx` rebranché ; `fa-landmark` partout.
- **Validation** : acheter un nœud `available` → `purchased`, ruines débitées, palier suivant s'ouvre ; conflit → `blocked` ; dogme `cost 0` adoptable au palier ; vitest vert.

**Phase 2 — Croissance & polish**
- Champ `ruinsSeenNodes` + animation « déjà-vu » (§5.4), `prefers-reduced-motion`.
- Tooltip enrichi (desc/lore), `aria-live`.
- Capstones mis en valeur (★, halo large).
- **Validation** : effondrer → revenir → nouveaux nœuds « poussent » **une fois** ; re-visite = pas d'anim ; reduced-motion = instantané.

**Phase 3 (incrément, hors engagement) — pan/zoom si nécessaire**
- Seulement si l'arbre est jugé trop petit à l'usage : `transform` CSS + math `cmClampCamera`, wheel `{passive:false}`, drag-vs-clic (`moved>4px`), `touch-action:none`.

### Tests à ajouter
`layout.test.js` :
- **(a)** chaque nœud visible reçoit une position **finie et unique** (pas de NaN, pas de doublon) ;
- **(b)** **pas de chevauchement** : distance min entre centres ≥ `2·NODE_R + marge` (vérifier `prosperity` tiers 4/5) ;
- **(c)** **bijection** : tout id de `PRESTIGE_TREE` visible est plaçable ;
- **(d)** **déterminisme** : même entrée → mêmes positions (aucun `Math.random`) ;
- **(e)** **honnêteté** : aucune arête ne relie deux nœuds de paliers différents (seules feuille→tronc + exclusion existent) ;
- **(f)** chaque dogme placé à `dogmaRadius` cohérent (monotone en `requiredPurchases`).

Test d'intégration (combler R4) : monter `RuinsTreeGraph`, simuler un clic sur un nœud `available`, asserter `buyUpgrade` appelé et statut → `purchased`.

---

## 8. Definition of Done / garde-fous anti-régression

1. **Tests verts** : `ruinTree.structure.test.js` **inchangé** + `layout.test.js` + test d'intégration d'achat.
2. **Aucune dépendance** ajoutée (`package.json` diff vide) ; `upgrades.js` non modifié.
3. **Parité fonctionnelle** : achat, coût (`fmt`), effet, statut (Acheté/Disponible/Exclu/Verrouillé), conflit (Exclut/Exclu par), capstone (★), progression de branche, **10 dogmes** (progression + adoption gratuite) — toutes présentes.
4. **Croissance** : effondrer pour gagner un cycle → nouveaux nœuds visibles « poussent » **une seule fois** au retour ; pas de clignotement aux visites suivantes.
5. **A11y** : 100 % clavier (Tab/Entrée), `:focus-visible` net, `aria-label` complet, SVG `aria-hidden`, `aria-live` sur achat. Contraste OK.
6. **`prefers-reduced-motion`** : toutes anims coupées → état final instantané.
7. **Re-render** : un achat = **un** re-render ; layout géométrique **non** recalculé (deps `useMemo` statiques) ; pas de re-render au tick tant que `ruins`/`upgrades` stables.
8. **Démontage propre** en entrée/sortie de crise (aucune fuite, aucun runtime à nettoyer).
9. **Responsive** : `viewBox` + `width:100%` ; aucun scroll horizontal piégé. (Repli étroit = hors MVP.)
10. **Typo** : tout texte <0.9rem en `--font-body` (Inter) ; `--font-title` réservé aux grands titres.
11. **Couleurs** : tokens vérifiés ; `veille` reste gris neutre ; aucun hex hors palette.
12. **Icône monnaie** : `fa-landmark` partout (compteur + ~90 coûts), plus aucun emoji 🏛️.
13. **Iconographie de nœud** : chaque nœud porte une **icône FA** cohérente avec son `effectType` (table §5bis) ; fallback = glyphe de branche ; capstone couronné ; dogmes en hexagone.
14. **Cadres** : ≤7 PNG Kenney bakés (`src/assets/ui/ruins-tree/`), teinte par branche, **états en CSS** (aucun asset par état) ; hub encadré d'une bordure Fantasy or. Style ré-ancré (désaturé/teinté), pas de cartoon saturé brut.

---

## 9. Annexe — alternatives écartées & décisions ouvertes

### 9.1 Alternatives écartées (arbitrages clos)
- **Canvas impératif** (pattern `CityMapCanvas`) : écarté. Forcerait à réimplémenter focus/ARIA/hit-test pour zéro gain à ~100 nœuds statiques. Réservé à une future toile >quelques centaines de nœuds animés. Le pattern caméra reste une *référence* si pan/zoom ajouté.
- **SVG pur (`<text>`/`<foreignObject>`)** : écarté. `<text>` ne wrappe pas, n'hérite pas de la stack typo ; `foreignObject` a des bugs de focus/scroll.
- **Arêtes par appariement glouton « frère le plus proche »** : écarté (mensonge visuel sur un prérequis nœud→nœud inexistant).
- **Arêtes vers barycentre du palier précédent** : écarté (barycentre instable quand `unlockCycles` cache des nœuds, et sans sens mécanique).
- **Slices structurelles + passe CSS d'affordabilité hors-React** : écarté (résolvent un re-render 1 Hz inexistant — vérifié).
- **Tables d'emoji `EFFECT_ICON`/`NODE_ICON` (~40 entrées)** : écarté (FA déjà chargé ; emoji = rendu OS-dépendant).
- **Recoloration `veille` en `--violet`/#9B5DE5** : écarté (`--violet` = `--state-usure` = danger ; couleur inventée hors palette).
- **Silhouettes-fantômes au MVP** : reporté (incrément). MVP = `!isUnlocked` non rendu.
- **Flag `state.ruinsTreeGraph` + double rendu legacy** : écarté au profit du filet **git** (cf. 9.3).

### 9.2 Repli **hors MVP** (non implémenté tant que non nécessaire)
Si un usage desktop très étroit casse la lisibilité radiale : disposition **« 5 troncs verticaux »** (colonnes, paliers en lignes, nœuds en éventail), **pas** la grille actuelle. À ne pas livrer en double avec le radial.

### 9.3 Décisions ouvertes laissées à l'auteur humain
1. **Filet de réversibilité** : git-only (recommandé, simple, adapté solo-dev — cf. mémoire « workflow git débutant ») **ou** réintroduire un flag de state + aiguilleur legacy si tu veux comparer A/B à chaud. Le flag a une vraie valeur de réversibilité mais coûte du CSS double vivant — non gratuit.
2. **Nœuds activables hors dogmes** : **vérifié — il n'existe AUCUN nœud `skill_` dans l'arbre** (le seul `skill_archaeology` est un *dogme*). `conseil_de_crise`/`edit_effondrement` (cycle_crise tier 0) débloquent des automatisations mais ne portent **pas** le préfixe `skill_` → à traiter comme des nœuds normaux, **sauf** si tu veux leur donner un badge « automatisation » distinctif (cosmétique, optionnel).
3. **Persistance & Grand Reset de `ruinsSeenNodes`** : champ racine additif sérialisé par `JSON.stringify(state)` et normalisé dans `hydrateState` (ignore les saves sans le champ → `[]`). **Décider** s'il entre dans `GR_PERSISTENT_FIELDS` : l'EXCLURE (recommandé) ⇒ après un Grand Reset le set repart vide et **l'arbre re-pousse** intégralement (effet « renaissance » cohérent avec le thème). L'inclure ⇒ pas de re-pousse post-GR.
4. **Lore (`upgrade.desc`)** dans le tooltip : la plupart des nœuds ont un `desc`, mais quelques `dogma_*`/`trait_*` peuvent en manquer → prévoir un fallback gracieux (masquer la ligne si vide).

---

## Récapitulatif des 8 décisions structurantes
1. **Rendu** : SVG (troncs/portes/arêtes) + `<button>` HTML absolus (nœuds). Pas de canvas.
2. **Layout** : radial UNIQUE à moyeu central, secteurs proportionnels au nb de nœuds + plancher `MIN_W` pour `veille`, rayon borné au nb de paliers réel.
3. **Arêtes** : « tronc + porte de palier » (honnête vis-à-vis du gating par compteur) ; aucune arête nœud→nœud ; la porte porte `ownedBelow/need`.
4. **Conflits** : 2 paires `conflictsWith` INTER-branches → fil d'exclusion rouge cross-branche (⊘), seule vraie arête.
5. **Pan/zoom coupé du MVP** ; re-render piloté par événements (achat/gain), pas 1 Hz → garder `s => s.ruins`, mémoïser la géométrie.
6. **Dogmes intégrés dès le MVP** en médaillons de bout de branche (via `requiredPurchases`) ; la `dogma-grid` plate disparaît.
7. **Croissance** jouée UNE fois au premier montage post-effondrement via set « déjà-vu » persistant (`state.ruinsSeenNodes`) ; jamais au simple retour d'onglet ; `reduced-motion` respecté.
8. **Icône monnaie** unifiée sur `fa-landmark` partout ; `veille` reste gris neutre (jamais `--violet`).
9. **Direction visuelle (choix utilisateur)** : nœuds = **cadre biseauté Kenney teinté par branche** (look « juicy » réf #5) + **icône Font Awesome par `effectType`** (Kenney n'ayant aucune icône thématique) ; hub encadré d'une bordure Fantasy or ; ≤7 PNG bakés, états en CSS.
