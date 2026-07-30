# Plan — Tissu urbain : sortir de la nappe de voirie

Chantier ouvert le 2026-07-29, sur capture de Raph : « on a encore des gros micmacs
de routes, il faut une solution ». Réponse arrêtée : **level design**, pas réglage
du générateur ni de la mécanique d'achat (les deux ont déjà été tentés).

---

## 1. Le problème, en un chiffre

> ⚠ **CETTE SECTION A ÉTÉ RÉÉCRITE LE 2026-07-29 APRÈS MESURE.** La première version
> tenait pour acquis que la voirie occupait 75 % du sol, par une arithmétique de maille
> supposant des îlots d'une cellule. Le lot L0 a mesuré la vraie ville : **c'était
> faux**, et le chantier n'aurait pas visé le bon défaut. L'arithmétique de départ est
> conservée plus bas parce qu'elle reste juste *en tant que telle* — c'est sa prémisse
> (maille 2) qui ne correspondait à rien.

Mesuré par `__tissu()` sur une ville de démo représentative (1 528 bâtiments, grille
148, band 4, 12 698 cellules de sol de ville) :

| | mesuré |
|---|---|
| voirie | **30,9 %** |
| bâti | **21,9 %** |
| **vide** | **47,2 %** |
| maille | 3 cellules |
| îlots d'une seule cellule | 21,9 % |

Trois mesures aux tailles de ville différentes donnent la même histoire : la voirie
reste entre 22 et 31 %, le bâti **tombe** de 36 à 22 % quand la ville grandit, et le
vide **monte** de 41 à 47 %. Autrement dit :

> **Les routes ne sont pas trop nombreuses. C'est le VIDE qui est la plus grande
> surface de la ville, et il portait exactement la même matière minérale que le bâti.**

`kindAt` ne connaissait que `urban / grass / plaza / wonder` : une cellule de sol de
ville sans rien dessus était peinte comme une cellule bâtie. La ville se lisait donc
comme une nappe de pierre où les rues n'étaient qu'un motif un peu plus foncé — d'où
« des gros micmacs de routes » alors que le coupable était le fond.

Et ce vide n'est pas d'un seul tenant. Par distance au bâti le plus proche : **29 %** à
une cellule (l'arrière-cour d'un bâtiment), 18 % à deux ou trois, **43 % à cinq et
plus**. Cette dernière moitié n'est pas du tissu urbain du tout : `urbanSet` vient d'un
RAYON dérivé des compteurs (`organicLimit`), pas de ce qui est réellement construit. La
ville s'étalait en disque de pierre bien au-delà de sa dernière maison.

L'arithmétique de maille, pour mémoire (elle redeviendra utile au lot L1) : une
cellule-route est intégralement minérale (demi-chaussée `secondary` 0,25 × 2 plus
trottoir 0,22 × 2 = 0,94 de cellule), donc la part de voirie ne dépend que du pas entre
deux rues — 75 % à maille 2, 56 % à 3, 44 % à 4, 31 % à 6. La ville mesurée est à 3.

Trois causes secondaires, toutes visibles sur la capture :

1. **Les bâtiments flottent au centre de leur lot** (`isoRenderer` les ancre en
   `(gx + 0,5) × T`). Aucun front de rue, donc la rue n'est pas un couloir entre deux
   murs mais une clairière entre deux objets.
2. **Un lot vide est de la même famille minérale que la rue.** `kindAt` ne connaît que
   `urban / grass / plaza / wonder` : une cellule urbaine non bâtie porte la même
   matière que la cellule urbaine sous un bâtiment, et se lit comme du revêtement.
   Elle compte donc comme de la voirie à l'œil.
3. **Tout est identique partout.** Carrefours en croix à l'infini, un lampadaire par
   bord de rue qui souligne la maille, 90 % du réseau au même rang.

## 2. Principe directeur

> Rien ne s'ajoute **sur** la chaussée. Tout ce qu'on ajoute doit soit **manger** de la
> voirie, soit la **border**.

