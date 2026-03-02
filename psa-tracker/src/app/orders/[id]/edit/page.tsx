'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PsaOrder } from '@/types/psa';

export default function EditOrderPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [order, setOrder] = useState<PsaOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [psaOrderNumber, setPsaOrderNumber] = useState('');
  const [status, setStatus] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [notes, setNotes] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setOrder(data);
        setPsaOrderNumber(data.psa_order_number ?? '');
        setStatus(data.status ?? '');
        setTrackingNumber(data.tracking_number ?? '');
        setCarrier(data.carrier ?? '');
        setNotes(data.notes ?? '');
        setNotificationsEnabled(data.notifications_enabled ?? true);
      })
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        psa_order_number: psaOrderNumber.trim(),
        status: status || undefined,
        tracking_number: trackingNumber.trim() || null,
        carrier: carrier.trim() || null,
        notes: notes.trim() || null,
        notifications_enabled: notificationsEnabled,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? 'Failed to update');
      return;
    }
    router.push(`/orders/${id}`);
    router.refresh();
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
          <Link href={`/orders/${id}`} className="text-sm text-gray-600 hover:text-gray-900">
            ← Back to order
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">Edit order</h1>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">PSA order number</label>
            <input
              type="text"
              value={psaOrderNumber}
              onChange={(e) => setPsaOrderNumber(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <input
              type="text"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Tracking number</label>
            <input
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Manual override"
              className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Carrier</label>
            <input
              type="text"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="DHL, FedEx, etc."
              className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="notifications"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="notifications" className="text-sm text-gray-700">
              Notifications enabled
            </label>
          </div>
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <Link
              href={`/orders/${id}`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
