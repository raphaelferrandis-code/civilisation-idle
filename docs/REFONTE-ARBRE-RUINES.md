# Refonte de l'Arbre des Ruines — plan complet

> Objectif : remplacer les bonus impersonnels (+X % food / −Y % coûts) par des bonus
> **propres aux mécaniques du jeu**, quitte à réduire le nombre d'achats, et refondre
> le visuel en **arbre calciné aux veines de braise** (réf. arbre de talents Diablo IV),
> cohérent avec la DA sombre/or/antique du jeu.

---

## 1. Diagnostic de l'existant

**Données** (`src/game/data/upgrades.js`) : ~50 nœuds + 10 dogmes répartis en 4 branches
(`resilience`, `prosperity`, `knowledge`, `cycle_crise`), gating par compteur de palier
(`unlock[t]` nœuds inférieurs possédés), dogmes gratuits au seuil d'achats de branche.

**Le problème des bonus** : sur ~50 nœuds, ~34 sont des pourcentages anonymes —
14 `*Mult` (food/gold/knowledge/infra/pop), 5 `*Discount`, 8 `*Keep`, 5 `start*PctPeak`,
plus stability/timeWearSlow génériques. Ils portent tout le scaling méta mais ne
racontent rien. Les seuls nœuds mémorables sont précisément ceux qui touchent une
mécanique nommée : `conseil_de_crise` (doctrine auto), `edit_effondrement` (auto-collapse),
`veilleurs_nuit` (hors-ligne), `skill_archaeology` (exhumer), `trait_nomadism`/`trait_theocracy`
(contreparties), `foundation_ghosts` (ruines non dépensées), `chronicle_engine`, `recurring_ages`.
→ La refonte généralise ce qui marche déjà.

**Le problème du visuel** (`ruinsTree/layout.js` + `RuinsTreeGraph.jsx`) : roue radiale de
« ronds » (clusters PoE) gravée pierre — géométrique, abstrait, aucune évocation. Les
références fournies (arbre D4 calciné aux veines de lave, toile sombre à capstones,
colonnes à compteurs x/y) partagent : **fond illustré organique, nœuds posés sur la
matière, progression = lumière qui se propage, gros médaillons de fin de branche**.

**Mécaniques du jeu AUCUNEMENT touchées par l'arbre actuel** (matière première des
nouveaux bonus) : couverture routière (+10 % max), bâtiments riverains/fleuve, aubaines
(boons B2), jalons ×25 des bâtiments, Démesure (A1), entretien d'infra (A2), stagnation
(A6), foyers de Rupture ciblés (inequality, dissent…), crises narratives résolues,
préparations terminales, réformes de fond, politiques permanentes, cultes Olympus,
épitaphes, vestiges/nécropole, sédiment d'absence, ères transcendantes.

---

## 2. Direction : « L'Arbre des Ruines » (concept unifié)

Un **arbre mort, calciné, gigantesque**, qui repousse à chaque cycle depuis ses racines.

- **Au-dessus du sol : 3 branches maîtresses** = le cycle vivant.
  Veines de **braise ambre/or** (DA : lueurs ambre, jamais cyan) qui s'allument à l'achat.
- **Sous le sol : les racines** = ce qui traverse la mort (conservation, mémoire, exhumation).
  Veines **rouge braise sombre** (le rouge est déjà le registre Rupture/cycle_crise).
- **Le cœur du tronc** = cavité incandescente au collet : c'est le moyeu actuel
  (compteur de ruines) réincarné.
- **Lore parfait** : « arbre de ruines » — chaque civilisation morte nourrit les racines ;
  les braises des cités défuntes courent sous l'écorce.

Mapping 1:1 avec les 4 branches existantes (le gating, les dogmes et les tests survivent
à un simple re-thème) :

| Branche actuelle | Devient | Position | Identité |
|---|---|---|---|
| `resilience` | **Les Racines — « Ce qui reste »** | sous le sol | conservation, démarrage, nécropole, archéologie, hors-ligne |
| `prosperity` | **La Sève — « La Cité vivante »** | branche gauche | moteurs, routes, fleuve, aubaines, jalons, Démesure |
| `cycle_crise` | **La Cendre — « La Chute »** | branche droite | Rupture, crises, effondrement, gain de ruines, automation |
| `knowledge` | **L'Écorce gravée — « La Mémoire »** | branche sommitale | savoir, culte, chronique, réformes durables, méta |

---

## 3. Refonte des bonus

### 3.1 Principes

