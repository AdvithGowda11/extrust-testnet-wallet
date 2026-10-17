-- Run once in the project's Supabase SQL editor. Existing backup rows are preserved.
create table if not exists public.wallet_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ciphertext text not null,
  salt text not null,
  iv text not null,
  kdf_iterations integer not null,
  format_version integer not null default 2,
  updated_at timestamptz not null default now()
);
-- Rows from an older deployment must retain their v1 identity.
alter table public.wallet_backups add column if not exists format_version integer not null default 1;
alter table public.wallet_backups alter column format_version set default 2;
alter table public.wallet_backups enable row level security;
alter table public.wallet_backups force row level security;
revoke all on public.wallet_backups from anon;
grant select,insert,update,delete on public.wallet_backups to authenticated;
-- Old permissive policies combine with OR, so remove policies on this dedicated table.
do $$ declare p record; begin
  for p in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'wallet_backups'
  loop execute format('drop policy %I on public.wallet_backups', p.policyname); end loop;
end $$;
create policy "own backups" on public.wallet_backups for all to authenticated
 using ((select auth.uid()) = user_id)
 with check ((select auth.uid()) = user_id and format_version = 2
 and length(ciphertext) between 24 and 90000 and length(salt) = 24 and length(iv) = 16
 and kdf_iterations between 210000 and 1000000);
