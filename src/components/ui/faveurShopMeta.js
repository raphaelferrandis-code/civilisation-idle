// Métadonnées de la Boutique de Faveur (libellés, icônes, descriptions, ligne
// d'effet) — EXTRAITES de FaveurShop.jsx pour être partagées avec la Boutique
// immersive (HeritageView). Un fichier de composant ne peut pas exporter de
// constantes/fonctions sans casser le Fast Refresh (react-refresh/only-export-
// components), d'où ce module dédié.
import { BLESSING_MULT, BLESSING_DURATION_S } from '../../game/core/balance.js';
import { tr } from '../../game/core/i18n.js';

// (Les dés pipés et les ailes cirées ont disparu au lot 1 des gains « vrai casino » :
// ils achetaient des chances. Seule la Bénédiction reste sur l'étagère.)
export const LABELS = {
  blessing: { fr: 'Bénédiction', en: 'Blessing' }
};
export const ICONS = { blessing: '🌾' };
export const DESCS = {
  blessing: { fr: `+${Math.round((BLESSING_MULT - 1) * 100)} % de production pendant ${Math.round(BLESSING_DURATION_S / 60)} min. Rachetable, la durée se cumule. Son prix suit les recettes de la Maison.`, en: `+${Math.round((BLESSING_MULT - 1) * 100)}% production for ${Math.round(BLESSING_DURATION_S / 60)} min. Repeatable, duration stacks. Its price follows the House takings.` }
};

export function effectLine(item) {
  // blessing
  if (item.active) {
    const secs = Math.max(0, Math.ceil((item.endsAt - Date.now()) / 1000));
    const mm = Math.floor(secs / 60); const ss = String(secs % 60).padStart(2, '0');
    return tr({ fr: `active · +${Math.round((BLESSING_MULT - 1) * 100)} % (${mm}:${ss})`, en: `active · +${Math.round((BLESSING_MULT - 1) * 100)}% (${mm}:${ss})` });
  }
  return tr({ fr: `+${Math.round((BLESSING_MULT - 1) * 100)} % prod · ${Math.round(BLESSING_DURATION_S / 60)} min`, en: `+${Math.round((BLESSING_MULT - 1) * 100)}% prod · ${Math.round(BLESSING_DURATION_S / 60)} min` });
}
