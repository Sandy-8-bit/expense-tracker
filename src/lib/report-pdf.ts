import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

export function reportDocument(
  title: string,
  context: string,
  report: {
    headers: string[];
    rows: (string | number)[][];
    notes: string;
    deductions?: string[][];
  },
): TDocumentDefinitions {
  return {
    info: { title, author: 'ClearLedger' },
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 32, 28, 32],
    defaultStyle: { font: 'Roboto', fontSize: 8, color: '#0f1f2e' },
    footer: (page, total) => ({
      text: `ClearLedger · ${page} / ${total}`,
      alignment: 'center',
      fontSize: 8,
    }),
    content: [
      { text: 'ClearLedger', fontSize: 20, bold: true, color: '#087f6d', margin: [0, 0, 0, 8] },
      { text: title, fontSize: 14, bold: true },
      { text: context, margin: [0, 8, 0, 8] },
      { text: report.notes, margin: [0, 0, 0, 12] },
      {
        table: {
          headerRows: 1,
          widths: report.headers.map(() => '*'),
          body: [
            report.headers.map((text) => ({ text, bold: true, fillColor: '#e4f3ed' })),
            ...report.rows.map((row) => row.map(String)),
          ],
        },
        layout: 'lightHorizontalLines',
      },
      ...(report.rows.length
        ? []
        : [{ text: 'No records for the selected filters.', margin: [0, 12, 0, 0] } as Content]),
      ...(report.deductions?.length
        ? [
            { text: 'Deductions by category (INR)', bold: true, margin: [0, 16, 0, 8] } as Content,
            {
              table: {
                headerRows: 1,
                widths: ['*', '*'],
                body: [['Category', 'Amount (INR)'], ...report.deductions],
              },
              layout: 'lightHorizontalLines',
            },
          ]
        : []),
    ],
  };
}

export async function createReportPDF(document: TDocumentDefinitions) {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  pdfMake.addVirtualFileSystem(fonts);
  return pdfMake.createPdf(document).getBlob();
}
