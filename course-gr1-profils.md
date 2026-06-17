# Course au Grand Reset (et au-dela) — 10 profils de joueur

> Genere par `sim-10-profils.js` — budget 600 h virtuelles/profil, pas 5 s, plafond temps reel 6 min/profil.
> **Toutes les valeurs viennent des vraies formules du jeu** (`src/game/**`), pilotees par le moteur reel
> (tick -> crise -> effondrement -> ruines -> dynastie -> Grand Reset -> Mythes). Aucune formule recopiee.
> Effondrement FIDELE : on tient la Rupture pendant la croissance, on lache au moment voulu et la jauge
> monte d'elle-meme jusqu'a l'ouverture de la crise — on ne force jamais une jauge a la main pour declencher la chute.
> Un "—" = jalon **non atteint** dans le budget (de temps virtuel OU de temps reel de calcul). `(tronque)` = stoppe par le plafond temps reel.

## Jalons par profil (temps virtuel pour les atteindre)

| Profil | Grand Reset 1 | Arbre de Ruines complet | Acte I des Mythes | Acte II des Mythes | Acte III des Mythes | Tous les Mythes | Grand Reset 10 | Grand Reset 11 (Ragnarok) |
|---|---|---|---|---|---|---|---|---|
| 1. AFK assume | 1j 18h 25m | 7j 12h 25m | 2j 1h 21m | 2j 2h 17m | — | — | 5j 20h 9m | — |
| 2. Optimiseur de timing | 1j 16h 1m | 7j 5h 45m | 2j 0h 30m | 2j 1h 25m | — | — | 5j 22h 49m | — |
| 3. Architecte des Mythes | 1j 15h 10m | 7j 5h 0m | 2j 1h 2m | 2j 1h 59m | — | — | 5j 10h 23m | — |
| 4. Casse-cou | 1j 18h 36m | 8j 21h 27m | 2j 4h 38m | 2j 5h 30m | — | — | 7j 5h 32m | — |
| 5. Prudent | 1j 12h 32m | 8j 4h 12m | 1j 20h 51m | 1j 21h 45m | — | — | 6j 9h 57m | — |
| 6. Completionniste | 1j 15h 10m | 8j 6h 58m | 1j 23h 20m | 2j 0h 18m | — | — | 6j 12h 15m | — |
| 7. Theoricien (tenir puis saborder) | 1j 14h 35m | 7j 11h 14m | 1j 21h 46m | 1j 22h 37m | — | — | 5j 16h 38m | — |
| 8. Lecteur | 1j 17h 36m | 5j 6h 14m | 1j 23h 33m | 2j 0h 29m | — | — | 6j 14h 13m | — |
| 9. Chasseur de meta | 1j 15h 17m | 7j 16h 32m | 2j 1h 0m | 2j 1h 57m | — | — | 5j 21h 47m | — |
| 10. Relanceur compulsif | 1j 18h 36m | 8j 1h 7m | 2j 0h 40m | 2j 1h 34m | — | — | 6j 9h 23m | — |

## Synthese finale par profil

| Profil | Temps simule | Cycles | Dynasties | GR | Arbre | Mythes | Legitimite | Ruines | Mult global | Calcul reel |
|---|---|---|---|---|---|---|---|---|---|---|
| 1. AFK assume | 7j 22h 17m (tronque) | 254 | 514 | 10 | 100/100 | 12/14 | 25.3Qa | 6.45Dc | x2.37e67 | 361 s |
| 2. Optimiseur de timing | 8j 0h 15m (tronque) | 170 | 421 | 10 | 100/100 | 12/14 | 4.15T | 6.84Sp | x8.32e49 | 361 s |
| 3. Architecte des Mythes | 8j 22h 27m (tronque) | 147 | 390 | 10 | 100/100 | 12/14 | 542.2B | 0.0 | x51.6T | 360 s |
| 4. Casse-cou | 9j 5h 28m (tronque) | 219 | 454 | 10 | 100/100 | 12/14 | 642.0T | 8.74Oc | x3.18e56 | 360 s |
| 5. Prudent | 9j 22h 17m (tronque) | 141 | 400 | 10 | 100/100 | 12/14 | 238.6B | 8.85Sx | x2.72e44 | 361 s |
| 6. Completionniste | 9j 23h 41m (tronque) | 146 | 408 | 10 | 100/100 | 12/14 | 437.4B | 0.0 | x54.8T | 360 s |
| 7. Theoricien (tenir puis saborder) | 9j 3h 12m (tronque) | 142 | 380 | 10 | 100/100 | 12/14 | 249.7B | 0.0 | x39.1T | 360 s |
| 8. Lecteur | 10j 16h 21m (tronque) | 192 | 447 | 10 | 100/100 | 12/14 | 120.0T | 124.5Oc | x8.19e57 | 361 s |
| 9. Chasseur de meta | 11j 22h 41m | 201 | 453 | 10 | 100/100 | 12/14 | 784.0T | 0.0 | x16.7Qa | 300 s |
| 10. Relanceur compulsif | 8j 16h 17m (tronque) | 422 | 595 | 10 | 100/100 | 12/14 | 68.2Sx | 1.35e46 | x9.74e91 | 361 s |

## Definition des profils (les "boutons" de comportement)

