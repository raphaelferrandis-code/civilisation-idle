import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { PLAISIRS_SPOTS, spotIsOpen, spotIsFullFrame, spotIsVisit, spotCanVisit, spotRankLock, spotVerbe } from './plaisirs/anchors.js';
import SalleCanvas from './plaisirs/SalleCanvas.jsx';
import { tableVars } from '../ui/plaisirsMaterial.js';
import { useSalleBake } from './plaisirs/salleBake.js';
import { eraBandOf } from '../../game/data/eraThemes.js';
import { currentEraIndex } from '../../game/core/mechanics/shared.js';
import { openTempleGame, closeTempleStage } from '../../game/core/templeGames.js';
import { REGULATION_ACTIONS } from '../../game/data/regulationActions.js';
import RegulationStage from '../ui/RegulationStage.jsx';
// Le MENU : un tableau d'étages calqué sur la coupe, la bourse en tête et les
// automatisations (l'ancien pupitre du temple) sur la ligne de leur jeu.
import PlaisirsMenu from './plaisirs/PlaisirsMenu.jsx';
// LA SCÈNE JOUE (2026-10-03) : une petite mélodie à chaque visite, et l'affiche du
// morceau qui tourne, qu'on change d'un pas (dossier src/assets/musiques/).
import SceneJukebox from './plaisirs/SceneJukebox.jsx';
import { jouerMelodieScene } from '../../game/audio/melodieScene.js';

// L'échoppe s'ouvre DANS la salle, en plein cadre. Chargée paresseusement comme
// dans App.jsx : elle reste aussi son propre onglet (Raph veut les deux accès),
// et `import()` est idempotent — les deux chemins partagent le même module, il
// n'est pas téléchargé deux fois.
const HeritageView = lazy(() => import('./HeritageView.jsx'));

/**
 * La Maison des Plaisirs — écran de HUB, pas une page de boutons.
 *
 * ⭐ Depuis la refonte du 2026-10-02 (docs/PLAN-MAISON-DES-PLAISIRS.md, phase 2),
 * la salle n'est plus une illustration fixe : c'est la COUPE DU BÂTIMENT, de face,
 * PEINTE PAR LE CODE à l'âge de la ville — un étage par jeu, autant d'étages que de
 * plateaux dehors (iso/plaisirsCoupeHD.js, plaisirs/SalleCanvas.jsx). Le survol et le
 * clic tombent au pixel du lieu ; les ancres du bouton d'action se lisent sur la
 * cuisson (centre et cadre de chaque lieu), plus à la main.
 *
 * Des lieux qu'on clique. Le jeu s'ouvre PAR-DESSUS et
 * l'illustration reste visible derrière (arbitrage Raph) : on ne quitte jamais
 * le lieu, refermer ramène au hub.
 *
 * MENU FLOTTANT à gauche : sans lui, rien ne dit au joueur ce qui est cliquable
 * dans une illustration, et il balaie l'image à la souris en espérant tomber
 * dessus. Le menu donne la liste, et DÉSIGNE l'endroit sur l'image —
 * survoler une entrée allume le lieu sans rien ouvrir, ce qui apprend la salle.
 * Il rend aussi le hub utilisable au clavier, ce qu'une image seule interdit.
 *
 * Deux états, et c'est la distinction qui fait tout l'intérêt :
 *   survol    — passager, éteint dès qu'on s'éloigne ;
 *   selection — posé par le clic, reste allumé pendant qu'on joue.
 *
 * Géométrie : les ancres vivent en PIXELS SOURCE de l'illustration
 * (plaisirs/anchors.js) et sont converties ici en POURCENTAGES. C'est ce qui
 * rend le hub indépendant de la taille d'affichage — mettre l'image à l'échelle
 * ne décale aucun point, et il n'y a rien à recalibrer entre un écran large et
 * un téléphone.
 *
 * CALIBRAGE : `window.__plaisirsAnchors = true` en console, puis chaque clic sur
 * l'illustration journalise ses coordonnées SOURCE, prêtes à recopier dans le
 * fichier d'ancres. Poser cinq points chauds à la main sans ça, c'est viser à
 * l'aveugle.
 */
