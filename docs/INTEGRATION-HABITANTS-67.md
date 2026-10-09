# Intégration des 67 habitants — 7 octobre 2026

Raphaël a demandé l’installation dans le jeu après la revue des 28 retouches. Les **268 bandes de marche des 67 habitants** sont installées dans `public/pixelart/agents/inhabitants`, puis reprises dans la compilation `dist`.

Les sources correspondent aux versions présentées dans l’[index des comparatifs](../art/habitants/index.html) : les dernières corrections de continuité, dont les retouches ciblées, et les versions médiévales précédemment retenues. Le moteur détecte déjà les six ou huit poses à partir des dimensions des PNG ; aucune modification du rendu n’a été nécessaire.

Les **modèles réduits validés sont conservés** et restent utilisés aux petits zooms. Les nouvelles bandes pleines sont visibles en marche au zoom rapproché et dans les portraits. Les animations d’attente, d’assise et de salut restent celles du jeu. Les 40 personnages de la Maison des Plaisirs ne sont pas concernés.

## Vérifications

- 268 PNG installés identiques aux fichiers préparés, par SHA-256.
- 268 PNG de la compilation identiques en pixels RGBA malgré la recompression sans perte.
- 1 928 autres PNG du dossier des habitants conservés par empreinte, notamment tous les réduits.
- 88 tests passent dans six suites : bandes diagonales, requêtes cardinales, portraits et fiches des habitants, sprites des scènes et échelle.
- `npm run build` réussi ; service worker de la compilation daté `a29f259ec7c5`.

L’intégration est locale au projet et à sa compilation. Aucun déploiement en ligne ni création d’un nouvel installateur Windows.

[Rapport et inventaire des fichiers](../art/habitants/integration-2026-10-07/installation.json) · [Anciens PNG sauvegardés](../art/habitants/integration-2026-10-07/avant) · [Fiche de suivi](SUIVI-HABITANTS-ASEPRITE.md).
