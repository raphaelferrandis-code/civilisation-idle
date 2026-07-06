# Point de reprise — SPLASH-ARTS des cartes d'achat (2026-07-06)

But : chaque **carte d'achat de bâtiment** (BuildingShop / PurchaseRow) reçoit en **fond
un splash-art pixel de scène COMPLÈTE** (illustration pleine façon photo, décor + profondeur),
affiché en **filigrane discret** derrière le texte, et **évoluant par époque**.

## Décisions verrouillées (validées par Raphaël)

1. **Vraie scène complète**, PAS un objet détouré. → outil = **API REST Pixflux**
   `POST https://api.pixellab.ai/v1/generate-image-pixflux` avec **`no_background:false`**.
   Les outils MCP (`create_map_object`…) ne font que des objets transparents → INUTILISABLES ici.
2. **Colorimétrie naturelle** : l'IA colle TOUJOURS un voile jaune/sépia (« golden hour »,
   « warm colors » l'aggravent). → **retirer le voile en post** par rééquilibrage des blancs
   (gray-world partiel). NE PAS sursaturer (la v3 à palette forcée saturée a été REFUSÉE).
   Le **dessin est conservé** (recolorisation directe, pas de re-génération).
3. **Filigrane discret** (fond de carte atténué ~0.24 + scrim), pas un panneau d'art plein.
4. **5 époques** par bâtiment : antique · classique · industrielle · moderne · futuriste
   (mapping = `plazaEraForBand` / `splashEpochForEra`). ~30 bâtiments × 5 = ~150 splashs.
5. Lumière **haut-gauche → ombres bas-droite** dans chaque prompt (règle projet).

## Pipeline reproductible

Clé API dans l'env **`PIXELLAB_API_KEY`** (36 c.). Solde : abonnement Tier 2, ~3260 gén. restantes
(`mcp__pixellab__get_balance`). Réponse Pixflux = `{image:{base64:"data:image/png;base64,…"}, usage}`.

1. **Générer la scène** (curl) — body type :
   ```json
   {"description":"<scène pleine de l'ère>… strictly frontal, light from top-left, shadows bottom-right, detailed pixel-art landscape filling the frame",
    "negative_description":"sepia, yellow tint, golden hour, oversaturated, neon",
    "image_size":{"width":400,"height":240},
    "view":"side","outline":"lineless","shading":"highly detailed shading","detail":"highly detailed",
    "no_background":false,"text_guidance_scale":9}
   ```
   `curl -s -X POST .../v1/generate-image-pixflux -H "Authorization: Bearer $PIXELLAB_API_KEY" -H "Content-Type: application/json" -d @req.json` → décoder `.image.base64` (strip `data:image/png;base64,`).
2. **Corriger la couleur** : `scripts/splash/recolor.cjs` — gray-world partiel (A=0.72) + petit
   gain de sat 1.12. ⚠ lancer avec `NODE_PATH=<projet>/node_modules` (pngjs). Adapter les chemins
   d'entrée/sortie (le script actuel est câblé sur foragers ; à généraliser en fonction(in,out)).
   L'img2img (init_image) a été ESSAYÉ pour recolorer → **raté** (trop monochrome), écarté.
3. **Installer** : `public/pixelart/splash/<buildingId>-<epoch>.png` + ajouter la clé
   `"<id>-<epoch>"` dans le `AVAILABLE` de `src/game/data/pixelSplash.js`.

## Intégration (FAITE, vérifiée en jeu)

- `src/game/data/pixelSplash.js` : `splashEpochForEra(eraIndex)` (via `eraBandOf`),
  `AVAILABLE` (Set des splashs présents), `splashSrcFor(id, eraIndex)` avec **repli** sur
  l'époque dispo la plus proche → les bâtiments/époques pas encore générés retombent en douceur.
- `src/components/ui/PurchaseRow.jsx` : `const splash = splashSrcFor(b.id, currentEraIndex())` ;
  classe `pr-has-splash` + `style={{ "--pr-splash": url(...) }}` sur `<article>`.
- `src/styles/purchase.css` : `.purchase-row` en `position:relative; isolation:isolate` ;
  `.pr-has-splash::before` (image, opacity .24, z-index:-1, `border-radius:inherit`) +
  `::after` (scrim dégradé gauche→droite). Pas d'`overflow:hidden` (rognerait le « +N » flottant).
