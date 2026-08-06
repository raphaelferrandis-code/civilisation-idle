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

### L4 — Hiérarchie visible (⚠ MESURÉ, BLOQUÉ — REMESURÉ le 2026-08-05, c'est LA cause du « brouillon »)

**Remesure du 2026-08-05** (ville band 4, retour Raph « c'est très brouilli brouillon »
sur une capture de jeu). Le compte des rangs, sur 2051 cellules-route :

| rang | cellules | part |
|---|---|---|
| avenue | 767 | 37 % |
| main (boulevard) | 463 | 23 % |
| path (venelle) | 552 | 27 % |
| secondary (la RUE ordinaire) | 196 | **10 %** |
| plaza | 73 | 4 % |

**60 % du réseau est en avenue ou boulevard, et la rue ordinaire a disparu** (10 %).
Or chaque avenue porte une chaussée large, deux trottoirs, leurs bordures, leurs
caniveaux, leurs joints et les allées de seuil qui s'y greffent. Le tissu n'a plus de
hiérarchie : tout est large, tout est strié, et les 31 % de sol non minéral (mesuré :
69 % `urban`, 13 % `dirt`, 18 % `grass`) s'intercalent en taches entre ces rubans.
C'est cela, le « brouillon » — pas la matière du sol ni le trottoir, qui viennent
d'être refaits, mais la DISTRIBUTION des rangs.

Le remède reste celui déjà écrit ci-dessous : rééquilibrer la distribution, pas les
largeurs. Beaucoup plus de `path`, beaucoup moins d'`avenue`/`main`, et l'avenue
redevient un événement. Le levier est `applyRoadWidenings` / `upgradeTrunkByUsage` ;
`roadWorks.js` n'est plus en cours de modification par une autre session (vérifié).

---

#### ⚠⚠ CE QUE LA MESURE A RENVERSÉ (2026-08-05) — À LIRE AVANT LE PLAN CI-DESSOUS

Le plan qui suit visait les CHANTIERS (`applyRoadWidenings`) et le robinet d'usage.
**Il visait à côté, et une mesure de trois minutes l'a montré** : en recalculant la
même ville avec `state.buildings.roads` à 0 puis à 40, la distribution des rangs est
IDENTIQUE au dixième. Les chantiers n'y étaient pour rien.

La cause était `connectorRank` (computeCityLayout) : **chaque corridor de desserte
d'un moteur était posé au rang de l'ÈRE** — `avenue` dès l'ère 20, `main` dès l'ère 30.
Il y a un corridor par moteur ; à l'échelle où la ville en compte des dizaines, la
desserte EST le réseau. D'où 40,7 % d'avenues à band 4 et 44,8 % de boulevards à band 6,
sans qu'aucun joueur n'ait rien demandé.

**Livré (2026-08-05)**, trois gestes, tous dans `layout.js`, tous derrière la molette
`__roadRanks({ connector, trunkUse, streetFoot })` :

1. **Le connecteur ne suit plus l'ère.** Ce que l'ère change, c'est la MATIÈRE de la
   chaussée, pas son RANG. La hiérarchie doit émerger, c'est la doctrine du fichier.
2. **Les moteurs se partagent selon leur EMPRISE** (`streetFoot`, défaut 4 = un 2×2) :
   une grande halle appelle une rue — livraisons, façade, adresse —, un petit atelier
   se contente d'une venelle. Tout en rue donnait 49 % de `secondary` (une ville dont la
   moitié des cellules porte deux trottoirs) ; tout en venelle donnait 66 % de `path`
   et plus un trottoir nulle part. L'emprise tranche, et elle tranche juste.
3. **Le tronc émerge PARTOUT.** `upgradeTrunkByUsage` était réservé au mode desserte
   (`if (skeletonKey)`) : les archétypes géométriques n'avaient aucun tronc émergent.
   Le défaut était masqué tant que les connecteurs arrivaient déjà en avenue.

**Résultat mesuré** (part des cellules-route, 40 chantiers) :

| band | avant (av / main / sec / path) | après |
|---|---|---|
| 2 | 0,5 / 22,5 / 38,5 / 35,7 | 0 / 21,3 / 18,2 / **57,7** |
| 4 | **40,7** / 20,0 / 9,8 / 25,3 | **1,1** / 19,7 / **30,2** / **44,9** |
| 6 | 12,7 / **44,8** / 17,4 / 22,8 | 9,1 / **41,1** / 15,5 / 31,9 |

Band 4 tient la cible visée (quelques boulevards du squelette, un tiers de rues, une
moitié de venelles). 70 fichiers de tests carte / 781 tests et 134 fichiers / 1578 tests
au total passent, lint propre.

**RESTE : band 6, où `main` tient encore 41 %.** Ce n'est plus la desserte mais le
SQUELETTE cosmique (`roadGraph`, superblocks des bandes 7+ et `runLineWide`), qui pose
ses axes identitaires en `main`. C'est un autre geste, sur un autre fichier, à mesurer
et à juger séparément — l'identité d'archétype est en jeu, on ne la rabote pas à
l'aveugle.

#### PLAN INITIAL (conservé pour mémoire — la cible était fausse, la méthode bonne)

**La cause mécanique, en une phrase.** `applyRoadWidenings` est appelée une fois par
chantier de voirie acheté et promeut à chaque fois LE tronçon le plus emprunté
(`secondary → avenue → main → autoroute`), **sans aucun plafond** ; et
`upgradeTrunkByUsage` réalimente le stock en promouvant `path → secondary` dès 30 %
d'usage, **sans plafond non plus**. À 60+ chantiers, la machine a donc mangé tout le
réseau. Rien n'est cassé : il manque une borne.

**CE QUI REND LE CHANTIER SÛR, et qu'il faut avoir lu avant de commencer :**

1. **Les rangs sont DÉRIVÉS, jamais persistés.** Ils sont recalculés à chaque
   construction de layout depuis les compteurs. Donc : aucune migration de sauvegarde,
   aucun état à réparer, et un retour arrière = remettre une constante.
