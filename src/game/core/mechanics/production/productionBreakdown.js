"use strict";

/* ============================================================================
 * productionBreakdown.js — « Les Comptes de la cité » (B3).
 *
 * D'où vient mon débit ? La barre du haut affiche « +24/min » sans jamais dire
 * ce qui le produit. Ce module rend, pour une ressource, la liste des
 * contributeurs classée par poids.
 *
 * ⚠ LE DÉNOMINATEUR EST LE DÉBIT AFFICHÉ, arbitrage de Raphaël. C'est la
 * décision structurante : la somme des lignes DOIT retomber sur le nombre déjà
 * lisible en haut de l'écran, sinon l'écran d'explication explique de travers.
 * Or ce débit ne vient pas que des bâtiments — un socle en sort tout seul
 * (rates.js:96-98) : 0,04 de Rayonnement par seconde, la Nourriture tirée de la
 * population (×0,012), l'Or au-dessus de 25 habitants (×0,0015). En partie
 * neuve, ce socle est CENT POUR CENT de la nourriture produite ; plus tard il
 * suit la population, donc il ne disparaît jamais. Il a sa propre ligne.
 *
 * ⚠ ON NE REJOUE PAS LA QUEUE DE rates(). Après la somme des bases, chaque
 * ressource subit une longue chaîne commune (multiplicateur global ou sa
 * racine, épitaphe, vitals, crise, préparations terminales, Cadmos, marchés et
 * guildes sur l'or, drain des Atrides, Énée qui met tout à zéro...). La
 * recopier ici, c'est une deuxième vérité qui dérive au premier équilibrage.
 * On calcule donc les PARTS sur les bases, et on les applique au débit réel :
 *
 *     débit = base × queue + terme_additif
 *     part_i = base_i / Σ base
 *     ligne_i = part_i × (débit − terme_additif)
 *
 * C'est exact tant que la queue est purement multiplicative et commune à tous
 * les contributeurs, ce qui est le cas. Le seul terme ADDITIF est la théocratie
 * sur le Savoir, ajoutée APRÈS le multiplicateur (rates.js:126 et 190) : elle
 * ne se met pas à l'échelle, elle a sa propre ligne.
 * ==========================================================================*/

import { state } from '../../state.js';
import { buildings } from '../../../data/buildings.js';
import { D, toNum } from '../../num.js';
import { has } from '../shared.js';
import {
  getBuildingSums,
  buildingOutputMultiplier,
  buildingOutputMultiplierDec,
  riverEngineFactor
} from './buildingOutput.js';
import { rates } from './rates.js';
import { babelExponentialMult, babelCommonTongueMult, hephInfraMult } from './mythEffects.js';
import { isMythEffectActive } from '../../../data/myths.js';

// Clé de ressource affichée → champ de bâtiment. `population` s'appelle `pop`
// et `infrastructure` s'appelle `infra` côté données : la confusion est le
// piège le plus facile de ce fichier.
const CHAMP_PAR_RESSOURCE = {
  population: "pop",
  food: "food",
  gold: "gold",
  knowledge: "knowledge",
  infrastructure: "infra"
};

export const BREAKDOWN_RESOURCES = Object.keys(CHAMP_PAR_RESSOURCE);

// Le socle : ce que la cité produit sans le moindre bâtiment (rates.js:96-98).
// Recopié ici volontairement, c'est trois lignes stables ; un test les compare
// au débit réel d'un état SANS bâtiment, ce qui attrape toute dérive.
function socleBase(resource) {
  const pop = toNum(state.population);
  if (resource === "population") return 0.04;
  if (resource === "food") return pop * 0.012;
  if (resource === "gold") return Math.max(0, pop - 25) * 0.0015;
  return 0;
}

// Facteurs communs à la base d'un bâtiment, exactement ceux que getBuildingSums
// puis la boucle par catégorie de rates() appliquent : synergie de jalon, rives
// fécondes, Babel sur la SEULE catégorie déclarée, Langue commune, et le bonus
// d'Héphaïstos réservé à l'infrastructure. Un seul endroit pour que le bilan
// (B3) et le gain marginal (B6) ne puissent pas diverger.
function facteursDeBase(b, count, champ, ctx) {
  const cat = b.category || "other";
  const synergie = ctx.overflow
    ? toNum(buildingOutputMultiplierDec(b, count).mul(riverEngineFactor(b)))
    : buildingOutputMultiplier(b, count) * riverEngineFactor(b);
  const catMult = (ctx.babelActive && cat === state.babelCategory ? ctx.babelMult : 1) * babelCommonTongueMult(cat);
  const hephBonus = (ctx.hephInfra > 1 && cat === "infra" && champ === "infra") ? ctx.hephInfra : 1;
  return synergie * catMult * hephBonus;
}

function contexteDeBase() {
  const babelActive = isMythEffectActive("mythe_de_babel");
  return {
    overflow: getBuildingSums().overflow,
    babelActive,
    babelMult: babelActive ? babelExponentialMult() : 1,
    hephInfra: hephInfraMult()
  };
}

/**
 * ÉCHELLES DE CONVERSION base → débit affiché (B6).
 *
 * Rend, par ressource, `{ k, rate }` où `k` transforme une base en unités du
 * débit lisible en haut de l'écran : `débit = base × k + additif`. C'est la même
 * mise à l'échelle que productionBreakdown, extraite pour être calculée UNE
 * fois par rendu de la boutique au lieu d'une fois par rangée — sinon chaque
 * rangée relancerait une passe sur les trente bâtiments.
 */
