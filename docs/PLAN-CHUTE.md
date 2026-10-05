# La chute sur la carte

Décision de Raph (2026-10-04), après la maquette
(https://claude.ai/artifact/7D3m9ARDNTgWLcR5VmPKfG) : **« la vague enchaînée sur ce
qui reste, implémente en jeu »**. La cité figée (acte I de la maquette) n'est pas
retenue ; la variante « la nuit » non plus.

## Ce que voit le joueur

1. Il maintient « Effondrer la Cité » (ou l'Édit tombe alors qu'il regarde la cité).
2. **La vague** — la Cité s'affiche, son interface se retire, la lumière passe au
   crépuscule. Du cœur vers les faubourgs, chaque bâtiment tremble 0,4 s puis cède
   sa place à sa **ruine dessinée** ; un nuage de poussière dessiné au pixel couvre la
   bascule. Devant la vague, la ville se vide (passants, émeutiers, charrettes, étals,
   guirlandes, braseros, réverbères, bêtes et linge). Recul de caméra.
3. **La nuit** tombe sur les ruines, puis fondu au noir.
4. Dans le noir : la stèle (si un choix reste à faire), le choix des Ruines actives,
   le cycle suivant est fondé **dans la même vallée**.
5. **Le lever** — du noir, la nuit et le seul feu du campement au milieu des ruines,
   puis l'aube. L'interface revient.
6. Les ruines restent sur la carte : chaque case que la nouvelle cité bâtit efface la
   sienne. Les monuments restent debout en ruine ; une maison sur deux n'est plus
   qu'un pan de mur arasé ; la forêt ne pousse pas dans les ruines.

Un clic sur la carte (ou Échap, Espace, Entrée) mène la chute directement au noir,
et le lever directement à l'aube.

## La règle qui change : la même vallée

`completeCollapse` (crisis.js) garde la graine, le fleuve (`riverWP`) et la fiche du
cœur (`cityCore` : cœur, pont, `maxN`) ; les rues, les places, les îlots et les slots
repartent de zéro ; la cité reçoit un nouveau nom. Sans fiche de cœur pour la graine
(vieille sauvegarde), nouvelle vallée comme avant, sans ruines.

Les ruines (`state.cityRelics`) sont relevées par la carte au noir et prises par
`completeCollapse` après la stèle (invariant §1.3 d'events.js : rien n'est écrit
avant). Une chute non regardée (hors ligne, onglet caché) ne relève rien : les ruines
d'avant restent.

## Où c'est

| Fichier | Rôle |
|---|---|
| `map/iso/chuteState.js` | Feuille : horloge, état d'une tuile (debout / secouée / ruine + poussière), rayon de la vague. |
| `map/iso/isoChute.js` | Metteur en scène : lumière, foule, caméra, fondu, relevé des ruines, ruines du cycle précédent dans le tri du peintre. |
| `map/iso/isoChuteScene.js` | Peintre d'un bâtiment qui tombe (maisons, scènes moteur). |
| `map/iso/chuteDust.js` | Le nuage de poussière (sprite au pixel, cache borné). |
| `map/pixelHouses.js` | Ruine d'une habitation, cadrée et teinte comme la maison debout. |
| `map/cityEngineSprites.js` | `ENGINE_RUIN` : en ruine, chaque blit de bâtiment d'une scène devient sa ruine. |
| `map/ruinArt.js` | Manifeste généré des ruines dessinées. |
| `map/ruinRaze.js` | Arasement (repli sans ruine dessinée, ruines vieillies). |
| `map/cityMapBridge.js` | `playCityFall`, `captureCityRelics`, `takeCityRelics`, `playCityRise`. |
| `core/events.js` | La séquence (`runCollapseSequence`). |
| `core/actions/crisis.js` | La même vallée (`completeCollapse`). |

Crochets dans les peintres : `isoLivePaint` (maisons, moulin, port, ruines),
`isoEngineScene` (scènes), `isoLiveCollect` (foule, ruines, arbres), `isoRenderer`
(frame, fondu), `isoStreet` (réverbères éteints).

## Les ruines dessinées

Chaque ruine est le sprite du jeu **édité par PixelLab** (« le même bâtiment, en
ruine »), à sa taille réelle, jamais réduite. Recette (maquette, `maquettes/chute/tools`
du worktree) :

- maisons : `POST /v2/edit-images-v2` avec plusieurs images de même taille (16 par
  tâche jusqu'à 64 px, 4 jusqu'à 128 px) ;
- bâtiments de scène : 4 sprites de 176 × 160 posés en grille dans UNE image de
  352 × 320, éditée en une tâche puis redécoupée (40 générations au lieu de 160) ;
- `node scripts/buildRuins.mjs <job.json>` : alpha binarisé, couleurs ramenées sur la
  palette de l'original (la teinte par tuile s'y applique alors au pixel près),
  recadrage, `public/pixelart/ruins/{houses,props}/` et `src/game/map/ruinArt.js`.

Un sprite sans ruine dessinée tombe quand même : il est **arasé** (coupé à quelques
pixels de son pied ; une tour haute et mince garde un fût cassé). Les props de scène
sont rangés par clé de prop après la substitution « -grand ».

Recette en dépôt : `node scripts/ruinsPixellab.mjs <dossier> --mode multi|grid …`
(cf. son en-tête) puis `node scripts/buildRuins.mjs <dossier>/job.json`.

**Couverture (2026-10-04)** — 75 habitations et 135 bâtiments de scène dessinés en
ruine, soit toutes les habitations des âges 0 à 9 (sauf les deux gratte-ciel minces
des âges cosmiques, mieux arasés) et tous les bâtiments de scène des âges 2 à 6.
Restent arasés : les décors de campement des âges 0-1 (paniers, étals, feux) et les
**81 monuments cosmiques des âges 7 à 9** (128 × 224) — les dessiner coûterait
≈ 440 générations (8 par tâche), à faire après la remise à zéro du 30/10.
Coût de la passe : ≈ 1 000 générations en tout (maquette comprise).

## Ce qui n'a pas de ruine

Merveilles (elles restent debout), Maison des Plaisirs, moulins, port riverain (ils
disparaissent sous la vague), détails des scènes (gens, bêtes, feux : partis).

## Molettes de dev

`__chute.TUNE` (durées, crépuscule, recul, part des maisons arasées),
`__chute.scrub(ms)` (fige un instant de la chute), `__chute.record()` (relevé des
ruines de la carte affichée).

## Tests

`chuteState.test.js` (la vague), `chuteVallee.test.js` (même vallée, ruines dans la
sauvegarde), `ruinArt.test.js` (manifeste ↔ images ↔ sprites).
