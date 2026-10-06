# PLAN-BATEAUX — la flotte refaite : dessin, variété, comportement (2026-10-01)

Demande de Raph : « on va améliorer les bateaux et leur comportement, et faire en sorte
que les designs soient plus variés et mieux faits (tous les bateaux) ». Ce plan fait foi ;
le journal (§8) dit où on en est.

## 1. Décisions de Raph (2026-10-01)

| Sujet | Décision |
|---|---|
| Méthode | **Dessinés PAR LE CODE**, comme les ponts, les quais et les merveilles. Plus de PixelLab pour les coques. |
| Variété | **Plusieurs marchands par époque** (modèles + coques, voiles, cargaisons tirées par bateau), **nouveaux métiers**, **davantage de bateaux**. |
| Métiers | Marchand · pêcheur · **passeur / bac** · **péniche / chaland** (à la perche ; ⛔ plus de halage depuis le 2026-10-03, cf. §8) · **bateaux de service** (drague, pompe, police — ères modernes). Pas de bois flotté. |
| Plaisancier | Toujours **retiré** de la flotte mobile (2026-07-30). La marina IMMOBILE est l'affaire de la session port (§7). |
| Pêcheur | **Il évolue avec l'époque** (lève l'arbitrage de juillet « barque intemporelle »). |
| Comportement | Les quatre : **vrai accostage** au ponton, **navigation crédible**, **animations à bord**, **petites scènes de vie**. |
| Cosmique (b7-9) | « Un peu des trois » : classiques sublimés, glisseurs nacre/cristal, lévitation. Proposé : Noosphère = classiques sublimés, Stellaire = glisseurs, Démiurge = lévitation. |
| Taille | Laissée à mon choix → **échelle par métier, toisée sur l'équipage** (§3). |
| Ordre | **Pilote bande 4 Marbre**, planche, verdict, puis les autres ères. |

## 2. État de départ (mesuré le 2026-10-01)

- UNE coque marchande par stade : radeau (b0-1), voilier (b2-4, 15 ères), vapeur (b5),
  porte-conteneurs (b6). Tous les marchands présents sont des clones.
- Cosmique b7-9 : AUCUN art iso, le vieux sprite plat de profil recoloré.
- 8 faces PixelLab qui ne sont pas le même objet tourné (feux calibrés face par face,
  `NAV_UV`). Aucune animation (voile, fumée, aubes, rames figées).
- Le marchand « accoste » 2,5 s au milieu du fleuve (`dockSide` jamais lu) ; le bateau du
  ponton est un décor fixe. Aucun évitement entre bateaux. Cap par sauts de 45°.
- Planche de l'existant : `node scripts/boatSheet.mjs` → `.preview-shots/boats-iso.png`.

## 3. Méthode de dessin : un peintre de bateaux en 3D au pixel

`iso/boatBake.js` (pur, testable en Node) **construit** chaque bateau en volumes dans son
repère (a = le long, c = en travers, tribord +, h = hauteur au-dessus de l'eau, unités =
px monde au zoom 1) et le **projette** à n'importe quel cap avec l'iso exact du jeu :
X = wx − wy, Y = (wx + wy)/2 − h, profondeur = wx + wy + h (z-buffer).

- Coque paramétrique (longueur, largeur, franc-bord, tonture, étrave, poupe, évasement),
  bordé, plat-bord, intérieur visible pour les bateaux ouverts, pont pour les pontés.
- Pièces : mâts, vergues, voiles gonflées, rames, avirons de gouverne, cabines, cargaisons
  (amphores, sacs, blocs, tonneaux, conteneurs), ornements, équipage.
- Lumière haut-gauche (normale +y éclairée, +x ombrée, dessus le plus clair), teintes
  QUANTIFIÉES sur la rampe de chaque matière (pas de dégradé), contour d'encre comme les
  ponts et les bâtiments.
- **32 caps** cuits à la demande et mis en cache (au lieu de 8 vues incohérentes) ; les
  virages deviennent progressifs.
