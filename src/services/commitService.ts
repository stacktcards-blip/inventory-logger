import crypto from 'crypto';
import { supabase } from '../repositories/supabaseClient.js';
import { listDraftsForSource } from '../repositories/purchaseDraftsRepo.js';
import { getSourceById } from '../repositories/purchaseSourcesRepo.js';
import { DEFAULT_RAW_CARD_MAPPING, mapDraftToRawCardInsert } from '../adapters/rawCardsAdapter.js';

const requiredFields = ['set_abbr', 'card_num', 'lang', 'price_jpy', 'purchase_date', 'store'] as const;

type DraftRow = {
  id: string;
  purchase_source_id: string;
  review_status: string;
  card_name: string | null;
  set_abbr: string | null;
  card_num: string | null;
  lang: string | null;
  quantity: number;
  price_jpy: number | null;
  store: string;
  purchase_date: string | null;
  notes: string | null;
};

export const commitPurchaseSource = async (sourceId: string, committedBy: string) => {
  const [drafts, source] = await Promise.all([
    listDraftsForSource(sourceId),
    getSourceById(sourceId)
  ]);

  if (!drafts.length) {
    throw new Error('No drafts found for source');
  }

  const notApproved = (drafts as DraftRow[]).filter((draft) => draft.review_status !== 'approved');
  if (notApproved.length) {
    throw new Error('All drafts must be approved before commit');
  }

  const normalizedDrafts = (drafts as DraftRow[]).map((draft) => {
    const lang = draft.lang ?? (source.source_system === 'CardRush' ? 'JPN' : null);
    const store = draft.store ?? (source.source_system === 'CardRush' ? 'CardRush' : null);
    return { ...draft, lang, store };
  });

  for (const draft of normalizedDrafts) {
    for (const field of requiredFields) {
      if (draft[field] === null || draft[field] === undefined || draft[field] === '') {
        throw new Error(`Missing required field ${field} for draft ${draft.id}`);
      }
    }
  }

  const orderNo = source.order_no ?? 'unknown';
  const messageId = source.external_id ?? 'unknown';
  const vendor = source.source_system ?? 'Unknown';
  const note = `${vendor} order ${orderNo} | Gmail:${messageId} | source:${sourceId}`;

  const inserts = normalizedDrafts.flatMap((draft) => {
    const quantity = Math.max(1, draft.quantity ?? 1);
    return Array.from({ length: quantity }).map(() =>
      mapDraftToRawCardInsert(draft, note, DEFAULT_RAW_CARD_MAPPING)
    );
  });

  const commitHash = crypto
    .createHash('sha256')
    .update(`${sourceId}:${committedBy}:${Date.now()}`)
    .digest('hex');

  const { error } = await supabase.rpc('commit_purchase_source', {
    p_source_id: sourceId,
    p_committed_by: committedBy,
    p_commit_hash: commitHash,
    p_raw_cards: inserts
  });

  if (error) {
    throw error;
  }

  return { inserted: inserts.length, commitHash };
};
