# Civilisation Effondrement - Synthese d'equilibrage

> Genere par `simulate-ce.js` (budget demande 24 h virtuelles, pas 5s).
> **Temps virtuel reellement simule : 1j 0h 0m**.
> Formules reelles importees de `src/game/**`. Tout jalon non atteignable est **flagge**, jamais invente.
> Les jalons "NON ATTEINT" le sont faute de temps reel de calcul, pas forcement par design : relancer avec `--maxreal` plus grand pour aller plus loin.
> Cibles de pacing = **placeholders indicatifs** a calibrer par le designer.

## Scenarios
- **idle** - aucune action manuelle (plancher "automation seule" ; depuis un save vierge aucune automation n'est debloquee).
- **optimized** - achat best-first + arbre de ruines + dynasties + grand resets + pilotage des Mythes.
- **no-mythes** - identique a optimized mais **aucun Mythe active** (groupe de controle ; plafonne au Grand Reset 10, ne peut pas atteindre le GR11).

## Synthese finale
| Scenario | Cycles | Dynasties | Grand Resets | Meilleur age | Ruines | Legitimite | Mult. | Prod./s |
|---|---|---|---|---|---|---|---|---|
| Optimise | 277 | 6 | 0 | Abris | 18 | 10 | x3.6 | 5.27K |
| Sans Mythes | 277 | 6 | 0 | Abris | 18 | 10 | x3.6 | 5.27K |
| Idle | 4 | 0 | 0 | Grand Feu | 8.0 | 0.0 | x1.3 | 13 |

## Jalons requis (scenario optimise)
| Jalon | Temps virtuel ecoule | Contexte | Mult. | Prod. | Prestige |
|---|---|---|---|---|---|
| Premier age | 0m 0s | cycle 0, Campement | x1.0 | 0.2/s | 0.0 ruines / 0.0 legit. |
| Dynastie 1 | 9h 47m | cycle 7, Campement | x1.0 | 0.3/s | 0.0 ruines / 0.0 legit. |
| Dynastie 10 | NON ATTEINT | - | - | - | - |
| Palier ruines 10 (dogme) | NON ATTEINT | - | - | - | - |
| Palier ruines 20 (dogme) | NON ATTEINT | - | - | - | - |
| Palier ruines 30 (dogme) | NON ATTEINT | - | - | - | - |
| Grand Reset 1 | NON ATTEINT | - | - | - | - |
| Grand Reset 10 | NON ATTEINT | - | - | - | - |
| Grand Reset 11 | NON ATTEINT | - | - | - | - |
| 1er Mythe debloque | NON ATTEINT | - | - | - | - |
| Acte I complete | NON ATTEINT | - | - | - | - |
| Acte II complete | NON ATTEINT | - | - | - | - |
| Acte III complete | NON ATTEINT | - | - | - | - |
| Tous les Mythes | NON ATTEINT | - | - | - | - |

## Evaluation des Mythes - gate de progression ou multiplicateur cosmetique ?

### Catalogue (analyse statique depuis data/myths.js, 9/14 vrais gates)
| Acte | Mythe | Role | Objectif (gate intra-mythe) | Heritage permanent |
|---|---|---|---|---|
| I Fondation | Le Mythe du Chaos | multiplicateur | Atteindre 50 Ruines sans aucun bonus de méta-progression. | Les Ruines gagnées lors d'un cycle Chaos comptent double dans le calcul du multiplicateur global de Ruines, en permanence. |
| I Fondation | Le Mythe de Prométhée | multiplicateur | Atteindre 500 habitants AVANT que la Rupture ne dépasse 80%. Dépasser le seuil fatal en premier = échec. | Braisiers ancestraux : chaque cycle démarre avec un bonus de production de Nourriture x2 pendant 2 minutes. |
| I Fondation | Le Mythe d'Énée | **GATE** | Effectuer au moins 3 migrations avant l'effondrement. | Migration fondatrice : chaque nouveau cycle démarre avec un boost de production globale (+10% par effondrement passé, jusqu'à +100%) pendant |
| I Fondation | Le Mythe de Cadmos | **GATE** | Avoir nomme au moins 3 Ages dans la Chronique avant l'effondrement. | Noms de Pouvoir : apres chaque run, graver un Age de la Chronique comme Epitaphe Permanente. Chaque Epitaphe donne +2% permanent a son orien |
| I Fondation | Le Mythe d'Héphaïstos | **GATE** | Bâtir une Infrastructure d'au moins 1x le pic de Population, pendant que la Population décline d'au moins 20% depuis ce  | Automates ancestraux : débloque un panneau "Automates" dans les Options pour activer des automatisations permanentes dans toutes les runs fu |
| II Domination | Le Mythe de Sisyphe | multiplicateur | Accumuler 50 000 de Trésor malgré l'inflation des coûts. | Réduit de façon permanente le facteur de scaling des coûts de tous les bâtiments de 10% (l'inflation naturelle croît plus lentement pour tou |
| II Domination | Le Mythe de Babel | multiplicateur | Porter le multiplicateur exponentiel jusqu'à x5 (~33 bâtiments du type choisi). | Synergie d'Urbanisme : sur la carte, chaque bâtiment du même type placé côte à côte accorde +10% de production par voisin du même type (halo |
| II Domination | Le Mythe de l'Âge d'Or | multiplicateur | Accumuler 75 000 de Trésor sans laisser la population croître de plus de 25% depuis le début du cycle (une cité dorée qu | Équilibre Doré : quand l'écart entre Nourriture et Trésor est inférieur à 15%, l'Usure monte 20% plus lentement — en permanence, dans toutes |
| III Apocalypse | Le Mythe d'Atlas | **GATE** | Survivre au moins 45 minutes de cycle actif, OU résister à 10 vagues de crises avant l'effondrement. | 1) L'Usure de base est réduite de 15% en permanence. 2) Débloque la jauge "Légitimité" (0-100, démarre à 50 chaque cycle). Quand elle est ha |
| III Apocalypse | Le Mythe d'Icare | **GATE** | Atteindre 5000 d'Infrastructure avant l'effondrement automatique. | Surchauffe : débloque un bouton activable pendant les runs normaux. Active x5 production pendant 30s (+25% Rupture instant). Cooldown : 2 mi |
| III Apocalypse | Le Mythe du Phénix | **GATE** | Sur 20 cycles, accumuler un total de 400 Ruines. | Script d'Automatisation : débloque un panneau dans les Options pour définir des conditions d'effondrement automatique dans toutes les runs f |
| III Apocalypse | Le Mythe des Atrides | **GATE** | Atteindre un Trésor net (Trésor moins Dette) de 100 000 Or avant de vous effondrer. | Débloque le bouton 'Pacte des Atrides' en début de cycle normal (runs normales) pour doubler la production pendant 2 minutes en échange de - |
| III Apocalypse | Le Mythe d'Antee | **GATE** | Activer au moins 2 Heritages avec leur malus (placeholder) et atteindre 10 000 de puissance (placeholder). | Ruines actives : dans les runs futures, chaque debut de cycle propose de choisir volontairement des Heritages avec leur malus. Les Ruines ga |
| Ragnarok | Ragnarok | **GATE** | En un seul cycle, atteindre 1 000 000 de puissance ou posseder 10 000 Ruines avant l'effondrement. | La Fin des Dieux : debloque le 11e Grand Reset, qui donne un multiplicateur x4 aux Ruines, et grave un titre final permanent dans la Chroniq |

### Deltas mesures en simulation

> **Aucun Mythe tente** : le scenario n'a pas atteint le **Grand Reset 1** dans le budget de 24 h
> (les Mythes sont verrouilles tant que `grandResetCount < 1`, cf. `isMythUnlocked` dans `myths.js`).
> Augmente `--hours` pour franchir ce verrou.

## Zones mortes de progression (> 10 min, < 5 % de gain de production)
Aucune zone morte detectee sur la fenetre echantillonnee.

## Recommandations de reequilibrage
- [^] **dynasty_1** atteint en 9h 47m (cible ~60 min) - **trop lent**. Adoucir la courbe (couts, gain de ruines/legitimite).
- [!] **dynasty_10** non atteint (sim budget, cible indicative ~600 min) - relancer avec --maxreal plus grand pour confirmer le pacing reel.
- [!] **gr_1** non atteint (sim budget, cible indicative ~1440 min) - relancer avec --maxreal plus grand pour confirmer le pacing reel.
- [!] **gr_10** non atteint (sim budget, cible indicative ~14400 min) - relancer avec --maxreal plus grand pour confirmer le pacing reel.
- [!] **gr_11** non atteint (sim budget, cible indicative ~20000 min) - relancer avec --maxreal plus grand pour confirmer le pacing reel.
- [!] **all_myths** non atteint (sim budget, cible indicative ~12000 min) - relancer avec --maxreal plus grand pour confirmer le pacing reel.
- [?] Objectifs de Mythes non calibres (marques "placeholder") : Le Mythe d'Antee - valeurs cibles a finaliser dans data/myths.js.
- [i] Repartition des heritages : 9 gates (mecanique persistante) vs 5 multiplicateurs (du Chaos, de Prométhée, de Sisyphe, de Babel, de l'Âge d'Or). Les multiplicateurs purs sont les candidats a un enrichissement s'ils paraissent cosmetiques.

## Pointeurs formules (source de verite)
- Production / taux : `src/game/core/mechanics.js` -> `rates()`, `globalMultiplier()`, `buildingOutputMultiplier()`.
- Multiplicateur de Ruines : `ruinMultiplier()` (1 + ruins^0.62 x 0.09, cf. `balance.js`).
- Gain de Ruines a l'effondrement : `ruinGain()` (patience/profondeur/sediment).
- Legitimite : `legitimacyGain()` ; dynastie : `actions/myths.js -> foundDynasty()`.
- Grand Reset : `actions/building.js -> performGrandReset()` (x2 prod/reset, 11e = x4 ruines si Ragnarok).
- Dogmes (paliers 10/20/30) : `data/upgrades.js -> PRESTIGE_DOGMAS` + `ownedRuinBranchPurchaseCount()`.
- Mythes (actes, conditions, heritages) : `data/myths.js -> MYTHS`, deblocage `isMythUnlocked()`.

## DECOUVERTE CLE : degenerescence de l'effondrement en fin de partie
Le bot optimise (toutes strategies) **se bloque autour du cycle ~334 / ere 5-7**, AVANT le 1er Grand Reset, a cause d'une
degenerescence du systeme d'effondrement. Deux faces du meme probleme, mesurees dans le code :
1. **Cite trop stabilisee -> ineffondrable.** Avec l'automation `protocoles_urgence` (auto-rationnement a 65 % de Rupture) +
   l'Usure gelee par une infrastructure enorme + scarcity=0 (surplus de Nourriture), la Rupture **plafonne sous 1** : la crise
   terminale ne s'ouvre jamais (cible de pression mesuree ~3.0, mais instabilite bloquee a ~0.70). Aucun effondrement -> meta-progression gelee.
2. **Cite trop puissante -> effondrement a gain nul.** Sans cette stabilisation, l'economie composee fait monter la Rupture a 100 %
   en **moins de 120 s** : a cet age, `ruinGain()` a `minGain=0`, patience 0.18 et un pic de population minuscule -> **gain = 0 Ruine**.
   L'effondrement ne produit rien, donc la progression n'avance pas.

**Implication d'equilibrage** : les declencheurs d'effondrement (Rupture/Usure) **ne montent pas a l'echelle** d'une economie maximisee.
Passe un certain point, soit la cite ne peut plus tomber, soit elle tombe pour 0. Un humain peut peut-etre naviguer ce point en
effondrant a la main au bon moment, mais c'est un vrai point de friction : le GR1 (et donc tout le contenu Mythes/Actes/GR2-11)
est de fait **bloque derriere cette degenerescence**, pas seulement derriere le temps de calcul.
> Pistes : faire croitre la profondeur de `ruinGain()` avec la taille reelle de la cite meme a faible age ; plafonner la
> stabilisation auto ; ou indexer le seuil de crise sur l'echelle economique.

### Hypotheses / formules a clarifier (flaggees)
- **Patience de `ruinGain()`** recompense les cycles longs (jusqu'a x1.75 + sediment x5 au-dela de 7 j) : le pacing depend fortement de la strategie d'effondrement.
- **Objectifs de Mythes** : plusieurs sont a atteindre *avant* l'effondrement et ne sont pas garantis par le bot (voir tableau).
- **GR11 = Ragnarok** : exige tous les Mythes completes ; atteignable en simulation seulement si le pilote complete les 13 Mythes + Ragnarok.
