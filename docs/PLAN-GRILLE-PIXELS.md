# Plan — La grille de pixels : art de carte contre art vivant

Chantier ouvert le 2026-08-30, sur une observation de Raph pendant la séance
des ponts : « pourquoi un pixel de pont est plus grand qu'un pixel d'animal ? »

La réponse mesurée est plus large que la question : **il n'y a pas une grille de
pixels dans ce jeu, il y en a deux.** Tout ce qui est bâti tient dans une bande
étroite ; tout ce qui bouge est trois à cinq fois plus fin.

⚠ **CE N'EST PAS UNE DÉCOUVERTE — c'est une GÉNÉRALISATION.** Le 2026-08-03, le
même défaut avait déjà été diagnostiqué SUR LES HABITANTS : « sprites 88-100 px
affichés à 13,6 px × zoom, jamais au-dessus de 47 % du natif, ÷5 au défaut →
bouillie et fourmillement (nearest sous-pixel à chaque frame) ; bâtiments sains
car ~1:1 ». Raph avait alors tranché pour la **DA FLAT** : redessiner les
personnages plus simples plutôt que changer la résolution — un art qui perd
moins quand on lui retire des pixels. Cette passe a bel et bien réduit les
planches de 88-100 px à 52-56 px, donc divisé la perte par deux.

Ce que ce plan ajoute, et qui n'a jamais été traité :
1. le défaut ne concerne pas que les habitants — **les émeutiers, les attelages
   et les bêtes de trait sont deux à quatre fois pires qu'eux**, et n'ont jamais
   eu de passe ;
2. la densité des **bateaux varie avec l'ère** (×1,9 du radeau au conteneur, sur
   la même planche) ;
3. il n'existe **aucun zoom** où les deux mondes sont en grille ensemble ;
4. le relevé chiffré de TOUTES les familles, dans une seule unité.

> **🏁 2026-08-30 — LOT G0 FAIT, ET IL CORRIGE LE PLAN.** Le relevé du §1.2 est
> désormais MESURÉ (sonde `pixelGrid.js`, 31 familles, ~100 000 blits). Trois
> chiffres du premier jet étaient faux, et l'un d'eux change la cible du
> chantier :
> · **les habitants sont à 0,66, pas à 0,37** — la bascule `-half` de la DA FLAT
>   est active à tous les zooms de jeu, la formule ne la voyait pas. Ils sortent
>   du lot G1 ;
> · **les émeutiers sont à 0,146** — planches de 92 px, aucune `-half`, LE pire
>   cas du jeu, et ils n'étaient même pas au tableau ;
> · **le bétail** (chat, chien, mouton, chèvre, vache) est une famille vivante
>   entière qui manquait au relevé — et elle va bien (0,44-0,48).
> L'écart carte/vivant mesuré est de **×7,5**, pas ×5.
>
> **⛔ Dans la foulée — G1a (cuire les émeutiers) ESSAYÉ puis REFUSÉ par Raph le
> même jour : « ils ne ressemblent plus à rien ».** La densité passait pourtant
> de 0,146 à 0,595. Annulé, état d'origine re-mesuré. **La leçon vaut pour tout
> le reste de G1 : une cuisson ne sauve pas un art qui n'a pas été dessiné pour
> la taille visée** — les habitants ont d'abord été REDESSINÉS flat, puis
> réduits ; réduire ×4 une figurine détaillée ne donne pas une figurine plus
> petite, ça donne une tache. Lire §5-G1a avant de cuire quoi que ce soit.

**Position par rapport aux plans voisins.** `PLAN-ECHELLE.md` traite la toise
MACRO (la masse d'une tour contre celle d'un bateau). `PLAN-EGALISATION-GRAIN.md`
traite le GRAIN — la taille apparente des portes et des fenêtres — et il a
égalisé les BÂTIMENTS entre eux, en prenant l'habitant comme étalon. Les deux
raisonnent en pixels APPARENTS. Aucun des deux ne s'est demandé si les pixels
SOURCES avaient la même taille d'une famille à l'autre. C'est ce trou-ci.

⚠ Ce plan ne rouvre ni l'un ni l'autre. En particulier, la taille affichée des
habitants reste ce qu'elle est : c'est un réglage de Raph, et c'est l'ancre de
tout le calibrage des portes de `PLAN-EGALISATION-GRAIN` (habitant visible =
10 px). Le sujet ici est la RÉSOLUTION DE LA PLANCHE, pas la taille du
personnage.

---

## 1. Le problème, mesuré

### 1.1 La toise

