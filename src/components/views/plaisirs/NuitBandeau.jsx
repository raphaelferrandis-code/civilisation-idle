import { useEffect, useState } from 'react';
import { onNuit, nuitActive, flambeurDeLaNuit } from '../../../game/core/actions/nuitGrandJeu.js';
import { state } from '../../../game/core/state.js';
import { tr } from '../../../game/core/i18n.js';
import { fmt } from '../../../game/core/utils.js';
import '../../../styles/plaisirs-nuit.css';

/**
 * LE BANDEAU DE LA NUIT DU GRAND JEU (2026-10-04, docs/PLAN-NUIT-DES-PLAISIRS.md) : à
 * l'ouverture d'une Nuit, un ruban de velours descend sur la salle — le titre, le
 * grand flambeur de la nuit, ce que la Maison a versé à la cagnotte. Il se retire seul
 * (ou d'un clic). Une Nuit déjà ouverte quand on entre dans la Maison s'annonce une
 * fois, à l'entrée.
 *
 * ⚠ Le minuteur part APRÈS l'affichage (l'effet sur `info`), pas à l'annonce : si la
 * page est occupée à ce moment-là (une cuisson de la coupe), le bandeau garde toute sa
 * durée au lieu de s'éteindre avant d'avoir été peint. Et une salle remontée en pleine
 * annonce (rechargement, aller-retour d'onglet) le retrouve : son temps se compte
 * depuis l'ouverture de la Nuit (state.nuitDebut).
 */

const DUREE_MS = 6500;
// La dernière Nuit annoncée, et ce qu'elle a versé (mémoire de module).
let annoncee = 0;
let derniere = null;

export default function NuitBandeau() {
  const [info, setInfo] = useState(null); // { flambeur, verse, duree } | null

  useEffect(() => {
    const montrer = (i, duree = DUREE_MS) => {
      annoncee = Number(state.nuitCompte) || 0;
      derniere = { flambeur: i.flambeur, verse: i.verse, compte: annoncee };
      setInfo({ flambeur: i.flambeur, verse: i.verse, duree });
    };
    if (nuitActive()) {
      const compte = Number(state.nuitCompte) || 0;
      const depuis = Date.now() - (Number(state.nuitDebut) || 0);
      const deja = derniere && derniere.compte === compte ? derniere : { flambeur: flambeurDeLaNuit(), verse: 0 };
      // Le bandeau qui n'a pas fini de s'afficher reprend ; une Nuit jamais annoncée
      // (on entre dans la Maison en pleine Nuit) s'annonce une fois.
      if (depuis < DUREE_MS) montrer(deja, DUREE_MS - depuis);
      else if (compte !== annoncee) montrer(deja);
    }
    return onNuit((i) => montrer(i));
  }, []);

  useEffect(() => {
    if (!info) return undefined;
    const t = setTimeout(() => setInfo(null), info.duree);
    return () => clearTimeout(t);
  }, [info]);

  if (!info) return null;
  return (
    <div className="nuit-bandeau" role="status" onClick={() => setInfo(null)}>
      <span className="nuit-titre">✦ {tr({ fr: 'La Nuit du Grand Jeu', en: 'The Night of High Play' })} ✦</span>
      <span className="nuit-sous">
        {tr(info.flambeur.nom)}
        {info.verse > 0 && <> · <b>+{fmt(info.verse)}</b> {tr({ fr: 'à la cagnotte', en: 'to the pot' })}</>}
      </span>
    </div>
  );
}
