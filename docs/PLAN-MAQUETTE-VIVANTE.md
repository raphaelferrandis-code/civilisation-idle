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
  **Mise à jour 2026-10-06** : le cache des scènes est supprimé (audit du 05/10,
  MORT-1), et avec lui `captureSunShadows` / `bakeSunShadowPlane`. Restent
  `drawSunShadowPlane` et `sunShadowVersion`, qui servent la cuisson des Plaisirs.
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
  famille par famille, un chantier en soi. Planche des 25 sprites du stade moderne :
  `scratchpad/pilote/moteurs-b6-sheet.png` — 17 sur 25 sont des boîtes à toit plat crème.
- Commité en local : `8c61966`, puis `e720ba2` (maison de ville et tour de verre
  s'allument : seuil d'ouverture 80 au lieu de 68 pour ces deux dessins, `DARK_MAX`).

**2026-10-01, nuit — l'hiver de la bible des surfaces** (`73ed004`). Contrôle d'hiver :
avec les tuiles DOSÉES, la neige cuite dans les variantes d'hiver ne passait plus qu'au
tiers, et les places (sans tuile d'hiver) restaient des carrés d'été. En hiver, l'aplat
urbain tire vers la neige (`URBAN_WINTER`), une matière qui a sa tuile d'hiver la reprend
au moins à 0,8, et l'aplat des places suit (`PLAZA_WINTER`). Les rues restent sombres.

**Planche du matin** : https://claude.ai/artifact/UYsZhPRkyzihkEYbZP2eqx (avant/après par
ère, places, art, hiver, questions). Questions laissées à Raph : la NACRE cosmique ; le
PARVIS de porphyre sombre (L62, son « essai » de juillet — à doser comme les places ?) ;
les scènes moteur tardives ; les cours en pelouse dès la bande 6.

**2026-10-01, jour — réponses de Raph et « le meilleur rendu futuriste possible ».**
> « 1 très bien ce que tu as fait ; 2 atténue, et améliore le rendu global ; 3 refais ce
> qu'il faut, tu as les idées globales, demande-moi si tu doutes. »
- **Nacre cosmique** : validée.
- **Parvis atténué** : aplat clair dessous (`wonderToneFor` : la pierre claire de la place
  de l'ère, montée vers un marbre rosé), porphyre dosé 0,25 → mouchetis, ~L175. Le
  « socle prune » des esplanades civiques (bandes 5 et 7) disparaît avec.
- **Scènes moteur cosmiques, refaites** (bande 7 terminée, 8 et 9 en cours). Aux bandes
  7-9, dix-neuf familles savoir/infra se partageaient SIX images de tours par bande, et les
  neuf familles économie étaient des tours aussi : toutes posées à 1,72 hauteur de boîte,
  d'où la forêt de flèches noires. Langue nouvelle, en accord avec le sol nacre et les
  maisons cosmiques : NACRE + verre teinté de l'ère (jade / or / violet), jardins, une
  silhouette par FONCTION (école à toit-cour de récréation, marché sous toit-feuille,
  holo-théâtre, cascade d'épuration, ruine sous dôme de verre…) et TROIS hauteurs (haute
  128×224 : capitole, tour de la pensée, bourse, phare ; moyenne 128×176 ; basse 128×128),
  reposées dans le canevas commun pied en bas (`scripts/fetchCosmicScene.mjs`). La pose
  ne change pas (`blitCosmicTower`) : la gamme de hauteurs vient des images.
  Savoir/infra : nouvelles clés `cosmic-<famille>-<bande>` chargées à la demande
  (`COSMIC_SCENE_KEYS`, `cosmicSceneKey`), repli sur l'ancienne silhouette partagée ;
  économie : `<famille>-cosmic-<bande>` redessinées en place (`COSMIC_PEARL`). Aqueducs
  gardés (structure linéaire à part). Garde : `cosmicScenes.test.js` (PNG présents, calage,
  gamme de hauteurs). IDs PixelLab : `scratchpad/pixellab-cosmique.json`.
- **La ville cosmique s'allume la nuit** (`sceneEmissive.js`) : le verre de la teinte de
  l'ère est relevé dans le sprite et déposé dans le calque de lumière (comme les fenêtres
  des maisons) ; le halo de jour des scènes en nacre tombe à 30 % (un nuage jade sur un
  bâtiment blanc à midi se lisait comme une brume). Les maisons en nacre (capsules, dôme,
  tour-jardin) allument leurs fenêtres : leur verre est CLAIR, détecté par COULEUR
  (`GLASS`, houseWindows.js) et non par noirceur.
