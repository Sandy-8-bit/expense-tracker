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
