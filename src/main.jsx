// ⚠ EN PREMIER : l'arbitrage de la sauvegarde nuage (Google Drive, .exe) remplace
// la save localStorage si celle du nuage est plus avancée — il DOIT courir
// avant que la chaîne d'imports d'App n'évalue state.js (`state = load()`).
import './game/core/cloudSave.js'
// Puis la save en FICHIER du .exe (Steam Cloud), arbitrée de même avant state.js.
import './game/core/fileSave.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { watchPointerMode } from './game/core/pointerMode.js'
import { expectChoiceDialog } from './game/core/choiceDialog.js'
import { save } from './game/core/state.js'
import { isChunkLoadError, reloadOnceForChunkError, showCrashScreen } from './game/core/crashGuard.js'
import { claimSaveLock, leaveGame, showOtherTabScreen, askPersistentStorage } from './game/core/saveLock.js'

// L'interface de choix arrive avec App : une demande faite avant son
// branchement (reprise du choix de Ruines actives au démarrage) l'attend au lieu
// d'être validée vide d'office (audit 2026-10-05, BUG-4).
expectChoiceDialog()

// AVANT le premier rendu : `data-pointer` doit être posé sur <html> quand le CSS
// s'applique, sinon la coquille tactile arrive une frame trop tard et l'écran
// clignote de la disposition bureau vers celle du doigt.
watchPointerMode()

// JEU HORS LIGNE SUR TÉLÉPHONE (cf. public/sw.js). Quatre garde-fous, chacun pour
// une raison précise :
//   · `PROD` — en développement le service worker servirait des modules mis en
//     cache par-dessus le rechargement à chaud, et on passerait ses journées à
//     débugger du code périmé ;
//   · protocole — l'enregistrement n'est possible que sur une origine sûre.
//     Sur `http://192.168.x.x` le navigateur refuse : ce n'est pas contournable,
//     c'est ce qui impose d'héberger le jeu en https pour qu'il tourne sans le PC ;
//   · PAS localhost (`npm run preview`, audit 2026-10-05, WEB-1) — le cache y
//     survivait d'un build à l'autre et servait à Raph les sprites d'avant. Un
//     service worker resté d'une session précédente y est désinscrit ;
//   · `app://` — dans le .exe Electron tout est déjà local, un cache en plus
//     n'apporterait rien et ajouterait une couche à invalider. Exclu EN PREMIER
//     (audit 2026-10-05, ELEC-7) : l'.exe sert app://localhost/, qui passait le
//     test « localhost » ci-dessous — l'exclusion ne tenait qu'au privilège
//     allowServiceWorkers absent du protocole (main.cjs).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'app:') {
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  if (local) {
    navigator.serviceWorker.getRegistrations()
      .then((inscrits) => inscrits.forEach((r) => r.unregister()))
      .catch(() => { /* rien d'inscrit, ou refus : rien à nettoyer */ })
  } else if (location.protocol === 'https:') {
    // Après le chargement : l'enregistrement ne doit pas disputer la bande
    // passante au premier écran.
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        /* refus du navigateur (origine, réglages) : le jeu marche, sans hors-ligne */
      })
    })
  }
}

// FILETS D'ERREUR (audit 2026-10-05, BUG-18). Les vues et les dialogues ont leur
// frontière (ViewErrorBoundary, dans App). Ce qui leur échappe démonte la racine :
// on sauve la partie, puis on remplace la page blanche par un écran de
// rechargement. Les deux journaux passent par console.error, que l'.exe recopie
// dans userData/logs (main.cjs).
const rootElement = document.getElementById('root')
const mountApp = () => createRoot(rootElement, {
  onUncaughtError(error, errorInfo) {
    console.error('Erreur d\'interface non rattrapée :', error, errorInfo?.componentStack || '')
    try { save() } catch { /* save() tient son propre journal d'échec */ }
    if (isChunkLoadError(error) && reloadOnceForChunkError()) return
    // Différé : React finit de vider la racine avant qu'on y écrive.
    setTimeout(() => showCrashScreen(rootElement), 0)
  },
  onCaughtError(error, errorInfo) {
    console.error('Erreur d\'interface rattrapée :', error, errorInfo?.componentStack || '')
  },
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// UNE PARTIE PAR NAVIGATEUR (audit 2026-10-05, SAV-9) : deux onglets écrasaient
// la save l'un de l'autre. Seul l'onglet qui tient le verrou monte App (boucle,
// musique, sauvegardes) ; les autres affichent « partie ouverte dans un autre
// onglet » (saveLock.js). Sans Web Locks, comportement d'avant. Céder la partie
// passe par les gardes de sortie de la page, comme un F5 (leaveGame).
claimSaveLock({ beforeYield: () => leaveGame(save) }).then((owner) => {
  if (owner) mountApp()
  else showOtherTabScreen(rootElement)
})
askPersistentStorage()
