import { expect, test } from 'vitest';
import ExcelJS from 'exceljs';
import { statementTemplate } from '../src/lib/statement-template';
import { parseStatement } from '../src/lib/statement-parser';

test('downloaded Excel template roundtrips through statement parser', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await statementTemplate());
  const rows: (string | number | Date | null)[][] = [];
  workbook.worksheets[0].eachRow((row) => {
    rows.push((row.values as (string | number | Date | null)[]).slice(1));
  });
  expect(parseStatement(rows)).toEqual([
    { date: '2026-01-01', description: 'Fictional customer payment', amount: '1500.00' },
    { date: '2026-01-02', description: 'Fictional office supplies', amount: '-250.00' },
  ]);
});
