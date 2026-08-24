# Plan — Le relief : « tout est plat »

> ## ✅ ROUVERT ET LIVRÉ LE 2026-08-24 — LE TERRAIN EST EN JEU (`79c0275` → `a83f1c8`)
> **9 commits le jour même** : champ + socles + contremarches + ombrage (v1), remodelage
> « fini la houle » (coteau + massifs discrets), ROUTES SILLONNANTES (coût de pente,
> `terrainField.js` partagé génération/rendu), accent final validé par Raph, inverse du
> survol en point fixe. Défauts de référence : `valley 9, hills 12, hillCut 0.46,
> cityK 0.5` — validés (« c'est bien comme ça »).
>
> Raph a rouvert le dossier le jour même de la clôture (« j'ai travaillé le relief sans
> succès, vérifie ce qui a été fait et quelle est ton approche »). Le diagnostic de la
> clôture — « la base de la carte n'a pas été pensée pour ça » — s'est révélé **faux à
> la mesure** : un seul site projette tout le sol, et les ~15 projections du peintre
> sont toutes des pieds au sol. Ce que le premier chantier avait levé, c'était
> l'exception (l'eau, le pont) — jamais la règle (le sol et ce qui s'y tient).
>
> **La méthode qui a marché, à retenir : une MAQUETTE JETABLE avant tout plan.** Une
> colline bidon accrochée DANS `worldToScreen` (un seul point de contact), jugée sur
> capture en une heure : géométrie seule = fish-eye ; géométrie + ombrage = relief.
> Raph a validé la direction sur une image de ville réellement levée — ce que les six
> lots du plan d'origine n'avaient jamais produit.
>
> ### Ce qui est LIVRÉ (`iso/isoTerrain.js`, défaut ALLUMÉ, `__terrain(false)` coupe)
> · **Le champ** : vallée creusée par le fleuve + collines 2 octaves semées par
>   `mapSeed`, douces en ville (`cityK`), pleines au-delà de la lisière ; DÉRIVÉ,
>   jamais stocké — la save ne change pas. Unité **U = T/4 en entiers** (× le zoom
>   quantifié au 1/8 = toujours un pixel entier), niveau **par cellule** (coin partagé
>   → cellule sud-est), **socles plats** sous chaque emprise/place/parvis, résolus
>   avant la cellule, en continu.
> · **L'axe la porte** : `worldToScreen` additionne `terrainZ` à `wz` — tout suit,
>   rien à enfiler chez les consommateurs. `screenToWorld` est l'inverse de la
>   SURFACE (2 itérations, `+h` décale l'unprojection de `(+h,+h)`).
> · **Les contremarches** : la tranche du terrain sous les arêtes sud/est des cellules
>   hautes — terre en campagne, pierre d'ère en ville — remisées puis peintes en
>   fills d'union (les fills par cellule coûtaient +45 % de recuisson).
> · **L'ombrage** : hillshade du champ lisse en soft-light par-dessus la scène
>   (lumière haut-gauche) — c'est lui qui « vend » la pente.
> · **Coût** : recuisson pleine **+28-33 %** (dev, cadrage verrouillé, best-of-4) —
>   coalescée au repos, jamais en geste ; les seuils auto-calibrés absorbent.
> · **10 gardes** (`isoTerrain.test.js`) + gardes d'axe mises à jour.
>
> Le bandeau de clôture ci-dessous est CONSERVÉ pour ses leçons (contrainte de
> cadrage, artefacts d'instrument) — mais sa conclusion est caduque.

> ## ⛔ ~~CHANTIER CLOS LE 2026-08-24, PAR DÉCISION DE RAPH~~ — ROUVERT LE JOUR MÊME, cf. ci-dessus
>
> « ça n'ajoute objectivement aucun relief, la base de la carte n'a pas été pensée pour
> ça. On perd plus de temps à tout reprendre un par un alors qu'une base saine serait
> mieux. » Puis, sur la question de la portée : **la ville ne prend pas le relief, et le
> chantier s'arrête.**
>
> **Il avait raison, et le chiffre le prouve : 116 sites de projection dans la carte,
> NEUF portent une altitude** (le fleuve, le contour d'île, la pente de grève, les gens
> sur le pont). Tout le reste — chaque bâtiment, chaque tuile de route, chaque arbre,
> chaque habitant, **et le sol lui-même** — se projette à zéro. Et il n'existe **aucune
> hauteur par cellule** dans le dépôt. Ce qui a été livré n'est pas du relief : c'est de
> l'habillage de bordure sur un monde plat.
>
> **Et ce n'était pas un accident d'exécution.** C'est la conséquence directe du § 3 de
> ce plan — « la ville reste à l'altitude 0 », posé par Raph lui-même. Ville clouée à
> zéro ⇒ le relief ne peut vivre qu'aux BORDS des choses. La contrainte excluait d'avance
> le seul endroit qu'on regarde. **La leçon, pour tout plan futur : une contrainte de
> cadrage qui exclut la zone d'intérêt condamne le chantier avant sa première ligne — il
> faut la tester contre la cible AVANT d'écrire le plan, pas après le troisième lot.**
>
> ### Ce qui SURVIT (à ne pas défaire — utile hors relief)
> · **Le troisième axe de la projection** (`a9b2738`) : `worldToScreen(x, y, wz = 0)`.
>   No-op par défaut, et il a permis de retirer la plus vieille rustine d'altitude du
>   projet. · **Le pont migré** (`a1e018e`) : six peintres ne corrigent plus le `y` après
>   coup. · **`iso/isoBeachCells.js`** : la règle « cette berge est-elle du sable ? »
>   n'existe plus qu'en un exemplaire, partagée par le sol cuit et la passe vive.
>
> ### Ce qui DORT (inerte : `RELIEF.water = 0` par défaut, aucun pixel ne change)
> `isoRelief.js` (114 l.), les blocs face-de-berge et grève d'`isoRiver.js`, le
> `waterSinkPx()` de `quaysAndRiot.js`, `reliefKey()` dans la clé de bake, et
> `__tests__/reliefBerge.test.js` (16 gardes). **Retirable d'un bloc si le code mort
> gêne** — ce dépôt a déjà payé pour des molettes et des données que personne ne lisait.
>
> ### La suite est ailleurs
> La mesure corrigée du lot 0 (`60d78ca`) l'avait déjà dit : **la campagne est plate, la
> ville ne l'est pas** — et c'est la ville qu'on regarde. Le levier est la **hiérarchie
> de masse**, pas le terrain → `PLAN-RENDU-VILLE.md`.

Chantier ouvert le 2026-08-22, sur le grief de Raph :

> « un des problèmes qu'on a sur le rendu c'est qu'il n'y a pas de relief, tout est
> plat. Est-ce possible d'ajouter un peu de relief ? »

Établi par une lecture du chemin de rendu iso (`iso/projection.js`, `iso/isoRenderer.js`,
`renderWorld.js`) et par l'examen d'une capture de ville d'ère 1 (`.preview-shots/v3-large.png`).
Complète `PLAN-RENDU-VILLE.md` (« brouillon et pas net ») : c'est la **troisième maladie**,
et elle ne se soigne ni au même endroit ni avec les mêmes moyens que les deux autres.

**Aucune ligne de code n'a été écrite.** Ce document est un plan.

---

## 1. Ce qui est plat, et de quelle façon

### 1.1 La projection n'a pas de troisième axe

`worldToScreen(wx, wy)` (`iso/projection.js:105`) mappe un point du plan sur l'écran, et
c'est tout : il n'existe **aucune notion d'altitude** dans le moteur. Corollaires :

- `depthOf(wx, wy) = wx + wy` (`:141`) — le tri du peintre ne connaît que le plan ;
- le sol est une boucle `gy × gx` qui blitte un losange par cellule au coin nord projeté
  (`isoRenderer.js:2158`, `blitIsoTileKey`) — même `y` pour toutes les cellules d'une même
  diagonale, sans exception ;
- le champ de hauteur `cityMapDrawTerrain` (`renderWorld.js:346`) — un vrai hillshade,
  vallée du fleuve + bruit de collines, rendu en basse résolution et blitté en `soft-light` —
  **existe, fonctionne, et n'est câblé que dans le chemin LEGACY** (`cityMapRuntime.js:2142`
  et `:2155`, sous `if (!_pixelGround)`). En iso — c'est-à-dire dans le jeu — il n'est jamais
  appelé. C'est du code mort depuis la bascule iso.

### 1.2 Trois symptômes, par ordre de surface à l'écran

| Symptôme | Surface | Ce qu'on voit |
|---|---|---|
| **Le fleuve est un autocollant** | ~12 % | Le ruban bleu est *dans* le plan du sol. Hors quai (grève, berges sauvages, îles) l'eau touche l'herbe sans la moindre marche. |
| **La forêt est un tapis** | ~40 % | Masse verte d'un seul ton, aucune modulation de valeur à grande échelle. Elle lit comme une texture, pas comme un terrain. |
| **Le plateau urbain est une nappe** | ~35 % | Une étendue beige unique, sans modulation, du bord de l'eau à la lisière. |

### 1.3 L'exception qui prouve la règle : le mur de quai

`cityMapDrawQuays` (`renderWorld.js:783-800`) dessine déjà **un parement vertical de 0,66 à
0,75 tuile** le long de l'eau (`st.wallTiles`, § « berge maçonnée façon TheoTown »), avec, en
commentaire, la géométrie exacte du relief :

> « L'axe VERTICAL du monde se projette en Z-écran pur (screen-Y vers le bas) → un parement
> vertical est un ruban qui "pend" sous la margelle […] Il n'est visible que sur la rive dont
> l'EAU est DEVANT ; l'autre rive n'en montre que la margelle (son parement est occulté par
> sa promenade). »

C'est, mot pour mot, la règle de la **face unique** que Raph a lui-même imposée pour la marche
de trottoir (`PLAN-TISSU-URBAIN.md` § « ET LA MARCHE N'A QU'UNE FACE — la perspective dit
laquelle »).

**Donc le jeu affirme déjà que l'eau est ~0,75 tuile plus bas que la terre — et rien d'autre
dans le monde n'en tient compte.** Le mur pend sous la margelle pendant que la nappe d'eau,
elle, reste au niveau du sol. On a la face d'une marche sans la marche.

C'est le point d'appui de tout ce plan : il ne s'agit pas d'inventer une altitude, il s'agit
de **rendre vraie une altitude que le rendu prétend déjà**.

---

## 2. Le levier : une seule fonction projette

La règle d'or du chantier iso — « PLUS PERSONNE ne projette à la main » (`projection.js:12`) —
est tenue : **98 sites d'appel**, tous à travers `worldToScreen` (92 dans `isoRenderer.js`,
3 dans `agents.js`, 2 dans `isoBridge.js`, 1 dans `renderWorld.js`).

