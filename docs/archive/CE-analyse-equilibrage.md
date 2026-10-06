# Civilisation Effondrement — Analyse d'équilibrage approfondie

> Basée sur la lecture des vraies formules (`src/game/core/mechanics.js`, `balance.js`, `world.js`, `buildings.js`, `upgrades.js`, `myths.js`) et sur des simulations relancées avec un budget de temps réel plus large que ton `balance-summary.md` actuel (qui était tronqué à 2 min). Scénarios : **optimisé** (3,5 min réelles → GR5 atteint), **idle** (plancher sans action).

---

## Verdict en une page

**Ce qui est sain.** Le gros chantier de rééquilibrage que tu as mené a payé : la **dégénérescence d'effondrement** décrite dans ton ancien `balance-summary.md` (cité ineffondrable / effondrement à gain nul) **n'apparaît plus** — le bot optimisé traverse maintenant GR1→GR5 et l'ère 16 sans se bloquer. La cible de pression **monte bien avec l'échelle** (0,20 early → 0,86 mid → 1,61 late, donc la Rupture peut toujours déclencher), l'Usure reste une deadline garantie (mitigation plafonnée à 5), les courbes de coûts des bâtiments sont propres, et les Mythes sont **réellement différenciés** (vrais gates vs multiplicateurs, mesurés).

**Le problème central.** Tout l'intérêt du jeu — Mythes, Actes I-III, automatisation, jeu idle — est **verrouillé derrière le premier Grand Reset, atteint en ~44 h de temps virtuel actif.** Et avant GR1, il n'y a **aucune progression idle** : laisser tourner ne fait rien. C'est la tension la plus profonde, surtout pour un jeu qui se présente comme idle/incrémental.

**Les 3 corrections prioritaires :**
1. **Rapprocher GR1** (abaisser le coût en légitimité et/ou booster le gain de légitimité par dynastie).
2. **Découpler une automatisation minimale de GR1** pour qu'il y ait de la progression hors-ligne dès le début.
3. **Adoucir le mur d'ère 4→5** (ou, ce qui revient au même, faire arriver le premier multiplicateur de prestige plus tôt).

---

## 1. La courbe de progression réelle (mesurée)

Cadence du scénario optimisé (temps virtuel pour atteindre chaque jalon) :

