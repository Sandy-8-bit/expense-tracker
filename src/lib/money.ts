import Decimal from 'decimal.js';

export function formatINR(value: Decimal.Value) {
  const amount = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const [whole, fraction] = amount.abs().toFixed(2).split('.');
  const grouped =
    whole.length > 3
      ? `${whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${whole.slice(-3)}`
      : whole;
  return `${amount.isNegative() ? '-' : ''}₹${grouped}.${fraction}`;
}
