# La Maison des Plaisirs sur 20 h — bench-plaisirs.js

> Généré par `node bench-plaisirs.js` (graine 7). Vrai moteur : six jeux, caisse, titres et cadeaux, automatisations, arbre et reliques, Grand Reset. Les profils ne décident que de la mise, du jeu, des relèves et des achats.
> ⚠ L'ère record selon le temps de jeu est une HYPOTHÈSE (trois courbes). Ce qui se compte en heures de recettes (titres, bourse, ruines) n'en dépend pas ; les reliques et la Faveur nominale, si.

## Courbe « juillet » — Sim de juillet (GR à 10 h, 17 h, 19 h, 20 h)

| Profil | Familier | Notable | Mécène | Prince de la Maison | Arbre (hors reliques) | Reliques (heure) | Bourse max (h de recettes) | Bourse max (Faveur) | Bourse finale (h) | Ruines | Fauché (temps de table) | Coups | Gagnants | Gros/Énormes/Légende | Plus gros gain (h) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Prudent (2 % par coup) | 2 h 11 | 8 h 01 | — | — | 4 h 15 | char 5 h 10, lyre 8 h 05 | 16.6 | 4.13 e8 | 0.4 | 1 | 0 % | 1 880 | 46 % | 7/1/0 | 5.3 |
| Joueur (5 % par coup) | 1 h 12 | 6 h 00 | 10 h 13 | 15 h 08 | 5 h 40 | char 6 h 00, lyre 8 h 15, miroir 8 h 20 | 27.6 | 2.62 e8 | 0.2 | 6 | 8 % | 2 930 | 34 % | 8/4/1 | 21.4 |

<details><summary>Le joueur, heure par heure</summary>

| Heure | Ère | Recettes/h | Bourse | Bourse (h) | Titre | Réputation (h) |
|---|---|---|---|---|---|---|
| 0 | 0 | 120 000 | 60 000 | 0.5 | Habitué | 0.00 |
| 1 | 4 | 261 674 | 166 492 | 0.6 | Habitué | 0.20 |
| 2 | 4 | 261 674 | 189 223 | 0.7 | Familier | 0.75 |
| 3 | 4 | 261 674 | 325 868 | 1.2 | Familier | 1.16 |
| 4 | 5 | 380 082 | 281 304 | 0.7 | Familier | 1.99 |
| 5 | 5 | 380 082 | 261 130 | 0.7 | Familier | 2.49 |
| 6 | 5 | 380 082 | 1.43 e6 | 3.8 | Notable | 3.10 |
| 7 | 6 | 547 975 | 966 269 | 1.8 | Notable | 4.62 |
| 8 | 6 | 547 975 | 2.25 e6 | 4.1 | Notable | 5.64 |
| 9 | 6 | 547 975 | 5.83 e6 | 10.6 | Notable | 8.33 |
| 10 | 0 | 120 000 | 74 768 | 0.6 | Notable | 14.69 |
| 11 | 4 | 261 674 | 1.20 e6 | 4.6 | Mécène | 20.94 |
| 12 | 4 | 261 674 | 176 304 | 0.7 | Mécène | 25.45 |
| 13 | 4 | 261 674 | 74 998 | 0.3 | Mécène | 28.89 |
| 14 | 4 | 261 674 | 182 591 | 0.7 | Mécène | 32.50 |
| 15 | 4 | 261 674 | 163 908 | 0.6 | Mécène | 38.25 |
| 16 | 4 | 261 674 | 2.45 e6 | 9.4 | Prince de la Maison | 49.11 |
| 17 | 1 | 120 000 | 48 165 | 0.4 | Prince de la Maison | 59.91 |
| 18 | 8 | 1.12 e6 | 703 760 | 0.6 | Prince de la Maison | 64.49 |
| 19 | 11 | 3.17 e6 | 1.13 e6 | 0.4 | Prince de la Maison | 65.19 |
| 20 | 29 | 1.09 e9 | 2.62 e8 | 0.2 | Prince de la Maison | 65.61 |

</details>

| Agressif (25 % par coup) | 1 h 00 | 1 h 05 | 18 h 03 | — | 18 h 20 | — | 7.9 | 2.10 e7 | 0.0 | 4 | 55 % | 2 786 | 17 % | 24/2/0 | 25.7 |
| Tout ou rien (mise max) | 1 h 07 | 1 h 09 | 13 h 12 | — | 19 h 45 | — | 8.3 | 1.82 e7 | 0.0 | 1 | 83 % | 128 | 23 % | 3/0/0 | 127.9 |
| Collectionneur (achète tout) | 6 h 00 | 11 h 59 | 19 h 21 | — | 5 h 20 | char 6 h 00, lyre 11 h 40 | 10.5 | 4.18 e8 | 0.4 | 2 | 3 % | 1 400 | 39 % | 2/1/0 | 2.0 |
| Absent (caisse toutes les 3 h, autos) | — | — | — | — | — | — | 1.0 | 261 674 | 0.0 | 0 | — | 0 | — | 0/0/0 | 0.0 |

