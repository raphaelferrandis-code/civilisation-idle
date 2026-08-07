import { useCallback, useEffect, useRef } from 'react';

/**
 * BALAYAGE VERS LE BAS POUR FERMER UNE FEUILLE (M4).
 *
 * Sur téléphone, les deux surfaces qui recouvrent la ville — construction et
 * Régulation — ne se fermaient qu'au bouton. C'est jouable, mais c'est le seul
 * geste du lot qu'un joueur ne pense PAS à chercher : sur mobile, « je pousse la
 * feuille vers le bas » est acquis depuis dix ans. Le bouton reste, il ne s'agit
 * pas de le remplacer (le plan le dit : balayage ET bouton visible).
 *
 * ⚠ LE GESTE NE S'ARME QUE SUR LA POIGNÉE, pas sur la feuille entière, et c'est
 * la décision structurante de ce fichier. Une feuille contient une LISTE qui
 * défile ; armer le glissement sur tout son corps met deux gestes verticaux en
 * concurrence sur la même surface, et c'est toujours le mauvais qui gagne — on
 * ferme la boutique en voulant faire défiler les bâtiments. En n'écoutant que le
 * bandeau, les deux gestes ne se rencontrent jamais.
 *
 * ⚠ `touchAction: 'none'` sur la poignée est OBLIGATOIRE : sans lui le
 * navigateur interprète le début du glissement comme un défilement de page,
 * avale les `pointermove` suivants et la feuille se fige à mi-course.
 *
 * Le suivi se fait en transformation INLINE plutôt qu'en état React : le doigt
 * émet un `pointermove` par frame, et re-rendre la boutique (30 rangées, leurs
 * prix, leurs pastilles) à chaque frame ferait ramer le geste qu'on essaie de
 * rendre fluide. React ne revoit la feuille qu'à la fin, quand elle se ferme.
 */

// Course à parcourir pour que le geste compte. En dessous, c'est un tap ou une
// hésitation : la feuille revient à sa place. 72px ≈ un pouce et demi.
const SEUIL_PX = 72;
// Filet pour un geste RAPIDE et court — le mouvement naturel quand on veut
// « jeter » la feuille dehors. Sans lui, un balayage vif de 50px ne ferme pas et
// paraît ignoré. En px par milliseconde.
const SEUIL_VITESSE = 0.5;
// ⚠ MAIS LA VITESSE SEULE FERMERAIT SUR UN TREMBLEMENT : 10px parcourus en 5ms
// font 2 px/ms, quatre fois le seuil. C'est le profil exact d'un tap sur le
// bandeau par une main qui bouge — donc de la boutique qui se ferme toute seule
// quand on voulait changer de catégorie. Le chemin rapide exige en plus une
// course minimale, assez courte pour rester un « jet », assez longue pour
// qu'aucun tap ne l'atteigne.
const SEUIL_JET_PX = 24;
// Le glissement ne s'arme qu'une fois cette course franchie, ET seulement si le
// mouvement est plus vertical qu'horizontal : les catégories de la boutique
// vivent dans le même bandeau, un mouvement de côté leur appartient.
const AMORCE_PX = 8;

export function useSheetSwipeClose({ enabled = false, onClose } = {}) {
  const sheetRef = useRef(null);
  // Tout l'état du geste vit dans un ref : il change à chaque frame et ne doit
  // déclencher aucun rendu.
  const geste = useRef(null);

  const poser = useCallback((dy) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
  }, []);

  const rendre = useCallback((anime) => {
    const el = sheetRef.current;
    if (!el) return;
    // Le retour en place s'anime, la fermeture non : la feuille disparaît, une
    // transition sur un élément qui part n'a personne pour la regarder.
    el.style.transition = anime ? 'transform 160ms ease-out' : 'none';
    el.style.transform = '';
  }, []);

  const onPointerDown = useCallback((e) => {
    if (!enabled || !onClose) return;
    // Bouton droit / molette : ce n'est pas un geste de feuille.
    if (e.button != null && e.button !== 0) return;
    geste.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, arme: false, abandon: false };
  }, [enabled, onClose]);

  useEffect(() => {
    if (!enabled || !onClose) return undefined;

    const move = (e) => {
      const g = geste.current;
      if (!g || e.pointerId !== g.id || g.abandon) return;
      const dy = e.clientY - g.y0;
      const dx = e.clientX - g.x0;
      if (!g.arme) {
        if (Math.abs(dy) < AMORCE_PX && Math.abs(dx) < AMORCE_PX) return;
        // Vers le haut, ou plus horizontal que vertical : ce geste ne nous
        // appartient pas. On l'abandonne pour de bon plutôt que de le
        // réévaluer — sinon un mouvement en L finirait par armer la fermeture.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { g.abandon = true; return; }
        g.arme = true;
      }
      poser(dy);
    };

    const up = (e) => {
      const g = geste.current;
      if (!g || e.pointerId !== g.id) return;
      geste.current = null;
      if (!g.arme) return;
      const dy = e.clientY - g.y0;
      const dt = Math.max(1, e.timeStamp - g.t0);
      const ferme = dy > SEUIL_PX || (dy > SEUIL_JET_PX && dy / dt > SEUIL_VITESSE);
      rendre(!ferme);
      if (ferme) onClose();
    };

    const perdu = (e) => {
      const g = geste.current;
      if (!g || e.pointerId !== g.id) return;
      geste.current = null;
      rendre(true);
    };

    // Écoute sur la FENÊTRE, pas sur la poignée : le doigt sort de la poignée
    // dès les premiers pixels du glissement (c'est le principe même du geste),
    // et un écouteur local perdrait la fin du mouvement — la feuille resterait
    // coincée à mi-chemin, ni ouverte ni fermée.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', perdu);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', perdu);
      geste.current = null;
    };
  }, [enabled, onClose, poser, rendre]);

  // Une feuille qu'on ferme au bouton alors qu'un glissement traînait garderait
  // sa transformation pour sa prochaine ouverture : on nettoie au démontage du
  // régime.
  useEffect(() => {
    if (enabled) return undefined;
    return () => rendre(false);
  }, [enabled, rendre]);

  // ⚠ RENDU EN PAIRE, PAS EN OBJET. La règle `react-hooks/refs` interdit de lire
  // une propriété d'un objet porteur de ref pendant le rendu : `swipe.sheetRef`
  // dans le JSX faisait échouer `npm run lint` (4 erreurs), alors que la valeur
  // lue est le ref lui-même et jamais son `.current`. Une paire se déstructure à
  // l'appel, avant le JSX, et la règle est satisfaite sans exception à écrire.
  return [
    sheetRef,
    enabled && onClose ? { onPointerDown, style: { touchAction: 'none' } } : {},
  ];
}
