import React, { useState } from 'react';
import { ArrowLeft, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { completeAdminPasswordReset, getAdminCredentials, issueAdminPasswordResetCode } from '../config/adminConfig';

export default function AdminForgotPasswordView({ onNavigate }) {
  const adminCreds = getAdminCredentials();
  const [deliveryTarget, setDeliveryTarget] = useState(adminCreds.email);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [resetCode, setResetCode] = useState('');

  const handleRequestCode = async (event) => {
    event.preventDefault();

    try {
      const generatedCode = await issueAdminPasswordResetCode(deliveryTarget, secret);
      setResetCode(generatedCode);
      setStatus({
        type: 'success',
        message: `Reset code sent to ${deliveryTarget}. Use the code below to continue.`,
      });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'The reset request could not be processed.' });
      setResetCode('');
    }
  };

  const handleSubmitNewPassword = async (event) => {
    event.preventDefault();

    if (!code.trim()) {
      setStatus({ type: 'error', message: 'Please enter the reset code you received.' });
      return;
    }

    if (newPassword.trim().length < 6) {
      setStatus({ type: 'error', message: 'New password must be at least 6 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    try {
      await completeAdminPasswordReset({
        deliveryTarget,
        secret,
        code,
        newPassword,
      });

      setStatus({
        type: 'success',
        message: 'Password reset successful. Please login with your new admin password.',
      });
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setResetCode('');
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Password reset failed.' });
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="grid lg:grid-cols-[1fr_1.2fr]">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 p-8 text-white">
            <button
              type="button"
              onClick={() => onNavigate?.('admin')}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm transition hover:bg-white/10"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to admin login
            </button>

            <div className="mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-2xl font-black text-emerald-100">Rx</div>
            <p className="mt-6 text-xs uppercase tracking-[0.25em] text-emerald-200">Password recovery</p>
            <h1 className="mt-3 text-3xl font-extrabold">Reset your admin password</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-200">
              Use your registered email or mobile number and the environment reset secret to receive a secure one-time code and create a new password.
            </p>

            <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm text-slate-100">
              <div className="flex items-center gap-2 font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                Registered contact details
              </div>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                  <span>Email</span>
                  <span className="font-medium text-white">{adminCreds.email}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Mobile</span>
                  <span className="font-medium text-white">{adminCreds.mobile}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="mb-6 flex items-center gap-3">
              <KeyRound className="h-6 w-6 text-emerald-600" />
              <div>
                <h2 className="text-xl font-bold text-slate-800">Recovery form</h2>
                <p className="text-sm text-slate-500">Enter your email or mobile, then verify the code.</p>
              </div>
            </div>

            <form onSubmit={handleRequestCode} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="block text-sm font-medium text-slate-700">
                Registered email or mobile
                <input
                  type="text"
                  value={deliveryTarget}
                  onChange={(event) => setDeliveryTarget(event.target.value)}
                  className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                  placeholder="admin@pharmacy.local or +92-300-0000000"
                  required
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Reset secret from .env
                <input
                  type="text"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                  placeholder="Enter the configured reset secret"
                  required
                />
              </label>

              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-500"
              >
                Send reset code
              </button>
            </form>

            {resetCode && (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <div className="flex items-center gap-2 font-semibold">
                  <Mail className="h-4 w-4" />
                  One-time reset code
                </div>
                <div className="mt-2 text-2xl font-black tracking-[0.5em]">{resetCode}</div>
                <p className="mt-2 text-xs text-amber-700">Use this code in the form below to confirm the password reset.</p>
              </div>
            )}

            <form onSubmit={handleSubmitNewPassword} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
              <label className="block text-sm font-medium text-slate-700">
                Code received
                <input
                  type="text"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                  placeholder="Enter 6-digit code"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                New password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                  placeholder="Choose a new password"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Confirm password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                  placeholder="Repeat the password"
                />
              </label>

              {status.message && (
                <div className={`rounded-xl border px-3 py-2 text-sm ${status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                  {status.message}
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Update password
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
