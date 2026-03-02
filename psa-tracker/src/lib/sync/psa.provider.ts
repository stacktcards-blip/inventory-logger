/**
 * PSA API provider.
 * Real API: https://api.psacard.com/publicapi/order/GetProgress/{orderNumber}
 * Docs: https://api.psacard.com/publicapi/swagger
 */
import type { PsaProvider, PsaOrderStatus } from './psa-provider.interface';

const PSA_API_BASE = 'https://api.psacard.com/publicapi';

type OrderProgress = {
  orderNumber?: string;
  submissionNumber?: string;
  SubmissionNumber?: string;
  submission_number?: string;
  problemOrder?: boolean;
  readyForLabelReview?: boolean;
  gradesReady?: boolean;
  accountingHold?: boolean;
  shipped?: boolean;
  shipTrackingNumber?: string | null;
  shipCarrier?: string | null;
  orderProgressSteps?: Array<{ index?: number; step?: number; completed?: boolean }>;
  // PSA API may return PascalCase
  OrderNumber?: string;
  ProblemOrder?: boolean;
  Shipped?: boolean;
  ShipTrackingNumber?: string | null;
  ShipCarrier?: string | null;
  // Service level – not in swagger; API may return under various names
  serviceLevel?: string | null;
  ServiceLevel?: string | null;
  service_level?: string | null;
  serviceType?: string | null;
  ServiceType?: string | null;
  [key: string]: unknown;
};

function getStr(data: OrderProgress, ...keys: (keyof OrderProgress)[]): string | null {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

/** Extract service level from API response. Swagger docs dont list it; API may use different keys. */
function extractServiceLevel(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  const directKeys = [
    'serviceLevel',
    'ServiceLevel',
    'service_level',
    'serviceType',
    'ServiceType',
    'service level',
  ];
  for (const k of directKeys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }

  // Case-insensitive search over all keys
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    if (
      (lower.includes('service') && lower.includes('level')) ||
      (lower.includes('service') && lower.includes('type'))
    ) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const nested = extractServiceLevel(v);
        if (nested) return nested;
      }
    }
  }

  // Check common nested paths: service.level, orderDetails.serviceLevel, etc.
  const service = obj.service;
  if (service && typeof service === 'object' && !Array.isArray(service)) {
    const level = (service as Record<string, unknown>).level ?? (service as Record<string, unknown>).Level;
    if (typeof level === 'string' && level.trim()) return level.trim();
  }
  const orderDetails = obj.orderDetails ?? obj.OrderDetails;
  if (orderDetails && typeof orderDetails === 'object' && !Array.isArray(orderDetails)) {
    const inner = (orderDetails as Record<string, unknown>).serviceLevel ?? (orderDetails as Record<string, unknown>).service_level;
    if (typeof inner === 'string' && inner.trim()) return inner.trim();
  }

  return null;
}

function deriveStatus(data: OrderProgress): string {
  const shipped = data.shipped ?? data.Shipped;
  const problemOrder = data.problemOrder ?? data.ProblemOrder;
  if (shipped) return 'Shipped';
  if (problemOrder) return 'Problem';
  if (data.accountingHold) return 'Accounting Hold';
  if (data.gradesReady) return 'Grades Ready';
  if (data.readyForLabelReview) return 'Label Review';
  return 'Processing';
}

function deriveStatusDetail(data: OrderProgress): string {
  const shipped = data.shipped ?? data.Shipped;
  const parts: string[] = [];
  if (shipped) parts.push('Order has been shipped');
  if (data.problemOrder ?? data.ProblemOrder) parts.push('Problem order');
  if (data.accountingHold) parts.push('Accounting hold');
  if (data.gradesReady && !shipped) parts.push('Grades ready');
  if (data.readyForLabelReview) parts.push('Ready for label review');
  return parts.join('; ') || 'In progress';
}

export function getPsaProvider(): PsaProvider {
  if (process.env.PSA_USE_MOCK === 'true' || process.env.PSA_USE_MOCK === '1') {
    return new MockPsaProvider();
  }
  const raw = process.env.PSA_API_TOKEN ?? process.env.PSA_API_KEY;
  const token = raw?.trim()?.replace(/^Bearer\s+/i, '') ?? '';
  if (token) {
    return new PsaApiProvider(token);
  }
  return new MockPsaProvider();
}

