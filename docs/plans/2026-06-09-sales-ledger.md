# eBay Sales Ledger Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Ship a first-class Sales Ledger view in the main Stackt inventory app that lists every synced eBay sale, surfaces fulfillment/match state, and shows purchase-cost context + gross margin so ops can reconcile revenue against inventory without leaving the dashboard.

**Architecture:** Extend the existing `ebay_sales` table with channel + financial columns, add a `sales_ledger` Postgres view that joins `ebay_sales` → `slabs` → `raw_cards`, expose a paginated `/ebay/sales/ledger` API backed by a new repository, auto-link sales to slabs by SKU after every sync, and render the ledger via a new React page that consumes the backend API (with filters + summaries).

**Tech Stack:** Postgres/Supabase SQL migrations, Express + TypeScript backend (supabase-js service role client), React + Vite frontend, Tailwind UI components, npm test/build.

---

### Task 1: Add ledger columns + view migration

**Objective:** Extend `ebay_sales` with sales-channel + financial columns and materialize a `sales_ledger` view that enriches each sale with slab + raw-card cost data and profit metrics.

**Files:**
- Create: `migrations/042_sales_ledger_view.sql`

**Step 1: Add migration skeleton**

```sql
-- migrations/042_sales_ledger_view.sql
alter table ebay_sales
  add column if not exists sales_channel text not null default 'EBAY',
  add column if not exists shipping_cost numeric,
  add column if not exists order_total numeric,
  add column if not exists order_currency text;

create index if not exists idx_ebay_sales_channel on ebay_sales(sales_channel);

-- Drop/recreate to keep deterministic definition
drop view if exists sales_ledger;

create view sales_ledger as
with sale_rows as (
  select
    es.id as sale_id,
    es.sales_channel,
    es.ebay_order_id,
    es.ebay_line_item_id,
    es.ebay_item_id,
    es.ebay_sku,
    es.title,
    es.quantity,
    es.sale_price,
    es.currency,
    es.shipping_cost,
    es.order_total,
    es.order_currency,
    es.sold_date,
    es.buyer_username,
    es.fulfillment_status,
    es.match_status,
    es.match_method,
    es.parse_confidence,
    es.slab_id,
    es.image_url,
    es.created_at,
    es.updated_at
  from ebay_sales es
)
select
  sr.*,
  s.cert as slab_cert,
  s.grade as slab_grade,
  s.grading_company as slab_grading_company,
  s.set_abbr as slab_set_abbr,
  s.num as slab_num,
  s.lang as slab_lang,
  s.listing_state,
  s.sale_price as slab_recorded_sale_price,
  s.sale_currency as slab_sale_currency,
  s.sold_date as slab_sold_date,
  s.raw_card_id,
  r.purchase_price as raw_purchase_price,
  r.currency as raw_purchase_currency,
  r.exchange_rate as raw_exchange_rate,
  r.purchase_date as raw_purchase_date,
  r.seller as raw_seller,
  case
    when r.purchase_price is not null and r.exchange_rate is not null
      then round(r.purchase_price * r.exchange_rate, 2)
    else null
  end as raw_cost_aud,
  case
    when sr.sale_price is not null and r.purchase_price is not null and r.exchange_rate is not null
      then round(sr.sale_price - (r.purchase_price * r.exchange_rate), 2)
    else null
  end as gross_profit_aud,
  case
    when sr.sold_date is not null and r.purchase_date is not null
      then (sr.sold_date::date - r.purchase_date::date)
    else null
  end as days_held
from sale_rows sr
left join slabs s on s.id = sr.slab_id
left join raw_cards r on r.id = s.raw_card_id;

revoke all on sales_ledger from anon;
grant select on sales_ledger to authenticated;
```

**Step 2: Run formatting + verify migration order**

Run:

```bash
cd /root/projects/inventory-logger
ls migrations | sort -n
```

Ensure `042_sales_ledger_view.sql` is last.

**Step 3: Commit migration**

```bash
git add migrations/042_sales_ledger_view.sql
git commit -m "migrations: add sales ledger view"
```

---

### Task 2: Create ledger repository + types

**Objective:** Provide backend helpers that query `sales_ledger` with filters, pagination, and aggregate stats.

**Files:**
- Create: `src/repositories/salesLedgerRepo.ts`
- Modify: `src/repositories/index.ts` (if export barrel exists)