2. **Le surplus de chantiers a DÉJÀ son issue.** Quand `applyRoadWidenings` ne trouve
   plus de cible, `roadWorksInfo.next` vaut `{kind:'done'}`, et `RoadworksPanel` bascule
   en mode RÉSERVE : l'achat affiche « +1 en réserve » et repartira quand la ville
   grandira. Un plafond en POURCENTAGE se relâche tout seul à mesure que le réseau
   s'étend — la réserve se vide d'elle-même. **C'est ce qui évite de transformer un
   plafond en achat mort.** À vérifier une fois en jeu, pas à supposer.
3. **Le tri par score reste intact.** Les artères qui survivent au plafond sont les plus
   empruntées : la hiérarchie ne devient pas seulement plus rare, elle devient
   SIGNIFIANTE (le tronc vers le pont reste large, la desserte redevient venelle).
4. **Le tableau de bord existe déjà** : `tissuMetrics` compte `rankCount` et l'imprime
   dans `__tissu()`. On mesure avant, on mesure après, on ne discute pas à l'œil.

**Les étapes, dans cet ordre.**

- **E0 — Figer le témoin.** Relever `__tissu()` sur trois tailles (band 2, 4, 6) et
  garder les chiffres dans ce document. Sans témoin, « c'est mieux » n'est pas une
  mesure. *Effort : minuscule. Risque : nul.*

