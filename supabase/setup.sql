-- ClearLedger: fresh database setup. Apply once, in a development project first.
BEGIN;
-- 202611120001_initial.sql
create extension if not exists pgcrypto;

create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table public.memberships (user_id uuid not null references auth.users on delete cascade, organization_id uuid not null references public.organizations on delete cascade, role text not null check (role in ('owner','accountant','viewer')), primary key (user_id, organization_id));
create table public.companies (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, name text not null, gstin text, created_at timestamptz not null default now(), unique (organization_id,id));
create table public.bank_accounts (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, name text not null, account_last4 text, opening_balance numeric(14,2) not null default 0, unique (organization_id,id));
create table public.categories (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, type text not null check (type in ('deduction','addition','expense','bank')), name text not null, is_active boolean not null default true, unique (organization_id,id));
create unique index categories_unique_name on public.categories (organization_id, type, lower(name));
create table public.invoices (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, company_id uuid not null, number text not null, invoice_date date not null, due_date date not null, description text not null default '', taxable_value numeric(14,2) not null check (taxable_value >= 0), cgst_pct numeric(5,2) not null default 0 check (cgst_pct >= 0), sgst_pct numeric(5,2) not null default 0 check (sgst_pct >= 0), igst_pct numeric(5,2) not null default 0 check (igst_pct >= 0), tds_pct numeric(5,2) not null default 0 check (tds_pct >= 0), round_off numeric(14,2) not null default 0, unique (organization_id,id), foreign key (organization_id,company_id) references public.companies (organization_id,id), check (igst_pct = 0 or (cgst_pct = 0 and sgst_pct = 0)));
create unique index invoices_unique_number on public.invoices (organization_id, lower(number));
create table public.invoice_lines (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, invoice_id uuid not null, kind text not null check (kind in ('deduction','addition')), category_id uuid not null, amount numeric(14,2) not null check (amount >= 0), foreign key (organization_id,invoice_id) references public.invoices (organization_id,id) on delete cascade, foreign key (organization_id,category_id) references public.categories (organization_id,id));
create table public.files (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, kind text not null check (kind in ('statement','invoice','receipt')), storage_path text not null, original_name text not null, created_by uuid references auth.users, created_at timestamptz not null default now(), unique (organization_id,id));
create table public.bank_transactions (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, bank_account_id uuid not null, txn_date date not null, description text not null, amount numeric(14,2) not null check (amount <> 0), source text not null check (source in ('imported','manual')), statement_file_id uuid, other_income_amount numeric(14,2) not null default 0 check (other_income_amount >= 0), expense_category_id uuid, bank_category_id uuid, expense_invoice_id uuid, unique (organization_id,id), unique (bank_account_id,txn_date,description,amount), foreign key (organization_id,bank_account_id) references public.bank_accounts (organization_id,id), foreign key (organization_id,statement_file_id) references public.files (organization_id,id), foreign key (organization_id,expense_category_id) references public.categories (organization_id,id), foreign key (organization_id,bank_category_id) references public.categories (organization_id,id), foreign key (organization_id,expense_invoice_id) references public.invoices (organization_id,id));
create table public.receipt_allocations (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, transaction_id uuid not null, invoice_id uuid not null, amount numeric(14,2) not null check (amount > 0), unique(transaction_id,invoice_id), foreign key (organization_id,transaction_id) references public.bank_transactions (organization_id,id) on delete cascade, foreign key (organization_id,invoice_id) references public.invoices (organization_id,id));
create table public.manual_expenses (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, expense_date date not null, description text not null, amount numeric(14,2) not null check (amount > 0), category_id uuid not null, invoice_id uuid, payment_source text not null default 'Manual', foreign key (organization_id,category_id) references public.categories (organization_id,id), foreign key (organization_id,invoice_id) references public.invoices (organization_id,id));
create table public.audit_log (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, user_id uuid references auth.users, action text not null, entity text not null, entity_id uuid, before jsonb, after jsonb, at timestamptz not null default now());
create index bank_transactions_org_date on public.bank_transactions (organization_id,txn_date);
create index bank_transactions_bank_date on public.bank_transactions (bank_account_id,txn_date);
create index bank_transactions_invoice on public.bank_transactions (expense_invoice_id);
create index receipt_allocations_invoice on public.receipt_allocations (invoice_id);