export default function PlaisirsView() {
  const [survol, setSurvol] = useState(null);
  const [selection, setSelection] = useState(null);
  // Lieu occupant le cadre entier (l'échoppe), ou null : on est alors sur
  // l'illustration.
  const [plein, setPlein] = useState(null);

  // ⚠⚠ ABONNEMENT AUX VERROUS. `spotIsOpen` lit l'état du jeu AU RENDU, et cette
  // vue ne s'abonnait à rien : mesuré le 2026-08-07, porter la partie à l'ère 6
  // ne dégrisait ni le vingt-et-un ni Icare tant qu'on ne quittait pas l'onglet.
  // Un lieu qui reste gris alors qu'on vient de le débloquer se lit comme une
  // panne — et c'est justement le moment où le joueur vient voir.
  // On s'abonne à la SIGNATURE des verrous eux-mêmes, pas aux champs d'état qui
  // les alimentent : le jour où un jeu change de condition d'ouverture, il n'y a
  // rien à mettre à jour ici. Le re-rendu n'a lieu que si la chaîne change.
  // Lot 3 : les verrous de TITRE (le salon, le boudoir) en font partie.
  const verrous = useGameState(() => PLAISIRS_SPOTS.map((s) => (spotIsOpen(s) ? '1' : spotRankLock(s) != null ? 'r' : '0')).join(''));
  // L'ÂGE de la salle : celui de la ville (même bande que la carte), suivi en direct.
  // Molette de dev partagée avec la carte : `__plaisirsTune.band = n` force l'âge.
  const band = useGameState(() => {
    const t = typeof window !== 'undefined' ? window.__plaisirsTune : null;
    return t && t.band != null ? t.band | 0 : eraBandOf(currentEraIndex());
  });
  // Ce que la salle MONTRE : chaque table dont le jeu est ouvert (la scène est
  // toujours là, ses musiciens jouent pour le décor).
  const open = { scene: true };
  PLAISIRS_SPOTS.forEach((sp, i) => { if (sp.kind || sp.view) open[sp.id] = verrous[i] === '1'; });
  const bake = useSalleBake(band, open);
  // Où la salle est posée dans le cadre (facteur, origine) : rapporté par le canevas.
  const [mise, setMise] = useState(null);
  // La largeur masquée par le menu volant, pour que la salle se centre à côté.
  const menuRef = useRef(null);
  const [padLeft, setPadLeft] = useState(0);
  useEffect(() => {
    const m = menuRef.current;
    if (!m || typeof ResizeObserver === 'undefined') return undefined;
    const upd = () => {
      const sec = m.parentElement && m.parentElement.getBoundingClientRect(), r = m.getBoundingClientRect();
      const cadre = m.parentElement && m.parentElement.firstElementChild, fr = cadre && cadre.getBoundingClientRect();
      // Menu posé SUR la salle (grand écran) : on la décale ; menu passé dessous
      // (écran étroit, views-plaisirs.css) : rien à décaler. ⚠ Comparé au BAS DU
      // CADRE, pas à la hauteur de la section : sur téléphone la section contient
      // aussi le menu (plus haut que le cadre), et le menu « dessous » passait pour
      // posé dessus — la coupe se tassait dans 60 % de la largeur, à l'échelle 1.
      setPadLeft(sec && fr && r.top < fr.bottom - 8 ? Math.max(0, r.right - sec.left + 8) : 0);
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(m);
    if (m.parentElement) ro.observe(m.parentElement);
    return () => ro.disconnect();
  }, []);
  // Ancre d'un lieu : celle de la coupe cuite, ramenée en pixels CSS du cadre
  // (centre, rayon, haut du lieu).
  const geo = (spot) => {
    const g = bake && bake.spots[spot.id];
    if (!g || !mise) return null;
    const k = mise.Z / mise.dpr, oy = mise.oy / mise.dpr;
    return { x: (mise.ox / mise.dpr) + (g.x + 0.5) * k, y: oy + (g.y + 0.5) * k, r: g.r * k, top: oy + g.box.y0 * k };
  };
  // Seuls les LIEUX du menu s'allument au survol — jeux, boutique, et depuis le
  // tableau d'étages les lieux qu'on regarde (scène, boudoir, salon).
  const survoler = (id) => setSurvol(id && PLAISIRS_SPOTS.some((sp) => sp.id === id) ? id : null);

  // DEUX TEMPS, et c'est voulu (Raph, 2026-08-07) : choisir un lieu ne lance
  // rien, ça pose son bouton d'action SUR l'illustration, au niveau du lieu.
  // C'est ce bouton qui engage la partie. On évite ainsi de basculer dans un jeu
  // d'un clic distrait sur le décor, et le lieu se laisse regarder avant qu'on y
  // joue.
  const choisir = (spot) => {
    if (!spotIsOpen(spot)) return;
    setSelection(spot.id);
  };

  const lancer = (spot) => {
    if (!spotIsOpen(spot)) return;
    setSelection(spot.id);
    if (spotIsFullFrame(spot)) {
      // ⚠ On FERME la partie en cours, symétrique de ce que fait la branche
      // « jeu » juste en dessous. Sans ça, la scène du jeu — posée en calque
      // par-dessus la salle — restait montée SUR la boutique : mesuré, les
      // rayons de l'échoppe se retrouvaient sous les cartes de mise, et la
      // boutique paraissait ne pas s'ouvrir alors qu'elle était bien là.
      closeTempleStage();
      setPlein(spot.id);
      return;
    }
    // Un jeu se joue par-dessus l'illustration : on quitte donc le plein cadre,
    // sinon la partie s'ouvrirait derrière l'échoppe restée affichée.
    setPlein(null);
    // ⚠ LES OSSELETS SONT LE SEUL JEU À PARAMÈTRE. La table d'augures attend
    // l'identifiant du pari (openAuguryTable(id)) ; les trois autres s'ouvrent
    // les mains vides. Sans lui, la scène montait sans sa table : le jeu
    // s'affichait mais AUCUNE MISE n'apparaissait, et rien ne signalait la
    // panne. L'identifiant est lu dans la table des actions plutôt qu'écrit en
    // dur, pour qu'un renommage côté données ne le casse pas en silence.
    const req = spot.kind === 'augury' ? { id: (REGULATION_ACTIONS.find((a) => a.kind === 'gamble') || {}).id } : {};
    openTempleGame(spot.kind, req);
  };

  const revenir = () => { setPlein(null); setSelection(null); };

  // Un lieu qu'on REGARDE (scène, boudoir, salon) : il n'ouvre rien, la coupe
  // défile jusqu'à lui (`focus`). La partie en cours se referme — son panneau
  // couvrirait ce qu'on est venu voir (une main de vingt-et-un se reprend à la
  // réouverture, un vol d'Icare se résout seul).
  const regarder = (spot) => {
    if (spotRankLock(spot) != null) return; // le boudoir attend son titre
    closeTempleStage();
    setPlein(null);
    setSelection(spot.id);
    if (spot.id === 'scene') jouerMelodieScene(band);
  };
  // Viser un lieu sur la COUPE (clic, clavier) : on le regarde ou on le choisit.
  const viser = (spot) => (spotIsVisit(spot) ? regarder(spot) : choisir(spot));

  // Depuis le MENU, un clic OUVRE le lieu (Raph, 2026-10-04 : « il faut que les
  // boutons du menu fonctionnent ») : chaque ligne porte son verbe (Jouer, Jeter,
  // Voler…), elle fait ce qu'elle dit. Les deux temps ne valent plus que pour le
  // DÉCOR, où un clic distrait est possible ; depuis le menu le geste est délibéré
  // (on a lu un nom et on l'a touché), et ouvrir une table n'engage aucune mise.
  // Avant : hors partie, le menu ne faisait que CHOISIR le lieu et posait un bouton
  // d'action sur l'illustration (2026-08-07) ; seule la boutique s'ouvrait d'un tap
  // (« l'échoppe n'amène pas à la boutique »).
  const depuisMenu = (spot) => (spotIsVisit(spot) ? regarder(spot) : lancer(spot));

  return (
    // ⚠ `view active` et pas `view` seul : `.view` est masquée par défaut
    // (views-shop-myths.css), c'est `.active` qui l'affiche. Toutes les vues du
    // projet ouvrent sur ce couple, et l'oublier donne un onglet parfaitement
    // vide, sans la moindre erreur en console.
    <section className="view active" id="plaisirs">
      <div
        style={{
          position: 'relative',
          // PLEIN CADRE. L'ancien plafond à 3x la taille native bridait
          // l'illustration au milieu d'un grand écran. `aspectRatio` + une
          // hauteur maximale suffisent : le navigateur réduit la largeur tout
          // seul quand la fenêtre est basse, et le ratio reste exact — ce qui
          // est vital ici, puisque les points chauds sont placés en POURCENTAGE
          // du cadre. Déformer l'image les décalerait tous.
          width: '100%',
          maxHeight: 'calc(100vh - 96px)',
          margin: '0 auto',
          // En plein cadre, le ratio de l'illustration ne s'applique plus : une
          // page à trois armoires n'a aucune raison de tenir dans un 16:9.
          // La coupe est plus haute que large et DÉFILE d'étage en étage : le cadre
          // prend toute la hauteur offerte, dans un 5:4 sur écran étroit.
          aspectRatio: plein ? undefined : '5 / 4',
          minHeight: plein ? 'calc(100vh - 96px)' : undefined,
          // Le fond du cadre : l'eau du fleuve, le temps que la salle se peigne
          // (et les bandes d'appoint quand le facteur entier ne remplit pas tout).
          background: '#3f6a86',
          borderRadius: 4,
          overflow: 'hidden'
        }}
      >
        {/* LA SALLE, peinte par le code. Elle reçoit les lieux allumés (survol,
            sélection) et rend le lieu sous la souris, au pixel. */}
        {!plein && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <SalleCanvas
              bake={bake}
              band={band}
              padLeft={padLeft}
              focus={selection}
              onLayout={setMise}
              lit={[survol, selection].filter(Boolean)}
              onHover={survoler}
              onPick={(id) => { const spot = PLAISIRS_SPOTS.find((sp) => sp.id === id); if (spot) viser(spot); }}
            />
          </div>
        )}
        {/* L'ÉCHOPPE EN PLEIN CADRE. Elle remplace l'illustration ; le menu, lui,
            reste monté plus bas et flotte par-dessus — c'est ce qui empêche de
            sortir de la Maison des Plaisirs sans l'avoir voulu. */}
        {plein === 'boutique' && (
          <Suspense fallback={null}>
            {/* `zIndex: 1` et `isolation` : l'échoppe est une page entière, avec
                ses propres calques. Sans plancher explicite, un de ses éléments
                montait au-dessus du menu volant et volait ses clics — on se
                retrouvait enfermé dans la boutique, sans retour possible. */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'auto', zIndex: 1, isolation: 'isolate' }}>
              <HeritageView />
            </div>
          </Suspense>
        )}

        {/* Les points chauds n'existent QUE sur l'illustration : les laisser
            montés en plein cadre poserait des zones cliquables invisibles
            par-dessus l'échoppe. */}
        {/* Les lieux au CLAVIER : des zones invisibles posées sur chaque table (la
            souris, elle, vise au pixel dans le canevas). Le liseré d'or est peint
            par la salle quand le lieu a le focus. */}
        {!plein && PLAISIRS_SPOTS.filter((sp) => geo(sp)).map((spot) => {
          const g = geo(spot), r = g.r;
          // Un lieu qu'on regarde se vise aussi : on s'y rend (s'il a son titre).
          const ouvert = spotIsOpen(spot) || spotCanVisit(spot);
          return (
            // ⚠ Une DIV et non un <button> : le thème du projet habille les
            // boutons (fond, bordure, coins) avec assez de poids pour écraser
            // les styles en ligne — les zones sortaient en rectangles gris
            // opaques posés sur l'illustration. Une div n'hérite de rien ; le
            // rôle et la gestion clavier rendent l'accessibilité perdue.
            <div
              key={spot.id}
              role="button"
              // Un jeu pas encore ouvert reste DESSINÉ mais non cliquable.
              tabIndex={ouvert ? 0 : -1}
              aria-disabled={!ouvert}
              aria-label={spot.label}
              title={ouvert ? spot.label : `${spot.label}, bientôt`}
              onMouseEnter={() => setSurvol(spot.id)}
              onMouseLeave={() => setSurvol((s) => (s === spot.id ? null : s))}
              onFocus={() => setSurvol(spot.id)}
              onBlur={() => setSurvol((s) => (s === spot.id ? null : s))}
              onClick={(e) => { e.stopPropagation(); viser(spot); }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();      // sinon Espace fait défiler la page
                e.stopPropagation();
                viser(spot);
              }}
              style={{
                position: 'absolute',
                left: g.x - r,
                top: g.y - r,
                width: r * 2,
                height: r * 2,
                borderRadius: '50%',
                // La souris passe AU TRAVERS (le canevas vise au pixel) ; seul le
                // clavier s'arrête ici.
                pointerEvents: 'none',
                outline: 'none',
                // ⚠ PRIORITÉ ÉCRITE, plus déduite de l'ordre du tableau : les
                // tickets et la boutique partagent une ancre, et c'est `z` qui
                // décide lequel reçoit le clic (cf. anchors.js). Sans lui,
                // déplacer la boutique en fin de liste — sa place dans le menu —
                // lui aurait volé l'ancre des tickets en silence.
                zIndex: spot.z || 1,
                padding: 0,
                boxSizing: 'border-box',
                transition: 'background 120ms, box-shadow 120ms, border-color 120ms'
              }}
            />
          );
        })}

        {/* LE BOUTON D'ACTION, posé sur le lieu choisi. C'est lui qui engage la
            partie, pas le clic sur le décor. Son verbe est celui que le joueur
            connaît déjà du Temple : Jeter, Gratter, Jouer, Voler.
            Placé SOUS le point chaud (y + r) pour ne pas masquer ce qu'on vient
            de désigner. */}
        {!plein && (() => {
          const spot = PLAISIRS_SPOTS.find((sp) => sp.id === selection && geo(sp) && spotIsOpen(sp));
          if (!spot) return null;
          const g = geo(spot);
          // Le bouton se pend en HAUT du lieu, sur son mur : la table et ses
          // joueurs, au sol, restent visibles. (Sous le lieu, il tombait sur
          // l'étage d'en dessous ou hors du cadre — c'est ce qui rendait les
          // osselets muets, du temps de l'illustration.)
          return (
            <div
              // La classe porte l'effacement pendant la partie (views-plaisirs).
              // Elle ne peut pas se décider ici : la vue ne SAIT pas qu'un jeu
              // est ouvert au moment du rendu, `registerTempleStage` n'admettant
              // qu'un abonné et la scène pouvant se refermer par sa propre croix
              // ou par Échap sans prévenir personne.
              className="plaisirs-action"
              style={{
                position: 'absolute',
                left: g.x,
                top: g.top,
                transform: 'translate(-50%, 6px)',
                zIndex: 4
              }}
            >
              <button
                type="button"
                autoFocus
                onClick={(e) => { e.stopPropagation(); lancer(spot); }}
                title={spot.label}
              >
                {spotVerbe(spot)}
              </button>
            </div>
          );
        })()}

        {/* La scène choisie : l'affiche du morceau (◀ titre ▶), au même endroit
            que le bouton d'action d'un jeu. */}
        {!plein && selection === 'scene' && (() => {
          const g = geo(PLAISIRS_SPOTS.find((sp) => sp.id === 'scene'));
          return g ? <SceneJukebox x={g.x} y={g.top} /> : null;
        })()}

        {/* LE JEU, EN SURIMPRESSION sur l'illustration — plus jamais à côté.
            Il ne se voit QUE lorsqu'une partie est ouverte : la scène se marque
            elle-même `is-empty` quand elle ne porte rien, et la feuille de style
            masque alors tout le calque. C'est la seule façon propre de le savoir
            d'ici, `registerTempleStage` n'admettant qu'UN abonné — m'y abonner
            aussi arracherait la scène à son propre pont. */}
        {/* Le calque porte le TAPIS et le REBORD de la table de l'âge (variables
            CSS, plaisirsMaterial.js) — la partie se joue sur la table du décor. */}
        {/* ⚠ Décalé de la largeur du menu volant quand il est posé sur la salle :
            le menu (au-dessus, pour rester atteignable) recouvrait la première
            mise — un défaut relevé au constat du 2026-10-02. */}
        <div className="plaisirs-stage" data-age={band} style={{ ...tableVars(band), left: padLeft }}>
          <RegulationStage />
        </div>
      </div>

      {/* MENU DES LIEUX — SŒUR DE LA SALLE, PLUS SON ENFANT.
          Il flotte toujours sur l'illustration (la feuille de style le pose en
          absolu, et la section est son repère : la salle en occupe toute la
          largeur, donc les deux boîtes ont le même bord gauche et la même
          hauteur — le rendu sur grand écran est au pixel près celui d'avant).

          ⚠⚠ POURQUOI IL A FALLU LE SORTIR. La salle est une boîte À RATIO FIXE
          (`aspectRatio` de l'illustration) avec `overflow: hidden` : sa hauteur
          est dictée par sa largeur. Le menu, lui, est une colonne de boutons de
          381px de haut qui ne se met pas à l'échelle — c'est de l'interface, pas
          du décor. Les deux vont bien ensemble tant que la salle est haute ;
          en dessous de ~700px de large elle passe sous 381px et le menu, centré,
          se faisait ROGNER des deux côtés par le `overflow: hidden` de son
          parent. Mesuré à 390px : salle 365×198, menu 208×381 posé à −32 — il ne
          restait qu'une bande du milieu, ce que montrait la capture de Raph.
          ⚠ Et ce n'était PAS un défaut tactile : la même chose se produisait au
          curseur dans une fenêtre étroite. Le remède ne pouvait pas vivre dans
          la coquille tactile.
          Sorti du cadre, il peut redescendre SOUS l'illustration quand la place
          manque (cf. la bascule de views-plaisirs.css) sans que l'image ait à se
          déformer ni les points chauds à se recalibrer.

          Depuis le 2026-10-03 : un TABLEAU D'ÉTAGES calqué sur la coupe cuite
          (plaisirs/PlaisirsMenu.jsx). */}
      <PlaisirsMenu
        navRef={menuRef}
        bake={bake}
        band={band}
        survol={survol}
        selection={selection}
        plein={plein}
        onHover={(id, quitte) => (quitte ? setSurvol((s) => (s === quitte ? null : s)) : setSurvol(id))}
        onPick={depuisMenu}
        onBack={revenir}
      />

    </section>
  );
}
