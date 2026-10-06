/**
 * FAUX NAVIGATEUR DES HARNAIS DE LA RACINE (bench-*, simulate-ce, sim-10-profils).
 * ---------------------------------------------------------------------------
 * Le moteur du jeu attend un DOM minimal dès l'import : cloudSave.js s'abonne
 * à `pagehide` sur window, des modules lisent localStorage ou navigator, d'autres
 * créent des éléments. Chaque harnais en tenait sa copie, et les copies avaient
 * divergé — c'est un `window` sans addEventListener qui a fait planter quatre
 * harnais dès l'import pendant deux mois et demi (audit 2026-10-05, SCRIPT-1 ;
 * mise en commun : SCRIPT-11). C'est l'union des anciennes copies.
 *
 * À importer EN PREMIER, en import STATIQUE, avant les `await import()` du jeu :
 *   import "./scripts/lib/headless.mjs";
 */
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
Object.defineProperty(globalThis, "navigator", {
  value: { clipboard: { writeText() {} } }, writable: true, configurable: true
});
const stubEl = () => ({
  className: "", dataset: {}, innerHTML: "", returnValue: "0", textContent: "",
  disabled: false, value: "", checked: false, style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {}, removeEventListener() {}, setAttribute() {}, showModal() {},
  remove() {}, click() {}, appendChild() {}, querySelector() { return stubEl(); },
  querySelectorAll() { return []; }
});
globalThis.document = {
  addEventListener() {}, removeEventListener() {}, documentElement: { style: { setProperty() {} } },
  body: { appendChild() {} }, querySelector() { return stubEl(); },
  querySelectorAll() { return []; }, createElement() { return stubEl(); },
  getElementById() { return stubEl(); }
};
globalThis.Audio = class { constructor() { this.volume = 1; } addEventListener() {} play() { return Promise.resolve(); } pause() {} };
globalThis.render = () => {};
globalThis.save = () => {};
