// Le Worker des sons (audit du 2026-10-05, PERF-41) : les bruitages de la machine à
// sous, la mélodie de la scène et le paysage sonore de la carte, rendus hors du fil
// principal (syntheseAilleurs.js). La synthèse est pure (aléa à graine) : le même son,
// au même échantillon près, que rendu sur la page.
import { rendreSon, rendreRonron } from './slotsSynth.js';
import { renderMelodie } from './melodieSynth.js';
import { rendrePaysage } from './paysage/paysageSynth.js';
import { rendreMoment } from './moments/momentsSynth.js';

self.onmessage = (ev) => {
  const t = ev.data || {};
  try {
    const data = t.quoi === 'son' ? rendreSon(t.nom, t.look)
      : t.quoi === 'ronron' ? rendreRonron(t.look)
        : t.quoi === 'melodie' ? renderMelodie(t.band)
          : t.quoi === 'paysage' ? rendrePaysage(t.nom)
            : t.quoi === 'moment' ? rendreMoment(t.nom) : null;
    if (!data) throw new Error('tâche inconnue : ' + t.quoi);
    self.postMessage({ id: t.id, data }, [data.buffer]);
  } catch (err) {
    self.postMessage({ id: t.id, err: String((err && err.message) || err) });
  }
};
