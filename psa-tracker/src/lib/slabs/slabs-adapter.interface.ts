/**
 * Card identity from PSA order / order card for slab matching.
 */
export type SlabMatchCardIdentity = {
  cert_number?: string | null;
  psa_order_number: string;
  set_abbr?: string | null;
  card_number?: string | null;
  lang?: string | null;
  card_name?: string | null;
  sku?: string | null;
};

/**
 * Matched slab from slabs_dashboard (or slabs).
 */
export type SlabMatchResult = {
  id: string;
  sku: string | null;
  cert: string | null;
  set_abbr: string;
  num: string;
  lang: string;
  card_name: string | null;
  grade: string | null;
  order_number: string | null;
  grading_order_id: number | null;
  /** How this slab was matched: cert | order_number | set_num_lang */
  match_type: 'cert' | 'order_number' | 'set_num_lang';
};

/**
 * Per-card slab matches (card id -> matched slabs).
 */
export type SlabMatchesByCard = {
  cardId: string;
  cardName: string;
  setAbbr: string;
  cardNumber: string;
  lang: string;
  certNumber: string | null;
  matches: SlabMatchResult[];
};

/**
 * Order-level slab matches (slabs matched by order_number).
 */
export type SlabMatchesForOrder = {
  orderId: string;
  psaOrderNumber: string;
  /** Slabs matched by order_number (all cards in order) */
  orderLevelMatches: SlabMatchResult[];
  /** Per-card matches (cert, set+num+lang) */
  byCard: SlabMatchesByCard[];
};

export interface SlabsAdapter {
  /**
   * Find slab matches for a PSA order and its cards.
   */
  findMatches(params: {
    orderId: string;
    psaOrderNumber: string;
    cards: Array<{
      id: string;
      card_name: string;
      set_abbr: string;
      card_number: string;
      lang: string;
      cert_number: string | null;
    }>;
  }): Promise<SlabMatchesForOrder>;
}
