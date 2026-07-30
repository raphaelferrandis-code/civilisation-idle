// ⚠ EN PREMIER : l'arbitrage de la sauvegarde nuage (Google Drive, .exe) remplace
// la save localStorage si celle du nuage est plus avancée — il DOIT courir
// avant que la chaîne d'imports d'App n'évalue state.js (`state = load()`).
import './game/core/cloudSave.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { watchPointerMode } from './game/core/pointerMode.js'

// AVANT le premier rendu : `data-pointer` doit être posé sur <html> quand le CSS
// s'applique, sinon la coquille tactile arrive une frame trop tard et l'écran
// clignote de la disposition bureau vers celle du doigt.
watchPointerMode()

// JEU HORS LIGNE SUR TÉLÉPHONE (cf. public/sw.js). Trois garde-fous, chacun pour
// une raison précise :
//   · `PROD` — en développement le service worker servirait des modules mis en
//     cache par-dessus le rechargement à chaud, et on passerait ses journées à
//     débugger du code périmé ;
//   · protocole — l'enregistrement n'est possible que sur une origine sûre
//     (https ou localhost). Sur `http://192.168.x.x` le navigateur refuse : ce
//     n'est pas contournable, c'est ce qui impose d'héberger le jeu en https
//     pour qu'il tourne sans le PC ;
//   · `app://` — dans le .exe Electron tout est déjà local, un cache en plus
//     n'apporterait rien et ajouterait une couche à invalider.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const sur = location.protocol === 'https:' || location.hostname === 'localhost'
    || location.hostname === '127.0.0.1'
  if (sur) {
    // Après le chargement : l'enregistrement ne doit pas disputer la bande
    // passante au premier écran.
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        /* refus du navigateur (origine, réglages) : le jeu marche, sans hors-ligne */
      })
    })
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
