create table public.import_history(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations,id_file uuid not null references public.files,imported integer not null,skipped integer not null,created_by uuid references auth.users,created_at timestamptz not null default now(),undone_at timestamptz);
alter table public.import_history enable row level security;
create policy read_imports on public.import_history for select to authenticated using(public.org_role(organization_id) is not null);
insert into storage.buckets(id,name,public,file_size_limit) values('statements','statements',false,10485760),('invoices','invoices',false,10485760),('receipts','receipts',false,10485760) on conflict(id) do nothing;
create policy finance_files_read on storage.objects for select to authenticated using(bucket_id in ('statements','invoices','receipts') and public.org_role((storage.foldername(name))[1]::uuid) is not null);
create policy finance_files_insert on storage.objects for insert to authenticated with check(bucket_id in ('statements','invoices','receipts') and public.org_role((storage.foldername(name))[1]::uuid) in ('owner','accountant'));
create policy finance_files_remove on storage.objects for delete to authenticated using(bucket_id in ('statements','invoices','receipts') and public.org_role((storage.foldername(name))[1]::uuid) in ('owner','accountant'));
create function public.import_statement(p_org uuid,p_bank uuid,p_path text,p_name text,p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare f uuid; n integer; total integer; begin
 if coalesce(public.org_role(p_org),'') not in ('owner','accountant') then raise exception 'Not authorized'; end if;
 if not exists(select 1 from public.bank_accounts where id=p_bank and organization_id=p_org and is_active) then raise exception 'Invalid bank account'; end if;
 if split_part(p_path,'/',1)<>p_org::text then raise exception 'Invalid storage path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='statements' and name=p_path) then raise exception 'Original statement must be uploaded first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 insert into public.files(organization_id,kind,storage_path,original_name,created_by) values(p_org,'statement',p_path,p_name,auth.uid()) returning id into f;
 total:=jsonb_array_length(p_rows);
 insert into public.bank_transactions(organization_id,bank_account_id,txn_date,description,amount,source,statement_file_id)
 select p_org,p_bank,(x->>'date')::date,x->>'description',(x->>'amount')::numeric,'imported',f from jsonb_array_elements(p_rows) x
 on conflict(bank_account_id,txn_date,description,amount) do nothing;
 get diagnostics n=row_count;
 insert into public.import_history(organization_id,id_file,imported,skipped,created_by) values(p_org,f,n,total-n,auth.uid());
 return jsonb_build_object('imported',n,'skipped',total-n);
end $$;
revoke all on function public.import_statement(uuid,uuid,text,text,jsonb) from public;
grant execute on function public.import_statement(uuid,uuid,text,text,jsonb) to authenticated;
