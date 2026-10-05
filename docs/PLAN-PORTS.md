# Plan — Les ports : un vieux port qui devient plaisance, un port de commerce en périphérie

Ouvert le 2026-10-01 (session « Amélioration du port et de la plage »). Ce document fait foi.

## 1. La demande de Raph (2026-10-01)

Après la plage en bande et l'appontement au pixel (commit `a85c2fa`, validé : « c'est bien,
et la grue aussi ») :

> « le bâtiment du port ne va plus, il faut tous les refaire, à vérifier avec la session qui
> refait des bâtiments. Aussi, il faut qu'aux ères plus avancées le port devienne un
> véritable port commercial, tel que le port du Havre. Et d'ailleurs qu'on fasse 2 ports si
> possible, un commercial en périphérie de la ville, et un plaisancier type port de
> Marseille. »

Choix tranchés par Raph le même soir :
- **Le port se dédouble au XIXe (bande 5)**, comme Marseille : les docks (la Joliette)
  naissent en périphérie, le vieux port garde pêcheurs et voiliers ; en bande 6+, les docks
  deviennent un terminal à conteneurs (Le Havre) et le vieux port une marina.
- **Le port de plaisance est un VRAI BASSIN CREUSÉ** (Vieux-Port) : la berge recule en un
  bassin rectangulaire bordé de quais sur trois côtés, entrée gardée par deux forts — et
  non une marina posée sur le fleuve derrière une digue.

## 2. Ce qui existe (avant ce plan)

- UN port (`river_ports`) : tuile moteur unique posée sur la rive nord au plus près du cœur
  (layout.js, branche « Port fluvial »), emprise 2 à 5 × 3 à 5 qui mord l'eau.
- Rendu iso : `iso/isoPort.drawIsoRiverside` = maison du port (sprite par stade) +
  appontement au pixel `iso/isoPier.js` (tête en T, grue, ombre, reflet) ; bateau de l'ère
  amarré à la tête (`portMooring` → item `portBoat`). Plage en bande (`isoBeachCells`).
- Sprites : `port-prop-house` (stade 0), `port-house-medieval` (1), `port-house-classical`
  (bande 4), `port-house-industrial` (2), `port-house-modern` (3), `port-cosmic-7/8/9`,
  + variantes `-grand`.

## 3. La chronologie visée

| Bandes | Vieux port (centre)                                   | Port de commerce (périphérie)                         |
|--------|-------------------------------------------------------|-------------------------------------------------------|
| 0-1    | grève, ponton de rondins, cabane de pêcheurs          | —                                                     |
| 2-3    | grève, appontement de planches + grue, maison du port | —                                                     |
| 4      | grève, jetée de pierre, horreum / statio              | —                                                     |
| 5      | BASSIN creusé, quais de pierre, deux forts, pêcheurs et voiliers à quai, capitainerie | DOCKS : quai de pierre, entrepôts de brique, grues à vapeur, cargos à vapeur |
| 6      | MARINA : pontons flottants, rangées de bateaux de plaisance, capitainerie moderne | TERMINAL À CONTENEURS : quai béton, portiques, piles de conteneurs, porte-conteneurs |
| 7-9    | marina en nacre de l'ère                              | terminal de l'ère (nacre, liseré lumineux)            |

La taille du port de commerce suit le nombre de « Ports » achetés (portiques, piles, postes
à quai).

## 4. Les lots

- **P1 — Les bâtiments du port, par ère** (sprites PixelLab, recette de la passe « tous les
  bâtiments », cf. §6). D'abord ceux d'avant le dédoublement (bandes 0-4), posés sur la
  grève au départ du ponton ; puis la capitainerie du vieux port (5, 6, 7-9) et les
  bâtiments des docks / du terminal (5, 6, 7-9).
- **P2 — Le port de commerce en périphérie** : un site réservé et FIGÉ à sa fondation sur
  la berge, en aval, au bord de la ville du moment (même logique que les quartiers figés de
  cityQuarters) ; quai droit, structures au lancer de rayon (portiques, piles de conteneurs,
  grues à vapeur, entrepôts), navires amarrés. ⚠ layout.js : à faire avec la session des
  routes (cœur et sites figés).
