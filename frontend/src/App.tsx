import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { SlabsPage } from './pages/SlabsPage'
import { GradingOrdersPage } from './pages/GradingOrdersPage'
import { RawCardsPage } from './pages/RawCardsPage'
import { AddRawCardsPage } from './pages/AddRawCardsPage'

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
          <Route index element={<SlabsPage />} />
          <Route path="grading-orders" element={<GradingOrdersPage />} />
          <Route path="raw-cards" element={<RawCardsPage />} />
          <Route path="raw-cards/add" element={<AddRawCardsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