- **E1 — Le plafond de promotion** (le cœur, ~20 lignes dans `applyRoadWidenings`).
  Une promotion est refusée si elle fait dépasser une part cible du réseau :
  `avenue + main ≤ wideCap` et `main ≤ mainCap`. Cibles de départ à régler à l'œil :
  **wideCap 18 %, mainCap 6 %** (contre 60 % et 23 % aujourd'hui). Tout dans une
  constante `ROAD_RANKS` en tête de fichier + molette `__roadRanks({wideCap, mainCap})`.
  *Effet attendu : avenue ~12 %, main ~6 %, et le reste rendu aux rues.*
  *Risque : les chantiers passent en réserve plus tôt — c'est prévu (point 2), à
  confirmer en jeu.*

- **E2 — Le robinet d'entrée** (`upgradeTrunkByUsage`). C'est lui qui fabrique les
  `secondary` que E1 va ensuite refuser de promouvoir ; le laisser ouvert ferait une
  ville de rues moyennes uniformes, ce qui est le même brouillon en plus clair. Deux
  réglages : seuil d'usage 0,30 → **0,45**, et plafond de part `secondary ≤ 35 %`.
  *Effet attendu : la venelle redevient majoritaire (~50 %), et une venelle n'a ni
  trottoir, ni lampadaire, ni mobilier — c'est ce qui retire le plus de stries.*

- **E3 — Les gardes.** Un test qui verrouille les plafonds sur une ville synthétique
  (100+ chantiers : la part de `main` ne doit pas dépasser `mainCap`), et relecture des
  tests qui dépendent de la distribution : `terrePlein` et `roadDivided` (le terre-plein
  n'existe qu'à partir d'`avenue`, les autoroutes se raréfient), `roadIsoHierarchy`,
  `roadDesserte`, `tissuMetrics`. *Ceux-là construisent leurs propres layouts, donc ils
  devraient tenir — à vérifier, pas à espérer.*

- **E4 — Réglage à l'œil, puis figer.** Captures A/B au même cadrage sur band 3 et 4,
  `__tissu()` avant/après, et Raph tranche les deux nombres. La molette reste.

**Ce que ce plan ne touche pas** (et ne doit pas toucher) : les LARGEURS par rang
(`ISO_ROAD_HALFW`, validées), la géométrie du trottoir, le tracé du réseau
(`roadGraph`), le coût des chantiers, et la banque de chantiers. Un seul mécanisme
change : qui a le droit d'être promu.

**Effort total** : petit à moyen — l'essentiel est deux plafonds et leurs mesures.
Le temps ira au réglage, pas au code.

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

### L7 — Habillage de bord ✅ LIVRÉ (v1 : le mobilier de trottoir)

**Intention.** La vie de rue, une fois que la rue a une forme. Livré avant, ça ajoute
du bruit à un problème de bruit.

**Quoi.** Sur l'accotement et le trottoir, **jamais sur la chaussée** : bornes,
abreuvoirs, puits, étals, caisses empilées, charrettes garées, linge tendu entre deux
façades, auvents. Arches et passages couverts qui enjambent les venelles (ils cassent
la perspective infinie d'une rue droite). Alignements d'arbres sur les avenues.

**Livré le 2026-08-05** (Raph : « il est temps de s'occuper des trottoirs », grief
« ils sont vides ») — [isoStreetProps.js](src/game/map/iso/isoStreetProps.js), corps pur
testable ; le renderer ne fait que lui donner la géométrie de rue et pousser ses items.

- **Aucun art nouveau.** Le kit des places porte déjà banc, bac et corbeille dans les
  cinq ères — un banc de trottoir et un banc de place sont le même objet. Le dessin
  (ancrage sur l'encre, ombre douce, découpe des halos) est celui de `drawIsoPlazaProp`,
  et les tailles sont celles des recettes de place, en multiples de la taille d'un habitant.
- **Quatre règles de pose**, chacune contre un défaut connu : jamais au-delà des deux
  bords de la bande ; jamais au centre de la cellule (le mât et l'allée de seuil y sont,
  et une marque centrée par cellule redessine la grille) ; une cellule sur deux et non
  toutes ; jamais sur une cellule qui porte déjà un mât du même côté.
- **Devant une façade.** Le premier jet semait le mobilier au hasard des rues, donc
  surtout le long des cours vides, où il ne se lit pas — 6 objets visibles pour 153 posés.
  On exige maintenant du bâti sur les trois cellules d'en face, et on préfère le côté
  NORD/OUEST : en vue 3/4, le trottoir sud passe DERRIÈRE la maison qui le borde.
- **Garde-fous** : plafond dur `max`, seuil de 2 px sous lequel l'item n'est pas même
  poussé (une mégapole en vue large en empilait 334 que le dessin jetait un à un),
  rien en LOD, compteur `__streetProps().poses` + `CM._streetPropsDrawn`.
- **Molette** : `__streetProps({ dens, pair, out, along, facade, scale, max })` / `(false)`.
  Le réglage fin (densité, quels objets par ère) est à figer à l'œil.
- **Test** : `__tests__/streetProps.test.js` reconstruit la croix de chaussée depuis le
  masque et vérifie qu'aucun objet n'y tombe — la garde ne se teste pas sur la formule
  qui l'a produite. (Il a d'ailleurs attrapé une inversion des bits N/E/S/W.)

**Reste du lot** (non fait) : étals et charrettes garées, linge et auvents entre façades,
arches au-dessus des venelles, alignements d'arbres sur les avenues.

---

### L9 — Clôtures : art livré, pose à faire

**Art livré** (2026-07-30) : `fence-{n,s,e,w}-{antique,medieval,industrial,modern,
cosmic}.png` dans `public/pixelart/iso/plaza/`, 20 fichiers, même pipeline que les
bancs (objet 8 directions → 4 diagonales écran → écrasement ×0,5).

**LA RÈGLE DE POSE, et elle suffit à écarter le risque :** une clôture ne se pose que
sur un bord qui **sépare deux matières différentes** — parvis ↔ rue, friche ↔ pavé,
quai ↔ eau, lot ↔ rue. Jamais entre deux cellules de même matière. À l'intérieur d'un
quartier homogène aucun bord ne qualifie, donc rien n'apparaît : **pas de nouveau
treillis**, ce qui annulerait la séance passée à en retirer un. Le champ de matières
de L2 sait déjà trancher.

**Ordre retenu** (du plus rentable au plus risqué) :
1. **parvis des merveilles** — un périmètre, quelques dizaines de panneaux, et le
   parvis cesse de finir sur une simple arête de matière ;
2. **quai et berge bâtie** — un garde-corps le long de l'eau est une LIGNE, pas une
   maille : aucun bruit de grille ajouté ;
3. **bord des grandes friches et cours** — 19 taches de médiane 52 cellules, donc peu
   de périmètres et longs : « une zone verte » devient « un parc » ;
4. **trou dans le front de rue** — celui qui paie le lot (mur de rue enfin continu, ce
   que le poussé de L3 ne peut pas faire), mais le plus nombreux : en dernier, sous
   plafond.

**🚫 Écarté** : autour de chaque maison (nouveau treillis), autour des places (une
place est publique, l'enclore en fait un enclos — des bornes aux angles si besoin),
autour des tours (leur emprise se lit déjà comme une enceinte).

**⚠ Deux contraintes techniques.**
- **Tri peintre, jamais la cuisson du sol.** Une clôture est par définition sur une
  arête, donc à cheval sur deux cellules — et un décor à cheval cuit dans le sol est
  rogné au défilement (le refus tombé sept fois sur la jonction herbe/ville). Dans la
  passe vivante, comme les lampadaires, le problème n'existe pas.
- **Un compteur avant de livrer.** « Ça alourdit » ne se teste pas, « tant de panneaux
  à l'écran » si. Compteur dans `__tissu()` et plafond dur, pour qu'une ère future ne
  puisse pas en faire pousser dix mille sans que ça se voie.

**⚠ À vérifier au branchement** : ces panneaux ont des poteaux d'about, donc deux
bouts à bout feront un double poteau. Plausible sur du bois, moins sur de la pierre.
Si ça jure, générer une variante « milieu de course » — mais le voir en jeu d'abord.

---

### L10 — Le trottoir ne se coupe plus pour une venelle ✅ LIVRÉ (2026-08-05)

**Le défaut.** Raph : « les raccords sont ratés ». Une venelle (rang `path`) n'a pas de
trottoir ; là où elle débouchait sur une rue qui en a un, la rue tendait son BRAS de
chaussée jusqu'au bord de cellule et le bras traversait la bande claire, la coupant net.
D'où les bouts de trottoir « orphelins » qui s'arrêtent au milieu du pavé.

**La mesure qui a tranché** (ville band 3, 1408 cellules-route, 538 rues à trottoir) :
**88 débouchés de venelle** contre 11 sorties de ville. Le cas dominant, et de loin.

**Livré.** En ville, un trottoir ne s'interrompt pas pour une ruelle : il passe DEVANT,
et c'est la ruelle qui vient buter dessus. Le bras est retiré du seul TRACÉ (masque `md`
dans le bake du sol, `isoRenderer`) : `cell.mask` reste intact, la connexité logique du
réseau ne bouge pas, les agents empruntent toujours la venelle, et celle-ci garde son
propre bras jusqu'à son bord de cellule — qui vient toucher le bord extérieur du trottoir.
Garde : on ne retire jamais le DERNIER bras, sans quoi une rue qui ne dessert que des
venelles deviendrait une plaque de trottoir carrée, sans chaussée.

**Molette** : `__sidewalkIso({ alleyThrough: false })` rejoue l'ancien tracé (A/B immédiat).

**Reste sur les raccords** : les 11 bouts francs en sortie de ville (le trottoir s'arrête
au carré près), et l'épaulement gris des venelles qui traversent une cour pavée — visible
comme un rectangle isolé, sans chaussée lisible autour.

---

### L11 — Le trottoir a une matière ✅ LIVRÉ (2026-08-05)

**Le défaut.** Raph : « le trottoir iso détonne trop de par le fait qu'il soit lisse et
pas pixel ». Vérifié au zoom ×8, et c'était exact et net : la chaussée est une TUILE
d'art blittée 1:1, le sol de ville aussi, les toits sont des escaliers de 2×1 px — et le
trottoir était le dernier APLAT de couleur de toute la carte, avec un bord tracé au
vecteur. Au ras d'un toit dessiné, ça se lit comme un ruban de papier posé sur le jeu.

**Livré.** La bande porte maintenant sa matière, par le même mécanisme que la chaussée :
on CLIPPE sur la bande et on blitte une tuile 64×32 par cellule, en coordonnées monde
(un seul clip pour tout le réseau, contre un par cellule pour la chaussée). Miroir par
hash pour casser la répétition, dose et voile réglables.

**L'art** (`fetchGroundTiles.mjs`, lot 87181e58, `create_tiles_pro`) : `walk-stone`
(calcaire clair, petites dalles en rangées décalées, bandes 2-5) et `walk-granite`
(petits carrés gris, bandes 6+), 4 variantes chacune, égalisées à 0,2 et 0,3 de
luminance, losange rempli à 100 %.

**⚠⚠ LA LEÇON DU LOT, et elle est géométrique, pas esthétique.** Première version
livrée avec ces deux pierres à appareillage régulier ; retour immédiat de Raph :
« et puis ça n'est pas droit ». Il avait raison, et la cause est structurelle :

> Le motif d'une tuile suit les axes de son IMAGE. Or l'axe horizontal d'un losange
> iso est la **diagonale du monde**, tandis qu'une rue suit X ou Y. **Un dallage
> régulier cuit dans une tuile arrive donc toujours à 45° de la rue.** Aucun miroir
> ni aucune variante ne redresse ça — le miroir échange X et Y, il ne tourne pas
> de 45°.

D'où la règle, qui vaut pour toute bande orientée (trottoir, quai, terre-plein) :
**la tuile ne donne que le GRAIN, l'appareillage se trace dans le repère de la rue.**
En pratique : matière ISOTROPE (pavé irrégulier, aucune rangée lisible) en dose sur
l'aplat, et les joints transversaux — qui vivaient déjà là, à alpha 0,12 et sur un
demi-pixel écran, c'est-à-dire invisibles — remontés à la largeur d'un PIXEL D'ART
(T/32 en monde, l'unité des tuiles) et assez appuyés pour se lire. Ils suivent l'axe
de la rue par construction, donc ils sont droits quelle que soit son orientation.

`walk-stone` et `walk-granite` restent dans `public/` comme CONTRE-EXEMPLE
branchable (`__sidewalkIso({tile:'walk-stone'})`) : c'est en une seconde qu'on revoit
le motif en biais et pourquoi il ne va pas.

**Ce que l'essai a appris par ailleurs :**
- **Une matière de trottoir n'est pas une matière de sol.** Elle est vue dans une bande
  de 0,22 tuile (~7 px à zoom 1). Le dallage de place (`iso-plaza-*`), essayé en place le
  temps de valider la mécanique, n'y rend que des taches : ses arcs sont dessinés pour un
  carré de 4×4 cellules. Il faut une pierre PETITE.
- **La tuile doit donner le TON, pas seulement le grain.** Posée en dose sur l'ancien
  aplat clair, elle se lavait ; posée pleine avec le ton mesuré de la matière comme aplat
  de repli, la bande tient toute seule.
- **Deux des quatre matières du lot étaient mortes-nées, et la mesure l'a dit avant
  l'œil** : 0,0 et 0,7 d'écart de luminance entre leurs quatre variantes, c'est-à-dire
  quatre tuiles identiques. Leur prompt demandait « fine straight joints » et « fine
  grain » : le modèle a rendu deux aplats avec une croix de joints — exactement ce qu'on
  cherchait à remplacer. **Demander des PIERRES, jamais un grain ni des joints.**

**Molette** : `__sidewalkIso({ tile: 'walk' | 'plaza' | 'urban' | false, tileA, tileVeil })`.

**⚠⚠ TOUT CE QUI SUIT A ÉTÉ RETIRÉ LE JOUR MÊME — lire d'abord la remise à plat.**
Raph, quelques minutes après la marche : « techniquement il n'y a pas de sol mais
trottoir et maison, donc pas de sens que le trottoir ait une apparence différente du
sol. Il faut effectivement la marche mais après bam, du sol ».

**LE SOL DE VILLE *EST* LE TROTTOIR.** Ce qui borde une rue n'est pas une bande
rapportée, c'est le sol de la ville qui court jusqu'au caniveau — et la seule chose qui
les sépare est la MARCHE. Sont donc partis, avec leur code et leur art : l'aplat de la
bande, sa matière dédiée (`walk-stone` / `walk-granite`, PNG supprimés, lot marqué
ÉCARTÉ dans `fetchGroundTiles.mjs`), la table de tons par bande, l'appareillage
transversal, le liseré de rive et le réglage de valeur `toneK`. **Le lot L11 ci-dessus
n'a donc plus d'objet** ; il reste écrit pour ses deux leçons, qui elles valent toujours
(un dallage cuit dans une tuile iso arrive à 45° de la rue ; « fine grain » dans un
prompt rend un aplat).

Ce qui subsiste tient à la limite caniveau ↔ sol, **côté rue uniquement**. La géométrie
`SIDEWALK_ISO.w` reste, mais elle ne peint plus : elle publie aux agents où marchent les
piétons et où se pose le mobilier.

**⚠⚠ ET LA MARCHE N'A QU'UNE FACE — la perspective dit laquelle** (Raph : « on doit
respecter la perspective, où est le problème ? »). La première version posait le même
trait sur les DEUX bords d'une chaussée, nez clair et ombre de part et d'autre : la
bordure « montait » des deux côtés à la fois, ce qui ne peut pas exister. En 3/4, on ne
voit que les faces tournées vers +x et +y. Pour une rue est-ouest, le trottoir NORD
présente à la chaussée une face orientée +y : elle est vue, il faut en dessiner la
tranche. Le trottoir SUD est entre la caméra et la rue, sa face regarde −y : elle est
cachée, il n'y a rien à y peindre. Idem sur l'autre axe (ouest vu, est caché) — c'est
toujours le bord `side < 0` de `runEdges`.

Donc, sur ce seul bord : une TRANCHE sombre de `stepH` pixels d'art qui descend dans la
chaussée, surmontée du NEZ éclairé. Le sol reste à plat ; c'est la tranche seule qui
raconte le dénivelé.

**⚠⚠ ET ELLE S'INTERROMPT AUX CROISEMENTS** (Raph : « attention, ça crée des rues
FERMÉES au milieu du sol »). Un bord de run est tracé sur toute sa longueur : il passait
donc AU-DESSUS des chaussées perpendiculaires. Les marches se rejoignaient d'un run à
l'autre et refermaient un quadrillage continu — des cadres posés sur le sol, au lieu de
rues qui débouchent. Au droit d'une chaussée (`onRoadway`, testé sur le masque de TRACÉ
et non le masque logique, caniveau compris), le trottoir cède le passage — c'est le
passage piéton — et la marche reprend de l'autre côté.

*Note de méthode : la première hypothèse était que ces cadres venaient de rues qui ne
desservent rien. Mesuré avant de coder : seules 3,2 % des cellules-route (band 4) n'ont
aucun bâtiment à deux cellules, et les grands îlots vides sont déjà classés en friche
(100 % `grass`) et situés en périphérie.*

**⚠⚠ ET CE N'ÉTAIT PAS LE GRIEF DE RAPH NON PLUS.** Retour après coup : « le problème
n'a pas changé, c'est toujours là ». Les cadres qu'il voit sont dessinés par les
CHAUSSÉES elles-mêmes, pas par la marche — couper la marche aux croisements est juste,
mais ne pouvait rien y faire. La bonne mesure, enfin trouvée, est **le nombre de
bâtiments sur les huit voisines de chaque cellule-route** :

| band | cellules-route | sans AUCUN bâti voisin | bordées d'un seul côté |
|---|---|---|---|
| 3 | 1 673 | 139 (8,3 %) | 34 % |
| 4 | 1 767 | 194 (11,0 %) | 36 % |

**Trois leviers essayés et mesurés, trois échecs** — à ne pas refaire :
- `ROAD_PRUNE.reach` (2 → 1 → 0) : 1 767 / 1 758 / 1 765 cellules. Levier mort, son arbre
  des plus courts chemins couvre déjà tout.
- Un **émondage par points d'articulation** (les cellules sans bâti voisin dont le retrait
  ne coupe pas le réseau) : **7 cellules retirées sur 1 901**, soit 0,4 %. Les rues d'un
  cadre bordent des maisons de leur côté EXTÉRIEUR — elles ne sont même pas candidates —
  et celles qui traversent un vide en ligne sont des articulations, donc protégées. Les
  110 lignes écrites ont été retirées plutôt que gardées en code mort.
- Un flood fill sur le sol non-route pour compter les « îlots vides » : il relie tout en
  un îlot géant de 25 961 cellules et ne voit que les poches hermétiquement closes.

**Ce que la mesure dit vraiment : le vide est à l'INTÉRIEUR des blocs.** La maille est
trop fine pour le nombre de bâtiments — les rues sont légitimes une à une, c'est leur
DENSITÉ qui l'est moins. Le levier structurel est donc l'espacement des rues (lot L1,
« super-îlots », déclassé en juillet après mesure — à rouvrir avec ces chiffres-ci) ou
la densité de bâti.

**⚠ ET CE N'EST PAS UNE RÉGRESSION DU LOT L4** (Raph : « quel changement a fait ça ? »).
Remesuré en rejouant l'ancien réglage : `connector: 'avenue'` donne 1 770 cellules dont
211 sans bâti voisin (11,9 %), `connector: 'secondary'` en donne 1 771 dont 218 (12,3 %).
**Ces rues étaient là avant, en même nombre.** Ce qui a changé, c'est leur LARGEUR :
c'étaient des avenues couvrant presque toute leur cellule, ce sont maintenant des
venelles. Le vide qu'elles traversent était masqué par leur propre épaisseur — le
rééquilibrage n'a rien créé, il a démasqué. L'ancien nom du même défaut était
« c'est très brouillon ».

#### ✅ LIVRÉ (2026-08-05) — une voie sans façade n'est plus une rue

Faute de pouvoir les supprimer, on leur retire l'APPARENCE d'une rue. Une cellule-route
sans aucun bâtiment sur ses **huit** voisines (diagonales comprises : une maison en biais
d'un carrefour le borde tout autant) perd :
- son **trottoir** — elle repasse dans `shRoads` et reprend l'ourlet + l'épaulement de
  campagne, donc plus de marche ni de bordure ;
- son **mobilier** — même test dans `isoStreetProps` ;
- son **lampadaire** — filtré dans `isoLamps` (et non dans `computeIsoLamps`, qui reste
  testable sans layout bâti). De nuit c'était le signal le plus visible du défaut : un mât
  allumé au milieu de rien.

Le helper `builtNear(L, gx, gy)` est mémoïsé par layout, comme `builtCells`. Garde : si le
plan ne connaît aucun bâti (tests, plan vide), il répond `true` — on ne prive de rien une
carte dont on ignore le contenu.

#### LE FOND DU SUJET, MESURÉ — et il n'est pas dans les rues

Le **remplissage des îlots** (part des cellules urbaines non-route qui portent du bâti) :

| band | archétype | cellules de sol | bâties | remplissage |
|---|---|---|---|---|
| 2 | linear | 5 097 | 2 092 | **41,0 %** |
| 3 | linear | 6 111 | 2 276 | 37,2 % |
| 4 | radial | 8 580 | 2 387 | 27,8 % |
| 6 | megalopolis | 25 889 | 4 573 | **17,7 %** |

**L'emprise urbaine grandit cinq fois plus vite que le bâti.** À la mégalopole, 82 % du
sol de ville n'a rien dessus. Le réseau quadrille cette emprise : les « rues au milieu de
nulle part » en sont la conséquence arithmétique, pas la cause. Aucun réglage de voirie
ne peut réparer ça — c'est le rapport entre le rayon de la ville et son nombre de
bâtiments.

**Deux leviers, et le second est déjà en place et sans risque structurel :**
1. **Le rayon urbain** (`organicLimit` ← `cityReachBase`). Le réduire resserre la ville,
   mais la taille apparente est un feedback de progression : à ne pas toucher sans
   décision explicite.
2. **`COUR.coreDens`** — le seuil de densité bâtie locale au-dessus duquel le sol reste
   PAVÉ. À 0,07 (défaut actuel) il laisse presque tout en pavé alors que le remplissage
   moyen est de 18 à 28 %. Mesuré, part du sol en pavé / cour / friche :

   | coreDens | band 4 | band 6 |
   |---|---|---|
   | 0,07 (actuel) | 70 / 12 / 18 | 44 / 7 / 49 |
   | 0,14 | 54 / 27 / 19 | 37 / 14 / 49 |
   | 0,22 | 44 / 38 / 19 | 31 / 20 / 49 |
   | 0,30 | 37 / 44 / 19 | 27 / 24 / 49 |

   Monter ce seuil ne touche ni au réseau, ni au bâti, ni au rayon : seule la MATIÈRE du
   sol change, et les rues qui traversent du vide se retrouvent sur de la terre plutôt
   que sur du pavé de centre-ville — ce qui les accorde au traitement livré ci-dessus.
   **Molette `__cour({coreDens})`, à juger en jeu** : c'est un arbitrage esthétique
   d'ensemble (44 % de pavé au lieu de 70 %), pas un correctif de bug.

---

### L13 — Les bâtiments se groupent par TYPE (✅ moteurs LIVRÉS ; habitations = art)

**Le grief** (Raph 2026-08-05) : « les îlots sont trop denses, surtout car il n'y a qu'un
type de bâtiments. C'est bizarre d'avoir toutes les guildes au même endroit (ça vaut pour
tous les bâtiments hein) ».

**Mesure du groupement** — pour chaque cellule bâtie, part de ses voisines (rayon 2) qui
portent la MÊME identité. Repère : un mélange parfait entre N types donne 1/N.

| band | | types distincts | voisins de même type | mélange parfait |
|---|---|---|---|---|
| 4 | moteurs | 29 | **57,6 %** | 3,4 % |
| 5 | moteurs | 29 | **59,5 %** | 3,4 % |
| 6 | moteurs | 29 | **59,7 %** | 3,4 % |
| 4 | habitations | **3** | 53,8 % | 33 % |
| 6 | habitations | **4** | 41,4 % | 25 % |

**Deux causes distinctes, et elles n'ont pas le même remède :**

1. **Les moteurs sont massivement groupés** : 29 types disponibles, et six voisins sur dix
   sont du même. C'est ça, « toutes les guildes au même endroit ». Le placement pose les
   instances d'un type à la suite (`placeRequest` sur les slots triés par
   `cmMapSlotPriority`), donc chaque type occupe un bloc. À noter : le plan a un système
   de QUARTIERS thématiques (`plan.anchors[].kind`, `quarterKindAt`) — une dominante par
   quartier est voulue, mais 60 % n'est plus une dominante, c'est un monopole.
   *Remède : entrelacer les types au fil des slots (alterner au lieu d'épuiser un type
   avant de passer au suivant), en gardant une dominante de quartier plus douce.*

2. **Les habitations n'ont que 3 ou 4 variantes par ère** (`VARIANTS_HOUSE`,
   buildingGenerator.js). Là, aucun placement ne peut sauver la variété : c'est de l'ART
   qui manque, pas du mélange. Le léger sur-groupement (41 % contre 33 % attendu) est
   secondaire devant ce chiffre-là.

