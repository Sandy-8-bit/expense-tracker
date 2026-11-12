import { expect, it } from 'vitest';
import { parseAmount, parseDate, parseStatement } from './statement-parser';

it('validates running balances in either statement order', () => {
  const header = ['Date', 'Narration', 'Amount', 'Balance'];
  const first = ['01/11/26', 'Credit', '100', '1100'];
  const second = ['02/11/26', 'Debit', '-50', '1050'];
  expect(parseStatement([header, first, second])).toHaveLength(2);
  expect(parseStatement([header, second, first])).toHaveLength(2);
  expect(() => parseStatement([header, first, ['02/11/26', 'Debit', '-50', '1040']])).toThrow(
    'do not reconcile',
  );
  expect(() => parseStatement([header, first, ['02/11/26', 'Debit', '-50', 'invalid']])).toThrow(
    'invalid running balance',
  );
});

it('detects headers after junk and parses debit markers', () => {
  expect(
    parseStatement([
      ['Bank statement'],
      ['Date', 'Narration', 'Amount', 'Dr/Cr'],
      ['03/11/26', 'Payment', '1,234.00', 'Dr'],
    ]),
  ).toEqual([{ date: '2026-11-03', description: 'Payment', amount: '-1234.00' }]);
  expect(parseAmount('(1,234.00)').toFixed(2)).toBe('-1234.00');
  expect(parseDate(1)).toBe('1899-12-31');
  expect(parseDate('31/02/2026')).toBeNull();
});
