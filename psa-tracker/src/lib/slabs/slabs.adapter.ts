import { createClient } from '@/lib/supabase/server';
import type { SlabMatchResult, SlabMatchesByCard, SlabMatchesForOrder } from './slabs-adapter.interface';

const LANG_NORMALIZE: Record<string, string> = {
  EN: 'ENG',
};

function normalizeLang(lang: string | null | undefined): string {
  if (!lang) return '';
  const trimmed = lang.trim();
  return LANG_NORMALIZE[trimmed] ?? trimmed;
}

function toSlabMatch(row: Record<string, unknown>, matchType: SlabMatchResult['match_type']): SlabMatchResult {
  return {
    id: String(row.id ?? ''),
    sku: row.sku != null ? String(row.sku) : null,
    cert: row.cert != null ? String(row.cert) : null,
    set_abbr: String(row.set_abbr ?? ''),
    num: String(row.num ?? ''),
    lang: String(row.lang ?? ''),
    card_name: row.card_name != null ? String(row.card_name) : null,
    grade: row.grade != null ? String(row.grade) : null,
    order_number: row.order_number != null ? String(row.order_number) : null,
    grading_order_id: row.grading_order_id != null ? Number(row.grading_order_id) : null,
    match_type: matchType,
  };
}

function dedupeBySlabId(slabs: SlabMatchResult[]): SlabMatchResult[] {
  const seen = new Set<string>();
  return slabs.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

export async function findSlabMatches(params: {
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
}): Promise<SlabMatchesForOrder> {
  const supabase = await createClient();
  const { orderId, psaOrderNumber, cards } = params;

  const selectCols = 'id, sku, cert, set_abbr, num, lang, card_name, grade, order_number, grading_order_id';

  // 1. Order-level: slabs where order_number = psa_order_number
  const { data: orderSlabs } = await supabase
    .from('slabs_dashboard')
    .select(selectCols)
    .eq('order_number', psaOrderNumber);

  const orderLevelMatches: SlabMatchResult[] = (orderSlabs ?? []).map((r) =>
    toSlabMatch(r as Record<string, unknown>, 'order_number')
  );

  // 2. Per-card: cert_number match
  const certNumbers = Array.from(new Set(cards.map((c) => c.cert_number).filter(Boolean) as string[]));
  let certSlabs: SlabMatchResult[] = [];
  if (certNumbers.length > 0) {
    const { data } = await supabase
      .from('slabs_dashboard')
      .select(selectCols)
      .in('cert', certNumbers);
    certSlabs = (data ?? []).map((r) => toSlabMatch(r as Record<string, unknown>, 'cert'));
  }

  // 3. Per-card: set_abbr + num + lang match (normalize lang EN -> ENG)
  const setNumLangQueries = cards
    .filter((c) => c.set_abbr && c.card_number)
    .map((c) => ({
      card: c,
      slabLang: normalizeLang(c.lang) || c.lang,
    }));

  const setNumLangResults = await Promise.all(
    setNumLangQueries.map(async ({ card, slabLang }) => {
      const { data } = await supabase
        .from('slabs_dashboard')
        .select(selectCols)
        .eq('set_abbr', card.set_abbr)
        .eq('num', card.card_number)
        .eq('lang', slabLang);
      return { card, slabs: (data ?? []).map((r) => toSlabMatch(r as Record<string, unknown>, 'set_num_lang')) };
    })
  );

  const setNumLangByCardId = new Map(setNumLangResults.map((r) => [r.card.id, r.slabs]));

  const byCard: SlabMatchesByCard[] = cards.map((card) => {
    const matches: SlabMatchResult[] = [];

    if (card.cert_number) {
      const certMatch = certSlabs.find((s) => s.cert === card.cert_number);
      if (certMatch) matches.push(certMatch);
    }

    const setNumLangSlabs = setNumLangByCardId.get(card.id) ?? [];
    matches.push(...setNumLangSlabs);

    return {
      cardId: card.id,
      cardName: card.card_name,
      setAbbr: card.set_abbr,
      cardNumber: card.card_number,
      lang: card.lang,
      certNumber: card.cert_number,
      matches: dedupeBySlabId(matches),
    };
  });

  return {
    orderId,
    psaOrderNumber,
    orderLevelMatches: dedupeBySlabId(orderLevelMatches),
    byCard,
  };
}
