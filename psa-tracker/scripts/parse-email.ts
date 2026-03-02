#!/usr/bin/env node
/**
 * CLI to test email tracking number parsing.
 * Usage: npm run parse-email [path-to-file]
 * Or pipe: cat sample.txt | npm run parse-email
 */

import { extractTrackingFromText } from '../src/lib/tracking/email-parser';
import { readFileSync } from 'fs';

const sampleEmail = `
Hi, your PSA order has shipped!

Order number: 12345678
Tracking number: 1234567890
Carrier: DHL

You can track your shipment at dhl.com
Waybill: 9876543210

Another tracking: 1Z999AA10123456784
`;

async function main() {
  const args = process.argv.slice(2);
  let text: string;

  if (args[0]) {
    text = readFileSync(args[0], 'utf-8');
  } else if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    text = Buffer.concat(chunks).toString('utf-8');
  } else {
    text = sampleEmail;
    console.log('Using sample email (no file or stdin):\n');
  }

  if (!text.trim()) {
    text = sampleEmail;
    console.log('No input; using sample email:\n');
  }

  const extracted = extractTrackingFromText(text);
  console.log('Extracted tracking numbers:', extracted.length ? extracted : '(none)');
  extracted.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
}

main();
