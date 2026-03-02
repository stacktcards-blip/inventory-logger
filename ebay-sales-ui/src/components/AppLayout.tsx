import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function AppLayout() {
  const { user, signOut } = useAuth()
  const location = useLocation()

  const nav = (path: string, label: string) => (
    <Link
      to={path}
      className={`rounded-md px-3 py-2 text-sm font-medium ${
        location.pathname === path
          ? 'bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/40'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-700/80 bg-slate-900/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-1">
            {nav('/packing', 'Packing List')}
            {nav('/match', 'Manual Match')}
            {nav('/sales', 'Sales Inbox')}
            {nav('/refunds', 'Refunds')}
          </nav>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">{user?.email}</span>
            <button
              onClick={() => signOut()}
              className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
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
