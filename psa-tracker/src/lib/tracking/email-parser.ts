/**
 * Extract tracking numbers from raw email body text.
 * Supports DHL, FedEx, UPS, and generic formats.
 */

const TRACKING_PATTERNS = [
  // DHL: 10-11 digits, sometimes with spaces
  /\b(\d{4}[\s-]?\d{4}[\s-]?\d{2})\b/g,
  /\b(\d{10,11})\b/g,
  // DHL waybill: 10 digits
  /\bwaybill[:\s#]*(\d{10})\b/gi,
  // FedEx: 12-15 digits
  /\b(\d{12,15})\b/g,
  // UPS: 1Z + 16 alphanumeric
  /\b(1Z[A-Z0-9]{16})\b/gi,
  // Generic: "Tracking: 1234567890"
  /tracking[:\s#]*(\d{10,15})\b/gi,
  /tracking\s*number[:\s#]*([A-Z0-9]{10,20})\b/gi,
];

export function extractTrackingFromText(text: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const pattern of TRACKING_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const normalized = (m[1] ?? '').replace(/[\s-]/g, '');
      if (normalized.length >= 10 && !seen.has(normalized)) {
        seen.add(normalized);
        results.push(normalized);
      }
    }
  }

  return results;
}
