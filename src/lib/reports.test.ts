import { describe, expect, it } from 'vitest';
import { buildReport, reportCSV, type ReportData } from './reports';
import { reportDocument } from './report-pdf';

const filters = { from: '2026-11-01', to: '2026-11-30', company: '', category: '' };
const data: ReportData = {
  invoices: [
    { id: 'i1', number: 'INV-1', company_id: 'c1', invoice_date: '2026-10-01' },
    { id: 'i2', number: 'INV-2', company_id: 'c2', invoice_date: '2026-10-01' },
  ],
  companies: [
    { id: 'c1', name: 'First customer' },
    { id: 'c2', name: 'Second customer' },
  ],
  transactions: [
    { id: 't2', txn_date: '2026-11-15', description: 'Second payment', amount: '900' },
    { id: 't1', txn_date: '2026-11-05', description: 'First payment', amount: '1000' },
    { id: 't0', txn_date: '2026-10-20', description: 'Earlier payment', amount: '50' },
  ],
  allocations: [
    { invoice_id: 'i1', transaction_id: 't2', amount: '900' },
    { invoice_id: 'i1', transaction_id: 't1', amount: '600' },
    { invoice_id: 'i2', transaction_id: 't1', amount: '400' },
    { invoice_id: 'i1', transaction_id: 't0', amount: '50' },
  ],
  expenses: [
    {
      invoice_id: 'i1',
      category_id: 'expense1',
      amount: '10',
      is_active: true,
      expense_date: '2026-11-10',
    },
  ],
  categories: [],
};

describe('payment reporting', () => {
  it('maps expandable rows to invoice IDs across report types', () => {
    expect(buildReport('invoice', data, filters).rowInvoiceIds).toEqual([['i1'], ['i2']]);
    expect(buildReport('company', data, filters).rowInvoiceIds).toEqual([['i1'], ['i2']]);
    expect(buildReport('payment', data, filters).rowInvoiceIds).toEqual([['i1'], ['i2'], ['i1']]);
    const categorized = {
      ...data,
      categories: [{ id: 'expense1', name: 'Travel', type: 'expense' }],
    };
    expect(buildReport('expense', categorized, filters).rowInvoiceIds).toEqual([['i1'], []]);
    const monthly = buildReport('monthly', data, filters);
    const index = monthly.rows.findIndex((row) => row[0] === 'Invoice receipts linked');
    expect(monthly.rowInvoiceIds[index]).toEqual(['i1', 'i2']);
  });

  it('keeps expansion linked by ID when invoice numbers repeat', () => {
    const repeated = {
      ...data,
      invoices: data.invoices.map((invoice) => ({ ...invoice, number: 'SAME' })),
    };
    const report = buildReport('invoice', repeated, { ...filters, company: 'c2' });
    expect(report.rows).toHaveLength(1);
    expect(report.rowInvoiceIds).toEqual([['i2']]);
  });
  it.each(['monthly', 'invoice', 'company', 'expense'])(
    'includes every payment date and invoice number in the %s table and exports',
    (type) => {
      const report = buildReport(type, data, filters);
      const rows = report.paymentHistory!.rows.filter((row) => row[0] === 'INV-1');
      expect(rows.map((row) => row[2])).toEqual(['2026-10-20', '2026-11-05', '2026-11-15']);
      expect(rows.map((row) => row[3])).toEqual(['50.00', '600.00', '900.00']);
      const csv = reportCSV(type, filters, report);
      const pdf = JSON.stringify(reportDocument(type, 'Test', report));
      for (const output of [csv, pdf]) {
        expect(output).toContain('INV-1');
        expect(output).toContain('2026-11-05');
        expect(output).toContain('2026-11-15');
      }
    },
  );

  it('restricts payment history to matching companies and expense invoices', () => {
    expect(
      buildReport('company', data, { ...filters, company: 'c2' }).paymentHistory!.rows.map(
        (row) => row[0],
      ),
    ).toEqual(['INV-2']);
    expect(
      buildReport('expense', data, filters).paymentHistory!.rows.every((row) => row[0] === 'INV-1'),
    ).toBe(true);
    expect(
      buildReport('expense', data, { ...filters, category: 'missing' }).paymentHistory!.rows,
    ).toEqual([]);
  });
  it('lists separate dated payments and uses allocated amounts for split payments', () => {
    const report = buildReport('payment', data, filters);
    expect(report.rows).toEqual([
      ['2026-11-05', 'INV-1', 'First customer', 'First payment', '600.00'],
      ['2026-11-05', 'INV-2', 'Second customer', 'First payment', '400.00'],
      ['2026-11-15', 'INV-1', 'First customer', 'Second payment', '900.00'],
    ]);
    const csv = reportCSV('payment', filters, report);
    expect(csv).toContain('"2026-11-15","INV-1","First customer","Second payment","900.00"');
  });

  it('filters by payment date, company and invoice expense category', () => {
    expect(buildReport('payment', data, { ...filters, company: 'c2' }).rows).toHaveLength(1);
    expect(buildReport('payment', data, { ...filters, category: 'expense1' }).rows).toHaveLength(2);
    expect(buildReport('payment', data, { ...filters, from: '2026-11-10' }).rows[0][0]).toBe(
      '2026-11-15',
    );
    expect(buildReport('payment', data, { ...filters, company: 'missing' }).rows).toEqual([]);
  });

  it('includes the complete payment history beside each invoice without duplicating invoice rows', () => {
    const report = buildReport('invoice', data, filters);
    expect(report.rows).toHaveLength(2);
    const details = report.rows[0][report.headers.indexOf('Payment details (all dates)')];
    expect(details).toBe(
      '2026-10-20: INR 50.00 (Earlier payment) | 2026-11-05: INR 600.00 (First payment) | 2026-11-15: INR 900.00 (Second payment)',
    );
  });
});
