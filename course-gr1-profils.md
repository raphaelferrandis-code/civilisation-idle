# Course au Grand Reset (et au-dela) — 10 profils de joueur

> Genere par `sim-10-profils.js` — budget 288 h virtuelles/profil, pas 30 s, plafond temps reel 3 min/profil.
> **Toutes les valeurs viennent des vraies formules du jeu** (`src/game/**`), pilotees par le moteur reel
> (tick -> crise -> effondrement -> ruines -> dynastie -> Grand Reset -> Mythes). Aucune formule recopiee.
> Effondrement FIDELE : on tient la Rupture pendant la croissance, on lache au moment voulu et la jauge
> monte d'elle-meme jusqu'a l'ouverture de la crise — on ne force jamais une jauge a la main pour declencher la chute.
> Un "—" = jalon **non atteint** dans le budget (de temps virtuel OU de temps reel de calcul). `(tronque)` = stoppe par le plafond temps reel.

## Jalons par profil (temps virtuel pour les atteindre)

| Profil | Grand Reset 1 | Arbre de Ruines complet | Acte I des Mythes | Acte II des Mythes | Acte III des Mythes | Tous les Mythes | Grand Reset 10 | Grand Reset 11 (Ragnarok) |
|---|---|---|---|---|---|---|---|---|
| 1. AFK assume | 3j 9h 30m | 10j 12h 4m | 3j 11h 40m | 3j 12h 3m | 3j 18h 9m | 3j 18h 11m | 10j 12h 10m | 10j 18h 33m |
| 2. Optimiseur de timing | 2j 13h 4m | 9j 0h 45m | 2j 15h 43m | 2j 16h 22m | 2j 22h 29m | 2j 22h 31m | 9j 5h 57m | 9j 12h 5m |
| 3. Architecte des Mythes | 2j 6h 57m | 7j 22h 26m | 2j 10h 38m | 2j 11h 34m | 2j 17h 41m | 2j 17h 43m | 8j 9h 24m | 8j 18h 31m |
| 4. Casse-cou | 2j 22h 52m | 10j 7h 41m | 3j 0h 47m | 3j 1h 30m | 3j 19h 37m | 3j 19h 39m | 10j 7h 43m | 10j 13h 37m |
| 5. Prudent | 2j 20h 33m | 10j 6h 58m | 2j 22h 26m | 2j 23h 4m | 3j 11h 11m | 3j 11h 13m | 10j 6h 58m | 10j 19h 56m |
| 6. Completionniste | 2j 5h 26m | 8j 3h 7m | 2j 7h 58m | 2j 8h 5m | 2j 20h 15m | 2j 20h 16m | 8j 12h 57m | 8j 22h 29m |
| 7. Theoricien (tenir puis saborder) | 2j 4h 53m | 8j 12h 33m | 2j 6h 43m | 2j 7h 31m | 2j 19h 40m | 2j 19h 42m | 8j 13h 45m | 8j 23h 0m |
| 8. Lecteur | 2j 21h 52m | 10j 4h 1m | 2j 23h 50m | 3j 0h 47m | 3j 12h 54m | 3j 12h 56m | 10j 4h 1m | 10j 10h 25m |
| 9. Chasseur de meta | 2j 4h 52m | 8j 17h 4m | 2j 6h 28m | 2j 7h 15m | 3j 1h 25m | 3j 1h 26m | 8j 17h 40m | 9j 2h 45m |
| 10. Relanceur compulsif | 2j 22h 2m | 10j 2h 40m | 3j 0h 1m | 3j 0h 42m | 3j 18h 49m | 3j 18h 50m | 10j 2h 46m | 10j 8h 40m |

## Synthese finale par profil