-- The definer avoids recursive RLS when membership policies check membership.
create function public.org_role(org uuid) returns text language sql stable security definer set search_path = '' as $$ select role from public.memberships where organization_id = org and user_id = auth.uid() $$;
revoke all on function public.org_role(uuid) from public;
grant execute on function public.org_role(uuid) to authenticated;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
create policy org_read on public.organizations for select to authenticated using (public.org_role(id) is not null);
create policy org_update on public.organizations for update to authenticated using (public.org_role(id) = 'owner') with check (public.org_role(id) = 'owner');
create policy membership_read on public.memberships for select to authenticated using (public.org_role(organization_id) is not null);
create policy membership_owner on public.memberships for all to authenticated using (public.org_role(organization_id) = 'owner') with check (public.org_role(organization_id) = 'owner');
do $$ declare t text; begin
  foreach t in array array['companies','bank_accounts','categories','invoices','invoice_lines','files','bank_transactions','receipt_allocations','manual_expenses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy tenant_read on public.%I for select to authenticated using (public.org_role(organization_id) is not null)', t);
    execute format('create policy tenant_write on public.%I for all to authenticated using (public.org_role(organization_id) in (''owner'',''accountant'')) with check (public.org_role(organization_id) in (''owner'',''accountant''))', t);
  end loop;
end $$;
alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select to authenticated using (public.org_role(organization_id) is not null);


-- 202611120002_allocations.sql
-- Allocation writes must go through this function so validation and replacement are atomic.
drop policy tenant_write on public.receipt_allocations;

