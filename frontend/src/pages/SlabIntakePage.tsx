import { useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchByCertNumber,
  listDrafts,
  updateDraft,
  approveDraft,
  rejectDraft,
  commitDraft,
  type SlabIntakeDraft,
  type DraftUpdates,
} from '../lib/slabIntakeApi'

type DraftStatusFilter = 'pending' | 'approved'

export function SlabIntakePage() {
  const [certInput, setCertInput] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<SlabIntakeDraft | null>(null)
  const [statusFilter, setStatusFilter] = useState<DraftStatusFilter>('pending')
  const [drafts, setDrafts] = useState<SlabIntakeDraft[]>([])
  const [loadingDrafts, setLoadingDrafts] = useState(false)
  const [editDraft, setEditDraft] = useState<SlabIntakeDraft | null>(null)
  const [editForm, setEditForm] = useState<DraftUpdates>({})
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadDrafts = useCallback(async () => {
    setLoadingDrafts(true)
    setActionError(null)
    try {
      const pending = await listDrafts('pending')
      const approved = await listDrafts('approved')
      setDrafts(statusFilter === 'pending' ? pending : approved)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to load drafts')
      setDrafts([])
    } finally {
      setLoadingDrafts(false)
    }
  }, [statusFilter])

  const loadDraftsPending = useCallback(() => {
    setStatusFilter('pending')
    setLoadingDrafts(true)
    setActionError(null)
    listDrafts('pending')
      .then(setDrafts)
      .catch((e) => {
        setActionError(e instanceof Error ? e.message : 'Failed to load drafts')
        setDrafts([])
      })
      .finally(() => setLoadingDrafts(false))
  }, [])

  const loadDraftsApproved = useCallback(() => {
    setStatusFilter('approved')
    setLoadingDrafts(true)
    setActionError(null)
    listDrafts('approved')
      .then(setDrafts)
      .catch((e) => {
        setActionError(e instanceof Error ? e.message : 'Failed to load drafts')
        setDrafts([])
      })
      .finally(() => setLoadingDrafts(false))
  }, [])

  useEffect(() => {
    setLoadingDrafts(true)
    listDrafts(statusFilter)
      .then(setDrafts)
      .catch((e) => {
        setActionError(e instanceof Error ? e.message : 'Failed to load drafts')
        setDrafts([])
      })
      .finally(() => setLoadingDrafts(false))
  }, [statusFilter])

  const handleFetch = async () => {
    const cert = certInput.trim()
    if (!cert) return
    setFetching(true)
    setFetchError(null)
    setLastFetched(null)
    try {
      const draft = await fetchByCertNumber(cert)
      setLastFetched(draft)
      setCertInput('')
      loadDraftsPending()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Fetch failed'
      if (msg.includes('already_in_inventory')) {
        setFetchError('This certificate is already in your slab inventory.')
      } else if (msg.includes('already_in_intake')) {
        setFetchError('This certificate already has a pending or approved draft.')
      } else if (msg.includes('no_data_found')) {
        setFetchError('PSA returned no data for this certificate number.')
      } else {
        setFetchError(msg)
      }
    } finally {
      setFetching(false)
    }
  }

  const openEdit = (d: SlabIntakeDraft) => {
    setEditDraft(d)
    setEditForm({
      grade: d.grade ?? '',
      set_abbr: d.set_abbr ?? '',
      num: d.num ?? '',
      lang: d.lang ?? '',
      card_name: d.card_name ?? '',
      note: d.note ?? '',
      order_number: d.order_number ?? '',
      acquired_date: d.acquired_date ?? '',
    })
    setActionError(null)
  }

  const saveEdit = async () => {
    if (!editDraft) return
    setSaving(true)
    setActionError(null)
    try {
      await updateDraft(editDraft.id, editForm)
      setEditDraft(null)
      loadDrafts()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async (id: string) => {
    setActionError(null)
    try {
      await approveDraft(id)
      loadDrafts()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Approve failed')
    }
  }

  const handleReject = async (id: string) => {
    setActionError(null)
    try {
      await rejectDraft(id)
      loadDrafts()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Reject failed')
    }
  }

  const handleCommit = async (id: string) => {
    setActionError(null)
    try {
      await commitDraft(id)
      loadDrafts()
      loadDraftsApproved()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Commit failed')
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-300 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
        Slab Intake
      </h1>

      {/* Intake section */}
      <section className="rounded-xl border border-base-border/80 bg-base-elevated/30 p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-300">Add by PSA certificate number</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Certificate number"
            value={certInput}
            onChange={(e) => setCertInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
            className="rounded-lg border border-base-border bg-base/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleFetch}
            disabled={fetching || !certInput.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {fetching ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
        {fetchError && (
          <p className="mt-2 text-sm text-red-400">{fetchError}</p>
        )}
        {lastFetched && (
          <div className="mt-3 flex flex-wrap items-start gap-4 rounded-lg border border-base-border/50 bg-base/50 p-3">
            {lastFetched.image_url && (
              <img
                src={lastFetched.image_url}
                alt="Slab"
                className="h-24 w-auto rounded object-contain"
              />
            )}
            <div className="text-sm text-slate-300">
              <span className="font-medium text-slate-200">Cert {lastFetched.cert}</span>
              {lastFetched.grade && ` · Grade ${lastFetched.grade}`}
              {lastFetched.set_abbr && lastFetched.num && ` · ${lastFetched.set_abbr} #${lastFetched.num}`}
              {lastFetched.card_name && ` · ${lastFetched.card_name}`}
              <span className="ml-2 text-green-400">Saved as draft for review.</span>
            </div>
          </div>
        )}
      </section>

      {/* Pending / Approved tabs and list */}
      <section className="rounded-xl border border-base-border/80 bg-base-elevated/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">Drafts</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setStatusFilter('pending')}
              className={`rounded-lg px-3 py-1.5 text-sm ${statusFilter === 'pending' ? 'bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/50' : 'text-slate-400 hover:bg-base-elevated hover:text-slate-200'}`}
            >
              Pending
            </button>
            <button
              onClick={() => setStatusFilter('approved')}
              className={`rounded-lg px-3 py-1.5 text-sm ${statusFilter === 'approved' ? 'bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/50' : 'text-slate-400 hover:bg-base-elevated hover:text-slate-200'}`}
            >
              Approved
            </button>
          </div>
        </div>
        {actionError && (
          <p className="mb-2 text-sm text-red-400">{actionError}</p>
        )}
        <button
          onClick={loadDrafts}
          className="mb-3 rounded border border-base-border bg-base-elevated px-3 py-1.5 text-xs text-slate-300 hover:bg-base-elevated/80"
        >
          Refresh list
        </button>

        {loadingDrafts ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-slate-500">
            No {statusFilter} drafts. Fetch a certificate above to create one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-base-border text-slate-400">
                  <th className="pb-2 pr-2">Cert</th>
                  <th className="pb-2 pr-2">Grade</th>
                  <th className="pb-2 pr-2">Set</th>
                  <th className="pb-2 pr-2">Num</th>
                  <th className="pb-2 pr-2">Lang</th>
                  <th className="pb-2 pr-2">Card</th>
                  <th className="pb-2 pr-2">Image</th>
                  <th className="pb-2 pr-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.id} className="border-b border-base-border/50">
                    <td className="py-2 pr-2 font-mono text-slate-200">{d.cert}</td>
                    <td className="py-2 pr-2 text-slate-300">{d.grade ?? '–'}</td>
                    <td className="py-2 pr-2 text-slate-300">{d.set_abbr ?? '–'}</td>
                    <td className="py-2 pr-2 text-slate-300">{d.num ?? '–'}</td>
                    <td className="py-2 pr-2 text-slate-300">{d.lang ?? '–'}</td>
                    <td className="max-w-[180px] truncate py-2 pr-2 text-slate-300" title={d.card_name ?? undefined}>
                      {d.card_name ?? '–'}
                    </td>
                    <td className="py-2 pr-2">
                      {d.image_url ? (
                        <img src={d.image_url} alt="" className="h-10 w-auto rounded object-contain" />
                      ) : (
                        '–'
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => openEdit(d)}
                          className="rounded border border-base-border bg-base-elevated px-2 py-1 text-xs text-slate-300 hover:bg-base-elevated/80"
                        >
                          Edit
                        </button>
                        {d.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(d.id)}
                              className="rounded bg-green-600/80 px-2 py-1 text-xs text-white hover:bg-green-500/80"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(d.id)}
                              className="rounded bg-red-600/80 px-2 py-1 text-xs text-white hover:bg-red-500/80"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {d.status === 'approved' && (
                          <button
                            onClick={() => handleCommit(d.id)}
                            className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500"
                          >
                            Commit to inventory
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-500">
        After committing, the slab will appear in your{' '}
        <Link to="/" className="text-blue-400 hover:underline">Slabs inventory</Link>.
      </p>

      {/* Edit modal */}
      {editDraft && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-base-border bg-slate-900 p-4 shadow-xl">
            <h3 className="mb-3 text-sm font-medium text-slate-200">Edit draft – Cert {editDraft.cert}</h3>
            <div className="space-y-2">
              {(['grade', 'set_abbr', 'num', 'lang', 'card_name', 'note', 'order_number', 'acquired_date'] as const).map((field) => (
                <div key={field}>
                  <label className="block text-xs text-slate-500">{field.replace(/_/g, ' ')}</label>
                  <input
                    type="text"
                    value={editForm[field] ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, [field]: e.target.value }))}
                    className="mt-0.5 w-full rounded border border-base-border bg-base/80 px-2 py-1.5 text-sm text-slate-100"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditDraft(null)}
                className="rounded border border-base-border px-3 py-1.5 text-sm text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
