# docs/ — où en est chaque plan

Classement du 2026-10-06 (audit du 05/10, GIT-7). Un plan « clos » n'est pas périmé :
le code cite la plupart d'entre eux par leur chemin pour les décisions et les pièges
qu'ils gardent. On ne les déplace donc pas ; seul ce qu'aucun code ne cite va dans
`archive/`. À mettre à jour quand un chantier s'ouvre ou se ferme.

## Actifs : chantier ouvert ou suite attendue

- `PLAN-AMBIANCE-SONORE.md` : le paysage sonore de la carte (nappes par milieu, ponctuels, rumeur lointaine au dézoom), avec les recherches sur les sources gratuites, payantes et l'IA. Lots 1 à 4 livrés (le moteur ; la nature ; la ville, des voix vraies rendues sans langue ; les métiers : le port, les feux, les ateliers, les bêtes) ; lot 5 (le temps) en cours.
- `PLAN-ECOUTER-PARLER.md` : écouter les habitants, puis leur répondre par des signes et des mots ; ce qu'ils savent du joueur suit la Chronique. Questions tranchées par Raph ; lot 1 (écouter, les pensées) en cours.
- `PLAN-VEGETATION.md` : l'herbe et les arbres. Lot 0 fait (planche), la suite attend le choix de Raph.
- `PLAN-QOL-SUITE.md` : confort de jeu. Fait foi sur `AMELIORATIONS-VISUELLES-QOL.md` ; il reste des fiches.
- `PLAN-RENDU-VILLE.md` : « brouillon et pas net ». Le code non bloqué est épuisé ; S2, S8 et S9 attendent un arbitrage, S13 et S14 une campagne d'art.
- `PLAN-CHUTE.md` : la chute sur la carte, en jeu. Restent arasés les 81 monuments cosmiques des âges 7 à 9 (≈ 440 générations PixelLab, après la remise à zéro du 30/10).
- `PERF-CARTE-REPRISE.md` : perf de la carte, outillage, mesures, pistes ouvertes (PERF-1 à PERF-4).
- `STEAM-PUBLICATION.md` : déclarations Steam, à relire et compléter au moment de publier.
- `ui-references.md` : assets d'interface intégrés et leur provenance. Référence vivante, à tenir à jour à chaque ajout.
- `APRES-LA-SORTIE.md` : les chantiers de structure renvoyés après la sortie.
- `audits/audit-2026-10-05-RAPPORT.md` et `audits/audit-2026-10-05-trouvailles.json` : l'audit du 05/10 et sa correction. Ces deux fichiers ne sont pas versionnés : ils restent sur le poste de Raph.

## Clos ou livrés pour l'essentiel, de référence (cités par le code)

Le journal en fin de chaque plan dit ce qui a été livré ; un tableau de lots resté à
« à faire » en tête de fichier peut dater d'avant ce journal.

- Carte, sol, rendu : `PLAN-SUPPRESSION-LEGACY.md` (un seul peintre depuis le 2026-08-23), `CARTO-drawIsoGround.md`, `PLAN-SOL-PYRAMIDE.md` et `NOTE-SOL-PYRAMIDE.md` (sol en tuiles), `REPRISE-TRACE-VECTORIEL.md`, `PLAN-GRILLE-PIXELS.md` (lot G0 fait), `PLAN-EGALISATION-GRAIN.md`, `PLAN-ECHELLE.md`, `PLAN-TISSU-URBAIN.md`, `PLAN-MAQUETTE-VIVANTE.md`.
- `PLAN-RELIEF.md` : relief ÉTEINT par décision de Raph (2026-08-24). Ne pas relancer ; la suite du sujet est `PLAN-ETAGES.md`.
- Ville et décor : `PLAN-ILOTS.md` (ville par îlots), `PLAN-ROUTES.md`, `PLAN-RUE.md`, `PLACES-ISO-COMPOSEES.md`, `PLAN-TERROIR.md`, `PLAN-ETAGES.md` (métro, autoroute, téléphérique, ciel).
- Eau et ouvrages : `PLAN-PONTS.md`, `PLAN-PORTS.md`, `PLAN-BATEAUX.md`, `PLAN-MERVEILLES.md`.
- La vie de la carte : `PLAN-VIVANT.md`, `PLAN-COMPORTEMENTS.md`, `PLAN-FAITS-DIVERS.md`.
- Maison des Plaisirs : `PLAN-MAISON-DES-PLAISIRS.md` (la section ⭐ du 2026-10-02 fait foi), `PLAN-NUIT-DES-PLAISIRS.md`, `PLAN-GAINS-CASINO.md`.
- Méta-progression : `REFONTE-ARBRE-RUINES.md`, `REFONTE-MYTHES.md`.
- Interface : `AUDIT-BOUTONS-IDENTITE.md`, `AUDIT-ICONES-RAVEN.md` (étudié, pas adopté), `AMELIORATIONS-VISUELLES-QOL.md` (dossier d'origine du confort de jeu, corrigé par `PLAN-QOL-SUITE.md`).

## Autres dossiers

- `bench/` : les rapports versionnés des bancs d'équilibrage (`bench-*.js` à la racine y écrivent). Régénérer avec le banc, pas à la main.
- `concepts/` : planches et recherches d'art (augures, icônes, boutons, panneau, merveilles).
- `archive/` : passations et audits de juin à août, notes périmées. Aucun code ne les cite, ou leurs renvois pointent vers `docs/archive/`. Historique seulement : n'y rien suivre comme consigne.
  `REPRISE-*.md` (7 passations), `AUDIT-2026-07-21.md`, `RETRI-2026-07-27.md`, `REVUE-FRAICHE-2026-07-27.md`, `CAMPAGNE-NETTOYAGE-2026-07-27.md`, `Revue-de-code-CE-0.4.md`, `audit-2026-07-*.md` (5 fichiers), `CE-analyse-equilibrage.md`, `ANIMATION_INDEX.md`, `ATLAS-EFFONDREMENT.md`, `WIKI-PATTERN-OPTI.md`, `CARTO-drawIsoLive.md`, `CARTO-drawIsoWorldInner.md`, `PLAN-MOBILE.md` (le téléphone n'est pas une cible), `reprise-infra-pixel.md`, `REFONTE-MYTHES-annexe-idees.md` (les 130 pistes brutes de la refonte des Mythes).

À la racine du dépôt ne restent que `README.md`, `ARCHITECTURE.md`, `CREDITS.md`, et deux
documents que le code cite : `CE-spec-idle-crises.md` (spécification du hors-ligne et des
crises) et `analyse-mythe-hephaistos.md`.
