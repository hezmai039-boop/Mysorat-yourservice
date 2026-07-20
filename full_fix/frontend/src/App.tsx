import { Link, Route, Routes, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Navbar } from "./components/Navbar";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Chat from "./pages/Chat";
import OperationDetail from "./pages/OperationDetail";
import OwnerDashboard from "./pages/admin/OwnerDashboard";
import Settings from "./pages/Settings";
import Support from "./pages/Support";
import TrustSecurity from "./pages/TrustSecurity";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import NotFound from "./pages/NotFound";

export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const isLanding = location.pathname === "/";

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/trust" element={<TrustSecurity />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute roles={["INDIVIDUAL", "BUSINESS"]}>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/operations/:id"
            element={
              <ProtectedRoute>
                <OperationDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={["OWNER", "EXPERT"]}>
                <OwnerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/support"
            element={
              <ProtectedRoute>
                <Support />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!isLanding && (
        <footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-sm text-slate-500">
          <p>{t("app.footerRights", { year: new Date().getFullYear() })}</p>
          <div className="mt-1 flex items-center justify-center gap-3">
            <Link to="/trust" className="hover:text-brand hover:underline">{t("app.footerTrust")}</Link>
            <span aria-hidden="true">·</span>
            <Link to="/privacy" className="hover:text-brand hover:underline">{t("app.footerPrivacy")}</Link>
            <span aria-hidden="true">·</span>
            <Link to="/terms" className="hover:text-brand hover:underline">{t("app.footerTerms")}</Link>
          </div>
        </footer>
      )}
    </div>
  );
}