**Densité** = combien de pixels ÉCRAN vaut UN pixel de l'art, au zoom 1 (le zoom
par défaut, `layout.js` : `cam.zoom = 1`). C'est la même unité que celle de
`PLAN-EGALISATION-GRAIN` §1.1, étendue aux familles qu'il ne couvrait pas.

Une densité de 1,00 veut dire : le pixel de l'artiste est le pixel de l'écran.
En dessous, l'image est RÉDUITE au blit ; au-dessus, elle est agrandie.

### 1.2 Relevé MESURÉ (sonde G0, 2026-08-30)

⚠ **Ce tableau a remplacé un relevé à la main, et il le contredit sur trois
points.** La première version venait d'une lecture de code : formules suivies de
bout en bout, planches mesurées au PNG. La sonde (§5, G0) lit la boîte
RÉELLEMENT passée à `drawImage`. L'écart entre les deux, c'est très exactement le
piège que le plan s'était promis d'éviter — et il a mordu.

Relevé : 31 familles, ~100 000 blits, cinq villes de démo (ères 4, 8, 11, 32, 46)
plus une émeute forcée. Densité **cumulée** (Σboîte / Σplanche), normalisée à
zoom 1.

| Famille | Planche | Boîte @z1 | Densité | Zoom « en grille » |
|---|---|---|---|---|
| Habitations | 26–93 | 46,9 | **1,096** | 0,91 |
| Sol et routes | 64 | 64,8 | **1,012** | 0,99 |
| Pont béton | tranches 1–6 | — | **0,944** | 1,06 |
| Merveilles | 141–181 | 155,3 | **0,941** | 1,06 |
| Pont énergie | tranches 2–6 | — | **0,940** | 1,06 |
| Bateau cosmique (legacy) | 68 | 62,7 | **0,922** | 1,08 |
| Bateau conteneur (amarré) | 85 | 67,0 | **0,788** | 1,27 |
| Porteurs de panier | 26 | 18,7 | **0,718** | 1,39 |
| Scènes moteur | 48–224 | 68,1 | **0,683** | 1,46 |
| **Habitants** | **28–32** | 19,3 | **0,660** | **1,52** |
| Bateau voilier | 85 | 46,4 | **0,546** | 1,83 |
| Bétail — chat | 14 | 6,7 | **0,480** | 2,08 |
| Flotte moderne (bus, van, camion, police) | 32–58 | 14–26 | **0,448–0,457** | 2,2 |
| Bétail — chien | 20 | 8,8 | **0,440** | 2,27 |
| Bateau radeau | 85 | 35,0 | **0,412** | 2,43 |
| Voiture | 32–68 | 14,4 | **0,410** | 2,44 |
| Barque du pêcheur | 85 | 33,5 | **0,394** | 2,54 |
| Caravane | 68 | 20,0 | **0,294** | 3,40 |
| Habitant — repli CARDINAL | 68 | 17,6 | **0,259** | 3,85 |
| Chariot bâché (wagon) | 68 | 17,0 | **0,250** | 4,00 |
| Char (chariot) | 68 | 16,0 | **0,235** | 4,25 |
| Bœuf, cheval de trait | 68 | 15,6 | **0,229** | 4,36 |
| Bête de trait — repli CARDINAL | 68 | 10,7 | **0,157** | 6,38 |
| **Émeutiers** | **92** | 13,4 | **0,146** | **6,84** |

### 1.3 Ce que la mesure a changé

**a) Les habitants ne sont plus le sujet — ils sont réglés.** Le relevé à la main
disait 0,35-0,38 ; ils sont à **0,66**. La formule ignorait la BASCULE `-half` :
sous 70 % de la bande pleine, `drawNamedAgentIso` sert la planche pré-cuite à
demi-taille (28-32 px), et cette bascule est active à TOUS les zooms de jeu. La
DA FLAT de 2026-08-03 et ses `-half` avaient donc fait plus que « diviser la
perte par deux » : elles ont sorti les habitants du problème. Même chose pour les
porteurs de panier (0,718), traités le même jour.

**b) LES ÉMEUTIERS SONT LE PIRE CAS DU JEU, ET ILS N'ÉTAIENT PAS AU TABLEAU.**
0,146 : une planche de 92 px blitée dans 13,4. Ils ne rendent qu'un pixel sur
sept. Leurs bandes diagonales sont les PLUS GRANDES du jeu (88-96 px, plus
grandes que les habitants d'avant la refonte) et ce sont les seules bandes
d'agent sans aucune `-half` — les deux erreurs cumulées. Zoom en grille : 6,8.

**c) Le bétail existe, et il se porte bien.** Chat, chien, chèvre, mouton, vache
(`critters.js`) : une famille vivante entière absente du relevé. Mesurée à
0,44-0,48 — parce que ses planches font 14 à 34 px, c'est-à-dire *déjà* la taille
d'affichage. C'est la démonstration de ce que propose G1, faite par le pack
d'origine (LaserKiwi) sans que personne ait eu à cuire quoi que ce soit.

