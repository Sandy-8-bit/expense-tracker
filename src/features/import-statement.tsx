'use client';
import { PageHeader } from '../components/ui/page-header';
import { Select } from '../components/ui/select';
import { SupabaseClient } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatINR } from '../lib/money';
import * as Dialog from '@radix-ui/react-dialog';
import { downloadBlob } from '../lib/download';
import { FileDropZone } from '../components/ui/file-drop-zone';
export function ImportStatement({
  client,
  org,
  canWrite,
}: {
  client: SupabaseClient;
  org: string;
  canWrite: boolean;
}) {
  const [file, setFile] = useState<File | null>(null),
    [bank, setBank] = useState(''),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{
      count: number;
      preview: { date: string; description: string; amount: string }[];
    } | null>(null);
  const cache = useQueryClient();
  const [undo, setUndo] = useState(false);
  const banks = useQuery({
    queryKey: ['banks', org],
    queryFn: async () => {
      const { data, error } = await client
        .from('bank_accounts')
        .select('id,name')
        .eq('organization_id', org)
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });
  const history = useQuery({
    queryKey: ['imports', org],
    queryFn: async () => {
      const { data, error } = await client
        .from('import_history')
        .select('id,created_at,imported,skipped,files(original_name)')
        .eq('organization_id', org)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
  async function upload(importing: boolean) {
    if (!file || !bank) return;
    setBusy(true);
    try {
      const { data } = await client.auth.getSession();
      const body = new FormData();
      body.set('file', file);
      body.set('organization_id', org);
      body.set('bank_account_id', bank);
      const response = await fetch(`/api/statements/${importing ? 'import' : 'preview'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token}` },
        body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (importing) {
        toast.success(`${result.imported} imported; ${result.skipped} duplicates skipped.`);
        setPreview(null);
        await cache.invalidateQueries({ queryKey: ['records'] });
        await cache.invalidateQueries({ queryKey: ['imports'] });
      } else setPreview(result);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card">
        <h2>Import a bank statement</h2>
        {canWrite && (
          <button
            className="secondary"
            type="button"
            onClick={async () => {
              try {
                const { statementTemplate } = await import('../lib/statement-template');
                const bytes = await statementTemplate();
                downloadBlob(
                  new Blob([new Uint8Array(bytes)], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  }),
                  'ClearLedger_example_statement.xlsx',
                );
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            Download example Excel
          </button>
        )}
        {canWrite && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void upload(false);
            }}
          >
            <div className="form-grid">
              <label>
                Bank account
                <Select
                  required
                  value={bank}
                  onChange={(e) => {
                    setBank(e.target.value);
                    setPreview(null);
                  }}
                >
                  <option value="">Select account</option>
                  {banks.data?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </label>
              <FileDropZone
                file={file}
                busy={busy}
                onFile={(next) => {
                  setFile(next);
                  setPreview(null);
                }}
              />
            </div>
            <button disabled={busy || !file || !bank}>
              {busy ? 'Processing…' : 'Preview file'}
            </button>
          </form>
        )}
        {preview && (
          <>
            <h3>{preview.count} valid transactions · First 15 rows</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((r, i) => (
                    <tr key={i}>
                      <td>{r.date}</td>
                      <td>{r.description}</td>
                      <td>{formatINR(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button disabled={busy} onClick={() => void upload(true)}>
              Import all valid rows
            </button>
          </>
        )}
      </section>
      <section className="card">
        <PageHeader>
          <h2>Import history</h2>
          {canWrite && (
            <button className="secondary" onClick={() => setUndo(true)}>
              Undo last import
            </button>
          )}
        </PageHeader>
        <Dialog.Root open={undo} onOpenChange={setUndo}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content">
              <Dialog.Title>Undo last import?</Dialog.Title>
              <Dialog.Description>
                Only transactions created by the latest import will be removed. Duplicate records
                remain. Classified transactions must be unlinked first. The original statement is
                retained.
              </Dialog.Description>
              <div className="actions">
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const { data, error } = await client.rpc('undo_last_import', { p_org: org });
                    if (error) toast.error(error.message);
                    else {
                      toast.success(`${data} imported transactions removed`);
                      setUndo(false);
                      await cache.invalidateQueries({ queryKey: ['imports'] });
                      await cache.invalidateQueries({ queryKey: ['records'] });
                    }
                    setBusy(false);
                  }}
                >
                  Confirm undo
                </button>
                <Dialog.Close asChild>
                  <button className="secondary">Cancel</button>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        {history.error ? (
          <p role="alert">{history.error.message}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Imported</th>
                <th>Duplicates skipped</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.created_at).toLocaleString()}</td>
                  <td>{h.imported}</td>
                  <td>{h.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
