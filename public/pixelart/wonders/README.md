# Merveilles — rework pixel-art

Source de vérité : `CM_WONDERS` dans `src/game/map/layout.js` (~l.129).
Rendu actuel (procédural, à remplacer) : `drawWonder` dans `src/game/map/renderBuildings.js` (~l.443).

Chaque merveille a **5 paliers** (rang I → V). Le sprite doit grandir à chaque
palier et être **très grand au palier V**. Évolutions + animations conservées.
Lumière en HAUT-GAUCHE → ombres en BAS-DROITE (règle globale de la carte).

| # | id | Nom | Icône | Débloquée par | Paliers (seuils métrique) | Réapparaît à l'ère |
|---|----|-----|-------|----------------|---------------------------|--------------------|
| 1 | `dynasty1` | Le Mausolée du Fondateur | mausoleum | Première dynastie fondée | 1 / 50 / 200 / 400 / 750 dynasties (rééchelonné 2026-07-02, sim ~540-634 dyn/partie) | 2 |
| 2 | `pop1m` | La Colonne du Million | column | Population ≥ 1 000 000 | 1e6 / 1e13 / 1e20 / 1e27 / 1e34 habitants (rééchelonné 2026-07-02 : +7 ordres de grandeur par rang, rang V ≈ ère 33-34) | 6 |
| 3 | `era_kingdom` | La Couronne de Pierre | crown | Âge du royaume atteint | ères 9 / 13 / 17 / 21 / 25 | 9 |
| 4 | `era_empire` | L'Arc de Triomphe Éternel | arch | 500 achats accomplis | 500 / 2 500 / 10 000 / 15 000 / 20 000 achats | 13 |
| 5 | `era_mega` | L'Aiguille Céleste | needle | 30 min de veille | 30 min / 2 h / 8 h / 24 h / 72 h de jeu | 17 |
| 6 | `era_singularity` | L'Œil de la Singularité | eye | Premier mythe accompli | 1 / 3 / 5 / 8 / 12 mythes | 21 |

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
- [ ] 2. La Colonne du Million (`pop1m`) — concept « Colonne Innombrable » (accrétion
      VERTICALE, recensement de pierre : marbre crème + or + bronze→or + bannières pourpres,
      l'anti-mausolée). 5 sprites générés 2026-07-02 (`pop1m-t1..t5.png`, 96×144 → 176×400,
      la plus HAUTE silhouette du jeu). Fonds retirés (t5 = fond DÉGRADÉ →
      scratch/strip-bg-gradient.cjs, estimation par ligne). EN ATTENTE DE VALIDATION.
      Reste : bannières animées (flottement) + phare doré pulsant (t4-t5) en overlay
      + ajout au manifeste WONDER_PX_IDS de drawWonder.
- [ ] 3. La Couronne de Pierre (`era_kingdom`)
- [ ] 4. L'Arc de Triomphe Éternel (`era_empire`)
- [ ] 5. L'Aiguille Céleste (`era_mega`)
- [ ] 6. L'Œil de la Singularité (`era_singularity`)