Ajouter un troisième argument OPTIONNEL :

```
worldToScreen(wx, wy, wz = 0)   →   sy -= wz · zoom
```

est une ligne, rétro-compatible au bit près (`wz = 0` ⇒ comportement actuel), et **tout
consommateur qui passe une altitude lève correctement, sans autre changement**. Dans une base
de code où la projection serait recopiée à la main, ce chantier serait irréalisable ; ici il
est mécaniquement contenu. C'est la raison principale pour laquelle la réponse à la question
de Raph est **oui**.

### 2.1 L'unité de relief : le quart de tuile, et pas autre chose

`TILE = 32`, le zoom est quantifié au 1/8 (`ZOOM_QUANT.per = 8`, `projection.js:81`) et le blit
1:1 du sol exige que le pas de grille soit entier (`hw = 32z` entier et pair, `blitIsoTileKey`
§ S7). Le décalage vertical d'une marche vaut `H · U · z` px écran. Pour qu'il tombe toujours
sur l'entier aux crans autorisés `z = k/8` :

| U | décalage à `z = k/8` | entier ? |
|---|---|---|
| T/8 = 4 px | `k/2` | ❌ demi-pixel aux crans impairs |
| **T/4 = 8 px** | **`k`** | ✅ **toujours** |
| T/2 = 16 px | `2k` | ✅ (mais marche grossière) |