## Courbe « continue » — Sans Grand Reset, jusqu'à l'ère 34 en 20 h

| Profil | Familier | Notable | Mécène | Prince de la Maison | Arbre (hors reliques) | Reliques (heure) | Bourse max (h de recettes) | Bourse max (Faveur) | Bourse finale (h) | Ruines | Fauché (temps de table) | Coups | Gagnants | Gros/Énormes/Légende | Plus gros gain (h) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Prudent (2 % par coup) | 3 h 02 | 7 h 07 | — | — | 3 h 10 | char 5 h 10 | 10.9 | 1.44 e10 | 2.3 | 0 | 0 % | 1 880 | 43 % | 6/3/0 | 5.1 |
| Joueur (5 % par coup) | 1 h 12 | 6 h 02 | 12 h 00 | — | 4 h 00 | char 6 h 05, lyre 8 h 15, miroir 9 h 10 | 18.8 | 2.17 e10 | 2.4 | 3 | 0 % | 2 950 | 34 % | 15/4/0 | 14.6 |

<details><summary>Le joueur, heure par heure</summary>

| Heure | Ère | Recettes/h | Bourse | Bourse (h) | Titre | Réputation (h) |
|---|---|---|---|---|---|---|
| 0 | 0 | 120 000 | 60 000 | 0.5 | Habitué | 0.00 |
| 1 | 4 | 261 674 | 166 492 | 0.6 | Habitué | 0.20 |
| 2 | 5 | 380 082 | 222 575 | 0.6 | Familier | 0.74 |
| 3 | 6 | 547 975 | 160 682 | 0.3 | Familier | 1.10 |
| 4 | 7 | 785 246 | 710 157 | 0.9 | Familier | 1.52 |
| 5 | 8 | 1.12 e6 | 1.56 e6 | 1.4 | Familier | 2.07 |
| 6 | 10 | 2.25 e6 | 3.75 e6 | 1.7 | Familier | 2.92 |
| 7 | 11 | 3.17 e6 | 6.13 e6 | 1.9 | Notable | 4.67 |
| 8 | 13 | 6.23 e6 | 1.57 e7 | 2.5 | Notable | 5.68 |
| 9 | 14 | 8.70 e6 | 8.77 e7 | 10.1 | Notable | 7.57 |
| 10 | 16 | 1.69 e7 | 4.31 e7 | 2.6 | Notable | 12.58 |
| 11 | 18 | 3.24 e7 | 6.46 e7 | 2.0 | Notable | 14.36 |
| 12 | 20 | 6.19 e7 | 6.18 e8 | 10.0 | Mécène | 15.07 |
| 13 | 22 | 1.17 e8 | 8.01 e8 | 6.8 | Mécène | 20.81 |
| 14 | 24 | 2.21 e8 | 1.28 e9 | 5.8 | Mécène | 23.17 |
| 15 | 26 | 4.15 e8 | 1.06 e9 | 2.6 | Mécène | 25.64 |
| 16 | 28 | 7.74 e8 | 2.11 e9 | 2.7 | Mécène | 28.11 |
| 17 | 30 | 1.54 e9 | 1.99 e9 | 1.3 | Mécène | 29.11 |
| 18 | 31 | 2.18 e9 | 1.89 e9 | 0.9 | Mécène | 29.57 |
| 19 | 32 | 3.08 e9 | 1.04 e10 | 3.4 | Mécène | 31.03 |
| 20 | 34 | 6.15 e9 | 1.48 e10 | 2.4 | Mécène | 33.40 |

</details>

| Agressif (25 % par coup) | 1 h 00 | 1 h 05 | 19 h 02 | — | 5 h 40 | — | 21.7 | 6.70 e10 | 0.2 | 3 | 51 % | 2 944 | 18 % | 23/2/0 | 25.7 |
| Tout ou rien (mise max) | 1 h 07 | 1 h 09 | — | — | 6 h 20 | — | 8.3 | 2.90 e9 | 0.0 | 1 | 83 % | 118 | 19 % | 5/0/0 | 108.0 |
| Collectionneur (achète tout) | 5 h 04 | 14 h 01 | — | — | 4 h 20 | char 5 h 10, lyre 10 h 20 | 9.5 | 2.08 e10 | 3.4 | 1 | 0 % | 1 400 | 36 % | 5/2/0 | 5.0 |
| Absent (caisse toutes les 3 h, autos) | — | — | — | — | 9 h 00 | — | 0.6 | 1.33 e9 | 0.2 | 0 | — | 0 | — | 0/0/0 | 0.0 |

