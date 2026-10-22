import React from 'react';

/** Last-resort guard for uncaught render errors. Never expose error details or tokens to customers. */
export default class AppCrashBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    console.error('Elite application render failure', error, info);
  }

  render() {
    if (this.state.crashed) {
      return (
        <main style={{ minHeight: '100vh', background: '#0f172a', color: 'white', padding: '12vh 24px', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
          <h1 style={{ fontSize: 26, marginBottom: 12 }}>Elite could not load this screen</h1>
          <p style={{ color: '#cbd5e1', maxWidth: 480, margin: '0 auto 24px' }}>An unexpected application error occurred. Your data has not been changed by this error screen.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ background: '#dc2626', color: 'white', border: 0, padding: '12px 24px', borderRadius: 8, cursor: 'pointer' }}>Reload Elite</button>
        </main>
      );
    }
    return this.props.children;
  }
}
