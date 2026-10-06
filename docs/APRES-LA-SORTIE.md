# Après la sortie — les chantiers de structure renvoyés

Décision de Raph (lot 10 de l'audit du 2026-10-05) : ces chantiers attendent la sortie
Steam. Aucun ne corrige un bug joueur ; tous touchent beaucoup de fichiers, ou du code
que plusieurs sessions modifient en même temps. Les faire juste avant la sortie, c'est
risquer une régression pour un gain de maintenance.

Chaque fiche reprend le constat et le correctif de l'audit
(`docs/audits/audit-2026-10-05-RAPPORT.md`, même identifiant ; preuves dans
`audit-2026-10-05/_audit/`). Les numéros de ligne datent du 05/10 : les relire avant
de commencer. Effort : S = une séance, M = quelques séances, L = un chantier.

Règles communes, valables pour toutes les fiches :

- **Rendu identique au pixel** : captures `__cityShot` avant/après (même graine, même
  caméra, `citizens:'none'`, poses gelées), à plusieurs ères et zooms, comparées par
  `scripts/frameStats.mjs`. Une fiche de structure ne change aucun visuel.
- **Un fichier partagé avec une autre session se commite d'abord** : attendre que les
  chantiers en cours sur `cityEngineSprites.js`, `layout.js`, `cityMapRuntime.js` et
  `state.js` soient commités avant d'y découper quoi que ce soit.
- **Cycles d'import** : relire ARCHITECTURE.md §7 avant de déplacer un module (un
  `const` lu par `load()` avant sa déclaration = sauvegarde perdue).

---

## STRUCT-11 — Sortir le singleton `CM` de layout.js · effort S · à faire en premier

**Constat.** `layout.js` définit `const CM = { TILE: 32, canvas…, cam…, citizens… }`.
91 fichiers l'importent pour lire `CM` (100 importeurs de `layout.js`), et `layout.js`
importe `core/state`, `core/utils` et le baril `core/mechanics` : le moindre module de
rendu ou test qui veut lire `CM.cam` charge tout l'algorithme de disposition (~6 000
lignes) et l'état du jeu.

**Correctif.** Déplacer le littéral (il ne référence aucun symbole de `layout.js`) dans
`src/game/map/cm.js`, sans aucune dépendance ; garder `export { CM } from './cm.js'`
dans `layout.js` pour la compatibilité ; migrer les imports au fil de l'eau.

**Risques.** Quasi nuls si `cm.js` reste une feuille. Le seul piège : un module qui
importerait `cm.js` ET dépendrait d'un effet de bord de l'évaluation de `layout.js`
(molettes, registres). Lancer toute la suite après la bascule. C'est le préalable qui
allège les tests de toutes les autres fiches carte.

---

## STRUCT-10 — Les cycles et couches qui se croisent encore · effort M

**Constat.** Composantes fortement connexes restantes :
- `state.js ↔ utils.js ↔ data/olympus.js` : `utils.js` importe `state` pour
  `canPayCost` / `payCost` seulement, alors que `state.js` importe `clamp01` et que
  `load()` s'exécute à l'évaluation. Sans danger tant que `clamp` / `clamp01` restent
  des déclarations de `function` (hissées) — un commentaire le dit désormais sur place.
- `agents.js` (simulation) importe `bridgeWalkBand` et `bridgeTune` du RENDU du pont
  (`iso/isoBridge.js`), d'où le groupe `{agents, isoBridge, citizenFocus, quaysAndRiot}`.
- `audio/melodieScene.js` et `audio/slotsSound.js` importent les préférences son de
  `core/main.js` (la boucle de jeu) : les faits divers de la carte (fdLovers,
  fdMusicien) tirent ainsi toute la boucle.
- `events.js` importe le baril `actions.js`.

**Correctif.** Déplacer `canPayCost` / `payCost` dans `mechanics/cost.js` (15
importeurs), ce qui laisse `utils.js` pur ; extraire la géométrie du pont
(`bridgeGeoms`, `bridgeWalkBand`, `bridgeBlocks`, `bridgeTune`) dans
`iso/bridgeGeom.js` ; mettre les préférences son dans `core/audioPrefs.js` ; faire
importer `events.js` depuis les sous-modules d'actions.

