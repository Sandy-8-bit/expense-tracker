'use client';
import { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { formatINR } from '../lib/money';

export function MatchMetrics({ client, org }: { client: SupabaseClient; org: string }) {
  const result = useQuery({
    queryKey: ['match-metrics', org],
    queryFn: async () => {
      const [credits, pending, closed] = await Promise.all([
        client
          .from('bank_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org)
          .gt('amount', 0),
        client
          .from('transaction_financials')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org)
          .gt('amount', 0)
          .gt('unassigned', 0),
        client
          .from('invoice_financials')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org)
          .eq('status', 'Closed'),
      ]);
      for (const response of [credits, pending, closed]) if (response.error) throw response.error;
      let balance = new Decimal(0);
      for (let offset = 0; ; offset += 500) {
        const response = await client
          .from('invoice_financials')
          .select('pending')
          .eq('organization_id', org)
          .order('id')
          .range(offset, offset + 499);
        if (response.error) throw response.error;
        for (const invoice of response.data) balance = balance.plus(invoice.pending);
        if (response.data.length < 500) break;
      }
      return [
        ['Bank credits', String(credits.count ?? 0)],
        ['Needs classification', String(pending.count ?? 0)],
        ['Invoices closed', String(closed.count ?? 0)],
        ['Invoice balances pending', formatINR(balance)],
      ];
    },
  });
  if (result.error) return <p role="alert">{result.error.message}</p>;
  return (
    <div className="metric-grid" aria-busy={result.isPending}>
      {result.data?.map(([label, value]) => (
        <div className="metric" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
