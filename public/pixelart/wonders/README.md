# Merveilles — rework pixel-art

Source de vérité : `CM_WONDERS` dans `src/game/map/layout.js` (~l.129).
Rendu actuel (procédural, à remplacer) : `drawWonder` dans `src/game/map/renderBuildings.js` (~l.443).

Chaque merveille a **5 paliers** (rang I → V). Le sprite doit grandir à chaque
palier et être **très grand au palier V**. Évolutions + animations conservées.
Lumière en HAUT-GAUCHE → ombres en BAS-DROITE (règle globale de la carte).

## RÈGLE DE PROJECTION (2026-07-03, précisée par Raphaël : VUE DE DESSUS)
La carte regarde vers le BAS ; les monuments doivent être VUS DE DESSUS,
comme des bâtiments de jeu de stratégie — pas des portraits frontaux.
1. **JAMAIS de contre-plongée** : verticales strictement parallèles, aucun
   dessous de corniche/attique visible, pas de point de fuite vers le haut.
2. **Vue de dessus 3/4 (type RTS)** : les surfaces horizontales HAUTES
   dominent — dessus d'attique, cour intérieure d'un anneau, dos des statues.
   PixelLab : view **"low top-down"** + « seen from above, three-quarter
   top-down view like a classic strategy game building, the flat top clearly
   visible ». (Un simple « seen from slightly above » en view "side" ne
   suffit PAS — ça reste un portrait frontal.)
3. **Ancrage au sol** : le moteur dessine une OMBRE DE CONTACT elliptique sous
   chaque merveille pixel-art (même convention que les arbres, décalée
   bas-droite) — c'est la seule exception à « aucun habillage procédural ».
   ⚠ retirer les ombres au sol BAKED des tirages (doublon), et les décors
   (herbe/dallage) hors de l'emprise.
4. Les ouvertures traversantes (arches, cour intérieure d'anneau) restent
   TRANSPARENTES : voir le sol de la carte à travers renforce l'intégration.
   ⚠ strip-bg ne vide pas les zones encloses — flood dédié nécessaire ; et
   gare aux sols intérieurs quasi couleur-fond (le couloir de l'Arc t5 a dû
   être repeint après strip).
Exceptions assumées (validées) : le Mausolée, la Colonne et la Couronne-t5
« posée » restent des silhouettes frontales/objets — leurs formes (masse,
fût, couronne) lisent bien sans contre-plongée. En cas de doute : low top-down.

| # | id | Nom | Icône | Débloquée par | Paliers (seuils métrique) | Réapparaît à l'ère |
|---|----|-----|-------|----------------|---------------------------|--------------------|
| 1 | `dynasty1` | Le Mausolée du Fondateur | mausoleum | Première dynastie fondée | 1 / 50 / 200 / 400 / 750 dynasties (rééchelonné 2026-07-02, sim ~540-634 dyn/partie) | 2 |
| 2 | `pop1m` | La Colonne du Million | column | Population ≥ 1 000 000 | 1e6 / 1e13 / 1e20 / 1e27 / 1e34 habitants (rééchelonné 2026-07-02 : +7 ordres de grandeur par rang, rang V ≈ ère 33-34) | 6 |
| 3 | `era_kingdom` | La Couronne de Pierre | crown | Âge du royaume atteint | ères 19 / 22 / 25 / 29 / 33 — Royaume / Conquérant / Empire / Métropole / Machination (rééchelonné 2026-07-03 : « Royaume » = ère 19 depuis la refonte des ères) | 9 |
| 4 | `era_empire` | L'Arc de Triomphe Éternel | arch | 500 achats accomplis | 500 / 5 000 / 50 000 / 500 000 / 5 000 000 achats (rééchelonné 2026-07-03, ×10/rang : un achat ×100 compte 100 et Héphaïstos auto-achète — les anciens seuils tombaient avant GR1) | 13 |
| 5 | `era_mega` | L'Aiguille Céleste | needle | 30 min de veille | 30 min / 3 h / 12 h / 48 h / 168 h de veille ACTIVE (rééchelonné 2026-07-03 : rang IV ≈ GR1 accompli, rang V = une semaine de veille ; playTimeSec = temps actif à vie, pas d'offline) | 17 |
| 6 | `era_singularity` | L'Œil de la Singularité | eye | Premier mythe accompli | 1 / 4 / 7 / 10 / 14 mythes (rééchelonné 2026-07-03 : 14 mythes au total, rang V = TOUS accomplis dont Ragnarök le terminal ; mythsCompleted survit aux GR) — **bâtiment VOLANT** | 21 |