## Courbe « lent » — Premier joueur : l'ère 12 en 20 h

| Profil | Familier | Notable | Mécène | Prince de la Maison | Arbre (hors reliques) | Reliques (heure) | Bourse max (h de recettes) | Bourse max (Faveur) | Bourse finale (h) | Ruines | Fauché (temps de table) | Coups | Gagnants | Gros/Énormes/Légende | Plus gros gain (h) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Prudent (2 % par coup) | 2 h 09 | 8 h 08 | 18 h 00 | — | 4 h 00 | char 5 h 10, lyre 8 h 10, miroir 18 h 10 | 30.3 | 9.60 e7 | 10.9 | 0 | 0 % | 1 856 | 43 % | 5/5/0 | 16.8 |
| Joueur (5 % par coup) | 2 h 02 | 6 h 04 | 9 h 14 | 20 h 00 | 5 h 40 | char 6 h 05, lyre 9 h 05, miroir 9 h 10 | 26.1 | 9.84 e7 | 22.1 | 3 | 0 % | 2 920 | 34 % | 8/3/1 | 20.0 |

<details><summary>Le joueur, heure par heure</summary>

| Heure | Ère | Recettes/h | Bourse | Bourse (h) | Titre | Réputation (h) |
|---|---|---|---|---|---|---|
| 0 | 0 | 120 000 | 60 000 | 0.5 | Habitué | 0.00 |
| 1 | 3 | 178 441 | 53 189 | 0.3 | Habitué | 0.19 |
| 2 | 4 | 261 674 | 87 518 | 0.3 | Habitué | 0.47 |
| 3 | 4 | 261 674 | 237 834 | 0.9 | Familier | 1.19 |
| 4 | 5 | 380 082 | 536 521 | 1.4 | Familier | 1.73 |
| 5 | 6 | 547 975 | 391 836 | 0.7 | Familier | 2.47 |
| 6 | 6 | 547 975 | 764 993 | 1.4 | Familier | 2.90 |
| 7 | 6 | 547 975 | 1.22 e6 | 2.2 | Notable | 4.08 |
| 8 | 7 | 785 246 | 1.71 e6 | 2.2 | Notable | 5.03 |
| 9 | 7 | 785 246 | 5.78 e6 | 7.4 | Notable | 6.49 |
| 10 | 8 | 1.12 e6 | 1.39 e7 | 12.4 | Mécène | 15.29 |
| 11 | 8 | 1.12 e6 | 1.73 e7 | 15.5 | Mécène | 21.73 |
| 12 | 8 | 1.12 e6 | 4.81 e6 | 4.3 | Mécène | 27.10 |
| 13 | 9 | 1.59 e6 | 8.79 e6 | 5.5 | Mécène | 29.09 |
| 14 | 9 | 1.59 e6 | 7.19 e6 | 4.5 | Mécène | 30.58 |
| 15 | 10 | 2.25 e6 | 1.03 e7 | 4.6 | Mécène | 33.20 |
| 16 | 10 | 2.25 e6 | 5.43 e6 | 2.4 | Mécène | 34.30 |
| 17 | 10 | 2.25 e6 | 1.11 e7 | 4.9 | Mécène | 36.48 |
| 18 | 11 | 3.17 e6 | 8.68 e6 | 2.7 | Mécène | 38.30 |
| 19 | 11 | 3.17 e6 | 6.31 e6 | 2.0 | Mécène | 39.35 |
| 20 | 12 | 4.45 e6 | 9.84 e7 | 22.1 | Prince de la Maison | 40.31 |

</details>

| Agressif (25 % par coup) | 1 h 01 | 9 h 09 | — | — | 9 h 10 | — | 52.4 | 4.12 e7 | 0.1 | 3 | 55 % | 2 854 | 17 % | 21/4/0 | 39.6 |
| Tout ou rien (mise max) | 1 h 10 | 2 h 02 | — | — | 8 h 40 | char 2 h 00 | 40.1 | 1.05 e7 | 0.0 | 2 | 82 % | 142 | 20 % | 1/0/0 | 56.7 |
| Collectionneur (achète tout) | 6 h 03 | 11 h 00 | — | — | 5 h 00 | char 6 h 05, lyre 11 h 00, miroir 18 h 00 | 11.0 | 3.62 e7 | 8.1 | 0 | 0 % | 1 376 | 38 % | 7/3/0 | 12.0 |
| Absent (caisse toutes les 3 h, autos) | — | — | — | — | 15 h 00 | — | 0.6 | 1.79 e6 | 0.4 | 0 | — | 0 | — | 0/0/0 | 0.0 |

