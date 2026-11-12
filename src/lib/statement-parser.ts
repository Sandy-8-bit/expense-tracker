import Decimal from 'decimal.js';

type Cell = string | number | Date | null | undefined;
export type StatementRow = { date: string; description: string; amount: string };
const text = (cell: Cell) => String(cell ?? '').trim();
const header = (cell: Cell) => text(cell).toLowerCase().replace(/\s+/g, ' ');
export function parseAmount(value: Cell): Decimal {
  const raw = text(value).replace(/[₹,\s]/g, '');
  if (!raw) return new Decimal(0);
  const negative = /^\(.*\)$/.test(raw);
  const cleaned = negative ? raw.slice(1, -1) : raw;
  try {
    const result = new Decimal(cleaned);
    return result.isFinite() ? (negative ? result.negated() : result) : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}
export function parseDate(value: Cell): string | null {
  let year: number, month: number, day: number;
  if (value instanceof Date) {
    year = value.getUTCFullYear();
    month = value.getUTCMonth() + 1;
    day = value.getUTCDate();
  } else if (typeof value === 'number') {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    year = date.getUTCFullYear();
    month = date.getUTCMonth() + 1;
    day = date.getUTCDate();
  } else {
    const raw = text(value);
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
    const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(raw);
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
      day = Number(iso[3]);
    } else if (local) {
      day = Number(local[1]);
      month = Number(local[2]);
      year = Number(local[3]);
      if (year < 100) year += 2000;
    } else return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  )
    return null;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}
export function parseStatement(rows: Cell[][]): StatementRow[] {
  const dateNames = ['txn date', 'transaction date', 'date', 'posting date', 'value date'];
  const descNames = ['description', 'narration', 'particulars', 'remarks'];
  const index = rows.findIndex(
    (row) =>
      row.some((cell) => dateNames.includes(header(cell))) &&
      row.some((cell) => descNames.includes(header(cell))),
  );
  if (index < 0) throw new Error('Could not detect transaction header (Date and Description).');
  const columns = rows[index].map(header);
  const find = (...names: string[]) => columns.findIndex((column) => names.includes(column));
  const date = find(...dateNames),
    description = find(...descNames),
    debit = find('debit', 'withdrawal'),
    credit = find('credit', 'deposit'),
    amount = find('amount'),
    type = find('dr/cr', 'type');
  if (amount < 0 && debit < 0 && credit < 0) throw new Error('Could not detect amount columns.');
  const balanceIndex = find('balance', 'closing balance', 'running balance', 'available balance');
  const balances: { balance: Decimal; amount: Decimal }[] = [];
  const transactions = rows.slice(index + 1).flatMap((row) => {
    const parsedDate = parseDate(row[date]);
    const narration = text(row[description]);
    let parsedAmount =
      amount >= 0
        ? parseAmount(row[amount])
        : parseAmount(row[credit]).minus(parseAmount(row[debit]));
    if (amount >= 0 && /^(dr|debit)$/i.test(text(row[type])))
      parsedAmount = parsedAmount.abs().negated();
    if (!parsedDate || !narration || parsedAmount.isZero()) return [];
    if (balanceIndex >= 0) {
      const rawBalance = text(row[balanceIndex]).replace(/[₹,\s]/g, '');
      if (!/^[-+]?\d+(\.\d+)?$|^\(\d+(\.\d+)?\)$/.test(rawBalance))
        throw new Error(
          'A transaction has an invalid running balance. Check the statement before importing.',
        );
      balances.push({ balance: parseAmount(row[balanceIndex]), amount: parsedAmount });
    }
    return [{ date: parsedDate, description: narration, amount: parsedAmount.toFixed(2) }];
  });
  if (balances.length > 1) {
    const ascending = balances
      .slice(1)
      .every((row, i) => balances[i].balance.plus(row.amount).eq(row.balance));
    const descending = balances
      .slice(1)
      .every((row, i) => row.balance.plus(balances[i].amount).eq(balances[i].balance));
    if (!ascending && !descending)
      throw new Error(
        'Statement running balances do not reconcile with the transaction amounts. Check for missing rows or incorrect debit/credit columns.',
      );
  }
  return transactions;
}