| Profil | Cycle vise | Gere la Rupture | Sabotage | Intention |
|---|---|---|---|---|
| 1. AFK assume | 0m 0s | non | non | Laisse tourner. Achete un peu, ne gere jamais la crise, s'effondre des que ca casse. |
| 2. Optimiseur de timing | 10m 0s | oui (<0.8) | non | Tient la Rupture, effondre a un age propre (~10 min), sans sabotage. |
| 3. Architecte des Mythes | 12m 0s | oui (<0.8) | palier 1 | Identite POST-GR1 (sequencage des Mythes). Avant GR1 : jeu generique solide. |
| 4. Casse-cou | 2m 0s | non | non | Cycles tres courts (~2 min), pas de gestion, spam d'effondrements. |
| 5. Prudent | 20m 0s | oui (<0.7) | palier 1 | Cycles longs (~20 min), gestion lourde, petit sabotage. Grosses cites, peu de risque. |
| 6. Completionniste | 12m 0s | oui (<0.8) | palier 1 | Achete tout, complete l'arbre avant de fonder, cycles moyens (~12 min). |
| 7. Theoricien (tenir puis saborder) | 15m 0s | oui (<0.75) | palier 2 | Plafond de skill : longue croissance geree + sabotage MAX avant la chute. |
| 8. Lecteur | 30m 0s | oui (<0.85) | non | Tres lent : cycles tres longs (~30 min), achats minimaux (lit le lore). |
| 9. Chasseur de meta | 14m 0s | oui (<0.78) | palier 2 | Optimise la meta. Pre-GR1 : jeu generique fort, sabotage modere. |
| 10. Relanceur compulsif | 3m 0s | non | non | Relance sans cesse : cycles tres courts (~3 min), pas de sabotage. |

## Mythes — detail par profil

> Gating dur : l'**Acte II** exige TOUT l'Acte I (5 Mythes) complete ; l'Acte III exige tout l'Acte II (3) ; le **Ragnarok / GR11** exige TOUS les Mythes principaux (13). Le gate des Grand Resets monte aussi : GR3 = 1 Mythe, GR4 = 2, … GR10 = 8.

| Profil | Mythes completes (bot) | Lesquels |
|---|---|---|
| 1. AFK assume | 12/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Icare, du Phénix, des Atrides, d'Antee |
| 2. Optimiseur de timing | 12/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Icare, du Phénix, des Atrides, d'Antee |
| 3. Architecte des Mythes | 12/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Icare, du Phénix, des Atrides, d'Antee |
| 4. Casse-cou | 12/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Icare, du Phénix, des Atrides, d'Antee |
| 5. Prudent | 12/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Icare, du Phénix, des Atrides, d'Antee |
| 6. Completionniste | 12/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Icare, du Phénix, des Atrides, d'Antee |
| 7. Theoricien (tenir puis saborder) | 12/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Icare, du Phénix, des Atrides, d'Antee |
| 8. Lecteur | 12/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Icare, du Phénix, des Atrides, d'Antee |
| 9. Chasseur de meta | 12/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Icare, du Phénix, des Atrides, d'Antee |
| 10. Relanceur compulsif | 12/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Icare, du Phénix, des Atrides, d'Antee |

## Lecture
- **Effondrement (`ruinGain`)** recompense l'age du cycle (patience), la profondeur de population et la **preparation a l'effondrement** (`collapsePreparation`, plafonnee a 2.4). Les profils qui *tiennent puis sabordent* (Theoricien, Chasseur de meta, Prudent) doivent donc gagner plus de Ruines par cycle que ceux qui spamment (Casse-cou, Relanceur).
- **Legitimite (`legitimacyGain`)** = floor((ruines/160)^0.5 + cycles/12 + floor(dynasties/5)), gagnee en **fondant une dynastie** (seuil de ruines croissant ×1.4/fondation). Le GR1 exige 300 legitimite + l'upgrade `grand_reset`.
- **Grand Reset** : cout en legitimite ×2 par GR (GR2 : 600, GR3 : 1200…), remet `cycles` a 0 (donc le terme cycles/12 se reconstruit a chaque boucle). A partir du GR3, chaque GR exige un Mythe complete de plus ; le GR11 exige l'heritage Ragnarok (tous les Mythes).
- **Le vrai mur n'est pas le temps : c'est l'Acte I des Mythes.** Tant que les 5 Mythes de l'Acte I ne sont pas TOUS completes, l'Acte II reste verrouille, donc l'Acte III, le Ragnarok et le GR11 le sont aussi ; et le gate des GR profonds (GR5 = 3 Mythes … GR10 = 8) est sature. Un pilote mecanique ne boucle qu'une partie de l'Acte I (objectifs sur-mesure : migration d'Enee, declin d'Hephaistos, equilibre de l'Age d'Or…), d'ou les **—** sur Acte II+/GR10/GR11. C'est une mesure de la difficulte de ces Mythes pour un jeu "automatique", a confronter au ressenti humain.
- Un jalon **—** peut aussi venir d'un budget temps reel court : relancer avec `--maxreal` plus grand pour distinguer "trop lent" de "pas eu le temps de calculer".

## Limites honnetes
- Le pilote de Mythes joue agressivement mais n'egale pas un humain : un Mythe non complete signale un objectif non atteint *par le bot*, pas forcement un Mythe impossible (chaque `onCollapse()` a une condition sur-mesure, cf. `data/myths.js`).
- Le pas de 5 s rend les temps absolus approximatifs (±1 tick par transition) ; le **classement** entre profils est robuste.