La chaussée est déjà trop présente : l'orner augmente le micmac. Ce principe tranche
tous les arbitrages du plan.

## 3. Ce sur quoi on s'appuie (rien à réinventer)

| Existant | Ce qu'il donne |
|---|---|
| `iso/isoPlaza.js` | **Le moteur d'emprise composée** : `isoPlazaBoxes` → boîtes de cellules, `isoPlazaCells`, `composeOne` (props ancrés, dimensionnés en TUILES), `isoPlazaItems` (poussés dans le tri peintre), `drawIsoPlazaProp`. C'est le socle des super-îlots : on généralise « place » en « emprise ». |
| `trimDemandlessRoads` (layout) | Émondage des routes qui ne bordent aucun bâtiment. Déjà là, ne mange que des feuilles. |
| `connectBuildingsToNetwork` + `state.roadDoors` | **La face qui ouvre sur rue est déjà calculée par bâtiment** (même choix que les allées de seuil, priorité S puis E puis O/N). C'est le vecteur du front de rue, gratuit. |
| `ISO_ROAD_HALFW` + `upgradeTrunkByUsage` | La hiérarchie des rangs existe (path 0,16 / secondary 0,25 / avenue 0,33 / main 0,36). Il manque la distribution, pas le mécanisme. |
| `cmBuildRoadGraph` | Réparation des coutures + **élagage de connectivité**. C'est lui qui validera qu'un super-îlot n'a coupé la ville en deux. |
| `kindAt` (isoRenderer) | Point d'entrée unique de la matière de sol par cellule, déjà mémoïsé. |

## 4. Les lots

Chaque lot est autonome et livrable seul.

---

### L0 — La mesure ✅ LIVRÉ

**Intention.** Sans chiffre, tous les lots suivants se jugent à l'œil et on se
racontera des histoires. C'est la leçon du lot « Comprendre ses chiffres » : une garde
qui ne mesure pas l'objet réel est décorative.

**Livré.** `src/game/map/tissuMetrics.js` (pur) + molette `__tissu()` + gardes dans
`__tests__/tissuMetrics.test.js` (attendus calculés à la main sur des grilles jouets).
Rend : parts voirie / bâti / vide, ventilation des matières VUES à l'écran, maille,
distribution des rangs, taille des îlots et part d'îlots d'une seule cellule.

**Ce qu'il a coûté et rapporté immédiatement.** Il a invalidé la prémisse du plan (cf.
section 1) au premier appel. Sans lui, le chantier aurait attaqué les super-îlots, un
gros lot, pour gagner une dizaine de points sur un chiffre déjà correct, pendant que le
vrai défaut — la moitié vide de la ville, peinte en pierre — serait resté intact.

**Le piège que la garde ferme.** Les compteurs de layout (voirie / bâti / vide) ne
bougent PAS quand on repeint un lot vide : ils décrivent le plan, pas l'image. Un
tableau de bord réduit à ces trois nombres aurait affiché « aucun changement » devant
une ville visiblement transformée. D'où la ventilation `surfaces` (minéral / cour /
friche), qui importe la règle du renderer au lieu de la recopier.

---

### L8 — Émondage des quartiers de rues vides ✅ LIVRÉ

**Pourquoi ce lot n'était pas au plan.** Il a été ouvert après le jalon A, sur capture
de Raph : « on a encore des carrés 2×2 pas très cohérents, il faudrait que ça n'arrive
plus ». Une fois le vide repeint en herbe (L2), ce qui restait sautait aux yeux : des
pans entiers de maillage viaire posés sur de la friche, qui ne mènent nulle part.
**Aucun lot du plan ne traitait ça** — L3, L4, L5 et L7 habillent la rue, L1 la
recouvre. Il fallait la SUPPRIMER.

**Pourquoi le trim existant ne pouvait rien.** Son propre commentaire le disait déjà :
« l'émondage ne mange que des feuilles, et une boucle n'en a pas ». Un quadrillage est
fait de boucles, chaque cellule y a deux voisines ou plus : le maillage était
littéralement immortel. Constaté dans la garde, pas supposé.

