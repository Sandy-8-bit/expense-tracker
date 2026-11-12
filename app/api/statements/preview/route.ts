import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { authenticatedClient } from '@/src/lib/supabase/request-client';
import { parseStatement } from '@/src/lib/statement-parser';

export async function POST(request: Request) {
  try {
    const client = await authenticatedClient(request);
    if (!client)
      return Response.json({ error: 'Sign in to preview a statement.' }, { status: 401 });
    const form = await request.formData();
    const file = form.get('file');
    const organization = form.get('organization_id');
    if (!(file instanceof File) || typeof organization !== 'string')
      return Response.json({ error: 'Choose a file and organisation.' }, { status: 400 });
    const { data: role } = await client.rpc('org_role', { org: organization });
    if (!role || !['owner', 'accountant'].includes(role))
      return Response.json({ error: 'Write access is required.' }, { status: 403 });
    if (file.size > 10 * 1024 * 1024)
      return Response.json({ error: 'Files must be 10 MB or smaller.' }, { status: 400 });
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx'].includes(extension ?? ''))
      return Response.json(
        { error: 'Re-save your statement as .xlsx or .csv. Legacy .xls is not supported.' },
        { status: 400 },
      );
    const allowedMime =
      extension === 'xlsx'
        ? [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/octet-stream',
            '',
          ]
        : ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', ''];
    if (!allowedMime.includes(file.type))
      return Response.json(
        { error: 'File type does not match the selected statement format.' },
        { status: 400 },
      );
    const workbook = new ExcelJS.Workbook();
    const buffer = Buffer.from(await file.arrayBuffer());
    if (extension === 'csv') await workbook.csv.read(Readable.from(buffer));
    else await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    if (!sheet) return Response.json({ error: 'The workbook has no worksheets.' }, { status: 400 });
    const rows: (string | number | Date | null)[][] = [];
    sheet.eachRow((row) => {
      const cells: (string | number | Date | null)[] = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        const value = cell.value;
        cells[column - 1] =
          value instanceof Date || typeof value === 'number' || typeof value === 'string'
            ? value
            : cell.text;
      });
      rows.push(cells);
    });
    const transactions = parseStatement(rows);
    return Response.json({ count: transactions.length, preview: transactions.slice(0, 15) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to preview this statement.' },
      { status: 400 },
    );
  }
}
