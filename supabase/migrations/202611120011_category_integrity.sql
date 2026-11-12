-- Historical references depend on category type remaining stable.
create function public.validate_category_identity() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.type <> old.type or new.organization_id <> old.organization_id then
  raise exception 'Category type and organisation cannot be changed; create a new category instead';
 end if;
 if length(trim(new.name))=0 then raise exception 'Category name is required'; end if;
 return new;
end $$;
create trigger category_identity before update on public.categories
for each row execute function public.validate_category_identity();
alter table public.categories add constraint category_name_required check(length(trim(name))>0);
alter table public.companies add constraint company_name_required check(length(trim(name))>0);
alter table public.bank_accounts add constraint bank_name_required check(length(trim(name))>0);
