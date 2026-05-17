import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://stwpdjjpdfnxvvqxreny.supabase.co';
const supabaseAnonKey = 'sb_publishable_fB8h7Xbi1TzqBJoWP1ztzw_DzWuvMHO';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
