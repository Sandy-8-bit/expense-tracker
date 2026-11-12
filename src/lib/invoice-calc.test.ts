import { describe, expect, it } from 'vitest';
import { calculateInvoice, validateInvoiceEdit } from './invoice-calc';
import { planBulkAllocations, validateAllocations } from './allocation';

const invoice = {
  taxable: '18455',
  cgstPct: '9',
  sgstPct: '9',
  igstPct: '0',
  tdsPct: '2',
  deductions: ['800'],
};
describe('invoice calculations', () => {
  it('rounds tax and net as specified', () => {
    const result = calculateInvoice(invoice);
    expect(
      [result.cgst, result.sgst, result.tds, result.preNet, result.roundOff, result.net].map((v) =>
        v.toFixed(2),
      ),
    ).toEqual(['1660.95', '1660.95', '369.10', '20607.80', '0.20', '20608.00']);
  });
  it('rejects mixed GST and edits below receipts', () => {
    expect(() => calculateInvoice({ ...invoice, igstPct: '18' })).toThrow();
    expect(() => validateInvoiceEdit({ ...invoice, receipts: '20609' })).toThrow();
  });
  it('derives statuses from receipts', () => {
    expect(
      ['0', '1', '20608', '20609'].map(
        (receipts) => calculateInvoice({ ...invoice, receipts }).status,
      ),
    ).toEqual(['Open', 'Partially Paid', 'Closed', 'Overpaid']);
  });
});
describe('receipt allocation', () => {
  it('rejects invalid precision, nonfinite amounts and duplicate invoice selections', () => {
    for (const amount of ['1.001', '-1', 'NaN', 'Infinity', '1e2']) {
      expect(() =>
        validateAllocations('100', '0', [{ invoiceId: 'a', amount }], { a: '100' }),
      ).toThrow();
    }
    expect(() =>
      validateAllocations(
        '100',
        '0',
        [
          { invoiceId: 'a', amount: '1' },
          { invoiceId: 'a', amount: '1' },
        ],
        { a: '100' },
      ),
    ).toThrow();
    expect(
      validateAllocations(
        '100',
        '10',
        [
          { invoiceId: 'a', amount: '30.25' },
          { invoiceId: 'b', amount: '40.50' },
        ],
        { a: '50', b: '50' },
      ).toFixed(2),
    ).toBe('19.25');
  });
  it('validates credit and invoice limits', () => {
    expect(
      validateAllocations('100', '10', [{ invoiceId: 'a', amount: '70' }], { a: '80' }).toFixed(2),
    ).toBe('20.00');
    expect(() =>
      validateAllocations('100', '30', [{ invoiceId: 'a', amount: '80' }], { a: '80' }),
    ).toThrow();
    expect(() =>
      validateAllocations('100', '0', [{ invoiceId: 'a', amount: '81' }], { a: '80' }),
    ).toThrow();
  });
  it('plans credits in date order and caps at outstanding', () => {
    expect(
      planBulkAllocations(
        [
          { id: 'b', date: '2026-11-02', unassigned: '80' },
          { id: 'a', date: '2026-11-01', unassigned: '40' },
        ],
        '100',
      ),
    ).toEqual([
      { id: 'a', amount: '40.00' },
      { id: 'b', amount: '60.00' },
    ]);
  });
});
