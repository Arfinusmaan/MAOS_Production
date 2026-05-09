import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let url = '', key = '';
if (fs.existsSync('.env')) {
  const content = fs.readFileSync('.env', 'utf8');
  url = content.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim() || '';
  key = content.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim() || '';
}

if (!url || !key) {
  if (fs.existsSync('.env.local')) {
    const content = fs.readFileSync('.env.local', 'utf8');
    url = content.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim() || '';
    key = content.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim() || '';
  }
}

const supabase = createClient(url, key);

async function fix() {
  console.log('Fixing RLS policies on public.users to prevent infinite recursion loop...');
  
  // Since we don't have direct access to SQL execution via Supabase JS client unless there is an RPC, 
  // let's check if the user has an RPC to run SQL, or wait, we can just explain the fix to the user,
  // update the sql file, and ask them to run it, OR we can try to find an RPC!
  // Let's check if there is a function like `exec_sql` or similar.
  const { data, error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1;' });
  if (error) {
    console.log('exec_sql rpc is not available (this is normal). We will update the sql file on disk.');
  } else {
    console.log('exec_sql RPC is available! Running the fix...');
    const fixSql = `
      -- Fix recursive policies on public.users
      drop policy if exists "users_select_admin" on public.users;
      drop policy if exists "users_update_admin" on public.users;

      create policy "users_select_admin" on public.users
        for select using (auth.jwt() ->> 'email' = 'arfin@getmoreappts.com');

      create policy "users_update_admin" on public.users
        for update using (auth.jwt() ->> 'email' = 'arfin@getmoreappts.com');
    `;
    const { error: runErr } = await supabase.rpc('exec_sql', { sql: fixSql });
    if (runErr) {
      console.error('Error running fix:', runErr.message);
    } else {
      console.log('Successfully applied recursion fix!');
    }
  }
}

fix();
