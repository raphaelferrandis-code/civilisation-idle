# PLAN — Le terroir : champs et moulins

Demande de Raph (2026-10-03, capture à l'appui) : « il faut revoir les champs et les
moulins, leur rendu n'est pas bon. Que me proposes-tu ? » → proposition « le terroir »
acceptée telle quelle : **placement ET dessin**, et **tous les moulins gardés, mais en
rangées** (un achat = un moulin visible).

## 1. Constats (mesurés, ville de démo bande 2, ère 12, 40 achats de chaque)

**Champs** (`iso/isoField.js`, `layout.js` branche `irrigated_fields`)
- Un seul bloc 10×6 quadrillé en parcelles égales de 2 cases : un tapis posé.
- Tracé en formes vectorielles à la résolution de l'écran, alors que tout le reste est en
  pixels d'art (ponts, merveilles, bateaux cuits par le code ; bâtiments ; arbres).
- Liseré clair/sombre par parcelle → dalles en relief, effet carrelage.
- Posé sur un carré de SOL DE VILLE gris : `urbanSet` reçoit l'emprise de chaque tuile
  + 1 case de pourtour (« un bâtiment se tient toujours sur du sol de ville »).
- Aucune vie (le paysan de l'ancienne scène n'a pas suivi en iso).

**Moulins** (`cityEngineSprites.js` bloc `water_mills`, régime commun halle + ateliers)
- 23 moulins au nord-ouest de la ville, le champ au sud-est : le plus loin possible.
- Placés en couronne de zone « outer » (`angleTarget`), écartés de 5 cases
  (`ENGINE_SPREAD`), au milieu des maisons.
- Ailes = image de croix VUE DE FACE tournée dans le plan de l'écran (`blitPropRot`) :
  hors perspective, et la rotation d'une image pixel à un angle quelconque casse ses
  pixels.
- Halle (`mill-house-stone-grand`) deux fois plus grosse que les ateliers.
- Horloges d'ère différentes : champs 10/20/30, moulins 10/25/30.

## 2. Ce qu'on fait

**T1 — Placement (`layout.js`)**
- Champs : un TERROIR de K parcelles (1 à 4 selon l'aire achetée — même aire totale
  qu'avant, `cmFieldSpan`), rectangles de formes variées (lanières), jointifs, posés sur
  l'anneau agricole autour de la ville. Une tuile par parcelle (`parcel`, `terroir`), un
  seul groupe moteur (la signature `cmEngineGroupSig` ne bouge pas).
- Moulins : en RANGÉE sur le pourtour du terroir (une case sur deux), en partant du point
  le plus proche de la ville (la halle y prend place), le long du bord. Zone de slot
  `terroir` (les anciens slots « outer » sont écartés une fois). Repli : placement
  générique si pas de terroir ou plus de place.
- Sol : les tuiles du terroir (champs + moulins de rangée) sont RURALES — pas de sol de
  ville sous elles ni autour.

**T2 — Champs dessinés au pixel par le code (`iso/fieldBake.js`)**
- Parcelles en lanières de largeurs inégales, sillons d'un pixel, blé tramé, jachère en
  mottes, prairie ; meules/gerbes sur le mûr.
- Séparations par ère : haie vive (bois → médiéval), muret de pierre, clôture, cercles
  d'irrigation (moderne).
- Cuisson en cache par parcelle × bande × saison, pose à la grille.

**T3 — Moulins dessinés au pixel par le code (`iso/millBake.js`)**
- Ailes dans un plan vertical tourné vers le vent, en perspective, cuites pose par pose
  (12 poses sur un quart de tour) : pixels nets.
- Silhouette par ère : pivot en bois → tour de pierre à toit conique → moulin à balcon →
  minoterie / éolienne ; cosmique gardé.
- Une seule toise (porte = un habitant) ; la halle = moulin + grange + cour.
- Terre tassée au pied, sacs.

**T4 — Vie** : laboureur et bœuf, moissonneurs (après validation du pilote).

## 3. Pilote, puis déroulé
Pilote **bande 2 (médiéval)** = l'ère de la capture de Raph. Planche avant/après dans
`.preview-shots/terroir/`, verdict de Raph, puis les autres bandes.

## 4. Journal
- 2026-10-03 : constats, plan, serveur de capture `vite-terroir` (61970, sans HMR).
- 2026-10-03 : **pilote bande 2 fait**, planche `.preview-shots/terroir/planche-pilote-b2.png`
  (avant / après vue / après près / printemps, automne, hiver, nuit).
- 2026-10-03 : verdict de Raph — « ça fait beaucoup effectivement, limite à 15 ; sinon go
  pour toutes les ères ». Fait : `CM_MILL_CAP = 15` (halle + 14), les 10 bandes (moulins,
  halles, sols, champs, clôtures, récoltes), le laboureur, la neige sur les toits.
  Planches `.preview-shots/terroir/planche-eres.png` et `planche-details.png`. Rien commité.

## 5. Comment c'est construit (notice)
- **Placement** (`layout.js`) : `cmTerroirParcels(level, seed)` découpe l'aire de
  `cmFieldSpan` en 1-4 lanières (côté court 2-3, long ≥ court + 2). Branche
  `irrigated_fields` de `placeRequest` : parcelle 0 sur l'anneau agricole (comme l'ancien
  bloc), suivantes collées (≥ 2 cases de côté commun) ; une tuile par parcelle (`parcel`,
  `rural`) ; slot `{ dx, dy, parcels: [[dx,dy,w,h]…] }`, tenu par `hold()` parcelle par
  parcelle. `terroirRows()` : rangées de moulins à distance de Chebyshev 1, 3, 5 du
  terroir, une case sur deux, côté campagne d'abord (face ville en dernier), ordonnées
  depuis le milieu du bord extérieur. Branche `water_mills` : halle (nº 0) contre le
  terroir au plus près du cœur, ateliers dans les rangées ; slot zone `terroir` ; repli
  générique. Sol : `rural` → pas de sol de ville sous la tuile ; parcelles + 2 cases
  sorties de `urbanSet` (sauf rues et bâti de ville).
- **Nombre de moulins** : `CM_MILL_CAP = 15` dans `cmEngineInstances` (garde dans
  engineDensity.test.js). Les autres moteurs gardent le plafond commun (48).
- **Champs** (`iso/fieldBake.js`, posés par `drawIsoFieldPixel` dans `iso/isoField.js`) :
  un STYLE par âge (`STYLES`, `fieldStyleKey(band)`) — natures des lanières, clôture,
  récolte : 0-1 plessis + gerbes ; 2 haies + meules ; 3 bocage (arbres de haie) ; 4 muret
  de pierre sèche (pierre du kit), vigne et oliviers ; 5 clôture à lisses, betteraves,
  bottes ; 6 cercles d'arrosage à pivot (rangs concentriques, rampe) sur terre nue ; 7-9
  rangs de plantes de lumière (couleur de l'ère, calque de nuit) et piquets de cristal.
  Assolement par saison (`SEASON_CROP`), une clôture par limite (nord/ouest toujours,
  sud/est face à la campagne). Cache par parcelle × bande × saison × clôtures. L'ancien
  patchwork vectoriel `drawIsoField` = l'« avant » de `__fieldTune({ on: false })` ;
  `__fieldTune({ band })` force un âge.
- **Moulins** (`iso/millBake.js`, posés par `drawIsoMill` dans `iso/isoMill.js`) : un
  modèle par âge (`MODELS`, `millKind(band)`) — pivot en bois sur chevalet (0-1), tour de
  pierre (2), tour chaulée à calotte d'ardoise (3), hollandais à balcon et fût de roseau
  (4), brique à galerie de fer, bulbe et éventail, ailes à volets (5), éolienne à trois
  pales et feu rouge (6), pylône de cristal à pales de lumière (7-9). Ailes dans le plan
  vertical de normale `MILL_WIND`, `MILL_FRAMES` = 12 poses par période de symétrie
  (quart de tour, ou tiers pour trois pales) ; phase et cadence (±8 %) par instance.
  Halle : tour + bâtiment au nord-est (grange 0-3, pierre 4, minoterie de brique à
  cheminée 5, silos 6, silos de cristal 7-9) + cour. Sol : terre, mâchefer, gravier,
  dalle sombre. Neige sur les toits l'hiver (`snowy`). ⚠ Galerie/balcon : peindre le fût
  SOUS, le plancher, puis le fût AU-DESSUS (sinon le plancher se peint devant le fût).
  L'ancienne scène de cityEngineSprites n'est plus que l'« avant » de
  `__millTune({ on: false })`.
- **Vie** (`iso/terroirLife.js`) : un attelage par parcelle paire (deux au plus), bœuf
  (0-4) ou cheval (5), charrue et laboureur de l'ère (`drawDraftIso`, `drawNamedAgentIso`,
  comme le halage des péniches) ; rien au néon, aux âges cosmiques ni l'hiver. Item
  `terroirTeam` du peintre. Molette `__terroirLife({ on, speed })`.
- ⚠ Banc : remettre `__state.cityMapSlots = {}` avant `__demoCity` pour voir le placement
  neuf (sinon les slots de la passe d'avant gardent les anciennes positions).
