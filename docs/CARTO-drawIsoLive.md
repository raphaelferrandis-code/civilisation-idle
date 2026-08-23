# Cartographie de `drawIsoLive` — 936 lignes, 8 phases

*Dressée le 2026-08-23, juste après la clôture de `CARTO-drawIsoGround.md` (Q10, cf.
`PLAN-SUPPRESSION-LEGACY.md` §6). C'est une ANALYSE : rien n'a été déplacé.*

`drawIsoLive` est la passe VIVE de la carte — tout ce qui bouge ou se pose par-dessus le sol baké :
bâtiments, arbres, habitants, véhicules, lampadaires, ponts, bateaux, émeutiers. C'est la deuxième des
trois grosses fonctions d'`isoRenderer.js` (2 146 l. aujourd'hui).

> **Ce qu'on sait déjà, et qui change la lecture de cette carte.** La carte du sol prévoyait que
> découper un orchestrateur imposerait des changements de signature. **C'était faux** : les six coupes
> ont toutes été des déplacements purs, grâce au **contexte destructuré en tête** (les locales
> retrouvent leur nom, le corps reste byte-identique, la boucle chaude ne paie rien). Cette carte part
> donc de l'hypothèse inverse : **c'est extractible tel quel, sauf preuve du contraire.**

---

## 1. Une architecture bien plus nette que celle du sol

| | phase | lignes | taille |
|---|---|---|---|
| **1** | Préambule — locals, survol, remise à zéro du pool d'items | 394-427 | 34 |
| **2** | **COLLECTE** — onze `pushItem` : bâti, arbres, bestioles, forêt, places, mobilier, clôtures, merveilles, décor d'île, ponts, émeute | 428-811 | **384** |
| **3** | TRI — `items.sort((a, b) => a.d - b.d)`, le peintre | 812-818 | 7 |
| **4** | Stats d'items (opt-in `__isoItemStats`) | 819-871 | 53 |
| **5** | Préparation du dessin — mémo d'arbres, lots GPU, émeute | 872-949 | 78 |
| **6** | **DESSIN** — `for (const it of items)`, aiguillage sur `it.kind` | 950-1285 | **336** |
| **7** | Composition — `glCompose`, passe FANTÔME, fin de couche lumière | 1286-1312 | 27 |
| **8** | Poofs d'apaisement | 1313-1328 | 16 |

**Là où le sol était une suite de passes qui se recouvrent, celle-ci a une forme classique et lisible :
COLLECTE → TRI → DESSIN → COMPOSITION.** C'est un peintre à liste d'affichage. Le tri est ce qui donne
son sens à tout le reste (profondeur `wx + wy`), et il tient en une ligne.

⚠ Le **DESSIN** est un aiguillage sur `it.kind` — **17 branches** : `tile` (la plus grosse, 108 l. :
bâtiments et habitations), `tree`, `critter`, `plazaProp`, `plazaGrid`, `plazaScene`, `smoke`,
`revealpin`, `wonder`, `plaisirs`, `lamp`, `fence`, `bush`, `bridgeSeg`, `portBoat`, `veh`, `riot`.

## 2. Le couplage — 39 locales, dont 10 partagées

| partage | nombre |
|---|---|
| **≥ 3 phases** | **10** — `items` (7), `z` (6), `ctx` (5), `T`/`L`/`b` (4), `band`/`eraIdx`/`smokeK`/`glCompose` (3) |
| 2 phases | 17 — pour l'essentiel **l'état des lots GPU** |
| 1 seule phase | 12 |

**Dix contre dix-sept pour le sol** : cette fonction est nettement moins enchevêtrée. Et le contexte se
lit tout seul — `{ ctx, T, z, hw, hh, b, L, band, eraIdx, smokeK }`, plus `items`.

⚠ **L'ÉTAT DES LOTS GPU est le seul nœud, et il est local.** `glOn`, `glPending`, `glRuns`,
`glSprites`, `gbx0/gby0/gbx1/gby1` sont **RÉASSIGNÉS** (l. 898, 910, 922-923, 1092-1094) — donc
indéplaçables séparément (cf. P28 du plan). Mais toutes ces écritures tombent **entre 872 et 1312** :
si les phases **5-6-7 partent ensemble**, l'état voyage avec son écrivain et la contrainte disparaît.
C'est exactement ce qui s'est passé pour l'état de saison et pour la couche de marche.

## 3. Les deux coupes, et ce qu'elles coûtent

