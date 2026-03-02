/**
 * DHL Shipment Tracking - Unified API
 * https://api-eu.dhl.com/track/shipments?trackingNumber=X
 * Header: DHL-API-Key
 */
import type { DhlProvider, DhlShipmentResult } from './dhl-provider.interface';

const DHL_API_BASE = 'https://api-eu.dhl.com/track/shipments';

function getDhlProvider(): DhlProvider | null {
  const key = process.env.DHL_API_KEY?.trim();
  if (!key) return null;
  return new DhlApiProvider(key);
}

export function getDhlProviderOrNull(): DhlProvider | null {
  return getDhlProvider();
}

type DhlApiShipment = {
  id?: string;
  service?: string;
  status?: {
    statusCode?: string;
    description?: string;
    timestamp?: string;
    location?: { address?: { addressLocality?: string } };
  };
  estimatedTimeOfDelivery?: string;
  details?: {
    proofOfDelivery?: { signedBy?: string; timestamp?: string };
  };
  events?: Array<{
    statusCode?: string;
    description?: string;
    timestamp?: string;
    location?: { address?: { addressLocality?: string } };
  }>;
};

type DhlApiResponse = {
  shipments?: DhlApiShipment[];
};

const VALID_STATUS_CODES = ['pre-transit', 'transit', 'delivered', 'failure', 'unknown'] as const;

function normalizeStatusCode(raw: string | undefined): DhlShipmentResult['statusCode'] {
  const lower = (raw ?? '').toLowerCase();
  if (VALID_STATUS_CODES.includes(lower as (typeof VALID_STATUS_CODES)[number])) {
    return lower as DhlShipmentResult['statusCode'];
  }
  return 'unknown';
}

class DhlApiProvider implements DhlProvider {
  constructor(private apiKey: string) {}

  async getShipmentStatus(trackingNumber: string): Promise<DhlShipmentResult | null> {
    const url = `${DHL_API_BASE}?trackingNumber=${encodeURIComponent(trackingNumber)}&service=express`;
    const res = await fetch(url, {
      headers: {
        'DHL-API-Key': this.apiKey,
        Accept: 'application/json',
      },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DHL API error ${res.status}: ${text || res.statusText}`);
    }

    const data = (await res.json()) as DhlApiResponse;
    const shipment = data.shipments?.[0];
    if (!shipment) return null;

    const status = shipment.status;
    const statusCode = normalizeStatusCode(status?.statusCode);
    const events = (shipment.events ?? []).map((e) => ({
      statusCode: normalizeStatusCode(e.statusCode),
      description: e.description,
      timestamp: e.timestamp,
      location: e.location?.address?.addressLocality,
    }));

    let deliveredAt: string | undefined;
    if (statusCode === 'delivered' && shipment.details?.proofOfDelivery?.timestamp) {
      deliveredAt = shipment.details.proofOfDelivery.timestamp;
    } else if (statusCode === 'delivered' && status?.timestamp) {
      deliveredAt = status.timestamp;
    }

    return {
      trackingNumber: shipment.id ?? trackingNumber,
      statusCode,
      description: status?.description,
      estimatedDelivery: shipment.estimatedTimeOfDelivery,
      deliveredAt,
      events,
    };
  }
}