- **P3 — Le bassin du vieux port** : l'eau entre dans la ville (même surface animée que le
  fleuve), quais sur trois côtés (style isoQuay), deux forts à l'entrée, pontons et bateaux.
  ⚠ isoRiver.js : la surface d'eau du bassin s'ajoute à celle du ruban — à faire avec la
  session du fleuve. ⚠ layout : les cellules du bassin deviennent de l'eau (pas de bâti, pas
  de route).
- **P4 — Les bateaux à quai** (avec la session des bateaux) : cargos et porte-conteneurs
  amarrés au commerce, rangées de plaisance au bassin (sprites rowboat / dinghy / motorboat
  restés sur le disque, + voiliers).

## 5. Coordination (réponses des sessions, 2026-10-01)

- **Bâtiments** (« Contours des cases ») : ne touche à AUCUN sprite port-*, me les laisse.
  Ses modifs non commitées de cityEngineSprites.js sont en haut du fichier (~l.20-40) et dans
  blitProp : ne pas y toucher ; la scène du port (~l.3540) est libre.
- **Bateaux** (« Amélioration des bateaux et designs ») : refait TOUTES les coques par le code
  (pilote bande 4, puis les autres ; bandes 5-6 après). Contrat :
  - je pose mes navires par UNE indirection `drawMooredHull(ctx, { role, heading, x, y, now })`
    (sprites boat-*-{secteur} aujourd'hui) ; bascule sur leur `iso/boatKit.js`
    (`drawBoat(ctx, spec, x, y, heading, s, now)`, `boatFootprint(spec)` → {len, beam} en
    tuiles) dès qu'il existe ; aucun décalage codé sur BOAT_SIZES × sizeMul ailleurs ;
  - port CENTRAL : leur marchand de la flotte viendra accoster au ponton et REMPLACERA le
    bateau-décor de drawIsoPortBoat ; `pierMoorings` reste la source (les prévenir avant de
    toucher isoPier.js) ;
  - j'exporte `portBerths(L)` → [{ id, kind: 'central'|'commerce'|'plaisance', x, y, heading,
    axis, maxLen, decor }] et `portWaterObstacles(L)` au format riverDodge { t, lat, r, id }
    (module `iso/portBerths.js`) ;
  - les prévenir avant de toucher isoFleet.js, riverFleet.js, drawIsoShips / drawIsoPortBoat.
  - ⚠ les hunks non commités `sh._hull` / `wxS` / `wyS` d'isoPort.drawIsoShips sont de la
    session des PONTS : ne jamais les commiter avec les miens.
- **Fleuve** (« Amélioration du fleuve et des vagues ») : attendre son commit (ressac), puis
  ajouter moi-même le crochet du bassin dans une fonction à part. Pièges :
  - WATER_FILL est 'evenodd' (îles = trous) : NE PAS ajouter le bassin au chemin du ruban
    s'il le chevauche ; un second remplissage sous son propre clip, léger recouvrement à
    l'entrée ;
  - drawIsoWaterTiles et le grain bornent leurs colonnes sur le ruban : le bassin demande sa
    propre passe de motif (même fonction, son chemin, ses bornes) ;
  - reflets : le callback de clip de drawIsoReflections doit tracer aussi le bassin ;
  - ⚠ GROS PIÈGE : bande de sable / sable mouillé / écume suivent les runs hors quai
    (quayGapRuns) — l'embouchure du bassin est hors quai et recevrait une grève EN TRAVERS de
    l'entrée → exposer un 3e état du masque (« bassin ») soustrait de ces runs ;
  - le ressac avance le bord jusqu'à 0,48 tuile : dessiner les murs du bassin APRÈS le
    fleuve (comme isoQuay) ;
  - poissons, vie de surface, bateaux, riverDrawPts sont indexés sur les samples : rien
    n'entre dans le bassin sans le leur dire.
