# Plan — Le vivant de la carte (personnages et véhicules)

Chantier ouvert le 2026-10-01 au soir sur la demande de Raph :

> « on refait une passe sur tous les personnages/véhicules ok? »

C'est le lot 5 « Vie » de `PLAN-MAQUETTE-VIVANTE.md`, élargi à tout ce qui bouge.
**Ce document fait foi pour ce chantier.** Planche d'audit :
https://claude.ai/artifact/X7TKD4qanQs1ch3qYG8xBP

---

## 1. Les décisions de Raph (2026-10-01)

| Question | Réponse |
|---|---|
| Main des véhicules et bateaux | **Comme les habitants** : aplats et contour noir, dessinés à leur taille d'affichage. |
| Variété | **8 dessins d'habitants par ère, avec des métiers.** |
| Flotte moderne (pack MinZinn) | **Redessinée** dans la même main. |
| Comportements (files indiennes, groupes, arrêts, passants sur les tours) | **Dans ce chantier, après le pilote.** |
| Méthode | Pilote bande 4, planche, puis déroulé (comme les maisons). |
| Effet fantôme (même soir) | **Supprimé** pour habitants, émeutiers et véhicules : une unité qui passe derrière un bâtiment est cachée (`GHOST_TUNE.on = false`, `iso/isoUnits.js` ; rallumable `__ghost({ on: true })`). |

## 2. L'audit (2026-10-01, 10 ères, zoom 0,75 / 1,5 / 3)

1. Deux mains : habitants FLAT d'août (28 px) contre émeutiers « figurine » de juillet
   (92 px, densité 0,15) qui deviennent des taches sombres. La cuisson a été refusée en
   août (`PLAN-GRILLE-PIXELS.md`) : on les redessine.
2. Les « Grecs » de la bande 4 sont torse nu en pagne : on les confond avec l'âge de pierre.
3. Bandes 7-8-9 (nacre, or, cristal) : un seul set cyberpunk sombre pour les trois.
   Bande 6 : combinaisons turquoise ; ses émeutiers sont ceux de l'industriel.
