import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { parseStatement } from './statement-parser';
export async function parseWorkbook(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['csv', 'xlsx'].includes(ext ?? ''))
    throw new Error('Re-save this statement as .csv or .xlsx.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Files must be 10 MB or smaller.');
  const mime =
    ext === 'xlsx'
      ? [
          '',
          'application/octet-stream',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]
      : ['', 'text/plain', 'text/csv', 'application/csv', 'application/vnd.ms-excel'];
  if (!mime.includes(file.type)) throw new Error('Invalid file MIME type.');
  const workbook = new ExcelJS.Workbook();
  const bytes = Buffer.from(await file.arrayBuffer());
  if (ext === 'csv') await workbook.csv.read(Readable.from(bytes));
  else await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Workbook has no worksheets.');
  const rows: (string | number | Date | null)[][] = [];
  sheet.eachRow((row) => {
    const cells: (string | number | Date | null)[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      const v = cell.value;
      cells[column - 1] =
        v instanceof Date || typeof v === 'string' || typeof v === 'number' ? v : cell.text;
    });
    rows.push(cells);
  });
  return parseStatement(rows);
}