- Reflet cuit en 3D (h → −h), feux de position posés par la géométrie : plus de calibrage.
- Grain : 1 px d'art = 1 px de sol au zoom 1 (densité de la carte, cf. PLAN-GRILLE-PIXELS).
  ⚠ Leçon G1a : un art se DESSINE pour sa taille ; ici chaque bateau est construit à sa
  vraie taille en pixels.

**Toise** : habitant ≈ 7,5 px = 1,7 m → 1 px ≈ 0,23 m, 1 tuile ≈ 7,3 m. Les petits
métiers sont à l'échelle réelle (barque ≈ 24 px), les gros porteurs sont comprimés
(corbita ≈ 60 px au lieu de ~100), plafond = la passe du pont. L'équipage est à la taille
des habitants.

`iso/boatKits.js` : la flotte de chaque bande (modèles, matières, variantes).
`iso/boatKit.js` : l'API (`drawBoat`, `boatFootprint`) servie au fleuve ET à la session port.

## 4. La bande 4 Marbre (pilote)

| Métier | Bateau | Détails |
|---|---|---|
| Marchand | **Corbita** | coque ronde, voile carrée, poupe en col de cygne, cabine, amphores |
| Marchand | **Galère marchande** | longue, basse, rames animées + petite voile |
| Péniche | **Codicaria** (chaland du Tibre) | à fond plat, blocs de marbre / amphores, menée à la perche |
| Pêcheur | **Scapha** | barque, deux hommes, filet |
| Passeur | **Bac à perche** | plateforme, garde-corps bas, passeur, voyageurs |

Variantes par bateau : couleur de coque (bois, poix noire à liseré peint), voile (lin,
rayures, safran), cargaison, ornements.

## 5. Comportement (lots suivants)

- Simulation : la voie TRANSVERSALE passe dans la sim (aujourd'hui calculée au rendu) ;
  cap lissé à vitesse de giration bornée.
- Règle de route : on tient sa droite ; dépassement si la voie est libre, sinon on ralentit.
- Pont : la passe est à sens unique à un instant donné ; on attend si quelqu'un arrive en face.
- Accostage : le marchand vise un poste (portBerths), se range bord à bord, charge/décharge
  (porteurs), largue et repart ; poste occupé → il mouille à côté et attend.
- Passeur : deux embarcadères, attente des voyageurs, traversée.
- Péniche : à la perche (batelier sur le plat-bord), lente ; automotrice à l'ère de la fonte.
- Pêcheur : jette son filet, le relève.
- Scènes : salut en se croisant, attente au mouillage.
- Densité : plafonds par métier, revus à la hausse.

## 6. Lots

1. **Peintre + kit Marbre** → planche des 5 bateaux × 32 caps + variantes + capture en jeu.
2. Branchement en jeu (remplace les sprites pour la bande 4, A/B `__boatKit`).
3. Navigation (voie dans la sim, cap lissé, croisements, passe du pont).
4. Accostage + chargement.
5. Passeur, péniche halée, pêcheur au filet.
6. Scènes de vie + densité.
7. Les autres bandes (0-3, 5-6, cosmiques), puis les bateaux de service.

## 7. Coordination

Session « Amélioration du port et de la plage » (`docs/PLAN-PORTS.md`) : port de commerce
façon Le Havre (b5-6+, navires amarrés fixes) et port de plaisance façon Vieux-Port
(bassin creusé, bateaux IMMOBILES). Contrat :
- je fournis `iso/boatKit.js` → `drawBoat(...)`, `boatFootprint(spec)` ; elle pose ses
  navires par son indirection `drawMooredHull` ;
- elle exporte `portBerths(L)` et `portWaterObstacles(L)` (`iso/portBerths.js`) ;
  (2026-10-06, audit MORT-5 : seul reste `portBerths(L, 'commerce')`, le poste libre du
  terminal, lu par `fleetBerths` ; `portWaterObstacles` est parti, sans lecteur) ;
- le port CENTRAL est servi par MA flotte (vrai accostage) ; `pierMoorings` reste sa source ;
- chacun prévient avant de toucher les fichiers de l'autre (isoPier.js chez elle ;
  isoFleet.js, riverFleet.js, drawIsoShips/drawIsoPortBoat chez moi).