- **Bandes 8 et 9 terminées** (`a64fa68` nacre et or, anneaux orbitaux ; `5ed8160` marbre
  et cristal violet), comme la 7 (`662d4ab`) : 27 scènes par bande.
- **Maisons cosmiques en nacre** (`7ec8837`) : les skins `tower/megablock/arcologyhome-
  cosmic-7/8/9` étaient encore des gratte-ciel de verre sombre. Régénérés dans la langue
  de l'ère (coupoles de jade, gradins dorés, piliers de cristal) ; encre des arcologies
  ≤ 95 px (lot 2×2) ; gris d'ombre écartés du sol (`ecartSol --darker`). Garde bâti/sol :
  bandes 7 et 9 resserrées à 0,0 %.
- ⚠ **Fond gris opaque** : `cosmic-bureaucracy-8` (commité la veille) portait un
  RECTANGLE gris autour du pavillon — la génération avait gardé son fond, et le seuil
  d'alpha l'a pris pour de l'encre. Vu seulement en jeu, à la bande 8. Détouré
  (diffusion depuis le bord de la boîte d'encre, liseré, îlots) et recalé. Contrôle à
  faire après TOUTE série PixelLab : une rangée opaque d'une seule couleur ≥ 24 px, ou
  un haut d'encre plein (`scratchpad/fondOpaque.cjs`).
- **Bande 6 : fin des « boîtes crème »** (`2e34b06`) : les 17 scènes du stade moderne et
  leurs 13 grandes halles, une silhouette par fonction (dépôt à camions et dôme à sel,
  centre de données, rédaction à bandeau lumineux, télévision à antenne, bibliothèque à
  toit courbe, observatoire à radiotélescope, cinéma à marquise, banque en tour de
  verre…). Chaque grande halle est générée avec son PETIT MODÈLE comme image de style
  (URL publique de la rotation PixelLab) : même architecture, en plus grand.
  `fetchStageScene.mjs --fit` remplit la zone utile (×0,5 fixe laissait des bâtiments un
  tiers plus petits que leur boîte) ; ⚠ un facteur de 0,8 à 1 fait ONDULER les contours
  → ramené à ×0,75.
- ⚠ **Égouts** : la première station d'épuration avait trois bassins d'eau bleue —
  contraire à la décision de Raph du 2026-08-05 (« un égout avale, il ne recrache pas » ;
  le bassin de la station romaine avait été EFFACÉ pour la même raison). Régénérée en
  digesteurs en œuf FERMÉS, une conduite qui plonge dans le sol ; sortie de la table de
  `scripts/sewerOutfall.mjs`, entrée dans les stades regénérés de sa garde.
- Essayé, pas fait : allumer les vitres des scènes de la bande 6 la nuit, comme aux
  bandes 7-9. Le verre moderne est bleu, mais les murs à l'OMBRE aussi (lumière
  haut-gauche, ombre bleutée) : une fenêtre de teinte allume des façades entières. Il
  faudrait la liste des couleurs de verre sprite par sprite (`GLASS`). La nuit de la
  bande 6 garde ses fenêtres de maisons et le halo des bâtiments.
- Sources PixelLab de toutes ces images : `scripts/data/pixellab-scenes-tardives.json`.

**2026-10-01, soir — « 1 oui, 2 oui, vas-y »** (les deux questions de la planche).
- **Les bureaux de la bande 6 s'allument la nuit** (`eda7cc1`, `sceneWindows.js`). Le
  verre est NOMMÉ sprite par sprite (19 des 30 images ; couleurs choisies sur des planches
  de nuit simulée, `scratchpad/glassAuto.cjs`), groupé en carreaux, trois sur cinq
  allumés, phase par bâtiment (`setEngineSeed`, posé par les deux entrées du rendu de
  scène). ⚠ Trois essais avant le bon : une couleur à la fois = des mouchetis (une vitre
  est faite de 3 à 8 couleurs) ; cellules 3×4 = un DAMIER sur les grandes surfaces
  vitrées → découpe par ÉTAGES de 3 px ; blanc chaud = bâtiments-lanternes bleutés → la
  lumière des fenêtres de maisons (244,168,72), alpha 0,6. Éteints par choix : dépôt,
  centre de données, épuration, école, monnaies, observatoire. Garde : chaque couleur
  nommée doit exister dans son PNG (un sprite regénéré rendrait sa liste muette).
