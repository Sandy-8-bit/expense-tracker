'use client';
import { PageHeader } from '../components/ui/page-header';
import { Select } from '../components/ui/select';
import { FilterPanel } from '../components/ui/finance';
import { SupabaseClient } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  RowSelectionState,
} from '@tanstack/react-table';
import * as Dialog from '@radix-ui/react-dialog';
import Decimal from 'decimal.js';
import { toast } from 'sonner';
import { ClassifyDialog } from './classify-dialog';
import { formatINR } from '../lib/money';
import { planBulkAllocations } from '../lib/allocation';
import { formatDate } from '../components/ui/finance';
import { MatchMetrics } from './match-metrics';
type Tx = Parameters<typeof ClassifyDialog>[0]['transaction'] & {
  source: string;
  unassigned: string;
  bank_account_id: string;
  bank_category_id: string | null;
};
export function Transactions({
  client,
  org,
  canWrite,
  queue = false,
  debitsOnly = false,
}: {
  client: SupabaseClient;
  org: string;
  canWrite: boolean;
  queue?: boolean;
  debitsOnly?: boolean;
}) {
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    bank: '',
    type: queue ? 'review-credit' : debitsOnly ? 'debit' : 'all',
    search: '',
    category: '',
  });
  const [deleting, setDeleting] = useState<Tx | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [page, setPage] = useState(0),
    [size, setSize] = useState(25),
    [selection, setSelection] = useState<RowSelectionState>({}),
    [transaction, setTransaction] = useState<Tx | null>(null),
    [bulk, setBulk] = useState(''),
    [category, setCategory] = useState(''),
    [invoice, setInvoice] = useState(''),
    [link, setLink] = useState(false),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [requestId, setRequestId] = useState('');
  const cache = useQueryClient();
  const selectedRows = useQuery({
    queryKey: ['selected-transactions', org, selection, bulk],
    enabled: !!bulk,
    queryFn: async () => {
      const selected = Object.keys(selection).filter((id) => selection[id]);
      const rows: Tx[] = [];
      for (let offset = 0; offset < selected.length; offset += 100) {
        const { data, error } = await client
          .from('transaction_financials')
          .select('*')
          .eq('organization_id', org)
          .in('id', selected.slice(offset, offset + 100));
        if (error) throw error;
        rows.push(...data);
      }
      return rows;
    },
  });
  const masters = useQuery({
    queryKey: ['transaction-masters', org],
    queryFn: async () => {
      const [banks, categories, invoices] = await Promise.all([
        client.from('bank_accounts').select('id,name').eq('organization_id', org),
        client.from('categories').select('id,name,type,is_active').eq('organization_id', org),
        client
          .from('invoice_financials')
          .select('id,number,pending')
          .eq('organization_id', org)
          .order('invoice_date', { ascending: false }),
      ]);
      for (const r of [banks, categories, invoices]) if (r.error) throw r.error;
      return { banks: banks.data!, categories: categories.data!, invoices: invoices.data! };
    },
  });
  function filtered() {
    let q = client
      .from('transaction_financials')
      .select('*', { count: 'exact' })
      .eq('organization_id', org);
    if (filters.from) q = q.gte('txn_date', filters.from);
    if (filters.to) q = q.lte('txn_date', filters.to);
    if (filters.bank) q = q.eq('bank_account_id', filters.bank);
    if (filters.type === 'credit') q = q.gt('amount', 0);
    if (filters.type === 'debit') q = q.lt('amount', 0);
    if (filters.type === 'review-credit') q = q.gt('amount', 0).gt('unassigned', 0);
    if (filters.type === 'review')
      q = q.or('and(amount.gt.0,unassigned.gt.0),and(amount.lt.0,expense_category_id.is.null)');
    if (filters.category === 'none')
      q = q.is('expense_category_id', null).is('bank_category_id', null);
    else if (filters.category)
      q = q.or(
        `expense_category_id.eq.${filters.category},bank_category_id.eq.${filters.category}`,
      );
    if (filters.search) {
      const search = filters.search.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(search)) q = q.eq('txn_date', search);
      else if (/^-?\d+(\.\d{1,2})?$/.test(search)) q = q.eq('amount', search);
      else q = q.ilike('description', `%${search}%`);
    }
    return q;
  }
  const data = useQuery({
    queryKey: ['records', 'transactions', org, filters, page, size],
    queryFn: async () => {
      const { data, error, count } = await filtered()
        .order('txn_date', { ascending: false })
        .order('id')
        .range(page * size, page * size + size - 1);
      if (error) throw error;
      return { rows: data as Tx[], count: count ?? 0 };
    },
  });
  const ids = Object.keys(selection).filter((id) => selection[id]);
  const columns: ColumnDef<Tx>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Select page"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.original.description}`}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    },
    {
      accessorKey: 'txn_date',
      header: 'Date',
      cell: ({ row }) => formatDate(row.original.txn_date),
    },
    {
      id: 'bank',
      header: 'Bank',
      cell: ({ row }) =>
        masters.data?.banks.find((b) => b.id === row.original.bank_account_id)?.name ?? '',
    },
    { accessorKey: 'description', header: 'Narration' },
    {
      id: 'debit',
      header: 'Debit',
      cell: ({ row }) =>
        new Decimal(row.original.amount).lt(0)
          ? formatINR(new Decimal(row.original.amount).abs())
          : '—',
    },
    {
      id: 'credit',
      header: 'Credit',
      cell: ({ row }) =>
        new Decimal(row.original.amount).gt(0) ? formatINR(row.original.amount) : '—',
    },
    {
      id: 'category',
      header: 'Category',
      cell: ({ row }) =>
        masters.data?.categories.find(
          (c) => c.id === (row.original.expense_category_id || row.original.bank_category_id),
        )?.name ?? 'Unclassified',
    },
    {
      id: 'action',
      header: 'Action',
      cell: ({ row }) =>
        canWrite ? (
          <div className="actions">
            <button className="text-button" onClick={() => setTransaction(row.original)}>
              {new Decimal(row.original.amount).lt(0) ? 'Category + invoice →' : 'Link / classify'}
            </button>
            {row.original.source === 'imported' && (
              <button className="text-button" onClick={() => setDeleting(row.original)}>
                Delete
              </button>
            )}
          </div>
        ) : null,
    },
  ];
  // TanStack owns its mutable table state; React Compiler must leave this hook unmemoized.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data.data?.rows ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    state: { rowSelection: selection },
    onRowSelectionChange: setSelection,
    manualPagination: true,
  });
  async function selectFiltered() {
    setBusy(true);
    try {
      const all = { ...selection };
      for (let start = 0; ; start += 500) {
        const { data, error } = await filtered()
          .order('id')
          .range(start, start + 499);
        if (error) throw error;
        for (const row of data) all[row.id] = true;
        if (data.length < 500) break;
      }
      setSelection(all);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function applyBulk() {
    setBusy(true);
    try {
      const result =
        bulk === 'link'
          ? await client.rpc('bulk_link', {
              p_org: org,
              p_ids: ids,
              p_invoice: invoice,
              p_request: requestId,
            })
          : await client.rpc('bulk_categorize', {
              p_org: org,
              p_ids: ids,
              p_category: category,
              p_invoice: invoice || null,
              p_link: link,
            });
      if (result.error) throw result.error;
      toast.success(
        bulk === 'link'
          ? `${result.data.linked} linked; ${result.data.skipped} skipped.`
          : `${result.data} updated; transactions preserved.`,
      );
      setBulk('');
      setReview(false);
      await cache.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedCredits = (selectedRows.data ?? []).filter((row) => new Decimal(row.amount).gt(0));
  const selectedDebits = (selectedRows.data ?? []).filter((row) => new Decimal(row.amount).lt(0));
  const replaced = selectedDebits.filter(
    (row) => row.expense_invoice_id && row.expense_invoice_id !== (invoice || null),
  ).length;
  const plan = planBulkAllocations(
    selectedCredits.map((row) => ({ id: row.id, date: row.txn_date, unassigned: row.unassigned })),
    String(masters.data?.invoices.find((i) => i.id === invoice)?.pending ?? '0'),
  );
  return (
    <section className="card">
      {queue && <MatchMetrics client={client} org={org} />}
      <FilterPanel
        renderHeader={(toggle) => (
          <PageHeader>
            <div>
              <h2>
                {queue
                  ? 'Credits awaiting classification'
                  : debitsOnly
                    ? 'Bank expenses'
                    : 'Bank transactions'}
              </h2>
            </div>
            <div className="actions">
              <span className="pill">
                {data.data?.count ?? 0} matching · {ids.length} selected
              </span>
              {toggle}
            </div>
          </PageHeader>
        )}
      >
        <div className="form-grid">
          <label>
            From
            <input
              type="date"
              value={filters.from}
              onChange={(e) => {
                setPage(0);
                setFilters({ ...filters, from: e.target.value });
              }}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={filters.to}
              onChange={(e) => {
                setPage(0);
                setFilters({ ...filters, to: e.target.value });
              }}
            />
          </label>
          <label>
            Bank
            <Select
              value={filters.bank}
              onChange={(e) => {
                setPage(0);
                setFilters({ ...filters, bank: e.target.value });
              }}
            >
              <option value="">All banks</option>
              {masters.data?.banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Type
            <Select
              value={filters.type}
              onChange={(e) => {
                setPage(0);
                setFilters({ ...filters, type: e.target.value });
              }}
            >
              {[
                ['all', 'All'],
                ['credit', 'Credit'],
                ['debit', 'Debit'],
                ['review', 'Needs classification'],
                ['review-credit', 'Unassigned credits'],
              ].map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Category
            <Select
              value={filters.category}
              onChange={(e) => {
                setPage(0);
                setFilters({ ...filters, category: e.target.value });
              }}
            >
              <option value="">All categories</option>
              <option value="none">Uncategorized</option>
              {masters.data?.categories
                .filter((c) => ['expense', 'bank'].includes(c.type))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </label>
        </div>
        <label>
          Search narration, ISO date or amount
          <input
            value={filters.search}
            onChange={(e) => {
              setPage(0);
              setFilters({ ...filters, search: e.target.value });
            }}
          />
        </label>
      </FilterPanel>
      <div className="actions">
        <button className="secondary" disabled={busy} onClick={() => void selectFiltered()}>
          Select filtered results
        </button>
        <button className="secondary" onClick={() => setSelection({})}>
          Clear selection
        </button>
        {canWrite && (
          <>
            <button
              disabled={!ids.length}
              onClick={() => {
                setBulk('category');
                setReview(false);
              }}
            >
              Bulk assign category
            </button>
            <button
              disabled={!ids.length}
              onClick={() => {
                setBulk('link');
                setRequestId(crypto.randomUUID());
                setReview(false);
              }}
            >
              Bulk link to invoice
            </button>
          </>
        )}
      </div>
      {data.error ? (
        <p role="alert">{data.error.message}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th key={header.id}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!data.isPending && !data.data?.rows.length && (
            <p className="empty">No records for the selected filters.</p>
          )}
        </div>
      )}
      <div className="pagination">
        <span>
          {data.data?.count ? page * size + 1 : 0}–
          {Math.min((page + 1) * size, data.data?.count ?? 0)} of {data.data?.count ?? 0} · Page{' '}
          {page + 1} of {Math.max(1, Math.ceil((data.data?.count ?? 0) / size))}
        </span>
        <div className="actions">
          <Select
            aria-label="Rows per page"
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(0);
            }}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </Select>
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <button
            disabled={(page + 1) * size >= (data.data?.count ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
      {transaction && (
        <ClassifyDialog
          client={client}
          org={org}
          transaction={transaction}
          onClose={() => setTransaction(null)}
        />
      )}
      <Dialog.Root
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>Delete this imported transaction?</Dialog.Title>
            <Dialog.Description>
              {deleting &&
                `${formatDate(deleting.txn_date)} · ${deleting.description} · ${formatINR(deleting.amount)}`}{' '}
              Only this row will be deleted. Other rows and the original statement file remain.
              Classified or linked rows must be unlinked first. The deletion is recorded in the
              audit log.
            </Dialog.Description>
            <div className="actions">
              <button
                disabled={deleteBusy}
                onClick={async () => {
                  if (!deleting || deleteBusy) return;
                  setDeleteBusy(true);
                  try {
                    const { error } = await client.rpc('delete_imported_transaction', {
                      p_org: org,
                      p_transaction: deleting.id,
                    });
                    if (error) throw error;
                    setSelection((current) => {
                      const next = { ...current };
                      delete next[deleting.id];
                      return next;
                    });
                    setDeleting(null);
                    setPage(0);
                    await cache.invalidateQueries();
                    toast.success('Transaction deleted');
                  } catch (error) {
                    toast.error((error as Error).message);
                  } finally {
                    setDeleteBusy(false);
                  }
                }}
              >
                {deleteBusy ? 'Deleting…' : 'Delete transaction'}
              </button>
              <Dialog.Close asChild>
                <button className="secondary" disabled={deleteBusy}>
                  Cancel
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={!!bulk}
        onOpenChange={(open) => {
          if (!open) setBulk('');
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>
              {bulk === 'link' ? 'Bulk link credits' : 'Bulk assign category'}
            </Dialog.Title>
            <Dialog.Description>
              {ids.length} selected: {selectedCredits.length} credits, {selectedDebits.length}{' '}
              debits. Bank transactions will never be duplicated.
            </Dialog.Description>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (review) void applyBulk();
                else setReview(true);
              }}
            >
              <div className="form-grid">
                {bulk === 'category' && (
                  <label>
                    Category
                    <Select
                      required
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        setReview(false);
                      }}
                    >
                      <option value="">Choose category</option>
                      {masters.data?.categories
                        .filter((c) => c.is_active && ['bank', 'expense'].includes(c.type))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.type}: {c.name}
                          </option>
                        ))}
                    </Select>
                  </label>
                )}
                <label>
                  Invoice
                  <Select
                    required={bulk === 'link'}
                    value={invoice}
                    onChange={(e) => {
                      setInvoice(e.target.value);
                      setReview(false);
                    }}
                  >
                    <option value="">Do not link</option>
                    {masters.data?.invoices
                      .filter((i) => bulk !== 'link' || new Decimal(i.pending).gt(0))
                      .map((i) => (
                        <option value={i.id} key={i.id}>
                          {i.number} · {formatINR(i.pending)} outstanding
                        </option>
                      ))}
                  </Select>
                </label>
                {bulk === 'category' && (
                  <label>
                    <input
                      type="checkbox"
                      checked={link}
                      onChange={(e) => {
                        setLink(e.target.checked);
                        setReview(false);
                      }}
                    />
                    Replace invoice links on selected debits
                  </label>
                )}
              </div>
              {review && (
                <section className="summary">
                  <p>
                    {bulk === 'link'
                      ? 'Credits are allocated in date order, capped at the invoice balance. Excess remains unassigned. Debits are skipped.'
                      : link
                        ? `${replaced} existing invoice links on selected debits will be replaced.`
                        : 'Only transactions matching the category type will be updated; invoice links remain unchanged.'}
                  </p>
                  {bulk === 'link' && (
                    <>
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Narration</th>
                            <th>Allocate</th>
                            <th>Remainder</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.map((allocation) => {
                            const row = selectedCredits.find((item) => item.id === allocation.id)!;
                            return (
                              <tr key={row.id}>
                                <td>{formatDate(row.txn_date)}</td>
                                <td>{row.description}</td>
                                <td>{formatINR(allocation.amount)}</td>
                                <td>
                                  {formatINR(new Decimal(row.unassigned).minus(allocation.amount))}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p>
                        {plan.length} credits to link; {ids.length - plan.length} transactions
                        skipped.
                      </p>
                    </>
                  )}
                </section>
              )}
              {selectedRows.error && <p role="alert">{selectedRows.error.message}</p>}
              <div className="actions">
                <button
                  disabled={
                    busy ||
                    selectedRows.isPending ||
                    !!selectedRows.error ||
                    (bulk === 'link' && review && !plan.length)
                  }
                >
                  {busy ? 'Saving…' : review ? 'Confirm changes' : 'Review changes'}
                </button>
                <Dialog.Close asChild>
                  <button className="secondary" type="button">
                    Cancel
                  </button>
                </Dialog.Close>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