**d) Les replis CARDINAUX sont un troisième monde, plus fin que le second.**
Quand une bande diagonale n'est pas encore décodée (changement d'ère, premier
affichage), le rendu retombe sur la bande cardinale : villager 68 px à **0,259**
pour un habitant, **0,157** pour une bête de trait — pire que tout le reste. Ça
ne dure qu'une seconde, mais ça tombe pile au moment où l'œil regarde (l'ère
vient de changer).

**e) Le reste du relevé à la main tient.** Bus 0,448 (annoncé 0,448), merveilles
0,941 (annoncé 0,941), ponts 0,940-0,944 (annoncé 0,941), attelages et bêtes à
0,23-0,29 (annoncé 0,22-0,25). La méthode n'était pas mauvaise — elle était
aveugle à UN mécanisme, la bascule `-half`.

### 1.4 Deux mondes, pas un continuum

- **La carte** : 0,94 à 1,10 (sol, ponts, merveilles, habitations). Cohérent à
  ±8 %, et ce n'est pas un hasard — c'est le résultat de
  `PLAN-EGALISATION-GRAIN`. Les ponts y sont entrés par le même geste (`tilePx`
  PAR MATIÈRE, posé pour que le tablier tombe à la densité de la carte).
  ⚠ Les SCÈNES MOTEUR n'y sont pas : 0,683 en moyenne, de 0,26 à 1,72 selon
  l'empreinte. C'est connu et voulu (plancher `grainTune.floor`), mais ça veut
  dire que « le bâti est en grille » ne vaut que pour les habitations.
- **Le vivant** : 0,15 à 0,92. Ce n'est plus une bande étroite : les bateaux de
  fin de partie sont presque en grille, les émeutiers sont à un septième.

L'écart mesuré entre le plus dense de la carte et le plus fin du vivant est de
**×7,5** — pas ×5. Et la falaise n'est plus entre « bâti » et « vivant » : elle
est entre **ce qui a reçu une passe de résolution** (habitants, porteurs,
bétail : 0,44-0,72) et **ce qui n'en a jamais reçu** (émeutiers, attelages,
bêtes : 0,15-0,29).

### 1.5 Le bateau, preuve du mécanisme — MESURÉE

Le radeau et le porte-conteneurs sortent du **même fichier de 85 px**. Le premier
est dessiné sur 1,36 tuile, le second sur 2,6, et la flotte cosmique sur 3,2
(`FLEET_SCALE`, isoFleet.js).

La sonde ferme la ligne « à mesurer » du relevé, et elle confirme :

| Stade | Planche | Densité mesurée |
|---|---|---|
| Barque du pêcheur | 85 | 0,394 |
| Radeau | 85 | 0,412 |
| Voilier | 85 | 0,546 |
| Porte-conteneurs (amarré) | 85 | 0,788 |
| Vaisseau cosmique (repli legacy) | 68 | 0,922 |

**×1,91 sur la MÊME planche de 85 px** entre le radeau et le conteneur, **×2,24**
de bout en bout — l'annonce était ×2,35, elle était juste.

Personne ne l'a décidé : `FLEET_SCALE` a été réglé pour que les coques aient la
bonne MASSE (chantier ÉCHELLE), et la densité a suivi en silence. C'est
exactement le mécanisme de fond : **on règle une taille en tuiles, la densité
tombe comme un reste.**

⚠ Noter que le vaisseau cosmique passe par un AUTRE chemin (bande legacy 68 px,
`BOAT_ISO` ne le couvre pas) : sa densité de 0,92 n'est pas un progrès de la
flotte, c'est une autre planche. Un art iso cosmique le ramènerait à ~0,85 sur la
planche de 85.

---

## 2. Le vrai symptôme

### 2.1 Ce n'est pas « c'est plus fin », c'est « on jette »

Le blit se fait `imageSmoothingEnabled = false` partout : c'est une réduction au
PLUS PROCHE VOISIN, donc une famille sous 1,00 ne « perd pas en finesse », elle
JETTE des lignes entières. Chiffres de la sonde, au zoom 1 :

