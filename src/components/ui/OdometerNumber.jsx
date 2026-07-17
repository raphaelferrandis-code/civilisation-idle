import { useState } from 'react';
import { fmtShortLive, COMPACT_UNITS } from '../../game/core/utils.js';
import { toNum } from '../../game/core/num.js';
import { useCountUp } from '../../hooks/useCountUp.js';

// Même constante que RollingNumber : l'anim d'un tick déborde sur le suivant
// pour que le défilement ne s'arrête jamais entre deux ticks (voir là-bas).
const DEFAULT_DURATION = 1100;

/**
 * Compteur ODOMÈTRE : chaque chiffre est une colonne qui roule verticalement,
 * comme un compteur mécanique. Le dernier chiffre tourne en continu (piloté
 * par l'interpolation) ; les chiffres supérieurs tombent d'un CRAN SEC quand
 * leur glyphe change à la retenue — pose, clac, pose — avec un léger
 * dépassement et un flash doré qui retombe (odo-snap / odo-carry). C'est
 * cette mécanique qui donne la sensation « machine » au lieu d'un texte qui
 * glisse. Molette de ressenti : window.__odoSnap = false → retour au
 * glissement linéaire d'origine (la retenue glisse au rythme des unités).
 *
 * La pulsation (.roll-pulse) n'est plus un métronome : elle ne se rejoue que
 * sur un JALON — changement de suffixe (K→M→B…) ou de nombre de chiffres.
 *
 * Cadran calé sur les règles de fmtShortLive (mantisse enrichie de 2 décimales,
 * cf. utils.js). Hors domaine odométrable (négatif, ≥1e36, infini) : repli
 * texte plat fmtShortLive.
 */

// Décompose un number fini en cadran : mantisse continue + décimales + suffixe
// (+ le diviseur d'échelle, pour convertir un débit brut en pas de cadran).
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
  const decimals = i < 0 ? 1 : (v < 10 ? 2 : 1) + 2;
  return { mantissa: v, decimals, suffix: i < 0 ? '' : COMPACT_UNITS[i], div };
}

// Au-delà de ~3 incréments/s, l'œil ne suit plus un roulis exact : l'aliasing
// le fait paraître figé (effet « roue de chariot »). Ces chiffres passent en
// rouleau flou à vitesse constante — illisibles de toute façon, ils redeviennent
// exacts dès que la croissance ralentit.
const SPIN_THRESHOLD = 3;
// En dessous de ~1 pas / 4 s, le cadran paraît MORT alors que la production
// tourne (stock immense face au débit : la mantisse à 4 décimales ne bouge
// plus). Si `alive` (débit > 0), le dernier chiffre passe en rouleau LENT —
// signal honnête de « ça produit », sa précision étant de toute façon vide.
const TRICKLE_THRESHOLD = 0.25;
const SPIN_STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

