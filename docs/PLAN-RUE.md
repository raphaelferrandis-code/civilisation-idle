# Plan — La rue : réverbères, buissons, terre-pleins

Chantier ouvert le 2026-10-02 sur une question de Raph : « on refait une passe sur
les lampadaires/buissons/terre pleins ? ». Planche du diagnostic (Artifact) :
`KkciJMvPUo68LVfnLvkhke`.

## 1. Le diagnostic (mesuré sur villes de démo, ères 2 à 9)

Le mobilier de rue était resté dans son état d'août quand le sol, les maisons, les
places, le pont, les bateaux et les merveilles passaient au grain de la ville, avec
une version par ère et une seule ombre solaire.

1. Le même terre-plein à toutes les ères (gazon clair, `flowerbed-1..4`, `bush-1..6`).
2. 46 à 57 % des cases de terre-plein hors de la ville : le boulevard `main` sort en
   forêt et `computeTerrePleinSegments` n'a pas la règle `builtNear` des mâts.
3. Réverbères à 0,22 px d'écran par px d'art (110-120 px de haut affichés sur
   25,6 px) ; maisons 1,10, sol 1,0. Le pont pose les mêmes PNG à 16 px.
4. Quatre dessins pour huit ères (`lampEraForBand`) : colonne romaine aux deux ères
   médiévales, anneau cyan dans la cité d'or et celle du Démiurge.
5. Boulevards : chaque voie choisit son côté, souvent la couture → zigzag et 7 à 11
   paires de mâts à moins de 0,6 case par ville.
6. Buissons : ellipse sombre au lieu de l'ombre solaire, pas de vent, pixels de
   taille différente d'une variante à l'autre (0,17 à 0,64).
7. Gazon deux fois plus clair que le pré (luminosité 0,45 contre 0,21-0,31).

## 2. Les décisions de Raph (2026-10-02)

| Question | Réponse |
|---|---|
| Réverbères | **Par le code**, un par ère, au grain de la ville, 16 px environ, palette du pont de l'ère |
| Hors de la ville | **Herbe simple** : bande d'herbe au ton du pré, sans plantations ni bordure |
| Boulevards | **Une file au milieu** du terre-plein, en alternance avec les plantations |
| Plantations | **Une recette par ère** |

## 3. Les lots

1. **Pose** — terre-plein planté seulement où la ville le borde ; mâts des voies du
   boulevard retirés, file de candélabres sur la couture.
2. **Réverbères** par le code, un par ère ; le même pour rue, quais, places, port
   (et pont, à reprendre au déroulé).
3. **Terre-pleins** par ère : gazon au ton du pré, bordure de la matière de l'ère,
   plantations de l'ère.
4. **Buissons** : ombre solaire, vent, un seul grain (île de la merveille comprise).

Méthode du pont : pilote ère du Marbre (bande 4), planche avant/après, puis les sept
autres ères.

## 4. Architecture (pilote)

