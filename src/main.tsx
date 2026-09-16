import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register PWA Service Worker for mobile installability and purge stale caches
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  // Only register Service Worker if we are NOT inside an iframe (like AI Studio preview window)
  // Cross-origin iframes block SW registration and script fetching in many modern browsers.
  if (window === window.parent) {
    window.addEventListener('load', () => {
      // Clear any obsolete v1 caches
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            if (key.includes('v1') || key.includes('v2')) {
              caches.delete(key);
            }
          });
        });
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
    console.log('Running in iframe: skipping Service Worker registration to avoid cross-origin fetch errors.');
  }
}


