# Choix de crise : impact mesuré

> Généré par `bench-crises.js` (partie neuve, budget 24 h, graine 2654435769,
> tick 5 s, plan d'achats de simulate-ce, réforme du foyer dominant dès une cible de 0.85,
> plafond 4 h par cycle).
> Tirage limité à : market_hoarding, knowledge_schism, low_district_famine.
> Molettes : traiter défaut · profiter défaut · Ruines défaut.

## Carrières (même budget de temps)

| Joueur | Ruines en 24 h | Cycles | Traiter / Profiter |
|---|---|---|---|
| prudent | 1619 | 21 | 63 / 0 |
| cupide | 1584 | 362 | 0 / 1086 |
| lucide | 1723 | 22 | 59 / 7 |

### Détail par cycle

| Joueur | Cycle | Durée | Pic de pop | Ruines | Fin |
|---|---|---|---|---|---|
| prudent | 1 | 4 h 00 | 1.66e+7 | 98 | plafond |
| prudent | 2 | 4 h 00 | 1.04e+8 | 252 | plafond |
| prudent | 3 | 1 h 31 | 3.09e+7 | 121 | rupture |
| prudent | 4 | 1 h 11 | 1.97e+7 | 94 | rupture |
| prudent | 5 | 1 h 11 | 2.41e+7 | 104 | rupture |
| prudent | 6 | 1 h 11 | 2.56e+7 | 107 | rupture |
| prudent | 7 | 1 h 01 | 1.84e+7 | 89 | rupture |
| prudent | 8 | 0 h 52 | 1.17e+7 | 69 | rupture |
| prudent | 9 | 0 h 51 | 1.18e+7 | 69 | rupture |
| prudent | 10 | 0 h 42 | 5.82e+6 | 48 | rupture |
| prudent | 11 | 0 h 42 | 5.82e+6 | 49 | rupture |
| prudent | 12 | 0 h 41 | 6.61e+6 | 51 | rupture |
| cupide | 1 | 0 h 28 | 1.96e+5 | 13 | rupture |
| cupide | 2 | 0 h 21 | 1.77e+5 | 12 | rupture |
| cupide | 3 | 0 h 21 | 2.20e+5 | 13 | rupture |
| cupide | 4 | 0 h 21 | 2.46e+5 | 14 | rupture |
| cupide | 5 | 0 h 21 | 2.72e+5 | 15 | rupture |
| cupide | 6 | 0 h 21 | 3.05e+5 | 15 | rupture |
| cupide | 7 | 0 h 12 | 7.63e+4 | 8 | rupture |
| cupide | 8 | 0 h 11 | 7.90e+4 | 8 | rupture |
| cupide | 9 | 0 h 11 | 8.53e+4 | 8 | rupture |
| cupide | 10 | 0 h 11 | 8.59e+4 | 8 | rupture |
| cupide | 11 | 0 h 11 | 9.23e+4 | 9 | rupture |
| cupide | 12 | 0 h 06 | 5.54e+4 | 5 | rupture |
| lucide | 1 | 4 h 00 | 1.67e+7 | 113 | plafond |
| lucide | 2 | 4 h 00 | 1.24e+8 | 275 | plafond |
| lucide | 3 | 0 h 32 | 1.71e+6 | 27 | rupture |
| lucide | 4 | 1 h 11 | 1.72e+7 | 88 | rupture |
| lucide | 5 | 1 h 11 | 2.35e+7 | 102 | rupture |
| lucide | 6 | 1 h 11 | 2.27e+7 | 101 | rupture |
| lucide | 7 | 1 h 01 | 1.77e+7 | 88 | rupture |
| lucide | 8 | 1 h 11 | 2.89e+7 | 114 | rupture |
| lucide | 9 | 0 h 51 | 1.25e+7 | 71 | rupture |
| lucide | 10 | 0 h 51 | 1.23e+7 | 71 | rupture |
| lucide | 11 | 0 h 51 | 1.35e+7 | 74 | rupture |
| lucide | 12 | 0 h 41 | 7.20e+6 | 63 | rupture |

## Contrefactuel : à chaque crise, quelle option rapporte le plus ?

Ligne principale prudente. Pour chaque crise, la suite du cycle est rejouée depuis
le même état exact, une fois en traitant, une fois en profitant (Ruines par heure
de cycle). **Meilleur choix : profiter 43 fois, traiter 20 fois.**

