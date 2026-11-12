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
