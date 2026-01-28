import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stripHtml, extractCardNumbers, extractPrices } from '../dist/utils/text.js';
import { decodeGmailBody } from '../dist/services/gmailParser.js';
import { parseCardRushEmail } from '../dist/parsers/vendors/cardrush.js';

describe('text helpers', () => {
  it('strips html tags', () => {
    const html = '<div>Hello <strong>World</strong></div>';
    assert.equal(stripHtml(html), 'Hello World');
  });

  it('extracts card numbers', () => {
    assert.ok(extractCardNumbers('Pikachu 001/010').includes('001'));
  });

  it('extracts prices', () => {
    assert.deepEqual(extractPrices('合計 ¥1,200'), [1200]);
  });

  it('decodes base64url bodies', () => {
    const encoded = 'SGVsbG8td29ybGRf';
    assert.equal(decodeGmailBody(encoded), 'Hello-world_');
  });
});

describe('CardRush parser', () => {
  it('parses order and line items', () => {
    const sample = readFileSync('fixtures/cardrush_01.txt', 'utf8');
    const parsed = parseCardRushEmail(sample);
    assert.equal(parsed.orderNo, '1032854');
    assert.equal(parsed.purchaseDate, '2026-01-02');
    assert.equal(parsed.items.length, 5);
    assert.deepEqual(
      parsed.items.map((item) => item.quantity),
      [1, 2, 1, 1, 2]
    );
    assert.deepEqual(
      parsed.items.map((item) => item.priceJpy),
      [158000, 74800, 118000, 72800, 288000]
    );
    assert.deepEqual(
      parsed.items.map((item) => item.setAbbr),
      ['SM9', 'SM9', 'SM11', 'SM9A', 'SM9']
    );
    assert.deepEqual(
      parsed.items.map((item) => item.cardNum),
      ['103', '099', '098', '061', '105']
    );
    assert.equal(
      parsed.items.every((item) => item.flags.includes('price_mismatch')),
      false
    );
  });

  it('returns no items when no product lines exist', () => {
    const sample = readFileSync('fixtures/cardrush_no_items.txt', 'utf8');
    const parsed = parseCardRushEmail(sample);
    assert.equal(parsed.items.length, 0);
  });
});