4. 5 dessins par ère ; brun sur beige = invisibles au zoom de jeu.
5. Files indiennes (habitants, et même l'émeute).
6. Passants cachés redessinés à 0,70 sur l'occultant : dans les villes de tours, des
   silhouettes escaladent les façades.
7. Porteurs à panier et humains des scènes : un seul costume pour toutes les ères.
8. Attelages 68 px affichés sur 16 (0,23-0,29) ; bœuf aussi gros que son chariot ;
   véhicules des scènes trois fois plus gros que ceux de la rue.
9. Flotte moderne d'une autre main ; tram 1900 jusqu'à la bande 8 ; drones gris à
   hauteur d'homme ; pas de coque cosmique en isométrique.
10. À garder : bétail (`critters.js`), petite vie (`PLAN-MAQUETTE-VIVANTE.md` §9).

## 3. La charte du vivant (lot A)

**Une seule main pour tout ce qui bouge.**

- **Trait** : aplats francs, contour noir d'un pixel autour de toute la silhouette, pas
  d'ombrage, pas de tramage, visage à deux points. C'est la recette FLAT validée en
  août (`scripts/isoBatchRoster.json`, `_doc`).
- **Grain** : chaque image est dessinée pour sa taille d'affichage. Gens : toile 56 px
  (personnage ~28 px) + bande `-half` de 28 px pour le petit zoom. Véhicules et
  attelages : toile 64 px + `-half` 32 px. Jamais une planche 3 à 6 fois trop grande.
- **Couleur** : la couleur vive est réservée à la vie (règle de la maquette vivante).
  Chaque personnage porte UNE couleur franche et saturée (rouge, safran, bleu roi,
  vert feuille, blanc pur…) qui tranche sur les sols calmes ; jamais brun sur brun.
  Vêtement sombre = bande claire obligatoire. Peaux variées dans chaque ère.
- **Époque** : costumes et véhicules tirés de l'architecture de l'ère (bande 4 = Rome
  des domus et insulae ; bandes 7-9 = la nacre de chaque cité).
- **Toise** (adulte = 1, hauteur à l'écran) : enfant 0,7 ; bœuf 0,8 au garrot ;
  cheval 0,9. Longueur d'attelage complet ≈ 2,5 adultes ; voiture ≈ 1,6 ; bus ≈ 4 ;
  tram ≈ 5. **Un attelage = UN dessin** (bête et véhicule ensemble, comme le char) :
  plus de bête collée par le code devant une carrosserie.
- **Lumière** : haut-gauche ; aucune ombre portée dans l'image (le jeu pose l'ombre
  solaire).
- **Directions** : les 4 diagonales (rendu isométrique), marche en 6 images.

Recette PixelLab des gens (v3, size 32, `low detail`, `single color black outline`) :
« flat design pixel art character, <personnage>, solid flat color blocks, bold black
outline around whole character, no shading, no dithering, no texture, simple face with
tiny dot eyes, compact stocky proportions, large head about one third of body height,
short legs, clean shapes ». ⚠ Ne jamais écrire « slim » (sort élancé, cf. futurewoman).

## 4. Les lots

| Lot | Contenu | État |
|---|---|---|
| A | Charte (§3) | écrite (grain réel : toile 32 + `-half` 16 pour les gens, toile 68 + `-half` 34 pour les attelages) |
| B | Pilote bande 4 : 8 Romains à métiers, 4 émeutiers romains, attelages (chariot à bœuf, char, caravane) | FAIT le 2026-10-01, planche publiée, verdict de Raph attendu |
| C | Déroulé : 8 habitants par ère, émeutiers de chaque ère (moderne et cosmiques compris), porteurs et humains des scènes par ère, véhicules par ère (flotte moderne redessinée, navettes de nacre), bateaux | EN GRANDE PARTIE FAIT le 2026-10-02 (§5bis) ; restes listés au journal |
| D | La vie dans la rue : groupes, arrêts aux étals et fontaines, fin des files | PREMIÈRE PASSE FAITE le 2026-10-02 : compagnons et causettes (`COMPANIONS`, agents.js) ; arrêts aux étals et tri peintre restent |

Budget PixelLab : ~1 000 à 1 150 générations (2 720 disponibles au 2026-10-01, remise à
zéro le 2026-10-30).

## 5. Pilote bande 4 — le casting

| Fichier | Métier |
|---|---|
| `romanman` | citoyen en toge blanche à bande pourpre |
| `romanman2` | marchand, tunique safran, sacoche |
| `romanman3` | légionnaire, tunique rouge, casque de bronze |
| `romanman4` | porteur d'amphore, tunique bleu ciel |
| `romanwoman` | matrone, stola bleu roi, châle jaune |
| `romanwoman2` | prêtresse, robe et voile blancs, bandeau rouge |
| `romanwoman3` | porteuse d'eau, robe vert feuille, cruche sur la tête |
| `romanchild` | enfant, tunique orange, bulle d'or |
| `rioter-anti-*` | plébéiens en colère (torche ; lance ou fourche), mêmes aplats |

Identifiants PixelLab : `scripts/data/pixellab-vivant.json`.

## 5bis. Déroulé du 2026-10-02 — ce qui roule dans chaque ère

| Bande | Habitants (8) | Émeutiers | Véhicules d'ère (`ERA_VEH`) |
|---|---|---|---|
| 0-1 | août + pêcheur, chaman (bois de cerf), cueilleuse (`caveman3-4`, `cavewoman3`) | `stone-` redessinés (pagne orange à torche, robe rouge à torche, lanciers jaune et bleu) | — |
| 2-3 | août + moine, garde, boulangère (`villager3-4`, `villagerwoman3`) | base redessinée (capuche rouge à torche, coiffe blanche à torche, fourches jaune et violette) — sert aussi de repli à toutes les ères | chariot à bœuf (2-3), chevalier (3), marchand bâché (3) |
| 4 | Romains (`roman*`) | `anti-` | chariot à amphores, char, caravane rayée |
| 5 | août + sergent de ville, ouvrier, marchande de fleurs (`industrialman3-4`, `industrialwoman3`) | `ind-` redessinés (salopette à torche, robe verte à torche, docker à la pioche, suffragette à pancarte) | charrette de brasseur, omnibus à impériale, (tram 1900*) |
| 6 | modernes (`modern*` : costume, sweat jaune, coursier, joggeur, manteau rouge, infirmière, sacs de courses, enfant ciré jaune) | `mod-` (sweat rouge à torche, femme à pancarte) | (tram moderne*) ; voitures/bus = pack MinZinn (non refait) |
| 7 | jade (`jade*` : tunique jade, jardinier, ingénieur, savant, robe jade, botaniste, pilote, enfant à l'orbe) | `fut-` (cosmiques) | (tram magnétique ivoire et jade*) |
| 8 | stellaire (`stellar*` : astronome, coursier à réacteur, noble, marin des étoiles, chanteuse, navigatrice, jardinière, enfant au ballon) | `fut-` | (tram flottant nacre et or*) |
| 9 | cristal (`crystal*` : mage, sculpteur, moine, mineur, prêtresse, tisserande, danseuse, enfant au cristal) | `fut-` | — |

Les jeux d'émeutiers incomplets se replient par `RIOT_ERA_SWAP` (isoUnits.js).

* Trams DESSINÉS et branchés (`ERA_VEH.tram`) mais PAS EN CIRCULATION : la flotte de
rue change tout tram en voiture (cityMapRuntime.js, « pas de rails sur les rues ») et le
tram de la muraille (`computeTramRing`, juin) a disparu du code depuis. Les faire rouler
= décision de Raph (avenues sans rails ? retour d'une voie dédiée ?).

## 6. Banc et pièges

- Captures : banc CDP de la session (`mkPersos.cjs`, `runBands.sh`, serveur `vite-nohmr`).
  Émeute = `instability 0,97` + `Date.now` posé à 0,40 du cycle de 540 s.
- ⚠⚠ Arrêter une tâche de fond `bash runBands.sh` ne tue PAS ses enfants : deux
  navigateurs se disputent le port CDP 9333 et les captures gèlent au hasard. Tuer par
  la ligne de commande des processus.
- ⚠ Le profil Chrome garde la partie : une capture tuée en pleine émeute laisse la
  sauvegarde en crise → `localStorage.clear()` en tête de chaque passage.
- `isoUnits.js` et `agents.js` sont aussi modifiés par d'autres sessions : ne stager que
  ses propres morceaux.

## 7. Journal

- **2026-10-01 soir** — audit des 10 ères, planche publiée, décisions de Raph (§1),
  charte (§3). Pilote lancé : 8 Romains et 2 émeutiers en génération.
  Raph : « enlever l'effet fantôme » → éteint. Bug trouvé : `drawEraAgentIso` ne
  recevait pas `p.skinVariant` → tous les passants sortaient en variante 0 (corrigé ;
  la variante est tirée sur 12 pour couvrir des listes de 1 à 4 dessins).
  Art : les persos v3 size 32 sortent en toile 32 (et non 56 comme en août), personnage
  ~28-30 px (ratio ~0,9) → pas de `-half`, scale ≈ 0,7. Le gabarit de marche colle une
  ombre grise sous les pieds sur certaines images → `scripts/stripBakedShadow.mjs`.
  Chariot à bœuf (objet 8 directions, toile 68) : labels SUD-EST/SUD-OUEST inversés.
  Char et caravane générés avec le chariot en `style_object_id` (une seule main) ; la
  caravane a les mêmes labels inversés, pas le char. Assemblage : `scripts/fetchEraVehicle.mjs`
  (sens vrai, palette 24, `-half`) ; rendu : `ERA_VEH` (agents.js), la bête est DANS le
  dessin, plus d'attelage ajouté par le code.
  Émeutiers : l'animation v3 « arme levée » agrandit la toile à 44 OU 48 px selon la
  direction → `scripts/padStrip.mjs 48` (pieds alignés) puis scale 0,98 ; torches
  repeintes sur la rampe du feu (`reflame.mjs --mask tip --band 48x48x6`).
  PixelLab partagé : la session « Contours des cases » a demandé 4 places → 6 tâches
  max en vol pour ce chantier.
- **2026-10-01, fin de soirée** — pilote bande 4 terminé et vu en jeu (zoom 3 et zoom
  par défaut). Planche « Pilote bande 4 » ajoutée en tête de l'artefact d'audit.
  ~150 générations. Les anciennes bandes `greek*` ne sont plus servies (restent sur le
  disque). Toise des attelages : `ERA_VEH` (wagon 1,35 · char 1,3 · caravane 1,4),
  molette `__eraVeh(type, bande, { size })`. À juger par Raph : taille des attelages,
  bête de la caravane (bœuf), enfant au pixel plus fin. Erreurs de tri peintre vues en
  route (un passant ou un char dessiné sur un toit voisin) : préexistantes, à traiter
  avec le lot D maintenant que les fantômes ne les masquent plus.
- **2026-10-02 (Raph absent : « fini les ères, et fait le lot d'après »)** — commits
  LOCAUX `172b5c0` (bande 6 + lot D), `bce41f0` (bande 7), `66da4d2` (bande 8),
  `bd19ac9` (bande 9 + chariot et chevalier médiévaux), puis un dernier commit (trams,
  omnibus, brasseur, marchand médiéval, émeutiers modernes et cosmiques). Tableau §5bis.
  Lot D : un passant sur quatre environ marche accompagné (1 ou 2 compagnons accrochés
  au meneur, décalés côté chaussée ; les enfants presque toujours), et des causettes
  face à face de 2,5 à 6 s ; molette `__companions`. Les files indiennes de 15 de la
  bande 0 sont cassées en petits groupes.
  Pièges payés : file v3 PixelLab qui se fige (42 % pendant 45 min, ou « eta 60 s »
  qui retombe à 900 s) → annuler la tâche et relancer débloque ; fond gris OPAQUE sur
  une seule direction → `scripts/stripOpaqueBg.mjs` (dans la chaîne) ; une animation
  qui transforme l'objet tenu en cours de cycle (bâton → plume) se regénère DIRECTION
  par direction (`delete_animation` sur la direction puis relance dans le même groupe).
  Labels des objets 8 directions : SUD inversés sur chariot à bœuf, caravanes romaine
  et médiévale, brasseur et tram de jade (`--swap-south`) ; justes sur char, chevalier,
  omnibus et trams 1900, moderne et nacre — vérifier sur planche À CHAQUE objet.
  Avec le chariot à bœuf en `style_object_id`, la bête sort en bœuf même si le texte
  dit cheval → prendre le char (chevaux) comme style pour un attelage à chevaux.
  Émeutier cosmique « femme au bâton » : 3 prises pour le sud-ouest et le sud-est (bâton
  changé en plume, puis bâton qui disparaît) ; la 3e (« un poing levé, l'autre main tient
  le bâton ») tient. `fetchAgentFlat.mjs --pick=<id>` choisit entre deux prises d'une
  même direction ; `finalize.sh` (banc de la session) s'arrête désormais si l'assemblage
  échoue (il avait retravaillé deux bandes de juillet, restaurées par git).
  Trams : dessinés mais pas en circulation (note sous §5bis).
  NON FAIT (à voir avec Raph) : flotte moderne (voiture, bus, camion) — deux essais
  ratés (vues coupées, vue nord montrant l'avant), le pack MinZinn reste ; voiture 1900 ;
  émeutiers des bandes 0-1, 2-3 et 5 (juillet) ; 3 métiers de plus en bandes 0-1, 2-3
  et 5 ; drones (la session « Relief » tient le ciel des bandes 7-9) ; bateaux (session
  « bateaux ») ; porteurs et humains des scènes par ère ; erreurs de tri peintre.
- **2026-10-02 soir → 03 (Raph : « occupe-toi de ces trucs-là » : émeutiers des ères
  anciennes, métiers manquants, passants sur les toits)** — FAIT.
  Émeutiers des bandes 0-1 (`stone-`), 2-3 (base) et 5 (`ind-`) redessinés, 4 par ère :
  plus aucune figurine de juillet n'est servie, `RIOT_FLAT_SCALE` à 0,98 partout. 3
  métiers de plus aux bandes 0-1, 2-3 et 5 (tableau §5bis), scale = celle de l'ère
  ramenée à la toile 32 (0,75 et 0,71) pour garder la même taille de pixel.
  Ratés en route, refaits : un « orc vert » (« peau de bête verte » lu comme peau
  verte), un médiéval tout brun (le défaut « brun sur beige » de l'audit), un chaman à
  coiffe de plumes de guerre (cliché hors sujet → bois de cerf), une lance qui passe à
  l'horizontale avec deux pointes (→ formule « un poing levé, l'autre main tient la lance
  au-dessus de la tête »), une torche cachée derrière la coiffe en vue de dos (→ « torche
  tenue sur le côté »).
  **Tri peintre — mesuré, puis corrigé.** Sonde `__sortAudit` (isoRenderer, éteinte par
  défaut) + oracle de la session : pour chaque passant, véhicule ou émeutier dessiné, il
  est « sur le toit » s'il est peint APRÈS un bâtiment qui est devant lui, « avalé » s'il
  est peint AVANT un bâtiment derrière lequel il est en réalité devant, l'encre réelle du
  bâtiment (masque) couvrant son torse. Bandes 0-9 avant : **0 cas « sur le toit »**,
  **0 à 6 % d'avalés** selon la bande. Cause unique des avalés : le FRONT DE RUE pousse le
  sprite d'une maison jusqu'à 0,19 case vers sa rue et le peintre la trie à cette
  position, mais les fiches de profondeur des unités gardaient la clé du coin nu → le
  passant « remonté » devant la façade restait juste sous la clé réelle. Plus les repères
  civiques (emprises de district, absentes des fiches : observatoires de la bande 8).
  Corrigé dans `isoUnitFiches` (isoUnits.js) + test ; après : **0 avalé, 0 sur le toit**
  aux bandes 2 à 8. Non couverts par l'audit : merveilles (découpage en tranches à elles,
  refonte en cours dans une autre session), ponts, arbres.
- **2026-10-03 (retours de Raph sur le jeu)** — habitants « vus de face » à l'ère 0
  (chargement raté → repli sur le frère de même genre + relances lentes) ; « dashs »
  (rattrapage des compagnons plafonné à l'allure de marche) et feu de camp traversé (le
  foyer sort du graphe piéton, ses 8 voisins deviennent du sol) ; ombres de véhicules qui
  « volent » (pivot `slope` : un sol incliné qui passe par roues et sabots) ; passant
  debout sur un chariot (point de tri mesuré sur l'image + ordre local autour du
  véhicule, 6,5 % → 0,8 % de recouvrements mal rangés, 0 « sur le chariot »).
  **Distance entre véhicules** (« un aurige par-dessus une charrette d'amphores ») :
  règle de suivi dans `updateVehicles` (`VEH_GAP`, molette `__vehGap`) — ralentit sous
  0,5 case d'écart net, s'arrête sous 0,1, cède au carrefour à celui qui est dans son
  chemin, patience 3 s anti-nœud. Mesure (15 s, paires dont les centres sont à moins de
  80 % de leur demi-longueur cumulée) : même file, ère 4 **3,0 → 0** par instant, ère 5
  2,2 → 0, ère 6 1,05 → 0 ; véhicules arrêtés 0,1 %, plus long arrêt 0,8 s. Restent les
  croisements de la file d'en face (deux files côte à côte, le tri les range).