**⇒ L'unité de relief est `U = T/4 = 8 px monde`, et les hauteurs sont des ENTIERS de `U`.**
Sinon on rouvre la couture que le lot S11 vient de fermer, et le « +1 px anti-couture » revient
sur tout le sol.

Échelle qui en découle :

| Élément | Hauteur | Correspondance |
|---|---|---|
| Nappe d'eau | **−3 U** (24 px, 0,75 tuile) | = `wallTiles: 0.75` des ères modernes, à l'identique |
| Plateau urbain | **0** | inchangé |
| Collines hors ville | **0 → +6 U** (48 px, 1,5 tuile) sur ~25 tuiles | une marche tous les ~4 tuiles |
| Amplitude totale | **9 U** = 72 px monde = 2,25 tuiles | 72 px écran à zoom 1 |

Le mur de quai cesse alors d'être une constante par ère et devient **la face d'un vrai
dénivelé** : `wallTiles` se dérive de `−WATER_Z`, un seul chiffre pour toute la carte.

---

## 3. La décision de cadrage : LA VILLE RESTE À L'ALTITUDE 0

C'est la décision qui rend le chantier faisable, et elle n'est pas un renoncement — elle est
déjà écrite dans le projet, dans le prototype legacy lui-même (`renderWorld.js:316`) :