| Famille | Planche → boîte | Lignes gardées | Jetées |
|---|---|---|---|
| Émeutiers | 92 → 13,4 px | 15 % | **6 sur 7** |
| Bête de trait | 68 → 15,6 px | 23 % | **3 sur 4** |
| Chariot bâché | 68 → 17 px | 25 % | **3 sur 4** |
| Voiture | 32 → 14,4 px | 41 % | 3 sur 5 |
| Bus | 58 → 26 px | 45 % | 1 sur 2 |
| Habitants (planche `-half`) | 30 → 19,3 px | 66 % | 1 sur 3 |

Et **lesquelles** survivent dépend de la position sous-pixel du sprite. Quand le
personnage marche, ce ne sont pas les mêmes lignes d'une image à l'autre : les
détails GROUILLENT. C'est le coût visible, et il est invisible sur une capture
fixe — il faut regarder bouger.

⚠ Conséquence pour l'art : **les six septièmes du travail de dessin sur un
émeutier** et les trois quarts sur une bête de trait n'atteignent jamais l'écran
au zoom de jeu.

⚠ Le fourmillement, lui, a déjà été traité pour ce qui passe par
`drawNamedAgentIso` — habitants, porteurs, émeutiers : coordonnées et hauteur de
blit ARRONDIES à l'entier (2026-08-03).

🏁 **Les véhicules et les bêtes de trait l'ont eu le 2026-08-30** (`snapU` dans
iso/isoUnits.js). Ils blitaient en coordonnées FLOTTANTES et cumulaient donc la
perte de lignes ET le déplacement de la coupe d'une image à l'autre. **Aucun art
touché, aucune taille apparente changée** (le bœuf passe de 15,6 à 16 px, soit
0,4 px) — et c'est indépendant de toute cuisson, donc le refus de G1a ne le
concerne pas.

- ⚠ **Rabattu sur la grille DEVICE, pas la grille CSS.** Le contexte est scalé
  par `dpr` : un `Math.round` en px CSS tombe sur un QUART de pixel à dpr 1,25 et
  une DEMIE à 1,5 — les deux échelles Windows les plus répandues, où l'arrondi ne
  servirait donc à rien. C'est la leçon S6 de `PLAN-RENDU-VILLE`, déjà payée pour
  les bâtiments (`snapDev`) ; à dpr 1 les deux sont identiques, donc rien ne
  bouge sur un écran à 100 %.
- **MESURÉ, frame déterministe** (`captureFrame({now})`, sinon la scène anime
  toute seule et le témoin sort à 4 327 px changés sur 14 400) : on décale un
  char de 0,1 px monde en 0,1 px monde et on compte les pixels qui changent.
  Résultat : **0 pixel** tant qu'il reste dans le même pixel de destination, puis
  un saut franc au franchissement. Le sprite ne se ré-échantillonne plus, il se
  translate. Sur un attelage, 12 à 14 px changent encore : c'est le TIMON, un
  trait vectoriel qui n'a aucune raison de sauter — vérifié en refaisant la
  mesure sur un char, qui n'en a pas, et qui rend 0.
- ⚠ `agents.js` continue d'arrondir en px CSS de son côté. Même besoin, même
  correctif possible, mais c'est du rendu validé par Raph : à faire en une passe
  cohérente, pas en passant.

### 2.2 Aucun zoom ne réconcilie — il inverse

Le zoom auquel une famille tombe pile sur la grille (planche = boîte), mesuré :

| Famille | Zoom « en grille » |
|---|---|
| Habitations | 0,91 |
| Sol, routes | **0,99** |
| Ponts, merveilles | 1,06 |
| Habitants | 1,52 |
| Bus, voiture | 2,2–2,4 |
| Attelage ancien | 4,0 |
| Bête de trait | 4,4 |
| Émeutiers | **6,8** |

À z = 1 la carte est exacte et les émeutiers sont écrasés. Il faudrait z ≈ 6,8
pour les remettre en grille — six fois le zoom par défaut, où la carte serait un
damier de blocs 7×7. **Il n'existe aucun zoom où les deux mondes sont en grille
en même temps** — le zoom déplace le défaut, il ne le résout pas.

Ce que la mesure ajoute : l'étalement s'est ÉLARGI, pas resserré. Les familles
traitées (habitants à 1,52) sont maintenant à un facteur 1,5 de la carte, les
autres à un facteur 4 à 7. Un seul zoom de cuisson ne peut pas les servir toutes
— d'où G3.

---

## 3. D'où ça vient

Deux causes indépendantes, qui se multiplient.

