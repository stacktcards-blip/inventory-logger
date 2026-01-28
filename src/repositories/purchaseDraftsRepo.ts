import { supabase } from './supabaseClient.js';

export type DraftInsert = {
  purchase_source_id: string;
  purchase_parse_id: string | null;
  line_no: number;
  store: string;
  purchase_date: string | null;
  card_name: string | null;
  set_abbr: string | null;
  card_num: string | null;
  lang: string | null;
  quantity: number;
  price_jpy: number | null;
  exchange_rate_formula: string | null;
  notes: string | null;
  confidence: number;
  flags: string[];
  review_status?: string;
};

export const insertDrafts = async (drafts: DraftInsert[]) => {
  const { data, error } = await supabase.from('purchase_drafts').insert(drafts).select();
  if (error) throw error;
  return data ?? [];
};

export const listDraftsForSource = async (sourceId: string) => {
  const { data, error } = await supabase
    .from('purchase_drafts')
    .select('*')
    .eq('purchase_source_id', sourceId)
    .order('line_no', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const updateDraft = async (id: string, updates: Record<string, unknown>) => {
  const { data, error } = await supabase.from('purchase_drafts').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const approveDraftsForSource = async (sourceId: string, reviewer: string) => {
  const { data, error } = await supabase
    .from('purchase_drafts')
    .update({ review_status: 'approved', reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
    .eq('purchase_source_id', sourceId)
    .select();
  if (error) throw error;
  return data ?? [];
};