1. **Un nœud = une mécanique nommée du jeu.** Plus aucun nœud dont l'effet tient en
   « +X % ressource ». Les fusions remplacent la redondance (les 8 `*Keep` → 1 nœud,
   les 4 `start*PctPeak` → 1 nœud à 2 crans).
2. **~35 nœuds + ~8 dogmes** (contre 50+10). Moins d'achats, chacun désirable.
3. **Le scaling ne dépend plus des nœuds** : socle automatique **« Sève de braise »** —
   la prod globale gagne `+B1 % par nœud allumé` + `+B2 % par log10(ruines dépensées)`
   (curseurs dans `balance.js`). L'arbre scale par le fait d'être allumé, ce qui libère
   totalement le design des nœuds. (Attention au double-emploi avec `chronicle_engine`,
   qui fait déjà +3 %/upgrade → son effet sera refondu, voir plus bas.)
4. **Les dogmes deviennent des CHOIX exclusifs A/B** (paire `conflictsWith`, mécanique
   déjà en place) — toujours gratuits au palier, mais on choisit une identité.
5. **Les ids des nœuds conservés ne changent pas** (`conseil_de_crise`,
   `edit_effondrement`, `veilleurs_nuit_1/4`, `trait_nomadism`, `trait_theocracy`,
   `skill_archaeology`, `oral_tradition`, `fallen_roads`, `recurring_ages`,
   `foundation_ghosts`…) : les branchements en dur dans `core/` continuent de marcher.

### 3.2 Les Racines — « Ce qui reste » (ex-resilience, ~9 nœuds)

| Palier | Nœud | Effet (mécanique touchée) |
|---|---|---|
| 0 | **Porteurs de braise** (fusion granaries+ember_baskets) | Les survivants emportent un socle : +pop et +nourriture de départ (`computeStartFloor`) |
| 0 | **Veilleurs de nuit** (gardé) | Hors-ligne 2 h → 4 h (`IDLE_BASE_CAP`) |
| 0 | **Archéologie** (gardé, remonté en achat précoce) | Active : 1×/cycle, exhumer un bâtiment de la civilisation précédente (`canExhume`) |
| 1 | **Reliquaire des pics** (fusion des 4 `start*PctPeak`) | Chaque cycle démarre avec 3 % du pic de CHAQUE ressource |
| 1 | **Nécropole vivante** ★nouveau | +2 % prod globale par vestige dans la nécropole (cap ~10) — les cités mortes irriguent la vivante (`state.vestiges`) |
| 2 | **Chambres scellées** (fusion des `*Keep`) | Effondrements : +8 % de TOUTES les ressources conservées |
| 2 | **Chantiers de fouilles** ★ | Archéologie : 3 exhumations/cycle, coût savoir −50 % |
| 2 | **Limon des âges** ★ | Le bonus de sédiment (longue absence, `sedimentMod`) démarre 2× plus tôt et monte à ×7 |
| 3 | **Veilleurs de nuit IV** (gardé) | Hors-ligne jusqu'à 24 h |
| 3 | ⭐ **Capstone — Racine-mère** ★ | À l'effondrement, la famille de moteurs la plus possédée survit entièrement (son compte de bâtiments est conservé) |

