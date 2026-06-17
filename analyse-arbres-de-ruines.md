# Analyse approfondie — Les Arbres de Ruines

> Lecture des données réelles : `src/game/data/upgrades.js` (`PRESTIGE_TREE_BRANCHES`, `PRESTIGE_DOGMAS`, `PRESTIGE_TREE`, `ruinPaths`, `upgrades`), `src/game/data/activeRuins.js`, et de la mécanique qui les consomme : `mechanics/upgrades.js` (disponibilité), `mechanics/shared.js` (`ruinEffectMultiplier`), `mechanics/production.js` (application des effets), `mechanics/prestige.js` (`ruinGain`), `RuinsView.jsx`. Chiffres extraits par script sur les données du jeu.

---

## Périmètre

« Arbre de ruines » = ce qui s'affiche dans **`RuinsView`** (l'onglet titré *Ruines Actives*) :

1. **Le compteur** — la monnaie `ruins`, gagnée à chaque effondrement (`ruinGain()`).
2. **Les Dogmes majeurs** — 9 récompenses-jalons débloquées à **10 / 20 / 30 achats** dans une branche.
3. **Les 5 branches** de `PRESTIGE_TREE_BRANCHES` (100 nœuds), chacune une **chaîne strictement linéaire** : `node[i].requires = node[i-1]`.

Système **adjacent mais distinct** : `activeRuins.js` (« Ruines Actives » au sens des héritages de Mythes) — traité en annexe.

**Persistance** : `resetCivilization()` (à chaque effondrement) **ne réinitialise pas** `state.upgrades`. Les achats de l'arbre survivent à tous les cycles d'une boucle ; ils ne disparaissent qu'au **Grand Reset**. Conséquence directe : **toute erreur structurelle de l'arbre est subie pour toute la boucle GR** (potentiellement des jours).

---

## Verdict en une page

**Ce qui est bon.** Le thème est superbe et cohérent : chaque nœud raconte « ce qui survit à la chute » (caves, graines, archives noyées, monnaies enterrées). Les trois grandes branches couvrent proprement leurs domaines d'effet (`foodMult`/`timeWearSlow`/`stability` pour Résilience ; `goldMult`/`infra*`/`*Discount` pour Prospérité ; `knowledge*`/`ruinGain`/`globalMult` pour Connaissance). La densité narrative est un atout réel.

**Le problème structurel.** On l'appelle « **arbre** », mais c'est **5 rails linéaires**. Le joueur n'a aucune décision à prendre *à l'intérieur* d'une branche : on achète dans l'ordre imposé, point. Or cette structure linéaire entre en collision frontale avec trois mécaniques qui supposaient un *vrai* arbre :

- **`conflictsWith`** (pensé pour un embranchement « ou bien / ou bien ») devient, dans un rail, un **softlock durable** : acheter un nœud sévère 18 à 21 nœuds en aval d'une *autre* branche.
- **Les dogmes** comptent « N achats dans la branche » — mais comme la branche est un rail, « 10 achats » = « les 10 premiers nœuds », sans choix.
- **Les nœuds `start*` à montant fixe** deviennent des **péages morts obligatoires** : payer 13 milliards de ruines pour +120 population de départ.

**Les 3 corrections prioritaires :**
1. **Neutraliser le softlock d'exclusion mutuelle** (P1, critique) — c'est un piège invisible qui ampute le capstone.
2. **Transformer les rails en vrais paliers à choix** (P2) — donner du sens au mot « arbre » et aux dogmes.
3. **Réparer ou retirer les 10 nœuds `start*` morts** (P3) et lisser les murs/inversions de coût (P4).

---

## 1. Cartographie chiffrée

| Branche | Thème | Nœuds | Coût total | Dogmes | Effets dominants |
|---|---|---:|---:|:--:|---|
| **Résilience** | Pop, nourriture, stabilité, usure | 30 | ~167 G | 3 | foodMult ×6, timeWearSlow ×5, stability ×4, populationMult ×4 |
| **Prospérité** | Trésor, infra, routes, coûts, conservation | 32 | ~26,7 G | 3 | goldMult ×6, cityDiscount ×4, infraMult ×4, infraKeep ×3 |
| **Connaissance** | Savoir, archives, gain de ruines, méta | 31 | ~112 G | 3 | knowledgeMult ×7, ruinGain ×3, globalMult ×3, ruptureHaste ×2 |
| **Rupture** | Automatisation des crises | **3** | 113 | **0** | (automation + 1 misfit) |
| **Veille** | Gain hors-ligne | **4** | ~1,7 k | **0** | cap idle 4 h → 24 h |

