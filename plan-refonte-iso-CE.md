# Plan de refonte visuelle v2 — Cité isométrique en pixel art

> Ce document **remplace** `plan-refonte-visuelle-CE.md` (qui supposait une page blanche).
> Il est calé sur la réalité du code et sur tes deux choix :
> **rendu = cité isométrique en tuiles** · **art = hybride (packs + sur-mesure)**.

**Objectif :** remplacer **uniquement l'habillage** de la carte par une cité isométrique en pixel art, qui grandit et se modernise au fil des âges — **sans toucher aux mécaniques**.

---

## Philosophie : on prend tout le temps qu'il faut

Depuis que la carte est en **plein écran**, c'est **elle que le joueur voit et apprécie en premier** — pas un décor de fond, mais *l'expérience*. Elle doit donner **envie de rester et de la voir grandir** (c'est le moteur de rétention d'un idle).

Donc : **qualité avant vitesse**. Une phase n'est « finie » que si elle est **belle et satisfaisante à l'écran**, pas seulement fonctionnelle. On itère sur la direction artistique autant qu'il faut, sans précipitation.

**Conséquence concrète :** avant de produire les ~50 sprites, on fait **une tranche verticale** — UN palier d'ère entièrement abouti (sol + quelques bâtiments + lumière + un détail vivant) — pour verrouiller la DA et l'« envie de rester » AVANT toute production de masse. On ne mass-produit jamais un look qu'on n'a pas encore validé.

---

## Le principe non négociable : on ne touche qu'à la couche de dessin

Le jeu actuel sépare déjà (presque) la logique du rendu. On garde tout à gauche, on remplace tout à droite :

| ON GARDE (intact) | ON REMPLACE (le « look ») |
|---|---|
| Store + mécaniques (achat de bâtiment → élément sur la carte) | La couche de dessin : `cityEngineSprites.js`, `buildingShapes.js`, `renderBuildings.js`, parties « peinture » de `renderWorld.js` |
| Progression par ères (bands 0→9) et évolutions | Le moteur de placement procédural libre → remplacé par une **grille isométrique** |
| Personnalité de ville, instabilité, mythes, ruines | La caméra et le rendu du sol/eau/citoyens (refaits en iso) |

**La règle d'or de ce chantier :** entre le jeu et le rendu, on pose **un seul tuyau** — une fonction pure `getCityRenderModel(state)` qui lit l'état et renvoie *quoi afficher* (liste de bâtiments avec `type`, `palier d'ère`, `case de grille`, + rayon de ville, instabilité…). Le rendu ne lit jamais le store directement. Comme ça, si on change encore d'idée plus tard, on ne réécrit que le rendu.

---

## Décisions de cadrage déjà prises

1. **Projection : isométrique** (tuiles en losange, vue 3/4). Nouveau système de coordonnées grille→écran.
2. **Tech de rendu : PixiJS v8** (recommandé). Raison : batching WebGL pour une ville de centaines de tuiles, tri de profondeur natif (`zIndex`), pixel-perfect (scaling « nearest », `roundPixels`). *(Canvas 2D `drawImage` reste un plan B viable si tu préfères ne pas ajouter de dépendance — à trancher en Phase 0.)*
3. **Art : hybride.** Packs prêts pour les ères classiques, sur-mesure (IA / commande) pour le primitif et le cosmique.
4. **On regroupe les 10 bandes d'ère en 5 paliers visuels** (sinon ~100 sprites de bâtiments). Découpage proposé :

   | Palier visuel | Bandes d'ère couvertes | Source d'art |
   |---|---|---|
   | **T1 — Primitif** | 0 primitif, 1 agricole | sur-mesure |
   | **T2 — Antique / marchand** | 2 bourg, 3 fortifié | packs |
   | **T3 — Impérial / monumental** | 4 impérial, 5 monumental | packs |
   | **T4 — Industriel / mégalopole** | 6 mégalopole | packs |
   | **T5 — Cosmique** | 7 noosphère, 8 stellaire, 9 démiurge | sur-mesure |

   Les ~10 types de bâtiments (food, store, transport, market, craft, field, port, water, mint, exchange) × 5 paliers ≈ **50 sprites de bâtiments** + sols + eau + props. Effort réaliste.

