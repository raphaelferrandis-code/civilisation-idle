# Course au Grand Reset (et au-dela) — 10 profils de joueur

> Genere par `sim-10-profils.js` — budget 4000 h virtuelles/profil, pas 5 s, plafond temps reel 16 min/profil.
> **Toutes les valeurs viennent des vraies formules du jeu** (`src/game/**`), pilotees par le moteur reel
> (tick -> crise -> effondrement -> ruines -> dynastie -> Grand Reset -> Mythes). Aucune formule recopiee.
> Effondrement FIDELE : on tient la Rupture pendant la croissance, on lache au moment voulu et la jauge
> monte d'elle-meme jusqu'a l'ouverture de la crise — on ne force jamais une jauge a la main pour declencher la chute.
> Un "—" = jalon **non atteint** dans le budget (de temps virtuel OU de temps reel de calcul). `(tronque)` = stoppe par le plafond temps reel.

## Jalons par profil (temps virtuel pour les atteindre)

| Profil | Grand Reset 1 | Arbre de Ruines complet | Acte I des Mythes | Acte II des Mythes | Acte III des Mythes | Tous les Mythes | Grand Reset 10 | Grand Reset 11 (Ragnarok) |
|---|---|---|---|---|---|---|---|---|
| 7. Theoricien (tenir puis saborder) | 1j 15h 6m | 8j 2h 48m | 2j 1h 11m | 2j 1h 15m | — | — | 6j 8h 8m | — |

## Synthese finale par profil

| Profil | Temps simule | Cycles | Dynasties | GR | Arbre | Mythes | Legitimite | Ruines | Mult global | Calcul reel |
|---|---|---|---|---|---|---|---|---|---|---|
| 7. Theoricien (tenir puis saborder) | 10j 23h 54m | 173 | 428 | 10 | 100/100 | 12/14 | 17.2T | 0.0 | x988.5T | 242 s |

## Definition des profils (les "boutons" de comportement)

| Profil | Cycle vise | Gere la Rupture | Sabotage | Intention |
|---|---|---|---|---|
| 7. Theoricien (tenir puis saborder) | 15m 0s | oui (<0.75) | palier 2 | Plafond de skill : longue croissance geree + sabotage MAX avant la chute. |

## Mythes — detail par profil

> Gating dur : l'**Acte II** exige TOUT l'Acte I (5 Mythes) complete ; l'Acte III exige tout l'Acte II (3) ; le **Ragnarok / GR11** exige TOUS les Mythes principaux (13). Le gate des Grand Resets monte aussi : GR3 = 1 Mythe, GR4 = 2, … GR10 = 8.

| Profil | Mythes completes (bot) | Lesquels |
|---|---|---|
| 7. Theoricien (tenir puis saborder) | 12/14 | du Chaos, de Prométhée, d'Énée, de Cadmos, d'Héphaïstos, de Sisyphe, de Babel, de l'Âge d'Or, d'Icare, du Phénix, des Atrides, d'Antee |

## Lecture
- **Effondrement (`ruinGain`)** recompense l'age du cycle (patience), la profondeur de population et la **preparation a l'effondrement** (`collapsePreparation`, plafonnee a 2.4). Les profils qui *tiennent puis sabordent* (Theoricien, Chasseur de meta, Prudent) doivent donc gagner plus de Ruines par cycle que ceux qui spamment (Casse-cou, Relanceur).
- **Legitimite (`legitimacyGain`)** = floor((ruines/160)^0.5 + cycles/12 + floor(dynasties/5)), gagnee en **fondant une dynastie** (seuil de ruines croissant ×1.4/fondation). Le GR1 exige 300 legitimite + l'upgrade `grand_reset`.
- **Grand Reset** : cout en legitimite ×2 par GR (GR2 : 600, GR3 : 1200…), remet `cycles` a 0 (donc le terme cycles/12 se reconstruit a chaque boucle). A partir du GR3, chaque GR exige un Mythe complete de plus ; le GR11 exige l'heritage Ragnarok (tous les Mythes).
- **Le vrai mur n'est pas le temps : c'est l'Acte I des Mythes.** Tant que les 5 Mythes de l'Acte I ne sont pas TOUS completes, l'Acte II reste verrouille, donc l'Acte III, le Ragnarok et le GR11 le sont aussi ; et le gate des GR profonds (GR5 = 3 Mythes … GR10 = 8) est sature. Un pilote mecanique ne boucle qu'une partie de l'Acte I (objectifs sur-mesure : migration d'Enee, declin d'Hephaistos, equilibre de l'Age d'Or…), d'ou les **—** sur Acte II+/GR10/GR11. C'est une mesure de la difficulte de ces Mythes pour un jeu "automatique", a confronter au ressenti humain.
- Un jalon **—** peut aussi venir d'un budget temps reel court : relancer avec `--maxreal` plus grand pour distinguer "trop lent" de "pas eu le temps de calculer".

## Limites honnetes
- Le pilote de Mythes joue agressivement mais n'egale pas un humain : un Mythe non complete signale un objectif non atteint *par le bot*, pas forcement un Mythe impossible (chaque `onCollapse()` a une condition sur-mesure, cf. `data/myths.js`).
- Le pas de 5 s rend les temps absolus approximatifs (±1 tick par transition) ; le **classement** entre profils est robuste.
