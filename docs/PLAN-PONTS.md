# PLAN-PONTS — le pont refait à zéro (2026-10-01)

Demande de Raph : « tu me refais tous les ponts ? oublie ce qui a déjà été fait et
reprends à zéro ». Ce plan fait foi ; le journal (§7) dit où on en est.

## 1. Décisions de Raph (2026-10-01)

| Sujet | Décision |
|---|---|
| Silhouette | **Tablier PLAT au ras de la route** (ni marche ni pente). La STRUCTURE change par ère : pilotis, arches, treillis, poutre, suspendu. |
| Eau | **Piles dans l'eau permises**, avec une **passe libre au milieu** pour les bateaux. |
| Largeur | **Comme la route** (toute la chaussée : 1 voie au bois, 2 ensuite). |
| Nombre | **Un seul pont** par ville (le pont historique). |
| Statut | « En tant que bâtiment unique il faut une belle entrée et sortie, ce doit être un **bâtiment remarquable** ! » |
| Détails | Lanternes la nuit · gens qui s'arrêtent (accoudés, pêcheurs) · entrées marquées. |

Règles globales déjà en vigueur (PLAN-MAQUETTE-VIVANTE) : lumière haut-gauche, UNE ombre
solaire (rien de cuit dans les images), reflets dans l'eau, grain du sol (1 px d'art =
1 px de sol au zoom 1), une seule main (palette de l'ère : le pont de la bande 4 est de
la même pierre que ses quais).

## 2. Ce qui est jeté, ce qui est gardé

