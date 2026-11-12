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
