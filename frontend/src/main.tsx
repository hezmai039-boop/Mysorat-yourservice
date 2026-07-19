import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    // Light performance tracing, not the point of adding Sentry here - errors
    // are. Kept low to stay comfortably inside the free plan's event quota.
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
  });
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function ErrorFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center" dir="rtl">
      <p className="text-2xl font-bold">حدث خطأ غير متوقع</p>
      <p className="text-slate-500">نعتذر عن هذا الخلل، فريقنا تم إبلاغه تلقائياً بالتفاصيل.</p>
      <button className="btn-primary" onClick={() => window.location.reload()}>
        إعادة تحميل الصفحة
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // eslint-disable-next-line no-console
      console.error("فشل تسجيل service worker", err);
      Sentry.captureException(err);
    });
  });
}