**Step 1: Add repo implementation**

```ts
// src/repositories/salesLedgerRepo.ts
import { supabase } from './supabaseClient.js'

export type SalesLedgerFilters = {
  startDate?: string
  endDate?: string
  matchStatus?: string
  fulfillmentStatus?: string
  search?: string
}

export type SalesLedgerRow = {
  sale_id: string
  sales_channel: string
  sold_date: string | null
  title: string | null
  buyer_username: string | null
  quantity: number
  sale_price: number | null
  currency: string | null
  shipping_cost: number | null
  fulfillment_status: string | null
  match_status: string
  match_method: string | null
  slab_id: string | null
  slab_cert: string | null
  slab_grade: string | null
  slab_grading_company: string | null
  slab_set_abbr: string | null
  slab_num: string | null
  slab_lang: string | null
  raw_card_id: number | null
  raw_cost_aud: number | null
  gross_profit_aud: number | null
  days_held: number | null
  image_url: string | null
}

export type SalesLedgerQuery = {
  filters: SalesLedgerFilters
  limit?: number
  offset?: number
}

export async function fetchSalesLedger({ filters, limit = 50, offset = 0 }: SalesLedgerQuery) {
  let query = supabase.from('sales_ledger').select('*', { count: 'exact' })
  if (filters.startDate) query = query.gte('sold_date', filters.startDate)
  if (filters.endDate) query = query.lte('sold_date', filters.endDate)
  if (filters.matchStatus) query = query.eq('match_status', filters.matchStatus)
  if (filters.fulfillmentStatus) query = query.eq('fulfillment_status', filters.fulfillmentStatus)
  if (filters.search) {
    query = query.or(`title.ilike.%${filters.search}%,slab_cert.ilike.%${filters.search}%,slab_set_abbr.ilike.%${filters.search}%`)
  }
  const { data, error, count } = await query
    .order('sold_date', { ascending: false, nullsLast: true })
    .order('updated_at', { ascending: false, nullsLast: true })
    .limit(limit)
    .range(offset, offset + limit - 1)
  if (error) throw error

  const { data: summaryRows, error: summaryError } = await supabase
    .from('sales_ledger')
    .select('sale_price, raw_cost_aud, gross_profit_aud')
    .gte('sold_date', filters.startDate ?? '1900-01-01')
  if (summaryError) throw summaryError

  const totals = (summaryRows ?? []).reduce(
    (acc, row) => {
      acc.gross += Number(row.sale_price ?? 0)
      acc.cost += Number(row.raw_cost_aud ?? 0)
      acc.profit += Number(row.gross_profit_aud ?? 0)
      return acc
    },
    { gross: 0, cost: 0, profit: 0 }
  )

  return { rows: (data ?? []) as SalesLedgerRow[], total: count ?? 0, totals }
}
```

**Step 2: Export repo (if needed)**

```ts
// src/repositories/index.ts
export * from './salesLedgerRepo.js'
```

**Step 3: Commit**

```bash
git add src/repositories/salesLedgerRepo.ts src/repositories/index.ts
git commit -m "feat: add sales ledger repository"
```

---

### Task 3: Auto-match sales to slabs by SKU

**Objective:** Introduce a matching service that links unmatched sales to slabs using SKU equality, updates both tables, and run it after every sync.

**Files:**
- Create: `src/services/ebaySalesMatchingService.ts`
- Modify: `src/services/ebaySalesSyncService.ts`

**Step 1: Implement matcher**

