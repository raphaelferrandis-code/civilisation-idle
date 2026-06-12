# Pacing par profil de joueur - jalons horodates (temps virtuel)

> Genere par `simulate-ce.js --profiles` (budget reel 1 min/profil, pas 5s).
> Chiffres EXACTS pour les jalons atteints dans le temps de calcul. La boucle de prestige de CE etant
> tres longue (GR1 ~ jours virtuels composes), les jalons profonds peuvent etre "non atteint" faute de
> temps de CALCUL reel (pas par design) : relancer avec `--maxreal` plus grand pour les horodater.

## Synthese finale par profil
| Profil | Temps virtuel simule | Cycles | Dynasties | GR | Age max | Mult global | Prod/s |
|---|---|---|---|---|---|---|---|
| Idle | 10j 1h 31m | 54 | 0 | 0 | Feux dispersés | x2.1 | 0.3 |
| Rusher (effondre tot) | 4h 49m | 13 | 0 | 0 | Abris saisonniers | x1.2 | 1.76K |
| Equilibre (~10 min/cycle) | 1j 12h 23m | 334 | 1 | 0 | Lignée des huttes | x8.4 | 34.7K |
| Patient (~30 min/cycle) | 1j 8h 10m | 220 | 1 | 0 | Hameau | x5.8 | 43.1K |

## Jalons horodates (temps virtuel pour les atteindre)
| Jalon | Idle | Rusher (effondre tot) | Equilibre (~10 min/cycle) | Patient (~30 min/cycle) |
|---|---|---|---|---|
| Age max atteint | Feux dispersés (1h 32m) | Abris saisonniers (3m 20s) | Lignée des huttes (1j 3h 36m) | Hameau (1j 4h 2m) |
| Dynastie 1 | non atteint | non atteint | 1j 6h 42m | 1j 1h 30m |
| Dynastie 10 | non atteint | non atteint | non atteint | non atteint |
| Dogme palier 10 | non atteint | non atteint | non atteint | non atteint |
| Dogme palier 20 | non atteint | non atteint | non atteint | non atteint |
| Dogme palier 30 | non atteint | non atteint | non atteint | non atteint |
| Grand Reset 1 (= Mythes debloques) | non atteint | non atteint | non atteint | non atteint |
| Grand Reset 10 | non atteint | non atteint | non atteint | non atteint |
| Grand Reset 11 | non atteint | non atteint | non atteint | non atteint |
| Tous les Mythes completes | non atteint | non atteint | non atteint | non atteint |

## Progression des Ages (profil Equilibre (~10 min/cycle))
| Age | Palier | Temps virtuel |
|---|---|---|
| Campement | 0 | 0m 0s |
| Feux dispersés | 1 | 1m 20s |
| Abris saisonniers | 2 | 3m 20s |
| Clan des foyers | 3 | 14m 20s |
| Lignée des huttes | 4 | 1j 3h 36m |

## Rythme meta mesure (base d'extrapolation, NON un jalon)
- **Rusher (effondre tot)** : 13 cycles en 4h 49m (2.7 cycles/h virtuelle) ; 0 dynasties (~1 / n/a) ; legitimite finale 0.0 / 300 requis pour GR1.
- **Equilibre (~10 min/cycle)** : 334 cycles en 1j 12h 23m (9.2 cycles/h virtuelle) ; 1 dynasties (~1 / 1j 12h 23m) ; legitimite finale 12 / 300 requis pour GR1.
- **Patient (~30 min/cycle)** : 220 cycles en 1j 8h 10m (6.8 cycles/h virtuelle) ; 1 dynasties (~1 / 1j 8h 10m) ; legitimite finale 2.0 / 300 requis pour GR1.

> **Lecture.** Le GR1 exige 300 legitimite (+~53 depensees en heritages avant). La legitimite par dynastie
> CROIT (terme `cycles/12` dans `legitimacyGain`), donc l'extrapolation lineaire sous-estime : l'ordre de grandeur
> reel du GR1 est de plusieurs jours virtuels de jeu compose. Les Mythes (donc Actes I-III, GR11) sont verrouilles
> derriere ce GR1. Pour des horodatages EXACTS de GR1+/Mythes, relancer un run long (`--maxreal=60`+).
