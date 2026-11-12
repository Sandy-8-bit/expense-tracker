import { authenticatedClient } from '@/src/lib/supabase/request-client';
export async function POST(request: Request) {
  try {
    const client = await authenticatedClient(request);
    if (!client) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const form = await request.formData();
    const org = form.get('organization_id'),
      invoice = form.get('invoice_id'),
      transaction = form.get('transaction_id'),
      file = form.get('file');
    const receipt = typeof transaction === 'string';
    if (
      typeof org !== 'string' ||
      (!receipt && typeof invoice !== 'string') ||
      (receipt && typeof invoice === 'string') ||
      !(file instanceof File)
    )
      throw new Error('Choose a file and exactly one invoice or transaction');
    const bucket = receipt ? 'receipts' : 'invoices';
    if (
      file.size > 10 * 1024 * 1024 ||
      !['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)
    )
      throw new Error('Choose a PDF, PNG or JPEG up to 10 MB.');
    const { data: role } = await client.rpc('org_role', { org });
    if (!['owner', 'accountant'].includes(role))
      return Response.json({ error: 'Write access required' }, { status: 403 });
    const { data: parent } = await client
      .from(receipt ? 'bank_transactions' : 'invoices')
      .select('id')
      .eq('organization_id', org)
      .eq('id', receipt ? transaction : invoice)
      .single();
    if (!parent) throw new Error('Parent record not found');
    const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${org}/${crypto.randomUUID()}.${ext}`;
    const { error: upload } = await client.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type });
    if (upload) throw upload;
    const { error } = await client.from('files').insert({
      organization_id: org,
      invoice_id: receipt ? null : invoice,
      transaction_id: receipt ? transaction : null,
      kind: receipt ? 'receipt' : 'invoice',
      storage_path: path,
      original_name: file.name,
    });
    if (error) {
      await client.storage.from(bucket).remove([path]);
      throw error;
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