```ts
// src/services/ebaySalesMatchingService.ts
import { supabase } from '../repositories/supabaseClient.js'

export async function autoMatchSalesBySku(params: { soldSince?: string } = {}) {
  const filters = supabase
    .from('ebay_sales')
    .select('id, sold_date, sale_price, currency, ebay_sku')
    .is('slab_id', null)
    .eq('match_status', 'PENDING')
    .not('ebay_sku', 'is', null)
  const { data: pending, error } = params.soldSince
    ? await filters.gte('sold_date', params.soldSince)
    : await filters
  if (error) throw new Error(`Failed to load pending sales: ${error.message}`)

  for (const sale of pending ?? []) {
    const { data: slabs, error: slabError } = await supabase
      .from('slabs')
      .select('id, sold_date, sale_price, sale_currency')
      .eq('sku', sale.ebay_sku)
      .limit(2)
    if (slabError) throw new Error(`Failed to look up slab for SKU ${sale.ebay_sku}: ${slabError.message}`)
    if (!slabs || slabs.length !== 1) continue
    const slab = slabs[0]
    const { error: updateSaleError } = await supabase
      .from('ebay_sales')
      .update({
        slab_id: slab.id,
        match_status: 'MATCHED',
        match_method: 'SKU',
        matched_at: new Date().toISOString(),
      })
      .eq('id', sale.id)
    if (updateSaleError) throw new Error(`Failed to update sale ${sale.id}: ${updateSaleError.message}`)

    const { error: updateSlabError } = await supabase
      .from('slabs')
      .update({
        sold_date: sale.sold_date ?? slab.sold_date ?? new Date().toISOString(),
        sale_price: sale.sale_price ?? slab.sale_price,
        sale_currency: sale.currency ?? slab.sale_currency ?? 'AUD',
        ebay_sale_id: sale.id,
        listing_state: 'LISTED',
      })
      .eq('id', slab.id)
    if (updateSlabError) throw new Error(`Failed to update slab ${slab.id}: ${updateSlabError.message}`)
  }

  return { salesReviewed: pending?.length ?? 0 }
}
```

**Step 2: Call matcher after sync**

```ts
// src/services/ebaySalesSyncService.ts
import { autoMatchSalesBySku } from './ebaySalesMatchingService.js'

// inside syncEbaySalesReadOnly after upsertEbaySalesOrders
const result = await upsertEbaySalesOrders(orders)
await autoMatchSalesBySku({ soldSince: startDate.toISOString().slice(0, 10) })
await completeEbaySyncLog(...)
```

**Step 3: Commit**

```bash
git add src/services/ebaySalesMatchingService.ts src/services/ebaySalesSyncService.ts
git commit -m "feat: auto match ebay sales by sku"
```

---

### Task 4: Expose `/ebay/sales/ledger` API

**Objective:** Add an authenticated route that serves paginated ledger rows + summary aggregates to the frontend.

**Files:**
- Modify: `src/routes/ebaySales.ts`
- Modify: `src/types` if new types needed

**Step 1: Add handler**

```ts
// src/routes/ebaySales.ts
import { fetchSalesLedger } from '../repositories/salesLedgerRepo.js'

ebaySalesRouter.get('/ledger', async (req, res, next) => {
  try {
    const { startDate, endDate, matchStatus, fulfillmentStatus, search, limit, offset } = req.query
    const result = await fetchSalesLedger({
      filters: {
        startDate: typeof startDate === 'string' ? startDate : undefined,
        endDate: typeof endDate === 'string' ? endDate : undefined,
        matchStatus: typeof matchStatus === 'string' && matchStatus ? matchStatus : undefined,
        fulfillmentStatus: typeof fulfillmentStatus === 'string' && fulfillmentStatus ? fulfillmentStatus : undefined,
        search: typeof search === 'string' && search ? search : undefined,
      },
      limit: limit ? Math.min(Number(limit), 200) : 50,
      offset: offset ? Number(offset) : 0,
    })
    res.json(result)
  } catch (error) {
    next(error)
  }
})
```

**Step 2: Commit**

```bash
git add src/routes/ebaySales.ts
git commit -m "feat: add ebay sales ledger api"
```

---

### Task 5: Frontend API client for ledger

**Objective:** Provide typed client helpers the React page can call.

**Files:**
- Modify: `frontend/src/lib/ebaySalesApi.ts`
- Create: `frontend/src/types/salesLedger.ts`

**Step 1: Add types + fetcher**

```ts
// frontend/src/types/salesLedger.ts
export type SalesLedgerRow = {
  saleId: string
  soldDate: string | null
  title: string | null
  buyerUsername: string | null
  salePrice: number | null
  currency: string | null
  shippingCost: number | null
  fulfillmentStatus: string | null
  matchStatus: string
  matchMethod: string | null
  slabCert: string | null
  slabGrade: string | null
  slabGradingCompany: string | null
  slabSetAbbr: string | null
  slabNum: string | null
  slabLang: string | null
  rawCostAud: number | null
  grossProfitAud: number | null
  daysHeld: number | null
  imageUrl: string | null
}

export type SalesLedgerResponse = {
  rows: SalesLedgerRow[]
  total: number
  totals: { gross: number; cost: number; profit: number }
}
```

