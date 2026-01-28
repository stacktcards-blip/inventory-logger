import { supabase } from './supabaseClient.js';

export const insertCommit = async (payload: {
  purchase_source_id: string;
  committed_by: string;
  commit_hash: string;
}) => {
  const { data, error } = await supabase
    .from('purchase_commits')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
};
