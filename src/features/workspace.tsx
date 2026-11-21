'use client';
import { PageHeader } from '../components/ui/page-header';
import { Select } from '../components/ui/select';
import { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { toast, Toaster } from 'sonner';
import { formatINR } from '../lib/money';
import { calculateInvoice } from '../lib/invoice-calc';
import { ClassifyDialog } from './classify-dialog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ImportStatement } from './import-statement';
import { Reports } from './reports';
import { Transactions } from './transactions';
import { DashboardMetrics } from './dashboard-metrics';
import { InvoiceDetails } from './invoice-details';
import { OrganizationSettings } from './organization-settings';
import { invoiceSchema } from '../lib/schemas';
import { workspacePages } from '../lib/pages';
import Decimal from 'decimal.js';
import { MoneyText, StatusPill, formatDate } from '../components/ui/finance';
import {
  BookOpen,
  LayoutDashboard,
  FileText,
  ArrowLeftRight,
  Upload,
  Wallet,
  Receipt,
  Building2,
  Tags,
  Landmark,
  ChartNoAxesCombined,
  LogOut,
  ChevronRight,
  Menu,
} from 'lucide-react';

type Row = Record<string, string | boolean | null>;
const pages = [
  'Dashboard',
  'Invoices',
  'Match Payments',
  'Import Statement',
  'Bank Transactions',
  'Expenses',
  'Companies',
  'Categories',
  'Bank Accounts',
  'Reports',
];
const pageIcons = [
  LayoutDashboard,
  FileText,
  ArrowLeftRight,
  Upload,
  Wallet,
  Receipt,
  Building2,
  Tags,
  Landmark,
  ChartNoAxesCombined,
];
const tables: Record<string, string> = {
  Invoices: 'invoice_financials',
  'Match Payments': 'transaction_financials',
  'Bank Transactions': 'transaction_financials',
  Expenses: 'manual_expenses',
  Companies: 'company_financials',
  Categories: 'category_usage',
  'Bank Accounts': 'bank_account_financials',
};
const fields: Record<string, string[]> = {
  Companies: ['name', 'gstin'],
  Categories: ['name', 'type'],
  'Bank Accounts': ['name', 'account_last4', 'opening_balance'],
  Expenses: [
    'expense_date',
    'description',
    'amount',
    'category_id',
    'invoice_id',
    'payment_source',
  ],
  Invoices: [
    'number',
    'company_id',
    'invoice_date',
    'due_date',
    'description',
    'taxable_value',
    'cgst_pct',
    'sgst_pct',
    'igst_pct',
    'tds_pct',
  ],
};
const columns: Record<string, string[]> = {
  Invoices: [
    'number',
    'company_id',
    'invoice_date',
    'gross',
    'receipts',
    'payment_dates',
    'pending',
    'expenses',
    'cash_remaining',
    'status',
  ],
  'Match Payments': ['txn_date', 'description', 'amount', 'unassigned'],
  'Bank Transactions': ['txn_date', 'description', 'amount', 'unassigned'],
  Expenses: ['expense_date', 'description', 'amount', 'category_id', 'payment_source'],
  Companies: ['name', 'gstin', 'invoice_count', 'net', 'pending'],
  Categories: ['name', 'type', 'is_active', 'bank_uses', 'manual_uses'],
  'Bank Accounts': [
    'name',
    'account_last4',
    'opening_balance',
    'credits',
    'debits',
    'closing_balance',
  ],
};
const moneyFields = new Set([
  'net',
  'receipts',
  'pending',
  'expenses',
  'cash_remaining',
  'amount',
  'unassigned',
  'opening_balance',
  'credits',
  'debits',
  'closing_balance',
  'gross',
  'tds',
]);
function label(value: string) {
  if (value === 'gross') return 'Invoice Amount';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
const queryClient = new QueryClient();
export default function Workspace({ initialPage = 'Dashboard' }: { initialPage?: string } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return (
      <main className="setup">
        <h1>Connect ClearLedger</h1>
        <p>
          Copy .env.example to .env.local and enter your Supabase URL and anon key, then restart the
          development server.
        </p>
      </main>
    );
  return (
    <QueryClientProvider client={queryClient}>
      <Connected key={initialPage} url={url} apiKey={key} initialPage={initialPage} />
      <Toaster richColors />
    </QueryClientProvider>
  );
}
function Connected({
  url,
  apiKey,
  initialPage,
}: {
  url: string;
  apiKey: string;
  initialPage: string;
}) {
  const router = useRouter();
  const [client] = useState(() => createBrowserClient(url, apiKey));
  const [page, setPageState] = useState(initialPage);
  const [mobileOpen, setMobileOpen] = useState(false);
  function setPage(next: string) {
    setPageState(next);
    router.push(
      '/' +
        (Object.keys(workspacePages).find((key) => workspacePages[key] === next) ?? 'dashboard'),
    );
  }
  const cache = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await client.auth.getUser();
      if (error) return null;
      return data.user;
    },
  });
  const memberships = useQuery({
    queryKey: ['memberships', session.data?.id],
    enabled: !!session.data,
    queryFn: async () => {
      const { data, error } = await client
        .from('memberships')
        .select('organization_id,role,organizations(name)')
        .eq('user_id', session.data!.id);
      if (error) throw error;
      return data;
    },
  });
  const activeOrg = memberships.data?.[0]?.organization_id;
  const role = memberships.data?.find((m) => m.organization_id === activeOrg)?.role;
  if (session.isPending || memberships.isLoading)
    return <main className="setup">Loading your workspace…</main>;
  if (!session.data)
    return (
      <main className="setup">
        <h1>ClearLedger</h1>
        <p>Sign in to access your company finances.</p>
        <Link className="primary" href="/login">
          Sign in →
        </Link>
      </main>
    );
  if (memberships.error)
    return (
      <main className="setup">
        <h1>Database setup required</h1>
        <p>{memberships.error.message}</p>
        <p>Apply all SQL files in supabase/migrations in order.</p>
      </main>
    );
  if (!activeOrg)
    return (
      <main className="setup">
        <h1>Create your organisation</h1>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get('name');
            const { error } = await client.rpc('create_organization', { p_name: name });
            if (error) toast.error(error.message);
            else await cache.invalidateQueries({ queryKey: ['memberships'] });
          }}
        >
          <label>
            Organisation name
            <input name="name" required defaultValue="SREE VIJEYA GANAPATHI AND CO" />
          </label>
          <button>Create workspace</button>
        </form>
      </main>
    );
  return (
    <div className="workspace">
      <aside>
        <Link className="brand" href="/">
          <span className="brand-mark">
            <BookOpen size={21} aria-hidden="true" />
          </span>
          <span>
            ClearLedger<small>FINANCE WORKSPACE</small>
          </span>
        </Link>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {pages.map((p, index) => {
            const Icon = pageIcons[index];
            return (
              <Link
                key={p}
                className={page === p ? 'active' : ''}
                aria-current={page === p ? 'page' : undefined}
                href={'/' + Object.keys(workspacePages).find((key) => workspacePages[key] === p)}
              >
                <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                <span>{p}</span>
                {page === p && (
                  <ChevronRight size={14} className="nav-chevron" aria-hidden="true" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          {role === 'owner' && <OrganizationSettings client={client} org={activeOrg} />}
          <button
            className="sign-out"
            onClick={async () => {
              await client.auth.signOut();
              cache.clear();
              router.push('/login');
            }}
          >
            <LogOut size={17} aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>
      <div className="workspace-body">
        <header>
          <div>
            <span className="eyebrow">YOUR FINANCES, IN FOCUS</span>
            <h1>{page}</h1>
          </div>
          <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <Dialog.Trigger asChild>
              <button className="mobile-nav secondary" aria-label="Open navigation">
                <Menu size={20} />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="dialog-content mobile-drawer">
                <Dialog.Title>ClearLedger</Dialog.Title>
                <Dialog.Description>Navigate your finance workspace</Dialog.Description>
                <nav aria-label="Mobile navigation">
                  {pages.map((destination, index) => {
                    const Icon = pageIcons[index];
                    return (
                      <Link
                        key={destination}
                        className={page === destination ? 'active' : ''}
                        aria-current={page === destination ? 'page' : undefined}
                        href={
                          '/' +
                          Object.keys(workspacePages).find(
                            (key) => workspacePages[key] === destination,
                          )
                        }
                        onClick={() => setMobileOpen(false)}
                      >
                        <Icon size={18} />
                        <span>{destination}</span>
                      </Link>
                    );
                  })}
                </nav>
                <div className="actions">
                  {role === 'owner' && <OrganizationSettings client={client} org={activeOrg} />}
                  <button
                    className="secondary"
                    onClick={async () => {
                      await client.auth.signOut();
                      cache.clear();
                      router.push('/login');
                    }}
                  >
                    Sign out
                  </button>
                  <Dialog.Close asChild>
                    <button className="secondary">Close navigation</button>
                  </Dialog.Close>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </header>
        <main className="page-content">
          {page === 'Dashboard' ? (
            <>
              <DashboardMetrics client={client} org={activeOrg} />
              <section className="card">
                <h2>Your finance workflow</h2>
                <div className="steps">
                  {['Invoices', 'Import Statement', 'Match Payments', 'Reports'].map((p, i) => (
                    <button className="step" key={p} onClick={() => setPage(p)}>
                      <span>0{i + 1}</span>
                      <strong>{p}</strong>
                      <small>Open →</small>
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : page === 'Import Statement' ? (
            <ImportStatement client={client} org={activeOrg} canWrite={role !== 'viewer'} />
          ) : page === 'Reports' ? (
            <Reports client={client} org={activeOrg} />
          ) : page === 'Bank Transactions' || page === 'Match Payments' ? (
            <Transactions
              key={`${page}-${activeOrg}`}
              client={client}
              org={activeOrg}
              canWrite={role !== 'viewer'}
              queue={page === 'Match Payments'}
            />
          ) : page === 'Expenses' ? (
            <>
              <Transactions
                client={client}
                org={activeOrg}
                canWrite={role !== 'viewer'}
                debitsOnly
              />
              <Register
                client={client}
                org={activeOrg}
                page="Expenses"
                canWrite={role !== 'viewer'}
              />
            </>
          ) : tables[page] ? (
            <Register
              key={`${page}-${activeOrg}`}
              client={client}
              org={activeOrg}
              page={page}
              canWrite={role !== 'viewer'}
            />
          ) : (
            <section className="card">
              <h2>{page}</h2>
              <p>This workflow is being implemented.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
function Register({
  client,
  org,
  page,
  canWrite,
}: {
  client: SupabaseClient;
  org: string;
  page: string;
  canWrite: boolean;
}) {
  const [offset, setOffset] = useState(0),
    [search, setSearch] = useState(''),
    [draft, setDraft] = useState<Row | null>(null),
    [saving, setSaving] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Row | null>(null);
  const [detailId, setDetailId] = useState('');
  const [archiveId, setArchiveId] = useState('');
  const [categoryType, setCategoryType] = useState('expense');
  const [lines, setLines] = useState<{ kind: string; category_id: string; amount: string }[]>([]);
  const cache = useQueryClient();
  const result = useQuery({
    queryKey: ['records', org, page, offset, search, categoryType],
    queryFn: async () => {
      let query = client
        .from(tables[page])
        .select('*', { count: 'exact' })
        .eq('organization_id', org);
      if (['Companies', 'Bank Accounts', 'Expenses'].includes(page))
        query = query.eq('is_active', true);
      if (page === 'Categories') query = query.eq('type', categoryType);
      if (page === 'Match Payments') query = query.gt('amount', 0).gt('unassigned', 0);
      if (search)
        query = query.ilike(
          ['Companies', 'Categories', 'Bank Accounts'].includes(page)
            ? 'name'
            : page === 'Invoices'
              ? 'number'
              : 'description',
          `%${search}%`,
        );
      const { data, error, count } = await query
        .order(
          page === 'Invoices'
            ? 'invoice_date'
            : page === 'Bank Transactions' || page === 'Match Payments'
              ? 'txn_date'
              : 'id',
          { ascending: false },
        )
        .range(offset, offset + 24);
      if (error) throw error;
      if (page === 'Invoices' && data.length) {
        const payments: {
          invoice_id: string;
          amount: string;
          bank_transactions: { txn_date: string };
        }[] = [];
        for (let paymentOffset = 0; ; paymentOffset += 500) {
          const linked = await client
            .from('receipt_allocations')
            .select('invoice_id, amount, bank_transactions!inner(txn_date)')
            .eq('organization_id', org)
            .in(
              'invoice_id',
              data.map((invoice) => invoice.id),
            )
            .order('id')
            .range(paymentOffset, paymentOffset + 499);
          if (linked.error) throw linked.error;
          payments.push(...(linked.data as unknown as typeof payments));
          if (linked.data.length < 500) break;
        }
        return {
          rows: data.map((invoice) => ({
            ...invoice,
            payment_dates:
              payments
                .filter((payment) => payment.invoice_id === invoice.id)
                .sort((a, b) =>
                  a.bank_transactions.txn_date.localeCompare(b.bank_transactions.txn_date),
                )
                .map(
                  (payment) =>
                    `${formatDate(payment.bank_transactions.txn_date)}: ${formatINR(payment.amount)}`,
                )
                .join('\n') || 'No linked payments',
          })) as Row[],
          count: count ?? 0,
        };
      }
      return { rows: data as Row[], count: count ?? 0 };
    },
  });
  const choices = useQuery({
    queryKey: ['choices', org],
    queryFn: async () => {
      const results = await Promise.all(
        ['companies', 'categories', 'invoices'].map(async (table) => {
          const { data, error } = await client.from(table).select('*').eq('organization_id', org);
          if (error) throw error;
          return data as Row[];
        }),
      );
      return { companies: results[0], categories: results[1], invoices: results[2] };
    },
  });
  const inputFields = fields[page];
  async function newDraft() {
    setLines([]);
    let nextNumber = '';
    let terms = 30;
    if (page === 'Invoices') {
      const [number, organization] = await Promise.all([
        client.rpc('next_invoice_number', { p_org: org }),
        client.from('organizations').select('payment_terms').eq('id', org).single(),
      ]);
      if (number.error) {
        toast.error(number.error.message);
        return;
      }
      if (organization.error) {
        toast.error(organization.error.message);
        return;
      }
      nextNumber = number.data;
      terms = organization.data.payment_terms;
    }
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date();
    due.setDate(due.getDate() + terms);
    setDraft(
      Object.fromEntries(
        (inputFields ?? []).map((f) => [
          f,
          f === 'number'
            ? nextNumber
            : f === 'invoice_date' || f === 'expense_date'
              ? today
              : f === 'due_date'
                ? due.toISOString().slice(0, 10)
                : f === 'cgst_pct' || f === 'sgst_pct'
                  ? '9'
                  : f === 'tds_pct'
                    ? '2'
                    : f === 'type'
                      ? categoryType
                      : f === 'payment_source'
                        ? 'Manual'
                        : f.includes('pct') || f.includes('value') || f === 'opening_balance'
                          ? '0'
                          : '',
        ]),
      ),
    );
  }
  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const data = {
        ...Object.fromEntries(
          Object.entries(draft).map(([key, value]) => [
            key,
            key.endsWith('_id') && value === '' ? null : value,
          ]),
        ),
        organization_id: org,
      };
      let error;
      if (page === 'Invoices') {
        const invoice = invoiceSchema.parse({ ...draft, lines });
        const { data: session } = await client.auth.getSession();
        const response = await fetch('/api/invoices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ organization_id: org, invoice }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
      } else {
        const writeTable =
          page === 'Companies'
            ? 'companies'
            : page === 'Categories'
              ? 'categories'
              : page === 'Bank Accounts'
                ? 'bank_accounts'
                : tables[page];
        ({ error } = await client.from(writeTable).upsert(data));
      }
      if (error) throw error;
      setDraft(null);
      toast.success('Saved successfully');
      await cache.invalidateQueries();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : ((error as { message?: string }).message ?? 'Unable to save'),
      );
    } finally {
      setSaving(false);
    }
  }
  let summary: string | null = null;
  let financial: ReturnType<typeof calculateInvoice> | null = null;
  const existing = result.data?.rows.find((row) => row.id === draft?.id);
  if (page === 'Invoices' && draft) {
    try {
      financial = calculateInvoice({
        taxable: String(draft.taxable_value || 0),
        cgstPct: String(draft.cgst_pct || 0),
        sgstPct: String(draft.sgst_pct || 0),
        igstPct: String(draft.igst_pct || 0),
        tdsPct: String(draft.tds_pct || 0),
        additions: lines.filter((l) => l.kind === 'addition').map((l) => l.amount || '0'),
        deductions: lines.filter((l) => l.kind === 'deduction').map((l) => l.amount || '0'),
        receipts: String(existing?.receipts ?? '0'),
      });
      summary = formatINR(financial.net);
    } catch (error) {
      summary = (error as Error).message;
    }
  }
  return (
    <section className="card">
      <PageHeader>
        <div>
          <h2>{page === 'Invoices' ? 'Invoice register' : page}</h2>
        </div>
        {canWrite && inputFields && (
          <button onClick={newDraft}>+ Add {page === 'Invoices' ? 'invoice' : 'record'}</button>
        )}
      </PageHeader>
      {page === 'Categories' && (
        <div className="category-navigation">
          <div className="actions" aria-label="Category types">
            {[
              ['deduction', 'Other Deductions'],
              ['addition', 'Additional Amounts'],
              ['expense', 'Expenses'],
              ['bank', 'Bank Transactions'],
            ].map(([type, title]) => (
              <button
                key={type}
                className={categoryType === type ? '' : 'secondary'}
                onClick={() => {
                  setCategoryType(type);
                  setOffset(0);
                }}
              >
                {title}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="filter-bar">
        <input
          aria-label="Search records"
          placeholder="Search records…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
        <span className="pill">{result.data?.count ?? 0} records</span>
      </div>
      {result.isPending ? (
        <p>Loading records…</p>
      ) : result.error ? (
        <p role="alert">{result.error.message}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns[page].map((c) => (
                  <th key={c}>{label(c)}</th>
                ))}
                {(canWrite || page === 'Invoices') && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {result.data?.rows.map((row) => (
                <tr key={String(row.id)}>
                  {columns[page].map((c) => (
                    <td key={c}>
                      {moneyFields.has(c) ? (
                        <MoneyText
                          value={
                            c === 'gross'
                              ? new Decimal(String(row.net)).plus(String(row.tds))
                              : String(row[c] ?? 0)
                          }
                          signed={c === 'cash_remaining'}
                        />
                      ) : c === 'payment_dates' ? (
                        <span style={{ whiteSpace: 'pre-line' }}>{String(row[c])}</span>
                      ) : c === 'company_id' ? (
                        String(
                          choices.data?.companies.find((company) => company.id === row[c])?.name ??
                            '',
                        )
                      ) : c === 'category_id' ? (
                        String(
                          choices.data?.categories.find((category) => category.id === row[c])
                            ?.name ?? 'Unclassified',
                        )
                      ) : c.endsWith('_date') ? (
                        formatDate(String(row[c]))
                      ) : c === 'status' ? (
                        <StatusPill status={String(row[c])} />
                      ) : c === 'is_active' ? (
                        <span className="pill">{row[c] ? 'Active' : 'Inactive'}</span>
                      ) : c === 'account_last4' ? (
                        '•••• ' + String(row[c] ?? '')
                      ) : (
                        String(row[c] ?? '—')
                      )}
                    </td>
                  ))}
                  {inputFields && canWrite && (
                    <td>
                      {page === 'Invoices' && (
                        <button className="text-button" onClick={() => setDetailId(String(row.id))}>
                          View ·{' '}
                        </button>
                      )}
                      <button
                        className="text-button"
                        onClick={async () => {
                          if (page === 'Invoices') {
                            const { data, error } = await client
                              .from('invoice_lines')
                              .select('kind,category_id,amount')
                              .eq('invoice_id', row.id);
                            if (error) {
                              toast.error(error.message);
                              return;
                            }
                            setLines(data.map((l) => ({ ...l, amount: String(l.amount) })));
                          }
                          setDraft(
                            Object.fromEntries(
                              ['id', ...inputFields].map((f) => [f, String(row[f] ?? '')]),
                            ),
                          );
                        }}
                      >
                        Edit
                      </button>
                      {['Companies', 'Bank Accounts', 'Expenses'].includes(page) && (
                        <button
                          className="text-button"
                          style={{ marginLeft: 12 }}
                          onClick={() => setArchiveId(String(row.id))}
                        >
                          Archive
                        </button>
                      )}
                      {page === 'Categories' && (
                        <button
                          className="text-button"
                          style={{ marginLeft: 12 }}
                          onClick={async () => {
                            const { error } = await client
                              .from('categories')
                              .update({ is_active: !row.is_active })
                              .eq('id', row.id)
                              .eq('organization_id', org);
                            if (error) toast.error(error.message);
                            else {
                              await cache.invalidateQueries({ queryKey: ['records'] });
                              await cache.invalidateQueries({ queryKey: ['choices'] });
                            }
                          }}
                        >
                          {row.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  )}
                  {page === 'Invoices' && !canWrite && (
                    <td>
                      <button className="text-button" onClick={() => setDetailId(String(row.id))}>
                        View
                      </button>
                    </td>
                  )}
                  {!inputFields && canWrite && (
                    <td>
                      <button className="text-button" onClick={() => setSelectedTransaction(row)}>
                        Classify / link
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!result.data?.rows.length && (
            <p className="empty">No records for the selected filters.</p>
          )}
        </div>
      )}
      <div className="pagination">
        <span>
          Page {Math.floor(offset / 25) + 1} · {result.data?.count ?? 0} records
        </span>
        <div className="actions">
          <button
            className="secondary"
            disabled={offset === 0}
            onClick={() => setOffset(offset - 25)}
          >
            Previous
          </button>
          <button
            className="secondary"
            disabled={offset + 25 >= (result.data?.count ?? 0)}
            onClick={() => setOffset(offset + 25)}
          >
            Next
          </button>
        </div>
      </div>
      <Dialog.Root
        open={!!archiveId}
        onOpenChange={(open) => {
          if (!open) setArchiveId('');
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>Archive this record?</Dialog.Title>
            <Dialog.Description>
              Companies and bank accounts with dependent financial records cannot be archived.
              Manual expenses will be excluded from expense totals.
            </Dialog.Description>
            <div className="actions">
              <button
                onClick={async () => {
                  const { error } = await client.rpc('archive_record', {
                    p_org: org,
                    p_entity:
                      page === 'Companies'
                        ? 'companies'
                        : page === 'Bank Accounts'
                          ? 'bank_accounts'
                          : 'manual_expenses',
                    p_id: archiveId,
                  });
                  if (error) toast.error(error.message);
                  else {
                    setArchiveId('');
                    await cache.invalidateQueries({ queryKey: ['records'] });
                    await cache.invalidateQueries({ queryKey: ['choices'] });
                  }
                }}
              >
                Confirm archive
              </button>
              <Dialog.Close asChild>
                <button className="secondary">Cancel</button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {detailId && (
        <InvoiceDetails
          client={client}
          org={org}
          id={detailId}
          canWrite={canWrite}
          onClose={() => setDetailId('')}
        />
      )}
      {selectedTransaction && (
        <ClassifyDialog
          client={client}
          org={org}
          transaction={
            selectedTransaction as unknown as Parameters<typeof ClassifyDialog>[0]['transaction']
          }
          onClose={() => setSelectedTransaction(null)}
        />
      )}
      <Dialog.Root
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>
              {draft?.id ? 'Edit' : 'New'} {page.toLowerCase()}
            </Dialog.Title>
            <Dialog.Description>
              Enter the details below. Changes are saved to your organisation.
            </Dialog.Description>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="form-grid">
                {inputFields
                  ?.filter((f) => f !== 'igst_pct' || !!draft?.id)
                  .map((f) => (
                    <label key={f}>
                      {label(f)}
                      {f.endsWith('_id') ? (
                        <Select
                          value={String(draft?.[f] ?? '')}
                          onChange={(e) => setDraft({ ...draft, [f]: e.target.value || null })}
                          required={f !== 'invoice_id'}
                        >
                          <option value="">Select…</option>
                          {(f === 'company_id'
                            ? choices.data?.companies
                            : f === 'invoice_id'
                              ? choices.data?.invoices
                              : choices.data?.categories.filter((c) => c.type === 'expense')
                          )
                            ?.filter((c) => c.is_active !== false || c.id === draft?.[f])
                            .map((c) => (
                              <option key={String(c.id)} value={String(c.id)}>
                                {String(c.name ?? c.number)}
                              </option>
                            ))}
                        </Select>
                      ) : f === 'payment_source' ? (
                        <Select
                          value={String(draft?.[f] ?? 'Manual')}
                          onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                        >
                          <option>Cash</option>
                          <option>Manual</option>
                        </Select>
                      ) : f === 'type' ? (
                        <Select
                          value={String(draft?.[f] ?? 'expense')}
                          onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                        >
                          {['deduction', 'addition', 'expense', 'bank'].map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </Select>
                      ) : (
                        <input
                          required={!['gstin', 'description', 'account_last4'].includes(f)}
                          type={f.endsWith('_date') ? 'date' : 'text'}
                          value={String(draft?.[f] ?? '')}
                          onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                        />
                      )}
                    </label>
                  ))}
              </div>
              {summary && (
                <section>
                  {['deduction', 'addition'].map((kind) => (
                    <div key={kind}>
                      <h3>
                        {kind === 'deduction'
                          ? 'Other deductions'
                          : 'Additional amounts (after GST)'}
                      </h3>
                      {lines.map(
                        (line, index) =>
                          line.kind === kind && (
                            <div className="form-grid" key={index}>
                              <label>
                                Category
                                <Select
                                  required
                                  value={line.category_id}
                                  onChange={(e) =>
                                    setLines(
                                      lines.map((l, i) =>
                                        i === index ? { ...l, category_id: e.target.value } : l,
                                      ),
                                    )
                                  }
                                >
                                  <option value="">Select category</option>
                                  {choices.data?.categories
                                    .filter(
                                      (c) =>
                                        c.type === kind &&
                                        (c.is_active || c.id === line.category_id),
                                    )
                                    .map((c) => (
                                      <option key={String(c.id)} value={String(c.id)}>
                                        {String(c.name)}
                                      </option>
                                    ))}
                                </Select>
                              </label>
                              <label>
                                Amount
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  required
                                  value={line.amount}
                                  onChange={(e) =>
                                    setLines(
                                      lines.map((l, i) =>
                                        i === index ? { ...l, amount: e.target.value } : l,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => setLines(lines.filter((_, i) => i !== index))}
                              >
                                Remove line
                              </button>
                            </div>
                          ),
                      )}
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => setLines([...lines, { kind, category_id: '', amount: '0' }])}
                      >
                        + Add {kind}
                      </button>
                    </div>
                  ))}
                </section>
              )}
              {summary &&
                (financial ? (
                  <section className="summary" aria-live="polite">
                    <h3>Live financial summary</h3>
                    <table>
                      <tbody>
                        {[
                          ['Taxable value', financial.taxable],
                          ['CGST', financial.cgst],
                          ['SGST', financial.sgst],
                          ['IGST', financial.igst],
                          ['Additional amounts', financial.additions],
                          ['Other deductions', financial.deductions],
                          ['TDS on taxable value', financial.tds],
                          ['Auto round-off', financial.roundOff],
                          ['Expected bank receipt', financial.net],
                          ['Linked bank receipts', financial.receipts],
                          ['Outstanding receivable', financial.outstanding],
                          ['Linked invoice expenses', String(existing?.expenses ?? '0')],
                          [
                            'Net cash after expenses',
                            financial.receipts.minus(String(existing?.expenses ?? '0')),
                          ],
                        ].map(([name, amount]) => (
                          <tr key={String(name)}>
                            <td>{String(name)}</td>
                            <td>
                              <MoneyText value={amount} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {draft?.id ? (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setDetailId(String(draft.id))}
                      >
                        Manage invoice expenses and receipts
                      </button>
                    ) : (
                      <p>Save this invoice to link expenses and bank receipts.</p>
                    )}
                  </section>
                ) : (
                  <p role="alert" className="summary">
                    {summary}
                  </p>
                ))}
              <div className="actions">
                <button disabled={saving}>{saving ? 'Saving…' : 'Save record'}</button>
                <Dialog.Close asChild>
                  <button type="button" className="secondary">
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
