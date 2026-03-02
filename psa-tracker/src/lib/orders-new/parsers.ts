/**
 * Parse PSA emails: "We Received Your Package" (Order #, 8-digit), billing, and "Your PSA Order has shipped".
 */

/** Parsed "We Received Your Package" email: 8-digit order numbers under "Order #". */
export type ParsedReceivedPackage = {
  type: 'received_package';
  orderNumbers: string[]; // 8-digit PSA order numbers
};

export type ParsedOrderEmail = {
  type: 'order';
  orderNumber: string;
  serviceLevel?: string;
  submissionDate?: string; // YYYY-MM-DD
  arriveDate?: string;     // YYYY-MM-DD
  status?: string;
};

export type ParsedBillingEmail = {
  type: 'billing';
  orderNumber: string;
  billedAmountUsd: number;
};

export type ParsedShippedEmail = {
  type: 'shipped';
  orderNumber: string;
  trackingNumber: string;
  carrier: string;
  /** Full courier name from email (e.g. "DHL Express Worldwide") */
  courierFull?: string;
};

export type ParsedEmail = ParsedOrderEmail | ParsedBillingEmail | ParsedShippedEmail;

// Order # or Order #: followed by 8-digit number (PSA order numbers are 8 digits)
const ORDER_NUMBER_LINE = /Order\s*#\s*:?\s*(\d{8})\b/g;
// "We Received Your Package" emails use "Submission #" and table cells <th>NNNNNNNN</th>
const SUBMISSION_NUMBER_LINE = /Submission\s*#\s*:?\s*(\d{8})\b/g;
const SUBMISSION_TABLE_CELL = /<th>(\d{8})<\/th>/g;

/** Extract 8-digit numbers from "We Received Your Package" body (Order #, Submission #, or <th>...</th>). */
export function parseReceivedPackageEmail(body: string): ParsedReceivedPackage | null {
  const seen = new Set<string>();
  const add = (num: string) => {
    if (num.length === 8) seen.add(num);
  };

  const normalized = body.replace(/\s+/g, ' ').trim();
  ORDER_NUMBER_LINE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ORDER_NUMBER_LINE.exec(normalized)) !== null) add(m[1]!);

  SUBMISSION_NUMBER_LINE.lastIndex = 0;
  while ((m = SUBMISSION_NUMBER_LINE.exec(normalized)) !== null) add(m[1]!);

  SUBMISSION_TABLE_CELL.lastIndex = 0;
  while ((m = SUBMISSION_TABLE_CELL.exec(body)) !== null) add(m[1]!);

  if (seen.size === 0) return null;
  return { type: 'received_package', orderNumbers: Array.from(seen) };
}

// Order number: 5–9 digits, often in subject or body (legacy parsers)
const ORDER_NUMBER_RE = /\b(\d{5,9})\b/g;

function extractOrderNumbers(text: string): string[] {
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = ORDER_NUMBER_RE.exec(text)) !== null) {
    const n = m[1]!;
    if (!seen.has(n)) {
      seen.add(n);
    }
  }
  return Array.from(seen);
}

