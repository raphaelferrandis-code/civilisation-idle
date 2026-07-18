import { useGameState } from '../../hooks/useGameState.js';
import { COLLAPSE_PREP_MAX } from '../../game/core/balance.js';
import {
  currentEraIndex,
  ruinGain,
  ruinMultiplier,
  heritageQuality,
  totalBuildingCount,
  globalMultiplier
} from '../../game/core/mechanics.js';
import { eras } from '../../game/data/world.js';
import { renderCache, state } from '../../game/core/state.js';
import { idleCapSeconds } from '../../game/core/main.js';
import { fmt } from '../../game/core/utils.js';
import { D } from '../../game/core/num.js';
import { tr } from '../../game/core/i18n.js';
import { getMythById } from '../../game/data/myths.js';
import { GRAND_RESET_MILESTONES } from '../../game/core/mechanics/grandResetMilestones.js';
import PixelIcon from '../ui/PixelIcon.jsx';

// Chiffres romains pour les Grands Resets & actes de Mythes (1..11).
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
const romanOf = (n) => ROMAN[n] || String(n);
const actLabel = (act) => act === "ragnarok"
  ? "Ragnarök"
  : tr({ fr: `Acte ${romanOf(act)}`, en: `Act ${romanOf(act)}` });

// Durées façon horloge (même convention que l'encart latéral) : seules les
// unités utiles s'affichent, zéro-paddées dès qu'une unité supérieure existe.
function fmtDuration(totalSecs) {
  const s = Math.floor(totalSecs) % 60;
  const m = Math.floor(totalSecs / 60) % 60;
  const h = Math.floor(totalSecs / 3600) % 24;
  const j = Math.floor(totalSecs / 86400);
  const pad = (n) => String(n).padStart(2, '0');
  if (j > 0) return `${j}j ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

// Compteurs entiers (bâtiments…) : pas de décimale parasite sous 1000 (« 0.0 »),
// format compact (fmt) au-delà.
function fmtCount(n) {
  const v = Number(n) || 0;
  return v < 1000 ? String(Math.floor(v)) : fmt(v);
}

// Tuile de statistique du Bilan : libellé, valeur, icône et infobulle optionnelles.
function StatTile({ label, value, icon, hint }) {
  return (
    <div className="chronicle-bilan-stat" title={hint}>
      <span>{label}</span>
      <strong>{value}{icon && <> <PixelIcon name={icon} /></>}</strong>
    </div>
  );
}

// Groupe titré du Bilan : intitulé + filet, puis grille de tuiles compactes.
function StatSection({ title, hint, children }) {
  return (
    <div className="chronicle-bilan-section">
      <div className="chronicle-bilan-head" title={hint}>
        <h3>{title}</h3>
      </div>
      <div className="chronicle-bilan-grid">{children}</div>
    </div>
  );
}

// Bilan de la Civilisation — les statistiques idle de la partie (cycle en
// cours / records / projection d'effondrement / dynastie). Déplacé ici depuis
// l'onglet Effondrement (demande Raph 2026-07-10) : la Chronique est le
// registre de la civilisation. playTimeSec avance chaque tick : il sert aussi
// d'horloge de re-render pour les durées affichées.
function CivilizationReview() {
  const population = useGameState(s => s.population);
  const ruins = useGameState(s => s.ruins);
  const collapsePreparation = useGameState(s => s.collapsePreparation);
  const cycles = useGameState(s => s.cycles);
  const grandResetCount = useGameState(s => s.grandResetCount);
  const bestEraIndex = useGameState(s => s.bestEraIndex);
  const cycleStartedAt = useGameState(s => s.cycleStartedAt);
  const cycleCrisesResolved = useGameState(s => s.cycleCrisesResolved);
  const lifetimePurchases = useGameState(s => s.lifetimePurchases);
  const playTimeSec = useGameState(s => s.playTimeSec);
  const cyclePeaks = useGameState(s => s.cyclePeaks) || {};
  const wondersCount = useGameState(s => (s.wonders || []).length);
  const mythsCount = useGameState(s => Object.values(s.mythsCompleted || {}).filter(Boolean).length);

  const projectedRuin = ruinGain(true);
  const cycleSeconds = Math.max(0, Math.floor((renderCache.tickNow - (cycleStartedAt || renderCache.tickNow)) / 1000));

  return (
    <div className="panel chronicle-bilan-panel">
      <div className="panel-heading">
        <div>
          <h2>{tr({ fr: "Bilan de la Civilisation", en: "Civilization Review" })}</h2>
        </div>
      </div>

      <StatSection title={tr({ fr: "Cycle en cours", en: "Current cycle" })}>
        <StatTile
          label={tr({ fr: "Temps de cycle", en: "Cycle time" })}
          value={fmtDuration(cycleSeconds)}
          icon="glyphs/temps"
          hint={tr({ fr: "Durée du cycle actuel, depuis la fondation de cette cité.", en: "Duration of the current cycle, since this city was founded." })}
        />
        <StatTile label={tr({ fr: "Âge actuel", en: "Current age" })} value={eras[currentEraIndex()].name} />
        <StatTile label={tr({ fr: "Population", en: "Population" })} value={fmt(population)} />
        <StatTile label={tr({ fr: "Bâtiments debout", en: "Standing buildings" })} value={fmtCount(totalBuildingCount())} />
        <StatTile
          label={tr({ fr: "Multi. de production", en: "Production multi." })}
          value={`x${fmt(globalMultiplier())}`}
          icon="glyphs/mult"
          hint={tr({ fr: "Multiplicateur global appliqué à toute la production (ruines, ères, merveilles, routes…).", en: "Global multiplier applied to all production (ruins, eras, wonders, roads…)." })}
        />
        <StatTile
          label={tr({ fr: "Crises stabilisées", en: "Crises stabilized" })}
          value={cycleCrisesResolved || 0}
          hint={tr({ fr: "Crises narratives stabilisées ce cycle : chacune bonifie les ruines à l'effondrement.", en: "Narrative crises stabilized this cycle: each one boosts the ruins on collapse." })}
        />
      </StatSection>

      <StatSection
        title={tr({ fr: "Records du cycle", en: "Cycle records" })}
        hint={tr({ fr: "Les pics du cycle nourrissent le gain de ruines à l'effondrement.", en: "Cycle peaks feed the ruin gain on collapse." })}
      >
        <StatTile label={tr({ fr: "Pic de population", en: "Population peak" })} value={fmt(cyclePeaks.population || 0)} />
        <StatTile label={tr({ fr: "Pic de nourriture", en: "Food peak" })} value={fmt(cyclePeaks.food || 0)} />
        <StatTile label={tr({ fr: "Pic de trésor", en: "Treasury peak" })} value={fmt(cyclePeaks.gold || 0)} />
        <StatTile label={tr({ fr: "Pic de savoir", en: "Knowledge peak" })} value={fmt(cyclePeaks.knowledge || 0)} />
        <StatTile label={tr({ fr: "Pic d'infrastructure", en: "Infrastructure peak" })} value={fmt(cyclePeaks.infrastructure || 0)} />
      </StatSection>

      <StatSection title={tr({ fr: "À l'effondrement", en: "On collapse" })}>
        <StatTile
          label={tr({ fr: "Ruines si effondrement", en: "Ruins if collapse" })}
          value={fmt(projectedRuin)}
          icon="glyphs/ruines"
          hint={tr({ fr: "Ruines obtenues si la cité s'effondrait à cet instant. Tenir plus longtemps et chuter plus profond rapporte davantage.", en: "Ruins gained if the city collapsed right now. Holding out longer and falling deeper yields more." })}
        />
        <StatTile
          label={tr({ fr: "Héritage préparé", en: "Heritage prepared" })}
          value={`+${fmt(Math.min(COLLAPSE_PREP_MAX, collapsePreparation || 0) * 100)}%`}
          hint={tr({ fr: "Bonus de ruines accumulé par les préparations de ce cycle.", en: "Ruin bonus accumulated through this cycle's preparations." })}
        />
        <StatTile label={tr({ fr: "Qualité d'héritage", en: "Heritage quality" })} value={heritageQuality()} />
      </StatSection>

      <StatSection title={tr({ fr: "Cycles & mémoire", en: "Cycles & memory" })}>
        <StatTile label={tr({ fr: "Cycles accomplis", en: "Cycles completed" })} value={cycles} icon="glyphs/cycles" />
        {grandResetCount > 0 && (
          <StatTile label={tr({ fr: "Grands Resets", en: "Grand Resets" })} value={grandResetCount} />
        )}
        <StatTile label={tr({ fr: "Ruines en réserve", en: "Ruins in reserve" })} value={fmt(ruins)} icon="glyphs/ruines" />
        <StatTile
          label={tr({ fr: "Bonus de production", en: "Production bonus" })}
          value={`x${fmt(ruinMultiplier())}`}
          hint={tr({ fr: "Multiplicateur permanent conféré par les ruines en réserve.", en: "Permanent multiplier granted by the ruins in reserve." })}
        />
        <StatTile label={tr({ fr: "Meilleur âge atteint", en: "Best age reached" })} value={eras[bestEraIndex].name} icon="glyphs/trophee" />
        <StatTile
          label={tr({ fr: "Temps de jeu (ce prestige)", en: "Play time (this prestige)" })}
          value={fmtDuration(playTimeSec || 0)}
          icon="glyphs/temps"
          hint={tr({ fr: "Temps de jeu actif depuis le dernier Grand Reset (repart à zéro au GR).", en: "Active play time since the last Grand Reset (resets to zero at GR)." })}
        />
        <StatTile
          label={tr({ fr: "Temps de jeu (à vie)", en: "Lifetime play time" })}
          value={fmtDuration((state.chronicleStats?.lifetimePlaySec) || 0)}
          icon="glyphs/temps"
          hint={tr({ fr: "Horloge de jeu à vie : ne se réinitialise jamais. C'est elle qui horodate les déblocages de Grand Reset et les Mythes.", en: "Lifetime play clock: never resets. It timestamps Grand Reset unlocks and Myths." })}
        />
        <StatTile label={tr({ fr: "Bâtiments bâtis (à vie)", en: "Buildings built (lifetime)" })} value={fmtCount(lifetimePurchases)} />
        <StatTile label={tr({ fr: "Merveilles érigées", en: "Wonders erected" })} value={wondersCount} />
        <StatTile label={tr({ fr: "Mythes accomplis", en: "Myths completed" })} value={mythsCount} />
        <StatTile
          label={tr({ fr: "Plafond hors-ligne", en: "Offline cap" })}
          value={`${Math.round(idleCapSeconds() / 3600)} h`}
          hint={tr({ fr: "La cité produit et vieillit en ton absence, jusqu'à ce plafond. Étends-le avec « Veilleurs de nuit ».", en: "The city produces and ages while you're away, up to this cap. Extend it with « Night Watchers »." })}
        />
      </StatSection>
    </div>
  );
}

// Les 4 jeux du temple, avec leur emblème (les emojis des floats en jeu) et
// leurs temps forts propres. `hl` reçoit l'objet de stats du jeu.
const GAME_DEFS = [
  {
    key: "osselets", emoji: "🎲", name: { fr: "Osselets", en: "Knucklebones" },
    hl: (g) => [
      tr({ fr: `${fmtCount(g.venus)} Coups de Vénus`, en: `${fmtCount(g.venus)} Venus throws` }),
      tr({ fr: `${fmtCount(g.dog)} Chiens`, en: `${fmtCount(g.dog)} Dogs` })
    ]
  },
  {
    key: "icarus", emoji: "🪽", name: { fr: "Vol d'Icare", en: "Icarus's Flight" },
    hl: (g) => [
      g.bestMult > 1
        ? tr({ fr: `plus haut ×${g.bestMult.toFixed(2)}`, en: `best ×${g.bestMult.toFixed(2)}` })
        : tr({ fr: "aucun retrait", en: "no cash-out" }),
      tr({ fr: `${fmtCount(g.jackpots)} jackpots`, en: `${fmtCount(g.jackpots)} jackpots` }),
      tr({ fr: `${fmtCount(g.crashes)} chutes`, en: `${fmtCount(g.crashes)} crashes` })
    ]
  },
  {
    key: "scratch", emoji: "🎟️", name: { fr: "Tickets à gratter", en: "Scratch Tickets" },
    hl: (g) => [
      tr({ fr: `${fmtCount(g.venus)} triples Vénus`, en: `${fmtCount(g.venus)} triple Venus` }),
      tr({ fr: `${fmtCount(g.soleil)} triples Soleil`, en: `${fmtCount(g.soleil)} triple Suns` })
    ]
  },
  {
    key: "blackjack", emoji: "🃏", name: { fr: "Vingt-et-un", en: "Twenty-One" },
    hl: (g) => [
      tr({ fr: `${fmtCount(g.naturals)} naturels`, en: `${fmtCount(g.naturals)} naturals` }),
      tr({ fr: `série max ${fmtCount(g.bestStreak)}`, en: `best streak ${fmtCount(g.bestStreak)}` })
    ]
  }
];

// Carte d'un jeu : parties, bilan gain/perte NET (mis en avant), mise/gain +
// taux de retour, plus gros gain, et les temps forts propres au jeu.
function GameStatCard({ def, g }) {
  const wagered = g.wagered || 0;
  const won = g.won || 0;
  const net = won - wagered;
  const rtp = wagered > 0 ? Math.round((won / wagered) * 100) : null;
  const netCls = net > 0 ? "is-gain" : net < 0 ? "is-loss" : "is-flat";
  return (
    <div className="chronicle-game-card">
      <div className="chronicle-game-head">
        <span className="chronicle-game-emoji" aria-hidden="true">{def.emoji}</span>
        <h4>{tr(def.name)}</h4>
        <span className="chronicle-game-plays">{fmtCount(g.plays)} {tr({ fr: "parties", en: "plays" })}</span>
      </div>
      <div className={`chronicle-game-net ${netCls}`}>
        <strong>{net >= 0 ? "+" : "−"}{fmt(Math.abs(net))}</strong>
        <span>{tr({ fr: "faveur nette", en: "net favor" })}{rtp != null && ` · ${tr({ fr: "retour", en: "return" })} ${rtp}%`}</span>
      </div>
      <div className="chronicle-game-line">
        {tr({ fr: "Misé", en: "Wagered" })} {fmt(wagered)} · {tr({ fr: "Gagné", en: "Won" })} {fmt(won)} · {tr({ fr: "Plus gros", en: "Biggest" })} {fmt(g.biggest || 0)}
      </div>
      <div className="chronicle-game-hl">{def.hl(g).join(" · ")}</div>
    </div>
  );
}

// Registre du Temple & records — les stats à vie demandées : jeux, économie de
// Faveur, superlatifs, et les frises horodatées des Grands Resets et des Mythes.
// Re-render piloté par l'horloge à vie (primitive qui change chaque seconde) ;
// le registre lui-même est lu en direct depuis `state` (les mutations en place
// des compteurs ne changent pas la référence, donc pas de sélecteur d'objet).
function TempleRegistry() {
  useGameState((s) => Math.floor((s.chronicleStats?.lifetimePlaySec) || 0));
  const cs = state.chronicleStats;
  if (!cs || !cs.games) return null;
  const mythsCompleted = state.mythsCompleted || {};

  const games = cs.games;
  const totalPlays = GAME_DEFS.reduce((n, d) => n + (games[d.key]?.plays || 0), 0);
  const hasFaveur = (cs.faveurEarned || 0) > 0 || (cs.offeringsCollected || 0) > 0 || (cs.faveurSpentShop || 0) > 0;
  const hasRecords = (cs.longestCycleSec || 0) > 0 || (cs.mostCrisesInCycle || 0) > 0 || cs.biggestRuinGain !== "0" || (cs.fastestEraGainSec || 0) > 0;

  // Frise des Grands Resets : un rang par GR découvert OU accompli.
  const grRows = GRAND_RESET_MILESTONES.map((m) => {
    const t = cs.grTimings?.[m.gr];
    // Ordre-libre : « accompli » = ce sceau précis est réclamé (grClaimed), plus
    // « gr ≤ compteur » (les sceaux ne se prennent plus dans l'ordre).
    const done = Boolean(state.grClaimed && state.grClaimed[m.gr]);
    if (!t && !done) return null;
    const revealed = done || (t && t.discovered != null);
    const parts = [];
    if (t?.discovered != null) parts.push(tr({ fr: `débloqué à ${fmtDuration(t.discovered)}`, en: `unlocked at ${fmtDuration(t.discovered)}` }));
    else if (done) parts.push(tr({ fr: "débloqué avant le suivi", en: "unlocked before tracking" }));
    if (t?.performed != null) parts.push(tr({ fr: `accompli à ${fmtDuration(t.performed)}`, en: `performed at ${fmtDuration(t.performed)}` }));
    else if (done) parts.push(tr({ fr: "accompli avant le suivi", en: "performed before tracking" }));
    else parts.push(tr({ fr: "pas encore relancé", en: "not yet performed" }));
    return { gr: m.gr, name: revealed ? tr(m.name) : "???", system: tr(m.system), meta: parts.join(" · ") };
  }).filter(Boolean);

  // Chronologie des Mythes : les accomplis horodatés d'abord (par ordre de
  // sacre), puis ceux d'avant le suivi.
  const timedMyths = Object.entries(cs.mythTimings || {})
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const timedIds = new Set(timedMyths.map((r) => r.id));
  const untimedMyths = Object.keys(mythsCompleted).filter((id) => mythsCompleted[id] && !timedIds.has(id));
  const mythName = (id) => { const m = getMythById(id); return m ? tr(m.name) : id; };
  const mythAct = (id) => { const m = getMythById(id); return m ? actLabel(m.act) : ""; };
  const totalMyths = timedMyths.length + untimedMyths.length;

  if (!totalPlays && !hasFaveur && !hasRecords && !grRows.length && !totalMyths) return null;

  return (
    <div className="panel chronicle-bilan-panel">
      <div className="panel-heading">
        <div>
          <h2>{tr({ fr: "Registre du Temple & Records", en: "Temple Registry & Records" })}</h2>
        </div>
      </div>

      {totalPlays > 0 && (
        <div className="chronicle-bilan-section">
          <div
            className="chronicle-bilan-head"
            title={tr({ fr: "Cumul à vie par jeu : le bilan net = Faveur gagnée moins misée.", en: "Lifetime totals per game: net = Favor won minus wagered." })}
          >
            <h3>{tr({ fr: "Jeux du temple", en: "Temple games" })}</h3>
          </div>
          <div className="chronicle-game-grid">
            {GAME_DEFS.map((def) => <GameStatCard key={def.key} def={def} g={games[def.key]} />)}
          </div>
        </div>
      )}

      {hasFaveur && (
        <StatSection title={tr({ fr: "Économie de Faveur", en: "Favor economy" })}>
          <StatTile label={tr({ fr: "Faveur gagnée (à vie)", en: "Favor earned (lifetime)" })} value={fmt(cs.faveurEarned || 0)} />
          <StatTile label={tr({ fr: "Dépensée à la Boutique", en: "Spent at the Shop" })} value={fmt(cs.faveurSpentShop || 0)} />
          <StatTile label={tr({ fr: "Offrandes récoltées", en: "Offerings collected" })} value={fmt(cs.offeringsCollected || 0)} />
          <StatTile
            label={tr({ fr: "Plus grosse cagnotte raflée", en: "Biggest pot raked" })}
            value={fmt(cs.biggestPotRaked || 0)}
            hint={tr({ fr: "La plus grosse rafle de la cagnotte du temple, décrochée d'un jackpot d'Icare (×10+).", en: "The largest sweep of the temple pot, from an Icarus jackpot (×10+)." })}
          />
        </StatSection>
      )}

      {hasRecords && (
        <StatSection title={tr({ fr: "Records & superlatifs", en: "Records & superlatives" })}>
          <StatTile label={tr({ fr: "Plus gros gain de ruines", en: "Biggest ruin gain" })} value={fmt(D(cs.biggestRuinGain || 0))} icon="glyphs/ruines" />
          <StatTile label={tr({ fr: "Plus long cycle tenu", en: "Longest cycle held" })} value={fmtDuration(cs.longestCycleSec || 0)} icon="glyphs/temps" />
          <StatTile label={tr({ fr: "Crises stabilisées (record)", en: "Crises stabilized (record)" })} value={fmtCount(cs.mostCrisesInCycle || 0)} />
          {(cs.fastestEraGainSec || 0) > 0 && (
            <StatTile
              label={tr({ fr: "Montée d'ère la plus rapide", en: "Fastest era climb" })}
              value={fmtDuration(cs.fastestEraGainSec)}
              hint={tr({ fr: "Le plus court temps de cycle pour décrocher un nouvel âge record.", en: "Shortest cycle time to reach a new record age." })}
            />
          )}
        </StatSection>
      )}

      {grRows.length > 0 && (
        <div className="chronicle-reg-block">
          <div className="chronicle-bilan-head">
            <h3>{tr({ fr: "Grands Resets — chronologie", en: "Grand Resets — timeline" })}</h3>
          </div>
          <ul className="chronicle-reg-list">
            {grRows.map((r) => (
              <li key={r.gr} className="chronicle-reg-row">
                <span className="chronicle-reg-badge">GR {romanOf(r.gr)}</span>
                <span className="chronicle-reg-name">{r.name}<em>{r.system}</em></span>
                <span className="chronicle-reg-meta">{r.meta}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {totalMyths > 0 && (
        <div className="chronicle-reg-block">
          <div className="chronicle-bilan-head">
            <h3>{tr({ fr: "Mythes accomplis — chronologie", en: "Myths completed — timeline" })}</h3>
            <span className="chronicle-reg-count">{fmtCount(totalMyths)}</span>
          </div>
          <ul className="chronicle-reg-list">
            {timedMyths.map((r) => (
              <li key={r.id} className="chronicle-reg-row">
                <span className="chronicle-reg-badge">{fmtCount(r.order)}</span>
                <span className="chronicle-reg-name">{mythName(r.id)}<em>{mythAct(r.id)}</em></span>
                <span className="chronicle-reg-meta">
                  {tr({ fr: `accompli à ${fmtDuration(r.at)} · run ${fmtDuration(r.runSec)}`, en: `at ${fmtDuration(r.at)} · run ${fmtDuration(r.runSec)}` })}
                </span>
              </li>
            ))}
            {untimedMyths.map((id) => (
              <li key={id} className="chronicle-reg-row is-untracked">
                <span className="chronicle-reg-badge">✓</span>
                <span className="chronicle-reg-name">{mythName(id)}<em>{mythAct(id)}</em></span>
                <span className="chronicle-reg-meta">{tr({ fr: "accompli — avant le suivi", en: "completed — before tracking" })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ChronicleView() {
  const bestEraIndex = useGameState(s => s.bestEraIndex || 0);
  const eraIdx = useGameState(() => currentEraIndex());

  // Les âges déjà atteints (sur l'ensemble des cycles) sont révélés ; le
  // suivant est annoncé en silhouette, le reste demeure inconnu.
  const revealedMax = Math.max(bestEraIndex, eraIdx);

  return (
    <section className="view active" id="history">
      <CivilizationReview />
      <TempleRegistry />

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>{tr({ fr: 'Les Âges traversés', en: 'The Ages Traversed' })}</h2>
          </div>
        </div>

        <ol className="era-timeline">
          {eras.map((era, i) => {
            if (i > revealedMax + 1) return null;
            const reached = i <= revealedMax;
            const isCurrent = i === eraIdx;
            return (
              <li
                key={era.name}
                className={`era-timeline-item${reached ? ' is-reached' : ' is-next'}${isCurrent ? ' is-current' : ''}`}
              >
                <span className="era-timeline-marker" aria-hidden="true"></span>
                <div className="era-timeline-body">
                  <div className="era-timeline-head">
                    <h3>{reached ? era.name : '???'}</h3>
                    <span className="era-timeline-pop" title={tr({ fr: 'Population requise', en: 'Population required' })}>
                      {fmt(era.at)} {tr({ fr: 'habitants', en: 'inhabitants' })}
                    </span>
                    {isCurrent && <span className="era-timeline-now">{tr({ fr: 'Âge actuel', en: 'Current Age' })}</span>}
                  </div>
                  <p>{reached ? era.text : tr({ fr: "Cet âge reste à découvrir : la population doit encore croître.", en: "This age remains to be discovered: the population must still grow." })}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {revealedMax + 1 < eras.length - 1 && (
          <p className="era-timeline-more">{tr({ fr: '… et encore de nombreux âges à traverser.', en: '… and many more ages yet to traverse.' })}</p>
        )}
      </div>
    </section>
  );
}
