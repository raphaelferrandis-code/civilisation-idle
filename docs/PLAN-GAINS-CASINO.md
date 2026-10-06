# Les gains de la Maison des Plaisirs : un vrai casino

## Décisions de Raph (2026-10-03)

Demande : « plutôt que d'augmenter les odds de gagner, on peut choisir la mise et tenter
de gagner de plus en plus de sous ? comme un vrai casino ».

| Sujet | Décision |
|---|---|
| L'argent sur la table | La **Faveur** reste la monnaie des tables : elle vient de la ville, elle se dépense dans la cité |
| La bascule (imprimante de juillet) | **Supprimée** : plus aucun jeu au-dessus de 100 %. « Gagner plus qu'on ne dépense » passe par les recettes et le rang |
| Les limites de table | **Ouvertes par le rang** (lot 2) |
| L'ordre | Lot 1 : cotes fixes, jetons, laisser courir, recettes qui suivent la ville. Lot 2 : le rang et ses cadeaux. Lot 3 : les contenus |

✅ **Lot 1 fait le 2026-10-04** (après le feu vert de Raph : la « roulette » était la roue de la
machine à sous v2). Voir le journal en fin de document.

## Lot 1 — ce qui change

### Les cotes, fixes pour toujours

Plus aucun achat ne touche aux chances ni à l'avantage de la maison. Chiffres prototypés
le 2026-10-03 (scripts hors dépôt, à reporter dans le banc) :

