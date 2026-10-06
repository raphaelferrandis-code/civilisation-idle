# scripts/ — l'outillage du dépôt

Rien ici n'est livré aux joueurs, sauf ce que `scripts/build/` fait au build. Ces scripts
fabriquent ou retouchent l'art, sortent la version web, dessinent des planches de contrôle.
Chaque script a un **en-tête** qui fait foi (pourquoi il existe, ce qu'il écrit, les pièges
déjà payés) : ce fichier le résume et donne les règles communes. Il date de l'audit du
05/10 (SCRIPT-12), après l'archivage des fabricants historiques (`_archive/`).

## Les règles communes

1. **On lance depuis la racine du dépôt** : `node scripts/x.mjs …`. La plupart des scripts
   lisent et écrivent des chemins relatifs (`public/…`, `art/…`, `.preview-shots/…`).
   Lancés d'ailleurs, ils échouent ou écrivent au mauvais endroit.
2. **Où vont les sorties.**
   - `public/` : **livré** aux joueurs (web et .exe). Y écrire, c'est changer le jeu.
   - `src/…` : fichiers **générés et committés** (`emblemAtlas.js`, `sapPaths.js`,
     `ruinArt.js`, `vehicleSkins.js`, `fonts.css`, `fontawesome.css`). Ne pas les retoucher
     à la main : relancer le script.
   - `art/` : **sources** gardées hors du jeu (originaux, références d'A/B tranchées,
     sources Aseprite). Non livré.
   - `.preview-shots/` : planches de contrôle, ignoré par git.
3. **Mesurer d'abord.** Les retouches en place n'écrivent qu'avec `--apply` (ou `--ecrire`)
   et mesurent sans. Les autres ont presque tous un `--dry`. Une retouche **déjà jouée**
   n'est pas à relancer « pour voir » : l'art livré est sa sortie, souvent retouchée depuis.
4. **Garde-fous à ne pas contourner sans raison.**
   - Passes de palette en lot (`quantize.cjs`, `remapPalette.mjs`) : elles passent par
     `lib/pixelartGuard.cjs`, qui refuse de réécrire un dossier de `public/pixelart` sans
     `--force` et ne touche jamais l'art peint (fresques, emblèmes, feux, places…).
   - `fetchGroundTiles.mjs` refuse d'écraser une tuile en place, `bakeUiIcons.cjs` une
     icône déjà livrée (elle a pu être reprise à la main), `makeDesTemple.mjs` ses dés.
5. **Commits épinglés.** `sceneLive.mjs` et `plazaBrazierAnim.mjs` lisent leurs images
   d'origine dans git à `af920cd1`, `vegetationDose.mjs` à `82f49aaf` : relancer ne repart
   jamais de leur propre sortie. Les deux commits sont sur `origin/main` ; **ne jamais
   réécrire l'historique** qui les contient (rebase, squash), ces scripts casseraient.
6. **Ateliers communs (`lib/`)** : ne pas recopier ce qui y est, l'importer. Les copies
   divergeaient (audit du 05/10, SCRIPT-11).

   | Module | Ce qu'il offre | Utilisé par |
   |---|---|---|
   | `lib/oklab.cjs` | `oklab(r, g, b)`, `labD2` : distance perceptuelle | remapPalette, bakeUiIcons, bakeUiIconSizes, bakeRuinsEmblems |
   | `lib/iconBake.cjs` | `bakeIcon` : icône d'UI réduite à une taille native | bakeUiIcons, bakeUiIconSizes |
   | `lib/half.mjs` | `bakeHalf`, `paletteOf`, `nearest` : cuisson ÷N des bandes `-half` | bakeHalfBands, fetchAgentFlat, fetchAgentIdle |
   | `lib/pixellab.mjs` | images d'une animation, zip `/download` (réessais 423), `assembleStrip`, `inkRows`, `stripShadow` | assembleAgent*, fetchAgentFlat, fetchAgentIdle, stripBakedShadow |
   | `lib/fire.mjs` | la flamme en langues : masque, profondeur, rampe, `hash` | plazaBrazierAnim, sceneLive |
   | `lib/packBake.mjs` | cuisson d'un sprite de pack tiers (encre commune, réduction, palette) | importPackVehicles |
   | `lib/pixelartGuard.cjs` | ce qu'une passe de palette en lot a le droit de réécrire | quantize, remapPalette |
   | `lib/headless.mjs` | le faux navigateur des harnais de la racine | bench-*, simulate-ce, sim-10-profils |