**a) Deux conventions d'écriture jamais confrontées.** L'art de carte est écrit
À LA TUILE : une tuile de sol EST un 64×32, la question de la densité ne se pose
pas. L'art vivant est écrit À LA PLANCHE — une taille de sprite standard, et
elle varie déjà beaucoup selon le lot : 36, 52, 56, 58, 68, 85 px. Cette planche
est ensuite comprimée dans une fraction de tuile. Rien, nulle part, ne lie la
taille de la planche à la taille monde.

**b) Les rétrécissements successifs n'ont touché que la taille affichée.**
`AGENT_SCALE` 0,5, `VEH_SCALE` 0,625 (« moitié, puis remontée de 25 % »), la
régé FLAT de 2026-08-03 (ratio perso/canvas 0,50 au lieu de 0,728). Chacun de
ces réglages a réduit ce qu'on voit sans toucher à la planche — donc chacun a
creusé l'écart d'autant. Avant eux, le rapport carte/agents était d'environ 2,5 ;
il est de 4.

---

## 4. Hors périmètre

- 🚫 **Agrandir les agents pour « rattraper ».** Leur taille affichée est un
  arbitrage de Raph et l'ancre du calibrage des portes
  (`PLAN-EGALISATION-GRAIN` §2 : habitant visible = 10 px). On corrige la
  RÉSOLUTION, jamais la taille.
- 🚫 **Rouvrir l'égalisation du grain des bâtiments** : c'est l'autre plan, il
  a ses lots.
- 🚫 **Toucher aux retouches main de Raph** (bois du pont, calques rail) sans
  son accord.

---

## 5. Les lots

### G0 — La sonde, avant tout chiffre — 🏁 **FAIT (2026-08-30)**

Module : [`src/game/map/pixelGrid.js`](../src/game/map/pixelGrid.js).
Test de garde : `src/game/map/__tests__/pixelGrid.test.js`.

    __pxGrid(true)     arme et remet à zéro
    __pxGridAudit()    console.table + { rows, verdict }, aussi dans __pxGridLast
    __pxGrid(false)    éteint

Treize sites de blit instrumentés, chacun d'UNE ligne posée juste avant son
`drawImage` : habitants (iso + repli cardinal), porteurs, émeutiers, véhicules,
bêtes de trait, bétail, bateaux (3 chemins), ponts, sol/routes, habitations,
scènes moteur, merveilles. **Éteinte, elle ne coûte qu'un booléen de module lu
par blit** (idiome de `depthProbe`, isoUnits.js) : elle ne s'arme qu'à la main.

Ce que la campagne de mesure a appris — à relire avant d'y toucher :

- ⚠⚠ **La densité doit être CUMULÉE (Σboîte / Σplanche), jamais une moyenne de
  ratios.** Un pont est blité en TRANCHES de 1 à 6 px source, aux bords arrondis
  au pixel entier (anti-fente d'eau) : une tranche de 1 px qui en rend 2 pèse
  2,00. Mesuré sur un même ouvrage : ratios de 0,54 à 2,15, densité vraie 0,944.
  Le premier jet de la sonde moyennait — il donnait 0,955 par chance et aurait
  menti sur n'importe quel ouvrage plus court. Verrouillé par test.
- ⚠⚠ **Lire la boîte RÉELLE, pas la formule** : c'est ce qui a levé la bascule
  `-half` des habitants (§1.3a), invisible dans le calcul. La consigne du plan
  était juste et elle a payé dès la première frame.
- ⚠ **Un facteur peut vivre HORS des arguments de `drawImage`** : la flotte
  legacy applique `sizeMul` par `ctx.scale`, pas dans `dw`. Sans le rattraper à
  la main, le stade cosmique se mesurait 3× trop fin. Vérifier la pile de
  transformations avant de croire une boîte.
- ⚠ **`critters.js` n'a AUCUN IMPORT et doit le rester** (cycle layout →
  critters → layout). Il RENVOIE sa mesure — un objet, donc toujours vrai pour
  les appelants en `if (!drawCritterIso…)` — et c'est le peintre qui enregistre.
- ⚠ **Les replis se mesurent aussi, et ils sont pires que le chemin nominal.**
  Sans instrumenter les chemins cardinaux, on rate 0,157-0,259 (§1.3d).
