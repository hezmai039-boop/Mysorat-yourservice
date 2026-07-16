import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useDarkMode } from "../hooks/useDarkMode";

export function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-xl font-extrabold text-brand">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-l from-brand-light to-brand text-white">م</span>
          ميسوور
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <button
            onClick={toggle}
            aria-label="تبديل الوضع الليلي"
            className="btn-secondary !px-3 !py-2"
          >
            {isDark ? "☀️" : "🌙"}
          </button>
          {user ? (
            <>
              <Link to="/dashboard" className="btn-secondary !px-4 !py-2">لوحتي</Link>
              {(user.role === "INDIVIDUAL" || user.role === "BUSINESS") && (
                <Link to="/chat" className="btn-secondary !px-4 !py-2">المساعد الذكي</Link>
              )}
              {(user.role === "OWNER" || user.role === "EXPERT") && (
                <Link to="/admin" className="btn-secondary !px-4 !py-2">
                  {user.role === "OWNER" ? "الإدارة" : "عملائي"}
                </Link>
              )}
              <Link to="/settings" className="btn-secondary !px-3 !py-2" aria-label="الإعدادات">⚙️</Link>
              <button
                onClick={() => {
                  logout();
                  navigate("/");
                }}
                className="btn-primary !px-4 !py-2"
              >
                خروج
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-secondary !px-4 !py-2">تسجيل الدخول</Link>
              <Link to="/register" className="btn-primary !px-4 !py-2">ابدأ الآن</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
