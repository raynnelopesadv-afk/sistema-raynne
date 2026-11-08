import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// As tabelas do módulo jurídico ainda não estão no types.ts gerado; usamos o
// mesmo client, sem tipagem de schema, só nessas telas.
export const db = supabase as unknown as SupabaseClient;
