import { useEffect, useRef, useState } from 'react';
import { fmtShortLive, COMPACT_UNITS } from '../../game/core/utils.js';
import { toNum } from '../../game/core/num.js';

// Même constante que RollingNumber : l'anim d'un tick déborde sur le suivant
// pour que le défilement ne s'arrête jamais entre deux ticks (voir là-bas).
const DEFAULT_DURATION = 1100;

/**
 * Compteur ODOMÈTRE : chaque chiffre est une colonne qui roule verticalement,
 * comme un compteur mécanique. Le dernier chiffre tourne en continu (piloté
 * par l'interpolation), les chiffres supérieurs ne basculent qu'à la retenue
 * (quand tous les chiffres sous eux affichent 9) — c'est ce qui donne la
 * sensation « machine » au lieu d'un texte qui clignote.
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
  const [display, setDisplay] = useState(target);

  const fromRef = useRef(target);
  const targetRef = useRef(target);
  const displayRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  // Jalon : signature de forme du cadran (nb de chiffres + suffixe). Quand elle
  // change, on re-monte le wrapper → l'anim .roll-pulse se rejoue, une fois.
  const shapeRef = useRef('');
  const pulseRef = useRef(0);

  useEffect(() => {
    if (target === targetRef.current) return undefined;

    // Hors domaine float : bascule directe (pas d'interpolation possible).
    if (!Number.isFinite(target) || !Number.isFinite(displayRef.current)) {
      cancelAnimationFrame(rafRef.current);
      targetRef.current = target;
      displayRef.current = target;
      setDisplay(target);
      return undefined;
    }

    // Baisse (achat/coût) : déduction instantanée, comme RollingNumber.
    if (target < displayRef.current) {
      cancelAnimationFrame(rafRef.current);
      fromRef.current = target;
      targetRef.current = target;
      displayRef.current = target;
      setDisplay(target);
      return undefined;
    }

    fromRef.current = displayRef.current;
    targetRef.current = target;
    startRef.current = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const current = t >= 1
        ? targetRef.current
        : fromRef.current + (targetRef.current - fromRef.current) * t;
      displayRef.current = current;
      setDisplay(current);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const parts = dialParts(display);
  if (!parts) {
    // Repli plat : à l'arrêt on reformate la valeur d'origine (Decimal exact).
    return fmtShortLive(display === target ? value : display);
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
  const ratePerSec = resting
    ? 0
    : (targetRef.current - fromRef.current) / (duration / 1000);
  const dialRate = (ratePerSec / div) * Math.pow(10, decimals);

  const shape = `${count}|${suffix}`;
  if (shapeRef.current !== shape) {
    shapeRef.current = shape;
    pulseRef.current += 1;
  }

  const slots = [];
  for (let k = count - 1; k >= 0; k--) {
    const pow = Math.pow(10, k);
    const idx = count - 1 - k;
    if (idx === intLen) slots.push(<span className="odo-sep" key="dot">.</span>);

    // Chiffre trop rapide pour être suivi : rouleau flou à vitesse constante.
    // Dernier chiffre d'un cadran quasi immobile malgré une production réelle :
    // rouleau LENT (régime « filet »), sinon le compteur paraît en panne.
    const stepRate = dialRate / pow;
    const spinsFast = stepRate > SPIN_THRESHOLD;
    const trickles = k === 0 && alive && stepRate < TRICKLE_THRESHOLD;
    if (spinsFast || trickles) {
      slots.push(
        <span className="odo-slot odo-dim" key={`d${idx}`}>
          <span className={`odo-col odo-col--spin${trickles ? ' odo-col--slow' : ''}`}>
            {SPIN_STRIP.map((d, j) => <span className="odo-d" key={j}>{d}</span>)}
          </span>
        </span>
      );
      continue;
    }

    const digit = Math.floor(Dint / pow) % 10;
    // Retenue mécanique : ce chiffre ne roule que si TOUS les chiffres sous
    // lui affichent 9 (le dernier chiffre, k=0, roule toujours).
    const rolls = k === 0 || (Dint % pow) === pow - 1;
    const frac = rolls ? fracD : 0;
    slots.push(
      <span className={`odo-slot${k < dimBelow ? ' odo-dim' : ''}`} key={`d${idx}`}>
        <span className="odo-col" style={{ transform: `translateY(${-frac * 50}%)` }}>
          <span className="odo-d">{digit}</span>
          <span className="odo-d">{(digit + 1) % 10}</span>
        </span>
      </span>
    );
  }

  return (
    <span className="odo roll-pulse" key={pulseRef.current}>
      {slots}
      {suffix && <span className="odo-sep odo-suffix">{suffix}</span>}
    </span>
  );
}
