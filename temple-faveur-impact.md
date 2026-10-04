# Jeux de la Maison des Plaisirs — banc d'equilibrage (lots 1 et 2 : cotes fixes, rang)

> Genere par `bench-temple.js` sur le vrai code. Lot 1 des gains « vrai casino »
> (2026-10-04, `docs/PLAN-GAINS-CASINO.md`) : cotes fixes pour toujours, mise libre,
> aucun jeu au-dessus de 100 %. A regenerer apres toute retouche : `node bench-temple.js`.

## Garde-fous

- **PASS** - A2 osselets : chaque rite rend 97 % : prudent 97.000 %, classique 97.000 %, grand 97.000 %, interdit 97.000 %
- **PASS** - A3 osselets : echelle de risque (chance baisse, paiements et ecart-type montent) : prudent 62.0 % paire x1.37 Venus x2.11 sigma 0.74 ; classique 47.5 % paire x1.54 Venus x3.08 sigma 1.02 ; grand 32.0 % paire x1.85 Venus x4.62 sigma 1.45 ; interdit 18.0 % paire x1.95 Venus x9.37 sigma 2.41
- **PASS** - A4 21 : REF majore le jeu parfait (marge >= 3 ecarts-types) : REF 99.50 % ; parfait 98.86 % +- 0.11 %
- **PASS** - A4 21 : AUTO colle au chemin de l'auto (base + double, +-0,5 pt) : AUTO 98.30 % ; mesure 98.19 %
- **PASS** - A2 Icare : 97 % quelle que soit la cible (C = (1 - e)/U) : 97.00 %
- **PASS** - A2 tickets : la loterie rend 75 % (+-0,5 pt) : 75.019 % ; P(gain) 25.92 % ; gros lot 1 sur 100 000
- **PASS** - A2 machine : ~93,5 % (plancher du GRAND x250 compris) : 93.548 %
- **PASS** - A2 roulette : chaque pari rend 36/37 (le zero est la part de la Maison) : 97.297 % sur 49 paris (plein, chances simples, douzaines, colonnes)
- **PASS** - A1 aucun jeu ne rend 100 % ou plus : osselets prudent 97.00 %, osselets classique 97.00 %, osselets grand 97.00 %, osselets interdit 97.00 %, Icare 97.00 %, tickets 75.02 %, vingt-et-un (REF) 99.50 %, machine 93.55 %, roulette 97.30 %
- **PASS** - A5 cagnotte : rtp + recycle x (1 - rtp) < 1 partout (recycle borne < 1) : recycle nu 0.6, noye 0.85 ; pire total 99.92 %
- **PASS** - A6 Monte-Carlo osselets (ancestral) ~97 % (+-1 pt) : 97.22 % sur 400 000 jets
- **PASS** - A6 Monte-Carlo Icare (cible x2) ~97 % (+-1 pt) : 97.13 % sur 400 000 vols
- **PASS** - A6 Monte-Carlo 21 auto ~98,3 % (+-1 pt), par Faveur misee : 98.23 % sur 300 000 mains
- **PASS** - A7 recettes et limite montent avec l'ere record : ere 2 : 120081/h, limite 30000
- **PASS** - A8 le rang ne touche a aucune cote : osselets (4 rites), Icare, tickets, machine identiques de Habitue a Prince
- **PASS** - A8 limite x10 par titre ; salle commune et rafle a la base : base 75 000 000, Prince 750 000 000 000 ; auto max = base ; la mise de base rafle tout
- **PASS** - A8 la reputation suit la perte reelle (Icare, +-15 %) : 2226.9 h notees contre 2219.0 h perdues sur 300 000 vols (0.4 % d'ecart)

## Les osselets : quatre paris

| Rite | Gagne | Paire | Triple | Venus | Ecart-type (mises) | RTP |
|---|---|---|---|---|---|---|
| prudent | 62.0 % | x1.37 | x1.58 | x2.11 | 0.74 | 97.00 % |
| classique | 47.5 % | x1.54 | x2.05 | x3.08 | 1.02 | 97.00 % |
| grand | 32.0 % | x1.85 | x2.77 | x4.62 | 1.45 | 97.00 % |
| interdit | 18.0 % | x1.95 | x3.12 | x9.37 | 2.41 | 97.00 % |

Venus offre en plus un vol d'Icare a la mise du jet (compte dans le RTP).

## Le vingt-et-un mesure (1 000 000 mains par politique)

| Politique | RTP |
|---|---|
| naif | 92.90 % +- 0.10 % |
| base | 96.63 % +- 0.10 % |
| base + double | 98.19 % +- 0.11 % |
| base + double + refente | 98.86 % +- 0.11 % |

`BLACKJACK_RTP_REF` = 99.5 % (majore le jeu parfait), `BLACKJACK_RTP_AUTO` = 98.3 %.

## Tous les jeux, cagnotte comprise

| Jeu | RTP | + cagnotte (recycle 0.6) | + cagnotte (noye, 0.85) |
|---|---|---|---|
| osselets prudent | 97.00 % | 98.80 % | 99.55 % |
| osselets classique | 97.00 % | 98.80 % | 99.55 % |
| osselets grand | 97.00 % | 98.80 % | 99.55 % |
| osselets interdit | 97.00 % | 98.80 % | 99.55 % |
| Icare | 97.00 % | 98.80 % | 99.55 % |
| tickets | 75.02 % | 90.01 % | 96.25 % |
| vingt-et-un (REF) | 99.50 % | 99.80 % | 99.92 % |
| machine | 93.55 % | 97.42 % | 99.03 % |
| roulette | 97.30 % | 98.92 % | 99.59 % |

## Les titres de la Maison (lot 2)

Reputation = perte theorique (mise x avantage), en heures de recettes. Mises a la
limite de base, 3 % d'avantage : 0,0075 h par mise.

| Titre | Seuil (h) | Tables | Mises de base a 3 % | Cadeaux | Vols offerts |
|---|---|---|---|---|---|
| habitue | 0 | x1 | 0 | - | 0 |
| familier | 0.5 | x10 | 67 | colombier, mesure, autoOsselets, autoIcare | 3 |
| notable | 3 | x100 | 400 | echelle, coin, autoGratteux, autoVingtEtUn | 5 |
| mecene | 15 | x1 000 | 2 000 | interdit, solaires | 8 |
| prince | 40 | x10 000 | 5 334 | serres | 8 |

## Recettes de la Maison et limites de table (ere record)

| Ere | Recettes/h | Mise max | Benediction | Plafond cagnotte |
|---|---|---|---|---|
| 2 Abris | 120 081 | 30 000 | 60 040 | 5.00e+6 |
| 3 Clans | 178 441 | 44 000 | 89 220 | 5.00e+6 |
| 5 Hameau | 380 082 | 95 000 | 190 041 | 9.12e+6 |
| 8 Les Entrepôts | 1.12e+6 | 270 000 | 559 753 | 2.69e+7 |
| 10 Bourg des artisans | 2.25e+6 | 560 000 | 1.12e+6 | 5.39e+7 |
| 13 Cité commerciale | 6.23e+6 | 1.50e+6 | 3.11e+6 | 1.49e+8 |
| 15 Cité fortifiée | 1.21e+7 | 3.00e+6 | 6.06e+6 | 2.91e+8 |
| 18 Principauté marchande | 3.24e+7 | 8.10e+6 | 1.62e+7 | 7.78e+8 |
| 20 Royaume diplomate | 6.19e+7 | 1.50e+7 | 3.09e+7 | 1.49e+9 |
| 23 Empire naissant | 1.61e+8 | 4.00e+7 | 8.06e+7 | 3.87e+9 |
| 25 Empire | 3.03e+8 | 7.50e+7 | 1.52e+8 | 7.27e+9 |
| 27 Capitale monumentale | 5.67e+8 | 1.40e+8 | 2.84e+8 | 1.36e+10 |
| 29 Métropole | 1.09e+9 | 2.70e+8 | 5.47e+8 | 2.62e+10 |
| 30 Mégalopole | 1.54e+9 | 3.80e+8 | 7.72e+8 | 3.71e+10 |
| 32 Réseau continental | 3.08e+9 | 7.70e+8 | 1.54e+9 | 7.40e+10 |
| 34 Singularité | 6.15e+9 | 1.50e+9 | 3.07e+9 | 1.48e+11 |
| 45 Conscience planétaire | 4.56e+10 | 1.10e+10 | 2.28e+10 | 1.09e+12 |
| 60 Noosphère · V | 1.82e+12 | 4.50e+11 | 9.09e+11 | 4.37e+13 |