#### ✅ LIVRÉ pour les moteurs (2026-08-05) — un écart minimal entre bâtiments d'un même métier

`ENGINE_SPREAD` (layout.js) : deux instances du même type ne se posent plus à moins de
`gap` cellules l'une de l'autre. **Mesuré : 28 % → 14 % de voisins du même type.**
611 bâtiments posés dans tous les cas, recompute pas plus lent.

**La forme finale est un AJUSTEMENT LOCAL, et les deux tentatives précédentes disent
pourquoi.** Le choix de cellule reste exactement celui d'avant ; on se contente ensuite de
faire GLISSER le bâtiment vers la plus proche cellule qui respecte l'écart, dans un rayon
borné. Les deux formes plus ambitieuses ont été écrites, mesurées, puis jetées :
- **mêler l'écart au filtre du choix initial** → un bâtiment sortait de la zone que la
  desserte sait raccorder : « aucun bâtiment servable sans rue » tombait ;
- **chercher la cellule écartée en reparcourant les candidates** → le résultat dépendait
  de la taille du top-K, et l'invariance « le top-K élargi pose la même ville » tombait.

**⚠⚠ Et le glissement ne s'applique qu'à la PREMIÈRE POSE.** Un bâtiment rappelé par son
slot mémorisé ne glisse jamais : `sameTypeCells` se remplit dans l'ordre du placement, qui
diffère d'un recompute à l'autre (les slots passent avant les poses neuves) — un
glissement rejoué ferait bouger les bâtiments déjà posés à chaque recalcul de la carte.
C'est `urbanGroundCoversBuildings.test.js` qui l'a attrapé, en comparant deux calculs
successifs.

