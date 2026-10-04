import { useGameState } from '../../../hooks/useGameState.js';
import { tr } from '../../../game/core/i18n.js';
import { rankProgress, RANK_LABELS } from '../../../game/core/actions/maisonRang.js';
import { MAISON_RANKS } from '../../../game/core/balance.js';
import { ARTIFACT_NODES } from '../../../game/data/artifacts.js';
import { tipProps } from '../../ui/HelpBubble.jsx';
import '../../../styles/plaisirs-rang.css';

/**
 * LE TITRE À LA MAISON (lot 2 des gains « vrai casino », 2026-10-04,
 * docs/PLAN-GAINS-CASINO.md) : le titre du joueur et le chemin vers le suivant, sur
 * une ligne de la bourse. Le détail (la réputation, ce que le titre suivant ouvre)
 * vit dans l'infobulle : pas de phrase à l'écran.
 */
const heures = (h) => (h >= 10
  ? Math.round(h).toLocaleString('fr-FR')
  : h.toLocaleString('fr-FR', { maximumFractionDigits: 1 }));

function detail(p) {
  const rep = heures(p.reputation);
  if (p.next == null) {
    return tr({
      fr: `Ta réputation : ${rep} h de recettes, ce que la Maison a gagné sur tes mises, en théorie. Le plus haut titre : tables ×${p.mult.toLocaleString('fr-FR')}.`,
      en: `Your standing: ${rep} h of takings, what the House won from your stakes, in theory. The highest title: tables ×${p.mult.toLocaleString('en-US')}.`
    });
  }
  const nx = MAISON_RANKS[p.next];
  const gifts = nx.gifts.map((id) => (ARTIFACT_NODES[id] ? tr(ARTIFACT_NODES[id].label) : id));
  const fr = [`tables ×${nx.mult.toLocaleString('fr-FR')}`, ...gifts];
  const en = [`tables ×${nx.mult.toLocaleString('en-US')}`, ...gifts];
  if (nx.flights) {
    fr.push(`${nx.flights} vols d'Icare offerts`);
    en.push(`${nx.flights} free Icarus flights`);
  }
  return tr({
    fr: `Ta réputation : ${rep} h de recettes, ce que la Maison a gagné sur tes mises, en théorie. Elle ne se perd jamais. Tables ×${p.mult.toLocaleString('fr-FR')}. Au titre de ${tr(RANK_LABELS[p.nextId])}, à ${heures(p.to)} h : ${fr.join(', ')}.`,
    en: `Your standing: ${rep} h of takings, what the House won from your stakes, in theory. It is never lost. Tables ×${p.mult.toLocaleString('en-US')}. At ${tr(RANK_LABELS[p.nextId])}, at ${heures(p.to)} h: ${en.join(', ')}.`
  });
}

export default function RangMaison() {
  // Rafraîchi quand le titre change, ou que la réputation avance d'un centième d'heure.
  useGameState((s) => `${s.maisonRank || 0}:${Math.floor((s.maisonReputation || 0) * 100)}`);
  const p = rankProgress();
  const label = tr(RANK_LABELS[p.id]);
  return (
    <div className="pm-rang" {...tipProps(label, detail(p))}>
      <span className="pm-rang-name">🎖 {label}</span>
      {p.next != null && (
        <span className="pm-rang-gauge" aria-hidden="true">
          <i style={{ width: `${Math.round(p.frac * 100)}%` }} />
        </span>
      )}
    </div>
  );
}