**Mesure de départ** (ville de 1 528 bâtiments, 4 000 cellules de rue) : 2 250 cellules
touchent un bâtiment, **471 sont à quatre pas ou plus de la moindre porte**, et l'arbre
minimal qui dessert tout ne pèse que 3 369 cellules — **631 de surplus, 15,8 %**. Peu en
proportion, très visible en pratique : le surplus est groupé en quartiers entiers.

**La règle.** On garde (1) tout ce qui est à `reach` pas ou moins d'une porte — le tissu
local, **boucles comprises**, une ville bâtie garde son quadrillage — et (2) l'arbre des
plus courts chemins de chaque porte vers le cœur, pour que la route de la ferme isolée
survive. L'union est connexe **par construction**, pas par espoir : un chemin de
longueur ≤ `reach` vers une porte n'est fait que de cellules elles aussi à ≤ `reach`,
donc conservées, et il aboutit sur une porte, qui est dans l'arbre. C'est cette preuve
qui évite une vérification de connexité par candidat, en O(n²).

**⚠ Le piège qui a mordu à l'écriture.** La remontée vers le cœur se gardait par « si
déjà conservé, arrêter ». Or toute porte est à distance 0 d'elle-même, donc déjà
conservée : la boucle sortait au premier pas et **aucun chemin n'était jamais tracé**.
Les quartiers lointains restaient conservés mais DÉTACHÉS. La preuve ci-dessus était
juste, son hypothèse ne l'était pas. Deux gardes de connexité l'ont attrapé.

**Sanctuarisé** : les cellules de `demand` (l'appelant y sème la travée du pont et les
emprises réservées) et les places, qui appartiennent au réseau sans desservir de porte.

**Effet mesuré.** Rues 4 000 → 3 581. Rues à quatre pas ou plus d'une porte : **471 →
165** (−65 %, le reste étant les corridors légitimes vers les bâtiments isolés). Voirie
32,3 % → 28,9 %. Et surtout : **bâtiments sans rue, 177 avant, 177 après** — l'émondage
ne prend rien à personne.

**Réglage.** `globalThis.__roadPruneReach` (défaut 2) ; `ROAD_PRUNE.on = false` coupe le
lot. ⚠ Les deux demandent un `__cityRecompute()`, c'est du layout, pas du rendu.

---

### L1 — Super-îlots (⚠ DÉCLASSÉ après mesure)

**Ce que la mesure a changé.** Ce lot était le cœur du plan tant qu'on croyait la
maille à 2. Elle est à **3**, et la voirie à **30,9 %** — déjà dans la cible que le plan
se fixait. Fusionner des îlots ferait passer la maille de 3 à ~5, soit une dizaine de
points de voirie en moins : réel, mais ce n'est plus le défaut principal, et c'est le
plus gros lot du plan. **Il passe après le jalon C.**

**Ce qui le garde vivant.** Un chiffre le justifie encore : **21,9 % des îlots ne font
qu'UNE cellule**. Ceux-là ne sont pas des pâtés de maisons, ce sont des plots, et c'est
exactement ce qu'on voit sur la capture d'origine. Le lot mérite donc d'exister, mais
CIBLÉ sur les grappes d'îlots dégénérés, pas appliqué à toute la ville.

**Intention (inchangée).** Fusionner 2 × 2 îlots en recouvrant la croix de rue
intérieure, et poser dessus une emprise composée.