- **Les maisons en nacre prennent la couleur de leur ère** (`ec80d42`) : tour-jardin,
  maison-dôme, grappe de capsules × bandes 7-9, générées avec leur dessin de base en
  image de style (même forme, verre et accents jade / or / cristal), au cadre et au grain
  de la base (`fetchHouseSkin.mjs --half`). Les capsules jade du premier jet avaient des
  hublots GRIS (aucun jade) : regénérées avec un jade franc. ⚠ Avec ces skins, à la
  bande 7 les bassins et anneaux jade s'allumaient avec le reste — toute la ville brillait
  autant que ses monuments : la lumière d'ère des maisons est dosée par bande
  (`EMISSIVE_HOUSE` : 0,45 jade, 1 or, 0,7 violet), les scènes moteur gardent tout.

**2026-10-01, nuit suivante — « refais une passe sur tous les bâtiments, quitte à
régénérer, pour qu'ils soient plus beaux et correspondent davantage à chaque ère ».**
Inventaire par stade (stade 0 = bandes 0-1, stade 1 = 2-3, romain = 4, stade 2 = 5,
stade 3 = 6) sur planches. Les maisons tenaient (déjà reprises avec Raph) ; l'écart était
dans les bâtiments-moteur :
- **Médiéval** (`a76e6d1`, 20 institutions) : des cottages à toit orange, presque tous
  pareils — une bibliothèque ne se distinguait pas d'une maison. Palais fortifié, hôtel de
  ville à beffroi, halle de guilde, grange dîmière, abbaye à rosace, collège gothique…
- **Néolithique** (`87f66c3`, 12) : un village MÉDIÉVAL (colombages, tuiles rouges, une
  grange rouge à l'américaine) au campement. Bois brut, chaume, torchis, menhirs, ocre.
  Les scènes validées par Raph (cueilleurs, entrepôt, caravanes, marché, guilde, port,
  moulin, conteurs, cercle sacré) sont gardées.
- **XIXe et métropole** (`32cacb6`, 9) : la grange rouge de l'entrepôt, les maisons de
  ville de la chambre de commerce et du ministère ; les dernières boîtes de la bande 6.
- **Romain** (bande 4) : onze petites maisons à tuiles deviennent des institutions
  (curie, tabularium, stoa, école à péristyle, collège, monnaie…), quantifiées à 20
  teintes comme le reste de la série (« pas trop de teintes »).
- Procédé : UNE génération 8 directions par bâtiment (la vue sud seule sort DE FACE — 2
  essais), 256×232, image de style d'époque (manoir, loge de guilde, collège de brique,
  basilique romaine), qui sert la base (cadre exact) ET la grande halle : base et halle
  sont le même bâtiment, coût divisé par deux. `installPasse.cjs` / `installAll.cjs`
  (scratchpad) ; IDs dans `scripts/data/pixellab-scenes-tardives.json` (« passe »).
- ⚠ **Fond opaque, 2e cas** (le chantier médiéval à grue) : `fetchStageScene.mjs` le
  retire désormais seul (coins de la boîte d'encre opaques et de même couleur → aplat
  retiré par diffusion, poches enfermées de la couleur EXACTE, liseré).
- ⚠ `snowRoof.test.js` prenait la grange dîmière comme spécimen de la butée de neige ;
  spécimen changé pour la basilique de justice romaine (×1,65).
- Laissés tels quels : maisons, merveilles, scènes à véhicule (chariot, camion), quais,
  pont, aqueducs, égouts (refaits à la demande de Raph en juillet), tours (veille, moulin).

