# La Maison des Plaisirs

## ⭐ REFONTE DU 2026-10-02 — cette section fait foi, le reste est l'historique

Demande de Raph : « on revoit tout le bâtiment des plaisirs ? le design plus raccord,
progressif avec le temps, ainsi que son intérieur, les jeux, les visuels, et le rendu ».

### Constat (mesuré le 2026-10-02)

- Les jeux ouvrent à l'**Ère II** (osselets, tickets) et à l'**Ère III** (vingt-et-un, Icare),
  soit encore la bande 0 (campement). Le monument, lui, n'apparaît qu'en **bande 6** (Néon,
  ère ~30) : le joueur joue ~25 ères dans un lieu absent de sa carte.
- Le seul objet hors DA : un sprite violet/magenta de nuit (`plaisirs-t3.png`) dans une
  maquette de jour dont les merveilles, ponts, quais et bateaux sont désormais **dessinés par
  le code** dans la matière de l'ère.
- La salle (`ui/plaisirs/salle.png`) est une illustration fixe néon, la même à tous les âges.
- Les jeux s'ouvrent dans une boîte sombre générique posée sur l'image ; à 1440 px le menu
  volant recouvre la première mise ; osselets = 4 carrés à glyphe ; textes « Quitter le
  temple », « cagnotte du temple ».

### Décisions de Raph (2026-10-02)

| Sujet | Décision |
|---|---|
| Bâtiment | **Un ADN, 10 âges** : une seule famille reconnaissable partout (sur l'eau, plateaux autour d'un fût, lanternes rouges, dais en pétales) ; chaque jeu ajoute son pavillon, chaque âge change la matière |
| Méthode | **Par le code**, même main que les merveilles (`wonderBake.js`, `wonderKits.js`) |
| Intérieur | **Dessiné par le code** : la salle = le lieu vu de près, change avec l'âge et les jeux, habitants aux tables, jour/nuit de la carte, on clique les tables |
| Jeux | **Refaits, suivant l'âge** : la partie se joue sur la table du décor ; le matériel suit l'âge ; **règles et équilibrage inchangés** |

Par défaut (annoncé, sans objection) : placement au large **inchangé** (marche, domaine,
aura) ; le lieu **apparaît avec l'onglet** (Ère II) au lieu de la bande 6 ; pilote bande 4
→ planche → autres âges, nuit, hiver.

### L'ADN, âge par âge

| Bande | Âge | Le lieu |
|---|---|---|
| 0 | Feu | radeau amarré à un rocher, feu, joueurs d'osselets, torches, peaux tendues |
| 1 | Bois | maison sur pilotis à galerie, toile tendue, lampions |
| 2 | Pierre taillée | pavillon sur îlot maçonné, portique, braseros |
| 3 | Couronne | palais des jeux au grand masque, toits en étages, bannières |
| 4 | Marbre | rotonde à colonnade, dôme doré, vélums rouges, vasques |
| 5 | Fonte | kiosque de fonte et verre, roue à aubes, globes de gaz |
| 6 | Néon | la tour-fleur, refaite dans la DA de la carte, enseignes |
| 7-9 | Cosmiques | plateaux en lévitation, passerelles de lumière |

Icare a sa plateforme d'envol au sommet (perchoir, ballon, mât selon l'âge).

### Phases

1. **Bâtiment sur la carte** — pilote bande 4 (+ repères bandes 0 et 6), planche, puis tous
   les âges, nuit, hiver ; apparition à l'Ère II ; retrait de `plaisirs-t3.png`.
2. **Intérieur par le code** — la salle vue de près, tables cliquables, habitants.
3. **Jeux** — chaque jeu sur sa table, matériel de l'âge.
4. **Nettoyage** — textes « temple », menu qui recouvre, retrait de `salle.png`.

### Journal

- 2026-10-02 : constat, décisions de Raph, plan.
- 2026-10-03 : **pilote en jeu, trois repères de l'ADN** — Feu (radeau, Ère II puis III),
  Marbre (rotonde en pièce montée), Néon (tour-fleur en éventail) ; jour et nuit. Planche
  `.preview-shots/plaisirs/planche-pilote.png`. Rien de commité ; verdict DA attendu.
  - `iso/plaisirsBake.js` (pur) : pièces de l'ADN (`petalValance`, `lanternGarland`,
    `stripedCone`, `petalPlate`), pavillons des jeux, recettes `bakeFeu` / `bakeMarbre` /
    `bakeNeon` ; les autres bandes retombent sur le Marbre (`plaisirsRecipeBand`) ;
    `plaisirsGames(s)` = pavillons selon les jeux ouverts.
  - `iso/isoPlaisirs.js` : le sprite `plaisirs-t3.png` n'est plus lu ; cuisson en cache
    (âge × jeux × hiver), TRANCHES triées au bord avant d'un pied rond (comme les
    merveilles), ombre + reflet, calque de nuit, survol/clic au pixel du raster ; aura à la
    couleur de l'âge, faisceaux seulement dès le Néon, lâcher de lanternes dès le Bois.
    Molettes : `__plaisirsTune.band = n`, `__plaisirsBakes()`.
  - `layout.js` : `PLAISIRS_REVEAL_BAND` (6) → `PLAISIRS_OPEN_ERA` (2), lu sur la meilleure
    ère (`counts.plaisirsOpen`) ; obstacle des bateaux 2,6 → 3,1 tuiles (pied de 2,8).
  - Test `map/__tests__/plaisirsBake.test.js` : pavillons ↔ verrous des jeux, seuil
    d'apparition = premier jeu ouvert, chaque âge cuit (jour/hiver), le lieu grandit.
    ⚠ Il a trouvé les AILES d'Icare jamais peintes (facette dos à l'œil : le point
    intérieur doit être derrière le plan, x + y < 0) et le radeau sans lumière de nuit.
  - ⚠ Dépend des modules NON SUIVIS de la session merveilles (`wonderBake.js`,
    `wonderKits.js`, `isoPixelPaint.js`, `isoProps.js`) : committer après eux.
