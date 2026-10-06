# Campagne de nettoyage — 27 juillet 2026 (soir)

Suite directe de la revue complète du même jour (`RETRI-2026-07-27.md` +
`REVUE-FRAICHE-2026-07-27.md`). Objectif fixé par Raph : « code propre, sans
code mort, sans double appel, sans problème ». Résultat : **6 commits**, tests
1002/1002 verts et lint propre après chaque lot, build OK.

| Commit | Lot |
|---|---|
| `b0a32f7` | **Les 12 MAJEUR** — saveSlots ×2, trio clepsydre/hors-ligne, fenêtre du Phénix, key des scènes du temple (M3), flush pagehide (M4), cible de Rupture vraie (M19), M22 + « Mouvement : Aucune », Reliquaire/Infrastructure |
| `2c006fe` | **Purge du code mort** — −292 lignes : exports/fonctions/branches morts, docs périmées, scripts, exclusions du .exe |
| `b8238da` | **Équité du temple + affichages** — EV du quitte-ou-double, Faveur entière, jalon GR VII, recorders, mise de blackjack restaurée, Olympe/compte à rebours/Anatomie/aperçu boutique/« ×inf » |
| `dd594b1` | **Hors-ligne propre** — gazette et Cadmos gardés en sim, tronc silencieux, rapport de reprise jamais perdu, saveSoon() sur les cadrans |
| `d72e7ac` | **Accessibilité + dialogues** — odomètre, aria-live pérennes, clavier, tablist, Silkscreen hors prose, replis mobiles, fenêtre blanche du .exe expliquée |
| `e64f8ad` | **Fenêtres de bonus au retour d'absence** — crédit linéaire scindé aux bornes |

## Écartées EN CONNAISSANCE DE CAUSE (ne pas re-signaler tel quel)

1. **Deux onglets navigateur** (state.js) — le canal de distribution est le
   .exe, protégé par `requestSingleInstanceLock` ; risque résiduel navigateur
   accepté.
2. **Sonde synchrone D:→Z: du preload** — la refonte async doit se tester sur
   un poste avec Google Drive et lecteurs réseau réels ; à traiter AVEC le test
   du nuage sur deux postes (jamais fait, cf. REPRISE pt 3).
3. **« Un seul jeu actif » au niveau moteur** (templeGames) — verrou
   d'architecture sans exploit démontré (chaque jeu a ses gardes moteur).
4. **Canaux d'effet de ruines sans effectType déclaré** (pressure/cost/crisis)
   — points d'extension DOCUMENTÉS par le code (« le canal survit ») ; 3 ont
   été câblés depuis l'audit ; la puce « ruines +N% » attend un contenu futur.
5. **Plafond de crans du quitte-ou-double côté moteur** — la garde principale
   (mise sur la table) est posée au moteur ; le plafond de l'Échelle reste UI.
6. **useCountUp / duration instable** — latent, consommateurs actuels stables.
7. **migrerEnee sans socle d'Infrastructure** — VOULU : la migration abandonne
   les bâtiments (or/savoir intacts) ; lui donner de l'infra la contredirait.
8. **Verdicts d'audit corrigés** : `WING_BASCULE_LEVEL`,
   `GRAVEUR_BASCULE_LEVEL` et `ownedRuinTreePurchaseCount` ne sont PAS morts —
   ils vivent dans les harnais RACINE (bench-temple.js, sim-10-profils.js,
   simulate-ce.js) que les grep limités à src/ rataient.

## Reste à faire — une séance dédiée PROFILEUR + BOUCLE VISUELLE

Leçon de la REPRISE : ne jamais livrer un changement de rendu sans l'avoir
regardé, ne jamais « corriger » de la perf sans mesure. Tout ce qui suit touche
le rendu/runtime carte et attend cette séance (`__cityShot`, profileur GPU) :

- RETRI G : véhicule gelé hors-réseau, spawn d'émeute (filter par émeutier),
  `captureFrame({citizens:'none'})` qui vide la flotte, boucles rAF concurrentes
  de forceFrame, cull des grandes emprises iso (:5043).
- RETRI H : **recuisson `soft` caméra immobile sans throttle (candidat n°1)**,
  conteurs stade 0 (garde `||`), ruban du fleuve reprojeté, gradients par
  frame, `vehicleLaneOffset` ×2.
- REVUE : vent qui saute en pluie forcée, lumière fantôme de `__lightOcclusion`,
  palier météo de foule à la capture, zoom `__showWonder` vs caméra A9,
  `captureVestige` (layout complet ×500) en sim hors-ligne.
- Et la **sortie de version** : `package.json` 0.0.0, icône Electron par défaut,
  sauvegarde nuage à éprouver pour de vrai sur deux postes.