> « La ville (routes droites, bâtiments alignés) reste plate — sinon le relief peint lirait
> comme un papier peint sous des objets plats. »

**Le relief vit là où rien n'est posé, cliqué, ni parcouru** : la bande sauvage, la vallée du
fleuve, le bord du plateau. Cinq raisons, toutes structurelles :

1. **Le hit-test.** `screenToWorld` est aujourd'hui l'inverse EXACT de `worldToScreen`. Avec une
   altitude, un point écran correspond à plusieurs cellules — l'inverse devient un lancer de
   rayon. Tant que tout ce qui est survolable est à 0, l'inverse reste exact là où il compte.
2. **Le tri du peintre.** `isoUnitDepth` est déjà aveugle à la hauteur (constat P23 de
   `PLAN-SUPPRESSION-LEGACY.md`). Y ajouter une altitude variable sous les sprites rouvrirait
   ce dossier au pire endroit.
3. **Les agents.** Les voies piétonnes et les files de véhicules sont publiées en coordonnées
   monde plates (`CM.isoVehLane`, bandes de marche). Un sol qui monte sous eux exige de porter
   l'altitude dans toute la sim de déplacement.
4. **Le tissu.** Routes droites, emprises alignées, `builtCells`, `courField`, `frontierFlip` —
   tout le tissu urbain est un graphe plan.
5. **La sauvegarde.** Un champ de hauteur DÉRIVÉ (de `mapSeed` + du fleuve) ne touche pas la
   save. Un relief posé dans la ville deviendrait de la donnée à migrer — et ce projet a déjà
   perdu une save sur une migration (`migrations-tdz-perte-de-save`).

**Sens de défaillance, et il est bon :** le sol (relief compris) est BAKÉ, donc dessiné avant
tous les sprites. Une colline ne peut jamais passer *par-dessus* un sprite — au pire elle
*manque* de l'occulter. Le défaut résiduel est discret, jamais un bug franc.

---

## 4. Les lots

### Lot 0 — La mesure, avant tout pixel

Ce projet a déjà vu la mesure contredire l'œil quatre fois (`PLAN-RENDU-VILLE.md` §7 : 5
constats réfutés sur 39 ; le grief des « cadres » qui ne venait pas de la marche). Avant de
peindre quoi que ce soit :

- **Sonde de platitude** : écart-type de luminance à GRANDE ÉCHELLE (bloc de 64 px), par zone
  (ville / forêt / eau / lisière), sur une capture de référence. La conjecture à vérifier est
  que la forêt et le plateau sont sous 5 points d'écart-type quand la lisière en fait 40.
- **Trois captures de référence** figées maintenant (ère 1, ère 4, ère 7) pour l'avant/après.

⚠ **Sur l'eau, l'œil ment** (leçon `plaisirs-eloignement-aura`, `vagues-fleuve-ressac`) :
toute vérification touchant le fleuve se fait par **diff de canvas**, jamais au jugé.

**Coût : une demi-journée. Non négociable.**

#### ✔ FAIT le 2026-08-23 — et la mesure déplace la cible

Sonde livrée : `window.__flatProbe({ block, pur })` (bloc dev de `cityMapRuntime`). Trois captures
de référence figées : `.preview-shots/relief-lot0-reference-bande{1,4,7}.png`.

⚠⚠ **CE QU'ON MESURE N'EST PAS L'ÉVIDENT.** Une forêt est PLEINE de variance — feuilles, troncs,
bruit de tuile. L'écart-type des pixels DANS un bloc la déclarerait très contrastée, alors qu'elle
est justement ce qu'on trouve plat. Le relief est une modulation à GRANDE ÉCHELLE : c'est
l'écart-type des **MOYENNES DE BLOCS** qui le dit. La sonde rend les deux (`grandeEchelle` et
`dansLeBloc`) — le second est le témoin qui montre qu'ils ne mesurent pas la même chose.

**Résultats — blocs UNANIMES, reproductibles à 0,3 près en inversant l'ordre des zooms :**