| Cycle | Crise | Cible | Foyer | Usure | Traiter (R/h) | Profiter (R/h) | Meilleur |
|---|---|---|---|---|---|---|---|
| 1 | market_hoarding | 26 % | 0 % | 1 % | 24.5 (4 h 00) | 28.3 (4 h 00) | profiter |
| 1 | knowledge_schism | 56 % | 31 % | 4 % | 24.5 (4 h 00) | 29.5 (4 h 00) | profiter |
| 1 | low_district_famine | 75 % | 40 % | 8 % | 24.5 (4 h 00) | 31.8 (4 h 00) | profiter |
| 2 | market_hoarding | 48 % | 32 % | 0 % | 63.0 (4 h 00) | 72.5 (4 h 00) | profiter |
| 2 | knowledge_schism | 54 % | 21 % | 1 % | 63.0 (4 h 00) | 77.5 (4 h 00) | profiter |
| 2 | low_district_famine | 93 % | 40 % | 1 % | 63.0 (4 h 00) | 82.5 (4 h 00) | profiter |
| 3 | market_hoarding | 52 % | 32 % | 0 % | 79.9 (1 h 31) | 56.1 (0 h 33) | traiter |
| 3 | knowledge_schism | 102 % | 52 % | 1 % | 79.9 (1 h 31) | 59.5 (0 h 21) | traiter |
| 3 | low_district_famine | 80 % | 29 % | 1 % | 79.9 (1 h 31) | 62.4 (0 h 21) | traiter |
| 4 | market_hoarding | 60 % | 31 % | 0 % | 79.5 (1 h 11) | 84.9 (1 h 01) | profiter |
| 4 | knowledge_schism | 110 % | 55 % | 1 % | 79.5 (1 h 11) | 63.9 (0 h 32) | traiter |
| 4 | low_district_famine | 90 % | 44 % | 3 % | 79.5 (1 h 11) | 68.4 (0 h 32) | traiter |
| 5 | market_hoarding | 61 % | 31 % | 0 % | 87.8 (1 h 11) | 67.8 (0 h 43) | traiter |
| 5 | knowledge_schism | 97 % | 46 % | 1 % | 87.8 (1 h 11) | 68.9 (0 h 31) | traiter |
| 5 | low_district_famine | 101 % | 42 % | 1 % | 87.8 (1 h 11) | 73.0 (0 h 31) | traiter |
| 6 | market_hoarding | 74 % | 31 % | 0 % | 90.3 (1 h 11) | 65.6 (0 h 32) | traiter |
| 6 | knowledge_schism | 84 % | 34 % | 1 % | 90.3 (1 h 11) | 68.8 (0 h 31) | traiter |
| 6 | low_district_famine | 89 % | 40 % | 3 % | 90.3 (1 h 11) | 72.8 (0 h 31) | traiter |
| 7 | market_hoarding | 69 % | 31 % | 0 % | 87.4 (1 h 01) | 65.6 (0 h 32) | traiter |
| 7 | knowledge_schism | 85 % | 39 % | 1 % | 87.4 (1 h 01) | 68.6 (0 h 32) | traiter |
| 7 | low_district_famine | 92 % | 42 % | 3 % | 87.4 (1 h 01) | 74.1 (0 h 32) | traiter |
| 8 | market_hoarding | 69 % | 31 % | 0 % | 79.5 (0 h 52) | 72.4 (0 h 41) | traiter |
| 8 | knowledge_schism | 88 % | 35 % | 1 % | 79.5 (0 h 52) | 70.5 (0 h 32) | traiter |
| 8 | low_district_famine | 94 % | 42 % | 3 % | 79.5 (0 h 52) | 76.4 (0 h 31) | traiter |
| 9 | market_hoarding | 79 % | 31 % | 0 % | 80.5 (0 h 51) | 73.9 (0 h 41) | traiter |
| 9 | knowledge_schism | 89 % | 38 % | 1 % | 80.5 (0 h 51) | 73.0 (0 h 31) | traiter |
| 9 | low_district_famine | 90 % | 39 % | 3 % | 80.5 (0 h 51) | 77.0 (0 h 31) | traiter |
| 10 | market_hoarding | 77 % | 31 % | 0 % | 68.2 (0 h 42) | 76.5 (0 h 42) | profiter |
| 10 | knowledge_schism | 91 % | 40 % | 1 % | 68.2 (0 h 42) | 74.5 (0 h 31) | profiter |
| 10 | low_district_famine | 95 % | 43 % | 3 % | 68.2 (0 h 42) | 78.3 (0 h 31) | profiter |
| 11 | market_hoarding | 82 % | 31 % | 0 % | 70.6 (0 h 42) | 78.5 (0 h 41) | profiter |
| 11 | knowledge_schism | 103 % | 41 % | 1 % | 70.6 (0 h 42) | 76.4 (0 h 31) | profiter |
| 11 | low_district_famine | 101 % | 42 % | 1 % | 70.6 (0 h 42) | 80.6 (0 h 31) | profiter |
| 12 | market_hoarding | 82 % | 31 % | 0 % | 73.9 (0 h 41) | 83.2 (0 h 41) | profiter |
| 12 | knowledge_schism | 106 % | 43 % | 1 % | 73.9 (0 h 41) | 76.2 (0 h 32) | profiter |
| 12 | low_district_famine | 90 % | 43 % | 1 % | 73.9 (0 h 41) | 82.1 (0 h 31) | profiter |
| 13 | market_hoarding | 86 % | 31 % | 0 % | 72.0 (0 h 42) | 81.3 (0 h 41) | profiter |
| 13 | knowledge_schism | 94 % | 33 % | 1 % | 72.0 (0 h 42) | 76.8 (0 h 31) | profiter |
| 13 | low_district_famine | 107 % | 42 % | 1 % | 72.0 (0 h 42) | 90.5 (0 h 41) | profiter |
| 14 | market_hoarding | 87 % | 31 % | 0 % | 73.6 (0 h 42) | 82.6 (0 h 41) | profiter |
| 14 | knowledge_schism | 97 % | 33 % | 1 % | 73.6 (0 h 42) | 85.2 (0 h 41) | profiter |
| 14 | low_district_famine | 99 % | 42 % | 1 % | 73.6 (0 h 42) | 84.3 (0 h 31) | profiter |
| 15 | market_hoarding | 87 % | 31 % | 0 % | 76.6 (0 h 42) | 87.4 (0 h 41) | profiter |
| 15 | knowledge_schism | 97 % | 33 % | 1 % | 76.6 (0 h 42) | 88.6 (0 h 31) | profiter |
| 15 | low_district_famine | 96 % | 42 % | 1 % | 76.6 (0 h 42) | 94.3 (0 h 31) | profiter |
| 16 | market_hoarding | 91 % | 31 % | 0 % | 75.5 (0 h 41) | 86.0 (0 h 41) | profiter |
| 16 | knowledge_schism | 111 % | 49 % | 1 % | 75.5 (0 h 41) | 90.4 (0 h 41) | profiter |
| 16 | low_district_famine | 75 % | 31 % | 2 % | 75.5 (0 h 41) | 95.7 (0 h 41) | profiter |
| 17 | market_hoarding | 91 % | 31 % | 0 % | 78.2 (0 h 41) | 88.7 (0 h 41) | profiter |
| 17 | knowledge_schism | 99 % | 33 % | 1 % | 78.2 (0 h 41) | 93.5 (0 h 41) | profiter |
| 17 | low_district_famine | 73 % | 38 % | 1 % | 78.2 (0 h 41) | 88.8 (0 h 31) | profiter |
| 18 | market_hoarding | 100 % | 31 % | 0 % | 76.8 (0 h 41) | 87.4 (0 h 41) | profiter |
| 18 | knowledge_schism | 104 % | 35 % | 1 % | 76.8 (0 h 41) | 92.4 (0 h 41) | profiter |
| 18 | low_district_famine | 104 % | 40 % | 1 % | 76.8 (0 h 41) | 88.8 (0 h 31) | profiter |
| 19 | market_hoarding | 100 % | 31 % | 0 % | 76.9 (0 h 41) | 86.2 (0 h 41) | profiter |
| 19 | knowledge_schism | 95 % | 34 % | 1 % | 76.9 (0 h 41) | 84.0 (0 h 31) | profiter |
| 19 | low_district_famine | 78 % | 38 % | 1 % | 76.9 (0 h 41) | 88.8 (0 h 31) | profiter |
| 20 | market_hoarding | 88 % | 31 % | 0 % | 80.2 (0 h 41) | 89.3 (0 h 41) | profiter |
| 20 | knowledge_schism | 81 % | 35 % | 1 % | 80.2 (0 h 41) | 88.3 (0 h 31) | profiter |
| 20 | low_district_famine | 82 % | 36 % | 2 % | 80.2 (0 h 41) | 92.7 (0 h 31) | profiter |
| 21 | market_hoarding | 88 % | 31 % | 0 % | 85.6 (0 h 41) | 96.2 (0 h 41) | profiter |
| 21 | knowledge_schism | 121 % | 49 % | 1 % | 85.6 (0 h 41) | 102.6 (0 h 41) | profiter |
| 21 | low_district_famine | 85 % | 37 % | 2 % | 85.6 (0 h 41) | 92.7 (0 h 31) | profiter |