- ⚠ Gotchas de séance : le pane caché fige rAF et les timers → appels courts et
  onglet au premier plan (sinon `javascript_tool` sort en timeout à 45 s) ; les
  bandes d'un agent mettent ~1 s à décoder, donc **forcer des frames AVEC
  attente** (`await` entre les `CM.forceFrame()`), sinon la famille visée
  n'apparaît jamais au relevé ; pour les émeutiers, il faut à la fois
  `state.instability > 0,55` ET la fenêtre d'après-midi — on la force en gelant
  `Date.now` sur `0,42 × 540 000` (⚠ ne pas `delete Date.now` pour le rendre :
  il n'y a rien derrière, le reprendre sur une iframe neuve).

### G1 — Cuire à la taille d'affichage

Déplacer la réduction du RENDU vers la FABRICATION : chaque famille animée est
cuite une fois à la taille où elle est dessinée, avec un vrai rééchantillonnage
et une requantification de palette — au lieu de jeter 60 à 80 % des pixels à
chaque image.

**Ordre RÉVISÉ par la mesure de G0**, du pire au moins mauvais :

1. **Émeutiers (0,146)** — ⛔ cuisson essayée et **REFUSÉE par Raph** le
   2026-08-30 (G1a ci-dessous). Reste au pire cas du jeu, assumé.
2. **Bêtes de trait (0,229) et attelages (0,235-0,294)** — jamais traités.
   ⚠ Le cuiseur est écrit, mais le refus de G1a s'applique tant qu'on n'a pas
   répondu à SA question : cet art-là a-t-il été dessiné pour cette taille ?
3. **Flotte moderne et voiture (0,41-0,46)** — le pack MinZinn est déjà à la
   bonne moitié du chemin (planches 32-58, pas 68).
4. ~~Habitants~~ — **RETIRÉS DU LOT.** Mesurés à 0,66 : la DA FLAT + les bandes
   `-half` les ont sortis du problème. Y revenir serait rouvrir un arbitrage de
   Raph pour un gain qui n'existe plus.

#### G1a — Émeutiers : ⛔ ESSAYÉ PUIS **REFUSÉ PAR RAPH** (2026-08-30)

> **« annule les émeutiers, ils ne ressemblent plus à rien là »**

La cuisson marchait au sens du plan — **densité 0,146 → 0,595**, zoom en grille
6,84 → 1,68, six pixels sur sept jetés à chaque image ramenés à un sur trois — et
elle a quand même été refusée. **C'est le verdict qui compte, pas la métrique.**
Annulée le jour même : les 80 `-half.png` supprimés, rien d'autre à défaire (le
rendu retombe seul sur les planches pleines), état d'origine re-mesuré en jeu
(planche 92-96, densité 0,151).

⛔ **NE PAS RE-CUIRE LES ÉMEUTIERS.** Et la leçon dépasse ce lot :

**Une cuisson ne sauve pas un art qui n'a pas été dessiné pour cette taille.**
Les habitants ont leurs `-half` parce que la DA FLAT les avait D'ABORD redessinés
en aplats larges à contour franc : réduire ça de moitié garde des formes. L'art
des émeutiers est de la « Figurine d'époque » détaillée, en 92 px ; le réduire de
QUATRE fois ne rend pas une figurine plus petite, ça rend une tache. Le gain de
netteté est réel et le personnage disparaît quand même — la stabilité ne
compense pas la perte d'identité.

C'est exactement ce que le panel des habitants avait déjà tranché le 2026-08-03
(« redessin figurine 24-32 px → encore trop de bruit »), et la réponse retenue
alors n'était pas de mieux réduire, c'était de **redessiner plus simple**. Le
§5-G1 le disait déjà en une ligne ; il fallait le lire avant de cuire, pas après.

**Donc, pour les émeutiers, deux routes seulement** — aucune n'est une cuisson :
1. **Régé FLAT** (même recette que les 30 habitants, `scripts/isoBatchRoster.json`)
   : 20 personnages × 4 diagonales. Coûte des générations PixelLab, donc ça se
   demande. C'est la seule route qui les mette vraiment en grille.
2. **Ne rien faire.** Ils sont à 0,146, ils fourmillent, et c'est l'état
   accepté — l'option honnête si le sujet ne vaut pas ce prix-là.

⚠ **Ce que le lot laisse quand même**, et qui reste utile aux autres familles :
`scripts/bakeHalfBands.mjs` (le cuiseur et ses quatre mesures de garde),
`scripts/halfABSheet.mjs` (la planche-contact avant/après à taille apparente
identique) et la molette **`__agentHalf(false)`**, qui rejoue le « avant » en jeu
en une frame — c'est elle qui a permis de juger, et donc de refuser.

⚠⚠ **Et surtout : AVANT de cuire une autre famille, se demander d'abord si son
art a été dessiné pour la taille visée.** Le bétail (§1.3c) est né à 14-34 px et
va bien ; les habitants ont été redessinés puis réduits ; les émeutiers, non.
Les mesures qui suivent disent si une cuisson est FIDÈLE, pas si elle est BONNE.

