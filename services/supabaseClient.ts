import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase environment variables are missing! Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your deployment settings.');
}

// Use placeholders only to prevent immediate crash during build/load, 
// but actual queries will fail with a clear message if these are used.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseKey || 'placeholder'
);