create function public.save_receipt_allocations(p_transaction uuid, p_other_income numeric, p_allocations jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  txn public.bank_transactions%rowtype;
  item jsonb;
  inv public.invoices%rowtype;
  allocated numeric;
  net numeric;
  other_receipts numeric;
  total numeric := 0;
  previous jsonb;
begin
  select * into txn from public.bank_transactions where id = p_transaction for update;
  if not found or coalesce(public.org_role(txn.organization_id), '') not in ('owner','accountant') then raise exception 'Not authorized'; end if;
  if txn.amount <= 0 or p_other_income is null or p_other_income < 0 or jsonb_typeof(p_allocations) <> 'array' then raise exception 'Invalid classification'; end if;
  if exists (select 1 from jsonb_array_elements(p_allocations) x group by x->>'invoice_id' having count(*) > 1) then raise exception 'Duplicate invoice'; end if;
  -- Lock invoices in a stable order before checking outstanding balances.
  perform id from public.invoices where id in (select (x->>'invoice_id')::uuid from jsonb_array_elements(p_allocations) x) order by id for update;
  for item in select * from jsonb_array_elements(p_allocations) loop
    allocated := (item->>'amount')::numeric;
    if allocated is null or allocated < 0 or allocated <> round(allocated,2) then raise exception 'Invalid allocation amount'; end if;
    select * into inv from public.invoices where id = (item->>'invoice_id')::uuid and organization_id = txn.organization_id;
    if not found then raise exception 'Invoice not found'; end if;
    select round(inv.taxable_value + round(inv.taxable_value * inv.cgst_pct / 100,2) + round(inv.taxable_value * inv.sgst_pct / 100,2) + round(inv.taxable_value * inv.igst_pct / 100,2)
      + coalesce(sum(case when kind = 'addition' then amount else -amount end),0) - round(inv.taxable_value * inv.tds_pct / 100,2),0)
      into net from public.invoice_lines where invoice_id = inv.id;
    select coalesce(sum(amount),0) into other_receipts from public.receipt_allocations where invoice_id = inv.id and transaction_id <> txn.id;
    if allocated > greatest(0, net - other_receipts) then raise exception 'Allocation exceeds invoice balance'; end if;
    total := total + allocated;
  end loop;
  if p_other_income <> round(p_other_income,2) or total + p_other_income > txn.amount then raise exception 'Classification exceeds credit'; end if;
  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into previous from public.receipt_allocations a where transaction_id = txn.id;
  delete from public.receipt_allocations where transaction_id = txn.id;
  insert into public.receipt_allocations (organization_id,transaction_id,invoice_id,amount)
    select txn.organization_id,txn.id,(x->>'invoice_id')::uuid,(x->>'amount')::numeric from jsonb_array_elements(p_allocations) x where (x->>'amount')::numeric > 0;
  update public.bank_transactions set other_income_amount = p_other_income where id = txn.id;
  insert into public.audit_log (organization_id,user_id,action,entity,entity_id,before,after) values (txn.organization_id,auth.uid(),'classify','bank_transaction',txn.id,jsonb_build_object('allocations',previous,'other_income',txn.other_income_amount),jsonb_build_object('allocations',p_allocations,'other_income',p_other_income));
end $$;
revoke all on function public.save_receipt_allocations(uuid,numeric,jsonb) from public;
grant execute on function public.save_receipt_allocations(uuid,numeric,jsonb) to authenticated;


-- 202611120003_workspace.sql
alter table public.organizations add column payment_terms integer not null default 30;
alter table public.organizations add column invoice_prefix text not null default 'INV-';
alter table public.companies add column is_active boolean not null default true;
alter table public.bank_accounts add column is_active boolean not null default true;
alter table public.manual_expenses add column is_active boolean not null default true;

create view public.invoice_financials with (security_invoker=true) as
with components as (
 select i.*, round(taxable_value*cgst_pct/100,2) cgst, round(taxable_value*sgst_pct/100,2) sgst, round(taxable_value*igst_pct/100,2) igst, round(taxable_value*tds_pct/100,2) tds,
 coalesce((select sum(amount) from public.invoice_lines where invoice_id=i.id and kind='addition'),0) additions,
 coalesce((select sum(amount) from public.invoice_lines where invoice_id=i.id and kind='deduction'),0) deductions,
 coalesce((select sum(amount) from public.receipt_allocations where invoice_id=i.id),0) receipts,
 coalesce((select sum(-amount) from public.bank_transactions where expense_invoice_id=i.id and amount<0),0)+coalesce((select sum(amount) from public.manual_expenses where invoice_id=i.id and is_active),0) expenses
 from public.invoices i
), totals as (select *, round(taxable_value+cgst+sgst+igst+additions-deductions-tds,0) net from components)
select *, net-receipts outstanding, greatest(0,net-receipts) pending, receipts-expenses cash_remaining,
case when net-receipts < -0.009 then 'Overpaid' when net-receipts <= 0.009 then 'Closed' when receipts>0 then 'Partially Paid' else 'Open' end status from totals;

create view public.transaction_financials with (security_invoker=true) as
select t.*, greatest(0,t.amount-t.other_income_amount-coalesce((select sum(amount) from public.receipt_allocations where transaction_id=t.id),0)) unassigned from public.bank_transactions t;

create function public.create_organization(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; begin
 if auth.uid() is null or length(trim(p_name))=0 then raise exception 'Sign in and enter an organisation name'; end if;
 insert into public.organizations(name) values(trim(p_name)) returning id into org;
 insert into public.memberships values(auth.uid(),org,'owner');
 insert into public.categories(organization_id,type,name) select org,typ,nam from (values
 ('deduction','Food'),('deduction','Transport'),('deduction','Labour'),('deduction','Advance'),('deduction','Materials'),('deduction','Miscellaneous'),
 ('addition','Reimbursement'),('addition','Extra Charges'),('addition','Incentive'),('addition','Other'),
 ('expense','Salaries'),('expense','Office Rent'),('expense','Software & Hosting'),('expense','Travel & Transport'),('expense','Utilities'),('expense','Marketing'),('expense','Office Supplies'),
 ('bank','Bank Charges'),('bank','Transfer'),('bank','Refund'),('bank','Tax Payment'),('bank','Other Income'),('bank','Miscellaneous')) v(typ,nam);
 return org;
end $$;
revoke all on function public.create_organization(text) from public;
grant execute on function public.create_organization(text) to authenticated;

create function public.save_invoice(p_org uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare inv uuid; old public.invoices%rowtype; line jsonb; financial record; begin
 if coalesce(public.org_role(p_org),'') not in ('owner','accountant') then raise exception 'Not authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 inv := coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
 select * into old from public.invoices where id=inv for update;
 if found and old.organization_id<>p_org then raise exception 'Not authorized'; end if;
 if old.id is not null and old.company_id<>(p_data->>'company_id')::uuid and exists(select 1 from public.receipt_allocations where invoice_id=inv) then raise exception 'Cannot change customer after receiving payments'; end if;
 if trim(coalesce(p_data->>'number',''))='' then raise exception 'Invoice number required'; end if;
 insert into public.invoices(id,organization_id,company_id,number,invoice_date,due_date,description,taxable_value,cgst_pct,sgst_pct,igst_pct,tds_pct)
 values(inv,p_org,(p_data->>'company_id')::uuid,trim(p_data->>'number'),(p_data->>'invoice_date')::date,(p_data->>'due_date')::date,coalesce(p_data->>'description',''),(p_data->>'taxable_value')::numeric,(p_data->>'cgst_pct')::numeric,(p_data->>'sgst_pct')::numeric,(p_data->>'igst_pct')::numeric,(p_data->>'tds_pct')::numeric)
 on conflict(id) do update set company_id=excluded.company_id,number=excluded.number,invoice_date=excluded.invoice_date,due_date=excluded.due_date,description=excluded.description,taxable_value=excluded.taxable_value,cgst_pct=excluded.cgst_pct,sgst_pct=excluded.sgst_pct,igst_pct=excluded.igst_pct,tds_pct=excluded.tds_pct;
 delete from public.invoice_lines where invoice_id=inv;
 for line in select * from jsonb_array_elements(coalesce(p_data->'lines','[]')) loop
 if not exists(select 1 from public.categories where id=(line->>'category_id')::uuid and organization_id=p_org and type=line->>'kind') then raise exception 'Invalid line category'; end if;
 insert into public.invoice_lines(organization_id,invoice_id,kind,category_id,amount) values(p_org,inv,line->>'kind',(line->>'category_id')::uuid,(line->>'amount')::numeric);
 end loop;
 select * into financial from public.invoice_financials where id=inv;
 if financial.net<0 or financial.net<financial.receipts then raise exception 'Net receivable must cover existing receipts and cannot be negative'; end if;
 update public.invoices set round_off=financial.net-(financial.taxable_value+financial.cgst+financial.sgst+financial.igst+financial.additions-financial.deductions-financial.tds) where id=inv;
 insert into public.audit_log(organization_id,user_id,action,entity,entity_id,before,after) values(p_org,auth.uid(),'save','invoice',inv,to_jsonb(old),p_data);
 return inv;
end $$;
revoke all on function public.save_invoice(uuid,jsonb) from public;
grant execute on function public.save_invoice(uuid,jsonb) to authenticated;
drop policy tenant_write on public.invoices;
drop policy tenant_write on public.invoice_lines;

create function public.audit_finance_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(organization_id,user_id,action,entity,entity_id,before,after) values(coalesce(new.organization_id,old.organization_id),auth.uid(),TG_OP,TG_TABLE_NAME,coalesce(new.id,old.id),case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
create trigger audit_categories after insert or update or delete on public.categories for each row execute function public.audit_finance_change();
create trigger audit_expenses after insert or update or delete on public.manual_expenses for each row execute function public.audit_finance_change();
create trigger audit_transactions after insert or update or delete on public.bank_transactions for each row execute function public.audit_finance_change();


-- 202611120004_guards.sql
create function public.validate_bank_transaction() returns trigger language plpgsql set search_path='' as $$
declare allocated numeric; begin
 if TG_OP='UPDATE' and (new.organization_id<>old.organization_id or new.bank_account_id<>old.bank_account_id or new.amount<>old.amount or new.txn_date<>old.txn_date or new.description<>old.description) then raise exception 'Imported transaction identity cannot be changed'; end if;
 select coalesce(sum(amount),0) into allocated from public.receipt_allocations where transaction_id=new.id;
 if new.amount>0 then
  if new.expense_category_id is not null or new.expense_invoice_id is not null then raise exception 'A credit cannot be an expense'; end if;
  if allocated+new.other_income_amount>new.amount then raise exception 'Classification exceeds credit'; end if;
 else
  if new.other_income_amount<>0 or new.bank_category_id is not null then raise exception 'A debit cannot be classified as income'; end if;
 end if;
 if new.expense_category_id is not null and not exists(select 1 from public.categories where id=new.expense_category_id and organization_id=new.organization_id and type='expense') then raise exception 'Choose an expense category'; end if;
 if new.bank_category_id is not null and not exists(select 1 from public.categories where id=new.bank_category_id and organization_id=new.organization_id and type='bank') then raise exception 'Choose a bank category'; end if;
 return new;
end $$;
create trigger validate_bank before insert or update on public.bank_transactions for each row execute function public.validate_bank_transaction();
create function public.validate_manual_expense() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from public.categories where id=new.category_id and organization_id=new.organization_id and type='expense') then raise exception 'Choose an expense category'; end if;
 if new.payment_source not in ('Manual','Cash') then raise exception 'Choose Cash or Manual'; end if;
 return new; end $$;
create trigger validate_manual before insert or update on public.manual_expenses for each row execute function public.validate_manual_expense();
alter table public.companies add constraint gstin_format check(gstin is null or gstin='' or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
alter table public.bank_accounts add constraint last4_format check(account_last4 is null or account_last4='' or account_last4 ~ '^[0-9]{4}$');


-- 202611120005_imports.sql
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


-- 202611120006_bulk.sql
create table public.operation_results(id uuid primary key,organization_id uuid not null references public.organizations,result jsonb not null);
alter table public.operation_results enable row level security;
create function public.bulk_categorize(p_org uuid,p_ids uuid[],p_category uuid,p_invoice uuid default null,p_link boolean default false) returns integer language plpgsql security definer set search_path='' as $$
declare typ text;n integer;begin
 if coalesce(public.org_role(p_org),'') not in ('owner','accountant') then raise exception 'Not authorized';end if;
 select type into typ from public.categories where id=p_category and organization_id=p_org and is_active;
 if typ not in ('expense','bank') or typ is null then raise exception 'Invalid category';end if;
 if p_invoice is not null and not exists(select 1 from public.invoices where id=p_invoice and organization_id=p_org) then raise exception 'Invalid invoice';end if;
 if typ='expense' then update public.bank_transactions set expense_category_id=p_category,expense_invoice_id=case when p_link then p_invoice else expense_invoice_id end where organization_id=p_org and id=any(p_ids) and amount<0;
 else update public.bank_transactions set bank_category_id=p_category where organization_id=p_org and id=any(p_ids) and amount>0;end if;
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.bulk_categorize(uuid,uuid[],uuid,uuid,boolean) from public;
grant execute on function public.bulk_categorize(uuid,uuid[],uuid,uuid,boolean) to authenticated;
create function public.bulk_link(p_org uuid,p_ids uuid[],p_invoice uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved jsonb;t record;available numeric;remaining numeric;amount_to_link numeric;n integer:=0;begin
 if coalesce(public.org_role(p_org),'') not in ('owner','accountant') then raise exception 'Not authorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 select result into saved from public.operation_results where id=p_request and organization_id=p_org;if found then return saved;end if;
 perform id from public.bank_transactions where organization_id=p_org and id=any(p_ids) order by txn_date,id for update;
 perform id from public.invoices where id=p_invoice and organization_id=p_org for update;
 if not found then raise exception 'Invoice not found';end if;
 select pending into remaining from public.invoice_financials where id=p_invoice;
 for t in select * from public.transaction_financials where organization_id=p_org and id=any(p_ids) and amount>0 order by txn_date,id loop
  amount_to_link:=least(remaining,t.unassigned);
  if amount_to_link>0 then
   insert into public.receipt_allocations(organization_id,transaction_id,invoice_id,amount) values(p_org,t.id,p_invoice,amount_to_link) on conflict(transaction_id,invoice_id) do update set amount=public.receipt_allocations.amount+excluded.amount;
   remaining:=remaining-amount_to_link;n:=n+1;
  end if;
 end loop;
 saved:=jsonb_build_object('linked',n,'skipped',cardinality(p_ids)-n);
 insert into public.operation_results values(p_request,p_org,saved);
 insert into public.audit_log(organization_id,user_id,action,entity,entity_id,after) values(p_org,auth.uid(),'bulk_link','invoice',p_invoice,jsonb_build_object('transaction_ids',p_ids,'result',saved));
 return saved;
end $$;
revoke all on function public.bulk_link(uuid,uuid[],uuid,uuid) from public;
grant execute on function public.bulk_link(uuid,uuid[],uuid,uuid) to authenticated;


-- 202611120007_master_totals.sql
create view public.bank_account_financials with(security_invoker=true) as select b.*,
 coalesce((select sum(amount) from public.bank_transactions where bank_account_id=b.id and amount>0),0) credits,
 coalesce((select sum(-amount) from public.bank_transactions where bank_account_id=b.id and amount<0),0) debits,
 b.opening_balance+coalesce((select sum(amount) from public.bank_transactions where bank_account_id=b.id),0) closing_balance from public.bank_accounts b;
create view public.company_financials with(security_invoker=true) as select c.*,
 (select count(*) from public.invoices where company_id=c.id) invoice_count,
 coalesce((select sum(net) from public.invoice_financials where company_id=c.id),0) net,
 coalesce((select sum(pending) from public.invoice_financials where company_id=c.id),0) pending from public.companies c;
create view public.category_usage with(security_invoker=true) as select c.*,
 (select count(*) from public.bank_transactions where expense_category_id=c.id or bank_category_id=c.id) bank_uses,
 (select count(*) from public.manual_expenses where category_id=c.id and is_active) manual_uses from public.categories c;
create function public.guard_category_type() returns trigger language plpgsql set search_path='' as $$ begin
 if new.type<>old.type and (exists(select 1 from public.invoice_lines where category_id=old.id) or exists(select 1 from public.bank_transactions where expense_category_id=old.id or bank_category_id=old.id) or exists(select 1 from public.manual_expenses where category_id=old.id)) then raise exception 'Cannot change the type of a category used by financial records';end if;return new;end $$;
create trigger guard_category before update on public.categories for each row execute function public.guard_category_type();


-- 202611120008_numbering.sql
create table public.invoice_sequences(organization_id uuid not null references public.organizations,financial_year integer not null,next_number integer not null,primary key(organization_id,financial_year));
alter table public.invoice_sequences enable row level security;
create function public.next_invoice_number(p_org uuid) returns text language plpgsql security definer set search_path='' as $$
declare fy integer:=extract(year from current_date)::integer-case when extract(month from current_date)<4 then 1 else 0 end;n integer;prefix text;begin
 if coalesce(public.org_role(p_org),'') not in ('owner','accountant') then raise exception 'Not authorized';end if;
 select invoice_prefix into prefix from public.organizations where id=p_org;
 insert into public.invoice_sequences values(p_org,fy,2) on conflict(organization_id,financial_year) do update set next_number=public.invoice_sequences.next_number+1 returning next_number-1 into n;
 return prefix||lpad(n::text,4,'0')||'/'||right(fy::text,2)||'-'||right((fy+1)::text,2);
end $$;
revoke all on function public.next_invoice_number(uuid) from public;
grant execute on function public.next_invoice_number(uuid) to authenticated;


-- 202611120009_attachments_undo.sql
alter table public.files add column invoice_id uuid;
alter table public.files add column transaction_id uuid;
alter table public.files add foreign key(organization_id,invoice_id) references public.invoices(organization_id,id);
alter table public.files add foreign key(organization_id,transaction_id) references public.bank_transactions(organization_id,id);
create function public.undo_last_import(p_org uuid) returns integer language plpgsql security definer set search_path='' as $$
declare latest public.import_history%rowtype;n integer;begin
 if coalesce(public.org_role(p_org),'') not in ('owner','accountant') then raise exception 'Not authorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 select * into latest from public.import_history where organization_id=p_org and undone_at is null order by created_at desc,id desc limit 1 for update;
 if not found then raise exception 'No import available to undo';end if;
 perform id from public.bank_transactions where statement_file_id=latest.id_file for update;
 if exists(select 1 from public.bank_transactions t where statement_file_id=latest.id_file and (other_income_amount<>0 or expense_category_id is not null or bank_category_id is not null or expense_invoice_id is not null or exists(select 1 from public.receipt_allocations where transaction_id=t.id) or exists(select 1 from public.files where transaction_id=t.id))) then raise exception 'This import contains classified transactions or attachments. Remove those links before undoing it.';end if;
 delete from public.bank_transactions where statement_file_id=latest.id_file;get diagnostics n=row_count;
 update public.import_history set undone_at=now() where id=latest.id;
 insert into public.audit_log(organization_id,user_id,action,entity,entity_id,after) values(p_org,auth.uid(),'undo_import','import_history',latest.id,jsonb_build_object('removed',n));return n;
end $$;
revoke all on function public.undo_last_import(uuid) from public;
grant execute on function public.undo_last_import(uuid) to authenticated;


-- 202611120010_archive.sql
create function public.archive_record(p_org uuid,p_entity text,p_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if coalesce(public.org_role(p_org),'') not in ('owner','accountant') then raise exception 'Not authorized';end if;
 if p_entity='companies' then
  perform id from public.companies where id=p_id and organization_id=p_org for update;
  if exists(select 1 from public.invoices where company_id=p_id) then raise exception 'This company has invoices and cannot be archived';end if;
  update public.companies set is_active=false where id=p_id and organization_id=p_org;
 elsif p_entity='bank_accounts' then
  perform id from public.bank_accounts where id=p_id and organization_id=p_org for update;
  if exists(select 1 from public.bank_transactions where bank_account_id=p_id) then raise exception 'This bank account has transactions and cannot be archived';end if;
  update public.bank_accounts set is_active=false where id=p_id and organization_id=p_org;
 elsif p_entity='manual_expenses' then update public.manual_expenses set is_active=false where id=p_id and organization_id=p_org;
 else raise exception 'Invalid archive target';end if;
 insert into public.audit_log(organization_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'archive',p_entity,p_id);
end $$;
revoke all on function public.archive_record(uuid,text,uuid) from public;
grant execute on function public.archive_record(uuid,text,uuid) to authenticated;


-- 202611120011_category_integrity.sql
-- Historical references depend on category type remaining stable.
create function public.validate_category_identity() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.type <> old.type or new.organization_id <> old.organization_id then
  raise exception 'Category type and organisation cannot be changed; create a new category instead';
 end if;
 if length(trim(new.name))=0 then raise exception 'Category name is required'; end if;
 return new;
end $$;
create trigger category_identity before update on public.categories
for each row execute function public.validate_category_identity();
alter table public.categories add constraint category_name_required check(length(trim(name))>0);
alter table public.companies add constraint company_name_required check(length(trim(name))>0);
alter table public.bank_accounts add constraint bank_name_required check(length(trim(name))>0);


-- 202611120012_delete_transaction.sql
-- All authenticated deletion goes through a guarded, audited operation.
drop policy tenant_write on public.bank_transactions;
create policy tenant_insert on public.bank_transactions for insert to authenticated
with check (public.org_role(organization_id) in ('owner','accountant'));
create policy tenant_update on public.bank_transactions for update to authenticated
using (public.org_role(organization_id) in ('owner','accountant'))
with check (public.org_role(organization_id) in ('owner','accountant'));

create function public.delete_imported_transaction(p_org uuid, p_transaction uuid)
returns void language plpgsql security definer set search_path='' as $$
declare target public.bank_transactions%rowtype;
begin
  if coalesce(public.org_role(p_org),'') not in ('owner','accountant') then
    raise exception 'Not authorized';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
  select * into target from public.bank_transactions
    where id=p_transaction and organization_id=p_org for update;
  if not found then raise exception 'Transaction not found or already deleted'; end if;
  if target.source <> 'imported' then raise exception 'Only imported transactions can be deleted'; end if;
  if target.other_income_amount <> 0 or target.expense_category_id is not null
    or target.bank_category_id is not null or target.expense_invoice_id is not null
    or exists(select 1 from public.receipt_allocations where transaction_id=target.id)
    or exists(select 1 from public.files where transaction_id=target.id) then
    raise exception 'Remove classifications, invoice allocations and attachments before deleting this transaction';
  end if;
  -- The existing audit_transactions trigger records the full prior row and acting user.
  delete from public.bank_transactions where id=target.id and organization_id=p_org;
end $$;
revoke all on function public.delete_imported_transaction(uuid,uuid) from public;
grant execute on function public.delete_imported_transaction(uuid,uuid) to authenticated;

COMMIT;
