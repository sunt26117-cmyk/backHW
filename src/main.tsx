import React, { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<GlobalErrorBoundaryProps, GlobalErrorBoundaryState> {
  constructor(props: GlobalErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Fatal application mount error:', error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#020617',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          textAlign: 'center'
        }}>
          <div style={{
            maxWidth: '560px',
            width: '100%',
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>🛡️</div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#38bdf8', marginBottom: '8px' }}>
              ECU Copilot 启动安全保护
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.6', marginBottom: '20px' }}>
              应用初始化或本地缓存解析时遇到异常，已自动阻止白屏：
            </p>
            <div style={{
              backgroundColor: '#020617',
              border: '1px solid #ef444440',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '12px',
              color: '#f87171',
              fontFamily: 'monospace',
              textAlign: 'left',
              wordBreak: 'break-all',
              marginBottom: '20px',
              maxHeight: '160px',
              overflowY: 'auto'
            }}>
              {this.state.error?.message || String(this.state.error)}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                重试加载
              </button>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#334155',
                  color: '#f1f5f9',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                清理缓存并重新启动
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
);

// Register PWA Service Worker for mobile installability and purge stale caches
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  // Only register Service Worker if we are NOT inside an iframe (like AI Studio preview window)
  // Accessing window.parent or registering SW inside sandboxed/cross-origin iframes can throw a DOMException SecurityError.
  let isInsideIframe = false;
  try {
    isInsideIframe = window.self !== window.top;
  } catch (e) {
    isInsideIframe = true;
  }

  if (!isInsideIframe) {
    window.addEventListener('load', () => {
      // Clear any obsolete v1 caches
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            if (key.includes('v1') || key.includes('v2')) {
              caches.delete(key);
            }
          });
        }).catch(() => {});
      }

      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.update();
        })
        .catch((err) => {
          console.log('SW registration error:', err);
        });
    });
  } else {
    // If running in an iframe, proactively unregister any previously registered Service Worker
    // to ensure Vite HMR and dynamic asset loading are never intercepted or blocked.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
      }
    }).catch(() => {});
    console.log('Running in iframe: skipping Service Worker registration and cleaning existing workers.');
  }
}


