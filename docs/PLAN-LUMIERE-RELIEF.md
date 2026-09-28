# Plan — Lumière et relief de la carte

Chantier ouvert le 2026-09-14, sur deux phrases de Raph :

> « j'ai vu des images récentes de liaison entre Blender et l'IA qui donnent des
> résultats assez jolis. Là on a un problème de lumière et de relief dans le jeu.
> Établis un vrai plan d'amélioration sans faire n'importe quoi. »

**Rien n'est codé.** Ce document diagnostique sur capture, pose le cadre (ce qui a
déjà été refusé, ce que la machine de Raph permet), répond à la question Blender,
et découpe des lots dont **aucun ne s'ouvre sans un arbitrage explicite** là où il
en faut un. Il complète `PLAN-RENDU-VILLE.md` (la masse), `PLAN-RELIEF.md` (le
terrain, éteint) et `PLAN-SOL-PYRAMIDE.md` (le sol en tuiles, clos).

---

## 0. Le diagnostic, sur capture

Captures de référence (bande 4, ville de démo `1e23`, cadrage centré, zoom 1 et
0,5, `captureFrame({night})`) : `.preview-shots/lum-b4-jour-z1.png`,
`lum-b4-nuit-z1.png`, `lum-b4-jour-z05.png`.

### Ce que la scène a déjà

- **La lumière est cuite dans chaque sprite** : toit clair, face droite sombre,
  direction haut-gauche globalement tenue (habitations, temples, arbres).
- **Une seule ombre portée dans tout le jeu : celle du pont sur l'eau**
  (`isoBridge.js`, `bridgeSilhouette` → silhouette noire du sprite, décalée,
  alpha 0,20). Elle existe parce que sans elle « le pont flottait ».
- **Une couche de lumière de nuit qui respecte la perspective** (`lightLayer.js`) :
  halos de lampes déposés au tri peintre, découpés par ce qui passe devant, blittés
  en additif après le voile. Feux et braseros y déposent aussi.
- **Un voile de nuit « heure bleue »** (`drawIsoNight`, multiply teinté + voile
  sombre + aube/crépuscule chauds).
- **Un champ de hauteur complet, éteint** (`isoTerrain.js`, `TERRAIN.amp = 0`) :
  terrasses en U = T/4, socles sous le bâti, contremarches, ombrage soft-light.

### Ce qui manque, dans l'ordre où l'œil le lit

1. **Aucune ombre portée au sol, nulle part.** Bâtiments, arbres, mâts, murs,
   merveilles : chaque objet est posé sur une dalle **uniformément éclairée**. C'est
   LE signal « il n'y a pas de lumière » — un sprite ombré sur un sol sans ombre se
   lit comme un autocollant. La capture de jour le montre sur 100 % du bâti.
2. **Le sol ne module pas en valeur.** Relief éteint, aucun ombrage : la `__flatProbe`
   donne la campagne à 3 (plat) et la ville à 12-15 (la variance des sprites, pas
   une lumière). Rien à grande échelle.
3. **La nuit, aucune fenêtre n'est allumée.** Le bâti devient un bloc assombri
   uniforme ; seules les lampes vivent. Une ville de nuit sans fenêtres n'a pas
   d'intérieur, donc pas de volume.