**Risques.** C'est la fiche où une erreur coûte une SAUVEGARDE : un déplacement qui
change l'ordre d'évaluation peut faire lire à `load()` un `const` en zone morte. Garder
les tests de chargement (`state.hydration.test.js`, les tests d'import de la chute) et
ajouter un test qui importe `utils.js` AVANT `state.js`. Pour le pont : la géométrie
est partagée par la simulation et le dessin, un écart d'une demi-case fait marcher les
habitants à côté du tablier (comparer les bandes de marche avant/après).

---

## STRUCT-2 — Les fonctions géantes · effort L

**Constat.** `drawCityEngineSprite` (cityEngineSprites.js, ~3 670 lignes, une branche
`if (id === …)` de 400 à 500 lignes par bâtiment), `computeCityLayout` (layout.js,
~3 470 lignes, une quarantaine de passes en ligne) et `drawEngineSpriteCore`
(engineSprites.js, ~1 590 lignes) dépassent la limite d'optimisation de TurboFan
(61 440 octets de bytecode) : elles ne passent que par Maglev. Deux fichiers sont hors
lint (`/* eslint-disable */` en tête de `layout.js` et `engineSprites.js`). Autres très
longues fonctions : `cityMapEnsureLayout` (774 l.), `initCityMap` (659),
`citizenChooseNext` (376), `hydrateState` (340).

**Correctif.** D'abord retirer les deux `/* eslint-disable */` (4 erreurs seulement dans
`layout.js`, 1 variable morte dans `engineSprites.js` au 05/10). Puis une fonction par
bâtiment avec une table de dispatch, et extraire de `layout.js` les blocs déjà purs
(réseau de routes…).

**Risques.** Le gain de perf mesuré est faible (−3 % sur `computeCityLayout`) : c'est de
la dette de maintenance (impossible de profiler ou tester une scène isolément, une
centaine de variables locales partagées entre branches). Le risque est visuel et de
fusion : ces trois fichiers sont les plus modifiés par les sessions parallèles. ⚠ Les
chiffres datent d'avant la suppression des replis procéduraux des bâtiments-moteur
(MORT-2, lot 10) : re-mesurer la taille de `drawCityEngineSprite` avant de découper.
Pour `computeCityLayout`, comparer les plans produits (tuiles, routes, slots) sur les
26 états témoins du lot 4 de l'audit, en plus des captures.

---

## STRUCT-3 — La mécanique commune des 9 scènes de jeu · effort M

**Constat.** Le même bloc (mise en suspens `pendingRef`, `flushPending`, écouteurs
`pagehide` / `beforeunload` avec `save()`, vidage au démontage) est recopié dans
Augury, Roulette, Roue, Courses, Duel et Scratch (~15 lignes chacun) ; l'effet
« changement de cycle → fermeture » dans Icarus, Augury, Blackjack, Scratch, Courses et
Duel. Les copies ont divergé (Courses règle la course dans le rAF, Roulette et Roue sur
un `setTimeout` ; Roulette et Roue n'ont pas l'effet de changement de cycle).

**Correctif.** Deux hooks partagés : `usePendingSettlement()` (vidage au démontage, à
`pagehide`, à `beforeunload`, puis `save`) et `useCloseOnCollapse(onClose)`. Les écarts
concrets déjà visibles relèvent d'une entrée à part (BUG-115) : vérifier ce qu'elle a
déjà aligné avant de factoriser.

**Risques.** C'est le code qui paie ou perd les mises : une erreur = un gain perdu ou
payé deux fois. Avant de factoriser, écrire pour chaque scène un test qui ferme la page
en pleine manche, démonte la scène, puis déclenche un effondrement, et vérifie la
Faveur. Factoriser une scène à la fois.

---

## STRUCT-5 — Les doublons entre les ports et avec le fleuve · effort M

**Constat.** La formule de stade `ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3` est
recopiée 4 fois (isoPier, isoPort ×2, boatBerths ; isoField a la même) ; `boatBerths`
recalcule le plan du ponton avec le `hw` d'un échantillon alors qu'`isoPier` interpole
au point le plus proche (le tablier des porteurs peut différer de celui dessiné) ; le
plus proche point du ruban est réimplémenté 4 fois ; le seuil « bande ≥ 1 » des quais
(isoQuay, 3 endroits) double `waterShoreTune.maxBand` ; le mémo « tuiles d'un type de
port », l'enveloppe miroir et l'ombrage du mur maçonné sont recopiés 2 à 3 fois.

**Correctif.** Exporter `stageOf(ei)` d'isoPier et l'utiliser partout ; faire rendre à
`pierMoorings` la racine et le plan déjà calculés ; un module `ribbonGeom` (plus proche
point, bord, projection) ; faire lire `waterShoreTune.maxBand` (ou une constante
partagée) à isoQuay ; factoriser l'ombrage du mur dans isoBoxBake et le mémo de tuiles
en une fonction paramétrée.

**Risques.** Les deux ports sont un chantier vivant. Une copie qu'on croit identique
peut ne pas l'être (le `hw` du ponton en est un exemple) : unifier peut déplacer un
ponton ou un porteur d'un pixel. Captures de chaque port à chaque bande, avant/après.

---

## STRUCT-6 — Trois bateaux du Marbre réécrits à la main · effort M

**Constat.** Dans `boatKits.js`, BAC, CODICARIA et SCAPHA recopient `makeBac`,
`makeBarge({hut})` et `makeRowboat` (boatFamilies.js) : ~150 lignes de dessin en double.
Les correctifs ont divergé : la scapha anime 8 poses, `makeRowboat` est resté à 6
(2,7 images/s, ça saccade pour les pêcheurs des bandes 1, 2, 3 et 5) ; BAC ne salue pas
en état `salute`. Palettes (filet, chaume, écorce, lanterne, or) et `tint()` recopiés.