export function productionScales() {
  const ctx = contexteDeBase();
  const totaux = {};
  for (const res of BREAKDOWN_RESOURCES) totaux[res] = socleBase(res);
  for (const b of buildings) {
    const count = state.buildings[b.id] || 0;
    if (count <= 0) continue;
    for (const res of BREAKDOWN_RESOURCES) {
      const champ = CHAMP_PAR_RESSOURCE[res];
      const parUnite = b[champ] || 0;
      if (parUnite === 0) continue;
      totaux[res] += parUnite * count * facteursDeBase(b, count, champ, ctx);
    }
  }
  const r = rates();
  const scales = {};
  for (const res of BREAKDOWN_RESOURCES) {
    const rate = toNum(r[res]);
    const additif = (res === "knowledge" && has("trait_theocracy")) ? toNum(D(state.gold).mul(0.01)) : 0;
    const base = totaux[res];
    scales[res] = {
      rate,
      k: base > 0 && Number.isFinite(rate) ? (rate - additif) / base : 0
    };
  }
  return { scales, ctx };
}

/**
 * GAIN MARGINAL D'UN LOT (B6), en part du débit affiché.
 *
 * ⚠ MARGINAL, jamais la production totale de la ligne. La synergie de jalon est
 * exponentielle en `count` : rapporter la sortie ENTIÈRE du bâtiment au débit
 * ferait afficher un gain énorme à ce qu'on possède déjà en nombre, c'est-à-dire
 * exactement l'inverse du conseil utile. On compare donc l'état APRÈS l'achat à
 * l'état avant.
 *
 * Rend les ressources touchées, la plus forte d'abord, avec `pct` = part du
 * débit courant. `pct` vaut null quand la ressource n'a pas encore de débit :
 * diviser par zéro donnerait +Infini % sur le premier grenier d'une partie.
 */
export function buildingRelativeGain(b, count, amount, prepared) {
  const { scales, ctx } = prepared || productionScales();
  const apres = count + Math.max(0, amount);
  const out = [];
  for (const res of BREAKDOWN_RESOURCES) {
    const champ = CHAMP_PAR_RESSOURCE[res];
    const parUnite = b[champ] || 0;
    if (parUnite === 0) continue;
    const baseAvant = count > 0 ? parUnite * count * facteursDeBase(b, count, champ, ctx) : 0;
    const baseApres = parUnite * apres * facteursDeBase(b, apres, champ, ctx);
    const delta = baseApres - baseAvant;
    if (!(delta > 0)) continue;
    const s = scales[res];
    const ajout = delta * s.k;
    if (!Number.isFinite(ajout) || ajout <= 0) continue;
    out.push({ resource: res, add: ajout, pct: s.rate > 0 ? ajout / s.rate : null });
  }
  return out.sort((x, y) => (y.pct ?? Infinity) - (x.pct ?? Infinity));
}

/**
 * Contributions à une ressource, classées de la plus grosse à la plus petite.
 *
 * Rend { rows, total, socle, additif, degrade } où chaque ligne porte
 * { key, label, value, share } et où `value` est déjà dans l'unité du débit
 * affiché (par seconde), donc directement sommable.
 */
export function productionBreakdown(resource) {
  const champ = CHAMP_PAR_RESSOURCE[resource];
  if (!champ) throw new Error(`productionBreakdown : ressource inconnue "${resource}"`);

  // Contexte et facteurs PARTAGÉS avec le gain marginal (B6) : recopier ces
  // règles ici les ferait diverger au premier équilibrage.
  const ctx = contexteDeBase();

  const bases = [];
  let baseTotale = socleBase(resource);
  for (const b of buildings) {
    const count = state.buildings[b.id] || 0;
    const parUnite = b[champ] || 0;
    if (count <= 0 || parUnite === 0) continue;
    const cat = b.category || "other";
    const base = parUnite * count * facteursDeBase(b, count, champ, ctx);
    if (!(base > 0)) continue;
    bases.push({ key: b.id, label: b.name, count, base, category: cat });
    baseTotale += base;
  }

  // Le débit réellement affiché, source de vérité du total.
  const r = rates();
  const total = toNum(r[resource]);
  // Théocratie : seul terme AJOUTÉ après le multiplicateur, donc jamais mis à
  // l'échelle avec les autres.
  const additif = (resource === "knowledge" && has("trait_theocracy"))
    ? toNum(D(state.gold).mul(0.01))
    : 0;
  const aRepartir = total - additif;

  // Énée dégradé met la Nourriture et l'Or à zéro, et une crise peut annuler un
  // débit : les parts n'ont alors plus de sens, on le dit au lieu de rendre des
  // NaN.
  const degrade = !(baseTotale > 0) || !Number.isFinite(aRepartir) || aRepartir <= 0;

  const rows = bases
    .map((e) => ({
      key: e.key,
      label: e.label,
      count: e.count,
      // `base` est la contribution AVANT mise à l'échelle. Elle n'a aucun usage
      // à l'écran, mais c'est le seul point où le bilan peut être confronté au
      // moteur : les valeurs mises à l'échelle, elles, retombent toujours sur
      // le total par construction, donc un test qui ne regarderait qu'elles ne
      // pourrait jamais échouer.
      base: e.base,
      category: e.category,
      share: degrade ? 0 : e.base / baseTotale,
      value: degrade ? 0 : (e.base / baseTotale) * aRepartir
    }))
    .sort((a, b) => b.value - a.value);

  const partSocle = socleBase(resource);
  const socle = {
    base: partSocle,
    share: degrade || partSocle <= 0 ? 0 : partSocle / baseTotale,
    value: degrade || partSocle <= 0 ? 0 : (partSocle / baseTotale) * aRepartir
  };

  return { rows, socle, additif, total, degrade, baseTotale };
}
