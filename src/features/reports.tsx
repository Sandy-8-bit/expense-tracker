'use client';
import { PageHeader } from '../components/ui/page-header';
import { Select } from '../components/ui/select';
import { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { buildReport, reportCSV, ReportData, ReportRecord } from '../lib/reports';
import { DateRangeFilter } from '../components/ui/finance';
import { toast } from 'sonner';
import { downloadBlob } from '../lib/download';
export function Reports({ client, org }: { client: SupabaseClient; org: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState('monthly');
  const [pdfBusy, setPDFBusy] = useState(false);
  const [filters, setFilters] = useState({
    from: today.slice(0, 8) + '01',
    to: today,
    company: '',
    category: '',
  });
  const data = useQuery({
    queryKey: ['reports', org],
    queryFn: async () => {
      const tables = {
        invoices: 'invoice_financials',
        transactions: 'transaction_financials',
        allocations: 'receipt_allocations',
        expenses: 'manual_expenses',
        companies: 'companies',
        categories: 'categories',
        lines: 'invoice_lines',
      };
      const entries = await Promise.all(
        Object.entries(tables).map(async ([key, table]) => {
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
          return [key, rows];
        }),
      );
      return Object.fromEntries(entries) as ReportData;
    },
  });
  const report = data.data ? buildReport(type, data.data, filters) : null;
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([reportCSV(type, filters, report)], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `ClearLedger_${type}_${filters.from}_${filters.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function downloadXLSX() {
    if (!report) return;
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('ClearLedger');
    sheet.addRows([
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
    ]);
    sheet.getRow(8).font = { bold: true };
    sheet.columns.forEach((column) => {
      column.width = 24;
    });
    sheet.views = [{ state: 'frozen', ySplit: 8 }];
    const bytes = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `ClearLedger_${type}_${filters.from}_${filters.to}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="card">
      <PageHeader>
        <h2>Financial reports</h2>
        <div className="actions">
          <button onClick={download} disabled={!report}>
            Export filtered CSV
          </button>
          <button
            className="secondary"
            disabled={!report || pdfBusy}
            onClick={async () => {
              if (!report) return;
              setPDFBusy(true);
              try {
                const { createReportPDF, reportDocument } = await import('../lib/report-pdf');
                const company =
                  data.data?.companies.find((c) => c.id === filters.company)?.name ??
                  'All companies';
                const category =
                  data.data?.categories.find((c) => c.id === filters.category)?.name ??
                  'All categories';
                const blob = await createReportPDF(
                  reportDocument(
                    `${type} report`,
                    `${filters.from} to ${filters.to} · ${company} · ${category} · Amounts in INR`,
                    report,
                  ),
                );
                downloadBlob(blob, `ClearLedger_${type}_${filters.from}_${filters.to}.pdf`);
              } catch (error) {
                toast.error(`PDF download failed: ${(error as Error).message}`);
              } finally {
                setPDFBusy(false);
              }
            }}
          >
            {pdfBusy ? 'Generating PDF…' : 'Download PDF'}
          </button>
          <button
            className="secondary"
            onClick={() => void downloadXLSX().catch((error) => toast.error(error.message))}
            disabled={!report}
          >
            Export XLSX
          </button>
        </div>
      </PageHeader>
      <div className="actions">
        {[
          ['monthly', 'Monthly summary'],
          ['invoice', 'Invoice-wise'],
          ['company', 'Company-wise'],
          ['expense', 'Expense-wise'],
        ].map(([value, name]) => (
          <button
            className={type === value ? '' : 'secondary'}
            key={value}
            onClick={() => setType(value)}
          >
            {name}
          </button>
        ))}
      </div>
      <DateRangeFilter value={filters} onApply={(range) => setFilters({ ...filters, ...range })}>
        <div className="form-grid">
          <label>
            Company
            <Select
              value={filters.company}
              onChange={(e) => setFilters({ ...filters, company: e.target.value })}
            >
              <option value="">All companies</option>
              {data.data?.companies.map((c) => (
                <option value={String(c.id)} key={String(c.id)}>
                  {String(c.name)}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Expense category
            <Select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">All categories</option>
              {data.data?.categories
                .filter((c) => c.type === 'expense')
                .map((c) => (
                  <option value={String(c.id)} key={String(c.id)}>
                    {String(c.name)}
                  </option>
                ))}
            </Select>
          </label>
        </div>
      </DateRangeFilter>
      {data.isPending ? (
        <p>Loading report…</p>
      ) : data.error ? (
        <p role="alert">{data.error.message}</p>
      ) : (
        report && (
          <>
            <p className="summary">
              {type} report · {filters.from} to {filters.to} · Company:{' '}
              {String(data.data?.companies.find((c) => c.id === filters.company)?.name ?? 'All')} ·
              Category:{' '}
              {String(data.data?.categories.find((c) => c.id === filters.category)?.name ?? 'All')}{' '}
              · {report.rows.length} rows. {report.notes}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {report.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((v, j) => (
                        <td key={j}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!report.rows.length && <p className="empty">No records for the selected filters.</p>}
            </div>
            {report.deductions && (
              <>
                <h3>Deductions by category</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Amount (INR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.deductions.map(([name, amount]) => (
                      <tr key={name}>
                        <td>{name}</td>
                        <td>{amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )
      )}
    </section>
  );
}
