/** PSA API response shape. Fill in when real PSA API docs are available. */
export type PsaOrderStatus = {
  orderNumber: string;
  submissionNumber?: string | null;
  status: string;
  statusDetail?: string | null;
  serviceLevel?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  lastUpdated?: string | null;
};

export interface PsaProvider {
  /** Fetch latest status for an order. Returns null if not found. */
  getOrderStatus(psaOrderNumber: string): Promise<PsaOrderStatus | null>;
}
