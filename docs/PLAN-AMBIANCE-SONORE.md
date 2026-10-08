# Plan — L'ambiance sonore de la carte

Chantier ouvert le 2026-10-07 sur la demande de Raph :

> « on va travailler l'ambiance sonore. Pas la musique, mais les sons du jeu. Quand on est dans
> la forêt on entend le vent des arbres et des insectes, quand on est près de l'eau on entend les
> vagues, le poisson qui saute fait plouf. Quand on regarde une libellule on entend le zzz du
> battement des ailes. Quand on regarde la ville on entend le brouhaha, près de l'usine et du port
> des bruits d'usine et de port, près des pigeons on entend roucouler, près des places on entend
> parler et le bruit des enfants qui jouent, etc. Valable au zoom. En dézoomant on s'éloigne pour
> n'entendre que le son de la ville au loin avec la musique en fond qu'on ne touche pas pour
> l'instant. »

**Statut : décisions prises le 2026-10-07 (§ 9), lots 1 à 6 livrés ; lot 7 (les grands moments, § 3.10) et lot 8 (l'interface, § 3.11) livrés le 2026-10-08, lot 9 (les petits sons de la carte, § 3.12) en cours, à écouter. Reste l'épreuve des longues parties, qui revient à Raph.**
Ce document fait foi pour ce chantier.

---

## 0. En bref

- **C'est faisable, et c'est le schéma habituel des jeux de ville vus de haut** (§ 1). Le son se
  monte en trois couches :
  - des **nappes** par milieu (forêt, eau, ville…), dosées selon ce que montre l'écran ;
  - des **ponctuels** (le plouf, un roucoulement, un rire d'enfant), accrochés aux vrais
    événements de la carte ;
  - un **lointain** (la rumeur de la ville), qui prend toute la place quand on dézoome.
- **L'oreille est placée au-dessus du centre de l'écran, et le zoom règle sa hauteur.** Cette
  seule idée suffit pour tout le zoom :
  - zoomé, l'oreille frôle le sol : une libellule à deux cases s'entend ;
  - dézoomé, elle monte : tout s'éloigne, les ponctuels s'éteignent, seule la rumeur reste.

  Le dézoom n'a pas de code à lui : c'est la distance qui fait le travail.
- **Le jeu a déjà fait la moitié du chemin** :
  - un contexte audio unique (`audio/synth.js`) ;
  - une synthèse dans un Worker ;
  - un réglage de bruitages séparé de la musique ;
  - une carte qui publie presque tout ce qu'il faut entendre (§ 2).
- **La musique n'est pas touchée.** Elle reste sur sa balise `<audio>` (`core/main.js:1120`).
  L'ambiance est une troisième voie, avec son interrupteur et son volume.
- **Ce que je ne sais pas faire : écouter.** Je sais mesurer et contrôler :
  - le niveau, le spectre, la couture d'une boucle, la saturation ;
  - que les bonnes nappes montent quand la caméra bouge.

  Mais « ça sonne juste » ou « ça agace au bout d'une heure », c'est l'oreille de Raph qui le
  dit. D'où un **banc d'écoute** dans le jeu (lot 1), et une validation à l'oreille à la fin de
  chaque lot.
- **Les sons viennent de trois sources, à doser** (§ 5) :
  - la **synthèse** par le code, comme pour la machine à sous : vent, pluie, eau, insectes, feu,
    bourdons, cloches ;
  - des **enregistrements**, pour ce que la synthèse rate : voix, enfants, animaux, port, outils ;
  - la **génération par IA**, éventuellement. Elle se déclare sur Steam, comme PixelLab.

---

## 1. Comment font les autres (recherche du 2026-10-07)

Pages lues en lecture seule. **[S]** marque ce qui n'a été vu qu'en extrait de moteur de
recherche.

### 1.1 Les jeux de référence

| Jeu | Ce qu'il fait | Ce qu'on en retient |
|---|---|---|
| **Cities: Skylines II** ([page officielle](https://www.paradoxinteractive.com/games/cities-skylines-ii/features/sound-music)) | « World ambiance consists of layers that always follow the camera ». Il compte les sources et leur distance à la caméra, puis bascule entre sons proches et lointains selon la position de la caméra. « The amount of stores directly affects the sound. » | C'est notre schéma presque mot pour mot : des couches qui suivent la caméra, une densité qui fait le son, une bascule proche/lointain. |
| **Cities: Skylines** ([types d'ambiance, code d'un mod](https://github.com/Archomeda/csl-ambient-sounds-tuner)) | Des ambiances par type : monde, forêt, mer, ruisseau, industrie, place, banlieue, ville, campagne, et d'autres la nuit. Une couche de vent au dézoom. | ⚠ Des joueurs demandent à couper ce vent constant, et doivent couper toute l'ambiance pour y arriver ([forum Steam](https://steamcommunity.com/app/255710/discussions/0/611701999516841684)). **Le lointain doit rester discret et se régler à part.** |
| **Banished** ([blog du développeur](https://shiningrocksoftware.com/2013-09-25-audio/)) | S'il voit dix émetteurs de rivière à l'écran, il garde le plus fort et joue une seule boucle. Chaque zone joue ce qu'elle contient « surtout » : forêt = oiseaux et vent, champ = grillons, eau = grenouilles. L'hiver remplace tout par le vent et les branches nues. Quand la caméra monte, les sons sont noyés puis remplacés par le vent. | Un seul développeur, des échantillons mono ou stéréo, un panoramique et un volume : c'est notre échelle. |
| **Caesar III** (réimplémentation libre [Julius](https://github.com/bvschaik/julius/blob/master/src/sound/city.c)) | Chaque bâtiment **dessiné** donne une « vue » au canal sonore de son type. Un canal peut jouer à partir de 200 vues. Au plus un son de ville part toutes les 2 s, pris dans le canal muet depuis le plus longtemps, à gauche, au centre ou à droite selon l'écran. | Un city-builder iso en 2D qui écoute exactement ce que voit la caméra, en comptant ce que le peintre dessine. Chez nous, `CM._houseBoxes` fait ce compte. |
| **Factorio** ([API](https://lua-api.factorio.com/latest/types/WorldAmbientSoundDefinition.html), [FFF #396](https://cf-www.factorio.com/blog/post/fff-396)) | Ambiances par comptage : des « invisible creatures » chantent quand assez d'arbres sont dans un rayon. Un vent différent zoomé et dézoomé, en fondu. Un passe-bas lié au zoom, qui épargne la musique. Des sons de nuit au-delà d'un seuil d'obscurité. Au-delà de N instances d'un même son, les suivantes sont coupées ou baissées. | Des conditions tirées des données parce que la carte est procédurale, comme la nôtre. Des plafonds par famille. |
| **Planet Coaster** ([deep dive](https://www.gamedeveloper.com/audio/game-design-deep-dive-creating-believable-crowds-in-i-planet-coaster-i-)) | Un émetteur par visiteur a été refusé : « with 10,000 guests it would sound chaotic ». Le fond vient d'une grille grossière de densité de foule, plus une couche de détail pour les visiteurs proches de la caméra. | Le brouhaha se calcule sur la densité, jamais personne par personne. |
| **Jurassic World Evolution** ([entretien](https://www.asoundeffect.com/jurassic-world-evolution-sound/)) | Il lit les masques de rendu, calcule la part de chaque milieu et retient le milieu dominant par case de grille. Le code décide « what is important to hear ». | Notre `milieuAt` par case. |
| **OpenTTD** ([code](https://github.com/OpenTTD/OpenTTD/blob/master/src/sound.cpp)) | Un son ne joue que s'il tombe dans la vue. Le panoramique suit la position à l'écran. Le volume dépend du palier de zoom : 100, 100, 100, 75, 53 puis 3 %. | Un précédent chiffré pour la courbe du zoom. |
| **Mindustry** ([code](https://github.com/Anuken/Mindustry/blob/master/core/src/mindustry/audio/SoundControl.java)) | Les boucles d'un même son s'additionnent en une seule, plafonnée, avec un panoramique au barycentre des sources. | L'agrégation des émetteurs (§ 3.4). |
| **SimCity** de 2013 ([blog](https://beyondsims.com/2012/06/sounds-of-the-citysimcity-blog/)) | La musique est découpée en pistes : zoomer en retire et la baisse. | Une idée pour plus tard, quand on touchera à la musique. |

**Peu ou rien de documenté sur la technique** : Anno 1800 et 117, Dorfromantik, Townscaper,
Tiny Glade, Frostpunk, Manor Lords, Against the Storm, Farthest Frontier, Foundation, Kingdom Two
Crowns, Stardew Valley, RimWorld.

### 1.2 Le vocabulaire du métier

- **Nappe** (*bed*) : une boucle longue et large, par milieu.
- **Ponctuel semé** (*scatterer* chez FMOD) : des tirs au hasard, avec un intervalle minimum et
  maximum, une distance tirée et une variation de hauteur et de volume à chaque tir.
- **Conteneur aléatoire** (Wwise, Unity) : son mode *shuffle* épuise toutes les variantes avant de
  rejouer, et l'option « avoid repeating last » évite de rejouer la dernière
  ([Unity](https://docs.unity3d.com/6000.0/Documentation/Manual/AudioRandomContainer-UI.html)).
- **Voix virtuelles et vol de voix** :
  - un son inaudible n'est plus qu'émulé, sans rien coûter ;
  - au-delà d'un plafond, on coupe le plus lointain ou le plus faible
    ([Unreal](https://dev.epicgames.com/documentation/en-us/unreal-engine/sound-concurrency-reference-guide)).
- **LOD audio** : on change de représentation sonore avec la distance ou le zoom.
- **Absorption de l'air** : un passe-bas qui se ferme avec la distance
  ([Unreal](https://dev.epicgames.com/documentation/en-us/unreal-engine/sound-attenuation-in-unreal-engine)).
- **Oreille en vue de dessus** : dans un jeu de stratégie, on atténue par la distance au centre
  de l'écran, pas par la position 3D de la caméra ([straypixels](https://straypixels.net/unity-audio-mix/)).
  Notre « hauteur = zoom » (§ 3.1) en est une version physique, à régler de la même façon.
- **Sonie** : il n'y a pas de norme pour les ambiances. Les repères console sont −24 LUFS au salon
  et −18 LUFS en portable (Sony ASWG-R001,
  [source](https://audiomediainternational.com/mobile-loudness-an-adaptive-approach/)).
- **Fatigue d'écoute** : la répétition en est la première cause citée
  ([thèse](https://etheses.whiterose.ac.uk/id/eprint/38684/)).

### 1.3 Les contraintes du navigateur

- **Du Web Audio brut suffit**, environ 300 à 500 lignes. Howler n'apporterait que le chargement,
  et son mode spatial passe en HRTF, coûteux. Le jeu n'a aucune dépendance audio et n'en prendra
  pas.
- **Ce que coûtent les briques** ([padenot](https://padenot.github.io/web-audio-perf/)) :
  - une source de tampon ne coûte presque rien ;
  - le panoramique stéréo et le filtre biquad sont bon marché ;
  - le `PannerNode` en HRTF est très cher : il est exclu.
- **Un fondu de durée D** : `setTargetAtTime` avec une constante τ = D / 3
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime)).
- **La mémoire** : une minute de stéréo pèse 23 Mo décodée à 48 kHz, car `decodeAudioData`
  rééchantillonne au taux du contexte. À vérifier : décoder dans un `OfflineAudioContext` à 24
  ou 32 kHz réduirait la mémoire d'autant.
- **Les formats** :
  - de l'Ogg, Vorbis ou Opus ;
  - **jamais de MP3 pour une boucle** : son délai d'encodage casse la couture
    ([gapless](https://en.wikipedia.org/wiki/Gapless_playback)) ;
  - Safari ne lit complètement l'Ogg Vorbis que depuis sa version 18.4 : sans effet sur l'.exe
    (Chromium), à surveiller pour la version web.
- **Le démarrage** : sous Electron, la lecture automatique est permise par défaut. Dans un
  navigateur, le contexte attend un geste
  ([Chrome](https://developer.chrome.com/blog/autoplay)).
- **Un onglet en fond qui joue du son n'est plus ralenti par Chrome**
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)). Couper l'ambiance
  en fond économise donc aussi le processeur.

### 1.4 Synthèse ou enregistrement

- **La référence** est le livre d'Andy Farnell, *Designing Sound* (MIT Press, 2010). Il existe
  aussi des démos de synthèse dans le navigateur : [Nemisindo](https://nemisindo.com/) (vent, eau,
  nuit).
- **Le procédural suffit** pour les textures de bruit qui ne changent pas : vent, pluie, ressac,
  rumeur lointaine, bourdons, nappes cosmiques.
- **Il ne suffit pas** pour les voix, la foule, les enfants, les chants d'oiseaux, les pigeons.
  Même No Man's Sky, la référence du procédural, a gardé des ambiances naturelles enregistrées [S].
- **L'hybride est la voie recommandée** : des grains enregistrés, modulés par le code.

### 1.5 Ce que la recherche change au plan

- **La densité fait le son, pas la surface** (CS2, Planet Coaster) : c'est le § 3.2.
- **On compte ce que le peintre dessine** (Caesar III) : les ateliers et le port se dosent par
  `CM._houseBoxes`.
- **Une seule boucle par famille au-delà de trois émetteurs** (Banished, Mindustry, Factorio) :
  c'est le § 3.4.
- **Le lointain reste discret et se règle à part**, ce n'est pas un vent constant (leçon de CS1) :
  c'est le § 3.5.
- **Le fondu proche/lointain se fait à puissance constante**, avec un passe-bas qui se ferme au
  dézoom (Factorio 2.1) : c'est le § 3.5.
- **Une fenêtre ouverte** baisse l'ambiance de 8 dB et la filtre vers 1,5 kHz, en 250 ms : c'est le
  § 3.8.

---

## 2. Ce que la carte offre déjà (inventaire du 2026-10-07)

Chemins relatifs à `src/game/`. Inventaire en lecture seule, chaque ligne vérifiée dans le code.

| On veut entendre | Ce qui existe | Où | Déclencheur possible |
|---|---|---|---|
| Le vent dans les arbres, les insectes | Forêt sauvage : densité par bruit pur `forestDensity`, quatre essences (chêne, bouleau, sapin, pin). Arbres de ville `L.trees`. Jusqu'à 260 ancres d'arbres visibles. | `map/iso/isoWildForest.js:182-201`, `map/iso/isoAmbient.js:37-65` | Nappe dosée par la part de forêt à l'écran. Aucun insecte n'est dessiné à part les lucioles : les grillons s'entendent sans se voir. |
| L'eau, les vagues | Un seul fleuve, avec îles, bassin du Vieux-Port et port de commerce. `L.river.relationAt(gx, gy)` rend `water` / `bank` / `near` / `dry`. Le ressac de la rive est déjà animé. Plages de sable. **Ni lac ni mer.** | `map/procedural/waterModel.js:32-88`, `map/iso/isoRiver.js:166-202`, `map/iso/isoBeachCells.js:144` | Nappe « courant » et nappe « rive ». La vague sonore se cale sur la vague dessinée. |
| Le poisson qui saute | Un saut toutes les 11 s, 460 ms en l'air, seulement à l'écran, entièrement déterminé par `now`. Les poissons-ombres « gobent » toutes les 12 à 20 s. | `map/iso/isoRiverLife.js:223-265`, `map/iso/isoRiver.js:747-822` | « Plouf » à l'amerrissage (phase 1 du saut). Petit « plip » au gobage. |
| La libellule | Au printemps et en été, de jour, sans pluie, avant les âges cosmiques (bande < 7). Un élan toutes les 5 à 9 s. | `map/iso/isoRiverLife.js:494-530` | Émetteur continu (le zzz) qui gonfle à chaque élan. Portée courte : il faut être zoomé dessus. |
| Le brouhaha de la ville | Registre des figures : chaque personne peinte y est notée avec ses drapeaux (`MOVING`, `STREET`, `PLAZA`, `QUAY`, `PORT`, `RIOT`, `SCENE`). Lisible par `eachFig` / `figNear`, haché par cases de 64 px. | `map/figures.js:26-131` | Nappe dosée par le **nombre de gens** autour du centre, pas par la surface bâtie : une rue vide se tait. |
| Les places, les enfants | Places de quatre sortes (`centrale`, `marche`, `parvis`, `jardin`). Environ 10 % d'enfants parmi les gens des places, 16 % parmi les passants. Fontaines, puits, braseros, kiosque à musique en bande 5. **Pas d'aire de jeux** : les enfants sont des passants. | `map/iso/isoPlaza.js:374-377, 509-516, 616, 1266-1272`, `map/cityMapRuntime.js:2112-2117` | Nappe « conversations » près des places. Rires et cris d'enfants dosés par les enfants visibles. Fontaine en émetteur continu. |
| Les pigeons | Pigeons et mouettes en bandes 2 à 6, qui dorment la nuit. Envol quand on les dérange, atterrissage, vol de toit de 5 s toutes les 60 à 110 s. | `map/iso/isoVieOiseaux.js:184-189, 273-359` | Roucoulements près des pigeons au sol. Battement d'ailes à l'envol. Mouettes près du port. |
| Le port | Quais, ponton, Vieux-Port, port de commerce : grues à vapeur en bande 5, portiques en bande 6. Bateaux de commerce, de pêche, barges, bac, service, navettes. Événements : accostage, appareillage, ancre, départ et arrivée du bac. | `map/riverFleet.js:399-1133`, `map/iso/isoPort.js`, `map/iso/isoTradePort.js` | Nappe « port » (eau contre les coques, cordages, bois qui grince) près des quais. Ponctuels sur les événements des bateaux : cloche, chaîne d'ancre, corne rare. |
| L'usine | **Pas d'usine à part.** Les scènes des bâtiments-moteur passent au stade industriel aux ères 25 à 29 (Fonte), puis au stade 3 dès l'ère 30. On y trouve les forges et les feux de la Monnaie, les ateliers, les grues des Travaux publics et l'imprimerie. | `map/cityEngineSprites.js:1107-1342`, `engineStage` :1253 | Nappe « ateliers » près des scènes visibles (`CM._houseBoxes`), au timbre du stade : marteaux et scies, puis vapeur et fer, puis bourdon électrique. |
| Les feux | Chaque flamme visible passe par `queueFlameGlow` (14 appelants). | `map/flameGlow.js:97-124` | Crépitement en émetteur continu pour les 2 ou 3 flammes les plus proches. |
| Le bétail, les labours | Bêtes immobiles (bandes ≤ 6). Attelages de labour (bandes ≤ 5, de jour, hors hiver) qui tournent en bout de rang. | `map/layout.js:5535-5587`, `map/iso/terroirLife.js:44-80` | Meuglements et bêlements épars près des bêtes visibles. Ahan et soc qui raclent au demi-tour. |
| Chiens, chats, linge | Un adulte sur 14 promène un chien. Des chats sur les parapets. Du linge qui claque au vent. | `map/iso/isoVieTerre.js:26-279` | Aboiement **rare**. Linge qui claque quand le vent souffle. |
| Canards, cygnes, héron | Fuite devant les bateaux ; envol du héron. | `map/iso/isoRiverLife.js:289-680` | Cancans et battements d'ailes. |
| Les véhicules | Par bande : paniers (0 à 2), chariots, chars et caravanes (2 à 5), automobiles (5), circulation moderne (6), drones (7 à 9). Aussi : autoroute, métro (dès la bande 5), téléphérique, trafic aérien (7 à 9). **Aucun klaxon ni sirène.** | `map/procedural/ageVisualConfig.js:31-192` | Nappe « rue » par bande : pas, roues et sabots, moteurs, souffles électriques. |
| L'émeute | 8 à 44 émeutiers avec torches ou fourches, l'après-midi, quand l'instabilité dépasse 0,5. | `map/quaysAndRiot.js:528-690`, `map/agents.js:1840-1842` | Clameur localisée sur `CM.riotDraw`. Seul son inquiétant de l'ambiance. |
| La chute | `CHUTE` : heure de chute par tuile, secousse, poussière. | `map/iso/chuteState.js`, `map/iso/isoChute.js` | Hors ambiance. C'est un moment sonore à part (lot 7). |
| Jour, nuit, météo, saisons | Nuit : `CM.nightF`, cycle de 9 min. Pluie : `CM.rainF`. Vent : `CM.windX`, même sans pluie. Rafales : `CM.gustF`, seulement sous la pluie. Neige en hiver. Saisons : `CM.season`, 36 min chacune. **Pas d'orage.** | `map/cityMapRuntime.js:2384-2487`, `map/weatherMode.js`, `map/seasonMode.js` | Ils modulent tout : grillons la nuit, pluie, neige qui étouffe, cigales l'été. |

**⛔ Les Faits divers restent muets.** `PLAN-FAITS-DIVERS.md` § 2.7 : « Pas de son, sauf celui de
la scène quand elle est désignée (le Musicien) ». L'ambiance doit les ignorer, même l'homme-volant
qui plonge dans le fleuve : un plouf le trahirait.

**Ce qui manque et qu'il faudra écrire :**
- **Pas de carte des milieux publique.** Le seul verdict par case (`kindAt`,
  `map/iso/isoGroundResolve.js:175-261`) est une fonction privée du peintre du sol, comme le masque
  de la forêt sauvage (`isWild`). Le son aura son propre `milieuAt(gx, gy)` :
  - il s'assemble à partir des morceaux publics : fleuve, ville, routes, places, forêt, champs ;
  - il est rangé une fois par plan de ville (un octet par case) et jamais recalculé à chaque image.
- **Pas de bus de mixage.** `jouerTampon` branche chaque son droit sur la sortie (`synth.js:298`),
  sans bus maître, panoramique ni filtre. Il faut un petit mixeur.
- **Pas de bus d'événements côté carte.** Chaque ponctuel se branchera là où son événement naît
  (le saut du poisson, l'envol des pigeons, l'accostage), par un appel unique
  `paysage.evenement(nom, x, y)` qui ne coûte rien quand le son est coupé.

---

## 3. L'architecture proposée

### 3.1 L'oreille

- **Elle est au sol, au centre de l'écran**, soit `(CM.cam.x, CM.cam.y)` en pixels monde.
  ⚠ Lire la caméra **hors** de `drawIsoWorld`, qui l'accroche aux pixels puis la restaure
  (`map/iso/isoRenderer.js:151-164`).
- **Sa hauteur suit le zoom** : h = H₀ / zoom, avec un zoom qui va d'environ 0,25 à 3,125. Une
  source à r cases au sol est donc à d = √(r² + h²) de l'oreille.
- **Chaque famille a sa portée.** Une libellule s'entend à 3 cases, une cloche à 40.
- **Un filtre « air » ferme l'aigu avec la distance** : le lointain est sourd, comme en vrai.
- **Le panoramique suit la position à l'écran**, gauche ou droite, borné à ±0,6. Une source
  n'est jamais dans une seule oreille.

### 3.2 Les nappes

- **L'écran est échantillonné cinq fois par seconde.**
  - La grille est fixe, d'environ 8 × 6 points, et un peu plus large que l'écran : on entend ce
    qui est juste hors champ.
  - Les points sont pondérés vers le centre.
  - Chaque point lit son milieu, ce qui donne **la part de chaque milieu** à l'écran.
- **Le gain d'une nappe suit sa part.** La courbe est adoucie : un bosquet s'entend sans couvrir
  le reste.
- **Tout passe par un lissage** (`setTargetAtTime`, ~1 s). Un pan de caméra fait un fondu, jamais
  un saut.
- **La ville se dose au nombre de gens** (registre des figures), pas à sa surface. Une avenue
  pleine gronde ; un quartier vide, la nuit, se tait.
- **Huit milieux environ** : forêt, prairie et champs, fleuve (courant), rive (ressac), rue,
  place, port, ateliers.

### 3.3 Les ponctuels

- **Il en existe deux sortes.**
  - Les **attachés** suivent un vrai événement de la carte : plouf, envol, accostage, cloche du
    bac.
  - Les **semés** n'ont pas de support visible : un chant d'oiseau en forêt, un rire d'enfant sur
    la place, un coup de marteau à l'atelier. Leur position est tirée parmi les points
    d'échantillonnage tombés dans le bon milieu, pour que le panoramique ait un sens.
- **Des garde-fous contre l'agacement**, car le jeu tourne des heures :
  - un intervalle minimum par famille ;
  - au plus N voix par famille ;
  - jamais deux fois la même variante de suite ;
  - une hauteur et un volume légèrement variés à chaque tir.
- **Proposition : l'habituation.** Si la caméra n'a pas bougé depuis 5 minutes, les ponctuels se
  raréfient de moitié. Un jeu laissé en fond ne doit pas picorer l'oreille. Les nappes restent.

### 3.4 Les émetteurs continus

- **Ce sont des boucles attachées à un objet**, qu'il bouge ou non : libellule, fontaine, feu,
  moulin, émeute.
- **Seuls les plus proches ont une voix.** À chaque tick, pour chaque famille, les K émetteurs les
  plus proches de l'oreille sont servis, avec K de 1 à 3. Les autres se taisent : ce sont les
  « voix virtuelles » des moteurs de jeu.
- **Une voix qui change d'émetteur passe par un fondu croisé**, jamais par un clic.
- **Au-delà de trois émetteurs d'une même famille, on agrège** (Banished, Mindustry, Factorio) :
  une seule boucle, dont le gain suit log(1 + n) et dont le panoramique est le barycentre des
  sources. Dix feux à l'écran ne font pas dix crépitements.

### 3.5 Le lointain et le zoom

- **Une seule variable, la proximité p**, entre 0 et 1, pilote les couches. Elle se tire du zoom
  sur une échelle logarithmique : p = 0 vers le zoom 0,45, p = 1 au-delà de 1,4 environ. Les
  valeurs sont à régler.
- **Chaque couche suit p** :

  | Couche | Gain |
  |---|---|
  | Ponctuels, émetteurs | ∝ p² : ils disparaissent les premiers |
  | Nappes | ∝ 0,25 + 0,75 p, et de plus en plus filtrées |
  | Lointain | ∝ (1 − p) × la taille de la ville |

- **On n'entend jamais ce qu'on ne peut plus voir.** Les seuils se calent sur ceux de l'image :
  - la petite vie s'efface entre 0,62 et 0,5 (`vieZoomFade`, `map/iso/isoVie.js:93-96`) ;
  - les poissons s'arrêtent sous 0,5 ;
  - la forêt est cuite dans le sol sous 0,5.
- **Le passage du proche au lointain se fait à puissance constante**, avec des gains en cosinus
  et en sinus : le volume total ne creuse pas au milieu du zoom. Un passe-bas sur le groupe
  proche se ferme d'environ 16 kHz à 3 kHz quand on dézoome (comme Factorio 2.1).
- **Le lointain est une rumeur large et sourde, propre à l'âge**, dosée par la taille de la
  ville. Si l'écran est surtout de la nature, un vent d'altitude s'y ajoute.
- ⚠ **Le lointain doit rester discret.** C'est la leçon de Cities: Skylines, dont le vent
  constant au dézoom agace les joueurs (§ 1.1). Il a son propre curseur dans le banc d'écoute ;
  s'il gêne à l'usage, il aura aussi le sien dans les Options.
- **Mesuré au lot 6** : dézoomé, le lointain sortait 6 à 11 dB AU-DESSUS du proche (sonie
  pondérée K, au Feu, sur la grande ville de la partie de vérification). Une rumeur à pleine présence
  pèse autant qu'une nappe qui remplirait l'écran, quand de près chaque nappe ne joue qu'une
  part de l'écran. Le bus du lointain joue donc d'un bloc à 0,4, soit −8 dB (`LOINTAIN_BUS`) :
  son équilibre interne, que Raph a validé, ne bouge pas. Même lieu, mêmes zooms :

  | Zoom | 2,4 | 1,5 | 1 | 0,7 | 0,45 | 0,3 |
  |---|---|---|---|---|---|---|
  | avant (dB, pondérés) | −55,7 | −48,6 | −50,5 | −45,9 | −45,4 | −44,2 |
  | après | −53,3 | −52,1 | −52,9 | −50,8 | −53,3 | −53,1 |

  Le proche varie de 2 à 3 dB d'une mesure à l'autre (les sons semés, l'heure) ; le lointain,
  lui, a bien perdu ses 8 dB. Le curseur « lointain » du banc le règle à l'oreille.
- **La ville qu'on voit** (lot 6, retour de Raph : « en dézoom max, si le joueur regarde la
  forêt, il entend quand même le bruit lointain de la ville ; il faudrait n'entendre que le bruit
  doux de la végétation »). La rumeur et ses couches d'âge suivent la part de ville à l'écran,
  pleines dès le quart (au dézoom maximal, une ville centrée en couvre 0,29 au Feu), et non plus
  la seule taille de la ville. Au-dessus des bois, une couche `lointainForet` prend sa place : le
  feuillage joué plus grave, assourdi par le bus du lointain. Le vent d'altitude se retire, lui
  aussi, devant la ville qu'on voit. Chaque couche lointaine se place du côté de ce qu'elle
  dit : la rumeur du côté de la ville, la végétation du côté des bois.

  Mesuré, tout chargé, au-dessus d'une forêt sans ville à l'écran : au zoom 0,3, la végétation
  −50,4, le vent −55,9, aucune rumeur ; de près (zoom 1,6), la forêt −43,7. Au loin, la forêt
  s'entend donc 7 dB plus bas que de près, et plus du tout la ville.

### 3.6 Les âges

Les 10 bandes (`data/eraThemes.js`, `eraBandOf`) donnent 5 familles sonores pour la ville :

| Bandes | Famille | Ce qu'on entend |
|---|---|---|
| 0-1, Feu et Bois | Campement, village | voix éparses, bois qu'on fend, feux, bêtes, tambour lointain |
| 2-4, Pierre, Couronne, Marbre | Bourg, cité | marché, roues et sabots sur la pierre, marteaux, cloches |
| 5, Fonte | Ville de fer | vapeur, fer, fiacres, premières automobiles, grues à vapeur, kiosque |
| 6, Néon | Ville moderne | circulation douce, bourdon électrique, métro, portiques du port |
| 7-9, cosmiques | Ville de lumière | nappes et souffles, navettes, carillons de verre ; peu ou pas d'oiseaux |

- **La nature change peu** : les mêmes oiseaux de l'âge du Feu au Néon.
- **Un changement d'âge, rare, se fait en fondu** de quelques secondes.
- **Seuls les sons de la famille courante sont en mémoire.**

### 3.7 Le temps qu'il fait

- **La nuit** (`CM.nightF`) :
  - les oiseaux laissent place aux grillons, à la chouette et aux grenouilles près de l'eau ;
  - la ville se calme, car les passants rentrent (`_nightHidden`) ;
  - les pigeons dorment, ce que le code fait déjà.
- **La pluie** (`CM.rainF`, `CM.gustF`) :
  - une nappe de pluie, sur les feuilles en forêt et sur les toits en ville ;
  - des rafales calées sur celles qui sont dessinées ;
  - les insectes et les oiseaux se taisent.
- **Le vent** (`CM.windX`) : la force du vent dans les arbres le suit, même par temps sec.
- **La neige** : le monde s'assourdit (filtre global) et les ponctuels se font rares.
- **Les saisons** : cigales en été, grillons à l'automne, hiver presque muet (corbeaux).
- **Pas d'orage dans le jeu**, donc pas de tonnerre.

### 3.8 Interface et états

- **Options › Son** gagne deux lignes : « Ambiance » (interrupteur) et « Volume de l'ambiance ».
  L'infobulle de « Musique », qui dit aujourd'hui « Ambiance sonore de fond », est à corriger.
- **Dans le code, le module s'appelle `src/game/audio/paysage/`**, pas « ambiance » :
  `map/ambianceMode.js` et `CM.ambianceK` désignent déjà le réglage « Mouvement ».
- **La carte n'existe que dans l'onglet Cité** (`src/App.jsx:656` ; ailleurs elle est démontée).
  Proposition : ailleurs, l'ambiance s'éteint en fondu. → question 5.
- **Une fenêtre modale fige la carte** (`src/components/map/CityMapCanvas.jsx:25`). Proposition :
  l'ambiance s'assourdit en 250 ms (−8 dB, passe-bas vers 1,5 kHz), comme la ville derrière une
  fenêtre. → question 5.
- **Onglet caché ou .exe réduit : silence**, sur le modèle de « Musique seulement en onglet
  actif ». Le fondu de sortie est suivi d'une mise en veille du contexte. Bonus : un onglet qui
  joue du son n'est plus ralenti par Chrome, se taire en fond rend donc aussi le processeur.
  → question 5.
- **Le contexte audio s'endort** après 30 s sans son (MEM-10, `synth.js:238-257`). Il reste
  éveillé tant que l'ambiance joue et se rendort quand elle se coupe.
- **Le démarrage attend le premier geste du joueur** (règle des navigateurs), comme la musique.

### 3.9 Budget

- **Rien n'est calculé à chaque image.**
  - Le paysage tourne sur son propre minuteur, hors de l'image : dix passages par seconde pour
    le proche (ponctuels, émetteurs) ; un sur deux relit aussi l'écran pour les nappes
    (`ECHANT_MS`, 190 ms).
  - Sans allocation : tableaux réutilisés.
  - Il lit ce que le peintre a déjà calculé (règle de `PERF-CARTE-REPRISE.md`) : les figures de
    la dernière image, les émetteurs déposés au guichet.
  - Coût visé : moins de 0,2 ms par passage.
  - **Mesuré au lot 6**, à la Couronne, sur une grande ville au zoom 0,75 :
    - 0,3 ms par passage qui relit l'écran, dont 0,17 ms pour les milieux (48 points) et
      0,04 ms pour la foule ;
    - 0,02 ms par passage léger ;
    - soit 2 ms par seconde environ, hors de l'image : la carte n'en sent rien.
- **Les voix.**
  - Chaque nappe montée joue deux têtes de lecture, même muette (son gain à 0) : 17 nappes à
    la Couronne, 34 sources. S'y ajoutent les émetteurs (trois voix au plus par famille) et les
    ponctuels.
  - Chaque source a un `StereoPanner`, un `Gain` et parfois un filtre.
  - Pas de `PannerNode` HRTF : il est inutile en 2D et coûteux.
  - Non mesurée : la charge du fil audio (le navigateur ne l'expose pas). Piste, si une machine
    modeste craque : suspendre une nappe muette depuis longtemps.
- **La mémoire.**
  - Un son décodé pèse durée × fréquence × canaux × 4 octets.
  - Les enregistrements se décodent à 32 kHz, leur fréquence, dans un `OfflineAudioContext` :
    le contexte du jeu les décoderait à 48 kHz, une fois et demie plus lourds. Une boucle mono de
    30 s pèse 3,8 Mo.
  - **Seuls se chargent les sons de l'âge en cours** (lot 6) : une définition porte `ages: [de,
    à]` (bandes de `data/eraThemes.js`) ; sans `ages`, elle joue à tous les âges. Au
    changement d'âge, le reste se libère.
  - **La pluie et la clameur ne se chargent qu'au besoin** (`charge`) : quand il pleut (pas
    l'hiver, où la pluie tombe en neige), quand des émeutiers sont près de l'écran. Elles restent
    deux minutes après la fin : une averse qui reprend ne recharge rien.
  - Le banc d'écoute ouvert charge tout, pour qu'on y écoute n'importe quel son ; fermé, la carte
    revient aux sons de son âge.
  - Le budget de 40 Mo visé au départ ne tient pas sans abîmer le son. **Un âge tient sous 70 Mo,
    sous 76 Mo sous l'averse d'une émeute** : `__tests__/paysageMixage.test.js` le garde.

    | Âge (bande) | Mo décodés |
    |---|---|
    | Feu (0) | 50,4 |
    | Bois (1) | 53,5 |
    | Pierre taillée, Couronne, Marbre (2 à 4) | 66,5 |
    | Fonte (5) | 67,8 |
    | Néon (6) | 62,7 |
    | Noosphère, stellaire, Démiurge (7 à 9) | 38,9 |
    | tout à la fois (avant le lot 6 ; le banc ouvert) | 82,7 |

    Mesuré dans le jeu : 50,4 Mo au Feu, 66,5 à la Couronne, 71,6 sous l'averse, 38,9 aux âges
    cosmiques, comme l'estimation du test.
- **La largeur sans la stéréo** : une nappe mono jouée par deux têtes de lecture décalées de plus
  de 10 s, panoramiquées à ±0,4, sonne large pour moitié moins de mémoire.
- **Le poids livré** : 10 à 20 Mo d'Ogg visés pour tout le paysage ; **4,4 Mo mesurés** au lot 6
  (68 fichiers, mono, 32 kHz, Vorbis). ⛔ Jamais de MP3 pour une boucle.
- **Les fichiers sont déclarés** par `import.meta.glob`, comme les musiques, et jamais sondés
  par URL. C'est la leçon de l'.exe : une chaîne de replis d'URL demande tous ses maillons.

### 3.10 Les grands moments (lot 7)

Raph a choisi, le 2026-10-08, de faire sonner les grands moments du jeu avant l'interface.
Ce ne sont pas des sons de la carte : ils suivent **Options › Son › Bruitages**, comme les jeux
de la Maison des Plaisirs, et passent par leur propre gain et leur limiteur
(`src/game/audio/moments/`). Tout est **synthétisé** (`momentsSynth.js`) : BigSoundBank n'a
aucun vrai effondrement, aucun grondement continu, ni glas ni grand gong (§ 5.10).

- **Le guichet** (`annonces.js`, module-feuille) : le cœur du jeu et la carte y annoncent un
  moment, le lecteur (`moments.js`) s'y abonne. Rien n'est importé dans l'autre sens.
- **La chute.**
  - Tenir « Effondrer la Cité » fait monter un grondement, qui se tait si l'on lâche.
  - **La musique descend** à 20 % dès le début de la séquence, et **revient à l'aube** du
    cycle suivant (décision de Raph). Un filet la rend quoi qu'il arrive : 20 s après la fin
    annoncée, 3 min après le début.
  - Quand la carte joue la vague, `isoChute.js` relève les bâtiments de l'écran qui tombent
    (`CHUTE.sons` : leur instant, leur place, leur poids). Le grondement suit la **densité** des
    chutes. Les douze plus lourds (cinq dans la version courte) s'effondrent chacun à leur
    instant, de leur côté de l'écran, jamais deux à moins de 220 ms. Des gravats roulent
    entre eux, et encore un peu à la nuit.
  - La matière suit l'âge : du bois au Feu et au Bois, de la pierre de la Pierre taillée au
    Marbre, du fer, du verre et des gravats à la Fonte et au Néon, du cristal aux âges
    cosmiques.
  - Un saut (clic, Échap) ne joue pas d'un coup les effondrements qu'il passe.
  - Au deuil, **le glas** : trois coups de grosse cloche. Sans carte pour jouer la chute,
    il reste le glas, puis la musique revient.
- **Un nouvel âge** : une frappe discrète, celle de l'époque (le grand tambour au Feu, le
  tambour à fente au Bois, le lithophone, le bronze, le gong, la cloche de fer, le carillon
  électrique, le cristal). **Une nouvelle époque** : un bourdon qui monte et trois frappes, la
  musique s'efface un instant. **Jamais pour un âge franchi pendant une absence rejouée**
  (`rattrapageRecent`, main.js) ; deux âges d'affilée ne font qu'un son.
- **Une maison qui sort de terre** (la pastille dorée, `cityMapRuntime.js`) : un coup de
  maillet, de pierre, de marteau ou de cristal, de son côté de l'écran, **seulement après un
  achat à la main**. Un achat de masse fait une courte rafale ; les automatisations ne font
  aucun bruit. Au camp du Feu, aucune maison ne sort ainsi de terre : rien ne sonne.
- **Le Grand Reset** : le sceau réclamé (un souffle qui enfle, puis un gong très grave, la
  musique s'efface), puis le renouveau (trois notes claires) quand la cité neuve paraît.
- **La mémoire** : seuls les sons de la matière et de l'âge en cours sont prêts, rendus dans
  le Worker des sons huit secondes après le lancement. Quatorze sons, environ 6 Mo décodés.
- **Le banc d'écoute** (Ctrl+Alt+B) a une section « Grands moments » : chaque famille s'y
  écoute (▶) et s'y règle, ses réglages partent avec « Copier les réglages ».

### 3.11 L'interface (lot 8)

Raph a choisi, le 2026-10-08, quatre sons d'interface parmi ceux proposés. Comme les grands
moments, ils suivent **Bruitages**, sont synthétisés et plus discrets encore : ils reviennent
souvent.

- **L'achat à la main** : un « toc » léger dans la matière de l'âge, pour tout achat cliqué
  (un bâtiment, la voirie, une amélioration, la boutique de Faveur, un artefact du temple).
  Il part 70 ms après le clic, sauf si une maison sort de terre entre-temps : on n'entend
  alors qu'elle, de son côté de l'écran. Un achat de masse : deux tocs. Un toc au plus
  toutes les 70 ms quand on clique en rafale. L'automatisation reste muette.
- **La bulle d'un passant**, cueillie : des pièces (l'or), un parchemin et une note claire (le
  savoir), du grain qui coule (la nourriture).
- **Un succès débloqué** : quatre notes claires qui montent. Deux succès collés, un seul
  carillon. Rien pendant la chute ni pendant une absence rejouée (le succès s'annonce déjà
  ainsi).
- **L'alerte de crise** : un coup de cloche grave quand la Rupture ou l'Usure franchit 75 %,
  deux à 90 % (le second un triton plus bas, sur un grondement qui enfle) ; la musique
  s'efface un instant. Une fois par franchissement, réarmée à 65 % et 80 % ; rien au
  chargement d'une partie déjà en crise, ni pendant la chute, ni après une absence rejouée.
- **Écartés par Raph** (2026-10-08) : l'achat impossible, les onglets et menus, la fenêtre
  d'événement qui s'ouvre. ⛔ Ne pas les reproposer.

### 3.12 Les petits sons de la carte (lot 9)

Les sons de priorité 3 du § 4 (27 à 30), sur ce que la carte dessine. Ce sont des sons du
paysage (réglage **Ambiance**). Le relevé de la carte du 2026-10-08 a corrigé le plan : il n'y a
plus de moulin à eau (tous les moulins sont à vent depuis le 2026-07-28), et le seul lieu de
culte est le culte ancestral.

- **Les moulins** (`iso/isoMill.js`) : synthétisés (`paysage/paysageSynthLieux.js`).
  - Le moulin, jusqu'à la Fonte : une aile passe toutes les 1,7 s (comme à l'image), le bois
    de l'arbre grince une fois par tour, le mécanisme cogne sourdement.
  - L'éolienne du Néon : trois pales qui fendent l'air, la nacelle qui ronronne.
  - Le pylône de cristal des âges cosmiques se tait.
- **Les cloches des lieux de culte**, rares (une toutes les cinq minutes environ), au loin,
  synthétisées, une matière par époque :
  - le tambour rituel (Feu) et le tambour à fente (Bois), aux mégalithes ;
  - la pierre qui sonne (Pierre taillée), au sanctuaire ;
  - le bronze (Couronne, Marbre), au sanctuaire et au temple de Vesta ;
  - la cloche de l'église (Fonte, Néon), au mausolée et au mémorial ;
  - le cristal (âges cosmiques), à la flèche.

  La **Cathédrale inachevée**, une fois dressée, a aussi sa cloche d'église, de la Pierre
  taillée au Néon. Le feu du culte (lot 4) continue de crépiter.
- **Les bêtes qu'on voit**, enregistrées. Sans fichier, elles se taisent.
  - Le canard (un par famille, plus franc quand il nage), le cygne, le héron (posé ou en vol)
    sur le fleuve (`iso/isoRiverLife.js`).
  - Le chat des quais et le chien promené (`iso/isoVieTerre.js`), le chien et le chat posés
    dans la rue (`iso/isoLivePaint.js`).
  - Le chien tout près réemploie les fichiers du chien au loin (`famille: 'chien'`) : il
    sonne déjà.
- **La mémoire** : moulins, cloches et bêtes ne se chargent que quand ils passent à l'écran
  (conditions `moulin`, `temple`, `eau`, `betes` de `majCharge`, gardées deux minutes).
  Le budget par âge du § 3.9 ne bouge pas.

---

## 4. La liste des sons

- **Couche** : N = nappe, P = ponctuel, É = émetteur continu, L = lointain.
- **Source** : S = synthèse par le code, E = enregistrement, IA = génération.
- **Priorité** : 1 = demandé par Raph, 2 = complément naturel, 3 = plus tard.

| # | Famille | Couche | Contenu | Source | Âges | Prio |
|---|---|---|---|---|---|---|
| 1 | Forêt | N | vent dans les feuilles, force réglée par `windX` | S | tous | 1 |
| 2 | Forêt | P semé | oiseaux de jour, pic, coucou | E | 0 à 6 | 1 |
| 3 | Forêt, prairie | N | insectes de jour, cigales l'été | S | 0 à 6 | 1 |
| 4 | Nuit | N + P | grillons (S), chouette et grenouilles (E) | S + E | 0 à 6 | 2 |
| 5 | Fleuve | N | le courant | S ou E | tous | 1 |
| 6 | Rive | N | ressac et clapotis, calés sur le ressac dessiné | S ou E | tous | 1 |
| 7 | Poisson | P attaché | plouf au saut, plip au gobage | S ou E | tous | 1 |
| 8 | Libellule | É | zzz qui gonfle à chaque élan | S | 0 à 6 | 1 |
| 9 | Rue | N | brouhaha par famille d'âge, dosé par les passants | E | par famille | 1 |
| 10 | Place | N | conversations proches | E | par famille | 1 |
| 11 | Place | P semé | enfants qui jouent : rires, appels, course | E | 0 à 6 | 1 |
| 12 | Pigeons | P attaché | roucoulements, battements d'ailes à l'envol | E | 2 à 6 | 1 |
| 13 | Port | N | eau contre les coques, cordages, bois qui grince | E | 1 à 6 | 1 |
| 14 | Ateliers, industrie | N + P | marteaux et scies, puis vapeur et fer, puis bourdon | E + S | par stade | 1 |
| 15 | Lointain | L | rumeur de la ville par famille d'âge | E + S | par famille | 1 |
| 16 | Rue | N | pas, roues et sabots, moteurs, souffles | E + S | par bande | 2 |
| 17 | Place | É | fontaine, puits | S ou E | 1 à 6 | 2 |
| 18 | Mouettes | P semé | près du port et du fleuve | E | 2 à 6 | 2 |
| 19 | Bateaux | P attaché | cloche (S, `synth.js` la sait déjà), chaîne d'ancre, corne rare | S + E | 1 à 9 | 2 |
| 20 | Feux | É | crépitement | S | tous | 2 |
| 21 | Bétail, labours | P semé | meuglements, bêlements, soc | E | 0 à 6 | 2 |
| 22 | Pluie | N | sur les feuilles, sur les toits, rafales | S | tous | 2 |
| 23 | Neige | filtre | le monde assourdi | S | tous | 2 |
| 24 | Émeute | É | clameur | E | tous | 2 |
| 25 | Cosmique | N + P | bourdon de ville, navettes, carillons de verre | S | 7 à 9 | 2 |
| 26 | Vent d'altitude | L | dézoom sur la nature | S | tous | 2 |
| 27 | Canards, cygnes, héron | P attaché | cancans, envols | E | 0 à 6 | 3 |
| 28 | Chiens, chats | P attaché | aboiement, miaulement, très rares | E | tous | 3 |
| 29 | Moulins | É | ailes et bois qui grincent | E ou S | 0 à 5 | 3 |
| 30 | Temple, culte | P | cloche ou gong rare, selon l'âge | S | tous | 3 |

**Hors ambiance, pour plus tard** (lot 7) :
- la chute : grondement, effondrements ;
- l'apparition d'un bâtiment acheté ;
- le clic sur une bulle de récompense ;
- la Maison des Plaisirs la nuit : un bastringue lointain, que la synthèse de la scène sait déjà
  jouer.

**Deux sons sans image, à savoir :**
- **Les enfants qui jouent.** Aucune scène de jeu n'est dessinée : les enfants sont des passants
  parmi d'autres. Le son peut exister sans image, mais une petite scène d'enfants qui jouent sur
  les places lui donnerait son image. Ce serait un chantier d'art à part.
- **Les vagues.** Il n'y a ni mer ni lac : les « vagues » sont le ressac du fleuve sur ses rives
  et ses plages.

---

## 5. Où trouver les sons

### 5.1 Trois sources, à doser

| Source | Pour | Contre | Bon pour |
|---|---|---|---|
| **Synthèse par le code** | Aucun fichier, aucune licence, des variations infinies, presque pas de mémoire. C'est déjà la manière du jeu (machine à sous, mélodie de la scène). | Rate les voix, les animaux et les objets complexes. | Vent, pluie, eau, ressac, insectes, libellule, feu, cloches, bourdons, sons cosmiques ; le plouf est passable. |
| **Enregistrements** (packs) | Le réalisme. | Licences à tenir, poids, répétition, nettoyage. | Voix, enfants, pigeons, mouettes, bétail, oiseaux, port, ateliers. |
| **IA** (§ 5.4) | Rapide, sur mesure, boucles natives. | Déclaration Steam, babil au lieu de voix, aucune reproductibilité. | Textures (vent, eau, pluie, feu), cris d'animaux, plouf ; pas les foules ni les cloches. |

### 5.2 Les gratuits (recherche du 2026-10-07)

Pages lues sans rien télécharger. Les clauses sont résumées ; le texte exact est à l'adresse
donnée. Les pages marquées **[S]** (itch.io, ZapSplat, BBC) n'ont été lues qu'en extrait : à
relire avant de télécharger.

**Les cinq à ouvrir en premier**

| Source | Licence | Pourquoi |
|---|---|---|
| [Freesound](https://freesound.org), filtré CC0 | Par fichier : CC0 (383 000 sons), CC BY, CC BY-NC. Compte requis. | **Le plus grand fonds.** Pour filtrer, ajouter `&f=license:"Creative Commons 0"` à l'adresse d'une recherche ([exemple en forêt](https://freesound.org/search/?q=forest+ambience&f=license%3A%22Creative+Commons+0%22)). **Quatre preneurs de son publient presque tout en CC0** :<br>· **felix.blume** : 2 424 sons, enregistrés dans le monde entier. On y trouve du brouhaha dans des langues qu'on ne comprend pas, et des abeilles.<br>· **kyles** : 5 632 sons de villes, d'hiver, d'atelier de métal.<br>· **Nox_Sound**.<br>· **SignatureSoundsOrg**. |
| [BigSoundBank](https://bigsoundbank.com), de Joseph Sardin | [CC0](https://bigsoundbank.com/licenses.html), crédit apprécié | **3 500 sons de studio** (48 kHz, 24 bits), rangés par catégorie :<br>· ambiances : ferme, forêt, industrie, marché, port, lieux de culte, ville ;<br>· animaux et oiseaux ;<br>· eau, pluie, vent ;<br>· cloches (89), machines, outils, feu ;<br>· foules, enfants compris.<br>⚠ Les foules sont enregistrées en France : on y comprend le français. |
| [Nox Sound, « Essentials Series »](https://nox-sound-design.itch.io/essentials-series-sfx-nox-sound) [S] | CC0 | **1 639 sons**, dans un zip de 733 Mo :<br>· 18 ambiances : cigales, feu, oiseaux de forêt, nuit, pluie, rivière, ruisseau, vent… ;<br>· 71 bourdons électriques, pour le Néon et le cosmique ;<br>· des pas sur 13 sols. |
| [Sonniss #GameAudioGDC](https://sonniss.com/gameaudiogdc) | [Licence gratuite v2.0](https://sonniss.com/gdc-bundle-license/) : commercial, à vie, sans crédit | **Des centaines de Go de sons professionnels**, en une archive par année : 2015 à 2024, puis 2026 (pas d'édition en 2025).<br>⚠ C'est énorme, et le contenu par catégorie n'est pas documenté.<br>⚠ Redistribution interdite, même d'un son modifié. Entraînement d'IA interdit.<br>Raph les télécharge lui-même, une année à la fois. |
| [Signature Sounds](https://signaturesounds.org) | CC0, annoncé dans chaque pack | **Plus de 100 packs** :<br>· des villes du monde : Le Caire, Kosovo, Monténégro ;<br>· des cloches, de la pluie ;<br>· des nappes « interstellaires », pour les âges cosmiques. |

**Les autres**

| Source | Licence | Note |
|---|---|---|
| [99Sounds](https://99sounds.org/license/) | Commercial, sans crédit, redistribution interdite | Pluie et orage (64 sons), bourdons électriques. |
| [Mixkit](https://mixkit.co/free-sound-effects/ambience/) | Commercial, jeux cités, sans crédit | 170 ambiances courtes : aire de jeux, ferme, rivière, feu de camp, bourdon industriel. |
| [Pixabay](https://pixabay.com/service/license-summary/) | Commercial, sans crédit | 5 566 ambiances. Mais aucun droit n'est garanti, et beaucoup sont des copies de Freesound sans provenance : prendre l'original sur Freesound. |
| [OpenGameArt](https://opengameart.org) | Par fichier | [Park Ambiences](https://opengameart.org/content/park-ambiences) en CC0 (oiseaux, rivière, vent). [Scifi City Ambient Loop](https://opengameart.org/content/scifi-city-ambient-loop) en CC0. |
| [Kenney](https://kenney.nl/assets/category:Audio) | CC0 | Aucune ambiance. Des impacts et des sons de science-fiction, pour les chantiers et le cosmique. |
| itch.io, [tag « ambience », gratuits](https://itch.io/game-assets/free/tag-ambience) [S] | Par pack | Trois packs :<br>· [Free City Ambiences](https://rawambience.itch.io/free-city-ambiences) de rawAmbience : 21 min de ville ;<br>· [Ultra Sci-Fi Ambience](https://eberzins.itch.io/ultra-sci-fi-game-audio-ambience-pack) d'Eric Berzins : 15 boucles, sans crédit ;<br>· [Untamed Nature](https://alex-jauk.itch.io/free-sound-package-untamed-nature) d'alex_jauk.<br>La licence est souvent dans le zip : inconnue tant qu'on ne l'a pas ouvert. |
| ZapSplat, Free To Use Sounds, Quick Sounds | Crédit **obligatoire** en gratuit | Utilisables, mais chaque son ajoute une ligne de crédit. |
| Soundly, version gratuite | Commercial, jeux inclus | 3 000 sons, dans une application à installer. |

**⛔ À éviter**
- **BBC Sound Effects** : la licence RemArc est **non commerciale**. L'usage commercial se paie
  chez Pro Sound Effects : 5 $ le son, ou 1 999 $ pour tout le fonds
  ([source](https://blog.prosoundeffects.com/how-to-license-bbc-sound-effects-to-use-in-your-commercial-productions)).
- **Tout son Freesound en CC BY-NC ou Sampling+.**
- **Gregor Quendel** : ses licences se contredisent d'un site à l'autre, et sur le sien c'est du
  CC BY-NC.
- **craigsmith sur Freesound** : il verse en CC0 des bibliothèques de studios hollywoodiens. La
  chaîne des droits est douteuse.
- **Sound Jay** : il interdit de se servir de ses sons comme matière première, donc de les
  mélanger à d'autres.
- **Les packs itch générés par IA sans le dire.** Exemple : un pack de ferme qui renvoie à la
  licence Stability.

**Où chercher d'abord, famille par famille.** Les sons cités ont été vérifiés CC0 un par un. Le
reste de chaque pack ne l'a pas été.

| Famille | Premières pistes |
|---|---|
| Forêt, vent | Freesound [Gutek](https://freesound.org/people/Gutek/packs/12852/), [Cinetony](https://freesound.org/people/Cinetony/packs/31291/) ; Nox ; BigSoundBank |
| Grillons, cigales | Freesound [simous00 (Crète)](https://freesound.org/people/simous00/packs/45605/), [mariethompson](https://freesound.org/people/mariethompson/packs/29093/) ; Nox |
| Oiseaux | BigSoundBank (109 sons) ; felix.blume, kyles ; Nox |
| Rivière | Freesound [Pfannkuchn](https://freesound.org/people/Pfannkuchn/packs/25904/), [Auxide_Audio](https://freesound.org/people/Auxide_Audio/packs/32942/) |
| Rive, clapotis | BigSoundBank (eau) ; klankbeeld sur Freesound (CC BY, crédit obligatoire) |
| Plouf | [paulprit](https://freesound.org/people/paulprit/sounds/507092/). Peu de choix (9 sons CC0) : des éclaboussures de BigSoundBank retravaillées, ou la synthèse. |
| Libellule | [antoineopeng](https://freesound.org/people/antoineopeng/sounds/447319/), [jaegrover](https://freesound.org/people/jaegrover/sounds/240549/). Peu de choix : la synthèse. |
| Brouhaha indistinct | felix.blume au [Maroc](https://freesound.org/people/felix.blume/packs/9464/) et au [Mexique](https://freesound.org/people/felix.blume/packs/10017/) ; kyles en [Ouganda](https://freesound.org/people/kyles/packs/22995/) ; Signature Sounds au Caire |
| Marché, place | Freesound [florianreichelt (Sri Lanka)](https://freesound.org/people/florianreichelt/packs/23851/), [rthijs (Espagne)](https://freesound.org/people/rthijs/packs/44028/) |
| Enfants | Freesound [Domar1979](https://freesound.org/people/Domar1979/packs/13176/), felix.blume en [Roumanie](https://freesound.org/people/felix.blume/packs/13899/) ; BigSoundBank |
| Pigeons | Freesound [5ro4 : 14 sons, tous CC0](https://freesound.org/people/5ro4/packs/33678/) |
| Port, mouettes | felix.blume à [Valparaiso](https://freesound.org/people/felix.blume/packs/22263/) ; BigSoundBank (port) ; grincements de bois de Rudmer_Rotteveel |
| Ateliers, usine, forge | kyles [atelier de métal](https://freesound.org/people/kyles/packs/25583/) ; ldezem [marteau-pilon](https://freesound.org/people/ldezem/packs/21709/) et [forge](https://freesound.org/people/ldezem/packs/21684/) |
| Bétail | BigSoundBank (ferme) |
| Feu, cloches | BigSoundBank (38 feux, 89 cloches) ; SignatureSoundsOrg (cloches d'église) |
| Pluie, neige | 99Sounds « Rain » ; kyles [hiver](https://freesound.org/people/kyles/packs/25553/) |
| Rumeur lointaine | kyles à [New York](https://freesound.org/people/kyles/packs/25570/) ; BigSoundBank (ville) |
| Cosmique | 99Sounds « Electromagnetic » ; Nox (bourdons) ; SignatureSoundsOrg « Interstellar Ambient Drones » |

**Bonne pratique : un registre de provenance par fichier** (adresse, auteur, licence, date, nom
d'origine). Il nourrit `CREDITS.md`. Préférer le CC0 au CC BY : chaque auteur en CC BY ajoute une
ligne de crédit obligatoire.

### 5.3 Les payants (recherche du 2026-10-07)

- **Les prix** sont en dollars hors TVA, relevés le 2026-10-07. Les soldes d'ESM peuvent finir.
- **Les pages lues seulement en extrait** sont celles d'itch.io, GameDev Market, Fab, ZapSplat,
  Envato et Humble.

**Ce que l'argent achète vraiment : une ville sans voitures.** Les enregistrements de terrain
d'aujourd'hui, gratuits ou non, ont toujours un moteur au fond. Pour les âges du Feu au Marbre, il
faut des ambiances **composées** (médiévales, fantasy). C'est là que les packs payants n'ont pas
d'équivalent gratuit. La nature, elle, se trouve gratuitement ou se synthétise.

**Les packs prêts à boucler, en achat unique**

| Pack | Prix | Contenu utile | Licence |
|---|---|---|---|
| [Ovani, Environmental Ambiences](https://ovanisound.com/collections/sfx-genre-ambience), vol. 1 à 5 | 20 $ le volume ; 45 $ les trois, 78 $ les six ([composer son lot](https://ovanisound.com/pages/bundle-builder)) | 90 boucles sans couture par volume. Selon le volume : ville, fantasy, campagne, nature, industrie, science-fiction, météo. WAV 44,1 kHz. | Jeux commerciaux, sans crédit. Pas de revente des sons seuls. IA interdite. |
| [ESM, Medieval Viking](https://epicstockmedia.com/product/medieval-viking-game/) | 74 $ (au lieu de 109) | 94 ambiances (campements, lieux), 75 animaux, 49 poules, 48 sons de forge, chariots, bateaux, 150 sons de liquides (des ploufs). | Un utilisateur, jeux couverts, productions illimitées, sans crédit. |
| [ESM, Ambient Earth Nature Loops](https://epicstockmedia.com/product/ambient-earth-nature-loops/) | 22 $ (au lieu de 29) | 135 boucles : forêt et insectes, cigales, nuit, vagues, pluie, ruisseaux, vent. | Idem. |
| [ESM, Cyberpunk Game](https://epicstockmedia.com/product/cyberpunk-game/) | 44 $ | Ambiances de néon et de serveurs, pour le Néon et les âges cosmiques. | Idem. |
| [Sonniss, Medieval Town](https://sonniss.com/sound-effects/medieval-town/), de Vadi Sound | 49 $ | Ville et taverne, cloches, forge, grange et champs, charpentier, mine, animaux. 253 fichiers en 96 kHz. | [Sonniss](https://sonniss.com/license/) : projets illimités, à vie, un seul éditeur. |
| [Sonniss, Public Spaces](https://sonniss.com/sound-effects/public-spaces-crowds-walla-and-everyday-ambiences/), d'ESM | 39 $ | Foules, marchés, parcs, écoles, rires d'enfants : 4 h. Intelligibilité des voix à écouter. | Idem. |
| [BOOM, Medieval Life Designed](https://www.boomlibrary.com/sound-effects/medieval-life/) | ~118 € | 50 lieux médiévaux composés : marchés, cours, fermes, campements, chantiers. | ⚠ La page affiche « /an » ET « one purchase… forever » : vérifier au panier. |

**Les petits enregistrements de terrain de Sonniss.** Ce sont souvent de longues prises à
découper en boucles.

| Famille | Pack et prix |
|---|---|
| Port | [Marina Ambience](https://sonniss.com/sound-effects/marina-ambience/) 7 $ (voiles, cordages, mâts) ; [Industrial Harbor](https://sonniss.com/sound-effects/industrial-harbor/) 12,50 $ (port moderne) |
| Mouettes, vagues | [Essentials 13 Seaside](https://sonniss.com/sound-effects/essentials-13-seaside/), d'InspectorJ, 19,99 $ |
| Moulins | [Watermill](https://sonniss.com/sound-effects-tag/watermill/) 20 $ ; [The Windmill](https://sonniss.com/sound-effects/the-windmill/) 40 $ |
| Forge | [Blacksmiths Workshop](https://sonniss.com/sound-effects-tag/blacksmith/) 8 $ |
| Feu | [Campfire, Fireplace and Stove](https://sonniss.com/sound-effects/campfire-fireplace-and-stove/) 15 $ |
| Nature | [Pure Nature Ambiences](https://sonniss.com/sound-effects/pure-nature-ambiences/) 12 $ (40 boucles d'une minute) |
| Bétail, chariots | [Pigs and Chickens](https://sonniss.com/sound-effects-tag/livestock/) 10 $ ; [Horses Vol 3](https://sonniss.com/sound-effects/horses-vol-3/) 25 $ (attelages qui grincent) |
| Cloches | [China Temple Bells & Crowds](https://sonniss.com/sound-effects/china-temple-bells-crowds/) 18 $ ; [Church Bells](https://sonniss.com/sound-effects-tag/church-bells/) 37 $ |
| Vieille ville | [Towns & Villages 01](https://sonniss.com/sound-effects/general-ambience-series-towns-villages-01/) 41 $ (places pavées, fontaines, cloches, un peu de circulation) |
| Ailes d'insectes | [Buzzing Wings](https://sonniss.com/sound-effects-tag/insects/) 35 $ |
| Industrie, chantier | [Industrial Hall](https://sonniss.com/sound-effects/industrial-hall/) 25 $ ; [Construction Ambience](https://sonniss.com/sound-effects-tag/construction/) 25 $ |
| Hiver, orage | [Winter Textures](https://sonniss.com/sound-effects-tag/blizzard/) 35 $ ; [Stormy Night](https://sonniss.com/sound-effects-tag/thunder/) 20 $ |

**Ailleurs :**
- [Bluezone](https://www.bluezone-corporation.com/sound-effects-packs/wilderness-flowing-water-sound-effects) :
  eau à 8,95 €, vagues de lac à 12,95 €, machines steampunk à 22,95 €. Licence à vie, sans
  restriction.
- [Thomas Rex Beverly](https://www.thomasrexbeverly.com/collections/all) : de la nature haut de
  gamme, 32 à 80 $ le thème (grillons, vagues de lac).
- [Fusehive, Fantasy Medieval Ambiences](https://www.asoundeffect.com/sound-library/fantasy-medieval-ambiences/) :
  150 $ pour 50 paysages de villages et de forêts.

**Les abonnements**

| Service | Verdict |
|---|---|
| Humble Bundle (lots Ovani) | Des lots irréguliers : 2023, 2024, février 2025. Le palier à 20 $ contenait des volumes d'ambiances. À guetter, pas à attendre. |
| Splice, ZapSplat Gold, Soundsnap | Le droit est attaché à chaque son téléchargé et survit à la résiliation. Mais Soundsnap interdit qu'un son soit « extractible » du jeu (voir plus bas). |
| Soundly Pro, WOW Sound | Seuls les jeux sortis pendant l'abonnement restent couverts. Un son ajouté par un patch après la résiliation ne l'est pas. |
| Envato Elements | Licence enregistrée par projet. Elle ne devient perpétuelle que si le projet est fini pendant l'abonnement. |
| Pro Sound Effects | ⛔ « cannot be used on any Productions after the Subscription Term ». Dangereux pour un jeu qui reçoit encore des mises à jour. |
| Epidemic Sound, Artlist | ⛔ Leurs plans ordinaires ne couvrent pas les jeux. |

**Trois paniers** (dollars hors TVA)

| Panier | Contenu | Total | Ce qui manque, à prendre en gratuit ou en synthèse |
|---|---|---|---|
| **Minimal** | Ovani vol. 2, 3 et 5 | 45 $ | port en détail, forge, moulins, bétail, mouettes |
| **Équilibré** | ESM Medieval Viking (74 $), Ovani vol. 3, 4 et 5 (45 $), Marina (7 $), Watermill (20 $) | 146 $ | moulin à vent, mouettes, enfants, pigeons, cloches, ailes |
| **Confortable** | ESM Medieval Viking, Nature Loops et Cyberpunk ; Ovani vol. 1 à 5 et Crowds ; Medieval Town ; Public Spaces ; Marina ; Watermill ; Blacksmiths ; Seaside ; China Temple Bells | 379 $ | presque rien |

**Mon conseil : rien à acheter avant le lot 3.**
- La nature (lot 2) se fait avec la synthèse et le gratuit.
- Pour la ville, écouter d'abord les extraits d'**ESM Medieval Viking** et d'**Ovani** (vol. 2 et 4
  surtout). C'est là qu'on trouve la ville sans voitures des premiers âges, en boucles prêtes.
- Le reste vient du gratuit (BigSoundBank, Freesound en CC0) et de la synthèse.

**Licences payantes : ce qui compte pour nous**
- **Une version web expose toujours ses fichiers son.** L'.exe aussi, car son archive s'ouvre.
  - Préférer les vendeurs dont la licence n'interdit que la revente des sons seuls : Sonniss,
    A Sound Effect, ESM, Ovani, Bluezone, Thomas Rex Beverly.
  - Éviter, sauf accord écrit, ceux qui exigent qu'un son ne soit pas « extractible » du jeu :
    Pro Sound Effects, Soundsnap, Unity Asset Store, GameDev Market, Sound Ideas.
- **Articulated Sounds interdit explicitement les dépôts publics.** Le dépôt doit rester privé
  (`CREDITS.md` le demande déjà). Sinon, aucun son acheté n'y entre, même converti.
- **Presque toutes les licences sont pour un seul utilisateur.** Un prestataire du son devrait
  acheter la sienne.
- **ESM demande une licence à part pour une appli** où l'utilisateur pilote la lecture, du genre
  appli de nature. Ce n'est pas notre cas : le banc d'écoute ne sort pas du développement.
- **Presque tous interdisent l'entraînement d'IA.** Jamais un son acheté en entrée d'un générateur.

### 5.4 La génération par IA (recherche du 2026-10-07)

**ElevenLabs Sound Effects v2** est le seul outil mûr et commercialement clair.
- **Ce qu'il sait faire** :
  - 0,5 à 30 s par génération, en 48 kHz ;
  - un paramètre `loop` pour des boucles « sans début ni fin perceptibles » ;
  - une API ([référence](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert),
    [capacités](https://elevenlabs.io/docs/overview/capabilities/sound-effects)).
- **Ce qu'il coûte** : 40 crédits par seconde.
  - L'abonnement Starter (6 $ par mois, 1 $ le premier) donne environ 25 boucles de 30 s.
  - L'abonnement Creator (22 $, 11 $ le premier mois) en donne environ 100
    ([prix](https://elevenlabs.io/pricing)).
- **Sa licence** : le plan gratuit est **non commercial**. Les plans payants sont commerciaux, et
  ce qui est généré pendant l'abonnement reste utilisable « indefinitely » après résiliation
  ([page légale](https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform)).
  Un seul mois payé peut donc suffire.
- **Ses pièges** :
  - les boucles de l'interface web sortent en MP3, dont la couture claque : il faut passer par
    l'API, en PCM si `loop` l'accepte (inconnu) ;
  - le serveur MCP officiel est déprécié et plafonne à 5 s ;
  - il n'y a pas de graine, donc rien n'est reproductible.

**Le reste du paysage :**
- **Stable Audio Open et Stable Audio 3 Small SFX** sont gratuits sous 1 M$ de revenu annuel, avec
  inscription. Leurs poids font plusieurs Go à télécharger, ce que la règle Defender exclut.
- **Adobe Firefly** (sound effects, sorti en août 2026) se dit « safe for commercial use ».
  Boucles : inconnu.
- **Interdits en usage commercial** : AudioGen, AudioLDM 2, Tango 2, TangoFlux, MMAudio, ThinkSound.
  HunyuanVideo-Foley est exclu dans l'UE.

**Qualité, d'après les retours de praticiens.** Bon sur les textures (vent, pluie, eau, feu), le
bruitage et les cris d'animaux. Faible sur :
- les sons tonals précis (cloches) ;
- les prompts à plusieurs événements, qui donnent un bruit hybride ;
- les foules : un babil indistinct au mieux. L'intelligibilité de la foule d'ElevenLabs n'a pas
  été mesurée (inconnu).

Même les boucles « natives » gagnent à un fondu de 50 à 100 ms.

**Steam : la déclaration couvre le son.** Le texte de Steamworks : « Pre-Generated: Any kind of
content that ships with your game and is consumed by players that is created with the help of AI
tools during development »
([contentsurvey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey)). Les sons
générés s'ajouteraient à la ligne PixelLab de `STEAM-PUBLICATION.md` § 2, avec un journal par son
(prompt, outil, plan, date).

**⚠ Écrire sur le disque un son généré par API, c'est un téléchargement** au sens de la règle
Defender. Il faudrait l'accord de Raph, comme pour l'exception PixelLab.

### 5.5 Lot 2 : la liste de téléchargement (recherche du 2026-10-07)

Pages lues sans rien télécharger. **Tout est en CC0.**
- **BigSoundBank (BBS)** : pas de compte. Le crédit « Joseph SARDIN - BigSoundBank.com » est
  demandé par courtoisie. Une partie des fichiers est d'un second auteur, « Le tiroir du fond ».
- **Freesound (FS)** : un compte gratuit est nécessaire pour télécharger.
- BBS n'a ni coucou, ni pic, ni pinson, ni mésange, ni grive, ni alouette : ceux-là viennent
  de Freesound.

**Où les poser** : `/assets/sons/bigsoundbank/` et `/assets/sons/freesound/` à la racine du
dépôt, sous leur nom d'origine. Ce dossier n'est pas versionné.

**Le lot minimal (14 fichiers)**

| # | Son | Page | Durée, format |
|---|---|---|---|
| 1 | Merle noir | <https://bigsoundbank.com/common-blackbird-13-s3486.html> | 6 s, 48 kHz mono |
| 2 | Rouge-gorge | <https://bigsoundbank.com/robin-4-s1670.html> | 4 s, 48 kHz mono |
| 3 | Pinson | <https://freesound.org/people/Sacha.Julien/sounds/725218/> | 2 min 19, « very close » |
| 4 | Mésange charbonnière | <https://freesound.org/people/D4XX/sounds/607242/> | 2 s |
| 5 | Troglodyte | <https://freesound.org/people/Sacha.Julien/sounds/734533/> | 2 min 46, oiseau à 6 m |
| 6 | Grive musicienne | <https://freesound.org/people/richwise/sounds/785669/> | 56 s |
| 7 | Coucou | <https://freesound.org/people/Artemis_R_Swann/sounds/517480/> | 10 s |
| 8 | Pic (tambourinage) | <https://freesound.org/people/naturenotesuk/sounds/428146/> | 36 s (route proche, bruits retirés à la main) |
| 9 | Chouette hulotte | <https://bigsoundbank.com/tawny-owl-1-s1763.html>, plus le #2 : <https://bigsoundbank.com/tawny-owl-2-s1764.html> | 9 s et 8 s, mono |
| 10 | Grenouille (un cri) | <https://bigsoundbank.com/one-frog-s0819.html> | 15 s, mono |
| 11 | Grenouilles (fond de mare) | <https://freesound.org/people/nicotep/sounds/547899/> | 4 min, 44 Mo |
| 12 | Corneille | <https://bigsoundbank.com/carrion-crow-4-s3464.html>, plus le #5 : <https://bigsoundbank.com/carrion-crow-5-s3465.html> | 8 s et 5 s, mono |
| 13 | Alouette des champs | <https://freesound.org/people/Kinoton/sounds/387426/> | 1 min 15 |
| 14 | Colvert (pour plus tard) | <https://freesound.org/people/straget/sounds/411849/> | 1 min 38, mono |

**Variantes, si un fichier déçoit à l'écoute** :
- **Merle** : la série BBS #2 à #30 (s3474 à s3503).
- **Rouge-gorge** : BBS #1 à #7 (s1667 à s1673).
- **Pinson** : FS 725328 et 351666.
- **Mésange** : FS 429156.
- **Grive** : FS 509478.
- **Coucou** : FS 475049 et 719066.
- **Pic** : FS 620236.
- **Hulotte** : BBS s0429 (un couple).
- **Grenouilles** : l'alyte BBS s1053 et FS 632408.
- **Corneilles** : BBS s0956 et le freux FS 744595.
- **Alouette** : FS 244357.

**À éviter** :
- les grives FS 673097 et 813086 (route) ;
- les grenouilles BBS s0997 et s0998 (cascade) et BBS s0691 (vent) ;
- les corneilles BBS s0754 (route) ;
- le colvert FS 188376 (la mer s'entend).

**Inconnu tant qu'on n'a pas écouté** : le vrai bruit de fond de chaque fichier. Les pages de
BBS disent seulement « Outdoor ».

### 5.6 Les règles de licence (celles du dépôt, appliquées au son)

- **Une ligne par pack livré** dans `CREDITS.md`, et son crédit **FR et EN** dans Options ›
  Crédits. `credits.test.js` le vérifie.
- **Les archives ne sont pas versionnées.** Raph les dépose dans `/assets/sons/<pack>/`, déjà
  ignoré par git.
- **Seuls les dérivés embarqués vivent dans `src/assets/`** : découpés, normalisés, encodés par
  leur script d'import.
- **⛔ Jamais un son de pack en entrée d'un générateur** (IA comprise). La règle des sprites vaut
  pour le son.
- **⛔ Pas de licence non commerciale** (CC BY-NC, BBC RemArc…) : le jeu est vendu sur Steam.
- **Le dépôt reste privé**, comme le recommande déjà `CREDITS.md`.

### 5.7 Lot 3 : les voix et la rue, la liste de téléchargement (recherche du 2026-10-07)

**Pourquoi.** Les voix synthétisées du lot 3 ont été refusées à l'écoute (« étranges, un peu
cauchemardesques », Raph, 2026-10-07), et il n'y a pas de budget. On prend donc de vraies voix,
gratuites. Le seul fonds sans compte est BigSoundBank (CC0), dont les foules parlent français.
La règle « sans langue reconnaissable » est tenue par le TRAITEMENT : la chaîne d'import
recompose la foule en grains de 0,15 à 0,3 s tirés au hasard. Plus aucun mot ne survit, et ce
sont de vraies voix.

Toutes les pages ont été lues sans rien télécharger. Les prises sont de Joseph Sardin (CC0),
en stéréo, 48 kHz. **Où les poser** : à la racine du dépôt, comme au lot 2 ; je les range dans
`/assets/sons/bigsoundbank/`.

**Les voix (le brouhaha, la causerie, les enfants)**

| # | Son | Page | Durée | Pour |
|---|---|---|---|---|
| 1 | Pedestrian Place | <https://bigsoundbank.com/pedestrian-place-s0526.html> | 1 min 35 | la causerie : une centaine de personnes aux terrasses d'une place piétonne de Chartres |
| 2 | Outside Talks #1 | <https://bigsoundbank.com/outside-talks-1-s2968.html> | 3 min 55 | le brouhaha de la rue : une centaine de personnes dehors |
| 3 | Walla Group: Averages Discussions | <https://bigsoundbank.com/walla-group-averages-discussions-s0684.html> | 2 min 01 | la causerie, version propre : 25 personnes, « ni musique ni autre bruit » |
| 4 | Parisian park, children's games | <https://bigsoundbank.com/parisian-park-children-games-s1082.html> | 2 min 26 | les enfants qui jouent : « beaucoup d'enfants » dans un parc |
| 5 | Recreation Kindergarten #2 | <https://bigsoundbank.com/recreation-kindergarten-2-s2741.html> | 4 min 30 | la même chose, une cour de maternelle (variante) |
| 6 | Kids screaming #1 | <https://bigsoundbank.com/kids-scream-1-s1148.html> | 11 s | des cris de jeu, sans mots |
| 7 | Kids screaming #3 | <https://bigsoundbank.com/kids-scream-3-s1150.html> | 13 s | idem |
| 8 | Laughter of Children | <https://bigsoundbank.com/laughter-of-children-s1660.html> | 5 s | des rires d'enfants (mono) |
| 9 | Howling two children #1 | <https://bigsoundbank.com/howling-two-children-s1661.html> | 3 s | deux enfants qui hurlent pour jouer |

**La rue (la suite du lot 3), dans le même envoi**

| # | Son | Page | Durée | Pour |
|---|---|---|---|---|
| 10 | Footsteps on gravels #2 | <https://bigsoundbank.com/footsteps-on-gravels-2-s1117.html> | 1 min 32 | les pas d'une foule sur un chemin, « facile à boucler » (premiers âges) |
| 11 | Horse Walking on a Path | <https://bigsoundbank.com/horse-walking-on-a-path-s1854.html> | 48 s | un cheval au pas sur un chemin |
| 12 | Footsteps of horses rue Christine | <https://bigsoundbank.com/footsteps-of-horses-rue-christine-s0979.html> | 57 s | deux chevaux dans une rue de Paris (sabots sur la chaussée) |
| 13 | Squeaky wheelbarrow #1 | <https://bigsoundbank.com/squeaky-wheelbarrow-1-s2516.html> | 44 s | une roue qui grince : la charrette |
| 14 | Outdoor Market #1 | <https://bigsoundbank.com/outdoor-market-1-s2728.html> | 3 min 20 | un marché de plein air (Nogent-le-Rotrou), pour les places de marché |
| 15 | Parisian crossing #2 | <https://bigsoundbank.com/parisian-crossing-2-s3031.html> | 3 min 22 | la circulation de l'âge du Néon : un carrefour parisien (voitures, bus, klaxons) |

**Écartés** : les marchés de Neuilly, les autres rues de Paris, « Car on a Road » (pris dans l'habitacle) ; « Spanish Crowd » (une
langue reconnaissable) ; « Recreation Kindergarten #1 » (on y joue aux Pokémon) ; les
applaudissements.

**Inconnu tant qu'on n'a pas écouté** : le fond de chaque prise (une voiture au loin ?). Les
pages ne le disent pas, sauf pour les rues de Paris.

### 5.8 Lot 4 : les métiers, la liste de téléchargement (recherche du 2026-10-07)

Pages lues sans rien télécharger, toutes en **CC0** chez BigSoundBank (sans compte). Les
auteurs sont Joseph Sardin, sauf l'enclume (Pablo Bergel) et le troupeau (Joseph Sardin et
Axeline T.).

| # | Son | Page | Durée | Pour |
|---|---|---|---|---|
| 1 | Small fishing port #1 | <https://bigsoundbank.com/small-fishing-port-1-s2571.html> | 2 min 27 | le port : l'eau, les bateaux, l'activité (Bretagne) |
| 2 | Gulls on the Harbor | <https://bigsoundbank.com/gulls-on-the-harbor-s2573.html> | 1 min 55 | les cris des mouettes, découpés un à un |
| 3 | Fireplace #2 | <https://bigsoundbank.com/fireplace-2-s0031.html> | 1 min | le feu qui crépite : foyers, braseros |
| 4 | Anvil #1 | <https://bigsoundbank.com/anvil-1-s3589.html> | 33 s | le forgeron sur l'enclume |
| 5 | Saw Wood | <https://bigsoundbank.com/saw-wood-s0559.html> | 13 s | une scie à main |
| 6 | Nail and Hammer #1 | <https://bigsoundbank.com/nail-and-hammer-1-s0005.html> | 11 s | des clous dans une planche |
| 7 | Steam Engine, Foley #2 | <https://bigsoundbank.com/steam-engine-foley-2-s3311.html> | 29 s | une machine à vapeur, « facile à boucler » (âge de la Fonte) |
| 8 | Hiss of Steam Train #1 | <https://bigsoundbank.com/hiss-of-steam-train-1-s0227.html> | 5 s | un jet de vapeur |
| 9 | Flock of Sheep and Cows | <https://bigsoundbank.com/flock-sheep-and-cows-s3220.html> | 2 min 01 | les cloches d'un troupeau, des moutons, des vaches au loin |
| 10 | Cow Moos #1 | <https://bigsoundbank.com/cow-moos-s0546.html> | 15 s | cinq meuglements |
| 11 | Small Herd of Goats | <https://bigsoundbank.com/small-herd-of-goats-s0821.html> | 1 min 16 | des chèvres et leurs cloches |
| 12 | Rooster Song | <https://bigsoundbank.com/song-of-rooster-s0283.html> | 3 s | le coq, au matin |

**Synthétisés, sans fichier** : la cloche d'un bateau (la cloche de `synth.js`) ; le
bourdon électrique (Néon) et celui des âges cosmiques.

**Écartés** : les scieries et tronçonneuses (électriques), les marteaux-piqueurs, les
bateaux de croisière (sauf peut-être une corne), « Fire, Foley » (bruité au balai), la
forge introuvable sous « forge » chez BigSoundBank (elle est sous « anvil »).

### 5.9 Lot 5 : le temps, la liste de téléchargement (recherche du 2026-10-07)

Pages lues sans rien télécharger, toutes en **CC0** chez BigSoundBank (sans compte).

| # | Son | Page | Durée | Pour |
|---|---|---|---|---|
| 1 | Rain on Puddle | <https://bigsoundbank.com/rain-on-puddle-s1290.html> | 1 min 18 | la pluie : de grosses gouttes sur des flaques, sans rien autour (mono) |
| 2 | Rain on Concrete | <https://bigsoundbank.com/rain-on-concrete-s1289.html> | 1 min 21 | la pluie sur la pierre des villes (variante) |
| 3 | Manifestation #6 | <https://bigsoundbank.com/manifestation-6-s3382.html> | 1 min 23 | la clameur d'une émeute : chants, cris, hurlements (Joseph Sardin et Axeline T.), recomposée sans langue |
| 4 | Old dog barking #2 | <https://bigsoundbank.com/old-dog-barking-2-s2353.html> | 14 s | un chien qui aboie au loin, la nuit (mono) |

**Synthétisés, sans fichier** : la neige (le monde assourdi, un filtre) ; aux âges cosmiques,
des carillons de verre et le passage des navettes.

**Écartés** :
- tout ce qui a du tonnerre : il n'y a pas d'orage dans le jeu ;
- les pluies sur une voiture, une brouette ou une bâche (on entend l'objet) ;
- les autres manifestations, dont la n°14 (sirènes de police, circulation) et la n°7 (une
  fanfare) ;
- « Paris by Night » (la circulation moderne).

Il n'existe pas de pluie sur des feuilles chez BigSoundBank : sur la forêt, la pluie sera la
même, assourdie par un filtre.

### 5.10 Lot 7 : des prises pour plus tard (recherche du 2026-10-08)

Le lot 7 est entièrement synthétisé. **BigSoundBank n'a aucun vrai effondrement** (ni mur, ni
démolition, ni éboulement, ni séisme), aucun grondement continu, aucun glas ni grand gong. Si
l'écoute de Raph trouve un son synthétique trop faible, voici les prises qui s'en approchent le
plus (toutes CC0, pages vérifiées, pas encore écoutées) :

| Pour | Prise | Page |
|---|---|---|
| le glas | Bell 1 O'clock (#3446), un coup du clocher de La Loupe, 8 s | <https://bigsoundbank.com/bell-1-o-clock-s3446.html> |
| les pierres | Fall of Stone (#1022), des galets lâchés sur un tas, 30 s | <https://bigsoundbank.com/fall-of-stone-s1022.html> |
| les gravats | Wheelbarrow of limestone, reversed (#1634), 9 s | <https://bigsoundbank.com/wheelbarrow-of-limestone-reversed-s1634.html> |
| le bois | Chainsaw and falling tree (#2750), 29 s (couper la tronçonneuse) | <https://bigsoundbank.com/chainsaw-and-falling-tree-s2750.html> |
| le bois | Unloading logs (#1441), des bûches déversées, 2 min (couper le moteur) | <https://bigsoundbank.com/unloading-logs-s1441.html> |
| le verre | A Mirror Explodes (#0387), 2 s | <https://bigsoundbank.com/mirror-explodes-s0387.html> |
| le fer | Fall 2 sheet steel bars #3 (#1778), 5 s | <https://bigsoundbank.com/fall-2-sheet-steel-bars-3-s1778.html> |
| le grondement | Thunder #8 (#3181), une traîne de tonnerre de 42 s, à filtrer vers le grave | <https://bigsoundbank.com/thunder-8-s3181.html> |
| le sceau | Gong, strong #1 (#1483), un petit gong, à baisser en hauteur | <https://bigsoundbank.com/gong-strong-1-s1483.html> |
| la maison | Plant a wooden picket (#1389), des coups de masse sur un piquet, 24 s | <https://bigsoundbank.com/plant-a-wooden-picket-s1389.html> |

La recherche de bigsoundbank.com ne trouve que les mots anglais ; lasonotheque.org, la même
banque en français, se cherche en français.

### 5.11 Lot 9 : les bêtes, la liste de téléchargement (recherche du 2026-10-08)

Toutes CC0, pages vérifiées, pas encore écoutées. À déposer à la racine, comme d'habitude.

| # | Pour | Prise | Page |
|---|---|---|---|
| 1 | le canard | Ducks (#0276), quelques cris de canards, 22 s (DenisChardonnet) | <https://bigsoundbank.com/ducks-s0276.html> |
| 2 | le chat | Meow Cat #14 (#1902), un chat qui miaule, 11 s | <https://bigsoundbank.com/meow-cat-14-s1902.html> |
| 3 | le chat | Small mewing of a cat (#0098), quatre petits miaulements séparés, 5 s | <https://bigsoundbank.com/small-mewing-of-a-cat-s0098.html> |
| 4 | le chien | Old dog barking #1 (#2352), le même vieux chien que celui du jeu, 6 s | <https://bigsoundbank.com/old-dog-barking-1-s2352.html> |
| 5 | le chien | Old dog barking #3 (#2354), le même chien, 8 s | <https://bigsoundbank.com/old-dog-barking-3-s2354.html> |
| 6 | le petit chien (facultatif) | Small dog barking (#0612), un jappement, 48 s | <https://bigsoundbank.com/small-dog-barking-s0612.html> |

**Ce qui n'existe pas en CC0 sans compte Freesound** : le cygne, le héron (BigSoundBank n'a
que des passereaux, des rapaces nocturnes, des corvidés et des volailles), le moulin à vent
(le moulin est synthétisé). Deux pistes Freesound CC0, si Raph ouvre un jour un compte : des
cygnes chanteurs (#223697) et un héron (#834209). En attendant, le cygne et le héron se
taisent.

---

## 6. Plan d'action

| Lot | Contenu | Fini quand |
|---|---|---|
| **0. Décisions et outillage** | Réponses aux questions du § 9. Choix des sources. Raph télécharge et dépose les packs (règle Defender). Mise en place de la chaîne de préparation (§ 7). | Les premiers fichiers sont dans `/assets/sons/`, la chaîne tourne sur un son. |
| **1. Le moteur, audible avec des sons synthétisés** | `audio/paysage/` : mixeur et bus, réglage Options › Son, oreille, échantillonnage, `milieuAt`, nappes, ponctuels, émetteurs, proximité. Quatre sons provisoires synthétisés (vent, eau, plouf, zzz), pour entendre le système avant tout achat. **Banc d'écoute** : il montre les parts de milieux, les voix actives et p, propose un curseur de gain par famille et exporte les réglages. Tests vitest : parts de milieux, courbe de proximité, attribution des voix, garde-fous. | La caméra va de la forêt au fleuve puis à la ville, et les bonnes nappes montent (mesuré sur les bus). **Raph valide à l'oreille.** |
| **2. La nature** | Forêt, prairie, fleuve, rive, plouf, libellule, nuit, saisons, vent (sons 1 à 8, 26). | Validation à l'oreille. |
| **3. La ville** | Rue par famille d'âge, places et enfants, pigeons, fontaines, lointain (sons 9 à 12, 15 à 17). | Validation à l'oreille, sur deux âges au moins. |
| **4. Les métiers** | Port et bateaux, ateliers et industrie par stade, feux, bétail et labours, mouettes (sons 13, 14, 18 à 21). | Validation à l'oreille. |
| **5. Le temps** | Pluie et rafales, neige, nuit en ville, émeutes, âges cosmiques (sons 22 à 25). | Validation à l'oreille. |
| **6. Le mixage final** | Niveaux, courbe du zoom, épreuve d'une session de 2 h en fond, mémoire et CPU mesurés, .exe vérifié, crédits et Steam. | Rien n'agace en 2 h ; budgets du § 3.9 tenus. |
| **7. Les grands moments** | La chute, un nouvel âge, une maison qui sort de terre, le Grand Reset (§ 3.10). | Validation à l'oreille. |
| **8. L'interface** | L'achat à la main, la bulle d'un passant, un succès, l'alerte de crise (§ 3.11). | Validation à l'oreille. |
| **9. Les petits sons de la carte** | Les moulins, les cloches des lieux de culte, les bêtes qu'on voit (§ 3.12). | Validation à l'oreille ; les fichiers du § 5.11. |
| **10. Plus tard** | Les jeux muets de la Maison (vingt-et-un, tickets, osselets). | À décider. |

Chaque lot est livré par petites touches commitées, comme d'habitude, et ne part qu'après la
validation à l'oreille du précédent.

---

## 7. La chaîne de préparation des fichiers

- **Raph télécharge et dépose ; jamais moi** (règle Defender).
- **Une table `scripts/sons/catalogue.json`** décrit chaque son du jeu : son fichier source,
  ses points d'entrée et de sortie, son gain, son crédit.
- **Un script `scripts/importSons.mjs`** lit la table. Pour chaque son, il :
  - découpe ;
  - passe en mono, à 32 kHz ;
  - normalise : la crête à −1 dBFS, ou, pour une nappe, l'énergie (`rms`) ;
  - pose les fondus ;
  - pour une NAPPE, rend une boucle exacte : `brouiller` recompose une foule en grains
    tirés au hasard (plus aucun mot), `boucler` referme une prise rythmée en fondu ;
  - encode en Ogg et écrit dans `src/assets/sons/`, que le jeu lit par le dossier.

  Par défaut, il ne traite que les sons manquants : refaire un son change son fichier,
  même à l'identique, car l'Ogg tire un numéro de série à chaque encodage. Un filtre (un
  bout d'id) refait les sons choisis, `--tout` refait tout.
- **L'outil d'encodage : ffmpeg par défaut** (§ 9), que Raph installe avec
  `winget install Gyan.FFmpeg`. Il se pilote entièrement depuis un script. Le repli est
  **REAPER**, déjà installé, qui sait rendre en ligne de commande.
- **Des mesures automatiques** : pic, sonie (LUFS), couture d'une boucle (saut d'amplitude et de
  spectre entre la fin et le début), silence de tête, décalage continu.
- **Les niveaux de départ**, à régler à l'oreille : les nappes autour de −30 à −24 LUFS ; les
  ponctuels plus hauts mais rares. L'ambiance reste **sous** la musique.

---

## 8. Les risques

| Risque | Parade |
|---|---|
| **L'agacement** : un idle tourne des heures | Densité basse, variantes, garde-fous par famille, habituation (§ 3.3), épreuve de 2 h (lot 6). |
| **Une voix reconnaissable** : du français distinct à l'âge du Feu casse l'illusion | Brouhaha indistinct ou filtré. → question 6. |
| **La mémoire** | Seuls les sons de l'âge en cours se chargent, la pluie et la clameur au besoin ; budget mesuré par âge et gardé par un test (§ 3.9). |
| **La perf de la carte** | Tick à 5 Hz sans allocation, rien par image, lecture des sorties du peintre. |
| **Les licences** | Une ligne par pack dans `CREDITS.md`, test des crédits, rien de non commercial. |
| **Je n'entends pas** | Banc d'écoute, mesures automatiques, validation de Raph à chaque lot. |

---

## 9. Questions pour Raph

### Les décisions de Raph (2026-10-07)

| Question | Réponse |
|---|---|
| 1. Budget | « On verra quand on y sera » : la question revient au lot 3. |
| 2. IA | **Non.** |
| 3. Synthèse des textures | **Oui.** |
| 4. L'oreille | **Le centre de l'écran.** |
| 5. Hors de la carte | **Oui aux trois** : silence sur un autre onglet, son assourdi sous une fenêtre ouverte, silence quand le jeu est en arrière-plan. |
| 6. Les voix | **Un brouhaha sans langue reconnaissable.** |
| Outil | ffmpeg 9.0.2 installé par Raph (winget, Gyan.FFmpeg). |

### Les questions telles que posées

Ma recommandation était donnée pour chacune.

1. **Le budget.** Rien n'est à acheter avant le lot 3 (la ville). Quel plafond ensuite ?
   → Environ 100 $, ciblés sur ce qui n'existe pas en gratuit : une ville ancienne sans voitures
   (ESM Medieval Viking, Ovani), après écoute des extraits.
2. **L'IA (ElevenLabs).** Oui ou non ? Si c'est oui, il faut trois choses :
   - un mois payé, de 11 à 22 $ ;
   - une ligne de plus dans la déclaration Steam ;
   - ton accord pour que j'écrive les sons générés sur le disque, comme pour PixelLab.

   → Pas pour commencer. Synthèse et gratuit d'abord ; l'IA en appoint pour un trou précis.
3. **La synthèse.** Les textures peuvent-elles être fabriquées par le code : vent, pluie, eau,
   insectes, feu, libellule, cloches, âges cosmiques ?
   → Oui, mais tu les entends au lot 1 avant que ça devienne la règle.
4. **L'oreille.** Au centre de l'écran, ou sous le curseur ?
   → Au centre : ça reste stable même quand la souris dort, ce qui est le cas courant dans un
   idle. En option, un léger bonus pour ce qui est sous le curseur : survoler la libellule la fait
   entendre un peu plus.
5. **Hors de la carte.** Quel comportement pour chaque cas ?
   - autre onglet : silence, en fondu ;
   - fenêtre ouverte : son assourdi ;
   - jeu en arrière-plan : silence.

   Ou faut-il garder la rumeur lointaine partout, comme une seconde musique ?
   → Les trois réglages ci-dessus.
6. **Les voix.** Un brouhaha indistinct, où aucune langue ne se reconnaît, ou de vraies langues
   audibles ?
   → Indistinct. Les âges vont du Feu au cosmique, et un mot de français reconnaissable au
   campement casse l'illusion.

**Ce que je prends par défaut, sauf avis contraire :**
- ffmpeg pour la chaîne de préparation. Tu l'installes avec `winget install Gyan.FFmpeg`.
- L'ambiance activée pour un nouveau joueur, à 60 %.
- L'habituation du § 3.3.
- Les Faits divers muets.
- Pas de tonnerre, puisqu'il n'y a pas d'orage dans le jeu.
- Aucune touche à la musique.

---

## Journal

- **2026-10-07** : plan rédigé à partir de l'inventaire du code et de cinq recherches, toutes en
  lecture seule, sans aucun téléchargement : techniques des autres jeux, banques gratuites,
  banques payantes, génération par IA. Le quota de recherches web s'est épuisé en fin de travail :
  ce qui n'a pu être vérifié est marqué inconnu ou [S]. En attente des réponses de Raph (§ 9).
- **2026-10-07, lot 1 (le moteur)** : décisions reçues (§ 9), ffmpeg installé par Raph. Écrit dans
  `src/game/audio/paysage/` :

  | Fichier | Rôle |
  |---|---|
  | `evenements.js` | Le guichet : la carte y dépose le plouf et la libellule, à l'image qui les dessine. |
  | `reglages.js` | L'interrupteur et le volume (Options › Son). |
  | `oreille.js` | Proximité, hauteur, atténuation, panoramique, fondu, passe-bas. |
  | `milieux.js` | La grille des milieux, la forêt réelle, le bord de l'eau, la foule. |
  | `paysageSynth.js` | Les sons synthétisés : souffle, feuillage, courant, ressac, lointain, libellule, plouf, sortie. |
  | `mixeur.js` | Les bus, les boucles, les ponctuels. |
  | `paysage.js` | Le directeur. |
  | `banc.js` | Le banc d'écoute (Ctrl+Alt+B, ou `?son=banc` dans l'adresse). |

  Branchements :
  - `CityMapCanvas.jsx` attache et détache le directeur ;
  - `isoRiverLife.js` dépose les sauts et les libellules ;
  - `synth.js` permet de retenir et de relâcher le contexte audio ;
  - le Worker des sons rend le paysage.

  26 tests dans `src/game/audio/__tests__/paysage*.test.js`.
  ⚠ Les sons synthétisés sont rendus en ~1,1 s au total, dans le Worker ; décodés, ils pèsent
  ~15 Mo en mémoire.

  **Vérifié dans le jeu** (pane, partie neuve au Campement, paysage forcé car la pane est un
  onglet caché) :

  | Point vérifié | Résultat |
  |---|---|
  | Contexte audio, sons, nappes | Le contexte tourne ; les 15 sons sont rendus par le Worker ; les 5 nappes jouent. |
  | Lecture de l'écran | 24 % d'eau, 23 à 27 % de forêt, 30 % de prairie, 20 % de ville, 20 à 24 % de rive. |
  | Niveau de sortie | −35 à −38 dBFS efficaces au volume par défaut (60 %), contre −21,8 LUFS pour la musique : 13 à 16 dB dessous. |
  | Dézoom | La rumeur lointaine monte (0,05, puis 0,08, puis 0,13) pendant que les nappes baissent. Le Campement ne se dézoome pas sous 0,75 : sa carte est petite. |
  | Plouf | Un plouf joué sur 13 s de carte. La gerbe de sortie, plus courte de portée, ne s'est pas jouée pour ce poisson-là. |
  | Libellule | Une voix attribuée en zoomant sur une libellule à l'écran. |
  | Options | « Ambiance » et son volume s'affichent. L'interrupteur endort puis réveille le paysage, et le choix est retenu. Les Options n'assourdissent pas. |
  | Fenêtres et onglets | Une autre fenêtre assourdit. Quitter la Cité démonte la carte et endort le paysage ; y revenir le réveille sans rien re-rendre. |
  | Console | Aucune erreur. |
  | Coût | Une relecture de l'écran coûte ~0,13 ms, cinq fois par seconde. |

  **Reste au lot 1 : l'écoute de Raph.** Ouvrir la Cité, Ctrl+Alt+B, écouter chaque nappe seule
  (clic sur son nom), régler les niveaux, puis « Copier les réglages ».
- **2026-10-07, première écoute de Raph.**
  - **Ses réglages au banc** : maître 0,5 ; feuillage ×0,8, courant ×0,5, ressac ×0,7,
    libellule ×0,8 ; oreille avec un zoom loin à 0,42 et une hauteur à 4,3.
  - **Son verdict** : « avec le son ambiance à 40 % c'est mieux » ; « les vagues sonnent trop
    fort et trop fréquentes, on dirait que c'est la tempête » ; « la libellule fait un bruit
    d'hélicoptère ».

  Ce qui a été fait :
  - **Les réglages sont versés dans les niveaux du code**, et la clé du banc devient
    `civ-paysage-banc-2` (les anciens multiplicateurs ne s'appliquent pas deux fois).
  - **L'Ambiance est par défaut à 40 %.**
  - **Le ressac est refait** : un filet d'eau presque muet, et toutes les 2,5 à 6 s un petit
    clapotis de deux à quatre claques, sans houle ni coup sourd.
  - **La libellule est refaite** : un bourdonnement continu de 200 Hz, voilé à ±15 % par 30
    battements par seconde, sans silence entre eux. Posée, elle descend au tiers ; elle ne
    bourdonne franchement qu'en vol.

  Deux tests gardent ces reproches : « pas d'hélicoptère », « pas de tempête ». À réécouter
  par Raph.
- **2026-10-07, seconde écoute** : « c'est bien comme ça ». Seul changement : courant ×0,8,
  versé dans son niveau ; la clé du banc devient `civ-paysage-banc-3`. **Lot 1 livré**
  (commit `bdf8c493`).
- **2026-10-07, lot 2 (la nature), partie synthétisée** :

  | Son | Ce qu'on entend | Quand |
  |---|---|---|
  | `grillons` | Quinze grillons des champs, chacun à son rythme. | La nuit, du printemps à l'automne. |
  | `stridulations` | Six sauterelles, des phrases rêches espacées. | Le jour, dans les prés et les champs. |
  | `cigales` | Quatre cigales dans les arbres. | Les jours d'été. |
  | `plip` | Le poisson-ombre qui gobe, au début de sa pause. | Branché dans `iso/isoRiver.js`. On ne l'entend que si l'on regarde le fleuve (portée de 9 cases). |
  | `altitude` | Le souffle joué plus grave, sur le bus du lointain. | Dézoomé au-dessus de la campagne, d'autant plus que la ville est petite. |

  Les insectes se taisent sous la pluie et l'hiver. Les règles sont dans une fonction pure,
  `ciblesNappes`, testée.

  **Enregistrements** :
  - `paysage/enregistrements.js` lit `src/assets/sons/` par le dossier ; le nom fait la famille.
  - Le directeur les décode par `fetch`, ce que le protocole `app://` de l'.exe permet.
  - Les SEMES les sèment dans les parties de l'écran qui portent leur milieu : oiseau, coucou,
    pic, chouette, grenouille, corneille, alouette. L'habituation (caméra immobile depuis
    5 min) les divise par deux.
  - La chaîne `scripts/importSons.mjs` et `scripts/sons/catalogue.json` est essayée de bout en
    bout sur un son généré.

  Vérifié dans le jeu :
  - les 22 sons sont rendus et les 9 nappes jouent ;
  - de jour en automne, les sauterelles jouent, sans grillons ni cigales ;
  - forcé de nuit, les grillons (0,54) prennent la place des sauterelles ;
  - centré sur le fleuve au zoom 2, trois plips en 30 s.

  63 tests passent. **Reste** : l'écoute de Raph, et les enregistrements, qu'il télécharge
  lui-même.
- **2026-10-07, les enregistrements.** Raph a téléchargé 6 fichiers BigSoundBank. Il s'est
  passé de Freesound, faute de compte : ni pinson, ni mésange, ni troglodyte, ni grive, ni
  coucou, ni pic, ni alouette, ni fond de mare. La corneille n°5 manque aussi.

  Ce qui a été fait :
  - **Rangement** : les fichiers sont dans `/assets/sons/bigsoundbank/`, ignoré par git.
  - **Coupes** : elles viennent de l'enveloppe mesurée (passages plus forts que le plancher de
    bruit de 12 dB), pas d'une écoute. On en tire 11 sons, 328 Ko en tout :
    - le merle et le rouge-gorge, une phrase chacun ;
    - les deux hulottes, l'appel entier ;
    - trois passages de grenouille ;
    - quatre séries de cris de corneille.
  - **Crédits** : une ligne dans `CREDITS.md` et une mention FR et EN dans Options › Crédits
    (courtoisie, CC0).
  - **Rareté** : une famille qui a peu de sons se fait plus rare (`variantes`). Avec deux
    oiseaux pour huit voulus, ils chantent quatre fois moins souvent.
  - **Familles muettes, faute de fichier** : coucou, pic, alouette.

  Vérifié dans le jeu :
  - les 11 enregistrements se décodent ;
  - ▶ joue chaque famille qui a des fichiers ;
  - avec un taux d'essai, le semeur place 5 oiseaux dans la forêt à l'écran en 12 s ;
  - le taux d'origine est ensuite remis.

  Deux tests nouveaux : chaque fichier de `src/assets/sons/` appartient à une famille connue,
  et le catalogue et le dossier se correspondent. **Pour enrichir** : d'autres merles et
  rouges-gorges de BigSoundBank (séries #1 à #30 et #1 à #7, sans compte), et la corneille n°5.
- **2026-10-07, trois fichiers de plus.** Raph a ajouté le merle n°30, le rouge-gorge n°1 et
  la corneille n°5. On en tire quatre sons : 15 en tout, environ 390 Ko.
  - **Oiseaux** : quatre sons pour huit voulus, ils ne chantent plus que deux fois moins
    souvent (quatre fois moins avant).
  - **Corneille n°5** : deux séries de cris, `corneille-noire-5` et `corneille-noire-6`.
  - **La chaîne mesure la vraie crête de ce qu'elle écrit.** L'encodage Ogg la dépassait
    parfois d'un dB ; une seconde passe la ramène sous −1 dBFS.

  71 tests passent. **Lot 2 livré.** Familles toujours muettes, faute de fichier : coucou,
  pic, alouette.
- **2026-10-07, lot 3 (la ville), première partie : des voix sans langue.**

  | Son | Ce qu'on entend | Quand |
  |---|---|---|
  | `brouhaha` | Seize passants à toutes les distances, dans l'écho d'une rue. | Dosé par les passants proches de l'oreille. |
  | `causerie` | Trois conversations de deux ou trois voix qui se répondent et rient ; six passants au fond. | Dosée par les flâneurs des places. |
  | `enfants1-8` | Des cris, des rires, des appels (« é-oh »), une balle qui rebondit, un petit groupe. | De jour, semés sur les enfants que la carte dessine, dans les rues et sur les places. |
  | `roucoul1-6` | Un pigeon qui roucoule. | Semés sur les pigeons posés qu'on voit. |
  | `envol1-4` | Les ailes d'un pigeon, ou d'une volée, qui part. | Quand une volée s'envole devant un passant (`iso/isoVieOiseaux.js`). |
  | `fontaine` | Un jet qui retombe dans son bassin. | Les fontaines dont on voit l'eau couler ; un filet pour un puits ou une borne (`iso/isoPlaza.js`). |

  **Les voix** (`paysage/voix.js`) sont une synthèse de la parole à formants (Klatt) :
  - une source glottique et quatre formants qui glissent d'une voyelle à l'autre ;
  - des consonnes de bruit ;
  - une intonation par phrase.

  Les syllabes sont tirées au hasard, il n'y a donc aucune langue (décision de Raph).
  Mesuré : une voix a le spectre et le rythme de la parole (quatre à six syllabes par
  seconde) ; dans la foule, aucune voix ne domine plus.

  **Le dosage.** Chaque passant compte comme une petite source, atténuée par sa distance
  à l'oreille. L'énergie de leurs voix donne le niveau (`voixDeFoule`) :
  - une rue vide se tait ;
  - un passant sous l'oreille ne fait pas une foule (16 %) ;
  - une rue dense ou une place animée donnent environ 0,7.

  Vérifié dans le jeu, à l'âge de la Couronne (6 places, 6 volées) :
  - du zoom 2,6 au zoom 0,4, les voix dominent de près puis cèdent à la rumeur lointaine ;
    la sortie reste entre −44 et −49 dBFS ;
  - une volée dérangée par un passant claque son envol ; les pigeons visibles roucoulent ;
  - près d'une place, deux cris d'enfants en quatre secondes ;
  - la fontaine de la place centrale a sa voix ;
  - le tick coûte 0,2 ms avec 470 passants.

  ⚠ Dans la pane, le Worker des sons est resté bloqué une fois, au premier chargement des
  modules : 43 sons « en route », jamais rendus. Un rechargement l'a réglé. Pas observé
  hors de la pane.

  81 tests passent. **Reste** : l'écoute de Raph ; puis la rue par âge (pas, sabots et
  roues, moteurs) et une rumeur lointaine propre à chaque âge.
- **2026-10-07, écoute du lot 3 : les voix synthétisées sont refusées.** « Les voix
  d'enfants et le brouhaha sonnent étranges et un peu cauchemardesques. » Pas de budget. Le
  reste (pigeons, envol, fontaine) : « très bien ».
  - **Les voix synthétisées sont retirées**, et `paysage/voix.js` avec elles.
  - **De vraies voix les remplacent**, prises chez BigSoundBank (CC0, sans compte) : la
    liste est au § 5.7.
  - **La règle « sans langue reconnaissable » est tenue par la chaîne d'import.**
    `scripts/importSons.mjs` a une option `brouiller`, qui recompose la prise en grains de
    0,15 à 0,3 s tirés au hasard, en fondu (fenêtre en sinus, recouvrement de moitié). La
    puissance reste constante. Le résultat est une boucle exacte, sans aucun fondu.
  - **Une seconde option, `boucler`**, referme une prise rythmée en fondu (des sabots).
  - **Les nappes de voix jouent un enregistrement** (`enregistres` : le premier fichier
    présent). Elles se taisent tant qu'il manque : `brouhaha`, `causerie`, et `jeux`, les
    enfants qui jouent près des places, de jour.
  - **Les cris et les rires d'enfants sont semés** sur les enfants qu'on voit (famille
    `enfant`).

  **La rue selon l'âge** (sons 16), branchée dans le même mouvement :

  | Son | Ce qu'on entend | Quand |
  |---|---|---|
  | `pas` (nappe) | Les pas d'une foule. | Dosés par ceux qui marchent près de l'oreille. Pleins jusqu'au Marbre, plus discrets à la Fonte et au Néon, muets aux âges cosmiques. |
  | `attelage` (émetteur) | Des sabots au pas. | Sur les charrettes, chars et diligences qu'on voit (`iso/isoUnits.js`). |
  | `roue` (semé) | Une roue qui grince. | De temps en temps, sur ces mêmes attelages. |
  | `circulation` (nappe) | Un carrefour : voitures, bus, klaxons. | À l'âge du Néon seulement, dosée par les voitures qu'on voit. |
  | `drone` (émetteur, synthétisé) | Quatre rotors légèrement désaccordés, un sifflement électrique. | Les drones des âges cosmiques (`iso/isoSky.js`). |

  Vérifié dans le jeu :
  - aux âges cosmiques, deux drones ont leur voix ;
  - à l'âge du Néon, près d'une voiture, la circulation vise 0,69 ;
  - à l'âge de la Couronne, quatre attelages sont repérés ;
  - les nappes sans fichier restent muettes.

  ⚠ **Le Worker des sons s'est bloqué une seconde fois dans la pane**, après un changement
  de code. Un Worker neuf sur la même adresse ne répondait pas non plus au bout de 70 s,
  alors que les mêmes modules se chargeaient ailleurs. Un **filet de sécurité** est ajouté
  (`ATTENTE_MS`) : sans réponse en 20 s, le son se rend sur la page, un par passage. Le pire
  cas est 0,3 s (les cigales), une seule fois.

  68 tests du son et 11 de la chaîne passent. **Reste** :
  - Raph télécharge les 15 fichiers du § 5.7 ;
  - je les découpe et les traite ;
  - l'écoute ;
  - puis la rumeur lointaine propre à chaque âge.
- **2026-10-07, les 15 fichiers du § 5.7 sont importés.** Raph les a posés à la racine ; je
  les ai rangés dans `/assets/sons/bigsoundbank/`.

  Les coupes viennent de la mesure de l'enveloppe, pas d'une écoute :
  - **Foules, carrefour, pas, sabots de ville** : recomposés en boucles, grains de 0,18 s
    (rue) à 0,7 s (sabots). La rue, la place, le parc et le marché durent 24 s ; les pas et
    le carrefour, 20 s ; les sabots, 16 s.
  - **Le carrefour** : coupé avant le klaxon de 94 s.
  - **Le cheval sur un chemin** : bouclé en fondu. C'est la variante des sabots.
  - **Les enfants** : six cris, deux rires et un hurlement, isolés.
  - **La brouette** : cinq séries de grincements.

  **Les niveaux.** Une nappe se met au niveau par son énergie (`rms`, ≈ −20 dBFS), sa crête
  plafonnée à −1 dBFS. Les prises riches en crêtes restent plus bas, et leur niveau de jeu
  les rattrape (`NAPPES`) :

  | Prise | Sonie mesurée |
  |---|---|
  | brouhaha | −20,3 LUFS |
  | causerie | −24,7 LUFS |
  | jeux | −23,2 LUFS |
  | étals | −24,7 LUFS |
  | circulation | −21 LUFS |
  | pas | −32,3 LUFS |
  | sabots | −27,3 LUFS |

  **Le marché.** Il a sa nappe, `etals`. Elle est dosée par les flâneurs d'une place de
  marché qu'on voit (`iso/isoPlaza.js` note `etals`), de jour.

  **Crédits** : la ligne BigSoundBank de `CREDITS.md` passe à 24 enregistrements et 39
  fichiers. Dans Options › Crédits, l'entrée devient « Sons de la nature et de la ville ».

  **La mémoire.** 67 Mo mesurés d'abord : le contexte décodait les fichiers à 48 kHz. Ils
  sont désormais décodés à 32 kHz dans un contexte hors ligne, ce qui donne 53 Mo. Seul le
  fichier choisi de chaque nappe se décode : les variantes écartées restent sur le disque.
  ⚠ C'est au-dessus des 40 Mo visés au § 3.9. Le levier est pour le lot 6 : ne charger que
  les sons de l'âge en cours (la circulation au Néon, les sabots de la Pierre à la Fonte,
  les drones aux âges cosmiques).

  Vérifié dans le jeu, avec les vrais fichiers :
  - les 70 sons se décodent en 7 s, et les 15 nappes jouent ;
  - à la Couronne, près de la place centrale : causerie 0,57, jeux 0,57, brouhaha 0,29 ;
  - sur une place de marché : étals 0,73 ;
  - en suivant une charrette : deux voix de sabots, des grincements de roue ;
  - au Néon, la circulation se dose sur les voitures.

  88 tests du son et 295 de la carte passent. **Reste** : l'écoute de Raph.
- **2026-10-07, la rumeur lointaine selon l'âge (fin du lot 3).** Raph a jugé le lot 3 « bon ».
  Il le jugera en vrai sur de longues parties.

  Trois couches s'ajoutent sur le bus du lointain à la rumeur synthétisée du lot 1. Elles
  réemploient des sons déjà en mémoire, joués plus lents, donc plus graves et plus loin,
  sans un octet de plus :

  | Couche | Ce que c'est | À quels âges |
  |---|---|---|
  | `lointainFoule` | le brouhaha ×0,85 | de la Pierre à la Fonte ; moitié au Néon |
  | `lointainTrafic` | la circulation ×0,75 | un tiers à la Fonte ; pleine au Néon |
  | `lointainCosmique` | le bourdon des drones ×0,5 | aux âges cosmiques |

  Elles sont dosées comme la rumeur, par la taille de la ville et le dézoom.

  Vérifié au zoom 0,4 : la Couronne n'a que la foule, le Néon la circulation et la moitié
  de la foule, le cosmique le bourdon. Les couches sont discrètes (niveau 0,07 à 0,09) :
  dézoomer doit éloigner, pas monter le son. 70 tests passent.
- **2026-10-07, lot 4 (les métiers) : les branchements.** Ils sont faits avant les fichiers
  (liste au § 5.8). Tout ce qui est enregistré reste muet tant que le fichier manque.

  | Son | Couche | Ce qui le fait sonner |
  |---|---|---|
  | `port` | nappe | le port qu'on voit, quel qu'il soit (`iso/isoPort.js`, `drawIsoRiverside`), et les porteurs |
  | `mouette` | semé | les mouettes posées qu'on voit (`iso/isoVieOiseaux.js`), de jour |
  | `cloche` | ponctuel, synthétisé | un bateau de commerce qui accoste ou repart, le bac qui part ou touche la rive, de la Pierre à la Fonte (`iso/isoPort.js`) |
  | `feu` | émetteur | le foyer du campement, les braseros des parvis (hors âges cosmiques), les feux de culte et de guet |
  | `forge` | émetteur | la loge et la guilde (Feu à Couronne), le forgeron du Marbre, l'atelier des monnaies |
  | `charpente` | semé | les travaux publics, le charron des caravanes (Pierre à Marbre), de jour |
  | `vapeur` | émetteur | les machines de la Fonte, et les vapeurs qui naviguent ; `sifflet`, un jet de vapeur de temps en temps |
  | `electrique` | émetteur, synthétisé | les ateliers du Néon (monnaies, imprimerie, guilde) |
  | `troupeau` | nappe | les cloches, près des bêtes au pré qu'on voit |
  | `vache`, `chevre` | semés | les vaches et les chèvres qu'on voit, moins la nuit |
  | `coq` | semé | à l'aube seulement (cycle du jour 0,90 à 0,06), du côté des champs |

  Le bœuf ou le cheval qui laboure reprend le pas de l'`attelage`, plus discret.

  **Quelle scène fait quel bruit** : `paysage/metiers.js`, un module pur et testé, que la
  scène de moteur (`iso/isoEngineScene.js`) consulte. Les âges cosmiques n'ont pas d'atelier
  qui s'entende : leur bourdon est dans la rumeur.

  ⚠ **L'heure de l'image.** Une scène de moteur se dessine à l'horloge de son instance
  (`aNow`). Le guichet, lui, reconnaît une image à son heure : il faut lui donner le `now`
  de l'image, sinon la famille se vide à chaque scène.

  ⚠ **Un état de bateau se suit à chaque image**, avant le tri de ce qui est hors champ :
  un accostage hors champ ne sonne pas quand le bateau entre dans le champ. Une mémoire de
  plus d'une demi-seconde (flotte non dessinée, dézoom) ne compte pas.

  79 tests du son passent.
- **2026-10-07, le lot 3 est commité à part** (`c08866cb`, à la demande de Raph). Les
  fichiers des deux lots étaient mêlés : la version « lot 3 » de chaque fichier a été
  reconstruite, puis vérifiée dans une copie de travail temporaire (89 tests du son, 295 de
  la carte), avant d'être commitée seule.
- **2026-10-07, les 12 fichiers du lot 4 sont importés** : 23 sons, 62 fichiers en tout.
  - **Boucles en grains** : le port (24 s), le troupeau (24 s), le feu (12 s).
  - **Boucles en fondu** : l'enclume et la machine à vapeur (12 s).
  - **Coupés à l'enveloppe** : cinq séries de cris de mouettes, deux passes de scie, deux
    séries de clous, le jet de vapeur, quatre meuglements, trois bêlements, le coq.

  **Sonie mesurée** :

  | Prise | Sonie |
  |---|---|
  | port | −25,6 LUFS |
  | troupeau | −21,9 LUFS |
  | feu | −38,3 LUFS |
  | enclume | −17,6 LUFS |
  | vapeur | −21,1 LUFS |

  Les niveaux de jeu compensent. Le feu, fait de crépitements épars, est monté moins que
  l'écart.

  **Crédits** : 36 enregistrements BigSoundBank. S'y ajoutent Pablo Bergel (l'enclume) et
  Axeline T. (le troupeau, avec Joseph Sardin). L'entrée des Options en tient compte.

  **Le port loin de l'eau** est dessiné en scène de bâtiment. Il sonne aussi :
  `familleMetier('river_ports')` vaut `port`.

  Vérifié dans le jeu à la Couronne, avec les fichiers :
  - au pied du port, la nappe vise 0,37 ;
  - une forge d'atelier des monnaies a sa voix ;
  - les feux et les attelages sont repérés.

  ⚠ **La mémoire décodée monte à 71 Mo**, toutes familles chargées. Le chargement selon
  l'âge, prévu au lot 6, devient nécessaire.

  Pas vérifiés dans la pane : le bétail (ses images n'y chargent pas), le bourdon du Néon,
  la cloche. **Reste** : l'écoute de Raph.
- **2026-10-07, lot 5 (le temps).** Raph a jugé le lot 4 « très bien pour le moment ». Les
  4 fichiers du § 5.9 sont importés : 6 sons, 68 fichiers en tout.

  | Son | Couche | Quand |
  |---|---|---|
  | `pluie`, `pluieVille` | nappes | dosées par l'averse (`CM.rainF`), gonflées par ses rafales (`CM.gustF`), partagées selon la part de ville à l'écran (flaques, pavé) ; dézoomé, on l'entend encore |
  | la neige | filtre | l'hiver, la pluie du jeu tombe en neige (la carte la peint ainsi) : pas de pluie, le monde s'assourdit (passe-bas jusqu'à 5 kHz, −25 %), les sons semés se font rares (−60 %) |
  | `emeute` | nappe | la clameur d'une manifestation recomposée sans langue, dosée par les émeutiers proches (`FIG.RIOT`) |
  | `chien` | semé | un chien aboie au loin la nuit, du côté des maisons, jusqu'au Néon |
  | `carillon` | semé, synthétisé | des carillons de verre aux âges cosmiques, rares |

  **Les niveaux.** La pluie (−32,6 et −34,1 LUFS : de grosses gouttes très percussives)
  était trop basse. Une sonie se rapporte aux nappes synthétisées : −20 LUFS au niveau 0,2.
  La pluie est donc montée à 0,85 et 0,95.

  Vérifié dans le jeu, en forçant la météo et la saison :
  - en automne sous l'averse, en ville : pluie 0,44 et pavé 0,65 ; au zoom 0,5, 0,37 et
    0,23 ;
  - en hiver : neige 100 %, plus de pluie, la sortie tombe à −58 dBFS ;
  - le banc montre « neige N % ».

  Les réglages de météo et de saison de l'origine de vérification sont remis.

  105 tests du son et 295 de la carte passent. **Reste** : l'écoute de Raph. Le lot 6 doit
  traiter la mémoire décodée (plus de 70 Mo, toutes familles chargées) en ne chargeant que
  les sons de l'âge en cours.
- **2026-10-07, les lots 4 et 5 sont commités à part** (le lot 4 en `f5efca74`), à la
  demande de Raph, par la même méthode que le lot 3 : la version « lot 4 » des fichiers mêlés,
  vérifiée dans une copie de travail temporaire, posée sur le dernier commit de `main` (une
  autre session y avait commité entre-temps, rien n'est écrasé).
- **2026-10-07, lot 6 (le mixage final).** Demandé par Raph après les commits des lots 4
  et 5.

  **La mémoire** (§ 3.9). Tout charger d'un coup montait à 83 Mo. Désormais :
  - chaque définition dit ses âges (`ages: [de, à]`) : pas de circulation avant le Néon, pas
    d'oiseaux aux âges cosmiques, pas de carillons avant eux ; au changement d'âge, ce qui
    ne joue plus se libère ;
  - une définition ne joue qu'à son âge, même quand son fichier reste en mémoire pour une
    autre (la rumeur de foule réemploie le brouhaha) ;
  - la pluie et la clameur ne se chargent qu'au besoin, et restent deux minutes après ;
  - le banc d'écoute ouvert charge tout : on y écoute un carillon cosmique à l'âge du Feu.

  Mesuré dans le jeu : 50,4 Mo au Feu, 66,5 à la Couronne (71,6 sous l'averse, rendus à
  66,5 deux minutes après), 38,9 aux âges cosmiques, comme l'estimation. Le budget de 40 Mo
  visé au départ ne tient pas sans abîmer le son : `paysageMixage.test.js` garde chaque âge
  sous 70 Mo (76 sous l'averse d'une émeute) et vérifie qu'aucun son n'est orphelin.

  **Le dézoom** (§ 3.5). Mesuré en sonie pondérée, avec une sonde neuve du mixeur (le niveau
  efficace surestime le grave d'un vent) : dézoomé, le lointain sortait 6 à 11 dB au-dessus
  du proche. Son bus joue d'un bloc à 0,4 (−8 dB) ; la courbe est à plat, de −53,3 au zoom
  2,4 à −53,1 au zoom 0,3. Le banc montre la sonie pondérée à côté du niveau, et gagne un
  curseur « lointain ».

  **Le CPU** (§ 3.9). 0,3 ms par passage qui relit l'écran, cinq fois par seconde ; 0,02 ms
  sinon. Environ 2 ms par seconde, hors de l'image.

  **Le paquet.** `vite build` emporte les 68 fichiers (4,4 Mo) et le Worker de synthèse.
  L'.exe est vérifié sur pièces seulement : le protocole `app://` accepte `fetch`, la CSP
  permet `connect-src 'self'`. Il n'a pas été construit ici, pour ne pas écraser la release
  de `../ce-release` ni télécharger Electron : à faire par Raph (`npm run dist-win`), puis
  écouter la carte.

  **Steam.** La ligne « Sons » de `STEAM-PUBLICATION.md` § 2.2 et les deux brouillons de la
  déclaration nomment la synthèse et les enregistrements de terrain : aucun son n'est généré
  par IA.

  **Reste** : l'épreuve des longues parties, par Raph ; le curseur « lointain » à régler à
  son oreille.
- **2026-10-07, les réglages de Raph après quinze minutes de jeu**, versés dans les niveaux :
  le maître à 2,5 (`GAIN_MAITRE`) ; souffle ×0,5, feuillage ×0,55, courant ×0,7, ressac ×0,55,
  grillons ×0,5, brouhaha ×1,05, causerie ×0,5, troupeau ×0,95, pluie ×0,75, pluie sur le pavé
  ×0,45, sabots ×0,15, corneille ×2,5. La clé du banc passe à `civ-paysage-banc-4` : ses
  anciens multiplicateurs ne s'appliqueront pas une seconde fois.

  Avec le maître à 2,5, une corneille sous l'oreille, au volume plein, toucherait 0 dBFS : un
  **limiteur** garde désormais la sortie du mixeur (seuil −6 dBFS, rien en dessous).

  **Son retour** : dézoomé au-dessus de la forêt, il entendait encore la ville. La rumeur suit
  maintenant la ville qu'on voit, et la végétation au loin (`lointainForet`) prend sa place
  au-dessus des bois (§ 3.5). Le banc a son curseur. Raph fera des sessions plus longues.
- **2026-10-08, lot 7 (les grands moments).** Raph l'a choisi parmi les sons qui manquaient,
  avant l'interface. Ses décisions : pendant la chute, la musique **baisse et revient à
  l'aube** ; un son **discret à chaque âge, plus ample à chaque époque**, jamais au retour
  d'absence. Tout le reste au § 3.10.

  **Les accroches** (le guichet `moments/annonces.js`) :
  - la séquence de chute (`events.js`) : le début, le deuil, la fin ;
  - la vague sur la carte (`isoChute.js`, qui relève aussi `CHUTE.sons`) ;
  - le bouton qu'on maintient (`PrestigeView.jsx`) ;
  - l'achat à la main et l'achat de masse (`building.js`) ;
  - la pastille d'une maison qui sort de terre (`cityMapRuntime.js`, fichier en CRLF : fins de
    ligne gardées) ;
  - le Grand Reset (`building.js`) ;
  - le bandeau des âges (`App.jsx`).

  `main.js` gagne `holdMusicLow` (la musique tenue basse) et `rattrapageRecent` (posé par
  `advanceWorldBy`, que partagent l'absence et la clepsydre).

  **Vérifié** : les 47 sons se rendent sans écrêtage (test) ; dans le navigateur, chaque famille
  sonne, de −32 dBFS en crête pour une maison à −18 pour un effondrement, aux Bruitages par
  défaut ; une chute simulée fait tomber ses douze effondrements, sonne le glas au deuil et rend
  la musique à la fin. Le calage sur la vague, le saut, l'aube et le retour d'absence sont
  vérifiés en temps simulé (`moments.test.js`). **Pas vérifié** : une vraie chute sur la carte
  (la page de vérification est un onglet caché, où la carte refuse de la jouer), la pastille
  d'une maison (la partie neuve est au camp du Feu).

  **Reste** : l'écoute de Raph, au banc puis en jouant une chute.
- **2026-10-08, le maître du paysage × 0,7** (réglages de Raph, après écoute ; les grands
  moments restent à 1) : `GAIN_MAITRE` passe de 2,5 à 1,75. La clé du banc passe à
  `civ-paysage-banc-5`.
- **2026-10-08, lot 8 (l'interface).** Raph a choisi quatre sons : l'achat à la main, la
  bulle d'un passant, un succès, l'alerte de crise (§ 3.11). Il a écarté l'achat impossible,
  les onglets et menus, la fenêtre d'événement.

  **Les accroches** : `buyUpgrade` et `rewardCitizenThought` (building.js),
  `buyFaveurItem` et `buyTempleArtifact` (faveurShop.js), `checkAchievements` (le succès
  annoncé), et dans `App.jsx`, le niveau de crise du vignettage pour l'alerte.

  **Vérifié** : les 61 sons se rendent sans écrêtage ; dans le navigateur, un vrai clic sur
  « Acheter » fait un toc vers −29 dBFS en crête, une bulle −29, un succès −23, l'alerte −21
  (Bruitages par défaut) ; le reste en temps simulé (`moments.test.js`).
- **2026-10-08, lot 9 (les petits sons de la carte).** Raph a dit d'enchaîner après le lot 8.
  Le relevé de la carte a corrigé le plan : plus de moulin à eau, un seul lieu de culte (§ 3.12).
  Synthétisés : le moulin, l'éolienne, les cloches de culte de chaque époque (dont celle de la
  Cathédrale). Enregistrés, à télécharger (§ 5.11) : le canard, le chat, des variantes du
  chien. Introuvables en CC0 sans compte : le cygne, le héron.

  **Vérifié dans le jeu**, sur la partie de fin de jeu ramenée à la Fonte :
  - les six moulins d'une rangée sont repérés, les deux plus proches jouent ;
  - deux des trois lieux de culte sont repérés, avec leur feu ; le troisième est dessiné par
    un autre membre de son groupe de scènes ; la cloche de la Fonte se charge et joue ;
  - sur un quai, une famille de canards, le chat, un chien et deux hérons sont repérés ; plus
    loin, les cygnes ; ailleurs, un chien promené ;
  - les conditions de chargement s'allument quand ces choses passent à l'écran.
- **2026-10-08, les bêtes du lot 9 importées.** Raph a téléchargé les six prises du § 5.11.
  Quinze sons, coupés d'après l'enveloppe : six miaulements (`chat-`), trois aboiements du
  vieux chien et trois jappements d'un petit chien (`chienpres-`, sans le filtre du chien au
  loin), trois passages de cancans (`canard-`). 83 fichiers en tout. Crédits : DenisChardonnet
  (les canards) rejoint la liste.

  Mesurés dans le jeu, au bord d'un quai de la Fonte (sonie pondérée) : un canard −30, un chat
  −31, un chant d'oiseau −21 ; le chien tout près sortait à −39, son niveau passe de 0,12 à 0,2.
  Le cygne et le héron se taisent toujours (aucune prise CC0 sans compte Freesound).
- **2026-10-08, le lot 9 est entré dans main avec 11d5f393**, un commit des habitants (« la
  gazette parle de la voix… lot 6 ») : une autre session a commité pendant que le lot 9 était
  indexé (les sessions partagent l'index git). Son contenu y est entier et exact, poussé sur
  origin/main ; seul son message est celui des habitants.
