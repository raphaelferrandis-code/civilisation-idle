# Banc d'essai — formules de legitimacyGain (course au GR1)

> Budget 100h virtuelles/profil (au-dela = INATTEIGNABLE). Pas de simulation 20s (tick grossi pour le debit).
> Objectif : que le STYLE de jeu change la vitesse de GR1, avec un optimum 'tenir puis saborder',
> sans creer de mur (INATTEIGNABLE) pour les styles raisonnables.

## Temps jusqu'au GR1 par profil et par variante

| Profil | actuel | qualite | prime-douce | prime-forte |
|---|---|---|---|---|
| 1. AFK assume | 2j 1h 11m | INATTEIGNABLE | INATTEIGNABLE | INATTEIGNABLE |
| 2. Optimiseur de timing | 2j 1h 0m | INATTEIGNABLE | 3j 23h 15m | INATTEIGNABLE |
| 3. Architecte des Mythes | 2j 1h 0m | INATTEIGNABLE | 3j 23h 15m | INATTEIGNABLE |
| 4. Casse-cou | 2j 1h 13m | INATTEIGNABLE | 4j 3h 6m | INATTEIGNABLE |
| 5. Prudent | 2j 4h 0m | 3j 23h 43m | 3j 22h 24m | INATTEIGNABLE |
| 6. Completionniste | 2j 0h 57m | INATTEIGNABLE | 3j 23h 26m | INATTEIGNABLE |
| 7. Theoricien | 2j 1h 15m | 2j 11h 38m | 2j 15h 23m | 2j 17h 52m |
| 8. Lecteur | 2j 5h 20m | INATTEIGNABLE | INATTEIGNABLE | INATTEIGNABLE |
| 9. Chasseur de meta | 2j 1h 1m | INATTEIGNABLE | 3j 23h 21m | INATTEIGNABLE |
| 10. Relanceur compulsif | 2j 1h 13m | INATTEIGNABLE | 4j 3h 6m | INATTEIGNABLE |

## Dispersion et lisibilite du choix de jeu

| Variante | Finissent | Plus rapide | Plus lent (fini) | Theoricien (sabotage) | Verdict |
|---|---|---|---|---|---|
| actuel | 10/10 | Completionnist (2j0h) | Lecteur (2j5h) | rang 8/10 | Aucun ecart : le style n'a aucun impact. A remplacer. |
| qualite | 2/10 | Theoricien (2j11h) | Prudent (3j23h) | rang 1/2 | Trop punitif : 8/10 au mur. Bonne direction, mauvais dosage. |
| prime-douce | 8/10 | Theoricien (2j15h) | Relanceur comp (4j3h) | rang 1/8 | BON COMPROMIS : sabotage clairement 1er, spam le + lent, 8/10 finissent. |
| prime-forte | 1/10 | Theoricien (2j17h) | Theoricien (2j17h) | rang 1/1 | Strategie unique : seul le sabotage survit. A ecarter. |

## Parametres des variantes

| Variante | baseExp | cycleDiv | prepCoef | prepExp |
|---|---|---|---|---|
| actuel | 0.5 | 12 | 0 | 1  (temoin historique) |
| qualite | 0.62 | 18 | 0 | 1 |
| prime-douce | 0.55 | 16 | 1.2 | 1.0 |
| prime-forte | 0.6 | 24 | 2.0 | 1.4 |

## Lecture

- La formule actuelle aplatit tous les styles (~2j01-2j05) : aucune optimisation possible, le joueur expert ne va pas plus vite.
- Le levier decisif est la **prime de preparation** (prepCoef) : recompense `collapsePreparation` x echelle de la cite, donc le coup 'tenir gros puis saborder'.
- **prime-douce** est le meilleur reglage teste : le Theoricien (sabotage optimal) est 1er et loin devant, le peloton 'joueur normal' suit, le spam (Casse-cou/Relanceur) ferme la marche. Il cree un vrai gradient de skill.
- Restent 2 profils au mur sous prime-douce : l'AFK pur et le Lecteur ultra-lent. Si tu veux qu'ils finissent (tres lentement) plutot qu'inatteignable, il faut adoucir legerement cycleDiv (16->14) ou abaisser le cout de l'upgrade grand_reset.
- ATTENTION fidelite : tick grossi a 20s pour le debit -> les temps absolus sont approximatifs, mais le CLASSEMENT entre profils/variantes est robuste.
