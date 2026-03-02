import { supabase } from './supabaseClient.js';

export type SlabIntakeDraftInsert = {
  cert: string;
  status?: string;
  grade?: string | null;
  set_abbr?: string | null;
  num?: string | null;
  lang?: string | null;
  grading_company?: string | null;
  card_name?: string | null;
  is_1ed?: boolean | null;
  is_rev?: boolean | null;
  note?: string | null;
  order_number?: string | null;
  acquired_date?: string | null;
  image_url?: string | null;
  result_json?: Record<string, unknown> | null;
};

export async function insertDraft(draft: SlabIntakeDraftInsert) {
  const { data, error } = await supabase
    .from('slab_intake_drafts')
    .insert({
      ...draft,
      status: draft.status ?? 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listDraftsByStatus(status: string) {
  const { data, error } = await supabase
    .from('slab_intake_drafts')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getDraftById(id: string) {
  const { data, error } = await supabase
    .from('slab_intake_drafts')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function updateDraft(id: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('slab_intake_drafts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markCommitted(id: string, committedBy: string) {
  const { data, error } = await supabase
    .from('slab_intake_drafts')
    .update({
      status: 'committed',
      committed_at: new Date().toISOString(),
      committed_by: committedBy,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Check if a cert already exists in slabs (inventory). */
export async function slabExistsByCert(cert: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('slabs')
    .select('id')
    .eq('cert', cert)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

/** Check if there is already a pending or approved draft for this cert. */
export async function hasPendingOrApprovedDraft(cert: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('slab_intake_drafts')
    .select('id')
    .eq('cert', cert)
    .in('status', ['pending', 'approved'])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}