- **Routes** (« Système de route cohérent avec les ères », close, tout commité en 017b18a) :
  à moi de le faire, selon ses conventions :
  - figer dans `state.cityCore.ports = { old: {dx,dy,w,h,side}, trade: {dx,dy,w,h} }`, en
    coordonnées RELATIVES AU CENTRE DE GRILLE (cx, cy = floor(N/2)), pas à plan.core ;
  - fonder dans le bloc « LA STRUCTURE DE LA VILLE » de layout.js (townOn), APRÈS heldBy et
    AVANT generateRoadsGraph et l'énumération des cellules ; géométrie pure dans
    cityQuarters.js (comme foundSite / centralSiteFor) ; patron `if (!f) { chercher ; si
    trouvé fix.ports.trade = … }` puis TOUJOURS relire la fiche ;
  - ⚠⚠ normalizeCityCore (core/state.js) reconstruit la fiche champ par champ : y faire passer
    `ports` avec ses bornes + test d'aller-retour (cf. roadMemory.test.js « la fiche de la
    ville survit au rechargement ») ;
  - cellules tenues (heldBy) : le BASSIN déloge la berge → faire comme « LA PERCÉE » du
    boulevard (propriétaires via heldBy.get, `delete store[owner]`, retirer leurs cellules) ;
  - emprise des sites dans `townReserve` ; réserver dès la fondation l'emprise MAX du port de
    commerce ;
  - eau : cases du bassin dans riverSet (anneau dans bankSet) AVANT corridorAt / sites /
    generateRoadsGraph, comme l'évasement de l'île de l'Aiguille ;
  - artère (colonnes arteryAx, arteryAx+1), têtes de pont (bridgeHeadClear), Plaisirs
    (plaisirsClear) : aucun site dessus ;
  - route vers le port de commerce : pousser le site dans `townSites` (rue `secondary`), sinon
    sentier explicite + memKeep (patron « LE SENTIER DU FEU ») ;
  - épingler le slot de river_ports au bassin ;
  - tout tirage par cellule en (gx − cx, gy − cy) ; vérifs roadMemory.test.js et sonde
    ères 0→180 (.preview-shots/routes-probe/).

## 6. Recette des sprites (transmise par la session des bâtiments)

- Génération 8 directions (une génération 1 direction sort FRONTALE), rotation south-west.
- ⚠⚠ Ne JAMAIS réduire la rotation 256 px par moyenne de surface (sprites flous, vu par
  Raph). Passer par `image_to_pixelart` sur l'URL de la rotation, faithful, force 200,
  sortie carrée N = round(256 × min((W−8)/encreW, (H−bas−2)/encreH) × 0,97), bas = 6 (base)
  ou 12 (grande halle) ; la sortie revient OPAQUE sur gris (128,128,129) → lui rendre l'alpha
  de la SOURCE (moyenné à N, seuil 0,5), peler le gris du bord, poser l'encre 1:1 dans le
  cadre. Script : `i2p.cjs` de la session des bâtiments (modes `prep` puis `pose`).
- Cadre = EXACTEMENT la taille du PNG existant (blitProp étire le canevas) ; grande halle
  176×160. Quantification 24 teintes (20 pour les bandes romaines).
- Fond opaque possible (4 coins de la boîte d'encre opaques et de même couleur) : flood +
  poches de la couleur exacte (stripBg / fetchStageScene.stripBackground).
- Bande 6 : vitres allumées la nuit → liste de verre dans sceneWindows.js (GLASS).

## 7. Journal

- 2026-10-01 : plan ouvert ; choix de Raph consignés (§1).
- 2026-10-01/02 (nuit), NON COMMITÉ, verdict de Raph attendu :
  - **P1 (bandes 0-4)** : cabane de pêcheurs sur pilotis (`port-prop-house`), entrepôt
    médiéval à poulie (`port-house-medieval`), horreum à arcades (`port-house-classical`),
    + grandes versions ; largeur de pose par sprite (`PORT_HOUSE_W`, isoPort).
  - **Capitaineries** : XIXe en pierre de taille (`port-house-industrial`), marina moderne
    à vigie (`port-house-modern`) ; bandes 7+ : `port-cosmic-<bande>` (ancien, à refaire).
  - **Sites** (`map/portSites.js`, layout) : bassin 5 × 7 (long, ouvert par son petit
    côté), quai nord de 2 rangées (capitainerie, sa propre tuile `portOffice`) ; terre-plein
    de commerce 14 × 4 en aval, rive nord de préférence, rue de desserte vers le réseau
    stable. Fiche `cityCore.ports` normalisée (state.js) ; masque `dockPlus/dockMinus` dans
    le portail du quai (ni grève ni sable — branché côté fleuve par sa session).
  - **Rendu** : moteur partagé `iso/isoBoxBake.js` (lancer de rayon en grille 2D, ombres
    indexées, calques rognés) ; `iso/isoTradePort.js` (docks / terminal / nacre, deux
    cuissons, navires entre elles) ; `iso/isoOldPort.js` (quais, murs, pontons, bateaux,
    tour et phare) ; eau du bassin par `isoRiver.setRiverExtraWater` ; navires à quai par
    `iso/portBerths.js` (drawMooredHull + postes + obstacles pour la flotte).
  - Coût mesuré : cuisson ~0,35 s une fois à l'apparition (clé = géométrie, plus de
    recuisson à chaque recalcul) ; coût par image dans le bruit de mesure.
  - ⚠ DRAPEAU ÉTEINT par défaut (`PORT_SITES.on = false`, `__portSites({ on: true })`) :
    l'arbre est partagé, les autres sessions ne voient rien des nouveaux ports (allumé le
    2026-10-02, cf. plus bas).
  - Reste : voiliers de plaisance (kit de la session des bateaux), port cosmique à
    redessiner, lumières de nuit (phare, projecteurs du terminal).
