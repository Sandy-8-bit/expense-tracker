import { expect, it } from 'vitest';
import { buildReport, reportCSV, ReportData } from './reports';
const data: ReportData = {
  companies: [{ id: 'c', name: 'Customer' }],
  categories: [{ id: 'e', name: 'Travel', type: 'expense' }],
  invoices: [
    {
      id: 'i',
      company_id: 'c',
      number: 'A',
      invoice_date: '2026-10-01',
      net: '100',
      receipts: '60',
      outstanding: '40',
      expenses: '10',
      cash_remaining: '50',
      status: 'Partially Paid',
    },
  ],
  transactions: [
    { id: 't', txn_date: '2026-11-01', amount: '60', unassigned: '0', other_income_amount: '0' },
    {
      id: 'd',
      txn_date: '2026-11-02',
      amount: '-10',
      expense_category_id: 'e',
      expense_invoice_id: 'i',
      unassigned: '0',
      other_income_amount: '0',
    },
  ],
  allocations: [{ transaction_id: 't', invoice_id: 'i', amount: '60' }],
  expenses: [],
};
const filters = { from: '2026-11-01', to: '2026-11-30', company: '', category: '' };
it('includes older invoices paid in the period and preserves cumulative balances', () => {
  const report = buildReport('invoice', data, filters);
  expect(report.rows).toHaveLength(1);
  expect(report.rows[0]).toContain('40');
  expect(report.rows[0]).toContain('50');
});
it('counts linked bank expenses once', () => {
  const report = buildReport('expense', data, filters);
  expect(report.rows[0]).toEqual(['Travel', '10.00', '0.00', '10.00']);
});
it('exports BOM, metadata and protects against formula injection', () => {
  const report = buildReport('company', data, filters);
  const csv = reportCSV('company', filters, { ...report, rows: [['=HYPERLINK("x")']] });
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain('"Report","company"');
  expect(csv).toContain("'=HYPERLINK");
});
