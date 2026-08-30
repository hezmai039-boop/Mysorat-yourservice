import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useAuthStore } from "../store/auth";

// هيكل التطبيق بنمط inDrive: قائمة جانبية ثابتة (يمين في RTL) بدل الشريط العلوي.
// عناصرها ثابتة الترتيب: الرئيسية، طلباتي، مقدم خدمة، حسابي، الإدارة (للمالك).

interface NavItem {
  to: string;
  label: string;
  icon: string; // مسار SVG واحد بسيط
}

const ICONS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  briefcase: "M4 7h16v13H4zM9 7V4h6v3M4 13h16",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-3.5 3.5-6 8-6s8 2.5 8 6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
} as const;

function NavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const items: NavItem[] = [
    { to: "/", label: t("shell.home"), icon: ICONS.home },
    ...(user ? [{ to: "/dashboard", label: t("shell.myRequests"), icon: ICONS.list }] : []),
    { to: "/provider", label: t("shell.provider"), icon: ICONS.briefcase },
    ...(user ? [{ to: "/settings", label: t("shell.account"), icon: ICONS.user }] : []),
    ...(user?.role === "OWNER" || user?.role === "EXPERT"
      ? [{ to: user.role === "OWNER" ? "/admin" : "/market", label: user.role === "OWNER" ? t("shell.admin") : t("shell.market"), icon: ICONS.shield }]
      : []),
  ];

  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  const nav = (onClick?: () => void) => (
    <nav className="flex flex-col gap-1.5" aria-label={t("shell.mainNav")}>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onClick}
          className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
            isActive(item.to)
              ? "bg-brand/15 text-brand"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
          }`}
        >
          <NavIcon d={item.icon} />
          {item.label}
        </Link>
      ))}
      {!user && (
        <Link to="/login" onClick={onClick} className="btn-primary mt-2 !py-2.5 text-sm">
          {t("shell.login")}
        </Link>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex lg:flex-row-reverse">
      {/* الشريط الجانبي - سطح المكتب */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col gap-8 border-s border-slate-200 dark:border-white/10 px-4 py-8 sticky top-0 h-screen">
        <Link to="/" className="px-4 text-2xl font-extrabold tracking-tight text-brand">
          {t("brand")}
        </Link>
        {nav()}
      </aside>

      {/* الشريط العلوي - الجوال */}
      <header className="lg:hidden flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-4 py-3">
        <Link to="/" className="text-xl font-extrabold text-brand">{t("brand")}</Link>
        <button
          className="btn-secondary !px-3 !py-2 text-sm"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
        >
          {t("shell.menu")}
        </button>
      </header>
      {menuOpen && (
        <div className="lg:hidden border-b border-slate-200 dark:border-white/10 px-4 py-3">
          {nav(() => setMenuOpen(false))}
        </div>
      )}

      <div className="min-w-0 flex-1 flex flex-col">{children}</div>
    </div>
  );
}