**Détection.** Chercher les carrés de 2 × 2 îlots (puis 3 × 3 quand ça passe) dont les
rues intérieures sont éligibles. Une rue intérieure est **inéligible** si elle est :
un axe (`avenue` / `main`), un pont ou son approche, une place, la desserte unique
d'un bâtiment enclavé, ou une cellule de l'emprise d'une merveille. Le tirage est
**déterministe** (hash de la cellule d'ancrage + `mapSeed`) : un super-îlot ne doit
jamais changer de place entre deux recomputes, sinon la ville se réorganise à chaque
cran de zoom.

**Retrait de la voirie.** ⚠ Le point qui décide de la réussite du lot : les cellules
retirées sortent du `roadSet` **avant** `cmBuildRoadGraph`. Peindre par-dessus une
route encore dans le graphe ferait traverser le marché par les charrettes et les
piétons. `cmBuildRoadGraph` revalide ensuite la connexité ; **si un candidat casse la
connexité ou prive un bâtiment de sa porte, on l'annule** (rollback par candidat, pas
global).

**Contenu.** Une emprise typée, composée par le moteur d'`isoPlaza` : verger,
cimetière, marché, cour d'entrepôts, jardin clos, thermes, chantier, étang, bosquet,
enclos à bétail. Le type se choisit sur l'ère et la personnalité de ville
(`plan.archetype`, `personality`), pas au hasard.

**La clôture est obligatoire.** Muret, haie, palissade ou grille selon l'ère, sur tout
le pourtour. C'est elle qui fait lire l'emprise comme un îlot ; sans elle on a
remplacé un carrefour par une clairière, ce qui ne règle rien.

**Budget.** Nombre de super-îlots proportionnel au nombre d'îlots faiblement bâtis,
jamais à la population : une ville dense n'en a pas besoin, une ville étalée en a
besoin partout.

**Gardes.** Trois, toutes mesurées sur le layout : la connexité du réseau est
inchangée ; aucun bâtiment ne perd sa porte sur rue ; `roadShare` baisse d'au moins
15 points sur la ville de démo. Plus un test de déterminisme : deux calculs du même
état donnent les mêmes emprises.

**Effort.** Gros. **C'est le lot qui justifie le chantier.**

---

### L2 — Le lot vide cesse d'être minéral ✅ LIVRÉ — **c'est LE lot du chantier**

**Ce que la mesure a changé.** Promu de « gain secondaire » à cœur du chantier : il
repeint 41,4 points de sol de ville, soit près de la moitié de la surface. Aucun autre
lot du plan n'approche ça.

**Livré.** Un dégradé, pas une matière unique — c'est la mesure des distances au bâti
qui l'a imposé (29 % du vide colle au bâti, 43 % en est à cinq cellules ou plus) :

| distance au bâti | matière | lecture |
|---|---|---|
| ≤ `near` (1) | `urban` | le pavé du bâti et de son devant de parcelle |
| ≤ `far` (3) | `dirt` | la cour de terre battue, l'arrière du lot |
| au-delà, ou hors d'atteinte | `grass` | la friche : la ville n'est pas arrivée là |

**Ce qui rend le lot petit.** Aucun des deux kinds n'est nouveau : `dirt` et `grass` ont
déjà toute leur plomberie (tuile, `texAlpha`, frange d'herbe, voile). On ne change QUE
la cellule à qui on les donne. Le champ de distance (`builtDistanceField`, BFS
4-connexité à travers `urbanSet`) est mémoïsé sur le layout.

**Trois effets de bord traités dans le lot.**
- La **lisière qui divague** (`FRONTIER`) faisait serpenter la couture `urban`↔`grass`.
  Cette couture n'existe presque plus : c'est le bord de la cour qui doit divaguer, et
  une cellule reprise à l'herbe revient en TERRE, pas en pavé.
- Le **trottoir** se décidait sur `urbanSet`, donc une rue traversant des hectares
  jamais bâtis gagnait quand même ses dalles de centre-ville. Il demande maintenant au
  sol : hors du pavé, la rue reprend son ourlet de campagne.
- L'aplat de repli de `dirt` retombait sur le ton URBAIN (le kind n'étant plus produit,
  personne ne voyait le décalage) : recalé sur le ton mesuré d'`iso-dirt`.

### L2 v2 — quartiers au lieu de confetti (2026-07-30)

**Le retour.** Sur une mégalopole : « on n'a plus de quartier, et le retour des
multiples petits carrés de sol entre les routes ». Mesuré sur cette ville :
**364 taches de cour, médiane 1 cellule, 64 % d'une ou deux cellules.**

