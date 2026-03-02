import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  const msg = 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local'
  console.error(msg)
  throw new Error(msg)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
