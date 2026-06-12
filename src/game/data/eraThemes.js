"use strict";

/**
 * eraThemes.js — source de vérité unique du thème visuel par ère/époque.
 *
 * Deux granularités :
 *  - ÉPOQUE (band 0–6, une tous les 5 ères) : grosse bascule visuelle —
 *    palette du chrome UI, peau structurelle CSS ([data-era-band]),
 *    ambiance carte (sol, chaleur nocturne).
 *  - ÈRE (index 0–34) : micro-dérive d'accent + détail signature sur la
 *    carte + ligne d'annonce du bandeau de transition.
 *
 * Consommé par App.jsx (variables CSS inline + data-era-band), Topbar,
 * journalThemes.js et le rendu canvas (renderWorld.js).
 */

import { eras } from "./world.js";

// Même découpage que cmEraBand (layout.js) : 35 ères → 7 bandes de 5.
export function eraBandOf(eraIndex) {
  const max = eras.length - 1;
  const i = Math.max(0, Math.min(max, eraIndex | 0));
  return Math.max(0, Math.min(6, Math.floor((i / max) * 6.999)));
}

/* ------------------------------------------------------------------ */
/* Les 7 époques                                                       */
/* ------------------------------------------------------------------ */

export const EPOCHS = [
  {
    id: "feu", label: "Âge du Feu",
    // Accent braise : orange profond, chrome rugueux.
    hue: 24, sat: 62, lum: 55,
    map: {
      urbanGround: [80, 64, 38],
      wildGround: "#2a3620",
      nightWarm: "255,176,96"
    }
  },
  {
    id: "bois", label: "Âge du Bois",
    // Paille et torchis : ocre chaud.
    hue: 37, sat: 58, lum: 53,
    map: {
      urbanGround: [88, 72, 42],
      wildGround: "#2d3a1e",
      nightWarm: "255,188,104"
    }
  },
  {
    id: "pierre", label: "Âge de la Pierre taillée",
    // Or parchemin : proche de l'or canonique actuel.
    hue: 42, sat: 56, lum: 57,
    map: {
      urbanGround: [102, 88, 58],
      wildGround: "#2d3a1e",
      nightWarm: "255,200,120"
    }
  },
  {
    id: "couronne", label: "Âge de la Couronne",
    // Héraldique : pourpre royal feutré (saturation contenue — un violet
    // trop vif rend le chrome agressif sur les boutons d'achat).
    hue: 292, sat: 22, lum: 66,
    map: {
      urbanGround: [104, 92, 64],
      wildGround: "#2d3a1e",
      nightWarm: "255,200,120"
    }
  },
  {
    id: "marbre", label: "Âge du Marbre",
    // Gravure classique : bleu lapis sur marbre.
    hue: 214, sat: 55, lum: 64,
    map: {
      urbanGround: [124, 114, 92],
      wildGround: "#2e381f",
      nightWarm: "255,210,140"
    }
  },
  {
    id: "fonte", label: "Âge de la Fonte",
    // Gazette et métal : cuivre patiné.
    hue: 17, sat: 48, lum: 58,
    map: {
      urbanGround: [120, 110, 100],
      wildGround: "#2c3322",
      nightWarm: "255,215,150"
    }
  },
  {
    id: "neon", label: "Âge du Néon",
    // Flux : cyan froid, la nuit elle-même change de couleur.
    hue: 185, sat: 64, lum: 58,
    map: {
      urbanGround: [92, 94, 99],
      wildGround: "#262c26",
      nightWarm: "150,230,255"
    }
  }
];

/* ------------------------------------------------------------------ */
/* Les 35 ères : détail signature carte + annonce de transition        */
/* detail: identifiant consommé par renderWorld (cumulatif : un détail */
/* introduit à l'ère N reste visible ensuite).                         */
/* ------------------------------------------------------------------ */

