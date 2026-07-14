# Impact des achats sur la jauge de Rupture - mesure exacte

> Genere par `bench-rupture.js`. Cible de pression (`pressureBreakdown().total`)
> mesuree avant/apres chaque achat, sur trois etats de reference (graces eteintes,
> cycle de 20 min). Delta negatif = l'achat REDUIT la pression (bon pour le joueur).
> Reference avant reequilibrage : delta ~ -0.000 partout en late game (plafonds durs satures).

| Echelle | Achat | Cible avant | Cible apres | Delta |
|---|---|---|---|---|
| Early (pop 800, ~45 batiments) | +25 egouts (stabilisant -0.003) | 0.287 | 0.194 | -0.094 |
| Early (pop 800, ~45 batiments) | +10 tribunaux (stabilisant -0.006) | 0.287 | 0.194 | -0.094 |
| Early (pop 800, ~45 batiments) | +50% ressource Infrastructure | 0.287 | 0.224 | -0.064 |
| Early (pop 800, ~45 batiments) | +25 routes (production d'infra) | 0.287 | 0.482 | +0.194 |
| Early (pop 800, ~45 batiments) | -50% Nourriture (controle scarcity) | 0.287 | 0.479 | +0.192 |
| Mid (pop 40K, ~370 batiments) | +25 egouts (stabilisant -0.003) | 0.930 | 0.699 | -0.231 |
| Mid (pop 40K, ~370 batiments) | +10 tribunaux (stabilisant -0.006) | 0.930 | 0.763 | -0.167 |
| Mid (pop 40K, ~370 batiments) | +50% ressource Infrastructure | 0.930 | 0.910 | -0.020 |
| Mid (pop 40K, ~370 batiments) | +25 routes (production d'infra) | 0.930 | 0.955 | +0.025 |
| Mid (pop 40K, ~370 batiments) | -50% Nourriture (controle scarcity) | 0.930 | 1.137 | +0.206 |
| Late (pop 1G, ~3000 batiments) | +25 egouts (stabilisant -0.003) | 1.897 | 1.875 | -0.023 |
| Late (pop 1G, ~3000 batiments) | +10 tribunaux (stabilisant -0.006) | 1.897 | 1.880 | -0.017 |
| Late (pop 1G, ~3000 batiments) | +50% ressource Infrastructure | 1.897 | 1.858 | -0.040 |
| Late (pop 1G, ~3000 batiments) | +25 routes (production d'infra) | 1.897 | 1.899 | +0.002 |
| Late (pop 1G, ~3000 batiments) | -50% Nourriture (controle scarcity) | 1.897 | 2.104 | +0.206 |

## Lecture
- **Stabilisants (egouts/tribunaux)** : prise directe sur la charge structurelle (`STABILIZER_DIRECT_FACTOR`) - leur delta doit rester negatif et sensible a TOUTES les echelles.
- **Infrastructure (ressource et producteurs)** : agit via la couverture en ratio (mitigation, portage du structural, absorption de la complexity).
- **Nourriture -50%** : controle positif - la scarcity doit reagir fortement (c'est la tension voulue).
- Leviers de reglage : `INFRA_COVERAGE_*`, `MITIGATION_*`, `STABILIZER_DIRECT_FACTOR`, `COMPLEXITY_COVERAGE_ABSORB` dans `src/game/core/balance.js`.
