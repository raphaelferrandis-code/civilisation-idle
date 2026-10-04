# La Maison des Plaisirs sur 20 h — bench-plaisirs.js

> Généré par `node bench-plaisirs.js` (graine 7). Vrai moteur : huit jeux (dont les courses et le duel), caisse, Nuit du Grand Jeu et spectacle, titres et cadeaux, automatisations, arbre et reliques, Grand Reset. Les profils ne décident que de la mise, du jeu, des relèves et des achats.
> ⚠ L'ère record selon le temps de jeu est une HYPOTHÈSE (trois courbes). Ce qui se compte en heures de recettes (titres, bourse, ruines) n'en dépend pas ; les reliques et la Faveur nominale, si.

## Courbe « juillet » — Sim de juillet (GR à 10 h, 17 h, 19 h, 20 h)

| Profil | Familier | Notable | Mécène | Prince de la Maison | Arbre (hors reliques) | Reliques (heure) | Bourse max (h de recettes) | Bourse max (Faveur) | Bourse finale (h) | Ruines | Fauché (temps de table) | Coups | Gagnants | Gros/Énormes/Légende | Plus gros gain (h) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Prudent (2 % par coup) | 3 h 03 | 8 h 01 | — | — | 4 h 05 | char 6 h 10, lyre 8 h 05 | 19.9 | 1.42 e8 | 0.1 | 0 | 0 % | 1 848 | 42 % | 7/2/0 | 5.0 |
| Joueur (5 % par coup) | 1 h 12 | 4 h 12 | 10 h 17 | 12 h 26 | 3 h 00 | char 4 h 15, lyre 10 h 40, miroir 12 h 30 | 32.8 | 5.02 e8 | 0.2 | 3 | 5 % | 2 743 | 33 % | 9/1/0 | 5.0 |

<details><summary>Le joueur, heure par heure</summary>

| Heure | Ère | Recettes/h | Bourse | Bourse (h) | Titre | Réputation (h) |
|---|---|---|---|---|---|---|
| 0 | 0 | 120 000 | 60 000 | 0.5 | Habitué | 0.00 |
| 1 | 4 | 261 674 | 108 148 | 0.4 | Habitué | 0.13 |
| 2 | 4 | 261 674 | 309 188 | 1.2 | Familier | 0.97 |
| 3 | 4 | 261 674 | 232 081 | 0.9 | Familier | 1.94 |
| 4 | 5 | 380 082 | 705 060 | 1.9 | Familier | 2.31 |
| 5 | 5 | 380 082 | 1.70 e6 | 4.5 | Notable | 3.96 |
| 6 | 5 | 380 082 | 2.10 e6 | 5.5 | Notable | 5.56 |
| 7 | 6 | 547 975 | 1.92 e6 | 3.5 | Notable | 8.10 |
| 8 | 6 | 547 975 | 2.59 e6 | 4.7 | Notable | 10.56 |
| 9 | 6 | 547 975 | 2.34 e6 | 4.3 | Notable | 12.10 |
| 10 | 0 | 120 000 | 174 535 | 1.5 | Notable | 13.50 |
| 11 | 4 | 261 674 | 1.11 e6 | 4.2 | Mécène | 19.63 |
| 12 | 4 | 261 674 | 685 479 | 2.6 | Mécène | 33.73 |
| 13 | 4 | 261 674 | 5.79 e6 | 22.1 | Prince de la Maison | 44.75 |
| 14 | 4 | 261 674 | 2.52 e6 | 9.6 | Prince de la Maison | 55.83 |
| 15 | 4 | 261 674 | 351 331 | 1.3 | Prince de la Maison | 66.73 |
| 16 | 4 | 261 674 | 1.90 e6 | 7.2 | Prince de la Maison | 74.87 |
| 17 | 1 | 120 000 | 68 085 | 0.6 | Prince de la Maison | 82.21 |
| 18 | 8 | 1.12 e6 | 419 785 | 0.4 | Prince de la Maison | 83.25 |
| 19 | 11 | 3.17 e6 | 1.11 e7 | 3.5 | Prince de la Maison | 88.01 |
| 20 | 29 | 1.09 e9 | 1.88 e8 | 0.2 | Prince de la Maison | 90.92 |

</details>

| Agressif (25 % par coup) | 2 h 00 | 9 h 00 | 14 h 30 | 18 h 27 | 7 h 30 | char 11 h 20, lyre 14 h 35, miroir 14 h 50, corne 18 h 45 | 26.4 | 5.52 e7 | 0.0 | 8 | 65 % | 2 507 | 16 % | 41/1/0 | 5.0 |
| Tout ou rien (mise max) | 2 h 00 | 11 h 01 | 11 h 02 | — | 7 h 30 | char 11 h 00, lyre 12 h 55, miroir 14 h 25 | 84.5 | 3.19 e7 | 0.0 | 9 | 87 % | 86 | 16 % | 1/0/0 | 229.4 |
| Collectionneur (achète tout) | 3 h 07 | 9 h 06 | 14 h 25 | 18 h 56 | 3 h 20 | char 4 h 20, lyre 6 h 40, miroir 9 h 10, corne 14 h 30 | 29.4 | 2.80 e8 | 0.3 | 8 | 0 % | 1 369 | 36 % | 14/1/0 | 5.2 |
| Absent (caisse toutes les 3 h, autos) | — | — | — | — | — | — | 1.0 | 261 674 | 0.0 | 0 | — | 0 | — | 0/0/0 | 0.0 |

