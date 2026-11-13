import React, { useState } from 'react';
import { ShieldCheck, UserRound, ArrowRight } from 'lucide-react';
import { loginStaffUser } from '../services/staffAuth';

export default function LoginView({ onLoginSuccess, onOpenAdmin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const user = await loginStaffUser(username, password);
      if (!user) {
        setError('Invalid username or password. Contact your administrator if you need access.');
        setLoading(false);
        return;
      }

      onLoginSuccess?.(user);
    } catch (err) {
      console.error('Staff login failed:', err);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl lg:grid-cols-2">
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 p-8 text-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-2xl font-black text-emerald-100">Rx</div>
          <p className="mt-6 text-xs uppercase tracking-[0.25em] text-emerald-200">Secure access</p>
          <h1 className="mt-3 text-3xl font-extrabold">Pharmacy POS</h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-200">
            Staff users can log in with their own credentials to handle sales, inventory, customer service, and pharmacy operations.
          </p>

          <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm text-slate-100">
            <div className="flex items-center gap-2 font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Staff access
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              Use the individual login credentials provided by your administrator.
            </p>
          </div>
        </div>

        <div className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <UserRound className="h-6 w-6 text-emerald-600" />
            <div>
              <h2 className="text-xl font-bold text-slate-800">Sign in</h2>
              <p className="text-sm text-slate-500">Use your staff username and password.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block text-sm font-medium text-slate-700">
              Username
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                placeholder="Enter your username"
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                placeholder="Enter your password"
                required
              />
            </label>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-400"
            >
              {loading ? 'Signing in...' : 'Login'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => onOpenAdmin?.()}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Admin login
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