```ts
// frontend/src/lib/ebaySalesApi.ts
export async function fetchSalesLedger(params: URLSearchParams): Promise<SalesLedgerResponse> {
  const query = params.toString() ? `?${params}` : ''
  return request<SalesLedgerResponse>(`/ebay/sales/ledger${query}`)
}
```

**Step 2: Commit**

```bash
cd frontend
git add src/lib/ebaySalesApi.ts src/types/salesLedger.ts
git commit -m "feat: add sales ledger api client"
```

---

### Task 6: Build Sales Ledger page + components

**Objective:** Render the ledger table with filters, summary badges, pagination, and link-outs.

**Files:**
- Create: `frontend/src/pages/SalesLedgerPage.tsx`
- Create: `frontend/src/components/SalesLedgerFilters.tsx`
- Create: `frontend/src/components/SalesLedgerTable.tsx`
- Modify: `frontend/src/pages/OperationsDashboardPage.tsx` (link button)

**Step 1: Implement filters component**

```tsx
// frontend/src/components/SalesLedgerFilters.tsx
import { useState } from 'react'

type Props = {
  initial: { startDate: string; endDate: string; matchStatus: string; fulfillmentStatus: string; search: string }
  onChange: (next: Props['initial']) => void
}

export function SalesLedgerFilters({ initial, onChange }: Props) {
  const [filters, setFilters] = useState(initial)
  const update = (patch: Partial<Props['initial']>) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    onChange(next)
  }
  return (
    <div className="flex flex-wrap gap-3">
      <input type="date" value={filters.startDate} onChange={(e) => update({ startDate: e.target.value })} />
      <input type="date" value={filters.endDate} onChange={(e) => update({ endDate: e.target.value })} />
      <select value={filters.matchStatus} onChange={(e) => update({ matchStatus: e.target.value })}>
        <option value="">All match states</option>
        <option value="PENDING">Pending</option>
        <option value="MATCHED">Matched</option>
        <option value="MANUAL_REVIEW">Manual review</option>
      </select>
      <select value={filters.fulfillmentStatus} onChange={(e) => update({ fulfillmentStatus: e.target.value })}>
        <option value="">All fulfillment</option>
        <option value="NOT_STARTED">Awaiting postage</option>
        <option value="IN_PROGRESS">Packing</option>
        <option value="FULFILLED">Fulfilled</option>
      </select>
      <input
        type="search"
        placeholder="Search title, cert, SKU"
        value={filters.search}
        onChange={(e) => update({ search: e.target.value })}
      />
    </div>
  )
}
```

**Step 2: Table component**

```tsx
// frontend/src/components/SalesLedgerTable.tsx
import type { SalesLedgerRow } from '../types/salesLedger'
import { formatCurrency } from '../lib/formatCurrency'

export function SalesLedgerTable({ rows }: { rows: SalesLedgerRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800/80">
      <table className="min-w-full divide-y divide-slate-800">
        <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 text-left">Sold</th>
            <th className="px-4 py-3 text-left">Card</th>
            <th className="px-4 py-3 text-left">Buyer</th>
            <th className="px-4 py-3 text-right">Sale</th>
            <th className="px-4 py-3 text-right">Cost</th>
            <th className="px-4 py-3 text-right">Profit</th>
            <th className="px-4 py-3">Match</th>
            <th className="px-4 py-3">Fulfillment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-950/40">
          {rows.map((row) => (
            <tr key={row.saleId} className="hover:bg-slate-900/40">
              <td className="px-4 py-3 text-sm text-slate-300">{row.soldDate ?? '—'}</td>
              <td className="px-4 py-3 text-sm text-slate-100">
                <div className="font-medium">{row.slabCert ? `${row.slabCert} · ${row.slabGrade ?? ''}` : row.title ?? '—'}</div>
                <div className="text-xs text-slate-500">{row.slabSetAbbr ?? row.matchMethod ?? ''}</div>
              </td>
              <td className="px-4 py-3 text-sm text-slate-400">{row.buyerUsername ?? '—'}</td>
              <td className="px-4 py-3 text-right text-sm text-slate-100">{formatCurrency(row.salePrice, row.currency)}</td>
              <td className="px-4 py-3 text-right text-sm text-slate-300">{formatCurrency(row.rawCostAud, 'AUD')}</td>
              <td className="px-4 py-3 text-right text-sm text-slate-100">{formatCurrency(row.grossProfitAud, 'AUD')}</td>
              <td className="px-4 py-3 text-center text-xs">
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-200">{row.matchStatus}</span>
              </td>
              <td className="px-4 py-3 text-center text-xs text-slate-400">{row.fulfillmentStatus ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

**Step 3: Page container**

```tsx
// frontend/src/pages/SalesLedgerPage.tsx
import { useEffect, useMemo, useState } from 'react'
import { fetchSalesLedger } from '../lib/ebaySalesApi'
import { SalesLedgerFilters } from '../components/SalesLedgerFilters'
import { SalesLedgerTable } from '../components/SalesLedgerTable'

