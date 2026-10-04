import { useGameState } from '../../../hooks/useGameState.js';
import { state } from '../../../game/core/state.js';
import { setTempleAuto } from '../../../game/core/actions.js';
import { plaisirsProgramme } from '../../../game/map/iso/plaisirsPlan.js';
import { tr } from '../../../game/core/i18n.js';
import { tipProps } from '../../ui/HelpBubble.jsx';
import AutoDials, { RateBadge } from '../../ui/TempleAutoDials.jsx';
import OffrandesBloc from './OffrandesBloc.jsx';
import { PLAISIRS_SPOTS, spotIsOpen, spotIsVisit, spotRankLock, spotVerbe } from './anchors.js';
import { RANK_LABELS } from '../../../game/core/actions/maisonRang.js';
import { MAISON_RANKS } from '../../../game/core/balance.js';

/**
 * LE MENU DE LA MAISON — un TABLEAU D'ÉTAGES (Raph, 2026-10-03 : « coller avec ce
 * qui existe vraiment, en adéquation avec le nouveau bâtiment »).
 *
 * Un étage du menu = un étage de la coupe. Les lieux sont lus dans la CUISSON de
 * la salle (`bake.spots`, chaque salle porte son `level` ; Icare = le toit, 99) :
 * le menu suit le bâtiment de l'âge sans rien recopier, et gagne un étage quand
 * la coupe en gagne un. Le toit en haut, le rez en bas, de gauche à droite dans
 * l'étage. Les étages sont séparés par une poutre de fonte rivetée et marqués du
 * cadran de laiton de l'ascenseur (R, 1, 2… T).
 *
 * Le PUPITRE DU TEMPLE (une tablette par jeu, sous la bourse) est FONDU ici : la
 * flamme d'une automatisation achetée se pose sur la ligne de son jeu, et ses
 * réglages se déplient sous la ligne quand le jeu est choisi. Une automatisation
 * pas encore achetée n'affiche rien — l'ancien pupitre alignait quatre tablettes
 * noircies qui ne faisaient rien, et doublait la liste des jeux sous d'autres noms.
 *
 * Peau du jeu (cuir au lieu choisi, or pour « Relever ») ; la lanterne rouge et
 * crème des festons — l'ADN de la Maison à tous les âges — marque le lieu choisi.
 */

// Le jeu d'un lieu → l'automatisation qui le joue (state.templeAuto).
const AUTO_OF = { augury: 'osselets', scratch: 'gratteux', blackjack: 'vingtetun', icarus: 'icarus' };
// Rang de chaque cadran dans la planche menu-cadrans.png (scripts/plaisirsMenuSprites.mjs).
const CADRANS = 'R12345T';
const ROOF = 99;

// Les étages du menu, du HAUT vers le BAS : [{ level, spots: [...] }].
function etages(bake, band) {
  const byId = new Map(PLAISIRS_SPOTS.map((sp) => [sp.id, sp]));
  const placed = [];
  if (bake && bake.spots) {
    for (const [id, g] of Object.entries(bake.spots)) if (byId.has(id)) placed.push({ id, level: g.level, x: g.x });
  } else {
    // Avant la première cuisson : le PLAN de l'âge, dont la coupe sort.
    plaisirsProgramme(band).forEach((rooms, level) => rooms.forEach((id, x) => placed.push({ id, level, x })));
    placed.push({ id: 'icare', level: ROOF, x: 0 });
  }
  // Filet : un lieu qui OUVRE quelque chose mais que la coupe ne poserait pas
  // reste joignable, au rez — mieux qu'un jeu devenu introuvable.
  const ici = new Set(placed.map((p) => p.id));
  PLAISIRS_SPOTS.forEach((sp, k) => { if (!ici.has(sp.id) && !spotIsVisit(sp)) placed.push({ id: sp.id, level: 0, x: 1e4 + k }); });
  const floors = new Map();
  for (const p of placed) {
    if (!byId.has(p.id)) continue;
    if (!floors.has(p.level)) floors.set(p.level, []);
    floors.get(p.level).push(p);
  }
  return [...floors.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([level, list]) => ({ level, spots: list.sort((a, b) => a.x - b.x).map((p) => byId.get(p.id)) }));
}

function Cadran({ level }) {
  const ch = level === ROOF ? 'T' : level === 0 ? 'R' : String(Math.min(5, level));
  return <span className="pm-cadran" aria-hidden="true" style={{ backgroundPositionX: `${-CADRANS.indexOf(ch) * 26}px` }} />;
}

