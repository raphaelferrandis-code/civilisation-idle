# REPRISE — Places en pixel-art (mobilier scatteré)

_2026-07-04 · voie A (visuel seul)_

## But
Remplacer le rendu **procédural** du mobilier des places par des **sprites pixel-art PixelLab**, chaque place différente via des props posés pseudo-aléatoirement, et **évoluant selon l'ère**. **Voie A** : l'ancrage d'une place (`{gx,gy,size,kind}`) et ses cellules de rang `"plaza"` restent **INCHANGÉS** → le gameplay (piétons attirés, véhicules exclus, tooltip « Place ») est intact. On ne swappe **que le dessin**.

## État : COMPLET ✅ (vérifié en jeu, ères antique + futuriste)
Demande client remplie — sur chaque place, **aléatoirement mais STABLE par place** (graine `seedH`, jamais re-randomisé par frame = pas de scintillement) :

| Élément | Emplacement | Sprite | Fn (`renderWorld.js`) |
|---|---|---|---|
| **Bancs tournés vers le centre** | le long des 4 bords, nb tiré par bord (0/1/2) | **directionnel** `bench-‹n\|s\|e\|w›-‹ère›` (repli `bench-‹ère›`, puis rectangle) | `cityMapDrawPlazaFurniture` |
| **Fleurs (parterres) + buissons** | semés sur les **contours** (pourtour), alternance aléatoire ; jardins = plus | `planter-‹ère›` / `bush-‹ère›` (repli procédural) | `cityMapDrawPlazaFurniture` |
| **Fontaine** | **centre de CHAQUE place** (les pièces maîtresses vectorielles statue/puits/étals/cadran/mât/saules ont été RETIRÉES) | `fountain-‹ère›` | `cityMapDrawPlazas` |
| **Coins** | tirage par place → **rien / drapeaux aux 4 coins / lampadaires aux 4 coins** (chaque coin peut rester nu ; militaire = toujours pavoisée) | `flag-‹ère›` / `lamppost-‹ère›` (halo de nuit `cmDrawGlow ∝ nightF` conservé sur les lampadaires) | `cityMapDrawPlazas` |

**Nettoyage vectoriel (2026-07-04)** : tout le dessin vectoriel du mobilier a été **retiré** — pièces maîtresses par personnalité (statue/puits/étals/cadran/mât/saules), motifs de sol (rosace, rayons du parvis, pelouse/bassin du square), **bornes de pierre aux 4 coins**, et **tous les replis procéduraux** des props. Le halo de nuit des lampadaires est conservé (effet de lumière, pas un décor).