Déséquilibre frappant : trois rails géants (30-32 nœuds, dizaines de milliards) face à deux moignons (3-4 nœuds). Rupture et Veille **ne peuvent pas atteindre 10 achats** → ils n'ont structurellement **aucun dogme** et apparaîtront comme des orphelins visuels à côté des trois colonnes.

---

## 2. Problèmes de structure (classés par sévérité)

### 🔴 P1 — Exclusion mutuelle = softlock durable (CRITIQUE)

Quatre nœuds se font la guerre via `conflictsWith`, **à cheval entre deux branches** :

| Nœud | Position | En conflit avec | Position | Nœuds amputés en aval |
|---|---|---|---|---:|
| `stone_bread` (Pain de pierre, 1 k) | Résilience **#8** | `mirror_archives` | Connaissance #9 | **21** (toute la fin de Connaissance) |
| `mirror_archives` (Archives miroirs, 1,5 k) | Connaissance **#9** | `stone_bread` | Résilience #8 | **21** (toute la fin de Résilience) |
| `crisis_theatre` (Théâtre des crises, 120 k) | Résilience **#11** | `burial_math` | Connaissance #11 | 19 |
| `burial_math` (Mathématique funéraire, 10 k) | Connaissance **#11** | `crisis_theatre` | Résilience #11 | 18 |

**Le piège.** La chaîne est linéaire : `green_ruins` (#9) *requiert* `stone_bread` (#8). Donc pour progresser en Résilience au-delà du nœud 8, il **faut** acheter `stone_bread` — ce qui **bloque définitivement** `mirror_archives`, donc **sévère les 21 derniers nœuds de Connaissance**, capstone `chronicle_engine` compris. Et réciproquement. **Il est mathématiquement impossible de compléter à la fois Résilience et Connaissance.**

Pire : l'effet affiché ne prévient de rien (« Production de nourriture +55 % » / « Production de savoir +55 % », aucune mention d'exclusion). Le joueur ne découvre le verrou qu'*après* l'avoir déclenché : un nœud passe à « Exclu par : Pain de pierre », puis **tous les suivants** affichent « Requiert [le nœud bloqué] », sans issue. Et comme `state.upgrades` survit aux effondrements, **le verrou tient toute la boucle GR**.

C'est presque certainement un **vestige d'un design d'arbre branché** antérieur, devenu toxique dans la structure en rail. `conflictsWith` n'existe nulle part ailleurs dans le code de jeu que sur ces 4 nœuds.

**Correctifs (par ordre de préférence) :**
- **(a) Supprimer purement `conflictsWith`** des 4 nœuds. Le plus simple ; les deux paires (re)deviennent des nœuds normaux. Aucune autre mécanique n'en dépend.
- **(b) Si le « choix d'école » est voulu** : sortir les nœuds en conflit du tronc linéaire et en faire des **feuilles terminales parallèles** (qui ne gâtent rien en aval), avec un avertissement explicite dans `effect` (« Exclut [autre voie] »).
- **(c) Garde-fou minimal immédiat** : dans `checkNodeAvailability`, ne pas laisser un nœud `blocked` casser la chaîne — traiter un parent `blocked` comme « franchissable » pour les enfants, ou ajouter un test au chargement qui interdit `conflictsWith` entre deux branches.

---

### 🟠 P2 — Un « arbre » qui est un rail : zéro décision interne

`PRESTIGE_TREE` génère `requires: index>0 ? ids[index-1] : null` — **chaque branche est une file unique**. Conséquences :

- **Aucun arbitrage intra-branche.** On ne *choisit* jamais quel nœud prendre ; on déroule la liste. Le mot « arbre » et l'UI en colonnes promettent un skill-tree qui n'existe pas.
- **Les dogmes perdent leur sel.** `checkDogmaAvailability` exige `ownedRuinBranchPurchaseCount(branch) ≥ 10/20/30`. Dans un rail, « 10 achats » ≡ « les nœuds 0-9 » : le palier est un simple compteur de profondeur, pas une récompense de spécialisation.
- **Le filler est obligatoire.** Tout nœud faible (montant plat mort, multiplicateur tiède) doit être **acheté pour franchir** vers les bons. Pas de contournement.

