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

**Statut : décisions prises le 2026-10-07 (§ 9), lot 1 livré, lot 2 en cours.**
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
  - Un tick à 5 Hz, sans allocation : tableaux réutilisés.
  - Il lit ce que le peintre a déjà calculé (règle de `PERF-CARTE-REPRISE.md`).
  - Il s'accroche juste après `drawIsoWorld` (`map/cityMapRuntime.js:2591`) et saute les images
    de capture (`CM.capture`).
  - Coût visé : moins de 0,2 ms par tick.
- **Les voix** : au plus 24 sources simultanées.
  - Chacune a un `StereoPanner`, un `Gain` et parfois un filtre.
  - Pas de `PannerNode` HRTF : il est inutile en 2D et coûteux.
- **La mémoire** :
  - Un son décodé pèse durée × fréquence du contexte × canaux × 4 octets, soit **5,8 Mo** pour
    une boucle mono de 30 s à 48 kHz.
  - Budget visé : 40 Mo décodés au plus à la fois. Seule la famille d'âge courante est chargée.
  - Une nappe synthétisée en direct ne coûte qu'un petit tampon de bruit.
  - Piste à vérifier : décoder dans un `OfflineAudioContext` à 24 ou 32 kHz réduirait la mémoire
    d'un tiers à la moitié. Les nappes n'ont pas besoin de l'extrême aigu.
- **La largeur sans la stéréo** : une nappe mono jouée par deux têtes de lecture décalées de plus
  de 10 s, panoramiquées à ±0,4, sonne large pour moitié moins de mémoire.
- **Le poids livré** : 10 à 20 Mo d'Ogg pour tout le paysage. Les ponctuels sont en mono.
  ⛔ Jamais de MP3 pour une boucle.
- **Les fichiers sont déclarés** par `import.meta.glob`, comme les musiques, et jamais sondés
  par URL. C'est la leçon de l'.exe : une chaîne de replis d'URL demande tous ses maillons.

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

### 5.5 Les règles de licence (celles du dépôt, appliquées au son)

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
| **7. Plus tard** | Les sons de priorité 3 (27 à 30), puis la liste « hors ambiance » du § 4 : la chute, l'achat d'un bâtiment, les clics. | À décider. |

Chaque lot est livré par petites touches commitées, comme d'habitude, et ne part qu'après la
validation à l'oreille du précédent.

---

## 7. La chaîne de préparation des fichiers

- **Raph télécharge et dépose ; jamais moi** (règle Defender).
- **Une table `audio/paysage/catalogue.js`** décrit chaque son du jeu : son fichier source, ses
  points d'entrée et de sortie, son gain, sa couche.
- **Un script `scripts/importSons.mjs`** lit la table. Pour chaque son, il :
  - découpe ;
  - passe en mono quand il le faut ;
  - normalise ;
  - pose les fondus et, pour une boucle, le fondu croisé de la couture ;
  - encode en Ogg et écrit dans `src/assets/sons/`.
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
| **La mémoire** | Familles d'âge chargées à la demande, synthèse en direct pour les textures, budget de 40 Mo mesuré. |
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
  versé dans son niveau ; la clé du banc devient `civ-paysage-banc-3`. **Lot 1 livré.**
