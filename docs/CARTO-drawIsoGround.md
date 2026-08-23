# Cartographie de `drawIsoGround` — 1 164 lignes, 9 passes

*Dressée le 2026-08-23, à la fin de la phase mécanique de Q10 (cf. `PLAN-SUPPRESSION-LEGACY.md` §6).*
*C'est une ANALYSE. Rien n'a été déplacé. Elle existe pour qu'une décision soit prise avant d'écrire.*

`isoRenderer.js` est passé de 11 039 à 3 368 lignes en 19 tranches de **déplacement pur**. Il en reste
2 593 dans trois fonctions, dont celle-ci. **La méthode qui a porté les 19 tranches ne s'y applique
plus** : ce ne sont pas des déclarations posées côte à côte, mais une fonction longue dont les passes
partagent des variables **locales**. Les séparer demande de rendre cet état explicite — donc de changer
des signatures, donc de perdre la preuve par identité des octets.

Cette carte dit exactement **combien** d'état est partagé, **par qui**, et ce que coûterait la coupe.

---

## 1. Les neuf passes

| | passe | lignes | taille |
|---|---|---|---|
| **A** | Préambule & RÉSOLUTION — locals, ensembles dérivés du layout, `kindAt` | 393-651 | 259 |
| **B** | BALAYAGE des cellules — la boucle `gy`/`gx` qui peint chaque losange | 652-873 | 222 |
| **C** | PARVIS — dallage puis margelle des merveilles | 874-886 | 13 |
| **D** | VOILES + HERBE — vidange des voiles remisés, sprites de touffes | 887-898 | 12 |
| **E** | FRANGE D'HERBE — les langues à la jonction herbe↔sol | 899-906 | 8 |
| **F** | ROUTES — rubans, couloirs fusionnés, épaulement, TROTTOIRS, gorge | 907-1334 | **428** |
| **G** | SEUILS d'allée + fermeture de la COUCHE DE MARCHE | 1335-1385 | 51 |
| **H** | ~~TERRE-PLEINS plantés des boulevards~~ → **SORTIE** (`f40299f`, cf. §6) | 1386-1547 | 162 |
| **I** | Épilogue — profileur, `ctx.restore()` | 1548-1556 | 9 |

*Les numéros de ligne sont ceux du 2026-08-23 avant la sortie de H ; ils ont glissé depuis.
**Re-mesurer avant chaque coupe** — c'est la règle de tout ce chantier.*

**L'ordre n'est pas arbitraire, il est PICTURAL** : chaque passe recouvre la précédente. La frange
d'herbe mord sur des cellules déjà peintes, puis la route recouvre ce qui la borde, puis le seuil rentre
sous la façade. Un découpage qui laisserait l'ordre au hasard casserait le rendu sans rien casser au
lint.

## 2. Le couplage — 80 locales, dont 17 partagées

| partage | nombre | ce que ça veut dire |
|---|---|---|
| **≥ 3 passes** | **17** | c'est le CONTEXTE : elles devraient devenir un objet passé aux passes |
| 2 passes | 14 | des liens de voisinage, la plupart producteur→consommateur |
| 1 seule passe | 49 | partiraient sans douleur |

**Les 17 du cœur**, avec les passes qui les lisent :

```
9 passes  ctx          [ABCDEFGHI]     8 passes  PR           [ABDEFGHI]
6 passes  hw           [ABCDEF]        5 passes  T, L         [ABFGH]
4 passes  hh [ABCD] · z [AFGH] · LOD [ABFG] · roadMap [ABFG] · urb [ABEF]
3 passes  roads [ABF] · fringes [ABE] · wonderCells [ABC] · HARD [ABF]
          wg [ABC] · kindAt [ABF] · grassCells [ABD]
```

**Elles ne sont pas toutes de même nature, et c'est ce qui rend la coupe faisable :**

1. **Dérivables de `CM` en une ligne** — `ctx`, `T`, `z`, `hw`, `hh`, `L`, `LOD`, `HARD`, `band`.
   Neuf des dix-sept. Un objet construit une fois en tête de fonction les porte toutes.
