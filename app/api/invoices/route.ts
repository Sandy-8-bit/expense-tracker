import { authenticatedClient } from '@/src/lib/supabase/request-client';
import { invoiceSchema } from '@/src/lib/schemas';
export async function POST(request: Request) {
  try {
    const client = await authenticatedClient(request);
    if (!client) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const body = await request.json();
    const parsed = invoiceSchema.safeParse(body.invoice);
    if (!parsed.success)
      return Response.json(
        { error: parsed.error.issues.map((i) => i.message).join('; ') },
        { status: 400 },
      );
    const { data, error } = await client.rpc('save_invoice', {
      p_org: body.organization_id,
      p_data: parsed.data,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ id: data });
  } catch {
    return Response.json({ error: 'Unable to save invoice' }, { status: 400 });
  }
}
