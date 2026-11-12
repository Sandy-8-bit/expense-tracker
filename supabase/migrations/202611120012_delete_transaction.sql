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
