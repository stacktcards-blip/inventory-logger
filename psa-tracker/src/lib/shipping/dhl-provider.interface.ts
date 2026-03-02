/**
 * DHL Shipment Tracking - Unified API
 * https://developer.dhl.com/api-reference/shipment-tracking
 * Status codes: pre-transit, transit, delivered, failure, unknown
 */
export type DhlShipmentStatus = 'pre-transit' | 'transit' | 'delivered' | 'failure' | 'unknown';

export type DhlShipmentEvent = {
  statusCode: DhlShipmentStatus;
  description?: string;
  timestamp?: string;
  location?: string;
};

export type DhlShipmentResult = {
  trackingNumber: string;
  statusCode: DhlShipmentStatus;
  description?: string;
  estimatedDelivery?: string;
  deliveredAt?: string;
  events: DhlShipmentEvent[];
};

export interface DhlProvider {
  getShipmentStatus(trackingNumber: string): Promise<DhlShipmentResult | null>;
}