export default function PlaisirsMenu({ navRef, bake, band, survol, selection, plein, onHover, onPick, onBack, onRoue }) {
  useGameState((s) => JSON.stringify(s.templeAuto || {})); // flammes et cadrans en direct
  useGameState((s) => s.maisonRank || 0); // les lieux que le titre ouvre (lot 3)
  // Une automatisation au moins : la colonne des flammes est réservée sur TOUTES
  // les lignes, sinon les noms d'un même étage partent de deux bords différents.
  const autos = Object.values(AUTO_OF).some((id) => state.templeAuto?.[id]?.unlocked);

  return (
    <nav ref={navRef} className={`plaisirs-menu${autos ? ' has-autos' : ''}`} aria-label="Les lieux de la Maison des Plaisirs">
      {/* LA BOURSE, en tête : on lit ce qu'on peut miser avant de choisir où. */}
      <OffrandesBloc onRoue={onRoue} />

      {/* Le retour n'apparaît qu'en plein cadre (l'échoppe) : sur la salle, on y est. */}
      {plein && (
        <button type="button" className="pm-back" onClick={(e) => { e.stopPropagation(); onBack(); }}>
          {tr({ fr: 'Retour à la salle', en: 'Back to the hall' })}
        </button>
      )}

      {etages(bake, band).map(({ level, spots }) => (
        <div key={level} className="pm-etage">
          <div className="pm-poutre"><Cadran level={level} /></div>
          <div className="pm-lieux">
            {spots.map((spot) => {
              const visite = spotIsVisit(spot);
              // Le titre qu'attend le lieu (le salon : Familier ; le boudoir : Mécène).
              const verrouRang = spotRankLock(spot);
              const titre = verrouRang != null ? tr(RANK_LABELS[MAISON_RANKS[verrouRang].id]) : null;
              const ouvert = (visite && verrouRang == null) || spotIsOpen(spot);
              const choisi = selection === spot.id || plein === spot.id;
              const autoId = AUTO_OF[spot.kind];
              const auto = autoId ? state.templeAuto?.[autoId] : null;
              const flamme = !!(auto && auto.unlocked && spotIsOpen(spot));
              return (
                <div
                  key={spot.id}
                  className={`pm-lieu${choisi ? ' is-sel' : ''}${survol === spot.id ? ' is-hover' : ''}${visite ? ' is-visit' : ''}`}
                  {...(titre ? tipProps(spot.label, tr({ fr: `S'ouvre au titre de ${titre}.`, en: `Opens at the title ${titre}.` })) : {})}
                >
                  {choisi && <span className="pm-lanterne" aria-hidden="true" />}
                  <button
                    type="button"
                    className="pm-go"
                    disabled={!ouvert}
                    aria-current={choisi ? 'true' : undefined}
                    title={ouvert || titre ? undefined : 'Bientôt'}
                    onMouseEnter={() => onHover(spot.id)}
                    onMouseLeave={() => onHover(null, spot.id)}
                    onFocus={() => onHover(spot.id)}
                    onBlur={() => onHover(null, spot.id)}
                    onClick={(e) => { e.stopPropagation(); onPick(spot); }}
                  >
                    <span className="pm-nom">{spot.label}</span>
                    {ouvert && <small className="pm-verbe">{spotVerbe(spot)}</small>}
                    {!ouvert && titre && <small className="pm-verbe pm-verrou">🔒 {titre}</small>}
                  </button>
                  {/* La FLAMME de l'automatisation, posée dans la marge gauche de
                      la ligne. Un bouton à part : un bouton dans un bouton est
                      du HTML invalide. */}
                  {flamme && (
                    <button
                      type="button"
                      className={`pm-flame${auto.on ? ' is-on' : ''}`}
                      {...tipProps(tr({ fr: 'Automatisation', en: 'Automation' }), () => tr({
                        fr: auto.on ? 'La flamme brûle : l’auto joue. Souffler pour la suspendre.' : 'La flamme est éteinte. Cliquer pour la rallumer.',
                        en: auto.on ? 'The flame burns: the automation plays. Blow to pause it.' : 'The flame is out. Click to relight it.'
                      }))}
                      aria-label={`${spot.label} : ${tr({ fr: 'automatisation', en: 'automation' })}`}
                      aria-pressed={!!auto.on}
                      onClick={(e) => { e.stopPropagation(); setTempleAuto(autoId, { on: !auto.on }); }}
                    >
                      <img src="/pixelart/ui/faveur/flamme.png" alt="" aria-hidden="true" draggable="false" />
                    </button>
                  )}
                  {/* Le jeu CHOISI déplie les réglages de son automatisation. */}
                  {flamme && choisi && (
                    <div className="pm-dials">
                      <AutoDials game={autoId} toggle={false} />
                      <div className="doctrine-line">
                        <span className="doctrine-line-label">{tr({ fr: 'Débit', en: 'Throughput' })}</span>
                        <RateBadge game={autoId} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="pm-poutre pm-ponton" aria-hidden="true" />
    </nav>
  );
}