- `src/game/map/iso/streetKits.js` — les kits par bande. Dessin PUR en raster RGBA
  (repère : x depuis l'axe du pied, y = hauteur au-dessus du sol), liseré posé SUR
  les pixels de bord (règle du pont : dessus, gauche, droite ; jamais dessous).
  `streetKitFor(band)` (null = ère pas encore faite → mobilier d'avant),
  `streetKitLampArt`, `streetKitPlantArt` (canvas mémoïsés, `_foot` connu par
  construction : `artW/artH` en px d'art = px d'écran au zoom 1).
  Molette A/B `__streetKit(false|true)` (invalide le sol cuit).
- `iso/isoStreet.js` — `streetLampArt(band)` (seule porte d'entrée de l'art du mât :
  peintre, lumière, reflets), `lampBox(art, unit)` (taille d'écran : kit au grain,
  PNG à `LAMP_TUNE.h`), `medianPlan(L, seg, T, kit)` (source unique : plantations,
  mâts, bordure), `medianUrbanCells` (ville = `builtNear` d'une des deux voies, par
  tranches d'au moins 3 cases), `drawKitMedians` (bake).
- `iso/isoLiveCollect.js` — plantations poussées en items `'vie'` (l'objet se
  dessine lui-même : ombre solaire, vent du cyprès, découpe des halos).
- `iso/isoLivePaint.js` — la branche `'lamp'` passe par `lampBox`, pose au pixel
  d'appareil.

Gazon : la texture `median-lawn` ramenée au ton du kit par un `multiply` (ton moyen
de la texture mesuré 121,148,82 ; pré de la ville ≈ 65,102,50 ; cible Marbre
74,112,56), décalé par la saison comme l'herbe.

## 5. Journal

**2026-10-02/03 — pilote Marbre.** Kit `MARBRE` : colonnette de marbre et vasque de
bronze (21 px de canvas, flamme peinte + lueur `fire`), cyprès (25 px, vent),
vasque fleurie (robe par hash ; buis enneigé l'hiver). Suite du terre-plein :
cyprès, mât, cyprès, vasque, au pas de 0,625 case, centrée. Tests
`__tests__/streetKits.test.js` (toise, pose au pied, pixels francs, ville ≥ 3 cases,
voie retombée en herbe, suite centrée) ; la garde « 3 cases » vue tomber à
`MEDIAN_TOWN_MIN = 1`.
- « Ville » = règle du TROTTOIR : voie au sol urbain (`courOf` ≠ herbe/friche) ET
  façade voisine (`builtNear`). `builtNear` seul plantait des cyprès en forêt au
  bord d'une caravane et de son tas de bois (`L.urbanSet` ne tranche pas : il
  contient aussi la route en forêt).
- Fanions des places : noués à la lèvre de la vasque du mât de kit (`tieY`, art du
  kit), flèche bornée à 0,25 × la hauteur d'attache ; ils flottaient à
  `GARLAND.hT` = 1,25 tuile, au-dessus de tout mât.
- Coût mesuré (pane, 25 images, zoom 1 sur le boulevard) : 8,4-9,6 ms avec le kit,
  8,2-9,7 ms sans — dans le bruit.
- Vérifié : jour/nuit (halos et reflets des quais sur la tête dessinée), hiver,
  forêt, place du marché. Planche v2 (Artifact `KkciJMvPUo68LVfnLvkhke`).
⚠ Banc : une page fraîchement rechargée montre des scènes moteur en boîtes grises
pendant plusieurs minutes (pane masquée) — attendre, ce n'est pas le kit. Juste
après `__streetKit(false)`, les PNG d'avant ne sont pas encore décodés (mâts
absents) : chauffer quelques images avant la capture.

**2026-10-03 — verdict de Raph sur le pilote, puis les sept autres ères.**
« Le reste top, tu peux tout faire le reste », avec une correction : « ce sont des
mâts avec une flamme au bout, accrocher les fils dessus n'est pas logique, les
fanions devraient s'accrocher d'étal en étal ».
- FANIONS (isoPlaza.js) : au MARCHÉ, d'étal en étal, noués au haut des auvents
  (`GARLAND.stallTie` 0,85 de la hauteur de l'étal), en anneau autour du puits (étals
  triés par angle). Ailleurs (forum), de mât de coin en mât de coin marqués
  `onLamps`, et SAUTÉS si le mât de l'ère brûle (`tieY` null : Pierre, Marbre).
  Flèche bornée à 0,3 × la hauteur d'attache.
- RÉVERBÈRES, un par ère, palette du kit de pont de la même bande
  (`bridgeKitForBand`) : Pierre = panier à feu sur poteau de pierre brute ;
  Couronne = lanterne pendue à une potence de bois ; Marbre = colonnette et vasque
  de bronze ; Fonte = candélabre à deux lanternes, bague dorée ; Néon = mât d'acier,
  deux bras, têtes LED ; Noosphère / Stellaire / Démiurge = lame sombre à filet de
  lumière et lentille, dans la couleur de l'ère. 19 à 22 px.
- TERRE-PLEINS : Pierre = herbe, buissons sauvages et bornes, pas de bordure ;
  Couronne = tilleuls et bornes, bordure de pierre ; Fonte = SABLE STABILISÉ piqué
  au pixel, platanes à grille de fonte (cuite au sol), colonnes Morris, bordure de
  granit ; Néon = pelouse à bandes de tonte, jeunes arbres, bacs de béton, bordure
  béton ; cosmiques = fougères lumineuses et cristaux, liseré lumineux de l'ère.
  Feuillus aux QUATRE SAISONS (fleurs au printemps, roux à l'automne, branches nues
  et neige l'hiver).
- PONT : les `gaslamp` (Fonte) et `ledlamp` (Néon) des kits de pont posent le mât du
  kit au grain (isoProps.js, `drawKitLampProp`) ; les PNG restent le repli.
- BUISSONS DE L'ÎLE : buisson sauvage dessiné par le code (tailles 1 à 3), ombre
  solaire, vent (`wildShrubActor`) ; l'ancien buisson Cainos + ellipse reste
  derrière `__streetKit(false)`.
- Tests : `streetKits.test.js` couvre les huit ères (toise 16-23 px, pied posé en
  toute saison, pixels francs, pas de fil sur un mât qui brûle).
⚠ Banc : le serveur `vite-rue` est tombé une fois sur EBUSY en surveillant
`.preview-shots/` (fichiers d'une autre session) → `server.watch.ignored`.
⚠ Rangs cosmiques : sur une ville de démo, les tours cachent presque tous les
terre-pleins ; choisir un segment sans bâti devant lui (x+2..x+4 / y+2..y+4).
