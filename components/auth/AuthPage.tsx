/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { useAuth } from '../../lib/auth';
import './auth-page.css';

type AuthView = 'signin' | 'signup' | 'reset';

export default function AuthPage() {
  const { signInWithPassword, signUp, sendPasswordResetEmail, signInWithGoogle } = useAuth();
  const [view, setView] = useState<AuthView>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const goTo = (next: AuthView) => {
    setView(next);
    setMessage(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      if (view === 'signin') {
        await signInWithPassword(email, password);
        setMessage({ text: 'Signed in successfully — loading translator...', type: 'success' });
      } else if (view === 'signup') {
        if (password !== confirmPassword) {
          setMessage({ text: 'Passwords do not match.', type: 'error' });
          return;
        }
        await signUp(email, password);
        setMessage({ text: 'Account created successfully — loading translator...', type: 'success' });
      } else {
        await sendPasswordResetEmail(resetEmail);
        setMessage({ text: 'Password reset email sent. Check your inbox.', type: 'success' });
      }
    } catch (error) {
      setMessage({ text: (error as Error).message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setMessage(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
      setMessage({ text: 'Google sign-in successful — loading translator...', type: 'success' });
    } catch (error) {
      setMessage({ text: (error as Error).message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <main className="auth-shell">
        <section className="auth-card">
          <div className="logo-wrapper">
            <img src="https://dual.eburon.ai/logo.png" alt="Dual Translate logo" />
          </div>

          {message && <div className={`message show ${message.type}`}>{message.text}</div>}

          {view === 'signin' && (
            <section className="page active">
              <h1>Welcome back</h1>
              <p className="subtitle">Sign in to continue to Dual Translate.</p>
              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label htmlFor="signinEmail">Email address</label>
                  <input
                    id="signinEmail"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="signinPassword">Password</label>
                  <div className="input-wrap">
                    <PasswordInput
                      id="signinPassword"
                      value={password}
                      onChange={setPassword}
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="forgot-row">
                    <a onClick={() => goTo('reset')}>Forgot password?</a>
                  </div>
                </div>
                <button className="main-btn" type="submit" disabled={submitting}>
                  {submitting ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
              <div className="divider">or</div>
              <button className="google-btn" type="button" onClick={handleGoogle} disabled={submitting}>
                <span className="google-mark">G</span>
                Continue with Google
              </button>
              <p className="switch-text">
                New here? <a onClick={() => goTo('signup')}>Create an account</a>
              </p>
            </section>
          )}

          {view === 'signup' && (
            <section className="page active">
              <h1>Create account</h1>
              <p className="subtitle">Sign up to continue to Dual Translate.</p>
              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label htmlFor="signupEmail">Email address</label>
                  <input
                    id="signupEmail"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="signupPassword">Password</label>
                  <div className="input-wrap">
                    <PasswordInput
                      id="signupPassword"
                      value={password}
                      onChange={setPassword}
                      autoComplete="new-password"
                      minLength={6}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="signupConfirmPassword">Confirm password</label>
                  <div className="input-wrap">
                    <PasswordInput
                      id="signupConfirmPassword"
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      autoComplete="new-password"
                      minLength={6}
                    />
                  </div>
                </div>
                <button className="main-btn" type="submit" disabled={submitting}>
                  {submitting ? 'Creating account...' : 'Create Account'}
                </button>
              </form>
              <div className="divider">or</div>
              <button className="google-btn" type="button" onClick={handleGoogle} disabled={submitting}>
                <span className="google-mark">G</span>
                Continue with Google
              </button>
              <p className="switch-text">
                Already have an account? <a onClick={() => goTo('signin')}>Sign in</a>
              </p>
            </section>
          )}

          {view === 'reset' && (
            <section className="page active">
              <h1>Reset password</h1>
              <p className="subtitle">Enter your email to receive a password reset link.</p>
              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label htmlFor="resetEmail">Email address</label>
                  <input
                    id="resetEmail"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                </div>
                <button className="main-btn" type="submit" disabled={submitting}>
                  {submitting ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
              <div className="divider">or</div>
              <button className="ghost-btn" type="button" onClick={() => goTo('signin')}>
                Back to Sign In
              </button>
              <p className="switch-text">
                No account yet? <a onClick={() => goTo('signup')}>Create an account</a>
              </p>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  minLength?: number;
}) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <input
        id={id}
        className="password-input"
        type={shown ? 'text' : 'password'}
        placeholder="••••••••"
        autoComplete={autoComplete}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
      <button
        className="eye-btn"
        type="button"
        aria-label={shown ? 'Hide password' : 'Show password'}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? (
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <path d="M3 3l18 18"></path>
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path>
            <path d="M9.9 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3.1 4.2"></path>
            <path d="M6.4 6.7C3.6 8.6 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.1-.8"></path>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        )}
      </button>
    </>
  );
}