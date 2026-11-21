// Supabase browser client for Настольный клуб.
// The publishable key is designed for client-side use.
// Never put a Supabase secret/service_role key in this file.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://btwknrujdvohanpcvjxw.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_rUGnLMBJwD4J-OlsEzaKOw_3USJ6SE0";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
