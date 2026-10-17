-- Run against a migrated test project. All fixtures are rolled back.
begin;
insert into auth.users (id) values
 ('f21d14c9-5606-44cd-9eca-33523ee10201'),
 ('f21d14c9-5606-44cd-9eca-33523ee10202');
set local role authenticated;
select set_config('request.jwt.claim.sub','f21d14c9-5606-44cd-9eca-33523ee10201',true);
insert into public.wallet_backups(user_id,ciphertext,salt,iv,kdf_iterations,format_version)
values(auth.uid(),repeat('A',24),repeat('A',24),repeat('A',16),600000,2);
do $$ begin
 if (select count(*) from public.wallet_backups) <> 1 then raise exception 'Own insert/select failed'; end if;
 begin
  update public.wallet_backups set user_id='f21d14c9-5606-44cd-9eca-33523ee10202';
  raise exception 'Ownership reassignment was allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.wallet_backups set format_version=1;
  raise exception 'Invalid format was allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','f21d14c9-5606-44cd-9eca-33523ee10202',true);
do $$ declare changed integer; begin
 if exists(select 1 from public.wallet_backups) then raise exception 'Cross-user read allowed'; end if;
 update public.wallet_backups set ciphertext=repeat('B',24);
 get diagnostics changed = row_count;
 if changed <> 0 then raise exception 'Cross-user update allowed'; end if;
 delete from public.wallet_backups;
 get diagnostics changed = row_count;
 if changed <> 0 then raise exception 'Cross-user delete allowed'; end if;
 begin
  insert into public.wallet_backups(user_id,ciphertext,salt,iv,kdf_iterations,format_version)
  values('f21d14c9-5606-44cd-9eca-33523ee10201',repeat('A',24),repeat('A',24),repeat('A',16),600000,2);
  raise exception 'Cross-user insert allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','f21d14c9-5606-44cd-9eca-33523ee10201',true);
do $$ declare changed integer; begin
 update public.wallet_backups set ciphertext=repeat('B',24) where user_id=auth.uid();
 get diagnostics changed = row_count;
 if changed <> 1 then raise exception 'Own update failed'; end if;
 delete from public.wallet_backups where user_id=auth.uid();
 get diagnostics changed = row_count;
 if changed <> 1 then raise exception 'Own delete failed'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform 1 from public.wallet_backups;
  raise exception 'Anonymous read allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'backup ownership assertions passed; rolling back fixtures' as result;
rollback;