2. **Ensembles dérivés du LAYOUT** — `roadMap`, `urb`, `wg`. Calculés en A, lus partout. Même objet.
3. **TAMPONS D'ACCUMULATION** — `grassCells`, `wonderCells`, `fringes`, `roads`. Remplis par **B**,
   consommés par **C**, **D**, **E**, **F**. C'est une relation PRODUCTEUR → CONSOMMATEUR, donc une
   interface propre : la passe B les *retourne*.
4. **Le résolveur** — `kindAt`, mémoïsé, qui capture `kinds`, `L`, `roadMap`, `riverCells`,
   `plazaSceneReady`, `wg` et les ensembles de grève. C'est le HUB de la passe A.
5. **Le profileur** — `PR`, lu par 8 passes, écrit par toutes. Transversal par nature.

**Un couplage à part, et il faut le nommer** : `lay` / `sctx` (F↔G) sont la **couche de marche** — un
canevas à la résolution du pixel d'art, ouvert au milieu de F (`walkLayerBegin`) et fermé en G
(`walkLayerEnd`). Ce n'est pas une donnée, c'est une **ressource à durée de vie**. Deux modules qui se
la passent en paramètre seraient fragiles ; la bonne forme est une portée (`withWalkLayer(z, (sctx) =>
…)`), ce qui suppose que F et G restent **ensemble**.

## 3. Découpage proposé

| module | contenu | passes | ~lignes |
|---|---|---|---|
| `iso/isoGroundResolve.js` | `kindAt`, `grassAt`, `keyOfKind`, `frontierFlips`, `urbanLogical`, ensembles de grève, `built`/`courK`/`kinds` | A | ~250 |
| `iso/isoGroundCells.js` | la boucle de cellules ; **retourne** les quatre tampons | B | ~220 |
| `iso/isoGroundRoads.js` | rubans, couloirs, épaulement, trottoirs, gorge, seuils, couche de marche | F + G | ~480 |
| `iso/isoGroundMedian.js` | terre-pleins plantés | H | ~162 |
| *reste dans isoRenderer* | construction du contexte, ORDRE des passes, gates du bake allégé, profileur, C/D/E (33 l. au total) | — | **~180** |

`drawIsoGround` passerait de **1 164 à ~180 lignes de coordination** — et ces 180 lignes seraient
lisibles : construire le contexte, résoudre, balayer, puis peindre dans l'ordre.

Le contexte à threader compte **~12 champs**. C'est beaucoup pour un paramètre, c'est peu pour un objet
nommé (`bake`) dont chaque champ a une raison d'être. La ligne rouge : **si l'on se retrouve à passer
dix paramètres séparés, c'est raté** — il faut alors s'arrêter et revoir la découpe.

## 4. Comment on le PROUVE — le point dur