**Piste de refonte (voir §5).** Passer à des **paliers à choix** : un palier s'ouvre quand on possède *k* nœuds du palier précédent (pas un nœud précis). Le joueur choisit *lesquels* — ce qui (1) rend l'« arbre » réel, (2) redonne du sens aux dogmes (« 10 achats » devient un vrai investissement orienté), (3) permet d'ignorer le filler.

---

### 🟠 P3 — 10 nœuds `start*` morts à l'échelle où ils débloquent

`resetCivilization()` injecte `ruinEffectSum("startX")` dans les ressources de départ du cycle suivant. Un montant **fixe** n'a de valeur que dans les premières secondes d'un cycle, **relativement à la production du moment**. Or ces nœuds sont vendus très cher, très tard :

| Nœud | Effet | Coût | Diagnostic |
|---|---|---:|---|
| `ember_baskets` | +40 nourriture départ | 2 | ✅ pertinent (early) |
| `dynastic_seeds` | +25 population départ | 180 k | ⚠️ déjà faible |
| `fossil_taxes` | +250 trésor départ | 270 k | ❌ mort |
| `first_grammar` | +120 savoir départ | 400 k | ❌❌ mort (gagné en < 1 s) |
| `ten_thousand_storehouses` | +250 k nourriture départ | 270 M | ❌ négligeable |
| `palace_of_receipts` | +100 k trésor départ | 400 M | ❌ négligeable |
| `library_under_world` | +50 k savoir départ | 600 M | ❌ négligeable |
| `lamp_archives` | +200 k savoir départ | 14 G | ❌ négligeable |
| `green_census` | **+120 population** départ | **13 G** | ❌❌❌ absurde |
| `deep_wells` | +1 M nourriture départ | 25 G | ❌ négligeable |

`green_census` est l'exemple-symbole : **13 milliards de ruines pour +120 population de départ**, alors que la production de pop est déjà colossale à ce stade. Et dans un rail, **on est forcé de l'acheter** pour atteindre les nœuds suivants.

