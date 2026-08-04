# Plan — Égalisation du grain humain (portes et fenêtres)

Chantier ouvert le 2026-08-04, demande Raph après tests par les proches :
« ce qui ressort le plus, l'échelle des bâtiments. Il faut que les fenêtres et
portes fassent la même taille, sinon ça crée un ressenti étrange. »

Complément de `PLAN-ECHELLE.md` (2026-08-03) : là-bas la toise MACRO (masses
des tours vs bateaux/arbres/pont), ici le GRAIN — la taille des éléments à
hauteur d'homme. Les deux se rejoignent sur un principe : l'échelle perçue est
relative, et le référent ultime est l'habitant. Une porte est le trait d'union
entre l'habitant (10 px) et le bâtiment (40 à 340 px) : si elle varie du simple
au double d'un bâtiment à l'autre, TOUT le reste paraît faux, même quand les
masses sont justes.

⚠ Le périmètre écarté de PLAN-ECHELLE reste écarté ici (taille-selon-le-zoom,
rétrécissement des piétons tardifs, etc.) : l'égalisation se fait par les
bâtiments, jamais en retouchant les référents vivants.

---

## 1. Le problème, mesuré (2026-08-04)

Mesures d'art à l'œil sur agrandissements ×6 avec réglette (précision ±1-2 px
source) — le lot G0 refait tout proprement par annotation vérifiée. Les
formules de rendu, elles, sortent d'une lecture de code complète (voir tables).

### 1.1 Quatre chemins de rendu, cinq densités jamais réconciliées

« Densité » = px écran par px source à zoom 1. C'est elle qui convertit une
porte dessinée en porte perçue.

| Famille | Formule | Densité @z=1 | Où |
|---|---|---|---|
| Habitations, lots carrés (1×1, 2×2) | `k = unit/HOUSE_UNIT`, `unit = wpx/spanX`, `wpx = (spanX+spanY)·T·z·0.78` | **×1,135** | pixelHouses.js:222-232 |
| Habitations, lots 1×2 (tenement, tower) | même formule, mais `unit = 2,34·T·z` | **×1,70** (clamp → ×1,56-1,65) | idem + houseFitTune |
| Merveilles | `W = T·z·nw/34` (PPT 34) | **×0,941** | renderBuildings.js:614-618 |
| Scènes moteur (+ entrepôts) | fit-to-box : `drawW = sw·wFrac`, `sw ∝ empreinte` | **variable, ∝ empreinte** | isoRenderer.js:7091-7132, cityEngineSprites.js:317-322 |
| Tours cosmiques moteur | `drawH = sh·1.72`, ratio natif | variable (∝ boîte) | cityEngineSprites.js:332-341 |

Le px source ne vaut donc pas la même chose d'une famille à l'autre — ni même
d'une INSTANCE à l'autre côté moteur. Cinq constantes de densité
indépendantes : `HOUSE_UNIT = 44`, `PPT = 34`, `0.72` (boîte moteur), `0.78`
(boîte-lot maisons), `1.72` (tour cosmique moteur).

### 1.2 L'anomalie des lots 1×2 — et l'équilibre accidentel du tenement

`unit = wpx/spanX` avec `wpx ∝ (spanX+spanY)` : un lot 1×2 dessine **1,5×
plus dense** qu'un lot carré. C'est mécanique, pas artistique.

MAIS : corriger la formule à l'aveugle casserait ce qui marche par accident.
Mesuré sur les PNG : l'artiste a dessiné le `tenement` avec des étages PLUS
FINS (pitch ~10,5 px vs ~17 pour la `townhouse`), et le facteur 1,65 les
regonfle vers la norme :

| | pitch d'étage source | densité | pitch APPARENT |
|---|---|---|---|
| townhouse (1×1) | ~17 px | ×1,135 | **~19 px** |
| tenement (1×2) | ~10,5 px | ×1,651 | **~17 px** |

