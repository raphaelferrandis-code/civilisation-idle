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

## PHASE 3-LITE — SCÈNES MOTEUR POSÉES (2026-07-11, reprise — LIVRÉ)

**L'expérience « boîte carrée ancrée au losange » MARCHE** pour l'écrasante majorité
des scènes : `drawEngineSprite(t, bx, by, bw, bw, now)` (export buildingShapes) appelé
depuis isoRenderer avec une boîte carrée (largeur = 0.72 × largeur losange, bas ≈ coin
sud) → temples, académies, banques, serres, guildes, marchés, tours de guet… se posent
QUASI TELS QUELS (props transparents + persos + détails). Le cœur de ville n'a plus de
socles (captures iso-scenes2-wide / iso-scenes-close). Molette `__isoEngineScenes(false)`
→ socles ; scène qui jette = quarantaine par buildingId (aucune à ce jour).

**3 familles NE se posent PAS en boîte (réglées autrement)** :
- **Riverains** (water_mills, river_ports…) : la scène embarque son propre carré d'eau
  + pontons calés au repère carré (roue à aubes sur la berge, bassin flottant à côté du
  ruban) → EXCLUS (empreinte touchant river.cells/banks = rien du tout, art Phase 5).
- **Champs** (irrigated_fields 10×6 & co, regex /field|farm|crop|orchard/) : scène DE
  SOL → remplacée par une PARCELLE cultivée plate dans l'emprise losange + SILLONS
  projetés (fillWorldQuad). Se lit très bien (iso-scenes4-champs).
- **Aqueducs** (10×1) : bloc extrudé = mur qui chevauchait champ/berge → CANAL plat
  étroit le long de l'axe long + filet d'eau central.

## DA HABITANTS VERROUILLÉE (2026-07-11) — « FIGURINE D'ÉPOQUE »