**⚠ La cause n'est pas celle qu'on croit, et je m'y suis trompé une fois.** Ce n'est
pas que le seuil « bavait » : c'est que **le réseau viaire découpe déjà le sol en
petits blocs** (une à quatre cellules entre deux rues). Dès lors, toute matière qui
change d'un bloc au voisin se lit comme un carré isolé, même si le critère est
parfaitement lisse. Le confetti vient de la TRAME DES RUES, pas du bruit du critère.
Corollaire qui dicte la solution : **la matière doit varier à une échelle plus grande
que le bloc**, ce qu'aucun critère local ne peut faire.

**Tentative écartée, et le test l'a démontrée** : fermeture morphologique (dilater
puis éroder). Sur des bâtiments PONCTUELS elle les restitue à l'identique — la
dilatation ajoute, l'érosion reprend exactement autant. Elle ne soude rien.

**Ce qui marche.** Décider sur la **densité bâtie lissée** : part de sol bâti dans un
carré de rayon 6, par table de sommes préfixées (quatre lectures par cellule, quel que
soit le rayon). Un champ moyenné sur 6 cellules varie lentement, donc deux blocs
voisins reçoivent presque toujours la même matière et les frontières deviennent de
grandes courbes. Au-dessus de `coreDens` le quartier, au-dessus de `ringDens` son
faubourg, en dessous la friche. Seuils calés sur la densité MESURÉE des villes du jeu
(8 à 11 % de sol bâti en mégalopole). Puis absorption des taches sous `minPatch`.

| | v1 (par cellule) | v2 (densité) |
|---|---|---|
| taches de cour | 364 | **19** |
| médiane | 1 cellule | **52 cellules** |
| taches minuscules | 64 % | **0 %** |

**Réglage.** `__cour({scale, coreDens, ringDens, minPatch})`.

**Effet mesuré (v1, conservé pour mémoire).** Sol de ville : minéral **100 % → 58,6 %**, cour 9,2 %, friche 32,2 %.
À l'écran, 19,2 % des pixels changent, caméra strictement identique (témoins
avant/avant à 0,7 %, après/après à 0,00 %). La ville gagne un **bord** : la forêt vient
au contact du tissu bâti au lieu que le dallage file jusqu'à la limite des compteurs.

**Reste à faire (v2).** Le contenu de cour : rangs de potager, tas de bois, souche,
poulailler, brouette, corde à linge. Deux règles dures héritées : ce qui varie d'une
cellule à l'autre est le **dessin**, jamais le **ton** ; et **jamais de décor à cheval
sur deux cellules**.

