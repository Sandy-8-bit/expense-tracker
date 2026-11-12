import { z } from 'zod';
import { calculateInvoice } from './invoice-calc';
const amount = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter a non-negative amount with at most two decimals.');
const percentage = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Enter a non-negative percentage.');
const date = z.iso.date();
export const invoiceSchema = z
  .object({
    id: z.uuid().optional(),
    number: z.string().trim().min(1),
    company_id: z.uuid(),
    invoice_date: date,
    due_date: date,
    description: z.string().max(5000).default(''),
    taxable_value: amount,
    cgst_pct: percentage,
    sgst_pct: percentage,
    igst_pct: percentage.default('0'),
    tds_pct: percentage,
    lines: z
      .array(z.object({ kind: z.enum(['addition', 'deduction']), category_id: z.uuid(), amount }))
      .max(100),
  })
  .superRefine((invoice, ctx) => {
    if (!invoice.id && Number(invoice.igst_pct) !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['igst_pct'],
        message: 'New invoices use CGST and SGST.',
      });
    }
    try {
      calculateInvoice({
        taxable: invoice.taxable_value,
        cgstPct: invoice.cgst_pct,
        sgstPct: invoice.sgst_pct,
        igstPct: invoice.igst_pct,
        tdsPct: invoice.tds_pct,
        additions: invoice.lines.filter((l) => l.kind === 'addition').map((l) => l.amount),
        deductions: invoice.lines.filter((l) => l.kind === 'deduction').map((l) => l.amount),
      });
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: (e as Error).message });
    }
  });
export const organizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  invoice_prefix: z.string().trim().min(1).max(30),
  payment_terms: z.number().int().min(0).max(365),
});
