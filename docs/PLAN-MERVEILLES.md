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
