# Reprise — le tracé vectoriel de la carte iso

État au 2026-08-05. Doc de passation : où en est le tracé vectoriel, ce qui a déjà
été traité, ce qui reste, et **quel remède va sur quel site** — parce qu'ils ne
prennent pas tous le même.

Question d'origine (Raph) : « on peut pas retirer le tracé vectoriel ? », puis
« remplacer par des tuiles/sprites, faudra faire ça non ? ».

Réponse courte : **on ne le retire pas, on le convertit — et « en sprites » n'est
le bon remède que pour les CHAMPS.** Les trois autres sites ont chacun le leur, et
pour l'un d'eux le sprite a déjà été essayé et refusé.

Complète `PERF-CARTE-REPRISE.md` (les chiffres de frame) et `PLAN-TISSU-URBAIN.md`
lot L12 (le calque à l'échelle de l'art). Ce fichier ne rejoue ni l'un ni l'autre :
il dit ce qu'on en fait ensuite.

---

## 1. Pourquoi « retirer » n'a pas de sens

Le vectoriel est le seul moyen de dessiner une forme dont la **topologie n'est pas
connue à l'avance** : un réseau de rues arbitraire, un ruban de fleuve échantillonné,
une emprise de champ qui va de 1×1 à 10×6. Un sprite suppose une forme figée.

Ce qui se fait, ce sont **quatre traitements** — et le quatrième manquait à la
première formulation de la question :

| # | Traitement | Gagne la perf | Gagne la netteté | Coût |
|---|---|---|---|---|
| 1 | **Baker** — tracer une fois, blitter ensuite | ✅ | ❌ le bake conserve les bords antialiasés à la résolution ÉCRAN | code |
| 2 | **Calque à l'échelle de l'art** — peindre à zoom 1, reposer ×z en NEAREST | ~neutre | ✅ chaque trait devient un bloc de z px | code |
| 3 | **Cuisson runtime** — cuire la sortie vectorielle en bitmap, clé sur l'état | ✅ | ❌ **volontairement** (cf. §3.1) | code |
| 4 | **Art : tuiles ou sprites** | ✅ | ✅ | **art** |

⚠ **1 et 2 se composent.** Un bake fait *à l'intérieur* du calque est à la fois pas
cher et net. C'est la combinaison qui n'a encore été appliquée nulle part, et c'est
le gisement le moins cher du document (§4.1).

---

## 2. L'état des lieux

### Déjà traité

