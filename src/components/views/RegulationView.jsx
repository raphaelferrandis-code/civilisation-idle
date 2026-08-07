import TensionBarometers from '../ui/TensionBarometers.jsx';
import PressureAnatomy from '../ui/PressureAnatomy.jsx';
import CycleAnnals from '../ui/CycleAnnals.jsx';
import StewardPanel from '../ui/StewardPanel.jsx';
import TemplePupitre from '../ui/TemplePupitre.jsx';

/**
 * Onglet Régulation — la « Chancellerie ». Layout (réorg 2026-07-14) :
 *   bandeau de jauges ;
 *   deux colonnes COMPACTES en haut —
 *     GAUCHE : Anatomie de la Rupture → Intendance → Table des augures ;
 *     DROITE : les Annales du cycle puis le Pupitre du temple (réglage des
 *       automatisations en accordéon replié, demande Raphaël 2026-07-17) ;
 *   puis la SCÈNE DES JEUX en PLEINE LARGEUR en bas, qui prend tout l'espace
 *     restant (osselets et Vol d'Icare s'y animent en grand).
 * NB : la Boutique de Faveur a déménagé dans l'onglet Boutique (2026-07-15) —
 * la Faveur se GAGNE ici (jeux), se DÉPENSE là-bas.
 * Les bulles d'aide restent partout, mais la COUCHE qui les rend est montée
 * dans App depuis B1 : `showFn` est un singleton de module, deux couches
 * montées en même temps se voleraient la référence.
 */
export default function RegulationView() {
  return (
    // Les JEUX ont quitté cette page pour la Maison des Plaisirs (2026-08-06).
    // AuguresPanel et RegulationStage y vivaient ; les laisser ici aurait donné
    // deux entrées vers les mêmes parties, et deux scènes concurrentes pour un
    // pont qui n'admet qu'un abonné.
    <section className="view active" id="regulation">
      <TensionBarometers />
      <div className="regulation-cols">
        <div className="regulation-col regulation-col--left">
          <PressureAnatomy />
          <StewardPanel />
        </div>
        <div className="regulation-col regulation-col--right">
          <CycleAnnals />
          <TemplePupitre />
        </div>
      </div>
    </section>
  );
}
