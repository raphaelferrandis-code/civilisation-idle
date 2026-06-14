# Rapport — Régulation des tensions (foyers de crise)

> Analyse de conception sur le code actuel (`crisis.js`, `mechanics.js`, `CrisisActionBar.jsx`,
> `balance.js`, `world.js`). **Aucun code n'a été modifié.** Toutes les propositions sont des
> pistes de design chiffrées et reliées aux fonctions/constantes existantes pour faciliter une
> implémentation ultérieure. À lire en complément de `rupture-impact.md` (équilibrage de la jauge)
> et de `docs/AUDIT-UI-UX.md` (game-feel, §14 notamment).

---

## 1. Résumé exécutif

Le joueur ressent trois choses, toutes confirmées par le code :

1. **« On ne comprend pas ce que chaque action fait. »** Le bouton n'affiche que son **coût**, jamais son **effet** (« Rationner — 2.27e25 nourriture » ne dit pas « −6 % de Rupture »). Pire : sur les 6 actions, **seules 3 agissent réellement sur le foyer qu'elles prétendent calmer**. Cliquer « Jeux civiques » sous « Inégalités » ne fait **pas** bouger la barre Inégalités — la barre que tu « soignes » ne descend pas.
2. **« On clique sans contrepartie ni impact. »** L'unique contrepartie est un coût en ressource. Or ce coût est devenu dérisoire (point 3), donc l'action paraît **gratuite**. Et il n'existe **aucun malus**, contrairement aux événements de crise (`CRISIS_POOL`) et aux préparations terminales (`TERMINAL_PREP_TIERS`) qui, eux, ont de vrais arbitrages. La couche avec laquelle on interagit en permanence est la plus pauvre.
3. **Le coût ne suit pas l'économie.** Les coûts sont indexés sur la **population** (`crisisCosts()`), qui croît lentement, alors que les **stocks** croissent avec la production exponentielle. Résultat mesuré sur ta capture : un coût de 5e24 trésor face à 9.42e32 en réserve, soit **~5 millionièmes du stock**. Le levier est gratuit.

**La bonne nouvelle :** le moteur contient déjà *deux* couches de crise bien plus riches que la barre de régulation (les événements à choix de `CRISIS_POOL`, et les préparations terminales avec malus de production). **Il « suffit » d'élever la barre de régulation au niveau de ces deux systèmes**, en respectant exactement leurs patterns. C'est l'objet des Axes 1-3.

---

## 2. Comment le système fonctionne aujourd'hui (état des lieux)

Il existe **trois couches** distinctes, dont une seule pose problème.

### Couche A — Événements de crise à choix (`CRISIS_POOL`, `world.js`) ✅
Pop-ups qui mettent le jeu en pause à des paliers (0.25, 0.5, …) et proposent **2 options à vrai arbitrage** :
- *Ouvrir les réserves* : Nourriture −12 %, Rupture −8 % **vs** *Nier le problème* : Production −5 %, Rupture **+8 %**.
- Certaines ont du **hasard** (« contre-récit » : 55 % −4 % / 45 % +7 %).

C'est le **bon modèle** : coût clair, gain clair, choix non trivial, parfois un pari. Rien à refaire ici, sinon s'en inspirer.

### Couche B — Préparations terminales (`TERMINAL_PREP_TIERS`, `mechanics.js`) ✅
Disponibles uniquement quand la Rupture atteint 100 % (« crise ouverte »). Exodus / Archives / Maintien de l'ordre, en 3 paliers. Chacune impose un **malus de production durable jusqu'à l'effondrement** (`terminalPrepMultiplier`) en échange d'un bonus de Ruines (`prep`) et d'un repli de la jauge. **Vrai contre-coût, vrai choix.** Encore le bon modèle.

### Couche C — Barre de « Régulation des tensions » (`CrisisActionBar.jsx` + `runCrisisAction`) ⚠️
C'est **celle de tes captures**, la seule problématique. Quatre foyers, six actions :

