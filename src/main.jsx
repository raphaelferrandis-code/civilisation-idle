// ⚠ EN PREMIER : l'arbitrage de la sauvegarde nuage (Google Drive, .exe) remplace
// la save localStorage si celle du nuage est plus avancée — il DOIT courir
// avant que la chaîne d'imports d'App n'évalue state.js (`state = load()`).
import './game/core/cloudSave.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