Les étages tombent presque juste ; ce sont les ENTRÉES qui trahissent
(voir 1.4). Conséquence : toute correction de formule doit être compensée PAR
SPRITE, mesures à l'appui — jamais un flip global.

### 1.3 Les scènes moteur gonflent avec l'empreinte

Les props de scène sont blités en FRACTION de boîte (`wFrac`), et la boîte
suit `cmEngineFootprint(id, count)` : 1 → 5 tuiles de côté avec les achats.
La même grange passe donc de ~46 px à ~230 px de boîte — portes et fenêtres
×5 — pendant que les humains de scène, eux, restent ancrés à la tuile
(`sceneHumanH`, cityEngineSprites.js:30-36). Incohérence INTERNE à la scène,
qui grandit avec la progression. Le cap halle (`HALL_SCENE_MAX = 1.7`) ne
s'applique qu'aux bandes ≤ 2 (`HALL_SCENE_CAP_MAX_BAND`, isoRenderer.js:
6924-6933) : mi-partie et fin de partie sont sans filet.

C'est le foyer d'incohérence le plus visible en progression normale : une
halle bande 4-5 côtoie des habitations aux portes fixes avec des portes 2-3×
plus grandes. La doctrine maison dit pourtant : « le compteur d'achats pilote
le NOMBRE, jamais la TAILLE » (fiche densité halle + ateliers).

### 1.4 Le calibrage art — portes et fenêtres apparentes @z=1

Habitant visible : **10 px** (boîte de blit 20 px × ratio perso FLAT 0,50 ;
`32 × 1,24 × 0,5 × 0,50`). Mesures :

| Sprite | Porte source | Densité | Porte APPARENTE | vs habitant |
|---|---|---|---|---|
| hut | ~10 px | ×1,135 | **~11,3 px** | 1,13 ✓ |
| stonehouse | ~10-11 px | ×1,135 | **~11,5 px** | 1,15 ✓ |
| manor | ~10 px | ×1,135 | **~11,3 px** | 1,13 ✓ |
| townhouse | ~8 px | ×1,135 | **~9 px** | 0,9 (petite) |
| tower (1×2) | ~10 px | ×1,556 | **~15,6 px** | 1,56 |
| tenement (1×2), baies du rez | ~12 px | ×1,651 | **~20 px** | 2,0 |
| tower-cosmic-7, entrée | ~15-18 px | ×1,135 | **~17-20 px** | 1,7-2,0 |