| Foyer (barre) | Action(s) | Baisse Rupture | Effet secondaire réel | Agit sur SA barre ? |
|---|---|---|---|---|
| 🌾 Subsistance | Rationner | −0.06 | `rationRelief` (calme la scarcity, plafond 0.35) | ✅ **Oui** |
| ⚖️ Inégalités | Jeux civiques | −0.08 | aucun | ❌ **Non** |
| 🏛️ Complexité | Recenser | −0.12 | aucun | ❌ **Non** |
| 🏛️ Complexité | Réformes | −0.18 | +infra → baisse complexity/structural | ◑ indirect |
| 📜 Dissidence | Catastrophes | −0.09 | +savoir → **augmente** la complexity (`knowledgeStrain`) | ❌ contre-productif |
| 📜 Dissidence | Culte des ancêtres | −0.14 | +légitimité → baisse dissent + mitigation | ◑ indirect |

**Mécanique exacte** (`runCrisisAction`, `crisis.js:351`) :
- L'action **paie un coût** puis **soustrait un montant plat à `state.instability`** (la *valeur courante* de la jauge), **pas à `pressure.total`** (la *cible*). Comme la cible (somme des foyers) ne bouge pas, la jauge **redérive vers le haut** dès le tick suivant (`tick.js:99`). L'effet est donc un **délai**, jamais une correction — c'est l'intention (`balance.js:53`), mais elle est invisible.
- **Rendements décroissants** : `drop × 0.9^n` par clé d'effet (`CRISIS_ACTION_DECAY`). Donc spammer le même bouton calme de moins en moins.
- **Compteurs partagés cachés** : *Catastrophes* partage le compteur de *Recenser* (`census`), *Culte* partage celui de *Jeux civiques* (`festivals`) — cf. commentaire `state.js:830`. Utiliser l'un **affaiblit** l'autre, sans que rien ne l'indique.
- **Coût** (`crisisCosts()`, `mechanics.js:1235`) : `population × facteur × actionScale`, avec `actionScale = 1 + 0.08 × (somme de tous les usages)`. Indexé sur la **population**, remis à zéro à chaque effondrement (`resetTemporaryRunState`).

---

## 3. Diagnostic — pourquoi ça paraît plat

1. **Le mapping foyer→action est en grande partie cosmétique.** On présente 4 barres comme 4 sous-systèmes à gérer, mais 3 actions sur 6 ne touchent pas leur barre : elles grattent juste le compteur global. Le joueur agit sur un cadran décoratif → sensation de vide.
2. **Aucune vraie contrepartie.** Le seul prix est une ressource surabondante (cf. point 3 du résumé). À côté, les Couches A et B *coûtent* quelque chose qu'on ressent (un malus de prod). La Couche C, non.
3. **L'effet est invisible et sans tension de choix.** On clique → la jauge globale fait un micro-saut → elle remonte. Il existe une **action dominante** (la moins chère / plus gros `drop`), donc il n'y a pas de *décision*, juste du *matraquage*.
4. **Les règles profondes sont cachées** : rendements décroissants, compteurs partagés, effet « délai et non correction », interactions inter-foyers. Le joueur ne peut pas jouer ce qu'il ne voit pas.
5. **Le coût ne s'adapte pas aux gains.** Indexé sur la population alors que les stocks suivent la production exponentielle → ratio coût/stock qui tend vers zéro. C'est le point que tu as explicitement relevé.

---

## 4. Axe 1 — Réparer l'évolution des coûts (l'attente explicite)

**Principe : ancrer le coût sur l'économie réelle du joueur, pas sur la population.** Trois options, de la plus simple à la plus fine.

### Option 1.A — Coût = N secondes de production courante *(recommandée)*
`coût = revenu_par_seconde(ressource) × N × escalade`. Exemple : « Rationner coûte **90 s de production de nourriture** ». 
- ✅ **Toujours significatif** quelle que soit l'échelle (le revenu *est* ce qui explose en fin de partie). Se lit comme un sacrifice clair : « je renonce à 1 min 30 de croissance ».
- ✅ Couple naturellement avec l'escalade des rendements décroissants : tenir la jauge coûte de plus en plus de *temps de croissance*.
- Source : `rates()` fournit déjà les revenus/s par ressource. Le calcul est dérivé, zéro changement de gameplay côté production.