Convention de nommage des fichiers ici :
`<id>-t<palier>.png` (ex. `dynasty1-t3.png`), frames d'animation en
`<id>-t<palier>-f<n>.png` ou spritesheet selon le cas.

Suivi du rework (une ligne par merveille, cocher quand validée) :

- [ ] 1. Le Mausolée du Fondateur (`dynasty1`) — concept « Nécropole des Fondateurs » (accrétion :
      chaque rang englobe le précédent, tumulus originel visible au cœur du rang V).
      5 sprites générés 2026-07-02 (`dynasty1-t1..t5.png`, 112→400 px), fond gris PixelLab
      retiré par flood-fill quand présent. Designs VALIDÉS par Raphaël ; t2/t4 refaits en
      composition FRONTALE (règle : toutes les merveilles de face).
      FLAMMES ANIMÉES FAITES (2026-07-02) : `flame-small.png` (9 fr. 16×24) +
      `flame-large.png` (9 fr. 32×53), bandes ROGNÉES au contenu opaque (trim-strip.cjs —
      le PixelLab brut avait ~50% de marge transparente), palette recalée or, ping-pong
      (0→8→0) ; `dynasty1-flames.json` = 85 ancres curées à la main (t1:2, t2:1, t3:3,
      t4:50, t5:29 — portails lumineux, visage doré et marches d'escalier EXCLUS).
      Overlay NETTEMENT plus grand que la flamme cuite : taille = JSON×1.7+2 (porte ×1.15),
      blit (x - dw/2, y - dh + 1), déphasage par flamme. Les pixels cuits non garantis
      couverts sur les 9 frames ont été passés en BRAISES dans les sprites
      (emberize-uncovered.cjs, 220 px) — test de couverture exhaustif : scratch/test-coverage.cjs
      = 0 px non couvert. Vérifié en jeu rangs I/IV/V.
      INTÉGRÉ dans drawWonder (renderBuildings.js, manifeste WONDER_PX_IDS, PPT=34 px/tuile,
      repli procédural tant que le sprite n'est pas chargé) — vérifié en jeu rangs I & V.
      RÈGLE : aucun habillage procédural autour d'une merveille pixel-art (pas d'esplanade,
      aura, ombre, torches, bannière…) — le sprite est tout le monument. Couronne t5 =
      1 grande flamme centrale + 2 petites latérales (29 flammes).
- [x] 2. La Colonne du Million (`pop1m`) — concept « Colonne Innombrable » (accrétion
      VERTICALE, recensement de pierre : marbre crème + or + bronze→or + bannières pourpres,
      l'anti-mausolée). 5 sprites générés 2026-07-02 (`pop1m-t1..t5.png`, 96×144 → 176×400,
      la plus HAUTE silhouette du jeu). Fonds retirés (t5 = fond DÉGRADÉ →
      scripts/wonders/strip-bg-gradient.cjs, estimation par ligne). Designs VALIDÉS.
      ANIMÉE & INTÉGRÉE (2026-07-03) : flamme hélicoïdale du t5 (`pop1m-flame-spiral.png`,
      8 fr., boucle FORWARD — un ping-pong inverserait le sens de vrille) + torche t4 et
      tissus (2 gonfalons t2, 5 bannières t5) en mode **PATCH** : frames générées par
      PixelLab DEPUIS le crop du sprite (custom start frame) et re-blittées pixel-pour-pixel
      (`pop1m-torch/t2cloth/b1..b5.png`). t2/t4 : éléments cuits effacés des sprites
      (erase-baked-pop1m.cjs) car crops à fond transparent. `pop1m-flames.json` porte les
      options par asset (mode/loop/anchor/sc/ms). Ajoutée à WONDER_PX_IDS. Vérifiée en jeu
      rangs II/IV/V (rotation, flambée, flottements OK, patchs sans couture).
- [x] 3. La Couronne de Pierre (`era_kingdom`) — concept « Cercle du Serment » (accrétion
      RADIALE, la géologie devient orfèvrerie : cromlech brut → anneau taillé à fleurons →
      forteresse-couronne à gemmes → couronne d'or sur muraille → COURONNE PURE colossale,
      choix de Raphaël vs variante « couronne-forteresse à porte »). 5 sprites générés
      2026-07-03 (`era_kingdom-t1..t5.png`, 128×88 → 400×256, la seule merveille plus LARGE
      que haute). Seuils rééchelonnés ères 19/22/25/29/33 (« Royaume » = ère 19 depuis la
      refonte des ères ; les anciens seuils [9..25] tombaient au Bourg agricole).
      Post-traitement : strip-bg (t5 fond uni), region-growing avec garde-fous couleur
      (t4 diadème-forteresse, choisi par Raphaël, ciel/nuages/herbe bakés), nettoyage
      (herbe/dallage/silhouette humaine effacés, portes re-remplies en dégradé sombre —
      l'intérieur PixelLab sort blanc/gris opaque ou transparent selon le tirage).
      ANIMÉE (2026-07-03) : SCINTILLEMENT DES GEMMES — `gem-glint.png` dessiné en code
      (16 fr. 9×9 dont 12 vides → éclat épisodique, point→croix→étoile→croix→point),
      ancres curées à la main (t3:7, t4:6, t5:9), nouvel `anchor:"center"`, déphasage
      par gemme (`era_kingdom-flames.json`). Intégrée à WONDER_PX_IDS, vérifiée en jeu
      rangs I-V + éclats confirmés aux 3 rangs gemmés. ⚠ piège dev : recharger la page
      si le JSON est créé après le chargement (le 404 est mis en cache).
- [x] 4. L'Arc de Triomphe Éternel (`era_empire`) — concept « Porte des Œuvres » (le seul
      monument PERCÉ : on voit la carte à travers les arches ; le rang V dit « Éternel »
      par la mise en abyme). Seuils ×10 rééchelonnés 2026-07-03 (500 → 5 M, cf. table).
      Évolution : porte simple → arc à attique (inscription) → triple arc → colossal à
      quadrige doré + bannières pourpres → Arc Éternel (enfilade d'arcs vers la lumière).
      t1-t4 générés/nettoyés/installés + vérifiés en jeu 2026-07-03.
      ANIMÉ (2026-07-03) : bannières pourpres du t4 en patch custom-start
      (`arc-ban-g/d.png`, fond mur opaque, zéro effacement) + glints or quadrige (t4) et
      chevaux du fronton (t5, gem-glint partagé) + **lueur du fond de l'enfilade qui
      RESPIRE** (`arc-glow.png` dessiné en code, ping-pong lent, anchor center — v2
      chaude/large, la v1 blanche était invisible sur le corridor déjà blanc).
      t5 : PROVISOIRE (candidat « enfilade ») — 4 candidats dans `arc-t5-candidats/`
      pour RETRAVAIL ASEPRITE par Raphaël ; après remplacement d'era_empire-t5.png,
      recaler les ancres t5 du JSON (glow + chevaux). Retouche possible : inscription
      gibberish du t2.
- [x] 5. L'Aiguille Céleste (`era_mega`) — concept « La Tour du Veilleur » (la merveille la
      plus MÉTA : elle honore le joueur-veilleur, pas la cité). Évolution : Vigie de bois à
      brasero → Tour des Heures (cadran solaire, cloche) → Observatoire (dôme de bronze,
      lunette) → Flèche des Astres (horloge astronomique, or) → **Aiguille Céleste** (flèche
      de cristal et d'or, la plus fine silhouette du jeu). 5 sprites générés 2026-07-03 en
      view "low top-down" (64×112 → 192×400), fonds/ombres bakées/socle glacé nettoyés.
      Seuils rééchelonnés playTimeSec : 30 min / 3 h / 12 h / 48 h / 168 h (veille ACTIVE, pas
      d'offline ; rang IV ≈ GR1, rang V = 1 semaine). ANIMÉ : brasero du t1 (patch
      custom-start), glints instruments t3 + horloge t4, fanal PULSANT (arc-glow) t4/t5, et
      la SIGNATURE rang V : **le rayon de phare qui TOURNE et balaie la cité** (needle-beam.png
      dessiné en code, 16 fr. cône rotatif, loop forward, blend additif — c'est la 1re anim à
      grande échelle spatiale du jeu). ⚠ pour un overlay PLEINE FRAME (pas une petite ancre),
      mettre f.w/f.h = taille de la frame dans le JSON, sinon il est écrasé à la taille de
      l'ancre. Intégrée à WONDER_PX_IDS, vérifiée en jeu rangs I-V (rayon confirmé rotatif).
- [x] 6. L'Œil de la Singularité (`era_singularity`) — concept « L'Œil qui veille » (la seule
      merveille VOLANTE : elle lévite au-dessus de sa case et projette une ombre portée AU SOL,
      l'écart Œil↔ombre PROUVE le vol — ici l'ombre SERT le design, exception assumée à « plus
      d'ombres sous les merveilles »). Évolution : orbe de bronze à lentille cyan → sphère à iris
      d'émeraude + 2 satellites → œil radiant à halo d'or → Œil-titan à pupille-fente rayonnante
      et vrilles d'or qui coulent → **machine astronomique cosmique** (obsidienne + or, iris
      solaire dans des anneaux concentriques). 5 sprites générés 2026-07-04 en view "low top-down"
      (80×80 → 288×288), fonds gris des t4/t5 retirés au flood-fill. Seuils rééchelonnés
      mythsCompleted : 1 / 4 / 7 / 10 / 14 mythes (à vie, survit aux GR ; rang V = TOUS accomplis
      dont Ragnarök). Option A validée par Raphaël (vol AVEC ombre portée). RENDU VOLANT dans
      drawWonder : lévitation `hoverH = H*0.34 + bob·s`, bob sinusoïdal, ombre elliptique au sol
      qui rétrécit quand l'Œil monte. ANIMÉ : **iris qui RESPIRE** (`eye-pulse-cyan.png` t1-t4 /
      `eye-pulse-gold.png` t5, halo radial dessiné en code 16 fr., blend additif) + **anneaux
      gyroscopiques qui TOURNENT** autour de l'Œil (`eye-gyro.png` 24 fr. 96×96, loop forward,
      blend additif, dimensionnés ~1.23× le disque pour orbiter HORS du cadre — t3/t4/t5) +
      glints or sur les satellites/vrilles (t2/t4/t5). Intégrée à WONDER_PX_IDS, vérifiée en jeu
      rangs I-V via `__showWonder` (vol + bob + ombre + pulse + rotation confirmés).
      ⚠ pour l'aperçu : ne PAS appeler `__cityRecompute` juste avant `__showWonder` (le layout
      régénéré fait racer la caméra) ; éditer un `-flames.json` déclenche un full reload (plugin
      Vite carte) → recliquer « Cité » pour re-monter le canvas + helpers. **DERNIÈRE des 6 —
      rework pixel-art des merveilles COMPLET.**