const today = new Date().toISOString().slice(0, 10)
const defaultStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

export function SalesLedgerPage() {
  const [filters, setFilters] = useState({ startDate: defaultStart, endDate: today, matchStatus: '', fulfillmentStatus: '', search: '' })
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState({ gross: 0, cost: 0, profit: 0 })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.startDate) params.set('startDate', filters.startDate)
    if (filters.endDate) params.set('endDate', filters.endDate)
    if (filters.matchStatus) params.set('matchStatus', filters.matchStatus)
    if (filters.fulfillmentStatus) params.set('fulfillmentStatus', filters.fulfillmentStatus)
    if (filters.search) params.set('search', filters.search)
    setLoading(true)
    fetchSalesLedger(params)
      .then((response) => {
        setRows(response.rows)
        setSummary(response.totals)
      })
      .finally(() => setLoading(false))
  }, [filters])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Sales Ledger</h1>
          <p className="text-sm text-slate-400">Synced from eBay · costs linked via slabs/raw cards.</p>
        </div>
      </div>
      <SalesLedgerFilters initial={filters} onChange={setFilters} />
      <div className="grid gap-4 sm:grid-cols-3">
        <LedgerStat label="Gross (AUD)" value={summary.gross} tone="good" />
        <LedgerStat label="Purchase Cost (AUD)" value={summary.cost} tone="warn" />
        <LedgerStat label="Gross Profit (AUD)" value={summary.profit} tone="info" />
      </div>
      {loading ? <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-8 text-center text-slate-400">Loading…</div> : <SalesLedgerTable rows={rows} />}
    </div>
  )
}
```

**Step 4: Update dashboard CTA (optional)**

Add a "View ledger" button in the eBay panel pointing to `/sales`.

**Step 5: Commit**

```bash
cd frontend
git add src/components/SalesLedgerFilters.tsx src/components/SalesLedgerTable.tsx src/pages/SalesLedgerPage.tsx src/pages/OperationsDashboardPage.tsx
git commit -m "feat: add sales ledger page"
```

---

### Task 7: Wire routes + navigation

**Objective:** Register the new page in the router and top navigation.

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AppLayout.tsx`

**Step 1: Add route**

```tsx
// frontend/src/App.tsx
import { SalesLedgerPage } from './pages/SalesLedgerPage'
...
<Route path="sales" element={<SalesLedgerPage />} />
```

**Step 2: Add nav link**

```tsx
// frontend/src/components/AppLayout.tsx
{navLink('/sales', 'Sales Ledger')}
```

**Step 3: Commit**

```bash
cd frontend
git add src/App.tsx src/components/AppLayout.tsx
git commit -m "feat: add sales ledger nav"
```

---

### Task 8: Verify + deploy

**Objective:** Ensure migrations compile, backend passes tests, frontend builds, and summarize deployment steps.

**Step 1: Run backend tests**

```bash
cd /root/projects/inventory-logger
npm test
```

**Step 2: Build frontend**

```bash
cd frontend
npm install
npm run build
```

**Step 3: Document deployment**

- Apply migration via Supabase CLI or SQL runner.
- Redeploy backend (Railway/Fly/Render) so new routes + matcher go live.
- Redeploy frontend (Vercel) so `/sales` route is available.
- Smoke test `GET https://api.stacktapp.com/ebay/sales/ledger` and `https://www.stacktapp.com/sales`.

**Step 4: Commit final checklist**

```bash
git status
```

Ensure only intended files staged before final PR.

---

**Ready to execute.**
