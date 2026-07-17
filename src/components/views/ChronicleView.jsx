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
import { renderCache } from '../../game/core/state.js';
import { idleCapSeconds } from '../../game/core/main.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import PixelIcon from '../ui/PixelIcon.jsx';

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
        <StatTile label={tr({ fr: "Temps de jeu total", en: "Total play time" })} value={fmtDuration(playTimeSec || 0)} icon="glyphs/temps" />
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

export default function ChronicleView() {
  const bestEraIndex = useGameState(s => s.bestEraIndex || 0);
  const eraIdx = useGameState(() => currentEraIndex());

  // Les âges déjà atteints (sur l'ensemble des cycles) sont révélés ; le
  // suivant est annoncé en silhouette, le reste demeure inconnu.
  const revealedMax = Math.max(bestEraIndex, eraIdx);

  return (
    <section className="view active" id="history">
      <CivilizationReview />

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
