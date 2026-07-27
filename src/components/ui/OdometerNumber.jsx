import { useEffect, useRef, useState } from 'react';
import { fmtShortLive, COMPACT_UNITS } from '../../game/core/utils.js';
import { toNum } from '../../game/core/num.js';
import { useCountUp } from '../../hooks/useCountUp.js';
import { idealDecimals, reconcilePrecision, SETTLE_MS, COOLDOWN_MS } from './odoPrecision.js';

// Même constante que RollingNumber : l'anim d'un tick déborde sur le suivant
// pour que le défilement ne s'arrête jamais entre deux ticks (voir là-bas).
const DEFAULT_DURATION = 1100;

/**
 * Compteur ODOMÈTRE : chaque chiffre est une colonne qui roule verticalement,
 * comme un compteur mécanique. Le dernier chiffre roule en continu (position
 * réelle entre deux crans) ; les chiffres supérieurs tombent d'un CRAN SEC
 * quand leur glyphe change — pose, clac, pose — avec un léger dépassement et
 * un flash doré qui retombe (odo-snap / odo-carry).
 *
 * TOUS les chiffres affichés sont vrais. C'est la PRÉCISION qui s'adapte au
 * débit (`rate`, unités/s) pour qu'il y en ait toujours un qui tourne à une
 * allure suivable — voir odoPrecision.js. Pas de rouleau flou, pas de filet
 * décoratif : un cadran qui affiche autre chose que sa valeur se voit.
 *
 * La pulsation (.roll-pulse) n'est pas un métronome : elle ne se rejoue que
 * sur un JALON — changement de suffixe (K→M→B…), de nombre de chiffres, ou
 * recalage de précision.
 *
 * Hors domaine odométrable (négatif, ≥1e36, infini) : repli texte plat.
 */

// Décompose un number fini en cadran : mantisse continue + suffixe (+ le
// diviseur d'échelle, qui convertit un débit brut en pas de cadran).
function dialParts(n) {
  if (!Number.isFinite(n) || n < 0 || n >= 1e36) return null;
  let v = n;
  let i = -1;
  let div = 1;
  while (v >= 1000 && i < COMPACT_UNITS.length - 1) {
    v /= 1000;
    div *= 1000;
    i += 1;
  }
  return { mantissa: v, suffix: i < 0 ? '' : COMPACT_UNITS[i], div };
}

// Précision lisible, amortie : le calage suit le débit réel mais ne se rejoue
// pas à chaque fluctuation (un changement de forme re-monte le cadran entier).
function useReadablePrecision(rate, div, intLen) {
  const [dec, setDec] = useState(() => idealDecimals(rate, div, intLen));
  const stateRef = useRef(null);
  if (stateRef.current === null) stateRef.current = { dec, div, since: 0, changedAt: 0 };

  useEffect(() => {
    let timer = 0;
    const settle = () => {
      const now = performance.now();
      const next = reconcilePrecision(stateRef.current, { rate, div, intLen, now });
      stateRef.current = next;
      if (next.dec !== dec) { setDec(next.dec); return; }
      // Sortie de bande en attente de confirmation : le débit peut rester
      // rigoureusement constant d'ici là (donc aucun re-render pour nous
      // réveiller) — on repasse nous-mêmes quand le délai est écoulé.
      if (next.since) {
        const wait = Math.max(50, SETTLE_MS - (now - next.since), COOLDOWN_MS - (now - next.changedAt));
        timer = setTimeout(settle, wait);
      }
    };
    settle();
    return () => clearTimeout(timer);
  }, [rate, div, intLen, dec]);

  return dec;
}

