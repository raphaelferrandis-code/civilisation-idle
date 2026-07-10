# Plan de chantier — CARTE ISOMÉTRIQUE (rédigé 2026-07-10 — Phases 0-1 LIVRÉES le soir même)

## ÉTAT D'AVANCEMENT (2026-07-10 soir)

**Décisions verrouillées par Raphaël** : losange 2:1 ✓ caméra fixe ✓ sprites bâtiments
conservés ✓ jalon go/no-go après Phase 1 ✓ → **Phases 0 et 1 LIVRÉES**, jalon prêt.

- **Phase 0 ✓** : `window.__demoCity({pop})` (montage démo en un appel, tous les gotchas
  harnais intégrés) + `captureFrame` rend même vue inactive (modal de crise). Dans
  cityMapRuntime.js, section hooks dev.
- **Phase 1 ✓** : [src/game/map/iso/projection.js](src/game/map/iso/projection.js)
  (worldToScreen/screenToWorld/panDeltaToScreen/screenDeltaToPan/depthOf/tileDiamond/
  visibleCellBounds — identité au flag près, 9 tests) +
  [src/game/map/iso/isoRenderer.js](src/game/map/iso/isoRenderer.js) (renderer SÉPARÉ
  branché par `CM.iso` dans la frame ; sol losanges flat + RUBANS de chaussée par masque
  E/O/S/N + place + eau ; maisons posées via drawPixelHouse ancrées au coin sud ; moteur
  = socles extrudés ; arbres sapin minimal ; habitants sprites actuels ; véhicules mis à
  jour non dessinés). Caméra/souris/bakes projetés (clamp iso, molette, drag, bakes pan).
  Legacy intact : `__iso(false)` → rendu d'avant au bit près. Tests carte 242/242.
- **JALON — à montrer à Raphaël** : `.preview-shots/jalon-A2-topdown.png` (avant) vs
  `jalon-B-iso.png` (après, vue large) vs `jalon-D-wheelzoom.png` (gros plan). In-game :
  console → `__iso(true)`.
- **⚠ Gotchas session** : (1) HMR sur `src/game/map/iso/…` a produit un DOUBLE GRAPHE de
  modules (window.__CM périmé, caméra « inerte », captures figées) → après tout edit
  carte, HARD RELOAD la page avant de vérifier. (2) Poke direct `CM.cam.zoom` +
  captureFrame ne prend pas en iso (cause pas identifiée) — passer par la molette réelle
  (`canvas.dispatchEvent(new WheelEvent('wheel', {deltaY:-120…}))`) qui marche. (3) Canvas
  du diorama borné par le CSS (600×256) → pour des captures grandes, forcer
  `canvas.style.height`/parent puis `CM.forceFrame()`. (4) Golden économie
  `foragers x25` échoue d'un ULP flottant — PRÉEXISTANT (échoue aussi dans la vieille
  copie `.claude/worktrees/quizzical-payne-*`), pas lié au chantier.

