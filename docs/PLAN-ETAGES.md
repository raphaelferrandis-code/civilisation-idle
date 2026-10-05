# Plan — Les étages de la ville

> Fait foi pour le chantier « relief » rouvert le 2026-10-01. Planche de proposition
> validée par Raph : https://claude.ai/artifact/96r6NSAc8ciSSR9NsVxxdk
> (« je suis d'accord avec tout », 2026-10-02 ; « tout est validé, mets tout en place,
> un lot à la fois »).

## 1. La thèse

Dans ce moteur, le relief qui lit bien n'est pas **sous** la ville, il est **au-dessus**.
Le terrain par case (`isoTerrain.js`, `TERRAIN.amp`) a été re-testé le 2026-10-01 sur
les bandes 0, 1 et 4 (réglages validés du 24/08, puis `cityK 0`, puis hors ville
seulement) : murs bruns, piliers sous les places, taches grises en tissu dense ; hors
de la ville il ne se voit plus et son ombrage salit l'eau. **Le moteur n'a aucun art
pour les pentes.** On ne rallume pas le terrain sous les maisons.

À la place, **chaque ère ajoute un étage** — une structure posée sur des piles ou un
trafic en l'air, peu de lignes, nettes, triées par le peintre comme un bâtiment :

| Bande | Étage | Lot |
|---|---|---|
| B0–B4 | rien de neuf (le sol, le fleuve ; pont, places, merveilles existants) | — |
| B5 | métro aérien sur viaduc de fer, le long du quai | 3 |
| B6 | autoroute surélevée au-dessus de l'artère du pont, échangeur | 2 |
| B7 | monorail (jade), premiers taxis volants à basse altitude | 1 (taxis), 3 (monorail) |
| B8 | deux couloirs aériens, jetpacks | 1 |
| B9 | ciel à trois étages ; quartier flottant au-dessus du fleuve | 1, 4 |
| chute | les étages tombent en premier | 4 |

## 2. Décisions de Raph (2026-10-02)

