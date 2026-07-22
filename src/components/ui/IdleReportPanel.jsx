import { useEffect, useState } from 'react';
import { registerIdleReport } from '../../game/core/idleReport.js';
import { fmtSecs } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';

// RAPPORT DE REPRISE (B11). Au retour, la cité a produit, vieilli, parfois
// chuté et rebâti — et le joueur ne voyait qu'un solde qui avait bougé sans
// explication. Cet encart raconte la récolte, ligne par ligne.
//
// JAMAIS un dialogue : il ne vole pas le focus, n'interrompt rien, et se ferme
// à la main. On revient dans son jeu, on ne se fait pas accueillir par une
// fenêtre à cliquer avant même d'avoir vu sa ville.
const LINE_DELAY_MS = 120;

export default function IdleReportPanel() {
  const [report, setReport] = useState(null);
  // Nombre de lignes révélées. Le décalage donne à lire : tout afficher d'un
  // bloc, c'est un pavé de chiffres qu'on saute.
  const [shown, setShown] = useState(0);

  useEffect(() => registerIdleReport((next) => {
    setReport(next);
    setShown(0);
  }), []);

  const lineCount = report ? report.deltas.length + 2 : 0;
  useEffect(() => {
    if (!report || shown >= lineCount) return undefined;
    const id = setTimeout(() => setShown((n) => n + 1), LINE_DELAY_MS);
    return () => clearTimeout(id);
  }, [report, shown, lineCount]);

  if (!report) return null;

  const lost = Math.max(0, report.awaySec - report.creditedSec);
  const visible = (index) => (index < shown ? 'is-in' : '');

  return (
    <aside className="idle-report" role="status">
      <div className="idle-report-head">
        <strong>{tr({ fr: "Pendant ton absence", en: "While you were away" })}</strong>
        <button
          type="button"
          className="idle-report-close"
          onClick={() => setReport(null)}
          aria-label={tr({ fr: "Fermer le rapport", en: "Close the report" })}
        >
          ×
        </button>
      </div>

      <p className="idle-report-title">{report.title}</p>

      {/* La réserve d'abord : c'est elle qui explique pourquoi une longue
          absence ne rapporte pas proportionnellement, et elle rend les
          Veilleurs de nuit désirables au lieu de subis. */}
      <p className={`idle-report-cap ${visible(0)}`}>
        {tr({
          fr: `${fmtSecs(report.creditedSec)} créditées sur ${fmtSecs(report.capSec)} de réserve`,
          en: `${fmtSecs(report.creditedSec)} credited out of ${fmtSecs(report.capSec)} of reserve`
        })}
        {lost > 60 && (
          <span className="idle-report-lost">
            {tr({ fr: `, ${fmtSecs(lost)} perdues au-dessus du plafond`, en: `, ${fmtSecs(lost)} lost above the cap` })}
          </span>
        )}
      </p>

      {/* Chemin farm : la cité a vraiment chuté et rebâti, donc les ressources
          peuvent avoir BAISSÉ (la cité est plus jeune). Le résultat à retenir
          est le gain de Ruines, pas le solde. */}
      {report.farm && report.collapses > 0 && (
        <p className={`idle-report-farm ${visible(1)}`}>
          {tr({
            fr: `${report.collapses} chute${report.collapses > 1 ? 's' : ''} rejouée${report.collapses > 1 ? 's' : ''}`,
            en: `${report.collapses} collapse${report.collapses > 1 ? 's' : ''} replayed`
          })}
          {report.ruinsGained && <strong> · +{report.ruinsGained} {tr({ fr: "ruines", en: "ruins" })}</strong>}
        </p>
      )}

      <ul className="idle-report-lines">
        {report.deltas.map((d, i) => (
          <li key={d.key} className={`${d.negative ? 'is-down' : 'is-up'} ${visible(i + 2)}`}>
            <span>{d.label}</span>
            <strong>{d.negative ? '' : '+'}{d.amount}</strong>
          </li>
        ))}
      </ul>

      {report.wearDelta > 0 && (
        <p className="idle-report-wear">
          {tr({ fr: `Usure +${report.wearDelta} %`, en: `Wear +${report.wearDelta}%` })}
        </p>
      )}

      {/* Sans cette liste, l'écart avec l'attente est lu comme un bug. */}
      <p className="idle-report-idle">
        {tr({ fr: "N'a pas tourné : ", en: "Did not run: " })}
        {report.idle.map((x) => x.label).join(', ')}.
      </p>
    </aside>
  );
}
