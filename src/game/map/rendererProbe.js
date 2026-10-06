// MOTEUR DE RENDU DU NAVIGATEUR (audit du 2026-10-05, PERF-4).
//
// Le palier « Auto » (qualityMode.js) ne regardait que les cœurs, la densité de
// l'écran et le pointeur : un PC à 16 cœurs dont le pilote graphique est en liste
// noire — ou dont l'accélération est coupée, comme le Chrome de Raph — recevait
// « Élevée » alors que tout est peint par le processeur. Ce module sait le DIRE :
// les Options affichent le moteur détecté, pour que le joueur comprenne ses
// saccades et choisisse un palier en connaissance de cause.
//
// Et depuis la décision de Raph du 2026-10-05 (PERF-4 = b), « Auto » s'en sert
// pour CHOISIR : rendu logiciel ou WebGL absent → « Équilibrée sans effets »
// (qualityMode.js). Le même signal règle la sève de l'arbre des Ruines (PERF-40,
// RuinsTreePixel.jsx) et, par le palier, l'occultation des lumières (PERF-2).
//
// Sondé UNE fois (au premier palier résolu en « Auto », ou à l'ouverture des
// Options), sur un contexte WebGL jetable aussitôt rendu (WEBGL_lose_context) :
// les navigateurs plafonnent le nombre de contextes vivants. Le résultat est
// gardé pour la session : le palier ne bascule jamais en cours de partie.
// Module-FEUILLE (aucun import).
const SOFTWARE_RE = /SwiftShader|Basic Render|WARP|llvmpipe|softpipe|Software/i;

// Nom de moteur → rendu logiciel ? (WARP = « Microsoft Basic Render Driver ».)
export function isSoftwareRenderer(name) {
  return SOFTWARE_RE.test(String(name || ""));
}

let probed = null;

// { name, webgl, software } — name : chaîne du pilote (UNMASKED_RENDERER_WEBGL si
// le navigateur la donne, sinon RENDERER), ou null sans WebGL.
// Hors navigateur (Node, tests) : rien à sonder, et rien n'est gardé.
export function probeRenderer() {
  if (probed) return probed;
  if (typeof document === "undefined") return { name: null, webgl: false, software: false };
  probed = { name: null, webgl: false, software: false };
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return probed;
    // WebGL est là : une lecture du nom refusée ensuite ne le fait pas passer pour absent.
    probed = { name: null, webgl: true, software: false };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "");
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    probed = { name: name || null, webgl: true, software: isSoftwareRenderer(name) };
  } catch { /* sonde refusée : on n'affiche rien de plus */ }
  return probed;
}

// Le navigateur dessine-t-il SANS carte graphique ? Rendu logiciel reconnu à son
// nom, ou WebGL absent (pilote en liste noire, accélération coupée sans repli
// logiciel) : le canvas 2D de la carte est alors peint par le processeur.
// Hors navigateur : non (rien à sonder).
export function slowRenderer() {
  if (typeof document === "undefined") return false;
  const r = probeRenderer();
  return r.software || !r.webgl;
}
