# Refonte des Mythes — diagnostic et axes de conception

> Objectif : sortir les Mythes du régime « multiplicateur de production » pour en faire des
> **défis tirés des systèmes réels du jeu** et des **récompenses qui approfondissent une
> facette**, sur le modèle de ce qu'ont réussi Héphaïstos et Phénix côté idle.
>
> C'est le même geste que [REFONTE-ARBRE-RUINES.md](REFONTE-ARBRE-RUINES.md) (« remplacer les
> bonus impersonnels par des bonus propres aux mécaniques du jeu »), appliqué cette fois aux
> quatorze Mythes.
>
> État : **conception en cours, rien d'implémenté.** Session du 2026-07-18.

---

## 1. Le problème

Les quatorze Mythes ont été posés tôt dans la création du jeu. Le jeu qu'ils habitent
aujourd'hui n'est plus celui pour lequel ils ont été écrits.

**Ce qu'est le jeu maintenant** : un idle avec une couche de gestion de ville et un
citybuilder automatique. Le joueur fait croître sa cité, et le game over d'une cité *est* la
mécanique de prestige. Les bonus de production sont déjà abondamment servis par trois
systèmes concurrents : l'arbre des Ruines, la boutique des jeux du Temple, et les Grands
Resets.

**Ce que font les Mythes** : ils ajoutent une quinzième source de multiplicateurs de
production, dans un jeu qui en a déjà trois. Leurs contraintes de cycle sont elles aussi des
multiplicateurs de stats (Icare production ×100 et Rupture ×30, Atlas Usure ×4, Babel Rupture
×2). Le problème d'identité est donc **des deux côtés** : le défi comme la récompense.

### 1.1 Les héritages actuels

| Mythe | Héritage aujourd'hui | Câblé dans |
|---|---|---|
| Chaos | Ruines d'un cycle Chaos comptées double dans le multiplicateur global | `globalMultipliers.js:45` |
| Prométhée | Braisiers : Nourriture ×2 les 2 premières minutes **(ne fonctionne pas, cf. §2)** | `rates.js:75` |
| Énée | +10 % de prod par effondrement passé (cap ×2), 30 premières secondes | `globalMultipliers.js:157` |
| Cadmos | +2 % par Épitaphe sur son orientation, 3 max | `mythEffects.js:104` |
| Héphaïstos | **Panneau Automates** (achat auto, crises auto) | `tick.js:297` |
| Sisyphe | −10 % sur le facteur de scaling des coûts | `cost.js:16` |
| Babel | +10 % par voisin du même type, moyenné sur tous les bâtiments | `mythEffects.js:48` |
| Âge d'Or | −20 % d'Usure quand l'écart Nourriture/Trésor est sous 15 % | `prestige.js:50` |
| Atlas | −15 % d'Usure de base, jauge Légitimité, crises atténuées jusqu'à −25 % | `prestige.js:212`, `crisisLevers.js:18` |
| Icare | Surchauffe : ×5 prod 30 s, +25 % Rupture, cooldown 2 min | `myths.js:244` |
| Phénix | **Script d'effondrement automatique** (seuils Rupture / Usure / durée) | `tick.js:301` |
| Atrides | Pacte : ×2 prod les 2 premières minutes, ×0,5 pendant la crise | `globalMultipliers.js:151` |
| Antée | +10 % de Ruines par malus porté **(objectif infaisable, cf. §2)** | `activeRuins.js:120` |
| Ragnarok | Sceau GR 11 → ×4 sur le multiplicateur de Ruines, titre permanent | `prestige.js:46` |

Onze sur quatorze sont un pourcentage. Les deux seuls mémorables, Héphaïstos et Phénix, sont
précisément ceux qui **ne donnent pas de nombre**. C'est exactement le constat qu'avait fait
la refonte de l'arbre des Ruines sur ses cinquante nœuds.

### 1.2 La preuve par le workflow

Un workflow multi-agents a produit 130 pistes de récompense (8 agents de cartographie du code,
3 lentilles de design par Mythe, 3 jurys par Mythe). Consigne explicite : **pas de bonus
plats, pas d'automatisation**. Résultat des idées les mieux notées :

- **6 Mythes sur 12** ont convergé indépendamment sur le palier de jalon (`2^floor(count/25)`
  en catégorie cité, `1.5^` ailleurs, `buildingOutput.js:16-45`), c'est-à-dire la production ;
