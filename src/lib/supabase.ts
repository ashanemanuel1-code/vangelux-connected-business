import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT'));

// Only the public anon/publishable key is ever shipped to the browser.
// All protection comes from Row Level Security in the database.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce', // keeps auth codes out of the #hash used by our router
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

export const MEDIA_BUCKET = 'product-media';
export const RECEIPTS_BUCKET = 'receipts';
