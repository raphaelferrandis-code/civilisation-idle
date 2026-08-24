# NOTE — Le sol en pyramide de tuiles (refonte DIFFÉRÉE, sur déclencheur)

2026-08-24. Le chantier anti-clignotement (5 lots, `d461654`→`0f3f527`) est clos et
**confirmé bon par Raph en build de production**. La stratégie de cache du sol
(`iso/isoGroundBake.js`) est complexe — un bake vivant + photos par cran +
compensations, ~8 branches, 3 horloges, 2 budgets prédictifs — mais **stable,
documentée et mesurée**. On n'y touche plus sans raison.

⚠ Rappel de mesure : tout jugement de fluidité se fait en **PROD** (`npm run
build` + `npm run preview`, ou l'exe re-packagé). Le mode dev (React dev,
non-minifié, harnais actifs) est 2-3× plus lent — c'est lui qui a fait croire à
une régression le 2026-08-24.

## Déclencheurs — n'ouvrir la refonte QUE si l'un d'eux se présente

1. Un nouveau grief visuel du sol qui résiste à un fix local simple.
2. Un chantier qui exige l'**invalidation partielle** (relief dans le sol,
   cartes bien plus grandes, minimap vivante…).
3. `isoGroundBake.js` doit encore grossir en états/branches pour un besoin neuf.

Sinon : ce fichier dort ici, et c'est très bien.

## L'architecture cible (l'état de l'art des cartes : Leaflet/TheoTown)

- **Tuiles fixes** (~256 px device), par **niveau** = les crans de la grille de
  zoom existante (`ZOOM_QUANT`, 1/8). Clé de tuile : niveau + (tx, ty) +
  saison/ère/plage/relief (les fragments actuels de `keySuf`).
- **LRU global en Mo** (pas en nombre) partagé entre niveaux.
- La frame : pour chaque tuile visible → la dessiner si prête, sinon **sa
  parente étirée** (fallback pyramidal), et la pousser en file de cuisson.
  Jamais de vide, jamais d'aplat, **par construction**. Le pan ne compense
  rien, le zoom n'invente rien.
- **File de cuisson budgetée** par frame (~8 ms, la valeur éprouvée), priorité :
  tuiles visibles → pourtour → parents/plancher.
- **Invalidation PAR TUILE** : au recompute de layout, marquer sales uniquement
  les tuiles dont les cellules ont changé (dirty-grid dérivée du diff de
  `roadSet`/`urbanSet`/… — l'équivalent spatial de `groundContentSig`). C'est
  LE gain structurel : une partie en croissance ne recuit plus l'écran entier.
- **`drawIsoGround` est réutilisé tel quel** : il sait déjà cuire une zone
  arbitraire (`ISO_GROUND_SLICE` le prouve). La refonte remplace la stratégie
  de cache, pas le peintre.
- Le vif (bâtiments, agents, eau, quais) est **hors périmètre** — inchangé.

## Invariants MESURÉS à transposer (ne pas les redécouvrir)

- La carte est **GPU-bound au nombre de blits** (fiche perf 2026-07) : dessiner
  les tuiles visibles = ~20-40 drawImage/frame, c'est le but ; jamais de
  `clip()` complexe par tuile (leçon de l'eau : 18 ms de GPU).
- **Pacing vsync** : tolérance d'une demi-vsync sur tout throttle (le 41 fps
  boiteux est pire qu'un 30 régulier).
- **Softs de décodage coalescés** (fenêtre ~250 ms) → invalidation douce par
  tuile touchée, pas de recuisson en rafale.
- **Saison/ère dans la clé** ; le tirage de teinte par tuile doit rester ancré
  MONDE (coordonnées de cellule), pas tuile — sinon les coutures réapparaissent.
- **Budget prédictif ∝ aire** pour estimer le coût d'une tuile à un niveau
  jamais mesuré (la loi 1/zoom² éprouvée).
- **Jamais de purge totale** : LRU seul (leçon du lot 4).
- **Capture déterministe** : un chemin synchrone qui cuit tout (CM.capture).

## Pièges spécifiques aux tuiles (à traiter dès le lot 1 de la refonte)

- **Gutter** : les passes débordent (franges d'herbe mordantes, joints, props)
  → cuire chaque tuile avec ~1 cellule de marge et clipper au blit, sinon
  coutures. C'est le piège n° 1 de tout moteur à tuiles.
- **Phase des motifs** : patterns (herbe, trame urbaine) ancrés monde — un
  pattern ancré tuile « saute » à chaque frontière.
- **Upload GPU** : étaler les tuiles fraîches (1-2 par frame max en geste) —
  les gaps de 100-150 ms post-recuisson venaient des gros uploads.
- Estimation honnête : **3-5 jours**, avec le banc de preuve existant
  (forceFrame+toDataURL, signatures par frame, A/B par molette).

Voir la fiche mémoire `carte-clignotements-geste` pour l'historique complet du
chantier qui a mené ici (diagnostic, 5 lots, preuves).