Les 19 tranches précédentes étaient prouvées par **identité des octets** contre la version commitée.
**Ici, le code change** : la preuve tombe. Et le harnais d'empreinte de canvas ne la remplace pas — il a
été essayé et invalidé PAR TÉMOIN (une empreinte n'est pas stable à travers un rechargement : sprites
décodés en asynchrone, sauvegarde qui s'accumule, phases d'animation sur l'horloge).

**La garde qui marche ici est un A/B DANS LA MÊME SESSION**, exactement l'idiome que ce dépôt a déjà
utilisé pour retirer le rendu legacy (`__iso(false)`) :

1. garder l'ancienne `drawIsoGround` sous un drapeau dev (`__groundSplit`) le temps du chantier ;
2. dans **une seule page**, sur **le même layout**, cuire le sol avec l'ancienne puis la nouvelle et
   **comparer les canevas pixel à pixel** — le bake est déterministe à art décodé constant, ce que la
   même session garantit ;
3. répéter sur plusieurs ères et aux deux niveaux de bake allégé (HARD et LIGHT), qui empruntent des
   chemins différents ;
4. retirer le drapeau et l'ancienne fonction une fois l'égalité constatée.

⚠ **Ce que ce chantier risque, et que les 19 tranches ne risquaient pas** : une variable qu'on croit
locale à une passe et qui était en réalité lue par une autre. Le lint ne le voit pas (elle existe des
deux côtés), les tests ne le voient pas (ils ne cuisent pas de sol), le build ne le voit pas.
**Seule la comparaison de pixels le voit.** C'est pour ça qu'elle n'est pas optionnelle.

## 5. Ce qui reste à décider — et c'est une décision de Raph

1. **Y va-t-on ?** Le gain est réel (un peintre lisible, quatre passes testables à part) ; le coût est
   un chantier à garde-fou, pas une série de déplacements sûrs.
2. **Si oui, dans quel ordre ?** Le moins risqué est **H (terre-pleins, 162 l.)** en premier : c'est la
   passe la moins couplée, elle sert de banc d'essai au contexte et au harnais A/B avant d'attaquer
   F (428 l.) et B (222 l.).
3. **Le contexte est-il un objet nommé ?** Ma recommandation : oui, un `bake` explicite. La ligne rouge
   des dix paramètres séparés est ce qui ferait renoncer.

---

## 6. ✔ FAIT — la passe H (terre-pleins), et ce qu'elle corrige de cette carte

*Commit `f40299f`. `drawIsoGround` : 1 164 → **1 007 lignes**. `isoRenderer` : 3 368 → 3 210.*
La passe a rejoint `isoStreet.js`, où sa config vivait déjà (`MEDIAN_TUNE`, `BED_PALETTES`,
`medianSlots`) — consolidation plutôt que nouveau module.

### ⚠ La prévision du §4 était trop pessimiste, et il faut le corriger ici

Ce document annonçait : « le code change, donc la preuve par identité des octets tombe ». **Faux pour
cette passe.** Mesure faite avant de couper : son corps ne lit que **quatre** variables de l'englobante
— `ctx`, `tp`, `T`, `z`. Elles deviennent des **paramètres du même nom**, et le corps est exactement un
bloc `if` : les **154 lignes passent sans une ligne de changée**, sous un simple en-tête de fonction.

**La règle affinée**, qui vaut pour les passes suivantes :

> Si les lectures d'une passe vers son englobante sont **peu nombreuses** et peuvent devenir des
> **paramètres de même nom**, alors ce n'est PAS une refonte de signature : c'est encore un déplacement
> pur, et l'identité des octets le prouve. L'A/B pixel du §4 n'est nécessaire que lorsque le code change
> VRAIMENT — c'est-à-dire quand il faut introduire un objet de contexte, ce qui arrivera pour B et F.

### ✔ La garde qui manquait, elle, est bien nécessaire — et elle est nouvelle

Le risque propre au découpage d'orchestrateur n'est pas l'import oublié : c'est **un nom du corps qui
résout en silence vers une AUTRE liaison dans le module d'accueil**. Le lint ne le voit pas — le nom
existe des deux côtés, il résout. Simplement, vers autre chose.

→ `scratchpad/collision.cjs` : intersection entre les **locales de la fonction d'origine** et les **noms
de niveau module de la destination**, restreinte à ceux **effectivement utilisés dans le corps déplacé**.
Pour cette passe : 90 locales × 71 noms de module → **zéro nom en commun dans le corps**. Aucune
résolution ne peut basculer.

**Cette vérification est OBLIGATOIRE à chaque passe.** C'est elle, pas les tests ni le build, qui couvre
le risque que ce chantier ajoute.

## 7. ✔ FAIT — C, D, E : ce qu'on croyait extraire n'était pas ce qu'il fallait extraire

*Commit `4cc8d18`. `drawIsoGround` : 1 007 → **989 lignes**.*

Le §6 annonçait « C/D/E : à traiter ensemble ou pas du tout ». **Après lecture, la réponse est : ni
l'un ni l'autre.** Telles quelles, ces 33 lignes **SONT de la coordination** — elles bouclent sur un
tampon et appellent un peintre vivant déjà ailleurs, et leurs commentaires disent l'**ordre** (« le
dallage PUIS la margelle », « voile sous fleur », « après le fond, AVANT les rubans »). Les sortir en
modules de dix lignes aurait retiré de l'orchestrateur la seule chose qu'il doit exprimer.

**Ce qui méritait de bouger, c'est le FORMAT DES TAMPONS.** `wonderCells` et `grassCells` sont des
tableaux **plats empaquetés par 4** (`gx, gy, px, py`) et l'orchestrateur connaissait ce détail à trois
endroits. Ce format regarde qui remplit et qui lit, pas qui ordonne. Donc les **boucles** rejoignent
leurs peintres — `drawWonderGroundAll`, `drawGrassDetailAll`, `drawGrassFringeAll` — et l'ordre, les
commentaires qui l'expliquent et le chronomètre restent.

