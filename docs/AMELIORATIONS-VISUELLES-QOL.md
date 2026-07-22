# Améliorations visuelles et confort de jeu

Date : 2026-07-22.

Méthode : lecture du code réel (chaque piste a été confrontée aux fichiers et aux numéros de ligne, les affirmations fausses ont été corrigées et sont signalées dans chaque fiche), croisée avec une recherche sur le genre (idle, city builder, gestion) et sur les pratiques d'accessibilité.

61 pistes ont été retenues à l'audit. Après fusion des doublons entre axes, il reste **49 fiches** réparties en trois sections : Visuel, Jouabilité, Interface.

Trois principes ont guidé le tri :

1. Une fiche décrit le **delta** par rapport à l'existant, jamais une fonctionnalité déjà présente. Quand une brique existe déjà (fumées de cheminée, dialogue de Grand Reset, dépêche de reprise, carte « Bientôt »), la fiche le dit et se limite à ce qui manque.
2. Les propositions qui se recouvraient entre axes ont été fusionnées en gardant le meilleur chemin technique. Les identifiants d'origine sont conservés entre parenthèses.
3. Les propositions qui se contredisent ont été tranchées, avec la raison, dans la section [Arbitrages](#arbitrages).

---

## Top 10 à faire en premier

Classé par rapport impact sur effort. Les cinq premières sont des demi-journées.

| # | Piste | Effort | Impact | Pourquoi en premier |
|---|-------|--------|--------|---------------------|
| 1 | [A3 Le bâtiment survolé se détache](#a3) | S | fort | Corrige au passage un vrai bug de hit-test des merveilles et consomme une clé morte déjà écrite. |
| 2 | [B8 Pas de palier honnête et achat jusqu'au palier](#b8) | S | fort | L'affichage ment aujourd'hui dès que Ville-Monde est acquis. Bug d'abord, confort ensuite. |
| 3 | [B9 Jauges chiffrées des sceaux du Grand Reset](#b9) | S | fort | Onze murs d'inconnues deviennent onze objectifs, avec des cibles déjà calculées dans le code. |
| 4 | [B10 Badges d'attention sur les onglets](#b10) | S | fort | Supprime la ronde des onglets. Toutes les sources de comptage existent déjà. |
| 5 | [D9 Bilan de cycle non bloquant](#d9) | S | fort | Dès qu'un testament est gravé, la chute est totalement muette. Le calcul existe déjà côté dialogue. |
| 6 | [A8 Réglage Vie de la carte](#a8) | S | moyen | Garde-fou obligatoire avant toute autre couche animée de l'axe visuel. À livrer avant A1, A2, A5, A7. |
| 7 | [E9 Polices et glyphes autonomes hors ligne](#e9) | M | fort | Dans le .exe sans réseau, la typographie et quatorze glyphes tombent. C'est un défaut de distribution. |
| 8 | [A1 Fenêtres allumées la nuit](#a1) | M | fort | Le meilleur rapport ambiance sur coût du rendu, et il débloque A7 puis A10. |
| 9 | [B11 Rapport de reprise chiffré après une absence](#b11) | M | fort | Le moment de récompense le plus fort du genre est aujourd'hui muet. |
| 10 | [B2 Anatomie du multiplicateur global](#b2) | M | fort | Huit facteurs nommés sont calculés puis écrasés en un seul produit opaque. |

Juste derrière, à garder en vue : [B5 Délai avant achat et amortissement](#b5), [C12 Le Temple tourne aussi hors ligne](#c12), [D2 Le vœu du cycle](#d2), [E1 Premiers pas](#e1).

---

# Visuel

<a id="a1"></a>
### A1. Fenêtres allumées la nuit

Effort M, impact fort, axe A (vie et ambiance de la carte).

**Le joueur voit** : au crépuscule, des centaines de petits rectangles chauds s'allument par vagues sur les habitations, quartier par quartier. La ville cesse d'être une maquette éteinte. Le taux d'allumage suit la santé de la cité : une civilisation qui agonise s'éteint peu à peu, sans un seul élément d'interface.

**Inspiration** : Sunstrike Studios, qui désigne les fenêtres allumées comme l'outil d'ambiance au meilleur rapport effet sur coût en city builder isométrique. Cities Skylines de nuit.

**Où** : `src/game/map/pixelHouses.js`, `src/game/map/iso/isoRenderer.js`, `src/game/map/cityMapRuntime.js`.

**Comment** (delta, pas fonctionnalité neuve) : les fenêtres allumées **existent déjà**, mais uniquement sur les bâtiments-moteur, dont les sprites procéduraux peignent leurs propres carreaux avec `CM.litWarm` (`cityEngineSprites.js:1246`, `3162`, `3485` ; `engineSprites.js:105`, `1352`), et sur le repli procédural legacy des habitations (`buildingShapes.js:99` via `renderWorld.js:53`). En isométrique, les habitations sont des PNG passés à `drawPixelHouse` et n'ont aucune lumière : `grep litWarm` dans `isoRenderer.js` ne rend rien, et le commentaire de la ligne 1943 qui annonce « voile bleu plus fenêtres chaudes » ment. Donc :

1. Faire renvoyer par `drawPixelHouse` la boîte écran réellement dessinée `{dx, dy, dw, dh}` au lieu du booléen actuel (`pixelHouses.js:149-158`).
2. Collecter ces boîtes dans le cas `kind: 'tile'` de `drawIsoLive` (`isoRenderer.js:3514-3516`), dans un tableau par frame `CM._litBoxes` vidé en tête de `drawIsoWorld`. Passe LIVE : seul le sol est baké en isométrique, aucun bake n'est concerné.
3. Poser les rectangles chauds dans `drawIsoNight` après le voile multiply et avant les halos de lampes (`isoRenderer.js:2161`), 2 à 5 `fillRect` de 1 à 2 px en composite `lighter`, avec `CM.litWarm` tel quel (`cityMapRuntime.js:1281`), sans recréer de couleur.
4. Positions et instant d'allumage = fonctions pures de `cmHash(gx, gy)` et de `nightF`, comme AMBIENT, pour que `CM.captureFrame` reste reproductible. Seuil décalé par maison sur la rampe `nightF` (0,2 à 0,7) pour l'allumage par vagues, probabilité modulée par `CM.healthF` (`cityMapRuntime.js:1267`).
5. Cap dur à environ 400 boîtes, sortie immédiate si `CM.lodActive`, coupure par `CM.ambianceK` (voir [A8](#a8)).
6. Retirer le commentaire menteur d'`isoRenderer.js:1943`.

**Risque** : le surcoût est proportionnel au nombre de maisons visibles. Plafonner strictement et vérifier au dézoom maximal sur une mégalopole avant de valider.

---

<a id="a2"></a>
### A2. Météo en surcouche : ciel voilé et averses

Effort M, impact fort, axe A.

**Le joueur voit** : une horloge météo lente amène des passages voilés puis des averses. Il pleut en traits fins inclinés, la lumière baisse, la chaussée reflète, et surtout la rue se vide. L'averse passe, la ville se repeuple.

**Inspiration** : Frostpunk et Anno 1800, couche météo posée sur la scène existante, jamais un second jeu de sprites.

**Où** : `src/game/map/weatherMode.js` (nouveau), `src/game/map/cityMapRuntime.js`, `src/game/map/iso/isoRenderer.js`, `src/components/dialogs/OptionsDialog.jsx`.

**Comment** : rien de météo n'existe dans le rendu (aucune occurrence de `rainF`, `weather`, `snow`).

1. Module feuille `weatherMode.js` calqué sur `dayNightMode.js` (20 lignes) et `qualityMode.js` (63 lignes) : horloge à plateaux ancrée sur `Date.now`, cycle d'environ 24 min (clair, voilé, averse, éclaircie), plus un mode joueur auto, clair ou pluie, persisté en localStorage hors sauvegarde.
2. Publier `CM.rainF` (0 à 1) et `CM.windX` dans le bloc de frame de `cityMapRuntime.js`, à côté de `CM.nightF` (`1247-1252`), pour que toutes les couches lisent la même valeur.
3. Passe `drawIsoRain(now)` appelée dans `drawIsoWorld` juste après `drawIsoNight` (`isoRenderer.js:3881`) : traits de 1 px inclinés, position fonction pure de `(now, index)` sur le gabarit de `drawIsoAmbient`, densité proportionnelle à `rainF` et à la surface visible, cap dur.
4. Assombrissement par le même geste que `NIGHT_VEIL`, un `fillRect` ardoise à alpha `rainF * 0,18`, plutôt qu'un filtre canvas, pour préserver les contrastes.
5. Sol mouillé sans rebake : reflets à faible alpha sur les seules cellules de route visibles, posés **après le blit du sol baké et avant `drawIsoRiver`** (`isoRenderer.js:3874`), sinon les reflets repassent sous le fleuve. La clé du bake ne bouge pas.
6. Sous l'averse, baisser la cible d'habitants via `window.__citizenMul` et `cmRecomputeCitizenTarget` (`cityMapRuntime.js:184`), **sans toucher à `qualitySettings()`**, sinon la météo écrase le préréglage Qualité du joueur.
7. Ne pas ressusciter la brume de rivière retirée le 2026-07-13, explicitement marquée « ne pas re-proposer » (`isoRenderer.js:1562`).

**Risque** : la pluie plein écran fatigue en session longue. Elle doit rester rare, courte, et coupée par le curseur d'ambiance de [A8](#a8).

---

<a id="a5"></a>
### A5. Nuées d'oiseaux qui traversent

Effort S, impact moyen, axe A.

**Le joueur voit** : toutes les deux minutes environ, une poignée d'oiseaux traverse le ciel en diagonale, avec leur ombre qui file sur les toits et l'herbe. Au couchant ils rentrent et la nuée se densifie, en pleine nuit plus rien.

**Inspiration** : Kingdom Two Crowns et Cities Skylines, faune d'ambiance en passe aérienne.

**Où** : `src/game/map/iso/isoRenderer.js`.

**Comment** : aucune faune aérienne n'existe, les deux seules occurrences d'oiseau sont un picoreur peint dans le sprite des greniers (`cityEngineSprites.js:1063`, `1091`).

1. Copier le gabarit sans état de `drawIsoAmbient` (`isoRenderer.js:2258`) : nuée de 5 à 9 oiseaux, position fonction pure de `(now, graine de nuée)`, 2 nuées maximum à l'écran, graine dérivée de `cmHash` sur le layout. Piège documenté : toujours normaliser avec `>>> 0`.
2. Rendu : 2 px par oiseau formant un V qui bat, alternance de 2 frames sur une phase par individu, couleur sombre de la palette. Pas de rotation, pas de scale.
3. Passe aérienne sur le modèle de `drawIsoDrones` (`isoRenderer.js:1911`, appelée à `3880`), après `drawIsoLive`, avec une ombre elliptique au sol projetée par `worldToScreen` : sans ombre, l'oiseau flotte hors du monde.
4. Cadence d'une traversée toutes les 60 à 120 s, densité maximale entre `nightF` 0,1 et 0,4, zéro en pleine nuit. Coupé par `CM.lodActive` et par `CM.ambianceK`.
5. Budget de mouvement : décompter cette couche des 3 à 5 éléments animés visibles, donc baisser d'autant `AMBIENT.leaves` quand une nuée est à l'écran.

**Risque** : aucun risque de perf notable. Le seul risque est esthétique, une nuée trop dense lit comme un essaim.

---

<a id="a6"></a>
### A6. Saisons en surcouche

Effort M, impact moyen, axe A.

**Le joueur voit** : l'herbe, les fleurs et la canopée virent lentement au fil de quatre saisons. Revenir après une longue absence montre une ville qui a changé de couleur, seul marqueur de temps long dont le jeu manque. Aucun nouveau sprite.

**Inspiration** : Timberborn et Banished, saisons visibles. Sunstrike Studios, surcouche saisonnière plutôt que réassets.

**Où** : `src/game/map/iso/isoRenderer.js`, `src/game/map/cityMapRuntime.js`.

**Comment** : aucune horloge ni teinte saisonnière n'existe, `season` n'apparaît que dans des textes.

1. Horloge saisonnière lente ancrée sur `Date.now`, à côté de `cmDayNightF` (`cityMapRuntime.js:1196`), une saison valant environ 4 cycles jour et nuit. Publier `CM.season` (0 à 3) et **rien de continu**.
2. Le sol est baké : ajouter la saison à la clé du bake iso (`isoRenderer.js:3792`) et faire varier `GRASS` (`36`), `GD_FLOWERS` (`291`) et `GD_TIP` (`285`) vers 4 variantes validées à la main : printemps clair, été doré, automne rouille, hiver blanchi.
3. Correction par rapport à la proposition d'origine : `drawTreeIso` (`isoRenderer.js:2514-2524`) est le **repli procédural** (sapin triangle), pas le rendu réel. Les arbres affichés sont des sprites PNG `/pixelart/iso/tree-N.png` choisis par hash dans le cas `kind: 'tree'` de `drawIsoLive` (`isoRenderer.js:3561-3567`). La teinte saisonnière se pose donc **au blit du sprite**, par une passe multiply sur un canvas hors écran mis en cache par variante et par saison.
4. Hiver : plutôt qu'une neige animée, un voile clair posé sur les seules faces nord du bake, `isoFaceKeeps` (`isoRenderer.js:122`) donne déjà de quoi raisonner par face.
5. Ne changer la saison que par crans discrets. Chaque cran invalide le bake, et la recuisson coûte de 37 ms au zoom de jeu à plus de 100 ms au dézoom maximal.

**Risque** : toute teinte intermédiaire non validée à la main fait virer la palette au vert ou au violet. Quatre états dirigés, aucune interpolation libre.

---

<a id="a7"></a>
### A7. Fumée de cheminée triée dans la profondeur

Effort M, impact moyen, axe A. Dépend de [A1](#a1) et, pour la dérive, de [A2](#a2).

**Le joueur voit** : le soir et en hiver, une maison sur sept fume. La colonne monte, s'élargit, dérive avec le vent, et passe derrière le bâtiment situé au nord au lieu d'être collée en surcouche.

**Inspiration** : Banished et Manor Lords, la cheminée comme signal de foyer occupé.

**Où** : `src/game/map/iso/isoRenderer.js`, `src/game/map/pixelHouses.js`, `src/game/map/renderBuildings.js`.

**Comment** (delta) : les fumées **existent déjà** en nombre, mais toutes internes aux sprites de bâtiments-moteur (`cityEngineSprites.js:1237`, `2287`, `3211`, `3471` ; `engineSprites.js:707`, `841`), posées par `drawIsoEngineScene` (`isoRenderer.js:2753`, appelée à `3517`) donc **déjà triées à la profondeur du bâtiment**. Ce qui manque, c'est la fumée des **habitations** en isométrique, qui sont des PNG sans cheminée animée. La fumée d'habitation legacy (`buildingShapes.js:214`, `renderBuildings.js:315-325`) est gardée par `!usePixelHouse` et n'est jamais atteinte en isométrique : elle est morte, ne pas passer par ce chemin.

1. Nouvel item `kind: 'smoke'` poussé dans le tableau du peintre de `drawIsoLive` (`isoRenderer.js:3241-3290`), à la profondeur du bâtiment plus un epsilon, ancré en haut de la boîte publiée par [A1](#a1). Sans cette boîte, l'ancrage retombe sur le losange et la colonne part du sol.
2. Réservé aux tuiles de type `house` et `enginehome`, et à une fraction seulement (`cmHash % 7`).
3. Bouffées procédurales sans état : 3 à 4 taches de 2 px qui montent et s'élargissent sur une phase pure de `(now, graine de cellule)`, dérive latérale prise sur `CM.windX` de [A2](#a2), avec une dérive par défaut si A2 n'est pas livré.
4. Ne fumer que quand la scène le justifie : soir, nuit, hiver, ou cité en bonne santé.

**Risque** : le tri décide de tout. Une fumée dessinée après coup en couche plein écran détruit l'illusion de profondeur que le reste du rendu paie cher à construire.

---

<a id="a10"></a>
### A10. Permanence : la chute laisse des traces

Effort M, impact fort, axe A. Dépend de [A1](#a1) puis [A7](#a7).

**Le joueur voit** : un effondrement ne vide plus seulement un compteur. Les bâtiments se tassent en deux ou trois frames, des gravats restent, la suie marque le sol, une colonne de fumée s'éteint sur plusieurs minutes. Le joueur qui revient voit ce qui s'est passé sans rien lire.

**Inspiration** : Vlambeer, The Art of Screenshake, la permanence des traces comme levier majeur. Frostpunk.

**Où** : `src/game/map/iso/isoRenderer.js`, `src/game/map/cityMapRuntime.js`.

**Comment** (delta) : la dégradation n'est pas totalement absente. Le plan se régénère déjà par bande de crise (`cityMapRuntime.js:618-619`) et le pipeline **legacy** salit son bake, sa clé contenant `healthF`, `timeWear` et `frameRuined` (`cityMapRuntime.js:1333`). La clé du bake **iso** (`isoRenderer.js:3792`) ne contient que `layoutRecomputeAt`, zoom, `eraBand` et preview : ni usure ni santé. Et `grep collapseAt|timeWear|healthF` dans `isoRenderer.js` ne rend qu'une occurrence, ligne 1393, pour couper les ombres de poissons.

1. Ajouter à la clé du bake iso 3 crans **discrets** de `state.timeWear` et de `CM.healthF`, jamais la valeur continue, sinon on recuit en boucle.
2. Assombrir et craqueler la matière urbaine dans `drawUrbanDetail` (`isoRenderer.js:515`) selon ces crans : la ville se salit avant de tomber.
3. `CM.collapseAt` est déjà posé chaque frame (`cityMapRuntime.js:1289`) : l'utiliser pour un tassement de 2 à 3 frames dessinées par bâtiment, décalage vertical **entier**, jamais de scale, puis un socle de gravats.
4. Fumée résiduelle : réutiliser l'item `smoke` de [A7](#a7) avec une durée de vie longue, plus des traces de suie intégrées au prochain bake.
5. Flash par rampe de couleur (ocre le plus clair de la palette) et poussière de chantier, jamais de blanc pur ni d'étincelle. Lecture seule de l'état, aucune mutation.

**Risque** : ajouter `timeWear` à la clé de bake multiplie les recuissons si les crans sont mal choisis. Tester au profileur `__isoGroundProfile` avant de fixer les seuils.

---

<a id="a11"></a>
### A11. La nécropole des cycles morts, enfin visible

Effort L, impact moyen, axe A.

**Le joueur voit** : à l'ouest de la ville vivante s'alignent les cités des cycles précédents, en version réduite et grise, la plus récente au plus près. Paner vers l'ouest devient un voyage dans sa propre mémoire.

**Inspiration** : Dwarf Fortress, les forteresses mortes qui restent sur la carte du monde.

**Où** : `src/game/map/necropolis.js`, `src/game/map/iso/isoRenderer.js`, `src/game/map/cityMapRuntime.js`.

**Comment** : la géométrie est **déjà calculée et jamais dessinée**. `buildNecropolis` (`necropolis.js:22`, 70 lignes) est appelé une seule fois (`cityMapRuntime.js:701`) et expose `tombs`, `bboxWorld`, `eraBand`, `eraIndex` et le `record`, déterministes par seed. Aucun consommateur de rendu.

1. Nouvelle passe `drawIsoNecropolis` appelée dans `drawIsoWorld` entre le sol et `drawIsoLive`, avec culling par `visibleCellBounds`. Chaque tombe est une plaque de sol assombrie plus quelques ruines basses poussées dans le tri peintre.
2. Zéro asset : réutiliser les sprites d'habitation avec un remplacement de rampe vers le gris et une variation de matière par `eraBand` du record.
3. Étendre les bornes de `cmClampCamera` (`cityMapRuntime.js:309`, boîte X repliée sur le fleuve et la grille lignes 315-316, branche iso 324-334) vers l'ouest quand `L.necropolis.present`. Sans cela la nécropole est physiquement inatteignable au pan.
4. Hit-test et infobulle : nom de la civ morte, âge atteint, cause de la chute, lus dans `state.vestiges`.

**Risque** : élargir la boîte de clamp change le cadrage de départ et le plancher de zoom. Vérifier `cityMapCenterCamera` et le test d'invalidation de bake.

---

<a id="b7"></a>
### B7. Sparklines de tendance dans la barre de ressources

Effort M, impact moyen, axe B (lisibilité).

**Le joueur voit** : une micro courbe de trente points, sans axe ni légende, collée contre chaque débit de la Topbar. Elle répond à « ça monte ou ça descend », ce que la flèche seule ne dit pas, la flèche donnant le signe et non l'accélération.

**Inspiration** : Factorio, le joueur regarde sa courbe monter. Sparkline classique de tableau de bord.

**Où** : `src/game/core/annals.js`, `src/game/core/actions/tick.js`, `src/components/ui/Topbar.jsx`, `src/styles/components.css`.

**Comment** (delta) : ne pas écrire un module « calqué » de zéro. Le squelette existe **deux fois** : le buffer module-scope avec purge paresseuse et `SAMPLE_MIN_GAP_MS` (`annals.js:14-58`) et le rendu `svg polyline` (`CycleAnnals.jsx:119-127`). Généraliser `annals.js` et factoriser le composant de polyline plutôt que d'en produire une troisième copie.

1. Stocker `log10(débit)` en number natif et non le Decimal : la courbe reste lisible sur toute la partie et le buffer reste minuscule.
2. Appeler le push d'échantillon dans `tick.js` juste après le bloc de crédit des ressources, sous la même garde `isNotifyPaused` que `pushAnnalsSample` (`tick.js:208`), pour que la simulation hors ligne, qui joue des centaines de ticks dans la même milliseconde, n'empile qu'un point.
3. Rendre un `svg` de 60 par 16 dans la `rate-row` de chaque carte. Aucune librairie, aucun canvas, aucun bake de carte à invalider.
4. Appeler la remise à zéro aux deux endroits où `resetAnnals()` est déjà appelé : `state.js:1597` et `actions/building.js:360`.

**Risque** : cinq courbes dans la barre peuvent devenir du bruit. Les redessiner au tick et non en rAF, et les couper sous 1200 px de large, où la barre passe déjà à trois colonnes.

---

<a id="d8"></a>
### D8. Cérémonie de Grand Reset

Effort M, impact moyen, axe D.

**Le joueur voit** : l'événement le plus rare du jeu gagne une stèle de passation après le reset : sceaux réclamés, production avant et après, et la liste de ce qui survit.

**Inspiration** : Frostpunk, épilogue qui rejoue les décisions. Antimatter Dimensions, écran de prestige chiffré.

**Où** : `src/game/core/actions/building.js`, `src/App.jsx`, `src/styles/layout.css`, `src/game/core/state.js`.

**Comment** (delta) : le pitch d'origine parlait de « 1,3 s d'écran gris », c'est **faux**. `performGrandReset` (`building.js:292-375`) ouvre déjà un dialogue chiffré **avant** le reset (lignes 316-337 : sceaux réclamés, multiplicateur de production avant et après via `grandResetProductionMult`, multiplicateur de Ruines via `grandResetRuinGainMult`, mention du x4 Ragnarok), puis `setMourning(true)` et 1300 ms (340-341). Le delta réel :

1. Généraliser le mécanisme `eraBanner` d'`App.jsx` (`58-76` et `263-272`) en un petit bus `setCeremony({kind, title, lines})`, qui servira ensuite au sceau réclamé et à la merveille.
2. Afficher la stèle **après** le reset : le dialogue actuel est un écran de confirmation, il ne peut pas montrer le résultat. L'émission se fait pendant le `setMourning` et le délai de 1300 ms déjà présents, donc sans allonger la séquence.
3. Ajouter la seule donnée réellement absente : la liste de ce qui survit, dérivée de `GR_PERSISTENT_FIELDS` (`state.js:1683-1700`).
4. Invariant à respecter : aucune mutation persistée avant la fin de l'animation (`events.js:96-104`, défendu par `collapse.persistence.test.js`).

**Risque** : taxe pour le joueur qui enchaîne les Grands Resets tardifs. Bandeau passable au clic, durée raccourcie à partir du troisième.

---

<a id="d9"></a>
### D9. Bilan de cycle non bloquant

Effort S, impact fort, axe D.

**Le joueur voit** : dès qu'un testament est gravé ou que l'Édit s'applique, l'effondrement est aujourd'hui **totalement silencieux**. Un bandeau de six secondes récapitule l'an tenu, le pic, la cause de la chute, les ruines moissonnées et l'écart avec le cycle précédent.

**Inspiration** : Melvor Idle 2, journal de session. Frostpunk, récapitulatif de fin qui compare.

**Où** : `src/game/core/events.js`, `src/game/core/actions/crisis.js`, `src/components/views/CityView.jsx`, `src/styles/views-misc.css`.

**Comment** (delta) : le chemin **manuel** avec dialogue affiche déjà une stèle-bilan (`events.js:213-217` : an, âge, pic d'habitants) et `collapseCause()` est déjà calculé ligne 116. Réutiliser ce calcul, ne pas en écrire un second.

1. Dans la branche **silencieuse** de `runCollapseSequence` (`events.js:130-158`), juste après `completeCollapse`, poser `state.lastCycleReport` : objet plat avec `cycleSec`, cause, gain en string Decimal, pic de Rayonnement.
2. Correction d'une affirmation fausse de la proposition d'origine : `chronicleStats` ne stocke **que** des records et maximums (`chronicleStats.js:115-123` : `biggestRuinGain`, `longestCycleSec`). Le cycle précédent n'y est pas. Il faut un champ dédié, écrit dans `completeCollapse` (`crisis.js:329`), pour pouvoir afficher l'écart.
3. Rendu avec le patron des bannières d'héritage de `CityView` (toast centré haut, lignes 298-325) et surtout **pas un dialogue** : aucun vol de focus, l'automatisation continue. Le rapport se consomme à la fin du timer.

**Risque** : en farm hors ligne, des dizaines d'effondrements empileraient autant de rapports. N'écrire le rapport que si `isNotifyPaused()` est faux, la boucle de farm allant jusqu'à `OFFLINE_MAX_COLLAPSES` (`main.js:197`).

---

<a id="e5"></a>
### E5. États d'achat lisibles sans la couleur

Effort M, impact moyen, axe E (prise en main et accessibilité).

**Le joueur voit** : « achetable », « bientôt » et « verrouillé » se distinguent par une forme (disque plein, demi-disque, cadenas) et non plus par la seule teinte. Même traitement pour les cinq cartes de ressources de la barre haute.

**Inspiration** : Manor Lords, icônes discriminables par silhouette. Cities Skylines 2 pris en contre-exemple.

**Où** : `src/components/ui/PurchaseRow.jsx`, `src/components/ui/BuildingShop.jsx`, `src/components/views/ruinsTree/TreeNode.jsx`, `src/components/ui/Topbar.jsx`, `src/styles/purchase.css`, `src/styles/variables.css`.

**Comment** :

1. Poser un `data-state` (`affordable`, `soon`, `locked`) sur `.purchase-row` à partir de `lackingKey` déjà calculé dans `BuildingShop.jsx:180`, et rendre le pip de forme en `::before` dans `purchase.css`, sans nouvel élément JSX.
2. Introduire l'état « bientôt » côté boutique en réutilisant `--state-soon` (`variables.css:42`), déjà défini et consommé par le seul arbre des Ruines. Condition : une seule devise manquante et coût à moins d'un seuil de portée.
3. Sur `Topbar.jsx:111-132`, chaque carte reçoit une silhouette `PixelIcon` distincte en plus de sa teinte, ce qui la rend reconnaissable sous vignette de crise et en mode deuil (grayscale).
4. Toute nouvelle prop passée à `PurchaseRow` doit être ajoutée à `arePropsEqual` (`PurchaseRow.jsx:223`), sinon la rangée reste figée. C'est le piège documenté du fichier.
5. Aucun nouveau token de couleur, on consomme les trois états déjà déclarés `variables.css:41-43`.

**Risque** : le seuil « bientôt » ne doit pas basculer chaque seconde, sinon la rangée clignote. Arrondir la fraction de portée comme est arrondi `crisisLevel` dans `App.jsx:42-45`.

---

<a id="e12"></a>
### E12. Passe de contraste et mode contraste renforcé

Effort S, impact moyen, axe E.

**Le joueur voit** : les textes secondaires cessent de vivre au bas de la plage lisible, et un mode renforcé est disponible pour ceux qui en ont besoin.

**Inspiration** : Frostpunk 2 et Against the Storm, dont le reproche numéro un des joueurs porte sur la lisibilité des petits textes.

**Où** : `src/styles/variables.css`, `src/styles/base.css`, `src/game/core/uiPrefs.js` (nouveau, cf [E4](#e4)), `src/components/dialogs/OptionsDialog.jsx`.

**Comment** :

1. Mesurer les paires réellement utilisées, en priorité `--text-weak` (#5B6580) sur `--surface-app` (#0E1320) et `--state-locked` (#8A8578) sur `--surface-card`, qui passent sous le seuil de 4,5 pour du texte courant.
2. Corriger à la source dans `variables.css` : les jetons étant la source de vérité unique, une valeur suffit et se propage à toutes les feuilles.
3. Ajouter un attribut `data-contrast` sur `.app` qui, en mode renforcé, repointe `--text-weak`, `--text-mid`, `--state-locked` et `--border` vers des valeurs plus claires, sans toucher aux couleurs de marque ni aux couleurs de ressource.
4. Le réglage vit dans le même `uiPrefs.js` que l'échelle et la densité, donc un seul onglet Options et un seul mécanisme de persistance.
5. Garde-fou de non-régression : la vignette de crise et le mode deuil ne doivent pas retomber sous le seuil. Tester avec `--crisis-level` à 1.

**Risque** : éclaircir les gris peut écraser la hiérarchie où le texte faible recule. N'appliquer les valeurs claires qu'en mode renforcé, pas par défaut.

---

# Jouabilité

<a id="a4"></a>
### A4. Le bâtiment neuf se signale, la caméra y vole

Effort M, impact moyen, axe A.

**Le joueur voit** : à chaque achat, un chevron doré discret apparaît une seconde au-dessus du bâtiment qui vient de sortir de terre. S'il est hors champ, la caméra y glisse en vol amorti au lieu de sauter.

**Inspiration** : Cities Skylines, notification cliquable qui recadre. Dwarf Fortress, signets de caméra.

**Où** : `src/game/map/cityMapBridge.js`, `src/game/map/cityMapRuntime.js`, `src/game/core/actions/building.js`, `src/game/map/iso/isoRenderer.js`.

**Comment** (delta, avec une erreur d'ancrage corrigée) : le pont moteur vers carte existe (`cityMapBridge.js:21`, `setResetCameraCenterHandler`, consommé par `building.js:371` et `crisis.js:498`), mais il n'a aucun `setFocusHandler`. Erreur de la proposition d'origine : `CM.engineHomeReveal` n'est **pas** poussé par l'achat, il est **dérivé chaque frame** dans le runtime à partir de `state.buildings` (`cityMapRuntime.js:1296-1303`), et le moteur ne connaît **aucune coordonnée monde**, le layout vivant dans CM.

1. `buyBuildingCore` (`building.js:78`) ne peut donc envoyer qu'un **identifiant** (id de bâtiment, ou « dernière maison révélée »). C'est le runtime qui résout la cible en cherchant la tuile `revealIdx = engineHomeReveal - 1`, avec le même filtre qu'`isoRenderer.js:3253`.
2. Côté runtime, une cible `CM.camGoal {x, y, zoom}` et un rattrapage amorti dans `frame()` avant `cmClampCamera`, facteur `1 - exp(-dt*6)`, annulé au premier `mousedown` ou `wheel` : le joueur reprend toujours la main.
3. Par défaut **ne pas recadrer** : poser seulement une pastille de repérage, poussée comme item du tri peintre de `drawIsoLive` à la profondeur du bâtiment, durée 1200 ms. Le vol n'a lieu que si la cible est hors du cadre visible.
4. Arrondir la position écran finale à l'entier, sinon le vol amorti fait baver tout le pixel art.
5. Viser un vol court, 150 à 250 ms : la recuisson du sol est coalescée sur une accalmie de mouvement réel de `ISO_SETTLE_MS = 110 ms` (`isoRenderer.js:3774`, `3812-3815`).

**Risque** : un recadrage non sollicité est vite ressenti comme une perte de contrôle. Vol conditionnel au hors-champ, et désactivable.

---

<a id="a9"></a>
### A9. Une caméra qui a du poids

Effort S, impact moyen, axe A.

**Le joueur voit** : le zoom molette glisse au lieu de sauter, le pan a une inertie courte, les flèches et les touches plus et moins pilotent la vue, et le pincement à deux doigts fonctionne.

**Inspiration** : Anno 1800 et les caméras RTS modernes, amortissement critique et zoom ancré sur le curseur.

**Où** : `src/game/map/cityMapRuntime.js`, `src/App.jsx`.

**Comment** : `bindCityMapInput` (`cityMapRuntime.js:505`) n'écoute que `wheel` (511-522), `mousemove` (524, 538), `mousedown` (534), `mouseup` (551) et `click` (557). Aucun `pointerdown`, aucun pinch, aucun `camGoal`.

1. Ajouter `pointerdown`, `pointermove`, `pointerup` et le pincement à deux pointeurs (distance vers `cam.zoom`), en réutilisant `screenDeltaToPan` pour le pan.
2. Zoom molette : remplacer la multiplication instantanée (ligne 518) par une cible `CM.zoomGoal` rattrapée dans `frame()`. Le recalage before et after qui garde le point sous le curseur (516-521) doit être refait à **chaque frame d'interpolation**, pas seulement à l'événement, sinon le point dérive.
3. Raccourcis clavier dans `handleKeyDown` d'`App.jsx` (84-117), avec la même garde champ de saisie ou dialog ouvert. **Conflits à connaître** : Échap est déjà pris (`App.jsx:85-91`, ouvre les Options) et E, M, S, I sont pris par l'achat de masse (`App.jsx:100-109`). Restent les flèches, plus et moins, et une touche de recentrage libre (C ou Origine).
4. Le pan clavier doit passer par `screenDeltaToPan` comme le drag (`cityMapRuntime.js:545`), sinon il ne suivra pas les diagonales isométriques.
5. Arrondir la sortie du pan à l'entier écran, sinon le pixel art tremble en mouvement. Amortissement inférieur ou égal à 250 ms pour ne pas repousser le retour du sol net (`ISO_SETTLE_MS = 110 ms`).

**Risque** : un amortissement trop long donne une caméra molle et retarde la recuisson. Rester court.

---

<a id="b6"></a>
### B6. Gain relatif par achat

Effort M, impact fort, axe B.

**Le joueur voit** : comparer 4,2e12 et 8,7e11 est impossible à l'œil, « plus 31 pour cent » se lit instantanément. Chaque rangée affiche ce que le lot ajoute en pourcentage du débit courant, et la boutique peut se trier par ce gain.

**Inspiration** : CookieMonster, indice de rentabilité coloré. Weber-Fechner, récompenser sur un seuil relatif et jamais absolu.

**Où** : `src/components/ui/BuildingShop.jsx`, `src/components/ui/PurchaseRow.jsx`, `src/game/core/mechanics/production/buildingOutput.js`, `src/styles/purchase.css`.

**Comment** :

1. Mesurer le gain **marginal** du lot : différence entre `buildingOutputMultiplier(b, count + amount)` et `(b, count)`, jamais la production totale de la ligne, sinon on surestime énormément les bâtiments déjà nombreux.
2. Précision importante sur le dénominateur : `buildingProductionSegments` (`BuildingShop.jsx:23-29`) part de `outputCount = max(1, count)` (`174`) et pondère par un `globalMult` **arrondi à 4 chiffres significatifs** (`95`, choix de mémoïsation délibéré). Le gain relatif doit donc se calculer sur les sorties de **base** divisées par `rates()`, pas sur ces segments d'affichage, sinon on mélange deux arrondis.
3. Afficher un chip discret dans `pr-footer` avec des crans de couleur pris dans la palette existante (`--state-affordable`, `--state-soon`), sans glow, la règle du projet réservant le glow au palier critique.
4. Ajouter un tri optionnel dans `categoryData` (`BuildingShop.jsx:101-110`, aujourd'hui figé sur `buildingDisplayOrder`) : un simple état local, la boutique restant mémoïsée sans props.
5. Désactivable dans les Options, groupe Interface.

**Risque** : un bâtiment à effet indirect (routes, infra) a un gain relatif nul dans sa ressource propre alors qu'il booste tout. Lui afficher le gain sur le multiplicateur global plutôt qu'un zéro trompeur.

---

<a id="b8"></a>
### B8. Pas de palier honnête et achat jusqu'au palier

Effort S, impact fort, axe B. Fusion de B8, C4 et D5, qui décrivaient la même chose.

**Le joueur voit** : la barre de progression cesse de mentir dès que le capstone Ville-Monde fait tomber le pas de 25 à 20, et un mode Palier achète exactement la quantité qui franchit le prochain seuil, ni plus ni moins.

**Inspiration** : AdVenture Capitalist et Realm Grinder, paliers par quantité. Retours itch.io : désactiver le bouton plutôt que se rabattre sur un lot partiel.

**Où** : `src/components/ui/PurchaseRow.jsx`, `src/components/ui/BuyToolbar.jsx`, `src/game/core/mechanics/cost.js`, `src/game/core/actions/building.js`, `src/game/core/actions/utils.js`, `src/game/core/state.js`.

**Comment** :

1. Correction immédiate, c'est un bug : remplacer les trois 25 en dur de `PurchaseRow.jsx:67-69` (`inStep`, `nextIn`, `stepPct`) et du tooltip ligne 176 par `milestoneStepSize()` (`buildingOutput.js:16`), déjà consommée par l'achat (`building.js:95`). Même correction au seuil de `chronicleBuilding` (`actions/utils.js:62`, `amount >= 25 || newCount % 25 === 0`).
2. Ajouter une entrée `{label: 'palier', value: 'step'}` au tableau `modes` de `BuyToolbar.jsx:15`. La quantité dépend du bâtiment, donc `buyAmount` ne peut pas porter un entier : sentinelle `'step'` résolue par rangée, exactement comme `'max'` l'est déjà.
3. Résolution : `amount = step - (count % step)`, en passant par **`amountOverride`** dans `buyBuildingCore`, sinon la résolution repasse par le clamp et le parse numérique de `building.js:86` et retombe à 1.
4. Étendre la liste blanche de `buyAmount` à l'hydratation (`state.js:1410`, aujourd'hui `'max'` ou entier 1 à 500), sinon une sauvegarde rechargée retombe silencieusement sur x1. Mettre aussi à jour `resetTemporaryRunState` (`state.js:1565`).
5. Règle de refus : si le lot n'est pas finançable, le bouton se **désactive** en annonçant ce qui manque, il ne se rabat pas sur ce qui est payable, perçu comme un vol de ressources.
6. Faire descendre `step` et `stepAffordable` en props de `PurchaseRow` **et** les ajouter à `arePropsEqual` (`223`), sans quoi la rangée reste figée silencieusement.
7. Au passage, remonter la borne 500 de `maxBuyAmount` et `buildingBatchCost` en constante nommée dans `balance.js`, voir [C5](#c5).

**Risque** : oubli dans `arePropsEqual`, qui gèle l'affichage sans erreur. Ajouter un test qui vérifie que le pas affiché suit `milestoneStepSize()` quand le capstone est acquis.

---

<a id="c5"></a>
### C5. Un Max qui achète vraiment tout

Effort S, impact moyen, axe C (confort idle).

**Le joueur voit** : le mode Max, vendu par une amélioration à 5 Faveur, cesse d'être plafonné à 500 unités par achat. En milieu de partie, un Max sur un bâtiment bon marché n'oblige plus à cliquer dix fois.

**Inspiration** : Cookie Clicker et Exponential Idle, Buy All réellement illimité.

**Où** : `src/game/core/mechanics/cost.js`, `src/game/core/actions/building.js`, `src/game/core/actions/utils.js`, `src/game/map/cityMapRuntime.js`.

**Comment** :

1. Dans `maxBuyAmount` (`cost.js:87-95`), remplacer la borne fixe `hi = 500` (ligne 88) par une sonde exponentielle, doubler `hi` tant que `canPayCost` passe puis dichotomie. Les coûts croissant géométriquement, la sonde converge en une dizaine d'itérations.
2. Relever le clamp de `buildingBatchCost` (`cost.js:99`) et son miroir de `building.js:86` vers une borne de sécurité très haute, nommée dans `balance.js`.
3. `geomSum` bascule déjà en Decimal quand le float déborde (`cost.js:106-112`), rien à changer côté arithmétique. Noter que la sonde coûte donc des opérations Decimal à chaque doublement.
4. `chronicleBuilding` (`actions/utils.js:62`) teste `amount >= 25` avec un 25 en dur : le passer à `milestoneStepSize()` en même temps que [B8](#b8), et vérifier qu'un lot de 40 000 ne produit qu'une ligne, pas une par palier.
5. Ajouter un test à côté d'`economy.golden.test.js`.

**Risque** : la carte révèle les maisons une par une via `engineHomeReveal`. Un lot énorme peut saturer la file de révélation, à borner côté `cityMapRuntime.js`.

---

<a id="c6"></a>
### C6. Automates avec réserve, débit et catégorie Savoir

Effort M, impact fort, axe C.

**Le joueur voit** : l'auto-achat d'Héphaïstos cesse d'être en tout ou rien. Une réserve exprimée en pourcentage de la ressource, un débit réglable et l'ajout du Savoir le rendent réellement activable, au lieu d'être laissé éteint parce qu'il sabote les autres branches.

**Inspiration** : Trimps, AutoStructure avec limite de quantité ou achat jusqu'à un pourcentage des ressources. Antimatter Dimensions, intervalle d'autobuyer réglable.

**Où** : `src/game/core/actions/automation.js`, `src/game/core/state.js`, `src/components/dialogs/OptionsDialog.jsx`, `src/game/core/__tests__/state.hydration.test.js`.

**Comment** :

1. Étendre `defaultAutomateRules` (`state.js:76-80`, aujourd'hui city et infra seulement) d'une règle `knowledge`, plus deux champs par règle : `reservePct` (0 à 90) et `perTick` (1 à 10).
2. Dans `checkAutomateRules` (`automation.js:125-165`), après le tri par coût, refuser l'achat si la dépense ferait passer la devise sous `reservePct` de son stock courant, et boucler `perTick` fois.
3. **Correction du risque annoncé, qui était inversé** : `normalizeRuleList` (`state.js:919-933`) fait `{...fallback, enabled}` puis ne recopie de la sauvegarde que `threshold`. Les défauts sont donc injectés automatiquement pour tout nouveau champ, aucune save ne reviendra avec `reservePct` undefined. Le vrai problème est l'inverse : les valeurs réglées par le joueur seraient **écrasées par le défaut à chaque rechargement**. Le travail consiste donc à étendre `normalizeRuleList` à une liste de champs numériques normalisés, avec bornes par champ.
4. Câbler les curseurs dans l'onglet Automates d'`OptionsDialog` (`200-208`), qui a déjà le gabarit seuil plus interrupteur.
5. Aucun test ne couvre l'automate de bâtiments aujourd'hui. Créer un test dédié à côté de `state.hydration.test.js` pour la persistance des nouveaux champs.

**Risque** : `perTick` multiplie les achats par tick donc aussi le coût CPU de `buildingBatchCost` pendant le farm hors ligne. Borner bas et mesurer.

---

<a id="c7"></a>
### C7. La clepsydre : temps stocké dépensable après le plafond

Effort M, impact moyen, axe C et D. Fusion de C7 et D4.

**Le joueur voit** : au-dessus du plafond d'absence, le temps n'est plus jeté. Il se verse dans une clepsydre visible que le joueur vide quand il le décide, juste après un Grand Reset ou avant un palier.

**Inspiration** : Idle Wizard, Time Warp qui rejoue le calcul hors ligne avec exclusions annoncées. Kittens Game, Time Skip.

**Où** : `src/game/core/main.js`, `src/game/core/balance.js`, `src/game/core/state.js`, `src/components/ui/CityStatusPanel.jsx`, `src/game/data/upgrades.js`.

**Comment** : aujourd'hui le surplus est jeté par le clamp de `main.js:281`, cap défini `balance.js:851` (`IDLE_BASE_CAP_SECONDS`) et paliers ligne 854.

1. Verser l'excédent dans `state.storedSeconds` (number simple), borné par une constante `CLEPSYDRE_CAP` posée dans `balance.js` à côté d'`IDLE_BASE_CAP_SECONDS`. Ajouter le champ à `defaultState` **et** le normaliser dans `hydrateState`, comme `nextBoonAt` (`state.js:1324`), sinon une save ancienne ou trafiquée donne un versement aberrant. Décider explicitement s'il figure ou non dans `GR_PERSISTENT_FIELDS` (`state.js:1683`).
2. **Arbitrage sur la mécanique de dépense.** La proposition C7 voulait K appels supplémentaires à `tick(1)` par seconde réelle : cela **diverge**, parce qu'une grande partie du jeu lit l'horloge murale et non le `dt` du tick (`cycleStartedAt` et l'âge de cycle, l'auto-effondrement sur trigger temps `main.js:338`, les cooldowns du Temple `templeAutomation.js:75-88`, le délai de grâce de crise `main.js:332-333`). Sans horloge virtuelle l'accéléré multiplie la production mais pas l'âge ni les cadences. Retenu : **réutiliser le chemin de `simulateAwayCrises`** (boucle par pas sous horloge virtuelle, monkeypatch `Date.now` et `finally`, `main.js:178-265`), avec `notify` non pausé puisque le joueur regarde.
3. La proposition D4 voulait réutiliser `creditSpan` « tel quel » : ce n'est pas possible, c'est une closure locale définie **dans** `simulateAwayCrises` (`main.js:230-251`). Il faut l'extraire en fonction de module, avec le split de la fenêtre des Braisiers de Prométhée (`main.js:244-250`), avant que `spendStoredTime` puisse s'en servir.
4. `spendStoredTime(seconds)` refuse si `gamePaused`, `collapseInProgress` ou `crisisLimitAnnounced`, puis `save()`.
5. Jauge et bouton Verser dans `CityStatusPanel`, avec les exclusions écrites sur le bouton, sinon le joueur lit un bug. Un nœud de l'arbre des Ruines augmente `CLEPSYDRE_CAP`.

**Risque** : cumul avec une Bénédiction de production qui donnerait un pic hors courbe. Borner à un versement par cycle, ou refuser pendant une fenêtre de bonus actif. Accélérer accélère aussi la Rupture, l'Usure et les cadences du Temple : à tester contre la bascule d'économie du Temple avant de livrer, et à interdire pendant une crise narrative ouverte.

---

<a id="c8"></a>
### C8. File d'achats planifiée

Effort L, impact moyen, axe C.

**Le joueur voit** : épingler une cible met le jeu au travail. Il achète dès que c'est finançable, dans l'ordre choisi, et la barre montre la cible en cours avec son délai. La décision reste au joueur, seule la surveillance disparaît.

**Inspiration** : Anno 1800, blueprints et stamps qui séparent la décision de la dépense. NGU Idle, loadouts d'automatisation.

**Où** : `src/game/core/state.js`, `src/game/core/actions/building.js`, `src/game/core/actions/tick.js`, `src/components/ui/PurchaseRow.jsx`, `src/components/ui/BuildingShop.jsx`.

**Comment** :

1. `state.buyQueue`, tableau de `{buildingId, amount}` d'au plus 5 entrées, avec `normalizeRuleList` comme modèle de normalizer et une remise à zéro dans `resetTemporaryRunState` (`state.js:1562`) : une file survivant à un effondrement viserait des bâtiments détruits.
2. Résolution dans `tick()` juste après le bloc d'automatisation (`tick.js:356`), une entrée par tick, via `buyBuildingCore` avec `silent: true`. Aucun changement de signature n'est nécessaire, `buyBuildingCore` accepte déjà `{amount, silent}` (`building.js:78`).
3. Une épingle sur chaque rangée (`pr-footer`) et la liste ordonnée en tête de la boutique, avec le délai calculé par le même utilitaire que [B5](#b5).
4. La garde anti-Ruines existe déjà et est réutilisable telle quelle : `BUY_ALL_CURRENCIES` (`building.js:164`) plus le filtre `buyableInMass` (`169-179`).
5. Le verrou de Babel est déjà appliqué dans `buyBuildingCore` (`building.js:81`). La file n'a pas à le rejouer, seulement à ne pas boucler à vide sur un refus.

**Risque** : interactions à cadrer avec Sisyphe (le rocher retombe à chaque achat) et avec l'auto-achat qui pourrait acheter par dessous.

---

<a id="c12"></a>
### C12. Le Temple et les aubaines tournent aussi pendant l'absence

Effort M, impact moyen, axe C.

**Le joueur voit** : les cadrans d'automatisation du Temple qu'il a payés servent enfin pendant la nuit, au lieu de ne fonctionner qu'en session, ce qui est l'inverse de la promesse.

**Inspiration** : Melvor Idle, la progression hors ligne rejoue l'activité configurée. Idle Wizard, auto-expéditions accumulées jusqu'à un plafond.

**Où** : `src/game/core/actions/templeAutomation.js`, `src/game/core/actions/tick.js`, `src/game/core/main.js`, `src/game/core/balance.js`, `src/game/core/__tests__/templeBascule.test.js`.

**Comment** : le commentaire de `templeAutomation.js:16-18` décrit exactement ce hook (« ONLINE pour l'instant, un crédit offline serait un hook dédié »).

1. Deux gardes distinctes plutôt qu'une. `isNotifyPaused` sert aujourd'hui à la fois à couper le bruit visuel et à couper la mécanique. Introduire un drapeau `isOfflineSim` et laisser passer la mécanique tout en supprimant les floats et la Chronique, sur le modèle de ce que fait déjà `simulateAwayCrises` pour l'historique (`main.js:256`). L'early return de `templeAutomation.js:72` devient une garde d'affichage, et les gardes de `tick.js` (172, 208, 343) se dédoublent.
2. Correction de fait : il y a **cinq** automatisations et non quatre (tronc, osselets, Icare, gratteux, vingt-et-un, `state.js:93-99`), et le tronc est déjà offline-safe par construction, calculé à la volée, donc hors périmètre.
3. Le pas hors ligne étant de 10 s (`OFFLINE_STEP_SECONDS`), les cooldowns par jeu sont naturellement respectés puisqu'ils sont exprimés en ms d'horloge virtuelle.
4. Plafonner le nombre de parties rejouées par absence **et par jeu**, pas globalement, sinon le premier jeu de la liste consomme tout le quota. Constante dans `balance.js` à côté d'`OFFLINE_MAX_COLLAPSES` (`860`).

**Risque** : l'économie de Faveur est en régime rtp supérieur à 1 assumé et bornée par la cadence. Rejouer des milliers de parties hors ligne rouvre l'imprimante. Le plafond n'est pas négociable, et le test bloquant à repasser est `templeBascule.test.js`.

---

<a id="d2"></a>
### D2. Le vœu du cycle

Effort M, impact fort, axe D.

**Le joueur voit** : à chaque nouveau cycle, la cité prête un vœu choisi parmi trois : tenir vingt minutes sans crise de palier haut, atteindre un âge donné, ériger trois merveilles. Tenu, il majore la moisson de Ruines de la chute. Raté, il ne coûte rien. C'est le seul objectif court terme volontaire du jeu.

**Inspiration** : Against the Storm, ordres de clairière. Realm Grinder, défis de palier à récompense unique.

**Où** : `src/game/data/vows.js` (nouveau), `src/game/core/actions/crisis.js`, `src/game/core/events.js`, `src/game/core/main.js`, `src/game/core/state.js`, `src/components/ui/CityStatusPanel.jsx`.

**Comment** :

1. `vows.js` : 8 à 10 entrées `{id, label, check(), progress(), ruinMult}` sur le modèle déclaratif de `GRAND_RESET_MILESTONES` (`grandResetMilestones.js:60`).
2. Tirer 3 candidats quand le cycle repart, en fin de `completeCollapse` (`crisis.js:319`), et poser `state.cycleVow = {id, offered, done}`, champ plat remis à zéro dans `resetTemporaryRunState` (`state.js:1562`, appelé `crisis.js:446`) et donc hors `GR_PERSISTENT_FIELDS`.
3. Le check tourne au tick sous la garde `isNotifyPaused` pour ne pas se déclencher en farm hors ligne, et latche `done`.
4. **Correction importante** : `epitaphRuinMultiplier` n'est pas appliqué en un seul endroit mais en **trois** (`events.js:148` chemin silencieux, `events.js:233` chemin dialogue, `main.js:218` farm hors ligne). Le `ruinMult` du vœu doit être appliqué aux trois sites, ou mieux, dans un helper unique appelé par les trois.
5. Si le joueur est absent (`auto_collapse`), reconduire le vœu précédent, exactement comme la dernière volonté. Progression affichée en une ligne dans `CityStatusPanel`.

**Risque** : recouvrement avec les Mythes, qui sont déjà des cycles à règles altérées (`myths.js:312`, 14 pactes avec règle, objectif et héritage). Borner les vœux à 5 à 20 minutes et filtrer ceux dont l'objectif recoupe le pacte actif, sinon c'est un doublon de système.

---

<a id="d10"></a>
### D10. Cadence des aubaines et jauge d'anticipation

Effort S, impact moyen, axe D.

**Le joueur voit** : une petite jauge qui se remplit donne une raison concrète de rester devant l'écran, au lieu d'une aubaine qui peut se faire attendre trente minutes sans aucun signe.

**Inspiration** : Cookie Clicker, le golden cookie attendu et guetté.

**Où** : `src/game/core/balance.js`, `src/game/core/actions/tick.js`, `src/components/ui/CityStatusPanel.jsx`.

**Comment** :

1. `BOON_INTERVAL_MIN_SEC` et `MAX_SEC` (`balance.js:971-974`, aujourd'hui 300 et 1800) passent à une fenêtre plus courte, et `scheduleBoonDelay` (`tick.js:410-414`) tire dans une fenêtre resserrée quand `isNotifyPaused()` est faux, large sinon : le joueur présent est récompensé plus souvent sans doper le farm.
2. Exposer la progression via un sélecteur `useGameState` qui rend un **pourcentage arrondi au pas de 5**, sinon la jauge force un re-render à chaque tick. Jauge fine sous les stats de `CityStatusPanel`, type d'aubaine non révélé.
3. Ne toucher à aucun gain : ils sont déjà indexés sur des secondes de production, donc justes à toute échelle.
4. Point manqué par la proposition d'origine : `state.nextBoonAt` est borné à l'hydratation par `BOON_INTERVAL_MAX_SEC` (`state.js:1324`, testé par `auditExpressLot.test.js:66-72`). Baisser `MAX_SEC` change donc aussi le clamp des anciennes sauvegardes, ce test est à vérifier.
5. La pondération par type recommandée en garde-fou demande de modifier le tirage de `fireBoon` (`tick.js:420`, uniforme dans `BOONS`), pas seulement l'intervalle.

**Risque** : banaliser l'aubaine. Resserrer seulement les types modestes et garder les gros tirages rares, en pondérant le tirage plutôt qu'en réduisant uniformément l'intervalle.

---

<a id="d11"></a>
### D11. Édit d'effondrement à seuil dynamique

Effort M, impact moyen, axe D.

**Le joueur voit** : un quatrième déclencheur pour l'Édit, effondrer quand la moisson vaut N fois celle du cycle précédent. Le seuil se recalibre tout seul après chaque Grand Reset, contrairement aux seuils absolus qui deviennent faux dès que la puissance change d'ordre de grandeur.

**Inspiration** : Antimatter Dimensions, autobuyer de Big Crunch en mode X fois le dernier crunch.

**Où** : `src/game/core/main.js`, `src/game/core/state.js`, `src/components/ui/CrisisDoctrinePanel.jsx`, `src/game/core/actions/crisis.js`, `src/game/core/mechanics/prestige.js`.

**Comment** :

1. Ajouter un trigger `ratio` à côté de `rupture100`, `usure` et `temps` dans `checkAutoCollapse` (`main.js:322-371`), avec un champ `ratioMult` par défaut à 2.
2. **Manque critique de la proposition d'origine** : le déclencheur est **dupliqué dans la simulation hors ligne** (`main.js:205-207`, même switch usure, temps, rupture100). Sans y ajouter `ratio`, le farm hors ligne ignorerait le nouveau mode et l'Édit ne déclencherait jamais en absence.
3. Stocker `state.lastCollapseGain` en string Decimal, écrit dans `completeCollapse` au même endroit que `recordCollapse`. La comparaison se fait avec `ruinGain(true)` (`prestige.js:122`), la fonction de projection déjà utilisée par l'autel de la chute, donc aucune arithmétique nouvelle.
4. Normaliser `ratioMult` dans `normalizeCrisisDoctrine` (`state.js:827-845`) sinon un ancien save le perd silencieusement. Défaut à `state.js:523`, UI à `CrisisDoctrinePanel.jsx:142-143`.
5. Garder `projected = !crisisOpen()`, comme les deux autres déclencheurs non terminaux.

**Risque** : boucle d'effondrements très rapprochés si le ratio est bas. Un plancher existe déjà en partie (`patienceAt` et `shortCycleMod`, `prestige.js:59-74` et `182`, qui pénalisent les cycles courts) : vérifier qu'un plancher supplémentaire n'empile pas deux pénalités.

---

<a id="d12"></a>
### D12. Épreuves mineures d'avant-Mythes (périmètre réduit)

Effort L ramené à M, impact moyen, axe D. **Proposition ramenée à un périmètre défendable, ou à abandonner.**

**Le joueur voit** : trois ou quatre contraintes courtes disponibles avant le premier Grand Reset, avec une récompense modeste, pour donner un défi au début de partie.

**Inspiration** : Antimatter Dimensions, challenges. Realm Grinder, défis de faction.

**Où** : `src/game/data/trials.js` (nouveau), `src/game/core/state.js`, `src/game/core/actions/building.js`, `src/game/core/actions/tick.js`, `src/components/views/PrestigeView.jsx`, `src/game/data/myths.js`.

**Comment** (arbitrage) : **ne pas écrire un second système de défis.** Les Mythes en sont déjà un, complet : 14 entrées avec règle altérée, objectif et récompense permanente, armées volontairement, branchées exactement sur les mêmes points d'accroche que ceux proposés (`myths.js:312` et suivants, `building.js:81` pour Babel qui bloque déjà une catégorie, `building.js:119-122` pour Prométhée, `timeWearRate`). Le seul delta défendable : les Mythes sont verrouillés jusqu'au premier Grand Reset (`App.jsx:140`, `isMythsUnlocked = grandResetCount >= 1`), donc le début de partie n'a aucun défi.

1. Périmètre retenu : 3 à 4 contraintes courtes, récompense modeste et **non permanente**, désactivées dès qu'un Mythe est disponible.
2. `state.activeTrial` reste plat et temporaire, `state.trialsDone` est une map à ajouter à `GR_PERSISTENT_FIELDS`. Note : l'argument avancé selon lequel `grandReset.test.js` verrait la map disparaître est faux, ce test (lignes 54-70) n'impose `GR_PERSISTENT_FIELDS` que pour les champs nommés `*Heritage`.
3. Les règles se branchent sur des gardes existantes, pas sur du code neuf : refus de catégorie dans `buyBuildingCore`, multiplicateur dans `timeWearRate`, blocage dans `runCrisisAction`.
4. Un test par règle est obligatoire : une règle qui n'est lue par aucune mécanique est parfaitement invisible en jeu.

**Risque** : si ce périmètre réduit n'est pas retenu, **abandonner la proposition** plutôt que de livrer un doublon des pactes.

---

<a id="e1"></a>
### E1. Premiers pas : un fil d'objectifs qui se coche tout seul

Effort M, impact fort, axe E. Non vérifié contre le code, à confirmer avant chiffrage.

**Le joueur voit** : trois intentions courtes dans le rail gauche de la Cité, « Bâtis ton premier grenier », « Laisse la Rupture monter à 25 pour cent », « Provoque ton premier effondrement ». Chacune se coche seule, avec un petit trait d'or. Le fil disparaît définitivement une fois la dernière étape franchie. Aucune modale, aucune flèche qui bloque le clic.

**Inspiration** : Against the Storm, objectifs de clairière lisibles en permanence sans tutoriel forcé. Frostpunk, tâches de survie qui structurent la première heure.

**Où** : `src/game/core/onboarding.js` (nouveau), `src/components/ui/FirstStepsPanel.jsx` (nouveau), `src/components/views/CityView.jsx`, `src/game/core/state.js`, `src/styles/views-city-hud.css`.

**Comment** :

1. `onboarding.js` expose une table déclarative `{id, cond(state), titre, indice}` évaluée dans un sélecteur `useGameState` pur. La condition ne fait que lire, sinon `shallowEqual` boucle.
2. Le panneau ne montre que les 3 premières étapes non cochées, se monte dans le bloc `city-aux` de `CityView.jsx:458` à côté du `hud-dock`, replié par `useCollapsiblePanel("steps")`.
3. L'état coché vit dans `state.onboarding`, objet plein des `defaultState` et jamais null, comme `templeAuto`, et inscrit dans `GR_PERSISTENT_FIELDS` : un Grand Reset ne refait pas le tutoriel.
4. Le cochage se fait par comparaison étape par étape au rendu, la mutation passe par une fonction `markStep()` de `state.js` qui notifie une seule fois, pas à chaque frame.
5. Toutes les étapes cochées, le composant retourne null et n'est plus jamais monté.

**Risque** : rejouer le didacticiel après un effondrement. Les conditions doivent porter sur des compteurs à vie (cycles, achats cumulés), pas sur l'état du cycle courant. Voir aussi l'arbitrage avec [E11](#e11).

---

# Interface

<a id="a3"></a>
### A3. Le bâtiment survolé se détache

Effort S, impact fort, axe A.

**Le joueur voit** : passer la souris sur un bâtiment le cerne d'un liseré d'or et marque sa cellule au sol. On sait enfin ce que l'infobulle décrit. Et les merveilles redeviennent survolables là où elles sont dessinées.

**Inspiration** : Frostpunk, contour binaire de couverture au placement. Cities Skylines, surbrillance du bâtiment ciblé.

**Où** : `src/game/map/cityMapRuntime.js`, `src/game/map/iso/isoRenderer.js`.

**Comment** (delta) : l'infobulle et le hit-test existent déjà (`cityMapHitTest:400`, `cityMapShowTooltip:455`). Ce qui manque :

1. `CM.hover` est écrit **deux fois** (`cityMapRuntime.js:459` et `462`) et relu **nulle part** : clé morte. Y ajouter la clé de cellule et la tuile touchée, puis la consommer dans `drawIsoLive`.
2. **Bug à traiter à part** : le hit-test des merveilles utilise encore la projection planaire legacy (`cityMapRuntime.js:434-435`) alors que tout le reste du hit-test passe par `cityMapScreenFromWorld` (`411`, `418`, `489`). La zone survolable est donc décalée de la position dessinée. C'est un bug, il ne devrait pas être empaqueté dans une proposition cosmétique : le corriger seul, d'abord.
3. Liseré : re-blit du sprite décalé de 1 px dans les 4 directions en composite `source-atop` avec l'or de la palette, puis sprite normal par dessus. Aucun scale, aucun glow additif.
4. Marquer la cellule visée par un trait fin sur le losange, `diamondPath` est déjà écrit (`isoRenderer.js:225`).
5. Hit-test par silhouette (tester d'abord les boîtes écran, du plus proche au plus lointain, et ne retomber sur la cellule de sol qu'en dernier recours) : dépend des boîtes publiées par [A1](#a1). À ordonnancer après, ou à retirer du lot.

**Risque** : le liseré doit rester à 1 px et intra-palette, sinon il lit comme une sélection de jeu de stratégie et sort du registre sobre.

---

<a id="a8"></a>
### A8. Réglage Vie de la carte, séparé de la qualité

Effort S, impact moyen, axe A. **À livrer en premier de l'axe visuel.**

**Le joueur voit** : un cran dans les Options, ambiance pleine, sobre ou aucune. Il coupe tout ce qui bouge sans être du jeu (particules, fontaine, pluie, oiseaux, fumée) sans dégrader la résolution. Un joueur sensible au mouvement, ou qui laisse tourner le jeu en fond, n'a plus à choisir entre confort et image nette.

**Inspiration** : Halo Infinite, curseur d'intensité 0 à 100 pour les effets de caméra. Directive d'accessibilité Xbox 117.

**Où** : `src/game/map/ambianceMode.js` (nouveau), `src/game/map/iso/isoRenderer.js`, `src/components/dialogs/OptionsDialog.jsx`, `src/game/map/cityMapRuntime.js`.

**Comment** : aujourd'hui seuls des interrupteurs DEV existent (`window.__ambient` `isoRenderer.js:2223`, `window.__fountainAnim` `1792`) et la seule coupe joueur est indirecte via `CM.lodActive` (`cityMapRuntime.js:1273`), piloté par le zoom et la Qualité.

1. Module feuille `ambianceMode.js` copié sur `dayNightMode.js` (20 lignes) et `qualityMode.js` (63 lignes) : 3 crans persistés en localStorage, hors sauvegarde, donc survivant au Grand Reset et absents de l'export.
2. Résoudre en un multiplicateur unique `CM.ambianceK` publié une fois par frame, lu par `AMBIENT` (`isoRenderer.js:2221`), `FOUNTAIN_TUNE` (`1790`), la pluie de [A2](#a2), les oiseaux de [A5](#a5) et la fumée de [A7](#a7). Un seul point de coupe pour tout ce qui bouge sans porter d'information.
3. Ajouter la ligne dans le groupe Affichage d'`OptionsDialog.jsx`, juste après Qualité graphique (`315-343`), en reprenant exactement `handleQualityChange` (`67-77`) pour la persistance et l'application à chaud.
4. Insister dans le libellé sur la séparation : la qualité sert la machine, l'ambiance sert le confort. Les confondre force un joueur sensible au mouvement à jouer en mode dégradé.

**Risque** : aucun risque technique. Le risque est de ne pas le livrer : c'est le garde-fou qui rend acceptables A1, A2, A5, A7 et A10.

---

<a id="a12"></a>
### A12. Mode contemplation

Effort M, impact moyen, axe A.

**Le joueur voit** : une touche efface toute l'interface. Il ne reste que la ville, à l'heure qu'il est. Et un bouton pour en garder une image.

**Inspiration** : modes photo des city builders récents (Cities Skylines 2, Manor Lords).

**Où** : `src/components/views/CityView.jsx`, `src/game/map/cityMapRuntime.js`, `src/styles/views-city-hud.css`, `src/App.jsx`.

**Comment** :

1. Poser un attribut `data-contemplation` sur la racine `.app`, à côté de `data-active-view` (`App.jsx:171`), et scoper le masquage en CSS exactement comme l'est déjà tout le HUD Cité (`views-city-hud.css:29-107`). Le gabarit est exact.
2. Rien à changer côté runtime : le rendu continue normalement, on retire seulement le HUD. C'est ce qui rend la proposition bon marché.
3. **Correction** : Échap est déjà câblé à l'ouverture des Options (`App.jsx:85-91`). Soit prioriser la sortie de contemplation avant ce branchement, soit choisir une autre touche. Sortie évidente, plus un bouton discret en coin, et jamais d'entrée automatique dans ce mode.
4. **Correction** : `captureFrame` accepte **déjà** `opts.night` et `opts.health` (`cityMapRuntime.js:1478` : `{night: opts.night ?? 0, health: opts.health ?? 1}`). Aucune option `keepAmbient` à ajouter, il suffit d'appeler `captureFrame({night: CM.nightF, health: CM.healthF, now})`, puis de proposer le téléchargement du dataURL.
5. Ne pas exposer `__cityShot` : il est gardé DEV et POST vers un middleware Vite absent en .exe (`1501-1508`).

**Risque** : faible. Vérifier que la sortie du mode ne laisse pas un panneau replié dans un état inattendu.

---

<a id="b1"></a>
### B1. Une seule infobulle dans tout le jeu

Effort M, impact fort, axe B et E. Fusion de B1 et E3.

**Le joueur voit** : la même information s'affiche partout de la même façon. Les infobulles multi-lignes de la Topbar (humeur, multiplicateurs, cap nomade), aujourd'hui rendues au bon vouloir de l'OS via l'attribut `title` natif, redeviennent lisibles, structurées et alignées.

**Inspiration** : Manor Lords, bandeau sobre qui se déplie au survol avec fondu court. Anno 1800, infobulle qui liste les sources d'un chiffre. Songs of Conquest, survol d'une ressource égale ses sources.

**Où** : `src/App.jsx`, `src/components/ui/HelpBubble.jsx`, `src/components/ui/Topbar.jsx`, `src/components/views/RegulationView.jsx`, `src/components/ui/PurchaseRow.jsx`, `src/components/ui/CityStatusPanel.jsx`, `src/styles/views-regulation.css`, `src/styles/components.css`.

**Comment** (delta) : la brique existe et fonctionne déjà. `tipProps` est consommé par 8 composants (TensionBarometers, PressureAnatomy, StewardPanel, AuguresPanel, TemplePupitre, CycleAnnals, IcarusStage, ScratchStage, FaveurShop), tous rendus dans RegulationView, la seule vue qui monte la couche. Le delta est en quatre points, pas « des bulles partout » :

1. **Déplacer** `<HelpBubbleLayer/>` de `RegulationView.jsx:39` vers `App.jsx` à côté d'`<OutcomeFloatLayer/>` (`261`). Déplacer, pas dupliquer : la couche est un singleton (`showFn` module-scope, `HelpBubble.jsx:13-67`), deux abonnés se voleraient `showFn`.
2. Étendre `tipProps` à un contenu structuré : aujourd'hui strictement `name` plus `text` string, rendu en `<strong>` plus `<span>` (`63-64`). Accepter en plus un tableau de lignes `{label, value}` rendu en `<dl>`. Le retour `{}` quand `text` est vide reste le garde-fou.
3. Convertir les 5 `title` de `Topbar.jsx:84-105` et `142` en `tipProps`, en gardant le `title` de valeur exacte sur le nombre lui-même (`149`), qui répond à une autre question.
4. Migration ciblée ensuite, pas les 126 `title=` d'un coup : PurchaseRow (6 occurrences), CityStatusPanel.
5. Ajouter un délai d'ouverture de 120 ms et la règle « pas deux fois » : si une bulle a été fermée il y a moins de 400 ms, la suivante s'ouvre sans délai ni fondu. Un timestamp module suffit.
6. Déplacer les règles `.regul-tip` de `views-regulation.css` vers `components.css` pour respecter l'ordre de cascade du barrel `src/index.css`.
7. Bug connexe déjà documenté (`AUDIT-2026-07-21.md:348`, bulle orpheline quand la cible est démontée) : le montage global l'aggrave, il faut le corriger dans le même lot.

**Risque** : le `title` natif reste le repli clavier et tactile. Ne pas le supprimer sans vérifier que `tipProps` déclenche bien au focus (il le fait), et conserver un `aria-label` équivalent sur les éléments migrés.

---

<a id="b2"></a>
### B2. Anatomie du multiplicateur global

Effort M, impact fort, axe B.

**Le joueur voit** : la tuile Multi. de l'encart latéral devient cliquable et ouvre la pile des facteurs, dans l'ordre du calcul, avec le sous-total après chaque étape. Il voit enfin quelle ligne fait exploser sa production, ou laquelle la freine.

**Inspiration** : Kittens Game, formule exposée dans l'ordre du calcul. Unnamed Space Idle, convention plus additif et x multiplicatif.

**Où** : `src/game/core/mechanics/production/globalMultipliers.js`, `src/components/ui/CityStatusPanel.jsx`, `src/components/ui/PressureAnatomy.jsx`, `src/styles/components.css`, `src/styles/views-regulation.css`.

**Comment** : `globalScalarFactors` calcule déjà 8 facteurs nommés (`globalMultipliers.js:136-181`) puis les écrase dans un produit unique (`186`). Aucun export de décomposition n'existe.

1. Ajouter `globalMultiplierBreakdown()` avec le **même ordre exact** que la ligne 186 (ruines, marché, routes, infra, âges, globalMult de ruines, arbre, ruines non dépensées, GR, Icare, Atrides, pacte, pénalité, Énée, Olympe, Fimbul), retournant `[{key, label, factor, subtotal}]`. Garder l'ordre est obligatoire pour la parité bit-à-bit testée par `decimal.parity`.
2. **Ne pas** la brancher sur `renderCache._frameGlobalMult` (`184-188`) : c'est une fonction d'affichage, appelée au rendu du panneau seulement, sinon on paie 16 allocations par tick dans le hot path.
3. Filtrer les facteurs neutres (égaux à 1) pour ne montrer que ce qui agit, et marquer en rouge sourd ceux inférieurs à 1 (Fimbul, pénalité Atrides) : c'est la seule façon de comprendre un ralentissement.
4. UI : reprendre la maquette d'`AnatomyRow` (icône, nom, barre, valeur), la DA existe déjà et le joueur la connaît pour la Rupture. Précision : `AnatomyRow` est stylé dans `views-regulation.css`, mais la tuile d'entrée Multi. vit dans `CityStatusPanel`, dont les styles `.csp-*` sont dans `components.css` et `layout.css`. Il faudra donc du CSS dans `components.css` aussi.
5. Le sous-total se lit en `fmt()`, les facteurs restent des number natifs, tous bornés, aucun Decimal à coercer.

**Risque** : le miroir Decimal (`globalMultiplierDec`) doit rester la source de vérité au-delà du float. La décomposition affiche des number, donc borner l'affichage plutôt que dupliquer la formule.

---

<a id="b3"></a>
### B3. Les Comptes de la cité : bilan de production par ressource

Effort L, impact fort, axe B.

**Le joueur voit** : un écran où chaque ressource a sa ligne, débit total, part de chaque catégorie de bâtiment en barre empilée, et les cinq bâtiments qui contribuent le plus, en pourcentage. C'est la réponse à la question que personne ne peut trancher aujourd'hui : dans quelle branche investir.

**Inspiration** : Anno 1800, écran de statistiques de production. Factorio, part par item.

**Où** : `src/game/core/mechanics/production/buildingOutput.js`, `src/components/views/ChronicleView.jsx`, `src/game/core/mechanics/production/rates.js`, `src/styles/views-chronicle-timeline.css`.

**Comment** : `getBuildingSums` somme par **catégorie** (`buildingOutput.js:60-132`), avec cache `renderCache._buildingSums` (`61`, `123`) et branche overflow Decimal (`104-121`).

1. Ajouter `buildingContributions()` à côté : même boucle sur `buildings`, mais qui retient la sortie **par bâtiment**. Fonction d'affichage, jamais mise dans `renderCache._buildingSums`, qui est lu à chaque tick.
2. La part se calcule sur les sommes de **base**, avant multiplicateurs globaux : les facteurs globaux s'appliquant à tous, ils ne changent pas les proportions, ce qui évite de rejouer toute la pile de `rates()` par bâtiment.
3. Rendre une nouvelle `StatSection` dans `ChronicleView` (`StatTile` et `StatSection` sont déjà là, `51-70`), avec une barre empilée en div de largeurs en pourcentage. Pas de librairie, pas de canvas.
4. Gérer l'overflow Decimal : calculer les parts via `.div()` puis `toNum` sur le ratio, borné par construction.
5. Le pourcentage est la seule échelle qui ne casse jamais quand la valeur absolue traverse dix ordres de grandeur.
6. Point d'entrée depuis la Topbar : clic sur le **nom** de la ressource, pas sur l'icône ni sur le nombre, ouvre la vue Chronique sur cette section.

**Risque** : le tri sur 30 bâtiments à chaque rendu est négligeable, mais il ne faut pas l'abonner au tick. Le panneau ne vit que dans la vue Chronique, donc aucun coût en vue Cité.

---

<a id="b4"></a>
### B4. Débits à unité adaptative et convention de signe stricte

Effort S, impact moyen, axe B.

**Le joueur voit** : un débit de 0,0004 par seconde ne s'affiche plus comme un zéro mort, il vaut 1,4 par heure. Tous les petits débits de début de partie et tous les effets indirects de la boutique redeviennent lisibles, sans toucher à une seule formule de jeu.

**Inspiration** : Melvor Idle, mod ETA et taux horaires. Règle du genre, garder une mantisse entre 1 et 999.

**Où** : `src/game/core/utils.js`, `src/components/ui/Topbar.jsx`, `src/components/ui/PurchaseRow.jsx`, `src/styles/components.css`.

**Comment** :

1. Ajouter `fmtRate(value)` dans `utils.js`, à côté de `fmtShort` : retourne `{text, unit}` en testant la valeur **absolue** par paliers (supérieur ou égal à 1, par seconde ; supérieur ou égal à 1/60, par minute ; sinon par heure), en multipliant par 60 ou 3600. `formatCompactNumber` rend aujourd'hui « 0.0 » sous 1 (`utils.js:51-62`).
2. Entrée Decimal obligatoire : comparer avec `.abs().gte(1)` et multiplier avec `.mul(60)`, jamais avec les opérateurs natifs, le piège `valueOf` de `num.js` lève en dev.
3. Brancher à la place de `fmtShort(c.rate)` dans `Topbar.jsx:169` (le « /s » est en dur ligne 170), et sur les segments `pr-prod` de `PurchaseRow`. L'unité passe en petit à côté du nombre, en gardant `tabular-nums` pour ne pas faire trembler la colonne.
4. Verrouiller la convention au passage : un plus devant tout additif, un x devant tout multiplicatif, appliqué aux chips d'effet. `signed` et `signedShort` existent déjà (`utils.js:133-140`), il manque la règle côté multiplicatifs. Garder `multLabel` en pourcentage pour les seuls bonus relatifs.

**Risque** : ne pas appliquer aux valeurs de **stock**, seulement aux débits. Un stock par heure n'a aucun sens et casserait l'odomètre.

---

<a id="b5"></a>
### B5. Délai avant achat et amortissement sur chaque rangée

Effort M, impact fort, axe B et C. Fusion de B5 et C3.

**Le joueur voit** : chaque rangée inabordable affiche le délai avant de pouvoir payer au taux courant, et chaque rangée affiche son temps d'amortissement. C'est la seule information qui pilote réellement la durée d'une session idle : est-ce que j'attends trente secondes ou quatre heures.

**Inspiration** : CookieMonster pour Cookie Clicker, temps restant avant achat et payback period. Mod ETA de Melvor Idle. Timberborn, afficher l'échéance et non le stock.

**Où** : `src/components/ui/BuildingShop.jsx`, `src/components/ui/PurchaseRow.jsx`, `src/game/core/mechanics/production/rates.js`, `src/game/core/mechanics/cost.js`, `src/styles/purchase.css`.

**Comment** :

1. Calculer dans `BuildingShop`, le parent, jamais dans la rangée : pour chaque devise manquante, `D(cost).sub(D(state[cur])).div(D(rate))`, garder le **maximum** des devises, puis `toNum` sur le résultat, qui est une durée bornée. Court-circuiter si le débit vaut 0 ou si le Decimal dépasse le domaine float, en affichant « hors de portée » et non l'infini.
2. **Le point de perf est plus dur que ne le disait la proposition d'origine.** `BuildingShop` est explicitement `memo()` **sans props** pour ne pas se re-rendre au tick (`246-249`) : il n'a aucun abonnement horaire. Un seul `rates()` par rendu ne suffit donc pas. Il faut un nouvel abonnement `useGameState` calqué sur `affordability` (`77-84`), qui calcule le sélecteur chaque tick mais ne re-rend que quand une **signature d'ETA quantifiée** change.
3. Quantifier **avant de construire la signature**, pas seulement avant formatage, sinon `shallowEqual` échoue chaque seconde et on perd exactement le gain de 246-249. Pas lisible : 5 s sous une minute, la minute sous une heure, l'heure au-delà.
4. Passer une prop **déjà formatée en chaîne** pour que `arePropsEqual` (`PurchaseRow.jsx:223`) reste une comparaison de primitives, et l'y ajouter, sinon la valeur se fige silencieusement.
5. Second piège : en mode Max, `costById` est calculé avec `amount = 'max'` que `buildingBatchCost` résout à 1 (`cost.js:98`). L'ETA lu sur `costById` serait donc celui d'**une** unité.
6. Le payback vaut le coût divisé par le gain de production du lot, calculable depuis `buildingOutputMultiplier` sans toucher au moteur.
7. En crise terminale (`crisisFrozen`), masquer l'ETA, le tick étant gelé.
8. Ne pas dériver d'ETA de Rupture au passage : la décision du 2026-07-13 (`annals.js:10-12`) l'a explicitement rejetée. L'ETA d'achat est un autre objet.

**Risque** : un débit qui varie beaucoup (Braisiers, bonus temporaires) rend l'ETA optimiste. La présenter comme « au rythme actuel » dans la bulle.

---

<a id="b9"></a>
### B9. Jauges chiffrées des sceaux du Grand Reset

Effort S, impact fort, axe B et D. Fusion de B9 et D3.

**Le joueur voit** : chaque sceau affiche sa progression réelle, X sur cible. Un sceau encore scellé montre une jauge anonyme et son système, plutôt qu'une rune muette. Le joueur sait en permanence quel sceau est le plus proche, donc où pousser.

**Inspiration** : Antimatter Dimensions, onglet Statistics et progression chiffrée vers chaque palier. Trimps, objectif intermédiaire visible.

**Où** : `src/game/core/mechanics/grandResetMilestones.js`, `src/components/ui/GrandResetLadder.jsx`, `src/components/ui/CityStatusPanel.jsx`, `src/styles/components.css`.

**Comment** (delta, deux affirmations fausses écartées) :

- Faux : « `grPopulationTarget()` et `grEraTarget()` sont mortes ». Elles sont appelées par les `check()` des sceaux 4 et 10 (`grandResetMilestones.js:83` et `119`). C'est seulement **l'affichage** de la cible qui manque.
- Faux : « `claimableGrandResetCount()` n'est lue qu'ici ». Elle est déjà affichée en toutes lettres dans le plateau (`GrandResetLadder.jsx:106-113`, « X sceaux prêts à réclamer »).

1. Ajouter `progress()` à côté de `check()` dans les 11 entrées de `GRAND_RESET_MILESTONES` (`60-127`), rendant `{current, target}`. La plupart sont triviales : cycles sur 10, merveilles sur 3, mythes sur 1, 5, 8, 14, capstones sur 4. Deux passent par `grPopulationTarget()` et `grEraTarget()`.
2. Le sceau Rayonnement doit se jauger en **log10** (cible 1e6 puis 1e11 puis 1e16) : une barre linéaire sur une cible exponentielle reste vide pendant des heures puis saute. Utiliser `D(...).log10()`, qui rend un number, jamais `toNum` sur la valeur brute. Ailleurs, `D(current).div(target).toNumber()` borné à 1, jamais de division native sur un Decimal.
3. Affichage à deux régimes : sceau révélé, nom plus jauge chiffrée ; sceau scellé, jauge **seule et anonyme** plus le champ `system` déjà présent, ce qui tease sans divulguer. Aujourd'hui les lignes 165-173 affichent « Sceau à découvrir » et rien d'autre.
4. Le composant est déjà abonné à `renderCache.tickNow` (`49`), donc les jauges se rafraîchissent sans nouveau sélecteur.
5. Nouveau, celui-là : reporter le compte réclamable dans `CityStatusPanel`.

**Risque** : une jauge anonyme trop précise peut vendre la mécanique concernée. Garder le libellé du système masqué tant que le sceau n'est pas révélé.

---

<a id="b10"></a>
### B10. Badges d'attention sur les onglets

Effort S, impact fort, axe B et D. Fusion de B10 et D7.

**Le joueur voit** : une pastille chiffrée par onglet quand il y a réellement quelque chose à faire, sceaux prêts, nœuds de ruines abordables, marchandises payables. Il arrête d'ouvrir les onglets pour vérifier, et ne rate plus un sceau pendant des heures.

**Inspiration** : convention idle, notification par pastille sur l'onglet concerné, jamais par modale qui interrompt. Trimps, Idle Champions.

**Où** : `src/App.jsx`, `src/game/core/mechanics/upgrades.js`, `src/game/core/mechanics/grandResetMilestones.js`, `src/styles/layout.css`.

**Comment** :

1. Le tableau `tabs` (`App.jsx:142-152`) est le point unique : ajouter un champ `badge` optionnel, fonction pure évaluée au rendu de la sidebar (`186-198`).
2. Sources : `claimableGrandResetCount()` (`grandResetMilestones.js:164`) pour l'onglet Effondrement, et **`checkNodeAvailability(id)`** pour l'arbre des Ruines. Correction : `ruinNodeStatus` n'existe pas, la bonne fonction est `checkNodeAvailability` (`upgrades.js:49-62`), qui rend `available`, `cost`, `locked`, `blocked` ou `purchased`. Ne badger que `available`, le statut `cost` étant précisément le « bientôt abordable » à exclure.
3. Pour l'échoppe et le comptoir, il n'existe aucun équivalent prêt à l'emploi. Il faut écrire le compteur d'abordabilité marchandise, sur le modèle d'`affordableCount` de la boutique (`BuildingShop.jsx:113-118`).
4. Abonner via **un seul** `useGameState` qui rend une chaîne compacte du type `2-1-0` : `shallowEqual` comparerait mal un objet recréé à chaque tick, une chaîne coupe le re-render dès que rien ne bouge.
5. Style : reprendre `.subtab-badge` (`purchase.css:443`), déjà utilisé pour les sous-onglets de la boutique (`BuildingShop.jsx:147`). Prévoir le palier responsive 981 à 1500 px où les libellés disparaissent (`layout.css:355`, `383`, `.tab-label` masqué `418`) : la pastille doit alors se coller à l'icône.
6. Plafonner l'affichage à 9 et plus. Jamais de rouge, la pastille est une information et non un problème. Jamais posée pendant la crise terminale, les onglets étant déjà verrouillés.

**Risque** : fatigue de pastille. Ne badger que ce qui est gratuit ou payable **maintenant**, jamais ce qui est simplement nouveau ou bientôt abordable. Voir l'arbitrage avec [E11](#e11).

---

<a id="b11"></a>
### B11. Rapport de reprise chiffré après une absence

Effort M, impact fort, axes B, C et D. Fusion de B11, C1 et D1, qui décrivaient le même écran.

**Le joueur voit** : au retour, un encart non bloquant liste ce que la cité a fait pendant l'absence, ligne par ligne, et dit aussi **ce qui n'a pas tourné**. Le joueur voit une récolte au lieu d'un solde qui a bougé sans explication.

**Inspiration** : Melvor Idle et Clicker Heroes, écran « pendant votre absence » ventilé. Unnamed Space Idle, qui liste explicitement les systèmes inactifs.

**Où** : `src/game/core/main.js`, `src/game/core/state.js`, `src/game/data/idleNarrative.js`, `src/components/views/CityView.jsx`, `src/styles/views-city-hud.css`, `src/game/core/outcomeFloat.js`.

**Comment** (delta) : un retour existe déjà, la dépêche `idleResumeNarrative` (`main.js:302-310`, `idleNarrative.js:48-62`), avec nombre d'effondrements et ruines gagnées, mais elle atterrit dans un journal invisible hors crise. Aucun delta de ressources n'est calculé nulle part.

1. Dans `applyOfflineProgress` (`main.js:275-316`), prendre un instantané Decimal des 5 ressources et de `timeWear` **avant la ligne 285** (`const farm = simulateAwayCrises(elapsed)`), qui monkeypatche `Date.now` et jette `state.history` dans son `finally` (`252-265`). Refaire la différence après avec `.sub()`, sans jamais coercer.
2. `simulateAwayCrises` retourne déjà `{collapses, ruinsGained}` (`266`) : les consommer tels quels au lieu de rediffer les Ruines. Le régime emprunté se lit au même endroit : farm si le retour est non null, linéaire sinon.
3. Le plafond est appliqué **avant** le calcul (`main.js:281`, `elapsed = min(idleCapSeconds(), elapsed)`) : le rapport doit recevoir **les deux** valeurs pour pouvoir dire « 3 h 12 créditées sur 8 h de réserve, 4 h perdues au-dessus du plafond ». C'est ce qui rend les Veilleurs de nuit désirables.
4. **Arbitrage sur le transport.** Deux options étaient proposées : bus module calqué sur `outcomeFloat.js` (`1-14`), ou champ `state.idleReport`. Retenu : **le bus module**, qui évite `defaultState`, `hydrateState` et un normalizer pour une donnée qui ne survit pas au reload et n'a aucune raison de partir dans l'export JSON.
5. Côté React, un encart non modal dans `CityView`, révélé en 3 à 5 lignes décalées d'environ 120 ms, total en dernier, avec un bouton Fermer. Jamais de dialog qui vole le focus avant que la ville soit visible.
6. Section fixe listant ce qui **ne tourne pas** hors ligne : Temple (tant que [C12](#c12) n'est pas livré), aubaines, fêtes de jalon, jalons de Rayonnement, bulles d'habitants, Rupture gelée sur le chemin linéaire. Sans cette liste, l'écart avec l'attente est lu comme un bug.
7. La garde de `main.js:280` (`gamePaused`, `collapseInProgress`, `crisisLimitAnnounced`) fait sortir sans rien créditer : dans ce cas **ne pas publier de rapport**, sinon on annonce un retour à zéro après une longue absence. Même chose sous 60 s d'absence, seuil déjà appliqué par le crédit de `visibilitychange` (`main.js:561-575`), ce qui évite le double affichage.
8. Décider si la dépêche `idleResumeNarrative` reste comme titre du rapport ou disparaît. Garder les deux crée un doublon.

**Risque** : le chemin farm rejoue de vrais effondrements, donc le delta de ressources peut être **négatif**, la cité étant plus jeune. Présenter alors le gain de Ruines comme résultat principal, pas les ressources.

---

<a id="b12"></a>
### B12. Format mixte à seuil et mantisse à largeur fixe

Effort S, impact moyen, axe B.

**Le joueur voit** : un quatrième mode d'affichage, écriture naturelle avec séparateurs tant que les nombres restent humains, suffixes ensuite, scientifique au-delà du seuil où les suffixes deviennent du charabia. Et une colonne qui cesse de trembler au passage de 9,99 à 10,0.

**Inspiration** : Antimatter Dimensions, Mixed Scientific, seuil unique et explicite, mantisse à 3 chiffres.

**Où** : `src/game/core/utils.js`, `src/components/dialogs/OptionsDialog.jsx`, `src/components/ui/OdometerNumber.jsx`, `src/components/ui/odoPrecision.js`.

**Comment** :

1. Ajouter un mode `mixed` à la liste blanche de `numberFormatMode` (`utils.js:9-25`), déjà persistée en localStorage. Attention, la liste est **dupliquée lignes 12 et 19** : ajouter aux deux. Sous 1e6, `formatFullNumber` ; entre 1e6 et le seuil, `formatCompactNumber` ; au-delà, `formatScientificNumber`, avec le seuil en constante nommée unique.
2. Figer la mantisse à trois chiffres significatifs dans `formatCompactNumber` (`51-62`) au lieu de la règle actuelle (2 décimales sous 10, 1 au-dessus), qui fait varier la largeur.
3. `fmtShort` et `fmtShortLive` continuent d'ignorer le mode global (zones denses) : ne toucher qu'à `fmt` (`64-76`), pour ne pas faire déborder les rangées de boutique.
4. Quatrième bouton dans le groupe Affichage d'`OptionsDialog` (`256-277`), avec un exemple concret en libellé (« 1 200 000 puis 1.20M ») plutôt qu'un nom technique.
5. Vérifier l'odomètre : `COMPACT_UNITS` est partagé et `odoPrecision` dérive sa précision du débit. Un test existe déjà dans `src/components/ui/__tests__/`.

**Risque** : changer la précision de la mantisse touche l'odomètre de la Topbar, le seul endroit où un chiffre roule. Vérifier à l'œil que le dernier chiffre reste suivable.

---

<a id="c2"></a>
### C2. Réserve d'absence visible

Effort S, impact moyen, axe C. **Proposition reformulée : la formule d'origine ne peut pas fonctionner.**

**Le joueur voit** : le plafond d'absence cesse d'être un nombre d'heures enterré dans une tuile de la Chronique. Il devient un encart lisible, avec le palier suivant nommé, donc un objectif de progression au lieu d'une punition découverte après coup.

**Inspiration** : Melvor Idle et Unnamed Space Idle, plafond hors ligne visible et extensible par amélioration.

**Où** : `src/components/ui/CityStatusPanel.jsx`, `src/game/core/main.js`, `src/game/core/utils.js`, `src/styles/layout.css`.

**Comment** (correction) : la jauge dynamique proposée, `(renderCache.tickNow - state.lastTick) / idleCapSeconds()`, est **fausse en pratique**. `state.lastTick` est réécrit à chaque tick en session, et `applyOfflineProgress` le recale (`main.js:314`), donc le ratio vaut environ 1/28800 en permanence tant que l'onglet est visible. Le régime `skip` d'`offlineCredit.js:21` fige `lastWall` au masquage, mais la vue n'est plus rendue à ce moment. La jauge serait vide 100 pour cent du temps où le joueur la regarde.

1. Retenu : un encart **statique** dans `CityStatusPanel`, « Réserve d'absence : 8 h », plus le palier suivant tant que l'amélioration n'est pas possédée, « Veilleurs de nuit 2 : 24 h ».
2. Le **remplissage** ne s'affiche qu'au retour, dans le rapport de [B11](#b11) : « 3 h 12 créditées sur 8 h de réserve ».
3. Extraire `fmtSecs` (`CityStatusPanel.jsx:25`) vers `src/game/core/utils.js` : B11 et B5 en ont besoin aussi.
4. Attention au palier responsive 981 à 1500 px qui masque `.csp-label` et `.csp-value` : prévoir un `title` porteur de la valeur, sinon l'encart devient muet comme l'Usure aujourd'hui.

**Risque** : aucun risque technique après reformulation. Le gabarit existe (jauges Âge et Usure, `CityStatusPanel.jsx:17-109`).

---

<a id="c9"></a>
### C9. Emplacements de sauvegarde et export sur disque

Effort M, impact moyen, axe C.

**Le joueur voit** : trois emplacements manuels avec horodatage et nombre de cycles, plus un export en fichier. Une partie qui se joue sur des mois gagne enfin un filet, notamment un snapshot avant un Grand Reset risqué.

**Inspiration** : pratique standard des idle navigateur, export et import en chaîne de texte plus emplacements locaux.

**Où** : `src/components/dialogs/OptionsDialog.jsx`, `src/game/core/state.js`, `src/game/core/main.js`, `src/game/core/saveKey.js`, `preload.cjs`, `src/game/core/cloudSave.js`.

**Comment** :

1. Trois clés localStorage dérivées de `SAVE_KEY` (`saveKey.js:1-13`, une seule clé aujourd'hui), avec horodatage et nombre de cycles affichés par emplacement, dans l'onglet Autre d'`OptionsDialog` (`452-484`, où vit déjà le statut nuage via `cloudSyncInfo` importé ligne 28).
2. L'écriture réutilise exactement le `JSON.stringify(state)` de `save()`. Précision : `save()` vit dans `state.js:1475`, ce sont `exportSave` et `importSave` qui sont dans `main.js`.
3. La lecture d'un emplacement doit passer par **le même chemin qu'`importSave`** (`hydrateState` puis `setState`) pour garder les Decimal et ne pas contourner la migration de schéma (`CURRENT_SAVE_VERSION = 4`, `saveKey.js:13`).
4. Pour le fichier, exposer un `saveAs` dans le `contextBridge` de `preload.cjs` à côté de `read`, `write`, `clear` (`93-98`), le préload ayant déjà `fs` et le dossier Drive. Repli navigateur par Blob et lien de téléchargement.
5. Un écrasement d'emplacement demande une confirmation, mais via `ChoiceDialog` et non le `confirm()` natif d'`OptionsDialog.jsx:49`, voir [C10](#c10).

**Risque** : trois copies du state dans le localStorage peuvent déclencher le `QuotaExceededError` déjà attrapé par `save()`. Plafonner à 3 emplacements et prévoir un message clair.

---

<a id="c10"></a>
### C10. Fin des fenêtres système et indicateur de sauvegarde

Effort S, impact moyen, axes C et E. Fusion de C10 et E6.

**Le joueur voit** : plus aucune fenêtre système ne vole le focus. En échange, la barre latérale gagne une pastille discrète qui dit quand la partie a été sauvegardée pour la dernière fois, information aujourd'hui absente sauf à cliquer.

**Inspiration** : Idle Champions et la demande récurrente « disable confirmation popups » du genre idle. Pastille d'autosave standard des jeux de gestion.

**Où** : `src/App.jsx`, `src/components/dialogs/ImportDialog.jsx`, `src/components/dialogs/OptionsDialog.jsx`, `src/game/core/outcomeFloat.js`, `src/game/core/state.js`, `src/components/ui/CityStatusPanel.jsx`, `src/styles/layout.css`.

**Comment** :

1. `App.jsx:157` (alerte d'export) et `:204` (alerte de sauvegarde) passent par `pushOutcomeFloat`, bus déjà branché sur une couche `aria-live`. `App.jsx:159` (repli d'export par `prompt`) réutilise `ImportDialog` en mode lecture seule. Les deux `alert` d'`ImportDialog.jsx:16` et `:19` disparaissent de la même façon.
2. Le `confirm()` de réinitialisation (`OptionsDialog.jsx:49`) est le seul à garder bloquant, mais il passe par `ChoiceDialog`, déjà enregistré dans `App.jsx:126-129`, qui gère le double Échap de Chromium et les raccourcis chiffrés. Garder une double confirmation explicite, la réinitialisation devenant moins « dure » qu'un confirm natif.
3. `save()` pose un timestamp dans une **variable de module**, surtout pas dans `state` où il partirait dans l'export JSON et déclencherait un render inutile, exposé par `getLastSaveAt()`.
4. `CityStatusPanel`, déjà réabonné au tick, rend un « sauvegardé il y a N s » sous les actions rapides (`App.jsx:203-216`), en secondes arrondies et en lisant `renderCache.tickNow` plutôt que `Date.now()`, alimenté aussi par `cloudSyncInfo()` (`cloudSave.js:48`).
5. Bonus : ces surfaces sont déjà traduites via `tr()`, contrairement aux chaînes des `alert` actuelles.

**Risque** : `pushOutcomeFloat` ignore silencieusement tout outcome sans label (`outcomeFloat.js:13`) et la couche s'autodétruit après 2,4 s (`OutcomeFloatLayer.jsx:16`). Un échec de sauvegarde (`QuotaExceededError`) ne doit donc **pas** passer par ce bus, mais par un état persistant et visible dans la pastille.

---

<a id="c11"></a>
### C11. Navigation au clavier et table de raccourcis centralisée

Effort M, impact moyen, axes C et E. Fusion de C11 et E2.

**Le joueur voit** : les touches 1 à 8 ouvrent les vues débloquées dans l'ordre de la barre latérale, la caméra se pilote au clavier, et la liste des raccourcis de l'écran d'aide se génère depuis la même table que les gestionnaires, donc elle ne peut plus mentir. Une touche gênante, notamment le E qui déclenche un achat de masse par accident, peut être désactivée.

**Inspiration** : Dwarf Fortress version Steam, raccourcis de localisation. Convention 1 à N des onglets de la plupart des idle PC.

**Où** : `src/game/core/shortcuts.js` (nouveau), `src/App.jsx`, `src/components/dialogs/OptionsDialog.jsx`, `src/game/map/cityMapRuntime.js`.

**Comment** :

1. `shortcuts.js` exporte `SHORTCUTS = [{id, key, label, hint, run}]` et un `resolveShortcut(event)`, en reprenant les gardes existantes d'`App.jsx:102-105` (champ focus, `dialog[open]`, modificateurs). Module calqué sur `qualityMode.js` et `dayNightMode.js` : réglage de confort persisté en localStorage, hors sauvegarde, donc rien à ajouter aux normalizers ni à `GR_PERSISTENT_FIELDS`.
2. `App.jsx:84-117` perd le littéral `buyCategory` (`100-109`) et appelle `resolveShortcut` puis `entry.run()`. Le tableau `tabs` (`142-152`) filtré sur `unlocked` fournit la cible des touches 1 à 8, via `openView` (`state.js:263`).
3. Réutiliser **la même condition** que le verrou de crise terminale déjà implémenté côté UI (`crisisLocked`, `App.jsx:189-191`), sinon le raccourci contourne le verrou que la barre latérale applique.
4. Les touches de caméra appellent les fonctions déjà présentes dans `cityMapRuntime.js` (`cityMapCenterCamera`, `cmClampCamera`) derrière un petit `setZoom` exporté, plus `CM.centered = false` pour le recentrage. Voir [A9](#a9).
5. L'onglet Raccourcis d'`OptionsDialog` (`407-449`) se génère par `map` sur `SHORTCUTS`, ce qui supprime les 5 blocs en dur et fait apparaître automatiquement toute touche ajoutée ensuite. Seconde passe : une case « désactivé » par ligne, lue par `resolveShortcut`.

**Risque** : deux pièges. La séquence secrète « debug » d'`App.jsx:111-116` filtre sur `key.length === 1` et absorbe donc aussi les chiffres : `resolveShortcut` doit continuer à laisser passer les touches vers l'accumulateur au lieu de faire un `return`. Et la capture de touche doit refuser Échap et les touches déjà prises, sinon on peut rendre les Options inaccessibles.

---

<a id="c13"></a>
### C13. Toasts bornés, fusionnés et cliquables

Effort S, impact moyen, axes C et E. Fusion de C13 et E10.

**Le joueur voit** : une rafale d'événements ne produit plus un mur de textes flottants. Les libellés identiques fusionnent avec un compteur, la pile est plafonnée, et un clic emmène vers la vue concernée.

**Inspiration** : floating combat text, agrégation, offset et pooling. Cities Skylines, notifications empilées qui recadrent. Dwarf Fortress, annonces avec saut au lieu.

**Où** : `src/components/ui/OutcomeFloatLayer.jsx`, `src/game/core/outcomeFloat.js`, `src/game/core/actions/crisis.js`, `src/game/core/state.js`.

**Comment** :

1. Dans le callback de `registerOutcomeFloats` (`OutcomeFloatLayer.jsx:10-18`, concaténation sans plafond, timer fixe 2400 ms, aucune fusion), chercher d'abord un float vivant de même **label et kind** : si trouvé, incrémenter un compteur et relancer son timer au lieu d'ajouter une entrée. La fusion sur le label seul ne suffit pas.
2. Plafonner la pile visible à 4 ou 5, au-delà mettre en file consommée à chaque sortie d'élément, ce qui borne aussi le nombre de nœuds DOM. Suffixe « xN » quand le compteur dépasse 1, en réutilisant `.outcome-float` (`components.css:654-695`), aucune nouvelle animation.
3. Étendre le contrat de `pushOutcomeFloat` (`outcomeFloat.js:12-14`, aujourd'hui `{label, kind}`) d'un champ facultatif `view`, le toast devenant un bouton qui appelle `openView` (`state.js:263`), et d'un champ `priority` pour qu'un jalon passe devant une aubaine. Les 25 points d'émission actuels restent valides sans modification.
4. Ajouter un repli générique côté crise : un outcome sans label ne produit aujourd'hui aucun retour (`crisis.js:148` et `:213`).
5. Ne rendre en `aria-live` que les entrées nouvelles, sinon un lecteur d'écran relit la pile à chaque fusion.
6. Précision utile : le float par achat de la boutique n'emprunte **pas** ce bus (`PurchaseRow.jsx:83-87` gère sa propre liste locale de 900 ms). Un achat de masse ne sature donc pas la couche. Les vraies sources de rafale sont les paliers (`building.js:101`), les fêtes de jalon (`building.js:143`) et les automatisations du Temple.

**Risque** : rendre un toast cliquable le rend aussi survolable. Vérifier qu'il n'intercepte pas les clics sur la carte, la couche étant en position fixe au-dessus du canvas.

---

<a id="d6"></a>
### D6. Teasing chiffré du prochain déblocage

Effort S, impact moyen, axe D. **Contient un arbitrage à trancher avec l'auteur.**

**Le joueur voit** : la carte « Bientôt » montre la jauge de révélation et la devise à faire monter. Et quand le bâtiment apparaît enfin, une dépêche et une pastille le signalent, au lieu d'une apparition silencieuse que le joueur peut rater pendant des heures.

**Inspiration** : Cookie Clicker, silhouettes de bâtiments à venir. Melvor Idle, jalons annoncés avant déblocage.

**Où** : `src/game/core/mechanics/shared.js`, `src/components/ui/BuildingShop.jsx`, `src/game/core/actions/tick.js`, `src/game/core/actions/utils.js`.

**Comment** (delta) : la carte « Bientôt » **existe déjà** avec nom, splash assombri, indice de cycle et bouton (`BuildingShop.jsx:207-239`). Et le commentaire des lignes 208-211 documente un **choix de design explicite** : « l'apparition économique reste muette ».

1. Partie non contestée, à faire : latcher les révélations dans une map `state.revealedBuildings` au tick. Toute entrée neuve pousse un `pushOutcomeFloat` et une ligne `chronicle()`, les révélations d'un même tick étant groupées en un seul message, sous garde `isNotifyPaused` pour ne pas annoncer celles survenues hors ligne.
2. Partie à arbitrer : extraire d'`isUnlocked()` (`shared.js:17`, seuil `BUILDING_REVEAL_PEAK_FRACTION` lignes 11 et 27-30) une fonction `revealProgress(buildingId)` rendant `{current, target, currency}`, sans dupliquer le seuil, et l'afficher en jauge sous le bloc `nextLocked`. **Cela revient sur une décision de design assumée**, donc à trancher avant de coder.
3. Au passage, mémoïser `categoryData` (`BuildingShop.jsx:101-120`) avec `useMemo` sur buildings, cycles et ère.

**Risque** : rafale de révélations au tout début de partie. Grouper par tick.

---

<a id="e4"></a>
### E4. Onglet Options Interface : échelle, densité, intensité des animations

Effort M, impact fort, axe E. Non vérifié contre le code, à confirmer.

**Le joueur voit** : trois curseurs qui manquent à un jeu distribué en .exe et qui tourne sur des écrans inconnus. La taille de tout le texte, la densité des panneaux, et l'intensité des animations indépendamment de la qualité graphique.

**Inspiration** : Against the Storm et Frostpunk 2, la mise à l'échelle de l'UI réclamée comme fonctionnalité à part entière. Halo Infinite, curseur d'intensité des effets.

**Où** : `src/game/core/uiPrefs.js` (nouveau), `src/components/dialogs/OptionsDialog.jsx`, `src/styles/base.css`, `src/styles/variables.css`, `src/styles/ui-light.css`, `src/styles/views-city-hud.css`.

**Comment** :

1. `uiPrefs.js` calqué sur `dayNightMode.js` et `qualityMode.js` : lecture localStorage au chargement du module, getters et setters, hors sauvegarde de partie, un réglage de confort ne se transportant pas dans un export.
2. Échelle : `font-size` sur `<html>` (90, 100, 112, 125 pour cent). Toute l'échelle `--fs-*` de `variables.css:134-141` et `--city-topbar-h` (`views-city-hud.css:19`) sont déjà en rem, rien d'autre à toucher.
3. Densité : attribut `data-density` sur `.app`, lu par `ui-light.css` pour réduire paddings et gaps d'un cran, plus un `--city-topbar-h` réduit en mode compact.
4. Mouvement : attribut `data-motion` sur `<html>`, branché sur le même bloc que `prefers-reduced-motion` (`base.css:5-16`) via un sélecteur supplémentaire, ce qui coupe d'un coup les 6 feuilles qui respectent déjà cette requête. **Ce cran doit aussi piloter `CM.ambianceK` de [A8](#a8)**, voir l'arbitrage.
5. Nouvel onglet dans le tableau d'onglets d'`OptionsDialog.jsx:160-210`, avec le même composant `number-format-control` que les réglages existants.

**Risque** : à 125 pour cent il faut vérifier les chevauchements du HUD Cité, pas seulement le rendu à 100. C'est le piège documenté d'Against the Storm.

---

<a id="e7"></a>
### E7. Transitions d'écran et préchargement des vues au survol

Effort S, impact moyen, axe E. Non vérifié contre le code.

**Le joueur voit** : le changement d'écran cesse d'être un à-coup. Le chunk se précharge dès que la souris passe sur l'onglet, et la vue entre par un fondu court qui part du côté de la barre latérale.

**Inspiration** : Emil Kowalski, transitions sous 300 ms et origine consciente, le panneau grandit depuis son déclencheur.

**Où** : `src/App.jsx`, `src/styles/layout.css`, `src/game/core/state.js`.

**Comment** :

1. Garder une map `{id: factory}` au lieu d'appeler `lazy()` en ligne (`App.jsx:23-33`) et déclencher `factory()` sur `onMouseEnter` et `onFocus` du bouton d'onglet. Le module est mis en cache par le navigateur, le montage devient instantané.
2. Entourer le bloc Suspense d'un conteneur portant `key={activeView}` et une classe `.view-enter` : opacité 0 vers 1, `translateY` 4 px, 180 ms `ease-out`, `transform-origin: left`.
3. Remplacer le fallback null par un cadre vide de la hauteur de la vue, pour éviter le saut de mise en page pendant le chargement du chunk.
4. L'animation est coupée par `prefers-reduced-motion`, déjà global dans `base.css`, et par le réglage `data-motion` d'[E4](#e4).
5. Aucun impact moteur : `openView` (`state.js:263`) reste inchangé.

**Risque** : préchargement au survol sur une machine modeste, qui peut concurrencer la frame de la carte. Limiter à un préchargement par onglet et par session.

---

<a id="e8"></a>
### E8. Ossature d'accessibilité

Effort S, impact moyen, axe E. Non vérifié contre le code.

**Le joueur voit** : un joueur au clavier ou au lecteur d'écran cesse de naviguer à l'aveugle, et la fermeture d'un dialogue ne renvoie plus le focus au début de la page.

**Inspiration** : pratique standard des applications web, et le constat des jeux de gestion où le clavier reste le mode de secours quand la souris est occupée.

**Où** : `src/App.jsx`, `src/hooks/useDialogModal.js`, `src/styles/base.css`, `src/styles/components.css`.

**Comment** :

1. Ajouter un `<h1 class="sr-only">` (nom du jeu plus âge courant) et un lien d'évitement vers `<main>`, `.sr-only` existant déjà (`components.css:1181`).
2. Donner un `aria-label` à `<main>` (`App.jsx:219`) et rendre un `<p class="sr-only" role="status">` qui annonce « Vue : X » à chaque changement d'`activeView`.
3. Déplacer le focus sur le conteneur de vue (`tabIndex -1`) au changement d'onglet, pour que la tabulation suivante reparte de la vue et non du logo.
4. `useDialogModal` mémorise `document.activeElement` à l'ouverture et le restaure à la fermeture, et absorbe le clic hors cadre déjà écrit dans `OptionsDialog.jsx:135-146` pour qu'Import et Debug en bénéficient sans duplication.
5. Corriger la hiérarchie : les `h2` de vue deviennent les enfants logiques du `h1`, sans changer un seul style.

**Risque** : déplacer le focus à chaque changement de vue peut faire sauter le scroll. Utiliser `preventScroll` sur `focus()`.

---

<a id="e9"></a>
### E9. Polices et glyphes autonomes hors ligne

Effort M, impact fort, axe E. Non vérifié contre le code, mais c'est un défaut de distribution avéré.

**Le joueur voit** : dans la version installée lancée sans réseau, la typographie ne retombe plus sur une police système et quatorze glyphes ne sont plus des carrés vides.

**Inspiration** : contrainte de distribution .exe, même logique que le chemin audio relatif déjà retenu pour la musique.

**Où** : `index.html`, `src/styles/typography.css`, `src/components/ui/PixelIcon.jsx`, `src/components/ui/resourceIcons.js`, `src/components/views/ruinsTree/branchTheme.js`.

**Comment** :

1. Rapatrier les woff2 des six familles dans `src/assets/fonts/` et déclarer les `@font-face` avec `font-display: swap` dans `typography.css`, puis supprimer les trois `<link>` distants d'`index.html:7-12`.
2. Remplacer les 14 usages `fa-solid` (CityView, PurchaseRow, BuildingShop, RuinsTreePixel, TreeNode, NodeTooltip) par `PixelIcon`. `resourceIcons.js` et `branchTheme.js` deviennent des tables de noms d'emblèmes au lieu de classes fa. Cela aligne aussi la DA.
3. `PixelIcon` gagne un `onError` qui bascule sur une icône de repli et arrête l'erreur console, ce qui couvre les 4 icônes placeholder déjà signalées en commentaire.
4. Corriger son `src` : `/pixelart/ui/...` est un chemin absolu, il doit passer par `import.meta.env.BASE_URL`, comme le fait déjà `initAudio` pour le `file://` d'Electron.
5. Vérification : lancer le .exe réseau coupé et comparer une capture de la Topbar et de l'arbre des Ruines.

**Risque** : le poids du bundle augmente de quelques centaines de kilo-octets. Ne rapatrier que les graisses réellement utilisées, celles listées dans l'URL Google actuelle.

---

<a id="e11"></a>
### E11. Pastille « nouveau » sur les onglets et feuillet de première ouverture

Effort M, impact fort, axe E. Non vérifié contre le code.

**Le joueur voit** : un onglet fraîchement débloqué porte une pastille dorée jusqu'à sa première ouverture, et cette première ouverture affiche un feuillet de deux phrases, refermable, rappelable par le jeton d'aide.

**Inspiration** : divulgation progressive des incrementals (GCAP 2017, Idle By Design), pastille d'onglet non intrusive.

**Où** : `src/App.jsx`, `src/components/ui/StageHelp.jsx`, `src/game/core/state.js`, `src/styles/layout.css`.

**Comment** :

1. `state.uiSeen`, objet plein des `defaultState` et jamais null, inscrit dans `GR_PERSISTENT_FIELDS` : une aide déjà lue ne revient pas après un Grand Reset.
2. Dans le rendu des onglets (`App.jsx:186-198`), afficher une pastille quand `tab.unlocked && !uiSeen[tab.id]`. `openView` efface le drapeau en une mutation, donc une seule notification.
3. Le feuillet réutilise `StageHelp.jsx` tel quel, ouvert par défaut à la première visite (nouvelle prop `defaultOpen`). Il est déjà positionné en fixe pour contourner l'overflow et l'absence d'ancrage CSS du Chromium de l'.exe.
4. Contenu par vue dans une table de textes, deux phrases maximum, à quoi sert l'écran et quoi faire en premier, écriture sobre.
5. La pastille disparaît même si le joueur ne lit pas le feuillet. Rien ne bloque, rien n'attend un accusé de réception.

**Risque** : empilement avec [E1](#e1) et avec [B10](#b10). Voir les arbitrages.

---

## Arbitrages

Cinq contradictions ou recouvrements ont été tranchés.

**1. Deux réglages de mouvement : A8 contre E4.** [A8](#a8) coupe l'ambiance de la carte (`CM.ambianceK`), [E4](#e4) coupe les animations d'interface (`data-motion`). Tranché : garder les deux mécanismes, qui touchent des couches techniques différentes, mais **un seul contrôle utilisateur**. Le cran Mouvement d'E4 pilote aussi `CM.ambianceK`. Deux curseurs distincts pour la même intention rendraient le joueur responsable d'une distinction qui ne l'intéresse pas.

**2. Deux pastilles sur le même onglet : B10 contre E11.** [B10](#b10) badge ce qui est actionnable maintenant, [E11](#e11) badge ce qui est nouveau. Tranché : **une seule pastille par onglet**, avec priorité au « nouveau » tant que l'onglet n'a pas été ouvert une fois, puis bascule définitive sur le compteur actionnable. Deux pastilles superposées ne se lisent pas.

**3. Deux tutoriels : E1 contre E11.** Tranché : si les deux sont livrés, le feuillet de première ouverture ne s'ouvre que pour les vues qui **ne sont pas déjà une étape** du fil Premiers pas. Sinon le joueur lit deux fois la même chose.

**4. Deux mécaniques de dépense du temps stocké : C7 contre D4.** Tranché en faveur de la boucle sous **horloge virtuelle** de `simulateAwayCrises`, voir [C7](#c7). Des ticks supplémentaires sans horloge virtuelle multiplient la production mais pas l'âge de cycle, ni les cooldowns du Temple, ni le déclencheur temps de l'Édit : c'est une divergence, pas une accélération.

**5. Un second système de défis : D12 contre les Mythes.** Tranché : périmètre réduit aux épreuves d'**avant premier Grand Reset**, ou abandon. Les Mythes sont déjà 14 cycles à règles altérées avec récompense permanente, branchés exactement sur les mêmes gardes. Voir [D12](#d12).

Un sixième point n'est pas tranchable sans l'auteur : la jauge de révélation de [D6](#d6) revient sur un choix de design explicitement écrit dans le code (`BuildingShop.jsx:208-211`, « l'apparition économique reste muette »). Le latch et la dépêche peuvent être livrés sans lui, la jauge non.

---

## Déjà fait, ne pas reproposer

Aucune piste n'a été écartée en bloc. En revanche, **onze pitchs décrivaient comme absent quelque chose qui existe déjà**. Les fiches ci-dessus ont été réécrites pour ne décrire que le delta. Le tableau sert de garde-fou pour les prochains audits.

| Ce qu'on croyait absent | Ce qui existe déjà | Preuve |
|---|---|---|
| Fenêtres allumées la nuit | Présentes sur tous les bâtiments-moteur et sur le repli procédural legacy des maisons | `cityEngineSprites.js:1246`, `3162`, `3485` ; `engineSprites.js:105`, `1352` ; `buildingShapes.js:99` |
| Fumée de cheminée | Présente et déjà triée à la profondeur, sur les bâtiments-moteur | `cityEngineSprites.js:1237`, `2287`, `3211`, `3471` ; posée par `drawIsoEngineScene`, `isoRenderer.js:2753` |
| Aucune dégradation visuelle de la ville | Le plan se régénère par bande de crise, et le bake **legacy** intègre santé, usure et ruine | `cityMapRuntime.js:618-619` et `1333` |
| Infobulles maison inexistantes | `tipProps` existe et est consommé par 8 composants, mais la couche n'est montée que dans RegulationView | `HelpBubble.jsx:13-67`, `RegulationView.jsx:39` |
| Aucun retour après une absence | Une dépêche `idleResumeNarrative` est déjà émise, avec effondrements et ruines gagnées | `main.js:302-310`, `idleNarrative.js:48-62` |
| Cibles de sceaux mortes dans le code | `grPopulationTarget()` et `grEraTarget()` sont appelées par les `check()` des sceaux 4 et 10 | `grandResetMilestones.js:83` et `119` |
| Compte de sceaux réclamables non affiché | Affiché en toutes lettres dans le plateau | `GrandResetLadder.jsx:106-113` |
| Grand Reset réduit à 1,3 s d'écran gris | Un dialogue chiffré s'ouvre avant le reset : sceaux, production avant et après, multiplicateur de Ruines | `building.js:316-337` |
| Aucun bilan d'effondrement | Le chemin **manuel** affiche déjà une stèle-bilan (an, âge, pic) | `events.js:213-217` |
| Carte « Bientôt » inexistante | Elle existe avec nom, splash assombri et indice de cycle, et son mutisme est un choix documenté | `BuildingShop.jsx:207-239` |
| Aucun système de défis à règles altérées | Les 14 Mythes en sont un, complet, armé volontairement | `myths.js:312` et suivants |
| `captureFrame` force le plein jour | Il accepte déjà `opts.night` et `opts.health` | `cityMapRuntime.js:1478` |

Trois autres corrections de fait valent d'être retenues, parce qu'elles auraient fait perdre du temps :

- `normalizeRuleList` (`state.js:919-933`) **écrase** les champs réglés par le joueur au rechargement, il n'omet pas les défauts. Le risque était énoncé à l'envers dans la proposition d'origine de [C6](#c6).
- `epitaphRuinMultiplier` est appliqué à **trois** endroits, pas un (`events.js:148`, `events.js:233`, `main.js:218`). Toute majoration de moisson doit couvrir les trois, voir [D2](#d2).
- Le déclencheur d'auto-effondrement est **dupliqué** dans la simulation hors ligne (`main.js:205-207`). Tout nouveau mode doit y être ajouté aussi, voir [D11](#d11).

---

## Trois lots cohérents

Chaque lot est livrable seul et laisse le jeu dans un état sain.

### Lot 1. La ville habitée (visuel)

Ordre imposé par les dépendances : **A8, puis A1, puis A3, puis A7, puis A10**, avec A5 et A2 en options intercalables et A6, A11, A12 en seconde vague.

- [A8](#a8) Réglage Vie de la carte, à livrer en premier, c'est le garde-fou de tout le reste
- [A1](#a1) Fenêtres allumées la nuit, qui publie les boîtes écran dont dépendent A3 et A7
- [A3](#a3) Bâtiment survolé, plus la correction du hit-test des merveilles
- [A7](#a7) Fumée des habitations, triée dans la profondeur
- [A10](#a10) Permanence de la chute (tassement, gravats, suie, fumée longue)
- Optionnels : [A5](#a5) oiseaux, [A2](#a2) météo, [A6](#a6) saisons, [A11](#a11) nécropole, [A12](#a12) contemplation, [D8](#d8) cérémonie de Grand Reset, [D9](#d9) bilan de cycle

**Ce que ça change pour le joueur** : la ville cesse d'être une maquette. Elle s'allume le soir, fume, se salit, garde les cicatrices de ses chutes, et l'on peut la regarder sans interface. Un joueur sensible au mouvement peut tout couper sans perdre en netteté.

### Lot 2. Le confort de l'idle (jouabilité et absence)

- [B8](#b8) Pas de palier honnête et achat jusqu'au palier (corrige un affichage qui ment)
- [C5](#c5) Un Max qui achète vraiment tout
- [B11](#b11) Rapport de reprise chiffré après une absence
- [C2](#c2) Réserve d'absence visible, en encart statique
- [C10](#c10) Fin des fenêtres système et indicateur de sauvegarde
- [C13](#c13) Toasts bornés, fusionnés et cliquables
- [C6](#c6) Automates avec réserve, débit et catégorie Savoir
- [C12](#c12) Le Temple tourne aussi pendant l'absence, sous plafond par jeu
- Seconde vague : [C7](#c7) clepsydre, [C8](#c8) file d'achats, [C9](#c9) emplacements de sauvegarde, [C11](#c11) raccourcis clavier

**Ce que ça change pour le joueur** : une nuit d'absence devient une récolte qu'il peut lire, ce qu'il a acheté en automatisation sert enfin la nuit, les gestes les plus répétés du jeu (acheter en lot, sauvegarder) cessent de mentir ou de voler le focus.

### Lot 3. Comprendre ses chiffres (lisibilité et prise en main)

- [B9](#b9) Jauges chiffrées des sceaux du Grand Reset
- [B10](#b10) Badges d'attention sur les onglets
- [B1](#b1) Une seule infobulle dans tout le jeu, montée globalement et structurée
- [B2](#b2) Anatomie du multiplicateur global
- [B4](#b4) Débits à unité adaptative et convention de signe
- [B5](#b5) Délai avant achat et amortissement
- [B12](#b12) Format mixte et mantisse à largeur fixe
- [E9](#e9) Polices et glyphes autonomes hors ligne (défaut de distribution, à traiter dans ce lot)
- Seconde vague : [B3](#b3) Comptes de la cité, [B6](#b6) gain relatif, [B7](#b7) sparklines, [E5](#e5) états d'achat sans couleur, [E12](#e12) contraste, [E4](#e4) onglet Interface, [E8](#e8) ossature d'accessibilité, [E1](#e1) et [E11](#e11) prise en main

**Ce que ça change pour le joueur** : il sait où pousser (quel sceau, quelle branche, quel bâtiment), il sait combien de temps attendre, il comprend pourquoi sa production accélère ou ralentit, et il n'a plus à faire la ronde des onglets pour vérifier.
