import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from "@azure/msal-react"
import { msalInstance } from "./services/outlookService"
import './index.css'
import App from './App.jsx'

// MSAL v3+ require initialization
msalInstance.initialize().then(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>,
  )
}).catch(err => {
  console.error("MSAL Initialization Error:", err);
  createRoot(document.getElementById('root')).render(
    <div style={{ padding: '2rem', color: 'red' }}>
      <h1>Error de Inicialización MSAL</h1>
      <pre>{err.message}</pre>
    </div>
  )
});