> **La leçon, et elle vaut pour B et F** : dans un orchestrateur, la question n'est pas « ce bloc
> peut-il sortir ? » mais « **qu'est-ce qui, dans ce bloc, n'est pas de la coordination ?** ». Souvent
> ce n'est pas le bloc — c'est un DÉTAIL D'IMPLÉMENTATION qu'il porte pour un autre.

⚠ `flushVeils()` **reste** : c'est une fermeture sur le tampon de voiles que la boucle de cellules
remplit (`veilPush`). Elle partira **avec la passe B**, pas avant — producteur et consommateur
voyagent ensemble, comme l'état de saison l'a montré ailleurs dans ce chantier.

## 8. ✔ FAIT — la passe B (balayage de cellules) : le contexte, enfin

*Commits `14e46a2` (prélude) et `7e07627`. `drawIsoGround` : 989 → **801 lignes**. isoRenderer : 2 922.*

**Un prélude a été nécessaire.** La boucle appelait deux choses vivant au niveau module d'isoRenderer :
`blitIsoTileKey` et `ISO_GROUND_SLICE`. Le blitteur est **rentré chez lui** dans `isoGroundTiles.js` —
cinq de ses sept dépendances y vivaient déjà, les deux autres y étaient importées : **le rapatriement
n'a coûté aucun import nouveau**, signe qu'il était dû. (L'en-tête d'`isoGroundTiles` affirmait le
contraire depuis sa création ; c'était vrai le jour où il est né, plus après.) `ISO_GROUND_SLICE`, lu
seulement, voyage dans le contexte.

### Le contexte : trois objets, DESTRUCTURÉS À L'ENTRÉE

27 lectures vers l'englobante — bien au-delà de la ligne rouge des dix paramètres du §3. Mais écrire
`bake.ctx` partout aurait eu **deux** coûts : réécrire 194 lignes, et payer un accès de propriété par
cellule dans **la boucle la plus chaude du bake** (~33 ms sur 87). D'où :

```js
export function sweepIsoGroundCells(bake, resolve, out) {
  const { ctx, T, hw, hh, LOD, HARD, b, … , PR } = bake;
  const { kindAt, grassAt, keyOfKind } = resolve;
  const { fringes, roads, wonderCells, grassCells, veilPush } = out;
  … 194 lignes reprises SANS UNE LIGNE DE CHANGÉE …
}
```

> **La technique à retenir** : un objet de contexte **destructuré en tête** rend les locales *à leur
> nom*. Le corps reste byte-identique — donc la preuve du §4 tient — et le code compilé retrouve ses
> variables locales, donc la boucle chaude ne paie rien. **Condition** : qu'aucun de ces noms ne soit
> RÉASSIGNÉ dans le corps (vérifié avant la coupe ; ici, aucun). Les tampons, eux, sont MUTÉS — légal
> et voulu.

Et les trois objets ne sont pas qu'un emballage : ils **disent ce que la passe fait**. Elle reçoit un
contexte de cuisson, pose des questions, et remise ce qui se peindra en fournées.

⚠ **P31 a mordu une seconde fois** : `groundTileDose.test.js` verrouille la formule
`texAlpha = kind === 'urban' ? 0` en la cherchant dans le **texte** du source. Aucun balayage de
symboles ne peut voir partir une garde qui ne porte aucun nom. Elle suit désormais `isoGroundCells.js`.

### La suite

Il ne reste que **F** (routes + seuils + couche de marche). C'est la plus grosse et la plus couplée :
elle ouvre la couche de marche au milieu d'elle-même et la referme dans la passe suivante — une
**ressource à durée de vie**, pas une donnée (cf. §2). La technique du contexte destructuré devrait
s'y appliquer aussi ; ce qui demandera un choix, c'est la portée de `walkLayerBegin`/`walkLayerEnd`.

⚠ C'est aussi à partir de B et F que la prévision du §4 redeviendra vraie : là, un objet de contexte
sera inévitable, et l'A/B pixel avec lui.

---

Tant que la suite n'est pas tranchée, `isoRenderer.js` reste à 2 922 lignes — et c'est un état sain :
chaque passe qui pouvait sortir est sortie, ce qui subsiste est un peintre et sa coordination.