## Courbe « continue » — Sans Grand Reset, jusqu'à l'ère 34 en 20 h

| Profil | Familier | Notable | Mécène | Prince de la Maison | Arbre (hors reliques) | Reliques (heure) | Bourse max (h de recettes) | Bourse max (Faveur) | Bourse finale (h) | Ruines | Fauché (temps de table) | Coups | Gagnants | Gros/Énormes/Légende | Plus gros gain (h) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Prudent (2 % par coup) | 3 h 07 | 8 h 09 | — | — | 3 h 20 | char 8 h 10, lyre 8 h 15 | 14.3 | 1.66 e10 | 2.5 | 0 | 0 % | 1 850 | 40 % | 10/3/0 | 5.2 |
| Joueur (5 % par coup) | 1 h 12 | 4 h 10 | 15 h 03 | — | 2 h 10 | char 4 h 10, lyre 15 h 05 | 20.4 | 1.59 e10 | 1.3 | 4 | 0 % | 2 909 | 31 % | 14/3/0 | 18.3 |

<details><summary>Le joueur, heure par heure</summary>

| Heure | Ère | Recettes/h | Bourse | Bourse (h) | Titre | Réputation (h) |
|---|---|---|---|---|---|---|
| 0 | 0 | 120 000 | 60 000 | 0.5 | Habitué | 0.00 |
| 1 | 4 | 261 674 | 108 148 | 0.4 | Habitué | 0.13 |
| 2 | 5 | 380 082 | 348 883 | 0.9 | Familier | 0.96 |
| 3 | 6 | 547 975 | 791 070 | 1.4 | Familier | 1.69 |
| 4 | 7 | 785 246 | 1.75 e6 | 2.2 | Familier | 2.29 |
| 5 | 8 | 1.12 e6 | 3.60 e6 | 3.2 | Notable | 3.65 |
| 6 | 10 | 2.25 e6 | 7.89 e6 | 3.5 | Notable | 4.64 |
| 7 | 11 | 3.17 e6 | 1.98 e7 | 6.2 | Notable | 6.21 |
| 8 | 13 | 6.23 e6 | 1.77 e7 | 2.8 | Notable | 8.53 |
| 9 | 14 | 8.70 e6 | 1.63 e7 | 1.9 | Notable | 9.45 |
| 10 | 16 | 1.69 e7 | 2.66 e7 | 1.6 | Notable | 10.29 |
| 11 | 18 | 3.24 e7 | 6.94 e7 | 2.1 | Notable | 11.06 |
| 12 | 20 | 6.19 e7 | 8.13 e7 | 1.3 | Notable | 12.51 |
| 13 | 22 | 1.17 e8 | 9.43 e7 | 0.8 | Notable | 12.94 |
| 14 | 24 | 2.21 e8 | 1.70 e8 | 0.8 | Notable | 13.21 |
| 15 | 26 | 4.15 e8 | 2.02 e9 | 4.9 | Notable | 14.69 |
| 16 | 28 | 7.74 e8 | 2.97 e9 | 3.8 | Mécène | 17.56 |
| 17 | 30 | 1.54 e9 | 4.39 e9 | 2.8 | Mécène | 22.12 |
| 18 | 31 | 2.18 e9 | 1.38 e10 | 6.3 | Mécène | 24.68 |
| 19 | 32 | 3.08 e9 | 6.04 e9 | 2.0 | Mécène | 27.56 |
| 20 | 34 | 6.15 e9 | 8.18 e9 | 1.3 | Mécène | 28.03 |

</details>

| Agressif (25 % par coup) | 2 h 00 | 5 h 00 | 14 h 07 | — | 3 h 40 | char 5 h 00, lyre 14 h 15 | 26.1 | 7.98 e9 | 0.4 | 8 | 61 % | 2 810 | 17 % | 45/1/0 | 34.7 |
| Tout ou rien (mise max) | 2 h 00 | 13 h 01 | 13 h 01 | — | 5 h 20 | char 7 h 50, lyre 13 h 00 | 81.1 | 9.52 e9 | 0.0 | 7 | 88 % | 77 | 10 % | 3/0/0 | 89.0 |
| Collectionneur (achète tout) | 4 h 01 | 11 h 02 | — | — | 3 h 20 | char 4 h 05, lyre 7 h 50, miroir 11 h 20 | 12.3 | 3.41 e10 | 4.4 | 2 | 0 % | 1 383 | 34 % | 11/2/0 | 7.7 |
| Absent (caisse toutes les 3 h, autos) | — | — | — | — | 9 h 00 | — | 0.6 | 1.33 e9 | 0.2 | 0 | — | 0 | — | 0/0/0 | 0.0 |

