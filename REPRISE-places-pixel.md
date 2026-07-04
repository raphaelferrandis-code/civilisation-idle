# REPRISE — Places en pixel-art (mobilier scatteré)

_2026-07-04 · voie A (visuel seul)_

## But
Remplacer le rendu **procédural** du mobilier des places par des **sprites pixel-art PixelLab**, chaque place différente via des props posés pseudo-aléatoirement. **Voie A** : l'ancrage d'une place (`{gx,gy,size,kind}`) et ses cellules de rang `"plaza"` restent **INCHANGÉS** → le gameplay (piétons attirés vers la place, véhicules exclus, tooltip « Place ») est intact. On ne swappe **que le dessin**.

## État : câblage COMPLET ✅
**25 sprites** générés (5 props × 5 grappes d'ère) dans `public/pixelart/plazas/`, nommage `‹prop›-‹ère›.png` :
- props : `lamppost · bench · fountain · flag · planter`
- ères : `antique` (band 2-3) · `classique` (4) · `industrielle` (5) · `moderne` (6) · `futuriste` (7-9)
- palette maître verrouillée **par ère** (`remapPalette`, ≤ 22 teintes/sprite).

Les 5 props sont **câblés au rendu**, chacun avec **repli procédural** (aucune régression si un PNG manque) :
| Prop | Emplacement | Fonction |
|---|---|---|
| lamppost | 4 coins (+ halo de nuit `cmDrawGlow ∝ nightF` conservé) | `cityMapDrawPlazaFurniture` |
| bench | 4 bords (facing SE uniforme) | `cityMapDrawPlazaFurniture` |
| planter | scatter `seedH` (ex-parterres de fleurs) | `cityMapDrawPlazaFurniture` |
| fountain | pièce maîtresse, cas `else` (villes luxueuse/impériale/défaut) | `cityMapDrawPlazas` |
| flag | **nouveau** : paire flanquant le centre, gate `seedH<0.5` ou pid militaire | `cityMapDrawPlazas` |

Chaque place diffère via `seedH` (positions parterres, présence drapeaux, type de centre) — stable entre frames (**ne PAS re-randomiser par frame** = scintillement).

## Fichiers
- **NEW** `src/game/map/plazaProps.js` — registre paresseux par clé `‹prop›-‹ère›` : `plazaEraForBand(band)`, `plazaPropReady(prop,band)`, `blitPlazaProp(ctx,prop,band,xPx,yPx,hPx)` (ancré au sol), `blitPlazaPropCentered(...)`.
- **MOD** `src/game/map/renderWorld.js` — `cityMapDrawPlazaFurniture` (~l.1451) + `cityMapDrawPlazas` (~l.1518). Import ajouté en tête.
- **NEW** `public/pixelart/plazas/*.png` (25).
- **MOD** `public/pixelart/README.md` (ligne dossier `plazas/`).

## Contrat d'isolation (chantier « habitants » en parallèle)
Ne touche **NI `src/game/map/agents.js` NI `src/game/map/cityMapRuntime.js`** (chantier « habitants » séparé, committé `f74b597`). Les places n'en ont pas besoin : on remplace le **corps** des fns plaza dans `renderWorld.js`, déjà appelées par le runtime.

## Partis-pris à (re)valider
1. **Fontaine = seul centre pixelisé.** Statue (parvis), puits (agricole), étals (marché), cadran (savant) restent **procéduraux** — sprites non générés.
2. **Bancs facing SE uniforme** sur les 4 bords (pas d'orientation par côté).
3. Sprites **statiques** (pas encore d'animation eau/drapeau).

## Reste à faire
- Vérif visuelle in-game + tuning tailles/ancres : **F5** (mapFullReloadPlugin prend code + PNG), ville **band ≥ 2** (band ≥ 3 pour les lampadaires).
- Animer eau fontaine + ondulation drapeau → bande `blitAnim` (cf. `ANIM_BANDS` dans `cityEngineSprites.js`).
- Générer les centres manquants (statue/puits/étals/cadran) pour compléter la variété.
- Éventuel sol de place en tileset ; orientation des bancs en 4 directions.

## Recette de génération PixelLab (pour étendre/regénérer sur n'importe quel poste)
Outil : `create_map_object`. Params validés : view `low top-down`, detail `low detail`, outline `selective outline`, shading `basic shading`. Tailles : lamppost/flag 32×64, bench 48×40, fountain 48×48, planter 48×32.

Prompt = `‹amorce prop›, ‹matière ère›, ‹suffixe DA›` :
- **Suffixe DA** (fixe) : `minimalist pixel art, small simple isolated object, facing south-east, transparent background, very limited palette of 2 or 3 shades per material, thin subtle outline, soft flat lighting from the north with a darker south side, strong readable silhouette, low detail, cozy storybook city-builder feel, grounded static object, no characters`
- **Matières par ère** : antique = _rough ancient stone & wrought iron, warm terracotta/dark stone_ · classique = _polished white marble & bronze_ · industrielle = _riveted cast iron & brass (Victorian)_ · moderne = _concrete/brushed steel/glass, subtle cyan accent_ · futuriste = _luminous energy/holographic light, cosmic white-gold & cyan_

Post-génération : télécharger → `node scripts/remapPalette.mjs public/pixelart/plazas/‹f›.png --epoch ‹pierre|marbre|fonte|neon|noosphere› --inplace`.

> ⚠️ Le manifeste des job-IDs PixelLab (`scratchpad/plaza-gen-manifest.json`) est **local à la machine** et ne voyage pas — inutile de toute façon, les 25 PNG sont committés.