| Zone | bande 1 | bande 4 | bande 7 |
|---|---|---|---|
| **ville** | **27** | **16** | **7** |
| plateau | 1,7 | 2,1 | *(absent : la ville a tout mangé)* |
| eau | 3,3 | 2,0 | 1,5 |

**1. La conjecture est CONFIRMÉE pour la campagne.** Plateau à 1,7-2,1, eau à 1,5-4,0 — bien sous
les 5 points annoncés. Elles sont plates, à toutes les ères.

**2. La « lisière à 40 » n'est PAS observée**, et elle n'est pas mesurable avec cet instrument : la
berge fait 871 cellules, trop mince pour remplir un bloc de 64 px — aucun bloc unanime de lisière
n'existe à ces zooms. Il faudrait un bloc plus petit, ou un zoom serré. **Cette moitié de la
conjecture reste ouverte.**

**3. La ville n'est PAS plate — 12 à 15,7 à toutes les bandes.** Elle est, de loin, la zone la plus
modulée de l'image. La campagne l'est dix fois moins.

> ### ⛔⛔ CORRECTION — J'AI PUBLIÉ ICI UNE TROUVAILLE FAUSSE, ET RAPH A DÉCIDÉ DESSUS
>
> J'avais écrit : « LA VILLE S'APLATIT EN GRANDISSANT, sa modulation est divisée par 3 à 4 entre la
> bande 1 et la bande 7 (27 → 16 → 7) », et j'en avais conclu que les lots 1-3 ne visaient pas la
> bonne cible. **C'était un ARTEFACT DE CADRAGE.** La ville grandit avec la bande ; si la caméra
> n'est pas RECENTRÉE entre deux montages, elle ne regarde pas la même chose d'une bande à l'autre,
> et le chiffre suit le cadrage, pas la ville.
>
> Protocole corrigé — `CM.centered = false` forcé à chaque montage, puis 12 frames — **deux passes
> identiques coïncident à 0,2 près**, et la tendance DISPARAÎT : **13,5 / 12,8 / 15,2**.
>
> ⚠⚠ **La garde de cuisson que j'avais ajoutée ne suffisait pas.** Elle écarte le confondant du
> ZOOM (un bake mis à l'échelle) et laissait passer celui de la POSITION. Une sonde qui compare deux
> états du monde doit verrouiller **tout** le cadrage, pas seulement l'échelle. **Deux confondants,
> trouvés l'un après l'autre, chacun capable d'inverser le résultat.**
>
> **Ce qui tombe avec la trouvaille** : la conclusion « le grief est un grief de fin de partie », et
> la redirection vers l'ombrage qu'elle motivait. **Les lots 1 et 2 visaient juste depuis le début** :
> c'est bien la CAMPAGNE qui est plate.

⚠⚠⚠ **PIÈGE D'INSTRUMENT, ET IL A MORDU : LE SOL DOIT ÊTRE CUIT AU ZOOM COURANT.** Sinon on mesure
un BLIT MIS À L'ÉCHELLE d'un bake fait à un autre zoom — plus lisse, donc plus « plat ». Ça m'a
donné deux séries CONTRADICTOIRES (tendance de la ville inversée) avant que je le voie. La cuisson
est en TRANCHES : deux frames après un changement de zoom ne suffisent pas. La sonde porte
désormais sa garde — elle joue des frames jusqu'à ce que la clé du bake porte le zoom courant, et
**REFUSE de répondre** sinon.

#### Décision de Raph (2026-08-23) : « l'ombrage, pas le terrain » — ⚠ PRISE SUR UNE MESURE FAUSSE

Raph a tranché pour l'ombrage de la ville après ma « trouvaille » ci-dessus. **Celle-ci s'est révélée
être un artefact de cadrage** (cf. l'encadré). La décision reposait donc sur un fait qui n'existe pas,
et elle lui revient à nouveau, en connaissance de cause :

- la **campagne** est bien plate (0,4 à 3,4) — les **lots 1 et 2 visaient juste** ;
- la **ville** est la zone la plus modulée de l'image (12 à 15,7), et elle ne se dégrade pas avec
  l'ère.

Reste vrai indépendamment de tout ça : `PLAN-RENDU-VILLE.md` a mesuré que **« à la bande 4, 848
bâtiments sur 849 tiennent entre 44 et 66 px dessinés »**. C'est un déficit de hiérarchie réel — mais
il porte sur les HABITATIONS, et la capture montre que les bâtiments-moteur, eux, donnent de vraies
masses. Ce n'est pas le même grief que « tout est plat ».

**⛔ PISTE ESSAYÉE ET RÉFUTÉE : corréler la TEINTE des habitations par îlot.** L'idée était de faire
s'accorder les voisines (le tirage de teinte est un pile ou face indexé sur les coordonnées de
chaque tuile, donc du sel et poivre) pour fabriquer des îlots de matière. **Sans effet, ni à la
sonde ni à l'œil** — et la mesure dit pourquoi : **les teintes sont ISO-LUMINEUSES** (`calcaire`
décale la clarté de +3,2, `ardoise` de 0,0). Elles échangent la matière en préservant la valeur,
ce qui est correct pour un échange de matière et disqualifiant pour du relief lumineux.
Essai retiré, raison consignée dans `housePalette.js`. **Ne pas rejouer.**

