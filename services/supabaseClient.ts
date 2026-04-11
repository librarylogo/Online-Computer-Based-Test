import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://eiidryzlcooonmutbumu.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpaWRyeXpsY29vb25tdXRidW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4Njc1OTUsImV4cCI6MjA5MTQ0MzU5NX0.tcabiihBecEMW1xLCjCSbUwWnNzDbEvIUOSTCOjb1_4';

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase environment variables are missing! Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your deployment settings.');
}

// Use placeholders only to prevent immediate crash during build/load, 
// but actual queries will fail with a clear message if these are used.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseKey || 'placeholder'
);
