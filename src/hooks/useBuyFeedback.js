import { useEffect, useRef, useState } from 'react';

// LE RETOUR D'UN ACHAT (game feel, Phase 7) : un « +N » qui flotte 900 ms au-dessus du
// bouton, et la rangée qui TREMBLE 400 ms quand l'achat est refusé. Partagé par la
// rangée d'achat de la boutique (PurchaseRow) et l'encart Voirie (RoadworksPanel), qui
// le recopiaient tel quel (audit du 05/10, STRUCT-12).
// Les minuteries survivaient au démontage de la rangée (changement d'ère, filtre de
// boutique) : setState sur un composant démonté. Motif classique : ids collectés,
// purge à l'adieu.
export function useBuyFeedback() {
  const [floats, setFloats] = useState([]);
  const [shaking, setShaking] = useState(false);
  const floatId = useRef(0);
  const timersRef = useRef([]);
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  const spawnFloat = (text) => {
    const id = ++floatId.current;
    setFloats((f) => [...f, { id, text }]);
    timersRef.current.push(setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 900));
  };
  const doShake = () => {
    setShaking(true);
    timersRef.current.push(setTimeout(() => setShaking(false), 400));
  };
  return { floats, shaking, spawnFloat, doShake };
}