- 2026-10-03 (suite) : **Raph valide le pilote** (« oui ça me va, juste le reflet feu est
  trop grand. Enchaîne le reste »).
  - **Reflet et ombre exacts** : le reflet générique retourne chaque colonne autour de son
    pixel le plus bas — le pont plat du radeau se reflétait comme s'il était dressé. La
    cuisson relève désormais la HAUTEUR de chaque pixel (enveloppes de `revolve`, `box`,
    `facet` qui notent dans `R.hb` ; le reste complété par colonne, `heightsOf`) ; le
    miroir (`plaisirsMirror`, un pixel de hauteur h tombe 2h plus bas, le plus proche
    l'emporte) passe par `isoReflect.noteReflectionImage`, l'ombre (`plaisirsShadow`) par
    `drawSunShadowPlane`.
  - **Phase 1 terminée : les dix âges** — Bois (pilotis, galerie de chaume, toile rayée,
    embarcadère), Pierre taillée (îlot et podium, portique à fronton, braseros, toit de
    tuiles), Couronne (îlot à merlons, donjon au GRAND MASQUE d'or, toits d'ardoise en
    étages, bannières, tente de tournoi), Fonte (ponton sur colonnettes, ROUE À AUBES,
    rotonde de verre et de fonte, globes de gaz, Icare = BALLON captif), cosmiques 7-9
    (disque en lévitation, colonne de lumière, plateaux-pétales flottants, passerelles,
    nacelles de cristal, anneaux en 8-9, halo). Squelette commun `tiered()` (socle, fût par
    tronçons, plateaux, festons, couronne). Planches `planche-10-ages.png` et
    `planche-10-ages-nuit.png`. Test : le lieu ne baisse jamais d'un âge à l'autre.
  - `plaisirs-t3.png` retiré. Molette `__plaisirsTune.band` (les bandes 8-9 ne
    s'atteignent pas par la seule population : palier majeur).
- 2026-10-03 : **phase 2 — la salle peinte par le code** (`iso/plaisirsSalle.js`, pur ;
  `views/plaisirs/SalleCanvas.jsx` + `salleBake.js`). La terrasse du lieu en gros plan, à
  l'échelle de la carte (habitant 7-8 px), agrandie d'un facteur ENTIER : au fond le fût de
  l'âge qui monte hors cadre, l'auvent festonné de son premier plateau, des guirlandes
  tendues vers les mâts du bord ; une table par lieu (osselets/roulette, vingt-et-un,
  guichet des tickets, boutique, scène au rideau ouvert, ponton d'Icare avec l'engin de
  l'âge : plumes, ailes, ballon, deltaplane, lumière) ; l'eau aux coins. Figurants = les
  VRAIS habitants de l'âge (`agentSetForBand` + `drawNamedAgentIso`), deux promeneurs
  animés. Nuit à l'heure murale (même courbe que la carte, dont la boucle s'arrête hors de
  la Cité). Survol/clic AU PIXEL (la cuisson rend un numéro de table par pixel, relevé par
  différence d'image avant/après chaque table) ; liseré d'or sur la table allumée ; zones
  invisibles au clavier ; le bouton d'action en deux temps est conservé, posé sur l'ancre
  cuite. Le cadre cuit (900 × 400) déborde : le canevas remplit le cadre, la zone des
  tables (`SALLE_CONTENT`) tient au facteur entier le plus grand, centrée à droite du menu
  volant. Captures `mdp-salle-*`, planches `salle-planche-1/2.png`. Test
  `plaisirsSalle.test.js`. Porte de dev `__salleForce()` (volet masqué : rAF gelé).
- 2026-10-03 : **phase 3 — les jeux sur la table de l'âge** (`components/ui/plaisirsMaterial.js`,
  règles et équilibrage INCHANGÉS) :
  - le panneau de jeu devient le TAPIS de la table de l'âge (peau, drap, velours, tapis vert,
    tapis de casino, lumière) cerné du REBORD de sa matière (variables CSS `--table-*` posées
    par PlaisirsView, `views-plaisirs.css`) ; le drap violet du vingt-et-un s'y fond ;
    boutons et textes gardent la peau d'interface unique (arbitrage de Raph) ;
  - la salle ZOOME d'un cran sur la table du jeu ouvert et la place au-dessus du tapis
    (`focus`), le panneau est posé bas ;
  - osselets : les OS de Raph (`bones.png`) jusqu'à la Couronne, puis des DÉS VUS DE DESSUS
    (une seule face : « les dés n'ont aucun sens » en 3/4) — ivoire (Marbre, Fonte), casino
    (Néon), lumière de l'ère (cosmiques) ; même planche 6 × 32 px, `--bones-sheet` ;
  - vingt-et-un : cartes de BOIS (Feu → Pierre), de PARCHEMIN (Couronne, Marbre), les
    cartes à jouer du pack (Fonte, Néon), de CRISTAL (cosmiques) ; rang tourné de 180° au
    coin opposé, enseignes 7 × 7 ;
  - Icare : ciel de l'époque (couchant du feu, ciel antique, fumées de la fonte, nuit néon,
    espace) ; Icare jusqu'au Marbre, BALLON captif à la Fonte, DELTAPLANE au Néon, Icare de
    LUMIÈRE ensuite ;
  - tickets : le tapis seulement — les tablettes restent antiques (thème choisi par Raph en
    juillet, mises en oboles/drachmes/talents).
- 2026-10-03 : **phase 4 — nettoyage** : « Quitter le temple » → « Quitter la table »,
  « cagnotte du temple » → « cagnotte de la Maison » (FR/EN, 4 jeux) ; le panneau de jeu se
  décale de la largeur du menu volant (il recouvrait la première mise) ; `salle.png` et les
  coordonnées à la main d'`anchors.js` retirés. Reste : les notes du moteur parlent d'« os »
  même quand ce sont des dés (`regulationActions.js`, `noteFail`), la scène reste inerte
  (pas de banque de sons).
- 2026-10-03 : **retour de Raph sur la salle** — « ça fait cheap ; quel intérêt d'avoir un
  bâtiment de plus en plus grand si tout se passe au rez-de-chaussée ? vérifie la cohérence
  du lieu, accentue le côté pixel art ». Choix : la salle devient la **COUPE du bâtiment, de
  face, par le code** (`iso/plaisirsCoupe.js`, pur ; remplace `plaisirsSalle.js`, retiré
  avec son test) :
  - **un étage par plateau dehors** (`plaisirsProgramme(band)`, niveaux 1-2-2-3-3-2-5-4-5-5
    du Feu au Démiurge) ; les jeux s'y rangent du bas vers le haut, ICARE est le TOIT (sa
    plateforme d'envol au sommet), un SALON (bar, piano) au dernier étage des tours ;
  - **la toise** (le vrai défaut du premier jet) : un habitant fait ~10 px, une salle 24 px
    sous plafond (2,5 habitants), une table arrive à la taille (6 px), un comptoir à la
    poitrine (8 px). Les tables hautes comme les joueurs faisaient « maison de poupée vide » ;
  - **la cage d'escalier** traverse tous les niveaux : échelle (Feu, Bois), escalier
    tournant (Pierre → Marbre), colimaçon de fonte, ascenseur vitré (Néon), colonne de
    lumière (cosmiques). Au bout droit des rotondes ; au CENTRE aux âges des tours, où elle
    EST le fût vitré qu'on voit dehors (niveaux presque égaux, plateaux en pétales qui
    débordent large) ;
  - **du monde, devant et derrière** : joueurs derrière la table (bas du corps caché), sur
    les côtés, et DEVANT, de dos (`front`, peints après l'avant-plan) qui regardent le jeu ;
    un passant par étage qui va d'un lieu à l'autre (`walk`, animé par la vue) ; le portier
    du hall ; le liftier ;
  - **chaque lieu a son ENSEIGNE** (dé, cartes, ticket, bourse, verre ; plaque de la matière
    de l'âge, allumée la nuit dès le gaz), ses lustres, son tapis ; le décor mural de l'âge
    (fourrures, boucliers, tapisseries, pilastres et tableaux, miroirs, néons, glyphes) se
    pose dans les places libres du mur, jamais sous un lustre ni sur une enseigne ;
  - **le HALL** à côté de la cage : deux objets tirés dans le mobilier de l'âge, jamais la
    même paire d'un étage à l'autre (totem, tonneaux, vestiaire, brasero, statue, vasque,
    lunette pour guetter Icare, aquarium, borne d'arcade, juke-box, orbe) ;
  - pixel art : ombres PLEINES (teintes, pas de damier), tramage ordonné réservé aux
    transitions, encre autour de chaque meuble, murs de verre qui laissent voir la ville ;
  - la vue (`SalleCanvas.jsx`) : facteur ENTIER réglé sur la largeur du bâtiment ; quand il
    est plus haut que le cadre, on DÉFILE à la molette, et le lieu choisi vient au milieu ;
    pendant une partie, sa salle se pose JUSTE AU-DESSUS du panneau de jeu, un cran plus
    près. Téléphone : le menu passé sous le cadre ne décale plus la coupe (mesuré : elle se
    tassait à l'échelle 1 dans 60 % de la largeur).
  Test `plaisirsCoupe.test.js` (programme, ancres au pixel, lieux sans chevauchement,
  habitants au sol d'un étage). Planche hors jeu : `node <scratchpad>/csheet.mjs out.png
  0,4,6 3` (CROP=225,495, NIGHT=1) ; planche en jeu `plaisirs/planche-coupe.png`.
  **Reste : la passe pixel art de l'EXTÉRIEUR** (Raph l'a jugé « cheap » aussi).
- 2026-10-03 (soir) : **Raph : « le concept est bon, comment est la vue extérieure ?
  adaptée à la vue de face ? Il faut pousser le concept […] et ajouter le côté luxure qu'on
  n'avait plus, des femmes qui se déplacent en tenue révélatrice. On est sur la maison des
  plaisirs, il faut que ça se voie. »** Constat : non — Marbre 2 étages dehors / 3 dedans,
  Fonte petite rotonde vitrée dehors / grands salons de damas dedans, tours = fût mince à
  plateaux dehors / 5 étages vitrés dedans. Décisions (les 4 recommandations) :
  **un plan, deux vues** ; **pilote puis déroulé** ; **pilote = Fonte** (la maison close
  Belle Époque) ; luxure = **boudoir + spectacle + hôtesses + signes du dehors**. Registre :
  tenues de scène et de cabaret de l'époque (corsets, jupons, fentes, plumes, épaules et
  jambes nues) — suggestif, JAMAIS de nudité ; ce qui se passe derrière la tenture reste
  en ombres chinoises. **PILOTE FONTE FAIT** (planches `plaisirs/planche-pilote-fonte.png`
  et `-detail.png`) :
  - `iso/plaisirsPlan.js` : LE plan (niveaux, lieux, largeurs, ascenseur, moulin, cage au
    centre) ; la coupe le lit ; le BOUDOIR est en haut à tous les âges (on y MONTE) ; la
    Fonte passe à 3 niveaux (jeux / cabaret + vingt-et-un / salons particuliers) ;
  - extérieur de la Fonte TIRÉ DU PLAN (`bakeFonte`) : 3 rotondes de fonte et de verre aux
    diamètres de la coupe (largeur / 6), étages de 24 px ; baies à rideaux de velours
    (les mêmes, en coupe, sur le mur du fond) ; vitres ROSES au boudoir ; OMBRES CHINOISES
    la nuit (`A_SIL` 252 : danseuse jambe levée au cabaret, couple au boudoir) ; verrière
    de verre le jour, allumée en entier la nuit (`A_GLOW` 251, comme en coupe) ; lanternes
    ROUGES ; MOULIN ROUGE sur le pont, ailes à ampoules allumées la nuit ; marquise
    d'entrée et tapis rouge ; plus de pavillons de jeux sur le pont (les jeux sont DEDANS) ;
  - **les filles de la Maison** (`iso/plaisirsCast.js`) : PixelLab v3 size 32, recette FLAT
    de PLAN-VIVANT — `plaisirs-fonte-cancan` (corset noir, jupons rouges, bas noirs ;
    ab523dba-6b58-4aad-9b96-a672ec9a5289, + DANSE cancan sud-est/sud-ouest 9 images),
    `plaisirs-fonte-courtisane` (satin émeraude fendu, boa rose ;
    8477ca75-d29b-41c3-baab-2e7fbb4b47e7), `plaisirs-fonte-chanteuse` (fourreau cramoisi,
    gants blancs ; 9c5274e3-f570-4796-b020-8f53b1e6a995) ; ~22 générations. Bandes :
    `assembleAgentUrls.mjs`, puis la danse `scripts/assembleAgentDance.mjs` + `padStrip.mjs
    48` (la v3 agrandit la toile pour la jambe levée : `danseScale` = 0,71 × 48/32, pieds
    mesurés) ;
  - en coupe : la TROUPE danse le cancan sur l'estrade (type « d »), l'HÔTESSE du hall
    (type « g ») prend un client et le MONTE AU BOUDOIR par l'ASCENSEUR À GRILLE (cabine
    peinte par la vue, pistes datées `courtship` ; sans ascenseur ils disparaissent dans
    l'escalier), ils passent derrière la tenture éclairée où deux silhouettes s'enlacent,
    puis redescendent ; une fille sur deux parmi les passants ; boudoir : alcôve au lit à
    baldaquin, méridienne, miroir en cœur, champagne et lampe rose (halo rose la nuit) ;
  - sur la carte : deux filles font le tour du ponton, une accueille sous la marquise, une
    s'accoude au balcon (`isoPlaisirs.js`, `strollers`). ⚠ Le ponton fait partie des
    TRANCHES du lieu : triées à leur pied, les filles passaient sous la tranche de leur
    colonne → peintes après toutes les tranches qu'elles chevauchent, cachées derrière la
    rotonde.
  Reste (déroulé, après verdict) : les autres âges — plan → extérieur pour chacun, 2-3
  filles + danse par jeu d'habitants (~130 générations), boudoir et scène par âge.
- 2026-10-03 (nuit) : **Raph : « la porte fait cheap. Fais-leur des formes plus
  voluptueuses aux filles, et leurs seins doivent bouger quand elles marchent/dansent. »**
  - L'ENTRÉE refaite : dans la baie de face du rez, double porte d'acajou à panneaux,
    poignées de laiton, chambranle doré, porte ENTREBÂILLÉE (un trait de lumière), imposte
    en éventail allumée ; AUVENT DE THÉÂTRE au-dessus (verrière ambrée `A_GLOW`, bandeau
    cramoisi à traits d'or entre deux rangs d'ampoules, colonnettes) ; deux CANDÉLABRES à
    globes de part et d'autre du tapis rouge. ⚠ Un auvent cache toujours le mur juste
    au-dessous de lui : l'enseigne murale y disparaissait → elle est SUR l'auvent ; un
    premier essai en éventail de verre (Guimard) lisait comme une aile blanche, écarté.
  - LES FILLES redessinées en sablier (poitrine et hanches pleines, décolletés ; toujours
    habillées) : cancan `f6ec6b97-4f02-409a-be70-f6fdd0e88d27`, courtisane
    `5639e3cf-483f-43ab-a117-3c6d52a83b9c`, chanteuse `b10ecb17-9c29-4fb8-9f0d-14ac743050cd`
    (mêmes noms de bandes, les v1 sont remplacées). La marche v3 « déhanchée » essayée
    (3 gén.) DÉRIVAIT (la courtisane change d'orientation en marchant) → marche du gabarit
    + REBOND posé par `scripts/bustBounce.mjs` : la zone du buste descend d'un rang aux
    images d'appui (0, 3) et remonte à l'envol (1, 4) ; à la danse, aux battements (1, 5 /
    3, 7). Nouvelle danse v3 du cancan (jambe plus haute). ~22 générations.
    Aperçu animé ×8 : `plaisirs/filles-fonte.html`. Outils : `zipstrips.cjs` /
    `zipdance.cjs` (scratchpad) quand un zip contient plusieurs animations par direction.
- 2026-10-03 (nuit, suite) : **Raph : « les yeux des personnages ne sont pas beaux et la
  courtisane est illisible. Reprends sur Aseprite directement les sprites : refais les
  yeux, les animations, et les seins encore plus gros, type push-up. »** → les filles
  sont DESSINÉES À LA MAIN : `scripts/plaisirsGirls.mjs` (générateur, `--preview=` /
  `--build`), sources `art/plaisirs/*.aseprite` (Aseprite en ligne de commande, une
  étiquette par animation : marche-se, marche-ne, cancan-se) ; PixelLab abandonné pour
  elles.
  - un CORPS commun en sablier, BUSTE en push-up (12 px de large, trois rangs au-dessus
    du corset, il déborde des épaules), YEUX NETS (trait de cils, blanc et iris, pommettes),
    poings sur les hanches (démarche chaloupée) ; trois TENUES lisibles d'un coup d'œil :
    cancan (chignon auburn, corset noir à dentelle, jupons rouges, bas), courtisane
    (blonde, robe émeraude FENDUE qui s'ouvre sur la jambe au pas, gants d'opéra noirs ;
    le boa, qui la rendait illisible, est retiré), chanteuse (carré noir et plume, sirène
    cramoisie à paillettes, gants blancs) ;
  - le GRÉEMENT (6 images de marche) : le pas soulève le corps d'un pixel, les hanches
    balancent, le BUSTE REBONDIT d'un pixel en retard ; le cancan (8 images) : jupons
    relevés, genou levé, BATTEMENT en diagonale hors de la silhouette ;
  - sud-ouest / nord-ouest = miroirs ; toile 32, semelles à y = 28 → même échelle que les
    habitants (0,71) ; la danse n'est plus rembourrée (`danseScale` = 0,71).
  - ⚠ Pièges : un trait par pièce rayait le buste de barres noires → les pièces du corps
    n'ont PAS de trait, un seul contour de silhouette à la fin (bras et jambe lancée
    gardent le leur) ; une rangée vide entre deux pièces devient un trait noir (le menton
    et les épaules, le buste qui rebondit vers le bas) → les pièces se chevauchent.
- 2026-10-03 (nuit, fin) : **Raph : « c'est bien, go »** → le DÉROULÉ sur les 10 âges.
  - LES FILLES : 24 dessinées par `plaisirsGirls.mjs`, une troupe de trois par jeu
    d'habitants (`iso/plaisirsCast.js`) : Feu/Bois (flamme, chasseresse, sauvage :
    bandeau et fourrure, os, fleur), Pierre/Couronne (gigue, courtisane, dame : corselet
    lacé, chemise, jupes), Marbre (bacchante, hétaïre, danseuse : bandeau d'or, robes
    fendues, laurier), Fonte (le pilote), Néon (revue à coiffe de plumes et résille,
    cocktail, sirène d'or), Jade/Astral/Cristal (même troupe, trois lumières : lumière en
    justaucorps, voile en robe fendue, éclat en mini). Deux danses : BATTEMENT (cancan,
    gigue, revue) et ONDULATION bras levés (flamme, bacchante, lumière).
    ⚠ Le bord des bonnets (T) doit trancher sur la peau : pâle (astral), la danseuse
    semblait torse nu de loin → couleur vive de l'âge. Le halo cosmique se lisait comme
    des épis de cheveux → petit diadème.
  - LE DEHORS de chaque âge compte les étages de sa coupe (`floorsFromPlan`) et reçoit
    `nightLife` (cabaret : danseuse en ombre chinoise derrière une baie sur trois ;
    boudoir : vitres roses et couple enlacé une baie sur deux) et `withDoor` (porte de
    face, entrebâillée, à la matière de l'âge : bois, rustique, néon, cristal). Le Feu :
    tente de peaux aux ouvertures allumées ; le Néon : salons sur plateaux, enseigne de
    danseuse ; les âges cosmiques : salons de cristal sur plateaux flottants. Filles qui
    flânent sur le ponton (`stroll`) à tous les âges.
  - Retour « la fille passe derrière le rideau » (ses souliers dépassaient sous la
    tenture du boudoir) : la tenture descend jusqu'au sol (`y + 3`) et le passant de
    l'étage s'arrête à 16 px de l'alcôve ; seul le couple de l'hôtesse y entre.
  - ⚠ Capture de la coupe après un changement d'âge : les sprites de l'âge se chargent
    en plusieurs secondes → attendre ~10 s (forcer un dessin toutes les 2,5 s) avant le
    `toBlob`, sinon scène vide et spectateurs absents (fausse alerte).
  - Planches : `plaisirs/planche-coupes-10-ages.png`, `plaisirs/planche-exterieurs-ages.png`,
    `plaisirs/filles-toutes.png`. Lint et 2 243 tests verts. RIEN commité.
- 2026-10-03 (nuit, encore) : **Raph : « les intérieurs et extérieurs font très cheap et
  pas pixel art »**. Mesuré : la coupe s'affichait ~5× quand le sprite d'une fille
  s'affichait ~1,8× (décor aux pixels 3× plus gros que les personnages, et filles
  redimensionnées d'un facteur NON entier) ; le lieu de la carte était 2× plus « plat »
  que les sprites de la carte (46-68 % de pixels qui continuent leurs voisins, contre
  24-43 %). Décisions de Raph (les deux recommandations) :
  - INTÉRIEUR « à la main, grille des filles » : `iso/plaisirsCoupeHD.js`, UN PIXEL DE
    COUPE = UN PIXEL DE FILLE (salle 60 px, table 14, comptoir 16 ; largeurs du plan
    ×2,4). Papier peint damassé (motif dessiné, en quinconce), lambris d'acajou à
    panneaux biseautés, cimaise et corniche dorées, parquet à chevrons, flaques de
    lumière TRAMÉES sous chaque lampe, ombres de contact, lustre et appliques à gaz en
    grilles de lettres, meubles en PIÈCES à contour d'encre extérieur (table de dés,
    vingt-et-un en demi-lune, kiosque LOTERIE et guichet à grille, armoire à flacons,
    caisse, scène à toile de fond et feux de rampe, alcôves, méridienne, paravent,
    palmier, statue, vestiaire), cage d'ascenseur ajourée et cabine cuite (deux calques),
    verrière à côtes et ballon d'Icare. Vue : `SalleCanvas` multiplie l'échelle des
    habitants par 32 / (TILE × 0,71 × AGENT_SCALE) → toutes les planches (32 ou 56 px)
    tombent pixel pour pixel. PILOTE : le Fonte seul (`HD_BANDS`), les autres âges
    gardent l'ancienne coupe.
  - EXTÉRIEUR « PixelLab guidé par notre rendu » : le rendu du code (recadré, 220×240,
    remonté à un multiple de 4) envoyé en img2img (`create_image_pixflux`, isométrique,
    fidélité 80 ; à 160 il ne fait que retexturer le gâteau). Sprite détouré (fond gris
    uni + bruit tramé) → `public/pixelart/places/plaisirs-fonte.png`, posé par
    `iso/plaisirsSkin.js` au coin exact du recadrage (`at`) : chaque pixel prend la
    HAUTEUR du code sous lui (ombre et reflet exacts), la nuit allume ses vitres (teintes
    bleu-violet), les lumières posées par la recette sont retirées. 2 générations.
  - ⚠ PixelLab rend un fond OPAQUE même avec `no_background` : détourer depuis les
    bords, avec tolérance sur les gris (le fond est tramé).
  - ⚠ Une silhouette sur une tenture qui s'allume doit aussi être écrite dans la NUIT
    (sinon le calque de nuit la repeint).
  - Planches : `plaisirs/pilote2-coupe-jour.png`, `-nuit.png`, `pilote2-exterieur.png`,
    `plaisirs/ext/cmp2z.png`. RIEN commité.
- 2026-10-03 (nuit, suite) : **Raph : « l'extérieur bravo, j'aime beaucoup. L'intérieur par
  contre, surtout la coupole et l'ascenseur »**, références Fallout Shelter (×2) et
  Oxygen Not Included. → la coupe fine refaite en SALLES-BOÎTES :
  - chaque lieu est une boîte (plafond à caissons vu d'en dessous, murs latéraux en
    FUITE — le mur du fond comprimé et assombri, lambris en biais —, parquet en
    profondeur), posée dans une CHARPENTE de fonte rivetée (poutres de 9 px, poteaux de
    10 px percés d'une PORTE au ras du sol : on passe de salle en salle) ;
  - lumière par salle : flaques tramées au mur ET au sol sous chaque lustre, coins
    sombres ; deux lustres dès 110 px, l'enseigne au centre (le kiosque porte la sienne) ;
  - l'ASCENSEUR : colonne laquée continue, rails de laiton, câbles, seuil à chaque étage,
    CADRAN d'étage, lampe de palier, poulie en haut ; cabine boisée éclairée, arche dorée,
    grille en accordéon (deux calques cuits) ;
  - la COUPOLE n'est plus un volume dehors : la VERRIÈRE est une salle vue de l'intérieur
    (côtes de fonte, ciel derrière le verre, rais de soleil sur la mosaïque, oculus, jardin
    d'hiver, lanternes, invités) où le BALLON D'ICARE attend sous l'oculus.
  - Mesures : CEIL 8, WALLH 52, FLOORD 12, STRUCT 9 (LH 81), largeurs du plan ×2,6.
  - Planches : `plaisirs/pilote3-coupe-jour.png`, `-nuit.png`. RIEN commité.
- 2026-10-03 (nuit, suite) : **Raph : « il faut que ça bouge, l'ombre : soit une fille seule,
  on voit ses formes et elle aguiche avec une jambe qui bouge ; soit quand il y a un homme,
  une petite animation »** → les OMBRES DE LA TENTURE sont animées (`shadowFrames`,
  plaisirsCoupeHD.js) : silhouettes construites sur un squelette (une pose par image),
  en volumes pleins aux courbes EXAGÉRÉES (à 30 px, une silhouette réaliste se lit comme
  un bâton) ; SEULE : de profil, main derrière la tête, la jambe monte et se tend (5
  poses, 230 ms) ; À DEUX, pendant que le manège cache l'hôtesse et son client derrière
  la tenture : rapprochés, baiser, pied levé, renversé (4 poses, 380 ms ; le haut-de-forme
  le signe). La vue les peint PAR-DESSUS la nuit (`show` dans la cuisson, `showCv` dans
  salleBake). Rien d'explicite. Planche : `plaisirs/planche-ombres.png`.
- 2026-10-03 (nuit, fin) : **Raph : « c'est bien, go pour les autres âges »** → les DIX âges
  passent au nouveau régime, dedans comme dehors :
  - EXTÉRIEUR : un habillage PixelLab par âge (`public/pixelart/places/plaisirs-{feu,
    bois,pierre,couronne,marbre,fonte,neon,jade,astral,cristal}.png`, table `SKINS` de
    `plaisirsSkin.js`, `at` dans le REPÈRE DU LIEU). Fidélité 80 pour les âges bas ; les
    TOURS (Néon, Jade) restaient « gâteau » à 80 et 60 → fidélité 30. L'Astral et le
    Cristal sont des RECOLORATIONS du Jade (PixelLab gardait le turquoise de l'image de
    départ). La nuit : chaque âge nomme ses VITRES (`glass` : plage de teinte, saturation,
    valeur ; null = pas de vitre, la tente et la maison de bois) + flammes et ampoules.
  - INTÉRIEUR : `styleHD(band)` donne à chaque âge ses matières (bois, or, velours,
    pierre, verre…) et ses PIÈCES (mur, sol, plafond, luminaire, salle du haut, engin
    d'Icare, circulation, fondation, horizon, décor, objets du hall, chapeau des ombres,
    écriture, caisse). Circulation : aucune au campement (un seul niveau), échelle,
    escalier, ascenseur de fonte, ascenseur de verre, disque de lumière aux âges
    cosmiques. Salle du haut par âge (tente, comble, coupole, verrière, dôme de verre…).
    Pas de lettres avant l'écriture (enseignes en planchettes de bois), pas de caisse
    avant la monnaie.
  - Nettoyage : l'ancienne coupe (`plaisirsCoupe.js` et son test) supprimée,
    `salleBake` ne cuit plus que la fine, la vue n'a plus de cabine de secours.
    Test `plaisirsCoupeHD.test.js` : les dix âges (lieux, opacité, clic au pixel,
    habitants dans le bâtiment, manège, ombres, cabine).
  - ⚠ Captures dans la pane masquée : les minuteurs y sont bridés et un script de plus de
    45 s est coupé → attendre par une boucle de `fetch` (`__nap`), un ou deux âges par
    appel.
  - Planches : `plaisirs/skins-0-4.png`, `skins-6-9.png`, `skins-nuit.png`,
    `planche-hd-10-ages(-mini).png`, `hd-check2-mini.png`. RIEN commité.
- 2026-10-03 (nuit, reprise) : **Raph : « c'est pas mal ! Fais attention aux toits et aux
  entrées. Vérifie bien les lumières aussi. Les lumières néon ressemblent un peu à une
  prison. Prends bien le temps de travailler chaque salle au maximum de tes capacités. »**
  - TOITS ET ENTRÉES (dehors) : retouches PixelLab `edit_image` (le reste de l'image
    gardé ; ~20 gén. chacune) — la Couronne devient un vrai donjon (UN toit d'ardoise
    conique, des hourds) au lieu de trois jupes de toit empilées ; la Pierre ouvre sa
    balustrade sur un escalier jusqu'à l'eau ; le Bois pose son escalier sur un ponton ;
    le Marbre perd ses bornes de bronze et gagne un portique à fronton et un palier ; le
    Jade pose ses escaliers sur une terrasse sèche (plus de douve) avec des marches
    jusqu'à l'eau (l'Astral et le Cristal en sont recolorés). Enseignes du Néon
    redessinées à la main (« PLAISIRS », « CLUB » : PixelLab gribouillait les lettres).
  - LUMIÈRES (dehors) : la nuit d'un habillage a maintenant ses FENÊTRES DÉSIGNÉES
    (`windows` : un point par baie, posé sur l'habillage ; la tache sombre qui l'entoure
    s'allume) — la détection automatique allumait les joints du dallage ; plages de
    VITRES resserrées (le Jade allumait ses murs, le Marbre l'eau de son pied) ;
    enseignes du Néon allumées (`signs`). `skinNightPixels` dans plaisirsSkin.js.
  - « LA PRISON » : c'était le CRISTAL (et les âges cosmiques) — des fils lumineux tous
    les 16 px sur tous les murs, peints PAR-DESSUS la scène et les meubles la nuit, et une
    colonne de lumière tramée en damier. Corrigé : murs propres à chaque cité (Jade :
    laque rouge et panneaux de jade aux nuages ; Astral : nuit étoilée et constellations
    dans des cadres de nacre ; Cristal : panneaux lilas et grappes d'améthyste), la nuit
    des murs dans un calque à part ÉTEINT sous les meubles (`WNr`), faisceau lisse. Le
    Néon quitte sa verrière à meneaux blancs (des barreaux, de jour) pour un casino art
    déco : velours prune, éventails d'or (or VRAI : le « métal » du Néon est le chrome,
    blanc), néon de corniche, globes dépolis, moquette de casino.
  - CHAQUE SALLE À SON ÉPOQUE : le mobilier n'est plus celui du Fonte recoloré (tapis
    vert et feux de rampe au campement, loterie foraine à Rome). Nouveaux modules :
    `plaisirsHDKit.js` (outillage sorti de la coupe), `plaisirsEraRooms.js` (gabarits
    table / comptoir / étagères / scène / alcôve + le Feu), `plaisirsEraAncient.js` (Bois,
    Pierre, Couronne, Marbre), `plaisirsEraModern.js` (Néon, cosmiques),
    `plaisirsEraFurnish.js` (l'aiguillage). Le Fonte garde le sien. Le matériel suit
    celui des jeux (osselets jusqu'à la Couronne, dés d'ivoire au Marbre, cartes de bois,
    de parchemin, de jeu, de cristal). Feu : dolmen et osselets, souche-table, jarre des
    sorts, claie du troqueur, danse autour du feu sous les peintures de la grotte, couche
    de fourrures derrière un rabat de peau. Bois : tréteaux, tonneau-table, coffre des
    sorts, étal, lit clos. Pierre : chêne et étain, la BLANQUE, l'épicier et sa balance,
    tapisserie au lion, BAQUET des étuves sous son dais. Couronne : nappe à franges, ROUE
    DE FORTUNE, joaillier, scène fleurdelisée, lit à baldaquin. Marbre : pattes de lion et
    dés d'ivoire, hydrie des sorts, THERMOPOLIUM et amphores, front de scène à colonnes,
    lupanar ; murs pompéiens, mosaïque, lampes à huile. Néon : craps, vingt-et-un sous la
    lampe verte, BANDITS MANCHOTS, vitrine, piano-bar, revue sous un chapiteau d'ampoules,
    lit rond et cœur de néon. Cosmiques : tables qui flottent, dés et cartes de lumière,
    globe des sorts, harpe de lumière, lit-bulle derrière un voile.
  - Le reste de la boîte suit : charpente par âge (rondins liés, poutres chevillées,
    entablement de marbre, fonte, acier à filet de néon, céramique / laque au Jade),
    enseignes (planchette, tablette de marbre, émail, néon, verre), escalier à volées
    (marches, rampe et balustres, paliers, meurtrières) au lieu d'un zigzag de dalles,
    combles d'époque (pagode laquée aux cités cosmiques, grenier sous l'ardoise),
    fenêtres à volets au village et au Moyen Âge, torches aux murs du campement.
  - ⚠ Règle de figurants : JAMAIS de joueur au milieu devant une table (à 27 px, il
    cache une table de 13) — derrière, aux bouts, au plus un de dos au coin
    (`tableCrew`).
  - Lint et 2 284 tests verts. Planches : `plaisirs/ext-v3.png` (dehors, jour et nuit),
    `mdp-v3-b*.png` (coupes en jeu). RIEN commité.

---

> **État 2026-08-22 : le lieu est en jeu.** Ce fichier fait foi pour le chantier.
> Sprite déposé, onglet ouvert, jeux migrés, placement en pleine eau, domaine
> réservé et aura livrés. Restent le « où est Charlie » (volet 4) et les paliers
> d'ère 1 et 2 du sprite : seul le palier 3, le néon (`plaisirs-t3.png`), est
> dessiné à ce jour.
>
> **⚠ Décision de Raph, 2026-09-28 : le monument est CACHÉ tant que la carte n'a
> pas atteint la bande 6 (« Néon »)** — `PLAISIRS_REVEAL_BAND` dans
> `src/game/map/layout.js`. Posé dès l'ère 0, le seul palier dessiné (néon) se
> dressait à côté du campement de tentes, soit la toute première image du jeu,
> et l'abonnement PixelLab a expiré (plus de génération possible). Seule la
> PUBLICATION de `river.plaisirs` est retenue : la marche, l'évasement du lit,
> `bridgeAvoid` et le domaine réservé ne changent pas, donc le fleuve garde sa
> forme et le terrain est prêt le jour où le lieu paraît. L'onglet Plaisirs reste
> ouvert dès le début. **Quand les paliers 1 et 2 existeront, ramener le seuil
> à 0** et choisir le palier par bande. Les lignes « dès la première ère » et
> « Dès le début » ci-dessous décrivent l'intention d'origine.
>
> *(Les sections datées 2026-08-05 décrivent la conception ; elles sont conservées
> pour les arbitrages et les pièges de tirage, pas pour l'état d'avancement.)*

Un grand lieu de divertissement en bordure de ville, dans l'esprit du Gold Saucer :
on y joue, on y écoute, on s'y amuse. Il est là dès la première ère et il ne se
gagne pas, il se découvre.

## Les arbitrages de Raph (2026-08-05)

| Question | Réponse |
|---|---|
| Forme sur la carte | Un corps principal, plus 2 ou 3 satellites posés autour |
| Registre visuel | **Palais des jeux** : façade close, enseigne, lanternes, terrasse, portique |
| Nom | **Plaisirs** — le lieu est la Maison des Plaisirs, l'onglet s'appelle Plaisirs |
| Usage | Les jeux vivent **seulement** ici. Ils quittent le Temple |
| Navigation | Un **nouvel onglet** à gauche, le 9e |
| Paliers d'ère | **3**, silhouette conservée d'un palier à l'autre |
| Apparition | **Dès le début**, mais certains éléments se débloquent en les **trouvant sur la carte**, à la manière d'un Où est Charlie |

Les trois paliers, tranchés faute d'objection : bois et toile tendue, puis pierre à
portique et dôme, puis enseignes lumineuses et verre.

### Registre : mature assumé

Consigne de Raph, en cours de tirage : « un design **mature** du bâtiment,
casino / argent / sexe, n'hésite pas ». Le lieu n'est donc pas une fête foraine
familiale, c'est un tripot et une maison de plaisirs.

Ça se joue **par l'architecture et l'ambiance**, jamais par l'anatomie : lanternes
rouges, rideaux de velours tirés, silhouettes derrière une fenêtre éclairée, balcon
et galerie, statue de marbre, torchères, or répandu, vin. À 10 px par habitant,
c'est le décor qui porte tout le registre de toute façon.

⚠ Conséquence palette : ces tirages arrivent en rouges profonds et or. La palette
maître part sur terre cuite et cuivre, et le magenta du tirage F est franchement
hors palette. À arbitrer au remap, sachant qu'un rouge éteint en brun tuerait le
signal du lieu (précédent : la brique des greniers, sortie du remap).

## La doctrine qui encadre tout

Le lieu relève des **actions facultatives** (cf. la fiche mémoire du même nom, posée
le même jour). Jamais d'obligation, jamais de minuteur qui expire, jamais de
pénalité pour qui ne clique pas. Le « où est Charlie » en découle naturellement :
chercher un détail caché est du bonus pur, celui qui ne cherche pas ne perd rien.

La carte n'est qu'un **point d'entrée** : on clique le lieu, le panneau s'ouvre, le
jeu se joue dans le panneau. Patron déjà en place, à réutiliser tel quel.

## Volet 1 — l'art

### Ce que la recherche d'assets humains a donné : rien d'utilisable

Recherche menée le 2026-08-05, quatre pistes sérieuses, toutes écartées. À ne pas
refaire.

| Piste | Verdict |
|---|---|
| [Isometric Casino](https://maxparata.itch.io/isometric-casino), monogon, 9,95 € | ⛔ **CC BY-ND**. Modification interdite, or le remap de palette est obligatoire ici. Écarte du même coup tout le catalogue iso de monogon, le plus fourni d'itch.io |
| [Tycoon Worlds Amusement Park](https://2dpixx.itch.io/tycoon-worlds-game-kit-amusement-park-basics), 2DPIXX, 8,50 $ | ⛔ Licence idéale (adaptation permise, commercial) et **100 % humain revendiqué**, mais tuiles 256 px et visiteurs 25 px. L'habitant fait 10 px d'encre, soit un facteur **0,40** qui ne tombe sur aucun barreau. Registre moderne en prime (montagnes russes, château gonflable) |
| [KR Amusement Park](https://kokororeflections.itch.io/kr-amusement-park-tileset-for-rpgs), 19,99 $ | ⛔ Top-down RPG Maker, pas d'iso 3/4 |
| Packs iso 16 et 32 px (IsoBlocks, philtacular, Choco Ted) | ⚠️ Échelle atteignable, mais aucun ne couvre le concept. Réserve possible pour du mobilier de satellite |

**La loi maison se vérifie une fois de plus : les packs gagnent sur l'objet, perdent
sur le concept.** Un palais des jeux intemporel à trois paliers d'époque est un
concept. Donc PixelLab pour le corps et les satellites.

### En revanche, les enseignes néon : là un pack GAGNE

Raph a demandé le 2026-08-05 des enseignes façon quartier rouge (pin-up néon,
lettrage de club). C'est un **objet**, pas un concept — et surtout une enseigne est
**plate** : elle se plaque sur une façade iso sans que la question de la vue frontale
se pose. Liens vérifiés, Raph télécharge lui-même :

| Pack | Verdict |
|---|---|
| [FREE Pixel Art Neon Sign Pack, karsiori](https://karsiori.itch.io/free-pixel-art-neon-signs) | ⭐ **CC0**, gratuit, 20 enseignes ANIMÉES, plusieurs coloris chacune. Le meilleur rapport de loin |
| [Pixel Neon Signs, Joshua Briggs](https://joshua-briggs.itch.io/pixel-neon-signs-the-neon-series) | £1, licence non vérifiée |
| [Japan Neon Signs, justblendout](https://justblendout.itch.io/japan-neon-signs) | 8 $, registre japonais, colle au quartier rouge |
| [Synth Cities Environment, ansimuz](https://ansimuz.itch.io/cyberpunk-street-environment) | Gratuit, décors de rue cyberpunk à néons. Vue de côté, enseignes à découper. Licence à lire dans le zip |
| [Isometric Cyberpunk Streets, monogon](https://maxparata.itch.io/isometric-cyberpunk-streets) | ⛔ CC BY-ND, comme tout son catalogue |
| [ADVERSE 09 Neon Commerce](https://advokatfrida.itch.io/adverse-09) | ⛔ 4,99 $, raster HD « not an editable kit », et registre commerce de survie |

⛔ Aucun pack de **pin-up néon** n'existe : cherché sous « red light district » (ne
ramène que des jeux 1-2-3-soleil) et « neon dream girl » (un module de JDR papier).
C'est un sprite unique, PixelLab le fera bien.

📌 Le néon appartient au **palier 3**. Aux paliers 1 et 2 son équivalent est la
lanterne rouge et l'enseigne peinte.

### La recette de tirage

Celle du pilote « halle à paliers » du 2026-08-04, déjà verrouillée :
`create_map_object`, 192×160, `low top-down`, `high detail`, `detailed shading`,
`selective outline`, avec la formule « the CORNER faces the viewer, TWO visible
facades » qui seule donne le vrai bloc iso.

Rappels qui coûtent cher quand on les oublie :

- ⛔ **PixelLab ignore les négations.** La dalle au sol et l'ombre portée se retirent
  en post, jamais par le prompt. Trois refus déjà documentés sous un bâtiment.
- ⛔ Pas de jaune franc, la palette part sur terre cuite et cuivre.
- ⛔ Anti « trop IA » : ni orbe lisse, ni halo cyan, ni anneau qui tourne.
- Le canevas fait la finesse : sous ~90 px d'encre, un détail fin sort en texture
  bruitée dès le brut.
- Le cadrage se demande **au prompt**, il ne se rattrape pas au ciseau.

### ⛔ La vraie forme n'est pas un bâtiment : c'est une STRUCTURE

Recadrage de Raph le 2026-08-05, références à l'appui (le Gold Saucer de FF14 et sa
carte Magic) : « j'aime beaucoup moins, fais moi un truc hors du commun ». Les 4
colosses de 400 px, tous des volumes à façades, sont **écartés**.

Ce que montrent les références, et qu'aucun de mes tirages n'avait :

- une silhouette **arborescente**, pas prismatique : des plateaux en soucoupe qui
  s'étagent en éventail autour d'un tronc bulbeux ;
- de la **verticalité** — la structure monte, elle ne s'étale pas ;
- des **faisceaux de lumière** qui percent le ciel, visibles de très loin ;
- une roue perchée au sommet, des passerelles, rien d'orthogonal.

⛔ **Ma formule « the CORNER faces the viewer, TWO visible facades » était le
problème** : elle force une boîte. Elle vaut pour les bâtiments de ville (règle du
bloc iso, cf. la hutte des conteurs), **pas pour ce lieu**. Abandonnée ici, on garde
seulement `low top-down`.

⛔ Le canevas doit être **plus haut que large** (320×400) pour une structure
verticale. Un canevas large produit mécaniquement un bâtiment large.

✅ **DIRECTION VALIDÉE par Raph : la tour-fleur violette** (tirage V), « la structure
qui me parle le plus », complétée par « les vitrines rouges et les bâtiments
matures ». Soit la synthèse des deux fils de la session : la silhouette florale à
plateaux en pétales bordés de néon, et sur chaque pétale de petits pavillons à
vitrines rouges éclairées avec silhouettes derrière la vitre.

Ce montage a un mérite qui dépasse l'art : **chaque pétale porte un lieu**, donc le
« corps principal + satellites » arbitré au début se lit d'un coup d'œil, et les
jeux à venir ont chacun leur adresse visible sur la structure.

### ⛔ Parler du SOL fait dessiner un DÉCOR

Un prompt qui mentionne la terre ou le sol (« sinking into the ground », « half
buried in the earth ») ne donne pas un objet isolé sur fond uni : PixelLab compose
une **scène** — ciel, montagnes, sol — et le détourage par flood fill ne s'en sort
plus, le fond n'étant plus uniforme. Pour un élément à composer, ne décrire que
l'objet lui-même et laisser l'enfoncement se faire au montage, par la coupe nette
du bas.

### ⛔ La bascule frontale, mesurée sur 9 tirages

`create_map_object` abandonne le bloc iso dès que le prompt **décrit une façade**
(fenêtres, enseigne, rideaux, auvents) : il livre alors une élévation de face,
inutilisable ici. Il le garde quand le prompt décrit d'abord un **volume** (hall
clos, dôme, deux étages, corps de pierre). Deux tirages perdus sur ce piège (D et
I), les deux les plus « jolis » en façade.

La formule « the CORNER faces the viewer, TWO visible facades » ne suffit pas seule :
elle est présente dans les 9 prompts, y compris les 2 qui ont basculé. **C'est
l'ordre et le poids des mots qui décident**, le volume d'abord.

Complète le précédent déjà noté sur les fontaines des places iso.

### État des tirages (2026-08-05)

9 tirages en 192×160, tous conservés dans le scratchpad de session.

| Tirage | Verdict |
|---|---|
| A palais à dôme | Bloc iso propre, mais lit comme une banque. La roue de fortune n'est pas sortie |
| B halle à scène | Lit comme une halle de marché |
| **C pavillon au masque** | ✅ **CHOISI par Raph pour le corps.** Masque géant en fronton, mâts à lampadaires, toit cuivré à étages, rideaux bordeaux. Le signal d'identité le plus fort des 9, et le seul qui tiendra à distance quand le bâtiment sera petit à l'écran |
| D maison rouge | ⛔ Frontal |
| E jeu opulent | Bon bloc, dôme cuivre, enseigne de cartes, or au sol |
| F courtisanes | Ambiance juste, mais silhouette d'auberge et magenta hors palette |
| **G palais des plaisirs** | ✅ **Recommandé pour le corps.** Bloc iso net, dôme doré à lanterneau, vitrine à rideaux de velours, torchères aux angles, or |
| H maison à galerie | Bon second : deux étages, dôme doré, auvents rouges |
| I thermes | ⛔ Frontal |

Deux retouches connues sur G avant dépôt : la **dalle au sol** se retire en post
(PixelLab ignore la négation), et l'**enseigne porte du faux texte** inventé, à
remplacer par un symbole (dés ou roue).

### ⛔ Dépoivrer un sprite lumineux : un pixel isolé clair EST une lumière

Le sprite repassé par Midjourney puis réduit arrivait avec **12,6 % de pixels
orphelins** (aucun voisin de leur couleur sur les 8) — le bruit classique du
downscale, invisible agrandi mais qui scintille dès que la caméra bouge.

⛔ Un dépoivrage naïf (remplacer tout orphelin par la couleur dominante du
voisinage) a mangé **37 % de l'or** en une passe. Sur ce sprite, une fenêtre
éclairée ou une lanterne fait légitimement 1 px sans voisin : ce sont des SOURCES
LUMINEUSES, pas des parasites.

✅ La garde qui marche : ne dépoivrer que les teintes **sourdes**, en épargnant
tout pixel à la fois clair et saturé (`max > 150 && max - min > 60`). Résultat :
orphelins 12,6 % → 4,7 % (le reliquat étant les lumières protégées), or et rouges
préservés à +1 % et +3 %, palette inchangée à 22 teintes.

⚠ Tester les **8** voisins et non 4 : un liseré néon d'un pixel d'épaisseur a
toujours un voisin le long de son tracé, et se trouve donc épargné de lui-même.

Script : `despeckle.mjs` (scratchpad de session), à généraliser si la passe sert
sur d'autres sprites issus d'images générées.

### Échelle

L'habitant fait ~10 px d'encre, cible verrouillée par Raph le 2026-08-05. Un
bâtiment ordinaire fait 96×80, une merveille de rang 5 monte à 400×344. ⛔ Ne jamais
agrandir les habitants pour faire entrer un décor.

⚠️ **Recadrage du 2026-08-05, sur reprise de Raph : « ne limite pas la taille,
libère toi de tes chaînes ».** Les 9 premiers tirages étaient calés à 192×160, le
format des bâtiments ordinaires — un bridage que rien ne justifiait. La série
suivante part à **400×352**, soit le plafond de `create_map_object` et le gabarit
d'une merveille de rang 5. À cette taille le lieu fait ~40 habitants de large : ce
n'est plus un bâtiment, c'est un complexe.

Conséquence à traiter au câblage : une emprise pareille demande une **zone réservée**
sur la carte, comme `cmWonderExtent` et `WONDER_CLEAR_R` le font pour les merveilles
(`layout.js:271`). Un lot ordinaire ne suffira pas.

## Volet 1 bis — le placement : DANS L'EAU, au large

> **Arbitré par Raph le 2026-08-06** : le lieu se pose **dans le fleuve**, pas
> collé au centre, avec un **élargissement du lit** sur la zone (« naturel, pas
> parfaitement rond ») et les **bateaux déviés autour**.
>
> ✅ **IMPLÉMENTÉ le 2026-08-06.** Pleine eau (pas d'île rendue à la terre),
> évasement asymétrique, slot figé. `npm run lint` propre, **819 tests de carte au
> vert**, et le sprite est servi en 200 OK au chargement — donc `river.plaisirs`
> est bien publié et lu par le renderer.
>
> Trois points d'implémentation :
> - le slot fige **l'abscisse le long du cours** (`u = 0.82`), jamais des
>   coordonnées de grille : la traversée se redéduit du lit, donc un recalcul du
>   fleuve ne peut pas le sortir de l'eau (condition posée par Raph) ;
> - l'évasement se fait **avant** la peinture des cellules, ce que `era_mega` ne
>   peut pas se permettre puisque sa place dépend de `riverSet` ;
> - l'asymétrie vient d'un décalage de l'**axe** du lit (`drift`), pas seulement
>   de `hw` — sens tiré sur `mapSeed`, rebrassé (le bit faible de `cmHash` vaut la
>   parité de l'entrée).
>
> Fichiers touchés : `layout.js` (évasement + publication), `cityMapRuntime.js`
> (obstacle de flotte), `iso/isoRenderer.js` (chargement + tri peintre).

### ⛔ L'échelle de `u` : le cours fait 3,6 fois la carte

Première pose à `u = 0.82`, corrigée le jour même (Raph : « c'est vraiment très
éloigné »). La cause : `xStart = cx - 1.8N` et `xEnd = cx + 1.8N` (`layout.js:2012`)
— le fleuve **déborde volontairement de la grille** pour traverser l'écran à tout
zoom. Donc `u` n'est pas une fraction de la carte :

```
distance au centre = 3,6 N × (u − 0,5)
```

| `u` | distance du centre | où ça tombe |
|---|---|---|
| 0,55 | 0,18 N | juste en lisière de la ville des premières ères |
| **0,58** | **0,29 N** | **retenu** : au large, détaché, mais dans le champ |
| 0,62 | 0,43 N | presque au bord de la grille |
| 0,639 | 0,50 N | le bord exact |
| 0,82 | 1,15 N | **hors carte**, plus du double du bord |

⚠ Rester **sous 0,639**, sinon le monument sort de la grille.

### ⛔ Et une abscisse fixe ne fixe PAS une distance — correctif du 2026-08-22

Retour de Raph sur capture : « **beaucoup trop proche du centre** ». Le tableau
ci-dessus dit pourquoi sans le dire : `0,29 N` n'est une distance qu'à `N` donné,
et `N` part de **20** en début de partie pour finir à **360**.

| `N` | avant (`u` fixe = 0,58) | après | écart au pont |
|---|---|---|---|
| 20-22 | **5,8 tuiles** — le sprite en fait 6,5 de large | **12,4** | 11,1 |
| 30 | 8,6 | 14,7 | 14,0 |
| 46 | 13,2 | 19,4 | 18,7 |
| 70 | 20,2 | 29,6 | 28,1 |
| 98 | 28,2 | 42,6 | 41,1 |

Le pont historique se pose sur la colonne du cœur urbain, lequel ne dérive que de
**±0,08 N** du centre de grille (`cityPlan.js` : `cx + (rng − 0,5)·N·0,16`). À
N = 20, la tour et la traversée tombaient donc **au même endroit** — c'est
exactement la capture.

✅ **La distance se calcule maintenant en TUILES, puis se reconvertit en abscisse** :

```
d = max( 0,08·N + PAD , 0,43·N )        PAD = 12 (demi-sprite 3,25 + demi-tablier 1 + l'air)
u = 0,5 + d / (3,6·N)
```

⛔ **ET CETTE FORMULE A ÉTÉ REFUSÉE À SON TOUR — voir la section suivante.** Elle
est conservée parce qu'elle documente le piège de l'échelle de `u`, pas parce
qu'elle décrit le code.

### ✅ LA RÈGLE QUI TIENT : on ne fuit pas le centre, on fuit LA VILLE

Trois refus, et c'est le troisième qui a tout invalidé :

| pose | distance | verdict |
|---|---|---|
| `u = 0,82` | 1,15 N | « c'est vraiment très éloigné » — 2026-08-06 |
| `u = 0,58` | 0,29 N | « beaucoup trop proche du centre » — 2026-08-22 |
| `u = 0,62` | 0,43 N | « il est **toujours dans le rayon de la ville** et je ne veux pas ça » |

Les trois raisonnaient en **fraction de grille**. Or la ville n'occupe pas une
fraction fixe de la grille : son emprise dépend de l'ère, de la population et de
l'archétype, et `reachFor` l'étire jusqu'à **1,9 fois** son rayon nominal dans la
direction d'allongement — laquelle, pour un plan `linear`, suit justement le
fleuve. Une carte pouvait donc rester bâtie bien au delà de 0,43 N.

La place ne se **calcule** plus, elle se **marche** : on remonte le cours vers
l'aval, échantillon par échantillon, et on s'arrête au premier qui soit
franchement hors de l'emprise urbaine **dans sa propre direction** :

```
hypot(sp − cœur)  ≥  reachFor(cœur → sp) · reachMul  +  gap     (1,35 et 12 tuiles)
```

`reachFor` est exactement ce que consulte `organicLimit` pour décider si une
cellule est constructible : on interroge donc la ville, pas la grille. Le
résultat ne dépend plus du tout de `N`, et il s'adapte tout seul à l'ère et à
l'archétype. Mesure en jeu (N = 98, bande 1, archétype `scattered`) :

| | bâtiment le plus proche du monument |
|---|---|
| avant (0,43 N) | **8,2** — c'est-à-dire le domaine réservé, et rien d'autre |
| après (la marche) | **21,2** — de la forêt, pas un faubourg |

📌 **C'est cette mesure-là qui tranche**, pas la distance au centre : si le
bâtiment le plus proche retombe à ~8 tuiles, c'est que seul le domaine réservé
tient encore la ville à distance et que la marche a cessé de fonctionner.

⚠ **Le déplacement de code qui rend ça possible** : `generateCityPlan` remonte
AVANT la peinture du lit. C'est sans risque et vérifiable — il ne touche ni à
`corridorAt` ni à `riverYAt` pendant sa construction, les deux ne servant qu'à
`finalize()`, qui reste, lui, après le lit. Les Sets et tableaux de colonnes sont
déclarés en haut et remplis plus bas (⚠ TDZ : déclarés vides, jamais capturés
non initialisés).

⛔ **Le seul cas où la marche perd** : en toute fin de partie, une ville qui
couvre la carte ne laisse plus de « dehors ». La marche voudrait alors se poser
au delà de 1 N — le voisinage exact du 1,15 N déjà refusé. On tranche en faveur
du cadrage : borne `uMax` à **0,79 N**, à la lisière de la mégalopole.
Molette pour arbitrer autrement : `globalThis.__plaisirsFar = 1.6` puis
`window.__cityRecompute()`.

Trois propriétés, verrouillées par `src/game/map/__tests__/plaisirsPlacement.test.js` :

- le plancher **ne mord qu'en dessous de N ≈ 45** — au delà, 0,58 reprend la main
  intact, la doctrine d'origine est préservée ;
- la distance ne **décroît jamais** quand la carte grandit (condition de Raph : le
  lieu ne se rapproche pas de la ville en cours de partie) ;
- l'écart au pont reste ≥ demi-sprite + demi-tablier **au pire cas de dérive**.

⚠ **Le plancher PRIME sur le plafond des 0,639**, et c'est délibéré : à N = 20 il
place le monument à 0,46 N, presque au bord. Un monument qui déborde un peu de la
grille tombe dans la **forêt sauvage**, laquelle n'a pas de bord (`isoWildForest`
ne teste aucune borne de grille — vérifié) et est donc dessinée normalement. Un
monument à cheval sur le pont, lui, est une faute de lecture.

### Le domaine réservé — et pourquoi 6 tuiles ne réservaient rien

Le plan le réclamait dès la conception (« une emprise pareille demande une zone
réservée ») ; ce n'avait jamais été câblé. C'est fait : disque de `clear` tuiles
autour du pied, tenu **hors de `reserved`** à dessein (`reserved` alimente aussi
`demand`, qui *protège* les routes de l'émondage — un domaine qui attire les
routes ferait l'inverse de ce qu'on lui demande). Trois portes seulement, celles
qui posent quelque chose : districts (`footFits`), moteurs (`claimed`), bâti et
arbres (la boucle `cells`). Plus le filtre des traversées seedées côté
`roadGraph` (`bridgeAvoid`).

⛔ **Aucune carve de route.** Le précédent est écrit dans la carve des merveilles :
`era_mega` en est exemptée parce qu'elle vit sur le fleuve, et couper une travée
au bord de l'eau coupe la ville en deux.

⚠ **Premier rayon (6 tuiles) MESURÉ INOPÉRANT.** Au droit du monument le lit
évasé fait `hw ≈ 5,6`, et le corridor eau + berge en fait déjà **7** : le domaine
vivait entièrement dedans. Mesure avant/après sur une vraie carte (N = 98) :

| | bâtiment le plus proche | arbre | route |
|---|---|---|---|
| `clear = 6` | 8,17 (dû au seul corridor) | 8,04 | 7,32 |
| `clear = 8` | 8,17 | 8,04 | **8,14** |

Le bâti était déjà tenu par le corridor ; c'est la **route** qui bougeait, et
elle a bougé par ricochet (privée de bâti à desservir, elle a perdu sa demande et
le trim l'a émondée). Toute reprise de ce rayon doit se mesurer ainsi, pas se
juger à l'œil : sous ~7, il ne se passe rien.

### Rien à inventer : le bloc `era_mega` fait déjà tout

`layout.js:2183-2258` construit exactement ça pour la merveille `era_mega` (l'île
de la Cité). Sept étapes, dans cet ordre :

1. cherche le `riverSample` le plus proche du slot → centre `s0` + **tangente du
   courant** `(tx, ty)` ;
2. vérifie que le slot est bien en eau (`d <= hw + 1.5`) ;
3. pose un fuseau de demi-axes `rx = 7.6`, `ry = 2.4` tuiles ;
4. **élargit le lit** : `sp.hw += (ry + 0.8) · smoothstep(u)` sur une portée
   `etale = rx · 1.9` ;
5. **repeint** `riverSet` / `bankSet` / `nearSet` sur la zone élargie ;
6. **rend l'île à la terre** : les cellules dans l'ellipse passent de `riverSet` à
   `bankSet` ;
7. publie `river.islands`, que `riverFleet.orbitPoint()` (`riverFleet.js:191`)
   utilise pour faire **contourner les bateaux** sur une ellipse homothétique.

### Le « pas parfaitement rond » est acquis par construction

L'élargissement ne s'applique pas à un disque : il incrémente le `hw` de chaque
**échantillon de la spline**. La forme obtenue est donc un **fuseau étiré par le
courant**, jamais un rond. C'est déjà la doctrine écrite dans le code, et c'est
Raph qui l'avait imposée en 2e passe : « une île de rivière est un fuseau étiré par
le courant, pas un œuf ; à 4,6 elle se lisait comme un rond posé au milieu de
l'eau » — d'où `rx = 7.6`.

Pour aller plus loin dans l'irrégularité, un seul manque : l'élargissement actuel
est **symétrique**, puisqu'il n'augmente qu'une demi-largeur. Le rendre asymétrique
demande de décaler aussi le centre du lit (`sp.y += offset · smoothstep`), avec un
offset seedé sur `mapSeed` — le fleuve gonflerait alors davantage d'une rive,
comme un vrai méandre. ⚠ `cmHash` est SIGNÉ (`>>> 0` obligatoire) et son bit faible
vaut la parité de l'entrée : rebrasser avant tout tirage.

### Les deux variantes, et celle que je recommande

| | Étape 6 | Le lieu | Ce que ça demande à l'art |
|---|---|---|---|
| **A. sur une île** | conservée | pose sur la terre ferme | un pied normal, une berge autour |
| **B. en pleine eau** | supprimée | émerge de l'eau, comme l'Aiguille Céleste | **pilotis, récif ou îlot** sous le fût |

**B**, puisque Raph a dit « dans l'eau » et qu'il retravaille justement le pied. On
garde les étapes 1 à 5 et 7, on saute la 6 — ou on n'en garde qu'un noyau d'une ou
deux cellules, un récif sous la structure.

### Garde-fous, tous déjà payés une fois

- ⚠️ **L'évasement transversal doit rester modeste** (`ry + 0.8`, pas `ry + 1.9`).
  Le premier jet gonflait tant le lit qu'il **passait sous une route existante, qui
  devenait un pont** — un ouvrage que personne n'avait demandé. C'est écrit noir sur
  blanc dans le code.
- ⚠️ **L'ordre de calcul est le vrai piège.** Le slot en eau (`cmWetWonderSlot`) a
  besoin de `riverSet`, mais l'élargissement doit modifier `hw` **avant** que les
  cellules soient peintes. Le bloc `era_mega` s'en sort en repeignant la zone après
  coup (étape 5) : reprendre ce schéma plutôt que de réordonner la génération.
- ⚠️ Augmenter `hw` ne risque pas d'ouvrir des trous entre échantillons (le danger
  documenté est l'inverse : un pas d'échantillonnage trop grand devant un `hw`
  trop petit).
- Le slot en eau **s'écarte déjà du pont** (`nearBridge * 2`), la traversée est
  préservée sans rien ajouter.

### Les bateaux : réglé aussi, et né du même problème

✅ **Vérifié.** `riverDodge()` + `riverIslandObstacles()` (`iso/isoRenderer.js:5715`
et `:5755`) existent précisément pour ça. L'en-tête du test dit l'histoire : « **L'Aiguille
Céleste est posée EN PLEIN FLEUVE (…) Les bateaux, eux, suivent le ruban : ils lui
rentraient dedans** (Raph, 2026-07-30) ». La correction est en place.

Le principe, à respecter : **l'évitement ne joue que sur la voie TRANSVERSALE**, on
ne dévie jamais le cours d'eau ni la progression le long du fleuve — le bateau se
range d'un bord. `riverIslandObstacles` égrène un point tous les `ry` le long du
fuseau pour que les zones d'influence se recouvrent.

Conséquence pratique : il suffit que le lieu soit publié dans `river.islands` pour
que les bateaux le contournent **sans une ligne de plus**. `orbitPoint` (le circuit
du pêcheur) est un bonus qui viendrait gratuitement par-dessus.

⚠ Seul point à arbitrer : `islands` sert **aussi** au rendu du contour d'île (il
existe un `beachIsland.test.js`). Publier une île « sans terre » pourrait dessiner
une plage autour du monument. Deux issues : un fuseau minuscule assumé comme récif,
ou alimenter la liste d'obstacles sans passer par `islands`.

### Reste à trancher avant d'écrire

- Le lieu étant présent **dès le début** alors que `era_mega` est une merveille
  tardive, l'élargissement doit s'appliquer sans condition de construction — et
  son slot doit être **figé**, sinon il dérive quand la ville grandit (`ring` est
  relatif au périmètre urbain).
- Récif ou pleine eau (cf. le tableau des deux variantes plus haut).

## Volet 2 — la navigation

8 onglets aujourd'hui (`src/App.jsx:257`), le nôtre sera le 9e. Il lui faut une
icône `nav/plaisirs` à générer, sans quoi il partirait sur un placeholder comme
l'onglet Marchandage.

## Volet 3 — la migration des jeux

Quatre jeux existent : augures, Vol d'Icare, tickets à gratter, vingt et un. Ils
sont déjà proprement isolés, la migration est peu risquée.

- `src/game/core/templeGames.js` — pont unique, 50 lignes. Son `openTempleGame()`
  appelle `openView('regulation')` : c'est **la seule ligne** qui décide de l'onglet
  d'accueil.
- `src/components/ui/RegulationStage.jsx` — la scène, table `STAGES` de 4 entrées.
- `src/components/ui/AuguresPanel.jsx` — les 4 boutons de lancement.
- `src/components/ui/CrisisActionBar.jsx` — ouvre aussi une table d'augures.

À trancher au moment de câbler : la **mise reste-t-elle en Faveur** ? Garder la
Faveur ne demande aucun rééquilibrage et c'est la voie recommandée ; en changer
rouvrirait l'économie du Temple.

## Volet 3 bis — l'aura (2026-08-22)

> Demande de Raph, même séance que l'éloignement : « lui donner une sorte d'aura
> autour, **un peu comme ce qui est fait pour la merveille de l'oeil, mais unique
> à ce batiment** ». ✅ **LIVRÉ**, module dédié `src/game/map/iso/isoPlaisirs.js`
> (le renderer iso pèse déjà 11 000 lignes), sans import retour — donc aucun
> cycle ES. Molette : `window.__plaisirsAura({ … })`.

**Point de départ, et il était embarrassant :** le monument n'émettait **aucune
lumière**. Son blit posait le sprite et rien d'autre — ses cent lanternes cuites
n'éclairaient pas un pixel d'eau, ce qui est mot pour mot la définition de
l'autocollant donnée en tête de `flameGlow.js`. Trois foyers `queueFlameGlow`,
un par plateau, corrigent ça quoi qu'il advienne du reste.

### Trois couches, chacune à sa place dans la frame

| | où | quoi | jour/nuit |
|---|---|---|---|
| **Le cerne** | tri peintre, couche de lumière | ellipse **couchée dans le plan iso**, allongée par le courant : nappe très faible + champ d'éclats + guirlande de feux au bord | nuit surtout, guirlande visible de jour |
| **Les faisceaux** | passe de nuit | 3 rais minces qui balaient le ciel depuis la flèche, en 7 paliers francs | nuit pure |
| **Les lanternes** | passe de nuit | lampions qui se détachent des plateaux et **montent** | atténuées de jour |

Ce qui rend la figure **unique** : celle de l'Œil est une sphère en l'air, celle-ci
est **couchée sur l'eau** — elle marque un territoire, pas un halo ; et le
monument est le seul du jeu planté en pleine eau, donc le seul qui puisse porter
cette figure-là. La seule chose empruntée à l'Œil est sa règle de densité (le
**nombre** de points est fixe, pas leur espacement — c'est ce qui tient à tous
les zooms).

⛔ Interdits tenus, tirés du § « anti trop IA » plus haut : pas d'anneau qui
tourne (signature de l'Œil), pas de dégradé lisse (la lumière tombe par
**paliers**), pas de cyan — la palette est **relevée sur le sprite** (histogramme
des pixels clairs et saturés : `232,40,128` néon, `249,96,45` braise,
`252,190,93` or), pas inventée.

⚠ **Les faisceaux survivent au LOD**, tout le reste non : c'est leur raison
d'être (« visibles de très loin »), or le LOD s'arme précisément au dézoom.

### Trois refus payés sur planche, à ne pas rejouer

1. **Quatre grands aplats concentriques = l'orbe lisse.** Le premier cerne était
   une tache violette molle étalée sur tout le fleuve — exactement ce que le doc
   proscrit. La carte sait déjà peindre de la lumière sur de l'eau, et **pas en
   aplats** : reflets du fleuve et lanternes de pont sont de **courts traits
   horizontaux qui miroitent** (`isoBridge.js:1345`). C'est cette grammaire qu'il
   fallait, semée en champ.
2. **Un liseré peut être dessiné ET invisible.** 44 points de 3 px à alpha
   0,16-0,56 ne déplaçaient que **360 pixels** de l'image (diff canvas
   avec/sans). Ils existaient ; ils se noyaient dans le **grain de l'eau**, qui
   porte ses propres moutons blancs. Sur une surface bruitée : moitié moins
   nombreux, deux fois plus gros, deux fois plus opaques, halo chacun.
   📌 **La mesure qui tranche est le diff de canvas**, jamais l'œil sur capture.
3. **Des faisceaux larges ne sont pas des faisceaux.** À `w = 0,15` les trois
   rais se recouvraient en un unique coin rose translucide qui **grisait la ville
   derrière**. Un projecteur est mince (`w = 0,055`).

⚠ **Le plancher de jour se règle en deux fois.** Un plancher commun à 0,28
laissait l'aura *rigoureusement invisible* de jour (4 284 px d'écart moyen 13/765
— sous le seuil de perception). La guirlande a donc le sien, bien plus haut
(`dotDay = 0,6`) : ce sont des **objets amarrés**, pas de la lumière, et un feu
flottant se voit à midi quand un miroitement d'eau, non.

Coût mesuré : **nul** (30,0 ms/frame avec, 31,7 sans — dans le bruit, N = 98).

## Volet 4 — le « où est Charlie »

Des éléments du lieu se débloquent quand le joueur les repère sur la carte. Rien
n'est spécifié au delà de l'intention. À concevoir : ce qui se cache, ce que ça
débloque, et comment on signale la trouvaille sans jamais gronder celui qui ne
cherche pas.