→ **Le levier d'une modulation de VALEUR est la HIÉRARCHIE DE MASSE**, pas la couleur. Et le dépôt
la porte déjà, calculée et jamais dessinée : les **`districts`** (19 emprises civiques typées —
palace, forum, archive — avec leurs positions et leur taille, `layout.js:2500-2538`) et **`qkind`**
(l'identité de quartier, écrite sur chaque tuile en `buildingGenerator.js:257` et `:305`, **lue par
personne dans tout le dépôt** — deux écritures, zéro lecture, vérifié). C'est là qu'il faut aller.

⚠ Autre piège de méthode : `__demoCity` n'a **pas** d'option `era` (elle prend `{pop, buildings,
frames}`), et elle est `async` — sous pane masquée ses `setTimeout` sont étranglés, donc elle ne
peut pas être attendue. Monter une ère se fait en SYNCHRONE : écrire `state.population`, appeler
`__cityRecompute()`, puis jouer des `captureFrame`. Échelle relevée : `1e12` → bande 1, `1e23` →
bande 4, `1e45` → bande 7.

---

### Lot 1 — ⭐ LE FLEUVE S'ENFONCE (l'entrée recommandée)

**Ce que ça fait.** La nappe d'eau descend à `−3 U`. La berge devient une vraie marche : le mur
de quai en est la face maçonnée (déjà dessinée, à raccorder), les berges naturelles en reçoivent
une face de terre/roche, la grève devient une **pente** de 2 sous-marches au lieu d'un anneau de
sable à plat, les îles reçoivent un rebord.

**Pourquoi en premier.** Trois raisons :
1. C'est le seul lot qui **corrige une incohérence existante** au lieu d'ajouter une couche.
2. C'est la marche que l'œil attend le plus fort : une rive sans dénivelé est le signal n°1 de
   « c'est un autocollant ».
3. C'est le lot le mieux **borné** : le fleuve est déjà un ruban tracé point par point.

**Comment.** Trois points d'entrée, pas plus :
- `riverRibbonScreen` (`isoRenderer.js:3585-3586`) — les deux `worldToScreen` du ruban prennent
  `WATER_Z`. Le lit, les vagues, les bateaux, les reflets suivent par construction.
- `islandOutline` (`:3620`) — idem pour le contour d'île.
- Le mur de quai (`renderWorld.js:783`) — `wallTiles` se dérive de `WATER_Z` au lieu d'être une
  constante par ère ; son test `waterBelow` par sample devient **redondant avec la géométrie**
  (la face regarde +x/+y ou elle est cachée) et peut être conservé comme garde-fou.
- **Neuf** : la face de berge NATURELLE, là où le quai ne trace rien (`quayGapRuns`) — même
  ruban, matière de terre, deux assises comme le mur.

**⚠ Le pont.** Le tablier reste à 0 — ce qui devient enfin *juste* : aujourd'hui il est posé
sur l'eau. Mais le travail `buryClip` / `dryRuns` du 2026-08-22 (non commité) vit exactement à
ce joint : **le lot 1 doit être ouvert APRÈS que ce travail soit commité**, et son test
d'enterrement rejoué.

**Recette d'acceptation :**
- diff de canvas avant/après sur les 3 captures ;
- garde : la face de berge naturelle et le mur de quai ont **la même hauteur au sample de
  jonction** (test pur, sans canvas) ;
- garde : aucun pixel d'eau au-dessus de la ligne de berge sur la rive éloignée.

**Molette :** `__relief({ water: 0..3 })` — `0` rejoue l'état actuel.

**Coût : 2 à 3 jours.**

---

### Lot 2 — Les collines hors ville