- 2026-10-02 (Raph : « les bateaux sont dans le mur — corrige, termine, applique à toutes
  les ères ») :
  - **Bateaux dans le mur** : les murs de quai pendent SOUS le bord du quai, l'eau est peinte
    au plan du sol → un bateau posé à z = 0 chevauchait le mur. Coques, pontons et navires
    du terminal sont désormais à la hauteur de l'eau, z = −wh (wh = quayWallTiles(bande) ×
    heightK, `drawMooredHull(…, { z })`), avec le miroir de chaque boîte posé à ce plan
    (`mz`). Navires du terminal : avant ou après la cuisson basse selon leur côté.
  - **Raccords** : quais du bassin et terre-plein prolongés jusqu'à la reprise du quai du
    fleuve (`portBerths.quayJoin`) — plus de coin d'herbe entre le bassin et le quai.
  - **Lumières** : réverbères le long du quai nord du bassin et à l'arrière du terre-plein
    (`registerPortLamps`, lus par `isoStreet.isoLamps`), lanterne du phare, feux rouges en
    tête des portiques.
  - **Bandes** : vérifié en capture de la bande 0 à la 9 (planche
    `.preview-shots/planche-port-toutes-eres.png`) ; capitaineries cosmiques 7-9 gardées
    (sprites `port-cosmic-<bande>` existants, à la bonne largeur).
  - **DRAPEAU ALLUMÉ** (`PORT_SITES.on = true`). Sonde des routes ères 0→45 : au
    dédoublement (bande 5), 55 bâtiments déplacés (44 sans les ports) et 30 cases de rue
    reprises par le bassin, aucune autre rue perdue, puis la ville se stabilise (≤ 4
    déplacés par ère) ; tests 1951 verts.
  - Reste : voiliers de plaisance (kit de la session des bateaux), port cosmique à
    redessiner, escales de la flotte au port de commerce (session des bateaux, postes
    `portBerths` kind 'commerce').
  - Commit local `73a33d2`. Puis, le même jour, **coques du kit** (session des bateaux :
    `boatKit.drawMooredKit` / `mooredFootprint`) branchées dans `portBerths` : barques,
    cotre et chaloupe à vapeur au bassin XIXe, plaisance moderne avec VOILIERS en bande 6,
    esquifs de nacre 7-9, cargos de l'ère au terminal ; tous les postes cotés à la bande
    du plan (`hullFootprint(role, band)`), repli sprites sans modèle. Planche
    `.preview-shots/planche-ports-toutes-eres-v2.png`. ⚠ NON COMMITÉ : dépend de
    `boatKit.js`, pas encore commité par sa session (à commiter ensemble ou juste après).
  - **Le bassin passe à la session des bateaux** (demande de Raph, sur une capture de la
    bande 5 : pas de pêcheur assis dans un bateau à quai, des escaliers et des pontons, un
    meilleur dessin d'ensemble). Elle prend `iso/isoOldPort.js` jusqu'à son signal : coques
    à quai VIDES (option `empty` du kit), ponton le long du quai du fond + pannes, passerelles
    inclinées, escaliers de pierre, amarres. Commit commun proposé à Raph, avec les hunks
    non commités de portBerths.js / isoTradePort.js. Porte-conteneurs : un modèle « de
    quai » plus long (~2,9 tuiles) dessiné à sa taille plutôt qu'un agrandissement (qui
    casserait la grille de pixels).
