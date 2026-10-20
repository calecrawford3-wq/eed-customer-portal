import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { portalDestination } from '@/lib/portal-entry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function PortalAccess({ initialMode }) {
  const { user, isLoadingAuth, isLoadingPublicSettings } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const destination = portalDestination(params.get('next'), window.location.origin);
  const [mode, setMode] = useState(initialMode || (params.get('mode') === 'activate' ? 'activate' : 'signin'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    const update = () => setResendSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  useEffect(() => {
    if (user && !isLoadingAuth) window.location.replace(destination);
  }, [user, isLoadingAuth, destination]);

  const changeMode = next => {
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmation('');
    setCode('');
  };

  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    const address = email.trim();
    if (mode === 'activate' && password !== confirmation) {
      setError('Your passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'activate') {
        await base44.auth.register({ email: address, password });
        setMode('verify');
        setResendAt(Date.now() + 60000);
        setNotice('Check your email for a verification code.');
      } else if (mode === 'verify') {
        await base44.auth.verifyOtp({ email: address, otpCode: code.trim() });
        try {
          await base44.auth.loginViaEmailPassword(address, password);
        } catch {
          changeMode('signin');
          setNotice('Your email is verified. Sign in with your password to open the portal.');
          return;
        }
        setPassword('');
        setConfirmation('');
        window.location.assign(destination);
      } else if (mode === 'forgot') {
        await base44.auth.resetPasswordRequest(address);
        setNotice('If this email has an account, you will receive password reset instructions. Check your spam folder too.');
      } else {
        await base44.auth.loginViaEmailPassword(address, password);
        setPassword('');
        window.location.assign(destination);
      }
    } catch (err) {
      const status = err.status || err.response?.status;
      setError(status === 429
        ? 'Too many attempts. Please wait before trying again.'
        : mode === 'verify'
          ? 'Verification could not be completed. Check the code or request a new one. If already verified, return to Sign In.'
          : mode === 'activate'
            ? 'Account creation could not be completed. If you already registered, choose Sign In or Forgot Password. Otherwise check your invitation email address and try again.'
            : mode === 'forgot'
              ? 'Unable to request a reset right now. Please try again.'
              : 'Unable to sign in. Check your email and password, or use Forgot Password.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || Date.now() < resendAt) return;
    setBusy(true);
    setError('');
    try {
      await base44.auth.resendOtp(email.trim());
      setResendAt(Date.now() + 60000);
      setNotice('A new verification code was requested. Check your inbox and spam folder.');
    } catch {
      setError('Unable to resend the code. Please wait a minute and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoadingAuth || isLoadingPublicSettings || user) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 flex flex-col items-center justify-center gap-4 text-white" role="status">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-red-500" />
        <p>Opening your portal…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-xl">
        <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png" alt="Elite Engine Development" className="h-12 max-w-full object-contain mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-slate-900">{mode === 'activate' ? 'Activate your portal' : mode === 'verify' ? 'Verify your email' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}</h1>
        <p className="mt-2 mb-6 text-sm text-slate-600">{mode === 'activate' ? 'Use the email address on your shop invitation. Choose a password, then enter the code we email you.' : mode === 'verify' ? `Enter the code sent to ${email}. Keep this page open while checking your email.` : mode === 'forgot' ? 'Enter the email address you used to register.' : 'Sign in to see your engines, estimates, invoices, and inspection findings.'}</p>
        <form onSubmit={submit} className="space-y-4">
          <div><Label htmlFor="portal-email">Email address</Label><Input id="portal-email" type="email" autoComplete="email" required value={email} disabled={busy} onChange={e => setEmail(e.target.value)} className="mt-1 h-11" /></div>
          {mode !== 'forgot' && <div><Label htmlFor="portal-password">{mode === 'activate' ? 'Create a password' : 'Password'}</Label><Input id="portal-password" type="password" autoComplete={mode === 'activate' ? 'new-password' : 'current-password'} required value={password} disabled={busy} onChange={e => setPassword(e.target.value)} className="mt-1 h-11" /></div>}
          {mode === 'activate' && <div><Label htmlFor="portal-confirm">Confirm password</Label><Input id="portal-confirm" type="password" autoComplete="new-password" required value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} className="mt-1 h-11" /></div>}
          {mode === 'verify' && <div><Label htmlFor="portal-code">Email verification code</Label><Input id="portal-code" inputMode="numeric" autoComplete="one-time-code" required value={code} disabled={busy} onChange={e => setCode(e.target.value)} className="mt-1 h-11" /></div>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
          <Button type="submit" disabled={busy} className="w-full min-h-11 bg-[#e20404] hover:bg-red-700 text-white">{busy ? 'Please wait…' : mode === 'activate' ? 'Create account & send code' : mode === 'verify' ? 'Verify & open portal' : mode === 'forgot' ? 'Email reset instructions' : 'Sign In'}</Button>
        </form>
        <div className="mt-4 space-y-2">
          {mode !== 'signin' && <Button variant="outline" className="w-full min-h-11" disabled={busy} onClick={() => changeMode('signin')}>Already registered? Sign In</Button>}
          {mode === 'signin' && <><Button variant="outline" className="w-full min-h-11" disabled={busy} onClick={() => changeMode('activate')}>First time here? Activate Account</Button><Button variant="ghost" className="w-full min-h-11" disabled={busy} onClick={() => changeMode('forgot')}>Forgot Password?</Button></>}
          {mode === 'signin' && <Button variant="ghost" className="w-full min-h-11" disabled={busy} onClick={() => changeMode('verify')}>Already have a verification code?</Button>}
          {mode === 'verify' && <Button variant="ghost" className="w-full min-h-11" disabled={busy || resendSeconds > 0 || !email.trim()} onClick={resend}>{resendSeconds > 0 ? `Request another code in ${resendSeconds}s` : 'Email me a new code'}</Button>}
          <Button variant="ghost" className="w-full min-h-11 whitespace-normal" disabled={busy} onClick={() => base44.auth.redirectToLogin(new URL(destination, window.location.origin).href)}>Use standard sign-in instead</Button>
        </div>
        <p className="mt-5 text-xs text-slate-500">An invitation from the shop and a portal login are separate. If you already created a password, sign in instead of creating another account.</p>
      </section>
    </main>
  );
}