- **4 Mythes sur 12** ont convergé sur le multiplicateur de moisson de l'effondrement.

Ce n'est pas un défaut des agents. C'est que **la surface de récompense du jeu est production
et moisson** : dès qu'on demande une récompense, la gravité y ramène. Le diagnostic est donc
confirmé par la donnée, et pas seulement par l'intuition.

Les 130 pistes sont archivées dans
[REFONTE-MYTHES-annexe-idees.md](REFONTE-MYTHES-annexe-idees.md), avec les notes et les
critiques des jurys. Elles ont été produites **avant** les décisions du §3, donc beaucoup
visent encore des multiplicateurs. À lire comme un gisement, pas comme une recommandation.

---

## 2. Blocages vérifiés, à traiter avant toute refonte

Quatre problèmes constatés dans le code. Les trois premiers sont vérifiés par exécution, le
quatrième par lecture. **Ne construire aucune récompense par-dessus tant qu'ils tiennent.**

### 2.1 L'héritage de Prométhée n'a jamais fonctionné

`state.js:1546` fait `s.prometheeBraisiers = false` dans `resetTemporaryRunState`, appelée à
chaque effondrement (`crisis.js:400`). Or l'héritage est accordé par `applyHeritage()` depuis
`checkMythOnCollapse()` à `crisis.js:306`, soit une centaine de lignes plus haut **dans le
même effondrement**. Le drapeau est mis à `true` puis effacé immédiatement. Il n'est jamais
vrai au démarrage d'un cycle, donc le ×2 Nourriture de `rates.js:75` ne se déclenche jamais.

La ligne est en plus redondante : la limite « 2 premières minutes » est portée par
`cycleElapsed < BRAISIERS_DURATION_MS`, pas par le drapeau. Et `prometheeBraisiers` figure
dans `GR_PERSISTENT_FIELDS` (`state.js:1573`), ce qui montre que l'intention était bien la
permanence. **Correctif : supprimer `state.js:1546`.**

Vérifié en exécutant `resetTemporaryRunState` et `buildGrandResetState` sur un état où les
quatorze drapeaux sont à `true` : treize survivent aux deux, `prometheeBraisiers` est le seul
perdu à l'effondrement.

### 2.2 Antée est infaisable, donc le Ragnarok est inatteignable

`ANTEE_MIN_ACTIVE_RUINS = 4` (`activeRuins.js:12`) mais seules **trois** Ruines actives sont
réellement sélectionnables. Sur les dix définitions, six sont `pending: true`, affichées
« slot futur » et `disabled` (`myths.js:94`), puis filtrées hors de `allowedIds`
(`myths.js:104`). La septième, « Braisiers ancestraux », a pour `stateKey`
`prometheeBraisiers`, donc elle disparaît de la liste à cause du bug §2.1.

Il reste `enee`, `age_or`, `hephaistos`. `onCollapse()` d'Antée ne peut jamais renvoyer
`true`. Antée étant en Acte III et le Ragnarok exigeant tous les Mythes des Actes I à III, la
fin du jeu est verrouillée.

Corriger §2.1 remonte à quatre, soit l'objectif pile sans aucune marge de choix. **Il faut
décider du sort des six slots vides** : les remplir, ou baisser le seuil.

### 2.3 La Moisson de crise sature à trois crises

Le nœud « Moisson de crise » donne `amount: 0.10` par crise stabilisée (`upgrades.js:265`),
plafonné par `CRISIS_RESOLVE_RUIN_CAP = 0.30` (`balance.js:861`), consommé en
`prestige.js:161-164`. Le bonus est donc **saturé dès la troisième crise du cycle**. Sur un
cycle late game de plusieurs heures qui en produit bien davantage, gérer ses crises
correctement et les gérer parfaitement rapportent exactement la même chose.

C'est un choix mort au cœur du seul système de gameplay actif du jeu. Accessoirement, les
commentaires de `prestige.js:159` et `balance.js:860` annoncent « +3 % par crise » alors que
la valeur réelle est 10 %.

### 2.4 L'inflation de Sisyphe compte les lots, pas les unités

`state.sisypheMult` s'incrémente une fois par **appel** de `buyBuildingCore`
(`building.js:97-99`). Un achat groupé de 500 unités compte donc pour un cran, là où 500
achats unitaires comptent pour 500. L'incohérence existe déjà dans le Mythe actuel, et elle
invalide toute récompense assise sur la malédiction de Sisyphe.