7. **Ce qui vient de l'extérieur.**
   - Packs tiers **hors dépôt** (licence : redistribution interdite) : `bakeWaterTiles
     --src`, `sliceCainosPlants --src`, `importPackVehicles --zip`, `exportWizardChrome
     <dossier>`. Seuls les dérivés sont versionnés.
   - PixelLab : ids d'objets et de personnages (MCP) ; `ruinsPixellab.mjs` lit
     `PIXELLAB_API_KEY`. Les objets PixelLab expirent au bout de quelques heures.
   - Aseprite : `plaisirsGirls.mjs` (variable `ASEPRITE` s'il n'est pas dans
     `C:/Program Files/Aseprite/`).
   - Python : `refix_sprite.py` (venv et dépôt pixel-art-fixer, cf. son en-tête).
8. **Couplés aux tests** (les déplacer ou les renommer casse la suite) :
   `derimTiles.mjs` (isoGroundTileRim), `cssMort.mjs` (cssMort), `vendorFontAwesome.mjs`
   (fontAwesomeSubset), `build/*` (buildDist, pruneWorkFiles), `zipDist.mjs`, `lib/*`
   (scriptLibs, pixelartGuard), `_archive/*` et `fetchGroundTiles.mjs` (scriptsArchive :
   leurs refus), `sondeGeste.js` (devKnobs), `data/vegetation-trees.json`
   (vegetationFamily, isoWinterTreeAssets), `data/sprite-inventory.json` et
   `data/sprite-apparent.json` (blitSnap), `data/ruin-offsets.json` (ruinArt),
   `data/sewers-base/` (sewerOutfall). D'autres tests relisent la SORTIE d'un script
   (sceneLive, plazaBrazierAnim, eauTrouble, pixelsPerdus, ombresPeintes…) : leur en-tête
   le dit.

## Les familles

Légende des notes : **idem.** = rejouable, rend les mêmes fichiers ; **épinglé** = lit sa
source dans git à un commit fixe ; **test** = un test lit le script ou sa sortie.

### Build et sortie web

| Script | Usage | Entrées → sorties | Notes |
|---|---|---|---|
| `build/optimizeDistPngs.mjs` (+ `pngWorker`, `pngRecompress`) | appelé par `vite build` | PNG de `dist/` recompressés sans perte | jamais sur `public/` ; test |
| `build/pruneWorkFiles.mjs` | appelé par `vite build` | retire de `dist/` les fichiers d'atelier copiés depuis `public/` | test |
| `build/stampServiceWorker.mjs` | appelé par `vite build` | date `dist/sw.js` par l'empreinte du contenu | test |
| `zipDist.mjs` | `npm run zip:web` ou `node scripts/zipDist.mjs [sortie.zip]` | `dist/` → `civilisation-idle-web.zip` (racine, ignoré par git), relu et contrôlé | seul script d'archive web ; test |

### Générateurs (sortie committée, relançables)

À relancer quand leur source change ; ils réécrivent leur sortie entière.

