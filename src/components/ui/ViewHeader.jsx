// Bandeau d'entête de vue : marque clairement où commence chaque onglet
// (titre majeur + sous-titre), au-dessus des panneaux de contenu.
export default function ViewHeader({ icon, title, subtitle }) {
  return (
    <header className="view-header">
      <span className="view-header-icon" aria-hidden="true">{icon}</span>
      <div>
        <h2 className="view-header-title">{title}</h2>
        {subtitle && <p className="view-header-subtitle">{subtitle}</p>}
      </div>
    </header>
  );
}
