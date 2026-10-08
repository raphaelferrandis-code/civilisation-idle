// LES TABLES DE LA MAISON DES PLAISIRS — la LECTURE (docs/PLAN-AMBIANCE-SONORE.md,
// lot 10). La synthèse vit dans tablesSynth.js ; le rendu, la sortie et les voix dans le
// lecteur partagé (../lecteur.js). Tout suit Options › Son › Bruitages, comme la
// machine à sous ; rien ne sonne dans un onglet caché.
//
// Les écrans des tables appellent ces fonctions, au geste du joueur : les automatisations
// de la Maison jouent ailleurs, sans écran (templeAutomation.js), donc sans un bruit.
//   · les jetons (TableMise.jsx) : poser, reprendre, la même mise, le tapis, à toutes
//     les tables qui ont le râtelier (aussi la machine à sous, Icare, le duel) ;
//   · les osselets (AuguryStage.jsx) : le lancer, les quatre qui retombent, le verdict ;
//   · le vingt-et-un (BlackjackStage.jsx) : la donne (le battage d'un sabot neuf), la
//     carte tirée, la carte cachée retournée et les tirages du croupier, le verdict ;
//   · les tickets (ScratchStage.jsx, ScratchCanvas.jsx) : le ticket posé, le grattage
//     (une boucle que la vitesse du geste dose), chaque case dégagée, la révélation, le
//     verdict.
// Les gros gains (×5 et plus) gardent leur fanfare (GrandGain.jsx) : le verdict d'une
// table ne joue que le petit gain, la perte ou l'égalité.

import { getSfxEnabled, getSfxVolume } from '../../core/main.js';
import { creerLecteur, cibler } from '../lecteur.js';
import {
  rendreTable, TABLES_SR, matiereJeton, matiereDes, matiereCartes, matiereTicket,
} from './tablesSynth.js';
import { enregistrerBancMoments } from '../paysage/banc.js';

// Les niveaux, × Bruitages : discrets, ils reviennent à chaque coup.
export const NIVEAUX_TABLES = {
  jeton: 0.14, jetons: 0.16, des: 0.22, carte: 0.16, retourne: 0.14, melange: 0.18,
  gratte: 0.2, ticket: 0.16, case: 0.12, revele: 0.14, gain: 0.22, perte: 0.1, egalite: 0.12,
};
export const BANC_TABLES = Object.fromEntries(Object.keys(NIVEAUX_TABLES).map((k) => [k, 1]));
const CLE_BANC = 'civ-tables-banc-1';
try {
  const j = JSON.parse(localStorage.getItem(CLE_BANC) || 'null');
  if (j && typeof j === 'object') for (const k of Object.keys(BANC_TABLES)) if (Number.isFinite(Number(j[k]))) BANC_TABLES[k] = Number(j[k]);
} catch { /* stockage indisponible : les défauts */ }
const famille = (nom) => nom.replace(/-.*$/, '');
const niveau = (nom) => (NIVEAUX_TABLES[famille(nom)] || 0.15) * (BANC_TABLES[famille(nom)] ?? 1);

const LEC = creerLecteur({ quoi: 'table', rendre: rendreTable, sr: TABLES_SR, niveau });
const horloge = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const cache = () => typeof document !== 'undefined' && document.hidden;
const hasard = (a, b) => a + Math.random() * (b - a);
const D = { bande: 0, dernierJeton: -Infinity, derniereCase: -Infinity, gratte: null, gratteArret: null };

// Ce qu'une table doit avoir sous la main, dans la matière de l'âge. 'jetons' : le
// râtelier seul (TableMise.jsx), aux tables qui n'ont pas d'autre son d'ici (la machine
// à sous, Icare, le duel).
export function sonsDeTable(jeu, bande) {
  const j = matiereJeton(bande);
  const jetons = [`jeton-${j}-1`, `jeton-${j}-2`, `jetons-${j}`];
  if (jeu === 'jetons') return jetons;
  const base = [...jetons, 'gain-petit', 'perte', 'egalite'];
  if (jeu === 'osselets') { const d = matiereDes(bande); return [...base, `des-${d}-lance`, `des-${d}-1`, `des-${d}-2`, `des-${d}-3`]; }
  if (jeu === 'cartes') { const c = matiereCartes(bande); return [...base, `carte-${c}-1`, `carte-${c}-2`, `carte-${c}-3`, `retourne-${c}`, `melange-${c}`]; }
  if (jeu === 'tickets') { const t = matiereTicket(bande); return [...base, `gratte-${t}`, `ticket-${t}`, 'case', 'revele']; }
  return base;
}
// Une table s'ouvre : ses sons se rendent à l'avance (une dizaine, petits).
export function preparerTable(jeu, bande) {
  D.bande = bande | 0;
  if (!getSfxEnabled()) return;
  for (const n of sonsDeTable(jeu, bande)) LEC.demander(n);
}

