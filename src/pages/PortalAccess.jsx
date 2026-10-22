import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { portalDestination } from '@/lib/portal-entry';
import {postLoginDestination} from '@/lib/post-login-destination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {usePublicCompanyLogo} from '@/hooks/useCompanyLogo';

export default function PortalAccess({ initialMode }) {
  const { user, isLoadingAuth, isLoadingPublicSettings } = useAuth();
  const {logoUrl}=usePublicCompanyLogo('light');
  const params = new URLSearchParams(window.location.search);
  const destination = portalDestination(params.get('next'), window.location.origin);
  const [mode, setMode] = useState(initialMode || (['activate', 'forgot', 'signin'].includes(params.get('mode')) ? params.get('mode') : 'signin'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const isVerification = mode === 'verify';

  useEffect(() => {
    const update = () => setResendSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  useEffect(() => {
    if (user && !isLoadingAuth) {
      let live=true;
      postLoginDestination(destination).then(path=>{if(live)window.location.replace(path)}).catch(err=>{if(live)setError(err.message||'Unable to open your workspace')});
      return ()=>{live=false};
    }
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
        setResendSeconds(60);
        setNotice('We sent a verification code to your email. Enter it below to activate your account.');
      } else if (mode === 'verify') {
        await base44.auth.verifyOtp({ email: address, otpCode: code.trim() });
        try {
          if (!password) throw new Error('Password not present after returning to verification');
          await base44.auth.loginViaEmailPassword(address, password);
        } catch {
          changeMode('signin');
          setNotice('Your email is verified. Sign in with your password to open the portal.');
          return;
        }
        setPassword('');
        setConfirmation('');
        window.location.assign(await postLoginDestination(destination));
      } else if (mode === 'forgot') {
        await base44.auth.resetPasswordRequest(address);
        setNotice('If this email has an account, you will receive password reset instructions. Check your spam folder too.');
      } else {
        await base44.auth.loginViaEmailPassword(address, password);
        setPassword('');
        window.location.assign(await postLoginDestination(destination));
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
      setResendSeconds(60);
      setNotice('A new verification code was requested. Check your inbox and spam folder.');
    } catch {
      setError('Unable to resend the code. Please wait a minute and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoadingAuth || isLoadingPublicSettings || (user && !error)) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 flex flex-col items-center justify-center gap-4 text-white" role="status">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-red-500" />
        <p>Opening your portal…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-none sm:shadow-xl">
        <img src={logoUrl} alt="Elite Engine Development" className="h-12 max-w-full object-contain mx-auto mb-6" />
        <div className="mb-5 flex items-center gap-2 text-xs font-semibold text-slate-600" aria-label={`Account activation step ${isVerification ? 2 : 1} of 2`}>
          <span className={`rounded-full px-3 py-1 ${isVerification ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>1. Account details</span>
          <span aria-hidden="true">→</span>
          <span className={`rounded-full px-3 py-1 ${isVerification ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-500'}`}>2. Verify email</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{mode === 'activate' ? 'Create your portal password' : mode === 'verify' ? 'Verify your email' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}</h1>
        <p className="mt-2 mb-6 text-sm text-slate-600">{mode === 'activate' ? 'Use the email address on your shop invitation. Choose a password, then enter the code we email you.' : mode === 'verify' ? `Enter the code sent to ${email}. Keep this page open while checking your email.` : mode === 'forgot' ? 'Enter the email address you used to register.' : 'Sign in to see your engines, estimates, invoices, and inspection findings.'}</p>
        <form onSubmit={submit} className="space-y-4">
          {!isVerification && <div><Label htmlFor="portal-email">Email address</Label><Input id="portal-email" type="email" autoComplete="email" required value={email} disabled={busy} onChange={e => setEmail(e.target.value)} className="mt-1 h-11" /></div>}
          {isVerification && <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="block text-slate-500">Code sent to</span><strong className="break-all text-slate-900">{email}</strong></div>}
          {mode !== 'forgot' && !isVerification && <div><Label htmlFor="portal-password">{mode === 'activate' ? 'Create a password' : 'Password'}</Label><Input id="portal-password" type="password" autoComplete={mode === 'activate' ? 'new-password' : 'current-password'} required value={password} disabled={busy} onChange={e => setPassword(e.target.value)} className="mt-1 h-11" /></div>}
          {mode === 'activate' && <div><Label htmlFor="portal-confirm">Confirm password</Label><Input id="portal-confirm" type="password" autoComplete="new-password" required value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} className="mt-1 h-11" /></div>}
          {isVerification && <div><Label htmlFor="portal-code">Email verification code</Label><Input id="portal-code" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus required value={code} disabled={busy} onChange={e => setCode(e.target.value.replace(/\s/g, ''))} placeholder="Enter the code from your email" className="mt-1 h-12 text-center text-lg tracking-widest" /></div>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
          <Button type="submit" disabled={busy} className="w-full min-h-11 bg-[#e20404] hover:bg-red-700 text-white">{busy ? 'Please wait…' : mode === 'activate' ? 'Create account & send code' : mode === 'verify' ? 'Verify & open portal' : mode === 'forgot' ? 'Email reset instructions' : 'Sign In'}</Button>
        </form>
        <div className="mt-4 space-y-2">
          {mode !== 'signin' && <Button variant="outline" className="w-full min-h-11" disabled={busy} onClick={() => changeMode('signin')}>{isVerification ? 'Back to sign in' : 'Already registered? Sign In'}</Button>}
          {mode === 'signin' && <><Button variant="outline" className="w-full min-h-11" disabled={busy} onClick={() => changeMode('activate')}>First time here? Activate Account</Button><Button variant="ghost" className="w-full min-h-11" disabled={busy} onClick={() => changeMode('forgot')}>Forgot Password?</Button></>}
          {mode === 'signin' && <Button variant="ghost" className="w-full min-h-11" disabled={busy} onClick={() => changeMode('verify')}>Already have a verification code?</Button>}
          {isVerification && <div className="rounded-lg bg-slate-50 p-3 text-center" aria-live="polite">
            <p className="text-sm text-slate-600">{resendSeconds > 0 ? `You can resend your code in ${Math.floor(resendSeconds / 60)}:${String(resendSeconds % 60).padStart(2, '0')}` : 'Did not receive your verification code?'}</p>
            <Button type="button" variant="ghost" className="w-full min-h-11" disabled={busy || resendSeconds > 0 || !email.trim()} onClick={resend}>{resendSeconds > 0 ? 'Resend code (waiting)' : 'Resend verification code'}</Button>
          </div>}
          <Button variant="ghost" className="w-full min-h-11 whitespace-normal" disabled={busy} onClick={() => base44.auth.redirectToLogin(new URL(destination, window.location.origin).href)}>Use standard sign-in instead</Button>
        </div>
        <p className="mt-5 text-xs text-slate-500">Your identity and email verification are checked by Base44. This link does not verify your identity or reset an existing password. If you already registered, choose Sign In.</p>
      </section>
    </main>
  );
}