1. Direction validée ; le terrain sous les maisons est abandonné.
2. On commence par le ciel.
3. **Ombre au sol** sous les véhicules volants : oui.
4. Le plan de ville peut **réserver du terrain** aux viaducs et à l'échangeur.
5. Téléphérique : accepté dans le principe (« d'accord avec tout ») — en dernier.

**Superposition métro / autoroute** (question de Raph) : dans les maquettes les deux
prenaient le boulevard du quai. Règle : **le métro longe le quai de la rive OPPOSÉE au
cœur** (il ne cache jamais la place centrale) ; **l'autoroute suit l'artère du pont**,
perpendiculaire au fleuve, au sol près du cœur puis surélevée en s'éloignant du
centre. Ils ne se croisent qu'en tête de pont, à des hauteurs différentes.

Règle tirée de la maquette B6 : **une structure haute ne passe jamais devant la place
centrale** (la fontaine était intacte, mais cachée derrière le viaduc).

## 3. Architecture

- `iso/isoElevated.js` — le point d'entrée unique : rassemble les acteurs de tous les
  étages (`elevatedActors(now)`). Branché à UN endroit de la collecte
  (`isoLiveCollect.js`, kind `'elev'`) et UN endroit de la peinture
  (`isoLivePaint.js`, l'acteur se dessine lui-même). Même contrat que la petite vie :
  `{ wx, wy, d?, draw(ctx, now) }`, trié à son aplomb au sol.
- La hauteur passe par le 3ᵉ axe : `worldToScreen(wx, wy, wz)`.
- La lumière de nuit passe par `lightCtx` (`lightLayer.js`) : déposée pendant la passe
  vivante, posée après le voile, découpée par ce qui est devant.
- Tout ce qui se répète (véhicules, ombres, traînées) est **cuit** en petites images
  par (bande, sorte, axe, sens, zoom) : un blit par objet et par frame.

## 4. Lots

### Lot 1 — Le ciel (B7–B9) · `iso/isoSkyTraffic.js`
Couloirs fixes **au-dessus des grandes rues droites** (jamais au travers d'une tour :
une voiture dont le pied tombe dans une emprise sauterait d'avant en arrière du
bâtiment). Axes x et y à des **hauteurs différentes** (pas de croisement à niveau).
B7 : peu de taxis bas ; B8 : deux hauteurs + jetpacks ; B9 : trois hauteurs, plus
dense. Pur `f(now)`, aucun état. Ombre au sol décalée vers le soleil. Nuit : phares,
feux, traînée courte, balises de couloir. Densité × santé de la cité (`CM.healthF`).
Molette `__skyTraffic({ on, density, shadow, trails, beacons, jets })`.

### Lot 2 — L'autoroute (B6+) · `procedural/highwayPlan.js` + `iso/isoHighway.js`
**Plan (pur, au layout)** : le tablier couvre l'artère du pont (colonnes `ax`, `ax+1`),
sur chaque rive : au sol près de l'eau (`farStart` 6 cases — le futur métro du quai) et
au-delà de la place centrale (`coreGap` 3 cases après elle), rampe de 8 cases (5 au
plus court), tablier plein à 1,75 tuile, redescente avant la **lisière** (première
rangée sans bâtiment tenu de part et d'autre de l'artère, à 5 rangées près). Il ne prend
aucun terrain. **L'échangeur** (deux boucles de 270°, « trèfle partiel ») se pose sur la
rive au plus long tablier, à une rue transversale qui arrive des deux côtés de l'artère
(à 4 cases au plus : la rue est prolongée jusqu'à elle). Ses deux pelouses (4×4) entrent
dans la réserve de la ville (herbe, jamais bâties) ; les bâtiments qui y tenaient leur
place sont relogés une fois. Choix **figé** dans `s.cityCore.highway` (`sign`, `dy` en
repère du centre). Publié : `L.highway`.
**Dessin** : tronçons d'une demi-cellule, deux acteurs chacun (dessus trié au coin
arrière, tranche au coin avant), piles en T sur le terre-plein (triées SOUS le dessus),
lampadaires sur l'axe, ombre au sol ; matière par ère (béton B6, jade B7, nacre et or
B8, cristal B9 — rives allumées la nuit aux ères cosmiques). Circulation : vraies
voitures de l'ère (`drawIsoVehicle` + `vehSkinFor`) soulevées à la hauteur du tablier.
Molette `__highway({ on, cars, lamps, shadow })`.
⚠ Les voitures de la grille continuent de rouler AU SOL sur l'artère, sous le tablier :
c'est voulu (l'avenue reste en dessous), mais elles y passent dans l'ombre.
### Lot 3 — Métro (B5) et monorail (B7) · `procedural/metroPlan.js` + `iso/isoMetro.js`
**Une seule ligne, deux époques** : le monorail n'est PAS sur l'artère (l'autoroute
l'occupe dès la bande 6) — c'est la ligne du métro qui se modernise. Tracé dérivé du
layout à chaque calcul (rien de stocké ni de réservé) : au-dessus de la **promenade du
quai** (la berge, jamais bâtie) de la rive **opposée au cœur**, colonne par colonne,
lissé (moyenne glissante ±3), décalé d'un tiers de tuile vers les terres pour ne pas
cacher le mur de quai, sur la plus longue suite de colonnes où la ville borde ce quai ;
rampe de 6 cases à chaque bout, station toutes les 18 cases. Il franchit l'artère en
tête de pont, là où l'autoroute est encore au sol : **jamais de superposition**.
B5 vert et crème, B6 bleu et blanc : viaduc de fer à poutres-treillis sur piles de
pierre, deux voies, marquises de verre. B7-B9 : deux poutres fines sur piles en Y,
rames profilées et stations-capsules dans la matière de l'ère. Molette `__metro`.
**Repris le 2026-10-04** (cf. journal) : B5 treillis vert sur colonnes de fonte jumelles,
B6 poutre-caisson de béton sur piles en marteau, B7-9 inchangé en structure ; rames du
peintre des bateaux (`iso/metroCars.js`) ; gares à quais et auvents ; rames qui
s'arrêtent en gare ; bouts en TRÉMIE ENTERRÉE (plus de talus).
⚠ Le tram de l'enceinte (agents.js `drawTram`, juin) n'est pas dessiné en iso : rien à
concilier.
### Lot 4 — Quartier flottant (B9) et chute des étages · `iso/isoFloatIsle.js`
**Le quartier flottant** : un îlot de cristal au-dessus du fleuve (bande 9), à 16-30
cases du pont, côté tiré par la graine, loin des Plaisirs et du Vieux-Port, là où l'eau
fait au moins 6 cases. Six tours, un jardin et sa serre, une flèche de cristal ; dessous,
une roche violette en pointe à veines claires, des cristaux pendus ; son ombre sur l'eau ;
trois navettes en orbite ; la nuit, lueur sous la roche et sommet de la flèche allumé. Une
image cuite par (zoom, dpr). Les couloirs aériens du fleuve s'en écartent. Molette
`__floatIsle`.
⚠ En iso, une chute verticale se cache derrière le DESSUS tant qu'elle ne dépasse pas la
demi-hauteur écran de l'emprise : le premier îlot (dessous de 2,6 tuiles pour R 2,7) se
lisait comme une dalle posée sur l'eau. Dessous de 3,7 tuiles pour R 2,3, à 5,6 tuiles.
**La chute des étages** (`elevDecay` dans isoElevated) : 0 debout, 0,65 quand la ville est
en ruine (`CM.frameRuined` : usure > 0,88 ou instabilité au max), 1 pendant
l'effondrement (`CM.collapseAt`). Le ciel se vide (densité × (1 − decay), plus de
jetpacks ni de balises), l'autoroute et le métro perdent des travées entières (par
grappes de 3 tronçons, gravats au sol sous l'autoroute), plus de circulation ni de rames,
lumières éteintes ; l'îlot descend vers l'eau.