| Profil | Temps simule | Cycles | Dynasties | GR | Arbre | Mythes | Legitimite | Ruines | Mult global | Calcul reel |
|---|---|---|---|---|---|---|---|---|---|---|
| 1. AFK assume | 11j 8h 0m (tronque) | 251 | 634 | 11 | 100/100 | 14/14 | 23.6Qa | 63.0No | x1.41e64 | 181 s |
| 2. Optimiseur de timing | 9j 20h 32m (tronque) | 130 | 540 | 11 | 100/100 | 14/14 | 19.9B | 90.5Qi | x4.03e40 | 181 s |
| 3. Architecte des Mythes | 10j 4h 37m (tronque) | 124 | 559 | 11 | 100/100 | 14/14 | 10.5B | 0.0 | x1.79T | 180 s |
| 4. Casse-cou | 11j 0h 3m (tronque) | 199 | 594 | 11 | 100/100 | 14/14 | 56.5T | 82.5Sp | x5.45e52 | 180 s |
| 5. Prudent | 12j 0h 0m | 102 | 545 | 11 | 100/100 | 14/14 | 678.6M | 0.0 | x151.1B | 92 s |
| 6. Completionniste | 10j 17h 24m (tronque) | 140 | 573 | 11 | 100/100 | 14/14 | 85.7B | 5.00Sx | x8.28e43 | 181 s |
| 7. Theoricien (tenir puis saborder) | 10j 11h 46m (tronque) | 125 | 563 | 11 | 100/100 | 14/14 | 12.0B | 0.0 | x1.94T | 180 s |
| 8. Lecteur | 10j 23h 14m (tronque) | 256 | 634 | 11 | 100/100 | 14/14 | 34.4Qa | 116.4No | x4.98e64 | 180 s |
| 9. Chasseur de meta | 10j 22h 55m (tronque) | 146 | 580 | 11 | 100/100 | 14/14 | 211.7B | 256.2Sx | x9.13e46 | 181 s |
| 10. Relanceur compulsif | 10j 16h 51m (tronque) | 133 | 540 | 11 | 100/100 | 14/14 | 21.2B | 15.0Sx | x2.39e44 | 180 s |

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
| 1. AFK assume | 14/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Atlas, d'Icare, du Phénix, des Atrides, d'Antee, Ragnarok |
| 2. Optimiseur de timing | 14/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Atlas, d'Icare, du Phénix, des Atrides, d'Antee, Ragnarok |
| 3. Architecte des Mythes | 14/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Atlas, d'Icare, du Phénix, des Atrides, d'Antee, Ragnarok |
| 4. Casse-cou | 14/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Atlas, d'Icare, du Phénix, des Atrides, d'Antee, Ragnarok |
| 5. Prudent | 14/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Atlas, d'Icare, du Phénix, des Atrides, d'Antee, Ragnarok |
| 6. Completionniste | 14/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Atlas, d'Icare, du Phénix, des Atrides, d'Antee, Ragnarok |
| 7. Theoricien (tenir puis saborder) | 14/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Atlas, d'Icare, du Phénix, des Atrides, d'Antee, Ragnarok |
| 8. Lecteur | 14/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Atlas, d'Icare, du Phénix, des Atrides, d'Antee, Ragnarok |
| 9. Chasseur de meta | 14/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Atlas, d'Icare, du Phénix, des Atrides, d'Antee, Ragnarok |
| 10. Relanceur compulsif | 14/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Atlas, d'Icare, du Phénix, des Atrides, d'Antee, Ragnarok |

## Lecture
- **Effondrement (`ruinGain`)** recompense l'age du cycle (patience), la profondeur de population et la **preparation a l'effondrement** (`collapsePreparation`, plafonnee a 2.4). Les profils qui *tiennent puis sabordent* (Theoricien, Chasseur de meta, Prudent) doivent donc gagner plus de Ruines par cycle que ceux qui spamment (Casse-cou, Relanceur).
- **Legitimite (`legitimacyGain`)** = floor((ruines/160)^0.5 + cycles/12 + floor(dynasties/5)), gagnee en **fondant une dynastie** (seuil de ruines croissant ×1.4/fondation). Le GR1 exige 300 legitimite + l'upgrade `grand_reset`.
- **Grand Reset** : cout en legitimite ×2 par GR (GR2 : 600, GR3 : 1200…), remet `cycles` a 0 (donc le terme cycles/12 se reconstruit a chaque boucle). A partir du GR3, chaque GR exige un Mythe complete de plus ; le GR11 exige l'heritage Ragnarok (tous les Mythes).
- **Le vrai mur n'est pas le temps : c'est l'Acte I des Mythes.** Tant que les 5 Mythes de l'Acte I ne sont pas TOUS completes, l'Acte II reste verrouille, donc l'Acte III, le Ragnarok et le GR11 le sont aussi ; et le gate des GR profonds (GR5 = 3 Mythes … GR10 = 8) est sature. Un pilote mecanique ne boucle qu'une partie de l'Acte I (objectifs sur-mesure : migration d'Enee, declin d'Hephaistos, equilibre de l'Age d'Or…), d'ou les **—** sur Acte II+/GR10/GR11. C'est une mesure de la difficulte de ces Mythes pour un jeu "automatique", a confronter au ressenti humain.
- Un jalon **—** peut aussi venir d'un budget temps reel court : relancer avec `--maxreal` plus grand pour distinguer "trop lent" de "pas eu le temps de calculer".

## Limites honnetes
- Le pilote de Mythes joue agressivement mais n'egale pas un humain : un Mythe non complete signale un objectif non atteint *par le bot*, pas forcement un Mythe impossible (chaque `onCollapse()` a une condition sur-mesure, cf. `data/myths.js`).
- Le pas de 30 s rend les temps absolus approximatifs (±1 tick par transition) ; le **classement** entre profils est robuste.
