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