| Poste | Traitement | Où |
|---|---|---|
| **Toute la voirie** — chaussée, trottoir, bordure, caniveau, joints, marquage, allées de seuil | calque à l'échelle de l'art (#2) | `iso/isoRenderer.js:577` et suivantes, lot L12 |
| **Le sol** | bake + blit de tuiles 1:1 | `_isoGroundBake` |
| **Les quais** | bake (#1) — 5,6 → **0,8 ms** | `isoRenderer.js:10421-10441` |

### Ce qui reste vectoriel, et son coût

Frame de référence **24,8 ms sur 33** (ville de test, cf. `PERF-CARTE-REPRISE.md` §3) :

| Poste | Coût | Nature |
|---|---|---|
| `vif-peinture` | **10,7 ms** (43 %) | scènes moteur + ponts + champs. Le code le dit lui-même : *« le vrai poids de vif-peinture est le dessin VECTORIEL (scènes, ponts, champs), pas les sprites »* — `isoRenderer.js:9248` |
| `fleuve` | **3,5 ms** (14 %) | `drawIsoRiver` (`isoRenderer.js:4611`) — **aucun bake**, vérifié : seuls `_isoGroundBake` et `_quayBake` existent |
| `nuit` | 1,6 ms | dégradés radiaux |
| `quais` | 0,8 ms | baké, **mais tracé à la résolution écran** (§4.1) |

Rappel du recensement d'appels (pris AVANT le bake des quais) : `lineTo` 11 172,
`drawImage` 1 626. Les blits ne coûtent rien ; le tracé coûte tout.

---

## 3. Site par site : quel remède, et pourquoi pas les autres

### 3.1 Scènes moteur — **le code est déjà écrit, il est éteint**

`src/game/map/engineSceneCache.js` cuit chaque scène d'atelier une fois et la blitte
pour toutes les instances. Découpage en trois plans : `back` et `front` **cuits**,
`anim` (flammes, humains, lueurs) **en direct**.

- **Gain prouvé** : scènes **−38 à −51 %** en A/B à conditions égales ; le dessin
  vectoriel des scènes pesait 3,3 ms/frame à dézoom 0,4, soit ~36 % de la passe de
  peinture.
- **⛔ Il est OPT-IN et désactivé par défaut** (`window.__engineSceneCache = true`) :
  **une** cuisson coûte 15-25 ms, cause non élucidée, et les re-cuissons de l'aube et
  des changements d'ère sont trop visibles. `engineSceneCache.js:62-67`.
- **⚠ Il ne gagne PAS la netteté, et c'est délibéré.** La cuisson se fait à
  l'échelle EXACTE, quantifiée au demi-pixel (`BW_QUANT`), précisément pour éviter un
  second rééchantillonnage nearest — 44 000 px d'écart mesurés au diff strict quand
  on cuit à une autre échelle. `engineSceneCache.js:37-43`.

> **Le travail ici n'est donc pas de produire de l'art. C'est de dompter les
> tempêtes de re-cuisson pour pouvoir inverser le défaut.** Des garde-fous
> anti-tempête existent déjà (`engineSceneCache.js:69+`), un LRU à budget d'octets
> aussi (48 Mo). Ce qui manque : élucider les 15-25 ms d'une cuisson.

C'est le **meilleur rapport gain/coût de tout le document** : un gain de perf de
plusieurs ms sur le premier poste de la frame, sans un pixel d'art à dessiner.

### 3.2 Ponts — **le sprite a déjà été essayé et REFUSÉ**

⛔ `iso/isoBridge.js:1-8` : les sprites de pont complets (`bridge-full-*`) retournés
en iso **gardaient leur perspective interne** — rejetés le 2026-07-12. Avant eux, le
pont plat projeté depuis le legacy se lisait comme « un tapis posé sur l'eau ».

La v1 procédurale actuelle est une reconstruction volontaire, avec la grammaire du
reste du jeu : surfaces horizontales en quads monde projetés, verticalité en rubans
verticaux écran qui pendent sous leur ligne de base (même geste que le mur de quai).

> **Ne pas re-proposer de sprite de pont.** Le remède applicable ici est le
> **calque** (#2), pas l'art.

### 3.3 Champs — **le seul vrai candidat aux tuiles**

`drawIsoField` (`isoRenderer.js:7771`), refonte après « améliore mes champs » (réf
TheoTown) : l'emprise est pavée de parcelles, séparées par des allées de terre,
chacune tirant une culture groupée en clusters 2×2, avec des sillons iso-alignés en
corduroy.

**C'est 100 % espace-monde, aucune dépendance sprite, et ça se pose même sur une
berge** (`isoRenderer.js:7754-7755`). C'est une propriété voulue : l'emprise varie
jusqu'à 10×6 et le champ doit épouser n'importe quelle forme.

> Conséquence : **un sprite unique est impossible.** La conversion, si elle se fait,
> est un **jeu de TUILES de parcelle** (culture verte / blé mûr / jachère × 4 stades
> d'ère, plus les allées), assemblé par le même pavage que le code actuel. C'est de
> l'art **et** un système, pas un remplacement à plat.
>
> ⚠ La palette et les 4 stades sont déjà calqués sur la scène legacy
> `irrigated_fields` : l'art à produire a une référence, il ne part pas de zéro.

### 3.4 Fleuve — **mixte, et le ruban est irréductible**

`drawIsoRiver` empile, dans l'ordre : corps d'eau (fill du chemin de ruban) →
`drawIsoWaterTiles` (**déjà des tuiles animées**) → `drawIsoWaterGrain` (procédural)
→ rivage des îles → sillage → bas-fond clair le long des rives (bandes strokées puis
clippées).

Une partie est donc déjà en tuiles. Ce qui reste vectoriel — corps, bas-fonds,
rivage, sillage — suit un **ruban échantillonné de topologie arbitraire** : aucun
sprite ne le couvre.

> Remède applicable : **calque** (#2) pour la netteté, **bake du corps figé** (#1)
> pour la perf — le corps ne bouge pas, seuls les reflets et le ressac sont animés.
> ⚠ Le ressac (`beginWaveFrame`) est figé pour toute la frame et **tout ce qui borde
> l'eau lit cet état-là** : un bake partiel doit rester du bon côté de cette frontière,
> sinon le liseré se décolle du bord de l'eau.

### 3.5 Nuit et halos — **à laisser tel quel**

Les dégradés radiaux de la passe de nuit (1,6 ms) ne doivent PAS être pixellisés :
`flameGlow.js:149` pose explicitement `imageSmoothingEnabled = true` avec le
commentaire *« un halo est LISSE, même sur du pixel-art »*. C'est une décision d'art,
pas un oubli.

---

## 4. Ordre de reprise

### 4.1 Le quai dans le calque — petit, sûr, gratuit en perf

Le quai est **déjà baké** (#1), donc gratuit par frame. Mais sa clé de bake contient
`CM.cam.zoom.toFixed(3)` (`isoRenderer.js:10422`) : il est **peint à l'échelle de
l'écran**, donc ses bords sont antialiasés à la résolution de l'écran et cuits comme
ça. C'est exactement le défaut que L12 a corrigé sur la voirie, encore vivant sur
toute la berge.

Faire passer la cuisson du quai **dans** le calque à l'échelle de l'art = les deux
gains d'un coup, avec une mécanique déjà écrite et éprouvée, **sans art**.

### 4.2 La cuisson des scènes — le gros gain de perf, sans art

Élucider les 15-25 ms d'une cuisson (`engineSceneCache.js:62-67`), dompter les
re-cuissons de l'aube et des changements d'ère, puis inverser le défaut. Premier
poste de la frame, gain déjà mesuré.

### 4.3 Le fleuve — calque + bake du corps

Netteté et perf sur le deuxième poste. Attention à la frontière du ressac (§3.4).

### 4.4 Les champs en tuiles — le seul poste qui demande de l'art

À faire en dernier : c'est le plus cher et le seul qui engage une production.

---

## 5. Ce qu'il faut mesurer AVANT de trancher

1. **Le découpage de `vif-peinture` (10,7 ms) entre scènes / ponts / champs.**
   Personne ne l'a publié. La sonde existe : `globalThis.__isoProfParts`
   (`isoRenderer.js:9257`). Sans ce chiffre, l'ordre 4.2 / 4.3 / 4.4 est une
   hypothèse, pas une décision. **C'est la première chose à faire.**
2. **Le coût du calque sur les quais**, en alternant les deux sens (leçon de
   `PERF-CARTE-REPRISE.md` §7.3 : un A/B dans un seul ordre ne prouve rien). Repère :
   sur la voirie, le calque a coûté +0,5 ms sur un bake de ~10 ms.
3. **La cause des 15-25 ms d'une cuisson de scène** — Proxy espion ? création des
   deux canvas ? Le commentaire le note comme non élucidé.
4. **La frame dans Electron**, jamais mesurée : la fenêtre fait ~2× les pixels de la
   pane, et les phases limitées par le remplissage (~21 des 24,8 ms) doubleraient.

---

## 6. Pièges hérités (tous ont déjà coûté du temps)

- **Le JIT froid double tout** : 48,7 puis 24,8 ms sur la même config après 25 frames
  de chauffe. Toute mesure sans chauffe longue est fausse d'un facteur 2.
- **Un A/B dans un seul ordre ne prouve rien.** Toujours alterner.
- **Comparer deux rendus exige `citizens:'none'`** (vide piétons, véhicules ET
  bateaux), sinon on mesure la simulation.
- **`captureFrame` mesure le HARNAIS** (`toDataURL` force une synchro GPU→CPU,
  ~135 ms). Lire `__isoFrameProfileLast.total`.
- **Ne jamais baker de l'additif** : les lueurs de quai en `lighter`, bakées sur un
  offscreen transparent puis blittées en source-over, cessent de s'ajouter à l'eau et
  le halo devient un aplat. D'où le bake PARTIEL des quais (`'base'` cuit, `'glow'`
  en direct).
- **Le cull de tranche se fait AVANT la bascule dans le calque** : `ISO_GROUND_SLICE`
  borne des px écran DU BAKE ; sous le calque, `worldToScreen` répond dans un autre
  repère et le test deviendrait faux en silence.
- **Sur cette carte, ce qui coûte est TOUJOURS le tracé, jamais le JavaScript
  autour.** Vérifié quatre fois (mémoïsation des normales, remplacement des dégradés,
  cache de `kindAt`) : toute optimisation visant des allocations, des hachages ou des
  lookups est perdue d'avance.

---

## 7. Ce que ce chantier ne traite PAS

Tout ceci répond au grief **« pas net »** — résolution, grain de pixel, échelles
multiples. Ça ne touche pas au grief **« brouillon »**, qui est un problème de
composition : contraste de valeur entre le sol et le bâti, taille des masses,
contiguïté du bâti, hiérarchie. Les deux ont été énoncés ensemble par Raph le
2026-08-05 mais ce sont deux maladies distinctes, et celle-ci est la plus petite
des deux. Voir `PLAN-TISSU-URBAIN.md` pour l'autre.
