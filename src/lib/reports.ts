import Decimal from 'decimal.js';
export type ReportRecord = Record<string, string | number | boolean | null>;
export type ReportData = {
  invoices: ReportRecord[];
  transactions: ReportRecord[];
  allocations: ReportRecord[];
  expenses: ReportRecord[];
  companies: ReportRecord[];
  categories: ReportRecord[];
  lines?: ReportRecord[];
};
export type ReportFilters = { from: string; to: string; company: string; category: string };
export const sum = (rows: ReportRecord[], field: string) =>
  rows.reduce((total, row) => total.plus(String(row[field] ?? 0)), new Decimal(0));
export function buildReport(type: string, data: ReportData, filters: ReportFilters) {
  const period = (value: unknown) => String(value) >= filters.from && String(value) <= filters.to;
  const tx = data.transactions.filter((t) => period(t.txn_date));
  const credits = tx.filter((t) => new Decimal(String(t.amount)).gt(0));
  const debits = tx.filter((t) => new Decimal(String(t.amount)).lt(0));
  const invoices = data.invoices.filter(
    (i) => !filters.company || i.company_id === filters.company,
  );
  const company = (id: unknown) => String(data.companies.find((c) => c.id === id)?.name ?? '');
  const category = (id: unknown) =>
    String(data.categories.find((c) => c.id === id)?.name ?? 'Unclassified');
  const expenses = data.expenses.filter((e) => e.is_active !== false);
  const issued = invoices.filter((i) => period(i.invoice_date));
  const creditIds = new Set(credits.map((t) => t.id));
  const receipts = data.allocations.filter(
    (a) => creditIds.has(a.transaction_id) && invoices.some((i) => i.id === a.invoice_id),
  );
  const linkedExpenses = (id: unknown) => [
    ...data.transactions
      .filter((t) => t.expense_invoice_id === id && new Decimal(String(t.amount)).lt(0))
      .map((t) => ({
        ...t,
        amount: new Decimal(String(t.amount)).abs().toFixed(2),
        category_id: t.expense_category_id,
      })),
    ...expenses.filter((e) => e.invoice_id === id),
  ];
  if (type === 'invoice')
    return {
      headers: [
        'Invoice',
        'Company',
        'Date',
        'Taxable',
        'CGST',
        'SGST',
        'IGST',
        'Additions',
        'Deductions',
        'TDS',
        'Net receivable',
        'Receipts (all dates)',
        'Outstanding (all dates)',
        'Expenses (all dates)',
        'Net cash (all dates)',
        'Status',
        'Expenses by category',
      ],
      rows: invoices
        .filter(
          (i) =>
            (period(i.invoice_date) || receipts.some((a) => a.invoice_id === i.id)) &&
            (!filters.category ||
              linkedExpenses(i.id).some((e) => e.category_id === filters.category)),
        )
        .map((i) =>
          [
            i.number,
            company(i.company_id),
            i.invoice_date,
            ...[
              'taxable_value',
              'cgst',
              'sgst',
              'igst',
              'additions',
              'deductions',
              'tds',
              'net',
              'receipts',
              'outstanding',
              'expenses',
              'cash_remaining',
              'status',
            ].map((f) => i[f]),
            ...[
              [...new Set(linkedExpenses(i.id).map((e) => e.category_id))]
                .map(
                  (c) =>
                    `${category(c)}: ${sum(
                      linkedExpenses(i.id).filter((e) => e.category_id === c),
                      'amount',
                    ).toFixed(2)}`,
                )
                .join(' | '),
            ],
          ].map(String),
        ),
      notes:
        'Invoices issued or receiving payments in the period. Receipt, outstanding and expense columns are cumulative.',
    };
  if (type === 'company')
    return {
      headers: [
        'Company',
        'Invoices issued',
        'Net invoiced',
        'Bank receipts in period',
        'Outstanding (all dates)',
        'Invoice expenses (all dates)',
        'Net cash (all dates)',
      ],
      rows: data.companies
        .filter((c) => !filters.company || c.id === filters.company)
        .map((c) => {
          const all = invoices.filter((i) => i.company_id === c.id);
          const current = issued.filter((i) => i.company_id === c.id);
          return [
            String(c.name),
            String(current.length),
            sum(current, 'net').toFixed(2),
            sum(
              receipts.filter((a) => all.some((i) => i.id === a.invoice_id)),
              'amount',
            ).toFixed(2),
            sum(all, 'outstanding').toFixed(2),
            sum(all, 'expenses').toFixed(2),
            sum(all, 'cash_remaining').toFixed(2),
          ];
        }),
      notes:
        'Invoice counts and net invoiced use issue dates. Balances and expenses include all dates. Category filter does not change company balances.',
    };
  const expenseDebits = debits.filter(
    (t) =>
      (!filters.category || t.expense_category_id === filters.category) &&
      (!filters.company || invoices.some((i) => i.id === t.expense_invoice_id)),
  );
  const manual = expenses.filter(
    (e) =>
      period(e.expense_date) &&
      (!filters.category || e.category_id === filters.category) &&
      (!filters.company || invoices.some((i) => i.id === e.invoice_id)),
  );
  if (type === 'expense')
    return {
      headers: ['Expense category', 'Bank expenses', 'Manual expenses', 'Total'],
      rows: [
        ...data.categories.filter((c) => c.type === 'expense'),
        { id: null, name: 'Unclassified' },
      ]
        .filter((c) => !filters.category || c.id === filters.category)
        .map((c) => {
          const bank = sum(
            expenseDebits.filter((t) => t.expense_category_id === c.id),
            'amount',
          ).abs();
          const cash = sum(
            manual.filter((e) => e.category_id === c.id),
            'amount',
          );
          return [String(c.name), bank.toFixed(2), cash.toFixed(2), bank.plus(cash).toFixed(2)];
        }),
      notes: 'Each bank debit counts once. Company filters restrict expenses to linked invoices.',
    };
  const categorized = expenseDebits.filter((t) => t.expense_category_id);
  const linked = expenseDebits.filter((t) => t.expense_invoice_id);
  const metrics: [string, Decimal][] = [
    ['Total bank credits', sum(credits, 'amount')],
    ['Invoice receipts linked', sum(receipts, 'amount')],
    ['Other income classified', sum(credits, 'other_income_amount')],
    ['Unassigned bank credits', sum(credits, 'unassigned')],
    ['Total bank debits', sum(debits, 'amount').abs()],
    ['Categorized expenses (bank)', sum(categorized, 'amount').abs()],
    ['Manual expenses', sum(manual, 'amount')],
    ['Total categorized expenses', sum(categorized, 'amount').abs().plus(sum(manual, 'amount'))],
    [
      'Unclassified bank debits',
      sum(
        debits.filter((t) => !t.expense_category_id),
        'amount',
      ).abs(),
    ],
    ['Net bank movement', sum(tx, 'amount')],
    ...(
      ['taxable_value', 'cgst', 'sgst', 'igst', 'additions', 'deductions', 'tds', 'net'] as const
    ).map((f) => [f, sum(issued, f)] as [string, Decimal]),
    [
      'Invoice-linked expenses (memo only)',
      sum(linked, 'amount')
        .abs()
        .plus(
          sum(
            manual.filter((e) => e.invoice_id),
            'amount',
          ),
        ),
    ],
    ['Outstanding invoices (all dates)', sum(invoices, 'outstanding')],
  ];
  return {
    headers: ['Metric', 'Amount (INR)'],
    rows: metrics.map(([name, value]) => [name, value.toFixed(2)]),
    deductions: data.categories
      .filter((category) => category.type === 'deduction')
      .map((category) => [
        String(category.name),
        sum(
          (data.lines ?? []).filter(
            (line) =>
              line.kind === 'deduction' &&
              line.category_id === category.id &&
              issued.some((invoice) => invoice.id === line.invoice_id),
          ),
          'amount',
        ).toFixed(2),
      ]),
    notes:
      'Bank totals remain account-wide. Invoice-linked expenses are memo only and are not added twice.',
  };
}
export function reportCSV(
  type: string,
  filters: ReportFilters,
  report: ReturnType<typeof buildReport>,
) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const safe = (value: string) =>
    /^[=+@\t\r]/.test(value) || (/^\-/.test(value) && !/^\-\d+(\.\d+)?$/.test(value))
      ? `'${value}`
      : value;
  return (
    '\uFEFF' +
    [
      ['Report', type],
      ['From', filters.from],
      ['To', filters.to],
      ['Company', filters.company || 'All'],
      ['Category', filters.category || 'All'],
      ['Notes', report.notes],
      [],
      report.headers,
      ...report.rows,
      ...(report.deductions
        ? [[], ['Deductions by category', 'Amount (INR)'], ...report.deductions]
        : []),
    ]
      .map((row) => row.map((v) => escape(safe(v))).join(','))
      .join('\r\n')
  );
}