<details><summary>Les trois pièges techniques de la cuisson, mesurés — utiles si
un autre lot y revient</summary>

    node scripts/bakeHalfBands.mjs events rioter- --div=4 --alpha=120 \
         --hot=public/pixelart/fire-ramp.json --scale=0.85
    node scripts/halfABSheet.mjs events rioter- --drawH=14      # la planche A/B

    node scripts/bakeHalfBands.mjs events rioter- --div=4 --alpha=120 \
         --hot=public/pixelart/fire-ramp.json --scale=0.85
    node scripts/halfABSheet.mjs events rioter- --drawH=14      # la planche A/B

⚠⚠ **TROIS PIÈGES, deux payés en dur :**

1. **La moyenne de couleurs ÉTEINT LA TORCHE.** La recette du ÷2 des habitants
   (moyenne prémultipliée + rabattage sur la palette) ne survit pas au ÷4 : un
   bloc de seize pixels contenant trois pixels de flamme rend un brun de
   vêtement. Médiane de rampe de feu **153 → 4 px, et ZÉRO sur certaines
   bandes**. C'est la garde `flameHue.test.js` qui l'a arrêté, **pas l'œil** — à
   13 px on ne voit pas qu'une torche a changé de teinte. D'où la règle « les
   braises gagnent » (`--hot`) : une couleur chaude qui occupe ≥ 12 % du bloc
   l'emporte sur la moyenne. Médiane rétablie à 19, aucune bande éteinte.
2. **La plurialité NOIRCIT TOUT.** Deuxième essai : prendre la couleur qui occupe
   le plus d'aire dans le bloc. Elle rallume la torche et n'invente aucune
   teinte… et rend des silhouettes NOIRES, parce que cet art a un contour noir
   épais qui gagne la majorité presque partout. **Aire, ligne de pieds et torche
   étaient bonnes au chiffre près** — ça ne s'est vu que sur planche-contact.
   D'où la mesure de dérive de LUMINANCE, ajoutée au cuiseur pour que ce trou-là
   ne se reperde plus.
3. **Le seuil d'alpha est le vrai réglage, pas le diviseur.** À 128 (la valeur du
   ÷2) certaines bandes perdaient 10 % de leur aire — un manche, un bras. À
   **120**, aucune n'en perd plus de 2,3 %. Mesuré, pas choisi.

4. **La bascule ne rend JAMAIS la planche pleine au zoom maximum.** Elle sert la
   `-half` tant que `drawH ≤ 0,7 × planche PLEINE` — pour une cuisson ÷4, ça veut
   dire jusqu'à z = 4,7, au-delà du zoom max du jeu. Une famille cuite est donc
   AGRANDIE en zoom max (×1,9 pour les émeutiers, là où ils étaient réduits
   ×0,47). C'est cohérent avec la carte et avec les habitants, mais c'est un
   changement visible qu'il faut montrer, pas découvrir.

⚠ Le repli CARDINAL (bandes 68 px, `drawNamedAgent`) n'a PAS de `-half` et n'en
aura pas : cette fonction-là ne connaît pas la bascule. Il ne sert que la seconde
de chargement des diagonales (§1.3d).

</details>

⚠ Et la leçon de la DA FLAT vaut toujours : **simplifier le dessin est une
réponse aussi valable que remonter la résolution**, souvent moins chère. Le
bétail (§1.3c) en est la preuve : planches nées à 14-34 px, densité 0,44-0,48,
aucune cuisson.

🏁 **Le correctif gratuit est FAIT (2026-08-30)** : coordonnées et taille de blit
des VÉHICULES et des BÊTES DE TRAIT rabattues sur la grille device (§2.1). Il ne
touche à aucun art, il ne change aucune taille apparente, et il tient tout seul —
c'est le seul morceau de G1 qui ait survécu à la séance.

