import { authenticatedClient } from '@/src/lib/supabase/request-client';
import { parseWorkbook } from '@/src/lib/parse-workbook';
export async function POST(request: Request) {
  try {
    const client = await authenticatedClient(request);
    if (!client) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const form = await request.formData();
    const file = form.get('file'),
      org = form.get('organization_id'),
      bank = form.get('bank_account_id');
    if (!(file instanceof File) || typeof org !== 'string' || typeof bank !== 'string')
      return Response.json({ error: 'Choose a statement and bank account' }, { status: 400 });
    const { data: role } = await client.rpc('org_role', { org });
    if (!role || !['owner', 'accountant'].includes(role))
      return Response.json({ error: 'Write access required' }, { status: 403 });
    const rows = await parseWorkbook(file);
    if (!rows.length) throw new Error('No valid transactions found.');
    const path = `${org}/${crypto.randomUUID()}.${file.name.split('.').pop()?.toLowerCase()}`;
    const { error: uploadError } = await client.storage
      .from('statements')
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (uploadError) throw uploadError;
    const { data, error } = await client.rpc('import_statement', {
      p_org: org,
      p_bank: bank,
      p_path: path,
      p_name: file.name,
      p_rows: rows,
    });
    if (error) {
      await client.storage.from('statements').remove([path]);
      throw error;
    }
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error).message ?? 'Import failed' }, { status: 400 });
  }
}