**2026-10-01, jour suivant — « il manque un poteau de soutien ; les nouveaux bâtiments
sont un peu flous ; d'autres dénotent ; l'allumage de nuit est à fignoler ».**
- **Le flou, c'était moi.** Les rotations PixelLab sont dessinées NETTES à 256 px ; je les
  réduisais à la taille du jeu par MOYENNE DE SURFACE (×0,4-0,75) — chaque pixel du jeu
  mélangeait 2 à 6 pixels d'art. ⚠⚠ **Ne jamais réduire un rendu PixelLab par moyenne.**
  Le bon geste : `image_to_pixelart` (fidèle, force 200) sur l'URL de la rotation, à la
  taille N×N calculée pour le cadre (`N = 256 × min((L−8)/encreL, (H−bas−2)/encreH) × 0,97`)
  — PixelLab REDESSINE l'image en pixel art à cette taille. Sa sortie est opaque sur un
  gris : la silhouette est reprise de l'alpha de la SOURCE (moyenné à N, seuil 0,5), le
  gris resté au bord est pelé, puis l'encre est posée 1:1 dans le cadre exact, sans aucun
  rééchantillonnage (`scratchpad/i2p.cjs`). 138 images reconverties (121 bâtiments-moteur
  et halles, 17 maisons), une génération chacune ; planche-contact entière vérifiée.
  Deux sources livrées sur fond opaque (le chantier à grue, l'archive) : fond retiré avant.
- **Le poteau** : l'atelier (`crafthouse`) avait un auvent sans appui à l'angle avant —
  poteau dessiné à la main (2 colonnes de pixels). Seule maison fautive de la revue.
  Raph : « régénère ce bâtiment, ça ne va toujours pas » → l'atelier est REDESSINÉ : maison
  d'artisan à colombages, toit de tuiles orange comme la maison de ville, porte en arc,
  plus aucun auvent porté (PixelLab `create_map_object` 64×64, 6 essais, le plus net
  retenu). ⚠ Les six essais posaient la maison sur une DALLE (pavés, herbe, seuil de
  briques) malgré « no base, no platform » dans la description : dalle retirée à la main
  (couleurs du socle sous la rangée 50, buisson d'angle gardé), pied des murs assombri,
  vitres peintes jaunes « allumées en plein jour » passées en verre sombre (la nuit,
  houseWindows les allume), `ecartSol --darker` (crépi à l'ombre trop près du sol, b2-3).
  Raph : « ça ne va pas du tout, c'est vu de face » → ⚠⚠ `create_map_object` sort des
  ÉLÉVATIONS DE FACE malgré « the corner of the building faces the viewer » (la leçon de
  juillet, cf. fiche « régé de face », ignorée une fois de plus : regarder L'ANGLE, pas
  seulement la structure). Refait en objet 8 DIRECTIONS (`create_8_direction_object`,
  128 px, la taberna comme objet de style), vue SUD-OUEST — porte et enseigne sur la face
  gauche comme la maison de ville —, convertie nette à 53 px (`image_to_pixelart`), aucune
  dalle cette fois. Ses tons (poutres sombres, pierre) sont ceux du dessin : luminance 82,
  celle de la maison de pierre (87).
  Raph : « le rendu est flou encore » → ⚠⚠ la conversion FIDÈLE (force 200) d'un rendu
  136 px vers 53 px (×0,39) lisse les ombres en dégradés : flou à la taille du jeu. La
  conversion NON fidèle est nette mais grouille de détails d'un pixel. Le bon geste pour
  une MAISON : générer l'objet 8 directions DIRECTEMENT à la taille du jeu (`size: 64`,
  sans objet de style — sa taille minimale l'interdit) et poser la vue sud-ouest telle
  quelle, sans aucune conversion : vrai pixel art, aplats francs, 20 teintes.
- **La nuit des bâtiments-moteur** (`sceneWindows.js` réécrit) :
  - les fenêtres s'allument AUSSI au médiéval, au romain et au XIXe (le détecteur des
    maisons, `houseWindows.windowPixels`, sur les scènes de ces stades) ;
  - ⚠ la lumière passe par le calque ADDITIF, après le voile bleu de la nuit : ajoutée sur
    un verre resté clair, elle sortait beige pâle. Le carreau allumé est d'abord peint
    presque noir sur la scène, puis reçoit la lumière des maisons (244,168,72) — la même
    fenêtre partout dans la ville ;
  - une COUPOLE n'a pas d'étages (l'académie moderne sortait en boule rayée) : au-dessus
    de `DOME[clé]`, une lueur douce et uniforme ;
  - les HALOS de scène (`ENGINE_HALO`) : leur part de JOUR (0,10-0,16) voilait chaque
    bâtiment d'une brume claire → 0 ; la nuit, peints avant le voile, ils sortaient en
    brouillard bleu-blanc autour des bâtiments modernes → ×0,4. Molette `__engineHalo`.
  - Les listes de verre nommé (bande 6) et le verre des maisons en nacre ont été relevés
    À NOUVEAU sur l'art reconverti (la garde « chaque couleur nommée existe dans son PNG »
    l'a signalé aussitôt). Vérifié en jeu, bandes 2, 4, 6 et 8, jour et nuit.
- Garde bâti/sol : les maisons reconverties ont retrouvé des gris trop proches du sol
  (bandes 4, 7-9) → `scripts/ecartSol.mjs` (`--darker` pour la nacre), 14 images.
- `snowRoof.test.js` : la grange dîmière nette porte un toit si mince qu'une couche plus
  épaisse y déborde et se fait rogner ; la molette d'épaisseur se teste sur le manoir.
- Reste ouvert : « d'autres dénotent » — à rejuger sur l'art net (candidats : les
  institutions médiévales blanc-gris et l'immeuble haussmannien pâle).

**2026-10-03 — les grandes fontaines des places coulent.** Raph : « les fontaines des
places ne sont plus animées... ».
- Cause : les places par sorte ont mis au centre de la place centrale une GRANDE
  fontaine (`fountain-forum`, une par ère) arrivée SANS bande d'animation ; seule la
  petite `fountain` (square, jardin) avait les siennes. `ANIM_PROPS` déclare les deux.
- Art : animation PixelLab de chaque objet 8 directions (vue sud-ouest, 8 frames),
  assemblée par `fetchPlazaAnim.mjs` puis resserrée sur l'eau par `plazaAnimMask.mjs
  --prop fountain-forum` (option nouvelle). Rejetés à la planche, puis refaits :
  - antique : gerbes en étoiles, toute la pierre redessinée (37 % du sprite) → « eau
    calme, même teinte » ;
  - médiéval : jets éteints à mi-boucle → « jets continus » ; la statuette du pinacle
    bougeait → figée ;
  - moderne : deux essais, jets éteints puis rallumés d'un coup → animé PAR LE CODE :
    un reflet monte chaque jet, une goutte se détache du sommet, l'écume bat au pied,
    des éclats s'allument sur le bassin. Boucle parfaite par construction ; zone d'eau
    écrite dans `anim/zone/` (le blanc des jets ne lit pas « bleu » au critère de
    couleur). Depuis le 04/10, la fontaine régénérée (vrai losange iso) est animée par
    `scripts/sceneLive.mjs` (cible `fountain-forum-modern`, mêmes sorties) ; l'ancien
    script, calé sur la rampe de la première image, a été supprimé (audit du 05/10,
    SCRIPT-6) ;
  - cosmique : le premier essai dérivait d'un état à l'autre → « boucle subtile »,
    anneaux immobiles.
- Raccord de boucle mesuré (dernière → première frame, rapporté au pas moyen) : 1,0 à
  1,3 ; cosmique 2,4, sur un scintillement d'anneaux invisible à l'œil.
- Test « props déclarés ↔ bandes livrées » : il comparait par PRÉFIXE (`fountain-`
  attrapait `fountain-forum-*`) → prop exact.
- Vérifié en jeu : place centrale, bande 4, les cinq ères forcées (`__plaza({ era })`),
  deux captures à 500 ms d'écart : l'eau bouge, la pierre non.

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
| V1 | L'eau : brume d'aube et de soir, poissons (ombres et sauts) redessinés, ronds de pluie au pixel, feuilles à la dérive, canards et cygnes, héron, libellules | FAIT, VALIDÉ par Raph (planche 1, `.preview-shots/planche-petite-vie-1.png`) ; éclats du soleil ajoutés après |
| V2 | Oiseaux posés qui s'envolent : pigeons (places, toits), mouettes (quais) ; retrait de la volée qui traverse | FAIT, VALIDÉ ; pigeons des toits ajoutés après |
| V3 | Terre et vent : feuilles qui tombent, papillons, chats, chiens, arbres qui bougent, linge, drapeaux, fumée au vent | FAIT, VALIDÉ (planche 2) ; DRAPEAUX ajoutés après (ponts dès la pierre, bâtiments publics, quais) |
| V4 | Lumières : halos au pixel (réverbères, lanternes), lucioles, éclats du soleil sur l'eau | FAIT, VALIDÉ : petites lueurs au pixel (lucioles, cœurs de flamme) ; grandes nappes GARDÉES lisses (essai tramé = bruit) ; ÉCLATS DU SOLEIL tentés à la demande de Raph (« tente ») |
| V5 | Ombres de nuages | FAIT, VALIDÉ (planche 2) |

Où c'est : `iso/vieArt.js` (dessins, texte pixel par pixel ; planche de contrôle
`node scripts/vieBoard.mjs`), `iso/isoVie.js` (cuisson, taille au pixel entier, acteurs
du tri peintre, passe aérienne, molette `__vie`, compteurs `__vieStats()`),
`iso/isoRiverLife.js` (eau), `iso/isoVieOiseaux.js` (pigeons des places et des toits,
mouettes), `iso/isoVieTerre.js` (chiens, chats, papillons, linge), `iso/isoVieNuages.js`,
`iso/isoVieDrapeaux.js` (bâtiments publics, quais ; les ponts appellent la même recette
`drawVieFlag` depuis isoBridge). L'ANCIENNE vie (ellipses, carrés, volée en V, molettes
`__riverLife` et `__birds`) a été SUPPRIMÉE après validation de Raph.

Journal :
- **2026-10-01, nuit — lots V1 et V2, première version.** Échelle : l'habitant fait
  ~10 px au zoom 1 ; les bêtes ×1,3 à ×1,6 de nature (canard 6 px, héron 9, pigeon 5).
  Un pixel d'art = un pixel ENTIER d'écran (round(1,135 × zoom)), jamais de rotation.
  Tout ce qui est ancré au fleuve vit sur son TRONÇON DE VILLE (`citySpan`) : le ruban
  fait 316 samples dont 88 dans la grille, et réparties sur toute sa longueur les
  familles de canards tombaient hors de la carte. Brume : trois jets — traits de 3-6 px
  (« rayures de vitesse »), puis 7-13, puis filets de 11-19 px + une nappe ×1,7 sur
  trois postes ; trame de Bayer, trois intensités, déchirures au bruit. Héron et
  mouettes : ville seulement (`urbanSet`), loin des arbres (un héron sous une couronne
  ne montrait que ses pattes), jamais sur le même poste (`vieOccupied`). Vol du héron
  à ~2,2 tuiles/s (le premier traversait la ville en 7 s). Pigeon en vol : corps sombre,
  ailes claires (gris sur gris, invisible sur le pavé). Libellule rouge (la bleue
  disparaissait sur l'eau).
  ⚠ Banc : d'autres sessions éditent `src/game/` en continu → la page du serveur de
  dev se recharge et coupe les séries. Serveur de capture SANS rechargement :
  `.claude/launch.json` « vite-capture » (port 61800, config dans le scratchpad).
  ⚠ Les ombres de poissons dépendent de `CM.layoutRecomputeAt` : chaque `__demoCity`
  les rebat, il faut rechercher l'instant d'un saut à chaque montage.
- **2026-10-01, nuit — lots V3, V4, V5, première version.** Modules : `iso/isoVieTerre.js`
  (chiens, chats, papillons, linge), `iso/isoVieNuages.js`, vent des arbres dans
  `isoVie.vieTreeSway` (greffé dans la branche `tree` d'isoLivePaint), feuilles et fumée
  dans isoAmbient, halos dans `isoStreet.addGlow`.
  - VENT : la couronne glisse d'UN TEXEL entier, par trois bandes (haut, milieu, tronc
    fixe) ; onde qui traverse la ville dans le sens de `CM.windX`. ⚠ Coupures entre
    bandes au pixel device entier (sinon ligne claire en travers de la couronne) et
    trois bandes MÊME au repos (sinon l'arbre se ré-échantillonne en passant d'un blit
    à trois et scintille). L'ombre solaire et le reflet restent sur l'image entière.
  - Tailles relevées après capture : feuille 3 px (à 2, invisible), papillon 5 × 3 (à
    3 × 2, un point), chien à robe foncée et opaque, À CÔTÉ du maître (derrière, il se
    cachait sous lui), chats et héron et mouettes à DEUX cases de tout arbre.
  - ⚠ Le mobilier des places (`isoPlazaCompositions().props`) est en PIXELS MONDE
    (`wx` = tuiles × TILE), pas en tuiles : lu tel quel, les pigeons se posaient dans la
    fontaine et les papillons volaient hors carte.
  - HALOS : l'essai tramé (Bayer) sur les grandes nappes des réverbères se lisait comme
    du BRUIT → seules les lueurs ≤ 6 px d'art passent au pixel (trois paliers francs) ;
    les nappes gardent leur dégradé. Molette `__vie({ halos: false })`.
  - NUAGES : masque cuit UNE fois par nuage à 1/13 de tuile par case, posé à un nombre
    entier de px par case ; ⚠ la frange tramée faisait un DAMIER au zoom 2,5 (cases de
    8 px, signalé par la session des maisons) → frange en dégradé, pose LISSÉE (une
    ombre de nuage est douce, comme les grandes nappes de lumière).
  - Prix mesuré sur GPU (bande 4, zoom 1, 0,75, 2) : dans le bruit de mesure. Coupés au
    palier « perf » et en vue lointaine : nuages ; en fondu sous 0,6 : toutes les bêtes.
- **2026-10-01, matin — VALIDÉ par Raph** (« je valide tout, tu peux tout faire ») et
  ses quatre réponses : drapeaux « sur les ponts à partir de la pierre, bâtiments
  publics oui, quelques-uns le long des quais » ; éclats du soleil « tente » ; pigeons des
  toits oui.
  - DRAPEAUX : une recette commune `isoVie.drawVieFlag` (hampe, épi doré, tissu qui
    part du côté de `CM.windX`, ondule avec le vent, retombe un peu par calme) ; la
    session des ponts l'appelle pour ses ponts (bandes 2 à 9). Bâtiments publics : un
    MÂT PLANTÉ DEVANT LA FAÇADE côté rue (deux pour les grands), seulement les deux plus
    grandes instances de chaque institution (sinon 126 drapeaux à l'écran). ⚠ Essayé
    d'abord SUR le toit : l'encre MESURÉE d'une scène moteur (même son profil opaque)
    dépasse le toit affiché de 15 à 30 px sur certaines scènes → drapeau en l'air. ⚠ Un
    mât devant une façade qui regarde le joueur est plus au nord que le coin sud qui
    sert de clé au bâtiment : il prend la clé du bâtiment + ε (sinon son drapeau passait
    derrière le socle). Quais : un grand mât tous les ~22 samples, rives alternées.
  - PIGEONS DES TOITS : une maison sur ~40, perchés sur la LIGNE DU TOIT lue dans le
    masque d'encre de la maison (`CM._houseBoxes`, `inkTopAt`) ; un tour toutes les une
    à deux minutes. Fiable pour les habitations (pas pour les scènes moteur, cf. plus haut).
  - ÉCLATS DU SOLEIL : une dizaine d'étincelles à la fois sur le fleuve visible, une
    demi-seconde chacune (point, petite croix, point), jour et beau temps seulement.
  - Contrôle de toutes les ères (bandes 0 à 9, vue de ville et vue du fleuve) : chaque
    couche s'allume où il faut ; cosmique (7+) sans bêtes, par choix.
- **2026-10-01, soir — les quais et leurs reflets** (Raph : « dans les reflets sur l'eau il
  reste les lumières des quais qui dénotent ; reprends les quais au passage, ils ne sont
  pas beaux et très gourmands en ressources »). VALIDÉ par Raph sur la planche
  avant/après (« je valide, retire l'ancien code ») : l'ancien tracé
  (`cityMapDrawQuays`), son canevas plein écran, `quayGlide`, les aides de cuisson avec
  marge (le quai était leur dernier client), les nappes de reflets et le relais LOD du
  liseré du fleuve (`lodFallback`) sont retirés. Molette restante : `__quayArt`.
  - DIAGNOSTIC : le reflet était une NAPPE lissée couchée en travers du fleuve
    (`drawIsoCityReflections`), sous des « lampes » qui n'étaient que des points
    lumineux sans mât ; et la brume de nuit (densité 0,35) faisait une trame de points.
  - QUAIS (`iso/isoQuay.js`) : cuits en TUILES de 128 px d'espace d'art, ancrées au monde
    (un pan, un zoom ne recuisent rien ; seules les tuiles qui contiennent du quai sont
    posées) ; au pixel : bords seuillés, grain 2 px, trois assises à hauteur ABSOLUE (en
    fraction du mur effilé elles convergeaient en rayures), joints, margelle, pied
    mouillé, bornes, garde-corps à barreaux (bandes de fonte). Trois niveaux de détail
    selon le zoom (≥ 0,7 / ≥ 0,35 / dessous) : ~100 tuiles en dézoom total, pas 1 500.
    Hauteur du mur et largeur de promenade inchangées (le pont les lit). Le bord néon
    des ères cosmiques reste tracé par l'ancien code (`cityMapDrawQuays(now, 'neon')`).
  - RÉVERBÈRES : de vrais mâts (`quayLampList` → `isoLamps`), même dessin par ère que
    les rues, un tous les 4 samples, en ville (`urbanSet` — « bâtiment voisin » n'en
    laissait que 3), jamais sur un pont ni sur un bout effilé.
  - REFLET : pour chaque réverbère allumé de la rive d'en face, une colonne de traits
    d'un pixel d'art, de la couleur de SA flamme, PEINTS (en additif l'ambre virait au
    gris-blanc sur l'eau bleue), du pied du mur au miroir de la tête. Brume : 0 en
    pleine nuit (`mistOfDay`, test `mistOfDay.test.js`).
  - PRIX, rendu logiciel (WARP, qualité « élevée », bande 4, nuit, 2 passes) : vue fixe
    et pan ≈ égaux (z1 39,6 → 40,5 i/s ; z2 51,4 → 51,8) ; ZOOM continu z1 32,8 → 35,6,
    z2 39,6 → 47,4 ; passe « quais » au profileur 0,37 → 0,05-0,11 ms, pics 18,4 → 1,6 ms
    (l'ancien recuisait son canevas plein écran à chaque cran de zoom).
  - ⚠ LOD : l'ancien quai lâchait son mur et son liseré au dézoom, et le fleuve
    reprenait alors le bas-fond partout (`lodFallback`). Le nouveau les garde à tous
    les zooms : le relais est retiré, sinon deux lignes claires se doublaient.
- **2026-10-01, nuit — garde-corps et escaliers des quais** (Raph, à la question « qu'est-ce
  qui magnifierait les quais ? » : « fais la planche garde-corps et escaliers ; on verra
  après le rework des personnages pour en faire une voie piétonne »). VALIDÉ après un
  retour (« une petite plateforme plutôt que la marche tout de suite, et une rambarde
  pour le tour de l'escalier »). Tout dans `iso/isoQuay.js`, cuit avec les tuiles du quai.
  - GARDE-CORPS sur la margelle, CÔTÉ EAU (c'est la chute qu'il protège), à hauteur de
    taille d'un habitant (3-4 px d'art) : muret de pierre (2-3), balustrade de marbre à
    pilastres (4, assortie aux ponts), fonte à barreaux et poteaux (5), verre sur montants
    d'acier (6), rampe d'énergie (7+). Il remplace l'ancienne lisse côté terre des bandes
    5-6 et les bornes d'amarrage ; coupé aux ponts.
  - ESCALIERS EN VOLUME, au pied des ponts et tous les ~14 samples en ville, sur le mur
    visible : une masse posée devant le mur qui avance dans l'eau (0,3 tuile) — palier
    d'entrée de plain-pied (8 px), marches de 2 px sur 4 (girons clairs, contremarches
    sombres), face avant, palier au ras de l'eau. RAMBARDE du modèle de l'ère tout autour :
    bout du palier, bord côté eau, descente (lisse en pente, montants sur les marches) ;
    l'ouverture du garde-corps fait la largeur du palier. Le reflet d'un réverbère part
    SOUS l'escalier (`stairFootY`). Molettes `__quayArt({ parapet, stairs })`, aide
    `__quayStairs()`.
  - ⚠ Une volée ne se lit que si elle descend dans le sens où le bord d'eau DESCEND à
    l'écran : dans l'autre, en iso, elle s'écrase en ligne plate et ses marches en damier.
    La double volée en Λ au pied des ponts, essayée, a été abandonnée pour ça.
  - ⚠ Un giron d'un pixel sur le plan du mur se lisait comme un triangle pâle et plat :
    il faut la bande du giron (du mur au nez de marche) et la face avant.
  - ⚠ À FAIRE AVEC LA VOIE PIÉTONNE : le garde-corps est cuit dans le sol, un passant sur
    la promenade de la rive d'en face passerait DEVANT lui. (Réglé : cf. l'entrée suivante.)
- **2026-10-01, nuit — les quais deviennent une promenade** (Raph : « fais-en une voie
  piétonne, en vérifiant qu'il n'y ait pas de problème avec l'autre session »). VALIDÉ.
  - ACCORD avec la session « Révision personnages/véhicules » (`PLAN-VIVANT.md`), pris
    AVANT d'écrire : les quais sont à ce chantier, son lot D (groupes, arrêts aux étals et
    fontaines) reste sur la voirie et les places ; on ne touche ni `agents.js`, ni
    `isoUnits.js`, ni `isoLiveCollect.js`, ni `CM.citizens` ; le dessin est le sien, en
    lecture (`drawIsoCitizenItem`, pseudo-habitant `{ x, y, dir, pauseT, phase, charType,
    walkDist, skinVariant }`) — mêmes costumes et métiers par ère, même ombre solaire.
  - `iso/isoQuayWalk.js` : des flâneurs f(now), sans état, sur les tronçons de promenade
    en ville ou à trois cases d'elle (`quayWalkSpans`, `quayLanePoint` d'isoQuay), un pour
    ~1,1 sample ; deux files (0,5 et 0,68 de la largeur, une par sens), un sur trois en
    couple, demi-tour aux ponts et aux bouts, arrêts face à l'eau ; ~40 % la nuit, coupés
    en LOD. Triés comme la petite vie (`registerVieActors`) à la profondeur d'un habitant.
  - Le garde-corps : les files sont tenues CÔTÉ TERRE, les pieds restent au-dessus de sa
    lisse à l'écran sur la rive d'en face — vérifié au pixel, aucun chevauchement.
  - ⚠ `cmHash` de graines voisines (« …:0o », « …:1o ») sort des valeurs voisines : les
    promeneurs d'un tronçon avançaient en paquets de 3 à 5 → brassage fmix32.
  - Coût : 0,07 ms par image pour le calcul (mesuré, 26 visibles au zoom 1), plus le dessin
    des sprites visibles, comme les passants. Molette `__quayWalk({ on, density, speed })`,
    aide `__quayWalkers()`. Reste possible : descendre les escaliers jusqu'au palier.
