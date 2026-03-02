/**
 * Generate tracking URLs for common carriers.
 * Used to make tracking numbers clickable in the UI.
 */
export function getTrackingUrl(
  trackingNumber: string,
  carrier: string | null | undefined
): string | null {
  const tn = trackingNumber?.trim();
  if (!tn) return null;
  if (/^shipped\s+to\s+vault$/i.test(tn)) return null;

  const carrierLower = (carrier ?? '').toLowerCase();

  // DHL (Australia)
  if (carrierLower.includes('dhl')) {
    return `https://www.dhl.com/au-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(tn)}`;
  }

  // USPS
  if (carrierLower.includes('usps') || carrierLower.includes('united states postal')) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tn)}`;
  }

  // FedEx
  if (carrierLower.includes('fedex')) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tn)}`;
  }

  // UPS
  if (carrierLower.includes('ups')) {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(tn)}`;
  }

  // Australia Post
  if (carrierLower.includes('australia post') || carrierLower.includes('auspost')) {
    return `https://auspost.com.au/mypost/track/#/details/${encodeURIComponent(tn)}`;
  }

  // Default: DHL AU (PSA often ships via DHL)
  return `https://www.dhl.com/au-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(tn)}`;
}