**Réglage.** `__cour(false)` rend la nappe minérale d'avant ; `__cour({near, far,
sidewalk})` déplace les contours.

---

### L3 — Front de rue ✅ LIVRÉ (poussé du sprite ; mitoyenneté restante)

**Intention.** Le geste qui transforme le treillis en tissu. Il ne supprime pas un
mètre de chaussée mais il change ce qu'est la rue : plus un vide, un intervalle.

**Livré.** Le bâtiment est ancré au coin SUD de son emprise et dessiné centré dessus.
Il est maintenant poussé vers SA rue de `FRONT.push` (**0,19 tuile**, choisi par Raph
sur planche des trois doses). Le recul passe derrière, en fond de cour.

⚠ 0,19 n'est pas un chiffre rond : c'est **toute la place disponible** devant une rue
ordinaire (0,5 − demi-chaussée 0,25 − `gap` 0,06). Monter le réglage au-delà ne ferait
plus rien, le rabotage rendrait la même valeur — une garde le vérifie, sinon un futur
« on pousse un peu plus » serait un no-op silencieux.

**Ce qui a rendu le lot petit.** La face sur rue était **déjà calculée**, mais enfouie
dans la boucle de dessin des allées de seuil. Elle est extraite en `isoBuildingFront`,
partagée par les deux : le sprite et son seuil désignent forcément la même façade,
sinon le trait sortirait d'un mur aveugle. Priorité S puis E puis O puis N (la porte
des sprites regarde la caméra), ni pont ni place, porte au MILIEU d'une longue façade.

**⚠ Le poussé se CALCULE, il ne se règle pas.** L'ancre du sprite est son point le plus
au sud, et la chaussée de la cellule d'en face commence à `0,5 − demi-largeur` de son
centre. Un poussé fixe qui va bien contre une rue (demi-largeur 0,25) plante le bâtiment
DANS un boulevard (0,36). D'où `isoFrontOffset`, qui rabote le poussé à
`0,5 − demi-largeur − gap` selon le rang d'en face. Vérifié sur les quatre rangs avec un
réglage volontairement trop gourmand.

**Et le tri suit l'ancre.** Le décalage est appliqué à la clé de profondeur du peintre
en même temps qu'à l'ancre : sans ça un bâtiment avancé se dessine devant son voisin
mais se trie derrière lui. Le survol suit tout seul — le hit-test lit la boîte
RÉELLEMENT dessinée (`houseBoxes`), qui vient de l'ancre décalée.

**Non fait : la mitoyenneté.** Fermer par un muret ou un portail le bord de rue laissé
nu entre deux bâtiments. C'est ce qui ferait le vrai mur de rue continu ; ça demande de
l'art (clôtures par famille d'ère), donc ça rejoint le jalon C.

**Réglage.** `__front(false)` recentre comme avant, `__front({push, gap})` dose.

**Vérifié (2026-07-30, harnais corrigé).** Le premier contrôle avait été fait sur
l'aplat de repli, tuiles non décodées — repéré par Raph. Repris avec attente de
décodage en temps réel, deux témoins **identiques au pixel** et effet à 24 % :
- **aucun empiètement** sur la chaussée, sur les 894 bâtiments poussés. La marge
  minimale tombe exactement sur le `gap` prévu (0,06 tuile) et c'est le rang
  `main` qui la fixe, comme le rabotage le prédisait ;
- **le survol suit** : 446 boîtes sur 476 se déplacent avec leur sprite, les 30
  autres n'ont aucune rue en face donc aucun poussé. L'invariant est constaté, plus
  seulement déduit du chemin de code.

**⚠ Ce que la vérification a aussi montré : l'effet est un COUP DE POUCE, pas un mur
de rue.** Le déplacement mesuré vaut 4 px à zoom 2, donc 2 px à zoom 1 — et ce n'est
pas un réglage timide, c'est toute la place disponible : l'ancre part déjà du coin sud
du lot et ne peut avancer que jusqu'au caniveau d'en face (0,19 tuile au mieux, 0,08
devant un boulevard). Le vrai mur de rue ne viendra donc PAS d'un poussé : il demande
la mitoyenneté (façades qui se touchent, muret fermant le bord nu), donc de l'art.

---

### L4 — Hiérarchie visible (⚠ MESURÉ, BLOQUÉ)

**Ce que la mesure dit.** La pyramide n'est pas seulement plate, elle est **à
l'envers**, et le coupable est identifié — les chantiers de voirie achetés :

| chantiers achetés | `main` | `avenue` | `secondary` | `path` | part de boulevard |
|---|---|---|---|---|---|
| 0 | 353 | 643 | 665 | 184 | 18,5 % |
| 8 | 549 | 886 | 614 | 201 | 23,8 % |
| 64 | **1 327** | 442 | 398 | 201 | **54,6 %** |

À 64 chantiers, **plus de la moitié du réseau est du boulevard** et les rangs
intermédiaires s'effondrent : `applyRoadWidenings` promeut des corridors entiers vers
le haut, sans plafond. Ce n'est pas qu'un problème de lecture, c'est de la SURFACE :
un `main` fait 0,36 de demi-chaussée contre 0,25 pour une rue, trottoir en plus.

**Pourquoi je n'y touche pas.** Le levier est `applyRoadWidenings` et le compteur de
chantiers, or `core/actions/roadWorks.js`, `RoadworksPanel.jsx` et `roadNetwork.js` sont
en cours de modification par une autre session. Toucher au même mécanisme en parallèle
est le meilleur moyen de casser les deux chantiers. **À reprendre quand celui-là
retombe** — la mesure ci-dessus est prête et le tableau de bord `__tissu()` la rend.

**Quoi, le jour venu.** Rééquilibrer la **distribution**, pas les largeurs. Beaucoup plus de `path`,
beaucoup moins de `secondary`, les avenues restent rares et deviennent des événements
(alignement d'arbres, terre-plein, bornes ou statues aux carrefours). Un `path` n'a
**ni trottoir, ni lampadaire, ni pavage** : terre ou gravier étroit. Une venelle qui ne
se lit plus comme une route disparaît dans le fond sans qu'on ait retiré une cellule.

**Garde.** Part de `secondary` sous un plafond mesuré ; le trottoir n'apparaît qu'à
partir de `secondary` (déjà `SIDEWALK_ISO.minBand`, à croiser avec le rang).

**Effort.** Petit à moyen, essentiellement du réglage de `upgradeTrunkByUsage` et de
`connectorRank`.

---

### L5 — Impasses et cœurs d'îlot

**Intention.** Casser la lecture en damier. L'œil prolonge les lignes tant qu'elles
traversent ; une voie qui meurt l'arrête.

**Quoi.** La desserte trace déjà un arbre de sentiers (bon), mais le squelette garde
des boucles. Autoriser explicitement des culs-de-sac, et **finir chaque impasse sur
une courette** avec un prop de cœur d'îlot (puits, banc, tas de bois, four). Une
impasse nue se lit comme un bug de générateur ; une impasse habitée se lit comme une
ville.

**Effort.** Moyen. Dépend de L2 pour le contenu.

---

### L6 — Éclaircir le mobilier ✅ LIVRÉ

**Intention.** Un mât tous les trois tronçons sur CHAQUE voie, sentiers de desserte
compris : le lampadaire posait une marque régulière sur tout le maillage et soulignait
la grille qu'on cherche à effacer.

**Livré.** Les rangs `path` ne s'éclairent plus (`LAMP_TUNE.paths`), et l'espacement
devient réglable (`LAMP_TUNE.step`). C'est aussi la bonne lecture : on éclaire les
rues, pas les arrière-cours. Molette `__lampTune({paths:true})` pour rejouer l'ancien.

**Garde.** `__tests__/courFriche.test.js` : aucun mât sur un `path`, des mâts sur la rue
voisine — et le contrôle inverse (le sentier promu en rue s'éclaire), sans lequel le
test se satisferait d'une ligne simplement mal formée.

**Effort.** Très petit, aucun art.

---

### L7 — Habillage de bord (en dernier)

**Intention.** La vie de rue, une fois que la rue a une forme. Livré avant, ça ajoute
du bruit à un problème de bruit.

**Quoi.** Sur l'accotement et le trottoir, **jamais sur la chaussée** : bornes,
abreuvoirs, puits, étals, caisses empilées, charrettes garées, linge tendu entre deux
façades, auvents. Arches et passages couverts qui enjambent les venelles (ils cassent
la perspective infinie d'une rue droite). Alignements d'arbres sur les avenues.

**Effort.** Élastique, à doser selon l'envie et l'art disponible.

---

## 5. Ordre de livraison

| Jalon | Lots | État |
|---|---|---|
| **A. Mesurer et dégonfler** | L0, L6, L2 | ✅ **livré** — le minéral tombe à 58,6 % du sol de ville, la ville gagne un bord |
| **A bis. Couper ce qui ne sert pas** | L8 | ✅ **livré** — les quartiers de rues vides disparaissent, sans toucher à la desserte |
| **B. Faire du tissu** | L3 ✅, L4 ⚠ bloqué, L5 | L3 livré (poussé du sprite) ; L4 mesuré mais bloqué par le chantier voirie d'une autre session ; L5 à faire |
| **C. Faire vivre** | L7, contenu de cour (L2 v2) | à faire — détail et grain |
| **D. Recoudre les plots** | L1, ciblé | à faire — les 21,9 % d'îlots d'une cellule |

L'ordre a changé après le jalon A : les super-îlots étaient le jalon B tant qu'on
croyait la voirie à 75 %. Elle est à 30,9 %, donc ils passent en dernier et deviennent
un traitement ciblé.

Chaque jalon se juge sur `__tissu()` **et** sur une capture avant/après au même
cadrage, jamais sur une seule des deux. ⚠ Le cadrage ne tient que si la caméra est
réépinglée à CHAQUE image (`cam.x/y/zoom` + `centered`) et si le cliché passe
`citizens:'none'` : sans ça, deux clichés du même réglage diffèrent de 15 %.

## 6. Art : la vraie longue traîne

Le code de tous ces lots est modeste ; les sprites ne le sont pas. Stratégie :

1. **Composer d'abord avec ce qui existe** (kit de props de places, arbres, buissons,
   murets, décors de cour). Le moteur d'`isoPlaza` dimensionne un prop en tuiles, donc
   un prop existant se replace dans une emprise sans retouche.
2. Ne générer que ce qui manque vraiment, en **familles d'ère** (3 familles, pas 10),
   et à la taille cible dès le départ.
3. Ordre de génération : clôtures (elles servent à L1, L2 et L3), puis props de cour
   (L2 et L5), puis pièces d'emprise spécifiques (L1), puis mobilier de rue (L7).

Chiffrage grossier : une douzaine de props de cour, une douzaine de clôtures et
portails sur trois familles, une vingtaine de pièces d'emprise. Rien d'insurmontable,
mais c'est le poste qui décide du calendrier.

## 7. Risques transverses

- **Perf.** Tout ce qui est plat va dans le **bake du sol** ; tout ce qui a une hauteur
  passe par le tri peintre (`pushItem`), chemin déjà emprunté par les places. La
  recuisson du sol coûte déjà 300 à 900 ms par cran de zoom : un lot qui ajoute des
  passes plates doit se mesurer au profileur (`__isoFrameProfile`,
  `__isoGroundProfile`), pas se supposer gratuit.
- **Déterminisme.** Emprises, contenus de cour et impasses se tirent sur
  `cmHash(cellule) + mapSeed`, jamais sur un compteur d'appel. Sinon la ville se
  réorganise au moindre recompute.
- **Agents.** Toute cellule retirée du réseau doit l'être **avant** `cmBuildRoadGraph`.
  Les piétons et véhicules lisent la géométrie publiée (`CM.isoVehLane`,
  `CM.isoPedEdge*`) : elle doit rester la source unique.
- **Sauvegardes.** Les super-îlots se recalculent, ils ne se stockent pas. Rien de
  nouveau à sérialiser.

## 8. Écarté volontairement

- **Décorer la chaussée.** Contraire au principe directeur.
- **Élargir les routes.** Aggrave le chiffre.
- **Réduire le réseau par la mécanique d'achat.** Déjà tenté, sans effet visible.
- **Réduire la maille dans le générateur.** Restait la solution évidente tant qu'on
  croyait la voirie à 75 %. Elle est à 28,9 % après L8 : la question ne se pose plus.

## 9. Périmètre : ce qui a bougé en cours de route

Le plan s'ouvrait sur « le générateur est hors périmètre, tout doit être additif »
(décision de Raph : « on n'arrive pas à corriger ce problème par le code ou la mécanique
d'achat »). Le lot L8 y déroge, et sciemment : devant les quartiers de rues vides, Raph
a demandé « il faudrait que ça n'arrive plus ». Décorer, recouvrir ou fondre une rue qui
ne dessert rien, c'est la garder ; la seule réponse au « que ça n'arrive plus » est de
la couper, et couper vit dans le générateur. Le reste du plan demeure additif.
