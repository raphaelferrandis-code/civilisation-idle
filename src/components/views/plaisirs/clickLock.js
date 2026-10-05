// LE VERROU ANTI DOUBLE-CLIC DES TABLES (BUG-46, audit du 2026-10-05). Au vingt-et-un,
// la main se résout DANS le clic, et React 19 applique tout de suite la mise à jour
// d'un événement discret : au 2e clic d'un double-clic, le menu de la phase suivante
// est déjà sous le curseur (« Même mise » sous « Tirer », « Doubler » de la main
// suivante d'une refente…) et part sans qu'on l'ait voulu — une mise débitée.
// UN verrou horodaté pour TOUS les boutons d'une table : une action, puis plus rien
// pendant `ms`. `arm()` le repose sans agir (un menu qui vient d'apparaître).
// 350 ms : au-delà d'un double-clic ordinaire, en deçà de deux clics délibérés.
export const CLICK_LOCK_MS = 350;

export function createClickLock(ms = CLICK_LOCK_MS, now = () => performance.now()) {
  let until = 0;
  return {
    arm() { until = now() + ms; },
    // Appelle `fn` si la table n'est pas verrouillée (et la verrouille) ; sinon rien.
    act(fn) {
      const t = now();
      if (t < until) return undefined;
      until = t + ms;
      return fn();
    }
  };
}
