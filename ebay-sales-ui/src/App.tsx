import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { PackingListPage } from './pages/PackingListPage'
import { ManualMatchPage } from './pages/ManualMatchPage'
import { SalesInboxPage } from './pages/SalesInboxPage'
import { RefundApprovalPage } from './pages/RefundApprovalPage'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/packing" replace />} />
          <Route path="packing" element={<PackingListPage />} />
          <Route path="match" element={<ManualMatchPage />} />
          <Route path="sales" element={<SalesInboxPage />} />
          <Route path="refunds" element={<RefundApprovalPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
