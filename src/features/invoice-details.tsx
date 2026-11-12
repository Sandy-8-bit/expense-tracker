'use client';
import { Select } from '../components/ui/select';
import { SupabaseClient } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { toast } from 'sonner';
import Decimal from 'decimal.js';
import { formatINR } from '../lib/money';
import { Attachments } from './attachments';
export function InvoiceDetails({
  client,
  org,
  id,
  canWrite,
  onClose,
}: {
  client: SupabaseClient;
  org: string;
  id: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState(''),
    [unlink, setUnlink] = useState<{ id: string; bank: boolean } | null>(null),
    [category, setCategory] = useState(''),
    [bank, setBank] = useState(''),
    [newCategory, setNewCategory] = useState(''),
    [busy, setBusy] = useState(false);
  const cache = useQueryClient();
  const data = useQuery({
    queryKey: ['invoice-details', org, id],
    queryFn: async () => {
      const [invoice, lines, receipts, debits, manual, categories] = await Promise.all([
        client
          .from('invoice_financials')
          .select('*')
          .eq('organization_id', org)
          .eq('id', id)
          .single(),
        client.from('invoice_lines').select('*').eq('organization_id', org).eq('invoice_id', id),
        client
          .from('receipt_allocations')
          .select('*')
          .eq('organization_id', org)
          .eq('invoice_id', id),
        client
          .from('bank_transactions')
          .select('*')
          .eq('organization_id', org)
          .lt('amount', 0)
          .or(`expense_invoice_id.eq.${id},expense_invoice_id.is.null`)
          .order('txn_date', { ascending: false }),
        client
          .from('manual_expenses')
          .select('*')
          .eq('organization_id', org)
          .eq('invoice_id', id)
          .eq('is_active', true),
        client.from('categories').select('*').eq('organization_id', org),
      ]);
      for (const r of [invoice, lines, receipts, debits, manual, categories])
        if (r.error) throw r.error;
      const receiptTx = receipts.data!.length
        ? await client
            .from('bank_transactions')
            .select('*')
            .in(
              'id',
              receipts.data!.map((a) => a.transaction_id),
            )
        : { data: [], error: null };
      if (receiptTx.error) throw receiptTx.error;
      return {
        invoice: invoice.data!,
        lines: lines.data!,
        receipts: receipts.data!,
        receiptTx: receiptTx.data!,
        debits: debits.data!,
        manual: manual.data!,
        categories: categories.data!,
      };
    },
  });
  async function refresh() {
    await cache.invalidateQueries({ queryKey: ['invoice-details', org, id] });
    await cache.invalidateQueries({ queryKey: ['records'] });
    await cache.invalidateQueries({ queryKey: ['dashboard'] });
    await cache.invalidateQueries({ queryKey: ['reports'] });
  }
  async function changeCategory(expenseId: string, isBank: boolean, value: string) {
    const { error } = await client
      .from(isBank ? 'bank_transactions' : 'manual_expenses')
      .update(isBank ? { expense_category_id: value } : { category_id: value })
      .eq('id', expenseId)
      .eq('organization_id', org);
    if (error) toast.error(error.message);
    else await refresh();
  }
  async function saveExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const values = new FormData(event.currentTarget);
    try {
      let error;
      if (mode === 'bank') {
        ({ error } = await client
          .from('bank_transactions')
          .update({ expense_invoice_id: id, expense_category_id: category })
          .eq('id', bank)
          .eq('organization_id', org));
      } else {
        ({ error } = await client.from('manual_expenses').insert({
          organization_id: org,
          invoice_id: id,
          expense_date: values.get('date'),
          description: values.get('description'),
          amount: values.get('amount'),
          payment_source: values.get('source'),
          category_id: category,
        }));
      }
      if (error) throw error;
      toast.success('Expense linked');
      setMode('');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const expenses = [
    ...(data.data?.debits
      .filter((t) => t.expense_invoice_id === id)
      .map((t) => ({
        id: t.id,
        date: t.txn_date,
        description: t.description,
        amount: new Decimal(t.amount).abs().toFixed(2),
        category: t.expense_category_id,
        source: 'Bank debit',
        bank: true,
      })) ?? []),
    ...(data.data?.manual.map((e) => ({
      id: e.id,
      date: e.expense_date,
      description: e.description,
      amount: e.amount,
      category: e.category_id,
      source: e.payment_source,
      bank: false,
    })) ?? []),
  ];
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" style={{ width: 'min(1000px,94vw)' }}>
          <Dialog.Title>Invoice {data.data?.invoice.number}</Dialog.Title>
          <Dialog.Description>
            Receipts determine collection status. Invoice expenses are separate from deductions and
            do not reduce receivables.
          </Dialog.Description>
          {data.error ? (
            <p role="alert">{data.error.message}</p>
          ) : data.isPending ? (
            <p>Loading invoice…</p>
          ) : (
            <>
              <div className="metric-grid">
                {[
                  ['Invoice sent', 'net'],
                  ['Bank received', 'receipts'],
                  ['Yet to collect', 'pending'],
                  ['Spent on invoice', 'expenses'],
                  ['Cash remaining', 'cash_remaining'],
                ].map(([label, key]) => (
                  <div className="metric" key={key}>
                    <span>{label}</span>
                    <strong>{formatINR(data.data!.invoice[key])}</strong>
                  </div>
                ))}
              </div>
              <span className="pill">{data.data!.invoice.status}</span>
              <p>
                {data.data!.invoice.description} · Issued {data.data!.invoice.invoice_date} · Due{' '}
                {data.data!.invoice.due_date}
              </p>
              <table>
                <tbody>
                  {[
                    'taxable_value',
                    'cgst',
                    'sgst',
                    'igst',
                    'additions',
                    'deductions',
                    'tds',
                    'round_off',
                    'net',
                    'receipts',
                    'outstanding',
                    'expenses',
                    'cash_remaining',
                  ].map((field) => (
                    <tr key={field}>
                      <td>{field.replaceAll('_', ' ')}</td>
                      <td>{formatINR(data.data!.invoice[field])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3>Additional amounts and deductions</h3>
              <table>
                <tbody>
                  {data.data!.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.kind}</td>
                      <td>{data.data!.categories.find((c) => c.id === line.category_id)?.name}</td>
                      <td>{formatINR(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3>Linked bank receipts</h3>
              <table>
                <tbody>
                  {data.data!.receipts.map((a) => {
                    const tx = data.data!.receiptTx.find((t) => t.id === a.transaction_id);
                    return (
                      <tr key={a.id}>
                        <td>{tx?.txn_date}</td>
                        <td>{tx?.description}</td>
                        <td>{formatINR(a.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <h3>Invoice expenses</h3>
              <p className="summary">
                Total linked expenses: {formatINR(data.data!.invoice.expenses)}. Cash remaining =
                bank receipts minus linked expenses. These expenses are separate from Other
                Deductions and do not reduce the receivable.
              </p>
              <h3>Spending by expense category</h3>
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(expenses.map((expense) => expense.category))].map((categoryId) => (
                    <tr key={categoryId ?? 'unclassified'}>
                      <td>
                        {data.data!.categories.find((category) => category.id === categoryId)
                          ?.name ?? 'Unclassified'}
                      </td>
                      <td>
                        {formatINR(
                          expenses
                            .filter((expense) => expense.category === categoryId)
                            .reduce((total, expense) => total.plus(expense.amount), new Decimal(0)),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Amount</th>
                      <th>Source</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id}>
                        <td>{e.date}</td>
                        <td>{e.description}</td>
                        <td>
                          <Select
                            disabled={!canWrite}
                            value={e.category ?? ''}
                            onChange={(event) =>
                              void changeCategory(e.id, e.bank, event.target.value)
                            }
                          >
                            <option value="" disabled>
                              Unclassified
                            </option>
                            {data
                              .data!.categories.filter(
                                (c) => c.type === 'expense' && (c.is_active || c.id === e.category),
                              )
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </Select>
                        </td>
                        <td>{formatINR(e.amount)}</td>
                        <td>{e.source}</td>
                        <td>
                          {canWrite && (
                            <button
                              className="secondary"
                              onClick={() => setUnlink({ id: e.id, bank: e.bank })}
                            >
                              Unlink
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canWrite && (
                <div className="actions">
                  <button
                    onClick={() => {
                      setMode('manual');
                      setCategory('');
                    }}
                  >
                    + Add invoice expense
                  </button>
                  <button
                    onClick={() => {
                      setMode('bank');
                      setCategory('');
                      setBank('');
                    }}
                  >
                    + Link bank expense
                  </button>
                </div>
              )}
              {unlink && (
                <section className="summary">
                  <p>Unlink this expense? The original expense will remain.</p>
                  <div className="actions">
                    <button
                      onClick={async () => {
                        const { error } = await client
                          .from(unlink.bank ? 'bank_transactions' : 'manual_expenses')
                          .update(unlink.bank ? { expense_invoice_id: null } : { invoice_id: null })
                          .eq('id', unlink.id)
                          .eq('organization_id', org);
                        if (error) toast.error(error.message);
                        else {
                          setUnlink(null);
                          await refresh();
                        }
                      }}
                    >
                      Confirm unlink
                    </button>
                    <button className="secondary" onClick={() => setUnlink(null)}>
                      Cancel
                    </button>
                  </div>
                </section>
              )}
              {mode && (
                <form onSubmit={saveExpense}>
                  <h3>{mode === 'bank' ? 'Link bank expense' : 'Add invoice expense'}</h3>
                  <div className="form-grid">
                    {mode === 'bank' ? (
                      <label>
                        Bank debit
                        <Select
                          required
                          value={bank}
                          onChange={(e) => {
                            setBank(e.target.value);
                            setCategory(
                              data.data!.debits.find((t) => t.id === e.target.value)
                                ?.expense_category_id ?? '',
                            );
                          }}
                        >
                          <option value="">Select debit</option>
                          {data.data!.debits.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.txn_date} · {t.description} · {formatINR(t.amount)}
                            </option>
                          ))}
                        </Select>
                      </label>
                    ) : (
                      <>
                        <label>
                          Date
                          <input
                            type="date"
                            name="date"
                            required
                            defaultValue={new Date().toISOString().slice(0, 10)}
                          />
                        </label>
                        <label>
                          Description
                          <input name="description" required />
                        </label>
                        <label>
                          Amount
                          <input name="amount" type="number" min="0.01" step="0.01" required />
                        </label>
                        <label>
                          Payment source
                          <Select name="source">
                            <option>Cash</option>
                            <option>Manual</option>
                          </Select>
                        </label>
                      </>
                    )}
                    <label>
                      Expense category
                      <Select
                        required
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        <option value="">Select category</option>
                        {data
                          .data!.categories.filter(
                            (c) => c.type === 'expense' && (c.is_active || c.id === category),
                          )
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </Select>
                    </label>
                    <label>
                      New expense category
                      <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
                      <button
                        type="button"
                        className="secondary"
                        onClick={async () => {
                          if (!newCategory.trim()) return;
                          const { data: created, error } = await client
                            .from('categories')
                            .insert({
                              organization_id: org,
                              type: 'expense',
                              name: newCategory.trim(),
                            })
                            .select('id')
                            .single();
                          if (error) toast.error(error.message);
                          else {
                            setCategory(created.id);
                            setNewCategory('');
                            await refresh();
                          }
                        }}
                      >
                        + New category
                      </button>
                    </label>
                  </div>
                  <div className="actions">
                    <button disabled={busy}>Save expense</button>
                    <button className="secondary" type="button" onClick={() => setMode('')}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
          <Attachments client={client} org={org} invoice={id} canWrite={canWrite} />
          <Dialog.Close asChild>
            <button className="secondary" style={{ marginTop: 20 }}>
              Close invoice
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
