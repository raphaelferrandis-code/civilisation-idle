import { useState, lazy, Suspense } from 'react';
import { PLAISIRS_ART, PLAISIRS_SPOTS, spotRadius, spotIsOpen, spotIsFullFrame, spotHasAnchor, spotVerbe } from './plaisirs/anchors.js';
import { openTempleGame } from '../../game/core/templeGames.js';
import { REGULATION_ACTIONS } from '../../game/data/regulationActions.js';
import RegulationStage from '../ui/RegulationStage.jsx';
// La bourse SEULE (Faveur + tronc), extraite d'AuguresPanel. Le panneau entier
// aurait rapporté ses quatre boutons de partie, doublons du menu, et sa colonne
// aurait mangé la largeur de l illustration.
import OffrandesBloc from './plaisirs/OffrandesBloc.jsx';

// L'échoppe s'ouvre DANS la salle, en plein cadre. Chargée paresseusement comme
// dans App.jsx : elle reste aussi son propre onglet (Raph veut les deux accès),
// et `import()` est idempotent — les deux chemins partagent le même module, il
// n'est pas téléchargé deux fois.
const HeritageView = lazy(() => import('./HeritageView.jsx'));

/**
 * La Maison des Plaisirs — écran de HUB, pas une page de boutons.
 *
 * Une illustration fixe, des lieux qu'on clique. Le jeu s'ouvre PAR-DESSUS et
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
    if (spotIsFullFrame(spot)) { setPlein(spot.id); return; }
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

  // Une partie est-elle en cours ? Lu dans le DOM, et non tenu en état : la
  // scène peut se refermer par sa propre croix ou par Échap, sans que la vue en
  // soit avertie — un drapeau local se serait désynchronisé au premier de ces
  // gestes. `registerTempleStage` n'admettant qu'un abonné, c'est la seule
  // lecture fiable dont on dispose ici.
  const jeuEnCours = () => !!document.querySelector('.plaisirs-stage .regulation-stage:not(.is-empty)');

  // Depuis le MENU : si on joue déjà, on bascule DIRECTEMENT sur l'autre jeu
  // (Raph, 2026-08-07) — repasser par le bouton d'action obligerait à fermer,
  // viser le lieu, puis relancer. Hors partie, on garde les deux temps.
  const depuisMenu = (spot) => (jeuEnCours() ? lancer(spot) : choisir(spot));

  // Un clic n'importe où sur l'illustration journalise sa position source.
  const releve = (e) => {
    if (!window.__plaisirsAnchors) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * PLAISIRS_ART.w);
    const y = Math.round(((e.clientY - r.top) / r.height) * PLAISIRS_ART.h);
    console.log(`ancre source : x: ${x}, y: ${y}`);
  };

  const allume = (id) => survol === id || selection === id;

  return (
    // ⚠ `view active` et pas `view` seul : `.view` est masquée par défaut
    // (views-shop-myths.css), c'est `.active` qui l'affiche. Toutes les vues du
    // projet ouvrent sur ce couple, et l'oublier donne un onglet parfaitement
    // vide, sans la moindre erreur en console.
    <section className="view active" id="plaisirs">
      <div
        onClick={releve}
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
          aspectRatio: plein ? undefined : `${PLAISIRS_ART.w} / ${PLAISIRS_ART.h}`,
          minHeight: plein ? 'calc(100vh - 96px)' : undefined,
          backgroundImage: plein ? 'none' : `url("${PLAISIRS_ART.src}")`,
          backgroundSize: '100% 100%',
          // L'illustration est du pixel art affiché bien au-dessus de sa taille
          // native : sans ça le navigateur l'interpole et tout devient flou.
          imageRendering: 'pixelated',
          borderRadius: 4,
          overflow: 'hidden'
        }}
      >
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
        {!plein && PLAISIRS_SPOTS.filter(spotHasAnchor).map((spot) => {
          const r = spotRadius(spot);
          const ouvert = spotIsOpen(spot);
          const actif = allume(spot.id) && ouvert;
          return (
            // ⚠ Une DIV et non un <button> : le thème du projet habille les
            // boutons (fond, bordure, coins) avec assez de poids pour écraser
            // les styles en ligne — les zones sortaient en rectangles gris
            // opaques posés sur l'illustration. Une div n'hérite de rien ; le
            // rôle et la gestion clavier rendent l'accessibilité perdue.
            <div
              key={spot.id}
              role="button"
              // Un lieu sans jeu reste DESSINÉ mais non cliquable : mieux vaut
              // un lieu inerte qu'un panneau vide qui s'ouvre sur rien.
              tabIndex={ouvert ? 0 : -1}
              aria-disabled={!ouvert}
              aria-label={spot.label}
              title={ouvert ? spot.label : `${spot.label}, bientôt`}
              onMouseEnter={() => setSurvol(spot.id)}
              onMouseLeave={() => setSurvol((s) => (s === spot.id ? null : s))}
              onFocus={() => setSurvol(spot.id)}
              onBlur={() => setSurvol((s) => (s === spot.id ? null : s))}
              onClick={(e) => { e.stopPropagation(); choisir(spot); }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();      // sinon Espace fait défiler la page
                e.stopPropagation();
                choisir(spot);
              }}
              style={{
                position: 'absolute',
                // conversion source -> pourcentage : voir l'en-tête
                left: `${((spot.x - r) / PLAISIRS_ART.w) * 100}%`,
                top: `${((spot.y - r) / PLAISIRS_ART.h) * 100}%`,
                width: `${((r * 2) / PLAISIRS_ART.w) * 100}%`,
                height: `${((r * 2) / PLAISIRS_ART.h) * 100}%`,
                borderRadius: '50%',
                border: actif ? '2px solid rgba(255,120,210,0.9)' : '2px solid transparent',
                background: actif ? 'rgba(255,120,210,0.16)' : 'transparent',
                boxShadow: actif ? '0 0 16px 4px rgba(255,120,210,0.55)' : 'none',
                cursor: ouvert ? 'pointer' : 'default',
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
          const spot = PLAISIRS_SPOTS.find((s) => s.id === selection && spotHasAnchor(s) && spotIsOpen(s));
          if (!spot) return null;
          const r = spotRadius(spot);
          // Le bouton se met SOUS le lieu, sauf quand le lieu est déjà bas :
          // il passe alors au-dessus. Le cadre est en `overflow: hidden`, et un
          // bouton posé sous un lieu du premier plan tombait hors champ — c'est
          // ce qui rendait les osselets muets, alors que le clic fonctionnait.
          const basse = (spot.y + r) > PLAISIRS_ART.h * 0.74;
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
                left: `${(spot.x / PLAISIRS_ART.w) * 100}%`,
                top: `${((basse ? spot.y - r : spot.y + r) / PLAISIRS_ART.h) * 100}%`,
                transform: basse ? 'translate(-50%, -100%)' : 'translate(-50%, 6px)',
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

        {/* LE JEU, EN SURIMPRESSION sur l'illustration — plus jamais à côté.
            Il ne se voit QUE lorsqu'une partie est ouverte : la scène se marque
            elle-même `is-empty` quand elle ne porte rien, et la feuille de style
            masque alors tout le calque. C'est la seule façon propre de le savoir
            d'ici, `registerTempleStage` n'admettant qu'UN abonné — m'y abonner
            aussi arracherait la scène à son propre pont. */}
        <div className="plaisirs-stage">
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
          déformer ni les points chauds à se recalibrer. */}
      <nav className="plaisirs-menu" aria-label="Les lieux de la Maison des Plaisirs">
        {/* LA BOURSE, en tête du menu : on lit ce qu'on peut miser avant de
            choisir où le miser. */}
        <OffrandesBloc />

        {/* Le retour n'apparaît qu'en plein cadre : sur l'illustration, on est
            déjà dans la salle et l'entrée n'aurait aucun sens. */}
        {plein && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); revenir(); }}
            className="plaisirs-lieu is-actif"
          >
            Retour à la salle
          </button>
        )}
        {PLAISIRS_SPOTS.map((spot) => {
          const ouvert = spotIsOpen(spot);
          const actif = allume(spot.id);
          return (
            <button
              key={spot.id}
              type="button"
              disabled={!ouvert}
              onMouseEnter={() => setSurvol(spot.id)}
              onMouseLeave={() => setSurvol((s) => (s === spot.id ? null : s))}
              onFocus={() => setSurvol(spot.id)}
              onBlur={() => setSurvol((s) => (s === spot.id ? null : s))}
              onClick={(e) => { e.stopPropagation(); depuisMenu(spot); }}
              title={ouvert ? undefined : 'Bientôt'}
              className={`plaisirs-lieu${actif && ouvert ? ' is-actif' : ''}`}
            >
              {spot.label}
            </button>
          );
        })}
      </nav>

    </section>
  );
}
