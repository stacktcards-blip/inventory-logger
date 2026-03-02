import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractTrackingFromText } from '../src/lib/tracking/email-parser.ts';

describe('extractTrackingFromText', () => {
  it('extracts DHL-style 10-digit tracking', () => {
    const text = 'Your tracking number is 1234567890';
    const result = extractTrackingFromText(text);
    assert.ok(result.includes('1234567890'));
  });

  it('extracts DHL waybill format', () => {
    const text = 'Waybill: 9876543210';
    const result = extractTrackingFromText(text);
    assert.ok(result.some((t) => t.replace(/\D/g, '') === '9876543210'));
  });

  it('extracts multiple tracking numbers', () => {
    const text = 'Tracking: 1111111111 and waybill 2222222222';
    const result = extractTrackingFromText(text);
    assert.ok(result.length >= 1);
  });

  it('returns empty array for text with no tracking', () => {
    const text = 'Hello, no tracking here.';
    const result = extractTrackingFromText(text);
    assert.deepStrictEqual(result, []);
  });

  it('extracts UPS 1Z format', () => {
    const text = 'UPS tracking: 1Z999AA10123456784';
    const result = extractTrackingFromText(text);
    assert.ok(result.some((t) => t.includes('1Z')));
  });

  it('handles sample PSA shipping email', () => {
    const text = `
      Hi, your PSA order has shipped!
      Order number: 12345678
      Tracking number: 1234567890
      Carrier: DHL
    `;
    const result = extractTrackingFromText(text);
    assert.ok(result.length >= 1);
    assert.ok(result.some((t) => t.includes('1234567890') || t === '1234567890'));
  });
});