Fenêtres apparentes : townhouse ~7,9 · stonehouse ~7,4 · tenement ~8-10 ·
tower ~7 — étonnamment groupées. Étages cosmiques : ~9 px apparents, plus
petits qu'un habitant — c'est le « grain fin » VOULU par PLAN-ECHELLE §B1
(l'œil compte les étages).

**Diagnostic en trois foyers, par ordre d'impact :**

1. **Scènes moteur ∝ empreinte** (1.3) — divergence structurelle, aucun
   plafond après la bande 2.
2. **Facteur 1×2** (1.2) — +50 % mécanique sur tenement/tower, partiellement
   compensé par l'art des étages mais pas par celui des entrées.
3. **Dispersion d'art vraie** (1.4) — réelle mais modérée sur les
   habitations (portes 9 → 11,5 sur lots carrés) ; à confirmer sur les ~40
   props moteur à porte que le calibrage n'a pas couverts.

---

## 2. La toise du grain (le contrat)

Tout se juge en px APPARENTS à zoom 1 (px source × densité), jamais en px
source. L'ancre : **habitant visible = 10 px**.

| Élément | Bande cible | En px apparents |
|---|---|---|
| Porte standard (habitation, atelier, échoppe) | 1,0-1,4 × habitant | **10-14 px** |
| Entrée « hall » (immeuble, tour, institution, temple) | 1,4-2,2 × | **14-22 px** |
| Fenêtre standard | 0,5-0,9 × | **5-9 px** |
| Pitch d'étage, bâti bas (≤3 niveaux) | 1,4-2,0 × | 14-20 px |
| Pitch d'étage, immeubles | 1,2-1,8 × | 12-18 px |
| Pitch d'étage, gratte-ciel/cosmique | 0,7-1,2 × | 7-12 px (grain fin assumé) |
| Merveilles | hors bande — étalon libre par élément (colonne, torche, portail) ; seule la porte, si elle existe, respecte la bande « entrée hall » | — |

La PORTE est la seule bande universelle : c'est l'élément que l'œil compare
d'instinct entre deux bâtiments voisins. Les fenêtres et étages se jugent par
typologie.

---

## 3. Lot G0 — Outillage et annotation (l'audit complet)

> **ÉTAT 2026-08-04 : FAIT.** 201 sprites annotés (21 habitations par mes soins,
> 180 props par fan-out de 12 agents, ~15 sprites chacun), fusion validée sans
> erreur, vérification par overlay sur 7 planches de portes (1 seule correction :
> `arcologyhome-cosmic-7`, rect posé sur l'enseigne). Données committées dans
> `scripts/data/` (inventory, annotations, fractions, apparent). Planches de
> jugement dans `.preview-shots/grain/` (gitignoré, régénérables par
> `node scripts/grainBoard.mjs <dir>`).
>
> **Résultats (149 portes mesurées, bande ±1 px de tolérance) :**
> - À l'empreinte de référence ATELIER (2×2) : **105/149 portes en bande (70 %)**
>   — le corpus d'art est bien plus sain que prévu.
> - À l'empreinte 1 (petits moteurs, début de partie) : **5/128 (4 %)**.
> - À l'empreinte halle max (5×5, bandes ≥ 3 sans cap) : **4/128 (3 %)**.
>   → LE foyer n°1 est confirmé et quantifié : la dérive ∝ empreinte détruit un
>   corpus par ailleurs calibré. Le fix G1 prioritaire est d'ancrer la densité
>   des scènes (l'atelier comme référence), pas de repeindre en masse.
> - Habitations : 17/21 en bande. Les 4 dehors : `tenement` (+6,4) et `tower`
>   (+3) — l'anomalie 1×2, leurs fenêtres SONT en bande —, `megablock` (−3,2,
>   grain fin assumé), `townhouse` (−0,9, limite basse).
> - Fenêtres : 82/130 dans [4-10] apparents (63 %).
> - **Découverte en route** : les tours cosmiques MOTEUR passent par un chemin
>   dédié (`blitCosmicTower`, H=1,72, ratio natif — pas les fractions) et leurs
>   entrées sortent PETITES : 2,5-10,6 apparents (`market-cosmic-7` 2,5,
>   `cosmic-hall-7` 3,7 → vague d'art G2 probable sur les socles cosmiques).
> - Vague d'art G2, périmètre pressenti d'après la table : ~12 portes trop
>   grandes (+2 à +10 : `mint-prop-house`, `exchange-prop-stall`,
>   `libraries-prop-archive`, `mill-prop-house`, `bank-house-renaissance`…) et
>   ~10 trop petites (−3 à −5,5 : socles cosmiques, `port-house-modern`,
>   `mill-house-modern`, `bureau-tower`, `academies-modern`…), habitations 1×2
>   traitées par la compensation G1, pas par l'art.
> - 4 PNG orphelins hors PROP_KEYS (3 scènes d'aqueduc + `caravan-oxcart-classical`).
> - Scripts morts réparés/à réparer : `contactSheet.mjs`, `flipBuildings.mjs`,
>   `zoomCheck.mjs` pointent toujours sur `public/pixelart/buildings/` disparu
>   (non réparés en G0, la planche de jugement a son propre outil `grainBoard.mjs`).

Objectif : la table des écarts, sprite par sprite, et la planche de jugement.
Aucune retouche dans ce lot.

1. **Outils** : promouvoir l'agrandisseur ×6 à réglette (prototype de séance,
   scratchpad `upscale.mjs`) en `scripts/spriteZoom.mjs`. Ajouter
   `scripts/annotateCheck.mjs` : superpose les rects annotés sur le sprite
   agrandi pour vérification visuelle. ⚠ Réparer au passage les scripts morts
   qui pointent sur `public/pixelart/buildings/` disparu : `contactSheet.mjs`
   (à réorienter houses/ + agents/buildings/), `flipBuildings.mjs`,
   `zoomCheck.mjs`.
2. **Annotations** : `scripts/data/sprite-annotations.json` — par sprite :
   `{ file, famille, typologie, door: {x,y,w,h}, window: {…}, etage_pitch,
   etalon (merveilles), notes }`, en px SOURCE. Portée : 21 habitations,
   ~35-40 props moteur à porte (parmi les 236 de `agents/buildings/`, hors
   strips animés et props sans bâti), entrées des 45 tours cosmiques moteur
   (échantillon par famille), 10 entrepôts. Fan-out d'annotation ~10 agents
   (6-8 sprites chacun) + passe de vérification overlay ; les strips
   (`*-fire`, `veh-*`, `forager-*`…) sont exclus d'office.
3. **Calcul des apparents** : harnais vitest (même recette que les preuves
   SSR) qui importe les VRAIES fonctions (`pixelHouseGeom`, boîtes moteur,
   `cmEngineFootprint`, PPT merveilles) — jamais une réplique des formules
   (une garde déduite d'une copie est une garde molle). Sortie :
   `scripts/data/sprite-apparent.json` + table triée par écart à la bande.
   Pour les scènes moteur, calculer aux empreintes 1, 2 ET max — les trois
   colonnes montrent la dérive.
4. **Planche de jugement** : par ère, chaque bâtiment À L'ÉCHELLE DU JEU,
   habitant-étalon à côté de chaque porte, lignes de bande tracées. C'est la
   pièce à montrer (aux proches aussi) avant/après.

## 4. Lot G1 — Unification mécanique (code seul, tout sous molettes)

> **ÉTAT 2026-08-04 : FAIT** (même séance que G0). Formule honnête + GRAIN_FIX
> dans `spriteScale.js` (une seule source, testée garde cassée comprise),
> plancher moteur dans `isoRenderer.js`, sonde `recDens`/`__grainAudit`
> branchée sur les TROIS chemins (maisons, blitProp×2, blitCosmicTower).
> Vérifié EN JEU : bande 5 → `tenement`/`tower` blittés à 1,248 (= 1,135 × 1,1)
> au lieu de 1,70, rue harmonieuse, Y-sort et ancrages intacts ; bande 0 →
> étal 0,62 / grenier 0,56 de densité (portes 10,6 et 12,4 px, contre ~7 avant
> le plancher), pas de débord choquant ; bande 7 inchangée hors 1×2. Captures
> `.preview-shots/grain/b0|b5|b7-apresG1.png`, planche
> `planche-habitations-apresG1.png`. La sonde a aussi donné la vérité runtime
> des socles cosmiques moteur : densités 0,67-1,42 selon l'empreinte réelle —
> la matière qui calibrera les paliers G2. Molettes livrées : `__grainFix`
> (on/off + table live), `__grainFloor` (0 = off, défaut 0,7). Restent dans le
> lot : rien — arbitrages fins des valeurs à l'usage, par les molettes.

Redresser sans toucher un pixel d'art, compensations par sprite comprises.
Périmètre recentré après l'arbitrage « art par palier » (§7.2) : les halles
attendent leur art, G1 traite le reste.

1. **Formule 1×2 corrigée** dans `houseScaleK` (source unique) : `unit`
   indépendant de la forme du lot côté iso (`2w/(spanX+spanY)`, le legacy
   top-down garde `w/span` qui n'a jamais eu l'anomalie) **+ compensation par
   sprite** : table `GRAIN_FIX` bornée [0,8-1,25], valeurs initiales dérivées
   de l'audit (`tenement`/`tower`/`townhouse` ~1,1), le clamp au lot reste
   l'ultime garde-fou. ⚠ `houseSpriteHeightTiles` (Y-sort) doit suivre la
   MÊME correction, sinon la portée peintre ment d'un tiers sur les 1×2.
2. **Plancher des petites empreintes moteur** : aux empreintes < atelier, les
   props de scène sont dessinés à `max(dens, plancher × densité atelier)`
   (molette `__grainFloor`, départ 0,75-0,8), débord latéral toléré comme le
   clamp maisons. Corrige le début de partie (4 % en bande → l'essentiel).
3. **Sonde runtime `__grainAudit()`** : capture dev des densités réellement
   blitées (par clé de prop + maisons + tours cosmiques), croisées avec les
   annotations → la vérité runtime qui remplace l'extraction statique des
   fractions ; c'est elle qui calibrera les paliers de G2.
4. **Molettes** : `__grainFix` (table par sprite, on/off), `__grainFloor`.
   A/B live, valeurs gravées après validation sur planche + captures.
5. Merveilles : inchangées en G1 (cf. §7.3).

## 5. Lot G2 — La vague d'art (les irréductibles)

> **ÉTAT 2026-08-04 : PILOTE « halle à paliers » LIVRÉ (greniers, stade
> entrepôt).** Arbitrages Raph : greniers, et « le même bâtiment en plus
> massif ». Recette VERROUILLÉE, prête à sérialiser :
> 1. Générer `create_map_object` (176×160, low top-down, high detail, detailed
>    shading, selective outline, « the CORNER faces the viewer, TWO visible
>    facades ») en décrivant les MATÉRIAUX du petit sprite.
> 2. GATE porte : PixelLab dessine l'entrée à ~1/3 de façade (46 px ici) et
>    IGNORE les demandes de réduction (une passe `edit_image` n'a rien changé).
>    Le remède qui marche : CHIRURGIE — murer l'arche en ARC AVEUGLE de brique
>    en refend (assises 3 px, tons ~0,85 de la face, un cran plus sombre rend
>    encore « ouverture ») + linteau crème 2 px, ne garder que ~28 px de porte.
>    Prototype `doorFix.mjs` (scratchpad session), à généraliser en script.
> 3. `quantize.cjs --colors 22` ; **PAS de remapPalette sur cette famille** (il
>    éteint la brique rouge → brun, précédent Raven « posé brut »).
> 4. Calibrage : mêmes fractions que le petit (0,7 de hauteur de boîte), le
>    canvas plus haut fait la densité — 0,605 au palier (spanSum 6), porte
>    18,1 px apparents, écart 0 (table `apparent`, via `PALIER_SPANSUM`).
> 5. Bascule dans la scène : `Math.max(gw, gh) >= 3` → sprite `-grand`, mêmes
>    fractions, repli petit tant que le PNG charge.
>
> Vérifié EN JEU (bande 5, ei 29, halle 3×3 en clairière) : capture
> `.preview-shots/grain/pilote-halle-grande-b5.png` + planche comparative
> `pilote-compare-atelier-halle.png`. Bonus : les ateliers de grenier (1×1)
> retombent à 14,1 px de porte grâce au plancher G1.
>
> **Pièges découverts, à connaître pour la série :**
> - `engineSprites.js` passait `gw: t.spanX || 1` or les moteurs CARRÉS portent
>   `size` → gw valait toujours 1 (corrigé : `spanX || size || 1`). Sans ce
>   correctif, aucun palier ne s'armait.
> - Les FENÊTRES de stades sont inégales : la démo bande 6 dessine déjà le HUB
>   (ei ≥ 30) — le stade entrepôt (ei 25-29) est une fenêtre courte. Les
>   paliers rentables par famille sont donc surtout HALL (ei 10-24) et HUB
>   (ei 30+, jusqu'au cosmique) ; l'entrepôt-grand servira peu mais a validé
>   la recette. Reste pour la famille grenier : `granary-hall-grand`,
>   `granary-hub-grand` (+ `horreum-grand` bande 4 si envie).
> - La sonde `__grainAudit` est polluée par l'échelle de cuisson du CACHE de
>   scènes (recDens normalise par cam.zoom, or la cuisson blitte à sa propre
>   échelle) — à corriger en normalisant par l'échelle de boîte, pas le zoom.
>   ⚠ La HALLE, elle, est dessinée en direct : ses densités mesurées en jeu
>   sont fiables (elles ont confirmé les 4 paliers au millième).
>
> **FAMILLE GRENIER COMPLÈTE le 2026-08-04** — 4 paliers, tous à écart 0 :
>
> | Palier | Ères | Sprite | Porte source | Densité | Apparent |
> |---|---|---|---|---|---|
> | halle de pierre | ei 10-24 (hors b4) | `granary-hall-grand` 176×160 | 31 px | 0,605 | **18,7** |
> | horreum romain | bande 4 | `granary-horreum-grand` 176×160 | 22 px | 0,674 | **14,8** |
> | entrepôt | ei 25-29 | `granary-warehouse-grand` 176×160 | 30 px | 0,605 | **18,1** |
> | terminal | ei 30+ | `granary-hub-grand` 176×160 | 17 px | 0,648 | **11,0** |
>
> Captures `.preview-shots/grain/palier-*`. Chirurgie d'arche nécessaire sur le
> SEUL entrepôt : les trois autres sont sortis en bande du premier coup.
>
> **Lois de production apprises (à appliquer telles quelles à la série) :**
> - **La taille de la porte se pilote par la QUANTITÉ D'ÉLÉMENTS demandée**, pas
>   par des consignes de taille (que PixelLab ignore). Trop d'éléments (hub v1 :
>   4 silos + gantry + 2 granges) → porte à 9 px apparents et un ouvrier de 7 px
>   dessiné dedans ; trop peu (horreum v3-v4 : « few large simple elements ») →
>   le bâtiment perd son identité et redevient un pavillon carré. Le point juste
>   est 3-5 masses.
> - ⛔ **Ne jamais écrire « front facade » dans le prompt** : ça déclenche
>   l'élévation FRONTALE (horreum v1), même avec le mot CORNER. Formule qui
>   marche : « along BOTH visible sides » + « isometric three-quarter view » +
>   « the CORNER points toward the viewer » + « TWO visible facades receding to
>   the left and to the right ».
> - Les fractions ne sont PAS une constante de la campagne : elles se calculent
>   par sprite (`hFrac = apparent_visé × canvas_h / (spanSum × 32 × 0,72)`).
>   Un bâtiment long et bas (horreum) en demande une plus généreuse qu'un
>   bâtiment haut. `wFrac = hFrac × largeur_canvas / hauteur_canvas`, sinon le
>   sprite est ÉTIRÉ (blitProp ne préserve pas le ratio natif).
> - Une table de clés (`RB4[id]`) est résolue PAR SON NOM par
>   `spriteScaleAudit fractions` — se fier aux lignes voisines cassait dès qu'on
>   insérait du code entre la table et son blit (vécu, corrigé).
>
> **Reste pour la famille** : le stade 0 (`granary-prop-silo`, ei < 10) n'a pas
> de palier — rare (il faut 25 greniers avant l'ère 10) mais possible, mesuré à
> ~26 px apparents dans ce cas. À faire si un joueur y arrive.

Sprites hors bande même après G1 (fix requis hors [0,8-1,25], ou incohérence
INTERNE porte/fenêtres). Estimation à confirmer par l'audit : 10-20 sprites.

- **Repeindre EN PLACE d'abord** (doctrine maison) : inpaint de la porte ou
  des fenêtres à la taille cible, palette et pixels voisins intacts.
  Régénération complète en dernier recours seulement, avec la métrologie dans
  le prompt et le gabarit 3/4 coin-en-avant (leçon PLAN-ECHELLE B1 : le mot
  CORNER, pas « not a flat facade »).
- **Gate mesuré AVANT pose** : bbox alpha + porte annotée du PNG livré dans
  la bande, sinon retour atelier (même geste que le contrôle de largeur B1).
- Pipeline : quantize @24 (`scripts/quantize.cjs`), gardes hue/light là où
  elles s'appliquent, `SKIP_FIRE` au remap le cas échéant.

## 6. Lot G3 — Les gardes pérennes

1. Test : tout PNG de bâtiment (houses/, agents/buildings/ hors strips,
   wonders/ à étalon) DOIT avoir son entrée d'annotation — l'oubli casse le
   test, comme le test d'existence des 52 cartes du Vingt-et-un.
2. Test de bande par typologie sur les apparents recalculés.
3. **Casser la garde une fois** (porte gonflée artificiellement sur une
   copie) pour prouver qu'elle mord — les gardes qui comparent le calcul à
   lui-même sont décoratives (leçon lot « Comprendre ses chiffres »).
4. Procédure nouveau sprite dans ce doc : annoter → gate → poser.

---

## 7. Décisions (arbitrages Raph)

1. **La bande de porte : 10-14 px apparents** — confirmée de fait par G0 (la
   médiane du corpus à l'échelle atelier tombe dedans).
2. **Les halles qui gonflent : ART PAR PALIER** (arbitré le 2026-08-04). La
   halle continue de grossir avec les achats, mais change de sprite à 2-3
   paliers, chaque palier redessiné avec plus d'étages/travées pour que la
   PORTE reste à taille humaine sur sa plage d'empreintes. Conséquences :
   - G2 devient la campagne « halles à paliers » : ~25 familles de moteur ×
     1-2 sprites de palier supplémentaires (le sprite actuel sert de palier 1),
     chaque livraison passant le gate mesuré (porte annotée dans la bande à
     l'empreinte MÉDIANE de son palier).
   - Architecture retenue : chaque palier est dessiné à densité FIXE calibrée
     pour sa plage (la porte reste juste sur toute la plage, pas seulement au
     milieu) ; l'excédent de lot entre deux seuils devient clairière/annexes,
     et le SAUT de palier apporte la masse. Le gonflement continu disparaît.
   - En attendant l'art, G1 ne touche PAS à l'échelle des halles (pas de
     régression visuelle d'ici les paliers) ; seul le PLANCHER des petites
     empreintes est posé (§4.2), sous molette.
3. **Merveilles** : non annotées en G0 (hors bande par principe) — l'alignement
   éventuel sur D = 1,135 se jugera sur planche en fin de G1, décision reportée.
4. **Périmètre de la vague d'art G2** (hors halles) : ~12 portes trop grandes,
   ~10 trop petites dont les socles cosmiques moteur — à confirmer sur la table
   résiduelle après G1.

## 8. Ordre, harnais, pièges

**Ordre** : G0 (1 séance) → arbitrages §7 → G1 (1-2 séances, molettes puis
gravure) → G2 (1-2 séances) → G3 (dans la foulée de G1/G2). Total 4-6 séances.

**Harnais** : `__demoCity` (pop 1e25 → grilles, 1e40 → b7, 1e120 → b8,
1e200 → b9), captures `__cityShot` UNIQUEMENT (pane masquée = rAF gelé),
mêmes cams de référence que PLAN-ECHELLE (`.preview-shots/scale-*`), saison
forcée été pour les A/B. Vérif d'ensemble sur les captures par bande +
planche G0 avant/après.

**Pièges hérités** :
- Les mesures §1.4 sont à ±1-2 px : G0 les refait par annotation vérifiée
  avant toute gravure de valeur (on a déjà payé une calibration sur prémisse
  fausse — fiche voirie).
- HMR double-graphe sur les modules carte → hard reload après édition.
- `cmHash` signé (`>>> 0`) et bit faible en damier si un tirage par sprite
  devait s'ajouter.
- Le remap anti-jaune a déjà repeint des flammes couleur peau : toute
  retouche G2 passe par les gardes existantes, jamais par un pipeline de
  régénération globale (« repeindre, jamais reconstruire »).
- Deux sessions peuvent partager cet arbre : trancher par le diff des
  fichiers, pas par `git status` global.
