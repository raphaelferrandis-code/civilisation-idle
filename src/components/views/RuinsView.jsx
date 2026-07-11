// Vue Ruines PLEIN CADRE (retours Raphaël : « cadre dans un cadre dans un
// cadre, très lourd ») : plus de panneau ni de bordures — l'Arbre des Ruines
// occupe toute la vue, comme la carte de la Cité. Le titre et le compteur
// vivent EN SURIMPRESSION dans RuinsTreePixel (le compteur = la boule de braise).
// L'ancien rendu radial (RuinsTreeGraph) a été supprimé en Phase D.
import RuinsTreePixel from './RuinsTreePixel.jsx';

export default function RuinsView() {
  return (
    <section className="view active" id="ruinsView">
      <RuinsTreePixel />
    </section>
  );
}
