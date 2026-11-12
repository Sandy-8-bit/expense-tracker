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