// Le verdict d'un coup : le petit gain (pas un gros : il a sa fanfare), la perte, l'égalité.
function verdict(resultat, dans = 0) {
  const nom = resultat === 'gain' ? 'gain-petit' : resultat === 'perte' ? 'perte' : resultat === 'egalite' ? 'egalite' : null;
  if (nom) LEC.jouer(nom, { dans }, 0.5);
}

// ── Les jetons ──────────────────────────────────────────────────────────────────
// `quoi` : 'pose' (un jeton), 'meme' (la même mise : deux), 'reprend' (Effacer, la pile
// reprise), 'tapis'. Un clic en rafale : un jeton au plus toutes les 60 ms.
export function sonJetons(bande, quoi = 'pose') {
  if (cache()) return;
  D.bande = bande | 0;
  const m = matiereJeton(bande);
  if (quoi === 'reprend' || quoi === 'tapis') {
    LEC.jouer(`jetons-${m}`, { vitesse: quoi === 'tapis' ? 1.06 : 0.96 }, 0.3);
    return;
  }
  const now = horloge();
  if (now - D.dernierJeton < 60) return;
  D.dernierJeton = now;
  const v = Math.random() < 0.5 ? 1 : 2;
  LEC.jouer(`jeton-${m}-${v}`, { pan: hasard(-0.15, 0.15), vitesse: hasard(0.94, 1.06) }, 0.25);
  if (quoi === 'meme') LEC.jouer(`jeton-${m}-${3 - v}`, { dans: 0.075, pan: hasard(-0.15, 0.15), vitesse: hasard(0.94, 1.06) }, 0.25);
}

// ── Les osselets ────────────────────────────────────────────────────────────────
// 'lance' ; 'tombe' (i : le 1er … le 4e, de gauche à droite) ; 'verdict' ({ gagne, gros }).
export function sonOsselets(bande, quoi, { i = 0, gagne = false, gros = false } = {}) {
  if (cache()) return;
  D.bande = bande | 0;
  const d = matiereDes(bande);
  if (quoi === 'lance') LEC.jouer(`des-${d}-lance`, {}, 0.2);
  else if (quoi === 'tombe') LEC.jouer(`des-${d}-${1 + (i % 3)}`, { pan: [-0.35, -0.12, 0.12, 0.35][i % 4], vitesse: hasard(0.95, 1.05) }, 0.15);
  else if (quoi === 'verdict' && !gros) verdict(gagne ? 'gain' : 'perte');
}

// ── Le vingt-et-un ──────────────────────────────────────────────────────────────
// 'donne' ({ n, melange }) : n cartes, le battage avant si le sabot est neuf ;
// 'tire' : une carte au joueur ; 'croupier' ({ n, dans }) : sa carte cachée retournée,
// puis ses n tirages. Rend la durée de la séquence (s), pour caler le verdict.
export function sonCartes(bande, quoi, { n = 1, melange = false, dans = 0 } = {}) {
  if (cache()) return 0;
  D.bande = bande | 0;
  const c = matiereCartes(bande);
  const carte = (k, t, pan) => LEC.jouer(`carte-${c}-${1 + (k % 3)}`, { dans: t, pan, vitesse: hasard(0.95, 1.05) }, 0.4);
  if (quoi === 'donne') {
    let t = dans;
    if (melange) { LEC.jouer(`melange-${c}`, { dans: t }, 0.4); t += 0.55; }
    // Le joueur, le croupier, le joueur, le croupier : de part et d'autre du sabot.
    for (let k = 0; k < n; k += 1) carte(k, t + k * 0.11, k % 2 ? 0.25 : -0.2);
    return t + n * 0.11 + 0.15;
  }
  if (quoi === 'tire') { carte(Math.floor(Math.random() * 3), dans, -0.2); return dans + 0.2; }
  if (quoi === 'croupier') {
    LEC.jouer(`retourne-${c}`, { dans, pan: 0.25 }, 0.4);
    for (let k = 0; k < n; k += 1) carte(k, dans + 0.22 + k * 0.16, 0.28);
    return dans + 0.22 + n * 0.16 + 0.12;
  }
  return 0;
}
// Le verdict d'une main : 'blackjack', 'win', 'push', 'lose' (blackjackLastOutcome).
export function sonVerdictCartes(resultat, dans = 0) {
  if (cache()) return;
  if (resultat === 'blackjack') LEC.jouer('gain-petit', { dans, vitesse: 1.12 }, 0.5);
  else verdict(resultat === 'win' ? 'gain' : resultat === 'push' ? 'egalite' : 'perte', dans);
}

