import TensionBarometers from '../ui/TensionBarometers.jsx';
import PressureAnatomy from '../ui/PressureAnatomy.jsx';
import CycleAnnals from '../ui/CycleAnnals.jsx';
import StewardPanel from '../ui/StewardPanel.jsx';
import AuguresPanel from '../ui/AuguresPanel.jsx';
import FaveurShop from '../ui/FaveurShop.jsx';
import RegulationStage from '../ui/RegulationStage.jsx';
import { HelpBubbleLayer } from '../ui/HelpBubble.jsx';

/**
 * Onglet Régulation — la « Chancellerie ». Layout (réorg 2026-07-14) :
 *   bandeau de jauges ;
 *   deux colonnes COMPACTES en haut —
 *     GAUCHE : Anatomie de la Rupture → Intendance → Table des augures ;
 *     DROITE : Annales du cycle → Boutique de Faveur ;
 *   puis la SCÈNE DES JEUX en PLEINE LARGEUR en bas, qui prend tout l'espace
 *     restant (osselets et Vol d'Icare s'y animent en grand).
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
          <FaveurShop />
        </div>
      </div>
      <RegulationStage />
      <HelpBubbleLayer />
    </section>
  );
}
