import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function AppLayout() {
  const { user, signOut } = useAuth()
  const location = useLocation()

  const isRawCards = location.pathname.startsWith('/raw-cards')
  const navLink = (path: string, label: string, useGreen = false) => {
    const isActive = path === '/raw-cards'
      ? isRawCards
      : path === '/raw-cards/add'
        ? location.pathname === '/raw-cards/add'
        : location.pathname === path
    return (
      <Link
        to={path}
        className={`rounded-xl px-3 py-2 text-sm font-medium transition-all ${
          isActive
            ? useGreen
              ? 'bg-accent-green/20 text-accent-green ring-1 ring-accent-green/30'
              : 'bg-gradient-to-r from-blue-600/30 to-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
            : 'text-slate-400 hover:bg-base-elevated/50 hover:text-slate-200'
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-base-border/80 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-900/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-1">
            {navLink('/', 'Slabs')}
            {navLink('/grading-orders', 'Grading Orders')}
            {navLink('/raw-cards', 'Raw Cards', true)}
            {navLink('/raw-cards/add', 'Add raw cards', true)}
          </nav>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">{user?.email}</span>
            <button
              onClick={() => signOut()}
              className="rounded-md border border-base-border bg-base-elevated px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-base-elevated/80 hover:text-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