4. **L'eau est un aplat saturé** sans rapport de lumière avec le reste ; à zoom 0,5
   le fleuve « brûle » au milieu d'une ville pastel. Noté, **hors périmètre** de ce
   plan (3 refus sur la surface de l'eau, cf. `vagues-fleuve-ressac`) — à rouvrir
   seulement sur demande.
5. **La cohérence de la lumière entre familles de sprites n'a jamais été auditée
   globalement.** PixelLab varie le sens d'une fournée à l'autre (cueilleurs et
   entrepôts sont sortis haut-DROITE, caravanes haut-GAUCHE, même prompt). Des
   familles ont été vérifiées une à une, jamais la planche entière.

**Formulation juste du grief :** ce n'est pas que les sprites sont mal éclairés,
c'est que **la scène n'a pas de modèle de lumière**. Chaque sprite apporte la
sienne ; rien ne les relie entre eux ni au sol.

---

## 1. Le cadre — ce qui ne bouge pas

### Les refus enregistrés (ne pas re-proposer sous une autre forme)

| Refusé | Où c'est écrit |
|---|---|
| Ellipse de contact, socle carré, dalle dans le sprite — **3 refus** (2026-07-07, 2026-08-04, 2026-08-05) | `PLAN-RENDU-VILLE.md` §5, `isoLiveCollect.js` (`noShadow`) |
| Ombre elliptique au pied des mâts (retirée le jour même) | fiche `iso-lamp-depth-painter` |
| Relief rallumé **avec l'habillage des tranches** (lèvre, assise, joints, pied) : c'est la somme qui a cassé (`0d261b3`) | fiche `relief-carte-chantier` |
| Vagues, écume, reflets striés **sur la surface** de l'eau (3 refus) | `vagues-fleuve-ressac`, `pixelart-river-migration` |
| Toute variation de ton **par cellule** (4 refus) ; voile de sol ; « ajouter des éléments » | `PLAN-RENDU-VILLE.md` §5 |
| Brume, oiseaux, arbre-monde, ziggourats | fiches respectives |

### La contrainte technique qui décide de tout

La carte est un **Canvas 2D**, déjà **GPU-bound** au dézoom, et **le Chrome de
Raph rend en LOGICIEL** (accélération désactivée, constaté le 2026-09-14 — c'est
un réglage de son navigateur, pas le code). Conséquence sans appel :

> **Tout éclairage par shader — normal maps, lumière dynamique par pixel, WebGL —
> est hors jeu.** La seule lumière possible est faite de **pixels cuits** (dans
> les sprites, dans les tuiles du sol) et des quelques **passes plein écran déjà
> en place** (multiply du voile, additif de la couche de lumière).

Tout ce qui suit respecte cette borne. C'est aussi ce qui tranche la question
Blender (§2) : Blender produit des pixels cuits, pas de la lumière en jeu.

### La méthode (leçon du relief, 2026-08-24)

Chaque lot avait sa capture, **leur somme n'en a jamais eu** — et c'est la somme
qui a été annulée le soir même. Règle pour ce chantier :

- toute validation se fait sur **une capture de l'état CUMULÉ**, bande 4, **nuit
  ET jour**, tissu dense, zoom de jeu — les conditions du joueur ;
- une maquette **par lot**, molette **éteinte par défaut**, retirable au grep ;
- cadrage verrouillé à chaque série (`CM.centered`, `zoomGoal` ET `cam.zoom`,
  reposés après chaque `captureFrame`) — le piège a mordu 4× ;
- jamais dans la save de Raph (port de dev bac à sable, jamais 5186).

---

## 2. Blender + IA : ce que ça peut et ne peut pas faire ici

Ce que Raph a vu circuler : une **maquette grise (greybox) dans Blender**, rendue
avec ses passes (profondeur, normales, occlusion ambiante, ombres), puis une **IA
guidée par ces passes** (img2img avec contrôle de profondeur/normales) qui habille
la géométrie — d'où des images cohérentes : caméra exacte, lumière unique, ombres
géométriquement justes.

### Ce que ça apporterait à CE projet

- **Des sprites à caméra exacte** (vrai 2:1, `ISO_Y = 0,5`) : plus jamais de
  « bâtiments de face », le défaut qui a fait retirer l'art des 10 genres civiques
  (S12) et qui avait déjà coûté une campagne en juillet (`building-frontview-regen`).
- **Une lumière identique pour toute une série** (soleil fixé dans le fichier
  gabarit) — le problème n° 5 du diagnostic disparaît par construction.
- **Des sous-produits gratuits** : l'ombre portée au sol (passe « shadow catcher »),
  le masque émissif des fenêtres (passe émission), la hauteur — exactement les trois
  choses que les lots 1 et 2 réclament et qu'il faudrait sinon dessiner à la main.

### Ce que ça ne fait PAS

- **Ça n'éclaire pas la scène.** Le rendu du jeu ne sait pas poser une ombre ;
  Blender ne tourne pas dans le navigateur. Régénérer 400 sprites sans toucher au
  moteur donnerait exactement la même dalle uniformément éclairée sous de plus
  beaux sprites. **Le moteur d'abord (lot 1), les assets ensuite (lot 5).**
- Ça ne remplace pas la DA verrouillée (lineless, medium shading, 16-24 teintes,
  palette maître) — il faut la retrouver en sortie, et c'est l'inconnue.

### L'outillage réel, vérifié ce jour

| Pièce | État |
|---|---|
| **Blender** | **non détecté sur ce poste** (ni `Program Files`, ni PATH). Gratuit, scriptable en headless (`blender -b gabarit.blend -P rendu.py`) |
| **Pont IA → pixel art** | **PixelLab `image_to_pixelart`** (mode `faithful`, `init_image_strength` 150-250, sortie ≤ 512 px) — abonnement actif, **4 884 générations restantes ce cycle** |
| **Alternative IA locale** | Stable Diffusion + ControlNet (depth/normal) — c'est le pipeline des images vues ; la machine de Raph a une **RTX 5060 Ti**, donc c'est faisable, mais c'est une installation à part entière |
| **Post-traitement** | déjà là : `scripts/quantize.cjs`, `scripts/remapPalette.mjs`, `scripts/contactSheet.mjs`, `scripts/zoomCheck.mjs` |
| **Volume à couvrir si campagne** | 25 habitations · 328 props/scènes moteur · 52 merveilles · 292 sprites iso (ponts, bateaux, aqueducs, sols, décor) → **~400 à refaire** = la refonte totale de l'art |

### Risques, et le précédent

- Une refonte greybox des bâtiments a **déjà été tentée et entièrement annulée**
  (2026-06-18, `greybox-iso-sandbox`) — cause : cache offscreen non vérifiable + preview
  instable. Ce n'était pas Blender, mais la leçon tient : **ne rien intégrer qu'on ne
  puisse voir en direct**.
- La dérive de DA sur 400 sprites est le risque n° 1 (`building-art-direction-consistency`).
- L'échelle du grain (portes/fenêtres à la même taille, `PLAN-EGALISATION-GRAIN`) se
  règle en amont dans Blender — avantage — mais se casse si le pilote ne fixe pas
  la densité px source / tuile dès le gabarit.

**→ Verdict : oui, mais en PILOTE (lot 5), sur trois sprites, jugé sur planche à
l'échelle du jeu, et jamais avant que le moteur sache poser une ombre.**

---

## 3. Les lots

### Lot 0 — Référence et audit (½ journée, zéro pixel changé)

- Captures de référence jour/nuit aux bandes **1, 4, 7** (faites pour la 4).
- **Audit de direction de lumière** sur planche-contact : `scripts/contactSheet.mjs`
  passé en récursif sur `agents/buildings`, `houses`, `iso`, `wonders` ; Raph valide
  le sens **sur les familles structurées** (toit/mur/porte — les objets symétriques ne
  disent rien) ; flips par `scripts/flipBuildings.mjs` (originaux dans `_orig/`).
  ⚠ Jamais de flip « d'office » : l'œil en contexte est le seul juge (piège des
  caravanes).
- `__flatProbe` : chiffres AVANT, cadrage verrouillé, deux passes qui coïncident.

Livrable : une planche annotée + la liste des sprites à retourner. **C'est le lot
qui rend les suivants mesurables.**

### Lot 1 — L'ombre du soleil (le cœur du chantier) — ⚠ ARBITRAGE RAPH AVANT LE CODE

**Le principe, et en quoi ce n'est pas ce qui a été refusé.** Les trois refus
portaient sur des **marques de contact** : une tache sous l'objet qui dit « il
touche le sol ». L'ombre solaire dit autre chose : « il y a un soleil, en haut à
gauche, et cet objet a une hauteur ». C'est **la silhouette du sprite projetée sur
le plan du sol** — cisaillée vers le bas-droite, aplatie par l'angle du soleil —
et elle est **plus longue pour une halle que pour une hutte** : la hiérarchie de
masse (S12 de `PLAN-RENDU-VILLE`) sans un sprite de plus.

⚠ `PLAN-RENDU-VILLE.md` §5 avait généralisé les trois refus en « toute ombre sous un
bâtiment » et écarté même la silhouette du pont. C'était une lecture, pas une
décision de Raph. **La question lui est posée ici, explicitement : l'ombre solaire
est-elle la même chose que l'ellipse ?** Rien ne se code avant sa réponse.

**Mécanique proposée (v1, vive) :**

- une **silhouette par sprite** (cache offscreen, même recette que
  `bridgeSilhouette`), teinte **bleu-gris froid** (la couleur du ciel, pas du noir
  pur), alpha ≈ 0,25-0,30 ;
- posée par `setTransform(1, 0, kx, -ky, x_pied, y_pied)` : `kx` = cisaillement
  vers la droite, `ky` = aplatissement (0,35-0,5 : soleil haut) — **une vraie
  projection, pas une translation** (la translation du pont marche parce que le
  pont est plat) ;
- dessinée **au tri peintre juste avant son item** (l'ombre tombe sur le sol, jamais
  sur la façade voisine — c'est l'approximation de tous les jeux iso 2D, et elle
  passe parce que le voisin la recouvre) ;
- **générique** : tout item du peintre qui a une image (habitations, scènes moteur,
  merveilles, arbres, mâts, murs, aqueducs) — un seul point d'entrée dans
  `isoLivePaint`, pas un site par famille ;
- **sautée en LOD** (`CM.lodActive`, zoom < 0,55) ; s'efface avec `nightF` (pas de
  soleil la nuit ; les lampes ne projettent rien) ;