### Option 1.B — Coût = fraction du stock courant
`coût = 6-10 % du stock de la ressource`. 
- ✅ Auto-scalant, impossible à rendre dérisoire. 
- ❌ Encourage le « hoard puis dump », et pénalise l'épargne légitime (un joueur qui thésaurise pour un gros achat se voit ponctionné). À réserver si on veut un coût « douloureux ».

### Option 1.C — Coût en % escaladé par profondeur de crise et cycle
Garder la forme actuelle mais remplacer l'ancre `population` par `max(population, f(meilleur stock historique, cycle, profondeur de Rupture))`. Plus conservateur, garde la courbe early intacte.

**Reco :** **1.A** comme base (lisible, thématique), + conserver `actionScale` (escalade par usage) **et** le rendre visible (cf. Axe 3). Bonus : afficher le coût comme une **durée** (« ≈ 1 min 30 de blé ») plutôt qu'un nombre à 24 chiffres — c'est aussi un correctif de lisibilité aligné sur l'audit (notation des grands nombres).

### Rendre explicite le pari « chute tardive = plus de Ruines »
Le moteur récompense déjà une chute **tardive et profonde** (`ruinGain()` : `patience`, `pressure`, `preparation`, `sedimentMod`). Mais ce pari est **invisible**, donc le joueur réduit la Rupture par réflexe sans savoir qu'il **renonce à des Ruines** en s'effondrant trop tôt ou trop facilement. 
→ Afficher en continu un indicateur « **si tu t'effondres maintenant : X Ruines** » et « **tenir encore double ce gain** ». Cela transforme chaque action de régulation en **vraie décision** (temporiser pour le butin vs. dépenser pour survivre), ce qui est exactement la tension de design voulue (`tactical-panel` le dit déjà en texte : *« une chute tardive et complexe rapporte davantage de ruines »* — mais sans chiffre, donc sans poids).

---

## 5. Axe 2 — Donner de vrais choix, impacts et contreparties

Cinq directions, combinables. La **§7 propose un package recommandé**.