**Ce que ça fait.** Un champ `H(gx, gy)` entier en unités `U` :
- `0` sur l'emprise de la ville et sur une bande de raccord lissée autour ;
- montée par bruit de valeur basse fréquence au-delà (les fréquences de `cmValueNoise` du
  prototype legacy sont déjà réglées : `HILL_BIG = 9`, `HILL_DETAIL = 3.3`) ;
- vallée creusée le long de `riverYAt`.

Le sol blitte à `worldToScreen(gx·T, gy·T, H·U)`. Toute cellule dont le voisin SUD ou EST est
plus bas dessine ses **faces visibles** — et seulement celles-là : en 3/4 on ne voit que les
faces tournées vers +x et +y (règle de la marche, § 1.3). Arbres, buissons, props lisent `H` à
leur pied.

**Coût de rastérisation, estimé.** Avec une marche tous les ~4 tuiles, ~1 cellule sauvage sur 4
porte des faces, à 2 quads chacune. Sur les ~100 cellules sauvages visibles à zoom 1 : **~50
`fill` de plus par recuisson**, contre les 140 à 960 ms que coûte déjà une recuisson pleine.
L'ordre de grandeur est négligeable — **à confirmer par mesure au dézoom**, où le nombre de
cellules explose.

**⚠ Les allégés.** `ISO_GROUND_LOD.on` (HARD) doit sauter les faces ; `light` peut les garder.
Sinon on paie le relief en plein geste, exactement là où le budget n'existe pas.

**Recette d'acceptation :**
- test pur : `H` est entier, `H = 0` partout sur `urbanSet ∪ roadSet ∪ buildFoot` ;
- test pur : la table des faces visibles ne rend jamais une face −x ou −y ;
- test pur : à `z = k/8`, le décalage écran de toute cellule est un entier (§ 2.1) ;
- mesure : temps de recuisson pleine avant/après, à zoom 1 / 0,5 / 0,35.

**Molette :** `__relief({ hills: 0..6, seed })`.

**Coût : 4 à 6 jours** (le champ est facile, les faces et le raccord à la lisière ne le sont pas).

---

### Lot 3 — L'ombrage à grande échelle

**Ce que ça fait.** Le hillshade du prototype legacy (`cityMapDrawTerrain`), porté en iso —
mais calculé depuis **le même `H` que le lot 2** et cuit **DANS le bake du sol**, pas blitté en
`soft-light` plein écran à chaque frame.

**Pourquoi pas seul, et pourquoi pas en overlay.** Deux raisons dures :
1. Sans le lot 2, c'est du papier peint sous des objets plats — le prototype legacy le dit
   lui-même en commentaire, et c'est pour ça qu'il s'interdisait la ville.
