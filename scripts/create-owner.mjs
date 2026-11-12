import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const email = process.argv[2];
if (!email || !email.includes('@')) throw new Error('Supply the owner email address');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) throw new Error('Supabase configuration is missing');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw new Error(error.message);
  if (data.users.some((user) => user.email?.toLowerCase() === email.toLowerCase())) {
    throw new Error('This account already exists. Its password was not changed.');
  }
  if (data.users.length < 100) break;
}
const password = `Cl!9${randomBytes(18).toString('base64url')}`;
const { error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createError) throw new Error(createError.message);
// Emit the generated credential once so it remains deliverable if onboarding fails.
console.log(JSON.stringify({ accountCreated: true, email, password }));
const client = createClient(url, anonKey, options);
const { error: loginError } = await client.auth.signInWithPassword({ email, password });
if (loginError)
  throw new Error(`Account created, but sign-in verification failed: ${loginError.message}`);
const { data: org, error: orgError } = await client.rpc('create_organization', {
  p_name: 'SREE VIJEYA GANAPATHI AND CO',
});
if (orgError)
  throw new Error(`Sign-in verified, but organisation setup failed: ${orgError.message}`);
const { data: role, error: roleError } = await client.rpc('org_role', { org });
if (roleError || role !== 'owner') throw new Error('Owner membership verification failed');
console.log(JSON.stringify({ signInVerified: true, role, organizationCreated: true }));
await client.auth.signOut();
