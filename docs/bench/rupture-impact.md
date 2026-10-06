# Impact des achats sur la jauge de Rupture - mesure exacte

> Genere par `bench-rupture.js`. Cible de pression (`pressureBreakdown().total`)
> mesuree avant/apres chaque achat, sur trois etats de reference (graces eteintes,
> cycle de 20 min). Delta negatif = l'achat REDUIT la pression (bon pour le joueur).
> Reference avant reequilibrage : delta ~ -0.000 partout en late game (plafonds durs satures).

| Echelle | Achat | Cible avant | Cible apres | Delta |
|---|---|---|---|---|
| Early (pop 800, ~45 batiments) | +25 egouts (stabilisant -0.003) | 0.245 | 0.163 | -0.082 |
| Early (pop 800, ~45 batiments) | +10 tribunaux (stabilisant -0.006) | 0.245 | 0.163 | -0.082 |
| Early (pop 800, ~45 batiments) | +50% ressource Infrastructure | 0.245 | 0.181 | -0.064 |
| Early (pop 800, ~45 batiments) | +25 routes (production d'infra) | 0.245 | 0.394 | +0.150 |
| Early (pop 800, ~45 batiments) | -50% Nourriture (controle scarcity) | 0.245 | 0.437 | +0.192 |
| Mid (pop 40K, ~370 batiments) | +25 egouts (stabilisant -0.003) | 0.868 | 0.607 | -0.261 |
| Mid (pop 40K, ~370 batiments) | +10 tribunaux (stabilisant -0.006) | 0.868 | 0.681 | -0.188 |
| Mid (pop 40K, ~370 batiments) | +50% ressource Infrastructure | 0.868 | 0.848 | -0.020 |
| Mid (pop 40K, ~370 batiments) | +25 routes (production d'infra) | 0.868 | 0.881 | +0.013 |
| Mid (pop 40K, ~370 batiments) | -50% Nourriture (controle scarcity) | 0.868 | 1.074 | +0.206 |
| Late (pop 1G, ~3000 batiments) | +25 egouts (stabilisant -0.003) | 1.812 | 1.780 | -0.032 |
| Late (pop 1G, ~3000 batiments) | +10 tribunaux (stabilisant -0.006) | 1.812 | 1.788 | -0.025 |
| Late (pop 1G, ~3000 batiments) | +50% ressource Infrastructure | 1.812 | 1.770 | -0.042 |
| Late (pop 1G, ~3000 batiments) | +25 routes (production d'infra) | 1.812 | 1.812 | +0.000 |
| Late (pop 1G, ~3000 batiments) | -50% Nourriture (controle scarcity) | 1.812 | 2.019 | +0.206 |

## Lecture
- **Stabilisants (egouts/tribunaux)** : prise directe sur la charge structurelle (`STABILIZER_DIRECT_FACTOR`) - leur delta doit rester negatif et sensible a TOUTES les echelles.
- **Infrastructure (ressource et producteurs)** : agit via la couverture en ratio (mitigation, portage du structural, absorption de la complexity).
- **Nourriture -50%** : controle positif - la scarcity doit reagir fortement (c'est la tension voulue).
- Leviers de reglage : `INFRA_COVERAGE_*`, `MITIGATION_*`, `STABILIZER_DIRECT_FACTOR`, `COMPLEXITY_COVERAGE_ABSORB` dans `src/game/core/balance.js`.
