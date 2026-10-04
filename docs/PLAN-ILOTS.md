# PLAN — La ville par îlots

> Demande de Raph, 2026-10-04 : « en fait faut tout refaire le placement des bâtiments,
> là on a un gros brouillon » (capture d'une ville de la bande 4).

## 1. Constat mesuré (bande 4, `__demoCity({pop:'1e23'})`, 1 352 bâtiments)

| Mesure | Valeur |
|---|---|
| Sol de ville (hors rues) qui ne porte rien | **72 %** |
| … dont à plus de 2 cases de tout bâtiment (dalles nues) | 69 % du vide |
| Bâti par anneau : cœur 0-16 / 16-35 / 35-60 / 60-85 | 77 % / 63 % / 14 % / 16 % |
| Bâtiments qui touchent une rue | 93 % |
| Emprise / emprise nécessaire au même contenu | ≈ 2,3 × |

La ville se fabrique dans le mauvais ordre : un réseau de rues dimensionné par l'ÂGE
(`cityReachBase = N·(0,18 + eraFrac·0,24)…`), puis des maisons semées une à une (filtre
`HOUSE_ROAD_RADIUS = 4`, « on VEUT des bâtiments au milieu », buildingGenerator.js), puis
un chemin par maison (`connectBuildingsToNetwork`). Les quinze passes d'août à octobre
(PLAN-TISSU-URBAIN L0-L13, PLAN-RENDU-VILLE §7) ont retouché ce système de l'intérieur ;
deux règles l'empêchent de changer de nature : « une rue ne disparaît jamais » (R1-R4,
PLAN-ROUTES) et « une maison ne bouge jamais » (keepInPlace).

## 2. Décisions de Raph (2026-10-04)

1. **Réorganisation UNIQUE** de la ville de la partie en cours au chargement de la mise à
   jour ; ensuite plus rien ne bouge, les îlots s'ajoutent au bord.
2. **Ville compacte** : sa taille suit son contenu, plus son âge.
3. **Nouveaux dessins MITOYENS** (façades conçues pour se toucher).
4. **Pilote : l'âge du Marbre (bande 4)**, planche avant/après, puis les autres âges.

## 3. Le principe

- **L'îlot est l'unité.** Les rues sont ce qui sépare les îlots — plus de réseau tracé
  d'avance puis élagué, plus de chemin par maison.
- **On remplit l'îlot par le bord** : lots d'une case le long des rues, façade côté rue,
  collés ; l'intérieur est une cour (atrium, jardin). Un îlot entier peut porter une
  place, une halle de moteur (monument + parvis) ou une merveille.
- **La ville grandit îlot par îlot**, du cœur vers l'extérieur le long des axes ; un îlot
  ne s'ouvre que quand les précédents sont pleins. Emprise ∝ contenu.
- **Un plan par âge** : campement/hameau inchangés (validés) ; village/bourg en îlots
  irréguliers ; Marbre en grille romaine (cardo = la colonne du pont, decumanus = la rangée
  du cœur) ; âges suivants à décliner.

## 4. Lots

| Lot | Contenu | État |
|---|---|---|
| I0 | Ce plan ; carte du flux de données de `computeCityLayout` | en cours |
| I1 | Générateur d'îlots bande 4 (grille, rues, ouverture par la demande, fleuve, merveilles, places) derrière une molette | à faire |
| I2 | Remplissage : maisons sur le bord, halles sur îlot, ateliers sur lots, cours | à faire |
| I3 | Mémoire : réorganisation unique (marqueur dans `cityCore`), lots persistants | à faire |
| I4 | Tests : contrats réécrits (desserte par construction, sol sous bâtiments, stabilité) | à faire |
| I5 | Planche avant/après → validation Raph | à faire |
| I6 | Dessins mitoyens romains (PixelLab, 4 orientations, angles) | à faire |
| I7 | Déclinaison aux autres âges | à faire |

