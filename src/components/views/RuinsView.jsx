import { useGameState } from '../../hooks/useGameState.js';
import {
  ownedRuinBranchPurchaseCount,
  checkDogmaAvailability,
  checkNodeAvailability,
  isUnlocked,
  has
} from '../../game/core/mechanics.js';
import { buyUpgrade } from '../../game/core/actions.js';
import { upgradeById } from '../../game/core/state.js';
import {
  PRESTIGE_DOGMAS,
  PRESTIGE_TREE_BRANCHES,
  PRESTIGE_TREE
} from '../../game/data/upgrades.js';
import { fmt } from '../../game/core/utils.js';

export default function RuinsView() {
  const ruins = useGameState(s => s.ruins);

  // Pre-calculate branch counts for active branch milestones
  const branchCounts = {};
  PRESTIGE_TREE_BRANCHES.forEach(branch => {
    branchCounts[branch.id] = ownedRuinBranchPurchaseCount(branch.id);
  });

  const visibleIds = new Set(
    PRESTIGE_TREE.filter(node => {
      const upgrade = upgradeById[node.id];
      return upgrade && isUnlocked(upgrade);
    }).map(node => node.id)
  );

  return (
    <section className="view active" id="ruinsView">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Mémoire des Ruines</h2>
          </div>
          <div className="prestige-ruins-counter">
            <span className="label">Ruines Disponibles</span>
            <strong>{fmt(ruins)} 🏛️</strong>
          </div>
        </div>
        <p className="body-copy">
          Les ruines ne sont pas seulement une monnaie : elles sont des formes que les survivants reconnaissent.
          Chaque branche s'ouvre par paliers — possède assez de nœuds d'un palier pour débloquer le suivant,
          et choisis librement ta spécialisation.
        </p>

        {/* Dogmes Majeurs */}
        <div className="dogma-section" style={{ marginTop: '2rem' }}>
          <div className="dogma-heading">
            <div>
              <span className="label">Paliers culturels</span>
              <h3>Dogmes majeurs</h3>
            </div>
            <strong>Jalons de spécialisation par branche</strong>
          </div>

          <div className="dogma-grid">
            {PRESTIGE_DOGMAS.map(dogma => {
              const upgrade = upgradeById[dogma.id];
              if (!upgrade) return null;

              const status = checkDogmaAvailability(dogma.id);
              const branchCount = branchCounts[dogma.branch] || 0;
              const missing = Math.max(0, dogma.requiredPurchases - branchCount);
              const isOwned = has(dogma.id);
              const barPct = isOwned ? 100 : Math.min(100, Math.round((branchCount / dogma.requiredPurchases) * 100));
              // Nature du jalon, déduite du préfixe d'id : passif (dogma_), à
              // contrepartie (trait_) ou capacité activable (skill_).
              const isTrait = dogma.id.startsWith('trait_');
              const kind = isTrait ? 'Trait' : dogma.id.startsWith('skill_') ? 'Compétence' : 'Dogme';

              return (
                <button
                  key={dogma.id}
                  type="button"
                  className={`dogma-card ${dogma.branch} ${status}${isTrait ? ' is-trait' : ''}`}
                  disabled={status !== 'available'}
                  onClick={() => buyUpgrade(dogma.id)}
                >
                  <span className="dogma-kind-row">
                    <span className={`dogma-kind${isTrait ? ' is-trait' : ''}`}>{kind}</span>
                    <span className="tree-status">{isOwned ? "Adopté" : dogma.tier}</span>
                  </span>
                  <strong>{upgrade.name}</strong>
                  <small>{upgrade.effect}</small>
                  {isOwned ? (
                    <span className="tree-cost">Actif</span>
                  ) : (
                    <div className="dogma-progress">
                      <div className={`dogma-progress-bar ${dogma.branch}`}>
                        <span style={{ width: `${barPct}%` }}></span>
                      </div>
                      <span className="dogma-progress-label">
                        {branchCount} / {dogma.requiredPurchases}
                      </span>
                    </div>
                  )}
                  {missing > 0 ? (
                    <em>{missing} achats requis</em>
                  ) : isOwned ? null : (
                    <em>Palier atteint — adoption gratuite</em>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Arbre de Prestige */}
        <div className="prestige-tree" style={{ marginTop: '3rem' }}>
          {PRESTIGE_TREE_BRANCHES.map(branch => {
            const branchNodes = PRESTIGE_TREE.filter(node => node.branch === branch.id && visibleIds.has(node.id));
            if (branchNodes.length === 0) return null;

            const branchCount = branchCounts[branch.id] || 0;
            const maxDogma = PRESTIGE_DOGMAS
              .filter(d => d.branch === branch.id)
              .reduce((max, d) => Math.max(max, d.requiredPurchases), 0);
            
            const nextDogma = PRESTIGE_DOGMAS
              .filter(d => d.branch === branch.id && !has(d.id))
              .sort((a, b) => a.requiredPurchases - b.requiredPurchases)[0];

            const progressTarget = nextDogma ? nextDogma.requiredPurchases : maxDogma;
            const progressPct = progressTarget > 0 ? Math.min(100, Math.round((branchCount / progressTarget) * 100)) : 100;
            const progressLabel = nextDogma 
              ? `${branchCount} / ${progressTarget} vers ${nextDogma.tier}` 
              : `${branchCount} achats — tous paliers atteints`;

            return (
              <section key={branch.id} className={`tree-branch ${branch.id}`}>
                <div className="tree-branch-heading">
                  <span className="label">Branche</span>
                  <h3>{branch.name}</h3>
                  <p>{branch.hint}</p>
                  <div className="branch-progress">
                    <div className={`branch-progress-bar ${branch.id}`}>
                      <span style={{ width: `${progressPct}%` }}></span>
                    </div>
                    <span className="branch-progress-label">{progressLabel}</span>
                  </div>
                </div>
                
                <div className="tree-flow">
                  {branch.tiers.map((tierIds, tierIndex) => {
                    const tierNodes = branchNodes.filter(node => node.tier === tierIndex);
                    if (tierNodes.length === 0) return null;

                    const need = branch.unlock[tierIndex] ?? 0;
                    const ownedBelow = branchNodes.filter(node => node.tier < tierIndex && has(node.id)).length;
                    const tierOpen = ownedBelow >= need;

                    return (
                      <div className={`tree-tier ${tierOpen ? 'open' : 'gated'}`} key={tierIndex}>
                        <div className="tree-tier-head">
                          <span className="tree-tier-label">Palier {tierIndex + 1}</span>
                          {!tierOpen && (
                            <span className="tree-tier-gate">{ownedBelow} / {need} achats requis</span>
                          )}
                        </div>
                        <div className="tree-tier-nodes">
                          {tierNodes.map(node => {
                            const upgrade = upgradeById[node.id];
                            if (!upgrade) return null;

                            const status = checkNodeAvailability(node.id);
                            const conflictName = upgrade.conflictsWith ? (upgradeById[upgrade.conflictsWith]?.name || upgrade.conflictsWith) : "";

                            let statusLabel = "Verrouillé";
                            if (status === 'purchased') statusLabel = "Acheté";
                            else if (status === 'available') statusLabel = "Disponible";
                            else if (status === 'blocked') statusLabel = "Exclu";

                            return (
                              <button
                                key={node.id}
                                type="button"
                                id={`tree-node-${node.id}`}
                                className={`tree-node ${status}${node.capstone ? ' capstone' : ''}`}
                                disabled={status !== 'available'}
                                onClick={() => buyUpgrade(node.id)}
                              >
                                <span className="tree-status">{node.capstone ? `★ ${statusLabel}` : statusLabel}</span>
                                <strong>{upgrade.name}</strong>
                                <small>{upgrade.effect}</small>
                                <span className="tree-cost">
                                  {status === 'purchased' ? "Maxé" : `${fmt(node.cost.ruins)} ruines`}
                                </span>
                                {status === 'blocked' ? (
                                  <em>Exclu par : {conflictName}</em>
                                ) : conflictName ? (
                                  <em>Exclut : {conflictName}</em>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
