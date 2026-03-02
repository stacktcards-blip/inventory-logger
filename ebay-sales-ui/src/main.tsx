import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'

const hasEnv =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY

const App = hasEnv
  ? (await import('./App')).default
  : () => (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#0f172a',
          color: '#e2e8f0',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: 18, marginBottom: 16 }}>Configuration Error</h1>
        <p style={{ marginBottom: 8, color: '#94a3b8' }}>
          Add to <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 4 }}>ebay-sales-ui/.env.local</code>:
        </p>
        <pre style={{ background: '#1e293b', padding: 16, borderRadius: 8, fontSize: 13, textAlign: 'left' }}>
          {`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_EBAY_SALES_API_URL=http://localhost:3002`}
        </pre>
        <p style={{ marginTop: 16, color: '#94a3b8', fontSize: 14 }}>
          Names must start with <strong>VITE_</strong>. Restart dev server after editing.
        </p>
      </div>
    )

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
