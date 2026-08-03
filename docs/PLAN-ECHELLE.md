# Plan — Échelle de fin de partie : rendre l'énorme énorme

Chantier ouvert le 2026-08-03, demande Raph : « en fin de partie, les énormes
buildings ne sont pas si énormes finalement, notamment à cause des bateaux, des
véhicules et du pont ».

**Périmètre arrêté par Raph (2026-08-03)** : les deux lots ci-dessous, rien
d'autre. Ont été proposés et ÉCARTÉS (« le reste ne me parle pas ») — ne pas les
re-proposer sans demande : taille-selon-le-zoom, rétrécissement des
piétons/véhicules tardifs, podiums fusionnés, feux anticollision, ombres
longues, passerelles entre tours, trafic aérien, port cosmique meublé /
convoi de barges, skyline en parallaxe, ville qui monte.

---

## 1. Le problème, mesuré

L'échelle perçue est relative : une tour n'est « énorme » que si quelque chose
de petit la mesure. Or en fin de partie tous les référents ont été gonflés pour
la lisibilité, et le plafond du bâti est plus bas que prévu — pour une raison
qu'on n'avait jamais mesurée (§1.2).

### 1.1 La toise (ville de démo bande 8, `__demoCity({pop:'1e120'})`)

| Objet | Taille à l'écran | Où c'est fixé |
|---|---|---|
| Habitant | 0,5 t | `AGENT_SCALE` (agents.js) |
| Voiture / tram | 0,45 t / 0,9 t | `VEH_SIZES × VEH_SCALE` (agents.js) |
| Arbre | **~1,9 t** | `(tr.r‖0.7) × 2.7` (isoRenderer.js:8217) |
| Pont | tablier 0,88 t/voie, pylône ~3 t | `bridgeTune.deckHalf` (isoBridge.js:54) |
| Marchand : voilier→vapeur→container | 1,45 / 1,9 / 2,6 t | `tradeSizeMul` (isoRenderer.js:4751) |
| Marchand cosmique (bandes 7/8/9) | **3,2 / 3,9 / 4,5 t** | idem, `× BOAT_SIZES(0.7) × BOAT_IMG_K(1.15)` |
| Plus haut bâti (megablock-c7/8) | ~6-6,5 t | sprites houses + clamp (§1.2) |
| Tour cosmique… | **~5 t, la plus PETITE des trois** | le clamp la coupe en deux (§1.2) |