2. `PLAN-RENDU-VILLE.md` a établi que **le budget de contraste est déjà dépensé au mauvais
   endroit** (toit contre pavé : 7,5 points d'écart, quand la chaussée en a 29). Un voile
   plein écran ajouterait du brouillard sans ajouter de structure — il aggraverait la maladie
   n°1 pour soigner la n°3.

**⚠ Lumière HAUT-GAUCHE, ombres BAS-DROITE** (`map-lighting-shadow-direction`). Le prototype
legacy calcule `shade = dHdx + dHdy`, ce qui est cohérent ; à re-vérifier après portage iso, où
les axes monde ne sont plus les axes écran.

**Molette :** `__relief({ shade: 0..1 })`.

**Coût : 2 jours** après le lot 2. **Ne pas ouvrir avant.**

---

### Lot 4 — Le volume de la masse végétale (indépendant, et rentable)

**Ce que ça fait.** 40 % de l'image est une forêt d'un seul ton. Sans toucher à la géométrie :
un multiplicateur de valeur par arbre, tiré du même bruit basse fréquence que les fourrés
(`cmCellNoise`, déjà partagé entre forêt sauvage et arbres de ville), plus une occlusion douce
au cœur des fourrés denses.

**Pourquoi c'est le meilleur rapport effort/effet.** Aucune projection, aucun bake, aucun tri,
aucun hit-test. C'est un ton par sprite. Et c'est la plus grande surface plate de l'image.

**⚠ Ne pas se tromper d'échelle.** Le bruit doit être à l'échelle du **massif** (10-20 tuiles),
pas de l'arbre : un bruit fin rendrait des confettis, exactement le défaut que `cmCellNoise` a
été introduit pour corriger sur la dispersion.

**Recette :** sonde du lot 0 sur la zone forêt — l'écart-type de luminance à grande échelle doit
monter de façon mesurable, sans que l'écart-type LOCAL (grain) bouge.

**Molette :** `__canopy({ amp })`.

**Coût : 1 à 2 jours. Peut être fait en parallèle, ou en premier si on veut un effet visible
tout de suite.**

---

### Lot 5 — ÉCARTÉ : le relief DANS la ville

Terrasses, escaliers entre îlots, bâtiments à cheval sur deux niveaux. **Recommandation :
ne pas ouvrir.** Casse les cinq points du § 3 d'un coup (hit-test, peintre, agents, tissu, save)
et contredit une règle que Raph a lui-même posée. Le seul dénivelé urbain acceptable est le
**bord du plateau** à la limite de la ville, que le lot 2 rend gratuitement.

Si l'envie revient : rouvrir ce § avec les chiffres du lot 2 en main, pas avant.

---

## 5. Les pièges connus d'avance

| Piège | Pourquoi il mordra | Parade |
|---|---|---|
| **Invalidation du bake** | Ce projet s'est fait avoir **trois fois** (plage gelée, bas-fond de quai, saison). Le relief entre dans le sol baké ET dans le cache de crans. | `':rl' + version + amplitude` dans `key` ET dans `cacheBase` — désormais dans **`isoGroundBake.js`**. ⚠ Le plan citait `isoRenderer.js:10578-10592` : périmé, ce code a déménagé au découpage Q10 et le fichier fait 279 lignes. **Le piège n° 7 de ce tableau a mordu le tableau lui-même.** |
| **Culling** | `visibleCellBounds` / `visibleDiamondBounds` calculent sur un plan. Une cellule levée de 72 px dont la base est sous le bord bas reste visible. | `marginDownPx += Hmax · U · z`. |
| **Quantification du zoom** | Une marche non multiple de `T/4` rouvre la couture inter-losanges. | § 2.1, avec un test propriété. |
| **Tri du peintre** | `isoUnitDepth` est aveugle à la hauteur (P23). | Ville à 0 (§ 3). Sens de défaillance sûr : le sol est baké avant les sprites. |
| **HMR** | Toucher `layout`/`renderer` sous Vite donne un double graphe. | **Hard reload** systématique (`iso-migration-plan`). |
| **Capture de l'eau** | L'œil ment sur l'eau (3 refus historiques). | **Diff de canvas**, jamais le jugé. |
| **Numéros de ligne** | `isoRenderer.js` a pris +49 % en 24 jours. | Se ré-ancrer par **nom de symbole**, jamais par ligne (leçon `suppression-legacy-carte`). |

---

## 6. Ce qu'on ne refait pas

- **Le voile `soft-light` plein écran seul** — c'est le prototype legacy, il est du papier peint
  sans géométrie sous lui, et il dépense du contraste là où `PLAN-RENDU-VILLE` dit de ne pas.
- **Réécrire la carte** — refusé, preuves à l'appui (`suppression-legacy-carte`).
- **Une fraction de grille comme unité** — le § 2.1 tranche : `T/4`, entier, point.
- **Toucher au bois du pont de Raph** sans son accord (`pont-sprite-stade0`).

---

## 7. Ordre proposé et budget

| # | Lot | Coût | Effet visible | Dépend de |
|---|---|---|---|---|
| 0 | La mesure | 0,5 j | — | — |
| 4 | Volume de la végétation | 1-2 j | **fort**, immédiat | — |
| 1 | ⭐ Le fleuve s'enfonce | 2-3 j | **fort** | pont commité |
| 2 | Collines hors ville | 4-6 j | fort | lot 1 |
| 3 | Ombrage à grande échelle | 2 j | moyen | lot 2 |
| 5 | Relief dans la ville | — | — | **écarté** |

**Total 1+2+3+4 : ~10 à 14 jours**, chaque lot livrable et réversible seul derrière sa molette.

**Deux entrées possibles selon ce qu'on veut d'abord :**
- **Voir quelque chose vite** → lot 4 (la forêt), puis lot 1.
- **Attaquer la vraie cause** → lot 0 puis lot 1 (le fleuve), qui installe l'axe Z et l'unité
  `U` dont tout le reste dépend.

Dans les deux cas le **lot 0 se fait en premier** : sans sonde, on ne saura pas dire si un lot
a ajouté du relief ou seulement du brouillard.
