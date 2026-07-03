# Point de reprise — REFONTE DES MERVEILLES en pixel-art (2026-07-02)

Branche : `main` (commité + poussé). Ce fichier = handoff portable pour continuer demain.

But : refaire les **6 merveilles** en pixel-art PixelLab, une par une, 5 rangs (paliers)
chacune, **de face** et **très grandes au rang V** (« qui sortent du lot »), en gardant
évolutions + animations. Source de vérité des merveilles : `CM_WONDERS` dans
`src/game/map/layout.js` (~l.129). Rendu : `drawWonder` dans `src/game/map/renderBuildings.js`.

Dossier des assets : `public/pixelart/wonders/` (+ son `README.md` = table des 6 merveilles,
convention `<id>-t<rang>.png`, suivi).

---

## Règles verrouillées (validées par Raphaël)

1. **Toutes les merveilles DE FACE** : prompt PixelLab = « seen directly from the front,
   strictly frontal symmetrical composition facing the camera ». (Le mausolée avait des
   rangs en 3/4 → refaits.)
2. **Très grandes, surtout au rang V** (jusqu'à ~400 px de côté natif, ~4× un bâtiment).
3. **Lumière HAUT-GAUCHE → ombres BAS-DROITE** dans chaque prompt.
4. **AUCUN habillage procédural** autour d'une merveille pixel-art : pas d'esplanade, aura,
   ombre portée, torches, stèles, particules, couronne orbitale, faisceau, bannière — le
   sprite EST tout le monument (early-return dans `drawWonder` quand `px` existe).
5. **Flammes/bannières animées NETTEMENT plus grandes que l'élément cuit** dans le sprite,
   sinon le sprite de base dépasse et on voit double.
6. **Seuils rééchelonnés** : les sims (`course-gr1-profils.md`) montrent des parties très
   longues → les anciens seuils étaient atteints trop tôt. Voir chaque merveille.

---

## Merveille 1 — Le Mausolée du Fondateur (`dynasty1`) : ✅ TERMINÉ, en jeu

- Concept « **Nécropole des Fondateurs** » : accrétion horizontale, chaque rang engloutit la
  tombe précédente ; le tumulus du rang I reste visible au cœur du rang V (puits de lumière).
- **Seuils** : `[1, 50, 200, 400, 750]` dynasties (sim ≈ 540-634 dyn/partie). Dans `layout.js`.
- **Sprites** : `dynasty1-t1..t5.png` (112×96 → 400×368), frontaux, fonds nettoyés.
- **Flammes animées** : `flame-small.png` (9 fr. **16×24**) + `flame-large.png` (9 fr. **32×53**),
  boucle ping-pong (0→8→0), palette recalée or. `dynasty1-flames.json` = **85 ancres**
  centre-bas curées à la main (t1:2, t2:1, t3:3, t4:50, t5:29). Couronne t5 = 1 GRANDE
  centrale + 2 petites.
- **Couverture garantie** : overlay = taille JSON ×1.7 (porte ×1.15), blit `(x-dw/2, y-dh+1)`.
  Les px de flamme cuite non couverts sur les 9 frames sont passés en **braises** dans les
  sprites (`scripts/wonders/emberize-uncovered.cjs`). Test : `scripts/wonders/test-coverage.cjs`
  = **0 px non couvert** sur les 5 rangs.
- **Intégration** `drawWonder` (renderBuildings.js) : manifeste `WONDER_PX_IDS`
  (`dynasty1` dedans), sprite à densité constante **PPT=34 px/tuile** (taille en jeu = taille
  native / 34 × tuile), flammes overlay déphasées, repli procédural si sprite pas chargé.
  Vérifié en jeu rangs I/IV/V.

## Merveille 2 — La Colonne du Million (`pop1m`) : ✅ ANIMÉE & INTÉGRÉE (2026-07-03)

- Concept « **Colonne Innombrable** » : accrétion VERTICALE (recensement de pierre), marbre
  crème + spirale/accents OR + bronze→or + bannières pourpres. L'anti-mausolée. Rang V = la
  plus HAUTE silhouette du jeu. Designs **VALIDÉS** par Raphaël.
- **Seuils rééchelonnés** : `[1e6, 1e13, 1e20, 1e27, 1e34]` habitants (+7 ordres/rang ; la
  courbe d'ères va à 1e34 = Singularité, cf. `world.js eraPopulationThreshold`). `tierLabel`
  passe maintenant par `fmtShort` (import ajouté dans `layout.js`) — plus de « millions » codés.
- **Sprites** : `pop1m-t1..t5.png` (96×144 → 176×400), frontaux, fonds retirés.
  ⚠ Le t5 avait un fond en **DÉGRADÉ** → nettoyé avec `scripts/wonders/strip-bg-gradient.cjs`
  (estimation du fond ligne par ligne).
- **Animations (2026-07-03)** — deux techniques :
  1. **Flamme hélicoïdale du t5** (demande de Raph : la flamme suit la torsade de la colonne) :
     asset dédié `pop1m-flame-spiral.png` (8 fr. 28×80, PixelLab « corkscrew flame » animé en
     rotation continue). ⚠ Une rotation ne se ping-pong PAS (sens de vrille inversé) →
     nouveau mode `loop:"forward"` par asset dans le JSON. Overlay classique ancre-bas, sc 1.6.
     NB : une 1re variante de flamme animée « rotation » CYCLAIT LES COULEURS (strobe) → rejetée ;
     c'est la variante à chevrons hélicoïdaux qui vend la rotation.
  2. **Tissus + torche = mode « PATCH » (custom start frame PixelLab)** : on croppe la zone du
     sprite cuit, on la passe à `animate_object` en `custom_start_frame_base64` → les frames
     GARDENT le fond du crop et se re-blittent pixel-pour-pixel à la même place (`mode:"patch"`
     dans le JSON : pas d'échelle, pas de +2, coin haut-gauche). Frame 0 = le cuit exact →
     zéro vision double, zéro test de couverture. Ping-pong OK pour du tissu.
     - t5 : 5 bannières (`pop1m-b1..b5.png`, 9 fr. chacune) — crops OPAQUES (mur derrière),
       aucun effacement nécessaire.
     - t2 : 2 gonfalons (`pop1m-t2cloth.png`, même strip aux 2 ancres, déphasé) ; t4 : flamme
       de torche (`pop1m-torch.png`). Crops à fond TRANSPARENT → le cuit sous les trous d'alpha
       ferait vision double → **effacé des sprites** par `scripts/wonders/erase-baked-pop1m.cjs`
       (t2 : tissu entre les mâts ; t4 : flamme au-dessus de la vasque). Réversible via git.
  - `pop1m-flames.json` : nouvelles options par asset `mode:"patch"`, `loop:"forward"`,
    `anchor:"top"`, `sc`, `ms`. Code générique dans `drawWonderPixelSprite` (renderBuildings.js),
    un fetch `<id>-flames.json` PAR merveille du manifeste (plus codé dynasty1 seul).
  - ⚠ PixelLab : les jobs `custom_start_frame` peuvent DISPARAÎTRE silencieusement (b3 ×2) ;
    et les gros base64 se corrompent en transit — retailler/quantifier le crop qui coince.
- **Intégré** : `pop1m` ajouté à `WONDER_PX_IDS`. Vérifié en jeu rangs II/IV/V (shots à `now`
  différents : flamme tourne, torche flambe, drapeaux/bannières ondulent, patchs sans couture).
- **Vérif — pièges rencontrés** (en plus de ceux du bas de ce fichier) : forcer
  `__state.population` avec un NOMBRE JS casse le Decimal → rupture 100 % → l'app se
  VERROUILLE sur la vue Effondrement (plus de canvas). Remède : réécrire le save localStorage
  (`population:"1e8"`, `instability:0`, `crisisLimitAnnounced:false`) en neutralisant
  l'autosave (`Storage.prototype.setItem = noop` juste avant `location.reload()`).
  Il faut une pop ≥ ère 6 (`reEra` de pop1m) sinon la merveille n'est pas active.
  Slot merveille : `__CM.layout.wonderSlots[1]` (idx = position dans CM_WONDERS, pas dans
  state.wonders).

## Merveille 3 — La Couronne de Pierre (`era_kingdom`) : ✅ TERMINÉE (2026-07-03)

- Concept « **Cercle du Serment** » (validé) : accrétion RADIALE — la géologie devient
  orfèvrerie. I cromlech brut sur butte → II anneau taillé à fleurons bronze → III
  forteresse-couronne à gemmes grenat → IV couronne d'or sur muraille ronde (porte sombre)
  → V **couronne pure colossale** (choix de Raph contre la variante « forteresse à porte +
  escarboucle » ; les deux tirages sont dans le scratchpad de session si besoin).
- **Seuils rééchelonnés** : ères `[19, 22, 25, 29, 33]` = Royaume / Conquérant / Empire /
  Métropole / Machination. ⚠ Les anciens seuils [9,13,17,21,25] dataient d'AVANT la
  refonte des ères (« Royaume » était l'ère 9, c'est maintenant la 19). reEra reste 9
  (échelle de réapparition par cycle, indépendante du 1er déblocage).
- **Sprites** : `era_kingdom-t1..t5.png` (128×88 → 400×256), la seule merveille plus
  LARGE que haute. Post-traitement notable : les PORTES PixelLab sortent blanches/grises
  (opaque OU transparent selon tirage) → re-remplies en dégradé sombre par boîte bornée à
  la base de muraille MESURÉE (un flood-fill fuit par le bas du canvas) ; herbe/dallage/
  silhouette humaine effacés. Vérifiée en jeu rangs I-V (⚠ premier accès = repli
  procédural ~1 s, precharger avant capture).
- **t4 remplacé à la demande de Raph** par le 1er tirage « diadème-forteresse » (celui à
  ciel complet baké) : fond retiré par REGION-GROWING depuis les bords avec garde-fous
  couleur (pierre chaude/or/grenat jamais mangés) + coupe plate sous la base (y>=166) +
  porte repeinte en aplat sombre. La croix d'or au sommet est gardée.
- **Animations : SCINTILLEMENT DES GEMMES** (t3: 7, t4: 6, t5: 9 ancres curées à la main
  parmi les dizaines de clusters détectés). Asset `gem-glint.png` DESSINÉ EN CODE
  (scripts non nécessaires : scratch make-glint) : 16 frames 9×9 dont 12 VIDES →
  éclat épisodique en ping-pong (point→croix→étoile 4 branches→croix→point), déphasé
  par gemme. Nouveau `anchor:"center"` dans drawWonderPixelSprite (éclat centré sur sa
  gemme). `era_kingdom-flames.json` : asset glint ms 120, sc 1.5.
- ⚠ PIÈGE DEV : `wonderFlamesData` met en cache l'ÉCHEC de fetch du JSON (catch → entrée
  null à jamais). Si le `<id>-flames.json` est créé APRÈS le chargement de la page,
  RECHARGER LA PAGE avant de vérifier, sinon les overlays n'apparaissent jamais.

## Merveilles 4-6 : ⬜ À FAIRE

`era_empire` (Arc de Triomphe), `era_mega` (Aiguille Céleste), `era_singularity` (Œil de
la Singularité). Pour chacune : **d'abord vérifier/rééchelonner les seuils** dans
`CM_WONDERS` (l'Arc « 500..20000 achats » et l'Aiguille « 30min..72h » semblent plausibles
mais à recouper avec les sims ; l'Œil « 1..12 mythes » à recouper avec le rythme des
mythes), puis design → 5 sprites frontaux → animations → ajout à `WONDER_PX_IDS`.
Concepts pas encore arrêtés.

---

## Pipeline flammes/overlays (rôdé sur le mausolée) — `scripts/wonders/*.cjs`

Node + pngjs (déjà dans node_modules). ⚠ Chemins ABSOLUS codés en dur dans les scripts
(node_modules/pngjs + dossier wonders) — OK sur ce poste, à corriger si changement de machine.

1. `detect-flames.cjs <sprite.png> [--boxes out.png]` → JSON des clusters de pixels chauds
   (ancre centre-bas). **Curer à la main** : exclut portails lumineux, or décoratif, et surtout
   les MARCHES D'ESCALIER dorées (le t5 du mausolée en avait 37 en faux positifs).
2. Générer la flamme/bannière de base (PixelLab `create_map_object`, view "side", lineless)
   puis l'animer (`animate_object`, mode v3, 8 frames → 9 stockées).
3. `make-strip.cjs <dossier_frames> <out.png>` → bande horizontale.
4. `trim-strip.cjs <strip> <fw> <fh> <n> <out>` → **ROGNE au contenu opaque**. ⚠ GOTCHA
   MAJEUR : le canvas PixelLab a ~50 % de marge transparente → sans rognage les overlays
   sont 2× trop petits (c'est ce qui a causé « on voit le sprite de base »).
5. `regold-flame.cjs` → recale la palette (liseré saumon→orange, or resaturé).
6. `build-flames-json.cjs` → assemble le `<id>-flames.json` (décisions de tri encodées dedans ;
   c'est spécifique au mausolée, à dupliquer/adapter par merveille).
7. `test-coverage.cjs` → vérifie que chaque px cuit est couvert sur les 9 frames (doit dire
   « COUVERTURE TOTALE »). Sinon `emberize-uncovered.cjs` passe les px restants en braises.
8. `compose-preview.cjs <t1..t5> multi <out>` → composite statique de contrôle.
- Inspection : `upscale.cjs`, `crop.cjs`, `palette-report.cjs`.
- Nettoyage fond PixelLab : `strip-bg.cjs` (fond uni) / `strip-bg-gradient.cjs` (dégradé).

Format `<id>-flames.json` : `asset` (small/large/door → {file, fw, fh, frames}) + `tiers.tN`
avec `flames:[{x,y,w,h,kind}]` (x,y = ancre bas-centre). Consommé par `drawWonderPixelSprite`.

---

## Vérif en jeu (preview MCP)

`.claude/launch.json` est réglé sur **port 5183** (5181 pris par une autre session).
Forcer un état de démo dans la console :
```js
__state.wonders = ["pop1m"]; __state.wonderTiers = { pop1m: 5 };
__state.population = 2e34; __state.food = 1e40;
document.querySelector('dialog[open]')?.close();   // ⚠ une CRISE (dialog) FIGE le rendu
__CM.born['wonder:pop1m'] = -1e6;                  // ⚠ sinon merveille INVISIBLE (érection<0)
__CM.forceFrame();                                  // rAF gelé si onglet caché
__cityShot({ name: 'x', now: 1000 });               // capture → .preview-shots/x.png
```
Gotchas : (1) modale de crise ouverte → `isActive` false → frame() et captureFrame() figés,
fermer avant. (2) `born` négatif obligatoire pour capture à `now` fixe. (3) le t5 est immense,
dézoomer (`__CM.cam.zoom`).

---

## Notes de commit
- Outillage `scratch/` est **gitignoré** → les scripts réutilisables ont été copiés dans
  `scripts/wonders/` (suivi) pour être portables. `.preview-shots/` aussi gitignoré.
- Ce commit inclut aussi du travail d'AUTRES sessions présent dans l'arbre (palettes, eau,
  égouts, engineSprites, renderWorld, `docs/reprise-infra-pixel.md`) — poussé tel quel à la
  demande de Raph (« commit tout »). Le mien = merveilles (layout.js seuils, renderBuildings.js,
  public/pixelart/wonders/, scripts/wonders/).
