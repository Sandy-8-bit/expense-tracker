import { expect, test } from 'vitest';
import { createReportPDF, reportDocument } from '../src/lib/report-pdf';
import { PDFParse } from 'pdf-parse';
import { writeFileSync } from 'node:fs';

test('report export generates a real multi-page PDF with selected content', async () => {
  const document = reportDocument('Invoice report', 'Example company · Amounts in INR', {
    headers: ['Invoice', 'Net'],
    rows: Array.from({ length: 100 }, (_, i) => [`INV-${i}`, '₹1,000.00']),
    notes: 'Selected period',
  });
  expect(JSON.stringify(document)).toContain('INV-99');
  const blob = await createReportPDF(document);
  expect(blob.type).toBe('application/pdf');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(5000);
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    expect(result.total).toBeGreaterThan(1);
    expect(result.text).toContain('Example company');
    expect(result.text).toContain('INV-99');
    expect(result.text).toContain('₹1,000.00');
    if (process.env.CLEARLEDGER_PDF_PREVIEW) {
      const rendered = await parser.getScreenshot({ partial: [1], scale: 1.5 });
      writeFileSync(process.env.CLEARLEDGER_PDF_PREVIEW, rendered.pages[0].data);
      console.info('PDF preview:', process.env.CLEARLEDGER_PDF_PREVIEW);
    }
  } finally {
    await parser.destroy();
  }
}, 30000);
