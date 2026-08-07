// RÉGIME DE POINTAGE (P4) — « doigt » ou « curseur », publié sur <html> sous
// `data-pointer`, et rien d'autre. Toute la coquille tactile (barre d'onglets
// basse, pages plein écran, cibles élargies) s'y accroche.
//
// ⚠ POURQUOI UN ATTRIBUT ET PAS DES @media DANS CHAQUE FEUILLE :
//   1. la règle tient à UN endroit. Éparpillée en `@media (pointer: coarse)`
//      dans six feuilles, elle se corrige six fois — et on en oublie ;
//   2. elle devient FORÇABLE, donc TESTABLE. Sans `?touch=1`, vérifier la
//      disposition mobile demanderait un vrai téléphone à chaque itération.
//
// ⚠⚠ LA CONDITION EST `(pointer: coarse)` SEUL. Ne PAS y remettre
// `and (hover: none)` : mesuré le 2026-07-28 sur le téléphone de Raph, la
// conjonction ne matchait pas — plusieurs navigateurs mobiles annoncent
// `hover: hover` (héritage, stylet, mode « site pour ordinateur »). Le pointeur
// grossier est le signal fiable ; `hover: none` ne sert que de filet pour un
// appareil purement tactile qui n'annoncerait pas `coarse`. Un portable à écran
// tactile garde un pointeur FIN en primaire, donc il reste au régime curseur —
// c'est exactement ce qu'on veut : il a un vrai curseur et de la place.

const FORCE_KEY = "civ-force-touch";
const QUERY = "(pointer: coarse)";

// `?touch=1` force le doigt, `?touch=0` force le curseur, et les deux se
// mémorisent : sur un téléphone on ne retape pas une URL à chaque essai.
// Toute autre valeur (ou rien) laisse l'appareil décider.
function forced() {
  try {
    const p = new URLSearchParams(window.location.search).get("touch");
    if (p === "1" || p === "0") {
      localStorage.setItem(FORCE_KEY, p);
      return p === "1";
    }
    if (p === "auto") {
      localStorage.removeItem(FORCE_KEY);
      return null;
    }
    const saved = localStorage.getItem(FORCE_KEY);
    return saved === "1" ? true : saved === "0" ? false : null;
  } catch {
    return null;
  }
}

function detect() {
  const f = forced();
  if (f !== null) return f;
  try {
    if (window.matchMedia(QUERY).matches) return true;
    // Filet : appareil sans survol possible ET qui compte des points de contact.
    return (navigator.maxTouchPoints || 0) > 0 && window.matchMedia("(hover: none)").matches;
  } catch {
    return false;
  }
}

export function applyPointerMode() {
  if (typeof document === "undefined") return "fine";
  const mode = detect() ? "coarse" : "fine";
  document.documentElement.dataset.pointer = mode;
  return mode;
}

/**
 * Le même verdict, à la demande, pour le JS qui doit décider AVANT le CSS —
 * typiquement l'état par défaut d'un encart, qui n'est pas une question de style
 * mais de disposition (au bureau la boutique est un meuble permanent, au doigt
 * c'est une feuille qui recouvre la ville).
 *
 * ⚠ On relit `detect()` plutôt que `dataset.pointer` : l'attribut est posé par
 * `watchPointerMode()` au démarrage, et un composant qui se monte avant lui
 * lirait une chaîne vide — c'est-à-dire « bureau » — sur un téléphone. Un défaut
 * qui dépend de l'ordre de montage est un défaut qui se trompera un jour.
 */
export function isCoarsePointer() {
  if (typeof window === "undefined") return false;
  return detect();
}

/**
 * Pose l'attribut et le tient à jour. Le régime change en cours de route plus
 * souvent qu'on ne croit : tablette qu'on pose sur son clavier, souris
 * branchée en Bluetooth, fenêtre déplacée sur un autre écran.
 */
export function watchPointerMode() {
  if (typeof window === "undefined") return () => {};
  applyPointerMode();
  let mq;
  try { mq = window.matchMedia(QUERY); } catch { return () => {}; }
  const onChange = () => applyPointerMode();
  // `addEventListener` sur MediaQueryList n'existe pas partout (Safari < 14) :
  // on retombe sur l'ancien `addListener` plutôt que de ne rien écouter.
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }
  if (typeof mq.addListener === "function") {
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }
  return () => {};
}
