# Reprise — série INFRA en pixel-art (bâtiments-moteur)

État au 2026-07-02. Sert à reprendre la production des scènes pixel des bâtiments
d'infrastructure sur une autre machine. Complète la mémoire agent
`pixel-engine-building-scenes` (technique détaillée) — ce fichier est le résumé versionné.

## Où on en est

Les bâtiments-moteur (ère 1) et la série SAVOIR (10/10) sont déjà en pixel-art.
La série **INFRA** vient de démarrer :

| Bâtiment | id | État | Animation |
|---|---|---|---|
| Aqueducs | `aqueducts` | ✅ fait | eau qui coule |
| Veilleurs | `watch` | ✅ fait | feu de signal |
| Égouts | `sewers` | ▶️ à faire (proposition ci-dessous) | — |
| Bureaucratie | `bureaucracy` | à faire | — |
| Tribunaux | `courthouses` | à faire | — |
| Grands travaux | `public_works` | à faire | — |
| Ministères | `ministries` | à faire | — |
| Réseaux d'archives | `archive_grids` | à faire | — |
| Architectes des ruines | `ruin_architects` | à faire | — |

## Comment c'est câblé (rappel)

- **Rendu** : `src/game/map/engineSprites.js`, fonction `drawEngineSpriteCore`,
  une branche `if (id === "<id>")`. On teste `propReady()` / `animReady()` puis on
  blit ; sinon repli sur le procédural d'origine (jamais supprimé). Couvre les
  bands 0-6 (le stade cosmique band≥7 reste procédural `cosmicSavoir`).
- **Chargement des sprites** : `src/game/map/cityEngineSprites.js`
  - props statiques → ajouter la clé dans `PROP_KEYS`
  - bandes animées → ajouter une entrée dans `ANIM_BANDS` (`{fw, fh, frames, ms}`)
  - helpers exportés : `propReady`, `blitProp`, `animReady`, `blitAnim`
- **Palette** : tag d'époque dans `scripts/buildPalette.mjs` (`spriteEpochTags`),
  puis `node scripts/remapPalette.mjs <png> --epoch feu --inplace` (verrou 16-24 teintes).
- **Fichiers** : `public/pixelart/agents/buildings/<clé>.png`.

## Pipeline de production d'une scène (recette)

1. `create_map_object` (PixelLab MCP) — 2 concepts, vue `low top-down`, outline
   `selective`, détail `medium`, fond transparent. Registre **primitif** au stade 0
   (bois/feu/pierre sèche — jamais médiéval/moderne : on voit ces bâtiments dès l'ère 0).
   Règles DA : bâtiment FERMÉ = zone carrée + toit visible ; élément à ciel ouvert
   = zone ronde ; signal d'identité GROS et visible.
2. Choisir le meilleur, `animate_object` mode `v3` frame_count 6 (→ 7 frames) si feu/eau.
3. Composer la bande animée **hors-ligne** (fige tout sauf le feu/l'eau) :
   scripts dans le scratchpad de session, basés sur `_cultFire.mjs` (feu) ou
   `aqueductWater.mjs` (eau). Masque = pixels chauds (feu) ou bleus (eau) dans une
   fenêtre GATE. ⚠️ Sur les sprites en bois roux, resserrer les seuils feu
   (`RMIN 185 / RB 100`) sinon tout le bois est pris pour du feu.
4. Pour l'eau : **requantifier sur la rampe water** du cœur AVANT le remap palette
   (sinon le cyan vif devient gris). Rampe : `#1f3a44 #356b78 #6fb0b8` + `#e9e4d6`.
5. `remapPalette.mjs --epoch feu --inplace` sur chaque PNG.
6. Câbler (rendu + PROP_KEYS/ANIM_BANDS + tag buildPalette).
7. Vérifier live (voir plus bas), puis `npx vitest run src/game/map`.

## Proposition ÉGOUTS (`sewers`) — validée dans le principe, pas encore faite

Deux couches :
1. **Station** sur la/les tuile(s) `sewers` existante(s) : bouche d'évacuation
   voûtée en pierre sèche (arche basse + caniveau sombre + grille de bois),
   bâtiment fermé toit visible. Statique, éventuel filet d'eau animé en sortie.
2. **Plaques d'égout sur les routes** : PAS des sprites posés un par un, mais une
   **déco de chaussée bakée** (comme les rubans du terre-plein, cf. `layout.js`
   `computeTerrePleinSegments` + rendu dans `renderWorld.js`). Motif 4-6 px par
   cellule de route, choisi par hash déterministe, densité ∝ nombre d'égouts,
   qui s'étend depuis la station (rues proches d'abord). Staging par ère :
   caniveaux transversaux (primitif) → plaques rondes en fonte (pierre/industriel).

## Aqueduc — historique utile

- **Modulaire** : une scène de 3 tuiles découpée en `aqueduct-{outlet,seg,intake}`
  (48×72). `seg` répété pour les spans 5/7/10 (coupes entre les tréteaux).
- Orientation **VERTICALE « bout-à-l'eau »** essayée puis **retirée** (« ça rend
  pas terrible »). Seul l'HORIZONTAL subsiste. Les slots `vert:true` sauvegardés
  sont ignorés (re-placement horizontal forcé une fois) — voir `layout.js`.
- **Placement connecté au fleuve** : le score tire une extrémité au bord du ruban
  peint (`riverYAt`/`riverHwByCol`), le corps reste au sec (`aqFits` autorise la
  berge aux 2 cellules d'extrémité seulement). `waterEnd` E/O → miroir H au rendu.

## Vérification live (pièges connus)

- Serveur : `preview_start` config `dev-verify` (port auto). Monter une démo :
  `__state.buildings.<id> = N` puis `__cityRecompute()` puis `__CM.forceFrame()`.
- Caméra : `CM.cam = {x:(gx+0.5)*CM.TILE, y:(gy+0.5)*CM.TILE, zoom}` ; `CM.centered=false`.
  Monde = grille × `CM.TILE` (32), linéaire (pas iso).
- Capture : `CM.capture={night:0,health:1}` avant `forceFrame`, puis
  `CM.canvas.toDataURL('png')` → POST `/__shot?name=<n>` (écrit `.preview-shots/`, gitignoré).
- ⚠️ Un `dialog[open]` (event de crise) met `isActive()=false` → `forceFrame` ne
  reconstruit rien. **Fermer les dialogs avant CHAQUE forceFrame.** Si la save de
  preview s'effondre (vue prestige, plus de carte), repartir d'une save neuve :
  neutraliser `localStorage.setItem` puis `localStorage.clear()` puis reload.
- Preuve alternative si la capture est douteuse : instrumenter `CM.ctx.drawImage`
  et compter les blits `<clé>.png`.

## À NE PAS OUBLIER

- **`master-palette.json` / `.gpl` / `palettes/` PAS régénérés** : les tags des
  nouveaux sprites sont dans la SOURCE `buildPalette.mjs` mais pas figés, parce
  qu'une refonte terre-cuite d'`eraThemes.js` est en cours. Quand les teintes sont
  figées : `node scripts/buildPalette.mjs`.
- Le repli procédural de chaque bâtiment reste en place — ne pas le supprimer.