**GO VALIDÉ par Raphaël (« c'est exactement ça que je veux ») — suite lancée dans la foulée.**

## SOL PIXELLAB v1 (post-GO, 2026-07-10 soir — LIVRÉ)

- **4 tuiles** `public/pixelart/iso/` : iso-grass / iso-dirt / iso-pavement / iso-plaza
  (create_isometric_tile 64px « thin tile », lumière haut-gauche). Pipeline :
  [scripts/fetchIsoTiles.mjs](scripts/fetchIsoTiles.mjs) (⚠ route download au
  SINGULIER `mcp/isometric-tile/{id}/download`, objets expirés après 8h) →
  `quantize.cjs --colors 24` → [scripts/isoToneDown.cjs](scripts/isoToneDown.cjs)
  (désaturation vers la luminance + biais chaud : PixelLab sort les sols MAUVES et
  trop fissurés ; paramètres utilisés : pavement sat .35 lift .08 warm 7, dirt sat .5,
  grass sat .6).
- **Câblage** (isoRenderer.js) : chargement paresseux + repli aplat ; **FACE SEULE**
  (crop 2:1 du contenu — dessiner l'épaisseur du thin tile peignait un quadrillage
  sombre au sud de chaque cellule, v1 refusée) ; miroir horizontal 1 cellule sur 2
  (hash) contre la répétition ; **dosage par matière** : herbe/place = tuile pleine,
  urbain = aplat calme + GRAIN de texture à alpha 0.26 (la tuile pleine tapissait la
  ville d'un motif qui concurrençait les bâtiments, v2 refusée), dirt = 0.5.
- Captures validées : `.preview-shots/iso-sol3-wide.png` + `iso-sol3-close.png`.
- Leçon d'itération : 3 essais (pleine → face-seule → grain-alpha) ; en tuilage
  urbain dense, LE SOL DOIT ÊTRE CALME — garder les motifs pour herbe/places.

## VÉHICULES + ROUTES PAR ÈRE (2026-07-10 tard — LIVRÉ)

- **Véhicules en iso** : `drawIsoVehicle` (isoRenderer) — corps sprite 4-dirs +
  ATTELAGES (bête devant + timon) + POUSSEURS (humain d'ère derrière) + porteurs de
  panier ; positions/offsets calculés en MONDE puis projetés (vehicleLaneOffset s=TILE) ;
  triés au peintre avec bâtiments/habitants ; drones exclus (plus tard). Briques
  bas-niveau exportées d'agents.js (ensureVeh/vehReady/VEH_SIZES/VEH_PULL/VEH_PUSH).
- **Routes par ère** : roadTone 4 paliers (terre→pavé→asphalte→voie sombre) +
  POINTILLÉS centraux main/avenue dès band ≥ 5, cellules traversantes seulement.
  ⚠ 2 pièges : (1) les boulevards 2-cellules portent AUSSI le bit de couture vers la
  voie jumelle (mask E|O|S) → tester « E ET O » (traversant), pas « E|O sans S|N »
  (5 cellules sur 406 sinon) ; (2) `(mask&1)&&(mask&2)` renvoie 2, pas true → `!!`
  obligatoire pour le XOR des carrefours.
- Captures : `iso-veh-antique.png` (attelages band 4), `iso-veh-indus-close2.png`
  (voitures + asphalte + pointillés band 5). Tests carte 242/242.

## FLEUVE + PONT CENTRAL + TERRE-PLEIN (2026-07-11 — LIVRÉ)

- **Fleuve iso** : RUBAN LISSE projeté depuis `L.river.samples` ({x, y, hw} en
  cellules) — gauche/droite = pos ± normale·hw en MONDE puis worldToScreen, comme
  l'Approche A du legacy (zéro escalier). Dessin **LIVE** chaque frame (le sol reste
  baké) → eau animable : bord de profondeur sombre + REFLETS qui dérivent le long du
  courant (phases hashées par sample, fondu sin, clippés au ruban). Le bake ne peint
  PLUS d'eau : herbe sous le ruban = berges douces (l'herbe PixelLab lisière très bien).
- **Pont central** : cellules `roadSurface === 'bridge'` EXCLUES du bake (ni fond ni
  ruban ni pointillés) ; `drawIsoBridges` dessine le TABLIER après le fleuve — matière
  par bande (bois→pierre→fer→béton/énergie, calé pixelBridge), garde-corps sur les
  bords EXTÉRIEURS seulement (voie jumelle détectée → tablier continu double-voie).
  Piétons/attelages passent dessus (items après). Cache des cellules-pont par
  layoutRecomputeAt.
- **Riverains** : les tuiles moteur dont l'empreinte touche `river.cells` ne posent
  PLUS de socle (la dalle « flottait » sur l'eau) — comme le legacy : rien que des
  sprites transparents, scènes en Phase 3.
- **Terre-plein planté** (bonus) : bande de gazon + touffes sur les coutures
  `L.terrePlein` ({axis, x|y, x0..x1|y0..y1}) dans le bake — visible seulement sur
  les archétypes à boulevards 2-cellules (capital/megalo/districts).
- Captures : `iso-fleuve2-wide.png` (traversée diagonale de toute la ville) +
  `iso-fleuve2-close.png` (pont de pierre + chariot + mule + reflets). 242/242.

## BATEAUX + QUAIS-LITE + DRONES + NUIT + PILOTE PHASE 4 (2026-07-11 — LIVRÉ, « fais tout »)

- **Bateaux** : `drawIsoShips` — flotte legacy (CM.ships) sur le ruban projeté : stade
  par ère (radeau→voilier→vapeur→conteneur→cosmique), voie latérale + louvoiement,
  sillage additif, escales simplifiées (ralentit aux quais) ; inclinaison = tangente
  PROJETÉE, miroir par sens (recette drawShips). Sous les tabliers de pont (dessinés
  avant drawIsoBridges). Exports agents.js : ensureBoat/boatReady/BOAT_SIZES/BOAT_LIFT.
- **Quais-lite** : une berge (`river.banks`) qui touche l'urbanSet se pave (bake sol)
  — berge bâtie côté ville, herbe côté nature. Vrai quai par ère = art Phase 5.
- **Drones** : passe aérienne `drawIsoDrones` — ombre au sol projetée, sprite pivoté
  au cap PROJETÉ + rotors tournants (exports ensureDrone/drawDroneRotors).
- **Nuit** : `drawIsoNight` — voile bleu (0.62·nightF) + FENÊTRES CHAUDES (halos
  additifs seedés par tuile, ~70 % des bâtiments, plafonnés 380/frame). Lit CM.nightF
  → cycle jour/nuit ET captures `night:` marchent. Capture : iso-final-nuit2.png.
- **PHASE 4 — PILOTE VALIDÉ** : personnage 8 directions PixelLab
  (`create_character` standard, size 48 → canvas 68 = convention des bandes) + marche
  `walking-6-frames` sur les 4 DIAGONALES (6 frames = AGENT_NF). Assemblage :
  [scripts/fetchAgentsIso.mjs](scripts/fetchAgentsIso.mjs) → `{name}-southeast.png`
  etc. dans inhabitants/. Câblage : `drawEraAgentIso` (agents.js) — en iso la dir
  MONDE devient UNE diagonale écran (E→SE, O→NO, S→SO, N→NE), repli cardinal tant que
  la bande manque. Pilote : greekman (id af97ef76-f638-4720-94af-a6d61c7bbda7,
  ⚠ expire ~8 h après création). Vérifié in-game : iso-pilote-diag4.png.
  **⚠ LA SUITE DU BATCH ATTEND LA VALIDATION DU LOOK PAR RAPHAËL** (règle DA : le
  1er jet cueilleurs avait été refusé — on ne brûle pas ~120 générations sans son
  œil). Recette par perso : create_character(standard, 8 dirs, 48px, low top-down)
  → animate_character(walking-6-frames, 4 diagonales) → fetchAgentsIso (ajouter
  l'id à CHARS) → quantize. ~25 persos (5 ères × h/f/enfant + variantes) + 7
  véhicules (create_8_direction_object) + bêtes de trait (quadruped horse/ox ?).

**RESTE (les 2 gros chantiers d'art, hors périmètre code)** :
1. **Phase 3 — scènes moteur** : cityEngineSprites est un monde procédural entier
   (scènes composées par tuile carrée) — portage dédié, ou re-génération d'art iso par
   bâtiment. En attendant : socles extrudés (villes denses = beaucoup de dalles) et
   riverains (port/moulin) invisibles en iso.
2. **Phase 4 — batch agents/véhicules** : recette prouvée ci-dessus, gated sur la
   validation du pilote.
Puis Phase 6 (perf/LOD fin/bascule par défaut) quand 3-4 sont posées.

But : obtenir le rendu de l'image de référence de Raphaël (ville pixel-art vue en
losange, rues en diagonale à l'écran) **sans toucher à la logique du jeu** : la grille,
le roadGraph, le placement, les agents, la save restent EXACTEMENT ce qu'ils sont.
Seule la **projection monde→écran** change : cases carrées → losanges 2:1.

C'est la réponse de fond au malaise « bâtiments 3/4 sur routes plates » : en iso, sol
et bâtiments partagent enfin la même perspective. Les rues logiquement N-S/E-O
deviennent des diagonales à l'écran — PAS besoin de routes diagonales dans le graphe.

## Décisions à VERROUILLER avant de lancer (5 min avec Raphaël)

1. **Losange 2:1 classique** (tuile écran 2w×1h, angle ~26,57°) — le standard SimCity
   2000/référence. Recommandé ; alternative 30° plus « carrée » mais moins lisible.
2. **Caméra fixe** (pas de rotation 4 vues) — la rotation quadruplerait l'art. Non négociable
   au premier jet.
3. **On GARDE les sprites bâtiments actuels** (~100+ sprites « high top-down » 3/4).
   L'image de référence utilise le même langage (façades quasi frontales sur grille
   diagonale) → ils passeront. Retouches ciblées ensuite, pas de régénération totale.
4. **Jalon go/no-go après la Phase 1** : sol + routes iso + bâtiments simplement posés.
   Si le look ne convainc pas, on s'arrête là (coût limité, art terrain seulement) et on
   retombe sur la piste « façades orientées » en top-down.

## Le pivot technique : UNE fonction de projection

Aujourd'hui, partout : `sx = (wx - cam.x) * zoom + cw/2` (alignement écran). Le chantier
tient sur un principe : **plus personne ne projette à la main**.

- Nouveau `src/game/map/iso/projection.js` :
  `worldToScreen(wx, wy)` / `screenToWorld(sx, sy)` / `depthOf(wx, wy)` ;
  en mode iso : `sx' = (wx − wy) · k`, `sy' = (wx + wy) · k/2` ; en mode legacy : identité.
- Flag runtime `CM.iso` + molette dev `__iso(true/false)` (A/B live, comme `__pixelMedian`).
- Conversion des consommateurs UN PAR UN (grep `cam.x) * z` ≈ tous les renderers) ;
  tout fichier converti ne mélange plus jamais les deux repères.
- ⚠ Leçon de la tentative greybox iso (2026-06-18, annulée) : c'est le mélange
  demi-converti + caches offscreen + preview instable qui a tué l'essai. D'où : Phase 0
  harnais d'abord, projection centrale, conversion fichier par fichier avec capture à
  chaque étape.

## Phases

### Phase 0 — Harnais + garde-fous (0,5 session)
- Consolider `__cityShot` avec les gotchas appris (rAF gelé → boucle `CM.forceFrame()` ;
  crise → `instability=0` AVANT de pomper ; `CM.born[k]=-1e6` après chaque recompute).
  Tout est déjà en mémoire (`visual-verif-harness`).
- Captures BASELINE top-down (mêmes seed/état/scènes) pour comparer chaque phase.

### Phase 1 — Projection + sol + routes (2-3 sessions) → JALON GO/NO-GO
- `projection.js` + bascule caméra : `cmClampCamera` (la boîte devient un losange),
  `cityMapWorldAtScreen`/`cityMapTileScreen` (souris, tooltips), centrage.
- **Terrain iso** : les tuiles Wang actuelles (pixelTerrain, edges carrés) ne se projettent
  pas → tileset ISO via PixelLab `create_isometric_tile` : herbe/terre/sable + sols urbains
  par bande (calqués `drawEraGroundFill`) + dallage de place par ère.
- **Routes iso** : droites (2 orientations écran), carrefours, T, impasses × matières d'ère
  (terre→pavé→asphalte→énergie) ; terre-plein planté re-tuilé en diagonale (pixelMedian
  garde sa logique de segments).
- Bâtiments/agents : posés TELS QUELS (ancrage provisoire au sommet sud du losange).
  C'est moche par endroits — on s'en fiche, le jalon juge le SOL et la LISIBILITÉ.

### Phase 2 — Ordre du peintre unifié (1-2 sessions)
- Profondeur iso = `wx + wy` (plus seulement `wy`). Le **y-sort peintre livré le
  2026-07-10** (`frontByPainter` + `CM.buildingInfo` base/portée par cellule) est le
  socle : transposer `baseY` → `baseDepth`, mêmes fiches, mêmes tests.
- Cible : remplacer « 2 passes + bake tuiles » par un rendu ordonné par diagonales
  (rangées gx+gy) avec agents intercalés ; le bake offscreen ne garde QUE le sol
  (leçon greybox : ne pas baker ce qui doit s'intercaler).

### Phase 3 — Bâtiments (2-4 sessions)
- Ancrage propre : base du sprite au losange (offset = demi-hauteur de tuile), ombres
  portées re-cohérentes (lumière haut-gauche, règle projet).
- Inventaire visuel : capturer chaque famille posée en iso, trier « passe / jure ».
- Retouches ciblées PixelLab sur les « jure » (mêmes pipelines : create_map_object iso
  high top-down + quantize 24). Les merveilles (frontales par design) restent frontales.

### Phase 4 — Agents (2-3 sessions + génération par vagues)
- Le déplacement reste 4-directions grille, mais à l'écran ces axes sont des diagonales →
  re-générer les bandes de marche en **4 vues diagonales** (PixelLab 8-direction objects,
  on ne prend que SE/SO/NE/NO) :
  - habitants : 5 ères × (2 h + 2 f + 1 enfant) ≈ 25 persos × 4 dirs × 6 frames ;
  - porteurs (basket-man/woman), chevaux/bœufs d'attelage ;
  - véhicules : cart, barrow, wagon, chariot, caravan, car, tram (7 × 4 vues) ;
  - émeutiers : PLUS TARD (repli top-down tolérable pendant la transition).
- Offsets trottoir/files (`lox/loy`, `vehicleLaneOffset`) : projeter le vecteur d'offset
  (le décalage « à droite du sens de marche » devient diagonal à l'écran).
- ⚠ rate-limit PixelLab ≈ 5/vague (gotcha connu) → générer par lots scriptés
  (`scripts/fetch*.mjs` existants comme modèles), frame 0 v3 à fond blanc à écarter,
  boucles ping-pong pour les anims (leçons `worldtree`).

### Phase 5 — Fleuve, ponts, quais, bateaux, tram, effets (2-3 sessions)
- pixelRiver : le ruban est en coordonnées monde → se reprojette ; refaire bord/écume
  en diagonale ; bateaux : vues iso par stade (5) au lieu du profil miroité.
- pixelBridge : tabliers diagonaux (nouvelles bandes par matière) ; pont central
  sanctuarisé inchangé dans sa LOGIQUE (mémoire `central-bridge-always-present`).
- Quais par ère, anneau de tram, drones (sprite top-down pivoté : passe tel quel au
  premier jet), phares/lumières/nuit : tapis additifs → suivent la projection.

### Phase 6 — Interaction, perf, bascule (1-2 sessions)
- Hit-test/tooltips (`cityMapHitTest`), minimap, LOD (masses de quartier iso), mesure
  perf des bakes (budget : pas pire que le top-down actuel à zoom équivalent).
- Bascule : `CM.iso` ON par défaut quand les captures des 6 phases sont validées ;
  le renderer top-down reste en repli (`__iso(false)`) au moins une release.

## Budget & risques

- **Estimation : ~10-15 sessions**, dont ~40 % d'art PixelLab (terrain/routes + agents).
- Le poste art est le vrai coût ; le jalon Phase 1 le protège (on ne génère les agents
  qu'après le go).
- Risques : (1) demi-conversion des repères → paré par projection.js unique ;
  (2) tri de profondeur (le plus gros piège iso) → paré par la Phase 2 dédiée et le
  peintre déjà en place ; (3) perf du rendu ordonné (moins de bake) → mesurer au jalon.
- Ce qui ne bouge PAS : save, économie, roadGraph, placement persistant (Voie A),
  mécanique cmEngineInstances, i18n, splash-arts.

## Première session type (quand Raphaël dit go)

1. Phase 0 (harnais + baselines).
2. `projection.js` + `__iso` + conversion caméra/souris.
3. Tileset iso « herbe + terre + 1 route pavée » minimal via PixelLab.
4. Capture de la même ville en top-down vs iso → montrer, décider de continuer.
