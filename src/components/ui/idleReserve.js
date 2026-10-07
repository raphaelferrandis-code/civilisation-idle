import { fmtSecs } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';

/**
 * L'INFOBULLE DE LA RÉSERVE D'ABSENCE, source unique : l'encart d'état (au doigt)
 * et les Options › Sauvegarde (au bureau, où la réserve est passée depuis le
 * relevé du 06/10, docs/PLAN-LISIBILITE.md) la disent avec les mêmes mots.
 *
 * `cap` : idleCapSeconds() ; `next` : nextIdleCapPalier() ({ name, cap } ou null).
 */
export function idleReserveHint(cap, next) {
  return next
    ? tr({
        fr: `La cité produit et vieillit en ton absence, jusqu'à ${fmtSecs(cap)}. Au-delà, le temps est perdu. « ${next.name} » porte la réserve à ${fmtSecs(next.cap)}.`,
        en: `The city produces and ages while you are away, up to ${fmtSecs(cap)}. Beyond that, time is lost. "${next.name}" raises the reserve to ${fmtSecs(next.cap)}.`
      })
    : tr({
        fr: `La cité produit et vieillit en ton absence, jusqu'à ${fmtSecs(cap)}. Réserve maximale atteinte.`,
        en: `The city produces and ages while you are away, up to ${fmtSecs(cap)}. Maximum reserve reached.`
      });
}
