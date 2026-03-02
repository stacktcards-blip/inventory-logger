const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T }> {
  const url = `${API_BASE.replace(/\/$/, '')}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.message ?? json?.error ?? res.statusText
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return json
}

export type SlabIntakeDraft = {
  id: string
  cert: string
  status: 'pending' | 'approved' | 'committed' | 'rejected'
  grade: string | null
  set_abbr: string | null
  num: string | null
  lang: string | null
  grading_company: string | null
  card_name: string | null
  is_1ed: boolean | null
  is_rev: boolean | null
  note: string | null
  order_number: string | null
  acquired_date: string | null
  image_url: string | null
  created_at: string
  updated_at: string
}

export async function fetchByCertNumber(certNumber: string): Promise<SlabIntakeDraft> {
  const { data } = await request<SlabIntakeDraft>('/slab-intake/fetch', {
    method: 'POST',
    body: JSON.stringify({ certNumber: String(certNumber).trim() }),
  })
  return data
}

export async function listDrafts(status: string = 'pending'): Promise<SlabIntakeDraft[]> {
  const { data } = await request<SlabIntakeDraft[]>(
    `/slab-intake/drafts?status=${encodeURIComponent(status)}`
  )
  return data ?? []
}

export async function getDraft(id: string): Promise<SlabIntakeDraft> {
  const { data } = await request<SlabIntakeDraft>(`/slab-intake/drafts/${id}`)
  return data
}

export type DraftUpdates = Partial<{
  grade: string
  set_abbr: string
  num: string
  lang: string
  grading_company: string
  card_name: string
  is_1ed: boolean
  is_rev: boolean
  note: string
  order_number: string
  acquired_date: string
  image_url: string
}>

export async function updateDraft(id: string, updates: DraftUpdates): Promise<SlabIntakeDraft> {
  const { data } = await request<SlabIntakeDraft>(`/slab-intake/drafts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  return data
}

export async function approveDraft(id: string): Promise<SlabIntakeDraft> {
  const { data } = await request<SlabIntakeDraft>(`/slab-intake/drafts/${id}/approve`, {
    method: 'POST',
  })
  return data
}

export async function rejectDraft(id: string): Promise<SlabIntakeDraft> {
  const { data } = await request<SlabIntakeDraft>(`/slab-intake/drafts/${id}/reject`, {
    method: 'POST',
  })
  return data
}

export async function commitDraft(
  id: string,
  committedBy?: string
): Promise<{ slab: { id: string; cert: string; grade: string | null; set_abbr: string | null; num: string | null; lang: string | null } }> {
  const { data } = await request<{ slab: unknown }>(`/slab-intake/drafts/${id}/commit`, {
    method: 'POST',
    body: JSON.stringify({ committed_by: committedBy ?? 'unknown' }),
  })
  return data as { slab: { id: string; cert: string; grade: string | null; set_abbr: string | null; num: string | null; lang: string | null } }
}
