# Plan v3 — Cité isométrique procédurale (art Kenney, livré bâtiment par bâtiment)

> Remplace les versions précédentes. Acte la stratégie arrêtée après l'exploration
> des assets : **moteur déjà fait en greybox**, **art Kenney/Photoshop livré au
> compte-gouttes**, et **génération procédurale de ville en grille** (routes,
> quartiers, croissance infinie).

## Principe directeur (INCHANGÉ depuis le début)

On ne touche qu'à la **couche de dessin**. Le store et les mécaniques (achat →
bâtiment, croissance par âges, mythes…) ne bougent pas. Le seul pont entre le jeu
et le rendu = **`getCityRenderModel(state)`** (fonction pure). Si la stratégie d'art
change encore, **on ne réécrit que le rendu** — c'est exactement ce qui nous a sauvés.

## Ce qui est DÉJÀ FAIT (le moteur, committé sur `refonte-iso`)

- **P0** contrat `getCityRenderModel` + 5 paliers d'ère + 15 familles
- **P1** toile PixiJS pixel-perfect derrière feature flag `?iso=1`
- **P2** projection iso + grille + **caméra pan/zoom**
- **P3** placement (croissance depuis le centre) — *sera étendu en générateur procédural*
- **P4** table type × palier + bouton debug « avancer d'un palier »

→ La ville **tourne déjà en boîtes grises** : on achète, ça se pose, ça vieillit. Tout
ça reste valide, peu importe l'art derrière.

## Direction artistique (nouvelle)

- **Base : Kenney low-poly, CC0** (cohérent du médiéval au cosmique).
- **Bâtiments : toi, dans Photoshop**, en assemblant les pièces Kenney —
  **un bâtiment par session**, livré ici quand il est prêt.
- **Sol / routes / nature** : tuiles Kenney directes (Tiles Base, Roads, Nature).
- 5 paliers d'âge. Le **cosmique (T5)** viendra des kits 3D pré-rendus, plus tard.

## Workflow « 1 bâtiment par session » (le nouveau rythme)

1. Tu fabriques **un** bâtiment (PNG transparent), base posée en **bas-centre** du canvas.
2. Tu le déposes dans `public/iso/<palier>/<famille>.png` (ex. `t1/food.png` = Cueilleurs au palier 1).
3. Le moteur charge ce qui existe ; **ce qui n'est pas encore fait reste en boîte grise**
   (fallback automatique). Donc ton bâtiment **apparaît tout seul**, sans rien casser,
   et la ville se « colorie » au fil de tes livraisons.
4. La **spec d'export exacte** (taille, ancrage au pixel) se cale ensemble sur **ton tout
   premier bâtiment** — pas besoin de viser parfait avant.

## La grosse brique nouvelle : générateur de ville procédural EN GRILLE

Pour la **croissance infinie** (routes, sols, quartiers qui apparaissent en grandissant) :
- **Sol** : une tuile d'herbe/terre par case.
- **Routes auto-tilées** : la bonne tuile (droite / coin / T / croix) choisie selon les
  voisins ; le réseau s'étend avec la ville.
- **Quartiers + croissance** : depuis le centre, densité et plan évoluant par âge —
  on **réutilise les concepts de l'ancien moteur** (`roadGraph`, `cityPlan`,
  `buildingGenerator`), adaptés à la grille iso.
- Procédural **et déterministe** (seedé par ville) → reproductible.

> Assets ≠ frein à la procédure : tileset fini + générateur = ville infinie (logique LEGO).

## Roadmap (à venir)

| Étape | Quoi | Pourquoi maintenant |
|---|---|---|
| **A** | Chargeur de sprites + fallback greybox | **en premier** : pour que ton 1er bâtiment s'affiche |
| **B** | Générateur procédural : sol → routes → quartiers → croissance | la grosse brique, en parallèle de tes livraisons |
| **C** | Intégration incrémentale de tes bâtiments | au fil des sessions |
| **D** | Évolution par âge : swap de tilesets T1→T5 | la ville se modernise |
| **E** | Polish : citoyens, eau, lumière, transitions | la scène respire |
| **F** | Tests, perf, retrait de l'ancienne carte, fusion | bascule finale |

## Discipline (inchangée)

Une étape = une branche = un « **C'est fini quand…** » validé **à l'écran**. Suite Vitest
verte à chaque étape. **Qualité propre > quantité.** On valide une tranche avant de
produire en masse.