## 5. Journal

- 2026-10-04 : constat chiffré, décisions de Raph, plan.
- 2026-10-04 (nuit) : lots I1-I4 en place, derrière `ILOT_MODE` (bande 4) :
  - `procedural/blockCity.js` (pur) : grille ancrée sur le cardo (colonne du pont) et le
    decumanus (rangée du cœur), ORDRE d'ouverture des îlots à préfixe stable, chaque îlot
    raccordé aux précédents ; lots de bord en rangée, cour au milieu.
  - `map/ilotLayout.js` : combien d'îlots ouvrir (demande de lots + marge, jamais moins que
    la fois d'avant), forum (premier îlot complet au croisement), places de quartier tous
    les 16 îlots, halles dans l'ANGLE NORD d'un îlot (des maisons bordent le reste —
    la v1 leur donnait l'îlot entier : 25 parvis vides), ateliers semés d'îlot en îlot
    (jamais deux du même métier par îlot, jamais sur une case tenue), rues hiérarchisées
    (cardo double et decumanus `main`, une rue sur deux `secondary`, l'autre ruelle `path`).
  - `layout.js` : la portée de ville suit le contenu (`ilotReachFor`), pas l'âge — sauf la
    Maison des Plaisirs (`eraReachBase`) ; réorganisation unique (`cityCore.ilot`,
    normalisé dans state.js) ; pas de réseau tracé ni de grands ensembles décoratifs ; les
    rues d'îlot dans `memKeep` (aucun émondage n'y touche) ; champs, moulins et port gardent
    leur placement dédié, et la campagne déjà posée tient ses cases + 3 (la ville l'entoure).
  - Mesuré (bande 4, `__demoCity({pop:'1e23'})`) : sol de ville bâti **28 % → 85 %**,
    bâtiments sur une rue 93 % → **100 %**, rayon ~82 → 61 ; part de rues 43 %.
  - Tests : `blockCity.test.js`, `ilotLayout.test.js` ; `roadMemory.test.js` exempte le
    seul pas de la réorganisation (aucune rue perdue ensuite, 0 maison déplacée au Marbre).
  - Reste : planche à Raph (I5), dessins mitoyens (I6), autres âges (I7). Les bandes 5+
    repassent à l'ancien placement en gardant les rues d'îlots (mémoire).
- Stabilité (même nuit) : la MÉMOIRE garde la liste des îlots ouverts et le rôle des
  places (`cityCore.ilot.blocks / plazas`), pas leur nombre — l'ordre d'ouverture bouge
  avec la géométrie (le fleuve s'étire quand la grille grandit : N 164 → 170 mesuré).
  Un îlot neuf qui toucherait la campagne posée (+3 cases) est différé.
- 2026-10-04 (I6, maisons MITOYENNES — Raph : « go pour les mitoyens, garde des îlots
  4×4 ») : une maison d'une case sur un lot de bord (`t.row`, `t.face` = côté de la rue,
  layout.js) devient une unité de rangée qui REMPLIT son losange coin sur coin
  (`pixelHouses.rowGeom`, pas de poussé vers la rue). Quatre modèles PixelLab (échoppe,
  domus, popina, insula) ; les DOS (lots tournés vers le nord/l'ouest) et les BOUTS de
  rangée (mur latéral visible : rien ne le couvre) sont des insulae, fenêtres sur quatre
  faces. Vues choisies À LA MESURE de la lumière (PixelLab éclaire l'objet par sa
  façade : un dos est toujours à l'ombre, d'où les insulae ; l'échoppe n'a aucune vue
  « façade à droite » éclairée à gauche → popina). Largeur d'encre normalisée à ~58 px
  (`image_to_pixelart` fidèle) pour le grain des maisons (~1,1 px écran/px d'art) ;
  l'insula reste à son dessin d'origine (72 px, grain 0,9) : réduite, elle se couvrait
  de traînées orange. IDs dans `scripts/data/pixellab-scenes-tardives.json` (mitoyens).
- 2026-10-04 (I6 révisé — Raph : « les mitoyennes dénotent un peu du reste avec leur
  ton orange. Les bâtiments déjà faits ne peuvent pas être réorientés ? ») : les
  mitoyennes sont RETIRÉES (fichiers et code). À la place, les maisons romaines EXISTANTES
  se tournent vers leur rue : domus, taberna et insula2 sont des objets PixelLab à 8 vues
  (`house-*-b4`) dont TOUTES les diagonales sont éclairées à gauche (lumière liée à la
  caméra pour create_object_pro_flash — l'inverse des objets 8 directions, éclairés par
  leur façade). Vues SE / NE / NW converties comme le sprite en jeu (moitié de la source,
  image_to_pixelart fidèle) puis ramenées à SA palette : `<variante>-fr/-bl/-br.png`.
  S = sprite d'origine ; E = façade à droite ; N/W = le dos. Insula de brique et maison
  à cour (une seule vue) → insula2 / domus hors du sud ; la taberna « façade à droite »
  sortait de face → domus à l'est. Échelle et poussé vers la rue : ceux des maisons (le
  poussé et la façade désignent le même côté, ordre S, E, W, N d'isoBuildingFront).
  Reste à faire : fenêtres de nuit des vues tournées (houseWindowsData, à relever).
- 2026-10-04 (I6 bis — Raph : « vas-y pour les îlots longs le long des axes et il faut
  un mélange mitoyen et ce qu'on a déjà. Avoir plein de fois le même bâtiment qui a
  l'air d'un grand bâtiment rend mal ») :
  - ÎLOTS LONGS : les îlots qui bordent le decumanus se marient deux à deux le long de X,
    ceux du cardo le long de Y (`gridOf({ merge })`, la rue qui les séparait devient de
    l'îlot) ; les quatre du croisement restent carrés (forum).
  - LE MÉLANGE : un côté d'îlot sur deux (tirage par îlot + côté), et les grands côtés
    des îlots longs, sont des RANGÉES MITOYENNES (`t.terrace`, `pixelHouses.rowGeom`) ;
    les autres gardent les romaines existantes tournées vers leur rue. Les mitoyennes
    sont revenues REPEINTES dans la palette des maisons qu'elles remplacent (échoppe,
    domus, maison à cour → popina, insula) : plus de ton orange qui dénote. Bout de
    rangée (`rowEnd`) = le voisin de devant n'est pas une rangée → insula.
  - LES ATELIERS DANS LA RANGÉE : une annexe de bâtiment-moteur (22 par type dans la
    démo, la scène de la halle en réduction — les « petits temples blancs ») devient une
    boutique de la rue : lot d'une case, corps de maison (`t.body` : échoppe ×2, domus,
    maison à cour). La halle reste le seul monument de son métier. Gardent leur dessin :
    ateliers des guildes et points d'eau (`ILOT_ANNEX_OWN_ART`). Molette `__annexBody`.
  - La demande de lots compte les GRANDS LOGIS (villa 2×2 = 2 à 3 lots) : sans ça, 48
    maisons-moteur achetées restaient sans lot (la marge venait, sans le dire, des
    annexes 2×2 comptées 4 lots). `ILOT_BIG_HOME_EXTRA = 0,2`.
  - Halles plafonnées à 3×3 dans un îlot (`ILOT_HALL_MAX`) : à 4×4 la halle prenait
    l'îlot entier, petit temple sur parvis vide (Ministères au dernier palier).
  - Test : `ilotLayout.test.js` (part de rangées, côtés d'un seul tenant, bouts de
    rangée, annexes en boutiques).
  - FENÊTRES DE NUIT des 10 dessins de rangée, relevées à la main (houseWindowsData.js,
    clés `row-*`) : échoppe et domus 2, popina 1, insula 13-14 sur ses deux faces ; étals,
    comptoirs, portiques, portes, arcades et balcon éteints (garde dans
    houseWindows.test.js). Vérifié en jeu de nuit (`.preview-shots/rangees-gros-nuit.png`).
  - Puis les 8 vues TOURNÉES (`domus-fr/bl/br`, `taberna-bl/br`, `insula2-fr/bl/br`),
    même méthode : 2 à 6 fenêtres chacune, volets clos des échoppes allumés (verdict de
    Raph sur la maison de ville), portes, porche, fente de l'atrium et rambarde éteints.
    Doutes tranchés seul : la baie de l'insula « fr » au-dessus de sa rambarde = allumée
    (comme la fenêtre haute du dessin d'origine) ; la marque de 2 px sous l'avant-toit du
    domus « fr » = éteinte ; la face noire de l'échoppe « bl » = éteinte. Vérifié en jeu
    (`.preview-shots/tournees-nuit.png`).
- 2026-10-04 (nuit, I7 — Raph : « une ère à la fois, commit après chacune, fais-les
  toutes ») :
  - Le code se décline par âge : `map/ilotArt.js` (bandes en îlots, corps des boutiques,
    vues tournées, rangées, ateliers qui gardent leur dessin). Un âge sans art dédié
    retombe sur ses maisons d'origine, poussées vers la rue.
  - La demande de lots compte les GRANDS LOGIS tirage par tirage (le tirage des
    variantes est déterministe par numéro de lot) : la part de liste sous-comptait les
    villas d'une cité « rurale » (24 maisons-moteur sans lot).
  - Le pont débouche sur 5 cases de cardo sur l'autre rive (v1 : 2) ; la traversée est
    cherchée au nord comme au sud du cœur (v1 : au sud seulement — « l'autre rive »
    était mal définie quand le fleuve passait au nord).
  - **Fonte (bande 5)** : boutiques = haussmannien (boutique au rez), rangée de brique,
    immeuble ; rangées HAUSSMANNIENNES (objet PixelLab existant à 8 vues, converti à la
    taille d'une unité de rangée) et rangées de BRIQUE (objet neuf, deux maisons sous un
    toit d'ardoise, palette de la rangée ouvrière du jeu) ; haussmannien tourné à l'est.
    Les dos haussmanniens (murs mitoyens presque aveugles, grands pans beiges à
    l'écran) sont écartés : au nord et à l'ouest, la rangée prend les dos de brique.
  - ⚠ PixelLab : une rotation Pro Flash À PARTIR d'un sprite du jeu pris de trois
    quarts échoue (il est lu comme une vue de FACE : vues tournées frontales, chiffres
    incrustés, pixels verts). Passer par un objet à 8 vues généré, puis convertir.
  - **Bourg (bande 3)** : bastide en damier autour de sa place ; boutiques = maison
    artisane (atelier à colombages), maison de pierre, maison de ville ; la maison
    artisane du jeu EST la vue sud-ouest d'un objet PixelLab à 8 vues : ses vues tournées
    sont gratuites ; rangées À COLOMBAGES (objet neuf, deux maisons sous un toit de
    tuiles, rez de pierre et volets d'échoppe, palette de la maison artisane). Fenêtres :
    volets d'échoppe fermés, lucarne, petites fenêtres du rez ; pans de bois éteints.
- ⚠ Fragilité connue, hors îlots : quand le niveau des champs change leur découpage
  (`cmTerroirParcels`), la parcelle 0 qui s'épaissit mord sa propre rangée de moulins
  (distance 1, plus les sentiers qui les desservent) et le terroir entier se refonde
  ailleurs (relevé : 8×2 → 7×3, terroir passé sur l'autre rive). À traiter côté
  terroir (docs/PLAN-TERROIR.md) : rangée de moulins à distance 2, ou parcelles qui
  grandissent vers le large.
