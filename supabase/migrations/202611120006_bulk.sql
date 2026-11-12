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