- soleil **fixe** (DA figée haut-gauche) : pas d'ombre qui tourne avec l'heure.

**Coût.** Un `drawImage` de plus par item visible (≈ 200 à 400 au zoom 1). Sur le
rendu logiciel de Raph c'est le poste à mesurer en premier (sonde
`scripts/sondeGeste.js`). **v2 si ça pèse :** les bâtiments sont statiques → leur
ombre se **cuit dans les tuiles du sol** (pyramide) à coût par frame nul ; la
signature de tuile doit alors inclure les emprises voisines à portée d'ombre. On
n'y va que si la v1 est mesurée trop lourde.

**Maquette (1 journée) :** molette `__sunShadow({ on, kx, ky, alpha, col })`,
**défaut ÉTEINT**, marqueur `MAQUETTE` dans 2 fichiers. Capture cumulée bande 4
jour + nuit, zoom 1 et 0,75, tissu dense → **Raph tranche**. NON → retrait au grep.

> ### ✔ MAQUETTE MONTÉE le 2026-09-14 — verdict chez Raph
>
> `iso/isoSunShadow.js` (neuf) + 4 points de contact marqués `MAQUETTE` :
> `pixelHouses.js` (habitations), `isoLivePaint.js` (arbres, mâts),
> `engineSceneCache.js` (plan statique des scènes moteur — le chemin direct prop par
> prop reste sans ombre, et le cache ne s'allume que par `__engineSceneCache = true`).
> **Défaut ÉTEINT** ; lint et 993 tests verts ; 0 erreur console.
>
> Ce que la maquette a appris, dans l'ordre :
> 1. **Un voile posé par-dessus (source-over, 0,28) se lit comme de la peinture**, pas
>    comme une ombre — le pavé disparaît dessous. En **multiply** la texture du sol
>    reste et l'ombre devient une ombre. Défauts : `mode 'multiply'`, `col #8e96ad`
>    (facteur 0,55-0,68, froid), `alpha 0,75`.
> 2. **kx = ky.** Le premier réglage (0,7 / 0,36) faisait une traînée horizontale ; le
>    soleil écran haut-gauche projette sur la diagonale (1, 1), démontré dans l'en-tête
>    du module. 0,45 = ombre aux deux tiers de la hauteur.
> 3. ⚠ **Vérifier la géométrie à la SONDE, pas à l'œil sur la ville** : en tissu dense,
>    l'ombre d'un bâtiment atterrit à côté du bâtiment DEVANT lui, et l'œil l'attribue
>    au mauvais — j'ai cru la direction fausse. Une boîte 40×80 posée à (100, 60) donne
>    x 101-174, y 140-175 : exact. Recette : `__sunShadow({ alpha: 1, col: '#ff00ff' })`
>    pour VOIR où l'ombre tombe.
> 4. Le cisaillement est ancré sur la rangée du bas de la boîte, pas sur le losange
>    d'emprise : le pied du mur ouest dérive de `kx·hh` (7 px à z 1). Assumé maquette.
>
> Captures : `.preview-shots/sun-b4-z1-jour-{AVANT,APRES}.png`, `sun-b4-z1-nuit-APRES`,
> `sun-b4-z075-jour-APRES`, zooms `sun-zoom-AB.png` / `sun-zoom-AB2.png`.

### Lot 2 — Les fenêtres s'allument la nuit (code léger + art)

- **Un masque émissif par sprite** (`<nom>-emit.png`, même taille, pixels des
  fenêtres, portes, braseros). Rendu : après le voile, le sprite de JOUR est reblitté
  **à travers son masque**, teinté chaud, **déposé dans `lightLayer`** → occultation
  par les façades devant gratuite, même ordre que les lampes. Aucun scintillement
  (le bruit est refusé partout).
- **Une fraction seulement** d'habitations allumées (hash de cellule, ~60 %), sinon
  sapin de Noël. Allumées quand `nightF > 0,3`.
- **Art, par ordre d'impact :** les **25 habitations** d'abord (848 sprites sur 849
  à la bande 4 : c'est l'image), puis les ~30 scènes moteur, puis les merveilles.
  Source : **à la main dans Aseprite** (une couche par sprite, ~1 h pour les 25
  maisons — Raph a déjà le flux), OU sous-produit du pilote Blender (lot 5), OU
  PixelLab `edit_image` « same building at night, windows glowing » + différence
  (le moins fiable : ça redessine). Recommandation : la main pour les maisons.
- Maquette d'abord sur **3 masques** (hut, stonehouse, tenement) → capture nuit
  cumulée avec le lot 1 éteint ET allumé.

### Lot 3 — Le relief : une DÉCISION, pas du code

Le terrain existe, validé en prod le matin du 2026-08-24 (« fluide, rendu top »)
puis éteint le soir sur la somme accentuation + habillage. **Zéro code neuf** : la
molette `__terrain({...})` suffit à rejouer chaque option ; ce lot est une série de
captures cumulées (nuit, bande 4, en ville — la capture qui a tué le chantier).

| Option | Réglage | Ce qu'on regarde |
|---|---|---|
| **A — le matin validé** | `valley 8, hills 9, hillCut 0.52, cityK 0.45`, **tranches NUES** (sans lèvre/assise/joints/pied) | la ville de nuit à la bande 4 : les marches sont-elles des murs ? |
| **B — ville plate, campagne modelée** | idem mais `cityK 0` | plus aucune marche en ville ; le relief vit dans le coteau et la bande sauvage — répond au « tout est plat » là où il coûte le moins |
| **C — rester plat** | `amp 0` | l'état actuel |

⚠ **Juger A/B AVEC le lot 1 allumé** si Raph l'a accepté : soft-light du terrain et
ombres solaires assombrissent tous les deux — c'est précisément le genre de somme
qui a cassé la dernière fois. Et **ne pas rallumer par défaut sans son mot** (décision
`0d261b3`).

### Lot 4 — Cohérence des matières sous une lumière unique (petit, après 0)

- Retours (flips) issus de l'audit du lot 0.
- Les quelques sprites dont la face éclairée contredit le soleil une fois les ombres
  posées (le lot 1 les rendra visibles : une ombre bas-droite sous une face droite
  claire saute aux yeux) → régénération ciblée, ou pilote Blender.

### Lot 5 — Pilote Blender → IA → pixel art (art, en parallèle, sans toucher au jeu)

**Une seule question :** trois sprites régénérés par greybox Blender + IA sont-ils
**(a)** dans la DA, **(b)** mieux posés (vrai 2:1, lumière exacte, aucune façade de
face), **(c)** livrés avec leurs sous-produits (masque d'ombre, masque émissif) —
au point de justifier une campagne ?

**Pilote :** `hut`, `stonehouse`, `tenement` (48×60 et 56×100 aujourd'hui) — trois
échelles, la famille la plus répétée.

**Pipeline :**

1. **Installer Blender** (poste de Raph). Fichier gabarit `.blend` : caméra
   orthographique, rotation X 60° / Z 45° (= dimétrique 2:1, cohérent avec
   `ISO_X = 1, ISO_Y = 0,5`), **échelle fixée** : 1 tuile monde = un losange de 64×32
   px à zoom 1 (`TILE = 32`) — à convertir dans la densité de la famille
   (`PLAN-EGALISATION-GRAIN` : maisons ×1,135 à z 1) ; **soleil directionnel
   haut-gauche figé** dans le fichier ; sol « shadow catcher » ; passes : couleur plate
   (clay), profondeur, normales, AO, ombre seule, émission.
2. **IA :** PixelLab `image_to_pixelart` (`faithful`, force 150-250, sortie à la
   taille cible) sur le rendu couleur ; si trop libre, SD + ControlNet local (RTX
   5060 Ti) avec les passes profondeur/normales en contrôle.
3. **Post :** `quantize.cjs` / `remapPalette.mjs` (16-24 teintes), masque d'ombre et
   masque émissif exportés tels quels depuis les passes Blender.
4. **Jugement :** planche-contact **à l'échelle du jeu** (pas des vignettes), les 3
   nouveaux à côté des 3 actuels, jour et nuit, zoom 1 et 0,5. **Raph tranche.**

**Critères d'acceptation avant toute campagne :** DA tenue (lineless, medium
shading, plafond de teintes), densité px/tuile identique à la famille, lumière
haut-gauche mesurable, aucune façade frontale, silhouette lisible à zoom 0,5.

**Ce que ce lot ne décide pas :** la campagne (~400 sprites). C'est une refonte
totale de l'art ; elle se décide sur le pilote, pas sur ce plan.

> ### ✔ PILOTE MONTÉ le 2026-09-14 — Blender 5.2.1 installé par Raph, chaîne opérationnelle
>
> Décision préalable de Raph le même jour : **l'ombre solaire est acceptée telle
> quelle** → les sprites sortent **sans ombre cuite**, le moteur la pose.
>
> Fichiers : `blender/pilot_houses.py` (scène, caméra, soleil, 3 maisons paramétriques,
> rendu headless), `blender/contact.cjs` (recadrage sur l'encre + planche-contact ×4).
> Commande : `blender -b -P blender/pilot_houses.py -- --out <abs>/blender/out [--scale 4]`.
> Sorties : `blender/out/{hut,stonehouse,tenement}.png`, `.crop.png`, `.q16.png`,
> `contact.png`, `contact-stonehouse.png` (5 versions), `blender/out4x/` (source HD).
>
> **Route A (Blender seul) — ce qui est acquis :** projection 2:1 exacte, tailles
> exactes (50×52 vs 48×60, 56×98 vs 56×100, 38×38 vs 44×44), lumière haut-gauche
> exacte (toit clair / mur gauche moyen / mur droit sombre), fond transparent, 9 à
> 14 teintes après quantification, grain procédural (tuiles, pierre, briques,
> chaume) en coordonnées objet. Reproductible au pixel près, un réglage se propage
> à toute la série.
> **Ce qui manque, et c'est le verdict à l'œil :** posé à côté du sprite actuel, le
> rendu lit comme un **jouet propre** — pas de colombages, de végétation, de rehauts
> placés à la main, de lucarnes. Combler l'écart = modéliser ce détail (1 à 2 h par
> famille, une fois), pas un réglage.
>
> **Route B (IA) — testée, pas concluante en l'état :** PixelLab `image_to_pixelart`
> sur le rendu 50×52 (`faithful` 200 et libre 120) : rend un **fond OPAQUE** (alpha
> perdu), mange les fenêtres à cette taille, ajoute une texture de toit et des
> fenêtres allumées plaisantes mais hors contrôle. Inutilisable tel quel ; la voie
> propre serait SD + ControlNet local à 4×, non testée.
>
> **Pièges relevés :**
> 1. ⚠ Blender **trame** la sortie 8 bits par défaut (`dither_intensity` 1) : un
>    aplat sortait à 48 teintes et la quantification en faisait du BRUIT. Mettre 0.
> 2. ⚠ Un `--out` relatif est résolu par Blender depuis SA racine : les PNG sont
>    partis dans `C:\blender\out` (nettoyé). Toujours un chemin absolu.
> 3. ⚠ Le MCP PixelLab n'accepte que du base64 inline, et recopier 5 Ko de base64
>    à la main échoue (« broken data stream »). Recette qui marche : PNG **indexé**
>    (PLTE + tRNS, ~750 octets pour 50×52 à 15 teintes → 992 caractères), puis
>    VÉRIFIER la copie par un heredoc + comparaison octet à octet avant l'envoi.
> 4. Le convertisseur PixelLab ne préserve pas l'alpha du PNG source.
>
> ### ✔ v2 « meilleur rendu » de la maison de pierre (2026-09-15, sur « ça fait cheap »)
>
> Raph : « ça fait vraiment cheapos, tu penses que c'est améliorable ? » → une
> itération bornée sur `stonehouse` seule. Ce qui a comblé l'écart, par ordre d'effet :
> 1. **La charpente modélisée** (≈ 40 boîtes) : soubassement, rez en pierre, étage à
>    colombages en encorbellement (sablières + poteaux en saillie), toit à débord,
>    lucarne, faîtage, cheminée à chapeau, porte cintrée avec marche, fenêtres
>    encadrées, deux buissons. C'est le poste qui fait tout — le grain procédural
>    seul ne suffisait pas.
> 2. **Le ton de base = le ton MOYEN du sprite actuel**, pas son ton sombre : la rampe
>    à 3 tons descend déjà de 0,55 à l'ombre (ardoise 31,58,68 → 58,92,104).
> 3. **Passe d'identité des matières** (`<nom>.ids.png`, R = index·8, + `.ids.json`) →
>    `blender/polish.cjs` : liseré ×0,6 sur la silhouette bas/droite, rehaut ×1,15
>    haut/gauche, ombre d'avant-toit ×0,72, arêtes internes ×0,88. ⚠ Le premier
>    dosage (arêtes ×0,72 partout) noyait le bâtiment dans la boue.
> Résultat : `blender/out/contact-stonehouse-v2.png` — 15 teintes quantifié, 17 poli ;
> lit comme la MÊME famille que le sprite actuel. Restes : la lucarne (boîte pâle),
> quelques pixels verts égarés par la quantification sur le toit (median-cut :
> feuillage et ardoise se croisent — remap sur la palette maître à préférer).
> Coût réel de cette itération : ~1 h pour un bâtiment, réutilisable comme gabarit.
>
> ### ✔ v3 « charpente » (2026-09-15, Raph : « un effort sur la charpente et les fenêtres »)
>
> Trois helpers nouveaux dans `pilot_houses.py` : `beam` (poutre/dalle inclinée de p0 à
> p1, saillie le long d'une normale), `roof_slab` (un pan de toit = une dalle inclinée),
> `window` (cadre + vitrage + meneau + traverse + appui, sur mur ±x ou ±y). La maison :
> **pans de toit séparés → pignon APPARENT côté +x** (enduit + entrait, poinçon,
> arbalétriers, contrefiches, fenêtre de comble), chevrons sous l'égout, abouts de
> pannes, croix de Saint-André dans la travée centrale des deux faces, 5 fenêtres à
> croisillons avec appui, porte à barre, cheminée à chapeau et souche, lucarne à
> faîte perpendiculaire. 56×59 px, 19 teintes quantifié.
> ⚠ Pièges : (1) le toit-prisme (`gable_x`) peint le pignon EN ARDOISE — il faut deux
> dalles et un pignon enduit dessous ; (2) une lucarne dont les pans regardent ±y
> (parallèles au pan principal) s'écrase en boîte : son faîte est PERPENDICULAIRE à
> l'égout, pans vers ±x ; (3) le débord de toit élargit la boîte, et le jeu met à
> l'échelle sur la LARGEUR (`houseScaleK` sur `bb.w`) → débord réduit (0,22 → 0,16) ;
> (4) sous bash, un heredoc de ~100 lignes mêlant JS et Python a cassé le parseur —
> écrire le bloc dans un fichier (Write) puis le greffer par un `node -e` court.
> Reste faible à cette taille : la lucarne (≈ 6 px, se fond dans le toit).

---

## 4. Ordre et budget

```
Lot 0 (½ j)  →  Lot 1 maquette (1 j)  →  ARBITRAGE RAPH  →  Lot 1 v1 (1-2 j)
                                                          →  Lot 2 (1 j code + art)
                                                          →  Lot 3 (½ j de captures, décision)
Lot 5 pilote : en parallèle dès que Blender est installé (1-2 j), n'entre dans le
jeu qu'après le lot 1.
```

**Pourquoi cet ordre :** le lot 1 est le seul qui crée un *modèle de lumière* dans
la scène ; sans lui, ni les fenêtres ni les nouveaux sprites n'ont de sol sur lequel
exister. Le relief (lot 3) se juge après, parce que son ombrage se cumule avec les
ombres. Le pilote Blender est indépendant et peut avancer pendant les arbitrages.

---

## 5. Écarté d'emblée (ne pas re-proposer)

- **Normal maps / éclairage dynamique / WebGL** : rendu logiciel chez Raph, carte
  déjà GPU-bound, Canvas 2D. Non.
- **Toute marque de contact** (ellipse, socle, flaque, dalle) sous quoi que ce soit.
- **Jitter par cellule, voile de sol, ajout d'éléments** (§5 de `PLAN-RENDU-VILLE`).
- **Rallumer le relief avec l'habillage des tranches.**
- **Une campagne d'art de 400 sprites décidée sans pilote.**
- **Ombres qui tournent avec l'heure** : la DA fixe le soleil ; une ombre mobile
  contredirait les faces cuites dans les sprites.
- **Toucher à la surface de l'eau** dans ce chantier.

---

## 6. Pièges connus qui s'appliquent ici

- `captureFrame({ night })` — jamais une pose manuelle de `nightF` avant l'appel
  (jour et nuit sortaient octet-près identiques).
- `CM.zoomGoal` est l'autorité sur le zoom ; poser `zoomGoal` ET `cam.zoom`, reposer
  après chaque capture ; `CM.centered = true`, `CM.camGoal = null`.
- Une sonde qui compare deux états verrouille **tout** le cadrage (échelle ET position).
- Pane du navigateur **frontée** pour `__demoCity` / `__cityRecompute` (timers étranglés
  sinon) ; le handle console est `window.__CM`.
- Port de dev **bac à sable** (jamais 5186 = la save de Raph) ; ne jamais écrire
  `state.population` sur son poste sans relever la valeur.
- Une empreinte de canvas n'est pas comparable à travers un rechargement (le
  jour/nuit suit l'horloge murale).
- Backticks dans un message de commit sous bash = substitution → heredoc quoté.
- Le lint (`no-undef`) fait l'inventaire d'un renommage mieux qu'une lecture.
