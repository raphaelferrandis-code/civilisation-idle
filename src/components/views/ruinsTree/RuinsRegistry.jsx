import { fmt } from "../../../game/core/utils.js";
import { tr } from "../../../game/core/i18n.js";
import PixelIcon from "../../ui/PixelIcon.jsx";
import { branchTheme } from "./branchTheme.js";

const ROMAN = ["I", "II", "III", "IV"];

// Le registre de l'Arbre des Ruines, posé sur la nuit à gauche de l'arbre :
// le compteur de Ruines et une plaque par branche (emblème de sa couronne,
// pastille des nœuds à prendre, acquis/total, ses quatre paliers, la porte
// suivante). Aucune phrase : des noms, des chiffres, des boutons. (Le bouton
// « N à prendre ▸ » a été retiré à la demande de Raph : le liseré d'or sur
// l'arbre et la pastille de chaque branche suffisent.)
// Survol d'une plaque = la branche seule reste allumée ; clic = on la cadre.
export default function RuinsRegistry({ ruins, branches, focus, pinned, onFocus, onPin }) {
  return (
    <section className="rt-registry" aria-label={tr({ fr: "Registre des Ruines", en: "Ruins ledger" })}>
      <h2 className="rt-reg-title">{tr({ fr: "Mémoire des Ruines", en: "Memory of the Ruins" })}</h2>
      <div className="rt-reg-count">
        <PixelIcon name="glyphs/ruines" size={32} alt={tr({ fr: "Ruines", en: "Ruins" })} />
        <strong>{fmt(ruins)}</strong>
      </div>
      <ol className="rt-branches">
        {branches.map((b) => {
          const theme = branchTheme(b.id);
          const cls = ["rt-branch", focus === b.id ? "is-focus" : "", pinned === b.id ? "is-pinned" : ""].filter(Boolean).join(" ");
          return (
            <li key={b.id}>
              <button
                type="button"
                className={cls}
                style={{ "--b-rgb": theme.rgb, "--b-glow": theme.glow }}
                aria-pressed={pinned === b.id}
                aria-label={`${theme.label}, ${b.owned}/${b.total}${b.avail ? `, ${b.avail} ${tr({ fr: "à prendre", en: "available" })}` : ""}`}
                onMouseEnter={() => onFocus(b.id)}
                onMouseLeave={() => onFocus(null)}
                onFocus={() => onFocus(b.id)}
                onBlur={() => onFocus(null)}
                onClick={() => onPin(b.id)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <span className="rt-sig" aria-hidden="true">
                  <img src={`/pixelart/ui/ruins/node-${b.capId}@32.png`} alt="" draggable="false" />
                  {b.avail > 0 && <span className="rt-sig-badge">{b.avail}</span>}
                </span>
                <span className="rt-branch-name">{theme.label}</span>
                <span className="rt-branch-count">{b.owned}/{b.total}</span>
                <span className="rt-tiers" aria-hidden="true">
                  {b.tiers.map((t, i) => (
                    <i
                      key={i}
                      className={t.open ? "" : "is-closed"}
                      style={t.open ? { "--p": `${Math.round((t.own / t.size) * 100)}%` } : undefined}
                      title={`${tr({ fr: "Palier", en: "Tier" })} ${ROMAN[i]} · ${t.own}/${t.size}`}
                    />
                  ))}
                  {b.gate && (
                    <em className="rt-tiers-gate">
                      <PixelIcon name="glyphs/verrou" size={16} />
                      {b.gate.have}/{b.gate.need}
                    </em>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