**Le curseur est borné par les contrats, pas par le goût** : `gap 6/reach 12` (7,9 %) et
`gap 6/reach 16` (2,7 %) sont plus beaux et cassent tous deux la desserte et le sol sous
les bâtiments. `gap 5/reach 8` est le dernier cran admissible.
Molette : `__engineSpread({ gap, reach })` — 0 rejoue le comportement d'avant.

**⚠ Les positions déjà mémorisées ne bougent pas** (`cityMapSlots`) : sur une partie en
cours, l'effet n'apparaît que sur les bâtiments neufs. Une ville repartie de zéro le montre
d'emblée.

**Reste le point 2** (habitations, 3-4 variantes par ère) : c'est de l'art, pas du
placement.

#### ⚠ « Est-ce à cause de tes modifications qu'on a à nouveau ces carrés de routes ? »

Non — mesuré en rejouant l'état d'avant, sur une capitale band 6 (part des cellules-route
appartenant à une ligne DROITE traversant la ville) :

| | cellules-route | lignes traversantes | part en ligne |
|---|---|---|---|
| état d'origine | 3 820 | 46 | **85,9 %** |
| rangs seuls (L4) | 3 820 | 46 | **85,9 %** (identique au chiffre près) |
| écartement seul (L13) | 3 832 | 53 | 87,7 % |
| les deux | 3 832 | 53 | 87,7 % |

