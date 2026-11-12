import { authenticatedClient } from '@/src/lib/supabase/request-client';
import { organizationSchema } from '@/src/lib/schemas';
export async function PATCH(request: Request) {
  try {
    const client = await authenticatedClient(request);
    if (!client) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const body = await request.json();
    const parsed = organizationSchema.safeParse(body.settings);
    if (!parsed.success)
      return Response.json(
        { error: parsed.error.issues.map((i) => i.message).join('; ') },
        { status: 400 },
      );
    const { data: role } = await client.rpc('org_role', { org: body.organization_id });
    if (role !== 'owner') return Response.json({ error: 'Owner access required' }, { status: 403 });
    const { error } = await client
      .from('organizations')
      .update(parsed.data)
      .eq('id', body.organization_id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
