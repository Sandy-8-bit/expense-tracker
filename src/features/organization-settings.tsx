'use client';
import { SupabaseClient } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { organizationSchema } from '../lib/schemas';
import { toast } from 'sonner';
export function OrganizationSettings({ client, org }: { client: SupabaseClient; org: string }) {
  const [open, setOpen] = useState(false);
  const cache = useQueryClient();
  const settings = useQuery({
    queryKey: ['settings', org],
    queryFn: async () => {
      const { data, error } = await client
        .from('organizations')
        .select('name,invoice_prefix,payment_terms')
        .eq('id', org)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const form = useForm<z.infer<typeof organizationSchema>>({
    resolver: zodResolver(organizationSchema),
    values: settings.data ?? { name: '', invoice_prefix: 'INV-', payment_terms: 30 },
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      const { data } = await client.auth.getSession();
      const response = await fetch('/api/organization', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session?.access_token}`,
        },
        body: JSON.stringify({ organization_id: org, settings: values }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await cache.invalidateQueries({ queryKey: ['settings'] });
      await cache.invalidateQueries({ queryKey: ['memberships'] });
      toast.success('Organisation settings saved');
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  });
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="secondary">Organisation settings</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title>Organisation settings</Dialog.Title>
          <Dialog.Description>
            New invoices use this prefix and payment period. Existing invoices keep their numbers
            and dates.
          </Dialog.Description>
          {settings.error ? (
            <p role="alert">{settings.error.message}</p>
          ) : (
            <form onSubmit={submit}>
              <div className="form-grid">
                <label>
                  Organisation name
                  <input {...form.register('name')} />
                  <span role="alert">{form.formState.errors.name?.message}</span>
                </label>
                <label>
                  Invoice prefix
                  <input {...form.register('invoice_prefix')} />
                  <span role="alert">{form.formState.errors.invoice_prefix?.message}</span>
                </label>
                <label>
                  Payment terms (days)
                  <input
                    type="number"
                    {...form.register('payment_terms', { valueAsNumber: true })}
                  />
                  <span role="alert">{form.formState.errors.payment_terms?.message}</span>
                </label>
              </div>
              <div className="actions">
                <button disabled={form.formState.isSubmitting}>Save settings</button>
                <Dialog.Close asChild>
                  <button className="secondary" type="button">
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
