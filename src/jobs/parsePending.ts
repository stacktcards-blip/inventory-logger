import type { DraftInsert } from '../repositories/purchaseDraftsRepo.js';

const logger = console;

type ParseDeps = {
  listSourcesByStatus: (status: string) => Promise<any[]>;
  updateSourceMetadata: (id: string, updates: { order_no?: string | null }) => Promise<any>;
  updateSourceStatus: (id: string, status: string, parseError?: string | null) => Promise<any>;
  insertPurchaseParse: (payload: {
    purchase_source_id: string;
    parser_version: string;
    status: string;
    confidence: number;
    result_json: Record<string, unknown>;
    error?: string | null;
  }) => Promise<any>;
  insertDrafts: (drafts: DraftInsert[]) => Promise<unknown[]>;
  parseJapanEmail: (raw: { subject: string | null; from: string | null; bodyText: string }) => {
    orderNo?: string | null;
    confidence: number;
    items: Array<{
      lineNo: number;
      store: string;
      purchaseDate?: string | null;
      cardName?: string | null;
      setAbbr?: string | null;
      cardNum?: string | null;
      lang?: string | null;
      quantity: number;
      priceJpy?: number | null;
      exchangeRateFormula?: string | null;
      notes?: string | null;
      confidence: number;
      flags: string[];
    }>;
  };
  parserVersion: string;
};

const loadDefaultDeps = async (): Promise<ParseDeps> => {
  const [
    purchaseSourcesRepo,
    purchaseParsesRepo,
    purchaseDraftsRepo,
    parsers
  ] = await Promise.all([
    import('../repositories/purchaseSourcesRepo.js'),
    import('../repositories/purchaseParsesRepo.js'),
    import('../repositories/purchaseDraftsRepo.js'),
    import('../parsers/index.js')
  ]);

  return {
    listSourcesByStatus: purchaseSourcesRepo.listSourcesByStatus,
    updateSourceMetadata: purchaseSourcesRepo.updateSourceMetadata,
    updateSourceStatus: purchaseSourcesRepo.updateSourceStatus,
    insertPurchaseParse: purchaseParsesRepo.insertPurchaseParse,
    insertDrafts: purchaseDraftsRepo.insertDrafts,
    parseJapanEmail: parsers.parseJapanEmail,
    parserVersion: parsers.parserVersion
  };
};

export const parsePendingSources = async (deps?: ParseDeps) => {
  const resolvedDeps = deps ?? (await loadDefaultDeps());
  const sources = await resolvedDeps.listSourcesByStatus('pending');
  logger.info({ count: sources.length }, 'Found pending sources');

  for (const source of sources) {
    try {
      const parsed = resolvedDeps.parseJapanEmail({
        subject: source.raw_subject,
        from: source.raw_from,
        bodyText: source.raw_body_text ?? source.raw_body_html ?? ''
      });

      if (parsed.items.length === 0) {
        const message = 'No line items parsed';
        await resolvedDeps.insertPurchaseParse({
          purchase_source_id: source.id,
          parser_version: resolvedDeps.parserVersion,
          status: 'error',
          confidence: parsed.confidence,
          result_json: parsed,
          error: message
        });
        await resolvedDeps.updateSourceStatus(source.id, 'error', message);
        logger.error({ sourceId: source.id }, message);
        continue;
      }

      const needsReview = parsed.items.some((item) => item.flags.length > 0 || item.confidence < 0.85);
      const parseStatus = needsReview ? 'needs_review' : 'parsed';

      const parseRow = await resolvedDeps.insertPurchaseParse({
        purchase_source_id: source.id,
        parser_version: resolvedDeps.parserVersion,
        status: needsReview ? 'needs_review' : 'ok',
        confidence: parsed.confidence,
        result_json: parsed
      });

      await resolvedDeps.insertDrafts(
        parsed.items.map((item) => ({
          purchase_source_id: source.id,
          purchase_parse_id: parseRow.id,
          line_no: item.lineNo,
          store: item.store,
          purchase_date: item.purchaseDate ?? null,
          card_name: item.cardName ?? null,
          set_abbr: item.setAbbr ?? null,
          card_num: item.cardNum ?? null,
          lang: item.lang ?? 'JPN',
          quantity: item.quantity,
          price_jpy: item.priceJpy ?? null,
          exchange_rate_formula: item.exchangeRateFormula ?? null,
          notes: item.notes ?? null,
          confidence: item.confidence,
          flags: item.flags,
          review_status: 'needs_review'
        }))
      );

      if (parsed.orderNo) {
        await resolvedDeps.updateSourceMetadata(source.id, { order_no: parsed.orderNo });
      }

      await resolvedDeps.updateSourceStatus(source.id, parseStatus);
      logger.info({ sourceId: source.id, status: parseStatus }, 'Parsed source');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await resolvedDeps.updateSourceStatus(source.id, 'error', message);
      logger.error({ sourceId: source.id, error: message }, 'Failed to parse source');
    }
  }
};