| Script | Usage | Entrées → sorties | Notes |
|---|---|---|---|
| `bakeRuinsEmblems.mjs` | `[--sheet]` | emblèmes (`art/emblemes-ruines/`, `ui/ruins`) + fresque → `ruins-tree/emblems.png`, `src/…/emblemAtlas.js` | idem. ; refuse si un ton de rampe disparaît |
| `buildRuinsSap.mjs` | sans argument | `ruins-tree/memoire.png` → `src/…/ruinsTree/sapPaths.js` | idem. ; après `repairRuinsTwigs` |
| `buildRuins.mjs` | `<job.json>` (sortie de `ruinsPixellab`) | ruines brutes → `public/pixelart/ruins/`, `src/game/map/ruinArt.js`, `data/ruin-offsets.json` | test (ruinArt) |
| `buildPalette.mjs` | sans argument | ancres d'époque (dans le script) → `master-palette.json/.gpl`, `palettes/` | seule source des teintes d'époque |
| `bakeUiIconSizes.cjs` | `<dossiers…> [--sizes 16,24,32,48] [--dry]` | maîtres 64 px → variantes `<nom>@<taille>.png` à côté | idem. ; écrase ses variantes |
| `bakeUiIcons.cjs` | `<src> <out> [--size 24] [--alpha 0.5] [--dry] [--force]` | `ui/nav/_orig/` → `ui/nav/` | refuse d'écraser sans `--force` |
| `makePwaIcons.mjs` | sans argument | `src/assets/LOGO.png` → `public/icons/` | idem. |
| `makeDesTemple.mjs` | `[DES_OUT=…]` | → `ui/augures/bones/bones.png` (+ aides `die-N`) | refuse d'écraser sans `FORCE=1` |
| `vendorFonts.mjs` | sans argument (réseau) | Google Fonts → `src/assets/fonts/`, `fonts.css` | à relancer seulement si on change de police |
| `vendorFontAwesome.mjs` | sans argument | icônes `fa-*` citées par `src/` → `src/assets/fontawesome.css` (sous-ensemble) | test |
| `importPackVehicles.mjs` | `[--zip <archive>] [--sat] [--vmax]` | pack MinZinn (hors dépôt) → bandes `agents/vehicles/`, `vehicleSkins.js` | pack externe |
| `installVegetation.mjs` | `[--dry]` | `data/vegetation-raw/` + `data/vegetation-trees.json` → arbres `iso/` | idem. ; puis `snowTrees` ; test |
| `snowTrees.mjs` | `[--dry]` | arbres `iso/` → `…-winter.png` | idem. ; test |
| `sceneLive.mjs` | `[--dry] [--cle a,b] [--masques]` | scènes moteur (git `af920cd1`) → `<clé>-live/-back.png`, `iso/plaza/anim/`, planche | épinglé ; `LIVE_LAYERS` à reporter à la main ; test |
| `plazaBrazierAnim.mjs` | `[--dry] [--ere antique]` | braseros (git `af920cd1`) → `iso/plaza/anim/brazier-*`, statique, planche | épinglé ; test |
| `plaisirsGirls.mjs` | `--build` / `--gigolos` / `--repos`, `--preview…` | dessin au pixel (dans le script) → bandes `agents/inhabitants/`, sources `art/plaisirs/*.aseprite` | aperçus sans écriture dans `public/` |
| `plaisirsAlanguies.mjs` | sans argument | tirages `art/plaisirs/pixellab/` → `agents/inhabitants/` | idem. |
| `plaisirsMenuSprites.mjs` | sans argument | dessin au pixel → `ui/plaisirs/` | idem. |
| `sliceUiChrome.mjs` | sans argument | planche `docs/concepts/ui-panneau/` → `ui/chrome/panel-greek.png`, `gauge-frame.png` | idem. |
| `exportWizardChrome.mjs` | `<dossier Sprites du pack>` (obligatoire) | pack Crusenho (hors dépôt) → `ui/chrome/wizard/` (les seuls sprites que lit le CSS) | pack externe |
| `bakeWaterTiles.mjs` | `--src <pack> [--sheet] [--row]` | pack Zro Dfects (hors dépôt) → `water/river-tiles.png` | pack externe |
| `calmWaterTiles.mjs` | `[--in] [--out]` | `water/river-tiles.png` → nappe calme (`art/references-ab/eau-planches/`) | idem. |
| `eauSansEcailles.mjs` | `[--seed N] [--out] [--board]` | couleurs de la nappe → `water/river-tiles-calm-ciel-v2.png` | idem. à graine égale ; test |
| `sliceCainosPlants.mjs` | `--src "<TX Plant.png>" --mode tufts|plants [--out]` | pack Cainos (hors dépôt) → touffes `iso/deco/`, buissons | pack externe |
| `sewerOutfall.mjs` | `[--preview]` | `data/sewers-base/` → sprites d'égouts `agents/buildings/` | rejouable à l'octet ; test |
| `splitDroneRotors.cjs` | sans argument | `art/vehicules/drone-mech.png` → `drone-mech-body.png` | idem. |
| `bakeHalfBands.mjs` | `<dossier> <préfixe> [--div=N] [--alpha=N] [--hot=rampe] [--dry]` | bandes `agents/<dossier>/` → `-half.png` (jamais la bande source) | idem. |
| `spriteScaleAudit.mjs` | `inventory|fractions|apparent|merge` | `houses/`, `agents/buildings/` → `data/sprite-*.json`, `engine-fractions.json` | test (blitSnap) ; inventaire à régénérer après tout ajout de sprite |

