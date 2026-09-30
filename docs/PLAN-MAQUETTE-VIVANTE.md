# Plan — La maquette vivante (rendu « wahou »)

Chantier ouvert le 2026-09-30 sur la demande de Raph :

> « Le jeu est fait pour être contemplatif mais le rendu global pique les yeux […]
> Fais l'audit visuel puis reprends tout ce qu'il faut reprendre pour avoir la carte
> belle et agréable au regard, cohérente dans les bâtiments, sol, arbres, places,
> véhicules et habitants. Tu as l'idée globale de ce que je veux, c'est ta seule
> contrainte. »

PixelLab réabonné (Tier 2 : 5 000 générations, remise à zéro le 2026-10-30).
**Ce document fait foi pour ce chantier.** Planche d'audit :
`.preview-shots/ui-vision/audit-visuel.png` (captures dans `captures/audit/`).

---

## 1. Les décisions de Raph (2026-09-30)

| Question | Réponse |
|---|---|
| La cible | **« Maquette vivante »** : dense et vivant comme eBoy (ses références d'août : Belfast par eBoy, New York en voxels), dans une lumière douce de fin d'après-midi ; fonds calmes, couleur vive réservée à la vie. |
| L'eau | **Oui, la calmer** — « mais améliore les reflets pour qu'ils collent vraiment à la réalité ». |
| Les ombres | **Une ombre solaire pour tout** : les nouvelles images sont dessinées sans ombre, le jeu projette la même ombre sous chaque bâtiment, arbre, habitant et véhicule. |
| La méthode | **Une ère pilote** : la bande 4 (sa capture « Royaume savant »), refaite entièrement, validée sur planche, puis les autres ères. |

## 2. L'audit (mesuré le 2026-09-30, bandes 0 à 8)

> **Tout parle fort en même temps.** Les plus grandes surfaces sont les plus
> criardes ; ce qui devrait attirer l'œil est ce qu'on voit le moins. Et chaque
> famille d'images vient d'une main différente.

1. **L'eau crie** : saturation 0,80 contre 0,12-0,30 pour le reste de la ville
   (×3 à ×7), sur 13 à 18 % de l'écran ; motif en écailles très contrasté.
2. **Le sol montre la grille** : une dalle = une case. Sol nu : 27 % du sol de ville
   (bande 2), 40 % (bandes 3-5), 70 % (bandes 6-8).
3. **Les places sont des autocollants** : cinq sortes calculées (centrale, marché,
   deux jardins, parvis — `plan.plazas[].kind`, qui ne sert qu'au NOM), un seul
   rendu ; dalle d'une autre matière et d'une autre teinte que le quartier, clôture
   en cage, poussière de mobilier autour d'une fontaine minuscule ; personne ne s'y
   arrête.
4. **Les mêmes bâtiments, cent fois** : bande 2, 411 maisons pour 3 dessins
   (townhouse 50 %) ; bandes 7-8, 1 844 pour 5 (terrace + block 78 %). Bâtiments
   achetés d'allure inachevée en bande 6, mur noir et or en bande 8.
5. **Pas une seule lumière** : quatre sortes d'ombres (cuites et variées, absentes,
   ellipses du campement, calculées par `houseShadow.js`), un plein midi plat, aucune
   fenêtre allumée la nuit.
6. **La vie ne se voit pas** : habitants en file indienne sur la chaussée, jamais
   groupés ; attelages ~4× plus fins que les maisons ; en vue de jeu la carte
   occupe environ la moitié de l'écran.

⚠ **Contradiction levée par Raph** : `PLAN-RENDU-VILLE.md` §5 consignait « toute
ombre sous un bâtiment : 3 refus » (août). Raph a tranché le 2026-09-30 : une ombre
SOLAIRE unique pour tout. Les ellipses et ombres calculées des 29-30/09 seront
remplacées par elle.

## 3. La cible, en règles

- **Calme en grand.** Sol, eau, dalles des places : fonds tranquilles, faible
  contraste entre pixels voisins, saturation basse, aucune période égale à la case
  (la grille ne doit plus se lire).
- **Riche en petit.** Le détail va aux bâtiments ; la couleur vive aux signes de vie :
  fleurs, auvents, étals, vêtements, lanternes, fenêtres allumées.
- **Une seule main.** Une bible visuelle par ère (§4) que respecte chaque nouvelle
  image, vérifiée par un contrôle automatique.
- **Une seule lumière.** Soleil haut-gauche, fin d'après-midi : ombre solaire
  projetée par le jeu, jamais cuite dans une image.

## 4. La bible visuelle (lot 0)

À établir sur la bande 4 à partir des sprites VALIDÉS (insula, courtyard,
stonehouse, manor, scènes moteur de l'ère) — on étend leur famille, on ne la
remplace pas (⛔ remap palette naïf : −33 % de chroma, cf. PLAN-RENDU-VILLE §5).
Contenu : palette de l'ère, contour, taille de pixel (grain 1,135 des habitations),
niveau de détail, budget de saturation par taille de surface, gabarits de prompt
PixelLab. Script de contrôle : `scripts/bibleVisuelle.mjs`.

## 5. Les lots du pilote (bande 4)

| Lot | Contenu | État |
|---|---|---|
| 0 | Bible visuelle + contrôle automatique | à faire |
| 1 | Fonds calmes : sol sans grille, terrains vides en cours et jardins, eau calmée avec **reflets réalistes** (rive d'en face en miroir, ciel, éclats du soleil, lumières de nuit) | en cours — eau calmée, grille du dallage éteinte et REFLETS FAITS (§8) ; terrains vides à faire |
| 2 | Places, cœurs de vie : cinq sortes dessinées différemment, pièce maîtresse visible de loin, dalle dans la matière du quartier, plus de cage, arbres d'ombrage, guirlandes et lanternes, habitants qui s'y arrêtent | première version FAITE à la bande 4 (§8) : forum, marché, parvis, square ; à valider par Raph |
| 3 | Bâtiments : 8 à 12 dessins d'habitation par ère, couleurs par pâté de maisons, sol des scènes moteur harmonisé | à faire |
| 4 | Lumière : ombre solaire unique (port de `iso/isoSunShadow.js`, branche `passe-visuelle-21-09`), ombres cuites retirées des images, fenêtres de nuit, lumière de fin d'après-midi | en cours — ombre solaire FAITE sous maisons, arbres, réverbères, objets de place, scènes moteur, merveilles, habitants, véhicules, bateaux ; ombres peintes retirées de 10 habitations (§8) ; restent fenêtres de nuit, ombres peintes des scènes sur socle |
| 5 | Vie : plus de files indiennes, flâneurs et groupes, étals tenus, attelages au bon grain | à faire |

Puis : planche de validation du pilote → déroulé sur les autres ères.

## 6. Ce qu'on ne refait pas (refus consignés)

~~Brume~~ et ~~oiseaux~~ : redemandés par Raph le 2026-10-01 sous une forme précise
(§9) — la brume en filets d'aube et de soir, les oiseaux posés qui s'envolent. Les
formes refusées restent refusées (nappes douces, bancs ronds, voile plein ; volées en
boucle). Agrandir habitants ou bâtiments
par le facteur d'échelle (échelle close le 2026-08-05), variation de ton par
cellule (4 refus), décorer la couture herbe/ville (7 refus), grain ou vaguelettes
au milieu du fleuve (3 refus — les REFLETS d'objets sont une autre chose, demandée),
cuire les émeutiers, voile de santé, usure visuelle des bâtiments.

## 7. Banc et pièges

- Captures : `scratchpad/mkAudit.cjs`, `mkBands.cjs`, `mkCampAB.cjs` (Chrome headless
  + CDP), profils de partie séparés. Toujours : été, jour, beau temps, partie calmée.
- ⚠⚠ Zoom de capture **multiple de 1/8** (sinon faux trait de tuile).
- ⚠ Chrome de Raph en rendu logiciel (accélération désactivée) : toute mesure de coût
  se fait aussi en rendu logiciel ; lui demander de réactiver avant de juger la lumière.
- ⚠ Une page très haute (≈ 3 500 px) bloque la capture pleine page : capturer en
  deux moitiés.
- A/B à image FIGÉE (même instant, sans habitants) : `scratchpad/mkFrozenAB.cjs`, puis
  `cropAB.cjs` (côte à côte agrandi) et `diffAB.cjs` (pixels changés en magenta —
  c'est lui qui a montré où tombait l'ombre).
- ⚠⚠ SESSIONS PARALLÈLES : chaque édition de `src/game/` par une autre session
  RECHARGE les pages du serveur de dev (plugin `game-full-reload`) — un audit de
  plusieurs minutes mourait en route (« Inspected target navigated or closed », page
  blanche). Captures longues sur un serveur SANS websocket : configuration `vite-nohmr`
  (`.claude/launch.json`, port 5199, `server.hmr/ws: false`, cache de dépendances À
  PART pour ne pas faire ré-optimiser celui des autres). Une page garde son code
  jusqu'à la navigation suivante.
- PixelLab : 10 générations simultanées au plus (Tier 2), PARTAGÉES avec les autres
  sessions ; sous charge, un objet sur quatre échoue (« heavy load ») — relancer.
- Coût d'image : `scratchpad/mkPerfSun*.cjs`. ⚠ `CM.forceFrame()` en boucle est
  BRIDÉ par le cap d'images (mesure à 0 ms) : poser `CM.capture = { night: 0,
  health: 1 }` pendant la mesure. Rendu logiciel = lancer Chrome avec
  `CDP_ARGS=--disable-gpu` (renderer « Microsoft Basic Render Driver », comme Raph).

## 8. Journal du pilote

**2026-09-30 — cohérence, fonds, ombre** (rien de commité encore).

- Kits d'ère remis dans l'ordre à la bande 4 : places (`plazaEraForBand`, les kits
  médiéval/antique étaient inversés), réverbères (`lampEraForBand`), ponts
  (`bridgeEraForBand` : pierre jusqu'à la bande 4, fer à la 5), maison du port.
- Eau calmée : `river-tiles-calm-ciel.png` (remap exact de 5 couleurs de l'azur,
  `scripts/eauCalme.mjs`), plus d'assombrissement par ère sur le beau temps.
- Grille du dallage éteinte : `URBAN_TILE_A.flagstone` 1 → 0,3 (planche à 4 doses ;
  à 0,3 la case ne se lit plus).
- Ombres peintes retirées de 10 sprites d'habitation (`scripts/ombresPeintes.mjs`,
  alpha seul — la table des teintes est à couleur exacte), boîtes d'encre figées
  (`INK_BOX_PIN`) pour que rien ne bouge ni ne grandisse. `houseShadow.js` supprimé.
- **Ombre solaire** (`iso/isoSunShadow.js`) branchée partout. Premier essai : la
  silhouette PENCHÉE de la maquette du 14/09 salissait les façades des voisins
  (vu sur un temple en A/B figé : l'ombre d'un toit restait debout aux 4/5 et tombait
  sur ce qui était déjà peint derrière). Elle est désormais **COUCHÉE au sol** le long
  de l'axe (2, 1) : elle ne tombe que devant son objet, là où tout est peint après
  lui. Vérifié par carte des différences : plus un pixel d'ombre sur une façade.
- Prix mesuré (rendu logiciel, bande 4) : +2 à +5 ms par image au zoom 1 (≈ 22 →
  27 ms, sous le budget de 33 ms du réglage « équilibré »), +7 ms au zoom 0,5 (où le
  réglage équilibré passe en vue lointaine et éteint l'ombre). C'est la SURFACE
  remplie qui coûte, pas le mode de fusion ni le JavaScript. Coupé : rien sous 12 px
  (22 % des appels au loin), réverbères sous 24 px, pixels cachés sous le sprite.
  **À faire si ça rame** : cuire les ombres des objets FIXES dans la pyramide du sol
  (coût nul par image, et plus de double assombrissement où deux ombres se
  croisent) — seuls habitants et véhicules resteraient dessinés à chaque image.
- Vu en passant, pour le lot 3 : les scènes « maison jaune à toit rouge » sur socle
  de terre cuite ont une ombre PEINTE sur leur socle (tache brun-noir) — à retirer
  comme celles des habitations.
- ⚠⚠ **Scènes cuites (engineSceneCache)** : un multiply cuit dans un canvas
  TRANSPARENT rend la couleur de l'ombre elle-même — chaque bâtiment-moteur posait un
  VOILE gris-bleu sur le sol (vu en A/B cache/direct), rogné en plus par les marges
  du canvas. Corrigé : la cuisson RELÈVE les ombres de ses props
  (`captureSunShadows`), les fond en un calque (`bakeSunShadowPlane`), posé en
  multiply au blit avec la force du moment (`drawSunShadowPlane`). La clé de cache
  porte la seule géométrie (`sunShadowVersion`). Et les passes hors écran des scènes
  (mesure d'encre, liseré de survol) coupent l'ombre (`muteSunShadow`).
- **Êtres mobiles** : habitants (vue diagonale et repli cardinal), véhicules, bêtes
  de trait, bateaux (flotte et amarrés), émeutiers portent l'ombre, pivot `'bottom'`
  (la rangée d'encre la plus basse de CHAQUE image d'animation). La passe FANTÔME ne
  la repeint pas sur la façade. Les ellipses des bateaux et émeutiers ne restent que
  sans soleil (nuit, vue lointaine), en fondu inverse (`sunShadowNightK`). Fontaines
  de place en pivot `'plate'`.
- Prix final (logiciel, tout compris) : zoom 2 : 15,0 → 16,5 ms ; zoom 1 : 20,0 →
  24,4 ms ; zoom 0,75 : 26,5 → 32,2 ms (limite du budget équilibré).
- Pas encore d'ombre : bêtes d'élevage (`critters.js` n'importe rien, par règle),
  ouvriers des scènes (ellipses `sceneHumanShadow` dans cityEngineSprites), drones
  (leur ellipse au sol reste, ils volent).
- **Reflets dans l'eau** (`iso/isoReflect.js`, lot 1, demande de Raph « qu'ils collent
  vraiment à la réalité ») : miroir par le PLAN DE L'EAU, retourné colonne par colonne
  autour du même sol que l'ombre (`pivotGround`) ; l'eau est tenue sous les quais de
  toute la hauteur du mur (`quayWallTiles`) → un objet du quai se reflète décalé de
  deux hauteurs de mur, un bateau de rien ; seule la rive d'en face (tri par colonne
  d'écran, `waterColumns`). Calque rempli pendant la frame (crochet dans
  `drawSunShadow`, appels directs des habitations teintées, des scènes cuites et des
  tranches du pont — miroir sur l'axe-sol du tablier), posé à la frame suivante à la
  fin de `drawIsoRiver`, clippé au ruban, caméra compensée. Ondulation d'1-2 px d'art
  dans les reflets seuls (jamais la surface nue). Dosage retenu sur planche : force
  0,6, teinte d'eau 0,15, ondulation 2. Le reflet du MUR de quai existe mais est
  éteint (`__reflect({ wall: true })`) : exact, il se lisait comme une corniche pâle.
- Eau encore calmée : l'éclat de la tuile (166,196,198) dessinait un treillis de
  losanges clairs → (104,148,162) (`scripts/eauCalme.mjs`).
- Prix des reflets (logiciel) : +3,4 à +4,3 ms par image, fleuve à l'écran.
  **Garde-fous** : ombre et reflets en fondu sous le zoom 0,6 (`minZoom`) ; coupés au
  palier « perf » (`fx`, qualityMode) ; pas de reflet en vue lointaine ni à
  l'effondrement. ⚠ Tout bord de blit au pixel ENTIER : un bord fractionnaire laissait
  une ligne claire en travers des reflets.
- ⚠ Rendu logiciel chez Raph : le palier « auto » d'un poste de bureau est « Élevée »
  (60 i/s, jamais de vue lointaine) — le plus lourd. Lui conseiller de réactiver
  l'accélération matérielle de Chrome.

**2026-09-30/10-01 — les places (lot 2), première version.**
- La SORTE de chaque place (plan de ville : centrale, marche, parvis, jardin) choisit
  enfin son mobilier (`plazaKindOfBox`, `KIND_KITS.antique`) ; sans plan (villes de
  test) la recette d'ère reste seule — les invariants de isoPlaza.test.js tiennent.
- **Forum** : fontaine monumentale (Neptune, `fountain-forum`, p 5 ≈ grain des
  maisons), trois arbres, un duo de bancs par côté, massifs fleuris sur les axes,
  passants autour de l'eau, fanions. **Marché** : 8 étals à auvents rayés (rouge, ocre,
  bleu) tournés vers le puits, cageots et amphores entre eux, acheteurs devant chaque
  étal, pas d'arbre. **Parvis** : statue d'empereur sur socle rond, braseros sur les
  diagonales. **Square** : PELOUSE sur l'anneau extérieur (`plazaLawnAtCell`, sol en
  herbe), cœur dallé autour de la fontaine, massifs sur les diagonales, sa grille.
- **Passants arrêtés** : habitants de l'ère immobiles (image 0 de leur bande), posés au
  filet, tournés vers ce qu'ils regardent. **Fanions** : guirlande d'un réverbère de
  coin à l'autre, lanternes chaudes la nuit (calque de lumière) — le forum devient le
  cœur éclairé de la ville.
- **Grilles** gardées au seul square (`FENCED_KINDS`) : ⚠ revient sur l'arbitrage du
  2026-08-06 (« places et merveilles, avec des portes ») pour le forum, le marché et le
  parvis — à valider par Raph.
- Dallage de place dosé (`PLAZA_GROUND.tileAlpha` 0,45) et ton antique rabattu.
- ART (PixelLab, `public/pixelart/iso/plaza/*-antique.png`) : fontaine du forum,
  statue, brasero (remap « marbre ») ; étals rouge/ocre/bleu ×4 vues, massif, cageots
  (quantize 24 seulement — ⚠ le remap d'ère ÉTEINT les couleurs de fête : un auvent
  ocre devient pêche). Recette : `docs/PLACES-ISO-COMPOSEES.md` ; référence de style
  passée par URL publique du dépôt (elle doit tenir dans le canevas).
- Corbeilles retirées des kits (« poussière de mobilier »).
- **Fenêtres allumées la nuit** (lot 4) : `houseWindows.js` repris de la branche
  `passe-visuelle-21-09` (posé le 21/09 sans verdict) — ouvertures SOMBRES fermées du
  sprite, deux sur cinq allumées, phase par maison, dans le calque de lumière. Branché
  dans `drawPixelHouse` après la découpe de lumière. Huit familles (townhouse,
  stonehouse, manor, block, tenement, insula, terrace, towerhouse) ; les petites
  maisons à toit rouge ne s'allument pas encore (détection à revoir).
- **Reflets des bateaux et du pont** (retour Raph du 2026-10-01, capture du port :
  « pas logiques ») : le pont descendait de deux hauteurs de mur (bande sombre loin sous
  le tablier) et un bateau près d'une rive tombait dans le tri « rive d'en face ». Bateaux
  et pont déclarent désormais `'water'` (au ras de l'eau) ; les coques passent en pivot
  PAR COLONNE — vue de biais, leur rangée la plus basse n'est que la pointe d'un bout.
- **Maisons romaines** (lot 3) : `domus`, `taberna`, `villa` (2×2), `insula2` remplacent
  `stonehouse` et `manor` (médiévaux) à la bande 4 ; les SIX archétypes dans chaque liste
  (une cité riche ne tire que `rich`). Mesuré sur la démo : domus 174, cour 104, insula 101,
  taberna 79, insula2 78, villa 27. Cf. `public/pixelart/houses/README.md`.
- Vu en passant, pour la suite du lot 3 : les GUILDES (bâtiment-moteur) se dessinent en
  pâté de maisonnettes identiques à toit rouge — c'est elles, pas les habitations, qui
  font la grille « copiée-collée » restante.
- Lumière de fin d'après-midi essayée (`__afternoon`, multiply chaud) : plus terne que
  fraîche, laissée ÉTEINTE.

**2026-10-01, nuit — « finis toutes les époques » : l'audit des autres ères.** Pilote
commité en local (`06daf15`). Captures de toutes les bandes
(`scratchpad/pilote/audit-toutes/`, serveur de dev SANS rechargement à chaud — cf.
§7). Ce qu'il faut reprendre, ère par ère :
- **Toutes** : SOLS ET ROUTES (demande de Raph de la nuit) — rues illisibles aux
  bandes 2-3 (gris sur gris), damier de béton (6), sol tech plus sombre que ses rues
  (7-9) ; places d'une autre pierre que leur quartier (médiéval bleu-gris et plus
  sombre que la rue, industriel noir, cosmique blanc cru). Fenêtres de nuit : seules
  huit familles s'allument (rien en 6-9).
- **2-3 (médiéval)** : place = un sapin au milieu de bancs, vide ; maisons variées, ok.
- **5 (fonte)** : place = dalle noire ; TOUR DE VERRE anachronique (`tower` dès la
  bande 5) ; manoirs sur socle prune.
- **6 (néon)** : bâtiments-moteur en « boîtes crème » ; place pâle et vide.
- **7-9 (cosmique)** : maisons de BRIQUE XIXe (`block`, `terrace`, `tenement`) au
  milieu des flèches ; forêt de flèches-moteur identiques ; socles sombres des scènes.

**2026-10-01, nuit — la BIBLE DES SURFACES (sols et routes, toutes ères).** Une règle
pour toutes les ères, gardée par `__tests__/isoSurfaceBible.test.js` (qui remplace
isoRoadGroundContrast, lequel ne lisait que les PNG) :
1. le sol des lots est CLAIR et calme ; la chaussée plus sombre d'au moins 35 de
   luminance ; la place, version claire de la matière du quartier, de 5 à 35 au-dessus ;
2. grain effectif (grain de la tuile × dose) : sol ≤ 7,5, chaussée ≤ 13, place ≤ 10 ;
3. aucune matière de sol ou de place ne fait de damier (variantes dans 6 de luminance).

Mesures qui ont décidé (grain = écart moyen de luminance entre pixels voisins) :
pavé de rue 30,8 · dalle de rue 18 · asphalte 10,8 · pavé de sol 18,2 ; variantes de
béton L105 à L155, de dalle tech L49 à L73. Gestes :
- **Chaussée dosée** (`ROAD_TILE_A`, isoRoad.js) : l'aplat du ton de rue dessous, la tuile
  dessus à 0,4 (pavé) / 0,6 (dalle, asphalte) / 0,8 (tech). Ton moyen inchangé, grain
  rabattu. La bande 5 reçoit un voile FROID (granit) pour cesser de rejouer la bande 4.
- **Sols** (`URBAN_MATS`, `URBAN_TILE_A`) : bandes 2-3 terre battue et gravier chauds,
  plus clairs, pavé dosé 0,35 ; bande 5 pierre grise ; béton clair dosé 0,5 ; ères
  cosmiques en NACRE teintée de l'ère (jade, ivoire, lavande, L156-159) sous la dalle
  tech dosée 0,3 — ⚠ le plus gros changement d'identité de la nuit, à faire valider.
- **Tuiles** (`scripts/solsCoherents.mjs`, jamais de remap) : variantes de béton et de
  dalle tech ÉGALISÉES (gain par canal) ; dallages de place médiéval, industriel, moderne
  et cosmique DÉCALÉS vers la famille claire de leur quartier (dessin intact, écarts
  gardés ×0,7 à ×1). Originaux dans `scratchpad/backup-sols/`.
- Effet collatéral mesuré (garde bâti/sol, rayon 24) : maisons dissoutes dans le sol
  bande 3 17 % → 0, bande 6 31,9 % → 0, bande 7 25 % → 0,8, bande 8 28,1 % → 18.
- Commité en local : `7b7282c`.

**2026-10-01, nuit — les places par sorte, ères médiévale et industrielle.** Même
grammaire que le pilote (`KIND_KITS.medieval`, `KIND_KITS.industrial`), art PixelLab
dessiné pour l'ère (IDs : `scratchpad/pixellab-places-nuit.json`) :
- **Médiéval (bandes 2-3)** : GRAND-PLACE = fontaine gothique (bassin octogonal,
  pinacle, saint doré) ; MARCHÉ = tréteaux sous toiles rayées rouge / vert / bleu (pain
  et fromages, légumes, draps), tonneaux et sacs, le puits ; PARVIS = roi de pierre sur
  socle armorié, braseros de fer ; JARDIN = massifs en clayonnage.
- **Industriel (bande 5)** : fontaine de FONTE verte à trois vasques ; marché d'étals
  peints en vert (tomates et fleurs, légumes, fromages et pain), bidons de lait ;
  homme d'État de bronze et vasques de géraniums ; au square, le KIOSQUE À MUSIQUE.
- Recette : 8 vues, style = la fontaine de l'ère (repo public), écrasement ×0,5,
  quantize 24 (jamais de remap). ⚠ Sous la charge, 2 objets sur 16 ont échoué
  (« heavy load ») et ont été relancés ; le parvis médiéval a montré des gabarits gris
  en attendant → nouvelle garde : tout prop réclamé par un kit a son PNG
  (isoPlaza.test.js, « kits par sorte : chaque prop a son art »).
- Planches : `scratchpad/pilote/places/quad-b2.png`, `quad-b5.png` (les quatre sortes
  forcées tour à tour sur la même place, `mkKinds.cjs`).
- Commité en local : `1c88898`.

**2026-10-01, nuit — les places par sorte, ères moderne et cosmique** (`KIND_KITS.modern`,
`KIND_KITS.cosmic`) : toutes les ères à places ont désormais leurs quatre sortes.
- **Moderne (bande 6)** : bassin CARRÉ à jets et sphère d'acier (plat et large : p 3,4
  au lieu de 5, sinon il couvrait la moitié de la place) ; marché d'étals sous PARASOLS
  rouge / bleu / jaune (fruits, fleurs, pain et fromages), cagettes de plastique ; parvis
  à la grande SCULPTURE d'acier rouge ; square.
- **Cosmique (bandes 7-9)** : fontaine aux ANNEAUX D'EAU suspendus autour d'une flèche
  de cristal ; marché de KIOSQUES-COSSES sous auvents translucides cyan / magenta /
  ambre, caisses flottantes ; OBÉLISQUE de cristal entre des pylônes de lumière ; massifs
  bioluminescents.
- Planches : `scratchpad/pilote/places/quad-b6.png`, `quad-b8.png`.
- Commité en local : `42054bd`.

**2026-10-01, nuit — maisons de chaque ère, fenêtres de nuit, cours en pelouse.**
- **Bande 5** : la TOUR DE VERRE (`tower`, un gratte-ciel du XXe) sortait dès la Fonte ;
  elle démarre à la bande 6, et l'IMMEUBLE HAUSSMANNIEN (`haussmann`) prend sa place.
- **Bandes 7-9** : ligne cosmique propre dans VARIANTS_HOUSE — fini la brique XIXe entre
  les flèches ; trois maisons en nacre, plus basses que les tours (TOUR-JARDIN,
  MAISON-DÔME, GRAPPE DE CAPSULES). Leurs gris d'ombre touchaient le sol nacre (garde
  bâti/sol) → `scripts/ecartSol.mjs --darker`. Effet : bande 8, 18 % → 0 d'encre dissoute
  (le coupable était `block`).
- **Fenêtres de nuit** : cinq familles de plus (`crafthouse`, `courtyard`, `megablock`,
  `arcologyhome`, `tower` — ses skins cosmiques 8 et 9 ont 15 à 38 ouvertures), plus
  l'haussmannien : la nuit des bandes 6 à 9 s'allume enfin.
- **Cours en pelouse** (`COUR.lawnFrom = 6`) : la couronne de terre battue autour des
  quartiers devient pelouse aux ères moderne et cosmique — à la bande 6, les
  bâtiments-moteur de la périphérie posaient sur des mottes brunes tachées de béton.
- Reste vu, pas fait cette nuit : les SCÈNES MOTEUR de la bande 6 (entrepôt crème, cubes
  blancs — « boîtes ») et la forêt de flèches identiques des bandes 7-9 : art à refaire
  famille par famille, un chantier en soi.

## 9. La petite vie (lot 6, demandé le 2026-10-01)

> « Tu peux refaire tous les petits éléments de vie, oiseaux, poissons, feuilles,
> lumières, brume sur l'eau, etc. ? »

Constat : ces éléments sont tous DESSINÉS PAR LE CODE (pavés de 3 px pour les
oiseaux, ellipses pour les poissons, carrés pour la fumée, dégradés lisses pour les
halos) — ils ne sont pas de la même main que les maisons et les places.

| Question | Réponse de Raph |
|---|---|
| La brume | **À l'aube et au soir** : longs filets effilochés, en pixels, qui glissent au ras du fleuve le matin et au crépuscule, disparaissent en journée, ne passent jamais sur la ville. |
| Les oiseaux | **Posés, puis envolés** : pigeons sur les places et les toits, mouettes sur les quais ; ils picorent et s'envolent quand quelqu'un approche. (La volée qui traverse le ciel s'en va.) |
| Les ajouts | **Tous** : bêtes de l'eau (canards, cygnes, héron, libellules), ombres de nuages, vent (arbres qui bougent, linge, drapeaux, fumée poussée), petites bêtes de terre (papillons, chats sur les murets, chiens qui trottent). |
| La dose | **Calme, à découvrir** : peu à la fois, surtout près de l'eau, des arbres et des places ; la ville reste calme dans l'ensemble. |

Règles de fabrication :
- **Dessinés au pixel, au grain des maisons** (1 pixel d'art = 1,135 px × zoom), petites
  planches faites à la main (`scripts/petiteVie.mjs` → `public/pixelart/vie/`) : à
  4-8 px de haut, une IA ne dessine pas un pigeon, et une réduction ne sauve pas un
  dessin fait pour une autre taille (leçon G1a). Le code ne fait que les déplacer.
- Positions au pixel ENTIER (`snapDev`), jamais de rotation d'un sprite (elle casse la
  grille) : un cap se choisit parmi des images dessinées.
- Sans état quand c'est possible (fonction de `now`, captures reproductibles) ; un petit
  état seulement pour ce qui RÉAGIT (oiseaux dérangés).
- Chaque couche a sa molette `__vie({ … })` et un compteur de ce qui a été peint.

Lots (pilote bande 4, planche, puis les autres ères) :

| Lot | Contenu | État |
|---|---|---|
| V1 | L'eau : brume d'aube et de soir, poissons (ombres et sauts) redessinés, ronds de pluie au pixel, feuilles à la dérive, canards et cygnes, héron, libellules | à faire |
| V2 | Oiseaux posés qui s'envolent : pigeons (places, toits), mouettes (quais) ; retrait de la volée qui traverse | à faire |
| V3 | Terre et vent : feuilles qui tombent, papillons, chats, chiens, arbres qui bougent, linge, drapeaux, fumée au vent | à faire |
| V4 | Lumières : halos au pixel (réverbères, lanternes), lucioles, éclats du soleil sur l'eau | à faire |
| V5 | Ombres de nuages | à faire |