**Le rééquilibrage des rangs ne touche pas le tracé d'un iota** — c'était prévisible, il
ne change que le RANG d'une cellule, jamais son existence. L'écartement des moteurs ajoute
12 cellules et 7 lignes (+1,8 point) : des connecteurs un peu plus longs vers des
bâtiments plus dispersés. Marginal.

**Le quadrillage est la STRUCTURE de l'archétype**, et il était là avant : `capital` et
`megalopolis` tracent une grille d'avenues (`roadGraph.js`, `spacing = 5 ou 6 + superMesh`,
jusqu'à 5 voies de chaque côté du grand axe). 86 % des cellules-route étaient déjà dans une
ligne traversante. Ce que les rangs ont changé, c'est que ces lignes, devenues fines, se
LISENT comme un quadrillage au lieu de se fondre en nappe — même mécanisme que pour les
« rues au milieu de nulle part ».

**Le levier, si le quadrillage doit s'assouplir** : `spacing` et `lanes` dans la branche
capital/megalopolis. ⚠ Mais la grille régulière est une DEMANDE de Raph du 2026-08-03
(« de grosses mégalopoles d'immeubles tel cyberpunk, ou ce qu'on voit en Chine », cf. §10
Superblocks) — l'assouplir, c'est revenir sur cette intention, pas corriger un défaut.

