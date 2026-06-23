# Inventaire du rendu — code vs assets (pour décider quoi commander)

> Doc pour **toi** (Raphi), pas pour le freelance. But : que tu saches exactement ce qui
> est dessiné en code aujourd'hui, et donc ce que tu commandes vraiment.

## Constat de base

**Quasiment tout le visuel du jeu est procédural, dessiné en code Canvas 2D.** Il n'y a
presque aucune image : la cité, le fleuve, les routes, les bâtiments, les citoyens, la
lumière jour/nuit et les thèmes par époque sont recalculés et redessinés à chaque frame.

Les seuls vrais fichiers image du projet sont quelques éléments d'UI :
`src/assets/ui/` → `ruins-frame.png`, `ruins-corner.png`, `topbar-frame.png`, et les
icônes de l'arbre des ruines. **C'est tout.** Le reste, c'est du `ctx.fillRect`, des
dégradés et des sprites de lumière générés à la volée.

## Ce qui est rendu en code (et donc se modifie en JS, pas en Photoshop)

| Domaine | Où c'est | Ce qu'un dev y touche |
|---|---|---|
| Boucle de rendu, caméra, résolution | `src/game/map/cityMapRuntime.js` | fluidité, ordre de dessin, perf |
| Sol, terrain, fleuve, reflets, nuit, lampadaires, ponts, murs, places, routes, crise | `src/game/map/renderWorld.js` | l'essentiel de l'ambiance / atmosphère |
| Bâtiments, merveilles, feu central, minimap | `src/game/map/renderBuildings.js` | silhouettes, volumes des bâtiments |
| Formes des bâtiments par type | `cityEngineSprites.js`, `engineSprites.js`, `buildingShapes.js` | l'allure de chaque bâtiment |
| Citoyens, véhicules, bateaux, bulles de pensée | `src/game/map/agents.js` | animations de vie de la cité |
| Où vont les choses (graphe de routes, eau, placement, murs) | `layout.js` + `procedural/**` | structure/cosmétique de la cité |
| Palettes / thèmes par époque | `src/game/data/eraThemes.js`, `procedural/ageVisualConfig.js` | l'évolution visuelle au fil des âges |
| Tout l'habillage UI (HUD, boutique, panneaux, dialogues) | `src/components/**` + `src/styles/**` | le « skin » sombre/or/antique |

## Ce qui POURRAIT devenir des assets — les 3 voies

Aujourd'hui les bâtiments sont des **formes dessinées en code**. On *pourrait* les
remplacer par des **sprites/tuiles dessinés par un artiste** (PNG/atlas). Trois voies :

- **A. Tout procédural (statu quo, amélioré).** Avantages : se thématise tout seul par
  époque, infiniment extensible, zéro pipeline d'assets, taille du jeu minuscule.
  Inconvénient : plafond de « beau » plus bas que la main d'un artiste ; c'est du travail
  de **dev rendu**, pas d'illustrateur.
- **B. Tout sprites/tuiles.** Avantages : qualité visuelle d'un artiste, style fort.
  Inconvénients lourds : **(a)** explosion combinatoire — il faut **chaque bâtiment ×
  chaque époque** (~20) dessiné à la main, **(b)** un dev qui construit le **pipeline**
  (atlas, placement, éclairage, profondeur), **(c)** tu **perds l'évolution visuelle
  automatique par époque** (l'âme du jeu), **(d)** dépendance permanente à un artiste pour
  tout nouveau contenu. C'est plus cher et c'est **deux métiers**. (NB : la refonte iso
  pixel art, voie B, a déjà été tentée et mise en pause — « trop chiant ».)

### ✅ C. Hybride — la voie recommandée

On **garde le procédural** comme base (placement, routes, fleuve, **éclairage,
atmosphère, animation, thèmes par époque** — là où se gagne le « vivant »), et on
commande des **assets faits main uniquement pour les éléments héros** : merveilles /
monuments, feu central, quelques landmarks, cadres d'UI. Là où l'œil se pose.

Pourquoi c'est le meilleur compromis :
- ~80 % du gain visuel d'un artiste pour ~20 % du coût et du risque.
- On **ne casse pas** le theming automatique par époque (la base reste procédurale).
- Le « beau » en mouvement (lumière, reflets, nuit, agents) est déjà atteignable en
  procédural et **pas encore au plafond** — c'est le plus gros levier sous-exploité.
- Prestataire principal = **dev Canvas/front-end** (pousse l'ambiance + intègre les assets
  héros). En parallèle, **petite commande d'art ciblée** à un illustrateur pour les
  monuments — pas une refonte totale.

→ Donc « plus beau avec des assets » = vrai, mais la version maligne, c'est **un peu**
d'assets aux bons endroits (voie C), pas tout en assets (voie B).

## Frontière propre à faire respecter

- **Modifiable** par le prestataire : `src/game/map/**`, `src/components/**`,
  `src/styles/**`, `src/assets/**`.
- **Interdit sans ton accord écrit** : `src/game/core/**` (logique, équilibrage, boucle)
  et `src/game/data/**` (contenu, nombres). Le rendu **lit** l'état du jeu, il ne l'écrit
  jamais. Les tests Vitest (`npm test`) protègent déjà la génération de carte — ils
  doivent rester verts.
