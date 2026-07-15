// Métadonnées de la Boutique de Faveur (libellés, icônes, descriptions, ligne
// d'effet) — EXTRAITES de FaveurShop.jsx pour être partagées avec la Boutique
// immersive (HeritageView). Un fichier de composant ne peut pas exporter de
// constantes/fonctions sans casser le Fast Refresh (react-refresh/only-export-
// components), d'où ce module dédié.
import { DICE_BOOST_STEP, WING_STEP, BLESSING_MULT, BLESSING_DURATION_S } from '../../game/core/balance.js';
import { icarusEffectiveEdge } from '../../game/core/actions.js';
import { tr } from '../../game/core/i18n.js';

export const LABELS = {
  dice: { fr: 'Dés pipés', en: 'Loaded dice' },
  wing: { fr: 'Ailes cirées', en: 'Waxed wings' },
  blessing: { fr: 'Bénédiction', en: 'Blessing' }
};
export const ICONS = { dice: '🎲', wing: '🪽', blessing: '🌾' };
export const DESCS = {
  dice: { fr: 'Boost PERMANENT des chances aux osselets (+2 pts par niveau). Coût croissant.', en: 'PERMANENT boost to the knucklebones odds (+2 pts per level). Rising cost.' },
  wing: { fr: "Abaisse PERMANENT l'edge du Vol d'Icare — la cire tient plus longtemps.", en: 'PERMANENTLY lowers the Flight of Icarus edge — the wax holds longer.' },
  blessing: { fr: `Bonus TEMPORAIRE de production (+${Math.round((BLESSING_MULT - 1) * 100)} % pendant ${Math.round(BLESSING_DURATION_S / 60)} min). Re-jouable, cumulable en durée.`, en: `TEMPORARY production bonus (+${Math.round((BLESSING_MULT - 1) * 100)}% for ${Math.round(BLESSING_DURATION_S / 60)} min). Repeatable, duration stacks.` }
};

export function effectLine(item) {
  if (item.kind === 'dice') {
    const cur = Math.round(item.level * DICE_BOOST_STEP * 100);
    return item.maxed
      ? tr({ fr: `+${cur} pts · au max`, en: `+${cur} pts · maxed` })
      : tr({ fr: `+${cur} pts → +${cur + Math.round(DICE_BOOST_STEP * 100)} pts de chance`, en: `+${cur} pts → +${cur + Math.round(DICE_BOOST_STEP * 100)} pts chance` });
  }
  if (item.kind === 'wing') {
    const edgeNow = Math.round(icarusEffectiveEdge() * 100);
    const edgeNext = Math.max(4, Math.round((icarusEffectiveEdge() - WING_STEP) * 100));
    return item.maxed
      ? tr({ fr: `edge ${edgeNow} % · au max`, en: `edge ${edgeNow}% · maxed` })
      : tr({ fr: `edge ${edgeNow} % → ${edgeNext} %`, en: `edge ${edgeNow}% → ${edgeNext}%` });
  }
  // blessing
  if (item.active) {
    const secs = Math.max(0, Math.ceil((item.endsAt - Date.now()) / 1000));
    const mm = Math.floor(secs / 60); const ss = String(secs % 60).padStart(2, '0');
    return tr({ fr: `active · +${Math.round((BLESSING_MULT - 1) * 100)} % (${mm}:${ss})`, en: `active · +${Math.round((BLESSING_MULT - 1) * 100)}% (${mm}:${ss})` });
  }
  return tr({ fr: `+${Math.round((BLESSING_MULT - 1) * 100)} % prod · ${Math.round(BLESSING_DURATION_S / 60)} min`, en: `+${Math.round((BLESSING_MULT - 1) * 100)}% prod · ${Math.round(BLESSING_DURATION_S / 60)} min` });
}
