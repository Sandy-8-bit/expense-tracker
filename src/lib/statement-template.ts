import ExcelJS from 'exceljs';

export async function statementTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Statement');
  sheet.addRows([
    ['Date', 'Description', 'Debit', 'Credit'],
    [new Date('2026-01-01T00:00:00Z'), 'Fictional customer payment', 0, 1500],
    [new Date('2026-01-02T00:00:00Z'), 'Fictional office supplies', 250, 0],
  ]);
  sheet.getColumn(1).numFmt = 'yyyy-mm-dd';
  sheet.getColumn(1).width = 16;
  sheet.getColumn(2).width = 40;
  for (const column of [3, 4]) {
    sheet.getColumn(column).numFmt = '0.00';
    sheet.getColumn(column).width = 18;
  }
  sheet.getRow(1).font = { bold: true };
  workbook
    .addWorksheet('Instructions')
    .addRows([
      ['Replace the fictional examples with your transactions before importing.'],
      ['Required: Date, Description, and a nonzero Debit or Credit. Use positive amounts.'],
      ['Dates: Excel dates or YYYY-MM-DD. Amounts: INR with two decimals.'],
      ['Optional: Balance column, which must reconcile across every transaction.'],
      ['Keep the Statement sheet first. Select your bank account in ClearLedger.'],
    ]);
  return workbook.xlsx.writeBuffer();
}
