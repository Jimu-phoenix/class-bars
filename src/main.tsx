import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { RoleProvider } from './contexts/RoleContext'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

registerSW({
  onNeedRefresh: () => {},
  onOfflineReady: () => {},
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <RoleProvider>
          <App />
        </RoleProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
