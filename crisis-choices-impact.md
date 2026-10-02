# Choix de crise : impact mesuré

> Généré par `bench-crises.js` (partie neuve, budget 24 h, graine 2654435769,
> tick 5 s, plan d'achats de simulate-ce, réforme du foyer dominant dès une cible de 0.85,
> plafond 4 h par cycle).
> Tirage normal du jeu.
> Molettes : traiter défaut · profiter défaut · Ruines défaut.

## Carrières (même budget de temps)

| Joueur | Ruines en 24 h | Cycles | Traiter / Profiter |
|---|---|---|---|
| prudent | 1601 | 20 | 60 / 0 |
| cupide | 1577 | 357 | 0 / 1071 |
| lucide | 1781 | 19 | 52 / 4 |

### Détail par cycle

| Joueur | Cycle | Durée | Pic de pop | Ruines | Fin |
|---|---|---|---|---|---|
| prudent | 1 | 4 h 00 | 1.61e+7 | 97 | plafond |
| prudent | 2 | 4 h 00 | 7.77e+7 | 216 | plafond |
| prudent | 3 | 1 h 31 | 2.81e+7 | 115 | rupture |
| prudent | 4 | 1 h 31 | 3.31e+7 | 125 | rupture |
| prudent | 5 | 1 h 11 | 2.20e+7 | 98 | rupture |
| prudent | 6 | 1 h 31 | 3.81e+7 | 134 | rupture |
| prudent | 7 | 1 h 01 | 2.03e+7 | 93 | rupture |
| prudent | 8 | 0 h 51 | 1.12e+7 | 66 | rupture |
| prudent | 9 | 1 h 01 | 2.12e+7 | 95 | rupture |
| prudent | 10 | 0 h 52 | 1.22e+7 | 70 | rupture |
| prudent | 11 | 0 h 42 | 6.62e+6 | 50 | rupture |
| prudent | 12 | 0 h 42 | 6.54e+6 | 50 | rupture |
| cupide | 1 | 0 h 28 | 1.96e+5 | 13 | rupture |
| cupide | 2 | 0 h 21 | 1.77e+5 | 12 | rupture |
| cupide | 3 | 0 h 21 | 2.20e+5 | 13 | rupture |
| cupide | 4 | 0 h 21 | 2.46e+5 | 14 | rupture |
| cupide | 5 | 0 h 21 | 2.72e+5 | 15 | rupture |
| cupide | 6 | 0 h 21 | 3.05e+5 | 15 | rupture |
| cupide | 7 | 0 h 12 | 7.83e+4 | 8 | rupture |
| cupide | 8 | 0 h 11 | 7.90e+4 | 8 | rupture |
| cupide | 9 | 0 h 11 | 8.06e+4 | 8 | rupture |
| cupide | 10 | 0 h 11 | 8.59e+4 | 8 | rupture |
| cupide | 11 | 0 h 11 | 9.02e+4 | 9 | rupture |
| cupide | 12 | 0 h 11 | 1.10e+5 | 9 | rupture |
| lucide | 1 | 4 h 00 | 1.69e+7 | 114 | plafond |
| lucide | 2 | 4 h 00 | 9.07e+7 | 234 | plafond |
| lucide | 3 | 1 h 21 | 2.34e+7 | 103 | rupture |
| lucide | 4 | 1 h 41 | 4.48e+7 | 148 | rupture |
| lucide | 5 | 1 h 11 | 2.24e+7 | 99 | rupture |
| lucide | 6 | 1 h 21 | 3.08e+7 | 119 | rupture |
| lucide | 7 | 1 h 11 | 3.00e+7 | 115 | rupture |
| lucide | 8 | 0 h 51 | 1.18e+7 | 68 | rupture |
| lucide | 9 | 1 h 31 | 6.82e+7 | 180 | rupture |
| lucide | 10 | 0 h 51 | 1.35e+7 | 74 | rupture |
| lucide | 11 | 1 h 11 | 4.12e+7 | 135 | rupture |
| lucide | 12 | 0 h 31 | 3.91e+6 | 45 | rupture |

## Contrefactuel : à chaque crise, quelle option rapporte le plus ?

Ligne principale prudente. Pour chaque crise, la suite du cycle est rejouée depuis
le même état exact, une fois en traitant, une fois en profitant (Ruines par heure
de cycle). **Meilleur choix : profiter 33 fois, traiter 27 fois.**

