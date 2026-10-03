# Les musiques du jeu

Dépose ici un fichier audio : il devient un morceau du jeu, sans rien toucher au code.
On le choisit sur la **scène de la Maison des Plaisirs** (◀ titre ▶) et dans
**Options › Son › Morceau**.

- **Formats** : `.mp3` (marche partout, téléphones compris), `.ogg`, `.m4a`, `.wav`, `.opus`.
- **Ordre** : celui des noms de fichier. Numérote-les : `01 - …`, `02 - …`.
  Le premier est la musique par défaut.
- **Titre affiché** : le nom du fichier sans son numéro ni son extension.
  `02 - La taverne du port.mp3` s'affiche « La taverne du port ».
- **Renommer** un morceau fait revenir au premier les joueurs qui l'avaient choisi.
- **Crédits** : pense à ajouter l'auteur dans Options › Crédits
  (`src/components/dialogs/OptionsDialog.jsx`, section « Musique »).

## Le dossier `scene/`

Les petites mélodies jouées quand on clique sur la scène. Tant qu'il est vide, c'est
la mélodie du jeu, jouée par l'instrument de l'âge (`src/game/audio/melodieScene.js`).
S'il y en a plusieurs, elles passent chacune à leur tour. Garde-les courtes
(quelques secondes) : la musique de fond s'efface le temps de les jouer.

En développement, un fichier ajouté recharge la page tout seul. Pour le jeu publié,
il faut refaire le build (`npm run build`).
