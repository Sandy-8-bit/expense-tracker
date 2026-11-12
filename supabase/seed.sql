-- Development only. Run after migrations in the Supabase SQL editor.
-- Set the ID of an organisation created through the application first:
-- select set_config('clearledger.organization_id', 'YOUR-ORGANIZATION-UUID', false);
do $$
declare org uuid:=nullif(current_setting('clearledger.organization_id',true),'')::uuid;
 bank uuid; customer uuid; inv uuid; cat uuid; m integer; n integer; dt date;begin
 if org is null or not exists(select 1 from public.organizations where id=org) then raise exception 'Set clearledger.organization_id to an existing development organisation';end if;
 insert into public.companies(organization_id,name,gstin) select org,name,gstin from (values('Bagavathi Machine Works (P) Ltd','33AACCB4060E1ZA'),('ABC Technologies',null),('Northstar Solutions',null),('Kovai Industrial Services',null)) c(name,gstin) where not exists(select 1 from public.companies where organization_id=org and companies.name=c.name);
 insert into public.bank_accounts(organization_id,name,account_last4,opening_balance) select org,name,last4,balance from (values('IDBI Current Account','1892',100000),('ICICI Current Account','0390',150000)) b(name,last4,balance) where not exists(select 1 from public.bank_accounts where organization_id=org and bank_accounts.name=b.name);
 select id into customer from public.companies where organization_id=org and name='Bagavathi Machine Works (P) Ltd' limit 1;
 insert into public.invoices(organization_id,company_id,number,invoice_date,due_date,description,taxable_value,cgst_pct,sgst_pct,igst_pct,tds_pct,round_off) values(org,customer,'143/26-27','2026-11-03','2026-11-30','998519 — MANPOWER SUPPLY',18455,9,9,0,2,.20) on conflict do nothing;
 select id into inv from public.invoices where organization_id=org and number='143/26-27';
 select id into cat from public.categories where organization_id=org and type='deduction' and name='Food';
 if cat is not null and not exists(select 1 from public.invoice_lines where invoice_id=inv) then insert into public.invoice_lines(organization_id,invoice_id,kind,category_id,amount) values(org,inv,'deduction',cat,800);end if;
 for m in 7..11 loop for n in 1..6 loop
  select id into customer from public.companies where organization_id=org order by name offset (n%4) limit 1;
  dt:=make_date(2026,m,n*4);
  insert into public.invoices(organization_id,company_id,number,invoice_date,due_date,description,taxable_value,cgst_pct,sgst_pct,igst_pct,tds_pct)
  values(org,customer,'SV-'||to_char(dt,'YYYYMM')||'-'||lpad(n::text,2,'0'),dt,dt+30,'Professional services',10000+n*2500,case when n%3=0 then 0 else 9 end,case when n%3=0 then 0 else 9 end,case when n%3=0 then 18 else 0 end,case when n%2=0 then 2 else 0 end) on conflict do nothing;
 end loop;end loop;
 for n in 1..550 loop
  select id into bank from public.bank_accounts where organization_id=org order by name offset (n%2) limit 1;
  dt:='2026-07-01'::date+(n%153);
  insert into public.bank_transactions(organization_id,bank_account_id,txn_date,description,amount,source) values(org,bank,dt,'DEMO TRANSACTION '||lpad(n::text,4,'0'),case when n%4=0 then 5000+n*37 else -(150+n*11) end,'manual') on conflict do nothing;
 end loop;
 select id into bank from public.bank_accounts where organization_id=org and name='IDBI Current Account' limit 1;
 insert into public.bank_transactions(organization_id,bank_account_id,txn_date,description,amount,source) values(org,bank,'2026-11-06','NEFT RECEIPT / INVOICE 143',20607.90,'manual') on conflict do nothing;
end $$;
