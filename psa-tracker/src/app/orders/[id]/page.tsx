'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getTrackingUrl } from '@/lib/tracking/urls';
import type { PsaOrderWithCards, PsaOrderInvoiceLine } from '@/types/psa';
import type { SlabMatchesForOrder } from '@/lib/slabs/slabs-adapter.interface';

const SLABS_BASE = process.env.NEXT_PUBLIC_SLABS_INVENTORY_URL ?? '';

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [order, setOrder] = useState<PsaOrderWithCards | null>(null);
  const [slabMatches, setSlabMatches] = useState<SlabMatchesForOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [shipmentSyncing, setShipmentSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then((r) => r.json())
      .then(setOrder)
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/orders/${id}/slab-matches`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setSlabMatches)
      .catch(() => setSlabMatches(null));
  }, [id]);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/orders/${id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.updated) {
        const r = await fetch(`/api/orders/${id}`);
        const o = await r.json();
        setOrder(o);
      } else if (!res.ok && data.error) {
        setSyncError(data.error);
      } else if (res.ok && !data.updated && data.message) {
        setSyncError(data.message);
      }
    } catch {
      setSyncError('Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const canSyncShipment =
    !!order &&
    !!order.tracking_number &&
    (order.carrier ?? '').toLowerCase().includes('dhl') &&
    !order.delivered_at;

  const canArchive = !!order?.delivered_at && !order?.archived_at;
  const canUnarchive = !!order?.archived_at;

  async function handleArchive() {
    if (!canArchive) return;
    setArchiving(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/orders/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      });
      if (res.ok) {
        const r = await fetch(`/api/orders/${id}`);
        const o = await r.json();
        setOrder(o);
      } else {
        const data = await res.json();
        setSyncError(data.error ?? 'Archive failed');
      }
    } catch {
      setSyncError('Archive failed');
    } finally {
      setArchiving(false);
    }
  }

  async function handleUnarchive() {
    if (!canUnarchive) return;
    setArchiving(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/orders/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unarchive' }),
      });
      if (res.ok) {
        const r = await fetch(`/api/orders/${id}`);
        const o = await r.json();
        setOrder(o);
      } else {
        const data = await res.json();
        setSyncError(data.error ?? 'Unarchive failed');
      }
    } catch {
      setSyncError('Unarchive failed');
    } finally {
      setArchiving(false);
    }
  }

  async function handleShipmentSync() {
    if (!canSyncShipment) return;
    setShipmentSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/orders/${id}/shipment-sync`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && (data.updated || data.notified)) {
        const r = await fetch(`/api/orders/${id}`);
        const o = await r.json();
        setOrder(o);
      } else if (!res.ok && data.error) {
        setSyncError(data.error);
      } else if (res.ok && !data.updated && !data.notified && data.error) {
        setSyncError(data.error);
      }
    } catch {
      setSyncError('Shipment sync failed');
    } finally {
      setShipmentSyncing(false);
    }
  }

  if (loading || !order) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">{loading ? 'Loading...' : 'Order not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/orders" className="text-sm text-gray-600 hover:text-gray-900">
            ← Back to orders
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {syncError && (
          <div className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            {syncError}
          </div>
        )}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Submission number: {order.psa_order_number}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Order number: {(() => {
                const lines = (order as { invoice_lines?: PsaOrderInvoiceLine[] }).invoice_lines ?? [];
                const submissionIds = new Set([order.psa_order_number, order.submission_number].filter(Boolean));
                const orderNos = lines
                  .map((l) => l.invoice_order_no)
                  .filter((no) => Boolean(no) && !submissionIds.has(no));
                return orderNos.length ? orderNos.join(', ') : '—';
              })()}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Status: {order.status}
              {order.status_detail && ` — ${order.status_detail}`}
            </p>
            {(order.courier || order.tracking_number) && (
              <p className="mt-1 text-sm text-gray-600">
                {order.courier && <span>Courier: {order.courier}</span>}
                {order.courier && order.tracking_number && ' · '}
                {order.tracking_number && (
                  <>
                    Tracking:{' '}
                    {(() => {
                      const url = getTrackingUrl(order.tracking_number, order.carrier);
                      const label = `${order.tracking_number}${order.carrier ? ` (${order.carrier})` : ''}`;
                      return url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {label}
                        </a>
                      ) : (
                        <span>{label}</span>
                      );
                    })()}
                  </>
                )}
              </p>
            )}
            {order.sent_at && (
              <p className="mt-1 text-sm text-gray-500">
                Sent: {new Date(order.sent_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </p>
            )}
            {order.notes && (
              <p className="mt-1 text-sm text-gray-500">Notes: {order.notes}</p>
            )}
            {SLABS_BASE && slabMatches?.orderLevelMatches?.[0]?.grading_order_id != null && (
              <p className="mt-1 text-sm">
                <a
                  href={`${SLABS_BASE}/?grading_order_id=${slabMatches.orderLevelMatches[0].grading_order_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View in Slabs Inventory →
                </a>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync PSA'}
            </button>
            {canSyncShipment && (
              <button
                onClick={handleShipmentSync}
                disabled={shipmentSyncing}
                className="rounded-md border border-green-300 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
              >
                {shipmentSyncing ? 'Syncing...' : 'Sync shipment'}
              </button>
            )}
            {canArchive && (
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {archiving ? 'Archiving...' : 'Archive'}
              </button>
            )}
            {canUnarchive && (
              <button
                onClick={handleUnarchive}
                disabled={archiving}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {archiving ? 'Restoring...' : 'Unarchive'}
              </button>
            )}
            <Link
              href={`/orders/${id}/edit`}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Edit
            </Link>
          </div>
        </div>

        {(order as { invoice_lines?: PsaOrderInvoiceLine[] }).invoice_lines?.length ? (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-medium text-gray-700">Invoice lines (Submission No. / amounts)</h2>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4">Submission No.</th>
                  <th className="py-2 pr-4">Order Amount</th>
                  <th className="py-2 pr-4">Payment Amount</th>
                  <th className="py-2">Balance Due</th>
                </tr>
              </thead>
              <tbody>
                {((order as { invoice_lines?: PsaOrderInvoiceLine[] }).invoice_lines ?? []).map((line, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium">{line.submission_number}</td>
                    <td className="py-2 pr-4">{line.order_amount != null ? `$${Number(line.order_amount).toLocaleString()}` : '—'}</td>
                    <td className="py-2 pr-4">{line.payment_amount != null ? `$${Number(line.payment_amount).toLocaleString()}` : '—'}</td>
                    <td className="py-2">{line.balance_due != null ? `$${Number(line.balance_due).toLocaleString()}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="font-medium text-gray-900">Cards ({order.cards?.length ?? 0})</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddCard(true)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Add card
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Import CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            {!order.cards?.length ? (
              <div className="px-4 py-8 text-center text-gray-500">
                No cards yet. Add manually or import from CSV.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Card</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Set</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">#</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Lang</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Qty</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Grade</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Cert</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Matched slab(s)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {order.cards.map((c) => {
                    const cardMatches = slabMatches?.byCard.find((m) => m.cardId === c.id);
                    const matches = cardMatches?.matches ?? [];
                    return (
                      <tr key={c.id}>
                        <td className="px-4 py-2 text-sm text-gray-900">{c.card_name}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{c.set_abbr}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{c.card_number}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{c.lang}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{c.quantity}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{c.grade_result ?? '—'}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{c.cert_number ?? '—'}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {matches.length === 0 ? (
                            '—'
                          ) : (
                            <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                              {matches.map((s, i) => (
                                <span key={s.id} className="inline-flex items-center gap-1">
                                  {i > 0 && <span className="text-gray-400">·</span>}
                                  {SLABS_BASE && s.grading_order_id != null ? (
                                    <a
                                      href={`${SLABS_BASE}/?grading_order_id=${s.grading_order_id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline"
                                    >
                                      {s.sku ?? s.cert ?? s.id.slice(0, 8)}
                                    </a>
                                  ) : (
                                    <span>{s.sku ?? s.cert ?? s.id.slice(0, 8)}</span>
                                  )}
                                  {s.grade && (
                                    <span className="text-gray-400">({s.grade})</span>
                                  )}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {showAddCard && (
        <AddCardModal
          orderId={id}
          onClose={() => setShowAddCard(false)}
          onAdded={() => {
            setShowAddCard(false);
            fetch(`/api/orders/${id}`).then((r) => r.json()).then(setOrder);
          }}
        />
      )}

      {showImport && (
        <ImportCsvModal
          orderId={id}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            fetch(`/api/orders/${id}`).then((r) => r.json()).then(setOrder);
          }}
        />
      )}
    </div>
  );
}

function AddCardModal({
  orderId,
  onClose,
  onAdded,
}: {
  orderId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [cardName, setCardName] = useState('');
  const [setAbbr, setSetAbbr] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [lang, setLang] = useState('EN');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/orders/${orderId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_name: cardName.trim(),
        set_abbr: setAbbr.trim(),
        card_number: cardNumber.trim(),
        lang: lang.trim() || 'EN',
        quantity,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? 'Failed to add card');
      return;
    }
    onAdded();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Add card</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            placeholder="Card name *"
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            required
            className="block w-full rounded-md border px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Set (e.g. 1ED)"
              value={setAbbr}
              onChange={(e) => setSetAbbr(e.target.value)}
              required
              className="rounded-md border px-3 py-2 text-sm"
            />
            <input
              placeholder="Card #"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              required
              className="rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <input
              placeholder="Lang"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="w-20 rounded-md border px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
              className="w-20 rounded-md border px-3 py-2 text-sm"
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportCsvModal({
  orderId,
  onClose,
  onImported,
}: {
  orderId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [csv, setCsv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/orders/${orderId}/cards/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csv.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? 'Import failed');
      return;
    }
    onImported();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold">Import cards from CSV</h2>
        <p className="mb-4 text-sm text-gray-500">
          Columns: card_name, set_abbr, card_number (optional: lang, quantity, declared_value, grade_result, cert_number)
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            placeholder="Paste CSV here..."
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={8}
            className="block w-full rounded-md border px-3 py-2 font-mono text-sm"
          />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !csv.trim()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Import
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
