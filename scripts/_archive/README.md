# scripts/_archive — scripts de fabrication historiques

Archivés le 06/10 (audit du 05/10, entrée SCRIPT-4). **Ne pas les relancer.**

## Pourquoi ils sont là et pas supprimés

Ces scripts ont fabriqué une partie de l'art du jeu (habitants, émeutiers, bêtes de trait,
bateaux, véhicules, props des scènes moteur, premières tuiles de sol) à partir de
générations PixelLab. Ils gardent la **trace** de cette fabrication : les ids PixelLab, les
prompts, les recettes d'assemblage — c'est la provenance citée par
`docs/STEAM-PUBLICATION.md` (art généré par IA), et la recette à reprendre pour une
génération future (`isoBatchRoster.json`).

## Pourquoi il ne faut pas les relancer

- Ils écrivent directement dans `public/`, sans copie de sauvegarde, et presque tous sans
  vérifier si le fichier existe déjà.
- L'art qu'ils écraseraient a été **retouché depuis**, à la main ou par des passes qu'on ne
  rejoue pas : reprise de palette OKLab (913 sprites, 12/07), dé-liserage des sols, bandes
  `-half`, égalisation, DA flat des habitants. Un relancement « pour voir » détruit ces
  retouches sans retour.
- Les objets PixelLab s'effacent après environ 8 h : les ids sont expirés. `fetchProps.mjs`
  lancé sans filtre bouclait environ 50 h (80 essais × 15 s sur 155 entrées).
- Cinq d'entre eux (`fetchAgentsIso`, `fetchRiotIso`, `fetchVehiclesIso`,
  `fetchVehiclesIsoAnim`, `fetchIsoPhase5`) relèvent de la DA « Figurine d'époque »,
  abandonnée au profit de la DA flat.

Chaque script refuse donc de tourner dès sa première ligne. Pour le relancer **en
connaissance de cause** (après avoir relu ce qu'il écrit, et de préférence vers un dossier
de travail), il faut poser la variable d'environnement `CE_RELANCER_ARCHIVE=1`. Ils
lisent et écrivent des chemins relatifs au dossier courant : on les lance depuis la racine
du dépôt.

## Ce que contenait chacun

| Script | Ce qu'il fabriquait |
|---|---|
| `fetchAgents.mjs` | bandes de marche des habitants (4 directions × 6 frames de 68 px) |
| `fetchAgentVillager.mjs` | bandes de marche du villageois (`villager-{dir}.png`) |
| `fetchFarmer.mjs` | paysan des champs (`farmer-{dir}.png`) |
| `fetchRiotBasket.mjs` | porteurs de panier et premiers émeutiers |
| `fetchRiotEras.mjs` | émeutiers par ère (`agents/events/`) |
| `fetchDraftAnimals.mjs` | bêtes de trait (cheval, bœuf — `agents/animals/`) |
| `fetchBoats.mjs` | sprites statiques des bateaux (vue est) |
| `fetchBoatAnims.mjs` | bandes animées des bateaux, écrites PAR-DESSUS les statiques |
| `fetchVehicles.mjs` | véhicules, 4 cardinales en frame unique |
| `fetchVehicleAnims.mjs` | bandes animées des véhicules (roues, cheval du char) |
| `fetchCaravanMuleRest.mjs` | mulet couché de la halte de caravane (`caravan-mule-rest.png`) |
| `fetchProps.mjs` | props des scènes de bâtiments-moteur (155 entrées) |
| `fetchIsoTiles.mjs` | premières tuiles de sol iso (`create_isometric_tile`), remplacées par `scripts/fetchGroundTiles.mjs` |
| `fetchAgentsIso.mjs` + `isoBatchRoster.json` | habitants iso sur les 4 diagonales ; le roster garde les prompts et ids du lot |
| `fetchRiotIso.mjs` + `riotIsoRoster.json` | émeutiers iso sur les 4 diagonales |
| `fetchVehiclesIso.mjs` | véhicules iso, vues diagonales en frame unique |
| `fetchVehiclesIsoAnim.mjs` | véhicules iso animés (écrasait les vues frame unique) |
| `fetchIsoPhase5.mjs` | bateaux par stade en 8 rotations (`iso/boat-*`) |
| `daPanel.mjs` | planche de comparaison des pistes de DA habitants (`.preview-shots/`) |
| `fixAgentFrame.mjs` | correction ponctuelle d'une frame d'`industrialwoman-south.png` |
| `isoToneDown.cjs` | désaturation EN PLACE, non idempotente, des anciennes tuiles de sol (clôt `docs/archive/RETRI-2026-07-27.md` n°27) |
| `normalizeIsoScenes.mjs` | calage des scènes de place `plaza-*.png` sur le losange 2:1 (archivé par SCRIPT-12 : ces scènes ont quitté le jeu, MORT-12, et sont rangées déjà normalisées dans `art/references-ab/places-scene/`) |

Les outils de fabrication encore vivants, pilotés par arguments, restent dans `scripts/` :
`fetchAgentFlat`, `fetchAgentIdle`, `assembleAgent*`, `fetchEraVehicle`, `fetchHouseSkin`,
`fetchCosmicScene`, `fetchStageScene`, `fetchPlazaProp`, `fetchPlazaAnim`, et
`fetchGroundTiles` (qui refuse désormais d'écraser une tuile en place sans `--force`).
