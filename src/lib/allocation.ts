import Decimal from 'decimal.js';

export type Allocation = { invoiceId: string; amount: string };
export function validateAllocations(
  credit: string,
  otherIncome: string,
  allocations: Allocation[],
  available: Record<string, string>,
) {
  const currency = /^\d{1,12}(\.\d{1,2})?$/;
  if (!currency.test(otherIncome) || allocations.some((a) => !currency.test(a.amount))) {
    throw new Error('Enter non-negative currency amounts with at most two decimal places');
  }
  const other = new Decimal(otherIncome);
  if (!other.isFinite() || other.isNegative()) throw new Error('Other income must be non-negative');
  let total = other;
  const seen = new Set<string>();
  for (const allocation of allocations) {
    const amount = new Decimal(allocation.amount);
    if (
      seen.has(allocation.invoiceId) ||
      !amount.isFinite() ||
      amount.isNegative() ||
      !available[allocation.invoiceId] ||
      amount.gt(available[allocation.invoiceId])
    )
      throw new Error('Invalid invoice allocation');
    seen.add(allocation.invoiceId);
    total = total.plus(amount);
  }
  if (total.gt(credit)) throw new Error('Classification exceeds credit');
  return new Decimal(credit).minus(total);
}
export function planBulkAllocations(
  credits: { id: string; date: string; unassigned: string }[],
  outstanding: string,
) {
  let remaining = new Decimal(outstanding);
  return [...credits]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .flatMap((credit) => {
      const amount = Decimal.min(remaining, new Decimal(credit.unassigned));
      if (amount.lte(0)) return [];
      remaining = remaining.minus(amount);
      return [{ id: credit.id, amount: amount.toFixed(2) }];
    });
}