**Bilan de code : 192 lignes de rendu remplacées par 40**, plus la table de matières et
sa résolution de tuile retirées. 143 fichiers de tests / 1654 tests passent, lint propre.

<details><summary>Détail de la version à bande (retirée) — conservé pour l'historique</summary>

**LA MARCHE (2026-08-05, « qu'ils se différencient plus du sol »).** Le trottoir était
une bande PLATE, distinguée du sol par sa seule valeur — et l'écart mesuré n'était que
de ~25 points de luminance. Or un trottoir se lit d'abord parce qu'il est SURÉLEVÉ.
Trois traits d'un pixel d'art, et pas un de plus (une bordure épaisse redeviendrait une
bande, donc un motif) :
- **nez de bordure** — arête claire sur la limite trottoir ↔ caniveau, le dessus de la
  marche qui prend la lumière ;
- **ombre portée** — un pixel sombre JUSTE SOUS ce nez, du seul côté qui fait face à la
  caméra : c'est elle qui creuse, et c'est elle qui fait tout le travail. Sans elle,
  l'arête claire flotte ;
- **joint de rive** — trait sombre au bord extérieur, contre le sol : la coupure franche
  qui empêche la bande de fondre dans le pavé.

Plus un second levier, la VALEUR : `toneK` (défaut 1,08) ouvre l'écart au sol. Les deux
ensemble suffisent ; l'un sans l'autre laisse le trottoir mou.
Réglage : `__sidewalkIso({ stepA, stepLight, stepShade, rimA, toneK })` — `stepA: 0`
rend le trottoir plat.

</details>

**Réglage actuel** : `__sidewalkIso({ stepA, stepH, stepLight, stepShade })` —
`stepA: 0` supprime la marche et rend la rue à ras du sol, `stepH` est la hauteur de la
tranche en pixels d'art (défaut 2).

---

### L12 — Plus un seul trait vectoriel sur le trottoir ✅ LIVRÉ (2026-08-05)

**Le défaut, dans les termes où il se pose.** Raph : « je ne veux plus de tracé au
vecteur ». Le sol est fait de TUILES blittées à `k = T·z/32` : un pixel d'art y occupe
z pixels de canvas. Les couches du trottoir, elles, étaient des `fill()` de quads
projetés, donc rastérisées à la résolution du CANVAS, avec un bord antialiasé d'UN
pixel. À zoom 3, la bande était bordée d'un trait **trois fois plus fin que le plus
petit détail de l'art qui l'entoure**. « Lisse et pas pixel » n'était pas une affaire
de couleur : une affaire de RÉSOLUTION.

**Livré.** Toute la passe trottoir (joint de raccord, bande, matière, appareillage,
bordure, caniveau) est peinte dans un CALQUE à l'échelle de l'art — zoom 1, une cellule
y fait 64×32 px, la taille native d'une tuile — puis reposée ×z en NEAREST. Chaque trait
devient un bloc de z pixels, exactement comme un pixel de tuile : bords en marches,
aucun demi-ton. Bénéfice second : la matière y est blittée à **1:1 exact** (k = 64/64),
donc sans rééchantillonnage du tout.

**L'alignement est exact, et c'est ce qui rend la manœuvre sûre.** Dans le calque
`sx = (u − u_cam) + wArt/2` ; on le repose en `ox + sx·z` avec `ox = cw/2 − wArt·z/2`,
ce qui redonne `(u − u_cam)·z + cw/2` — la projection du bake, au bit près. Aucun
décalage à compenser, aucune dérive au défilement.

**Les joints ont dû changer de méthode.** Un quad d'un pixel de large tracé dans le
calque ressort PÂLE : l'antialiasing étale son alpha sur deux pixels et il ne reste
rien du trait. Ils sont maintenant posés en `fillRect` entiers, en **escalier 2:1** —
la pente exacte de la projection d'un axe monde — avec dédoublonnage pour qu'une marche
repeinte ne double pas son alpha.

**Coût mesuré**, en alternant pixel/vecteur d'une recuisson à l'autre (le seul A/B
honnête ici), bake de 346 cellules à zoom 3,24 : **0,7 ms en pixels contre 0,4 ms au
vecteur**, sur ~10 ms de bake total — et le bake ne tourne qu'à la recuisson, pas par
frame. Le calque fait cw/z × ch/z, soit ~1/z² de surface à rastériser : ce qu'on perd à
composer, on le regagne à peindre.

**Étendu à TOUTE la voirie** dans la foulée (Raph : « oui je veux bien » pour le
reste) : ourlet, épaulement, rubans de chaussée, frange, marquage et allées de seuil
passent par le même calque. Il n'y a plus un seul bord de voirie à la résolution de
l'écran. Coût mesuré, alterné : passe route **2,4 ms en pixels contre 1,9 ms au
vecteur**, total du bake inchangé dans le bruit de mesure.

**⚠ Le cull de tranche se fait AVANT la bascule.** `ISO_GROUND_SLICE` borne des px
écran DU BAKE ; sous le calque, `worldToScreen` répond dans un autre repère et le test
deviendrait faux en silence (cellules peintes hors tranche, ou tranche vide). La liste
`roadsVis` est donc figée avant d'ouvrir le calque.

**Molette** : `__roadMat({ pixel: false })` rejoue l'ancien tracé vectoriel.

**Reste** : une matière claire pour la mégalopole (le granit était plus sombre que le
béton du sol, d'où le repli sur `ground-concrete`) et une matière tech pour les bandes
7+. Et la même question se pose maintenant pour les AUTRES tracés vectoriels du sol —
épaulement de campagne, allées de seuil, terre-plein : ils ont le même défaut de
résolution, et le calque leur est directement applicable.

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

## 10. REPRISE 2026-08-03 — la mégalopole (chantier ÉCHELLE, suite)

(Section ajoutée après coup — elle suit chronologiquement le §9.)

Retour Raph sur captures bande 8-9 : « on a toujours le problème des places et
des routes qui font la taille d'un immeuble ». Le contexte a changé depuis §8 :
le bâti cosmique fait désormais 7-14 tuiles de haut (docs/PLAN-ECHELLE.md) et le
grief n'est plus le POURCENTAGE de voirie (12,7 % mesuré en bande 8, archétype
capital, maille 6) mais le GRAIN : un couloir-rue d'une tuile = l'empreinte d'une
tour, une rue toutes les 4-6 cellules = « une route par immeuble ».

> ⚠ Le « Écarté volontairement : réduire la maille dans le générateur » de §8
> tombe DONC pour les bandes 7+ — décision Raph 2026-08-03 (« attaque les
> superblocks »). Avant la bande 7, il tient toujours.

### S — Superblocks cosmiques ✅ LIVRÉ (v1)

Aux bandes 7+, `superMesh` (roadGraph.js, molette `globalThis.__superMesh`,
défaut +2, recompute nécessaire) élargit d'un même geste :
- les pas d'ARTÈRES : capital 6→8, mégalopole 5→7, grilles de quartier
  « districts » 3→5 ;
- le TREILLIS de perméabilité 4→6 — **plafonné à +2** : `HOUSE_ROAD_RADIUS = 4`
  doit couvrir l'intérieur des îlots (6/2 = 3 ≤ 4), sinon le cœur des
  superblocks refuserait les maisons.

Mesuré (bande 8, `__tissu()`) : maille 6 → **7**, roadShare 12,7 → 13,7 %
(stable — le but était le grain, pas le pourcentage), **1 904 logements posés**
(aucun effondrement de placement). Avant la bande 7 : zéro changement, et les
tests du générateur le gardent.

### W — Tours de plusieurs tuiles de large ✅ LIVRÉ

« Repenser la possibilité de faire les tours âge cosmique de plusieurs tuiles
de large » (Raph) : fait via `HOUSE_FOOTPRINT_COSMIC` (buildingGenerator.js) —
**tower 1×2 → 2×2, supertower 2×2 → 3×3 aux bandes 7+** (`houseFootprint`
prend l'eraBand, passé par le ctx du placement par slots ; défaut 0 = tables
historiques, les tests legacy inchangés).

⚠ **L'ART SUIT L'EMPREINTE, sinon il rapetisse** : l'échelle de dessin est
`unit = w/spanX` (pixelHouseGeom) — les diviseurs px→tuiles valent ÷18,8 en
1×2 mais ÷28,2 en 2×2 et 3×3. Les 6 sprites régénérés pour CES empreintes :
- tower-cosmic 7/8/9 : monolithes 96×320, contenu 74-88 px de large →
  **10,9-11,2 t** dessinées (masse ×3 vs les aiguilles, même hauteur) ;
- supertower-cosmic 7/8/9 : colosses 144×400, contenu ~132-144 px →
  **13,6-14,2 t** (Raph : « 13-14 t » ✓).

⚠⚠ **GOTCHA PixelLab découvert : à 144×400, le fond « transparent » est resté
OPAQUE** (plaque blanche/grise pleine) sur les TROIS colosses — jamais vu aux
canvas ≤ 128. Contrôle qui l'attrape : bbox alpha = plein cadre. Détourage par
flood depuis les bords ; ⚠ la plaque de la bande 8 était en DÉGRADÉ (159→175) :
un flood à tolérance fixe s'arrête au milieu et laisse une douve transparente
qui bloque les passes suivantes — le flood final compare au gris de PLAQUE
(seuil 30) et traverse le transparent. À la prochaine fournée grand format :
vérifier les coins AVANT quantize.

### P — La place cosmique ✅ LIVRÉ (option b : densifier)

Arbitrage Raph 2026-08-03 : « densifie la place cosmique ». Fait par
**surcharges DE RECETTE** (isoPlaza.js — les autres ères gardent les plafonds
de `PLAZA_TUNE`, zéro impact hors bandes 7+) :
- `benchPerSide: 8` (le côté trop court en met moins tout seul — la géométrie
  reste juge via la boucle de rétrécissement) ;
- `treeWant: 4` — un JARDIN autour de la pièce maîtresse (les SPOTS et le
  filet restent les juges de ce qui tient) ;
- `field: [planter]` — nouvelle GARNITURE DE CŒUR : quatre props sur les axes
  cardinaux à mi-chemin du centre, passés au filet (garniture, pas structure —
  même contrat que les bacs des intervalles). Le champ intérieur des grandes
  places cesse d'être une dalle nue.
Les gardes existantes tiennent (bancs = benchPerSide×4, une seule fontaine,
plafonds de hauteur) — 1 533 tests verts, recettes vérifiées aux tailles 4-6.

**⚠ Au même moment, la Tour-monde (lot W, 3×3) a été RETIRÉE** — Raph : « le
rendu n'est pas pertinent » (noyée parmi les monolithes 2×2 de 11 t). Le lot W
se réduit donc à : **tower 2×2 monolithe**. Ne pas re-proposer de super-tour.

## 9. Périmètre : ce qui a bougé en cours de route

Le plan s'ouvrait sur « le générateur est hors périmètre, tout doit être additif »
(décision de Raph : « on n'arrive pas à corriger ce problème par le code ou la mécanique
d'achat »). Le lot L8 y déroge, et sciemment : devant les quartiers de rues vides, Raph
a demandé « il faudrait que ça n'arrive plus ». Décorer, recouvrir ou fondre une rue qui
ne dessert rien, c'est la garder ; la seule réponse au « que ça n'arrive plus » est de
la couper, et couper vit dans le générateur. Le reste du plan demeure additif.
