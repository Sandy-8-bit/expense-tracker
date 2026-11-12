'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setMessage('Configure the Supabase URL and anon key in .env.local.');
      return;
    }
    setBusy(true);
    try {
      const client = createBrowserClient(url, key);
      const { error } = await client.auth.signInWithPassword({
        email: String(values.get('email')),
        password: String(values.get('password')),
      });
      if (error) setMessage(error.message);
      else router.push('/dashboard');
    } catch {
      setMessage('Unable to connect. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen bg-[#f0f4f2] text-[#0f1f2e] md:grid-cols-2">
      <section className="flex flex-col justify-between bg-[#0a2124] p-10 text-white md:p-16">
        <strong className="text-xl tracking-tight">ClearLedger</strong>
        <div className="py-20">
          <p className="mb-6 text-xs tracking-widest text-[#5fd3bd]">YOUR BUSINESS, IN BALANCE</p>
          <h1 className="text-5xl leading-tight font-semibold tracking-tight">
            Every invoice.
            <br />
            Every payment.
            <br />
            <span className="text-[#5fd3bd]">One clear view.</span>
          </h1>
          <p className="mt-8 max-w-sm leading-relaxed text-slate-300">
            Bring invoices, bank receipts and business expenses into one place.
          </p>
        </div>
        <p className="text-xs text-slate-400">ClearLedger · Business finance</p>
      </section>
      <section className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h2 className="text-3xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-3 text-sm text-slate-500">Sign in with your organisation account.</p>
          <form onSubmit={login} className="mt-10 grid gap-5">
            <label className="grid gap-2 text-sm font-medium">
              Email address
              <input
                className="rounded-lg border border-[#dfe7e3] bg-white p-3 focus:outline-2 focus:outline-[#0b7a6b]"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Password
              <input
                className="rounded-lg border border-[#dfe7e3] bg-white p-3 focus:outline-2 focus:outline-[#0b7a6b]"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button
              className="rounded-lg bg-[#0b7a6b] p-3 font-semibold text-white hover:bg-[#075e52] disabled:opacity-50"
              disabled={busy}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          {message && (
            <p role="status" className="mt-5 rounded-lg bg-white p-4 text-sm">
              {message}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