### Retouches en place déjà jouées (cible fixe)

Elles ont fait leur travail ; l'art livré est leur sortie. Sans option elles **mesurent**.

| Script | Usage | Ce qu'elles ont repeint | Notes |
|---|---|---|---|
| `ancestralCultFire.mjs` | `[--dry]` | bande de feu du Culte des ancêtres (stade 0) et son repli | |
| `contourBuissons.mjs` | `[--apply]` | contour des buissons Cainos (`art/references-ab/buissons-cainos/`) | |
| `derimTiles.mjs` | `[--apply] [--only] [--except]` | liseré sombre des tuiles de sol `iso/` | test (importe `diagnose`) |
| `eauCalme.mjs` | `[--proof <png>]` | couleurs de la nappe calme (`art/references-ab/eau-planches/`) | |
| `eauTrouble.mjs` | `[--proof <png>]` | eau de la cité en ruine → `water/` | test |
| `foyerFondu.mjs` | `[--apply] [--proof <png>]` | disque du foyer du campement | refuse s'il est déjà fondu |
| `ombresPeintes.mjs` | `[--apply] [--proof <png>]` | ombres peintes des maisons, rendues transparentes | test |
| `pixelsPerdus.mjs` | `[--apply] [--proof <dossier>]` | pixels perdus de la scène d'arrivée (`camp-hearth-fire.png`, tuiles) | test |
| `repairRuinsTwigs.mjs` | `[--dry]` | rameaux coupés de la fresque de l'Arbre des Ruines | puis `buildRuinsSap` |
| `solsCoherents.mjs` | `<equalize|shift> <clé> … --backup=<dossier>` | valeur des variantes de sol | sauvegarde obligatoire |
| `vegetationDose.mjs` | `grass` ou `tone <in> <out> <pré|feuillu|sapin>` | dose B de l'herbe d'été | épinglé (`82f49aaf`) |
| `plazaAnimMask.mjs` | `[--ecrire] [--bleu N] [--ere x]` | masque d'animation des fontaines resserré sur l'eau | planche sans `--ecrire` |
| `sliceAqueduct.mjs` | `<ère> [x0 x1 x2 x3]` | découpe des scènes d'aqueduc (`art/aqueducs/`) | ⚠ plus de consommateur en jeu (aqueducs retirés) |
| `sliceFlowerBeds.mjs` | `<planche.png> [préfixe]` | parterres du terre-plein (`art/references-ab/terre-plein-parterres/`) | ⚠ retirés du jeu |

### Outils de retouche à arguments (sur le fichier qu'on leur donne)