- 2026-10-03 (Raph, deux captures : « les bâtiments de port ne sont pas bien alignés avec
  le ponton à certaines ères, et ceux que tu as refaits, il manque le côté pixel art ») :
  - **Alignement, trois causes.** (1) La pointe avant de la maison était posée SUR l'axe
    du ponton : il arrivait au coin, la porte à côté → `pierHouseFoot(g, w, d)` centre la
    face tournée vers l'eau sur l'axe, au bout du tablier, l'emprise w × d se déduisant du
    dessin (`PORT_HOUSE_R` = part de la face gauche, mesurée sur le PNG). (2) L'horreum de
    la bande 4 était dessiné presque DE FACE (bas de façade en pente 1/8 au lieu de 1/2) →
    régénéré (objet 8 directions d1ffb933, style de la taberna, rotation SUD-EST : la longue
    façade à arcades à gauche, éclairée), `image_to_pixelart` fidèle 95 px, 20 teintes.
    (3) `blitProp` substituait la version « -grand » selon l'empreinte du DERNIER
    bâtiment-moteur peint (valeur résiduelle de `setEngineSpan`) : la maison changeait de
    cadre selon ce qui précédait → `blitPropAnchored` pose toujours le sprite calibré.
  - **Pixel art des boîtes** (`isoBoxBake`, option `ink`) : contour sélectif foncé tiré
    vers le violet (devant le vide ou une boîte plus lointaine), arête haute éclairée,
    joints entre boîtes jointives, pied assombri sur le sol ; `faceLit` : l'ombre bleuit au
    lieu de griser. Terminal et docks redessinés au pixel (briques 6 × 2, pavés en
    quinconce, conteneurs nervurés, croisillons des portiques, taches d'huile en damier) ;
    entrepôts en TRAVÉES À PIGNON tournés vers le quai (toits en marches d'un pixel,
    `grp` = un seul objet pour l'encre). Fort et phare du Vieux-Port encrés aussi.
    Molettes `__trade({ ink })`, `__oldPort({ ink })`. Cuisson ~0,3 s, inchangée.
  - Planches : `.preview-shots/planche-port-alignement.png` (avant / après, bandes 0-4),
    `planche-port-pixelart-avant-apres.png`. NON COMMITÉ.
- 2026-10-03, second retour (« revoit la jonction quai/port » ; « les bâtiments ne vont
  pas, ou alors il faut qu'ils soient un peu sur le côté, pas au bout du ponton ») :
  - **Maison du port SUR LE CÔTÉ** du ponton (`pierHouseFoot`) : côté +x / +y (le ponton
    ne passe jamais devant), à `PIER.houseGap` 0,14 du tablier, reculée de `PIER.house`
    0,85 sur le sable (0,3 : le pied dans l'écume).
  - **Jonction quai / port de commerce, deux causes.** (1) Le bord du terre-plein était
    une droite au point le plus AVANCÉ de la berge (+0,12) : à l'autre bout le port
    débordait de 0,4 tuile → il SUIT la berge peinte (`yAt(x)`, table au 1/8 de tuile ;
    terre-plein et mur par bandes d'un quart de tuile ; tout le reste posé en `u` depuis
    ce bord), raccords prolongés de 0,1 sur le quai du fleuve. (2) Le mur du quai du
    fleuve s'effilait à zéro au bout de son tronçon, même contre un port → isoQuay :
    bout CARRÉ quand le bout touche `dockPlus` / `dockMinus` (session des quais prévenue).
    Vaut aussi pour l'embouchure du Vieux-Port.
  - **Port médiéval (bandes 2-3) redessiné** (Raph : « celui-là est très moche pour un
    bâtiment de pêche/port » — la maison-tour à colombages) : MAISON DE PÊCHEURS basse
    sous un grand toit de tuiles, filets et séchoir à poissons sur la face gauche (côté
    eau), porte à bateaux au pignon, rames et tonneaux. Objet 8 directions 0c1608e2
    (style : l'atelier à colombages a63180bc de la session des bâtiments), rotation
    sud-est, `image_to_pixelart` fidèle 88 px (72 px brouillait les filets), pose 2,0
    tuiles (densité ~1:1). Variante écartée : entrepôt à poulie f383ac90 (trop proche de
    l'ancien). Ancien sprite : git HEAD. ⚠ `port-house-medieval-grand` (palier) n'est
    plus utilisé par la grève et reste l'ancien dessin.
