import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function PortalResetPassword() {
  const [token] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return query.get('token') || query.get('reset_token') || '';
  });
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async event => {
    event.preventDefault();
    if (busy || done || !token) return;
    setError('');
    if (password !== confirmation) {
      setError('Your passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      // Base44 validates token expiry and enforces single use server-side.
      await base44.auth.resetPassword({ resetToken: token, newPassword: password });
      setDone(true);
      setPassword('');
      setConfirmation('');
      window.history.replaceState({}, '', '/reset-password');
    } catch (err) {
      const status = err.status || err.response?.status;
      setError(status === 422
        ? 'That password does not meet the account requirements. Try a longer password.'
        : status === 429
          ? 'Too many attempts. Wait a moment before trying again.'
          : 'This reset could not be completed. The link may be expired or already used. Request a new reset email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-slate-900">{done ? 'Password updated' : 'Set your new password'}</h1>
        <p className="mt-2 mb-6 text-sm text-slate-600">Elite Engine Development Customer Portal</p>
        {done ? (
          <><p role="status" className="mb-5 text-slate-700">Your password has been changed. Sign in with your new password.</p><Button className="w-full min-h-11 bg-[#e20404] text-white" onClick={() => window.location.assign('/PortalAccess')}>Back to Sign In</Button></>
        ) : !token ? (
          <p role="alert" className="mb-5 text-slate-700">Open the link in your password reset email. If you do not have a valid link, request a new email below.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div><Label htmlFor="reset-password">New password</Label><Input id="reset-password" type="password" autoComplete="new-password" required value={password} disabled={busy} onChange={e => setPassword(e.target.value)} className="mt-1 h-11" /></div>
            <div><Label htmlFor="reset-confirmation">Confirm new password</Label><Input id="reset-confirmation" type="password" autoComplete="new-password" required value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} className="mt-1 h-11" /></div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full min-h-11 bg-[#e20404] hover:bg-red-700 text-white">{busy ? 'Updating password…' : 'Update password'}</Button>
          </form>
        )}
        {!done && <><Button variant="outline" className="mt-4 w-full min-h-11" disabled={busy} onClick={() => window.location.assign('/forgot-password')}>Request a new reset email</Button><Button variant="ghost" className="mt-2 w-full min-h-11" disabled={busy} onClick={() => window.location.assign('/PortalAccess')}>Back to Sign In</Button></>}
      </section>
    </main>
  );
}