## 8. Journal

- 2026-10-01 : questions, décisions, état des lieux, plan.
- 2026-10-02 (nuit) — **Lot 1 fait** : `iso/boatBake.js` (peintre à points + z-buffer,
  contour EXTÉRIEUR, pièces fines sans contour, équipage cerné comme les habitants, reflet
  3D), `iso/boatKits.js` (bande 4 : corbita, galère, codicaria, scapha, bac + variantes),
  planche `node scripts/boatPlanche.mjs 4 3` → `.preview-shots/bateaux/planche-b4.png`
  (~11 ms/cuisson). Planche envoyée à Raph, **verdict DA attendu**.
- **Lot 2 fait** : `iso/boatKit.js` (cache LRU des 32 caps × poses, budget 3 cuissons/frame,
  `drawBoat`, `boatFootprint`, `__boatKit({on})`), branché dans `drawIsoShips` pour les
  bandes qui ont une flotte ; feux posés par les ancres du kit.
- **Lot 3 fait** : la navigation vit dans `riverFleet.js` (voie `lat`, cap `th`) — droite,
  suivre, doubler, s'écarter, passe du pont à sens unique (celui qui attend serre sa
  droite), giration bornée. ⚠⚠ **Le ruban fait 590 tuiles pour une carte de 164** : les
  vitesses sont désormais en TUILES/s (par modèle), et la vie se joue dans une FENÊTRE
  (la carte + 18 tuiles) — avant, on naissait 200 tuiles hors champ et une corbita
  filait à 4,7 tuiles/s. Tests : `__tests__/riverNav.test.js`.
- **Lot 4 fait** : `iso/boatBerths.js` — un poste par port (tête du ponton, via
  `pierMoorings`), le marchand s'y range (approche latérale, cap aligné), 16-26 s à quai
  voile serrée, deux PORTEURS de l'ère font la navette sur le tablier (amphore à
  l'épaule), poste pris → il attend avant ; le ponton est une passe à sens unique pour
  les autres. Le bateau-décor disparaît dans les ères du kit. Bateau à quai et porteurs
  triés avec la scène du port (items `fleetShip` / `porter`).
- **Lot 5 fait** : métiers `barge` (chaland) et `ferry` (passeur) dans `riverFleet`
  (FLEET_KINDS ; budget publié SEULEMENT si l'ère a leur dessin — paramètre `roles`).
  Le passeur : site loin du pont et des pontons (`ferrySite`, ≥ 16 tuiles), attend à
  l'embarcadère, ne part que si personne n'arrive à moins de 7 tuiles, et sa traversée
  est une PASSE pour les autres ; nouveaux voyageurs à chaque voyage. Le chaland longe
  la rive SANS ponton, halé par un bœuf + son bouvier au bord de la berge (corde tendue
  au mât de halage). `iso/boatScenes.js` : embarcadères (dessinés par le même peintre),
  voyageurs qui attendent, bête de halage (items `fleetScene`). Galère à quai : rames
  relevées.
- **Lot 6 fait** : salut quand deux bateaux se croisent de près (un matelot lève le
  bras) ; densité : 6 marchands, 2 pêcheurs dès la Pierre, + chaland + passeur.
- À trancher avec Raph : l'embarcadère posé sur un quai maçonné (il pourrait plutôt
  partir des escaliers du quai) ; les autres bandes et les bateaux de service attendent
  le verdict DA du pilote.
