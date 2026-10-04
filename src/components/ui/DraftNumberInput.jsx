import { useEffect, useRef, useState } from 'react';

// Champ numérique dont la saisie n'est VALIDÉE qu'en sortant du champ (ou à
// Entrée). Les setters du jeu bornent la valeur (plancher de 10 min des
// minuteurs d'effondrement, 10 % du seuil d'Usure) : appelés à chaque frappe sur
// un champ contrôlé, ils relevaient le premier chiffre au plancher — taper « 30 »
// donnait « 100 ». Ici on garde le texte brut pendant la frappe, et on ne passe
// à onCommit (qui borne) qu'à la validation. Démonté en pleine saisie (panneau
// replié, dialogue fermé), le brouillon est validé aussi.
export default function DraftNumberInput({ value, onCommit, ...props }) {
  const [draft, setDraft] = useState(null);
  const draftRef = useRef(null);
  const commitRef = useRef(onCommit);
  useEffect(() => { commitRef.current = onCommit; });
  useEffect(() => () => {
    if (draftRef.current !== null) commitRef.current(draftRef.current);
  }, []);

  const edit = (next) => { draftRef.current = next; setDraft(next); };
  const commit = () => {
    if (draftRef.current === null) return;
    const raw = draftRef.current;
    edit(null);
    onCommit(raw);
  };

  return (
    <input
      type="number"
      {...props}
      value={draft ?? value}
      onChange={(e) => edit(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}