🏁 **2026-09-14 — le même correctif, étendu à TOUT le vivant.** Raph : « j'ai
besoin de ne plus voir de clipping » (= le fourmillement). Le relevé des sites de
blit disait que trois familles restaient hors grille : les habitants, porteurs et
émeutiers (`agents.js` arrondissait en px CSS — juste à dpr 1, faux à 1,25 et
1,5), les BATEAUX (`isoPort.js` : flotte et amarre PixelLab, **aucun arrondi**,
et un tangage en fraction de pixel qui faisait fourmiller la coque même à quai)
et le bétail (`critters.js`, taille fractionnaire). L'arrondi vit désormais dans
UN module, `src/game/map/blitSnap.js` (`snapDev`), importé par `agents.js`,
`isoPort.js`, `isoUnits.js` (ex-`snapU`) et `cityEngineSprites.js` ;
`critters.js`, qui n'a pas d'import, reçoit `dpr` en argument. Garde :
`__tests__/vivantSnapDevice.test.js` lit les sources des sites de blit.
- ⚠ Le poste de Raph est à dpr 1 (échelle Windows 100 %) : pour les habitants
  le changement est nul chez lui ; ce qu'il voit changer, ce sont les bateaux.
- ⚠⚠ **Ce que l'arrondi ne règle pas** : le bouillonnement des FRAMES aux
  basses densités (émeutiers 0,146, bêtes de trait 0,23, attelages 0,24-0,29),
  où chaque image de marche se ré-échantillonne autrement même à position
  entière. C'est la résolution de l'art (§5-G1a) ; et les drones tournent
  (`ctx.rotate`, isoSky.js), ce qu'aucun arrondi ne tient.
- Non mesuré en jeu cette séance : pane Browser caché → rAF muet.

- Gain attendu : personnages EN GRILLE, fin du grouillement, et moins de travail
  GPU (le blit ne réduit plus).
- ⚠⚠ La cuisson doit se faire **à taille apparente CONSTANTE** : le personnage
  visible reste à 10 px. On ne change que la finesse de sa planche.
- ⚠⚠ Vérification obligatoire sur PLANCHE-CONTACT complète, jamais sur trois
  sprites — c'est la leçon de `building-frontview-regen`, payée deux fois.

### G2 — Ancrer la densité des bateaux, pas leur taille en tuiles

`FLEET_SCALE` règle une masse ; la densité en tombe. Soit on cuit chaque stade à
sa taille (G1), soit on donne aux bateaux l'équivalent du `tilePx` des ponts :
un nombre de px source par tuile, PAR STADE, tenu constant.

⚠ **Mesuré (§1.5) : le radeau est à 0,412 et le conteneur à 0,788 — mais aucun
des deux n'est en grille.** Ancrer la densité les mettrait TOUS au même endroit ;
les mettre à 1,00 demanderait des planches par stade (le radeau devrait tomber à
~35 px, le conteneur monter à ~67). Le vrai gain de G2 est donc la COHÉRENCE
entre stades, pas la grille — ne pas vendre l'un pour l'autre.

### G3 — Trancher le zoom de référence

Une cuisson à taille fixe ne règle qu'un zoom. Trois options à arbitrer avec
Raph :
1. cuire au zoom 1 (le défaut) et accepter l'agrandissement au-delà — c'est ce
   que fait déjà la carte, donc c'est cohérent ;
2. cuire deux ou trois paliers (1, 2, 3) et choisir au rendu ;
3. ne rien cuire et vivre avec — l'option honnête si le grouillement ne le
   gêne pas.

⚠ L'option 1 aligne le vivant sur le comportement de la carte : tout devient
« bloc » ensemble quand on zoome. C'est le seul choix qui produit UNE grille.

⚠ **Ce que G0 apporte à cet arbitrage** : la carte n'est pas en grille à z = 1
non plus — elle est à 0,91-1,06 (§2.2), c'est-à-dire à quelques pour cent près,
jamais pile. « Cuire au zoom 1 » veut donc dire « cuire là où la carte est »,
pas « cuire à un idéal ». Et la bascule `-half` des habitants montre qu'un
DEUXIÈME palier existe déjà en production et marche : l'option 2 n'est pas une
hypothèse, c'est ce que le jeu fait aujourd'hui pour une famille.

---

## 6. Risques

- **Re-cuire, c'est retoucher de l'art validé.** Les habitants FLAT et la DA
  figurine sont des décisions de Raph. Toute cuisson doit être A/B avant/après
  sur planche-contact, à taille apparente identique.
- **La requantification peut ternir.** Réduire une planche de 52 à 20 px change
  les moyennes de couleur ; il faudra rabattre sur la palette maison, comme le
  fait déjà `scripts/quantize.cjs`.
- **Le tri et les ancres dépendent de la boîte, pas de la planche** — cuire ne
  doit RIEN changer aux hauteurs de blit ni aux points de contact au sol, sinon
  les agents décrochent du sol ou passent sous les bâtiments.
- ⚠ `stripMetrics` reste obligatoire sur ce pipeline (cf. la fiche habitants :
  sans lui, les gens de scène sortent nains).
