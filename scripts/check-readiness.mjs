// Read-only checks; never print credentials or financial records.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Supabase environment variables are missing');
for (const table of [
  'organizations',
  'memberships',
  'invoice_financials',
  'transaction_financials',
  'import_history',
]) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log(`${table}: HTTP ${response.status}`);
  if (!response.ok) process.exitCode = 1;
}
console.log(
  'This checks endpoint availability only. Authenticated workflows and RLS still require acceptance testing.',
);