**Correctifs :**
- **Indexer les `start*` sur l'échelle** au lieu d'un montant fixe : p.ex. *« commence le cycle avec X % du pic de [ressource] du cycle précédent »* (state.cyclePeaks existe déjà) → reste pertinent à toutes les échelles.
- **Ou reconvertir** les `start*` tardifs en effets qui ne se périment pas : un `*Keep` (% conservé à l'effondrement), un `*Mult`, ou un `globalMult`.
- **Ou rapatrier** tous les `start*` plats dans les **tout premiers paliers** (où un montant fixe compte) et ne plus jamais en réintroduire au-delà du millier de ruines.

---

### 🟡 P4 — Inversions et murs de coût dans les rails

Comme la chaîne est linéaire, le coût *devrait* être monotone croissant (c'est le seul rythme de la branche). Anomalies mesurées :

- **Inversion** — Connaissance : `memory_scribes` (65) → `foundation_ghosts` (**60**). Le nœud suivant coûte *moins* : gating gratuit, friction nulle.
- **Murs (sauts ≥ ×10)** :
  - Résilience : `stone_bread` (1 k) → `green_ruins` (**×35**) ; `dynastic_seeds` (180 k) → `echo_census` (×16,7) ; `evergreen_fields` (15 M) → `cradle_of_laws` (×12).
  - Prospérité : `old_coin_molds` (650) → `tilted_milestones` (×10,5).
  - Connaissance : `ashen_libraries` (15 k) → `first_grammar` (**×26,7**) — et `first_grammar` est en plus un nœud `start*` mort (P3) : on heurte un mur ×26 *pour acheter un nœud inutile*.

**Correctif :** viser un facteur inter-nœud régulier (≈ ×1,5 à ×3 selon la zone) ; corriger l'inversion ; éviter qu'un mur précède un nœud faible.

---

### 🟡 P5 — Branches orphelines (Rupture 3 / Veille 4) + capstone mal placé

- **Rupture (3 nœuds)** mélange deux registres : `conseil_de_crise` + `edit_effondrement` (automatisation des crises) **et** `recurring_ages` (un bonus de prod indexé sur la meilleure ère — un misfit thématique qui appartiendrait à Prospérité/Relance). Trop courte pour un dogme, elle paraît inachevée.
- **Veille (4 nœuds)** est une échelle pure (4 h → 8 h → 12 h → 24 h) : fonctionnelle mais sans aucune décision.
- **Capstone mal placé** : `chronicle_engine` (Machine chronique) porte le mot *« Capstone »* dans son effet, mais siège en **Connaissance #20 sur 31** — **10 nœuds le suivent**. Un capstone qui n'est pas terminal n'en est pas un.

**Correctifs :**
- Déplacer `recurring_ages` hors de Rupture ; étoffer Rupture avec les nœuds `ruptureHaste`/`stability` (voir P6) pour en faire la **vraie branche « méta-crise »**.
- Donner à Veille un second axe (p.ex. un nœud « efficacité de production hors-ligne % ») pour créer un choix.
- Mettre `chronicle_engine` **en fin** de Connaissance, ou le renommer s'il reste au milieu.

---

### 🟡 P6 — Toute la « méta » est entassée dans Connaissance

Connaissance concentre les effets *qui pilotent le jeu entier* : **3 `globalMult`** (s'appliquent à TOUTE la production — premium), **3 `ruinGain`** (accélèrent tout le prestige), **2 `ruptureHaste`**, **1 `unspentRuinsPower`**, **1 `chronicleEngine`** (capstone), **1 `stability`**. Résilience et Prospérité ne sont que des branches « stat pure ».

Résultat : **Connaissance est la branche à rusher**, pas par thème mais parce qu'elle détient le capstone, les boosters de gain de ruines et les multiplicateurs globaux. Les deux autres deviennent secondaires.

> Rappel d'échelle : un `globalMult` profite à tout (pop/savoir/infra au mult plein, food/or à sa racine). Le `globalMult` cumulé de Connaissance (≈ +86 %) vaut souvent plus qu'un `+180 %` mono-ressource. Concentrer ces effets dans une seule branche déséquilibre l'ordre de priorité.

**Correctif :** répartir la méta. Faire des **`globalMult` les capstones respectifs** des trois grandes branches ; déménager les `ruinGain`/`ruptureHaste` vers la branche **Rupture** rebaptisée « méta-crise » ; laisser Connaissance se concentrer sur savoir + mémoire.

---

## 3. Nommage, thème et présentation

### Icône de monnaie incohérente
Les `ruins` s'affichent **🪙 (pièce)** dans `RuinsView` (`{fmt(ruins)} 🪙`) mais **🏛️ (temple)** dans `PrestigeView`. La pièce évoque l'**or/trésor** (autre ressource) et brouille la lecture. → Unifier sur **🏛️**, qui colle à « ruines » et ne se confond pas avec le trésor.

### Collision de nom « Ruines Actives »
L'onglet est **titré « Ruines Actives »** alors qu'il montre l'arbre de prestige + dogmes ; or `activeRuins.js` définit un **système distinct** également nommé *active ruins* (héritages de Mythes en cours de partie). Deux choses différentes, un même nom. → Renommer l'onglet : *« Mémoire des Ruines »*, *« Traditions de reconstruction »* (le sous-titre l'emploie déjà), ou simplement *« Arbres de Ruines »*.

### Dogmes : ids, registres et types hétérogènes
Les 9 dogmes mélangent **trois préfixes d'id** et **trois natures** sans que l'UI le signale :

| Nature | Exemples | Comportement |
|---|---|---|
| `dogma_*` (passif) | Communes vivrières, Médecine civique, Droit marchand, Académies libres… | bonus pur |
| `trait_*` (double tranchant) | **Nomadisme** (infra plafonnée), **Théocratie** (+25 % montée de Rupture) | bonus **avec contrepartie** |
| `skill_*` (actif) | **Archéologie** (action 1×/cycle) | capacité activable |

Problèmes : (1) **registre de nom** incohérent (les *-ismes* « Théocratie/Nomadisme » côtoient des institutions « Communes vivrières/Grands travaux » et une discipline « Archéologie ») ; (2) les **Paliers I** sont asymétriques en risque — Résilience offre un dogme purement positif (foodKeep +10 %), tandis que Prospérité et Connaissance offrent un **trait à contrepartie** comme premier jalon ; (3) un dogme *actif* (Archéologie) se cache parmi des passifs, sans distinction visuelle. → Séparer dans l'UI **Dogmes / Traits / Compétences** (ou au moins un badge), et homogénéiser les ids.

### Accents / encodage
Plusieurs nœuds sont **désaccentués** alors que la majorité ne l'est pas — incohérence visible en jeu :
- `seasonal_oaths` : *« A chaque saison, la cite repete pourquoi elle existe. Ca aide a tenir. »*
- `deep_wells` : *« L'eau ici remonte d'avant la premiere cite. Elle sera la apres la derniere. »*
- `silver_roads` : *« Production de tresor +240 %. »* ; `canal_charters` : *« Couts d'infrastructure -10 %. »*
- **Tout `activeRuins.js`** est désaccentué (« Migration fondatrice… Boost de depart… Rupture initiale… coute… plus cher »).
→ Repasser ces chaînes en accentué pour matcher le reste.

### `ruptureHaste` : un malus déguisé en nœud à acheter
`burial_math` (`amount: 0.08`, effet « Pression de rupture **+4 pts** ») et `ruined_mandate` (`amount: 0.16`, « **+8 pts** ») **ajoutent** de la pression → accélèrent l'effondrement. C'est un *choix de tempo* défendable (cycler plus vite = plus de ruines/temps réel), mais : (1) c'est **noyé dans le rail Connaissance** et **obligatoire** pour progresser ; (2) le cadrage ne dit pas que c'est un arbitrage. Un joueur visant un objectif de Mythe de longue survie est *forcé* d'acheter de l'instabilité. → Déménager vers la branche Rupture/méta-crise et **cadrer comme arbitrage opt-in**.

### `ruinPaths` : taxonomie morte
`upgrades.js` exporte `ruinPaths` (6 voies : abundance/treasure/knowledge/foundations/rupture/relaunch, **16 ids**) — **utilisé nulle part** (grep : 1 seul fichier, sa définition). C'est l'**ancienne** classification, supplantée par `PRESTIGE_TREE_BRANCHES` (5 branches, 100 nœuds). Elle entretient une **double taxonomie contradictoire** des mêmes upgrades (les 16 ids ne sont qu'un sous-ensemble périmé). → **Supprimer** `ruinPaths`, ou le réconcilier s'il sert de doc.

---

## 4. Économie des effets (magnitudes)

- **`knowledgeMult` cumulé** (×7 nœuds : .15+.22+.55+.85+1.8+3+2.4 ≈ **+9,0**) + dogme Académies libres (+1.25) + le ×1,6 spécial de `charcoal_tablets` → pile de savoir très lourde (≈ ×10+). Cohérent avec le thème, mais souligne que Connaissance est la branche-reine (cf. P6).
- **`globalMult`** est sous-tarifé relativement à sa puissance quand il apparaît tôt dans la liste mêlé aux mono-stats ; le réserver aux **capstones** clarifierait sa valeur.
- **`stability` / `ruptureHaste`** se neutralisent thématiquement et sont dispersés (stability en Résilience ×4 + Connaissance ×1 ; ruptureHaste en Connaissance ×2). Les regrouper dans une branche méta-crise rendrait l'arbitrage « tenir vs cycler » **lisible et choisi**.
- **`*Keep`** (conservation à l'effondrement) est bien réparti et reste pertinent à toute échelle (c'est un %) — **modèle à suivre** pour reconvertir les `start*` morts (P3).

---

## 5. Proposition de refonte

Deux niveaux d'ambition. Le **Niveau 1** corrige sans changer l'architecture ; le **Niveau 2** réalise le « vrai arbre ».

### Niveau 1 — Réparations ciblées (faible risque, fort impact)
1. **Retirer `conflictsWith`** des 4 nœuds (P1). *(ou appliquer le garde-fou (c))*
2. **Reconvertir les 10 `start*`** : indexer sur `cyclePeaks` (% du pic précédent) **ou** transformer les tardifs en `*Keep`/`globalMult` (P3).
3. **Lisser les coûts** : corriger l'inversion `memory_scribes`→`foundation_ghosts` ; raboter les murs ×26/×35 (P4).
4. **Déplacer `chronicle_engine` en fin** de Connaissance ; **sortir `recurring_ages`** de Rupture (P5).
5. **Cosmétique** : icône 🏛️ unique, renommer l'onglet, réaccentuer, badges Dogme/Trait/Compétence, supprimer `ruinPaths` (P3-présentation).

### Niveau 2 — Le vrai arbre : paliers à choix
Remplacer le `requires = ids[i-1]` linéaire par un **gating par palier** :

```
Une branche = 4–5 PALIERS de 3–5 nœuds.
Le palier N s'ouvre quand on possède ≥ k nœuds du palier N-1
(k < taille du palier → on PEUT en sauter).
Les dogmes s'arriment aux paliers (fin de palier 2/3/4).
```

Bénéfices : (1) l'« arbre » devient réel — on choisit *lesquels* acheter ; (2) le filler cesse d'être obligatoire (on l'ignore) ; (3) les dogmes redeviennent des **investissements orientés** ; (4) `conflictsWith` retrouve un sens sain (choix *intra-palier* entre deux feuilles, sans rien sévérer en aval) ; (5) capstones = nœud terminal du dernier palier de chaque branche, idéalement un `globalMult` (P6).

**Réorganisation des branches suggérée :**
- **Résilience** — pop / nourriture / `*Keep` nourriture / capstone `globalMult`.
- **Prospérité** — trésor / infra / coûts (`*Discount`) / capstone `globalMult`.
- **Connaissance** — savoir / archives (`*Keep`/`*Discount` savoir) / capstone `chronicle_engine`.
- **Cycle & Crise** (ex-Rupture, étoffée) — `ruinGain`, `ruptureHaste`/`stability` (arbitrages opt-in), automatisations (`conseil_de_crise`, `edit_effondrement`, `recurring_ages`) → enfin assez longue pour un dogme.
- **Veille** — cap idle + un axe « qualité hors-ligne ».

---

## 6. Quick wins (actionnable, par ordre d'impact)

| # | Action | Fichier / cible | Effet |
|---|---|---|---|
| 1 | Retirer `conflictsWith` des 4 nœuds | `upgrades.js` (l.362,374,408,475) | **Élimine le softlock durable** |
| 2 | Indexer/reconvertir les 10 `start*` | `upgrades.js` + `resetCivilization` | Supprime les péages morts |
| 3 | Corriger inversion + murs de coût | `upgrades.js` (coûts) | Progression de branche lisible |
| 4 | `chronicle_engine` en dernier ; sortir `recurring_ages` | `PRESTIGE_TREE_BRANCHES` | Capstone cohérent, Rupture assainie |
| 5 | Icône 🪙→🏛️, renommer l'onglet | `RuinsView.jsx` | Lève la confusion monnaie / « Ruines Actives » |
| 6 | Réaccentuer les chaînes | `upgrades.js`, `activeRuins.js` | Cohérence visuelle |
| 7 | Badges Dogme / Trait / Compétence | `RuinsView.jsx` + `PRESTIGE_DOGMAS` | Clarifie les contreparties (Théocratie/Nomadisme) |
| 8 | Supprimer `ruinPaths` | `upgrades.js` | Retire une taxonomie morte contradictoire |
| 9 | (gros) Paliers à choix | `PRESTIGE_TREE` génération + `mechanics/upgrades.js` | Fait de l'« arbre » un vrai arbre |

> Toucher **un levier à la fois**, puis relancer `simulate-ce.js` et comparer la cadence (les leviers coût/structure interagissent).

---

## Annexe — « Ruines Actives » (`activeRuins.js`), le système jumeau inachevé

Mécanique distincte (héritages de Mythes appliqués comme modificateurs de run, `ACTIVE_RUIN_DEFINITIONS`). État actuel : **4 définies, 6 en attente**.

| id | Source | Statut |
|---|---|---|
| `enee` | Énée | ✅ +10 %/effondrement (cap +100 %), malus rupture +0,10 |
| `promethee` | Prométhée | ✅ nourriture ×2 début de cycle, moteurs nourriture +20 % |
| `age_or` | Âge d'Or | ✅ usure -20 % si food/trésor équilibrés, trésor -25 % au départ |
| `hephaistos` | Héphaïstos | ✅ automatisations, usure +10 % |
| `atlas`, `sisyphe`, `babel`, `icare`, `phenix`, `atrides` | — | ❌ **« Slot futur / Bonus à definir / Malus à definir »** |

**6 slots placeholder** (titre « Slot futur », `pending: true`) : contenu à concevoir. Recommandation : leur donner chacun un **couple bonus/malus thématique** ancré sur le Mythe source (Atlas = portée/légitimité ↔ poids ; Sisyphe = répétition/coûts ↔ plafond ; Icare = surchauffe/prod ↔ usure ; Phénix = renaissance/ruines ↔ fragilité ; Babel = adjacence/diversité ↔ instabilité ; Atrides = malédiction/gain ↔ drain), en cohérence avec les effets de Mythe déjà codés dans `myths.js`. Et **réaccentuer** tout le fichier.