- 2026-10-02 — **Pilote VALIDÉ par Raph : « c'est parfait, fais toutes les époques ».**
- **Toutes les époques faites.** Organisation des fichiers :
  `iso/boatParts.js` (coque, équipage, cargaisons, voiles carrée/latine, cheminée,
  cabine, rambarde), `iso/boatFamilies.js` (radeau, pirogue, barque, bac, chaland halé,
  embarcadère, paramétrés par matières), `iso/boatKits.js` (Marbre + registre
  `BOAT_MODELS` / `BAND_FLEET`), `iso/boatKitsAncient.js` (bandes 0-3),
  `iso/boatKitsModern.js` (5-6), `iso/boatKitsCosmic.js` (7-9), `iso/boatFx.js`
  (fumée, lances, halo de lévitation). Vitrine : `node scripts/boatVitrine.mjs 2`.

  | Bande | Marchands | Chaland | Pêcheur | Passeur | Service |
  |---|---|---|---|---|---|
  | 0 Feu | radeau, pirogue | — | pirogue (sagaie) | radeau à la perche | — |
  | 1 Bois | radeau à voile de peau, barque cousue | — | canot | bac de planches | — |
  | 2 Pierre | knarr, barque à voile | chaland de pierre (cheval) | barque | bac | — |
  | 3 Couronne | cogue à châteaux, gabare | chaland (cheval) | barque à voile latine | bac à charrette | — |
  | 4 Marbre | corbita, galère | codicaria (bœuf) | scapha | bac | — |
  | 5 Fonte | vapeur à aubes, cargo à vapeur | péniche (cheval) | barque peinte | chaloupe à vapeur | remorqueur, drague à godets |
  | 6 Néon | porte-conteneurs, pétrolier | convoi poussé | bateau à moteur | navette vitrée | police, pompiers |
  | 7 Noosphère | voilier solaire, galion de verre | chaland de lumière | barque de nacre | disque | sentinelle |
  | 8 Stellaire | glisseur, catamaran à aile | idem (or) | idem | idem | idem |
  | 9 Démiurge | arche, nef — EN LÉVITATION | idem (violet) | idem | idem | idem |

  Embarcadère par époque (rondins, planches, fer, acier, nacre). Feux de position sur
  les marchands à mât/moteur (ancres), gyrophare (police, sentinelles), fumée animée,
  aubes et rames animées, lances des pompiers, halo + ombre décalée sous les coques qui
  lévitent (`HOVER` = 7 px, reflet cuit avec l'écart).
- **Service** (`riverFleet`, métier `service`) : patrouille (demi-tour aux bouts de son
  tronçon), drague à poste fixe, pompiers qui s'arrêtent pour arroser ; modèle choisi par
  RANG (`sh.svc`) ; un bateau à la Fonte, deux au Néon, un aux cosmiques.
- **Plaisance À QUAI** (jamais en navigation) pour les bassins de la session ports :
  canot verni, cotre, chaloupe (5) ; annexe, dériveur, voilier, vedette (6) ; esquif et
  petite voile de nacre (7-9). API `drawMooredKit` / `mooredFootprint` dans
  `iso/boatKit.js` (rôles de leur table → modèles de l'ère), branchement proposé à la
  session port dans SON `drawMooredHull`.
- Tests : `__tests__/boatKits.test.js` (flotte complète par bande, chaque modèle cuit
  à 4 caps × 4 états sans être ROGNÉ par son cadre, lévitation mesurée).
- 2026-10-02 — **Le bassin du Vieux-Port repris** (à la demande de Raph, fichier de la
  session ports cédé le temps du chantier : `iso/isoOldPort.js`). Retour de Raph : « ça ne
  va pas de voir le pêcheur dans son bateau, ce n'est pas logique ; il faut aussi des
  escaliers et des pontons ; améliore le design global du port ». Fait : bateaux à quai
  VIDES (option `empty` du peintre, passée par `drawMooredKit`), ponton flottant le long
  du quai du fond et passerelles inclinées, escaliers de pierre aux deux murs latéraux (pas
  d'isoQuay), amarres (ponton, anneaux du mur), coin des pêcheurs à couple (bande 5),
  caisses et filets sur le quai, pannes de marina sans chevauchement (6+). Porte-conteneurs
  de quai (`porte-conteneurs-quai`, 2,9 tuiles) pour le terminal.
- Banc : serveur `vite-bateaux` (port 61850, sans rechargement auto) ; `performance.now`
  remplacé par une horloge factice (+33,4 ms par `CM.forceFrame()`) pour faire tourner la
  sim pane cachée — les timers y sont bridés.
- 2026-10-03 — **Plus de halage** (Raph, après une capture : « c'est normal le cheval qui
  tire un bateau ? » puis « le rendu est bizarre surtout avec les escaliers », et au choix
  proposé : « plus de halage du tout »). La bête marchait en haut du quai, dans la rue, et
  sa corde balayait le mur et les escaliers ; collé à sa rive, le chaland traversait le pied
  des escaliers (qui avancent de 0,3 tuile dans l'eau). Retirés : la bête, son bouvier et
  la corde (`boatScenes.js`, `isoPort.js`), le mât de halage, `towTop`, `tow`,
  `towSide`. Le chaland (bandes 2, 3, 4) avance à la PERCHE (`poler`, boatParts.js : un
  batelier sur le plat-bord, la perche plantée en arrière, pose animée sur 4 images) ; la
  péniche de la fonte est automotrice (`pole: false`). Il tient sa droite comme les autres.
- 2026-10-03 — **Le passeur et les oiseaux** (Raph, sur trois captures : « ce n'est pas
  logique que le passeur soit à côté du pont. Aussi il faut que les oiseaux s'éloignent
  quand il s'approche. Également qu'il ne rentre pas dans le quai, il s'arrête avant »).
  · **Site** : `ferrySite` lisait `CM.riverGates` AVANT que le runtime le remplisse —
  les passes du layout précédent, aucune au chargement : le bac s'installait au pied du
  pont. Le calcul passe en fin de bloc (après ponts, obstacles plantés dans l'eau — eux
  aussi évités désormais — et île) ; garde-fou dans `riverNav.test.js`.
  · **Accostage** : le bac aborde de face, c'est sa demi-LONGUEUR qui va vers la berge
  (`ferryLat` comptait la demi-largeur : son bout montait sur le tablier et le quai). Il
  touche l'eau qu'on VOIT : `site.reach[side]` = bout du tablier (10 px), ou pied du mur
  de quai quand on voit sa face — le mur pend sous le bord et cache
  `quayHiddenDepth` = hauteur × |tx − ty| tuiles d'eau. L'embarcadère allonge alors son
  tablier jusqu'au bac, sur des pieux qui descendent au pied du mur
  (`makeLanding({ reach })` / `withReach`, modèles dérivés `<id>@<px>` enregistrés à la
  volée par `boatScenes`). L'embarcadère du Marbre passe par `makeLanding` (même rendu,
  vérifié à l'octet sur les 32 caps).
  · **Oiseaux** (`isoRiverLife.js`) : canards et cygnes s'écartent en travers du cap de
  toute coque qui approche (3,2 tuiles devant l'étrave), du côté où il y a la place, puis
  reviennent lentement (1,5 tuile/s en fuite, 0,28 au retour), toujours dans l'eau. Seul
  état du module (`_flee`) ; `__vieSpots().flee` montre les écarts.
- 2026-10-03 (nuit) — **L'ÉQUIPAGE = LES HABITANTS DE L'ÈRE** (Raph, capture d'un chaland :
  « faut revoir les personnages sur les bateaux »). Les marins construits en volumes (boîte
  des jambes, tunique, boule de tête) se lisaient comme des tonneaux à la taille de la
  carte, et restaient au gros pixel de la cuisson quand les habitants du quai gagnent en
  finesse avec le zoom. Désormais :
  · le kit ne dessine plus personne : `person()` pose une PLACE (`boatBake.crewSlot` : pied,
    cap, pose, tirage) ; les assis (`row`, `sit`, `paddle`) sont ENFONCÉS de 3 px sous leur
    banc, le bordé cache leurs jambes ;
  · la cuisson rend pour chaque place un MASQUE lu dans le z-buffer (`crewMasks`) : le
    marin est un panneau vertical, un pixel du bateau plus proche que lui (au-delà de
    1,2 px d'épaisseur) le cache — plat-bord, cargaison, voile, perche — et tout ce qui
    descend sous son appui est dans la coque. Le contour d'encre prend la profondeur de ce
    qu'il borde (le trait du plat-bord coupe les jambes comme le plat-bord) ;
  · le jeu y pose le SPRITE de l'habitant (`boatKit.drawCrew`, `agents.agentFrameIso` :
    même bande pleine/-half, frame 0, pieds mesurés), peint dans une toile de travail à la
    grille DEVICE, découpé par le masque mis à l'échelle exactement comme la coque, puis
    posé ; le pont redessine les marins avec la coque (`sh._hull.crew`) ;
  · QUI est à bord : `iso/boatCrew.js` (`BOAT_CAST` par bande — marins, pêcheur, passagers
    du bac, police — sans chaman ni moine aux rames ni joggeur à la barre) ; l'ère des
    habits est celle de la ville ; les garde-robes des marins en volumes sont retirées.
  Ni ombre au soleil (le `multiply` de l'ombre ne passe pas par une toile de travail
  transparente) ni reflet pour les marins. Planches : `boatVitrine`/`boatPlanche` posent
  l'équipage (`scripts/boatCrewRaster.mjs`, même calcul sur PNG). Test :
  `__tests__/boatCrew.test.js`.
  · **Personne sur le pont des grands navires** (Raph, sur la vitrine : « personne sur les
  grands bateaux ») : vapeurs, cargo à vapeur, péniche (`makeBarge({ crew: false })`),
  remorqueur, drague, porte-conteneurs, pétrolier, pousseur. Un habitant y faisait une
  miette au pied de la cheminée. L'équipage reste aux petits bateaux (barques, chaloupe,
  navette, police, pompiers) et aux voiliers anciens et cosmiques. Verrouillé par
  `boatCrew.test.js`.
  · **La navette redessinée en BATEAU-BUS** (Raph : « revois le design de ce bateau, on ne
  comprend pas ce que c'est ») : la coque blanche sous une verrière cintrée bleu ciel ne
  donnait qu'un savon bleu. Désormais coque marine au liseré de la LIGNE et carène rouge,
  cabine blanche HAUTE (5,4 px) percée d'une bande de vitres sombres, toit bombé à la
  couleur de la ligne (turquoise, jaune ou vert — pas de rouge, c'est le bateau-pompe),
  timonerie vitrée à l'avant du toit et son mât (feux de tête et de bord : la navette a
  désormais ses feux), bouées orange, plateforme arrière à garde-corps, pavillon de la
  ligne. Essayés et écartés sur planche : verrière sombre à arceaux (un damier), toit
  blanc à bande de couleur (un yacht).
- 2026-10-04 — **LA NAVETTE DES PLAISIRS** (Raph : « tu fais une navette qui amène à la
  maison des plaisirs ? » ; réponses : son propre ponton, un bateau-lanterne à la marque de
  la Maison, des habitants qui y vont + une hôtesse, surtout la nuit).
  · **Ligne** (`riverFleet.js`, métier `shuttle`, `shuttleStep`) : de son ponton en ville à
  l'embarcadère de la Maison — au pied de l'escalier qui descend à l'eau, face au SUD,
  coque en travers — et retour. Elle navigue avec les autres (file, passes, cap) en serrant
  la rive de ses deux arrêts (du même bord) ; son ponton est une passe quand elle y est ou
  y vient ; amarrée à la Maison, elle prolonge l'obstacle du lieu (on la contourne au
  large) ; en partant, elle contourne la Maison par SON bord (`_dodgeSide` préréglé), et
  elle ne l'évite plus quand elle l'accoste. SURTOUT LA NUIT : l'attente au ponton de la
  ville (55-95 s) s'écoule `shuttleNight` = 7 fois plus vite en pleine nuit.
  · **Arrêts** (runtime, `CM.shuttleSite`) : le ponton par `shuttleSite` (entre le cœur et
  la Maison, à ≥ 12 tuiles des passes, postes, bac et obstacles, à ≥ 18 de la Maison) ;
  l'embarcadère de la Maison par `MAISON_LANDING_PX` (pied de l'escalier MESURÉ sur la
  cuisson de la Maison, remesuré par `riverShuttle.test.js`).
  · **Bateau** (`iso/boatKitsPlaisirs.js`) : le bateau-lanterne, un par âge, même
  silhouette — dais à frange de PÉTALES, guirlandes de LANTERNES rouges (torches à l'âge
  du feu, orbes aux âges cosmiques), étrave dorée, pavillon rouge. À bord : l'HÔTESSE de la
  Maison (une fille de la troupe de l'âge, `boatCrew` rôle `hostess`) et 2 à 4 passagers
  assis à l'aller ; au retour au plus un ; amarrée à la Maison, personne (ils sont montés).
  La nuit, chaque lanterne (ancres `lamp*`) luit (`boatFx.drawLamps`, passe de nuit).
  · **Ponton** (`boatScenes`) : l'embarcadère de l'ère avec sa potence et sa lanterne
  rouge (`makeLanding.withLantern`), allongé comme celui du bac quand on voit le mur de
  quai ; ceux qui attendent la navette quand elle est partie. Le bateau à quai est trié à
  son CENTRE (avancé comme un marchand, il couvrait le bout du ponton).
  Planche : `node scripts/boatNavettePlaisirs.mjs 3`. Tests : `riverShuttle.test.js`,
  `boatCrew.test.js`.
  · **Le ponton de la navette : un ESCALIER DU QUAI et un ponton flottant à son pied**
  (Raph, 2026-10-04 : « le ponton depuis le quai ça fait bizarre, il faut enlever la
  rambarde à ce niveau-là et faire un escalier »). Le ponton sur pieux partait de la
  promenade, par-dessus le garde-corps. Désormais, sur la rive dont on VOIT le mur (de
  l'autre, une volée se cacherait derrière le bord de la promenade — l'en-tête des
  escaliers d'`isoQuay` le dit), le runtime DEMANDE une volée au quai
  (`isoQuay.wantQuayStairs`, posée avant les autres, même en lisière de ville, garde-corps
  ouvert, rambarde de l'escalier comprise) ; le quai publie son PIED (`quayWantedFoot`) ;
  un ponton FLOTTANT (`makeLanding.asPontoon`, 44 × 8 px) longe le mur depuis le palier
  d'en bas, la lanterne rouge au bout, et la navette s'amarre bord à bord contre lui.
  Elle serre la rive de l'arrêt qu'elle vise (son ponton peut être sur l'autre rive que
  l'escalier de la Maison) et traverse en route. Repli (rive sans quai au mur visible) :
  l'ancien ponton sur pieux, garde-corps ouvert à sa racine (`gapOnly`).
  ⚠ Banc : `CM.zoomGoal` écrase `CM.cam.zoom` (régler les deux) ; une capture juste après
  une recuisson du quai le montre absent (tuiles pas encore cuites) — laisser tourner.
  · **Le ponton vraiment au pied de l'escalier, et le passeur aussi** (Raph : « mets le
  ponton vraiment au pied de l'escalier, et oui tu peux le faire pour le passeur aussi »).
  Le ponton flottant part du BOUT du palier d'en bas (`quayWantedFoot` publie ce point,
  sur la ligne du pied du mur), collé au mur, de la largeur de la volée (FLOAT_W = 10 px),
  et mord de 3 px sur le palier : escalier → palier → ponton sans un pixel d'eau. Tout
  le placement vit dans `iso/boatLandings.js` (`stairPontoon`, `edgePontoon`,
  `pontoonFace`, `PONTOON_LEN`). LE PASSEUR : sur la rive dont on voit le mur, son
  escalier et son ponton (30 px), et le bac traverse AU DROIT du ponton (le site glisse
  sur son milieu) pour l'aborder par l'avant ; sur la rive au mur caché, le garde-corps
  s'ouvre et un ponton (20 px) part pile du bord du quai, vers le large ; sans quai,
  l'embarcadère sur pieux d'avant. Les voyageurs attendent DEBOUT sur le ponton (peints
  après lui). Les volées demandées par le bac et la navette sont réunies (`quayWant`).
  · **La rive au mur caché : le ponton AU NIVEAU DE L'EAU** (Raph, sur la rive sud du
  passeur : « supprime ça… enfin, faut respecter la profondeur »). Posé au niveau de la
  promenade, il couvrait le bord du quai. L'eau y est aussi bas qu'en face (`wallT` tuiles
  sous la promenade) : le ponton y flotte (`edgePontoon` : `sink` px d'enfoncement),
  passe SOUS le bord du quai, qui en cache la racine (`hid` tuiles, même mesure que
  `quayHiddenDepth`) — le dessin est découpé à la ligne du bord (boatScenes) ; on en voit
  `PONTOON_LEN.edge` px au large, et le bac l'aborde au bout TEL QU'ON LE VOIT
  (`pontoonFace`). L'escalier qui y descend reste derrière le mur ; l'ouverture du
  garde-corps le dit.
  · **Le garde-corps PASSE DEVANT** le ponton enfoncé (Raph : « la barrière doit passer
  devant le ponton ») : plus d'ouverture de ce côté ; le quai, peint avant les objets triés,
  est REPOSÉ par-dessus le ponton et ceux qui s'y tiennent (`isoQuay.repaintQuayRect` :
  les tuiles déjà cuites, dans le cadre du ponton, côté eau de la ligne du bord — l'eau
  des tuiles est transparente, seul le garde-corps se repose). Item `quayFront`, trié
  juste après les voyageurs.
  · **Une ouverture au droit du ponton** (Raph : « il faut garder une ouverture ») : le
  garde-corps passe devant le ponton enfoncé SAUF là où on le voit passer sous le bord —
  l'ouverture est posée au point EXACT où son axe croise la ligne du bord à l'écran
  (`edgePontoon` : `gx, gy`, résolu dans l'écran zoom 1 ; enfoncé, il y sort ~22 px le long
  du quai plus loin que sa racine), via `wantQuayStairs({ gapOnly, x, y })` — le sample du
  fleuve le plus proche était à une tuile près.

- 2026-10-04 (session de l'îlot de l'Aiguille) : Raph — « le bateau du milieu a un problème
  d'animation de son marin » (la barque du pêcheur qui tourne autour de l'îlot). La phase k du
  coup de rame arrivait jusqu'à `boatParts.person` et y était JETÉE : les rames balayaient
  l'eau autour d'un rameur figé. `person(…, pose, k)` penche maintenant la place du marin le
  long de son regard avec son outil (`LEAN` : rame — il suit les poignées, ±1,1 px ; perche —
  avec la main, comme `poler` ; filet/amarre — il tire en arrière ; pagaie), le masque de la
  coque suit (calculé à la place penchée). La scapha et la barque cousue passent de 6 à 8 poses
  par coup (moins de 3 images/s, ça saccadait). Planche `.preview-shots/rameur-*.png`.
  Même jour, « fais les remous sur le ponton et sur tous les pontons » : les embarcadères
  (pontons flottants du bac et de la navette, embarcadères sur pieux) NOTENT leurs remous au
  dessin (`boatScenes.landingRipples` → `iso/waterRipples.js`), peints à l'image suivante
  dans la passe des remous, sous les quais et les coques (cf. PLAN-MERVEILLES §7, 2026-10-04).

- 2026-10-06 — **Les sprites de bateaux retirés** (audit du 05/10, MORT-6, décision de Raph :
  « supprimer les références d'A/B tranchées »). Le kit couvre les dix bandes, chaque métier
  et chaque rôle des ports (garde : `boatKitCover.test.js`) : l'A/B `__boatKit({ on: false })`
  et tout ce qu'il servait sont partis — coques PixelLab de la flotte (`drawIsoShips`), repli
  « profil » et barque de réglage, bateau de décor du ponton (`drawIsoPortBoat`, item
  `portBoat`), repli sprite de `drawMooredHull`, feux relevés par face (`NAV_UV`,
  `NAV_ANCHOR`, `navLightOffsets`) et le calibreur `navCalib.js`. Les feux ne sont plus que
  les ancres `port`/`stbd` des modèles. Les 72 `boat-<stade>-<secteur>.png` sont gardés
  comme source dans `art/references-ab/bateaux-sprites/` (`boatSheet`, `boatFaces` y
  lisent) ; `public/pixelart/agents/boats/` reste (scène moteur du port).
