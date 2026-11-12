'use client';
import { SupabaseClient } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { downloadBlob } from '../lib/download';
export function Attachments({
  client,
  org,
  invoice,
  transaction,
  canWrite,
}: {
  client: SupabaseClient;
  org: string;
  invoice?: string;
  transaction?: string;
  canWrite: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const cache = useQueryClient();
  const files = useQuery({
    queryKey: ['files', org, invoice, transaction],
    queryFn: async () => {
      const { data, error } = await client
        .from('files')
        .select('id,original_name,storage_path')
        .eq('organization_id', org)
        .eq(transaction ? 'transaction_id' : 'invoice_id', transaction ?? invoice ?? '');
      if (error) throw error;
      return data;
    },
  });
  return (
    <section>
      <h3>{transaction ? 'Receipt attachments' : 'Invoice attachments'}</h3>
      {files.error && <p role="alert">{files.error.message}</p>}
      <ul>
        {files.data?.map((file) => (
          <li key={file.id}>
            <button
              className="secondary"
              disabled={!!downloading}
              onClick={async () => {
                setDownloading(file.id);
                try {
                  const { data, error } = await client.storage
                    .from(transaction ? 'receipts' : 'invoices')
                    .download(file.storage_path);
                  if (error) throw error;
                  downloadBlob(data, file.original_name);
                } catch (error) {
                  toast.error(`Download failed: ${(error as Error).message}`);
                } finally {
                  setDownloading(null);
                }
              }}
            >
              {downloading === file.id ? 'Downloading…' : `Download ${file.original_name}`}
            </button>
          </li>
        ))}
      </ul>
      {canWrite && (
        <label>
          Upload PDF, PNG or JPEG (10 MB maximum)
          <input
            type="file"
            disabled={busy}
            accept="application/pdf,image/png,image/jpeg"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                const form = new FormData();
                form.set('file', file);
                form.set('organization_id', org);
                form.set(
                  transaction ? 'transaction_id' : 'invoice_id',
                  transaction ?? invoice ?? '',
                );
                const { data } = await client.auth.getSession();
                const response = await fetch('/api/attachments', {
                  method: 'POST',
                  body: form,
                  headers: { Authorization: `Bearer ${data.session?.access_token}` },
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                await cache.invalidateQueries({ queryKey: ['files', org, invoice] });
                toast.success('Attachment uploaded');
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      )}
    </section>
  );
}
