'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { getTrackingUrl } from '@/lib/tracking/urls';
import type { PsaOrderWithInvoiceLines } from '@/types/psa';

type TabId = 'orders' | 'shipping' | 'bulk-add';

function getSubmissionNumbers(o: PsaOrderWithInvoiceLines): string[] {
  const set = new Set<string>();
  if (o.submission_number) set.add(o.submission_number);
  for (const line of o.invoice_lines ?? []) set.add(line.submission_number);
  return Array.from(set);
}

function getInvoiceOrderNumbers(o: PsaOrderWithInvoiceLines): string[] {
  const submissionIds = new Set([o.psa_order_number, o.submission_number].filter(Boolean));
  return (o.invoice_lines ?? [])
    .map((l) => l.invoice_order_no)
    .filter((no): no is string => Boolean(no) && !submissionIds.has(no));
}

export default function OrdersPage() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('orders');
  const [bulkInput, setBulkInput] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped?: number; errors?: string[] } | null>(null);
  const [syncPsaLoading, setSyncPsaLoading] = useState(false);
  const [syncPsaResult, setSyncPsaResult] = useState<{
    synced: number;
    updated: number;
    errors: string[];
  } | null>(null);
  const [ordersNewList, setOrdersNewList] = useState<PsaOrderWithInvoiceLines[]>([]);
  const [ordersNewLoading, setOrdersNewLoading] = useState(false);
  const [syncGmailLoading, setSyncGmailLoading] = useState(false);
  const [syncGmailResult, setSyncGmailResult] = useState<{
    emailsFetched: number;
    ordersCreated: number;
    ordersUpdated: number;
    billingUpdated: number;
    trackingUpdated: number;
    errors: string[];
  } | null>(null);
  const [syncInvoiceLoading, setSyncInvoiceLoading] = useState(false);
  const [syncInvoiceResult, setSyncInvoiceResult] = useState<{
    emailsFetched: number;
    linesUpserted: number;
    ordersUpdated: number;
    errors: string[];
  } | null>(null);
  const [syncShippedLoading, setSyncShippedLoading] = useState(false);
  const [syncShippedResult, setSyncShippedResult] = useState<{
    emailsFetched: number;
    ordersUpdated: number;
    errors: string[];
  } | null>(null);
  const [syncShippingLoading, setSyncShippingLoading] = useState(false);
  const [syncShippingResult, setSyncShippingResult] = useState<{
    synced: number;
    updated: number;
    notified: number;
    errors: string[];
  } | null>(null);
  const [filterArchived, setFilterArchived] = useState<'active' | 'archived' | 'all'>('active');
  const [filterShippingStatus, setFilterShippingStatus] = useState<string>('');

  async function handleBulkAdd() {
    const lines = bulkInput.split(/[\r\n,;]+/).map((n) => n.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const res = await fetch('/api/orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumbers: lines }),
      });
      const data = await res.json();
      if (res.ok) {
        setBulkResult(data);
        setBulkInput('');
        refreshOrdersNew();
      } else {
        setBulkResult({ created: 0, errors: [data.error ?? 'Failed'] });
      }
    } catch (_e) {
      setBulkResult({ created: 0, errors: ['Request failed'] });
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleSyncPsa() {
    setSyncPsaLoading(true);
    setSyncPsaResult(null);
    try {
      const res = await fetch('/api/sync/psa', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSyncPsaResult(data);
        if (activeTab === 'orders') refreshOrdersNew();
      } else {
        setSyncPsaResult({ synced: 0, updated: 0, errors: [data.error ?? 'Sync failed'] });
      }
    } catch (_e) {
      setSyncPsaResult({ synced: 0, updated: 0, errors: ['Request failed'] });
    } finally {
      setSyncPsaLoading(false);
    }
  }

  function refreshOrdersNew() {
    setOrdersNewLoading(true);
    const params = new URLSearchParams();
    params.set('includeInvoiceLines', 'true');
    if (filterArchived === 'archived') params.set('archived', 'true');
    else if (filterArchived === 'all') params.set('archived', 'all');
    if (filterShippingStatus) params.set('shippingStatus', filterShippingStatus);
    fetch(`/api/orders?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setOrdersNewList(Array.isArray(data) ? data : []))
      .finally(() => setOrdersNewLoading(false));
  }

  async function handleArchive(orderId: string) {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived_at: new Date().toISOString() }),
      });
      if (res.ok) refreshOrdersNew();
    } catch (_e) {
      // ignore
    }
  }

  useEffect(() => {
    if (activeTab === 'orders' || activeTab === 'shipping') refreshOrdersNew();
  }, [activeTab, filterArchived, filterShippingStatus]);

  async function handleSyncGmail() {
    setSyncGmailLoading(true);
    setSyncGmailResult(null);
    try {
      const res = await fetch('/api/orders-new/sync-gmail', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSyncGmailResult(data);
        refreshOrdersNew();
      } else {
        setSyncGmailResult({
          emailsFetched: 0,
          ordersCreated: 0,
          ordersUpdated: 0,
          billingUpdated: 0,
          trackingUpdated: 0,
          errors: [data.error ?? 'Sync failed'],
        });
      }
    } catch (_e) {
      setSyncGmailResult({
        emailsFetched: 0,
        ordersCreated: 0,
        ordersUpdated: 0,
        billingUpdated: 0,
        trackingUpdated: 0,
        errors: ['Request failed'],
      });
    } finally {
      setSyncGmailLoading(false);
    }
  }

  async function handleSyncInvoice() {
    setSyncInvoiceLoading(true);
    setSyncInvoiceResult(null);
    try {
      const res = await fetch('/api/orders-new/sync-invoice', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSyncInvoiceResult(data);
        refreshOrdersNew();
      } else {
        setSyncInvoiceResult({
          emailsFetched: 0,
          linesUpserted: 0,
          ordersUpdated: 0,
          errors: [data.error ?? 'Sync failed'],
        });
      }
    } catch (_e) {
      setSyncInvoiceResult({
        emailsFetched: 0,
        linesUpserted: 0,
        ordersUpdated: 0,
        errors: ['Request failed'],
      });
    } finally {
      setSyncInvoiceLoading(false);
    }
  }

  async function handleSyncShipped() {
    setSyncShippedLoading(true);
    setSyncShippedResult(null);
    try {
      const res = await fetch('/api/orders-new/sync-shipped', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSyncShippedResult(data);
        refreshOrdersNew();
      } else {
        setSyncShippedResult({
          emailsFetched: 0,
          ordersUpdated: 0,
          errors: [data.error ?? 'Sync failed'],
        });
      }
    } catch (_e) {
      setSyncShippedResult({
        emailsFetched: 0,
        ordersUpdated: 0,
        errors: ['Request failed'],
      });
    } finally {
      setSyncShippedLoading(false);
    }
  }

  async function handleSyncShipping() {
    setSyncShippingLoading(true);
    setSyncShippingResult(null);
    try {
      const res = await fetch('/api/sync/shipments', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSyncShippingResult(data);
        refreshOrdersNew();
      } else {
        setSyncShippingResult({
          synced: 0,
          updated: 0,
          notified: 0,
          errors: [data.error ?? 'Sync failed'],
        });
      }
    } catch (_e) {
      setSyncShippingResult({
        synced: 0,
        updated: 0,
        notified: 0,
        errors: ['Request failed'],
      });
    } finally {
      setSyncShippingLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold text-gray-900">PSA Order Tracker</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <Link
              href="/orders/new"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              New order
            </Link>
            <button
              onClick={() => signOut()}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex gap-1 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              activeTab === 'orders'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Orders
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('shipping')}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              activeTab === 'shipping'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Shipping
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bulk-add')}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              activeTab === 'bulk-add'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Bulk add
          </button>
        </div>

        {activeTab === 'bulk-add' && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
            <label className="block text-sm font-medium text-gray-700">Bulk add orders (one per line)</label>
            <textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder="Paste PSA order numbers here, one per line..."
              rows={6}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={handleBulkAdd}
                disabled={bulkLoading || !bulkInput.trim()}
                className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
              >
                {bulkLoading ? 'Adding...' : 'Add orders'}
              </button>
              {bulkResult && (
                <span className="text-sm text-gray-600">
                  Created {bulkResult.created}
                  {bulkResult.skipped !== undefined && bulkResult.skipped > 0 && `, ${bulkResult.skipped} already existed`}
                  {bulkResult.errors?.length ? `; ${bulkResult.errors.length} failed` : ''}
                </span>
              )}
            </div>
            {bulkResult?.errors?.length ? (
              <ul className="mt-2 text-sm text-amber-700">
                {bulkResult.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {bulkResult.errors.length > 5 && <li>...and {bulkResult.errors.length - 5} more</li>}
              </ul>
            ) : null}
          </div>
        )}

        {activeTab === 'shipping' && (
          <div className="mb-6 space-y-4">
            <p className="text-sm text-gray-500">
              Shipping-focused view. Use filters below; run Sync shipping to refresh tracking status.
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-4">
              <button
                onClick={handleSyncShipping}
                disabled={syncShippingLoading}
                className="rounded-md bg-slate-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {syncShippingLoading ? 'Syncing...' : 'Sync shipping'}
              </button>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <span>Archived:</span>
                <select
                  value={filterArchived}
                  onChange={(e) => setFilterArchived(e.target.value as 'active' | 'archived' | 'all')}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="active">Active only</option>
                  <option value="archived">Archived only</option>
                  <option value="all">All</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <span>Shipping status:</span>
                <select
                  value={filterShippingStatus}
                  onChange={(e) => setFilterShippingStatus(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="">All</option>
                  <option value="delivered">Delivered</option>
                  <option value="transit">In transit</option>
                  <option value="not_found">Not found</option>
                  <option value="none">No status</option>
                </select>
              </label>
            </div>
            {ordersNewLoading ? (
              <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-gray-500">Loading...</div>
            ) : ordersNewList.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-gray-500">
                No orders. Run &quot;Sync from Gmail&quot; or switch to Orders tab.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Submission number</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Order number</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Billed (USD)</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Sent date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tracking</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tracking status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {ordersNewList.map((o) => {
                      const over720 = o.billed_amount_usd != null && Number(o.billed_amount_usd) > 720;
                      return (
                        <tr
                          key={o.id}
                          className={over720 ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                            <Link href={`/orders/${o.id}`} className="hover:underline">
                              {o.psa_order_number}
                            </Link>
                          </td>
                          <td className="max-w-[12rem] px-4 py-3 text-sm text-gray-600">
                            {getInvoiceOrderNumbers(o).length ? getInvoiceOrderNumbers(o).join(', ') : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{o.status}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                            {o.billed_amount_usd != null ? `$${Number(o.billed_amount_usd).toLocaleString()}` : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                            {o.sent_at ? new Date(o.sent_at).toLocaleDateString(undefined, { dateStyle: 'short' }) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                            {o.tracking_number ? (
                              (() => {
                                const url = getTrackingUrl(o.tracking_number, o.carrier);
                                const label = `${o.tracking_number}${o.carrier ? ` (${o.carrier})` : ''}`;
                                return url ? (
                                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                    {label}
                                  </a>
                                ) : (
                                  <span>{label}</span>
                                );
                              })()
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="max-w-[10rem] truncate px-4 py-3 text-sm text-gray-600" title={o.shipping_status ?? undefined}>
                            {o.shipping_status ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            <div className="flex flex-col items-end gap-1">
                              <Link
                                href={`/orders/${o.id}`}
                                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                View
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleArchive(o.id)}
                                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                                title="Archive order"
                              >
                                Archive
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {syncShippingResult && (
              <div className="text-sm text-gray-600">
                Shipping: {syncShippingResult.synced} DHL orders, {syncShippingResult.updated} updated
                {syncShippingResult.errors.length ? `; ${syncShippingResult.errors.length} errors` : ''}
                {syncShippingResult.errors.length > 0 && (
                  <p className="mt-1 text-amber-700">
                    {syncShippingResult.errors[0]}
                    {syncShippingResult.errors.length > 1 && ` (+${syncShippingResult.errors.length - 1} more)`}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="mb-6 space-y-4">
            <p className="text-sm text-gray-500">
              Gmail-sourced orders. Cron runs every 8h to refresh status via PSA API.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={handleSyncGmail}
                disabled={syncGmailLoading}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {syncGmailLoading ? 'Syncing...' : 'Sync from Gmail'}
              </button>
              <button
                onClick={handleSyncPsa}
                disabled={syncPsaLoading}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {syncPsaLoading ? 'Syncing...' : 'Sync PSA status'}
              </button>
              <button
                onClick={handleSyncInvoice}
                disabled={syncInvoiceLoading}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {syncInvoiceLoading ? 'Syncing...' : 'Sync to invoice'}
              </button>
              <button
                onClick={handleSyncShipped}
                disabled={syncShippedLoading}
                className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {syncShippedLoading ? 'Syncing...' : 'Sync shipped'}
              </button>
              <button
                onClick={handleSyncShipping}
                disabled={syncShippingLoading}
                className="rounded-md bg-slate-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {syncShippingLoading ? 'Syncing...' : 'Sync shipping'}
              </button>
              {syncGmailResult && (
                <div className="text-sm text-gray-600">
                  <span>
                    {syncGmailResult.emailsFetched} “We Received Your Package” emails, +{syncGmailResult.ordersCreated} orders, {syncGmailResult.ordersUpdated} updated
                    {syncGmailResult.errors.length ? `; ${syncGmailResult.errors.length} errors` : ''}
                  </span>
                  {syncGmailResult.errors.length > 0 && (
                    <p className="mt-1 text-amber-700">
                      {syncGmailResult.errors[0]}
                      {syncGmailResult.errors.length > 1 && ` (+${syncGmailResult.errors.length - 1} more)`}
                    </p>
                  )}
                </div>
              )}
              {syncInvoiceResult && (
                <div className="text-sm text-gray-600">
                  {syncInvoiceResult.emailsFetched} invoice emails, {syncInvoiceResult.linesUpserted} lines, {syncInvoiceResult.ordersUpdated} orders updated
                  {syncInvoiceResult.errors.length ? `; ${syncInvoiceResult.errors.length} errors` : ''}
                  {syncInvoiceResult.errors.length > 0 && (
                    <p className="mt-1 text-amber-700">
                      {syncInvoiceResult.errors[0]}
                      {syncInvoiceResult.errors.length > 1 && ` (+${syncInvoiceResult.errors.length - 1} more)`}
                    </p>
                  )}
                </div>
              )}
              {syncShippedResult && (
                <div className="text-sm text-gray-600">
                  {syncShippedResult.emailsFetched} shipped emails, {syncShippedResult.ordersUpdated} orders updated (courier, tracking, sent date)
                  {syncShippedResult.errors.length ? `; ${syncShippedResult.errors.length} errors` : ''}
                  {syncShippedResult.errors.length > 0 && (
                    <p className="mt-1 text-amber-700">
                      {syncShippedResult.errors[0]}
                      {syncShippedResult.errors.length > 1 && ` (+${syncShippedResult.errors.length - 1} more)`}
                    </p>
                  )}
                </div>
              )}
              {syncShippingResult && (
                <div className="text-sm text-gray-600">
                  Shipping: {syncShippingResult.synced} DHL orders, {syncShippingResult.updated} updated
                  {syncShippingResult.errors.length ? `; ${syncShippingResult.errors.length} errors` : ''}
                  {syncShippingResult.errors.length > 0 && (
                    <p className="mt-1 text-amber-700">
                      {syncShippingResult.errors[0]}
                      {syncShippingResult.errors.length > 1 && ` (+${syncShippingResult.errors.length - 1} more)`}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <span>Archived:</span>
                <select
                  value={filterArchived}
                  onChange={(e) => setFilterArchived(e.target.value as 'active' | 'archived' | 'all')}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="active">Active only</option>
                  <option value="archived">Archived only</option>
                  <option value="all">All</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <span>Shipping status:</span>
                <select
                  value={filterShippingStatus}
                  onChange={(e) => setFilterShippingStatus(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="">All</option>
                  <option value="delivered">Delivered</option>
                  <option value="transit">In transit</option>
                  <option value="not_found">Not found</option>
                  <option value="none">No status</option>
                </select>
              </label>
            </div>
            {ordersNewLoading ? (
              <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-gray-500">Loading...</div>
            ) : ordersNewList.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-gray-500">
                No orders. Run &quot;Sync from Gmail&quot; to import from PSA emails.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Submission number</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Order number</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Service</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Arrive</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Billed (USD)</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Sent date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tracking</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Shipping status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {ordersNewList.map((o) => {
                      const over720 = o.billed_amount_usd != null && Number(o.billed_amount_usd) > 720;
                      return (
                        <tr
                          key={o.id}
                          className={over720 ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                            <Link href={`/orders/${o.id}`} className="hover:underline">
                              {o.psa_order_number}
                            </Link>
                          </td>
                          <td className="max-w-[12rem] px-4 py-3 text-sm text-gray-600">
                            {getInvoiceOrderNumbers(o).length ? getInvoiceOrderNumbers(o).join(', ') : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{o.service_level ?? '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                            {o.received_package_at ? new Date(o.received_package_at).toLocaleDateString(undefined, { dateStyle: 'short' }) : (o.estimated_arrival_date ?? '—')}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{o.status}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                            {o.billed_amount_usd != null ? `$${Number(o.billed_amount_usd).toLocaleString()}` : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                            {o.sent_at ? new Date(o.sent_at).toLocaleDateString(undefined, { dateStyle: 'short' }) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                            {o.tracking_number ? (
                              (() => {
                                const url = getTrackingUrl(o.tracking_number, o.carrier);
                                const label = `${o.tracking_number}${o.carrier ? ` (${o.carrier})` : ''}`;
                                return url ? (
                                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                    {label}
                                  </a>
                                ) : (
                                  <span>{label}</span>
                                );
                              })()
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="max-w-[10rem] truncate px-4 py-3 text-sm text-gray-600" title={o.shipping_status ?? undefined}>
                            {o.shipping_status ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            <div className="flex flex-col items-end gap-1">
                              <Link
                                href={`/orders/${o.id}`}
                                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                View
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleArchive(o.id)}
                                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                                title="Archive order"
                              >
                                Archive
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