export default function OdometerNumber({ value, rate = 0, duration = DEFAULT_DURATION }) {
  const target = toNum(value);
  const display = useCountUp(target, duration);

  const parts = dialParts(display);
  const mantissa = parts ? parts.mantissa : 0;
  const intLen = Math.max(1, String(Math.floor(mantissa)).length);
  // Un débit négatif (ressource qui se vide) fait tourner le cadran autant
  // qu'un positif : c'est sa valeur absolue qui décide de la précision.
  const churn = Math.abs(toNum(rate)) || 0;
  const decimals = useReadablePrecision(churn, parts ? parts.div : 1, intLen);

  if (!parts) {
    // Repli plat : à l'arrêt on reformate la valeur d'origine (Decimal exact).
    // Enveloppé en .odo pour profiter de la même auto-taille que le cadran
    // (largeur estimée en majorant 0.65 em/caractère, cf. les chasses ci-dessous).
    const flat = fmtShortLive(display === target ? value : display);
    return <span className="odo" style={{ '--odo-w': (flat.length * 0.65 + 0.3).toFixed(3) }}>{flat}</span>;
  }

  const { suffix } = parts;
  const count = intLen + decimals;
  // D = la suite de chiffres comme flottant continu (ex. 5.61 → 561.28…).
  const D = mantissa * Math.pow(10, decimals);
  const Dint = Math.floor(D);
  const resting = display === target;
  // À l'arrêt (anim finie), on fige les colonnes sur le glyphe entier.
  const fracD = resting ? 0 : D - Dint;

  // Jalon : signature de forme du cadran (nb de chiffres + suffixe). Utilisée
  // comme `key` du wrapper : quand elle change, React re-monte le span →
  // l'anim .roll-pulse se rejoue une fois (sans compteur lu en ref au render).
  const shape = `${count}|${suffix}`;

  // Largeur du cadran en em, publiée en --odo-w (nombre) : la topbar s'en
  // sert pour dimensionner la police au conteneur (font-size = 100cqw /
  // --odo-w, cf. components.css). Chasses MESURÉES au rendu, dans le vrai
  // contexte (Pixelify Sans 500, crénage 0 — mesurer en canvas ou à un autre
  // poids donne des valeurs fausses) : slot 1ch = 0.592 em, point 0.231,
  // suffixe (déjà réduit à 0.72 em par .odo-suffix) 0.555 max à 1 lettre (M),
  // 0.918 max à 2 lettres (Qa). Arrondi vers le haut : sous-estimer la largeur
  // donnerait une police trop grande, donc un débordement de cellule.
  // Même granularité que `shape` → la taille ne change qu'au re-mount jalon.
  const wEm = count * 0.595 + (decimals > 0 ? 0.24 : 0) + (suffix ? (suffix.length > 1 ? 0.92 : 0.56) : 0);

  const slots = [];
  for (let k = count - 1; k >= 0; k--) {
    const pow = Math.pow(10, k);
    const idx = count - 1 - k;
    if (idx === intLen) slots.push(<span className="odo-sep" key="dot">.</span>);

    const digit = Math.floor(Dint / pow) % 10;

    // CRAN MÉCANIQUE : un chiffre au-dessus du dernier ne glisse pas avec la
    // retenue, il bascule d'un coup sec quand son glyphe change. La bande
    // porte [précédent, courant, suivant] (le précédent sorti du slot par
    // marge négative → l'état de repos est transform: 0, net à toute taille)
    // et key={digit} re-monte la colonne à chaque bascule : l'anim CSS
    // rejoue. Un saut de plusieurs crans entre deux frames affiche un
    // « précédent » reconstruit (digit−1) : sans conséquence.
    if (k > 0) {
      slots.push(
        <span className="odo-slot" key={`d${idx}`}>
          <span className="odo-col odo-col--snap" key={digit}>
            <span className="odo-d odo-d--prev">{(digit + 9) % 10}</span>
            <span className="odo-d">{digit}</span>
            <span className="odo-d">{(digit + 1) % 10}</span>
          </span>
        </span>
      );
      continue;
    }

    // Dernier chiffre : le « moteur » du cadran. Il roule en continu à sa
    // position RÉELLE entre deux crans (fraction du pas parcourue), à une
    // allure que la précision maintient suivable. round(…, 1px) cale le
    // déplacement sur des pixels CSS entiers : Silkscreen ne bave plus en
    // sous-pixel pendant le roulis.
    slots.push(
      <span className="odo-slot" key={`d${idx}`}>
        <span className="odo-col" style={{ transform: `translateY(round(${(-fracD).toFixed(4)}em, 1px))` }}>
          <span className="odo-d">{digit}</span>
          <span className="odo-d">{(digit + 1) % 10}</span>
        </span>
      </span>
    );
  }

  return (
    <>
      {/* Le cadran est MASQUÉ aux lecteurs d'écran : ses bandes de chiffres se
          lisent « 4 5 0 1 2 3… », du charabia. La valeur lisible vit dans le
          frère .sr-only (position: absolute, cf. components.css) — hors flux,
          donc sans effet sur la mesure de largeur --odo-w du cadran. */}
      <span className="odo roll-pulse" key={shape} style={{ '--odo-w': wEm.toFixed(3) }} aria-hidden="true">
        {slots}
        {suffix && <span className="odo-sep odo-suffix">{suffix}</span>}
      </span>
      <span className="sr-only">{fmtShortLive(value)}</span>
    </>
  );
}
