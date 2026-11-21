'use client';
import { Fragment, useId, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { buildReport, type ReportData } from '../lib/reports';
import { formatINR } from '../lib/money';
import { formatDate, StatusPill } from '../components/ui/finance';

export function ReportTable({
  report,
  data,
  type,
}: {
  report: ReturnType<typeof buildReport>;
  data: ReportData;
  type: string;
}) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const id = useId();
  const columns = type === 'invoice' ? [0, 1, 2, 10, 11, 12, 15] : report.headers.map((_, i) => i);
  const rows = report.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.join(' ').toLowerCase().includes(search.toLowerCase()));
  const toggle = (index: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  const paymentsFor = (invoiceIds: string[]) => {
    const ids = new Set(invoiceIds);
    const transactions = new Map(
      data.transactions.map((transaction) => [transaction.id, transaction]),
    );
    const invoices = new Map(data.invoices.map((invoice) => [invoice.id, invoice]));
    return data.allocations
      .flatMap((allocation) => {
        const transaction = transactions.get(allocation.transaction_id);
        const invoice = invoices.get(allocation.invoice_id);
        return ids.has(String(allocation.invoice_id)) && transaction && invoice
          ? [{ allocation, transaction, invoice }]
          : [];
      })
      .sort((a, b) => String(a.transaction.txn_date).localeCompare(String(b.transaction.txn_date)));
  };
  const display = (value: string, header: string) => {
    if (header === 'Status') return <StatusPill status={value} />;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
    if (
      /^-?\d+(\.\d+)?$/.test(value) &&
      ![
        'Invoice',
        'Invoice number',
        'Invoices issued',
        'Company',
        'Expense category',
        'Metric',
        'Payment details',
        'Expenses by category',
      ].includes(header)
    )
      return <span className="money">{formatINR(value)}</span>;
    return value;
  };
  return (
    <>
      <div className="report-table-toolbar">
        <label className="report-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Search report rows"
            placeholder="Search this report…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span>
          {rows.length} {rows.length === 1 ? 'row' : 'rows'}
        </span>
        {expanded.size > 0 && (
          <button className="text-button" onClick={() => setExpanded(new Set())}>
            Collapse all
          </button>
        )}
      </div>
      <div className="table-scroll report-table">
        <table>
          <thead>
            <tr>
              <th aria-label="Expand payment details" />
              {columns.map((column) => (
                <th key={column}>{report.headers[column]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, index }) => {
              const invoiceIds = report.rowInvoiceIds?.[index] ?? [];
              const canExpand = invoiceIds.length > 0 || type === 'invoice';
              const open = expanded.has(index);
              const payments = open ? paymentsFor(invoiceIds) : [];
              return (
                <Fragment key={index}>
                  <tr
                    className={canExpand ? `report-expandable${open ? 'is-open' : ''}` : ''}
                    onClick={canExpand ? () => toggle(index) : undefined}
                  >
                    <td>
                      {canExpand && (
                        <button
                          className="report-expand-button"
                          aria-expanded={open}
                          aria-controls={`${id}-${index}`}
                          aria-label={`${open ? 'Hide' : 'Show'} payment details for ${row[0]}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggle(index);
                          }}
                        >
                          <ChevronDown size={17} aria-hidden="true" />
                        </button>
                      )}
                    </td>
                    {columns.map((column) => (
                      <td key={column}>{display(row[column], report.headers[column])}</td>
                    ))}
                  </tr>
                  {open && (
                    <tr id={`${id}-${index}`} className="report-detail-row">
                      <td colSpan={columns.length + 1}>
                        <div className="report-detail-content">
                          {type === 'invoice' && (
                            <dl className="report-breakdown">
                              {report.headers.map((header, column) =>
                                !columns.includes(column) &&
                                header !== 'Payment details (all dates)' &&
                                row[column] ? (
                                  <div key={header}>
                                    <dt>{header}</dt>
                                    <dd>{display(row[column], header)}</dd>
                                  </div>
                                ) : null,
                              )}
                            </dl>
                          )}
                          <div className="report-detail-heading">
                            <h3>Linked payments</h3>
                            <span className="pill">{payments.length} payments · All dates</span>
                          </div>
                          {payments.length ? (
                            <table className="report-payments">
                              <thead>
                                <tr>
                                  <th>Payment date</th>
                                  <th>Invoice</th>
                                  <th>Payment details</th>
                                  <th>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {payments.map(
                                  ({ allocation, transaction, invoice }, paymentIndex) => (
                                    <tr key={String(allocation.id ?? paymentIndex)}>
                                      <td>{formatDate(String(transaction.txn_date))}</td>
                                      <td>{String(invoice.number)}</td>
                                      <td>{String(transaction.description ?? '—')}</td>
                                      <td className="money">
                                        {formatINR(String(allocation.amount))}
                                      </td>
                                    </tr>
                                  ),
                                )}
                              </tbody>
                            </table>
                          ) : (
                            <p className="empty">No payments linked yet.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="empty">
          <p>{search ? 'No matching rows.' : 'No records in this period.'}</p>
          {search && (
            <button className="secondary" onClick={() => setSearch('')}>
              Clear search
            </button>
          )}
        </div>
      )}
      {!!report.deductions?.length && (
        <details className="report-deductions">
          <summary>Deductions by category</summary>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {report.deductions.map(([name, amount]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="money">{formatINR(amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}