2 panels pilotes (7 candidats) → **Raph choisit C** : proportions CONCRÈTES + costumes
aux MOTIFS D'ART de leur ère (antique = céramique grecque terracotta/noir/or ; le
concept scale par ère). REJETS FERMES : mignon/chibi (« j'aime pas les trucs mignons »),
tête-emblème (trop étrange). **G « ombre dorée » mis de côté = piste leader d'émeutiers.**
⚠ QUALITÉ : create_character **v3 OBLIGATOIRE** (le mode standard fait des yeux ratés —
retour Raph). Pilote final : greekman-DA-C-final (id 39f51294-…), marche diagonale en
file, fetchAgentsIso pointe dessus. Détail + rejets : mémoire da-habitants-figurine-epoque.

## PHASE 4 — BATCH HABITANTS **TERMINÉ** (2026-07-11, ~2 h de pipeline)

**25/25 personnages** (5 ères × homme/homme2/femme/femme2/enfant) générés en v3,
marches 6 frames sur les 4 DIAGONALES, assemblés (`fetchAgentsIso`), quantizés 24,
**vérifiés in-game aux 5 bandes** (captures `era-A-prehistoire` → `era-E-futur`).
Langages d'art par ère : ocres pariétaux / céramique / enluminure lapis-vermillon-or /
gravure sépia + brique / néon sur sombre. Ids + prompts : [scripts/isoBatchRoster.json](scripts/isoBatchRoster.json)
(⚠ persos PixelLab expirent ~8 h — les PNG sont dans le repo, le roster sert d'archive
de recette). Coût ≈ 150 générations.
**Leçons pipeline** : 10 slots de jobs → ~2 persos en vol (1 création 2 slots + 1 marche
4 slots×2) ; UN job de direction peut échouer EN SILENCE (villagerchild north-west) →
vérifier `animations` dans get_character et re-queuer LA direction seule ; les canvas v3
varient (88/92 px) → loaders auto-adaptatifs (fait).
⚠ Le mode LEGACY top-down affiche toujours les ANCIENS habitants (bandes cardinales) —
la nouvelle DA vit dans les diagonales iso. Options plus tard : régénérer les 4
cardinales des 25 persos (~100 gens) OU basculer l'iso par défaut (Phase 6).

## RETOURS DE TEST RAPH (2026-07-11) — CORRIGÉS

- **« Les gens marchent vite / glissent »** : (1) l'animation de marche est désormais
  pilotée PAR DISTANCE parcourue (odomètre `p.walkDist` + `__strideLen`, défaut 2.2 px
  monde par frame) → les pieds accrochent le sol ; (2) facteur de calme iso sur la
  vitesse piétonne (`__isoWalkSpeed`, défaut 0.72 — la projection 2:1 étale l'écran,
  la même vitesse monde paraissait pressée). Legacy intact.
- **« Sols très plats »** : patchwork tonal PAR ÎLOT (~4×4 cellules, ±5 %), grain de
  texture urbain 0.26→0.30, BORDURE de trottoir sombre le long de tous les rubans de
  chaussée, taches d'usure éparses (1 cellule urbaine sur 9). Capture sol-v2-close.png.
  Le VRAI sol riche (tuiles par ère + props de sol PixelLab) reste pour la Phase 5 art.

## VÉHICULES DIAGONAUX — TERMINÉ (2026-07-11 soir)

Les **7 types** (cart, barrow, wagon, chariot, caravan, car, tram) ont leurs 4 vues
diagonales : `create_8_direction_object` (20 gens/objet, description-only — ⚠ le relais
base64 d'une image de référence via MCP se corrompt, ne pas retenter), extraction des
rotations south-east/south-west/north-east/north-west par
[scripts/fetchVehiclesIso.mjs](scripts/fetchVehiclesIso.mjs) (section "vehicles" du
roster), quantize 24. Câblage : `ensureVehDiag`/`vehDiagReady` (agents.js) +
drawIsoVehicle privilégie la diagonale (1 frame fixe) avec repli cardinal animé ; le
POUSSEUR de charrette utilise aussi la vue diagonale (nouvelle DA). Vérifié :
`veh-diag-antique2.png` (attelages/brouettes antiques) + `veh-diag-indus.png` (voitures
sur les rues diagonales). ⚠ Diagonales = frames FIXES (roues immobiles) — l'animation
des roues en diagonale (animate_object par direction) reste un raffinement futur.

**⚠ AUDIT D'ORIENTATION (2026-07-11, bug Raph « voitures de profil ouest→est ») —
les rotations PixelLab sont MAL ÉTIQUETÉES par type.** Deux causes cumulées :
1. Les diagonales générées PENDANT que le jeu tournait avaient été « 404-cachées » par
   le premier chargement raté → `loadWithRetry` (3 essais 8/16/24 s, cache-buster `?r=N`)
   dans `ensureAgentDiag`/`ensureVehDiag` (agents.js). Un F5 suffisait pour ce volet.
2. Surtout : audit visuel par planches contact 4 vues (`.preview-shots/{type}-4views.png`,
   ordre SE|SW|NE|NW) → défauts PAR TYPE dans les fichiers livrés par
   `create_8_direction_object` :
   - **car, chariot, caravan, tram** : la PAIRE SUD est MIROIR (le fichier `southeast`
     regarde le sud-ouest et vice-versa) ; paire nord correcte.
   - **cart** : les BRANCARDS sont traités comme l'avant (or on la POUSSE : brancards
     à l'opposé du sens de marche) → remap 180°.
   - **wagon, barrow** : corrects.
   Fix : table `VEH_DIAG_MAP` par type dans drawIsoVehicle (isoRenderer.js) qui remappe
   dir monde → NOM DE FICHIER (pas la vue « logique »). Vérifié in-game :
   `veh-dirs-final.png` + zooms (voitures 3/4 propres SE et SW, plus aucun profil).
   Règle apprise : **ne jamais faire confiance aux labels de rotation PixelLab — auditer
   chaque type à la planche contact avant câblage.**
⚠ La save de test 5193 avait accumulé une Rupture 100 % (autosave d'un montage 1e42) :
la purge IndexedDB est BLOQUÉE par la connexion ouverte de l'app → résoudre PAR LE JEU
(Effondrer la Cité + gravure) — noté pour le harnais.

## RIVERAINS ISO — LIVRÉ (2026-07-11 soir)

Port fluvial + moulin à eau POSÉS sur le ruban en iso (`drawIsoRiverside`,
isoRenderer.js) — ils étaient jusqu'ici exclus (ni scène ni socle). Recette :
la scène-boîte legacy est DÉCOMPOSÉE — corps de bâtiment (sprite transparent,
jamais de procédural) sur la berge, ponton/roue plongeant plein SUD monde
(garanti par layout : waterSide "S", bord sud du lot ≈ centre du fleuve),
bateau de l'ère amarré SUR le ruban (même trait que drawIsoShips, clapot sans
sillage). Vérifié aux captures `iso-riverains-6.png` (industriel : minoterie +
roue métal + vapeur à quai) et `iso-riverains-antique.png` (hutte + ponton bois
+ radeau ; cabane + roue bois). Molette : `__isoEngineScenes(false)` les coupe
aussi. Leçons durement acquises :
- **Bord d'eau = ribbonAtX(rv, colonne)** : interpolation des samples AU DROIT
  du lot. Le « sample le plus proche du lot » ment dans les coudes (ponton qui
  démarrait sur l'herbe à la capture).
- **⚠ PADDING PIXELLAB : ancrer le BAS DU CONTENU, jamais le bas du PNG.** Les
  props ont ~25 % de vide transparent sous les pieds (le moulin « flottait »
  90 px au-dessus de sa boîte). Helpers : `propBBox` (cityEngineSprites, bbox
  alpha cachée, exportée) + `blitPropAnchored` (isoRenderer) qui pose par le
  contenu ET préserve l'aspect naturel (imposer W et H déforme : l'aspect du
  contenu ≠ l'aspect du PNG). `blitPropRot` (exporté aussi) pivote déjà au
  centroïde opaque → seul le DIAMÈTRE de la roue se corrige par contenu.
- Roue au flanc OUEST du contenu (léger recouvrement, moyeu un peu au-dessus de
  la base) et **réduite à 0.6× la largeur du corps** : à taille legacy (~0.9×)
  elle concurrençait le bâtiment posée sur l'eau libre.
- Débogage : les marqueurs peints sur CM.ctx sont EFFACÉS par __cityShot
  (captureFrame re-rend) → capturer via `CM.canvas.toDataURL` + POST /__shot
  pour garder un overlay. Les marqueurs ont prouvé la géométrie juste quand la
  lecture « à l'œil » des captures accusait à tort les maths.

## QUAIS PAR ÈRE EN ISO — LIVRÉ (2026-07-11 soir)

Les quais legacy (`cityMapDrawQuays`, renderWorld.js — pierre→marbre→fonte→néon→
énergie, gating urbain par sample, lampadaires la nuit) sont devenus
**PROJECTION-AWARE** : leur helper `pt()` projette désormais via
`worldToScreen` du module iso (IDENTITÉ quand CM.iso off → zéro régression
legacy, vérifiée capture `legacy-quais-regression.png`). drawIsoWorld les
appelle entre fleuve et bateaux → promenade qui suit le ruban en losange
(capture `iso-quais-1.png` + zooms). C'est LA recette pour partager du rendu
monde-space entre les deux modes : tout ce qui est écrit en samples+normales se
convertit en changeant SEULEMENT la projection.

## ROUES ANIMÉES DIAGONALES — batch 2026-07-11 soir

Les 7 véhicules passent de 1 frame figée à des bandes « rolling » 6 frames par
diagonale. Recette PixelLab : `animate_object(object_id, directions=[les 4
diagonales], frame_count=6, keep_first_frame=false, mode v3)` — UNE requête = 4
jobs ; description « … rolling forward IN PLACE, wheels spinning, no camera
movement, seamless loop ». Récolte : [scripts/fetchVehiclesIsoAnim.mjs](scripts/fetchVehiclesIsoAnim.mjs)
(zip objets : `animations/<uuid>/<dir>/<i>.png`) → assemble et ÉCRASE les
`veh-{type}-{dir}.png` 1-frame (le lecteur est adaptatif : nf = largeur/hauteur),
idempotent par LARGEUR de bande, puis quantize 24. Câblage : odomètre
`v.rollDist` (updateVehicles) + frame par DISTANCE dans drawIsoVehicle (molette
`__vehStride`, défaut 0.09 tuile/frame) — anti-patinage ; les bandes cardinales
legacy gardent leur cadence temporelle. VEH_DIAG_MAP (labels PixelLab faux par
type) s'applique tel quel : les anims héritent des labels de leurs rotations.
Vérifié in-game : `rollY-compare.png` (rayons de la charrette qui tournent
entre 2 captures, voiture qui vibre).
- ⚠ **Gotcha harnais dt** : en pane cachée, forceFrame avance la sim de ~1-5 ms
  par frame (dt réel) et les sleeps sont throttlés → pour VÉRIFIER une anim par
  distance, PILOTER `v.rollDist` à la main entre 2 captures (+2.9 = 1 frame).
- ⚠ **Artefact « objet qui pousse »** : le char a généré un FOUET doré qui
  grandit frame à frame (pop au bouclage). Fix : re-roll SUR LE MÊME groupe
  (`animation_group_id` + `replace_existing=true`) avec une nouvelle
  description négative (« empty, no rider, no whip, nothing new appears ») —
  la nouvelle description EST acceptée sur un groupe existant.
- ⚠ Véhicules stagés pour test : peuvent finir occlus par les tours (y-sort
  correct) — les poser sur la cellule plaza MÉDIANE, pas la moyenne des
  cellules (la moyenne tombe sous la merveille).
- Statuts : **LES 7 LIVRÉS** (vérifiés in-game : nf=6 chargé pour chaque type,
  console propre). Chariot = 2e roll (fouet éliminé ; reste un petit FANION doré
  qui flotte sur le panier — cohérent char de guerre, toléré, re-rollable plus
  tard). Tram : NE/NW avaient sauté sur un rate-limit « wait longer » → requeue
  des 2 directions seules via animation_group_id, passées du premier coup.

## RETOURS RAPH 2026-07-11 (caravane, roue moulin, bateaux) — CORRIGÉS

1. **Caravane de profil ouest→est** : deux causes. (a) La RÉGÉNÉRATION des
   animations avait RE-REDRESSÉ ses labels (la paire sud n'est plus en miroir)
   → entrée `caravan` RETIRÉE de VEH_DIAG_MAP (map par défaut). **RÈGLE : les
   labels d'orientation PixelLab BOUGENT à chaque régénération — re-planche
   contact (`veh-audit2.png`, `draft-audit.png`) après TOUT batch.** (b) Le
   CHEVAL/BŒUF de trait n'existaient qu'en profil cardinal → nouveaux objets
   8-dir PixelLab (horse 77b40222, ox d88169c0, roster section vehicles) animés
   « walking » 4 diagonales, bandes `veh-horse/ox-*.png` via le MÊME
   fetchVehiclesIsoAnim.mjs, dessinés par `drawDraftIso` (isoRenderer — frame
   par v.rollDist, DRAFT_DIAG_MAP labels vrais, repli drawNamedAgent cardinal).
   Vérifié : `fix-draft-caravan.png` (caravane SE + cheval 3/4 SE devant).
2. **Roue du moulin « de face »** : projetée DANS LE PLAN DU MUR SUD (la face
   visible côté eau d'un bâtiment iso est le mur sud, axe monde +x) via
   `ctx.transform(1, ISO_Y, 0, 1)` + rotate — l'ellipse est la projection
   exacte, la rotation continue est conservée, aucun nouvel art. Moyeu plaqué
   au flanc (hub = rect.x+0.45·wpx2, base.y−0.35·wpx2), moitié basse dans
   l'eau. En prime : les riverains INTERROMPENT le quai sur leur emprise
   (ensureQuayGate zère plus/minus sur [gx−0.5, gx+span+0.5] — la promenade
   passait sous la roue ; vaut aussi en legacy). Capture `fix-mill-3-zoom.png`.
3. **Bateaux « qui tombent »** : le tilt suivait la tangente projetée à fond
   (~27° sur un fleuve diagonal, sprites = PROFILS) → tilt AMORTI ×0.45 borné
   ±0.4 rad, dans drawIsoShips ET le bateau amarré du port. Le vrai fix (vues
   de bateaux iso par stade) reste en Phase 5 art.

## PHASES 5 & 6 — TERMINÉES (2026-07-11 nuit, goal « fais phase 5 et phase 6 »)

**Roue de moulin REFONDUE en vrai sprite iso** (le skew « faisait bizarre »,
Raph) : 3 review-packs create_1_direction_object 96px « wheel at isometric
three-quarter angle » (4 candidats chacun, choisis : bois[1], métal[2],
turbine[1]), promus via select_object_frames, animés « turning » 6 frames,
bandes public/pixelart/iso/mill-wheel-{wood|metal|turbine}.png, câblées dans
drawIsoRiverside (frame par temps, période 160/130/90 ms ; repli = skew).
Stades : bois 0-1, fonte 2, turbine 3+cosmique.

**Bateaux iso par stade** : 4 objets 8-directions 80px (raft/sail/steam/
container, roster boatsIso) → 8 rotations chacun public/pixelart/iso/
boat-{stage}-{dir}.png (fetchIsoPhase5.mjs, labels audités VRAIS boats-audit.png).
drawIsoShips : coque = rotation au SECTEUR du cap projeté (boatSector, 8 vues,
plus AUCUNE rotation du sprite) ; sillage + ombre pivotés au cap complet (l'eau
suit la pente, la coque reste droite) ; clapot vertical ; repli profil amorti ;
cosmique = legacy conservé. Bateau amarré du port : même recette. Voie
resserrée hw×0.78 (coques qui mordaient la berge dans les coudes).

**Tablier de pont + terre-plein PIXEL en iso — astuce « withLegacyToIso »** :
P_iso = A ∘ P_legacy avec A l'affine écran autour du centre, colonnes
(ISO_X, ISO_Y) / (−ISO_X, ISO_Y). Tout rendu legacy d'art « À PLAT »
(drawPixelBridges, drawPixelMedians) appelé sous cette transform se projette
EXACTEMENT sur le plan du sol en losange — zéro re-art, réutilise la DA
« tablier à plat » et le terre-plein planté tels quels. Vérifié :
`p5-bridge-zoom.png` (tablier fer + voitures dessus), `p5-median-zoom.png`.
⚠ Réservé à l'art à plat (une verticalité bakée se coucherait) ; le cull
interne de drawSpan reste en repère legacy (conservateur, pont central OK).
Même famille que la roue au mur (plan VERTICAL : transform(1, ISO_Y, 0, 1)).

**Phase 6 — ISO PAR DÉFAUT** : isoFlag.on=true au boot (projection.js),
`__iso(false)` PERSISTÉ via localStorage cmIsoMode (secours/A-B legacy
conservé, pas de suppression du renderer top-down). Vérifié : boot frais iso
sans molette (`iso-default-boot.png`), persistance 0/1, 242 tests verts.
Perf : dézoom max → bake ~9 ms puis frames ~0 ms (LOD actif) ; zoom moyen OK.

## RETOURS RAPH 3 (2026-07-12) — arbres, roue 3/4, jonction pont — CORRIGÉS

1. **Arbres pixel** : les sapins-triangles Phase 1 (« pas faits correctement du
   tout ») remplacés par 4 sprites PixelLab 96px (2 feuillus + 2 conifères,
   review-packs 224b9b79/c5b10d90, candidats téléchargés DIRECTEMENT depuis les
   URLs frame_N du pack sans promotion) → public/pixelart/iso/tree-1..4.png,
   variante par hash de cellule dans drawIsoLive, repli triangle. `r2-trees-zoom.png`.
2. **Roue de moulin v2 — LA recette du 3/4** : générer la roue en objet
   **8-DIRECTIONS** (« standing vertically upright ») et prendre sa rotation
   **south-west** = vrai 3/4 face bas-gauche (audit `wheel-rot-audit.png`),
   puis animate_object sur CETTE direction seule (« turning » 6 frames).
   3 stades refaits (wood cdd96a5f / metal 147f5ccd / turbine 0a8e0026),
   mêmes fichiers iso/mill-wheel-*.png (câblage inchangé). Les v1 1-direction
   sortaient trop DE FACE malgré le prompt « isometric angle » — un objet
   8-dir donne l'angle par construction. `r2-mill-v2-zoom.png`.
3. **Jonction pont/routes** : RAMPES D'ACCÈS (drawBridgeAprons, isoRenderer) —
   trapèze en matière de chaussée qui s'évase du ruban de route vers la
   chaussée du tablier (0.55 de la demi-travée, PAS les rails : v1 trop
   massive), calé sur les bornes ÉTENDUES aux exits (le tablier pixel se
   prolonge jusqu'aux routes d'atterrissage — calée sur les cellules-pont, la
   rampe coupait le tablier en biais). Dans les 2 chemins (pixel + procédural).
   `r2-junction-3-zoom.png`.

## RETOURS RAPH 4 (2026-07-12) — jonction, terre-pleins, sens roue, pontons

1. **Jonction affinée** : la rampe-aplat « trop brute » → DÉGRADÉ de matière
   chaussée→tablier (createLinearGradient entre les milieux projetés des deux
   bords, roadTone→bridgeTone) + fines bordures sombres sur les flancs +
   gabarit réduit (0.4 dehors / 0.6 dedans, chaussée 0.5). `r3-junction-zoom.png`.
2. **Terre-pleins en RELIEF** : la projection à plat de drawPixelMedians
   COUCHAIT les plantes bakées (⚠ confirmation de la limite de withLegacyToIso :
   art à plat SEULEMENT) → retirée. Le sol reste le gazon du bake ; le relief
   vient de BUISSONS DEBOUT (tree-1/2 réduits, r 0.24-0.34, pas 1.15 cellule,
   jitter par hash) plantés le long de L.terrePlein DANS la passe peintre
   (kind 'bush' de drawIsoLive). `r3-median-zoom.png`.
3. **Sens de la roue** : frames jouées À L'ENVERS (l'anim PixelLab tournait
   dans le mauvais sens) — fr = (nf−1) − (t % nf).
4. **Pontons iso** : le ponton du port passe du procédural au SPRITE legacy du
   stade (port-prop-pontoon → dock-stone → dock-modern), projeté AU SOL via
   withLegacyToIso sur le rect monde du ponton (l'art est « à plat » vertical),
   repli planches. `r3-port-zoom.png` (pilotis aux angles, vapeur à couple).

## RETOURS RAPH 5 (2026-07-12) — lampadaires, places, terre-pleins v2, roue, ponts/pontons

DA PLACES VALIDÉE PAR RAPH : fontaine monumentale évolutive + parterres fleuris
+ bancs/réverbères, UNE scène complète par ère, dominante minérale claire.

- **LAMPADAIRES par ère — LIVRÉ** : 4 mâts PixelLab (colonne à lampe d'huile
  band 2-3, réverbère à gaz double 4-5, électrique 6, pylône-anneau énergie 7+),
  fichiers iso/lamp-{antique|gas|electric|energy}.png. `isoLamps` = liste
  déterministe (cellules traversantes, 1/3, côté par hash, PAS band<2), mâts au
  peintre, et drawIsoNight ANCRE les halos aux têtes (+ flaque au pied) — les
  orbes flottants au centre des bâtiments sont RETIRÉS. `r4-lamps-night.png`.
- **PLACES — LIVRÉ** : 5 scènes 256px iso/plaza-{antique|medieval|industrial|
  modern|cosmic}.png (quantize 32), posées sur la dalle via `isoPlazaBox` —
  ⚠ composante CONNEXE de la dalle centrale par flood-fill (la bbox de toutes
  les cellules 'plaza' avale des cellules isolées ailleurs → scène géante, vu à
  la capture). Profondeur au CENTRE (passants sud devant / nord derrière).
  Pas de scène band<2. `r4-plaza-2.png` (fonte + haies au cœur de la ville).
- **TERRE-PLEINS v2 — LIVRÉ** : segments plantés 8-dir (3b2c6a6c, rotations
  SE/SW = les 2 diagonales), tuilés tous les 2 cellules le long des coutures,
  au peintre ; buissons gardés en repli. `median-rot-audit.png`.
- **ROUE** : sens inversé (frames à l'envers).
- **PONTS COMPLETS — LIVRÉ (après 2 impasses)** : ① la projection à plat
  restait « brute » ; ② le TUILAGE de segments 8-dir libres ne raccorde PAS
  (zigzag, l'angle interne de chaque sprite dévie — ne pas retenter). Solution :
  le pont central étant UNIQUE et toujours VERTICAL (N-S), UNE image complète
  256px par matière (culées + piles dans l'eau + arches), étirée sur la travée
  étendue aux exits (drawIsoBridges : W2 = len×1.16, ancre mid −0.52). Gotchas :
  béton généré en SE → FLIP X au download (lumière inversée tolérée) ; énergie
  v1 avec dalle d'eau bakée → re-roll « floating, NO water ». Fichiers
  iso/bridge-full-{bois|pierre|fer|beton|energie}.png. `r6-bridge.png`,
  `r6-cosmic-bridge.png`. ⚠ Bug classique corrigé : coordonnée déjà ×T
  re-multipliée dans worldToScreen → sprite hors écran, seule l'ombre visible.
- **PONTONS v2 — LIVRÉ** : objets 8-dir sur pilotis ; bois = paire NORD (nw)
  pour courir en SW, pierre = sw, BÉTON = eau bakée REBUT (pierre sert au
  stade 3+, re-roll futur). drawIsoRiverside pose iso/pontoon-*.png (repli
  planches). `r5-pontoon-zoom.png`.
- **RECALAGES (retour Raph « anciens dessous / décalés / trop collé »)** :
  isoArt invalide le BAKE au décodage (CM._isoGroundBake=null) → la dalle
  claire de place devient sol urbain quand la scène est prête, la bande gazon
  des terre-pleins saute quand les segments sont prêts ; `drawIsoGroundedArt`
  cale le LOSANGE DE CONTENU mesuré (bbox alpha) sur l'emprise visée (place,
  médians) au lieu du canvas brut ; AÉRATION : pas d'arbre décoratif à <1.5
  cellule de la place ni <1 cellule d'un terre-plein. Places antique (DA grec :
  méandre, amphores, bronze) et moderne (sans stèles-miroirs) RE-ROLLÉES et
  validées. `r6-plaza.png`, `r6-median.png`.

## NORMALISATION GÉOMÉTRIQUE (2026-07-12, retour Raph « en biais / mauvais sens »)

⚠ LEÇON CENTRALE : les scènes PixelLab « isometric » sortent avec un ANGLE
INTERNE ARBITRAIRE — places à pente 0.59–1.01 (un carré pivoté !) au lieu du
losange 2:1, ponts déviant de −1.6° à +17.7° de la diagonale, béton carrément
en MIROIR. Aucun prompt ne le garantit → ON MESURE ET ON CORRIGE L'ASSET :
[scripts/normalizeIsoScenes.mjs](scripts/normalizeIsoScenes.mjs) (originaux → iso/_orig/, idempotent depuis l'orig) :
- PONTS : PCA des pixels opaques → axe principal ; FLIP X si l'axe court en
  SE ; ROTATION nearest vers la diagonale SW exacte (pente 0.5) ; recadrage.
  Pose in-game : étendue HORIZONTALE du sprite = |Δx| écran de la travée
  ×1.04, hauteur à l'aspect naturel, centre du contenu au milieu de la travée
  (le tablier passe par le centroïde du PCA). Vérifié béton (le pire : flip +
  17.7°) `n1-bridge-beton.png` et pierre `n1-bridge-pierre-crop.png`.
- PLACES : pente du losange mesurée (coin gauche → coin sud) ; correction
  RÉPARTIE X/Y (fx = 1/√c, fy = √c ; écraser Y seul divisait la fontaine par
  deux) vers 2:1 exact. Vérifié moderne `n1-plaza-modern.png` + antique.
- drawIsoGroundedArt : hauteur à l'ASPECT NATUREL (canvases non carrés après
  recadrage), plus jamais boxH = boxW.
Si les fontaines paraissent un peu plates/larges (antique ×0.70 Y, ×1.42 X) :
re-génération possible, mais re-normaliser QUAND MÊME toute nouvelle scène.

## RETOURS RAPH 6 (2026-07-12) — revert ponts, terre-pleins continus, places v3

- **PONTS : REVERT DÉFINITIF au tablier plat projeté + rampes** (décision
  Raph : « annule et remet comme avant »). Leçon : re-tourner un sprite ne
  corrige PAS sa perspective interne — les ponts complets normalisés en angle
  paraissaient TORDUS en jeu. Les bridge-full-* restent sur disque, débranchés.
  Le pont en iso = drawPixelBridges sous withLegacyToIso + drawBridgeAprons.
- **TERRE-PLEINS v3 — bande CONTINUE CLIPPÉE** : un seul item peintre par
  segment (`medianRun`) ; clip monde = couture ± 0.3T (largeur d'une chaussée)
  × [y0, y1+1] coupé NET aux bornes, marge haute (lift 0.9·T·z) pour laisser
  dépasser le relief vers le haut ; sprites plantés tuilés pas 1.5 avec
  chevauchement À L'INTÉRIEUR du clip. Fini le sol qui dépasse devant/derrière
  et la largeur fantaisiste. Sûr au peintre : la bande vit au milieu du
  boulevard, rien ne la chevauche latéralement. `n2-median-long.png`.
- **PLACES v3 — re-générées + normalisation** : le prompt « EXACTLY twice as
  wide as tall » n'est PAS honoré (pentes mesurées 0.63–0.955) mais les scènes
  partent de plus près → correction répartie plus douce. Mesure de pente
  AMÉLIORÉE dans normalizeIsoScenes : régression sur l'ENVELOPPE BASSE
  (silhouette du socle, colonnes 8–45 %) au lieu des coins extrêmes que les
  bancs/lampes piégeaient. Vérifié à plat en jeu `n2-plaza-final-zoom2.png`.
  ⚠ RÈGLE : PixelLab ne garantit JAMAIS le 2:1 — la normalisation est LE
  garant, toute scène passe par le script.

## TERRE-PLEIN 3-SLICE (2026-07-12, « il s'ajoute les uns sur les autres »)

Empilement = on répétait le SPRITE ENTIER (bouts + arbre baked) avec chevauchement
→ dupliquait ses éléments. Fix = découpe cap/milieu/cap comme l'AQUEDUC/le PONT
(drawTiled) : `scripts/sliceMedianIso.mjs` REDRESSE la bande diagonale à
l'horizontale par **PCA** (PixelLab la dessine à ~40-45°, pas à l'angle iso), la
coupe en start | mid (UNE période) | end, coupes calées à la main sur des points
de raccord (arbustes/gazon uniforme). Rendu (isoRenderer, kind `medianRun`) : repère
PIVOTÉ sur la couture, start (1×) → mid ×N étirés pour combler PILE la longueur
(nombre entier, < 1 période d'écart = invisible) → end (1×), clip = longueur nette +
marge haute pour le relief. Largeur = chaussée (T·z·0.62).
- ⚠ « à l'envers » sur l'axe VERTICAL : pivoter par l'angle de couture (~153°,
  bas-gauche) retourne la haie. FIX : si |θ|>90° on **inverse les deux bouts**
  (θ→θ−180 ≈ −27°, petite rotation) → dessus en haut, éclairage haut-gauche
  conservé. Une SEULE paire de pièces (SE) sert aux 2 orientations via ce flip.
- ⚠ DA : Raph préfère la bande PLATE engazonnée + petits arbustes + BEAUCOUP de
  fleurs (objet 1-dir `d3a232bc`), PAS les grosses boules de buis (8-dir). Dense =
  tuile sans couture visible. Source unique = median-se-scene.png (d3a232bc).
- ⚠ PixelLab ignore la diagonale demandée en 1-direction (donne souvent bas-droite
  même si on demande bas-gauche) ; peu importe ici, le flip gère les 2 sens.
Vérifié in-game les 2 orientations (`m5-se-zoom`, `m5-sw2-zoom`). Reste : dérouler
5 ères (re-générer une bande plate d3a232bc-style par ère, re-slicer). ⚠ Harnais :
save de test coincée en crise → purge = `localStorage.removeItem("civilization-collapse-idle-v1")` + reload DANS LE MÊME appel (l'autosave réécrit sinon).

**RESTE (polish futur, hors goal)** : bateaux cosmiques en rotations iso ;
fanion du char re-rollable ; ponton béton à re-roller (eau bakée) ; régénérer
les vues cardinales legacy dans la nouvelle DA ou retirer le top-down un jour.

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