---

## 3. Décisions de conception

**D1. Héphaïstos et Phénix sont conservés tels quels.** Automatisation d'achat et
automatisation d'effondrement. Ce sont les deux seuls héritages qui approfondissent une
mécanique au lieu de gonfler un nombre.

**D2. La carte reste un rendu que l'on regarde.** Elle ne devient pas jouable. Rendre le
citybuilder interactif ferait un autre jeu, et ce n'est pas le but.

> Conséquence assumée : `roadCoverage` (moteurs connectés / moteurs totaux) rapporte déjà
> jusqu'à +10 % de production globale (`globalMultipliers.js:89-95`) et alimente la mitigation
> de la Rupture, l'amortissement de la charge structurelle et l'absorption de la complexité
> (`balance.js:799-822`). Le jeu **note donc déjà le plan de ville, sur deux jauges**, à partir
> d'un placement que le joueur ne décide pas (`layout.js`, attribution automatique des slots).
> Cette asymétrie est connue et conservée : la carte influence l'économie sans être pilotée.

**D3. Le principe généralisable.** Ce qui rend Héphaïstos et Phénix bons n'est pas
l'automatisation en soi. C'est qu'ils donnent au joueur **un volant sur un système que le jeu
exécutait sans lui**. L'achat se faisait tout seul, il le programme. L'effondrement arrivait,
il le règle. L'automatisation n'était qu'un cas particulier.

> **Critère de conception** : une bonne récompense de Mythe rend pilotable un système
> aujourd'hui exécuté par la machine, ou approfondit un système déjà pilotable mais pauvre.

**D4. La surface, ce sont les deux extrémités du cycle.** Dans un idle, le milieu du cycle
*doit* tourner tout seul, c'est le genre qui le veut. Vouloir rendre le milieu interactif,
c'est exactement ce qu'aurait fait la carte jouable. Donc : le joueur pilote **l'entrée et la
sortie**, la machine s'occupe du milieu. C'est cohérent avec le genre et avec le fait que le
game over est la mécanique de prestige.

**D5. Les Mythes se regroupent en couches, pas en quatorze bibelots.** Le jeu n'a pas
quatorze facettes à approfondir. Attribuer une facette à chaque Mythe redonnerait quatorze
déblocages disjoints. La bonne forme est l'inverse : **plusieurs Mythes construisent une même
facette par couches successives**. Les Actes I, II, III cessent alors d'être une simple
barrière de déblocage et deviennent la profondeur croissante d'une facette.

---

## 4. Les cinq axes

Par ordre de rendement estimé.

### 4.1 La chute (le plus prometteur)

**Ce qui tourne tout seul aujourd'hui** : une fois les trois préparations terminales scellées,
il ne reste littéralement rien à faire. C'est le moment le plus tendu du cycle et le plus
vide. `TERMINAL_PREP_TIERS` dans `crisis-cost.js`, `runTerminalCrisisAction` à
`crisis.js:214`.

**Pourquoi c'est le bon axe** : c'est le moment le plus chargé thématiquement (Chaos, Icare,
Atlas, Phénix, Atrides et Ragnarok sont tous des mythes de catastrophe), c'est le passage
obligé de chaque cycle, et quatre Mythes sur douze y ont convergé spontanément.

**Matériau récolté** : L'Heure du Loup (6,8), L'Autel sans fin (7,5), Épauler (6,3), La Cire
(6,5), La Rançon d'Atrée (7,0). Réserve commune des jurys : le garde-fou anti-stabilisation
doit être **structurel**, pas une simple taxe, sinon il reste toujours un intérêt marginal à
prolonger.

### 4.2 La fondation

**Ce qui tourne tout seul aujourd'hui** : à chaque effondrement le jeu régénère seul
l'archétype, la graine, le nom, l'ère de départ. Tout le transfert d'un cycle au suivant est
passif : `computeStartFloor`, les canaux `*Keep`, `racine_mere`, les reliquaires. Le joueur ne
fonde jamais rien avec intention, il choisit seulement une épitaphe.

**Pourquoi c'est le bon axe** : c'est **non spatial** si on le formule comme une charte et non
comme un plan. Quelle est la nature de cette cité, quelle doctrine elle porte, ce qu'elle
emporte du cadavre de la précédente. Convertir du passif existant en décision, c'est le geste
Héphaïstos appliqué à la prestige.