## Courbe « lent » — Premier joueur : l'ère 12 en 20 h

| Profil | Familier | Notable | Mécène | Prince de la Maison | Arbre (hors reliques) | Reliques (heure) | Bourse max (h de recettes) | Bourse max (Faveur) | Bourse finale (h) | Ruines | Fauché (temps de table) | Coups | Gagnants | Gros/Énormes/Légende | Plus gros gain (h) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Prudent (2 % par coup) | 2 h 11 | 8 h 04 | 18 h 02 | — | 4 h 10 | char 6 h 10, lyre 12 h 15, miroir 19 h 05 | 26.6 | 8.43 e7 | 12.7 | 0 | 0 % | 1 832 | 43 % | 9/4/0 | 12.3 |
| Joueur (5 % par coup) | 1 h 13 | 6 h 03 | 11 h 12 | — | 4 h 30 | char 6 h 05, lyre 11 h 05 | 16.0 | 2.17 e7 | 2.2 | 4 | 0 % | 2 873 | 32 % | 21/2/0 | 10.5 |

<details><summary>Le joueur, heure par heure</summary>

| Heure | Ère | Recettes/h | Bourse | Bourse (h) | Titre | Réputation (h) |
|---|---|---|---|---|---|---|
| 0 | 0 | 120 000 | 60 000 | 0.5 | Habitué | 0.00 |
| 1 | 3 | 178 441 | 94 368 | 0.5 | Habitué | 0.15 |
| 2 | 4 | 261 674 | 360 470 | 1.4 | Familier | 0.68 |
| 3 | 4 | 261 674 | 229 807 | 0.9 | Familier | 1.20 |
| 4 | 5 | 380 082 | 205 945 | 0.5 | Familier | 1.72 |
| 5 | 6 | 547 975 | 918 193 | 1.7 | Familier | 2.12 |
| 6 | 6 | 547 975 | 1.53 e6 | 2.8 | Familier | 2.62 |
| 7 | 6 | 547 975 | 1.82 e6 | 3.3 | Notable | 5.39 |
| 8 | 7 | 785 246 | 2.80 e6 | 3.6 | Notable | 7.36 |
| 9 | 7 | 785 246 | 1.78 e6 | 2.3 | Notable | 8.72 |
| 10 | 8 | 1.12 e6 | 3.43 e6 | 3.1 | Notable | 10.52 |
| 11 | 8 | 1.12 e6 | 7.07 e6 | 6.3 | Notable | 11.28 |
| 12 | 8 | 1.12 e6 | 1.21 e7 | 10.8 | Mécène | 16.80 |
| 13 | 9 | 1.59 e6 | 1.28 e7 | 8.1 | Mécène | 20.27 |
| 14 | 9 | 1.59 e6 | 4.20 e6 | 2.6 | Mécène | 22.03 |
| 15 | 10 | 2.25 e6 | 3.97 e6 | 1.8 | Mécène | 22.60 |
| 16 | 10 | 2.25 e6 | 1.53 e7 | 6.8 | Mécène | 23.72 |
| 17 | 10 | 2.25 e6 | 7.95 e6 | 3.5 | Mécène | 26.35 |
| 18 | 11 | 3.17 e6 | 1.40 e7 | 4.4 | Mécène | 29.13 |
| 19 | 11 | 3.17 e6 | 8.26 e6 | 2.6 | Mécène | 31.21 |
| 20 | 12 | 4.45 e6 | 9.71 e6 | 2.2 | Mécène | 32.93 |

</details>

| Agressif (25 % par coup) | 1 h 02 | 5 h 00 | 8 h 01 | 12 h 09 | 5 h 00 | char 5 h 00, lyre 17 h 50 | 81.4 | 6.39 e7 | 0.5 | 13 | 58 % | 2 495 | 16 % | 36/1/0 | 78.6 |
| Tout ou rien (mise max) | 2 h 11 | 7 h 00 | — | — | 5 h 30 | char 2 h 10 | 5.8 | 8.05 e6 | 0.0 | 4 | 86 % | 92 | 14 % | 3/0/0 | 5.8 |
| Collectionneur (achète tout) | 5 h 00 | 10 h 02 | — | — | 3 h 20 | char 4 h 30, lyre 8 h 00, miroir 13 h 40 | 12.0 | 3.80 e7 | 8.5 | 4 | 0 % | 1 350 | 35 % | 6/1/0 | 5.0 |
| Absent (caisse toutes les 3 h, autos) | — | — | — | — | 15 h 00 | — | 0.6 | 1.79 e6 | 0.4 | 0 | — | 0 | — | 0/0/0 | 0.0 |