// Chaque annonce décrit un changement RÉELLEMENT visible sur la carte à
// cette ère : soit un détail dessiné ici (detail non nul), soit un système
// existant qui bascule à ce seuil exact (véhicules, routes, lanternes,
// murailles, sols et peaux d'époque, croissance des monuments/quartiers).
export const ERA_SIGNATURES = [
  { detail: null,              announce: "Un cercle de pierres, quelques braises." },
  { detail: "satellite_fires", announce: "Des feux s'allument autour du campement." },
  { detail: "drying_racks",    announce: "Des claies de séchage entourent les abris." },
  { detail: "totem",           announce: "Un totem se dresse au centre du cercle." },
  { detail: null,              announce: "Les huttes se multiplient autour du foyer." },
  { detail: "well",            announce: "Un puits est creusé au cœur du hameau." },
  { detail: null,              announce: "Chariots et attelages remplacent les paniers." },
  { detail: "haystacks",       announce: "Meules de foin et lanternes apparaissent." },
  { detail: "scarecrows",      announce: "Des épouvantails veillent sur les champs." },
  { detail: null,              announce: "Des caravanes sillonnent la grand-route." },
  { detail: null,              announce: "La pierre claire remplace le bois." },
  { detail: null,              announce: "Les rues s'élargissent et se pavent." },
  { detail: "market_stalls",   announce: "Des étals colorés couvrent les places." },
  { detail: null,              announce: "Le trafic s'intensifie sur les avenues." },
  { detail: null,              announce: "Des navires accostent au fil de l'eau." },
  { detail: "wall_banners",    announce: "Murailles et bannières ceignent la cité." },
  { detail: null,              announce: "De nouveaux étendards fleurissent sur les places." },
  { detail: "keep_standard",   announce: "L'étendard seigneurial domine le cœur de la ville." },
  { detail: null,              announce: "Les comptoirs marchands gagnent les routes." },
  { detail: null,              announce: "L'oriflamme royale double chaque pennon." },
  { detail: null,              announce: "Le marbre blanchit les esplanades." },
  { detail: null,              announce: "De nouveaux monuments s'élèvent." },
  { detail: null,              announce: "Les colonnades gagnent les avenues." },
  { detail: null,              announce: "Les quartiers se densifient." },
  { detail: null,              announce: "Des réverbères d'un nouvel âge bordent les avenues." },
  { detail: null,              announce: "La brique sombre et le métal grisent la ville." },
  { detail: null,              announce: "Les nuits brillent de mille fenêtres." },
  { detail: null,              announce: "Les faubourgs avalent la campagne." },
  { detail: null,              announce: "Les villes voisines se fondent en une seule." },
  { detail: null,              announce: "Les artères scintillent de trafic nocturne." },
  { detail: null,              announce: "Le néon froid remplace l'or des nuits." },
  { detail: null,              announce: "Les arcologies percent le smog." },
  { detail: null,              announce: "Des lignes de lumière strient les quartiers." },
  { detail: "neon_grid",       announce: "Une grille pulse sous les rues." },
  { detail: "breathing_core",  announce: "Le cœur de la cité respire seul." }
];

/* ------------------------------------------------------------------ */
/* Dérivation des couleurs                                             */
/* ------------------------------------------------------------------ */

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function rgbHex([r, g, b]) {
  const c = (v) => v.toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

const ROMANS = ["I", "II", "III", "IV", "V"];

// Cache : 35 thèmes immuables, calculés une fois.
const themeCache = new Map();

/**
 * Thème complet d'une ère : bande, époque, palette chrome UI (famille
 * "gold" redéfinie), détail signature et annonce.
 */
export function getEraTheme(eraIndex) {
  const max = eras.length - 1;
  const i = Math.max(0, Math.min(max, eraIndex | 0));
  if (themeCache.has(i)) return themeCache.get(i);

  const band = eraBandOf(i);
  const epoch = EPOCHS[band];
  const sig = ERA_SIGNATURES[i] || { detail: null, announce: "" };

  // Micro-dérive intra-époque : la teinte glisse légèrement à chaque ère,
  // la lumière monte — chaque ère est une variation sensible mais douce.
  const stepInEpoch = i % 5;
  const t = stepInEpoch / 4;
  const hue = (epoch.hue + (t - 0.5) * 10 + 360) % 360;
  const lum = epoch.lum + (t - 0.5) * 5;
  const sat = epoch.sat;

  const accent = hslToRgb(hue, sat, lum);
  const theme = {
    eraIndex: i,
    band,
    epochId: epoch.id,
    epochLabel: epoch.label,
    epochNumeral: ROMANS[stepInEpoch],
    detail: sig.detail,
    announce: sig.announce,
    // Famille chrome : remplace --gold/--gold-bright/--gold-dim/--gold-deep.
    accent: rgbHex(accent),
    accentBright: rgbHex(hslToRgb(hue, sat, Math.min(82, lum + 12))),
    accentDim: rgbHex(hslToRgb(hue, Math.max(18, sat - 22), Math.max(30, lum - 8))),
    accentDeep: rgbHex(hslToRgb(hue, Math.min(100, sat + 6), Math.max(18, lum - 22))),
    accentIvory: rgbHex(hslToRgb(hue, 38, 86)),
    accentRgb: `${accent[0]}, ${accent[1]}, ${accent[2]}`
  };
  themeCache.set(i, theme);
  return theme;
}

/** Détails signature actifs à une ère donnée (cumulatifs). */
export function activeEraDetails(eraIndex) {
  const out = new Set();
  const max = Math.max(0, Math.min(eras.length - 1, eraIndex | 0));
  for (let i = 0; i <= max; i++) {
    const d = ERA_SIGNATURES[i] && ERA_SIGNATURES[i].detail;
    if (d) out.add(d);
  }
  return out;
}

/** Ambiance carte d'une bande (sol urbain, fond sauvage, chaleur nocturne). */
export function mapThemeForBand(band) {
  const b = Math.max(0, Math.min(6, band | 0));
  return EPOCHS[b].map;
}