// ── Les tickets ─────────────────────────────────────────────────────────────────
// 'achat', 'case' (une case dégagée), 'revele', 'verdict' ({ gagne, gros }).
export function sonTicket(bande, quoi, { gagne = false, gros = false } = {}) {
  if (cache()) return;
  D.bande = bande | 0;
  const m = matiereTicket(bande);
  if (quoi === 'achat') LEC.jouer(`ticket-${m}`, {}, 0.3);
  else if (quoi === 'case') {
    const now = horloge();
    if (now - D.derniereCase < 80) return;
    D.derniereCase = now;
    LEC.jouer('case', { vitesse: hasard(0.92, 1.12), pan: hasard(-0.2, 0.2) }, 0.2);
  } else if (quoi === 'revele') LEC.jouer('revele', {}, 0.3);
  else if (quoi === 'verdict' && !gros) verdict(gagne ? 'gain' : 'perte', 0.3);
}
// LE GRATTAGE : une boucle qui tourne tant que le ticket est à l'écran ; sa voix suit
// la vitesse du geste (px par ms), et retombe au silence 120 ms après le dernier trait.
export function grattage(bande, vitesse) {
  if (cache() || !getSfxEnabled()) return;
  const nom = `gratte-${matiereTicket(bande)}`;
  if (D.gratte && D.gratte.nom !== nom) finGrattage();
  if (!D.gratte) {
    const v = LEC.voix(nom, { boucle: true });
    if (!v) return;                         // pas encore rendu : il se rend
    D.gratte = { ...v, nom };
  }
  const g = D.gratte, k = Math.max(0, Math.min(1, vitesse / 1.2));
  cibler(g.gain.gain, k > 0 ? (0.3 + 0.7 * k) * niveau(nom) * getSfxVolume() : 0, g.ctx, 0.03);
  cibler(g.source.playbackRate, 0.85 + 0.3 * k, g.ctx, 0.05);
  clearTimeout(D.gratteArret);
  D.gratteArret = setTimeout(() => { if (D.gratte) cibler(D.gratte.gain.gain, 0, D.gratte.ctx, 0.05); }, 120);
}
// Le ticket quitte l'écran (ou se révèle) : la boucle s'arrête.
export function finGrattage() {
  clearTimeout(D.gratteArret);
  D.gratteArret = null;
  const g = D.gratte;
  D.gratte = null;
  if (!g) return;
  cibler(g.gain.gain, 0, g.ctx, 0.04);
  setTimeout(() => { try { g.source.stop(); } catch { /* déjà finie */ } }, 220);
}

// Ce que les tables font (banc, vérifications).
export function etatTables() {
  return { tampons: [...LEC.tampons.keys()], compte: { ...LEC.compte }, gratte: Boolean(D.gratte), sortieDb: LEC.niveauSortie() };
}

// ── Le banc d'écoute (Ctrl+Alt+B, section « Les tables de la Maison ») ──────────
function ecouterTable(fam) {
  const b = D.bande;
  const j = matiereJeton(b), d = matiereDes(b), c = matiereCartes(b), t = matiereTicket(b);
  const nom = {
    jeton: `jeton-${j}-1`, jetons: `jetons-${j}`, des: `des-${d}-${1 + Math.floor(Math.random() * 3)}`,
    carte: `carte-${c}-1`, retourne: `retourne-${c}`, melange: `melange-${c}`, gratte: `gratte-${t}`,
    ticket: `ticket-${t}`, case: 'case', revele: 'revele', gain: 'gain-petit', perte: 'perte', egalite: 'egalite',
  }[fam];
  if (!nom) return;
  if (fam === 'gratte') {
    LEC.demander(nom).then(() => {
      let k = 0;
      const pas = setInterval(() => { grattage(b, 0.4 + 0.6 * Math.abs(Math.sin(k / 3))); k += 1; if (k > 20) { clearInterval(pas); finGrattage(); } }, 60);
    });
    return;
  }
  LEC.jouer(nom, {}, 2);
}
enregistrerBancMoments({
  cle: 'tables', titre: 'Les tables de la Maison · Bruitages',
  familles: Object.keys(NIVEAUX_TABLES), BANC: BANC_TABLES, ecouter: ecouterTable,
  retenir: () => { try { localStorage.setItem(CLE_BANC, JSON.stringify(BANC_TABLES)); } catch { /* indisponible */ } },
  reglages: () => ({ ...BANC_TABLES }),
});

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__tables = { etat: etatTables, ecouter: ecouterTable, preparer: preparerTable, NIVEAUX: NIVEAUX_TABLES, BANC: BANC_TABLES };
}
