# Analyse dédiée — Le Mythe d'Héphaïstos

> Objectif : ce Mythe est aujourd'hui **injouable** (mesuré). Diagnostic chiffré, intention de
> design, et options de refonte pour le rendre **exigeant mais faisable**, avec un plan de validation.
> Données issues du moteur réel (`src/game/**`) et du simulateur `sim-10-profils.js --mythtest`.

## 1. Condition actuelle (code)

`onCollapse` ([myths.js:275](src/game/data/myths.js#L275)) réussit si **les deux** sont vrais :
- **Infrastructure ≥ 1 500** (`HEPH_INFRA_TARGET`)
- **Population déclinée d'au moins 25 % depuis son pic** (`HEPH_POP_DECLINE_PCT`)

Effets pendant le cycle ([mythTicks.js:91](src/game/core/actions/mythTicks.js#L91)) :
- Après `HEPH_POP_DECAY_START_MIN = 3` min, la population décroît de `HEPH_POP_DECAY_RATE = 0.8 %`/min de la pop **courante**.
- Production d'infrastructure amplifiée (×2 au départ, +0,15/min).
- Usure ×2,5. Sous 50 hab, les crises deviennent irrésolubles.

## 2. Diagnostic : pourquoi c'est devenu injouable

**Mesure (sim, économie post-GR réaliste, cycle de 88 min) :**

| Métrique | Cible | Atteint | Verdict |
|---|---|---|---|
| Infrastructure | 1 500 | ~10¹⁷ | **cible triviale** (dépassée ×10¹⁴) |
| Déclin de population | 25 % | **0,2 %** | **inatteignable** |

Deux problèmes structurels, tous deux liés à la **refonte de la production** survenue *après* la création du Mythe :

1. **La population ne décline pas, parce que la production la regénère.** Dans le moteur, la population n'a **aucune force descendante** hors le déclin du Mythe ([tick.js:80](src/game/core/actions/tick.js#L80) n'ajoute que `r.population`, jamais ne retranche). Le bilan par seconde est :
   `Δpop = production_pop − 0,008/60 × pop`.
   Le déclin mesuré de 0,2 % sur ~85 min signifie que la **production de pop compense ~99,7 % du déclin** : la production vaut ≈ 0,798 %/min de la pop, le déclin 0,8 %/min. Le coefficient 0,8 %/min a manifestement été calibré contre une courbe de production bien plus lente ; aujourd'hui les deux s'**annulent quasi exactement**, et la moindre économie fait repasser la production devant.

2. **La cible d'infra (1 500) n'a plus aucun sens** : elle est franchie en quelques secondes dès qu'on a l'arbre de Ruines. La seule condition *contraignante* est donc le déclin de 25 %… qui est inatteignable. Le Mythe n'a plus de « bon » chemin.

**L'étau.** Pire : les deux conditions se contredisent. Pour tenir l'infra il faut une économie ; or toute économie produit de la population et empêche le déclin. Construire **zéro** bâtiment annule la production de pop, mais alors l'infra ne se maintient pas (elle dépend de la production courante). Il n'existe pas de fenêtre jouable. *(Vérifié : un pilote dédié échoue, que ce soit en construisant peu, beaucoup, ou rien.)*

## 3. Intention de design (à préserver)

Le fantasme est clair et bon : **« les machines remplacent les hommes »** — la population s'éteint pendant que l'infrastructure automatisée explose. Heritage = panneau d'automatisation (Automates). Le Mythe doit donc rester un cycle où **on sacrifie volontairement sa population** au profit des machines. Le défi : tenir (Usure ×2,5) pendant que la cité se vide.

Le bug n'est pas l'intention, c'est le **calibrage** : la mécanique suppose que stopper la croissance suffit à faire chuter la pop, ce qui n'est plus vrai.

## 4. Options de refonte

### Option A — Étouffer la production de population pendant le Mythe *(recommandée)*
Sous Héphaïstos, après le début du déclin, **multiplier la production de population par un facteur faible** (ex. `HEPH_POP_PROD_MULT = 0` ou `0.1`). Alors la pop **cesse de croître** et le déclin de 0,8 %/min agit réellement → 25 % en ~36 min.

- **Fidèle au thème** : la main-d'œuvre disparaît, les machines prennent le relais.
- **Robuste** : découple le déclin de la courbe de production → ne re-cassera pas au prochain rééquilibrage.
- **Changement minimal** : un facteur dans le calcul de `population` ([production.js:759](src/game/core/mechanics/production.js#L759)) + une constante. Le déclin existe déjà.
- **Jouabilité** : arbitrage net — grossir vite *avant* la bascule pour fixer un gros pic, puis encaisser la chute en pompant l'infra, sans tomber par l'Usure ×2,5. Exigeant, lisible, faisable.

### Option B — Objectif en RATIO « machines par habitant » *(complément élégant)*
Remplacer « infra ≥ 1 500 » (trivial) par **infra / population ≥ seuil**. C'est littéralement « des machines par homme ». Auto-échelonné (pas de cible absolue à recalibrer), et synergique avec A (étouffer la pop fait monter le ratio par les deux bouts). Garder le déclin 25 % comme garde-fou « la cité s'est bien vidée ».

### Option C — Gonfler le taux de déclin seul *(à écarter)*
Augmenter `HEPH_POP_DECAY_RATE`. Tant que la production scale exponentiellement et le déclin en %/min, il faudrait un taux énorme et **fragile** (re-cassera au prochain changement de prod). Ne corrige pas la cause. À éviter seul.

### Recommandation
**A** (étouffer la prod de pop) comme correctif de fond, **+ B** (cible en ratio) pour redonner du sens à la partie infra. Paramètres de départ à valider :
- `HEPH_POP_PROD_MULT = 0.1` (la pop décline nettement mais pas instantanément)
- déclin cible **20 %** (au lieu de 25 %) → ~26 min à 0,8 %/min : tendu mais humain
- cible infra → ratio `infra ≥ 8 × pop_courante` (placeholder à régler), ou à défaut une cible absolue ré-échelonnée sur l'ère.

## 5. Plan proposé

1. **Cette analyse** ✅ — tu valides l'option (A, A+B, ou autre).
2. **Implémentation minimale** dans le vrai code : la constante + le hook de production (~2-3 lignes) + ajustement de `onCollapse`.
3. **Validation par simulation** : `node sim-10-profils.js --mythtest`. Critère de succès :
   - le Mythe passe de **ÉCHEC** à **OK** pour un pilote jouant délibérément le sacrifice de pop ;
   - il reste **non-trivial** : impossible « par accident » (un profil qui ne fait que grossir doit encore échouer).
   - cible de durée : faisable en **un cycle de ~25-35 min** de jeu attentif.
4. **Débloquer la cascade** : Héphaïstos étant le dernier verrou de l'Acte I, sa réparation ouvre **Actes II/III, Ragnarok, GR11** à la mesure. Je relance alors les 10 profils → enfin des données sur tout l'endgame.
5. **Audit des autres Mythes périmés** : la même dérive guette probablement d'autres Mythes anciens. Suspect immédiat : **l'Âge d'Or** (objectif « 75 000 Trésor avec population jamais > 300 » — or la pop de départ *gardée* dépasse déjà 300 en post-GR → potentiellement injouable pour la même raison). À analyser pareil après Héphaïstos.

## 6. Implémenté + validé (option A + B retenue)

**Changements dans le vrai code :**
- `HEPH_POP_PROD_MULT = 0` : sous Héphaïstos, après le début du déclin, la production de population est mise à 0 (hook dans `production.js`, chemins float ET Decimal). La pop chute alors de ~0,8 %/min, **indépendamment de la courbe de production**.
- `HEPH_POP_DECLINE_PCT = 0.20` (au lieu de 0,25) → ~28 min de déclin.
- Objectif infra : ratio `infra ≥ HEPH_INFRA_PER_PEAK (1.0) × pic de pop` au lieu du seuil absolu 1 500.

**Validation (`sim-10-profils.js --mythtest`) :** Héphaïstos passe d'**ÉCHEC** à **OK en 31 min** (pile dans la cible), déclin 20,1 %. La cascade s'ouvre : **Sisyphe + Babel** réussissent dans la foulée → **7/14**. Les 95 tests passent (la modif est neutre hors Héphaïstos).

**Constat sur le ratio (B) — il entre en conflit avec A :** mesuré, `infra / pic` ≈ **2,6 millions**. En étouffant la production de pop (A), on rend le dénominateur (pic de pop) petit et figé pendant que l'infra grimpe → le ratio est **monotone croissant** et trivialement franchi. Autrement dit, **A rend B décoratif** : on ne peut pas faire du ratio « machines par habitant » un levier de difficulté indépendant. Le vrai défi reste le **déclin + survie sous Usure ×2,5**.

→ **Décision en attente (cf. §8)** : soit garder le ratio comme simple plancher, soit reformuler la condition d'infra en « **infra ≥ K × infra de départ** » (il faut multiplier ses machines pendant le cycle — compatible avec l'étouffement de pop et réellement exigeant), soit la retirer.

## 7. Découverte systémique : des objectifs de Mythes calibrés sur une économie obsolète

Le même mal touche d'autres Mythes — leurs **seuils absolus** ne suivent pas l'économie post-GR (devenue énorme) :

| Mythe | Objectif | Symptôme post-GR |
|---|---|---|
| Héphaïstos | déclin 25 % (corrigé) | était **injouable** |
| Âge d'Or | pop **jamais > 300** | **injouable** (pop gardée ≫ 300 au départ) |
| Sisyphe | 50 000 Trésor | trivial (réussi en ~30 s) |
| Babel | mult ×5 (~33 bât.) | trivial (~1 min) |
| Chaos | 50 Ruines | trivial (banque ≫ 50) |
| Icare | 5 000 Infrastructure | probablement trivial |
| Atrides | 100 000 Trésor net | probablement trivial |

**Cause racine** : objectifs en **valeurs absolues**, alors que l'économie scale de plusieurs ordres de grandeur via les Ruines/Grand Resets. Résultat : soit trivial, soit injouable — rarement « un défi ».

**Piste de fond** : exprimer chaque objectif **relativement** (au pic du cycle, à l'ère, au revenu courant), comme on vient de le faire pour Héphaïstos (déclin en %, infra en ratio du pic). C'est un petit chantier d'équilibrage à mener Mythe par Mythe.

## 8. Résultat final : les 14 Mythes sont désormais complétables (4/14 → 14/14)

Deux corrections d'équilibrage dans le vrai code ont suffi à débloquer toute la chaîne :

1. **Héphaïstos** — production de pop étouffée (`HEPH_POP_PROD_MULT`), déclin 20 %, objectif infra en ratio du pic. → OK en ~31 min.
2. **Âge d'Or** — la pop explosait au-delà du plafond (10²¹ en un tick) : on **CLAMPE** désormais la pop à un plafond relatif au départ du cycle (`max(300, popDépart × OR_POP_CAP_GROWTH)`), via le handler de tick + un étouffement de prod. → OK.

Le reste des échecs n'était **pas** de l'équilibrage mais des **limites du pilote automatique** (corrigées côté simulateur uniquement, le jeu n'est pas touché) :
- **Phénix** : l'effondrement forcé in-game passe par la séquence animée (`runCollapseSequence`), non résolue en headless → le bot enchaîne maintenant les 20 cycles à la main.
- **Atrides / Antée** : restaient bloqués parce que Phénix ne relâchait pas `activeMythId` ; réglés par le fix Phénix + un effondrement qui force la crise (`ruinGain` exige `crisisOpen`).

**Validation `--mythtest` : 14/14, Ragnarok inclus.** Tests : 95/95 verts. Le bot peut donc atteindre le **GR11**.

### Ce qui restait (traité en §9)
- Ratio infra d'Héphaïstos décoratif ; Mythes triviaux (Chaos, Sisyphe, Babel, Icare, Atrides, Antée, Ragnarok).

## 9. Refonte complète des objectifs de Mythes — chacun son identité

Audit terminé : chaque objectif a été repensé pour avoir un **type distinct** et une **difficulté délibérée**, et tous restent **complétables** (validé `--mythtest` : 14/14). Principe directeur : seuils **relatifs** (× départ de cycle) ou **comptes** (bâtiments) plutôt qu'absolus — un multiplicateur ne suffit pas car le **stock gardé** à l'effondrement franchit n'importe quelle cible (d'où la mesure « gain de CE cycle » ou « × départ »).

| Mythe | Acte | Objectif (final) | Type | Constante(s) |
|---|---|---|---|---|
| Chaos | I | gagner **12 Ruines brutes**/cycle (bonus coupés) | gain bridé | `CHAOS_RAW_RUIN_TARGET` |
| Prométhée | I | pop **×100** depuis le départ avant Rupture 80 % | course vs jauge | `PROMETHEE_POP_MULT` |
| Énée | I | 3 migrations | actions chronométrées | (inchangé) |
| Cadmos | I | nommer 3 Âges | choix répétés | (fix dialogue headless) |
| Héphaïstos | I | infra ≥ 1× pic de pop **+ pop −20 %** ; Usure ×2,5→**1,6** | survie + déclin | `HEPH_POP_PROD_MULT`, `HEPH_*` |
| Sisyphe | II | **180 bâtiments** malgré +3 %/achat | compte vs inflation | `SISYPHE_BUILDING_TARGET` |
| Babel | II | mult **×30** (~70 bât. d'un type) | hauteur mono-type | `BABEL_MULT_TARGET` |
| Âge d'Or | II | Trésor (gain de cycle) pop **clampée** ≤ départ×1,25 | accumulation sous plafond | `OR_*`, `OR_GAIN_SECONDS` |
| Atlas | III | 10 vagues de crise | endurance/spam | (inchangé) |
| Icare | III | gagner **40 s** de prod d'infra (Rupture ×30) | gain express sous pression | `ICARE_GAIN_SECONDS` |
| Phénix | III | **3 renaissances** (×60 pop en <3 min, d'affilée) | reconstruction chronométrée | `PHENIX_RENAISSANCE_TARGET`, `PHENIX_REBIRTH_*` |
| Atrides | III | Trésor **net** gagné ≥ 150 s de prod malgré la dette | accumulation nette | `ATRIDES_GAIN_SECONDS` |
| Antée | III | **≥4 maluses** simultanés + pop **×50** | cumul de fardeaux | `ANTEE_MIN_ACTIVE_RUINS`, `ANTEE_POP_MULT` |
| **Ragnarok** | — | **survie ≥90 s + puissance ×3** sous les 13 contraintes | finale combo | `RAGNAROK_MIN_SURVIVAL_MS`, `RAGNAROK_POWER_SURGE_MULT` |

**Faisabilité Ragnarok (sondée)** : les 13 contraintes forcent l'effondrement vers ~2 min (Rupture ×30 irréductible) et l'économie part au pic (ressources gardées) → la croissance plafonne à ~×2-4. La cible **×3** est donc faisable mais exige d'optimiser sous le chaos (×1000 était impossible). *Le simulateur contourne la restriction mono-type de Babel → il surestime un peu la croissance ; ×3 est conservateur, à confirmer au playtest.*

**Limite assumée** : le simulateur prouve **faisabilité + classement**, pas le **ressenti**. Toutes les valeurs (×100, 180, ×3, 12 ruines, etc.) sont à confirmer **manette en main**. Tests unitaires : **107/107 verts**.
