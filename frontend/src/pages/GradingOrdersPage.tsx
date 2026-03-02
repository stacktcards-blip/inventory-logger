import { useState, useRef, useCallback, useMemo } from 'react'
import { useGradingOrders } from '../hooks/useGradingOrders'
import { GradingOrdersTable } from '../components/GradingOrdersTable'
import { GradingOrderSlabsPanel } from '../components/GradingOrderSlabsPanel'
import { SlabDetailModal } from '../components/SlabDetailModal'
import type { GradingOrderRow } from '../hooks/useGradingOrders'

type GradingCompanyTab = 'all' | 'PSA' | 'CGC'

export function GradingOrdersPage() {
  const [selectedOrder, setSelectedOrder] = useState<GradingOrderRow | null>(
    null
  )
  const [selectedSlabId, setSelectedSlabId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<GradingCompanyTab>('all')
  const panelRefetchRef = useRef<(() => void) | null>(null)

  const { data, loading } = useGradingOrders()

  const filteredData = useMemo(() => {
    if (activeTab === 'all') return data
    return data.filter((o) => o.grading_company === activeTab)
  }, [data, activeTab])

  const handleSlabSaved = useCallback(() => {
    panelRefetchRef.current?.()
  }, [])

  return (
    <>
      <div className="space-y-3">
        <h1 className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-300 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
          Grading Orders
        </h1>
        <p className="text-xs text-slate-500">
          Click an order to view its slabs in the side panel.
        </p>
        <div className="flex gap-1 border-b border-base-border/80">
          {(['all', 'PSA', 'CGC'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-4 py-2 text-xs font-medium transition-all ${
                activeTab === tab
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-slate-500 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {tab === 'all' ? 'All' : tab}
            </button>
          ))}
        </div>
        <GradingOrdersTable
          data={filteredData}
          loading={loading}
          onRowClick={setSelectedOrder}
        />
      </div>

      {selectedOrder && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/60"
            onClick={() => setSelectedOrder(null)}
            aria-hidden="true"
          />
          <GradingOrderSlabsPanel
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onSlabClick={setSelectedSlabId}
            refetchRef={panelRefetchRef}
          />
        </>
      )}

      <SlabDetailModal
        slabId={selectedSlabId}
        onClose={() => setSelectedSlabId(null)}
        onSaved={handleSlabSaved}
      />
    </>
  )
}
