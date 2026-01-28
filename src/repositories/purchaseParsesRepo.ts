import { supabase } from './supabaseClient.js';

export const insertPurchaseParse = async (payload: {
  purchase_source_id: string;
  parser_version: string;
  status: string;
  confidence: number;
  result_json: Record<string, unknown>;
  error?: string | null;
}) => {
  const { data, error } = await supabase
    .from('purchase_parses')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
};