function parseUsDate(s: string): string | undefined {
  // MM/DD/YYYY or M/D/YY, or "January 15, 2025"
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const [, month, day, year] = m;
    const y = year!.length === 2 ? `20${year}` : year!;
    return `${y}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }
  const m2 = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
  return undefined;
}

/** Parse order confirmation / receipt emails for order number, service level, dates, status */
export function parseOrderEmail(subject: string, body: string): ParsedOrderEmail | null {
  const combined = `${subject} ${body}`;
  const orderNumbers = extractOrderNumbers(combined);
  if (orderNumbers.length === 0) return null;

  const orderNumber = orderNumbers[0]!;

  // Service level: Economy, Regular, Express, Value, etc.
  const serviceMatch = combined.match(/\b(Value|Economy|Regular|Express|Super\s*Express|Walk[- ]?Through|Premium\+?)\b/i);
  const serviceLevel = serviceMatch ? serviceMatch[1]!.trim() : undefined;

  // Submission date / received date
  const submissionMatch = combined.match(/(?:submission|received|submitted|arrived)[\s\S]*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i)
    ?? combined.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  const submissionDate = submissionMatch ? parseUsDate(submissionMatch[1]!) : undefined;

  // Estimated arrival / expected
  const arriveMatch = combined.match(/(?:estimated\s*arrival|expected\s*arrival|arrive|delivery\s*by)[\s\S]*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  const arriveDate = arriveMatch ? parseUsDate(arriveMatch[1]!) : undefined;

  // Status
  let status: string | undefined;
  if (/\b(received|grading|shipped|delivered|complete)\b/i.test(combined)) {
    const statusMatch = combined.match(/\b(received|grading|shipped|delivered|complete)\b/i);
    status = statusMatch ? statusMatch[1]!.charAt(0).toUpperCase() + statusMatch[1]!.slice(1).toLowerCase() : undefined;
  }

  return {
    type: 'order',
    orderNumber,
    serviceLevel,
    submissionDate,
    arriveDate,
    status,
  };
}

/** Parse billing emails for order number and billed amount in USD */
export function parseBillingEmail(subject: string, body: string): ParsedBillingEmail | null {
  const combined = `${subject} ${body}`;
  const orderNumbers = extractOrderNumbers(combined);
  if (orderNumbers.length === 0) return null;

  // Amount: $123.45 or 123.45 USD
  const amountMatch = combined.match(/\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:USD|usd)?/);
  const amountStr = amountMatch ? amountMatch[1]!.replace(/,/g, '') : null;
  const billedAmountUsd = amountStr ? parseFloat(amountStr) : NaN;
  if (Number.isNaN(billedAmountUsd) || billedAmountUsd <= 0) return null;

  return {
    type: 'billing',
    orderNumber: orderNumbers[0]!,
    billedAmountUsd,
  };
}

// PSA order numbers in "Your PSA order has shipped" emails are 8 digits (e.g. "order #25563268").
// Use explicit "order #" pattern to avoid capturing HTML/CSS numbers like 212121 from color:#212121.
const SHIPPED_ORDER_NO_RE = /order\s*#\s*(\d{8})\b/i;

/** Parse "Your PSA Order has shipped" for order number, courier, tracking. */
export function parseShippedEmail(subject: string, body: string): ParsedShippedEmail | null {
  const combined = `${subject} ${body}`;
  if (!/shipped|shipping|tracking/i.test(combined)) return null;

  const explicitOrderNo = combined.match(SHIPPED_ORDER_NO_RE)?.[1];
  const orderNumbers = explicitOrderNo
    ? [explicitOrderNo]
    : extractOrderNumbers(combined).filter((n) => n.length === 8);
  if (orderNumbers.length === 0) return null;

  // Prefer "tracking number: COURIER_NAME TRACKING_DIGITS" to get full courier name and number
  const trackingLineMatch = combined.match(/tracking\s*number[:\s]+(.+?)\s+(\d{10,15})\b/i);
  let trackingNumber = '';
  let courierFull: string | undefined;
  if (trackingLineMatch) {
    courierFull = trackingLineMatch[1]!.trim();
    trackingNumber = trackingLineMatch[2]!.replace(/[\s-]/g, '');
  }
  if (!trackingNumber) {
    const trackingPatterns = [
      /\b(1Z[A-Z0-9]{16})\b/gi,
      /\b(\d{12,15})\b/g,
      /\b(\d{4}[\s-]?\d{4}[\s-]?\d{2})\b/,
      /\b(\d{10,11})\b/g,
      /tracking[:\s#]*([A-Z0-9]{10,20})\b/gi,
    ];
    for (const re of trackingPatterns) {
      const m = combined.match(re);
      if (m && m[1]) {
        trackingNumber = m[1].replace(/[\s-]/g, '');
        if (trackingNumber.length >= 10) break;
      }
    }
  }
  if (!trackingNumber) return null;

  let carrier = 'Unknown';
  if (/dhl/i.test(combined)) carrier = 'DHL';
  else if (/fedex/i.test(combined)) carrier = 'FedEx';
  else if (/ups/i.test(combined)) carrier = 'UPS';
  else if (/usps|postal/i.test(combined)) carrier = 'USPS';

  const orderNo = orderNumbers[0]!;
  return {
    type: 'shipped',
    orderNumber: orderNo,
    trackingNumber,
    carrier,
    courierFull: courierFull || undefined,
  };
}

export function parsePsaEmail(subject: string, body: string): ParsedEmail | null {
  const shipped = parseShippedEmail(subject, body);
  if (shipped) return shipped;
  if (/invoice|bill|payment|charged|billed/i.test(subject) || /\$|USD|billed|charged/i.test(body)) {
    const b = parseBillingEmail(subject, body);
    if (b) return b;
  }
  const o = parseOrderEmail(subject, body);
  if (o) return o;
  return null;
}

/** One row from PSA Invoices table: Order No., Submission No., Order Amount, Payment Amount, Balance Due */
export type ParsedInvoiceRow = {
  orderNo: string;
  submissionNo: string;
  orderAmount: number | null;
  paymentAmount: number | null;
  balanceDue: number | null;
};

function parseCurrency(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

function extractTableCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const re = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowHtml)) !== null) {
    cells.push(m[1]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  }
  return cells;
}

/** Parse PSA Invoices email body: table with Order No., Submission No., Order Amount, Payment Amount, Balance Due. */
export function parseInvoiceEmail(body: string): ParsedInvoiceRow[] {
  const rows = body.split(/<\/tr>\s*<tr/gi).map((r) => r.replace(/^[\s\S]*?<tr[^>]*>/i, '').replace(/<\/tr>[\s\S]*$/, ''));
  let orderNoIdx = -1;
  let submissionNoIdx = -1;
  let orderAmountIdx = -1;
  let paymentAmountIdx = -1;
  let balanceDueIdx = -1;
  let headerRowIndex = -1;

  for (let i = 0; i < rows.length; i++) {
    const cells = extractTableCells(rows[i]!);
    const normalized = cells.map((c) => c.replace(/\s+/g, ' ').trim());
    const orderNoIdx_ = normalized.findIndex((c) => /Order\s*No\.?/i.test(c));
    const submissionNoIdx_ = normalized.findIndex((c) => /Submission\s*No\.?/i.test(c));
    const orderAmountIdx_ = normalized.findIndex((c) => /Order\s*Amount/i.test(c));
    const paymentAmountIdx_ = normalized.findIndex((c) => /Payment\s*Amount/i.test(c));
    const balanceDueIdx_ = normalized.findIndex((c) => /Balance\s*Due/i.test(c));
    if (orderNoIdx_ >= 0 && submissionNoIdx_ >= 0) {
      orderNoIdx = orderNoIdx_;
      submissionNoIdx = submissionNoIdx_;
      orderAmountIdx = orderAmountIdx_ >= 0 ? orderAmountIdx_ : -1;
      paymentAmountIdx = paymentAmountIdx_ >= 0 ? paymentAmountIdx_ : -1;
      balanceDueIdx = balanceDueIdx_ >= 0 ? balanceDueIdx_ : -1;
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex < 0 || orderNoIdx < 0 || submissionNoIdx < 0) return [];

  const result: ParsedInvoiceRow[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const cells = extractTableCells(rows[i]!);
    const orderNo = (cells[orderNoIdx] ?? '').trim();
    const submissionNo = (cells[submissionNoIdx] ?? '').trim();
    if (!orderNo || !submissionNo) continue;
    const orderAmount = orderAmountIdx >= 0 ? parseCurrency(cells[orderAmountIdx] ?? '') : null;
    const paymentAmount = paymentAmountIdx >= 0 ? parseCurrency(cells[paymentAmountIdx] ?? '') : null;
    const balanceDue = balanceDueIdx >= 0 ? parseCurrency(cells[balanceDueIdx] ?? '') : null;
    result.push({ orderNo, submissionNo, orderAmount, paymentAmount, balanceDue });
  }
  return result;
}