| Cycle | Crise | Cible | Foyer | Usure | Traiter (R/h) | Profiter (R/h) | Meilleur |
|---|---|---|---|---|---|---|---|
| 1 | grain_panic | 26 % | 30 % | 1 % | 24.3 (4 h 00) | 28.5 (4 h 00) | profiter |
| 1 | militia_demand | 54 % | 1 % | 4 % | 24.3 (4 h 00) | 29.3 (4 h 00) | profiter |
| 1 | low_district_famine | 76 % | 37 % | 8 % | 24.3 (4 h 00) | 31.3 (4 h 00) | profiter |
| 2 | rapid_expansion | 49 % | 13 % | 0 % | 54.0 (4 h 00) | 71.8 (4 h 00) | profiter |
| 2 | merchant_league | 54 % | 32 % | 1 % | 54.0 (4 h 00) | 64.8 (4 h 00) | profiter |
| 2 | plague_scare | 94 % | 40 % | 1 % | 54.0 (4 h 00) | 44.6 (0 h 51) | traiter |
| 3 | whisper_campaign | 56 % | 4 % | 0 % | 76.1 (1 h 31) | 52.6 (0 h 32) | traiter |
| 3 | infrastructure_debt | 74 % | 32 % | 1 % | 76.1 (1 h 31) | 57.4 (0 h 12) | traiter |
| 3 | debt_spiral | 75 % | 32 % | 1 % | 76.1 (1 h 31) | 80.6 (1 h 00) | profiter |
| 4 | grain_panic | 61 % | 36 % | 0 % | 82.5 (1 h 31) | 79.6 (1 h 00) | traiter |
| 4 | militia_demand | 59 % | 6 % | 1 % | 82.5 (1 h 31) | 61.2 (0 h 42) | traiter |
| 4 | low_district_famine | 88 % | 37 % | 1 % | 82.5 (1 h 31) | 66.4 (0 h 42) | traiter |
| 5 | rapid_expansion | 61 % | 16 % | 0 % | 82.7 (1 h 11) | 80.8 (1 h 01) | traiter |
| 5 | power_consolidation | 101 % | 7 % | 1 % | 82.7 (1 h 11) | 80.8 (0 h 59) | traiter |
| 5 | palace_coup | 77 % | 1 % | 1 % | 82.7 (1 h 11) | 70.6 (0 h 42) | traiter |
| 6 | whisper_campaign | 72 % | 7 % | 0 % | 88.7 (1 h 31) | 84.7 (1 h 01) | traiter |
| 6 | infrastructure_debt | 84 % | 33 % | 1 % | 88.7 (1 h 31) | 64.6 (0 h 32) | traiter |
| 6 | plague_scare | 96 % | 42 % | 1 % | 88.7 (1 h 31) | 67.9 (0 h 32) | traiter |
| 7 | grain_panic | 69 % | 36 % | 0 % | 91.7 (1 h 01) | 66.8 (0 h 31) | traiter |
| 7 | merchant_league | 71 % | 32 % | 1 % | 91.7 (1 h 01) | 68.6 (0 h 32) | traiter |
| 7 | low_district_famine | 83 % | 38 % | 1 % | 91.7 (1 h 01) | 73.5 (0 h 31) | traiter |
| 8 | rapid_expansion | 68 % | 15 % | 0 % | 77.4 (0 h 51) | 66.7 (0 h 32) | traiter |
| 8 | knowledge_schism | 84 % | 35 % | 1 % | 77.4 (0 h 51) | 68.8 (0 h 31) | traiter |
| 8 | debt_spiral | 90 % | 0 % | 3 % | 77.4 (0 h 51) | 74.3 (0 h 32) | traiter |
| 9 | whisper_campaign | 79 % | 9 % | 0 % | 94.1 (1 h 01) | 72.9 (0 h 41) | traiter |
| 9 | infrastructure_debt | 94 % | 43 % | 1 % | 94.1 (1 h 01) | 75.6 (0 h 41) | traiter |
| 9 | palace_coup | 92 % | 6 % | 4 % | 94.1 (1 h 01) | 81.8 (0 h 41) | traiter |
| 10 | grain_panic | 81 % | 37 % | 0 % | 80.9 (0 h 52) | 66.3 (0 h 32) | traiter |
| 10 | merchant_league | 80 % | 32 % | 1 % | 80.9 (0 h 52) | 67.7 (0 h 32) | traiter |
| 10 | plague_scare | 98 % | 39 % | 1 % | 80.9 (0 h 52) | 78.9 (0 h 31) | traiter |
| 11 | market_hoarding | 51 % | 31 % | 0 % | 72.0 (0 h 42) | 81.1 (0 h 41) | profiter |
| 11 | knowledge_schism | 80 % | 33 % | 1 % | 72.0 (0 h 42) | 74.9 (0 h 31) | profiter |
| 11 | low_district_famine | 78 % | 35 % | 1 % | 72.0 (0 h 42) | 90.5 (0 h 41) | profiter |
| 12 | whisper_campaign | 105 % | 12 % | 0 % | 72.1 (0 h 42) | 76.6 (0 h 31) | profiter |
| 12 | infrastructure_debt | 99 % | 27 % | 1 % | 72.1 (0 h 42) | 80.6 (0 h 31) | profiter |
| 12 | debt_spiral | 90 % | 0 % | 3 % | 72.1 (0 h 42) | 91.6 (0 h 41) | profiter |
| 13 | grain_panic | 86 % | 35 % | 0 % | 72.3 (0 h 42) | 68.9 (0 h 31) | traiter |
| 13 | merchant_league | 92 % | 27 % | 1 % | 72.3 (0 h 42) | 83.1 (0 h 41) | profiter |
| 13 | palace_coup | 93 % | 14 % | 1 % | 72.3 (0 h 42) | 82.8 (0 h 31) | profiter |
| 14 | rapid_expansion | 87 % | 13 % | 0 % | 83.6 (0 h 52) | 75.6 (0 h 41) | traiter |
| 14 | knowledge_schism | 96 % | 28 % | 1 % | 83.6 (0 h 52) | 78.7 (0 h 41) | traiter |
| 14 | plague_scare | 81 % | 40 % | 1 % | 83.6 (0 h 52) | 90.7 (0 h 41) | profiter |
| 15 | whisper_campaign | 90 % | 14 % | 0 % | 83.9 (0 h 42) | 96.4 (0 h 41) | profiter |
| 15 | infrastructure_debt | 97 % | 33 % | 1 % | 83.9 (0 h 42) | 99.1 (0 h 41) | profiter |
| 15 | low_district_famine | 90 % | 42 % | 1 % | 83.9 (0 h 42) | 86.6 (0 h 31) | profiter |
| 16 | grain_panic | 94 % | 36 % | 0 % | 66.8 (0 h 31) | 77.2 (0 h 31) | profiter |
| 16 | merchant_league | 105 % | 31 % | 1 % | 66.8 (0 h 31) | 74.5 (0 h 31) | profiter |
| 16 | debt_spiral | 81 % | 0 % | 1 % | 66.8 (0 h 31) | 86.2 (0 h 31) | profiter |
| 17 | rapid_expansion | 99 % | 14 % | 0 % | 70.7 (0 h 42) | 80.0 (0 h 41) | profiter |
| 17 | knowledge_schism | 96 % | 26 % | 1 % | 70.7 (0 h 42) | 83.1 (0 h 41) | profiter |
| 17 | plague_scare | 79 % | 38 % | 1 % | 70.7 (0 h 42) | 97.0 (0 h 41) | profiter |
| 18 | whisper_campaign | 100 % | 17 % | 0 % | 78.1 (0 h 42) | 90.5 (0 h 41) | profiter |
| 18 | infrastructure_debt | 117 % | 49 % | 1 % | 78.1 (0 h 42) | 92.2 (0 h 41) | profiter |
| 18 | palace_coup | 89 % | 13 % | 3 % | 78.1 (0 h 42) | 99.5 (0 h 41) | profiter |
| 19 | grain_panic | 87 % | 35 % | 0 % | 77.2 (0 h 41) | 87.6 (0 h 41) | profiter |
| 19 | merchant_league | 108 % | 26 % | 1 % | 77.2 (0 h 41) | 92.2 (0 h 41) | profiter |
| 19 | low_district_famine | 89 % | 36 % | 1 % | 77.2 (0 h 41) | 91.2 (0 h 32) | profiter |
| 20 | rapid_expansion | 87 % | 14 % | 0 % | 72.6 (0 h 41) | 82.0 (0 h 41) | profiter |
| 20 | knowledge_schism | 90 % | 31 % | 1 % | 72.6 (0 h 41) | 82.8 (0 h 31) | profiter |
| 20 | plague_scare | 75 % | 35 % | 2 % | 72.6 (0 h 41) | 89.0 (0 h 31) | profiter |