Dogmes-choix : **Nomadisme** (gardé : −30 % coûts / infra plafonnée) **VS Enracinement** ★
(bâtiments jamais dégradés par l'entretien A2 / coûts +15 %). Palier II : **Communes
vivrières** (keep food) **VS Reliquaire scellé** ★ (Reliquaire des pics passe à 8 %).

### 3.3 La Sève — « La Cité vivante » (ex-prosperity, ~9 nœuds)

| Palier | Nœud | Effet |
|---|---|---|
| 0 | **Routes ensevelies** (gardé) | Infra de départ = f(√ruines) (`fallen_roads`) |
| 0 | **Rives fécondes** ★ | Les moteurs riverains (Ports, Moulins) produisent +60 % — le fleuve devient une mécanique |
| 1 | **Grand cadastre** ★ | Couverture routière : plafond +10 % → +15 %, routes −25 % (`roadNetworkMultiplier`) |
| 1 | **Caravanes d'aubaine** ★ | Aubaines (B2) +40 % de fréquence |
| 2 | **Fêtes de jalon** ★ | Chaque jalon ×25 d'un bâtiment déclenche une aubaine dorée (`buildingOutputMultiplier` → `maybeFireBoon`) |
| 2 | **Franchises marchandes** ★ | Le foyer d'inégalité (or thésaurisé) monte 2× moins vite (`pressureBreakdown.inequality`) |
| 2 | **Ruines en réserve** (gardé `foundation_ghosts`) | +1 % prod par ruine non dépensée |
| 3 | **Gouvernail des millions** ★ | Démesure −30 % (`DEMESURE_COEF`) — LE mur du late game |
| 3 | ⭐ **Capstone — Ville-Monde** ★ | Les jalons de moteurs tombent tous les 20 achats au lieu de 25 |

Dogmes-choix : **Droit marchand VS Grands travaux** (existants, désormais exclusifs).
Palier III : **Main-d'œuvre des morts** ★ (chaque cycle passé = −1 % coûts, cap −20 %)
**VS Cité-lumière** ★ (couverture routière compte double la nuit… ou variante simple :
routes gratuites sous X % de couverture).

### 3.4 La Cendre — « La Chute » (ex-cycle_crise, ~9 nœuds)

| Palier | Nœud | Effet |
|---|---|---|
| 0 | **Conseil de crise** (gardé) | Doctrine automatique 25/50/75 % |
| 0 | **Rites du feu court** ★ | Les cycles < 15 min rapportent +25 % de ruines (synergie culte Apocalypse) |
| 1 | **Édit d'effondrement** (gardé) | Auto-collapse configurable |
| 1 | **Moisson de crise** ★ | Chaque crise narrative RÉSOLUE pendant le cycle : +3 % ruines projetées (cap +30 %) — `crisesResolved` existe déjà pour Olympus |
| 2 | **Cendres fertiles** ★ | Après un effondrement : production ×3 pendant les 3 premières minutes du cycle (peps de redémarrage) |
| 2 | **Préparations funèbres** ★ | Préparations terminales −40 % de coût, `collapsePreparation` renforcé |
| 2 | **Stagnation féconde** ★ | La stagnation (A6) n'accélère plus l'Usure ; à la place, elle charge une aubaine (retourne un malus en choix) |
| 3 | **Taxonomie des chutes** (gardé) | Ruines gagnées +40 % |
| 3 | ⭐ **Capstone — Phénix calendaire** ★ | Le farm hors-ligne (mode FARM) n'est plus plafonné à 20 effondrements, et l'Édit peut viser « ruines projetées ≥ X » |

Dogmes-choix : **Éternel retour** (gardé : ruines +30 %) **VS Abîme assumé** ★ (tenir la
Rupture > 70 % donne +20 % prod — synergie culte Abîme, `OLYMPUS_ABYSS`).

### 3.5 L'Écorce gravée — « La Mémoire » (ex-knowledge, ~8 nœuds)

| Palier | Nœud | Effet |
|---|---|---|
| 0 | **Tradition orale** (gardé) | Le bonus de ruines lui-même est renforcé (`ruinMultiplier` ×1.2) |
| 0 | **Grammaire des ruines** ★ | Les nœuds de l'arbre coûtent −10 % (méta-boutique) |
| 1 | **Autel du culte** ★ | L'effet du culte Olympus +50 %, profil recalculé 2× plus vite |
| 1 | **Encre indélébile** ★ | Les réformes de fond (`foyerReform`) survivent à l'effondrement |
| 2 | **Loi des témoins** ★ | Les politiques permanentes (`REGULATION_POLICIES`) ne coûtent plus que la moitié de leur malus de prod |
| 2 | **Âges récurrents** (gardé) | +3,5 % prod par palier d'ère max atteint (`eraTier`) |
| 3 | **Épitaphes profondes** ★ | Le legs d'épitaphe dure 20 min (au lieu de 8) et son `ruinMult` est amplifié |
| 3 | ⭐ **Capstone — Machine chronique** (gardé, refondu) | Chaque type de fin déjà vécue (cause d'effondrement distincte) +6 % prod ; les ruines non dépensées comptent double dans la Sève de braise. (L'ancien +3 %/upgrade part dans le socle commun.) |

Dogmes-choix : **Théocratie** (gardée : or→savoir / Rupture +25 %) **VS Académies libres**
(gardé, réécrit : le savoir excédentaire éteint le foyer de complexité).

### 3.6 Nouveaux `effectTypes` à implémenter (côté `core/`)

| effectType | Où le brancher |
|---|---|
| `vestigePower` | `production.js` globalMultiplier — lit `state.vestiges.length` |
| `allKeep`, `allStartPctPeak` | `crisis.js:completeCollapse` + `shared.js:computeStartFloor` (remplacent les 8+4 anciens) |
| `exhumeCharges`, `exhumeDiscount` | `cost.js` (archéologie) |
| `sedimentBoost` | `prestige.js` sedimentMod |
| `engineFamilyKeep` (capstone Racine-mère) | `crisis.js:completeCollapse` |
| `riverEngineMult` | `production.js` rates (ids `river_ports`, `water_mills`) |
| `roadCapBonus`, `roadDiscount` | `production.js:roadNetworkMultiplier`, `cost.js` |
| `boonFrequency`, `milestoneBoon`, `stagnationBoon` | `tick.js:maybeFireBoon`, `buildingOutputMultiplier` hook |
| `inequalityDamp` | `production.js:pressureBreakdown` |
| `demesureDamp` (variante upgrade) | `production.js` Démesure |
| `milestoneStep` (capstone Ville-Monde) | `production.js:buildingOutputMultiplier` |
| `shortCycleRuinBonus`, `crisisResolveRuinBonus` | `prestige.js:ruinGain` |
| `regrowthRush` | `production.js` (timer depuis `cycleStart`) |
| `terminalPrepDiscount` | `crisis-cost.js` |
| `farmUncap`, `collapseAtProjected` | `main.js` offline FARM, `crisis.js` auto-collapse |
| `ruinShopDiscount` | `actions/building.js` / coût des upgrades ruins |
| `cultAmp` | `olympus.js` |
| `reformsPersist`, `policyCostHalf` | `crisis.js` reset + `production.js` |
| `epitaphAmp` | `production.js:epitaphLegacyEffect` |
| socle `braise` (pas un effectType : lu direct) | `production.js:globalMultiplier` — `+B1·nœudsRuinsPossédés + B2·log10(1+ruinesDépensées)` ; curseurs `balance.js` |

---

## 4. Refonte visuelle

### 4.1 Composition

- **Monde portrait ~1600×2200** (le pan/zoom caméra existant de `RuinsTreeGraph` est
  conservé tel quel). Racines en bas, houppier en haut — composition de l'image D4.
- **L'arbre COMPLET est visible dès le début en silhouette** (imposant, donne envie),
  mais éteint : les paliers non atteints sont sous une brume de cendre. La « pousse »
  actuelle (reveal de nœuds) devient un **allumage** : ouvrir un palier dissipe la brume
  du segment ; acheter un nœud fait **couler la braise le long de la veine** (animation
  `stroke-dashoffset`, du tronc vers le nœud) puis allume le médaillon.
- **Nœuds** = médaillons pixel-art posés sur les branches (positions ancrées à la main).
  Capstones = grands sceaux en bout de branche maîtresse. Dogmes = paires de médaillons
  dorés à une fourche (le choix exclusif se LIT dans la géométrie).
- **Portes de palier** : petits anneaux « n/m » sur la branche (réf. image ARC Raiders),
  mécanique inchangée.
- **Cœur du tronc** : cavité incandescente = compteur de ruines (remplace le hub).
- **Ambiance réactive** : `RuinsUsureSync` est conservé — l'usure teinte le ciel de
  cendre derrière l'arbre (ambre calme → rouge froid) ; particules discrètes : braises
  montantes le long des veines allumées, cendres qui tombent à usure haute.
- **Couleurs** : branches = braise **ambre/or** (interdit cyan, DA), racines = **rouge
  braise sombre** (#c86464 assombri, registre existant de cycle_crise/Rupture).

### 4.2 Fabrication

1. **Illustration de fond** : PixelLab REST Pixflux (recette splash-arts, clé au scope
   User) — arbre calciné complet, écorce détaillée, veines gravées ÉTEINTES dans la
   matière. Passe `remapPalette --extra` (accents or). Une seule grande image (ou 2-3
   tuiles assemblées), PAS un PNG par état.
2. **Veines allumées = PIXEL, pas de SVG** (décision Raphaël 2026-07-10) : la version
   allumée des veines est peinte en pixel-art — un calque PNG « veines incandescentes »
   par branche (dérivé de l'illustration de base, mêmes tracés), composité au canvas
   avec des masques PAR SEGMENT (rectangles/polygones définis dans `anchors.js`).
   Allumage d'un nœud = fondu alpha du segment + « tête de braise » : petit sprite
   pixel animé qui parcourt la polyligne du segment (comme les flammes des merveilles,
   assets réutilisables). Le glow reste discret et pixelisé (pas de blur CSS lisse).
3. **Fichier d'ancres** `ruinsTree/anchors.js` : `{ nodeId → {x,y} }`, paths des veines,
   positions des portes, masques de brume par palier. Outil ponctuel de placement :
   overlay debug `window.__ruinsAnchors` (cliquer-placer, export JSON) — même esprit
   que les molettes habituelles.
4. **Médaillons** : PixelLab (`create_ui_asset` / map_object ~48 px), grammaire commune
   anneau pierre + glyphe or, ~40 icônes. **Fallback** : `iconFor` FontAwesome actuel
   marche tel quel au début — les médaillons sont une passe de polish séparée.
5. **Code** : `RuinsTreeGraph.jsx` garde caméra/tooltips/achat/a11y/annonces ;
   `layout.js` (radial calculé) → remplacé par les ancres statiques ; le SVG
   strates/trunks/edges → `<img>` illustration + calque SVG veines + calque brume ;
   `TreeNode.jsx` quasi inchangé ; `ruinsTree.css` purgé/refait.

---

## 5. Mise en place — phases

### Phase A — Gameplay d'abord (jouable sur le rendu actuel) — ✅ FAITE (2026-07-10)
Le rendu radial actuel lit `PRESTIGE_TREE_BRANCHES` : la nouvelle table de nœuds
s'affiche dedans sans une ligne de rendu → on valide le GAMEPLAY avant le visuel.
1. Réécrire le groupe `ruins` d'`upgrades.js` (~35 nœuds, ids conservés listés en §3.1.5).
2. Implémenter les effectTypes (§3.6) dans `core/mechanics/*` + socle braise dans
   `balance.js`.
3. **Migration de save : full respec** — rembourser la somme des coûts des upgrades
   possédées disparues, vider les upgrades `ruins` retirées, message au joueur.
   (Pattern `saveMigration.test.js` existant.)
4. Tests : adapter `ruinTree.structure.test.js`, `crisisDoctrine.test.js` (ids gardés
   → OK), régénérer les goldens économie, 1er passage de coûts (courbe géométrique par
   palier, l'arbre doit absorber la même économie de ruines jusqu'à ~10¹⁰).

> **Phase B ✅ (2026-07-10)** : direction verrouillée = concept **E2 « Le Puisatier »**
> (fruit de braise sous la fourche, nourri par la coulée montant de la cité-cratère),
> après 3 rounds (A/B/C → série D → série E). Le cœur de braise = le compteur de ruines.
>
> **Phase C ✅ (2026-07-10)** : base = tirage F2 (320×400, max API, affiché ×5 pixelated),
> `anchors.js` (px source) + `pixelLayout.js` + `veinPainter.js` (veines/brume/tête de
> braise en PIXELS sur canvas — pas de SVG) + `RuinsTreePixel.jsx` (RuinsView basculé,
> rendu radial conservé en repli). Vérifié in-engine. Reste Phase D.

### Phase B — Concepts DA (validation avant prod)
2-3 concepts d'arbre complets via PixelLab (variations de silhouette/cadrage/palette)
→ choix de Raphaël. Leçon retenue : contemplatif > monumental ; anti-« IA-slop »
(pas d'orbes lisses, matière tangible, lueurs ambre).

### Phase C — Rendu
Illustration finale + ancres + veines SVG + brume par palier + allumage animé +
cœur du tronc + ciel réactif à l'usure. Vérif in-engine (pièges connus : dialog de
crise bloque la vue, save fraîche = vue verrouillée).

### Phase D — Polish & équilibrage final
Médaillons pixel-art des ~40 nœuds, particules braises/cendres, passe de coûts finale,
goldens, `npm run build` + lint + 430+ tests.

---

## 6. Décisions à trancher (recommandations incluses)

1. **Full respec à la migration** — recommandé OUI (généreux, simple, évite tout état
   incohérent).
2. **Composition portrait, racines en bas** — recommandé OUI (c'est l'image la plus
   forte des références, et « racines = ce qui survit » est le meilleur mapping lore).
3. **Dogmes en choix exclusifs A/B** — recommandé OUI (identité de build, mécanique
   `conflictsWith` déjà en place).
4. **Socle « Sève de braise »** (scaling automatique par nœud + log ruines dépensées) —
   recommandé OUI : c'est ce qui permet de supprimer TOUS les +X % sans casser la
   courbe méta.
5. Volume final ~35 nœuds + 8 dogmes — ajustable, mais en-dessous de 30 le gating par
   compteur (x/y) devient trop lâche.
