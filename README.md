# ClearLedger

An INR finance workspace built with Next.js, TypeScript, Supabase, Decimal.js, TanStack Query/Table, Radix dialogs and ExcelJS. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the remaining differences from the full build specification.

## Local setup

1. Install Node.js 22 or newer and pnpm 10.15.0.
2. Run `pnpm install`.
3. Copy `.env.example` to `.env.local` and fill in your Supabase project URL and anon key. Never commit `.env.local` or expose the service-role key in client code. The normal application uses the signed-in user's credentials and RLS, not the service-role key.
4. For a **fresh Supabase database**, run `supabase/setup.sql` once in the Supabase SQL editor. It is a transaction containing all migrations. For an existing installation, apply only unapplied files in `supabase/migrations`, in filename order. Do not rerun the complete setup over an existing schema.
5. Create an email/password user in Supabase Authentication. Sign in at `/login`, then create your organisation. This creates the owner membership and default categories.
6. Run `pnpm dev` and open `http://localhost:3000`.

The migrations create tenant-scoped finance tables, RLS policies, transactional invoice/allocation/import/bulk functions, private storage buckets and audit records. Application routes use the Next.js 16 `proxy.ts` convention to refresh sessions and protect access.

## Roles and additional users

Create each additional user in Supabase Authentication, then add a membership through the SQL editor using their user ID and your organisation ID:

```sql
insert into public.memberships(user_id, organization_id, role)
values ('USER-UUID', 'ORGANIZATION-UUID', 'accountant');
```

Roles are `owner`, `accountant`, and `viewer`. Viewers can read and export but cannot write finance records. Owners can manage the organisation and memberships. Each membership is scoped to one organisation.

## Sample data

Use a development project. In the SQL editor, first run:

```sql
select set_config('clearledger.organization_id', 'YOUR-ORGANIZATION-UUID', false);
```

Then run `supabase/seed.sql` in the same session. It adds four companies, two banks, 31 invoices, and 551 transactions across July–November 2026. It is repeatable and does not reset existing records. Select those dates when reviewing sample reports. Invoice 143 computes a net receivable of ₹20,608.00; its example receipt leaves ₹0.10 pending.

## Financial rules

Tax components use half-up rounding to paise. TDS is based on taxable value before GST. Round-off applies to the expected bank receipt, to a whole rupee. IGST cannot coexist with CGST/SGST. Receipt allocations are manual, replace the previous classification atomically, and cannot exceed the credit or invoice balance. Expenses never reduce the invoice receivable. Verify tax treatment with your accountant.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm build
```

The tests include an embedded PostgreSQL database with mock Supabase auth/storage schemas. They execute the migrations and exercise RLS, allocation replacement, invoice protections, bulk retry behaviour and duplicate imports. This does not replace testing against your deployed Supabase project.

Regenerate the combined installation file after changing migrations with `node scripts/build-sql.mjs`. Generate Supabase types with `pnpm db:types --project-id YOUR_PROJECT_ID > src/types/database.ts` after installing/authenticating the Supabase CLI.

## Vercel deployment

Import this repository into Vercel as a Next.js project. Use `pnpm install --frozen-lockfile` and `pnpm build`. Configure the variables from `.env.example` in the target environment, apply the migrations to its Supabase project, and add your deployed origin to Supabase Authentication URL settings. Redeploy after changing public environment variables. No deployment has been performed by this repository setup.
