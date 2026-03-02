export type PsaOrder = {
  id: string;
  psa_order_number: string;
  submission_number: string | null;
  status: string;
  status_detail: string | null;
  service_level: string | null;
  estimated_arrival_date: string | null;
  billed_amount_usd: number | null;
  shipped_at: string | null;
  delivered_at: string | null;
  archived_at: string | null;
  tracking_number: string | null;
  carrier: string | null;
  /** Full courier name from PSA shipped email (e.g. DHL Express Worldwide) */
  courier: string | null;
  /** Date parcel was sent, from PSA shipped email */
  sent_at: string | null;
  /** When "We Received Your Package" email was received (Sync from Gmail) */
  received_package_at: string | null;
  /** Latest shipping status from carrier API (e.g. DHL) */
  shipping_status: string | null;
  last_psa_sync_at: string | null;
  last_ship_sync_at: string | null;
  notifications_enabled: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PsaOrderCard = {
  id: string;
  order_id: string;
  card_name: string;
  set_abbr: string;
  card_number: string;
  lang: string;
  quantity: number;
  declared_value: number | null;
  grade_result: string | null;
  cert_number: string | null;
  created_at: string;
  updated_at: string;
};

export type PsaOrderWithCards = PsaOrder & {
  cards?: PsaOrderCard[];
};

export type PsaOrderInvoiceLine = {
  submission_number: string;
  invoice_order_no: string;
  order_amount: number | null;
  payment_amount: number | null;
  balance_due: number | null;
};

export type PsaOrderWithInvoiceLines = PsaOrder & {
  invoice_lines?: PsaOrderInvoiceLine[];
};
