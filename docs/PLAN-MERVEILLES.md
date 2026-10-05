# PLAN-MERVEILLES — les six merveilles refaites (2026-10-01)

Demande de Raph : « on va refaire toutes les merveilles ok? ». Ce plan fait foi ; le
journal (§7) dit où on en est. Même méthode que les ponts (docs/PLAN-PONTS.md).

## 1. Décisions de Raph (2026-10-01)

| Sujet | Décision |
|---|---|
| Quoi | Les 6 merveilles **redessinées** |
| Concepts | Mausolée, Colonne du Million, Aiguille Céleste, Œil de la Singularité **gardés** (l'Œil devient un vrai monument) ; Couronne de Pierre → **Le Palais de la Couronne** ; Arc de Triomphe → **La Cathédrale Inachevée** |
| Méthode | **Comme le pont** : construites par le code (pierre, lumière, grain de la ville), pièces dessinées pour les détails |
| Évolution | **Rangs + matière de l'ère** : la merveille grandit à chaque rang ET prend la matière de l'ère de la ville |
| Autour | **Un vrai lieu** propre à chaque merveille |
| Hors champ | La Maison des Plaisirs |

Règles globales : lumière haut-gauche, UNE ombre solaire, reflets, grain du sol, une seule
main (la pierre de l'ère est celle des quais et du pont), toise habitant 7-8 px.

## 2. Ce qui est gardé

Les métriques et les rangs (CM_WONDERS : cycles, Rayonnement, ère, achats, temps de jeu,
mythes), les emplacements (slots, l'Aiguille dans le fleuve), la réérection par ère
(`reEra`), la foule qui s'attroupe, les noms (sauf les deux concepts changés).

## 3. Les six merveilles

| Merveille | I | II | III | IV | V |
|---|---|---|---|---|---|
| **Grand Mausolée** (cycles) | tumulus et dolmen | mastaba à escalier | pyramide à degrés, chapelle haute | allée processionnelle de statues, obélisques | mausolée couronné d'un temple et d'un quadrige |
| **Colonne du Million** (Rayonnement) | stèle sur socle | colonne sur podium | colonne à statue, quatre colonnettes | exèdre à colonnade derrière | colonne monumentale à relief en spirale, statue dorée, torchères |
| **Palais de la Couronne** (ère) | donjon à bannières | château : courtines, tours | palais à cour et coupole | ailes, grand escalier, parterres | cité palatiale : dômes, tours, toits d'or |
| **Cathédrale Inachevée** (achats) | fondations, chapelle, grue | nef qui monte, contreforts, échafaudages | nef couverte, une tour à moitié | deux tours, arcs-boutants, rosace | flèches achevées — une dernière grue, pour l'éternité |
| **Aiguille Céleste** (temps de jeu, dans le fleuve) | phare de bois sur un rocher | tour de pierre à lanterne | grand phare à galerie | aiguille à galeries étagées | flèche céleste, faisceau vers le ciel la nuit |
| **Œil de la Singularité** (mythes) | disque poli dressé dans un cercle de pierres | observatoire à coupole et lentille | anneaux-gyroscope autour d'une sphère | temple-observatoire à anneaux concentriques | porte-anneau colossale, l'œil au centre, anneaux en orbite |

## 4. La matière de l'ère

Chaque merveille lit le kit de l'ère de la ville (palettes partagées avec le pont) : pierre
brute → pierre taillée → marbre → fonte et bronze → béton et verre → lumière. Les grues, les
toits, les lanternes changent avec elle (grue à roue → grue à vapeur → grue à tour).

## 5. Le lieu

Parvis dessiné dans le dallage de l'ère, propre à chaque merveille : allée de statues et
cyprès (Mausolée), place à fontaines (Colonne), parterres et grilles (Palais), chantier
vivant avec pierres et charrettes (Cathédrale), îlot rocheux et jetée (Aiguille), place
circulaire à anneaux incrustés (Œil). Foule, lumières la nuit, drapeaux.

## 6. Pilote, puis déroulé

1. Mutualiser le peintre du pont (primitives iso) pour les merveilles.
2. Pilote **bande 4** : les six, rangs I, III et V, avec leur lieu → planche pour Raph.
3. Les autres ères (matières), la nuit, les surcouches animées.

## 7. Journal

- 2026-10-01 : décisions de Raph, concepts choisis, plan écrit.
- 2026-10-02 : **pilote bande 4 en jeu, les six, rangs I à V, avec leur lieu** (planches
  `.preview-shots/merveilles/pilote-b4-a.png` et `-b.png`, rangs I / III / V). Rien de commité.
  - `iso/isoPixelPaint.js` : primitives du pont mises en commun (déplacement pur, octets
    identiques). `iso/isoProps.js` : flammes, statues, braseros, réverbères, lueurs du pont,
    partagés (déplacement pur ; seul ajout : phase de flamme négative admise).
  - `iso/wonderBake.js` : peintre (boîte, facette orientée, solide de révolution éclairé
    par sa vraie normale, anneau 3D, disque, bandeau courbe, escalier, créneaux,
    échafaudage, grue de l'ère) + les six recettes. ⚠ le `mod` d'isoPixelPaint arrondit à
    l'entier : ici `fm` (modulo réel). ⚠ un cercle vertical se lit COUCHÉ (l'horizontale
    est étirée de √2) : `PLANE_ROUND` / `vdisc` étirent la verticale d'autant.
  - `iso/wonderKits.js` : matière de l'ère (pierre du pont, métal, toit, verre, gazon,
    bannière ; face à l'ombre un cran plus sombre que le pont).
  - `iso/wonderPlace.js` : le lieu — sol cuit DANS le parvis (`setWonderPlacePainter`,
    isoWonderGround) sur le carré pavé (`L.wonderPaveR`, sinon demi-socle + 1,5 case) ;
    décor en relief trié avec la foule (cyprès, fontaines, ifs, blocs, bois, obélisques).
  - `iso/isoWonder.js` : runtime — cuisson par merveille × rang × ère, tranches de 8 px
    triées au bord avant du socle, ombre + reflet une fois (pas de reflet pour l'Aiguille,
    son îlot est entre elle et l'eau), objets, érection par le bas, survol. A/B
    `__wonderTune.on = false` (ancien sprite), `__wonderTune.band = n` (matière forcée).
  - Planche hors jeu : `node wsheet2.mjs out.png <id> <bandes> <rangs>` (scratchpad).
  - Restaient : noms, autres ères, nuit, surcouches animées, retrait de l'ancien rendu,
    tests — tout fait le jour même, cf. entrée suivante.
- 2026-10-02 (suite) : Raph — « fais toutes les ères et règle ce qu'il faut régler. Va au
  max ». **Fait, rien de commité** (attend « pousse ») :
  - **Noms** : « Le Palais de la Couronne », « La Cathédrale Inachevée » (CM_WONDERS,
    layout.js — accord de la session des routes ; au commit, n'indexer QUE nos hunks de
    layout.js : le port y a les siens, vers les lignes 23, 3247 et 5067).
  - **Toutes les ères** : la matière se lit, pas seulement la teinte (§8) ; vérifié en jeu
    dans de vraies villes de chaque ère où chaque merveille peut se dresser (reEra).
  - **Nuit** : vitres et vitraux allumés (une sur trois reste noire), lanternes, iris,
    filets lumineux cosmiques — calque de lumière, déposé tranche par tranche.
  - **Hiver** : neige sur les dessus et les pans au soleil, pelouses et cyprès enneigés.
  - **Animé** : anneaux de l'Œil en orbite (cœur cuit à part, 32 images), jets d'eau des
    fontaines, balise d'aviation clignotante (néon+), halo cosmique qui flotte.
  - **Le grand carré pâle** : là où le sol pave toute l'emprise (hors structure de ville,
    aperçu `__showWonder`), l'anneau autour du lieu devient un JARDIN (pelouse, allées en
    croix, haie, arbres, ifs). En structure de ville il reste la pelouse de `townGreen`.
  - **Retraits** : `renderBuildings.js` (ancien drawWonder et son repli procédural), les
    sprites « de face » de `public/pixelart/wonders/` (seul `plaisirs-t3.png` reste, la
    Maison des Plaisirs), `scripts/wonders/` ; tests adaptés (ancrage de l'emprise sur les
    monuments cuits, garde WONDER_PPT sur layout.js) + `wonderBake.test.js` (9 tests).

- 2026-10-02 (soir) : Raph — « revois l'îlot de l'aiguille pour avoir un truc plus
  imposant et marquant ». **L'îlot est CONSTRUIT** (`iso/wonderIsle.js`), sans toucher à
  la forme du fuseau creusé par layout.js (bras, écume, obstacles des bateaux intacts) :
  une acropole qui MONTE vers l'Aiguille, en gradins elliptiques (2 à 4 selon le rang),
  quai à voûtes de hangars à barques, grand escalier d'une seule montée depuis un quai
  bas d'accostage, colonnade (IV+), bastions aux pointes (III+) devenus tours de feu
  vitrées (V), cyprès, obélisques, statues en haut de l'escalier, feux sur chaque gradin ;
  rang I : rocher gazonné en paliers, phare de bois, ponton. L'Aiguille est RECENTRÉE sur
  l'île (elle tenait au slot, souvent décalé) et posée sur l'esplanade (`bakeNeedle(...,
  { lift })`, socle de pierre). Seuls le mur du quai et les rochers se reflètent (le dessus
  reflété faisait une traînée claire). Les bateaux qui passent devant l'île sont redessinés
  après elle (`sh._hull`, le même relevé que le pont). Les buissons ISLAND_DECO sont coupés
  quand la merveille dessine l'îlot (`CM.wonderIsle`, accord de la session du fleuve).
  Vérifié en jeu ères 3 à 9, jour et nuit (`.preview-shots/merveilles/ilot-*.png`).
  ⚠ Au commit : `sh._hull` est posé par isoPort.js, dont la version en cours appartient à
  la session des bateaux — sans ces lignes, pont et îlot ne redessinent simplement pas
  les bateaux (aucune casse).

- 2026-10-03 : Raph, sur capture du Mausolée rang I — « du rendu un peu cheap, on n'a pas
  assez le côté pixel art maintenant que c'est en code » ; « les barrières ne sont pas
  bonnes (design et sens) et elles ferment l'entrée » ; « valable pour toutes ». Fait :
  - **Finition pixel-art** (`pixelFinish`, wonderBake.js) sur toute image cuite
    (monuments, cœur de l'Œil, décor, îlot, enceinte) : contour sélectif (la couleur du
    bord assombrie, plus à droite qu'en haut, au lieu d'un trait d'encre uniforme),
    reflet de bord haut/gauche et ombre de bord droit, grain en grappes, ombres vers le
    bleu et lumières vers l'ocre. N'altère pas l'alpha (marqueurs de nuit intacts).
  - **Matières** : pierre de taille biseautée bloc par bloc (arête au soleil, joint
    d'ombre, éclats) ; toits en TUILES (rangs, joints décalés, lèvre claire) ; dessus en
    grandes dalles ; tramage en damier aux transitions de lumière des volumes courbes ;
    gazon des tertres aux verts de la tuile d'herbe du jeu, en touffes.
  - **Le lieu** : dalles nuancées à arête au soleil, mousse rare dans les joints anciens ;
    les pelouses, parterres et le jardin sont l'HERBE DU JEU (tuile iso-grass posée sous
    le lieu, le raster y est transparent) semée de fleurs, bordées de pierre ; buis
    taillés à dessus clair.
  - **Enceinte de la merveille** (wonderPlace.js `enclosure`) à la place de la clôture
    générique des parvis (`FENCE.wonders = false`, fenceEdges.js — mécanique gardée et
    testée l'option allumée) : pierres sèches (b0-1), muret (b2-3), balustrade (b4),
    grille de fonte à pointes dorées (b5), garde-corps de tubes (b6), verre et filet de
    lumière (b7+). Modules courts triés à leur pied, piliers de porte (flamme ou
    lueur), bornes d'angle ; PORTES au milieu de chaque côté (largeur de l'allée) et
    partout où une rue touche l'enceinte. Elle borde le jardin quand il y en a un,
    sinon le lieu.
  - Tests : fenceEdges et tissuMetrics adaptés (défaut livré sans merveilles).
    Planches `.preview-shots/merveilles/finition-pixel.png`, `enceintes-par-ere.png`.

- 2026-10-03 (suite) : Raph — Colonne : « retirer la fontaine et le mât à droite, ne garder
  que les deux de devant » ; Palais : « il n'y a pas d'entrée dans le bâtiment ? ».
  - Colonne : une seule colonnette/torchère hors de la face sud retirée (celle de l'est
    traversait l'exèdre) ; fontaines du lieu réduites aux deux du côté sud.
  - Palais : `portal()` (wonderBake.js) — baie en plein cintre, encadrement de marbre,
    deux vantaux (bois, verre dès le néon), imposte vitrée qui s'allume la nuit.
    Avant-corps approfondi, portail posé sur la terrasse du grand escalier (IV+, sinon
    la terrasse le mangeait), deux colonnes et un linteau ; perron au rang III ; portes
    au pied des pavillons (IV+) ou des ailes (III) ; grille de la cour OUVERTE au milieu
    (vantaux rabattus) ; allée dégagée entre les parterres.
    Planche `.preview-shots/merveilles/entrees.png`.

- 2026-10-03 (suite) : Raph — « le système de lumière ne remplit pas les fenêtres en
  entier ». Cause : `nightOf` tirait « allumée / éteinte » par pavé de 4 × 8 px, une
  vitre à cheval sur deux pavés s'allumait à moitié. Désormais par TACHE connexe de
  pixels marqués (une vitre = un tirage), rangée du haut un peu plus chaude, appui un
  peu plus sombre ; dépôt dans le calque de lumière sans lissage. Test « chaque vitre
  d'un bloc, où qu'elle tombe » (wonderBake.test.js). Planche
  `.preview-shots/merveilles/fenetres-nuit.png`.

- 2026-10-03 (suite) : « tu l'as fait pour tous les bâtiments ? » — étendu hors merveilles :
  la Maison des Plaisirs (`plaisirsBake.nightLayer`, même défaut, délègue à `nightOf` ;
  sa session garde le changement) ; maisons et bâtiments-moteur (`houseWindows.windowPixels`,
  aussi lu par `sceneWindows.js`) : le seuil ne prenait que le cœur sombre d'une vitre
  (un « L » d'un pixel) → `fillPane` complète chaque tache dans son rectangle (+1 px si la
  ligne voisine est sombre aux deux tiers), pixels plus sombres que le mi-chemin cœur/mur,
  jamais au-delà (balcon, bandeau non allumés). Le verre nommé (bande 6) et la teinte
  cosmique (sceneEmissive) allumaient déjà tout le verre. Test houseWindows. Planche
  `.preview-shots/merveilles/fenetres-maisons-avant-apres.png`.

- 2026-10-03 (suite) : Raph — « attention tu allumes des portes et des étals plutôt que des
  fenêtres ». Le complément de vitre partait parfois du trait sombre d'une porte et la
  remplissait. `houseWindows.windowPixels` : toute tache dont le bas arrive à 8 px ou moins
  du pied de la façade (dernier pixel opaque de la colonne) reste éteinte — portes (≤ 3 px
  avec le seuil), boutiques sous arcade (insula), vides de portique (villa), devantures
  (4-8 px) : seuls les étages s'allument ; `SHOP_GAP.taberna = 12` pour l'étal posé sur
  son comptoir. Une vitre complétée qui sort des mesures d'une vitre revient à sa tache
  d'origine. Tests houseWindows (portes, étals, rez-de-chaussée). Planche
  `.preview-shots/merveilles/fenetres-sans-portes.png`.

- 2026-10-04 : Raph, sur capture de l'îlot de l'Aiguille au rang I — « tu me la fais bien
  en pixel art l'île ? et tu peux faire en sorte qu'il y ait de l'écume sur les rochers
  autour ? ». Le gazon était tiré de l'angle autour du centre (veines de bois en éventail),
  les gradins de roche faisaient des arcs beiges, les rochers étaient des œufs lisses.
  - **Rang I** (wonderIsle.js `naturalBody`, `isleGround`) : le corps de l'île est un
    RELIEF lancé au rayon — plage qui monte de l'eau, prairie bosselée, colline dont le
    sommet plat (M.top) porte le rocher de l'Aiguille — éclairé par sa pente, tramage
    étroit. Gazon aux verts de la tuile d'herbe, en BRINS verticaux ; fleurs rares ; plage
    au sable des berges, liseré mouillé, galets ; sentier en lacets (Catmull-Rom) du
    ponton de bois au rocher, trace dans le sable ; blocs à demi enterrés dans la prairie.
    Arbres = sprites de la ville (`drawIsleTree`, isoWonder.js ; l'arbre cuit en repli).
    Le feu sur un gros rocher au large de la pointe aval (`M.lampRock`).
  - **Rochers, tous rangs** : `boulder` (wonderBake.js) — granite taillé (rayon bosselé,
    facettes en pans et étages, bande mouillée, mousse en taches, neige), répartis à pas
    réguliers le long du rivage (gros, moyens, galets), dégagés du débarcadère. Le rocher
    du rang I de l'Aiguille est le même (sommet coupé en plateau pour la tour).
  - **Écume** (`bakeFoam` + `paintFoam`) : seulement sur l'eau (pixel vide de la base) et
    sur le bas de la roche encore visible (`own`). Collerette qui gonfle et rejaillit,
    puis dentelle qui se détache ; fond permanent, plus fort en amont.
    Retour de Raph le même jour — « l'écume arrive sur les cailloux au même moment et on
    dirait que ça lag » : la première version cuisait 10 images pour toute la houle
    (3 images/s, tous les rochers basculant ensemble). Désormais on ne cuit que les pixels
    candidats ; `paintFoam(F, t)` les allume pour l'instant t, chaque rocher avec SA
    période (3,4 s ± 18 %) et SA phase ; isoWonder repeint un seul canvas tous les
    FOAM_STEP = 80 ms (~0,15 ms de calcul).
  - Même jour, « fais les remous sur le ponton et sur tous les pontons » : **`iso/waterRipples.js`**
    — au contact d'un ouvrage et de l'eau, un liseré qui clapote (deux rangs, déchiré), des
    rides qui partent du contact et s'élargissent en s'effaçant (deux par houle de 2,6 s), un
    sillage vers l'aval derrière chaque pieu. Même principe que l'écume : `rippleField`
    (pixels candidats, une fois) + `paintRipples(F, t)` + un canvas repeint tous les 80 ms.
    Le ponton de l'îlot a désormais une rangée de pieux de chaque côté (ses remous, sur l'eau
    que la base laisse voir) ; aux rangs II+, le quai bas d'accostage. Les AUTRES ouvrages
    notent leurs remous en se peignant (`noteRipples`) et la passe des remous
    (`waterRipplesPass.drawIsoRipples`, isoRenderer, juste après l'eau et AVANT quais, ports,
    bateaux et passe vivante) les peint à l'image suivante — tout ce qui vient ensuite les
    recouvre où il faut : appontement du port (pieux et môle, `isoPier.pierRipples`, sur l'eau
    du ruban seulement), embarcadères du bac et de la navette (`boatScenes.landingRipples` :
    tour du tablier flottant, enfoncé à l'altitude de l'eau ; pieds des pieux), Vieux-Port
    (ponton du fond, pannes, paliers au ras de l'eau, `isoOldPort.oldPortRipples`, à
    l'altitude du bassin, sans découpe au ruban). Puis « fais aussi le débarcadère des
    Plaisirs » : son habillage PixelLab n'a pas la géométrie du code, on la MESURE sur l'image
    cuite — chaque pixel porte sa hauteur au-dessus de l'eau ; le bas de la silhouette au ras
    de l'eau (H < 1,5 : marches qui plongent, ponton, pieux) devient une rangée de petits pieux
    (`isoPlaisirs.plaisirsRipples`, champ dans le repère du lieu, `wx/wy` dans le registre).
    Planches `.preview-shots/remous-*.png`.
  - Cuisson ~150-220 ms une fois (contre ~100). Planches `.preview-shots/ilot-pixel-ete-e.png`,
    `ilot-zoom3-amont.png`, `ilot-zoom3-aval.png`, `ilot-hiver.png`, `ilot-rang2.png`.

## 8. Comment c'est construit (notice)

- **Repère** : x est, y sud, origine au centre de la case du slot ; socle carré de côté
  `cmWonderBaseTiles × T` centré, hauteur au plus `cmWonderHeightTiles × T` — la table
  `WONDER_SPRITE_TIERS` de layout.js reste le contrat de l'emprise.
- **wonderBake.js** — primitives : `box`, `facet` (normale orientée, culling, couleur par
  la lumière `lum`), `pyramid`, `frustum`, `gable`, `hip`, `revolve` (solide de révolution
  par lancer de rayon, vraie normale — tours, fûts, coupoles, sphères, flèches ; `facets`
  pour un octogone), `ring3d`, `vdisc`, `arcBand`, `stairs`, `crenels`, `walls`,
  `scaffold`, `crane`, `column`, `obelisk`, `menhirs`. Lumière : `band5(I)` 0 (dessus) →
  4 (ombre). Matières (`mats`) : mur de l'ère (`wallAt`), marbre 5 crans, neige, vitres
  marquées alpha 254 et lumières alpha 253 → `finish` en tire le calque de nuit `N`.
- **wonderKits.js** — par bande : pierre (celle du pont ; teintée de la lumière de l'ère
  aux âges cosmiques), métal, toit, verre, vitres, lumière de nuit, mur
  (`rough` feu-bois, `ashlar` pierre-couronne-marbre, `brick` fonte, `panel` néon, `tech`
  cosmiques), grue, planche des statues. `wonderKitForBand(band, winter)`.
- **wonderPlace.js** — `placePlan` (sol + décor + objets du lieu), `gardenPlan` (anneau),
  `bakePlaceGround`, `bakeDecor` (cyprès, if, arbre, fontaine, blocs, bois, obélisque).
- **isoWonder.js** — cuisson en cache (merveille × rang × bande × hiver), tranches de 8 px
  triées au bord avant du socle, ombre + reflet une fois, nuit par tranche, objets, cœur
  animé, lieu peint dans la fournée du sol (`setWonderPlacePainter`), survol (boîte
  d'encre). Molettes : `__wonderTune.band`, `__wonderBakes()`, `__wonderPlaces()`.
- ⚠ Pièges : le `mod` d'isoPixelPaint arrondit à l'entier (→ `fm`) ; un cercle vertical se
  lit couché (→ `PLANE_ROUND`) ; un objet est peint après tout le monument (→ bords avant
  et sommets seulement) ; le cœur de l'Œil n'est pas dans le raster (boîte de survol
  élargie à la main).