---

## Règles d'or du chantier (inchangées, elles marchent)

1. **Une phase = une branche Git = un objectif.** On ne passe à la suivante qu'une fois la précédente validée à l'écran et committée.
2. **Chaque phase a un « C'est fini quand… ».** Tant que ce n'est pas vrai visuellement, on n'avance pas.
3. **Tests Vitest verts** après chaque phase.
4. **Feature flag dès le début** : le nouveau rendu iso vit derrière un drapeau (ex. `?iso` ou un toggle debug). **L'ancienne carte continue de marcher** pendant tout le chantier — tu peux jouer normalement, on bascule seulement à la toute fin.
5. **Aucun sprite n'est requis avant la Phase 7.** Tout le système se valide en boîtes grises (greybox).
6. **Perf** : on ne redessine pas tout à chaque tick. Un bâtiment n'est retouché que quand il change (contrainte perf déjà connue du projet).

---

## PHASE 0 — Le tuyau (contrat jeu ↔ rendu)

**But :** poser la frontière propre, sans aucun visuel.

1. Branche `refonte-iso`.
2. Trancher la tech (PixiJS v8 recommandé) ; si Pixi : `npm install pixi.js`.
3. Écrire `getCityRenderModel(state)` — fonction **pure** qui renvoie le modèle de rendu : liste `{ id, kind, eraTier, gridX, gridY }`, rayon de ville, palier courant, instabilité.
4. Écrire la table **bande → palier** (10 → 5) comme fonction pure testée.

**C'est fini quand :** `getCityRenderModel` renvoie des données cohérentes (testées Vitest), encore zéro pixel à l'écran.

---

## PHASE 1 — La toile iso vide

**But :** afficher une zone de rendu pixel-perfect là où était la carte, derrière le feature flag.

1. Composant React qui monte le renderer (Pixi) dans une `<div>`, détruit proprement au démontage.
2. Réglages pixel art : `imageSmoothingEnabled = false` / scaleMode « nearest ».
3. Dessiner **une seule tuile iso losange** au centre pour prouver la projection.

**C'est fini quand :** une tuile iso nette s'affiche (ancienne carte toujours dispo sans le flag).

---

## PHASE 2 — Grille iso + caméra

**But :** se balader sur une grille vide.

1. Helpers `gridToScreen(col,row)` / `screenToGrid(x,y)` (projection iso).
2. Dessiner un damier iso N×N (tuiles de sol).
3. **Pan** (cliquer-glisser) + **zoom** par paliers entiers (pixel-perfect), bornés.

**C'est fini quand :** tu navigues sur une grille iso vide.

---

## PHASE 3 — Modèle de croissance : poser les bâtiments

**But :** que chaque bâtiment acheté apparaisse sur une case stable, et que la ville grandisse.

1. **Modèle de placement** : un mapping déterministe (seedé, stable par ville) qui assigne chaque bâtiment possédé à une case, en **s'étalant depuis le centre** quand la ville grandit. C'est ce qui remplace le placement libre actuel.
2. Lire le modèle de Phase 0 et poser **une boîte grise** par bâtiment sur sa case.
3. **Profondeur** : tri peintre (par `row` puis `col`), ancre au pied de la tuile.

**C'est fini quand :** acheter un bâtiment fait apparaître une boîte sur la bonne case ; la ville s'étend en grandissant ; les chevauchements sont corrects.

---

## PHASE 4 — Table type × palier (greybox coloré)

**But :** le cœur du concept — une case change d'apparence selon l'âge.

1. Table `spriteKey(kind, eraTier)`. En greybox = **couleur + taille + forme** par couple.
2. Bouton debug **« avancer d'un palier »** pour tester le vieillissement sans jouer des heures.

**C'est fini quand :** « avancer d'un palier » fait muter toutes les boîtes selon la table. **Le concept est visible, sans aucun art.**

---

## PHASE 5 — Direction artistique + manifeste de sprites

**But :** la liste de courses exacte. Zéro code.