**Correctif.** Remplacer SCAPHA, CODICARIA et BAC par les fabriques avec les matières
PAL (option de matière des murs de la hutte pour `makeBarge`, option cargo
« amphores » pour `makeBac`) ; mettre les rampes communes et `tint()` dans `boatParts`.

**Risques.** Le remplacement doit être identique au pixel (cuire les trois bateaux
avant/après et comparer). ⚠ Passer `makeRowboat` à 8 poses CHANGE l'animation des
barques des autres ères : c'est un changement visuel, à faire valider par Raph (sauf la
variante latine, dont les poses de route sont identiques).

---

## STRUCT-7 — La cascade CSS tenue par l'ordre d'import · effort L

**Constat.** 231 sélecteurs déclarés plusieurs fois dans le même contexte, 227
déclarations écrasées par un sélecteur identique plus loin (60 avec la même valeur),
86 `!important` ; sur 3 548 sélecteurs, 802 préfixés `.app` et 302 par `:root…`
uniquement pour gagner en spécificité. Exemples : la hauteur de
`.civilization-map-interactive` en `!important` trois fois ; les thèmes d'ère du
ticker neutralisés par une règle de `views-city-hud.css` ; le bloc ≤ 980 px de
`base.css` à moitié écrasé par `layout.css`.

**Correctif.** Des couches de cascade explicites : `@layer tokens, base, components,
views, skin, touch;` et `@import url(...) layer(views)` dans `index.css` et `views.css`
(Chromium ≥ 99, donc Electron convient). Puis retirer progressivement les préfixes
`.app` / `:root` et les `!important` de surenchère ; regrouper la typographie ;
supprimer les 227 doublons écrasés (liste dans `_audit/tmp-css/stats.txt`), en
commençant par les 60 de même valeur ; supprimer le bloc `base.css` ≤ 980 px après
vérification en fenêtre de 900 px.

**Risques.** Les couches changent l'ordre de priorité de TOUT le CSS d'un coup : une
règle qui gagnait par l'ordre d'import peut perdre. Captures de chaque écran (Cité,
Plaisirs, Effondrement, Arbre des Ruines, dialogues) à 1280, 1920 et 2560 px, avant et
après, en FR et EN. Procéder fichier par fichier, une couche à la fois.

---

## WEB-2 — Chemins de sprites absolus · effort M · seulement si version web en sous-dossier

**Constat.** `vite.config.js` fixe `base: './'`, et Vite relativise bien les `url()` du
CSS, mais les chaînes JS restent absolues (`/pixelart/agents/…`, `/pixelart/iso/…`,
`/pixelart/ui/${e}.png`) : ~93 occurrences dans 35 fichiers, aucun usage de
`import.meta.env.BASE_URL`. Sans effet sur le .exe (`app://localhost/`) ni sur un
hébergement à la racine d'un domaine.

**Correctif.** Un seul utilitaire,
`export const px = (p) => import.meta.env.BASE_URL + 'pixelart/' + p`, et remplacer les
littéraux par `px('…')` (une forme relative `pixelart/…` marche aussi, le jeu étant
mono-page à la racine de `dist/`). Laisser le CSS tel quel.

**Risques.** Latent pour les cibles actuelles : à faire seulement si une version web en
sous-chemin (itch.io HTML5, page GitHub) est envisagée. Penser aux tests qui comparent
des chemins en dur (`pixelIconSizes.test.js` attend `/pixelart/ui/…`), aux chemins
construits par gabarit, et vérifier dans les quatre contextes : `npm run dev`,
`npm run preview`, le .exe, et un hébergement sous un sous-chemin. `BASE_URL` vaut `./`
au build : vérifier que les modules chargés dans un Worker résolvent bien leurs images.

---

## Restes signalés en corrigeant d'autres entrées

À reprendre au même moment que les fiches ci-dessus, faute d'avoir été strictement
identiques ou parce que le fichier était modifié par une autre session :

- **STRUCT-4** : les chargeurs d'images des dossiers autres que `/pixelart/iso/`
  (hearthArt, pixelHouses, agents, scènes moteur) ont encore chacun leur cache ; un
  cache commun par URL serait un chantier à part.
- **STRUCT-9** : les `fm` locaux à une fonction (isoQuay, isoRiver, isoTradePort), les
  fabriques de canvas d'agents / pixelHouses / isoWildBackdrop / streetKits, les scans
  d'encre aux sémantiques différentes et les conversions hex→rgb aux formats de sortie
  différents.
- **STRUCT-12** : `kitsFor` (KIND_KITS / RECIPES, ~250 lignes de données dans
  `isoPlaza.js`) à réécrire avec une comparaison profonde du résultat ; `vows.js` avec
  `cycleYear` / `currentEraIndex` en paramètres (inversion de couches, cf. STRUCT-10).
