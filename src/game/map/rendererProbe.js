// MOTEUR DE RENDU DU NAVIGATEUR (audit du 2026-10-05, PERF-4).
//
// Le palier « Auto » (qualityMode.js) ne regarde que les cœurs, la densité de
// l'écran et le pointeur : un PC à 16 cœurs dont le pilote graphique est en liste
// noire — ou dont l'accélération est coupée, comme le Chrome de Raph — reçoit
// « Élevée » alors que tout est peint par le processeur. Ce module sait le DIRE :
// les Options affichent le moteur détecté, pour que le joueur comprenne ses
// saccades et choisisse un palier en connaissance de cause.
//
// ⚠ Il ne CHOISIT rien. Faire descendre « Auto » d'office en rendu logiciel
// changerait le rendu chez Raph : décision à prendre avec lui (rapport d'audit,
// « Décisions à trancher », PERF-3/PERF-4).
//
// Sondé UNE fois, à la demande (ouverture des Options), sur un contexte WebGL
// jetable aussitôt rendu (WEBGL_lose_context) : les navigateurs plafonnent le
// nombre de contextes vivants. Module-FEUILLE (aucun import).
const SOFTWARE_RE = /SwiftShader|Basic Render|WARP|llvmpipe|softpipe|Software/i;

// Nom de moteur → rendu logiciel ? (WARP = « Microsoft Basic Render Driver ».)
export function isSoftwareRenderer(name) {
  return SOFTWARE_RE.test(String(name || ""));
}

let probed = null;

// { name, webgl, software } — name : chaîne du pilote (UNMASKED_RENDERER_WEBGL si
// le navigateur la donne, sinon RENDERER), ou null sans WebGL.
export function probeRenderer() {
  if (probed) return probed;
  probed = { name: null, webgl: false, software: false };
  try {
    if (typeof document === "undefined") return probed;
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return probed;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "");
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    probed = { name: name || null, webgl: true, software: isSoftwareRenderer(name) };
  } catch { /* sonde refusée : on n'affiche rien de plus */ }
  return probed;
}