class PsaApiProvider implements PsaProvider {
  constructor(private token: string) {}

  async getOrderStatus(psaOrderNumber: string): Promise<PsaOrderStatus | null> {
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };

    let submissionNumber: string | null = null;
    let data: OrderProgress | null = null;

    // Try GetProgress first (order number)
    let res = await fetch(
      `${PSA_API_BASE}/order/GetProgress/${encodeURIComponent(psaOrderNumber)}`,
      { headers }
    );

    if (res.ok) {
      data = (await res.json()) as OrderProgress;
    } else {
      // Fallback: GetProgress can return 500 or 401 for some orders; try GetSubmissionProgress (submission number)
      // If GetSubmissionProgress works, the input number might be the submission number
      const subRes = await fetch(
        `${PSA_API_BASE}/order/GetSubmissionProgress/${encodeURIComponent(psaOrderNumber)}`,
        { headers }
      );
      if (subRes.ok) {
        data = (await subRes.json()) as OrderProgress;
        // If GetSubmissionProgress worked, the input number is likely the submission number
        submissionNumber = psaOrderNumber;
      } else {
        res = subRes;
      }
    }

    if (res.status === 404) return null;
    if (res.status === 401) {
      const text = await res.text();
      throw new Error(
        `PSA API rejected the token (401). Check PSA_API_TOKEN in .env.local. ${text ? `Response: ${text}` : ''}`
      );
    }
    if (!res.ok || !data) {
      const text = await res.text();
      throw new Error(`PSA API error ${res.status}: ${text || res.statusText}`);
    }

    const orderNum = getStr(data, 'orderNumber', 'OrderNumber');
    if (!orderNum && !data?.orderNumber && !data?.OrderNumber) return null;

    // Extract submission number from response if available
    if (!submissionNumber) {
      submissionNumber = getStr(data, 'submissionNumber', 'SubmissionNumber', 'submission_number') ?? null;
    }

    const shipped = data.shipped ?? data.Shipped;
    const tracking = getStr(data, 'shipTrackingNumber', 'ShipTrackingNumber');
    const carrier = getStr(data, 'shipCarrier', 'ShipCarrier');

    const status = deriveStatus(data);
    const statusDetail = deriveStatusDetail(data);

    const serviceLevel = extractServiceLevel(data);

    return {
      orderNumber: orderNum ?? data.orderNumber ?? data.OrderNumber ?? psaOrderNumber,
      submissionNumber,
      status,
      statusDetail,
      serviceLevel,
      shippedAt: shipped ? new Date().toISOString() : null,
      deliveredAt: null,
      trackingNumber: tracking,
      carrier,
      lastUpdated: new Date().toISOString(),
    };
  }
}

class MockPsaProvider implements PsaProvider {
  private fixtures: Record<string, PsaOrderStatus> = {
    '12345678': {
      orderNumber: '12345678',
      submissionNumber: 'SUB123456',
      status: 'Shipped',
      statusDetail: 'Order has been shipped',
      serviceLevel: 'Regular',
      shippedAt: '2025-01-15T12:00:00Z',
      deliveredAt: null,
      trackingNumber: '1234567890',
      carrier: 'DHL',
      lastUpdated: '2025-01-15T12:00:00Z',
    },
    '87654321': {
      orderNumber: '87654321',
      submissionNumber: 'SUB123456',
      status: 'Grading',
      statusDetail: 'Cards are being graded',
      serviceLevel: 'Economy',
      shippedAt: null,
      deliveredAt: null,
      trackingNumber: null,
      carrier: null,
      lastUpdated: '2025-01-20T08:00:00Z',
    },
    '11111111': {
      orderNumber: '11111111',
      submissionNumber: 'SUB789012',
      status: 'Received',
      statusDetail: 'Order received at PSA',
      serviceLevel: 'Express',
      shippedAt: null,
      deliveredAt: null,
      trackingNumber: null,
      carrier: null,
      lastUpdated: '2025-01-10T00:00:00Z',
    },
  };

  async getOrderStatus(psaOrderNumber: string): Promise<PsaOrderStatus | null> {
    await new Promise((r) => setTimeout(r, 100));
    return this.fixtures[psaOrderNumber] ?? null;
  }
}