**Matériau récolté** : Le Convoi de l'exil (6,7), Les Pénates (4,8). Les jurys les ont
descendues pour redondance avec les transferts passifs existants. **À relire à l'envers** :
cette redondance est un argument pour *convertir* le passif en choix, pas pour ajouter un
choix par-dessus.

### 4.3 La gouvernance

**Ce qui est pauvre aujourd'hui** : les crises narratives, les édits, le budget de politiques
(`activePolicies`, `POLICY_MAX_ACTIVE`, remis à zéro chaque cycle), les réformes de foyer,
l'Intendance qui survit comme doctrine. Un jury a résumé : le budget de politiques est posé
une fois puis oublié. Et la récompense sature à trois crises (§2.3).

**Pourquoi c'est le bon axe** : c'est la « gestion de ville » au sens propre, sans carte. Mais
il faut réparer avant d'approfondir.

### 4.4 La méta elle-même

Chaos et Antée jouent déjà avec les bonus de méta-progression : c'est leur identité, elle est
jouable sans carte. Antée demande d'abord une décision sur ses six slots vides (§2.2).

### 4.5 L'idle (conservé)

Héphaïstos et Phénix. Ne pas y toucher.

---

## 5. Contraintes transverses à respecter

**Le Script du Phénix disqualifie toute récompense de type « serment de début de cycle ».**
Le script effondre sur l'un des trois déclencheurs `rupture100`, `usure` ou `temps`
(`main.js:278-288`, valeurs normalisées en `state.js:805`) sans rien savoir d'une promesse en
cours. Le joueur qui possède les deux héritages verrait son propre script
lui faire manquer son serment. Deux idées bien notées tombent là-dessus (Le Sommet promis pour
Sisyphe, La Prise d'Héraclée pour Antée). À trancher avant de concevoir dans cette famille.

**`ruptureHaste` est un canal câblé que personne n'alimente.** `pressure.js:186` lit
`ruinEffectSum("ruptureHaste")` et aucun nœud ne le fournit (vérifié : une seule occurrence
dans tout `src`). C'est une contrepartie prête à l'emploi pour n'importe quelle récompense qui
a besoin d'un prix payé en pression.

**Nourriture et Or ne prennent que la racine du multiplicateur global** (`Math.sqrt(mult)`,
`rates.js:124-125`, miroir Decimal `:188-189`) là où population, savoir et infrastructure
prennent le multiplicateur entier. Rien dans le jeu ne touche cet exposant, donc c'est un
levier libre. **Piège signalé par un jury** : relever l'exposant de la Nourriture éteint le
foyer `scarcity`, qui est le principal générateur auto-entretenu de Rupture. À ne tenter que
sur l'Or.

**Aucune valeur numérique finale avant l'audit de production.** Toutes les pistes doivent
énoncer de quoi leur valeur dépend, pas un chiffre.

**Un seul Mythe par gisement.** Le palier de jalon et la crise terminale ne peuvent pas être
distribués à six et quatre Mythes. Un chacun, deux au maximum, sinon on fabrique des
récompenses interchangeables.

---

## 6. Ce qui reste à trancher

1. **La répartition des quatorze Mythes sur les cinq axes**, et le nombre de couches par axe.
2. **Le sort des six slots de Ruines actives vides** (remplir ou baisser le seuil d'Antée).
3. **Le conflit Phénix contre la famille « serment »** : adapter le script, ou renoncer à la
   famille.
4. **Les réparations du §2** : à intégrer au lot de l'audit de production, elles le recoupent
   probablement.
5. **La forme des défis**, pas seulement des récompenses : sortir les contraintes de cycle du
   régime « ×N sur une stat ».

---

## 7. Où sont les choses

- Ce document : `docs/REFONTE-MYTHES.md`
- Les 130 pistes brutes avec notes et critiques : `docs/REFONTE-MYTHES-annexe-idees.md`
- Données des Mythes : `src/game/data/myths.js`, `src/game/data/activeRuins.js`
- Logique : `src/game/core/actions/myths.js`, `src/game/core/actions/crisis.js`
- Effets : `src/game/core/mechanics/production/mythEffects.js`, `src/game/core/mechanics/prestige.js`
- Persistance : `GR_PERSISTENT_FIELDS` et `resetTemporaryRunState` dans `src/game/core/state.js`
- Run du workflow (transcripts et journal) : `wf_86ce351f-e57`