### 2.1 — Chaque action agit *vraiment* sur son foyer (réparation de fond)
Donner à **chaque** action un terme de relief **spécifique à son foyer** dans `pressureBreakdown()`, sur le modèle de `rationRelief` (qui existe déjà et marche). Alors :
- Cliquer « Jeux civiques » **fait descendre la barre Inégalités** (à l'écran), pas seulement la jauge globale.
- L'effondrement vient du **foyer qu'on néglige** → les 4 cadrans deviennent 4 sous-systèmes réels à arbitrer (plate-spinning).
- Le relief décroît avec le temps (comme `rationRelief` plafonné) → il faut **réentretenir**.

C'est le correctif le plus important : il rend honnête la promesse de l'UI actuelle.

### 2.2 — Une contrepartie de production par action *(le « contre-coût » manquant)*
Sur le modèle exact de `terminalPrepMultiplier` (Couche B) et des événements (Couche A), chaque action impose un **malus de production temporaire** (jusqu'à la fin du cycle), **dans une ressource différente de celle qu'elle calme** → on jongle :

| Action | Calme | Malus temporaire (idée) |
|---|---|---|
| Rationner | Subsistance | −% production de **nourriture** (on se serre la ceinture) |
| Jeux civiques | Inégalités | −% production d'**or** (le trésor finance les jeux) |
| Recenser / Réformes | Complexité | −% **savoir** / vitesse d'**infra** (l'administration mobilise) |
| Culte / Catastrophes | Dissidence | −% **savoir** (le clergé/les archivistes accaparent) |

- ✅ Chaque clic devient un **sacrifice ressenti** dans les compteurs de taux (la carte de ressource passe au rouge, cf. audit §8/§14).
- ✅ Le malus est en **%**, donc il s'auto-équilibre à toute échelle (contrairement à un coût plat).
- ✅ Réutilise un système **déjà éprouvé** (`crisisProduction` / `addProductionPenalty` existent).

### 2.3 — Des choix ramifiés *dans* le foyer (« ajout de choix »)
Donner à chaque foyer **2-3 réponses mutuellement exclusives** au profil différent, en transposant le style de `CRISIS_POOL` **directement sur la barre** (pas seulement en pop-up). Exemple Subsistance :
- **Rationner** — calme modéré, malus nourriture (sûr, peu cher).
- **Réquisitionner les greniers** — gros calme, **coûte de la population** (radical).
- **Prière pour la pluie** — pari RNG (gros calme ou retour de bâton), très peu cher.

→ On retrouve la richesse de la Couche A, mais sur l'outil qu'on manipule *en continu*. Le joueur **choisit un style** (prudent / brutal / joueur) au lieu de spammer l'unique bouton.

### 2.4 — Politiques *maintenues* plutôt que clics one-shot
Transformer le matraquage en **bascule d'une politique permanente** qui **supprime en continu** un foyer contre un **coût de production continu**, avec une **escalade tant qu'elle est tenue** (et un nombre limité de politiques actives simultanément).
- ✅ Tue le « mash » : on ne clique plus 40 fois, on **décide** combien de foyers l'économie peut soutenir à la fois.
- ✅ Décision stratégique réelle (budget de stabilité) + contrepartie permanente lisible.
- ⚠️ Plus gros chantier (nouvel état persistant, UI de toggles). Excellent objectif de fond, mais à staging plus tardif.

### 2.5 — Synergies/conflits inter-foyers explicites
Rendre **visible et voulu** ce qui existe déjà en creux (Catastrophes ↑ Complexité ; compteurs partagés) :
- *Jeux civiques* (pain & jeux) **augmente la Complexité** (bureaucratie du divertissement).
- Sur-utiliser un foyer **pousse** un autre. 
→ Le système devient un **puzzle d'assiettes chinoises** au lieu d'un bouton « réduire ». Réutiliser pour ça le mécanisme de compteurs partagés (mais l'**afficher**, cf. Axe 3).

### 2.6 — Garde-fou « fatigue de régulation »
Un méta-compteur global : chaque intervention rapprochée monte une **fatigue** qui (a) réduit l'efficacité et (b) augmente le coût de **tous** les foyers, et redescend avec le temps.
- ✅ Le jeu optimal passe de « spammer » à « **intervenir au bon moment** ».
- C'est une généralisation lisible du `CRISIS_ACTION_DECAY` déjà présent.

---

## 6. Axe 3 — Rendre l'impact lisible et visuel (respect de la DA)

À croiser avec `docs/AUDIT-UI-UX.md` §11 (barre de rupture) et §14 (game feel). Tout ici reste dans la DA parchemin/or + carte diégétique.

1. **L'effet sur la face du bouton.** Afficher l'effet, pas que le coût : `−8 % Inégalités · coûte ≈90 s d'or`. + une rangée de **pips de rendement** (`●●●○○`) montrant l'usure du levier (rendements décroissants enfin visibles).
2. **La barre soignée se vide à l'écran.** Animation de drain sur la barre du foyer ciblé + flash bref sur la barre de Rupture canonique (audit §11). Le « avant/après » devient sensible.
3. **Contrepartie montrée en direct.** La carte de la ressource pénalisée flashe rouge et affiche le malus temporaire (audit §8/§14) : on *voit* ce qu'on sacrifie.
4. **Feedback diégétique sur la carte de ville.** La carte est déjà le « baromètre émotionnel » (audit §9). Calmer un foyer y déclenche un micro-événement thématique : greniers qui s'ouvrent (Rationner), foule au forum (Jeux), scribes qui recensent, procession (Culte). Petit, dans la DA, sans coût UI lourd.
5. **Tooltip « Pourquoi ? » par foyer.** Décomposer la source de pression depuis `pressureBreakdown()` (les données existent déjà : `scarcity`, `inequality`, `complexity`, `dissent`, `structural`, `mitigation`). L'audit le propose déjà pour la barre principale ; l'étendre à chaque foyer.
6. **Indicateur « Ruines si effondrement maintenant ».** Cf. Axe 1 — donne enfin un sens à *ne pas* cliquer.

---

## 7. Proposition intégrée recommandée (le « package »)

Un socle cohérent, par ordre de rapport valeur/risque :

1. **Réparer le coût (Axe 1.A)** — coût en *secondes de production*, affiché en durée. *Impact immédiat, risque faible.*
2. **Vrai relief par foyer (Axe 2.1)** — chaque action bouge sa propre barre. *Rend l'UI honnête ; risque d'équilibrage moyen.*
3. **Contrepartie de production (Axe 2.2)** — un malus % temporaire par action, dans une autre ressource. *Réutilise `crisisProduction` ; le « contre-coût » qui manque.*
4. **Lisibilité (Axe 3.1-3.3 + 3.6)** — effet + pips + drain + contrepartie + « Ruines maintenant » à l'écran. *Transforme le ressenti, peu de risque.*
5. **Puis, en V2** : choix ramifiés (2.3) et/ou politiques maintenues (2.4), synergies (2.5), fatigue (2.6).

Avec 1-4, chaque clic devient : *« je calme **ce** foyer (la barre descend), au prix de **cette** production (la carte rougit), pour gagner du temps — sachant que m'effondrer maintenant me rapporterait **X** Ruines »*. C'est un **vrai choix avec impact et contrepartie**, là où il n'y a aujourd'hui qu'un bouton « −Rupture ».

---

## 8. Leviers de code (carte pour l'implémentation)

| But | Fichier / symbole | Note |
|---|---|---|
| Effet plat des actions | `crisis.js:361` `effects` (drop 0.06–0.18) | Ajouter relief par foyer + malus de prod ici |
| Décroissance / compteurs partagés | `crisis.js:374`, `balance.js:56` `CRISIS_ACTION_DECAY` | À exposer dans l'UI (pips) |
| Coût des actions | `mechanics.js:1235` `crisisCosts()` | Ré-ancrer sur `rates()` (Axe 1.A) |
| Reliefs spécifiques de foyer | `mechanics.js:516-521` (`rationRelief`, `dissentRelief`) | Modèle à généraliser aux 4 foyers |
| Malus de production réutilisable | `mechanics.js:211` `crisisProductionMultiplier`, `addProductionPenalty` | Déjà branché dans `rates()` |
| Contrepartie « jusqu'à fin de cycle » | `crisis.js:106` `clearProductionPenalties` | Le nettoyage de cycle existe déjà |
| Gain de Ruines (pari de temporisation) | `mechanics.js:1066` `ruinGain()` | Source de l'indicateur « Ruines maintenant » |
| UI de la barre | `CrisisActionBar.jsx` (compact + full) | Source unique partagée en-tête/onglet |
| Modèle de choix à arbitrage | `world.js:84` `CRISIS_POOL` | Référence pour 2.3 |
| Modèle de contre-coût durable | `mechanics.js:1164` `TERMINAL_PREP_TIERS` | Référence pour 2.2 |

---

## 9. Risques & garde-fous (ne pas casser)

- **L'intention « délai, pas immortalité »** (`balance.js:48-56`) doit survivre : les reliefs de foyer doivent **décroître/plafonner** (comme `rationRelief`), sinon une cité devient immortelle et `ruinGain()` s'effondre.
- **Chemins float ↔ Decimal.** `pressureBreakdown()`, `rates()`, `crisisCosts()` ont un double chemin garanti bit-à-bit par les golden-masters (`economy.golden.test.js`). Tout nouveau terme doit être ajouté **dans les deux** et passer `npm test`.
- **Re-mesurer la jauge.** Toute modif des reliefs change l'équilibrage de `rupture-impact.md` : re-lancer `bench-rupture.js` après coup.
- **Ne pas re-créer du « glow partout »** (audit §17) : le feedback visuel doit rester ponctuel (flash, drain), pas une animation infinie de plus.
- **Automation (`protocoles_urgence`, `tick.js:154`)** clique `census`/`rationing` toute seule : vérifier qu'une contrepartie de production ne se retourne pas contre l'intendant automatique.
- **Garder les 3 couches lisibles** : événements (A) = ponctuel à pause ; préparations terminales (B) = fin de vie ; régulation (C) = continu. Enrichir C **sans** la confondre avec A/B.
