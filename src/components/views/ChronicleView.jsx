import ViewHeader from '../ui/ViewHeader.jsx';

export default function ChronicleView() {
  return (
    <section className="view active" id="history">
      <ViewHeader
        icon="📜"
        title="Chronique"
        subtitle="Le récit complet de votre civilisation, cycle après cycle."
      />
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="label">Archives</span>
            <h2>Chronique</h2>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center', opacity: 0.7 }}>
          <p style={{ fontSize: '1.25rem', fontStyle: 'italic', marginBottom: '0.5rem' }}>
            « Les pages sont blanches, prêtes à être écrites. La mémoire de notre civilisation attend sa prochaine évolution. »
          </p>
          <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            – Cet espace accueillera bientôt le récit complet de votre histoire –
          </span>
        </div>
      </div>
    </section>
  );
}