| Jalon | Temps virtuel | Commentaire |
|---|---|---|
| Ère 1 (Grand Feu) | 1 min 20 | — |
| Ère 2 (Abris) | 3 min 20 | — |
| Ère 3 (Clans) | 14 min | — |
| Ère 4 (Maîtrise du bois) | 50 min | fin de la phase fluide |
| **Ère 5 (Hameau)** | **10 h 03** | **← MUR (×12 de temps d'un coup)** |
| Dynastie 1 | ~9–10 h | 1er prestige, coïncide avec le mur |
| Dynastie 10 | 1 j 17 h | légitimité ≈ 74 / 300 |
| **Grand Reset 1** | **1 j 20 h (~44 h)** | **débloque Mythes + Actes + automatisation** |
| Ères 12 → 20 | 2 j 06 h → 3 j 01 h | ça déroule |
| **Ères 21 → 27** | **3 j 01 h 41 → 3 j 01 h 48** | **7 ères en 7 minutes** |
| Palier ruines 20 (dogme) | 4 j 04 h | — |

**Lecture : le jeu a deux régimes séparés par GR1.**

- **Avant GR1 (0 → 44 h)** : démarrage fluide (ères 0-4 en moins d'une heure), puis **mur sec à l'ère 5** suivi d'un long grind de dynasties pour amasser 300 légitimité. Pas d'automatisation, donc tout est manuel.
- **Après GR1 (44 h+)** : les multiplicateurs composent, les ères défilent **en minutes**, le contenu (Mythes/Actes) s'ouvre enfin.

Le pacing **s'inverse** : trop lent et exigeant avant GR1, quasi-trivial après. Tout le travail à faire consiste à rapprocher ces deux régimes.

---

## 2. Friction #1 — Le verrou du GR1

C'est LE point de blocage. La cascade de gating :

```
GR1  ⟵ upgrade « grand_reset » coûte 300 légitimité
     ⟵ légitimité gagnée seulement en FONDANT des dynasties (~17 fondations pour 300)
     ⟵ chaque fondation exige 120 × 1,4^n ruines  ET  remet la cité à zéro (resetCivilization)
     ⟵ les ruines s'accumulent lentement, à chaque effondrement
```

Et derrière GR1 se trouvent : **les Mythes**, donc **les Actes I-III**, donc **GR2-11** (gating doux : GR3 = 1 mythe, … GR10 = 8 mythes), donc **l'automatisation** (Héphaïstos = achat auto, Phénix = effondrement auto). Autrement dit, **80 % du contenu du jeu est en aval d'un seul verrou à 44 h.**

**Pourquoi 44 h.** Le gain par fondation est `floor( √(ruins/160) + cycles/12 + ⌊dynasties/5⌋ )`. Les trois termes sont modestes au début :

| Contexte de fondation | Légitimité gagnée |
|---|---|
| ruins 120, cycle 20, dyn 0 | **+2** |
| ruins 1 000, cycle 60, dyn 8 | +8 |
| ruins 50 000, cycle 200, dyn 20 | +38 |

Comme chaque fondation **remet la cité à zéro** et qu'il faut reconstituer un seuil de ruines **croissant** (×1,4 par fondation depuis le dernier GR), les ~17 fondations nécessaires pour 300 légitimité s'étalent sur presque deux jours.

**Leviers (du plus doux au plus fort) :**
- **Coût du GR1** — `upgrades.js`, upgrade `grand_reset` : `cost: { legitimacy: 300 }` → **120-150**. Le plus direct, n'affecte que le premier seuil (GR2+ restent à 600, 1200…). Ça peut diviser le temps de GR1 par ~2.
- **Gain de légitimité** — `mechanics.js`, `legitimacyGain()` : le terme `√(ruins/160)` est trop plat au début. Essaie `√(ruins/100)` ou ajoute un **petit plancher par fondation** (`+1` garanti) pour que les toutes premières dynasties ne rapportent pas seulement +2.
- **Seuil de fondation** — `balance.js`, `DYNASTY_BASE_RUINS=120` / `DYNASTY_COST_GROWTH=1,4` : la croissance 1,4 compose vite (dynastie 10 = 2 479 ruines). Passer à **1,32-1,35** étale moins brutalement le grind sans rouvrir la porte au spam de fondations.

> Objectif raisonnable : **GR1 vers 4-8 h** de jeu actif plutôt que 44 h. Ça reste un sommet mérité, mais le joueur touche le « vrai » jeu (Mythes) dans sa première grosse session au lieu de sa 5e.

---

## 3. Friction #2 — Le mur d'ère 4→5

Les seuils d'ère sont en population, et la population est **remise à zéro à chaque effondrement** : pour passer une ère, il faut qu'**un seul cycle** atteigne le seuil.

| Ère | Seuil pop | ×/préc | Temps mesuré |
|---|---|---|---|
| 3 Clans | 56 K | ×14 | 14 min |
| 4 Maîtrise du bois | 723 K | ×12,8 | 50 min |
| **5 Hameau** | **8,7 M** | **×12** | **10 h** |

Le saut absolu (723 K → 8,7 M) dépasse ce qu'une économie early **sans boost de prestige** peut produire en un cycle. Le joueur doit donc grinder des cycles pour accumuler assez de ruines (→ multiplicateur) qu'un seul cycle franchisse 8,7 M. D'où les 10 h.

La population est de loin la ressource la plus lente : **0,04 à 1,8 hab/bâtiment**, contre des milliers/millions pour or et savoir. C'est voulu (la pop est l'axe de pacing des ères), mais ça rend le mur d'autant plus raide quand le multiplicateur est encore à ×1,1.

**Ce mur et le verrou GR1 sont le même problème vu deux fois : le premier multiplicateur de prestige arrive trop tard pour porter le joueur à travers les ères 5-7.** Rapprocher l'économie de dynastie (Friction #1) dissout en grande partie ce mur.

**Leviers complémentaires :**
- **Courbe d'ères** — `world.js`, `eraPopulationThreshold` : l'exposant `0,9` dans `10^(1 + 28·(i/28)^0,9)` rend les premières ères les plus raides en log (ère 0→1 = ×24,9 !). Monter vers **0,93-0,95** aplatit les ères 1-8 (au prix d'ères tardives un peu plus longues — sans gravité vu qu'elles défilent en minutes post-GR1).
- **Production de population early** — un petit bonus de pop sur les 2-3 premiers bâtiments, ou un upgrade de ruines précoce « +X% population » accessible avant l'ère 5.

---

## 4. Friction #3 — Aucune progression idle avant GR1

Scénario idle (zéro action, save vierge) : **bloqué à l'ère 1 (pop 248) indéfiniment**, 1477 cycles à vide. Logique : depuis un save neuf, **aucune automatisation n'est débloquée**, et les automatisations (auto-achat Héphaïstos, auto-effondrement Phénix) sont **derrière GR1**.

Conséquence : pour un jeu **idle/incrémental**, il n'y a **pas de gain hors-ligne pendant les ~44 premières heures** de jeu actif. Le joueur qui ferme l'onglet ne retrouve rien. C'est le décalage le plus contre-intuitif du design actuel.

**Leviers :**
- **Une automatisation minimale très tôt**, indépendante des Mythes : un upgrade de ruines bon marché (quelques ruines) qui débloque un **auto-achat du bâtiment le moins cher** ou un **auto-effondrement** basique. Ça donne une boucle idle dès la 1re heure.
- Ou un **gain hors-ligne explicite** (accumulation des ressources au taux courant pendant l'absence, plafonné), même partiel, dès le départ.

> Tu n'es pas obligé de tout ouvrir : juste assez d'idle pour que fermer le jeu et revenir soit récompensé avant GR1.

---

## 5. L'explosion post-GR1 (le revers)

Une fois GR1 passé, le pacing déraille dans l'autre sens : **ères 21 → 27 franchies en 7 minutes**. Les multiplicateurs `2^GR × ruins^0,62 × legit^0,7 × …` composent, et comme la pop suit le multiplicateur **global** (pas sa racine), un seul cycle balaie une dizaine d'ères.

Ce n'est pas grave en soi (c'est le « number goes up » de fin de partie, et tu as ~265 sous-ères transcendantes cosmétiques pour absorber ça), mais ça souligne que **l'effort de pacing doit se concentrer avant GR1**, pas après. Si tu rapproches GR1, surveille juste que les Actes II-III ne s'enchaînent pas instantanément — le gating doux par Mythes (GR3=1, GR4=2…) joue déjà ce rôle de frein.

---

## 6. Ce qui est sain (à ne PAS toucher)

- **Effondrement de fin de partie : corrigé.** Le bot atteint GR5/ère 16 sans se bloquer. La cible de pression scale (0,20 → 0,86 → 1,61), l'Usure reste inexorable (mitigation plafond 5), les stabilisants gardent un effet à toutes les échelles.
- **Mythes : bien différenciés.** Mesures `bench-myths` : Chaos ×1,46 global, Énée ×2, Icare ×5, Atrides ×2, Sisyphe coûts ×0,57, Âge d'Or usure ×0,80 ; et 9/14 débloquent une vraie mécanique persistante (épitaphes, adjacence, automates, surchauffe, script, ruines actives, GR11). Peu de mythes « cosmétiques ». Les seuls candidats à enrichir s'ils paraissent fades : Cadmos (×1,03 passif) et Babel (effet purement mécanique).
- **Courbes de coûts.** Scaling propre par catégorie (cité 1,18-1,27 ; savoir 1,28-1,41 ; infra 1,33-1,46) : l'infra coûte cher et stabilise, le savoir explose en valeur, la cité reste accessible. Cohérent.
- **Tension food/or vs pop.** Astucieux : pop/savoir/infra suivent le multiplicateur **complet**, mais food et or suivent sa **racine carrée** → l'écart pop-vs-nourriture se creuse mécaniquement et nourrit la Rupture (scarcity). C'est un bon moteur de pression auto-entretenu.

---

## 7. Tableau de réglages proposés

| Cible | Fichier / constante | Actuel | Piste | Effet attendu |
|---|---|---|---|---|
| **GR1 trop loin** | `upgrades.js` → `grand_reset.cost.legitimacy` | 300 | **120-150** | GR1 ~2× plus tôt ; n'affecte pas GR2+ |
| Légitimité trop plate early | `mechanics.js` → `legitimacyGain()` base `√(ruins/160)` | /160, +0 | `√(ruins/100)` **+ plancher `+1`/fondation** | premières dynasties moins anémiques |
| Grind de fondation | `balance.js` → `DYNASTY_COST_GROWTH` | 1,40 | **1,32-1,35** | seuils moins explosifs, sans rouvrir le spam |
| Mur d'ère 1-8 | `world.js` → exposant `0,9` | 0,9 | **0,93-0,95** | aplatit les premières ères (mur 4→5 inclus) |
| Pas d'idle early | nouvel upgrade ruines bon marché | — | auto-achat OU auto-effondrement basique, hors-Mythes | boucle idle dès la 1re heure |
| (option) Pop early | `buildings.js` → `pop` des 2-3 premiers | 0,18 / 0,07 / 0,06 | léger + | franchir l'ère 5 sans dépendre du prestige |

> Ne touche **qu'un ou deux leviers à la fois**, puis relance `simulate-ce.js --maxreal=8`+ et compare `dynasty_1` / `gr_1` dans `balance-summary.md`. Les leviers GR1 et légitimité agissent sur le **même** symptôme — combine-les avec parcimonie pour ne pas sur-corriger.

---

## 8. Limites de cette analyse

- **Le bot n'est pas un humain optimal.** Il joue agressivement (achat best-first, fonde, GR), mais plusieurs objectifs de Mythes doivent être atteints *avant* l'effondrement (Sisyphe 50 000 trésor, Icare 5 000 infra, Âge d'Or pop<300…) ; un « échec » de Mythe en sim ≠ Mythe impossible, juste non atteint par le pilote. Un joueur peut faire mieux sur ces conditions fines.
- **Temps virtuel ≠ temps réel ressenti.** Les 44 h de GR1 sont du temps de jeu *actif*. En idle pur, c'est pire (rien ne progresse) — d'où la priorité #3.
- **Sim tronquée.** GR10/GR11/tous-les-Mythes restent « non atteints » faute de temps de calcul (pas par design). Pour horodater la vraie fin de partie, relance avec `--maxreal=30`+.
- Les « cibles de pacing » de ton `balance-summary.md` (dynasty_1 ~60 min, etc.) sont des **placeholders** que tu as posés ; à toi de décider la cadence voulue. Mon analyse pointe surtout l'**écart entre les deux régimes**, pas le respect d'une cible absolue.
