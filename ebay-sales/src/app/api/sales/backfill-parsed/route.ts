/**
 * Backfill parsed data and images for existing ebay_sales rows.
 * Re-parses titles and fetches images for rows that need them.
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { jsonWithCors } from '@/lib/cors';
import { parseCarduploaderTitle } from '@/lib/ebay/title-parser';
import { fetchItemImageUrl } from '@/lib/ebay/fetch-item-image';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const supabase = await getAuthenticatedClient(request);
  if (!supabase) {
    return jsonWithCors({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: sales } = await admin
    .from('ebay_sales')
    .select('id, title, ebay_item_id, card_name, parse_confidence, image_url')
    .or('card_name.is.null,parse_confidence.lt.0.5,image_url.is.null');

  let updated = 0;

  for (const sale of sales ?? []) {
    const updates: Record<string, unknown> = {};
    let changed = false;

    if (sale.title && (!sale.card_name || (sale.parse_confidence ?? 1) < 0.5)) {
      const parsed = parseCarduploaderTitle(sale.title);
      if (parsed.card_name || parsed.grade || parsed.set_abbr) {
        updates.card_name = parsed.card_name;
        updates.set_abbr = parsed.set_abbr;
        updates.num = parsed.num;
        updates.set_num = parsed.set_num;
        updates.set_name = parsed.set_name;
        updates.lang = parsed.lang;
        updates.grade = parsed.grade;
        updates.grading_company = parsed.grading_company;
        updates.rarity = parsed.rarity;
        updates.card_game = parsed.card_game;
        updates.parse_confidence = parsed.parse_confidence;
        updates.parse_flags = parsed.parse_flags;
        changed = true;
      }
    }

    if (sale.ebay_item_id && !sale.image_url) {
      const imageUrl = await fetchItemImageUrl(sale.ebay_item_id);
      if (imageUrl) {
        updates.image_url = imageUrl;
        changed = true;
      }
    }

    if (changed && Object.keys(updates).length > 0) {
      const { error } = await admin
        .from('ebay_sales')
        .update(updates)
        .eq('id', sale.id);

      if (!error) updated++;
    }
  }

  return jsonWithCors({ updated, total: sales?.length ?? 0 });
}