Le plus gros vaisseau ≈ 70 % de la masse du plus haut bâtiment, un arbre en
fait un tiers. Captures de référence AVANT (2026-08-03, à refaire à
l'identique après chaque lot) :

- `.preview-shots/scale-pont-z1.png` — cam (3456, 4937), zoom 1, `now: 600000`
- `.preview-shots/scale-pont-large.png` — même cam, zoom 0,55
- `.preview-shots/scale-coeur-z1.png` — cam au cœur (`layout.cx/cy × TILE`), zoom 1

### 1.2 LA trouvaille : le clamp anti-débordement coupe les tours en deux

`pixelHouseGeom` (pixelHouses.js:227-230) rétrécit uniformément tout sprite
dont le contenu dépasse la largeur de son empreinte + 8 % (`houseFitTune`).
Règle : contenu ≤ **44 × 1,08 × spanX px source** — soit **47 px** pour une
empreinte de largeur 1, **95 px** pour une largeur 2.

Boîtes de contenu MESURÉES (scan alpha des PNG, 2026-08-03) et facteur de
clamp qui en découle (`44×1,08×spanX / largeur_contenu`) :

| Sprite | Contenu (px) | Empreinte | Clamp | Hauteur dessinée |
|---|---|---|---|---|
| tower-cosmic-7 | 84×211 | 1×2 | **×0,57** | ~5,6 t au lieu de ~9,9 t |
| tower-cosmic-8 | 103×206 | 1×2 | **×0,46** | ~5,1 t au lieu de ~11,0 t |
| tower-cosmic-9 | 88×213 | 1×2 | **×0,54** | ~6,1 t au lieu de ~11,3 t |
| megablock-cosmic-7 | 91×203 | 2×2 | aucun | ~7,2 t |
| megablock-cosmic-8 | 107×205 | 2×2 | ×0,89 | ~6,5 t |
| megablock-cosmic-9 | 119×209 | 2×2 | ×0,80 | ~5,9 t |
| arcologyhome-cosmic-7 | 138×179 | 2×2 | ×0,69 | ~4,4 t |
| arcologyhome-cosmic-8 | 115×181 | 2×2 | ×0,83 | ~5,3 t |
| arcologyhome-cosmic-9 | 148×176 | 2×2 | ×0,64 | ~4,0 t |

La « tour » cosmique — le variant qui porte le nom — est dessinée à ~46-57 %
de son art : **plus basse que le megablock ET que le vaisseau**. Et le clamp
EMPIRE avec les bandes (c9 plus raboté que c7) : la ville régresse en montant
les ères. L'art a déjà les pixels de la hauteur ; c'est la LARGEUR du contenu
qui les confisque.

⚠ Ne PAS « corriger » en élargissant la marge : une tour de 2,3 t de large sur
un lot de 1 t baverait sur la rue et les voisins — le clamp fait son travail.
Le fix est la discipline de largeur du Lot B.

### 1.3 Conversion px source → tuiles écran (à re-vérifier en B0)

Le blit passe par `wpx = (spanX+spanY) × T × z × 0.78` (isoRenderer.js:8123)
puis `unit = wpx / spanX`, `k = unit / 44` (pixelHouses.js:222-224). D'où,
hauteur écran en tuiles = hauteur contenu px ÷ :

- empreinte **1×2** : ÷ **18,8**
- empreinte **2×2** (et 1×1) : ÷ **28,2**

⚠ Ces diviseurs sortent d'une lecture de code, pas d'une mesure écran. La
séance B0 les vérifie (un `houseSpriteHeightTiles()` + une règle sur capture)
AVANT de figer les hauteurs d'art — on a déjà payé une calibration ancrée sur
une prémisse fausse (cf. fiche voirie/ère 3).

---

## 2. LOT A — Dégonfler les toises (code seul, une séance, tout sous molettes)

> **ÉTAT 2026-08-03 : IMPLÉMENTÉ, NON COMMITÉ.** A1+A2+A3 en place, 1456 tests
> verts, lint propre, captures avant/après dans `.preview-shots/` (suffixe
> `-apresA` ; saison FORCÉE été via `civ-opt-season` pour des A/B comparables —
> l'auto suit l'horloge RÉELLE, deux captures à 2 h d'écart changent de saison).
> Molettes livrées : `__fleetScale` (objet), `__treeScale({ mulMid, mulLate })`,
> `__bridgeTune.deckHalf`. Reste : arbitrage Raph sur les valeurs, puis commit.

Objectif : redonner aux tours leur présence SANS toucher un pixel d'art.
Chaque réglage derrière une molette live pour l'A/B à l'écran avec Raph.

### A1 — Écrêter la flotte cosmique

- `tradeSizeMul` (isoRenderer.js:4751) : cosmique 4,0 / 4,8 / 5,6 →
  **2,8 / 3,0 / 3,2** et container 3,2 → **2,6**. (Première version du plan :
  2,4/2,7/3,0 + container 2,8 — REJETÉE à l'implémentation : le cosmique 7
  aurait été PLUS PETIT que le container, le cargo aurait rétréci en montant
  d'ère. La table doit rester MONOTONE : 1,36 / 1,8 / 2,4 / 2,6 / 2,8 / 3,0 /
  3,2.) Bonus mesuré : la plus grosse coque retombe à 0,7×3,2 = 2,24 t — pile
  la cote de la passe navigable (`passHalf` 1,7 → 3,4 t), que le cosmique
  d'avant l'écrêtage (3,9 t de coque) débordait.
- Sortir les multiplicateurs dans un objet mutable exposé `window.__fleetScale`
  (même geste que `bridgeTune`) — réglage live sans HMR.
- Se propage tout seul : bateau amarré au port (`portMooring`/`drawIsoPortBoat`
  lisent `BOAT_SIZES × sizeMul`), feux de navigation (ancre posée par le rendu),
  évitement d'obstacles (`effSize`). Passe navigable : `passHalf` était calé sur
  le container 2,24 t — des coques plus PETITES ne cassent rien.
- La plaisance et le pêcheur ne bougent PAS : leur gonflette est le cas
  « petite silhouette illisible » documenté dans le code, ce n'est pas eux qui
  écrasent la ville.
- ⚠ Grep une éventuelle copie des multiplicateurs côté legacy (`drawShips`,
  renderWorld/cityMapRuntime) : iso = LE JEU, mais si la table est dupliquée,
  noter la divergence ou partager la constante.

### A2 — Arbres et buissons à l'échelle des ères

- Facteur commun aujourd'hui : `× 2.7` en DEUX sites + un repli — arbres
  isoRenderer.js:8217, buissons de terre-plein :8433, repli procédural
  `drawTreeIso × 1.3` :8246. Factoriser UNE constante partagée puis appliquer
  un multiplicateur PAR BANDE : ≤4 → ×1,0 ; 5-6 → ×0,85 ; 7+ → **×0,65**
  (valeurs de départ). Molette `window.__treeScale`.
- La forêt sauvage passe par le même item d'arbre (:8217) → couverte. ⚠
  Recenser les AUTRES arbres avant de conclure : kit des places
  (isoPlaza/plazaProps), scènes moteur, grep `tree-` et `2.7`.
- Un arbre d'1,9 t à côté d'une hutte est un arbre ; à côté d'une arcologie
  c'est un séquoia. C'est le référent le plus nombreux de la carte — le plus
  gros levier silencieux du lot.

### A3 — Pont affiné

- `bridgeTune` est DÉJÀ une molette live (`window.__bridgeTune`, pont non
  baké) : séance de réglage à l'œil, puis graver les valeurs. Départ :
  `deckHalf` 0,44 → **0,36** ; parapets/piles des matières tardives (STYLES
  béton/acier) affinés en proportion.
- Garde-fous : piétons à ±0,16 t de l'axe de voie + demi-corps ~0,15 t
  doivent rester DANS deckHalf ; vérifier une traversée d'attelage et le
  passage sous tablier des coques écrêtées.

### A4 — Le clamp : acté, pas contourné

Rien à coder en Lot A. La découverte §1.2 est actée ici pour que personne ne
« répare » à la marge ; le fix est la discipline de largeur du Lot B. Contrôle
en fin de Lot B : loguer le facteur k effectif par variant cosmique (aucun ne
doit être < 1).

### Validation du Lot A

- Refaire les 3 captures de référence (mêmes cam/zoom/now) + une bande 7
  (`pop:'1e40'`).
- Critère d'acceptation : sur `scale-pont-large`, le vaisseau tient dans
  ~la moitié de la masse visuelle de la plus haute tour voisine ; les arbres ne
  dépassent plus le 2ᵉ registre des façades cosmiques.
- Sonde fps au dézoom max inchangée (aucune raison qu'elle bouge : mêmes
  sprites, plus petits).

---

## 3. LOT B — Le bâti cosmique régénéré (art + intégration)

> **ÉTAT 2026-08-03 : B0+B1+B2 FAITS.** B0 : diviseurs §1.3 CONFIRMÉS à l'écran
> (tour 5,06 t mesurée vs 5,05 prédite ; megablock 6,47 vs 6,45 — via
> `CM._houseBoxes`, boîte réellement dessinée) ; bande 9 = pop `1e200` (ei 161).
> B1 : 9 sprites régénérés (`create_map_object`, low top-down, high detail,
> detailed shading, selective outline, quantize @24) — canvas ÉTROITS pour tuer
> le clamp à la source (tours 48 px, 2×2 96 px). B2 : mesuré EN JEU après pose :
> **tour 10,63 t · megablock 8,24 t · arcologie 6,42 t** (avant : 5,06/6,47/~5,3),
> plus aucun clamp (largeurs contenu 35-48 et 86-96 px). Identités tenues :
> jade/émeraude (7), obsidienne+or (8), obsidienne+cristal de glace (9).
> Captures `lotB-final-*` dans `.preview-shots/`. RESTE : avis Raph sur la
> fournée → B3 si go ; perf dézoom sur VRAIE save à surveiller (fillrate).

Objectif : plafond de la skyline de ~6,5 t à **~10 t**, hiérarchie lisible
entre les trois familles, et plus AUCUN clamp.

### B0 — Toise à l'écran (obligatoire avant de générer)

1. Vérifier les diviseurs §1.3 sur une capture (tour connue + règle).
2. Poser la table des hauteurs CIBLES en px source, signée par les diviseurs
   vérifiés.
3. Trouver la pop du seuil de bande 9 (essayer `1e300` ; 1e40 → b7,
   1e120 → b8) pour valider les trois skins.

### B1 — Régénérer les 9 sprites (tower/megablock/arcologyhome × bandes 7/8/9)

Silhouettes cibles — une hiérarchie, pas trois clones :

| Famille | Rôle | Largeur contenu MAX | Hauteur cible (provisoire) |
|---|---|---|---|
| tower-cosmic | la FLÈCHE — fine, la plus haute | **≤ 47 px** (empreinte 1×2) | ~180-200 px → **~9,5-10,5 t** |
| megablock-cosmic | la MASSE — large, massive | **≤ 95 px** (2×2) | ~225 px → **~8 t** |
| arcologyhome-cosmic | la PYRAMIDE — assise, évasée | **≤ 95 px** (2×2) | ~190 px → **~6,5-7 t** |

- **La largeur max est une contrainte DURE** (sinon le clamp reprend tout) :
  vérifier la bbox alpha de chaque PNG livré AVANT de le poser (le scan §1.2
  sert de gabarit de contrôle). La tour actuelle n'a même pas besoin de plus de
  pixels de haut que ses 206-213 : débridée à ≤47 px de large, elle sort déjà à
  ~11 t — on peut même la TAILLER un peu.
- Progression 7 < 8 < 9 DANS chaque famille (aujourd'hui le clamp inversait la
  progression).
- **Grain de fenêtres fin** : fenêtres de 2-3 px en rangées nombreuses — l'œil
  compte les étages, c'est le multiplicateur d'échelle perçue le plus puissant
  à pixels constants. Éclairage volumétrique et 4 stades : fiche
  « building sprite quality bar ». DA verrouillée, itérer en PANEL de
  propositions avant de généraliser : fiche « building art direction
  consistency ».
- Pipeline : PixelLab (méthode des fiches « building frontview regen » /
  « habitations pixelart »), quantize palette `scripts/quantize.cjs`
  (sprites @24), mêmes noms de fichiers dans `public/pixelart/houses/`.
- Cadres suggérés : 64×224 (tour), 128×256 (megablock), 128×224 (arcologie) —
  le cadre est libre, c'est le CONTENU qui est contraint.

### B2 — Intégration et vérifications

Mêmes noms de fichiers → zéro câblage. Vérifier quand même :

- Clamp neutralisé : log du k effectif par variant (A4).
- Le hit-test à la silhouette, le liseré de survol et la fumée de cheminée
  suivent AUTOMATIQUEMENT (tout passe par `pixelHouseGeom`) — un tour de
  survol/clic sur chaque variant suffit.
- Profondeur peintre : ancre pieds inchangée, rien à trier ; une tour de 10 t
  masque davantage la rue DERRIÈRE elle — c'est l'iso normal, pas un bug.
- Perf : fillrate un peu plus haut au dézoom (sprites plus grands) — passer la
  sonde fps sur mégapole dézoomée avant/après (fiche perf carte : le profileur
  frame est aveugle au GPU, utiliser la méthode de la fiche).
- ⚠ PWA : les PNG remplacés gardent la MÊME URL — vérifier que le service
  worker invalide bien son cache à la mise à jour (sinon suffixer `?v=`),
  cf. fiche « jeu sur téléphone ».
- Refaire les 3 captures de référence par bande (7/8/9).

### B3 — la super-tour rare : « Tour-monde » — 🚫 RETIRÉE le 2026-08-03

> **RETRAIT décidé par Raph** (« on peut oublier la tour-monde, le rendu n'est
> pas pertinent ») : une fois les tours ordinaires devenues des monolithes 2×2
> de 11 t (PLAN-TISSU-URBAIN §10 lot W), le colosse de 14 t ne crevait plus la
> skyline — il n'était que « le premier parmi beaucoup ». Variant, promotion
> des slots, empreinte, libellé, tests et les 3 PNG retirés ; les slots 0/12
> retombent sur le tirage normal, rien n'est sérialisé, les saves ne voient
> rien. **Ne pas re-proposer.** L'historique technique reste ci-dessous.

> **ÉTAT 2026-08-03 : LIVRÉ** (avec la régé v2 du megablock jade — grappe de
> trois tours au lieu de la dalle, même gabarit 96×224). Variant `supertower` :
> promotion des SLOTS PERSISTANTS 0 et 12 (les mieux classés du tri → près du
> cœur, stables à jamais) dès la bande 7, dans `chooseVariant`
> (buildingGenerator.js) ; espacement par registre au recalcul (démotion de la
> seconde si Chebyshev < 10, clé PAR SLOT pour survivre au refit d'empreinte).
> Câblé : `HOUSE_FOOTPRINT` [2,2], `AVAILABLE`+`COSMIC_VARIANTS`
> (pixelHouses.js — pas de PNG de base, la clé est toujours cosmique),
> `BUILDING_HEIGHTS` 4,4 (repli), libellé « Tour-monde » (cityMapRuntime.js).
> 3 PNG `supertower-cosmic-7/8/9` (66-82 px de large, 342-344 px → **12,1-12,2 t
> mesurés en jeu**, vs tour 10,6). 3 tests de contrat (rareté 1-2, espacement,
> gate bande 7) — 1533 verts. En démo saturée elle est « première parmi
> beaucoup » ; sur une vraie save (moins dense) elle dominera davantage.
>
> **REPRISE 2026-08-03 (`badbb67`), retour Raph ×2** : (1) Tour-monde agrandie
> à **13,2-13,9 t** (canvas 96×392) ; (2) toute la fournée sortait en élévation
> FRONTALE — les 12 sprites régénérés en **3/4 coin-en-avant** (« the CORNER
> faces the viewer, TWO visible facades, rooftop slightly visible » — le seul
> « not a flat facade » ne suffit PAS, il faut le mot CORNER). Pyramide jade
> reprise 2× (v2 trapue 4 t → v3 « TALL … filling the whole canvas » 6,3 t).
> Mesures finales en jeu : **supertour 13,7 · tour 10,6 · megablock 8,0 ·
> arcologie 6,3-6,6 t**.

1-2 exemplaires par ville, près du cœur : la perception du maximum FAIT le
maximum.

- Empreinte 2×2, contenu ≤95 px, hauteur ~11-12 t — elle crève la skyline.
- Code, cette fois : `HOUSE_FOOTPRINT` (buildingGenerator.js:43), tirage rare
  gaté bande ≥7 dans le placer, `AVAILABLE`/`COSMIC_VARIANTS`
  (pixelHouses.js), 3 PNG (bandes 7/8/9).
- Critère : visible de loin, jamais deux côte à côte (contrainte d'espacement
  dans le tirage).

---

## 4. Ordre, harnais, pièges

**Ordre** : Lot A (une soirée) → captures après → arbitrage Raph sur les
molettes → graver les valeurs → B0 → B1/B2 → B3 si go.

**Harnais** : `__demoCity({pop:'1e40'})` = bande 7, `'1e120'` = bande 8
(bande 9 : à trouver en B0). Captures par `__cityShot` (la pane masquée gèle
rAF et les screenshots — jamais de capture d'onglet). Le harnais assainit
lui-même instability/timeWear et fige l'autosave.

**Pièges hérités, à relire avant les séances concernées** :
- Mesures près de l'eau : fiche « vagues du fleuve » (3 pièges de capture).
- Perf carte : fiche « lag au dézoom » (méthode de mesure GPU, la seule qui
  compte ici).
- HMR double-graphe sur les modules carte → hard reload après édition.
- Les chiffres du §1 hors scan PNG sortent du code, pas de l'écran : B0
  re-mesure avant d'engager l'art.