### Lot 5 — Le téléphérique (B5+) · `iso/isoCableCar.js`
Réponse « d'accord avec tout » à la question du téléphérique : fait, et compatible avec
« un seul pont » (un câble, pas un ouvrage). Il part de la promenade du quai côté CŒUR et
arrive sur le TOIT d'une station du métro (correspondance) : aucun terrain pris. Du côté
du pont opposé à l'îlot (`isleSideOf`), à 10-30 cases du pont, loin du Vieux-Port et des
Plaisirs. Câble en parabole (3,6 tuiles aux pylônes, creux de 0,55), toujours au-dessus du
métro. B5-B6 pylônes de fer en treillis et cabines rouges ; B7-B9 mâts fins et capsules de
l'ère. La chute coupe le câble et retire les cabines. Molette `__cableCar`.

### Performance (mesurée en rendu logiciel, Chrome headless)
Poste « vif-peinture » du profileur de frame (`globalThis.__isoFrameProfile = true`) :
**+2-3 ms à la bande 6, +4-6 ms à la bande 9**, tous étages allumés, jour comme nuit. Les
autres postes (fleuve, nuit) varient de ±15 ms d'une passe à l'autre sans lien avec les
étages : ne juger que la peinture, sur plusieurs passes.
⚠⚠ Trois pièges qui ont faussé ou plombé la mesure :
1. **Cache d'images trop petit vidé d'un coup** : chaque tronçon de rampe ou de courbe est
   unique (~400 par zoom pour l'autoroute, ~300 pour le métro) → recuisson de TOUT à
   chaque frame. `makeBakeCache` retire désormais la moitié la plus ancienne (LRU).
2. **Une molette qui vide les images cuites à chaque appel** (`__floatIsle`, `__cableCar`) :
   une mesure on/off en alternance mesurait la recuisson, pas le dessin.
3. **Les phares du jeu** (`drawVehicleHeadlights` : arcs + dégradé radial par voiture) sur
   60 voitures de tablier : coupés (`parkT`), remplacés par deux lueurs au pixel. Les
   voitures soulevées passent aussi en `muteSunShadow` : sous la translation, le crochet du
   reflet les lisait à une fausse hauteur.

## 5. Journal

- 2026-10-02 — plan écrit, lot 1 ouvert.
- 2026-10-02 — lot 1 commité en local (`030ae68`). Coût mesuré en rendu logiciel (B9,
  240 véhicules) : ~0 de jour, +4 ms de nuit. Pièges : la boîte monde d'un écran iso est
  un losange deux fois trop grand (trier les candidats À L'ÉCRAN avant le plafond) ; les
  plus longues lignes droites sont les routes de CAMPAGNE (filtrer par `urbanSet`).
- 2026-10-02 — lot 2. Pièges : un chevêtre trié à l'aplomb de l'axe se peignait SUR la
  chaussée (le trier sous le dessus) ; `organicLimit` couvre toute la grille, la lisière
  se lit aux bâtiments tenus ; les maisons bordent l'artère, les rues transversales
  s'arrêtent 1-2 cases avant elle (les prolonger au lieu d'exiger qu'elles la touchent).
  Commit `44fd2f2`.
- 2026-10-02 — lot 3. Premier jet trop large (tablier de 1,05 tuile sur la berge :
  une dalle grise qui cachait le mur de quai) → 0,8 tuile recentrée vers les terres,
  treillis plus haut et plus contrasté ; marquises d'abord « flottantes » (poteaux
  d'un pixel invisibles) → poteaux en boîtes et toit à deux pans. Les aides de ruban
  (`segGeo`, `vquad`, `elevGlow`…) ont rejoint `elevPaint.js`, partagées avec
  l'autoroute. Commit `bc07327`.
- 2026-10-02 — lot 4 (îlot, chute). Vérifié en jeu : îlot de jour et de nuit, ville en
  ruine aux bandes 6 et 9 (`state.timeWear = 0.95`). Commit `e15b5ce`.
- 2026-10-02 — lot 5 (téléphérique) + passe de performance (cf. § Performance) ; captures
  cumulées jour et nuit des bandes 5 à 9 regardées : aucun étage ne se superpose.
  Commit `42e2f29`.
- 2026-10-02 soir — **retours de Raph en jeu (5 défauts), tous corrigés** :
  1. « Des bâtiments passent dans l'autoroute » : les maisons bordaient l'artère et
     se collaient au tablier, et les tronçons étaient triés au coin ARRIÈRE (une tour
     voisine se trie à son coin sud, plus loin) → **clé du peintre au coin AVANT** de
     chaque tronçon (comme un bâtiment), et **dégagement** : une case de pelouse de
     chaque côté de l'artère sous le tablier en l'air (`vergeCells`, réserve de la
     ville). Mesuré : 41 maisons relogées UNE fois à l'arrivée de l'autoroute (bande 6),
     plus rien ensuite — seuil du test de mémoire des rues porté de 80 à 130 avec ce
     relevé (la percée du boulevard en déloge 54 à la bande 5).
  2. « La barrière de l'autoroute coupe le bras d'insertion » → la glissière du tablier
     s'ouvre là où une boucle le longe ; la boucle n'a ni glissière ni tranche tant
     qu'elle est sur le tablier (`skipL`/`skipR` par tronçon).
  3. Voitures volantes qui « disparaissent à la fin d'une route » → une **porte de
     couloir** (anneau sur mât, deux moitiés triées de part et d'autre) à chaque bout ;
     le fondu ne dure plus que 0,35 tuile, DANS l'anneau. Le plafond au nombre est
     retiré (il faisait apparaître/disparaître des voitures quand d'autres entraient
     dans le champ) : la densité se règle par couloir, un tri stable par voiture allège
     au dézoom et la nuit.
  4. Voitures volantes mal triées contre les bâtiments → **clé « de rue »** : au-dessus
     d'une rue de la rangée r, tout le nord est derrière, tout le sud devant (coin sud
     de la case de rue survolée + 0,999). Même clé pour les jetpacks, qui ont aussi un
     fondu au décollage et à l'atterrissage.
  5. Le train « passe pas bien dans la gare, clignote » et « disparaît dans le vide » →
     la gare se trie après tous les tronçons qu'elle couvre (plus d'aller-retour
     devant/derrière la rame) ; **trémies de tunnel** aux deux bouts (talus d'herbe et
     tête maçonnée, `PORTAL`), la rame est COUPÉE NET au plan de la bouche. La ligne
     est recentrée dans la case du quai (`LINE_SHIFT` 0,06 au lieu de 0,32) : décalée,
     elle mordait la rangée d'immeubles et la rame se peignait par-dessus.
  Vérifié par séquences d'images déterministes (`captureFrame({ now })`) : passage en
  gare, sortie des deux tunnels (bandes 5 et 7), couloirs aériens (bande 9).
- 2026-10-04 — **reprise du métro** (Raph, captures bande 6 : « le tunnel du métro fait
  2 gros carrés verts qui ne vont pas et se posent sur la route. Le design du métro est
  très cheap »). Mesuré avant : trémie = boîte d'herbe de 1,3 × 0,9 × 0,8 tuile posée SUR
  la promenade (et sur la route d'accès du pont quand la ligne finissait en tête de pont) ;
  rames = boîtes alignées sur l'axe dominant (en escalier dans les courbes) ; piles =
  blocs ; gare = plaque de verre sur quatre poteaux d'un pixel.
  1. **Bouts : trémie enterrée** (`metroPlan.js`). Le profil descend SOUS le sol
     (`METRO.pit` 0,62 tuile à la bouche, `metroZ`/`metroUAt`), rampe de 7 cellules ;
     les `ground` (5) cellules de chaque bout — tranchée puis rampe maçonnée — sont tirées
     DROITES au milieu de la cellule de berge du bout et exigent du terrain LIBRE (ni rue,
     ni bâtiment, ni eau, ni tête de pont, ni port, ni Plaisirs) : la ligne raccourcit
     jusqu'à en trouver (vérifié sur 18 graines : aucune ligne perdue). Au rendu
     (`isoMetro.js`) : mur du fond sombre à assises (un CREUX — une face claire se lisait
     comme un mur posé), bande d'ombre au pied, bouche en arc à claveaux et clé de voûte
     (bout ouest, la seule qui regarde la caméra), parapets, culée au raccord du viaduc.
  2. **Ce qui cache une rame n'est plus trié mais EFFACÉ** : la voiture est peinte dans
     une toile de travail, et l'on efface tout ce qui est sous la ligne du parapet (ou du
     mur de la trémie) côté caméra, rangée d'art par rangée d'art. Exact quel que soit
     l'ordre du peintre. Dans la tranchée, sa clé est juste après le FOND des tronçons
     couverts (la clé « en l'air » la faisait passer sur le toit de la maison voisine).
  3. **Rames** (`metroCars.js`) : le peintre des bateaux (volumes, lumière quantifiée,
     contour d'encre), cap libre (32), penchées sur la rampe, coupées net au plan de la
     bouche (tranche fermée de noir). B5 Sprague verte, voiture du milieu rouge ; B6
     blanche à bandeau vitré et portes bleues ; B7-9 nacre profilée à liseré d'ère ; baies
     allumées la nuit, phares et feux rouges. Cuisson ~7 ms, budget 4 par frame.
  4. **Horaire** : accélération, arrêt de 4,5 s au milieu de chaque gare, départ
     (`timetable`), sortie et entrée de tunnel lancées.
  5. **Viaduc** : traverses et rails, treillis Warren riveté (B5), poutre-caisson (B6) ;
     piles : colonnes de fonte jumelles sur socle de pierre (B5), marteau de béton (B6),
     Y (B7-9), jamais sur une rue ni dans une gare. **Gares** sur 3 tronçons (4 au
     monorail) : deux quais, deux auvents (verrière à chevrons et lambrequin B5, tôle à
     nervures et bandeau bleu B6), la voie à ciel ouvert — on voit la rame à l'arrêt. Le
     téléphérique se pose sur l'auvent côté fleuve (`STATION`).
  6. **Rien ne se pose dans une trémie** : réverbères du quai (`quayLampList`), petite vie
     (`registerVieMask` dans isoVie), et les flâneurs du quai font demi-tour au parapet
     (`metroCutSpans`).
  ⚠ `sidePt` prend des TUILES (premier essai : la largeur écrasée sur l'axe, tranchée
  et quais invisibles). ⚠ Vérif d'une autre bande sur une même ville :
  `CM.layout.counts.eraBand = n; __metro({ replan: true })`.
