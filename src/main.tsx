import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { JobsFlowSsoProvider } from './jobsFlowSso.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <JobsFlowSsoProvider>
      <App />
    </JobsFlowSsoProvider>
  </StrictMode>,
)
