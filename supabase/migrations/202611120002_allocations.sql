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
