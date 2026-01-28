import pino from 'pino';
import { GMAIL_QUERY, PARSER_VERSION } from '../config/japanStores.js';
import { listMessages, getMessage } from '../services/gmailClient.js';
import { parseGmailMessage } from '../services/gmailParser.js';
import { detectStore } from '../parsers/detectStore.js';
import { normalizeContent, sha256 } from '../utils/text.js';
import { findSourceByContentHash, upsertPurchaseSource } from '../repositories/purchaseSourcesRepo.js';

const logger = pino({ name: 'ingest-gmail' });

export const ingestGmail = async () => {
  logger.info('Starting Gmail ingestion polling');
  const messages = await listMessages(GMAIL_QUERY);
  logger.info({ count: messages.length }, 'Messages matched query');

  for (const message of messages) {
    if (!message.id) continue;
    const fullMessage = await getMessage(message.id);
    const parsed = parseGmailMessage(fullMessage);

    const normalized = normalizeContent(parsed.subject, parsed.from, parsed.bodyText ?? parsed.bodyHtml ?? '');
    const contentHash = sha256(normalized);
    const existing = await findSourceByContentHash(contentHash);
    if (existing) {
      logger.info({ messageId: message.id, sourceId: existing.id }, 'Skipping duplicate content hash');
      continue;
    }

    const store = detectStore(parsed.from, parsed.subject);
    const receivedAt = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();

    await upsertPurchaseSource({
      source_type: 'japan_email',
      source_system: store,
      external_id: message.id,
      thread_id: fullMessage.threadId ?? null,
      received_at: receivedAt,
      raw_subject: parsed.subject,
      raw_from: parsed.from,
      raw_body_text: parsed.bodyText,
      raw_body_html: parsed.bodyHtml,
      raw_snippet: parsed.snippet,
      parse_status: 'pending',
      parser_version: PARSER_VERSION,
      content_hash: contentHash
    });

    logger.info({ messageId: message.id, store }, 'Stored purchase source');
  }

  logger.info('Gmail ingestion complete');
};
