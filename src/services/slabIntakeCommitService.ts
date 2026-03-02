import { supabase } from '../repositories/supabaseClient.js';
import { getDraftById, markCommitted } from '../repositories/slabIntakeDraftsRepo.js';

type DraftRow = {
  id: string;
  cert: string;
  status: string;
  grade: string | null;
  set_abbr: string | null;
  num: string | null;
  lang: string | null;
  grading_company: string | null;
  card_name: string | null;
  is_1ed: boolean | null;
  is_rev: boolean | null;
  note: string | null;
  order_number: string | null;
  acquired_date: string | null;
};

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/**
 * Commit an approved slab intake draft into the slabs table.
 * Sets acquired_date to today if not set (purchased slab semantics).
 */
export async function commitSlabIntakeDraft(draftId: string, committedBy: string) {
  const draft = await getDraftById(draftId);
  const row = draft as DraftRow;

  if (row.status !== 'approved') {
    throw new Error('Draft must be approved before commit');
  }

  const acquiredDate = row.acquired_date ?? todayISO();

  const slabInsert = {
    cert: row.cert,
    grading_company: row.grading_company ?? 'PSA',
    grade: row.grade,
    set_abbr: row.set_abbr,
    num: row.num,
    lang: row.lang,
    is_1ed: row.is_1ed ?? null,
    is_rev: row.is_rev ?? null,
    note: row.note ?? null,
    order_number: row.order_number ?? null,
    acquired_date: acquiredDate,
    // sku left null; raw_card_id, grading_order_id, listed/sold dates left null
  };

  const { data: inserted, error } = await supabase
    .from('slabs')
    .insert(slabInsert)
    .select('id, cert, grade, set_abbr, num, lang')
    .single();

  if (error) throw error;

  await markCommitted(draftId, committedBy);

  return { slab: inserted };
}