**Dalle de sol en pixel (2026-07-04)** : la dernière couche vectorielle (dalle beige + texture d'ère) est remplacée par une **dalle pixel tuilée** dans `cityMapDrawPlazaSurface` — `paving-‹0..3›-‹ère›.png` (4 variantes/ère, 32×32, `create_tiles_pro` `square_topdown` + `top-down` + `outline_mode:segmentation`, remap `--epoch` par ère). Rendu : une tuile blittée par CELLULE de la place (`sz=ceil(T*z)+1`, `imageSmoothingEnabled=false`, variante tirée par `hash(gx,gy)^seedH`), **clippée au contour arrondi** ; la couleur de base pleine reste en **sous-couche/repli** tant qu'une tuile n'est pas décodée. Il ne reste donc AUCUN motif vectoriel de place (hors la fine bordure sombre du contour + le halo des lampadaires).

> ⚠️ **Gotcha cache statique** : `cityMapDrawPlazaSurface` est cuite dans le **cache STATIQUE** (offscreen, re-cuit seulement quand `_camKey` change). Les tuiles se chargent en async → au 1er bake elles ne sont pas décodées → sol figé sur la couleur de repli jusqu'à un re-bake fortuit. **Fix livré** : `plazaProps.setPlazaPropOnLoad(cb)` + `im.onload` sur les clés `paving-*` ; `renderWorld` enregistre `cb = () => CM.staticCamKey = ''` → invalide le cache dès qu'une tuile décode (miroir du garde `CM._groundBakeStable` du terrain). Bug trouvé par revue adversariale ; les captures `__cityShot` le masquaient (elles forcent un re-bake via `resize()`).

**Tailles du mobilier agrandies (2026-07-04, ×2 passes)** : valeurs FINALES (fraction de `s=T·z`) : banc `0.9`, buisson `0.7`, parterre `0.72`, fontaine `1.9` (ancre `cy+0.34·s`), drapeau `1.55`, lampadaire `1.42` (halo `headY=py-1.05·s`, rayons `0.16` / `0.62·s`).

**Animations (2026-07-04)** — couche LIVE (`cityMapDrawPlazas`, param `now` réintroduit), jamais dans le cache statique :
- **Lumières** : le halo des lampadaires VACILLE — `cmDrawGlow(..., night*k*flick)` avec `flick = 0.82 + 0.18·sin(t/240+…) + 0.05·sin(t/70)`.
- **Eau** : `cityMapDrawFountainWater()` — scintillements (angle d'or, clignotement désynchro) + 2 ondes concentriques, dessinés en **GROS PIXELS `fillRect`** (pas d'arc/dégradé → reste pixel-art), teintés par ère, sur le bassin `(cx, cy-0.06·s)`. Uniquement si le sprite fontaine est prêt.
- **Drapeaux** : ondulation par **cisaillement horizontal** (`ctx.transform(1,0,sway,1,0,0)`, base fixe au mât, sommet qui balance), `sway = 0.14·sin(t/480+…) + 0.04·sin(t/150)`.
- ⚠️ Choix : animations **procédurales pixel** (pas de frames PixelLab bakées) — rapide, contrôlable, dans la DA. Si on veut la fidélité « frames bakées » (cf. `blitAnim`/`ANIM_BANDS` de cityEngineSprites), il faudrait générer eau/drapeau animés en `create_1_direction_object`+`animate_object` (v3) par ère (lourd).
- ⚠️ **Vérif visuelle en attente** : le harnais `__cityShot` n'a pas pu tourner (la save de test avait dérivé en effondrement terminal → la vue Cité se démonte ; jeu frais trop petit pour monter la carte). Code validé par lint + 204 tests + relecture ; tuning des positions/amplitudes à confirmer à l'écran.

**Fontaine TOUJOURS centrée + plancher 4×4 (2026-07-04)** : (1) le mobilier se centrait sur `gx+0.5` alors que la dalle (`cityMapDrawPlazaSurface`) se centre sur `(gx-floor(size/2))+size/2` → décalage d'½ tuile sur les tailles **paires** (fontaine hors-centre). Corrigé : `cityMapDrawPlazas` calcule `cx/cy` avec la MÊME formule que la dalle. (2) Les petites places rendaient mal (mobilier serré) → **plancher 4×4** dans `cityPlan.js` (`buildPlazas` : centrale `max(4,min(5,…))`, quartier `max(4,size-1)`). Toutes les places ∈ {4,5}.

**Anti-chevauchement + fontaine bornée (2026-07-04)** : la fontaine agrandie mordait sur les petites places → `fountH = min(1.9·s, ext·1.1)` (taille ∝ place) + eau recalée `∝ fountH`. Système d'**empreintes au sol** dans `cityMapDrawPlazas` : `boxes[]` + `reserve(x,y,hw,hh)` (AABB) ; on pose fontaine (1er) → bancs → décors → coins, chacun ne s'affichant que si son empreinte ne recouvre pas un déjà-placé (`reserve` passé à `cityMapDrawPlazaFurniture`). Résultat : plus de superposition, places plus clairsemées sur les petites tailles.

**Fontaine animée PixelLab — LIVRÉ (5 ères)** : infra bakée dans `plazaProps.js` (`plazaAnimReady`/`blitPlazaAnim` ; **`fw`/`fh` déduits du strip** = largeur/8 × hauteur, `PLAZA_ANIM_FRAMES=8`, `MS=120` ; strips `/pixelart/plazas/anim/fountain-‹ère›.png`). `cityMapDrawPlazas` : si le strip existe → `blitPlazaAnim` (eau bakée image par image), sinon sprite statique + eau procédurale (repli). Les 5 strips livrés (antique/classique/industrielle/moderne/futuriste), eau adaptée à la matière (bleue → cyan/énergie au futuriste).
Pipeline/ère (rôdé) : `create_1_direction_object` (view `top-down`, size 128 → 4 candidats) → `select_object_frames [meilleur]` → `animate_object` (v3, 8 frames, `keep_first_frame:false`, "water rippling/flowing…") → télécharger les 8 frames → **recadrer sur la bbox union + assembler en strip horizontal** (script pngjs jetable `_fountain-strip.mjs`, recadrage = base calée en bas → ancrage correct) → `anim/fountain-‹ère›.png`. La vue `top-down` de create_1_direction_object rend en fait un joli 3/4 (bien pour la carte).

**45 sprites** dans `public/pixelart/plazas/` (nommage `‹prop›-‹ère›.png`, palette maître verrouillée par ère via `remapPalette`) :
- 5 props simples × 5 ères : `lamppost · fountain · flag · planter · bush`.
- **banc directionnel** : `bench-‹n\|s\|e\|w›-‹ère›` (20) — généré en `create_8_direction_object` (view `low top-down`, 48px), on garde les 4 cardinales : rotation `south`=bord nord, `north`=bord sud, `west`=bord est, `east`=bord ouest (chacune regarde le centre).
- (les `bench-‹ère›.png` non directionnels d'origine restent comme repli legacy.)

Ères : `antique` (band 2-3) · `classique` (4) · `industrielle` (5) · `moderne` (6) · `futuriste` (7-9) — cf. `plazaEraForBand`.

## Fichiers touchés (cette session)
- **MOD** `src/game/map/plazaProps.js` — ajout du prop `bush` + param `variant` (clé `‹prop›-‹variant›-‹ère›`) pour les bancs directionnels.
- **MOD** `src/game/map/renderWorld.js` — `cityMapDrawPlazaFurniture` réécrite (bancs directionnels vers le centre + fleurs/buissons sur contours ; plus de lanternes ici) ; bloc **coins** (rien/drapeaux/lampadaires) ajouté dans `cityMapDrawPlazas` (remplace l'ancienne paire de drapeaux flanquant le centre).
- **NEW** `public/pixelart/plazas/*.png` — +20 bancs directionnels, +5 buissons.
- **MOD** `public/pixelart/README.md`.
- Lint clean (0 err) · `vitest` 204/204 · vérif visuelle harnais (`.preview-shots/plaza-*`).

## Contrat d'isolation
Ne touche **NI `agents.js` NI `cityMapRuntime.js`** (chantier « habitants » séparé). Respecté : seuls `renderWorld.js` + `plazaProps.js` modifiés.

## Reste (optionnel / polish)
- **Bancs futuristes discrets** : sprites énergie translucides → peu lisibles au zoom carte. OK conceptuellement ; à re-générer plus opaques si gênant.
- Animer eau fontaine + ondulation drapeau/énergie (bande `blitAnim`, cf. `ANIM_BANDS` de `cityEngineSprites.js`).
- La fontaine est désormais l'UNIQUE pièce maîtresse (sur toutes les places). Si on veut réintroduire de la variété au centre (statue/puits/étals/cadran…), il faudra les générer en **pixel** (ne PAS remettre du vectoriel).
- **Dalles de sol NON remappées** (palette maître) : le remap aplatissait les tuiles lisses (marbre → 2 teintes, béton → 1). Les 20 `paving-*.png` sont des originaux PixelLab. Si un jour on ajoute les teintes stone/marbre/béton manquantes à `master-palette.json`, on pourra remapper proprement.
- Damier possible sur les matières lisses (marbre/béton) car 1 tuile = 1 dalle ; c'est joli pour le marbre (sol de palais). Si gênant sur une ère : réduire à 1 variante (`plazaPropImage` retombe sur `paving-0` quand une variante manque) ou regénérer en mosaïque de petites pierres.

**Refonte sol LISSE (2026-07-04)** : les 1ères dalles (pavés/mosaïques) étaient jugées trop bruitées → régénérées en **grandes tuiles lisses, faible contraste, joints fins** (`create_tiles_pro`, prompt « smooth large … floor tile, low contrast, clean flat surface »). **2 variantes/ère** seulement (`paving-‹0|1›-‹ère›.png`, tonalement proches), `PAVE_N` render passé de 4 à **2** (moins de patchwork). Pas de remap (aplatirait ces tuiles peu contrastées). Les anciennes `paving-2/3-*` supprimées. Résultat : sol beaucoup plus lisible, le mobilier ressort.

## Recette de génération PixelLab
- **Props simples** (`create_map_object`) : view `low top-down`, detail `low detail`, outline `selective outline`, shading `basic shading`. Tailles : lamppost/flag 32×64, fountain 48×48, planter 48×32, bush 44×40.
- **Banc directionnel** (`create_8_direction_object`) : view `low top-down`, size 48, coût 20 générations/ère. Télécharger les 4 rotations cardinales depuis `get_object`, renommer (south→`bench-s`, north→`bench-n`, west→`bench-w`, east→`bench-e`).
- **Dalle de sol** (`create_tiles_pro`) : `tile_type square_topdown`, `tile_view top-down`, `tile_size 32`, `outline_mode segmentation`. Prompt numéroté « 1). … 2). … » de 4 variations de la MÊME matière (mosaïque de petites pierres = grille cachée ; grandes dalles lisses = damier). Sortie = 16 tuiles ; garder `tile_0..3` → `paving-‹0..3›-‹ère›.png`. **PAS de remap** (aplatit les matières lisses).
- Prompt = `‹amorce prop›, ‹matière ère›, ‹suffixe DA›`. **Suffixe DA** (sans clause d'orientation pour le banc 8-dir) : `minimalist pixel art, small simple isolated object, transparent background, very limited palette of 2 or 3 shades per material, thin subtle outline, soft flat lighting from the north with a darker south side, strong readable silhouette, low detail, cozy storybook city-builder feel, grounded static object, no characters`
- **Matières par ère** : antique = _rough ancient stone & wrought iron_ · classique = _polished white marble & bronze_ · industrielle = _riveted cast iron & brass (Victorian)_ · moderne = _concrete/brushed steel/glass, subtle cyan_ · futuriste = _luminous energy/holographic, cosmic white-gold & cyan_.
- Post-génération : `curl -sL -o <f>.png <download-url>` puis `node scripts/remapPalette.mjs public/pixelart/plazas/<f>.png --epoch <pierre|marbre|fonte|neon|noosphere> --inplace`.

## Harnais de vérif visuelle utilisé
`preview_start vite-dev` (port **5183**) → naviguer `http://localhost:5183/` → couper la sim (`for(let i=1;i<1e5;i++)clearInterval(i)`) → monter une ville (`__state.population=__D('1e16')` band 2 antique / `1e42` band 7 futuriste ; bâtiments ~24-60 ; `__cityRecompute()`) → centrer `__CM.cam` sur une place → `await __cityShot({name,citizens:'none'[,night:0.9]})` → `Read .preview-shots/<name>.png`. Le sprite fontaine se charge en paresseux : 1ʳᵉ frame = repli procédural, recapturer après ~400 ms.