1. **Figer le style** : taille de tuile de base (ex. 64×32 iso), palette, direction de lumière, niveau de détail.
2. **Manifeste** : pour chaque `kind × palier` → nom de fichier attendu, dimensions px, point d'ancrage (pied de tuile, bas-centre). + tuiles de sol par palier, eau, props.

**C'est fini quand :** liste complète des sprites avec specs exactes (≈ 50 bâtiments + sols + eau + déco).

---

## PHASE 6 — Sourcing hybride

**But :** récupérer l'art selon le manifeste.

1. **Packs (T2–T4, antique→moderne)** : Kenney.nl (CC0, idéal) en priorité pour la cohérence ; itch.io `#isometric #city` en complément. **Une seule famille d'artiste** pour ne pas mélanger les styles.
2. **Sur-mesure (T1 primitif + T5 cosmique)** : IA pixel art ou commande, **calés sur la même taille de tuile, palette et angle de lumière** que les packs choisis.
3. **Licences** vérifiées pack par pack (CC0 idéal, CC-BY = créditer, éviter GPL).
4. **Atlas** : assembler en spritesheet(s) (TexturePacker ou format atlas Pixi), noms = clés du manifeste.

**C'est fini quand :** un (ou quelques) atlas couvre le manifeste, clés alignées.

---

## PHASE 7 — Intégration sprite par sprite

**But :** remplacer les boîtes par les vrais sprites, sans rien casser.

1. Charger l'atlas (`Assets.load`).
2. Remplacer la boîte par un `Sprite`, via **la même table que la Phase 4** (juste « couleur/forme » → « clé de sprite »).
3. Régler ancre + accrochage au pixel.
4. **Un type à la fois** : tous les logements (tous paliers) → vérifier → commit → type suivant.

**C'est fini quand :** la ville s'affiche en vrais sprites iso, placement/profondeur/vieillissement identiques au greybox.

---

## PHASE 8 — Sol, eau & transitions d'âge

**But :** l'ambiance qui évolue.

1. Tuiles de **sol par palier** (terre / pavé / pierre / asphalte / cosmique), **eau** + légère anim, teinte d'ambiance par palier.
2. **Transitions** douces entre paliers (fondu du bâtiment, retinte du sol).

**C'est fini quand :** changer de palier transforme sol + bâtiments en fluide.

---

## PHASE 9 — Vie & polish

**But :** que la scène respire.

1. **Citoyens / véhicules** en sprites iso qui circulent (on réutilise la logique `agents.js`, nouveaux sprites).
2. **Lumière** : feu de camp → électrique → cosmique.
3. **Particules / rivière / petits détails.**

**C'est fini quand :** la scène est vivante à chaque palier.

---

## PHASE 10 — Tests, perf & bascule

**But :** solide, fluide, et on retire l'ancien.

1. **Tests Vitest** sur la table bande→palier et le placement (purs, déterministes).
2. **Perf** : batching, mises à jour seulement sur changement réel (pas à chaque tick).
3. **Retirer le feature flag** + l'ancien moteur de dessin, fusionner `refonte-iso`.

**C'est fini quand :** tests verts, framerate stable, ancien rendu retiré, branche fusionnée. 🎉

---

## Récapitulatif

| Phase | En une phrase | Sprites requis ? |
|---|---|---|
| 0 | Contrat jeu↔rendu (`getCityRenderModel`) + table d'ères | Non |
| 1 | Toile iso vide, pixel-perfect, derrière flag | Non |
| 2 | Grille iso + caméra pan/zoom | Non |
| 3 | Modèle de croissance : poser les boîtes | Non |
| 4 | Table type × palier (greybox) | Non |
| 5 | Style + manifeste | Non (prépa) |
| 6 | Sourcing hybride + atlas | — |
| 7 | Boîtes → vrais sprites iso | Oui |
| 8 | Sol, eau, transitions d'âge | Oui |
| 9 | Citoyens, lumière, particules | Oui |
| 10 | Tests, perf, retrait de l'ancien | Oui |

**À retenir :** les phases 0→5 ne demandent aucun art. On valide TOUT le système (croissance iso, vieillissement) en boîtes. Le passage aux sprites (Phase 7) ne change qu'une ligne de la table. Et l'ancienne carte reste jouable jusqu'au bout grâce au feature flag.
