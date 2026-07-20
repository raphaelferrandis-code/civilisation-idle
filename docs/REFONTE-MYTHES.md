# Refonte des Mythes — diagnostic et axes de conception

> Objectif : sortir les Mythes du régime « multiplicateur de production » pour en faire des
> **défis tirés des systèmes réels du jeu** et des **récompenses qui approfondissent une
> facette**, sur le modèle de ce qu'ont réussi Héphaïstos et Phénix côté idle.
>
> C'est le même geste que [REFONTE-ARBRE-RUINES.md](REFONTE-ARBRE-RUINES.md) (« remplacer les
> bonus impersonnels par des bonus propres aux mécaniques du jeu »), appliqué cette fois aux
> quatorze Mythes.
>
> **État au 2026-07-18, fin de session : le chantier repart sur d'autres bases.**
>
> Ce qui reste acquis : les blocages du §2 sont **réparés et livrés** (509 tests verts). Le
> diagnostic du §1 tient — onze héritages sur quatorze se réduisent à un pourcentage.
>
> Ce qui est **abandonné** : la colonne « la chute », son modèle en couches, et le moteur de
> « La Veille du feu » (implémenté puis retiré). Deux raisons, dans cet ordre.
>
> 1. **La mesure l'a condamné.** Un banc headless comparant trois profils sur 12 h virtuelles a
>    montré que la Veille est une **perte nette** : le joueur qui la règle au maximum récolte
>    5,6 % de ce que récolte le même joueur sans elle, et le cadran est dominé à tous ses crans.
>    Trois contre-expertises ont reproduit les chiffres à l'identique — et démonté l'explication
>    causale proposée. **On ne sait toujours pas pourquoi.**
> 2. **La méthode était fausse.** Le premier résultat annonçait « jouer sa fin à la main bat le
>    farm automatisé ×580 ». La contre-expertise a montré que le profil automatisé était un homme
>    de paille (on lui avait interdit de gérer sa Rupture) : face à un adversaire correctement
>    joué, l'écart tombe à ×2,9 et varie d'une graine à l'autre. Pire, au vrai optimum de
>    réglage, **le meilleur profil manuel ne scelle aucune préparation terminale**.
>
> Ce que le détour a coûté et rapporté : les décisions D6→D9 et la grille du §4.0 sont
> **suspendues** (elles répondaient à une question d'architecture, pas de plaisir de jeu). Mais
> le §2 a été réparé, le banc de mesure aussi, et on sait maintenant que le farm hors-ligne est
> **435× plus faible** que ce qu'on croyait — il est plafonné par `idleCapSeconds` et ne
> rachète jamais l'arbre des Ruines. Ce dernier fait resservira.
>
> **La nouvelle direction** : les quatorze Mythes doivent devenir *mémorables*. Les défis
> existants tiennent debout mais sont fades et interchangeables — ils gardent leur structure et
> gagnent du caractère, en cohérence avec le jeu tel qu'il est aujourd'hui. Les récompenses,
> elles, sont à refaire entièrement.

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

> **État : lot de réparation LIVRÉ le 2026-07-18.** Cette section a été réécrite après
> vérification par exécution : deux de ses quatre thèses initiales étaient fausses, et deux
> blocages qu'elle ne voyait pas ont été trouvés. Ce qui suit est l'état constaté, pas
> l'hypothèse de départ. 509 tests verts, dont 11 nouveaux qui barrent les classes de bugs.
>
> Corrections de forme au passage : le fichier d'équilibrage est `src/game/core/balance.js`
> et non `src/game/data/balance.js` — les chemins cités par la première version de ce
> document étaient faux.

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

**Ce que le diagnostic initial n'avait pas vu : supprimer la ligne ne suffit pas.** Tout
joueur capable d'atteindre Antée a nécessairement déjà complété Prométhée (les Actes
s'enchaînent en cascade), donc a déjà perdu le drapeau — et il ne peut pas le regagner, car
`activateMyth` refuse un Mythe déjà complété : `applyHeritage()` ne rejoue jamais. Sans
migration, le correctif ne débloque **personne** parmi les joueurs concernés. D'où le bump
`CURRENT_SAVE_VERSION` 3 → 4, avec une migration qui re-dérive le drapeau de
`mythsCompleted`, seule trace survivante de la réussite.

**Effet de bord traité dans le même lot.** Rallumer les Braisiers réveille un code jusque-là
mort, et la boucle hors-ligne crédite le temps restant *à taux constant* : le ×2 Nourriture
se serait appliqué à des heures de crédit au lieu de deux minutes. Le crédit linéaire est
désormais scindé à la sortie de la fenêtre.

### 2.2 Antée est infaisable, donc le Ragnarok est inatteignable

`ANTEE_MIN_ACTIVE_RUINS = 4` (`activeRuins.js:12`) mais seules **trois** Ruines actives sont
réellement sélectionnables. Sur les dix définitions, six sont `pending: true`, affichées
« slot futur » et `disabled` (`myths.js:94`), puis filtrées hors de `allowedIds`
(`myths.js:104`). La septième, « Braisiers ancestraux », a pour `stateKey`
`prometheeBraisiers`, donc elle disparaît de la liste à cause du bug §2.1.

Il reste `enee`, `age_or`, `hephaistos`. `onCollapse()` d'Antée ne peut jamais renvoyer
`true`. Antée étant en Acte III et le Ragnarok exigeant tous les Mythes des Actes I à III, la
fin du jeu est verrouillée.

**Résolu par §2.1 seul.** Sonde exécutée sur `defaultState()` avec les dix drapeaux posés :
le pool des sélectionnables vaut 4 avant `resetTemporaryRunState` et 3 après. Une fois la
ligne fautive supprimée, il reste à 4, et `4 >= ANTEE_MIN_ACTIVE_RUINS` est satisfait :
Antée redevient franchissable, le Ragnarok atteignable. **Le seuil n'a pas été touché** — le
baisser aurait été une décision d'équilibrage déguisée en réparation, et ce document
s'interdit tout chiffre final avant l'audit (§5).

Reste ouvert, et c'est du design, pas de la réparation : **le sort des six slots vides**.
Remplir un slot donne pool 5 / seuil 4, soit six sélections valides — ça *ajoute* du choix,
là où baisser le seuil ne fait qu'abaisser la barre. Voir §6.

**Piège d'interface réparé au passage.** À pool 4 / seuil 4, toute sélection autre que « les
quatre » est un échec garanti et silencieux — et le dialogue proposait encore un bouton
« Aucune Ruine active — *Tenter Antée sans malus actifs* », c'est-à-dire une défaite en un
clic. Sous Antée, ce bouton n'est plus proposé, le seuil requis est annoncé dans le texte, et
« Valider » reste inerte tant que la sélection est sous la barre.

### 2.3 ~~La Moisson de crise sature à trois crises~~ — thèse RÉFUTÉE

**La saturation décrite n'existe pas.** Il n'y a que **trois paliers de crise** dans tout le
jeu (`CRISIS_EVENTS` = `_25`/`_50`/`_75`, `src/game/data/world.js`), et chacun est latché dès
l'ouverture de sa crise. Le compteur `cycleCrisesResolved` est donc borné à 3 **par
construction**, et le cap `0,30 = 3 × 0,10` ne rogne jamais rien. La phrase « un cycle late
game en produit bien davantage » est fausse : c'est impossible. Il n'y a pas de choix mort ici.

Ce qui était vrai : les commentaires mentaient bel et bien (« +3 % » pour une valeur de 10 %),
aux deux sites. Corrigés — et correctement cadrés cette fois, car la première rédaction du
correctif mentait elle aussi par omission (voir ci-dessous).

**Trois précisions qui comptent pour la refonte**, toutes vérifiées :

1. Le facteur multiplie `raw` **seul** ; `eraFlatBonus` est ajouté après. Le bonus réel sur le
   gain versé va donc de ~0 % (cité jeune post-Grand Reset, où le plat domine) à +30 % (late
   game). Le « ×1,30 » n'est vrai qu'asymptotiquement — ne pas dimensionner sur ce chiffre.
2. Le compteur ne s'incrémente que si la résolution **fait baisser l'instabilité**, pas si le
   joueur a simplement répondu.
3. Le nœud vaut ×1 sous **deux Mythes** : le Chaos (qui vide tout l'arbre des Ruines) et
   Héphaïstos sous son seuil de population (la crise s'impose sans choix et fait *monter*
   l'instabilité, alors que le palier a déjà été consommé). À verser au dossier de la refonte,
   pas seulement à celui de l'équilibrage.

### 2.3 bis Le latch des crises fuit du hors-ligne vers le jeu en ligne — RÉPARÉ

Le vrai bug, que ce document n'avait pas vu, et qui est plus gros que celui qu'il décrivait.

`simulateAwayCrises` pré-latche les trois paliers pour éviter d'ouvrir des dialogues pendant
la simulation hors-ligne. Son bloc `finally` restaure `Date.now`, les pauses et l'historique
— **mais pas `state.crisisThresholds`**, et `applyOfflineProgress` persiste l'état juste
après. Conséquence : après toute session hors-ligne éligible, le joueur revient dans un cycle
en ligne **sans aucune crise narrative**, jusqu'au prochain effondrement.

Le rayon de souffle dépasse largement la Moisson : plus de dialogues de crise, plus de
modulation d'instabilité, compteurs d'Olympe gelés (donc `crisisResolutionRatio` retombe au
neutre et **le profil olympien est biaisé** pour tout joueur à forte composante idle), et la
Chronique enregistre zéro crise.

C'est un bug d'état sans arbitrage de design, et son correctif va dans le sens protecteur :
il rend des crises au joueur, il n'en retire pas. Réparé, avec un test qui échoue sur le code
d'avant (les trois paliers y ressortent latchés).

### 2.4 L'inflation de Sisyphe compte les lots, pas les unités — CONFIRMÉ, sorti du lot

`state.sisypheMult` s'incrémente une fois par **appel** de `buyBuildingCore`
(`src/game/core/actions/building.js`). Un achat groupé de 500 unités compte pour un cran, là
où 500 achats unitaires comptent pour 500. Deux lignes plus bas, l'effet de Prométhée fait
bien `amount * PROMETHEE_RUPTURE_PER_FOOD` : la convention par unité est déjà établie dans la
même fonction, ce qui tranche l'intention.

**Mais ce n'est pas une correction de comptage, c'est une refonte.** Mesuré :

| régime | `sisypheMult` atteint à la cible de 180 bâtiments |
|---|---|
| achats groupés (le vécu réel) | **×2,4 à ×3,3** |
| correctif naïf par unité, constante inchangée | **×204** |
| idem, avec l'achat auto hors-ligne sur 8 h | **≈ 1e74** |

La dernière ligne est le point bloquant : la boucle hors-ligne rejoue le vrai `tick()`, donc
`checkAutomateRules()`, donc jusqu'à plusieurs milliers d'achats — le joueur reviendrait sur
un cycle Sisyphe mort sans explication. Un correctif juste demande quatre choses ensemble :
compter les unités, **retuner la constante**, router l'achat auto par le cœur d'achat (il
contourne aujourd'hui la malédiction entièrement), et corriger le prix intra-lot (sans quoi
un lot de 500 reste ~175 000× moins cher que 500 achats unitaires).

Retuner la constante est un chiffre d'équilibrage définitif, que le §5 interdit avant
l'audit. **Sorti du lot de réparation**, à traiter dans la colonne où vit déjà Sisyphe.

Un seul morceau a été livré, parce qu'il est gratuit et que le mensonge s'aggravait : l'UI
annonçait « Production ×N » pour un multiplicateur de **coût**. Aujourd'hui elle affiche
« ×1,06 », donc c'est anodin ; après correctif elle aurait affiché « ×204 », lu comme un buff
massif. Le libellé dit désormais « Coûts × ».

### 2.5 L'héritage de Babel récompense un placement que le joueur ne décide pas

Trouvé pendant la vérification, absent du diagnostic initial.

`babelAdjacencyMultiplier` moyenne le bonus d'adjacence **sur toutes les tuiles de la carte**,
dont le placement est attribué automatiquement par `layout.js`. Le joueur n'a aucune prise, et
la moyenne écrase les variations : c'est une constante opaque qui dérive au gré de
l'auto-placement.

Ce n'est pas un bug — c'est pire. C'est un héritage qui **viole D3 par construction** (il ne
rend rien de pilotable), et le seul qui dépendait de la carte, que D2 gèle en tant que rendu.
Il ne se répare pas : il se reconçoit. C'est un point d'entrée tout trouvé pour la couche de
Babel.

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

**D6. Le Ragnarok est affranchi.** *(2026-07-18 — décision qui commande la forme de tous les
défis.)* Il cesse de rejouer les treize contraintes simultanément et devient une épreuve
autonome qui cite les Mythes thématiquement.

> **Pourquoi c'est structurel et pas cosmétique.** La superposition des treize ne fonctionnait
> que parce que chaque contrainte est un modificateur multiplicatif : des `×N` **commutent**,
> des verbes non (« ne t'effondre pas pendant 20 min » et « effondre-toi cinq fois » ne peuvent
> pas coexister). Autrement dit, le Ragnarok tel qu'il était **imposait le régime `×N` aux
> treize autres défis** — exactement ce que le §6.5 veut supprimer. L'affranchir lève la
> contradiction : chaque défi peut désormais être un verbe, une fenêtre, une séquence.
>
> Dette technique — **SOLDÉE le 2026-07-20** avec la refonte « l'Hiver Fimbul » :
> `RAGNAROK_CONSTRAINTS`, la branche ragnarok de `isMythEffectActive`, les champs
> `ragnarokSummary`, `ragnarokEffectsApplied` et `ragnarokActiveConstraints` ont
> tous été supprimés. Le Ragnarok n'applique plus aucune superposition : c'est une
> apocalypse scriptée en 3 fléaux (Hiver 8 min, Loup 14 min, Feu 20 min, Fin 24 min)
> conjurée par l'Arche (8 offrandes au prix figé en secondes de production).

**D7. Un Mythe accompli le reste.** *(2026-07-18.)* Réécrire les quatorze récompenses invalide
les treize drapeaux d'héritage de `GR_PERSISTENT_FIELDS`, y compris dans les saves existantes.
Règle retenue : le défi gagné sous les anciennes règles ouvre droit à la **nouvelle**
récompense, accordée par migration. On a mesuré le prix de l'option inverse avec Prométhée
(§2.1) : un héritage perdu est irrécupérable, puisque `activateMyth` refuse de rejouer un Mythe
déjà complété. Toute réécriture de récompense doit donc arriver **avec sa migration**.


**D8. Les héritages restent permanents — donc ils doivent être des verbes.**
*(2026-07-18.)* Un Mythe se gagne une fois et son héritage est acquis à vie. Le modèle
« panthéon » — N héritages, quelques emplacements, on recompose entre deux cycles, à la manière
de Cookie Clicker — a été examiné et **écarté**.

> **La contrainte que ça impose.** Un héritage permanent et *passif* est le pire cas
> concevable : quatorze nombres empilés en silence, invisibles, c'est-à-dire précisément le
> défaut que ce document diagnostique. Un héritage permanent et *verbe* ne souffre pas de sa
> permanence — c'est un geste que le joueur repose à chaque cycle. **Choisir la permanence rend
> donc D3 obligatoire au lieu de souhaitable** : à partir d'ici, une récompense passive n'est
> plus seulement médiocre, elle est interdite.
>
> Corollaire, qui répond à l'objection « quatorze événements ponctuels dans un jeu de
> répétition » : les Mythes sont bien des épreuves uniques, mais leurs récompenses sont des
> gestes rejoués. La rejouabilité vit dans l'USAGE de l'héritage, pas dans la recomposition
> d'un équipement. Les trois couches de la colonne « la chute » le font déjà — la Veille se
> règle à chaque fin, le Manifeste se recharge à chaque chute, l'Altitude se revole.
>
> Les Ruines actives d'Antée ne sont pas contredites : elles font choisir des FARDEAUX, pas
> quels héritages sont allumés.
>
> **Corollaire d'automatisation, découvert en implémentant la couche 1.** Le verbe d'un
> héritage ne doit jamais exiger une déclaration *par cycle*. Le end-game est explicitement
> automatisé (Automates d'Héphaïstos, Script du Phénix, farm hors-ligne qui enchaîne jusqu'à
> plusieurs centaines d'effondrements sans personne devant l'écran) : un réglage à reposer à
> chaque tour serait de la friction en ligne et **impossible hors-ligne**. La forme qui marche
> est donc : un **réglage permanent** qui ouvre une **phase jouable**, le verbe vivant dans la
> phase et non dans le réglage.
>
> Contrainte qui en découle, et qui a déjà mordu : toute mécanique de fin de cycle doit être
> vérifiée **sur le chemin hors-ligne autant qu'en ligne**. La Veille a été livrée avec un
> défaut de cette exacte nature — `applyOfflineProgress` sortait sur l'ouverture de la fenêtre,
> si bien qu'un cadran large faisait perdre des absences entières au joueur automatisé. Le
> prédicat porte désormais sur le GEL.

**D9. Les Mythes portent le nom de leur épreuve, pas celui d'un dieu.** *(2026-07-18.)* On
abandonne les noms de divinités au profit de noms inventés qui **encodent la fonction**.

*Pourquoi.* Le panthéon actuel n'en est pas un : Chaos, Prométhée, Cadmos, Héphaïstos, Sisyphe,
Atlas, Icare, Atrides et Antée sont grecs, mais Énée est romain, Babel mésopotamien, et
**Ragnarok est norrois** — le capstone vient d'une autre mythologie que les treize qu'il
couronne. On ne perd donc aucune cohérence : on en gagne une. Et un nom emprunté crée une
attente que la mécanique dément (« Babel » n'annonce pas des manifestes de cargaison), là où un
nom inventé se comprend sans glose. Signal qui a déclenché la décision : justifier Prométhée en
couche 1 a demandé un détour par l'étymologie grecque — quand il faut ça, le nom ne porte pas sa
fonction.

*Bénéfice de structure.* Chaque Mythe portait jusqu'ici **deux** noms — l'épreuve (« Le Mythe de
Prométhée ») et l'héritage (« Les Braisiers ancestraux »). Deux vocabulaires pour un seul objet.
On les fusionne : le Mythe s'appelle comme son épreuve. Les trois designs de la colonne « la
chute » le font déjà naturellement — *La Veille du feu*, *Le Manifeste de la cale*, *L'Altitude*.

*Quand.* **On nomme un Mythe quand son design est validé** — ni avant (le nom serait décoratif),
ni tous à la fin (on retarderait ce qui est déjà mûr).

> ⚠ **On renomme les LIBELLÉS, jamais les identifiants.** `mythe_de_promethee`, `mythe_du_chaos`
> et consorts sont les clés de `mythsCompleted` dans toutes les saves, et les migrations v4/v5
> s'appuient dessus. Renommer un id coûterait une migration de save pour un changement
> cosmétique.
>
> Coût d'art mesuré : 8 icônes portent un nom de divinité, et **6 Mythes n'en ont aucune** — le
> jeu est déjà incomplet à moitié. Ces icônes illustrent un concept (un rocher, une aile), pas
> un visage : la plupart survivent au renommage sans être redessinées.
---

## 4. Les cinq axes

Par ordre de rendement estimé.

### 4.0 La grille de travail

Cadre adopté le 2026-07-18 pour cesser de rediscuter chaque piste depuis zéro. **Révisable** :
c'est une hypothèse de structure, pas une décision gravée comme D1-D9.

Une fois Héphaïstos et Phénix gelés (§4.5) et Chaos et Antée attribués à la méta (§4.4), les
**neuf Mythes restants se répartissent exactement 3/3/3 sur les trois Actes**. D'où trois
colonnes de trois couches, une couche par Acte :

| Colonne | Acte I | Acte II | Acte III |
|---|---|---|---|
| **La chute** | Prométhée | Babel | Icare |
| **La fondation** | Énée | Sisyphe | Atrides |
| **La gouvernance** | Cadmos | Âge d'Or | Atlas |
| *La méta* (§4.4) | Chaos | — | Antée |
| *L'idle* (gelé, D1) | Héphaïstos | — | Phénix |

Le Ragnarok reste hors grille : depuis D6, c'est une épreuve autonome.

Les affectations suivent le thème déjà écrit — Énée *est* une fondation (migrer, abandonner
ses bâtiments), Atlas *est* la gouvernance (Légitimité, crises, porter le poids), Atrides *est*
l'héritage empoisonné qu'on transmet, Icare *est* la chute qu'on ne peut plus arrêter à la main.

Effet de structure recherché : l'Acte cesse d'être un mur de déblocage. Acte I, le joueur
découvre cinq facettes ; Actes II et III, elles s'approfondissent. C'est D5 rendu concret.

**Verbe de chaque colonne**, à tenir pour que les couches ne redeviennent pas des bibelots :

- **La chute** — *piloter sa propre fin.* Couche 1 : la fin devient **datable**. Couche 2 :
  **négociable**. Couche 3 : **poussable**, on parie sur sa prolongation.
- **La fondation** — *fonder avec intention.* Couche 1 : choisir la **nature** de la cité (une
  charte, pas un plan — D2 interdit le spatial). Couche 2 : choisir **ce qu'on emporte**.
  Couche 3 : choisir **ce qu'on doit**.
- **La gouvernance** — *gouverner entre deux chutes.* Couche 1 : la charte a un effet vivant
  qu'on peut changer à un prix. Couche 2 : le budget de politiques cesse d'être posé puis
  oublié. Couche 3 : les crises deviennent un vrai système.

> Bénéfice non évident : Chaos et Antée font déjà **le même geste** (choisir ses handicaps en
> début de cycle), ce que l'annexe signalait comme une « collision frontale ». En couches, ce
> n'est plus une collision — Chaos = le handicap existe, Antée = il devient un équipement
> complet. La redondance documentée devient la profondeur de la colonne.

**Ordre de chantier** : une colonne de bout en bout avant d'en ouvrir une autre — le modèle en
couches est une hypothèse non testée, autant la casser sur trois Mythes que sur neuf. On
commence par la chute, l'axe le mieux noté. Le descripteur de Mythe et le banc d'essai seront
**extraits** de ce que cette première colonne aura réellement exigé, pas conçus à l'avance.

### 4.1 La chute (le plus prometteur)

**Ce qui tourne tout seul aujourd'hui.** *(Mesuré par exécution le 2026-07-18 — la première
rédaction de ce paragraphe était fausse sur un point important.)*

La fenêtre terminale s'ouvre sur `crisisOpen()` = `instability >= 1 || timeWear >= 1`, détectée
par le tick qui appelle `triggerCollapseChoices`. **Le joueur ne décide jamais quand la fin
s'ouvre** : ni anticipation, ni report, ni préavis. C'est le premier vide.

Une fois ouverte, **tout gèle**. Le tick sort en cinq lignes. Vérifié : 600 ticks, soit dix
minutes simulées — toutes les ressources et les deux jauges strictement inchangées. L'horloge
de la moisson est figée elle aussi (`cycleClockNow()` renvoie `crisisOpenedAt`), donc `ruinGain`
et la patience ne bougent plus : **contempler ne coûte rien et ne rapporte rien**. Toute
l'interface est verrouillée sauf l'onglet prestige, les quatre jeux du Temple s'éteignent,
l'Intendance s'arrête.

> **Correction : on ne scelle jamais trois préparations.** `runTerminalCrisisAction` rabat la
> jauge sur sa cible puis appelle `resumeAfterCrisisOutcome` et remet `crisisLimitAnnounced` à
> `false` — **inconditionnellement**. Un édit **referme donc toujours la fenêtre** et relance
> la cité. Au plus **une** préparation par ouverture. Le vide n'est pas « après les trois
> sceaux » : il est *permanent*, puisque la fenêtre n'offre jamais qu'un seul geste payant, un
> choix de sceau gratuit, et le bouton d'effondrement.

Deux trouvailles annexes, à traiter à part :

- **Piège hors-ligne réel.** `applyOfflineProgress` retourne immédiatement si
  `crisisLimitAnnounced`. Une fenêtre laissée ouverte pendant une absence **gèle la partie pour
  toute la durée**, sans production ni crédit. Un joueur qui ferme son navigateur au mauvais
  moment perd sa nuit.
- **Verbe mort.** La Surchauffe d'Icare reste cliquable dans la fenêtre, mais le tick est gelé :
  le multiplicateur ne s'applique à rien et le cooldown se consomme à vide.

Substrat : `TERMINAL_PREP_TIERS` dans `src/game/core/crisis-cost.js`,
`runTerminalCrisisAction` et `triggerCollapseChoices` dans `src/game/core/actions/crisis.js`.

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
une fois puis oublié.

**Pourquoi c'est le bon axe** : c'est la « gestion de ville » au sens propre, sans carte.

**Matériau à jour** : les réparations du §2 ont dégagé le terrain. La « saturation à trois
crises » n'existait pas, mais la fuite du §2.3 bis privait de crises tout cycle suivant une
session hors-ligne — donc le système paraissait plus mort qu'il ne l'est. Reste une vraie
question de design, à trancher à l'audit et non ici : **les crises doivent-elles compter
hors-ligne ?** Elles valent ×1 en permanence dans la boucle idle, sur 20 à 500 effondrements
selon les capstones. C'est un curseur de premier ordre sur toute la boucle late game.

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

**Le Savoir et l'Infrastructure ne traversent PAS la mort.** Les taux de conservation
`knowledgeKeep` et `infraKeep` sont consommés dans `completeCollapse` mais **aucun nœud ne les
fournit** — ils valent zéro. `goldKeep` est dans le même cas. Seuls `allKeep` et un `foodKeep`
de dogme existent. Trois canaux câblés et vides sur la sortie du cycle, c'est-à-dire pile sur
la surface que D4 désigne. À ne pas confondre avec une opportunité gratuite : les brancher
ajoute de la puissance nette, donc il faut décider si l'on redistribue une somme constante ou
si l'on augmente le total.

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
2. **Le sort des six slots de Ruines actives vides.** Le seuil d'Antée reste à 4 et n'est plus
   un blocage (§2.2). La question devient donc purement additive : remplir des slots pour
   créer un arbitrage (pool 5 / seuil 4 = six sélections valides), ou laisser tel quel.
3. **Le conflit Phénix contre la famille « serment »** : adapter le script, ou renoncer à la
   famille.
4. ~~Les réparations du §2~~ — **faites** (2026-07-18), hors Sisyphe (§2.4) et Babel (§2.5),
   qui ne sont pas des réparations mais des reconceptions, à traiter dans leur colonne.
5. **La forme des défis**, pas seulement des récompenses : sortir les contraintes de cycle du
   régime « ×N sur une stat ».
6. ~~Le contrat de composabilité d'un défi.~~ — **tranché** : Ragnarok affranchi, cf. D6. Les
   défis sont libres de toute contrainte de commutation.

---

## 7. Où sont les choses

- Ce document : `docs/REFONTE-MYTHES.md`
- Les 130 pistes brutes avec notes et critiques : `docs/REFONTE-MYTHES-annexe-idees.md`
- Données des Mythes : `src/game/data/myths.js`, `src/game/data/activeRuins.js`
- Logique : `src/game/core/actions/myths.js`, `src/game/core/actions/crisis.js`
- Effets : `src/game/core/mechanics/production/mythEffects.js`, `src/game/core/mechanics/prestige.js`
- Persistance : `GR_PERSISTENT_FIELDS` et `resetTemporaryRunState` dans `src/game/core/state.js`
- Équilibrage : `src/game/core/balance.js` (⚠ pas `src/game/data/`)
- Migrations de save : `MIGRATIONS` et `CURRENT_SAVE_VERSION` dans `src/game/core/state.js`
- Boucle hors-ligne : `simulateAwayCrises` et `applyOfflineProgress` dans `src/game/core/main.js`
- Garde-fous du §2 : `src/game/core/__tests__/mythRepairs.test.js`, plus le test de classe
  « `resetTemporaryRunState` n'efface aucun champ persistant » dans `grandReset.test.js`
- Run du workflow de conception (130 pistes) : `wf_86ce351f-e57`
- Run du workflow de vérification des réparations : `wf_2cc303c0-d77`