// `alive` : la production de cette ressource est strictement positive (passé
// par le parent depuis le VRAI débit du jeu — couvre aussi les cas où le float
// ne résout même plus l'incrément par tick).
export default function OdometerNumber({ value, alive = false, duration = DEFAULT_DURATION }) {
  const target = toNum(value);
  // Débit du segment d'anim courant (unités brutes/s), posé par le moteur au
  // démarrage d'une montée — lu au render sans toucher de ref (concurrent-safe).
  const [segRate, setSegRate] = useState(0);
  const display = useCountUp(target, duration, setSegRate);
  // Molette de ressenti (console) : window.__odoSnap = false → glissement
  // d'origine pour comparer A/B en jeu. Lue à chaque render (le count-up
  // re-rend en continu, le toggle prend effet immédiatement).
  const snap = typeof window !== 'undefined' && window.__odoSnap !== false;

  const parts = dialParts(display);
  if (!parts) {
    // Repli plat : à l'arrêt on reformate la valeur d'origine (Decimal exact).
    // Enveloppé en .odo pour profiter de la même auto-taille que le cadran
    // (largeur estimée en majorant 0.9 em/caractère).
    const flat = fmtShortLive(display === target ? value : display);
    return <span className="odo" style={{ '--odo-w': (flat.length * 0.9 + 0.3).toFixed(3) }}>{flat}</span>;
  }

  const { mantissa, decimals, suffix, div } = parts;
  const intLen = Math.max(1, String(Math.floor(mantissa)).length);
  const count = intLen + decimals;
  // D = la suite de chiffres comme flottant continu (ex. 5.6098 → 56098.73…).
  const D = mantissa * Math.pow(10, decimals);
  const Dint = Math.floor(D);
  const resting = display === target;
  // À l'arrêt (anim finie), on fige les colonnes sur le glyphe entier.
  const fracD = resting ? 0 : D - Dint;
  // Seules les 2 décimales « live » (fmtShortLive) sont estompées.
  const dimBelow = decimals >= 3 ? 2 : 0;
  // Débit du segment d'anim courant, converti en pas de cadran par seconde.
  const ratePerSec = resting ? 0 : segRate;
  const dialRate = (ratePerSec / div) * Math.pow(10, decimals);

  // Jalon : signature de forme du cadran (nb de chiffres + suffixe). Utilisée
  // comme `key` du wrapper : quand elle change, React re-monte le span →
  // l'anim .roll-pulse se rejoue une fois (sans compteur lu en ref au render).
  const shape = `${count}|${suffix}`;

  // Largeur du cadran en em, publiée en --odo-w (nombre) : la topbar s'en
  // sert pour dimensionner la police au conteneur (font-size = 100cqw /
  // --odo-w, cf. components.css). Chasses Silkscreen 700 MESURÉES au rendu :
  // slot 1ch = 0.875 em (constant), point ≈ 0.50, suffixe 1 lettre ≤ 1.00
  // (M, le plus large), 2 lettres ≤ 1.87 (Sx/No) — letter-spacing inclus.
  // Même granularité que `shape` → la taille ne change qu'au re-mount jalon.
  const wEm = count * 0.875 + 0.5 + (suffix ? (suffix.length > 1 ? 1.87 : 1.0) : 0);

  const slots = [];
  for (let k = count - 1; k >= 0; k--) {
    const pow = Math.pow(10, k);
    const idx = count - 1 - k;
    if (idx === intLen) slots.push(<span className="odo-sep" key="dot">.</span>);

    // Chiffre trop rapide pour être suivi : rouleau flou dont la VITESSE suit
    // le vrai débit (10 pas = 1 tour, borné 0.35-1.4s) — plus ça produit, plus
    // ça tourne vite, et l'écart de rythme entre ressources se voit.
    // Régime « filet » (cadran quasi immobile malgré une production réelle) :
    // les DEUX derniers chiffres roulent en moteur au ralenti (0.8s / 2.4s).
    const stepRate = dialRate / pow;
    const spinsFast = stepRate > SPIN_THRESHOLD;
    const trickles = alive && dialRate < TRICKLE_THRESHOLD && k <= 1;
    if (spinsFast || trickles) {
      const dur = spinsFast
        ? Math.min(1.4, Math.max(0.35, 10 / stepRate))
        : (k === 0 ? 0.8 : 2.4);
      slots.push(
        <span className="odo-slot odo-dim" key={`d${idx}`}>
          <span className="odo-col odo-col--spin" style={{ animationDuration: `${dur.toFixed(2)}s` }}>
            {SPIN_STRIP.map((d, j) => <span className="odo-d" key={j}>{d}</span>)}
          </span>
        </span>
      );
      continue;
    }

    const digit = Math.floor(Dint / pow) % 10;

    // CRAN MÉCANIQUE (défaut) : un chiffre au-dessus des unités ne glisse pas
    // avec la retenue, il bascule d'un coup sec quand son glyphe change. La
    // bande porte [précédent, courant, suivant] (le précédent sorti du slot
    // par marge négative → l'état de repos est transform: 0, net à toute
    // taille) et key={digit} re-monte la colonne à chaque bascule : l'anim
    // CSS rejoue. Un saut de plusieurs crans entre deux frames affiche un
    // « précédent » reconstruit (digit−1) : sans conséquence, le rouleau flou
    // prend de toute façon le relais dès que ça va vite.
    if (snap && k > 0) {
      slots.push(
        <span className={`odo-slot${k < dimBelow ? ' odo-dim' : ''}`} key={`d${idx}`}>
          <span className="odo-col odo-col--snap" key={digit}>
            <span className="odo-d odo-d--prev">{(digit + 9) % 10}</span>
            <span className="odo-d">{digit}</span>
            <span className="odo-d">{(digit + 1) % 10}</span>
          </span>
        </span>
      );
      continue;
    }

    // Roulis continu : le dernier chiffre (le « moteur » du cadran), ou toute
    // la rangée si la molette a rebasculé sur le glissement d'origine (la
    // retenue ne roule alors que si TOUS les chiffres sous elle affichent 9,
    // au rythme des unités). round(…, 1px) cale le déplacement sur des pixels
    // CSS entiers : Silkscreen ne bave plus en sous-pixel pendant le roulis.
    const rolls = k === 0 || (Dint % pow) === pow - 1;
    const frac = rolls ? fracD : 0;
    slots.push(
      <span className={`odo-slot${k < dimBelow ? ' odo-dim' : ''}`} key={`d${idx}`}>
        <span className="odo-col" style={{ transform: `translateY(round(${(-frac).toFixed(4)}em, 1px))` }}>
          <span className="odo-d">{digit}</span>
          <span className="odo-d">{(digit + 1) % 10}</span>
        </span>
      </span>
    );
  }

  return (
    <span className="odo roll-pulse" key={shape} style={{ '--odo-w': wEm.toFixed(3) }}>
      {slots}
      {suffix && <span className="odo-sep odo-suffix">{suffix}</span>}
    </span>
  );
}