Jeté : le pont « grande image générée puis découpée » (sprites `bridge-*`, redressement,
fenêtre répétée, quantification de longueur, enterrement, dos d'âne, `prepBridgeIso.mjs`).
C'est lui qui imposait la largeur étroite, les coutures et la perspective approximative.

Gardé (ce ne sont pas des choix de dessin) : les cellules-pont du layout (`roadSurface
'bridge'`, 1 ou 2 colonnes, `CM.bridgeSpans`), le pont historique toujours présent, les
bateaux recentrés sur la passe (`CM.riverGates`), le tri peintre, l'ombre solaire et le
reflet du jeu.

## 3. Méthode : un pont en pièces, assemblé par le code

Le pont est **construit** pour la travée réelle (longueur, largeur, ligne d'eau), puis
cuit une fois par layout en trois calques à la résolution du sol (zoom 1) :

- **tablier** (à plat) : chaussée de l'ère sur toute la largeur de la route + trottoirs ;
- **arrière** : le parapet amont (sa face intérieure et sa margelle), la superstructure amont ;
- **avant** : la face aval (tympans, arches, piles, avant-becs, corniche) et le parapet aval.

Tout est peint en **iso exact** : une face verticale est une élévation cisaillée 2:1, un
dessus est un losange. Les arches tombent donc là où sont les piles, pour n'importe quel
fleuve. Au tri : tablier d'abord, puis parapet amont, puis passants, puis parapet aval.

Les **monuments d'entrée** (arcs, tours, pylônes selon l'ère) sont des objets à part,
posés sur les rangées de berge libérées (`bridgeHeadClear`) et triés comme des bâtiments.
Statues, braseros, lanternes : l'art de l'ère déjà fait pour les places quand il existe
(une seule main), PixelLab sinon.

## 4. Les ères (structure par ère, entrée remarquable)

| Bande | Ère | Structure | Entrée |
|---|---|---|---|
| 0 | Feu | passerelle de rondins sur pilotis, rambarde de corde | cairns + torches |
| 1 | Bois | pont de charpente sur palées, garde-corps | poteaux sculptés + torches |
| 2 | Pierre taillée | arches de pierre brute | bornes dressées |
| 3 | Couronne | arches gothiques, avant-becs | **tour-porte fortifiée** |
| 4 | Marbre (**pilote**) | arches romaines, balustrade, statues sur les piles | **arcs de triomphe** aux deux bouts |
| 5 | Fonte | arches de fonte ouvragée, candélabres | **pylônes à statues dorées** |
| 6 | Néon | arc en béton / haubans, néons | pylônes lumineux |
| 7-9 | cosmiques | suspendu de lumière | portails d'énergie |

La passe navigable suit la **plus grosse coque de l'ère** (pas une cote fixe de 3,4 tuiles).

## 5. Pilote bande 4, puis déroulé

1. Géométrie : travée, ligne d'eau au bord aval, piles et passe, entrées, bande de marche.
2. Cuisson des trois calques (tablier, arrière, avant) en iso exact.
3. Pose au tri + ombre sur l'eau + reflet.
4. Arcs de triomphe, statues, braseros ; la nuit.
5. Gens qui s'arrêtent (accoudés, pêcheur).
6. Planche de validation pour Raph → puis les autres ères.

## 6. Vérifications à chaque étape

Lint + tests + build ; captures au harnais à des zooms multiples de 1/8 (1, 2, 4) ; jour
et nuit ; passants et attelages dessus ; bateau dessous ; les deux bouts ; A/B figé.

## 7. Journal

- 2026-10-01 : décisions de Raph, plan écrit, étude du moteur. Constat bande 4 : pont gris
  froid dans une ville ocre, ~1 voie de large pour une route de 2, aucune entrée, reflet
  décalé (`.preview-shots/ponts0-b4-*.png`).
- 2026-10-01 (nuit) : **PILOTE BANDE 4 FAIT, NON COMMITÉ**, planche
  `.preview-shots/ponts/planche-pilote-bande4.png` (+ `avant-`/`apres-bande4.png`,
  `planche-autres-eres-provisoires.png`). Fichiers : `iso/isoBridge.js` (réécrit),
  `iso/bridgeBake.js` + `iso/bridgeKits.js` (neufs), lift retiré de `agents.js` /
  `iso/isoUnits.js`, rangement véhicules du pont retiré (`vehicleLaneTarget`), tests
  `bridgeModel.test.js` (neuf), `bridgeWalkBand` / `projectionAxe` mis à jour,
  `bridgeBury` / `bridgeSuspended` supprimés, sprites `bridge-*.png` +
  `prepBridgeIso.mjs` + `fetchBridges.mjs` supprimés (morts). `aseprite-pont/` et
  `_orig/bridge-*` GARDÉS (retouches main de Raph) : à trancher avec lui.
  Contenu : pont romain aussi large que la route (voie dallée de l'ère sur le tablier,
  trottoirs), arches en plein cintre (arche centrale = passe, la plus large), avant-becs
  pointus à glacis, balustrade de marbre, statues sur les piles, braseros sur la main
  courante, ARC DE TRIOMPHE à chaque bout (colonnes engagées, attique à inscription de
  bronze, statue et braseros), 6 habitués (accoudés, pêcheur avec sa ligne), ombre sous le
  tablier vue à travers les arches, ombre solaire sur l'eau, reflet autour de la ligne
  d'eau, lueurs et reflets de nuit. Les autres ères : même moteur, kits PROVISOIRES.
  Pièges : (1) un habitant fait 7-8 px au zoom 1 → parapet 6 px (à 9 il passait
  par-dessus la tête) ; (2) importer `isoRiver` depuis le pont bouclait le chargement
  (riverLife.test) → contour d'eau retracé localement ; (3) le reflet pivote sur le pixel
  opaque le plus bas de chaque colonne → sa source a les arches BOUCHÉES ; (4) des
  sessions parallèles modifient `src/game/map` → la page se recharge seule : monter la
  démo ET capturer dans le même appel.
  Reste : bateaux juste en aval du pont peints AVANT lui (mât caché ~1,5 tuile) — le
  tri des bateaux vit dans isoPort (autre session) ; les 9 autres ères après validation.
- 2026-10-01 : Raph valide le pilote (« c'est parfait ! fais toutes les ères »).
  **LES 10 ÈRES FAITES, NON COMMITÉES**, planches `.preview-shots/ponts/planche-10-eres.png`
  et `planche-nuits.png`. Familles ajoutées au peintre : rondins (b0), charpente à
  jambes de force et croix (b1), arches brisées (b3, `pointed`), fonte ajourée sur piles
  de pierre (b5, `ironarch`), caisson + piles rondes (b6, `girder`), tablier mince à
  filet lumineux (b7-9, `thin`) ; parapets corde / garde-corps / muret / CRÉNELÉ /
  fonte ouvragée / verre ; superstructures HAUBANS (b6 : deux mâts en H sur les piles
  de la passe, chaque éventail s'arrête à mi-chemin du mât voisin) et SUSPENSION (b7-9 :
  tours au ras des berges, câbles qui luisent dans la couleur des quais de l'ère).
  Entrées : totems peints à torche (b0), portail de chaume à lanterne (b1), piliers à
  vasque de feu (b2), TOUR-PORTE à toit d'ardoise, mâchicoulis et bannière (b3), arc de
  triomphe (b4), pylônes à statues DORÉES (b5, statue des places teintée), bornes LED
  (b6), ANNEAUX de lumière (b7-9). Nuit : flammes et réverbères dans le calque de
  lumière, reflets dans l'eau, câbles et anneaux qui rayonnent, feu rouge clignotant en
  tête de mât. Test `bridgeModel.test.js` : les dix ères se construisent, se cuisent et
  ont leur entrée. Lint, 1 886 tests et build verts.
- 2026-10-01 : DRAPEAUX à partir de la pierre (décision de Raph transmise par la session
  « petite vie ») : kit `flags` (piles b2/b3, attique des arcs b4, milieu des arches b5,
  têtes de mâts b6, têtes de tours b7-9), dessinés par la recette commune
  `isoVie.drawVieFlag` — même vent que les drapeaux de la ville. Planche
  `.preview-shots/ponts/planche-drapeaux.png`.
