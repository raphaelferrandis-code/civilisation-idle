# Places iso composées — dossier de travail

Ce fichier fait foi pour le chantier « la place n'est plus une image ».
Il remplace l'approche « une scène PixelLab par ère » (mode `scene`, gardé pour
l'A/B).

---

## 1. Le problème, en une phrase

La place iso était **une seule image étirée sur son emprise**. Le rapport
banc/fontaine/dallage étant cuit dans le PNG, un banc grossissait avec la place :
sur une place 5×5 il finissait aussi large qu'une maison.

Aucun facteur d'échelle ne répare ça — rapetisser la scène rapetisse la fontaine
d'autant. Et PixelLab plafonne à 400×400 : une place monolithique ne peut pas
dépasser ~2,5 cellules sans perdre sa densité de détail.

## 2. La règle

> **Un prop se dimensionne en fraction de TUILE (`hT`), jamais en fraction de la
> place.** Sa taille écran vaut `hT × TILE × zoom`, et rien d'autre.

Conséquence directe : une place peut passer à 7×7 sans qu'un banc grossisse d'un
pixel. C'est le nombre d'objets qui suit la taille de la place, jamais leur
taille.

L'invariant est **verrouillé par les tests** (`src/game/map/iso/__tests__/isoPlaza.test.js`) :
- une place 4×4 et une place 8×8 produisent exactement les mêmes `hT` ;
- les tailles attendues sont écrites **en dur en pixels**, pas recalculées depuis
  la formule testée (une garde qui s'auto-compare ne mord pas) ;
- un plafond refuse tout mobilier au-delà d'une demi-maison.

Les trois gardes ont été **vues rouges** sur des régressions injectées
volontairement (taille ∝ emprise, banc à 0,95 maison) avant d'être validées.

## 3. L'échelle de référence — LE CORPS

> **Le mobilier de place est à l'échelle du CORPS, pas du bâtiment.** Un banc
> n'est pas dimensionné par la maison derrière lui, il est dimensionné par qui
> s'y assoit.

Les recettes déclarent le mobilier en `p` = **multiples de la hauteur d'un
habitant**, résolus À LA COMPOSITION (jamais à l'import). `AGENT_SCALE` est
exporté en liaison vive par `agents.js` : rapetisser les habitants avec
`__villagerScale` recale tout le mobilier à chaud, et la valeur entre dans la
clé du cache de composition.

| repère | valeur |
|---|---|
| **un habitant adulte** | `0.85 × AGENT_SCALE` = **0,425 tuile** (20 px au zoom 1,5) |
| banc | `p` 0.70 → 14 px de haut, ~1 hauteur d'habitant de large |
| bac à fleurs | `p` 0.55 → 11 px |
| corbeille | `p` 0.52 → 11 px |
| margelle | `p` 0.44 (plancher — la largeur vient du pied MESURÉ de l'arbre) |
| fontaine | `p` 1.25 → 2.60 selon l'ère |

⚠ **C'est une correction, pas le choix d'origine.** J'avais tout ancré sur la
MAISON (`houseF`, une maison = 2,05 tuiles) pour ne pas dépendre d'`AGENT_SCALE`,
qui était alors une molette qu'une autre session réglait. Quand Raph a rapetissé
les habitants, le mobilier n'a pas suivi et la place a enflé à vue d'œil sans que
rien n'ait bougé — « ça fait toujours des places géantes ». `houseF` ne sert plus
qu'à BORNER par le haut : aucun prop ne doit atteindre la masse d'un bâtiment.

La garde qui manquait est **structurelle** : un poste déclaré en `hT` (tuiles
fixes) cesse silencieusement de suivre les habitants. Le test refuse désormais
tout poste de mobilier qui ne serait pas en `p` — vu rouge sur un banc refigé en
tuiles avant d'être validé.

**Et le mobilier plus petit, c'est plus d'éléments** : le pas minimal entre deux
props ayant fondu d'autant, le plafond de bancs par côté est passé de 2 à 4 et
une place 5×5 en porte désormais 3 par côté au lieu de 2.

## 3 bis. TOUTES les places sont meublées

⚠ **Piège levé le 2026-07-29** : « il n'y a que la place centrale qui construit,
les autres ont le sol mais aucun élément ». `isoPlazaBox` ne rendait que la
**plus grande composante connexe** — un garde-fou légitime contre une bbox qui
avalait la ville entière (des cellules `plaza` isolées traînent dans le réseau de
rues), mais qui jetait au passage toutes les places de quartier.

`isoPlazaBoxes` rend désormais **toutes** les composantes, filtrées par TAILLE :
au moins 9 cellules et 3 de côté. En dessous ce n'est pas une place, c'est une
cellule `plaza` égarée. `isoPlazaBox` reste la plus grande — la place centrale —
pour le mode `scene`, qui n'a jamais su afficher qu'une seule place.

**La graine d'une place porte son COIN**, pas son rang : deux places de même
taille ne se ressemblent pas. Et le dégagement d'arbres décoratifs
(`treeBlocked` dans isoRenderer) s'applique à toutes, sinon un arbre du décor
vient chevaucher le mobilier d'une place de quartier.

## 4. L'architecture

| fichier | rôle |
|---|---|
| `src/game/map/iso/isoPlaza.js` | **tout le modèle** : emprise, rôles des cellules, recettes par ère, tailles, tirage déterministe, dessin d'un prop, overlays de travail, molette `__plaza` |
| `src/game/map/iso/isoRenderer.js` | **six points de branchement seulement** (voir plus bas) |
| `src/game/map/iso/__tests__/isoPlaza.test.js` | les gardes |
| `public/pixelart/iso/plaza/` | l'art iso — **55 sprites, les 5 ères complètes** |
| `public/pixelart/plazas/` | le kit top-down legacy, gardé comme **repli** |
| `scripts/fetchPlazaProp.mjs` | récupère un job PixelLab, garde les diagonales, écrase ×0,5 |
| `scripts/plazaSheet.mjs` | planche-contact de validation, à la taille réelle du jeu |

Points de branchement dans `isoRenderer.js` (volontairement minces, une autre
session travaille dans ce fichier) :

1. l'import d'`isoPlaza.js`, sur sa propre ligne ;
2. `plazaSceneReady` (résolution du sol) — en mode composé la dalle de sol
   reprend la main, c'est elle qui fait l'esplanade ;
3. `isoLamps()` — concatène les mâts de la place (`computeIsoLamps` saute les
   cellules `plaza`, la place était éclairée par son PNG) ;
4. la poussée des items dans le tri peintre ;
5. les branches de dessin `plazaProp` et `plazaGrid` ;
6. la suppression des copies locales d'`isoPlazaBox` / `plazaEraForBand`
   (déménagées dans `isoPlaza.js` — deux copies divergeraient).

### Pourquoi un item par prop

Chaque prop entre dans le tri peintre **à sa propre profondeur**. Un passant au
sud d'un banc passe devant, celui au nord passe derrière. La scène unique n'avait
qu'une profondeur pour toute la place, donc toute la foule passait du même côté.

## 4 bis. La composition (retour Raph, 2026-07-29)

Elle est **fixée**, plus semée au hasard :

> **le centre TOUJOURS pris** (fontaine ou arbre) · des bancs **par DUOS** le
> long de chaque côté, tournés vers le centre · des bacs fleuris dans les
> **intervalles** · un ou deux arbres · un lampadaire à chaque **coin**

Le hasard ne choisit plus que *quel* compagnon accompagne *quel* banc et quelle
variante d'arbre sort. La géométrie est symétrique et se règle à la molette.

🚫 **Pas de buissons sur une place** (« ces buissons n'ont pas lieu d'être, il
faudrait des arbres »). La verdure passe par les arbres, les compagnons de bancs
sont des bacs.

**Les arbres sont les arbres de la CARTE.** On ne dessine rien ici : on pousse un
item `tree` au format du renderer (`{gx, gy, jx, jy, r}`), donc mêmes sprites
`tree-1..4`, même teinte de saison, même batching, même repli. Un arbre de place
est un arbre, pas un sosie qui divergera au premier changement de saison.

⚠ **Ils ne vont PAS aux angles de la place** — essayé, refusé par le filet :
l'angle d'un losange iso est beaucoup plus étroit qu'il n'en a l'air et l'arbre y
tombait sur le banc du côté perpendiculaire. Ils se posent sur l'**anti-diagonale
monde** (x + y constant), qui se projette à l'horizontale à l'écran : un arbre va
à droite de la fontaine, deux l'encadrent. La diagonale x = y, elle, se projette
à la verticale — deux arbres y seraient l'un devant l'autre ; elle ne sert que de
repli.

**La densité suit l'emprise** (« plus elle sera grande, plus on mettra
d'éléments »). Chaque côté est découpé en `n` segments (hors dégagement des
coins) ; un segment doit loger un banc *et* son compagnon sans toucher les
segments voisins. Le compte d'arbres suit le petit côté, plafonné par `treeMax`.

| place | duos / côté | bancs | bacs | arbres | props poussés |
|---|---|---|---|---|---|
| 4×4 (plancher `cityPlan`) | 1 | 8 | 8 | 1 | 20 |
| 5×5 et au-delà | 2 | 16 | 12 | 2 | 35 |

**Les bancs vont par DEUX** (« tu peux faire en sorte que 2 bancs soient côte à
côte ? »). Un côté porte un ou plusieurs DUOS, jamais un banc seul, et le nombre
de bancs est toujours pair. ⚠ L'écart banc ↔ bac doit rester **plus grand** que
l'écart interne au duo : un bac étant bien plus étroit qu'un banc, la demi-somme
des largeurs le collait plus près du banc que son propre jumeau, et la paire ne
se lisait plus comme une paire. Le test du « banc jumeau » verrouille ça — il
exige que le voisin le plus proche d'un banc soit toujours un banc.

**Les bacs sont de la GARNITURE, pas de la structure.** Ils se logent dans les
creux de la rangée : aux deux bouts et entre deux duos. Si la place manque pour
l'un d'eux, le filet le refuse et c'est sans gravité. Ce qui ne doit jamais
sauter en silence, ce sont les bancs.

⚠ **LES RACINES DE L'ARBRE TOMBENT PILE SUR LE POINT DEMANDÉ**, pas « à peu
près » (« l'arbre n'est pas central, il faut que ses racines soient au centre »).
Deux décalages s'additionnaient : la remontée au-dessus de la margelle (~5 px) et
le pied du sprite, qui n'est pas au centre de son canvas (footCx 0.474 à 0.521)
alors que le pipeline d'arbres dessine centré sur le CANVAS. Correction : c'est
la **margelle qui descend** au lieu de l'arbre qui monte — l'écart visuel est
identique mais le point de référence devient celui de l'arbre — et le pied mesuré
recale le reste. Les métriques n'étant connues qu'au décodage des sprites, leur
nombre entre dans la **clé de composition** : la place se recale toute seule
quand les PNG arrivent.

**Une CORBEILLE par ère** partage le pool de garniture avec les bacs : osier
antique, tonneau médiéval, fonte verte industrielle, métal clair moderne,
composite ambré cosmique.

**LE CENTRE N'EST JAMAIS VIDE** (« il faut que le centre de la place soit pris,
soit par un arbre, soit une fontaine, mais obligatoirement quelque chose »). La
pièce maîtresse est posée en premier et **sans passer par le filet** : elle
s'impose, tout le reste s'écarte d'elle. Un test le vérifie sur les 5 ères × 4
emprises, et un autre avec un filet absurdement strict (`minGap: 99`) — même là
le centre tient. `__plaza({ centre: 'tree' })` met un arbre au milieu à la place
de la fontaine ; il garde sa margelle, c'est exactement le même geste.

(« props poussés » compte les DEUX morceaux de chaque margelle, cf. § 8.)

C'est un arbitrage explicite, pas une suppression silencieuse : le filet
anti-chevauchement existe toujours, mais il ne devrait plus rien avoir à couper.

**Deux pièges déjà rencontrés, et corrigés :**

1. *Les props volaient.* Les PNG portent du vide transparent sous l'objet — 5 % à
   22 % du canvas dans le kit legacy. Poser le bas du **canvas** sur le sol
   laissait l'objet flotter au-dessus de son ombre, de 17 % de sa hauteur pour un
   banc, 22 % pour un bac à fleurs. On mesure désormais l'**encre** du sprite et
   on ancre dessus (`plazaAnchor`, testée). Bénéfice second : `hT` désigne enfin
   la hauteur de l'**objet visible**, pas du canvas — un banc réglé à 16 px en
   faisait 10 avant.
2. *Les compagnons se chevauchaient aux coins.* Poussés vers l'extérieur, ceux de
   deux côtés adjacents tombaient au même point à l'écran. Ils vont maintenant
   vers le milieu du côté (`sideDir: 'in'`), et surtout `cornerKeep` garde les
   angles libres.

## 4 ter. La fontaine grandit d'ère en ère

« Je veux qu'elles soient de plus en plus grandes selon les âges, qu'on ait une
évolution. » C'est le **seul** prop qui évolue en taille : un banc sert le même
corps à toutes les époques, alors que la fontaine est un monument civique dont
l'ambition suit la ville.

| ère | en maisons | `hT` | à l'écran (zoom 1,5) | canvas généré |
|---|---|---|---|---|
| antique | 0,45 | 0,922 | 44 px | 96 |
| médiévale | 0,56 | 1,148 | 55 px | 112 |
| industrielle | 0,68 | 1,394 | 67 px | 128 |
| moderne | 0,80 | 1,640 | 79 px | 144 |
| cosmique | 0,95 | 1,947 | 93 px | 168 |

La résolution de génération suit la taille d'affichage, sinon la dernière serait
floue. Le plafond reste **une maison entière** : au-delà ce ne serait plus du
mobilier de place mais un bâtiment. La progression est verrouillée comme
**strictement croissante** par le test, et un second test vérifie que le rapport
entre la première et la dernière dépasse 2 — sinon ce n'est pas une évolution,
c'est du bruit.

⚠ **La distance des arbres à la fontaine se DÉDUIT de sa taille.** `treeSpread`
n'est qu'un plancher : à réglage fixe, la fontaine agrandie finissait par toucher
l'emplacement de l'arbre, qui basculait alors sur un repli *derrière* elle — où
il mangeait deux bancs. Un emplacement à `(cxc + d, cyc − d)` est à `sx = 2d` de
l'axe de la fontaine, d'où la demi-somme des demi-largeurs.

⚠ **Piège trouvé en agrandissant** : la garde « la fontaine ne mange pas le
mobilier » a révélé un défaut qui n'avait rien à voir — le motif de lampadaires
`ring` posait un mât au MILIEU de chaque bord, pile sur la rangée de bancs, et
sur une place 4×4 le filet supprimait deux bancs en silence. Invisible tant que
ces ères n'étaient testées qu'en 5×5. Motif retiré : **un mât par angle, point.**

## 5. Les molettes (console du jeu)

```js
__plaza()                     // l'état courant
__plaza({ mode: 'scene' })    // revient à l'ancien PNG — A/B immédiat
__plaza({ mode: 'kit' })      // la place composée (défaut)
__plaza({ propScale: 1.3 })   // tout le mobilier ×1,3
__plaza({ furnScale: 0.8 })   // rapetisse ce qui est à l'échelle du corps (pas les arbres)
__plaza({ hT: { bench: 0.6 } })   // une seule taille
__plaza({ benchPerSide: 3 })  // maximum de bancs par côté (le côté peut en mettre moins)
__plaza({ benchInset: 0.8 })  // les bancs plus loin du bord
__plaza({ cornerKeep: 1.4 })  // plus de dégagement aux coins
__plaza({ sideGap: 0.9 })     // banc et compagnon plus écartés
__plaza({ sideDir: 'out' })   // compagnon vers le coin plutôt que vers le milieu
__plaza({ sideOn: false })    // bancs seuls
__plaza({ centre: 'tree' })   // un arbre au milieu plutôt que la fontaine
__plaza({ pairTight: 1.2 })   // desserre le duo de bancs
__plaza({ treeMax: 3 })       // plafond d'arbres (le compte suit l'emprise)
__plaza({ treeSpread: 0.5 })  // arbres plus loin de la fontaine
__plaza({ treeR: 0.9 })       // arbres plus grands (r au sens des arbres de carte)
__plaza({ shadow: 0 })        // coupe les ombres au pied
__plaza({ coreR: 1.5 })       // dégagement autour de la pièce maîtresse
__plaza({ jitter: 0.3 })      // casse la symétrie (0 par défaut)
__plaza({ seed: 3 })          // rebat les compagnons, même géométrie
__plaza({ only: 'bench' })    // n'affiche qu'un prop — jugement d'art isolé
__plaza({ grid: true })       // rôles des cellules + cercle du cœur
__plaza({ ruler: true })      // ÉTALON : silhouette de maison + barre d'une tuile
```

Chaque réglage incrémente `rev` : la composition mémoïsée se reconstruit sans
recharger la page.

`ruler` est le seul juge honnête d'une taille de prop : on compare à l'œil une
silhouette de maison posée au bord de la place, on ne calcule pas des mètres.

## 6. Le brief d'art

Dossier cible : `public/pixelart/iso/plaza/<prop>-<ère>.png`, éventuellement
`<prop>-<n|s|e|w>-<ère>.png` pour les props orientés (bancs).

Ères : `antique` · `medieval` · `industrial` · `modern` · `cosmic`
(les mêmes clés que le reste de l'iso).

DA : 3/4 top-down, fond transparent, lumière haut-gauche, peu de teintes, palette
de l'ère (`scripts/remapPalette.mjs`).

### Tailles à viser

`hT × 32` donne la hauteur affichée à zoom 1 ; l'art des bâtiments est calé sur
un zoom « natif » d'environ 1,28, d'où la colonne canvas.

| prop | `hT` | px à zoom 1 | canvas conseillé |
|---|---|---|---|
| fontaine (pièce maîtresse) | 1.13 | 36 | 48×48 |
| mât / bannière | 1.54 | 49 | 48×64 |
| étal | 0.86 | 28 | 32×32 |
| banc | 0.49 | 16 | 32×24 puis ×0,5 |
| bac fleuri, arbuste | 0.45 | 14 | 32×24 puis ×0,5 |
| amphore, corbeille | 0.31 | 10 | 32×32 puis ×0,5 |
| borne | 0.25 | 8 | 32×32 puis ×0,5 |

⚠ **PixelLab ne descend pas sous 32 px de canvas**, or la moitié du mobilier
s'affiche sous 16 px. Un sprite généré à 48 px puis affiché à 15 px, c'est de la
bouillie : les pixels sont détruits au tirage. On génère donc LARGE et on écrase.

### La recette de production (éprouvée le 2026-07-29)

```bash
# 1. Générer. Props ORIENTÉS (banc, bac) : 8 rotations, on n'en garde que 4.
#    Props symétriques (grille, fontaine) : create_map_object, une seule vue.
#    Toujours : view "low top-down", « lit from the upper left, few flat colors ».

# 2. Récupérer, ne garder que les DIAGONALES, écraser ×0,5.
node scripts/fetchPlazaProp.mjs <objectId> bench antique

# 3. Resserrer la palette, une époque par ère.
node scripts/remapPalette.mjs public/pixelart/iso/plaza/bench-s-antique.png --epoch pierre --inplace

# 4. Planche-contact pour validation (le 1er bandeau est le seul qui compte).
node scripts/plazaSheet.mjs sortie.html "banc antique · nord"=public/pixelart/iso/plaza/bench-s-antique.png
```

**Les 4 orientations sont les DIAGONALES écran, pas les cardinales.** Un banc du
bord nord regarde le sud, ce qui à l'écran pointe en bas à gauche. Table dans
`fetchPlazaProp.mjs` : `s ← south-west · n ← north-east · e ← south-east ·
w ← north-west`. Le nom de fichier porte la direction MONDE, c'est ce que lit
`isoPlaza`.

**Époque de remap par ère iso** : antique → `pierre`, medieval → `marbre`,
industrial → `fonte`, modern → `neon`, cosmic → `noosphere`. ⚠ Ne PAS lancer
`--dir` sur tout le dossier avec une seule époque : ça repasse les autres ères
au passage. Une époque, une liste de fichiers.

**L'écrasement est une MOYENNE 2×2 en alpha prémultiplié**, pas un plus proche
voisin : le voisin jetterait 3 pixels sur 4, et une moyenne non prémultipliée
ourlerait chaque bord d'un liseré sombre. L'alpha, lui, est SEUILLÉ — un pixel à
demi transparent fait un bord sale en pixel-art.

### Pièges de prompt déjà payés

- ⚠ **Le remap ne réchauffe PAS une source froide.** Une margelle demandée en
  « grey stone » est ressortie gris bleuté, et `--epoch pierre` ne l'a pas
  corrigée : la palette du jeu CONTIENT des gris froids, le plus proche voisin
  les garde. La chaleur se joue dans le PROMPT (« warm brown », « ochre »,
  « terracotta »), pas au remap.
- ⚠ **Nommer un objet par sa fonction fait dessiner la fonction.** « tree
  surround » a produit une margelle AVEC un arbre dedans, alors que l'arbre est
  dessiné à part. Il faut l'exclure mot pour mot : « nothing growing, no tree,
  no plant ».
- Les petits accents de couleur ne survivent pas. Des fleurs demandées sur les
  bacs ont disparu : à 20 px d'affichage une fleur fait 1 à 2 pixels, PixelLab
  les fond et le remap finit le travail. C'est de la retouche à la main.
- ⛔ **`create_map_object` rend une vue trop FRONTALE.** Les premières fontaines
  en sont sorties presque de face, sans lecture 3/4 — alors que les bancs, eux,
  étaient justes. La différence est le pipeline : **`create_8_direction_object`
  rend un vrai 3/4**. Pour un prop à symétrie de révolution (fontaine), on passe
  donc quand même par les 8 rotations et on n'en garde qu'une, rangée sans
  suffixe de direction (`fetchPlazaProp.mjs --pick=south-west`). Le repère qui ne
  trompe pas : le bassin doit être une ellipse ~2:1 avec l'épaisseur du rebord et
  la surface de l'eau visibles de dessus.
- ⛔ **Le détail fin est illisible à cette taille.** Une fontaine médiévale
  demandée avec « gothic pinnacle with tracery » est ressortie en masse sombre
  informe : à 59 px de haut, la tracery n'a nulle part où exister. Demander une
  « readable silhouette » et un ton CLAIR — une masse sombre ne se rattrape pas
  au remap. Même erreur d'échelle que les fenêtres de nuit du lot 1 : raisonner
  sur le SPRITE, pas sur l'objet.
- ⛔ **L'eau doit VENIR de quelque part et ALLER quelque part.** Des anneaux
  ajourés d'où l'eau ruisselle, une vasque haute qui se déverse sur une dalle
  plate : PixelLab produit volontiers des cascades sans source ni réceptacle, et
  ça saute aux yeux. La formule qui marche décrit le CIRCUIT : « bassin rempli
  d'eau à la base · vasques PLEINES empilées · chacune déborde par-dessus son
  bord dans celle du dessous ». Des jets qui montent depuis la surface de l'eau
  sont légitimes (buse immergée) ; une chute qui naît dans le vide, non.
- ⛔ **Un socle rectangulaire tue le 3/4**, même via le pipeline 8 rotations.
  Une fontaine posée sur une dalle carrée vue de plein pied lit de FACE quelle
  que soit la rotation choisie. Ce qui garantit la lecture 3/4, c'est une
  **empreinte RONDE ou octogonale** : elle se projette en ellipse, et l'ellipse
  porte la perspective à elle seule. Demander « circular pool », pas « stepped
  base ».
- ⚠ **Une lumière colorée déteint sur l'eau.** « Warm amber light » sur la
  fontaine cosmique a viré toute l'eau au caramel. Séparer explicitement :
  « le fût SEUL rougeoie · l'eau reste bleu pâle et blanche partout ».
- ⚠ **Vérifier le cyan À LA MESURE, pas à l'œil.** L'eau cosmique est ressortie
  mint-turquoise (indice cyan `min(g,b) − r` = +43) alors qu'elle paraissait
  acceptable. La règle anti-cyan de l'ère se contrôle en comptant les teintes
  dominantes ; `--epoch pierre` ramène l'eau sur le bleu ardoise du fleuve.
- ⚠ **…mais « simple bold shapes » TUE l'ornement.** Sur-corrigé après le
  pinacle : les fontaines suivantes sont sorties trop nues (« c'est trop
  basique »). La bonne consigne n'est pas « simple », c'est **de l'ornement en
  MASSES plutôt qu'en filigrane** : vasques étagées, figures sculptées, colonnes,
  cascades entre les niveaux, degrés — des volumes qui survivent au pixel.
  Formule qui marche : « ornate / richly carved / tiered / cascading » **+**
  « readable silhouette », et surtout PAS « simple bold shapes ». Retirer aussi
  « few flat colors » quand on cherche la richesse : le remap fait déjà la
  discipline de palette, la consigne ne sert qu'à appauvrir le dessin.

### Chaîne de repli

`iso/plaza/<prop>-<ère>.png` → kit legacy `plazas/<prop>-<èreLegacy>.png` →
**gabarit plat** (bloc terne cerné, initiale du prop).

Donc la **composition se juge avant que l'art existe**. Le gabarit est
volontairement laid : personne ne doit le confondre avec un rendu fini.
`__plaza({ placeholders: false })` l'éteint.

## 7. La boucle de travail

1. `__plaza({ grid: true, ruler: true })` — regarder la répartition des rôles et
   l'étalon de taille.
2. Régler la **composition** dans `RECIPES` (probabilités, quels props sur quel
   rôle) et les **tailles** (`hT`). Le fichier est en HMR complet
   (`gameFullReloadPlugin` couvre tout `src/game/`).
3. Quand la composition tient, produire l'art prop par prop et le juger isolé
   avec `__plaza({ only: 'bench' })`.
4. A/B contre l'ancien rendu à tout moment : `__plaza({ mode: 'scene' })`.

## 8. État de l'art produit

| élément | antique | médiévale | industrielle · moderne · cosmique |
|---|---|---|---|
| banc (4 orientations) | ✅ | ✅ | ✅ ✅ ✅ |
| bac à fleurs (4 orientations) | ✅ | ✅ | ✅ ✅ ✅ |
| margelle d'arbre | ✅ | ✅ | ✅ ✅ ✅ |
| fontaine | ✅ | ✅ | ✅ ✅ ✅ |
| arbre | *réutilise ceux de la carte* | | |

**La margelle est dessinée en DEUX morceaux**, aux profondeurs qui encadrent
celle de son arbre : l'arc arrière dessous, l'arc avant redessiné par-dessus,
écrêté à sa moitié basse. Sans ça les racines sont peintes SUR la pierre au lieu
de s'enfoncer dans le sol. Sur une ellipse posée au sol et vue en iso, la moitié
basse EST l'arc avant — un seul sprite suffit, pas besoin de découper l'art.
L'écrêtage se fait en px écran autour du point d'ancrage, jamais en fraction du
canvas : la part de vide transparent change d'un sprite à l'autre.

**L'arbre est remonté de `treeLift` au-dessus de sa margelle** pour que son pied
soit au milieu du trou et non sur son bord avant. ⚠ En iso on ne monte pas droit
en touchant une seule coordonnée : l'écran lit `x − y` en abscisse et
`(x + y) / 2` en ordonnée, il faut donc reculer d'autant en x ET en y. Et le
filet anti-chevauchement doit tester la position APRÈS remontée — le tester
avant laisse repasser exactement ce qu'il est censé empêcher.

## 9. Reste à faire

- [ ] Eau animée de la fontaine : le strip 8 frames existe pour le mode `scene`
      (`FOUNTAIN_ANIM`), à re-câbler sur la fontaine du kit.
- [ ] Vocabulaire à étendre : `statue`, `stall`, `bollard`, `obelisk` n'ont aucun
      art (gabarit plat pour l'instant).
- [ ] Dallage de la place : pour l'instant la tuile de sol `iso-plaza`. Un motif
      par ère (médaillon central, appareillage) reste à décider.
- [ ] Fontaine animée : le strip 8 frames existe pour le mode `scene`
      (`FOUNTAIN_ANIM`), à re-câbler sur la fontaine du kit.
- [ ] Vérification visuelle en jeu : jamais faite depuis la pane (elle n'est pas
      affichée dans les sessions Claude de ce projet). Les deux passes de retour
      se sont faites sur des captures envoyées par Raph.
- [ ] Recadrer le kit legacy : ses PNG portent 5 % à 22 % de vide sous l'objet.
      L'ancrage sur l'encre le compense, mais l'art iso devra être livré serré.
- [ ] Orientation des bancs : les variantes `n/s/e/w` nomment une direction
      MONDE ; l'art iso devra être dessiné en projection, pas de face.
