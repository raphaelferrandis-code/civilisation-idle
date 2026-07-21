// Clé localStorage de LA sauvegarde. Module minuscule et SANS dépendance :
// cloudSave.js doit la connaître AVANT que state.js ne s'évalue (state = load()
// court à l'import de state.js) — l'importer depuis state.js déclencherait
// justement ce chargement trop tôt. state.js la ré-exporte pour ses clients.
// ⚠ Ne JAMAIS bumper cette clé (ça effacerait tous les saves) : la version du
// schéma vit DANS le payload (state.saveVersion), cf. le commentaire de state.js.
export const SAVE_KEY = "civilization-collapse-idle-v1";

// Version de schéma que CE build comprend. Vit ici (pas dans state.js) pour que
// cloudSave.js puisse la lire sans importer state.js — ce qui déclencherait le
// chargement de la save trop tôt. state.js la ré-exporte ; l'historique des
// versions est documenté à côté de cette ré-export.
export const CURRENT_SAVE_VERSION = 4;
