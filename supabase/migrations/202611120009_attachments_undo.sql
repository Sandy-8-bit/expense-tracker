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
