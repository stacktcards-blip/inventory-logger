import { supabase } from './supabaseClient.js';

export type PurchaseSourceInsert = {
  source_type: 'japan_email';
  source_system: string;
  external_id: string;
  thread_id: string | null;
  received_at: string;
  raw_subject: string | null;
  raw_from: string | null;
  raw_body_text: string | null;
  raw_body_html: string | null;
  raw_snippet: string | null;
  order_no?: string | null;
  parse_status: string;
  parser_version: string;
  content_hash: string;
};

export const upsertPurchaseSource = async (payload: PurchaseSourceInsert) => {
  const { data, error } = await supabase
    .from('purchase_sources')
    .upsert(payload, { onConflict: 'source_type,external_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const findSourceByContentHash = async (contentHash: string) => {
  const { data, error } = await supabase
    .from('purchase_sources')
    .select('*')
    .eq('content_hash', contentHash)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
};

export const listSourcesByStatus = async (status: string) => {
  const { data, error } = await supabase
    .from('purchase_sources')
    .select('*')
    .eq('parse_status', status)
    .order('received_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
};

export const getSourceWithDrafts = async (id: string) => {
  const { data, error } = await supabase
    .from('purchase_sources')
    .select('*, purchase_drafts(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
};

export const getSourceById = async (id: string) => {
  const { data, error } = await supabase.from('purchase_sources').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
};

export const updateSourceStatus = async (id: string, status: string, parseError?: string | null) => {
  const { data, error } = await supabase
    .from('purchase_sources')
    .update({ parse_status: status, parse_error: parseError ?? null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateSourceMetadata = async (id: string, updates: { order_no?: string | null }) => {
  const { data, error } = await supabase.from('purchase_sources').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};