- ⚠ mémo mineur : `splash` dépend de l'ère lue en rendu, pas d'une prop → le `memo`
  `arePropsEqual` peut montrer une époque périmée jusqu'au prochain re-render (rare, se corrige seul).
  Si gênant plus tard : passer l'époque/bande en prop depuis BuildingShop.

## Affinages depuis le pilote (2026-07-06)

- **RECETTE DE LA DA (validée) = « esprit antique » : PEINT + ATMOSPHÉRIQUE + MATÉ.**
  ⚠ Un 1er jet des 4 époques en prompt « bright clear day, deep blue sky, vivid natural colors »
  + négatif sépia est sorti **TROP CARTOON** (plat, saturé) → REFUSÉ. La bonne recette reproduit
  l'antique :
  - Prompt : « **detailed painterly pixel-art landscape**, soft warm hazy afternoon light, **rich
    atmospheric depth**, textured brushy shading, **muted earthy natural palette** », composition
    avant/milieu/arrière-plan, arbre qui cadre. PAS de « bright / vivid / deep blue sky / clear day ».
  - `negative_description` : « flat cartoon, cel-shaded, bright saturated colors, simple flat shapes,
    clip art, plain flat sky, hard outlines ». `text_guidance_scale: 9`.
  - **⚠ LUMIÈRE NEUTRE À LA SOURCE > white-balance a posteriori.** « soft warm hazy afternoon light »
    fait CUIRE une lumière chaude que le WB ne défait PAS (halo de soleil, ombres chaudes) → il RESTE
    un voile jaune (classique/industrielle refusées pour ça). Solution qui a marché : régénérer en
    **« soft cool overcast daylight, neutral white light »** + négatif « warm yellow tint, orange glow,
    golden hour, sepia » → sort NEUTRE d'emblée, aucun WB nécessaire (comme moderne). Réserver
    « warm light + WB » à l'antique (déjà fait) ; pour tout le reste, viser la lumière neutre.
  - **White-balance** = repli si un tirage reste voilé : `scripts/splash/whitebalance.cjs <in> <out> [A] [SAT]`
    (A défaut 0.72, `A=1.0` = neutralisation complète du cast moyen ; `NODE_PATH=<projet>/node_modules`).
    **SKIP** sur scènes nocturnes/froides (futuriste bleu : le gray-world tuerait le bleu voulu).
- **Carte d'achat refondue** (validée) : `.purchase-row` en **flex-column** (nom / production /
  barre / pied `bouton+compteur`), plus de colonne icône, **icône de bâtiment SUPPRIMÉE**
  (`buildingIcon`/`BUILDING_ICONS`/`CATEGORY_ICONS` retirés de PurchaseRow ; le lock des rangées
  verrouillées garde `.pr-icon`). Filigrane **opacity 0.5 + `background-position:right 40%` + scrim
  95deg** (opaque gauche → dégagé droite). ⚠ le dock (`.city-shop-dock` dans views-world-fullframe.css)
  imposait l'ancienne grille (`align-items:center`, bouton `width:100%`, icône ronde) → surcharges
  RETIRÉES pour déférer au layout de base. C'est le dock que voit l'user (vue Cité).

## Batch (script + gotchas)

- Génération en lot : `scratch/generate-moteurs.cjs` (matrice bâtiment×époque, `fetch` Pixflux,
  concurrence limitée). ⚠ **CONC ≤ 4** : au-delà, l'API répond « maximum number of concurrent jobs »
  (3 échecs à CONC=6). Revue AVANT câblage : `scratch/build-moteurs-review.cjs` (downsample 2× box,
  Artifact). Manifeste = `DONE_BUILDINGS` × `EPOCH_ORDER` dans pixelSplash.js (dériver, pas lister).
- ⚠ **White-balance gray-world sur-corrige les scènes très VERTES à bleu bas** (champ B≈33) → ciel
  VIOLET/lavande. Sur ces scènes : lower A ou SKIP (régénérer sans WB). A=0.6 OK pour la plupart des
  diurnes chauds ; les futuristes (bleu) et l'urbain neutre : PAS de WB.
