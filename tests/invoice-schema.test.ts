import { expect, test } from 'vitest';
import { invoiceSchema } from '../src/lib/schemas';

const invoice = {
  number: 'EXAMPLE-1',
  company_id: '10000000-0000-4000-8000-000000000001',
  invoice_date: '2026-11-01',
  due_date: '2026-11-30',
  taxable_value: '100',
  cgst_pct: '0',
  sgst_pct: '0',
  tds_pct: '0',
  lines: [],
};
test('new invoices default IGST to zero and reject nonzero IGST', () => {
  expect(invoiceSchema.parse(invoice).igst_pct).toBe('0');
  expect(invoiceSchema.safeParse({ ...invoice, igst_pct: '18' }).success).toBe(false);
});
test('historic IGST invoice editing retains its tax value', () => {
  expect(
    invoiceSchema.parse({ ...invoice, id: '10000000-0000-4000-8000-000000000002', igst_pct: '18' })
      .igst_pct,
  ).toBe('18');
});
