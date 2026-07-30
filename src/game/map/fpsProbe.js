// SONDE DE FLUIDITÉ (P3) — un compteur d'images minuscule, posé sur la carte.
//
// Pourquoi elle existe : le GO/NO-GO tactile se joue sur une machine que le
// poste de dev n'a pas. Sur un téléphone on n'ouvre pas d'outils de
// développement et on ne tape pas dans une console : il fallait un chiffre
// LISIBLE À L'ÉCRAN, obtenu en tapant une URL une seule fois.
//
// ⚠ Elle mesure la cadence RÉELLEMENT SERVIE par l'appareil (rythme des
// requestAnimationFrame), pas le compteur interne de la carte. C'est
// volontaire : un compteur interne peut annoncer 60 pendant que l'écran saccade
// (vécu le 2026-07-27, le throttle boitait en 1-2-1-2). Ici on lit ce que
// l'appareil délivre vraiment, plus le palier de qualité choisi et la
// résolution de rendu — les trois chiffres qui décident.
//
// ⚠ Éteinte par défaut, donc ZÉRO coût quand on ne la demande pas : sans le
// drapeau, la fonction sort avant d'avoir créé quoi que ce soit.

const FLAG_KEY = "civ-fps-probe";

// Trois façons de l'allumer, de la plus pratique à la plus technique :
//   · l'URL  ?fps=1   → la seule utilisable au doigt sur un téléphone ;
//   · localStorage    → survit aux rechargements (posé par l'URL) ;
//   · window.__fps    → depuis une console, pour le poste de dev.
// `?fps=0` l'éteint et efface la mémoire — sinon on ne pourrait plus s'en
// débarrasser sans vider le stockage à la main.
function probeWanted() {
  try {
    const p = new URLSearchParams(window.location.search).get("fps");
    if (p === "1") { localStorage.setItem(FLAG_KEY, "1"); return true; }
    if (p === "0") { localStorage.removeItem(FLAG_KEY); return false; }
    if (window.__fps === true) return true;
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return window.__fps === true;
  }
}

/**
 * Monte la sonde si elle est demandée. `signal` est l'AbortController de la
 * carte : la sonde meurt avec elle, sans écouteur ni boucle orpheline.
 * @param {{ signal?: AbortSignal, quality?: () => object }} opts
 * @returns {boolean} true si la sonde a été montée.
 */
export function mountFpsProbe({ signal, quality } = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (!probeWanted()) return false;
  if (document.getElementById("civ-fps-probe")) return true;   // déjà montée

  const el = document.createElement("div");
  el.id = "civ-fps-probe";
  el.setAttribute("aria-hidden", "true");   // outil de mesure, pas de contenu de jeu
  el.style.cssText = [
    // ⚠ EN BAS À GAUCHE, et pas en haut à droite comme au premier jet : la barre
    // de ressources fait maintenant 42px sur téléphone, la sonde la recouvrait
    // entièrement et rendait les captures de Raph illisibles — on ne juge pas une
    // mise en page à travers son instrument de mesure. En bas à gauche elle se
    // pose sur la carte, la seule surface qu'on peut masquer sans rien perdre.
    // ⚠ AU-DESSUS de la barre d'onglets, pas dessus. Posée à 4px du bord bas,
    // elle recouvrait 52px de la barre de navigation (mesuré) : Raph ne voyait
    // plus ses onglets « Cité / Régulation / Effondrement ». `--touch-nav-total`
    // vaut 0 hors régime tactile, donc le bureau garde le coin bas gauche.
    "position:fixed", "left:4px",
    "bottom:calc(4px + var(--touch-nav-total, env(safe-area-inset-bottom, 0px)))",
    "z-index:99999", "padding:3px 6px", "border-radius:4px",
    "background:rgba(0,0,0,.72)", "color:#9fe0a2",
    "font:600 11px/1.3 ui-monospace,Consolas,monospace",
    "white-space:pre", "pointer-events:none",
    "opacity:.85",
  ].join(";");
  document.body.appendChild(el);

  // Réponse courte d'une media query, pour la ligne de diagnostic.
  const sig = (q) => {
    try { return window.matchMedia(q).matches ? "oui" : "non"; } catch { return "?"; }
  };

  let frames = 0;
  let last = performance.now();
  let raf = 0;
  let pire = Infinity;        // le pire palier d'une demi-seconde, celui qui se sent

  const tick = (now) => {
    frames += 1;
    const dt = now - last;
    if (dt >= 500) {
      const fps = Math.round((frames * 1000) / dt);
      if (fps < pire) pire = fps;
      const q = (() => { try { return quality ? quality() : null; } catch { return null; } })();
      el.textContent = [
        `${fps} fps   (min ${pire === Infinity ? "-" : pire})`,
        q ? `qualité dpr≤${q.dpr} · ${q.fps}fps · LOD ${q.lodZoom}` : "qualité ?",
        // Les ENTRÉES de la détection, pas seulement son verdict : sans elles,
        // un palier inattendu se discute au lieu de se constater (vécu le
        // 2026-07-28 — le téléphone repartait en « élevé » et il a fallu deviner
        // lequel des trois signaux mentait).
        `coarse:${sig("(pointer: coarse)")} hover-none:${sig("(hover: none)")} touch:${(navigator.maxTouchPoints || 0)} cœurs:${navigator.hardwareConcurrency || "?"}`,
        `écran ${window.innerWidth}×${window.innerHeight} @${(window.devicePixelRatio || 1).toFixed(1)}`,
      ].join("\n");
      el.style.color = fps >= 50 ? "#9fe0a2" : fps >= 30 ? "#e8c66e" : "#e06a55";
      frames = 0;
      last = now;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const stop = () => {
    cancelAnimationFrame(raf);
    el.remove();
  };
  if (signal) signal.addEventListener("abort", stop, { once: true });
  return true;
}