| Jeu | Avant (début → fin d'échelle) | Lot 1 |
|---|---|---|
| Osselets | 57 % → 112 % | 97 % pour chaque rite (le rite devient un pari, voir plus bas) |
| Icare | 82 % → 104 % | 97 % (`ICARUS_EDGE` 0,03) |
| Tickets | 84 % → 102 % | 75 % : 1 ticket sur 4 gagne, gros lot ×5 000 (1 sur 100 000) |
| Vingt-et-un | 98,1 % → 100,3 % | 98,9 % en jeu parfait : double et refente dès le départ, naturel payé 6 contre 5 (×2,2) |
| Machine à sous | 92,2 % | ~95 % (après la session machine à sous) |
| Roulette | — | ce que la session roulette aura posé (97,3 % à un zéro) |

Mesures du 21 (2 M de mains, règles du moteur : paquet unique rebattu, croupier S17,
une refente, double après refente) : naïf 93,0 %, base 96,7 %, base + double 98,3 %,
base + double + refente 98,9 % ± 0,16. `BLACKJACK_RTP_REF` → 0,995 (majore le meilleur
jeu, nourrit la cagnotte), `BLACKJACK_RTP_AUTO` → 0,983 (l'auto double, ne refend pas).

**Les rites des osselets deviennent des paris.** La mise étant libre, le rite ne fixe plus
le prix : il fixe le risque, chacun normalisé à 97 % (vol offert de Vénus compris).

| Rite | Gagne | Vénus | Triple | Paire | Écart-type (en mises) |
|---|---|---|---|---|---|
| Prudent | 62 % | ×2,11 | ×1,58 | ×1,37 | 0,74 |
| Ancestral | 47,5 % | ×3,08 | ×2,05 | ×1,54 | 1,02 |
| Grand sacrifice | 32 % | ×4,62 | ×2,77 | ×1,85 | 1,45 |
| Rite interdit | 18 % | ×9,37 | ×3,12 | ×1,95 | 2,41 |

**Les tickets** (poids sur 1 000 000) : olive ×1 (1 sur 8), amphore ×2 (1 sur 13),
laurier ×4 (1 sur 29), trépied ×10 (1 sur 83), chouette ×50 (1 sur 500), Vénus ×250 + un
vol offert (1 sur 5 000), Soleil ×5 000 (1 sur 100 000). Le Soleil devient le gros lot.

### La mise libre, en jetons

- Un seul cercle de mise sur le tapis ; un râtelier de 5 jetons (série 1, 5, 25, 100,
  500, 2 500, 10 000…, les 5 plus gros sous la limite). Un clic pose le jeton.
- Boutons : **Même mise**, **Tapis** (le maximum permis), **Effacer**.
- Limite haute de la table = **15 min de recettes** (30 Faveur à l'Ère II, proche de
  l'ancienne mise haute de 25). Limite basse : 1. Le rang (lot 2) ouvrira des tables
  ×10 au-dessus.
- Les Coffres disparaissent (remboursés).

### Laisser courir

Après un gain, **Laisser courir** remise tout le gain sur le coup suivant (plafonné à la
limite). Vaut pour les osselets, Icare, les tickets, le 21, la machine. Le quitte ou
double des osselets reste (pari à 50/50, sans avantage de la maison).

### Les recettes de la Maison (le tronc qui suit la ville)

`recettes/h = 120 × max(1, (seuil de l'ère record / 4 000)^0,15)` : 120/h à l'Ère II
(l'ancien tronc), ×1,4 environ par ère. L'ère record (`bestEraIndex`) et non la population
du moment : un effondrement ne vide pas la salle, le Grand Reset si (comme la Faveur).
Calcul par log10 (les seuils dépassent 1e308 au-delà des ères transcendantes).

| Ère | Recettes/h | Mise max | Bénédiction |
|---|---|---|---|
| 2 Abris | 120 | 30 | 60 |
| 10 Bourg des artisans | 2 247 | 562 | 1 123 |
| 20 Royaume diplomate | 61 877 | 15 469 | 30 939 |
| 25 Empire | 303 118 | 75 780 | 151 559 |
| 30 Mégalopole | 1,5 M | 386 200 | 772 400 |
| 34 Singularité | 6,2 M | 1,5 M | 3,1 M |
| 45 Conscience planétaire | 46 M | 11 M | 23 M |

- Plafond de la caisse : 30 min de recettes (comme le tronc).
- **Bénédiction** : 30 min de recettes (60 aujourd'hui à l'Ère II).
- **Reliques** : prix gardés (1 M, 1 G, 1 000 G), atteintes vers l'Empire, la Conscience
  planétaire et la Noosphère avec cette courbe. Une relique par ×10 de prix = lot 3.
- **Cagnotte** : plafond = max(5 000, 24 h de recettes) ; la rafle entière se prend à la
  mise max (`potRakeShare` = mise / limite haute), les serres gardent leur ×1,5.

### Ce que deviennent les achats

| Achat | Lot 1 |
|---|---|
| Dés pipés, ailes cirées, planches du graveur, dé d'ivoire, Coffres | supprimés, Faveur **remboursée** au chargement (une fois, chroniqué) |
| Le double, la refente | règles de base, remboursées |
| Clémence (rabais sur série noire) | supprimée (sans objet avec la mise libre) ; remplacée par les cadeaux de rang au lot 2 |
| Vols offerts | gardés ; un vol porte désormais un **montant** (la mise du coup qui l'a gagné) |
| Rite interdit, échelle de Vénus, ailes solaires, serres, plumes, souffle, colombier, coin, relance, voix, mesure, stylet, noyé, automatisations | inchangés jusqu'au lot 2 (rang) |
| Automatisations | leur cadran de mise devient une part de la limite (min, ¼, ½, max) |

### Garde-fous (banc à réécrire)

- Tout jeu, toute option : RTP < 1 (plus de configuration « supra-bascule »).
- Cibles tenues : osselets 97 % ± 0,3 par rite, Icare 97 %, tickets 75 % ± 0,5, 21 jeu
  parfait < 99,5 %, machine ~95 %.
- Cagnotte : `rtp_total = rtp + recycle × (1 − rtp) < 1` tient toujours (A9/A10).
- Remboursement : exact, une seule fois, champs remis à zéro.

## Lot 2 — le rang (fait le 2026-10-04)

**La réputation** est la perte théorique du joueur, comme dans un vrai casino : chaque mise
PAYÉE y ajoute mise × avantage de la Maison (le même retour que celui qui nourrit la
cagnotte), comptée en **heures de recettes** au moment de la mise. Le même effort de jeu fait
donc le même chemin à toute ère. Les coups offerts (vols, tours gratuits, relance de la
cella) et le quitte ou double (sans avantage) n'y comptent pas ; les automatisations, si.
Elle ne se perd jamais : ni à l'effondrement, ni au Grand Reset (le titre non plus).

| Titre | Seuil (h de recettes) | Tables | Cadeaux | Vols offerts |
|---|---|---|---|---|
| Habitué | 0 | ×1 | — | — |
| Familier | 0,5 | ×10 | le colombier, la mesure gravée, auto des osselets, auto d'Icare | 3 |
| Notable | 3 | ×100 | l'échelle de Vénus, le coin décollé, auto des tickets, auto du 21 | 5 |
| Mécène | 15 | ×1 000 | le rite interdit, les ailes solaires | 8 |
| Prince de la Maison | 75 | ×10 000 | les serres | 8 |

À la limite de base et 3 % d'avantage, une mise vaut 0,0075 h : Familier vient en ~70 grosses
mises. Atteindre un titre coûte, en espérance, son seuil en heures de recettes, quelle que
soit la taille des mises (les grosses mises n'y vont que plus vite, et plus au hasard).

- **Ce que le titre ouvre** : la limite haute des tables, ×10 par titre. La salle commune des
  automatisations (leur cadran Max) et la rafle de la cagnotte (miser la limite de base rafle
  tout) restent à la base : un Prince n'a pas à miser dix mille fois plus pour la même part.
- **Les cadeaux** ne s'achètent plus. Une automatisation offerte arrive à l'arrêt (on la règle
  et on l'allume). Les vols offerts portent la limite de base ; le colombier passe avant eux.
- **Les cotes ne bougent pas** avec le titre (A8 du banc).
- **Restent à vendre** : le noyé, les plumes, le second souffle, le stylet, l'offrande recopiée,
  la voix de l'oracle, les reliques, la sébile (auto de la caisse), la Bénédiction.
- **Sauvegarde v6** : qui avait déjà acheté un cadeau de rang le garde, et sa Faveur revient
  (annoncé une fois dans la Chronique).
- **Le salon et le boudoir** s'ouvrent par le titre depuis le lot 3 (voir plus bas).

## Lot 3 — les contenus (premiers pas le 2026-10-04)

Raph : « fais les 4 et résous les deux défauts majeurs ». Ses choix : la roulette dans le
SALON dès Familier, le boudoir au Mécène ; le GRAND à ×250 la mise au moins ; le menu en
étages (autre session) part avec le lot ; commiter sans pousser.

**Les deux défauts de la machine.**
- Le râtelier passait à la ligne au hasard de la largeur : il tient sur DEUX rangs voulus,
  les jetons dessus, Effacer / Même mise / Tapis dessous (`rackStack` de `TableMise`).
- Le GRAND (les quinze cases du Hold & Win) payait moins que le MAJEUR (×100) : il paie au
  moins ×250 la mise (`SLOTS_GRAND_FLOOR`), plus la cagnotte au prorata de la mise. La case
  « JP » de la roue verse la cagnotte et le dit. La machine rend **93,55 %** (calcul exact,
  `slotsMath.js`).

**Les grands gains** (`core/grandsGains.js`, `ui/GrandGain.jsx`). Un gain de ×10 la mise
(« Gros gain »), ×50 (« Énorme gain ») ou ×250 (« Coup de légende ») fait monter un bandeau
par-dessus la table, avec la musique de la machine ; un coup de légende entre dans la Chronique.
Branchés : osselets (jet et quitte ou double), Icare (retrait), tickets, machine (son propre
bandeau), roulette (contre la mise TOTALE du tour : un plein seul paie ×36, un gros gain). Le
vingt-et-un ne paie jamais ×10.

**Les reliques rapprochées** : une à chaque ×10 du prix, ×1,25 de production chacune pour les
nouvelles — Char du Soleil (1 M), **Lyre d'Orphée (10 M)**, **Miroir d'Aphrodite (100 M)**,
Corne du temple (1 G, ×2), **Toison d'or (10 G)**, **Pomme d'or (100 G)**, Œil d'or (1 T, ×4).
Leurs flacons prennent les places laissées par les achats retirés au lot 1.

**La roulette du salon** (`actions/roulette.js`, `ui/RouletteStage.jsx`, `plaisirs/rouletteArt.js`).
- Une roue européenne à UN zéro : plein ×36, douzaine et colonne ×3, chances simples ×2 (rouge,
  noir, pair, impair, 1-18, 19-36). Chaque pari rend 36/37 = **97,30 %** (A2 du banc, exact sur
  les 49 paris). Le zéro ne paie que son plein.
- Ouverte au titre de **Familier** (`ROULETTE_UNLOCK_RANK`). Les limites sont celles des autres
  tables, pour la mise TOTALE ; la cagnotte et la réputation se nourrissent à chaque tour.
- La table : la croupière de toutes les tables, la roue peinte par le code au pixel (ellipse,
  lumière en haut à gauche) à gauche, le tapis à droite. Un jeton choisi au râtelier, un clic
  le pose (clic droit : la case se vide), « Même mise », « Lancer la bille ». La roue tourne,
  la bille court à rebours et tombe ; la case tombée est cerclée, les cases gagnantes
  s'allument ; « Relancer » ou « Changer de mise ». Fermer pendant le tour l'encaisse quand même.
- L'historique (12 cases) au mur ; la Chronique compte les tours et les zéros (carte 🎡).

**Le boudoir** se regarde à partir du titre de **Mécène** (`BOUDOIR_UNLOCK_RANK`). Avant, sa
ligne du menu est grisée « 🔒 Mécène » (infobulle : le titre qui l'ouvre) et sa salle reste
inerte sur la coupe. Même chose pour le salon avant Familier.

**Reste du lot 3 (idées, rien de fait)** : courses, grands flambeurs en duel, Nuit du Grand Jeu,
compteur de cartes, le spectacle attire les clients.

## La mesure des 20 h et l'économie « comme les applis » (2026-10-04)

Raph : « la Maison est finie ? c'est fait pour tenir 20 heures ? » puis, après la mesure : « il
faut que la sensation de gagner soit agréable, qu'on ait l'impression d'avoir énormément de sous
au bout d'un moment, mais qu'une mise trop agressive puisse faire tout perdre — comme les applis
de casino qui ne font pas jouer d'argent réel ».

**La mesure** (`bench-plaisirs.js`, rapport `docs/bench/plaisirs-20h.md`). Six profils (prudent 2 % de la
bourse par coup, joueur 5 %, agressif 25 %, tout ou rien, collectionneur, absent) jouent 20 h sur
le VRAI moteur : six jeux, caisse, titres et cadeaux, automatisations, arbre et reliques, Grand
Reset. L'ère record selon le temps de jeu est une HYPOTHÈSE en trois courbes (la sim complète du
jeu, `sim-10-profils.js`, reste bloquée aux ères 1-2 après un Grand Reset précoce : son bot est
à refaire). Avant les changements, pour le joueur : Familier ~3 h, Notable ~9 h, Mécène 16-17 h
(pas toujours), Prince jamais ; la bourse sous 2 h de recettes presque tout le temps ; l'arbre fini
vers 5-8 h puis plus rien à acheter, les reliques n'arrivant qu'à 16-18 h sur la courbe la plus
rapide (jamais sur les deux autres).

**Ce que font les applis** (sources publiques : analyses de game design, études) : l'argent rentre
en continu (bonus horaires, cadeaux de niveau), les mises grandissent avec le niveau, les soldes se
comptent en millions puis en milliards, les gros gains sont fêtés par paliers avec un compteur qui
défile. Pas retenu : fêter les pertes déguisées en gains (les études montrent que ça fausse l'idée
qu'on se fait de ses chances), ni rendre plus de 100 % au début (la règle de juillet tient).

**Décisions de Raph et ce qui est fait :**
- **Tout gonfler** : `FAVEUR_ECHELLE` = 1 000 (balance.js) sur tout ce qui se compte en Faveur —
  recettes (120 000/h à l'Ère II), caisse, limites donc jetons et mises, prix de la Boutique et de
  l'Héritage, réserves des automatisations, plancher de la cagnotte. Les cotes ne bougent pas.
  Sauvegarde v7 : la migration 6 → 7 multiplie la Faveur des parties existantes (bourse, cagnotte,
  caisse, vols offerts, série de tours gratuits, réserves, remboursements, compteurs de la
  Chronique) ; la réputation (en heures) ne bouge pas.
- **La roue de la Maison** (`actions/roueMaison.js`, `ui/RoueStage.jsx`, `plaisirs/roueArt.js`) :
  un tour offert par heure, depuis le bouton « Roue » de la bourse (or quand il attend). Seize
  cases égales en heures de recettes (1,125 h en moyenne, la couronne 5 h) ; la valeur se lit en
  pièces sur la roue. Une absence n'accumule pas de tours.
- **Les bourses des titres** : 2, 5, 10 et 20 h de recettes (`MAISON_RANKS[].faveurH`).
- **Prince à 40 h** de réputation (au lieu de 75).
- **Les reliques en heures de recettes** : 3, 6, 12, 20, 35, 60, 100 h (Char → Œil), lues à
  l'achat comme la Bénédiction (`artifactCost`, faveurShop.js).
- **Le boudoir devient le salon privé** (Mécène) : la roulette SANS PLAFOND, la mise va jusqu'à
  toute la bourse (`spinRoulette(…, { vip })`, `rouletteLimits(true)`), feutre de velours.
- **Gagner** : un palier « Beau coup » dès ×5 ; le gain de chaque coup gagnant défile (`Monte`,
  osselets, tickets, Icare, vingt-et-un, roulette — la machine avait déjà le sien) ; la salle
  annonce de temps en temps le gros gain d'un habitant (`plaisirs/AnnoncesSalle.jsx`, décor : pas
  de Faveur).

**Mesuré après** (joueur régulier, 5 graines × 3 courbes) : Mécène 11 fois sur 15 en 20 h, Prince
4 fois ; bourse au plus haut 12 à 36 h de recettes (~18 h en médiane) ; le Char vers 4-8 h, la Lyre
5-16 h, le Miroir 9-18 h une fois sur deux, la Corne vers 19 h parfois ; l'agressif reste fauché la
moitié de son temps de table, le tout-ou-rien 83 %.

**La revue d'une autre session** (« Refactoring et vérification ») a trouvé deux bugs, corrigés :
(1) au rechargement, la bourse était bornée à MAX_SAFE_INTEGER (9e15, atteint ~20 ères plus tôt
avec l'échelle) — bornes à 1e300 sur la Faveur, la série de tours gratuits et les compteurs de la
Chronique ; (2) la Lyre, le Miroir, la Toison et la Pomme ne touchaient PAS la production (une copie
du calcul dans crisisLevers.js ne comptait que la Corne et l'Œil) — une seule source désormais,
testée sur la production. Plus : un F5 pendant un tour de roulette, de roue ou de machine ne perd
plus le gain (écouteur pagehide). Restent notés : le gain « de série » affiché par la machine
peut compter un gain de roue du tour payé ; une montée de titre pendant l'absence n'est pas
annoncée au retour.

## Journal

### 2026-10-04 — lot 1 livré (non commité)

**Moteur.** Nouveau module `actions/maisonTable.js` (recettes, limites, jetons, prix de la
Bénédiction, plafond de la cagnotte). `balance.js` : plus de dés pipés, ailes cirées, planches,
Coffres, Clémence, mises fixes ; `AUGURY_RITE_BETS`, `ICARUS_EDGE` 0,03, `SCRATCH_PRIZES` sur
1 000 000, `BLACKJACK_MULT.blackjack` 2,2, constantes `MAISON_*`, `TABLE_*`, `CAISSE_*`. Les cinq
moteurs prennent une mise libre (`castAugury(id, rite, { stake })`, `launchIcarus(stake, { free })`,
`playScratch(stake)`, `dealBlackjack(stake)`, `spinSlots(stake)`) ; les vols offerts sont des
montants ; la caisse (ex-tronc) suit les recettes ; les automatisations misent une part de la
limite (`stakeStep` min/¼/½/max). La machine garde son 92 % (calibrée par la session machine).

**Sauvegarde.** Version 5 : la migration 4 → 5 rembourse la Faveur des achats supprimés aux
derniers prix (annoncé une fois dans la Chronique au premier tick), retire les champs, convertit
les vols offerts en montants. Les autos repartent à la mise minimale.

**Interface.** `plaisirs/TableMise.jsx` : la pile de jetons sur le cercle, le râtelier (cinq
jetons, Effacer, Même mise, Tapis) ; jetons dessinés par le code dans la matière de l'âge
(`plaisirs/chipsArt.js`, planche `.preview-shots/casino-jetons.png`). Les cinq tables : mise en
jetons, « Même mise », « Laisser courir » après un gain, aide « ? » réécrite (cotes, limite).
Osselets : les rites restent sur le tapis, la pile se pose sur le rite choisi. Icare : bouton
« Vol offert (montant) ». Tickets : le métal du ticket (bronze, argent, or) suit la mise rapportée
à la limite. Les Coffres (`CoffreSelect`, `coffreMeta`) et l'ancien `AuguresPanel` (mort) sont
supprimés.

**Banc.** `bench-temple.js` réécrit : 13 garde-fous, tous verts (rapport `docs/bench/temple-faveur-impact.md`).
21 mesuré sur 1 M de mains : jeu parfait 98,86 % ± 0,11 ; Monte-Carlo sur les moteurs : osselets
97,2 %, Icare 97,1 %, 21 auto 98,2 %.

**Tests.** Les tests des jeux réécrits pour la mise libre (suppression de la Clémence, des dés
pipés, de la bascule, des Coffres ; ajout : chaque rite à 97 %, mise bornée, vols en montants,
rafle au prorata de la limite). Nouveau `maisonTable.test.js`. Suite complète verte hors
`houseVariants.test.js` (maisons `row-domus-*` d'une autre session, en cours).

**Corrigé en relecture.** (1) La caisse jamais relevée restait figée à 60 sous un plafond plus
haut : elle est pleine au plafond du moment. (2) Le 21 auto doublait sans regarder la réserve :
le double ne se joue plus que si la réserve tient après la seconde mise. (3) Le débit affiché
de l'auto-Icare comptait la consolation des plumes comme un gain (badge positif) : retirée, elle
sort de la cagnotte. (4) Une réserve d'auto réglée en fin de partie survit au Grand Reset : elle
est bornée au curseur du moment. (5) Les tours gratuits de la machine sont bornés à la limite.

**Écart connu.** Un vol offert nourrit la cagnotte deux fois (dans le 97 % de son jeu, puis à
Icare) : +0,1 à 0,2 point, pire cas ~99,8 %, toujours sous 1 (note dans `templePot.js`).

**À vérifier par Raph en jeu.** Taille et lisibilité des jetons, place du râtelier (surtout sur
la machine à sous, où il se pose au-dessus de la pile à gauche), mise de départ proposée
(l'avant-dernier jeton, au plus un cinquième de la Faveur).

### 2026-10-04 — lot 1 commité (`90ba098`), lot 2 livré et commité, tout poussé

**Lot 1** commité en local (`90ba098`, pas poussé), avec la machine à sous v2 de la session
Plaisirs, indissociable dans les mêmes fichiers. Vérifié dans un worktree propre : lint,
2 480 tests, build.

**Lot 2, moteur.** `actions/maisonRang.js` (réputation, titres, cadeaux, `recordWager` appelé
à chaque mise payée des cinq jeux) ; `MAISON_RANKS` et `RANK_GIFT_AUTOS` dans `balance.js` ;
`tableLimits()` rend `{ min, max, base }` (max = base × 10 par titre) ; `autoStake` et
`potRakeShare` lisent `base`. L'arbre (`data/artifacts.js`) marque les cadeaux (`gift`), l'échelle
d'achat les saute, la boutique et `unlockTempleAuto` refusent de les vendre (seule la sébile du
tronc reste à acheter). Sauvegarde v6 (migration 5 → 6, remboursement annoncé par
`state.maisonGiftRefund`).

**Lot 2, interface.** `plaisirs/RangMaison.jsx` : le titre et sa piste dans la bourse, le détail
en infobulle. La Boutique montre « 🎁 Familier » (ou le titre) à la place du prix. L'aide gagne
« Le titre ». Le bouton « Vol offert » d'Icare passe à côté de « S'envoler » (dessous, le
râtelier le recouvrait, ce qui sautait aux yeux avec huit vols offerts).

**Banc.** 16 garde-fous verts, dont A8 : le titre ne touche à aucune cote ; limite ×10 par titre,
salle commune et rafle à la base ; la réputation suit la perte réelle (Icare, 300 000 vols,
1,3 % d'écart). Tests : `maisonRang.test.js` (15), arbre et automatisations mis à jour.

### 2026-10-04 — lot 3 : les deux défauts, les grands gains, les reliques, la roulette

**Commit `d58edd5`** (local) : le GRAND à ×250, le râtelier en deux rangs, les grands gains,
les reliques. Tests : `grandsGains.test.js` (4), machine, arbre et limites mis à jour.

**Commit suivant** (local, pas poussé) : la roulette, le salon et le boudoir par le titre, et
le **menu en étages** de la session Plaisirs-menu (`PlaisirsMenu.jsx`, le pupitre fondu, la
bourse), avec l'accord de Raph — avec lui, le crochet de la mélodie de la scène dans
`PlaisirsView.jsx` (session musique). Vérifié en jeu (Chrome sans fenêtre, 2560×1340) : salon
et boudoir verrouillés puis ouverts au titre, un tour perdu, un tour gagné (plein + douzaine +
noir sur le 17 : +30 500 exact), le bandeau « Coup de légende », la machine (GRAND 12,5 M >
MAJEUR 5 M à 50 000 la mise), les reliques à la Boutique.

**Corrigé en vérifiant.** (1) Le tapis sortait en désordre : le `all: unset` des cases effaçait
leur place dans la grille (sélecteurs renforcés). (2) La roue n'apparaissait qu'au premier
tour : la table monte la toile APRÈS avoir mesuré sa place, la toile est tenue en état.

**Banc.** 17 garde-fous verts (A2 roulette ajouté). Tests : `roulette.test.js` (9).
