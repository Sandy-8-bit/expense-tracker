import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const db = new PGlite();
const owner = '00000000-0000-0000-0000-000000000001',
  viewer = '00000000-0000-0000-0000-000000000002';
let org: string, company: string, invoice: string, txn: string;
beforeAll(async () => {
  await db.exec(
    `create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;`,
  );
  for (const file of readdirSync(resolve('supabase/migrations')).sort())
    await db.exec(
      readFileSync(resolve('supabase/migrations', file), 'utf8').replace(
        'create extension if not exists pgcrypto;',
        '',
      ),
    );
  await db.exec(
    `grant usage on schema public,auth,storage to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated; grant execute on all functions in schema auth to authenticated; insert into auth.users values('${owner}'),('${viewer}'); set role authenticated; set request.jwt.claim.sub='${owner}';`,
  );
  org = (await db.query<{ id: string }>(`select public.create_organization('Test company') id`))
    .rows[0].id;
  company = (
    await db.query<{ id: string }>(
      `insert into public.companies(organization_id,name) values($1,'Customer') returning id`,
      [org],
    )
  ).rows[0].id;
  const bank = (
    await db.query<{ id: string }>(
      `insert into public.bank_accounts(organization_id,name) values($1,'Bank') returning id`,
      [org],
    )
  ).rows[0].id;
  invoice = (
    await db.query<{ id: string }>(`select public.save_invoice($1,$2::jsonb) id`, [
      org,
      JSON.stringify({
        number: 'INV-1',
        company_id: company,
        invoice_date: '2026-11-01',
        due_date: '2026-11-30',
        taxable_value: '100',
        cgst_pct: '0',
        sgst_pct: '0',
        igst_pct: '0',
        tds_pct: '0',
        lines: [],
      }),
    ])
  ).rows[0].id;
  txn = (
    await db.query<{ id: string }>(
      `insert into public.bank_transactions(organization_id,bank_account_id,txn_date,description,amount,source) values($1,$2,'2026-11-02','Receipt',100,'manual') returning id`,
      [org, bank],
    )
  ).rows[0].id;
}, 60000);
afterAll(async () => {
  await db.close();
});
it('deletes exactly one unclassified imported row with authorization and audit', async () => {
  const rows = await db.query<{ id: string }>(
    `insert into public.bank_transactions
    (organization_id,bank_account_id,txn_date,description,amount,source)
    select organization_id,bank_account_id,'2026-11-10',label,25,'imported'
    from public.bank_transactions cross join (values ('Delete target'),('Keep sibling')) labels(label)
    where id=$1 returning id`,
    [txn],
  );
  const [target, sibling] = rows.rows.map((row) => row.id);
  await db.exec(`set request.jwt.claim.sub='${viewer}'`);
  await expect(
    db.query(`select public.delete_imported_transaction($1,$2)`, [org, target]),
  ).rejects.toThrow('Not authorized');
  await db.exec(`set request.jwt.claim.sub='${owner}'`);
  await db.query(`delete from public.bank_transactions where id=$1`, [target]);
  expect(
    (await db.query(`select id from public.bank_transactions where id=$1`, [target])).rows,
  ).toHaveLength(1);
  await db.query(`select public.save_receipt_allocations($1,0,$2::jsonb)`, [
    target,
    JSON.stringify([{ invoice_id: invoice, amount: '10' }]),
  ]);
  const before = await db.query(
    `select receipts,pending from public.invoice_financials where id=$1`,
    [invoice],
  );
  await expect(
    db.query(`select public.delete_imported_transaction($1,$2)`, [org, target]),
  ).rejects.toThrow('Remove classifications');
  expect(
    (
      await db.query(`select receipts,pending from public.invoice_financials where id=$1`, [
        invoice,
      ])
    ).rows,
  ).toEqual(before.rows);
  await db.query(`select public.save_receipt_allocations($1,0,'[]'::jsonb)`, [target]);
  await db.query(`select public.delete_imported_transaction($1,$2)`, [org, target]);
  expect(
    (await db.query(`select id from public.bank_transactions where id=$1`, [target])).rows,
  ).toHaveLength(0);
  expect(
    (await db.query(`select id from public.bank_transactions where id=$1`, [sibling])).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query(`select id from public.audit_log where entity_id=$1 and action='DELETE'`, [
        target,
      ])
    ).rows,
  ).toHaveLength(1);
  await expect(
    db.query(`select public.delete_imported_transaction($1,$2)`, [org, target]),
  ).rejects.toThrow('already deleted');
});
it('preserves category types used by financial records', async () => {
  const category = (
    await db.query<{ id: string }>(
      `select id from public.categories where organization_id=$1 and type='expense' limit 1`,
      [org],
    )
  ).rows[0].id;
  await expect(
    db.query(`update public.categories set type='bank' where id=$1`, [category]),
  ).rejects.toThrow('Category type');
  await expect(
    db.query(`insert into public.companies(organization_id,name) values($1,'   ')`, [org]),
  ).rejects.toThrow();
});
it('bulk link is capped and idempotent on retry', async () => {
  const request = '10000000-0000-0000-0000-000000000001';
  const first = await db.query<{ result: { linked: number } }>(
    `select public.bulk_link($1,$2::uuid[],$3,$4) result`,
    [org, [txn], invoice, request],
  );
  const before = await db.query(
    `select amount::text from public.receipt_allocations where transaction_id=$1`,
    [txn],
  );
  const second = await db.query(`select public.bulk_link($1,$2::uuid[],$3,$4) result`, [
    org,
    [txn],
    invoice,
    request,
  ]);
  expect(second.rows).toEqual(first.rows);
  expect(
    (
      await db.query(
        `select amount::text from public.receipt_allocations where transaction_id=$1`,
        [txn],
      )
    ).rows,
  ).toEqual(before.rows);
  await db.query(`select public.save_receipt_allocations($1,0,'[]'::jsonb)`, [txn]);
});
it('reimport skips duplicates', async () => {
  const bank = (
    await db.query<{ bank_account_id: string }>(
      `select bank_account_id from public.bank_transactions where id=$1`,
      [txn],
    )
  ).rows[0].bank_account_id;
  const path = `${org}/test.csv`;
  await db.exec(`reset role`);
  await db.query(`insert into storage.objects(bucket_id,name) values('statements',$1)`, [path]);
  await db.exec(`set role authenticated`);
  const rows = JSON.stringify([
    { date: '2026-11-05', description: 'Import test', amount: '20.00' },
  ]);
  const first = await db.query<{ result: { imported: number; skipped: number } }>(
    `select public.import_statement($1,$2,$3,'test.csv',$4::jsonb) result`,
    [org, bank, path, rows],
  );
  const second = await db.query<{ result: { imported: number; skipped: number } }>(
    `select public.import_statement($1,$2,$3,'test.csv',$4::jsonb) result`,
    [org, bank, path, rows],
  );
  expect(first.rows[0].result).toEqual({ imported: 1, skipped: 0 });
  expect(second.rows[0].result).toEqual({ imported: 0, skipped: 1 });
});
it('replaces allocations and preserves remaining credit', async () => {
  await db.query(`select public.save_receipt_allocations($1,10,$2::jsonb)`, [
    txn,
    JSON.stringify([{ invoice_id: invoice, amount: '60' }]),
  ]);
  await db.query(`select public.save_receipt_allocations($1,10,$2::jsonb)`, [
    txn,
    JSON.stringify([{ invoice_id: invoice, amount: '50' }]),
  ]);
  const result = await db.query<{ unassigned: string }>(
    `select unassigned::text from public.transaction_financials where id=$1`,
    [txn],
  );
  expect(result.rows[0].unassigned).toBe('40.00');
  await expect(
    db.query(`select public.save_receipt_allocations($1,10,$2::jsonb)`, [
      txn,
      JSON.stringify([{ invoice_id: invoice, amount: '101' }]),
    ]),
  ).rejects.toThrow();
});
it('blocks invoice edits below receipts', async () => {
  await expect(
    db.query(`select public.save_invoice($1,$2::jsonb)`, [
      org,
      JSON.stringify({
        id: invoice,
        number: 'INV-1',
        company_id: company,
        invoice_date: '2026-11-01',
        due_date: '2026-11-30',
        taxable_value: '1',
        cgst_pct: '0',
        sgst_pct: '0',
        igst_pct: '0',
        tds_pct: '0',
        lines: [],
      }),
    ]),
  ).rejects.toThrow('Net receivable');
});
it('isolates tenants and makes viewers read-only', async () => {
  await db.exec(
    `reset role;insert into public.memberships values('${viewer}','${org}','viewer');set role authenticated;set request.jwt.claim.sub='${viewer}';`,
  );
  await expect(
    db.query(`insert into public.companies(organization_id,name) values($1,'Forbidden')`, [org]),
  ).rejects.toThrow();
  await expect(
    db.query(`select public.save_receipt_allocations($1,0,'[]'::jsonb)`, [txn]),
  ).rejects.toThrow('Not authorized');
  await db.exec(`set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';`);
  expect((await db.query(`select * from public.invoices`)).rows).toHaveLength(0);
  await db.exec(`set request.jwt.claim.sub='${owner}';`);
});
