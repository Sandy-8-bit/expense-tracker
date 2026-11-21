'use client';
import { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Decimal from 'decimal.js';
import { formatINR } from '../lib/money';
import { ReportRecord, sum } from '../lib/reports';
import { DateRangeFilter, MoneyText, StatusPill, formatDate } from '../components/ui/finance';
import { InvoiceDetails } from './invoice-details';
import Link from 'next/link';
export function DashboardMetrics({ client, org }: { client: SupabaseClient; org: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [range, setRange] = useState({ from: today.slice(0, 8) + '01', to: today });
  const [detail, setDetail] = useState('');
  const [page, setPage] = useState(0);
  const data = useQuery({
    queryKey: ['dashboard', org],
    queryFn: async () => {
      const result = await Promise.all(
        ['transaction_financials', 'invoice_financials', 'receipt_allocations', 'companies'].map(
          async (table) => {
            const rows: ReportRecord[] = [];
            for (let offset = 0; ; offset += 500) {
              const { data, error } = await client
                .from(table)
                .select('*')
                .eq('organization_id', org)
                .order('id')
                .range(offset, offset + 499);
              if (error) throw error;
              rows.push(...data);
              if (data.length < 500) break;
            }
            return rows;
          },
        ),
      );
      return {
        transactions: result[0],
        invoices: result[1],
        allocations: result[2],
        companies: result[3],
      };
    },
  });
  if (data.isPending) return <section className="card">Loading finance overview…</section>;
  if (data.error)
    return (
      <section className="card" role="alert">
        {data.error.message}
      </section>
    );
  const inPeriod = (date: unknown) => String(date) >= range.from && String(date) <= range.to;
  const tx = data.data!.transactions.filter((t) => inPeriod(t.txn_date));
  const invoices = data.data!.invoices.filter((i) => inPeriod(i.invoice_date));
  const txIds = new Set(tx.map((t) => t.id));
  const metrics: [string, Decimal][] = [
    [
      'Total bank credits',
      sum(
        tx.filter((t) => new Decimal(String(t.amount)).gt(0)),
        'amount',
      ),
    ],
    [
      'Total bank debits',
      sum(
        tx.filter((t) => new Decimal(String(t.amount)).lt(0)),
        'amount',
      ).abs(),
    ],
    ['Net bank movement', sum(tx, 'amount')],
    [
      'Invoice receipts linked',
      sum(
        data.data!.allocations.filter((a) => txIds.has(a.transaction_id)),
        'amount',
      ),
    ],
  ];
  const performance = [
    ['Invoiced (net receivable)', 'net'],
    ['Received to date', 'receipts'],
    ['Still to collect', 'pending'],
    ['Spent on these invoices', 'expenses'],
    ['Cash left after expenses', 'cash_remaining'],
  ];
  const months = [...new Set(data.data!.transactions.map((t) => String(t.txn_date).slice(0, 7)))]
    .sort()
    .slice(-5)
    .reverse();
  return (
    <>
      <section className="card">
        <div className="section-heading">
          <h2>Financial overview</h2>
          <DateRangeFilter
            value={range}
            onApply={(value) => {
              setRange(value);
              setPage(0);
            }}
          />
        </div>
        <div className="metric-grid">
          {metrics.map(([name, value]) => (
            <div className="metric" key={name}>
              <span>{name}</span>
              <strong>{formatINR(value)}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="section-heading">
          <h2>Invoices issued in the selected period</h2>
          <Link href="/invoices">All invoices →</Link>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  'Invoice',
                  'Company',
                  'Date',
                  'Net bank receipt',
                  'Received',
                  'Pending',
                  'Status',
                ].map((title) => (
                  <th key={title}>{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...invoices]
                .sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)))
                .slice(page * 12, page * 12 + 12)
                .map((invoice) => (
                  <tr key={String(invoice.id)}>
                    <td>
                      <button className="text-button" onClick={() => setDetail(String(invoice.id))}>
                        {String(invoice.number)}
                      </button>
                    </td>
                    <td>
                      {String(
                        data.data!.companies.find((company) => company.id === invoice.company_id)
                          ?.name ?? '',
                      )}
                    </td>
                    <td>{formatDate(String(invoice.invoice_date))}</td>
                    {['net', 'receipts', 'pending'].map((field) => (
                      <td key={field}>
                        <MoneyText value={String(invoice[field])} />
                      </td>
                    ))}
                    <td>
                      <StatusPill status={String(invoice.status)} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!invoices.length && <p className="empty">No records for the selected filters.</p>}
        <div className="pagination">
          <span>{invoices.length} invoices</span>
          <div className="actions">
            <button disabled={!page} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <button disabled={(page + 1) * 12 >= invoices.length} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        </div>
      </section>
      {detail && (
        <InvoiceDetails
          client={client}
          org={org}
          id={detail}
          canWrite={false}
          onClose={() => setDetail('')}
        />
      )}
      <section className="card">
        <h2>Invoice performance</h2>
        <div className="metric-grid">
          {performance.map(([name, field]) => (
            <div className="metric" key={field}>
              <span>{name}</span>
              <strong style={{ color: sum(invoices, field).lt(0) ? '#cf3447' : undefined }}>
                {formatINR(sum(invoices, field))}
              </strong>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Five-month bank overview</h2>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Credits</th>
              <th>Debits</th>
              <th>Transactions</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => {
              const rows = data.data!.transactions.filter((t) =>
                String(t.txn_date).startsWith(month),
              );
              return (
                <tr key={month}>
                  <td>{month}</td>
                  <td>
                    {formatINR(
                      sum(
                        rows.filter((t) => new Decimal(String(t.amount)).gt(0)),
                        'amount',
                      ),
                    )}
                  </td>
                  <td>
                    {formatINR(
                      sum(
                        rows.filter((t) => new Decimal(String(t.amount)).lt(0)),
                        'amount',
                      ).abs(),
                    )}
                  </td>
                  <td>{rows.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!months.length && <p className="empty">No records for the selected filters.</p>}
      </section>
    </>
  );
}
