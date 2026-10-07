# Les sons enregistrés du paysage sonore

Ce dossier est **écrit par `scripts/importSons.mjs`**, pas à la main. Voir
`docs/PLAN-AMBIANCE-SONORE.md` § 7.

1. Raph télécharge les enregistrements (jamais une session Claude : Windows Defender) et les
   dépose dans `/assets/sons/<source>/`, à la racine du dépôt. Ce dossier n'est pas versionné.
2. `scripts/sons/catalogue.json` dit, pour chaque son du jeu, de quel fichier il vient, où le
   couper, et son gain.
3. `node scripts/importSons.mjs` écrit ici un `.ogg` par son : mono, 32 kHz, crête à −1 dBFS.

**Le nom fait la famille.** `oiseau-merle-1.ogg` est un son de la famille `oiseau`. Le jeu les
lit tous par le dossier (`src/game/audio/paysage/enregistrements.js`), sans une ligne de code.
Les familles connues sont dans `SEMES` (`src/game/audio/paysage/paysage.js`) : `oiseau`,
`coucou`, `pic`, `chouette`, `grenouille`, `corneille`, `alouette`.

**Crédits.** Chaque source livrée prend sa ligne dans `CREDITS.md`, et son crédit en français
et en anglais dans Options › Crédits.