- ⚠ Vérif live d'une carte : le port de preview accumule l'état idle → peut se **bloquer sur la vue
  Effondrement** (nav Cité HS), même save fraîche. Contournement de vérif : `import('/src/game/data/
  pixelSplash.js')` puis appeler `splashSrcFor(id, eraIdx)` — teste le résolveur sans le DOM.

## État & reste à faire

- ✅ **Cueilleurs (`foragers`)** : 5 époques, carte refondue (flex-column, icône retirée).
- ✅ **Moteurs (5 bât.) : granaries_city, caravans, markets, guilds, irrigated_fields** × 5 = 25.
- ✅ **Savoir (10 bât.) : scribes, storytellers, schools, academies, observatories, libraries,
  ancestral_cult, universities, printing_houses, think_tanks** × 5 = 50. Installés, dans
  `DONE_BUILDINGS`, câblés, vérifiés (50/50 résolveur, 80 splashs en jeu au total).
  - **Observatoires** = twilight bleu (astro). **Antiques = bois/chaume** (pas pierre/marbre :
    négatif `stone building, marble, stone columns, granite`), souvent VIDÉS de personnages.
  - ⚠ Retours DA récurrents de Raph : **trop d'humains / tenues anachroniques** → mettre « No people »
    + négatif `crowd, many people, modern clothing, anachronistic dress` ; garder au plus 1 figure
    en tenue d'époque stricte. **Conteur antique** = plateforme + totem + huttes, PAS de figure
    (essai « feu au centre » REJETÉ, il voulait le jour). WB léger (A=0.45) sur diurnes.
  - Éclaircir un tirage trop sombre : gamma in-place, `node -e` LUT `255*(i/255)^0.6` (mean 45→76).
- ✅ **Infrastructure (10 bât.) : aqueducts, roads, watch, bureaucracy, sewers, courthouses,
  public_works, ministries, archive_grids, ruin_architects** × 5 = 50. Installés, câblés, vérifiés.
  - Retours DA : **le SUJET du bâtiment doit être LISIBLE** (aqueduc = la conduite d'eau au centre,
    pas juste un village ; watch moderne = poste de POLICE, pas une supérette → négatif `shop, store,
    supermarket`). **Aqueduc antique** = flume en bois BASSE le long du terrain (pas un tronc géant
    sur un ravin → négatif `giant single log, tree-trunk bridge, gorge, chasm, tall trestle`).
  - ⚠ WB gray-world peut SUR-RÉCHAUFFER une scène très bleue (eau, gain R≈1.8) → neutralise le bleu
    voulu ; surveiller, skip si scène d'eau/froide.

## ✅ PROJET COMPLET (2026-07-06)

**Les 26 bâtiments-moteur × 5 époques = 130 splashs** installés dans `public/pixelart/splash/`,
câblés via `DONE_BUILDINGS` (pixelSplash.js), vérifiés (130/130 résolveur, 0 manquant, PNGs 200,
0 erreur console). Carte d'achat refondue (flex-column, sans icône, filigrane opacity 0.5). Non commité.
Reste éventuel : retouches ponctuelles au fil du jeu (silhouettes résiduelles, thèmes à préciser).
  Ids bâtiments : voir `BUILDING_ICONS` dans PurchaseRow.jsx (foragers, granaries_city, caravans,
  markets, guilds, scribes, storytellers, schools, aqueducts, roads, watch, irrigated_fields,
  river_ports, water_mills, mint_houses, imperial_exchanges, academies, observatories, libraries,
  bureaucracy, sewers, courthouses, public_works, ministries, archive_grids, ruin_architects,
  ancestral_cult, universities, printing_houses, think_tanks).

## Montrer au user (captures)

Les captures in-game **timeoutent** (boucle canvas). Le scratchpad temp **ne remonte pas** dans son UI.
→ présenter via **Artifact** : `scratch/da-review.html` (build `build-da-review.cjs`, PNG embarqués en
data-URI, + maquette carte filigrane). URL de la revue Cueilleurs :
https://claude.ai/code/artifact/172760cd-c22c-410e-b25d-377fad1c5911

Non commité. Rien n'est poussé.
