import Decimal from 'decimal.js';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });
export type MoneyInput = string | Decimal;
export interface InvoiceInput {
  taxable: MoneyInput;
  cgstPct: MoneyInput;
  sgstPct: MoneyInput;
  igstPct: MoneyInput;
  tdsPct: MoneyInput;
  additions?: MoneyInput[];
  deductions?: MoneyInput[];
  receipts?: MoneyInput;
}
const money = (value: Decimal.Value) => new Decimal(value).toDecimalPlaces(2);
export function calculateInvoice(input: InvoiceInput) {
  const values = [
    input.taxable,
    input.cgstPct,
    input.sgstPct,
    input.igstPct,
    input.tdsPct,
    ...(input.additions ?? []),
    ...(input.deductions ?? []),
    input.receipts ?? '0',
  ].map((v) => new Decimal(v));
  if (values.some((value) => !value.isFinite() || value.isNegative()))
    throw new Error('Amounts and percentages must be non-negative');
  const [taxable, cgstPct, sgstPct, igstPct, tdsPct] = values;
  if (igstPct.gt(0) && (cgstPct.gt(0) || sgstPct.gt(0)))
    throw new Error('IGST cannot be combined with CGST or SGST');
  const tax = (pct: Decimal) => money(taxable.mul(pct).div(100));
  const cgst = tax(cgstPct),
    sgst = tax(sgstPct),
    igst = tax(igstPct),
    tds = tax(tdsPct);
  const sum = (items: MoneyInput[]) =>
    items.reduce<Decimal>((total, item) => total.plus(item), new Decimal(0));
  const additions = sum(input.additions ?? []),
    deductions = sum(input.deductions ?? []);
  const preNet = taxable
    .plus(cgst)
    .plus(sgst)
    .plus(igst)
    .plus(additions)
    .minus(deductions)
    .minus(tds);
  if (preNet.isNegative()) throw new Error('Net receivable cannot be negative');
  const roundOff = preNet.toDecimalPlaces(0).minus(preNet);
  const net = preNet.plus(roundOff);
  const receipts = new Decimal(input.receipts ?? 0);
  const outstanding = net.minus(receipts);
  const status = outstanding.lt('-0.009')
    ? 'Overpaid'
    : outstanding.lte('0.009')
      ? 'Closed'
      : receipts.gt(0)
        ? 'Partially Paid'
        : 'Open';
  return {
    taxable,
    cgst,
    sgst,
    igst,
    tds,
    additions,
    deductions,
    preNet,
    roundOff,
    gross: net.plus(tds),
    net,
    receipts,
    outstanding,
    pending: Decimal.max(0, outstanding),
    status,
  };
}
export function validateInvoiceEdit(input: InvoiceInput) {
  const result = calculateInvoice(input);
  if (result.net.lt(result.receipts))
    throw new Error('Net receivable cannot be lower than linked receipts');
  return result;
}
