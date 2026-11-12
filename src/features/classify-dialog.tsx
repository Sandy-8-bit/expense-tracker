'use client';
import { Select } from '../components/ui/select';
import { SupabaseClient } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import Decimal from 'decimal.js';
import { toast } from 'sonner';
import { formatINR } from '../lib/money';
import { validateAllocations } from '../lib/allocation';
import { formatDate } from '../components/ui/finance';
type Transaction = {
  id: string;
  amount: string;
  description: string;
  txn_date: string;
  other_income_amount: string;
  expense_invoice_id: string | null;
  expense_category_id: string | null;
};
export function ClassifyDialog({
  client,
  org,
  transaction,
  onClose,
}: {
  client: SupabaseClient;
  org: string;
  transaction: Transaction;
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [other, setOther] = useState(String(transaction.other_income_amount));
  const [category, setCategory] = useState(transaction.expense_category_id ?? '');
  const [invoice, setInvoice] = useState(transaction.expense_invoice_id ?? '');
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const credit = new Decimal(transaction.amount).gt(0);
  const data = useQuery({
    queryKey: ['classification', org, transaction.id],
    queryFn: async () => {
      async function loadInvoices() {
        const page = (offset: number) =>
          client
            .from('invoice_financials')
            .select(
              'id,number,invoice_date,pending,net,receipts,expenses,company_id,companies(name)',
            )
            .eq('organization_id', org)
            .order('invoice_date', { ascending: false })
            .order('id')
            .range(offset, offset + 499);
        const first = await page(0);
        if (first.error) throw first.error;
        const rows = [...first.data];
        for (let offset = 500; rows.length === offset; offset += 500) {
          const next = await page(offset);
          if (next.error) throw next.error;
          rows.push(...next.data);
          if (next.data.length < 500) break;
        }
        return { data: rows, error: null };
      }
      const [invoices, allocations, categories] = await Promise.all([
        loadInvoices(),
        client
          .from('receipt_allocations')
          .select('invoice_id,amount')
          .eq('organization_id', org)
          .eq('transaction_id', transaction.id),
        client
          .from('categories')
          .select('id,name,is_active')
          .eq('organization_id', org)
          .eq('type', 'expense'),
      ]);
      for (const r of [invoices, allocations, categories]) if (r.error) throw r.error;
      return {
        invoices: invoices.data!,
        allocations: allocations.data!,
        categories: categories.data!,
      };
    },
  });
  const isSelected = (id: string) =>
    selected[id] ?? !!data.data?.allocations.some((a) => a.invoice_id === id);
  const amountFor = (id: string) =>
    !isSelected(id)
      ? '0'
      : (values[id] ??
        String(data.data?.allocations.find((a) => a.invoice_id === id)?.amount ?? '0'));
  const availableFor = (id: string, pending: string | number) =>
    new Decimal(pending).plus(data.data?.allocations.find((a) => a.invoice_id === id)?.amount ?? 0);
  const companyName = (companies: unknown) => {
    const company = (Array.isArray(companies) ? companies[0] : companies) as {
      name?: string;
    } | null;
    return company?.name ?? 'Company unavailable';
  };
  let remainder = '0';
  try {
    remainder = new Decimal(transaction.amount)
      .minus(other || 0)
      .minus(
        (data.data?.invoices ?? []).reduce(
          (sum, i) => sum.plus(amountFor(i.id) || 0),
          new Decimal(0),
        ),
      )
      .toFixed(2);
  } catch {
    remainder = 'invalid';
  }
  async function save() {
    setSaving(true);
    try {
      let error;
      if (credit) {
        const available = Object.fromEntries(
          (data.data?.invoices ?? []).map((i) => [
            i.id,
            new Decimal(i.pending)
              .plus(data.data?.allocations.find((a) => a.invoice_id === i.id)?.amount ?? 0)
              .toFixed(2),
          ]),
        );
        validateAllocations(
          transaction.amount,
          other || '0',
          (data.data?.invoices ?? []).map((i) => ({
            invoiceId: i.id,
            amount: amountFor(i.id) || '0',
          })),
          available,
        );
        ({ error } = await client.rpc('save_receipt_allocations', {
          p_transaction: transaction.id,
          p_other_income: other || '0',
          p_allocations: data.data?.invoices
            .map((i) => ({ invoice_id: i.id, amount: amountFor(i.id) || '0' }))
            .filter((i) => new Decimal(i.amount).gt(0)),
        }));
      } else {
        ({ error } = await client
          .from('bank_transactions')
          .update({ expense_category_id: category, expense_invoice_id: invoice || null })
          .eq('id', transaction.id)
          .eq('organization_id', org));
      }
      if (error) throw error;
      await cache.invalidateQueries();
      toast.success('Transaction updated; no duplicate was created.');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title>
            {credit ? 'Classify incoming bank receipt' : 'One bank debit, one expense'}
          </Dialog.Title>
          <Dialog.Description>
            {transaction.txn_date} · {transaction.description} · {formatINR(transaction.amount)}
          </Dialog.Description>
          {data.isPending ? (
            <p>Loading…</p>
          ) : data.error ? (
            <p role="alert">{data.error.message}</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {credit ? (
                <>
                  <label>
                    Add invoice
                    <Select
                      value=""
                      onChange={(event) => {
                        if (!event.target.value) return;
                        setSelected({ ...selected, [event.target.value]: true });
                        setValues({ ...values, [event.target.value]: '0' });
                      }}
                    >
                      <option value="">Search invoice number or company…</option>
                      {data.data?.invoices
                        .filter((i) => !isSelected(i.id) && availableFor(i.id, i.pending).gt(0))
                        .map((i) => (
                          <option
                            key={i.id}
                            value={i.id}
                          >{`${i.number} · ${companyName(i.companies)} · ${formatDate(i.invoice_date)} · Available ${formatINR(availableFor(i.id, i.pending))}`}</option>
                        ))}
                    </Select>
                  </label>
                  <div className="form-grid">
                    {data.data?.invoices
                      .filter((i) => isSelected(i.id))
                      .map((i) => (
                        <div className="allocation-row" key={i.id}>
                          <label>
                            {i.number} · {companyName(i.companies)} · {formatDate(i.invoice_date)} ·
                            Available{' '}
                            {formatINR(
                              new Decimal(i.pending).plus(
                                data.data.allocations.find((a) => a.invoice_id === i.id)?.amount ??
                                  0,
                              ),
                            )}
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              max={availableFor(i.id, i.pending).toFixed(2)}
                              value={amountFor(i.id)}
                              onChange={(e) => setValues({ ...values, [i.id]: e.target.value })}
                            />
                          </label>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              setSelected({ ...selected, [i.id]: false });
                              setValues({ ...values, [i.id]: '0' });
                            }}
                          >
                            Remove invoice
                          </button>
                        </div>
                      ))}
                    <label>
                      Other income amount
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={other}
                        onChange={(e) => setOther(e.target.value)}
                      />
                    </label>
                  </div>
                  <p className="summary">
                    Unassigned remainder:{' '}
                    {remainder === 'invalid' ? 'Enter valid amounts' : formatINR(remainder)}
                  </p>
                  <p>
                    Partial allocation is allowed. Any remainder stays unassigned for later
                    classification. Enter amounts with at most two decimal places; extra decimals
                    are rejected.
                  </p>
                </>
              ) : (
                <div className="form-grid">
                  <label>
                    Expense category
                    <Select required value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="">Select category</option>
                      {data.data?.categories
                        .filter((c) => c.is_active || c.id === category)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </Select>
                  </label>
                  <label>
                    Invoice link
                    <Select value={invoice} onChange={(e) => setInvoice(e.target.value)}>
                      <option value="">Do not link to an invoice</option>
                      {data.data?.invoices.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.number}
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
                        const result = await client
                          .from('categories')
                          .insert({
                            organization_id: org,
                            type: 'expense',
                            name: newCategory.trim(),
                          })
                          .select('id')
                          .single();
                        if (result.error) toast.error(result.error.message);
                        else {
                          setCategory(result.data.id);
                          setNewCategory('');
                          await cache.invalidateQueries();
                        }
                      }}
                    >
                      + New category
                    </button>
                  </label>
                  {invoice &&
                    (() => {
                      const selected = data.data?.invoices.find((i) => i.id === invoice);
                      return selected ? (
                        <p className="summary">
                          Invoice net: {formatINR(selected.net)} · Bank received:{' '}
                          {formatINR(selected.receipts)} · Existing expenses:{' '}
                          {formatINR(selected.expenses)}. This debit counts once.
                        </p>
                      ) : null;
                    })()}
                  {transaction.expense_invoice_id && transaction.expense_invoice_id !== invoice && (
                    <label>
                      <input type="checkbox" required />I confirm replacing the existing invoice
                      link.
                    </label>
                  )}
                </div>
              )}
              <div className="actions">
                <button disabled={saving}>{saving ? 'Saving…' : 'Save classification'}</button>
                <Dialog.Close asChild>
                  <button type="button" className="secondary">
                    Cancel
                  </button>
                </Dialog.Close>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
