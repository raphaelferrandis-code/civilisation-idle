import TensionBarometers from '../ui/TensionBarometers.jsx';
import PressureAnatomy from '../ui/PressureAnatomy.jsx';
import CycleAnnals from '../ui/CycleAnnals.jsx';
import StewardPanel from '../ui/StewardPanel.jsx';
import AuguresPanel from '../ui/AuguresPanel.jsx';
import TemplePupitre from '../ui/TemplePupitre.jsx';
import RegulationStage from '../ui/RegulationStage.jsx';
import { HelpBubbleLayer } from '../ui/HelpBubble.jsx';

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
 * Bulles d'aide (HelpBubbleLayer, DA de l'arbre des Ruines) partout.
 */
export default function RegulationView() {
  return (
    <section className="view active" id="regulation">
      <TensionBarometers />
      <div className="regulation-cols">
        <div className="regulation-col regulation-col--left">
          <PressureAnatomy />
          <StewardPanel />
          <AuguresPanel />
        </div>
        <div className="regulation-col regulation-col--right">
          <CycleAnnals />
          <TemplePupitre />
        </div>
      </div>
      <RegulationStage />
      <HelpBubbleLayer />
    </section>
  );
}
