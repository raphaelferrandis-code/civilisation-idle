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

## Lot 2 — le rang (à venir)

Réputation = perte théorique (mise × avantage), jamais perdue. Rangs Habitué → Familier →
Notable → Mécène → Prince de la Maison : limite ×10 par rang, paris en plus (rite interdit,
échelle, ailes solaires, serres), cadeaux (vols offerts, colombier, coin, mesure,
automatisations), boudoir et salon.

## Lot 3 — les contenus (à venir)

Roulette (si pas déjà là), courses, grands flambeurs en duel, coups de légende, Nuit du
Grand Jeu, compteur de cartes, le spectacle attire les clients, reliques plus serrées,
paliers de gain ×10 / ×50 / ×250.

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

**Banc.** `bench-temple.js` réécrit : 13 garde-fous, tous verts (rapport `temple-faveur-impact.md`).
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