| coupe | lignes | lit de l'englobante | module proposé |
|---|---|---|---|
| **phase 2** — la COLLECTE | 384 | **9** : `T, L, b, band, dvVis, items, z, smokeK, eraIdx` | `iso/isoLiveCollect.js` |
| **phases 5-6-7** — le DESSIN | 441 | **12** : `ctx, T, z, hh, hw, items, L, b, houseBoxes, band, eraIdx, smokeK` | `iso/isoLivePaint.js` |

Neuf et douze : **très en-dessous de la ligne rouge**, et le contexte destructuré s'applique tel quel.
Restent en place le préambule, le TRI (une ligne — c'est le cœur de la coordination), les stats opt-in
et les poofs : **~110 lignes**.

→ `drawIsoLive` passerait de **936 à ~110 lignes**, et se lirait : *collecter, trier, peindre, composer.*

## 4. Les préludes — à sortir AVANT, comme `blitIsoTileKey` l'a été pour le sol

Quatre attaches de niveau module qu'il faudra traiter en premier (aucune n'est un obstacle) :

| nom | usages | où il devrait aller |
|---|---|---|
| ✔ `plaisirsSprite` + `PLAISIRS_PPT` | collecte + dessin | **FAIT** (`76b2003`) → `isoPlaisirs.js` |
| `ISO_ITEM_POOL` / `ISO_ITEM_VIEW` | collecte | avec la COLLECTE — c'est SON pool |
| `drawTreeIso` | dessin | avec le DESSIN |
| `HOUSE_BOX_CAP` | dessin | avec le DESSIN (garde-fou mémoire des boîtes de lot) |

**✔ Prélude fait — la MAISON DES PLAISIRS** (`76b2003`, 75 l. → `isoPlaisirs.js`, qui portait déjà
l'aura, l'anneau et le ciel du monument ; il ne lui manquait que le monument). **Zéro import nouveau** :
le signe habituel que le rapatriement était dû. Au passage, `cityMapRuntime` cesse de demander au
PEINTRE si un clic tombe sur la maison — il le demande à la maison. `isoRenderer` : 2 146 → **2 071**.

### ⚠ Correction de ce document : le bloc « survol + pool » N'EST PAS un prélude

Ce paragraphe annonçait le bloc « SURVOL + pool d'items » (59 l., 0 entrante) comme « le prélude
naturel ». **La mesure dit non.** Il contient **trois sujets qui appartiennent à trois endroits
différents** :

- `ISO_ITEM_POOL` / `ISO_ITEM_VIEW` → lus par la **COLLECTE** (l. 430, 432) ;
- `drawTreeIso` et `HOUSE_BOX_CAP` → lus par le **DESSIN** (l. 1107, 1009, 1019) ;
- `HOVER_CELL` / `drawIsoHoverCell` → lus par le **préambule** (l. 412) : ils restent au peintre.

L'extraire en un module aurait produit un fichier incohérent — « le pool, les arbres et le survol » —
au lieu de trois pièces bien logées. **Chacune voyagera avec sa phase.** C'est la leçon de C/D/E sur la
carte du sol, sous une autre forme : la bonne question n'est pas « ce bloc peut-il sortir ? » mais
**« où chaque chose appartient-elle ? »**.

## 5. Ce que cette carte NE propose pas

**L'aiguillage sur `it.kind` reste un aiguillage.** Le transformer en table de dispatch
(`PAINTERS[it.kind](it, bake)`) serait une VRAIE refonte : chaque branche devrait recevoir le même
contrat, alors qu'elles lisent aujourd'hui des locales différentes. C'est une piste, pas une tranche —
et surtout, ce serait le premier changement de ce chantier qui **ne serait plus un déplacement pur**,
donc le premier à devoir passer par l'A/B pixel décrit dans `CARTO-drawIsoGround.md` §4.

À ne pas confondre avec le découpage proposé au §3, qui lui reste mécanique.

## 6. Ordre conseillé

1. ~~**Le prélude**~~ ✔ **FAIT** : la Maison des
   Plaisirs est rentrée chez elle (`76b2003`). Le bloc « survol + pool » n’en était PAS un — cf. §4.
2. **La COLLECTE** (384 l., 9 lectures) — la plus simple des deux, et elle valide le contexte.
3. **Le DESSIN** (441 l., 12 lectures), phases 5-6-7 ENSEMBLE pour que l'état GPU voyage avec ses
   écritures.

Et à chaque coupe, le protocole désormais rodé : mesurer la couture, vérifier qu'aucun nom n'est
réassigné, **passer la garde de collision** (`scratchpad/collision.cjs`), prouver l'identité des octets,
puis lint + tests + build + une cuisson à l'écran.
