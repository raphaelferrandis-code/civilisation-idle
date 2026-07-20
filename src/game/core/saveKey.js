// Clé localStorage de LA sauvegarde. Module minuscule et SANS dépendance :
// cloudSave.js doit la connaître AVANT que state.js ne s'évalue (state = load()
// court à l'import de state.js) — l'importer depuis state.js déclencherait
// justement ce chargement trop tôt. state.js la ré-exporte pour ses clients.
// ⚠ Ne JAMAIS bumper cette clé (ça effacerait tous les saves) : la version du
// schéma vit DANS le payload (state.saveVersion), cf. le commentaire de state.js.
export const SAVE_KEY = "civilization-collapse-idle-v1";