| Script | Usage | Geste |
|---|---|---|
| `blindArch.mjs` | `<src> <dst> --zone x0,y0,x1,y1 --lintel Y …` | mure une entrée monumentale en arc aveugle |
| `bustBounce.mjs` | `<bande.png>… [--down] [--up] [--zone] [--w]` | rebond d'un pixel du buste sur une bande |
| `ecartSol.mjs` | `<png> "r,g,b;…" [--min=26] [--darker] [--dry]` | écarte les couleurs d'un sprite de celles du sol |
| `millPost.mjs` | `crop|sym <in> <out>` | recadrage sur l'encre / symétrie 4 axes d'une hélice (⚠ la branche moulins à eau qu'il servait est retirée) |
| `mirrorAgentBand.mjs` | `<perso> <dir-source> <dir-cible>` | reconstruit une direction par miroir d'une autre |
| `padStrip.mjs` | `<N> <bande.png>…` | rembourre des frames à une toile N×N, pieds alignés |
| `prepLawnTexture.mjs` | `<in> <out> [r,g,b] [keep] [crop]` | prépare une texture de gazon à répéter |
| `reflame.mjs` | `<f.png> --mask all|motion|box|colors …` | repeint des flammes sur la rampe feu |
| `ringText.mjs` | `--in <disque.png> [--probe|--unroll|--out]` | grave une inscription dans l'anneau d'un disque |
| `snapTintRamp.mjs` | `<variante…> [--seuil 12] [--dry]` | rabat une maison sur la rampe de sa teinte |
| `stripGroundSlab.mjs` | `<f.png> [--out] [--tol] [--edge] [--dry]` | retire la dalle au sol d'un bâtiment PixelLab |
| `quantize.cjs` | `<fichier|dossier> [--colors N] [--dry] [--force]` | réduit les teintes (median-cut), garde-fou en lot |
| `remapPalette.mjs` | `<fichier> [--epoch] [--max] [--inplace|--out] [--dry]` | rabat sur la palette maître (OKLab), garde-fou en lot |
| `refix_sprite.py` | `python scripts/refix_sprite.py <png> [--in-place] …` | re-grille un sprite à grille « molle » (Python, venv) |

### Pipeline PixelLab (outils à arguments)

Ils écrivent dans `public/` : à lancer pour une **nouvelle** génération, jamais sur un
sprite livré sans relire ce qu'il remplace.

| Script | Usage | Sortie |
|---|---|---|
| `fetchAgentFlat.mjs` | `assemble <nom> <charId>` puis `half <nom>` (`--cardinal`, `--out`, `--pick`) | bandes de marche diagonales + `-half` |
| `assembleAgentUrls.mjs` | `<nom> <charId> <se> <sw> <ne> <nw> [--out]` | les mêmes bandes par URLs directes (zip en 423) |
| `assembleAgentClip.mjs` | `<sortie> <charId> <animId> <direction> <frames>` | une bande, vers un fichier libre |
| `assembleAgentDance.mjs` | `<nom> <charId> <se> <sw> [--frames=8] [--skip=1]` | bande de danse (face, le dos recopie) |
| `fetchAgentIdle.mjs` | `<nom> <charId> [--as=idle|sit|wave] [--dirs] [--to-lowest]` | bandes d'attente + `-half` (palette de la marche) |
| `fetchEraVehicle.mjs` | `<type> <skin> <objectId> <animations…> | --static` | véhicule d'époque, 4 diagonales + `-half` |
| `fetchCosmicScene.mjs` | `<objectId> <clé> [rotation]` | scène moteur cosmique (canevas 128×224) |
| `fetchStageScene.mjs` | `<objectId> <clé> <L>x<H> [--x2|--fit] …` | scène moteur à un stade, canevas exact de l'ancienne |
| `fetchHouseSkin.mjs` | `<objectId> <clé> [rotation] [--half]` | skin d'habitation cosmique |
| `fetchPlazaProp.mjs` | `<objectId> <prop> <ère> [--all]` | props de place (4 diagonales) |
| `fetchPlazaAnim.mjs` | `<objectId> <animId> <prop> <ère> [frames] [direction]` | eau animée d'une fontaine de place |
| `fetchFountainAnims.mjs` | `[filtre]` | strips des anciennes scènes de place (`art/references-ab/places-scene/`, plus livrés) |
| `fetchGroundTiles.mjs` | `[filtre] [--force] [--equalize]` | tuiles de sol ; surtout la **documentation** des lots ; refuse d'écraser |
| `ruinsPixellab.mjs` | `<dossier> --mode multi|grid …` (`PIXELLAB_API_KEY`) | ruines brutes + `job.json` pour `buildRuins` |
| `extractVehFrame0.cjs` | `<dossier>` | frame 0 de chaque véhicule, référence pour une génération |
| `stripBakedShadow.mjs` | `<bande.png>…` | retire l'ombre cuite du gabarit de marche (idem.) |
| `stripOpaqueBg.mjs` | `<bande.png>…` | efface un fond opaque resté derrière un personnage |

Après assemblage : `quantize.cjs --colors 24`, puis la demi-bande (`fetchAgentFlat half`).

### Planches d'inspection (n'écrivent pas dans le jeu)

Sortie dans `.preview-shots/` ou dans le dossier donné ; lecture seule sur l'art.

| Script | Usage | Montre |
|---|---|---|
| `annotateCheck.mjs` | `overlays|sheets <dossier>` | portes et fenêtres annotées sur les sprites |
| `boatFaces.mjs` | `[bateau]` | les 8 rotations d'un bateau (sprites rangés dans `art/`) |
| `boatNavettePlaisirs.mjs`, `boatPlanche.mjs`, `boatVitrine.mjs` | `[Z]`, `[bande] [zoom]`, `[Z]` | les bateaux dessinés par le code (`boatCrewRaster.mjs` : leur équipage) |
| `boatSheet.mjs` | sans argument | planche-contact des anciens sprites de bateaux (`art/`) |
| `buildRiotPanel.mjs` | `[PANEL_OUT=…]` | panneau HTML des émeutiers par ère |
| `contactSheet.mjs` | sans argument | bandes de marche des agents, par direction |
| `grainBoard.mjs` | `<dossier>` | maisons et bâtiments à l'échelle du jeu, portes et étalon |
| `halfABSheet.mjs` | `<dossier> <préfixe> [--drawH] [--zoom]` | avant/après de la cuisson `-half` |
| `plazaSheet.mjs` | `<sortie.html> <étiquette>=<png>…` | props de place en situation |
| `spriteZoom.mjs` | `<facteur> <dossier> <png…>` | agrandissement avec réglettes |
| `tilePan.mjs` | `<clé> <N> [variantes] [miroir]` | pan N×N d'une matière de sol |
| `tileSheet.mjs` | `<lot-id> [sortie]` | les 16 tuiles brutes d'un lot PixelLab |
| `vieBoard.mjs` | `[sortie.png]` | les dessins de la petite vie |
| `frameStats.mjs` | `<a.png> [b.png] [--crop] [--bins]` | valeur et écart de deux captures |
| `lightCheck.mjs` | `<png>…` | direction de lumière estimée |
| `cssMort.mjs` | sans argument | règles CSS qui ne visent plus rien (code 1 s'il y en a) ; test |

### Perf

`sondeGeste.js` : sonde à coller dans la console du jeu **en build de prod**
(`npm run preview` ou .exe), cf. `docs/PERF-CARTE-REPRISE.md`. Elle lit les seuls profileurs
autorisés en production (`src/game/map/devKnobs.js`) ; test.

### Harnais d'équilibrage (racine du dépôt)

`bench-crises.js`, `bench-myths.js`, `bench-plaisirs.js`, `bench-rupture.js`,
`bench-temple.js`, `simulate-ce.js`, `sim-10-profils.js` : le vrai moteur du jeu, sous Node,
avec le faux navigateur de `lib/headless.mjs`. Ils écrivent leur rapport (`*.md`) dans le
dossier courant. Ils sont lintés, et `src/__tests__/rootHarnesses.test.js` vérifie qu'ils se
chargent et rendent la main (budget minuscule).

### `_archive/`

Les fabricants historiques : ils refusent de tourner sans `CE_RELANCER_ARCHIVE=1`. Leur
raison d'être et leur contenu sont dans `_archive/README.md`.

### `data/`

| Fichier | Rôle |
|---|---|
| `sprite-inventory.json`, `sprite-apparent.json`, `engine-fractions.json` | instantanés de `spriteScaleAudit` (grainBoard, blitSnap) |
| `sprite-annotations.json` | portes et fenêtres relevées (annotateCheck, grainBoard ; la molette de dev `__grainAudit` de `spriteScale.js` l'importe) |
| `vegetation-trees.json`, `vegetation-raw/` | famille d'arbres : choix et générations brutes (installVegetation) |
| `ruin-offsets.json` | décalages des ruines (buildRuins → ruinArt.js) |
| `sewers-base/` | sprites d'égouts d'origine (sewerOutfall) ; `sewers-src/` : trace d'une génération, aucun lecteur |
| `pixellab-vivant.json`, `pixellab-scenes-tardives.json` | traces des lots PixelLab (cités par les plans) |
