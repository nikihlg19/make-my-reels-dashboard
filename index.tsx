import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import * as Sentry from "@sentry/react";
import AppErrorBoundary from './src/components/ErrorBoundary';
import App from './App.tsx';
import './src/index.css';

import { ClerkProvider } from '@clerk/react';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,       // 5 min before refetch
      retry: 2,                        // retry failed queries twice
      refetchOnWindowFocus: false,     // don't refetch on tab switch
    },
  },
});

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
            <App />
            <Toaster position="top-right" richColors closeButton />
          </ClerkProvider>
        </QueryClientProvider>
      </AppErrorBoundary>
    </React.StrictMode>
  );
} else {
  console.error("Failed to find the root element");
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);

      // Check for updates periodically (every 60s)
      setInterval(() => registration.update(), 60_000);

      // When a new SW is waiting, prompt the user to refresh
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available — show toast via sonner (imported by App)
            // Use a simple confirm since sonner isn't available outside React
            if (confirm('A new version is available. Reload to update?')) {
              window.location.reload();
            }
          }
        });
      });
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}
